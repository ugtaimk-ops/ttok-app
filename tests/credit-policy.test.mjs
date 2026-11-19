import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyCreditState, freeDayPeriod, grantFreeDay, grantPaidPeriod,
  creditBalance, modelRatesFromJson, priceGeminiUsage, reserveCredits, releaseCredits, settleCredits,
} from "../services/creditPolicy.ts";

const now = Date.parse("2026-11-19T14:59:59Z");
const id = "request_1234567890";
const paid = (state, plan, period = "period_1") => grantPaidPeriod(state, {
  plan, verifiedPeriodId: period, startsAt: now - 1000, expiresAt: now + 30 * 86400000,
});

test("KST midnight resets the free allowance without carrying over leftovers", () => {
  const first = grantFreeDay(emptyCreditState(), now);
  assert.equal(creditBalance(first, now), 500);
  assert.equal(freeDayPeriod(now).id, "free:2026-11-19");
  const next = now + 1000;
  assert.equal(creditBalance(first, next), 0);
  const refreshed = grantFreeDay(first, next);
  assert.equal(freeDayPeriod(next).id, "free:2026-11-20");
  assert.equal(creditBalance(refreshed, next), 500);
  assert.equal(grantFreeDay(refreshed, next), refreshed);
});

test("verified periods grant Basic, Pro, Max once and exclude daily free for paid users", () => {
  for (const [plan, expected] of [["basic", 30000], ["pro", 100000], ["max", 300000]]) {
    const state = paid(emptyCreditState(), plan);
    assert.equal(creditBalance(state, now), expected);
    assert.equal(paid(state, plan), state);
    assert.equal(grantFreeDay(state, now), state);
  }
  assert.throws(() => paid(emptyCreditState(), "unexpected"), /Invalid verified billing period/);
});

test("Basic and Pro balances can add while a renewed period is a new grant", () => {
  const basic = paid(emptyCreditState(), "basic");
  const combined = paid(basic, "pro");
  assert.equal(creditBalance(combined, now), 130000);
  assert.equal(creditBalance(paid(combined, "pro", "period_2"), now), 230000);
});

test("same request cannot reserve twice; failed call releases once", () => {
  const state = grantFreeDay(emptyCreditState(), now);
  const first = reserveCredits(state, id, 120, now);
  assert.equal(first.ok, true);
  assert.equal(creditBalance(first.state, now), 380);
  const duplicate = reserveCredits(first.state, id, 120, now);
  assert.equal(duplicate.duplicate, true);
  assert.equal(creditBalance(duplicate.state, now), 380);
  const returned = releaseCredits(first.state, id, now);
  assert.equal(creditBalance(returned, now), 500);
  assert.equal(releaseCredits(returned, id, now), returned);
  assert.equal(reserveCredits(returned, id, 120, now).duplicate, true);
});

test("settlement refunds unused reserve and records unexpected overage", () => {
  const state = grantFreeDay(emptyCreditState(), now);
  const first = reserveCredits(state, id, 200, now).state;
  const settled = settleCredits(first, id, 75, now);
  assert.equal(creditBalance(settled, now), 425);
  assert.equal(settled.holds[id].allocations.reduce((sum, part) => sum + part.amount, 0), 75);
  assert.equal(settleCredits(settled, id, 75, now), settled);
  const second = reserveCredits(settled, "another_request_98765", 100, now).state;
  const over = settleCredits(second, "another_request_98765", 500, now);
  assert.equal(creditBalance(over, now), 0);
  assert.equal(over.holds.another_request_98765.uncovered, 75);
  assert.equal(over.holds.another_request_98765.allocations.reduce((sum, part) => sum + part.amount, 0), 425);
});

test("expired grants never return to the usable balance after a late release", () => {
  const state = grantFreeDay(emptyCreditState(), now);
  const held = reserveCredits(state, id, 100, now).state;
  assert.equal(creditBalance(releaseCredits(held, id, now + 1000), now + 1000), 0);
});

test("Gemini usage counts cached input once and includes thought tokens in output", () => {
  const priced = priceGeminiUsage({ promptTokenCount: 1000, cachedContentTokenCount: 200,
    candidatesTokenCount: 200, thoughtsTokenCount: 100 }, {
    inputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.01, outputUsdPerMillion: 0.4,
  });
  assert.equal(priced.estimatedUsd, 0.000202);
  assert.equal(priced.credits, 21);
  assert.throws(() => priceGeminiUsage({ promptTokenCount: 5 }, {
    inputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.01, outputUsdPerMillion: 0.4,
  }), /usage/);
});

test("unpriced audio input is refused instead of silently charging the text rate", () => {
  assert.throws(() => priceGeminiUsage({ promptTokenCount: 100, candidatesTokenCount: 20,
    promptTokensDetails: [{ modality: "AUDIO", tokenCount: 50 }] }, {
    inputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.01, outputUsdPerMillion: 0.4,
  }), /audio pricing/);
  assert.throws(() => priceGeminiUsage({ promptTokenCount: 100, candidatesTokenCount: 20,
    promptTokensDetails: [{ modality: "UNKNOWN", tokenCount: 50 }] }, {
    inputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.01, outputUsdPerMillion: 0.4,
  }), /Unsupported Gemini input modality/);
});

test("model rates load only from a complete server configuration", () => {
  const raw = JSON.stringify({ "gemini-2.5-flash-lite": {
    inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4, cachedInputUsdPerMillion: 0.01,
  } });
  assert.equal(modelRatesFromJson(raw, "gemini-2.5-flash-lite").outputUsdPerMillion, 0.4);
  assert.throws(() => modelRatesFromJson(raw, "unknown"), /not configured/);
  assert.throws(() => modelRatesFromJson('{"model":{"inputUsdPerMillion":0.1}}', "model"), /Missing/);
});
