# 보안 수정 배포 순서

1. Firebase 콘솔에서 프로젝트 `gen-lang-client-0685740024`, Firestore 데이터베이스 `ai-studio-22fbd27c-5516-4028-bd17-a6d4ba99710b`를 선택하고 이 저장소의 `firestore.rules`를 먼저 게시한다. 특히 `deletedAccounts/{uid}` 존재 여부를 확인하는 `isOwner` 규칙이 필요하다.
2. Render의 `FIREBASE_SERVICE_ACCOUNT_KEY`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `GEMINI_API_KEYS` 설정을 확인한다. `NODE_VERSION`은 기존 `22.11.0` 대신 `render.yaml`의 `22.22.0` 이상인지 확인한다. 삭제 기능은 RevenueCat Secret API Key가 없거나 해당 API가 실패하면 오류를 반환한다. 앱에 비밀키를 넣지 않는다.
3. 새 서버를 Render에 배포한다. 기존 앱도 Firebase ID 토큰을 전송하는지 확인한 뒤 진행한다. `X-App-Secret`만 보내는 오래된 앱은 보호된 API에서 401을 받는다.
4. 배포 뒤 `/api/health`는 200, 인증 없는 `/api/school/search`는 401, `/server.cjs.map`은 소스맵이 아닌 HTML 응답인지 확인한다. 인증된 학교 검색, AI 요청 성공/실패 시 사용량, 무료 계정의 AI 리포트 403 및 사용량 유지, 유료 결제 웹훅을 실제 계정으로 확인한다.
5. GitHub Pages에 `docs/data-deletion.html`을 게시하고 Play Console의 계정 삭제 링크가 새 페이지를 가리키는지 확인한다. 계정 삭제는 최근 5분 이내 로그인 상태가 필요하며, Google Play 구독 해지는 별도다.
6. Firebase에 등록된 공개 디버그 키의 SHA-1을 제거하기 전에 배포용 로그인 지문이 등록되어 있는지 확인한다. 이후 디버그 키 지문을 제거하고 내부 테스트용 로그인은 별도 안전한 키로 구성한다.

현재 자동 테스트는 인증 경계와 웹/Android 디버그 빌드를 확인한다. 실제 Firestore, RevenueCat, Firebase Auth 삭제와 iOS 기기 동작은 운영 설정에 연결해 별도 확인해야 한다. 캐시 정리 쿼리가 Firestore 인덱스를 요구하면 로그의 생성 링크로 해당 컬렉션 그룹 단일 필드 인덱스를 추가해야 한다.
