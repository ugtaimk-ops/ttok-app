import { createPortal } from "react-dom";
import BackButton from "./BackButton";
import { useScreenBack } from "../lib/screenBack";
import { useEffect, useState } from "react";
import { Crown, Check, Loader2, Sparkles } from "lucide-react";
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
  { label: "AI 추천 기능", free: "X", pro: "O" },
];

function findPackage(offering: any, type: "MONTHLY" | "ANNUAL") {
  return offering?.availablePackages?.find((p: any) => p.packageType === type)
    ?? offering?.availablePackages?.find((p: any) => p.identifier?.toLowerCase().includes(type === "MONTHLY" ? "month" : "annual") || p.identifier?.toLowerCase().includes(type === "MONTHLY" ? "month" : "year"));
}

export default function PaywallModal({ offering, darkMode, onClose, onPurchaseComplete }: PaywallModalProps) {
  const monthlyPkg = findPackage(offering, "MONTHLY");
  const annualPkg = findPackage(offering, "ANNUAL");


  const [selected, setSelected] = useState<"monthly" | "annual">(annualPkg ? "annual" : "monthly");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPkg = selected === "annual" ? annualPkg : monthlyPkg;

  const close = () => { if (!isPurchasing) onClose(); };
  useScreenBack(() => { close(); return true; }, true, 100);
  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [isPurchasing]);
  const handlePurchase = async () => {
    if (isPurchasing) return;
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

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="paywall-overlay fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={close}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-modal="true"
          aria-label="똑 PRO 구독"
          onClick={(e) => e.stopPropagation()}
          className={`paywall-card w-full max-w-md rounded-[28px] flex flex-col min-h-0 overflow-hidden ${
            darkMode ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800"
          }`}
        >
          <div className="flex shrink-0 items-center gap-3 p-4 sm:p-5">
            <BackButton label="취소" onClick={close} disabled={isPurchasing} />
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
                <Crown size={20} />
              </div>
              <h2 className="text-fluid-xl font-black tracking-tight">똑 PRO</h2>
            </div>

          </div>

          <div className="min-h-0 overflow-y-auto px-4 sm:px-5 overscroll-contain">
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
              disabled={!annualPkg || isPurchasing}
              onClick={() => setSelected("annual")}
              className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                selected === "annual"
                  ? "border-amber-500 bg-amber-500/10"
                  : darkMode ? "border-slate-800 bg-slate-800/40" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-fluid-sm">연간 구독</p>
                  <p className="text-fluid-xs text-slate-400 font-semibold">{annualPkg ? `${annualPkg.product.priceString} / 년` : "현재 구매할 수 없어요"}</p>
                </div>

              </div>
            </button>

            <button
              disabled={!monthlyPkg || isPurchasing}
              onClick={() => setSelected("monthly")}
              className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                selected === "monthly"
                  ? "border-amber-500 bg-amber-500/10"
                  : darkMode ? "border-slate-800 bg-slate-800/40" : "border-slate-200 bg-slate-50"
              }`}
            >
              <p className="font-black text-fluid-sm">월간 구독</p>
              <p className="text-fluid-xs text-slate-400 font-semibold">{monthlyPkg ? `${monthlyPkg.product.priceString} / 월` : "현재 구매할 수 없어요"}</p>
            </button>
          </div>

          </div>
          <div className="shrink-0 p-4 sm:p-5 border-t border-slate-200/40">
          {error && <p className="text-fluid-xs font-semibold text-rose-500 mb-3 break-keep">{error}</p>}

          <button
            onClick={handlePurchase}
            disabled={isPurchasing || !selectedPkg}
            className={`w-full py-4 rounded-2xl flex items-center justify-center gap-1.5 text-fluid-sm font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
              isPurchasing ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.01] active:scale-[0.99]"
            } bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/25`}
          >
            {isPurchasing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            똑 PRO 구독하기
          </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>, document.body
  );
}
