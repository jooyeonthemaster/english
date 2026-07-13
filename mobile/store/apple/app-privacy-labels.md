# App Privacy 라벨 (App Store Connect — App Privacy)

App Store Connect의 `App Privacy` 설문에 입력할 값입니다. 아래 신고는 학생 앱(`/g` 표면)이 실제로 처리하는 데이터를 코드 근거로 정리한 것입니다. 강사 전용 웹(`/director`)의 결제·구독 데이터는 학생 앱에서 도달할 수 없으므로 이 라벨에 포함하지 않습니다.

## 요약

- 추적(Tracking)에 사용하는 데이터: **없음**. App Tracking Transparency(ATT) 프롬프트가 필요하지 않습니다.
- 사용자에게 연결(Linked to You)되는 데이터: 아래 5종. 전부 앱 기능(App Functionality) 목적이며, 학생 계정에 연결됩니다.
- 위치, 결제 정보, 연락처(전화·이메일), 기기 식별자, 광고 식별자: **수집하지 않음**.

## 수집·연결 데이터(Data Linked to You)

| Apple 데이터 유형 | Apple 분류 경로 | 실제 항목 | 목적(Purpose) | 추적 | 코드 근거 |
| --- | --- | --- | --- | --- | --- |
| Name | Contact Info > Name | 학생 이름(가명 가능) | App Functionality | 아니오 | `me-client.tsx` studentName · 로그인 세션 |
| User ID | Identifiers > User ID | 학생 식별자(studentId)·학생코드 | App Functionality | 아니오 | `grammar-drill/auth.ts` 세션 · 로그인 |
| Product Interaction | Usage Data > Product Interaction | 드릴·시험·과제 풀이 기록, 숙달도 | App Functionality | 아니오 | `grammar-drill/engine.ts`(EWMA·라이트너) · `/g/me` |
| Other User Content | User Content > Other User Content | AI 어법 튜터에 입력한 질문 텍스트(최대 600자) | App Functionality | 아니오 | `api/grammar-drill/chat/route.ts` `MAX_MESSAGE_LEN=600` |
| Coarse/Other Diagnostic — IP | Identifiers 또는 Usage Data | IP 주소(접속 로그·레이트리밋) | App Functionality, 부정 이용 방지(Fraud Prevention) | 아니오 | 로그인·챗 레이트리밋 · `/privacy` 2·5조 |

> IP 주소는 Apple 설문에서 별도의 데이터 유형 항목으로 노출되지 않는 경우가 있습니다. 해당 시 `Usage Data`의 진단·부정 이용 방지 맥락으로 신고하거나, 서버 접속 로그의 일부로 개인정보처리방침에 기재된 대로 처리됨을 심사 노트에 남깁니다.

## 각 항목의 신고 세부값

각 데이터 유형에 대해 App Privacy 설문은 (1) 이 데이터를 수집하는가, (2) 사용자에게 연결되는가, (3) 추적에 사용하는가, (4) 사용 목적을 묻습니다. 본 앱의 답은 다음과 같습니다.

- **Name / User ID / Product Interaction / Other User Content**
  - 수집: 예
  - 사용자에게 연결: 예(학생 계정에 연결)
  - 추적에 사용: 아니오
  - 목적: App Functionality(학습 서비스 제공)
- **IP(진단·부정 이용 방지)**
  - 수집: 예
  - 사용자에게 연결: 예
  - 추적에 사용: 아니오
  - 목적: App Functionality, Fraud Prevention

## 수집하지 않는 데이터(명시적 아니오)

- 위치(정밀/대략) — 위치 권한을 요청하지 않습니다.
- 결제 정보 — 학생 앱에 결제·구매·구독이 없습니다. 결제 데이터는 강사 전용 웹에만 존재하며 학생 앱에서 도달 불가합니다.
- 연락처(전화번호·이메일) — 학생 로그인은 코드 기반이라 학생의 전화·이메일을 수집하지 않습니다.
- 기기 식별자·광고 식별자(IDFA 등) — 광고 SDK가 없고 추적을 하지 않습니다.
- 건강·금융·민감정보 — 수집하지 않습니다.

## AI 튜터 데이터 처리 주석

AI 어법 튜터의 질문 텍스트는 답변 생성을 위해 AI 모델 제공자(Google Gemini, atlas 게이트웨이 경유)로 전송됩니다(근거: `api/grammar-drill/chat/route.ts`). 이는 서비스 제공자에 의한 처리이며, 광고·추적 목적이 아닙니다. 대화는 서비스 품질·이력 목적으로 학생 계정과 함께 저장되며, 삭제 요청 경로는 개인정보처리방침을 따릅니다. Google Play의 대응 신고는 `google/data-safety.md`를 참조합니다.

## 확정 필요(openQuestion)

- Apple 설문의 세부 하위 유형 매핑(특히 IP)은 콘솔 UI 문구에 맞춰 최종 선택합니다.
- AI 제공자 처리를 라벨상 `제3자 공유`로 볼지 여부는 무학습 계약 확정 상태에 따라 `google/data-safety.md`와 정합을 맞춥니다. 확정 전에는 보수적으로 서비스 제공자 처리로 기재하되, 추적 아님을 유지합니다.
