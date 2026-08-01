import React, { useState } from "react";
import { Sparkles, Loader2, AlertCircle, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { authService } from "../services/authService";
import { UserProfile } from "../types";

interface LoginScreenProps {
  onLogin: (userProfile: UserProfile) => void;
  darkMode: boolean;
}

function friendlyAuthError(err: any): string {
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
  } else if (err.code === "auth/invalid-email") {
    message = "올바른 이메일 형식이 아닙니다.";
  } else if (err.code === "auth/email-already-in-use") {
    message = "이미 가입된 이메일입니다. 로그인을 시도해 주세요.";
  } else if (err.code === "auth/weak-password") {
    message = "비밀번호는 6자 이상이어야 합니다.";
  } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
    message = "이메일 또는 비밀번호가 올바르지 않습니다.";
  } else if (err.code === "auth/user-not-found") {
    message = "가입되지 않은 이메일입니다. 회원가입을 먼저 진행해 주세요.";
  } else if (err.code === "auth/too-many-requests") {
    message = "너무 많은 시도가 감지되었습니다. 잠시 후 다시 시도해 주세요.";
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
  return message;
}

export default function LoginScreen({ onLogin, darkMode }: LoginScreenProps) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<"google" | "apple" | "email" | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSignIn = async (provider: "google" | "apple") => {
    setIsLoading(true);
    setError(null);
    setInfoMessage(null);
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
      setError(friendlyAuthError(err));
    } finally {
      setIsLoading(false);
      setSelectedProvider(null);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 모두 입력해 주세요.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setInfoMessage(null);
    setSelectedProvider("email");

    try {
      const user = await authService.signInOrSignUpWithEmail(email.trim(), password);
      const userProfile = await authService.handleUserSession(user);
      onLogin(userProfile);
    } catch (err: any) {
      console.error("Email auth error:", err);
      setError(friendlyAuthError(err));
    } finally {
      setIsLoading(false);
      setSelectedProvider(null);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setError("비밀번호를 재설정할 이메일을 먼저 입력해 주세요.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      await authService.resetPassword(email.trim());
      setInfoMessage("비밀번호 재설정 메일을 보냈습니다. 받은편지함을 확인해 주세요.");
    } catch (err: any) {
      console.error("Password reset error:", err);
      setError(friendlyAuthError(err));
    } finally {
      setIsLoading(false);
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

          {/* Info Message Section (e.g. password reset confirmation) */}
          <AnimatePresence mode="wait">
            {infoMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full text-left p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-fluid-sm font-semibold flex items-start gap-2.5"
              >
                <Mail className="w-5 h-5 mt-0.5 shrink-0" />
                <span className="break-keep leading-relaxed">{infoMessage}</span>
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
                {/* Official Google "G" logo */}
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24 c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36 c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571 c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
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

          {/* Divider */}
          <div className="w-full flex items-center gap-3 py-1">
            <div className={`flex-1 h-px ${darkMode ? "bg-slate-800" : "bg-slate-200"}`} />
            <span className={`text-fluid-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-600" : "text-slate-400"}`}>
              또는
            </span>
            <div className={`flex-1 h-px ${darkMode ? "bg-slate-800" : "bg-slate-200"}`} />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailSubmit} className="w-full space-y-3">
            <div className="relative">
              <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${darkMode ? "text-slate-500" : "text-slate-400"}`} />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일"
                disabled={isLoading}
                className={`w-full py-3.5 pl-11 pr-4 rounded-2xl text-fluid-sm font-semibold outline-none transition-colors ${
                  darkMode
                    ? "bg-slate-950 border border-slate-800 text-slate-100 placeholder:text-slate-600 focus:border-blue-500/50"
                    : "bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-brand/50"
                }`}
              />
            </div>
            <div className="relative">
              <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${darkMode ? "text-slate-500" : "text-slate-400"}`} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 (6자 이상)"
                disabled={isLoading}
                className={`w-full py-3.5 pl-11 pr-11 rounded-2xl text-fluid-sm font-semibold outline-none transition-colors ${
                  darkMode
                    ? "bg-slate-950 border border-slate-800 text-slate-100 placeholder:text-slate-600 focus:border-blue-500/50"
                    : "bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-brand/50"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className={`absolute right-4 top-1/2 -translate-y-1/2 ${darkMode ? "text-slate-500" : "text-slate-400"}`}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isLoading}
                className={`text-fluid-xs font-bold ${darkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"}`}
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-4 rounded-2xl font-black text-fluid-base flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                isLoading ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.01] active:scale-[0.99]"
              } bg-brand text-white shadow-md shadow-brand/20 dark:bg-blue-500`}
            >
              {isLoading && selectedProvider === "email" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span>이메일로 계속하기</span>
              )}
            </button>
            <p className={`text-fluid-xs text-center ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
              처음이면 자동으로 회원가입, 이미 계정이 있으면 로그인됩니다
            </p>
          </form>
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
