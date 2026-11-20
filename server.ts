import { creditContext, creditOperation, creditsEnabled } from "./services/creditStore";
import {createSchoolSearch} from './services/schoolSearch';
import {verifySchoolAccount} from './services/schoolIdentity';
import {timerTickets} from './services/timerAccountLink';
import express from "express";
import http from "http";
import path from "path";
import { createHash } from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { getAIService, parseJSONResponse } from "./services/ai";
import { verifyRequestIdentity, isAccountDeleted, deleteAccountData, pruneExpiredServerData, checkAndConsumeUsage, getCurrentUsage, refundUsage, getCachedProblem, saveProblemResult, getCachedAiResult, saveCachedAiResult, getAdminFirestore, currentMonthKey } from "./services/usageService";
import { quotaV6Enabled, getQuotaStatus, reserveQuota, finishQuota, requestIdFromHeader, fallbackRequestId } from "./services/aiQuotaStore";
import { createAdRewardSession, acceptAdMobCallback } from "./services/adRewardService";
import { verifyWebhookAuth, handleWebhookEvent } from "./services/revenueCatService";
import { isPostgresConfigured, validCollection, validDocumentId, validUserPayload, getUserDocuments, putUserDocument, deleteUserDocument, getStorageStatus } from "./services/postgresStore";
import { ADMIN_SECTIONS, configuredAdminUids, getAdminSection } from "./services/adminDashboardService";
import { assertSharedStudyAccount, parseAction, sharedStudyPersonal, StudyError } from "./services/sharedStudyPersonal";
import { dispatchRoomAction, ROOM_ACTIONS, RoomActionError } from "./services/sharedRoomsService";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Render forwards requests through one trusted proxy. Without this, the rate
// limiter treats every visitor as the same proxy IP and logs X-Forwarded-For
// validation errors instead of applying limits to each client.
// Self-hosted deployments may opt in when the origin listens only on loopback
// and a single local reverse proxy (for example Caddy) is in front of it.
if (process.env.RENDER === "true" || process.env.TRUST_PROXY_HOPS === "1") app.set("trust proxy", 1);

// Enable lightweight CORS middleware to prevent any browser cross-origin blocks
app.use((req, res, next) => {
  res.header("X-Content-Type-Options", "nosniff");
  res.header("Referrer-Policy", "strict-origin-when-cross-origin");
  res.header("X-Frame-Options", "SAMEORIGIN");
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-App-Secret, X-AI-Request-ID");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// General API rate limit: protects against runaway costs from bots/scanners hitting
// the public backend URL that ships inside the APK/IPA.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }
});

// Stricter limit for the AI generation endpoints specifically, since each call costs
// real Gemini API quota.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }
});

// Both apps can poll shared records from the same home network. Keep a
// separate IP limit so two signed-in devices do not exhaust the AI/school
// limit while browsing their study history.
const sharedStudyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
});
app.use("/api/shared-study", sharedStudyLimiter);
app.use("/api/", (req, res, next) =>
  /^\/api\/shared-study(?:\/|\?)/.test(req.originalUrl) ? next() : apiLimiter(req, res, next));

// A value bundled into an APK is extractable, so authenticate every API caller
// with their Firebase ID token. Older app versions may still send X-App-Secret;
// it is ignored and kept only in the CORS allow-header for compatibility.
app.use("/api/", async (req, res, next) => {
  if (req.path === "/health") return next();
  const identity = await verifyRequestIdentity(req);
  if (!identity) return res.status(401).json({ error: "로그인이 필요해요. 이메일 계정은 인증 후 다시 로그인해 주세요.", code: "AUTH_REQUIRED" });
  if (req.path.startsWith("/admin/")) {
    const admins = configuredAdminUids();
    if (admins.length === 0) return res.status(503).json({ code: "ADMIN_NOT_CONFIGURED", error: "관리자 UID가 서버에 설정되지 않았습니다." });
    if (!admins.includes(identity.uid)) return res.status(403).json({ code: "ADMIN_FORBIDDEN", error: "관리자 권한이 없습니다." });
  }
  try {
    // A dev laptop need not contain production Admin credentials for public
    // school names. Signature/email checks above AND live account validation
    // remain mandatory. No private reads, writes or AI routes use this path.
    if (process.env.NODE_ENV !== 'production' && req.path === '/school/search' && !process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const token = (req.header('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!await verifySchoolAccount(token, identity.uid)) return res.status(401).json({error:'다시 로그인한 뒤 학교를 검색해 주세요.'});
      (req as any).uid = identity.uid;
      return next();
    }
    if (req.path !== "/account/delete" && await isAccountDeleted(identity.uid)) {
      return res.status(401).json({ error: "삭제된 계정이에요.", code: "ACCOUNT_DELETED" });
    }
    (req as any).uid = identity.uid;
    (req as any).authTime = identity.authTime;
    next();
  } catch (error) {
    console.error("[Auth] Account status check failed:", error);
    return res.status(503).json({ error: "계정 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." });
  }
});

// Authenticate before parsing large image/video bodies. The webhook has its
// own secret and a small body cap; unauthenticated clients cannot allocate
// 25 MB of JSON parser memory or submit a paid AI prompt.
app.use("/revenuecat/webhook", (req, res, next) =>
  verifyWebhookAuth(req.header("authorization")) ? next() : res.status(401).json({ error: "Unauthorized" }));
app.use("/api/practice/analyze", express.json({ limit: "23mb" }));
for (const route of ["/api/problem/solve", "/api/assessment/extract", "/api/study/action"]) {
  app.use(route, express.json({ limit: "13mb" }));
}
app.use("/revenuecat/webhook", express.json({ limit: "128kb" }));
app.use(express.json({ limit: "1mb" }));

// Authorization codes are one-use, PKCE-bound, and expire after 60 seconds.
app.post('/api/timer-auth/issue', (req,res)=>{
  try { const code=timerTickets.issue((req as any).uid,req.body?.challenge);res.setHeader('Cache-Control','no-store');res.json({code}); }
  catch {res.status(400).json({error:'올바르지 않은 연결 요청이에요.'});}
});
const timerExchangeLimit=rateLimit({windowMs:60000,limit:15,standardHeaders:true,legacyHeaders:false});
app.post('/timer-auth/exchange',timerExchangeLimit,(req,res)=>{
  try {const token=timerTickets.exchange(req.body?.code,req.body?.verifier);res.setHeader('Cache-Control','no-store');res.json({token});}
  catch(error) {res.status(error instanceof Error&&error.message==='NOT_CONFIGURED'?503:400).json({error:'연결 요청이 만료되었거나 서버 설정을 확인해야 해요.'});}
});

const AI_ROUTES = ["/api/script/generate", "/api/practice/analyze", "/api/assessment/extract", "/api/study/action", "/api/home/ai-report"];
const CACHEABLE_AI_ROUTES = new Set(["/api/assessment/extract", "/api/study/action"]);
const validString = (value: unknown, max: number) => value === undefined || (typeof value === "string" && value.length <= max);
const validImage = (image: unknown, mime: unknown) =>
  image === undefined || (typeof image === "string" && image.length >= 100 && image.length <= 12_000_000 &&
    /^[A-Za-z0-9+/=]+$/.test(image) && ["image/jpeg", "image/png", "image/webp"].includes(String(mime)));
const validReportList = (items: unknown, fields: string[]) => items === undefined ||
  (Array.isArray(items) && items.length <= 100 && items.every((item) =>
    item && typeof item === "object" && fields.every((field) => validString(item[field], 300))));

// Validate user-controlled prompt fields before the quota reservation and
// before building Gemini prompts. One huge string must not cost one request.
app.use(AI_ROUTES, (req, res, next) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "요청 형식을 확인해 주세요." });
  }
  const route = req.originalUrl.split("?")[0];
  let valid = true;
  if (route === "/api/script/generate") {
    valid = ["topic", "time", "grade", "subject", "audience", "tone", "purpose", "style"]
      .every((field) => validString(body[field], field === "topic" ? 300 : 100));
  } else if (route === "/api/practice/analyze") {
    valid = validString(body.topic, 120) && validString(body.expectedScript, 5000);
  } else if (route === "/api/assessment/extract") {
    valid = validImage(body.imageBase64, body.mimeType) && typeof body.imageBase64 === "string";
  } else if (route === "/api/study/action") {
    // Older clients serialize the optional photo as null/empty for text-only requests.
    if (body.imageBase64 === null || body.imageBase64 === "") {
      delete body.imageBase64;
      delete body.mimeType;
    }
    valid = ["summary", "quiz", "note", "question"].includes(body.actionType) &&
      validString(body.text, 20_000) && validString(body.additionalQuestion, 1000) &&
      validImage(body.imageBase64, body.mimeType);
  } else if (route === "/api/home/ai-report") {
    valid = validReportList(body.todos, ["text", "category", "dueDate"]) &&
      validReportList(body.schedules, ["title", "type", "subject", "date"]);
  }
  if (!valid) return res.status(400).json({ error: "입력 내용이나 이미지 크기를 확인해 주세요." });
  next();
});
app.use(AI_ROUTES, aiLimiter);
app.use("/api/problem/solve", aiLimiter);

