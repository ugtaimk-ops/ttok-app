import React, { useState } from "react";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { authService } from "../services/authService";
import { UserProfile } from "../types";

interface LoginScreenProps {
  onLogin: (userProfile: UserProfile) => void;
  darkMode: boolean;
}

export default function LoginScreen({ onLogin, darkMode }: LoginScreenProps) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<"google" | "apple" | null>(null);

  const handleSignIn = async (provider: "google" | "apple") => {
    setIsLoading(true);
    setError(null);
    setSelectedProvider(provider);

    try {
      let user;
      if (provider === "google") {
        user = await authService.signInWithGoogle();
      } else {
        user = await authService.signInWithApple();
      }

      // Handle user session setup and get merged profile
      const userProfile = await authService.handleUserSession(user);
      onLogin(userProfile);
    } catch (err: any) {
      console.error(`${provider} sign in error:`, err);
      
      // Handle known Firebase auth errors with user-friendly messages
      let message = "로그인 중 에러가 발생했습니다. 다시 시도해 주세요.";
      if (err.code === "auth/popup-closed-by-user") {
        message = "로그인 창이 닫혔습니다. 본인 인증을 완료하려면 다시 로그인해 주세요.";
      } else if (err.code === "auth/cancelled-popup-request") {
        message = "이전 로그인 요청이 취소되었습니다. 다시 시도해 주세요.";
      } else if (err.code === "auth/network-request-failed") {
        message = "네트워크 연결이 불안정합니다. 인터넷 연결 상태를 확인 후 다시 시도해 주세요.";
      } else if (err.code === "auth/popup-blocked") {
        message = "브라우저 팝업이 차단되었습니다. 팝업 차단을 해제한 뒤 다시 로그인해 주세요.";
      } else if (err.code === "auth/user-disabled") {
        message = "비활성화된 계정입니다. 관리자에게 문의해 주세요.";
      } else if (err.message && err.message.includes("quota")) {
        message = "Firestore 일일 읽기/쓰기 한도가 초과되었습니다. 내일 다시 이용 가능합니다.";
      } else if (err.message) {
        // If it was a stringified handleFirestoreError JSON, parse or display friendly
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.error) {
            message = `데이터베이스 동기화 중 오류가 발생했습니다 (${parsed.operationType}).`;
          }
        } catch {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setIsLoading(false);
      setSelectedProvider(null);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-center items-center px-4 py-12 transition-colors duration-300 ${
      darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-800"
    }`}>
      {/* Centered Login Card - Modern Material Design 3 Inspired */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full max-w-[420px] p-8 sm:p-10 rounded-[32px] border ${
          darkMode 
            ? "bg-slate-900/90 border-slate-800/80 shadow-2xl shadow-black/40" 
            : "bg-white border-slate-200/60 shadow-xl shadow-slate-100/70"
        } relative overflow-hidden`}
      >
        {/* Glow effect on hover/focus */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-brand to-transparent opacity-80" />

        <div className="flex flex-col items-center text-center space-y-6">
          {/* Brand Logo inside modern rounded container (M3 container shape) */}
          <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center transition-transform hover:rotate-6 duration-300 ${
            darkMode 
              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" 
              : "bg-brand/10 text-brand border border-brand/20"
          }`}>
            <Sparkles size={32} className="animate-pulse" />
          </div>

          {/* App Title and Subtitle */}
          <div className="space-y-3">
            <h1 className="text-fluid-3xl font-black tracking-tight font-display">
              똑 <span className="text-brand dark:text-blue-400">|</span> 꼬르륵
            </h1>
            <p className={`text-fluid-xs font-black uppercase tracking-widest ${
              darkMode ? "text-slate-400" : "text-slate-500"
            }`}>
              스마트 스쿨메이트
            </p>
            <p className={`text-fluid-sm leading-relaxed break-keep ${
              darkMode ? "text-slate-450" : "text-slate-500"
            }`}>
              수행평가 일정 관리와 급식 정보 조회를 한 번에 해결하는 1등급 학업 플랫폼
            </p>
          </div>

          {/* Error Message Section */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full text-left p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-fluid-sm font-semibold flex items-start gap-2.5"
              >
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <span className="break-keep leading-relaxed">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Federated Sign In Buttons */}
          <div className="w-full space-y-3.5 pt-2">
            {/* Google Login Button */}
            <button
              onClick={() => handleSignIn("google")}
              disabled={isLoading}
              className={`w-full py-4.5 px-6 rounded-2xl font-black text-fluid-base flex items-center justify-between transition-all duration-200 cursor-pointer ${
                isLoading 
                  ? "opacity-50 cursor-not-allowed" 
                  : "hover:scale-[1.01] active:scale-[0.99]"
              } ${
                darkMode 
                  ? "bg-slate-950 border border-slate-800 text-slate-100 hover:bg-slate-900" 
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:shadow-md hover:shadow-slate-100"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Google SVG Icon */}
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.245-3.125C18.232 1.56 15.45 1 12.24 1 6.059 1 1 6.059 1 12.24s5.059 11.24 11.24 11.24c6.458 0 10.766-4.537 10.766-10.95 0-.738-.078-1.3-.176-1.805H12.24z"
                  />
                </svg>
                <span className="font-black">Google 로그인</span>
              </div>
              {isLoading && selectedProvider === "google" ? (
                <Loader2 className="w-5 h-5 animate-spin text-brand dark:text-blue-400" />
              ) : (
                <span className="text-fluid-xs uppercase font-black text-slate-400 dark:text-slate-500">Google</span>
              )}
            </button>

            {/* Apple Login Button */}
            <button
              onClick={() => handleSignIn("apple")}
              disabled={isLoading}
              className={`w-full py-4.5 px-6 rounded-2xl font-black text-fluid-base flex items-center justify-between transition-all duration-200 cursor-pointer ${
                isLoading 
                  ? "opacity-50 cursor-not-allowed" 
                  : "hover:scale-[1.01] active:scale-[0.99]"
              } ${
                darkMode 
                  ? "bg-slate-100 text-slate-950 hover:bg-white" 
                  : "bg-slate-950 text-white hover:bg-slate-900 shadow-md shadow-slate-950/10"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Apple SVG Icon */}
                <svg className="w-5 h-5 shrink-0 fill-current" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.82 1.45-.6.7-1.13 1.84-1.01 2.95 1.07.08 2.18-.53 2.84-1.34z" />
                </svg>
                <span className="font-black">Apple 로그인</span>
              </div>
              {isLoading && selectedProvider === "apple" ? (
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              ) : (
                <span className="text-fluid-xs uppercase font-black text-slate-400">Apple</span>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Modern footer with material text */}
      <p className={`text-fluid-xs text-center font-medium tracking-tight mt-8 max-w-sm leading-relaxed ${
        darkMode ? "text-slate-500" : "text-slate-400"
      }`}>
        똑꼬르륵은 NEIS 교육망 API 연동 학업 정보 대시보드입니다.<br />
        로그인 시 이용약관 및 개인정보 처리방침에 동의한 것으로 간주됩니다.
      </p>
    </div>
  );
}
