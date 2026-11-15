import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, reserve, commit, refund, summarize, grantAdReward, syncSubscriptions,
  legacyProEntitlement, shouldShowAds, kstDayKey, AD_REWARD_DAILY_CAP,
} from "../services/entitlements.ts";

const DAY = 24 * 60 * 60 * 1000;
// 2026-11-14 12:00 KST
const NOW = Date.parse("2026-11-14T03:00:00Z");

const sub = (planId, start = NOW - 5 * DAY, end = NOW + 25 * DAY) =>
  ({ planId, productId: `ttok_${planId}`, periodStart: start, periodEnd: end });

function withPlans(...plans) {
  return syncSubscriptions(emptyState(), plans.map((p) => sub(p)), NOW).state;
}
function use(state, n, prefix = "r", now = NOW) {
  let s = state;
  for (let i = 0; i < n; i++) {
    const r = reserve(s, `${prefix}${i}`, now);
    assert.equal(r.ok, true, `request ${i} should succeed`);
    s = r.state;
  }
  return s;
}

test("KST 날짜 키는 자정(KST)에 바뀐다", () => {
  assert.equal(kstDayKey(Date.parse("2026-11-14T14:59:59Z")), "2026-11-14");
  assert.equal(kstDayKey(Date.parse("2026-11-14T15:00:00Z")), "2026-11-15");
});

test("무료 사용자는 하루 1회, KST 자정에 다시 1회", () => {
  let s = emptyState();
  const first = reserve(s, "a", NOW);
  assert.equal(first.ok, true);
  s = first.state;
  assert.equal(reserve(s, "b", NOW).ok, false);
  const nextDay = Date.parse("2026-11-14T15:00:01Z");
  assert.equal(reserve(s, "c", nextDay).ok, true);
});

test("무료 일일 횟수는 이월되지 않는다", () => {
  const twoDaysLater = NOW + 2 * DAY;
  const s = emptyState();
  const r = reserve(s, "x", twoDaysLater);
  assert.equal(r.ok, true);
  assert.equal(reserve(r.state, "y", twoDaysLater).ok, false);
});

test("같은 requestId 재시도는 두 번 차감되지 않는다", () => {
  const s = withPlans("basic");
  const a = reserve(s, "same", NOW);
  const b = reserve(a.state, "same", NOW);
  assert.equal(b.duplicate, true);
  assert.equal(b.state.entitlements[0].quotaUsed, 1);
});

test("Basic 30 / Pro 50 / Plus 70", () => {
  for (const [plan, total] of [["basic", 30], ["pro", 50], ["plus", 70]]) {
    const s = withPlans(plan);
    assert.equal(summarize(s, NOW).subscriptionRemaining, total);
    const used = use(s, total, plan);
    assert.equal(reserve(used, "over", NOW).ok, false, `${plan} exhausted`);
  }
});

test("Pro+Basic=80, Pro+Plus=120 합산 표시", () => {
  assert.equal(summarize(withPlans("pro", "basic"), NOW).subscriptionRemaining, 80);
  assert.equal(summarize(withPlans("pro", "plus"), NOW).subscriptionRemaining, 120);
});

test("유료 구독은 무료 일일 1회를 합산하지 않고, 소진 후 무료로 전환되지 않는다", () => {
  const s = withPlans("basic");
  assert.equal(summarize(s, NOW).freeRemaining, 0);
  assert.equal(summarize(s, NOW).subscriptionRemaining, 30); // 31 아님
  const exhausted = use(s, 30);
  assert.equal(reserve(exhausted, "extra", NOW).ok, false);
});

test("구독 만료 후 무료 일일 정책으로 복귀", () => {
  const s = withPlans("basic");
  const after = NOW + 40 * DAY;
  const synced = syncSubscriptions(s, [], after).state;
  const sum = summarize(synced, after);
  assert.equal(sum.mode, "free");
  assert.equal(sum.freeRemaining, 1);
});

test("여러 구독이면 만료가 빠른 이용권부터 차감", () => {
  const s = syncSubscriptions(emptyState(), [
    sub("pro", NOW - 5 * DAY, NOW + 25 * DAY),
    sub("basic", NOW - 25 * DAY, NOW + 5 * DAY),
  ], NOW).state;
  const r = reserve(s, "q", NOW);
  assert.equal(r.reservation.refId, "basic");
});

