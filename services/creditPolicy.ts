/**
 * v7 credit accounting primitives. This module has no network or database
 * access: the caller must persist each returned state in a server transaction.
 * It is intentionally not connected to live AI or billing routes yet.
 */

export type CreditPlan = "free" | "basic" | "pro" | "max" | "legacyPlus";
export const CREDIT_USD = 0.00001;
export const PLAN_CREDITS: Record<"free" | "basic" | "pro" | "max", number> = {
  free: 500, basic: 30_000, pro: 100_000, max: 300_000,
};

export type CreditGrant = {
  id: string;
  plan: CreditPlan;
  granted: number;
  remaining: number;
  startsAt: number;
  expiresAt: number;
};
export type CreditAllocation = { grantId: string; amount: number };
export type CreditHold = {
  requestId: string;
  allocations: CreditAllocation[];
  reserved: number;
  actual?: number;
  uncovered?: number;
  status: "reserved" | "settled" | "released";
  createdAt: number;
};
export type CreditState = { grants: CreditGrant[]; holds: Record<string, CreditHold> };
export const emptyCreditState = (): CreditState => ({ grants: [], holds: {} });

const clone = (state: CreditState): CreditState => structuredClone(state);
const validAmount = (value: number) => Number.isSafeInteger(value) && value >= 0;
const activeGrant = (grant: CreditGrant, now: number) => grant.startsAt <= now && now < grant.expiresAt;
const available = (state: CreditState, now: number) => state.grants
  .filter(grant => activeGrant(grant, now) && grant.remaining > 0)
  .sort((a, b) => a.expiresAt - b.expiresAt || a.id.localeCompare(b.id));

/** Server clock only. KST has no daylight-saving time. */
export function freeDayPeriod(now: number): { id: string; startsAt: number; expiresAt: number } {
  if (!Number.isFinite(now)) throw new Error("Invalid server time");
  const shifted = new Date(now + 9 * 3_600_000);
  const startsAt = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 9 * 3_600_000;
  return { id: `free:${new Date(startsAt + 9 * 3_600_000).toISOString().slice(0, 10)}`,
    startsAt, expiresAt: startsAt + 86_400_000 };
}

/** Idempotent daily free grant. Call only when the user has no paid entitlement. */
export function grantFreeDay(state: CreditState, now: number): CreditState {
  if (state.grants.some(grant => grant.plan !== "free" && activeGrant(grant, now))) return state;
  const period = freeDayPeriod(now);
  if (state.grants.some(grant => grant.id === period.id)) return state;
  const next = clone(state);
  next.grants.push({ id: period.id, plan: "free", granted: PLAN_CREDITS.free,
    remaining: PLAN_CREDITS.free, startsAt: period.startsAt, expiresAt: period.expiresAt });
  return next;
}

/** A verified store billing period gets exactly one grant; renewal gets a new ID. */
export function grantPaidPeriod(state: CreditState, input: {
  plan: "basic" | "pro" | "max";
  verifiedPeriodId: string;
  startsAt: number;
  expiresAt: number;
}): CreditState {
  if (!["basic", "pro", "max"].includes(input.plan as string) ||
      !/^[A-Za-z0-9:_-]{1,128}$/.test(input.verifiedPeriodId) ||
      !Number.isFinite(input.startsAt) || !Number.isFinite(input.expiresAt) ||
      input.expiresAt <= input.startsAt) throw new Error("Invalid verified billing period");
  const id = `${input.plan}:${input.verifiedPeriodId}`;
  if (state.grants.some(grant => grant.id === id)) return state;
  const next = clone(state);
  next.grants.push({ id, plan: input.plan, granted: PLAN_CREDITS[input.plan],
    remaining: PLAN_CREDITS[input.plan], startsAt: input.startsAt, expiresAt: input.expiresAt });
  return next;
}

export function creditBalance(state: CreditState, now: number): number {
  return available(state, now).reduce((sum, grant) => sum + grant.remaining, 0);
}

export type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
};
export type ModelRates = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  audioInputUsdPerMillion?: number;
};

/** Prices are supplied by server configuration, never silently defaulted. */
export function modelRatesFromJson(raw: string, model: string): ModelRates {
  let catalog: unknown;
  try { catalog = JSON.parse(raw); } catch { throw new Error("Invalid model pricing JSON"); }
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog) ||
      !Object.hasOwn(catalog, model)) throw new Error("Model pricing not configured");
  const rate = (catalog as Record<string, unknown>)[model];
  if (!rate || typeof rate !== "object" || Array.isArray(rate)) throw new Error("Invalid model pricing");
  const r = rate as Record<string, unknown>;
  for (const field of ["inputUsdPerMillion", "outputUsdPerMillion", "cachedInputUsdPerMillion"]) {
    if (typeof r[field] !== "number" || !Number.isFinite(r[field]) || r[field] < 0)
      throw new Error(`Missing model pricing field: ${field}`);
  }
  if (r.audioInputUsdPerMillion !== undefined &&
      (typeof r.audioInputUsdPerMillion !== "number" || !Number.isFinite(r.audioInputUsdPerMillion) || r.audioInputUsdPerMillion < 0))
    throw new Error("Invalid audio model pricing");
  return r as ModelRates;
}

