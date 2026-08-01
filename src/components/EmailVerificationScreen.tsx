import { useState } from "react";
import { Mail, Loader2, CheckCircle2, LogOut } from "lucide-react";
import { motion } from "motion/react";
import { authService } from "../services/authService";

interface EmailVerificationScreenProps {
  email: string | null | undefined;
  darkMode: boolean;
  onVerified: () => void;
  onLogout: () => void;
}

export default function EmailVerificationScreen({ email, darkMode, onVerified, onLogout }: EmailVerificationScreenProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const handleCheck = async () => {
    setIsChecking(true);
    setCheckError(null);
    try {
      const verified = await authService.refreshEmailVerified();
      if (verified) {
        onVerified();
      } else {
        setCheckError("아직 인증이 확인되지 않았습니다. 메일함을 확인해 주세요.");
      }
    } catch (e) {
      setCheckError("확인 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setResendMessage(null);
    try {
      await authService.resendVerificationEmail();
      setResendMessage("인증 메일을 다시 보냈습니다.");
    } catch (e) {
      setResendMessage("메일 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-center items-center px-4 py-12 transition-colors duration-300 ${
      darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-800"
    }`}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full max-w-[420px] p-8 sm:p-10 rounded-[32px] border text-center ${
          darkMode
            ? "bg-slate-900/90 border-slate-800/80 shadow-2xl shadow-black/40"
            : "bg-white border-slate-200/60 shadow-xl shadow-slate-100/70"
        }`}
      >
        <div className={`w-16 h-16 mx-auto rounded-[24px] flex items-center justify-center ${
          darkMode ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-brand/10 text-brand border border-brand/20"
        }`}>
          <Mail size={32} />
        </div>

        <h1 className="text-fluid-xl font-black tracking-tight mt-6">이메일 인증이 필요해요</h1>
        <p className={`text-fluid-sm leading-relaxed break-keep mt-3 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
          <strong className={darkMode ? "text-slate-200" : "text-slate-700"}>{email}</strong> 주소로 인증 메일을 보냈어요.
          메일함(스팸함 포함)에서 링크를 눌러 인증을 완료해 주세요.
        </p>

        {checkError && (
          <p className="text-fluid-xs font-semibold text-rose-500 mt-4 break-keep">{checkError}</p>
        )}
        {resendMessage && (
          <p className="text-fluid-xs font-semibold text-emerald-500 mt-4 break-keep">{resendMessage}</p>
        )}

        <div className="w-full space-y-3 mt-6">
          <button
            onClick={handleCheck}
            disabled={isChecking}
            className={`w-full py-4 rounded-2xl font-black text-fluid-base flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
              isChecking ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.01] active:scale-[0.99]"
            } bg-brand text-white shadow-md shadow-brand/20 dark:bg-blue-500`}
          >
            {isChecking ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            <span>인증 확인하고 계속하기</span>
          </button>

          <button
            onClick={handleResend}
            disabled={isResending}
            className={`w-full py-3.5 rounded-2xl font-bold text-fluid-sm transition-colors cursor-pointer ${
              isResending ? "opacity-50 cursor-not-allowed" : ""
            } ${darkMode ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}
          >
            {isResending ? "전송 중..." : "인증 메일 다시 보내기"}
          </button>

          <button
            onClick={onLogout}
            className={`w-full py-2 flex items-center justify-center gap-1.5 text-fluid-xs font-bold ${
              darkMode ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <LogOut size={14} /> 다른 계정으로 로그인
          </button>
        </div>
      </motion.div>
    </div>
  );
}