test("Basic과 Plus 동시 활성 불가: 늦게 시작한 쪽만 유지", () => {
  const { state, conflicts } = syncSubscriptions(emptyState(), [
    sub("basic", NOW - 10 * DAY, NOW + 20 * DAY),
    sub("plus", NOW - 1 * DAY, NOW + 29 * DAY),
  ], NOW);
  assert.deepEqual(conflicts, ["basic"]);
  const sum = summarize(state, NOW);
  assert.deepEqual(sum.plans.map((p) => p.planId), ["plus"]);
});

test("Pro가 활성일 때만 일반 광고 제거 (Pro+Basic/Plus 포함)", () => {
  assert.equal(shouldShowAds(emptyState(), NOW), true);
  assert.equal(shouldShowAds(withPlans("basic"), NOW), true);
  assert.equal(shouldShowAds(withPlans("plus"), NOW), true);
  assert.equal(shouldShowAds(withPlans("pro"), NOW), false);
  assert.equal(shouldShowAds(withPlans("pro", "basic"), NOW), false);
  assert.equal(shouldShowAds(withPlans("pro", "plus"), NOW), false);
});

test("결제 주기 갱신 시 사용량 초기화, 같은 주기 재동기화는 유지", () => {
  let s = use(withPlans("basic"), 10);
  s = syncSubscriptions(s, [sub("basic")], NOW).state; // 같은 주기
  assert.equal(s.entitlements[0].quotaUsed, 10);
  const renewed = sub("basic", NOW, NOW + 30 * DAY);
  s = syncSubscriptions(s, [renewed], NOW).state;
  assert.equal(s.entitlements[0].quotaUsed, 0);
});

test("AI 호출 실패 시 환불: 유료/무료/보상 모두 복구", () => {
  // 유료
  let s = withPlans("basic");
  let r = reserve(s, "p", NOW);
  assert.equal(refund(r.state, "p", NOW).entitlements[0].quotaUsed, 0);
  // 무료
  r = reserve(emptyState(), "f", NOW);
  assert.equal(refund(r.state, "f", NOW).free.used, 0);
  // 보상
  const g = grantAdReward(emptyState(), "tx1", NOW);
  const used = reserve(use(g.state, 1, "burn"), "rw", NOW); // 무료 소진 후 보상 사용
  assert.equal(used.reservation.source, "reward");
  assert.equal(refund(used.state, "rw", NOW).credits[0].used, false);
});

test("환불은 한 번만, 확정된 요청은 환불되지 않는다", () => {
  const s = withPlans("basic");
  const r = reserve(s, "a", NOW);
  const once = refund(r.state, "a", NOW);
  const twice = refund(once, "a", NOW);
  assert.equal(twice.entitlements[0].quotaUsed, 0);
  const r2 = reserve(twice, "b", NOW);
  const done = commit(r2.state, "b");
  assert.equal(refund(done, "b", NOW).entitlements[0].quotaUsed, 1);
});

test("갱신 후에는 이전 주기 예약을 환불해도 새 주기 사용량을 깎지 않는다", () => {
  let s = withPlans("basic");
  const r = reserve(s, "old", NOW);
  const renewed = syncSubscriptions(r.state, [sub("basic", NOW, NOW + 30 * DAY)], NOW).state;
  const after = reserve(renewed, "new", NOW);
  const refunded = refund(after.state, "old", NOW);
  assert.equal(refunded.entitlements[0].quotaUsed, 1);
});

test("광고 보상: 1건당 1회, 소진 후에만 사용", () => {
  const g = grantAdReward(emptyState(), "tx-a", NOW);
  assert.equal(g.granted, true);
  let s = g.state;
  assert.equal(reserve(s, "free1", NOW).reservation.source, "free"); // 무료가 먼저
  s = reserve(s, "free1", NOW).state;
  assert.equal(reserve(s, "reward1", NOW).reservation.source, "reward");
});

