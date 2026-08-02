import { useState } from "react";
import { Crown, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { TodoItem, ScheduleItem } from "../types";
import { robustFetch } from "../lib/api";

interface AiReportCardProps {
  todos: TodoItem[];
  schedules: ScheduleItem[];
  darkMode: boolean;
}

export default function AiReportCard({ todos, schedules, darkMode }: AiReportCardProps) {
  const [report, setReport] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await robustFetch("/api/home/ai-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todos, schedules })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "AI 리포트를 생성하지 못했어요.");
      }
      const data = await res.json();
      setReport(data.report);
    } catch (err: any) {
      setError(err.message || "AI 리포트를 생성하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-5 sm:p-6 rounded-[24px] sm:rounded-[32px] border relative overflow-hidden ${
        darkMode
          ? "bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/20"
          : "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/60"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-fluid-sm font-black flex items-center gap-1.5">
          <Crown size={15} className="text-amber-500" />
          AI 리포트
          <span className="text-fluid-xs font-black text-white bg-amber-500 px-2 py-0.5 rounded-full">PRO</span>
        </h3>
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className={`p-2 rounded-full transition-colors cursor-pointer ${
            isLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-amber-500/10"
          } text-amber-600 dark:text-amber-400`}
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {error && <p className="text-fluid-xs font-semibold text-rose-500 break-keep">{error}</p>}

      {!error && report && (
        <p className="text-fluid-sm font-semibold leading-relaxed break-keep text-slate-700 dark:text-slate-200">
          {report}
        </p>
      )}

      {!error && !report && !isLoading && (
        <button
          onClick={handleGenerate}
          className="w-full py-3 rounded-2xl flex items-center justify-center gap-1.5 text-fluid-sm font-black text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/25 cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all"
        >
          <Sparkles size={15} />
          지금 뭘 하면 좋을지 물어보기
        </button>
      )}

      {isLoading && !report && (
        <p className="text-fluid-sm font-semibold text-slate-400">할 일과 일정을 살펴보고 있어요...</p>
      )}
    </motion.div>
  );
}
