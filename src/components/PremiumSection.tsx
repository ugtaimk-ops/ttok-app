import { useState, useEffect } from "react";
import { Crown, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { UserProfile } from "../types";
import { purchaseService } from "../services/purchaseService";

interface PremiumSectionProps {
  user: UserProfile;
  darkMode: boolean;
}

const FREE_LIMIT = 50;
const PREMIUM_LIMIT = 150;

export default function PremiumSection({ user, darkMode }: PremiumSectionProps) {
  const [offering, setOffering] = useState<any>(null);
  const [isLoadingOffering, setIsLoadingOffering] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  const isPremium = user.isPremium === true;
  const limit = isPremium ? PREMIUM_LIMIT : FREE_LIMIT;
  const used = typeof user.aiUsageCount === "number" ? user.aiUsageCount : 0;

  useEffect(() => {
    if (isPremium) return;
    setIsLoadingOffering(true);
    purchaseService.getCurrentOffering()
      .then(setOffering)
      .finally(() => setIsLoadingOffering(false));
  }, [isPremium]);

  const handlePurchase = async () => {
    const pkg = offering?.availablePackages?.[0];
    if (!pkg) {
      setMessage("현재 구매 가능한 상품이 없어요. 잠시 후 다시 시도해 주세요.");
      setMessageIsError(true);
      return;
    }
    setIsPurchasing(true);
    setMessage(null);
    try {
      const customerInfo = await purchaseService.purchasePackage(pkg);
      if (purchaseService.isEntitlementActive(customerInfo)) {
        setMessage("구매가 완료됐어요! 반영까지 몇 초 정도 걸릴 수 있어요.");
        setMessageIsError(false);
      }
    } catch (err: any) {
      if (err?.userCancelled) {
        // Silent - the user just closed the purchase dialog.
      } else {
        setMessage("구매 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.");
        setMessageIsError(true);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    setMessage(null);
    try {
      const customerInfo = await purchaseService.restorePurchases();
      if (purchaseService.isEntitlementActive(customerInfo)) {
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

      <div className="flex items-center justify-between text-fluid-sm font-semibold">
        <span className="text-slate-400">현재 플랜</span>
        <span className={`font-bold flex items-center gap-1.5 ${isPremium ? "text-amber-500" : "text-slate-800 dark:text-slate-200"}`}>
          {isPremium && <Crown size={14} />} {isPremium ? "프리미엄" : "무료"}
        </span>
      </div>

      <div className="flex items-center justify-between text-fluid-sm font-semibold">
        <span className="text-slate-400">이번 달 AI 사용량</span>
        <span className="font-bold text-slate-800 dark:text-slate-200">{used} / {limit}회</span>
      </div>

      {message && (
        <p className={`text-fluid-xs font-semibold break-keep ${messageIsError ? "text-rose-500" : "text-emerald-500"}`}>
          {message}
        </p>
      )}

      {!isPremium && (
        <button
          onClick={handlePurchase}
          disabled={isPurchasing || isLoadingOffering}
          className={`w-full py-3.5 rounded-2xl flex items-center justify-center gap-1.5 text-fluid-sm font-black text-white transition-all cursor-pointer ${
            isPurchasing || isLoadingOffering ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.01] active:scale-[0.99]"
          } bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/25`}
        >
          {isPurchasing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          프리미엄 구독하기
        </button>
      )}

      <button
        onClick={handleRestore}
        disabled={isRestoring}
        className={`w-full py-2.5 rounded-2xl flex items-center justify-center gap-1.5 text-fluid-xs font-bold transition-colors cursor-pointer ${
          isRestoring ? "opacity-50 cursor-not-allowed" : ""
        } ${darkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"}`}
      >
        {isRestoring ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        구매 내역 복원
      </button>
    </div>
  );
}
