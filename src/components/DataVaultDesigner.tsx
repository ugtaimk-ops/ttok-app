import { useEffect, useState } from "react";

export type Box = { id: string; title: string; body: string; button: string };
export type Page = { id: string; title: string; description: string; boxes: Box[] };
export type Draft = { title: string; subtitle: string; accent: string; background: string; layout: "side" | "top"; pages: Page[] };
const STORAGE_KEY = "ttok-full-server-design-v1";
const box = (id: string, title: string, body: string, button: string): Box => ({ id, title, body, button });
const DEFAULT_DRAFT: Draft = {
  title: "똑 운영 서버", subtitle: "똑 앱의 모든 기능을 한곳에서 관리합니다.", accent: "#2369e8", background: "#f2f6fb", layout: "side",
  pages: [
    { id: "overview", title: "전체 현황", description: "운영에 필요한 상태를 한눈에 확인합니다.", boxes: [box("health", "서버 상태", "API 연결 상태가 표시될 자리입니다.", "상태 보기"), box("activity", "서비스 이용", "회원과 기능 이용 현황이 표시될 자리입니다.", "현황 보기")] },
    { id: "accounts", title: "회원·로그인", description: "계정, 이메일 인증, 로그인 방식을 관리합니다.", boxes: [box("users", "회원 목록", "계정 검색 및 상태 확인 영역입니다.", "회원 보기"), box("login", "로그인 방식", "이메일·Google·Apple 로그인 설정 영역입니다.", "설정 보기")] },
    { id: "database", title: "데이터베이스", description: "프로필, 일정, 할 일, 대본, 발표 기록을 관리합니다.", boxes: [box("records", "저장된 자료", "권한에 맞게 사용자 자료를 조회할 자리입니다.", "자료 보기"), box("migration", "데이터 이전", "Firebase에서 자체 DB로 옮기는 진행 상태입니다.", "이전 보기")] },
    { id: "ai", title: "AI·사용량", description: "Gemini 연동과 월별 사용량, 예상 비용을 확인합니다.", boxes: [box("quota", "월별 AI 사용량", "무료·PRO 사용량 및 한도 현황입니다.", "사용량 보기"), box("models", "AI 서비스", "모델 상태와 오류를 확인할 자리입니다.", "AI 상태 보기")] },
    { id: "billing", title: "똑 PRO·결제", description: "구독 상품과 결제 동기화 상태를 관리합니다.", boxes: [box("plans", "구독 상품", "월간·연간 상품과 혜택을 확인합니다.", "상품 보기"), box("webhook", "결제 연동", "RevenueCat 웹훅 상태를 확인합니다.", "연동 보기")] },
    { id: "school", title: "학교·급식", description: "학교 검색과 NEIS 급식 정보 연결 상태를 확인합니다.", boxes: [box("search", "학교 검색", "검색 API 상태를 확인합니다.", "검색 보기"), box("meal", "급식 정보", "급식 데이터 상태를 확인합니다.", "급식 보기")] },
    { id: "api", title: "API·서버", description: "앱의 기능별 API와 오류를 살펴봅니다.", boxes: [box("endpoints", "기능별 API", "발표 분석, 문제 풀이, 대본 생성 등의 요청 상태입니다.", "API 보기"), box("errors", "오류 기록", "오류 발생 시각과 원인을 확인합니다.", "오류 보기")] },
    { id: "security", title: "보안·백업", description: "관리자 접근 권한과 데이터 복구를 관리합니다.", boxes: [box("access", "접근 권한", "학생 자료에 접근할 수 있는 계정을 제한합니다.", "권한 보기"), box("backup", "백업·복원", "정기 백업과 복원 테스트를 확인합니다.", "백업 보기")] },
  ],
};
export function loadDraft(): Draft {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (value && typeof value.title === "string" && Array.isArray(value.pages) && value.pages.every((page: Page) => Array.isArray(page.boxes))) return value;
  } catch { /* A damaged draft uses the default. */ }
  return DEFAULT_DRAFT;
}

