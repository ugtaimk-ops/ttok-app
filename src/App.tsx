import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "motion/react";
import { Loader2 } from "lucide-react";
import type { User } from "firebase/auth";
import {
  UserProfile,
  ScheduleItem,
  ScriptItem,
  PracticeLog,
  TodoItem
} from "./types";
import { initNotifications, syncAllNotifications } from "./services/notificationService";
import { getTodayDateString } from "./lib/api";
import { auth, onAuthStateChanged } from "./lib/firebase";
import { authService } from "./services/authService";
import { dataSyncService } from "./services/dataSyncService";
import { purchaseService } from "./services/purchaseService";

// Screens imports
import HomeScreen from "./components/HomeScreen";
import KkorureukScreen from "./components/KkorureukScreen";
import AssessmentScreen from "./components/AssessmentScreen";
import PracticeScreen from "./components/PracticeScreen";
import StudyScreen from "./components/StudyScreen";
import ProfileScreen from "./components/ProfileScreen";
import SettingsScreen from "./components/SettingsScreen";
import BottomNavigationBar from "./components/BottomNavigationBar";
import LoginScreen from "./components/LoginScreen";
import EmailVerificationScreen from "./components/EmailVerificationScreen";

const INITIAL_USER: UserProfile = {
  name: "",
  school: "",
  schoolCode: "",
  officeCode: "",
  officeName: "",
  schoolKind: "",
  grade: "",
  classNum: "",
  goal: "",
  avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=256"
};

const INITIAL_SCHEDULES: ScheduleItem[] = [];

const INITIAL_TODOS: TodoItem[] = [];

const INITIAL_SCRIPTS: ScriptItem[] = [];

const INITIAL_PRACTICE_LOGS: PracticeLog[] = [];

