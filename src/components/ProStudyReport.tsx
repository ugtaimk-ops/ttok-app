import { useEffect, useMemo, useState } from "react";
import type { DailyStat } from "@ddok/shared-study";
import { sharedStudy } from "../services/sharedStudy";

const MINUTE = 60;
const formatTime = (seconds: number) => `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / MINUTE)}분`;
const kstDay = (date: Date) => new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export default function ProStudyReport({ uid, darkMode }: { uid: string; darkMode: boolean }) {
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (sharedStudy.auth.currentUser?.uid !== uid) return;
    return sharedStudy.listen<DailyStat>("dailyStats", setStats, () => setError("공부 기록을 불러오지 못했어요."));
  }, [uid]);

  const report = useMemo(() => {
    const today = kstDay(new Date());
    const start = new Date(`${today}T00:00:00Z`);
    const weekday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - weekday);
    const lastWeek = new Date(start);
    lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
    const startKey = kstDay(start);
    const lastKey = kstDay(lastWeek);
    const thisWeek = stats.filter((s) => s.dateKey >= startKey && s.dateKey <= today);
    const previous = stats.filter((s) => s.dateKey >= lastKey && s.dateKey < startKey);
    const thisMonth = stats.filter((s) => s.dateKey >= today.slice(0, 7) + "-01" && s.dateKey <= today);
    const total = thisWeek.reduce((n, s) => n + Math.max(0, s.focusSeconds || 0), 0);
    const prior = previous.reduce((n, s) => n + Math.max(0, s.focusSeconds || 0), 0);
    const monthTotal = thisMonth.reduce((n, s) => n + Math.max(0, s.focusSeconds || 0), 0);
    const todayTotal = thisWeek.find((s) => s.dateKey === today)?.focusSeconds || 0;
    const subjects: Record<string, number> = {};
    for (const day of thisWeek) for (const [subject, seconds] of Object.entries(day.subjectSeconds || {})) {
      subjects[subject] = (subjects[subject] || 0) + Math.max(0, seconds);
    }
    const top = Object.entries(subjects).sort((a, b) => b[1] - a[1])[0];
    return { total, prior, monthTotal, todayTotal, top,
      activeDays: thisWeek.filter((s) => s.focusSeconds > 0).length };
  }, [stats]);

  return <section className={`rounded-[24px] p-5 border shadow-sm ${darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-100 text-slate-800"}`}>
    <h3 className="font-black text-lg">이번 주 공부 리포트 <span className="text-xs text-blue-500">PRO</span></h3>
    {error ? <p role="status" className="mt-2 text-sm text-rose-500">{error}</p> : report.total === 0 ?
      <p className="mt-2 text-sm text-slate-500">똑타임 공부 기록이 쌓이면 주간 통계가 표시돼요.</p> : <div className="mt-3 space-y-1 text-sm">
        <p>이번 주 집중 시간 <strong>{formatTime(report.total)}</strong> · 공부한 날 {report.activeDays}일</p>
        <p>오늘 <strong>{formatTime(report.todayTotal)}</strong> · 이번 달 <strong>{formatTime(report.monthTotal)}</strong></p>
        {report.top && <p>가장 오래 공부한 과목 <strong>{report.top[0]}</strong> ({formatTime(report.top[1])})</p>}
        {report.prior > 0 && <p>지난주보다 {report.total >= report.prior ? "늘어난" : "줄어든"} 시간 <strong>{formatTime(Math.abs(report.total - report.prior))}</strong></p>}
        <p>다음 주 연습 목표: 하루 평균 <strong>{formatTime(Math.ceil(report.total / 7))}</strong>부터 시작해 보세요.</p>
        <p className="text-xs text-slate-500">똑타임에 저장된 공부 시간으로 계산했어요.</p>
      </div>}
  </section>;
}
