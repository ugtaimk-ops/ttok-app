import type { Request } from "express";
import jwt from "jsonwebtoken";
import { deleteRevenueCatCustomer } from "./revenueCatService";

export const FREE_MONTHLY_LIMIT = 30;
export const PREMIUM_MONTHLY_LIMIT = 100;
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
// firebase-admin problem returns a temporary AI error instead of silently
// allowing unlimited requests or crash-looping the whole backend.
let adminApp: any = null;

function getAdminApp(): any | null {
  if (adminApp) return adminApp;

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    console.warn("[UsageService] FIREBASE_SERVICE_ACCOUNT_KEY is not set - AI requests will be unavailable.");
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
    console.error("[UsageService] Failed to load/initialize firebase-admin - AI requests will be unavailable:", err);
    return null;
  }
}

export function currentMonthKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Could not determine Korean billing month");
  return `${year}-${month}`;
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
let certFetch: Promise<Record<string, string>> | null = null;
let lastUnknownKidRefresh = 0;

async function getGoogleCerts(forceRefresh = false): Promise<Record<string, string>> {
  if (!forceRefresh && cachedCerts && Date.now() < certsExpireAt) return cachedCerts;
  // One in-flight fetch is shared when many clients see a rotated key at once.
  if (!certFetch) {
    certFetch = (async () => {
      const res = await fetch(GOOGLE_CERTS_URL, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(`Failed to fetch Google certs: ${res.status}`);
      const certs = await res.json() as Record<string, string>;
      const maxAgeMatch = (res.headers.get("cache-control") || "").match(/max-age=(\d+)/);
      const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 60 * 60 * 1000;
      cachedCerts = certs;
      certsExpireAt = Date.now() + maxAgeMs;
      return certs;
    })().finally(() => { certFetch = null; });
  }
  return certFetch;
}

/**
 * Verifies the Firebase ID token on the Authorization: Bearer <token> header
 * and returns the caller's uid, or null if missing/invalid.
 */
export async function verifyRequestIdentity(req: Request): Promise<{ uid: string; authTime: number } | null> {
  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  const token = match[1];

  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    const kid = decodedHeader?.header?.kid;
    if (typeof kid !== "string" || !kid || kid.length > 256) throw new Error("Token header is missing kid");

    let certs = await getGoogleCerts();
    if (!certs[kid] && Date.now() - lastUnknownKidRefresh > 30_000) {
      lastUnknownKidRefresh = Date.now();
      certs = await getGoogleCerts(true);
    }
    const cert = certs[kid];
    if (!cert) throw new Error("No matching Google cert for this token's kid");

    const payload = jwt.verify(token, cert, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    }) as jwt.JwtPayload;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= now ||
        typeof payload.iat !== "number" || payload.iat > now ||
        typeof payload.auth_time !== "number" || payload.auth_time > now ||
        typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) {
      throw new Error("Token has invalid Firebase claims");
    }
    const provider = payload.firebase?.sign_in_provider;
    if (!["password", "google.com", "apple.com"].includes(provider)) {
      throw new Error("Unsupported sign-in provider");
    }
    if (provider === "password" && payload.email_verified !== true) {
      throw new Error("Email address is not verified");
    }
    return { uid: payload.sub, authTime: payload.auth_time };
  } catch (err) {
    console.warn("[UsageService] ID token verification failed:", (err as Error).message);
    return null;
  }
}

export async function verifyRequestUser(req: Request): Promise<string | null> {
  return (await verifyRequestIdentity(req))?.uid || null;
}

export async function isAccountDeleted(uid: string): Promise<boolean> {
  const app = getAdminApp();
  if (!app) throw new Error("Account database unavailable");
  const { getFirestore } = require("firebase-admin/firestore");
  return (await getFirestore(app, FIRESTORE_DATABASE_ID).collection("deletedAccounts").doc(uid).get()).exists;
}

