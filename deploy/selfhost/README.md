# 똑 자체 데이터베이스 웹사이트

## 전체 서버 웹사이트 디자인 틀

`http://127.0.0.1:3001/server-design`에서 회원·로그인, 데이터베이스, AI·사용량, 구독·결제, 학교·급식, API·서버, 보안·백업 화면의 메뉴와 기능 박스, 버튼 문구, 색상과 배치를 직접 편집할 수 있습니다. `scripts/start-server-design.cmd`를 실행하면 로컬 서버와 브라우저가 열립니다. 창을 닫으면 로컬 웹사이트도 멈춥니다. 초안은 브라우저 localStorage에 자동 저장되며 JSON으로 내려받을 수 있습니다.

이 화면은 실제 계정·결제 데이터를 보여주는 관리 콘솔이 아닌 **편집 가능한 설계 화면**입니다. 실제 운영 콘솔에는 관리자 인증·권한 검사와 기능별 API 연결이 필요합니다. 이전의 개인 데이터 보관함 디자인은 별도 localStorage 키에 남아 있습니다.

이 단계는 기존 Firestore 자료를 **복사해 검증할 수 있는 PostgreSQL 저장소**와 `/data-vault` 웹 화면을 추가합니다. 운영 앱은 아직 Firestore를 사용합니다. 새 저장소에 충분히 복사되고 로그인·결제·AI 사용량을 전환하기 전에는 Firebase를 끄지 마세요.

## 구성

- PostgreSQL: 프로필, 일정, 할 일, 발표 대본, 연습 기록, AI 사용량·예상 비용, PRO 상태, AI 결과 캐시를 담는 표가 `schema.sql`에 있습니다.
- Node API: `GET /api/storage/status`, `GET /api/storage/:collection`, `PUT /api/storage/:collection/:id`, `DELETE /api/storage/:collection/:id`. Firebase ID 토큰으로 인증하고 **본인의 UID에만** 접근합니다. AI 비용·PRO 상태는 이 API에서 변경할 수 없습니다.
- 웹 화면: 같은 서버의 `https://주소/data-vault`. 기존 Firebase 계정으로 로그인하여 복사된 자료를 확인하고 JSON을 내려받을 수 있습니다.
- 이전 도구: `scripts/migrate-firestore-to-postgres.mjs`. 기본 실행은 건수 확인만 하고, `--write`를 명시하면 **기존 행을 덮어쓰지 않는 복사**를 합니다. Firestore 원본을 지우지 않습니다.

## 개발용 실행

1. Docker Desktop이 있으면 이 폴더에 개인 `.env` 파일을 만들고 `POSTGRES_PASSWORD`에 강한 비밀번호를 넣습니다. Git에 올리지 않습니다.
2. `docker compose up -d`를 실행합니다. 처음 시작할 때 `schema.sql`이 적용됩니다.
3. 프로젝트 루트의 비공개 `.env`에 `DATABASE_URL=postgresql://ttok:<URL 인코딩한 비밀번호>@127.0.0.1:5432/ttok`을 추가합니다. 기존 `FIREBASE_SERVICE_ACCOUNT_KEY`와 앱 설정은 아직 필요합니다.
4. 루트에서 `npm ci`, `npm run dev`를 실행합니다. `http://127.0.0.1:3000/data-vault`에서 로그인하고 연결 상태를 확인합니다. 비어 보이는 것이 정상입니다.
5. Firebase 서비스 계정 키가 준비되면 `node scripts/migrate-firestore-to-postgres.mjs`로 원본 건수를 확인하고, `node scripts/migrate-firestore-to-postgres.mjs --write`로 복사합니다. 개인 자료가 들어 있으므로 출력 파일이나 DB 덤프를 공개하지 마세요.

## 운영 전 필수 확인

- 공개 HTTPS 서버와 **영속 PostgreSQL**이 필요합니다. 현재 계정이나 서버가 없어 실제 운영 웹주소는 아직 만들지 못했습니다. 임시 파일시스템에 DB를 두면 서비스 재배포 때 데이터가 사라질 수 있습니다.
- 데이터 복사 전후 건수와 임의 사용자 자료를 대조하고, 앱을 사용하는 동안 발생한 변경분을 다시 복사하는 계획이 필요합니다. 이 도구는 기존 행을 덮어쓰지 않으므로 증분 동기화가 아닙니다.
- 앱의 `dataSyncService`, `authService`, `usageService`, `revenueCatService`는 아직 Firebase에 연결됩니다. 자체 DB로 완전히 바꾸려면 API 전환, Google·Apple·이메일 계정 이전, 월 한도 트랜잭션, RevenueCat 웹훅 변경, 계정 삭제, 백업·복구 테스트가 추가로 필요합니다. 기존 이메일 계정의 비밀번호는 Firebase에서 내보낼 수 없으므로 재설정 절차가 필요합니다.
- 운영 DB 포트는 인터넷에 공개하지 말고, 웹서버는 HTTPS로만 공개합니다. 정기 `pg_dump` 백업과 복원 테스트를 하세요.
