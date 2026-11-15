import { createHash, randomBytes, verify } from "node:crypto";
import { getAdminFirestore } from "./usageService";
import { emptyState, grantAdReward, type QuotaState } from "./entitlements";

const KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
let cachedKeys: Map<string, string> | null = null;
let keysExpireAt = 0;
let keysInFlight: Promise<Map<string, string>> | null = null;

async function getKeys(): Promise<Map<string, string>> {
  if (cachedKeys && Date.now() < keysExpireAt) return cachedKeys;
  if (!keysInFlight) keysInFlight = (async () => {
    const response = await fetch(KEYS_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("AdMob verification keys unavailable");
    const data = await response.json() as { keys?: Array<{ keyId: number; pem: string }> };
    const keys = new Map((data.keys || []).filter((k) => Number.isInteger(k.keyId) && typeof k.pem === "string")
      .map((k) => [String(k.keyId), k.pem]));
    if (!keys.size) throw new Error("AdMob verification keys are empty");
    cachedKeys = keys;
    keysExpireAt = Date.now() + 12 * 60 * 60 * 1000;
    return keys;
  })().finally(() => { keysInFlight = null; });
  return keysInFlight;
}

export function verifyAdMobCallback(rawQuery: string, keys: Map<string, string>): URLSearchParams {
  if (rawQuery.length > 4096) throw new Error("Invalid callback length");
  const match = rawQuery.match(/^(.*)&signature=([A-Za-z0-9_-]+)&key_id=(\d+)$/);
  if (!match) throw new Error("Invalid callback format");
  const [, signedPart, encodedSignature, keyId] = match;
  const publicKey = keys.get(keyId);
  if (!publicKey) throw new Error("Unknown AdMob verification key");
  if (!verify("sha256", Buffer.from(signedPart, "utf8"), publicKey, Buffer.from(encodedSignature, "base64url"))) {
    throw new Error("Invalid AdMob signature");
  }
  return new URLSearchParams(signedPart);
}

export async function createAdRewardSession(uid: string): Promise<string> {
  const nonce = randomBytes(24).toString("base64url");
  const now = Date.now();
  await getAdminFirestore().collection("adRewardSessions").doc(nonce).create({ uid, createdAt: now,
    expiresAt: now + 10 * 60_000, consumed: false });
  return nonce;
}

export async function acceptAdMobCallback(rawQuery: string): Promise<"granted" | "duplicate" | "daily-cap"> {
  const expectedUnit = process.env.ADMOB_REWARDED_AD_UNIT_ID;
  if (!expectedUnit) throw new Error("AdMob reward unit is not configured");
  const params = verifyAdMobCallback(rawQuery, await getKeys());
  const txId = params.get("transaction_id") || "";
  const nonce = params.get("custom_data") || "";
  const timestamp = Number(params.get("timestamp"));
  const now = Date.now();
  if (!/^[a-fA-F0-9]{16,128}$/.test(txId) || !/^[A-Za-z0-9_-]{32}$/.test(nonce) ||
      params.get("ad_unit") !== expectedUnit || params.get("reward_item") !== "ai_credit" ||
      params.get("reward_amount") !== "1" || !Number.isFinite(timestamp) || Math.abs(now - timestamp) > 15 * 60_000) {
    throw new Error("Invalid AdMob reward claims");
  }
  const db = getAdminFirestore();
  const transactionRef = db.collection("adRewardTransactions").doc(createHash("sha256").update(txId).digest("hex"));
  const sessionRef = db.collection("adRewardSessions").doc(nonce);
  return db.runTransaction(async (tx: any) => {
    if ((await tx.get(transactionRef)).exists) return "duplicate";
    const session = await tx.get(sessionRef);
    const info = session.data();
    if (!session.exists || info?.consumed || info?.expiresAt <= now || typeof info?.uid !== "string") {
      throw new Error("AdMob session expired");
    }
    const uid = info.uid;
    if ((await tx.get(db.collection("deletedAccounts").doc(uid))).exists) throw new Error("Account deleted");
    const quotaRef = db.collection("users").doc(uid).collection("monetization").doc("v6");
    const quotaSnap = await tx.get(quotaRef);
    const state = quotaSnap.exists ? quotaSnap.data() as QuotaState : emptyState();
    const result = grantAdReward(state, txId, now);
    tx.create(transactionRef, { uid, createdAt: now, granted: result.granted });
    tx.update(sessionRef, { consumed: true, transactionId: txId });
    if (!result.granted) return "daily-cap";
    tx.set(quotaRef, { ...result.state, schemaVersion: 6, updatedAt: now,
      lastVerifiedAt: quotaSnap.data()?.lastVerifiedAt || now });
    return "granted";
  });
}