/** Gemini prompt tokens include cached tokens; output price includes thoughts. */
export function priceGeminiUsage(usage: GeminiUsage, rates: ModelRates): {
  credits: number; estimatedUsd: number; inputTokens: number; outputTokens: number;
  thinkingTokens: number; cachedTokens: number;
} {
  const input = usage.promptTokenCount;
  const output = usage.candidatesTokenCount;
  const thinking = usage.thoughtsTokenCount ?? 0;
  const cached = usage.cachedContentTokenCount ?? 0;
  if (![input, output, thinking, cached].every(n => typeof n === "number" && validAmount(n)) ||
      input! < cached || !Number.isFinite(rates.inputUsdPerMillion) || rates.inputUsdPerMillion < 0 ||
      !Number.isFinite(rates.outputUsdPerMillion) || rates.outputUsdPerMillion < 0 ||
      !Number.isFinite(rates.cachedInputUsdPerMillion) || rates.cachedInputUsdPerMillion < 0) {
    throw new Error("Missing or invalid Gemini usage/pricing");
  }
  // Unknown input modalities must be priced explicitly before this engine is
  // activated. Charging them as text could undercharge a live account.
  if (usage.promptTokensDetails?.some(item =>
    item.modality && !["TEXT", "IMAGE", "AUDIO", "VIDEO"].includes(item.modality))) {
    throw new Error("Unsupported Gemini input modality");
  }
  const audio = (usage.promptTokensDetails || [])
    .filter(item => item.modality === "AUDIO")
    .reduce((sum, item) => sum + (item.tokenCount || 0), 0);
  if (!validAmount(audio) || audio > input! - cached ||
      (audio > 0 && (!Number.isFinite(rates.audioInputUsdPerMillion) || rates.audioInputUsdPerMillion! < 0))) {
    throw new Error("Missing or invalid audio pricing");
  }
  const estimatedUsd = ((input! - cached - audio) * rates.inputUsdPerMillion +
    audio * (rates.audioInputUsdPerMillion || 0) + cached * rates.cachedInputUsdPerMillion +
    (output! + thinking) * rates.outputUsdPerMillion) / 1_000_000;
  const credits = Math.max(1, Math.ceil(estimatedUsd / CREDIT_USD - 1e-9));
  if (!Number.isSafeInteger(credits)) throw new Error("Credit cost overflow");
  return { credits, estimatedUsd, inputTokens: input!, outputTokens: output!, thinkingTokens: thinking, cachedTokens: cached };
}

function allocate(state: CreditState, amount: number, now: number): CreditAllocation[] {
  let left = amount;
  const allocations: CreditAllocation[] = [];
  for (const grant of available(state, now)) {
    const take = Math.min(left, grant.remaining);
    if (!take) continue;
    grant.remaining -= take;
    allocations.push({ grantId: grant.id, amount: take });
    left -= take;
    if (!left) break;
  }
  return allocations;
}

/** Reserve a pessimistic maximum before calling Gemini, outside the DB transaction. */
export function reserveCredits(state: CreditState, requestId: string, amount: number, now: number):
  { ok: true; state: CreditState; duplicate: boolean } | { ok: false; reason: "INSUFFICIENT" } {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId) || !validAmount(amount) || amount < 1)
    throw new Error("Invalid credit reservation");
  if (state.holds[requestId]) return { ok: true, state, duplicate: true };
  if (creditBalance(state, now) < amount) return { ok: false, reason: "INSUFFICIENT" };
  const next = clone(state);
  const allocations = allocate(next, amount, now);
  next.holds[requestId] = { requestId, allocations, reserved: amount, status: "reserved", createdAt: now };
  return { ok: true, state: next, duplicate: false };
}

/** Failed API call: return still-valid reserved credits exactly once. */
export function releaseCredits(state: CreditState, requestId: string, now: number): CreditState {
  const hold = state.holds[requestId];
  if (!hold || hold.status !== "reserved") return state;
  const next = clone(state);
  for (const part of hold.allocations) {
    const grant = next.grants.find(item => item.id === part.grantId);
    if (grant && activeGrant(grant, now)) grant.remaining += part.amount;
  }
  next.holds[requestId].status = "released";
  return next;
}

/** Settle actual usage, return unused reserve. Unexpected overage is recorded. */
export function settleCredits(state: CreditState, requestId: string, actual: number, now: number): CreditState {
  if (!validAmount(actual) || actual < 1) throw new Error("Invalid actual credit cost");
  const hold = state.holds[requestId];
  if (!hold || hold.status !== "reserved") return state;
  const next = clone(state);
  const target = next.holds[requestId];
  target.actual = actual;
  if (actual < hold.reserved) {
    let giveBack = hold.reserved - actual;
    for (const part of [...target.allocations].reverse()) {
      const grant = next.grants.find(item => item.id === part.grantId);
      const restored = Math.min(giveBack, part.amount);
      if (grant && activeGrant(grant, now)) grant.remaining += restored;
      part.amount -= restored;
      giveBack -= restored;
      if (!giveBack) break;
    }
    target.allocations = target.allocations.filter(part => part.amount > 0);
  } else if (actual > hold.reserved) {
    const extra = actual - hold.reserved;
    const added = allocate(next, extra, now);
    target.allocations.push(...added);
    target.uncovered = extra - added.reduce((sum, part) => sum + part.amount, 0);
  }
  target.status = "settled";
  return next;
}
