import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { auth } from '../lib/firebase';
import { robustFetch } from '../lib/api';
import { prepareAiImage } from '../lib/prepareAiImage';
import type { ScheduleItem, TodoItem } from '../types';
import type { ChatMessage as Message, ChatPhoto as Photo } from '../lib/chatModes';

export function useStudyChat({isActive,schedules,todos}: {isActive:boolean;schedules:ScheduleItem[];todos:TodoItem[]}) {
  const [uid, setUid] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [shareSchedule, setShareSchedule] = useState(false);
  const [mode, setMode] = useState('coach');
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const file = useRef<HTMLInputElement>(null);
  const capture = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      generation.current++;
      controller.current?.abort();
      setBusy(false); setLoadingPhoto(false); setError(''); setText(''); setPhoto(null); setShareSchedule(false);
      setUid(user?.uid || null);
      let saved: Message[] = [];
      try {
        const value = user && JSON.parse(localStorage.getItem(`ttok:chat:${user.uid}`) || '[]');
        if (Array.isArray(value)) saved = value.filter(m => ['user', 'assistant'].includes(m?.role) && typeof m.text === 'string' && m.text.length <= 16000).slice(-40);
      } catch { /* Storage is optional. */ }
      setMessages(saved);
    });
    return () => { unsubscribe(); generation.current++; controller.current?.abort(); };
  }, []);

  useEffect(() => {
    if (uid) try { localStorage.setItem(`ttok:chat:${uid}`, JSON.stringify(messages.slice(-40))); } catch { /* Continue in memory. */ }
  }, [messages, uid]);
  useEffect(() => { if (isActive && (messages.length > 0 || busy)) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy, isActive]);

  async function attach(selected?: File) {
    if (!selected) return;
    const version = generation.current;
    setLoadingPhoto(true); setError('');
    try {
      const prepared = await prepareAiImage(selected);
      if (version === generation.current) setPhoto(prepared);
    } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : '사진을 읽지 못했어요.'); }
    finally { if (version === generation.current) setLoadingPhoto(false); }
  }

  async function takePhoto() {
    if (!Capacitor.isNativePlatform()) { capture.current?.click(); return; }
    const version = generation.current;
    try {
      const result = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 85, width: 2048, height: 2048 });
      if (result.webPath && version === generation.current) {
        const blob = await (await fetch(result.webPath)).blob();
        await attach(new File([blob], 'camera.jpg', { type: blob.type || 'image/jpeg' }));
      }
    } catch (e) {
      if (version === generation.current && !/cancel/i.test(String(e))) setError('카메라 권한을 확인하고 다시 촬영해 주세요.');
    }
  }

  async function send() {
    if (busy || loadingPhoto || (!text.trim() && !photo)) return;
    if (!uid) { setError('로그인한 뒤 질문해 주세요.'); return; }
    const version = generation.current;
    const message = text.trim() || '사진 속 문제를 읽고 단계별로 풀어 줘.';
    // Keep only a bounded recent context. Photos are never persisted in local storage.
    let history = messages.slice(-12).map(m => ({ ...m, text: m.text.slice(0, 8000) }));
    while (history.reduce((n, m) => n + m.text.length, 0) > 24000) history.shift();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError('');
    try {
      const response = await robustFetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ message, history, mode,
          context: shareSchedule ? JSON.stringify({ today: new Date().toLocaleDateString('sv-SE'),
            schedules: schedules.filter(s => s.date >= new Date().toLocaleDateString('sv-SE')).sort((a,b) => a.date.localeCompare(b.date)).slice(0,15).map(s => ({ title:s.title.slice(0,120), date:s.date.slice(0,20), subject:s.subject.slice(0,50), type:s.type })),
            todos: todos.filter(t => !t.completed).slice(0,15).map(t => ({ text:t.text.slice(0,120), dueDate:t.dueDate.slice(0,20), subject:t.subject?.slice(0,50) })),
          }) : undefined,
          imageBase64: photo?.base64, mimeType: photo?.mimeType }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '답변을 받지 못했어요.');
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('답변을 받지 못했어요.');
      if (version !== generation.current) return;
      setMessages(previous => [...previous, { role: 'user', text: photo ? `[사진 첨부] ${message}` : message }, { role: 'assistant', text: data.reply }].slice(-40) as Message[]);
      setText(''); setPhoto(null);
    } catch (e) {
      if (version === generation.current) setError(abort.signal.aborted ? '답변 요청을 중단했어요. 이미 처리된 요청은 크레딧이 사용될 수 있어요.' : e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
    } finally { if (version === generation.current) { setBusy(false); controller.current = null; } }
  }

  function clearConversation() {
    if (busy || !window.confirm('이 기기에 저장된 대화를 지울까요?')) return;
    generation.current++; setLoadingPhoto(false); setMessages([]); setPhoto(null); setText(''); setError('');
  }
  return {messages,text,setText,photo,setPhoto,busy,error,setError,loadingPhoto,shareSchedule,setShareSchedule,mode,setMode,file,capture,end,attach,takePhoto,send,clearConversation,stop:()=>controller.current?.abort()};
}
