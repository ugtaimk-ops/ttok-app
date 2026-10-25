# 똑 화면 요소 지도 (자동 생성 — 직접 고치지 마세요)

`npm run ui:map` 을 실행하면 이 파일이 새로 만들어집니다. 사용법은 UI_GUIDE.md 를 보세요.

## 공통  (스타일 파일: src/ui-design/common.css)

| 이름(data-ui) | 무엇인가 | 코드 위치 |
|---|---|---|
| `header-mode-tok` | 상단 서비스 전환: 똑 | src/App.tsx:726 |
| `header-mode-kkorureuk` | 상단 서비스 전환: 꼬르륵 | src/App.tsx:736 |
| `header-profile` | 우측 상단 프로필 열기 | src/App.tsx:754 |
| `nav-bar` | 하단 탭 바 전체(떠 있는 유리 막대) | src/components/BottomNavigationBar.tsx:137 |
| `nav-home` | 하단 탭: 홈 | src/components/BottomNavigationBar.tsx:189 |
| `nav-assessment` | 하단 탭: 수행평가 | src/components/BottomNavigationBar.tsx:189 |
| `nav-practice` | 하단 탭: 발표연습 | src/components/BottomNavigationBar.tsx:189 |
| `nav-study` | 하단 탭: 공부 | src/components/BottomNavigationBar.tsx:189 |
| `nav-settings` | 하단 탭: 메뉴(설정) | src/components/BottomNavigationBar.tsx:189 |
| `nav-meal-today` | 하단 탭(꼬르륵): 오늘 급식 | src/components/BottomNavigationBar.tsx:189 |
| `nav-meal-weekly` | 하단 탭(꼬르륵): 이번 주 급식 | src/components/BottomNavigationBar.tsx:189 |
| `nav-meal-school` | 하단 탭(꼬르륵): 학교 설정 | src/components/BottomNavigationBar.tsx:189 |
| `back-button` | 뒤로가기/취소 버튼(여러 화면 공통) | src/components/BackButton.tsx:9 |
| `select-trigger` | 드롭다운 선택 상자(열기 버튼) | src/components/GlassSelect.tsx:86 |
| `select-option` | 드롭다운 선택 항목 하나하나 | src/components/GlassSelect.tsx:123 |
| `error-reload` | 오류 화면의 다시 시작하기 | src/components/ErrorBoundary.tsx:37 |
| `gate-terms-retry` | 약관 확인 실패 화면: 다시 시도 | src/App.tsx:701 |
| `gate-logout` | 약관 확인 실패 화면: 로그아웃 | src/App.tsx:702 |

## 로그인  (스타일 파일: src/ui-design/login.css)

| 이름(data-ui) | 무엇인가 | 코드 위치 |
|---|---|---|
| `login-google` | Google 로그인 버튼 | src/components/LoginScreen.tsx:222 |
| `login-password-toggle` | 비밀번호 보이기/숨기기 눈 아이콘 | src/components/LoginScreen.tsx:295 |
| `login-password-reset` | 비밀번호를 잊으셨나요? | src/components/LoginScreen.tsx:306 |
| `login-email-submit` | 이메일로 계속하기 | src/components/LoginScreen.tsx:316 |
| `email-verify-check` | 이메일 인증 확인하고 계속하기 | src/components/EmailVerificationScreen.tsx:92 |
| `email-verify-resend` | 인증 메일 다시 보내기 | src/components/EmailVerificationScreen.tsx:103 |
| `email-verify-logout` | 다른 계정으로 로그인 | src/components/EmailVerificationScreen.tsx:113 |
| `terms-agree` | 이용약관 동의하고 시작 | src/components/TermsConsentScreen.tsx:46 |
| `terms-decline-logout` | 동의하지 않고 로그아웃 | src/components/TermsConsentScreen.tsx:50 |

## 홈  (스타일 파일: src/ui-design/home.css)

