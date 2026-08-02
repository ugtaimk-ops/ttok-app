import { useState } from "react";
import { X, Crown, Check, Loader2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { purchaseService } from "../services/purchaseService";

interface PaywallModalProps {
  offering: any;
  darkMode: boolean;
  onClose: () => void;
  onPurchaseComplete: (message: string) => void;
}

const FEATURES = [
  { label: "월 AI 사용량", free: "50회", pro: "150회" },
  { label: "발표 대본 생성", free: "O", pro: "O" },
  { label: "AI 발표 분석", free: "O", pro: "O" },
  { label: "학습 도우미(요약·퀴즈·질문)", free: "O", pro: "O" },
];

function findPackage(offering: any, type: "MONTHLY" | "ANNUAL") {
  return offering?.availablePackages?.find((p: any) => p.packageType === type)
    ?? offering?.availablePackages?.find((p: any) => p.identifier?.toLowerCase().includes(type === "MONTHLY" ? "month" : "annual") || p.identifier?.toLowerCase().includes(type === "MONTHLY" ? "month" : "year"));
}

export default function PaywallModal({ offering, darkMode, onClose, onPurchaseComplete }: PaywallModalProps) {
  const monthlyPkg = findPackage(offering, "MONTHLY");
  const annualPkg = findPackage(offering, "ANNUAL");
  const fallbackPkg = offering?.availablePackages?.[0];

  const [selected, setSelected] = useState<"monthly" | "annual">(annualPkg ? "annual" : "monthly");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPkg = selected === "annual" ? (annualPkg ?? fallbackPkg) : (monthlyPkg ?? fallbackPkg);

  const handlePurchase = async () => {
    if (!selectedPkg) {
      setError("현재 구매 가능한 상품이 없어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setIsPurchasing(true);
    setError(null);
    try {
      const customerInfo = await purchaseService.purchasePackage(selectedPkg);
      if (purchaseService.isEntitlementActive(customerInfo)) {
        onPurchaseComplete("구매가 완료됐어요! 반영까지 몇 초 정도 걸릴 수 있어요.");
        onClose();
      }
    } catch (err: any) {
      if (!err?.userCancelled) {
        setError("구매 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full sm:max-w-md sm:rounded-[32px] rounded-t-[32px] p-6 sm:p-8 max-h-[90vh] overflow-y-auto ${
            darkMode ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800"
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
                <Crown size={20} />
              </div>
              <h2 className="text-fluid-xl font-black tracking-tight">똑 PRO</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {/* Comparison table */}
          <div className={`rounded-2xl border overflow-hidden mb-5 ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
            <div className={`grid grid-cols-3 text-fluid-xs font-black uppercase tracking-wide px-3 py-2 ${darkMode ? "bg-slate-800/60 text-slate-400" : "bg-slate-50 text-slate-500"}`}>
              <span>항목</span>
              <span className="text-center">일반</span>
              <span className="text-center text-amber-500">PRO</span>
            </div>
            {FEATURES.map((f) => (
              <div key={f.label} className={`grid grid-cols-3 items-center px-3 py-2.5 text-fluid-xs font-semibold border-t ${darkMode ? "border-slate-800/80" : "border-slate-100"}`}>
                <span className="break-keep">{f.label}</span>
                <span className="text-center text-slate-400">{f.free}</span>
                <span className="text-center font-black text-amber-500 flex items-center justify-center gap-0.5">
                  {f.pro === "O" ? <Check size={14} /> : f.pro}
                </span>
              </div>
            ))}
          </div>

          {/* Plan selector */}
          <div className="space-y-2.5 mb-5">
            <button
              onClick={() => setSelected("annual")}
              className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                selected === "annual"
                  ? "border-amber-500 bg-amber-500/10"
                  : darkMode ? "border-slate-800 bg-slate-800/40" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-fluid-sm">연간 구독</p>
                  <p className="text-fluid-xs text-slate-400 font-semibold">29,000원 / 년 (월 2,417원)</p>
                </div>
                <span className="text-fluid-xs font-black text-white bg-amber-500 px-2 py-1 rounded-full">17% 할인</span>
              </div>
            </button>

            <button
              onClick={() => setSelected("monthly")}
              className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                selected === "monthly"
                  ? "border-amber-500 bg-amber-500/10"
                  : darkMode ? "border-slate-800 bg-slate-800/40" : "border-slate-200 bg-slate-50"
              }`}
            >
              <p className="font-black text-fluid-sm">월간 구독</p>
              <p className="text-fluid-xs text-slate-400 font-semibold">2,900원 / 월</p>
            </button>
          </div>

          {error && <p className="text-fluid-xs font-semibold text-rose-500 mb-3 break-keep">{error}</p>}

          <button
            onClick={handlePurchase}
            disabled={isPurchasing}
            className={`w-full py-4 rounded-2xl flex items-center justify-center gap-1.5 text-fluid-sm font-black text-white transition-all cursor-pointer ${
              isPurchasing ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.01] active:scale-[0.99]"
            } bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/25`}
          >
            {isPurchasing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            똑 PRO 구독하기
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
