# 크레딧 서버 연결 상태

2026-11-19. 코드 구현과 운영 적용은 구분한다.

## 구현한 경로

- `MONETIZATION_V7_ENABLED=true`일 때 인증된 AI 라우트에 요청별 크레딧 문맥을 전달한다.
- RevenueCat Secret API로 구독을 확인하고 명시적으로 매핑한 상품만 Basic/Pro/Max 크레딧을 지급한다. 기존 상품은 기존 한도를 유지한다.
- 무료는 KST 자정 경계로 일일 500 지급. 구독 갱신은 결제 기간 ID로 한 번만 지급한다.
- Firestore `users/{uid}/aiWallet/main`에 지갑, `aiRequests/{requestId}`에 영구 중복 방지 기록을 저장한다. Admin SDK 트랜잭션만 쓴다. 기존 rules의 기본 거부가 클라이언트 직접 접근을 차단한다.
- Gemini countTokens로 입력량을 확인하고 출력 상한으로 예약한다. 응답 usageMetadata로 실제 차감하고 실패는 반환한다. 응답 이후 저장 실패는 예약을 유지해 잘못된 무료 사용을 방지한다.
- 앱 설정 화면의 크레딧 잔액과 신규 구독 화면을 연결했다. 실제 스토어 상품 가격을 사용한다.

## 서버 환경변수

```
MONETIZATION_V7_ENABLED=false
CREDIT_GEMINI_MODEL=gemini-2.5-flash-lite
CREDIT_PRODUCT_MAP_JSON={"실제_새_Basic상품ID":"basic","실제_새_Pro상품ID":"pro","실제_새_Max상품ID":"max"}
CREDIT_MODEL_RATES_JSON={"실제모델ID":{"inputUsdPerMillion":0.1,"outputUsdPerMillion":0.4,"cachedInputUsdPerMillion":0.01,"audioInputUsdPerMillion":0.3}}
```

요금 숫자는 설정 예시이며 출시 전 공식 Gemini 가격표와 대조한다. 기존 RevenueCat 비밀키, Gemini 키, Firebase Admin 인증이 필요하다. 서버에서만 설정하고 클라이언트에 전달하지 않는다. 기존 상품 ID를 신규 상품에 잘못 매핑하면 기존 구독 혜택이 변경되므로 새 상품만 매핑한다.

## 운영 활성화 전 남은 검증

- 운영 환경변수·신규 상품 생성·가격 변경·배포는 이번 코드 작업에서 수행하지 않았다.
- Firestore 실제 트랜잭션 동시성, 실기기 결제/환불/갱신, iOS 및 동영상/오디오별 원가 계산을 검증해야 한다. 알 수 없는 modality나 사용량은 오류 처리한다.
- 서버 강제 종료 후 남은 예약의 자동 복구와 usageMetadata 누락/정산 실패의 관리자 재정산 기능은 아직 없다. 해당 요청은 aiRequests에서 확인하고 운영자가 검토해야 한다.
- App Check, 크레딧 사용 내역 화면, Max 고급 모델 선택/상호 배타적 구독 변경, 프로모션/광고 크레딧은 아직 미구현이다.
- Pro+Max가 동시에 결제되는 구성을 스토어에서 막고, 기존 Plus/Pro의 구독 이전 정책을 정하기 전까지 v7 플래그를 켜지 않는다.

## 검증 명령

```
npm run lint
npm run build
npm run test:security
npx tsx --test tests/credit-policy.test.mjs tests/credit-products.test.mjs
```
