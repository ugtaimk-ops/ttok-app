import {Capacitor} from '@capacitor/core'
import {requestExamReminder,cancelExamReminders} from './studyReminders'
import {createStudyClient,deleteAccountScoped} from '@ddok/shared-study'
import {auth,db} from '../lib/firebase'
import {getBaseUrl,robustFetch} from '../lib/api'
async function deleteLinkedAccount(){return deleteAccountScoped(()=>auth.currentUser?.uid,async uid=>{
 const res=await robustFetch('/api/account/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE',expectedUid:uid})});
 if(!res.ok){const body=await res.json().catch(()=>({}));throw Error(body.error||'최근 로그인 후 다시 시도해 주세요.')}
 },async uid=>{await cancelExamReminders(uid).catch(()=>{});for(const key of Object.keys(localStorage))if(key.startsWith('ddok-')&&key.includes(uid))localStorage.removeItem(key)},()=>auth.signOut())}
export const sharedStudy=createStudyClient(auth,db,'ddok',{emulator:(import.meta as any).env.DEV&&(import.meta as any).env.VITE_USE_FIREBASE_EMULATORS==='true',apiBaseUrl:getBaseUrl(),inviteBaseUrl:(import.meta as any).env.DEV?'http://127.0.0.1:3002/':(import.meta as any).env.VITE_TIMER_PUBLIC_URL||undefined,scheduleExamReminder:Capacitor.isNativePlatform()?requestExamReminder:undefined,deleteAccount:deleteLinkedAccount})
