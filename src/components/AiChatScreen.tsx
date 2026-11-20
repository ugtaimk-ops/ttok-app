import { Camera as CameraIcon, ImagePlus, Send, Sparkles, Square, Trash2, X, Copy, Loader2 } from 'lucide-react';
import type { ScheduleItem, TodoItem } from '../types';
import { modes, suggestions } from '../lib/chatModes';
import { useStudyChat } from '../hooks/useStudyChat';
type Props = { darkMode: boolean; isActive: boolean; initialHelperMode?: string; schedules?: ScheduleItem[]; todos?: TodoItem[] };
export default function AiChatScreen({darkMode,isActive,schedules=[],todos=[]}:Props) {
  const {messages,text,setText,photo,setPhoto,busy,error,setError,loadingPhoto,shareSchedule,setShareSchedule,mode,setMode,file,capture,end,attach,takePhoto,send,clearConversation,stop} = useStudyChat({isActive,schedules,todos});
  const surface = darkMode ? 'bg-slate-900 text-slate-100 border-slate-700' : 'bg-white text-slate-900 border-slate-100';
  return <section className="max-w-3xl mx-auto px-4 pt-5 pb-24 space-y-4">
    <header className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black flex items-center gap-2"><Sparkles className="text-blue-500" />똑 학습 코치</h1><p className="text-sm text-slate-500 mt-1">내 시험과 일정에 맞춰, 스스로 풀 수 있도록</p></div>
      <button aria-label="대화 지우기" title="대화 지우기" disabled={busy} onClick={clearConversation} className="p-3 rounded-2xl hover:bg-slate-200/40"><Trash2 size={20} /></button>
    </header>
    <div className="grid grid-cols-4 gap-1 rounded-2xl p-1 bg-slate-400/10" role="group" aria-label="학습 방식">{modes.map(m => <button key={m.id} disabled={busy} aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={`rounded-xl py-3 text-xs font-bold ${mode === m.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'}`}>{m.label}</button>)}</div>
    <div className={`rounded-2xl p-4 border ${surface}`}><label className="flex gap-3 items-center text-sm font-semibold"><input type="checkbox" checked={shareSchedule} disabled={busy} onChange={e => setShareSchedule(e.target.checked)} />내 일정으로 공부 계획 세우기</label><p className="text-xs text-slate-500 mt-2">켜면 앞으로의 일정 최대 15개와 미완료 할 일 최대 15개를 이번 질문에 함께 보내요. 이름·학교·계정 정보는 보내지 않아요.</p></div>
    {!messages.length && <div className={`rounded-3xl border p-5 ${surface}`}><p className="font-bold mb-4">무엇을 도와줄까요?</p><div className="grid grid-cols-2 gap-2">{suggestions.map((s,i) => <button key={s} onClick={() => { setText(s); setMode(['coach','coach','hint','quiz'][i]); }} className="text-left text-sm rounded-2xl p-3 bg-blue-500/10 hover:bg-blue-500/20">{s}</button>)}</div></div>}
    <div className="space-y-4" aria-live="polite">
      {messages.map((m, i) => <article key={i} className={`rounded-3xl p-4 ${m.role === 'user' ? 'bg-blue-600 text-white ml-8' : `border mr-4 ${surface}`}`}><p className="text-xs font-bold opacity-60 mb-2">{m.role === 'user' ? '나' : '똑 AI'}</p><p className="whitespace-pre-wrap break-words leading-relaxed text-sm">{m.text}</p>{m.role === 'assistant' && <button aria-label="답변 복사" className="p-2 mt-2 text-slate-500" onClick={() => navigator.clipboard.writeText(m.text).catch(() => setError('복사할 수 없어요. 텍스트를 선택해 복사해 주세요.'))}><Copy size={15}/></button>}</article>)}
      {busy && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />답변을 생각하고 있어요…</p>}
      <div ref={end} />
    </div>
    <div className={`rounded-3xl border p-3 ${surface}`}>
      {photo && <div className="relative w-20 mb-2"><img alt="첨부한 질문 사진" src={`data:${photo.mimeType};base64,${photo.base64}`} className="w-20 h-20 object-cover rounded-xl"/><button aria-label="사진 제거" onClick={() => setPhoto(null)} className="absolute right-0 top-0 bg-black/70 text-white rounded-full p-1"><X size={14}/></button></div>}
      <textarea aria-label="AI에게 질문하기" placeholder="질문이나 학습 내용을 입력하세요" maxLength={4000} rows={3} value={text} disabled={busy} onChange={e => setText(e.target.value)} className="w-full bg-transparent resize-none outline-none text-sm p-2" />
      <div className="flex items-center justify-between"><div className="flex gap-1"><button disabled={busy || loadingPhoto} aria-label="사진 선택" className="p-3" onClick={() => file.current?.click()}><ImagePlus size={20}/></button><button disabled={busy || loadingPhoto} aria-label="사진 촬영" className="p-3" onClick={takePhoto}><CameraIcon size={20}/></button></div>
        {busy ? <button aria-label="답변 중단" onClick={stop} className="rounded-2xl bg-slate-200 text-slate-800 p-3"><Square size={18}/></button> : <button aria-label="질문 보내기" disabled={loadingPhoto || (!text.trim() && !photo)} onClick={send} className="rounded-2xl bg-blue-600 text-white p-3 disabled:opacity-40"><Send size={20}/></button>}
      </div>
      {loadingPhoto && <p className="text-xs text-slate-500">사진을 준비하고 있어요…</p>}
      <input type="file" accept="image/*" ref={file} hidden onChange={e => { void attach(e.target.files?.[0]); e.target.value = ''; }}/>
      <input type="file" accept="image/*" capture="environment" ref={capture} hidden onChange={e => { void attach(e.target.files?.[0]); e.target.value = ''; }}/>
    </div>
    {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
    <p className="text-xs text-slate-500">AI 답변은 틀릴 수 있어요. 질문과 사진은 AI 서버로 전송되며, 대화 기록은 이 기기에 저장돼요. 요청마다 크레딧이 사용돼요.</p>
  </section>;
}
