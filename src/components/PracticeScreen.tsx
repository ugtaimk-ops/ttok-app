import BackButton from "./BackButton";
import OfflinePractice from "./OfflinePractice";
import { useScreenBack } from "../lib/screenBack";
import { localizedText } from "../lib/localization";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ScriptItem } from "../types";
import { robustFetch, getTodayDateString, readApiJson, ApiError } from "../lib/api";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { exportScriptPdf } from "../lib/exportScriptPdf";
import { 
  Sparkles, 
  FileText, 
  Video, 
  Mic, 
  Copy, 
  Download, 
  Share2, 
  Edit3, 
  Check, 
  Volume2, 
  VideoOff,
  Eye, 
  Award,
  AlertCircle,
  Play,
  Square,
  RefreshCw,
  MessageSquare,
  Loader2,
  Trash2,
  FolderOpen,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import GlassSelect from "./GlassSelect";

interface PracticeScreenProps {
  user: any;
  scripts: ScriptItem[];
  onAddScript: (script: ScriptItem) => void;
  onDeleteScript?: (id: string) => void;
  onUpdateScript?: (script: ScriptItem) => void;
  darkMode: boolean;
  initialSubTab?: "script" | "practice";
  isActive?: boolean;
}

export default function PracticeScreen({
  user,
  scripts,
  onAddScript,
  onDeleteScript,
  onUpdateScript,
  darkMode,
  initialSubTab,
  isActive = true
}: PracticeScreenProps) {
  const [subTab, setSubTab] = useState<"script" | "practice">("script");

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // ==========================================
  // 1. SCRIPT GENERATION STATE
  // ==========================================
  const [scriptTopic, setScriptTopic] = useState("");
  const [time, setTime] = useState("3분");
  const [grade, setGrade] = useState(`${user?.grade || 3}학년`);
  const [subject, setSubject] = useState("");
  const [audience, setAudience] = useState("반 친구들과 선생님");
  const [tone, setTone] = useState("친근하고 당당한 말투");
  const [purpose, setPurpose] = useState("지식 전달 및 청중 설득");
  const [style, setStyle] = useState("PPT를 활용한 프리젠테이션");

  // ==========================================
  // 2. PRACTICE REHEARSAL STATE
  // ==========================================
  const [practiceTopic, setPracticeTopic] = useState("");

  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<any | null>(null);
  const [savedScriptOpen, setSavedScriptOpen] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isEditingScriptText, setIsEditingScriptText] = useState(false);
  const [editedScriptContent, setEditedScriptContent] = useState("");

  const [exportError, setExportError] = useState<string | null>(null);
  // The saved-script view keeps its existing font controls.
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [prompterTextSize, setPrompterTextSize] = useState<"sm" | "base" | "lg">("base");

  const getTextSizeClass = (size: "sm" | "base" | "lg") => {
    switch (size) {
      case "sm": return "text-sm sm:text-base leading-relaxed";
      case "base": return "text-lg sm:text-xl leading-relaxed";
      case "lg": return "text-xl sm:text-2xl leading-loose font-bold";
      default: return "text-lg sm:text-xl leading-relaxed";
    }
  };

  // Auto-select the most recently generated script if available. Cloud-synced
  // scripts arrive via a Firestore onSnapshot with no orderBy, so array order
  // isn't reliable - sort by the timestamp embedded in each script's id
  // ("scr_" + Date.now()) instead.
  useEffect(() => {
    if (scripts && scripts.length > 0 && !selectedScriptId) {
      const latestScript = [...scripts].sort((a, b) => {
        const aTime = Number(a.id.replace(/^scr_/, "")) || 0;
        const bTime = Number(b.id.replace(/^scr_/, "")) || 0;
        return bTime - aTime;
      })[0];
      setSelectedScriptId(latestScript.id);
      setPracticeTopic(latestScript.topic);
    }
  }, [scripts]);
  
  // ==========================================
  // 1. SCRIPT ACTIONS
  // ==========================================
  const handleGenerateScript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scriptTopic.trim() || !subject.trim()) return;

    setIsGeneratingScript(true);
    setScriptError(null);
    setGeneratedScript(null);

    const path = "/api/script/generate";
    console.log(`[PracticeScreen] [handleGenerateScript] Initiating robust API call to: ${path}`);
    console.log(`[PracticeScreen] Request payload:`, { topic: scriptTopic, time, grade, subject, audience, tone, purpose, style });

    try {
      const res = await robustFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: scriptTopic, time, grade, subject, audience, tone, purpose, style })
      });

      console.log(`[PracticeScreen] Script generation response status: ${res.status} (${res.statusText})`);

      const data = await readApiJson(res);

      const generatedId = "scr_" + Date.now();
      const todayStr = new Date().toISOString().split('T')[0];

      const newScriptItem: ScriptItem = {
        id: generatedId,
        date: todayStr,
        title: data.title || `${scriptTopic} 대본`,
        topic: scriptTopic,
        script: data.script,
        outline: data.outline || [],
        tips: data.tips || [],
        time,
        grade,
        subject,
        audience,
        tone,
        purpose,
        style
      };

      setGeneratedScript(newScriptItem);
      setEditedScriptContent(data.script);
      setSelectedScriptId(generatedId);
      
      // Save to application state histories
      onAddScript(newScriptItem);

    } catch (err: any) {
      console.error("[PracticeScreen] script generation error:", err);
      if (err?.name !== "AbortError") setScriptError(err instanceof ApiError ? err.message : "대본을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleCopyScript = () => {
    if (!editedScriptContent) return;
    navigator.clipboard.writeText(editedScriptContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleShareScript = async () => {
    if (!generatedScript) return;
    const text = `똑 AI 발표 대본: ${generatedScript.title}\n\n${editedScriptContent}`;
    setExportError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: `[똑] ${generatedScript.title}`, text });
      } else if (navigator.share) {
        await navigator.share({ title: `[똑] ${generatedScript.title}`, text });
      } else {
        await navigator.clipboard.writeText(text);
        setIsCopied(true);
        window.setTimeout(() => setIsCopied(false), 2000);
      }
    } catch (error: any) {
      if (error?.name !== "AbortError" && !/cancel/i.test(error?.message || "")) {
        setExportError("공유하지 못했어요. 잠시 후 다시 시도하거나 대본 복사를 이용해 주세요.");
      }
    }
  };

  const handleSavePDF = async () => {
    if (!generatedScript) return;
    setExportError(null);
    try {
      await exportScriptPdf({
        title: generatedScript.title,
        outline: generatedScript.outline || [],
        tips: generatedScript.tips || [],
        script: editedScriptContent,
      });
    } catch (error: any) {
      if (error?.name !== "AbortError" && !/cancel/i.test(error?.message || "")) {
        setExportError("PDF를 만들거나 공유하지 못했어요. 다시 시도해 주세요.");
      }
    }
  };

  // ==========================================
  // 2. REHEARSAL ACTIONS
  // ==========================================
  const closeSavedScript = () => {
    setSavedScriptOpen(false);
    setIsEditingScriptText(false);
    setGeneratedScript(null);
    setEditedScriptContent("");
    setExportError(null);
  };
  const openSavedScript = (script: ScriptItem) => {
    setGeneratedScript(script);
    setEditedScriptContent(script.script);
    setIsEditingScriptText(false);
    setExportError(null);
    setScriptTopic(script.topic);
    setSubject(script.subject || "");
    setTime(script.time || "3분");
    setAudience(script.audience || "청중");
    setGrade(script.grade || "3학년");
    setTone(script.tone || "친근한 말투");
    setPurpose(script.purpose || "");
    setStyle(script.style || "");
    setSavedScriptOpen(true);
  };
  useEffect(() => {
    if (!savedScriptOpen || !isActive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [savedScriptOpen, isActive]);
  useEffect(() => {
    if (!isActive && savedScriptOpen) closeSavedScript();
  }, [isActive, savedScriptOpen]);
  useScreenBack(() => {
    if (savedScriptOpen) { closeSavedScript(); return true; }
    if (isEditingScriptText) { setIsEditingScriptText(false); setEditedScriptContent(generatedScript?.script || ""); return true; }
    if (generatedScript && subTab === "script") { setGeneratedScript(null); return true; }
    if (subTab === "practice") { setSubTab("script"); return true; }
    return false;
  });

  const scriptPanel = !isGeneratingScript && generatedScript ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border space-y-4 sm:space-y-6 ${
                      darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <span className="text-xs font-black uppercase text-brand bg-brand-light dark:bg-brand/15 px-2.5 py-0.5 rounded">
                          AI 완성 대본
                        </span>
                        <h2 className="text-lg sm:text-xl font-black tracking-tight-sf mt-1 text-slate-800 dark:text-slate-100">
                          {generatedScript.title}
                        </h2>
                      </div>

                      {/* Controls */}
                      <div className="flex flex-wrap gap-2 text-fluid-sm font-bold">
                        <button
                          onClick={handleCopyScript}
                          className="h-11 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-98"
                          title="대본 복사"
                        >
                          {isCopied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                          {isCopied ? "복사 완료" : "대본 복사"}
                        </button>
                        <button
                          onClick={() => {
                            if (isEditingScriptText) {
                              // Finished editing! Save changes to global/local storage
                              if (generatedScript && onUpdateScript) {
                                const updatedScript: ScriptItem = {
                                  ...generatedScript,
                                  script: editedScriptContent
                                };
                                onUpdateScript(updatedScript);
                                setGeneratedScript(updatedScript);
                              }
                            }
                            setIsEditingScriptText(!isEditingScriptText);
                          }}
                          className={`h-11 px-4 border rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-98 ${
                            isEditingScriptText
                              ? "bg-brand/10 border-brand text-brand font-black"
                              : "bg-slate-50 border-slate-150 dark:bg-slate-900 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                          title="대본 직접 수정"
                        >
                          <Edit3 size={15} />
                          {isEditingScriptText ? "저장 완료" : "대본 수정"}
                        </button>
                        <button
                          onClick={handleSavePDF}
                          className="h-11 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-98"
                          title="PDF 프린트/저장"
                        >
                          <Download size={15} />
                          PDF 저장
                        </button>
                        <button
                          onClick={handleShareScript}
                          className="h-11 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-98"
                          title="대본 공유"
                        >
                          <Share2 size={15} />
                          대본 공유
                        </button>
                      </div>
                      {exportError && <p role="alert" className="text-xs font-semibold text-rose-500">{exportError}</p>}
                    </div>

                    {/* Outline Section */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl">
                      <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">발표 아웃라인 구조</h3>
                      <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300 font-semibold list-disc list-inside">
                        {generatedScript.outline.map((o: string, idx: number) => (
                          <li key={idx}>{o}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Core Script Text Area */}
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">스피치 본문 (제스처 훈련 포함)</h3>

                        {/* Font Size Adjuster Controls */}
                        <div className="flex items-center gap-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-0.5 rounded-lg self-start sm:self-auto max-w-full flex-nowrap">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-extrabold px-1.5 shrink-0">크기</span>
                          {(["sm", "base", "lg"] as const).map((size, index) => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => setPrompterTextSize(size)}
                              className={`h-8 px-2 text-[11px] font-bold rounded-md transition-colors cursor-pointer shrink-0 ${prompterTextSize === size ? "bg-brand text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
                            >
                              {["작게", "중간", "크게"][index]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {isEditingScriptText ? (
                        <textarea
                          value={editedScriptContent}
                          onChange={(e) => setEditedScriptContent(e.target.value)}
                          rows={12}
                          className={`w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-2xl ${getTextSizeClass(prompterTextSize)} focus:outline-none focus:ring-2 focus:ring-brand font-medium leading-relaxed`}
                        />
                      ) : (
                        <div className={`p-5 bg-white dark:bg-slate-900/10 border border-slate-100 dark:border-slate-800 rounded-2xl ${getTextSizeClass(prompterTextSize)} text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap max-h-[400px] overflow-y-auto pr-2 custom-scrollbar`}>
                          {editedScriptContent}
                        </div>
                      )}
                    </div>

                    {/* Tips Section */}
                    <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4">
                      <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">선생님의 핵심 발표 제언</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {generatedScript.tips.map((tip: string, idx: number) => (
                          <div key={idx} className="p-3 bg-brand/5 border border-brand/10 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 leading-snug">
                            ⭐ {tip}
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
  ) : null;

  return (
    <div className="space-y-6 animate-fade-in pb-safe-layout px-1 sm:px-2">
      
      {/* Upper Navigation Tabs */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 text-left">
        <div className="space-y-1">
          <h1 className="text-fluid-3xl font-black tracking-tight-sf text-slate-800 dark:text-slate-100">
            발표 연습 및 피드백
          </h1>
          <p className="text-fluid-sm text-slate-500 dark:text-slate-400 font-semibold">
            나의 말하기 자세와 시선 처리를 똑똑하게 AI 교정 및 분석받으세요
          </p>
        </div>

        <div className="flex w-full lg:w-auto bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
          <button
            onClick={() => setSubTab("script")}
            className={`flex-1 lg:flex-initial h-12 px-5 text-fluid-sm font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm ${
              subTab === "script" 
                ? "bg-white dark:bg-slate-700 text-brand shadow" 
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <FileText size={16} /> 발표 대본 작성
          </button>
          <button
            onClick={() => setSubTab("practice")}
            className={`flex-1 lg:flex-initial h-12 px-5 text-fluid-sm font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm ${
              subTab === "practice" 
                ? "bg-white dark:bg-slate-700 text-brand shadow" 
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Video size={16} /> 발표 연습 도와주기
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {subTab === "script" && (
          <motion.div
            key="script-writer"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
              {/* Form Input Columns */}
              <div className="lg:col-span-5 text-left">
                <div className={`p-5 sm:p-6 rounded-[28px] sm:rounded-[32px] border transition-all ${
                  darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                } shadow-sm`}>
                  <h2 className="text-fluid-lg font-black tracking-tight-sf mb-5 text-slate-800 dark:text-slate-100">발표 상세 조건 입력</h2>
                  
                  <form onSubmit={handleGenerateScript} className="space-y-4">
                    <div>
                      <label htmlFor="scriptTopicInput" className="block text-fluid-sm font-bold text-slate-500 dark:text-slate-400 mb-1.5">발표 주제</label>
                      <input
                        id="scriptTopicInput"
                        name="scriptTopic"
                        type="text"
                        required
                        value={scriptTopic}
                        onChange={(e) => setScriptTopic(e.target.value)}
                        placeholder="예: 인류 문명의 진화와 기후 위기"
                        autoComplete="off"
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="subjectInput" className="block text-fluid-sm font-bold text-slate-500 dark:text-slate-400 mb-1.5">교과 과목</label>
                        <input
                          id="subjectInput"
                          name="subject"
                          type="text"
                          required
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="예: 과학, 역사"
                          autoComplete="off"
                          className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-fluid-sm font-bold text-slate-500 dark:text-slate-400 mb-1.5">희망 시간</label>
                        <GlassSelect
                          value={time}
                          onChange={setTime}
                          options={[
                            { value: "2분", label: "2분" },
                            { value: "3분", label: "3분" },
                            { value: "5분", label: "5분" },
                            { value: "7분", label: "7분" }
                          ]}
                          darkMode={darkMode}
                          triggerClassName="w-full flex items-center justify-between gap-2 h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base text-slate-800 dark:text-slate-100 transition-all cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-fluid-sm font-bold text-slate-500 dark:text-slate-400 mb-1.5">대상 청중</label>
                        <input
                          type="text"
                          value={audience}
                          onChange={(e) => setAudience(e.target.value)}
                          className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-fluid-sm font-bold text-slate-500 dark:text-slate-400 mb-1.5">학년 수준</label>
                        <input
                          type="text"
                          value={grade}
                          onChange={(e) => setGrade(e.target.value)}
                          className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-fluid-sm font-bold text-slate-500 dark:text-slate-400 mb-1.5">원하는 말투</label>
                      <input
                        type="text"
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-fluid-sm font-bold text-slate-500 dark:text-slate-400 mb-1.5">발표 목적</label>
                      <input
                        type="text"
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-fluid-sm font-bold text-slate-500 dark:text-slate-400 mb-1.5">발표 스타일</label>
                      <input
                        type="text"
                        value={style}
                        onChange={(e) => setStyle(e.target.value)}
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isGeneratingScript}
                      className="w-full h-14 bg-brand hover:bg-brand-dark text-white font-extrabold rounded-2xl text-fluid-base shadow-md shadow-brand/15 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 active:scale-98"
                    >
                      {isGeneratingScript ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          똑똑하게 AI 발표 대본 작성 중...
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          대본 생성하기
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>

              {/* Script Output Column */}
              <div className="lg:col-span-7">
                {isGeneratingScript && (
                  <div className={`p-6 sm:p-12 rounded-[24px] sm:rounded-[32px] border text-center h-full flex flex-col items-center justify-center space-y-4 ${
                    darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  }`}>
                    <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin" />
                    <div>
                      <p className="text-sm font-extrabold text-brand">논리적인 서론-본론-결론 구조화 가동 중</p>
                      <p className="text-xs text-slate-400 mt-1 break-keep">학년 수준과 청중 특성에 완벽히 들어맞는 스피치를 제조하고 있습니다...</p>
                    </div>
                  </div>
                )}

                {!isGeneratingScript && (!generatedScript || savedScriptOpen) && (
                  <div className={`p-6 sm:p-12 rounded-[24px] sm:rounded-[32px] border border-dashed text-center h-full flex flex-col items-center justify-center space-y-3 ${
                    darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  }`}>
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center">
                      <FileText size={22} />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">작성된 대본이 여기에 생성됩니다</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm break-keep">주제와 정보를 입력한 후 완료 버튼을 누르면, 발표에 꼭 어울리는 명품 대본과 팁이 마크다운 가이드와 함께 완성됩니다.</p>
                  </div>
                )}

                {scriptError && (
                  <div className="p-4 bg-rose-50 border border-rose-100 dark:bg-rose-500/5 dark:border-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl flex gap-2 items-start">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold">{scriptError}</span>
                  </div>
                )}

                {!savedScriptOpen && scriptPanel}
              </div>
            </div>

            {/* 저장된 발표 대본 보관함 (Saved Presentation Scripts Storage) */}
            <div className={`p-6 sm:p-8 rounded-[32px] border ${
              darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
            } shadow-sm`}>
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-base sm:text-lg font-black tracking-tight-sf text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    📁 저장된 발표 대본 보관함
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">내가 작성하거나 AI가 생성해 준 대본들이 보관됩니다. 대본을 클릭하여 편집하거나 발표 연습에 활용할 수 있습니다.</p>
                </div>
                <span className="text-sm font-black px-3 py-1 bg-brand/10 text-brand rounded-full shrink-0 self-start sm:self-center">
                  총 {scripts.length}개
                </span>
              </div>

              {scripts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scripts.map((s) => (
                    <div 
                      key={s.id}
                      className={`group p-5 rounded-2xl border transition-all duration-200 relative flex flex-col justify-between ${
                        darkMode 
                          ? "bg-slate-950/40 border-slate-800/60 hover:bg-slate-950 hover:border-slate-750" 
                          : "bg-slate-50/40 border-slate-150 hover:bg-slate-50 hover:border-slate-200"
                      } ${
                        generatedScript?.id === s.id ? "ring-2 ring-brand border-transparent" : ""
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-xs font-black uppercase text-brand bg-brand-light dark:bg-brand/15 px-2 py-0.5 rounded">
                            {s.subject || "교과"}
                          </span>
                          <span className="text-xs font-semibold text-slate-400">
                            {s.date || getTodayDateString()}
                          </span>
                        </div>
                        
                        <button type="button" className="w-full text-left cursor-pointer" onClick={() => openSavedScript(s)}>
                          <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 group-hover:text-brand transition-colors line-clamp-1">
                            {s.title}
                          </h3>
                          <p className="text-sm text-slate-500 font-semibold line-clamp-1 mt-0.5">
                            주제: {s.topic}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3 mt-2 leading-relaxed">
                            {s.script}
                          </p>
                        </button>
                      </div>

                      <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-850/60 mt-4 pt-3">
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                          ⏱️ {s.time || "3분"}
                        </span>
                        
                        <div className="flex gap-2.5 items-center">
                          <button
                            type="button"
                            onClick={() => openSavedScript(s)}
                            className="h-11 px-4 text-fluid-sm font-black bg-brand/15 hover:bg-brand/25 text-brand rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-98"
                          >
                            <FolderOpen size={15} /> 불러오기
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(localizedText("정말로 이 대본을 삭제하시겠습니까?"))) {
                                if (onDeleteScript) onDeleteScript(s.id);
                                if (generatedScript?.id === s.id) {
                                  setGeneratedScript(null);
                                  setEditedScriptContent("");
                                }
                              }
                            }}
                            className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-rose-500 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/20 border border-slate-100 dark:border-slate-800/80 transition-all cursor-pointer"
                            title="대본 삭제"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center space-y-2">
                  <p className="text-sm text-slate-400 font-bold">아직 저장된 발표 대본이 없습니다.</p>
                  <p className="text-xs sm:text-sm text-slate-500">대본을 생성하거나 직접 입력하면 이곳에 자동으로 보관됩니다.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 2: OFFLINE PRACTICE */}
        {subTab === "practice" && <OfflinePractice userId={user?.uid || ""} topic={practiceTopic} scripts={scripts} isActive={isActive} />}

      </AnimatePresence>

      {isActive && createPortal(
        <AnimatePresence>
          {savedScriptOpen && scriptPanel && (
            <motion.div
              key="saved-script-fullscreen"
              role="dialog"
              aria-modal="true"
              aria-label="저장된 발표 대본"
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ duration: 0.22 }}
              className={`fixed inset-0 z-[100] flex flex-col ${darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-800"}`}
            >
              <header className="shrink-0 safe-top border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="max-w-5xl mx-auto w-full px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-brand">저장된 발표 대본</p>
                    <h2 className="text-base font-black truncate">{generatedScript?.title}</h2>
                  </div>
                  <button type="button" onClick={closeSavedScript} aria-label="대본 닫기" className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                    <X size={24} />
                  </button>
                </div>
              </header>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
                <div className="max-w-5xl mx-auto">{scriptPanel}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

    </div>
  );
}
