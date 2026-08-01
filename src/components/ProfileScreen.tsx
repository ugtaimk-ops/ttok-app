import React, { useState, useRef, useEffect } from "react";
import { UserProfile } from "../types";
import { Sparkles, Check, School, Award, User, Camera, Smile, X, Pencil, Trash2, Shuffle, Search, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { isNativeApp, openNativeSettings } from "../lib/capacitor";
import { robustFetch } from "../lib/api";

interface SchoolSearchItem {
  schoolName: string;
  schoolCode: string;
  officeCode: string;
  officeName: string;
  schoolKind: string;
  location: string;
}

const RANDOM_GOALS = [
  "매일 30분 이상 공부하기",
  "하루에 영어 단어 20개 외우기",
  "수학 오답노트 꾸준히 작성하기",
  "국어 독서 하루 20분 하기",
  "시험 전까지 모든 과목 복습 완료하기",
  "수행평가 미루지 않고 제출하기",
  "수업 시간 집중하기",
  "모르는 문제 끝까지 해결하기",
  "하루 공부 계획 세우기",
  "하루 공부 계획 모두 실천하기",
  "학교 숙제 당일 완료하기",
  "스마트폰 사용 시간 줄이기",
  "하루 1개 이상 개념 완벽히 이해하기",
  "영어 지문 하루 1개 읽기",
  "하루 문제집 2페이지 이상 풀기",
  "일주일에 오답노트 3회 작성하기",
  "수업 예습 또는 복습 매일 하기",
  "시험 범위 미리미리 공부하기",
  "포기하지 않고 끝까지 공부하기",
  "집중해서 공부하는 습관 기르기",
  "매일 목표 공부 시간 채우기",
  "부족한 과목 집중 보완하기",
  "필기 정리 깔끔하게 하기",
  "암기 과목 매일 복습하기",
  "오늘 배운 내용 당일 복습하기",
  "일주일 동안 지각 없이 등교하기",
  "독서 한 권 완독하기",
  "공부 시작 시간을 일정하게 유지하기",
  "쉬는 시간과 공부 시간을 규칙적으로 지키기",
  "이번 학기 목표 성적 달성하기"
];

interface ProfileScreenProps {
  user: UserProfile;
  onUpdateUser: (updated: UserProfile) => void;
  darkMode: boolean;
}

export default function ProfileScreen({ user, onUpdateUser, darkMode }: ProfileScreenProps) {
  const [name, setName] = useState(user.name);
  const [school, setSchool] = useState(user.school);
  const [schoolCode, setSchoolCode] = useState(user.schoolCode || "");
  const [officeCode, setOfficeCode] = useState(user.officeCode || "");
  const [officeName, setOfficeName] = useState(user.officeName || "");
  const [schoolKind, setSchoolKind] = useState(user.schoolKind || "");
  const [grade, setGrade] = useState(user.grade);
  const [classNum, setClassNum] = useState(user.classNum);
  const [goal, setGoal] = useState(user.goal);
  const [avatar, setAvatar] = useState(user.avatarUrl);
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Grade options depend on school level: elementary goes to 6th grade, middle/high to 3rd
  const maxGrade = schoolKind.includes("초등학교") ? 6 : 3;

  // School search
  const [isSchoolSearchOpen, setIsSchoolSearchOpen] = useState(false);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState("");
  const [schoolSearchResults, setSchoolSearchResults] = useState<SchoolSearchItem[]>([]);
  const [isSearchingSchools, setIsSearchingSchools] = useState(false);
  const [schoolSearchError, setSchoolSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSchoolSearchOpen) return;
    if (schoolSearchQuery.trim().length < 2) {
      setSchoolSearchResults([]);
      setSchoolSearchError(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingSchools(true);
      setSchoolSearchError(null);
      try {
        const res = await robustFetch(`/api/school/search?keyword=${encodeURIComponent(schoolSearchQuery)}`);
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            throw new Error("정상적인 JSON 응답이 아닙니다.");
          }
          setSchoolSearchResults(await res.json());
        } else {
          setSchoolSearchError("학교 정보를 불러올 수 없습니다.");
        }
      } catch (err) {
        console.error("Failed to search schools:", err);
        setSchoolSearchError("학교 정보를 불러올 수 없습니다.");
      } finally {
        setIsSearchingSchools(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [schoolSearchQuery, isSchoolSearchOpen]);

  const handleSelectSchool = (item: SchoolSearchItem) => {
    setSchool(item.schoolName);
    setSchoolCode(item.schoolCode);
    setOfficeCode(item.officeCode);
    setOfficeName(item.officeName);
    setSchoolKind(item.schoolKind);

    const newMaxGrade = item.schoolKind.includes("초등학교") ? 6 : 3;
    setGrade(prev => {
      const n = parseInt(prev, 10);
      return prev && n >= 1 && n <= newMaxGrade ? prev : "1";
    });

    setIsSchoolSearchOpen(false);
    setSchoolSearchQuery("");
    setSchoolSearchResults([]);
  };

  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [directGoalInput, setDirectGoalInput] = useState(user.goal || "");

  useEffect(() => {
    setDirectGoalInput(goal);
  }, [goal]);

  const [activeAvatarTab, setActiveAvatarTab] = useState<"camera" | "emoji">(() => {
    if (user?.avatarUrl && (user.avatarUrl.startsWith("http") || user.avatarUrl.startsWith("data:"))) {
      return "camera";
    }
    return "emoji";
  });
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [emojiInput, setEmojiInput] = useState(() => {
    if (user?.avatarUrl && !user.avatarUrl.startsWith("http") && !user.avatarUrl.startsWith("data:")) {
      return user.avatarUrl;
    }
    return "🐰";
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("카메라 장치가 감지되지 않거나, 모바일 인앱 브라우저/보안 환경 제한으로 인해 접근이 불가합니다. 모바일 기본 브라우저(Chrome/삼성 인터넷)로 접속하시거나 우측 상단 '새 창에서 열기' 버튼을 클릭해 주세요!");
      setIsCameraActive(false);
      return;
    }

    // 1. Pre-check standard web permissions API if available
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const camQuery = await navigator.permissions.query({ name: "camera" as any });
        if (camQuery.state === "denied") {
          console.warn("Camera permission is explicitly denied.");
          setCameraError("카메라 접근 권한이 차단되었습니다. 휴대폰 설정에서 카메라 권한을 '허용'으로 변경한 후 다시 시도해 주세요.");
          setIsCameraActive(false);
          return;
        }
      }
    } catch (e) {
      console.warn("Permissions query failed in ProfileScreen startCamera:", e);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 320, height: 320, facingMode: "user" },
        audio: false 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      
      let errMsg = "카메라에 접근할 수 없습니다. 권한 설정을 확인해 주세요.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errMsg = "카메라 접근 권한이 차단되었습니다. 브라우저 설정 또는 휴대폰 설정에서 카메라 권한을 '허용'으로 변경한 후 다시 시도해 주세요.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        errMsg = "카메라가 다른 앱에서 이미 사용 중입니다. 백그라운드 앱을 종료해 주세요.";
      }
      
      setCameraError(`${errMsg}\n\n💡 모바일 앱/인앱 웹뷰 환경인 경우, 화면 우측 상단의 "새 창에서 열기"를 클릭해 모바일 정식 브라우저(Chrome 등)에서 여시면 즉시 해결됩니다!`);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Mirror horizontally so the final captured image matches the mirrored video preview
        ctx.translate(320, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, 320, 320);
        const dataUrl = canvas.toDataURL("image/jpeg");
        setAvatar(dataUrl);
        stopCamera();
      }
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const avatarOptions = [
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=256",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=256",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=256",
    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=256"
  ];

  const buildProfileUpdate = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    ...user,
    name,
    school,
    schoolCode,
    officeCode,
    officeName,
    schoolKind,
    grade,
    classNum,
    goal,
    avatarUrl: avatar,
    ...overrides
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateUser(buildProfileUpdate());
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };

  const setRandomGoal = () => {
    const possibleGoals = RANDOM_GOALS.filter(g => g !== goal);
    const listToUse = possibleGoals.length > 0 ? possibleGoals : RANDOM_GOALS;
    const randomIndex = Math.floor(Math.random() * listToUse.length);
    const newGoal = listToUse[randomIndex];

    setGoal(newGoal);
    onUpdateUser(buildProfileUpdate({ goal: newGoal }));

    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };

  const saveDirectGoal = () => {
    const trimmed = directGoalInput.trim();
    setGoal(trimmed);
    setIsEditingGoal(false);
    onUpdateUser(buildProfileUpdate({ goal: trimmed }));

    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };

  const deleteGoal = () => {
    setGoal("");
    setDirectGoalInput("");
    setIsEditingGoal(false);
    onUpdateUser(buildProfileUpdate({ goal: "" }));

    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-safe-layout">
      
      {/* Header */}
      <div>
        <h1 className="text-fluid-3xl font-extrabold tracking-tight-sf">학생 프로필 관리</h1>
      </div>

      <form onSubmit={handleSubmit} className={`p-6 sm:p-8 rounded-[32px] border ${
        darkMode ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-100"
      } shadow-sm space-y-6`}>
        
        {/* New Profile Pic / Customizer Section */}
        <div className="flex flex-col md:flex-row items-center gap-8 pb-6 border-b border-slate-100 dark:border-slate-800">
          {/* Left Column: Big Avatar Preview / Live Camera Stream */}
          <div className="relative flex flex-col items-center">
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full overflow-hidden ring-4 ring-brand/20 shadow-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center bg-gradient-to-tr from-slate-100 to-slate-50 dark:from-slate-850 dark:to-slate-900">
              {isCameraActive ? (
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline 
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              ) : avatar && !avatar.startsWith("http") && !avatar.startsWith("data:") ? (
                <span className="text-8xl select-none animate-fade-in" role="img" aria-label="profile emoji">
                  {avatar}
                </span>
              ) : (
                <img 
                  src={avatar} 
                  alt="User avatar" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
          </div>

          {/* Right Column: Customizer Tabs & Options */}
          <div className="flex-1 w-full space-y-4">
            {/* Tab buttons */}
            <div className="flex bg-slate-50 dark:bg-slate-900 p-1 rounded-2xl border border-slate-100/50 dark:border-slate-800/50">
              <button
                type="button"
                onClick={() => {
                  setActiveAvatarTab("camera");
                  startCamera();
                }}
                className={`flex-1 py-3 text-fluid-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  activeAvatarTab === "camera"
                    ? "bg-white dark:bg-slate-800 text-brand shadow-sm"
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
              >
                <Camera size={14} /> 사진 촬영
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setActiveAvatarTab("emoji");
                  setAvatar(emojiInput || "🐰");
                }}
                className={`flex-1 py-3 text-fluid-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  activeAvatarTab === "emoji"
                    ? "bg-white dark:bg-slate-800 text-brand shadow-sm"
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
              >
                <Smile size={14} /> 이모티콘 입력
              </button>
            </div>

            {/* Tab Contents */}
            <div className="min-h-[100px] flex items-center justify-center p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100/30 dark:border-slate-850">
              
              {activeAvatarTab === "camera" && (
                <div className="flex flex-col items-center gap-3 w-full py-1 text-center">
                  {cameraError ? (
                    <div className="text-rose-500 text-fluid-sm font-medium space-y-3">
                      <p className="whitespace-pre-line">{cameraError}</p>
                      
                      <div className="flex flex-col sm:flex-row gap-2 justify-center items-center pt-1">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-fluid-xs font-bold cursor-pointer transition-all hover:opacity-90"
                        >
                          다시 시도
                        </button>
                        
                        {isNativeApp() && (
                          <button
                            type="button"
                            onClick={async () => {
                              await openNativeSettings();
                            }}
                            className="px-4 py-2 bg-brand text-white rounded-xl text-fluid-xs font-bold cursor-pointer transition-all hover:bg-brand-dark"
                          >
                            📱 안드로이드 앱 설정 열기
                          </button>
                        )}
                      </div>
                    </div>
                  ) : isCameraActive ? (
                    <div className="flex flex-col items-center gap-3 w-full py-2">
                      <div className="space-y-1 text-center">
                        <p className="text-fluid-sm font-bold text-brand animate-pulse">카메라 활성화 중...</p>
                        <p className="text-fluid-xs text-slate-450 break-keep">얼굴을 잘 맞추고 아래 촬영 버튼을 눌러주세요!</p>
                      </div>
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="px-6 py-3 bg-brand hover:bg-brand-dark text-white text-fluid-base font-extrabold rounded-2xl flex items-center justify-center gap-1.5 shadow-md shadow-brand/15 transition-all hover:scale-105 active:scale-95 cursor-pointer w-full max-w-[150px]"
                      >
                        <Camera size={15} /> 촬영
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-5 py-3 bg-brand/10 hover:bg-brand/20 text-brand text-fluid-sm font-bold rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Camera size={14} /> 카메라 켜기
                    </button>
                  )}
                </div>
              )}

              {activeAvatarTab === "emoji" && (
                <div className="w-full py-1">
                  <div className="relative">
                    <input
                      type="text"
                      value={emojiInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEmojiInput(val);
                        setAvatar(val || "👤");
                      }}
                      placeholder="터치하여 키보드 이모지를 입력해 주세요 (예: 🐰🦁)"
                      className="w-full px-4 py-3 bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl text-fluid-base font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-fluid-sm font-bold text-slate-550 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <User size={14} /> 학생 본명
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-fluid-base font-bold focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="relative">
            <label className="block text-fluid-sm font-bold text-slate-550 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <School size={14} /> 소속 학교명
            </label>
            {isSchoolSearchOpen ? (
              <>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={schoolSearchQuery}
                    onChange={(e) => setSchoolSearchQuery(e.target.value)}
                    placeholder="학교 이름을 검색해 주세요 (예: 서울고)"
                    className="w-full pl-4 pr-10 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-fluid-base font-bold focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsSchoolSearchOpen(false);
                      setSchoolSearchQuery("");
                      setSchoolSearchResults([]);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                {(isSearchingSchools || schoolSearchError || schoolSearchQuery.trim().length >= 2) && (
                  <div className="absolute z-20 mt-2 w-full max-h-64 overflow-y-auto rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
                    {isSearchingSchools ? (
                      <div className="p-4 flex items-center justify-center gap-2 text-fluid-sm text-slate-400">
                        <Loader2 size={14} className="animate-spin" /> 검색 중...
                      </div>
                    ) : schoolSearchError ? (
                      <div className="p-4 text-center text-fluid-sm text-rose-500">{schoolSearchError}</div>
                    ) : schoolSearchResults.length === 0 ? (
                      <div className="p-4 text-center text-fluid-sm text-slate-400">검색 결과가 없습니다.</div>
                    ) : (
                      schoolSearchResults.map((item) => (
                        <button
                          key={item.schoolCode}
                          type="button"
                          onClick={() => handleSelectSchool(item)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b last:border-b-0 border-slate-50 dark:border-slate-800/60 cursor-pointer"
                        >
                          <p className="text-fluid-sm font-bold text-slate-800 dark:text-slate-100">{item.schoolName}</p>
                          <p className="text-fluid-xs text-slate-400">{item.schoolKind} · {item.location}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsSchoolSearchOpen(true)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-fluid-base font-bold text-left focus:outline-none focus:ring-2 focus:ring-brand flex items-center justify-between cursor-pointer"
              >
                <span className={school ? "text-slate-800 dark:text-slate-100" : "text-slate-400 font-normal"}>
                  {school || "학교를 검색해 주세요"}
                </span>
                <Search size={16} className="text-slate-400 shrink-0" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-fluid-sm font-bold text-slate-550 dark:text-slate-400 mb-1.5">학년</label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-fluid-base font-bold focus:outline-none focus:ring-2 focus:ring-brand text-slate-700 dark:text-slate-300"
            >
              {Array.from({ length: maxGrade }, (_, i) => i + 1).map((g) => (
                <option key={g} value={String(g)}>{g}학년</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-fluid-sm font-bold text-slate-550 dark:text-slate-400 mb-1.5">소속 반 (학급)</label>
            <input
              type="number"
              min="1"
              required
              value={classNum}
              onChange={(e) => setClassNum(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-fluid-base font-bold focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-fluid-sm font-bold text-slate-550 dark:text-slate-400 mb-1 flex items-center gap-1">
            <Award size={14} /> 이번 학기 학습 목표
          </label>
          
          <div className="border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 rounded-2xl space-y-4">
            {isEditingGoal ? (
              <div className="space-y-3 animate-fade-in">
                <div className="relative">
                  <input
                    type="text"
                    value={directGoalInput}
                    onChange={(e) => setDirectGoalInput(e.target.value)}
                    placeholder="원하는 학습목표를 자유롭게 직접 입력해 주세요 (예: 하루 1시간 독서하기)"
                    className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-fluid-base font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
                  />
                  {directGoalInput && (
                    <button
                      type="button"
                      onClick={() => setDirectGoalInput("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setDirectGoalInput(goal);
                      setIsEditingGoal(false);
                    }}
                    className="px-5 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 font-bold rounded-2xl text-fluid-sm transition-all cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={saveDirectGoal}
                    className="px-5 py-3 bg-brand text-white font-black rounded-2xl text-fluid-sm shadow-sm shadow-brand/10 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                  >
                    목표 저장
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {goal ? (
                  <div className="flex items-start gap-3 p-4 bg-white dark:bg-slate-950/45 border border-slate-100 dark:border-slate-850 rounded-2xl animate-fade-in">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                      <Award size={18} className="stroke-[2.5px]" />
                    </div>
                    <div className="space-y-0.5 pt-0.5">
                      <span className="text-[11px] text-slate-400 font-extrabold tracking-wider uppercase">현재 목표</span>
                      <p className="text-fluid-base font-black text-slate-800 dark:text-slate-100 leading-relaxed break-keep">
                        "{goal}" 🎯
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 bg-white dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl text-slate-400 dark:text-slate-500 text-fluid-sm font-bold animate-fade-in">
                    등록된 학습 목표가 없습니다. 이번 학기를 빛낼 목표를 세워보세요!
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={setRandomGoal}
                    className="flex-1 min-w-[120px] py-3.5 bg-brand-light hover:bg-brand/10 dark:bg-brand/10 dark:hover:bg-brand/20 text-brand text-fluid-sm font-black rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer hover:scale-[1.01]"
                  >
                    <Shuffle size={14} className="stroke-[2.5px]" />
                    <span>🎲 랜덤 설정</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      setDirectGoalInput(goal);
                      setIsEditingGoal(true);
                    }}
                    className="flex-1 min-w-[120px] py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-fluid-sm font-black rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer hover:scale-[1.01]"
                  >
                    <Pencil size={14} />
                    <span>✍️ 직접 {goal ? "수정" : "설정"}</span>
                  </button>

                  {goal && (
                    <button
                      type="button"
                      onClick={deleteGoal}
                      className="py-3.5 px-4 border border-rose-100 dark:border-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-500 dark:text-rose-400 text-fluid-sm font-black rounded-2xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      title="목표 삭제"
                    >
                      <Trash2 size={14} />
                      <span className="sm:inline hidden">삭제</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="submit"
            className="px-6 py-4 bg-brand hover:bg-brand-dark text-white font-black rounded-2xl text-fluid-base flex items-center gap-1.5 shadow-md shadow-brand/10 transition-colors cursor-pointer"
          >
            <Sparkles size={16} /> 똑 부러지게 프로필 수정 완료
          </button>
        </div>

      </form>

      {/* Save Notification Toast */}
      <AnimatePresence>
        {showSavedToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-fab-safe right-6 bg-brand text-white px-5 py-3 rounded-2xl flex items-center gap-2 shadow-lg text-xs font-bold z-50"
          >
            <Check size={16} />
            <span>수행평가 및 학습 프로필 갱신 완료!</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
