/* 개발용 화면 선택기: 앱의 동작을 누르지 않고 버튼 모양을 직접 미리 봅니다. */
const showTool = import.meta.env.DEV || new URLSearchParams(location.search).get("ui") === "1";
const draftKey = "ttok-ui-design-draft-v1";
type Appearance = { background?: string; color?: string; fontSize?: number; radius?: number; hidden?: boolean };
type Draft = Record<string, Appearance>;
const isId = (id: string) => /^[a-z0-9-]+$/.test(id);
const isColor = (color: string) => /^#[0-9a-f]{6}$/i.test(color);
const toHex = (value: string, fallback: string): string => {
  const match = value.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return match ? "#" + match.slice(1, 4).map(n => Number(n).toString(16).padStart(2, "0")).join("") : fallback;
};

function makeCss(draft: Draft): string {
  return Object.entries(draft).flatMap(([id, value]) => {
    if (!isId(id) || !value || typeof value !== "object") return [];
    const properties: string[] = [];
    if (value.background && isColor(value.background)) properties.push(`background-color:${value.background}`);
    if (value.color && isColor(value.color)) properties.push(`color:${value.color}`);
    if (Number.isFinite(value.fontSize)) properties.push(`font-size:${Math.max(8, Math.min(48, Number(value.fontSize)))}px`);
    if (Number.isFinite(value.radius)) properties.push(`border-radius:${Math.max(0, Math.min(80, Number(value.radius)))}px`);
    if (value.hidden === true) properties.push("display:none");
    return properties.length ? [`[data-ui="${id}"]{${properties.join(";")}}`] : [];
  }).join("\n");
}

