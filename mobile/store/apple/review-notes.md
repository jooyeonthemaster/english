# App Store 심사 노트 (App Review Information — Notes)

App Store Connect의 `App Review Information > Notes` 칸에 붙여 넣을 심사 노트입니다. 한국어 원문과 영문을 병기합니다. 심사자가 이 앱의 성격(오프라인 학원 재원생 전용 학습 컴패니언)과 결제 부재를 오해하지 않도록 앞부분에 핵심을 배치했습니다.

## 한국어

SMOAT 학습은 오프라인 영어학원에 재원 중인 학생을 위한 학습 컴패니언 앱입니다(B2B2C). 학생은 앱 안에서 회원가입을 하지 않으며, 담당 강사가 발급한 학원코드와 학생코드로만 로그인합니다. 이메일·비밀번호·전화번호를 앱에서 수집하지 않습니다.

이 앱은 단순한 웹사이트 재포장이 아니라, 학원 학습을 위한 전용 도구를 제공합니다.

- 적응형 어법(문법) 드릴: 학생의 정오답을 EWMA와 라이트너 상자 알고리즘으로 추적해 난이도를 자동 조절하며, 12개 유닛에 걸쳐 무한 훈련을 제공합니다.
- 타이머 기반 시험 응시와 과제(학습지·퀴즈) 수행.
- 문항 맥락을 이해하는 AI 어법 튜터: 어법 학습에 한정되며, 아직 제출하지 않은 문항의 정답은 알려주지 않습니다. 무료로 제공되고 하루 사용 횟수가 제한됩니다.
- 학습 기록 대시보드(숙달 히트맵, 유형·난이도별 정답률, 최근 활동).
- 네이티브 기능: 오프라인 안내 화면, 딥링크(자동 로그인), 스플래시, 상태바 스타일, 화면 방향 고정.

이 앱에는 결제·구매·구독이 전혀 없습니다. 크레딧 결제 등 유료 기능은 강사 전용 웹(`/director`)에만 존재하며, 학생 앱에서는 코드로 봉인되어 도달할 수 없습니다. 따라서 인앱 결제나 외부 결제 링크가 화면에 나타나지 않습니다.

학습 콘텐츠는 로그인한 학생마다 개인화되므로, 심사자가 빈 화면을 보지 않도록 과제·시험·드릴 표본이 채워진 시드 계정을 함께 제출했습니다. 로그인 방법과 자동 로그인 링크는 App Review Information의 사용자 이름·암호 칸과 아래 안내를 참고해 주십시오.

로그인: 사용자 이름 칸 = 학원코드, 암호 칸 = 학생코드. 자동 로그인 링크: https://www.smoat.co.kr/g?ac=<학원코드>&sc=<학생코드>

개인정보처리방침: https://www.smoat.co.kr/privacy · 문의: info@neander.co.kr

## English

SMOAT 학습 (SMOAT Study) is a learning companion app for students enrolled at an offline English academy (a B2B2C service). Students do not create accounts inside the app; they sign in only with an academy code and a student code issued by their instructor. The app collects no email, password, or phone number from students.

This app is not a repackaged website. It provides purpose-built study tools for academy learning:

- Adaptive English grammar drills that track each student's correctness with an EWMA and a Leitner-box algorithm to auto-adjust difficulty, offering unlimited practice across 12 units.
- Timed exam taking and assignments (worksheets and quizzes).
- A context-aware AI grammar tutor limited to grammar help. It never reveals the answer to a question the student has not yet submitted. It is free and rate-limited per day.
- A progress dashboard (mastery heatmap, accuracy by question type and difficulty, recent activity).
- Native capabilities: an offline screen, deep links (auto-login), splash screen, status-bar styling, and orientation lock.

The app contains no payments, purchases, or subscriptions. Paid features such as credit purchases exist only in the instructor-facing web console (`/director`), which is sealed off from the student app by an in-app route allowlist and is unreachable. As a result, no in-app purchase or external payment link appears anywhere in the student experience.

Because learning content is personalized per signed-in student, we have provided a seed account pre-populated with sample assignments, exams, and drill history so the reviewer does not encounter an empty screen. For sign-in, please use the App Review Information fields and the note below.

Sign-in: User Name field = academy code, Password field = student code. Auto-login link: https://www.smoat.co.kr/g?ac=<ACADEMY_CODE>&sc=<STUDENT_CODE>

Privacy Policy: https://www.smoat.co.kr/privacy · Contact: info@neander.co.kr

## 심사자가 자주 확인하는 항목(대비)

- **웹 접근 범위**: 앱은 임의의 웹 브라우징을 허용하지 않습니다. 인앱 내비게이션은 `smoat.co.kr`의 학생 표면(`/g`·`/t`·`/a`·API·정적 자산)으로 제한되며, 외부 링크는 시스템 브라우저로 위임됩니다(근거: 네이티브 RouteGuard 허용목록). 이는 연령 등급 설문의 `무제한 웹 접근 = 아니오`의 사실적 토대입니다.
- **미성년 이용자**: 주 이용자는 고등학생입니다. 광고가 없고, 추적(App Tracking Transparency 대상)이 없으며, 개인정보처리방침을 제공합니다.
- **계정 삭제**: 학생은 앱 내에서 계정을 생성하지 않으므로(강사 발급) 인앱 계정 생성-삭제 요건의 문언적 적용 밖입니다. 데이터 삭제는 info@neander.co.kr(개인정보처리방침 §8 고객센터 이메일·§10 근거) 또는 담당 학원(계정 발급 주체)으로 요청할 수 있습니다. '담당 학원' 채널과 학생·보호자 특정 삭제 조항의 방침 명문화는 제출 전 보강 예정입니다(`privacy-policy-mapping.md` #4·#5).

> 제출 전 확정: 위 `<학원코드>`/`<학생코드>`와 자동 로그인 링크를 실제 시드 계정 값으로 교체합니다(`demo-account.md` 참조).