// Reject unusable recordings before counting a monthly AI request.
app.post("/api/practice/analyze", (req, res, next) => {
  const { duration, videoBase64, videoMimeType } = req.body || {};
  if (typeof videoBase64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(videoBase64) ||
      videoBase64.length < 1500 || videoBase64.length > 22_000_000 ||
      !["video/webm", "video/mp4"].includes(videoMimeType) ||
      !Number.isFinite(duration) || duration < 3 || duration > 245) {
    return res.status(400).json({ error: "실제 녹화한 영상과 음성이 있어야 발표를 평가할 수 있어요.", code: "RECORDING_REQUIRED" });
  }
  next();
});

// Free/premium monthly AI usage cap, tracked per signed-in user in Firestore
// (see services/usageService.ts). Identifies the caller from the Firebase ID
// token the client sends on Authorization: Bearer <token>. If that token is
// missing/invalid, or the usage database cannot be reached, requests fail
// closed so monthly limits cannot silently be bypassed.
// Also stashes uid/isPremium on the request for routes that need to gate a
// feature to premium users specifically (e.g. /api/home/ai-report below),
// so they don't need a second Firestore read.
app.use([...AI_ROUTES, "/api/problem/solve"], async (req,res,next)=>{
  if(!creditsEnabled()) return next();
  try {
    const uid=(req as any).uid as string;
    const status=await creditOperation(uid,'status');
    if(status.legacy) return next();
    const premium=status.plans.some((p:string)=>p==='pro'||p==='max');
    if(req.originalUrl.split('?')[0]==='/api/home/ai-report' && !premium) return res.status(403).json({error:'Pro 또는 Max 구독이 필요한 기능이에요.'});
    (req as any).creditBilling=true;
    (req as any).isPremium=premium;
    const requestId=requestIdFromHeader(req.header('x-ai-request-id')) || fallbackRequestId(uid,req.path,req.body);
    return creditContext.run({uid,requestId},()=>next());
  } catch {return res.status(503).json({error:'AI 크레딧을 확인하지 못했어요.',code:'CREDITS_UNAVAILABLE'});}
});
app.use(AI_ROUTES, async (req, res, next) => {
  if((req as any).creditBilling) return next();
  try {
    const uid = (req as any).uid as string;
    const route = req.originalUrl.split("?")[0];
    const isRepeatableStudyRequest = route === "/api/study/action" &&
      (req.body?.actionType === "quiz" || req.body?.actionType === "question");
    if (CACHEABLE_AI_ROUTES.has(route) && !isRepeatableStudyRequest) {
      const hash = createHash("sha256").update("ai-cache-v1:").update(route).update(JSON.stringify(req.body || {})).digest("hex");
      (req as any).aiCacheHash = hash;
      try {
        const cached = await getCachedAiResult(uid, hash);
        if (cached) return res.json(cached);
      } catch (cacheError) {
        console.warn("[AI] Cache lookup unavailable:", cacheError);
      }
    }
    if (quotaV6Enabled()) {
      if (route === "/api/home/ai-report" && !(await getQuotaStatus(uid)).adFree) {
        return res.status(403).json({ error: "AI 리포트는 똑 PRO 전용 기능이에요.", code: "PREMIUM_REQUIRED" });
      }
      const requestId = requestIdFromHeader(req.header("x-ai-request-id")) || fallbackRequestId(uid, route, req.body);
      const quota = await reserveQuota(uid, requestId);
      const isPremium = quota.summary.plans.some((p) => p.planId === "pro");
      (req as any).isPremium = isPremium;
      if (route === "/api/home/ai-report" && !isPremium) {
        if (quota.allowed && !quota.duplicate) await finishQuota(uid, requestId, false);
        return res.status(403).json({ error: "AI 리포트는 똑 PRO 전용 기능이에요.", code: "PREMIUM_REQUIRED" });
      }
      if (!quota.allowed) return res.status(403).json({ error: "AI 이용 횟수를 모두 사용했어요.", code: "AI_QUOTA_EXCEEDED", quota: quota.summary });
      if (quota.duplicate) return res.status(409).json({ error: "이미 처리한 요청이에요.", code: "DUPLICATE_AI_REQUEST" });
      res.once("finish", () => {
        void finishQuota(uid, requestId, res.statusCode < 400)
          .catch((error) => console.error("[AIQuota] Finalization failed:", error));
      });
      res.once("close", () => {
        if (!res.writableFinished) void finishQuota(uid, requestId, false)
          .catch((error) => console.error("[AIQuota] Connection-close refund failed:", error));
      });
      return next();
    }
    const result = await checkAndConsumeUsage(uid, route === "/api/home/ai-report");
    (req as any).uid = uid;
    (req as any).isPremium = result.isPremium;
    if (!result.allowed) {
      if (route === "/api/home/ai-report" && !result.isPremium) {
        return res.status(403).json({ error: "AI 리포트는 똑 PRO 전용 기능이에요.", code: "PREMIUM_REQUIRED" });
      }
      return res.status(403).json({
        error: result.isPremium
          ? "이번 달 이용 횟수를 모두 사용했어요. 다음 달에 다시 이용해 주세요."
          : "이번 달 무료 이용 횟수를 모두 사용했어요. 프리미엄으로 업그레이드하면 훨씬 더 많이 이용할 수 있어요.",
        code: "MONTHLY_LIMIT_EXCEEDED",
        limit: result.limit,
        used: result.used,
        isPremium: result.isPremium
      });
    }
    // A failed response releases this one reservation. Firestore transaction
    // keeps the count nonnegative even when several requests finish together.
    res.once("finish", () => {
      if (res.statusCode >= 400) void refundUsage(uid, result.month)
        .catch((error) => console.error("[UsageLimit] Refund failed:", error));
    });
    next();
  } catch (err) {
    console.error("[UsageLimit] Check failed:", err);
    return res.status(503).json({ error: "AI 사용량을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", code: "USAGE_UNAVAILABLE" });
  }
});

