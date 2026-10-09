import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import TermsContent, { TERMS_VERSION } from "./TermsContent";

interface TermsConsentScreenProps {
  darkMode: boolean;
  onAgree: () => Promise<void>;
  onLogout: () => void;
}

export default function TermsConsentScreen({ darkMode, onAgree, onLogout }: TermsConsentScreenProps) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAgree = async () => {
    if (!agreed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAgree();
    } catch (err) {
      console.error("Could not save terms agreement:", err);
      setError("동의를 저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
      setSaving(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 safe-top ${darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-800"}`}>
      <section className={`w-full max-w-xl max-h-[calc(100dvh-2rem)] p-5 sm:p-7 rounded-[28px] border shadow-xl flex flex-col ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center"><FileText size={20} /></div>
          <div>
            <h1 className="text-lg font-black">똑 서비스 이용약관</h1>
            <p className="text-xs text-slate-500">최종 개정일: {TERMS_VERSION}</p>
          </div>
        </div>
        <TermsContent />
        <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <label className="flex items-start gap-2 text-sm font-semibold cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} className="mt-1" />
            <span>이용약관을 읽었으며, 발표 연습 영상·음성의 AI 분석 처리를 포함한 내용에 동의합니다.</span>
          </label>
          {error && <p role="alert" className="text-xs text-rose-500 font-semibold">{error}</p>}
          <button type="button" onClick={handleAgree} disabled={!agreed || saving} className="w-full h-11 bg-brand text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />}
            동의하고 시작하기
          </button>
          <button type="button" onClick={onLogout} disabled={saving} className="w-full py-1 text-xs text-slate-500 underline disabled:opacity-50">동의하지 않고 로그아웃</button>
        </div>
      </section>
    </div>
  );
}
