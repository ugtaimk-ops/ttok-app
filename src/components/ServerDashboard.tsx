import { useCallback, useEffect, useState } from "react";
import {
  Activity, ArrowRight, BrainCircuit, ChevronDown, CircleHelp,
  Clock3, Cloud, CreditCard, Database, ExternalLink, LayoutDashboard,
  Menu, Pencil, RefreshCw, School, Server, ShieldCheck, Users, X,
} from "lucide-react";
import { loadDraft } from "./DataVaultDesigner";
import AdminLivePanel from "./AdminLivePanel";
import "./ServerDashboard.css";

type Probe = { state: "loading" | "online" | "offline"; latency?: number; checkedAt?: Date };
type ServiceRow = { name: string; detail: string; state: "online" | "pending" | "unknown"; href?: string };

const PRODUCTION_URL = "https://ttok-backend.onrender.com";
const icons = [LayoutDashboard, Users, Database, BrainCircuit, CreditCard, School, Server, ShieldCheck];

function StatusPill({ state, children }: { state: "online" | "offline" | "pending" | "unknown" | "loading"; children: React.ReactNode }) {
  return <span className={`server-status server-status--${state}`}><span className="server-status-dot" />{children}</span>;
}

export default function ServerDashboard() {
  const [draft] = useState(loadDraft);
  const [selected, setSelected] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminBase, setAdminBase] = useState(PRODUCTION_URL);
  const [local, setLocal] = useState<Probe>({ state: "loading" });
  const [production, setProduction] = useState<Probe>({ state: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const checkHealth = useCallback(async (url: string, setProbe: (probe: Probe) => void) => {
    const started = performance.now();
    try {
      const response = await fetch(`${url}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("status" in data) || data.status !== "ok") throw new Error("Invalid health response");
      setProbe({ state: "online", latency: Math.round(performance.now() - started), checkedAt: new Date() });
    } catch {
      setProbe({ state: "offline", checkedAt: new Date() });
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      checkHealth(window.location.origin, setLocal),
      checkHealth(PRODUCTION_URL, setProduction),
    ]);
    setRefreshing(false);
  }, [checkHealth]);

  useEffect(() => { void refresh(); }, [refresh]);

  const pages = draft.pages;
  const page = pages.find(item => item.id === selected) || pages[0];
  const localLabel = local.state === "online" ? "정상 응답" : local.state === "loading" ? "확인 중" : "연결 실패";
  const productionLabel = production.state === "online" ? "정상 응답" : production.state === "loading" ? "확인 중" : "확인 불가";
  const lastChecked = production.checkedAt || local.checkedAt;

  const serviceRows: ServiceRow[] = [
    { name: "운영 API", detail: PRODUCTION_URL, state: production.state === "online" ? "online" : "unknown", href: `${PRODUCTION_URL}/api/health` },
    { name: "회원 인증", detail: "Firebase Authentication", state: "unknown" },
    { name: "데이터 저장소", detail: "Cloud Firestore · PostgreSQL 전환 전", state: "unknown" },
    { name: "AI 생성", detail: "Gemini · 실제 호출 상태는 여기서 검증하지 않음", state: "unknown" },
    { name: "구독 결제", detail: "RevenueCat · 상품과 웹훅은 별도 확인 필요", state: "unknown" },
  ];

  function choosePage(id: string) {
    setSelected(id);
    setMobileMenuOpen(false);
  }

  return <div className="server-console">
    <aside className={`server-sidebar ${mobileMenuOpen ? "server-sidebar--open" : ""}`}>
      <div className="server-brand"><div className="server-brand-mark">똑</div><div><strong>똑 서버</strong><small>운영 콘솔</small></div><button className="server-mobile-close" aria-label="메뉴 닫기" onClick={() => setMobileMenuOpen(false)}><X size={18} /></button></div>
      <div className="server-workspace"><span className="server-workspace-icon"><Cloud size={17} /></span><div><strong>TTOK Workspace</strong><small>서비스 관리</small></div><ChevronDown size={15} /></div>
      <div className="server-nav-label">워크스페이스</div>
      <nav aria-label="서버 관리 메뉴" className="server-nav">
        {pages.map((item, index) => {
          const Icon = icons[index % icons.length];
          return <button key={item.id} className={page?.id === item.id ? "server-nav-item server-nav-item--active" : "server-nav-item"} onClick={() => choosePage(item.id)}><Icon size={18} strokeWidth={1.9} /><span>{item.title}</span>{page?.id === item.id && <span className="server-nav-active-dot" />}</button>;
        })}
      </nav>
      <div className="server-sidebar-bottom"><div className="server-sidebar-note"><div className="server-sidebar-note-icon"><CircleHelp size={18} /></div><strong>서버 구성 현황</strong><p>현재 앱은 Render, Firebase, RevenueCat을 사용합니다. 자체 DB 전환은 아직 준비 단계입니다.</p></div><div className="server-sidebar-foot"><span className="server-admin-avatar">T</span><div><strong>똑 관리자 화면</strong><small>읽기 전용 상태 확인</small></div></div></div>
    </aside>

    <div className="server-main">
      <header className="server-topbar"><div className="server-topbar-left"><button className="server-menu-button" aria-label="메뉴 열기" onClick={() => setMobileMenuOpen(true)}><Menu size={21} /></button><span>Workspace</span><span className="server-breadcrumb-sep">/</span><strong>{page?.title}</strong></div><div className="server-topbar-actions"><span className="server-topbar-clock"><Clock3 size={15} />{lastChecked ? `${lastChecked.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 확인` : "상태 확인 중"}</span><button className="server-icon-button" aria-label="상태 새로 확인" title="상태 새로 확인" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={18} className={refreshing ? "server-spin" : ""} /></button><a className="server-edit-button" href="/server-design/edit"><Pencil size={15} />화면 편집</a></div></header>

      <main className="server-content">
        <div className="server-heading"><div><div className="server-eyebrow">TTOK CONTROL CENTER <span className="server-eyebrow-line" /></div><h1>{page?.title || "전체 현황"}</h1><p>{selected === "overview" ? "서비스 연결 상태와 운영 구성을 확인하세요." : page?.description}</p></div><button className="server-refresh-button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "server-spin" : ""} /> 상태 새로고침</button></div>
        <div className="server-backend-select"><span>관리 데이터 조회 서버</span><select aria-label="관리 데이터 조회 서버" value={adminBase} onChange={event => setAdminBase(event.target.value)}><option value={PRODUCTION_URL}>운영 서버 · Render</option><option value={window.location.origin}>이 컴퓨터의 서버</option></select><small>서버의 관리자 권한을 확인한 후 실제 데이터를 불러옵니다.</small></div>

        {selected === "overview" ? <>
          <div className="server-hero"><div className="server-hero-copy"><span className="server-hero-kicker"><Activity size={15} /> 서비스 현황</span><h2>똑 서비스 운영 현황</h2><p>서버 응답은 실시간 확인 결과입니다. 로그인·결제·AI 기능의 성공 여부는 별도로 확인해야 합니다.</p><div className="server-hero-meta"><StatusPill state={production.state}>{productionLabel}</StatusPill><span>운영 API {production.state === "online" ? `${production.latency}ms 응답` : "상태 확인 필요"}</span></div></div><div className="server-hero-graphic"><div className="server-orbit server-orbit--one" /><div className="server-orbit server-orbit--two" /><div className="server-hero-core"><Server size={34} /></div><i className="server-orbit-node server-orbit-node--a" /><i className="server-orbit-node server-orbit-node--b" /><i className="server-orbit-node server-orbit-node--c" /></div></div>

          <div className="server-stat-grid"><article className="server-stat-card"><div className="server-stat-icon server-stat-icon--blue"><Cloud size={20} /></div><div className="server-stat-label">운영 서버</div><div className="server-stat-value">{productionLabel}</div><div className="server-stat-foot">{production.state === "online" ? `응답 시간 ${production.latency}ms` : "Render API 상태"}</div></article><article className="server-stat-card"><div className="server-stat-icon server-stat-icon--violet"><Server size={20} /></div><div className="server-stat-label">이 컴퓨터의 서버</div><div className="server-stat-value">{localLabel}</div><div className="server-stat-foot">{local.state === "online" ? `응답 시간 ${local.latency}ms` : "현재 주소에서 확인"}</div></article><article className="server-stat-card"><div className="server-stat-icon server-stat-icon--teal"><Database size={20} /></div><div className="server-stat-label">현재 데이터 저장소</div><div className="server-stat-value">Firestore</div><div className="server-stat-foot">자체 DB 전환 준비 중</div></article><article className="server-stat-card"><div className="server-stat-icon server-stat-icon--amber"><ShieldCheck size={20} /></div><div className="server-stat-label">관리 정보</div><div className="server-stat-value">읽기 전용</div><div className="server-stat-foot">회원·결제 데이터 표시 안 함</div></article></div>

          <div className="server-two-column"><section className="server-panel"><div className="server-panel-head"><div><h2>서비스 연결</h2><p>앱을 구성하는 서비스와 확인 가능한 상태</p></div><span className="server-panel-count">{serviceRows.length}개 서비스</span></div><div className="server-service-table">{serviceRows.map((row, index) => { const Icon = [Cloud, Users, Database, BrainCircuit, CreditCard][index]; return <div className="server-service-row" key={row.name}><span className="server-service-icon"><Icon size={18} /></span><div className="server-service-info"><strong>{row.name}</strong><small>{row.detail}</small></div><StatusPill state={row.state}>{row.state === "online" ? "응답 확인" : "미검증"}</StatusPill>{row.href ? <a className="server-row-link" href={row.href} target="_blank" rel="noreferrer" aria-label={`${row.name} 상태 열기`}><ExternalLink size={16} /></a> : <span className="server-row-spacer" />}</div>; })}</div></section><section className="server-panel server-quick-panel"><div className="server-panel-head"><div><h2>빠른 이동</h2><p>서버 구성별 화면 바로가기</p></div></div><div className="server-quick-list">{pages.filter(item => item.id !== "overview").slice(0, 5).map((item, index) => { const Icon = icons[(index + 1) % icons.length]; return <button key={item.id} onClick={() => choosePage(item.id)}><span className="server-quick-icon"><Icon size={18} /></span><span>{item.title}</span><ArrowRight size={16} /></button>; })}</div></section></div>
        </> : null}
        <AdminLivePanel section={selected} baseUrl={adminBase} />
      </main>
    </div>
    {mobileMenuOpen && <button className="server-sidebar-backdrop" aria-label="메뉴 닫기" onClick={() => setMobileMenuOpen(false)} />}
  </div>;
}