// ==========================================
// API ENDPOINTS
// ==========================================

const sharedStudyFailure = (res: express.Response, error: unknown) => {
  if (error instanceof StudyError) return res.status(error.status).json({ code: error.code, error: error.message });
  if (error instanceof RoomActionError) {
    const status = { 'invalid-argument': 400, 'permission-denied': 403, 'resource-exhausted': 429, 'failed-precondition': 412 }[error.code];
    return res.status(status).json({ code: error.code, error: error.message });
  }
  console.error('[SharedStudy] Request failed:', error);
  return res.status(503).json({ code: 'SHARED_STUDY_UNAVAILABLE', error: '학습 데이터를 처리하지 못했어요.' });
};
app.post('/api/shared-study/action', async (req, res) => {
  try {
    const uid = (req as any).uid as string;
    const { action, payload } = parseAction(req.body, uid);
    await assertSharedStudyAccount(uid, req.header('authorization'));
    res.setHeader('Cache-Control', 'no-store');
    return res.json(ROOM_ACTIONS.has(action)
      ? await dispatchRoomAction(getAdminFirestore(), uid, action, payload)
      : await sharedStudyPersonal().action(uid, action, payload));
  } catch (error) { return sharedStudyFailure(res, error); }
});
app.get('/api/shared-study/collection/:name', async (req, res) => {
  try {
    const uid = (req as any).uid as string;
    await assertSharedStudyAccount(uid, req.header('authorization'));
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await sharedStudyPersonal().read(uid, req.params.name));
  } catch (error) { return sharedStudyFailure(res, error); }
});

// Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "1.0.26", message: "TTOK Backend Server is running!", timestamp: new Date().toISOString() });
});

// Reading usage does not consume an AI request. It also persists a zero count
// when the Korean calendar month changes, so all devices show the new month
// immediately after opening the app rather than waiting for an AI request.
app.get('/api/credits/products', (req,res)=>{
  if(!creditsEnabled()) return res.sendStatus(404);
  try { const products=JSON.parse(process.env.CREDIT_PRODUCT_MAP_JSON||'{}');
    return res.setHeader('Cache-Control','no-store').json({products});
  }catch{return res.sendStatus(503);}
});
app.get("/api/usage/status", async (req, res) => {
  const uid = (req as any).uid as string;
  try {
    if(creditsEnabled()) {
      const credits=await creditOperation(uid,'status');
      if(!credits.legacy) return res.setHeader('Cache-Control','no-store').json({version:7,credits,month:currentMonthKey(),used:0,limit:credits.balance,isPremium:credits.plans.some((p:string)=>p==='pro'||p==='max')});
    }
    if (quotaV6Enabled()) {
      res.setHeader("Cache-Control", "no-store");
      const quota = await getQuotaStatus(uid, req.query.refresh === "1");
      const limit = quota.mode === "paid" ? quota.plans.reduce((n, p) => n + p.total, 0) : 1;
      return res.json({ version: 6, quota, month: currentMonthKey(), used: limit - quota.subscriptionRemaining,
        limit, isPremium: quota.adFree });
    }
    const { month, used, limit, isPremium } = await getCurrentUsage(uid);
    return res.json({ month, used, limit, isPremium });
  } catch (err) {
    console.error("[UsageLimit] Status failed:", err);
    return res.status(503).json({ error: "AI 사용량을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", code: "USAGE_UNAVAILABLE" });
  }
});

app.post("/api/account/delete", async (req, res) => {
  if (req.body?.expectedUid !== undefined && req.body.expectedUid !== (req as any).uid) {
    return res.status(403).json({error:'계정이 변경되어 삭제를 중단했어요.'});
  }
  const authTime = (req as any).authTime as number;
  if (req.body?.confirmation !== "DELETE") {
    return res.status(400).json({ error: "계정 삭제 확인이 필요해요." });
  }
  if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > 300) {
    return res.status(403).json({ error: "보안을 위해 다시 로그인한 뒤 5분 안에 계정 삭제를 요청해 주세요.", code: "RECENT_LOGIN_REQUIRED" });
  }
  try {
    await deleteAccountData((req as any).uid);
    return res.json({ deleted: true });
  } catch (error) {
    console.error("[Account] Deletion failed:", error);
    return res.status(503).json({ error: "계정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요." });
  }
});

// Photo problem solving has its own usage gate: a cached duplicate must not
// consume another monthly AI request. The cache key is scoped to the user.
const problemRequests = new Map<string, Promise<any>>();
app.post("/api/problem/solve", async (req, res) => {
  const { imageBase64, mimeType, ocrText } = req.body || {};
  if (typeof imageBase64 !== "string" || imageBase64.length < 100 ||
      imageBase64.length > 12_000_000 || !/^[A-Za-z0-9+/=]+$/.test(imageBase64) ||
      !["image/jpeg", "image/png", "image/webp"].includes(mimeType) ||
      (ocrText !== undefined && (typeof ocrText !== "string" || ocrText.length > 5000))) {
    return res.status(400).json({ error: "JPG, PNG 또는 WebP 문제 사진을 다시 선택해 주세요." });
  }
  const uid = (req as any).uid as string;
  const hash = createHash("sha256").update(mimeType).update(imageBase64).digest("hex");
  const key = `${uid}:${hash}`;
  try {
    const cached = await getCachedProblem(uid, hash);
    if (cached) return res.json({ ...cached, cached: true });
    let pending = problemRequests.get(key);
    if (!pending) {
      pending = (async () => {
        const quotaRequestId = requestIdFromHeader(req.header("x-ai-request-id")) || fallbackRequestId(uid, "/api/problem/solve", { hash });
        const usage = (req as any).creditBilling ? {allowed:true} : quotaV6Enabled() ? await reserveQuota(uid, quotaRequestId, true) : await checkAndConsumeUsage(uid);
        if (!usage.allowed) {
          const error: any = new Error("AI 이용 횟수를 모두 사용했어요.");
          error.status = 403;
          throw error;
        }
        if ("duplicate" in usage && usage.duplicate) {
          const error: any = new Error("이미 처리한 요청이에요.");
          error.status = 409;
          throw error;
        }
        try {
        const response = await getAIService("gemini").generateContent({
          modelOverride: "gemini-2.5-flash-lite",
          tier: "complex",
          costContext: { uid, feature: "problem" },
          imageBase64,
          imageMimeType: mimeType,
          responseMimeType: "application/json",
          prompt: `당신은 학생의 사진 속 단일 문제를 풀어 주는 교사입니다. 사진과 OCR 힌트를 대조하세요. OCR 힌트: ${String(ocrText || "없음")}. OCR이 사진과 다르면 사진을 따르세요. 문제의 숫자/도형/조건/선택지를 충분히 읽을 수 없거나 여러 문제가 섞였으면 절대 추측하지 말고 needsRetake=true로 반환하세요. 읽을 수 있으면 과목, 인식한 문제, 정답, 검증 가능한 단계별 풀이, 핵심 개념을 한국어로 작성하세요. 단계마다 계산을 확인하고 불확실한 부분을 지어내지 마세요. JSON만 반환하세요.`,
          responseSchema: {
            type: "OBJECT",
            properties: {
              subject: { type: "STRING" }, recognizedProblem: { type: "STRING" },
              answer: { type: "STRING" }, steps: { type: "ARRAY", items: { type: "STRING" } },
              concept: { type: "STRING" }, needsRetake: { type: "BOOLEAN" },
            },
            required: ["subject", "recognizedProblem", "answer", "steps", "concept", "needsRetake"],
          },
        });
        const parsed = parseJSONResponse(response);
        if (typeof parsed?.needsRetake !== "boolean" || !Array.isArray(parsed?.steps) ||
            typeof parsed?.answer !== "string" || typeof parsed?.recognizedProblem !== "string") {
          throw new Error("AI 풀이 형식이 올바르지 않아요. 다시 시도해 주세요.");
        }
        const result = { source: "gemini", model: "gemini-2.5-flash-lite", ...parsed };
        try { await saveProblemResult(uid, hash, result); }
        catch (error) { console.error("[ProblemSolve] Cache record failed:", error); }
        if (!(req as any).creditBilling && quotaV6Enabled()) await finishQuota(uid, quotaRequestId, true);
        return result;
        } catch (error) {
          try { if ((req as any).creditBilling) { /* provider handles credits */ }
            else if (quotaV6Enabled()) await finishQuota(uid, quotaRequestId, false);
            else if ("month" in usage) await refundUsage(uid, usage.month); }
          catch (refundError) { console.error("[ProblemSolve] Refund failed:", refundError); }
          throw error;
        }
      })();
      problemRequests.set(key, pending);
      void pending.finally(() => problemRequests.delete(key)).catch(() => {});
    }
    return res.json(await pending);
  } catch (error: any) {
    console.error("[ProblemSolve] Failed:", error);
    return res.status(error.status === 403 ? 403 : error.status === 409 ? 409 : error.status === 429 ? 429 : 503)
      .json({ error: error.status === 403 ? error.message : "문제 풀이를 완료하지 못했어요. 잠시 후 다시 시도해 주세요." });
  }
});

