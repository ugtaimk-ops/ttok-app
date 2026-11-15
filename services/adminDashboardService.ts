import { currentMonthKey, getAdminFirestore, getCurrentUsage, FREE_MONTHLY_LIMIT, PREMIUM_MONTHLY_LIMIT } from "./usageService";
import { getStorageStatus, isPostgresConfigured } from "./postgresStore";
import { getQuotaStatus, quotaV6Enabled } from "./aiQuotaStore";

export const ADMIN_SECTIONS = ["overview", "accounts", "database", "ai", "billing", "school", "api", "security"] as const;
export type AdminSection = typeof ADMIN_SECTIONS[number];

export function configuredAdminUids(): string[] {
  return (process.env.DASHBOARD_ADMIN_UIDS || "")
    .split(/[\s,;]+/).map(value => value.trim()).filter(Boolean);
}

export function configuredServices() {
  return {
    firebase: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY),
    neis: Boolean(process.env.NEIS_API_KEY),
    revenueCat: Boolean(process.env.REVENUECAT_SECRET_API_KEY),
    revenueCatWebhook: Boolean(process.env.REVENUECAT_WEBHOOK_SECRET),
    postgres: isPostgresConfigured(),
  };
}

async function countUsers(query?: (ref: any) => any): Promise<number> {
  const users = getAdminFirestore().collection("users");
  const snapshot = await (query ? query(users) : users).count().get();
  return snapshot.data().count;
}

async function currentSubscriber(uid: string): Promise<{ connected: boolean; active: boolean; expiresAt: string | null }> {
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) return { connected: false, active: false, expiresAt: null };
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`RevenueCat subscriber lookup returned ${response.status}`);
  const body = await response.json() as any;
  const entitlement = body?.subscriber?.entitlements?.["똑 Pro"];
  const expiresAt = typeof entitlement?.expires_date === "string" ? entitlement.expires_date : null;
  return { connected: true, active: Boolean(entitlement) && (!expiresAt || Date.parse(expiresAt) > Date.now()), expiresAt };
}

async function neisStatus(): Promise<{ connected: boolean; status: string }> {
  const url = new URL("https://open.neis.go.kr/hub/schoolInfo");
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", "1");
  url.searchParams.set("pSize", "1");
  url.searchParams.set("SCHUL_NM", "서울");
  if (process.env.NEIS_API_KEY) url.searchParams.set("KEY", process.env.NEIS_API_KEY);
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return { connected: false, status: `HTTP ${response.status}` };
  const body = await response.json() as any;
  return { connected: Array.isArray(body?.schoolInfo), status: Array.isArray(body?.schoolInfo) ? "학교 검색 응답 확인" : "응답은 받았으나 학교 결과 없음" };
}

export async function getAdminSection(section: AdminSection, uid: string): Promise<unknown> {
  const configured = configuredServices();
  switch (section) {
    case "overview": {
      const [users, premiumUsers] = await Promise.all([
        countUsers(), countUsers(ref => ref.where("isPremium", "==", true)),
      ]);
      return { section, checkedAt: new Date().toISOString(), users, premiumUsers, freeUsers: Math.max(0, users - premiumUsers), configured };
    }
    case "accounts": {
      const docs = await getAdminFirestore().collection("users")
        .orderBy("__name__").limit(30).get();
      return { section, checkedAt: new Date().toISOString(), users: docs.docs.map((doc: any) => {
        const data = doc.data() || {};
        return {
          uid: doc.id,
          name: typeof data.name === "string" ? data.name : "",
          email: typeof data.email === "string" ? data.email : "",
          school: typeof data.school === "string" ? data.school : "",
          isPremium: data.isPremium === true,
          usage: data.aiUsageMonth === currentMonthKey() && Number.isFinite(data.aiUsageCount) ? data.aiUsageCount : 0,
        };
      }), limit: 30 };
    }
    case "database": {
      let postgresReady = false;
      if (configured.postgres) {
        try { await getStorageStatus(); postgresReady = true; } catch { /* Report disconnected without exposing the DSN. */ }
      }
      return { section, checkedAt: new Date().toISOString(), firestoreReady: configured.firebase, postgresConfigured: configured.postgres, postgresReady,
        collections: ["users", "problemSolutions", "deletedAccounts"], note: "앱의 사용자 데이터는 현재 Firestore에 저장됩니다." };
    }
    case "ai": {
      if (quotaV6Enabled()) {
        const quota = await getQuotaStatus(uid);
        return { section, checkedAt: new Date().toISOString(), mode: "v6", quota,
          geminiConfigured: configured.gemini, provider: process.env.AI_PROVIDER || "gemini" };
      }
      const [usage, activeUsers] = await Promise.all([
        getCurrentUsage(uid), countUsers(ref => ref.where("aiUsageMonth", "==", currentMonthKey())),
      ]);
      return { section, checkedAt: new Date().toISOString(), mode: "legacy", geminiConfigured: configured.gemini, activeUsers, month: currentMonthKey(),
        freeLimit: FREE_MONTHLY_LIMIT, premiumLimit: PREMIUM_MONTHLY_LIMIT, adminUsage: usage,
        provider: process.env.AI_PROVIDER || "gemini" };
    }
    case "billing": {
      let subscriber: Awaited<ReturnType<typeof currentSubscriber>> | null = null;
      let subscriberError: string | null = null;
      try { subscriber = await currentSubscriber(uid); }
      catch { subscriberError = "RevenueCat 응답을 확인하지 못했습니다."; }
      return { section, checkedAt: new Date().toISOString(), revenueCatConfigured: configured.revenueCat,
        webhookConfigured: configured.revenueCatWebhook, monetizationV6Enabled: quotaV6Enabled(),
        offeringId: "ddok_v6", entitlementId: "똑 Pro", subscriber, subscriberError,
        note: "구독 상품과 가격 변경은 Google Play와 RevenueCat 콘솔에서 관리합니다." };
    }
    case "school": {
      let probe: Awaited<ReturnType<typeof neisStatus>> | null = null;
      try { probe = await neisStatus(); }
      catch { probe = { connected: false, status: "NEIS 응답을 확인하지 못했습니다." }; }
      return { section, checkedAt: new Date().toISOString(), neisKeyConfigured: configured.neis, probe,
        routes: ["/api/school/search", "/api/meal/info"] };
    }
    case "api": {
      return { section, checkedAt: new Date().toISOString(), routes: [
        { path: "/api/health", method: "GET", auth: false },
        { path: "/api/school/search", method: "GET", auth: true },
        { path: "/api/meal/info", method: "GET", auth: true },
        { path: "/api/script/generate", method: "POST", auth: true },
        { path: "/api/practice/analyze", method: "POST", auth: true },
        { path: "/api/study/action", method: "POST", auth: true },
        { path: "/api/problem/solve", method: "POST", auth: true },
        { path: "/api/home/ai-report", method: "POST", auth: true },
        { path: "/revenuecat/webhook", method: "POST", auth: true },
      ] };
    }
    case "security": {
      return { section, checkedAt: new Date().toISOString(), adminAllowlistConfigured: configuredAdminUids().length > 0,
        configured, rules: ["Firebase ID 토큰 확인", "관리자 UID 허용 목록", "관리 API 읽기 전용", "API 키는 서버 환경변수에만 보관"] };
    }
  }
}