| 이름(data-ui) | 무엇인가 | 코드 위치 |
|---|---|---|
| `home-shortcut-edit-toggle` | 자주 쓰는 기능: 단축키 수정/편집 완료 | src/components/HomeScreen.tsx:476 |
| `home-shortcut-item` | 자주 쓰는 기능 카드 하나하나 | src/components/HomeScreen.tsx:491 |
| `home-shortcut-feature-option` | 단축키 변경 팝업: 연결할 기능 선택 항목 | src/components/HomeScreen.tsx:547 |
| `home-shortcut-cancel` | 단축키 변경 팝업: 취소 | src/components/HomeScreen.tsx:578 |
| `home-shortcut-save` | 단축키 변경 팝업: 변경하기 | src/components/HomeScreen.tsx:584 |
| `home-schedule-add` | 스케줄 추가(열기/닫기) 버튼 | src/components/HomeScreen.tsx:749 |
| `home-schedule-add-close` | 스케줄 추가 폼: 닫기(X) | src/components/HomeScreen.tsx:773 |
| `home-schedule-add-submit` | 스케줄 추가 폼: 등록 | src/components/HomeScreen.tsx:819 |
| `home-schedule-edit-close` | 스케줄 수정 폼: 닫기(X) | src/components/HomeScreen.tsx:842 |
| `home-schedule-edit-save` | 스케줄 수정 폼: 저장 | src/components/HomeScreen.tsx:888 |
| `home-schedule-edit` | 스케줄 카드의 수정 아이콘 | src/components/HomeScreen.tsx:930 |
| `home-schedule-delete` | 스케줄 카드의 삭제 아이콘 | src/components/HomeScreen.tsx:940 |
| `ai-report-refresh` | AI 리포트 새로고침 아이콘 | src/components/AiReportCard.tsx:76 |
| `ai-report-generate` | AI 리포트: 지금 뭘 하면 좋을지 물어보기 | src/components/AiReportCard.tsx:96 |

## 수행평가  (스타일 파일: src/ui-design/assessment.css)

| 이름(data-ui) | 무엇인가 | 코드 위치 |
|---|---|---|
| `assessment-add-direct` | 목록 상단: 직접 입력 | src/components/AssessmentScreen.tsx:399 |
| `assessment-add-photo` | 목록 상단: 사진 등록 | src/components/AssessmentScreen.tsx:403 |
| `assessment-empty-add-direct` | 일정이 없을 때: 직접 입력 | src/components/AssessmentScreen.tsx:417 |
| `assessment-empty-add-photo` | 일정이 없을 때: 이미지/계획서 등록 | src/components/AssessmentScreen.tsx:423 |
| `assessment-item-edit` | 일정 카드의 수정 | src/components/AssessmentScreen.tsx:341 |
| `assessment-item-delete` | 일정 카드의 삭제 | src/components/AssessmentScreen.tsx:351 |
| `assessment-direct-cancel` | 직접 입력 화면: 취소 | src/components/AssessmentScreen.tsx:534 |
| `assessment-direct-save` | 직접 입력 화면: 완료 및 저장 | src/components/AssessmentScreen.tsx:541 |
| `assessment-photo-back` | 사진 등록 화면: 돌아가기 | src/components/AssessmentScreen.tsx:616 |
| `assessment-scan-retry` | 사진 스캔 결과: 다시 스캔 | src/components/AssessmentScreen.tsx:721 |
| `assessment-scan-save` | 사진 스캔 결과: 캘린더 및 알림 자동 등록 | src/components/AssessmentScreen.tsx:728 |
| `assessment-menu-edit` | 길게 누름 메뉴: 일정 수정 | src/components/AssessmentScreen.tsx:750 |
| `assessment-menu-delete` | 길게 누름 메뉴: 일정 삭제 | src/components/AssessmentScreen.tsx:757 |
| `assessment-edit-cancel` | 수정 팝업: 취소 | src/components/AssessmentScreen.tsx:853 |
| `assessment-edit-save` | 수정 팝업: 저장하기 | src/components/AssessmentScreen.tsx:859 |
| `assessment-delete-cancel` | 삭제 확인 팝업: 취소 | src/components/AssessmentScreen.tsx:888 |
| `assessment-delete-confirm` | 삭제 확인 팝업: 삭제하기 | src/components/AssessmentScreen.tsx:894 |
| `assessment-tab-list` | 수행평가 일정 탭 | src/components/AssessmentScreen.tsx:286 |
| `assessment-tab-planner` | 지필·수행 계획 탭 | src/components/AssessmentScreen.tsx:291 |
| `study-exam-add` | 지필평가 일정 등록 | src/components/ExamPlanner.tsx:107 |
| `study-exam-edit` | 지필평가 일정 수정 | src/components/ExamPlanner.tsx:122 |
| `study-exam-delete` | 지필평가 일정 삭제 | src/components/ExamPlanner.tsx:123 |
| `study-plan-generate` | 학습 계획 보기 | src/components/ExamPlanner.tsx:124 |
| `study-edit-save` | 지필평가 수정 저장 | src/components/ExamPlanner.tsx:151 |
| `study-delete-confirm` | 지필평가 삭제 확인 | src/components/ExamPlanner.tsx:161 |

