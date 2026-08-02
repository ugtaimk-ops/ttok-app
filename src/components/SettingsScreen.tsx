import { useState, useEffect } from "react";
import { 
  Moon, 
  Sun, 
  Bell, 
  UserX, 
  LogOut, 
  Check, 
  AlertTriangle,
  Lock,
  Smartphone,
  FileText,
  X,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { UserProfile } from "../types";
import GlassSelect, { HOUR_OPTIONS, MINUTE_OPTIONS } from "./GlassSelect";
import PremiumSection from "./PremiumSection";

interface SettingsScreenProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  onResetData: () => void;
  user: UserProfile;
  onUpdateUser: (updatedUser: UserProfile) => void;
  autoDeleteExpired: boolean;
  onToggleAutoDeleteExpired: () => void;
  onSyncNotifications?: () => void;
}

export default function SettingsScreen({ 
  darkMode, 
  onToggleDarkMode, 
  onLogout, 
  onResetData,
  user,
  onUpdateUser,
  autoDeleteExpired,
  onToggleAutoDeleteExpired,
  onSyncNotifications
}: SettingsScreenProps) {
  
  // Notification States
  const [examNotif, setExamNotif] = useState(() => {
    const saved = localStorage.getItem("ttok_exam_notif");
    return saved !== null ? saved === "true" : true;
  });
  const [assessNotif, setAssessNotif] = useState(() => {
    const saved = localStorage.getItem("ttok_assess_notif");
    return saved !== null ? saved === "true" : true;
  });
  const [dailyNotif, setDailyNotif] = useState(() => {
    const saved = localStorage.getItem("ttok_daily_notif");
    return saved !== null ? saved === "true" : false;
  });
  const [mealNotifEnabled, setMealNotifEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("ttok_meal_notif_enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [mealNotifHour, setMealNotifHour] = useState<string>(() => {
    return localStorage.getItem("ttok_meal_notif_hour") || "08";
  });
  const [mealNotifMinute, setMealNotifMinute] = useState<string>(() => {
    return localStorage.getItem("ttok_meal_notif_minute") || "20";
  });

  // Security and Purge modal states
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeCountdown, setPurgeCountdown] = useState(5);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("설정이 안전하게 적용되었습니다!");

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showPurgeModal) {
      setPurgeCountdown(5);
      timer = setInterval(() => {
        setPurgeCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setPurgeCountdown(5);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showPurgeModal]);

  const handleSaveNotif = () => {
    localStorage.setItem("ttok_exam_notif", String(examNotif));
    localStorage.setItem("ttok_assess_notif", String(assessNotif));
    localStorage.setItem("ttok_daily_notif", String(dailyNotif));
    localStorage.setItem("ttok_meal_notif_enabled", String(mealNotifEnabled));
    localStorage.setItem("ttok_meal_notif_hour", mealNotifHour);
    localStorage.setItem("ttok_meal_notif_minute", mealNotifMinute);
    setToastMessage("똑(TTOK) 푸시 알림 설정이 안전하게 갱신되었습니다!");
    setShowToast(true);
    if (onSyncNotifications) {
      onSyncNotifications();
    }
    setTimeout(() => setShowToast(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-safe-layout">
      
      {/* Header */}
      <div>
        <h1 className="text-fluid-3xl font-extrabold tracking-tight-sf">설정 및 계정 관리</h1>
      </div>

      <div className="space-y-6">
        
        {/* 1. VISUAL EFFECTS & THEMING */}
        <div className={`p-5 sm:p-6 rounded-[24px] sm:rounded-[32px] border ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm text-left`}>
          <h3 className="text-fluid-xs font-black text-slate-400 uppercase tracking-wider mb-4">테마 설정</h3>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-fluid-base font-bold text-slate-800 dark:text-slate-100">화면 모드 변경</p>
              <p className="text-fluid-sm text-slate-500 mt-1 break-keep">라이트 모드와 다크 모드를 자유롭게 변환하세요.</p>
            </div>

            <button
              onClick={onToggleDarkMode}
              className={`px-4 py-2.5 rounded-2xl border transition-all duration-300 flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap ${
                darkMode 
                  ? "bg-slate-800 border-slate-700 text-brand" 
                  : "bg-slate-50 border-slate-100 text-amber-500"
              }`}
              id="theme-toggle"
            >
              {darkMode ? (
                <>
                  <Moon size={16} className="shrink-0" />
                  <span className="text-fluid-xs font-bold whitespace-nowrap">다크 모드</span>
                </>
              ) : (
                <>
                  <Sun size={16} className="shrink-0" />
                  <span className="text-fluid-xs font-bold whitespace-nowrap">라이트 모드</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. ALARM NOTIFICATIONS */}
        <div className={`p-5 sm:p-6 rounded-[24px] sm:rounded-[32px] border ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm space-y-4 text-left`}>
          <h3 className="text-fluid-xs font-black text-slate-400 uppercase tracking-wider mb-2">알림 설정</h3>
          
          <div className="space-y-4">
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-fluid-base font-bold text-slate-800 dark:text-slate-200">지필평가 / 시험 일정 알림</p>
                <p className="text-fluid-sm text-slate-500 mt-1 break-keep">시험 일주일 전, 5일 전, 3일 전, 하루 전 푸시 발송.</p>
              </div>
              <input 
                type="checkbox"
                checked={examNotif}
                onChange={(e) => setExamNotif(e.target.checked)}
                className="w-10 h-6 bg-slate-200 checked:bg-brand rounded-full cursor-pointer appearance-none relative before:content-[''] before:absolute before:h-5 before:w-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-transform duration-200 shrink-0"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-fluid-base font-bold text-slate-800 dark:text-slate-200">수행평가 제출일 예고 알림</p>
                <p className="text-fluid-sm text-slate-500 mt-1 break-keep">수행평가 제출 하루 전 리마인드 알림 발송.</p>
              </div>
              <input 
                type="checkbox"
                checked={assessNotif}
                onChange={(e) => setAssessNotif(e.target.checked)}
                className="w-10 h-6 bg-slate-200 checked:bg-brand rounded-full cursor-pointer appearance-none relative before:content-[''] before:absolute before:h-5 before:w-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-transform duration-200 shrink-0"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-fluid-base font-bold text-slate-800 dark:text-slate-200">AI 데일리 학습 추천 제안</p>
                <p className="text-fluid-sm text-slate-500 mt-1 break-keep">매일 저녁 7시 내일의 스케줄 분석 및 피드백 제안.</p>
              </div>
              <input 
                type="checkbox"
                checked={dailyNotif}
                onChange={(e) => setDailyNotif(e.target.checked)}
                className="w-10 h-6 bg-slate-200 checked:bg-brand rounded-full cursor-pointer appearance-none relative before:content-[''] before:absolute before:h-5 before:w-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-transform duration-200 shrink-0"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-fluid-base font-bold text-slate-800 dark:text-slate-200">매일 맛있는 급식 알림</p>
                <p className="text-fluid-sm text-slate-500 mt-1 break-keep">지정된 시간에 오늘의 급식 메뉴와 칼로리 알림 발송.</p>
              </div>
              <input 
                type="checkbox"
                checked={mealNotifEnabled}
                onChange={(e) => setMealNotifEnabled(e.target.checked)}
                className="w-10 h-6 bg-slate-200 checked:bg-brand rounded-full cursor-pointer appearance-none relative before:content-[''] before:absolute before:h-5 before:w-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-transform duration-200 shrink-0"
              />
            </div>

            {mealNotifEnabled && (
              <div className="pl-4 border-l-2 border-brand/20 py-2.5 flex items-center justify-between">
                <span className="text-fluid-sm font-bold text-slate-500 dark:text-slate-400">급식 알림 시간 설정</span>
                <div className="flex items-center gap-2">
                  {/* Hour dropdown */}
                  <div className="min-w-[76px]">
                    <GlassSelect
                      value={mealNotifHour}
                      onChange={setMealNotifHour}
                      options={HOUR_OPTIONS}
                      darkMode={darkMode}
                      align="right"
                      triggerClassName="w-full flex items-center justify-between gap-1.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-xl text-fluid-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                    />
                  </div>

                  {/* Minute dropdown */}
                  <div className="min-w-[76px]">
                    <GlassSelect
                      value={mealNotifMinute}
                      onChange={setMealNotifMinute}
                      options={MINUTE_OPTIONS}
                      darkMode={darkMode}
                      align="right"
                      triggerClassName="w-full flex items-center justify-between gap-1.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-xl text-fluid-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-start justify-between pt-3 border-t border-slate-100/60 dark:border-slate-800/60">
              <div>
                <p className="text-fluid-base font-bold text-slate-800 dark:text-slate-200">지난 일정 자동 삭제</p>
                <p className="text-fluid-sm text-slate-500 mt-1 break-keep leading-relaxed">
                  일정을 적어둔 날에서 하루가 지나면 캘린더 및 리스트에서 자동으로 일정을 영구 삭제합니다.
                </p>
              </div>
              <input 
                type="checkbox"
                checked={autoDeleteExpired}
                onChange={onToggleAutoDeleteExpired}
                className="w-10 h-6 bg-slate-200 checked:bg-brand rounded-full cursor-pointer appearance-none relative before:content-[''] before:absolute before:h-5 before:w-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-transform duration-200 shrink-0"
              />
            </div>

          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              onClick={handleSaveNotif}
              className="px-5 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-fluid-sm font-black rounded-2xl flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Bell size={15} /> 알림 규칙 적용 저장
            </button>
          </div>
        </div>

        {/* 2.5. PREMIUM / SUBSCRIPTION */}
        <PremiumSection user={user} darkMode={darkMode} />

        {/* 3. PLATFORM & SECURITY */}
        <div className={`p-5 sm:p-6 rounded-[24px] sm:rounded-[32px] border ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm space-y-4 text-left`}>
          <h3 className="text-fluid-xs font-black text-slate-400 uppercase tracking-wider mb-2">기기 연동 및 계정 관리</h3>

          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-fluid-sm font-semibold">
              <span className="text-slate-400">플랫폼 모드</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Smartphone size={15} /> Android / iOS 크로스 플랫폼 지원
              </span>
            </div>

            <div className="flex items-center justify-between text-fluid-sm font-semibold">
              <span className="text-slate-400">데이터 백업 연동</span>
              <span className="text-emerald-500 font-bold flex items-center gap-1">
                <Lock size={14} /> Google Cloud 기기 간 완벽 백업 지원
              </span>
            </div>

            {user.email && (
              <div className="flex items-center justify-between text-fluid-sm font-semibold">
                <span className="text-slate-400">로그인 계정</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{user.email}</span>
              </div>
            )}

            <button
              onClick={onLogout}
              className="w-full mt-1 py-3 rounded-2xl flex items-center justify-center gap-1.5 text-fluid-sm font-black text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <LogOut size={15} /> 로그아웃
            </button>
          </div>
        </div>



        {/* 3.5 TERMS & AGREEMENTS */}
        <div className={`p-5 sm:p-6 rounded-[24px] sm:rounded-[32px] border transition-all ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 text-left`}>
          <div>
            <p className="text-fluid-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <FileText size={16} className="text-brand" /> 서비스 이용약관
            </p>
            <p className="text-fluid-sm text-slate-550 dark:text-slate-400 mt-1">똑 (TTOK)의 정밀한 인공지능 분석 가이드 및 프라이버시 보호 약관을 확인합니다.</p>
          </div>

          <button
            onClick={() => setShowTermsModal(true)}
            className="px-5 py-3 bg-brand hover:bg-brand-dark dark:hover:bg-brand/90 text-white text-fluid-sm font-black rounded-2xl flex items-center gap-1.5 cursor-pointer shadow-md shadow-brand/10 transition-all active:scale-95"
          >
            약관 내용 보기
          </button>
        </div>

        {/* 4. LOG OUT & DATA PURGE DANGER ZONE */}
        <div className={`p-5 sm:p-6 rounded-[24px] sm:rounded-[32px] border ${
          darkMode ? "bg-rose-950/20 border-rose-500/10" : "bg-rose-50/20 border-rose-100"
        } shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 text-left`}>
          <div>
            <p className="text-fluid-base font-bold text-rose-500">주의 구역 (Danger Zone)</p>
            <p className="text-fluid-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">똑(TTOK) 서비스 내에 기록된 캘린더 일정, 대본 연습 로그, 공부 기록 데이터를 영구 초기화합니다.</p>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowPurgeModal(true)}
              className="px-6 py-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 text-rose-500 text-fluid-sm font-black rounded-2xl flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <UserX size={15} /> 데이터 전체 초기화
            </button>
          </div>
        </div>

      </div>

      {/* Purge Modal overlay */}
      <AnimatePresence>
        {showPurgeModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-sm p-5 sm:p-6 rounded-[24px] sm:rounded-[32px] border text-center ${
                darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              }`}
            >
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">데이터 영구 삭제</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                정말로 모든 수행평가 일정, 발표 연습 대본, 공부 기록을 초기화하시겠습니까?<br />이 작업은 되돌릴 수 없습니다.
              </p>

              <div className="flex justify-center gap-3 mt-6">
                <button
                  onClick={() => setShowPurgeModal(false)}
                  className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-fluid-sm font-bold rounded-xl cursor-pointer active:scale-98 transition-all"
                >
                  취소
                </button>
                {purgeCountdown > 0 ? (
                  <button
                    disabled
                    className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 text-slate-450 dark:text-slate-600 text-fluid-sm font-bold rounded-xl cursor-not-allowed opacity-60"
                  >
                    초기화 ({purgeCountdown}초)
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onResetData();
                      setShowPurgeModal(false);
                    }}
                    className="flex-1 h-12 bg-rose-500 hover:bg-rose-600 text-white text-fluid-sm font-bold rounded-xl cursor-pointer transition-all active:scale-95 shadow-md shadow-rose-500/10"
                  >
                    초기화 실행
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Terms of Service Modal overlay */}
      <AnimatePresence>
        {showTermsModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={`w-full max-w-xl p-5 sm:p-6 md:p-8 rounded-[24px] sm:rounded-[32px] border flex flex-col max-h-[85vh] ${
                darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-100 text-slate-800"
              } shadow-2xl`}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-brand/10 text-brand rounded-xl flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight-sf">똑(TTOK) 서비스 이용약관</h3>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">최종 개정일: 2026년 8월 2일</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTermsModal(false)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Content Container */}
              <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans custom-scrollbar">
                
                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 1 조 (목적)</p>
                  <p>
                    본 약관은 "똑(TTOK) 학생 수행평가 및 발표 대비 보조 플랫폼"(이하 "서비스")의 이용에 관한 조건 및 절차, 이용자와 똑(TTOK) 서비스 개발자 간의 권리, 의무 및 제반 책임 사항을 명확히 규정함을 목적으로 합니다.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 2 조 (용어의 정의)</p>
                  <p className="space-y-1">
                    1. "서비스"란 학생의 수행평가 계획 자동화 스케줄링, 시험 카운트다운 관리, 교과 개념 분석, AI 스크립트 작성 및 실시간 미디어 분석 피드백(발음 딕션 점수, 시선 분석, 제스처 피드백)을 포함하여 브라우저에서 제공되는 모든 디지털 보조 유틸리티를 총칭합니다.<br />
                    2. "이용자"란 서비스를 이용하기 위해 가입하고 학적 및 학습 목표를 설정하여 서비스를 활성화하는 학생, 학부모 및 교사를 말합니다.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 3 조 (회원정보의 보호 및 개인정보 보안)</p>
                  <div className="space-y-2">
                    <p>
                      1. 똑(TTOK)은 이용자의 과도하고 불필요한 개인 식별 정보의 외부 노출 및 수집을 엄격히 제한하며, 입력받는 학교명, 학년, 반 등의 정보는 오직 맞춤화된 학습 캘린더 생성 및 편의 향상 목적으로만 보관됩니다.
                    </p>
                    <p className="space-y-1">
                      2. <strong className="text-brand font-bold">개인정보 보호 최우선 설계 원칙:</strong><br />
                      • 사용자가 업로드한 녹음 파일, 동영상 파일, 이미지 파일, PDF 파일 등 원본 파일은 AI 서버나 클라우드로 전송하지 않습니다.<br />
                      • 가능한 모든 전처리는 사용자의 기기(Local Device)에서 수행합니다.<br />
                      • <strong>음성:</strong> 기기에서 텍스트로 변환(STT)한 후 변환된 텍스트만 AI에 전달합니다.<br />
                      • <strong>PDF:</strong> 기기에서 텍스트를 추출한 후 텍스트만 AI에 전달합니다.<br />
                      • <strong>이미지:</strong> 기기에서 필요한 정보를 추출한 후 텍스트만 AI에 전달합니다.<br />
                      • <strong>동영상:</strong> 기기에서 음성을 추출하고 텍스트로 변환한 후 텍스트만 AI에 전달합니다.<br />
                      • 원본 파일은 서버에 업로드하지 않습니다.<br />
                      • AI 처리 후 원본 파일과 임시 데이터는 즉시 삭제합니다.<br />
                      • 사용자 데이터를 서버에 저장하지 않습니다.<br />
                      • 사용자 동의 없이 AI 학습이나 데이터 수집 목적으로 사용하지 않습니다.<br />
                      • 모든 통신은 HTTPS를 사용합니다.
                    </p>
                  </div>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 4 조 (이용자의 권리와 의무)</p>
                  <p className="space-y-1">
                    1. 이용자는 자신의 실제 학적 정보 및 공부 목표에 기반하여 일정을 올바르게 기재하고 수행할 권리를 가집니다.<br />
                    2. 이용자는 본 서비스 내의 기능(AI 사진 스캔 등록, AI 피드백 튜터, 발표 분석 등)을 타인의 지적재산권이나 초상권을 침해하지 않는 건전한 학업 및 자기계발적 범위 내에서만 정당하게 활용하여야 합니다.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 5 조 (제공 서비스의 제한 및 면책조항)</p>
                  <p className="space-y-1">
                    1. 똑(TTOK) 서비스에서 제공하는 모든 AI 분석 성적, 발음 교정 정보, 가중 점수 및 피드백 내용은 이용자의 학업적 참고와 프레젠테이션 스피치 향상을 돕기 위한 보조적 지표 자료일 뿐입니다.<br />
                    2. 해당 피드백 자료는 실제 학교 교사나 소속 교육기관의 지필고사 및 수행평가 실질 채점 기준과 다를 수 있으며, 본 서비스는 이용자가 기록한 정보의 완벽한 행정적·공식적 정확성이나 공인 평가 결과를 보증하지 않습니다. 이에 따른 학업 성과 및 채점 불일치 책임은 이용자 본인에게 있습니다.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 6 조 (똑 PRO 유료 구독 및 결제)</p>
                  <div className="space-y-2">
                    <p>
                      1. 똑(TTOK)은 무료로 제공되는 기본 서비스 외에, 유료 구독 상품인 <strong className="text-brand font-bold">"똑 PRO"</strong>를 제공합니다. 똑 PRO 구독 시 월간 AI 기능 이용 횟수가 확대되며, AI 추천 리포트 등 PRO 전용 기능을 이용할 수 있습니다.
                    </p>
                    <p>
                      2. 구독 상품 및 가격은 다음과 같습니다. (부가세 포함, Google Play 정책에 따라 변경될 수 있습니다)<br />
                      • 월간 구독: 2,900원 / 월<br />
                      • 연간 구독: 29,000원 / 년
                    </p>
                    <p>
                      3. 결제는 <strong>Google Play 인앱 결제 시스템</strong>을 통해서만 이루어지며, 똑(TTOK)은 결제 정보를 직접 수집하거나 저장하지 않습니다.
                    </p>
                    <p>
                      4. 구독은 별도로 해지하지 않는 한 각 결제 주기(월간/연간)가 끝날 때 자동으로 갱신되며, 자동 갱신 전 Google Play를 통해 이용자에게 사전 고지됩니다.
                    </p>
                    <p>
                      5. 구독 해지는 앱 내 설정 화면의 <strong>"구독 관리 / 해지"</strong> 메뉴 또는 Google Play 스토어의 구독 관리 화면에서 언제든지 직접 진행할 수 있습니다. 해지 시에도 이미 결제된 기간 동안은 계속 PRO 혜택을 이용할 수 있습니다.
                    </p>
                    <p>
                      6. 결제 취소 및 환불은 <strong>Google Play의 환불 정책 및 절차</strong>를 따르며, 똑(TTOK)이 자체적으로 환불을 처리하지 않습니다. 환불 요청은 Google Play 고객센터를 통해 진행해 주시기 바랍니다.
                    </p>
                  </div>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 7 조 (준거법 및 관할법원)</p>
                  <p>
                    본 약관의 해석 및 이용자와 똑(TTOK) 서비스 간의 분쟁이 발생할 경우 대한민국 관계 법령을 준거법으로 하며, 법이 정한 관할 법원을 통하여 원만하고 합리적인 해결을 도모합니다.
                  </p>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 w-full">
                <button
                  onClick={() => setShowTermsModal(false)}
                  className="w-full sm:w-auto h-12 px-8 bg-brand hover:bg-brand-dark text-white text-fluid-sm font-extrabold rounded-2xl cursor-pointer shadow-md shadow-brand/10 transition-all active:scale-95 flex items-center justify-center"
                >
                  확인 및 동의
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Save Notification Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-fab-safe right-6 bg-brand text-white px-5 py-3 rounded-2xl flex items-center gap-2 shadow-lg text-xs font-bold z-50"
          >
            <Check size={16} />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