export function startUiInspector(): void {
  if (!showTool) return;
  let draft: Draft = {};
  try { draft = JSON.parse(localStorage.getItem(draftKey) || "{}") || {}; } catch { /* Private mode */ }
  const preview = document.createElement("style");
  document.head.appendChild(preview);
  const updatePreview = () => {
    preview.textContent = makeCss(draft);
    try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Private mode */ }
  };
  updatePreview();

  const chrome = document.createElement("style");
  chrome.textContent = `
    #ui-design-toggle{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));right:8px;z-index:2147483647;
      background:white;color:#065fd4;border:1px solid #065fd4;border-radius:22px;padding:9px 13px;
      font:700 12px system-ui;box-shadow:0 3px 14px #0003;cursor:pointer}
    #ui-design-toggle.on{background:#065fd4;color:white}
    #ui-design-tag{position:fixed;z-index:2147483646;display:none;pointer-events:none;background:#065fd4;
      color:white;border-radius:7px;padding:5px 8px;font:700 12px monospace;max-width:90vw}
    [data-ui-hover="1"]{outline:2px solid #065fd4!important;outline-offset:2px}
    #ui-design-panel{position:fixed;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));
      z-index:2147483647;width:min(360px,calc(100vw - 16px));max-height:70vh;overflow:auto;
      background:white;color:#18263c;border:1px solid #cbd8e8;border-radius:18px;padding:16px;
      box-shadow:0 12px 40px #0004;font:14px/1.4 system-ui}
    #ui-design-panel[hidden]{display:none}
    #ui-design-panel *{box-sizing:border-box}
    #ui-design-panel h2{font:bold 16px system-ui;margin:0 0 5px}
    #ui-design-panel p{font:12px/1.4 system-ui;color:#61738c;margin:0 0 10px}
    #ui-design-panel label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0}
    #ui-design-panel input[type="number"]{width:75px;padding:5px}
    #ui-design-panel input[type="checkbox"]{width:18px;height:18px;accent-color:#065fd4}
    #ui-design-panel input[type="color"]{width:65px;height:32px}
    #ui-design-panel .buttons{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
    #ui-design-panel button{border:1px solid #cbd8e8;border-radius:9px;background:white;color:#18263c;
      padding:8px 10px;font:700 12px system-ui;cursor:pointer}
    #ui-design-panel button.primary{background:#065fd4;color:white;border-color:#065fd4}
  `;
  document.head.appendChild(chrome);

  const toggle = document.createElement("button");
  toggle.id = "ui-design-toggle";
  toggle.type = "button";
  const tag = document.createElement("div");
  tag.id = "ui-design-tag";
  const panel = document.createElement("section");
  panel.id = "ui-design-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <h2 id="ui-design-name"></h2>
    <p>바꾸는 즉시 화면에 미리 표시됩니다. 변경 CSS를 저장해 앱에 반영할 수 있습니다.</p>
    <label>배경색 <span><input type="checkbox" data-use="background"><input type="color" data-field="background" value="#ffffff"></span></label>
    <label>글자색 <span><input type="checkbox" data-use="color"><input type="color" data-field="color" value="#18263c"></span></label>
    <label>글자 크기(px) <span><input type="checkbox" data-use="fontSize"><input type="number" data-field="fontSize" min="8" max="48" value="16"></span></label>
    <label>모서리(px) <span><input type="checkbox" data-use="radius"><input type="number" data-field="radius" min="0" max="80" value="12"></span></label>
    <label>이 요소 숨기기 <input type="checkbox" data-field="hidden"></label>
    <div class="buttons">
      <button type="button" data-task="copy">이름 복사</button>
      <button type="button" data-task="reset">이 요소 초기화</button>
      <button type="button" data-task="reset-all">전체 초기화</button>
      <button type="button" class="primary" data-task="export">변경 CSS 저장</button>
      ${import.meta.env.DEV ? '<button type="button" data-task="layout">버튼 구성 편집표</button>' : ""}
      <button type="button" data-task="close">닫기</button>
    </div>
  `;
  document.body.append(toggle, tag, panel);

  let selecting = new URLSearchParams(location.search).get("ui") === "1";
  let hovered: HTMLElement | null = null;
  let selected: HTMLElement | null = null;
  const field = (name: string) => panel.querySelector<HTMLInputElement>(`[data-field="${name}"]`)!;
  const use = (name: string) => panel.querySelector<HTMLInputElement>(`[data-use="${name}"]`)!;
  const renderToggle = () => {
    toggle.textContent = selecting ? "UI 선택 켜짐" : "UI 선택";
    toggle.classList.toggle("on", selecting);
    toggle.setAttribute("aria-pressed", String(selecting));
    if (!selecting) { hovered?.removeAttribute("data-ui-hover"); hovered = null; tag.style.display = "none"; }
  };
  const renderPanel = () => {
    const id = selected?.dataset.ui;
    if (!id) return;
    const design = draft[id] || {};
    const computed = getComputedStyle(selected!);
    const defaults = {
      background: toHex(computed.backgroundColor, "#ffffff"),
      color: toHex(computed.color, "#18263c"),
      fontSize: Math.round(parseFloat(computed.fontSize) || 16),
      radius: Math.round(parseFloat(computed.borderRadius) || 0)
    };
    panel.querySelector<HTMLElement>("#ui-design-name")!.textContent = id;
    for (const name of ["background", "color", "fontSize", "radius"] as const) {
      use(name).checked = design[name] !== undefined;
      field(name).value = String(design[name] ?? defaults[name]);
    }
    field("hidden").checked = design.hidden === true;
    panel.hidden = false;
  };
  const updateSelected = () => {
    const id = selected?.dataset.ui;
    if (!id || !isId(id)) return;
    const value: Appearance = {};
    if (use("background").checked && isColor(field("background").value)) value.background = field("background").value;
    if (use("color").checked && isColor(field("color").value)) value.color = field("color").value;
    if (use("fontSize").checked) value.fontSize = Math.max(8, Math.min(48, Number(field("fontSize").value) || 16));
    if (use("radius").checked) value.radius = Math.max(0, Math.min(80, Number(field("radius").value) || 0));
    if (field("hidden").checked) value.hidden = true;
    draft[id] = value;
    updatePreview();
  };
  toggle.onclick = event => { event.stopPropagation(); selecting = !selecting; renderToggle(); };
  panel.addEventListener("input", updateSelected);
  panel.addEventListener("change", updateSelected);
  panel.addEventListener("click", event => {
    const task = (event.target as Element).closest<HTMLButtonElement>("button[data-task]")?.dataset.task;
    const id = selected?.dataset.ui;
    if (task === "copy" && id) void navigator.clipboard?.writeText(id);
    if (task === "reset" && id) { delete draft[id]; updatePreview(); renderPanel(); }
    if (task === "reset-all" && confirm("모든 디자인 미리보기를 초기화할까요?")) {
      draft = {}; updatePreview(); renderPanel();
    }
    if (task === "close") panel.hidden = true;
    if (task === "layout") window.open("/ui-editor.html", "_blank", "noopener");
    if (task === "export") {
      const css = makeCss(draft) || "/* 아직 바꾼 요소가 없습니다. */";
      const url = URL.createObjectURL(new Blob([css + "\n"], { type: "text/css" }));
      const link = document.createElement("a");
      link.href = url; link.download = "ttok-ui-custom.css"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  document.addEventListener("mouseover", event => {
    if (!selecting || panel.contains(event.target as Node)) return;
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-ui]") : null;
    if (element === hovered) return;
    hovered?.removeAttribute("data-ui-hover");
    hovered = element;
    if (!element) { tag.style.display = "none"; return; }
    element.setAttribute("data-ui-hover", "1");
    const rect = element.getBoundingClientRect();
    tag.textContent = element.dataset.ui || "";
    tag.style.display = "block";
    tag.style.left = `${Math.max(4, Math.min(rect.left, innerWidth - 160))}px`;
    tag.style.top = `${Math.max(4, rect.top - 28)}px`;
  });
  document.addEventListener("click", event => {
    if (!selecting || event.target === toggle || panel.contains(event.target as Node)) return;
    // 선택 중에는 이름표가 없는 곳을 눌러도 원래 앱 기능을 실행하지 않습니다.
    event.preventDefault();
    event.stopImmediatePropagation();
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-ui]") : null;
    if (!element) { tag.textContent = "이 요소에는 이름표가 없습니다"; tag.style.display = "block"; return; }
    selected = element;
    renderPanel();
  }, true);
  renderToggle();
}
