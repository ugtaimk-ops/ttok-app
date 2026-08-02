import React, { useState, useEffect } from "react";
import { UserProfile, TodoItem, ScheduleItem } from "../types";
import { 
  CheckCircle2, 
  Circle, 
  Calendar, 
  Sparkles, 
  Award, 
  Plus, 
  Trash2, 
  Clock, 
  CheckSquare, 
  FileText, 
  BookOpen,
  ChevronRight,
  TrendingUp,
  Target,
  Zap,
  BookmarkCheck,
  Settings,
  Edit,
  X,
  Check,
  Pencil
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import GlassSelect from "./GlassSelect";
import AiReportCard from "./AiReportCard";

const SCHEDULE_TYPE_OPTIONS = [
  { value: "study", label: "공부 📚" },
  { value: "assessment", label: "수행평가 📝" },
  { value: "exam", label: "시험 ✏️" },
  { value: "homework", label: "숙제 🗂️" }
];

interface ShortcutItem {
  id: string;
  title: string;
  description: string;
  targetTab: string;
  iconType: "calendar" | "sparkles" | "bookOpen" | "award" | "settings";
  deepParams?: {
    assessmentMode?: "list" | "direct" | "photo";
    practiceSubTab?: "script" | "practice";
    studySubTab?: "helper" | "planner";
    studyHelperMode?: "summary" | "quiz" | "note" | "question";
  };
  featureId?: string;
}

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  {
    id: "sc_1",
    title: "수행평가 계획서 스캔",
    description: "사진 촬영/스캔으로 자동 일정 등록",
    targetTab: "assessment",
    iconType: "calendar",
    deepParams: { assessmentMode: "photo" },
    featureId: "assessment_photo"
  },
  {
    id: "sc_2",
    title: "AI 실시간 발표 실전 연습",
    description: "카메라와 마이크 피드백 정밀 분석 피드백",
    targetTab: "practice",
    iconType: "sparkles",
    deepParams: { practiceSubTab: "practice" },
    featureId: "practice_rehearsal"
  },
  {
    id: "sc_3",
    title: "교과 공부 AI 질문 & 요약",
    description: "교과 범위 요약 및 모르는 부분 질문하기",
    targetTab: "study",
    iconType: "bookOpen",
    deepParams: { studySubTab: "helper", studyHelperMode: "question" },
    featureId: "study_question"
  }
];

const TTOK_FEATURES: Omit<ShortcutItem, "featureId">[] = [
  {
    id: "assessment_photo",
    title: "수행평가 계획서 스캔",
    description: "사진 촬영/스캔으로 자동 일정 등록",
    targetTab: "assessment",
    iconType: "calendar",
    deepParams: { assessmentMode: "photo" }
  },
  {
    id: "assessment_direct",
    title: "수행평가 일정 수동 등록",
    description: "나의 수행평가 상세 요건 직접 추가",
    targetTab: "assessment",
    iconType: "calendar",
    deepParams: { assessmentMode: "direct" }
  },
  {
    id: "assessment_list",
    title: "수행평가 일정 목록",
    description: "등록된 과목별 스케줄과 기준 확인",
    targetTab: "assessment",
    iconType: "calendar",
    deepParams: { assessmentMode: "list" }
  },
  {
    id: "practice_script",
    title: "AI 발표 대본 맞춤 작성",
    description: "주제별 분량 맞춤 대본 및 개요 생성",
    targetTab: "practice",
    iconType: "sparkles",
    deepParams: { practiceSubTab: "script" }
  },
  {
    id: "practice_rehearsal",
    title: "AI 실시간 발표 실전 연습",
    description: "카메라와 마이크 피드백 정밀 분석 피드백",
    targetTab: "practice",
    iconType: "sparkles",
    deepParams: { practiceSubTab: "practice" }
  },
  {
    id: "study_question",
    title: "교과 공부 AI 질문 & 요약",
    description: "교과 범위 요약 및 모르는 부분 질문하기",
    targetTab: "study",
    iconType: "bookOpen",
    deepParams: { studySubTab: "helper", studyHelperMode: "question" }
  },
  {
    id: "study_quiz",
    title: "학습 내용 확인 쪽지시험",
    description: "학습한 텍스트 바탕 실전 AI 퀴즈 풀기",
    targetTab: "study",
    iconType: "bookOpen",
    deepParams: { studySubTab: "helper", studyHelperMode: "quiz" }
  },
  {
    id: "study_planner",
    title: "지필 및 수행 학습 계획",
    description: "과목별 세부 시험 범위 및 학습 스케줄링",
    targetTab: "study",
    iconType: "bookOpen",
    deepParams: { studySubTab: "planner" }
  },
  {
    id: "profile_page",
    title: "내 정보 및 학교 조회",
    description: "학습 목표 설정 및 소속 학교 급식 연동",
    targetTab: "profile",
    iconType: "award",
    deepParams: {}
  },
  {
    id: "settings_page",
    title: "학습 기본 환경 설정",
    description: "다크 모드 제어 및 전체 데이터 초기화",
    targetTab: "settings",
    iconType: "settings",
    deepParams: {}
  }
];

