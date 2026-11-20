import test from 'node:test';
import assert from 'node:assert/strict';
import { countWithKeyRotation } from '../services/ai/tokenCounter.ts';
test('token counter skips an invalid key and returns the working index', async()=>{
  const visited=[];
  const result=await countWithKeyRotation(['bad','good'],0,async key=>{
    visited.push(key);if(key==='bad')throw {status:401};return {totalTokens:42};
  },e=>e.status===401);
  assert.deepEqual(visited,['bad','good']);assert.equal(result.keyIndex,1);assert.equal(result.result.totalTokens,42);
});
test('token counting does not retry input errors or empty credential configuration',async()=>{
  let calls=0;
  await assert.rejects(countWithKeyRotation(['a','b'],0,async()=>{calls++;throw Error('bad input');},()=>false));
  assert.equal(calls,1);
  await assert.rejects(countWithKeyRotation([],0,async()=>0,()=>true));
});
