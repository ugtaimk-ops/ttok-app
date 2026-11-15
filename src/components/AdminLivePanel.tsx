import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { auth, onAuthStateChanged, signInWithEmailAndPassword, type User } from "../lib/firebase";

type AdminData = Record<string, any>;

const LABELS: Record<string, string> = {
  firebase: "Firebase 서비스 계정", gemini: "Gemini API", neis: "NEIS API",
  revenueCat: "RevenueCat 서버 API", revenueCatWebhook: "RevenueCat 웹훅", postgres: "PostgreSQL",
};

export default function AdminLivePanel({ section, baseUrl }: { section: string; baseUrl: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => onAuthStateChanged(auth, nextUser => { setUser(nextUser); setAuthReady(true); }), []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    setCode("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${baseUrl}/api/admin/${section}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json();
      if (!response.ok) {
        setCode(body.code || String(response.status));
        throw new Error(response.status === 401
          ? "로그인되어 있지만 서버가 인증 토큰을 확인하지 못했습니다. 서버의 Google 인증서 연결을 확인해 주세요."
          : typeof body.error === "string" ? body.error : "관리 정보를 불러오지 못했습니다.");
      }
      setData(body);
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "관리 서버에 연결하지 못했습니다.");
    } finally { setLoading(false); }
  }, [baseUrl, section, user]);

  useEffect(() => { setData(null); if (user) void load(); }, [user, load]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoginError("");
    try { await signInWithEmailAndPassword(auth, email.trim(), password); setPassword(""); }
    catch { setLoginError("로그인에 실패했습니다. 이메일·비밀번호와 이메일 인증 상태를 확인해 주세요."); }
  }

  return <section className="server-panel server-admin-panel">
    <div className="server-panel-head"><div><h2>실제 관리 데이터</h2><p>{baseUrl} · 관리자 인증 후 조회{user ? ` · 로그인 UID: ${user.uid}` : ""}</p></div><button className="server-admin-refresh" onClick={() => void load()} disabled={!user || loading}><RefreshCw size={15} className={loading ? "server-spin" : ""} /> 다시 조회</button></div>
    {!authReady ? <div className="server-admin-message">로그인 상태를 확인하는 중입니다.</div> : !user ? <div className="server-admin-login"><ShieldCheck size={25} /><div><h3>관리자 로그인</h3><p>똑 계정으로 로그인해 주세요. 관리 API는 서버에 등록된 UID만 허용합니다.</p></div><form onSubmit={event => void signIn(event)}><input type="email" aria-label="이메일" placeholder="이메일" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /><input type="password" aria-label="비밀번호" placeholder="비밀번호" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /><button type="submit">로그인</button></form>{loginError && <p className="server-admin-error">{loginError}</p>}</div> : loading && !data ? <div className="server-admin-message">관리 데이터를 불러오는 중입니다.</div> : error ? <div className="server-admin-message server-admin-message--error"><AlertCircle size={22} /><strong>{error}</strong>{code === "ADMIN_NOT_CONFIGURED" && <p>서버 환경변수 <code>DASHBOARD_ADMIN_UIDS</code>에 관리자 UID를 등록해야 합니다. 현재 로그인 UID: <code>{user.uid}</code></p>}{code === "ADMIN_FORBIDDEN" && <p>현재 로그인 UID: <code>{user.uid}</code>. 서버의 관리자 허용 목록을 확인해 주세요.</p>}{code === "API_NOT_FOUND" && <p>선택한 서버에는 관리 API가 아직 배포되지 않았습니다.</p>}</div> : data ? <div className="server-admin-data"><LiveSection data={data} /></div> : null}
  </section>;
}

function Flag({ value, yes = "연결됨", no = "설정 필요" }: { value: boolean; yes?: string; no?: string }) {
  return <span className={value ? "server-admin-flag server-admin-flag--yes" : "server-admin-flag server-admin-flag--no"}>{value ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}{value ? yes : no}</span>;
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="server-admin-data-row"><span>{label}</span><strong>{value}</strong></div>;
}

function ConfigList({ configured }: { configured: Record<string, boolean> }) {
  return <div className="server-admin-config-list">{Object.entries(LABELS).map(([key, label]) => <DataRow key={key} label={label} value={<Flag value={Boolean(configured[key])} />} />)}</div>;
}

