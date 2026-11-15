import { useState } from "react";
import { createPortal } from "react-dom";
import type { PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";
import { purchaseService } from "../services/purchaseService";
import { useScreenBack } from "../lib/screenBack";

type Plan = "basic" | "pro" | "plus";
type Products = Partial<Record<Plan, PurchasesStoreProduct>>;
const PLANS: Array<{ id: Plan; title: string; quota: number; targetPrice: string; detail: string }> = [
  { id: "basic", title: "AI Basic", quota: 30, targetPrice: "₩1,900", detail: "AI 이용권" },
  { id: "pro", title: "똑 Pro", quota: 50, targetPrice: "₩3,900", detail: "AI 추천 기능 이용" },
  { id: "plus", title: "AI Plus", quota: 70, targetPrice: "₩3,900", detail: "AI 이용권" },
];

export default function V6PaywallModal({ products, activePlans, previewOnly = false, purchaseReady = false, onClose, onPurchased }: {
  products: Products; activePlans: Plan[]; previewOnly?: boolean; purchaseReady?: boolean; onClose: () => void; onPurchased: () => void;
}) {
  const [busy, setBusy] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  useScreenBack(() => { if (!busy) onClose(); return true; }, true, 100);

  const buy = async (id: Plan) => {
    const product = products[id];
    if (previewOnly || !purchaseReady || !product || busy) return;
    setBusy(id);
    setError("");
    try {
      await purchaseService.purchaseV6Product(product);
      window.dispatchEvent(new Event("ttok:usage-updated"));
      onPurchased();
      onClose();
    } catch (cause: any) {
      if (!cause?.userCancelled) setError("구매를 완료하지 못했어요. Play 스토어의 결제 상태를 확인해 주세요.");
    } finally { setBusy(null); }
  };

  return createPortal(
    <div role="presentation" className="paywall-overlay fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <section role="dialog" aria-modal="true" aria-label="똑 요금제" onClick={(e) => e.stopPropagation()}
        className="paywall-card w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-5 text-slate-800 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black">똑 요금제</h2>
          <button type="button" className="min-h-11 px-3 rounded-xl font-bold" onClick={onClose} disabled={!!busy}>닫기</button>
        </div>
        <p className="mt-2 text-sm text-slate-500">Pro와 AI Basic 또는 AI Plus를 함께 이용할 수 있어요. 각 구독은 별도로 결제됩니다.</p>
        {previewOnly && <p role="status" className="mt-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
          화면 미리보기예요. 실제 가격 확인과 결제는 Play 스토어에서 설치한 Android 앱에서 할 수 있어요.
        </p>}
        {!previewOnly && !purchaseReady && <p role="status" className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          새 요금제 서버 적용을 기다리고 있어요. 적용 전에는 결제할 수 없어요.
        </p>}
        <div className="mt-5 space-y-3">
          {PLANS.map((plan) => {
            const product = products[plan.id];
            const alreadyActive = activePlans.includes(plan.id);
            const incompatible = (plan.id === "basic" && activePlans.includes("plus")) ||
              (plan.id === "plus" && activePlans.includes("basic"));
            return <div key={plan.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black">{plan.title}</h3>
                  <p className="text-sm text-slate-600">결제 주기당 AI {plan.quota}회 · {plan.detail}</p>
                </div>
                <span className="font-black whitespace-nowrap">{product?.priceString || (previewOnly ? plan.targetPrice : "Play에서 가격 확인")}</span>
              </div>
              <button type="button" disabled={previewOnly || !purchaseReady || !product || !!busy || alreadyActive || incompatible} onClick={() => void buy(plan.id)}
                className="mt-3 w-full min-h-12 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">
                {previewOnly ? "앱에서 결제 가능" : !purchaseReady ? "서버 적용 대기 중" : busy === plan.id ? "결제 처리 중…" : alreadyActive ? "이용 중" : incompatible ? "기존 AI 추가 구독 해지 후 변경" : product ? `${plan.title} 구독하기` : "상품 준비 중"}
              </button>
            </div>;
          })}
        </div>
        {error && <p role="alert" className="mt-4 text-sm font-semibold text-rose-600">{error}</p>}
        <p className="mt-4 text-xs text-slate-500">표시된 목표 가격은 Play에 등록된 실제 결제 가격과 다를 수 있어요. 결제 전 Play 결제창의 금액을 확인해 주세요.</p>
      </section>
    </div>, document.body,
  );
}
