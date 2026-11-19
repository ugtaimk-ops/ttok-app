import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedCreditPeriods} from '../services/creditStore.ts';
const now=Date.parse('2026-11-19T00:00:00Z');
const sub=(extra={})=>({purchase_date:'2026-11-01T00:00:00Z',expires_date:'2026-12-01T00:00:00Z',store:'play_store',...extra});
test('new products require an explicit server mapping; old plans remain legacy',()=>{
  assert.equal(verifiedCreditPeriods({subscriptions:{old:sub()}},{},now).legacy,true);
  const result=verifiedCreditPeriods({subscriptions:{'new:monthly':sub()}},{new:'max'},now);
  assert.equal(result.legacy,false); assert.equal(result.periods[0].plan,'max');
});
test('expired, refunded, future and unsupported-store purchases grant no credits',()=>{
  for(const extra of [{refunded_at:'2026-11-18'},{store:'test_store'},{expires_date:'2026-11-18'},{purchase_date:'2026-11-20'}])
    assert.equal(verifiedCreditPeriods({subscriptions:{new:sub(extra)}},{new:'pro'},now).periods.length,0);
});
test('same verified billing period has a stable grant identity, renewal changes it',()=>{
  const first=verifiedCreditPeriods({subscriptions:{new:sub()}},{new:'basic'},now).periods[0];
  assert.equal(first.id,verifiedCreditPeriods({subscriptions:{new:sub()}},{new:'basic'},now).periods[0].id);
  assert.notEqual(first.id,verifiedCreditPeriods({subscriptions:{new:sub({purchase_date:'2026-11-02'})}},{new:'basic'},now).periods[0].id);
});
