import BackButton from "./BackButton";
import { useScreenBack } from "../lib/screenBack";
import { useState, useEffect, useRef } from "react";
import { 
  Moon, 
  Sun, 
  UserX, 
  LogOut, 
  AlertTriangle,
  FileText,
  X,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { UserProfile } from "../types";
import GlassSelect, { HOUR_OPTIONS, MINUTE_OPTIONS } from "./GlassSelect";
import PremiumSection from "./PremiumSection";
import TermsContent, { TERMS_VERSION } from "./TermsContent";

interface SettingsScreenProps {
  darkMode: boolean;
  planPreview?: "free" | "pro";
  onToggleDarkMode: () => void;
  onLogout: () => void;
  onDeleteAccount: () => Promise<void>;
  onResetData: () => void;
  user: UserProfile;
  onUpdateUser: (updatedUser: UserProfile) => void;
  autoDeleteExpired: boolean;
  onToggleAutoDeleteExpired: () => void;
  onSyncNotifications?: () => void;
}

export default function SettingsScreen({ 
  darkMode, 
  planPreview,
  onToggleDarkMode, 
  onLogout, 
  onDeleteAccount,
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
    return saved !== null ? saved === "true" : true;
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [purgeCountdown, setPurgeCountdown] = useState(5);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const syncNotificationsRef = useRef(onSyncNotifications);
  syncNotificationsRef.current = onSyncNotifications;
  const notificationsInitialized = useRef(false);

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

  useEffect(() => {
    localStorage.setItem("ttok_exam_notif", String(examNotif));
    localStorage.setItem("ttok_assess_notif", String(assessNotif));
    localStorage.setItem("ttok_daily_notif", String(dailyNotif));
    localStorage.setItem("ttok_meal_notif_enabled", String(mealNotifEnabled));
    localStorage.setItem("ttok_meal_notif_hour", mealNotifHour);
    localStorage.setItem("ttok_meal_notif_minute", mealNotifMinute);
    if (!notificationsInitialized.current) {
      notificationsInitialized.current = true;
      return;
    }
    const timer = window.setTimeout(() => syncNotificationsRef.current?.(), 250);
    return () => window.clearTimeout(timer);
  }, [examNotif, assessNotif, dailyNotif, mealNotifEnabled, mealNotifHour, mealNotifMinute]);

  useScreenBack(() => {
    if (showDeleteModal && !deleting) { setShowDeleteModal(false); return true; }
    if (showTermsModal) { setShowTermsModal(false); return true; }
    if (showPurgeModal) { setShowPurgeModal(false); return true; }
    return false;
  });

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

            <button data-ui="settings-dark-mode"
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

        </div>

        {/* 2.5. PREMIUM / SUBSCRIPTION */}
        <PremiumSection user={user} darkMode={darkMode} planPreview={planPreview} />

        {/* 3. PLATFORM & SECURITY */}
        <div className={`p-5 sm:p-6 rounded-[24px] sm:rounded-[32px] border ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm space-y-4 text-left`}>
          <h3 className="text-fluid-xs font-black text-slate-400 uppercase tracking-wider mb-2">기기 연동 및 계정 관리</h3>

          <div className="space-y-3.5">
            {user.email && (
              <div className="flex items-center justify-between text-fluid-sm font-semibold">
                <span className="text-slate-400">로그인 계정</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{user.email}</span>
              </div>
            )}

            <button data-ui="settings-logout"
              onClick={onLogout}
              className="w-full mt-1 py-3 rounded-2xl flex items-center justify-center gap-1.5 text-fluid-sm font-black text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <LogOut size={15} /> 로그아웃
            </button>
            <button type="button" onClick={() => { setDeleteError(""); setDeleteConfirmation(""); setShowDeleteModal(true); }}
              className="w-full py-3 rounded-2xl text-fluid-sm font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/20 cursor-pointer">
              계정 및 데이터 삭제
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

          <button data-ui="settings-terms-open"
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
            <button data-ui="settings-reset-open"
              onClick={() => setShowPurgeModal(true)}
              className="px-6 py-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 text-rose-500 text-fluid-sm font-black rounded-2xl flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <UserX size={15} /> 데이터 전체 초기화
            </button>
          </div>
        </div>

      </div>

      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-[60] bg-slate-950/60 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-6 space-y-4 text-left shadow-xl">
              <h3 className="font-black text-lg text-rose-600">계정 및 데이터 삭제</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">Firebase 로그인 계정, 프로필, 일정, 대본, 발표 기록과 서버에 저장된 AI 결과를 삭제하고 RevenueCat 고객 기록 삭제를 요청합니다. 되돌릴 수 없어요. 구독 중이라면 Google Play에서 별도로 구독을 해지해야 다음 결제가 멈춥니다.</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">최근 5분 안에 로그인한 계정만 삭제할 수 있어요. 아래에 <strong>삭제</strong>를 입력해 주세요.</p>
              <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)}
                className="w-full rounded-xl border p-3 dark:bg-slate-800" aria-label="삭제 확인 입력" placeholder="삭제" />
              {deleteError && <p role="alert" className="text-sm text-rose-600">{deleteError}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={deleting} onClick={() => setShowDeleteModal(false)}
                  className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 py-3 font-bold">취소</button>
                <button type="button" disabled={deleting || deleteConfirmation !== "삭제"}
                  onClick={async () => {
                    setDeleting(true);
                    setDeleteError("");
                    try { await onDeleteAccount(); setShowDeleteModal(false); }
                    catch (error) { setDeleteError(error instanceof Error ? error.message : "삭제에 실패했어요."); }
                    finally { setDeleting(false); }
                  }}
                  className="flex-1 rounded-xl bg-rose-600 py-3 font-bold text-white disabled:opacity-40">{deleting ? "삭제 중..." : "영구 삭제"}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
              <div className="text-left"><BackButton label="취소" onClick={() => setShowPurgeModal(false)} className="mb-3" /></div>
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">데이터 영구 삭제</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                정말로 모든 수행평가 일정, 발표 연습 대본, 공부 기록을 초기화하시겠습니까?<br />이 작업은 되돌릴 수 없습니다.
              </p>

              <div className="flex justify-center gap-3 mt-6">
                <button data-ui="settings-reset-cancel"
                  onClick={() => setShowPurgeModal(false)}
                  className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-fluid-sm font-bold rounded-xl cursor-pointer active:scale-98 transition-all"
                >
                  취소
                </button>
                {purgeCountdown > 0 ? (
                  <button data-ui="settings-reset-countdown"
                    disabled
                    className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 text-slate-450 dark:text-slate-600 text-fluid-sm font-bold rounded-xl cursor-not-allowed opacity-60"
                  >
                    초기화 ({purgeCountdown}초)
                  </button>
                ) : (
                  <button data-ui="settings-reset-run"
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
              <BackButton label="취소" onClick={() => setShowTermsModal(false)} className="mb-3 self-start" />
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-brand/10 text-brand rounded-xl flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight-sf">똑(TTOK) 서비스 이용약관</h3>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">최종 개정일: {TERMS_VERSION}</p>
                  </div>
                </div>
                <button data-ui="settings-terms-close-x"
                  onClick={() => setShowTermsModal(false)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <TermsContent />

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 w-full">
                <button data-ui="settings-terms-close"
                  onClick={() => setShowTermsModal(false)}
                  className="w-full sm:w-auto h-12 px-8 bg-brand hover:bg-brand-dark text-white text-fluid-sm font-extrabold rounded-2xl cursor-pointer shadow-md shadow-brand/10 transition-all active:scale-95 flex items-center justify-center"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
