import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getAdminFirestore } from './usageService';
import { creditBalance, emptyCreditState, grantFreeDay, grantPaidPeriod, reserveCredits, releaseCredits, settleCredits, type CreditState } from './creditPolicy';

export const creditsEnabled = () => process.env.MONETIZATION_V7_ENABLED === 'true';
export const creditContext = new AsyncLocalStorage<{uid: string; requestId: string}>();
type Period = {plan: 'basic'|'pro'|'max'; id: string; startsAt: number; expiresAt: number};
// Only explicitly configured NEW products enter credit billing. Existing
// subscriptions keep their existing quota path until a reviewed migration.
export function verifiedCreditPeriods(subscriber: any, mapping: Record<string,string>, now: number) {
  const periods: Period[] = [];
  let legacy = false;
  for (const [key, raw] of Object.entries(subscriber?.subscriptions || {})) {
    const sub = raw as any;
    const start = Date.parse(sub?.purchase_date), end = Date.parse(sub?.expires_date);
    if (!['play_store','app_store'].includes(sub?.store) || sub.refunded_at || !Number.isFinite(start) || !Number.isFinite(end) || start > now || end <= now) continue;
    const plan = mapping[key.split(':')[0]];
    if (!['basic','pro','max'].includes(plan)) { legacy = true; continue; }
    periods.push({plan: plan as Period['plan'], id:createHash('sha256').update(`${key}:${start}`).digest('hex'), startsAt:start, expiresAt:end});
  }
  // Never silently turn a legacy/lifetime entitlement into a free account.
  if (!periods.length && Object.values(subscriber?.entitlements || {}).some((e:any)=>!e.expires_date || Date.parse(e.expires_date)>now)) legacy=true;
  return {periods, legacy};
}

async function verified(uid: string) {
  const secret=process.env.REVENUECAT_SECRET_API_KEY;
  if (!secret) throw Error('Subscription verification unavailable');
  const response=await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw Error('Subscription verification failed');
  const data=await response.json();
  const map=JSON.parse(process.env.CREDIT_PRODUCT_MAP_JSON || '{}');
  if(!map || typeof map!=='object' || Array.isArray(map)) throw Error('Invalid credit product mapping');
  return verifiedCreditPeriods(data.subscriber,map,Date.now());
}

/** All wallet writes serialize in Firestore; request markers are separate,
 * permanent documents rather than an ever-growing map inside the wallet. */
export async function creditOperation(uid:string, operation:'status'|'reserve'|'settle'|'release', requestId='', amount=0) {
  if(operation!=='status' && !/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) throw Error('Invalid request ID');
  const subscription=(operation==='status'||operation==='reserve') ? await verified(uid) : null;
  if(subscription?.legacy) return {legacy:true as const};
  const db=getAdminFirestore(), user=db.collection('users').doc(uid);
  const wallet=user.collection('aiWallet').doc('main');
  const request=user.collection('aiRequests').doc(requestId || '_status');
  return db.runTransaction(async(tx:any)=>{
    const deleted=await tx.get(db.collection('deletedAccounts').doc(uid));
    const profile=await tx.get(user);
    const snapshot=await tx.get(wallet);
    const marker=operation==='status'?null:await tx.get(request);
    if(deleted.exists || !profile.exists) throw Error('Account unavailable');
    const now=Date.now();
    let state:CreditState={...emptyCreditState(),grants:snapshot.data()?.grants || []};
    for(const period of subscription?.periods || []) state=grantPaidPeriod(state,{plan:period.plan,verifiedPeriodId:period.id,startsAt:period.startsAt,expiresAt:period.expiresAt});
    // Revoke expired/refunded paid grants without touching request markers.
    if(subscription) {
    const valid=new Set(subscription.periods.map(p=>`${p.plan}:${p.id}`));
    state.grants=state.grants.filter(g=>g.plan!=='free' || g.expiresAt>now);
    for(const grant of state.grants) if(grant.plan!=='free' && !valid.has(grant.id)) grant.remaining=0;
    if(!subscription.periods.length) state=grantFreeDay(state,now);
    else state.grants=state.grants.filter(g=>g.plan!=='free');
    }
    if(marker?.exists) state.holds[requestId]=marker.data().hold;
    if(operation==='reserve') {
      if(marker?.exists) throw Object.assign(Error('이미 처리 중이거나 완료된 요청이에요.'),{status:409});
      const result=reserveCredits(state,requestId,amount,now);
      if(!result.ok) throw Object.assign(Error('사용 가능한 AI 크레딧이 부족해요.'),{status:403});
      state=result.state;
    } else if(operation==='settle') state=settleCredits(state,requestId,amount,now);
    else if(operation==='release') state=releaseCredits(state,requestId,now);
    const balance=creditBalance(state,now);
    tx.set(wallet,{grants:state.grants,totalAvailable:balance,updatedAt:now,schemaVersion:7});
    if(operation!=='status' && state.holds[requestId]) tx.set(request,{hold:state.holds[requestId],updatedAt:now});
    return {legacy:false as const,balance,plans:(subscription?.periods || []).map(p=>p.plan),expiresAt:state.grants.some(g=>g.expiresAt>now)?Math.min(...state.grants.filter(g=>g.expiresAt>now).map(g=>g.expiresAt)):null};
  });
}
