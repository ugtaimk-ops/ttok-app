import { createHash } from "node:crypto";
import {
  emptyState, reserve, commit, refund, summarize, syncSubscriptions,
  type QuotaState, type IncomingSubscription, type Summary,
} from "./entitlements";
import { getAdminFirestore, currentMonthKey } from "./usageService";

// This code path remains off until products, rules, and billing are verified.
export const quotaV6Enabled = () => process.env.MONETIZATION_V6_ENABLED === "true";
const stateRef = (uid: string) => getAdminFirestore().collection("users").doc(uid).collection("monetization").doc("v6");
const requestIdPattern = /^[A-Za-z0-9_-]{16,128}$/;

function readState(value: unknown): QuotaState {
  if (!value || typeof value !== "object") return emptyState();
  const data = value as Partial<QuotaState>;
  return {
    entitlements: Array.isArray(data.entitlements) ? data.entitlements : [],
    free: data.free && typeof data.free.dayKey === "string" ? data.free : { dayKey: "", used: 0 },
    credits: Array.isArray(data.credits) ? data.credits : [],
    rewardDaily: data.rewardDaily && typeof data.rewardDaily.dayKey === "string" ? data.rewardDaily : { dayKey: "", granted: 0 },
    rewardTransactions: data.rewardTransactions && typeof data.rewardTransactions === "object" ? data.rewardTransactions : {},
    reservations: data.reservations && typeof data.reservations === "object" ? data.reservations : {},
  };
}

function compact(state: QuotaState, now: number): QuotaState {
  // A Firestore document is bounded; old request markers cannot grow forever.
  const cutoff = now - 48 * 60 * 60 * 1000;
  state.reservations = Object.fromEntries(Object.entries(state.reservations).filter(([, r]) =>
    r.state === "reserved" || r.at >= cutoff));
  state.credits = state.credits.filter((c) => c.expiresAt > now &&
    (!c.used || Object.values(state.reservations).some((r) => r.source === "reward" && r.refId === c.id)));
  state.rewardTransactions = Object.fromEntries(Object.entries(state.rewardTransactions).filter(([, at]) =>
    at >= now - 30 * 24 * 60 * 60 * 1000));
  return state;
}