function LiveSection({ data }: { data: AdminData }) {
  switch (data.section) {
    case "overview": return <><div className="server-admin-metrics"><div><small>전체 회원</small><strong>{data.users.toLocaleString()}명</strong></div><div><small>똑 PRO 회원</small><strong>{data.premiumUsers.toLocaleString()}명</strong></div><div><small>무료 회원</small><strong>{data.freeUsers.toLocaleString()}명</strong></div></div><h3>연동 설정</h3><ConfigList configured={data.configured} /></>;
    case "accounts": return <><p className="server-admin-note">회원 문서 최대 {data.limit}개를 UID 순서로 보여줍니다. Firebase Auth 계정 전체 목록과는 다를 수 있습니다.</p><div className="server-admin-table-wrap"><table className="server-admin-table"><thead><tr><th>이름</th><th>이메일</th><th>학교</th><th>요금제</th><th>이번 달 AI</th></tr></thead><tbody>{data.users.map((item: any) => <tr key={item.uid}><td>{item.name || "—"}<small>{item.uid}</small></td><td>{item.email || "—"}</td><td>{item.school || "—"}</td><td>{item.isPremium ? "똑 PRO" : "무료"}</td><td>{item.usage}회</td></tr>)}</tbody></table></div>{data.users.length === 0 && <p className="server-admin-note">저장된 회원 문서가 없습니다.</p>}</>;
    case "database": return <><DataRow label="현재 앱 저장소" value={<Flag value={data.firestoreReady} yes="Firestore 사용" />} /><DataRow label="PostgreSQL 설정" value={<Flag value={data.postgresConfigured} />} /><DataRow label="PostgreSQL 연결" value={<Flag value={data.postgresReady} yes="응답 확인" no="연결 안 됨" />} /><p className="server-admin-note">{data.note}</p></>;
    case "ai": return data.mode === "v6" ? <><div className="server-admin-metrics"><div><small>무료 한도</small><strong>하루 1회</strong></div><div><small>내 이용권 잔여</small><strong>{data.quota.subscriptionRemaining}회</strong></div><div><small>광고 보상 잔여</small><strong>{data.quota.rewardRemaining}회</strong></div></div><DataRow label="AI 제공자" value={data.provider} /><DataRow label="Gemini API 키" value={<Flag value={data.geminiConfigured} />} /><DataRow label="현재 요금제" value={data.quota.plans.length ? data.quota.plans.map((plan: any) => `${plan.planId} ${plan.remaining}/${plan.total}회`).join(", ") : "무료"} /><p className="server-admin-note">표시된 잔여량은 현재 로그인한 관리자 계정의 서버 조회 결과입니다.</p></> : <><div className="server-admin-metrics"><div><small>무료 월 한도</small><strong>{data.freeLimit}회</strong></div><div><small>PRO 월 한도</small><strong>{data.premiumLimit}회</strong></div><div><small>이번 달 AI 사용자</small><strong>{data.activeUsers}명</strong></div></div><DataRow label="AI 제공자" value={data.provider} /><DataRow label="Gemini API 키" value={<Flag value={data.geminiConfigured} />} /><DataRow label="내 계정 이번 달 사용량" value={`${data.adminUsage.used}/${data.adminUsage.limit}회`} /><p className="server-admin-note">AI 모델 호출 테스트는 비용이 발생하므로 이 화면에서는 키 설정 여부만 확인합니다.</p></>;
    case "billing": return <><DataRow label="RevenueCat 서버 API" value={<Flag value={data.revenueCatConfigured} />} /><DataRow label="결제 웹훅 비밀값" value={<Flag value={data.webhookConfigured} />} /><DataRow label="새 요금제 서버 적용" value={<Flag value={data.monetizationV6Enabled} yes="적용 중" no="미적용" />} /><DataRow label="앱의 새 상품 묶음" value={data.offeringId} /><DataRow label="Pro 구독 권한 ID" value={data.entitlementId} /><DataRow label="내 Pro 구독 조회" value={data.subscriberError || (data.subscriber?.connected ? (data.subscriber.active ? "활성" : "비활성") : "키 설정 필요")} /><p className="server-admin-note">이 화면의 구독 조회는 Pro 권한만 표시합니다. Basic·Plus 이용권은 AI 메뉴에서 확인하세요.</p><p className="server-admin-note">{data.note}</p><a className="server-admin-external" href="https://app.revenuecat.com/" target="_blank" rel="noreferrer">RevenueCat 열기 <ExternalLink size={14} /></a></>;
    case "school": return <><DataRow label="NEIS API 키" value={<Flag value={data.neisKeyConfigured} />} /><DataRow label="NEIS 학교 검색" value={<Flag value={data.probe?.connected} yes="응답 확인" no="확인 필요" />} /><p className="server-admin-note">{data.probe?.status}</p><div className="server-admin-code-list">{data.routes.map((route: string) => <code key={route}>{route}</code>)}</div></>;
    case "api": return <><p className="server-admin-note">실제 서버에 구현된 API 경로입니다. 인증이 필요한 기능은 Firebase 로그인 토큰을 사용합니다.</p><div className="server-admin-table-wrap"><table className="server-admin-table"><thead><tr><th>메서드</th><th>경로</th><th>접근</th></tr></thead><tbody>{data.routes.map((route: any) => <tr key={route.path}><td>{route.method}</td><td><code>{route.path}</code></td><td>{route.auth ? "인증 필요" : "공개"}</td></tr>)}</tbody></table></div></>;
    case "security": return <><DataRow label="관리자 UID 허용 목록" value={<Flag value={data.adminAllowlistConfigured} />} /><div className="server-admin-config-list"><ConfigList configured={data.configured} /></div><div className="server-admin-code-list">{data.rules.map((rule: string) => <span key={rule}><CheckCircle2 size={14} />{rule}</span>)}</div></>;
    default: return <p className="server-admin-note">조회할 관리 데이터가 없습니다.</p>;
  }
}
