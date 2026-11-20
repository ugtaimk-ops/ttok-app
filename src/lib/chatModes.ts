export const suggestions = ['오늘 어떤 공부부터 할까?', '다가오는 시험 준비 계획을 짜 줘', '이 문제의 첫 힌트만 줘', '시험 범위로 연습 문제를 내 줘'];
export const modes = [{id: 'coach', label: '오늘의 공부'}, {id: 'hint', label: '힌트로 풀기'}, {id: 'explain', label: '개념·오답'}, {id: 'quiz', label: '시험 대비'}];
export type ChatMessage = { role: 'user' | 'assistant'; text: string };
export type ChatPhoto = { base64: string; mimeType: string };