export default function DataVaultDesigner() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [pageId, setPageId] = useState(draft.pages[0]?.id || "");
  const [boxId, setBoxId] = useState("");
  const [mobile, setMobile] = useState(false);
  const [previewOnly, setPreviewOnly] = useState(false);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); }, [draft]);
  const page = draft.pages.find(item => item.id === pageId) || draft.pages[0];
  const selectedBox = page?.boxes.find(item => item.id === boxId);

  function updatePage(change: Partial<Page>) {
    if (!page) return;
    setDraft(current => ({ ...current, pages: current.pages.map(item => item.id === page.id ? { ...item, ...change } : item) }));
  }
  function updateBox(change: Partial<Box>) {
    if (!page || !selectedBox) return;
    updatePage({ boxes: page.boxes.map(item => item.id === boxId ? { ...item, ...change } : item) });
  }
  function movePage(index: number, delta: number) {
    const pages = [...draft.pages];
    const destination = index + delta;
    if (destination < 0 || destination >= pages.length) return;
    [pages[index], pages[destination]] = [pages[destination], pages[index]];
    setDraft(current => ({ ...current, pages }));
  }
  function addPage() {
    const next: Page = { id: crypto.randomUUID(), title: "새 서버 기능", description: "설명을 적어 주세요.", boxes: [] };
    setDraft(current => ({ ...current, pages: [...current.pages, next] }));
    setPageId(next.id);
    setBoxId("");
  }
  function addBox() {
    if (!page) return;
    const next = box(crypto.randomUUID(), "새 기능 박스", "넣고 싶은 내용을 적어 주세요.", "자세히 보기");
    updatePage({ boxes: [...page.boxes, next] });
    setBoxId(next.id);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ttok-full-server-design.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main style={{ minHeight: "100vh", background: "#eaf0f8", color: "#1d2c43", padding: 16, fontFamily: "system-ui, sans-serif" }}>
    <div style={{ maxWidth: 1600, margin: "auto" }}>
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div><h1 style={{ margin: 0, fontSize: 26 }}>똑 전체 서버 웹사이트 설계</h1><p style={{ color: "#64748b", margin: "6px 0" }}>로그인·데이터·AI·결제 등 앱 서버 전체를 위한 화면 틀입니다. 왼쪽에서 직접 바꿔 보세요.</p></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <a href="/server-design" style={{ ...buttonStyle, textDecoration: "none" }}>운영 화면으로 돌아가기</a>
          <button style={buttonStyle} onClick={() => setMobile(value => !value)}>{mobile ? "PC 화면" : "휴대폰 화면"}</button>
          <button style={buttonStyle} onClick={() => setPreviewOnly(value => !value)}>{previewOnly ? "편집 다시 보기" : "화면만 보기"}</button>
          <button style={buttonStyle} onClick={download}>설계 파일 저장</button>
        </div>
      </header>
      <div className="server-designer-grid" style={{ display: "grid", gridTemplateColumns: previewOnly ? "1fr" : "minmax(300px,370px) minmax(0,1fr)", gap: 16 }}>
        {!previewOnly && <aside style={panelStyle}>
          <h2 style={headingStyle}>기본 모양</h2>
          <label style={labelStyle}>사이트 이름<input style={inputStyle} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
          <label style={labelStyle}>사이트 설명<textarea style={inputStyle} rows={2} value={draft.subtitle} onChange={e => setDraft({ ...draft, subtitle: e.target.value })} /></label>
          <div style={{ display: "flex", gap: 18 }}><label style={labelStyle}>포인트 색<br /><input type="color" value={draft.accent} onChange={e => setDraft({ ...draft, accent: e.target.value })} /></label><label style={labelStyle}>배경 색<br /><input type="color" value={draft.background} onChange={e => setDraft({ ...draft, background: e.target.value })} /></label></div>
          <label style={labelStyle}>메뉴 위치<select style={inputStyle} value={draft.layout} onChange={e => setDraft({ ...draft, layout: e.target.value as Draft["layout"] })}><option value="side">왼쪽</option><option value="top">위쪽</option></select></label>
          <h2 style={{ ...headingStyle, marginTop: 22 }}>서버 기능 메뉴</h2>
          {draft.pages.map((item, index) => <div key={item.id} style={{ display: "flex", gap: 4, margin: "6px 0" }}>
            <button style={{ ...buttonStyle, flex: 1, textAlign: "left", borderColor: page?.id === item.id ? draft.accent : "#d9e2ee" }} onClick={() => { setPageId(item.id); setBoxId(""); }}>{item.title}</button>
            <button aria-label={`${item.title} 위로`} style={buttonStyle} disabled={index === 0} onClick={() => movePage(index, -1)}>↑</button>
            <button aria-label={`${item.title} 아래로`} style={buttonStyle} disabled={index === draft.pages.length - 1} onClick={() => movePage(index, 1)}>↓</button>
          </div>)}
          <button style={{ ...buttonStyle, width: "100%" }} onClick={addPage}>+ 기능 메뉴 추가</button>
          {page && <div style={{ borderTop: "1px solid #e4eaf2", marginTop: 18, paddingTop: 16 }}>
            <h2 style={headingStyle}>선택한 메뉴</h2>
            <label style={labelStyle}>메뉴 이름<input style={inputStyle} value={page.title} onChange={e => updatePage({ title: e.target.value })} /></label>
            <label style={labelStyle}>화면 설명<textarea style={inputStyle} rows={3} value={page.description} onChange={e => updatePage({ description: e.target.value })} /></label>
            <button style={{ ...buttonStyle, color: "#b52b4c" }} onClick={() => { setDraft(current => ({ ...current, pages: current.pages.filter(item => item.id !== page.id) })); setPageId(draft.pages.find(item => item.id !== page.id)?.id || ""); setBoxId(""); }}>이 메뉴 삭제</button>
            <h2 style={{ ...headingStyle, marginTop: 22 }}>기능 박스와 버튼</h2>
            {page.boxes.map(item => <button key={item.id} style={{ ...buttonStyle, display: "block", width: "100%", textAlign: "left", marginBottom: 6, borderColor: boxId === item.id ? draft.accent : "#d9e2ee" }} onClick={() => setBoxId(item.id)}>{item.title}</button>)}
            <button style={{ ...buttonStyle, width: "100%" }} onClick={addBox}>+ 기능 박스 추가</button>
            {selectedBox && <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>박스 제목<input style={inputStyle} value={selectedBox.title} onChange={e => updateBox({ title: e.target.value })} /></label>
              <label style={labelStyle}>내용<textarea style={inputStyle} rows={3} value={selectedBox.body} onChange={e => updateBox({ body: e.target.value })} /></label>
              <label style={labelStyle}>버튼 문구<input style={inputStyle} value={selectedBox.button} onChange={e => updateBox({ button: e.target.value })} /></label>
              <button style={{ ...buttonStyle, color: "#b52b4c" }} onClick={() => { updatePage({ boxes: page.boxes.filter(item => item.id !== boxId) }); setBoxId(""); }}>이 박스 삭제</button>
            </div>}
          </div>}
        </aside>}
        <section aria-label="서버 웹사이트 미리보기" style={{ ...panelStyle, padding: 12, overflowX: "auto" }}>
          <div style={{ maxWidth: mobile ? 390 : 1220, minHeight: 700, margin: "auto", background: draft.background, border: "1px solid #dce5f0", borderRadius: mobile ? 28 : 16, overflow: "hidden", transition: "max-width .25s ease" }}>
            <div style={{ display: "flex", flexDirection: draft.layout === "side" && !mobile ? "row" : "column", minHeight: 700 }}>
              {draft.layout === "side" && !mobile && <nav aria-label="서버 메뉴" style={{ width: 210, flexShrink: 0, background: "#192a43", color: "white", padding: "28px 12px" }}>
                <strong style={{ display: "block", padding: "0 12px 24px", fontSize: 20 }}>똑 <small style={{ fontSize: 11 }}>SERVER</small></strong>
                {draft.pages.map(item => <button key={item.id} style={{ ...navStyle, background: page?.id === item.id ? draft.accent : "transparent" }} onClick={() => { setPageId(item.id); setBoxId(""); }}>{item.title}</button>)}
              </nav>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ background: "white", padding: mobile ? "22px 18px" : "30px 34px", borderBottom: "1px solid #e2eaf3" }}>
                  <small style={{ color: draft.accent, fontWeight: 800, letterSpacing: 1 }}>TTOK · SERVER CONTROL</small>
                  <h2 style={{ fontSize: mobile ? 24 : 30, margin: "8px 0" }}>{draft.title || "사이트 이름"}</h2>
                  <p style={{ color: "#65758a", margin: 0 }}>{draft.subtitle}</p>
                </div>
                {(draft.layout === "top" || mobile) && <nav aria-label="서버 메뉴" style={{ display: "flex", gap: 7, overflowX: "auto", padding: "12px 16px", background: "white" }}>
                  {draft.pages.map(item => <button key={item.id} style={{ ...buttonStyle, whiteSpace: "nowrap", border: 0, background: page?.id === item.id ? draft.accent : "#f1f5fa", color: page?.id === item.id ? "white" : "#334b69" }} onClick={() => { setPageId(item.id); setBoxId(""); }}>{item.title}</button>)}
                </nav>}
                <div style={{ padding: mobile ? 16 : 30 }}>
                  <div style={{ fontSize: 12, color: "#926723", marginBottom: 12 }}>● 디자인 미리보기 · 실제 서버 데이터 미연결</div>
                  <h3 style={{ fontSize: 26, margin: "0 0 6px" }}>{page?.title || "메뉴를 추가해 주세요"}</h3>
                  <p style={{ color: "#63748b", margin: "0 0 22px" }}>{page?.description}</p>
                  <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
                    {page?.boxes.map(item => <article key={item.id} onClick={() => setBoxId(item.id)} style={{ minHeight: 188, background: "white", padding: 20, borderRadius: 16, border: `2px solid ${boxId === item.id ? draft.accent : "transparent"}`, boxShadow: "0 8px 26px #1b3f6d0c", cursor: "pointer" }}>
                      <div style={{ width: 35, height: 4, borderRadius: 4, background: draft.accent }} />
                      <h4 style={{ margin: "18px 0 8px", fontSize: 18 }}>{item.title}</h4>
                      <p style={{ color: "#65758a", lineHeight: 1.5, fontSize: 14, minHeight: 45 }}>{item.body}</p>
                      <button style={{ ...buttonStyle, color: draft.accent, borderColor: draft.accent }} onClick={event => { event.stopPropagation(); setBoxId(item.id); }}>{item.button || "버튼"}</button>
                    </article>)}
                    {!page?.boxes.length && <div style={{ padding: 22, border: "1px dashed #bdcce0", borderRadius: 14 }}>왼쪽에서 기능 박스를 추가하세요.</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <style>{"@media(max-width:850px){.server-designer-grid{grid-template-columns:1fr!important}}"}</style>
    </div>
  </main>;
}

const panelStyle: React.CSSProperties = { background: "white", borderRadius: 18, padding: 20, boxShadow: "0 9px 28px #152c520c" };
const headingStyle: React.CSSProperties = { fontSize: 18, margin: "0 0 12px" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, margin: "12px 0", fontSize: 14 };
const inputStyle: React.CSSProperties = { boxSizing: "border-box", display: "block", width: "100%", padding: 10, marginTop: 6, border: "1px solid #ced9e8", borderRadius: 9, font: "inherit" };
const buttonStyle: React.CSSProperties = { border: "1px solid #d9e2ee", background: "white", color: "#263b58", borderRadius: 9, padding: "9px 12px", cursor: "pointer", font: "inherit" };
const navStyle: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", color: "white", border: 0, borderRadius: 9, padding: "11px 12px", marginBottom: 3, cursor: "pointer", font: "inherit" };
