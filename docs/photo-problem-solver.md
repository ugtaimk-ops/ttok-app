# 사진 문제 풀이

## 사용 흐름

공부 탭의 「사진 문제 풀이」에서 촬영하거나 갤러리 사진을 선택하고 「이 문제 풀기」를 누른다. Android에서는 ML Kit의 기기 내 OCR을 먼저 시도한다. OCR 문자열 전체가 단일 사칙연산·분수식·일차방정식으로 엄격하게 해석될 때만 math.js의 분수 계산과 제한된 일차식 로직으로 풀이한다. 그 외에는 원본 사진을 서버의 Gemini 2.5 Flash-Lite에 보낸다. iOS에서는 현재 SPM 빌드와 호환되는 OCR 플러그인이 없어 사진을 서버로 보낸다. 웹도 같은 서버 경로를 사용한다.

AI가 글자나 조건을 충분히 읽지 못하면 임의의 답 대신 재촬영을 안내한다. AI 풀이도 오류 가능성이 있어 학생이 인식된 문제와 사진을 대조하도록 표시한다.

## 사용량과 비용

- 로컬 계산: Gemini 호출 없음, 월간 AI 사용량 차감 없음.
- 서버 AI: Firebase 로그인 토큰으로 인증하며 기존 월 무료 50회 / PRO 150회 한도를 적용한다.
- 동일 계정의 동일 사진: SHA-256 해시로 Firestore에 저장한 풀이를 30일 동안 재사용한다. 서버 프로세스 안의 동시 요청도 하나로 합친다. 저장된 풀이 재조회는 한도를 추가 차감하지 않는다. 사진을 다시 인코딩하거나 잘라내면 다른 해시가 된다.
- `users/{uid}`에 `aiProblemSolveCalls`, `aiEstimatedCostMonth`, `aiEstimatedCostUsd`를 기록한다. 기본 추정액은 성공 요청당 미화 0.002달러이며 실제 청구액이 아니다. 서버 환경변수 `GEMINI_SOLVE_ESTIMATED_USD`로 바꿀 수 있다. 기존 `aiUsageCount`도 성공 여부와 무관하게 Gemini 호출 전에 차감된다.
- Gemini API 키는 서버의 `GEMINI_API_KEYS` 또는 `GEMINI_API_KEY` 환경변수에서만 읽는다. 앱에는 넣지 않는다.
- `firestore.rules`를 Firebase Console에 게시해야 새 비용 기록 필드를 클라이언트가 임의로 수정하지 못한다. 서버의 Admin SDK는 규칙과 무관하게 기록한다.

## 설치한 패키지와 네이티브 코드

- npm: `mathjs` (`npm install mathjs`)
- Android Gradle: `com.google.mlkit:text-recognition:16.0.1`
- Android 로컬 Capacitor 플러그인: `ProblemOcrPlugin.java`를 `MainActivity.java`에 등록. iOS에는 새 패키지를 추가하지 않았다.
- 네이티브 변경을 반영한 새 앱 패키지는 `npm run build`, `npx cap sync android`, Android 빌드 순서로 만들어야 한다. 웹 코드만 갱신하면 Android OCR 플러그인은 설치되지 않는다.

## 수동 확인 방법

1. Android와 iOS에서 카메라·갤러리 양쪽으로 선명한 한 문제 사진을 선택한다.
2. Android에서 `1/2 + 1/3`, `(2+3)*4`, `2x+3=7`을 촬영해 답과 풀이를 확인한다. 로컬 처리 시 무료/PRO 사용량이 증가하지 않아야 한다.
3. 도형, 서술형, 다른 과목, 식을 판독할 수 없는 사진은 서버 경로 또는 재촬영 안내로 이어지는지 확인한다.
4. 같은 사진으로 두 번 요청해 두 번째에 `저장된 AI 풀이`가 표시되고 사용량이 추가 증가하지 않는지 확인한다.
5. 무료 50회, PRO 150회 경계에서 서버가 초과 요청을 거부하는지 확인한다. 월 변경 시 사용량이 초기화되는지도 확인한다.
6. iOS에서는 OCR 문구 없이 사진 업로드 및 서버 풀이가 가능한지 확인한다.

## 제약

Android OCR 결과는 신뢰도 수치를 제공하지 않으므로 로컬 계산은 매우 좁은 식 패턴에만 적용한다. 필기체, 여러 문항, 복잡한 수식은 서버 AI로 보낸다. Firebase 캐시는 동일 사진의 재호출을 줄이지만 업로드 이미지를 바꾸면 다시 차감된다. 실제 Gemini 요금과 추정액은 다를 수 있다.
