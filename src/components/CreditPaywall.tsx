import {Capacitor} from '@capacitor/core';
import {creditPlans as plans} from '../lib/creditPlans';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Purchases} from '@revenuecat/purchases-capacitor';
import type {PurchasesStoreProduct} from '@revenuecat/purchases-capacitor';
import {purchaseService} from '../services/purchaseService';
import {auth} from '../lib/firebase';
import {robustFetch} from '../lib/api';
import {useScreenBack} from '../lib/screenBack';
export default function CreditPaywall({onClose,previewOnly=false}:{onClose:()=>void;previewOnly?:boolean}){
  const isPreview=previewOnly || !Capacitor.isNativePlatform();
  const [products,setProducts]=useState<Record<string,PurchasesStoreProduct>>({});
  const [selected,setSelected]=useState('pro');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(isPreview?'웹 미리보기 · 실제 결제는 앱에서 진행해 주세요.':'상품을 불러오는 중이에요.');
  useScreenBack(()=>{if(!busy)onClose();return true;},true,100);
  useEffect(()=>{if(isPreview)return;let active=true;void(async()=>{
    try{
      const uid=auth.currentUser?.uid;if(!uid)throw Error();
      await purchaseService.configure(uid);
      const response=await robustFetch('/api/credits/products');if(!response.ok)throw Error();
      const {products:map}=await response.json();
      const ids=Object.keys(map);if(!ids.length)throw Error();
      const result=await Purchases.getProducts({productIdentifiers:ids});
      if(active){setProducts(Object.fromEntries(result.products.map(p=>[map[p.identifier.split(':')[0]],p])));setMessage('');}
    }catch{if(active)setMessage('상품 설정을 확인하지 못했어요. 잠시 후 다시 열어 주세요.');}
  })();return()=>{active=false;};},[isPreview]);
  const buy=async(id:string)=>{
    if(isPreview||busy||!products[id])return;setBusy(true);
    try{await purchaseService.purchaseV6Product(products[id]);window.dispatchEvent(new Event('ttok:usage-updated'));onClose();}
    catch(e:any){if(!e?.userCancelled)setMessage('구매를 완료하지 못했어요. 스토어 결제 상태를 확인해 주세요.');}
    finally{setBusy(false);}
  };
  return createPortal(<div className="paywall-overlay fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-label="크레딧 요금제" className="paywall-card w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-5 text-slate-800">
      <div className="flex items-center justify-between"><p className="text-sm font-black text-blue-600">똑 요금제</p><button aria-label="닫기" disabled={busy} onClick={onClose} className="min-h-11 px-3 text-2xl">×</button></div>
      <h2 className="mt-2 text-2xl font-black tracking-tight">내 공부에 맞는 플랜</h2>
      <p className="mt-2 mb-5 text-sm text-slate-500">필요한 만큼, 똑과 함께 공부해요.</p>
      {isPreview&&<p role="status" className="mb-4 rounded-xl bg-blue-50 p-2 text-xs text-blue-700">결제 화면 미리보기 · 실제로 결제되지 않아요.</p>}
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-slate-50 p-4"><div><h3 className="font-bold">무료</h3><p className="mt-1 text-sm text-slate-500">매일 500크레딧</p></div><span className="font-bold">0원</span></div>
      <div role="radiogroup" aria-label="구독 요금제" className="space-y-3">
      {plans.map(p=><button type="button" role="radio" aria-checked={selected===p.id} key={p.id} onClick={()=>setSelected(p.id)} disabled={busy} className={`flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left transition-colors ${selected===p.id?'border-blue-600 bg-blue-50':'border-slate-100 bg-white'}`}><div><h3 className="font-black">{p.name}</h3><p className="mt-1 text-sm text-slate-500">월 {p.credits.toLocaleString()}크레딧</p></div><div className="text-right"><p className="font-black">{products[p.id]?.priceString || (isPreview ? `${p.price.toLocaleString()}원` : '가격 확인 중')}</p><p className="mt-1 text-xs text-slate-400">매월</p></div></button>)}
      </div>
      <p className="my-4 text-xs leading-relaxed text-slate-500">AI 사용량에 따라 차감돼요. 무료 크레딧은 매일 한국 시간 자정, 유료 크레딧은 결제 갱신 시 충전돼요.</p>
      <button disabled={isPreview||busy||!products[selected]} onClick={()=>void buy(selected)} className="min-h-12 w-full rounded-2xl bg-blue-600 font-bold text-white disabled:opacity-60">{isPreview?`${plans.find(p=>p.id===selected)?.name} 구독하기 · 미리보기`:busy?'결제 처리 중…':products[selected]?'구독하기':'상품 준비 중'}</button>
      {message&&<p role="status" className="text-sm">{message}</p>}
      <p className="mt-4 text-xs text-slate-500">매월 자동 갱신됩니다. 최종 가격은 스토어 결제창에서 확인하세요. 유료 크레딧은 결제 주기 종료 시 만료되며 이월되지 않아요. 구독 관리에서 해지할 수 있어요.</p>
    </section></div>,document.body);
}
