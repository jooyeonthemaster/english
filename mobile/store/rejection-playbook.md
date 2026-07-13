# 반려 대응 플레이북 (Rejection Playbook)

예상 반려 사유별 반박 스니펫입니다. 각 항목에 한국어와 영문을 병기해, 심사 회신(Resolution Center / Reply)에 바로 붙여 쓸 수 있게 했습니다. 주 대상은 Apple App Store 심사 지침이며, Google Play에도 동일 논지를 적용합니다.

## 우선순위

1. **4.2 최소 기능** — 초회 반려 최고 확률. 원격 셸 앱이라 `웹사이트 재포장`으로 오인될 수 있음.
2. **5.1.1 데이터 수집·계정** — 로그인·미성년·계정 삭제.
3. **3.1.1 인앱 구매** — 무결제 봉인 확인.
4. (보조) **1.2 사용자 생성/AI 콘텐츠 안전**.
5. (보조) **2.1 앱 완성도 / 빈 데모**.

권고: iOS 초회 4.2 반려 확률이 높으므로, 먼저 Android 내부 테스트로 흐름을 안정화한 뒤 iOS를 제출합니다.

---

## 4.2 최소 기능(Minimum Functionality)

### 한국어
SMOAT 학습은 웹사이트를 단순 포장한 앱이 아니라, 오프라인 학원 재원생을 위한 전용 학습 도구입니다. 다음 기능은 일반 웹 열람과 구별되는 핵심 가치입니다.

- 적응형 어법 드릴: 학생의 정오답을 EWMA와 라이트너 상자 알고리즘으로 추적해 난이도를 자동 조절하며, 12개 유닛에 걸쳐 무한 훈련을 제공합니다.
- 문항 맥락 기반 AI 어법 튜터: 어법에 한정되고, 미제출 문항의 정답을 노출하지 않으며, 무료·일일 한도로 제공됩니다.
- 타이머 시험 응시와 과제 수행, 숙달 히트맵 기반 학습 기록.
- 네이티브 기능: 오프라인 안내 화면, 자동 로그인 딥링크, 스플래시, 상태바 스타일, 화면 방향 고정.

학습 콘텐츠는 로그인한 학생마다 개인화됩니다. 심사자가 기능을 충분히 확인할 수 있도록 과제·시험·드릴 표본이 채워진 시드 계정과 자동 로그인 링크를 제공했습니다.

### English
SMOAT 학습 is not a repackaged website; it is a purpose-built study tool for students enrolled at an offline academy. The following capabilities go beyond generic web browsing:

- Adaptive grammar drills that track correctness with an EWMA and a Leitner-box algorithm to auto-adjust difficulty, offering unlimited practice across 12 units.
- A context-aware AI grammar tutor limited to grammar, which never reveals the answer to an unsubmitted question, offered free with a daily limit.
- Timed exam taking, assignments, and a mastery-heatmap progress dashboard.
- Native capabilities: an offline screen, auto-login deep links, splash screen, status-bar styling, and orientation lock.

Learning content is personalized per signed-in student. We provided a seed account pre-populated with sample assignments, exams, and drill history, plus an auto-login link, so the reviewer can fully evaluate the functionality.

---

## 5.1.1 데이터 수집 및 저장(Data Collection and Storage) · 로그인 · 미성년 · 계정 삭제

