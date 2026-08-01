import React, { useState, useEffect, useRef } from "react";
import { UserProfile } from "../types";
import { getApiUrl, robustFetch, logFetchFailure } from "../lib/api";
import { 
  Search, 
  History, 
  Calendar, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Flame, 
  Sparkles,
  School,
  Utensils,
  Check,
  ExternalLink,
  Bell,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { syncAllNotifications } from "../services/notificationService";
import GlassSelect, { HOUR_OPTIONS, MINUTE_OPTIONS } from "./GlassSelect";

interface KkorureukScreenProps {
  user: UserProfile;
  onUpdateUser: (updatedUser: UserProfile) => void;
  darkMode: boolean;
  activeTab: string;
}

interface SchoolItem {
  schoolName: string;
  schoolCode: string;
  officeCode: string;
  officeName: string;
  schoolKind: string;
  location: string;
}

interface MealItem {
  mealType: string;     // 조식, 중식, 석식
  date: string;         // YYYYMMDD
  menu: string;         // 쌀밥<br/>미역국...
  calories: string;     // 650.5 kcal
  nutrition: string;    // 영양정보
  origin: string;       // 원산지 정보
}

export default function KkorureukScreen({ user, onUpdateUser, darkMode, activeTab }: KkorureukScreenProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(new Date());
  
  // Keep calendar view in sync when selectedDate changes
  useEffect(() => {
    setCalendarViewDate(new Date(selectedDate));
  }, [selectedDate]);

  // Meal Notification configuration states
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
  const [showNotificationSavedToast, setShowNotificationSavedToast] = useState<boolean>(false);

  const handleSaveMealAlarm = async (enabled: boolean, hour: string, minute: string) => {
    localStorage.setItem("ttok_meal_notif_enabled", String(enabled));
    localStorage.setItem("ttok_meal_notif_hour", hour);
    localStorage.setItem("ttok_meal_notif_minute", minute);
    
    setMealNotifEnabled(enabled);
    setMealNotifHour(hour);
    setMealNotifMinute(minute);

    try {
      await syncAllNotifications();
      setShowNotificationSavedToast(true);
      setTimeout(() => setShowNotificationSavedToast(false), 2000);
    } catch (err) {
      console.error("[KkorureukScreen] Failed to sync meal notifications:", err);
    }
  };

  const [meals, setMeals] = useState<MealItem[]>([]);
  const [isLoadingMeals, setIsLoadingMeals] = useState<boolean>(false);
  const [mealError, setMealError] = useState<string | null>(null);

  // Weekly Meals States
  const [weeklyMeals, setWeeklyMeals] = useState<MealItem[]>([]);
  const [isLoadingWeekly, setIsLoadingWeekly] = useState<boolean>(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState<number>(0); // 0 = current week, -1 = last week, 1 = next week

  // School Search & Storage States
  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SchoolItem[]>([]);
  const [isSearchingSchools, setIsSearchingSchools] = useState<boolean>(false);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  
  const [recentSchools, setRecentSchools] = useState<SchoolItem[]>([]);

  // Load persistent schools
  useEffect(() => {
    const recents = localStorage.getItem("recent_schools");
    if (recents) {
      try {
        setRecentSchools(JSON.parse(recents));
      } catch (e) {
        console.error("Failed to parse recent schools:", e);
      }
    }
  }, []);

  const currentSchool: SchoolItem | null = user.schoolCode ? {
    schoolName: user.school,
    schoolCode: user.schoolCode,
    officeCode: user.officeCode || "",
    officeName: user.officeName || "",
    schoolKind: user.schoolKind || "고등학교",
    location: ""
  } : null;

  // School search logic with API
  useEffect(() => {
    if (schoolSearchQuery.trim().length < 2) {
      setSearchResults([]);
      setSchoolError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingSchools(true);
      setSchoolError(null);
      try {
        console.log(`[Kkorureuk] Fetching school search via robustFetch: ${schoolSearchQuery}`);
        const res = await robustFetch(`/api/school/search?keyword=${encodeURIComponent(schoolSearchQuery)}`);
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            throw new Error("정상적인 JSON 응답이 아닙니다. (HTML 수신)");
          }
          const data = await res.json();
          setSearchResults(data);
        } else {
          console.error("[Kkorureuk] School search failed status:", res.status);
          setSchoolError("학교 정보를 불러올 수 없습니다.");
        }
      } catch (err) {
        console.error("[Kkorureuk] Failed to search schools:", err);
        setSchoolError("학교 정보를 불러올 수 없습니다.");
      } finally {
        setIsSearchingSchools(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [schoolSearchQuery]);

  // Fetch today/tomorrow meals
  const lastSchoolCodeRef = useRef<string | undefined>(user.schoolCode);

  // Master helper to load meal data with dual direct/proxy mechanism and robust logging (Req 1-10)
  const loadMeals = async (
    officeCode: string,
    schoolCode: string,
    schoolName: string,
    params: { date?: string; startDate?: string; endDate?: string }
  ): Promise<MealItem[]> => {
    // 8. Validate school code & office code
    if (!officeCode || !/^[A-Z0-9]{3}$/i.test(officeCode)) {
      console.warn(`[NEIS Debug] Invalid Office Code (ATPT_OFCDC_SC_CODE): ${officeCode}`);
    }
    if (!schoolCode || !/^\d{7}$/.test(schoolCode)) {
      console.warn(`[NEIS Debug] Invalid School Code (SD_SCHUL_CODE): ${schoolCode}`);
    }

    // 9. Validate Date Format (YYYYMMDD)
    if (params.date && !/^\d{8}$/.test(params.date)) {
      throw new Error(`[NEIS Debug] Invalid date format: ${params.date}. Must be YYYYMMDD.`);
    }
    if (params.startDate && !/^\d{8}$/.test(params.startDate)) {
      throw new Error(`[NEIS Debug] Invalid startDate format: ${params.startDate}. Must be YYYYMMDD.`);
    }
    if (params.endDate && !/^\d{8}$/.test(params.endDate)) {
      throw new Error(`[NEIS Debug] Invalid endDate format: ${params.endDate}. Must be YYYYMMDD.`);
    }

    // 1. Construct correct direct HTTPS NEIS API URL (Req 1, 4)
    let directUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=100&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}`;
    if (params.startDate && params.endDate) {
      directUrl += `&MLSV_FROM_YMD=${params.startDate}&MLSV_TO_YMD=${params.endDate}`;
    } else if (params.date) {
      directUrl += `&MLSV_YMD=${params.date}`;
    }

    console.log(`[NEIS Debug] [Attempt 1] Fetching directly from NEIS API...`);
    console.log(`[NEIS Debug] URL: ${directUrl}`);

    try {
      // 5. fetch() detailed error handling
      const response = await fetch(directUrl, { method: "GET" });
      
      // 6. Log response status
      console.log(`[NEIS Debug] Direct Response Status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        // 7. Distinguish Network vs API Error
        throw new Error(`[API Error] NEIS server returned HTTP status ${response.status}`);
      }

      // 10. Correct JSON parsing validation
      const contentType = response.headers.get("content-type") || "";
      console.log(`[NEIS Debug] Content-Type: ${contentType}`);
      
      const responseText = await response.text();
      console.log(`[NEIS Debug] Raw Response Body (first 300 chars):`, responseText.substring(0, 300));

      if (!contentType.includes("application/json") && !responseText.trim().startsWith("{")) {
        throw new Error(`[JSON Parse Error] Expected JSON, received ${contentType || "unknown text/html"}`);
      }

      const data = JSON.parse(responseText);

      // Check if NEIS returned a known result code
      if (data.RESULT) {
        if (data.RESULT.CODE === "INFO-200") {
          console.log(`[NEIS Debug] NEIS returned INFO-200 (No meal data for this date). Returning empty array.`);
          return [];
        }
        if (data.RESULT.CODE !== "INFO-000") {
          throw new Error(`[API Error] NEIS response error: ${data.RESULT.CODE} - ${data.RESULT.MESSAGE}`);
        }
      }

      // Map response to standard MealItem[]
      if (data.mealServiceDietInfo && data.mealServiceDietInfo[1] && data.mealServiceDietInfo[1].row) {
        const meals = data.mealServiceDietInfo[1].row.map((item: any) => ({
          mealType: item.MMEAL_SC_NM,
          date: item.MLSV_YMD,
          menu: item.DDISH_NM,
          calories: item.CAL_INFO,
          nutrition: item.NTR_INFO,
          origin: item.ORPLC_INFO,
          isSficSynced: true
        }));
        console.log(`[NEIS Debug] Successfully mapped ${meals.length} meals from direct NEIS response.`);
        return meals;
      }

      return [];
    } catch (directError: any) {
      // 7. Distinguish network/CORS errors and fallback to Express proxy server
      console.warn(`[NEIS Debug] Direct fetch failed or CORS issue encountered. Falling back to Express Proxy server...`);
      logFetchFailure(directUrl, directError);

      // Build Proxy URL
      let proxyPath = `/api/meal/info?officeCode=${officeCode}&schoolCode=${schoolCode}&schoolName=${encodeURIComponent(schoolName)}`;
      if (params.startDate && params.endDate) {
        proxyPath += `&startDate=${params.startDate}&endDate=${params.endDate}`;
      } else if (params.date) {
        proxyPath += `&date=${params.date}`;
      }
      
      console.log(`[NEIS Debug] [Attempt 2] Fetching via Express Proxy using robustFetch...`);
      console.log(`[NEIS Debug] Proxy Path: ${proxyPath}`);

      try {
        const proxyResponse = await robustFetch(proxyPath);
        console.log(`[NEIS Debug] Proxy Response Status: ${proxyResponse.status} ${proxyResponse.statusText}`);

        if (!proxyResponse.ok) {
          throw new Error(`[API Error] Proxy server returned HTTP status ${proxyResponse.status}`);
        }

        const proxyContentType = proxyResponse.headers.get("content-type") || "";
        const proxyText = await proxyResponse.text();
        console.log(`[NEIS Debug] Proxy Response Body (first 300 chars):`, proxyText.substring(0, 300));

        if (!proxyContentType.includes("application/json") && !proxyText.trim().startsWith("[")) {
          throw new Error(`[JSON Parse Error] Expected JSON array from proxy, but received non-JSON response.`);
        }

        const meals = JSON.parse(proxyText);
        console.log(`[NEIS Debug] Successfully parsed ${meals.length} meals from Express proxy response.`);
        return meals;
      } catch (proxyError: any) {
        console.error(`[NEIS Debug] Express Proxy fallback failed as well:`, proxyError);
        throw new Error(`급식 데이터를 불러오지 못했습니다. (직접 호출 및 프록시 모두 실패. 상세: ${proxyError.message || proxyError})`);
      }
    }
  };

  useEffect(() => {
    // Only clear previous meals if school has changed to prevent layout jumping on date change
    if (lastSchoolCodeRef.current !== user.schoolCode) {
      setMeals([]);
      lastSchoolCodeRef.current = user.schoolCode;
    }
    
    if (!user.schoolCode || !user.officeCode) {
      setMeals([]);
      return;
    }

    const fetchMealData = async () => {
      setIsLoadingMeals(true);
      setMealError(null);
      const formattedDateStr = formatDateToYYYYMMDD(selectedDate);
      
      try {
        const data = await loadMeals(
          user.officeCode || "",
          user.schoolCode || "",
          user.school || "학교",
          { date: formattedDateStr }
        );
        setMeals(data);
      } catch (err: any) {
        setMealError("급식 정보를 불러오지 못했습니다.");
        console.error("NEIS API daily meal lookup failure:", err);
      } finally {
        setIsLoadingMeals(false);
      }
    };

    fetchMealData();
  }, [user.schoolCode, user.officeCode, selectedDate, user.school]);

  // Fetch weekly meals
  useEffect(() => {
    // Clear previous school weekly meals immediately to prevent showing stale data
    setWeeklyMeals([]);
    
    if (!user.schoolCode || !user.officeCode) {
      return;
    }

    const fetchWeeklyData = async () => {
      setIsLoadingWeekly(true);
      setWeeklyError(null);

      // Get Monday and Friday of target week
      const targetBase = new Date();
      targetBase.setDate(targetBase.getDate() + (weekOffset * 7));
      
      const currentDay = targetBase.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(targetBase);
      monday.setDate(targetBase.getDate() + distanceToMonday);

      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);

      const startYMD = formatDateToYYYYMMDD(monday);
      const endYMD = formatDateToYYYYMMDD(friday);

      try {
        const data = await loadMeals(
          user.officeCode || "",
          user.schoolCode || "",
          user.school || "학교",
          { startDate: startYMD, endDate: endYMD }
        );
        setWeeklyMeals(data);
      } catch (err: any) {
        setWeeklyError("급식 정보를 불러오지 못했습니다.");
        console.error("NEIS API weekly meal lookup failure:", err);
      } finally {
        setIsLoadingWeekly(false);
      }
    };

    if (activeTab === "meal-weekly") {
      fetchWeeklyData();
    }
  }, [user.schoolCode, user.officeCode, weekOffset, activeTab, user.school]);

  // Utility to format Date to YYYYMMDD
  const formatDateToYYYYMMDD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  };

  // Select school handler
  const handleSelectSchool = (school: SchoolItem) => {
    onUpdateUser({
      ...user,
      school: school.schoolName,
      schoolCode: school.schoolCode,
      officeCode: school.officeCode,
      officeName: school.officeName,
      schoolKind: school.schoolKind
    });

    const updatedRecents = [school, ...recentSchools.filter(s => s.schoolCode !== school.schoolCode)].slice(0, 5);
    setRecentSchools(updatedRecents);
    localStorage.setItem("recent_schools", JSON.stringify(updatedRecents));
    setSchoolSearchQuery("");
  };

  // Strip the parenthetical allergen-code suffix NEIS embeds in dish names (e.g. "김치찌개(5.6.13.)")
  const cleanDishName = (dishName: string) => dishName.replace(/\s*\([^)]+\)/g, "").trim();

  // Date Nav Helpers
  const shiftDay = (days: number) => {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + days);
    setSelectedDate(next);
  };

  const getDayName = (date: Date) => {
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return days[date.getDay()];
  };

  const getDateDialItems = () => {
    const items = [];
    const baseDate = new Date(selectedDate);
    for (let i = -4; i <= 5; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      items.push(d);
    }
    return items;
  };

  const shiftMonth = (offset: number) => {
    const next = new Date(calendarViewDate);
    next.setMonth(calendarViewDate.getMonth() + offset);
    setCalendarViewDate(next);
  };

  const getCalendarGridDays = () => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    
    // First day of current month
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Total days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days: Date[] = [];
    
    // Previous month padding days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push(new Date(year, month - 1, prevMonthLastDay - i));
    }
    
    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }
    
    // Next month padding days to complete a static 42-day (6-row) grid
    const nextMonthDaysNeeded = 42 - days.length;
    for (let i = 1; i <= nextMonthDaysNeeded; i++) {
      days.push(new Date(year, month + 1, i));
    }
    
    return days;
  };

  const getWeekDays = () => {
    const targetBase = new Date();
    targetBase.setDate(targetBase.getDate() + (weekOffset * 7));
    
    const currentDay = targetBase.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(targetBase);
    monday.setDate(targetBase.getDate() + distanceToMonday);

    const days = [];
    for (let i = 0; i < 5; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day);
    }
    return days;
  };

  // ==========================================
  // VIEW RENDERERS
  // ==========================================

  // 1. TODAY'S MEAL VIEW
  const renderTodayMeals = () => {
    const formattedHeaderDate = selectedDate.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    return (
      <div className="space-y-6">
        {/* Upper Info Box - Simplified to school name only as requested */}
        <div className="px-1 py-1 select-none">
          <h2 className="text-2xl font-black tracking-tight-sf text-slate-800 dark:text-slate-100">
            {currentSchool ? currentSchool.schoolName : "학교 설정에서 학교를 등록해 주세요"}
          </h2>
        </div>

        {/* Apple Calendar-style Date Selector */}
        <div className={`p-6 rounded-[32px] border ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm space-y-4`}>
          {/* Calendar Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center gap-2">
              <Calendar className="text-brand stroke-[2.5px]" size={16} />
              <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">급식 달력</span>
            </div>
            
            <div className="flex items-center gap-1.5 select-none">
              <button 
                onClick={() => shiftMonth(-1)}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer border border-slate-100/50 dark:border-slate-800/80 active:scale-95"
                title="이전 달"
              >
                <ChevronLeft size={18} className="stroke-[2.5px]" />
              </button>
              <span className="text-fluid-sm font-black text-slate-800 dark:text-slate-100 px-2 min-w-[95px] text-center">
                {calendarViewDate.getFullYear()}년 {calendarViewDate.getMonth() + 1}월
              </span>
              <button 
                onClick={() => shiftMonth(1)}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer border border-slate-100/50 dark:border-slate-800/80 active:scale-95"
                title="다음 달"
              >
                <ChevronRight size={18} className="stroke-[2.5px]" />
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {["일", "월", "화", "수", "목", "금", "토"].map((day, idx) => {
              const isSunday = idx === 0;
              const isSaturday = idx === 6;
              return (
                <span 
                  key={idx} 
                  className={`text-[10px] font-black uppercase tracking-wider ${
                    isSunday 
                      ? "text-rose-500" 
                      : isSaturday 
                        ? "text-blue-500" 
                        : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {day}
                </span>
              );
            })}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
            {getCalendarGridDays().map((dateItem, idx) => {
              const isToday = formatDateToYYYYMMDD(dateItem) === formatDateToYYYYMMDD(new Date());
              const isSelected = formatDateToYYYYMMDD(dateItem) === formatDateToYYYYMMDD(selectedDate);
              const isCurrentMonth = dateItem.getMonth() === calendarViewDate.getMonth();
              const dayNum = dateItem.getDate();
              const isSunday = dateItem.getDay() === 0;
              const isSaturday = dateItem.getDay() === 6;

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(dateItem)}
                  className={`relative aspect-square flex flex-col items-center justify-center rounded-full text-xs font-bold transition-all select-none cursor-pointer focus:outline-none group ${
                    !isCurrentMonth 
                      ? "text-slate-300 dark:text-slate-700 font-medium opacity-40" 
                      : isSelected
                        ? (isToday
                            ? "text-amber-500 dark:text-amber-400 font-black"
                            : isSunday 
                              ? "text-rose-500 font-black" 
                              : isSaturday 
                                ? "text-blue-500 font-black" 
                                : "text-slate-800 dark:text-slate-100 font-black")
                        : isToday
                          ? "text-amber-500 dark:text-amber-400 font-black"
                          : isSunday
                            ? "text-rose-500 hover:bg-rose-500/5 dark:hover:bg-rose-500/10"
                            : isSaturday
                              ? "text-blue-500 hover:bg-blue-500/5 dark:hover:bg-blue-500/10"
                              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                  }`}
                >
                  {/* Liquid Backdrop Circle animated via Framer Motion layoutId */}
                  {isSelected && (
                    <div className="absolute inset-1 border-2 border-blue-500 dark:border-blue-400 rounded-full shadow-sm" />
                  )}

                  <span className="relative z-10">{dayNum}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Meal cards list */}
        {!currentSchool ? (
          <div className={`p-10 rounded-[32px] border text-center ${
            darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
          }`}>
            <School className="mx-auto text-brand mb-4" size={32} />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">등록된 학교 정보가 없습니다</h3>
            <p className="text-slate-400 text-xs mt-1 break-keep">상단의 "학교 설정" 탭으로 이동해 본인의 학교를 검색하고 등록해 보세요!</p>
          </div>
        ) : isLoadingMeals && meals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-xs font-semibold">NEIS 오픈 API 연동 급식 정보 수집 중...</p>
          </div>
        ) : mealError ? (
          <div className={`p-6 rounded-[32px] border ${
            darkMode ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-red-50 border-red-100 text-red-500"
          } text-center text-xs font-semibold`}>
            <AlertTriangle className="mx-auto mb-2 text-rose-500" size={24} />
            {mealError}
          </div>
        ) : meals.length === 0 ? (
          <div className={`p-10 rounded-[32px] border text-center ${
            darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
          }`}>
            <Info className="mx-auto text-slate-400 dark:text-slate-600 mb-3" size={24} />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">등록된 급식이 없습니다.</h3>
            <p className="text-slate-400 text-[11px] mt-1 break-keep">주말, 공휴일, 방학 기간 중이거나 급식 계획이 없는 일정입니다.</p>
          </div>
        ) : (
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 animate-fade-in relative transition-opacity duration-200 ${isLoadingMeals ? "opacity-30 pointer-events-none" : ""}`}>
            {isLoadingMeals && (
              <div className="absolute inset-0 flex items-center justify-center bg-transparent z-10 pointer-events-none">
                <div className="flex flex-col items-center bg-white/95 dark:bg-slate-900/95 p-4 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-800/60 space-y-2 pointer-events-auto">
                  <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] font-bold text-slate-500">급식 업데이트 중...</span>
                </div>
              </div>
            )}
            {meals.map((meal, idx) => {
              const rawDishes = meal.menu.split("<br/>");
              return (
                <div 
                  key={idx}
                  className={`rounded-[24px] sm:rounded-[32px] border p-4 sm:p-6 space-y-4 sm:space-y-6 transition-all text-left ${
                    darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
                  } shadow-sm`}
                >
                  <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-brand text-white text-[11px] font-extrabold rounded-full">
                        {meal.mealType}
                      </span>
                      <span className="text-xs font-bold text-slate-500">식단</span>
                    </div>
                    <span className="text-xs font-extrabold text-brand flex items-center gap-1">
                      <Flame size={14} />
                      {meal.calories}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {rawDishes.map((dish, dishIdx) => {
                      const name = cleanDishName(dish);
                      if (!name) return null;

                      return (
                        <div
                          key={dishIdx}
                          className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                            darkMode
                              ? "bg-slate-950/40 border-slate-800/30 text-slate-200"
                              : "bg-slate-50 border-slate-100/50 text-slate-700"
                          }`}
                        >
                          <span className="text-fluid-base font-bold">{name}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 space-y-3 text-xs">
                    {meal.nutrition && (
                      <div className="space-y-1">
                        <span className="font-bold text-slate-400 dark:text-slate-500 text-[9px] uppercase tracking-wider block">영양정보</span>
                        <div className="bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl text-[9px] text-slate-500 dark:text-slate-400 max-h-20 overflow-y-auto leading-relaxed animate-fade-in">
                          {meal.nutrition.replace(/<br\/>/g, " / ")}
                        </div>
                      </div>
                    )}
                    {meal.origin && (
                      <div className="space-y-1">
                        <span className="font-bold text-slate-400 dark:text-slate-500 text-[9px] uppercase tracking-wider block">원산지 정보</span>
                        <div className="bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl text-[9px] text-slate-500 dark:text-slate-400 max-h-20 overflow-y-auto leading-relaxed">
                          {meal.origin.replace(/<br\/>/g, " / ")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // 2. WEEKLY MEALS VIEW
  const renderWeeklyMeals = () => {
    // Current target week dates
    const days = getWeekDays();
    const mondayLabel = days[0].toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    const fridayLabel = days[4].toLocaleDateString("ko-KR", { month: "short", day: "numeric" });

    return (
      <div className="space-y-6">
        {/* Week navigation bar */}
        <div className={`p-6 rounded-[32px] border ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4`}>
          <div>
            <h2 className="text-fluid-xl font-black tracking-tight-sf">
              {mondayLabel} ~ {fridayLabel}
            </h2>
          </div>

          <div className="flex gap-2.5 select-none flex-wrap justify-center w-full sm:w-auto">
            <button
              onClick={() => setWeekOffset(prev => prev - 1)}
              className="h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 text-fluid-sm font-bold text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 flex-1 sm:flex-initial"
            >
              <ChevronLeft size={16} /> 이전 주
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="h-12 px-5 bg-brand/10 hover:bg-brand/20 text-brand text-fluid-sm font-black rounded-xl transition-all cursor-pointer flex items-center justify-center active:scale-98 flex-1 sm:flex-initial"
            >
              이번 주
            </button>
            <button
              onClick={() => setWeekOffset(prev => prev + 1)}
              className="h-12 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 text-fluid-sm font-bold text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 flex-1 sm:flex-initial"
            >
              다음 주 <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Weekly Content */}
        {!currentSchool ? (
          <div className={`p-10 rounded-[32px] border text-center ${
            darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
          }`}>
            <School className="mx-auto text-brand mb-4" size={32} />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">등록된 학교 정보가 없습니다</h3>
          </div>
        ) : isLoadingWeekly ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-xs font-semibold">전국 NEIS 서버에서 주간 급식 계획 수집 중...</p>
          </div>
        ) : weeklyError ? (
          <div className="p-6 text-center text-xs text-red-500 font-semibold">{weeklyError}</div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            {days.map((day, idx) => {
              const ymd = formatDateToYYYYMMDD(day);
              // Filter meals for this day
              const dayMeals = weeklyMeals.filter(m => m.date === ymd);
              const dayStr = day.toLocaleDateString("ko-KR", { day: "numeric" });
              const dayOfWeek = getDayName(day);

              return (
                <div 
                  key={ymd}
                  className={`p-5 rounded-[24px] border ${
                    darkMode ? "bg-slate-900 border-slate-800/60" : "bg-white border-slate-100"
                  } shadow-sm space-y-3`}
                >
                  <div className="flex items-center justify-between border-b pb-2.5 border-slate-100 dark:border-slate-800/60">
                    <span className="text-xs font-extrabold flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                      <span className="w-2 h-2 rounded-full bg-brand" />
                      {dayStr}일 ({dayOfWeek}요일)
                    </span>
                    {dayMeals.length > 0 && (
                      <span className="text-[10px] font-extrabold text-brand bg-brand-light dark:bg-brand/10 px-2 py-0.5 rounded-md">
                        {dayMeals[0].calories}
                      </span>
                    )}
                  </div>

                  {dayMeals.length === 0 ? (
                    <p className="text-[11px] text-slate-400 py-2">등록된 급식이 없습니다.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {dayMeals.map((m, mIdx) => {
                        const raw = m.menu.split("<br/>");
                        return (
                          <div key={mIdx} className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-900/60 p-3 rounded-2xl space-y-1.5">
                            <span className="text-[9px] font-black text-brand bg-brand/5 dark:bg-brand/15 px-1.5 py-0.5 rounded inline-block uppercase">
                              {m.mealType}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {raw.map((dish, dIdx) => {
                                const name = cleanDishName(dish);
                                if (!name) return null;
                                return (
                                  <span
                                    key={dIdx}
                                    className="text-[10px] px-2 py-1 rounded-xl font-bold border bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                                  >
                                    {name}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // 3. SCHOOL SETTINGS VIEW
  const renderSchoolSettings = () => {
    return (
      <div className="space-y-4 sm:space-y-6 animate-fade-in">
        {/* current registered school info card */}
        <div className={`p-4 sm:p-6 rounded-[20px] sm:rounded-[32px] border ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm relative overflow-hidden`}>
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-brand-light dark:bg-brand/10 border border-brand/5 rounded-2xl flex items-center justify-center shrink-0">
              <School className="text-brand" size={22} />
            </div>
            
            <div className="space-y-1 truncate text-left">
              <h2 className="text-sm sm:text-base font-extrabold truncate text-slate-800 dark:text-slate-100">
                {currentSchool ? currentSchool.schoolName : "학교가 등록되어 있지 않습니다"}
              </h2>
              {currentSchool && (
                <p className="text-[10px] sm:text-xs text-slate-400 font-bold">
                  {currentSchool.officeName} · {currentSchool.schoolKind}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Meal Alarm Settings Card */}
        <div className={`p-4 sm:p-6 rounded-[20px] sm:rounded-[32px] border ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm space-y-4`}>
          <div className="border-b border-slate-100/80 dark:border-slate-800/60 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="text-brand" size={16} />
              <h3 className="text-[11px] sm:text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">급식 알림 설정</h3>
            </div>
            {mealNotifEnabled ? (
              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-black rounded-lg">동작 중</span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-500/10 text-slate-500 text-[9px] font-black rounded-lg">알림 꺼짐</span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-left">
            <div className="space-y-1">
              <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">매일 맛있는 급식 메뉴 알림</span>
              <p className="text-[10px] sm:text-xs text-slate-400 font-semibold leading-relaxed">
                지정된 시간에 오늘의 급식 메뉴와 칼로리 정보를 스마트 알림으로 전송합니다.
              </p>
            </div>
            
            {/* Toggle Switch */}
            <button
              onClick={() => handleSaveMealAlarm(!mealNotifEnabled, mealNotifHour, mealNotifMinute)}
              className={`w-14 h-8 rounded-full p-1 transition-colors duration-250 cursor-pointer outline-none shrink-0 ${
                mealNotifEnabled ? "bg-brand" : "bg-slate-200 dark:bg-slate-800"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-250 ${
                  mealNotifEnabled ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {mealNotifEnabled && (
            <div className="pt-3 border-t border-slate-50 dark:border-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 text-fluid-xs text-slate-500 dark:text-slate-400 font-semibold">
                <Clock size={14} className="text-slate-400" />
                <span>알림 발송 예정 시간:</span>
              </div>
              
              <div className="flex items-center gap-2 justify-end w-full sm:w-auto">
                {/* Hour Select */}
                <div className="flex-1 sm:flex-initial min-w-[92px]">
                  <GlassSelect
                    value={mealNotifHour}
                    onChange={(v) => handleSaveMealAlarm(mealNotifEnabled, v, mealNotifMinute)}
                    options={HOUR_OPTIONS}
                    darkMode={darkMode}
                    triggerClassName="w-full flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950/85 border border-slate-200 dark:border-slate-800 h-12 px-4 rounded-xl text-fluid-sm font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                  />
                </div>

                {/* Minute Select */}
                <div className="flex-1 sm:flex-initial min-w-[92px]">
                  <GlassSelect
                    value={mealNotifMinute}
                    onChange={(v) => handleSaveMealAlarm(mealNotifEnabled, mealNotifHour, v)}
                    options={MINUTE_OPTIONS}
                    darkMode={darkMode}
                    triggerClassName="w-full flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950/85 border border-slate-200 dark:border-slate-800 h-12 px-4 rounded-xl text-fluid-sm font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Real school search section */}
        <div className={`p-4 sm:p-6 rounded-[20px] sm:rounded-[32px] border ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm space-y-4`}>
          <div className="border-b border-slate-100/80 dark:border-slate-800/60 pb-3">
            <h3 className="text-fluid-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider text-left">대한민국 전국 초·중·고교 검색</h3>
          </div>

          {/* Search bar input */}
          <div className="relative">
            <input
              type="text"
              placeholder="학교명 또는 지역명을 입력하세요 (예: 서울고, 부산)"
              value={schoolSearchQuery}
              onChange={(e) => setSchoolSearchQuery(e.target.value)}
              className="w-full h-14 pl-12 pr-4 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 rounded-2xl text-fluid-base focus:outline-none focus:ring-2 focus:ring-brand font-semibold text-slate-800 dark:text-slate-100"
            />
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Live dropdown results list */}
          <div className="space-y-3">
            {isSearchingSchools ? (
              <div className="flex items-center justify-center py-6 gap-2">
                <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-400 text-[11px] font-semibold">NEIS 네트워크 검색 중...</span>
              </div>
            ) : schoolError ? (
              <p className="text-center text-rose-500 text-xs py-6 font-semibold">{schoolError}</p>
            ) : schoolSearchQuery.trim().length >= 2 && searchResults.length === 0 ? (
              <p className="text-center text-slate-400 text-xs py-6 font-semibold">검색 결과가 없습니다.</p>
            ) : searchResults.length > 0 ? (
              <div className="space-y-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 block mb-1">검색된 실제 학교 목록 ({searchResults.length}개)</span>
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {searchResults.map((school) => (
                    <div
                      key={school.schoolCode}
                      onClick={() => handleSelectSchool(school)}
                      className="p-3 bg-slate-50 dark:bg-slate-950 hover:bg-brand/5 dark:hover:bg-brand/10 border border-slate-100 dark:border-slate-900 rounded-2xl flex items-center justify-between cursor-pointer transition-all group"
                    >
                      <div className="truncate pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-brand transition-colors">
                            {school.schoolName}
                          </span>
                          <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-[9px] font-bold rounded text-slate-500">
                            {school.schoolKind}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {school.officeName} · {school.location}
                        </span>
                      </div>
                      <div className="shrink-0 text-[10px] text-slate-400 font-bold bg-slate-150 dark:bg-slate-900 px-2 py-1 rounded-lg">
                        선택하기
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Recents persistence display */}
        <div className={`p-6 rounded-[32px] border ${
          darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
        } shadow-sm space-y-3`}>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1">
            <History size={12} /> 최근 검색 기록
          </span>

          {recentSchools.length === 0 ? (
            <p className="text-[11px] text-slate-400 py-4 text-center">최근에 검색한 학교 목록이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentSchools.map((school) => (
                <div
                  key={school.schoolCode}
                  onClick={() => handleSelectSchool(school)}
                  className="p-3 bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-100/50 dark:border-slate-800/60 rounded-2xl flex items-center justify-between cursor-pointer transition-all"
                >
                  <div className="truncate pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[180px]">
                        {school.schoolName}
                      </span>
                      <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-[9px] font-bold rounded text-slate-500">
                        {school.schoolKind}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-[9px] text-brand font-black">
                    선택
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render parent layout
  return (
    <div className="space-y-6 pb-safe-layout animate-fade-in relative">
      {activeTab === "meal-today" && renderTodayMeals()}
      {activeTab === "meal-weekly" && renderWeeklyMeals()}
      {activeTab === "meal-school" && renderSchoolSettings()}

      {/* Synchronized saved status Toast feedback */}
      <AnimatePresence>
        {showNotificationSavedToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className="fixed bottom-fab-safe left-1/2 -translate-x-1/2 z-50 bg-brand text-white text-[11px] sm:text-xs font-black px-5 py-3 rounded-full shadow-lg flex items-center gap-2 whitespace-nowrap"
          >
            <Check size={14} className="stroke-[3px]" />
            <span>급식 알림 설정이 안전하게 동기화되었습니다!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
