# 똑 앱 보안 검토 인계서 (2026-11-19)

## 검토 범위

이 묶음은 React/Vite/Capacitor 앱, Express API, Firebase Auth/Firestore, RevenueCat, Android 빌드 코드를 포함한다. 실제 Render 환경변수, Firebase 운영 규칙, Play Console 상품 및 RevenueCat 대시보드 상태는 포함하지 않는다. 운영에 반영되었다고 추정하지 말 것.

## 먼저 읽을 파일

1. `server.ts`: 인증 순서, 본문 크기, AI 사용량, 관리자 API, 웹훅, 계정 삭제.
2. `services/usageService.ts`, `services/aiQuotaStore.ts`, `services/entitlements.ts`, `services/creditPolicy.ts`: 토큰 검증, 활성 월별/선택형 v6 제한, **미연결 v7 크레딧 엔진**.
3. `services/revenueCatService.ts`, `src/services/purchaseService.ts`, `src/components/V6PaywallModal.tsx`: 서버 결제 검증과 클라이언트 상품 조회.
4. `services/ai/geminiProvider.ts`, `src/lib/api.ts`: AI 키 보관, 모델 호출, 요청 ID.
5. `firestore.rules`, `firebase.json`, `src/lib/firebase.ts`: 소유자 권한, 서버 관리 필드, named DB.
6. `services/sharedStudyPersonal.ts`, `services/sharedRoomsService.ts`, `src/services/sharedStudy.ts`: 똑타임 연동. 공유 목표·친구는 이전 사용자 결정에 따라 제외 유지.
7. `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/release/AndroidManifest.xml`, `.github/workflows/android-release.yml`: 출시 서명, 백업, 평문 통신, 빌드 비밀값.

## 중요한 현재 상태

- 운영 기본값은 무료 월 30회/Pro 월 100회. `MONETIZATION_V6_ENABLED=true`일 때만 v6 제한을 쓴다. 새 v7 Free 500/일, Basic 30,000/월, Pro 100,000/월, Max 300,000/월은 `services/creditPolicy.ts`의 순수 계산 코드만 있다. Firestore 저장, 결제 검증, Gemini 정산 및 UI 연결이 아직 없다.
- 크레딧 엔진의 금액은 실제 Gemini 요금이 아니다. 모델별 요금은 서버 설정과 공식 가격표로 검증해야 하며, 요금 누락 시 호출을 거부해야 한다.
- 기존 Plus 또는 연간/레거시 Pro 구독은 새 상품으로 자동 전환하면 안 된다. 새 가격은 앱 화면 문자열로 정하지 않고 Play Console의 실제 상품에서 설정한다.
- 운영 Firestore 규칙·Functions·요금제·결제 테스트를 이 묶음만으로 검증할 수 없다.
- 학생 대상 앱이므로 개인정보, 미성년자 동의, 광고, 계정 삭제, 결제 안내를 함께 검토해야 한다.
- `npm audit fix`로 `fast-xml-parser` 관련 취약 의존성을 갱신했다. 현재 `npm audit`에는 `@google-cloud/firestore-api` 하위 `glob`/`minimatch` 경로의 보통 위험도 4건이 남아 있다. 실제 사용자 입력으로 해당 코드에 도달 가능한지와 안전한 상위 패키지 갱신 경로를 검토해 달라.
- 소스 검토용 ZIP에서는 `services/schoolIdentity.ts`와 `src/lib/firebase.ts`에 있는 Firebase 클라이언트 식별 키를 `REDACTED_FOR_SECURITY_REVIEW`로 치환했다. 저장소 원본은 바꾸지 않았다.

## 우선 보안 질문

1. Firebase ID 토큰의 서명·발급자·대상·이메일 인증 상태 확인이 모든 유료/쓰기 경로보다 먼저 실행되는가? `X-App-Secret`은 신뢰하지 않는가?
2. 월별/크레딧 차감이 동시 요청·재시도·서버 종료·영구적인 요청 ID 중복에서 과금과 우회 없이 정합성을 유지하는가?
3. RevenueCat 웹훅 재전송, 환불, 취소, 지연 갱신, 계정 이전에서 권한이 정확히 부여·회수되는가? 비밀키가 로그나 클라이언트 번들에 들어가지 않는가?
4. Firestore 규칙이 클라이언트의 `isPremium`, 사용량, 지갑, 지급 기록, 이벤트 보상을 쓰지 못하게 막는가? named DB에 실제 배포된 규칙과 같은가?
5. 이미지·영상·텍스트·채팅 입력의 크기/타입 상한 및 Gemini 출력 토큰/비용 상한이 충분한가? 캐시가 다른 계정의 정보를 반환하지 않는가?
6. 계정 삭제 시 인증 계정, 프로필, 하위 컬렉션, 캐시, RevenueCat 식별자의 처리와 삭제 요청 페이지 안내가 일치하는가?
7. 관리자 UID와 이벤트 심사 권한이 서버에서 검증되며 학생의 학습 데이터와 로그가 불필요하게 노출되지 않는가?
8. Android 릴리스 빌드에서 디버그 정보/키, 서버 소스맵, 웹 편집 도구가 노출되지 않는가? App Check 부재가 남기는 위험은 무엇인가?

## 재현 및 검증

```
npm ci
npm run lint
npm run build
npm run test:security
npx tsx --test tests/entitlements.test.mjs tests/ai-quota-products.test.mjs tests/credit-policy.test.mjs
```

에뮬레이터 규칙 테스트는 `demo-ddok-shared` 등 별도 데모 프로젝트에서만 실행한다. 운영 Firestore 규칙이나 Functions는 검토만으로 배포하지 않는다. 실제 결제·환불, iOS, Play 배포 상태는 운영 콘솔과 실기기에서 별도 확인한다.

## 검토 결과 형식

심각도, 파일·행, 재현 단계, 실제 영향, 수정 방법, 검증 방법을 항목별로 기록해 달라. 확인하지 못한 운영 설정은 추정이라고 표시해 달라. 비밀값·학생 데이터·실제 UID는 보고서에 포함하지 말아 달라.
