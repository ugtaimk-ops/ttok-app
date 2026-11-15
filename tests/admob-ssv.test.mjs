import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyAdMobCallback } from "../services/adRewardService.ts";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const keys = new Map([["42", publicKey.export({ type: "spki", format: "pem" })]]);
const signedPart = "ad_unit=unit123&custom_data=nonce&reward_amount=1&reward_item=ai_credit&timestamp=123&transaction_id=abcdef1234567890";
const signature = sign("sha256", Buffer.from(signedPart), privateKey).toString("base64url");
const callback = `${signedPart}&signature=${signature}&key_id=42`;

test("AdMob SSV verifies unchanged query bytes", () => {
  assert.equal(verifyAdMobCallback(callback, keys).get("reward_item"), "ai_credit");
});
test("AdMob SSV rejects changed amount, missing signature and unknown key", () => {
  assert.throws(() => verifyAdMobCallback(callback.replace("reward_amount=1", "reward_amount=2"), keys));
  assert.throws(() => verifyAdMobCallback(signedPart, keys));
  assert.throws(() => verifyAdMobCallback(callback.replace("key_id=42", "key_id=43"), keys));
});
