import { Capacitor } from "@capacitor/core";
import { auth } from "./firebase";
import { resolveApiBase, fetchApiResponse } from "./apiTransport";

export function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getBaseUrl(): string {
  return resolveApiBase(
    (import.meta as any).env?.VITE_API_URL,
    Capacitor.isNativePlatform(),
    typeof window !== "undefined" ? window.location.origin : undefined,
  );
}

export function getApiUrl(path: string): string {
  if (!path.startsWith("/api/") || path.includes("\\") || path.includes("..")) {
    throw new Error("올바르지 않은 요청 경로예요.");
  }
  return `${getBaseUrl()}${path}`;
}

export function logFetchFailure(url: string, error: unknown, statusCode?: number, _responseBody?: string) {
  console.error("[API] Request failed", { url, statusCode, error });
}

export async function robustFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if ((import.meta as any).env.DEV && (import.meta as any).env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    throw new Error('에뮬레이터에서는 기존 운영 API를 호출하지 않습니다. 공유 학습 기능을 테스트해 주세요.');
  }
  const headers = new Headers(options.headers);
  const metered = ["/api/script/generate", "/api/practice/analyze", "/api/assessment/extract",
    "/api/study/action", "/api/home/ai-report", "/api/problem/solve"];
  if (options.method?.toUpperCase() === "POST" && metered.includes(path) && !headers.has("X-AI-Request-ID")) {
    headers.set("X-AI-Request-ID", crypto.randomUUID());
  }
  const idToken = await auth.currentUser?.getIdToken();
  if (idToken) headers.set("Authorization", `Bearer ${idToken}`);
  headers.set("Accept", "application/json");
  const response = await fetchApiResponse(getApiUrl(path), { ...options, headers });
  if (metered.includes(path) && response.status < 500 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("ttok:usage-updated"));
  }
  return response;
}

export { readApiJson, ApiError } from "./apiTransport";