async function ensureQuotaSynced(uid: string, force = false): Promise<void> {
  const snapshot = await stateRef(uid).get();
  const now = Date.now();
  const state = snapshot.data();
  const periodEnded = Array.isArray(state?.entitlements) && state.entitlements.some((e: any) =>
    e.state === "active" && e.periodEnd <= now);
  if (!force && snapshot.exists && !periodEnded && now - Number(state?.lastVerifiedAt || 0) < 5 * 60_000) return;
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secret) throw new Error("Subscription verification unavailable");
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Subscription verification failed: ${response.status}`);
  const data = await response.json();
  await syncVerifiedSubscriptions(uid, data?.subscriber || {});
}

export async function getQuotaStatus(uid: string, force = false): Promise<Summary> {
  await ensureQuotaSynced(uid, force);
  const snap = await stateRef(uid).get();
  return summarize(readState(snap.data()), Date.now());
}

export type QuotaReservation = { allowed: true; requestId: string; duplicate: boolean; summary: Summary } |
  { allowed: false; summary: Summary };

export async function reserveQuota(uid: string, requestId: string, allowReward = false): Promise<QuotaReservation> {
  if (!requestIdPattern.test(requestId)) throw new Error("Invalid AI request id");
  await ensureQuotaSynced(uid);
  const db = getAdminFirestore();
  const ref = stateRef(uid);
  const now = Date.now();
  return db.runTransaction(async (tx: any) => {
    const deleted = await tx.get(db.collection("deletedAccounts").doc(uid));
    if (deleted.exists) throw new Error("Account deleted");
    const snap = await tx.get(ref);
    const state = readState(snap.data());
    const result = reserve(state, requestId, now, allowReward);
    if (!result.ok) return { allowed: false, summary: summarize(state, now) };
    if (!result.duplicate) tx.set(ref, { ...compact(result.state, now), schemaVersion: 6, updatedAt: now,
      lastVerifiedAt: snap.data()?.lastVerifiedAt || now });
    return { allowed: true, requestId, duplicate: result.duplicate, summary: summarize(result.state, now) };
  });
}

export async function finishQuota(uid: string, requestId: string, succeeded: boolean): Promise<void> {
  if (!requestIdPattern.test(requestId)) return;
  const db = getAdminFirestore();
  const ref = stateRef(uid);
  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const state = readState(snap.data());
    const next = succeeded ? commit(state, requestId) : refund(state, requestId, Date.now());
    if (next !== state) tx.set(ref, { ...compact(next, Date.now()), schemaVersion: 6, updatedAt: Date.now(),
      lastVerifiedAt: snap.data()?.lastVerifiedAt || Date.now() });
  });
}

const PRODUCT_PLAN: Record<string, "basic" | "pro" | "plus"> = {
  ttok_ai_basic_monthly: "basic",
  ttok_pro_v2_monthly: "pro",
  ttok_ai_plus_monthly: "plus",
  ttok_pro_monthly: "pro",
  ttok_pro_yearly: "pro",
};
const LEGACY_PRODUCTS = new Set(["ttok_pro_monthly", "ttok_pro_yearly"]);

function legacyMonthPeriod(now: number): { start: number; end: number } {
  const shifted = new Date(now + 9 * 3600_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  return { start: Date.UTC(year, month, 1) - 9 * 3600_000,
    end: Date.UTC(year, month + 1, 1) - 9 * 3600_000 };
}

/** RevenueCat secret-key response only. Unknown products grant no access. */
export function verifiedSubscriptions(subscriber: any, now = Date.now()): IncomingSubscription[] {
  const rows: IncomingSubscription[] = [];
  for (const [key, data] of Object.entries(subscriber?.subscriptions || {})) {
    const productId = key.split(":")[0];
    const planId = PRODUCT_PLAN[productId];
    if (!planId || !data || typeof data !== "object") continue;
    const sub = data as Record<string, unknown>;
    if (sub.refunded_at || sub.store !== "play_store") continue;
    const periodStart = Date.parse(String(sub.purchase_date || ""));
    const periodEnd = Date.parse(String(sub.expires_date || ""));
    if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd) || periodStart > now || periodEnd <= now) continue;
    // Old Pro has always received 100 uses per KST calendar month, including
    // yearly subscribers. Never turn that into 100 uses per whole year.
    if (LEGACY_PRODUCTS.has(productId)) {
      const month = legacyMonthPeriod(now);
      rows.push({ planId, productId, periodStart: month.start, periodEnd: Math.min(month.end, periodEnd) });
    } else rows.push({ planId, productId, periodStart, periodEnd });
  }
  // RevenueCat can list an old and a replacement product at the same time.
  // A customer who still owns the old Pro must retain the 100-use benefit;
  // never let iteration order silently replace it with the new 50-use plan.
  if (rows.some((row) => row.planId === "pro" && LEGACY_PRODUCTS.has(row.productId))) {
    for (let index = rows.length - 1; index >= 0; index--) {
      if (rows[index].planId === "pro" && !LEGACY_PRODUCTS.has(rows[index].productId)) rows.splice(index, 1);
    }
  }
  if (!rows.some((row) => row.planId === "pro")) {
    const legacy = subscriber?.entitlements?.["똑 Pro"];
    const linkedProduct = String(legacy?.product_identifier || "").split(":")[0];
    const expiry = legacy?.expires_date ? Date.parse(String(legacy.expires_date)) : Number.POSITIVE_INFINITY;
    // A misconfigured RevenueCat entitlement must never turn Basic/Plus into
    // the grandfathered Pro plan. The recognized product is authoritative.
    if (legacy && linkedProduct !== "ttok_ai_basic_monthly" && linkedProduct !== "ttok_ai_plus_monthly" && expiry > now) {
      const month = legacyMonthPeriod(now);
      rows.push({ planId: "pro", productId: "legacy_pro_entitlement", periodStart: month.start,
        periodEnd: Math.min(month.end, expiry) });
    }
  }
  return rows;
}

export async function syncVerifiedSubscriptions(uid: string, subscriber: any): Promise<void> {
  const now = Date.now();
  const incoming = verifiedSubscriptions(subscriber, now);
  const db = getAdminFirestore();
  const ref = stateRef(uid);
  await db.runTransaction(async (tx: any) => {
    if ((await tx.get(db.collection("deletedAccounts").doc(uid))).exists) return;
    const user = await tx.get(db.collection("users").doc(uid));
    if (!user.exists) return;
    const state = readState((await tx.get(ref)).data());
    const oldPro = incoming.some((s) => s.planId === "pro" &&
      (LEGACY_PRODUCTS.has(s.productId) || s.productId === "legacy_pro_entitlement"));
    const result = syncSubscriptions(state, incoming, now, { legacyPro: oldPro });
    // Grandfather the previous monthly usage on the first verified import.
    if (oldPro && !state.entitlements.some((e) => e.planId === "pro")) {
      const prior = user.data() || {};
      const pro = result.state.entitlements.find((e) => e.planId === "pro");
      if (pro && prior.aiUsageMonth === currentMonthKey(new Date(now)) &&
          typeof prior.aiUsageCount === "number" && prior.aiUsageCount > 0) {
        pro.quotaUsed = Math.min(pro.quotaTotal, Math.floor(prior.aiUsageCount));
      }
    }
    tx.set(ref, { ...compact(result.state, now), schemaVersion: 6, updatedAt: now, lastVerifiedAt: now });
  });
}

export function requestIdFromHeader(value: unknown): string | null {
  return typeof value === "string" && requestIdPattern.test(value) ? value : null;
}

export function fallbackRequestId(uid: string, path: string, body: unknown): string {
  // Used only for legacy clients that do not send X-AI-Request-ID.
  return createHash("sha256").update(uid).update(path).update(JSON.stringify(body)).update(String(Date.now())).digest("hex");
}
