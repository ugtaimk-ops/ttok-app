// 사용법: npm run ui:map
//  1) 코드 안의 data-ui 이름을 모두 찾아 UI_MAP.md(어느 파일 몇 번째 줄인지 목록)를 새로 만듭니다.
//  2) src/ui-design/<화면>.css 가 아직 없으면 주석 처리된 서식 틀을 만듭니다. (이미 있는 파일은 절대 덮어쓰지 않음)
//  3) 이름표(scripts/ui-labels.cjs)와 코드가 서로 어긋나면 알려줍니다.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const labels = require("./ui-labels.cjs");

const FILES = {
  "공통": "common.css",
  "로그인": "login.css",
  "홈": "home.css",
  "수행평가": "assessment.css",
  "발표연습": "practice.css",
  "공부": "study.css",
  "프로필": "profile.css",
  "설정·구독": "settings.css",
  "꼬르륵 급식": "meal.css",
};
const GROUP_ORDER = Object.keys(FILES);

// 코드에서 data-ui 위치 수집
const found = {}; // id -> "src/components/X.tsx:123"
const srcDir = path.join(root, "src");
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.tsx$/.test(name)) continue;
    const rel = path.relative(root, p).replace(/\\/g, "/");
    fs.readFileSync(p, "utf8").split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(/data-ui="([^"]+)"/g)) found[m[1]] = `${rel}:${i + 1}`;
      if (/data-ui=\{`nav-\$\{tab\.id\}`\}/.test(line)) {
        for (const id of Object.keys(labels).filter((k) => k.startsWith("nav-") && k !== "nav-bar")) found[id] = `${rel}:${i + 1}`;
      }
    });
  }
})(srcDir);

// 어긋남 점검
const noLabel = Object.keys(found).filter((id) => !labels[id]);
const noCode = Object.keys(labels).filter((id) => !found[id]);
if (noLabel.length) console.log("⚠ 코드에는 있는데 이름표(ui-labels.cjs)에 없음:", noLabel.join(", "));
if (noCode.length) console.log("⚠ 이름표에는 있는데 코드에 없음:", noCode.join(", "));

// UI_MAP.md
const byGroup = {};
for (const [id, [group, desc]] of Object.entries(labels)) (byGroup[group] ||= []).push({ id, desc, where: found[id] || "(코드에서 못 찾음)" });
let md = `# 똑 화면 요소 지도 (자동 생성 — 직접 고치지 마세요)\n\n`;
md += `\`npm run ui:map\` 을 실행하면 이 파일이 새로 만들어집니다. 사용법은 UI_GUIDE.md 를 보세요.\n\n`;
for (const g of GROUP_ORDER) {
  if (!byGroup[g]) continue;
  md += `## ${g}  (스타일 파일: src/ui-design/${FILES[g]})\n\n| 이름(data-ui) | 무엇인가 | 코드 위치 |\n|---|---|---|\n`;
  for (const r of byGroup[g]) md += `| \`${r.id}\` | ${r.desc} | ${r.where} |\n`;
  md += `\n`;
}
fs.writeFileSync(path.join(root, "UI_MAP.md"), md.trimEnd() + "\n");

// 화면별 CSS 틀 (없을 때만)
const dir = path.join(root, "src", "ui-design");
for (const g of GROUP_ORDER) {
  if (!byGroup[g]) continue;
  const file = path.join(dir, FILES[g]);
  if (fs.existsSync(file)) continue;
  let css = `/*\n  [${g}] 화면 요소 스타일\n\n  쓰는 법\n    1. 바꾸고 싶은 요소의 블록을 찾습니다. (UI 선택 도구로 클릭하면 이름이 복사됩니다)\n    2. 그 블록을 감싼 주석 표시(슬래시-별, 별-슬래시)를 지우고 값을 고칩니다.\n    3. 저장하면 개발 화면에 바로 반영됩니다.\n\n  참고\n    - 여기에 쓴 스타일은 기존 스타일보다 우선합니다.\n    - 마우스를 올렸을 때 모양은 [data-ui="이름"]:hover { ... } 로 따로 씁니다.\n    - 다크 모드에서만 다르게: .dark [data-ui="이름"] { ... }\n    - 글자 내용(문구)은 여기서 못 바꿉니다. UI_MAP.md 의 코드 위치에서 고칩니다.\n*/\n\n`;
  for (const r of byGroup[g]) {
    css += `/* ${r.desc}  —  ${r.where} */\n/*\n[data-ui="${r.id}"] {\n  background: #0066ff;\n  color: #ffffff;\n  border-radius: 16px;\n  font-size: 16px;\n  font-weight: 800;\n  padding: 12px 20px;\n}\n*/\n\n`;
  }
  fs.writeFileSync(file, css.trimEnd() + "\n");
  console.log("만듦:", path.relative(root, file));
}
const used = GROUP_ORDER.filter((g) => byGroup[g]);
const indexCss = path.join(dir, "index.css");
if (!fs.existsSync(indexCss)) {
  fs.writeFileSync(
    indexCss,
    `/* 화면별 스타일 파일을 모아 불러옵니다. 새 파일을 만들면 여기에 한 줄 추가하세요. */\n` +
      used.map((g) => `@import "./${FILES[g]}";`).join("\n") + `\n`
  );
}
console.log(`완료: 요소 ${Object.keys(found).length}개, UI_MAP.md 갱신`);
