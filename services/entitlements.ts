// AI 이용권 계산 엔진 (순수 함수, 외부 의존성 없음).
//
// Firestore/RevenueCat/Express와 분리되어 있어 단위 테스트가 쉽고, 서버의
// 트랜잭션 래퍼(aiQuotaStore)가 이 함수들을 그대로 호출한다.
//
// 정책 요약 (수익화 지시서 v6.0):
//  - 유료 구독이 하나라도 활성이면 무료 일일 1회는 적용하지 않는다(합산 금지).
//  - 유료 이용권은 구독별 결제 주기로 독립 관리하고, 만료가 빠른 것부터 차감한다.
//  - 광고 보상 이용권은 별도 잔액이며 유료/무료 횟수가 소진된 뒤에 사용한다.
//  - Basic과 Plus는 동시에 활성화될 수 없다.
//  - 기존 Pro 구독자는 월 100회를 유지한다(legacy).

export type PlanId = "basic" | "pro" | "plus";

export const PLAN_QUOTA: Record<PlanId, number> = { basic: 30, pro: 50, plus: 70 };
export const LEGACY_PRO_QUOTA = 100;
export const FREE_DAILY_LIMIT = 1;
export const AD_REWARD_DAILY_CAP = 5;
// 보상 이용권 유효기간은 정책 미확정 값이다. 설정으로 바꿀 수 있게 옵션으로 받는다.
export const DEFAULT_AD_REWARD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Entitlement {
  /** `${planId}` 단위로 하나만 유지한다. 구매 토큰 원문은 저장하지 않는다. */
  id: PlanId;
  planId: PlanId;
  productId: string;
  periodStart: number;
  periodEnd: number;
  quotaTotal: number;
  quotaUsed: number;
  /** 기존(100회) 조건을 유지하는 Pro */
  legacy?: boolean;
  state: "active" | "expired" | "superseded";
}

export interface RewardCredit {
  id: string;
  grantedAt: number;
  expiresAt: number;
  used: boolean;
}

export type Source = "paid" | "free" | "reward";

export interface Reservation {
  requestId: string;
  source: Source;
  /** paid: entitlement id, reward: credit id, free: dayKey */
  refId: string;
  /** paid 구독의 결제 주기 식별 (갱신 후 환불 방지) */
  periodStart?: number;
  state: "reserved" | "committed" | "refunded";
  at: number;
}

export interface QuotaState {
  entitlements: Entitlement[];
  free: { dayKey: string; used: number };
  credits: RewardCredit[];
  rewardDaily: { dayKey: string; granted: number };
  /** 처리한 광고 보상 transaction_id (중복 지급 방지) */
  rewardTransactions: Record<string, number>;
  reservations: Record<string, Reservation>;
}

export function emptyState(): QuotaState {
  return {
    entitlements: [],
    free: { dayKey: "", used: 0 },
    credits: [],
    rewardDaily: { dayKey: "", granted: 0 },
    rewardTransactions: {},
    reservations: {},
  };
}

/** KST(Asia/Seoul, UTC+9, 서머타임 없음) 기준 날짜 키. 서버 시간만 사용한다. */
export function kstDayKey(now: number): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isActive(e: Entitlement, now: number): boolean {
  return e.state === "active" && e.periodStart <= now && now < e.periodEnd;
}

export function activeEntitlements(state: QuotaState, now: number): Entitlement[] {
  return state.entitlements.filter((e) => isActive(e, now));
}

function remaining(e: Entitlement): number {
  return Math.max(0, e.quotaTotal - e.quotaUsed);
}

function rewardAvailable(c: RewardCredit, now: number): boolean {
  return !c.used && now < c.expiresAt;
}

export interface Summary {
  mode: "paid" | "free";
  adFree: boolean;
  plans: Array<{ planId: PlanId; total: number; remaining: number; periodEnd: number }>;
  paidRemaining: number;
  freeRemaining: number;
  rewardRemaining: number;
  /** 화면의 "총 N회 남음" (구독 + 광고 보상은 별도 표시하므로 구독/무료분만) */
  subscriptionRemaining: number;
  totalRemaining: number;
  adRewardsLeftToday: number;
}

export function summarize(state: QuotaState, now: number): Summary {
  const active = activeEntitlements(state, now);
  const mode = active.length > 0 ? "paid" : "free";
  const paidRemaining = active.reduce((sum, e) => sum + remaining(e), 0);
  const day = kstDayKey(now);
  const freeUsed = state.free.dayKey === day ? state.free.used : 0;
  const freeRemaining = mode === "free" ? Math.max(0, FREE_DAILY_LIMIT - freeUsed) : 0;
  const rewardRemaining = state.credits.filter((c) => rewardAvailable(c, now)).length;
  const grantedToday = state.rewardDaily.dayKey === day ? state.rewardDaily.granted : 0;
  const subscriptionRemaining = mode === "paid" ? paidRemaining : freeRemaining;
  return {
    mode,
    adFree: active.some((e) => e.planId === "pro"),
    plans: active
      .map((e) => ({ planId: e.planId, total: e.quotaTotal, remaining: remaining(e), periodEnd: e.periodEnd }))
      .sort((a, b) => a.periodEnd - b.periodEnd),
    paidRemaining,
    freeRemaining,
    rewardRemaining,
    subscriptionRemaining,
    totalRemaining: subscriptionRemaining + rewardRemaining,
    adRewardsLeftToday: Math.max(0, AD_REWARD_DAILY_CAP - grantedToday),
  };
}

