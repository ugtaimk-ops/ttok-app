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

function screenFor(id, group) {
  if (id.startsWith("login-") ) return "로그인";
  if (id.startsWith("email-verify-")) return "이메일 인증";
  if (id.startsWith("terms-") || id.startsWith("gate-")) return "첫 이용 약관";
  if (id.startsWith("header-") || id.startsWith("nav-") || id === "back-button") return "공통 메뉴";
  if (id.startsWith("home-shortcut-")) return "홈 · 바로가기 편집";
  if (id.startsWith("home-schedule-add") || id.startsWith("home-schedule-edit")) return "홈 · 일정 추가·수정";
  if (id.startsWith("home-schedule-")) return "홈 · 일정 카드";
  if (id.startsWith("ai-report-")) return "홈 · AI 리포트";
  if (id.startsWith("assessment-direct-")) return "수행평가 · 직접 입력";
  if (id.startsWith("assessment-photo-") || id.startsWith("assessment-scan-")) return "수행평가 · 사진 등록·결과";
  if (id.startsWith("assessment-menu-") || id.startsWith("assessment-edit-") || id.startsWith("assessment-delete-")) return "수행평가 · 수정·삭제 팝업";
  if (id.startsWith("assessment-")) return "수행평가 · 일정 목록";
  if (id.startsWith("practice-tab-") || id.startsWith("practice-script-generate")) return "발표 · 대본 작성";
  if (id.startsWith("practice-saved-") || id.startsWith("practice-script-")) return "발표 · 저장 대본 보기";
  if (id.startsWith("practice-prompter-")) return "발표 · 프롬프터";
  if (id.startsWith("practice-permission-") || id.startsWith("practice-modal-")) return "발표 · 권한 안내";
  if (id.startsWith("practice-analysis-") || id === "practice-retry") return "발표 · 분석 결과";
  if (id.startsWith("practice-stop-") || id === "practice-start") return "발표 · 연습 진행";
  if (id.startsWith("practice-source-")) return "발표 · 연습 준비";
  if (id.startsWith("study-photo-")) return "공부 · 사진 문제 풀이";
  if (id === "study-tab-helper") return "공부 · AI 공부 도우미";
  if (id === "study-tab-planner") return "공부 · 시험 계획";
  if (id.startsWith("study-material-") || id.startsWith("study-mode-") || id.startsWith("study-run") || id.startsWith("study-quiz-")) return "공부 · AI 공부 도우미";
  if (id.startsWith("study-exam-") || id.startsWith("study-plan-") || id.startsWith("study-menu-") || id.startsWith("study-edit-") || id.startsWith("study-delete-")) return "공부 · 시험 계획";
  if (id.startsWith("profile-school-")) return "프로필 · 학교 검색";
  if (id.startsWith("profile-avatar-") || id.startsWith("profile-camera-")) return "프로필 · 사진 설정";
  if (id.startsWith("profile-")) return "프로필 · 정보 수정";
  if (id.startsWith("paywall-") || id.startsWith("premium-")) return "설정 · 똑 PRO 구독";
  if (id.startsWith("settings-reset-")) return "설정 · 데이터 초기화";
  if (id.startsWith("settings-terms-")) return "설정 · 이용약관";
  if (id.startsWith("settings-")) return "설정 · 앱·계정 관리";
  if (id.startsWith("meal-week-")) return "꼬르륵 · 주간 급식";
  if (id.startsWith("meal-month-") || id.startsWith("meal-date-")) return "꼬르륵 · 날짜별 급식";
  if (id.startsWith("meal-school-")) return "꼬르륵 · 학교 설정";
  if (id.startsWith("meal-alarm-")) return "꼬르륵 · 급식 알림";
  if (id.startsWith("select-")) return "공통 메뉴 · 선택 목록";
  if (id.startsWith("error-")) return "오류 화면";
  return group;
}

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

const catalogDir = path.join(root, "public");
fs.mkdirSync(catalogDir, { recursive: true });
const catalog = Object.entries(labels).map(([id, [group, description]]) => ({
  id,
  group,
  screen: screenFor(id, group),
  label: description,
  source: found[id] || "코드 위치 확인 필요",
}));
fs.writeFileSync(path.join(catalogDir, "ui-catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
