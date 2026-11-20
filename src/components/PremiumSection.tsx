import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Crown, RefreshCw, Settings2, Sparkles } from "lucide-react";
import type { UserProfile } from "../types";
import { purchaseService } from "../services/purchaseService";
import CreditPaywall from "./CreditPaywall";

interface Props {user:UserProfile;darkMode:boolean;planPreview?:"free"|"pro"}
export default function PremiumSection({user,darkMode,planPreview}:Props) {
  const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const preview=!Capacitor.isNativePlatform() || !!planPreview;
  const plans=user.aiCredits?.plans || [];
  const name=plans.includes('max')?'똑 Max':plans.includes('pro')?'똑 Pro':plans.includes('basic')?'똑 Basic':user.isPremium?'기존 구독':'무료';
  async function manage(){setBusy(true);setMessage('');try{await purchaseService.openManageSubscription();}catch{setMessage('구독 관리 화면을 열지 못했어요. 스토어에서 정기 결제를 확인해 주세요.');}finally{setBusy(false);}}
  async function restore(){setBusy(true);setMessage('');try{await purchaseService.restorePurchases();window.dispatchEvent(new Event('ttok:usage-updated'));setMessage('구매 내역을 확인했어요. 계정 상태를 갱신합니다.');}catch{setMessage('구매 내역을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');}finally{setBusy(false);}}
  return <section className={`p-5 rounded-3xl border space-y-4 ${darkMode?'bg-slate-900 border-slate-700':'bg-white border-slate-100'}`}>
    <h3 className="font-bold flex items-center gap-2"><Crown size={16}/>요금제 · AI 크레딧</h3>
    <div className="flex justify-between text-sm"><span className="text-slate-500">현재 플랜</span><strong>{name}</strong></div>
    <div className="flex justify-between text-sm"><span className="text-slate-500">남은 AI 크레딧</span><strong>{user.aiCredits?`${user.aiCredits.balance.toLocaleString()} 크레딧`:'계정 상태 확인 필요'}</strong></div>
    {!user.aiCredits&&<button onClick={()=>window.dispatchEvent(new Event('ttok:usage-updated'))} className="text-sm text-blue-600">크레딧 다시 확인</button>}
    <button data-ui="premium-subscribe" onClick={()=>setShow(true)} className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold flex justify-center items-center gap-2"><Sparkles size={16}/>{preview?'크레딧 요금제 미리보기':'크레딧 요금제 보기'}</button>
    {preview?<p className="text-xs text-slate-500">웹에서는 요금제를 비교할 수 있어요. 실제 구매는 스토어에서 설치한 똑 앱에서 진행해 주세요.</p>:<>
      <button data-ui="premium-manage" disabled={busy} onClick={manage} className="w-full py-3 border rounded-2xl flex justify-center gap-2"><Settings2 size={16}/>구독 관리 / 해지</button>
      <button data-ui="premium-restore" disabled={busy} onClick={restore} className="w-full py-2 text-sm flex justify-center gap-2"><RefreshCw size={16}/>구매 내역 복원</button>
    </>}
    {message&&<p role="status" className="text-sm text-slate-500">{message}</p>}
    {show&&<CreditPaywall previewOnly={preview} onClose={()=>setShow(false)}/>}
  </section>;
}
