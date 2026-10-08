export const PRODUCTION_API_URL = "https://ttok-backend.onrender.com";

export class ApiError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function resolveApiBase(configured: string | undefined, native: boolean, origin?: string): string {
  if (configured?.trim()) {
    const url = new URL(configured.trim());
    if (!/^https?:$/.test(url.protocol) || (native && (url.protocol !== "https:" || /^(localhost|127\.0\.0\.1)$/.test(url.hostname)))) {
      throw new ApiError("서버 연결 설정을 확인해야 해요. 앱을 최신 버전으로 업데이트해 주세요.");
    }
    return url.href.replace(/\/$/, "");
  }
  if (!native && origin && /^https?:\/\//.test(origin)) return origin;
  return PRODUCTION_API_URL;
}

export async function fetchApiResponse(url: string, options: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  // A timed-out POST may already have consumed usage. Never replay it or fall
  // back to the WebView origin, which returns index.html instead of API JSON.
  const timeout = setTimeout(abort, 120_000);
  try {
    const response = await fetcher(url, { ...options, signal: controller.signal });
    const type = response.headers.get("content-type") || "";
    if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(type)) {
      throw new ApiError("분석 서버에 잠시 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", response.status, "NON_JSON_RESPONSE");
    }
    try { await response.clone().json(); }
    catch { throw new ApiError("서버의 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.", response.status, "INVALID_JSON"); }
    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw new DOMException("요청을 취소했어요.", "AbortError");
    if (controller.signal.aborted) throw new ApiError("서버 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.", undefined, "TIMEOUT");
    throw new ApiError("인터넷 연결을 확인한 뒤 다시 시도해 주세요.", undefined, "NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export async function readApiJson<T = any>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "로그인을 다시 한 뒤 이용해 주세요.",
      403: "현재 계정의 이용 권한 또는 이번 달 남은 횟수를 확인해 주세요.",
      429: "AI 요청이 많아 잠시 이용하기 어려워요. 잠시 후 다시 시도해 주세요.",
      504: "AI 응답이 늦어 분석을 마치지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
    const message = data?.code === "MONTHLY_LIMIT_EXCEEDED"
      ? "이번 달 AI 이용 횟수를 모두 사용했어요. 다음 달에 다시 이용할 수 있어요."
      : messages[response.status] || "분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
    throw new ApiError(message, response.status, data?.code);
  }
  return data;
}
