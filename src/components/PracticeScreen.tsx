import React, { useState, useEffect, useRef } from "react";
import { ScriptItem, PracticeLog } from "../types";
import { getApiUrl, robustFetch, getTodayDateString } from "../lib/api";
import { isNativeApp, openNativeSettings } from "../lib/capacitor";
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
  FolderOpen
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import GlassSelect from "./GlassSelect";
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer 
} from "recharts";

interface PracticeScreenProps {
  user: any;
  scripts: ScriptItem[];
  onAddScript: (script: ScriptItem) => void;
  onDeleteScript?: (id: string) => void;
  onUpdateScript?: (script: ScriptItem) => void;
  practiceLogs: PracticeLog[];
  onAddPracticeLog: (log: Omit<PracticeLog, "id" | "date">) => void;
  darkMode: boolean;
  initialSubTab?: "script" | "practice";
}

export default function PracticeScreen({ 
  user,
  scripts, 
  onAddScript, 
  onDeleteScript,
  onUpdateScript,
  practiceLogs, 
  onAddPracticeLog, 
  darkMode,
  initialSubTab
}: PracticeScreenProps) {
  const [subTab, setSubTab] = useState<"script" | "practice">("script");

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Automatically check and request runtime permissions when first switching to practice tab
  useEffect(() => {
    const autoRequestPermissions = async () => {
      if (subTab === "practice") {
        try {
          if (navigator.permissions && navigator.permissions.query) {
            const camQuery = await navigator.permissions.query({ name: "camera" as any });
            const micQuery = await navigator.permissions.query({ name: "microphone" as any });

            if (camQuery.state === "denied" || micQuery.state === "denied") {
              // Permissions were blocked previously. Show the permission guide modal directly.
              setHasPermission(false);
              setPermissionError("PermissionDeniedError");
              setShowPermissionModal(true);
            } else {
              // Permission is either granted or prompt, request/initialize it
              handleRequestPermissions();
            }
          } else {
            // Permissions API not supported, request via standard getUserMedia call
            handleRequestPermissions();
          }
        } catch (e) {
          console.warn("Auto-checking permissions failed, requesting via fallback:", e);
          handleRequestPermissions();
        }
      }
    };
    autoRequestPermissions();
  }, [subTab]);

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
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isEditingScriptText, setIsEditingScriptText] = useState(false);
  const [editedScriptContent, setEditedScriptContent] = useState("");

  // ==========================================
  // 2. PRACTICE REHEARSAL STATE
  // ==========================================
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<PracticeLog | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  // Custom Direct Script Input and Prompter states
  const [scriptInputMode, setScriptInputMode] = useState<"saved" | "direct">("saved");
  const [customScriptText, setCustomScriptText] = useState("");
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [selectedScriptText, setSelectedScriptText] = useState("");
  const [showTeleprompter, setShowTeleprompter] = useState(true);
  const [prompterTextSize, setPrompterTextSize] = useState<"sm" | "base" | "lg" | "xl" | "2xl">("xl");

  const getTextSizeClass = (size: "sm" | "base" | "lg" | "xl" | "2xl") => {
    switch (size) {
      case "sm": return "text-xs sm:text-sm";
      case "base": return "text-sm sm:text-base leading-relaxed";
      case "lg": return "text-base sm:text-lg leading-relaxed";
      case "xl": return "text-lg sm:text-xl leading-relaxed";
      case "2xl": return "text-xl sm:text-2xl leading-loose font-bold";
      default: return "text-lg sm:text-xl leading-relaxed";
    }
  };

  // Auto-select the first script from histories if available
  useEffect(() => {
    if (scripts && scripts.length > 0 && !selectedScriptId) {
      const firstScript = scripts[0];
      setSelectedScriptId(firstScript.id);
      setPracticeTopic(firstScript.topic);
      setSelectedScriptText(firstScript.script);
      setTranscript(firstScript.script.substring(0, 200) + "...");
    }
  }, [scripts]);
  
  // Recording stats
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState<number[]>(Array(12).fill(15));
  
  // Media refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const speechListenerRef = useRef<{ remove: () => Promise<void> } | null>(null);
  const isListeningRef = useRef(false);

  const stopSpeechRecognition = async () => {
    if (speechListenerRef.current) {
      try { await speechListenerRef.current.remove(); } catch (e) {}
      speechListenerRef.current = null;
    }
    if (isListeningRef.current) {
      isListeningRef.current = false;
      try { await SpeechRecognition.stop(); } catch (e) {}
    }
  };

  // Clean up media streams and timers
  useEffect(() => {
    return () => {
      stopStreams();
      if (timerRef.current) clearInterval(timerRef.current);
      stopSpeechRecognition();
    };
  }, []);

  // Re-bind active camera stream to videoRef element when it mounts/remounts (fullscreen toggle)
  useEffect(() => {
    if (videoRef.current && mediaStreamRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
    }
  }, [isRecording, hasPermission]);

  // Auto-restart camera preview when resetting the analysis result or returning to rehearsal dashboard
  useEffect(() => {
    if (subTab === "practice" && !analysisResult && !isRecording && !mediaStreamRef.current && hasPermission) {
      handleRequestPermissions();
    }
  }, [subTab, analysisResult, isRecording]);

  const stopStreams = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

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

      if (!res.ok) {
        let errorDetails = "";
        try {
          const errData = await res.json();
          errorDetails = errData.error || errData.message || JSON.stringify(errData);
        } catch (e) {
          try {
            errorDetails = await res.text();
          } catch (textErr) {
            errorDetails = `HTTP status ${res.status}`;
          }
        }
        console.error(`[PracticeScreen] Script generation failed. Server status: ${res.status}. Details: ${errorDetails}`);
        throw new Error(`대본 생성 실패 (서버 상태코드 ${res.status}): ${errorDetails || "상태 설명 없음"}`);
      }
      
      const data = await res.json();
      console.log("[PracticeScreen] Received script successfully:", data);

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
      const is429 = err.message?.includes("RESOURCE_EXHAUSTED_429") || 
                    err.message?.includes("429") || 
                    err.status === 429;
      if (is429) {
        setScriptError(
          "⚠️ AI 서비스 할당량 초과 안내 (429 Quota Exceeded)\n" +
          "현재 무료 AI 기능의 일시적인 사용량 제한을 초과했습니다. 똑(TTOK) 서비스는 비용 걱정 없이 언제나 무료로 사용할 수 있도록 영구 무료 AI 모델을 제공하고 있습니다.\n\n" +
          "이 오류는 자동으로 재시도되지 않으며, 잠시 후(약 1~2분 후) 다시 아래 '대본 자동 생성' 버튼을 눌러주시면 정상 처리됩니다."
        );
      } else {
        setScriptError(err.message || "대본을 생성하는 중 예기치 못한 네트워크 오류가 발생했습니다.");
      }
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
    try {
      if (navigator.share) {
        await navigator.share({
          title: `[똑] ${generatedScript.title}`,
          text: `똑(Tok) AI가 작성해 준 발표 대본:\n\n${editedScriptContent}`,
        });
      } else {
        alert("이 기기에서는 직접 공유 API가 지원되지 않습니다. 복사 기능을 이용해 주세요!");
      }
    } catch (e) {}
  };

  const handleSavePDF = () => {
    // Generate a simple print-like window download
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${generatedScript?.title || "발표대본"}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
            h1 { font-size: 24px; border-bottom: 2px solid #0066FF; padding-bottom: 10px; margin-bottom: 20px; }
            h2 { font-size: 16px; color: #475569; }
            .script-box { background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #0066FF; white-space: pre-wrap; font-size: 14px; }
            .outline { margin-bottom: 20px; padding: 15px; background: #f1f5f9; border-radius: 8px; }
            .tips { margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>똑(Tok) AI 발표대본: ${generatedScript?.title}</h1>
          <div class="outline">
            <h2>발표 아웃라인 요약</h2>
            <ul>
              ${generatedScript?.outline.map((o: string) => `<li>${o}</li>`).join("")}
            </ul>
          </div>
          <div class="script-box">${editedScriptContent}</div>
          <div class="tips">
            <h2>AI 발표 전략 및 팁</h2>
            <ul>
              ${generatedScript?.tips.map((t: string) => `<li>${t}</li>`).join("")}
            </ul>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // ==========================================
  // 2. REHEARSAL ACTIONS
  // ==========================================
  const handleRequestPermissions = async () => {
    setPermissionError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn("navigator.mediaDevices is not supported in this browser or context.");
      setPermissionError("SECURE_CONTEXT_REQUIRED");
      setHasPermission(false);
      setShowPermissionModal(true);
      return;
    }

    // 1. Pre-check standard web permissions API if available. Microphone isn't
    // requested here anymore (the native SpeechRecognition plugin owns it), so
    // only the camera's state should gate the video preview.
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const camQuery = await navigator.permissions.query({ name: "camera" as any });

        if (camQuery.state === "denied") {
          console.warn("Camera permission is explicitly denied.");
          setPermissionError("PermissionDeniedError");
          setHasPermission(false);
          setShowPermissionModal(true);
          return;
        }
      }
    } catch (e) {
      console.warn("Permissions API check not supported or threw an error:", e);
    }

    // Video-only: the microphone is captured separately by the native
    // SpeechRecognition plugin (see startPracticeRecording). Also requesting
    // audio here would make the WebView hold the mic via getUserMedia at the
    // same time the native recognizer opens its own audio session, which
    // silently starves the recognizer of input on both iOS (AVAudioSession
    // conflict) and Android — the subtitle would never update even though
    // nothing throws an error.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasPermission(true);
      setShowPermissionModal(false);
    } catch (err: any) {
      console.warn("Initial getUserMedia failed, attempting fallback...", err);

      // Fallback: generic video constraints
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setHasPermission(true);
        setShowPermissionModal(false);
        return;
      } catch (err2: any) {
        console.error("All media requests failed:", err2);
        setPermissionError(err2.name || err2.message || "UnknownError");
        setHasPermission(false);
        setShowPermissionModal(true);
      }
    }
  };

  const startPracticeRecording = async () => {
    setIsRecording(true);
    setSeconds(0);
    setTranscript("");
    setAnalysisResult(null);
    setAnalysisError(null);

    // 1. Start native Speech Recognition (works inside the packaged app, unlike the
    // browser Web Speech API which iOS WKWebView doesn't implement at all and Android's
    // embedded WebView can't reliably reach without this plugin's native bridge).
    try {
      const { available } = await SpeechRecognition.available();
      if (!available) throw new Error("not-available");

      const permission = await SpeechRecognition.requestPermissions();
      if (permission.speechRecognition !== "granted") throw new Error("permission-denied");

      const listener = await SpeechRecognition.addListener("partialResults", (data) => {
        if (data.matches?.length) {
          setTranscript(data.matches[0]);
        }
      });
      speechListenerRef.current = listener;
      isListeningRef.current = true;

      SpeechRecognition.start({
        language: "ko-KR",
        partialResults: true,
        popup: false
      }).catch((err) => console.log("Speech recognition ended:", err));
    } catch (err: any) {
      console.log("Speech recognition unavailable:", err);
      const reason = err?.message || String(err);
      if (reason === "not-available") {
        setTranscript("이 기기에서 음성 인식 서비스를 찾을 수 없어요. Google 앱(또는 음성 서비스)이 설치·활성화되어 있는지 확인해주세요.");
      } else if (reason === "permission-denied") {
        setTranscript("음성 인식 권한이 꺼져 있어요. 아이폰은 설정 > 똑 에서 '마이크'와 별개로 '음성 인식' 권한도 따로 켜야 해요. 안드로이드는 설정 > 앱 > 똑 > 권한에서 '마이크'를 허용해주세요.");
      } else {
        setTranscript(`음성 인식을 시작하지 못했어요 (${reason}). 말한 내용에 어울리는 똑똑한 AI 분석이 진행됩니다.`);
      }
    }

    // 2. Start stats timer
    timerRef.current = setInterval(() => {
      setSeconds(prev => prev + 1);

      // Simulate pulsating microphone levels
      setAudioLevel(Array.from({ length: 12 }, () => Math.floor(Math.random() * 45) + 10));
    }, 1000);
  };

  const stopPracticeRecording = async () => {
    setIsRecording(false);

    // Stop recording timer & stream
    if (timerRef.current) clearInterval(timerRef.current);
    await stopSpeechRecognition();
    stopStreams();

    // Trigger AI Analysis
    setIsAnalyzing(true);
    setAnalysisError(null);

    const finalTranscript = transcript.trim() || `${practiceTopic || "자유 발표"} 발표를 힘차게 진행했습니다. 전체 시간은 ${seconds}초이고 바른 시선과 목소리를 냈습니다.`;
    const path = "/api/practice/analyze";
    console.log(`[PracticeScreen] [stopPracticeRecording] Initiating robust API call to: ${path}`);
    console.log(`[PracticeScreen] Request payload:`, {
      topic: practiceTopic || "자유 발표 주제",
      transcript: finalTranscript,
      duration: seconds
    });

    try {
      const res = await robustFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: practiceTopic || "자유 발표 주제",
          transcript: finalTranscript,
          duration: seconds
        })
      });

      console.log(`[PracticeScreen] Practice analysis response status: ${res.status} (${res.statusText})`);

      if (!res.ok) {
        let errorDetails = "";
        try {
          const errData = await res.json();
          errorDetails = errData.error || errData.message || JSON.stringify(errData);
        } catch (e) {
          try {
            errorDetails = await res.text();
          } catch (textErr) {
            errorDetails = `HTTP status ${res.status}`;
          }
        }
        console.error(`[PracticeScreen] Practice analysis failed. Server status: ${res.status}. Details: ${errorDetails}`);
        throw new Error(`분석 실패 (서버 상태코드 ${res.status}): ${errorDetails || "상태 설명 없음"}`);
      }

      const data = await res.json();
      console.log("[PracticeScreen] Received analysis data successfully:", data);
      
      const logPayload = {
        topic: practiceTopic || "자유 발표 주제",
        totalScore: data.totalScore,
        duration: seconds,
        scores: data.scores,
        voiceAnalysis: data.voiceAnalysis,
        videoAnalysis: data.videoAnalysis,
        feedback: data.feedback
      };

      const today = new Date();
      const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');
      setAnalysisResult({ ...logPayload, id: "practice_" + Date.now(), date: todayStr });
      onAddPracticeLog(logPayload);

    } catch (err: any) {
      console.error("[PracticeScreen] Practice analysis fetch error:", err);
      const is429 = err.message?.includes("RESOURCE_EXHAUSTED_429") || 
                    err.message?.includes("429") || 
                    err.status === 429;
      if (is429) {
        setAnalysisError(
          "⚠️ AI 서비스 할당량 초과 안내 (429 Quota Exceeded)\n" +
          "현재 무료 AI 발표 분석의 사용 한도를 일시적으로 초과했습니다.\n\n" +
          "이 오류는 자동으로 재시도되지 않으며, 잠시 후(약 1~2분 후) 다시 '연습 종료 및 AI 종합 분석' 버튼을 눌러 시도해 주세요."
        );
      } else {
        setAnalysisError(
          `${err.message || "발표 분석 처리 도중 예기치 못한 오류가 발생했습니다."}\n` +
          `대상 경로: /api/practice/analyze`
        );
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Prepare radar chart data matching the analysis items
  const getRadarData = () => {
    if (!analysisResult) return [];
    return [
      { subject: "시선", score: analysisResult.scores?.eye_contact ?? 80, fullMark: 100 },
      { subject: "목소리", score: analysisResult.scores?.voice ?? 80, fullMark: 100 },
      { subject: "발음", score: analysisResult.scores?.pronunciation ?? 80, fullMark: 100 },
      { subject: "자세", score: analysisResult.scores?.posture ?? 80, fullMark: 100 },
      { subject: "손동작", score: analysisResult.scores?.gestures ?? 80, fullMark: 100 },
      { subject: "표정", score: analysisResult.scores?.expression ?? 80, fullMark: 100 }
    ];
  };

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

                {!isGeneratingScript && !generatedScript && (
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

                {!isGeneratingScript && generatedScript && (
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
                        <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-1 rounded-xl self-start sm:self-auto max-w-full overflow-x-auto scrollbar-none flex-nowrap">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-extrabold px-1.5 shrink-0">크기</span>
                          <button
                            type="button"
                            onClick={() => setPrompterTextSize("sm")}
                            className={`h-9 px-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${prompterTextSize === "sm" ? "bg-brand text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
                          >
                            작게
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrompterTextSize("base")}
                            className={`h-9 px-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${prompterTextSize === "base" ? "bg-brand text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
                          >
                            보통
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrompterTextSize("lg")}
                            className={`h-9 px-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${prompterTextSize === "lg" ? "bg-brand text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
                          >
                            크게
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrompterTextSize("xl")}
                            className={`h-9 px-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${prompterTextSize === "xl" ? "bg-brand text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
                          >
                            더크게
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrompterTextSize("2xl")}
                            className={`h-9 px-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${prompterTextSize === "2xl" ? "bg-brand text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
                          >
                            최대
                          </button>
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
                )}
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
                        
                        <div className="cursor-pointer" onClick={() => {
                          setGeneratedScript(s);
                          setEditedScriptContent(s.script);
                          setScriptTopic(s.topic);
                          setSubject(s.subject || "");
                          setTime(s.time || "3분");
                          setAudience(s.audience || "청중");
                          setGrade(s.grade || "3학년");
                          setTone(s.tone || "친근한 말투");
                          setPurpose(s.purpose || "");
                          setStyle(s.style || "");
                        }}>
                          <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 group-hover:text-brand transition-colors line-clamp-1">
                            {s.title}
                          </h3>
                          <p className="text-sm text-slate-500 font-semibold line-clamp-1 mt-0.5">
                            주제: {s.topic}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3 mt-2 leading-relaxed">
                            {s.script}
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-850/60 mt-4 pt-3">
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                          ⏱️ {s.time || "3분"}
                        </span>
                        
                        <div className="flex gap-2.5 items-center">
                          <button
                            type="button"
                            onClick={() => {
                              setGeneratedScript(s);
                              setEditedScriptContent(s.script);
                              setScriptTopic(s.topic);
                              setSubject(s.subject || "");
                              setTime(s.time || "3분");
                              setAudience(s.audience || "청중");
                              setGrade(s.grade || "3학년");
                              setTone(s.tone || "친근한 말투");
                              setPurpose(s.purpose || "");
                              setStyle(s.style || "");
                            }}
                            className="h-11 px-4 text-fluid-sm font-black bg-brand/15 hover:bg-brand/25 text-brand rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-98"
                          >
                            <FolderOpen size={15} /> 불러오기
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("정말로 이 대본을 삭제하시겠습니까?")) {
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

        {/* ==========================================
            TAB 2: AI REHEARSAL ASSISTANT
            ========================================== */}
        {subTab === "practice" && (
          <motion.div
            key="practice-rehearsal"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            
            {/* RECORDING / CONTROLLER PANEL */}
            {!analysisResult && !isAnalyzing && (
              isRecording ? (
                /* FULLSCREEN REHEARSAL RECORDING VIEW */
                <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col justify-between p-4 sm:p-6 md:p-8 pt-[calc(16px+env(safe-area-inset-top,0px))] pb-[calc(24px+env(safe-area-inset-bottom,0px))] px-[calc(16px+env(safe-area-inset-left,0px))] animate-fade-in text-left">
                  {/* Camera Track covering the entire display */}
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted
                    className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
                  />

                  {/* Dark gradient overlay for extreme legibility of text & buttons */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/85 pointer-events-none" />

                  {/* Top bar indicators */}
                  <div className="relative z-10 flex justify-between items-center w-full">
                    <div className="bg-rose-500 text-white font-black text-[9px] sm:text-xs tracking-widest px-3 py-1.5 rounded-full flex items-center gap-1.5 animate-pulse shadow-lg shadow-rose-500/30">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                      <span>LIVE REHEARSAL RECORDING</span>
                    </div>

                    <div className="bg-slate-900/90 text-white border border-slate-800/60 backdrop-blur-md px-3 py-1.5 rounded-2xl text-xs sm:text-sm font-black flex items-center gap-1.5 shadow-md">
                      ⏱️ {Math.floor(seconds / 60)}분 {seconds % 60}초 진행 중
                    </div>
                  </div>

                  {/* Collapsible Teleprompter (Prompt Script) */}
                  {selectedScriptText && (
                    <div className="relative z-10 mx-auto w-full max-w-2xl mt-4">
                      {showTeleprompter ? (
                        <div className="bg-slate-950/75 border border-white/10 backdrop-blur-md rounded-2xl p-4 shadow-2xl space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
                            <span className="text-[10px] text-brand font-black tracking-widest flex items-center gap-1">
                              <FileText size={12} /> 발표 대본 프롬프터 (연습용)
                            </span>

                            {/* Prompter Font Size Selector */}
                            <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/10">
                              <button
                                type="button"
                                onClick={() => setPrompterTextSize("sm")}
                                className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-colors cursor-pointer ${prompterTextSize === "sm" ? "bg-brand text-white font-black" : "text-slate-400 hover:text-white"}`}
                              >
                                작게
                              </button>
                              <button
                                type="button"
                                onClick={() => setPrompterTextSize("base")}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${prompterTextSize === "base" ? "bg-brand text-white font-black" : "text-slate-400 hover:text-white"}`}
                              >
                                보통
                              </button>
                              <button
                                type="button"
                                onClick={() => setPrompterTextSize("lg")}
                                className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${prompterTextSize === "lg" ? "bg-brand text-white font-black" : "text-slate-400 hover:text-white"}`}
                              >
                                크게
                              </button>
                              <button
                                type="button"
                                onClick={() => setPrompterTextSize("xl")}
                                className={`px-2 py-0.5 text-[12px] font-bold rounded-md transition-colors cursor-pointer ${prompterTextSize === "xl" ? "bg-brand text-white font-black" : "text-slate-400 hover:text-white"}`}
                              >
                                더크게
                              </button>
                              <button
                                type="button"
                                onClick={() => setPrompterTextSize("2xl")}
                                className={`px-2 py-0.5 text-[13px] font-bold rounded-md transition-colors cursor-pointer ${prompterTextSize === "2xl" ? "bg-brand text-white font-black" : "text-slate-400 hover:text-white"}`}
                              >
                                최대
                              </button>
                            </div>

                            <button 
                              type="button"
                              onClick={() => setShowTeleprompter(false)}
                              className="text-[10px] text-slate-400 hover:text-white font-bold bg-white/5 hover:bg-white/10 px-2 py-1 rounded cursor-pointer"
                            >
                              숨기기
                            </button>
                          </div>
                          <div className={`max-h-[160px] overflow-y-auto ${getTextSizeClass(prompterTextSize)} text-slate-100 font-semibold whitespace-pre-wrap pr-1 custom-scrollbar scroll-smooth`}>
                            {selectedScriptText}
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <button 
                            type="button"
                            onClick={() => setShowTeleprompter(true)}
                            className="bg-slate-900/95 border border-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[10px] sm:text-xs text-slate-300 hover:text-white font-black flex items-center gap-1 shadow-lg cursor-pointer"
                          >
                            <Eye size={12} className="text-brand" /> 대본 프롬프터 켜기
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom area containing Live Subtitle STT and Control Buttons */}
                  <div className="relative z-10 flex flex-col items-center gap-4 w-full max-w-2xl mx-auto mt-auto pb-4">
                    {/* Floating TV-style subtitle card at the bottom to never cover the face */}
                    <div className="bg-slate-950/80 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-white/10 shadow-2xl space-y-1.5 w-full text-center">
                      <span className="text-[9px] text-brand uppercase font-black tracking-widest block">실시간 자막 (STT)</span>
                      <p className={`text-slate-100 leading-relaxed font-semibold break-keep ${getTextSizeClass(prompterTextSize)}`}>
                        {transcript || "소리 내어 말해보세요. 음성 자막이 이곳에 표시됩니다..."}
                      </p>
                    </div>

                    {/* Topic Indicator & End Practice button */}
                    <div className="flex flex-col items-center gap-2.5 w-full max-w-md mx-auto">
                      {practiceTopic && (
                        <p className="text-white/95 text-[10px] sm:text-xs font-black bg-slate-900/80 border border-white/10 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg">
                          🎤 주제: {practiceTopic}
                        </p>
                      )}

                      <button
                        onClick={stopPracticeRecording}
                        className="w-full sm:w-auto px-8 py-3.5 sm:py-4 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white font-black rounded-[20px] sm:rounded-[24px] text-xs sm:text-sm flex items-center justify-center gap-2 shadow-2xl shadow-rose-600/40 transition-all cursor-pointer"
                      >
                        <Square size={14} className="fill-current" />
                        연습 종료 및 AI 종합 분석
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* NORMAL PRACTICE DASHBOARD */
                <div className="space-y-6">
                  {analysisError && (
                    <div className="p-4 bg-rose-50 border border-rose-100 dark:bg-rose-500/5 dark:border-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl flex gap-3 items-center">
                      <AlertCircle size={18} className="shrink-0 text-rose-500" />
                      <div className="flex-1">
                        <p className="text-xs font-bold">발표 분석 중 오류가 발생했습니다</p>
                        <p className="text-[11px] text-rose-500/80 mt-0.5">{analysisError}</p>
                      </div>
                      <button 
                        onClick={() => setAnalysisError(null)} 
                        className="px-3 py-1.5 bg-rose-100 dark:bg-rose-950/50 hover:bg-rose-200 text-rose-700 dark:text-rose-300 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        지우기
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
                  
                  {/* Visualizer and Stream View */}
                  <div className="lg:col-span-8 flex flex-col justify-between">
                    <div className={`p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border relative aspect-video flex flex-col items-center justify-center overflow-hidden ${
                      darkMode ? "bg-slate-950 border-slate-900 text-slate-100" : "bg-slate-100 border-slate-200 text-slate-800"
                    }`}>
                      {/* Camera Track */}
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted
                        className={`absolute inset-0 w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-500 ${
                          hasPermission ? "opacity-100" : "opacity-0"
                        }`}
                      />

                      {/* Clean background with zero dark tint mask beneath */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/5 via-transparent to-transparent pointer-events-none" />

                      {/* Permission Request Onboarding */}
                      {hasPermission === null && (
                        <div className="relative text-center z-10 max-w-sm p-6 space-y-4">
                          <div className="w-12 h-12 bg-brand/10 text-brand rounded-2xl flex items-center justify-center mx-auto">
                            <Video size={24} />
                          </div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">카메라 및 마이크 권한 요청</h3>
                          <p className="text-xs text-slate-400 break-keep">발표 영상 및 음성을 동시 기록하여 분석하기 위해 기기 카메라 및 마이크 권한이 꼭 필요합니다.</p>
                          
                          <div className="flex justify-center pt-2">
                            <button
                              onClick={handleRequestPermissions}
                              className="px-6 py-3 bg-brand hover:bg-brand-dark text-white font-black rounded-2xl text-xs cursor-pointer shadow-lg shadow-brand/20 transition-all flex items-center gap-2"
                            >
                              <Video size={14} /> 마이크/카메라 권한 직접 허용하기
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Permission Blocked notice */}
                      {hasPermission === false && (
                        <div className="relative text-center z-10 max-w-md p-6 space-y-3 bg-slate-950/95 rounded-3xl border border-slate-800">
                          <div className="w-10 h-10 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto">
                            <VideoOff size={20} />
                          </div>
                          <h3 className="text-sm font-bold text-rose-500">마이크/카메라 활성화 안내</h3>
                          
                          {/* Error-specific messaging */}
                          <div className="p-3 bg-slate-900 rounded-xl text-[11px] text-left text-slate-300 space-y-2 border border-slate-800/80 max-h-[180px] overflow-y-auto custom-scrollbar">
                            {permissionError === "SECURE_CONTEXT_REQUIRED" ? (
                              <p className="leading-relaxed">
                                ⚠️ <strong>보안 환경 제한 (HTTPS)</strong><br />
                                카메라와 마이크 기능은 보안 연결(HTTPS) 또는 로컬 환경에서만 브라우저 보안 규정상 허용됩니다. 안전한 접속 상태인지 확인해 주세요.
                              </p>
                            ) : permissionError === "NotAllowedError" || permissionError === "PermissionDeniedError" ? (
                              <p className="leading-relaxed">
                                ⚠️ <strong>기기 권한 허용이 필요합니다</strong><br />
                                웹 브라우저 혹은 앱 설정에서 마이크와 카메라 사용이 차단되었습니다. 주소창 옆의 권한 설정을 변경해 주세요.
                              </p>
                            ) : permissionError === "NotFoundError" || permissionError === "DevicesNotFoundError" ? (
                              <p className="leading-relaxed">
                                ⚠️ <strong>기기를 찾을 수 없습니다</strong><br />
                                사용 가능한 카메라 혹은 마이크 기기를 인식하지 못했습니다. 연결을 재확인해 주세요.
                              </p>
                            ) : permissionError === "NotReadableError" || permissionError === "TrackStartError" ? (
                              <p className="leading-relaxed">
                                ⚠️ <strong>다른 앱에서 기기를 사용 중입니다</strong><br />
                                카메라/마이크를 줌(Zoom), 카카오톡, 또는 다른 브라우저 탭에서 사용 중일 수 있습니다. 해당 앱들을 완전히 종료한 후 새로고침해 주세요.
                              </p>
                            ) : (
                              <p className="leading-relaxed">
                                ⚠️ <strong>미디어 접근 오류 발생</strong> ({permissionError || "UnknownError"})<br />
                                모바일 브라우저/인앱 웹뷰 보안 설정으로 인해 직접적인 미디어 스트림 수집이 제한될 수 있습니다.
                              </p>
                            )}

                            <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 space-y-1">
                              <p className="font-bold text-slate-300">📱 안드로이드 및 모바일 웹뷰 해결책:</p>
                              <ul className="list-disc pl-3 space-y-1">
                                <li><strong>인앱 브라우저 제한:</strong> 카카오톡, 페이스북 등 앱 내부 브라우저는 하드웨어 카메라 권한을 차단할 가능성이 매우 높습니다.</li>
                                <li><strong>확실한 해결 방법:</strong> 화면 우측 상단의 <strong className="text-brand">"새 창에서 열기" (Launch)</strong> 버튼을 눌러 모바일의 정식 브라우저(<strong>Chrome</strong> 또는 <strong>삼성 인터넷</strong>)에서 해당 웹사이트를 다시 실행하시면 즉시 정상 작동합니다!</li>
                                <li><strong>앱별 기기 권한:</strong> 스마트폰 [설정] &gt; [애플리케이션] &gt; [사용 중인 브라우저 앱] &gt; [권한]에서 카메라와 마이크 권한이 '허용' 상태인지 꼭 확인해 주세요.</li>
                              </ul>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 pt-1">
                            <button
                              onClick={handleRequestPermissions}
                              className="w-full py-2.5 bg-brand hover:bg-brand-dark text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <RefreshCw size={12} /> 기기 다시 연결 및 권한 요청
                            </button>
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Controls below video preview */}
                    {hasPermission && (
                      <div className="flex justify-center gap-4 mt-6">
                        <button
                          onClick={startPracticeRecording}
                          className="px-6 py-4 bg-rose-500 hover:bg-rose-600 text-white font-extrabold rounded-2xl text-sm flex items-center gap-1.5 shadow-md shadow-rose-500/25 cursor-pointer"
                        >
                          <Play size={15} /> 발표 연습 시작하기
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Info and helper scripts column */}
                  <div className="lg:col-span-4 space-y-6">

                    {/* Custom Practice Topic Input */}
                    <div className={`p-6 rounded-[32px] border ${
                      darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                    }`}>
                      <h3 className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">연습할 발표 주제</h3>
                      <input
                        type="text"
                        value={practiceTopic}
                        onChange={(e) => setPracticeTopic(e.target.value)}
                        id="practiceTopicInput" name="practiceTopic" autoComplete="off" placeholder="예: 기후 변화와 인류의 미래"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand font-semibold"
                      />
                    </div>

                    {/* Script prompt selector */}
                    <div className={`p-6 rounded-[32px] border ${
                      darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                    }`}>
                      <h3 className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">연습할 대본 선택 및 입력</h3>
                      
                      {/* Selection tabs */}
                      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl mb-4">
                        <button
                          type="button"
                          onClick={() => setScriptInputMode("saved")}
                          className={`py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors cursor-pointer ${
                            scriptInputMode === "saved" 
                              ? "bg-white dark:bg-slate-900 text-brand shadow-sm font-extrabold" 
                              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                          }`}
                        >
                          저장된 대본 목록
                        </button>
                        <button
                          type="button"
                          onClick={() => setScriptInputMode("direct")}
                          className={`py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors cursor-pointer ${
                            scriptInputMode === "direct" 
                              ? "bg-white dark:bg-slate-900 text-brand shadow-sm font-extrabold" 
                              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                          }`}
                        >
                          텍스트 직접 입력
                        </button>
                      </div>

                      {scriptInputMode === "saved" ? (
                        scripts.length > 0 ? (
                          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                            {scripts.map(s => (
                              <button
                                key={s.id}
                                onClick={() => {
                                  setSelectedScriptId(s.id);
                                  setPracticeTopic(s.topic);
                                  setSelectedScriptText(s.script);
                                  setTranscript(s.script.substring(0, 200) + "...");
                                }}
                                className={`w-full p-3 text-left border rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer flex items-center justify-between ${
                                  selectedScriptId === s.id ? "border-brand bg-brand/5" : "border-slate-100 animate-none"
                                }`}
                              >
                                <div className="truncate pr-4">
                                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{s.title}</p>
                                  <p className="text-xs text-slate-400 truncate">{s.topic}</p>
                                </div>
                                <span className="text-xs font-bold text-slate-400 shrink-0">{s.time}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                            상단 '발표 대본 작성' 탭에서 AI 대본을 먼저 생성하면, 이곳에 원터치 프롬프트 프롬프팅 용도로 자동 동기화됩니다.
                          </p>
                        )
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <span className="text-xs text-slate-500 font-extrabold block mb-1">여기에 대본 내용을 붙여넣으세요</span>
                            <textarea
                              value={customScriptText}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomScriptText(val);
                                setSelectedScriptId("custom");
                                setSelectedScriptText(val);
                                setTranscript(val.substring(0, 200) + (val.length > 200 ? "..." : ""));
                              }}
                              placeholder="다른 곳에서 작성한 대본이나 직접 연습하고 싶은 대본 텍스트를 입력해 주세요..."
                              rows={5}
                              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand font-medium leading-relaxed"
                            />
                          </div>
                          {customScriptText && (
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!customScriptText.trim()) return;
                                  const customId = "scr_" + Date.now();
                                  const todayStr = new Date().toISOString().split('T')[0];
                                  const topicName = practiceTopic.trim() || "직접 입력한 발표 주제";
                                  const newScriptItem: ScriptItem = {
                                    id: customId,
                                    date: todayStr,
                                    title: `${topicName} (직접 작성)`,
                                    topic: topicName,
                                    script: customScriptText,
                                    outline: ["직접 작성한 발표 아웃라인"],
                                    tips: ["직접 작성한 대본을 읽으며 아이컨택과 스피치 속도를 연습해 보세요!"],
                                    time: "3분",
                                    grade: `${user?.grade || "3"}학년`,
                                    subject: "기타",
                                    audience: "청중",
                                    tone: "기본 말투",
                                    purpose: "발표 연습",
                                    style: "직접 작성"
                                  };
                                  onAddScript(newScriptItem);
                                  setSelectedScriptId(customId);
                                  setSelectedScriptText(customScriptText);
                                  alert("대본 보관함에 성공적으로 저장되었습니다!");
                                }}
                                className="w-full py-2 bg-brand hover:bg-brand-dark text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                              >
                                <Sparkles size={12} /> 이 대본을 보관함에 저장하기
                              </button>
                              <div className="flex items-center justify-center gap-1 text-[10px] text-brand font-bold bg-brand/5 p-2 rounded-lg">
                                <Check size={12} /> 대본이 리허설 프롬프터로 연동되었습니다!
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>

                </div>
                </div>
              )
            )}

            {/* AI LOADING ANALYZER */}
            {isAnalyzing && (
              <div className={`p-16 rounded-[32px] border text-center flex flex-col items-center justify-center space-y-6 max-w-lg mx-auto ${
                darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              }`}>
                <div className="relative">
                  <Loader2 size={48} className="text-brand animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles size={18} className="text-brand" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-black text-slate-800 dark:text-slate-100">똑(Tok) AI 발표 분석 중...</h3>
                  <p className="text-xs text-slate-400 break-keep leading-relaxed font-semibold">
                    스피치 텍스트와 말의 빠르기, 발음 선명도, 시선 처리 등을 다차원 분석하고 있습니다.<br />
                    선생님의 피드백과 오각형 점수 리포트가 곧 완성됩니다. 잠시만 기다려 주세요!
                  </p>
                </div>
              </div>
            )}

            {/* ANALYSIS RESULT SCREEN */}
            {analysisResult && !isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-8"
              >
                {/* Result header */}
                <div className={`p-6 rounded-[32px] border flex flex-col sm:flex-row justify-between items-center gap-6 ${
                  darkMode ? "bg-slate-900 border-slate-800/85" : "bg-white border-slate-100"
                }`}>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-brand-light dark:bg-brand/10 text-brand rounded-2xl flex items-center justify-center font-black text-2xl">
                      {analysisResult.totalScore}
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-brand bg-brand-light dark:bg-brand/15 px-2.5 py-0.5 rounded">
                        REHEARSAL SCORE
                      </span>
                      <h2 className="text-xl font-bold tracking-tight-sf mt-1 text-slate-800 dark:text-slate-100">"{analysisResult.topic}" 발표 분석 결과</h2>
                      <p className="text-xs text-slate-400 mt-0.5">발표 소요 시간: {analysisResult.duration}초</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setAnalysisResult(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={14} /> 다시 연습하기
                  </button>
                </div>

                {/* Score charts and list columns */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  
                  {/* Radar Spider chart */}
                  <div className="lg:col-span-5">
                    <div className={`p-6 rounded-[32px] border ${
                      darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                    } shadow-sm h-full flex flex-col justify-between`}>
                      <div>
                        <h3 className="text-sm font-extrabold tracking-tight-sf mb-1 flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                          <Award size={16} className="text-brand" /> 발표 6대 요소 평가 오각형
                        </h3>
                        <p className="text-[11px] text-slate-400">시선, 목소리, 발음, 자세, 제스처, 표정의 균형도입니다.</p>
                      </div>

                      {/* Radar Chart Container */}
                      <div className="w-full h-64 mt-4 text-xs font-bold">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={getRadarData()}>
                            <PolarGrid stroke={darkMode ? "#334155" : "#e2e8f0"} />
                            <PolarAngleAxis 
                              dataKey="subject" 
                              tick={{ fill: darkMode ? "#94a3b8" : "#475569", fontSize: 11, fontWeight: "bold" }}
                            />
                            <PolarRadiusAxis 
                              angle={30} 
                              domain={[0, 100]} 
                              tick={{ fill: "#94a3b8", fontSize: 9 }}
                            />
                            <Radar
                              name="발표지수"
                              dataKey="score"
                              stroke="#0066FF"
                              fill="#0066FF"
                              fillOpacity={0.2}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Scores detail lines */}
                      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                        {getRadarData().map((item, idx) => (
                          <div key={idx} className="bg-slate-50 dark:bg-slate-900/40 p-2 rounded-xl">
                            <span className="text-[10px] text-slate-400 font-bold block">{item.subject}</span>
                            <span className="text-xs font-black text-slate-800 dark:text-slate-100">{item.score}점</span>
                          </div>
                        ))}
                      </div>

                    </div>
                  </div>

                  {/* Feedback details */}
                  <div className="lg:col-span-7 space-y-6">
                    
                    {/* Teacher's detailed feedback cards */}
                    <div className={`p-6 rounded-[32px] border ${
                      darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                    } shadow-sm`}>
                      <h3 className="text-sm font-extrabold tracking-tight-sf mb-4 flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                        <MessageSquare size={16} className="text-brand" /> 똑똑 선생님의 구체적 피드백
                      </h3>
                      <div className="space-y-2">
                        {(analysisResult.feedback || []).map((f, idx) => (
                          <div 
                            key={idx} 
                            className="p-3.5 bg-brand-light/30 border border-brand/5 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold leading-relaxed"
                          >
                            💡 {f}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Speech / Audio & Video specifications details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      
                      {/* Voice details */}
                      <div className={`p-5 rounded-[32px] border ${
                        darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                      }`}>
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">🎙️ 음성 종합 분석</span>
                        <div className="space-y-2 mt-3 text-xs">
                          <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span className="text-slate-400">말의 속도</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{analysisResult.voiceAnalysis?.speed ?? "보통"}</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span className="text-slate-400">선명한 발음</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{analysisResult.voiceAnalysis?.pronunciation ?? "보통"}</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span className="text-slate-400">불필요 단어 수</span>
                            <span className="font-black text-brand">{analysisResult.voiceAnalysis?.fillerWordsCount ?? 0}회 (음/어)</span>
                          </div>
                          <div className="flex justify-between pb-1">
                            <span className="text-slate-400">안정적 쉼표</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{analysisResult.voiceAnalysis?.pauses ?? "적절함"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Video details */}
                      <div className={`p-5 rounded-[32px] border ${
                        darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                      }`}>
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">👁️ 시각 태도 분석</span>
                        <div className="space-y-2 mt-3 text-xs">
                          <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span className="text-slate-400">시선 처리</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{analysisResult.videoAnalysis?.eyeContact ?? "안정적"}</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span className="text-slate-400">바른 자세</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{analysisResult.videoAnalysis?.posture ?? "바름"}</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span className="text-slate-400">제스처/손짓</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{analysisResult.videoAnalysis?.gestures ?? "적절함"}</span>
                          </div>
                          <div className="flex justify-between pb-1">
                            <span className="text-slate-400">안면 표정</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{analysisResult.videoAnalysis?.expression ?? "밝음"}</span>
                          </div>
                        </div>
                      </div>

                    </div>

                  </div>

                </div>

              </motion.div>
            )}

          </motion.div>
        )}

      </AnimatePresence>

      {/* ────────────────────────────────────────────────────────
          CAMERA & MICROPHONE RUNTIME PERMISSION EXPLAINER MODAL
          ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPermissionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPermissionModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.4 }}
              className={`relative w-full max-w-md p-6 rounded-[28px] border shadow-2xl z-10 overflow-hidden ${
                darkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-100 text-slate-900"
              }`}
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <motion.div 
                  animate={{ y: [0, -6, 0] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="w-14 h-14 bg-brand/10 text-brand rounded-2xl flex items-center justify-center"
                >
                  <Video size={28} />
                </motion.div>

                <div className="space-y-1">
                  <h3 className="text-lg font-black tracking-tight-sf">카메라 및 마이크 권한 안내</h3>
                  <p className="text-xs text-brand font-bold">발표 분석을 위해 꼭 권한이 필요해요!</p>
                </div>

                {/* Explanation text */}
                <div className={`p-4 rounded-2xl text-xs text-left leading-relaxed space-y-2.5 ${
                  darkMode ? "bg-slate-950/80 text-slate-300" : "bg-slate-50 text-slate-600"
                }`}>
                  <p>
                    <strong>똑(Tok) AI 발표 연습</strong> 기능은 사용자의 발표 자세, 시선 처리, 표정 및 목소리 성량을 실시간으로 분석하여 고품질의 채점 피드백을 전달합니다.
                  </p>
                  <p className="font-semibold text-rose-500">
                    현재 카메라 또는 마이크에 대한 접근이 차단되어 있어 AI 연습 모드를 시작할 수 없습니다.
                  </p>
                </div>

                {/* Android specific notice */}
                {isNativeApp() && (
                  <div className="w-full p-3.5 bg-brand/5 border border-brand/20 rounded-2xl text-left space-y-1">
                    <p className="text-[11px] font-extrabold text-brand flex items-center gap-1.5">
                      📱 안드로이드 앱 사용자 추가 안내
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      '다시 묻지 않음' 등으로 권한 요청이 영구 차단된 경우, 아래 <strong>[앱 설정 열기]</strong> 버튼을 눌러 안드로이드 애플리케이션 정보 화면에서 카메라와 마이크 권한을 직접 <strong>'허용'</strong>으로 활성화해 주셔야 합니다.
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="w-full flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => {
                      handleRequestPermissions();
                    }}
                    className="w-full py-3 bg-brand hover:bg-brand-dark text-white font-bold rounded-xl text-xs shadow-md shadow-brand/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw size={13} /> 기기 다시 연결 및 권한 허용
                  </button>

                  {isNativeApp() && (
                    <button
                      onClick={async () => {
                        await openNativeSettings();
                      }}
                      className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      📱 안드로이드 앱 설정 열기
                    </button>
                  )}

                  <button
                    onClick={() => setShowPermissionModal(false)}
                    className={`w-full py-2.5 font-bold rounded-xl text-xs transition-all cursor-pointer ${
                      darkMode ? "bg-slate-800 text-slate-400 hover:bg-slate-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    취소 및 닫기
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