### 한국어
학생은 앱 안에서 계정을 생성하지 않습니다. 담당 강사가 발급한 학원코드와 학생코드로만 로그인하며, 이메일·비밀번호·전화번호를 수집하지 않습니다(B2B2C 구조). 따라서 인앱 계정 생성-삭제 요건(5.1.1(v))의 문언적 적용 밖입니다. 그럼에도 데이터 삭제 경로를 제공합니다: 학생 또는 보호자는 info@neander.co.kr(개인정보처리방침 §8·§10 근거) 또는 담당 학원으로 데이터 삭제를 요청할 수 있습니다. '담당 학원' 채널과 학생·보호자 특정 삭제 조항의 방침 명문화는 제출 전 보강 예정입니다(`privacy-policy-mapping.md` #4·#5).

수집 데이터는 학습 서비스 제공에 필요한 최소한(이름, 학생 식별자, 학습 기록, AI 튜터 입력, 접속 로그)이며, 추적이나 광고에 사용하지 않습니다. 주 이용자는 고등학생이고, 광고가 없으며, 개인정보처리방침을 상시 제공합니다.

### English
Students do not create accounts inside the app. They sign in only with an academy code and a student code issued by their instructor; no email, password, or phone number is collected (a B2B2C model). The in-app account creation-and-deletion requirement (5.1.1(v)) therefore does not literally apply. We nonetheless provide a deletion path: students or guardians may request data deletion via info@neander.co.kr (per privacy policy §8/§10) or through their academy. Explicit privacy-policy wording for the academy channel and student/guardian-specific deletion is to be added before submission (see `privacy-policy-mapping.md` #4/#5).

Collected data is the minimum needed to provide the learning service (name, student identifier, learning records, AI-tutor input, access logs) and is never used for tracking or advertising. The primary users are high-school students; there are no ads, and a privacy policy is always available.

---

## 3.1.1 인앱 구매(In-App Purchase) · 무결제 봉인

### 한국어
학생 앱에는 결제·구매·구독이 전혀 없습니다. 크레딧 결제 등 유료 기능은 강사 전용 웹(`/director`)에만 존재하며, 학생 앱에서는 네이티브 라우트 허용목록(RouteGuard)으로 봉인되어 도달할 수 없습니다. 인앱 내비게이션은 `smoat.co.kr`의 학생 표면(`/g`·`/t`·`/a`·API·정적 자산)으로 제한되고, `/director`와 마케팅 홈은 차단되며, 외부 링크는 시스템 브라우저로 위임됩니다. 따라서 앱 내에 인앱 결제나 외부 결제 링크가 노출되지 않습니다. 이용약관상 유료 서비스의 회원은 학원·원장·강사·관리자이며, 학생은 결제 주체가 아닙니다.

### English
The student app contains no payments, purchases, or subscriptions. Paid features such as credit purchases exist only in the instructor web console (`/director`), which is sealed off from the student app by a native route allowlist (RouteGuard) and is unreachable. In-app navigation is restricted to the student surfaces of `smoat.co.kr` (`/g`, `/t`, `/a`, APIs, static assets); `/director` and the marketing home are blocked, and external links are delegated to the system browser. No in-app purchase or external payment link is exposed anywhere in the app. Under our Terms, the members of paid services are the academy, director, instructors, and admins; students are not billing parties.

---

## (보조) 1.2 사용자 생성·AI 콘텐츠 안전(User-Generated / AI Content Safety)

### 한국어
AI 어법 튜터는 학생과 AI 모델 간 1:1 학습 보조입니다. 안전장치는 다음과 같습니다.

- 시스템 프롬프트로 어법 학습에 한정하고, 잡담·타 과목·숙제 대행을 거절합니다.
- 미제출 문항의 정답(선택지 번호·올바른 어형)을 직접 알려주지 않습니다.
- 출력은 정중한 합니다체이며, 마크다운 제거 등 출력 정제를 거칩니다.
- 컨텍스트는 클라이언트가 아니라 서버 번들에서 조립해 변조를 차단합니다.
- 하루 사용 횟수 한도와 입력 길이 제한(600자)이 있고, 모든 대화는 서버에 기록됩니다.

학생 간 채팅·커뮤니티·콘텐츠 공유 기능은 없습니다.

### English
The AI grammar tutor is a 1:1 learning aid between the student and an AI model. Safeguards include:

- A system prompt that restricts it to grammar and refuses small talk, other subjects, and doing homework for the student.
- It never directly reveals the answer (choice number or correct form) to an unsubmitted question.
- Output is polite formal Korean and is post-processed (e.g., markdown stripping).
- Context is assembled server-side, not from the client, preventing tampering.
- A daily usage cap and an input length limit (600 characters) apply, and all conversations are logged server-side.

There is no student-to-student chat, community, or content sharing.

---

## (보조) 2.1 앱 완성도 · 빈 데모(App Completeness / Empty Demo)

### 한국어
학습 콘텐츠는 로그인한 학생마다 개인화됩니다. 심사자가 빈 화면을 보지 않도록, ACTIVE 상태의 시드 학생 계정에 과제·시험·어법 드릴 표본을 채워 제출했습니다. 로그인은 App Review Information의 사용자 이름(학원코드)·암호(학생코드) 칸과 자동 로그인 링크로 즉시 가능합니다.

### English
Learning content is personalized per signed-in student. To ensure the reviewer does not see an empty screen, we submitted an ACTIVE seed student account pre-populated with sample assignments, exams, and grammar drills. Sign-in is immediate via the App Review Information fields (User Name = academy code, Password = student code) and the auto-login link.

---

## 근거 색인

| 주장 | 근거 |
| --- | --- |
| 코드 로그인·무회원가입 | `src/app/g/login-client.tsx` |
| EWMA·라이트너 | `src/lib/grammar-drill/engine.ts` |
| AI 튜터 어법 전용·정답 비노출·일일 한도·600자 | `src/app/api/grammar-drill/chat/route.ts` |
| RouteGuard 허용목록(무결제 봉인 근거) | U2-native-runtime `RouteGuardPlugin.java` 지시 |
| 결제=강사 전용 · 회원 정의 | `src/app/terms/page.tsx` 제2조 회원 정의 |
| 개인정보처리방침 | `https://www.smoat.co.kr/privacy` |
