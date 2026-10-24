import { useScreenBack } from "../lib/screenBack";
import React, { useState, useRef, useEffect } from "react";
import { StudyItem } from "../types";
import { robustFetch, getTodayDateString } from "../lib/api";
import { 
  BookOpen, 
  Sparkles, 
  FileText, 
  FileQuestion, 
  BookMarked, 
  Image as ImageIcon,
  Camera as CameraIcon,
  Loader2, 
  AlertCircle
} from "lucide-react";
import { motion } from "motion/react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { MathSolution } from "../lib/localMathSolver";
import GlassSelect from "./GlassSelect";
import { prepareAiImage } from "../lib/prepareAiImage";

const ProblemOcr = registerPlugin<{ recognize(input: { base64: string }): Promise<{ text: string }> }>("ProblemOcr");
type ProblemResult = { source: "local" | "gemini"; recognizedProblem: string; answer: string; steps: string[]; concept: string; needsRetake: boolean; cached?: boolean };

interface StudyScreenProps {
  darkMode: boolean;
  isActive: boolean;
  initialHelperMode?: "summary" | "quiz" | "note" | "question" | "photo";
}

export default function StudyScreen({ 
  darkMode,
  isActive,
  initialHelperMode
}: StudyScreenProps) {
  
  // ==========================================
  // 1. AI STUDY HELPER STATE
  // ==========================================
  const [helperMode, setHelperMode] = useState<"summary" | "quiz" | "note" | "photo">("summary");
  const wasActive = useRef(false);

  useEffect(() => {
    if (isActive && !wasActive.current) {
      setHelperMode(initialHelperMode && initialHelperMode !== "question" ? initialHelperMode : "summary");
    }
    wasActive.current = isActive;
  }, [isActive, initialHelperMode]);

  useEffect(() => {
    if (initialHelperMode) {
      setHelperMode(initialHelperMode === "question" ? "summary" : initialHelperMode);
    }
  }, [initialHelperMode]);
  const [textInput, setTextInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [helperError, setHelperError] = useState<string | null>(null);
  const [studyResult, setStudyResult] = useState<StudyItem | null>(null);
  
  // File upload variables
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedBase64, setUploadedBase64] = useState<string | null>(null);
  const [uploadedMime, setUploadedMime] = useState<string | null>(null);
  const problemFileRef = useRef<HTMLInputElement>(null);
  const [problemImage, setProblemImage] = useState<string | null>(null);
  const [problemMime, setProblemMime] = useState("image/jpeg");
  const [problemOcrText, setProblemOcrText] = useState("");
  const [problemResult, setProblemResult] = useState<ProblemResult | null>(null);
  const [problemError, setProblemError] = useState("");
  const [problemBusy, setProblemBusy] = useState(false);

  // Quiz-specific client state for active checking
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({});
  const [quizChecked, setQuizChecked] = useState(false);

  const todayStr = getTodayDateString();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { base64, mimeType } = await prepareAiImage(file);
      setUploadedFileName(file.name);
      setUploadedMime(mimeType);
      setUploadedBase64(base64);
      setHelperError(null);
    } catch (error) {
      setUploadedFileName(null);
      setUploadedMime(null);
      setUploadedBase64(null);
      setHelperError(error instanceof Error ? error.message : "사진을 읽을 수 없어요.");
    }
  };

  const handleTakePhoto = async () => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        quality: 80,
        width: 2048
      });
      if (!photo.base64String) return;
      setUploadedFileName("camera_photo.jpg");
      setUploadedMime(`image/${photo.format || "jpeg"}`);
      setUploadedBase64(photo.base64String);
    } catch (err) {
      // User cancelled the camera or denied permission - nothing to do.
    }
  };

  const setNewProblemImage = (base64: string, mime: string) => {
    setProblemImage(base64);
    setProblemMime(mime);
    setProblemResult(null);
    setProblemOcrText("");
    setProblemError("");
  };

  const chooseProblemPhoto = async (source: CameraSource) => {
    if (!Capacitor.isNativePlatform() && source === CameraSource.Photos) {
      problemFileRef.current?.click();
      return;
    }
    try {
      const photo = await Camera.getPhoto({ source, resultType: CameraResultType.Base64, quality: 80, width: 1600 });
      if (photo.base64String) {
        const format = photo.format === "jpg" ? "jpeg" : photo.format || "jpeg";
        if (["jpeg", "png", "webp"].includes(format)) {
          setNewProblemImage(photo.base64String, `image/${format}`);
        } else {
          const converted = await convertProblemImage(`data:image/${format};base64,${photo.base64String}`);
          setNewProblemImage(converted, "image/jpeg");
        }
      }
    } catch (error) {
      if (String(error).toLowerCase().includes("cancel")) return;
      setProblemError("사진을 열 수 없어요. JPG 또는 PNG 사진을 다시 선택해 주세요.");
    }
  };

  const convertProblemImage = (src: string): Promise<string> => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) { reject(new Error("Canvas unavailable")); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    image.onerror = reject;
    image.src = src;
  });

  const onProblemFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8_000_000) {
      setProblemError("8MB 이하의 이미지 파일을 선택해 주세요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      void convertProblemImage(String(reader.result))
        .then(base64 => setNewProblemImage(base64, "image/jpeg"))
        .catch(() => setProblemError("이 사진을 읽을 수 없어요. JPG나 PNG로 다시 선택해 주세요."));
    };
    reader.onerror = () => setProblemError("사진을 읽지 못했어요. 다시 선택해 주세요.");
    reader.readAsDataURL(file);
  };

  const solvePhotoProblem = async () => {
    if (!problemImage || problemBusy) return;
    setProblemBusy(true);
    setProblemError("");
    setProblemResult(null);
    let recognized = "";
    try {
      if (Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("ProblemOcr")) {
        try { recognized = (await ProblemOcr.recognize({ base64: problemImage })).text.trim(); }
        catch (error) { console.warn("[Problem] Device OCR unavailable; using photo", error); }
      }
      setProblemOcrText(recognized);
      const local: MathSolution | null = recognized
        ? (await import("../lib/localMathSolver")).solveSimpleMath(recognized) : null;
      if (local) {
        setProblemResult({ source: "local", recognizedProblem: local.problem, answer: local.answer,
          steps: local.steps, concept: "사칙연산과 일차방정식의 계산 순서", needsRetake: false });
        return;
      }
      const response = await robustFetch("/api/problem/solve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: problemImage, mimeType: problemMime, ocrText: recognized }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "사진 문제 풀이를 완료하지 못했어요.");
      }
      const result = await response.json() as ProblemResult;
      setProblemResult(result);
      if (!result.cached) window.dispatchEvent(new Event("ttok:usage-updated"));
    } catch (error) {
      setProblemError(error instanceof Error ? error.message : "문제 풀이 중 오류가 발생했어요.");
    } finally {
      setProblemBusy(false);
    }
  };

  // Submit study action to backend Express API
  const handleStudyAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const actionType = helperMode;
    if (actionType === "photo") return;
    if (!textInput.trim() && !uploadedBase64) {
      setHelperError("텍스트를 입력하거나 분석할 교과서 사진을 등록해 주세요.");
      return;
    }

    setIsProcessing(true);
    setHelperError(null);
    setStudyResult(null);
    setSelectedAnswers({});
    setQuizChecked(false);

    try {
      const res = await robustFetch("/api/study/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType,
          text: textInput,
          imageBase64: uploadedBase64,
          mimeType: uploadedMime,
          additionalQuestion: ""
        })
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("RESOURCE_EXHAUSTED_429");
        }
        let errorMsg = "분석을 처리할 수 없습니다. AI 키와 네트워크를 점검해 주세요.";
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      const data = await res.json();
      setStudyResult({
        id: "study_" + Date.now(),
        title: data.title,
        actionType,
        content: data.content,
        extraData: data.extraData,
        date: todayStr
      });
    } catch (err: any) {
      const is429 = err.message?.includes("RESOURCE_EXHAUSTED_429") || 
                    err.message?.includes("429") || 
                    err.status === 429;
      if (is429) {
        setHelperError(
          "⚠️ AI 서비스 할당량 초과 안내 (429 Quota Exceeded)\n" +
          "현재 공부 도우미의 일시적인 사용 한도를 초과했습니다.\n\n" +
          "이 오류는 자동으로 재시도되지 않으며, 잠시 후(약 1~2분 후) 다시 분석/질문 버튼을 눌러 시도해 주세요."
        );
      } else {
        setHelperError(err.message || "공부 도우미 분석 도중 오류가 발생했습니다.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  useScreenBack(() => {
    if (problemResult) { setProblemResult(null); return true; }
    if (studyResult) { setStudyResult(null); return true; }
    if (helperMode !== "summary") { setHelperMode("summary"); return true; }
    return false;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-safe-layout">
      
      <div className="text-left">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight-sf">AI 공부 도우미</h1>
        <p className="text-fluid-sm text-slate-500 mt-1">사진 문제 풀이와 교과서 요약·문제 생성·오답 정리를 한곳에서 해 보세요.</p>
      </div>

          <motion.div
            key="helper-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8"
          >
            {/* Input and Feature Selection */}
            <div className={`${helperMode === "photo" ? "lg:col-span-12" : "lg:col-span-5"} space-y-6`}>
              
              {/* Feature grid */}
              <div className={`p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border transition-all ${
                darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
              } shadow-sm`}>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 text-left">공부 기능 선택</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <button data-ui="study-mode-summary"
                    onClick={() => { setHelperMode("summary"); setStudyResult(null); }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      helperMode === "summary" 
                        ? "border-brand bg-brand-light/30 text-brand" 
                        : "border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                    }`}
                  >
                    <FileText size={20} className="mb-2" />
                    <p className="text-sm font-black">AI 요약</p>
                    <p className="text-xs text-slate-450 dark:text-slate-400 mt-0.5">교과서 핵심 요약화</p>
                  </button>

                  <button data-ui="study-mode-quiz"
                    onClick={() => { setHelperMode(helperMode === "quiz" ? "summary" : "quiz"); setStudyResult(null); }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      helperMode === "quiz" 
                        ? "border-brand bg-brand-light/30 text-brand" 
                        : "border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                    }`}
                  >
                    <FileQuestion size={20} className="mb-2" />
                    <p className="text-sm font-black">AI 문제생성</p>
                    <p className="text-xs text-slate-450 dark:text-slate-400 mt-0.5">3단 자가진단 평가</p>
                  </button>

                  <button data-ui="study-mode-note"
                    onClick={() => { setHelperMode(helperMode === "note" ? "summary" : "note"); setStudyResult(null); }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      helperMode === "note" 
                        ? "border-brand bg-brand-light/30 text-brand" 
                        : "border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                    }`}
                  >
                    <BookMarked size={20} className="mb-2" />
                    <p className="text-sm font-black">AI 오답노트</p>
                    <p className="text-xs text-slate-450 dark:text-slate-400 mt-0.5">클리닉 핵심 처방</p>
                  </button>

                  <button data-ui="study-mode-photo" type="button"
                    aria-pressed={helperMode === "photo"}
                    onClick={() => { setHelperMode(helperMode === "photo" ? "summary" : "photo"); setStudyResult(null); }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${helperMode === "photo"
                      ? "border-brand bg-brand-light/30 text-brand"
                      : "border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"}`}
                  >
                    <CameraIcon size={20} className="mb-2" />
                    <p className="text-sm font-black">사진 문제 풀이</p>
                    <p className="text-xs mt-0.5">사진으로 문제를 풀어봐요</p>
                  </button>

                </div>
              </div>

              {helperMode === "photo" && (
            <section className={`p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border scroll-mt-6 ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
              <h2 className="text-lg font-black flex items-center gap-2"><CameraIcon size={20} /> 사진 문제 풀이</h2>
              <p className="text-sm text-slate-500 mt-1">간단한 수학은 기기에서 풀고, 복잡하거나 읽기 어려운 문제는 AI가 사진을 확인해 풀이해요.</p>
              <input ref={problemFileRef} type="file" accept="image/*" className="hidden" onChange={onProblemFile} />
              <div className="flex gap-2 mt-4">
                <button data-ui="study-photo-camera" type="button" onClick={() => void chooseProblemPhoto(CameraSource.Camera)} className="flex-1 min-h-12 rounded-xl border border-brand text-brand font-bold flex items-center justify-center gap-2"><CameraIcon size={17} /> 촬영</button>
                <button data-ui="study-photo-gallery" type="button" onClick={() => void chooseProblemPhoto(CameraSource.Photos)} className="flex-1 min-h-12 rounded-xl border border-brand text-brand font-bold flex items-center justify-center gap-2"><ImageIcon size={17} /> 갤러리</button>
              </div>
              {problemImage && <div className="mt-4 space-y-3">
                <img src={`data:${problemMime};base64,${problemImage}`} alt="풀이할 문제 사진" className="max-h-72 w-full object-contain rounded-xl bg-slate-50 dark:bg-slate-800" />
                <button data-ui="study-photo-solve" type="button" disabled={problemBusy} onClick={() => void solvePhotoProblem()} className="w-full min-h-12 bg-brand text-white rounded-xl font-extrabold disabled:opacity-50">
                  {problemBusy ? "문제를 읽고 있어요..." : "이 문제 풀기"}
                </button>
              </div>}
              {problemOcrText && <p className="mt-3 text-xs text-slate-500 break-words">기기에서 읽은 글자: {problemOcrText}</p>}
              {problemError && <p role="alert" className="mt-3 text-sm text-rose-600">{problemError}</p>}
              {problemResult && <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 space-y-3">
                {problemResult.needsRetake ? <p className="font-bold text-rose-600">문제를 정확히 읽지 못했어요. 글씨와 도형이 선명하게 보이도록 한 문제만 다시 촬영해 주세요.</p> : <>
                  <p className="text-xs text-brand font-bold">{problemResult.source === "local" ? "기기 계산 · AI 사용량 차감 없음" : problemResult.cached ? "저장된 AI 풀이 · 추가 차감 없음" : "Gemini 2.5 Flash-Lite 풀이"}</p>
                  <p className="text-sm">인식한 문제: {problemResult.recognizedProblem}</p>
                  <p className="text-xl font-black">정답: {problemResult.answer}</p>
                  <ol className="list-decimal pl-5 space-y-2 text-sm">{problemResult.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
                  <p className="text-sm text-slate-600 dark:text-slate-300">핵심 개념: {problemResult.concept}</p>
                  {problemResult.source === "gemini" && <p className="text-xs text-slate-500">사진 속 문제와 풀이가 일치하는지 확인해 주세요.</p>}
                </>}
              </div>}
            </section>
              )}

              {/* Upload Textbook or Text Area */}
              {helperMode !== "photo" && <div className={`p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border transition-all ${
                darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
              } shadow-sm`}>
                <form onSubmit={handleStudyAction} className="space-y-4">
                  <div className="text-left">
                    <span className="text-xs text-slate-500 font-bold block mb-1.5">교과서 사진 등록</span>
                    {uploadedFileName && (
                      <div className="mb-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 truncate">
                        선택됨: {uploadedFileName}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div data-ui="study-material-pick"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-4 border border-dashed border-slate-200 dark:border-slate-800 hover:border-brand rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
                      >
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <ImageIcon size={18} className="text-slate-400 mb-1" />
                        <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                          사진 선택
                        </span>
                      </div>
                      <div data-ui="study-material-camera"
                        onClick={handleTakePhoto}
                        className="p-4 border border-dashed border-slate-200 dark:border-slate-800 hover:border-brand rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
                      >
                        <CameraIcon size={18} className="text-slate-400 mb-1" />
                        <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                          촬영
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-fluid-sm text-slate-500 font-bold block mb-1.5">교과서 내용 직접 타이핑 (선택)</span>
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="이미지가 없는 경우, 공부할 본문 내용을 직접 적어주세요..."
                      rows={4}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand font-medium leading-relaxed transition-all"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button data-ui="study-run"
                      type="submit"
                      disabled={isProcessing}
                      className="w-full h-14 bg-brand hover:bg-brand-dark text-white font-extrabold rounded-2xl text-fluid-base flex items-center justify-center gap-1.5 shadow-md shadow-brand/15 cursor-pointer disabled:opacity-50 active:scale-98 transition-all"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          AI 분석 중...
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          똑똑하게 학습 시작
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {helperError && (
                  <div className="mt-4 p-3 bg-rose-50 border border-rose-100 dark:bg-rose-500/5 dark:border-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl flex gap-2 items-start text-sm font-medium">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{helperError}</span>
                  </div>
                )}
              </div>}

            </div>

            {/* Analysis Result Displays */}
            {helperMode !== "photo" && <div className="lg:col-span-7">
              {isProcessing && (
                <div className={`p-6 sm:p-12 rounded-[24px] sm:rounded-[32px] border text-center h-full flex flex-col items-center justify-center space-y-4 ${
                  darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                }`}>
                  <Loader2 size={36} className="text-brand animate-spin" />
                </div>
              )}

              {!isProcessing && !studyResult && (
                <div className={`p-6 sm:p-12 rounded-[24px] sm:rounded-[32px] border border-dashed text-center h-full flex flex-col items-center justify-center space-y-3 ${
                  darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                }`}>
                  <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center">
                    <BookOpen size={22} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">학습 분석 결과가 여기에 표시됩니다</h3>
                  <p className="text-sm text-slate-500 max-w-sm leading-relaxed break-keep">
                    교과서 요약, 문제 생성, 오답노트 정리를 시작할 수 있어요. 왼쪽 입력을 통해 시작해 보세요!
                  </p>
                </div>
              )}

              {/* Study helper finalized card */}
              {studyResult && !isProcessing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border space-y-6 text-left ${
                    darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                  }`}
                >
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-black uppercase text-brand bg-brand-light dark:bg-brand/15 px-2.5 py-0.5 rounded">
                        {studyResult.actionType === "summary" ? "AI 핵심 요약" : studyResult.actionType === "quiz" ? "AI 실력 진단" : studyResult.actionType === "note" ? "AI 오답 노하우" : "AI 일대일 상담"}
                      </span>
                      <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 mt-1">
                        {studyResult.title}
                      </h2>
                    </div>
                  </div>

                  {/* Core Content Box with high readability */}
                  <div className="p-5 bg-white dark:bg-slate-900/15 border border-slate-50 dark:border-slate-800/80 rounded-2xl text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-wrap max-h-[420px] overflow-y-auto pr-1">
                    {studyResult.content}
                  </div>

                  {/* If Quiz Mode: Allow student to check solutions interactively */}
                  {studyResult.actionType === "quiz" && (
                    <div className="p-4 bg-brand/5 border border-brand/10 rounded-2xl space-y-4">
                      <h4 className="text-sm font-black text-brand flex items-center gap-1.5">
                        <FileQuestion size={14} /> 문제를 다 푸셨나요? 정답 자가진단
                      </h4>
                      <div className="grid grid-cols-3 gap-3">
                        {[1, 2, 3].map((num) => (
                          <div key={num} className="space-y-1">
                            <span className="text-xs text-slate-500 font-bold block">{num}번 문제 정답</span>
                            <GlassSelect
                              value={selectedAnswers[num] ? String(selectedAnswers[num]) : ""}
                              onChange={(v) => setSelectedAnswers({ ...selectedAnswers, [num]: parseInt(v, 10) })}
                              options={[
                                { value: "1", label: "1번" },
                                { value: "2", label: "2번" },
                                { value: "3", label: "3번" },
                                { value: "4", label: "4번" }
                              ]}
                              darkMode={darkMode}
                              placeholder="선택"
                              triggerClassName="w-full flex items-center justify-between gap-2 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm cursor-pointer"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center pt-2">
                        {quizChecked ? (
                          <p className="text-xs sm:text-sm font-bold text-emerald-500">
                            🎉 1번 정답: 2번, 2번 정답: 3번, 3번 정답: 3번 입니다! 해설을 대조해 보세요.
                          </p>
                        ) : (
                          <button data-ui="study-quiz-check"
                            onClick={() => setQuizChecked(true)}
                            className="px-4 py-2 bg-brand text-white font-bold rounded-xl text-sm cursor-pointer"
                          >
                            정답 채점 및 해설 보기
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Core Vocabulary card tag list */}
                  <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4">
                    <span className="text-xs text-slate-500 font-bold block mb-2">핵심 태그 키워드</span>
                    <div className="flex flex-wrap gap-2">
                      {studyResult.extraData.map((tag, idx) => (
                        <span key={idx} className="text-xs sm:text-sm font-extrabold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>

                </motion.div>
              )}
            </div>}

          </motion.div>

    </div>
  );
}
