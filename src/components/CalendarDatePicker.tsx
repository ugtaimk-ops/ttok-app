import { useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useScreenBack } from "../lib/screenBack";

interface CalendarDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  darkMode: boolean;
  className?: string;
  ariaLabel: string;
}

const toDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
    ? date : new Date();
};

const toValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function CalendarDatePicker({ value, onChange, darkMode, className, ariaLabel }: CalendarDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => toDate(value));
  useScreenBack(() => { setOpen(false); return true; }, open, 90);

  const openCalendar = () => {
    setView(toDate(value));
    setOpen(true);
  };
  const changeMonth = (offset: number) => setView(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  const firstDay = new Date(view.getFullYear(), view.getMonth(), 1);
  const days = Array.from({ length: 42 }, (_, index) => new Date(view.getFullYear(), view.getMonth(), index + 1 - firstDay.getDay()));
  const today = toValue(new Date());

  return <>
    <button type="button" aria-label={ariaLabel} onClick={openCalendar} className={className || "w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-left text-fluid-base flex items-center justify-between"}>
      <span>{value || "날짜 선택"}</span><Calendar size={18} className="text-brand shrink-0" />
    </button>
    {open && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 safe-top" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-label={ariaLabel} className={`w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[32px] border p-4 sm:p-6 shadow-2xl ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-2"><Calendar className="text-brand" size={16} /><span className="text-sm font-extrabold">{ariaLabel}</span></div>
          <button type="button" aria-label="달력 닫기" onClick={() => setOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500"><X size={18} /></button>
        </div>
        <div className="flex items-center justify-center gap-2 py-3">
          <button type="button" aria-label="이전 달" onClick={() => changeMonth(-1)} className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 border border-slate-100 dark:border-slate-800"><ChevronLeft size={18} /></button>
          <span className="min-w-[110px] text-center text-sm font-black">{view.getFullYear()}년 {view.getMonth() + 1}월</span>
          <button type="button" aria-label="다음 달" onClick={() => changeMonth(1)} className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 border border-slate-100 dark:border-slate-800"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => <span key={day} className={`text-[10px] font-black ${index === 0 ? "text-rose-500" : index === 6 ? "text-blue-500" : "text-slate-400"}`}>{day}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map(day => {
            const dateValue = toValue(day);
            const currentMonth = day.getMonth() === view.getMonth();
            return <button key={dateValue} type="button" aria-label={dateValue} aria-pressed={value === dateValue} onClick={() => { onChange(dateValue); setOpen(false); }}
              className={`relative aspect-square flex items-center justify-center rounded-full text-xs font-bold ${!currentMonth ? "opacity-40 text-slate-400" : day.getDay() === 0 ? "text-rose-500" : day.getDay() === 6 ? "text-blue-500" : "text-slate-700 dark:text-slate-200"} ${dateValue === today ? "text-amber-500 dark:text-amber-400" : ""}`}>
              {value === dateValue && <span className="absolute inset-1 rounded-full border-2 border-blue-500 dark:border-blue-400" />}
              <span className="relative">{day.getDate()}</span>
            </button>;
          })}
        </div>
      </div>
    </div>, document.body)}
  </>;
}
