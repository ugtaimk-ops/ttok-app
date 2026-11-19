import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Purchases} from '@revenuecat/purchases-capacitor';
import type {PurchasesStoreProduct} from '@revenuecat/purchases-capacitor';
import {purchaseService} from '../services/purchaseService';
import {auth} from '../lib/firebase';
import {robustFetch} from '../lib/api';
import {useScreenBack} from '../lib/screenBack';
const plans=[{id:'basic',name:'AI Basic',credits:30000,price:1900},{id:'pro',name:'똑 Pro',credits:100000,price:4900},{id:'max',name:'똑 Max',credits:300000,price:9900}];
export default function CreditPaywall({onClose}:{onClose:()=>void}){
  const [products,setProducts]=useState<Record<string,PurchasesStoreProduct>>({});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('상품을 불러오는 중이에요.');
  useScreenBack(()=>{if(!busy)onClose();return true;},true,100);
  useEffect(()=>{let active=true;void(async()=>{
    try{
      const uid=auth.currentUser?.uid;if(!uid)throw Error();
      await purchaseService.configure(uid);
      const response=await robustFetch('/api/credits/products');if(!response.ok)throw Error();
      const {products:map}=await response.json();
      const ids=Object.keys(map);if(!ids.length)throw Error();
      const result=await Purchases.getProducts({productIdentifiers:ids});
      if(active){setProducts(Object.fromEntries(result.products.map(p=>[map[p.identifier.split(':')[0]],p])));setMessage('');}
    }catch{if(active)setMessage('상품 설정을 확인하지 못했어요. 잠시 후 다시 열어 주세요.');}
  })();return()=>{active=false;};},[]);
  const buy=async(id:string)=>{
    if(busy||!products[id])return;setBusy(true);
    try{await purchaseService.purchaseV6Product(products[id]);window.dispatchEvent(new Event('ttok:usage-updated'));onClose();}
    catch(e:any){if(!e?.userCancelled)setMessage('구매를 완료하지 못했어요. 스토어 결제 상태를 확인해 주세요.');}
    finally{setBusy(false);}
  };
  return createPortal(<div className="paywall-overlay fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-label="크레딧 요금제" className="paywall-card w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-5 text-slate-800">
      <div className="flex justify-between"><h2 className="text-xl font-black">똑 AI 크레딧</h2><button disabled={busy} onClick={onClose} className="min-h-11 px-3">닫기</button></div>
      <p className="my-3 text-sm">무료 플랜은 매일 500크레딧을 제공해요. AI 사용량에 따라 크레딧이 차감돼요.</p>
      {plans.map(p=><div key={p.id} className="my-3 rounded-2xl border p-4"><h3 className="font-bold">{p.name}</h3><p>결제 주기당 {p.credits.toLocaleString()}크레딧</p><p>{products[p.id]?.priceString || `${p.price.toLocaleString()}원`} / 월</p><button disabled={busy||!products[p.id]} onClick={()=>void buy(p.id)} className="mt-3 min-h-12 w-full rounded-xl bg-blue-600 font-bold text-white disabled:opacity-40">{products[p.id]?'구독하기':'상품 준비 중'}</button></div>)}
      {message&&<p role="status" className="text-sm">{message}</p>}
      <p className="mt-4 text-xs text-slate-500">매월 자동 갱신됩니다. 최종 가격은 스토어 결제창에서 확인하세요. 유료 크레딧은 결제 주기 종료 시 만료되며 이월되지 않아요. 구독 관리에서 해지할 수 있어요.</p>
    </section></div>,document.body);
}