## 발표연습  (스타일 파일: src/ui-design/practice.css)

| 이름(data-ui) | 무엇인가 | 코드 위치 |
|---|---|---|
| `practice-tab-script` | 위쪽 탭: 발표 대본 작성 | src/components/PracticeScreen.tsx:781 |
| `practice-tab-practice` | 위쪽 탭: 발표 연습 도와주기 | src/components/PracticeScreen.tsx:791 |
| `practice-script-generate` | AI 발표 대본 만들기 버튼 | src/components/PracticeScreen.tsx:920 |
| `practice-saved-open` | 저장된 대본 카드(눌러서 열기) | src/components/PracticeScreen.tsx:1017 |
| `practice-saved-load` | 저장된 대본: 불러오기 | src/components/PracticeScreen.tsx:1036 |
| `practice-saved-delete` | 저장된 대본: 삭제 | src/components/PracticeScreen.tsx:1044 |
| `practice-script-copy` | 대본 보기 팝업: 복사 | src/components/PracticeScreen.tsx:654 |
| `practice-script-edit-toggle` | 대본 보기 팝업: 편집/저장 | src/components/PracticeScreen.tsx:662 |
| `practice-script-pdf` | 대본 보기 팝업: PDF 저장 | src/components/PracticeScreen.tsx:687 |
| `practice-script-share` | 대본 보기 팝업: 공유 | src/components/PracticeScreen.tsx:695 |
| `practice-script-textsize` | 대본 보기 팝업: 글자 크기 선택 | src/components/PracticeScreen.tsx:726 |
| `practice-script-close` | 대본 보기 팝업: 닫기 | src/components/PracticeScreen.tsx:1793 |
| `practice-prompter-textsize` | 프롬프터 글자 크기 선택 | src/components/PracticeScreen.tsx:1130 |
| `practice-prompter-hide` | 프롬프터 숨기기 | src/components/PracticeScreen.tsx:1141 |
| `practice-prompter-show` | 대본 프롬프터 켜기 | src/components/PracticeScreen.tsx:1155 |
| `practice-stop-analyze` | 연습 종료 및 AI 종합 분석 | src/components/PracticeScreen.tsx:1187 |
| `practice-analysis-retry` | 분석 다시 시도 | src/components/PracticeScreen.tsx:1206 |
| `practice-analysis-clear` | 분석 오류 지우기 | src/components/PracticeScreen.tsx:1208 |
| `practice-permission-allow` | 카메라 권한 직접 허용하기 | src/components/PracticeScreen.tsx:1248 |
| `practice-permission-reconnect` | 기기 다시 연결 및 권한 요청 | src/components/PracticeScreen.tsx:1306 |
| `practice-start` | 발표 연습 시작하기 | src/components/PracticeScreen.tsx:1321 |
| `practice-source-saved` | 연습용 대본: 저장된 대본 목록 | src/components/PracticeScreen.tsx:1356 |
| `practice-source-direct` | 연습용 대본: 텍스트 직접 입력 | src/components/PracticeScreen.tsx:1367 |
| `practice-source-pick-script` | 저장된 대본 하나 선택 | src/components/PracticeScreen.tsx:1384 |
| `practice-source-direct-confirm` | 직접 입력한 대본 확정 | src/components/PracticeScreen.tsx:1429 |
| `practice-retry` | 분석 결과: 다시 연습하기 | src/components/PracticeScreen.tsx:1522 |
| `practice-modal-permission-allow` | 권한 팝업: 다시 연결 및 권한 허용 | src/components/PracticeScreen.tsx:1738 |
| `practice-modal-open-settings` | 권한 팝업: 앱 설정 열기 | src/components/PracticeScreen.tsx:1748 |
| `practice-modal-cancel` | 권한 팝업: 취소 및 닫기 | src/components/PracticeScreen.tsx:1758 |