test("유료 이용권이 남아 있으면 보상보다 유료를 먼저 쓴다", () => {
  let s = grantAdReward(withPlans("pro"), "tx", NOW).state;
  assert.equal(reserve(s, "x", NOW).reservation.source, "paid");
});

test("유료 횟수 소진 후에는 광고 보상 사용 가능", () => {
  let s = grantAdReward(use(withPlans("basic"), 30), "tx", NOW).state;
  assert.equal(reserve(s, "x", NOW).reservation.source, "reward");
});

test("광고 보상은 문제 풀이에서만 쓸 수 있고 다른 AI 기능은 차감할 수 없다", () => {
  const rewarded = grantAdReward(emptyState(), "problem-only", NOW).state;
  const afterFree = reserve(rewarded, "free", NOW).state;
  assert.equal(reserve(afterFree, "script", NOW, false).ok, false);
  const problem = reserve(afterFree, "problem", NOW, true);
  assert.equal(problem.ok, true);
  assert.equal(problem.reservation.source, "reward");
});

test("광고 보상 transaction_id 중복은 1회만 지급", () => {
  const a = grantAdReward(emptyState(), "dup", NOW);
  const b = grantAdReward(a.state, "dup", NOW);
  assert.equal(b.granted, false);
  assert.equal(b.reason, "DUPLICATE");
  assert.equal(b.state.credits.length, 1);
});

test("광고 보상은 KST 하루 5회까지, 다음 날 다시 지급", () => {
  let s = emptyState();
  for (let i = 0; i < AD_REWARD_DAILY_CAP; i++) {
    const g = grantAdReward(s, `t${i}`, NOW);
    assert.equal(g.granted, true);
    s = g.state;
  }
  const sixth = grantAdReward(s, "t5", NOW);
  assert.equal(sixth.granted, false);
  assert.equal(sixth.reason, "DAILY_CAP");
  const tomorrow = Date.parse("2026-11-14T15:00:01Z");
  assert.equal(grantAdReward(s, "t5", tomorrow).granted, true);
});

test("만료된 광고 보상은 사용할 수 없다", () => {
  const g = grantAdReward(emptyState(), "old", NOW, 1000);
  const later = NOW + 5000;
  const free = reserve(g.state, "f", later);
  assert.equal(reserve(free.state, "r", later).ok, false);
});

test("기존 Pro(100회) 구독자는 100회를 유지하고 이번 달 사용량을 이어받는다", () => {
  const legacy = legacyProEntitlement({
    productId: "ttok_pro_monthly", periodStart: NOW - 5 * DAY, periodEnd: NOW + 25 * DAY, usedThisMonth: 40,
  });
  const s = { ...emptyState(), entitlements: [legacy] };
  assert.equal(summarize(s, NOW).subscriptionRemaining, 60);
  // 동기화해도 legacy 100회가 유지된다
  const synced = syncSubscriptions(s, [sub("pro", legacy.periodStart, legacy.periodEnd)], NOW, { legacyPro: true }).state;
  assert.equal(synced.entitlements[0].quotaTotal, 100);
  assert.equal(synced.entitlements[0].quotaUsed, 40);
  // 신규 Pro는 50회
  assert.equal(summarize(withPlans("pro"), NOW).subscriptionRemaining, 50);
});

test("기존 Pro + 신규 Basic 합산(100+30)", () => {
  const legacy = legacyProEntitlement({ productId: "p", periodStart: NOW - DAY, periodEnd: NOW + 29 * DAY, usedThisMonth: 0 });
  const s = syncSubscriptions({ ...emptyState(), entitlements: [legacy] }, [
    sub("pro", legacy.periodStart, legacy.periodEnd), sub("basic"),
  ], NOW, { legacyPro: true }).state;
  assert.equal(summarize(s, NOW).subscriptionRemaining, 130);
});

test("요약: 광고 보상 잔액은 구독 잔여와 분리되어 표시", () => {
  const s = grantAdReward(withPlans("basic"), "tx", NOW).state;
  const sum = summarize(s, NOW);
  assert.equal(sum.subscriptionRemaining, 30);
  assert.equal(sum.rewardRemaining, 1);
  assert.equal(sum.totalRemaining, 31);
});
