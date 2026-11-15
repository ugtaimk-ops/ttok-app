import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createTimerTickets} from '../services/timerAccountLink'
const verifier='a'.repeat(64),challenge=createHash('sha256').update(verifier).digest('base64url')
test('timer link requires PKCE and is single use',()=>{const store=createTimerTickets(uid=>'signed:'+uid);const code=store.issue('owner',challenge);assert.throws(()=>store.exchange(code,'b'.repeat(64)));assert.equal(store.exchange(code,verifier),'signed:owner');assert.throws(()=>store.exchange(code,verifier))})
test('timer link expires after 60 seconds',()=>{let now=1000;const store=createTimerTickets(uid=>uid,()=>now);const code=store.issue('owner',challenge);now+=60001;assert.throws(()=>store.exchange(code,verifier))})
test('timer link rejects malformed challenges and verifiers',()=>{const store=createTimerTickets(uid=>uid);assert.throws(()=>store.issue('owner','wrong'));const code=store.issue('owner',challenge);assert.throws(()=>store.exchange(code,'short'))})
