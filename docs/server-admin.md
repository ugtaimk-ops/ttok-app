# 똑 서버 관리 화면

로컬 화면: `http://127.0.0.1:3001/server-design`

관리 화면은 앱에 이미 사용하는 Firebase 계정으로 로그인합니다. 서버는 Firebase ID 토큰을 확인한 뒤, `DASHBOARD_ADMIN_UIDS`에 들어 있는 UID만 관리 API에 접근시킵니다. 관리 API는 현재 조회 전용입니다. 회원·결제 정보를 다루므로 UID를 확인하기 전에는 관리자 허용 목록을 비워 두는 편이 안전합니다.

## 서버 환경변수

Render의 `ttok-backend` 서비스에 다음 값을 설정합니다. 비밀값을 GitHub, `VITE_` 변수, 브라우저 코드에 넣지 않습니다.

| 변수 | 사용처 |
| --- | --- |
| `DASHBOARD_ADMIN_UIDS` | 관리자 Firebase UID. 여러 명은 쉼표로 구분 |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firestore 관리자 조회 및 기존 AI 사용량 관리 |
| `GEMINI_API_KEYS` 또는 `GEMINI_API_KEY` | 대본·발표·공부 등 기존 Gemini 기능 |
| `REVENUECAT_SECRET_API_KEY` | 관리자 본인 구독 조회 및 기존 결제 연동 |
| `REVENUECAT_WEBHOOK_SECRET` | RevenueCat 결제 알림 인증 |
| `NEIS_API_KEY` | 학교 검색·급식 조회. 미설정 시 NEIS 기본 응답을 사용 |
| `DATABASE_URL` | 선택적 PostgreSQL 시범 기능. 현재 앱 데이터 저장소는 Firestore |

Firebase 웹 설정과 RevenueCat 공개 SDK 키는 앱 로그인·결제를 위한 공개 식별자입니다. 관리자용 비밀키와는 용도가 다릅니다. 각 화면에 별도의 새 API 키를 발급할 필요는 없습니다.

화면의 **관리 데이터 조회 서버**에서 운영 서버와 이 컴퓨터의 서버를 전환할 수 있습니다. 로컬 `.env`에는 현재 Gemini 키만 있으므로 Firestore·RevenueCat 관리 조회는 로컬에서 준비되지 않았습니다. Render 환경변수 값은 이 저장소에서 확인하거나 복사할 수 없습니다.

## 현재 조회 기능

- 전체 현황: Firestore 회원 수, PRO 회원 수, 서버 연동 설정 여부
- 회원·로그인: Firestore의 `users` 문서 최대 30건. Firebase Auth 전체 목록과는 다를 수 있음
- 데이터베이스: Firestore 사용 여부와 PostgreSQL 접속 응답
- AI·사용량: 무료/PRO 월 한도, 이번 달 AI 사용 회원 수, 로그인한 관리자 본인의 사용량
- 똑 PRO·결제: RevenueCat 서버 키·웹훅 설정과 로그인한 관리자 본인의 구독 권한
- 학교·급식: NEIS 학교 검색 응답
- API·서버: 구현된 API 경로와 인증 필요 여부
- 보안·백업: 관리 접근 설정과 서버 비밀값 설정 여부. 실제 백업 실행 기능은 없음

키 설정 여부는 불리언으로만 응답하고 키 원문은 반환하지 않습니다. 관리자 조회 기능은 프로덕션 서버에 새 코드를 배포한 뒤 사용할 수 있습니다.
