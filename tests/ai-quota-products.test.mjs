import test from "node:test";
import assert from "node:assert/strict";
import { verifiedSubscriptions } from "../services/aiQuotaStore.ts";

const NOW = Date.parse("2026-11-14T00:00:00Z");
const active = (more = {}) => ({
  store: "play_store", purchase_date: "2026-11-01T00:00:00Z",
  expires_date: "2026-12-01T00:00:00Z", refunded_at: null, ...more,
});

test("only exact, active, non-refunded Play subscription IDs grant quotas", () => {
  const rows = verifiedSubscriptions({ subscriptions: {
    "ttok_ai_basic_monthly:basic": active(),
    "ttok_pro_v2_monthly:pro": active(),
    "ttok_ai_plus_monthly:plus": active({ refunded_at: "2026-11-10T00:00:00Z" }),
    unknown_product: active(),
    ttok_pro_yearly: active({ store: "app_store" }),
  } }, NOW);
  assert.deepEqual(rows.map((r) => r.planId), ["basic", "pro"]);
});

test("legacy Pro product is recognized without downgrading its product identity", () => {
  const rows = verifiedSubscriptions({ subscriptions: {
    "ttok_pro_monthly:ttok-pro-monthly": active(),
  } }, NOW);
  assert.deepEqual(rows.map((r) => [r.planId, r.productId]), [["pro", "ttok_pro_monthly"]]);
});

test("old Pro keeps the 100-use product when RevenueCat also lists new Pro", () => {
  const rows = verifiedSubscriptions({ subscriptions: {
    ttok_pro_v2_monthly: active(),
    ttok_pro_monthly: active(),
  } }, NOW);
  assert.deepEqual(rows.filter((row) => row.planId === "pro").map((row) => row.productId), ["ttok_pro_monthly"]);
});

test("legacy yearly Pro receives a new monthly period at KST month boundary", () => {
  const subscriber = { subscriptions: {
    ttok_pro_yearly: active({ purchase_date: "2026-01-01T00:00:00Z", expires_date: "2027-01-01T00:00:00Z" }),
  } };
  const november = verifiedSubscriptions(subscriber, NOW)[0];
  const december = verifiedSubscriptions(subscriber, Date.parse("2026-11-30T15:00:00Z"))[0];
  assert.notEqual(november.periodStart, december.periodStart);
  assert.equal(november.productId, "ttok_pro_yearly");
});

test("expired or malformed subscription is ignored", () => {
  assert.equal(verifiedSubscriptions({ subscriptions: { ttok_ai_basic_monthly: active({ expires_date: "2026-11-01T00:00:00Z" }) } }, NOW).length, 0);
  assert.equal(verifiedSubscriptions({ subscriptions: { ttok_ai_basic_monthly: active({ purchase_date: "broken" }) } }, NOW).length, 0);
});

test("existing Pro entitlement without subscription remains grandfathered", () => {
  const rows = verifiedSubscriptions({ entitlements: {
    "똑 Pro": { expires_date: "2026-12-01T00:00:00Z", product_identifier: "old_promo" },
  } }, NOW);
  assert.equal(rows[0].productId, "legacy_pro_entitlement");
  assert.equal(rows[0].planId, "pro");
});

test("Basic or Plus attached to Pro entitlement cannot grant grandfathered Pro", () => {
  for (const productId of ["ttok_ai_basic_monthly", "ttok_ai_plus_monthly"]) {
    const rows = verifiedSubscriptions({
      subscriptions: { [productId]: active() },
      entitlements: { "똑 Pro": { product_identifier: productId, expires_date: "2026-12-01T00:00:00Z" } },
    }, NOW);
    assert.equal(rows.some((row) => row.planId === "pro"), false);
  }
});
