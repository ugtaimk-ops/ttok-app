import { useState, useRef, useEffect, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export interface GlassSelectOption {
  value: string;
  label: ReactNode;
}

export const HOUR_OPTIONS: GlassSelectOption[] = Array.from({ length: 24 }, (_, i) => {
  const h = String(i).padStart(2, "0");
  return { value: h, label: `${h}시` };
});

export const MINUTE_OPTIONS: GlassSelectOption[] = Array.from({ length: 12 }, (_, i) => {
  const m = String(i * 5).padStart(2, "0");
  return { value: m, label: `${m}분` };
});

interface GlassSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: GlassSelectOption[];
  darkMode: boolean;
  placeholder?: string;
  triggerClassName?: string;
  align?: "left" | "right";
}

/**
 * Custom dropdown replacing native <select>, which on Android renders as the
 * OS's own plain system picker (clashing hard with the app's glass/blur
 * visual language) instead of anything CSS can style.
 */
export default function GlassSelect({
  value,
  onChange,
  options,
  darkMode,
  placeholder = "선택",
  triggerClassName,
  align = "left"
}: GlassSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={
          triggerClassName ||
          `w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl font-bold text-fluid-base transition-all cursor-pointer border ${
            darkMode
              ? "bg-slate-900/60 backdrop-blur-xl border-slate-700/60 text-slate-100 hover:bg-slate-900/80"
              : "bg-white/60 backdrop-blur-xl border-white/70 text-slate-700 hover:bg-white/80"
          }`
        }
      >
        <span className={selected ? "" : "text-slate-400 font-normal"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute z-30 mt-2 max-h-64 min-w-full overflow-y-auto rounded-2xl border shadow-2xl ${
              align === "right" ? "right-0" : "left-0"
            } ${
              darkMode
                ? "bg-slate-900/85 backdrop-blur-2xl border-slate-700/60 shadow-black/40"
                : "bg-white/85 backdrop-blur-2xl border-white/80 shadow-slate-300/40"
            }`}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-fluid-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  opt.value === value
                    ? "bg-brand text-white"
                    : darkMode
                      ? "text-slate-200 hover:bg-slate-800/70"
                      : "text-slate-700 hover:bg-slate-100/80"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
