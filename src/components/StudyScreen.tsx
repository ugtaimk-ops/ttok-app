import React, { useState, useRef, useEffect } from "react";
import { StudyItem, ScheduleItem } from "../types";
import { getApiUrl, robustFetch, getTodayDateString } from "../lib/api";
import { 
  BookOpen, 
  Sparkles, 
  FileText, 
  FileQuestion, 
  BookMarked, 
  HelpCircle, 
  Image as ImageIcon,
  Camera as CameraIcon,
  CheckCircle, 
  Loader2, 
  AlertCircle,
  Calendar,
  Clock,
  ArrowRight,
  ListTodo,
  CheckCircle2,
  Edit,
  Trash2,
  Pencil
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import GlassSelect from "./GlassSelect";

interface StudyScreenProps {
  schedules: ScheduleItem[];
  onAddSchedule: (schedule: Omit<ScheduleItem, "id">) => void;
  onDeleteSchedule: (id: string) => void;
  onUpdateSchedule: (updated: ScheduleItem) => void;
  darkMode: boolean;
  initialSubTab?: "helper" | "planner";
  initialHelperMode?: "summary" | "quiz" | "note" | "question";
}

export default function StudyScreen({ 
  schedules, 
  onAddSchedule, 
  onDeleteSchedule, 
  onUpdateSchedule, 
  darkMode,
  initialSubTab,
  initialHelperMode
}: StudyScreenProps) {
  const [activeSubTab, setActiveSubTab] = useState<"helper" | "planner">("helper");
  
  // ==========================================
  // 1. AI STUDY HELPER STATE
  // ==========================================
  const [helperMode, setHelperMode] = useState<"summary" | "quiz" | "note" | "question">("summary");

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  useEffect(() => {
    if (initialHelperMode) {
      setHelperMode(initialHelperMode);
    }
  }, [initialHelperMode]);
  const [textInput, setTextInput] = useState("");
  const [additionalQuestion, setAdditionalQuestion] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [helperError, setHelperError] = useState<string | null>(null);
  const [studyResult, setStudyResult] = useState<StudyItem | null>(null);
  
  // File upload variables
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedBase64, setUploadedBase64] = useState<string | null>(null);
  const [uploadedMime, setUploadedMime] = useState<string | null>(null);

  // Quiz-specific client state for active checking
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({});
  const [quizChecked, setQuizChecked] = useState(false);

  // ==========================================
  // 2. EXAM & STUDY PLANNER STATE
  // ==========================================
  const [examTitle, setExamTitle] = useState("");
  const [examSubject, setExamSubject] = useState("");
  const [examDate, setExamDate] = useState(getTodayDateString());
  const [examScope, setExamScope] = useState("");
  
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [aiStudyPlan, setAiStudyPlan] = useState<any | null>(null);

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
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleSaveEdit = () => {
    if (!editingItem || !editSubject.trim() || !editTitle.trim() || !editDate.trim()) return;
    onUpdateSchedule({
      ...editingItem,
      subject: editSubject,
      title: editTitle,
      date: editDate,
      dueDate: editDate
    });
    setEditingItem(null);
  };

  // Filter exams in schedule
  const examsList = schedules.filter(s => s.type === "exam");

  // Current Date logic
  const today = new Date();
  const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');

  // Base64 helper
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setUploadedMime(file.type);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      const rawBase64 = base64String.split(",")[1];
      setUploadedBase64(rawBase64);
    };
  };

  const handleTakePhoto = async () => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        quality: 80
      });
      if (!photo.base64String) return;
      setUploadedFileName("camera_photo.jpg");
      setUploadedMime(`image/${photo.format || "jpeg"}`);
      setUploadedBase64(photo.base64String);
    } catch (err) {
      // User cancelled the camera or denied permission - nothing to do.
    }
  };

  // Submit study action to backend Express API
  const handleStudyAction = async (e: React.FormEvent) => {
    e.preventDefault();
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
          actionType: helperMode,
          text: textInput,
          imageBase64: uploadedBase64,
          mimeType: uploadedMime,
          additionalQuestion: helperMode === "question" ? additionalQuestion : ""
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
        actionType: helperMode,
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

  // Demo Fallbacks: Immediate simulation for testing without photos
  const triggerDemoHelper = (mode: "summary" | "quiz" | "note" | "question") => {
    setIsProcessing(true);
    setHelperError(null);
    setStudyResult(null);
    setSelectedAnswers({});
    setQuizChecked(false);

    setTimeout(() => {
      if (mode === "summary") {
        setStudyResult({
          id: "demo_1",
          date: getTodayDateString(),
          title: "📚 광합성의 원리 및 명반응/암반응 핵심 요약",
          actionType: "summary",
          content: `### 1. 광합성(Photosynthesis)의 정의
식물이 빛 에너지를 이용하여 이산화탄소($CO_2$)와 물($H_2O$)로부터 유기 양분(포도당)을 합성하고 산소($O_2$)를 배출하는 과정입니다.

### 2. 핵심 메커니즘
- **장소**: 식물 세포 내의 **엽록체(Chloroplast)**
- **화학 반응식**: 
  $$\\text{이산화탄소} + \\text{물} \\xrightarrow{\\text{빛 에너지}} \\text{포도당} + \\text{산소} + \\text{물}$$

### 3. 명반응과 암반응의 비교
1. **명반응 (Light-dependent Reactions)**:
   - **장소**: 엽록체 그라나의 **틸라코이드 막**
   - **원리**: 엽록소가 빛을 흡수하여 물을 분해하고, 화학 에너지($ATP$, $NADPH$)를 생산하며 산소를 배출합니다.
2. **암반응 (Light-independent Reactions / 캘빈 회로)**:
   - **장소**: 엽록체의 **스트로마**
   - **원리**: 빛이 없어도 진행되며, 명반응에서 만든 에너지를 사용해 이산화탄소를 포도당으로 고정합니다.

### 4. 광합성에 영향을 주는 환경 요인
- **빛의 세기**: 강해질수록 증가하나 광포화점 이상에서는 일정해짐.
- **이산화탄소 농도**: 증가할수록 속도가 빨라지다 포화됨.
- **온도**: $30^\\circ\\text{C} \\sim 35^\\circ\\text{C}$에서 극대화되며, $40^\\circ\\text{C}$ 이상에서는 효소 변성으로 급감.`,
          extraData: ["엽록체", "틸라코이드", "캘빈회로"]
        });
      } else if (mode === "quiz") {
        setStudyResult({
          id: "demo_2",
          date: getTodayDateString(),
          title: "✍️ 광합성 단원 자가 진단 3단 평가",
          actionType: "quiz",
          content: `### [문제 1] 광합성에서 물의 광분해가 일어나는 구체적인 세포 소기관 내 위치는 어디인가요?
1) 스트로마
2) 틸라코이드 막
3) 미토콘드리아 기질
4) 핵막

---

### [문제 2] 광합성 화학 반응의 주된 유기 부산물로서 식물이 생장하는 데 필요한 직접적인 양분은 무엇인가요?
1) 아미노산
2) 녹말
3) 포도당
4) 지질

---

### [문제 3] 온도가 40도 이상으로 매우 높아질 때 식물의 광합성 효율이 급격하게 감소하는 주된 원인은 무엇인가요?
1) 빛의 세기가 약해지기 때문에
2) 물 공급이 촉진되기 때문에
3) 화학 반응을 담당하는 단백질 효소가 변성되기 때문에
4) 이산화탄소 농도가 낮아지기 때문에`,
          extraData: ["정답: 1번 - 2), 2번 - 3), 3번 - 3)", "상세 설명은 오답노트에서 확인하세요."]
        });
      } else if (mode === "note") {
        setStudyResult({
          id: "demo_3",
          date: getTodayDateString(),
          title: "🔍 삼각함수 주기 찾기 오답 집중 처방",
          actionType: "note",
          content: `### 1. 흔히 발생하는 오답 유형 및 실수 원인
많은 학생들이 $y = a \\sin(bx + c)$의 주기 공식을 외울 때, $x$의 계수 $b$의 부호를 고려하지 않거나 분모/분자 위치를 헷갈려 오답을 도출합니다.
- **자주 저지르는 실수**: $y = 3 \\sin(2x - \\pi)$의 주기를 구할 때 단순히 $2\\pi \\times 2 = 4\\pi$로 배수 처리하여 계산을 끝마침.

### 2. 정밀 오답 처방 가이드
- **기본 개념**: 사인함수 $\\sin(x)$의 기본 주기는 $2\\pi$입니다.
- **변형 함수의 주기 공식**: 함수 $y = a \\sin(bx + c) + d$의 주기는 다음과 같이 계산해야 합니다.
  $$\\text{주기} = \\frac{2\\pi}{|b|}$$
- **정확한 계산 대입**: $x$의 계수가 $2$이므로, 주기는 $\\frac{2\\pi}{|2|} = \\pi$가 정답입니다.

### 3. 실전 기출 팁 및 검산 요령
삼각함수의 주기는 $x$축 방향으로의 그래프 '수축'과 '팽창'을 의미하므로, 주기가 줄어들면 그래프가 그만큼 촘촘해진다는 기하학적 이미지를 연상하여 터무니없는 실수를 피하세요.`,
          extraData: ["공식: 2π/|b|", "x의 계수로 나누기", "그래프 연상 검산"]
        });
      } else {
        setStudyResult({
          id: "demo_4",
          date: getTodayDateString(),
          title: "🙋 수소 결합과 끓는점 Q&A 답변",
          actionType: "question",
          content: `질문해주신 **"왜 물($H_2O$)은 분자량이 비슷한 다른 물질들보다 끓는점이 월등히 높은가요?"**에 대한 과외 선생님의 친절한 답변입니다!

### 핵심 요인: 수소 결합 (Hydrogen Bonding)
물 분자들은 산소($O$)와 수소($H$) 사이의 강한 전기음성도 차이로 인해 분자 간에 매우 강력한 인력인 **수소 결합**을 형성하게 됩니다.

### 아주 쉽게 이해하는 비유 💡
- **일반 분자 간 인력**: 친구들이 서로 손끝을 가볍게 대고 서 있는 상태 (가볍게 툭 쳐서 에너지를 주면 쉽게 흩어짐 = 낮은 온도에서 끓음)
- **물 분자 간 수소 결합**: 친구들이 양손을 깍지 끼고 꽉 잡고 있는 상태 (손을 떼어내 기체로 만들기 위해 엄청나게 많은 열에너지가 필요함 = 높은 온도에서 끓음)

이 결합 때문에 물은 분자량(18)이 메탄(16, 끓는점 -161도)과 매우 비슷함에도 불구하고 무려 **100도**라는 아주 높은 온도에서 끓게 되는 것입니다!`,
          extraData: ["수소결합", "F, O, N과 H의 인력", "깍지 낀 인력 비유"]
        });
      }
      setIsProcessing(false);
    }, 1500);
  };

  // ==========================================
  // 2. EXAM PLANNER ACTIONS
  // ==========================================
  const handleAddExamSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTitle.trim() || !examSubject.trim()) return;

    onAddSchedule({
      title: `${examSubject} 단원 지필평가 (${examTitle})`,
      subject: examSubject,
      date: examDate,
      supplies: "컴퓨터용 사인펜, 필기구",
      dueDate: examDate,
      criteria: "지필평가 성적 지표 반영",
      submissionMethod: "지필 고사",
      presentationTime: "",
      type: "exam"
    });

    setExamTitle("");
    setExamSubject("");
    setExamScope("");
  };

  const generateAIStudyPlan = () => {
    if (examsList.length === 0) return;
    setIsGeneratingPlan(true);

    const targetExam = examsList[0];
    setTimeout(() => {
      setAiStudyPlan({
        title: `📚 ${targetExam.subject} [똑] AI 밀착형 5일 단기 정복 계획`,
        days: [
          { day: "D-5 (개념 총정리)", tasks: ["교과서 핵심 요약 2회 정독", "AI 요약본과 필기 노트 1:1 대조 분석", "주요 공식 및 핵심 암기 단어 플래시 카드화"] },
          { day: "D-4 (단원 정밀 격파)", tasks: ["교과서 중단원, 대단원 확인 문제 전체 풀이", "틀린 문제 사진 등록하여 AI 오답 분석 처방전 확보", "개념 설명 직접 1분 스피치 해보기 (발표 연습 탭 이용)"] },
          { day: "D-3 (실전 기출 체득)", tasks: ["최근 3개년 학교 학교 기출 문제 및 유사 기출 2회분 풀기", "제한 시간 45분 맞추어 실전 고사 시뮬레이션", "AI 문제생성기로 광범위 개념 검증 문제 2회 추가 풀이"] },
          { day: "D-2 (취약점 철저 봉쇄)", tasks: ["오답노트에 수집된 취약 문항 복습 및 재검토", "어려운 수학 공식/과학 메커니즘을 백지에 마인드맵으로 안 보고 그리기", "이해가 안 가는 세부 개념은 AI 질문하기로 해소"] },
          { day: "D-1 (마지막 최종 단속)", tasks: ["교과서 핵심 날개 단어 및 족보 단속", "취약 개념 오답노트 단 1회 훑어보기", "밤 11시 전 조기 취침으로 생체 리듬 유지"] }
        ],
        alerts: [
          "🔔 D-7: 지필평가 일주일 전! AI 공부 계획 생성 버튼을 누르고 밀착 훈련을 개시할 시간입니다.",
          "🔔 D-5: 지필평가 5일 전! 오답노트 정리와 광합성/역학 등 핵심 단원 요약 스캔본 확인 완료율 50% 돌파.",
          "🔔 D-3: 지필평가 3일 전! 기출 시뮬레이션 돌입 시점. 시간 초과를 예방하기 위한 최종 리허설입니다.",
          "🔔 D-1: 지필평가 하루 전! 새로운 진도를 나가지 말고 틀린 질문 복습에 집중하세요. 합격 기원 똑(Tok) 부적 발송 완료!"
        ]
      });
      setIsGeneratingPlan(false);
    }, 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-safe-layout">
      
      {/* Tab Selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight-sf">AI 공부 및 수험 전략</h1>
        </div>

        <div className="flex w-full sm:w-auto bg-slate-100 dark:bg-slate-850 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveSubTab("helper")}
            className={`flex-1 sm:flex-initial px-4 h-11 text-fluid-sm font-black rounded-xl transition-all cursor-pointer ${
              activeSubTab === "helper" 
                ? "bg-white dark:bg-slate-700 text-brand shadow-sm" 
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5"><BookOpen size={15} /> AI 공부 도우미</span>
          </button>
          <button
            onClick={() => setActiveSubTab("planner")}
            className={`flex-1 sm:flex-initial px-4 h-11 text-fluid-sm font-black rounded-xl transition-all cursor-pointer ${
              activeSubTab === "planner" 
                ? "bg-white dark:bg-slate-700 text-brand shadow-sm" 
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5"><ListTodo size={15} /> 지필 수행 계획</span>
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        
        {/* ==========================================
            SUB-TAB 1: AI STUDY COMPANION
            ========================================== */}
        {activeSubTab === "helper" && (
          <motion.div
            key="helper-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8"
          >
            
            {/* Input and Feature Selection */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Feature grid */}
              <div className={`p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border transition-all ${
                darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
              } shadow-sm`}>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 text-left">공부 기능 선택</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <button
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

                  <button
                    onClick={() => { setHelperMode("quiz"); setStudyResult(null); }}
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

                  <button
                    onClick={() => { setHelperMode("note"); setStudyResult(null); }}
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

                  <button
                    onClick={() => { setHelperMode("question"); setStudyResult(null); }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      helperMode === "question" 
                        ? "border-brand bg-brand-light/30 text-brand" 
                        : "border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                    }`}
                  >
                    <HelpCircle size={20} className="mb-2" />
                    <p className="text-sm font-black">AI 질문하기</p>
                    <p className="text-xs text-slate-450 dark:text-slate-400 mt-0.5">과외쌤 일대일 상담</p>
                  </button>
                </div>
              </div>

              {/* Upload Textbook or Text Area */}
              <div className={`p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border transition-all ${
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
                      <div
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
                      <div
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

                  {helperMode === "question" && (
                    <div>
                      <span className="text-fluid-sm text-slate-500 font-bold block mb-1.5">선생님에게 물어볼 구체적인 질문</span>
                      <input
                        type="text"
                        value={additionalQuestion}
                        onChange={(e) => setAdditionalQuestion(e.target.value)}
                        placeholder="예: 수소 결합이 왜 물의 끓는점을 높이나요?"
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand font-medium transition-all"
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
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
              </div>

            </div>

            {/* Analysis Result Displays */}
            <div className="lg:col-span-7">
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
                    교과서 글자 분석, 오답노트 정리, 질문 해소를 위한 AI 핵심 클리닉 정리가 시작됩니다. 왼쪽 입력을 통해 시작해 보세요!
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
                          <button
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
            </div>

          </motion.div>
        )}

        {/* ==========================================
            SUB-TAB 2: EXAM PLANNER (시험 관리)
            ========================================== */}
        {activeSubTab === "planner" && (
          <motion.div
            key="planner-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Exam Entry Column */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* Exam scheduler adder */}
                <div className={`p-6 rounded-[32px] border transition-all ${
                  darkMode ? "bg-slate-900 border-slate-800/85" : "bg-white border-slate-100"
                } shadow-sm`}>
                  <h3 className="text-sm font-extrabold tracking-tight-sf mb-3">새 지필평가 일정 등록</h3>
                  
                  <form onSubmit={handleAddExamSchedule} className="space-y-4">
                    <div>
                      <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5 text-left">시험 평가명</label>
                      <input
                        type="text"
                        required
                        value={examTitle}
                        onChange={(e) => setExamTitle(e.target.value)}
                        placeholder="예: 1학기 기말고사, 3단원 단원평가"
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5 text-left">시험 과목</label>
                        <input
                          type="text"
                          required
                          value={examSubject}
                          onChange={(e) => setExamSubject(e.target.value)}
                          placeholder="예: 역사, 통합과학"
                          className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5 text-left">평가 날짜</label>
                        <input
                          type="date"
                          required
                          value={examDate}
                          onChange={(e) => setExamDate(e.target.value)}
                          className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 font-bold transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5 text-left">시험 출제 범위 (학습용)</label>
                      <input
                        type="text"
                        value={examScope}
                        onChange={(e) => setExamScope(e.target.value)}
                        placeholder="예: 교과서 3단원 삼각함수~지수함수 전체"
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full h-14 bg-brand hover:bg-brand-dark text-white font-extrabold rounded-2xl text-fluid-base cursor-pointer shadow-md shadow-brand/10 transition-all active:scale-98"
                    >
                      시험 일정으로 캘린더 등록
                    </button>
                  </form>
                </div>

                {/* Scheduled alarm status list */}
                <div className={`p-6 rounded-[32px] border transition-all ${
                  darkMode ? "bg-slate-900 border-slate-800/85" : "bg-white border-slate-100"
                }`}>
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-wider mb-3">AI 일정 알람 자동 예약</h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-4 break-keep">시험 일정이 생기면 똑(Tok) AI가 아래 주기에 맞춰 자동 푸시 알람을 예고합니다.</p>
                  
                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                      <span className="text-slate-550 dark:text-slate-350 font-semibold">📅 시험 일주일 전 알람</span>
                      <span className="font-extrabold text-emerald-500 flex items-center gap-1">✔️ 예약 완료</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                      <span className="text-slate-550 dark:text-slate-350 font-semibold">📅 시험 5일 전 알람</span>
                      <span className="font-extrabold text-emerald-500 flex items-center gap-1">✔️ 예약 완료</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                      <span className="text-slate-550 dark:text-slate-350 font-semibold">📅 시험 3일 전 알람</span>
                      <span className="font-extrabold text-emerald-500 flex items-center gap-1">✔️ 예약 완료</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                      <span className="text-slate-550 dark:text-slate-350 font-semibold">📅 시험 하루 전 알람</span>
                      <span className="font-extrabold text-emerald-500 flex items-center gap-1">✔️ 예약 완료</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Study Plan Output Column */}
              <div className="lg:col-span-7 space-y-6">
                
                 {/* Exams schedule preview */}
                <div className={`p-6 rounded-[32px] border transition-all ${
                  darkMode ? "bg-slate-900 border-slate-800/85" : "bg-white border-slate-100"
                }`}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-extrabold tracking-tight-sf">등록된 지필평가 캘린더</h3>
                  </div>
                  {examsList.length > 0 ? (
                    <div className="space-y-3">
                      {examsList.map(item => {
                        const diffTime = new Date(item.date).getTime() - today.getTime();
                        const dday = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return (
                          <div 
                            key={item.id} 
                            className="flex justify-between items-center p-3.5 bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-850 hover:border-brand/40 transition-colors rounded-2xl relative select-none"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-brand-light dark:bg-brand/10 text-brand rounded-xl flex items-center justify-center font-bold text-sm">
                                {item.subject.substring(0, 2)}
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-850 dark:text-slate-150">{item.title}</h4>
                                <p className="text-xs text-slate-500">평가일: {item.date}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 rounded-xl">
                                D-{dday}
                              </span>
                              <button
                                onClick={() => handleStartEdit(item)}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-brand transition-colors cursor-pointer"
                                title="일정 수정"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => setDeletingItem(item)}
                                className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                                title="일정 삭제"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Planner trigger button */}
                      <div className="pt-2">
                        <button
                          onClick={generateAIStudyPlan}
                          disabled={isGeneratingPlan}
                          className="w-full py-3 bg-brand/10 hover:bg-brand text-brand hover:text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          {isGeneratingPlan ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              지필고사 범위 맞춤형 공부 계획 생성 중...
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              첫 번째 고사 대상: AI 공부 계획 생성하기
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-450 text-sm">
                      등록된 지필평가 정보가 없습니다. 왼쪽 폼에서 시험을 먼저 추가해 주세요.
                    </div>
                  )}
                </div>

                {/* AI Study Plan Displays */}
                {aiStudyPlan && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`p-6 rounded-[32px] border shadow-md ${
                      darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-blue-100/50"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                      <h3 className="text-sm font-extrabold text-brand tracking-tight-sf flex items-center gap-1.5">
                        <Sparkles size={16} /> {aiStudyPlan.title}
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {aiStudyPlan.days.map((d: any, idx: number) => (
                        <div key={idx} className="p-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl space-y-2">
                          <span className="text-xs font-black text-brand uppercase">{d.day}</span>
                          <div className="space-y-1.5">
                            {d.tasks.map((task: string, taskIdx: number) => (
                              <div key={taskIdx} className="flex items-start gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                                <CheckCircle2 size={13} className="text-brand shrink-0 mt-0.5" />
                                <span>{task}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* AI Notification alerts timeline preview */}
                    <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                      <span className="text-xs text-slate-500 font-bold block">스마트 알림 흐름 예고 (전송 시점 기준)</span>
                      <div className="space-y-1.5 text-xs font-semibold text-slate-500">
                        {aiStudyPlan.alerts.map((al: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-2 bg-indigo-50/30 dark:bg-brand/5 p-2 rounded-xl">
                            <span>{al}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </motion.div>
                )}

              </div>

            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Custom Context Menu */}
      {contextMenu.visible && (
        <div 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[130px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl py-1.5 animate-fade-in text-sm font-bold text-slate-700 dark:text-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleStartEdit(contextMenu.item)}
            className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Edit size={13} className="text-slate-400" />
            일정 수정
          </button>
          <button
            onClick={() => {
              setDeletingItem(contextMenu.item);
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
            className="w-full px-4 py-2.5 text-left text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Trash2 size={13} className="text-rose-500" />
            일정 삭제
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md p-6 rounded-[28px] border shadow-2xl transition-all ${
            darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
          }`}>
            <h3 className="text-base font-extrabold tracking-tight-sf mb-4">지필평가 일정 수정</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5 text-left">시험 과목</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              
              <div>
                <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5 text-left">시험 평가명</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-fluid-sm font-bold text-slate-500 mb-1.5 text-left">평가 날짜</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand text-slate-800 dark:text-slate-100 font-bold"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-650 dark:text-slate-300 font-bold rounded-xl text-fluid-sm cursor-pointer transition-all active:scale-98"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 h-12 bg-brand hover:bg-brand-dark text-white font-bold rounded-xl text-fluid-sm cursor-pointer transition-all active:scale-98"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-sm p-6 rounded-[28px] border shadow-2xl text-center space-y-4 transition-all ${
            darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
          }`}>
            <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={22} />
            </div>
            <div>
              <h3 className="text-base font-extrabold tracking-tight-sf">지필평가 일정 삭제</h3>
              <p className="text-sm text-slate-500 mt-1 break-keep">
                정말로 '{deletingItem.title}' 일정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeletingItem(null)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-sm cursor-pointer transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  onDeleteSchedule(deletingItem.id);
                  setDeletingItem(null);
                }}
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-sm cursor-pointer transition-colors"
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
