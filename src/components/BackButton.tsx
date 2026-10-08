import { ArrowLeft } from "lucide-react";
import { Capacitor } from "@capacitor/core";

export default function BackButton({ onClick, disabled = false, label = "뒤로가기", className = "" }: {
  onClick: () => void; disabled?: boolean; label?: string; className?: string;
}) {
  // Android already has a system Back control in its navigation bar.
  if (Capacitor.getPlatform() === "android") return null;
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
    className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white/90 px-2 text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer ${className}`}>
    <ArrowLeft size={20} /><span className="text-xs font-bold">{label === "취소" ? "취소" : "뒤로"}</span>
  </button>;
}
