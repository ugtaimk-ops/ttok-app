import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { authService } from "../services/authService";
import { robustFetch } from "../lib/api";

const sections = [
  { key: "profile", title: "프로필" },
  { key: "schedules", title: "일정" },
  { key: "todos", title: "할 일" },
  { key: "scripts", title: "발표 대본" },
  { key: "practiceLogs", title: "발표 연습 기록" },
  { key: "aiCostMonths", title: "AI 사용 비용 기록" },
] as const;
type Section = typeof sections[number]["key"];

export default function DataVaultWebsite() {
  const [design] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ttok-data-vault-design-v1") || "null");
      if (saved && typeof saved.title === "string" && Array.isArray(saved.sections)) return saved as {
        title: string; subtitle: string; accent: string; background: string;
        sections: { id: string; title: string; description: string }[];
      };
    } catch { /* Use the built-in presentation if the draft is invalid. */ }
    return null;
  });
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<Section>("profile");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setBusy(true);
    setError("");
    robustFetch("/api/storage/status").then(async (status) => {
      if (!active) return;
      setReady(status.ok);
      if (!status.ok) throw new Error("데이터베이스가 아직 연결되지 않았거나 읽을 수 없어요.");
      const all: Record<string, unknown>[] = [];
      let cursor: string | null = null;
      do {
        const data: Response = await robustFetch(`/api/storage/${selected}${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`);
        if (!data.ok) throw new Error("데이터를 불러오지 못했어요.");
        const page = await data.json() as { items: Record<string, unknown>[]; nextCursor: string | null };
        all.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && active);
      if (active) setItems(all);
    }).catch((err: Error) => { if (active) { setItems([]); setError(err.message); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [user?.uid, selected]);

  async function login(method: "email" | "google") {
    setError("");
    setBusy(true);
    try {
      if (method === "email") await authService.signInWithEmail(email.trim(), password);
      else await authService.signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했어요.");
    } finally { setBusy(false); }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ section: selected, items }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ttok-${selected}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main style={{ minHeight: "100vh", background: design?.background || "#f5f7fb", color: "#182338", padding: "28px 16px", fontFamily: "system-ui, sans-serif" }}>
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div><strong style={{ fontSize: 28 }}>{design?.title || "똑 데이터 보관함"}</strong><p style={{ margin: "8px 0", color: "#627187" }}>{design?.subtitle || "내 계정에 저장된 자료를 확인하고 내려받을 수 있어요."}</p></div>
        {user && <button type="button" onClick={() => void authService.logout()}>로그아웃</button>}
      </header>
      {user === undefined ? <p>로그인 상태를 확인하고 있어요...</p> : !user ?
        <section style={card}>
          <h2>내 계정으로 로그인</h2>
          <input aria-label="이메일" type="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)} style={input} />
          <input aria-label="비밀번호" type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} style={input} />
          <button type="button" disabled={busy} onClick={() => void login("email")} style={button}>이메일 로그인</button>
          <button type="button" disabled={busy} onClick={() => void login("google")} style={{ ...button, background: "#fff", color: "#183657", border: "1px solid #ccd7e8" }}>Google로 로그인</button>
        </section> : <>
          {ready === false && <p role="status">자체 데이터베이스 연결을 기다리고 있어요.</p>}
          {!!design?.sections.length && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
            {design.sections.map(section => <section key={section.id} style={card}>
              <div style={{ width: 32, height: 4, background: design.accent, borderRadius: 3 }} />
              <h2>{section.title}</h2><p style={{ color: "#627187" }}>{section.description}</p>
            </section>)}
          </div>}
          <nav aria-label="데이터 종류" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {sections.map(section => <button key={section.key} type="button" onClick={() => setSelected(section.key)} style={{ ...button, width: "auto", background: selected === section.key ? design?.accent || "#145bda" : "#e6edfa", color: selected === section.key ? "white" : "#26446c" }}>{section.title}</button>)}
          </nav>
          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>{sections.find(section => section.key === selected)?.title} · {items.length}개</h2>
              <button type="button" disabled={!items.length} onClick={download}>JSON 내려받기</button>
            </div>
            {busy ? <p>불러오는 중...</p> : items.length === 0 ? <p>표시할 데이터가 없어요.</p> : items.map((item, index) =>
              <pre key={String(item.id ?? index)} style={{ overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", padding: 16, background: "#f3f6fc", borderRadius: 12 }}>{JSON.stringify(item, null, 2)}</pre>)}
          </section>
        </>}
      {error && <p role="alert" style={{ color: "#c01839" }}>{error}</p>}
    </div>
  </main>;
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 12px 36px #10295512" };
const input: React.CSSProperties = { display: "block", width: "100%", maxWidth: 420, padding: 12, margin: "12px 0", border: "1px solid #ced8e8", borderRadius: 10 };
const button: React.CSSProperties = { display: "inline-block", width: "100%", maxWidth: 420, padding: "12px 16px", margin: "5px 0", border: 0, borderRadius: 10, background: "#145bda", color: "white", cursor: "pointer" };