export default function App() {
  // undefined = still checking auth state, null = signed out, User = signed in
  const [authUser, setAuthUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setAuthUser(fbUser);
    });
    // Safety net: if Firebase Auth's initial state callback never fires (seen on some
    // WKWebView setups), don't leave the user stuck on the loading screen forever.
    const timeoutId = setTimeout(() => {
      setAuthUser(prev => (prev === undefined ? null : prev));
    }, 8000);
    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  // Google/Apple sign-in already comes back with emailVerified: true, so this
  // only ever gates password-provider accounts. Tracked separately from
  // authUser because reloading the Firebase User object to pick up a fresh
  // emailVerified value doesn't change its reference, so React wouldn't
  // otherwise notice the update.
  const [emailVerified, setEmailVerified] = useState(true);
  useEffect(() => {
    setEmailVerified(authUser?.emailVerified ?? true);
  }, [authUser]);
  const isPasswordAccount = authUser?.providerData.some(p => p.providerId === "password") ?? false;

  const [tokTab, setTokTab] = useState<string>("home");
  const [kkorureukTab, setKkorureukTab] = useState<string>("meal-today");
  const [serviceMode, setServiceMode] = useState<"tok" | "kkorureuk">("tok");
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Deep navigation sub-states
  const [assessmentMode, setAssessmentMode] = useState<"list" | "direct" | "photo">("list");
  const [practiceSubTab, setPracticeSubTab] = useState<"script" | "practice">("script");
  const [studySubTab, setStudySubTab] = useState<"helper" | "planner">("helper");
  const [studyHelperMode, setStudyHelperMode] = useState<"summary" | "quiz" | "note" | "question">("summary");

  // Core state modules initialized from localStorage with robust fallback
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem("ttok_user_profile");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Local storage user parse failed:", e);
      }
    }
    return INITIAL_USER;
  });

  const [schedules, setSchedules] = useState<ScheduleItem[]>(() => {
    const saved = localStorage.getItem("ttok_schedules");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Local storage schedules parse failed:", e);
      }
    }
    return INITIAL_SCHEDULES;
  });

  const [todos, setTodos] = useState<TodoItem[]>(() => {
    const saved = localStorage.getItem("ttok_todos");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Local storage todos parse failed:", e);
      }
    }
    return INITIAL_TODOS;
  });

  const [scripts, setScripts] = useState<ScriptItem[]>(() => {
    const saved = localStorage.getItem("ttok_scripts");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Local storage scripts parse failed:", e);
      }
    }
    return INITIAL_SCRIPTS;
  });

  const [practiceLogs, setPracticeLogs] = useState<PracticeLog[]>(() => {
    const saved = localStorage.getItem("ttok_practice_logs");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Local storage practice logs parse failed:", e);
      }
    }
    return INITIAL_PRACTICE_LOGS;
  });

  // Sync state modifications to localStorage
  useEffect(() => {
    localStorage.setItem("ttok_user_profile", JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem("ttok_schedules", JSON.stringify(schedules));
  }, [schedules]);

  useEffect(() => {
    localStorage.setItem("ttok_todos", JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    localStorage.setItem("ttok_scripts", JSON.stringify(scripts));
  }, [scripts]);

  useEffect(() => {
    localStorage.setItem("ttok_practice_logs", JSON.stringify(practiceLogs));
  }, [practiceLogs]);

  // Refs so the cloud-sync effect below can read "current" local state without
  // depending on it directly (which would tear down and rebuild the Firestore
  // listeners on every single edit).
  const schedulesRef = useRef(schedules);
  const todosRef = useRef(todos);
  const scriptsRef = useRef(scripts);
  const practiceLogsRef = useRef(practiceLogs);
  useEffect(() => { schedulesRef.current = schedules; }, [schedules]);
  useEffect(() => { todosRef.current = todos; }, [todos]);
  useEffect(() => { scriptsRef.current = scripts; }, [scripts]);
  useEffect(() => { practiceLogsRef.current = practiceLogs; }, [practiceLogs]);

  // Identifies this user to RevenueCat as app_user_id, so a purchase maps
  // back to the right users/{uid} doc when the subscription webhook fires.
  useEffect(() => {
    if (authUser?.uid) purchaseService.configure(authUser.uid);
  }, [authUser?.uid]);

  // Cloud sync: once signed in, upload any local-only data (first login on this
  // device only - skipped if the cloud side already has data), then keep local
  // state live-mirrored to Firestore for cross-device sync.
  useEffect(() => {
    if (!authUser) return;
    const uid = authUser.uid;
    let cancelled = false;
    const unsubscribers: Array<() => void> = [];

    (async () => {
      await Promise.all([
        dataSyncService.migrateSchedulesIfEmpty(uid, schedulesRef.current),
        dataSyncService.migrateTodosIfEmpty(uid, todosRef.current),
        dataSyncService.migrateScriptsIfEmpty(uid, scriptsRef.current),
        dataSyncService.migratePracticeLogsIfEmpty(uid, practiceLogsRef.current)
      ]);
      if (cancelled) return;

      unsubscribers.push(
        dataSyncService.subscribeToProfile(uid, (data) => {
          if (data) setUser(prev => ({ ...prev, ...data }));
        }),
        dataSyncService.subscribeToSchedules(uid, setSchedules),
        dataSyncService.subscribeToTodos(uid, setTodos),
        dataSyncService.subscribeToScripts(uid, setScripts),
        dataSyncService.subscribeToPracticeLogs(uid, setPracticeLogs)
      );
    })();

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [authUser?.uid]);

  // Initialize device-specific native local notification listeners on mount
  useEffect(() => {
    initNotifications((extra) => {
      if (extra) {
        if (extra.serviceMode) {
          setServiceMode(extra.serviceMode);
          if (extra.serviceMode === "kkorureuk" && extra.tab) {
            setKkorureukTab(extra.tab);
          }
        } else if (extra.tab) {
          setServiceMode("tok");
          setTokTab(extra.tab);
        }
      }
    });
  }, []);

  // Synchronize scheduled notifications whenever schedules list or user profile changes
  useEffect(() => {
    syncAllNotifications(schedules);
  }, [schedules, user]);

  // Sync dark mode styles on DOM root element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const handleToggleDarkMode = () => setDarkMode(!darkMode);

  const [autoDeleteExpired, setAutoDeleteExpired] = useState<boolean>(() => {
    return localStorage.getItem("ttok_auto_delete_expired") === "true";
  });

  const handleToggleAutoDeleteExpired = () => {
    const newVal = !autoDeleteExpired;
    setAutoDeleteExpired(newVal);
    localStorage.setItem("ttok_auto_delete_expired", String(newVal));
  };

  // Automatically purge expired schedules and todos if the feature is enabled
  useEffect(() => {
    if (autoDeleteExpired) {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      setSchedules(prev => {
        const filtered = prev.filter(s => !s.date || s.date >= todayStr);
        if (filtered.length !== prev.length) {
          return filtered;
        }
        return prev;
      });

      setTodos(prev => {
        const filtered = prev.filter(t => !t.dueDate || t.dueDate >= todayStr);
        if (filtered.length !== prev.length) {
          return filtered;
        }
        return prev;
      });
    }
  }, [autoDeleteExpired, schedules, todos]);

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (e) {
      console.error("Sign out failed:", e);
    }
    // Clear local state/refs so that if a different account signs in on this
    // same device, the cloud-sync effect's migrate-if-empty step doesn't read
    // stale refs still holding the previous user's data and upload it into
    // the new account.
    setUser(INITIAL_USER);
    setSchedules(INITIAL_SCHEDULES);
    setTodos(INITIAL_TODOS);
    setScripts(INITIAL_SCRIPTS);
    setPracticeLogs(INITIAL_PRACTICE_LOGS);
    // onAuthStateChanged will flip authUser to null and return to LoginScreen
  };

  const handleLoginSuccess = (profile: UserProfile) => {
    setUser(prev => ({ ...prev, ...profile }));
  };

  const handleUpdateUser = (updated: UserProfile) => {
    setUser(updated);
    if (authUser) dataSyncService.saveProfile(authUser.uid, updated);
  };

  const handleResetData = () => {
    localStorage.removeItem("ttok_user_profile");
    localStorage.removeItem("ttok_schedules");
    localStorage.removeItem("ttok_todos");
    localStorage.removeItem("ttok_scripts");
    localStorage.removeItem("ttok_practice_logs");

    setUser(INITIAL_USER);
    setSchedules(INITIAL_SCHEDULES);
    setTodos(INITIAL_TODOS);
    setScripts(INITIAL_SCRIPTS);
    setPracticeLogs(INITIAL_PRACTICE_LOGS);
    setTokTab("home");
    setKkorureukTab("meal-today");
    setServiceMode("tok");

    if (authUser) {
      dataSyncService.saveProfile(authUser.uid, INITIAL_USER);
      dataSyncService.clearAllUserData(authUser.uid);
    }
  };

  const handleAddSchedule = (newSchedule: Omit<ScheduleItem, "id">) => {
    const id = "sc_" + Date.now();
    const item = { ...newSchedule, id };
    setSchedules(prev => [...prev, item]);
    if (authUser) dataSyncService.saveSchedule(authUser.uid, item);
  };

  const handleDeleteSchedule = (id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
    if (authUser) dataSyncService.deleteSchedule(authUser.uid, id);
  };

  const handleUpdateSchedule = (updated: ScheduleItem) => {
    setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
    if (authUser) dataSyncService.saveSchedule(authUser.uid, updated);
  };

  const handleToggleTodo = (id: string) => {
    const target = todos.find(t => t.id === id);
    if (!target) return;
    const updated = { ...target, completed: !target.completed };
    setTodos(prev => prev.map(t => t.id === id ? updated : t));
    if (authUser) dataSyncService.saveTodo(authUser.uid, updated);
  };

  const handleAddTodo = (text: string, category: "homework" | "general" | "exam" | "assessment", dueDate?: string) => {
    const safeCategory = category === "assessment" ? "assessment" : category === "exam" ? "exam" : "homework";
    const id = "td_" + Date.now();
    const item: TodoItem = {
      id,
      text,
      completed: false,
      dueDate: dueDate || getTodayDateString(),
      category: safeCategory
    };
    setTodos(prev => [...prev, item]);
    if (authUser) dataSyncService.saveTodo(authUser.uid, item);
  };

  const handleDeleteTodo = (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
    if (authUser) dataSyncService.deleteTodo(authUser.uid, id);
  };

  const handleAddScript = (script: ScriptItem) => {
    setScripts(prev => [...prev, script]);
    if (authUser) dataSyncService.saveScript(authUser.uid, script);
  };

  const handleDeleteScript = (id: string) => {
    setScripts(prev => prev.filter(s => s.id !== id));
    if (authUser) dataSyncService.deleteScript(authUser.uid, id);
  };

  const handleUpdateScript = (updated: ScriptItem) => {
    setScripts(prev => prev.map(s => s.id === updated.id ? updated : s));
    if (authUser) dataSyncService.saveScript(authUser.uid, updated);
  };

  const handleAddPracticeLog = (newLog: Omit<PracticeLog, "id" | "date">) => {
    const id = "pr_" + Date.now();
    const item = { ...newLog, id, date: getTodayDateString() };
    setPracticeLogs(prev => [...prev, item]);
    if (authUser) dataSyncService.savePracticeLog(authUser.uid, item);
  };

  const currentActiveTab = serviceMode === "tok" ? tokTab : kkorureukTab;
  const setCurrentActiveTab = (tab: string, params?: {
    assessmentMode?: "list" | "direct" | "photo";
    practiceSubTab?: "script" | "practice";
    studySubTab?: "helper" | "planner";
    studyHelperMode?: "summary" | "quiz" | "note" | "question";
  }) => {
    if (serviceMode === "tok") {
      if (params) {
        if (params.assessmentMode) setAssessmentMode(params.assessmentMode);
        if (params.practiceSubTab) setPracticeSubTab(params.practiceSubTab);
        if (params.studySubTab) setStudySubTab(params.studySubTab);
        if (params.studyHelperMode) setStudyHelperMode(params.studyHelperMode);
      }
      setTokTab(tab);
    } else {
      setKkorureukTab(tab);
    }
  };

  // Still resolving the initial auth state on app startup
  if (authUser === undefined) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        darkMode ? "bg-slate-950" : "bg-slate-50"
      }`}>
        <Loader2 className={`w-8 h-8 animate-spin ${darkMode ? "text-blue-400" : "text-brand"}`} />
      </div>
    );
  }

  // Not signed in - show the login screen
  if (authUser === null) {
    return <LoginScreen onLogin={handleLoginSuccess} darkMode={darkMode} />;
  }

  // Signed in with email/password but hasn't clicked the verification link yet
  if (isPasswordAccount && !emailVerified) {
    return (
      <EmailVerificationScreen
        email={authUser?.email}
        darkMode={darkMode}
        onVerified={() => setEmailVerified(true)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 pb-20 ${
      darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50/50 text-slate-800"
    }`}>

      {/* Header Bar with Service Switcher enclosed in a beautiful Blue Box */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md safe-top ${
        darkMode ? "bg-slate-950/80 border-slate-900" : "bg-white/80 border-slate-100"
      }`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-3 flex justify-between items-center">
          <div className="flex items-center">
            {/* 파란색 네모로 둘러싸인 '똑 | 꼬르륵' 큰 글씨 서비스 전환 메뉴 */}
            <div className="border-2 border-brand/80 dark:border-blue-500/80 rounded-2xl p-0.5 bg-brand/5 dark:bg-blue-500/5 flex items-center gap-0.5 select-none shadow-sm">
              <button
                onClick={() => setServiceMode("tok")}
                className={`px-3.5 sm:px-5 py-1 sm:py-1.5 text-base sm:text-lg md:text-xl font-black rounded-xl transition-all duration-150 cursor-pointer ${
                  serviceMode === "tok"
                    ? "bg-brand text-white shadow-md shadow-brand/15"
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                }`}
              >
                똑
              </button>
              <button
                onClick={() => setServiceMode("kkorureuk")}
                className={`px-3.5 sm:px-5 py-1 sm:py-1.5 text-base sm:text-lg md:text-xl font-black rounded-xl transition-all duration-150 cursor-pointer ${
                  serviceMode === "kkorureuk"
                    ? "bg-brand text-white shadow-md shadow-brand/15"
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                }`}
              >
                꼬르륵
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 dark:text-slate-500 max-w-[120px] sm:max-w-none truncate">
              {user.school ? `${user.school} ${user.grade || "1"}학년` : "프로필 미설정"}
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-brand-light dark:bg-brand/10 border border-brand/5 rounded-full overflow-hidden shrink-0 flex items-center justify-center">
              {user.avatarUrl && !user.avatarUrl.startsWith("http") && !user.avatarUrl.startsWith("data:") ? (
                <span className="text-sm select-none" role="img" aria-label="profile emoji">
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
          </div>
        </div>
      </header>

      {/* Primary tab views - Immediately rendered for snappy transitions */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-3 sm:pt-6 pb-[calc(5rem+env(safe-area-inset-bottom,12px))] sm:pb-32 relative">
        
        {serviceMode === "tok" ? (
          <div className="w-full animate-fade-in">
            {/* All tabs stay mounted (hidden via CSS, not unmounted) so an
                in-flight AI request and its result survive the user
                switching tabs or backgrounding the app mid-request - see
                usageService "increments but never shows a result" bug. */}
            <div className={tokTab === "home" ? "" : "hidden"}>
              <HomeScreen
                user={user}
                todos={todos}
                schedules={schedules}
                onToggleTodo={handleToggleTodo}
                onAddTodo={handleAddTodo}
                onDeleteTodo={handleDeleteTodo}
                darkMode={darkMode}
                onChangeTab={setCurrentActiveTab}
                onAddSchedule={handleAddSchedule}
                onDeleteSchedule={handleDeleteSchedule}
                onUpdateSchedule={handleUpdateSchedule}
              />
            </div>

            <div className={tokTab === "assessment" ? "" : "hidden"}>
              <AssessmentScreen
                schedules={schedules}
                onAddSchedule={handleAddSchedule}
                onAddTodo={handleAddTodo}
                onDeleteSchedule={handleDeleteSchedule}
                onUpdateSchedule={handleUpdateSchedule}
                darkMode={darkMode}
                initialMode={assessmentMode}
              />
            </div>

            <div className={tokTab === "practice" ? "" : "hidden"}>
              <PracticeScreen
                user={user}
                scripts={scripts}
                onAddScript={handleAddScript}
                onDeleteScript={handleDeleteScript}
                onUpdateScript={handleUpdateScript}
                practiceLogs={practiceLogs}
                onAddPracticeLog={handleAddPracticeLog}
                darkMode={darkMode}
                initialSubTab={practiceSubTab}
              />
            </div>

            <div className={tokTab === "study" ? "" : "hidden"}>
              <StudyScreen
                schedules={schedules}
                onAddSchedule={handleAddSchedule}
                onDeleteSchedule={handleDeleteSchedule}
                onUpdateSchedule={handleUpdateSchedule}
                darkMode={darkMode}
                initialSubTab={studySubTab}
                initialHelperMode={studyHelperMode}
              />
            </div>

            <div className={tokTab === "profile" ? "" : "hidden"}>
              <ProfileScreen
                user={user}
                onUpdateUser={handleUpdateUser}
                darkMode={darkMode}
              />
            </div>

            <div className={tokTab === "settings" ? "" : "hidden"}>
              <SettingsScreen
                darkMode={darkMode}
                onToggleDarkMode={handleToggleDarkMode}
                onLogout={handleLogout}
                onResetData={handleResetData}
                user={user}
                onUpdateUser={handleUpdateUser}
                autoDeleteExpired={autoDeleteExpired}
                onToggleAutoDeleteExpired={handleToggleAutoDeleteExpired}
                onSyncNotifications={() => syncAllNotifications(schedules)}
              />
            </div>
          </div>
        ) : (
          <div className="w-full animate-fade-in">
            <KkorureukScreen 
              user={user}
              onUpdateUser={handleUpdateUser}
              darkMode={darkMode}
              activeTab={kkorureukTab}
            />
          </div>
        )}

      </main>

      {/* Global Bottom Navigation */}
      <BottomNavigationBar 
        currentTab={currentActiveTab} 
        onChangeTab={setCurrentActiveTab} 
        darkMode={darkMode} 
        serviceMode={serviceMode}
      />

    </div>
  );
}
