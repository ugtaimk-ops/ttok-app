import { useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import BackButton from "./BackButton";
import CalendarDatePicker from "./CalendarDatePicker";
import { useScreenBack } from "../lib/screenBack";
import { getTodayDateString } from "../lib/api";
import type { ScheduleItem } from "../types";

interface ExamPlannerProps {
  schedules: ScheduleItem[];
  onAddSchedule: (schedule: Omit<ScheduleItem, "id">) => void;
  onDeleteSchedule: (id: string) => void;
  onUpdateSchedule: (schedule: ScheduleItem) => void;
  darkMode: boolean;
}

const dayDifference = (date: string) => {
  const today = new Date(`${getTodayDateString()}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

const planDays = [
  { day: "D-5", title: "개념 정리", tasks: ["시험 범위의 핵심 개념을 읽고 요약하기", "중요한 공식과 용어를 따로 적기"] },
  { day: "D-4", title: "기본 문제", tasks: ["교과서와 수업 자료의 기본 문제 풀기", "틀린 문제의 개념 다시 확인하기"] },
  { day: "D-3", title: "실전 연습", tasks: ["시간을 재며 문제 풀기", "자주 틀리는 유형을 오답노트에 모으기"] },
  { day: "D-2", title: "약점 보완", tasks: ["오답노트의 문제를 답을 보지 않고 다시 풀기", "헷갈리는 개념을 말로 설명해 보기"] },
  { day: "D-1", title: "최종 점검", tasks: ["핵심 요약과 실수하기 쉬운 부분만 복습하기", "준비물을 챙기고 충분히 쉬기"] },
];

export default function ExamPlanner({ schedules, onAddSchedule, onDeleteSchedule, onUpdateSchedule, darkMode }: ExamPlannerProps) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(getTodayDateString());
  const [scope, setScope] = useState("");
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editDate, setEditDate] = useState("");
  const [deleting, setDeleting] = useState<ScheduleItem | null>(null);
  const [plannedExamId, setPlannedExamId] = useState<string | null>(null);
  const exams = schedules.filter(item => item.type === "exam").sort((a, b) => a.date.localeCompare(b.date));
  const plannedExam = exams.find(item => item.id === plannedExamId);
  const cardClass = `rounded-[24px] sm:rounded-[32px] border p-5 sm:p-6 ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`;
  const inputClass = "w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand";

  const addExam = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !subject.trim() || !date) return;
    onAddSchedule({
      title: `${subject.trim()} 단원 지필평가 (${title.trim()})`,
      subject: subject.trim(),
      date,
      dueDate: date,
      criteria: scope.trim() ? `시험 범위: ${scope.trim()}` : "지필평가",
      supplies: "컴퓨터용 사인펜, 필기구",
      submissionMethod: "지필 고사",
      presentationTime: "",
      type: "exam",
    });
    setTitle("");
    setSubject("");
    setScope("");
  };

  const startEdit = (item: ScheduleItem) => {
    setEditing(item);
    setEditTitle(item.title);
    setEditSubject(item.subject);
    setEditDate(item.date);
  };

  const saveEdit = () => {
    if (!editing || !editTitle.trim() || !editSubject.trim() || !editDate) return;
    onUpdateSchedule({ ...editing, title: editTitle.trim(), subject: editSubject.trim(), date: editDate, dueDate: editDate });
    setEditing(null);
  };

  useScreenBack(() => {
    if (deleting) { setDeleting(null); return true; }
    if (editing) { setEditing(null); return true; }
    if (plannedExamId) { setPlannedExamId(null); return true; }
    return false;
  }, true, 10);

  return (
    <div className="space-y-5">
      <div className="text-left">
        <h2 className="text-fluid-xl font-black text-slate-800 dark:text-slate-100">지필·수행 학습 계획</h2>
        <p className="text-fluid-sm text-slate-500 mt-1">시험 일정을 등록하고 과목별 준비 계획을 확인하세요.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <form onSubmit={addExam} className={`${cardClass} lg:col-span-5 space-y-4`}>
          <h3 className="font-extrabold">새 지필평가 일정 등록</h3>
          <label className="block text-sm font-bold text-slate-500">시험 평가명
            <input className={`${inputClass} mt-1.5`} required value={title} onChange={event => setTitle(event.target.value)} placeholder="예: 1학기 기말고사" />
          </label>
          <label className="block text-sm font-bold text-slate-500">시험 과목
            <input className={`${inputClass} mt-1.5`} required value={subject} onChange={event => setSubject(event.target.value)} placeholder="예: 역사" />
          </label>
          <label className="block text-sm font-bold text-slate-500">평가 날짜
            <CalendarDatePicker className={`${inputClass} mt-1.5 flex items-center justify-between text-left`} value={date} onChange={setDate} darkMode={darkMode} ariaLabel="평가 날짜" />
          </label>
          <label className="block text-sm font-bold text-slate-500">시험 범위 (선택)
            <input className={`${inputClass} mt-1.5`} value={scope} onChange={event => setScope(event.target.value)} placeholder="예: 교과서 3~5단원" />
          </label>
          <button data-ui="study-exam-add" type="submit" className="w-full min-h-12 bg-brand text-white font-extrabold rounded-2xl">시험 일정 등록</button>
        </form>

        <div className={`${cardClass} lg:col-span-7 space-y-4`}>
          <h3 className="font-extrabold flex items-center gap-2"><CalendarDays size={18} className="text-brand" /> 등록된 지필평가</h3>
          {exams.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">등록된 시험이 없어요. 시험 일정을 추가해 주세요.</p>
          ) : exams.map(item => {
            const remaining = dayDifference(item.date);
            return <div key={item.id} className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-3.5 flex items-center gap-3">
              <div className="min-w-0 flex-1 text-left">
                <h4 className="font-bold text-sm break-words">{item.title}</h4>
                <p className="text-xs text-slate-500 mt-1">{item.date} · {remaining < 0 ? "종료" : remaining === 0 ? "오늘" : `D-${remaining}`}</p>
                {item.criteria?.startsWith("시험 범위:") && <p className="text-xs text-slate-500 mt-1">{item.criteria}</p>}
              </div>
              <button data-ui="study-exam-edit" type="button" title="시험 일정 수정" aria-label="시험 일정 수정" onClick={() => startEdit(item)} className="min-w-10 min-h-10 rounded-xl text-brand flex items-center justify-center"><Pencil size={18} /></button>
              <button data-ui="study-exam-delete" type="button" title="시험 일정 삭제" aria-label="시험 일정 삭제" onClick={() => setDeleting(item)} className="min-w-10 min-h-10 rounded-xl text-rose-500 flex items-center justify-center"><Trash2 size={18} /></button>
              <button data-ui="study-plan-generate" type="button" onClick={() => setPlannedExamId(item.id)} className="px-3 min-h-10 rounded-xl bg-brand/10 text-brand text-xs font-bold">계획 보기</button>
            </div>;
          })}
        </div>
      </div>

      {plannedExam && <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="font-extrabold text-brand flex items-center gap-2"><Sparkles size={17} /> {plannedExam.subject} 5일 학습 계획</h3>
            <p className="text-xs text-slate-500 mt-1">{plannedExam.date} 시험을 준비하는 참고 계획입니다. 남은 날짜에 맞게 조정하세요.</p></div>
          <button type="button" onClick={() => setPlannedExamId(null)} className="text-sm text-slate-500">닫기</button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {planDays.map(day => <div key={day.day} className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-3 text-left">
            <strong className="text-brand text-sm">{day.day} · {day.title}</strong>
            {day.tasks.map(task => <p key={task} className="flex gap-1.5 text-xs text-slate-600 dark:text-slate-300 mt-2"><CheckCircle2 size={13} className="shrink-0 text-brand" />{task}</p>)}
          </div>)}
        </div>
      </motion.section>}

      {editing && <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className={`${cardClass} w-full max-w-md space-y-4`}>
          <BackButton label="취소" onClick={() => setEditing(null)} />
          <h3 className="font-extrabold">지필평가 일정 수정</h3>
          <input className={inputClass} aria-label="시험 평가명" value={editTitle} onChange={event => setEditTitle(event.target.value)} />
          <input className={inputClass} aria-label="시험 과목" value={editSubject} onChange={event => setEditSubject(event.target.value)} />
          <CalendarDatePicker className={`${inputClass} flex items-center justify-between text-left`} ariaLabel="평가 날짜" value={editDate} onChange={setEditDate} darkMode={darkMode} />
          <button data-ui="study-edit-save" type="button" onClick={saveEdit} className="w-full min-h-12 bg-brand text-white font-bold rounded-xl">저장하기</button>
        </div>
      </div>}

      {deleting && <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className={`${cardClass} w-full max-w-sm text-center space-y-4`}>
          <BackButton label="취소" onClick={() => setDeleting(null)} />
          <h3 className="font-extrabold">지필평가 일정 삭제</h3>
          <p className="text-sm text-slate-500">‘{deleting.title}’ 일정을 삭제할까요?</p>
          <div className="flex gap-3"><button type="button" onClick={() => setDeleting(null)} className="flex-1 min-h-12 rounded-xl bg-slate-100 dark:bg-slate-800">취소</button>
            <button data-ui="study-delete-confirm" type="button" onClick={() => { onDeleteSchedule(deleting.id); if (plannedExamId === deleting.id) setPlannedExamId(null); setDeleting(null); }} className="flex-1 min-h-12 rounded-xl bg-rose-500 text-white font-bold">삭제</button></div>
        </div>
      </div>}
    </div>
  );
}