/** Delete all app data and the Firebase Auth account after recent sign-in. */
export async function deleteAccountData(uid: string): Promise<void> {
  const app = getAdminApp();
  if (!app) throw new Error("Account database unavailable");
  const { getFirestore } = require("firebase-admin/firestore");
  const { getAuth } = require("firebase-admin/auth");
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  // Refuse to report success while a linked RevenueCat customer remains.
  // RevenueCat deletion is asynchronous, but the API acknowledges the request.
  await deleteRevenueCatCustomer(uid);
  // A short-lived tombstone stops still-valid ID tokens from rebuilding the
  // profile or spending AI credits during the rest of their lifetime.
  await db.collection("deletedAccounts").doc(uid).set({ expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  await db.recursiveDelete(db.collection("problemSolutions").doc(uid));
  await db.recursiveDelete(db.collection("users").doc(uid));
  try { await getAuth(app).deleteUser(uid); }
  catch (error: any) { if (error?.code !== "auth/user-not-found") throw error; }
}

/** Physically remove expired cache records and short-lived deletion markers. */
export async function pruneExpiredServerData(): Promise<void> {
  const app = getAdminApp();
  if (!app) return;
  const { getFirestore } = require("firebase-admin/firestore");
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  const now = Date.now();
  for (const [query, field, deadline] of [
    [db.collection("deletedAccounts"), "expiresAt", now],
    [db.collectionGroup("aiResultCache"), "expiresAt", now],
    [db.collectionGroup("items"), "createdAt", now - 30 * 24 * 60 * 60 * 1000],
  ] as const) {
    let cursor: any = null;
    for (let batch = 0; batch < 10; batch++) {
      let page = query.where(field, "<=", deadline).orderBy(field).limit(100);
      if (cursor) page = page.startAfter(cursor);
      const expired = await page.get();
      if (expired.empty) break;
      const deletable = expired.docs.filter((doc: any) =>
        field !== "createdAt" || doc.ref.path.startsWith("problemSolutions/"));
      await Promise.all(deletable.map((doc: any) => doc.ref.delete()));
      cursor = expired.docs[expired.docs.length - 1];
      if (expired.size < 100) break;
    }
  }
}

export interface UsageCheckResult {
  allowed: boolean;
  isPremium: boolean;
  limit: number;
  used: number;
  month: string;
}

/**
 * Atomically checks whether this user is still under their monthly AI usage
 * limit and, if so, increments their counter for the current month. Resets
 * the counter automatically when the stored month doesn't match the current
 * one. Database failures must fail closed, otherwise the monthly limit could
 * be bypassed during an outage.
 */
async function getUsage(uid: string, consume: boolean, premiumOnly = false): Promise<UsageCheckResult> {
  const app = getAdminApp();
  if (!app) {
    throw new Error("Usage database unavailable");
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFirestore } = require("firebase-admin/firestore");
    const db = getFirestore(app, FIRESTORE_DATABASE_ID);
    const userRef = db.collection("users").doc(uid);
    const month = currentMonthKey();

    const result = await db.runTransaction(async (tx: any) => {
      const tombstone = await tx.get(db.collection("deletedAccounts").doc(uid));
      if (tombstone.exists) throw new Error("Account deleted");
      const snap = await tx.get(userRef);
      const data = snap.exists ? snap.data() || {} : {};

      const isPremium = data.isPremium === true;
      const limit = isPremium ? PREMIUM_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;

      const storedMonth = data.aiUsageMonth;
      const storedCount = Number.isFinite(data.aiUsageCount)
        ? Math.max(0, Math.floor(data.aiUsageCount)) : 0;
      const currentCount = storedMonth === month ? storedCount : 0;

      if (!consume || currentCount >= limit || (premiumOnly && !isPremium)) {
        if (storedMonth !== month) {
          tx.set(userRef, { aiUsageMonth: month, aiUsageCount: 0 }, { merge: true });
        }
        return { allowed: currentCount < limit && (!premiumOnly || isPremium), isPremium, limit, used: currentCount, month };
      }
      tx.set(userRef, { aiUsageMonth: month, aiUsageCount: currentCount + 1 }, { merge: true });
      return { allowed: true, isPremium, limit, used: currentCount + 1, month };
    });
    console.log(`[UsageService] uid=${uid} ${consume ? "usage now" : "status"} ${result.used}/${result.limit} month=${result.month} (premium=${result.isPremium}, allowed=${result.allowed})`);
    return result;
  } catch (err) {
    console.error(`[UsageService] Usage check failed for uid=${uid}:`, err);
    throw err;
  }
}

export const checkAndConsumeUsage = (uid: string, premiumOnly = false) => getUsage(uid, true, premiumOnly);
export const getCurrentUsage = (uid: string) => getUsage(uid, false);

/** Give back a reserved request only if it failed in the same billing month. */
export async function refundUsage(uid: string, month: string): Promise<void> {
  const app = getAdminApp();
  if (!app) throw new Error("Usage database unavailable");
  const { getFirestore } = require("firebase-admin/firestore");
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  const ref = db.collection("users").doc(uid);
  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    if (data.aiUsageMonth === month && Number.isFinite(data.aiUsageCount) && data.aiUsageCount > 0) {
      tx.update(ref, { aiUsageCount: data.aiUsageCount - 1 });
    }
  });
}

type GeminiTokenUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
};