## 공부  (스타일 파일: src/ui-design/study.css)

| 이름(data-ui) | 무엇인가 | 코드 위치 |
|---|---|---|
| `study-photo-camera` | 사진 문제 풀이: 촬영 | src/components/StudyScreen.tsx:375 |
| `study-photo-gallery` | 사진 문제 풀이: 갤러리 | src/components/StudyScreen.tsx:376 |
| `study-photo-solve` | 사진 문제 풀이 실행 | src/components/StudyScreen.tsx:380 |
| `study-mode-summary` | AI 요약 카드 | src/components/StudyScreen.tsx:315 |
| `study-mode-quiz` | AI 문제생성 카드 | src/components/StudyScreen.tsx:328 |
| `study-mode-note` | AI 오답노트 카드 | src/components/StudyScreen.tsx:341 |
| `study-mode-photo` | 사진 문제 풀이 바로가기 카드 | src/components/StudyScreen.tsx:354 |
| `study-material-pick` | 공부 자료: 사진/파일 선택 박스 | src/components/StudyScreen.tsx:412 |
| `study-material-camera` | 공부 자료: 촬영 박스 | src/components/StudyScreen.tsx:428 |
| `study-run` | 선택한 공부 기능 실행(AI 분석) 버튼 | src/components/StudyScreen.tsx:452 |
| `study-quiz-check` | 퀴즈: 정답 채점 및 해설 보기 | src/components/StudyScreen.tsx:564 |

## 프로필  (스타일 파일: src/ui-design/profile.css)

| 이름(data-ui) | 무엇인가 | 코드 위치 |
|---|---|---|
| `profile-avatar-camera-tab` | 프로필 사진: 사진 촬영 탭 | src/components/ProfileScreen.tsx:400 |
| `profile-avatar-gallery-tab` | 프로필 사진: 사진 선택 탭 | src/components/ProfileScreen.tsx:414 |
| `profile-gallery-choose` | 내 사진 고르기 | src/components/ProfileScreen.tsx:491 |
| `profile-avatar-default` | 기본 프로필로 설정 | src/components/ProfileScreen.tsx:500 |
| `profile-camera-start` | 카메라 켜기 | src/components/ProfileScreen.tsx:476 |
| `profile-camera-capture` | 촬영 버튼 | src/components/ProfileScreen.tsx:467 |
| `profile-camera-retry` | 카메라 다시 시도 | src/components/ProfileScreen.tsx:440 |
| `profile-camera-open-settings` | 카메라 권한: 앱 설정 열기 | src/components/ProfileScreen.tsx:449 |
| `profile-school-search-open` | 학교 검색 열기 | src/components/ProfileScreen.tsx:577 |
| `profile-school-search-close` | 학교 검색 닫기 | src/components/ProfileScreen.tsx:537 |
| `profile-school-pick` | 검색된 학교 한 줄(선택) | src/components/ProfileScreen.tsx:562 |
| `profile-goal-clear-input` | 학기 목표 입력 지우기(X) | src/components/ProfileScreen.tsx:636 |
| `profile-goal-cancel` | 학기 목표 편집: 취소 | src/components/ProfileScreen.tsx:647 |
| `profile-goal-save` | 학기 목표 저장 | src/components/ProfileScreen.tsx:657 |
| `profile-goal-random` | 학기 목표 랜덤 선택(주사위) | src/components/ProfileScreen.tsx:687 |
| `profile-goal-edit` | 학기 목표 수정(연필) | src/components/ProfileScreen.tsx:696 |
| `profile-goal-delete` | 학기 목표 삭제 | src/components/ProfileScreen.tsx:709 |
| `profile-save` | 똑 부러지게 프로필 수정 완료(저장) | src/components/ProfileScreen.tsx:727 |

