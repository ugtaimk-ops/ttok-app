export const TERMS_VERSION = "2026-10-10";

export default function TermsContent() {
  return (
              <div className="flex-1 min-h-0 overflow-y-auto pr-2 mt-4 space-y-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans custom-scrollbar">
                
                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 1 조 (목적)</p>
                  <p>
                    본 약관은 "똑(TTOK) 학생 수행평가 및 발표 대비 보조 플랫폼"(이하 "서비스")의 이용에 관한 조건 및 절차, 이용자와 똑(TTOK) 서비스 개발자 간의 권리, 의무 및 제반 책임 사항을 명확히 규정함을 목적으로 합니다.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 2 조 (용어의 정의)</p>
                  <p className="space-y-1">
                    1. "서비스"란 학생의 수행평가 계획 자동화 스케줄링, 시험 카운트다운 관리, 교과 개념 분석, AI 스크립트 작성 및 발표 연습 녹화 후 분석 피드백(발음 딕션 점수, 시선 분석, 제스처 피드백)을 포함하여 앱에서 제공되는 학습 보조 기능을 총칭합니다.<br />
                    2. "이용자"란 서비스를 이용하기 위해 가입하고 학적 및 학습 목표를 설정하여 서비스를 활성화하는 학생, 학부모 및 교사를 말합니다.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 3 조 (회원정보의 보호 및 개인정보 보안)</p>
                  <div className="space-y-2">
                    <p>
                      1. 똑(TTOK)은 이용자의 과도하고 불필요한 개인 식별 정보의 외부 노출 및 수집을 엄격히 제한하며, 입력받는 학교명, 학년, 반 등의 정보는 오직 맞춤화된 학습 캘린더 생성 및 편의 향상 목적으로만 보관됩니다.
                    </p>
                    <p className="space-y-1">
                      2. <strong className="text-brand font-bold">개인정보 보호 최우선 설계 원칙:</strong><br />
                      • 발표 연습을 시작하면 카메라와 마이크를 이용해 녹화합니다. 연습 종료 시 녹화한 영상과 음성을 AI 분석 서버와 Google Gemini에 전송해 발표 점수와 피드백을 생성합니다. 이용자는 최초 이용 시 이 처리에 동의합니다.<br />
                      • 영상·음성 원본은 똑 서버의 파일 저장소에 보관하지 않습니다. 요청 처리가 끝나면 기기의 임시 녹화 데이터도 정리합니다.<br />
                      • AI 사진 분석에는 선택한 이미지가 분석 서버와 AI 제공업체에 전송될 수 있습니다.<br />
                      • PDF 대본 저장은 기기에서 처리하며, 사용자가 공유를 선택한 경우에만 선택한 앱에 전달됩니다.<br />
                      • 일정, 프로필, 발표 결과 등 계정 동기화 데이터는 Firebase에 보관될 수 있습니다.<br />
                      • AI 제공업체의 데이터 처리 조건은 해당 업체의 정책에 따릅니다.<br />
                      • 모든 통신은 HTTPS를 사용합니다.
                    </p>
                  </div>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 4 조 (이용자의 권리와 의무)</p>
                  <p className="space-y-1">
                    1. 이용자는 자신의 실제 학적 정보 및 공부 목표에 기반하여 일정을 올바르게 기재하고 수행할 권리를 가집니다.<br />
                    2. 이용자는 본 서비스 내의 기능(AI 사진 스캔 등록, AI 피드백 튜터, 발표 분석 등)을 타인의 지적재산권이나 초상권을 침해하지 않는 건전한 학업 및 자기계발적 범위 내에서만 정당하게 활용하여야 합니다.<br />
                    3. 이용자는 다음 행위를 해서는 안 되며, 위반 시 회사는 사전 통지 없이 서비스 이용을 제한하거나 계정을 정지·해지할 수 있습니다: 서비스 운영을 방해하는 비정상적 대량 요청, 타인 계정 도용, 서비스 콘텐츠의 무단 복제·배포·상업적 이용, 역설계, 관계 법령 위반.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 5 조 (제공 서비스의 제한 및 면책조항)</p>
                  <p className="space-y-1">
                    1. 똑(TTOK) 서비스에서 제공하는 모든 AI 분석 성적, 발음 교정 정보, 가중 점수 및 피드백 내용은 이용자의 학업적 참고와 프레젠테이션 스피치 향상을 돕기 위한 보조적 지표 자료일 뿐이며, 정확성·완전성을 보증하지 않습니다.<br />
                    2. 해당 피드백 자료는 실제 학교 교사나 소속 교육기관의 지필고사 및 수행평가 실질 채점 기준과 다를 수 있으며, 본 서비스는 이용자가 기록한 정보의 완벽한 행정적·공식적 정확성이나 공인 평가 결과를 보증하지 않습니다. 이에 따른 학업 성과 및 채점 불일치 책임은 이용자 본인에게 있습니다.<br />
                    3. 서비스는 "있는 그대로(AS-IS)" 제공되며, 회사는 천재지변·정전·네트워크 장애·제3자 서비스 장애 등 합리적 통제를 벗어난 사유로 인한 서비스 중단에 책임을 지지 않습니다.<br />
                    4. 법률이 허용하는 최대한의 범위에서, 서비스 이용으로 발생하는 간접·결과적·특별·징벌적 손해에 대해 회사는 책임을 지지 않으며, 손해배상 책임은 손해 발생일로부터 최근 3개월간 이용자가 실제 지불한 이용 요금 총액을 초과하지 않습니다. 무료 이용자의 경우 회사는 원칙적으로 손해배상 책임을 지지 않습니다.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 6 조 (똑 PRO 유료 구독 및 결제)</p>
                  <div className="space-y-2">
                    <p>
                      1. 똑(TTOK)은 무료로 제공되는 기본 서비스 외에, 유료 구독 상품인 <strong className="text-brand font-bold">"똑 PRO"</strong>를 제공합니다. 똑 PRO 구독 시 월간 AI 기능 이용 횟수가 확대되며, AI 추천 리포트 등 PRO 전용 기능을 이용할 수 있습니다.
                    </p>
                    <p>
                      2. 구독 상품 및 가격은 다음과 같습니다. (부가세 포함, Google Play 정책에 따라 변경될 수 있습니다)<br />
                      • 월간 구독: 2,900원 / 월<br />
                      • 연간 구독: 29,000원 / 년
                    </p>
                    <p>
                      3. 결제는 <strong>Google Play 인앱 결제 시스템</strong>을 통해서만 이루어지며, 똑(TTOK)은 결제 정보를 직접 수집하거나 저장하지 않습니다.
                    </p>
                    <p>
                      4. 구독은 별도로 해지하지 않는 한 각 결제 주기(월간/연간)가 끝날 때 자동으로 갱신되며, 자동 갱신 전 Google Play를 통해 이용자에게 사전 고지됩니다.
                    </p>
                    <p>
                      5. 구독 해지는 앱 내 설정 화면의 <strong>"구독 관리 / 해지"</strong> 메뉴 또는 Google Play 스토어의 구독 관리 화면에서 언제든지 직접 진행할 수 있습니다. 해지 시에도 이미 결제된 기간 동안은 계속 PRO 혜택을 이용할 수 있습니다.
                    </p>
                    <p>
                      6. 결제 취소 및 환불은 <strong>Google Play의 환불 정책 및 절차</strong>를 따르며, 똑(TTOK)이 자체적으로 환불을 처리하지 않습니다. 환불 요청은 Google Play 고객센터를 통해 진행해 주시기 바랍니다.
                    </p>
                    <p>
                      7. 이용자의 약관 위반이나 부정 이용(비정상적 방법으로 무료 이용 한도를 우회하는 행위 등)이 확인되는 경우, 회사는 환불 없이 구독 혜택 제공을 중단할 수 있습니다.
                    </p>
                  </div>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 7 조 (지적재산권)</p>
                  <p className="space-y-1">
                    1. 서비스에 포함된 소프트웨어, 디자인, 로고, AI 프롬프트 구성 등 일체의 저작물에 대한 지적재산권은 회사에 귀속됩니다.<br />
                    2. 이용자는 회사의 사전 서면 동의 없이 서비스 콘텐츠를 복제, 송신, 출판, 배포하거나 제3자에게 이용하게 할 수 없습니다.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 8 조 (계정 해지 및 이용 제한)</p>
                  <p>
                    회사는 이용자가 본 약관 또는 관계 법령을 위반하거나 서비스의 정상적인 운영을 방해한 경우, 사전 통지 후(긴급한 경우 사후 통지) 해당 이용자의 서비스 이용을 제한하거나 계정을 해지할 수 있습니다.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 9 조 (약관의 변경)</p>
                  <p>
                    회사는 관계 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 개정 시 적용일자 및 개정사유를 명시하여 서비스 내 공지를 통해 사전 공지합니다. 이용자가 개정 약관의 적용일 이후에도 서비스를 계속 이용하는 경우 개정 약관에 동의한 것으로 봅니다.
                  </p>
                </div>

                <div>
                  <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">제 10 조 (준거법 및 관할법원)</p>
                  <p>
                    본 약관의 해석 및 이용자와 똑(TTOK) 서비스 간의 분쟁이 발생할 경우 대한민국 관계 법령을 준거법으로 하며, 법이 정한 관할 법원을 통하여 원만하고 합리적인 해결을 도모합니다.
                  </p>
                </div>

              </div>

  );
}
