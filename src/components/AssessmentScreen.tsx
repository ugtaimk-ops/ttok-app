import React, { useState, useRef, useEffect } from "react";
import { ScheduleItem } from "../types";
import { getApiUrl, robustFetch, getTodayDateString } from "../lib/api";
import { 
  Calendar, 
  FileText, 
  Plus, 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  Check, 
  Loader2, 
  Clock, 
  Info,
  CalendarCheck,
  AlertCircle,
  Edit,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AssessmentScreenProps {
  schedules: ScheduleItem[];
  onAddSchedule: (schedule: Omit<ScheduleItem, "id">) => void;
  onAddTodo: (text: string, category: "homework" | "general" | "exam" | "assessment", dueDate?: string) => void;
  onDeleteSchedule: (id: string) => void;
  onUpdateSchedule: (updated: ScheduleItem) => void;
  darkMode: boolean;
  initialMode?: "list" | "direct" | "photo";
}

export default function AssessmentScreen({ 
  schedules, 
  onAddSchedule, 
  onAddTodo, 
  onDeleteSchedule,
  onUpdateSchedule,
  darkMode,
  initialMode
}: AssessmentScreenProps) {
  const [mode, setMode] = useState<"list" | "direct" | "photo">("list");

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  // Context Menu State for Schedules
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; item: ScheduleItem | null }>({
    visible: false,
    x: 0,
    y: 0,
    item: null
  });

  // Edit Mode State
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSupplies, setEditSupplies] = useState("");
  const [editSubmissionMethod, setEditSubmissionMethod] = useState("");
  const [editCriteria, setEditCriteria] = useState("");
  const [editPresentationTime, setEditPresentationTime] = useState("");

  // Deletion Confirmation State
  const [deletingItem, setDeletingItem] = useState<ScheduleItem | null>(null);

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleOutsideClick = () => {
      if (contextMenu.visible) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [contextMenu.visible]);

  const handleContextMenu = (e: React.MouseEvent, item: ScheduleItem) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      item
    });
  };

  const handleStartEdit = (item: ScheduleItem | null) => {
    if (!item) return;
    setEditingItem(item);
    setEditSubject(item.subject);
    setEditTitle(item.title);
    setEditDate(item.date);
    setEditSupplies(item.supplies || "");
    setEditSubmissionMethod(item.submissionMethod || "");
    setEditCriteria(item.criteria || "");
    setEditPresentationTime(item.presentationTime || "");
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleSaveEdit = () => {
    if (!editingItem || !editSubject.trim() || !editTitle.trim() || !editDate.trim()) return;
    onUpdateSchedule({
      ...editingItem,
      subject: editSubject,
      title: editTitle,
      date: editDate,
      dueDate: editDate,
      supplies: editSupplies,
      submissionMethod: editSubmissionMethod,
      criteria: editCriteria,
      presentationTime: editPresentationTime
    });
    setEditingItem(null);
  };
  
  // Direct Input Form State
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState(getTodayDateString());
  const [supplies, setSupplies] = useState("");
  const [criteria, setCriteria] = useState("");
  const [submissionMethod, setSubmissionMethod] = useState("");
  const [presentationTime, setPresentationTime] = useState("");

  // Photo Input State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Direct Input Submit Handler
  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subject.trim() || !dueDate) return;

    onAddSchedule({
      title,
      subject,
      date: dueDate,
      supplies,
      dueDate,
      criteria,
      submissionMethod,
      presentationTime,
      type: "assessment"
    });

    // Automatically create a todo homework item
    onAddTodo(`[${subject}] ${title} 제출 및 준비하기`, "homework", dueDate);

    // Reset Form
    setTitle("");
    setSubject("");
    setDueDate(getTodayDateString());
    setSupplies("");
    setCriteria("");
    setSubmissionMethod("");
    setPresentationTime("");
    setMode("list");
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        // Extract raw base64 data without metadata header
        const rawBase64 = base64String.split(",")[1];
        resolve(rawBase64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Call Express API endpoint to extract text using Gemini Multimodal
  const analyzeImage = async (base64Data: string, mimeType: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setScanResult(null);

    try {
      const res = await robustFetch("/api/assessment/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64Data, mimeType })
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("RESOURCE_EXHAUSTED_429");
        }
        let errorMsg = "서버 분석 실패. API 키나 파일 형식 확인이 필요합니다.";
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      const data = await res.json();
      setScanResult(data);
    } catch (err: any) {
      console.error(err);
      const is429 = err.message?.includes("RESOURCE_EXHAUSTED_429") || 
                    err.message?.includes("429") || 
                    err.status === 429;
      if (is429) {
        setAnalysisError(
          "⚠️ AI 서비스 할당량 초과 안내 (429 Quota Exceeded)\n" +
          "현재 수행평가 이미지 분석의 사용 한도를 일시적으로 초과했습니다.\n\n" +
          "이 오류는 자동으로 재시도되지 않으며, 잠시 후(약 1~2분 후) 다시 이미지를 등록하여 시도해 주세요."
        );
      } else {
        setAnalysisError(err.message || "이미지 분석 오류가 발생했습니다.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle local file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await fileToBase64(file);
      analyzeImage(base64, file.type);
    } catch (err) {
      setAnalysisError("이미지 파일을 변환하는 도중 에러가 발생했습니다.");
    }
  };

  // Trigger file dialog
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Handle saving the extracted assessment from AI Photo Registration
  const handleSaveScannedResult = () => {
    if (!scanResult) return;

    const todayStr = getTodayDateString();
    const finalDueDate = scanResult.dueDate || todayStr;

    onAddSchedule({
      title: scanResult.title,
      subject: scanResult.subject,
      date: finalDueDate,
      supplies: scanResult.supplies,
      dueDate: finalDueDate,
      criteria: scanResult.criteria,
      submissionMethod: scanResult.submissionMethod,
      presentationTime: scanResult.presentationTime,
      type: "assessment"
    });

    // Automatically create a todo homework item
    onAddTodo(`[${scanResult.subject}] ${scanResult.title} 수행평가 완수하기`, "homework", finalDueDate);

    setScanResult(null);
    setMode("list");
  };

  return (
    <div className="space-y-6 animate-fade-in pb-safe-layout px-1 sm:px-2">
      
      {/* Tab Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left">
        <div className="space-y-1">
          <h1 className="text-fluid-3xl font-black tracking-tight-sf text-slate-800 dark:text-slate-100">
            수행평가 일정 관리
          </h1>
          <p className="text-fluid-sm text-slate-500 dark:text-slate-400 font-semibold">
            나의 수행평가 계획과 일정을 똑 소리나게 통합 스케줄링하세요
          </p>
        </div>

        {mode === "list" && (
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setMode("direct")}
              className="flex-1 sm:flex-initial h-12 px-5 bg-brand-light dark:bg-brand/10 text-brand font-black rounded-2xl text-fluid-sm hover:bg-brand hover:text-white transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-98"
            >
              <Plus size={18} /> 직접 입력
            </button>
            <button
              onClick={() => setMode("photo")}
              className="flex-1 sm:flex-initial h-12 px-5 bg-brand-light dark:bg-brand/10 text-brand font-black rounded-2xl text-fluid-sm hover:bg-brand hover:text-white transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-98"
            >
              <Sparkles size={18} /> 사진 등록
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        
        {/* 1. LIST VIEW */}
        {mode === "list" && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {schedules.filter(s => s.type === "assessment").length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {schedules.filter(s => s.type === "assessment").map(item => (
                  <div 
                    key={item.id}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    className={`p-5 sm:p-6 rounded-[24px] sm:rounded-[32px] border transition-all duration-300 hover:scale-[1.01] hover:shadow-md relative cursor-context-menu select-none text-left ${
                      darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="px-3 py-1 rounded-full text-fluid-xs font-black bg-brand-light dark:bg-brand/15 text-brand uppercase truncate">
                          {item.subject}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center gap-1 text-fluid-xs font-bold text-slate-400">
                          <Calendar size={13} className="shrink-0" />
                          <span>제출일: {item.dueDate}</span>
                        </div>
                        
                        {/* Always-visible action buttons for mobile UX */}
                        <div className="flex items-center gap-0.5 ml-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(item);
                            }}
                            className="w-12 h-12 text-slate-400 hover:text-brand hover:bg-brand-light dark:hover:bg-brand/10 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
                            title="수정"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingItem(item);
                            }}
                            className="w-12 h-12 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
                            title="삭제"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <h3 className="text-fluid-lg font-black text-slate-800 dark:text-slate-100 mb-4 leading-snug break-keep">
                      {item.title}
                    </h3>

                    <div className="space-y-2.5 text-fluid-base text-slate-650 dark:text-slate-400 font-semibold border-t border-slate-100 dark:border-slate-800/80 pt-4">
                      {item.presentationTime && (
                        <div className="flex items-start gap-2.5">
                          <Clock size={16} className="text-slate-400 shrink-0 mt-0.5" />
                          <span>발표 시간: {item.presentationTime}</span>
                        </div>
                      )}
                      {item.supplies && (
                        <div className="flex items-start gap-2.5">
                          <FileText size={16} className="text-slate-400 shrink-0 mt-0.5" />
                          <span>준비물: {item.supplies}</span>
                        </div>
                      )}
                      {item.submissionMethod && (
                        <div className="flex items-start gap-2.5">
                          <Info size={16} className="text-slate-400 shrink-0 mt-0.5" />
                          <span>제출 방식: {item.submissionMethod}</span>
                        </div>
                      )}
                      {item.criteria && (
                        <div className="flex items-start gap-2.5 bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl mt-3 text-fluid-sm font-semibold leading-relaxed text-left">
                          <span className="text-brand font-extrabold shrink-0">기준:</span>
                          <span className="text-slate-600 dark:text-slate-300">{item.criteria}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-8 sm:p-16 rounded-[24px] sm:rounded-[32px] border text-center ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
                <div className="mx-auto w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mb-4">
                  <Calendar size={28} />
                </div>
                <h3 className="text-fluid-lg font-black text-slate-750 dark:text-slate-300 mb-1.5">등록된 수행평가 일정 없음</h3>
                <p className="text-fluid-sm text-slate-400 mb-6 break-keep max-w-sm mx-auto">수행평가 계획서를 등록하면 AI가 캘린더 자동 등록, 일정 생성 및 알림 예약을 수행합니다.</p>
                <div className="flex flex-col sm:flex-row justify-center gap-2 max-w-xs mx-auto">
                  <button
                    onClick={() => setMode("direct")}
                    className="h-12 px-5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-fluid-sm font-extrabold rounded-xl cursor-pointer active:scale-98"
                  >
                    직접 입력
                  </button>
                  <button
                    onClick={() => setMode("photo")}
                    className="h-12 px-5 bg-brand text-white font-extrabold rounded-xl text-fluid-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-98"
                  >
                    <Sparkles size={16} /> 이미지/계획서 등록
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* 2. DIRECT ENTRY FORM */}
        {mode === "direct" && (
          <motion.div
            key="direct"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className={`max-w-2xl mx-auto p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] border transition-all ${
              darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
            }`}
          >
            <div className="text-left mb-6">
              <h2 className="text-fluid-xl font-black tracking-tight-sf mb-1">수행평가 직접 입력</h2>
              <p className="text-fluid-sm text-slate-400 break-keep">과목명과 상세 일정을 직접 기재해 주세요. 입력 완료 시 캘린더와 할 일 목록에 똑부러지게 등록됩니다.</p>
            </div>

            <form onSubmit={handleDirectSubmit} className="space-y-5 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5">과목명</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="예: 국어, 통합과학"
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5">수행평가 과제명</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: 자유주제 소설 쓰기 및 발표"
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5">최종 제출일 및 평가일</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5">희망 발표 시간</label>
                  <input
                    type="text"
                    value={presentationTime}
                    onChange={(e) => setPresentationTime(e.target.value)}
                    placeholder="예: 3분, 5분 이내 (없으면 빈칸)"
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5">지참 준비물</label>
                <input
                  type="text"
                  value={supplies}
                  onChange={(e) => setSupplies(e.target.value)}
                  placeholder="예: 색연필, 태블릿 PC"
                  className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                />
              </div>

              <div>
                <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5">제출 및 진행 방식</label>
                <input
                  type="text"
                  value={submissionMethod}
                  onChange={(e) => setSubmissionMethod(e.target.value)}
                  placeholder="예: 구글 클래스룸 보고서 업로드 및 발표"
                  className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                />
              </div>

              <div>
                <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5">평가 기준 (선택)</label>
                <textarea
                  value={criteria}
                  onChange={(e) => setCriteria(e.target.value)}
                  placeholder="예: 맞춤법 준수, 감정 묘사의 디테일, 인물 배치 등"
                  rows={3}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-fluid-base font-bold rounded-xl cursor-pointer active:scale-98 transition-all"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 h-12 bg-brand hover:bg-brand-dark text-white text-fluid-base font-bold rounded-xl cursor-pointer shadow-md shadow-brand/10 active:scale-98 transition-all"
                >
                  완료 및 저장
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* 3. AI PHOTO REGISTRATION */}
        {mode === "photo" && (
          <motion.div
            key="photo"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="max-w-2xl mx-auto space-y-6"
          >
            <div className={`p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] border transition-all text-left ${
              darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
            }`}>
              <h2 className="text-fluid-xl font-black tracking-tight-sf mb-1">AI 사진 스캔 등록</h2>
              <p className="text-fluid-sm text-slate-400 mb-6 break-keep">수행평가 계획표, 알림장, 칠판 판서 사진을 올리면 AI가 제목, 제출일, 준비물, 평가 기준 등을 자동 분석해 등록합니다.</p>

              {/* Upload trigger zone with improved touch heights */}
              <div 
                onClick={handleUploadClick}
                className={`p-6 sm:p-12 border-2 border-dashed rounded-[24px] sm:rounded-3xl flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 min-h-[180px] ${
                  isAnalyzing 
                    ? "border-brand/40 bg-brand/5 pointer-events-none" 
                    : "border-slate-200 hover:border-brand hover:bg-brand/5 dark:border-slate-800 dark:hover:border-brand/20"
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />

                {isAnalyzing ? (
                  <div className="space-y-3 py-6">
                    <Loader2 size={38} className="text-brand animate-spin mx-auto" />
                    <p className="text-fluid-base font-bold text-slate-700 dark:text-slate-300">AI 이미지 분석 중...</p>
                  </div>
                ) : (
                  <div className="space-y-3.5 py-4">
                    <div className="mx-auto w-14 h-14 bg-brand-light dark:bg-brand/10 text-brand rounded-2xl flex items-center justify-center shadow-sm">
                      <Upload size={26} />
                    </div>
                    <div>
                      <p className="text-fluid-base font-black text-slate-700 dark:text-slate-250">계획서 사진 선택하기</p>
                      <p className="text-fluid-xs text-slate-400 mt-1">또는 여기를 클릭해 카메라로 촬영</p>
                    </div>
                  </div>
                )}
              </div>

              {analysisError && (
                <div className="mt-4 p-4 bg-rose-50 border border-rose-100 dark:bg-rose-500/5 dark:border-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl flex gap-3 items-start text-left">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <div className="text-fluid-sm font-semibold">
                    <p className="font-extrabold text-fluid-base">분석에 실패했습니다</p>
                    <p className="text-[12px] mt-0.5 leading-relaxed">{analysisError}</p>
                    <p className="text-[12px] mt-1.5 text-slate-400 font-medium">네트워크 상태가 원활한지 확인하고 글씨가 선명한 계획서 사진으로 다시 시도해 주세요.</p>
                  </div>
                </div>
              )}

              {/* Cancel button in scanner mode */}
              {!scanResult && (
                <div className="flex justify-end mt-4">
                  <button
                    type="button"
                    onClick={() => setMode("list")}
                    className="h-12 px-6 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-fluid-base font-bold rounded-xl cursor-pointer active:scale-98 transition-all"
                  >
                    돌아가기
                  </button>
                </div>
              )}
            </div>

            {/* AI EXTRACTED PREVIEW RESULT */}
            {scanResult && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] border shadow-lg text-left ${
                  darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-blue-100/50"
                }`}
              >
                <div className="flex items-center gap-2 text-brand mb-5">
                  <Sparkles size={20} className="animate-pulse" />
                  <h3 className="text-fluid-base font-black uppercase tracking-wider">AI 자동 정보 추출 결과</h3>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-fluid-xs text-slate-400 font-bold block mb-1">과목</span>
                      <input
                        type="text"
                        value={scanResult.subject}
                        onChange={(e) => setScanResult({ ...scanResult, subject: e.target.value })}
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base font-bold focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                      />
                    </div>
                    <div>
                      <span className="text-fluid-xs text-slate-400 font-bold block mb-1">수행평가 제목</span>
                      <input
                        type="text"
                        value={scanResult.title}
                        onChange={(e) => setScanResult({ ...scanResult, title: e.target.value })}
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base font-bold focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-fluid-xs text-slate-400 font-bold block mb-1">제출 마감일 (자동 알림 생성)</span>
                      <input
                        type="date"
                        value={scanResult.dueDate}
                        onChange={(e) => setScanResult({ ...scanResult, dueDate: e.target.value })}
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                      />
                    </div>
                    <div>
                      <span className="text-fluid-xs text-slate-400 font-bold block mb-1">발표 소요 시간</span>
                      <input
                        type="text"
                        value={scanResult.presentationTime}
                        onChange={(e) => setScanResult({ ...scanResult, presentationTime: e.target.value })}
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="text-fluid-xs text-slate-400 font-bold block mb-1">필수 준비물</span>
                    <input
                      type="text"
                      value={scanResult.supplies}
                      onChange={(e) => setScanResult({ ...scanResult, supplies: e.target.value })}
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                    />
                  </div>

                  <div>
                    <span className="text-fluid-xs text-slate-400 font-bold block mb-1">제출 방법</span>
                    <input
                      type="text"
                      value={scanResult.submissionMethod}
                      onChange={(e) => setScanResult({ ...scanResult, submissionMethod: e.target.value })}
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                    />
                  </div>

                  <div>
                    <span className="text-fluid-xs text-slate-400 font-bold block mb-1">분석된 평가 및 채점 기준</span>
                    <textarea
                      value={scanResult.criteria}
                      onChange={(e) => setScanResult({ ...scanResult, criteria: e.target.value })}
                      rows={3}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 items-center bg-indigo-50/50 dark:bg-slate-900 border border-indigo-100/20 p-3.5 rounded-2xl mt-5 text-fluid-xs font-semibold text-slate-500">
                  <CalendarCheck size={18} className="text-brand shrink-0" />
                  <span>등록 버튼 클릭 시, <strong>캘린더 일정 등록</strong> 및 <strong>시험 7일전, 5일전, 3일전, 1일전 푸시알림</strong>이 똑 소리나게 자동 예약됩니다!</span>
                </div>

                <div className="flex gap-2.5 mt-6">
                  <button
                    type="button"
                    onClick={() => setScanResult(null)}
                    className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-fluid-base font-bold rounded-xl cursor-pointer active:scale-98 transition-all"
                  >
                    다시 스캔
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveScannedResult}
                    className="flex-2 h-12 bg-brand hover:bg-brand-dark text-white text-fluid-base font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all shadow-md shadow-brand/15"
                  >
                    <Check size={16} /> 캘린더 및 알림 자동 등록 완료
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* Custom Context Menu */}
      {contextMenu.visible && (
        <div 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[150px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl py-1.5 animate-fade-in text-fluid-sm font-bold text-slate-700 dark:text-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleStartEdit(contextMenu.item)}
            className="w-full px-4 py-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Edit size={16} className="text-slate-400" />
            일정 수정
          </button>
          <button
            onClick={() => {
              setDeletingItem(contextMenu.item);
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
            className="w-full px-4 py-3 text-left text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Trash2 size={16} className="text-rose-500" />
            일정 삭제
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md p-6 rounded-[28px] border shadow-2xl transition-all max-h-[90vh] overflow-y-auto ${
            darkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-100 text-slate-800"
          }`}>
            <h3 className="text-fluid-lg font-black tracking-tight-sf mb-5 text-left">수행평가 일정 수정</h3>
            
            <div className="space-y-4 text-left">
              <div>
                <label className="block text-fluid-xs font-bold text-slate-400 mb-1">과목명</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100"
                />
              </div>
              
              <div>
                <label className="block text-fluid-xs font-bold text-slate-400 mb-1">수행평가 과제명</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-fluid-xs font-bold text-slate-400 mb-1">최종 제출일</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full h-12 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-fluid-xs font-bold text-slate-400 mb-1">발표 소요 시간</label>
                  <input
                    type="text"
                    value={editPresentationTime}
                    onChange={(e) => setEditPresentationTime(e.target.value)}
                    className="w-full h-12 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-fluid-xs font-bold text-slate-400 mb-1">지참 준비물</label>
                <input
                  type="text"
                  value={editSupplies}
                  onChange={(e) => setEditSupplies(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-fluid-xs font-bold text-slate-400 mb-1">제출 및 진행 방식</label>
                <input
                  type="text"
                  value={editSubmissionMethod}
                  onChange={(e) => setEditSubmissionMethod(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-150 dark:border-slate-855 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-fluid-xs font-bold text-slate-400 mb-1">평가 기준 (선택)</label>
                <textarea
                  value={editCriteria}
                  onChange={(e) => setEditCriteria(e.target.value)}
                  rows={2}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-955 border border-slate-150 dark:border-slate-855 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-650 dark:text-slate-300 font-bold rounded-xl text-fluid-base cursor-pointer transition-all active:scale-98"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 h-12 bg-brand hover:bg-brand-dark text-white font-bold rounded-xl text-fluid-base cursor-pointer transition-all active:scale-98 shadow-md shadow-brand/10"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/50 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-sm p-6 rounded-[28px] border shadow-2xl text-center space-y-4 transition-all ${
            darkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-100 text-slate-800"
          }`}>
            <div className="w-14 h-14 bg-rose-50 dark:bg-rose-955/30 text-rose-500 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="text-fluid-lg font-black tracking-tight-sf">수행평가 일정 삭제</h3>
              <p className="text-fluid-sm text-slate-400 mt-1 break-keep leading-relaxed">
                정말로 <strong className="text-slate-700 dark:text-slate-350 font-bold">'{deletingItem.title}'</strong> 일정을 삭제하시겠습니까? 이 작업은 절대 복구할 수 없습니다.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeletingItem(null)}
                className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-650 dark:text-slate-300 font-bold rounded-xl text-fluid-base cursor-pointer transition-all active:scale-98"
              >
                취소
              </button>
              <button
                onClick={() => {
                  onDeleteSchedule(deletingItem.id);
                  setDeletingItem(null);
                }}
                className="flex-1 h-12 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-fluid-base cursor-pointer transition-all active:scale-98 shadow-md shadow-rose-500/10"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