## 설정·구독  (스타일 파일: src/ui-design/settings.css)

| 이름(data-ui) | 무엇인가 | 코드 위치 |
|---|---|---|
| `settings-dark-mode` | 다크 모드 스위치 | src/components/SettingsScreen.tsx:142 |
| `settings-logout` | 로그아웃 | src/components/SettingsScreen.tsx:293 |
| `settings-terms-open` | 약관 내용 보기 | src/components/SettingsScreen.tsx:315 |
| `settings-reset-open` | 데이터 전체 초기화(위험 구역) | src/components/SettingsScreen.tsx:333 |
| `settings-reset-cancel` | 초기화 팝업: 취소 | src/components/SettingsScreen.tsx:366 |
| `settings-reset-countdown` | 초기화 팝업: 카운트다운 중(비활성) | src/components/SettingsScreen.tsx:373 |
| `settings-reset-run` | 초기화 팝업: 초기화 실행 | src/components/SettingsScreen.tsx:380 |
| `settings-terms-close-x` | 약관 팝업: 닫기(X) | src/components/SettingsScreen.tsx:420 |
| `settings-terms-close` | 약관 팝업: 닫기 | src/components/SettingsScreen.tsx:432 |
| `premium-subscribe` | 똑 PRO 구독하기 | src/components/PremiumSection.tsx:119 |
| `premium-manage` | 구독 관리·해지 | src/components/PremiumSection.tsx:130 |
| `premium-restore` | 구매 내역 복원 | src/components/PremiumSection.tsx:142 |
| `paywall-plan-annual` | 결제 팝업: 연간 구독 선택 | src/components/PaywallModal.tsx:129 |
| `paywall-plan-monthly` | 결제 팝업: 월간 구독 선택 | src/components/PaywallModal.tsx:147 |
| `paywall-purchase` | 결제 팝업: 결제하기 | src/components/PaywallModal.tsx:165 |

## 꼬르륵 급식  (스타일 파일: src/ui-design/meal.css)

| 이름(data-ui) | 무엇인가 | 코드 위치 |
|---|---|---|
| `meal-month-prev` | 이전 달 | src/components/KkorureukScreen.tsx:524 |
| `meal-month-next` | 다음 달 | src/components/KkorureukScreen.tsx:534 |
| `meal-date-select` | 날짜 하나하나(선택) | src/components/KkorureukScreen.tsx:577 |
| `meal-week-prev` | 이전 주 | src/components/KkorureukScreen.tsx:740 |
| `meal-week-this` | 이번 주 | src/components/KkorureukScreen.tsx:746 |
| `meal-week-next` | 다음 주 | src/components/KkorureukScreen.tsx:752 |
| `meal-alarm-toggle` | 급식 알림 켜기/끄기 | src/components/KkorureukScreen.tsx:896 |
