# 똑 백엔드를 웹 서버(VPS)에서 운영하기

현재 앱의 백엔드는 Render의 `https://ttok-backend.onrender.com`을 가리킵니다. 이 문서는 별도의 Ubuntu VPS에 Node 서버를 올릴 때 쓰는 예시입니다. VPS 계정과 공개 HTTPS 주소를 만들기 전에는 기존 Render를 중단하지 마세요.

Oracle Cloud Always Free 같은 무료 VPS에도 CPU·메모리·트래픽·계정 정책 제한이 있습니다. Gemini, Firebase/Firestore, RevenueCat의 이용 조건과 앱의 무료·PRO AI 사용 횟수는 서버를 옮겨도 유지됩니다.

## 구성

- Ubuntu ARM64 또는 x64 VPS. Node.js 22 이상과 Caddy를 설치합니다.
- 무료 DuckDNS 주소 또는 본인 도메인의 DNS를 VM 공인 IP에 연결합니다.
- VPS 방화벽과 클라우드 보안 규칙에서 TCP 80·443만 웹 공개용으로 허용합니다. SSH는 필요한 관리자 주소에서만 접근하도록 제한합니다. Node 3000 포트는 외부에 열지 않습니다.
- `Caddyfile.example`을 실제 호스트명으로 바꾸고 Caddy에 적용합니다. Caddy는 HTTPS 인증서를 발급·갱신하고 `127.0.0.1:3000`으로 전달합니다.
- `ttok.service.example`을 `/etc/systemd/system/ttok.service`에 맞게 설치합니다. 배포 디렉터리 `/opt/ttok`과 실행 사용자 `ttok`을 먼저 만듭니다. Node 경로가 `/usr/bin/node`인지 확인하세요.

## 서버 빌드

서버에서 프로젝트를 `/opt/ttok`에 배치하고 다음을 실행합니다.

```bash
cd /opt/ttok
npm ci
APP_URL=https://ttok-example.duckdns.org npm run build
```

프로젝트 루트의 `.env`에 Render와 동일한 서버 비밀값(`GEMINI_API_KEYS` 또는 `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_SECRET_API_KEY`, 선택적으로 `NEIS_API_KEY`)을 넣고 파일 권한을 실행 사용자만 읽도록 제한합니다. JSON 서비스 계정 키·비밀값을 Git, `dist`, 앱 빌드 변수에 넣지 마세요. 현재 개발 PC의 `.env`에는 이 중 Firebase 서비스 계정과 RevenueCat 서버 비밀값이 없어, 그대로 복사하면 유료 기능·사용량 추적이 동작하지 않습니다.

서버를 시작한 뒤 로컬 `http://127.0.0.1:3000/api/health`, 외부 `https://실제주소/api/health`를 차례로 확인합니다. 그다음 Firebase 인증을 동반한 AI 요청과 RevenueCat 웹훅 테스트를 확인하세요.

## 기존 앱 전환

1. 새 서버의 AI, 급식, 로그인 후 사용량 조회, 결제 웹훅이 정상 동작할 때까지 Render를 유지합니다.
2. RevenueCat 웹훅 주소를 `https://실제주소/revenuecat/webhook`으로 옮깁니다.
3. GitHub Actions의 `APP_URL` 변수를 새 HTTPS 주소로 변경하고 새 APK/AAB를 빌드·배포합니다. 기존에 설치된 앱은 빌드 당시 Render 주소를 계속 사용합니다.
4. 사용자 업데이트가 충분히 진행된 뒤에 Render 중단을 결정합니다.
