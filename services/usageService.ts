import type { Request } from "express";
import jwt from "jsonwebtoken";

const FREE_MONTHLY_LIMIT = 50;
const PREMIUM_MONTHLY_LIMIT = 150;
const FIRESTORE_DATABASE_ID = "ai-studio-22fbd27c-5516-4028-bd17-a6d4ba99710b";
const FIREBASE_PROJECT_ID = "gen-lang-client-0685740024";
const GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

// firebase-admin (and its transitive deps like jwks-rsa/jose) is loaded lazily
// via require() inside try/catch, not as a top-level import. A top-level
// import gets eagerly require()'d the moment this bundle loads, and on this
// project's dependency tree that intermittently crashed the whole server at
// startup with ERR_REQUIRE_ESM (jwks-rsa requiring the ESM-only "jose"
// package from a CJS bundle) - taking down every API endpoint, not just
// usage tracking. Deferring the require and catching failures means a
// firebase-admin problem degrades to "usage limits not enforced" instead of
// crash-looping the whole backend.
let adminApp: any = null;
let adminLoadFailed = false;

function getAdminApp(): any | null {
  if (adminApp) return adminApp;
  if (adminLoadFailed) return null;

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    console.warn("[UsageService] FIREBASE_SERVICE_ACCOUNT_KEY is not set - AI usage limits will not be enforced.");
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getApps, initializeApp, cert } = require("firebase-admin/app");
    if (getApps().length > 0) {
      adminApp = getApps()[0];
      return adminApp;
    }
    const serviceAccount = JSON.parse(rawKey);
    adminApp = initializeApp({ credential: cert(serviceAccount) });
    return adminApp;
  } catch (err) {
    adminLoadFailed = true;
    console.error("[UsageService] Failed to load/initialize firebase-admin - AI usage limits will not be enforced:", err);
    return null;
  }
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Firebase ID tokens are verified by hand with a plain JWT library against
// Google's public certs, rather than via firebase-admin/auth's
// getAuth().verifyIdToken() - that call pulls in jwks-rsa, which on this
// project's dependency tree requires the ESM-only "jose" package and throws
// ERR_REQUIRE_ESM from a CJS bundle every single time, meaning every
// verification silently failed and usage was never actually tracked. This is
// the same manual-verification approach Firebase's own docs describe for
// environments where the Admin SDK's auth module isn't usable:
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
let cachedCerts: Record<string, string> | null = null;
let certsExpireAt = 0;

async function getGoogleCerts(): Promise<Record<string, string>> {
  if (cachedCerts && Date.now() < certsExpireAt) return cachedCerts;

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Google certs: ${res.status}`);
  cachedCerts = await res.json();

  // Respect the endpoint's own Cache-Control max-age when present, otherwise
  // fall back to a conservative 1 hour (certs actually rotate every few days).
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 60 * 60 * 1000;
  certsExpireAt = Date.now() + maxAgeMs;

  return cachedCerts!;
}

/**
 * Verifies the Firebase ID token on the Authorization: Bearer <token> header
 * and returns the caller's uid, or null if missing/invalid.
 */
export async function verifyRequestUser(req: Request): Promise<string | null> {
  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  const token = match[1];

  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    const kid = decodedHeader?.header?.kid;
    if (!kid) throw new Error("Token header is missing kid");

    const certs = await getGoogleCerts();
    const cert = certs[kid];
    if (!cert) throw new Error("No matching Google cert for this token's kid");

    const payload = jwt.verify(token, cert, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    }) as jwt.JwtPayload;

    if (!payload.sub) throw new Error("Token payload is missing sub");
    return payload.sub;
  } catch (err) {
    console.warn("[UsageService] ID token verification failed:", (err as Error).message);
    return null;
  }
}

export interface UsageCheckResult {
  allowed: boolean;
  isPremium: boolean;
  limit: number;
  used: number;
}

/**
 * Atomically checks whether this user is still under their monthly AI usage
 * limit and, if so, increments their counter for the current month. Resets
 * the counter automatically when the stored month doesn't match the current
 * one. If the Admin SDK isn't configured (FIREBASE_SERVICE_ACCOUNT_KEY
 * missing, or it failed to load) or the caller couldn't be identified, usage
 * isn't tracked and the request is allowed through - this keeps the AI
 * features working even before that credential has been set up, rather than
 * locking everyone out.
 */
export async function checkAndConsumeUsage(uid: string | null): Promise<UsageCheckResult> {
  const app = getAdminApp();
  if (!app) {
    console.warn("[UsageService] Skipping usage tracking: Admin SDK unavailable (see FIREBASE_SERVICE_ACCOUNT_KEY warning above).");
    return { allowed: true, isPremium: false, limit: FREE_MONTHLY_LIMIT, used: 0 };
  }
  if (!uid) {
    console.warn("[UsageService] Skipping usage tracking: caller has no valid uid (missing/invalid Authorization header, or ID token verification failed - see warning above if the latter).");
    return { allowed: true, isPremium: false, limit: FREE_MONTHLY_LIMIT, used: 0 };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFirestore } = require("firebase-admin/firestore");
    const db = getFirestore(app, FIRESTORE_DATABASE_ID);
    const userRef = db.collection("users").doc(uid);
    const month = currentMonthKey();

    const result = await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(userRef);
      const data = snap.exists ? snap.data() || {} : {};

      const isPremium = data.isPremium === true;
      const limit = isPremium ? PREMIUM_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;

      const storedMonth = data.aiUsageMonth;
      const storedCount = typeof data.aiUsageCount === "number" ? data.aiUsageCount : 0;
      const currentCount = storedMonth === month ? storedCount : 0;

      if (currentCount >= limit) {
        return { allowed: false, isPremium, limit, used: currentCount };
      }

      tx.set(
        userRef,
        { aiUsageMonth: month, aiUsageCount: currentCount + 1 },
        { merge: true }
      );

      return { allowed: true, isPremium, limit, used: currentCount + 1 };
    });
    console.log(`[UsageService] uid=${uid} usage now ${result.used}/${result.limit} (premium=${result.isPremium}, allowed=${result.allowed})`);
    return result;
  } catch (err) {
    console.error(`[UsageService] Usage check failed for uid=${uid}, allowing request through unmetered:`, err);
    return { allowed: true, isPremium: false, limit: FREE_MONTHLY_LIMIT, used: 0 };
  }
}
