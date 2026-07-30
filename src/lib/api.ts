/**
 * API Url Helper to resolve relative API paths on both web and mobile WebView (Capacitor).
 * On Android, the app runs on localhost/file protocol, so relative fetch calls fail.
 * We resolve them to the hosted HTTPS server.
 */

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getBaseUrl(): string {
  // 1. Build-time production environment variable VITE_API_URL only
  const compiledUrl = (import.meta as any).env?.VITE_API_URL;
  if (compiledUrl && compiledUrl.trim() !== "") {
    return compiledUrl.trim().replace(/\/$/, "");
  }

  // 2. Web browser fallback (only if not running in Android APK/Capacitor file context)
  if (typeof window !== "undefined") {
    const isAndroidAPK = 
      window.location.protocol === "file:" ||
      window.location.protocol.startsWith("capacitor") ||
      !!(window as any).Capacitor ||
      navigator.userAgent.toLowerCase().includes("android");

    if (!isAndroidAPK && window.location.origin && window.location.origin !== "null") {
      return window.location.origin;
    }
  }

  return "";
}

export function getApiUrl(path: string): string {
  const baseUrl = getBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Detailed debug logger for fetch failures in Android APK & Web Console (Req 5)
 */
export function logFetchFailure(url: string, error: any, statusCode?: number, responseBody?: string) {
  const errorMsg = error?.message || String(error);
  const logPrefix = `[ANDROID_APK_DEBUG] [FETCH_FAILURE]`;
  console.error(`${logPrefix} ==========================================`);
  console.error(`${logPrefix} Failed URL: ${url}`);
  if (statusCode !== undefined) {
    console.error(`${logPrefix} HTTP Status Code: ${statusCode}`);
  }
  if (responseBody !== undefined) {
    console.error(`${logPrefix} Response Content (first 1000 chars): ${responseBody.substring(0, 1000)}`);
  }
  console.error(`${logPrefix} Exception Message: ${errorMsg}`);
  if (error && error.stack) {
    console.error(`${logPrefix} Stack Trace: ${error.stack}`);
  }
  console.error(`${logPrefix} ==========================================`);
}

/**
 * An extremely resilient fetch wrapper that handles environment-specific networking issues.
 * If a request fails (e.g. "Failed to fetch" due to iframe sandboxing, CORS, container cold starts,
 * or APK localhost resolution), it automatically retries with alternative backend hosts
 * (Development and Production cloud containers) to ensure high availability and self-healing.
 */
export async function robustFetch(path: string, options?: RequestInit): Promise<Response> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const compiledApiUrl = (import.meta as any).env?.VITE_API_URL;

  const urlsToTry: string[] = [];

  // 1. Try resolving using standard getApiUrl first
  const primaryUrl = getApiUrl(path);
  urlsToTry.push(primaryUrl);

  // 2. If there's a compiled URL and it's different, make sure it is tried as well
  if (compiledApiUrl) {
    const absoluteCompiled = `${compiledApiUrl.replace(/\/$/, "")}${cleanPath}`;
    if (!urlsToTry.includes(absoluteCompiled)) {
      urlsToTry.push(absoluteCompiled);
    }
  }

  // 3. If in a browser environment, add the active window origin as a backup
  if (typeof window !== "undefined" && window.location.origin && window.location.origin !== "null") {
    const originUrl = `${window.location.origin}${cleanPath}`;
    if (!urlsToTry.includes(originUrl)) {
      urlsToTry.push(originUrl);
    }
  }

  // Deduplicate and filter out invalid/empty strings
  const uniqueUrls = Array.from(new Set(urlsToTry)).filter(Boolean);

  // Clear logcat notice for request generation
  console.log(`[ANDROID_LOGCAT_API] Candidate URLs generated for request:`, uniqueUrls);

  const TIMEOUT_MS = 60000; // Increased to 60 seconds (60,000ms) to safely accommodate deep AI analysis calls
  const MAX_RETRIES = 3;    // up to 3 retries
  let lastError: any = null;

  for (let i = 0; i < uniqueUrls.length; i++) {
    const url = uniqueUrls[i];
    
    // Retry logic per candidate URL
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`[ANDROID_LOGCAT_API] [TIMEOUT] Timeout reached (${TIMEOUT_MS}ms). Aborting request for URL: ${url}`);
        controller.abort();
      }, TIMEOUT_MS);

      try {
        // Logging actual requested URL clearly for Android Logcat
        console.log(`[ANDROID_LOGCAT_API] [REQUEST_START] [URL ${i + 1}/${uniqueUrls.length}] [Attempt ${attempt}/${MAX_RETRIES}]`);
        console.log(`[ANDROID_LOGCAT_API] [REQUEST_URL] Fetching: ${url}`);
        console.log(`[ANDROID_LOGCAT_API] [REQUEST_DETAILS] Method: ${options?.method || 'GET'}, Headers: ${JSON.stringify(options?.headers || {})}`);

        const appSecret = (import.meta as any).env?.VITE_APP_SHARED_SECRET;
        const fetchOptions: RequestInit = {
          ...options,
          headers: {
            ...(options?.headers || {}),
            ...(appSecret ? { "X-App-Secret": appSecret } : {}),
          },
          signal: controller.signal
        };

        const res = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        // Print confirmation that request reached the server
        console.log(`[ANDROID_LOGCAT_API] [REQUEST_SUCCESS] Request successfully reached the server! URL: ${url}, Status Code: ${res.status}`);

        // If it's a server-side error (5xx), we retry on next attempt. Otherwise, we return.
        if (res.ok) {
          console.log(`[robustFetch] [Success] Status: ${res.status} from URL: ${url}`);
          return res;
        } else {
          // Read response content to log diagnostic info
          let responseText = "";
          try {
            responseText = await res.text();
          } catch (readErr) {
            responseText = "[Failed to read response body]";
          }

          console.warn(`[ANDROID_LOGCAT_API] [SERVER_ERROR_RESPONSE] Server returned non-ok status: ${res.status} for URL: ${url}. Response: ${responseText}`);
          logFetchFailure(url, new Error(`HTTP response was non-ok (Status: ${res.status})`), res.status, responseText);

          if (res.status >= 500) {
            console.warn(`[robustFetch] [Server Error ${res.status}] for ${url} on attempt ${attempt}.`);
            if (attempt === MAX_RETRIES) {
              lastError = new Error(`서버 에러가 발생했습니다 (상태 코드: ${res.status}). 상세: ${responseText}`);
            }
          } else {
            // Client errors (4xx) don't need retries on network level; return immediately
            console.log(`[robustFetch] [Client Error Response] Status: ${res.status} from URL: ${url}`);
            return res;
          }
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        const isTimeout = err.name === "AbortError";
        const errorMsg = isTimeout ? "연습 대기 및 분석 요청이 시간 초과(60초)되었습니다." : (err.message || String(err));
        
        // Detailed Android Logcat print for fetch exception
        console.error(`[ANDROID_LOGCAT_API] [FETCH_EXCEPTION] Fetch exception thrown for URL: ${url}`);
        console.error(`[ANDROID_LOGCAT_API] [FETCH_EXCEPTION] Exception Message: ${errorMsg}`);
        if (err.stack) {
          console.error(`[ANDROID_LOGCAT_API] [FETCH_EXCEPTION] Stack Trace: ${err.stack}`);
        }
        console.error(`[ANDROID_LOGCAT_API] [FETCH_EXCEPTION] Request did NOT reach the server (or was blocked/CORS rejected/connection refused).`);

        logFetchFailure(url, err); // Log the exception detail
        
        console.warn(`[robustFetch] [Failed] URL: ${url}, Attempt: ${attempt}/${MAX_RETRIES}. Error: ${errorMsg}`);
        lastError = err;
      }

      // Briefly wait before retrying the same URL
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // If we reach here, all candidates and all retries have failed.
  if (typeof window !== "undefined") {
    alert(
      "[네트워크 및 서버 오류]\n\n" +
      "AI 서버와의 통신에 실패했습니다.\n" +
      "이 현상은 불안정한 네트워크 연결, 서버 점검, 또는 일시적인 스피치 분석 지연으로 인해 발생할 수 있습니다.\n\n" +
      "인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요."
    );
  }

  throw lastError || new Error(`[robustFetch] All candidate URLs and retries failed to resolve for path: ${path}`);
}
