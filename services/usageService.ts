import type { Request } from "express";

const FREE_MONTHLY_LIMIT = 50;
const PREMIUM_MONTHLY_LIMIT = 150;
const FIRESTORE_DATABASE_ID = "ai-studio-22fbd27c-5516-4028-bd17-a6d4ba99710b";

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

/**
 * Verifies the Firebase ID token on the Authorization: Bearer <token> header
 * and returns the caller's uid, or null if missing/invalid.
 */
export async function verifyRequestUser(req: Request): Promise<string | null> {
  const app = getAdminApp();
  if (!app) return null;

  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAuth } = require("firebase-admin/auth");
    const decoded = await getAuth(app).verifyIdToken(match[1]);
    return decoded.uid;
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
  if (!app || !uid) {
    return { allowed: true, isPremium: false, limit: FREE_MONTHLY_LIMIT, used: 0 };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFirestore } = require("firebase-admin/firestore");
    const db = getFirestore(app, FIRESTORE_DATABASE_ID);
    const userRef = db.collection("users").doc(uid);
    const month = currentMonthKey();

    return await db.runTransaction(async (tx: any) => {
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
  } catch (err) {
    console.error("[UsageService] Usage check failed, allowing request through unmetered:", err);
    return { allowed: true, isPremium: false, limit: FREE_MONTHLY_LIMIT, used: 0 };
  }
}
