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
  const headers = new Headers(options.headers);
  const appSecret = (import.meta as any).env?.VITE_APP_SHARED_SECRET;
  if (appSecret) headers.set("X-App-Secret", appSecret);
  const idToken = await auth.currentUser?.getIdToken();
  if (idToken) headers.set("Authorization", `Bearer ${idToken}`);
  headers.set("Accept", "application/json");
  return fetchApiResponse(getApiUrl(path), { ...options, headers });
}

export { readApiJson, ApiError } from "./apiTransport";
