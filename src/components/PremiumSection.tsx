import CreditPaywall from "./CreditPaywall";
import { useState, useEffect } from "react";
import { Crown, Loader2, RefreshCw, Sparkles, Settings2 } from "lucide-react";
import { UserProfile } from "../types";
import { purchaseService } from "../services/purchaseService";
import V6PaywallModal from "./V6PaywallModal";
import type { PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { FREE_MONTHLY_LIMIT, PREMIUM_MONTHLY_LIMIT, getKoreanMonthKey } from "../lib/usage";

interface PremiumSectionProps {
  user: UserProfile;
  darkMode: boolean;
  planPreview?: "free" | "pro";
}

export default function PremiumSection({ user, darkMode, planPreview }: PremiumSectionProps) {
  const [v6Products, setV6Products] = useState<Partial<Record<"basic" | "pro" | "plus", PurchasesStoreProduct>>>({});
  const [isLoadingOffering, setIsLoadingOffering] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isOpeningManage, setIsOpeningManage] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const localPreview = import.meta.env.DEV && !Capacitor.isNativePlatform();
  const isPremium = planPreview ? planPreview === "pro" : user.isPremium === true;
  const activePlanIds = user.aiQuota?.plans.map((plan) => plan.planId) || [];
  const creditLabel=user.aiCredits?.plans.includes('max')?'똑 Max':user.aiCredits?.plans.includes('pro')?'똑 Pro':user.aiCredits?.plans.includes('basic')?'똑 Basic':'무료';
  const currentPlanLabel = user.aiCredits ? creditLabel : planPreview === "pro" || activePlanIds.includes("pro") || (isPremium && !user.aiQuota)
    ? "똑 PRO" : activePlanIds.includes("plus") ? "AI Plus"
    : activePlanIds.includes("basic") ? "똑 Basic" : "일반";
  const limit = isPremium ? PREMIUM_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;
  const used = planPreview ? 0 : user.aiUsageMonth === getKoreanMonthKey() && typeof user.aiUsageCount === "number"
    ? user.aiUsageCount : 0;

  useEffect(() => {
    if (localPreview || planPreview) return;
    let active = true;
    setIsLoadingOffering(true);
    purchaseService.getV6Products()
      .then((products) => { if (active) setV6Products(products); })
      .catch(() => { if (active) setV6Products({}); })
      .finally(() => { if (active) setIsLoadingOffering(false); });
    return () => { active = false; };
  }, [localPreview, planPreview]);

  const handleOpenPaywall = async () => {
    if (localPreview) {
      setShowPaywall(true);
      return;
    }
    if(user.aiCredits) {setShowPaywall(true);return;}
    if (isLoadingOffering) return;
    setIsLoadingOffering(true);
    setMessage(null);
    try {
      // Refresh products each time so a transient Play failure is not cached.
      setV6Products(await purchaseService.getV6Products());
      setShowPaywall(true);
    } catch (error) {
      setV6Products({});
      setShowPaywall(true);
      setMessage("Google Play 상품 정보를 아직 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      setMessageIsError(true);
    } finally {
      setIsLoadingOffering(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsOpeningManage(true);
    try {
      await purchaseService.openManageSubscription();
    } catch (error) {
      console.error("Could not open subscription management:", error);
      setMessage("구독 관리 화면을 열지 못했어요. Play 스토어의 정기 결제 메뉴에서 확인해 주세요.");
      setMessageIsError(true);
    } finally {
      setIsOpeningManage(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    setMessage(null);
    try {
      const customerInfo = await purchaseService.restorePurchases();
      if (purchaseService.hasActiveV6Entitlement(customerInfo)) {
        window.dispatchEvent(new Event("ttok:usage-updated"));
        setMessage("구매 내역을 복원했어요! 반영까지 몇 초 정도 걸릴 수 있어요.");
        setMessageIsError(false);
      } else {
        setMessage("복원할 구매 내역을 찾지 못했어요.");
        setMessageIsError(true);
      }
    } catch (err) {
      setMessage("복원 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.");
      setMessageIsError(true);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className={`p-5 sm:p-6 rounded-[24px] sm:rounded-[32px] border ${
      darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
    } shadow-sm space-y-4 text-left`}>
      <h3 className="text-fluid-xs font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Crown size={14} /> 요금제
      </h3>
      {planPreview && <p className="text-fluid-xs font-bold text-slate-500">요금제 미리보기 · 실제 결제 상태는 변경되지 않아요.</p>}

      <div className="flex items-center justify-between text-fluid-sm font-semibold">
        <span className="text-slate-400">현재 플랜</span>
        <span className={`font-bold flex items-center gap-1.5 ${isPremium ? "text-amber-500" : "text-slate-800 dark:text-slate-200"}`}>
          {isPremium && <Crown size={14} />} {currentPlanLabel}
        </span>
      </div>

      <div className="flex items-center justify-between text-fluid-sm font-semibold">
        <span className="text-slate-400">{user.aiCredits ? "남은 AI 크레딧" : planPreview ? "AI 이용권 미리보기" : user.aiQuota ? "AI 이용권 잔여" : "이번 달 AI 사용량"}</span>
        <span className="font-bold text-slate-800 dark:text-slate-200">
          {user.aiCredits ? `${user.aiCredits.balance.toLocaleString()} 크레딧` : planPreview ? planPreview === "pro" ? "결제 주기당 50회" : "하루 1회" : user.aiQuota ? `${user.aiQuota.subscriptionRemaining}회` : `${used} / ${limit}회`}
        </span>
      </div>
      {user.aiQuota && !planPreview && <div className="space-y-1 text-fluid-xs text-slate-500">
        {user.aiQuota.mode === "free" && <p>오늘 무료 AI {user.aiQuota.freeRemaining}회 남음</p>}
        {user.aiQuota.plans.map((plan) => <p key={plan.planId}>
          {({ basic: "똑 Basic", pro: "똑 Pro", plus: "AI Plus" })[plan.planId]}: {plan.total}회 중 {plan.remaining}회 남음
        </p>)}
        {user.aiQuota.rewardRemaining > 0 && <p>광고 보상 이용권: {user.aiQuota.rewardRemaining}회</p>}
      </div>}

      {message && (
        <p className={`text-fluid-xs font-semibold break-keep ${messageIsError ? "text-rose-500" : "text-emerald-500"}`}>
          {message}
        </p>
      )}

      {(
        <button data-ui="premium-subscribe"
          onClick={handleOpenPaywall}
          disabled={!localPreview && (isLoadingOffering || !!planPreview)}
          className={`w-full py-3.5 rounded-2xl flex items-center justify-center gap-1.5 text-fluid-sm font-black text-white transition-all cursor-pointer ${
            isLoadingOffering ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.01] active:scale-[0.99]"
          } bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/25`}
        >
          <Sparkles size={16} />
          {localPreview ? "요금제 화면 미리보기" : "요금제 보기 / AI 이용권 추가"}
        </button>
      )}
      {(isPremium || !!user.aiQuota?.plans.length || !!user.aiCredits?.plans.length) && (
        <button data-ui="premium-manage"
          onClick={handleManageSubscription}
          disabled={isOpeningManage || !!planPreview}
          className={`w-full py-3.5 rounded-2xl flex items-center justify-center gap-1.5 text-fluid-sm font-black transition-all cursor-pointer border-2 ${
            isOpeningManage ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.01] active:scale-[0.99]"
          } ${darkMode ? "border-slate-700 text-slate-200" : "border-slate-200 text-slate-700"}`}
        >
          {isOpeningManage ? <Loader2 size={16} className="animate-spin" /> : <Settings2 size={16} />}
          구독 관리 / 해지
        </button>
      )}

      {!planPreview && <button data-ui="premium-restore"
        onClick={handleRestore}
        disabled={isRestoring}
        className={`w-full py-2.5 rounded-2xl flex items-center justify-center gap-1.5 text-fluid-xs font-bold transition-colors cursor-pointer ${
          isRestoring ? "opacity-50 cursor-not-allowed" : ""
        } ${darkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"}`}
      >
        {isRestoring ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        구매 내역 복원
      </button>}

      {showPaywall && user.aiCredits && <CreditPaywall onClose={()=>setShowPaywall(false)} />}
      {showPaywall && !user.aiCredits && (
        <V6PaywallModal products={localPreview ? {} : v6Products} previewOnly={localPreview}
          purchaseReady={!!user.aiQuota}
          activePlans={planPreview === "pro" ? ["pro"] : planPreview === "free" ? [] : user.aiQuota?.plans.map((plan) => plan.planId) || []}
          onClose={() => setShowPaywall(false)}
          onPurchased={() => { setMessage("결제가 접수됐어요. 구독 상태가 반영되면 이용권이 표시됩니다."); setMessageIsError(false); }} />
      )}
    </div>
  );
}