export type ReserveResult =
  | { ok: true; state: QuotaState; reservation: Reservation; duplicate: boolean }
  | { ok: false; reason: "NO_QUOTA" };

/**
 * 요청 1건에 대해 이용권을 1회 예약한다. 같은 requestId로 다시 호출하면
 * 추가 차감 없이 기존 예약을 돌려준다(멱등).
 * 우선순위: 유료(만료 임박순) → [유료 없을 때만] 무료 일일 → 광고 보상.
 */
export function reserve(state: QuotaState, requestId: string, now: number, allowReward = true): ReserveResult {
  const prior = state.reservations[requestId];
  if (prior && prior.state !== "refunded") {
    return { ok: true, state, reservation: prior, duplicate: true };
  }
  const next: QuotaState = JSON.parse(JSON.stringify(state));
  const day = kstDayKey(now);
  const active = activeEntitlements(next, now);

  let reservation: Reservation | null = null;

  if (active.length > 0) {
    const candidate = active
      .filter((e) => remaining(e) > 0)
      .sort((a, b) => a.periodEnd - b.periodEnd || PLAN_ORDER[a.planId] - PLAN_ORDER[b.planId])[0];
    if (candidate) {
      const target = next.entitlements.find((e) => e.id === candidate.id)!;
      target.quotaUsed += 1;
      reservation = { requestId, source: "paid", refId: target.id, periodStart: target.periodStart, state: "reserved", at: now };
    }
  } else {
    if (next.free.dayKey !== day) next.free = { dayKey: day, used: 0 };
    if (next.free.used < FREE_DAILY_LIMIT) {
      next.free.used += 1;
      reservation = { requestId, source: "free", refId: day, state: "reserved", at: now };
    }
  }

  if (!reservation && allowReward) {
    const credit = next.credits
      .filter((c) => rewardAvailable(c, now))
      .sort((a, b) => a.expiresAt - b.expiresAt || a.grantedAt - b.grantedAt)[0];
    if (credit) {
      credit.used = true;
      reservation = { requestId, source: "reward", refId: credit.id, state: "reserved", at: now };
    }
  }

  if (!reservation) return { ok: false, reason: "NO_QUOTA" };
  next.reservations[requestId] = reservation;
  return { ok: true, state: next, reservation, duplicate: false };
}

const PLAN_ORDER: Record<PlanId, number> = { basic: 0, plus: 1, pro: 2 };

export function commit(state: QuotaState, requestId: string): QuotaState {
  const r = state.reservations[requestId];
  if (!r || r.state !== "reserved") return state;
  const next: QuotaState = JSON.parse(JSON.stringify(state));
  next.reservations[requestId].state = "committed";
  return next;
}

/** AI 호출 실패 시 예약을 되돌린다. 이미 환불됐거나 확정된 요청은 건드리지 않는다. */
export function refund(state: QuotaState, requestId: string, now: number): QuotaState {
  const r = state.reservations[requestId];
  if (!r || r.state !== "reserved") return state;
  const next: QuotaState = JSON.parse(JSON.stringify(state));
  const nr = next.reservations[requestId];
  if (nr.source === "paid") {
    const e = next.entitlements.find((x) => x.id === nr.refId);
    // 같은 결제 주기일 때만 복구한다(갱신으로 새 주기가 시작됐으면 건드리지 않음).
    if (e && e.periodStart === nr.periodStart && e.quotaUsed > 0) e.quotaUsed -= 1;
  } else if (nr.source === "free") {
    if (next.free.dayKey === nr.refId && next.free.used > 0) next.free.used -= 1;
  } else {
    const c = next.credits.find((x) => x.id === nr.refId);
    if (c && now < c.expiresAt) c.used = false;
  }
  nr.state = "refunded";
  return next;
}

export type GrantResult =
  | { granted: true; state: QuotaState; credit: RewardCredit }
  | { granted: false; state: QuotaState; reason: "DUPLICATE" | "DAILY_CAP" };

/**
 * 서버 검증(SSV)을 통과한 광고 보상 1건을 지급한다.
 * 같은 transaction_id는 한 번만, 사용자당 KST 하루 최대 5회.
 */