interface HomeScreenProps {
  user: UserProfile;
  todos: TodoItem[];
  schedules: ScheduleItem[];
  onToggleTodo: (id: string) => void;
  onAddTodo: (text: string, category: "homework" | "general" | "exam") => void;
  onDeleteTodo: (id: string) => void;
  darkMode: boolean;
  onChangeTab?: (tab: string, params?: { 
    assessmentMode?: "list" | "direct" | "photo";
    practiceSubTab?: "script" | "practice";
    studySubTab?: "helper" | "planner";
    studyHelperMode?: "summary" | "quiz" | "note" | "question";
  }) => void;
  onAddSchedule?: (newSchedule: Omit<ScheduleItem, "id">) => void;
  onDeleteSchedule?: (id: string) => void;
  onUpdateSchedule?: (updated: ScheduleItem) => void;
}

export default function HomeScreen({ 
  user, 
  todos, 
  schedules, 
  onToggleTodo, 
  onAddTodo, 
  onDeleteTodo, 
  darkMode,
  onChangeTab,
  onAddSchedule,
  onDeleteSchedule,
  onUpdateSchedule
}: HomeScreenProps) {
  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoCategory, setNewTodoCategory] = useState<"homework" | "general" | "exam">("homework");
  const [isAddingTodo, setIsAddingTodo] = useState(false);

  // Today's Schedules States & Helpers
  const [isAddingSchedule, setIsAddingSchedule] = useState(false);
  const [newSchedTitle, setNewSchedTitle] = useState("");
  const [newSchedSubject, setNewSchedSubject] = useState("");
  const [newSchedTimeInfo, setNewSchedTimeInfo] = useState("");
  const [newSchedType, setNewSchedType] = useState<"assessment" | "exam" | "study" | "homework">("study");

  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [editSchedTitle, setEditSchedTitle] = useState("");
  const [editSchedSubject, setEditSchedSubject] = useState("");
  const [editSchedTimeInfo, setEditSchedTimeInfo] = useState("");
  const [editSchedType, setEditSchedType] = useState<"assessment" | "exam" | "study" | "homework">("study");

  // Format today's date string
  const todayDateObj = new Date();
  const todayYear = todayDateObj.getFullYear();
  const todayMonthStr = String(todayDateObj.getMonth() + 1).padStart(2, '0');
  const todayDayStr = String(todayDateObj.getDate()).padStart(2, '0');
  const todayStr = `${todayYear}-${todayMonthStr}-${todayDayStr}`;



  const handleAddScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchedTitle.trim() || !newSchedSubject.trim()) return;
    if (onAddSchedule) {
      onAddSchedule({
        title: newSchedTitle,
        subject: newSchedSubject,
        date: todayStr,
        presentationTime: newSchedTimeInfo || "시간 미정",
        type: newSchedType
      });
    }
    setNewSchedTitle("");
    setNewSchedSubject("");
    setNewSchedTimeInfo("");
    setNewSchedType("study");
    setIsAddingSchedule(false);
  };

  const handleStartScheduleEdit = (item: ScheduleItem) => {
    setEditingSchedule(item);
    setEditSchedTitle(item.title);
    setEditSchedSubject(item.subject);
    setEditSchedTimeInfo(item.presentationTime || "");
    setEditSchedType(item.type || "study");
  };

  const handleSaveScheduleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule || !editSchedTitle.trim() || !editSchedSubject.trim()) return;
    if (onUpdateSchedule) {
      onUpdateSchedule({
        ...editingSchedule,
        title: editSchedTitle,
        subject: editSchedSubject,
        presentationTime: editSchedTimeInfo,
        type: editSchedType
      });
    }
    setEditingSchedule(null);
  };

  // Custom Shortcuts States
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(() => {
    const saved = localStorage.getItem("ttok_smart_shortcuts");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse smart shortcuts:", e);
      }
    }
    return DEFAULT_SHORTCUTS;
  });

  const [isEditingShortcuts, setIsEditingShortcuts] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<ShortcutItem | null>(null);

  // Editing form states
  const [editFeatureId, setEditFeatureId] = useState("assessment_photo");

  useEffect(() => {
    localStorage.setItem("ttok_smart_shortcuts", JSON.stringify(shortcuts));
  }, [shortcuts]);

  useEffect(() => {
    if (editingShortcut) {
      setEditFeatureId(editingShortcut.featureId || "assessment_photo");
    }
  }, [editingShortcut]);

  const handleSaveShortcut = () => {
    if (!editingShortcut) return;
    const selectedFeature = TTOK_FEATURES.find(f => f.id === editFeatureId);
    if (!selectedFeature) return;

    setShortcuts(prev => prev.map(s => s.id === editingShortcut.id ? {
      ...s,
      title: selectedFeature.title,
      description: selectedFeature.description,
      targetTab: selectedFeature.targetTab,
      iconType: selectedFeature.iconType as any,
      deepParams: selectedFeature.deepParams,
      featureId: selectedFeature.id
    } : s));
    setEditingShortcut(null);
  };

  const renderShortcutIcon = (type: string) => {
    const cls = "stroke-[2.5px]";
    switch (type) {
      case "calendar": return <Calendar size={18} className={cls} />;
      case "sparkles": return <Sparkles size={18} className={cls} />;
      case "bookOpen": return <BookOpen size={18} className={cls} />;
      case "award": return <Award size={18} className={cls} />;
      case "settings": return <Settings size={18} className={cls} />;
      default: return <Sparkles size={18} className={cls} />;
    }
  };

  const getShortcutIconBg = (type: string) => {
    switch (type) {
      case "calendar": return "bg-blue-500/15 text-blue-500";
      case "sparkles": return "bg-emerald-500/15 text-emerald-500";
      case "bookOpen": return "bg-purple-500/15 text-purple-500";
      case "award": return "bg-amber-500/15 text-amber-500";
      case "settings": return "bg-rose-500/15 text-rose-500";
      default: return "bg-blue-500/15 text-blue-500";
    }
  };

  // Formatting Date
  const today = new Date();
  const formattedDate = today.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }) + "요일";

  // Categorize Schedules
  const upcomingAssessments = schedules.filter(s => s.type === "assessment");
  const upcomingExams = schedules.filter(s => s.type === "exam");

  // Calculate D-Day
  const getDDay = (targetDateStr: string) => {
    const target = new Date(targetDateStr);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "D-Day";
    return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
  };

  // Check achievement rate
  const completedCount = todos.filter(t => t.completed).length;
  const totalCount = todos.length;
  const achievementRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Handle direct todo submit
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;
    onAddTodo(newTodoText, newTodoCategory);
    setNewTodoText("");
    setIsAddingTodo(false);
  };



  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in pb-safe-layout">
      
      {/* 1. FIGMA TOP HERO HERO: Welcome Profile Header with glass aesthetics */}
      <div className="relative overflow-hidden rounded-[24px] sm:rounded-[32px] border-[1.5px] border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 sm:p-6 md:p-8 shadow-sm">
        <div className="absolute top-0 right-0 -mr-6 -mt-6 w-48 h-48 bg-brand/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-brand/3 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-xl sm:rounded-2xl md:rounded-3xl border-2 border-brand/20 overflow-hidden shadow-md flex items-center justify-center bg-gradient-to-tr from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900">
                {user.avatarUrl && !user.avatarUrl.startsWith("http") && !user.avatarUrl.startsWith("data:") ? (
                  <span className="text-2xl sm:text-3xl md:text-4xl select-none" role="img" aria-label="profile emoji">
                    {user.avatarUrl}
                  </span>
                ) : (
                  <img 
                    src={user.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=256"} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 bg-brand text-white w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center shadow-md">
                <Zap size={11} className="fill-current" />
              </div>
            </div>
            
            <div className="space-y-2 text-left">
              <div className="flex items-center gap-2">
                <span className="text-fluid-sm font-black tracking-widest text-brand bg-brand-light dark:bg-brand/10 dark:text-brand px-3 py-1 rounded-full">
                  {user.school ? `${user.school} • ${user.grade || "1"}학년` : "등록된 학교가 없습니다"}
                </span>
              </div>
              <h1 className="text-fluid-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight-sf leading-tight">
                안녕하세요, <span className="text-brand">{user.name || "새로운 학생"}</span>님!
              </h1>
              <p className="text-fluid-base text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5 mt-1">
                <Calendar size={14} className="text-slate-400 shrink-0" />
                <span>{formattedDate} • 스케줄을 똑부러지게 관리하세요</span>
              </p>
            </div>
          </div>

          {/* Goal card redesigned as a Figma widget */}
          <div className="bg-slate-50/70 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 rounded-[20px] sm:rounded-[24px] p-4 flex items-start gap-3 max-w-sm w-full md:w-auto shadow-sm text-left">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Award size={18} className="stroke-[2.5px]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <Target size={12} className="text-amber-500 shrink-0" />
                <span className="text-fluid-xs text-slate-400 font-extrabold tracking-wider uppercase">학기 최종 목표</span>
              </div>
              <p className="text-fluid-base font-black text-slate-750 dark:text-slate-200 mt-1 leading-relaxed break-keep">
                {user.goal || "프로필 탭에서 이번 학기 최종 목표를 등록해 보세요!"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* AI 리포트 (PRO 전용) */}
      {user.isPremium && (
        <AiReportCard todos={todos} schedules={schedules} darkMode={darkMode} />
      )}

      {/* 스마트 단축키 데스크 */}
      <div className="p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border-[1.5px] border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h3 className="text-fluid-xl font-black text-slate-800 dark:text-slate-100 tracking-tight-sf">자주 쓰는 기능</h3>
          </div>
          <button 
            onClick={() => setIsEditingShortcuts(!isEditingShortcuts)}
            className={`w-12 h-12 rounded-xl transition-all flex items-center justify-center cursor-pointer select-none shrink-0 ${
              isEditingShortcuts 
                ? "bg-amber-500 hover:bg-amber-600 text-white shadow-sm" 
                : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            }`}
            title={isEditingShortcuts ? "편집 완료" : "단축키 수정"}
          >
            {isEditingShortcuts ? <X size={18} /> : <Edit size={18} />}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {shortcuts.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                if (isEditingShortcuts) {
                  setEditingShortcut(item);
                } else if (onChangeTab) {
                  onChangeTab(item.targetTab, item.deepParams);
                }
              }}
              className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between cursor-pointer relative group ${
                isEditingShortcuts
                  ? "border-amber-400/60 bg-amber-500/5 hover:bg-amber-500/10 dark:border-amber-500/40"
                  : "border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/20 hover:border-brand/40 hover:bg-brand/5 hover:shadow-md hover:shadow-brand/5"
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getShortcutIconBg(item.iconType)}`}>
                    {renderShortcutIcon(item.iconType)}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h4 className="text-fluid-base font-black text-slate-800 dark:text-slate-100 group-hover:text-brand dark:group-hover:text-brand-light transition-colors truncate">
                      {item.title}
                    </h4>
                    <p className="text-fluid-sm text-slate-400 dark:text-slate-500 font-semibold truncate">{item.description}</p>
                  </div>
                </div>
                
                {isEditingShortcuts ? (
                  <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0 animate-pulse">
                    <Edit size={12} />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition-all">
                    <ChevronRight size={14} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Edit Modal */}
        {editingShortcut && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
            <div className={`w-full max-w-md p-6 rounded-[28px] border shadow-2xl transition-all ${
              darkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-100 text-slate-800"
            }`}>
              <h3 className="text-base font-extrabold tracking-tight-sf mb-1 text-left">단축키 기능 연결</h3>
              <p className="text-[11px] text-slate-400 font-semibold mb-4 text-left">이 단축키 클릭 시 실행할 똑(TTOK)의 기능을 선택해 주세요. 이름과 아이콘은 기능에 맞춰 자동으로 설정됩니다.</p>
              
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {TTOK_FEATURES.map((feat) => {
                  const isSelected = editFeatureId === feat.id;
                  return (
                    <div
                      key={feat.id}
                      onClick={() => setEditFeatureId(feat.id)}
                      className={`p-3 rounded-xl border-2 transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? "border-brand bg-brand/5 dark:bg-brand/10"
                          : "border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 hover:bg-slate-100/50 dark:hover:bg-slate-900/50"
                      }`}
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${getShortcutIconBg(feat.iconType)}`}>
                          {renderShortcutIcon(feat.iconType)}
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            {feat.title}
                          </h4>
                          <p className="text-xs text-slate-400 font-medium">{feat.description}</p>
                        </div>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? "border-brand bg-brand text-white" : "border-slate-300 dark:border-slate-700"
                      }`}>
                        {isSelected && <Check size={10} className="stroke-[3px]" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2.5 mt-6">
                <button
                  onClick={() => setEditingShortcut(null)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl cursor-pointer"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveShortcut}
                  className="flex-1 py-2.5 bg-brand text-white text-sm font-bold rounded-xl shadow-md shadow-brand/10 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  변경하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. FIGMA LAYOUT: Full-Width Dashboard Layout */}
      <div className="space-y-6 md:space-y-8 animate-fade-in">
        
        {/* Main Section: Primary learning details and schedules */}
        <div className="space-y-6 md:space-y-8">
          
          {/* FIGMA HORIZONTAL D-DAY CAROUSEL */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <BookmarkCheck size={18} className="text-brand shrink-0" />
                <h3 className="text-fluid-xl font-black text-slate-800 dark:text-slate-200 tracking-tight-sf">수행평가 & 시험 카운트다운</h3>
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-3 px-3">
              {/* Combine assessments and exams for D-Day view */}
              {[...upcomingAssessments, ...upcomingExams].length > 0 ? (
                [...upcomingAssessments, ...upcomingExams].map(item => {
                  const dday = getDDay(item.date);
                  const isExam = item.type === "exam";
                  const isUrgent = dday.includes("-") && parseInt(dday.split("-")[1]) <= 3;
                  
                  return (
                    <div 
                      key={item.id}
                      className={`min-w-[240px] xs:min-w-[270px] sm:min-w-[300px] p-4.5 rounded-2xl border-[1.5px] shadow-sm transition-all duration-200 flex flex-col justify-between gap-3 ${
                        isUrgent
                          ? "bg-rose-50/50 border-rose-200/60 dark:bg-rose-500/5 dark:border-rose-500/20"
                          : "bg-white border-slate-100 dark:bg-slate-900 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className={`text-fluid-xs font-black uppercase px-2.5 py-1 rounded-full truncate ${
                          isExam 
                            ? "bg-rose-100 text-rose-600 dark:bg-rose-500/10" 
                            : "bg-brand-light text-brand dark:bg-brand/10"
                        }`}>
                          {item.subject}
                        </span>
                        
                        <span className={`text-fluid-xs font-extrabold px-2.5 py-1 rounded-lg shrink-0 ${
                          isUrgent
                            ? "bg-rose-500 text-white shadow-sm"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}>
                          {dday}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-left">
                        <h4 className="text-fluid-base font-black text-slate-800 dark:text-slate-200 line-clamp-1">{item.title}</h4>
                        <div className="flex items-center gap-1.5 text-fluid-xs text-slate-500">
                          <Calendar size={12} className="shrink-0" />
                          <span>{item.date} 평가</span>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-fluid-xs text-slate-500 font-bold text-left">
                        <div className="flex items-center gap-1 truncate">
                          <Clock size={11} className="shrink-0 text-slate-400" />
                          <span className="truncate">{item.presentationTime || "자료제출"}</span>
                        </div>
                        <div className="flex items-center gap-1 truncate">
                          <CheckSquare size={11} className="shrink-0 text-slate-400" />
                          <span className="truncate">{item.submissionMethod || "직접제출"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="w-full text-center py-8 bg-white dark:bg-slate-900 border-[1.5px] border-slate-100 dark:border-slate-800/80 rounded-2xl text-slate-400 text-fluid-sm">
                  등록된 다가오는 일정이 없습니다. 일정을 추가해 보세요!
                </div>
              )}
            </div>
          </div>

          {/* FIGMA CHEEKY PROGRESS & TASK SPLIT */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            
            {/* Learning Status Circle Panel */}
            <div className="p-5 rounded-[24px] sm:rounded-[28px] border-[1.5px] border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-fluid-xs font-black text-slate-500 uppercase tracking-widest">오늘의 학습 성취</span>
                  <span className="text-fluid-xs font-extrabold text-brand bg-brand-light dark:bg-brand/10 px-2.5 py-1 rounded-full">실시간 계산</span>
                </div>
                
                <div className="flex flex-row items-center gap-4 py-2 text-left">
                  {/* Circle Progress Bar */}
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle 
                        cx="32" 
                        cy="32" 
                        r="26" 
                        className="stroke-slate-100 dark:stroke-slate-800 fill-transparent sm:hidden" 
                        strokeWidth="6" 
                      />
                      <circle 
                        cx="32" 
                        cy="32" 
                        r="26" 
                        className="stroke-brand fill-transparent transition-all duration-500 sm:hidden" 
                        strokeWidth="6" 
                        strokeDasharray={163.3}
                        strokeDashoffset={163.3 - (163.3 * achievementRate) / 100}
                        strokeLinecap="round"
                      />
                      <circle 
                        cx="40" 
                        cy="40" 
                        r="34" 
                        className="stroke-slate-100 dark:stroke-slate-800 fill-transparent hidden sm:block" 
                        strokeWidth="7" 
                      />
                      <circle 
                        cx="40" 
                        cy="40" 
                        r="34" 
                        className="stroke-brand fill-transparent transition-all duration-500 hidden sm:block" 
                        strokeWidth="7" 
                        strokeDasharray={213.6}
                        strokeDashoffset={213.6 - (213.6 * achievementRate) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-fluid-base font-black text-slate-800 dark:text-slate-100">{achievementRate}%</span>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <p className="text-fluid-lg font-black text-slate-700 dark:text-slate-200">학업 달성 게이지</p>
                    <p className="text-fluid-sm text-slate-500 dark:text-slate-400 leading-relaxed break-keep">
                      오늘 등록한 할 일 {totalCount}개 중 {completedCount}개를 성공적으로 수행 완료했습니다!
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex justify-between text-fluid-sm text-slate-500 font-bold">
                <span className="text-brand">성공: {completedCount}개</span>
                <span className="text-slate-500 dark:text-slate-400">미완료: {totalCount - completedCount}개</span>
              </div>
            </div>

            {/* Today's Schedules timeline widget */}
            <div className="p-5 rounded-[24px] sm:rounded-[28px] border-[1.5px] border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-fluid-xs font-black text-slate-500 uppercase tracking-widest">오늘 스케줄 라인</span>
                  <button
                    onClick={() => {
                      setIsAddingSchedule(!isAddingSchedule);
                      setEditingSchedule(null);
                    }}
                    className="w-12 h-12 text-brand hover:bg-brand-light dark:hover:bg-brand/10 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
                    title="스케줄 추가"
                  >
                    <Plus size={20} className="stroke-[2.5px]" />
                  </button>
                </div>

                {/* Add Schedule Form */}
                <AnimatePresence mode="wait">
                  {isAddingSchedule && (
                    <motion.form
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleAddScheduleSubmit}
                      className="mb-3.5 p-3.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/85 rounded-2xl space-y-2.5 overflow-hidden text-left"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-brand">일정 등록하기</span>
                        <button
                          type="button"
                          onClick={() => setIsAddingSchedule(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={12} />
                        </button>
                      </div>

                      <input
                        type="text"
                        required
                        value={newSchedTitle}
                        onChange={(e) => setNewSchedTitle(e.target.value)}
                        placeholder="스케줄 제목 (예: 영어 숙제하기)"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm focus:outline-none"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          value={newSchedSubject}
                          onChange={(e) => setNewSchedSubject(e.target.value)}
                          placeholder="과목 (예: 영어)"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm focus:outline-none"
                        />
                        <input
                          type="text"
                          value={newSchedTimeInfo}
                          onChange={(e) => setNewSchedTimeInfo(e.target.value)}
                          placeholder="시간 (예: 오후 4:00)"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1">
                          <GlassSelect
                            value={newSchedType}
                            onChange={(v) => setNewSchedType(v as "assessment" | "exam" | "study" | "homework")}
                            options={SCHEDULE_TYPE_OPTIONS}
                            darkMode={darkMode}
                            triggerClassName="w-full flex items-center justify-between gap-2 px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-300 cursor-pointer"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-brand text-white font-black rounded-xl text-sm cursor-pointer shadow-sm"
                        >
                          등록
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* Edit Schedule Form */}
                <AnimatePresence mode="wait">
                  {editingSchedule && (
                    <motion.form
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleSaveScheduleEdit}
                      className="mb-3.5 p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-2xl space-y-2.5 overflow-hidden text-left"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-amber-500">일정 수정하기</span>
                        <button
                          type="button"
                          onClick={() => setEditingSchedule(null)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={12} />
                        </button>
                      </div>

                      <input
                        type="text"
                        required
                        value={editSchedTitle}
                        onChange={(e) => setEditSchedTitle(e.target.value)}
                        placeholder="스케줄 제목"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm focus:outline-none"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          value={editSchedSubject}
                          onChange={(e) => setEditSchedSubject(e.target.value)}
                          placeholder="과목"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm focus:outline-none"
                        />
                        <input
                          type="text"
                          value={editSchedTimeInfo}
                          onChange={(e) => setEditSchedTimeInfo(e.target.value)}
                          placeholder="시간 정보"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1">
                          <GlassSelect
                            value={editSchedType}
                            onChange={(v) => setEditSchedType(v as "assessment" | "exam" | "study" | "homework")}
                            options={SCHEDULE_TYPE_OPTIONS}
                            darkMode={darkMode}
                            triggerClassName="w-full flex items-center justify-between gap-2 px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-300 cursor-pointer"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-amber-500 text-white font-black rounded-xl text-sm cursor-pointer shadow-sm"
                        >
                          저장
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* Schedules List */}
                <div className="space-y-2.5 text-left">
                  {schedules.filter(s => s.date === todayStr).length > 0 ? (
                    schedules.filter(s => s.date === todayStr).map((item) => {
                      const isStudy = item.type === "study" || item.type === "homework";
                      const borderCls = isStudy 
                        ? "border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40"
                        : "border-blue-100/40 bg-blue-50/20 dark:border-brand/10 dark:bg-brand/5";
                      const iconBg = isStudy
                        ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        : "bg-brand text-white";
                      const IconComponent = isStudy ? BookOpen : Clock;

                      return (
                        <div 
                          key={item.id}
                          className={`flex items-start justify-between p-3.5 rounded-xl border group/item transition-all ${borderCls}`}
                        >
                          <div className="flex gap-3.5 items-start">
                            <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
                              <IconComponent size={14} />
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-fluid-base font-extrabold text-slate-800 dark:text-slate-200 leading-snug">
                                <span className="text-brand mr-1.5">[{item.subject}]</span>{item.title}
                              </h4>
                              <p className="text-fluid-sm text-slate-500 dark:text-slate-400 font-semibold">{item.presentationTime || "하루 종일"}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => {
                                handleStartScheduleEdit(item);
                                setIsAddingSchedule(false);
                              }}
                              className="w-12 h-12 hover:bg-slate-150 dark:hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-amber-500 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                              title="수정"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => {
                                if (onDeleteSchedule) onDeleteSchedule(item.id);
                              }}
                              className="w-12 h-12 hover:bg-slate-150 dark:hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-rose-500 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                              title="삭제"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-fluid-sm font-semibold">
                      오늘 등록된 스케줄이 없습니다.<br />위의 '+' 버튼을 클릭해 스케줄을 추가해 보세요!
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