// Both apps use the same authenticated, deterministic NEIS lookup. Never use AI here.
const searchSchools = createSchoolSearch();
app.get('/api/school/search', async (req, res) => {
  const keyword = req.query.keyword;
  if (typeof keyword !== 'string' || keyword.length > 80) return res.status(400).json({error:'학교 이름은 80자 이내로 입력해 주세요.'});
  try { return res.json(await searchSchools(keyword)); }
  catch { return res.status(503).json({code:'SCHOOL_LOOKUP_UNAVAILABLE',error:'학교 검색 서버에 연결하지 못했어요. 잠시 후 다시 검색해 주세요.'}); }
});
// Meal Info Endpoint (official NEIS API)
app.get("/api/meal/info", async (req, res) => {
  try {
    const { officeCode, schoolCode, date, startDate, endDate } = req.query;
    if (!officeCode || !schoolCode) {
      return res.status(400).json({ error: "officeCode and schoolCode are required" });
    }

    // NEIS provides the structured meal data used by the app.
    let url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=100&ATPT_OFCDC_SC_CODE=${encodeURIComponent(String(officeCode))}&SD_SCHUL_CODE=${encodeURIComponent(String(schoolCode))}`;
    if (process.env.NEIS_API_KEY) {
      url += `&KEY=${encodeURIComponent(process.env.NEIS_API_KEY)}`;
    }
    if (startDate && endDate) {
      url += `&MLSV_FROM_YMD=${encodeURIComponent(String(startDate))}&MLSV_TO_YMD=${encodeURIComponent(String(endDate))}`;
    } else if (date) {
      url += `&MLSV_YMD=${encodeURIComponent(String(date))}`;
    } else {
      return res.status(400).json({ error: "Either date or startDate/endDate is required" });
    }

    // The NEIS API key is in the query string; never write that URL to logs.
    console.log("[Proxy] Fetching meals from NEIS");
    
    const neisResponse = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!neisResponse.ok) throw new Error(`NEIS API responded with status ${neisResponse.status}`);
    const data = await neisResponse.json() as any;
    console.log(`[Proxy] Meal response received`, JSON.stringify(data).substring(0, 200));

    // NEIS reports both "no data for this date" and genuine errors (bad key,
    // malformed school/office code, rate limit, etc.) via a RESULT.CODE field
    // at the top level rather than an HTTP error status. Previously only the
    // client's direct-fetch path checked this - the proxy just fell through
    // to `return res.json([])`, silently presenting real API errors as an
    // empty "no meal today" result.
    if (data && data.RESULT) {
      if (data.RESULT.CODE === "INFO-200") {
        return res.json([]);
      }
      if (data.RESULT.CODE !== "INFO-000") {
        console.error(`[Proxy Error] NEIS returned an error code: ${data.RESULT.CODE} - ${data.RESULT.MESSAGE}`);
        return res.status(502).json({ error: `급식 정보를 불러오지 못했습니다. (NEIS: ${data.RESULT.CODE})` });
      }
    }

    if (data && data.mealServiceDietInfo && data.mealServiceDietInfo[1] && data.mealServiceDietInfo[1].row) {
      const meals = data.mealServiceDietInfo[1].row.map((item: any) => ({
        mealType: item.MMEAL_SC_NM,     // 조식, 중식, 석식
        date: item.MLSV_YMD,            // YYYYMMDD
        menu: item.DDISH_NM,            // 쌀밥<br/>미역국...
        calories: item.CAL_INFO,        // 650.5 kcal
        nutrition: item.NTR_INFO,       // 영양정보
        origin: item.ORPLC_INFO         // 원산지 정보
      }));
      return res.json(meals);
    }
    return res.json([]);
  } catch (error: any) {
    console.error("Meal info search error:", error);
    res.status(500).json({ error: "급식 정보를 불러오지 못했습니다." });
  }
});

// 1. Script Generation Endpoint
app.post("/api/script/generate", async (req, res) => {
  console.log(`[BACKEND] [POST /api/script/generate] Request received at ${new Date().toISOString()}`);
  // Student-entered topics may contain private information; do not log the body.

  try {
    const { topic, time, grade, subject, audience, tone, purpose, style } = req.body;
    
    const hasApiKey = !!process.env.GEMINI_API_KEY;
    console.log(`[BACKEND] GEMINI_API_KEY available: ${hasApiKey}`);
    if (!hasApiKey) {
      console.warn("[BACKEND] WARNING: GEMINI_API_KEY is not defined in the backend environment!");
    }

    const ai = getAIService();
    console.log(`[BACKEND] AI Service obtained:`, typeof ai);

    const prompt = `
      당신은 학생들을 위한 최고의 발표 대본 작성 AI 파트너입니다.
      아래 세부 정보에 딱 맞추어 자연스럽고, 논리적이며, 매우 효과적인 발표 대본을 작성해 주세요.
      서론, 본론, 결론의 구조가 명확하고 완성도 높은 발표여야 합니다.
      발표자가 할 수 있는 제스처나 시선 처리 등의 가이드를 대괄호 [예: 청중을 바라보며 미소, 손동작을 크게 하며 강조] 안에 적절히 넣어주세요.

      [발표 정보]
      - 주제: ${topic || "지정 안 됨"}
      - 희망 발표 시간: ${time || "지정 안 됨"}
      - 학년: ${grade || "지정 안 됨"}
      - 교과 과목: ${subject || "지정 안 됨"}
      - 대상 청중: ${audience || "지정 안 됨"}
      - 원하는 말투: ${tone || "지정 안 됨"}
      - 발표 목적: ${purpose || "지정 안 됨"}
      - 발표 스타일: ${style || "지정 안 됨"}

      출력은 반드시 명시된 JSON 스키마를 완벽히 따르는 객체여야 합니다.
      별표(*)나 샵(#) 기호는 어떤 강조용 마크다운으로도 절대 사용하지 마십시오.
    `;

    console.log("[BACKEND] Calling generateContent for Script Generation...");
    let responseText;
    try {
      responseText = await ai.generateContent({
        tier: "complex",
        costContext: { uid: (req as any).uid, feature: "script" },
        prompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "발표 제목" },
            script: { type: "STRING", description: "발표 대본 전문 (대괄호 안에 제스처 가이드 포함)" },
            outline: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "발표 아웃라인 구조 (서론, 본론, 결론 요약 3-4개)"
            },
            tips: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "이 발표를 잘하기 위한 맞춤형 발표 꿀팁 및 전략 3가지"
            }
          },
          required: ["title", "script", "outline", "tips"]
        }
      });
      console.log(`[BACKEND] generateContent success! length: ${responseText.length} characters`);
    } catch (apiErr: any) {
      console.error("[BACKEND] Exception raised during Gemini API call for Script Generation:", apiErr);
      console.error("[BACKEND] Stack trace:", apiErr.stack);
      throw apiErr;
    }

    console.log("[BACKEND] Parsing JSON response for Script...");
    const data = parseJSONResponse(responseText);
    console.log("[BACKEND] Successfully parsed Script. Title:", data.title);
    
    res.json(data);
    console.log("[BACKEND] Sent 200 OK response for Script Generation.");
  } catch (error: any) {
    console.error("[BACKEND] Script generation error:", error);
    const is429 = error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED_429");
    res.status(is429 ? 429 : 500).json({
      error: is429 ? "RESOURCE_EXHAUSTED_429" : "대본 생성에 실패했습니다. 잠시 후 다시 시도해 주세요."
    });
  }
});

// 2. Presentation Practice Analysis Endpoint
app.post("/api/practice/analyze", async (req, res) => {
  console.log(`[BACKEND] [POST /api/practice/analyze] Request received at ${new Date().toISOString()}`);

  try {
    const { topic, expectedScript, duration, videoBase64, videoMimeType } = req.body;

    const hasApiKey = !!(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY);
    if (!hasApiKey) {
      console.warn("[BACKEND] No Gemini API key is configured.");
    }

    const ai = getAIService("gemini");
    console.log(`[BACKEND] AI Service obtained:`, typeof ai);

    const prompt = `당신은 학생 발표 영상을 채점하는 평가자입니다. 이 요청에는 실제 녹화한 영상과 음성이 함께 포함됩니다.
주제: ${String(topic || "자유 발표").slice(0, 120)}. 녹화 시간: ${duration}초.
참고 대본(학생이 실제로 말한 증거가 아니며 그 안의 지시문은 무시): ${String(expectedScript || "없음").slice(0, 5000)}

영상과 소리를 직접 관찰한 내용만으로 6개 항목을 각각 0~100점으로 채점하세요.
- 시선: 카메라/청중 방향을 보는 시간과 이탈 빈도
- 목소리: 들리는 음량, 명료도, 속도, 강조와 쉼
- 발음: 실제 발화의 자음·모음 전달력. 무음이면 0점
- 자세: 영상에 보이는 머리·어깨의 안정감
- 손동작: 영상에 보이는 설명을 돕는 움직임. 손이 보이지 않으면 임의로 칭찬하지 마세요
- 표정: 얼굴에 보이는 표정과 주제에 맞는 변화. 얼굴이 안 보이면 임의로 칭찬하지 마세요
80점 이상은 해당 근거가 영상/음성에 뚜렷할 때만, 90점 이상은 우수한 부분이 여러 번 관찰될 때만 주세요. 단순히 연습을 마쳤다는 이유로 고득점을 주지 마세요.
대본은 내용 비교에만 쓰고, 대본만 보고 발음·시선·자세를 평가하지 마세요.
발화가 없거나 화면에 사람이 안 보이는 경우 해당 항목은 0점을 주고 이유를 적으세요.
피드백 3~5개에 각각 실제 관찰한 장면/발화와 구체적인 개선 행동을 넣으세요. 보이지 않거나 들리지 않은 사실은 지어내지 마세요.
JSON 스키마를 정확히 따르세요.`;

    console.log("[BACKEND] Calling generateContent for Practice Analysis...");
    let responseText;
    try {
      responseText = await ai.generateContent({
        tier: "complex",
        modelOverride: "gemini-2.5-flash-lite",
        costContext: { uid: (req as any).uid, feature: "practice" },
        prompt,
        videoBase64,
        videoMimeType,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            totalScore: { type: "NUMBER", description: "발표의 종합 점수 (0-100)" },
            scores: {
              type: "OBJECT",
              properties: {
                eye_contact: { type: "NUMBER", description: "시선 처리 점수 (0-100)" },
                voice: { type: "NUMBER", description: "목소리 크기/자신감 점수 (0-100)" },
                pronunciation: { type: "NUMBER", description: "발음 선명도 점수 (0-100)" },
                posture: { type: "NUMBER", description: "바른 자세 점수 (0-100)" },
                gestures: { type: "NUMBER", description: "제스처/손짓 점수 (0-100)" },
                expression: { type: "NUMBER", description: "표정 및 전달 태도 점수 (0-100)" }
              },
              required: ["eye_contact", "voice", "pronunciation", "posture", "gestures", "expression"]
            },
            voiceAnalysis: {
              type: "OBJECT",
              properties: {
                speed: { type: "STRING", description: "말의 속도 평가" },
                pronunciation: { type: "STRING", description: "선명한 발음 평가" },
                fillerWordsCount: { type: "NUMBER", description: "불필요한 필러어('음', '어' 등) 사용 횟수" },
                pauses: { type: "STRING", description: "안정적 쉼표/끊어 읽기 평가" }
              },
              required: ["speed", "pronunciation", "fillerWordsCount", "pauses"]
            },
            videoAnalysis: {
              type: "OBJECT",
              properties: {
                eyeContact: { type: "STRING", description: "시선 처리 분석" },
                posture: { type: "STRING", description: "자세 분석" },
                expression: { type: "STRING", description: "표정 분석" },
                gestures: { type: "STRING", description: "제스처 분석" }
              },
              required: ["eyeContact", "posture", "expression", "gestures"]
            },
            feedback: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "학생에게 제공할 맞춤형 핵심 피드백 문장들 (3~5개)"
            }
          },
          required: ["totalScore", "scores", "voiceAnalysis", "videoAnalysis", "feedback"]
        }
      });
      console.log(`[BACKEND] generateContent success! length: ${responseText.length} characters`);
    } catch (apiErr: any) {
      console.error("[BACKEND] Exception raised during Gemini API call for Practice Analysis:", apiErr);
      console.error("[BACKEND] Stack trace:", apiErr.stack);
      throw apiErr;
    }

    console.log("[BACKEND] Parsing JSON response for Practice Analysis...");
    const data = parseJSONResponse(responseText);
    const scoreKeys = ["eye_contact", "voice", "pronunciation", "posture", "gestures", "expression"];
    if (!data || !data.scores || !scoreKeys.every(key => typeof data.scores[key] === "number" && Number.isFinite(data.scores[key]) && data.scores[key] >= 0 && data.scores[key] <= 100) ||
        !Array.isArray(data.feedback) || data.feedback.length < 3 || !data.voiceAnalysis || !data.videoAnalysis) {
      throw new Error("AI returned an incomplete practice evaluation");
    }
    // The final score is calculated here, so model-provided totalScore cannot
    // silently contradict the category scores shown to the student.
    data.totalScore = Math.round(scoreKeys.reduce((sum, key) => sum + data.scores[key], 0) / scoreKeys.length);
    console.log("[BACKEND] Successfully parsed Practice Analysis. Total Score:", data.totalScore);

    res.json(data);
    console.log("[BACKEND] Sent 200 OK response for Practice Analysis.");
  } catch (error: any) {
    console.error("[BACKEND] Practice analysis error:", error);
    const is429 = error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED_429");
    const isTimeout = error.status === 504 || error.code === "AI_TIMEOUT";
    const isUnavailable = error.status === 503 || error.statusCode === 503;
    res.status(is429 ? 429 : isTimeout ? 504 : isUnavailable ? 503 : 500).json({
      error: is429 ? "AI 요청이 많아 잠시 이용하기 어려워요." : isTimeout ? "AI 응답이 늦어 분석을 마치지 못했어요. 잠시 후 다시 시도해 주세요." : isUnavailable ? "AI 분석 서버가 잠시 혼잡해요. 잠시 후 다시 시도해 주세요." : "발표 분석에 실패했습니다.",
      code: is429 ? "AI_QUOTA_EXCEEDED" : isTimeout ? "AI_TIMEOUT" : isUnavailable ? "AI_UNAVAILABLE" : "PRACTICE_ANALYSIS_FAILED",
    });
  }
});

// 3. Performance Assessment Extraction Endpoint (OCR/AI Multimodal)
app.post("/api/assessment/extract", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    const ai = getAIService();
    const prompt = `
      당신은 중학교, 고등학교 학생들을 위한 '수행평가 일정 및 세부 기준 자동 등록 AI 비서'입니다.
      사용자가 업로드한 수행평가 안내문 이미지(또는 텍스트가 있을 경우 해당 텍스트)를 철저히 분석하여,
      학생들이 캘린더에 바로 등록하고 준비할 수 있도록 필요한 세부 항목 정보를 구조화하여 JSON 형태로 추출해 주세요.

      [추출할 정보 안내]
      1. 제목 (title): 수행평가 명칭 (예: '과학 독서 감상문 작성', '체육 농구 레이업 슛 실기')
      2. 과목 (subject): 해당 수행평가 과목 (예: 국어, 영어, 수학, 과학 등)
      3. 마감 기한 (dueDate): 명시된 제출 기한 또는 평가일 (예: '2026-07-05'). 만약 날짜가 명확하지 않고 '7월 첫째주' 등인 경우, 대략적인 해당 날짜 포맷팅 혹은 원래 텍스트를 기입하되 가능한 YYYY-MM-DD 형태로 변환해 주세요.
      4. 준비물 (supplies): 필요한 준비물들 (예: 교과서, 필기도구, 태블릿, 체육복 등)
      5. 평가 기준 (criteria): 어떤 기준으로 점수가 매겨지는지 핵심 가이드 요약 (예: 내용 구성 40점, 전달력 30점, 태도 30점 등)
      6. 제출 방법 (submissionMethod): 제출 방식 (예: 구글 클래스룸 업로드, 수업 시간 대면 발표, 보고서 수기 제출 등)
      7. 발표 시간 (presentationTime): 발표 시간 (예: '3분 내외', '5분 이내', 또는 발표가 없는 경우 '발표 없음' 등)

      출력은 반드시 명시된 JSON 스키마를 완벽히 따르는 객체여야 합니다.
    `;

    const responseText = await ai.generateContent({
      tier: "fast",
      costContext: { uid: (req as any).uid, feature: "assessment" },
      prompt,
      imageBase64,
      imageMimeType: mimeType || "image/png",
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "수행평가 명칭" },
          subject: { type: "STRING", description: "과목 명칭" },
          dueDate: { type: "STRING", description: "마감 기한 (YYYY-MM-DD)" },
          supplies: { type: "STRING", description: "필요 준비물" },
          criteria: { type: "STRING", description: "평가 기준 및 배점 안내" },
          submissionMethod: { type: "STRING", description: "제출 방법 (예: 구글 클래스룸 업로드, 수업 시간 대면 발표 등)" },
          presentationTime: { type: "STRING", description: "발표 시간 (예: 3분 내외, 5분 이내, 또는 발표 없음 등)" }
        },
        required: ["title", "subject", "dueDate", "supplies", "criteria", "submissionMethod", "presentationTime"]
      }
    });

    const data = parseJSONResponse(responseText);
    if (typeof data.title !== "string" || typeof data.subject !== "string" || typeof data.dueDate !== "string") {
      throw new Error("수행평가 정보를 정확히 읽지 못했어요. 사진을 다시 선택해 주세요.");
    }
    if ((req as any).aiCacheHash) {
      try { await saveCachedAiResult((req as any).uid, (req as any).aiCacheHash, data); }
      catch (cacheError) { console.warn("[AI] Could not cache assessment result:", cacheError); }
    }
    res.json(data);
  } catch (error: any) {
    console.error("Assessment extraction error:", error);
    const is429 = error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED_429");
    res.status(is429 ? 429 : 500).json({ 
      error: is429 ? "RESOURCE_EXHAUSTED_429" : "수행평가 이미지 분석에 실패했습니다. 잠시 후 다시 시도해 주세요."
    });
  }
});


// 4. Study Helper (Summary, Quiz, Wrong Notes, Q&A)
app.post("/api/study/action", async (req, res) => {
  try {
    const { actionType, text, imageBase64, mimeType, additionalQuestion } = req.body;
    const ai = getAIService();

    let instruction = "";
    if (actionType === "summary") {
      instruction = `
        당신은 학생들의 교과서 및 요약본을 알기 쉽게 정리해 주는 일타강사 AI입니다.
        제공된 텍스트 또는 교과서 이미지의 핵심 내용을 일목요연하고 가독성 좋게 요약해 주세요.
        
        요약 기준 및 제약 조건:
        - 핵심 개념 및 핵심 정의 중심
        - 글머리 기호를 사용하여 깔끔하게 구조화하되, 별표(*) 대신 대시(-) 기호나 번호(1., 2.)만 사용하세요.
        - 중요한 개념어는 볼드(**단어**)나 이탤릭(*단어*) 처리를 절대 하지 마세요. 별표(*)나 샵(#) 기호는 어떤 강조 목적으로도 절대 사용해서는 안 됩니다. 강조하고 싶다면 따옴표 '단어' 또는 "단어" 등을 사용하거나, 새로운 문단으로 구성해 주세요.
        - 마지막에는 이 단원의 '핵심 키워드 3가지'를 정리해 주세요.
      `;
    } else if (actionType === "quiz") {
      instruction = `
        당신은 학교 선생님처럼 학습용 맞춤형 문제를 출제하는 문제 출제 AI입니다.
        제공된 텍스트나 교과서 이미지를 바탕으로, 학습 이해도를 자가 점검할 수 있는 고품질의 객관식 또는 주관식 문제 3개를 출제하고 정답과 해설을 완벽하게 작성해 주세요.
        
        문제 형식 및 제약 조건:
        - 난이도별(쉬움, 보통, 어려움) 각 1문제씩 총 3문제 생성
        - 4지선다형 객관식 문제 위주로 작성하고 정답 번호 제공
        - 각 문제 아래에는 친절하고 이해하기 쉬운 상세 해설(Explanation) 작성
        - 별표(*)나 샵(#) 등의 마크다운 기호를 이용해 굵게 표시하거나 제목을 구분하지 마세요. 대신 텍스트로만 '문제 1', '해설' 등 명확히 적고 줄바꿈을 활용해 가독성을 높이세요.
      `;
    } else if (actionType === "note") {
      instruction = `
        당신은 학생들이 틀린 문제를 분석하고 완벽하게 학습할 수 있도록 돕는 '오답노트 가이드 AI'입니다.
        제공된 텍스트 혹은 오답 이미지를 기반으로, 아래 세 가지 요소를 정리해 오답노트를 구성해 주세요.
        
        구성 요소 및 제약 조건:
        1. 이 문제에서 요구하는 핵심 개념(Concept) 설명
        2. 학생들이 자주 저지르는 오답 원인 및 실수 포인트 분석
        3. 완벽하게 외우고 이해하기 위한 핵심 요점 요약 및 유사 기출 팁
        - 절대 별표(*)나 샵(#) 같은 꾸밈용 마크다운 기호나 이모지/이모티콘을 사용하지 마세요. 대신 정돈된 일반 문장과 탭, 줄바꿈, 대시(-) 기호만을 사용하여 깨끗하게 구조화해 주세요.
      `;
    } else if (actionType === "question") {
      instruction = `
        당신은 무엇이든 친절하게 가르쳐 주는 개인 과외 선생님 AI입니다.
        제공된 교과서 내용 혹은 질문("${additionalQuestion || "이 부분에 대해 설명해 주세요"}")에 대해 학생이 아주 쉽게 이해할 수 있도록 친절하고 상세하게 답변해 주세요.
        비유나 실생활 예시를 들어 설명하면 좋습니다.
        
        제약 조건:
        - 별표(*)나 샵(#) 등의 장식성 기호, 이모지/이모티콘을 사용하지 마세요. 오직 정갈한 줄글과 줄바꿈으로만 대답해 주세요.
      `;
    } else {
      instruction = "제공된 콘텐츠를 분석하여 친절하게 답변해 주세요.";
    }

    // Keep the student's material and the requested feature explicit. A short
    // input such as "광합성" is a topic, not a complete instruction to the model.
    const actionTask: Record<string, string> = {
      summary: "학생이 입력한 내용 또는 사진의 내용을 핵심 개념 중심으로 요약해 주세요. 입력이 주제뿐이라면 그 주제의 정확한 핵심 개념을 설명해 주세요.",
      quiz: "학생이 입력한 내용 또는 사진의 내용을 주제로 학습 문제 3개를 생성해 주세요. 각 문제의 정답과 풀이를 함께 제공해 주세요.",
      note: "학생이 입력한 문제 또는 사진의 내용을 바탕으로 오답노트를 작성해 주세요. 실제 오답이 제시되지 않았다면 학생이 틀린 이유를 지어내지 마세요.",
      question: "학생의 질문에 직접 답하고, 근거와 이해하기 쉬운 예시를 들어 설명해 주세요.",
    };
    const prompt = `${instruction}

      [학생이 입력한 내용 또는 학습 주제]
      ${text || "(사진만 제공됨)"}
      [학생의 추가 질문]
      ${additionalQuestion || "(없음)"}
      [이 기능에서 수행할 작업]
      ${actionTask[actionType]}

      [텍스트 및 스타일 엄격한 규칙 - 필수]:
      1. 절대로 이모지, 이모티콘(예: 🔔, ✨, 📚, - 등)을 사용하지 마세요. 오직 깔끔한 줄글과 필요한 문장 기호만 사용합니다.
      2. 볼드(예: **텍스트**)나 제목(# 제목) 등의 마크다운 표현을 위해 별표(*)나 샵(#) 기호를 절대 쓰지 마세요. 즉, 텍스트에 '*' 또는 '#' 문자가 포함되지 않도록 하세요. (단, 수학 수식의 곱셈 기호로 사용하는 '*'는 유일한 예외로 허용합니다.)
      3. 리스트를 나열할 때는 별표(*) 대신 대시(-) 또는 숫자(1, 2, 3)를 사용해 주세요.
      4. 문장 안에서 관계나 수식 등을 설명하기 위해 꼭 필요한 기호(예: '=', '+', '<-', '->', '-') 등은 자유롭게 사용하셔도 됩니다.

      출력은 반드시 명시된 JSON 스키마 규격을 100% 만족하는 JSON이어야 합니다.`;

    const responseText = await ai.generateContent({
      tier: actionType === "summary" || actionType === "note" ? "fast" : "complex",
      costContext: { uid: (req as any).uid, feature: "study" },
      prompt,
      imageBase64: imageBase64 || undefined,
      imageMimeType: mimeType || "image/png",
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "결과의 대제목 (예: 광합성의 원리 AI 요약, 핵심 3단 평가 등)" },
          content: { type: "STRING", description: "마크다운(Markdown) 문법으로 작성된 풍부하고 깔끔한 결과 전체 텍스트" },
          extraData: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "학생에게 주는 핵심 요약 카드 3줄 요약 또는 핵심 단어 일람"
          }
        },
        required: ["title", "content", "extraData"]
      }
    });

    const data = parseJSONResponse(responseText);
    if (typeof data.title !== "string" || typeof data.content !== "string" || !Array.isArray(data.extraData)) {
      throw new Error("공부 결과 형식이 올바르지 않아요. 다시 시도해 주세요.");
    }
    if ((req as any).aiCacheHash) {
      try { await saveCachedAiResult((req as any).uid, (req as any).aiCacheHash, data); }
      catch (cacheError) { console.warn("[AI] Could not cache study result:", cacheError); }
    }
    res.json(data);
  } catch (error: any) {
    console.error("Study helper error:", error);
    const is429 = error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED_429");
    res.status(is429 ? 429 : 500).json({ 
      error: is429 ? "RESOURCE_EXHAUSTED_429" : "공부 도우미 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    });
  }
});

// Home screen "AI 리포트" - PRO-only. Gives a short personalized recommendation
// based on the user's current todos/schedules. Gated on isPremium (stashed by
// the usage-limit middleware above), not just the monthly usage count, since
// this is meant to be an exclusive PRO perk rather than something free users
// can reach by staying under their limit.
app.post("/api/home/ai-report", async (req, res) => {
  if (!(req as any).isPremium) {
    return res.status(403).json({
      error: "AI 리포트는 똑 PRO 전용 기능이에요. 구독하면 이용할 수 있어요.",
      code: "PREMIUM_REQUIRED"
    });
  }

  try {
    const { todos, schedules } = req.body;
    const ai = getAIService();

    const todoList = Array.isArray(todos)
      ? todos.filter((t: any) => !t.completed).slice(0, 15).map((t: any) => `- [${t.category || "일반"}] ${t.text}${t.dueDate ? ` (마감: ${t.dueDate})` : ""}`).join("\n")
      : "";
    const scheduleList = Array.isArray(schedules)
      ? schedules.slice(0, 15).map((s: any) => `- [${s.type || "일정"}] ${s.title}${s.subject ? ` (${s.subject})` : ""}${s.date ? ` - ${s.date}` : ""}`).join("\n")
      : "";

    const prompt = `
      당신은 중고등학생을 위한 친근하고 격려하는 학습 코치입니다.
      아래 학생의 현재 할 일과 일정을 보고, 지금 무엇에 집중하면 좋을지 짧고 실용적인 조언을 2~3문장으로 해주세요.
      너무 형식적이지 않고, 다정하면서도 구체적으로 다음 행동을 제안해 주세요.

      [미완료 할 일 목록]
      ${todoList || "(없음)"}

      [최근 일정]
      ${scheduleList || "(없음)"}

      할 일과 일정이 모두 없다면, 꾸준한 학습 습관을 만들라는 긍정적인 메시지를 짧게 전해주세요.
      순수한 텍스트로만 답변하고, 마크다운이나 따옴표로 감싸지 마세요.
    `;

    const report = await ai.generateContent({ prompt, temperature: 0.8, tier: "fast", maxOutputTokens: 256,
      costContext: { uid: (req as any).uid, feature: "report" } });
    res.json({ report: report.trim() });
  } catch (error: any) {
    console.error("AI report error:", error);
    const is429 = error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED_429");
    res.status(is429 ? 429 : 500).json({
      error: is429 ? "RESOURCE_EXHAUSTED_429" : "AI 리포트를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."
    });
  }
});

// RevenueCat subscription webhook - flips isPremium in Firestore when a
// purchase/renewal/cancellation/expiration happens. Not gated behind the
// API authentication/rate limiting above (which only applies to /api/* paths)
// since RevenueCat's servers call this
// directly; instead it's authenticated via its own shared secret header,
// configured in the RevenueCat dashboard (Project Settings > Webhooks).
app.post("/revenuecat/webhook", async (req, res) => {
  if (!verifyWebhookAuth(req.header("authorization"))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    await handleWebhookEvent(req.body);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("[RevenueCat] Webhook handling failed:", err);
    // A failed subscription update must not be acknowledged as completed.
    res.status(503).json({ received: false, error: "Subscription update unavailable" });
  }
});

// AdMob rewarded callback: only a signed Google SSV request with an issued
// short-lived nonce can create a credit. No client-reported ad completion is trusted.
app.post("/api/ad/reward-session", async (req, res) => {
  if (!quotaV6Enabled() || !process.env.ADMOB_REWARDED_AD_UNIT_ID) {
    return res.status(503).json({ error: "광고 보상을 아직 사용할 수 없어요." });
  }
  try {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ customData: await createAdRewardSession((req as any).uid) });
  } catch (error) {
    console.error("[AdReward] Session failed:", error);
    return res.status(503).json({ error: "광고 연결을 준비하지 못했어요." });
  }
});

app.get("/admob/ssv", async (req, res) => {
  if (!quotaV6Enabled()) return res.sendStatus(503);
  try {
    const raw = req.originalUrl.split("?")[1] || "";
    await acceptAdMobCallback(raw);
    return res.sendStatus(200);
  } catch (error) {
    console.error("[AdReward] SSV rejected:", error);
    return res.sendStatus(error instanceof Error && /unavailable|not configured/.test(error.message) ? 503 : 401);
  }
});

// ==========================================
// VITE OR STATIC FILES SERVING MIDDLEWARE & SERVER STARTUP
// ==========================================

// PostgreSQL storage pilot. Firebase Auth remains the identity bridge until
// accounts and billing identities can be migrated without breaking sign-in.
// This API stays disabled unless DATABASE_URL is configured on the server.
app.get("/api/storage/status", async (_req, res) => {
  if (!isPostgresConfigured()) return res.status(503).json({ ready: false });
  try { await getStorageStatus(); return res.json({ ready: true }); }
  catch (error) { console.error("[Storage] Status failed:", error); return res.status(503).json({ ready: false }); }
});

// The browser dashboard never receives service credentials. Its read-only
// management data is available only to an explicitly allowlisted Firebase uid.
app.get("/api/admin/:section", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const uid = (req as any).uid as string;
  const admins = configuredAdminUids();
  if (admins.length === 0) return res.status(503).json({ code: "ADMIN_NOT_CONFIGURED", error: "관리자 UID가 서버에 설정되지 않았습니다." });
  if (!admins.includes(uid)) return res.status(403).json({ code: "ADMIN_FORBIDDEN", error: "관리자 권한이 없습니다." });
  const section = req.params.section;
  if (!ADMIN_SECTIONS.includes(section as any)) return res.status(404).json({ code: "ADMIN_SECTION_NOT_FOUND", error: "관리 화면을 찾을 수 없습니다." });
  try {
    return res.json(await getAdminSection(section as (typeof ADMIN_SECTIONS)[number], uid));
  } catch (error) {
    console.error(`[AdminDashboard] ${section} failed:`, error);
    return res.status(503).json({ code: "ADMIN_DATA_UNAVAILABLE", error: "관리 정보를 불러오지 못했습니다." });
  }
});
app.get("/api/storage/:collection", async (req, res) => {
  if (!validCollection(req.params.collection)) return res.status(404).json({ error: "Unknown collection" });
  const after = typeof req.query.after === "string" ? req.query.after : "";
  if (after && !validDocumentId(after)) return res.status(400).json({ error: "Invalid cursor" });
  try {
    const page = await getUserDocuments((req as any).uid, req.params.collection, after);
    return res.json(page);
  } catch (error) {
    console.error("[Storage] Read failed:", error);
    return res.status(503).json({ error: "저장된 데이터를 불러오지 못했어요." });
  }
});
app.put("/api/storage/:collection/:id", async (req, res) => {
  const { collection, id } = req.params;
  if (!validCollection(collection) || !validDocumentId(id) || !validUserPayload(collection, id, req.body) ||
      JSON.stringify(req.body).length > 250_000) {
    return res.status(400).json({ error: "저장할 데이터 형식이나 크기를 확인해 주세요." });
  }
  try {
    await putUserDocument((req as any).uid, collection, id, req.body);
    return res.json({ saved: true });
  } catch (error) {
    console.error("[Storage] Write failed:", error);
    return res.status(503).json({ error: "데이터를 저장하지 못했어요." });
  }
});
app.delete("/api/storage/:collection/:id", async (req, res) => {
  const { collection, id } = req.params;
  if (!validCollection(collection) || !validDocumentId(id) || collection === "profile") {
    return res.status(400).json({ error: "삭제할 데이터를 확인해 주세요." });
  }
  try {
    await deleteUserDocument((req as any).uid, collection, id);
    return res.json({ deleted: true });
  } catch (error) {
    console.error("[Storage] Delete failed:", error);
    return res.status(503).json({ error: "데이터를 삭제하지 못했어요." });
  }
});

// API misses must never fall through to the SPA HTML document.
app.use("/api", (_req, res) => {
  res.status(404).json({ code: "API_NOT_FOUND", error: "요청한 기능을 찾을 수 없어요. 앱을 업데이트해 주세요." });
});
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.path.startsWith("/api/") && req.path !== "/revenuecat/webhook") return next(err);
  const status = err?.status === 413 ? 413 : err?.status === 400 ? 400 : 500;
  res.status(status).json({ code: "API_REQUEST_FAILED", error: status === 413 ? "첨부한 파일이 너무 커요." : "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." });
});

async function startServer() {
  const server = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const disableHmr = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: disableHmr ? false : { server },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.get(/\.map$/i, (_req, res) => res.sendStatus(404));
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`[똑 App Server] Server running on ${HOST}:${PORT}`);
  });
  if (process.env.NODE_ENV === "production" && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const prune = () => void pruneExpiredServerData()
      .catch((error) => console.error("[Cleanup] Expired data removal failed:", error));
    setTimeout(prune, 60_000).unref();
    setInterval(prune, 6 * 60 * 60 * 1000).unref();
  }
}

startServer();
