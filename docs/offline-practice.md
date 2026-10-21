# 발표 연습: 기기 내 분석

## 데이터 경계

`OfflinePractice`는 카메라와 마이크에 접근합니다. 영상·음성 원본은 앱 서버에 전송하거나 저장하지 않습니다. 선택적으로 켜는 네이티브 음성 인식은 Android/iOS의 음성 인식 서비스를 사용하며, 기기 설정 및 서비스에 따라 음성이 운영체제 제공자의 서버에서 처리될 수 있습니다. 따라서 음성 인식은 오프라인 동작을 보장하지 않습니다. 발표가 끝나면 트랙, Web Audio 컨텍스트, 음성 인식을 닫습니다. 화면을 떠나거나 앱이 배경으로 가면 측정을 일시정지하고 자원을 닫습니다. 현재 연습 결과와 인식된 문장은 사용자별 `localStorage`에 최대 20개 저장되며 UI에서 삭제할 수 있습니다. 기존 버전이 이미 클라우드에 저장했던 과거 연습 로그를 자동 삭제하지는 않습니다.

대본 작성 등 다른 기능은 기존 Gemini API를 그대로 사용합니다. 서버의 과거 `/api/practice/analyze` Gemini 평가 경로는 제거했고, 구버전 앱 요청에는 새 앱으로 업데이트하라는 410 응답만 반환합니다.

## 구현과 해석

- 얼굴·상체: 번들된 MediaPipe Face Landmarker와 Pose Landmarker Lite를 5FPS 이하로 호출하고 느린 기기에서는 자동으로 간격을 늘립니다. 얼굴 랜드마크의 코-양쪽 볼 상대 위치로 **카메라 방향 응시를 추정**할 뿐 실제 눈의 시선을 추적하지 않습니다. 어깨 기울기와 상체 중심의 움직임은 카메라 각도에 영향을 받습니다. 자세 분석은 끌 수 있습니다.
- 목소리: Web Audio RMS를 dBFS로 변환합니다. 상대 음량만 표시하며 dB SPL 측정값으로 해석하면 안 됩니다.
- 발화·침묵: 마이크 입력의 에너지와 적응형 바닥 소음 임계값을 이용한 간단한 VAD입니다. Silero/WebRTC 수준의 음성 분류가 아니므로 소음·음악은 발화로 잘못 감지될 수 있습니다. 2초 이상 무발화 구간과 최장 구간은 이 신호를 토대로 계산합니다.
- 시간: `performance.now()`의 일시정지 제외 경과 시간과 목표 시간을 비교합니다.
- 점수: 전달력 30, 얼굴 방향 20, 자세 20, 말하기 속도 20, 시간 10 가중치입니다. 표본이 부족하거나 비활성화된 항목은 `분석 불가`로 표시하고 남은 항목 가중치만으로 100점 환산합니다. 이는 앱의 연습용 지표이며 절대적인 발표 능력 평가가 아닙니다. 피드백 문장의 숫자는 측정 집계에서만 가져옵니다.

## 한국어·영어 음성 인식

기존 `@capgo/capacitor-speech-recognition` 플러그인을 사용하며, 시작 화면에서 한국어(`ko-KR`) 또는 영어(`en-US`)를 선택합니다. `continuousPTT` 및 부분 결과로 발표 중 실제 인식된 문장만 자막으로 표시합니다. 권한 거부·서비스 부재·오류일 때는 이유를 표시하고 카메라·마이크 신호 분석은 계속합니다. 일시정지, 화면 이탈, 백그라운드 전환, 종료 때 인식을 중단합니다. 현재 Chrome 웹에서는 음성 인식을 제공하지 않습니다. 인식 오류 가능성이 있어 발음과 말하기 속도 점수는 계속 `분석 불가`로 둡니다.

완전 오프라인 음성 인식 후보 검토 기록:

| 후보 | 장점 | 현재 미선택 사유 |
| --- | --- | --- |
| Android 온디바이스 `SpeechRecognizer` | OS 음성 모델 활용 가능 | 지원 기기·언어 확인과 전용 네이티브 브리지 필요 |
| Apple `requiresOnDeviceRecognition` | 지원 기기에서 오디오의 네트워크 전송 방지 | `supportsOnDeviceRecognition` 확인과 전용 네이티브 브리지 필요 |
| Vosk 한국어 소형 모델 | Apache 2.0, 기기에 모델 포함 가능 | 모델 약 82MB, 런타임 메모리 약 300MB; 양 플랫폼 브리지와 정확도 검증 필요 |

## 번들 자산과 크기

- `@mediapipe/tasks-vision@0.10.32` (Apache 2.0). JS는 화면 진입 때 동적 로드합니다.
- Face Landmarker: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, SHA-256 `64184E229B263107BC2B804C6625DB1341FF2BB731874B0BCC2FE6544E0BC9FF`.
- Pose Landmarker Lite: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`, SHA-256 `59929E1D1EE95287735DDD833B19CF4AC46D29BC7AFDDBBF6753C459690D574A`.
- 모델 2개와 SIMD/일반 WASM 총 **32,047,415바이트**(압축 전). APK/AAB 실제 증가량은 압축과 기기 구성에 따라 다릅니다.
- 모델과 WASM은 `public/offline-practice`에서 앱 패키지로 복사되며 런타임 CDN 다운로드가 없습니다. MediaPipe 문서상 영상·음성 입력 처리는 기기 내에서 실행됩니다. SDK 성능·사용 지표 처리에 관한 공지는 앱 개인정보처리방침에서 별도로 확인해야 합니다.

## 확인할 항목

1. `npm run lint`, `npm run build`, `npx cap sync android`와 Android/iOS CI 빌드를 확인합니다.
2. 실제 Android/iOS 기기에서 비행기 모드, 카메라/마이크 거부, 카메라 전환, 1/3/5분·직접 입력, 중간 일시정지, 앱 백그라운드 전환, 긴 발표, 기록 삭제를 확인합니다.
3. 프록시나 패킷 검사로 발표 연습 중 사진·영상·오디오 업로드 요청이 없음을 확인합니다.

실제 기기에서 아직 수행하지 않은 항목은 검증 완료로 기록하지 않습니다.