export function grantAdReward(
  state: QuotaState,
  transactionId: string,
  now: number,
  ttlMs = DEFAULT_AD_REWARD_TTL_MS,
): GrantResult {
  if (state.rewardTransactions[transactionId] !== undefined) {
    return { granted: false, state, reason: "DUPLICATE" };
  }
  const day = kstDayKey(now);
  const granted = state.rewardDaily.dayKey === day ? state.rewardDaily.granted : 0;
  if (granted >= AD_REWARD_DAILY_CAP) return { granted: false, state, reason: "DAILY_CAP" };
  const next: QuotaState = JSON.parse(JSON.stringify(state));
  const credit: RewardCredit = { id: `ad_${transactionId}`, grantedAt: now, expiresAt: now + ttlMs, used: false };
  next.credits.push(credit);
  next.rewardDaily = { dayKey: day, granted: granted + 1 };
  next.rewardTransactions[transactionId] = now;
  return { granted: true, state: next, credit };
}

export interface IncomingSubscription {
  planId: PlanId;
  productId: string;
  periodStart: number;
  periodEnd: number;
}

export interface SyncOptions {
  /** 기존(월 100회) Pro 권한을 유지해야 하는 사용자 */
  legacyPro?: boolean;
}

export interface SyncResult {
  state: QuotaState;
  /** Basic과 Plus가 함께 들어온 경우 더 늦게 시작한 쪽만 유지하고 나머지를 알린다 */
  conflicts: PlanId[];
}

/**
 * 결제 제공자(RevenueCat)가 알려준 현재 활성 구독 목록으로 이용권을 동기화한다.
 *  - 같은 결제 주기면 사용량을 유지, 갱신(periodStart 변경)이면 0으로 초기화
 *  - 목록에 없는 구독은 만료 처리(문서는 남김)
 *  - 클라이언트 주장은 사용하지 않고, 서버가 확인한 목록만 넣어야 한다.
 */
export function syncSubscriptions(
  state: QuotaState,
  incoming: IncomingSubscription[],
  now: number,
  options: SyncOptions = {},
): SyncResult {
  const next: QuotaState = JSON.parse(JSON.stringify(state));
  const live = incoming.filter((s) => s.periodStart <= now && now < s.periodEnd);

  const conflicts: PlanId[] = [];
  const basic = live.find((s) => s.planId === "basic");
  const plus = live.find((s) => s.planId === "plus");
  let accepted = live;
  if (basic && plus) {
    const loser = basic.periodStart >= plus.periodStart ? plus : basic;
    conflicts.push(loser.planId);
    accepted = live.filter((s) => s !== loser);
  }

  for (const sub of accepted) {
    const quotaTotal = sub.planId === "pro" && options.legacyPro ? LEGACY_PRO_QUOTA : PLAN_QUOTA[sub.planId];
    const existing = next.entitlements.find((e) => e.id === sub.planId);
    if (existing && existing.periodStart === sub.periodStart && existing.state === "active") {
      existing.periodEnd = sub.periodEnd;
      existing.productId = sub.productId;
      existing.quotaTotal = quotaTotal;
      existing.legacy = sub.planId === "pro" && options.legacyPro ? true : undefined;
    } else {
      const fresh: Entitlement = {
        id: sub.planId, planId: sub.planId, productId: sub.productId,
        periodStart: sub.periodStart, periodEnd: sub.periodEnd,
        quotaTotal, quotaUsed: 0, state: "active",
        ...(sub.planId === "pro" && options.legacyPro ? { legacy: true } : {}),
      };
      if (existing) Object.assign(existing, fresh, { legacy: fresh.legacy });
      else next.entitlements.push(fresh);
    }
  }

  const acceptedIds = new Set(accepted.map((s) => s.planId));
  for (const e of next.entitlements) {
    if (!acceptedIds.has(e.planId) && e.state === "active") {
      e.state = conflicts.includes(e.planId) ? "superseded" : "expired";
    }
  }
  return { state: next, conflicts };
}

/**
 * 기존 isPremium=true 사용자를 새 구조로 옮길 때 쓰는 Pro 이용권.
 * 이번 달 사용량(aiUsageCount)을 이어받아 업그레이드 직후 횟수가 갑자기 늘거나 줄지 않게 한다.
 */
export function legacyProEntitlement(args: {
  productId: string;
  periodStart: number;
  periodEnd: number;
  usedThisMonth: number;
}): Entitlement {
  return {
    id: "pro", planId: "pro", productId: args.productId,
    periodStart: args.periodStart, periodEnd: args.periodEnd,
    quotaTotal: LEGACY_PRO_QUOTA,
    quotaUsed: Math.min(LEGACY_PRO_QUOTA, Math.max(0, Math.floor(args.usedThisMonth))),
    legacy: true, state: "active",
  };
}

/** 광고 표시 여부: Pro 활성일 때만 일반 광고를 제거한다. 보상형 광고는 항상 사용자가 선택. */
export function shouldShowAds(state: QuotaState, now: number): boolean {
  return !activeEntitlements(state, now).some((e) => e.planId === "pro");
}