// These are planning estimates for paid standard Gemini 2.5 requests, not an
// invoice. Unknown models still get token counts but no dollar estimate.
const GEMINI_USD_PER_MILLION: Record<string, { input: number; audio: number; cached: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.30, audio: 1.00, cached: 0.03, output: 2.50 },
  "gemini-2.5-flash-lite": { input: 0.10, audio: 0.30, cached: 0.01, output: 0.40 },
};

export async function recordAiTokenUsage(uid: string, feature: string, model: string, usage: GeminiTokenUsage): Promise<void> {
  const app = getAdminApp();
  if (!app) return;
  const { getFirestore, FieldValue } = require("firebase-admin/firestore");
  const prompt = Math.max(0, usage.promptTokenCount || 0);
  const output = Math.max(0, (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0));
  const cached = Math.min(prompt, Math.max(0, usage.cachedContentTokenCount || 0));
  const audio = Math.min(prompt - cached, usage.promptTokensDetails?.filter(part => part.modality === "AUDIO")
    .reduce((sum, part) => sum + (part.tokenCount || 0), 0) || 0);
  const price = GEMINI_USD_PER_MILLION[model];
  const estimatedUsd = price
    ? ((prompt - cached - audio) * price.input + audio * price.audio + cached * price.cached + output * price.output) / 1_000_000
    : null;
  const doc = getFirestore(app, FIRESTORE_DATABASE_ID).collection("users").doc(uid)
    .collection("aiCostMonths").doc(currentMonthKey());
  const fields: Record<string, unknown> = {
    requests: FieldValue.increment(1),
    promptTokens: FieldValue.increment(prompt),
    outputTokens: FieldValue.increment(output),
    [`${feature}Requests`]: FieldValue.increment(1),
    [`${feature}PromptTokens`]: FieldValue.increment(prompt),
    [`${feature}OutputTokens`]: FieldValue.increment(output),
    [`model_${model.replace(/[^A-Za-z0-9]/g, "_")}`]: FieldValue.increment(1),
  };
  if (estimatedUsd !== null) {
    fields.estimatedUsd = FieldValue.increment(estimatedUsd);
    fields[`${feature}EstimatedUsd`] = FieldValue.increment(estimatedUsd);
  }
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  await db.runTransaction(async (tx: any) => {
    const deleted = await tx.get(db.collection("deletedAccounts").doc(uid));
    if (!deleted.exists) tx.set(doc, fields, { merge: true });
  });
}

export async function getCachedAiResult(uid: string, hash: string): Promise<unknown | null> {
  const app = getAdminApp();
  if (!app) return null;
  const { getFirestore } = require("firebase-admin/firestore");
  const snap = await getFirestore(app, FIRESTORE_DATABASE_ID).collection("users").doc(uid)
    .collection("aiResultCache").doc(hash).get();
  const data = snap.data();
  return data && data.expiresAt > Date.now() ? data.result : null;
}

export async function saveCachedAiResult(uid: string, hash: string, result: unknown): Promise<void> {
  const app = getAdminApp();
  if (!app) return;
  const { getFirestore } = require("firebase-admin/firestore");
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  const target = db.collection("users").doc(uid).collection("aiResultCache").doc(hash);
  await db.runTransaction(async (tx: any) => {
    const deleted = await tx.get(db.collection("deletedAccounts").doc(uid));
    if (!deleted.exists) tx.set(target, { result, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  });
}

export async function getCachedProblem(uid: string, hash: string): Promise<any | null> {
  const app = getAdminApp();
  if (!app) return null;
  const { getFirestore } = require("firebase-admin/firestore");
  const snap = await getFirestore(app, FIRESTORE_DATABASE_ID)
    .collection("problemSolutions").doc(uid).collection("items").doc(hash).get();
  const data = snap.data();
  return data && data.createdAt > Date.now() - 30 * 24 * 60 * 60 * 1000 ? data.solution : null;
}

export async function saveProblemResult(uid: string, hash: string, solution: unknown): Promise<void> {
  const app = getAdminApp();
  if (!app) throw new Error("Usage database unavailable");
  const { getFirestore, FieldValue } = require("firebase-admin/firestore");
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  await db.runTransaction(async (tx: any) => {
    const deleted = await tx.get(db.collection("deletedAccounts").doc(uid));
    if (deleted.exists) return;
    tx.set(db.collection("problemSolutions").doc(uid).collection("items").doc(hash), { solution, createdAt: Date.now() });
    tx.set(db.collection("users").doc(uid), { aiProblemSolveCalls: FieldValue.increment(1) }, { merge: true });
  });
}
