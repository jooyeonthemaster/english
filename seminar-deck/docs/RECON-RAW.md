# SMOAT 세미나 덱 — 정찰 원문 (11각도 raw)

> 정찰 에이전트 반환 원문. 각 findings 에 file:line 근거가 붙어 있다.
> 종합 편집본이 아니라 원본이므로 상호 모순 가능 — 모순 시 COPY_SPEC.md 가 우선한다.



---

## 각도 J — 기존 덱 엔진(ir-deck) + 세미나 자산 정찰. 결론: SMOAT는 이미 27장짜리 프로덕션급 인터랙티브 16:9 리딩 덱 엔진(deck.js/deck.css/slides.css)을 자체 보유하고 있으며, 세미나 덱은 이 엔진을 그대로 포크해 쓰면 된다. 인터랙티브 연출(스텝 리빌·해시 딥링크·TOC·카운트업·SVG 드로우·바 성장·타이핑·라이브 데모 패널)이 이미 검증·PDF 캡처까지 완료됨. 세미나 관련 제품 UI는 반대로 "카피가 DB(관리자 입력)"라 하드코딩 문구가 거의 없고, 대신 카운트다운 타일/프로모 배너 같은 시각 컴포넌트가 재현 가치가 높다. 덱에 실을 실사 이미지 자산은 public/marketing/campaign-2026 31장(카피 가이드 README 포함)과 public/features/shots 29장이 최상급.

### 관측 사실

- **ir-deck 엔진은 슬라이드 내 [data-s="n"] 요소를 step>=n 일 때 .on 으로 켜는 스텝 리빌 방식이다. data-s-until 로 종료 스텝도 지정 가능하고, [data-dim-at="N"] 는 삭제 대신 .dimmed 로 강등(무대 양보)한다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.js:48-67`
- **슬라이드 정의는 DOM에서 자동 수집된다 — .slide 엘리먼트의 data-steps(스텝수), data-act(막 이름), data-theme(light|night)만 붙이면 엔진·HUD·목차가 자동 반영된다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.js:12-18`
- **URL 해시 #슬라이드.스텝 (예 #5.2)로 위치가 저장/복원된다. history.replaceState 로 매 렌더마다 갱신.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.js:38-45, deck.js:96`
- **네비게이션: 키보드(PageDown/→/↓/Space/Enter=다음, PageUp/←/↑/Backspace=이전, F=전체화면, Home/End, Escape=목차 닫기) + 화면 클릭(좌측 18% 영역=이전, 그 외=다음) + HUD 버튼. [data-ui] 영역 내부 클릭·a/button/input/textarea/select 는 네비게이션에서 제외된다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.js:127-157`
- **슬라이드 전환 중 animLock(520ms)으로 연타를 막는다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.js:100-108`
- **목차는 data-act 기준으로 자동 그룹핑되어 빌드된다. 항목 라벨은 data-title, 번호는 2자리 zero-pad.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.js:163-194`
- **리빌 이펙트 3종이 스텝 점등 시 자동 발화된다: data-count(카운트업, easeOutQuart, 기본 1300ms, data-fmt=comma|plain, ko-KR 로케일 콤마), data-draw(SVG stroke-dashoffset 드로우), data-grow(바 성장, data-axis="y"면 height).**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.js:197-252`
- **타이핑 효과는 window.deckType(el, text, speed, done) 전역으로 제공되며 기본 속도 14ms/자, 진행 중 .typing 클래스가 붙는다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.js:255-269`
- **슬라이드는 스텝 변경 시 자기 자신에게 CustomEvent "deck:step"(detail.step)을 디스패치한다 — 차트/데모 같은 외부 JS가 스텝에 훅을 걸 수 있는 공식 확장점.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.js:66`
- **컬러 토큰 전량(실제 hex): --bg-0:#edf3fb, --bg-1:#e2ecf8, --bg-2:#d6e5f6, --ink:#0b1c38, --ink-soft:#33507a, --mute:#7e93b4, --faint:#aabdd8, --blue:#2f6df6, --blue-deep:#1242b8, --sky:#5aa7f7, --cyan:#2fb6d9, --navy:#0e2a66, --risk:#d8447c, --pos:#0fa37f.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.css:8-22`
- **글래스 토큰: --glass:rgba(255,255,255,0.52), --glass-strong:rgba(255,255,255,0.74), --stroke:rgba(255,255,255,0.72), --stroke-soft:rgba(143,170,210,0.35). 그림자 --shadow-card:0 18px 50px -18px rgba(15,45,105,.22), 0 4px 14px -6px rgba(15,45,105,.1) / --shadow-pop:0 30px 80px -24px rgba(10,35,90,.32). 라운드 --r-lg:26px, --r-md:18px, --r-sm:12px. 이징 --ease:cubic-bezier(0.16,1,0.3,1).**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.css:24-40`
- **폰트는 Pretendard Variable(CDN jsdelivr v1.3.9 dynamic-subset) + IBM Plex Mono(Google Fonts). body에 word-break:keep-all, overflow-wrap:break-word, user-select:none 적용.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/index.html:10-13, deck.css:37-57`
- **배경은 3겹 radial/linear 그라데이션 + blur(70px) 부유 오브 3개(orb-drift 26s/32s/38s alternate) + SVG feTurbulence 노이즈 오버레이(opacity .5, mix-blend-mode:overlay).**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.css:60-101`
- **나이트 테마는 별도 .bg-night 레이어(#081530→#0a1d42→#081130)를 body[data-theme="night"] 일 때 opacity 1로 0.9s 페이드시키는 방식 — 슬라이드가 아니라 배경이 바뀐다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.css:86-95`
- **슬라이드 전환 모션: 비활성 슬라이드는 opacity 0 / scale(0.988) / blur(10px), .active 는 opacity 1 / scale(1) / blur(0), 0.62~0.7s ease 에 0.12s 딜레이. 직전 슬라이드(.was)는 scale(1.012)로 밀려난다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.css:106-123`
- **스텝 리빌 기본 모션: translateY(26px)+blur(6px)+opacity 0 → .on 에서 원위치. data-fx=left|right(±34px X 이동), pop(scale .86→1), none 변형이 있고 data-d="1~6"이 0.08s 단위 transition-delay.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.css:137-162`
- **HUD는 화면 하단 고정 바 — 좌측 막이름(mono 12px letter-spacing .3em uppercase), 우측 스텝 도트(4px 원)+슬라이드 카운터(01 / 27)+이전/다음/목차 원형 버튼(38px), 최하단 2.5px 진행 바(linear-gradient(90deg,--sky,--blue), width 0.5s 트랜지션).**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.css:279-324, index.html:882-900`
- **키보드 힌트는 body.ready 에서 1.2s 후 페이드인, 첫 이동(body.moved) 시 0.4s 만에 사라진다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.css:327-338`
  - 실제 문구: 클릭 또는 → 키로 넘기기 · F 전체화면 · 우상단 ≡ 목차
- **목차 패널은 우측 슬라이드인 시트(width min(420px,92vw), rgba(248,251,255,.92)+blur(30px), translateX(40px)→0, 0.4s), 배경은 rgba(20,45,95,.25)+blur(8px) 딤.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/deck.css:341-370`
- **인터랙티브 데모(S09)는 두 탭 구조다: 탭1 '문제 생성'(지문 표시 → 유형 선택 → 난이도 선택 → 생성 버튼 → 4단계 진행 문구 → 문제 카드 출력 → 정답/해설 토글), 탭2 '워크북 변형 (AI 0회)'(빈칸 밀도 슬라이더 + seed 리롤).**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/index.html:292-333`
  - 실제 문구: 문제 생성 / 워크북 변형 (AI 0회)
- **데모 생성 시뮬레이션은 4개 진행 문구를 520~800ms 랜덤 간격으로 순차 표시한 뒤 완료 메시지를 띄운다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/demo.js:271-281, demo-data.js:97-102`
  - 실제 문구: ▸ 지문 구조 분석 중 — 문장 9개 · 논리 흐름 추출 / ▸ 출제 포인트 선정 중 — 유형 적합 스팬 탐색 / ▸ 오답 선지 설계 중 — 매력적 오답 · 함정 시나리오 / ▸ 품질 게이트 검증 중 — 정답 위치 다양성 · 힌트 누출 검사 / ✓ 생성 완료 — 품질 게이트 통과 · 2크레딧 차감
- **문제 카드는 발문을 타이핑(16ms/자)으로 찍은 뒤 5개 선지를 160ms 간격으로 translateY(8px)→0 페이드인시키고, [정답 · 해설 보기] 클릭 시 정답/해설/오답 해설이 펼쳐지며 정답 선지에 .correct-reveal(--pos 색 + bold)이 붙는다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/demo.js:283-338`
  - 실제 문구: 정답 · 해설 보기 / 정답 · 해설 접기
- **데모 데이터는 실제 문제 카드 필드 구조(cat/direction/passage/options/answer/explanation/wrong)를 그대로 본떴고, 지문 1개 + 4유형(빈칸 추론·어법·글의 순서·요약문 완성)이 사전 제작돼 있다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/demo-data.js:6-94`
- **워크북 탭은 mulberry32 PRNG(실제 엔진과 동일 계열)로 시드 셔플 후 5자 이상 내용어를 밀도(15~60%)만큼 빈칸 처리한다. 같은 시드 = 같은 학습지, 시드+1 = 새 학습지.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/demo.js:341-404`
  - 실제 문구: AI 호출 0회 — 시드 기반 결정론 변환이라 같은 시드는 항상 같은 학습지(인쇄 재현 100%), 시드만 올리면 무제한 재출제.
- **계절성 차트(S05/S16)는 SVG 1040×360 뷰박스에 52주 폴리라인을 절차적으로 생성하고, deck:step 이벤트에 맞춰 stroke-dashoffset 드로우 애니메이션(1600~1900ms, 260ms 스태거)으로 그린다. S05는 3사 라인(#f0568f/#34c97a/#9a7bf7), S16은 smart 펄스(#5aa7f7)+moat 계단 베이스라인(#37e0b0).**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/demo.js:11-191`
- **S15는 서울 25개 자치구 이름 배열을 JS로 그리드 셀로 렌더하고 6개 구(강남·서초·송파·노원·양천·마포)에 .lit 클래스를 준다 — '지역 독점 슬롯 점등' 연출.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/demo.js:195-208`
- **덱은 빌드 없는 정적 사이트이고, 원본은 ir-deck/, 운영 서빙 사본은 public/ir/ 이며 node scripts/sync-ir-deck.mjs 로 6개 파일만 동기화한다. 운영 URL은 https://smoat.co.kr/ir (next.config.ts rewrites, 어디에도 링크되지 않은 비공개 경로).**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/README.md:6-26`
- **덱은 27장 8막 구조이며 막 이름이 확정돼 있다: SMOAT IR / ACT 1 — 시장 / ACT 2 — SMART / ACT 3 — 발견 / ACT 4 — MOAT / ACT 5 — 비즈니스 / ACT 6 — 해자 / ACT 7 — 팀 / ACT 8 — 플랜 / EPILOGUE.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/index.html:32-874`
- **덱 커버 카피와 브랜드 정의가 확정돼 있다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/index.html:36-44`
  - 실제 문구: 가장 스마트한 해자를 만듭니다. / smoat는 smart × moat — AI가 영어 내신 수업의 콘텐츠 공장과, 학원만의 학생 학습 경험을 통째로 만들어내는 듀얼 SaaS입니다. / smart — 강사용 — AI 콘텐츠 스튜디오 / moat — 원장용 — 지역 독점 학습 AI
- **덱 클로징 카피와 연락처 라인이 확정돼 있다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/index.html:867-872`
  - 실제 문구: 우리는 문제를 만드는 속도가 아니라, 학원이 학생을 지키는 방식을 바꿉니다. / smoat.co.kr · (주)네안데르 신규 사업 · Spark Claw Cohort 01 지원
- **S08 '수업 준비의 전 공정' 슬라이드에 SMOAT 파이프라인 5+1 단계가 이미 문장 단위로 확정돼 있다 — 세미나 덱에 그대로 이식 가능한 최상급 자산.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/index.html:252-278`
  - 실제 문구: 01 추출 / 02 분석 / 03 출제 / 04 워크북 / 05 시험지 / +α 엔게이지 — "강사가 수업에서 쓰는 모든 산출물이 한 파이프라인에서 나옵니다 — 그래서 이탈할 이유가 줄어듭니다."
- **S07에 문항 유형 23종이 3그룹으로 전부 나열돼 있다(수능·모의 객관식 13종 / 내신 서술형 6종 / 어휘 3종).**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/index.html:226-236`
  - 실제 문구: 빈칸 추론·어법·어휘·글의 순서·문장 삽입·주제·요지·주장·제목·함축 의미·지칭 추론·내용 일치·요약문(객관식)·무관한 문장 / 조건부 영작·문장 전환·핵심 표현 빈칸·요약문 완성·배열 영작·어법 고쳐쓰기 / 문맥 속 의미·동의어·반의어
- **/seminar 페이지 자체에는 하드코딩된 카피·커리큘럼이 없다. 서버에서 getPublicGroupSeminars()로 DB 세미나를 읽어 PublicSeminarClient 에 넘기는 얇은 래퍼이고, robots는 noindex·nofollow다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/seminar/page.tsx:6-28`
  - 실제 문구: 단체 세미나 신청 | SMOAT
- **공개 세미나 페이지의 고정 카피는 상단 헤더/제목/빈 상태 3줄뿐이다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/help-center/public-seminar-client.tsx:77-86`
  - 실제 문구: 단체 세미나 신청 / 회원이 아니어도 아래에서 바로 신청할 수 있습니다. / 현재 신청 가능한 단체 세미나가 없습니다.
- **세미나 '커리큘럼'은 관리자 화면의 자유 텍스트 필드(description)로 입력받는 구조다 — 코드에 커리큘럼 데이터가 없다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/admin/help/admin-group-seminars-client.tsx:719`
  - 실제 문구: 커리큘럼·준비물 등 상세 내용
- **관리자 세미나 혜택 필드의 placeholder에 실제 운영에서 쓰는 혜택 문구 예시가 박혀 있다 — 세미나 덱 혜택 슬라이드의 근거로 인용 가능.**
  - 근거: `d:/Desktop/2026project/nara/src/components/admin/help/admin-group-seminars-client.tsx:534`
  - 실제 문구: 예:\n· 참석 원장님 전원에게 스모트 활용 가이드 & 실전 템플릿 제공\n· 현장 1:1 세팅 컨설팅\n· 다과·음료 제공
- **세미나 상세는 3개 안내 카드(세미나 안내 / 이런 원장님께 추천합니다 / 문의 안내)와 3개 정보 타일(일정 / 장소 / 신청 마감)로 구성된다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/help-center/group-seminar-display.tsx:291-336, 463-496`
  - 실제 문구: 세미나 안내 / 이런 원장님께 추천합니다 / 문의 안내 / 일정 / 장소 / 신청 마감
- **참가 보증금 UX가 실제로 구현돼 있다 — 입금자명 자동 확인 + 환급 계좌 수집 + 당일 환급.**
  - 근거: `d:/Desktop/2026project/nara/src/components/help-center/public-seminar-client.tsx:401-458`
  - 실제 문구: 세미나 당일에 환급해 드립니다. / 참가 보증금 {금액}원을 아래 계좌로 입금하시면 신청이 확정됩니다. / 입금자명 (이 이름으로 입금 · 자동 확인) / 환급받을 계좌
- **랜딩 세미나 프로모 배너는 좌(다크 그라디언트 텍스트)·우(커버 이미지) 2분할 카드다. 좌측 배경 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950, 카드 rounded-[28px] + border-slate-200 + shadow-[0_30px_80px_-50px_rgba(15,23,42,0.55)], hover 시 -translate-y-0.5 + shadow-[0_40px_90px_-46px_rgba(37,99,235,0.5)].**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/seminar-promo-section.tsx:41-45`
  - 실제 문구: 모집중 / 선착순 {N}명 / 세미나 신청하기
- **프로모 배너의 '모집중' 뱃지는 bg-blue-500 필 안에 흰색 ping 애니메이션 도트(size-1.5)를 겹친 구조다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/seminar-promo-section.tsx:51-57`
- **세미나 카운트다운(랜딩용)은 red 톤 pill — border-red-400/50, bg-red-500/15, AlarmClock 아이콘 text-red-400, D-N 은 text-red-400, 시계는 font-mono text-[15px] font-black tabular-nums text-white, 1초 간격 갱신, 마감 후에는 렌더하지 않는다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/seminar-countdown.tsx:25-47`
  - 실제 문구: 신청 마감까지
- **세미나 상세의 마감 타일(rose 톤)은 border-rose-100 / bg-rose-50/60 / p-4 / rounded-xl 이고, 우상단에 rose-400 ping + rose-500 도트, 당일(D-0)이면 숫자 전체에 animate-pulse가 걸리고 '오늘 마감!' 문구가 붙는다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/help-center/group-seminar-display.tsx:399-426`
  - 실제 문구: 신청 마감까지 / 오늘 마감! / {선착순 N명} · 정원이 차면 조기 마감
- **public/marketing/campaign-2026/ 에 실사 캠페인 이미지 31장(01~31, 각 1.5~2.2MB PNG)과 카피 가이드 README.md가 전부 존재한다. 06~31번은 실제 SMOAT 화면·출력물을 삽입 소재로 사용했다.**
  - 근거: `d:/Desktop/2026project/nara/public/marketing/campaign-2026/README.md:1-3, 306-308`
- **캠페인 README는 이미지별로 '추천 카피 / 보조 카피 / 추천 용도 / 카피 위치'를 지정하며, 세미나 용도로 명시된 컷이 다수 있다(01 세미나 오프닝 슬라이드, 05 세미나 스크린, 06 세미나 대형 스크린, 15 학원 설명회, 21 세미나 엔딩 슬라이드, 31 세미나 도입부).**
  - 근거: `d:/Desktop/2026project/nara/public/marketing/campaign-2026/README.md:5-12, 41-58, 140-148, 199-206, 289-296`
  - 실제 문구: 출제에 쓰던 밤을 돌려드립니다 / 복잡한 자료를, 완성된 시험으로 / 보여주기 위한 AI가 아니라, 바로 쓰기 위한 결과물 / 좋은 시스템은, 교사진 전체의 기준을 높입니다 / 선생님의 저녁을 다시 돌려드립니다 / SMOAT 없이 출제한다는 것
- **캠페인 이미지 사용 원칙이 명문화돼 있다 — 웹에서는 aspect-ratio:16/9 유지 + object-fit:cover, 카피는 이미지에 재합성하지 말고 HTML 텍스트 레이어로 올릴 것, 흰색/옅은 청색 글자 + 코발트 CTA 조합.**
  - 근거: `d:/Desktop/2026project/nara/public/marketing/campaign-2026/README.md:298-304`
- **public/features/shots/ 아래 7개 기능별 제품 스크린샷 세트가 있다(academy-erp 2장, ai-question-generation 5장, exam-builder 5장, exam-report 5장, passage-analysis 5장, passage-webtoon 5장, question-extraction 5장 — hero.png + s1~s4.png).**
  - 근거: `d:/Desktop/2026project/nara/public/features/shots/`
- **각 스크린샷의 alt/caption 문구가 features 페이지에 확정 문안으로 붙어 있다(예: passage-analysis hero — alt "SMOAT 영어 지문 분석 학습지 화면", caption "지문 분석 학습지").**
  - 근거: `d:/Desktop/2026project/nara/src/app/features/passage-analysis/page.tsx:43-45`
  - 실제 문구: 지문 하나가 한 장의 수업용 학습지가 됩니다
- **public/landing/generated/ 에 실제 산출물 실사 이미지 10종(actual-smoat-exam-page1.webp, actual-smoat-worksheet-page1.webp, smoat-score-report-page.webp, printed-output-stack-real-docs.webp, teacher-marked-passage.webp, uploaded-exam-photo.webp 등)이 있고, public/landing/samples/ 에 실제 PDF 샘플 2종+썸네일 3종이 있다.**
  - 근거: `d:/Desktop/2026project/nara/public/landing/generated/, d:/Desktop/2026project/nara/public/landing/samples/`
- **ir-deck/_qa/ 에 검수용 슬라이드 스크린샷 28장(s02~s27 + s09-gen/s09-wb + toc.jpeg)이, ir-deck/_pdf/ 에 27장 페이지 JPEG + capture.mjs(Playwright 캡처) + assemble.py(PDF 조립)가 있다. 완성 PDF는 ir-deck/smoat-IR-deck.pdf(10.6MB).**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/_qa/, d:/Desktop/2026project/nara/ir-deck/_pdf/`
- **screenshots/site-page-kinds-2026-06-25_12-39-28/ 에 서비스 전 페이지 스크린샷 146장 + 팝업 상태 245장 + manifest.md 가 있다(001-home.png 등 경로가 매니페스트에 전부 기록됨). 실제 제품 UI를 슬라이드에 재현할 때 최고 밀도의 레퍼런스.**
  - 근거: `d:/Desktop/2026project/nara/screenshots/site-page-kinds-2026-06-25_12-39-28/manifest.md:1-10`
- **SMOAT 서비스 정의 공식 1문장은 /llms.txt 라우트에 있다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/llms.txt/route.ts:22`
  - 실제 문구: 스모트(SMOAT)는 한국 영어학원을 위한 AI 올인원 서비스입니다. 영어 지문 분석(직독직해·구문·어휘 A4 분석지), 내신·수능 19유형 AI 영어 문제 생성(빈칸추론·어법·순서·삽입·서술형 등), 편집 가능한 Word(.docx)·한글 시험지 자동 조판, 학원 운영(ERP)까지 한곳에서 제공합니다. 주식회사 네안데르가 운영합니다.
- **llms.txt 는 주요 사용자와 핵심 페이지 6종을 명시한다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/llms.txt/route.ts:24-35`
  - 실제 문구: 주요 사용자: 영어학원 원장·강사, 공부방·과외 선생님 (한국) / AI 영어 문제 생성: 내신·수능 유형 자동 출제 / Word·한글 시험지 제작: 편집 가능한 시험지 자동 조판 / 영어 지문 분석: 직독직해·구문·어휘 분석지 / 영어학원 관리: 학원 운영 올인원
- **랜딩 히어로 카피(H1/서브/CTA)가 확정돼 있다. H1은 text-[34px]→lg:text-7xl font-black, 후반부는 bg-gradient-to-r from-[#7DB0FF] to-[#3B82F6] 텍스트 그라디언트. 등장 모션은 opacity 0→1 + y 34→0 + blur(8px)→0, 0.8s cubic-bezier(0.16,1,0.3,1).**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/hero-scene.tsx:424-451`
  - 실제 문구: 영어 내신·수능 최적화 AI / 영어시험 고민은 이제 끝! SMOAT가 모든 걸 해드립니다 / SMOAT의 영어 내신·수능 최적화 AI로 10시간을 10분으로 단축해드립니다! / SMOAT 시작하기 / 실제 결과물 보기
- **AGENTS.md 는 이미지 생성 규칙만 담고 있고 SMOAT 서비스 소개 문구는 없다. 루트 README.md 는 create-next-app 기본 템플릿 그대로다.**
  - 근거: `d:/Desktop/2026project/nara/AGENTS.md:1-8, d:/Desktop/2026project/nara/README.md:1-37`
- **smoat-offline-marketing/ 에는 PDF 3개만 있다: '4_SMOAT_세미나_결합 1.pdf'(218KB), '2027_영어_실전모의고사_문제지.pdf'(444KB), '전단지용 학습지.pdf'(6.6MB). 세미나 오프라인 배포물의 유일한 실물 자산.**
  - 근거: `d:/Desktop/2026project/nara/smoat-offline-marketing/`
- **[추론] 세미나 덱을 만들 때 ir-deck 엔진을 그대로 복사하면 스텝 리빌·해시 딥링크·TOC·HUD·카운트업·PDF 캡처 파이프라인(_pdf/capture.mjs + assemble.py)까지 무료로 따라온다 — 새 엔진을 쓸 이유가 없다.**
  - 근거: `d:/Desktop/2026project/nara/ir-deck/README.md:42-53`

### 덱 재현 대상 (visualSpec)

#### ir-deck 덱 셸 (배경 + 슬라이드 전환 + HUD + TOC)

- 왜: 이미 27장 프로덕션 + PDF 캡처까지 검증된 16:9 인터랙티브 엔진. 세미나 덱은 이걸 복사해 index.html의 <section>만 갈아끼우면 된다.
- 소스: `d:/Desktop/2026project/nara/ir-deck/deck.css + deck.js + index.html`
- 시각 스펙:

```
[루트 토큰] --bg-0:#edf3fb; --bg-1:#e2ecf8; --bg-2:#d6e5f6; --ink:#0b1c38; --ink-soft:#33507a; --mute:#7e93b4; --faint:#aabdd8; --blue:#2f6df6; --blue-deep:#1242b8; --sky:#5aa7f7; --cyan:#2fb6d9; --navy:#0e2a66; --risk:#d8447c; --pos:#0fa37f; --glass:rgba(255,255,255,.52); --glass-strong:rgba(255,255,255,.74); --stroke:rgba(255,255,255,.72); --stroke-soft:rgba(143,170,210,.35); --shadow-card:0 18px 50px -18px rgba(15,45,105,.22),0 4px 14px -6px rgba(15,45,105,.1); --shadow-pop:0 30px 80px -24px rgba(10,35,90,.32); --r-lg:26px; --r-md:18px; --r-sm:12px; --ease:cubic-bezier(.16,1,.3,1).\n[폰트] body=Pretendard Variable(jsdelivr CDN v1.3.9 dynamic-subset), mono=IBM Plex Mono(Google Fonts 400/500/600/700). body{word-break:keep-all; overflow-wrap:break-word; user-select:none; overflow:hidden}.\n[레이어 순서] .bg(z0, fixed inset0) → .bg-night(z0, opacity0) → .grain(z1, feTurbulence baseFrequency .9 numOctaves 2 slope .05, opacity .5, mix-blend-mode:overlay) → #deck(z2) → #hint(z39) → #hud(z40) → #toc(z60).\n[배경] .bg = radial-gradient(1200px 800px at 12% -10%, #f6fafe, transparent 60%), radial-gradient(1000px 700px at 95% 15%, #d8e9fb, transparent 55%), linear-gradient(165deg,#edf3fb 0%,#e2ecf8 55%,#d6e5f6 100%). 오브 3개: .o1 46vw 원 left:-12vw top:18vh rgba(95,160,250,.5); .o2 38vw right:-10vw top:-12vh rgba(47,182,217,.38) 32s delay -8s; .o3 30vw right:14vw bottom:-16vh rgba(18,66,184,.28) 38s delay -16s. 전부 filter:blur(70px) opacity .55, @keyframes orb-drift 26s ease-in-out infinite alternate {from translate3d(0,0,0) scale(1) → to translate3d(5vw,-4vh,0) scale(1.12)}.\n[나이트] body[data-theme=night] 일 때 .bg-night opacity 0→1 (0.9s ease). 배경 = radial(1100px 700px at 80% -10%, rgba(47,109,246,.22)), radial(900px 700px at 8% 110%, rgba(47,182,217,.14)), linear-gradient(160deg,#081530,#0a1d42 55%,#081130). 나이트 슬라이드 텍스트 #eaf2ff, lead/body #b9cdf0, kicker #7db4ff.\n[슬라이드] .slide{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:clamp(36px,5vh,64px) clamp(36px,6vw,110px) clamp(60px,8.5vh,96px);opacity:0;visibility:hidden;transform:scale(.988);filter:blur(10px)}. .slide.active{opacity:1;transform:scale(1);filter:blur(0);transition:opacity .62s var(--ease) .12s, transform .7s var(--ease) .12s, filter .6s var(--ease) .12s}. .slide.was{transform:scale(1.012)}. .slide-inner{width:min(1480px,100%)}.\n[스텝 리빌] [data-s]{opacity:0;transform:translateY(26px);filter:blur(6px);transition:opacity .7s var(--ease),transform .8s var(--ease),filter .7s var(--ease)}. [data-s].on{opacity:1;transform:translateY(0);filter:blur(0)}. 변형: [data-fx=left] translateX(-34px), [data-fx=right] translateX(34px), [data-fx=pop] scale(.86), [data-fx=none] transform:none;filter:none. 지연: [data-d=1..6] transition-delay .08/.16/.24/.32/.4/.48s. 강등: .dimmed{opacity:.32!important;filter:saturate(.6)}.\n[타이포] .kicker{mono, clamp(13px,1.05vw,15px), letter-spacing .32em, uppercase, color var(--blue-deep), 앞에 26×2px --blue 막대}. .h-display{clamp(44px,5.6vw,92px)/800/1.08/-0.035em}. .h-1{clamp(32px,3.5vw,56px)/800/1.16/-0.03em}. .h-2{clamp(24px,2.3vw,36px)/700/1.22}. .lead{clamp(18px,1.55vw,23px)/1.62/500/--ink-soft}. .body{clamp(16px,1.3vw,19px)/1.66/--ink-soft}. .mono{IBM Plex Mono clamp(13px,1vw,15px)/letter-spacing .06em/--mute}.\n[글래스] .glass{background:var(--glass);backdrop-filter:blur(22px) saturate(1.5);border:1px solid var(--stroke);border-radius:26px;box-shadow:var(--shadow-card)}. .glass-strong{background:var(--glass-strong);blur(26px) saturate(1.6);border 1px rgba(255,255,255,.85);box-shadow:var(--shadow-pop)}. .glass-deep{background:linear-gradient(150deg,rgba(14,42,102,.92),rgba(9,27,70,.88));border:1px solid rgba(120,165,235,.35);color:#eaf2ff}.\n[칩] .chip{inline-flex;gap 8px;padding 8px 16px;border-radius 999px;font clamp(13px,1.05vw,15.5px)/600;background rgba(255,255,255,.6);border 1px var(--stroke-soft);backdrop-filter blur(10px)}. 변형 .blue/.navy/.risk/.pos 는 각각 해당 색 12%/10% 배경 + 30% 보더.\n[HUD] #hud{position:fixed;inset:auto 0 0 0;z-index:40;pointer-events:none}. .hud-row{display:flex;align-items:flex-end;justify-content:space-between;padding:0 28px 14px}. 좌측 #hud-act{mono 12px/600/letter-spacing .3em/uppercase/--mute}. 우측 .hud-right{gap:16px;pointer-events:auto}: #hud-dots(4px 원, off rgba(11,28,56,.16) / on rgba(11,28,56,.62), gap 5px) + .hud-counter(mono 13px tabular-nums, \"01 / 27\", 총계는 --faint) + .hud-btn ×3(38px 원, border 1px --stroke-soft, background rgba(255,255,255,.65), blur(12px); hover: background #fff, translateY(-2px), shadow 0 8px 20px -8px rgba(15,45,105,.3); .dim 시 opacity .3). 하단 .hud-track{height:2.5px;background:rgba(11,28,56,.08)} 안 #hud-bar{background:linear-gradient(90deg,var(--sky),var(--blue));transition:width .5s var(--ease)}.\n[힌트] #hint{fixed;bottom:52px;left:50%;translateX(-50%);mono 12px letter-spacing .12em;--mute;padding 8px 18px;border-radius 999px;background rgba(255,255,255,.55);blur(10px);border 1px --stroke-soft}. body.ready 에서 opacity 0→1 (transition .8s ease 1.2s), body.moved 에서 0 (.4s). 텍스트 그대로: \"클릭 또는 → 키로 넘기기 · F 전체화면 · 우상단 ≡ 목차\".\n[TOC] #toc{fixed inset0;z60;background rgba(20,45,95,.25);backdrop-filter blur(8px);opacity0;visibility hidden;transition .35s var(--ease);display:flex;justify-content:flex-end}. .toc-sheet{width:min(420px,92vw);height:100%;background rgba(248,251,255,.92);blur(30px);border-left 1px --stroke;padding 34px 30px;transform translateX(40px)}. #toc.open 시 opacity1 + sheet translateX(0) (.4s). .toc-title{800/20px}. .toc-act{mono 11px letter-spacing .28em uppercase --blue-deep 700, margin 22px 0 8px}. .toc-item{flex;gap 12px;padding 9px 12px;border-radius 10px;15.5px/600/--ink-soft; hover background rgba(47,109,246,.08)}. .toc-n{mono 12px --faint}.\n[동작] 다음=클릭(화면 우측 82%)·→·↓·Space·Enter·PgDn / 이전=화면 좌측 18% 클릭·←·↑·Backspace·PgUp / F=전체화면 / Home·End / Esc=TOC 닫기. 슬라이드 이동 시 520ms animLock. 해시 #슬라이드.스텝 로 딥링크.
```

#### 인터랙티브 라이브 데모 패널 (S09 — 문제 생성 시뮬레이터)

- 왜: 세미나 청중이 슬라이드 안에서 직접 눌러보는 유일한 '제품 체험' 자산. 이미 실서비스 문제 카드 구조를 그대로 본떠 만들어져 있어 세미나 덱의 하이라이트로 그대로 재사용 가능.
- 소스: `d:/Desktop/2026project/nara/ir-deck/index.html:285-337 + slides.css:168-279 + demo.js:210-404 + demo-data.js`
- 시각 스펙:

```
[헤드] .demo-head{flex column gap 8px; margin-bottom 14px} → .kicker \"INTERACTIVE DEMO\" / h2.h-2 \"지금 이 슬라이드에서 <span class=accent>직접 생성</span>해 보세요\" / .live-badge{inline-flex gap 10px; align-self flex-start; clamp(13px,1.05vw,15px)/700; color var(--blue-deep); padding 8px 16px; border-radius 999px; background rgba(47,109,246,.1); border 1px rgba(47,109,246,.35)} 안에 .live-dot{9px 원, background var(--blue), @keyframes live-pulse 1.6s ease-in-out infinite: 0%/100% box-shadow 0 0 0 0 rgba(47,109,246,.5) → 50% box-shadow 0 0 0 7px rgba(47,109,246,0)}. 뱃지 텍스트 그대로: \"체험 가능 영역 — 이 패널 안의 클릭은 슬라이드를 넘기지 않습니다\".\n[패널] .demo-panel = .glass-strong + padding clamp(16px,1.6vw,24px), 반드시 data-ui 속성 → 내부 클릭이 슬라이드를 넘기지 않음.\n[탭] .demo-tabs{flex gap 8px; margin-bottom 14px}. .demo-tab{padding 9px 20px; border-radius 11px; border 1px --stroke-soft; background rgba(255,255,255,.5); clamp(14px,1.1vw,16px)/700; color --ink-soft}. .demo-tab.on{background linear-gradient(135deg,var(--blue),var(--blue-deep)); color #fff; border-color transparent}. 탭 라벨 그대로: \"문제 생성\" / \"워크북 변형 (AI 0회)\".\n[탭1 레이아웃] .demo-pane{display:grid; grid-template-columns:1.05fr 0.65fr 1.1fr; gap clamp(12px,1.3vw,18px)}. 좌=지문, 중=컨트롤, 우=출력.\n  · 좌 .demo-passage{background rgba(255,255,255,.75); border 1px --stroke-soft; border-radius 14px; padding 16px 18px; height clamp(240px,34vh,360px); font clamp(14px,1.1vw,16px)/1.78/450; overflow-y auto}. 라벨(.demo-label = mono 12px/700/letter-spacing .12em): \"시험범위 지문 (고1 영어 · 본문 변형)\".\n  · 중 .demo-right{flex column gap 10px}: 라벨 \"문항 유형\" → .type-pick 4개 필(빈칸 추론 / 어법 / 글의 순서 / 요약문 완성; padding 8px 14px; border-radius 999px; off=rgba(255,255,255,.6)+--stroke-soft, on=rgba(47,109,246,.14)+border var(--blue)+color var(--blue-deep)) → 라벨 \"난이도\" → .diff-chip 3개(기본/중급/킬러, 기본 선택=중급; on=rgba(14,42,102,.1)+border var(--navy)+color var(--navy)) → .btn#demo-go{background linear-gradient(135deg,var(--blue),var(--blue-deep)); color #fff; padding 13px 26px; border-radius 14px; box-shadow 0 12px 28px -10px rgba(18,66,184,.55); hover translateY(-2px)} 라벨 \"문제 생성하기 — 2 크레딧\"(뒷부분은 mono, rgba(255,255,255,.75), 0.82em) → .demo-progress{min-height 26px; mono 13px; color --blue-deep}.\n  · 우 .demo-out{background rgba(255,255,255,.78); border 1px --stroke-soft; border-radius 14px; padding 16px 18px; height clamp(240px,34vh,360px); overflow-y auto}. 빈 상태 문구 그대로(mono, 중앙정렬, line-height 1.7): \"유형을 고르고 [문제 생성하기]를 누르면, 실제 서비스의 문제 카드 구조 그대로 출력됩니다.\"\n[생성 모션 시퀀스] ① 버튼 클릭 → disabled. ② 진행 문구 4개를 각각 520~800ms(520+random*280) 간격으로 \"▸ \" 접두어와 함께 교체 표시: \"지문 구조 분석 중 — 문장 9개 · 논리 흐름 추출\" → \"출제 포인트 선정 중 — 유형 적합 스팬 탐색\" → \"오답 선지 설계 중 — 매력적 오답 · 함정 시나리오\" → \"품질 게이트 검증 중 — 정답 위치 다양성 · 힌트 누출 검사\". ③ 완료 문구(color var(--pos)): \"✓ 생성 완료 — 품질 게이트 통과 · 2크레딧 차감\". ④ 문제 카드 삽입 → 발문을 16ms/자 타이핑(커서 \"▍\" color var(--blue), @keyframes caret .9s step-end infinite로 50% opacity 0). ⑤ 선지 5개를 160ms 간격으로 opacity0/translateY(8px) → 1/0, transition all .45s cubic-bezier(.16,1,.3,1).\n[문제 카드] .qcard{clamp(13.5px,1.05vw,15.5px)/1.7}. .q-head{flex gap 8px}: .q-badge \"Q1\"{800/13px/#fff; background linear-gradient(135deg,var(--blue),var(--blue-deep)); padding 4px 11px; border-radius 8px} + .q-cat 2개{12px/700/--blue-deep; background rgba(47,109,246,.1); padding 4px 10px; radius 999px} + .q-diff{12px/700/--navy; background rgba(14,42,102,.08)}. .q-direction{700}. .q-passage{background rgba(47,109,246,.05); border 1px rgba(47,109,246,.14); radius 10px; padding 12px 14px} 안 .blank{800/--blue-deep/letter-spacing .08em}, .mk{underline, text-underline-offset 3px, thickness 1.5px}. .q-options{flex column gap 5px}, 선지 앞 원문자 ①②③④⑤. .q-reveal-btn{border 1px rgba(47,109,246,.35); background rgba(255,255,255,.8); 13.5px/700/--blue-deep; padding 8px 16px; radius 10px} 라벨 토글 \"정답 · 해설 보기\"↔\"정답 · 해설 접기\". .q-answer{border-top 1px dashed --stroke-soft; padding-top 10px; display none→block}. .qa-k{800/--pos}, .qa-k.wrong{color --risk}. 정답 선지에 .correct-reveal{color var(--pos); font-weight 700}.\n[탭2 워크북] #pane-wb{flex column gap 12px}. .wb-controls{flex align-center gap 14px}: 라벨 \"빈칸 밀도\" + input[type=range] min15 max60 value30 step5 {width 180px; accent-color var(--blue)} + \"30%\" + .btn.ghost{background rgba(255,255,255,.7); color --blue-deep; border 1px rgba(47,109,246,.35)} \"다시 뽑기 (seed +1)\" + mono \"seed 1\". .wb-sheet{background rgba(255,255,255,.8); border 1px --stroke-soft; radius 14px; padding 18px 20px; max-height clamp(190px,26vh,280px); font clamp(14.5px,1.15vw,17px)/2.05/450}. .wb-blank{inline-block; min-width 76px; text-align center; border-bottom 2px solid var(--blue); color transparent; margin 0 2px} 안 sup{--blue-deep; 10.5px/800; absolute left 2px top -2px}. .wb-bank{flex wrap gap 7px} span{13.5px/600/--ink-soft; background rgba(47,109,246,.07); border 1px rgba(47,109,246,.18); padding 5px 12px; radius 999px}, 첫 칩 라벨 \"단어 은행\". 하단 .wb-note(mono 12.5px --mute) 문구 그대로: \"AI 호출 0회 — 시드 기반 결정론 변환이라 같은 시드는 항상 같은 학습지(인쇄 재현 100%), 시드만 올리면 무제한 재출제.\"\n[각주] .src{position absolute; left clamp(36px,6vw,110px); bottom clamp(64px,9vh,100px); mono 11.5px; --faint; max-width 70vw} 문구 그대로: \"실제 서비스의 컴포넌트 구조(발문·변형 지문·5지선다·정답/해설/오답 해설)를 그대로 본뜬 시뮬레이션입니다. 실제 제품은 Gemini 기반 생성 + 품질 게이트 검증을 거칩니다.\"
```

#### 파이프라인 6노드 카드 (S08 — 수업 준비의 전 공정)

- 왜: SMOAT 제품 전체를 한 화면에 설명하는 확정 문안. 세미나에서 '무엇을 배우는가'의 뼈대로 그대로 쓸 수 있고, 스텝 리빌로 한 노드씩 등장시키는 안무가 이미 짜여 있다.
- 소스: `d:/Desktop/2026project/nara/ir-deck/index.html:246-280 + slides.css:155-166`
- 시각 스펙:

```
[구조] .slide 에 data-steps=\"6\". 상단 .top{margin-bottom clamp(20px,3.2vh,38px)}: .kicker \"ACT 2 · PRODUCT\"(margin-bottom 14px) + h2.h-1 \"문제 생성기가 아니라, <span class=accent>수업 준비의 전 공정</span>입니다\".\n[노드] .pipe 안에 .pipe-node.glass 6개. 각 노드는 data-s=1~5(6번째는 data-s=\"5\" data-d=\"2\")로 클릭마다 하나씩 아래에서 위로 26px 올라오며 blur(6px)→0 페이드인. 노드 내부 구조: .pipe-num{mono 13px/700; color var(--sky); letter-spacing .2em; margin-bottom 6px} → .pipe-name{clamp(18px,1.6vw,24px)/800/-0.02em; margin-bottom 8px} → .pipe-desc{clamp(14px,1.12vw,16.5px)/1.6; color var(--ink-soft); 내부 b 는 color var(--blue-deep)}.\n[확정 텍스트 6장] 01 추출 — \"PDF·이미지 → 전용 OCR(Document AI) + 영역 크롭 인테이크. <b>AI 지문 복원</b>: 빈칸·밑줄로 변형된 문제 지문을 원문으로 되돌림.\" / 02 분석 — \"5-레이어 지문 분석 → 구조도·어법·어휘·구문·자가점검 <b>9섹션 학습 리포트</b>. 톤 3종(교사용/학생용/암기 후킹).\" / 03 출제 — \"23종 문항 + 장문 세트(한 지문 다문항) + 자동 출제. 유형별 품질 게이트·오답 선지 설계·정답 위치 다양성까지 코드로 검증.\" / 04 워크북 — \"<b>AI 호출 0회</b>의 결정론 엔진 12종 — 빈칸·어순·직독직해·백지영작. 같은 지문에서 무제한 변형, 인쇄 100% 재현.\" / 05 시험지 — \"템플릿 8종 A4 조판 → <b>한글(HWPX)·Word(DOCX)·PDF</b>. 동형 시험지: 기출의 유형 배열·난이도 곡선·배점을 추출해 새 지문에 재적용.\" / +α 엔게이지 — \"지문 기반 <b>웹툰 생성</b>(스타일 5종) · 해설 생성 · 문장 재번역 · AI 튜터링 챗.\"\n[푸터] .pipe-foot.lead{margin-top clamp(14px,2.2vh,24px); text-align center} data-s=\"5\" data-d=\"3\": \"강사가 수업에서 쓰는 <b>모든 산출물</b>이 한 파이프라인에서 나옵니다 — 그래서 이탈할 이유가 줄어듭니다.\"
```

#### 카운트업 스탯 그리드 (S01 커버 4스탯 / S07 3스탯)

- 왜: 숫자 임팩트 슬라이드의 검증된 패턴. data-count 하나만 붙이면 easeOutQuart 카운트업이 자동으로 돈다 — 세미나 '시간 절감 10시간→10분' 같은 슬라이드에 바로 이식.
- 소스: `d:/Desktop/2026project/nara/ir-deck/index.html:46-51, 221-225 + deck.css:266-276 + slides.css:82-88`
- 시각 스펙:

```
[그리드] .cover-stats{display:grid; grid-template-columns:repeat(4,1fr); gap clamp(18px,3vw,48px); margin-top clamp(26px,4.4vh,46px)} 각 .stat{text-align:center}. 3개짜리(.smart-stats)는 repeat(3,1fr).\n[스탯] .stat-v{font-size clamp(40px,4.4vw,72px)(커버에선 clamp(30px,3vw,50px)); font-weight 800; letter-spacing -0.04em; line-height 1; color var(--ink); font-variant-numeric:tabular-nums}. 단위 .unit{font-size .45em; font-weight 700; color var(--ink-soft); margin-left 2px}. 라벨 .stat-l{margin-top 10px; clamp(14px,1.15vw,17px)/600; color var(--mute)}.\n[모션] 숫자 span 에 data-count=\"23\"(정수) / data-count=\"19.2\"(소수 1자리 자동 인식) / data-fmt=\"plain\"(콤마 없음, 기본은 comma → ko-KR toLocaleString) / data-dur=\"1300\"(기본). 부모가 .on 되는 순간 requestAnimationFrame 루프로 easeOutQuart(1-(1-p)^4) 카운트업, 1회만 실행(data-counted 가드).\n[확정 4스탯 텍스트] \"1개월 / MVP 개발 → 베타 100+ 회원\", \"23종+α / AI 문항 유형 + 커스텀 엔진\", \"20만 원 / 월 광고비 전부 (메타 2개)\", \"19.2만 LOC / 4인 + AI 팀원이 만든 코드\".\n[바 성장 변형] 같은 리빌 훅에 data-grow=\"87%\" 를 주면 width가 0→87%로 자란다(.gm-bar 예). data-axis=\"y\" 이면 height.
```

#### 세미나 신청 마감 카운트다운 타일 (rose 톤, 실시간)

- 왜: 세미나 덱의 '지금 신청' 슬라이드에 그대로 붙일 수 있는 실존 제품 UI. 실제 서비스 화면과 100% 동일해서 신뢰도가 높고, 1초 갱신 + ping + D-0 pulse 라는 명확한 모션 스펙이 있다.
- 소스: `d:/Desktop/2026project/nara/src/components/help-center/group-seminar-display.tsx:399-426`
- 시각 스펙:

```
[컨테이너] relative overflow-hidden rounded-xl border border-rose-100 bg-rose-50/60 p-4 (모바일 col-span-2 / 데스크톱 col-span-1).\n[펄스 도트] 우상단 absolute right-3.5 top-3.5, flex size-2: 뒤쪽 span = absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60, 앞쪽 span = relative inline-flex size-2 rounded-full bg-rose-500.\n[라벨] mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-rose-500 + lucide AlarmClock size-4 + 텍스트 \"신청 마감까지\".\n[시계] flex flex-wrap items-baseline gap-x-1.5 font-bold text-rose-600 tabular-nums. days>0 이면 text-[15px] \"D-{days}\", 그 뒤 text-lg tracking-tight \"HH:MM:SS\"(2자리 zero-pad). 마운트 전에는 text-lg text-rose-300 \"--:--:--\". D-0(당일)이면 컨테이너 숫자행 전체에 animate-pulse + text-[11px] font-semibold \"오늘 마감!\" 추가.\n[하단] mt-0.5 text-[11px] font-medium text-rose-400 — \"선착순 {N}명 · 정원이 차면 조기 마감\" (세션이 여러 개면 \"일자별 선착순 {N}명\", capacity 없으면 \"상시 모집\").\n[갱신] setInterval 1000ms. 마감 지나면 차분한 회색 타일로 폴백 — border-slate-100 bg-slate-50/60 p-4 rounded-xl, 제목 \"신청 마감\", 본문 \"접수 마감\", 보조 \"실행 {N}일 전까지 신청\" 또는 \"정원이 차면 자동 마감\".\n[랜딩용 다크 변형] 같은 기능의 다크 버전은 seminar-countdown.tsx — inline-flex items-center gap-2.5 rounded-xl border border-red-400/50 bg-red-500/15 px-3.5 py-2, AlarmClock text-red-400, 라벨 text-[12px] font-bold text-red-200/90 \"신청 마감까지\", 시계 font-mono text-[15px] font-black tabular-nums tracking-wide text-white, D-N 은 text-red-400 mr-1.5.
```

#### 랜딩 세미나 프로모 배너 (좌 다크 텍스트 / 우 커버 2분할)

- 왜: 세미나 자체를 홍보하는 실존 제품 화면. 세미나 덱의 오프닝/CTA 슬라이드를 '우리 랜딩에 이렇게 떠 있습니다'로 그대로 재현할 수 있다.
- 소스: `d:/Desktop/2026project/nara/src/components/landing/seminar-promo-section.tsx:37-118`
- 시각 스펙:

```
[래퍼] section mx-auto w-full max-w-[1160px] px-5 pt-10 (lg:max-w-[1320px] lg:pt-0). 링크 카드: group block overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_-50px_rgba(15,23,42,0.55)]; hover 시 -translate-y-0.5 + shadow-[0_40px_90px_-46px_rgba(37,99,235,0.5)]; lg:h-[calc(100svh-240px)] lg:min-h-[480px].\n[그리드] grid grid-cols-1 md:grid-cols-2 lg:h-full.\n[좌 패널] relative flex flex-col justify-center gap-4 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-8 text-white (sm:p-10, lg:gap-6 lg:p-14). 좌상단 장식: pointer-events-none absolute -left-16 -top-16 size-64 rounded-full bg-blue-500/20 blur-3xl.\n  · 뱃지행: \"모집중\" = inline-flex gap-1.5 rounded-full bg-blue-500 px-3 py-1 text-[12px] font-black, 안에 relative flex size-1.5 + absolute animate-ping rounded-full bg-white opacity-70 + relative size-1.5 rounded-full bg-white. 옆에 \"선착순 {N}명\" = rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold text-blue-100 + lucide Users size-3.5.\n  · 제목: h2 whitespace-pre-line text-2xl font-black leading-tight tracking-tight (sm:text-3xl, lg:text-[38px] lg:leading-[1.25]).\n  · 설명: p whitespace-pre-line break-keep text-[13.5px] leading-[1.55] text-slate-300 (sm:text-[14px], lg:text-[16px]).\n  · 메타행: flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-slate-300 (lg:text-[14.5px]), lucide CalendarClock/MapPin size-4 text-blue-300. 날짜는 여러 세션이면 \" / \"로 잇고 뒤에 \" 중 택1\" 붙임, 없으면 \"일정 조율 중\".\n  · 카운트다운(위 rose/red 다크 pill) 삽입.\n  · CTA: inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-black text-slate-950, group-hover:translate-x-0.5, 텍스트 \"세미나 신청하기\" + lucide ArrowRight size-4.\n[우 패널] relative min-h-[220px] md:min-h-full. 커버 있으면 img absolute inset-0 h-full w-full object-cover. 없으면 absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-100 text-slate-400 + lucide Users size-10 strokeWidth 1.5 + text-sm font-bold tracking-wide \"SMOAT 단체 세미나\".
```

#### 실사 캠페인 이미지 31장 + 카피 가이드

- 왜: 세미나 덱의 풀블리드 배경/섹션 브레이크에 바로 쓸 수 있는 유일한 고해상도 실사 자산. 각 컷마다 추천 카피·보조 카피·카피 위치가 README에 확정돼 있어 슬라이드 구현자가 텍스트 배치를 고민할 필요가 없다.
- 소스: `d:/Desktop/2026project/nara/public/marketing/campaign-2026/ (01~31 *.png, README.md)`
- 시각 스펙:

```
[사용 규칙(README 명시)] 웹에서는 aspect-ratio:16/9 유지 + object-fit:cover. 카피는 이미지에 재합성하지 말고 HTML 텍스트 레이어로 올린다. 흰색 또는 매우 옅은 청색 글자 + 코발트 CTA 조합. 08번만 약 8:5. 시험지 내부의 작은 문자는 확대 소재로 쓰지 않는다.\n[세미나 지정 컷과 카피 위치] 01-teacher-evening.png — 카피 \"출제에 쓰던 밤을 돌려드립니다\", 보조 \"영어 자료만 넣으면 문항부터 시험지까지 한 번에 완성됩니다.\", 카피는 왼쪽 어두운 여백, 용도 '세미나 오프닝 슬라이드'. / 05-exam-engine.png — \"복잡한 자료를, 완성된 시험으로\", 보조 \"선생님의 기준은 그대로 두고 반복 작업만 AI에 맡기세요.\", 상단 중앙 또는 우측 상단, '세미나 스크린'. / 06-real-exam-and-worksheet.png — \"보여주기 위한 AI가 아니라, 바로 쓰기 위한 결과물\", 보조 \"실제 시험지와 분석 학습지를 원하는 구성으로 완성하세요.\", 왼쪽 네이비 여백, '세미나 대형 스크린'. / 15-academy-team-seminar.png — \"좋은 시스템은, 교사진 전체의 기준을 높입니다\", 보조 \"분석부터 시험지 제작까지 하나의 흐름으로 함께 운영하세요.\", 왼쪽 네이비 여백, '학원 설명회'. / 21-teacher-evening-returned.png — \"선생님의 저녁을 다시 돌려드립니다\", 왼쪽 네이비 여백, '세미나 엔딩 슬라이드'. / 31-world-without-smoat.png — \"SMOAT 없이 출제한다는 것\", 보조 \"쌓이는 반복 작업 대신, 완성된 시험에 필요한 판단에 집중하세요.\", 왼쪽 상단 네이비 여백, '세미나 도입부'. / 20-before-after-transformation.png — \"출제 전과 후, 같은 하루의 차이\", 상단 중앙, '세미나 오프닝'.\n[슬라이드 적용 예시] .slide 안에 position:absolute;inset:0 인 <img style=\"object-fit:cover;width:100%;height:100%\"> 를 깔고 그 위에 linear-gradient(90deg, rgba(8,21,48,.82) 0%, rgba(8,21,48,0) 62%) 오버레이 + 좌측 40% 폭 텍스트 컬럼(.h-display 흰색 + .lead #b9cdf0).
```

#### 기능별 제품 스크린샷 세트 (features/shots 29장)

- 왜: 세미나에서 '실제 화면'을 보여줄 때 쓰는 유일한 제품 UI 캡처 세트. 각 이미지의 alt/caption 문안이 features 페이지에 확정돼 있어 슬라이드 캡션으로 그대로 인용 가능.
- 소스: `d:/Desktop/2026project/nara/public/features/shots/{academy-erp,ai-question-generation,exam-builder,exam-report,passage-analysis,passage-webtoon,question-extraction}/`
- 시각 스펙:

```
[구성] 7개 폴더 × hero.png + s1~s4.png (academy-erp만 hero.png + s1.png).\n[캡션 확정 문안 예 — passage-analysis] hero.png: alt \"SMOAT 영어 지문 분석 학습지 화면\", caption \"지문 분석 학습지\", 히어로 하이라이트 \"지문 하나가 한 장의 수업용 학습지가 됩니다\". s1.png: alt \"직독직해와 논리 구조 분석 화면\", caption \"심층 분석지\", 섹션 제목 \"직독직해·논리 구조까지 — 7개 섹션 심층 분석지\". s2.png: alt \"구문·문법 포인트·어휘 정리 화면\", caption \"구문·어휘\", 섹션 제목 \"구문 분석·문법 포인트·핵심 어휘 정리\". s3.png: alt \"학습 활동 구성 화면\", caption \"학습 활동\", 섹션 제목 \"11가지 학습 활동 + 6가지 지문 변형\".\n[슬라이드 적용] .glass 카드(border-radius 26px, box-shadow var(--shadow-card)) 안에 border-radius 14px + border 1px var(--stroke-soft) 로 이미지를 감싸고, 하단에 mono 11.5px var(--faint) 캡션. 스텝 리빌은 data-fx=\"pop\"(scale .86→1)이 화면 캡처에 가장 잘 맞는다.
```


### 갭 / 미확인

- 세미나 커리큘럼/타임테이블 실물 내용은 코드에 없다 — GroupSeminar 레코드(title/summary/benefit/target/description)가 전부 관리자 입력 DB 값이라, 실제 운영 중인 세미나의 확정 커리큘럼 문구는 DB 또는 smoat-offline-marketing/'4_SMOAT_세미나_결합 1.pdf' 안에만 존재한다. PDF는 이번 정찰에서 열지 않았다.
- smoat-offline-marketing/ 3개 PDF(4_SMOAT_세미나_결합 1.pdf, 2027_영어_실전모의고사_문제지.pdf, 전단지용 학습지.pdf) 내용 미확인 — 세미나 실물 배포물의 카피/레이아웃을 알려면 별도 PDF 판독 필요.
- ir-deck/_qa/*.jpeg 28장과 ir-deck/_pdf/page-*.jpg 27장은 파일 존재만 확인했고 이미지 내용을 시각적으로 확인하지 않았다. 실제 슬라이드가 어떻게 보이는지는 코드에서 역산한 것이다.
- ir-deck/index.html 중 S03~S06, S11~S27(약 500줄)의 본문 카피는 슬라이드 제목/act 수준만 확인했고 전문을 읽지 않았다 — 세미나 덱에 인용할 추가 확정 문안이 더 있을 가능성이 크다.
- slides.css 30,100바이트 중 약 290줄만 읽었다. S11~S27 레이아웃 클래스(타임라인·지도 그리드·경쟁 매트릭스·로드맵 등)의 구체 스펙은 미확인.
- scripts/sync-ir-deck.mjs 와 next.config.ts 의 /ir rewrite 규칙 실물을 열어보지 않았다 — 새 세미나 덱을 같은 방식으로 배포하려면 이 두 파일 확인 필요.
- public/manual/redesign-185/ 아래 13개 챕터 SVG 슬라이드(01-question-gen만 35장)와 slides.json 이 있는데, 이것이 별개의 '매뉴얼 슬라이드 시스템'인지 세미나에 쓸 수 있는지는 확인하지 않았다.
- screenshots/site-page-kinds-.../popups/ 245장의 개별 파일명·내용 미확인.
- SeminarPromoSection 이 실제 랜딩 어디에 마운트되는지(조건·위치) 확인하지 않았다.
- 캠페인 이미지 README에 적힌 '추천 카피'는 가이드 문서상의 제안 문구이며, 실제 광고에 집행된 최종 카피인지는 확인하지 못했다.


---

## 각도 A — 랜딩 전반부 씬(Hero / QuestionBurst / Annotation / ExamPaper / Intake) 완전 해부: 실제 코드에 박힌 hex·타이포·레이아웃 치수·모션 타이밍·목업 데이터 원문을 슬라이드 재현 가능한 수준으로 추출

### 관측 사실

- **랜딩 페이지 씬 순서와 앵커 id는 page.tsx에 고정되어 있다: Hero → (모집중 세미나 있을 때만 SeminarPromo) → #section-question(QuestionBurst) → #section-annotation(Annotation) → #section-exam(ExamPaper) → #section-intake(Intake) → #section-report → #section-webtoon → #section-folder → #section-samples → CtaScene. 각 씬은 lg에서 `lg:snap-start` 스크롤 스냅 단위다.**
  - 근거: `src/app/page.tsx:49-90`
- **페이지 루트 <main> 전역 톤: 흰 배경 + gray-900 텍스트, 드래그 선택색이 브랜드 블루로 지정되어 있다 — `bg-white text-gray-900 selection:bg-[#3B82F6] selection:text-white font-sans antialiased`. 배너가 있으면 pt-11(44px) 상단 오프셋.**
  - 근거: `src/app/page.tsx:40-42`
- **Hero 섹션 배경은 네이비 3-스톱 라디얼 그라디언트다: `radial-gradient(120% 80% at 50% -8%, #1B2A4A 0%, #111C34 45%, #0B1220 100%)`. 높이 md 이상 100svh(min 850px), 상단 패딩 pt-20/24/28.**
  - 근거: `src/components/landing/hero-scene.tsx:404`
- **다크 씬용 그리드 오버레이 GRID_DARK = 34px×34px 격자, 선색 rgba(148,180,255,0.06). 라이트 씬용 GRID_INK = 34px×34px, 선색 rgba(15,23,42,0.045). 두 값이 랜딩 전 씬의 배경 텍스처를 통일한다.**
  - 근거: `src/components/landing/shared/scene-ui.tsx:11-16`
- **Hero 상단 글로우 블롭 SceneGlow: `radial-gradient(closest-side, rgba(59,130,246,0.38), transparent)` + blur(20px), Hero에서는 `-top-10 h-[420px] w-[820px]`로 좌우 중앙 정렬(left-1/2 -translate-x-1/2).**
  - 근거: `src/components/landing/shared/scene-ui.tsx:23-30, src/components/landing/hero-scene.tsx:406`
- **Hero 아이브로 뱃지: 높이 32px 알약, 배경 bg-blue-500/15, 글자 text-blue-300, 13px extrabold tracking-[0.04em], 좌측에 Sparkles 아이콘(size-3.5).**
  - 근거: `src/components/landing/hero-scene.tsx:422-425`
  - 실제 문구: 영어 내신·수능 최적화 AI
- **Hero H1은 2줄. 1줄 흰색, 2줄은 그라디언트 텍스트 `bg-gradient-to-r from-[#7DB0FF] to-[#3B82F6] bg-clip-text text-transparent`. 크기 34px → sm:48px(text-5xl) → lg:72px(text-7xl), font-black, leading-[1.15], tracking-tight.**
  - 근거: `src/components/landing/hero-scene.tsx:427-439`
  - 실제 문구: 영어시험 고민은 이제 끝! / SMOAT가 모든 걸 해드립니다
- **Hero 서브카피 본문 색은 #B6C2D9(16px/sm:19px, font-bold, leading-8)이고, 두 번째 줄은 알약 강조 배지로 감싼다 — bg-blue-100, text-blue-800, 15px/sm:17px extrabold, px-5 py-1.5 rounded-full.**
  - 근거: `src/components/landing/hero-scene.tsx:441-452`
  - 실제 문구: SMOAT의 영어 내신·수능 최적화 AI로 / 10시간을 10분으로 단축해드립니다!
- **Hero CTA 2종. 주 CTA는 /register 링크, 높이 52px(sm 58px), bg-blue-600, 흰 글자 15/16px font-black, `shadow-[0_24px_54px_-22px_rgba(37,99,235,1)] ring-4 ring-blue-500/15`, hover 시 -translate-y-0.5 + bg-blue-700. 보조 CTA는 글래스 버튼(border-white/[0.28], bg-white/[0.12], backdrop-blur-xl, 높이 48/54px)이며 클릭 시 #section-samples 로 smooth 스크롤한다.**
  - 근거: `src/components/landing/hero-scene.tsx:462-479`
  - 실제 문구: SMOAT 시작하기 / 실제 결과물 보기
- **Hero 등장 모션: 텍스트 컨테이너가 staggerChildren 0.12s + delayChildren 0.15s. 뱃지 y20→0(0.6s), H1 y34+blur(8px)→0(0.8s), 서브 y22+blur(6px)→0(0.7s), CTA y18→0(0.6s). 전부 ease [0.16, 1, 0.3, 1]. 대시보드는 opacity0/y60 → 0.9s, delay 0.55s.**
  - 근거: `src/components/landing/hero-scene.tsx:409-494`
- **Hero 제품 목업(ProductDashboard)은 3D 부유 애니메이션이다. `@keyframes yshin-builder-float` 8s ease-in-out infinite: 0%/100% translateY(0) rotateX(13deg) rotateY(-9deg) rotateZ(3deg) → 50% translateY(-12px) rotateX(15deg) rotateY(-11deg) rotateZ(4deg). 부모 wrapper에 perspective 1600px, perspectiveOrigin top. 1023px 이하에서는 회전 없이 translateY 0→-8px 6s로 대체, prefers-reduced-motion 이면 animation:none.**
  - 근거: `src/components/landing/hero-scene.tsx:108-144, 488-491`
- **목업 프레임: 바깥 베젤 `border-[7px] border-slate-950/90 bg-slate-950/90 rounded-[28px]`(sm 10px 보더, lg rounded-[34px]), 그림자 `0_36px_110px_-40px_rgba(15,23,42,0.8)`. 내부 화면은 rounded-[20px] border-white/20 bg-slate-50, 높이 382px → sm 430px → lg 468px.**
  - 근거: `src/components/landing/hero-scene.tsx:169-170`
- **브라우저 크롬(높이 48px, bg-white, border-b border-slate-100): 좌측 신호등 점 3개 색은 bg-red-300 / bg-amber-300 / bg-emerald-300(각 10px), 그 옆 URL 알약 bg-slate-100 text-slate-500 11px font-black. 우측에 emerald 뱃지와 파랑 출력 버튼(bg-blue-600).**
  - 근거: `src/components/landing/hero-scene.tsx:171-190`
  - 실제 문구: smoat.co.kr/workbench/exams/create / 저장됨 / 출력
- **목업 본문은 3열 그리드다 — lg에서 `grid-cols-[172px_minmax(0,1fr)_246px]`(sm에서는 150px + 1fr 2열). 좌측 사이드바 네비 4항목 중 index 1(시험지 생성)만 활성(bg-blue-50 text-blue-700 + 파란 도트 bg-blue-500), 나머지는 text-slate-400 + bg-slate-200 도트.**
  - 근거: `src/components/landing/hero-scene.tsx:192-211`
  - 실제 문구: 문제 생성 / 시험지 생성 / 학습지 생성 / 자료 추출
- **좌측 사이드바 최근 문서 카드 3종(첫 카드만 border-blue-200 bg-blue-50/80, 나머지 border-slate-100 bg-slate-50).**
  - 근거: `src/components/landing/hero-scene.tsx:213-229`
  - 실제 문구: 고2 영어 중간 · 12문항 · 편집중 / 수능형 미니 모의고사 · 20문항 / 어법 집중 세트 · 8문항
- **목업 중앙 헤더: 10px 파란 대문자 킥커 + 18/22px font-black 타이틀, 우측에 아웃라인 칩과 검정 칩(bg-slate-950). 편집 캔버스는 bg-slate-100/90 rounded-2xl 안에 A4 지면(w-[76%], min 248px, max 420px, rounded-[10px], 흰 배경)이 떠 있고 좌상단·우상단에 플로팅 라벨이 붙는다.**
  - 근거: `src/components/landing/hero-scene.tsx:232-261`
  - 실제 문구: 시험지 생성 / 고2 영어 중간고사 시험지 편집 / A4 · 2단 · 12문항 / 자동 저장 / 1페이지 편집중 / AI 추천 배치
- **A4 지면 목업 머리말: 8px 파란 학년도 + 15px 검정 시험명 + 반/이름 기입표(grid-cols-[28px_56px], 7px 텍스트), 그 아래 bg-slate-50 지시문 박스(8px).**
  - 근거: `src/components/landing/hero-scene.tsx:262-279`
  - 실제 문구: 2026학년도 1학기 / 고2 영어 중간고사 / 반 _____ 이름 _____ / 다음 글을 읽고 물음에 답하시오. 각 문항의 답을 하나만 고르시오.
- **A4 지면 안 문항 4개(2단 그리드). 2번 문항만 '선택된' 상태로 border-blue-300 bg-blue-50/45 + `shadow-[0_0_0_2px_rgba(37,99,235,0.12)]`, 왼쪽 밖에 GripVertical 드래그 핸들(bg-blue-600 흰 아이콘)이 `yshin-builder-cursor` 2.4s(opacity 0.35↔1, translateY 0↔-2px)로 깜빡인다. 번호 뱃지는 bg-slate-950(선택 문항만 bg-blue-600).**
  - 근거: `src/components/landing/hero-scene.tsx:281-333`
  - 실제 문구: 1 빈칸 추론 / Attention has become the most valuable currency in the digital age... / ① attention ② memory ③ silence ④ wealth ⑤ patience || 2 어법 판단 · 선택됨 / 다음 밑줄 친 부분 중 어법상 틀린 것은? / Every notification, every scroll, every swipe demand... || 3 글의 순서 / (A) However, attention is easily divided... / (B) What we choose shapes our thinking... || 4 조건부 영작 / [조건] 관계대명사 what을 사용할 것. / 우리가 선택하는 것이 사고의 구조를 만든다.
- **하단 파이프라인 카드 4종(sm 이상 4열). 아이콘 타일 색이 각각 bg-blue-500 / bg-cyan-500 / bg-emerald-500 / bg-amber-500 이고, 카드는 `bg-white/82 backdrop-blur-xl border-white/70 rounded-2xl shadow-[0_18px_45px_-30px_rgba(15,23,42,0.55)]`.**
  - 근거: `src/components/landing/hero-scene.tsx:21-51, 59-71, 337-341`
  - 실제 문구: 지면 편집 · A4 2단 레이아웃 / 문항 추가 · 라이브러리에서 배치 / 자동 저장 · 편집 내용 즉시 반영 / 파일 출력 · DOCX·HWPX·PDF
- **우측 패널(lg 이상 246px): 상단 '시험지 설정' + bg-blue-50 '12문항' 칩, A4/2단(bg-blue-600 흰글자)·정답지(bg-slate-50 회색) 3칩, 문항 라이브러리 6종 리스트, 하단 bg-slate-950 Export 카드(파랑 라벨 text-blue-200 + 20px font-black 파일명).**
  - 근거: `src/components/landing/hero-scene.tsx:53, 344-392`
  - 실제 문구: 시험지 설정 / 12문항 / A4 · 2단 · 정답지 / 문항 라이브러리 / + 새 문항 / 1. 빈칸 추론 2. 어법 판단 3. 글의 순서 4. 문장 삽입 5. 제목 추론 6. 조건부 영작 / Export Ready / 고2영어_중간.docx / 시험지·정답지 함께 생성
- **xl(1280px) 이상에서만 보이는 플로팅 뱃지 3개가 목업 밖으로 튀어나온다. 각각 translateZ 80px / 60px / 90px 로 깊이가 다르고, `bg-white/86 backdrop-blur-2xl border-white/75 rounded-2xl shadow-[0_24px_70px_-35px_rgba(15,23,42,0.65)]`, 아이콘 타일은 bg-blue-50 text-blue-600.**
  - 근거: `src/components/landing/hero-scene.tsx:73-103, 147-167`
  - 실제 문구: 시험지 생성 / 실제 지면 직접 편집 · 문항 구성 / 12문항 자동 배치 · 출력 완료 / DOCX·HWPX·PDF
- **씬 공용 크롬 3종이 QuestionBurst/Annotation/ExamPaper/Intake 에 동일 적용된다. (1) SceneGhost: 92px(lg 190px) font-black, 글자 투명 + `-webkit-text-stroke:2px #BFDBFE`(연한 파랑 아웃라인 숫자). (2) SceneKicker: 12px/sm 14px font-extrabold uppercase tracking-[0.14em] text-blue-600. (3) Accent: text-blue-600 인라인 강조.**
  - 근거: `src/components/landing/shared/scene-ui.tsx:33-74`
- **씬 고스트 번호 할당: QuestionBurst=01, Annotation=02, ExamPaper=03, Intake=04. 즉 화면 순서와 번호가 1:1로 맞물린다.**
  - 근거: `src/components/landing/question-burst-scene.tsx:235, src/components/landing/annotation-scene.tsx:88, src/components/landing/exam-paper-scene.tsx:41, src/components/landing/intake-scene.tsx:48`
- **랜딩 공용 스크롤 리빌 규격: Reveal = opacity 0 → 1, y 28 → 0, filter blur(6px) → blur(0), duration 0.7s, ease [0.16, 1, 0.3, 1], viewport once + amount 0.3. Item(pop) = scale 0.8 → 1 스프링(stiffness 320, damping 22). reduced-motion 이면 페이드만 남는다.**
  - 근거: `src/components/landing/shared/reveal.tsx:15-114`
- **QuestionBurst 씬(#burst)은 흰 배경 + GRID_INK, lg에서 `grid-cols-[minmax(0,5fr)_minmax(0,7fr)]` 2열(좌 카피 / 우 데모), gap-8, max-w-[1480px], px-16.**
  - 근거: `src/components/landing/question-burst-scene.tsx:226-232`
- **QuestionBurst 카피 전문. H2는 25px → sm 30px → lg 38px font-black, leading-[1.24], word-break keep-all. 2줄째가 Accent(text-blue-600).**
  - 근거: `src/components/landing/question-burst-scene.tsx:237-262`
  - 실제 문구: FEATURE · 25유형 문제 생성 / 지문 하나로 시작하는, / 초고속 AI 문제 생성 / 지문을 넣는 순간, 빈칸·어법·순서부터 서술형까지 내신·수능 25유형 문항이 단 몇 초 만에 완성됩니다.
- **모바일(<lg) 전용 뱃지 4종은 `border-blue-100 bg-blue-50/70 text-blue-700` 12.5px 알약이며 Stagger(gap 0.08, delay 0.3)로 팝 등장한다.**
  - 근거: `src/components/landing/question-burst-scene.tsx:265-273`
  - 실제 문구: 25유형 전 영역 / 1초 생성 / 장문 세트 / 동형 모의고사
- **PC 좌측 칩 셀렉터(TypeChipSelector)는 3그룹 25버튼이며, 유형 목록은 워크벤치 단일 소스(QUESTION_TYPE_GROUPS)에서 온다. 그룹명은 '수능/모의고사 객관식'(14개), '내신 서술형'(8개), '어휘'(3개). 비선택 칩 = `border-slate-200 bg-white text-slate-700 shadow-sm`, hover 시 -translate-y-0.5 + border-blue-400 + text-blue-700; 선택 칩 = `border-blue-600 bg-blue-600 text-white shadow-md`. 아무것도 안 고른 상태면 첫 칩에 `ring-2 ring-blue-400/60 animate-pulse`, 헤더 아이콘은 animate-bounce.**
  - 근거: `src/components/landing/demo/step3-generate/type-chip-selector.tsx:24-68, src/lib/question-type-ui.ts:308-349`
  - 실제 문구: 유형을 클릭하면 오른쪽에서 문제가 바로 생성됩니다
- **25유형 라벨 전량(mock-data의 QUESTION_TYPES 와 워크벤치 QUESTION_TYPE_GROUPS 라벨이 완전 일치). 객관식 14: 빈칸 추론, 어법 판단, 네모 어법, 어휘 적절성, 글의 순서, 문장 삽입, 주제 추론, 요지/주장, 제목 추론, 함축 의미 추론, 지칭 추론, 내용 일치, 요약문 완성(객관식), 무관한 문장. 서술형 8: 조건부 영작, 문장 전환, 핵심 표현 빈칸, 요약문 완성, 요약문 영작, 배열 영작, 주제문 영작, 문법 오류 수정. 어휘 3: 문맥 속 의미, 동의어, 반의어.**
  - 근거: `src/components/landing/shared/mock-data.ts:45-75, src/lib/question-type-ui.ts:308-349`
- **카테고리 색 토큰 CATEGORY_TINT — 객관식 { bg #EFF6FF, border #BFDBFE, text #1d4ed8 }, 서술형 { bg #EEF2FF, border #C7D2FE, text #4338ca }, 어휘 { bg #ECFDF5, border #A7F3D0, text #047857 }. MainStage 상단 유형 뱃지가 이 값을 인라인 스타일로 쓴다.**
  - 근거: `src/components/landing/shared/mock-data.ts:77-81, src/components/landing/question-burst-scene/main-stage.tsx:101-106`
- **'터져나오는' 연출의 실체는 유형별 순차 타자기 시퀀스다. 페이싱 상수: 시작 지연 200ms → 발문 26ms/자 → PHASE_PAUSE 200ms → 제시문 18ms/자 → 선지 16ms/자(선지 간 90ms) → 정답 공개 → 700ms 후 done → FINAL_HOLD_MS 2400ms 유지 후 다음 유형으로 자동 순환(25개 modulo). 사용자가 일시정지하면 순환 정지.**
  - 근거: `src/components/landing/question-burst-scene.tsx:39-44, 85-171, 192-208`
- **페이즈 인디케이터 문구 5종과 진행바 매핑: stem 0.15 → given 0.45 → options 0.75 → answer/done 1.0. 하단 진행바 높이 6px, 배경 bg-blue-50/50, 채움은 `linear-gradient(90deg, #93C5FD 0%, #3B82F6 50%, #1D4ED8 100%)`, width 트랜지션 0.3s easeOut. 진행 중에는 파란 ping 도트(bg-blue-400 opacity-75 + bg-[#3B82F6] 코어)가 붙는다.**
  - 근거: `src/components/landing/question-burst-scene/main-stage.tsx:36-43, 217-227, 339-364`
  - 실제 문구: 발문 생성중 / 지문 추출중 / 선지 생성중 / 정답 검증중 / 생성 완료
- **MainStage 카드 규격: `rounded-2xl border border-blue-100 bg-white shadow-[0_25px_70px_-15px_rgba(59,130,246,0.12)]`, 높이 374px → sm 410px → lg `clamp(340px, calc(100svh-450px), 450px)`. 상단바는 bg-[#F8FAFC] + border-b border-blue-50.**
  - 근거: `src/components/landing/question-burst-scene/main-stage.tsx:86-114`
- **상단 '분석된 원문' 패널: 배경 `bg-gradient-to-b from-[#F8FAFC] to-white`, 10px 대문자 라벨(tracking-[0.2em] text-blue-500) + 우측 모노 상태 텍스트 'EXTRACTING · n'(완료/모바일은 'ANALYZED · n'). 지문은 font-serif 13/14px, leading-[1.7], text-gray-600.**
  - 근거: `src/components/landing/question-burst-scene/passage-source.tsx:26-58`
  - 실제 문구: 분석된 원문 / EXTRACTING / ANALYZED
- **원문에서 유형별 추출 토큰이 순차 점등하는 연출 스펙: backgroundColor rgba(219,234,254,0) → #BFDBFE → #DBEAFE, color #4B5563 → #1E3A8A → #1E40AF, boxShadow 0 → `0 0 0 4px rgba(59,130,246,0.18)` → 0. duration 0.9s easeOut, delay = 토큰인덱스 × 220ms. 토큰 span 은 `border-b-2 border-[#3B82F6]` + rounded + font-bold.**
  - 근거: `src/components/landing/question-burst-scene/passage-source.tsx:63-97`
- **원문 패널과 문제 패널 사이 ConnectionBeam(데스크톱 전용, 높이 28px): 가운데 'GENERATE' 라벨 + 180×2px 레일 위를 40px 폭 스윕이 `linear-gradient(90deg, transparent, #3B82F6, transparent)`로 left -40px → 180px, 1.2s ease-in-out 무한 반복. 우측에 화살표 SVG.**
  - 근거: `src/components/landing/question-burst-scene/passage-source.tsx:135-177`
  - 실제 문구: GENERATE
- **정답 공개 연출: 원형 체크(bg-[#3B82F6], 흰 ✓, shadow-[0_4px_14px_rgba(59,130,246,0.4)])가 scale [0.7 → 1.15 → 1] 0.45s easeOut 로 팝인 → 파란 문구 → 정답 칩(border-blue-100 bg-blue-50, font-extrabold).**
  - 근거: `src/components/landing/question-burst-scene/main-stage.tsx:296-334`
  - 실제 문구: 정답 도출 완료
- **문항 유형은 7가지 '모양(shape)'으로 렌더된다: mcq(①~⑤ 선지), ordering((A)(B)(C) 카드 3열 + 순서 선택지), insert(삽입 문장 박스 + ①~⑤ 위치 마커), write(점선 답안란), blanks((A)/(B) 2칸 카드), arrange(단어 칩), correct(원문 취소선 → 교정 결과). 각 shape 별 라벨과 플레이스홀더 문구가 다르다.**
  - 근거: `src/components/landing/question-burst-scene/shape-bodies.tsx:16-40, 42-73, 162-258, 333-526`
  - 실제 문구: 원문 인용 / 삽입 문장 / 삽입 위치 후보 / 주어진 글 / 제시문 / 요약문 / 원문 / ▎ 답안 작성 중... / 정답 작성란 / ▎ 정렬 중... / ▎ 교정 중... / 교정 결과
- **선지 아이템 스타일: 기본 `bg-white border-blue-50`, 타이핑 중 `bg-[#F8FAFC] border-blue-200`, 정답 `bg-blue-50 border-[#3B82F6] shadow-[0_4px_14px_rgba(59,130,246,0.18)]` + 번호 원이 bg-[#3B82F6] 흰 글자. 제시문 박스(GivenBox)는 `border-[#BFDBFE] bg-[#EFF6FF] text-blue-900` 에 -top-2 위치의 흰 배경 라벨이 얹힌다. 타이핑 커서는 2~3px 폭 bg-[#3B82F6] blink 0.7~0.8s step-end.**
  - 근거: `src/components/landing/question-burst-scene/shape-bodies.tsx:51-72, 117-152, src/components/landing/question-burst-scene/main-stage.tsx:280-282`
- **모든 문항 목업이 공유하는 원문(HERO_PASSAGE) 1개. 25유형 전부 이 한 지문에서 파생된다는 서사를 코드가 그대로 구현한다.**
  - 근거: `src/components/landing/shared/mock-data.ts:3-4`
  - 실제 문구: In the digital age, attention has become the most valuable currency. Every notification, every scroll, every swipe demands a fragment of our consciousness, and what we choose to engage with shapes the architecture of our thinking.
- **대표 샘플 문항 실물(QUESTION_SAMPLES). 01 빈칸 추론: 발문 '다음 빈칸에 들어갈 말로 가장 적절한 것은?', 제시문 'The most valuable currency in the digital age is ______.', 선지 attention/memory/wealth/silence/patience, 정답 ①. 06 문장 삽입: 삽입 문장 'But this abundance came at a hidden cost.', 정답 ③. 20 배열 영작: 칩 has/attention/currency/become/the/most/valuable → 정답 'attention has become the most valuable currency'. 25 반의어: 'valuable의 반의어로 가장 적절한 것은?' 선지 priceless/worthless/precious/treasured/costly, 정답 ②.**
  - 근거: `src/components/landing/shared/mock-data.ts:207-217, 273-283, 463-472, 514-523`
- **05 글의 순서 샘플의 (A)(B)(C) 단락 원문과 선지 5종. 카드는 rounded-lg border-blue-100 bg-white, 라벨은 11px extrabold tracking-[0.18em] text-blue-500, 0.1 + i×0.12s 지연으로 순차 등장.**
  - 근거: `src/components/landing/shared/mock-data.ts:258-272, src/components/landing/question-burst-scene/shape-bodies.tsx:282-305`
  - 실제 문구: 주어진 글 다음에 이어질 순서로 가장 적절한 것은? / In the digital age, attention has become a scarce resource. / (A) Every app competes aggressively for a slice of it. / (B) As a result, our focus fractures across many screens. / (C) Reclaiming it requires deliberate, daily practice. / (A)-(B)-(C) ... (C)-(A)-(B)
- **SideTracker(실시간 생성 트래커)는 25유형 전체를 2열 버튼 그리드로 나열하고, 상단에 25칸 진행 대시(현재=bg-[#3B82F6], 완료=bg-blue-300, 미방문=bg-gray-200), 우상단 카운터 'n/25'(모노 폰트, bg-gray-100 칩)를 둔다. 현재 항목은 border-[#3B82F6] bg-blue-50 + 파란 펄스 도트, 완료 항목은 파란 체크 SVG. 하단에 자동재생 토글/초기화 버튼.**
  - 근거: `src/components/landing/question-burst-scene/side-tracker.tsx:25-128`
  - 실제 문구: 실시간 생성 트래커 / ■ 일시정지 / ▶ 자동재생 / ↺ 초기화
- **Annotation 씬(#annotation)은 bg-[#F8FAFC] + GRID_INK, lg에서 5fr/7fr 2열. 카피 전문은 3줄 H2 + 2줄 서브.**
  - 근거: `src/components/landing/annotation-scene.tsx:84-113`
  - 실제 문구: FEATURE · 학습지 생성 / 어떤 지문이든, / 바로 수업 가능한 학습지가 / 1초만에 나옵니다. / 문장별 해석·구문 분석부터 학습문제까지, 인쇄만 하면 수업이 시작되는 학습지가 한 번에 완성됩니다.
- **마킹 5종 색상 토큰(제품 지문 편집기와 동일해야 한다고 주석에 명시): vocab #3b82f6, grammar #8b5cf6, syntax #0891b2, sentence #22c55e, examPoint #eab308. 라벨은 어휘/문법/구문/핵심문장/출제포인트.**
  - 근거: `src/components/landing/shared/annotation-marks.tsx:5-36`
- **마킹 5종의 렌더 스타일 원문 — 어휘: `linear-gradient(to top, #dbeafe 35%, transparent 35%)` + border-bottom 2px solid #3b82f6. 문법: `underline wavy #8b5cf6`, thickness 2px, offset 3px. 구문: border-bottom 2px dashed #0891b2. 핵심문장: `linear-gradient(to right, #22c55e 3px, #f0fdf4 3px)` + padding 2px 6px 2px 8px. 출제포인트: `linear-gradient(to top, #fef08a 40%, transparent 40%)`. 전환은 600ms ease.**
  - 근거: `src/components/landing/shared/annotation-marks.tsx:38-120`
- **지문에 실제로 찍히는 마킹 5개와 메모(HERO_ANNOTATIONS): attention(어휘), has become(문법), 'Every notification, every scroll, every swipe'(구문), 'what we choose to engage with shapes the architecture of our thinking'(핵심문장), 'the most valuable currency'(출제포인트).**
  - 근거: `src/components/landing/shared/mock-data.ts:10-28`
  - 실제 문구: 핵심 어휘 — 학생들이 놓치는 명사형 추상어 / 현재완료 — 결과 용법 / 병렬 구조 3회 반복 — 리듬 / 주제문 — 'shapes' 가 술어 / 비유 표현 — 출제 1순위
- **AI 분석 결과 5행(ANALYSIS_LINES). 각 행은 왼쪽 4px 컬러 바(해당 마킹 색) + 90/120px 라벨 + font-mono 본문(14px) 구조이며 행 사이 border-b border-blue-50.**
  - 근거: `src/components/landing/shared/mock-data.ts:30-41, src/components/landing/annotation-scene.tsx:52-74`
  - 실제 문구: 어휘 (3) attention · currency · consciousness / 문법 (2) 현재완료(has become) · 관계대명사(what) / 구문 (1) 병렬 구조 3개 반복 (Every X, every Y, every Z) / 핵심 문장 what we choose to engage with shapes... / 출제 포인트 the most valuable currency (비유 표현)
- **AnnotationMock 3열 레이아웃: `lg:grid-cols-[1fr_56px_1fr]`, xl `[1fr_80px_1fr]`, gap 24/40px. 좌우 카드는 `rounded-2xl bg-white border-blue-100/50 shadow-[0_20px_60px_-15px_rgba(59,130,246,0.05)]`. 좌 카드 상단에 `bg-gradient-to-r from-transparent via-[#60A5FA] to-transparent` 1px 라인, 우 카드는 우측 반폭 그라디언트 라인.**
  - 근거: `src/components/landing/annotation-scene.tsx:234-301`
- **좌 카드 헤더 'Live Input' 칩 색: text-[#3B82F6] on bg-[#EFF6FF] border-[#BFDBFE]. 우 카드 헤더에는 #60A5FA 도트 + animate-ping 링, 우측에 모노 카운터. 하단 마킹 레전드 칩은 활성 시 배경 `색+1A`, 테두리 `색+40`, 글자 = 해당 색, 비활성은 bg #EFF6FF / border #BFDBFE / text #60A5FA / 도트 #93C5FD.**
  - 근거: `src/components/landing/annotation-scene.tsx:238-277, 300-313`
  - 실제 문구: 선생님의 원문 마킹 / Live Input / AI Deep Dive Analysis / 5/5 완료
- **가운데 흐름 인디케이터: 세로 2px 라인(`bg-gradient-to-b from-blue-50 via-blue-300 to-blue-50`) 위로 마킹 색 도트 5개가 opacity [0,1,1,0], y [0,60,120,180], scale [1,1.2,1.2,1], duration 1.5s ease-in-out 로 흘러내린다. 도트는 3.5×3.5, border-2 흰색, shadow-md.**
  - 근거: `src/components/landing/annotation-scene.tsx:281-297`
- **모바일 전용 한글(HWPX) 창 목업 스펙: 창 `rounded-xl border-slate-300/80 shadow-[0_0_0_1px_rgba(15,23,42,0.05),0_30px_60px_-12px_rgba(59,130,246,0.25)]`, 타이틀바 h-8/9 bg-[#f7f8fa], '한' 아이콘 bg-[#2563eb], 메뉴바 9항목, 서식 툴바(회색 아이콘 5개 + 폰트/크기 칩), 눈금자는 `repeating-linear-gradient(to right, #cbd5e1 0 1px, transparent 1px 24px)`, 편집 캔버스 bg-[#e9edf2] 안에 aspect-ratio 210/297 흰 지면, 상태바 h-5/6.**
  - 근거: `src/components/landing/annotation-scene.tsx:144-228`
  - 실제 문구: SMOAT_분석학습지.hwpx - 한글 / 파일 편집 보기 입력 서식 쪽 보안 검토 도구 / 함초롬바탕 / 10.0 pt / 1쪽 1단 1줄 1칸 · 삽입 / 100%
- **ExamPaper 씬(#paper, 고스트 03)은 흰 배경 + GRID_INK, max-w-[1600px], lg 5fr/7fr. 강조 문구의 strong 색이 다른 씬과 달리 #1E3A8A(네이비)다. 우측 폴백 목업은 '실전모의고사_문제지.hwpx - 한글' 창이며 /landing/samples/sample-mock-exam-page1.png 를 A4 비율로 띄운다.**
  - 근거: `src/components/landing/exam-paper-scene.tsx:36-96, 99-176`
  - 실제 문구: FEATURE · 1초 만에 시험지 파일로 / 웹에서 바로 편집하는 시험지! / 워드(DOCX), 한글(HWPX), PDF로도 / 바로 다운가능! / 폰트·여백·표지 양식까지 조판된 파일이라, 받아서 바로 인쇄하고 편집합니다.
- **ExamPaper 4개 체크 항목(모바일 2열 카드 / sm 이상 체크아이콘 리스트).**
  - 근거: `src/components/landing/exam-paper-scene.tsx:64-81`
  - 실제 문구: 100% 편집 가능 · 로고 삽입·문항 수정 자유 / 워드 · 한글 · PDF 출력 · 워드 안정 지원 · 한글(HWPX) 베타 · 인쇄(PDF) / 자동 조판 시스템 · 웹 미리보기와 1:1 완성형 조판 / 정답 및 해설지 동시 생성 · 학생용·강사용 해설지 분리 생성
- **Intake 씬(#intake, 고스트 04)은 bg-[#F8FAFC] + GRID_INK, lg 5fr/7fr(gap-8, px-16). 카피 전문과 3개 불릿.**
  - 근거: `src/components/landing/intake-scene.tsx:39-87`
  - 실제 문구: FEATURE · 자료 추출 / 교재를 찍어 올리면, / 지문이 텍스트로 들어옵니다. / 사진·PDF만 올리면 지문 추출부터 잘린 문장 복원까지 자동입니다. / 사진 · PDF 자동 추출 — 휴대폰으로 찍은 교재 사진도 OK / 잘린 지문 AI 복원 — 페이지 경계에서 끊긴 문장 자동 복원 / 텍스트 추출은 무료 — OCR에는 크레딧이 들지 않습니다
- **Intake 업로드 목업은 2카드 구조(좌: 업로드한 자료 / 우: 추출된 지문)이며 두 카드 사이 여백 중앙에 원형 화살표 커넥터(모바일 ArrowDown, PC ArrowRight, `border-blue-100 bg-white text-blue-600 shadow-[0_8px_20px_-8px_rgba(59,130,246,0.6)]`)가 얹힌다. 좌 카드는 bg-[#F8FAFC], 우 카드는 bg-white, 둘 다 border-blue-100 + `shadow-[0_20px_60px_-15px_rgba(59,130,246,0.08)]`. 카드 뒤에는 `bg-blue-300/15 blur-[56px]`(sm blur-80px) 글로우.**
  - 근거: `src/components/landing/intake-scene.tsx:114-180`
- **OCR 진행바 모션: bg-blue-100 트랙 위 bg-blue-500 바가 width 8% → 100%, duration 1.6s easeInOut, delay 0.3s, viewport once amount 0.4. 좌 카드에는 교재 사진(/landing/generated/uploaded-exam-photo.webp, aspect-[2/3])이 들어간다.**
  - 근거: `src/components/landing/intake-scene.tsx:139-166`
  - 실제 문구: 업로드한 자료 / 교재_p.142.jpg / 텍스트 추출 중 / OCR 텍스트 추출 · 무료
- **추출 결과 텍스트 5줄(EXTRACT_LINES) 중 마지막 2줄이 restored=true 로 표시되어 `bg-blue-50` 하이라이트를 받는다. 각 줄은 0.5 + i×0.18s 지연으로 페이드인, font-serif 12.5/13px.**
  - 근거: `src/components/landing/intake-scene.tsx:27-33, 181-194`
  - 실제 문구: 추출된 지문 / 잘린 문장 AI 복원 / In the digital age, attention has become the most / valuable currency. Every notification, every scroll, / every swipe demands a fragment of our consciousness, / and what we choose to engage with shapes the / architecture of our thinking.
- **Intake/Annotation/ExamPaper/QuestionBurst 4씬 모두 우측 슬롯이 DemoGate 로 감싸여 있다. 뷰포트 폭 ≥1024px 이고 IntersectionObserver(rootMargin 600px)로 근접했을 때만 실제 라이브 데모 청크(step1-crop / step2-analysis / step3-generate / step4-paper)를 마운트하고, 그 전/모바일에서는 목업(fallback)을 보여준다. 모바일에는 풀스크린 시트를 여는 파란 버튼이 붙는다.**
  - 근거: `src/components/landing/demo/demo-gate.tsx:16-107, src/components/landing/intake-scene.tsx:91-98, src/components/landing/question-burst-scene.tsx:282-317`
  - 실제 문구: 라이브 데모 체험하기
- **[추론] 데스크톱 실제 방문자가 보는 우측 화면은 위에서 해부한 목업이 아니라 라이브 데모 컴포넌트다. 목업(UploadMock/AnnotationMock/MainStage+SideTracker/HwpWindowMock)은 모바일과 로드 전 폴백 경로에서만 렌더된다 — 코드 주석이 이를 반복해 명시한다.**
  - 근거: `src/components/landing/intake-scene.tsx:90, src/components/landing/annotation-scene.tsx:116, src/components/landing/question-burst-scene.tsx:18-19, 281`
- **랜딩 헤더 내비 라벨 9종(스크롤 순서와 동일 유지 주석). 헤더는 스크롤 8px 초과 시 h-20 → h-16 축소, lg에서 bg-transparent → bg-white/72 + backdrop-blur-2xl 로 전환된다.**
  - 근거: `src/components/landing/landing-header.tsx:10-21, 51-62`
  - 실제 문구: 단체 세미나 / 25유형 출제 / 학습지 생성 / 시험지 / 자료 추출 / 시험 리포트 / 지문 웹툰 / 아카이브 / 샘플 / 로그인 / 회원 가입

### 덱 재현 대상 (visualSpec)

#### Hero — 네이비 히어로 + 3D 부유 워크벤치 목업

- 왜: 세미나 첫 장(제품 정체성)으로 그대로 쓸 수 있는 가장 완성도 높은 화면. 카피 한 줄이 SMOAT의 가치제안('10시간을 10분으로')을 그대로 담고 있다.
- 소스: `src/components/landing/hero-scene.tsx:402-498`
- 시각 스펙:

```
[캔버스] 16:9 풀블리드. 배경 = radial-gradient(120% 80% at 50% -8%, #1B2A4A 0%, #111C34 45%, #0B1220 100%). 그 위에 34px×34px 격자 오버레이(가로/세로 1px 선, rgba(148,180,255,0.06)). 상단 중앙에 글로우 블롭: width 820px, height 420px, top -40px, left 50% translateX(-50%), background radial-gradient(closest-side, rgba(59,130,246,0.38), transparent), filter blur(20px).
[상단 텍스트 블록] 가운데 정렬, max-width 900px. (1) 알약 뱃지 — height 32px, border-radius 9999px, background rgba(59,130,246,0.15), color #93C5FD(text-blue-300), font-size 13px, font-weight 800, letter-spacing 0.04em, 좌측에 14px sparkle 아이콘, 텍스트 '영어 내신·수능 최적화 AI'. (2) H1 — font-weight 900, line-height 1.15, letter-spacing -0.02em, 데스크 72px. 1줄 '영어시험 고민은 이제 끝!' 색 #FFFFFF, 줄바꿈 후 2줄 'SMOAT가 모든 걸 해드립니다' 는 linear-gradient(90deg,#7DB0FF,#3B82F6) + background-clip:text + color:transparent. (3) 서브 — 19px, font-weight 700, line-height 32px, color #B6C2D9, 텍스트 'SMOAT의 영어 내신·수능 최적화 AI로' → 줄바꿈 → 인라인 알약(background #DBEAFE(bg-blue-100), color #1E40AF(text-blue-800), 17px, font-weight 800, padding 6px 20px, radius 9999px) '10시간을 10분으로 단축해드립니다!'. (4) CTA 2개 가로 배치 gap 12px — 주: height 58px, padding 0 40px, radius 9999px, background #2563EB, color #fff, 16px/900, box-shadow 0 24px 54px -22px rgba(37,99,235,1), 외곽 ring 4px rgba(59,130,246,0.15), 라벨 'SMOAT 시작하기' + 오른쪽 화살표. 보조: height 54px, padding 0 24px, radius 9999px, border 1px rgba(255,255,255,0.28), background rgba(255,255,255,0.12), backdrop-filter blur(20px), color #fff, 14px/900, 좌측 문서 아이콘, 라벨 '실제 결과물 보기'.
[하단 목업] 아래 별도 asset(워크벤치 브라우저 목업) 참조. 배치: 텍스트 블록 아래 64px, 부모에 perspective:1600px; perspective-origin:top.
[모션] 텍스트 컨테이너 stagger 0.12s, 시작 지연 0.15s, 전 요소 ease cubic-bezier(0.16,1,0.3,1). 뱃지 y+20→0 / 0.6s, H1 y+34 & blur(8px)→0 / 0.8s, 서브 y+22 & blur(6px)→0 / 0.7s, CTA y+18→0 / 0.6s. 목업은 opacity0/y+60 → 0.9s, delay 0.55s 후 등장하고, 이후 8초 루프로 부유: 0%/100% translateY(0) rotateX(13deg) rotateY(-9deg) rotateZ(3deg), 50% translateY(-12px) rotateX(15deg) rotateY(-11deg) rotateZ(4deg).
```

#### 워크벤치 브라우저 목업 (시험지 생성 3열 대시보드)

- 왜: '실제 제품이 이렇게 생겼다'를 한 장으로 증명하는 핵심 자산. 3열 IA(네비/편집 캔버스/설정 패널)가 SMOAT 워크벤치 구조를 그대로 보여준다.
- 소스: `src/components/landing/hero-scene.tsx:105-400`
- 시각 스펙:

```
[프레임] max-width 1120px. 바깥 베젤: border 10px solid rgba(2,6,23,0.9), background rgba(2,6,23,0.9), border-radius 34px, box-shadow 0 36px 110px -40px rgba(15,23,42,0.8). 내부 화면: border-radius 24px, border 1px rgba(255,255,255,0.2), background #F8FAFC, height 468px, overflow hidden.
[크롬 바] height 48px, background #fff, border-bottom 1px #F1F5F9, padding 0 20px, flex space-between. 좌: 10px 원 3개 — #FCA5A5(red-300), #FCD34D(amber-300), #6EE7B7(emerald-300) / gap 8px. 그 옆 12px 간격 후 알약 background #F1F5F9, color #64748B, 11px/900, padding 4px 12px, 텍스트 'smoat.co.kr/workbench/exams/create'. 우: 알약 background #ECFDF5, color #047857, 11px/900, 체크 아이콘 + '저장됨'; 그 옆 알약 background #2563EB, color #fff, 11px/900, 다운로드 아이콘 + '출력', box-shadow 0 8px 18px -12px rgba(37,99,235,0.9).
[본문 3열] grid-template-columns: 172px minmax(0,1fr) 246px, 높이 = 420px.
좌 사이드바(background #fff, border-right 1px #F1F5F9, padding 16px): 상단 로고 — 32px 정사각 radius 12px background #2563EB 흰 'S' + 13px/900 'SMOAT'. 메뉴 4행(height 32px, radius 12px, 11~12px/900): '문제 생성'(#94A3B8, 6px 도트 #E2E8F0), '시험지 생성'(활성 — background #EFF6FF, color #1D4ED8, 도트 #3B82F6), '학습지 생성', '자료 추출'. 20px 아래 최근 문서 카드 3장(radius 16px, padding 8px 12px): ①'고2 영어 중간' / '12문항 · 편집중' — border #BFDBFE, background rgba(239,246,255,0.8) ②'수능형 미니 모의고사' / '20문항' ③'어법 집중 세트' / '8문항' — border #F1F5F9, background #F8FAFC. 제목 11px/900 #020617, 메타 10px/700 #64748B.
중앙(padding 20px): 헤더 — 10px/900 uppercase #3B82F6 '시험지 생성', 그 아래 22px/900 #020617 '고2 영어 중간고사 시험지 편집'. 우측 칩 2개: 'A4 · 2단 · 12문항'(border 1px #DBEAFE, background #fff, color #1D4ED8, 10px/900) / 'ㅤ자동 저장'(background #020617, color #fff, 10px/900, 저장 아이콘). 그 아래 편집 캔버스: radius 16px, border 1px #E2E8F0, background rgba(241,245,249,0.9), padding 12px, box-shadow 0 18px 40px -32px rgba(15,23,42,0.45). 캔버스 좌상단 플로팅 칩 '1페이지 편집중'(background rgba(255,255,255,0.95), border 1px #E2E8F0, color #475569, 10px/900, 파란 레이아웃 아이콘), 우상단 칩 'AI 추천 배치'(background #2563EB, color #fff, 10px/900, sparkle 아이콘). 캔버스 중앙에 A4 지면(width 76%, min 248px, max 420px, height 최대 322px, background #fff, radius 10px, border 1px #E2E8F0, box-shadow 0 24px 70px -40px rgba(15,23,42,0.6), padding 16px) — 지면 내용은 별도 asset 참조.
지면 아래 파이프라인 카드 4열(gap 12px): 카드 = radius 16px, border 1px rgba(255,255,255,0.7), background rgba(255,255,255,0.82), backdrop-filter blur(20px), box-shadow 0 18px 45px -30px rgba(15,23,42,0.55), padding 12px. 각 카드 좌측 36px 정사각 radius 12px 아이콘 타일 색: '지면 편집'=#3B82F6, '문항 추가'=#06B6D4, '자동 저장'=#10B981, '파일 출력'=#F59E0B. 제목 13px/900 #020617, 부제 11px/700 #64748B — 순서대로 '지면 편집/A4 2단 레이아웃', '문항 추가/라이브러리에서 배치', '자동 저장/편집 내용 즉시 반영', '파일 출력/DOCX·HWPX·PDF'.
우 패널(background #fff, border-left 1px #F1F5F9, padding 20px 16px): 헤더 '시험지 설정'(12px/900, 파란 설정 아이콘) + 우측 칩 '12문항'(background #EFF6FF, color #1D4ED8). 3칩 그리드: 'A4','2단'=background #2563EB color #fff / '정답지'=background #F8FAFC color #64748B, 각 radius 12px 10px/900 중앙정렬. 아래 박스(radius 16px, border 1px #F1F5F9, background #F8FAFC, padding 12px): 헤더 '문항 라이브러리'(11px/900) + '+ 새 문항'(10px/900 #2563EB), 리스트 6행(각 background #fff, radius 12px, padding 8px 12px, shadow-sm, 10px/900 #334155 + 우측 파란 + 아이콘): '1. 빈칸 추론', '2. 어법 판단', '3. 글의 순서', '4. 문장 삽입', '5. 제목 추론', '6. 조건부 영작'. 맨 아래 다크 카드(radius 16px, background #020617, color #fff, padding 16px): 11px/900 #BFDBFE 'Export Ready', 20px/900 '고2영어_중간.docx', 11px/700 #CBD5E1 '시험지·정답지 함께 생성'.
[플로팅 뱃지 3개 — 1280px 이상] 목업 밖으로 튀어나온 글래스 카드: background rgba(255,255,255,0.86), border 1px rgba(255,255,255,0.75), radius 16px, padding 12px 16px, backdrop-filter blur(40px), box-shadow 0 24px 70px -35px rgba(15,23,42,0.65). 각 카드 좌측 40px 아이콘 타일 background #EFF6FF, color #2563EB. 위치/깊이: 좌상단(-left 40px, top 48px, translateZ 80px) '시험지 생성 / 실제 지면 직접 편집'; 우상단(-right 24px, top 80px, translateZ 60px) '문항 구성 / 12문항 자동 배치'; 좌하단(bottom 48px, -left 16px, translateZ 90px) '출력 완료 / DOCX·HWPX·PDF'. 라벨 11px/700 #94A3B8, 값 14px/900 #020617.
```

#### A4 시험지 편집 지면 (드래그 선택 상태 문항 4개)

- 왜: '웹에서 실제 지면을 직접 편집한다'는 SMOAT의 차별점을 시각적으로 증명. 슬라이드에서 확대해 단독으로 써도 되는 밀도.
- 소스: `src/components/landing/hero-scene.tsx:261-334`
- 시각 스펙:

```
[지면] 흰 배경, radius 10px, border 1px #E2E8F0, padding 16px, box-shadow 0 24px 70px -40px rgba(15,23,42,0.6). 비율은 A4에 가깝게(폭 420px, 높이 322px 클립).
[머리말] 하단 border-bottom 1px #0F172A, padding-bottom 8px. 좌: 8px/900 #2563EB '2026학년도 1학기' → 15px/900 #020617 '고2 영어 중간고사'. 우: 2×2 표 grid-template-columns 28px 56px, border 1px #E2E8F0, radius 2px, 7px/700 #64748B — 셀 순서 '반'(background #F8FAFC) / '_____' / '이름'(background #F8FAFC) / '_____'.
[지시문 박스] background #F8FAFC, radius 6px, padding 6px 8px, 8px/700 #475569: '다음 글을 읽고 물음에 답하시오. 각 문항의 답을 하나만 고르시오.'
[문항 2단 그리드] gap 8px, 좌열/우열.
좌열-1: border 1px #E2E8F0, radius 6px, padding 8px. 헤더 = 번호 뱃지(background #020617, color #fff, radius 4px, padding 2px 6px) '1' + 8px/900 '빈칸 추론'. 본문 7px/600 #64748B 2줄: 'Attention has become the most valuable currency in the digital age...' / '① attention ② memory ③ silence ④ wealth ⑤ patience'.
좌열-2 (선택 상태): border 1px #93C5FD, background rgba(239,246,255,0.45), radius 6px, box-shadow 0 0 0 2px rgba(37,99,235,0.12). 카드 왼쪽 밖(-12px)에 세로 중앙 정렬된 드래그 핸들 — 16px GripVertical 아이콘, background #2563EB, color #fff, radius 4px, padding 2px. 핸들은 2.4s ease-in-out 무한 루프로 opacity 0.35→1, translateY 0→-2px. 헤더 = 번호 뱃지(background #2563EB) '2' + '어법 판단', 우측에 알약 '선택됨'(background #2563EB, color #fff, 7px). 본문 2줄: '다음 밑줄 친 부분 중 어법상 틀린 것은?' / 'Every notification, every scroll, every swipe demand...'.
우열-1: '3 글의 순서' — '(A) However, attention is easily divided...' / '(B) What we choose shapes our thinking...'.
우열-2: '4 조건부 영작' — '[조건] 관계대명사 what을 사용할 것.' / '우리가 선택하는 것이 사고의 구조를 만든다.'
```

#### 25유형 칩 셀렉터 (3그룹 클릭 가능 버튼 보드)

- 왜: '25유형'이라는 핵심 숫자를 눈으로 세게 만드는 자산. 슬라이드에서 칩을 하나씩 점등시키면 '유형이 터져나온다' 연출을 그대로 재현할 수 있다.
- 소스: `src/components/landing/demo/step3-generate/type-chip-selector.tsx:24-68`
- 시각 스펙:

```
[구조] 세로 스택 gap 12px. 최상단 유도 헤더: 13px/900 color #2563EB, 좌측 16px MousePointerClick 아이콘(미선택 상태면 위아래 bounce), 텍스트 '유형을 클릭하면 오른쪽에서 문제가 바로 생성됩니다'.
[그룹] 3개. 각 그룹 헤더 = 11px/700 uppercase letter-spacing 0.14em color #94A3B8. 그 아래 6px 간격 후 flex-wrap gap 6px 칩 목록.
그룹1 '수능/모의고사 객관식' (14): 빈칸 추론, 어법 판단, 네모 어법, 어휘 적절성, 글의 순서, 문장 삽입, 주제 추론, 요지/주장, 제목 추론, 함축 의미 추론, 지칭 추론, 내용 일치, 요약문 완성(객관식), 무관한 문장.
그룹2 '내신 서술형' (8): 조건부 영작, 문장 전환, 핵심 표현 빈칸, 요약문 완성, 요약문 영작, 배열 영작, 주제문 영작, 문법 오류 수정.
그룹3 '어휘' (3): 문맥 속 의미, 동의어, 반의어.
[칩 스타일] radius 9999px, padding 4px 12px, font-size 12.5px, font-weight 700, transition 150ms. 기본: border 1px #E2E8F0, background #fff, color #334155, box-shadow sm. hover: translateY(-2px), border #60A5FA, color #1D4ED8, shadow md. 선택: border #2563EB, background #2563EB, color #fff, shadow md. 미선택 상태에서 첫 칩('빈칸 추론')에는 ring 2px rgba(96,165,250,0.6) + pulse 애니메이션.
```

#### 라이브 생성 스테이지 (분석된 원문 → GENERATE 빔 → 문항 타자기 → 정답)

- 왜: 세미나의 하이라이트 연출. '지문 1개 → 25유형 자동 생성'을 타이핑·토큰 점등·정답 팝인의 3단 모션으로 실시간처럼 보여준다.
- 소스: `src/components/landing/question-burst-scene/main-stage.tsx:85-237, src/components/landing/question-burst-scene/passage-source.tsx:9-177`
- 시각 스펙:

```
[카드] radius 16px, border 1px #DBEAFE, background #fff, box-shadow 0 25px 70px -15px rgba(59,130,246,0.12), height 450px, 세로 flex, overflow hidden.
[상단바] background #F8FAFC, border-bottom 1px #EFF6FF, padding 24px 36px 16px. 좌: 유형 뱃지 = radius 9999px, padding 6px 12px, 12px/800 uppercase letter-spacing 0.15em, 색은 카테고리별 인라인 — 객관식 background #EFF6FF color #1d4ed8 / 서술형 background #EEF2FF color #4338ca / 어휘 background #ECFDF5 color #047857. 라벨 형식 '유형 01 · 빈칸 추론'. 그 옆 12px/700 uppercase color #60A5FA 로 카테고리명('객관식'). 뱃지는 유형 전환 시 x -10 → 0 슬라이드 인.
우: 페이즈 인디케이터 = 8px ping 도트(외곽 #60A5FA opacity 0.75 확산 + 코어 #3B82F6) + 11px 모노 볼드 텍스트, 진행 중 color #3B82F6 / 완료 시 #9CA3AF. 문구는 순서대로 '발문 생성중' → '지문 추출중' → '선지 생성중' → '정답 검증중' → '생성 완료'.
[원문 패널] padding 16px 40px, background linear-gradient(180deg,#F8FAFC,#fff), border-bottom 1px #EFF6FF. 헤더 행: 10px/800 uppercase letter-spacing 0.2em color #3B82F6 '분석된 원문' + 1px #DBEAFE 가로선(flex-1) + 우측 10px 모노 볼드 #2563EB 'EXTRACTING · 2'(완료 시 'ANALYZED · 2'). 본문: font-serif 14px, line-height 1.7, color #4B5563 — 원문은 'In the digital age, attention has become the most valuable currency. Every notification, every scroll, every swipe demands a fragment of our consciousness, and what we choose to engage with shapes the architecture of our thinking.' 유형별 추출 토큰(예: 'the most valuable currency', 'attention')은 순차 점등: background rgba(219,234,254,0) → #BFDBFE → #DBEAFE, color #4B5563 → #1E3A8A → #1E40AF, box-shadow 0 → 0 0 0 4px rgba(59,130,246,0.18) → 0, duration 0.9s easeOut, delay = 토큰index × 220ms. 토큰 span 은 padding 1px 4px, radius 4px, font-weight 700, border-bottom 2px solid #3B82F6.
[GENERATE 빔] height 28px, background linear-gradient(180deg,#fff,#F8FAFC), border-bottom 1px #EFF6FF. 중앙 flex gap 12px: 10px/800 uppercase letter-spacing 0.18em color #60A5FA 'GENERATE' + 180×2px 레일(background #DBEAFE, radius 9999px) 위를 40px 폭 스윕(linear-gradient(90deg, transparent, #3B82F6, transparent))이 left -40px → 180px, 1.2s ease-in-out 무한 반복 + 우측 14×10 화살표 SVG(#3B82F6).
[문항 패널] background #fff, padding 20px 40px. 발문: 20px/700, line-height 1.55, color #111827, min-height 56px. 타이핑 중에는 뒤에 3px 폭 세로 커서(background #3B82F6, blink 0.8s step-end). 예시 발문 '다음 빈칸에 들어갈 말로 가장 적절한 것은?'. 20px 아래 제시문 박스: radius 12px, border 1px #BFDBFE, background #EFF6FF, padding 14px 20px, 15px/500, line-height 1.7, color #1E3A8A, 좌상단(-8px) 흰 배경 라벨 '원문 인용'(10px/800 uppercase letter-spacing 0.18em color #3B82F6). 내용 'The most valuable currency in the digital age is ______.' 그 아래 선지 5행(gap 8px): 각 행 radius 12px, padding 10px 16px, flex gap 12px. 기본 background #fff border 1px #EFF6FF; 타이핑 중 행 background #F8FAFC border #BFDBFE; 정답 행 background #EFF6FF border #3B82F6 box-shadow 0 4px 14px rgba(59,130,246,0.18) 이고 번호 원이 background #3B82F6 color #fff. 번호 원 24px, radius 9999px, 12px/700, 기본 background #EFF6FF color #2563EB. 선지 텍스트 15px, line-height 1.5, color #1F2937(정답은 #1E3A8A + bold). 예시 선지 ① attention ② memory ③ wealth ④ silence ⑤ patience, 정답 ①.
[정답 행] 패널 하단 고정, padding-top 20px. 28px 원(background #3B82F6, color #fff, ✓, box-shadow 0 4px 14px rgba(59,130,246,0.4))이 scale 0.7 → 1.15 → 1 (0.45s easeOut) 로 팝인 + 15px/700 color #3B82F6 '정답 도출 완료' + 정답 칩(radius 8px, border 1px #DBEAFE, background #EFF6FF, padding 4px 12px, font-weight 800, color #111827) '①'.
[하단 진행바] 카드 최하단 절대배치, height 6px, 트랙 rgba(239,246,255,0.5), 채움 linear-gradient(90deg,#93C5FD 0%,#3B82F6 50%,#1D4ED8 100%), width = 페이즈별 15% → 45% → 75% → 100%, transition 0.3s easeOut.
[타이밍] 시작 200ms → 발문 26ms/자 → 200ms 정지 → 제시문 18ms/자 → 200ms → 선지 16ms/자(선지 사이 90ms) → 정답 공개 → 700ms 후 완료 → 2400ms 유지 후 다음 유형.
```

#### 실시간 생성 트래커 (25유형 체크리스트 사이드 패널)

- 왜: '25유형 전부'를 한 화면에 열거하면서 진행률을 보여주는 유일한 자산. 슬라이드에서 좌측 스테이지와 나란히 놓으면 규모감이 직관적으로 전달된다.
- 소스: `src/components/landing/question-burst-scene/side-tracker.tsx:25-128`
- 시각 스펙:

```
[패널] background #fff, radius 16px, border 1px #E5E7EB, padding 20px, box-shadow 0 15px 40px -15px rgba(0,0,0,0.05), height 450px, 세로 flex.
[헤더] 좌 11px/800 uppercase letter-spacing 0.18em color #6B7280 '실시간 생성 트래커', 우 12px 모노 볼드 color #374151 background #F3F4F6 radius 4px padding 4px 8px 카운터 '1/25'.
[진행 대시] 25칸 flex gap 3px, 각 height 3px radius 9999px — 현재 #3B82F6 / 완료 #93C5FD / 미방문 #E5E7EB.
[유형 목록] 2열 그리드 gap 6px, 스크롤. 각 버튼 height 40px, padding 0 10px, radius 8px, border 1px. 현재: border #3B82F6, background #EFF6FF, shadow-sm, 번호색 #1D4ED8, 라벨 700 #1E3A8A, 우측 6px 펄스 도트 #3B82F6. 완료: border #DBEAFE, background #fff, 번호색 #60A5FA, 라벨 700 #374151, 우측 11px 파란 체크 SVG(#60A5FA). 미방문: border transparent, hover background #F9FAFB, 번호색 #9CA3AF, 라벨 600 #6B7280. 번호는 12px 모노 900 폭 20px, 라벨은 12px truncate. 목록 항목은 01 빈칸 추론 ~ 25 반의어 전체.
[푸터] 상단 border-top 1px #F3F4F6, padding-top 12px, 버튼 2개 gap 8px, 11px/800 uppercase letter-spacing 0.15em, radius 8px, padding 8px. 자동재생 ON: background #3B82F6, color #fff, border #3B82F6, 라벨 '■ 일시정지'. OFF: background #fff, color #374151, border #E5E7EB, 라벨 '▶ 자동재생'. 우측 보조 버튼 '↺ 초기화'(background #fff, border #E5E7EB, color #374151, padding 0 12px).
```

#### 5색 마킹 레전드 + 지문 마킹 (선생님의 원문 마킹 카드)

- 왜: SMOAT 분석 학습지의 시각 언어(5색 규칙)를 그대로 담고 있어, 세미나에서 '무엇을 자동 분석하는가'를 색 하나로 설명할 수 있다.
- 소스: `src/components/landing/shared/annotation-marks.tsx:22-120, src/components/landing/annotation-scene.tsx:236-278`
- 시각 스펙:

```
[카드] radius 16px, background #fff, border 1px rgba(219,234,254,0.5), padding 20px, box-shadow 0 20px 60px -15px rgba(59,130,246,0.05), position relative. 카드 상단에 1px 하이라이트 라인: linear-gradient(90deg, transparent, #60A5FA, transparent), opacity 0.5.
[헤더] 아래 border-bottom 1px #EFF6FF, padding-bottom 10px. 좌 13px/700 uppercase letter-spacing 0.15em color #60A5FA '선생님의 원문 마킹'. 우 알약 'Live Input' — 12px/700, color #3B82F6, background #EFF6FF, border 1px #BFDBFE, padding 4px 12px, radius 9999px.
[지문] font-serif 15px, line-height 1.75, color #1F2937. 원문 'In the digital age, attention has become the most valuable currency. Every notification, every scroll, every swipe demands a fragment of our consciousness, and what we choose to engage with shapes the architecture of our thinking.' 위에 5종 마킹을 겹쳐 그린다:
· 'attention' → 어휘: background linear-gradient(to top, #dbeafe 35%, transparent 35%), border-bottom 2px solid #3b82f6, padding 0 1px.
· 'has become' → 문법: text-decoration underline wavy #8b5cf6, thickness 2px, underline-offset 3px.
· 'Every notification, every scroll, every swipe' → 구문: border-bottom 2px dashed #0891b2, padding 0 1px.
· 'what we choose to engage with shapes the architecture of our thinking' → 핵심문장: background linear-gradient(to right, #22c55e 3px, #f0fdf4 3px), padding 2px 6px 2px 8px, radius 1px.
· 'the most valuable currency' → 출제포인트: background linear-gradient(to top, #fef08a 40%, transparent 40%), padding 0 1px.
모든 마킹 전환은 600ms ease.
[레전드] 지문 아래 border-top 1px #EFF6FF, padding-top 12px, flex-wrap gap 10px. 칩 5개, 각 radius 9999px, padding 6px 12px, 12px/700, 좌측 8px 도트. 활성 칩은 background = 색+1A(12% 알파), border 1px 색+40(25% 알파), color/도트 = 해당 색. 색 순서: 어휘 #3b82f6, 문법 #8b5cf6, 구문 #0891b2, 핵심문장 #22c55e, 출제포인트 #eab308. 비활성 상태는 background #EFF6FF, border #BFDBFE, color #60A5FA, 도트 #93C5FD.
```

#### AI Deep Dive Analysis 결과 패널 (5행 분석표)

- 왜: '무엇을 얼마나 뽑아주는가'를 숫자와 실제 결과 문자열로 보여주는 자산. 좌측 마킹 카드와 짝을 이뤄 입력→출력 대비를 만든다.
- 소스: `src/components/landing/annotation-scene.tsx:52-74, 300-319, src/components/landing/shared/mock-data.ts:30-41`
- 시각 스펙:

```
[카드] radius 16px, background #fff, border 1px rgba(219,234,254,0.5), padding 20px, box-shadow 0 20px 60px -15px rgba(59,130,246,0.05). 카드 우상단에 우측 절반 폭 1px 라인: linear-gradient(270deg, rgba(96,165,250,0.6), transparent).
[헤더] border-bottom 1px #EFF6FF, padding-bottom 10px. 좌: 12px 원 #60A5FA + 그 위에 동일 색 ping 링(opacity 0.75 확산 애니메이션), 12px 간격 후 13px/700 uppercase letter-spacing 0.15em color #3B82F6 'AI Deep Dive Analysis'. 우: 12px 모노 볼드 letter-spacing wide color #60A5FA '5/5 완료'.
[행 5개] 각 행 flex, padding 8px 0, border-bottom 1px #EFF6FF(마지막 행 제외), gap 16px. 구성: ①4px 폭 × 20px 높이 세로 컬러바(radius 2px, 색 = 해당 카테고리) ②120px 고정폭 라벨(14px/700 #1F2937) + 괄호 카운트(12px/600 #60A5FA) ③본문(14px font-mono, line-height relaxed, color #374151).
행 데이터: '어휘 (3) — attention · currency · consciousness'(바 #3b82f6) / '문법 (2) — 현재완료(has become) · 관계대명사(what)'(바 #8b5cf6) / '구문 (1) — 병렬 구조 3개 반복 (Every X, every Y, every Z)'(바 #0891b2) / '핵심 문장 — what we choose to engage with shapes...'(바 #22c55e) / '출제 포인트 — the most valuable currency (비유 표현)'(바 #eab308).
[좌우 연결 모션(선택)] 두 카드 사이 56~80px 컬럼 가운데 세로 2px 라인(linear-gradient(180deg,#EFF6FF,#93C5FD,#EFF6FF)) 위로 마킹 색 도트 5개(14px, border 2px #fff, shadow-md)가 opacity [0,1,1,0], translateY [0,60,120,180], scale [1,1.2,1.2,1], duration 1.5s ease-in-out 로 흘러내린다.
```

#### 업로드 → 추출 2카드 (자료 추출 씬)

- 왜: '교재를 찍어 올리면 텍스트가 들어온다'는 온보딩 서사를 2카드 + 화살표 커넥터로 압축한 자산. 잘린 문장 복원 하이라이트가 차별점을 시각화한다.
- 소스: `src/components/landing/intake-scene.tsx:105-198`
- 시각 스펙:

```
[배치] 2열 그리드 gap 16px, items-stretch. 두 카드 뒤에 글로우: inset -40px, radius 9999px, background rgba(147,197,253,0.15), filter blur(80px).
[좌 카드 — 업로드한 자료] radius 16px, border 1px #DBEAFE, background #F8FAFC, padding 20px, box-shadow 0 20px 60px -15px rgba(59,130,246,0.08). 헤더: 좌 12px/900 #020617 + 파란 카메라 아이콘 '업로드한 자료', 우 알약 'ㅤ교재_p.142.jpg'(background #fff, border 1px #DBEAFE, color #1D4ED8, 10px/900, radius 9999px). 본문 flex gap 16px: 좌측 교재 사진(aspect 2/3, width 112px, radius 8px, border 1px #E2E8F0, object-cover object-top, 하단 40px 흰 페이드 gradient), 우측 세로 중앙 정렬 — 12px/900 #1D4ED8 + 스캔 아이콘 '텍스트 추출 중', 8px 아래 진행바(height 6px, radius 9999px, 트랙 #DBEAFE, 채움 #3B82F6, width 8% → 100%, 1.6s easeInOut, delay 0.3s), 그 아래 11px/700 #94A3B8 'OCR 텍스트 추출 · 무료'.
[커넥터] 두 카드 사이 여백 정중앙(PC는 좌카드 우측 경계에 걸침): 32px 원, background #fff, border 1px #DBEAFE, color #2563EB, box-shadow 0 8px 20px -8px rgba(59,130,246,0.6), 안에 오른쪽 화살표(모바일 세로 배치일 땐 아래 화살표).
[우 카드 — 추출된 지문] radius 16px, border 1px #DBEAFE, background #fff, padding 20px, 동일 그림자. 헤더: 좌 12px/900 #020617 + 파란 문서 아이콘 '추출된 지문', 우 알약 'ㅤ잘린 문장 AI 복원'(background #EFF6FF, color #1D4ED8, 10px/900, sparkle 아이콘). 본문: font-serif 13px, line-height 1.85, color #1F2937, 4줄이 0.5s + index×0.18s 지연으로 순차 페이드인 — 'In the digital age, attention has become the most' / 'valuable currency. Every notification, every scroll,' / 'every swipe demands a fragment of our consciousness,' / 'and what we choose to engage with shapes the'. 이 중 4번째 줄(및 5번째 'architecture of our thinking.')은 복원된 문장이라 background #EFF6FF + radius 4px + padding 0 2px 하이라이트를 받는다.
```

#### 한글(HWPX) 창 목업 — 결과물이 실제 파일로 열린 화면

- 왜: '웹 미리보기가 아니라 진짜 한글/워드 파일'이라는 주장을 가장 직접적으로 증명. 세미나 청중(교사)의 현실 도구와 직결된다.
- 소스: `src/components/landing/annotation-scene.tsx:144-228, src/components/landing/exam-paper-scene.tsx:99-176`
- 시각 스펙:

```
[창] max-width 480px, radius 12px, overflow hidden, border 1px rgba(203,213,225,0.8), background #fff, box-shadow 0 0 0 1px rgba(15,23,42,0.05), 0 30px 60px -12px rgba(59,130,246,0.25). 뒤에 글로우 inset -40px radius 9999px background rgba(147,197,253,0.2) blur(80px).
[타이틀바] height 36px, background #f7f8fa, border-bottom 1px #E2E8F0, padding 0 12px, space-between. 좌: 18px 정사각 radius 4px background #2563eb 흰 9px/900 '한' + 11.5px/700 #334155 파일명. 학습지 씬은 'SMOAT_분석학습지.hwpx - 한글', 시험지 씬은 '실전모의고사_문제지.hwpx - 한글'. 우: 회색(#94A3B8) 최소화/최대화/닫기 아이콘 3개(14px, 10px, 14px).
[메뉴바] height 28px, background #fff, border-bottom 1px #E2E8F0, padding 0 14px, gap 14px, 11px/600 #475569: 파일 · 편집 · 보기 · 입력 · 서식 · 쪽 · 보안 · 검토 · 도구.
[서식 툴바] height 36px, background #fafbfc, border-bottom 1px #E2E8F0, padding 0 12px, gap 6px: 20px 회색 정사각 아이콘 자리표시자 5개(background rgba(226,232,240,0.8), radius 4px) → 1px 세로 구분선(#E2E8F0) → 칩 '함초롬바탕' / 칩 '10.0 pt'(각 height 24px, border 1px #E2E8F0, background #fff, 10.5px/600, #475569, radius 4px).
[눈금자] height 16px, background #fff, border-bottom 1px #E2E8F0, background-image repeating-linear-gradient(to right, #cbd5e1 0 1px, transparent 1px 24px), background-size auto 7px, background-position 14px bottom, repeat-x.
[편집 캔버스] background #e9edf2, padding 20px 24px 0, 중앙 정렬. 안쪽 지면: width 100%, aspect-ratio 210/297, background #fff, box-shadow 0 1px 3px rgba(15,23,42,0.25), 0 0 0 1px rgba(15,23,42,0.04), 안에 실제 결과물 이미지(학습지 = /landing/generated/actual-smoat-worksheet-page1.webp, 시험지 = /landing/samples/sample-mock-exam-page1.png)를 object-cover object-top 으로 채운다. 지면은 y+14 → 0, 0.5s ease(0.16,1,0.3,1) 로 등장.
[상태바] height 24px, background #f7f8fa, border-top 1px #E2E8F0, padding 0 12px, 10px/600 #64748B, 좌 '1쪽 1단 1줄 1칸 · 삽입' / 우 '100%'.
```

#### 씬 크롬 키트 (고스트 넘버 + 킥커 + 잉크 그리드 + 액센트)

- 왜: 슬라이드 전체에 SMOAT 랜딩의 시각 문법을 일관 적용하기 위한 최소 토큰 세트. 이것만 깔아도 모든 장이 같은 제품에서 나온 것처럼 보인다.
- 소스: `src/components/landing/shared/scene-ui.tsx:11-74`
- 시각 스펙:

```
[배경 텍스처] 라이트 씬: background-image linear-gradient(rgba(15,23,42,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.045) 1px, transparent 1px); background-size 34px 34px. 다크 씬: 같은 구조에 선색 rgba(148,180,255,0.06).
[씬 배경색] QuestionBurst/ExamPaper = #FFFFFF, Annotation/Intake = #F8FAFC, Hero = 네이비 라디얼(위 Hero 스펙).
[고스트 넘버] 제목 뒤 절대배치, font-size 190px(모바일 92px), font-weight 900, line-height 0.8, letter-spacing -0.05em, color transparent, -webkit-text-stroke 2px #BFDBFE, tabular-nums, pointer-events none. 위치는 제목 블록 기준 top -8px, left -16px. 값: QuestionBurst '01', Annotation '02', ExamPaper '03', Intake '04'.
[킥커] font-size 14px(모바일 12px), font-weight 800, text-transform uppercase, letter-spacing 0.14em, color #2563EB, flex gap 10px. 실제 문구: 'FEATURE · 25유형 문제 생성', 'FEATURE · 학습지 생성', 'FEATURE · 1초 만에 시험지 파일로', 'FEATURE · 자료 추출'.
[H2 규격] font-size 38px(sm 30px / 모바일 25px), font-weight 900, line-height 1.24, color #0F172A, word-break keep-all. 강조 구간은 color #2563EB(Accent) 인라인. 본문 서브: 15px, font-weight 500, line-height 1.7, color #4B5563, 강조 strong 은 color #111827 + bold (ExamPaper 씬만 strong 이 #1E3A8A).
[2열 레이아웃] lg 이상 grid-template-columns: minmax(0,5fr) minmax(0,7fr); gap 32px; max-width 1480px; padding 0 64px; align-items center; 섹션 min-height 100svh.
[등장 모션] 모든 블록 공통: opacity 0 → 1, translateY 28px → 0, filter blur(6px) → blur(0), duration 0.7s, ease cubic-bezier(0.16,1,0.3,1), 뷰포트 30% 진입 시 1회. 리스트 항목은 stagger 0.08~0.1s.
```


### 갭 / 미확인

- 가장 큰 갭: PC(≥1024px) 실제 방문자가 보는 우측 화면은 이번에 해부한 목업이 아니라 라이브 데모 컴포넌트(src/components/landing/demo/step1-crop/step1-crop-demo, step2-analysis/step2-analysis-demo, step3-generate/step3-generate-demo, step4-paper/step4-paper-demo)다. 지시된 대상 파일 목록에 없어 이번 정찰에서 읽지 않았다 — 세미나 덱이 '실제 제품 UI 재현'을 노린다면 이 4개 데모 디렉토리를 별도 정찰해야 한다.
- step3-generate 데모가 쓰는 실제 문항 픽스처(src/components/landing/demo/fixtures/questions.ts, DemoQuestionTypeId)의 내용·유형 매핑 미확인. mock-data.ts의 QUESTION_SAMPLES와 다른 데이터일 가능성이 있다.
- 모바일 시트 데모(step3-generate-mobile, step4-paper-mobile)와 MobileDemoSheet 의 UI 미확인.
- 후반부 씬 미확인: report-scene.tsx, webtoon-scene.tsx, folder-scene.tsx, sample-scene.tsx, cta-scene.tsx. (folder/sample 관련 목업 데이터 FOLDER_TREE·FOLDER_DOCS·EXAM_QUESTIONS 는 mock-data.ts:83-165, 526-538 에 존재하나 렌더 코드는 미확인)
- 세미나 프로모 섹션(seminar-promo-section.tsx), 배너 스트립, 팝업, landing-snap.tsx(스크롤 스냅 로직), scroll-progress.tsx 의 시각 스펙 미확인.
- 이미지 자산 실물 미확인: /landing/generated/uploaded-exam-photo.webp, /landing/generated/teacher-marked-passage.webp, /landing/generated/actual-smoat-worksheet-page1.webp, /landing/samples/sample-mock-exam-page1.png. 파일 경로만 코드에서 확인했고 실제 그림 내용은 보지 않았다.
- 폰트 지정 미확인: 코드에는 font-sans / font-serif / font-mono 유틸만 쓰이며, 실제 폰트 패밀리(layout.tsx, globals.css, tailwind config)는 이번에 읽지 않았다. 슬라이드에서 서체를 맞추려면 추가 확인 필요.
- BrandIcon(브랜드 마크)의 실제 도형/색 미확인 — 헤더에서 rounded-full + group-hover:bg-blue-600 만 확인했다.
- hero-scene.tsx 의 A4 목업 문항 본문은 '...' 로 끝나는 축약 문자열이며, 실제 제품이 생성하는 전체 문항 텍스트가 아니다. 슬라이드에서 확대해 쓸 경우 실제 생성물 샘플(sample-scene 또는 데모)로 대체 검토 필요.
- '25유형'이라는 카피와 실제 유형 개수(QUESTION_TYPE_GROUPS 14+8+3=25)는 일치하나, QUESTION_TYPE_UI 에는 호환용 TOPIC_MAIN_IDEA('주제/요지')와 국어(KO_TYPE_REGISTRY) 유형들이 추가로 존재한다. 국어 버티컬은 랜딩 칩에 노출되지 않는다(QUESTION_TYPE_GROUPS_KO 로 분리) — 세미나에서 '국어도 되나요' 질문이 나올 경우 별도 확인 필요.


---

## [각도 E] 시험지 생성 → 조판 → 내보내기(PDF/DOCX/HWPX) 파이프라인. SMOAT은 "미리보기 = 인쇄 = 다운로드" 1:1 일치를 코드 레벨에서 강제하는 3포맷×2모드(문제만/해설포함) = 6개 산출물 파이프라인을 가짐. 슬라이드에서 재현할 핵심 자산은 (1) 6항 다운로드 드롭다운 메뉴, (2) A4 시험지 미리보기(헤더 학교/반/이름 3행 정보박스 + 2단 조판 + 푸터 - N / M -), (3) 정 답 표 페이지, (4) 인라인 정답·해설 블록.

### 관측 사실

- **지원 포맷은 정확히 3종(PDF / DOCX / HWPX)이며 각각 '문제만'과 '해설' 2모드 → 다운로드 드롭다운에 총 6개 항목이 뜬다. 라벨 자구는 순서대로 PDF / PDF 해설 / DOCX / DOCX 해설 / HWPX / HWPX 해설.**
  - 근거: `src/components/exams/exam-paper-builder-client-parts/preview-toolbar.tsx:314-371`
  - 실제 문구: PDF / PDF 해설 / DOCX / DOCX 해설 / HWPX / HWPX 해설
- **PDF 항목에는 붉은 배지 '미리보기 그대로', HWPX 두 항목에는 각각 보라/인디고 'beta' 배지가 붙는다. PDF 배지는 bg-rose-50 text-rose-600, HWPX 배지는 bg-indigo-50 text-indigo-600, HWPX 해설 배지는 bg-violet-50 text-violet-600.**
  - 근거: `src/components/exams/exam-paper-builder-client-parts/preview-toolbar.tsx:321-323, 357-359, 368-370`
  - 실제 문구: 미리보기 그대로 / beta
- **포맷 아이콘 키컬러는 코드에 하드코딩된 상수: pdf "#DC2626"(red-600), docx "#2563EB"(blue-600), hwpx "#0EA5E9"(sky-500). 아이콘은 22×22 SVG 파일 모양에 하단 밴드(rect y=12.6 h=6.6 rx=1.2)를 키컬러로 채우고 흰 글씨로 포맷명을 넣는다. '해설' 버전은 stacked=true 로 뒤에 opacity 0.5 페이지 한 장을 dx 3.5 / dy -2.2 만큼 겹쳐 그린다.**
  - 근거: `src/components/exams/exam-paper-builder-client-parts/preview-toolbar.tsx:92-96, 43-87`
  - 실제 문구: PDF / DOCX / HWPX
- **PDF는 서버 생성이 아니라 브라우저 window.print() 기반이다 — onDownloadPdf={handlePrint}, onDownloadPdfWithAnswers={handlePrintWithAnswers} 로 배선되어 있다. 즉 PDF는 미리보기 DOM을 그대로 인쇄한다.**
  - 근거: `src/components/exams/exam-paper-builder-client.tsx:2514-2515`
- **DOCX/HWPX는 서버 API. 엔드포인트는 /api/exams/{examId}/export-docx 와 /api/exams/{examId}/export-hwpx 이며, 해설 포함은 쿼리 ?answers=true 로 구분한다. 캐시 무효화용 &t=Date.now() 를 항상 붙인다.**
  - 근거: `src/components/exams/exam-paper-builder-client.tsx:2195-2233`
- **다운로드 파일명 규칙: `{시험제목}{정답포함 여부}.docx` — includeAnswers 일 때 제목 뒤에 '_정답포함' 접미사가 붙는다(HWPX도 동일 규칙, 확장자만 .hwpx).**
  - 근거: `src/app/api/exams/[examId]/export-docx/route.ts:248-250; src/app/api/exams/[examId]/export-hwpx/route.ts:254-256`
  - 실제 문구: _정답포함
- **내보내기 1회마다 exam.printCount 가 +1 되고, 관리자 활동 타임라인에 eventType "EXAM_EXPORT", metadata {format:"docx"|"hwpx", title, includeAnswers} 로 기록된다.**
  - 근거: `src/app/api/exams/[examId]/export-docx/route.ts:226-245; src/app/api/exams/[examId]/export-hwpx/route.ts:232-252`
- **내보내기는 휴지통(soft delete) 가드가 걸려 있다 — where: { question: { deletedAt: null } } 로 삭제된 문제는 DOCX 출력물에 절대 포함되지 않는다. maxDuration = 300(초)로 대량 시험지(수백~1000+ 문항) 대응.**
  - 근거: `src/app/api/exams/[examId]/export-docx/route.ts:24-26, 164-165`
- **시험지 조판 헤더(1페이지) 구조: 좌측 [학원 로고 48×48 rounded-lg] + [부제(9px, tracking-[0.18em], 볼드) / 제목(28px font-black)], 우측 [학교 / 반 / 이름] 3행 정보 컬럼(w-[168px], text-[10px], 각 행 border-b pb-1, 라벨 좌·값 우 정렬). 그 아래 border-b pb-3 굵은 헤더선, 그 아래 안내문(좌, truncate) + 시험일(우) 10px 행.**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page-parts/page-header.tsx:57-179`
  - 실제 문구: 학교 / 반 / 이름
- **이름 라벨은 studentNameLabel 로 커스터마이즈 가능하며 기본값은 '이름'. 부제 기본값은 '영어 내신 대비', 안내문 기본값은 DEFAULT_INSTRUCTIONS.**
  - 근거: `src/components/exams/exam-paper-builder-client.tsx:211-219; src/components/exams/paper-builder/constants.ts:49-50`
  - 실제 문구: 영어 내신 대비 / 다음 물음에 알맞은 답을 고르거나 조건에 맞게 서술하시오.
- **시험지 새 제목 기본값은 `새 시험지 {YYYY-MM-DD}` 형식이다.**
  - 근거: `src/components/exams/exam-paper-builder-client.tsx:190`
  - 실제 문구: 새 시험지 2026-07-24
- **2페이지 이후는 슬림 헤더(ContinuedHeader): 좌측 시험 제목, 우측 'N / M' 페이지 카운터, mb-3 border-b pb-2 text-[10px].**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page-parts/page-header.tsx:206-224`
- **모든 페이지 하단 푸터는 가운데 정렬 10px 로 '- N / M -' 형식(하이픈으로 감싼다).**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page.tsx:1565-1573`
  - 실제 문구: - 1 / 4 -
- **2단 조판은 실제로 존재한다. main 이 grid 이며 columns===2 이면 "grid-cols-2 gap-8", 1단이면 "grid-cols-1". 본문 타이포는 comfortable=text-[11.5px] leading-[1.58], compact=text-[10.5px] leading-[1.46].**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page.tsx:729-737`
- **용지 여백(padding)은 밀도에 따라 comfortable px-[34px] py-[28px], compact px-[28px] py-[24px]. 페이지 박스는 aspectRatio: `{widthMm} / {heightMm}` 로 고정되고 shadow-xl ring-1 이 걸린다.**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page.tsx:675-697`
- **용지 규격은 A4(210×297mm)와 B4(257×364mm) 2종. 미리보기 모델 폭 PREVIEW_PAGE_WIDTH = 760px 를 기준으로 widthRatio 배율을 곱해 가상 용지를 만든다. 2단 간격 TWO_COLUMN_GAP=32, 그룹 간격 GROUP_GAP=16, 항목 간격 ITEM_GAP=12.**
  - 근거: `src/components/exams/paper-builder/constants.ts:52-82`
- **문항 헤더 라인 구성: [번호. (font-black, comfortable 13px / compact 12px)] + [메타 배지 '[N점 · 유형명]' (9px, font-semibold)] + [발문]. 메타 배지는 showQuestionMeta 토글로 on/off.**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page.tsx:1093-1124`
  - 실제 문구: [3점 · 빈칸 추론]
- **선지는 flex items-start gap-1.5 행, 번호 span 은 min-w-[18px] font-bold, 원형숫자(①②③④⑤)를 optionDisplayLabel/optionOrdinalLabel 로 만든다. 선지 블록 폰트는 comfortable text-[11px] / compact text-[10px], space-y-1.**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page.tsx:1279-1284, 1384-1400`
- **서술형 답란은 answerSpaceLines 개수만큼 'h-[12px] border-b' 빈 줄을 mt-2 space-y-2 로 그린다.**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page.tsx:1494-1509`
- **칸/쪽 경계에서 지문·문항이 쪼개지면 화면 전용 안내 문구가 붙는다: 지문은 '(지문 계속)', 문항은 '(N번 계속)'. 인쇄 시엔 visibility:hidden 으로 글자만 숨기고 높이는 유지한다(인쇄=미리보기 높이 일치를 위해).**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page.tsx:812-820, 1149-1165; src/components/exams/paper-builder/components/print-styles.tsx:88-94`
  - 실제 문구: (지문 계속) / (1번 계속)
- **디자인 템플릿은 정확히 8종이며 라벨 자구는: 클린 내신형 / 모의고사형 / 워크시트형 / 미니멀 / 학원 브랜드형 / 모던 컬러형 / 클래식 원고형 / 컬러 밴드형. 각각 accent 클래스와 그라디언트 titleClass 를 가진다(예: clean = 'bg-gradient-to-r from-blue-500 to-sky-400 bg-clip-text text-transparent').**
  - 근거: `src/components/exams/paper-builder/templates.ts:3-47`
  - 실제 문구: 클린 내신형 / 모의고사형 / 워크시트형 / 미니멀 / 학원 브랜드형 / 모던 컬러형 / 클래식 원고형 / 컬러 밴드형
- **템플릿별 실제 색 토큰 예시(그대로 인용 가능): clean pageClass "bg-white text-slate-950 ring-slate-200" / headerLineClass "border-slate-900"; mock "bg-white text-black ring-slate-300" + "border-black border-b-2" + font-serif; academy innerClass "before:absolute before:inset-x-0 before:top-0 before:h-2 before:bg-indigo-700"; colorband innerClass "before:absolute before:left-0 before:top-0 before:h-full before:w-3 before:bg-cyan-500"; classic pageClass "bg-[#fffdf8] text-stone-950 ring-rose-200"; modern numberClass "rounded-full bg-violet-600 px-1.5 py-0.5 text-white".**
  - 근거: `src/components/exams/paper-builder/templates.ts:76-267`
- **정답지는 시험지 맨 뒤 '정답표' 별도 페이지로 완전 분리된다. 페이지 제목은 자간을 크게 벌린 '정 답 표'(tracking-[0.3em], font-black, 18px/compact 16px), 상단 슬림 헤더 우측에 '정답표' 또는 '정답표 1 / 2'.**
  - 근거: `src/components/exams/paper-builder/components/exam-answer-key-page.tsx:64-81`
  - 실제 문구: 정 답 표 / 정답표 1 / 2
- **정답표는 2모드다 — 가장 긴 정답이 20자를 넘으면 전체 폭 목록(list), 아니면 5열 그리드(grid). 그리드는 gridAutoFlow:'column' 으로 열 우선 채움, ANSWER_KEY_COLS=5. 각 셀은 'N.' 굵은 번호 + 정답 텍스트, border-b border-slate-200.**
  - 근거: `src/components/exams/paper-builder/answer-key-layout.ts:24-35, 102-124; src/components/exams/paper-builder/components/exam-answer-key-page.tsx:89-143`
- **해설지는 별도 파일이 아니라 '해설 포함' 모드에서 각 문항 바로 뒤에 인라인 블록으로 붙는다(정답표는 이때 제외). 블록 구성 순서는 고정: 정답 배지 → 해설 → 핵심 포인트 → 오답 분석.**
  - 근거: `src/components/exams/paper-builder/explanation-content.ts:9-13, 56-111; src/components/exams/paper-builder/components/exam-explanation-block.tsx:6-10`
  - 실제 문구: 정답 / 해설 / 핵심 포인트 / 오답 분석
- **정답 배지 스타일은 'rounded-sm border border-slate-400 bg-slate-50 px-2 py-1' 이고, 선지가 있는 문항은 라벨이 '정답', 없으면 '정답:' 이다. 핵심 포인트는 '•' 불릿(text-slate-400), 본문은 pl-2 text-justify text-slate-600.**
  - 근거: `src/components/exams/paper-builder/components/exam-explanation-block.tsx:29-73; src/app/api/exams/[examId]/export-docx/_lib/build-builder-document/answer.ts:31`
  - 실제 문구: 정답 / 정답:
- **미리보기·DOCX·HWPX 세 출력의 글꼴을 '맑은 고딕'으로 통일한다. 미리보기 style fontFamily 는 '"Malgun Gothic Exam", "Malgun Gothic", "맑은 고딕", sans-serif', DOCX 는 DEFAULT_FONT = "맑은 고딕".**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page.tsx:684-687; src/app/api/exams/[examId]/export-docx/_lib/styles.ts:11-15`
- **미리보기 px → DOCX pt 환산식이 코드 주석에 명시돼 있다: pt = px × (210/760) / (25.4/72) = px × 0.78325, half-pt = px × 1.5665. 제목 SIZE_TITLE=44(22pt), 본문 SIZE_BODY=18(9pt), 번호 SIZE_QNUM=20(10pt), 메타 SIZE_META=14(7pt). 행간도 BODY_LINE_HEIGHT=1.58 / COMPACT=1.46 으로 미리보기와 1:1.**
  - 근거: `src/app/api/exams/[examId]/export-docx/_lib/build-builder-document/sizes.ts:57-85`
- **인쇄(PDF)는 @page size:{widthMm}mm {heightMm}mm; margin:0 으로 잡고, 760px 모델 박스를 물리 용지에 균일 배율(printScale = widthMm × 96/25.4 / modelWidth)로 transform:scale 확대한다 — 그래서 '미리보기 그대로' 배지가 정당화된다.**
  - 근거: `src/components/exams/paper-builder/components/print-styles.tsx:13-16, 20-23, 129-134`
- **시험지 만들기 화면의 단계는 모바일 기준 정확히 2스텝이다: 1 '문제 선택' → 2 '미리보기 · 저장'. MobileStepHeader 로 번호 원(size-[26px]) + 연결선(h-0.5, 진행 bg-blue-500 / 미진행 bg-slate-200), 완료는 체크 아이콘.**
  - 근거: `src/components/exams/exam-paper-builder-client.tsx:2389-2396; src/components/workbench/mobile-step-flow.tsx:59-116`
  - 실제 문구: 문제 선택 / 미리보기 · 저장
- **데스크톱은 스텝이 아니라 3분할 그리드 동시 편집이다: 좌측 [문제관리(QuestionLibraryPanel)] | 중앙 [PreviewToolbar + 용지 미리보기] | 우측 [템플릿 설정]. 좌우 패널은 드래그로 폭 조절·클릭으로 접기 가능하며 접힌 핸들에 세로쓰기(writingMode: vertical-rl) '문제관리' 라벨이 뜬다.**
  - 근거: `src/components/exams/exam-paper-builder-client.tsx:2402-2495`
  - 실제 문구: 문제관리 / 드래그하여 폭 조절 · 클릭하여 닫기
- **모바일 1단계 하단에는 장바구니 바가 고정된다 — 파란 뱃지 카운트가 달린 ShoppingBasket 아이콘 + '담긴 문제 N개' + 부제. 다음 버튼 자구는 '다음으로 (미리보기 · 저장)' (h-12, bg-blue-600, font-extrabold, CirclePlay 아이콘).**
  - 근거: `src/components/exams/exam-paper-builder-client.tsx:2807-2848`
  - 실제 문구: 담긴 문제 3개 / 탭하여 담긴 문제 보기·빼기 / 문제를 눌러 시험지에 담아보세요 / 다음으로 (미리보기 · 저장)
- **미리보기 툴바 좌측은 'A4 미리보기' 텍스트(Eye 아이콘 + text-[12px] font-bold text-slate-600), 우측은 [저장 필요 배지] [되돌리기][앞으로 돌리기] [저장] [인쇄] [다운로드▾] [전체 비우기(빨간 휴지통)]. 툴바 높이 h-11, border-b border-slate-200 bg-white.**
  - 근거: `src/components/exams/exam-paper-builder-client-parts/preview-toolbar.tsx:206-311`
  - 실제 문구: A4 미리보기 / 저장 필요 / 되돌리기 / 앞으로 돌리기 / 인쇄 / 다운로드
- **툴바에 '태블릿 시험 배포' 버튼이 있다(MonitorSmartphone 아이콘, border-[#3182F6]/45 text-[#3182F6] 토스 블루 테두리형). 국어 시험지는 비활성이며 사유 툴팁 자구가 '국어 시험지는 곧 지원됩니다'.**
  - 근거: `src/components/exams/exam-paper-builder-client-parts/preview-toolbar.tsx:219-231; src/components/exams/exam-paper-builder-client.tsx:2523-2526`
  - 실제 문구: 태블릿 시험 배포 / 국어 시험지는 곧 지원됩니다
- **템플릿 설정 패널의 섹션 라벨 자구(모두 text-[11px] font-bold uppercase tracking-wider text-slate-500): 용지 크기 / 단 구성 / 밀도 / 배점 설정 / 지문 스타일 / 디자인 템플릿 / 학원 로고 / 표시 옵션 / 저장된 설정. 패널 타이틀은 '템플릿 설정'.**
  - 근거: `src/components/exams/paper-builder/components/template-settings-panel.tsx:277, 300, 326, 374, 398, 444, 508, 580, 705`
  - 실제 문구: 템플릿 설정 / 용지 크기 / 단 구성 / 밀도 / 배점 설정 / 지문 스타일 / 디자인 템플릿 / 학원 로고 / 표시 옵션 / 저장된 설정
- **'단 구성'은 4버튼 2×2 그리드다: 1단 / 2단 / 쪽당 1문제 / 쪽당 2문제. 뒤 2개는 forceTwoPerPage 를 켜서 한 칸당 문항 1개씩 강제 배치한다(툴팁 '쪽당 N문제씩 강제 배치'). 선택 상태는 'border-blue-300 bg-blue-50 text-blue-700', 비선택은 'border-slate-200 text-slate-500'.**
  - 근거: `src/components/exams/paper-builder/components/template-settings-panel.tsx:326-368`
  - 실제 문구: 1단 / 2단 / 쪽당 1문제 / 쪽당 2문제
- **배점 설정 블록: '현재 총점' 라벨 + '{총점}점 · {문항수}문항' 값, 숫자 입력 + [자동] [수동] 버튼. 안내 문구는 자동 미사용 시 '총점을 입력하면 문항 수가 바뀔 때마다 배점을 다시 나눕니다.', 사용 중이면 '자동 배점 사용 중 · 목표 총점 100점'.**
  - 근거: `src/components/exams/paper-builder/components/template-settings-panel.tsx:398-437`
  - 실제 문구: 현재 총점 / 100점 · 20문항 / 자동 / 수동 / 총점을 입력하면 문항 수가 바뀔 때마다 배점을 다시 나눕니다. / 자동 배점 사용 중 · 목표 총점 100점
- **밀도는 '표준'(comfortable) / '압축'(compact) 2택. 표시 옵션은 토글 2개 '지문 제목' / '문항 메타'(ToggleSwitch 컴포넌트).**
  - 근거: `src/components/exams/paper-builder/components/template-settings-panel.tsx:376-388, 582-585`
  - 실제 문구: 표준 / 압축 / 지문 제목 / 문항 메타
- **표지 페이지 기능이 있다. 토글 '표지 페이지', 표지 템플릿 3종 라벨 '클래식 / 밴드 / 미니멀', 표지 옵션 '학원 로고 표시' / '학교·반·시험일 표시', 안내 문구 '제목·부제·라벨은 미리보기의 표지에서 직접 클릭해 수정해요.'. 표지 정보 박스는 학교/반/이름/시험일 4행(w-[260px], text-[11px]).**
  - 근거: `src/components/exams/paper-builder/types.ts:124-128; src/components/exams/paper-builder/components/template-settings-panel.tsx:645-670, 700; src/components/exams/paper-builder/components/exam-cover-page.tsx:35-40`
  - 실제 문구: 표지 페이지 / 클래식 / 밴드 / 미니멀 / 학원 로고 표시 / 학교·반·시험일 표시 / 제목·부제·라벨은 미리보기의 표지에서 직접 클릭해 수정해요.
- **시험지 전체 비우기 버튼의 네이티브 확인 다이얼로그 자구: 제목 '정말로 삭제하시겠습니까?', 본문 '이 시험지의 모든 문항·블록이 삭제되고 처음부터 다시 시작합니다. 이 작업은 되돌릴 수 없습니다.'**
  - 근거: `src/components/exams/exam-paper-builder-client-parts/preview-toolbar.tsx:380-384`
  - 실제 문구: 정말로 삭제하시겠습니까? / 이 시험지의 모든 문항·블록이 삭제되고 처음부터 다시 시작합니다. 이 작업은 되돌릴 수 없습니다.
- **화면 상단 워크플로 타이틀 자구: 신규는 '시험지 생성' + 설명 '문제 은행에서 문제를 고르고 용지 미리보기에서 편집해 시험지를 저장합니다.', 편집 시엔 '시험지 수정' + '저장된 시험지를 불러와 용지 구성과 문항 배치를 다시 편집합니다.'**
  - 근거: `src/components/exams/exam-paper-builder-client.tsx:2359-2368`
  - 실제 문구: 시험지 생성 / 문제 은행에서 문제를 고르고 용지 미리보기에서 편집해 시험지를 저장합니다. / 시험지 수정 / 저장된 시험지를 불러와 용지 구성과 문항 배치를 다시 편집합니다.
- **좌측 네비게이션에서 '시험지 생성'은 파이프라인 4단계 중 2번째다: 문제 생성 → 시험지 생성 → 학습지 생성 → 자료 추출. 각 항목은 하위 메뉴로 '생성'과 '관리'를 갖는다(예: 시험지 생성 / 시험지 관리).**
  - 근거: `src/components/layout/nav-config.ts:100-140`
  - 실제 문구: 문제 생성 / 시험지 생성 / 학습지 생성 / 자료 추출 / 시험지 관리
- **시험지 상세(관리) 화면에서는 별도의 DOCX 전용 드롭다운이 있고 라벨 자구가 다르다: 버튼 '시험지 다운로드', 항목 '시험지 (문제만)' / '시험지 + 정답 해설'. 버튼은 variant="outline", 옆 채점 버튼은 bg-[#3182F6] hover:bg-[#1B64DA].**
  - 근거: `src/components/exams/exam-detail-client-parts/header-section.tsx:107-144`
  - 실제 문구: 시험지 다운로드 / 시험지 (문제만) / 시험지 + 정답 해설
- **다운로드 실행 시 미저장/변경 상태면 자동으로 먼저 저장한다 — `const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;` 후 다운로드 링크를 발사하고, 그 다음에 편집 라우트로 이동한다(다운로드 끊김 방지 순서).**
  - 근거: `src/components/exams/exam-paper-builder-client.tsx:2206-2224`
- **해설 포함 PDF는 인라인 해설을 켜고 재페이지네이션 → requestAnimationFrame → 120ms 지연 후 window.print() 를 호출하고, afterprint 이벤트에서 해설 모드를 해제한다. 모든 페이지를 forceMountAll 로 강제 마운트해 미스크롤 페이지가 빈 채 인쇄되는 것을 막는다.**
  - 근거: `src/components/exams/exam-paper-builder-client.tsx:2174-2190; src/components/exams/exam-paper-builder-client-parts/preview-pages.tsx:108-118`
- **미리보기는 페이지 가상화된다 — IntersectionObserver rootMargin '1200px 0px' 로 화면 근처 페이지만 A4PaperPage 를 마운트하고, 초기 2페이지는 eager, 한 번 마운트된 페이지는 언마운트하지 않는다(수백~1000+ 페이지 대응).**
  - 근거: `src/components/exams/exam-paper-builder-client-parts/preview-pages.tsx:92-148`
- **문항 유형 라벨(메타 배지에 노출되는 자구)은 SUBTYPE_LABELS 로 정의: 빈칸 추론 / 어법 판단 / 네모 어법 / 어휘 적절성 / 글의 순서 / 문장 삽입 / 주제 추론 / 요지·주장 / 제목 추론 / 함축 의미 추론 / 지칭 추론 / 내용 일치 / 요약문 완성(객관식) / 무관한 문장 등 28종.**
  - 근거: `src/components/exams/paper-builder/constants.ts:12-41`
  - 실제 문구: 빈칸 추론 / 어법 판단 / 네모 어법 / 어휘 적절성 / 글의 순서 / 문장 삽입 / 주제 추론 / 요지/주장 / 제목 추론 / 내용 일치
- **난이도 배지는 3단계: 기본(bg-blue-50 text-blue-700 border-blue-200) / 중급(bg-amber-50 text-amber-700 border-amber-200) / 킬러(bg-red-50 text-red-700 border-red-200).**
  - 근거: `src/components/exams/paper-builder/constants.ts:43-47`
  - 실제 문구: 기본 / 중급 / 킬러
- **[추론] 지문 스타일은 타입상 boxed/plain/underlined 3종을 지원하지만, 현재 설정 패널 UI에는 ['plain','본문'] 단 하나만 렌더된다 — 즉 사용자가 고를 수 있는 지문 스타일은 사실상 '본문' 하나뿐이다.**
  - 근거: `src/components/exams/paper-builder/components/template-settings-panel.tsx:444-461; src/components/exams/paper-builder/types.ts:94`
  - 실제 문구: 본문
- **HWPX 내보내기 전용 페이지네이션 보정 파라미터가 존재한다 — firstPageHeaderPx(한컴 실제 헤더 렌더 높이 오버라이드)와 contentSafetyPx(한컴 렌더가 추정보다 클 때 페이지 용량 안전 여백). 즉 한컴 조판 정합을 위한 별도 튜닝 레이어가 있다.**
  - 근거: `src/components/exams/paper-builder/types.ts:281-291`

### 덱 재현 대상 (visualSpec)

#### 다운로드 드롭다운 메뉴 (6포맷 × 아이콘 × 배지)

- 왜: SMOAT의 '한 번 만들면 3포맷으로 나간다'는 핵심 밸류를 한 컷으로 보여주는 UI. 아이콘 색·배지가 명확해 슬라이드에서 재현 시 임팩트가 크다.
- 소스: `src/components/exams/exam-paper-builder-client-parts/preview-toolbar.tsx:300-374`
- 시각 스펙:

```
[트리거 버튼] h-8, rounded-md, border border-slate-200, bg-white, px-2.5(lg:px-3), min-w-[98px], text-[11px] font-semibold text-slate-600, hover:bg-slate-50. 내부: Download 아이콘(h-3.5 w-3.5) + '다운로드' + ChevronDown(h-3 w-3, text-slate-400), gap-1.5.
[메뉴 패널] 트리거 우측 정렬, top: calc(100% + 6px), z-30, w-52(208px), rounded-lg, border border-slate-200, bg-white, py-1, shadow-xl shadow-slate-200/70, overflow-hidden.
[항목] 각 h-9, w-full, flex items-center gap-2, px-3, text-left, text-[12px] font-semibold text-slate-700, hover:bg-slate-50.
항목 순서와 텍스트(그대로): 1)'PDF' 2)'PDF 해설' — 구분선(my-1 h-px bg-slate-100) — 3)'DOCX' 4)'DOCX 해설' 5)'HWPX' 6)'HWPX 해설'.
[배지] 'PDF' 행 우측(ml-auto): rounded-sm bg-rose-50 px-1 py-px text-[9px] font-bold leading-none text-rose-600, 텍스트 '미리보기 그대로'. 'HWPX' 행: bg-indigo-50 text-indigo-600 uppercase 'beta'. 'HWPX 해설' 행: bg-violet-50 text-violet-600 uppercase 'beta'. 'PDF 해설'/'DOCX'/'DOCX 해설'은 배지 없음.
[아이콘] 22×22 SVG viewBox 0 0 24 24. 페이지 path 'M6 2.5 H13.5 L18 7 V19.5 A2 2 0 0 1 16 21.5 H6 A2 2 0 0 1 4 19.5 V4.5 A2 2 0 0 1 6 2.5 Z' fill=white stroke=키컬러 strokeWidth=1.4, 접힘 path 'M13.5 2.5 V7 H18'. 하단 라벨 밴드 rect x=4 y=12.6 w=14 h=6.6 rx=1.2 fill=키컬러, 그 위 흰 텍스트 x=11 y=17.4 textAnchor=middle fontSize=4.5 fontWeight=800 letterSpacing=0.2 로 'PDF'/'DOCX'/'HWPX'.
키컬러: PDF #DC2626, DOCX #2563EB, HWPX #0EA5E9.
[해설 버전 stacked] 뒤에 opacity 0.5 페이지 1장을 transform translate(3.5, -2.2)로, 앞 페이지는 translate(-1.5, 1.6)로 겹쳐 두 장처럼 보이게. 뒤 페이지는 라벨 밴드 없음.
[모션] 트리거 클릭 → 메뉴 fade+slide-down 8px, 150ms ease-out. 항목 hover 시 bg-slate-50 transition-colors 120ms. 데모 모션 제안: 항목을 위→아래로 80ms 간격 stagger 등장, 마지막에 'PDF' 배지 '미리보기 그대로'가 scale 1.15→1 로 팝.
```

#### A4 시험지 미리보기 페이지 (헤더 + 2단 조판 + 푸터)

- 왜: '실물 시험지가 그대로 나온다'는 제품 본질. 슬라이드에서 축소된 A4 카드로 재현하면 데모 없이도 설득된다.
- 소스: `src/components/exams/paper-builder/components/a4-paper-page.tsx:673-1575, a4-paper-page-parts/page-header.tsx:49-181`
- 시각 스펙:

```
[페이지 박스] aspect-ratio: 210 / 297, w-full, position relative, bg-white, text-slate-950, ring-1 ring-slate-200, shadow-xl, overflow-hidden. fontFamily: '"Malgun Gothic Exam", "Malgun Gothic", "맑은 고딕", sans-serif'. (B4 재현 시 aspect-ratio 257 / 364)
[내부 래퍼] flex flex-col h-full, padding px-[34px] py-[28px] (compact는 px-[28px] py-[24px]).
[1페이지 헤더] <header class="shrink-0 mb-5">
 상단행: flex items-start justify-between gap-4, border-b border-slate-900, pb-3.
  좌: flex gap-3. (선택)로고 h-12 w-12 rounded-lg border border-slate-200 bg-white, 이미지 object-contain p-1. 그 옆 세로: 부제 <p> text-[9px] font-bold tracking-[0.18em] text-blue-700 → 텍스트 '영어 내신 대비'; 제목 <h2> mt-1 text-[28px] font-black tracking-tight text-slate-950 break-keep → 예시 '2학기 중간고사 대비 모의고사'.
  우: 정보 컬럼 w-[168px] space-y-1 text-[10px] text-slate-700. 3행, 각 행 flex justify-between border-b border-slate-300 pb-1. 행 내용 순서대로 라벨/값: '학교'/'한빛고등학교', '반'/'고2-A', '이름'/(공백, span min-w-[64px]). 값은 font-semibold.
 하단행: mt-2 flex items-center justify-between gap-3 text-[10px] text-slate-600. 좌측 안내문(truncate) '다음 물음에 알맞은 답을 고르거나 조건에 맞게 서술하시오.', 우측 시험일 '2026-07-24'.
[본문] <main class="grid min-h-0 flex-1 grid-cols-2 gap-8 text-[11.5px] leading-[1.58]"> (1단이면 grid-cols-1). 각 칸은 space-y-4.
 [문항 블록] 헤더 <p class="mb-1 font-semibold text-slate-950 text-justify">: 번호 span 'mr-1.5 font-black text-[13px]' → '1.'; 메타 span 'mr-1.5 text-[9px] font-semibold text-slate-500' → '[3점 · 빈칸 추론]'; 이어서 발문 텍스트.
 [지문 박스] div 'mb-3 py-1' (+boxed면 rounded-md border border-slate-900/80 px-3). 지문 제목은 'mb-1 text-[10px] font-black uppercase tracking-wide text-slate-700'. 본문 <p class="whitespace-pre-line text-justify">.
 [선지] 컨테이너 'mt-1.5 space-y-1 text-[11px]'. 각 행 'flex items-start gap-1.5', 번호 span 'min-w-[18px] font-bold text-slate-800' 에 원형숫자 ① ② ③ ④ ⑤.
 [서술형 답란] 'mt-2 space-y-2' 안에 'h-[12px] border-b border-slate-300' 빈 줄 반복.
 [분할 힌트] 'continuation-hint mb-1 text-[9px] font-semibold italic text-slate-500' → '(지문 계속)' 또는 '(1번 계속)'.
[푸터] <footer class="mt-3 shrink-0 text-center text-[10px] text-slate-400"> 내용 '- 1 / 4 -'.
[2페이지 이후 헤더] 'mb-3 flex shrink-0 items-center justify-between border-b border-slate-200 pb-2 text-[10px] text-slate-400', 좌: 시험 제목, 우: '2 / 4'.
[모션 제안] 페이지 카드가 아래에서 12px 올라오며 fade-in(400ms cubic-bezier(0.22,1,0.36,1)) → 헤더 밑줄이 좌→우로 scaleX 0→1(300ms) → 좌측 칸 문항 1,2가 60ms stagger 로 등장 → 우측 칸 문항 3,4 등장 → 마지막에 푸터 '- 1 / 4 -' fade-in.
```

#### 정 답 표 페이지 (5열 그리드)

- 왜: 정답지가 별도 페이지로 자동 생성/분리된다는 사실을 한 장으로 증명. '해설지 분리' 슬라이드의 핵심 비주얼.
- 소스: `src/components/exams/paper-builder/components/exam-answer-key-page.tsx:44-113`
- 시각 스펙:

```
[페이지 박스] A4PaperPage 와 동일: aspect-ratio 210 / 297, bg-white ring-1 ring-slate-200 shadow-xl overflow-hidden, fontFamily 맑은 고딕. data-exam-answer-key="true".
[내부] px-[34px] py-[28px], flex flex-col h-full.
[슬림 헤더] 'mb-3 flex shrink-0 items-center justify-between border-b border-slate-200 pb-2 text-[10px] text-slate-400'. 좌: 시험 제목, 우: '정답표' (여러 장이면 '정답표 1 / 2').
[대제목] <h2 class="mb-3 shrink-0 text-center font-black tracking-[0.3em] text-[18px]"> 텍스트는 공백 포함 그대로 '정 답 표'.
[본문 그리드] display:grid, gridAutoFlow:'column'(열 우선 채움), gridTemplateColumns: repeat(5, minmax(0,1fr)), gridTemplateRows: repeat(rowsPerPage, minmax(0,auto)), gap-x-4. 폰트 text-[11.5px] leading-[1.45].
[셀] 'flex items-baseline gap-1.5 border-b border-slate-200 py-1'. 번호 span 'shrink-0 font-black text-slate-950' → '1.', 정답 span 'font-bold text-slate-900 truncate' → '③'.
[list 모드] 정답이 20자 넘으면 그리드 대신 'space-y-1' 전체 폭 목록, 셀에 whitespace-pre-wrap + break-words.
[재현 데이터 예시] 1.③ 2.⑤ 3.② 4.① 5.④ … 25번까지 5열×5행.
[모션 제안] 시험지 페이지 뒤에서 정답표 페이지가 슬라이드-업으로 겹쳐 올라오고, '정 답 표' 글자의 letter-spacing 이 0 → 0.3em 으로 벌어지는 400ms 애니메이션. 이어서 셀들이 열 단위로 좌→우 stagger fade-in.
```

#### 인라인 정답·해설 블록 (해설 포함 모드)

- 왜: '해설 포함' 6번째 산출물의 실체. 문항 바로 밑에 붙는 4단 구조(정답→해설→핵심 포인트→오답 분석)가 그대로 보이면 설득력이 높다.
- 소스: `src/components/exams/paper-builder/components/exam-explanation-block.tsx:21-76, paper-builder/explanation-content.ts:56-111`
- 시각 스펙:

```
[컨테이너] 'mt-2 break-inside-avoid text-[10px] leading-[1.5]' (compact는 text-[9.5px]).
[1행 정답 배지] div 'rounded-sm border border-slate-400 bg-slate-50 px-2 py-1'. 안에 라벨 span 'font-bold text-slate-700' 텍스트 '정답'(선지 있는 문항) 또는 '정답:'(선지 없는 문항), 공백 2칸 뒤 값 span 'font-bold text-slate-900' → 예 '③'.
[2행 라벨] <p class="mt-1.5 font-bold text-slate-700"> 텍스트 '해설'.
[해설 본문] <p class="mt-0.5 whitespace-pre-line pl-2 text-justify text-slate-600"> — 줄 단위로 여러 <p>.
[3행 라벨] '핵심 포인트' (동일 스타일).
[불릿] <p class="mt-0.5 flex gap-1 pl-2 text-slate-600">, 불릿 span 'shrink-0 text-slate-400' 문자 '•', 본문 span 'min-w-0 flex-1'.
[4행 라벨] '오답 분석'.
[오답 행] <p class="mt-0.5 pl-2 text-slate-500">, 라벨 span 'font-bold text-slate-700' (예 '①' 또는 '②') + 공백 + 설명 텍스트.
[모션 제안] 문항 아래에서 블록 높이가 0 → auto 로 열리며(300ms ease-out) 정답 배지가 먼저 나타나고, 해설/핵심 포인트/오답 분석이 100ms 간격 stagger 로 순차 fade-in. 슬라이드에선 '해설 포함' 토글을 클릭하는 모션과 연동.
```

#### 시험지 생성 3분할 워크스페이스 + 2스텝 플로우

- 왜: '문항 선택 → 배치 → 미리보기 → 다운로드' 흐름을 실제 화면 구조로 보여주는 슬라이드. PC는 3분할 동시편집, 모바일은 2스텝이라는 대비가 좋은 스토리.
- 소스: `src/components/exams/exam-paper-builder-client.tsx:2389-2530, src/components/workbench/mobile-step-flow.tsx:38-119`
- 시각 스펙:

```
[PC 3분할] 부모 div: 'grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white' + lg에서 CSS 변수 --exam-builder-grid-columns 로 컬럼 폭 지정. 배치 좌→우: ① 문제관리 패널(QuestionLibraryPanel) ② 세로 리사이즈 핸들 ③ 미리보기 섹션(bg-slate-100/70, 편집 중이면 bg-slate-200/80) ④ 리사이즈 핸들 ⑤ 템플릿 설정 패널.
[리사이즈 핸들] 'mx-1 h-full w-4 rounded-md py-1 text-[11px] font-semibold text-sky-400 hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 cursor-col-resize', 세로쓰기(writingMode: vertical-rl) 라벨 '문제관리', 위에 '<' 또는 '>' 문자, 아래 GripVertical 아이콘(h-3 w-3 opacity-40). title 툴팁 '드래그하여 폭 조절 · 클릭하여 닫기'.
[문항 드래그 드롭존] 미리보기 위 오버레이: 'absolute inset-4 z-10 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-500/5 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.12)]', 상단 중앙 배지 'rounded-full border border-blue-200 bg-white/95 px-3 py-1 text-[11px] font-black text-blue-700 shadow-sm' 텍스트 '문제 추가' 또는 '문제 3개 추가'. 드래그 중엔 화면 중앙 십자 가이드라인(border-dashed border-blue-300/70) 표시.
[드롭 인디케이터] 'absolute left-0 right-0 z-30 h-1 rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.16)]'.
[모바일 2스텝 스테퍼] nav 'rounded-lg border border-slate-200 bg-white px-2 py-2.5 shadow-sm'. ol 'flex items-start justify-center pb-6'. 원: 'size-[26px] rounded-full border text-[12px] font-bold' — 활성 'border-blue-600 bg-blue-600 text-white shadow-sm', 완료 'border-blue-200 bg-blue-50 text-blue-600'(체크 아이콘 size-3.5), 미도달 'border-slate-200 bg-white text-slate-400'. 연결선: 'mx-2 h-[26px] w-12 sm:w-16' 안에 'h-0.5 w-full rounded-full' — 진행분 bg-blue-500, 미진행 bg-slate-200. 라벨은 원 아래 absolute, 'mt-1 text-[10.5px] font-semibold' — 활성 text-blue-700, 완료 text-slate-600, 미도달 text-slate-400. 스텝 텍스트는 정확히 '문제 선택', '미리보기 · 저장'.
[모바일 CTA] 'h-12 w-full rounded-lg border border-blue-600 bg-blue-600 text-[14px] font-extrabold text-white shadow-sm' + CirclePlay 아이콘(size-5), 텍스트 '다음으로 (미리보기 · 저장)'. 비활성 시 'border-blue-200 bg-blue-300 cursor-not-allowed'.
[모션 제안] 좌측 문항 카드 하나가 중앙 미리보기로 드래그되어 날아가고, 드롭 순간 파란 인디케이터 라인이 번쩍이며 시험지에 문항이 삽입되어 아래 내용이 밀려나는 시퀀스.
```

#### 템플릿 설정 패널 (용지/단/밀도/배점/템플릿 8종)

- 왜: 조판 제어의 폭(2단 조판, 쪽당 N문제, 자동 배점, 8종 템플릿)을 한 장에 담을 수 있는 최적 자산.
- 소스: `src/components/exams/paper-builder/components/template-settings-panel.tsx:277-700`
- 시각 스펙:

```
[패널 타이틀] 'block text-[13px] font-black text-slate-800' → '템플릿 설정'.
[섹션 라벨 공통] 'mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500'.
[선택 버튼 공통] 'rounded-md border text-[12px] font-bold', 높이 h-9(사이드바 h-8). 선택 상태 'border-blue-300 bg-blue-50 text-blue-700', 비선택 'border-slate-200 text-slate-500'.
① '용지 크기' — grid grid-cols-2 gap-1.5, 버튼에 FileText 아이콘(h-3.5 w-3.5) + 'A4' / 'B4'. title 툴팁 '210 x 297mm' / '257 x 364mm'.
② '단 구성' — grid grid-cols-2 gap-1.5, 4버튼: Columns2 아이콘 + '1단' / '2단' / '쪽당 1문제' / '쪽당 2문제'.
③ '밀도' — 2버튼 '표준' / '압축'.
④ '배점 설정' — 박스 'rounded-lg border border-slate-200 bg-slate-50/60 p-3'. 상단 flex justify-between: 좌 'text-[11px] font-bold text-slate-500' '현재 총점', 우 'text-[11px] font-black text-slate-800' '100점 · 20문항'. 그 아래 flex gap-1.5: number input 'h-8 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-black text-slate-700 focus:border-blue-300 focus:ring-2 focus:ring-blue-100', 버튼 '자동'('h-8 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-bold text-blue-700'), 버튼 '수동'('border-slate-200 bg-white text-slate-500'). 하단 안내 'mt-1.5 text-[10px] font-semibold leading-snug text-slate-400' → '총점을 입력하면 문항 수가 바뀔 때마다 배점을 다시 나눕니다.'
⑤ '지문 스타일' — 단일 버튼 '본문'.
⑥ '디자인 템플릿' — 접기/펴기 헤더(ChevronDown/Up, 'flex h-7 w-7 rounded-lg border border-slate-200 bg-white text-slate-400'), 펼치면 grid grid-cols-2 gap-2. 각 타일 'flex min-h-11 items-center rounded-lg border px-3 py-2 text-left'. 라벨 <p class="text-[12px] font-black"> 에 템플릿별 그라디언트 텍스트 적용: 클린 내신형 'from-blue-500 to-sky-400', 모의고사형 'from-slate-900 to-slate-500', 워크시트형 'from-emerald-500 to-teal-400', 미니멀 'from-zinc-500 to-stone-300', 학원 브랜드형 'from-indigo-700 to-cyan-500', 모던 컬러형 'from-violet-600 to-fuchsia-400', 클래식 원고형 'from-rose-800 to-amber-500', 컬러 밴드형 'from-cyan-500 to-lime-400' — 모두 'bg-gradient-to-r ... bg-clip-text text-transparent'. 선택 시 타일 배경은 각 accent(예 clean 'border-blue-300 bg-blue-50 text-blue-700') + shadow-sm.
⑦ '표시 옵션' — 토글 2개 '지문 제목', '문항 메타' (우측 ToggleSwitch).
⑧ '표지 페이지' 토글 박스 — 켜지면 'border-blue-300 bg-blue-50', 하위에 '클래식/밴드/미니멀' 3버튼 + '학원 로고 표시'/'학교·반·시험일 표시' 토글(우측 점 'h-2 w-2 rounded-full', on bg-blue-500 / off bg-slate-300) + 안내 'text-[10.5px] leading-relaxed text-slate-400' '제목·부제·라벨은 미리보기의 표지에서 직접 클릭해 수정해요.'
[모션 제안] '2단' 버튼을 클릭하면 옆 시험지 미리보기가 1단→2단으로 리플로우되는 연동 애니메이션(문항들이 우측 칸으로 흘러가는 300ms transition).
```


### 갭 / 미확인

- HWPX 실제 조판 XML(빌더 표/셀 구조, break-plan 알고리즘)은 _lib/render/*.ts 파일 목록만 확인했고 내부 렌더 규칙은 읽지 않았다 — 한컴 출력물의 정확한 표 구조/셀 여백은 미확인.
- PDF 산출물의 실제 파일명 규칙 미확인. PDF는 window.print() 이므로 파일명은 브라우저/OS가 정하며 코드에서 제어하지 않는 것으로 보이나 명시 코드를 찾지 못했다.
- '해설 포함 PDF'에서 정답표 페이지가 실제로 제외되는지는 exam-paper-builder-client.tsx:1533 주석('맨 뒤 정답표는 빼며(DOCX 해설과 동일)')으로만 확인했고, 실제 answerKey prop 분기 코드는 직접 읽지 않았다.
- 국어(KOREAN) 시험지의 조판 차이(ko-paper-adapter.ts, korean/sets/paper)는 파일 존재만 확인했고 내용 미탐색. 국어 전용 지문 박스/세트 조판 규칙은 미확인.
- DOCX 빌더의 2단 조판 구현 방식(docx 라이브러리 columns vs 표 기반)은 build-builder-document/assemble.ts 를 읽지 않아 미확인.
- /api/admin/exam-export 와 /admin/exam-print 경로(관리자 전용 즉석 출력)는 호출부만 확인했고 라우트 구현/출력물 형태 미확인.
- 시험지 관리(목록) 화면 exam-list-client.tsx / exam-file-card.tsx 에는 export 엔드포인트 직접 호출이 없어, 목록에서의 다운로드 진입 경로(있다면 무엇인지)는 미확인.
- 실제 스크린샷/렌더 결과를 본 것이 아니라 코드만 읽었으므로, 색·간격의 최종 시각 결과(특히 템플릿별 조합)는 실물 대조가 필요하다.


---

## [각도 C] SMOAT 브랜드/디자인 시스템 — Tailwind v4 CSS-first 토큰(설정 파일 없음), Pretendard 단일 서체 + body 20px 대형 UI 기준, 브랜드 프라이머리 blue #3B82F6/#2563EB + 다크 네이비 라디얼(#1B2A4A→#0B1220) 랜딩, 로고는 원형 PNG 락업 + SVG 파비콘 2종, 서비스명은 대외적으로 "SMOAT"(영문 전대문자)와 "스모트"(한글) 병기 / 소문자 smoat 은 오직 기술 식별자(도메인·스토리지키·CSS 클래스 프리픽스)에만 사용.

### 관측 사실

- **Tailwind v4 CSS-first 구성이다. tailwind.config.* 파일은 저장소에 존재하지 않고, PostCSS 플러그인 @tailwindcss/postcss 하나만 등록되어 있으며 모든 토큰이 globals.css 의 @theme inline 블록에 정의된다.**
  - 근거: `d:/Desktop/2026project/nara/postcss.config.mjs:1-7 (plugins: { "@tailwindcss/postcss": {} }) / d:/Desktop/2026project/nara/src/app/globals.css:1-12`
- **브랜드 컬러 토큰은 @theme inline 안 "SMOAT Professional Design System" 섹션에 --color-yshin-* 접두로 정의된다(내부 코드네임 yshin 이 그대로 잔존). blue #3B82F6 / blue-hover #2563EB / blue-subtle #EFF6FF / blue-light #BFDBFE / indigo #6366F1 / indigo-subtle #EEF2FF / emerald #10B981 / emerald-subtle #ECFDF5 / amber #F59E0B / amber-subtle #FFFBEB / red #EF4444 / red-subtle #FEF2F2 / purple #8B5CF6 / purple-subtle #F5F3FF.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:54-68`
- **중립 그레이 스케일도 @theme 에 직접 고정된다: gray-50 #F9FAFB, 100 #F3F4F6, 200 #E5E7EB, 300 #D1D5DB, 400 #9CA3AF, 500 #6B7280, 600 #4B5563, 700 #374151, 800 #1F2937, 900 #111827.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:69-78`
- **원장/어드민 화면용 ERP 팔레트가 별도 존재한다: --erp-primary #2563EB, hover #1D4ED8, light #DBEAFE, subtle #EFF6FF / secondary #475569 / success #059669 · warning #D97706 · error #DC2626 · info #0284C7 / bg #F8FAFC, surface #FFFFFF, border #E2E8F0, text #0F172A, text-secondary #64748B, text-muted #94A3B8.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:133-162`
- **학습(게이미피케이션) 전용 컬러가 따로 있다: --learn-primary #3B82F6, primary-dark #2563EB, accent #F59E0B, accent-warm #FB923C, streak #EF6C00, xp #7C3AED, xp-light #EDE9FE, success #10B981, wrong #EF4444, locked #CBD5E1, gold #FBBF24.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:164-175`
- **shadcn 라이트 테마 시맨틱 토큰: --background #FFFFFF, --foreground #111827, --card #FFFFFF, --primary #3B82F6, --primary-foreground #FFFFFF, --secondary #F3F4F6, --muted #F9FAFB, --muted-foreground #6B7280, --accent #EFF6FF, --destructive #EF4444, --border/--input #E5E7EB, --ring #3B82F6. 차트색 chart-1~5 = #3B82F6/#10B981/#F59E0B/#EF4444/#8B5CF6.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:212-244`
- **다크 테마는 '중성 차콜 그레이(네이비 톤 제거, IDE 다크 스타일)' 원칙이다: --background #1b1b1b, --card #232323, --foreground #e4e4e4, --border #333333, --sidebar #202020, --destructive #F87171, primary 는 라이트와 동일한 #3B82F6 유지.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:253-292`
- **다크 재매핑용 2차 토큰 세트가 별도로 있다: --d-bg #1b1b1b, --d-surface #232323, --d-surface-2 #282828, -3 #303030, -4 #3a3a3a, --d-border #333333, --d-text #e4e4e4 / -2 #c6c6c6 / -3 #9b9b9b / -4 #6f6f6f, --d-blue #60a5fa, --d-green #4ade80, --d-red #f87171, --d-amber #fbbf24, --d-purple #a78bfa, 서피스 --d-blue-surface #1b2735 등.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:1031-1058`
- **사이드바 글래스 토큰: --sidebar-glass rgba(255,255,255,0.55), --sidebar-solid #ffffff, --sidebar-edge rgba(0,0,0,0.06) (다크에선 셋 다 #202020/#333333 로 치환).**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:245-247, 286-288`
- **라운드 규칙: 기준값 --radius: 0.625rem(10px). @theme 에서 radius-sm = radius-4px, md = radius-2px, lg = radius, xl = +4px, 2xl = +8px, 3xl = +12px, 4xl = +16px 로 파생. 별도로 :root 에 --radius-sm 0.5rem / md 0.75rem / lg 1rem / xl 1.25rem / full 9999px 고정값도 존재(학습 화면용).**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:46-52, 127-131, 213`
- **그림자 규칙은 @utility 로 5종 표준화: shadow-card = 0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.06) / shadow-card-hover = 0 4px 6px -1px rgba(0,0,0,.07), 0 2px 4px -2px rgba(0,0,0,.05) / shadow-float = 0 10px 25px -5px rgba(0,0,0,.08), 0 8px 10px -6px rgba(0,0,0,.04) / shadow-nav = 0 -1px 0 rgba(0,0,0,.03), 0 -4px 16px rgba(0,0,0,.06) / shadow-sidebar = 1px 0 0 rgba(0,0,0,.05).**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:635-661`
- **그라디언트 유틸 4종: gradient-primary = linear-gradient(135deg,#3B82F6 0%,#2563EB 100%) / gradient-hero = linear-gradient(135deg,#EFF6FF 0%,#F5F3FF 50%,#ECFDF5 100%) / gradient-sidebar = linear-gradient(180deg,#FFFFFF,#F9FAFB) / gradient-card = linear-gradient(135deg,#FFFFFF,#F9FAFB).**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:618-632`
- **글래스 유틸: .glass = background rgba(255,255,255,0.72) + backdrop-filter blur(24px) saturate(180%); .glass-strong = rgba(255,255,255,0.92) + blur(32px) saturate(200%).**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:605-615`
- **폰트는 Pretendard 단일 서체. CDN(jsdelivr, orioncactus/pretendard v1.3.9 static)을 <head> 에서 직접 로드하고, --font-sans 스택은 "Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif. body 에도 같은 스택을 명시하고 antialiased 적용.**
  - 근거: `d:/Desktop/2026project/nara/src/app/layout.tsx:95-100 / d:/Desktop/2026project/nara/src/app/globals.css:15, 573-578`
- **next/font 는 Geist_Mono 하나만 쓴다(variable: --font-geist-mono, subsets latin). 본문 서체는 next/font 가 아니라 CDN Pretendard 이다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/layout.tsx:14-17, 106`
- **body 는 항상 클래스 `smoat-large-ui font-sans antialiased` 를 달고 시작하며, body.smoat-large-ui { font-size: 20px; --smoat-large-ui-line: 1.35 } 로 앱 전역 기준 폰트가 20px 다. 이 클래스가 text-[6px]~text-[24px] 및 text-xs~text-2xl 유틸을 한 단계씩 키우고, 버튼/인풋 높이(h-6~h-12)도 함께 키운다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/layout.tsx:106 / d:/Desktop/2026project/nara/src/app/globals.css:1495-1504, 1506-1660`
- **제목 자간 규칙: h1,h2,h3 { letter-spacing: -0.025em }.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:579-581`
- **시험지 인쇄/미리보기 영역만 별도 서체를 쓴다: @font-face "Malgun Gothic Exam"(400/700, /fonts/exam/MalgunGothic-Regular.woff2, MalgunGothic-Bold.woff2)를 임베드해 .exam-a4-page .font-serif 까지 맑은 고딕으로 강제한다(다운로드 DOCX/HWPX 와 줄바꿈 일치 목적).**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:327-351`
- **font/ 디렉토리(Griun_Cherry1Spoon-Rg.ttf, Griun_Gyuwon-Rg.ttf, Ok단단체) 와 public/fonts/webtoon/ 는 브랜드 폰트가 아니라 '지문 웹툰' 기능의 말풍선 서체 목록이다(그리운 체리 한스푼/그리운 규원체/Ok단단체).**
  - 근거: `d:/Desktop/2026project/nara/src/lib/webtoon-text/fonts.ts:33-35`
- **로고 컴포넌트는 src/components/brand/brand-mark.tsx 하나뿐이며(src/components/landing/brand/ 디렉토리는 없음), 소스는 항상 /smoat-logo.png (500x500). BrandMark 는 순수 이미지, BrandIcon 은 size-9 · rounded-2xl · overflow-hidden · bg-transparent · shadow-[0_16px_32px_-22px_rgba(15,23,42,0.8)] 래퍼 안에 이미지를 100%x100% object-cover 로 채운다. alt/title 기본값은 "SMOAT".**
  - 근거: `d:/Desktop/2026project/nara/src/components/brand/brand-mark.tsx:9, 11-22, 28-51`
  - 실제 문구: SMOAT
- **public/ 의 브랜드 자산 파일명: smoat-logo.png, favicon.png, favicon.svg, icon.svg, apple-icon.png, admin-favicon.png, og-image.png. smoat-logo.png / favicon.png / apple-icon.png / og-image.png 는 모두 19,830바이트로 동일 파일(같은 원본 500x500 PNG)이며 admin-favicon.png(17,759B)만 다르다.**
  - 근거: `d:/Desktop/2026project/nara/public (ls -la 결과: smoat-logo.png/favicon.png/apple-icon.png/og-image.png 각 19830 bytes, admin-favicon.png 17759 bytes)`
- **favicon.svg 와 icon.svg 는 바이트 동일한 SVG 로고다. viewBox 0 0 100 100, 배경 rect rx=24 fill #020617(slate-950), 그 위에 흰색(#fff) 도형: (a) 상단 방사형 5선(stroke-width 3.4, linecap round), (b) 5각 별 path M50 21L53.5 30L63.3 30.7L55.7 36.9L58.2 46.3L50 41L41.8 46.3L44.3 36.9L36.7 30.7L46.5 30Z, (c) 펼친 책 path M50 58C40 53 25 49 12 50L12 88C25 87 40 89 50 94C60 89 75 87 88 88L88 50C75 49 60 53 50 58Z. 전체 그룹은 translate(5 5) scale(0.9). role=img aria-label="SMOAT".**
  - 근거: `d:/Desktop/2026project/nara/public/icon.svg:1-13 / d:/Desktop/2026project/nara/public/favicon.svg:1-13`
- **파비콘/아이콘 메타는 layout.tsx metadata.icons 에서 /smoat-logo.png(500x500) → /favicon.png 순, shortcut /favicon.png, apple /apple-icon.png 로 선언된다. applicationName·appleWebApp.title·openGraph.siteName 은 모두 문자열 "SMOAT".**
  - 근거: `d:/Desktop/2026project/nara/src/app/layout.tsx:26, 36-46, 53`
- **랜딩 로고 락업 규격: BrandIcon 을 shrink-0 rounded-full(원형) + group-hover:bg-blue-600 로 쓰고, 워드마크는 text-[18px] font-black tracking-normal, 기본 text-slate-950(히어로 위 데스크톱에선 lg:text-white), hover 시 text-blue-600. 아이콘과 워드마크 간격 gap-2.5.**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/landing-header.tsx:64-74`
  - 실제 문구: SMOAT
- **디자인시스템 문서가 저장소 안에 카드 형태(HTML)로 존재한다: design-sync/foundations/{brand,colors,type}.html, design-sync/patterns/{color-rules,hint-glow,mobile-step-flow}.html, design-sync/components/{buttons,inputs,dialog,badges-chips,filter-pills,pagination,toggles}.html.**
  - 근거: `d:/Desktop/2026project/nara/design-sync/foundations/brand.html:1 (<!-- @dsCard group="Brand" -->) 및 design-sync 디렉토리 목록`
- **브랜드 카드가 규정한 로고 사용법 원문: 워드마크 18px/900/slate-950, hover blue-600, 아이콘은 rounded-full + 딥 섀도, 랜딩 nav 링크는 hover:bg-blue-50 hover:text-blue-700. 또한 '국어 과목 기능은 대외비 — 브랜드/마케팅 노출 금지' 라는 금지 조항이 명시돼 있다(세미나 덱에서 국어 언급 금지).**
  - 근거: `d:/Desktop/2026project/nara/design-sync/foundations/brand.html:20`
  - 실제 문구: 워드마크 = 18px 900 slate-950, hover 시 blue-600. 아이콘은 rounded-full + 딥 섀도. 랜딩 nav 링크는 hover:bg-blue-50 hover:text-blue-700. ※ 국어 과목 기능은 대외비 — 브랜드/마케팅 노출 금지.
- **컬러 팔레트 카드가 정의한 역할: '브랜드 프라이머리는 blue(#3B82F6, hover #2563EB). 시맨틱: emerald=성공/검수, amber=주의, red=오류/미검수, purple=XP·특수.'**
  - 근거: `d:/Desktop/2026project/nara/design-sync/foundations/colors.html:18`
  - 실제 문구: 브랜드 프라이머리는 blue(#3B82F6, hover #2563EB). 시맨틱: emerald=성공/검수, amber=주의, red=오류/미검수, purple=XP·특수.
- **타이포 카드가 규정한 스케일: heading 18px/900, section title 15px/800, dialog title 18px/600, body 14px/400(text-sm), ui dense 13px/500, admin 12px/500~600, caption 11px/500(gray-500), micro chip 10px/600, 숫자는 항상 tabular-nums. 폴백 순서 Apple SD Gothic Neo → Noto Sans KR → Malgun Gothic.**
  - 근거: `d:/Desktop/2026project/nara/design-sync/foundations/type.html:13-14, 16-24`
  - 실제 문구: 전 화면 단일 서체 Pretendard(CDN v1.3.9). 폴백: Apple SD Gothic Neo → Noto Sans KR → Malgun Gothic. 시험지 인쇄 영역만 별도 폰트 사용.
- **버튼 색 규약(컨텍스트 시맨틱)이 문서화돼 있다: 파랑=학습자료·생성·주요 액션(blue-600 #2563EB → hover #1D4ED8, 비활성 slate-200 #E2E8F0), 초록(emerald)=검수 계열이며 '검수취소'도 초록(rose/빨강 배경 금지), 빨강은 '미검수' 상태 표시 전용, 선택/활성은 slate-800/900 솔리드, 크레딧 소모 버튼엔 CreditCostChip 병기.**
  - 근거: `d:/Desktop/2026project/nara/design-sync/patterns/color-rules.html:16, 48-54`
  - 실제 문구: 색은 기능을 말한다 — 파랑=학습자료·생성·주요 액션, 초록=검수(취소 포함), 빨강=미검수 상태, 슬레이트=선택/활성. 검수취소에 rose 사용 금지.
- **shadcn Button 기본 규격: rounded-md(8px), 높이 h-9(36px), text-sm 500, focus ring 파랑 3px/50%. 사이즈 lg 40 / default 36 / sm 32 / xs 24 / icon 36x36. variant 색: default #3B82F6, destructive #EF4444, outline 흰 배경+#E5E7EB 테두리(hover #EFF6FF), secondary #F3F4F6, ghost 투명(hover #EFF6FF), link #3B82F6.**
  - 근거: `d:/Desktop/2026project/nara/design-sync/components/buttons.html:13-22, 25, 38`
- **랜딩 CTA 버튼은 앱 버튼과 규격이 다르다: rounded-full, 배경 #020617(slate-950), 글자 13px/900, shadow 0 16px 40px -24px rgba(15,23,42,.8), hover 시 배경 #2563EB + translateY(-2px).**
  - 근거: `d:/Desktop/2026project/nara/design-sync/components/buttons.html:49-54`
  - 실제 문구: 무료로 시작하기
- **랜딩 씬 공용 디자인 랭귀지가 상수로 노출돼 있다: SCENE_NAVY_BG = bg-[radial-gradient(120%_80%_at_50%_-8%,#1B2A4A_0%,#111C34_45%,#0B1220_100%)], GRID_DARK = 34px 격자 rgba(148,180,255,0.06), GRID_INK = 34px 격자 rgba(15,23,42,0.045), SceneGlow = radial rgba(59,130,246,0.38) blur-[20px] 원형 블롭, SceneKicker = 12~14px font-extrabold uppercase tracking-[0.14em] text-blue-600(다크 text-blue-300), SceneGhost = 92px→lg 190px font-black text-transparent [-webkit-text-stroke:2px_#BFDBFE], Accent = text-blue-600.**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/shared/scene-ui.tsx:11-74`
- **ERP(원장/강사) 셸 사이드바 로고 락업: BrandIcon(size-8, mark size-[20px]; 접힘 시 size-9/size-[21px]) + 워드마크 text-[20px] font-bold tracking-tight text-gray-900 + 그 옆 소문자 'erp' 라벨(text-[10px] text-gray-300 font-medium tracking-widest uppercase). 로고 영역 높이 64px, 펼침 시 px-6.**
  - 근거: `d:/Desktop/2026project/nara/src/components/layout/admin-shell.tsx:441-466`
  - 실제 문구: SMOAT
- **ERP 사이드바 표면은 유리 재질이다: backdropFilter blur(40px) saturate(180%), borderRight 1px solid var(--sidebar-edge). 기본 폭 220px, 접힘 72px, 최소 180 / 최대 300px, localStorage 키는 여전히 'yshin-sidebar-collapsed'.**
  - 근거: `d:/Desktop/2026project/nara/src/components/layout/admin-shell.tsx:435-437, 53-58`
- **구(舊) /admin 사이드바만 토스 계열 팔레트를 쓴다: 테두리 #F2F4F6, 로고칩 bg-[#3182F6], 텍스트 #191F28, 활성 nav bg-[#E8F3FF] text-[#3182F6], 비활성 #6B7684, hover bg-[#F7F8FA]. 메인 SMOAT 팔레트(#3B82F6/#2563EB)와 다른 계열이므로 덱에서 혼용 금지.**
  - 근거: `d:/Desktop/2026project/nara/src/components/layout/admin-sidebar.tsx:47-84`
- **전역 스크롤바가 브랜드화돼 있다: 폭 6px, thumb = linear-gradient(180deg,#93C5FD,#60A5FA 50%,#93C5FD) + border-radius 999px + 1px solid rgba(255,255,255,.5), hover 시 #60A5FA→#3B82F6, active #3B82F6. Firefox 는 scrollbar-color #93C5FD transparent. 사이드바 전용(.sidebar-scroll)은 폭 4px, 평소 투명 → 스크롤 중(.is-scrolling)만 #BFDBFE.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:908-970`
- **브랜드 모션 라이브러리(키프레임)가 globals.css 에 집중돼 있다: smoat-hint-glow(1.5s, 파란 링 2회 반짝 + bg rgba(191,219,254,.7)), topup-cta-glow(2.8s 무한 숨쉬기 글로우), feedback-cta-pulse(2.8s 링 펄스), promo-card-glow(2.4s 초록 inset 링), admin-unread-glow(3s 파란 inset 링+틴트), credit-flash-up/down(0.72s scale 1→1.45, 색 #2563eb/#ef4444), passage-added-glow(1.5s). 모두 prefers-reduced-motion 대체 규칙을 동반한다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:355-493, 818-837`
- **'생성 중' 상태 전용 모션 2종: .learning-generating-glow::after 는 conic-gradient(@property --smoat-spin-glow-angle)를 mask 로 2px 링만 남겨 1.8s linear 로 초록(rgba(16,185,129,.95)) 글로우를 회전시키고, .learning-generating-text 는 #059669→#34d399→#a7f3d0 그라디언트를 background-clip:text 로 1.8s 스윕하며 ::after 로 점(...)을 1.6s steps 로 늘린다(폭 1.1em 고정).**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:1387-1483`
- **작업대 로딩 카드(.workbench-loading-card)는 ::before 로 conic-gradient 궤도광(3.8s linear, rgba(59,130,246,.78)+rgba(20,184,166,.46)), ::after 로 110deg 흰 sheen(3.2s)을 돌리고, 진행바는 linear-gradient(90deg,#93c5fd,#2563eb,#14b8a6) + 0 0 12px rgba(37,99,235,.42) 글로우로 pending 34% / analyzing 68% 폭을 갖는다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:698-769, 839-845`
- **서비스명 표기 규칙(코드 실측 빈도, src/ 하위 .ts/.tsx 기준): 대문자 'SMOAT' 262회, 한글 '스모트' 134회, 소문자 'smoat' 273회, 파스칼 'Smoat' 0회. 단 소문자 273회는 전부 기술 식별자다 — 도메인 smoat.co.kr, localStorage 키("smoat.similarExam.leftWidth", "smoat:draft-folder-column"), CSS 클래스 프리픽스(smoat-large-ui, smoat-hint-glow, smoat-file-empty-guide), 내보내기 파일명(smoat-members-*). UI 노출 텍스트에는 소문자 표기가 없다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:1501 / d:/Desktop/2026project/nara/src/app/(director)/director/workbench/exams/similar/similar-exam-generator-client.tsx:66 / d:/Desktop/2026project/nara/src/actions/admin-members/export-members.ts:249`
- **브랜드 표기의 단일 소스는 SEO config 다: SITE.name = "SMOAT", SITE.nameKo = "스모트", legalName = "주식회사 네안데르", locale ko_KR, 운영 도메인 https://www.smoat.co.kr. 하위 페이지 타이틀 템플릿은 "%s | 스모트 SMOAT" 로 한/영 병기를 강제한다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/seo/config.ts:11, 34-52`
  - 실제 문구: 스모트(SMOAT) | AI 영어 문제 생성·내신 시험지 제작 영어학원 올인원
- **한글 '스모트'는 주로 (1) SEO/브랜드 엔터티 문맥과 (2) 사내 공지·매뉴얼 UI 라벨에서 쓰인다: "스모트 소식", "스모트 소식 관리", "스모트의 모든 기능을 안내합니다", 다운로드 파일명 "스모트-사용매뉴얼.pdf".**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/notices/notices-client.tsx:77-79 / d:/Desktop/2026project/nara/src/app/(director)/director/help/manual/page.tsx:165, 216`
  - 실제 문구: 스모트의 새로운 기능과 업데이트 소식을 여기에서 모아 보실 수 있어요.
- **브랜드 정의문(about 페이지 verbatim)이 존재한다 — 덱의 '한 줄 소개' 슬라이드에 그대로 쓸 수 있다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/about/page.tsx:43-45, 54-55`
  - 실제 문구: 스모트(SMOAT)란? — 영어학원을 위한 AI 올인원 / 스모트(SMOAT)는 영어 지문 분석, 내신·수능 19유형 AI 영어 문제 생성, Word 시험지 자동 제작, 그리고 학원 운영까지 한곳에서 끝내는 영어학원 AI 올인원 서비스입니다. 영어 강사가 자료 제작에 쓰던 시간을 수업에 돌려드립니다.
- **랜딩 히어로의 확정 카피: 배지 '영어 내신·수능 최적화 AI', H1 '영어시험 고민은 이제 끝! / SMOAT가 모든 걸 해드립니다', 서브 'SMOAT의 영어 내신·수능 최적화 AI로 / 10시간을 10분으로 단축해드립니다!', CTA 'SMOAT 시작하기' + '실제 결과물 보기'.**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/hero-scene.tsx:422-479`
  - 실제 문구: 영어시험 고민은 이제 끝! SMOAT가 모든 걸 해드립니다 / 10시간을 10분으로 단축해드립니다! / SMOAT 시작하기 / 실제 결과물 보기
- **CTA 씬 확정 카피: H2 '가장 진보된 방식의 / 영어 출제 시스템', 서브 '분석부터 출제, 시험지, 리포트까지 — 모두 이곳에 있습니다.', 버튼 '지금 바로 시작하기 →' / '가격 보기 →'.**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/cta-scene.tsx:43-66`
  - 실제 문구: 가장 진보된 방식의 영어 출제 시스템 / 분석부터 출제, 시험지, 리포트까지 — 모두 이곳에 있습니다. / 지금 바로 시작하기 / 가격 보기
- **브랜드 그라디언트 텍스트 규칙: 다크 히어로/CTA 의 강조 문구는 bg-gradient-to-r from-[#7DB0FF] to-[#3B82F6] + bg-clip-text text-transparent 로 처리하고, 본문 보조 텍스트 색은 #B6C2D9 로 고정한다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/hero-scene.tsx:436-447 / d:/Desktop/2026project/nara/src/components/landing/cta-scene.tsx:45, 48`
- **랜딩 상단 내비게이션 항목(제품 기능 명칭 정본): 단체 세미나 / 25유형 출제 / 학습지 생성 / 시험지 / 자료 추출 / 시험 리포트 / 지문 웹툰 / 아카이브 / 샘플. 우측 액션은 '로그인'과 '회원 가입'.**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/landing-header.tsx:11-21, 101, 111`
  - 실제 문구: 단체 세미나 · 25유형 출제 · 학습지 생성 · 시험지 · 자료 추출 · 시험 리포트 · 지문 웹툰 · 아카이브 · 샘플
- **마케팅(기능 소개) 헤더는 랜딩 헤더와 워드마크 규격이 같지만 CTA 문구가 다르다: 'SMOAT' 18px font-black text-slate-950 + hover blue-600, 우측 버튼은 '학원 가입 신청'(모바일에선 '가입 신청'), bg-slate-950 → hover bg-blue-600.**
  - 근거: `d:/Desktop/2026project/nara/src/components/seo/marketing-header.tsx:94-131`
  - 실제 문구: 학원 가입 신청
- **반응형 토큰 체계: 가로 간격은 vw 비례 clamp(--sp-1 ~ --sp-6, 390px 기준 6/12/16/20/28/40px), 세로 간격은 svh 기반(--gap-section max(1rem,2.5svh) 등), 타이포는 --fs-caption ~ --fs-2xl 이 clamp 로 390px 기준 11~30px, 컴포넌트 높이는 --header-h/--tab-h/--fab-size = clamp(2.75rem,6.5svh,4rem), --touch-min = clamp(2.25rem,11.3vw,3.125rem)(44px@390).**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:85-131`
- **지문 하이라이트 색 토큰: 라이트 --hl-exam-bg #fef08a(노랑), --hl-vocab-bg #dbeafe(파랑); 다크는 rgba(250,204,21,0.45) / rgba(96,165,250,0.42) 반투명 밴드. 문법 하이라이트는 rgba(59,130,246,0.18) 하단 밴드, 어휘는 1.5px dashed rgba(245,158,11,0.55) 밑줄.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:249-250, 290-291, 872-890`
- **폰 가로모드 전용 커스텀 variant 가 있다: @custom-variant phone-landscape (@media (min-width:768px) and (max-height:480px)) — 폭은 md 이상이지만 높이가 낮은 뷰포트에서 모바일 셸을 유지하는 용도. 다크는 @custom-variant dark (&:is(.dark *)) 클래스 기반.**
  - 근거: `d:/Desktop/2026project/nara/src/app/globals.css:7-10`
- **shadcn 설정은 style "new-york", baseColor "neutral", cssVariables true, iconLibrary "lucide", tailwind.config 는 빈 문자열(v4 이므로 config 파일 없음), css 진입점 src/app/globals.css.**
  - 근거: `d:/Desktop/2026project/nara/components.json:1-24`

### 덱 재현 대상 (visualSpec)

#### SMOAT 로고 락업 (랜딩 헤더 원본)

- 왜: 세미나 덱 전 슬라이드의 상단 브랜드 워터마크로 그대로 재사용 가능한, 코드에 확정된 유일한 락업 규격.
- 소스: `d:/Desktop/2026project/nara/src/components/landing/landing-header.tsx`
- 시각 스펙:

```
수평 flex, align-items:center, gap 10px(gap-2.5). [아이콘] 36x36(size-9) 원형(border-radius:9999px), overflow:hidden, background transparent, box-shadow: 0 16px 32px -22px rgba(15,23,42,0.8); 내부에 /smoat-logo.png 를 width/height 100% object-fit:cover. hover 시 아이콘 배경 #2563EB(group-hover:bg-blue-600). [워드마크] 텍스트 'SMOAT', font-family Pretendard, font-size 18px, font-weight 900, letter-spacing normal, color #020617(slate-950); hover 시 color #2563EB, transition color .2s. 다크 배경(히어로) 위에서는 워드마크 color #FFFFFF 로 스왑. 헤더 바 자체: position fixed, 높이 80px(스크롤 전) → 64px(스크롤 후, transition 300ms), 내부 max-width 1240px, 좌우 padding 16→32px, 배경 흰색 + box-shadow 0 1px 0 rgba(15,23,42,0.08); 스크롤 시 데스크톱은 rgba(255,255,255,0.72) + backdrop-blur(24px). 헤더 등장 모션: framer-motion initial {y:-16, opacity:0} → animate {y:0, opacity:1}, duration 0.5s easeOut.
```

#### SMOAT 심볼 SVG (favicon/icon.svg 원본 벡터)

- 왜: PNG 로고와 달리 벡터 원본이라 슬라이드에서 무한 확대/색 반전이 가능하고, 브랜드 심볼의 실제 형태(별+책+광선)를 정확히 재현할 수 있다.
- 소스: `d:/Desktop/2026project/nara/public/icon.svg`
- 시각 스펙:

```
<svg viewBox="0 0 100 100" role="img" aria-label="SMOAT"> 안에: (1) <rect width=100 height=100 rx=24 fill="#020617"/> — 라운드 24 의 거의 검정 슬레이트 사각형. (2) <g transform="translate(5 5) scale(0.9)" fill="#fff"> 로 감싼 흰 도형 3종: (a) 상단 방사 광선 5개 — stroke #fff, stroke-width 3.4, stroke-linecap round, fill none, 좌표 line(50,3→50,11), (55.5,4.5→51.5,11.5), (44.5,4.5→48.5,11.5), (59.5,8.5→52.5,12.5), (40.5,8.5→47.5,12.5). (b) 5각 별 — path "M50 21L53.5 30L63.3 30.7L55.7 36.9L58.2 46.3L50 41L41.8 46.3L44.3 36.9L36.7 30.7L46.5 30Z". (c) 펼친 책 — path "M50 58C40 53 25 49 12 50L12 88C25 87 40 89 50 94C60 89 75 87 88 88L88 50C75 49 60 53 50 58Z". 슬라이드 적용 팁: 어두운 슬라이드에선 rect 를 제거하고 흰 도형만, 밝은 슬라이드에선 rect 유지. 애니메이션 권장: 광선 5개를 stroke-dashoffset 0.4s stagger 로 그려낸 뒤 별을 scale(0.7→1) spring, 마지막에 책이 아래에서 y+8→0 으로 올라옴.
```

#### 브랜드 컬러 팔레트 보드

- 왜: 덱의 '디자인 시스템' 슬라이드에 그대로 옮길 수 있는 확정 스와치 그리드. 색 hex 와 역할 라벨이 코드에 문서화돼 있다.
- 소스: `d:/Desktop/2026project/nara/design-sync/foundations/colors.html`
- 시각 스펙:

```
흰 배경(#fff), 본문 색 #111827, padding 28px, 폰트 Pretendard. 제목 h1 15px/800 'SMOAT 색상 팔레트', 그 아래 note 12px color #6B7280: '브랜드 프라이머리는 blue(#3B82F6, hover #2563EB). 시맨틱: emerald=성공/검수, amber=주의, red=오류/미검수, purple=XP·특수.' 섹션 제목 h2 12px/700 color #374151, margin 18px 0 8px. 스와치 그리드: display grid, grid-template-columns repeat(auto-fill, minmax(120px,1fr)), gap 8px. 스와치 카드: border 1px solid #E5E7EB, border-radius 8px, overflow hidden; 상단 컬러칩 height 44px; 하단 메타 padding 6px 8px, font-size 10.5px, line-height 1.4, 라벨 b(font-weight 600) + hex span(color #9CA3AF, tabular-nums). 섹션과 값: [Brand(yshin-*)] blue #3B82F6 / blue-hover #2563EB / blue-subtle #EFF6FF / blue-light #BFDBFE / indigo #6366F1 / purple #8B5CF6. [Semantic] emerald #10B981 / emerald-subtle #ECFDF5 / amber #F59E0B / amber-subtle #FFFBEB / red #EF4444 / red-subtle #FEF2F2. [ERP(원장/어드민 화면)] erp-primary #2563EB / erp-bg #F8FAFC / erp-border #E2E8F0 / erp-text #0F172A / erp-text-secondary #64748B / erp-text-muted #94A3B8. [Neutrals(gray)] #F9FAFB / #F3F4F6 / #E5E7EB / #6B7280 / #374151 / #111827. 모션 권장: 스와치가 좌→우 순서로 stagger 0.03s, opacity 0→1 + translateY 8px→0.
```

#### 타이포그래피 스케일 표 (Pretendard)

- 왜: 덱에서 '한 서체로 전 화면을 통일했다'는 주장을 실제 스케일 표로 증명할 수 있다. 각 행이 실제 렌더 샘플이라 슬라이드에서도 그대로 살아 있는 표가 된다.
- 소스: `d:/Desktop/2026project/nara/design-sync/foundations/type.html`
- 시각 스펙:

```
흰 배경, padding 28px, 폰트 Pretendard(CDN v1.3.9). h1 15px/800 '타이포그래피 — Pretendard'. note 12px #6B7280: '전 화면 단일 서체 Pretendard(CDN v1.3.9). 폴백: Apple SD Gothic Neo → Noto Sans KR → Malgun Gothic. 시험지 인쇄 영역만 별도 폰트 사용.' 표: table border-collapse collapse, width 100%; td padding 10px 12px, border-bottom 1px solid #F3F4F6, vertical-align middle; 좌측 라벨 td 10.5px color #9CA3AF, white-space nowrap, width 190px, tabular-nums. 행(라벨 → 샘플 스타일/텍스트): 'heading · 18px · 900(black)' → 18px/900 color #020617 'SMOAT 워드마크·페이지 제목'; 'section title · 15px · 800' → '섹션 제목은 15px 800'; 'dialog title · 18px · 600' → '모달 제목 (text-lg font-semibold)'; 'body · 14px · 400' → '본문 기본은 text-sm(14px). 버튼 라벨도 14px 500.'; 'ui dense · 13px · 500' → '밀도 높은 UI 라벨 · 모바일 하단 바 버튼(13.5px 700)'; 'admin · 12px · 500~600' → '어드민 표·필터 필·페이저는 12px'; 'caption · 11px · 500' → color #6B7280 '카운트·보조 캡션 11px, 색은 gray-500/slate-400'; 'micro chip · 10px · 600' → color #4B5563 '칩 내부 초소형 10px (크레딧 칩 등)'; '숫자 · tabular-nums' → 14px font-variant-numeric tabular-nums '1,234,567 — 숫자는 항상 tabular-nums'. 주의: 실제 앱은 body 20px 기준(smoat-large-ui)로 한 단계 확대되어 렌더된다는 각주를 달 것.
```

#### 버튼 색 규약 카드 (컨텍스트 시맨틱)

- 왜: '색이 곧 기능'이라는 SMOAT 고유 규약은 세미나에서 설명 가치가 크고, 실제 버튼 상태(hover 포함)까지 인터랙티브로 재현 가능하다.
- 소스: `d:/Desktop/2026project/nara/design-sync/patterns/color-rules.html`
- 시각 스펙:

```
흰 배경, padding 28px. h1 15px/800 '버튼 색 규약 (컨텍스트 시맨틱)'. note 12px #6B7280: '색은 기능을 말한다 — 파랑=학습자료·생성·주요 액션, 초록=검수(취소 포함), 빨강=미검수 상태, 슬레이트=선택/활성. 검수취소에 rose 사용 금지.' 버튼 기본형(.btn): inline-flex, align-items center, gap 6px, height 32px, padding 0 12px, border-radius 8px, font-size 12px, font-weight 600, border 1px solid transparent, transition all .15s. 섹션1 '파랑 — 학습자료 · 생성 · 주요 액션': [학습자료 생성] bg #2563EB color #fff, hover bg #1D4ED8 / [문제 생성] 동일 / [비활성 (bg-slate-200)] bg #E2E8F0 color #94A3B8 cursor not-allowed. 섹션2 '초록(emerald) — 검수 계열 (취소도 초록)': [검수완료] bg #fff, border #10B981, color #059669, box-shadow 0 1px 2px rgba(0,0,0,.05), hover bg #ECFDF5, 좌측 13px 체크서클 아이콘 / [미검수 남음 (hover 시 초록)] bg #fff, border rgba(254,202,202,.8), color #FCA5A5 → hover 시 border #10B981·bg #ECFDF5·color #059669 / [추출 저장] bg #059669 color #fff, hover #047857. 섹션3 '슬레이트 — 선택 · 활성': [활성 필터] bg #0F172A color #fff / [현재 페이지] bg #1E293B color #fff / [선택된 카드] bg #2563EB border #2563EB color #fff. 하단 규칙 박스: bg #F9FAFB, border-radius 8px, padding 12px 14px, 12px/#6B7280, line-height 1.7, 굵은 부분 #111827 — 원문 4줄: '학습자료 버튼 = 파랑(blue-600 → hover 700), 비활성은 slate-200 / 검수 버튼(검수취소 포함) = 초록(emerald) — rose/빨강 배경 금지, 빨강은 "미검수" 상태 표시 전용(red-200/300 테두리·글자) / 선택/활성 상태 = slate-800/900 solid / 크레딧 소모 버튼에는 CreditCostChip을 함께 표기'.
```

#### 랜딩 히어로 — 다크 네이비 + 3D 부유 대시보드

- 왜: 덱의 오프닝/브랜드 임팩트 슬라이드로 그대로 옮길 수 있는, 브랜드 배경·그리드·글로우·그라디언트 텍스트·3D 목업이 한 화면에 모인 대표 씬.
- 소스: `d:/Desktop/2026project/nara/src/components/landing/hero-scene.tsx`
- 시각 스펙:

```
섹션 배경: bg radial-gradient(120% 80% at 50% -8%, #1B2A4A 0%, #111C34 45%, #0B1220 100%), 높이 100svh(min 850px), overflow hidden, padding-top 112px(lg). 오버레이1 — 격자: linear-gradient(rgba(148,180,255,0.06) 1px, transparent 1px) + 90deg 동일, background-size 34px 34px, absolute inset-0 z-[-10]. 오버레이2 — 글로우: absolute left-50% translateX(-50%) top:-40px, width 820px, height 420px, border-radius 9999px, background radial-gradient(closest-side, rgba(59,130,246,0.38), transparent), filter blur(20px). 콘텐츠 컨테이너 max-width 1220px, 가운데 정렬. [배지] inline-flex, height 32px, border-radius 9999px, background rgba(59,130,246,0.15), padding 0 16px, font-size 13px, font-weight 800, letter-spacing .04em, color #93C5FD(text-blue-300), 좌측 14px Sparkles 아이콘, 텍스트 '영어 내신·수능 최적화 AI'. [H1] font-weight 900, line-height 1.15, letter-spacing tight, color #fff, font-size 34px(모바일)→48px(sm)→72px(lg): 1행 '영어시험 고민은 이제 끝!' / 2행 'SMOAT가 모든 걸 해드립니다' — 2행만 background linear-gradient(to right, #7DB0FF, #3B82F6) + background-clip:text + color transparent. [서브] font-size 16→19px, font-weight 700, line-height 32px, color #B6C2D9, 1행 'SMOAT의 영어 내신·수능 최적화 AI로', 2행은 인라인 필: background #DBEAFE(bg-blue-100), color #1E40AF(text-blue-800), border-radius 9999px, padding 6px 20px, 15→17px/800, 텍스트 '10시간을 10분으로 단축해드립니다!'. [CTA 2개] 주버튼: height 52→58px, border-radius 9999px, background #2563EB, padding 0 32→40px, 15→16px/900, color #fff, box-shadow 0 24px 54px -22px rgba(37,99,235,1), ring 4px rgba(59,130,246,0.15), hover translateY(-2px)+bg #1D4ED8, 텍스트 'SMOAT 시작하기' + ArrowRight 16px. 보조버튼: height 48→54px, border 1px rgba(255,255,255,.28), background rgba(255,255,255,.12), backdrop-blur(24px), color #fff, 14px/900, 텍스트 '실제 결과물 보기' + FileText 아이콘. [3D 목업] 부모에 perspective 1600px, perspective-origin top. 카드는 keyframes yshin-builder-float 8s ease-in-out infinite: 0%/100% translateY(0) rotateX(13deg) rotateY(-9deg) rotateZ(3deg), 50% translateY(-12px) rotateX(15deg) rotateY(-11deg) rotateZ(4deg). 목업 외곽: border-radius 34px, border 10px solid rgba(2,6,23,.9), box-shadow 0 36px 110px -40px rgba(15,23,42,.8); 내부 화면 border-radius 24px, background #F8FAFC, height 468px. 브라우저 크롬: height 48px, 흰 배경, 신호등 점 10px(#FCA5A5/#FCD34D/#6EE7B7), 주소칩 bg #F1F5F9 11px/900 #6B7280 텍스트 'smoat.co.kr/workbench/exams/create', 우측 '저장됨'(bg #ECFDF5, color #047857) 과 '출력'(bg #2563EB, color #fff) 필. 본문 그리드: 172px / 1fr / 246px 3열. 좌 사이드바 상단 로고칩: 32px 정사각 border-radius 12px background #2563EB, 흰 900 12px 'S' + 옆에 13px/900 #020617 'SMOAT'. 메뉴 4개 '문제 생성/시험지 생성/학습지 생성/자료 추출' 중 2번째 활성(bg #EFF6FF, color #1D4ED8, 앞 6px 점 #3B82F6). 중앙: 킥커 10px/900 uppercase #3B82F6 '시험지 생성', 제목 22px/900 #020617 '고2 영어 중간고사 시험지 편집', 칩 'A4 · 2단 · 12문항'(border #DBEAFE, color #1D4ED8) 과 '자동 저장'(bg #020617 color #fff). 종이 미리보기: 흰 A4 카드(border-radius 10px, border #E2E8F0, shadow 0 24px 70px -40px rgba(15,23,42,.6)) 안에 '2026학년도 1학기'(8px/900 #2563EB), '고2 영어 중간고사'(15px/900), 반/이름 표, 안내문 '다음 글을 읽고 물음에 답하시오. 각 문항의 답을 하나만 고르시오.', 문항 카드 4개(1 빈칸 추론 / 2 어법 판단(선택됨, border #93C5FD, bg rgba(239,246,255,.45), 좌측에 파란 GripVertical 커서가 2.4s ease-in-out 로 opacity .35↔1 + y 0↔-2px) / 3 글의 순서 / 4 조건부 영작). 좌상단 필 '1페이지 편집중', 우상단 파란 필 'AI 추천 배치'(bg #2563EB + Sparkles). 하단 파이프라인 카드 4개: '지면 편집/A4 2단 레이아웃'(아이콘칩 bg-blue-500), '문항 추가/라이브러리에서 배치'(bg-cyan-500), '자동 저장/편집 내용 즉시 반영'(bg-emerald-500), '파일 출력/DOCX·HWPX·PDF'(bg-amber-500) — 카드는 border-radius 16px, border rgba(255,255,255,.7), bg rgba(255,255,255,.82), backdrop-blur, shadow 0 18px 45px -30px rgba(15,23,42,.55). 우 사이드바: '시험지 설정' + '12문항' 필, A4/2단(파란 활성)·정답지, '문항 라이브러리' 6항목(빈칸 추론/어법 판단/글의 순서/문장 삽입/제목 추론/조건부 영작), 하단 검정 카드(bg #020617) 'Export Ready' + 20px/900 '고2영어_중간.docx' + '시험지·정답지 함께 생성'. 등장 모션: 텍스트 블록은 staggerChildren 0.12 / delayChildren 0.15, H1 은 opacity0+y34+blur(8px)→0, duration 0.8s ease [0.16,1,0.3,1]; 목업은 delay 0.55s, opacity0+y60→0, duration 0.9s. XL 이상에서만 보이는 부유 배지 3개: '시험지 생성 / 실제 지면 직접 편집'(translateZ 80px), '문항 구성 / 12문항 자동 배치'(60px), '출력 완료 / DOCX·HWPX·PDF'(90px) — bg rgba(255,255,255,.86), border rgba(255,255,255,.75), border-radius 16px, shadow 0 24px 70px -35px rgba(15,23,42,.65), 아이콘칩 40px bg #EFF6FF color #2563EB.
```

#### CTA 클로징 씬 (브랜드 아이콘 + 그라디언트 헤드라인)

- 왜: 세미나 덱의 마지막 '함께 시작하기' 슬라이드로 1:1 이식 가능. 브랜드 아이콘이 단독으로 크게 등장하는 유일한 공식 레이아웃이다.
- 소스: `d:/Desktop/2026project/nara/src/components/landing/cta-scene.tsx`
- 시각 스펙:

```
섹션 배경 radial-gradient(120% 120% at 50% 0%, #1B2A4A, #0B1220 62%), min-height 100svh, 중앙 정렬 세로 스택. 위에 GRID_DARK 격자(34px, rgba(148,180,255,.06))와 SceneGlow(top 0, 760x400, radial rgba(59,130,246,.38), blur 20px). 콘텐츠 max-width 1440px, padding 0 32px, text-align center. [상단 이미지 밴드] height clamp(140px,24vw,300px), width 100% max 920px, border-radius 16px, border 1px rgba(147,197,253,.2), background #071426, box-shadow 0 30px 90px -34px rgba(37,99,235,.7), 내부 이미지 /landing/generated/ai-english-system-hero-v5.png object-cover (alt: '알파벳과 영어 시험지가 분석되어 정돈된 문항으로 생성되는 과정'). [브랜드 아이콘] 56px(size-14), border-radius 16px(rounded-2xl), margin-bottom 24px, box-shadow 0 10px 30px rgba(59,130,246,0.3), 내부 /smoat-logo.png object-cover. [H2] font-weight 900, color #fff, font-size clamp(34px,3.8vw,56px), line-height 1.16, letter-spacing -0.03em, word-break keep-all: 1행 '가장 진보된 방식의' / 2행 '영어 출제 시스템' — 2행은 linear-gradient(to right,#7DB0FF,#3B82F6) + bg-clip:text + transparent. [서브] margin-top 20px, 16~18px, color #B6C2D9, font-weight 500, '분석부터 출제, 시험지, 리포트까지 — 모두 이곳에 있습니다.' [버튼 2개] 둘 다 height 56px, padding 0 40px, border-radius 9999px, 16px/800. 1번: bg #3B82F6, color #fff, box-shadow 0 18px 40px -14px rgba(59,130,246,.85), hover bg #60A5FA + translateY(-2px), 텍스트 '지금 바로 시작하기 →'. 2번: border 1px rgba(255,255,255,.28), bg rgba(255,255,255,.12), color #fff, hover border rgba(255,255,255,.5)+bg rgba(255,255,255,.2), 텍스트 '가격 보기 →'. 등장: Stagger(amount 0.25, gap 0.12)로 요소가 순차 진입, 아이콘·버튼 그룹은 'pop' 변형.
```

#### 랜딩 씬 프레이밍 토큰 (킥커·고스트 숫자·격자·글로우)

- 왜: 덱의 모든 챕터 표지를 실제 제품 랜딩과 동일한 문법으로 찍어낼 수 있는 재사용 부품 세트. 이 4개만 있으면 SMOAT 톤의 슬라이드가 무한 생성된다.
- 소스: `d:/Desktop/2026project/nara/src/components/landing/shared/scene-ui.tsx`
- 시각 스펙:

```
(1) GRID_INK — 라이트 배경용 격자: background-image linear-gradient(rgba(15,23,42,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.045) 1px, transparent 1px); background-size 34px 34px. (2) GRID_DARK — 다크 배경용: 동일 구조에 색만 rgba(148,180,255,0.06). (3) SCENE_NAVY_BG — radial-gradient(120% 80% at 50% -8%, #1B2A4A 0%, #111C34 45%, #0B1220 100%). (4) SceneGlow — position absolute, left 50%, transform translateX(-50%), border-radius 9999px, background radial-gradient(closest-side, rgba(59,130,246,0.38), transparent), filter blur(20px), 크기는 사용처가 지정(예: 820x420, 760x400). (5) SceneKicker — flex, gap 10px, font-size 12px(sm 14px), font-weight 800, text-transform uppercase, letter-spacing 0.14em, color #2563EB(라이트) / #93C5FD(다크). 형태 예: 'FEATURE · OO'. (6) SceneGhost — 챕터 번호를 타이틀 뒤에 깔아두는 아웃라인 숫자: position absolute, pointer-events none, user-select none, font-size 92px(lg 190px), font-weight 900, line-height 0.8, letter-spacing -0.05em, color transparent, -webkit-text-stroke 2px #BFDBFE, font-variant-numeric tabular-nums. (7) Accent — 타이틀 내 강조 span, color #2563EB. 주의(코드 주석 명시): 데모 컴포넌트는 자체 LIVE DEMO 크롬을 갖고 있으므로 프레임을 이중으로 씌우지 말 것.
```

#### ERP 사이드바 브랜드 헤더 (SMOAT + erp)

- 왜: 제품 내부(원장/강사 화면)의 브랜드 표기 방식은 랜딩과 다르며(워드마크 20px bold + 소문자 erp 서브라벨), 세미나에서 '실제 업무 화면'을 재현할 때 반드시 필요한 디테일.
- 소스: `d:/Desktop/2026project/nara/src/components/layout/admin-shell.tsx`
- 시각 스펙:

```
사이드바 컨테이너: 폭 220px(펼침) / 72px(접힘), 리사이즈 범위 180~300px, 배경은 유리 — backdrop-filter blur(40px) saturate(180%), background var(--sidebar-glass)=rgba(255,255,255,0.55), border-right 1px solid var(--sidebar-edge)=rgba(0,0,0,0.06). 로고 행: display flex, align-items center, height 64px, flex-shrink 0, padding 0 24px(펼침) / justify-center(접힘), transition all 300ms. 내부: <a> flex gap 10px — BrandIcon 32px(size-8, 내부 마크 20px; 접힘 시 36px/21px) 원형 마크, 그 옆 텍스트 'SMOAT' font-size 20px, font-weight 700, letter-spacing tight, color #111827(text-gray-900), 그 옆에 소문자 서브라벨 'erp' font-size 10px, color #D1D5DB(text-gray-300), font-weight 500, letter-spacing widest(0.1em), text-transform uppercase, margin-top 2px. 접힘 상태에선 워드마크와 erp 라벨 모두 언마운트되고 아이콘만 남는다.
```

#### SMOAT 모션 시그니처 5종 (글로우 언어)

- 왜: SMOAT UI 의 '말 대신 빛으로 안내한다'는 인터랙션 철학을 슬라이드에서 실제로 재생해 보여줄 수 있다. 전부 CSS 키프레임이라 슬라이드에 그대로 붙는다.
- 소스: `d:/Desktop/2026project/nara/src/app/globals.css`
- 시각 스펙:

```
(1) .smoat-hint-glow — 비활성 버튼을 눌렀을 때 '먼저 할 일'을 두 번 반짝여 유도. animation 1.5s ease-out, position relative, z-index 1. 키프레임: 0% box-shadow 0 0 0 0 rgba(37,99,235,0); 12% box-shadow 0 0 0 3px rgba(37,99,235,.55), 0 0 18px 5px rgba(37,99,235,.35) + background-color rgba(191,219,254,.7); 38% box-shadow 0 0 0 1px rgba(37,99,235,.15); 60% 12%와 동일; 100% 0. reduced-motion 시 정지 링 0 0 0 3px rgba(37,99,235,.45). (2) .topup-cta-glow — 충전 CTA 가 숨쉬듯 번지는 글로우, 2.8s ease-in-out infinite, 50%에서 box-shadow 0 0 18px 2px rgba(37,99,235,.45), 0 0 34px 8px rgba(37,99,235,.22). (3) .promo-card-glow — 프로모 적용 카드, 2.4s ease-in-out infinite, border-radius 12px, 0%/100% inset 0 0 0 1.5px rgba(16,185,129,.45), 50% inset 0 0 0 2px rgba(16,185,129,.9) + 0 0 16px 2px rgba(16,185,129,.5). (4) .learning-generating-glow::after — 카드 테두리를 도는 초록 궤도광: position absolute inset 0, border-radius 12px, padding 2px, background conic-gradient(from var(--smoat-spin-glow-angle), rgba(16,185,129,0) 0deg, rgba(16,185,129,.95) 70deg, rgba(52,211,153,.5) 115deg, rgba(16,185,129,0) 170deg, rgba(16,185,129,0) 180deg, rgba(16,185,129,.55) 250deg, rgba(16,185,129,0) 320deg), mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0) + mask-composite exclude, animation 1.8s linear infinite(@property --smoat-spin-glow-angle: <angle>, 0→360deg). 짝을 이루는 .learning-generating-text: background linear-gradient(90deg,#059669,#34d399 35%,#a7f3d0 50%,#34d399 65%,#059669), background-size 200% 100%, background-clip text, color transparent, 1.8s linear 스윕 + ::after 로 '...'(1.6s steps(1,end), width 1.1em 고정). (5) .workbench-loading-card — AI 분석 중 카드: ::before conic-gradient(from 0deg, transparent 0~235deg, rgba(59,130,246,.78) 286deg, rgba(20,184,166,.46) 318deg, transparent 360deg), inset -42%, animation 3.8s linear infinite; ::after 는 linear-gradient(110deg, transparent 20%, rgba(255,255,255,.72) 46%, transparent 70%) sheen 이 3.2s ease-in-out 로 background-position -90%→190% 이동; 진행바 background linear-gradient(90deg,#93c5fd,#2563eb,#14b8a6) + box-shadow 0 0 12px rgba(37,99,235,.42), 폭 pending 34% / analyzing 68%, animation 2.35s. 다섯 모두 @media (prefers-reduced-motion: reduce) 에서 animation:none 대체 규칙 보유.
```

#### 세미나 프로모 배너 (랜딩 상단 세미나 모집 카드)

- 왜: 이번 산출물이 '세미나용' 덱이므로, 제품이 실제로 세미나를 어떻게 노출/모집하는지 보여주는 화면을 그대로 재현하면 덱과 제품이 이어진다.
- 소스: `d:/Desktop/2026project/nara/src/components/landing/seminar-promo-section.tsx`
- 시각 스펙:

```
카드: max-width 1160px(lg 1320px), border-radius 28px, border 1px #E2E8F0, background #fff, overflow hidden, box-shadow 0 30px 80px -50px rgba(15,23,42,.55); hover 시 translateY(-2px) + shadow 0 40px 90px -46px rgba(37,99,235,.5). 내부 2열 그리드(md 이상 1fr 1fr), 높이 calc(100svh - 240px) min 480px. [좌측 패널] background linear-gradient(to bottom right, #020617, #0F172A, #172554)(slate-950→slate-900→blue-950), color #fff, padding 56px(lg), 세로 flex gap 24px, 좌상단에 지름 256px 원형 blur-3xl bg rgba(59,130,246,.2) 블롭. 상태 필: bg #3B82F6, border-radius 9999px, padding 4px 12px, 12px/900, 안에 6px 흰 점 + animate-ping 링, 텍스트 '모집중'. 정원 필: bg rgba(255,255,255,.1), color #DBEAFE, 12px/700, Users 14px 아이콘 + '선착순 N명'. 제목: 24px→38px, font-weight 900, line-height 1.25, tracking-tight, white-space pre-line. 설명: 13.5→16px, line-height 1.55, color #CBD5E1, word-break keep-all. 메타행: 13→14.5px, color #CBD5E1, 아이콘 색 #93C5FD — CalendarClock + 일정(없으면 '일정 조율 중'), MapPin + 장소. 하단 CTA 필: bg #fff, color #020617, border-radius 9999px, padding 12px 24px, 15px/900, hover 시 translateX(2px), 텍스트 '세미나 신청하기' + ArrowRight 16px. [우측 패널] 커버 이미지 object-cover 풀블리드; 커버 없으면 background linear-gradient(to bottom right, #EFF6FF, #F8FAFC, #E0E7FF) + 중앙에 Users 40px(stroke 1.5) + 14px/700 tracking-wide color #94A3B8 텍스트 'SMOAT 단체 세미나'.
```


### 갭 / 미확인

- smoat-logo.png(500x500) 의 실제 그림 내용/색상은 확인하지 못했다(바이너리). icon.svg/favicon.svg 의 벡터(검정 라운드 사각 + 별 + 책 + 광선)와 동일한 디자인인지 여부는 미검증 — 다만 smoat-logo.png / favicon.png / apple-icon.png / og-image.png 는 파일 크기가 19,830바이트로 모두 같아 동일 파일로 보인다.
- src/components/landing/brand/ 디렉토리는 존재하지 않는다. 브랜드 컴포넌트는 src/components/brand/brand-mark.tsx 단 하나뿐이며 그 안에 SVG 로고 컴포넌트는 없다(PNG <Image> 만 사용).
- design-sync/foundations/brand.html 의 로고 락업 예시 이미지는 base64 인라인이라 렌더 결과(실제 로고 픽셀)를 확인하지 못했다. 다만 스펙(36px 원형, box-shadow 0 16px 32px -22px rgba(15,23,42,.8), 워드마크 18px/900/#020617, hover #2563EB)은 텍스트로 확보했다.
- design-sync/components/{inputs,dialog,badges-chips,filter-pills,pagination,toggles}.html 및 patterns/{hint-glow,mobile-step-flow}.html 은 열어보지 않았다 — 폼·모달·뱃지 규격이 덱에 필요하면 추가 정찰이 필요하다.
- globals.css 2,478줄 중 992~1024, 1060~1370, 1700~2478 구간은 읽지 않았다(주로 .dark 유틸리티 재매핑과 smoat-large-ui 리맵 테이블로 보이나 전수 확인은 못 함). 추가 브랜드 토큰이 그 구간에 있을 가능성은 배제하지 못한다.
- 'yshin' 접두(--color-yshin-*, yshin-pulse/aurora/orbit 키프레임, yshin-sidebar-collapsed 스토리지 키)가 코드 전반에 남아 있으나, 이것이 구 브랜드명인지 개발 코드네임인지는 코드 내 설명이 없어 확인하지 못했다.
- public/landing/, public/marketing/, public/ir/, public/promo/ 안의 개별 이미지 파일 목록은 최상위만 확인했고 전수 조사하지 않았다(브랜드 키비주얼 후보가 더 있을 수 있음).
- 'SMOAT' 262회 / '스모트' 134회 / 소문자 'smoat' 273회 카운트는 src/ 하위 .ts·.tsx 한정이다. 마크다운 문서·public·scripts 는 집계에 포함하지 않았다.


---

## [각도 D] SMOAT 문항 유형 카탈로그 전수 — 영어 25종(UI 노출, +레거시 1종) + 국어 38종 = 생성 UI 총 63종, 그리고 학습(듀오링고형) 별도 23종. 유형 선택 UI는 "카테고리 아코디언 카드 → 2열 타일 그리드 → 타일별 ± 스테퍼 → 타일 아래로 붙는 세부설정 팝오버" 구조이며, 슬라이드에서 그대로 인터랙티브 재현 가능하다.

### 관측 사실

- **영어 유형의 SOT는 QUESTION_TYPE_UI(레코드) + QUESTION_TYPE_GROUPS(UI 그룹 3종). 카테고리 타입은 정확히 8개 문자열 유니온: "수능/모의고사 객관식" | "내신 서술형" | "어휘" | "국어 독서" | "국어 문학" | "국어 문법" | "국어 화법·작문·매체" | "국어 서답형".**
  - 근거: `src/lib/question-type-ui.ts:7-16`
  - 실제 문구: 수능/모의고사 객관식 · 내신 서술형 · 어휘 · 국어 독서 · 국어 문학 · 국어 문법 · 국어 화법·작문·매체 · 국어 서답형
- **영어 [수능/모의고사 객관식] 14종(UI 노출 순서 그대로). BLANK_INFERENCE 빈칸 추론(l.32), GRAMMAR_ERROR 어법 판단(l.42), GRAMMAR_CHOICE_COMBO 네모 어법(l.52), VOCAB_CHOICE 어휘 적절성(l.62), SENTENCE_ORDER 글의 순서(l.72), SENTENCE_INSERT 문장 삽입(l.82), TOPIC 주제 추론(l.92), MAIN_IDEA 요지/주장(l.102), TITLE 제목 추론(l.122), IMPLIED_MEANING 함축 의미 추론(l.132), REFERENCE 지칭 추론(l.142), CONTENT_MATCH 내용 일치(l.152), SUMMARY_COMPLETE_MC 요약문 완성(객관식)(l.162), IRRELEVANT 무관한 문장(l.172).**
  - 근거: `src/lib/question-type-ui.ts:308-327`
  - 실제 문구: 빈칸 추론 / 어법 판단 / 네모 어법 / 어휘 적절성 / 글의 순서 / 문장 삽입 / 주제 추론 / 요지/주장 / 제목 추론 / 함축 의미 추론 / 지칭 추론 / 내용 일치 / 요약문 완성(객관식) / 무관한 문장
- **영어 객관식 유형별 1줄 설명(코드 자구 그대로). 빈칸 추론="지문의 핵심 표현을 빈칸으로 비워 문맥 추론력을 묻습니다."(l.34) / 어법 판단="지문 속 표현 중 어법상 어색한 부분을 찾게 합니다."(l.44) / 네모 어법="(A)(B)(C) 각 네모 안의 두 표현 중 어법에 맞는 것을 골라 조합하게 합니다."(l.54) / 어휘 적절성="문맥상 부적절하게 바뀐 어휘를 찾게 합니다."(l.64) / 글의 순서="문장/단락의 논리적 연결 순서를 재구성하게 합니다."(l.74) / 문장 삽입="삽입 문장이 들어갈 가장 자연스러운 위치를 찾게 합니다."(l.84) / 주제 추론="글 전체의 중심 화제와 관점을 파악하게 합니다."(l.94) / 요지·주장="글 전체의 결론, 요지, 필자의 주장을 파악하게 합니다."(l.104) / 제목 추론="글의 핵심을 가장 잘 압축한 제목을 고르게 합니다."(l.124) / 함축 의미 추론="밑줄 친 구절이나 문장이 문맥에서 암시하는 의미를 추론하게 합니다."(l.134) / 지칭 추론="밑줄 친 대명사나 지시어가 가리키는 대상을 묻습니다."(l.144) / 내용 일치="세부 정보가 지문과 일치하는지 판단하게 합니다."(l.154) / 요약문 완성(객관식)="지문을 한 문장으로 요약한 영어 문장의 (A)(B)에 들어갈 말의 조합을 고르게 합니다."(l.164) / 무관한 문장="글의 흐름에서 벗어난 문장을 찾게 합니다."(l.174)**
  - 근거: `src/lib/question-type-ui.ts:34-174`
- **영어 [내신 서술형] 정확히 8종. CONDITIONAL_WRITING 조건부 영작(l.182), SENTENCE_TRANSFORM 문장 전환(l.192), FILL_BLANK_KEY 핵심 표현 빈칸(l.202), SUMMARY_COMPLETE 요약문 완성(l.212), SUMMARY_WRITING 요약문 영작(l.222), WORD_ORDER 배열 영작(l.232), TOPIC_SENTENCE_WRITING 주제문 영작(l.242), GRAMMAR_CORRECTION 문법 오류 수정(l.252).**
  - 근거: `src/lib/question-type-ui.ts:328-340`
  - 실제 문구: 조건부 영작 / 문장 전환 / 핵심 표현 빈칸 / 요약문 완성 / 요약문 영작 / 배열 영작 / 주제문 영작 / 문법 오류 수정
- **영어 서술형 8종 1줄 설명(그대로). 조건부 영작="우리말 문장을 조건에 맞게 영어로 쓰게 합니다."(l.184) / 문장 전환="원문 문장을 주어진 문법 조건에 맞게 변환하게 합니다."(l.194) / 핵심 표현 빈칸="본문 핵심 표현을 빈칸으로 두고 정확히 쓰게 합니다."(l.204) / 요약문 완성="글의 요약문 빈칸을 핵심어로 완성하게 합니다."(l.214) / 요약문 영작="지문 요약문의 빈칸을 [보기]·해석·단서를 활용해 영어로 직접 영작하게 합니다. (배열 영작과 달리 한 빈칸에 다단어 어구 전체가 들어갑니다.)"(l.224) / 배열 영작="흩어진 단어/구를 올바른 영어 문장으로 배열하게 합니다."(l.234) / 주제문 영작="글의 주제를 주제문(12~14단어) 또는 명사구(≤12단어)로 만들어 제시어 배열 또는 빈칸 완성으로 영작하게 합니다."(l.244) / 문법 오류 수정="지문 속 밑줄 친 문장/구간 안에서 어법상 틀린 부분을 찾아 바르게 고치게 합니다."(l.254)**
  - 근거: `src/lib/question-type-ui.ts:184-254`
- **영어 [어휘] 정확히 3종: CONTEXT_MEANING 문맥 속 의미(l.262, "밑줄 친 단어의 문맥상 의미를 고르게 합니다."), SYNONYM 동의어(l.272, "핵심 단어와 의미가 가장 가까운 단어를 고르게 합니다."), ANTONYM 반의어(l.282, "지문 속 핵심 어휘와 반대 의미의 단어를 연결하게 합니다.").**
  - 근거: `src/lib/question-type-ui.ts:341-348`
  - 실제 문구: 문맥 속 의미 / 동의어 / 반의어
- **레거시 호환 유형 TOPIC_MAIN_IDEA "주제/요지"가 레지스트리에는 존재하지만 QUESTION_TYPE_GROUPS(생성 UI)에는 의도적으로 빠져 있다. 설명 자구: "기존 저장 문제 호환용 통합 유형입니다. 새 출제는 주제 추론 또는 요지/주장을 우선 사용합니다." → 즉 생성 UI 노출 영어 유형은 14+8+3=25종, 레지스트리 엔트리는 26종.**
  - 근거: `src/lib/question-type-ui.ts:110-119`
  - 실제 문구: 기존 저장 문제 호환용 통합 유형입니다. 새 출제는 주제 추론 또는 요지/주장을 우선 사용합니다.
- **국어(KO) 유형은 별도 레지스트리 38종. 파일 헤더 주석이 구성을 명시: "38개 유형 모듈(독서 8 + 문학 9 + 문법 8 + 화법·작문·매체 10 + 내신 서답형 3)". typeId는 전부 "KO_" 접두이며 isKoQuestionType 이 접두로 판별한다.**
  - 근거: `src/lib/korean/registry/index.ts:4-5, 56-63, 76-78`
  - 실제 문구: 38개 유형 모듈(독서 8 + 문학 9 + 문법 8 + 화법·작문·매체 10 + 내신 서답형 3)
- **KO [국어 독서] 8종 라벨: KO_RD_FACT "내용 일치(사실적 이해)", KO_RD_STRUCT "전개 방식·논지 구조", KO_RD_INFER "추론·이유 도출", KO_RD_CONCEPT "개념 비교(㉠㉡)", KO_RD_CRIT "비판적 이해(관점 평가)", KO_RD_APPLY "<보기> 사례 적용(3점)", KO_RD_VOCAB "어휘 문맥적 의미(ⓐ~ⓔ)", KO_RD_THEORY "독서론(읽기 이론) 이해·메모 매핑".**
  - 근거: `src/lib/korean/types/KO_RD_FACT.ts:164; KO_RD_STRUCT.ts:452; KO_RD_INFER.ts:424; KO_RD_CONCEPT.ts:290; KO_RD_CRIT.ts:393; KO_RD_APPLY.ts:359; KO_RD_VOCAB.ts:276; KO_RD_THEORY.ts:399`
  - 실제 문구: 내용 일치(사실적 이해) / 전개 방식·논지 구조 / 추론·이유 도출 / 개념 비교(㉠㉡) / 비판적 이해(관점 평가) / <보기> 사례 적용(3점) / 어휘 문맥적 의미(ⓐ~ⓔ) / 독서론(읽기 이론) 이해·메모 매핑
- **KO 독서 8종 설명(그대로). KO_RD_FACT="지문 세부 정보의 일치/불일치를 판정하는 독서 세트 도입 유형"(l.175) / KO_RD_STRUCT="글의 거시 전개 방식(정의→예시·통시·견해 대비·문답 등) 또는 (가)(나) 복합 지문의 관계를 '~하고 있다' 메타 진술로 판정하는 독서 유형"(l.464) / KO_RD_INFER="지문 진술 2개 이상을 결합해 미명시 함의·이유·빈칸 결론을 도출하는 독서 추론 유형 (INFER/REASON/COMPLETE 3모드)"(l.438) / KO_RD_CONCEPT="지문의 두 핵심 개념·이론·절차를 ㉠·㉡으로 마킹하고 '달리/모두' 프레임 선지로 속성 귀속을 판정하는 독서 심화 유형"(l.302) / KO_RD_CRIT="대립 구도 지문에서 한 관점으로 다른 관점의 설명 범위 한계를 비판·평가하는 독서 고난도 유형 — (가)(나)·단일지문·<보기> 준거 3모드"(l.405) / KO_RD_APPLY="지문 원리를 <보기>의 신규 사례·실험·시나리오(변인 기호·수치)에 적용해 '~겠군' 선지의 정오를 판정하는 독서 3점 킬러 유형"(l.371) / KO_RD_VOCAB="지문의 서술성 한자어 5곳(ⓐ~ⓔ)을 마킹하고 고유어 치환의 적절성을 판정하는 독서 어휘 유형 — 바꿔쓰기 모드 단독"(l.289) / KO_RD_THEORY="읽기 이론·독서 방법 지문의 이해(윗글 이해형) 또는 학생 메모(ⓐ~ⓔ)의 이론 적용 적절성(메모 매핑형)을 판정하는 독서론 세트 단독 유형"(l.414)**
  - 근거: `src/lib/korean/types/KO_RD_FACT.ts:175, KO_RD_STRUCT.ts:464, KO_RD_INFER.ts:438, KO_RD_CONCEPT.ts:302, KO_RD_CRIT.ts:405, KO_RD_APPLY.ts:371, KO_RD_VOCAB.ts:289, KO_RD_THEORY.ts:414`
- **KO [국어 문학] 9종 라벨: KO_LIT_EXPR "표현상 특징(운문)", KO_LIT_NARR "서술상 특징(산문)", KO_LIT_FACT "작품 내용·인물·사건 이해", KO_LIT_PSYCH "화자·인물의 심리·태도", KO_LIT_PHRASE "구절·시어의 의미(㉠~㉤)", KO_LIT_BOGI "〈보기〉 외적 준거 감상", KO_LIT_COMPARE "작품 간 공통점·차이점", KO_LIT_MOTIF "소재·배경의 기능", KO_LIT_SPEECH "말하기 방식·대화 양상([A]/[B])".**
  - 근거: `src/lib/korean/types/KO_LIT_EXPR.ts:462; KO_LIT_NARR.ts:477; KO_LIT_FACT.ts:356; KO_LIT_PSYCH.ts:430; KO_LIT_PHRASE.ts:147; KO_LIT_BOGI.ts:326; KO_LIT_COMPARE.ts:514; KO_LIT_MOTIF.ts:379; KO_LIT_SPEECH.ts:411`
  - 실제 문구: 표현상 특징(운문) / 서술상 특징(산문) / 작품 내용·인물·사건 이해 / 화자·인물의 심리·태도 / 구절·시어의 의미(㉠~㉤) / 〈보기〉 외적 준거 감상 / 작품 간 공통점·차이점 / 소재·배경의 기능 / 말하기 방식·대화 양상([A]/[B])
- **KO 문학 9종 설명(그대로). EXPR="운문(현대시·고전시가)의 표현 기법과 그 효과를 '[기법]+~하여+[효과]' 2단 선지로 판정하는 문학 세트 도입 유형"(l.474) / NARR="산문 발췌의 서술 방식(시점·서술자 개입·제시 방식·구성)을 개념어 은행 기반 선지로 판정 — 발췌 장면 기준(작품 전체 지식 아님)"(l.489) / FACT="산문 발췌의 인물·행위·사건을 삼항 구조 선지로 대조해 왜곡된 하나를 판정하는 문학 사실적 이해 유형 — 핵심 서사소 재구성형 포함"(l.368) / PSYCH="화자·인물의 심리/태도/정서를 정서 개념어(체념·달관·자조·연민 …)로 판정 — 오답은 동일 극성 내 개념 치환이 함정 본질"(l.444) / PHRASE="지문에 ㉠~㉤/ⓐ~ⓔ 를 마킹하고 각 구절·시어의 의미와 기능을 1:1 선지로 판정하는 문학 최다 형식"(l.161) / BOGI="작가론·문학사·창작 배경·비평 개념의 <보기>를 해석 틀로 고정하고, '지문 직접 인용+보기 개념 연결+~군' 3요소 선지의 정합을 판정하는 문학 3점 킬러 유형"(l.340) / COMPARE="(가)(나) 복합지문에서 작품 간 공통점('모든 작품에 성립해야 참') 또는 차이점을 판정하는 복합 세트 개시 유형 — 검증량 = 작품 수 × 선지 수"(l.526) / MOTIF="지문 속 소재·공간·배경을 작은따옴표(또는 ⓐ·ⓑ 대비 마킹)로 지정하고 그 서사적·시적 기능을 판정하는 문학 유형"(l.399) / SPEECH="대화·발화 블록을 [A]/[B] 로 지정하고 화행(하소연·회유·설득 등 말하기 방식)을 판정하는 산문 대화 유형"(l.423)**
  - 근거: `src/lib/korean/types/KO_LIT_EXPR.ts:474, KO_LIT_NARR.ts:489, KO_LIT_FACT.ts:368, KO_LIT_PSYCH.ts:444, KO_LIT_PHRASE.ts:161, KO_LIT_BOGI.ts:340, KO_LIT_COMPARE.ts:526, KO_LIT_MOTIF.ts:399, KO_LIT_SPEECH.ts:423`
- **KO [국어 문법] 8종 라벨: KO_GR_READ "문법 지문 이해(지문형 세트)", KO_GR_PHONO "음운 변동(사례 분류)", KO_GR_MORPH "형태소·단어 형성(㉠~㉢ 사례)", KO_GR_SYNTAX "문장 구조(안긴문장·성분)", KO_GR_ELEMENT "문법 요소(높임·시제·피사동)", KO_GR_NORM "어문 규정 적용(맞춤법·표준발음)", KO_GR_APPLY "문법 <보기> 사례 적용(3점)", KO_GR_HIST "국어사·중세 국어".**
  - 근거: `src/lib/korean/types/KO_GR_READ.ts:237; KO_GR_PHONO.ts:660; KO_GR_MORPH.ts:560; KO_GR_SYNTAX.ts:738; KO_GR_ELEMENT.ts:650; KO_GR_NORM.ts:602; KO_GR_APPLY.ts:440; KO_GR_HIST.ts:491`
  - 실제 문구: 문법 지문 이해(지문형 세트) / 음운 변동(사례 분류) / 형태소·단어 형성(㉠~㉢ 사례) / 문장 구조(안긴문장·성분) / 문법 요소(높임·시제·피사동) / 어문 규정 적용(맞춤법·표준발음) / 문법 <보기> 사례 적용(3점) / 국어사·중세 국어
- **KO 문법 8종 설명(그대로, 압축 인용). PHONO="<보기>에 발음 병기 사례(값지다[갑찌다] 등)를 제시하고 교체/탈락/첨가/축약 분류·복합 변동·음운 개수 증감을 판정하는 문법 유형 — 지문 없이 <보기>만으로 성립하며, 내장 goldmap으로 정오를 결정론 검증"(l.672) / MORPH="<보기>의 단어 형성·형태소 개념 정의 ㉠~㉢에 사례 단어를 짝짓는 문법 단독형 — 빈출 단어 goldmap(33개) 결정론 검증 내장"(l.572) / SYNTAX="홑/겹문장·안긴문장(명사절/관형절 동격·관계/부사절/서술절/인용절)의 종류와 성분 기능을 <보기> 조건 대응 또는 이질 판정으로 묻는 문법 유형"(l.753) / ELEMENT="높임·시제·피사동·부정·인용의 문법 요소 조건 2~3개를 <보기>에 제시하고 조건을 모두 충족하는 자체 생성 예문 하나를 판별하는 조건 동시 충족형"(l.663) / NORM="<보기>에 어문 규정(한글 맞춤법·표준 발음법) 조문 요지를 '다만/[붙임]' 예외까지 인용하고 표기·발음 사례의 정오를 판정하는 규정 적용 유형"(l.614) / READ="문법 설명 지문(음운·형태·통사·국어사)의 이해를 판정하는 지문형 문법 세트 도입 유형"(l.249) / GR_APPLY="문법 설명 지문의 규칙을 <보기>의 신규 사례 5개(ⓐ~ⓔ)에 적용해 [규칙 × 사례] 매트릭스 판정의 정오를 가리는 지문형 문법 3점 유형 — 언매 36번 미러"(l.453) / HIST="중세 국어 자료(원문 전사+[현대어 풀이] 행 쌍)와 <보기> 탐구 개념…을 대조해, 현대 직관의 소급 적용·형태 오분석 선지를 가려내는 언매 39번형 국어사 유형"(l.508)**
  - 근거: `src/lib/korean/types/KO_GR_PHONO.ts:672, KO_GR_MORPH.ts:572, KO_GR_SYNTAX.ts:753, KO_GR_ELEMENT.ts:663, KO_GR_NORM.ts:614, KO_GR_READ.ts:249, KO_GR_APPLY.ts:453, KO_GR_HIST.ts:508`
- **KO [국어 화법·작문·매체] 10종 라벨: KO_SP_STRAT "발표 말하기 방식·표현 전략", KO_SP_PLAN "발표 계획 반영 여부", KO_SP_AUD "청중 반응 분석", KO_SP_FUNC "대화 발화 기능(㉠~㉤)", KO_SP_DEBATE "토론(입론·반대 신문·반론)", KO_WR_PLAN "글쓰기 계획 반영", KO_WR_METHOD "글쓰기 방식·내용 조직", KO_WR_COND "조건 충족 생성형(작문)", KO_WR_REVISE "고쳐쓰기", KO_MD_LANG "매체 언어 표현(문법 융합)".**
  - 근거: `src/lib/korean/types/KO_SP_STRAT.ts:462; KO_SP_PLAN.ts:374; KO_SP_AUD.ts:427; KO_SP_FUNC.ts:590; KO_SP_DEBATE.ts:498; KO_WR_PLAN.ts:346; KO_WR_METHOD.ts:519; KO_WR_COND.ts:720; KO_WR_REVISE.ts:484; KO_MD_LANG.ts:558`
  - 실제 문구: 발표 말하기 방식·표현 전략 / 발표 계획 반영 여부 / 청중 반응 분석 / 대화 발화 기능(㉠~㉤) / 토론(입론·반대 신문·반론) / 글쓰기 계획 반영 / 글쓰기 방식·내용 조직 / 조건 충족 생성형(작문) / 고쳐쓰기 / 매체 언어 표현(문법 융합)
- **KO 화작매체 10종 설명(그대로, 압축 인용). SP_PLAN="발표 전 계획 메모 5항목 중 실제 발표에 반영되지 않은 1개를 찾는 화법 유형"(l.392) / SP_STRAT="자체 생성 정형 발표문(인사→화제 도입→자료 제시·청중 질문→마무리, 괄호 지시문 동봉)을 판정 대상으로, [행위]+[목적/효과] 2중 선지에서 행위 부재·목적 불일치를 가려내는 화법 도입 유형"(l.477) / SP_AUD="신규 집필 발표문(자체자료)과 <보기>의 학생 반응을 대조해, 반응 주체와 메타유형(궁금증·배경지식·신뢰성·유용성·추가 탐색) 판정이 모두 정확한 선지를 고르는 화법 발표 세트 유형"(l.445) / SP_FUNC="자체 생성 대화·대담 자료에 ㉠~㉤ 발화를 마킹하고 각 발화의 담화 기능(종합·재진술·화제 전환·동의 표명·의문 제기·사례 요청·요약)을 1:1 선지로 판정하는 화법 유형 — 오답은 인접 기능 바꿔치기"(l.605) / SP_DEBATE="반대신문식 토론 담화(논제·사회자·찬성 1·2/반대 1·2)를 자체 생성하고, 입론 말하기 방식(대칭 선지)·쟁점×양측 주장 정오·<보기> 자료 반론 적절성을 판정하는 화법 유형"(l.514) / WR_PLAN="글쓰기 계획 메모('~해야겠어' 5항)와 학생 초고를 대조해 초고에 반영되지 않은 계획 하나를 판정하는 작문 유형 — 부분 실행 함정이 표준"(l.364) / WR_METHOD="자체 생성한 학생 초고(DRAFT)에 실현된 조직 방식을 [방식]+[대상] 결합 선지로 판정 — 방식 풀 8종 대조·정답 근거 초고 verbatim 을 결정론 검증하는 작문 표준 유형"(l.535) / WR_COND="학생 초고(제목/[A] 빈칸/마지막 문장 자리) + <보기> 조건 2~3항(내용 포괄·표현법·형식) — 정답은 전 조건 충족, 오답 4개는 정확히 일부만 충족하며 누락 조건을 해설에 1:1 명시하는 작문 시그니처"(l.738) / WR_REVISE="학생 초고의 결함(접속·중복·호응·통일성·어휘)을 ㉠~㉤ 마커 또는 <보기> 의견으로 짚고, 수정 방안 5개 중 부적절한 하나…를 판정하는 작문 고쳐쓰기 유형"(l.504) / MD_LANG="자체 생성 매체 화면 텍스트(누리집 게시문·방송 자막·메신저)의 문장 5곳에 피동·인용·청유/의문 종결·접속 표현을 ㉠~㉤으로 마킹하고, '형식 식별+의도 효과' 2절 선지에서 효과 오귀속 하나를 가려내는 문법 융합 매체 유형"(l.575)**
  - 근거: `src/lib/korean/types/KO_SP_PLAN.ts:392, KO_SP_STRAT.ts:477, KO_SP_AUD.ts:445, KO_SP_FUNC.ts:605, KO_SP_DEBATE.ts:514, KO_WR_PLAN.ts:364, KO_WR_METHOD.ts:535, KO_WR_COND.ts:738, KO_WR_REVISE.ts:504, KO_MD_LANG.ts:575`
- **KO [국어 서답형] 정확히 3종이며 유일하게 answerFormat 이 MC5가 아니다. KO_NS_EXTRACT "근거 발췌형(첫·끝 어절)" answerFormat="SHORT"(l.415,418), KO_NS_COND "조건 제시형 서술형" answerFormat="ESSAY"(l.502,505), KO_NS_CLOZE "작품 암기(빈칸·단답)" answerFormat="SHORT"(l.440,443). 나머지 KO 35종은 전부 answerFormat="MC5".**
  - 근거: `src/lib/korean/types/KO_NS_EXTRACT.ts:415-418; KO_NS_COND.ts:502-505; KO_NS_CLOZE.ts:440-443`
  - 실제 문구: 근거 발췌형(첫·끝 어절) / 조건 제시형 서술형 / 작품 암기(빈칸·단답)
- **KO 서답형 3종 설명(그대로). EXTRACT="본문에서 근거 문장·어구를 verbatim 발췌해 첫·끝 어절 또는 지정 어절 수로 답하는 내신 서답형 — 정답 유일성 게이트로 채점 시비 차단"(l.431) / COND="<조건>(내용+형식 요소) 충족 서술 + 모범답안·인정답안·채점기준표 동시 산출 — 조건↔루브릭 정합을 결정론 검증하는 내신 서답형 시그니처"(l.518) / CLOZE="내신 전용 작품 암기형 서답형 — 원문 발췌의 빈칸 복원(BLANK) 또는 지시 어구로 시어·구절 찾아 쓰기(FIND), 원문 완전 일치 채점"(l.454)**
  - 근거: `src/lib/korean/types/KO_NS_EXTRACT.ts:431; KO_NS_COND.ts:518; KO_NS_CLOZE.ts:454`
- **KO 유형 그룹은 QUESTION_TYPE_GROUPS(영어)에 절대 병합하지 않고 QUESTION_TYPE_GROUPS_KO 로 분리한다. 이유가 코드 주석에 명시: 영어 표면들이 그룹 전체를 무조건 렌더하기 때문에 병합 시 영어 지문 UI에 국어 유형이 노출되는 회귀가 생긴다. 소비처(generation-config-panel)가 subject 게이트(passageSubject === "KOREAN")일 때만 KO 그룹을 쓴다.**
  - 근거: `src/lib/question-type-ui.ts:351-372; src/app/(director)/director/workbench/generate/generation-config-panel.tsx:155-156`
- **생성 UI의 유형 선택은 '체크박스 그리드'가 아니라 [카테고리 아코디언 카드 → 1열(모바일)/2열(lg) 타일 그리드 → 타일마다 −/숫자/+ 스테퍼]이다. 그리드는 className="grid grid-cols-1 gap-2 lg:grid-cols-2" + data-type-tile-grid, 카드는 "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm", 그룹 헤더는 h-10 + bg-slate-50/80 + border-b border-slate-200.**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel.tsx:929-969`
- **카테고리 렌더 순서는 고정 8그룹(GROUP_ORDER): 수능 → 내신 → 어휘 → 국어 독서 → 국어 문학 → 국어 문법 → 국어 화법·작문·매체 → 국어 서답형. 헤더 표기(GROUP_LABELS)는 수능→"수능·모의고사 객관식", 내신→"내신 서술형", 어휘→"어휘", 국어 서답형→"국어 내신 서답형". 드래그 정렬(typeOrder)은 그룹 내부에만 적용된다.**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel-parts/constants.ts:18-37`
  - 실제 문구: 수능·모의고사 객관식 / 내신 서술형 / 어휘 / 국어 독서 / 국어 문학 / 국어 문법 / 국어 화법·작문·매체 / 국어 내신 서답형
- **카테고리 닷 색(범례와 유형 목록 공통): 국어* = bg-indigo-400, 수능* = bg-blue-400, 내신* = bg-emerald-400, 어휘* = bg-amber-400, 그 외 = bg-slate-300. 닷은 h-2 w-2 rounded-full.**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel.tsx:746-753, 940-943`
- **유형 타일은 드래그 정렬(GripVertical 손잡이) 지원, 같은 카테고리 안에서만 재배치 가능하고 정렬은 localStorage 키 "smoat.workbench.questions.generate.typeOrder.v1"(국어는 뒤에 ".ko" 접미)에 영속된다. 그룹 접힘은 "smoat.workbench.questions.generate.groupCollapsed.v1".**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel-parts/constants.ts:8-13; generation-config-panel.tsx:157-159, 1028-1037`
- **+ 버튼을 누르면 문항 수 증가와 동시에 그 유형의 세부설정 팝오버가 자동으로 펼쳐진다(setExpandedTypeId(item.id)). 주석: "문항 수를 늘리면 세부 설정(난이도 등)을 바로 만질 수 있도록 토글을 자동으로 펼친다."**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel.tsx:1162-1176`
- **문장 수가 부족한 지문에서는 문장삽입 유형 타일이 비활성 + "문장 부족" 배지로 표시되고 툴팁 문구는 `이 지문은 문장이 적어 문장삽입에 적합하지 않아요 (최소 ${sentenceInsertRequiredSentences}문장 필요).` 이다.**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel.tsx:1118-1125`
  - 실제 문구: 문장 부족 / 이 지문은 문장이 적어 문장삽입에 적합하지 않아요 (최소 N문장 필요).
- **타일에 '포인트 짚어주기' 진입점이 상주한다. 포인트 0개면 Crosshair 아이콘 버튼(툴팁 "포인트 짚어주기 — 지문에서 출제 포인트를 직접 지정"), 1개 이상이면 파란 배지 "포인트 {N}"(bg-blue-50 text-blue-700).**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel-parts/type-numeric-detail.tsx:1629-1667`
  - 실제 문구: 포인트 짚어주기 — 지문에서 출제 포인트를 직접 지정 / 포인트 3
- **생성 모드 세그먼트는 2개: "유형 지정"(Settings2 아이콘, mode=manual)과 세트 모드. 세트 모드 라벨은 국어 패널이면 "세트 생성"(Layers), 영어면 FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS 가 켜졌을 때만 "장문 세트"(FileText).**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel.tsx:832-874`
  - 실제 문구: 유형 지정 / 세트 생성 / 장문 세트
- **유형을 하나도 안 고른 상태의 안내 문구는 "+ 를 눌러 문제 수를 더하세요.", 고른 뒤 요약 바는 "총 N문제 · M개 유형" + 오른쪽 "초기화" 버튼이다.**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel.tsx:876-901`
  - 실제 문구: + 를 눌러 문제 수를 더하세요. / 총 12문제 · 5개 유형 / 초기화
- **유형별 크레딧 단가는 유형별 차등이 아니라 '어휘 3종 vs 나머지' 2단이다. VOCAB_GENERATION_TYPE_IDS = {CONTEXT_MEANING, SYNONYM, ANTONYM} 은 QUESTION_GEN_VOCAB(1크레딧), 그 외 모든 유형은 QUESTION_GEN_SINGLE(2크레딧). 총액 = 선택 지문 수 × Σ(단가 × 문항 수).**
  - 근거: `src/lib/credit-costs.ts:7-8; src/app/(director)/director/workbench/generate/generation-config-panel-parts/constants.ts:3-7; type-numeric-detail.tsx:1941-1953`
- **국어(KO) 세트 생성도 문항 단가는 QUESTION_GEN_SINGLE(2크레딧)을 쓴다. UI 고지 문구: "크레딧은 세트 문항 수 × 문항 단가 기준으로 재시도 여유분(2회분)까지 선차감되고, 사용하지 않은 재시도분은 생성 완료 시 자동 환불됩니다."**
  - 근거: `src/app/api/workbench/ai-jobs/korean-question-set/route.ts:110; src/app/(director)/director/workbench/generate/generation-config-panel-parts/ko-set-builder.tsx:288-291`
  - 실제 문구: 크레딧은 세트 문항 수 × 문항 단가 기준으로 재시도 여유분(2회분)까지 선차감되고, 사용하지 않은 재시도분은 생성 완료 시 자동 환불됩니다.
- **국어 세트 프리셋은 정확히 3종. "수능 독서 4문항"(ko-suneung-reading, 슬롯 KO_RD_FACT → KO_RD_INFER|KO_RD_CONCEPT → KO_RD_APPLY[3점] → KO_RD_VOCAB, minChars 600/minEojeol 150), "수능 문학 4문항"(ko-suneung-literature, EXPR|NARR → FACT|PHRASE → MOTIF|SPEECH|PSYCH → BOGI[3점], 400/100), "내신 혼합 4문항"(ko-naesin-mixed, 객관식 3 + KO_NS_COND|KO_NS_EXTRACT 1, 350/90).**
  - 근거: `src/lib/korean/sets/presets.ts:53-99`
  - 실제 문구: 수능 독서 4문항 — 내용 일치 → 추론(또는 ㉠㉡ 개념 비교) → <보기> 사례 적용[3점] → 어휘 ⓐ~ⓔ — 수능 독서 단일지문 세트. / 수능 문학 4문항 — 표현/서술상 특징(갈래 따라) → 내용 이해·구절 의미 → 소재·말하기·심리 → <보기> 감상[3점] — 수능 문학 세트. / 내신 혼합 4문항 — 갈래 호환 객관식 3문항 + 서답형(조건 서술 또는 근거 발췌) 1문항 — 내신 지필 혼합 세트.
- **영어 장문 세트 프리셋은 1티어 10종: 독해 핵심 2문항, 독해 종합 3문항, 어휘·의미 세트, 요약 독해 3문항, 수능 43~45형, 문장 삽입 3문항, 구조 독해 고난도, 빈칸 추론 3문항, 어법 판단 3문항, 어법 수정 3문항.**
  - 근거: `src/lib/question-sets/presets.ts:67-225`
  - 실제 문구: 독해 핵심 2문항 / 독해 종합 3문항 / 어휘·의미 세트 / 요약 독해 3문항 / 수능 43~45형 / 문장 삽입 3문항 / 구조 독해 고난도 / 빈칸 추론 3문항 / 어법 판단 3문항 / 어법 수정 3문항
- **KO 유형 세부설정 팝오버는 전 유형 공통으로 '출제 기준' 2택(수능형/내신형)을 노출하며 힌트 문구는 각각 "평가원 발문·재진술 위주", "교과 밀착·지엽 변별 허용". 3점급 고난도(needsSolverGate) 유형에는 안내 배너가 붙는다.**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel-parts/ko-type-detail.tsx:41-107`
  - 실제 문구: 출제 기준 / 수능형 · 평가원 발문·재진술 위주 / 내신형 · 교과 밀착·지엽 변별 허용 / 3점급 고난도 유형 — 생성 후 독립 솔버 검증을 거치며, 출제 전 교사 검수를 권장합니다.
- **난이도는 전역이 아니라 유형별로만 설정한다(전역 세그먼트는 제거됨). 팝오버 섹션 제목은 "난이도 · 이 유형만"이고, 기본 난이도와 다르면 타일에 h-1.5 w-1.5 컬러 닷(BASIC bg-blue-500 / INTERMEDIATE bg-amber-500 / KILLER bg-red-500, 툴팁 "이 유형만 개별 난이도")이 붙는다.**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel.tsx:912-913, 996-1003, 1111-1117; type-numeric-detail.tsx:1583-1584`
  - 실제 문구: 난이도 · 이 유형만 / 이 유형만 개별 난이도
- **난이도 3단계 라벨·색은 전 화면 공통(SOT): 기본=bg-blue-50 text-blue-700(닷 bg-blue-500), 중급=bg-amber-50 text-amber-700(닷 bg-amber-500), 킬러=bg-red-50 text-red-700(닷 bg-red-500). 카드 배지형은 border-blue-200 bg-blue-50 text-blue-700 / border-amber-200 bg-amber-50 text-amber-700 / border-red-200 bg-red-50 text-red-700.**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel-parts/constants.ts:41-45; src/components/workbench/question-card-constants.ts:46-62`
  - 실제 문구: 기본 / 중급 / 킬러
- **문제은행 필터 UI는 별도 표면으로, 체크박스 트리(카테고리 헤더 체크박스 + indeterminate, 하위 유형 체크박스) 구조다. 3 카테고리 라벨은 "객관식"(15종, TOPIC_MAIN_IDEA 포함), "주관식/서술형"(8종), "어휘"(3종). 트리거 라벨은 "전체 유형" 또는 "N개 유형", 푸터는 "전체 표시 중"/"N개 선택" + "적용".**
  - 근거: `src/components/workbench/question-type-filter.tsx:80-129, 222-226, 250-358`
  - 실제 문구: 문제 유형 필터 / 전체 해제 / 전체 유형 / 전체 표시 중 / 적용 / 객관식 / 주관식/서술형 / 어휘
- **국어 문제은행 필터는 pseudo-type `KO:{group}` 5개(국어 독서/문학/문법/화법·작문·매체/서답형)로 레지스트리에서 파생 생성된다. 실제 Question.type 이 아니므로 필터 커밋 시 type 파라미터로 보내면 안 된다는 주석이 명시돼 있다.**
  - 근거: `src/components/workbench/question-type-filter.tsx:61-77`
- **학습(듀오링고형) 서비스는 완전히 별개의 23종 카탈로그를 쓴다. 4 카테고리 = 어휘 9종 / 해석 5종 / 문법 5종 / 이해 4종. 어휘: 단어 뜻 (영→한), 단어 뜻 (한→영), 빈칸 채우기, 매칭, 스펠링, 유의어/반의어, 영영풀이, 연어, 혼동 단어. 해석: 해석 고르기, 영문 고르기, 단어 배열, 핵심 표현, 끊어읽기. 문법: 문법 고르기, 오류 찾기, 오류 수정, 문장 전환, 문법 O/X. 이해: O/X, 내용 이해, 지문 빈칸, 연결어.**
  - 근거: `src/lib/learning-constants.ts:44-49, 52-83, 113-137`
  - 실제 문구: 단어 뜻 (영→한) / 단어 뜻 (한→영) / 빈칸 채우기 / 매칭 / 스펠링 / 유의어/반의어 / 영영풀이 / 연어 / 혼동 단어 / 해석 고르기 / 영문 고르기 / 단어 배열 / 핵심 표현 / 끊어읽기 / 문법 고르기 / 오류 찾기 / 오류 수정 / 문장 전환 / 문법 O/X / O/X / 내용 이해 / 지문 빈칸 / 연결어
- **학습 23종은 인터랙션 패턴이 유형별로 선언돼 있다(SUBTYPE_TO_INTERACTION): FOUR_CHOICE / THREE_CHOICE / MATCHING / TEXT_INPUT / WORD_BANK / TAP_TEXT / BINARY_CHOICE. 예: WORD_MATCH=MATCHING, WORD_SPELL=TEXT_INPUT, WORD_ARRANGE=WORD_BANK, ERROR_FIND=TAP_TEXT, GRAM_BINARY=BINARY_CHOICE.**
  - 근거: `src/lib/learning-constants.ts:86-110`
- **학습 생성 단가·규모: LEARNING_QUESTION_GEN = 2크레딧, 지문당 총 목표 300문제(4 카테고리 × 75), 세션당 15문제 × 카테고리당 5세션, 커스텀 생성 시 전체 유형 합산 최대 50개.**
  - 근거: `src/lib/credit-costs.ts:10; src/lib/learning-constants.ts:143-146, 254-264`
- **학습 생성 UI는 '자동 생성 / 유형 지정' 2탭 세그먼트이며, 자동은 "300문제 자동 채우기 (카테고리별 75개)" 버튼과 카테고리당 개수 조절 스테퍼(총 {N×4}개 표기)를 쓴다.**
  - 근거: `src/app/(director)/director/workbench/generate-learning/_components/learning-config-panel.tsx:114-196`
  - 실제 문구: 자동 생성 / 유형 지정 / 300문제 자동 채우기 (카테고리별 75개) / 총 300개 (4개 카테고리 × 75)
- **DB 레벨 Question.type 열거는 6종(QUESTION_TYPES): 객관식(MULTIPLE_CHOICE), 단답형(SHORT_ANSWER), 서술형(ESSAY), 빈칸 채우기(FILL_BLANK), 순서 배열(ORDERING), 어휘(VOCAB). 생성 UI에서 고르는 것은 이 type 이 아니라 subType(=유형 카탈로그)이다.**
  - 근거: `src/lib/constants.ts:103-110`
  - 실제 문구: 객관식 / 단답형 / 서술형 / 빈칸 채우기 / 순서 배열 / 어휘
- **[추론] 생성 CTA는 상태별 4가지 문구로 갈린다: 지문 미선택 "지문을 선택하세요", 유형 미선택 "유형을 선택하세요", 준비 완료 "N문제 생성" 또는 "K개 지문 × N문제 생성", 진행 중 "생성 중…". 오른쪽에 CreditCostChip(흰 반투명 pill)이 붙는다. — 문구·클래스는 코드 인용이나 실제 렌더 스크린샷은 미확인.**
  - 근거: `src/app/(director)/director/workbench/generate/generation-config-panel-parts/type-numeric-detail.tsx:1898-1923, 1971-2000`
  - 실제 문구: 지문을 선택하세요 / 유형을 선택하세요 / 12문제 생성 / 3개 지문 × 12문제 생성 / 생성 중…

### 덱 재현 대상 (visualSpec)

#### 유형 선택 카탈로그 패널 (카테고리 아코디언 + 2열 타일 그리드 + 스테퍼)

- 왜: 이 덱의 심장. '63종 유형을 골라 담는다'는 SMOAT의 핵심 가치를 한 화면으로 증명하며, 슬라이드에서 클릭·스테퍼·아코디언을 그대로 인터랙티브 재현할 수 있다.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/generate/generation-config-panel.tsx:915-1229`
- 시각 스펙:

```
[루트] 배경 white, 좌우 패딩 px-4 py-3, 섹션 space-y-3. 섹션 제목: block px-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500, 텍스트 '문제 유형'. 그 아래 mt-1.5 space-y-2 로 카테고리 카드들.

[카테고리 카드] div.overflow-hidden.rounded-xl.border.border-slate-200.bg-white.shadow-sm
  · 헤더 button: flex h-10 w-full items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3 text-left, hover:bg-slate-100/80
    - 좌측 닷: span h-2 w-2 shrink-0 rounded-full. 색: 수능→bg-blue-400, 내신→bg-emerald-400, 어휘→bg-amber-400, 국어*→bg-indigo-400
    - 라벨: span text-[12px] font-bold text-slate-700. 텍스트는 순서대로 '수능·모의고사 객관식'(14), '내신 서술형'(8), '어휘'(3), '국어 독서'(8), '국어 문학'(9), '국어 문법'(8), '국어 화법·작문·매체'(10), '국어 내신 서답형'(3)
    - 선택 배지(선택수>0일 때만): ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200, 텍스트 '선택 3'
    - 총 개수: span text-[10px] font-medium tabular-nums text-slate-300, 텍스트 '14'
    - 우측 ChevronDown: ml-auto h-4 w-4 text-slate-400, transition-transform duration-300, 접힘 상태에서 class '-rotate-90'
  · 본문: div.p-2 안에 div.grid.grid-cols-1.gap-2.lg:grid-cols-2 (모바일 1열, lg 이상 2열)

[유형 타일] div.relative.flex.items-center.gap-1.overflow-hidden.rounded-lg.border.px-1.py-1.transition-colors
  · 기본: border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80
  · 선택됨(count>0): border-blue-300 bg-blue-50/70
  · 팝오버 펼침: border-blue-300 bg-blue-50/40 + rounded-b-none (아래 팝오버와 이어붙음)
  · 드래그 오버: border-blue-300 bg-blue-100 ring-1 ring-inset ring-blue-300 / 드래그 중 원본: opacity-50
  · 구성(좌→우): ①GripVertical 손잡이 button h-7 w-3.5 cursor-grab text-slate-300 hover:text-slate-500(아이콘 h-3.5 w-3.5) ②유형명 button flex min-w-0 flex-1, span truncate text-[12px]; 선택 시 font-bold text-slate-800, 미선택 font-semibold text-slate-600 ③(선택+개별난이도 시) 닷 h-1.5 w-1.5 rounded-full bg-blue-500|bg-amber-500|bg-red-500 ④포인트 진입: 0개면 Crosshair 아이콘 버튼 h-7 w-6 rounded text-slate-300 hover:bg-blue-50 hover:text-blue-600, 1개↑면 배지 inline-flex h-[22px] rounded-md bg-blue-50 px-1.5 text-[10px] font-bold tabular-nums text-blue-700, 텍스트 '포인트 3' ⑤스테퍼: div.flex.items-center.overflow-hidden.rounded-lg.border.border-slate-200.bg-white — [−]버튼 h-7 w-7 text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:text-slate-200 / 숫자 span h-7 w-7 border-x border-slate-200 text-[12.5px] font-bold tabular-nums, >0이면 bg-blue-50/50 text-blue-700, 0이면 bg-slate-50/60 text-slate-300 / [+]버튼 동일 스펙 ⑥펼치기 토글 button h-7 w-6 rounded text-blue-300 hover:bg-blue-50 hover:text-blue-500, ChevronDown size-4 transition-transform duration-300, 펼침 시 rotate-180

[모션] ①아코디언: 헤더 클릭 → 본문 height 애니메이션(Collapsible), 셰브론 -rotate-90 ↔ 0deg, duration-300 ②[+] 클릭 → 카운트 즉시 증가 + 해당 타일의 세부설정 팝오버가 '자동으로' 펼쳐짐(제품 실제 동작) ③타일 드래그: 손잡이 잡고 같은 카테고리 안에서만 재정렬, 드롭 타겟은 bg-blue-100 ring-blue-300 로 하이라이트

[슬라이드에 넣을 실제 유형명 63개]
수능·모의고사 객관식(14): 빈칸 추론 / 어법 판단 / 네모 어법 / 어휘 적절성 / 글의 순서 / 문장 삽입 / 주제 추론 / 요지·주장 / 제목 추론 / 함축 의미 추론 / 지칭 추론 / 내용 일치 / 요약문 완성(객관식) / 무관한 문장
내신 서술형(8): 조건부 영작 / 문장 전환 / 핵심 표현 빈칸 / 요약문 완성 / 요약문 영작 / 배열 영작 / 주제문 영작 / 문법 오류 수정
어휘(3): 문맥 속 의미 / 동의어 / 반의어
국어 독서(8): 내용 일치(사실적 이해) / 전개 방식·논지 구조 / 추론·이유 도출 / 개념 비교(㉠㉡) / 비판적 이해(관점 평가) / <보기> 사례 적용(3점) / 어휘 문맥적 의미(ⓐ~ⓔ) / 독서론(읽기 이론) 이해·메모 매핑
국어 문학(9): 표현상 특징(운문) / 서술상 특징(산문) / 작품 내용·인물·사건 이해 / 화자·인물의 심리·태도 / 구절·시어의 의미(㉠~㉤) / 〈보기〉 외적 준거 감상 / 작품 간 공통점·차이점 / 소재·배경의 기능 / 말하기 방식·대화 양상([A]/[B])
국어 문법(8): 문법 지문 이해(지문형 세트) / 음운 변동(사례 분류) / 형태소·단어 형성(㉠~㉢ 사례) / 문장 구조(안긴문장·성분) / 문법 요소(높임·시제·피사동) / 어문 규정 적용(맞춤법·표준발음) / 문법 <보기> 사례 적용(3점) / 국어사·중세 국어
국어 화법·작문·매체(10): 발표 말하기 방식·표현 전략 / 발표 계획 반영 여부 / 청중 반응 분석 / 대화 발화 기능(㉠~㉤) / 토론(입론·반대 신문·반론) / 글쓰기 계획 반영 / 글쓰기 방식·내용 조직 / 조건 충족 생성형(작문) / 고쳐쓰기 / 매체 언어 표현(문법 융합)
국어 내신 서답형(3): 근거 발췌형(첫·끝 어절) / 조건 제시형 서술형 / 작품 암기(빈칸·단답)
```

#### 유형 세부설정 팝오버 (타일 아래에 이어붙는 드로어)

- 왜: '유형만 고르는 게 아니라 유형마다 출제 조건을 조율한다'는 깊이를 보여주는 자산. 타일과 시각적으로 한 몸으로 붙는 디테일이 인상적이라 슬라이드 인터랙션으로 강력하다.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/generate/generation-config-panel.tsx:1194-1219 + generation-config-panel-parts/ko-type-detail.tsx:39-108`
- 시각 스펙:

```
[컨테이너] Radix PopoverContent, align='start', sideOffset=0 → 타일 바로 아래 딱 붙음. width = var(--radix-popover-trigger-width) (= 타일 폭과 정확히 동일). class: rounded-t-none border border-t-0 border-blue-300 p-0 shadow-lg, max-h lg:max-h-[60vh], overflow-y-auto. 위 타일은 rounded-b-none 이 되어 두 요소가 하나의 카드처럼 이어짐.
[헤더] div flex h-8 lg:h-9 items-center gap-2 border-b border-slate-200 bg-white px-3 — Settings2 아이콘 h-3.5 w-3.5 text-blue-500 + span min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800, 텍스트 '{유형명} 세부 설정' (예: '빈칸 추론 세부 설정')
[본문] div bg-slate-100 px-2 lg:px-3 pb-2 lg:pb-3 pt-1.5 lg:pt-2.5, space-y-1.5 lg:space-y-2.5. 그 안에 흰 카드 2장: 각각 rounded-lg border border-slate-200 bg-white (첫 카드 px-2 py-1.5 lg:px-2.5 lg:py-2, 둘째 카드 px-2 py-1.5 lg:px-3 lg:py-2.5)
  · 카드1 = 난이도. 섹션 제목 span text-[11px] font-bold uppercase tracking-wider text-slate-500, 텍스트 '난이도 · 이 유형만'. 3분할 세그먼트: 기본(bg-blue-50 text-blue-700) / 중급(bg-amber-50 text-amber-700) / 킬러(bg-red-50 text-red-700), 비활성은 text-slate-400
  · 카드2 = 유형별 옵션. 국어 유형이면 최상단에 '출제 기준' 제목(text-[11px] font-bold uppercase tracking-wider text-slate-500) + grid grid-cols-2 gap-2 로 2개 버튼: rounded-lg border px-2.5 py-1.5 text-left, 활성 border-blue-300 bg-blue-50 text-blue-800 / 비활성 border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50. 버튼 안 2줄: 제목 span text-[12px] font-bold ('수능형' / '내신형'), 힌트 span text-[10px] leading-tight (활성 text-blue-600/80, 비활성 text-slate-400) — '평가원 발문·재진술 위주' / '교과 밀착·지엽 변별 허용'
  · 3점급 고난도(needsSolverGate) 유형이면 하단에 안내 p: flex items-start gap-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-[10.5px] leading-relaxed text-slate-500 + ShieldCheck 아이콘 h-3.5 w-3.5 text-slate-400. 텍스트 그대로: '3점급 고난도 유형 — 생성 후 독립 솔버 검증을 거치며, 출제 전 교사 검수를 권장합니다.'
[모션] 셰브론 rotate-180(duration-300)과 동시에 팝오버가 타일 하단 경계에서 아래로 열림. 열릴 때 border-blue-300 이 타일-팝오버를 하나의 파란 테두리 블록으로 잇는 것이 핵심 인상.
```

#### 생성 모드 세그먼트 + 총 문제 수 요약 바

- 왜: '유형 지정 vs 세트 생성' 이라는 제품의 두 갈래 출제 모드를 한 컷으로 설명. 카운터가 실시간으로 오르는 인터랙션이 슬라이드에서 즉시 먹힌다.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/generate/generation-config-panel.tsx:826-902`
- 시각 스펙:

```
[세그먼트] div flex h-9 rounded-lg bg-slate-100 p-0.5. 각 버튼 flex flex-1 items-center justify-center gap-1.5 rounded-[6px] text-[12.5px] transition-all duration-150 — 활성: bg-white font-bold text-blue-700 shadow-sm / 비활성: font-semibold text-slate-500 hover:text-slate-700. 아이콘 h-3.5 w-3.5, 활성 text-blue-600 비활성 text-slate-400. 라벨: 좌 '유형 지정'(Settings2 아이콘), 우 '세트 생성'(Layers, 국어) 또는 '장문 세트'(FileText, 영어 플래그 ON).
[요약 바 — 유형 1개 이상 선택] div mt-2 flex h-9 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-1.5. 좌측 span text-[12px] font-semibold text-slate-700: '총 ' + strong(font-bold text-slate-900) 숫자 + '문제' + span(ml-1 font-medium text-slate-500) '· N개 유형'. 우측 '초기화' button h-6 rounded-md px-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700.
[요약 바 — 아무것도 선택 안 함] div mt-2 flex items-center gap-2 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px] font-semibold text-blue-700, Plus 아이콘 h-3.5 w-3.5, 텍스트 '+ 를 눌러 문제 수를 더하세요.'
[모션] 유형 타일의 [+]를 누를 때마다 '총 N문제' 숫자가 tabular-nums 로 카운트업, 0→1 전환 시 점선 파란 안내 박스가 실선 슬레이트 요약 바로 크로스페이드.
```

#### 생성 CTA 버튼 + 크레딧 칩

- 왜: '유형 × 지문 수 = 크레딧'이라는 과금 모델을 한 버튼이 말해준다. 상태 4단계(지문 미선택→유형 미선택→준비→생성중)를 슬라이드 스텝으로 그대로 밟으면 데모가 된다.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/generate/generation-config-panel-parts/type-numeric-detail.tsx:1862-1927, 1937-2005`
- 시각 스펙:

```
[컨테이너] div px-4 py-3 border-t border-slate-100 bg-white shrink-0.
[버튼] h-12 w-full min-w-0 rounded-xl px-3 text-[14px] font-bold whitespace-normal transition-all duration-200. 활성: bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200/50 hover:shadow-lg hover:shadow-blue-200/60 (텍스트 흰색). 비활성: bg-slate-200 text-slate-400 cursor-not-allowed.
[상태별 내용 — 실제 문구 그대로]
  ① 지문 미선택: FileText 아이콘 w-4.5 h-4.5 + '지문을 선택하세요'
  ② 유형 미선택: Target 아이콘 + '유형을 선택하세요'
  ③ 준비 완료: Cpu 아이콘 + '12문제 생성' (지문 2개 이상이면 '3개 지문 × 12문제 생성')
  ④ 생성 중: Cpu 아이콘 animate-pulse + '생성 중…' (버튼 disabled)
[크레딧 칩] 활성 + 비용>0 일 때만 버튼 오른쪽에 CreditCostChip: ml-1 shrink-0 gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] text-white. 값 = 선택 지문 수 × Σ(유형 단가 × 문항 수), 단가는 어휘 3종(문맥 속 의미·동의어·반의어)=1, 그 외 전 유형=2.
[부가 안내 박스(조건부)] 버튼 위 p: mb-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-slate-500. 문구 그대로: '수정·범위 지정된 N개 지문은 생성 시 ‘변형본’ 지문으로 저장된 뒤 출제됩니다. 원본 지문은 그대로 보존돼요.' / '워크스페이스 지문과 ‘내 지문’에서 체크한 N개 지문을 함께 생성합니다. 이미 워크스페이스에 있는 지문은 중복 생성하지 않아요.'
```

#### 국어 세트 프리셋 빌더 (수능 독서/문학/내신 혼합)

- 왜: '문항 하나'가 아니라 '수능 4문항 세트'를 통째로 뽑는다는, SMOAT 국어의 최대 차별점. 프리셋 카드가 슬롯 체인을 그대로 문자열로 보여줘 슬라이드 카피가 이미 완성돼 있다.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/generate/generation-config-panel-parts/ko-set-builder.tsx:129-293`
- 시각 스펙:

```
[루트] div flex flex-col gap-3 px-4 py-3.
[난이도 행] flex items-center gap-3 — 라벨 span w-14 text-[11px] font-bold uppercase tracking-wider text-slate-500 '난이도' + 세그먼트 div flex h-8 flex-1 rounded-lg bg-slate-100 p-0.5, 버튼 flex-1 rounded-[6px] text-[12px], 활성 font-bold shadow-sm + (기본 bg-blue-50 text-blue-700 / 중급 bg-amber-50 text-amber-700 / 킬러 bg-red-50 text-red-700), 비활성 font-semibold text-slate-400.
[프리셋 카드 컨테이너] div overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm. 헤더 flex h-10 items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3: 닷 h-2 w-2 rounded-full bg-indigo-400 + span text-[12px] font-bold text-slate-700 '국어 세트 프리셋' + (선택>0) 배지 'rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200' 텍스트 '선택 1' + (총합>0) 배지 'rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-blue-600 ring-1 ring-inset ring-blue-100' 텍스트 '2세트' + span text-[10px] tabular-nums text-slate-300 '3' + Layers 아이콘 ml-auto h-3.5 w-3.5 text-slate-400.
[본문] div.p-2 > div.grid.grid-cols-2.gap-2.
[프리셋 타일] div flex flex-col overflow-hidden rounded-lg border — 기본 border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80, 선택됨 border-blue-300 bg-blue-50/70, 적용불가 border-slate-200 bg-slate-50/70 opacity-60.
  · 1행: FileText 아이콘 h-3.5 w-3.5 text-slate-300 + 제목 truncate text-[12px](선택 시 font-bold text-slate-800, 아니면 font-semibold text-slate-600) + 우측 배지 'rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500' 텍스트 '4문항'
  · 2행: div mt-1 min-h-[26px] px-1.5 text-[10px] font-medium leading-snug text-slate-500, line-clamp-2 — 슬롯 체인 문자열(예: '내용 일치(사실적 이해) · 추론·이유 도출 · <보기> 사례 적용(3점)[3점] · 어휘 문맥적 의미(ⓐ~ⓔ)'). 적용 불가면 사유 문구 대체.
  · 3행: 좌 span text-[10px] font-semibold text-slate-400 '세트 수'(불가면 '적용 불가') + 우 스테퍼(유형 타일과 동일: h-7 w-7 −/숫자/+, 숫자 border-x border-slate-200, 활성 bg-blue-50/50 text-blue-700, 비활성 bg-slate-50/60 text-slate-300)
[하단 캡션 2줄] p text-[11px] leading-relaxed text-slate-400 = 선택된 프리셋 description. p text-[10.5px] leading-relaxed text-slate-400 = '크레딧은 세트 문항 수 × 문항 단가 기준으로 재시도 여유분(2회분)까지 선차감되고, 사용하지 않은 재시도분은 생성 완료 시 자동 환불됩니다.'
[프리셋 3종 실제 문구]
  · 수능 독서 4문항 — '내용 일치 → 추론(또는 ㉠㉡ 개념 비교) → <보기> 사례 적용[3점] → 어휘 ⓐ~ⓔ — 수능 독서 단일지문 세트.' (최소 600자/150어절)
  · 수능 문학 4문항 — '표현/서술상 특징(갈래 따라) → 내용 이해·구절 의미 → 소재·말하기·심리 → <보기> 감상[3점] — 수능 문학 세트.' (400자/100어절)
  · 내신 혼합 4문항 — '갈래 호환 객관식 3문항 + 서답형(조건 서술 또는 근거 발췌) 1문항 — 내신 지필 혼합 세트.' (350자/90어절)
[모션] 지문 갈래(KO_KIND)에 안 맞는 프리셋은 opacity-60 으로 죽고 hover 시 사유 툴팁. 선택 시 카드가 파랑으로 물들며 하단 캡션이 해당 프리셋 설명으로 크로스페이드.
```

#### 영어 장문 세트 프리셋 10종 리스트

- 왜: 국어 세트 3종과 대칭으로 '영어도 세트로 뽑는다'를 보여주는 카피 자산. 슬라이드 표/카드 10장으로 바로 전개 가능.
- 소스: `d:/Desktop/2026project/nara/src/lib/question-sets/presets.ts:67-225`
- 시각 스펙:

```
슬라이드 표 또는 2×5 카드 그리드. 각 카드: 제목(text-[12px] font-bold text-slate-800) + 설명(text-[10px] text-slate-500 line-clamp-2) + 우상단 문항수 배지(rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500). 실제 문구 그대로:
1) 독해 핵심 2문항 — '요지/주장 + 내용 일치 — 지문을 변형하지 않는 가장 기본 세트. 일반·짧은 지문에 적합.'
2) 독해 종합 3문항 — '제목 + 지칭 + 내용 일치 — 구조 변형 없는 종합 독해 세트.'
3) 어휘·의미 세트 — '동의어 + 문맥 속 의미 — 밑줄 어휘 집중 세트(서로 다른 단어).'
4) 요약 독해 3문항 — '요약문 완성 + 제목 + 내용 일치 — 중심 내용 압축과 세부 확인을 함께 묻는 세트.'
5) 수능 43~45형 — '글의 순서 + 지칭 + 내용 일치 — 정통 장문 세트(긴 지문 전용).'
6) 문장 삽입 3문항 — '문장 삽입 + 지칭 + 내용 일치 — 연결 단서와 세부 독해를 함께 확인하는 구조 세트.'
7) 구조 독해 고난도 — '문장 삽입 + 제목 + 요지/주장 — 글의 전개와 중심 내용을 동시에 묻는 고난도 세트.'
8) 빈칸 추론 3문항 — '빈칸 추론 + 요지/주장 + 내용 일치 — 핵심 논리와 세부 근거를 함께 묻는 킬러형 세트.'
9) 어법 판단 3문항 — '어법 판단 + 지칭 + 내용 일치 — 문장 단위 어법과 지문 이해를 함께 점검하는 내신형 세트.'
10) 어법 수정 3문항 — '어법 수정 + 요지/주장 + 내용 일치 — 서술형 어법 수정과 독해 확인을 묶은 내신 고난도 세트.'
색 토큰은 유형 타일과 동일 팔레트 사용(선택 시 border-blue-300 bg-blue-50/70).
```

#### 문제은행 유형 필터 팝오버 (체크박스 트리)

- 왜: '뽑은 다음 찾는다'—문제은행 쪽 유형 카탈로그 소비 표면. 생성 UI(스테퍼)와 대비되는 체크박스 트리 형태라 슬라이드에서 두 UI를 나란히 보여주면 카탈로그가 전 제품을 관통함을 증명한다.
- 소스: `d:/Desktop/2026project/nara/src/components/workbench/question-type-filter.tsx:228-361`
- 시각 스펙:

```
[트리거 버튼] flex items-center gap-1.5 h-8 px-3 text-[12px] rounded-md border — 선택 있음: border-blue-300 bg-blue-50 text-blue-700 / 없음: border-slate-200 bg-white hover:bg-slate-50 text-slate-700. Filter 아이콘 w-3 h-3, 라벨 span font-medium max-w-[140px] truncate ('전체 유형' 또는 선택 2개 이하면 라벨 나열, 3개 이상이면 'N개 유형'), 선택 시 카운트 뱃지 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold, 끝에 ChevronDown w-3 h-3 opacity-50.
[팝오버] PopoverContent align='start' w-64 p-0.
  · 헤더: flex items-center justify-between px-3 py-2 border-b border-slate-100 — span text-[12px] font-semibold text-slate-700 '문제 유형 필터' + button text-[11px] text-slate-400 hover:text-red-500 '전체 해제'
  · 본문: div max-h-[360px] overflow-y-auto py-1. 카테고리 헤더 행 flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-50 — ChevronRight/ChevronDown w-3 h-3 text-slate-400 + Checkbox(전체선택 시 checked, 일부면 indeterminate) + span text-[12px] font-semibold text-slate-800 flex-1 + 일부 선택 시 span text-[10px] text-blue-500 font-medium 'k/n'. 하위 항목 div.ml-5 안 label flex items-center gap-2 px-3 py-1 hover:bg-slate-50 rounded — Checkbox + span text-[12px], 선택 시 text-blue-700 font-medium, 아니면 text-slate-600.
  · 푸터: flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/50 — span text-[11px] text-slate-400 ('전체 표시 중' 또는 'N개 선택') + Button size=sm h-7 text-[11px] bg-blue-600 hover:bg-blue-700 '적용'
[카테고리 구성] '객관식'(15: 빈칸 추론/어법 판단/네모 어법/어휘 적절성/문장 삽입/글의 순서/주제 추론/요지/주장/주제/요지/제목 추론/함축 의미 추론/지칭 추론/내용 일치/요약문 완성(객관식)/무관한 문장), '주관식/서술형'(8), '어휘'(3). 국어 라우트에서는 'KO:국어 독서' 등 5개 그룹이 추가된다.
[모션] 카테고리 헤더 클릭 → 셰브론 회전 + 하위 목록 펼침, 헤더 체크박스는 부분 선택 시 indeterminate(가로 막대)로 표시.
```

#### 학습 서비스 23종 유형 카탈로그 (듀오링고형)

- 왜: '출제'와 별개로 '학습'에도 23종 카탈로그가 따로 존재한다는 사실이 SMOAT 규모감을 배가시킨다. 인터랙션 패턴(탭·매칭·워드뱅크)까지 선언돼 있어 슬라이드에서 미니 데모로 만들기 좋다.
- 소스: `d:/Desktop/2026project/nara/src/lib/learning-constants.ts:44-137`
- 시각 스펙:

```
4열 카테고리 컬럼 레이아웃(어휘 9 / 해석 5 / 문법 5 / 이해 4). 카테고리 헤더에 컬러 닷 + 이름: 어휘=emerald, 해석=blue, 문법=purple, 이해=amber (색 토큰은 SESSION_TYPES 의 color 값 emerald/blue/purple/amber 그대로, 아이콘은 Languages/BookOpen/Brain/Target). 각 항목은 pill: rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-600, 우측에 인터랙션 배지(text-[10px] text-slate-400).
[항목 — 실제 라벨 그대로 + 인터랙션]
어휘: 단어 뜻 (영→한)/FOUR_CHOICE · 단어 뜻 (한→영)/FOUR_CHOICE · 빈칸 채우기/THREE_CHOICE · 매칭/MATCHING · 스펠링/TEXT_INPUT · 유의어/반의어/THREE_CHOICE · 영영풀이/FOUR_CHOICE · 연어/THREE_CHOICE · 혼동 단어/THREE_CHOICE
해석: 해석 고르기/FOUR_CHOICE · 영문 고르기/FOUR_CHOICE · 단어 배열/WORD_BANK · 핵심 표현/THREE_CHOICE · 끊어읽기/WORD_BANK
문법: 문법 고르기/THREE_CHOICE · 오류 찾기/TAP_TEXT · 오류 수정/TEXT_INPUT · 문장 전환/TEXT_INPUT · 문법 O/X/BINARY_CHOICE
이해: O/X/BINARY_CHOICE · 내용 이해/FOUR_CHOICE · 지문 빈칸/THREE_CHOICE · 연결어/THREE_CHOICE
[숫자 카피] 지문 1편당 목표 300문제(4 카테고리 × 75), 세션당 15문제 × 카테고리당 5세션, 커스텀 생성 상한 50문제.
[모션] 카테고리별로 순차 stagger 등장 → 마지막에 '지문 1편 → 300문제' 큰 숫자 카운트업.
```


### 갭 / 미확인

- 각 KO 유형 meta 의 bestFor / outputUi / setSlot 배열은 일부만 확인했다(전 38종 전수 인용은 미완). 슬라이드에서 '유형별 출력 UI 구성요소'까지 쓰려면 KO_*.ts 각 파일의 meta.outputUi 를 추가로 훑어야 한다.
- 영어 유형의 세부설정(빈칸 개수·마커 개수·선지 개수 등) 숫자 스테퍼 UI 문구는 type-numeric-detail.tsx 안에 있으나 이번 정찰에서 라벨 전수를 인용하지 못했다(상수 이름만 확인: BLANK_INFERENCE_BLANK_COUNT_MIN/MAX, GRAMMAR_MARKER_COUNT_*, SUMMARY_COMPLETE_MC_BLANK_COUNT_* 등, generation-config-panel.tsx:30-74).
- 커스텀 유형(src/lib/custom-question-types/*)의 강사 정의형 유형이 생성 UI 어디에 어떤 모습으로 노출되는지 미확인. TYPE 라벨 'CUSTOM'/'CUSTOM_LAYOUT' → '커스텀' 만 확인됨(question-type-filter.tsx:55-56).
- grammar-drill / md-qgen / suneung-wanseong / korean-exam-passages 등 별도 라이브러리에 독립 유형 카탈로그가 더 있는지 확인하지 못했다.
- 유형별 크레딧 '차등'은 어휘 3종(1크레딧) vs 나머지(2크레딧) 2단만 확인. 국어 38종·서술형 8종에 별도 단가가 붙는지는 코드상 발견하지 못했다(전부 QUESTION_GEN_SINGLE=2로 보임).
- 실제 화면 스크린샷/렌더 결과는 확인하지 않았다(정적 코드 판독만). 실제 여백·폰트 렌더링은 브라우저 확인 필요.
- genMode='auto'(자동 출제) 경로의 유형 선택 UI와 AUTO_GEN_BATCH(2크레딧) 화면은 이번 정찰 범위 밖이다.


---

## [각도 I] 자체 어법 드릴 + 크레딧/쿠폰 시스템 — 세미나에서 "실물 그대로" 재현 가능한 시각/문구 스펙 정찰

### 관측 사실

- **어법 드릴 커리큘럼은 4개 PART로 구성된다. PART 0 「기초 골격」(b01~b07, 7유닛), PART 1 「골격기」(u01~u05), PART 2 「연결기」(u06~u09), PART 3 「정밀기」(u10~u12). 각 PART는 tagline(한 줄 카피)을 가진다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/grammar-drill/curriculum.ts:24-49`
  - 실제 문구: 기초 골격 / 문장이 어떻게 생겼는가 — 초·중등 도입 문법의 전 과정입니다 / 골격기 / 문장의 뼈대 판별 — 이 5개로 선지의 60%가 커버됩니다 / 연결기 / 절과 절의 관계 — 여기까지 오면 85%에 도달합니다 / 정밀기 / 형태·호응의 미세 판단 — 실전 방어선을 완성합니다
- **전체 유닛 수 = 기초(BASIC) 7 + 판별(JUDGE) 12 = 19유닛. 두 그룹의 해금은 완전히 독립(무회귀)이며, 각 그룹의 첫 유닛만 기본 해금되고 이전 유닛의 drillDoneAt이 찍히면 다음 유닛이 해금된다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/grammar-drill/curriculum.ts:254-269, d:/Desktop/2026project/nara/src/lib/grammar-drill/engine.ts:854-865`
- **미세개념(concept)은 총 75개. 기초 28개(b01-c1~b07-c4) + 판별 47개(u01-c1~u12-c4). 각 개념은 title + oneLiner(한 문장 규칙)을 가진다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/grammar-drill/curriculum.ts:271-824, d:/Desktop/2026project/nara/src/lib/grammar-drill/grammar-code-map.ts:5`
  - 실제 문구: u01-c1 본동사 하나 원칙 — 「한 문장(절)에는 본동사가 반드시 하나 있어야 합니다.」 / u02-c1 진짜 주어 찾기 — 수식어 괄호치기 — 「주어와 동사 사이의 전치사구·관계사절·분사구는 괄호로 묶고 무시합니다.」 / u06-c1 선행사 유무 판단 — 「앞에 선행사(명사)가 있으면 that/which, 없으면 what입니다.」
- **판별 유닛은 수능 출제 빈도(frequency 1~5 별점)와 frequencyNote(실측 근거 문구)를 함께 갖는다. U1이 최고 빈도(5)이고 화면에는 ★★★★★ 형태로 렌더된다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/grammar-drill/curriculum.ts:131-252, d:/Desktop/2026project/nara/src/app/g/unit/[unitId]/unit-hub-client.tsx:156-164`
  - 실제 문구: U1 동사 vs 준동사 / 이 절에 본동사가 있는가 / 30회분 선지 약 28~30회 — 사실상 매회 출제 / U2 주어-동사 수일치 / 동사의 수는 진짜 주어가 결정한다 / 30회분 선지 약 22~25회 — 수식어 삽입 패턴과 결합 출제 / U6 관계사 ① — what vs that/which / 선행사가 있는가 없는가 / 30회분 선지 약 15~17회 — 최근 6년 오답 선택 1위 함정
- **문항 형태는 6종. CHOICE(괄호 택일), OX(밑줄 OX), MULTI_UNDERLINE(미니 29번), PASSAGE(지문 실전), WRITE_FORM(서술형 변형), WRITE_CORRECT(서술형 수정). 6종 모두 (item, draft, setDraft, verdict) 동일 계약의 뷰로 렌더된다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/grammar-drill/item-views.tsx:19-33, d:/Desktop/2026project/nara/src/lib/grammar-drill/display.ts:9-16`
  - 실제 문구: 괄호 택일 / 밑줄 OX / 미니 29번 / 지문 실전 / 서술형 변형 / 서술형 수정
- **문항 난이도는 4단계이며 드릴 화면 우상단에 텍스트로 노출된다. 4(킬러)는 --gd-bad(#be123c), 3(심화)는 --gd-ink(#16202e), 1~2는 --gd-ink-3(#98a0ad) 색.**
  - 근거: `d:/Consult:0; d:/Desktop/2026project/nara/src/components/grammar-drill/drill-player.tsx:31 및 402-406, d:/Desktop/2026project/nara/src/lib/grammar-drill/display.ts:34-39`
  - 실제 문구: 기초 / 표준 / 심화 / 킬러  (디렉터면 표기는 D1 기초 / D2 표준 / D3 심화 / D4 킬러)
- **유닛 단계 게이트는 6단: CONCEPT → DRILL → READING → WRITTEN → TEST → MASTERED. 기초(BASIC) 유닛은 CONCEPT → DRILL → MASTERED 3단으로 축약된다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/grammar-drill/engine.ts:40-48, d:/Desktop/2026project/nara/src/app/g/unit/[unitId]/unit-hub-client.tsx:23-24`
  - 실제 문구: 개념 학습 / 드릴 / 실전 독해 / 서술형 / 유닛 테스트 / 마스터
- **게이트 통과 임계값은 코드 상수로 고정: 드릴 게이트 = 개념별 8회 시도 & 숙달도 70, 실전 독해 게이트 = 유닛 8회 & 정답률 0.6, 서술형 게이트 = 6회 & 0.6, 유닛 테스트 합격선 = 70점. 큐 1세트 = 10문항, 숙달도는 EWMA(α=0.25) + 라이트너 box(0~5).**
  - 근거: `d:/Desktop/2026project/nara/src/lib/grammar-drill/engine.ts:31-38, d:/Desktop/2026project/nara/src/lib/grammar-drill/engine.ts:1-11`
- **유닛 테스트 결과 화면은 합격/불합격 문구가 분기된다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/grammar-drill/drill-player.tsx:505-508`
  - 실제 문구: 합격 — 유닛 마스터를 달성했습니다 / 70점 미만 — 취약 개념을 복습한 뒤 재응시해 주십시오
- **드릴 화면 하단 액션바의 도구 버튼은 힌트(2계단)·개념·질문 3종. 힌트는 '힌트 1 — 구조' → '힌트 2 — 판단 규칙' 순으로 인라인 계단식으로 펼쳐지고, 버튼 라벨은 힌트 → 힌트 2 → 힌트 끝으로 바뀐다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/grammar-drill/drill-player.tsx:295-344`
  - 실제 문구: 힌트 1 — 구조 / 힌트 2 — 판단 규칙 / 힌트 / 힌트 2 / 힌트 끝 / 개념 / 질문 / 제출하기 / 채점 중… / 다음 문항 / 결과 보기
- **채점은 100% 서버(/api/grammar-drill/submit)에서 하고 클라이언트에는 정답이 없다. 제출 payload에 hintUsed(힌트 단계)·conceptPeeked(개념 시트 열람 여부)·timeMs가 함께 실려 학습 행동까지 기록된다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/grammar-drill/drill-player.tsx:112-128, d:/Desktop/2026project/nara/src/components/grammar-drill/drill-player.tsx:6-8`
- **문항 뱅크 실적재량: items/*.json 36파일 = 총 1,650문항(choice 564 + reading 240 + support 846). u08만 choice 36·support 54로 적고 나머지 유닛은 choice 48·support 72·reading 20으로 균일. 복합 세트(mixed) set1 10문항 / set2 10문항 / final 12문항. 개념 레슨 JSON은 75개(b·u 전 개념).**
  - 근거: `d:/Desktop/2026project/nara/src/data/grammar-drill/items/ (36개 파일), d:/Desktop/2026project/nara/src/data/grammar-drill/lessons/ (75개 파일), d:/Desktop/2026project/nara/src/lib/grammar-drill/bundle.ts:9-18`
- **문항 1개는 stem/options/answer 외에 translation(우리말 해석), hints 2단, explanation(해설), trapTags(함정 태그)를 전부 데이터로 보유한다 — AI 실시간 생성이 아니라 사전 저작 뱅크.**
  - 근거: `d:/Desktop/2026project/nara/src/data/grammar-drill/items/u01-choice.json:5-19`
  - 실제 문구: stem: "Sunlight in the early morning {{blank}} the surface of the lake." / options: ["warms","warming"] / 힌트1: "이 문장에서 시제를 가진 동사가 몇 개인지 세어 보십시오." / 힌트2: "완전한 문장에는 시제를 가진 본동사가 정확히 하나 있어야 합니다."
- **드릴 앱(/g) 전용 디자인 토큰 팔레트가 gd.css에 리터럴 hex로 고정돼 있다(라이트 고정, 다크 토글 무영향). 컨셉명은 '시험지 × 계기판'.**
  - 근거: `d:/Desktop/2026project/nara/src/app/g/gd.css:1-46`
  - 실제 문구: --gd-paper #f6f5f1 / --gd-card #ffffff / --gd-line #e5e3db / --gd-line-strong #d4d1c6 / --gd-ink #16202e / --gd-ink-2 #5a6372 / --gd-ink-3 #98a0ad / --gd-blue #1d4ed8 / --gd-blue-soft #eef2fe / --gd-blue-line #c7d4f8 / --gd-good #047857 / --gd-good-soft #ecfdf5 / --gd-bad #be123c / --gd-bad-soft #fff1f2 / --gd-master #0f766e
- **취약점 판정 상수는 weakness.ts 단일 소스로 수렴돼 있다: WEAK_SCORE(보충 필요 컷오프) 60, MIN_ATTEMPTS(판정 표본 하한) 3회, STALE_DAYS(복습 대상 경과일) 21일.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/grammar-drill/weakness.ts:20-26`
- **디렉터 노출 어휘는 '취약'이 아니라 '보충 필요'로 통일돼 있고, 지표 정의 툴팁 문구까지 글로서리 단일 소스로 고정돼 있다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/wording/director-glossary.ts:86-118`
  - 실제 문구: 숙달도 / 보충 필요 / 복습 대상 / 숙달도는 최근 풀이에 가중치를 둔 점수예요. 60점 미만이면 보충을 권장해요 / 보충 필요는 3회 이상 시도했는데 숙달도가 60점 미만이거나, 오답률이 높은 항목이에요 / 복습 대상은 숙달한 뒤 21일이 지나 다시 확인이 필요한 개념이에요
- **학생 허브 어법 탭에서 '보충 필요 개념'/'복습 대상'이 그대로 과제 컴포저 프리셋으로 이어진다. 두 CTA가 나란히 놓이고 각각 rose/violet 톤으로 구분된다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/students/hub/grammar-tab.tsx:196-217, d:/Desktop/2026project/nara/src/lib/wording/director-glossary.ts:52-57`
  - 실제 문구: 보충 과제 보내기 / 복습 과제 보내기 / 숙달 후 3주 이상 손대지 않은 개념으로 복습 과제를 보냅니다
- **과제 컴포저의 어법 패널은 '보충이 필요한 개념 (자동 추천)' 리스트를 체크박스 행으로 띄우고 '모두 적용' 버튼으로 spec.conceptIds에 원클릭 반영한다. 각 행은 숙달도 바 + '숙달도 27점 · 12회 시도 중 8회 오답' 형식의 근거 문장을 병기한다(점수 단독 노출 금지 규칙).**
  - 근거: `d:/Desktop/2026project/nara/src/components/study-assignments/composer-grammar-spec.tsx:213-273, d:/Desktop/2026project/nara/src/lib/wording/director-glossary.ts:310-314, d:/Desktop/2026project/nara/src/lib/wording/director-glossary.ts:342-352`
  - 실제 문구: 보충이 필요한 개념 (자동 추천) / 모두 적용 / 숙달도 27점 · 12회 시도 중 8회 오답
- **과제 배포 시 학생별 취약 가중이 실제로 큐에 반영된다는 사실이 컴포저 헤더 카피로 명시돼 있다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/study-assignments/composer-grammar-spec.tsx:96-105`
  - 실제 문구: 출제 범위 구성 — 선택한 조건으로 학생마다 보충 필요 우선 문항이 자동 편성됩니다
- **학습지(지문 분석) 축의 어법 포인트 코드 a~m 13종 → 어법 드릴 개념 ID로 이어주는 정적 브리지 테이블이 존재한다. 즉 '학습지에서 틀린 어법 포인트' → '드릴 개념 과제'가 코드로 직결된다. 현재 13코드 전부 매핑 존재.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/grammar-drill/grammar-code-map.ts:1-72`
  - 실제 문구: a 정동사 vs 준동사 → u01-c1~c4 / d 수일치 → u02-c1~c4 / e 능동태 vs 수동태 → u03-c1~c4 / i 병렬구조 → u05-c1~c4 / l 전치사 vs 접속사 → u08-c1~c3
- **매핑이 없는 경우의 CTA 비활성 사유 문구도 사전에 고정돼 있다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/wording/director-glossary.ts:71-72`
  - 실제 문구: 연결된 어법 훈련 개념이 없어 바로 보낼 수 없어요
- **학생 앱 홈에는 '지금 가장 약한 개념' 섹션이 있고, 각 행에서 바로 해당 개념 집중 드릴로 진입한다(/g/drill?mode=drill&unitId=..&conceptId=..).**
  - 근거: `d:/Desktop/2026project/nara/src/app/g/home/home-client.tsx:356-391`
  - 실제 문구: 지금 가장 약한 개념 / 숙달도 / 집중 드릴
- **기능별 소모 크레딧은 CREDIT_COSTS 상수 1곳에 확정 숫자로 박혀 있다(총 22개 오퍼레이션). OCR/텍스트 추출은 0크레딧 = 무료.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/credit-costs.ts:5-44`
  - 실제 문구: 문제 생성 2 / 어휘 문제 1 / 자동 출제 2(문항당) / 학습 문제 생성 2 / 학습지 생성 5 / 문법 포인트 분석 1 / AI 재번역 1 / 해설 생성 1 / 문제 수정 1 / AI 튜터링 1 / 텍스트 추출 (OCR 무료) 0 / AI 지문 복원 1 / AI 지문 변형 1 / AI 지문 변형 (전체) 2 / AI 지문 생성 2 / 웹툰 이미지 생성 (일반) 5 / 웹툰 이미지 생성 (프리미엄) 10 / 기출 웹툰 다운로드 3 / 시험지 문항 분석 1(문항당, 최소 15) / 학생 내신 리포트 5 / AI 심층분석 보강 1 / AI 추세변화 분석 5
- **어법 드릴 자체(할당·응시·결정론 채점·이력 시각화)는 AI 0콜이라 무과금이며, 상수 자체가 존재하지 않는다고 코드 주석이 명시한다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/credit-costs.ts:40-42`
  - 실제 문구: 자체 시험지 배포·응시 (26-07-09 대개편) — 과금 원칙: 모델 × 실호출 수. 할당·응시·결정론 채점·이력 시각화는 AI 0콜 → 전부 무과금(상수 자체가 없음).
- **충전 팩(가격표)은 4종이 상수로 고정: 스타터 150C/19,800원(132원/C, 30일), 스탠다드 450C/49,500원(110원/C, 90일), 프리미엄 1,500C/132,000원(88원/C, 180일), 엔터프라이즈 4,500C/330,000원(73원/C, 365일).**
  - 근거: `d:/Desktop/2026project/nara/src/lib/credit-costs.ts:77-82`
- **각 충전 상품의 판매 설명 문구는 자동출제 예상 문항 수로 환산돼 생성된다(크레딧÷2).**
  - 근거: `d:/Desktop/2026project/nara/src/lib/credit-top-up-products.ts:120-132`
  - 실제 문구: 자동출제 약 {N}문항을 생성할 수 있는 SMOAT AI 크레딧 디지털 이용권입니다.
- **크레딧 잔액 배지는 사이드바 상시 노출 + 60초 폴링 + CREDITS_CHANGED_EVENT 즉시 재조회 구조. 잔액이 변하면 방향별 플래시 애니메이션(차감=빨강 scale 1.45 / 환급=파랑)이 0.72초 재생된다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/credits/credit-badge.tsx:79-121, d:/Desktop/2026project/nara/src/app/globals.css:472-493`
- **크레딧 소모량 표기 칩은 0 이하면 숫자 대신 '무료'로 표기하는 규칙이 코드에 있다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/credits/credit-cost-chip.tsx:25-38`
  - 실제 문구: 무료 / 이 작업은 크레딧을 차감하지 않습니다 / 이 작업은 크레딧 {N}을 소모합니다
- **쿠폰 등록 경로는 2개. ① QR 딥링크 /coupon/register?t=<token> → 미로그인이면 /login?callbackUrl=... 로 보내고 로그인 후 /director/coupons/register?t=<token> 로 복귀 → 화면 진입 즉시 자동 등록(useEffect 1회 가드). ② 로그인 상태에서 /director/credits 페이지 상단 '쿠폰 등록' 카드에 8자리 코드 직접 입력.**
  - 근거: `d:/Desktop/2026project/nara/src/app/coupon/register/page.tsx:12-26, d:/Desktop/2026project/nara/src/app/(director)/director/coupons/register/_components/coupon-register-client.tsx:82-90, d:/Desktop/2026project/nara/src/app/(director)/director/credits/page.tsx:267`
- **쿠폰 등록은 DIRECTOR(원장) 계정만 가능하며, 그 외 역할은 403으로 막힌다. IP 분당 10회 / 학원 분당 15회 rate-limit.**
  - 근거: `d:/Desktop/2026project/nara/src/app/api/coupons/printable/claim/route.ts:11-27`
  - 실제 문구: 쿠폰 등록은 원장 계정만 가능합니다.
- **쿠폰 코드는 8자리, 혼동문자 I·O·0·1을 제외한 32자 알파벳에서 생성된다. QR 토큰 원본은 DB에 저장하지 않고 SHA-256 해시만 저장한다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/printable-coupons.ts:10-37`
- **등록 결과는 CREDIT_GRANT(즉시 지급)와 DISCOUNT_*(보유 등록) 두 갈래로 화면이 완전히 갈린다. 지급형은 emerald 카드, 할인형은 blue 카드.**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/coupons/register/_components/coupon-register-client.tsx:156-222`
  - 실제 문구: 크레딧이 지급되었습니다 / 지급 / 현재 잔액 {N} 크레딧 / 보유 크레딧은 하나의 소멸일을 공유합니다 · 소멸 예정일 {날짜} / 크레딧 내역 보기 / 할인 쿠폰이 등록되었습니다 / 다음 크레딧 충전 결제 때 자동으로 적용할 수 있습니다. / 크레딧 충전하러 가기
- **등록 실패 사유는 8종 고정 메시지로 관리된다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/printable-coupon-claim.ts:46-55`
  - 실제 문구: 존재하지 않는 쿠폰 코드입니다. / 이미 등록되었거나 사용할 수 없는 쿠폰입니다. / 현재 사용할 수 없는 쿠폰입니다. / 등록 기간이 지난 쿠폰입니다. / 이 쿠폰의 학원당 등록 한도를 초과했습니다. / 방금 다른 요청이 이 쿠폰을 선점했습니다. 다시 확인해주세요. / 요청이 너무 잦습니다. 잠시 후 다시 시도해주세요. / 등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
- **쿠폰 효과 한 줄 문구는 포맷 함수로 단일화돼 있다 — 300크레딧 쿠폰이면 인쇄물·등록 화면 모두 '무료 300 크레딧 지급권'으로 렌더된다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/printable-coupon-format.ts:61-72`
  - 실제 문구: 무료 {N} 크레딧 지급권 / {N}원 할인권 / {N}% 할인권
- **지급 크레딧 수(예: 300)는 하드코딩이 아니라 관리자 배치 생성 시 입력하는 값(grantCredits)이다. 관리자 화면 라벨은 '지급 크레딧 *'.**
  - 근거: `d:/Desktop/2026project/nara/src/components/admin/printable-coupons-admin-client.tsx:212, d:/Desktop/2026project/nara/src/components/admin/printable-coupons-admin-client.tsx:351`
- **등록 트랜잭션은 조건부 UPDATE(WHERE status='ACTIVE')의 count 가드로 멱등성을 확보하고, 지급 원장 creditTxId에 @unique 2차 방어를 건다. 동시 선점 시 '방금 다른 요청이 이 쿠폰을 선점했습니다'로 실패한다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/printable-coupon-claim.ts:143-201`
- **구독 요금제(플랜)는 코드가 남아 있지만 FEATURE_FLAGS.SHOW_SUBSCRIPTION_BILLING 기본값 false로 UI가 꺼져 있다. 현재 실사용 과금 모델은 '크레딧 선불 충전' 단일. 반면 크레딧 충전(SHOW_CREDIT_TOP_UP)은 기본 true로 PG 실연동 상태.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/feature-flags.ts:65-79, d:/Desktop/2026project/nara/src/app/(admin)/admin/credit-plans/page.tsx:18-27`
- **공개 상품 안내 페이지 /credits/products는 크레딧 소멸시효(유효기간) 정책을 명문화한다: 결제일(지급일) 기준, 구매/지급 시 '남은 기간 + 새 기간'으로 연장, 사용해도 소멸 예정일 불변, 만료 시 전액 소멸·복구 불가.**
  - 근거: `d:/Desktop/2026project/nara/src/app/credits/products/page.tsx:300-362`
  - 실제 문구: 크레딧 소멸시효(유효기간) 안내 / 연장 규칙 — 크레딧을 구매하거나 지급받으면 소멸 예정일이 "남은 …" / 사용과 무관 — 크레딧을 사용(차감)해도 소멸 예정일은 바뀌지 … / 만료 시 — 소멸 예정일이 지나면 남은 크레딧이 전액 소멸되며, 소멸된 크레딧은 복구·환불되지 않습니다. (계산은 24시간 기준)
- **충전 패널 하단에 기능별 차감 표를 접이식으로 붙이고, '구매 단가와 별도 적용'임을 명시한다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/credits/_components/top-up-panel.tsx:545-571`
  - 실제 문구: 크레딧 사용 가능 기능 및 차감 기준 / 구매 단가와 별도 적용 / 큰 단위로 충전하면 1C당 구매 단가는 낮아질 수 있지만, 같은 기능을 실행할 때 차감되는 크레딧 수는 동일합니다.
- **학생 앱(/g) 진입은 학원코드 4자 + 학생코드 6자 원스크린 로그인. 하단 탭바는 홈/학습/과제/내 기록 4탭.**
  - 근거: `d:/Desktop/2026project/nara/src/app/g/login-client.tsx:75-141, d:/Desktop/2026project/nara/src/components/grammar-drill/g-shell.tsx:45-54`
  - 실제 문구: SMOAT 학습 / 스모트 모바일 학습 — 과제 · 시험 · 어법 훈련 / 학원코드 (예: A1B2) / 학생코드 (예: X7K2M9) / 학습 시작 / 코드는 담당 선생님께 받을 수 있습니다. / 탭: 홈 · 학습 · 과제 · 내 기록
- **어법 드릴 기능 전체는 FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL(기본 true) 게이트 아래 있고, /g/drill은 9개 모드를 허용한다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/feature-flags.ts:136-143, d:/Desktop/2026project/nara/src/app/g/drill/page.tsx:14-39`
  - 실제 문구: 모드: drill / concept_check / reading / written / test / review / smart / mixed / assignment

### 덱 재현 대상 (visualSpec)

#### 어법 드릴 플레이어 — 상/중/하 3단 고정 화면

- 왜: 제품의 심장. 세미나에서 '학생이 실제로 보는 화면'을 1픽셀 단위로 재현하면 설득력이 가장 크다. 서버 채점·힌트 2단·개념/질문 시트가 한 화면에 다 들어있다.
- 소스: `d:/Desktop/2026project/nara/src/components/grammar-drill/drill-player.tsx:235-378 + d:/Desktop/2026project/nara/src/app/g/gd.css`
- 시각 스펙:

```
루트: max-width 42rem(max-w-2xl), height 100dvh, flex-col, 배경 #f6f5f1, 본문 잉크 #16202e, 기본 폰트 14px(0.875rem), line-height 1.5, word-break keep-all.
[상단 헤더 shrink-0, px-16px, pt-12px] 높이 40px 한 줄 flex: (좌) 40×40 원형 버튼 ChevronLeft(#5a6372, stroke 2) → (중) 큐 제목 13px 600 truncate → (우) 진행 카운터 mono tabular-nums '3' + '/10' (분모는 #98a0ad).
헤더 바로 아래 진행 미터: height 4px, radius 9999px, 트랙 #e5e3db, 채움 #1d4ed8, width는 ((idx + verdict?1:0)/총문항)*100%, transition width 400ms cubic-bezier(.22,1,.36,1).
[중단 문항 flex-1 overflow-y-auto, px-20px pt-16px pb-24px] 첫 줄 = 배지 3개 flex gap 6px: ① 유닛 배지(배경 #eef2fe, 글자 #1d4ed8, 10px 700, radius 6px, px 6px py 2px, 예 '동사 vs 준동사') ② 개념 배지(배경 #f6f5f1, 글자 #5a6372, border 1px #e5e3db, 10px 600, 예 '본동사 하나 원칙') ③ ml-auto 난이도 라벨 10px 700 (기초/표준/심화=#16202e/킬러=#be123c).
문제 본문(CHOICE 예): 영어 지문은 Georgia serif, 15px(태블릿 17px), line-height 1.72. 빈칸은 {{blank}} → 밑줄 슬롯(min-width 3.5rem, border-bottom 1.5px #16202e, 글자 #1d4ed8 600).
선택지: mt-20px flex-col gap-10px. 각 옵션 버튼 = width 100%, min-height 48px, padding 10px 14px, border 1.5px #e5e3db, radius 12px, 배경 #fff, 좌측에 20×20 원형 라벨(A/B, border #d4d1c6, 글자 #5a6372, 11px 600) + 우측 serif 15px 본문. 상태: selected → border #1d4ed8 + 배경 #eef2fe / correct → border #047857 + 배경 #ecfdf5 / wrong → border #be123c + 배경 #fff1f2 / dim → opacity .55. transition border-color·background 100ms.
힌트 블록(제출 전, hintLevel≥1): mt-16px, radius 12px, border 1px #c7d4f8, 배경 #eef2fe, padding 14px. 라벨 '힌트 1 — 구조'(11px 600 letter-spacing .08em, 색 #1d4ed8) + 본문 13px. hintLevel 2면 아래에 '힌트 2 — 판단 규칙' 추가. 진입 애니메이션 gd-pop: scale(.94)→scale(1), opacity 0→1, 180ms cubic-bezier(.22,1,.36,1).
[하단 액션바 shrink-0, border-top 1px #e5e3db, 배경 #fff, px-16px pt-10px, pb max(12px, safe-area)] 1행: 칩 버튼 3개(높이 36px, radius 8px, border 1px #e5e3db, 글자 #5a6372 11px 600, 아이콘 16px) — 「힌트」(Lightbulb) 「개념」(BookOpen) 「질문」(MessageCircleQuestion). 우측 ml-auto에 mono 11px '정답 4/6'(#98a0ad).
2행: 전폭 primary 버튼 — min-height 44px, radius 12px, 배경 #1d4ed8, 흰 글자 13px 600, :active transform scale(.98) 80ms. 라벨은 제출 전 「제출하기」(비활성 시 배경 #c3c9d6) / 제출 중 「채점 중…」 / 판정 후 「다음 문항」 또는 마지막이면 「결과 보기」 + ArrowRight 16px.
모션 시나리오(슬라이드용): ① 선택지 클릭 → 테두리가 #e5e3db→#1d4ed8, 배경 #eef2fe로 100ms 전환 ② 「제출하기」 → 정답 선택지 emerald, 오답 rose, 나머지 opacity .55 ③ 판정 패널이 아래에서 gd-pop으로 등장하며 main이 smooth scroll 하단으로 ④ 진행 미터가 400ms ease로 한 칸 전진.
```

#### 판정 패널(VerdictPanel) — 정오 배너 + 해설 + 밑줄별 근거 + 숙달도 게이지

- 왜: 'AI가 아니라 사전 저작된 해설 + 실시간 숙달도 갱신'이라는 제품 차별점이 한 컴포넌트에 응축돼 있다. 세미나 핵심 데모 컷.
- 소스: `d:/Desktop/2026project/nara/src/components/grammar-drill/verdict-panel.tsx:10-104`
- 시각 스펙:

```
컨테이너: mt-20px, radius 14px, border 1px, padding 16px, animation gd-pop 200ms cubic-bezier(.22,1,.36,1). 톤 good → border #a7f3d0 / 배경 #ecfdf5. 톤 bad → border #fecdd3 / 배경 #fff1f2.
1행: 24×24 원형 아이콘(배경 정답 #047857 / 오답 #be123c, 흰 Check 또는 X, stroke 3) + 15px 700 텍스트 「정답입니다」(#047857) 또는 「오답입니다」(#be123c). 오답이고 correction이 있으면 우측 ml-auto에 13px '바른 형태 ' (#5a6372) + serif bold 정답형.
2행: mt-12px 해설 본문 13px, line-height relaxed.
3행(rationales 있을 때): border-top 1px #e5e3db, pt-12px. 소제목 「밑줄별 판단 근거」(11px 600 letter-spacing .08em, #98a0ad). 리스트 각 행 = 원문자 ①②③④⑤(정답 번호는 #be123c, 나머지 #98a0ad, 600) + 근거 문장 12px(#5a6372).
4행: border-top, 소제목 「지문 요지」 또는 「해석」 + 12px 본문(#5a6372).
5행(핵심 계기판): border-top, pt-12px, flex justify-between. 좌 「개념 숙달도」 11px(#98a0ad). 우 = 폭 96px 미터(height 4px, 트랙 #e5e3db, 채움 70점 이상이면 #047857 아니면 #1d4ed8, width=score%) + mono 11px 700 점수(#5a6372) + streak≥2면 '3연속'(#1d4ed8 11px 600).
6행(단계 승급 시): mt-12px, radius 8px, 배경 #eef2fe, border 1px #c7d4f8, px 12px py 8px, 12px 600 #1d4ed8 — 「단계가 열렸습니다 — 드릴」.
모션: 패널 전체 gd-pop 200ms 등장 → 숙달도 미터 채움 400ms ease-out으로 좌→우 증가 → '연속' 배지가 뒤늦게 fade-in.
```

#### 유닛 허브 — 「다음 한 수」 카드 + 6단 단계 스테퍼 + 개념 레슨 리스트

- 왜: '커리큘럼이 있고, 학생은 언제나 다음 한 수를 본다'는 학습 OS 서사를 한 장으로 보여준다. 단계 게이트(개념→드릴→실전→서술형→테스트→마스터)가 시각화된 유일한 화면.
- 소스: `d:/Desktop/2026project/nara/src/app/g/unit/[unitId]/unit-hub-client.tsx:139-291`
- 시각 스펙:

```
컨테이너 .gd-page: width 100%, max-width 28rem(태블릿 44rem), 중앙정렬, px 20px, pb 48px, 배경 #f6f5f1.
[헤더] 40×40 back 버튼 + 파트 라벨 11px 600 letter-spacing .08em (#98a0ad) 예 '골격기'. 아래 h1 20px 700 tracking-tight '동사 vs 준동사', 그 아래 15px(#5a6372) '이 절에 본동사가 있는가', 그 아래 11px(#98a0ad) '★★★★★ · 30회분 선지 약 28~30회 — 사실상 매회 출제'.
[다음 한 수 카드] mt-20px, .gd-block[data-tone=accent] = 배경 #eef2fe, border 1px #c7d4f8, radius 16px, padding 16px(태블릿 20px 24px). 내부: 라벨 「다음 한 수」(11px 600 ls .08em, #1d4ed8) → 15px 700 제목(예 '개념 학습 이어서 하기') → 14px(#5a6372) 개념명 → 12px(#98a0ad) 근거('3번째 블록부터 이어집니다' 또는 '4개 블록 · 약 7분') → mt-12px 전폭 파랑 버튼 「바로 시작」 + ArrowRight.
[단계 스테퍼] mt-16px .gd-card(배경 #fff, border 1px #e5e3db, radius 14px) px 16px py 14px. 가로 flex 5노드(개념 학습·드릴·실전 독해·서술형·유닛 테스트): 각 노드 = 24×24 원(완료 → 배경/테두리 #047857 + 흰 Check / 현재 → 테두리·글자 #1d4ed8 + 번호 / 미도달 → 테두리 #d4d1c6, 글자 #98a0ad) + 아래 10px 라벨. 노드 사이 연결선 = height 1px flex-1, 지난 구간 #047857 / 미래 구간 #e5e3db. 하단 border-top 후 11px '유닛 테스트 최고점 82점 — 마스터 달성'(점수는 mono, 마스터면 #047857).
[개념 학습 섹션] mt-24px. 헤더 flex: 「개념 학습」(11px 600 ls .08em #98a0ad) ↔ mono 11px '2/4 완료'. 행 카드 = .gd-card flex px 14px py 12px gap 12px: 좌 36×36 radius 12px 아이콘칩(완료 → 배경 #ecfdf5 글자 #047857 Check / 진행중 → #eef2fe·#1d4ed8 PlayCircle / 미시작 → #f6f5f1·#98a0ad BookOpen), 중앙 = mono 인덱스 + 14px 600 개념 제목 / 12px 2줄 클램프 oneLiner(#98a0ad) / 진행 미터(height 4px) + mono 10px('숙달 78' 또는 '2/5' 또는 '7분'), 우 11px 600 #1d4ed8 라벨('복습'|'이어서'|'학습').
[훈련 섹션] mt-24px, 라벨 「훈련」. 모드 4행: 드릴 / 실전 독해 / 서술형 / 유닛 테스트. 각 행 .gd-card px 14px py 14px, 좌 40×40 radius 12px 아이콘칩(완료 #ecfdf5·#047857 / 활성 #eef2fe·#1d4ed8 / 잠금 #f6f5f1·#98a0ad), 제목 14px 600 + 설명 10px(#98a0ad). 잠금 행은 opacity .5 이고 설명이 「개념 학습을 모두 마치면 열립니다」로 대체.
실제 설명 문구(그대로): 드릴 = '택일·OX 무한 훈련 — 개념 숙달도 70 도달' / 실전 독해 = '미니 29번 · 수능 29번 지문' / 서술형 = '어형 변형 · 오류 수정 직접 쓰기' / 유닛 테스트 = '10문항 종합 — 70점 이상 마스터'.
모션: 잠금 행이 해금될 때 opacity .5→1 + 아이콘칩 배경이 #f6f5f1→#eef2fe로 전환. 스테퍼는 노드 원이 좌→우 순차로 Check로 뒤집히는 stagger(각 120ms)로 연출.
```

#### 개념 숙달 지도(히트맵) — 디렉터 학생 상세 어법 탭

- 왜: '학생 취약점이 어디인지 한눈에' — 강사 설득용 최강 비주얼. 색 스케일이 코드에 정확히 5단으로 정의돼 있어 그대로 재현 가능하다.
- 소스: `d:/Desktop/2026project/nara/src/components/students/hub/grammar-analysis.tsx:184-281 + d:/Desktop/2026project/nara/src/lib/grammar-drill/display.ts:55-77`
- 시각 스펙:

```
카드: 고정 높이 420px, 내부 스크롤. 헤더 = LayoutGrid 아이콘(#2563eb, 16px) + 제목 「개념 숙달 지도」 + ⓘ 툴팁(문구: '숙달도는 최근 풀이에 가중치를 둔 점수예요. 60점 미만이면 보충을 권장해요').
툴바(범례): flex wrap, 10.5px #94a3b8. 스와치 = 10×10 radius 3px. 5단 정확 매핑 — bg-emerald-600(#059669) '80+' / bg-emerald-400(#34d399) '60+' / bg-emerald-200(#a7f3d0) '40+' / bg-rose-200(#fecdd3) '20+' / bg-rose-400(#fb7185) '0~19' + bg-slate-100(#f1f5f9) '미시도 —'.
본문: PART별 그룹(기초 골격/골격기/연결기/정밀기). 그룹 헤더 = 11.5px 700 #94a3b8 파트명 ↔ 10.5px 700 #cbd5e1 '마스터 3/5'.
각 유닛 행 = 2단 스택: (1) 제목 줄 — 11.5px #475569 유닛 타이틀(break-keep, 자르지 않음) ↔ 10px 600 단계 라벨(MASTERED면 #059669, 아니면 #cbd5e1) (2) 셀 줄 — flex gap 4px, 셀 = height 24px, flex-1, radius 4px, 10px 700 tabular-nums 숫자(숙달도 점수). 미시도 셀은 배경 #f1f5f9 + 글자 '—'(#cbd5e1). 복습 대상(숙달 60↑ & 21일 초과 미시도)은 ring-1 ring-violet-300(#c4b5fd) 링 추가.
셀 hover: brightness(0.95). focus-visible: ring-2 #60a5fa. 클릭 시 팝오버로 '숙달 72점 · 9회 시도' + '시도 기록 보기' CTA.
title 속성 문구(그대로): '{개념명} · 숙달 72점 · 9회 시도 · 마지막 시도 26일 전 · 복습 권장'.
우측 페어 카드(같은 420px): Target 아이콘(#f43f5e) + 제목 「보충 필요 개념」 + rose 배지(bg-rose-50/#fff1f2, 글자 #e11d48, 11px 700 tabular-nums)로 개수. 비었을 때 문구 = '지금은 보충 필요 개념이 없습니다.' 또는 표본 부족 시 '기록이 3회 이상 쌓이면 보충이 필요한 항목이 여기에 나타납니다'.
모션: 슬라이드 진입 시 셀이 좌상→우하 방향으로 20ms stagger fade+scale(0.9→1). '보충 필요' 셀(rose 계열)만 뒤늦게 1회 pulse 시켜 시선을 끈다.
```

#### 크레딧 잔액 배지 + 팝오버(사이드바 상시 노출)

- 왜: '크레딧이 실시간으로 깎이는 게 보인다'는 체감을 슬라이드에서 애니메이션으로 재현할 수 있는 유일한 자산. 차감 플래시 키프레임이 CSS로 정확히 정의돼 있다.
- 소스: `d:/Desktop/2026project/nara/src/components/credits/credit-badge.tsx:123-274 + d:/Desktop/2026project/nara/src/app/globals.css:472-493`
- 시각 스펙:

```
[트리거 버튼] height 36px(h-9), radius 12px, padding 0 10px, flex gap 6px, hover 배경 rgba(0,0,0,0.03), transition 200ms. 색은 잔액 정상 → text-emerald-600(#059669), isLow → text-red-500(#ef4444). 내용 = Coins 아이콘 15px(stroke 1.7) + 잔액 숫자(13px 600 tabular-nums, toLocaleString) + isLow일 때 TrendingDown 12px(#f87171). 로딩 상태는 회색 '--'.
[차감/환급 플래시] 잔액이 변하면 숫자 span에 애니메이션 0.72s cubic-bezier(.22,1,.36,1) — 차감: 0% scale(1) → 28% scale(1.45)+color #ef4444 → 55% scale(1.1)+#ef4444 → 100% scale(1). 환급은 동일 곡선에 색만 #2563eb. display inline-block, transform-origin center.
[팝오버] width 280px, radius 12px, padding 0, box-shadow lg, border rgba(gray-200,.6).
헤더(px 16px pt 16px pb 12px): 좌 「크레딧 잔액」(11px 600 uppercase tracking-wider, #9ca3af) ↔ 우 플랜 배지(height 18px, px 6px, 10px 600, radius 6px, 글자 #3b82f6, 배경 rgba(59,130,246,.08)). 그 아래 잔액 = 28px 800 tabular-nums tracking-tight(#111827, isLow면 #ef4444) + '크레딧'(12px 500 #9ca3af).
사용량 바(월간 배정>0일 때): 라벨 줄 11px #9ca3af 「월간 사용량」 ↔ '1,240 / 3,000'. 바 = height 6px, 트랙 bg-gray-100(#f3f4f6), 채움 radius full + transition width 500ms. 채움색은 80% 초과 bg-red-400(#f87171), 50% 초과 bg-blue-400(#60a5fa), 그 외 bg-emerald-400(#34d399).
통계 2칸 그리드(gap 8px): 각 칸 bg-gray-50 radius 8px px 12px py 8px — 라벨 10px 500 #9ca3af(「월간 배정」/「보너스」) + 값 14px 700 #374151 tabular-nums.
푸터: border-top #f3f4f6, 링크 행 px 16px py 10px, 12px 500 #3b82f6, hover bg-blue-50/50, 텍스트 「크레딧 관리」 + ChevronRight 14px.
동작 사실: 60초 폴링 + CREDITS_CHANGED_EVENT 즉시 재조회 + 탭 visible 복귀 시 재조회.
```

#### 기능별 크레딧 차감표 그리드

- 왜: 세미나에서 '무엇을 하면 몇 크레딧이 빠지는가'를 표 한 장으로 못박는 슬라이드. 아이콘·색까지 코드에 매핑돼 있어 그대로 옮기면 된다.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/credits/_components/top-up-panel.tsx:545-609 + d:/Desktop/2026project/nara/src/lib/credit-costs.ts:5-72 + d:/Desktop/2026project/nara/src/app/(director)/director/credits/_components/credit-overview.tsx:50-76`
- 시각 스펙:

```
섹션 헤더(클릭 토글): 전폭 flex justify-between. 좌 13px 600 #1f2937 「크레딧 사용 가능 기능 및 차감 기준」 / 우 11px #9ca3af 「구매 단가와 별도 적용」 + ChevronDown 14px(펼침 시 rotate-180, transition-transform).
펼침 안내문 11px line-height 20px #9ca3af: '큰 단위로 충전하면 1C당 구매 단가는 낮아질 수 있지만, 같은 기능을 실행할 때 차감되는 크레딧 수는 동일합니다.'
그리드: overflow-hidden radius 12px border 1px #f3f4f6. 1열(모바일) / 2열(sm) / 3열(lg). 셀 = flex justify-between px 16px py 12px, hover bg-gray-50/60, 셀 사이 얇은 구분선(#f9fafb).
셀 좌측: 28×28 radius 8px 아이콘칩 + 13px 500 #374151 기능명. 우측: 13px 700 tabular-nums '{N}C' — 5 이상이면 #2563eb, 미만이면 #4b5563.
아이콘·색 매핑(코드 그대로): 문제 생성 FileText bg-blue-50/text-blue-500 · 어휘 문제 BookOpen bg-sky-50/text-sky-500 · 자동 출제 Zap bg-violet-50/text-violet-500 · 학습 문제 생성 GraduationCap bg-indigo-50/text-indigo-500 · 학습지 생성 Brain bg-emerald-50/text-emerald-500 · 문법 포인트 분석 Languages bg-teal-50/text-teal-500 · AI 재번역 Languages bg-cyan-50/text-cyan-500 · 해설 생성 FileText bg-blue-50 · 문제 수정 Pencil bg-slate-100/text-slate-500 · AI 튜터링 MessageSquare bg-pink-50/text-pink-500 · 텍스트 추출 ScanText bg-gray-100/text-gray-500.
표에 넣을 확정 수치(전량): 문제 생성 2C · 어휘 문제 1C · 자동 출제 2C(문항당) · 학습 문제 생성 2C · 학습지 생성 5C · 문법 포인트 분석 1C · AI 재번역 1C · 해설 생성 1C · 문제 수정 1C · AI 튜터링 1C · 텍스트 추출 (OCR 무료) 0C · AI 지문 복원 1C · AI 지문 변형 1C · AI 지문 변형(전체) 2C · AI 지문 생성 2C · 웹툰 이미지 생성(일반) 5C · 웹툰 이미지 생성(프리미엄) 10C · 기출 웹툰 다운로드 3C · 시험지 문항 분석 1C(문항당, 최소 15) · 학생 내신 리포트 5C · AI 심층분석 보강 1C · AI 추세변화 분석 5C.
0C 항목은 숫자 대신 「무료」로 표기(칩 규칙). 어법 드릴 응시·채점은 표에 아예 없음 = 무과금.
```

#### 실물 쿠폰 티켓(A4 2열×5행 인쇄물) — 300크레딧 지급권

- 왜: 세미나 현장에서 참석자에게 실제로 나눠줄 물건. 슬라이드에 실물 목업을 띄우고 '이 QR을 지금 찍으세요'로 바로 이어진다. mm 단위 스펙이 전부 코드에 있다.
- 소스: `d:/Desktop/2026project/nara/src/components/admin/coupon-print-view.tsx:88-237`
- 시각 스펙:

```
페이지: 210mm × 297mm, 배경 #ffffff, grid-template-columns 1fr 1fr, grid-template-rows repeat(5,1fr), gap 0 → 한 장 크기 105mm × 59.4mm. print-color-adjust: exact.
티켓 본체: 좌 main(flex 1) + 우 stub(고정 34mm), 사이 절취선 = border-left 0.3mm dashed #a9c4ef.
[main, padding 4.4mm 5mm 4mm] ① 브랜드 줄: 7mm 정사각 로고(radius 1.6mm) + 워드마크 'SMOAT'(4mm, 800, #0f172a, ls .2mm) + 그 아래 태그라인 'AI 영어 문제 생성 플랫폼'(2.1mm, 600, #94a3b8). ② 배치명 ticket-name: 2.8mm 700 #2563eb, nowrap ellipsis. ③ 헤드라인 ticket-headline: 5.2mm 800 #0f172a, line-height 1.12 — 숫자 부분만 6.6mm 800 #2563eb로 강조. 300크레딧 지급권이면 실제 문자열은 「무료 300 크레딧 지급권」이고 '300'만 파랑·크게. ④ 코드 박스: margin-top 2.4mm, 전폭, 가운데정렬, 배경 #eff6ff, border 0.3mm dashed #93c5fd, radius 2mm, padding 1.9mm 1.5mm, monospace 4.8mm 800 letter-spacing 1.4mm, 색 #1d4ed8 — 8자리 코드(예 'ABCD2345', I·O·0·1 제외 알파벳). ⑤ 하단(margin-top auto): 유효기간 줄 2.1mm 600 #64748b '등록 마감 2026-08-31 · 크레딧 2026-12-31까지 유효' + 푸터 줄 = Gift 아이콘 3mm(#2563eb) + 2.2mm #64748b 문구 「더 스마트한 영어 수업, 스모트와 함께 시작하세요」.
[stub 34mm] 세로 중앙정렬 gap 1.4mm: 라벨 'LOGIN & GET'(2.2mm 800 ls .4mm #2563eb) → QR 이미지 25mm×25mm(errorCorrection M, margin 1, 검정/흰색) → 캡션 'QR 스캔 후 코드 등록'(2.1mm #64748b) → URL 'smoat.kr/coupon'(2.1mm #94a3b8).
슬라이드 재현 팁: 105:59.4 비율(≈16:9에 근접) 카드로 그리고, QR 자리에 실제 등록 URL(/coupon/register?t=...) QR을 넣으면 무대에서 즉시 동작.
인쇄 화면 상단 툴바(화면 전용): 배치명 14px 700 + '{쿠폰명} · 50장 · 5쪽' 12px #6b7280 ↔ 검정 버튼(bg #0f172a, height 36px, radius 8px) 「인쇄」.
```

#### 쿠폰 등록 3스텝 플로우(QR 자동등록 → 로딩 → 지급 완료 카드)

- 왜: 세미나 현장 액션(300크레딧 쿠폰 등록)을 슬라이드에서 그대로 안내해야 한다. 3화면을 순차 애니메이션으로 보여주면 참석자가 헤매지 않는다.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/coupons/register/page.tsx:19-30 + d:/Desktop/2026project/nara/src/app/(director)/director/coupons/register/_components/coupon-register-client.tsx:96-222`
- 시각 스펙:

```
공통 컨테이너: max-width 32rem(max-w-lg), mx-auto, px 16px py 32px. 페이지 헤더 = h1 20px 700 #0f172a 「쿠폰 등록」 + 13px #64748b 「받으신 실물 쿠폰의 QR을 스캔했거나 8자리 코드를 입력해 등록하세요. 크레딧 지급형은 즉시 적립되고, 할인형은 다음 크레딧 충전 때 자동으로 적용됩니다.」
[STEP 1 — 수동 입력 폼] 카드 radius 16px, border 1px #e2e8f0, 배경 #fff, padding 20px. QR로 온 경우 상단에 파랑 안내 바(radius 12px, 배경 #eff6ff, px 12px py 10px, 12px 500 #1d4ed8, QrCode 아이콘 16px): 「QR로 접속했습니다. 아래 “쿠폰 등록”을 누르면 바로 등록됩니다.」 라벨 12px 500 #64748b 「쿠폰 코드 (8자리)」(+ 회색 보조 '— QR로 등록하면 입력하지 않아도 됩니다'). 인풋: height 44px, 전폭, radius 12px, border 1px #e2e8f0, px 12px, font-mono 15px, tracking-widest, placeholder 'ABCD2345' 형식('예: ABCD2345'), focus border #60a5fa, 입력값은 자동 대문자화. 에러 문구는 13px 500 #e11d48. 버튼: mt-16px 전폭 height 44px radius 12px 배경 #0f172a 흰 글자 14px 600, hover #1e293b, 아이콘 Ticket 16px, 라벨 「쿠폰 등록」(전송 중엔 Loader2 spin).
[STEP 2 — 자동 등록 로딩] 카드 radius 16px border #e2e8f0 배경 #fff padding 32px 가운데정렬: Loader2 28px animate-spin(#2563eb) → 15px 600 #1e293b 「쿠폰을 등록하는 중이에요…」 → 13px #64748b 「잠시만 기다려 주세요.」
[STEP 3 — 지급 완료] 카드 radius 16px, border 1px #a7f3d0, 배경 rgba(#ecfdf5,.5), padding 24px, 가운데정렬. 48×48 원형(배경 #d1fae5, 글자 #059669) + CheckCircle2 24px → 16px 700 #0f172a 「크레딧이 지급되었습니다」 → 13px #64748b 배치명 → mt-16px 인라인 알약(배경 #fff, radius 12px, px 16px py 10px, shadow-sm): Coins 16px(#059669) + 13px #64748b '지급' + 15px 700 #047857 크레딧 칩('300') → mt-12px 12px #94a3b8 「현재 잔액 1,300 크레딧」 → 「보유 크레딧은 하나의 소멸일을 공유합니다 · 소멸 예정일 2026. 12. 31.」 → mt-20px 링크 13px 600 #2563eb 「크레딧 내역 보기」 + ArrowRight 14px.
(할인형 분기 화면: border #bfdbfe, 배경 rgba(#eff6ff,.4), 아이콘 BadgePercent(#2563eb/배경 #dbeafe), 제목 「할인 쿠폰이 등록되었습니다」, 알약에 '10,000원 할인권', 안내 「다음 크레딧 충전 결제 때 자동으로 적용할 수 있습니다.」, 링크 「크레딧 충전하러 가기」)
세미나 안내용 정확한 단계(슬라이드 캡션으로 쓸 것): ① 쿠폰 QR 스캔 → ② 원장 계정으로 로그인(원장 계정만 등록 가능) → ③ 자동 등록되어 '크레딧이 지급되었습니다' 확인. QR이 안 될 때는 /director/credits 상단 「쿠폰 등록」 카드에 8자리 코드 입력 → 「등록」.
```

#### 크레딧 관리 페이지 — 잔액 히어로 카드 + 소멸 카운트다운

- 왜: 쿠폰 등록 직후 '잔액이 실제로 늘었다'를 보여주는 착지 화면. 실시간 초 단위 카운트다운이라 라이브 데모 느낌이 강하다.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/credits/page.tsx:352-405 + 39-73`
- 시각 스펙:

```
페이지 헤더: h1 20px 700 #111827 「크레딧 관리」 + 13px #9ca3af 「AI 기능 사용 크레딧 현황 및 내역을 확인하세요」 ↔ 우측 새로고침 버튼(height 36px, px 14px, radius 12px, border 1px #e5e7eb, 배경 #fff, 13px 500 #6b7280, RefreshCw 14px, 라벨 「새로고침」).
[히어로 잔액 카드] grid 2열 span, 배경 linear-gradient(to bottom right, #2563eb, #1d4ed8), radius 16px, padding 20px, 흰 글자, overflow hidden. 장식: 우상단 128×128 원(bg rgba(255,255,255,.05), translate -32px/+32px), 좌하단 96×96 원(translate +24px/-24px).
내용: 상단 줄 12px 500 rgba(#bfdbfe) 「현재 잔액」 ↔ 플랜 배지(10px 600, bg-white/15 backdrop-blur, px 8px py 2px, radius 6px). 그 아래 잔액 = 36px 800 tabular-nums tracking-tight leading-none + 13px 500 #bfdbfe '크레딧'. mt-16px 줄 「총 사용량」 ↔ 흰 700 '4,820 크레딧'. 잔액>0 & 소멸일 존재 시 border-top rgba(255,255,255,.15) pt-12px 후: 「소멸 예정일」 ↔ '2026. 12. 31.' / 「소멸까지」 ↔ 실시간 카운트다운 '128일 07시간 42분 09초'(tabular-nums, 1초마다 갱신, 마운트 전엔 '계산 중…', 지나면 '소멸됨').
[보너스 카드] 배경 #fff, radius 16px, border rgba(#e5e7eb,.6), shadow-sm, padding 16px. 상단 12px 500 #9ca3af 「보너스」 ↔ 28×28 radius 8px 칩(bg-indigo-50, Gift 아이콘 #6366f1). 값 22px 700 tabular-nums #4338ca + 11px #9ca3af '크레딧'.
[사용 내역 테이블] 배경 #fff radius 16px border. 헤더 14px 600 「크레딧 사용 내역」 + 12px #9ca3af '총 128건' ↔ Filter 아이콘 + select(전체/사용/배정/충전/환불/조정). 컬럼: 일시 · 유형 · 기능 · 금액 · 잔액. 유형 배지 = height 20px px 8px radius 6px 10px 600 — 증가는 #059669/bg rgba(16,185,129,.08), 감소는 #ef4444/bg rgba(239,68,68,.08). 유형 라벨 사전: 사용/배정/충전/조정/환불/리셋/이월/소멸. 금액 열은 ArrowUpRight(증가)·ArrowDownRight(감소) 12px + 부호 숫자. 쿠폰 지급 행의 '기능' 열에는 description이 그대로 노출됨 — 예 '실물쿠폰 {배치명}'.
모션: 쿠폰 등록 성공 → 사이드바 배지 숫자가 credit-flash-up(파랑, scale 1.45)로 튀고 → 히어로 카드 잔액이 카운트업 → 내역 테이블 맨 위에 '충전/조정' 행이 fade-in.
```

#### 충전 상품 카드 4종(7행 subgrid) — 가격표 슬라이드

- 왜: '요금제' 질문에 대한 실제 답. 구독은 꺼져 있고 선불 충전 4팩이 전부라는 사실을 이 카드 4장으로 정확히 전달한다.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/credits/_components/top-up-panel.tsx:400-544 + d:/Desktop/2026project/nara/src/lib/credit-costs.ts:77-82`
- 시각 스펙:

```
컨테이너: 카드 4장 가로 배열, 각 카드는 grid-rows-[repeat(7,auto)] + md 이상에서 grid-rows-subgrid(같은 슬롯이 같은 줄에 정렬). 카드 padding 20px 16px, hover 배경 rgba(#eff6ff,.5), transition.
행1 상품명·크레딧: 12px 600 #2563eb 상품명 + 알약(bg #eff6ff, 11px 700 #2563eb, radius 6px, px 6px py 2px) '150C'. 프로모션 보너스가 있으면 원 크레딧에 line-through(#94a3b8 decoration 2px) + emerald 알약 '+50C 추가 증정'(bg #d1fae5, 10.5px 800, #047857, Sparkles 10px) + blue 알약 '총 200C 지급'.
행2 환산 정보: 13px 500 #6b7280 nowrap, '자동출제 약 75문항 · 264원/문항 · 유효기간 30일'(뒤쪽은 #9ca3af). 만료 없으면 '무기한 이용'.
행3 프로모션 배지 슬롯: emerald 알약 '{프로모션명} 적용 중 · ~8/31'.
행4 할인 배지: rose 알약(bg #ffe4e6, 12px 800 tabular-nums, #e11d48, Flame 12px) '{N}% OFF' + 11px 700 #e11d48 '{금액}원 절약'. 최저 단가 기준 카드는 회색 알약 '기준 단가'(bg #f1f5f9, 10px 600 #64748b).
행5 정가 취소선: 15px 600 #9ca3af line-through '{정가}원'.
행6 최종가: 24px 800 tabular-nums tracking-tight #030712. 프로모션가면 11px 700 #f43f5e '프로모션가' + 24px 800 #e11d48.
행7 CTA: height 44px 전폭 radius 12px 배경 #2563eb 흰 14px 700 「충전하기」, group-hover 시 #1d4ed8 + scale(1.02). 로딩 시 '결제 준비 중'.
최대 할인 카드에는 우상단 절대배치 배지: linear-gradient(to right, #f43f5e, #f97316), 흰 10px 700, radius full, px 8px py 2px, Sparkles 10px, 라벨 「최대 할인」. 카드 배경도 bg-gradient-to-b from-rose-50/70 to-transparent.
확정 데이터 4장(그대로): 스타터 150C / 19,800원 / 132원당C / 30일 · 스탠다드 450C / 49,500원 / 110원 / 90일 · 프리미엄 1,500C / 132,000원 / 88원 / 180일 · 엔터프라이즈 4,500C / 330,000원 / 73원 / 365일. 자동출제 환산 문항수 = 크레딧÷2 (75 / 225 / 750 / 2,250문항).
```

#### 학생 앱 로그인 화면(/g) — 학원코드 4자 + 학생코드 6자

- 왜: 세미나 참석자가 폰으로 직접 체험 진입할 때 첫 화면. '아이디/비번 없이 코드 2개'라는 진입 마찰 제로 서사를 보여준다.
- 소스: `d:/Desktop/2026project/nara/src/app/g/login-client.tsx:75-144 + d:/Desktop/2026project/nara/src/components/grammar-drill/g-shell.tsx:45-54`
- 시각 스펙:

```
루트: min-height 100dvh, flex 중앙정렬, px 24px, 배경 #f6f5f1. 내부 폭 22rem(352px).
헤더(mb 40px, 가운데): 56×56 로고(radius 16px, object-cover, /smoat-logo.png) → h1 24px 700 tracking-tight 「SMOAT 학습」 → 13px #5a6372 「스모트 모바일 학습 — 과제 · 시험 · 어법 훈련」.
폼 카드 .gd-card: 배경 #fff, border 1px #e5e3db, radius 14px, padding 20px.
필드 2개 동일 구조: 라벨(11px 600 letter-spacing .08em, #98a0ad) 「학원코드」/「학생코드」 → mt 6px 인풋 랩(flex gap 10px, radius 12px, border 1px #d4d1c6, px 14px, height 48px): 아이콘 16px(School / KeyRound, #98a0ad, stroke 1.75) + input(투명 배경, mono 17px 600, letter-spacing .2em, 자동 대문자, placeholder '예: A1B2' / '예: X7K2M9', maxLength 8 / 12).
에러: mt 12px 12px #be123c 「학원코드 또는 학생코드가 올바르지 않습니다.」
제출 버튼: mt 20px 전폭 .gd-btn-primary(min-height 44px, radius 12px, 배경 #1d4ed8, 흰 13px 600), 라벨 「학습 시작」 / 진행 중 「확인 중…」, :active scale(.98).
하단: mt 20px 가운데 11px #98a0ad 「코드는 담당 선생님께 받을 수 있습니다.」
로그인 후 셸: 하단 고정 탭바(배경 rgba(255,255,255,.96) + blur 8px, border-top 1px #e5e3db) 4탭 — 홈 / 학습 / 과제 / 내 기록. 비활성 #98a0ad, 활성 #1d4ed8, 라벨 10px 600. 과제 탭에는 미완료 배지(min-width 16px, height 16px, radius full, 배경 #be123c, 흰 10px 700).
```


### 갭 / 미확인

- 세미나에서 쓸 '300크레딧 쿠폰'의 실제 배치 데이터(배치명·grantCredits=300·유효기간·발급 수량)는 DB에 있는 값이라 코드로 확인 불가. grantCredits는 관리자 화면 입력 필드(printable-coupons-admin-client.tsx:212·351)이므로 300은 하드코딩된 상수가 아님 — 실제 값은 관리자 화면에서 확인 필요.
- 프로덕션 도메인 확정 실패. 쿠폰 인쇄물 스텁에 'smoat.kr/coupon' 문자열이 하드코딩돼 있으나(coupon-print-view.tsx:151), buildClaimUrl은 런타임 origin을 받는다(printable-coupons.ts:45). 세미나용 QR의 실제 호스트는 배포 환경에서 확인 필요.
- 구독 요금제(Plan) 자체의 티어명·월 배정 크레딧·가격은 DB(getPlans)에서 오고 FEATURE_FLAGS.SHOW_SUBSCRIPTION_BILLING 기본 false라 UI가 꺼져 있음. 코드에서 플랜 티어 상수를 찾지 못했으므로 '요금제 표'는 만들 수 없다 — 현행 과금은 크레딧 선불 충전 4팩 단일로 보는 것이 안전.
- 드릴의 개념 시트(ConceptSheet)·질문 시트(ChatSheet) 내부 UI(sheets.tsx)와 AI 질문 1일 한도 정책은 시간 관계상 미열람. /g/home 하단에 '오늘 질문 N회 남았습니다'가 있으므로 일일 한도가 존재하나 정확한 숫자 미확인.
- 레슨(개념 학습) 블록 렌더러(DIAGRAM/WORKED/NOTEBOOK/게임/상태창 등 gd.css에 토큰만 확인)의 실제 화면 구성은 미열람 — learn-client.tsx / lesson-blocks-* 를 추가 정찰해야 '개념 학습' 슬라이드를 만들 수 있다.
- 기초(BASIC, b01~b07) 유닛에는 items 뱅크 JSON이 존재하지 않는다(items/ 는 u01~u12만). 기초 유닛의 드릴 문항 공급 경로(레슨 내 인터랙션인지, 훈련소 AI 생성 대기인지)는 미확인 — GRAMMAR_STUDIO_COPY.UNIT_EMPTY('이 유닛에는 아직 드릴 문항이 없습니다')가 이를 시사.
- 기능별 크레딧 표 중 EXAM_ANALYSIS의 '최소 15문항 floor'와 costOverride 실제 청구 로직은 상수 주석으로만 확인. 실제 청구 코드 경로 미검증.


---

## 각도 F — 학습지(worksheet) 생성 + 웹툰. 결론: (1) "학습지 종류"는 두 층으로 존재한다 — 인쇄 A4 학습지에 AI 없이 즉석 삽입하는 '학습 활동' 카탈로그 9종(4카테고리)과, 배포된 학습지를 학생 폰에서 푸는 인터랙티브 '스터디 스테이지' 11종(모드 3단계 프리셋). (2) 웹툰은 지문 1편 → 세로 9:16 이미지 '한 장' 생성이며, 6~8컷을 한 이미지 안에 통합 배치하도록 프롬프트가 강제한다(별도 컷 이미지 합성 아님). 화풍 5종·대사언어 4종·모델 2티어(5/10크레딧). (3) 실물 샘플 웹툰 이미지가 repo 로컬에 다수 존재한다(public/ 정식 자산 + .tmp-webtoon-* 실험 산출물 — 후자는 git 미추적이지만 디스크에 실재).

### 관측 사실

- **학습 활동 카탈로그(ACTIVITY_CATALOG)는 9종이 전부 enabled=true 로 등록돼 있다. 4개 카테고리는 "빈칸/복원" "직독직해" "어순/배열" "어휘".**
  - 근거: `d:/Desktop/2026project/nara/src/lib/passage-report/analysis-report/study-activities.ts:1029-1043`
  - 실제 문구: 키워드 빈칸 / 전지문 빈칸 / 중첩 라운드 빈칸 / 직독직해 빈칸 / 끊어읽기 + 영작 / 해석 쓰기 (영→한) / 백지 영작 (한→영) / 어순 배열 / 문장 순서 배열
- **각 활동의 한 줄 설명(카드 본문)이 코드에 그대로 있다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/passage-report/analysis-report/study-activities.ts:1031-1041`
  - 실제 문구: 키워드 빈칸 — "밀도를 정해 핵심 단어를 빈칸으로 — 품사 타깃·첫글자 힌트·단어은행" / 전지문 빈칸 — "지문 전체를 통째로 빈칸 처리 + 단어은행 1개 — 본문 통암기 확인지" / 중첩 라운드 빈칸 — "회차가 오를수록 빈칸이 늘어나는 점증 복원 — 한 블록에 통암기 계단" / 직독직해 빈칸 — "문장을 끊어 일부 청크를 빈칸으로, 우리말 뜻을 단서로 영어 복원" / 끊어읽기 + 영작 — "의미 단위(/)로 끊은 본문을 단서로 영어 문장을 다시 영작" / 해석 쓰기 (영→한) — "영어 문장을 보고 우리말 해석을 직접 적어 이해를 점검" / 백지 영작 (한→영) — "한국어 해석만 보고 영어 문장을 백지에서 복원 — 1등급 핵심 드릴 (전지문 모드)" / 어순 배열 — "문장을 의미 단위·단어·N단어로 섞어 바른 순서로 배열·영작 — 분할 방식은 추가 후 편집기에서 전환" / 문장 순서 배열 — "선택한 문장들을 섞어 글의 흐름대로 순서를 재배열 (3문장 이상)"
- **라벨 맵에는 카탈로그에 카드로 노출되지 않는 변형까지 12종의 정확한 한글 라벨이 정의돼 있다(어순 배열은 splitMode 에 따라 접미가 바뀜).**
  - 근거: `d:/Desktop/2026project/nara/src/lib/passage-report/analysis-report/study-activities.ts:1046-1059`
  - 실제 문구: 어순 배열 (의미 단위) / 어순 배열 (단어) / 키워드 빈칸 / 전지문 빈칸 / 중첩 라운드 빈칸 / 직독직해 빈칸 / 끊어읽기 + 영작 / 문장 순서 배열 / 해석 쓰기 (영→한) / 백지 영작 (한→영) / 단어 시험 / 동의어·반의어 매칭
- **활동 팔레트 상단 안내 문구 — '즉석 생성 · AI 없음 · 무제한 다시 섞기'가 핵심 셀링 카피다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/workbench/analysis-report/activity-palette-modal.tsx:67-70`
  - 실제 문구: 추출된 지문 데이터로 즉석 생성 · AI 없음 · 무제한 다시 섞기. 카드를 누르면 문서에 추가되고 바로 설정이 열려요.
- **학습지 미리보기 모달은 탭 3개로 가격 구조를 보여준다: 기본 학습지 / 실전 학습지 포함 / 학습 활동 N종(무료). N = enabled 활동 수(현재 9).**
  - 근거: `d:/Desktop/2026project/nara/src/components/workbench/passage-registration/learning-sheet-preview-modal.tsx:216-223, 188`
  - 실제 문구: 학습지 미리보기 · "실제 AI가 생성한 학습지 원본입니다 — 이 모습 그대로 만들어져요" · 탭: [기본 학습지 ◈N] [실전 학습지 포함 ◈N] [학습 활동 9종 무료]
- **활동 탭의 배너 카피 — 생성 후 편집기에서 무료로 추가한다는 점을 명시.**
  - 근거: `d:/Desktop/2026project/nara/src/components/workbench/passage-registration/learning-sheet-preview-modal.tsx:262-267`
  - 실제 문구: 학습지 생성 후, 편집기에서 카드를 눌러 원하는 만큼 추가하는 학습 활동입니다. / 추출된 지문 데이터로 즉석 생성 · AI 호출 없음 · 추가 비용 없음 · 무제한 다시 섞기
- **인쇄 학습지(analysis-report learning-worksheet 섹션)의 실제 지면 소단원 제목: 한글 제목 + 영문 키커 쌍으로 조판된다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/workbench/analysis-report/report-sections/worksheet-flow.tsx:89, 121, 186, 204, 219, 261, 292, 322, 369, 382; worksheet.tsx:305, 437, 479`
  - 실제 문구: Key Phrase Cloze / No Translation / 어법 선택 · 단어배열 영작(Workbook Drills) / 어법 선택 / 주요문장 단어배열 영작(Word Order) / Workbook Training / Grammar Choice / Vocabulary Choice / Vocabulary Cloze / Suneung Inference / 지문 논리 구조 분석(Logic Map) / 정답 및 해설(Answer Key) / 단어 목록
- **학생용 인터랙티브 스터디 스테이지는 11종이며 각각 제목·한 줄 설명(합니다체)·채점 여부가 상수로 고정돼 있다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/worksheet-study/types.ts:292-307`
  - 실제 문구: 지문 통독 — 문장별 해석과 끊어읽기로 지문을 익힙니다 / 어휘 카드 — 핵심 어휘를 카드로 넘기며 외웁니다 / 어휘 시험 — 뜻과 단어를 골라 어휘를 점검합니다 / 동의어·반의어 — 짝이 되는 어휘를 연결합니다 / 직독직해 — 의미 단위로 끊어 읽고 복원합니다 / 어법 점검 — 이 지문의 어법 포인트를 확인합니다 / 빈칸 복원 — 핵심 단어를 채워 본문을 복원합니다 / 어순 배열 — 단어와 문장을 바른 순서로 배열합니다 / 해석 쓰기 — 영어 문장을 우리말로 해석해 봅니다 / 백지 영작 — 우리말만 보고 영어 문장을 복원합니다 / 실전 문제 — 수능형 문제로 마무리 점검합니다
- **스터디 모드는 4단계(원본만/가볍게/표준/최대)이며 각 모드의 스테이지 구성·문항 상한이 프리셋 상수로 고정돼 있다(예: intense = vocabQuiz 40, clozeSentences 20, grammarItems 20).**
  - 근거: `d:/Desktop/2026project/nara/src/lib/worksheet-study/presets.ts:38-110; d:/Desktop/2026project/nara/src/components/study-assignments/composer-config-form.tsx:196-201`
  - 실제 문구: 학습 모드: 원본만 / 가볍게 / 표준 / 최대
- **모드별 도움말 문구가 학습지 배포 폼에 그대로 노출된다.**
  - 근거: `d:/Desktop/2026project/nara/src/components/study-assignments/composer-config-form.tsx:242-247`
  - 실제 문구: 원본만: 학생은 A4 학습지 지면만 열람하고 '다 확인했습니다'로 완료합니다. / 가볍게: 지문 통독 · 어휘 카드/시험 · 직독직해 · 빈칸 복원 · 실전 문제 — 핵심만 가볍게. / 표준: 어휘·직독직해·어법·빈칸·어순·해석 쓰기·실전 문제 — 표준 코스. / 최대: 표준 코스 + 백지 영작 · 고밀도 빈칸 — 통암기 최대 훈련.
- **스킬축 한글 라벨 7종(리포트·교사면 공용).**
  - 근거: `d:/Desktop/2026project/nara/src/lib/worksheet-study/types.ts:310-318`
  - 실제 문구: 어휘 / 직독직해 / 어법 / 빈칸 / 어순 / 영작·해석 / 독해
- **단어 시험지는 별도 컨트롤이며 출제 모드 4종 + 꺼짐.**
  - 근거: `d:/Desktop/2026project/nara/src/components/workbench/analysis-report/AnalysisReportEditor.tsx:1483-1489; d:/Desktop/2026project/nara/src/components/workbench/analysis-report/activity-options.tsx:283-298`
  - 실제 문구: 꺼짐 / 뜻 쓰기 / 단어 쓰기 / 동의어 쓰기 / 반의어 쓰기 — 옵션 패널: "단어 시험 옵션" · 출제 방향 [영→한 (뜻쓰기)] [한→영 (단어쓰기)] · 난이도 티어 [전체] [시험] [고난도] · 문항 수
- **[프로덕션 웹툰 파이프라인] 지문 1편 → 이미지 1장. 프롬프트가 '세로형(9:16) 교육용 웹툰 한 장에 6~8컷 통합 배치'를 명시적으로 지시한다. 컷별 개별 이미지 생성/합성이 아니다.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/webtoon-prompts.ts:69-82`
  - 실제 문구: 위 영어 지문의 내용과 흐름을 한 장의 세로형(9:16) 교육용 웹툰으로 그려줘. 한국 웹툰처럼 위에서 아래로 읽는 6~8컷을 한 이미지에 통합 배치한다. · 컷 사이는 여백이나 가는 구분선으로 자연스럽게 나누고, 인물의 표정·동작과 배경으로 지문의 핵심 사건이 한눈에 이해되도록 구성한다. · 글자는 또렷하고 읽기 쉽게, 철자 오류 없이 정확하게 쓴다. 말풍선/자막이 그림을 가리지 않도록 배치한다.
- **화풍(스타일)은 코드상 정확히 5종이며 각각 라벨·설명이 있다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/webtoon-page-types.ts:1-27`
  - 실제 문구: 한국 웹툰 — 현대 한국 교육 웹툰 느낌 / 3D 애니 — 밝고 입체적인 애니메이션 스타일 / 수채 애니 — 따뜻한 손그림 애니메이션 분위기 / 로맨스 만화 — 섬세하고 부드러운 순정만화 톤 / 실사풍 — 영화적인 조명과 사실적인 표현
- **대사 언어 모드는 4종. UI 카드에는 short 라벨이 굵게, description 이 아래 2줄로 표시된다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/webtoon-page-types.ts:33-58; d:/Desktop/2026project/nara/src/components/webtoon/webtoon-generate-fields.tsx:224-231`
  - 실제 문구: 한국어 (한국어 전용) — 대사·나레이션 모두 한국어 / 한+영 (한국어 + 영어 병기) — 영어 말풍선 + 한국어 번역 캡션 / 영어 (영어 전용) — 지문 원문 그대로 영어 / 영(대사)·한(설명) (대사 영어 + 해설 한국어) — 대사는 영어, 장면 설명·나레이션은 한국어
- **모델 티어 2종. STANDARD=google/nano-banana-2 (9:16, 2k, thinking high) 5크레딧, PREMIUM=openai/gpt-image-2 (2160x3840, quality high) 10크레딧.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/webtoon-models.ts:55-76; d:/Desktop/2026project/nara/src/lib/credit-costs.ts:32-33`
  - 실제 문구: 일반 — 빠르고 합리적인 품질 · 대부분의 지문에 적합 (◈5) / 프리미엄 — 가장 정교한 묘사 · 디테일이 중요할 때 (◈10)
- **생성 소요 안내는 '약 3분', 서버 타임아웃 기본 420초(7분), 재시도 2회. 실패 시 크레딧 자동 환불 후 status=FAILED.**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/webtoon-options-modal.tsx:177-181; d:/Desktop/2026project/nara/src/lib/webtoon-processor.ts:234-239, 199-222`
  - 실제 문구: 생성에는 약 3분 정도 걸려요. 시작한 뒤 다른 작업을 계속하셔도 완료되면 결과 목록에 표시됩니다.
- **웹툰 워크스페이스는 모바일에서 4스텝 플로우로 동작한다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/webtoon-page-client.tsx:72-77`
  - 실제 문구: 지문 입력 → 내 지문함 → 워크스페이스 → 웹툰 확인
- **결과물 화면은 스크롤 세로 이미지가 아니라 '카드 그리드'다. 모바일 1~2열 토글, PC lg 3/4/5열 토글, gap-4. 카드 썸네일은 aspect-[9/16] object-cover.**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/library/library-page-client.tsx:67-71, 845-851; d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/webtoon-queue-card.tsx:173-189`
- **보관함 상태 필터 칩 5개.**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/library/library-page-client.tsx:55-61`
  - 실제 문구: 전체 / 완료 / 생성 중 / 대기 / 실패
- **카드의 상태별 문구·배지 — 진행중은 스피너+안내, 완료는 우상단 '크게 보기' 배지, 자막 편집본은 초록 배지, 검수 토글은 미검수(빨강 테두리)/검수완료(초록).**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/webtoon-queue-card.tsx:190-231, 239-262`
  - 실제 문구: 대기 중 / 이미지 생성 중 / 완료되면 자동으로 표시됩니다. / 크게 보기 / 자막 편집됨 / 검수완료 / 미검수 / 수정하기 / 다운로드 / 다시 시도 / 생성에 실패했습니다.
- **완성 웹툰은 세로 한 장이므로 인쇄도 이미지 1장 폭 100%로 처리한다(@page margin:0).**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/webtoon-queue-card.tsx:531-547`
- **랜딩 페이지 Step6 데모는 실제 생성 웹툰 이미지 1장(The Gift of the Magi)을 720px 폭 카드에 넣고 줌 컨트롤로 보여준다 — 덱에 그대로 옮길 수 있는 구성.**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/demo/step6-webtoon/step6-webtoon-demo.tsx:11-56`
  - 실제 문구: 실제 지문으로 생성한 웹툰 — 확대해서 컷과 대사를 살펴보세요 / The Gift of the Magi — 지문 웹툰 / 이미지 저장 / 실제 생성 결과 그대로입니다 — 컷 구성·원문 말풍선·한국어 해석 캡션까지 자동
- **랜딩 웹툰 씬 카피(헤드라인·3대 셀링포인트).**
  - 근거: `d:/Desktop/2026project/nara/src/components/landing/webtoon-scene.tsx:44-83`
  - 실제 문구: FEATURE · 지문 기반 웹툰 / "읽기 싫어하는 학생에게는, 지문을 웹툰으로 만들어 주세요." / "같은 지문이 컷과 말풍선으로! 스토리로 먼저 이해하고 원문으로 돌아옵니다." / 지문 → 컷 분할 자동 — 장면·대사를 AI가 구성 / 말풍선 텍스트 편집 — 대사·해석을 강사가 직접 다듬기 / 수업 자료로 바로 활용 — 이미지로 저장해 프린트·배포
- **[샘플 자산] 프로덕션 웹툰 샘플이 public/ 에 실재한다: /landing/demo/webtoon/gift-of-the-magi.webp (477KB, 실제 생성 결과물), /features/shots/passage-webtoon/{hero,s1,s2,s3,s4}.png (295KB~987KB 스크린샷).**
  - 근거: `d:/Desktop/2026project/nara/public/landing/demo/webtoon/gift-of-the-magi.webp; d:/Desktop/2026project/nara/public/features/shots/passage-webtoon/hero.png`
- **[샘플 자산] 실험 산출 웹툰 원본이 repo 루트 .tmp-webtoon-* 6개 디렉토리에 실재한다(git 미추적·gitignore 아님 — 디스크에만 존재). .tmp-webtoon-final = 최종본 8지문 × 2컨셉(A-warm/B-noir) png+webp, 폰뷰 축소본, 스토리보드 JSON 8개 + SPEC.md, 스타일 플레이트 2장.**
  - 근거: `d:/Desktop/2026project/nara/.tmp-webtoon-final/A-warm/ebsi_go1_20260324-q22.png (3.4MB급 png, .webp 동봉); git ls-files .tmp-webtoon-final → 0건, git check-ignore → exit 1`
- **[샘플 자산] .tmp-webtoon-layout 에는 컷 레이아웃 A/B 비교 이미지가 있다: g6-1x6(6컷 1열), g6-2x3(6컷 2열×3행), g8-2x4(8컷 2열×4행), g12-2x6-이전버전 + 각 phone 축소본과 설명 txt.**
  - 근거: `d:/Desktop/2026project/nara/.tmp-webtoon-layout/g6-2x3.png, g6-1x6.png, g8-2x4.png, g12-2x6-이전버전.png`
- **[샘플 자산] .tmp-webtoon-ab 에는 톤 A/B 테스트 4종 full.png 가 있다(v1-cute-box, v2-cute-band, v3-macho-white, v4-macho-dark) + phone 뷰.**
  - 근거: `d:/Desktop/2026project/nara/.tmp-webtoon-ab/v1-cute-box/full.png 외 3종, .tmp-webtoon-ab/_phone/v1-phone390.png`
- **[실험 파이프라인] codex-native 경로는 프로덕션과 다르다 — 지문을 12컷 스토리보드 JSON(id/title/cast/cuts[{dir,nar,bub}])으로 먼저 분해한 뒤 이미지화한다. 나레이션은 40~58자, 말풍선은 한글 18자 이내 0~2개, 영어 핵심구를 한글 문장에 인라인 코드스위칭.**
  - 근거: `d:/Desktop/2026project/nara/.tmp-webtoon-final/_storyboards/SPEC.md:1-45; .tmp-webtoon-final/_storyboards/ebsi_go1_20260324-q22.json`
  - 실제 문구: 수능 영어 기출 지문 1개를 12컷 세로 웹툰 스토리보드(JSON)로 변환한다. / 좋은 예: 그러나 participants' minds determine 하는 것이 있다. 바로 훈련을 대하는 태도다
- **[실험 파이프라인] 코드에 남은 codex-native 컨셉은 2종이며, CUTE_PASTEL 은 10패널(제목 1 + 스토리 7~8 + 마무리 1), MACHO 계열은 10~12패널 9:16 계약이다. 동시성 10, 언어 고정 KO_EN.**
  - 근거: `d:/Desktop/2026project/nara/src/lib/exam-passages/codex-native-webtoon.ts:3-20, 72-84`
  - 실제 문구: 마초 블랙·레드 / 화이트톤 청소년 웹툰
- **학생 학습지 허브(/g/w/[taskId]) 화면 카피 전문 — 슬라이드로 그대로 옮길 수 있다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/g/w/[taskId]/hub-client.tsx:122-124, 152-162, 187-227, 288-311, 337-340, 356-360`
  - 실제 문구: 학습지 / 선생님 안내 / 진행 상황 / "{n}/{m} 단계 완료" / 숙달도 {n}% / 학습 시작하기 / 이어서 학습하기 / 결과 리포트 보기 / 학습 단계 / "{n}문항 · {m}분" / 진행 중 / 원본 학습지 보기 / 결과 리포트 / 필수 단계를 모두 완료하면 과제가 자동으로 완료됩니다 / 다 확인했습니다 / 확인 완료
- **스테이지 플레이어의 문항별 지시문(전부 합니다체·명령형 고정 문구).**
  - 근거: `d:/Desktop/2026project/nara/src/components/worksheet-study/item-cloze.tsx:154; item-grammar.tsx:78,167; item-match.tsx:87; item-mc.tsx:40; item-order.tsx:61,177; item-production.tsx:66,194; item-read.tsx:34`
  - 실제 문구: 빈칸에 알맞은 단어를 채우세요 / 이 문장이 어법상 맞는지 판단하세요 / 어법상 알맞은 표현을 고르세요 / 짝이 되는 것끼리 연결하세요 / 알맞은 것을 고르세요 / 조각을 순서대로 탭해 문장을 완성하세요 / 글의 흐름에 맞는 순서로 카드를 탭하세요 / 우리말로 해석해 보세요 / 우리말을 보고 영어 문장을 완성하세요 / 글의 핵심 한 줄
- **플레이어 하단 판정 배너·완료 화면 문구.**
  - 근거: `d:/Desktop/2026project/nara/src/components/worksheet-study/player-client.tsx:513-517, 528-534, 391-425, 545-556`
  - 실제 문구: 정답입니다! / 이 문항은 마지막에 다시 나옵니다 / 정답을 확인해 두세요 / 문제를 풀면 바로 채점됩니다 / 틀린 문항 다시 풀기 / 마치기 / "{stage.title} 완료" / "첫 시도 {n} / {m} · 약 {k}분" / 전부 맞혔습니다. 훌륭합니다! / 모든 필수 단계를 마쳐 과제가 완료 처리되었습니다 / 다음 단계로 / 학습 홈으로 / 학습을 잠시 멈출까요? / 지금까지 푼 내용은 저장됩니다. 언제든 이어서 할 수 있습니다.
- **학생면 디자인 시스템(.gd-*)의 정확한 색 토큰 — 라이트 고정, 리터럴 hex.**
  - 근거: `d:/Desktop/2026project/nara/src/app/g/gd.css:10-26`
  - 실제 문구: --gd-paper:#f6f5f1 / --gd-card:#ffffff / --gd-line:#e5e3db / --gd-line-strong:#d4d1c6 / --gd-ink:#16202e / --gd-ink-2:#5a6372 / --gd-ink-3:#98a0ad / --gd-blue:#1d4ed8 / --gd-blue-soft:#eef2fe / --gd-blue-line:#c7d4f8 / --gd-good:#047857 / --gd-good-soft:#ecfdf5 / --gd-bad:#be123c / --gd-bad-soft:#fff1f2 / --gd-master:#0f766e
- **국어 지문 상세의 학습자료 패널은 '국어 분석 학습지' + '지문 웹툰' 2카드 그리드로 나란히 놓인다(sm:grid-cols-2).**
  - 근거: `d:/Desktop/2026project/nara/src/app/(director)/director/korean/passages/[passageId]/korean-study-materials.tsx:110-230`
  - 실제 문구: 국어 분석 학습지 — "개관(갈래·주제·해제)부터 문단별 요지·핵심 개념어·구조도·예상 출제 포인트까지 A4 학습지 한 부로 정리합니다." · 버튼 [학습지 생성] "학습지 생성 중… (약 1~2분)" "생성에는 1~2분 정도 걸려요" [학습지 열람·편집] [다시 생성] // 지문 웹툰 — "지문의 내용과 흐름을 세로형 교육 웹툰 한 장으로 만들어 수업 자료로 활용합니다." · 버튼 [웹툰 만들기 · 보관함] "생성 약 3분 소요"
- **웹툰 SEO 기능 페이지의 히어로 스탯·불릿(마케팅 확정 카피).**
  - 근거: `d:/Desktop/2026project/nara/src/app/features/passage-webtoon/page.tsx:36-55`
  - 실제 문구: 영어 지문 웹툰 — 읽던 지문이 한 편의 웹툰으로 / 어려운 지문이 한 편의 이야기가 됩니다 / 6가지 웹툰 그림 스타일 · 1편 지문 하나로 완성 · 1클릭 보유 지문에서 바로 생성 / 지문 내용을 그대로 따라가는 스토리 구성 / 웹툰·3D 애니·수채화 등 6가지 그림 스타일 / 생성 후 말풍선·자막 텍스트 직접 편집 / 수업 자료·복습·학원 홍보 콘텐츠로 활용
- **[추론] 마케팅 페이지는 '6가지 그림 스타일'(한국 웹툰/3D 애니메이션/수채화/프렌치 신문 일러스트/실사/인물 중심 판타지)이라고 쓰지만, 실제 제품 상수 WEBTOON_STYLES 는 5종뿐이고 '프렌치 신문 일러스트'·'인물 중심 판타지'에 해당하는 id 가 없다. 덱에서는 코드 기준 5종으로 쓰는 것이 안전하다.**
  - 근거: `d:/Desktop/2026project/nara/src/app/features/passage-webtoon/page.tsx:80, 125 vs d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/webtoon-page-types.ts:1-27`
- **웹툰 생성 옵션 모달의 추가 지시사항 placeholder(실제 데모 입력값으로 쓰기 좋음).**
  - 근거: `d:/Desktop/2026project/nara/src/components/webtoon/webtoon-generate-fields.tsx:247`
  - 실제 문구: 예: 주인공은 고등학생, 배경은 한국 학교, 명대사는 큰 말풍선으로 강조...
- **국어 지문이면 프롬프트가 자동으로 '위 국어 지문' + 한국어 대사 지시로 강등된다(영어 경로 출력은 byte 동일 보장).**
  - 근거: `d:/Desktop/2026project/nara/src/lib/webtoon-prompts.ts:45-65`

### 덱 재현 대상 (visualSpec)

#### 웹툰 유형 선택 모달 (WebtoonGenerateFields)

- 왜: 'AI 웹툰'을 한 화면으로 증명하는 최고 밀도 UI. 모델 2티어(가격칩)·화풍 5·언어 4·추가지시가 한 판에 들어가 슬라이드 1장에 그대로 얹힌다.
- 소스: `d:/Desktop/2026project/nara/src/components/webtoon/webtoon-generate-fields.tsx + d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/webtoon-options-modal.tsx`
- 시각 스펙:

```
컨테이너: 흰 카드, rounded-2xl, border #e2e8f0(border-slate-200), shadow-2xl, max-w 768px(sm:max-w-3xl), 세로 flex, overflow hidden.
[헤더] border-b #f1f5f9, padding 24px/14px. 좌측 36x36 아이콘칩: rounded-lg, bg #eff6ff(blue-50), 아이콘색 #2563eb(blue-600), ring 1px #dbeafe(blue-100), lucide Palette. 제목 15px/700 #0f172a "웹툰 유형 선택", 그 아래 12px #64748b: "<b #334155>{지문 제목}</b> — 이 지문 하나로 한 장의 세로형 웹툰을 생성합니다." 우측 32x32 X 닫기(#94a3b8).
[본문] px-24 py-16, 세로 간격 14px.
(0) 지문 미리보기 바: rounded-xl border #e2e8f0 bg #f8fafc, 좌측 FileText 아이콘 #3b82f6, 12px #475569 한 줄 truncate.
(1) 섹션 라벨 행: 11px/700 uppercase tracking-wider #64748b, 우측 끝 10.5px #94a3b8 힌트. 라벨 텍스트: "생성 모델"(힌트 "예시 이미지를 누르면 크게 볼 수 있어요"), "화풍"(아이콘 Palette), "대사 언어"(아이콘 Languages), "추가 지시사항"(힌트 "선택 사항").
(2) 생성 모델: 2열 그리드 gap 8px. 카드 = rounded-xl border p-8px, 좌측 36x36 아이콘칩(선택시 bg #dbeafe/텍스트 #2563eb, 미선택 bg #f1f5f9/#64748b, 아이콘 Zap=일반·Gem=프리미엄), 제목 13px/700(선택 #1e3a8a, 미선택 #1e293b) + 크레딧칩(선택 bg #dbeafe 텍스트 #1d4ed8 / 미선택 bg #f1f5f9 #64748b, 10px, rounded-md), 설명 11px #64748b 2줄 클램프 min-height 2.8em. 카드 우측에 48px 폭 썸네일 버튼(rounded-lg, border #e2e8f0, object-cover, hover scale 1.05, 하단 검정 반투명 띠 rgba(15,23,42,.55)에 8.5px 흰 글씨 "예시").
  · 카드1 "일반" ◈5 / "빠르고 합리적인 품질 · 대부분의 지문에 적합"
  · 카드2 "프리미엄" ◈10 / "가장 정교한 묘사 · 디테일이 중요할 때"
(3) 화풍: md 이상 5열 그리드 gap 8px, 카드 rounded-xl border px-12 py-8, 제목 12.5px/700, 설명 10.5px #64748b 2줄 클램프. 순서/문구: 한국 웹툰|현대 한국 교육 웹툰 느낌, 3D 애니|밝고 입체적인 애니메이션 스타일, 수채 애니|따뜻한 손그림 애니메이션 분위기, 로맨스 만화|섬세하고 부드러운 순정만화 톤, 실사풍|영화적인 조명과 사실적인 표현.
(4) 대사 언어: md 이상 4열, 같은 카드 스펙. 제목은 short 라벨: 한국어 / 한+영 / 영어 / 영(대사)·한(설명). 설명: 대사·나레이션 모두 한국어 / 영어 말풍선 + 한국어 번역 캡션 / 지문 원문 그대로 영어 / 대사는 영어, 장면 설명·나레이션은 한국어.
(5) 추가 지시: textarea min-h 52px, rounded-xl, border #e2e8f0, bg rgba(248,250,252,.6), 12px, placeholder #94a3b8 "예: 주인공은 고등학생, 배경은 한국 학교, 명대사는 큰 말풍선으로 강조..."
[선택 상태 토큰(공통)] 선택: border #60a5fa(blue-400) + bg rgba(239,246,255,.7) + ring 1px #bfdbfe(blue-200). 미선택: border #e2e8f0 + bg #fff, hover border #cbd5e1 / bg #f8fafc. 전환 transition-all.
[푸터] border-t #f1f5f9, px-24 py-12. CTA 버튼: 높이 44px, 전폭, rounded-xl, bg #2563eb, 흰 700 14px, shadow-md 파란글로우 rgba(191,219,254,.5), hover #1d4ed8. 라벨 = lucide Wand2 + "웹툰 생성" + 흰 반투명칩(bg rgba(255,255,255,.2)) ◈5. 로딩 시 스피너 + "생성 시작 중…". 그 아래 중앙 11px #94a3b8: "생성에는 약 3분 정도 걸려요. 시작한 뒤 다른 작업을 계속하셔도 완료되면 결과 목록에 표시됩니다."
[모션 제안] 카드 선택 시 border/ring 120ms ease 전환, CTA hover 시 shadow 확대. 슬라이드에서는 화풍 5카드를 순차 0.06s stagger 로 페이드업 후, 2번 카드(3D 애니)에 선택 링이 스냅되는 연출.
```

#### 웹툰 결과 카드 그리드 + 상태 배지 (WebtoonQueueCard / 보관함)

- 왜: "웹툰 결과물이 화면에 어떻게 보이나"의 정답. 세로 스크롤 뷰어가 아니라 9:16 썸네일 카드 그리드 + 상태(대기/생성중/완료/실패) 라이브 갱신이라는 사실을 그대로 보여줌.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/workbench/webtoon/webtoon-queue-card.tsx + library/library-page-client.tsx`
- 시각 스펙:

```
[섹션 셸] rounded-lg border #e2e8f0 bg #fff shadow-sm. sticky 헤더: px-16 py-12, border-b #f1f5f9. 좌측 36x36 rounded-lg bg #eff6ff, lucide Image 아이콘 #2563eb, ring 1px #dbeafe. 제목 14px/700 #0f172a "생성한 웹툰". 우측에 실패 배지(border #fecaca, bg #fff1f2, text #be123c) "실패 2".
[필터 칩] 가로 나열 5개: 전체 / 완료 / 생성 중 / 대기 / 실패.
[그리드] display grid, gap 16px. 모바일 1 또는 2열 토글, lg 3열, 4열, (5열 옵션은 lg 4 → xl 5).
[카드] rounded-xl 흰 카드, 내부 padding 12px, 세로 flex gap 6px.
 · 1행(헤더): 체크박스 · 28x28 삭제 버튼(border #fecaca, bg #fef2f2, icon #dc2626, hover bg #fee2e2) · 지문 토글 버튼(높이 28px, border #e2e8f0, bg #f8fafc, FileText 아이콘 #60a5fa, 13px/600 #475569 truncate, 우측 chevron #94a3b8).
 · 2행(메타): 10.5px #94a3b8 "한국 웹툰 · 한국어 전용" (화풍 · 언어).
 · 3행(썸네일): aspect-ratio 9/16, rounded-lg, overflow hidden, border #e2e8f0. 완료면 img object-cover 꽉 채움 + 우상단 pill(bg rgba(0,0,0,.6), backdrop-blur, lucide Maximize2 흰색 + 9.5px/600 흰 "크게 보기"), 자막 편집본이면 좌상단 pill(bg rgba(5,150,105,.9)) 9.5px 흰 "자막 편집됨". hover 시 border #60a5fa + shadow-md.
   진행중이면 bg #f1f5f9 위 중앙에 20px 파란 스피너(#3b82f6) + 11px/500 #64748b "이미지 생성 중"(또는 "대기 중") + 10px #94a3b8 "완료되면 자동으로 표시됩니다."
   실패면 bg #fff1f2 border #fecdd3, AlertCircle #f43f5e, 11px #be123c 에러문 3줄 클램프, 아래 rounded-md bg #ffe4e6 11px/600 #be123c 버튼 "다시 시도"(RefreshCw).
 · 4행(푸터, 완료시): flex-wrap gap 4px, 높이 28px 버튼 3개 + 28x28 상세 아이콘 버튼. [검수완료/미검수] 토글 — 미검수: bg #fff, border #fecaca, text #fca5a5, hover 시 border #10b981·text #059669·bg #ecfdf5; 검수완료: border #10b981 text #059669. [수정하기](Pencil) [다운로드](Download) 는 border #e2e8f0 bg #fff text #475569 11px/600.
 · 선택 상태: 카드 전체 ring 2px #60a5fa + bg rgba(239,246,255,.3). 미검수 완료 카드: border #fecaca + 바깥 소프트 글로우 shadow 0 0 18px rgba(248,113,113,.12).
[모션] 슬라이드에서는 3장 카드가 '대기 중 → 이미지 생성 중(스피너) → 완료(이미지 페이드인 + 크게보기 배지 팝)'으로 0.8s 간격 순차 전환하면 파이프라인이 한눈에 읽힌다. 완료 전환은 opacity 0→1 + scale 1.02→1, 200ms cubic-bezier(.22,1,.36,1).
```

#### 학습 활동 팔레트 (ActivityPalettePanel) — 9종 온/오프 토글

- 왜: '학습지 종류'를 시각적으로 증명하는 정본 화면. 카테고리 4 × 카드 9 + 라이브 미리보기 + AI 없음 배너가 한 컷에 들어간다.
- 소스: `d:/Desktop/2026project/nara/src/components/workbench/analysis-report/activity-palette-modal.tsx`
- 시각 스펙:

```
[상단 안내 박스] rounded-md, border #f1f5f9, bg #fff, px 10px py 8px, 11px/1.6 #64748b: "추출된 지문 데이터로 즉석 생성 · <b #475569>AI 없음</b> · 무제한 다시 섞기. 카드를 누르면 문서에 추가되고 바로 설정이 열려요."
[카테고리 섹션] rounded-xl, border #e2e8f0, bg #fff, shadow-sm, overflow hidden. 헤더 = 전폭 버튼, bg rgba(248,250,252,.7), border-b #f1f5f9, px 12px py 8px, 제목 12px/900 #334155, 우측 개수 pill(rounded-full bg #f1f5f9, 9.5px/700 tabular-nums #94a3b8), 맨 오른쪽 24x24 chevron #94a3b8. 카테고리 순서: 빈칸/복원(4) → 직독직해(3) → 어순/배열(2) → 어휘.
[활동 행(grouped)] divide-y #f1f5f9 로 구분, px 12px py 10px, 세로 gap 6px.
 · 1행: 좌측 12.5px/700 #1e293b 활동명, 우측 토글 스위치 — 트랙 28x16 rounded-full, off #cbd5e1 / on #0ea5e9, 노브 12x12 흰 원 shadow-sm, off translateX 2px → on translateX 14px, transition-transform.
 · 2행: 11px/1.35 #64748b 설명문.
 · 3행: rounded-md border #f1f5f9 bg rgba(248,250,252,.8) px 8px py 6px — 9px/700 uppercase tracking-wider #94a3b8 라벨 "미리보기"(켜짐이면 "켜짐 — 다시 누르면 꺼져요"), 그 아래 11px #334155 2줄 클램프로 실제 지문에서 생성된 한 줄.
 · 켜짐 행 배경 rgba(239,246,255,.4), hover rgba(239,246,255,.7). 꺼짐 행 hover rgba(248,250,252,.8).
[카드 텍스트(그대로 사용)] 빈칸/복원: 키워드 빈칸 / 전지문 빈칸 / 중첩 라운드 빈칸 / 직독직해 빈칸. 직독직해: 끊어읽기 + 영작 / 해석 쓰기 (영→한) / 백지 영작 (한→영). 어순/배열: 어순 배열 / 문장 순서 배열. 어휘: '단어 시험지' 컨트롤 슬롯(모드 뜻 쓰기·단어 쓰기·동의어 쓰기·반의어 쓰기).
[모션] 슬라이드에서는 9개 토글이 위에서 아래로 0.08s 간격으로 순차 ON 되고, 우측에 A4 학습지 미리보기가 활동 수만큼 길어지는 연출(높이 transition 400ms)이 강력하다.
```

#### 학생 학습지 허브 화면 (/g/w/[taskId] WorksheetStudyHub)

- 왜: '인쇄 학습지 → 학생 폰 인터랙티브 코스'라는 서비스 서사의 클라이맥스 화면. 색 토큰이 리터럴 hex 로 전부 확정돼 있어 재현이 쉽다.
- 소스: `d:/Desktop/2026project/nara/src/app/g/w/[taskId]/hub-client.tsx + d:/Desktop/2026project/nara/src/app/g/gd.css`
- 시각 스펙:

```
[전역] 배경 #f6f5f1, 본문 잉크 #16202e, 카드 #ffffff, 헤어라인 #e5e3db(강조선 #d4d1c6). 기본 폰트 14px/1.5, word-break keep-all. 영어 지문 표기용 세리프 = Georgia/Times New Roman, line-height 1.72.
[헤더] bg #fff, border-bottom 1px #e5e3db, 좌측 40x40 원형 ← 버튼(#5a6372), 가운데 라벨(11px/600 letter-spacing .08em #98a0ad) "학습지" + 그 아래 13px/700 제목 truncate. 우측 D-day pill: 높이 22px, rounded-full, bg #f6f5f1, border 1px #e5e3db, mono 폰트, 기한초과면 warn 톤(bg #fff1f2 border #fecdd3).
[선생님 안내 띠] bg #eef2fe, border-bottom 1px #c7d4f8, px 16px py 8px, 12px #5a6372, 앞머리 굵은 #1d4ed8 "선생님 안내". 40자↑이면 1줄 클램프 + chevron 회전(180deg) 토글.
[진행 히어로 카드] .gd-card = bg #fff, border 1px #e5e3db, radius 14px, px 16px py 16px.
 · 좌: 라벨 "진행 상황" + 17px/700 "<mono>3/9</mono> 단계 완료". 우: 라벨 "숙달도" + mono 24px/700 "78<span 15px>%</span>".
 · 진행 미터: 높이 4px, radius 9999, 트랙 #e5e3db, 채움 #1d4ed8(전부 완료면 #047857), width 전환 400ms cubic-bezier(.22,1,.36,1).
 · CTA: 높이 44px 전폭, radius 12px, bg #1d4ed8, 흰 13px/600, lucide Play + "이어서 학습하기"(첫 진입은 "학습 시작하기", 전부 완료면 BarChart3 + "결과 리포트 보기"). :active 시 scale(.98).
[학습 단계 리스트] 라벨 "학습 단계" 아래 카드 세로 스택 gap 8px. 각 행 = .gd-card, px 16px py 14px, flex gap 12px.
 · 좌측 28x28 원형 번호: 미완료 bg #eef2fe/텍스트 #1d4ed8, 완료 bg #ecfdf5/텍스트 #047857, 12px/700.
 · 가운데: 15px/700 스테이지명, 12px #5a6372 부제, mono 11px #98a0ad "12문항 · 6분".
 · 우측: 완료&채점형이면 mono 12px/700 점수칩(bg #ecfdf5, 텍스트 #047857, radius 6px) "92점", 완료&무채점이면 초록 CheckCircle2 #047857, 진행중이면 11px/600 칩(bg #eef2fe, #1d4ed8) "진행 중", 미시작이면 chevron #98a0ad.
 · 실제 스테이지 문구(표준 코스 9행): 지문 통독|문장별 해석과 끊어읽기로 지문을 익힙니다 → 어휘 시험|뜻과 단어를 골라 어휘를 점검합니다 → 동의어·반의어|짝이 되는 어휘를 연결합니다 → 직독직해|의미 단위로 끊어 읽고 복원합니다 → 어법 점검|이 지문의 어법 포인트를 확인합니다 → 빈칸 복원|핵심 단어를 채워 본문을 복원합니다 → 어순 배열|단어와 문장을 바른 순서로 배열합니다 → 해석 쓰기|영어 문장을 우리말로 해석해 봅니다 → 실전 문제|수능형 문제로 마무리 점검합니다.
[하단 유틸] 2버튼 flex gap 8px, .gd-btn-ghost = 투명 bg + border 1px #d4d1c6 + 텍스트 #5a6372: "원본 학습지 보기"(FileText) / "결과 리포트"(BarChart3, 완료 0개면 opacity .45 비활성).
[안내문] 중앙 12px #5a6372 "필수 단계를 모두 완료하면 과제가 자동으로 완료됩니다".
[모션] 미터 0%→78% 채움(400ms), 단계 행이 위에서 아래로 stagger 페이드업, 완료 행의 점수칩만 나중에 pop(scale .9→1, 200ms).
```

#### 스테이지 플레이어 셸 + 빈칸 복원 인터랙션 (StudyPlayerClient / ItemCloze)

- 왜: '학습지가 진짜로 풀린다'를 증명하는 인터랙션 컷. 세그먼트 진행바 + 탭 채움 빈칸 + 즉시 채점 배너가 슬라이드에서 그대로 동작 재현 가능.
- 소스: `d:/Desktop/2026project/nara/src/components/worksheet-study/player-client.tsx + item-cloze.tsx + item-shared.tsx`
- 시각 스펙:

```
[셸] 전체 높이 100dvh, 세로 3분할.
 · 헤더: bg #fff, border-bottom 1px #e5e3db, px 10px py 8px. 좌 40x40 원형 X(#5a6372). 가운데 13px/700 스테이지명(복습이면 옆에 11px/600 #1d4ed8 "복습", 재도전이면 #be123c "다시 풀기"). 그 아래 세그먼트 진행바 = flex gap 3px, height 4px, 각 조각 flex:1 radius 9999; 미진행 #e5e3db, 현재 #1d4ed8, 완료 #047857. 우측 mono 12px/600 #98a0ad "7/12".
 · 본문: bg #f6f5f1, px 16px py 20px, 스크롤.
 · 푸터: bg #fff, border-top 1px #e5e3db, px 16px pt 12px, safe-area 패딩.
[빈칸 문항] 상단 소형캡 라벨(11px/600 letter-spacing .08em #98a0ad) "빈칸에 알맞은 단어를 채우세요". 필요 시 우리말 단서 박스 = radius 16px, bg #eef2fe, border 1px #c7d4f8, padding 16px, 13px #16202e.
 본문 문장은 인라인 플로우로 흐르고 빈칸은 인라인 버튼: display inline-flex, min-width 52px, min-height 44px, margin 2px 3px, padding 0 7px, radius 8px, border 2px solid transparent, font-weight 700, line-height 1.3.
 · 활성(다음 입력 대상): border #1d4ed8, bg #eef2fe, 글자 #1d4ed8.
 · 채워짐: bg #eef2fe, 글자 #1d4ed8.
 · 채점 정답: border #047857, bg #ecfdf5, 글자 #047857.
 · 채점 오답: border #be123c, bg #fff1f2.
 하단 단어은행 칩들을 탭하면 활성 빈칸에 순차로 들어가고, 채워진 빈칸을 다시 탭하면 비워지며 그 자리가 활성이 된다.
[확인 버튼] .gd-btn-primary 전폭, margin-top 16px, 높이 44px, radius 12px, bg #1d4ed8, 흰 13px/600, 라벨 "확인". disabled 시 bg #c3c9d6.
[판정 배너] radius 14px, border 1px, padding 10px 14px, 등장 애니메이션 gd-pop 200ms cubic-bezier(.22,1,.36,1). 정답: border #a7f3d0 / bg #ecfdf5 / CheckCircle2·텍스트 #047857 "정답입니다!". 오답: border #fecdd3 / bg #fff1f2 / RotateCcw·텍스트 #be123c "이 문항은 마지막에 다시 나옵니다"(재도전 라운드에서는 "정답을 확인해 두세요").
[다음 버튼] 전폭 primary, 라벨은 상황별 "다음" → 마지막 문항이면 "틀린 문항 다시 풀기" → "마치기", 우측에 ArrowRight. 미응답 상태에서는 버튼 대신 중앙 11px #98a0ad "문제를 풀면 바로 채점됩니다".
[완료 화면] 중앙 정렬: 48px CheckCircle2(#047857) → 라벨 "빈칸 복원 완료" → mono 48px/700 "92점" → 13px #5a6372 "첫 시도 11 / 12 · 약 7분" → 12px #047857 "전부 맞혔습니다. 훌륭합니다!" 또는 #5a6372 "틀린 N문항은 다시 풀어 보았습니다. 결과 리포트에서 취약점을 확인해 보세요." 과제 완료 시 pill(bg #ecfdf5, 텍스트 #047857) "모든 필수 단계를 마쳐 과제가 완료 처리되었습니다". 푸터 버튼 2개: primary "다음 단계로"(ArrowRight), ghost "학습 홈으로".
```

#### 실물 웹툰 샘플 이미지 세트 (덱에 그대로 싣는 자산)

- 왜: 세미나에서 '진짜 만들어진 웹툰'을 화면에 띄우는 것이 최대 임팩트. public/ 자산은 제품 정식 데모용이라 안전하게 쓸 수 있고, .tmp-webtoon-* 는 8개 실제 수능/모의고사 지문(2027_06_5095396-q20/q26/q33/q35, ebsi_go1_20260324-q22/q24/q30, ebsi_go1_20260604-q23)의 A-warm·B-noir 두 컨셉 결과물이 png+webp 로 쌍을 이룬다.
- 소스: `d:/Desktop/2026project/nara/public/landing/demo/webtoon/gift-of-the-magi.webp · d:/Desktop/2026project/nara/public/features/shots/passage-webtoon/{hero,s1,s2,s3,s4}.png · d:/Desktop/2026project/nara/.tmp-webtoon-final/{A-warm,B-noir}/*.{png,webp} · .tmp-webtoon-layout/{g6-1x6,g6-2x3,g8-2x4,g12-2x6-이전버전}.png · .tmp-webtoon-ab/{v1-cute-box,v2-cute-band,v3-macho-white,v4-macho-dark}/full.png · .tmp-webtoon-final/_style-plates/{plate-A,plate-B}.png`
- 시각 스펙:

```
[슬라이드 A — 단일 세로 웹툰 뷰어(랜딩 데모 재현)] 바깥 스크롤 영역 bg rgba(241,245,249,.7), px 12px py 16px. 안쪽 카드: 폭 720px 고정, rounded-2xl, border 1px #dbeafe(blue-100), bg #fff, padding 16px, shadow 0 30px 80px -30px rgba(59,130,246,.3). 카드 상단 행: 좌 12.5px/900 #020617 "The Gift of the Magi — 지문 웹툰", 우 파란 버튼(rounded-lg bg #2563eb, 12px/700 흰, lucide Download) "이미지 저장". 이미지: 전폭, rounded-lg, border 2px rgba(15,23,42,.8). 하단 캡션: 11.5px/600 #94a3b8 + lucide Sparkles(#3b82f6) "실제 생성 결과 그대로입니다 — 컷 구성·원문 말풍선·한국어 해석 캡션까지 자동". 상단 라벨 문구 "실제 지문으로 생성한 웹툰 — 확대해서 컷과 대사를 살펴보세요". 인터랙션: zoom 값으로 컨테이너 CSS zoom 을 조절(기본=폭 맞춤), 확대 시 스크롤 패닝.
[슬라이드 B — 컨셉 A/B 비교] 2열 그리드 gap 24px, 각 열 상단에 12px/700 라벨 "A · 웜톤" / "B · 느와르", 아래 9:16 이미지를 rounded-xl border 2px rgba(15,23,42,.8) 로. 같은 지문 id 를 좌우로 맞춰 넣는다(예: ebsi_go1_20260324-q22).
[슬라이드 C — 컷 레이아웃 실험] .tmp-webtoon-layout 의 g6-1x6 / g6-2x3 / g8-2x4 를 3열로 나란히, 각 하단 캡션 "6컷 1×6" "6컷 2×3" "8컷 2×4". 프로덕션 프롬프트가 요구하는 '6~8컷 한 장 통합'과 정확히 대응한다.
[모션] 세로 웹툰은 슬라이드 진입 시 컨테이너 높이를 고정한 채 이미지 object-position 을 top→bottom 으로 12s linear 이동시키는 '오토 스크롤' 연출이 가장 잘 먹는다(스크롤바 숨김, prefers-reduced-motion 시 정지).
```

#### 국어 학습자료 2카드 패널 (분석 학습지 × 지문 웹툰)

- 왜: '지문 하나 → 학습지 + 웹툰' 동시 산출이라는 제품 서사를 한 컷으로 요약하는 가장 작은 UI. 소요시간(1~2분 / 3분)과 크레딧까지 문구에 있어 세미나 Q&A 방어에 좋다.
- 소스: `d:/Desktop/2026project/nara/src/app/(director)/director/korean/passages/[passageId]/korean-study-materials.tsx`
- 시각 스펙:

```
컨테이너: grid, 1열 → sm 이상 2열, gap 16px.
[카드 공통] rounded-xl, border 1px #e2e8f0, bg #fff, padding 20px, 세로 flex. 상단 flex gap 12px: 36x36 rounded-lg 아이콘칩 + 텍스트 블록(제목 14px/600 #1e293b, 설명 12px/1.6 #64748b). 하단 액션 행은 border-top 1px #f1f5f9, padding-top 16px, flex gap 8px.
[카드1 — 국어 분석 학습지] 아이콘칩 bg #eff6ff, lucide BookOpenCheck #2563eb. 제목 "국어 분석 학습지". 설명 "개관(갈래·주제·해제)부터 문단별 요지·핵심 개념어·구조도·예상 출제 포인트까지 A4 학습지 한 부로 정리합니다." 액션: 파란 버튼(높이 32px, rounded-md, bg #2563eb, 12px/600 흰) "학습지 생성" + 흰 반투명 크레딧칩; 생성 중이면 스피너 + "학습지 생성 중… (약 1~2분)"; 옆 11px #94a3b8 "생성에는 1~2분 정도 걸려요". 이미 생성됐으면 [학습지 열람·편집](파란 버튼, PencilLine) + [다시 생성](흰 버튼, border #e2e8f0, RefreshCw, 회색 크레딧칩) + 우측 11px #94a3b8 "{날짜} 수정".
[카드2 — 지문 웹툰] 아이콘칩 bg #eef2ff(indigo-50), lucide Image #4f46e5(indigo-600). 제목 "지문 웹툰". 설명 "지문의 내용과 흐름을 세로형 교육 웹툰 한 장으로 만들어 수업 자료로 활용합니다." 액션: 흰 버튼(높이 32px, border #e2e8f0, 12px/600 #475569, hover border #bfdbfe·bg #eff6ff·text #1d4ed8) "웹툰 만들기 · 보관함" + 11px #94a3b8 "생성 약 3분 소요".
[모션] 두 카드가 좌우에서 각각 24px 슬라이드인 후, 카드1 버튼이 '학습지 생성 → 생성 중… → 학습지 열람·편집'으로, 카드2 썸네일이 빈 프레임 → 웹툰 이미지 페이드인으로 동시에 전환되면 '한 지문에서 둘 다 나온다'가 즉시 읽힌다.
```


### 갭 / 미확인

- 웹툰 '컷 분할'을 별도 LLM 스텝으로 수행하는 프로덕션 코드는 확인하지 못했다. 프로덕션 경로(src/lib/webtoon-processor.ts → buildWebtoonImagePrompt → AtlasCloud generateImage)는 지문 원문을 통째로 이미지 모델에 넘기고 '6~8컷을 한 이미지에 통합'하라고 지시할 뿐이며, 컷 스토리보드 JSON을 만드는 단계는 없다. 12컷 스토리보드(JSON) 파이프라인은 .tmp-webtoon-final/_storyboards + src/lib/exam-passages/codex-native-webtoon.ts 쪽 실험/기출지문 전용 경로다 — 이 둘을 슬라이드에서 섞어 말하면 사실 오류가 된다.
- 마케팅 페이지의 '6가지 그림 스타일'(프렌치 신문 일러스트·인물 중심 판타지 포함)은 코드 상수 WEBTOON_STYLES(5종)와 불일치한다. 어느 쪽이 최신인지(과거 6종이었다가 축소됐는지) 커밋 이력으로 확인하지 않았다.
- src/lib/exam-passages/webtoon-assets.ts, webtoon-review.ts, codex-native-webtoon-qa.ts(1283줄), src/lib/webtoon-text/*, 웹툰 자막 편집기(webtoon-text-canvas.tsx / webtoon-font-picker.tsx / detect-text·export API)는 존재만 확인했고 내용을 읽지 않았다 — '말풍선 텍스트 편집' 기능의 실제 UI 스펙은 미확보.
- src/lib/worksheet-study/compile.ts(911줄) 내부의 스테이지별 문항 생성 규칙(예: 어법 포인트 코드 a–m 매핑, cloze 밀도 계산)은 확인하지 않았다.
- src/components/vocab/{swipe-card,test-progress,test-result-summary}.tsx 는 파일 존재만 확인했고 내용을 읽지 않았다 — 어휘 스와이프 카드 UI의 시각 스펙 미확보.
- '실전 학습지'(inferenceSet/workbookSet)의 크레딧 단가 실제 숫자(basicUnitCost, PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST)는 상수 파일을 열어보지 않아 미확인.
- gd.css 의 .gd-chip/.gd-tile/.gd-option 등 일부 컴포넌트 클래스는 부분만 읽었다(전체 스펙 미확보).
- .tmp-webtoon-* 이미지들의 실제 화풍/컷 수는 파일명·SPEC 문서 기준으로만 서술했고, 이미지를 직접 열어 육안 확인하지는 않았다.


---

## [각도 H] 선생님이 보는 학생 분석 리포트 — SMOAT의 클라이맥스는 "채점 → AI 0콜 취약점 분해 → AI 상담 리포트 문서 → 취약점 원클릭 재배포"로 닫히는 하나의 루프다. 리포트는 외부 차트 라이브러리 없이 SVG/CSS로 자체 구현되어 있고(테마 CSS 변수 --rpt-* 6종), 모든 지표가 문항 번호 드릴다운으로 연결되며, 취약 셀을 누르면 그 범위 그대로 과제 컴포저가 열린다. 슬라이드로 재현 가치가 가장 높은 것은 ① 리포트 문서 9섹션(성적 개요 히어로 → 유형별 회계 원장 → 난이도 문항 흐름 → 함정 선지 대조 → 오답 관찰/처방 카드) ② 취약점 분해 버킷 드릴다운 ③ 유형 히트맵 셀 → 「이 범위로 과제 보내기」 → 3패널 컴포저 로 이어지는 원클릭 배포 체인이다.

### 관측 사실

- **AI 상담 리포트 문서는 9개 섹션 고정 타입이며 한글 heading이 상수로 박혀 있다: scoreOverview "성적 개요", typePerformance "유형별 성취도", difficultyMatrix "난이도별 결과", trapAnalysis "함정 분석", wrongDeepDive "오답 심층 분석", conceptMap "개념 지도", strengthWeakness "강점과 보완점", studyPlan "학습 계획", teacherComment "선생님 총평".**
  - 근거: `src/lib/exam-report/report-assemble.ts:31-41`
  - 실제 문구: 성적 개요 / 유형별 성취도 / 난이도별 결과 / 함정 분석 / 오답 심층 분석 / 개념 지도 / 강점과 보완점 / 학습 계획 / 선생님 총평
- **각 섹션 헤더는 「번호 카운터(01, 02…) / 라틴 kicker」 메타 라인 + 헤딩 + 헤어라인(선두 32px만 primary 2px) 구조. kicker 실값은 SCORE OVERVIEW, TYPE PERFORMANCE, DIFFICULTY MATRIX, TRAP ANALYSIS, WRONG ANSWER DEEP DIVE, CONCEPT MAP, STRENGTHS & GAPS, STUDY PLAN, TEACHER'S NOTE.**
  - 근거: `src/components/exam-report/report/sections/section-shell.tsx:73-126 / score-overview.tsx:258 / type-performance.tsx:321 / difficulty-matrix.tsx:353 / trap-analysis.tsx:59 / wrong-deep-dive.tsx:57 / concept-map.tsx:272 / strength-weakness.tsx:121 / study-plan.tsx:140 / teacher-comment.tsx:49`
  - 실제 문구: SCORE OVERVIEW · TYPE PERFORMANCE · DIFFICULTY MATRIX · TRAP ANALYSIS · WRONG ANSWER DEEP DIVE · CONCEPT MAP · STRENGTHS & GAPS · STUDY PLAN · TEACHER'S NOTE
- **리포트 테마 6종의 팔레트가 hex로 확정되어 있다. 기본값 indigo-consult = primary #1D4ED8, ok #059669, bad #E11D48, neutral #64748B, tint #EFF4FF, surface #F8FAFE, line #DBE3F2, accentSoft #C9D9F7. 나머지: slate-pro(#1E293B), teal-fresh(#0D9488), navy-classic(#1E3A5F), ink-editorial(#18181B), forest-tutor(#166534). 주석에 「전 테마 인쇄 안전(밝은 배경 기반). 금지: 주황/앰버, 흰 배경 보라 그라데이션」 명문화.**
  - 근거: `src/components/exam-report/report/report-themes.ts:19,54-152`
  - 실제 문구: 컨설팅 블루 — 딥 블루 · 신뢰의 컨설팅 스탠다드 / 모노크롬 프로 — 흑백 대비 · 정밀한 대시보드 / 그로스 코치 — 밝은 틸 · 경쾌한 성장 서사 / 클래식 저널 — 명조 페어링 · 품격 있는 지면 / 잉크 매거진 — 먹색 타이포 · 매거진 에디토리얼 / 포레스트 멘토 — 딥 그린 · 아이보리 멘토링
- **정오 4상태는 색 + 기호 + 라벨 이중 부호화 계약. CORRECT=var(--rpt-ok)/✓/정답, WRONG=var(--rpt-bad)/✗/오답, PARTIAL=var(--rpt-primary)/△/부분, UNKNOWN=var(--rpt-line)/·/미입력.**
  - 근거: `src/components/exam-report/report/report-charts.tsx:18-35`
  - 실제 문구: 정답 ✓ / 오답 ✗ / 부분 △ / 미입력 ·
- **성적 개요 히어로 밴드: 좌측 「Total Score」 킥커(tracking 0.26em) + 총점 CountUp 56px(모바일)/68px(≥640px) extrabold + "/ 만점", 우측 정답률 26px + 1.5px 드로우온 바 + 보조 스탯(정답 문항 N/M문항, 실점 −N점) + 정오 분해 칩(✓정답/✗오답/△부분/·미입력).**
  - 근거: `src/components/exam-report/report/sections/score-overview.tsx:262-340`
  - 실제 문구: Total Score / 정답률 / 정답 문항 / 실점
- **반평균 비교 카드: 킥커 「Class Average」 + 「내 점수」·「반평균」 2행 수평 바(h-2.5) + 우상단 격차 배지. 격차 문구는 「반평균 대비 +N점」/「반평균 대비 −N점」, 동일 시 「반평균과 동일」. 색은 +면 var(--rpt-ok), −면 var(--rpt-bad).**
  - 근거: `src/components/exam-report/report/sections/score-overview.tsx:146-199`
  - 실제 문구: Class Average / 내 점수 / 반평균 / 반평균 대비 +3점 / 반평균과 동일
- **성적 개요 하단에 「한 줄 진단」 인용 카드(배경 var(--rpt-tint), 좌측 3px primary 바, 16px semibold 1.7 행간)와 미입력 각주가 붙는다.**
  - 근거: `src/components/exam-report/report/sections/score-overview.tsx:347-375`
  - 실제 문구: 한 줄 진단 / ※ 미입력 3문항은 채점에서 제외하고 정답률을 계산했습니다.
- **유형별 성취도는 '회계 원장' 문법. 컬럼 헤더 「실점 유형 N | 정오 | 정답률 | 실점」, 실점 상위 2개 유형에 「실점 1위」/「실점 2위」 rose 아웃라인 배지, 마지막 「합계」 행 위에 3px double var(--rpt-neutral) 마감 이중선. 상세 행은 최대 8행(초과 시 max-height 440px 내부 스크롤, 인쇄 시 전량 확장).**
  - 근거: `src/components/exam-report/report/sections/type-performance.tsx:31,98-229`
  - 실제 문구: 실점 유형 5 / 정오 / 정답률 / 실점 / 실점 1위 / 미채점 2 / 합계 / 전 12유형 · 배점 68 / 100 획득
- **만점 유형은 행을 세우지 않고 「정복한 유형 N — 출제 문항 전부 정답」 점선 리더(차례 문법) 2~3컬럼 그리드로 접고, 미채점 유형은 「채점 대기 N」 칩 소그룹으로 분리한다.**
  - 근거: `src/components/exam-report/report/sections/type-performance.tsx:232-287,329-333`
  - 실제 문구: 정복한 유형 4 — 출제 문항 전부 정답 / 채점 대기 2 / 배점을 잃은 유형만 상세로 올리고, 만점 유형 4개는 아래 요약으로 접었습니다.
- **레이더 차트(TypeRadar)는 유형이 6개 이상일 때만 렌더하고 최대 8축. 격자 4겹 폴리곤(0.25/0.5/0.75/1.0), 값 폴리곤은 fill var(--rpt-primary) fillOpacity 0.16 + stroke 1.8px, 축 라벨 10px. 캡션은 「유형 정답률 균형」(+ 캡 시 「· 실점 유형 우선 8개 표시」).**
  - 근거: `src/components/exam-report/report/report-charts.tsx:217-290 / sections/type-performance.tsx:28-29,342-356`
  - 실제 문구: 유형 정답률 균형 · 실점 유형 우선 8개 표시
- **난이도별 결과 ①: 난이도 1~5 스탯 밴드. ≥640px는 5칸 그리드 타일(배경 var(--rpt-surface), 1px var(--rpt-line) 보더, 18px extrabold 정수 %, h-1 바, 「3/4 정답」 분수), <640px는 풀폭 원장 행 5줄로 레이아웃 자체를 전환한다.**
  - 근거: `src/components/exam-report/report/sections/difficulty-matrix.tsx:78-148`
  - 실제 문구: 난이도 1 / 3/4 정답 / 출제 없음 / 채점 전
- **난이도별 결과 ②: 문항 도트를 난이도가 아니라 '출제 순서' 그대로 배열한 「문항 흐름 — 출제 순서」 매트릭스. 도트는 상태색 배경 + 번호 + 기호, 아래에 난이도 5눈금 틱(3px×5px), 배점 4점 이상 문항은 이중 링 boxShadow "0 0 0 2px var(--rpt-surface), 0 0 0 3.5px var(--rpt-neutral)". 범례는 이 시험에 실재하는 상태만 조건부 노출.**
  - 근거: `src/components/exam-report/report/sections/difficulty-matrix.tsx:37-38,151-230`
  - 실제 문구: 문항 흐름 — 출제 순서 / 배점 4점 이상 / 난이도 눈금
- **난이도별 결과 ③: 2컬럼 시그널 카드. 좌=킥커 RECOVERABLE POINTS / 제목 「아까운 실점」 / 합계 「−N점」 rose, 우=킥커 TOP-TIER SIGNAL / 제목 「상위권 시그널」 / 「+N점」 emerald. 항목 3개 이하면 난이도 눈금·상태까지 실은 원장 행으로 승격, 많으면 번호 칩(예: 「6번 3점」) 랩핑.**
  - 근거: `src/components/exam-report/report/sections/difficulty-matrix.tsx:243-337,376-405`
  - 실제 문구: 아까운 실점 — 난이도 1~2 문항에서의 오답 — 실력보다 절차의 문제일 확률이 높고, 가장 빨리 회수할 수 있는 점수입니다. / 상위권 시그널 — 난이도 4~5 문항에서의 정답 — 상위권을 가르는 변별 구간에서 이미 득점하고 있다는 근거입니다.
- **함정 분석은 학생이 실제로 고른 선지를 주인공으로 삼는다. 카드마다 문항 번호 칩 + 「선택」 라벨 + ①~⑤ 원형숫자 20px bold var(--rpt-bad) + 우측 「▲ 설계된 함정」(bad 톤) 또는 「· 일반 오답」(neutral 톤) 배지. 카드 좌상단에 상태색 2px×32px 세그먼트.**
  - 근거: `src/components/exam-report/report/sections/trap-analysis.tsx:35-45,98-160`
  - 실제 문구: 선택 / ▲ 설계된 함정 / · 일반 오답
- **함정 대응력 게이지(TrapMeter)는 좌→우 「좋음(LOW, ok색)·보통(MID, primary)·주의(HIGH, bad)」 3세그먼트 h-2 바 + 활성 세그먼트 위 ▲ 마커. 근거 수치는 「오답 N건 중 M건 설계 함정 적중」. 표본 3건 미만이면 게이지를 그리지 않고 「판정 보류」로 강등한다.**
  - 근거: `src/components/exam-report/report/report-charts-lists.tsx:126-208 / sections/trap-analysis.tsx:78-84,162-177`
  - 실제 문구: 함정 대응력: 주의 / 오답 9건 중 6건 설계 함정 적중 / 설계된 함정 선지를 고른 비율 기반 / 선지 기록이 남은 오답이 2건뿐이라 성향 판정을 보류했습니다 — 판정에는 3건 이상의 표본이 필요합니다.
- **오답 심층 분석은 문항별 '임상 기록 카드' 반복. 헤더=번호 칩(primary 배경 흰 글씨) + 유형 라벨 + 개념 태그 칩 4개 캡(+「외 N」), 본문=「무엇이 일어났나」(관찰, slate-400 라벨) → 「이렇게 고친다」(처방, 좌측 2px primary 보더, mt-auto로 카드 바닥 앵커). 9문항 이상이면 앞 6개만 풀 카드 + 나머지는 「나머지 N문항 — 교정 포인트 요약」 다이제스트 행.**
  - 근거: `src/components/exam-report/report/sections/wrong-deep-dive.tsx:31-35,63-67,87-211`
  - 실제 문구: 무엇이 일어났나 / 이렇게 고친다 / 오답·부분점수 11문항 — 핵심 6문항 심층 카드 + 5문항 교정 요약 / 나머지 5문항 — 교정 포인트 요약 / 이번 시험에는 심층 분석이 필요한 오답이 없습니다.
- **개념 지도는 weak를 주인공으로 승격. 좌 패널 「△ 보완이 필요한 개념」 안에 「우선 보강 1순위」 하이라이트 박스(테두리·배경 color-mix로 bad 30%/6%) + 상세 행 최대 6 + 「그 외 보완 개념 N개」 칩. 우 패널 「✓ 탄탄한 개념」은 행 렌더 금지, 칩 구름 24개 캡 + 「외 N개 개념」. 개념 옆 번호 칩(「12번」)이 근거.**
  - 근거: `src/components/exam-report/report/sections/concept-map.tsx:30-36,71-86,104-125,144-152,216-227,276-282`
  - 실제 문구: 우선 보강 1순위 / 보완이 필요한 개념 / 탄탄한 개념 / 맞힌 문항에서 확인된 개념 자산 — 출제 빈도가 높은 순입니다. / 문항 해설에서 뽑아낸 개념을 정오답 기준으로 가른 지도입니다. 틀린 문항에 걸려 있던 개념은 보완할 개념으로, 맞힌 문항에서 확인된 개념은 이미 갖춘 개념 자산으로 분류했습니다. 개념 옆 번호 칩은 그 개념이 걸린 문항입니다.
- **강점/보완점은 2컬럼 극성 카드. 카드 최상단 2px 극성 룰(강점 var(--rpt-ok), 보완점 var(--rpt-bad)) + 기호 배지(✓/△) + 「N항목」 카운트. 항목 8개 초과 시 카드 내부 max-height 384px 스크롤(인쇄 전량 확장).**
  - 근거: `src/components/exam-report/report/sections/strength-weakness.tsx:33,62-78,124-148`
  - 실제 문구: 강점 / 보완점 / 문항별 정오답 분석에서 추려낸, 이번 시험이 증명한 강점과 다음 시험 전에 다듬을 보완 지점입니다.
- **학습 계획은 좌측 2px 레일 타임라인 + 주차 번호 배지(01, 02…, 원형 h-7/w-7, primary 배경) + 마지막 주 「마무리 재점검」 배지 + 레일 종지부 ◆(7px 회전 45도). 태스크에는 인쇄 후 손으로 체크하는 15px 빈 체크박스(1.5px 보더 var(--rpt-neutral)).**
  - 근거: `src/components/exam-report/report/sections/study-plan.tsx:53-64,90-100,108-121,158-168`
  - 실제 문구: 마무리 재점검
- **선생님 총평은 서명형 편지 카드. 64px 인용부호(var(--rpt-accent-soft), 헤딩 폰트) → 본문 15.5px/1.9 → 하단 헤어라인 + 「From」(tracking 0.26em) + 서명 「{학원명} 담당 선생님」 + 별행 작성일.**
  - 근거: `src/components/exam-report/report/sections/teacher-comment.tsx:40,52-99`
  - 실제 문구: From / 담당 선생님 / 총평이 아직 작성되지 않았습니다.
- **문서 루트는 880px 단일 컬럼, 섹션 번호는 CSS counter(decimal-leading-zero)로 DOM 순서=번호. 내러티브 **강조**는 .rpt-em(글자 하단 36%에 primary 16% 하이라이트 그라데이션)으로 렌더된다.**
  - 근거: `src/components/exam-report/report/report-document.tsx:42-54,157`
- **모션 규약이 CSS 상수로 확정: ease cubic-bezier(0.22,1,0.36,1), data-reveal은 opacity 0/translateY(14px) → 600ms, 가로바 width 900ms(delay 150ms), SVG 원호 stroke-dasharray 900ms, 폴리곤 scale(0.72)→1 700ms. IntersectionObserver threshold 0.15로 섹션당 1회. CountUp은 900ms easeOutCubic, 인쇄·reduced-motion에서는 전부 즉시 최종값.**
  - 근거: `src/components/exam-report/report/report-motion.tsx:27,36-85,104-113,144-152`
- **리포트 커버는 3종(gradient-band / minimal-line / photo-frame=잉크 에디토리얼). 공통 킥커 「EXAM ANALYSIS REPORT」, 메타 라벨은 STUDENT / EXAM / ACADEMY / ISSUED. gradient-band는 linear-gradient(150deg, var(--rpt-primary), color-mix(in srgb, var(--rpt-primary) 58%, black)) 밴드 위 흰 타이틀 34px→52px extrabold + 하단 백지 메타 그리드.**
  - 근거: `src/components/exam-report/report/report-cover.tsx:29,37-44,226-266`
  - 실제 문구: EXAM ANALYSIS REPORT / STUDENT · EXAM · ACADEMY · ISSUED
- **AI 리포트와 별개로 '분석 탭'이 존재하며 LLM 호출 0회다. 구성은 (1) 응시 메타+점수 히어로 (2) 취약 하이라이트 (3) 다차원 취약점 분해 (4) 문항별 결과 그리드 (5) AI 상담 리포트 게이트웨이.**
  - 근거: `src/components/exam-report/grading/analysis-step.tsx:5-13,194-298`
- **분석 탭 히어로의 타임라인 라벨은 「배포 / 응시 시작 / 제출 / 소요 시간 / 마감」이며 마감 초과 시 rose 「기한 지남」 배지가 붙는다. 상단 배지는 「자체 시험지 응시」·「자체 시험지 · 수동 등록」·「외부 시험 분석」, 「OMR 입력」/「태블릿 응시」, 「채점 확정」/「채점 미확정」.**
  - 근거: `src/components/exam-report/grading/analysis-hero.tsx:71-144`
  - 실제 문구: 배포 / 응시 시작 / 제출 / 소요 시간 / 마감 / 기한 지남 / 자체 시험지 응시 / OMR 입력 / 태블릿 응시 / 채점 확정 / 채점 미확정 / 아래 분석은 현재 입력된 정오 기준입니다. 채점을 확정하면 결과가 고정됩니다.
- **분석 탭 정답률은 92px SVG 링 게이지(stroke 9, track stroke-slate-100, progress stroke-blue-600, rotate -90). 중앙에 17px extrabold %와 「정답률」 라벨. 좌측에는 32px 점수 + 4색 도트 카운트(emerald/rose/blue/slate-300).**
  - 근거: `src/components/exam-report/grading/analysis-hero.tsx:163-273`
- **채점 화면 4색 계약 STATUS_STYLE: CORRECT=○ emerald-600/emerald-50/emerald-500, WRONG=✕ rose-600/rose-50/rose-500, PARTIAL=△ blue-700/blue-50/blue-500, UNKNOWN=· slate-400/white/slate-300. 주석에 「주황/앰버 금지」 명시.**
  - 근거: `src/components/exam-report/grading/grading-shared.ts:32-70`
- **취약 하이라이트는 3개 카드: 「가장 취약한 유형」·「가장 취약한 지문」·「보강할 개념」. 각 카드는 라벨 + 정답률(rose 13px extrabold) + h-1.5 3색 스택바 + 오답 문항 번호 칩 6개(+N).**
  - 근거: `src/components/exam-report/grading/analysis-step.tsx:182-192,304-373`
  - 실제 문구: 가장 취약한 유형 / 가장 취약한 지문 / 보강할 개념 / 오답 4/12
- **취약점 분해는 4차원 탭(유형별·난이도별·지문별·개념별) × 3정렬(취약순·오답순·문항순) + 차원 내 필터(항목 멀티셀렉트, 「문항 표시」 정오 4토글, 「오답 있는 유형만」, 초기화). 난이도 라벨은 기본/중급/킬러 고정 순서.**
  - 근거: `src/components/exam-report/grading/analysis-breakdown.tsx:49-68,168-352 / grading-weakness.ts:94-98`
  - 실제 문구: 취약점 분해 / 차원별 정답률 — 문항 번호를 누르면 원본 문항이 열립니다. / 유형별 · 난이도별 · 지문별 · 개념별 / 취약순 · 오답순 · 문항순 / 문항 표시 / 오답 있는 유형만 / 초기화 / 지문 분석은 원본 문항이 있는 시험지에서만 제공됩니다.
- **버킷 행(BucketRow)이 문항별 드릴다운의 핵심 구조다. 접힘 = 헤더(라벨 + 정답률 % + N/M + 「N문항 M점」 + 정답률 50% 미만이면 rose 「주의」 배지) + h-2 4색 스택바(emerald 정답 / blue 부분 / rose 오답 / slate-300 미상) + 정오색 문항 칩 한 줄. 펼침 = (지문별이면 지문 발췌 line-clamp-4 mono) + 문항별 미니 행(상태 기호 → 번호 → 유형 → 「학생답 → 정답」 → 「획득/배점점」).**
  - 근거: `src/components/exam-report/grading/analysis-bucket-row.tsx:39-44,74-232`
  - 실제 문구: 주의 / 문항 / 미입력 / 문항 표시 필터에 해당하는 문항이 없습니다.
- **문항별 결과 그리드는 auto-fill minmax(6.5rem,1fr) 타일. 타일마다 번호(14px extrabold) + 상태 기호 + 유형 라벨 + 배점. 타일 색은 상태별 border/bg 페어(emerald-200/emerald-50-50, rose, blue, slate).**
  - 근거: `src/components/exam-report/grading/analysis-question-grid.tsx:33-50,66-146`
  - 실제 문구: 문항별 결과 / 타일을 누르면 원본 문항·해설·학생답이 열립니다.
- **문항 상세 모달은 좌=원본 문항(시험지 생성 페이지와 동일한 QuestionCard 렌더러, 지문 포함) / 우=레일 3카드 「채점」(학생 답 → 정답 → 판정 → 배점) · 「해설」 · 「출제 분석」(출제 의도 / 출제 포인트 / 접근 전략 / 난이도 근거 / 핵심 개념 / 오답 함정). ←/→ 키로 전 문항 축 이동, ESC 닫힘, Tab 포커스 트랩.**
  - 근거: `src/components/exam-report/grading/question-detail-view.tsx:6-13,153,301-460`
  - 실제 문구: 채점 / 학생 답 / 정답 / 판정 / 배점 / 해설 / 출제 분석 / 출제 의도 / 출제 포인트 / 접근 전략 / 난이도 근거 / 핵심 개념 / 오답 함정 / 원본 문항 미리보기는 서비스에서 생성·배포한 시험지에서만 제공됩니다.
- **AI 상담 리포트 게이트웨이 카드가 분석 탭 하단에 상주한다. 상태 배지 「리포트 완성」/「공유 중」/「직전 생성 실패 · 크레딧 자동 환불」, CTA는 「AI 리포트 만들기」(CreditCostChip 동반)·「리포트 열기」·「생성 진행 중 — 보기」. 채점 미확정이면 생성 차단.**
  - 근거: `src/components/exam-report/grading/analysis-step.tsx:377-472`
  - 실제 문구: AI 상담 리포트 / 이 분석 데이터를 바탕으로 학부모 공유용 상담 리포트를 생성합니다. / AI 리포트 만들기 / 리포트 열기 / 생성 진행 중 — 보기 / 채점을 확정하면 생성할 수 있습니다.
- **리포트 생성 폼에는 선택 입력 「반 평균 (선택)」(placeholder 예: 72)·「등급/석차 (선택)」(예: 3등급)과 데이터 밀도 3단(정오만 slate / 선지 포함 blue / 정밀 emerald) 안내가 있다.**
  - 근거: `src/components/exam-report/grading/report-step.tsx:40-56,95-145`
  - 실제 문구: 상담 리포트 생성 / 확정된 정오표로 학생 맞춤 상담 리포트를 만듭니다. / 반 평균 (선택) / 등급/석차 (선택) / 데이터 밀도 / 정오만 — 정오 데이터로 리포트를 생성합니다. 오답 선지·반평균을 더하면 정밀해집니다. / 선지 포함 — 오답 선지가 포함돼 함정 분석이 가능합니다. / 정밀 — 충분한 정보로 정밀한 상담 리포트를 생성합니다.
- **학생 허브 시험 탭은 히트맵을 쓴다. 「유형별 정답률」 카드 = 행 유형 × 열 회차(1회, 2회…) 히트 셀. 색은 5단 heatToneByRate: ≥80 bg-emerald-600 text-white, ≥60 bg-emerald-400 text-white, ≥40 bg-emerald-200 text-emerald-900, ≥20 bg-rose-200 text-rose-900, 그 미만 bg-rose-400 text-white, 기록 없음 bg-slate-100 text-slate-400. 「낮을수록 붉다」가 3탭 공통 의미이며 주황/앰버 금지.**
  - 근거: `src/components/students/hub/analytics/kit.tsx:105-117 / exam-tab/type-heatmap-card.tsx:71,166-186,239-245`
  - 실제 문구: 유형별 정답률 / 기록 없음 / 낮음 … 높음 / 정답률은 맞고 틀림만 세는 단순 비율이에요
- **[취약점 → 후속 과제 재배포 기능은 실재한다] 히트맵 셀을 누르면 fixed 좌표 팝오버(w-64)가 열려 유형명 + 「정답률 33% (3/9) · 전체 회차 합산」 + 회차 문맥을 보여주고, 하단에 WeakPointCta card형 「이 범위로 과제 보내기」가 붙는다. 역매핑 실패 시 비활성 + 사유 툴팁.**
  - 근거: `src/components/students/hub/exam-tab/type-heatmap-card.tsx:44-59,255-292`
  - 실제 문구: 이 범위로 과제 보내기 / 전체 회차 합산
- **취약점 배포 CTA 워딩이 사전으로 통일되어 있다: 「과제 보내기」(row형 기본), 「이 범위로 과제 보내기」(card형), 「다시 보내기」, 「이 학습지 다시 보내기」, 「미완료 학생에게 다시 보내기」, 「빠르게 다시 보내기」, 「보내기 화면에서 편집」, 「보충 과제 보내기」, 「이 개념으로 과제 보내기」, 「복습 과제 보내기」.**
  - 근거: `src/lib/wording/director-glossary.ts:15-58 / src/components/students/hub/analytics/weak-spot-row.tsx:27-66`
  - 실제 문구: 과제 보내기 / 이 범위로 과제 보내기 / 다시 보내기 / 이 학습지 다시 보내기 / 미완료 학생에게 다시 보내기 / 빠르게 다시 보내기 / 보내기 화면에서 편집 / 보충 과제 보내기 / 이 개념으로 과제 보내기 / 복습 과제 보내기
- **취약 spot → 컴포저 프리셋 매핑이 코드로 확정: GRAMMAR면 conceptIds 합집합 + weakConcepts 프리셋, QUESTIONS면 subTypes 프리필터로 문제 피커 자동 필터, WORKSHEET면 같은 학습지 content 고정. 모든 경로에 analysisSeed가 동반된다.**
  - 근거: `src/components/students/hub/student-hub-client.tsx:177-221 / src/components/students/hub/exam-tab/type-heatmap-card.tsx:39-58`
- **컴포저 상단에 '분석 컨텍스트 스트립'(h-10 전폭, bg-blue-50/30, 좌측 ⓘ blue-500)이 렌더된다. 문장은 「{학생명} · {취약 라벨} {지표 설명} · 마지막 오답 7/19 외 2개」, 우측에 「이미 나간 관련 과제 N건」 칩(「과제명」 + 마감일 + 상태), 우끝 「자세히」 토글. 펼치면 max-h 120px 2컬럼으로 「개념별 점수」 + 「최근 오답」.**
  - 근거: `src/components/study-assignments/composer-context-strip.tsx:111-292 / src/lib/wording/director-glossary.ts:459-470`
  - 실제 문구: 이미 나간 관련 과제 3건 / 자세히 / 접기 / 개념별 점수 / 최근 오답 / 마감 없음 / 이 개념으로 나간 과제는 아직 없습니다 — 첫 보충 과제예요 / 분석 기록을 불러오는 중…
- **과제 배포 화면은 와이드 모달 3패널 위저드. 패널 캡션은 「① 누구에게」 / 「② 무엇을 · 언제까지」 / 「③ 실물 확인」(어법일 때만 「③ 출제 범위」). 미충족 패널에는 rose 도트 + 「필요한 입력이 남았습니다」. 푸터 가이드는 「① 왼쪽에서 받을 학생을 선택해 주세요」·「② 과제 종류를 선택해 주세요」·「② 배포할 콘텐츠를 선택해 주세요」·「② 보낼 문제를 선택해 주세요」.**
  - 근거: `src/lib/wording/director-glossary.ts:430-455 / src/components/study-assignments/assignment-composer.tsx:88-101,499-620`
  - 실제 문구: ① 누구에게 / ② 무엇을 · 언제까지 / ③ 실물 확인 / ③ 출제 범위 / 필요한 입력이 남았습니다 / ① 왼쪽에서 받을 학생을 선택해 주세요 / ② 과제 종류를 선택해 주세요 / ② 배포할 콘텐츠를 선택해 주세요 / ② 보낼 문제를 선택해 주세요
- **컴포저 확정 버튼은 「과제 보내기」(전송 중 「보내는 중…」), 마감 미설정 시 푸터에 「마감일이 없어요 — 마감 없이 보내려면 그대로 누르세요」, 성공 토스트는 「N명에게 과제를 보냈습니다.」(+ 「 (이미 제출한 N명은 기존 기록 유지)」). 좌우 패널은 드래그 핸들로 폭 조절·접기가 가능하다.**
  - 근거: `src/lib/wording/director-glossary.ts:448-454 / src/components/study-assignments/assignment-composer.tsx:465-481,536-549`
  - 실제 문구: 과제 보내기 / 보내는 중… / 마감일이 없어요 — 마감 없이 보내려면 그대로 누르세요 / 12명에게 과제를 보냈습니다. / (이미 제출한 3명은 기존 기록 유지) / 닫으면 입력한 내용이 사라집니다.
- **③ 실물 확인 패널은 배포 전 실물 미리보기를 강제한다(「실물 확인 없이는 배포 결정을 내리게 하지 않는다(전수검사 계약)」). 빈 상태 문구가 종류 선택 여부에 따라 갈린다.**
  - 근거: `src/components/study-assignments/assignment-composer.tsx:395,610-618`
  - 실제 문구: 가운데 목록에서 배포할 콘텐츠를 선택하면 문항·지면 실물이 여기에 표시됩니다. / 과제 종류를 선택하면 배포할 콘텐츠의 실물을 여기에서 확인할 수 있습니다.
- **배포한 과제의 반 단위 결과는 '문항 통계' 탭에서 취약 문항 순으로 집계된다. 행마다 문항 번호 칩 + 발문 1줄 + h-1.5 정답률 바(3단 톤: <50 bg-rose-500, <80 bg-blue-600, 이상 bg-emerald-500) + %와 「N/M명 정답」 + violet 「확인 필요 N」 배지 + 오답 선지 분포 칩 상위 4개(「② 5명」). 15초 자동 폴링.**
  - 근거: `src/components/study-assignments/assignment-question-stats.tsx:25-30,116-206`
  - 실제 문구: 취약 문항 순 · 제출 12명 기준 / 확인 필요 3 / 아직 제출한 답안이 없습니다. 학생이 제출하면 문항별 정답률이 집계됩니다. / 15초마다 자동 갱신
- **학습지 과제는 '학습 현황' 탭에서 학생×스테이지 진행 매트릭스 + 반 집계 4카드(단계별 평균 점수 / 최다 오답 문장 / 최다 오답 단어 / 어법 포인트 오답률)로 본다. 진행 중 셀은 blue pill 「진행 3/8」, 최근 3분 내 활동 학생은 animate-ping 라이브 도트, 학생 이름 클릭 시 취약 단어 드로어가 열린다.**
  - 근거: `src/components/study-assignments/study-report-tab.tsx:36-37,77-120,270-508`
  - 실제 문구: 실시간 학습 현황 / 학습 시작 12명 · 완료 단계의 숫자는 첫 시도 정답률(%) · 진행 n/m 은 푼 문항/전체 · 학생 이름을 누르면 취약 단어를 볼 수 있습니다 / 숙달도 / 총 학습 / 단계별 평균 점수 — 완주 학생 기준 / 최다 오답 문장 — 첫 시도 기준 상위 5 / 최다 오답 단어 — 상위 10 / 어법 포인트 오답률 — 출제 코드 전체 / 문장 12 오답률 67% · 9회
- **학생 허브 시험 탭 상단은 스코프 칩(전체/배포 시험/내신 분석) + KPI 3타일 「총 응시」·「평균 점수율」·「추세」(오름/유지/내림, emerald/slate/rose). 그 아래 2열 420px 카드 페어: 점수율 추이 | 유형별 정답률 히트맵 / 응시 기록 테이블 | AI 추세 분석. 폴링 60초.**
  - 근거: `src/components/students/hub/exam-tab/exam-tab.tsx:68-76,95-104,216-257`
  - 실제 문구: 시험 구분 / 총 응시 / 평균 점수율 / 추세 / 오름 · 유지 · 내림 / 최근 3회 점수율 기준 / 점수 확정 응시가 2회 이상 필요합니다
- **점수율 추이는 recharts LineChart. stroke var(--color-yshin-blue-hover, #2563EB) 2.5px, grid var(--color-gray-100,#F3F4F6) strokeDasharray 3 3 가로선만, tick #9CA3AF 11px, Y축 0~100 ticks [0,25,50,75,100] %. dot r 3.5 흰 테두리 1.5, activeDot r 5.5. 점 클릭 시 아래 응시 테이블 행이 하이라이트된다.**
  - 근거: `src/components/students/hub/exam-tab/score-trend-card.tsx:29-34,126-164`
  - 실제 문구: 점수율 추이 / 점을 누르면 아래 응시 기록에서 해당 회차를 강조합니다 / 점수율이 확정된 응시가 아직 없습니다.
- **지표 용어와 ⓘ 설명이 사전화되어 있다: 숙달도 / 보충 필요 / 첫 시도 정답률 / 영역별 첫 시도 정답률 / 유형별 정답률 / 복습 대상 / 미완료 과제. 각 지표는 점수 단독 노출이 금지되고 항상 말 설명이 병기된다(규칙 R10).**
  - 근거: `src/lib/wording/director-glossary.ts:86-118 / src/components/students/hub/analytics/weak-spot-row.tsx:7-9`
  - 실제 문구: 숙달도는 최근 풀이에 가중치를 둔 점수예요. 60점 미만이면 보충을 권장해요 / 보충 필요는 3회 이상 시도했는데 숙달도가 60점 미만이거나, 오답률이 높은 항목이에요 / 첫 시도 정답률은 힌트나 재시도 없이 처음 푼 결과만 집계해요. 학습지에만 쓰는 지표예요 / 복습 대상은 숙달한 뒤 21일이 지나 다시 확인이 필요한 개념이에요
- **학생 허브 리포트 탭은 리포트 상태 배지 4종(리포트 없음/생성 중/생성 실패/리포트 완성)과 정오 요약 칩(○ N, ✕ N, 미확인 N)을 보여주고, 채점 확정 전에는 「채점하기」, 확정 후에는 「분석 보기」가 주 액션으로 스왑된다. 공개 리포트는 /r 딥링크.**
  - 근거: `src/components/students/hub/reports-tab.tsx:5,18-21,122-177`
  - 실제 문구: 리포트 없음 / 생성 중 / 리포트 완성 / 생성 실패 / 채점 전 / 채점 확정 / 분석 보기 / 채점하기 / 미리보기 / 공유 / 이 학생의 내신 리포트가 아직 없습니다.
- **AI 리포트 프롬프트는 모든 섹션 내러티브에 문항 번호 최소 4개 실명 인용을 강제하고, 「꾸준히 노력하면」·「기본기를 다지면」 같은 상투구를 금지한다.**
  - 근거: `src/lib/exam-report/prompts.ts:388,402`
  - 실제 문구: 인용 하한(전 내러티브 공통): 각 내러티브(scoreOverview 부터 studyPlan 까지 8개 모두)마다 문항 번호를 최소 4개 실명 인용합니다(형식: "12번(빈칸추론)", "서답형 2").

### 덱 재현 대상 (visualSpec)

#### 리포트 성적 개요 히어로 밴드 (Total Score + 정답률 + 정오 분해 칩)

- 왜: 덱의 '숫자가 먼저 말한다' 임팩트 슬라이드. 리포트 문서를 여는 첫 화면이며 CountUp + 바 드로우온 모션이 자연스럽게 붙는다.
- 소스: `src/components/exam-report/report/sections/score-overview.tsx:262-375`
- 시각 스펙:

```
루트 색 토큰(기본 테마 indigo-consult): --rpt-primary #1D4ED8 / --rpt-ok #059669 / --rpt-bad #E11D48 / --rpt-neutral #64748B / --rpt-tint #EFF4FF / --rpt-surface #F8FAFE / --rpt-line #DBE3F2. 컨테이너: border-radius 16px(rounded-2xl), border 1px #DBE3F2, background #F8FAFE, overflow hidden. 내부는 flex — ≥640px에서 row, 미만은 column.
좌측 블록(px 32 / py 32): ① 킥커 <p> 「Total Score」 10px, font-weight 700, uppercase, letter-spacing 0.26em, color #64748B. ② 그 아래 baseline flex gap 8px — 총점 숫자 68px(모바일 56px) font-weight 800, letter-spacing -0.02em, tabular-nums, color #1D4ED8, 헤딩 폰트(Pretendard); 그 옆 「/ 100」 18px font-weight 600 color #64748B.
세로 구분선: ≥640px에서 width 1px, background #DBE3F2, margin-block 32px. (모바일에서는 height 1px 가로선, margin-inline 24px)
우측 블록(flex 1, px 32 / py 32, gap 16px): ① 상단 baseline space-between — 좌 「정답률」 12px medium #64748B(slate-500), 우 숫자 26px bold tabular-nums #1D4ED8 + 「%」 15px semibold #64748B. ② 그 아래 8px 마진, height 6px(h-1.5) 트랙 border-radius 999px background #EFF4FF, 내부 fill background #1D4ED8, width는 --rpt-bar-w 변수(예: 72%). ③ 상단 1px #DBE3F2 보더 + padding-top 14px 영역: 보조 스탯 행(flex wrap, column-gap 28px) — 각 항목 = 라벨 11px medium slate-500 + 값 17px bold tabular-nums slate-700 + 접미 12px semibold #64748B. 실값 예: 「정답 문항 18 / 25문항」, 「실점 −28 점」. ④ 정오 분해 칩 ul(flex wrap gap 8px) — 칩 = border 1px #DBE3F2, background #fff, border-radius 999px, padding 4px 10px, 내부 [기호 11px bold(색=상태색)] + [라벨 11px medium slate-500] + [수 12px bold(색=상태색)]. 칩 4종: ✓ 정답 18(#059669) / ✗ 오답 6(#E11D48) / △ 부분 1(#1D4ED8) / · 미입력 0(#64748B).
그 아래 별도 카드 ①: 「Class Average」 카드 — rounded 12px, border 1px #DBE3F2, background #F8FAFE, padding 16px 20px. 상단 baseline space-between: 좌 킥커 10px bold uppercase tracking 0.22em #64748B 「Class Average」, 우 12px bold tabular-nums 「반평균 대비 +7점」(양수 #059669 / 음수 #E11D48 / 0이면 「반평균과 동일」 #64748B). 본문 2행(gap 10px): 각 행 = [라벨 w48px 12px medium slate-500(「내 점수」/「반평균」)] + [h-2.5 트랙 #EFF4FF, fill(#1D4ED8 / #64748B)] + [값 w48px 우정렬 13px bold tabular-nums].
그 아래 별도 카드 ②: 「한 줄 진단」 — rounded 12px, background #EFF4FF, padding 16px 20px, 내부 flex gap 14px. 좌측 3px 폭 세로 바(self-stretch, border-radius 999px, background #1D4ED8). 우측: 라벨 10px bold uppercase tracking 0.24em color #1D4ED8 「한 줄 진단」, 6px 아래 본문 16px semibold line-height 1.7 slate-800 한 문장.
최하단 각주: 12px slate-400 「※ 미입력 3문항은 채점에서 제외하고 정답률을 계산했습니다.」
모션: 섹션이 뷰포트 15% 진입 시 [data-reveal] 요소들이 opacity 0/translateY(14px) → 1/none, transition 600ms cubic-bezier(0.22,1,0.36,1), 스태거 delay 0 / 90ms / 180ms. 바 fill은 width 0% → 목표값, 900ms 같은 ease, delay 150ms. 총점·정답률 숫자는 0 → 값 900ms easeOutCubic 카운트업(뷰포트 40% 진입 시 1회).
```

#### 유형별 성취도 — 회계 원장 + 레이더 2컬럼

- 왜: '우리는 유형별 정답률을 보여주는 게 아니라 실점을 정산한다'는 제품 철학이 시각으로 드러나는 유일한 화면. 마감 이중선·점선 리더 같은 디테일이 세미나에서 강한 인상을 남긴다.
- 소스: `src/components/exam-report/report/sections/type-performance.tsx:94-370`
- 시각 스펙:

```
레이아웃: ≥704px(@min-[44rem])에서 grid-cols-2, column-gap 32px, row-gap 24px, align-items center. 좌 = 원장, 우 = 레이더.
[좌 원장] 리드인 문장(12px slate-500, margin-bottom 16px): 「배점을 잃은 유형만 상세로 올리고, 만점 유형 4개는 아래 요약으로 접었습니다.」
컬럼 헤더 행: padding-bottom 8px, 10px font-weight 600 letter-spacing 0.14em color slate-400. 좌 「실점 유형 5」, 우 3개 고정폭 셀 우정렬 tabular-nums: 「정오」(w 56px) 「정답률」(w 64px) 「실점」(w 64px), 셀 간 gap 8px.
원장 행(li): border-top 1px #DBE3F2, padding-block 10px, flex-col gap 6px.
  · 상단: 좌측 = 유형 라벨 14px medium slate-700(truncate 금지, 줄바꿈 허용) + 실점 상위 2개면 그 옆에 pill 배지(border 1px #E11D48, color #E11D48, 10px bold, padding 1px 6px, radius 999px) 「실점 1위」 / 「실점 2위」 + 미채점 있으면 10px slate-400 「미채점 2」.
  · 우측 숫자 3열(13px tabular-nums, 우정렬): 「18/25」(18은 slate-700 semibold, 나머지 slate-500) | 「72%」(#1D4ED8 semibold) | 「−12점」(#E11D48, 상위 2개면 bold; 0이면 옅은 slate-300 「0」; 미채점이면 「—」).
  · 하단: h-1.5 트랙 background #EFF4FF radius 999px, fill background #1D4ED8, width = 정답률%.
합계 행: 위쪽에 border-top: 3px double #64748B(회계 마감 이중선), padding-top 10px. 좌 「합계」 14px bold slate-900, 우 같은 3열(합계값은 bold, 정답률 #1D4ED8). 그 아래 11px slate-400 tabular-nums 「전 12유형 · 배점 68 / 100 획득」.
정복한 유형 그리드: 위 32px 마진 + border-top 1px #DBE3F2 + padding-top 16px. 제목 10px semibold tracking 0.14em slate-400 「정복한 유형 4 」 + 「— 출제 문항 전부 정답」(font-weight 500). 목록은 2컬럼(≥640px 3컬럼), column-gap 20px row-gap 8px. 각 항목 = [유형명 12px slate-600] + [flex-1 점선 리더: border-bottom 1px dotted #DBE3F2] + [「4/4」 12px semibold tabular-nums color #059669].
채점 대기 칩: 10px semibold tracking 0.14em slate-400 「채점 대기 2」 + pill(border 1px #DBE3F2, radius 999px, padding 2px 8px, 11px slate-500) 「서술형 3문항」.
[우 레이더] SVG viewBox 0 0 412 240, width 100%. 중심 (206,120), r=92, 축 6~8개, 첫 축은 12시 방향. 격자 = 0.25/0.5/0.75/1.0 배율 폴리곤 4겹, stroke #DBE3F2, 바깥 겹만 1.2px 나머지 0.7px. 축선도 #DBE3F2 0.7px. 값 폴리곤 = fill #1D4ED8 opacity 0.16, stroke #1D4ED8 1.8px, stroke-linejoin round + 각 꼭짓점 r 2.4 원(#1D4ED8). 축 라벨 = r+13 위치, 10px, fill #64748B, 10자 초과면 2줄 분할(괄호 경계 우선). 캡션 10px medium tracking 0.08em slate-400 「유형 정답률 균형 · 실점 유형 우선 8개 표시」.
모션: 레이더 폴리곤은 opacity 0 + scale(0.72) → 1, 700ms cubic-bezier(0.22,1,0.36,1), delay 150ms(transform-origin center, transform-box fill-box). 원장 바는 width 0→값 900ms. 행 리빌 스태거 120ms/210ms.
```

#### 난이도별 결과 — 문항 흐름 매트릭스 + 시그널 카드 2장

- 왜: '어디서 무너졌는지'를 출제 순서 그대로 보여주는 SMOAT 고유 시각화. 아까운 실점/상위권 시그널 카피가 세미나 청중(원장·강사)에게 가장 잘 꽂힌다.
- 소스: `src/components/exam-report/report/sections/difficulty-matrix.tsx:78-410`
- 시각 스펙:

```
3악장 세로 스택, gap 28px.
① 난이도 스탯 밴드 — ≥640px: grid-cols-5, gap 10px. 타일 = rounded 8px, background #F8FAFE, border 1px #DBE3F2, padding 10px, flex-col gap 6px. 내용: 라벨 10px semibold tracking 0.12em slate-400 「난이도 1」 → 값 18px extrabold tabular-nums slate-900 「75%」 → h-1 트랙(#EFF4FF)+fill(#1D4ED8) → 캡션 10px tabular-nums slate-400 「3/4 정답」(출제 없으면 「출제 없음」, 미채점이면 「채점 전」). <640px에서는 5칸 그리드를 버리고 풀폭 행 5줄(라벨 w48 / 바 flex1 / % w40 우정렬 / 분수 w4.2rem 우정렬)로 전환.
② 문항 흐름 매트릭스 — 제목 10px semibold uppercase tracking 0.2em slate-400 「문항 흐름 — 출제 순서」. 도트 컨테이너 flex-wrap, column-gap 8px row-gap 12px. 도트 1개 = flex-col items-center gap 4px:
  · 상단 배지 = min-height 27px, min-width 28px, radius 6px, padding 2px 4px, font 11px bold, 배경 = 상태색(정답 #059669 / 오답 #E11D48 / 부분 #1D4ED8 / 미입력 #DBE3F2), 글자색 흰색(미입력만 slate-500). 내부는 [번호 tabular-nums] + [기호 ✓/✗/△/·].
  · 배점 4점 이상 문항은 box-shadow: 0 0 0 2px #F8FAFE, 0 0 0 3.5px #64748B (이중 링).
  · 하단 난이도 틱 = 5개 막대(각 width 5px height 3px radius 999px, gap 2px), 난이도 이하 칸은 #64748B, 초과 칸은 #DBE3F2.
  범례(11px slate-500, column-gap 16px): 실재 상태만 노출 — [12px 정사각 상태색] + 라벨 + 기호, 그리고 「배점 4점 이상」(이중 링 샘플), 「난이도 눈금」(틱 샘플). 미입력 있으면 11px slate-400 「미입력 2문항은 난이도별 정답률에서 제외했습니다.」
③ 시그널 카드 2장 — ≥704px grid-cols-2, gap 12px. 카드 = rounded 12px, background #F8FAFE, padding 20px, flex-col gap 12px.
  · 헤더: 좌 킥커 10px bold uppercase tracking 0.22em (좌카드 #E11D48 「RECOVERABLE POINTS」 / 우카드 #059669 「TOP-TIER SIGNAL」) → 제목 h4 15px bold slate-900 「아까운 실점」/「상위권 시그널」 + 옆에 12px semibold tabular-nums slate-400 「3문항」. 우측 합계 20px extrabold tabular-nums 「−9점」/「+12점」(각 톤 색).
  · 구분선: height 1px background #DBE3F2, 그 위 좌측에 2px 높이 32px 폭 세그먼트(톤 색) 겹침.
  · 본문: 항목 ≤3이면 원장 행 — [번호 칩(radius 6px, padding 4px 8px, 12px bold, 배경=톤 색, 흰 글씨) 「6번 3점」] + [난이도 틱 + 11px slate-500 「난이도 2 · 오답」]. 4개 이상이면 칩만 flex-wrap.
  · 캡션(mt-auto로 카드 바닥 정렬) 11px slate-400: 좌 「난이도 1~2 문항에서의 오답 — 실력보다 절차의 문제일 확률이 높고, 가장 빨리 회수할 수 있는 점수입니다.」 우 「난이도 4~5 문항에서의 정답 — 상위권을 가르는 변별 구간에서 이미 득점하고 있다는 근거입니다.」
모션: 3악장이 각각 delay 120ms / 210ms / 300ms로 순차 리빌(opacity+translateY 14px, 600ms cubic-bezier(0.22,1,0.36,1)).
```

#### 함정 분석 — TrapMeter 3단 + 선지 대조 카드

- 왜: '출제자가 심은 미끼를 학생이 골랐는가'를 지면에 박제하는, 경쟁 서비스에 없는 각도. 원형숫자 대형 마크가 슬라이드에서 시각적으로 강하다.
- 소스: `src/components/exam-report/report/sections/trap-analysis.tsx:62-190 / src/components/exam-report/report/report-charts-lists.tsx:126-208`
- 시각 스펙:

```
세로 스택 gap 16px.
리드인 13px slate-500 break-keep: 「출제자가 문항마다 심어 둔 매력적인 오답(설계 함정)을 학생이 실제로 골랐는지, 오답의 선지 기록 단위로 대조한 결과입니다.」
[판정 패널] rounded 12px, border 1px #DBE3F2, background #F8FAFE, padding 20px. 내부 TrapMeter:
  · 상단 baseline space-between — 좌 14px bold 「함정 대응력: 주의」(색 = 판정색: 좋음 #059669 / 보통 #1D4ED8 / 주의 #E11D48), 우 12px tabular-nums slate-500 「오답 9건 중 」 + <strong>「6건」</strong>(판정색 bold) + 「 설계 함정 적중」.
  · 3세그먼트 게이지(flex gap 6px): 각 세그먼트 = flex-1 column, [h-2 full-width radius 999px — 활성이면 판정색, 비활성이면 #EFF4FF] + [▲ 마커 10px, 활성만 판정색 표시(비활성은 transparent)] + [라벨 11px — 좌부터 「좋음」·「보통」·「주의」, 활성만 bold+판정색, 비활성 slate-400].
  · 캡션 11px slate-400 「설계된 함정 선지를 고른 비율 기반」. UNKNOWN이면 게이지 자체를 그리지 않고 상단 border-top 1px + 12px slate-500 보류 사유 문장.
[문항 카드] ul flex-col gap 12px(8건 초과 시 max-height 560px 내부 스크롤). 카드 = rounded 12px, border 1px #DBE3F2, padding 16px, position relative, overflow hidden. 좌상단 절대배치 2px 높이 × 32px 폭 세그먼트: 설계 함정이면 #E11D48, 일반 오답이면 #64748B.
  · 헤더 행(flex-wrap, column-gap 12px): [번호 칩 — height 24px, min-width 24px, radius 6px, border 1px #DBE3F2, padding 0 6px, 12px bold tabular-nums slate-700] + [「선택」 11px medium tracking 0.06em slate-400] + [원형숫자 ①~⑤ 20px bold color #E11D48] + [우측 auto pill 배지: 설계 함정이면 color #E11D48 / border color-mix(#E11D48 35%, transparent) / background color-mix(#E11D48 7%, transparent), 내용 「▲ 설계된 함정」; 일반이면 color #64748B / border #DBE3F2 / 배경 투명, 내용 「· 일반 오답」].
  · 본문 14px line-height 1.8 slate-600 — 이 학생이 왜 그 선지에 끌렸는지 해석 문단.
[빈 상태] rounded 12px dashed border #DBE3F2, 가운데 정렬 padding 20px 16px: 14px bold #64748B 「함정 대응력: 판정 보류」 + 13px slate-400 「선지 기록이 있는 객관식 오답이 없어 선지 대조를 생략했습니다 — 판정은 설계 함정 선지를 실제로 고른 비율로만 계산합니다.」
모션: 카드 리빌 스태거 = index×70ms(최대 4단, 즉 0/70/140/210/280ms), 600ms ease.
```

#### 오답 심층 분석 — 관찰→처방 임상 기록 카드

- 왜: '어디서 어떻게 틀렸는지 + 무엇을 바꾸면 되는지'가 한 카드 안에서 닫히는 구조. 학부모 상담 장면 슬라이드의 핵심 소품.
- 소스: `src/components/exam-report/report/sections/wrong-deep-dive.tsx:60-211`
- 시각 스펙:

```
메타 라인(12px tabular-nums slate-400): 「오답·부분점수 11문항 — 핵심 6문항 심층 카드 + 5문항 교정 요약」(9문항 미만이면 「오답·부분점수 6문항 심층 분석」).
카드 그리드: 카드 4개 이상이면 ≥704px에서 grid-cols-2, gap 12px. 카드 = rounded 12px, border 1px #DBE3F2, padding 16px, display flex column(높이 stretch).
  · 헤더(flex-wrap, column-gap 10px, row-gap 6px): [번호 칩 — height 24px min-width 24px radius 6px background #1D4ED8 색 흰색 12px bold tabular-nums] + [유형 라벨 14px bold slate-800, 헤딩 폰트] + [≥640px에서 ml-auto 개념 태그 칩들 — radius 999px, border 1px #DBE3F2, background #EFF4FF, padding 2px 8px, 11px medium slate-500, 최대 4개 + 초과 시 dashed border 칩 「외 2」].
  · 본문(margin-top 12px, flex-1 column):
    - 관찰 블록(padding-bottom 12px): 라벨 11px bold letter-spacing 0.08em color slate-400 「무엇이 일어났나」 + 4px 아래 본문 14px line-height 1.8 slate-600.
    - 처방 블록(margin-top auto → 카드 바닥 앵커, border-left 2px #1D4ED8, padding-left 12px): 라벨 11px bold letter-spacing 0.08em color #1D4ED8 「이렇게 고친다」 + 본문 14px line-height 1.8 slate-700.
  · **강조**는 .rpt-em — font-weight 700 + background linear-gradient(transparent 64%, color-mix(in srgb,#1D4ED8 16%, transparent) 64%) 하이라이트.
다이제스트(초과분): rounded 12px border 1px #DBE3F2 overflow hidden. 헤더 바 = border-bottom 1px #DBE3F2, background #EFF4FF, padding 10px 16px, 11px bold letter-spacing 0.08em slate-400 「나머지 5문항 — 교정 포인트 요약」. 목록은 max-height 360px 스크롤, 각 행 = border-top 1px #DBE3F2, padding 10px 16px, flex gap 10px: [번호 배지 h-5 min-w-5 radius 4px border 1px #DBE3F2 11px bold slate-500] + [유형 13px bold slate-700 / 교정 포인트 13px line-height 1.7 slate-600].
빈 상태: dashed border #DBE3F2, 가운데 14px slate-400 「이번 시험에는 심층 분석이 필요한 오답이 없습니다.」
모션: 카드 스태거 index×70ms(최대 280ms), 다이제스트는 280ms.
```

#### 취약점 분해 — 4차원 탭 + 버킷 행 드릴다운(접힘/펼침)

- 왜: 'AI 0콜'로 이미 가진 데이터만으로 어디가 약한지 즉시 분해된다는 것을 증명하는 화면. 접힘→펼침 인터랙션이 슬라이드에서 그대로 살아난다.
- 소스: `src/components/exam-report/grading/analysis-breakdown.tsx:168-392 / src/components/exam-report/grading/analysis-bucket-row.tsx:74-232`
- 시각 스펙:

```
카드 셸: rounded 12px, border 1px #E2E8F0(slate-200), background #fff, box-shadow sm, overflow hidden.
[헤더] border-bottom 1px slate-100, padding 12px 16px, flex space-between. 좌: 32px 정사각 아이콘 박스(rounded 8px, background blue-50 #EFF6FF, ring 1px blue-100, 아이콘 Layers 16px color blue-600 #2563EB) + [h2 14px bold slate-900 「취약점 분해」 / p 12px medium slate-400 「차원별 정답률 — 문항 번호를 누르면 원본 문항이 열립니다.」]. 우: 정렬 토글 — background slate-100 rounded 8px padding 2px, 버튼 h-6 rounded 6px padding 0 10px 11.5px semibold, 활성은 bg-white text-slate-800 shadow-sm, 비활성 text-slate-500. 항목 「취약순」「오답순」「문항순」.
[차원 탭] flex-wrap gap 6px, 버튼 h-7 rounded 6px padding 0 10px 12px semibold. 활성 = border 1px #2563EB, background blue-50/50, color blue-700. 비활성 = 투명 보더 slate-500. 비활성화(disabled) = slate-300 cursor-not-allowed. 항목 「유형별」「난이도별」「지문별」「개념별」. 옆에 11px slate-400 「지문 분석은 원본 문항이 있는 시험지에서만 제공됩니다.」
[필터 바] rounded 8px, border 1px slate-100, background slate-50/40, padding 8px 10px, flex-wrap column-gap 16px. 구성: ① 멀티셀렉트 「유형 선택」 ② 「문항 표시」 라벨(10.5px bold uppercase tracking slate-400) + 4개 토글 버튼(h-7 rounded 6px 12px semibold) — 켜짐 시 정답 emerald-50/emerald-600/ring emerald-500, 오답 rose-50/rose-600/ring rose-500, 부분 blue-50/blue-700/ring blue-500, 미상은 bg-slate-200 text-slate-600 ring-slate-400; 꺼짐은 border-slate-200 bg-white text-slate-500. 각 버튼 내용 = 기호(○/✕/△/·) + 라벨(정답/오답/부분/미상) ③ 토글 「오답 있는 유형만」(켜짐: bg-rose-50 text-rose-600 ring-rose-500) ④ 우측 auto: 「3 / 12」 카운트(11.5px semibold tabular-nums) + 「✕ 초기화」 버튼.
[버킷 행 — 접힘] li = rounded 8px, border 1px slate-100, background slate-50/40, padding 12px 14px.
  · 헤더 버튼(full width): 좌 [라벨 13px bold slate-800] + [부라벨 10.5px semibold slate-400] + [정답률 50% 미만이면 배지 「주의」 — border 1px rose-200, bg rose-50, 10px bold rose-600, radius 4px, padding 2px 6px]. 우 [정답률 12px bold(주의면 rose-600, 아니면 slate-700) 「33%」] + [12px semibold slate-400 「3/9」 + 「· 12문항 24점」] + [ChevronDown 16px slate-400, 펼치면 rotate 180].
  · 스택바: margin-top 8px, height 8px, radius 999px, background slate-100, 내부 4세그먼트 순서대로 bg-emerald-500(정답) / bg-blue-500(부분) / bg-rose-500(오답) / bg-slate-300(미상), 각 width = n/total×100%.
  · 접힘 칩 줄: margin-top 8px, flex-wrap gap 4px, 좌측 10.5px semibold slate-400 「문항」 + 번호 칩들(h-5 min-w-26px radius 4px border 1px, 11px bold tabular-nums) — 정답 emerald-200/emerald-50/emerald-700, 오답 rose-200/rose-50/rose-600, 부분 blue-200/blue-50/blue-700, 미상 slate-200/white/slate-400.
[버킷 행 — 펼침] 칩 줄 대신 (지문별이면) 지문 발췌 p(rounded 6px, bg-white, padding 8px 12px, font-mono 11.5px slate-500, ring 1px slate-100, line-clamp 4) + 문항별 미니 행 ul(gap 4px). 미니 행 버튼 = rounded 6px bg-white padding 6px 10px ring 1px slate-100, hover bg-blue-50/30 ring-blue-200. 내부 좌→우: [상태 기호 박스 20px 정사각 radius 4px (bg/text = 상태색 페어)] + [번호 w-7 12.5px extrabold slate-800] + [유형 라벨 flex-1 truncate 11.5px semibold slate-500] + [「①」(상태색) → 「③」(emerald-700) 12px semibold, 사이 화살표 slate-300] + [「3/5점」 w-14 우정렬 11.5px semibold slate-400].
애니메이션 제안: 펼침은 max-height 0→auto + ChevronDown 180도 회전 200ms ease.
```

#### 유형별 정답률 히트맵 → 셀 팝오버 → 「이 범위로 과제 보내기」

- 왜: 덱의 클라이맥스 체인(분석→즉시 액션)을 한 장면에 담는 자산. 취약점 기반 후속 과제 재배포가 실재한다는 증거.
- 소스: `src/components/students/hub/exam-tab/type-heatmap-card.tsx:162-296 / src/components/students/hub/analytics/kit.tsx:105-117,148-186 / src/components/students/hub/analytics/weak-spot-row.tsx:27-66`
- 시각 스펙:

```
[카드 셸 AnalyticsCard] flex column, rounded 8px, border 1px slate-200, background #fff, overflow hidden, 고정 높이 420px. 헤더 = border-bottom 1px slate-100, background slate-50/60, padding 10px 14px, 좌측 [LayoutGrid 아이콘 16px blue-600 + 제목 13px semibold slate-700 「유형별 정답률」] + 우측 ⓘ 툴팁(Info 14px slate-300 → hover 시 slate-800 배경 툴팁 w-56 11.5px 흰 글씨 「정답률은 맞고 틀림만 세는 단순 비율이에요」). 툴바 행(border-bottom 1px slate-100, padding 8px 12px, 우정렬) = 범례 10.5px slate-400: [10px 정사각 bg-slate-100] 「기록 없음」 · 「낮음」 + 5개 정사각(10px, radius 3px) 「높음」. 본문 = flex-1 overflow-y-auto padding 14px.
[히트맵] 헤더 행: 좌측 sticky 128px 빈 칸 + 회차 열(각 폭 52px, 11px tabular-nums slate-400, 「1회」「2회」…). 유형 행: 좌측 sticky 128px 유형명(12px slate-600 truncate, bg-white) + 셀들. 셀 = 폭 52px 안에 padding 2px, 버튼 h-7 full-width rounded 4px, 12px semibold tabular-nums, 내용 「33%」 또는 「—」.
셀 5단 색(heatToneByRate): ≥80% bg-emerald-600 + text-white / ≥60% bg-emerald-400 + text-white / ≥40% bg-emerald-200 + text-emerald-900 / ≥20% bg-rose-200 + text-rose-900 / <20% bg-rose-400 + text-white / 기록 없음(attempts 0) bg-slate-100 + text-slate-400. hover는 opacity 0.85, focus-visible ring 2px blue-400.
[셀 팝오버] position fixed, z 50, width 256px, translateX(-50%), rounded 8px, border 1px slate-200, background #fff, shadow-lg, padding 12px. 앵커 = 셀 하단 +6px, 좌우 뷰포트 132px 클램프. 내용: ① 12.5px bold slate-700 유형명 ② 11.5px slate-400 「정답률 33% (3/9) · 전체 회차 합산」 ③ 11px slate-300 truncate 「3회 2학기 중간고사 · 1/4 정답」 ④ margin-top 8px CTA.
[CTA 버튼 — WeakPointCta card형] inline-flex, height 28px, gap 6px, padding 0 10px, rounded 6px, border 1px slate-200, background #fff, 12px semibold slate-600. 아이콘 = lucide Send 14px. 라벨 「이 범위로 과제 보내기」. hover: border-blue-200 / bg-blue-50 / text-blue-700. 비활성(매핑 실패): opacity 0.5, cursor-not-allowed, title 「연결된 어법 훈련 개념이 없어 바로 보낼 수 없어요」 계열 사유 툴팁.
(row형 변형: height 24px, gap 4px, padding 0 8px, 11.5px, text-slate-500, 라벨 「과제 보내기」 — 취약 목록 행 우측에 상시 노출, hover-reveal 금지)
애니메이션 제안: 셀 클릭 → 팝오버가 scale(0.96)+opacity 0 → 1, 140ms ease-out. CTA 클릭 → 화면 우측에서 컴포저 모달이 슬라이드 인.
닫힘 규칙: 바깥 클릭 / Escape / 스크롤 시 즉시 닫힘.
```

#### 과제 컴포저 — 3패널 위저드 + 분석 컨텍스트 스트립

- 왜: '취약점을 눌렀더니 그 범위 그대로 배포 화면이 열린다'는 루프의 종착점. 3스텝 번호 라벨과 컨텍스트 스트립 카피가 그대로 슬라이드 텍스트가 된다.
- 소스: `src/components/study-assignments/assignment-composer.tsx:88-101,465-621 / src/components/study-assignments/composer-context-strip.tsx:111-216 / src/lib/wording/director-glossary.ts:430-470`
- 시각 스펙:

```
[모달] WideModal — 데스크톱 높이 min(880px, 100dvh − 12rem), 내부는 flex column.
[① 컨텍스트 스트립 — analysisSeed 진입 시에만] 전폭, height 40px, border-bottom 1px slate-100, background blue-50/30, padding 0 16px, flex items-center gap 10px.
  · 좌: Info 아이콘 14px blue-500 + 문장 12.5px slate-600 truncate — 「<b>김민준</b> · <b>빈칸추론</b> 정답률 33% (3/9) · 마지막 오답 7/19 <span slate-400>외 2개</span>」(학생명·취약 라벨은 slate-800 semibold).
  · 중: 「이미 나간 관련 과제 3건:」 12px semibold slate-500 + 과제 칩들 — h-6 rounded 999px border 1px slate-200 bg-white padding 0 8px 11.5px, 내용 「「10월 3주 보충」」(max-w 160px truncate medium) + slate-400 「7/26 마감 · 진행 중」. hover: border-blue-200 bg-blue-50 text-blue-700. 관련 과제 0건이면 12px slate-400 「이 개념으로 나간 과제는 아직 없습니다 — 첫 보충 과제예요」.
  · 우: 「자세히」 토글 버튼(h-6, 12px semibold slate-500, ChevronDown 14px, 펼치면 rotate 180 + 라벨 「접기」).
  · 펼침 영역: border-top 1px blue-100/50, padding 10px 16px, max-height 120px overflow-y-auto, ≥1024px에서 grid-cols-2 column-gap 32px. 좌 섹션 제목 11.5px semibold slate-400 「개념별 점수」 + 행들([개념명 12px slate-600 truncate] + [점수 설명 12px medium tabular-nums, 색 = <50 rose-600 / <80 blue-600 / 이상 emerald-600]). 우 섹션 「최근 오답」 + 행들([XCircle 14px rose-500] + [「7/19 14:32」 tabular-nums slate-400] + [개념명 + slate-400 「· 답 “was”」]).
[② 3패널 그리드] grid-template-columns: var(--comp-cols) = [대상 폭]px [핸들]px [설정 폭]px [핸들]px minmax(0,1fr). 각 패널 상단 캡션 바 = shrink-0, border-bottom 1px slate-100, background slate-50/60, padding 8px 16px, flex gap 6px: 12px bold slate-600 라벨 + 미충족 시 6px 원형 도트 bg-rose-500(title 「필요한 입력이 남았습니다」).
  · 캡션 라벨: 「① 누구에게」 / 「② 무엇을 · 언제까지」 / 「③ 실물 확인」(GRAMMAR면 「③ 출제 범위」).
  · 패널 사이 PanelHandle(드래그 리사이즈 + 접기), 세로 라벨에 「① 누구에게 · 12명」처럼 선택 수가 붙는다.
  · ③ 패널이 flex-1로 가장 넓다. 콘텐츠 미선택 시 안내 문구 「가운데 목록에서 배포할 콘텐츠를 선택하면 문항·지면 실물이 여기에 표시됩니다.」
[③ 푸터] 좌측 요약 문장 — 예: 「12명 · 7/26(토) 23:59 마감 · D-2」(마감 D-day ≤0이면 rose-600 semibold, 예약 시작은 violet-600), 마감 없으면 slate-400 「· 마감일이 없어요 — 마감 없이 보내려면 그대로 누르세요」. 우측 버튼 2개: 「취소」(h-9, rounded 6px, border 1px slate-200, bg-white, 13px semibold slate-600) + 「과제 보내기」(h-9, rounded 6px, bg-blue-600 #2563EB, padding 0 20px, 13px semibold 흰색, hover bg-blue-700, 비활성 opacity 0.4). 전송 중 라벨 「보내는 중…」.
[④ 완료 토스트] 「12명에게 과제를 보냈습니다.」(+ 「 (이미 제출한 3명은 기존 기록 유지)」)
[⑤ 닫기 가드] 「닫으면 입력한 내용이 사라집니다.」
애니메이션 제안: 컨텍스트 스트립이 먼저 페이드인(200ms) → 3패널이 좌→우 60ms 간격으로 슬라이드업.
```

#### 과제 문항 통계 — 취약 문항 순 정답률 + 오답 선지 분포

- 왜: '배포한 뒤 반 단위로 어느 문항이 무너졌는지'를 실시간(15초 폴링)으로 보여주는 화면. 리포트가 개인이면 이건 반 단위 — 대비 슬라이드로 좋다.
- 소스: `src/components/study-assignments/assignment-question-stats.tsx:25-30,112-215`
- 시각 스펙:

```
[갱신 스트립] flex space-between, 좌 12px slate-400 「<span tabular-nums>14:32</span> 갱신 · 15초마다 자동 갱신」(에러 시 뒤에 rose-500 「· 문항 통계를 불러오지 못했습니다.」), 우 버튼 h-7 rounded 6px border 1px slate-200 bg-white padding 0 10px 12px semibold slate-600 + RefreshCw 14px(갱신 중 animate-spin) + 라벨 「갱신」.
[테이블 카드] rounded 8px, border 1px slate-200, background #fff, overflow hidden. 상단 캡션 바 = border-bottom 1px slate-100, background slate-50, padding 8px 12px, 11px medium slate-400 「취약 문항 순 · 제출 <span tabular-nums>12</span>명 기준」.
[행] divide-y divide-slate-50, padding 10px 12px, flex gap 12px items-start.
  · 좌: 번호 배지 24px 정사각 rounded 6px bg-slate-100 11.5px bold tabular-nums slate-500.
  · 중(flex-1): 발문 1줄 line-clamp-1 12.5px slate-700 break-keep. 그 아래 6px 마진, flex-wrap column-gap 8px:
    - 정답률 바: height 6px, max-width 200px, radius 999px, background slate-100, fill = 3단 톤 <50% bg-rose-500 / <80% bg-blue-600 / ≥80% bg-emerald-500, width = rate%.
    - 정답률 텍스트 12px bold tabular-nums(같은 3단 톤: text-rose-600 / text-blue-600 / text-emerald-600) 「33%」.
    - 11px tabular-nums slate-400 「4/12명 정답」.
    - 필요 시 violet 배지: border 1px violet-200, bg violet-50, radius 999px, padding 2px 6px, 10.5px medium violet-700 「확인 필요 3」.
  · 우: 오답 선지 분포 칩 상위 4개(max-width 180px, flex-wrap, 우정렬) — radius 999px, border 1px slate-200, bg slate-50, padding 2px 6px, 10.5px medium tabular-nums slate-600, 내용 「<b>②</b> 5명」.
[빈 상태] padding 32px 12px, 가운데 12.5px slate-400 「아직 제출한 답안이 없습니다. 학생이 제출하면 문항별 정답률이 집계됩니다.」
[로딩] 12px 높이 스켈레톤 4줄(h-12 rounded-md bg-slate-100 animate-pulse).
애니메이션 제안: 15초 폴링 시 우상단 RefreshCw만 회전, 행은 유지(전체 스피너 금지).
```

#### 리포트 커버 — gradient-band 표지

- 왜: 덱 도입부 '이런 문서가 학부모에게 나갑니다' 한 장. 테마 교체로 6가지 인격이 된다는 스토리도 여기서 시연 가능.
- 소스: `src/components/exam-report/report/report-cover.tsx:29,37-44,226-266`
- 시각 스펙:

```
header = rounded 16px, border 1px var(--rpt-line) #DBE3F2, overflow hidden. 두 층 구성.
[상단 밴드] padding 56px 48px(모바일 44px 28px), background: linear-gradient(150deg, var(--rpt-primary) #1D4ED8, color-mix(in srgb, var(--rpt-primary) 58%, black)).
  · 상단 행(baseline space-between): 좌 킥커 11px bold uppercase letter-spacing 0.32em color rgba(255,255,255,0.70) 「EXAM ANALYSIS REPORT」, 우 발행일 11px medium tabular-nums letter-spacing 0.18em color rgba(255,255,255,0.55) 「2025. 10. 14.」.
  · 56px 아래(mt-14): 부제 14px medium letter-spacing 0.04em color rgba(255,255,255,0.78), 그 아래 8px 타이틀 52px(모바일 34px) extrabold line-height 1.12 letter-spacing -0.02em color white, 헤딩 폰트(Pretendard).
[하단 백지] background #fff, padding 28px 48px. 메타 그리드 dl(flex-wrap, row-gap 16px): 항목마다 min-width 120px, padding-right 24px, 2번째부터 border-left 1px #DBE3F2 + padding-left 24px. 각 항목 = dt 10px bold uppercase letter-spacing 0.22em color slate-400 + dd 값. 라벨/값 4쌍: STUDENT(첫 항목만 17px bold slate-900) / EXAM / ACADEMY / ISSUED (2번째부터 15px semibold slate-700).
대안 템플릿 2종: ① minimal-line = 흰 배경 센터 정렬, 11px 킥커(#1D4ED8, tracking 0.34em) → 40px 아래 세로 헤어라인 1px×40px(#1D4ED8) → 타이틀 44px bold slate-900 → 부제 15px slate-500 → 16px×1px 가로선 → 센터 인라인 메타(학생명 18px bold + 나머지 13px slate-500 · 구분). ② photo-frame(=잉크 에디토리얼) = 상단 4px 통짜 primary 룰 + 좌상단 킥커 / 우상단 「— 01」 폴리오 + mt-auto 좌하단 대형 타이틀 58px extrabold(#1D4ED8) + 하단 border-top 메타 그리드.
인쇄 계약: .rpt-cover 클래스는 break-after 규칙 소유.
애니메이션 제안: 밴드 그라데이션은 정적, 타이틀만 opacity 0/translateY(14px) → 1, 600ms cubic-bezier(0.22,1,0.36,1).
```


### 갭 / 미확인

- 문항별 '소요 시간'은 리포트 문서 9섹션 어디에도 없다. 확인된 소요 시간은 분석 탭 히어로의 응시 전체 소요(startedAt~submittedAt 분 단위, analysis-hero.tsx:22-31,120-126)와 학습지 학습 현황의 「총 학습」(study-report-tab.tsx:64-70)뿐이다. 문항 단위 시간(kit.tsx:73 fmtSpent)이 어느 화면에서 실제로 쓰이는지는 확인하지 못했다.
- question-detail-view.tsx는 한글 문자열만 추출했고 좌/우 레일의 정확한 픽셀 폭·색 토큰은 읽지 않았다. 슬라이드로 재현하려면 해당 파일 300~470행을 추가로 읽어야 한다.
- 공개 리포트 뷰어 라우트(src/app/r/[token])의 실제 렌더 코드·학부모 화면 UI는 열어보지 않았다. ReportDocument mode="view" 재사용으로 추정되나 확인하지 못했다.
- 채점 화면(verdict-board.tsx, verdict-row.tsx, use-verdict-state.ts)은 열지 않았다. '어떻게 정오가 입력되는가'의 UI는 미확인.
- (teacher)/teacher/students/[studentId]/page.tsx 는 student-hub-client(허브)가 아니라 구 StudentDetailClient를 렌더한다. 즉 히트맵·취약점 원클릭 배포 CTA는 (director) 허브 경로에서만 배선된 것으로 보이며, 교사 계정이 같은 화면을 보는지는 확인하지 못했다.
- 히트맵 셀 폭 클래스 w-13은 globals.css에 정의가 없다. [추론] Tailwind v4 동적 spacing 규칙상 13×0.25rem=3.25rem(52px)로 보이나 실측하지 못했다.
- exam-tab의 「AI 추세 분석」 카드(trend-ai-card.tsx)와 sittings-table-card.tsx는 열지 않아 지표 라벨·색을 인용할 수 없다.
- study-analytics-tab.tsx(58KB, 학습지 분석 탭 본체)와 grammar-analysis.tsx는 열지 않았다. 학습지·어법 쪽 취약점 카드의 구체 스펙은 미확인.
- 리포트 섹션의 hidden(공개 제외) 토글, 테마 피커, 폰트 피커, 공유 패널(share-panel.tsx)의 실제 UI는 확인하지 않았다.
- 「미완료 학생에게 다시 보내기」·「빠르게 다시 보내기」 등 재배포 CTA는 director-glossary에 라벨이 존재하나, 실제 렌더 지점(assignment-detail-footer.tsx 등)은 확인하지 못했다.


---

## 각도 B — 랜딩 후반부 6씬(시험지·리포트·웹툰·아카이브·샘플·CTA) + 공용 크롬(헤더/스냅/DemoShell)의 완전 해부. 각 씬은 "카피(좌 5fr) | 라이브 데모(우 7fr)" 5:7 그리드가 반복되는 하나의 문법이며, 목업이 아니라 워크벤치의 실제 렌더러(PreviewPages·ReportDocument)를 그대로 임베드한다는 것이 이 덱의 핵심 서사다.

### 관측 사실

- **랜딩 페이지의 씬 순서와 스냅 단위. main 아래 각 씬이 data-snap + lg:snap-start 래퍼로 감싸이고, 후반부 순서는 ExamPaperScene(#section-exam) → IntakeScene → ReportScene(#section-report) → WebtoonScene(#section-webtoon) → FolderScene(#section-folder) → SampleScene(#section-samples) → CtaScene 이다.**
  - 근거: `src/app/page.tsx:70-90`
- **공용 씬 배경 토큰 3종이 scene-ui.tsx에 상수로 고정되어 있다. GRID_INK(라이트) = linear-gradient(rgba(15,23,42,0.045) 1px, transparent 1px) 2방향 + background-size 34px 34px. GRID_DARK(네이비) = rgba(148,180,255,0.06) 동일 격자. SCENE_NAVY_BG = bg-[radial-gradient(120%_80%_at_50%_-8%,#1B2A4A_0%,#111C34_45%,#0B1220_100%)].**
  - 근거: `src/components/landing/shared/scene-ui.tsx:11-20`
- **SceneGlow(파랑 글로우 블롭) = pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.38),transparent)] blur-[20px]. SceneKicker = text-[12px]→sm:text-[14px] font-extrabold uppercase tracking-[0.14em], 라이트=text-blue-600 / dark=text-blue-300. SceneGhost(고스트 숫자) = text-[92px]→lg:text-[190px] font-black leading-[0.8] tracking-[-0.05em] text-transparent [-webkit-text-stroke:2px_#BFDBFE]. Accent = text-blue-600.**
  - 근거: `src/components/landing/shared/scene-ui.tsx:23-74`
- **공용 리빌 모션. Reveal = initial {opacity:0, y:28, filter:blur(6px)} → whileInView {opacity:1,y:0,blur(0px)}, duration 0.7, ease [0.16,1,0.3,1], viewport once amount 0.3. Stagger = staggerChildren 기본 0.1. Item(pop=false) = y:26 + blur(5px), duration 0.65 / Item(pop=true) = scale 0.8→1, spring stiffness 320 damping 22.**
  - 근거: `src/components/landing/shared/reveal.tsx:6-108`
- **[씬 03 시험지] 섹션 셸. id="paper", bg-white + GRID_INK, lg:flex lg:min-h-[100svh] lg:items-center lg:pt-28 lg:pb-10. 내부 그리드 = mx-auto max-w-[1600px] grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:px-16. 고스트 숫자 n="03".**
  - 근거: `src/components/landing/exam-paper-scene.tsx:36-41`
- **[씬 03] 카피 전문. 킥커 / H2(lg:text-[38px] font-black leading-[1.24] text-slate-900, wordBreak keep-all) / 서브 카피(strong 색 #1E3A8A).**
  - 근거: `src/components/landing/exam-paper-scene.tsx:44-61`
  - 실제 문구: FEATURE · 1초 만에 시험지 파일로 / 웹에서 바로 편집하는 시험지! / 워드(DOCX), 한글(HWPX), PDF로도 / 바로 다운가능! / 폰트·여백·표지 양식까지 조판된 파일이라, / 받아서 바로 인쇄하고 편집합니다.
- **[씬 03] 4개 체크 항목(k/v). 각 항목 아이콘은 size-[22px] rounded-full bg-blue-600 text-white + Check strokeWidth 3.5 (sm 이상에서만 표시).**
  - 근거: `src/components/landing/exam-paper-scene.tsx:65-74`
  - 실제 문구: 100% 편집 가능 / 로고 삽입·문항 수정 자유 · 워드 · 한글 · PDF 출력 / 워드 안정 지원 · 한글(HWPX) 베타 · 인쇄(PDF) · 자동 조판 시스템 / 웹 미리보기와 1:1 완성형 조판 · 정답 및 해설지 동시 생성 / 학생용·강사용 해설지 분리 생성
- **[씬 03] 모바일/폴백용 HwpWindowMock — 한글(HWP) 창 목업의 전체 크롬. 타이틀바 h-8 bg-[#f7f8fa], 앱 배지 bg-[#2563eb] 흰 '한' 글자, 파일명 텍스트, 메뉴바 9개 항목, 서식 툴바(함초롬바탕 / 10.0 pt 필드), 눈금자 repeating-linear-gradient(to right, #cbd5e1 0 1px, transparent 1px 24px), 편집 캔버스 bg-[#e9edf2] 안에 aspectRatio 210/297 흰 A4, 상태바.**
  - 근거: `src/components/landing/exam-paper-scene.tsx:111-172`
  - 실제 문구: 실전모의고사_문제지.hwpx - 한글 / 파일 편집 보기 입력 서식 쪽 보안 검토 도구 / 함초롬바탕 / 10.0 pt / 1쪽 1단 1줄 1칸 · 삽입 / 100%
- **[씬 03] HwpWindowMock 컨테이너 시각 스펙: 뒤 글로우 = absolute -inset-6 rounded-full bg-blue-300/20 blur-[60px](sm: -inset-10 blur-[80px]); 창 = max-w-[420px](sm:480px) rounded-xl border-slate-300/80 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.05),0_30px_60px_-12px_rgba(59,130,246,0.25)]; 등장 모션 = initial {opacity:0,y:36,scale:0.97} → duration 0.75 ease [0.16,1,0.3,1].**
  - 근거: `src/components/landing/exam-paper-scene.tsx:101-109`
- **[씬 03 데모] Step4PaperDemo는 워크벤치의 실제 미리보기 렌더러 PreviewPages를 그대로 임베드한다(주석: "실제 시험지 미리보기 렌더러(PreviewPages)를 그대로 임베드한다. 문항을 빼고 다시 넣으면 실제 2단 조판이 즉시 재페이지네이션된다."). DemoShell 라벨과 초기 헤더 값이 코드에 하드코딩되어 있다.**
  - 근거: `src/components/landing/demo/step4-paper/step4-paper-demo.tsx:3-4, 23-28, 69`
  - 실제 문구: 실제 조판 엔진 — 문항을 빼고 넣거나, 제목·발문을 클릭해 직접 고쳐보세요 / 실전 대비 모의고사 / 영어 영역 — SMOAT 데모 / 이름
- **[씬 03 데모] 상단 툴바 구성: 좌측에 문항 칩(회색 rounded-full bg-slate-100 text-slate-600, 형식 `{orderNum}. 제목|주제|요지|내용일치` + X 버튼), 우측(ml-auto)에 다운로드 3버튼. 워드/한글은 border-slate-200 bg-white text-slate-600, PDF는 border-blue-200 bg-blue-50 text-blue-700. 실제 파일 링크는 /landing/demo/smoat-demo-exam.docx 와 .hwpx.**
  - 근거: `src/components/landing/demo/step4-paper/step4-paper-demo.tsx:97-158`
  - 실제 문구: 워드 / 한글 / PDF / 빠진 문항: / 모든 문항을 뺐어요 — 위 칩으로 다시 넣어보세요
- **[씬 03 데모] PDF 버튼은 실제 window.print()를 호출하며, 인쇄 직전 `@page{size:210mm 297mm;margin:0}` 스타일을 body에 주입했다가 afterprint 에 제거한다. 다운로드 파일은 public에 실존한다(smoat-demo-exam.docx 12,585B / smoat-demo-exam.hwpx 9,206B).**
  - 근거: `src/components/landing/demo/step4-paper/step4-paper-demo.tsx:119-128; public/landing/demo/ 디렉터리 실물 확인`
- **[씬 03 데모] PreviewPages 에 넘기는 조판 옵션이 코드에 고정되어 있다: template="clean", columns={2}, density="comfortable", passageStyle="plain", showAnswerSpace, showPassageTitle, showQuestionMeta={false}, paperSize="A4". 스크롤러 높이 = var(--demo-h, max(360px, calc(100svh - 344px))), 배경 bg-slate-100/70 px-3 py-4.**
  - 근거: `src/components/landing/demo/step4-paper/step4-paper-demo.tsx:176-199`
- **실제 A4 조판 엔진의 물리 스펙. 페이지 루트 = aspectRatio `210 / 297`, fontFamily '"Malgun Gothic Exam", "Malgun Gothic", "맑은 고딕", sans-serif', shadow-xl ring-1. 내부 패딩 comfortable = px-[34px] py-[28px] (compact = px-[28px] py-[24px]). 본문 = grid grid-cols-2 gap-8, comfortable 본문 타이포 text-[11.5px] leading-[1.58] (compact text-[10.5px] leading-[1.46]), 각 단 내부 space-y-4.**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page.tsx:673-740`
- **조판 간격 상수: PREVIEW_PAGE_WIDTH = 760(미리보기 기준 폭 px), TWO_COLUMN_GAP = 32, GROUP_GAP = 16, ITEM_GAP = 12, A4_HEIGHT_RATIO = 297/210.**
  - 근거: `src/components/exams/paper-builder/constants.ts:52-82`
- **시험지 1페이지 헤더 조판: header 아래 `flex items-start justify-between gap-4 border-b pb-3`(clean 템플릿의 헤더 라인 색 = border-slate-900). 부제 = text-[9px] font-bold tracking-[0.18em] text-blue-700, 제목 = text-[28px] font-black tracking-tight text-slate-950. 우측 정보 컬럼 = w-[168px] text-[10px], 3행(학교/반/이름) 각각 border-b pb-1. 하단에 안내문(text-[10px], truncate) + 시험일자.**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page-parts/page-header.tsx:49-179; src/components/exams/paper-builder/templates.ts:76-88`
  - 실제 문구: 학교 / 반 / 이름
- **2페이지 이후는 슬림 ContinuedHeader — `mb-3 flex items-center justify-between border-b pb-2 text-[10px]`(clean: border-slate-200 text-slate-400)로 제목 좌측, `N / M` 페이지 카운터 우측.**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page-parts/page-header.tsx:206-224`
- **문항 번호 조판: 발문 문단은 `mb-1 whitespace-pre-line font-semibold`, 번호 span 은 `mr-1.5 font-black` + comfortable text-[13px](compact 12px). 칸을 넘어간 문항은 `({orderNum}번 계속)` 힌트를 text-[9px] font-semibold italic 로 찍는다.**
  - 근거: `src/components/exams/paper-builder/components/a4-paper-page.tsx:1094-1164`
  - 실제 문구: (3번 계속)
- **시험지 데모의 실제 문항 fixture 4개(모두 The Gift of the Magi 지문 기반, MULTIPLE_CHOICE, points 2, difficulty INTERMEDIATE). subType 은 TITLE / TOPIC / MAIN_IDEA / CONTENT_MATCH.**
  - 근거: `src/components/landing/demo/fixtures/builder-questions.ts:49-105`
  - 실제 문구: 다음 글의 제목으로 가장 적절한 것은? / 다음 글의 주제로 가장 적절한 것은? / 다음 글의 요지로 가장 적절한 것은? / 윗글의 내용과 일치하지 않는 것은?
- **1번 문항(TITLE) 5지선다 실제 선지. 정답 ③.**
  - 근거: `src/components/landing/demo/fixtures/builder-questions.ts:54-61`
  - 실제 문구: ① The True Value of Saving Money ② Christmas Shopping on a Tight Budget ③ One Dollar and Eighty-Seven Cents: A Portrait of Devotion ④ How to Bargain with Local Merchants ⑤ The Economics of Holiday Gift-Giving
- **3번 문항(MAIN_IDEA) 한국어 선지. 정답 ②.**
  - 근거: `src/components/landing/demo/fixtures/builder-questions.ts:82-88`
  - 실제 문구: ① 절약은 생활의 안정을 가져다주는 최고의 미덕이다. ② 가난 속에서도 사랑하는 이를 위한 마음은 꺾이지 않는다. ③ 상인과의 흥정은 생활비 절감에 필수적이다. ④ 충동적인 감정 표현은 문제 해결에 도움이 되지 않는다. ⑤ 명절 소비 문화는 서민의 삶을 어렵게 만든다.
- **모든 데모가 공유하는 단일 지문 정본은 O. Henry의 'The Gift of the Magi, 1905' 첫 문단 전문이다(랜딩 4개 스텝이 이 한 지문으로 이어진다는 주석 포함).**
  - 근거: `src/lib/generate-tour-demo.ts:24-26; src/components/landing/demo/fixtures/passage.ts:1-11`
  - 실제 문구: One dollar and eighty-seven cents. That was all. And sixty cents of it was in pennies. Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony that such close dealing implied. Three times Della counted it. One dollar and eighty-seven cents. And the next day would be Christmas.
- **[씬 05 리포트] 섹션 셸: id="report", bg-white + GRID_INK, 동일한 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] max-w-[1600px]. 단 이 씬만 데모가 DOM 상 먼저 오고 order-last lg:order-2 로 우측 배치, 카피는 lg:order-1. 고스트 숫자 n="05".**
  - 근거: `src/components/landing/report-scene.tsx:43-58`
- **[씬 05] 카피 전문. H2 는 lg:text-[38px] font-black, '학생별 분석 리포트'만 Accent(text-blue-600).**
  - 근거: `src/components/landing/report-scene.tsx:61-79`
  - 실제 문구: FEATURE · 시험 리포트 / 시험이 끝나면, / 학생별 분석 리포트가 완성됩니다. / 채점만 입력하면 학생별 리포트가 완성됩니다 — 수치는 채점 그대로, 코멘트만 AI가 다듬습니다.
- **[씬 05] 3개 체크 항목.**
  - 근거: `src/components/landing/report-scene.tsx:85-87`
  - 실제 문구: 유형별 취약점 분석 / 취약 유형과 다음 학습 방향이 한눈에 · 학부모 상담용 리포트 / 6가지 테마 · 그대로 인쇄해 전달 · 출제와 이어지는 보완 학습 / 취약 유형으로 변형문제 바로 재출제
- **[씬 05] ReportMock 의 유형별 정답률 바 데이터(TYPE_BARS)와 6테마 도트 색(THEME_DOTS) 실값. weak=true 인 항목만 앰버로 렌더된다.**
  - 근거: `src/components/landing/report-scene.tsx:26-34`
  - 실제 문구: 빈칸 추론 92% / 어법 판단 84% / 글의 순서 61% / 문장 삽입 55% / 서술형 78%
- **[씬 05] ReportMock 시각 스펙: 카드 = max-w-[520px] bg-white, boxShadow '0 0 0 1px rgba(59,130,246,0.1), 0 30px 60px -10px rgba(59,130,246,0.15)', borderRadius 4px. 헤더 = border-b-[3px] border-[#1E3A8A] pb-2. 라틴 킥커 text-blue-500 uppercase tracking-[0.2em]. 문서 제목 text-[#1E3A8A] font-black.**
  - 근거: `src/components/landing/report-scene.tsx:117-130`
  - 실제 문구: Exam Report / 중간고사 대비 모의고사 · 시험 리포트 / 김스모 학생 / 고3 · 영어
- **[씬 05] ReportMock 3분할 KPI 셀 = rounded-xl border-blue-100 bg-blue-50/40, 라벨 text-blue-500, 값 text-[#1E3A8A] font-black.**
  - 근거: `src/components/landing/report-scene.tsx:132-142`
  - 실제 문구: 점수 87점 / 반 평균 대비 +9.5 / 취약 유형 2개
- **[씬 05] 바 애니메이션 계약: 트랙 h-1.5(sm:h-2) rounded-full bg-slate-100, 필은 initial {width:0} → whileInView {width:`${pct}%`}, duration 0.8, delay 0.2 + index*0.12, ease easeOut. 색은 weak ? bg-amber-400 / text-amber-600 : bg-blue-500 / text-blue-700. 라벨 폭 w-[68px](sm:76px).**
  - 근거: `src/components/landing/report-scene.tsx:146-164`
  - 실제 문구: 유형별 정답률
- **[씬 05] ReportMock 하단 학습 코멘트 박스 = rounded-xl border-blue-100 bg-[#F8FAFC], 라벨 색 #1E3A8A. 푸터에 6개 테마 도트(size-2.5~3, border-white shadow-sm) + '인쇄하기' 알약(bg-[#1E3A8A] text-white).**
  - 근거: `src/components/landing/report-scene.tsx:168-182`
  - 실제 문구: 학습 코멘트 · 글의 순서와 문장 삽입 유형에서 연결어 단서를 놓치는 패턴이 보입니다. 이번 주는 순서·삽입 변형 세트로 보완 학습을 권합니다. / 6가지 디자인 테마 / 인쇄하기
- **[씬 05 데모] Step5ReportDemo 는 워크벤치의 실제 ReportDocument 를 임베드하고 6테마 스위처를 붙인다. 문서 래퍼 = w-[880px] rounded-2xl border-slate-200 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.35)], 스크롤러 높이 var(--demo-h, max(400px, calc(100svh - 330px))). 활성 테마 칩 = border-blue-500 bg-blue-50 text-blue-700 shadow-sm, 비활성 = border-slate-200 bg-white text-slate-600.**
  - 근거: `src/components/landing/demo/step5-report/step5-report-demo.tsx:31-88`
  - 실제 문구: 실제 리포트 문서 — 테마를 바꿔가며 스크롤해 보세요 / 테마
- **리포트 6테마의 실제 색 토큰(primary / accentSoft / tint = 칩 스와치 3개 순서). indigo-consult #1D4ED8·#C9D9F7·#EFF4FF, slate-pro #1E293B·#E2E8F0·#F1F5F9, teal-fresh #0D9488·#99F6E4·#F0FDFA, navy-classic #1E3A5F·#C3D3E4·#EEF2F7, ink-editorial #18181B·#E4E4E7·#F4F4F5, forest-tutor #166534·#D5E3CE·#F1F5EC.**
  - 근거: `src/components/exam-report/report/report-themes.ts:54-152, 191`
  - 실제 문구: 컨설팅 블루 / 모노크롬 프로 / 그로스 코치 / 클래식 저널 / 잉크 매거진 / 포레스트 멘토
- **테마 설명 카피(피커 라벨용)와 폰트 페어링. indigo-consult=Pretendard, slate-pro=IBM Plex Sans KR, teal-fresh=Gowun Dodum/Pretendard, navy-classic=Noto Serif KR/Gowun Batang, ink-editorial=Hahmlet/Pretendard, forest-tutor=Pretendard.**
  - 근거: `src/components/exam-report/report/report-themes.ts:66-176`
  - 실제 문구: 딥 블루 · 신뢰의 컨설팅 스탠다드 / 흑백 대비 · 정밀한 대시보드 / 밝은 틸 · 경쾌한 성장 서사 / 명조 페어링 · 품격 있는 지면 / 먹색 타이포 · 매거진 에디토리얼 / 딥 그린 · 아이보리 멘토링
- **리포트 문서 렌더 루트: rpt-root, 본문 폭 max-w-[880px] 단일 컬럼, flex-col gap-8, px-5 py-8(@min-640: px-8 py-10). 섹션 번호는 CSS counter(decimal-leading-zero)로 01, 02… 자동 부여. 색은 전부 --rpt-* 변수로만 주입되어 테마 교체가 변수 교체와 동일하다.**
  - 근거: `src/components/exam-report/report/report-document.tsx:42-45, 146-157`
- **리포트 섹션 헤더 문법(SectionShell): 메타 라인 = `01 / SCORE OVERVIEW`(번호는 --rpt-primary, 슬래시는 --rpt-line, 킥커는 --rpt-neutral, uppercase tracking-[0.24em]) → 헤딩 text-[21px] font-bold tracking-[-0.01em](@min-640 text-2xl, --rpt-heading-font) → mt-3 헤어라인(1px --rpt-line) 위에 좌측 32px 만 2px --rpt-primary 세그먼트. 내러티브는 text-[15px] leading-[1.85] text-slate-700.**
  - 근거: `src/components/exam-report/report/sections/section-shell.tsx:46-153`
- **리포트 커버(gradient-band): rounded-2xl border(--rpt-line), 배경 linear-gradient(150deg, var(--rpt-primary), color-mix(in srgb, var(--rpt-primary) 58%, black)), 패딩 px-7 py-11(@min-640 px-12 py-14). 상단에 킥커(11px, tracking-[0.32em], white/70)와 날짜(white/55), mt-10~14 아래 부제(white/78) → 타이틀 text-[34px]→@min-640 text-[52px] font-extrabold tracking-[-0.02em] white. 메타 그리드 라벨은 STUDENT/EXAM/ACADEMY/ISSUED.**
  - 근거: `src/components/exam-report/report/report-cover.tsx:29, 38-43, 226-258`
  - 실제 문구: EXAM ANALYSIS REPORT / STUDENT / EXAM / ACADEMY / ISSUED
- **리포트 데모의 실제 데이터(LANDING_EXAM_REPORT). 커버 값과 시나리오가 fixture 주석에 명시되어 있다: 20문항 100점 만점, 82점(정답 16·정답률 80%), 반평균 74점, 오답 4문항(9·12·18·20번), 실점 18점. themeId=indigo-consult, cover.templateId=gradient-band.**
  - 근거: `src/components/landing/demo/fixtures/exam-report.ts:5-40`
  - 실제 문구: 학생 시험 분석 리포트 / 3월 학력평가 대비 · 유형별 성취 분석과 다음 3주 학습 처방 / 김민준 / 3월 학력평가 대비 모의고사 · 영어 / SMOAT 영어학원 / 2026년 3월
- **리포트 9개 섹션 heading 순서(문서 목차 그대로): 성적 개요 → 유형별 성취 → 난이도별 정오표 → 함정 선지 분석 → 오답 심층 분석 → 개념 지도 → 강점과 약점 → 3주 학습 계획 → 선생님 한마디.**
  - 근거: `src/components/landing/demo/fixtures/exam-report.ts:23-307`
  - 실제 문구: 성적 개요 / 유형별 성취 / 난이도별 정오표 / 함정 선지 분석 / 오답 심층 분석 / 개념 지도 / 강점과 약점 / 3주 학습 계획 / 선생님 한마디
- **성적 개요 섹션의 '한 줄 진단' 카드는 narrative 선두 문단의 첫 문장만 잘라 인용 카드로 띄운다(splitVerdict/splitFirstSentence). 카드 = rounded-xl, 배경 var(--rpt-tint), 좌측 3px 세로 바 var(--rpt-primary), 라벨 '한 줄 진단'(10px, tracking-[0.24em], primary), 본문 text-[16px] font-semibold leading-[1.7].**
  - 근거: `src/components/exam-report/report/sections/score-overview.tsx:38-64, 347-369`
  - 실제 문구: 한 줄 진단 / 반평균을 8점 앞선 82점, 정답률 80%로 상위권 진입 문턱에 선 시험입니다.
- **성적 개요 히어로 밴드: rounded-2xl border(--rpt-line) 배경 var(--rpt-surface), 좌측에 라틴 라벨 'Total Score'(10px tracking-[0.26em]) + 총점 text-[56px]→@min-640 text-[68px] font-extrabold tabular-nums(색 --rpt-primary, heading-font) + '/ 100'. 우측에 정답률 text-[26px] + h-1.5 드로우온 바(rpt-bar-fill). 하단에 보조 스탯(정답 문항 16 / 20문항, 실점 −18점)과 정오 분해 칩(✓정답, ✗오답 — 색/기호 이중 부호화). 총점은 CountUp 으로 카운트업된다.**
  - 근거: `src/components/exam-report/report/sections/score-overview.tsx:262-340, 211-250`
  - 실제 문구: Total Score / 정답률 / 정답 문항 / 실점 / 정답 / 오답
- **반평균 비교 카드: rounded-xl border(--rpt-line) 배경 --rpt-surface, 라틴 라벨 'Class Average', 우상단 격차 배지(양수면 --rpt-ok, 음수면 --rpt-bad). 2행 수평 바(트랙 h-2.5 rounded-full --rpt-tint), 라벨 폭 w-12, '내 점수'=--rpt-primary / '반평균'=--rpt-neutral.**
  - 근거: `src/components/exam-report/report/sections/score-overview.tsx:129-198`
  - 실제 문구: Class Average / 내 점수 / 반평균 / 반평균 대비 +8점
- **유형별 성취 섹션의 실제 6행 데이터(typeLabel/total/correct/points/earnedPoints). 빈칸 추론이 24점 중 14점으로 최대 실점 유형이다. 렌더는 실점 원장(합계 행에 borderTop 3px double var(--rpt-neutral) 마감 이중선) + '정복한 유형' 점선 리더 그리드로 나뉜다.**
  - 근거: `src/components/landing/demo/fixtures/exam-report.ts:48-105; src/components/exam-report/report/sections/type-performance.tsx:177-259`
  - 실제 문구: 내용 일치 4/4 · 주제 추론 3/3 · 제목 추론 2/3 · 어법 2/3 · 순서 배열 3/3 · 빈칸 추론 2/4 / 실점 유형 / 정오 / 정답률 / 실점 / 합계 / 정복한 유형 — 출제 문항 전부 정답
- **난이도별 정오표 데이터: 20개 셀(number/difficulty 1~5/status CORRECT|WRONG/points). easyMistakes=['12'], hardWins=['16','17','19']. 오답은 9(난이도3)·12(난이도2)·18(난이도4)·20(난이도5).**
  - 근거: `src/components/landing/demo/fixtures/exam-report.ts:113-138`
- **함정 선지 분석 데이터: 18번(선택 ③, 설계된 함정), 20번(선택 ②, 설계된 함정), 9번(선택 ④, 함정 아님), trapSusceptibility='MID'.**
  - 근거: `src/components/landing/demo/fixtures/exam-report.ts:146-171`
  - 실제 문구: 빈칸 문장의 'sacrifice'와 표면상 짝이 되는 'giving up hope(희망을 포기하다)'를 골랐습니다.
- **선생님 한마디 섹션의 실제 코멘트 전문이 fixture 에 들어 있다(델라와 짐 서사를 인용해 리포트 세계관을 웹툰 씬과 연결).**
  - 근거: `src/components/landing/demo/fixtures/exam-report.ts:304-306`
  - 실제 문구: 민준아, 이번 시험에서 가장 반가웠던 건 82점이라는 숫자보다 네가 가장 어려운 17번 빈칸을 끝까지 붙들어 맞혀냈다는 사실이야.
- **[씬 06 웹툰] 섹션 셸: id="webtoon", 배경 bg-[#F8FAFC] + GRID_INK, max-w-[1480px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8. 고스트 숫자 n="06".**
  - 근거: `src/components/landing/webtoon-scene.tsx:35-41`
- **[씬 06] 카피 전문. '웹툰으로'만 Accent(text-blue-600).**
  - 근거: `src/components/landing/webtoon-scene.tsx:44-71`
  - 실제 문구: FEATURE · 지문 기반 웹툰 / 읽기 싫어하는 학생에게는, / 지문을 웹툰으로 만들어 주세요. / 같은 지문이 컷과 말풍선으로! / 스토리로 먼저 이해하고 원문으로 돌아옵니다. / 지문 → 컷 분할 자동 · 장면·대사를 AI가 구성 / 말풍선 텍스트 편집 · 대사·해석을 강사가 직접 다듬기 / 수업 자료로 바로 활용 · 이미지로 저장해 프린트·배포
- **[씬 06] WebtoonMock 카드: max-w-[640px] rounded-2xl border-blue-100 bg-white p-3(sm:p-4) shadow-[0_30px_80px_-30px_rgba(59,130,246,0.3)]. 상단 좌측 문서명, 우측 배지 = bg-blue-50 text-blue-700 ring-1 ring-blue-200 rounded-full. 이미지 프레임 = rounded-lg border-2 border-slate-900/80(만화 프레임 감각), 모바일에서 h-[220px] 크롭 + 하단 스크림 h-24 bg-gradient-to-t from-slate-950/80 via-slate-950/40, 우하단 '전체 보기' 알약 bg-slate-950/85 backdrop-blur.**
  - 근거: `src/components/landing/webtoon-scene.tsx:129-161`
  - 실제 문구: The Gift of the Magi — 지문 웹툰 / 지문 기반 생성 / 전체 보기
- **[씬 06] 전체 보기 뷰어(모달): fixed inset-0 z-[100] bg-slate-950/90 p-3, 컨텐츠 max-w-[760px], 헤더 h-12 흰 텍스트 + 닫기 원형 버튼 bg-white/10 hover:bg-white/20, 본문 rounded-2xl bg-white p-2 세로 스크롤. Escape 키로 닫히고 body overflow 를 hidden 으로 잠근다.**
  - 근거: `src/components/landing/webtoon-scene.tsx:104-199`
  - 실제 문구: 위아래로 스크롤해서 전체 컷을 확인하세요
- **[씬 06 데모] Step6WebtoonDemo: 폭 기준 w-[720px] 래퍼(STRIP_BASE_WIDTH=720), rounded-2xl border-blue-100 bg-white p-4 shadow-[0_30px_80px_-30px_rgba(59,130,246,0.3)], 이미지 rounded-lg border-2 border-slate-900/80. 다운로드 버튼 bg-blue-600 hover:bg-blue-700(파일명 smoat-webtoon-gift-of-the-magi.webp). 스크롤 높이 var(--demo-h, max(400px, calc(100svh - 270px))).**
  - 근거: `src/components/landing/demo/step6-webtoon/step6-webtoon-demo.tsx:13-56`
  - 실제 문구: 실제 지문으로 생성한 웹툰 — 확대해서 컷과 대사를 살펴보세요 / 이미지 저장 / 실제 생성 결과 그대로입니다 — 컷 구성·원문 말풍선·한국어 해석 캡션까지 자동
- **웹툰 실물 에셋(직접 열람): 1440×2580px webp, 세로 스트립을 2열 메이슨리로 배치한 총 9컷. 좌열 5컷 / 우열 4컷, 컷마다 굵은 검정 테두리 + 흰 말풍선(검정 외곽선, 볼드 영문) + 컷 하단 흰 여백에 괄호로 감싼 한국어 해석 캡션. 화풍은 세피아/베이지 수채 톤(실내 목재 가구, 1905년 배경).**
  - 근거: `public/landing/demo/webtoon/gift-of-the-magi.webp (이미지 직접 열람); 참조 경로 src/components/landing/webtoon-scene.tsx:11`
- **웹툰 9컷의 실제 말풍선/캡션 텍스트(직접 열람). 좌열: ①"One dollar and eighty-seven cents. That was all."/(일 달러 팔십 칠 센트. 그게 전부였다.) ②"...until one's cheeks burned with the silent imputation of parsimony that such close dealing implied."/(…그런 깍쟁이 같은 거래가 암시하는 소리 없는 인색함에 얼굴이 화끈거릴 때까지.) ③"And the next day would be Christmas."/(그리고 다음 날은 크리스마스였다.) — 벽시계와 'DEC 24, 1905' 달력 소품 ④말풍선 없이 '흐...' 효과음/(그래서 델라는 그렇게 했다.) ⑤"So Della did it." + '쿵/흐윽' 효과음/(그래서 델라는 그렇게 했다.). 우열: ①"And sixty cents of it was in pennies. Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher..."/(그리고 그중 육십 센트는 페니 동전이었다. 식료품점 주인, 채소 장수, 정육점 주인을 끈질기게 괴롭혀서…) ②"Three times Della counted it. One dollar and eighty-seven cents."/(델라는 그것을 세 번이나 셌다. 일 달러 팔십 칠 센트.) ③"There was clearly nothing to do..." + "There was clearly nothing to do but flop down on the shabby little couch and howl."/(허름한 작은 소파에 주저앉아 엉엉 우는 것 말고는 할 수 있는 일이 분명 없었다.) ④"Which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles predominating."**
  - 근거: `public/landing/demo/webtoon/gift-of-the-magi.webp (이미지 직접 열람)`
  - 실제 문구: One dollar and eighty-seven cents. That was all. / (일 달러 팔십 칠 센트. 그게 전부였다.)
- **웹툰 컷 구조의 벡터 프리미티브가 public 에 별도로 존재한다(panel-1~4.svg, 400×300 viewBox). panel-1은 배경 #FEF6E4, 바닥 #8B5E3C, 테이블 #B07D4B/#C99666, 인물 피부 #F4C7A5, 머리 #7B4A2D, 옷 #7BA3C9, 동전 #F5C64F(테두리 #C89B2A) 팔레트로 구성 — 슬라이드에서 컷을 SVG로 재현할 때 그대로 쓸 수 있는 색이다.**
  - 근거: `public/landing/demo/webtoon/panel-1.svg:2-15`
- **[씬 07 아카이브] FolderScene 은 다크 씬이다: SCENE_NAVY_BG + GRID_DARK 오버레이 + SceneGlow(-top-10 h-[360px] w-[720px]). 중앙 정렬 헤드(max-w-[900px])이며 카피/데모 5:7 그리드가 아니라 단일 컬럼 + 하단 max-w-3xl 파일창 목업 구조.**
  - 근거: `src/components/landing/folder-scene.tsx:32-59`
- **[씬 07] 카피 전문. H2 폰트 크기 clamp(24px, 2.8vw, 40px), letterSpacing -0.02em, 강조 span 색 #7DB0FF. 서브 카피 색 #B6C2D9.**
  - 근거: `src/components/landing/folder-scene.tsx:39-53`
  - 실제 문구: FEATURE · 아카이브와 학원 운영 / 이 모든 것들을 철저하게 / 파일 시스템 기반으로 관리합니다. / 모든 결과물이 학교·학년·연도 트리에 쌓여, 내년에 그대로 꺼내 씁니다.
- **[씬 07] 파일 관리창 목업: overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_30px_70px_-32px_rgba(15,23,42,0.3)]. 상단 바 = FolderOpen 타일(h-7 w-7 rounded-lg bg-blue-50 text-blue-600) + 브레드크럼(text-[13px], 마지막 노드만 font-bold text-slate-900, 구분자 ChevronRight text-slate-300) + '현재 폴더' 배지(bg-blue-50 text-blue-600 text-[10px]) + 우측 ListFilter 정렬 버튼. 본문 배경 bg-slate-50/60 p-4~5.**
  - 근거: `src/components/landing/folder-scene.tsx:59-82`
  - 실제 문구: 시험지 보관함 › OO고등학교 › 2026학년도 1학기 › 3학년 / 현재 폴더 / · 하위 폴더 2개
- **[씬 07] 목업 데이터 실값. 하위 폴더 2개(중간고사 25 / 기말고사 18, 첫 번째가 selected=true), 파일 3개. 선택된 폴더 카드 = border-blue-400 ring-2 ring-blue-300/30 + FolderOpen text-blue-600, 비선택 = border-slate-200 + Folder text-slate-500. 파일 행 = rounded-xl border-slate-200 bg-white, 아이콘 타일 border-blue-100 bg-blue-50/60 + FileText text-blue-500, 우측 칩 bg-blue-50 text-blue-600.**
  - 근거: `src/components/landing/folder-scene.tsx:17-26, 85-128`
  - 실제 문구: 중간고사 · 25개 문항 / 기말고사 · 18개 문항 / 빈칸추론_세트A · 15문항 · 시험지 · 객관식 / 어법판단_세트B · 10문항 · 시험지 · 객관식 / 중간대비_심층분석 · 22쪽 · 학습지 · 분석
- **[씬 07] 창 하단 안내 바 = border-t border-slate-100 bg-white text-[11.5px] font-semibold text-slate-500, 좌측에 Cloud 아이콘 text-blue-400.**
  - 근거: `src/components/landing/folder-scene.tsx:134-137`
  - 실제 문구: 생성된 모든 분석·시험지 파일은 클라우드에 안전하게 보관됩니다
- **[씬 08 샘플] SampleScene: id="samples", bg-[#F8FAFC] + GRID_INK, 중앙 헤드 + md:grid-cols-2 gap-8 max-w-5xl 카드 2장. H2 clamp(24px,2.8vw,40px) letterSpacing -0.02em, 'SMOAT AI의 우수한 품질'만 Accent.**
  - 근거: `src/components/landing/sample-scene.tsx:44-67`
  - 실제 문구: 실제 결과물 샘플 / 말로만 설명하지 않겠습니다. / 직접 SMOAT AI의 우수한 품질을 / 확인해보세요. / SMOAT가 실제로 생성한 두 자료입니다. 직접 열어 보고 품질로 판단하세요.
- **[씬 08] 샘플 2건의 실제 메타데이터(SAMPLES 배열). 두 PDF 모두 public 에 실존한다(sample-mock-exam.pdf 381KB / sample-analysis-worksheet.pdf 5.15MB).**
  - 근거: `src/components/landing/sample-scene.tsx:18-37; public/landing/samples/ 실물 확인`
  - 실제 문구: MOCK EXAM / 실전 모의고사 문제지 / 독해 28문항 (18~45번) · 7쪽 / 수능 독해 전 유형을 실전 구성 그대로 — 이대로 인쇄해 쓸 수 있습니다. / 수능 실전 구성 · 전 유형 출제 · 2단 조판 // PASSAGE ANALYSIS / 심층 지문 분석 학습지 / 지문 분석 + 실전 학습지 · 22쪽 / 지문 한 편을 해석·구조·어법·어휘·실전 학습지까지 한 권으로 완성했습니다. / 문장별 직독직해 · 논리 구조 분석 · 실전 학습지
- **[씬 08] 카드 시각 스펙: rounded-2xl border-blue-100 bg-white shadow-[0_20px_60px_-15px_rgba(59,130,246,0.08)]. 썸네일 영역 hover 시 scale-[1.02] duration-500, 하단에 h-16 bg-gradient-to-t from-white/90 스크림 + '클릭해서 전체 보기' 알약(bg-slate-950/80 backdrop-blur). 태그 칩 = rounded-full border-blue-100 bg-blue-50/60 text-blue-700 text-[11px] font-bold. 주 CTA = bg-[#3B82F6] hover:bg-[#2563EB] shadow-[0_10px_20px_rgba(59,130,246,0.2)] h-11 rounded-full, 보조 CTA = border-slate-300 bg-white hover:border-blue-400 hover:text-blue-600. 카드 등장 = y 24 → 0, duration 0.5, delay index*0.12.**
  - 근거: `src/components/landing/sample-scene.tsx:75-144`
  - 실제 문구: 클릭해서 전체 보기 / 브라우저 미리보기 / PDF 다운로드 / 학습 목적으로 제작된 샘플 자료입니다 · 회원가입 없이 열람할 수 있습니다
- **샘플 모의고사 실물 1페이지(직접 열람): 상단 중앙 헤더 '2027학년도 대학수학능력시험 대비 실전 모의고사 문제지', 그 아래 좌측 박스 '제 3 교시' / 중앙 대형 자간 넓은 '영 어 영 역' / 우측 박스 '독해형'. 본문은 좌우 2단 조판에 중앙 세로 구분선, 좌상단에 파란 테두리 안내 박스, 문항은 '18. 다음 글의 목적으로 가장 적절한 것은?' 형식, 지문은 얇은 테두리 박스, 선지는 ①~⑤ 원문자, 각주는 '* measure: (음악의) 마디 ** bow: (현악기의) 활' 형식, 페이지 중앙에 연한 'SMOAT' 워터마크, 하단 중앙 '1 / 7' 페이지 번호와 우하단 '학습 목적으로 제작된 사설 실전 모의고사입니다.'**
  - 근거: `public/landing/samples/sample-mock-exam-thumb.png (이미지 직접 열람); 참조 src/components/landing/sample-scene.tsx:20`
  - 실제 문구: 2027학년도 대학수학능력시험 대비 실전 모의고사 문제지 / 제 3 교시 / 영 어 영 역 / 독해형 / 본 모의고사는 듣기(1번~17번)를 제외한 독해(18번~45번) 28문항으로 구성되어 있습니다. 문제지의 지시에 따라 답을 하시기 바랍니다.
- **[씬 09 CTA] CtaScene 배경 = bg-[radial-gradient(120%_120%_at_50%_0%,#1B2A4A,#0B1220_62%)] + GRID_DARK + SceneGlow(top-0 h-[400px] w-[760px]). 히어로 이미지 프레임 = h-[clamp(140px,24vw,300px)] max-w-[920px] rounded-2xl border-blue-300/20 bg-[#071426] shadow-[0_30px_90px_-34px_rgba(37,99,235,0.7)], 이미지 /landing/generated/ai-english-system-hero-v5.png object-cover.**
  - 근거: `src/components/landing/cta-scene.tsx:11-27`
- **[씬 09] CTA 카피와 타이포. H2 fontSize clamp(34px, 3.8vw, 56px), lineHeight 1.16, letterSpacing -0.03em, 강조 부분은 bg-gradient-to-r from-[#7DB0FF] to-[#3B82F6] bg-clip-text text-transparent. 본문 색 #B6C2D9. 버튼 = h-14 px-10 rounded-full, 주 CTA bg-blue-500 hover:bg-blue-400 hover:-translate-y-0.5 shadow-[0_18px_40px_-14px_rgba(59,130,246,0.85)], 보조 CTA border-white/[0.28] bg-white/[0.12]. 화살표는 텍스트 '→'.**
  - 근거: `src/components/landing/cta-scene.tsx:34-66`
  - 실제 문구: 가장 진보된 방식의 / 영어 출제 시스템 / 분석부터 출제, 시험지, 리포트까지 — 모두 이곳에 있습니다. / 지금 바로 시작하기 → / 가격 보기 →
- **[씬 09] Stagger 파라미터 = amount 0.25, gap 0.12. 브랜드 아이콘과 버튼 그룹만 pop(스프링) Item 으로 등장한다.**
  - 근거: `src/components/landing/cta-scene.tsx:15-19, 30-31, 52`
- **랜딩 헤더: fixed 상단, 항상 불투명 흰색(bg-white shadow-[0_1px_0_rgba(15,23,42,0.08)])이고 lg 이상에서만 scrolled 시 lg:bg-white/72 lg:backdrop-blur-2xl 로 전환, 비스크롤 상태는 lg:bg-transparent. 높이는 h-20 → 스크롤 시 h-16 (transition-[padding,height] duration-300). 등장 모션 initial {y:-16,opacity:0} → duration 0.5 easeOut.**
  - 근거: `src/components/landing/landing-header.tsx:45-62`
  - 실제 문구: SMOAT
- **헤더 내비 항목 9개(페이지 스크롤 순서와 동일하게 유지한다는 주석 포함). 내비 컨테이너 = rounded-full border-white/80 bg-white/68 p-1 text-[12px] font-black text-slate-700 shadow-[0_18px_52px_-38px_rgba(15,23,42,0.7)] backdrop-blur-2xl, 항목 hover:bg-blue-50 hover:text-blue-700. 우측 액션은 '로그인'(LogIn 아이콘, 고스트) + '회원 가입'(bg-slate-950 text-white hover:bg-blue-600, lg 비스크롤 시 반전되어 lg:bg-white lg:text-slate-950).**
  - 근거: `src/components/landing/landing-header.tsx:11-21, 77-113`
  - 실제 문구: 단체 세미나 / 25유형 출제 / 학습지 생성 / 시험지 / 자료 추출 / 시험 리포트 / 지문 웹툰 / 아카이브 / 샘플 / 로그인 / 회원 가입
- **랜딩 풀페이지 스냅 엔진 파라미터: LOCK_MS=1000(이동 중 관성 입력 삼킴), WHEEL_THRESHOLD=12, TOUCH_THRESHOLD=44, ALIGN_TOL=100. 데모 내부는 스냅에서 제외된다 — SNAP_IGNORE_SELECTOR = "[data-landing-demo], [role='dialog'], input, textarea, select, [contenteditable='true']". 키보드는 PageDown/ArrowDown/Space(아래), PageUp/ArrowUp/Shift+Space(위).**
  - 근거: `src/components/landing/landing-snap.tsx:6-14, 155-166`
- **스냅은 첫 섹션 위·마지막 섹션 아래에서 네이티브 스크롤로 되돌려주고(nextTop → null), 모바일에서는 푸터([data-business-info])가 보이면 CSS scroll-snap-type 을 none 으로 꺼 푸터 자유 스크롤 존을 만든다.**
  - 근거: `src/components/landing/landing-snap.tsx:79-134`
- **모든 라이브 데모 공용 크롬(DemoShell): 컨테이너 rounded-2xl border-blue-100 shadow-[0_30px_80px_-30px_rgba(59,130,246,0.25)]. 헤더/푸터 배경 bg-[#F8FAFC] + border-blue-50, px-4 py-2.5. 좌상단 배지 = rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-[0.14em] + Sparkles 아이콘.**
  - 근거: `src/components/landing/demo/demo-shell.tsx:75-97`
  - 실제 문구: Live Demo / 처음부터 / 크게 보기
- **DemoShell '크게 보기'는 같은 React 트리를 상태 보존한 채 풀스크린으로 승격한다: fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm p-4(lg:p-8), 내부 max-w-[1400px], CSS 변수 --demo-h 를 calc(100svh - 250px) 로 키워 문서를 크게 본다. Esc 로 복귀하고 body overflow 를 잠근다.**
  - 근거: `src/components/landing/demo/demo-shell.tsx:48-86, 119-140`
- **DemoShell 푸터 = 좌측 안내 문구(text-[12px] text-slate-400) + 우측 알약 CTA(bg-slate-950 hover:bg-blue-600 text-white text-[12px] font-black + ArrowRight).**
  - 근거: `src/components/landing/demo/demo-shell.tsx:149-159`
  - 실제 문구: 예시 지문으로 체험 중 — 내 교재는 가입 후 바로 / 내 자료로 직접 해보기
- **DemoGate 로딩 정책: 뷰포트 1024px 미만이면 데모 청크를 아예 받지 않고 fallback 목업만 렌더하며, 1024px 이상에서 IntersectionObserver rootMargin 600px 로 근접했을 때만 dynamic 청크를 마운트한다. 모바일은 목업 아래 파란 버튼을 눌러 풀스크린 시트에서 데모를 연다.**
  - 근거: `src/components/landing/demo/demo-gate.tsx:7-15, 45-105`
  - 실제 문구: 라이브 데모 체험하기
- **모바일 풀스크린 데모 시트: fixed inset-0 z-[80] bg-slate-100 lg:hidden, --demo-h = calc(100svh - 92px), history.pushState 로 뒤로가기 제스처에 닫히고 body 스크롤을 잠근다.**
  - 근거: `src/components/landing/demo/mobile-demo-sheet.tsx:32-66`
- **시험지 모바일 데모는 2스텝 플로우(구성·미리보기 → 다운로드)로 재구성되며, 문항 칩을 탭하면 즉시 재조판된다. 하단 고정 이동 바에 파란 CTA.**
  - 근거: `src/components/landing/demo/step4-paper/step4-paper-mobile.tsx:26-29, 113-146, 217-282`
  - 실제 문구: 구성 · 미리보기 / 다운로드 / 문항을 빼고 넣으면 즉시 재조판됩니다 / 담긴 문항 · 탭하면 빼기 — 아래 미리보기가 즉시 재조판됩니다 / 지금 이 시험지를 파일로 받기 / 실제 내보내기 엔진으로 생성된 파일입니다. / 워드(DOCX) 내려받기 / 한글(HWPX) 내려받기 / PDF로 인쇄 / 저장 / 다음으로 — 파일로 받기
- **데모 줌 컨트롤(워크벤치 PreviewZoomControls 재사용): 우상단 absolute, rounded-md border-slate-200 bg-white/95 shadow-md backdrop-blur-sm, GripVertical 드래그 핸들 + 축소/퍼센트(원래 크기)/확대/화면에 맞추기. 줌 범위 0.5~2.5, 스텝 0.25.**
  - 근거: `src/components/exams/exam-paper-builder-client-parts/preview-zoom-controls.tsx:11-96; src/components/landing/demo/demo-zoom-controls.tsx:8-24`
  - 실제 문구: 드래그해서 이동 / 축소 / 원래 크기 / 확대 / 화면에 맞추기
- **[추론] 시험지·리포트·웹툰 세 씬의 데모는 모두 '기본 = 맞춤(fit) 줌 → 사용자가 확대'라는 동일한 상호작용 리듬을 갖는다. 시험지는 A4 한 장이 통째로 보이는 contain 맞춤(폭·높이 둘 다 전달), 리포트와 웹툰은 폭 맞춤(폭만 전달)이다.**
  - 근거: `src/components/landing/demo/step4-paper/step4-paper-demo.tsx:61-65; src/components/landing/demo/step5-report/step5-report-demo.tsx:27-28; src/components/landing/demo/step6-webtoon/step6-webtoon-demo.tsx:16-17`

### 덱 재현 대상 (visualSpec)

#### 시험지 A4 2단 조판 미리보기 (Step4 라이브 데모 전체)

- 왜: 덱 전체에서 가장 강한 증거물. '목업이 아니라 실제 조판 엔진'이라는 주장을 화면 하나로 증명한다. 문항 칩을 빼면 A4가 즉시 재페이지네이션되는 인터랙션은 슬라이드에서 그대로 재현 가능하다.
- 소스: `src/components/landing/demo/step4-paper/step4-paper-demo.tsx + src/components/exams/paper-builder/components/a4-paper-page.tsx`
- 시각 스펙:

```
[전체 셸] rounded-2xl, border 1px #DBEAFE(border-blue-100), box-shadow 0 30px 80px -30px rgba(59,130,246,0.25), bg #fff, flex-column, overflow hidden.
[헤더 바] height 약 44px, bg #F8FAFC, border-bottom 1px #EFF6FF. 좌: 알약 배지 bg #2563EB, 흰 글씨 10px/font-weight 900, uppercase, letter-spacing 0.14em, 내용 'Live Demo' + 앞에 Sparkles 아이콘(12px). 그 옆 12px #64748B 텍스트 '실제 조판 엔진 — 문항을 빼고 넣거나, 제목·발문을 클릭해 직접 고쳐보세요'. 우: 'RotateCcw 처음부터'(border #E2E8F0, 흰 배경, 11px #64748B) + 'Maximize2 크게 보기'(border #BFDBFE, 흰 배경, 11px #2563EB).
[툴바] border-bottom 1px #EFF6FF, px 16 py 8. 좌측에 문항 칩 4개: rounded-full, bg #F1F5F9, 11px/700 #475569, padding 2px 4px 2px 10px, 내용 순서대로 '1. 제목' '2. 주제' '3. 요지' '4. 내용일치', 각 칩 끝에 지름 16px X 버튼(#94A3B8). 우측(ml-auto)에 3버튼: '워드'·'한글'(rounded-md border #E2E8F0 bg #fff 11.5px/700 #475569 + FileDown 14px), 'PDF'(border #BFDBFE bg #EFF6FF 11.5px/700 #1D4ED8 + Printer 14px).
[빠진 문항 바 — 칩 제거 시 위에서 슬라이드 등장] bg rgba(239,246,255,0.4), border-bottom #EFF6FF, 좌측 '빠진 문항:' 11.5px/700 #64748B, 그 옆 복원 칩 rounded-full border #BFDBFE bg #fff 11px/700 #1D4ED8, 내용 '+ 다음 글의 제목으로 가장…'(18자 자르고 … 붙임).
[미리보기 스크롤러] bg rgba(241,245,249,0.7), padding 12px 16px, 높이 max(360px, 100svh-344px). 우상단 absolute 줌 컨트롤: rounded-md border #E2E8F0 bg rgba(255,255,255,0.95) shadow-md, 항목 순서 [GripVertical 핸들][세로 구분선][− 축소][100%][+ 확대][Maximize2 맞추기], 버튼 24px, 퍼센트 11px/700 tabular-nums.
[A4 페이지] 폭 760px 기준, aspect-ratio 210/297, bg #fff, ring 1px #E2E8F0, shadow-xl, 페이지 사이 gap 20px. 폰트 '"Malgun Gothic Exam", "Malgun Gothic", "맑은 고딕", sans-serif'. 내부 padding 28px 34px.
[1페이지 헤더] flex justify-between, border-bottom 1px #0F172A, padding-bottom 12px, margin-bottom 20px. 좌: 부제 9px/700 letter-spacing 0.18em 색 #1D4ED8 = '영어 영역 — SMOAT 데모', 그 아래 제목 28px/900 tracking-tight 색 #020617 = '실전 대비 모의고사'. 우: 폭 168px 정보 컬럼, 10px, 3행(학교 / 반 / 이름) 각 행 flex justify-between + border-bottom 1px #CBD5E1 pb 4px.
[본문] display grid; grid-template-columns 1fr 1fr; column-gap 32px; font-size 11.5px; line-height 1.58; 각 단 내부 세로 간격 16px. 문항 발문은 font-weight 600, 앞에 번호 span('1.') font-weight 900 / 13px / margin-right 6px. 선지는 ①~⑤ 원문자로 시작하는 줄.
[모션] 문항 칩의 X를 누르면 해당 문항이 사라지고 뒤 문항이 위로 흘러올라 재조판(0.25~0.35s ease-out translateY). 복원 칩을 누르면 역방향. 페이지가 2장→1장으로 줄면 두 번째 A4 카드가 fade+scale(0.98)로 사라진다.
```

#### 학생 시험 리포트 문서 + 6테마 스위처 (Step5 라이브 데모)

- 왜: 클릭 한 번에 문서 전체 인격이 바뀌는 '테마 교체' 데모는 세미나에서 가장 탄성이 나오는 장면. CSS 변수 교체 구조라 슬라이드에서도 :root 변수 스왑으로 100% 동일하게 재현된다.
- 소스: `src/components/landing/demo/step5-report/step5-report-demo.tsx + src/components/exam-report/report/*`
- 시각 스펙:

```
[셸] DemoShell 동일(rounded-2xl, border #DBEAFE, shadow 0 30px 80px -30px rgba(59,130,246,0.25)). 헤더 라벨 '실제 리포트 문서 — 테마를 바꿔가며 스크롤해 보세요'.
[테마 바] border-bottom #EFF6FF, px16 py8, flex-wrap gap 6px. 맨 앞 'Palette 아이콘(14px, #2563EB) + 테마' 11.5px/900 #64748B. 이어서 칩 6개, 각 칩 = rounded-full, border 1px, padding 4px 10px, 11.5px/700, 내부 좌측에 지름 10px 원형 스와치 3개(border 1px rgba(0,0,0,0.1)) 후 라벨.
  · 컨설팅 블루 = #1D4ED8 / #C9D9F7 / #EFF4FF
  · 모노크롬 프로 = #1E293B / #E2E8F0 / #F1F5F9
  · 그로스 코치 = #0D9488 / #99F6E4 / #F0FDFA
  · 클래식 저널 = #1E3A5F / #C3D3E4 / #EEF2F7
  · 잉크 매거진 = #18181B / #E4E4E7 / #F4F4F5
  · 포레스트 멘토 = #166534 / #D5E3CE / #F1F5EC
  활성 칩 = border #3B82F6, bg #EFF6FF, 글자 #1D4ED8, shadow-sm. 비활성 = border #E2E8F0, bg #fff, 글자 #475569.
[문서] 스크롤러 bg rgba(241,245,249,0.7), 그 안에 폭 880px 문서 카드(rounded-2xl, border #E2E8F0, shadow 0 20px 60px -25px rgba(15,23,42,0.35), bg #fff). 내부 패딩 좌우 32px 상하 40px, 섹션 간 gap 32px.
[커버] rounded-2xl, 배경 linear-gradient(150deg, var(--primary), color-mix(in srgb, var(--primary) 58%, black)), padding 56px 48px. 상단 좌 'EXAM ANALYSIS REPORT' 11px/700 uppercase letter-spacing 0.32em rgba(255,255,255,0.7), 상단 우 '2026년 3월' rgba(255,255,255,0.55). 56px 아래에 부제 '3월 학력평가 대비 · 유형별 성취 분석과 다음 3주 학습 처방'(14px, rgba(255,255,255,0.78)), 그 아래 타이틀 '학생 시험 분석 리포트' 52px/800 line-height 1.12 letter-spacing -0.02em 흰색. 하단 백지 메타 그리드 라벨 STUDENT=김민준 / EXAM=3월 학력평가 대비 모의고사 · 영어 / ACADEMY=SMOAT 영어학원 / ISSUED=2026년 3월.
[섹션 헤더 문법] 메타 라인 '01 / SCORE OVERVIEW' — 번호는 primary, 슬래시는 line색, 킥커는 neutral·uppercase·letter-spacing 0.24em, 전체 11px/700. 그 아래 헤딩 21px(≥640px는 24px)/700 letter-spacing -0.01em #0F172A. 12px 아래 1px 헤어라인(line색) 위에 좌측 32px만 2px primary 세그먼트.
[성적 개요 히어로] rounded-2xl border(line) 배경 surface, 좌우 2분할(중앙 1px 세로 헤어라인). 좌: 'Total Score' 10px/700 letter-spacing 0.26em neutral → 숫자 '82' 68px/800 tabular-nums primary + '/ 100' 18px/600 neutral. 우: '정답률' 12px #64748B ↔ '80%' 26px/700 primary, 그 아래 높이 6px 라운드 트랙(tint) 위에 primary 필이 0%→80% 로 드로우온. 구분선 아래 보조 스탯 '정답 문항 16 / 20문항', '실점 −18점'(17px/700), 그 아래 칩 2개 '✓ 정답 16'(ok색) '✗ 오답 4'(bad색) — rounded-full border(line) bg #fff.
[반평균 비교] rounded-xl border(line) 배경 surface, 좌상단 'Class Average', 우상단 '반평균 대비 +8점'(ok색 12px/700). 아래 2행 바: 라벨 폭 48px, 트랙 높이 10px 라운드(tint), 필 색 = 내 점수 primary(82) / 반평균 neutral(74), 우측 값 폭 48px 우측정렬.
[한 줄 진단 카드] rounded-xl, 배경 tint, padding 16px 20px, 좌측에 폭 3px 세로 라운드 바(primary), 우측에 '한 줄 진단'(10px/700 uppercase letter-spacing 0.24em primary) + 본문 16px/600 line-height 1.7 #1E293B: '반평균을 8점 앞선 82점, 정답률 80%로 상위권 진입 문턱에 선 시험입니다.'
[모션] 테마 칩 클릭 시 문서의 모든 색이 CSS 변수 전환으로 0.25s 안에 동시 교체(레이아웃 이동 없음). 총점은 CountUp(0→82), 모든 바는 width 0→목표값 드로우온.
```

#### 지문 웹툰 9컷 스트립 (The Gift of the Magi)

- 왜: '같은 지문이 컷과 말풍선으로'라는 주장의 유일한 시각 증거. 원문 말풍선 + 한국어 해석 캡션 이중 레이어가 이 기능의 교육적 가치를 즉시 설명한다.
- 소스: `public/landing/demo/webtoon/gift-of-the-magi.webp + src/components/landing/demo/step6-webtoon/step6-webtoon-demo.tsx`
- 시각 스펙:

```
[원본] 1440×2580px, 2열 메이슨리 세로 스트립, 총 9컷(좌열 5 / 우열 4). 화풍은 세피아·베이지 수채 톤(1905년 실내, 목재 가구, 크림색 벽).
[컷 프레임] 각 컷은 굵은 검정 테두리(2~3px, #0F172A 계열)로 둘러싸이고 컷 사이 흰 여백 8~12px. 컷 하단 흰 영역에 괄호로 감싼 한국어 해석 캡션(가운데 정렬, 12~13px, 검정).
[말풍선] 흰 배경 + 검정 외곽선 타원/라운드 사각, 꼬리가 인물 쪽을 향함. 영문은 볼드 산세리프, 가운데 정렬, 검정.
[9컷 내용 — 좌열]
 1) 식탁에서 동전을 세는 델라. 말풍선 'One dollar and eighty-seven cents. That was all.' / 캡션 '(일 달러 팔십 칠 센트. 그게 전부였다.)'
 2) 붉게 상기된 델라 클로즈업 + 배경에 상인 얼굴들(핑크 톤 배경). 말풍선 '...until one's cheeks burned with the silent imputation of parsimony that such close dealing implied.' / 캡션 '(...그런 깍쟁이 같은 거래가 암시하는 소리 없는 인색함에 얼굴이 화끈거릴 때까지.)'
 3) 벽시계 + 'DEC 24, 1905' 액자 달력, 손으로 입을 가린 델라. 말풍선 'And the next day would be Christmas.' / 캡션 '(그리고 다음 날은 크리스마스였다.)'
 4) 소파에 엎드린 델라, 효과음 '흐...' / 캡션 '(그래서 델라는 그렇게 했다.)'
 5) 눈물 흘리는 클로즈업, 효과음 '쿵' '흐윽'. 말풍선 'So Della did it.' / 캡션 '(그래서 델라는 그렇게 했다.)'
[9컷 내용 — 우열]
 1) 지폐·동전 더미 + 식료품상/채소장수/정육점 주인과 흥정하는 장면 콜라주. 말풍선 'And sixty cents of it was in pennies. Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher...' / 캡션 '(그리고 그중 육십 센트는 페니 동전이었다. 식료품점 주인, 채소 장수, 정육점 주인을 끈질기게 괴롭혀서...)'
 2) 동전을 쌓아 세는 델라. 말풍선 'Three times Della counted it. One dollar and eighty-seven cents.' / 캡션 '(델라는 그것을 세 번이나 셌다. 일 달러 팔십 칠 센트.)'
 3) 소파에 앉아 얼굴을 감싼 델라(2개 말풍선). 'There was clearly nothing to do...' + 'There was clearly nothing to do but flop down on the shabby little couch and howl.' / 캡션 '(허름한 작은 소파에 주저앉아 엉엉 우는 것 말고는 할 수 있는 일이 분명 없었다.)'
 4) 손수건으로 눈물을 닦는 델라. 말풍선 'Which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles predominating.'
[데모 래퍼] 폭 720px, rounded-2xl, border #DBEAFE, bg #fff, padding 16px, shadow 0 30px 80px -30px rgba(59,130,246,0.3). 상단 좌 'The Gift of the Magi — 지문 웹툰'(12.5px/900 #020617), 우 다운로드 버튼(rounded-lg bg #2563EB 흰 글씨 12px/700 + Download 14px, 라벨 '이미지 저장'). 이미지는 rounded-lg + border 2px rgba(15,23,42,0.8). 하단 각주: Sparkles(14px #3B82F6) + '실제 생성 결과 그대로입니다 — 컷 구성·원문 말풍선·한국어 해석 캡션까지 자동'(11.5px/600 #94A3B8).
[컷 팔레트 프리미티브(SVG 재현용)] 배경 #FEF6E4, 바닥 #8B5E3C, 테이블 #B07D4B / 상판 하이라이트 #C99666, 피부 #F4C7A5, 머리 #7B4A2D, 눈 #3B2A20, 옷 #7BA3C9, 금화 #F5C64F 테두리 #C89B2A.
[모션 제안] 스크롤에 따라 컷이 하나씩 위에서 8px 떠오르며 fade-in(stagger 0.08s), 말풍선만 0.1s 늦게 scale 0.92→1 팝.
```

#### 한글(HWP) 편집기 창 목업 — '받아서 바로 편집' 증명

- 왜: '다운로드하면 한글에서 그대로 열린다'는 메시지를 국내 학원 청중이 0.5초 만에 이해하는 도상. 데스크톱 앱 크롬 전체가 코드에 하드코딩돼 있어 재현이 쉽다.
- 소스: `src/components/landing/exam-paper-scene.tsx:99-176`
- 시각 스펙:

```
[컨테이너] 폭 최대 480px, rounded-xl, border 1px rgba(203,213,225,0.8), bg #fff, box-shadow '0 0 0 1px rgba(15,23,42,0.05), 0 30px 60px -12px rgba(59,130,246,0.25)'. 뒤에 absolute -inset-10 rounded-full bg rgba(147,197,253,0.2) blur 80px 글로우.
[타이틀바] height 36px, bg #f7f8fa, border-bottom 1px #E2E8F0, padding 0 12px. 좌: 18px 정사각 rounded-[4px] bg #2563eb 안에 흰 '한' 9px/900, 그 옆 11.5px/700 #334155 '실전모의고사_문제지.hwpx - 한글'. 우: Minus(14px)·Square(10px)·X(14px) 아이콘, 색 #94A3B8.
[메뉴바] height 28px, bg #fff, border-bottom 1px #E2E8F0, 10.5~11px/600 #475569, gap 14px, 항목 '파일 편집 보기 입력 서식 쪽 보안 검토 도구'.
[서식 툴바] height 36px, bg #fafbfc, border-bottom 1px #E2E8F0. 왼쪽에 20px 정사각 rounded bg rgba(226,232,240,0.8) 더미 아이콘 5개, 세로 구분선(1px #E2E8F0) 후 두 개의 필드: rounded border #E2E8F0 bg #fff 10.5px/600 #475569 — '함초롬바탕', '10.0 pt'.
[눈금자] height 16px, bg #fff, border-bottom 1px #E2E8F0, background-image repeating-linear-gradient(to right, #cbd5e1 0 1px, transparent 1px 24px), background-size auto 7px, background-position 14px bottom, repeat-x.
[편집 캔버스] bg #e9edf2, padding 20px 24px 0, 중앙에 흰 종이(aspect-ratio 210/297, box-shadow '0 1px 3px rgba(15,23,42,0.25), 0 0 0 1px rgba(15,23,42,0.04)'), 종이 안에 /landing/samples/sample-mock-exam-page1.png 를 object-cover object-top 으로 채워 페이지 하단이 창 밖으로 잘려나가게 한다.
[상태바] height 24px, bg #f7f8fa, border-top 1px #E2E8F0, 10px/600 #64748B, 좌 '1쪽 1단 1줄 1칸 · 삽입', 우 '100%'.
[모션] 창 전체 opacity 0 / y 36 / scale 0.97 → 1, duration 0.75, cubic-bezier(0.16,1,0.3,1). 내부 A4 종이는 0.5s 지연으로 y 14 → 0.
```

#### 실전 모의고사 샘플 PDF 1페이지 (수능 실물 조판)

- 왜: '수능 실물 그대로'를 말이 아니라 지면으로 보여주는 슬라이드 한 장. 제3교시/영어영역 헤더와 2단 조판이 청중의 기존 스키마와 정확히 일치한다.
- 소스: `public/landing/samples/sample-mock-exam-thumb.png (SampleScene 카드 썸네일)`
- 시각 스펙:

```
[지면] A4 세로, 흰 배경, 얇은 회색 외곽 테두리.
[헤더] 최상단 중앙 굵은 고딕 '2027학년도 대학수학능력시험 대비 실전 모의고사 문제지'. 그 아래 3분할 행: 좌측 라운드 사각 테두리 박스 '제 3 교시', 중앙 초대형 자간 넓은 고딕 '영 어  영 역', 우측 라운드 사각 테두리 박스 '독해형'.
[본문] 좌우 2단, 중앙에 얇은 세로 구분선(전체 높이). 좌단 최상단에 파란(연한 남색) 테두리 안내 박스, 본문 볼드 부분 강조: '본 모의고사는 듣기(1번~17번)를 제외한 독해(18번~45번) 28문항으로 구성되어 있습니다. 문제지의 지시에 따라 답을 하시기 바랍니다.'
[문항 조판] 문항 번호+발문이 볼드('18. 다음 글의 목적으로 가장 적절한 것은?'), 지문은 얇은 회색 테두리 박스에 양끝맞춤 세리프체(영문), 선지는 ①~⑤ 원문자로 시작하는 줄바꿈 목록. 어휘 각주는 지문 하단 중앙에 '* measure: (음악의) 마디  ** bow: (현악기의) 활' 형식.
[워터마크] 지면 중앙에 매우 연한 회청색 대형 'SMOAT' 레터마크(뒤 배경, 본문 가독성 유지).
[푸터] 하단 중앙 '1 / 7', 우하단 작은 회색 '학습 목적으로 제작된 사설 실전 모의고사입니다.'
[슬라이드 사용법] 지면 전체를 한쪽에 크게 놓고, 우측에 콜아웃 3개(수능 실전 구성 / 전 유형 출제 / 2단 조판) — 콜아웃 칩은 rounded-full border #DBEAFE bg rgba(239,246,255,0.6) 11px/700 #1D4ED8.
```

#### 보관함 파일 관리창 (다크 씬 위 흰 창)

- 왜: '학교·학년·연도 트리' 서사를 한 컷으로 설명. 후반부 유일한 다크 씬이라 덱 리듬의 전환점으로 쓰기 좋다.
- 소스: `src/components/landing/folder-scene.tsx`
- 시각 스펙:

```
[씬 배경] radial-gradient(120% 80% at 50% -8%, #1B2A4A 0%, #111C34 45%, #0B1220 100%) 위에 격자 오버레이 linear-gradient(rgba(148,180,255,0.06) 1px, transparent 1px) + 90deg 동일, background-size 34px 34px. 상단 중앙에 글로우: 폭 720px 높이 360px, radial-gradient(closest-side, rgba(59,130,246,0.38), transparent), blur 20px, top -40px.
[헤드] 중앙 정렬, max-width 900px. 킥커 'FEATURE · 아카이브와 학원 운영' 14px/800 uppercase letter-spacing 0.14em 색 #93C5FD. H2 clamp(24px,2.8vw,40px)/900 line-height 1.24 letter-spacing -0.02em 흰색, 2행: '이 모든 것들을 철저하게' / '파일 시스템 기반으로 관리합니다.' — 이 중 '파일 시스템 기반으로 관리'만 #7DB0FF. 서브 15px/500 line-height 1.7 색 #B6C2D9: '모든 결과물이 학교·학년·연도 트리에 쌓여, 내년에 그대로 꺼내 씁니다.' 중 '학교·학년·연도 트리'는 흰색 볼드.
[창] max-width 768px, rounded-2xl, border 1px #E2E8F0, bg #fff, shadow 0 30px 70px -32px rgba(15,23,42,0.3).
[상단 바] bg #fff, border-bottom 1px #F1F5F9, padding 12px 16px, flex gap 8px. 좌: 28×28 rounded-lg bg #EFF6FF 안에 FolderOpen 14px #2563EB. 가운데 브레드크럼 13px/500 #64748B — '시험지 보관함' › 'OO고등학교' › '2026학년도 1학기' › '3학년'(마지막만 700/#0F172A), 구분자는 ChevronRight 12px #CBD5E1. 이어서 '현재 폴더' 배지(rounded-md bg #EFF6FF 10px/700 #2563EB, padding 2px 6px)와 '· 하위 폴더 2개'(10.5px/500 #94A3B8). 우: 28×28 rounded-md border #E2E8F0 안에 ListFilter 14px #64748B.
[본문] bg rgba(248,250,252,0.6), padding 20px, 세로 gap 12px.
  · 폴더 카드 2개(2열 그리드, gap 10px): rounded-xl bg #fff, padding 12px 16px. 선택된 '중간고사' = border #60A5FA + ring 2px rgba(147,197,253,0.3), 아이콘 타일 40×40 rounded-xl border #E2E8F0 bg #F8FAFC 안 FolderOpen 20px #2563EB, 제목 13px/600 #1E293B '중간고사', 부제 11px #94A3B8 '25개 문항'. 비선택 '기말고사' = border #E2E8F0, Folder 20px #64748B, '18개 문항'.
  · 파일 행 3개(세로 gap 8px): rounded-xl border #E2E8F0 bg #fff, padding 10px 16px, 좌측 36×36 rounded-lg border #DBEAFE bg rgba(239,246,255,0.6) 안 FileText 16px #3B82F6. 제목 13px/600 #1E293B / 메타 11px #94A3B8 / 우측 칩 rounded-md bg #EFF6FF 10px/700 #2563EB. 데이터: ('빈칸추론_세트A','15문항 · 시험지','객관식') ('어법판단_세트B','10문항 · 시험지','객관식') ('중간대비_심층분석','22쪽 · 학습지','분석'). 각 행 hover 시 우측 MoreHorizontal(#CBD5E1)이 opacity 0→1.
[하단 바] border-top 1px #F1F5F9, bg #fff, padding 10px, 중앙 정렬 11.5px/600 #64748B, 앞에 Cloud 14px #60A5FA: '생성된 모든 분석·시험지 파일은 클라우드에 안전하게 보관됩니다'.
```

#### 실제 결과물 샘플 카드 2장

- 왜: '말로만 설명하지 않겠습니다'라는 카피와 실제 다운로드 가능한 PDF 2건을 묶은, 세미나 마지막 신뢰 확보 슬라이드.
- 소스: `src/components/landing/sample-scene.tsx`
- 시각 스펙:

```
[씬] bg #F8FAFC + GRID_INK(rgba(15,23,42,0.045) 1px 격자, 34px). 중앙 헤드: 킥커 '실제 결과물 샘플'(12→14px/800 uppercase letter-spacing 0.14em #2563EB), H2 clamp(24px,2.8vw,40px)/900 line-height 1.24 letter-spacing -0.02em #0F172A 3행 — '말로만 설명하지 않겠습니다.' / '직접 SMOAT AI의 우수한 품질을'(가운데 구절만 #2563EB) / '확인해보세요.' 서브 15px/500 #4B5563 line-height 1.7: 'SMOAT가 실제로 생성한 두 자료입니다. 직접 열어 보고 품질로 판단하세요.'
[카드 그리드] 2열, gap 32px, max-width 1024px, 중앙.
[카드] flex-column, rounded-2xl, border 1px #DBEAFE, bg #fff, shadow 0 20px 60px -15px rgba(59,130,246,0.08), overflow hidden.
  · 상단 미리보기: 높이 clamp(80px, 100svh-720px, 150px), bg #F1F5F9, border-bottom 1px #EFF6FF. 썸네일은 object-cover object-top, hover 시 scale 1.02(transition 500ms). 하단에 높이 64px linear-gradient(to top, rgba(255,255,255,0.9), transparent) 스크림, 우하단에 알약 '클릭해서 전체 보기'(bg rgba(2,6,23,0.8), backdrop-blur, 11px/900 흰색, ExternalLink 12px).
  · 본문 padding 16px: eyebrow 11px/800 uppercase letter-spacing 0.2em #3B82F6, 제목 18px/800 #111827, 메타행(FileText 14px + 13px/700 #94A3B8), 설명 13.5px/500 line-height 1.65 #4B5563, 태그 칩(rounded-full border #DBEAFE bg rgba(239,246,255,0.6) 11px/700 #1D4ED8).
  · CTA 2개(gap 12px, 각 flex-1 높이 44px rounded-full): 왼쪽 'ExternalLink 브라우저 미리보기' bg #3B82F6 흰 글씨 13.5px/900 shadow 0 10px 20px rgba(59,130,246,0.2), hover bg #2563EB. 오른쪽 'Download PDF 다운로드' border #CBD5E1 bg #fff 글자 #1E293B, hover border #60A5FA 글자 #2563EB.
[카드 데이터] 1) MOCK EXAM / 실전 모의고사 문제지 / 독해 28문항 (18~45번) · 7쪽 / '수능 독해 전 유형을 실전 구성 그대로 — 이대로 인쇄해 쓸 수 있습니다.' / 태그 [수능 실전 구성][전 유형 출제][2단 조판]. 2) PASSAGE ANALYSIS / 심층 지문 분석 학습지 / 지문 분석 + 실전 학습지 · 22쪽 / '지문 한 편을 해석·구조·어법·어휘·실전 학습지까지 한 권으로 완성했습니다.' / 태그 [문장별 직독직해][논리 구조 분석][실전 학습지].
[푸터] 중앙 12.5px/500 #94A3B8: '학습 목적으로 제작된 샘플 자료입니다 · 회원가입 없이 열람할 수 있습니다'.
[모션] 카드 각각 opacity 0 / y 24 → 0, duration 0.5, delay index×0.12, cubic-bezier(0.16,1,0.3,1).
```

#### 클로징 CTA 씬 (다크 그라디언트 + 그라디언트 텍스트)

- 왜: 세미나 마지막 슬라이드로 그대로 옮길 수 있는 완성형 클로징. 그라디언트 워드마크와 2버튼 구조가 그대로 '지금 시작' 행동 유도로 작동한다.
- 소스: `src/components/landing/cta-scene.tsx`
- 시각 스펙:

```
[배경] radial-gradient(120% 120% at 50% 0%, #1B2A4A, #0B1220 62%) + GRID_DARK(rgba(148,180,255,0.06), 34px). 상단 중앙 글로우 폭 760px 높이 400px radial-gradient(closest-side, rgba(59,130,246,0.38), transparent) blur 20px, top 0.
[레이아웃] 중앙 정렬 세로 스택, max-width 1440px, padding 0 32px.
 1) 히어로 이미지 프레임: 폭 최대 920px, 높이 clamp(140px, 24vw, 300px), rounded-2xl, border 1px rgba(147,197,253,0.2), bg #071426, shadow 0 30px 90px -34px rgba(37,99,235,0.7), 이미지 /landing/generated/ai-english-system-hero-v5.png object-cover.
 2) 브랜드 아이콘 56×56 rounded-2xl, shadow 0 10px 30px rgba(59,130,246,0.3), margin-bottom 24px.
 3) H2: font-size clamp(34px, 3.8vw, 56px), font-weight 900, line-height 1.16, letter-spacing -0.03em, max-width 896px. 1행 '가장 진보된 방식의'(흰색), 2행 '영어 출제 시스템' = background linear-gradient(to right, #7DB0FF, #3B82F6) + background-clip text + 투명 글자.
 4) 본문: margin-top 20px, 16~18px/500 line-height relaxed, 색 #B6C2D9 — '분석부터 출제, 시험지, 리포트까지 — 모두 이곳에 있습니다.'
 5) 버튼 행(margin-top 32px, gap 16px, 모바일 세로/데스크톱 가로): 주 CTA 높이 56px padding 0 40px rounded-full bg #3B82F6 흰 글씨 16px/800 shadow 0 18px 40px -14px rgba(59,130,246,0.85), hover bg #60A5FA + translateY(-2px), 라벨 '지금 바로 시작하기 →'. 보조 CTA 동일 치수, border 1px rgba(255,255,255,0.28), bg rgba(255,255,255,0.12), 흰 글씨, hover border rgba(255,255,255,0.5) + bg rgba(255,255,255,0.2), 라벨 '가격 보기 →'.
[모션] Stagger 컨테이너 amount 0.25 / staggerChildren 0.12. 이미지·H2·본문은 y 26 + blur 5px → 0(duration 0.65, cubic-bezier(0.16,1,0.3,1)), 브랜드 아이콘과 버튼 행만 spring(stiffness 320, damping 22)으로 scale 0.8→1 팝.
```

#### 라이브 데모 공용 크롬 (LIVE DEMO 셸 + 크게 보기)

- 왜: 6개 씬을 하나로 묶는 시각 문법. 슬라이드에서 여러 데모를 보여줄 때 이 프레임을 반복하면 '제품을 그대로 심어놨다'는 인상이 누적된다.
- 소스: `src/components/landing/demo/demo-shell.tsx + demo-gate.tsx`
- 시각 스펙:

```
[셸] rounded-2xl, border 1px #DBEAFE, bg #fff, box-shadow 0 30px 80px -30px rgba(59,130,246,0.25), display flex column, overflow hidden.
[헤더] shrink-0, bg #F8FAFC, border-bottom 1px #EFF6FF, padding 10px 16px, flex justify-between. 좌: 배지(rounded-full bg #2563EB, padding 2px 8px, 10px/900 uppercase letter-spacing 0.14em 흰색, Sparkles 12px) 'Live Demo' + 씬별 라벨(12px/600 #64748B, 말줄임). 우: [RotateCcw + '처음부터'] rounded-md border #E2E8F0 bg #fff 11px/700 #64748B, [Maximize2 + '크게 보기'] rounded-md border #BFDBFE bg #fff 11px/700 #2563EB.
[본문] flex-1, min-height 0 — 내부 스크롤 영역은 반드시 height: var(--demo-h, <씬별 clamp>) 로 명시(플렉스 basis 금지).
[푸터] shrink-0, bg #F8FAFC, border-top 1px #EFF6FF, padding 10px 16px, flex justify-between. 좌 12px/500 #94A3B8 '예시 지문으로 체험 중 — 내 교재는 가입 후 바로', 우 알약 CTA rounded-full bg #020617 흰 글씨 12px/900 padding 6px 14px + ArrowRight 14px '내 자료로 직접 해보기'(hover bg #2563EB).
[크게 보기 상태] 오버레이 position fixed inset 0, z-index 120, bg rgba(2,6,23,0.6), backdrop-blur-sm, padding 32px. 내부 셸이 max-width 1400px / height 100% 로 승격되고 --demo-h 가 calc(100svh - 250px) 로 커진다. 우상단 버튼은 X(정사각 28px rounded-md border #E2E8F0 bg #fff #64748B)로 바뀐다. Esc 로 닫힘.
[씬별 라벨 문구] 시험지='실제 조판 엔진 — 문항을 빼고 넣거나, 제목·발문을 클릭해 직접 고쳐보세요' / 리포트='실제 리포트 문서 — 테마를 바꿔가며 스크롤해 보세요' / 웹툰='실제 지문으로 생성한 웹툰 — 확대해서 컷과 대사를 살펴보세요'.
[모바일 게이트 버튼] 목업 아래 전폭 버튼, rounded-xl bg #2563EB 흰 글씨 14px/900, padding 12px 16px, shadow 0 10px 30px -10px rgba(37,99,235,0.6), Sparkles 16px, 라벨 '라이브 데모 체험하기'. 탭하면 fixed inset-0 z-80 bg #F1F5F9 풀스크린 시트가 열린다(--demo-h = calc(100svh - 92px)).
```

#### 랜딩 헤더 + 풀페이지 스냅 내비게이션

- 왜: 덱의 목차 슬라이드로 그대로 전용 가능(9개 내비 라벨 = 제품 기능 지도). 또한 '휠 한 번에 한 씬'이라는 랜딩의 연출 원리를 설명할 때 쓰인다.
- 소스: `src/components/landing/landing-header.tsx + landing-snap.tsx`
- 시각 스펙:

```
[헤더] position fixed 좌우 0, z-index 50, height 80px(스크롤 시 64px, transition 300ms). 기본 bg #fff + shadow 0 1px 0 rgba(15,23,42,0.08); 1024px 이상에서 비스크롤이면 배경 투명·그림자 없음, 스크롤되면 bg rgba(255,255,255,0.72) + backdrop-blur 40px. 내부 max-width 1240px, flex justify-between.
[로고] 원형 BrandIcon + 워드마크 'SMOAT' 18px/900, 색 #020617(다크 씬 위 비스크롤 시 흰색), hover 시 #2563EB.
[내비 알약] 1024px 이상에서만 표시. rounded-full, border 1px rgba(255,255,255,0.8), bg rgba(255,255,255,0.68), backdrop-blur 40px, padding 4px, shadow 0 18px 52px -38px rgba(15,23,42,0.7). 항목 9개 12px/900 #334155, 각 항목 rounded-full padding 8px 12px, hover bg #EFF6FF 글자 #1D4ED8. 라벨 순서: 단체 세미나 / 25유형 출제 / 학습지 생성 / 시험지 / 자료 추출 / 시험 리포트 / 지문 웹툰 / 아카이브 / 샘플.
[우측 액션] '로그인'(LogIn 16px + 13px/900, 투명 배경 고스트) / '회원 가입'(높이 40px rounded-full bg #020617 흰 글씨 13px/900 + ArrowRight 16px, hover bg #2563EB + translateY(-2px); 1024px 비스크롤 시 bg #fff 글자 #020617 로 반전).
[등장 모션] header initial {y:-16, opacity:0} → {y:0, opacity:1}, duration 0.5, ease-out.
[스냅 원리 도식용 수치] 이동 잠금 1000ms, 휠 데드존 12px 미만 무시, 터치 스와이프 임계 44px, 섹션 정렬 허용 오차 100px. 데모 내부([data-landing-demo])·모달·입력요소 위에서는 스냅을 끄고 네이티브 스크롤에 넘긴다. 키보드 PageDown/ArrowDown/Space=아래, PageUp/ArrowUp/Shift+Space=위.
```


### 갭 / 미확인

- demo/ 디렉토리 중 Step1~3 계열(step1-crop/sample-slots.ts, step1-crop-demo.tsx, step2-analysis-demo.tsx, step3-generate-demo.tsx, step3-generate-mobile.tsx, type-chip-selector.tsx)과 fixtures/analysis-report.ts, fixtures/questions.ts 는 각도 B(후반부 6씬) 범위 밖이라 열지 않았다. 각도 A 정찰이 필요하다.
- use-demo-zoom.ts / use-fit-zoom.ts / use-demo-pagination.ts / demo-sheet-context.ts 내부 구현은 읽지 않았다. 줌 초기값이 'contain 맞춤(시험지)' vs '폭 맞춤(리포트·웹툰)'이라는 것은 호출부 주석·인자 형태로만 확인했고, 실제 계산식(리사이즈 대응, 최소/최대 클램프 방식)은 미확인.
- 리포트 문서의 나머지 6개 섹션 렌더러(difficulty-matrix, trap-analysis, wrong-deep-dive, concept-map, strength-weakness, study-plan, teacher-comment)의 시각 스펙은 확인하지 못했다. 데이터(fixture)는 전부 확보했으나 정오표 셀 색/그리드, 개념 지도 표현, 3주 계획 체크박스 UI 는 코드 미확인.
- report-motion.tsx 의 CountUp 지속시간·data-reveal 스태거 타이밍(REPORT_MOTION_CSS 실제 keyframes)과 rpt-bar-fill 애니메이션 duration/easing 은 확인하지 못했다.
- IntakeScene(#section-intake)은 대상 목록에 없어 읽지 않았다. 후반부 씬 사이에 끼어 있으므로 덱 흐름상 별도 정찰이 필요할 수 있다.
- exam-paper-scene 이 참조하는 /landing/samples/sample-mock-exam-page1.png 는 파일 실존만 확인했고(385KB) 이미지 내용은 직접 열람하지 않았다. 다만 같은 PDF의 썸네일(sample-mock-exam-thumb.png)은 직접 열람해 조판을 기술했다.
- 심층 지문 분석 학습지 샘플(sample-analysis-worksheet.pdf / -thumb.png)의 실제 지면 구성은 열람하지 않았다. 카드 메타(22쪽, 태그 3종)만 확보.
- cta-scene 의 /landing/generated/ai-english-system-hero-v5.png 실제 이미지 내용은 확인하지 않았다(alt 텍스트 '알파벳과 영어 시험지가 분석되어 정돈된 문항으로 생성되는 과정'만 확보).
- A4 조판에서 선지(①~⑤) 목록과 답란(showAnswerSpace)의 구체 CSS(들여쓰기, 줄간, 답란 높이)는 a4-paper-page.tsx 1230행 이후 미열람 구간에 있어 확인하지 못했다.


---

## [각도 G] 학생용 모바일/태블릿 학습 경험 — 실제 배포된 학생 앱은 두 갈래다. (1) Capacitor 네이티브 셸이 원격 로드하는 `/g` "SMOAT 학습"(시험지×계기판 디자인 언어, gd.css 스코프 토큰, 4탭 셸) — 이것이 진짜 학생 모바일 앱이다. (2) `src/app/(student-app)` 아래의 Duolingo형 게이미피케이션 학습 표면(3탭, XP/스트릭/미션) — 다만 이 쪽은 핵심 CSS 토큰(--key-learn/--base-bg)과 유틸 클래스(.card-3d/.btn-3d)가 코드베이스에 정의되어 있지 않아 시각 재현 시 주의가 필요하다. 덱에서 태블릿 목업 안에 재현할 1순위는 `/g` 계열(과제 카드 → 문항 플레이어 → 채점 결과)이다.

### 관측 사실

- **학생 모바일 앱의 실제 배포 표면은 `/g`다. Capacitor 네이티브 셸이 원격 URL `https://www.smoat.co.kr/g`를 직결 로드하며, 앱 식별자는 `kr.co.smoat.student`, 앱 이름은 `SMOAT 학습`이다. 스플래시/앱 배경색은 `#f6f5f1`(지면색)로 고정해 흰 플래시를 제거한다.**
  - 근거: `mobile/capacitor.config.ts:4-8, mobile/capacitor.config.ts:13, mobile/capacitor.config.ts:31-33`
  - 실제 문구: SMOAT 학습
- **`/g` 학생앱의 디자인 시스템 이름은 "시험지 × 계기판"이며 라이트 고정(다크 토글 영향 배제)이다. 전 팔레트가 `.gd-app` 스코프 CSS 변수로 정의돼 있다.**
  - 근거: `src/app/g/gd.css:1-7, src/app/g/gd.css:9-25`
  - 실제 문구: 어법 드릴 (/g) — 스코프 디자인 시스템 "시험지 × 계기판"
- **gd 팔레트 실측 hex 전량: 지면 --gd-paper #f6f5f1, 카드 --gd-card #ffffff, 헤어라인 --gd-line #e5e3db, 강한선 --gd-line-strong #d4d1c6, 본문잉크 --gd-ink #16202e, 보조잉크 --gd-ink-2 #5a6372, 흐린잉크 --gd-ink-3 #98a0ad, 액션/진행 --gd-blue #1d4ed8, --gd-blue-soft #eef2fe, --gd-blue-line #c7d4f8, 정답 --gd-good #047857, --gd-good-soft #ecfdf5, 오답 --gd-bad #be123c, --gd-bad-soft #fff1f2, 마스터 --gd-master #0f766e.**
  - 근거: `src/app/g/gd.css:11-25`
- **gd 타이포 스케일은 전부 rem 고정(전역 body 확대 오버라이드 무풍지대): 3xs 0.625rem(10px), 2xs 0.6875rem(11), xs 0.75rem(12), sm 0.8125rem(13), base 0.875rem(14), md 0.9375rem(15), lg 1.0625rem(17), xl 1.25rem(20), 2xl 1.5rem(24). 영어 지문만 세리프(Georgia/Times New Roman/Noto Serif), line-height 1.72, letter-spacing 0.001em.**
  - 근거: `src/app/g/gd.css:28-36, src/app/g/gd.css:38, src/app/g/gd.css:60-66`
- **터치 타깃 규격: 기본 버튼 .gd-btn은 min-height 2.75rem(44px)·radius 0.75rem·font-size 13px·weight 600, :active 시 scale(0.98). 선택지 .gd-option은 min-height 3rem(48px)·border 1.5px·radius 0.75rem. 정사각 옵션(밑줄 번호 택일)은 2.75rem×2.75rem. 어절 타일 .gd-tile도 min-height 2.75rem.**
  - 근거: `src/app/g/gd.css:86-99, src/app/g/gd.css:119-131, src/app/g/gd.css:146-154, src/app/g/gd.css:590-599`
- **카드 라운드는 .gd-card = 0.875rem(14px) + 1px --gd-line 테두리 + 흰 배경. 레슨 블록 .gd-block은 1rem 라운드 + padding 1rem(태블릿 768px+에서 1.25rem 1.5rem). 하단 시트는 상단만 1.25rem 라운드 + box-shadow 0 -12px 40px rgba(22,32,46,0.14).**
  - 근거: `src/app/g/gd.css:77-81, src/app/g/gd.css:441-446, src/app/g/gd.css:227-247, src/app/g/gd.css:643`
- **진행률 게이지 .gd-meter는 높이 0.25rem(4px)·pill·트랙색 --gd-line, 채움은 --gd-blue이며 width 전이는 400ms cubic-bezier(0.22,1,0.36,1). data-tone="good"이면 채움이 --gd-good로 바뀐다.**
  - 근거: `src/app/g/gd.css:204-217`
- **선택지 상태는 data-state 속성으로만 표현: selected=파랑 테두리+#eef2fe 배경, correct=초록 테두리+#ecfdf5, wrong=자주 테두리+#fff1f2, dim=opacity 0.55.**
  - 근거: `src/app/g/gd.css:132-144`
- **모션 규격: 시트 진입 gd-slide-up 220ms cubic-bezier(0.22,1,0.36,1)(translateY 24px→0), 백드롭 gd-fade-in 160ms, 판정배너/칩 gd-pop 180~200ms(scale 0.94→1), 오답 흔들림 gd-shake 240ms(±3px), 사이드시트 gd-slide-in-right 220ms. prefers-reduced-motion에서 전부 무효화된다.**
  - 근거: `src/app/g/gd.css:257-269, src/app/g/gd.css:392-395, src/app/g/gd.css:919-924, src/app/g/gd.css:1036-1073`
- **하단 탭바는 4탭이며 라벨 자구는 정확히 "홈 / 학습 / 과제 / 내 기록"이다. 각각 /g/home, /g/track/grammar, /g/tasks, /g/me. 아이콘은 lucide House, BookOpen, ClipboardList, BarChart3이며 활성 시 strokeWidth 2, 비활성 1.75.**
  - 근거: `src/components/grammar-drill/g-shell.tsx:45-55, src/components/grammar-drill/g-shell.tsx:156-180`
  - 실제 문구: 홈 · 학습 · 과제 · 내 기록
- **탭바 시각 스펙: position fixed bottom, 배경 rgba(255,255,255,0.96) + backdrop-blur(8px), 상단 1px --gd-line 테두리, z-index 35. 탭 항목은 세로 아이콘+라벨(gap 0.1875rem), 폰트 10px/600/letter-spacing 0.02em, 기본색 --gd-ink-3, 활성색 --gd-blue. 과제 탭 배지는 min-width 1rem·height 1rem 원형 --gd-bad 배경 흰 글씨이며 9 초과 시 "9+".**
  - 근거: `src/app/g/gd.css:327-373, src/components/grammar-drill/g-shell.tsx:171-175`
  - 실제 문구: 9+
- **셸 상단 헤더는 높이 3.8125rem 고정, 배경 rgba(246,245,241,0.92)+blur(8px), 좌측에 "SMOAT · {학원명}" 라벨 + "{학생이름}님" 2행(홈에서는 이름 행 숨김), 우측에 방패(상태창)·햄버거 아이콘 각 40×40px.**
  - 근거: `src/components/grammar-drill/g-shell.tsx:39, src/components/grammar-drill/g-shell.tsx:112-149, src/app/g/gd.css:311-320`
  - 실제 문구: SMOAT · {학원명} / {학생이름}님
- **햄버거 우측 슬라이드 시트에는 상태창·4탭·"취약 단어장"·"로그아웃"(--gd-bad 색)이 있고, 상단에 "오늘 질문 N회 남았습니다" 행이 들어간다. 시트 폭은 min(19rem, 84vw).**
  - 근거: `src/components/grammar-drill/g-shell.tsx:215-285, src/app/g/gd.css:376-391`
  - 실제 문구: 오늘 질문 3회 남았습니다 / 취약 단어장 / 로그아웃
- **과제 목록(/g/tasks) 화면 카피: 타이틀 "과제", 부제 "오늘 마감 N건 · 이번 주 N건"(로딩 중 "선생님이 배포한 과제를 확인합니다"). 필터 세그먼트는 "해야 할 과제"/"완료" 2개, 그룹 헤더는 "기한 지남"(--gd-bad)/"오늘 마감"/"이번 주"/"나중에 · 마감 없음".**
  - 근거: `src/app/g/tasks/tasks-client.tsx:224-231, src/app/g/tasks/tasks-client.tsx:245-250, src/app/g/tasks/tasks-client.tsx:38-43`
  - 실제 문구: 과제 / 오늘 마감 2건 · 이번 주 5건 / 해야 할 과제 / 완료 / 기한 지남 / 오늘 마감 / 이번 주 / 나중에 · 마감 없음
- **과제 종류(kind) 칩 4종 라벨과 색: 시험 EXAM = --gd-blue-soft/--gd-blue, 학습지 WORKSHEET = #f1f5f9/#475569, 문제 세트 QUESTIONS = #eef2ff/#4338ca, 어법 훈련 GRAMMAR = --gd-good-soft/--gd-good. 아이콘은 각각 FileText, BookOpenCheck, ListChecks, SpellCheck.**
  - 근거: `src/app/g/tasks/task-card.tsx:34-47, src/lib/study-assignments/types.ts:98-101`
  - 실제 문구: 시험 / 학습지 / 문제 세트 / 어법 훈련
- **과제 상태 칩 3종: 대기(ASSIGNED, --gd-paper/--gd-ink-2), 진행 중(IN_PROGRESS, --gd-blue-soft/--gd-blue), 완료(DONE, --gd-good-soft/--gd-good).**
  - 근거: `src/app/g/tasks/task-card.tsx:49-53`
  - 실제 문구: 대기 / 진행 중 / 완료
- **D-day 라벨 규칙은 dDay 0이면 "D-DAY", 양수면 "D-N", 음수면 "D+N", null이면 "마감 없음" 표기. D-0 pill은 --gd-blue-soft 배경 + --gd-blue 글씨, 그 외는 --gd-ink-2 텍스트만. 24시간 이내면 카운트다운 "4시간 32분 남음"/"38분 전 마감"이 60초 틱으로 붙는다.**
  - 근거: `src/lib/study-assignments/status.ts:56-60, src/lib/study-assignments/status.ts:67-76, src/app/g/tasks/task-card.tsx:313-330`
  - 실제 문구: D-DAY / D-3 / D+2 / 마감 없음 / 4시간 32분 남음
- **과제 카드에는 시험 제출 후 점수 미공개 상태 안내와 예약 잠금 안내 문구가 있다.**
  - 근거: `src/app/g/tasks/task-card.tsx:219-244`
  - 실제 문구: 제출 완료 — 결과는 선생님 확인 후 공개됩니다 / 아직 열리지 않은 과제입니다. 시작일이 되면 풀 수 있습니다.
- **기한 배너는 overdue가 있으면 rose 톤(--gd-bad-soft/#fecdd3/--gd-bad), 없으면 blue 톤(--gd-blue-soft/--gd-blue-line/--gd-blue)으로 렌더된다.**
  - 근거: `src/app/g/tasks/task-card.tsx:148-154`
  - 실제 문구: 기한이 지난 과제가 2건 있습니다 / 오늘 마감 과제가 3건 있습니다
- **문항 플레이어(/g/q/[taskId])의 레이아웃은 h-dvh flex 3단: 헤더(뒤로 40×40 + 제목 truncate + "응답 n/N" + gd-meter 진행바) / 스크롤 본문(gd-card 안에 문항번호 원형 배지 + 배점 + "다시 보기" 플래그 + 문제 본문 + AnswerLayer) / 하단바(번호 점프 스트립 + 이전/다음·제출하기). 컨테이너 max-w-2xl.**
  - 근거: `src/app/g/q/[taskId]/q-player-client.tsx:237-274, src/app/g/q/[taskId]/q-player-client.tsx:288-343, src/app/g/q/[taskId]/q-player-client.tsx:370-465`
  - 실제 문구: 응답 7/12
- **문항번호 배지는 h-8 min-w-8 원형 --gd-blue 배경 흰 굵은 글씨, 그 옆에 "N점"(gd-mono 11px, --gd-ink-3). "다시 보기" 플래그 버튼은 활성 시 테두리 #c4b5fd / 배경 #f5f3ff / 글씨·아이콘 fill #7c3aed, 비활성은 --gd-line 테두리 + --gd-ink-3.**
  - 근거: `src/app/g/q/[taskId]/q-player-client.tsx:289-322`
  - 실제 문구: 다시 보기
- **하단 번호 점프 스트립은 각 버튼 h-10 w-9 rounded-lg 테두리형이며, 현재 문항은 --gd-blue 테두리 + --gd-blue-soft 배경, 응답 완료는 하단에 1×1 --gd-blue 도트, 다시 보기 플래그는 우상단 1×1 violet-500 도트로 표시된다.**
  - 근거: `src/app/g/q/[taskId]/q-player-client.tsx:378-419`
- **플레이어 하단 안내 문구 및 버튼 자구가 확정돼 있다. 제출 버튼은 전 문항 응답 시에만 활성이며 flex-[1.4] 비율(이전 버튼 flex-1)이다.**
  - 근거: `src/app/g/q/[taskId]/q-player-client.tsx:422-463, src/app/g/q/[taskId]/q-player-client.tsx:356-366`
  - 실제 문구: 표시한 문항 3개가 있습니다. 제출 전에 다시 확인해 보세요. / 모든 문항에 답하면 제출할 수 있습니다. (남은 문항 2개) / 아래에서 답을 선택합니다 / 제출하기 / 제출 중…
- **폴드 아래 콘텐츠 암시를 위해 본문 하단에 h-10 그라디언트 페이드(linear-gradient(to top, var(--gd-paper), rgba(246,245,241,0)))가 깔린다.**
  - 근거: `src/app/g/q/[taskId]/q-player-client.tsx:347-355`
- **제출 확인 시트(gd-sheet)는 제목 "제출 전 마지막 확인", 문항별 내 선택 요약 그리드(3~4열), 경고 밴드, 이중 확인 버튼으로 구성된다. 미응답은 "—", 서답형은 "입력함"으로 에코된다.**
  - 근거: `src/app/g/q/[taskId]/q-submit-sheet.tsx:93-161, src/app/g/q/[taskId]/q-submit-sheet.tsx:27-35`
  - 실제 문구: 제출 전 마지막 확인 / 총 12문항 중 12문항에 답했습니다. / 다시 보기로 표시한 문항 3개가 있습니다. / 제출하면 답을 수정할 수 없습니다. / 다시 확인 / 최종 제출
- **채점 결과 화면의 판정 4종 색 대응: CORRECT "정답" fg --gd-good/bg --gd-good-soft/border #a7f3d0, WRONG "오답" fg --gd-bad/bg --gd-bad-soft/border #fecdd3, PARTIAL "부분 정답" fg --gd-blue/bg --gd-blue-soft/border --gd-blue-line, NEEDS_REVIEW "확인 중" fg --gd-ink-2/bg --gd-paper/border --gd-line-strong.**
  - 근거: `src/app/g/q/[taskId]/q-result-screen.tsx:29-47`
  - 실제 문구: 정답 / 오답 / 부분 정답 / 확인 중
- **결과 점수 카드는 gd-card + gd-pop 진입, 점수는 gd-mono text-5xl bold이며 400ms easeOutCubic rAF 카운트업(reduced-motion이면 즉시 확정값). 만점이면 숫자가 --gd-good로 바뀌고 "만점입니다" 문구가 추가된다. 아래에 w-44 정답률 미터 + 통계 그리드(정답 n/N, 오답, 부분 정답, 확인 중).**
  - 근거: `src/app/g/q/[taskId]/q-result-screen.tsx:57-77, src/app/g/q/[taskId]/q-result-screen.tsx:220-267`
  - 실제 문구: 문제 세트 결과 / 만점입니다 / 정답률 85% / 정답 · 오답 · 부분 정답 · 확인 중
- **서술형 문항이 있으면 --gd-blue-soft 배경 안내가 붙는다.**
  - 근거: `src/app/g/q/[taskId]/q-result-screen.tsx:268-276`
  - 실제 문구: 서술형 답안 2문항은 선생님이 확인한 뒤 점수에 반영합니다.
- **문항별 판정 그리드는 grid-cols-5 gap-1.5, 각 타일 h-9 rounded-lg 테두리형이며 배경/테두리/글씨색이 판정 톤을 따른다. 펼쳐진 타일은 inset 0 0 0 1.5px 링이 들어간다. 타일 탭 → 아코디언으로 문항 본문 + 내 응답 에코가 열린다. 정답 텍스트·해설은 서버가 내려주지 않으며 화면도 표시하지 않는다.**
  - 근거: `src/app/g/q/[taskId]/q-result-screen.tsx:332-368, src/app/g/q/[taskId]/q-result-screen.tsx:370-435, src/app/g/q/[taskId]/q-result-screen.tsx:10-13`
  - 실제 문구: 문항별 결과 / 번호를 누르면 문항과 제출한 답을 확인할 수 있습니다.
- **오답 복기 UI: 필터 칩 "전체 N / 오답 N / 확인 중 N"과 우측 "오답 차례로 보기" 버튼, 아코디언 하단에 "이전 오답 / n / N / 다음 오답" 내비가 있다.**
  - 근거: `src/app/g/q/[taskId]/q-result-screen.tsx:296-330, src/app/g/q/[taskId]/q-result-screen.tsx:438-464`
  - 실제 문구: 전체 12 / 오답 3 / 확인 중 2 / 오답 차례로 보기 / 이전 오답 / 다음 오답 / 과제 목록으로
- **선지 응답 위젯(AnswerLayer)은 시험지 정본과 동일 컴포넌트를 재사용한다. card variant에서 선지 행은 rounded-xl px-4 py-3 min-h-11이며 선택 시 border/bg 모두 #3182F6 + 흰 글씨, 미선택은 border #E5E8EB / bg white / text #191F28. 대형 원형 버튼 행은 h-12 w-12 text-lg. 라벨은 위치 기반 원형숫자(①~).**
  - 근거: `src/app/t/[token]/taking-parts/answer-layer.tsx:160-241, src/app/t/[token]/taking-parts/answer-layer.tsx:61-79`
  - 실제 문구: 답안 입력 / 정답 2개를 고르세요 / 현재 1/2
- **서답형은 자동 확장 textarea(autocomplete/autocorrect/spellcheck off, maxLength 4000)이며 focus 시 250ms 후 scrollIntoView(block:center)로 가상 키보드 가림을 방지한다. 수동 채점 유형에는 전용 안내가 붙는다.**
  - 근거: `src/app/t/[token]/taking-parts/answer-layer.tsx:51-57, src/app/t/[token]/taking-parts/answer-layer.tsx:326-346, src/app/t/[token]/taking-parts/answer-layer.tsx:290-300`
  - 실제 문구: 이 문항은 선생님이 직접 채점합니다. 답안을 자유롭게 작성해 주세요. / 답을 입력해 주세요 / 답안을 작성해 주세요
- **학습지(/g/w/[taskId]) 스터디 허브는 헤더(라벨 "학습지" + 제목 + D-day gd-block-head) / 파랑 안내 밴드(--gd-blue-soft, "선생님 안내" 접힘 토글) / 진행 히어로(단계 n/N, 숙달도 %, gd-meter) / 스테이지 리스트 / 하단 유틸 2버튼으로 구성된다.**
  - 근거: `src/app/g/w/[taskId]/hub-client.tsx:106-132, src/app/g/w/[taskId]/hub-client.tsx:135-180, src/app/g/w/[taskId]/hub-client.tsx:184-231, src/app/g/w/[taskId]/hub-client.tsx:299-319`
  - 실제 문구: 학습지 / 선생님 안내 / 진행 상황 / 3/5 단계 완료 / 숙달도 72% / 이어서 학습하기 / 학습 시작하기 / 결과 리포트 보기 / 학습 단계 / 원본 학습지 보기 / 결과 리포트 / 필수 단계를 모두 완료하면 과제가 자동으로 완료됩니다 / 다 확인했습니다 / 확인 완료
- **스테이지 행은 gd-card px-4 py-3.5, 좌측 1.75rem 원형 번호(완료면 --gd-good-soft/--gd-good, 아니면 --gd-blue-soft/--gd-blue), 우측은 완료 시 점수 pill 또는 CheckCircle2, 진행 중이면 "진행 중" 칩. 메타 줄은 "N문항 · N분".**
  - 근거: `src/app/g/w/[taskId]/hub-client.tsx:239-292`
  - 실제 문구: 8문항 · 12분 / 진행 중
- **원본 학습지 뷰어는 디렉터와 동일한 A4 고정폭(210mm@96dpi = 793.7px) 렌더러를 읽기 전용 재사용하며, 리플로우 없이 CSS zoom 변수 --gw-zoom 하나로만 축소/확대한다. 핀치줌·더블탭 1x~3x(step 0.25), 팬은 스크롤 컨테이너 처리.**
  - 근거: `src/app/g/w/[taskId]/w-viewer-client.tsx:4-17, src/app/g/w/[taskId]/w-viewer-client.tsx:51-57, src/app/g/w/[taskId]/w-viewer-client.tsx:59-81`
- **어법 드릴 플레이어(/g/drill)는 h-dvh 3단(헤더+gd-meter / gd-scroll 본문 / 액션바)이며, 본문 상단에 유닛 칩(--gd-blue-soft)·개념 칩(--gd-paper+테두리)·난이도 라벨이 한 줄로 붙는다. 액션바에는 힌트·개념·질문 툴버튼(칩 시각 h-9, 실제 터치 min-h-11)과 제출/다음 버튼이 있다.**
  - 근거: `src/components/grammar-drill/drill-player.tsx:236-290, src/components/grammar-drill/drill-player.tsx:319-359, src/components/grammar-drill/drill-player.tsx:419-436`
  - 실제 문구: 힌트 / 힌트 2 / 힌트 끝 / 개념 / 질문 / 정답 7/9 / 제출하기 / 채점 중… / 다음 문항 / 결과 보기
- **밑줄 택일 문항(MULTI_UNDERLINE/PASSAGE)은 지시문 → gd-card 안 세리프 지문(밑줄 자체가 탭 가능) → 하단 중앙 정렬 원형숫자 정사각 버튼 5개(①~⑤, 2.75rem) 구조다. 밑줄 상태색은 selected/correct/wrong이 각각 blue/good/bad soft 배경 + 동일색 underline-decoration.**
  - 근거: `src/components/grammar-drill/item-views.tsx:144-205, src/app/g/gd.css:157-190`
  - 실제 문구: 밑줄 친 부분 중, 어법상 틀린 것을 고르십시오.
- **OX 문항은 2열 그리드(gap 2.5)에 O/X 버튼을 놓고 각각 하단에 "옳다"/"틀리다" 보조 라벨을 단다.**
  - 근거: `src/components/grammar-drill/item-views.tsx:110-139`
  - 실제 문구: 밑줄 친 부분이 어법상 옳으면 O, 틀리면 X를 고르십시오. / 옳다 / 틀리다
- **드릴 채점 판정 패널(.gd-verdict)은 gd-pop 200ms로 등장하며, good 톤은 테두리 #a7f3d0+배경 --gd-good-soft, bad 톤은 테두리 #fecdd3+배경 --gd-bad-soft. 상단에 h-6 w-6 원형 체크/엑스 아이콘, 그 옆 "정답입니다"/"오답입니다", 우측에 "바른 형태 {교정형}". 이어서 해설 → 밑줄별 판단 근거 → 해석/지문 요지 → 개념 숙달도 미터(w-24)가 이어진다.**
  - 근거: `src/components/grammar-drill/verdict-panel.tsx:12-104, src/app/g/gd.css:271-284`
  - 실제 문구: 정답입니다 / 오답입니다 / 바른 형태 / 밑줄별 판단 근거 / 지문 요지 / 해석 / 개념 숙달도 / 3연속 / 단계가 열렸습니다 — 드릴
- **드릴 세트 종료 요약은 gd-card 안 gd-mono text-5xl 점수 + 3열 통계(정답률/평균 풀이/문항). 유닛 테스트는 70점 컷 합불 문구가 붙는다.**
  - 근거: `src/components/grammar-drill/drill-player.tsx:486-548`
  - 실제 문구: 합격 — 유닛 마스터를 달성했습니다 / 70점 미만 — 취약 개념을 복습한 뒤 재응시해 주십시오 / 정답률 / 평균 풀이 / 문항 / 한 세트 더 / 재응시
- **홈(/g/home)의 최상단은 "오늘의 한 수" 단 하나의 CTA다. gd-block data-tone="accent"(--gd-blue-soft 배경 + --gd-blue-line 테두리) 안에 라벨/한 줄 지시/대상/근거/전폭 primary 버튼이 들어간다. 그 아래 3칸 계기판, 주간 7도트 리듬, 오늘 할 일, 학습 트랙 4장, 빠른 훈련 3버튼, 취약 개념 순.**
  - 근거: `src/app/g/home/home-client.tsx:128-163, src/app/g/home/home-client.tsx:176-239, src/app/g/home/home-client.tsx:328-354`
  - 실제 문구: {학생이름}님, 반갑습니다 / 오늘 할 일과 훈련을 여기에서 시작합니다 / 오늘의 한 수 / 오늘 푼 문항 / 오늘 정답률 / 연속 학습 / 주간 학습 리듬 / 이번 주 4일 학습 / 오늘 할 일 / 전체 보기 → / 학습 트랙 / 빠른 훈련 / 오늘의 드릴 / 오답 복습 / 내 기록 / 지금 가장 약한 개념 / 집중 드릴
- **주간 리듬 도트는 2.5×2.5(h-2.5 w-2.5) 원형이며 활성은 --gd-blue, 비활성은 --gd-line. 오늘 도트에만 box-shadow 링 `0 0 0 2px var(--gd-card), 0 0 0 3.5px var(--gd-blue-line)`이 붙고 요일 글자가 --gd-blue/700이 된다.**
  - 근거: `src/app/g/home/home-client.tsx:212-237`
- **연속 학습 넛지와 새 결과 발견성 행의 카피가 확정돼 있다. 새 결과 행에는 h-2 w-2 --gd-blue animate-pulse 도트가 붙는다.**
  - 근거: `src/app/g/home/home-client.tsx:242-251, src/app/g/home/home-client.tsx:299-324, src/app/g/home/home-client.tsx:393-396`
  - 실제 문구: 오늘 1문항만 풀어도 연속 5일이 이어집니다 / 시험 결과가 공개되었습니다 — {제목} / {학원명} · 총 1,240문항 풀이 · 오늘 질문 3회 남았습니다
- **학습 트랙 4종 이름/태그라인: 어법(LIVE) "문장을 판별하는 눈 — 기초 골격부터 수능 판별까지", 듣기(준비 중) "들리는 대로가 아니라 구조로 듣습니다", 어휘(준비 중) "외운 단어가 문장 속에서 살아나게", 내신(준비 중) "내 학교, 내 시험 범위에 맞춘 대비". 트랙 카드는 min-height 8.5rem, 우상단에 "학습 중"/"준비 중" 칩.**
  - 근거: `src/lib/study-os/tracks.ts:31-73, src/app/g/home/home-cards.tsx:55-128`
  - 실제 문구: 어법 / 듣기 / 어휘 / 내신 / 학습 중 / 준비 중 / 준비 중인 내용 보기
- **로그인(/g)은 학원코드 4자 + 학생코드 6자 원스크린이다. 로고 14×14 rounded-2xl, gd-card p-5 폼, 입력은 gd-mono gd-t-lg h-12 tracking-[0.2em] 대문자 강제, 제출 버튼은 gd-btn-primary 전폭.**
  - 근거: `src/app/g/login-client.tsx:76-141`
  - 실제 문구: SMOAT 학습 / 스모트 모바일 학습 — 과제 · 시험 · 어법 훈련 / 학원코드 / 예: A1B2 / 학생코드 / 예: X7K2M9 / 학습 시작 / 확인 중… / 코드는 담당 선생님께 받을 수 있습니다. / 학원코드 또는 학생코드가 올바르지 않습니다.
- **/g 레이아웃 viewport는 확대를 막지 않는다(maximumScale 5, userScalable true, viewportFit cover, themeColor #f6f5f1). 저시력 접근성 때문에 의도적으로 userScalable:false를 쓰지 않는다고 주석에 명시돼 있다.**
  - 근거: `src/app/g/layout.tsx:15-24, src/app/g/layout.tsx:9-13`
  - 실제 문구: SMOAT 학습 | 스모트 모바일 학습
- **오프라인 폴백 화면(mobile/www/offline.html)은 gd 팔레트(#f6f5f1, #16202e, #1d4ed8, #5a6372, #98a0ad, #e5e3db)로만 그려져 있고 자동 재시도 안내가 있다.**
  - 근거: `mobile/www/offline.html`
  - 실제 문구: 연결이 필요합니다 / 스모트 학습은 인터넷에 연결된 상태에서 이용할 수 있습니다. 네트워크를 확인한 뒤 다시 시도해 주십시오. / 다시 시도 / 연결되면 자동으로 다시 시도합니다.
- **별개 표면인 (student-app)은 하단 3탭 구조다. 라벨 자구는 "학습 / 홈 / 마이"이며 각각 /student/learn, /student, /student/mypage. 활성 탭은 pill(배경 color-mix(in srgb, keyColor 12%, white) + 글씨 keyColor), 아이콘 strokeWidth 활성 2.5 / 비활성 1.8, 탭바 높이 h-16.**
  - 근거: `src/app/(student-app)/layout.tsx:38-42, src/app/(student-app)/layout.tsx:188-201, src/app/(student-app)/layout.tsx:212-240`
  - 실제 문구: 학습 / 홈 / 마이
- **(student-app)은 좌우 스와이프로 탭 전환한다(가로 이동 60px 초과 && |dx|>|dy|). 가로 스크롤 요소(.overflow-x-auto 등) 안에서 시작한 터치는 스와이프가 차단된다.**
  - 근거: `src/app/(student-app)/layout.tsx:93-115`
- **(student-app) 메인 3탭 상단에는 학생 이름(text-3xl bold) + 학교·학년 줄과 30초 무한 루프 마퀴가 흐른다. 마퀴 문구는 ' ✦ '로 이어 붙은 6~8개 카피다.**
  - 근거: `src/app/(student-app)/layout.tsx:18-33, src/app/(student-app)/layout.tsx:160-177`
  - 실제 문구: 오늘도 한 걸음 더! 꾸준함이 실력이 됩니다 💪 ✦ 🔥 30일 연속 학습 달성하면 문화상품권 1만원! ✦ 상위 1%는 매일 학습합니다. 오늘도 시작해볼까요? ✦ 미션 달성하면 XP 배율 보너스! ✨ ✦ 어제보다 1문제 더! 작은 차이가 큰 변화를 만듭니다 ✦ 매일 3분 투자로 영어 실력이 달라집니다
- **(student-app) 학습 세션 화면의 피드백 바 색은 리터럴 hex다: 정답 배경 #D7FFB8 + 아이콘 #58CC02, 오답 배경 #FFDFE0 + 아이콘 #FF4B4B. 계속 버튼 배경도 각각 #58CC02 / #FF4B4B. 문구는 "정답!" / "오답" / "계속" / "제출 중...".**
  - 근거: `src/app/(student-app)/student/learn/[passageId]/session/page.tsx:417-435, src/app/(student-app)/student/learn/[passageId]/session/page.tsx:462-472`
  - 실제 문구: 정답! / 오답 / 정답: ③. {선지텍스트} / 계속 / 제출 중...
- **(student-app) 세션 선지 버튼은 상태별 tailwind 클래스가 확정돼 있다: 정답 !border-emerald-400/!border-b-emerald-500/bg-emerald-50, 선택한 오답 !border-rose-400/!border-b-rose-500/bg-rose-50, 나머지 !border-gray-100/bg-gray-50/opacity-50, 피드백 전 선택은 !border-orange-400/!border-b-orange-500/bg-orange-50. 좌측 라벨 배지는 w-8 h-8 원형.**
  - 근거: `src/app/(student-app)/student/learn/[passageId]/session/page.tsx:349-378`
- **(student-app) 세션은 문항 전환에 framer-motion x축 슬라이드(initial x:30 → animate x:0 → exit x:-30, 0.2s)를, 진행바에 width 애니메이션(0.6s easeOut)을 쓴다. 상단바는 X 닫기 + h-3 진행바 + "n/N" 구조.**
  - 근거: `src/app/(student-app)/student/learn/[passageId]/session/page.tsx:240-268`
- **(student-app) 세션 이탈 모달은 w-[280px] rounded-2xl 흰 카드, 백드롭 bg-black/40, 진입 scale 0.95→1이며 좌 회색/우 rose-500 2버튼이다.**
  - 근거: `src/app/(student-app)/student/learn/[passageId]/session/page.tsx:482-513`
  - 실제 문구: 세션을 중단할까요? / 진행 상황이 저장되지 않습니다. / 계속하기 / 나가기
- **(student-app) 세션 결과 화면은 w-24 h-24 원형(bg-orange-50) 스프링 스케일 진입 + 점수/XP 2분할 + 미션 프로그레스 + 오답 유형 칩으로 구성된다. 점수 구간별 헤드라인이 다르며, 결과 비공개 플래그일 때 대체 문구가 나온다.**
  - 근거: `src/app/(student-app)/student/learn/[passageId]/session/_components/result-screen.tsx:25-91, src/app/(student-app)/student/learn/[passageId]/session/_components/result-screen.tsx:184-196`
  - 실제 문구: 훌륭해요! / 잘했어요! / 괜찮아요! / 학습이 저장됐어요 / 정답률 / XP / 8/10 문제 정답 / 풀이 기록은 정상 저장되었습니다. 결과 확인 기능이 다시 열리면 누적 기록도 함께 확인할 수 있습니다. / 오늘의 미션 / 미션 달성! / 오답 유형 (3개) / 레슨으로 돌아가기 / 학습 홈
- **(student-app) 학습 탭은 "내신집중 / 수능링고" pill 토글(bg-gray-100 rounded-2xl p-1, 활성 bg-white)이며 수능링고는 준비 중 화면이다. 시즌 카드는 rounded-3xl 흰 카드 + D-N pill + h-2 진행바(0.8s easeOut).**
  - 근거: `src/app/(student-app)/student/learn/page.tsx:85-112, src/app/(student-app)/student/learn/page.tsx:133-144, src/app/(student-app)/student/learn/page.tsx:186-232`
  - 실제 문구: 내신집중 / 수능링고 / 수능링고 준비 중 / 수능/모의고사 기출 지문으로 학습하는 기능이 곧 추가됩니다 / 진행 중인 학습이 없어요 / 선생님이 시즌을 설정하면 여기에 학습 레슨이 나타나요 / 12/30 레슨 완료 / 7일 연속
- **(student-app) 레슨 카드는 4카테고리 프로그레스를 grid-cols-4로 보여준다. 어휘=emerald(bg-emerald-500/100, text-emerald-600), 해석=blue, 문법=purple, 이해=amber. 총 진행은 "n/21"로 표기하며 마스터리 통과 시 Crown 아이콘이 붙는다.**
  - 근거: `src/app/(student-app)/student/learn/_components/lesson-node.tsx:13-25, src/app/(student-app)/student/learn/_components/lesson-node.tsx:57-92`
  - 실제 문구: 어휘 / 해석 / 문법 / 이해 / 12/21 / 마스터리 도전 가능
- **(student-app) 레슨 상세는 카테고리 트랙 4행 + 마스터리 챌린지 행이며, 각 행은 rounded-3xl 카드 + w-10 h-10 아이콘 박스 + h-1.5 진행바 + 우측 재생 원형 버튼(color-mix keyColor 10%) 구조다.**
  - 근거: `src/app/(student-app)/student/learn/[passageId]/page.tsx:210-256, src/app/(student-app)/student/learn/[passageId]/page.tsx:283-339`
  - 실제 문구: 진행률 8/21 / 마스터리 달성 / 마스터리 챌린지 / 각 카테고리 1세션 이상 완료 필요 / 힌트 없음 · 5개 이상 틀리면 실패 / 달성! (92점, 2회 시도)
- **(student-app) Stories(통독) 화면은 탭할 때마다 문장이 한 줄씩 나타나는(opacity 0→1, y 15→0, 0.3s) 리딩 UI다. 문장 탭 시 해석이 orange-50 배경 pill로 펼쳐지고, 중간에 이해도 체크 문제가 오버레이로 삽입된다. 진행바는 orange-400→orange-500 그라디언트.**
  - 근거: `src/app/(student-app)/student/learn/[passageId]/stories/page.tsx:216-274, src/app/(student-app)/student/learn/[passageId]/stories/page.tsx:277-331, src/app/(student-app)/student/learn/[passageId]/stories/page.tsx:333-356`
  - 실제 문구: Stories / 탭하여 계속 / 이해도 체크 / 계속 읽기 / 통독 완료! / 레슨으로 돌아가기 / 해석 데이터가 없습니다
- **(student-app) 홈은 퀵메뉴 가로 스크롤(w-12 h-12 rounded-2xl 흰 타일 7개) + XP 카드(rounded-3xl, text-5xl font-black) + 15일 수업 일정 스트립(min-w-[80px] 카드, 오늘은 border-2 keyColor, 마운트 시 오늘을 중앙으로 스크롤) + 공지/숙제 카드 구조다.**
  - 근거: `src/app/(student-app)/student/page.tsx:31-39, src/app/(student-app)/student/page.tsx:85-141, src/app/(student-app)/student/page.tsx:299-345`
  - 실제 문구: 출석 / 오답복습 / 숙제 / 자료실 / 성적 / 랭킹 / 학습분석 / 이번 주 XP / 누적 12,400 XP / 연속 7일째 학습 중 / 오늘 학습 완료 / 오늘 미학습 / 수업 일정 / 공지사항 / 전체보기 / 시험 / 마감 / 없음
- **(student-app) 숙제 D-day 배지는 daysLeft ≤1이면 bg-gray-900/text-white, ≤3이면 bg-gray-200, 그 외 bg-gray-100이며 텍스트는 "오늘" 또는 "D-N"이다.**
  - 근거: `src/app/(student-app)/student/page.tsx:231-242`
  - 실제 문구: 오늘 / D-3
- **(student-app) 자료실 숙제 탭은 필터 칩(활성 bg-black/text-white) + 상태 아이콘·라벨(기한초과 red-500 / D-N amber-500 / 제출완료 blue-500 / 채점완료 emerald-500)로 구성된다.**
  - 근거: `src/app/(student-app)/student/resources/_components/assignments-tab.tsx:14-19, src/app/(student-app)/student/resources/_components/assignments-tab.tsx:102-129`
  - 실제 문구: 전체 / 미제출 / 제출완료 / 채점완료 / 기한초과 / 오늘 마감 / 미제출 숙제가 없습니다 / 숙제가 없습니다 / 강사 피드백:
- **(student-app) 전역 반응형 토큰은 vw/svh 비례 clamp다. 예: --fs-base clamp(0.8125rem, 3.85vw, 1.0625rem)=15px@390, --touch-min clamp(2.25rem, 11.3vw, 3.125rem)=44px@390, --radius-lg 1rem, --radius-xl 1.25rem. 가로모드에서는 별도 축소 스케일이 적용된다.**
  - 근거: `src/app/globals.css:104-131, src/app/globals.css:2093-2111`
- **학습(게이미피케이션) 팔레트 legacy 토큰: --learn-primary #3B82F6, --learn-accent #F59E0B, --learn-streak #EF6C00, --learn-xp #7C3AED, --learn-success #10B981, --learn-wrong #EF4444, --learn-locked #CBD5E1, --learn-gold #FBBF24. ERP 표면색은 --erp-bg #F8FAFC, --erp-surface #FFFFFF, --erp-border #E2E8F0, --erp-text #0F172A.**
  - 근거: `src/app/globals.css:164-175, src/app/globals.css:154-162`
- **기존 시험 응시 화면(ExamTakingClient)은 토스식 파랑 팔레트(#3182F6 액션, #191F28 본문, #8B95A1 보조, #E5E8EB 라인, #F7F8FA 표면)를 쓰며 max-w-[480px] 모바일 폭, 상단 타이머(5분 미만 시 bg-red-50/text-red-600), size-9 원형 문제 네비게이터, 하단 이전/다음 바 구조다.**
  - 근거: `src/components/exams/exam-taking-client.tsx:299-362, src/components/exams/exam-taking-client.tsx:576-603`
  - 실제 문구: 제출 / 표시 / 표시됨 / 이전 / 다음 / 시험을 준비하고 있습니다... / 시험을 제출하시겠습니까? / 아직 답하지 않은 문제가 3개 있습니다. / 제출 후에는 수정할 수 없습니다.
- **[추론] gd 시스템은 태블릿 768px+에서 명시적으로 확장된다: .gd-page max-width 28rem→44rem, .gd-page-wide 42rem→60rem, 본문 gd-prose 15px→17px, 레슨은 2컬럼 그리드(minmax(0,1fr) + 15rem 사이드레일, gap 1.5rem)로 전환된다. 즉 태블릿 목업은 좌 본문 / 우 사이드레일 2컬럼이 정확한 재현이다.**
  - 근거: `src/app/g/gd.css:636-666`

### 덱 재현 대상 (visualSpec)

#### /g 문항 플레이어 (과제 풀이 화면) — 최우선 재현 자산

- 왜: 학생이 과제를 받아 실제로 푸는 정본 화면. 문항 표시·선지 선택·진행률·번호 점프·제출까지 한 화면에 다 있어 '학습 경험' 슬라이드의 주인공이 된다.
- 소스: `src/app/g/q/[taskId]/q-player-client.tsx`
- 시각 스펙:

```
[셸] 루트: display:flex; flex-direction:column; height:100dvh; width:100%; max-width:42rem; margin:0 auto; background:#f6f5f1; color:#16202e; font-size:0.875rem; line-height:1.5; word-break:keep-all.

[헤더 shrink-0, padding:0.75rem 1rem 0]
- 1행 height:2.5rem, flex, gap 0.5rem, align-center.
- 좌: 뒤로 버튼 40×40 원형, lucide ChevronLeft 20px strokeWidth 2, color #5a6372, margin-left:-0.5rem.
- 중: 과제 제목, font-size 0.8125rem, font-weight 600, flex:1, truncate.
- 우: "응답" 라벨(0.625rem, weight 500, color #98a0ad) + mono 숫자 "7"(0.75rem, weight 600, color #5a6372) + "/12"(color #98a0ad). 숫자는 font-variant-numeric:tabular-nums.
- 2행 진행바(margin-top 0.25rem): height 0.25rem; border-radius 9999px; background #e5e3db; 내부 span은 height 100%; border-radius 9999px; background #1d4ed8; width:{answered/total*100}%; transition: width 400ms cubic-bezier(0.22,1,0.36,1).

[본문 flex:1, min-height:0, position:relative, overflow-y:auto, padding:0.75rem 1rem 1.5rem]
- 안내문 블록(1번 문항만 전체): margin-bottom 0.75rem; border-radius 0.75rem; border 1px solid #c7d4f8; background #eef2fe; padding 0.625rem 0.875rem. 2번 문항부터는 12자 칩으로 축약 + 탭 시 하단 시트.
- 문항 카드 .gd-card: background #ffffff; border 1px solid #e5e3db; border-radius 0.875rem; padding 1rem(sm:1.25rem).
  · 카드 1행 flex gap 0.5rem align-center:
    (a) 문항번호 배지 — height 2rem; min-width 2rem; border-radius 9999px; padding 0 0.5rem; background #1d4ed8; color #fff; font-weight 700; font-size 0.875rem; mono.
    (b) 배점 — "3점", mono, 0.6875rem, weight 600, color #98a0ad.
    (c) margin-left:auto 로 "다시 보기" 버튼 — height 2rem; border-radius 9999px; border 1px; padding 0 0.625rem; gap 0.25rem; lucide Flag 14px. 기본: border #e5e3db, color #98a0ad, fill none. 활성: border #c4b5fd, background #f5f3ff, color #7c3aed, Flag fill #7c3aed. 라벨 "다시 보기" 0.625rem weight 600.
    (d) 우측 끝 mono "3 / 12" 0.6875rem color #98a0ad.
  · margin-top 1rem: 문제 본문. 영어 지문은 세리프(Georgia,"Times New Roman","Noto Serif",serif), font-size 0.9375rem, line-height 1.72.
  · margin-top 1.25rem: 응답 영역 — 상단에 border-top 1px solid #E5E8EB + padding-top 1rem, 그 위에 "답안 입력" 라벨(0.75rem, weight 600, color #8B95A1, margin-bottom 0.75rem).
    선지 행(ul, gap 0.5rem): 각 li의 button은 display:flex; align-items:flex-start; gap 0.625rem; width 100%; border 1px; border-radius 0.75rem; padding 0.75rem 1rem; min-height 2.75rem; text-align left.
      미선택 = border #E5E8EB; background #fff; color #191F28.
      선택 = border #3182F6; background #3182F6; color #ffffff (라벨 원형숫자도 흰색).
      좌측 원형숫자 라벨 ①②③④⑤ — font-size 0.9375rem, weight 600, 미선택 시 color #4E5968.
      선지 텍스트 0.9375rem, line-height relaxed.
- 본문 하단 페이드: position absolute; inset-x 0; bottom 0; height 2.5rem; background linear-gradient(to top, #f6f5f1, rgba(246,245,241,0)); pointer-events none.
- (선택) 폴드 힌트 pill: bottom 0.75rem 중앙, background rgba(22,32,46,0.88), color #fff, border-radius 9999px, padding 0.375rem 0.875rem, font-size 0.6875rem weight 600, 진입 애니 gd-pop 180ms(scale .94→1). 문구는 정확히 "아래에서 답을 선택합니다".

[하단바 shrink-0, border-top 1px solid #e5e3db, background #fff, padding:0.625rem 1rem max(0.75rem, env(safe-area-inset-bottom))]
- 번호 점프 스트립(margin-bottom 0.5rem, flex gap 0.375rem, overflow-x auto): 각 버튼 height 2.5rem; width 2.25rem; border-radius 0.5rem; border 1px; flex-column; justify-center; gap 0.125rem.
  현재 = border #1d4ed8, background #eef2fe, 숫자 color #1d4ed8.
  응답 완료(비현재) = border #e5e3db, background #fff, 숫자 color #16202e, 하단에 0.25rem 원형 도트 background #1d4ed8.
  미응답 = 숫자 color #98a0ad, 도트 transparent.
  플래그 = 우상단 absolute 0.25rem 원형 도트 색 #8b5cf6(violet-500).
- 버튼 2개 flex gap 0.5rem: 좌 "이전"(.gd-btn.gd-btn-ghost: min-height 2.75rem, border-radius 0.75rem, border 1px solid #d4d1c6, color #5a6372, background transparent, flex 1, disabled opacity .4), 우 "다음" 또는 "제출하기"(.gd-btn.gd-btn-primary: background #1d4ed8, color #fff, flex 1.4, disabled background #c3c9d6). 버튼 폰트 0.8125rem weight 600, :active transform scale(0.98) 80ms.

[정확한 문구 전량]
"응답", "7/12", "다시 보기", "3점", "답안 입력", "아래에서 답을 선택합니다", "이전", "다음", "제출하기", "제출 중…", "표시한 문항 3개가 있습니다. 제출 전에 다시 확인해 보세요."(color #7c3aed, 0.6875rem, 중앙정렬), "모든 문항에 답하면 제출할 수 있습니다. (남은 문항 2개)"(color #98a0ad).
```

#### /g 채점 결과 화면 (점수 카드 + 문항별 판정 그리드 + 오답 리뷰)

- 왜: '맞음/틀림 표시 방식'과 '해설 노출 방식'을 한 화면에 담은 정본. 특히 정답 텍스트·해설을 의도적으로 노출하지 않는 설계 원칙까지 시각적으로 드러나 서비스 철학 슬라이드로도 쓸 수 있다.
- 소스: `src/app/g/q/[taskId]/q-result-screen.tsx`
- 시각 스펙:

```
[루트] display:flex; flex-direction:column; gap 1rem; width 100%; max-width 28rem; margin 0 auto; padding: 2rem 1.25rem max(2rem, env(safe-area-inset-bottom)); background #f6f5f1.

[점수 카드] .gd-card(background #fff; border 1px solid #e5e3db; border-radius 0.875rem) + padding 1.5rem + text-align center. 진입 애니 gd-pop 180ms cubic-bezier(0.22,1,0.36,1): scale .94→1, opacity 0→1.
- 라벨 "문제 세트 결과": font-size 0.6875rem; weight 600; letter-spacing 0.08em; color #98a0ad.
- 과제 제목: margin-top 0.25rem; 0.9375rem; weight 600; color #16202e.
- 점수: margin-top 1rem; font-family mono; font-size 3rem(text-5xl); font-weight 700. 만점이면 color #047857, 아니면 #16202e. 뒤에 "/100점"을 1.0625rem weight 600 color #98a0ad로 붙임. 숫자는 rAF 카운트업 400ms easeOutCubic(1-(1-t)^3)로 0→목표값 상승. prefers-reduced-motion이면 즉시 확정.
- 만점 시 추가 줄: "만점입니다" 0.75rem weight 600 color #047857.
- 정답률 미터: margin 0.75rem auto 0; width 11rem. .gd-meter height 0.25rem, background #e5e3db, 채움 #1d4ed8(만점이면 #047857), width transition 400ms cubic-bezier(0.22,1,0.36,1). 아래 mono 0.625rem color #98a0ad로 "정답률 85%".
- 통계 그리드: margin-top 1.25rem; border-top 1px solid #e5e3db; padding-top 1rem; grid-template-columns: repeat(N, minmax(0,1fr)); gap 0.5rem. 각 칸은 mono 1.0625rem weight 700 값 + 0.625rem color #98a0ad 라벨. 라벨 순서: "정답"(값 "9/12"), "오답"("3"), 조건부 "부분 정답", 조건부 "확인 중".
- 서술형 있으면: margin-top 1rem; border-radius 0.5rem; padding 0.5rem 0.75rem; background #eef2fe; color #1d4ed8; 0.75rem. 문구 "서술형 답안 2문항은 선생님이 확인한 뒤 점수에 반영합니다."

[문항별 판정 카드] .gd-card padding 1rem.
- 라벨 "문항별 결과"(gd-label 스펙 동일) + 보조 "번호를 누르면 문항과 제출한 답을 확인할 수 있습니다."(0.625rem, color #98a0ad).
- 필터 칩 행(margin-bottom 0.625rem, flex gap 0.375rem): 칩은 border-radius 9999px; border 1px; padding 0.25rem 0.625rem; font-size 0.6875rem; weight 600. 활성 = border #1d4ed8 / background #eef2fe / color #1d4ed8. 비활성 = border #e5e3db / color #98a0ad. 라벨 "전체 12", "오답 3", "확인 중 2". 우측 끝 margin-left:auto 로 "오답 차례로 보기"(border #c7d4f8 / background #eef2fe / color #1d4ed8).
- 판정 타일 그리드: display grid; grid-template-columns repeat(5, 1fr); gap 0.375rem. 각 타일 height 2.25rem; border-radius 0.5rem; border 1px; display flex center; mono 0.75rem weight 700.
  CORRECT(정답): color #047857 / background #ecfdf5 / border #a7f3d0.
  WRONG(오답): color #be123c / background #fff1f2 / border #fecdd3.
  PARTIAL(부분 정답): color #1d4ed8 / background #eef2fe / border #c7d4f8.
  NEEDS_REVIEW(확인 중): color #5a6372 / background #f6f5f1 / border #d4d1c6.
  펼쳐진 타일에는 box-shadow: inset 0 0 0 1.5px {해당 fg} 추가.
- 아코디언(타일 탭 시): border-top 1px solid #e5e3db; margin-top 0.75rem; padding-top 0.75rem. 상단 행에 h-7 원형 #1d4ed8 배지(문항번호, 흰 글씨 13px) + 판정 칩(해당 bg/border/fg, border-radius 9999px, padding 0.125rem 0.5rem, 0.6875rem weight 600) + 우측 "3점". 그 아래 문항 본문 + 내 답 에코(선지 위젯 disabled 상태). 정답·해설은 표시하지 않음.
- 오답 차례 내비: border-top 1px, flex justify-between, 좌 "이전 오답"·우 "다음 오답"(border-radius 9999px, border 1px solid #d4d1c6, color #5a6372, 0.6875rem, disabled opacity .4), 가운데 mono "2 / 3".
- 범례: margin-top 0.75rem, flex gap-x 0.75rem. 각 항목 = 0.5rem 원형(background 해당 bg, border 1px 해당 fg) + 라벨 텍스트(0.6875rem, color #5a6372).

[하단] 전폭 .gd-btn.gd-btn-primary — background #1d4ed8, color #fff, min-height 2.75rem, border-radius 0.75rem, 문구 "과제 목록으로".
```

#### /g 하단 4탭 셸 (헤더 + 탭바 + 햄버거 사이드시트)

- 왜: '하단 네비게이션/탭 구조와 라벨 자구' 요구의 직접 답. 앱 전체를 감싸는 프레임이라 태블릿 목업 안에 항상 깔려야 한다.
- 소스: `src/components/grammar-drill/g-shell.tsx`
- 시각 스펙:

```
[루트] display:flex; flex-direction:column; min-height:100dvh; background #f6f5f1.

[상단 헤더] position sticky; top 0; z-index 30; background rgba(246,245,241,0.92); backdrop-filter blur(8px); border-bottom 1px solid #e5e3db; padding-top env(safe-area-inset-top).
- 내부: margin 0 auto; max-width 28rem; display flex; justify-content space-between; align-items center; padding 0.625rem 1.25rem; min-height 3.8125rem(61px 고정 — 탭 전환 시 높이 점프 방지).
- 좌측 2행: 1행 gd-label "SMOAT · {학원명}"(0.6875rem, weight 600, letter-spacing 0.08em, color #98a0ad, truncate). 2행 "{학생이름}님"(0.9375rem, weight 700, letter-spacing tight). 단, /g/home에서는 2행 생략(홈 히어로에 이름이 이미 크게 있음).
- 우측: 40×40 원형 버튼 2개, color #5a6372 — lucide Shield 20px(상태창), lucide Menu 20px(햄버거). strokeWidth 1.75.

[하단 탭바] position fixed; left/right 0; bottom 0; z-index 35; background rgba(255,255,255,0.96); backdrop-filter blur(8px); border-top 1px solid #e5e3db; padding-bottom max(0.75rem, env(safe-area-inset-bottom)).
- 내부: margin 0 auto; max-width 28rem; display grid; grid-template-columns repeat(4, 1fr).
- 각 탭: display flex; flex-direction column; align-items center; justify-content center; gap 0.1875rem; padding-top 0.5rem; font-size 0.625rem(10px); font-weight 600; letter-spacing 0.02em; color #98a0ad. 활성 탭 color #1d4ed8.
- 아이콘 22px(h-5.5). 활성 strokeWidth 2, 비활성 1.75.
- 탭 순서/라벨/아이콘: [1] "홈" lucide House → /g/home · [2] "학습" lucide BookOpen → /g/track/grammar · [3] "과제" lucide ClipboardList → /g/tasks · [4] "내 기록" lucide BarChart3 → /g/me.
- 과제 탭 배지: position absolute; top 0.125rem; left calc(50% + 0.4375rem); min-width 1rem; height 1rem; padding 0 0.25rem; border-radius 9999px; background #be123c; color #fff; font-size 0.625rem; font-weight 700; line-height 1. 값이 9 초과면 "9+".
- 포커스 링(키보드): outline 2px solid #1d4ed8; outline-offset 2px.

[본문 여백] main에 padding-bottom: calc(4.5rem + env(safe-area-inset-bottom)) — 탭바 아래 깔림 방지.

[햄버거 사이드시트] 백드롭: position fixed; inset 0; z-index 40; background rgba(22,32,46,0.42); 진입 fade-in 160ms.
시트: position fixed; top/right/bottom 0; z-index 41; width min(19rem, 84vw); background #fff; border-left 1px solid #e5e3db; box-shadow -12px 0 40px rgba(22,32,46,0.16); 진입 애니 translateX(2rem)→0 + opacity .4→1, 220ms cubic-bezier(0.22,1,0.36,1).
- 헤더 영역: "{학생이름}님"(0.9375rem weight 700) + "{학원명}"(0.6875rem color #98a0ad), 우측 32×32 X 버튼. border-bottom 1px solid #e5e3db.
- 질문 잔여 행: lucide MessageCircleQuestion 16px color #1d4ed8 + "오늘 질문 3회 남았습니다"(0.75rem, color #5a6372, 숫자만 mono bold color #16202e).
- 메뉴 항목 .gd-menu-item: display flex; align-items center; gap 0.75rem; min-height 3rem; padding 0 1.25rem; font-size 0.8125rem; font-weight 600; color #16202e. 활성 = color #1d4ed8 + background #eef2fe.
  항목: "상태창", "홈", "학습", "과제", "내 기록", "취약 단어장".
- 하단(border-top 1px): "로그아웃" — 동일 gd-menu-item 이지만 color #be123c, lucide LogOut 18px.
```

#### /g 과제 목록 화면 (필터 세그먼트 + kind 칩 + 과제 카드)

- 왜: '학생이 과제를 받는' 첫 접점. 카드 한 장에 종류/상태/D-day/마감 카운트다운/새 결과까지 정보 밀도가 높아 슬라이드 임팩트가 크다.
- 소스: `src/app/g/tasks/tasks-client.tsx`
- 시각 스펙:

```
[래퍼] margin 0 auto; max-width 28rem; padding 1.25rem 1.25rem 1.5rem; background #f6f5f1.

[헤더] h1 "과제" — font-size 1.25rem; font-weight 700; letter-spacing tight; color #16202e. 부제 0.6875rem color #98a0ad, margin-top 0.25rem: "오늘 마감 2건 · 이번 주 5건"(로딩 중엔 "선생님이 배포한 과제를 확인합니다").

[기한 배너 — sticky] position sticky; top calc(3.8125rem + env(safe-area-inset-top) + 0.5rem); z-index 25. display flex; gap 0.5rem; align-items center; border-radius 0.75rem; border 1px; padding 0.625rem 0.875rem. lucide CalendarClock 16px.
  overdue>0(rose): background #fff1f2; border #fecdd3; color #be123c; 문구 "기한이 지난 과제가 2건 있습니다".
  else(blue): background #eef2fe; border #c7d4f8; color #1d4ed8; 문구 "오늘 마감 과제가 3건 있습니다".

[필터 세그먼트] margin-top 1rem; display flex; border 1px solid #e5e3db; border-radius 0.75rem; padding 0.25rem; background #fff. 각 버튼 flex 1; border-radius 0.5rem; padding 0.5rem 0; font-size 0.75rem; font-weight 600. 활성 = background #eef2fe + color #1d4ed8. 비활성 = color #98a0ad. 라벨 "해야 할 과제" / "완료" + 우측에 mono 카운트(opacity .8).

[kind 필터 칩] margin-top 0.625rem; flex-wrap; gap 0.375rem. 각 칩 border-radius 9999px; border 1px; padding 0.25rem 0.625rem; font-size 0.6875rem; weight 600 + mono 카운트. 활성 시 background/color가 해당 kind 색으로, border transparent. 비활성은 background #fff / color #98a0ad / border #e5e3db. 라벨: "전체", "시험", "학습지", "문제 세트", "어법 훈련".

[그룹 헤더] margin-bottom 0.5rem; flex gap 0.375rem. gd-label(0.6875rem/600/letter-spacing .08em) + mono 카운트(0.625rem color #98a0ad). 순서와 자구: "기한 지남"(color #be123c) → "오늘 마감" → "이번 주" → "나중에 · 마감 없음".

[과제 카드] .gd-card(background #fff; border 1px solid #e5e3db; border-radius 0.875rem) + padding 0.875rem 1rem. 잠금 시 opacity 0.6.
- 1행: 좌측 칩 묶음(gap 0.375rem), 우측 D-day pill.
  · kind 칩 — border-radius 0.375rem; padding 0.125rem 0.375rem; font-size 0.625rem; weight 700; 아이콘 12px + 라벨. 색: 시험 bg #eef2fe/fg #1d4ed8(FileText) · 학습지 bg #f1f5f9/fg #475569(BookOpenCheck) · 문제 세트 bg #eef2ff/fg #4338ca(ListChecks) · 어법 훈련 bg #ecfdf5/fg #047857(SpellCheck).
  · 상태 칩 — 동일 규격, 라벨 "대기"(bg #f6f5f1/fg #5a6372) / "진행 중"(bg #eef2fe/fg #1d4ed8) / "완료"(bg #ecfdf5/fg #047857).
  · "새 결과" 칩 — bg #eef2fe / fg #1d4ed8, 앞에 0.375rem 원형 도트(background #1d4ed8, animate-pulse).
  · D-day pill — mono 0.6875rem weight 700; border-radius 0.375rem; padding 0.125rem 0.375rem; lucide CalendarClock 12px. D-DAY이면 bg #eef2fe/color #1d4ed8, 아니면 배경 없이 color #5a6372. 문구는 "D-DAY" / "D-3" / "D+2", 마감 없으면 "마감 없음"(0.625rem, color #98a0ad).
- 2행: 제목 0.9375rem weight 700 leading-snug + 안내문 0.75rem color #5a6372 line-clamp 2, 우측 lucide ChevronRight 16px color #98a0ad.
- 3행 메타(gap-x 0.625rem, gap-y 0.25rem, 0.6875rem): 진행 텍스트(mono, color #5a6372) / 점수(mono bold color #16202e) / 잠금(lucide Lock 12px + 문구) / "마감 7. 12.(금) 21:00"(color #98a0ad) / 카운트다운(bold, overdue면 #be123c 아니면 #1d4ed8) / "7. 9. 배포" 또는 "7. 11. 완료"(color #98a0ad).

[빈 상태] .gd-card, flex-column, align-center, gap 0.75rem, padding 2.5rem 1.25rem, 중앙정렬. 아이콘 32px(축하 변형은 lucide CircleCheck color #047857, 기본은 ClipboardCheck color #98a0ad) + 문구 0.8125rem color #5a6372.
  문구: "모든 과제를 마쳤습니다. 훌륭합니다." / "지금 해야 할 과제가 없습니다. 훈련 탭에서 자유 학습을 이어가 보세요." / "아직 완료한 과제가 없습니다."

[스켈레톤] .gd-card 4장, animate-pulse, 내부에 h-4 w-20 / h-5 w-3/4 / h-3.5 w-1/2 회색바(background #e5e3db, 3번째는 opacity .7).
```

#### /g 홈 — "오늘의 한 수" 히어로 + 3칸 계기판 + 주간 7도트

- 왜: 학습 OS의 철학(화면 전체에서 단 하나의 답)이 시각적으로 드러나는 유일한 화면. 덱의 '학생 경험' 오프닝 슬라이드로 가장 강하다.
- 소스: `src/app/g/home/home-client.tsx`
- 시각 스펙:

```
[래퍼] .gd-page: width 100%; max-width 28rem(태블릿 768px+에서 44rem); margin 0 auto; padding 1.25rem 1.25rem 1.5rem; background #f6f5f1.

[인사말] h1 "{학생이름}님, 반갑습니다" — 1.25rem / 700 / letter-spacing tight / color #16202e. 부제 "오늘 할 일과 훈련을 여기에서 시작합니다" — 0.6875rem, color #98a0ad, margin-top 0.25rem.

[오늘의 한 수 — 히어로] margin-top 1rem. .gd-block[data-tone=accent]: background #eef2fe; border 1px solid #c7d4f8; border-radius 1rem; padding 1rem(태블릿 1.25rem 1.5rem).
- 라벨 "오늘의 한 수": 0.6875rem / 600 / letter-spacing 0.08em / color #1d4ed8 / margin-bottom 0.375rem.
- 한 줄 지시(gd-prose bold): font-size 0.9375rem(태블릿 1.0625rem); line-height 1.65; font-weight 700; color #16202e. 예: "마감이 임박한 과제부터", "기한이 지난 과제부터".
- 대상(gd-prose-2): 0.875rem; line-height 1.6; color #5a6372; -webkit-line-clamp 2.
- 근거 줄: 0.75rem; color #98a0ad. 예: "시험 · D-DAY · 4시간 32분 남음"(kindLabel · dDay · 카운트다운을 " · "로 결합).
- CTA: margin-top 0.75rem; width 100%; .gd-btn.gd-btn-primary — background #1d4ed8; color #fff; min-height 2.75rem; border-radius 0.75rem; font 0.8125rem/600; gap 0.375rem; lucide ArrowRight 16px. 문구 "과제 시작".

[오늘 계기판] margin-top 0.625rem. .gd-card + display grid; grid-template-columns repeat(3,1fr); divide-x(각 칸 사이 1px solid #e5e3db); padding 0.
- 각 칸: flex-column align-center; padding 0.875rem 0. 값 = mono 1.0625rem weight 700. 라벨 = 0.625rem color #98a0ad margin-top 0.125rem.
- 칸 순서/라벨: "오늘 푼 문항"(값 "24") · "오늘 정답률"(값 "78%" 또는 "—") · "연속 학습"(값 "7일", 2일 이상이면 값 앞에 lucide Flame 14px color #1d4ed8).

[주간 학습 리듬] margin-top 0.625rem. .gd-card padding 0.75rem 0.875rem.
- 상단 행 space-between: 좌 "주간 학습 리듬"(0.6875rem/600/color #5a6372), 우 "이번 주 4일 학습"(0.6875rem/color #98a0ad, 숫자만 mono bold color #16202e).
- 도트 행 margin-top 0.625rem; flex; justify-between; padding 0 0.125rem. 각 요일 = flex-column gap 0.25rem.
  · 도트: 0.625rem × 0.625rem 원형. 학습한 날 background #1d4ed8, 아니면 #e5e3db. 오늘 도트에 box-shadow: 0 0 0 2px #ffffff, 0 0 0 3.5px #c7d4f8.
  · 요일 글자: 0.625rem. 오늘이면 color #1d4ed8 + font-weight 700, 아니면 color #98a0ad.

[연속 넛지 밴드] margin-top 0.625rem; border-radius 0.75rem; padding 0.625rem 0.875rem; background #eef2fe; 문구 0.75rem weight 500 color #1d4ed8: "오늘 1문항만 풀어도 연속 8일이 이어집니다".

[오늘 할 일 섹션] margin-top 1.5rem. 헤더 행: 좌 gd-label "오늘 할 일", 우 "전체 보기 →"(0.6875rem/600/color #1d4ed8). 카드 간격 gap 0.625rem(10px), 섹션 간격 margin-top 1.5rem(24px)이 전체 여백 리듬.
- TodoCard: .gd-card + flex align-center gap 0.75rem padding 0.875rem. 좌측 아이콘 박스 h-9 w-9 rounded-lg — overdue면 bg #fff1f2/color #be123c, GRAMMAR면 bg #ecfdf5/color #047857, 그 외 bg #eef2fe/color #1d4ed8. 중앙 제목 0.8125rem/600 truncate + 메타 0.6875rem color #98a0ad("시험 · 3/12 · 진행 중"). 우측 D-day pill + 카운트다운 + ChevronRight 16px.

[학습 트랙 4장] margin-top 1.5rem; gd-label "학습 트랙"; grid-template-columns repeat(2,1fr); gap 0.625rem. 각 카드 .gd-card padding 0.875rem; min-height 8.5rem; flex-column.
- 상단: 좌 h-9 w-9 rounded-xl 아이콘 박스(LIVE = bg #eef2fe/color #1d4ed8, PREPARING = bg #f6f5f1/color #98a0ad/border 1px #e5e3db), 우 상태 칩 0.625rem/700 "학습 중" 또는 "준비 중".
- 이름 0.875rem/700, 태그라인 0.6875rem color #98a0ad line-clamp 2.
- 하단(margin-top auto): LIVE면 .gd-meter + "12/40 개념 · 다음 관계대명사", PREPARING이면 "준비 중인 내용 보기" + ChevronRight(color #1d4ed8).
- 4장 데이터: 어법 "문장을 판별하는 눈 — 기초 골격부터 수능 판별까지"(LIVE, SpellCheck) / 듣기 "들리는 대로가 아니라 구조로 듣습니다"(준비 중, Headphones) / 어휘 "외운 단어가 문장 속에서 살아나게"(준비 중, BookA) / 내신 "내 학교, 내 시험 범위에 맞춘 대비"(준비 중, School).

[빠른 훈련] margin-top 1.5rem; gd-label "빠른 훈련"; grid repeat(3,1fr) gap 0.625rem. 각각 .gd-btn.gd-btn-ghost(border 1px solid #d4d1c6, color #5a6372, min-height 2.75rem, border-radius 0.75rem): lucide Zap "오늘의 드릴" / RotateCcw "오답 복습" / Target "내 기록".

[푸터] margin-top 2rem; 0.625rem; color #98a0ad; 중앙정렬: "{학원명} · 총 1,240문항 풀이 · 오늘 질문 3회 남았습니다".
```

#### 어법 드릴 — 밑줄 택일 문항 + 판정 패널

- 왜: SMOAT의 시그니처 학습 인터랙션(시험지 지문에 직접 밑줄을 탭). 세리프 지문 + 원형숫자 정사각 버튼 + 판정 패널까지가 '문제집을 앱으로 옮겼다'는 메시지의 시각적 증거다.
- 소스: `src/components/grammar-drill/item-views.tsx`
- 시각 스펙:

```
[문항부 — UnderlinePickView]
- 지시문: font-size 0.75rem; font-weight 500; color #5a6372. 문구 "밑줄 친 부분 중, 어법상 틀린 것을 고르십시오."(PASSAGE형은 서버 directive).
- 지문 카드: margin-top 0.75rem; .gd-card(background #fff; border 1px solid #e5e3db; border-radius 0.875rem); padding 1rem(sm 1.25rem 좌우).
  지문 텍스트: font-family Georgia,"Times New Roman","Noto Serif",serif; font-size 0.9375rem(태블릿 1.0625rem); line-height 1.72; letter-spacing 0.001em; word-break normal; color #16202e.
- 밑줄 토큰(.gd-u): text-decoration underline; text-decoration-thickness 1.5px; text-underline-offset 4px; text-decoration-color #16202e; font-weight 500; border-radius 0.25rem; padding 0.0625rem 0.125rem. 앞에 원형숫자(.gd-u-num, 세리프, font-size 0.85em).
  · selected: background #eef2fe; text-decoration-color #1d4ed8; color #1d4ed8.
  · correct: background #ecfdf5; text-decoration-color #047857; color #047857.
  · wrong: background #fff1f2; text-decoration-color #be123c; color #be123c.
- 하단 번호 버튼 행: margin-top 0.875rem; display flex; justify-content center; gap 0.5rem. 각 버튼 .gd-option.gd-option-square — width/height 2.75rem; border 1.5px solid #e5e3db; border-radius 0.75rem; background #fff; display flex center. 안에 원형숫자 ①②③④⑤(0.9375rem, weight 600).
  상태 색은 .gd-option data-state 규칙 그대로: selected(border #1d4ed8/bg #eef2fe) · correct(border #047857/bg #ecfdf5) · wrong(border #be123c/bg #fff1f2) · dim(opacity .55).

[판정 패널 — .gd-verdict] margin-top 1.25rem; padding 1rem; border-radius 0.875rem; border 1px. 진입 애니 gd-pop 200ms cubic-bezier(0.22,1,0.36,1)(scale .94→1, opacity 0→1).
  · good: border #a7f3d0; background #ecfdf5.
  · bad: border #fecdd3; background #fff1f2.
- 1행 flex gap 0.5rem: h-6 w-6 원형(background 정답 #047857 / 오답 #be123c, 안에 lucide Check 또는 X 16px strokeWidth 3, color #fff) + 문구 0.9375rem weight 700(color 동일) "정답입니다" / "오답입니다". 오답이면 우측 margin-left auto 로 "바른 형태 {교정형}"(라벨 color #5a6372, 값은 세리프 bold).
- 해설: margin-top 0.75rem; 0.8125rem; line-height relaxed; color #16202e.
- 밑줄별 근거: border-top 1px solid #e5e3db; padding-top 0.75rem. gd-label "밑줄별 판단 근거" + ul(gap 0.25rem). 각 항목 = 원형숫자(정답 번호면 color #be123c, 아니면 #98a0ad) + 근거문(0.75rem, color #5a6372).
- 해석: border-top 1px; gd-label "지문 요지" 또는 "해석" + 본문 0.75rem color #5a6372.
- 숙달도 행: border-top 1px; flex space-between. 좌 "개념 숙달도"(0.6875rem color #98a0ad), 우 = .gd-meter width 6rem(70 이상이면 채움 #047857, 아니면 #1d4ed8) + mono 숫자(0.6875rem weight 600 color #5a6372) + "3연속"(0.6875rem weight 600 color #1d4ed8).
- 단계 해금 밴드: margin-top 0.75rem; border-radius 0.5rem; padding 0.5rem 0.75rem; background #eef2fe; border 1px solid #c7d4f8; 문구 0.75rem weight 600 color #1d4ed8 "단계가 열렸습니다 — 드릴"(단계 라벨: 개념 학습/드릴/실전 독해/서술형/유닛 테스트/마스터).

[액션바] border-top 1px solid #e5e3db; background #fff; padding 0.625rem 1rem max(0.75rem, env(safe-area-inset-bottom)).
- 툴 칩 행(margin-bottom 0.5rem, gap 0.5rem): 각 칩 height 2.25rem; border-radius 0.5rem; border 1px solid #e5e3db; padding 0 0.625rem; gap 0.375rem; 0.6875rem weight 600; color #5a6372. 아이콘 16px. 라벨 "힌트"/"힌트 2"/"힌트 끝"(Lightbulb), "개념"(BookOpen), "질문"(MessageCircleQuestion). 우측 margin-left auto 에 mono "정답 7/9"(0.6875rem color #98a0ad).
- 하단 전폭 버튼: 제출 전 "제출하기"(비활성 시 background #c3c9d6), 제출 중 "채점 중…", 판정 후 "다음 문항" 또는 "결과 보기"(ArrowRight 16px).

[힌트 블록] 힌트 탭 시 문항 아래 인라인 등장: margin-top 1rem; border-radius 0.75rem; border 1px solid #c7d4f8; background #eef2fe; padding 0.875rem; gd-pop 진입. 라벨 "힌트 1 — 구조" / "힌트 2 — 판단 규칙"(0.6875rem/600/letter-spacing .08em/color #1d4ed8) + 본문 0.8125rem.
```

#### /g 학습지 스터디 허브 (학습지를 모바일에서 보는 화면)

- 왜: '학습지/문서를 모바일에서 보는 화면' 요구의 정본. A4 원본을 리플로우 없이 그대로 보여주면서 단계 학습으로 감싸는 구조가 SMOAT 고유의 해법이다.
- 소스: `src/app/g/w/[taskId]/hub-client.tsx`
- 시각 스펙:

```
[루트] flex-column; min-height 100dvh; background #f6f5f1.

[헤더] shrink-0; background #ffffff; border-bottom 1px solid #e5e3db. 내부 .gd-page(max-width 28rem, margin auto) + flex gap 0.375rem; padding 0.5rem 0.625rem; padding-top max(0.5rem, env(safe-area-inset-top)).
- 좌: 40×40 원형, lucide ArrowLeft 20px strokeWidth 1.75, color #5a6372.
- 중: gd-label "학습지"(0.6875rem/600/letter-spacing .08em/color #98a0ad) + h1 제목(0.8125rem/700, truncate).
- 우: D-day 배지 .gd-block-head — height 1.375rem; padding 0 0.5rem; border-radius 9999px; background #f6f5f1; border 1px solid #e5e3db; font-size 0.6875rem; weight 700; color #5a6372; mono. D+ 접두(기한 지남)면 background #fff, border #fecdd3, color #be123c.

[선생님 안내 밴드] background #eef2fe; border-bottom 1px solid #c7d4f8; padding 0.5rem 1rem. 텍스트 0.75rem color #5a6372, 앞에 "선생님 안내"(font-weight 600, color #1d4ed8). 40자 이상/개행 포함이면 line-clamp 1 + 우측 lucide ChevronDown 16px(펼치면 rotate 180, transition transform 160ms).

[진행 히어로] .gd-card padding 1rem.
- 완료 시 상단에 lucide CheckCircle2 18px + "확인 완료"(0.8125rem/700), color #047857.
- 본문 행 flex align-end space-between:
  좌: gd-label "진행 상황" + "3/5 단계 완료"(1.0625rem/700, 숫자만 mono).
  우: gd-label "숙달도" + mono 1.5rem/700 "72" + "%"(0.9375rem).
- .gd-meter margin-top 0.75rem(전부 완료면 data-tone=good → 채움 #047857).
- CTA 전폭 .gd-btn.gd-btn-primary margin-top 1rem: 미완료면 lucide Play 18px + "이어서 학습하기"(처음이면 "학습 시작하기"), 전부 완료면 lucide BarChart3 + "결과 리포트 보기".

[학습 단계 리스트] gd-label "학습 단계" + flex-column gap 0.5rem.
- 각 행 .gd-card + flex align-center gap 0.75rem; padding 0.875rem 1rem.
  · 좌측 번호 원형 1.75rem × 1.75rem, font 0.75rem/700. 완료 = bg #ecfdf5/color #047857, 그 외 = bg #eef2fe/color #1d4ed8.
  · 중앙: 제목 0.9375rem/700 leading-snug → 부제 0.75rem color #5a6372 → 메타 mono 0.6875rem color #98a0ad "8문항 · 12분".
  · 우측: 완료+채점 = 점수 pill(bg #ecfdf5/color #047857, border-radius 0.375rem, padding 0.25rem 0.5rem, mono 0.75rem/700, "18점"). 완료+무채점 = lucide CheckCircle2 20px color #047857. 진행 중 = "진행 중" 칩(bg #eef2fe/color #1d4ed8, 0.6875rem/600). 미시작 = ChevronRight 16px color #98a0ad.

[하단 유틸 2버튼] flex gap 0.5rem, 각 .gd-btn.gd-btn-ghost flex 1: lucide FileText + "원본 학습지 보기", lucide BarChart3 + "결과 리포트"(완료 0건이면 opacity 0.45 + pointer-events none).

[완료 규칙 안내] 중앙정렬 0.75rem color #5a6372: "필수 단계를 모두 완료하면 과제가 자동으로 완료됩니다".
[legacy 완료 버튼] 전폭 .gd-btn.gd-btn-primary — lucide Check 18px + "다 확인했습니다"(처리 중이면 Loader2 spin + "처리 중…"). 완료 후에는 버튼 대신 밴드: min-height 2.75rem; border-radius 0.75rem; background #ecfdf5; border 1px solid #a7f3d0; color #047857; CheckCircle2 + "확인 완료".

[원본 뷰어 참고 스펙] A4 고정폭 793.7px(210mm@96dpi) 문서를 리플로우 없이 CSS zoom 변수 --gw-zoom 하나로만 스케일. 핀치/더블탭 1x~3x, step 0.25. 아이콘 버튼 .gw-iconbtn = 2.25rem 원형, color #5a6372, disabled 시 opacity .4 + border 1px solid #d4d1c6.
```

#### (student-app) 게이미피케이션 학습 세션 — 선지 피드백 바

- 왜: Duolingo형 즉시 피드백 UI. #58CC02/#FF4B4B 리터럴 hex와 카드 상태 클래스가 그대로 코드에 있어 재현이 정확하고, /g의 '시험지' 톤과 대비되는 두 번째 얼굴을 보여줄 수 있다.
- 소스: `src/app/(student-app)/student/learn/[passageId]/session/page.tsx`
- 시각 스펙:

```
[루트] max-width 32rem(max-w-lg); margin 0 auto; min-height 100vh; display flex; flex-direction column; background #ffffff.

[상단바] padding 1rem 1rem 0.5rem; flex align-center gap 0.75rem.
- X 닫기 버튼(lucide X 20px, color gray-400 #9CA3AF).
- 진행바: flex 1; height 0.75rem(h-3); background #F3F4F6(gray-100); border-radius 9999px; overflow hidden. 채움은 framer-motion width 애니메이션(duration 0.6s, ease easeOut), 색은 --key-color 토큰(※ 이 토큰은 코드베이스에 정의값이 없음 — 슬라이드에서는 #F59E0B 계열 오렌지로 대체 권장, 아래 선지 하이라이트가 orange-400/500 계열이므로 톤 일관).
- 우측 카운터: font-size 12px; color #000; font-weight 500; tabular-nums. "3/10".

[문항 영역] flex 1; padding 1rem 1.25rem 1.5rem. framer-motion AnimatePresence mode="wait": 진입 {opacity:0, x:30} → {opacity:1,x:0}, 퇴장 {opacity:0,x:-30}, duration 0.2s.
- 지문 카드(접힘형): 좌측 lucide BookOpen 16px, 라벨 "지문 (이 문제에 필요)" 또는 "지문 보기"(12px/600), 우측 ChevronDown(열리면 rotate 180). 펼치면 max-height 12rem 스크롤 영역 + border 1px #F3F4F6 + 12px 본문.
- 문제 텍스트: font-size 20px(--fs-lg@390); font-weight 600; color #000; margin-bottom 2rem; line-height relaxed; whitespace pre-line. **볼드** 마크다운은 <mark>로 렌더 — background #FEF08A(yellow-200), color #000, padding 0 2px, border-radius 2px, font-weight 700.
- 선지 리스트(space-y 0.75rem): 각 버튼 width 100%; text-align left; padding 1rem; border-radius(카드 규격) + 하단 두께 강조 테두리.
  · 기본: 회색 테두리.
  · 선택(피드백 전): border #FB923C(orange-400) / border-bottom #F97316(orange-500) / background #FFF7ED(orange-50).
  · 피드백 후 정답: border #34D399(emerald-400) / border-bottom #10B981(emerald-500) / background #ECFDF5(emerald-50), 텍스트 #047857(emerald-700) weight 500.
  · 피드백 후 선택한 오답: border #FB7185(rose-400) / border-bottom #F43F5E(rose-500) / background #FFF1F2(rose-50), 텍스트 #BE123C(rose-700).
  · 나머지: border #F3F4F6 / background #F9FAFB / opacity 0.5.
  · 좌측 라벨 배지: 2rem × 2rem 원형; font 14px/700. 기본 bg #F3F4F6/color #000, 선택 bg #F97316/color #fff, 정답 bg #10B981/color #fff, 오답 bg #F43F5E/color #fff, 흐림 bg #E5E7EB/color #9CA3AF.
  · 선지 텍스트 15px, padding-top 0.25rem.

[피드백 바] margin-top auto; border-radius 1rem; padding 1rem. framer-motion 진입 {opacity:0,y:20}→{opacity:1,y:0}.
- 정답: background #D7FFB8. 아이콘 lucide Check 24px color #58CC02. 라벨 "정답!" 15px/700 color #047857.
- 오답: background #FFDFE0. 아이콘 lucide AlertCircle 24px color #FF4B4B. 라벨 "오답" 15px/700 color #BE123C. 그 아래 정답 안내 12px color #E11D48: "정답: ③. {선지 텍스트}".
- 해설 박스: margin-top 0.5rem; background rgba(255,255,255,0.6); border-radius 0.75rem; padding 0.75rem. 본문 12px color #000 line-height relaxed. keyPoints는 불릿(•, color --key-color) + 12px color #4B5563.
- 계속 버튼: width 100%; margin-top 0.75rem; padding 0.875rem 0; border-radius 1rem; color #fff; font-weight 700; font-size 15px. background 정답 #58CC02 / 오답 #FF4B4B. 문구 "계속", 제출 중이면 "제출 중..."(opacity 0.5).

[이탈 모달] 백드롭 background rgba(0,0,0,0.4). 카드: width 280px; border-radius 1rem; background #fff; padding 1.5rem; box-shadow xl; 진입 {opacity:0,scale:0.95}→{opacity:1,scale:1}. 제목 "세션을 중단할까요?"(20px/700), 본문 "진행 상황이 저장되지 않습니다."(12px, color #6B7280), 버튼 2개 flex gap 0.5rem: "계속하기"(bg #F3F4F6/color #4B5563) / "나가기"(bg #F43F5E rose-500 / color #fff), 각 padding 0.625rem 0, border-radius 0.75rem, weight 700.
```

#### (student-app) 세션 결과 화면 — XP · 미션 프로그레스 · 오답 유형 칩

- 왜: 게이미피케이션 쪽 '채점 결과' 정본. 스프링 스케일 진입 + 미션 프로그레스 순차 애니메이션이 있어 슬라이드에서 모션을 보여주기 좋다.
- 소스: `src/app/(student-app)/student/learn/[passageId]/session/_components/result-screen.tsx`
- 시각 스펙:

```
[루트] max-width 32rem; margin 0 auto; min-height 100vh; flex-column; background #fff.

[중앙 영역] flex 1; flex-column; align-items center; justify-content center; padding 0 1.5rem; text-align center.
- 아이콘 원: 6rem × 6rem(w-24 h-24); border-radius 9999px; background #FFF7ED(orange-50); 안에 lucide Sparkles 40px(color --key-color). 진입 framer-motion {scale:0}→{scale:1}, type spring, stiffness 200, damping 15.
- 헤드라인: 24px(--fs-xl); font-weight 700; color #000; margin-bottom 0.5rem. 진입 {opacity:0,y:10}→{opacity:1,y:0}, delay 0.2s. 점수 80 이상 "훌륭해요!", 50 이상 "잘했어요!", 그 미만 "괜찮아요!". 결과 비공개 모드면 "학습이 저장됐어요".
- 점수/XP 2분할(delay 0.3s, flex gap 1.5rem): 좌 = 30px(--fs-2xl) bold "85%" + 12px color #6B7280 "정답률". 가운데 1px × 2.5rem 세로선 background #E5E7EB. 우 = 30px bold color #F97316(orange-500) "+120" + 12px color #6B7280 "XP"(배율 있으면 "XP (x2)").
- 결과 비공개 대체 문구(delay 0.3s, 15px, line-height 1.5rem, color #6B7280, max-width 20rem): "풀이 기록은 정상 저장되었습니다. 결과 확인 기능이 다시 열리면 누적 기록도 함께 확인할 수 있습니다."
- 정답 수 줄(delay 0.4s, 15px, color #6B7280): "8/10 문제 정답".

[오늘의 미션 섹션] delay 0.5s. 헤더 = lucide Target 18px color #F97316 + "오늘의 미션"(12px/600/uppercase/color #6B7280).
- 미션 행(각각 delay 0.6 + i×0.15s, 진입 {opacity:0,x:-10}→{opacity:1,x:0}): border-radius 0.75rem; padding 0.75rem; border 1px. 미달성 = background #F9FAFB/border #F3F4F6, 달성 = background #ECFDF5/border #A7F3D0.
  · 상단 행: 라벨 12px/500 color #000 + 우측 보상 칩(border-radius 9999px; padding 0.125rem 0.375rem; 11px/700). 달성 = bg #D1FAE5/color #059669 + 텍스트 "달성!", 미달성 = bg #E5E7EB/color #6B7280 + "+50 XP" 또는 "x2".
  · 프로그레스: height 0.5rem; background #E5E7EB; border-radius 9999px. 채움은 이전값 → 현재값으로 width 애니메이션(delay+0.3s, duration 0.6s, easeOut), 색은 달성 #10B981 / 미달성 #F97316.
  · 하단 행: 좌 11px color #6B7280 "3/5", 우 달성 시 11px/700 color #10B981 "+50 XP 획득!" 또는 "x2 배율 활성!".

[미션 달성 알림] delay 1.0s, spring stiffness 200, {opacity:0,scale:0.9}→{opacity:1,scale:1}. background linear-gradient(to right, #FFFBEB, #FFF7ED); border 1px solid #FDE68A; border-radius 1rem; padding 1rem. lucide Trophy 18px color #F97316 + "미션 달성!"(15px/700, color #B45309) → 미션 라벨(12px color #EA580C) → lucide Zap 14px + "10분간 XP x2 보너스!" 또는 "보너스 +50 XP 획득!"(12px/700 color #B45309).

[오답 유형 칩] delay 0.8s. 헤더 lucide AlertCircle 14px color #FB7185 + "오답 유형 (3개)"(12px/600/uppercase/color #9CA3AF). 칩: display inline-flex; gap 0.25rem; padding 0.25rem 0.625rem; background #FFF1F2; color #E11D48; border 1px solid #FFE4E6; border-radius 0.5rem; 12px/500. 뒤에 개수(color #FB7185).

[하단 버튼] padding 0 1.25rem 2rem; space-y 0.625rem. 위 = width 100%; padding 0.875rem 0; border-radius 0.75rem; background #F97316(orange-500); color #fff; font-weight 700; 15px; 문구 "레슨으로 돌아가기". 아래 = background #F3F4F6; color #4B5563; 문구 "학습 홈".
```

#### /g 로그인 화면 (학원코드 + 학생코드)

- 왜: 덱의 '학생이 앱에 들어오는 첫 3초'. 코드 2개만으로 끝나는 마찰 없는 온보딩이 세미나에서 잘 먹히는 장면이고, gd 팔레트를 가장 미니멀하게 보여준다.
- 소스: `src/app/g/login-client.tsx`
- 시각 스펙:

```
[루트] display flex; flex-column; align-items center; justify-content center; min-height 100dvh; padding 0 1.5rem; background #f6f5f1; color #16202e.
[내부 컨테이너] width 100%; max-width 22rem.

[헤더 블록] margin-bottom 2.5rem; text-align center.
- 로고: 3.5rem × 3.5rem(h-14 w-14); border-radius 1rem; overflow hidden; margin 0 auto 1.25rem; 이미지 /smoat-logo.png, object-fit cover.
- 타이틀 "SMOAT 학습": font-size 1.5rem(gd-t-2xl); font-weight 700; letter-spacing tight.
- 부제 "스모트 모바일 학습 — 과제 · 시험 · 어법 훈련": margin-top 0.5rem; font-size 0.8125rem; color #5a6372.

[폼 카드] .gd-card — background #ffffff; border 1px solid #e5e3db; border-radius 0.875rem; padding 1.25rem.
- 라벨 "학원코드": gd-label — 0.6875rem; font-weight 600; letter-spacing 0.08em; color #98a0ad; display block.
- 입력 래퍼: margin-top 0.375rem; display flex; align-items center; gap 0.625rem; border-radius 0.75rem; border 1px solid #d4d1c6; padding 0 0.875rem.
  · 좌측 아이콘 lucide School 16px, color #98a0ad, strokeWidth 1.75.
  · input: height 3rem; width 100%; background transparent; outline none; font-family mono; font-size 1.0625rem; font-weight 600; letter-spacing 0.2em; text-transform 대문자 강제. placeholder "예: A1B2", maxLength 8.
- 두 번째 필드(margin-top 1rem): 라벨 "학생코드", 아이콘 lucide KeyRound 16px, placeholder "예: X7K2M9", maxLength 12. 나머지 동일.
- 에러 메시지: margin-top 0.75rem; font-size 0.75rem; color #be123c. 문구 "학원코드 또는 학생코드가 올바르지 않습니다." / "시도가 너무 많습니다. 1분 후 다시 시도해 주십시오." / "네트워크 오류입니다. 잠시 후 다시 시도해 주십시오."
- 제출 버튼: margin-top 1.25rem; width 100%; .gd-btn.gd-btn-primary — background #1d4ed8; color #fff; min-height 2.75rem; border-radius 0.75rem; font-size 0.8125rem; font-weight 600; :active scale(0.98) 80ms. 비활성(코드 미충족) 시 background #c3c9d6. 문구 "학습 시작" / 진행 중 "확인 중…".

[푸터] margin-top 1.25rem; text-align center; font-size 0.6875rem; color #98a0ad. 문구 "코드는 담당 선생님께 받을 수 있습니다."

[활성 조건] 학원코드 3자 이상 && 학생코드 4자 이상일 때만 버튼 활성.
```

#### 오프라인 폴백 화면 (네이티브 앱)

- 왜: 네이티브 앱이라는 사실을 증명하는 작은 디테일. gd 팔레트만으로 만든 미니멀 화면이라 슬라이드 구석에 목업으로 넣기 좋다.
- 소스: `mobile/www/offline.html`
- 시각 스펙:

```
배경 #f6f5f1, 본문 잉크 #16202e, 보조 #5a6372, 흐린 텍스트 #98a0ad, 헤어라인 #e5e3db, 액션 #1d4ed8, 카드 #ffffff. 중앙 정렬 단일 카드 구성.
문구(자구 그대로): 문서 제목 "연결이 필요합니다 — SMOAT 학습", 헤드라인 "연결이 필요합니다", 본문 "스모트 학습은 인터넷에 연결된 상태에서 이용할 수 있습니다. 네트워크를 확인한 뒤 다시 시도해 주십시오.", 버튼 "다시 시도", 보조 안내 "연결되면 자동으로 다시 시도합니다."
버튼은 gd-btn-primary 규격 준용(background #1d4ed8, color #fff, min-height 2.75rem, border-radius 0.75rem).
```


### 갭 / 미확인

- `(student-app)` 표면의 핵심 CSS 변수 `--key-learn` / `--key-home` / `--key-mypage` / `--base-bg` 가 코드베이스 어디에도 정의되어 있지 않다. src/app/(student-app)/layout.tsx:39-41 과 :144 에서 사용만 하고, src/app/globals.css 및 src/app/g/gd.css 전수 grep 결과 정의 0건. 즉 이 표면의 '키 컬러'와 배경색의 실제 렌더값을 코드로 확정할 수 없다 — 슬라이드에서 이 화면을 재현할 때는 색을 추정하지 말고 인접 리터럴(orange-400/500 #FB923C/#F97316 계열)로 대체하거나 이 화면 자체를 피하는 편이 안전하다.
- `.card-3d` / `.btn-3d` 유틸 클래스도 정의를 찾지 못했다. session/page.tsx:350, :466, passage-card.tsx:16, match-interaction.tsx:101, arrange-interaction.tsx:110 등에서 사용되지만 src/ 전체 CSS grep 결과 0건. 따라서 '3D 카드'의 실제 그림자·테두리 두께·눌림 효과 수치를 확정할 수 없다.
- `marquee-loop` 키프레임도 정의를 찾지 못했다(src/app/(student-app)/layout.tsx:172 에서 animation 이름으로만 참조). 마퀴가 실제로 흐르는지 확인 불가 — 문구 자체는 확정이므로 슬라이드에서는 자체 keyframe으로 구현할 것.
- 학생 앱에 웹툰 뷰어가 존재하지 않는다. src/app/g/ 와 src/app/(student-app)/ 전수 grep 결과 '웹툰' 0건이며, 웹툰 관련 코드는 전부 (director)/workbench 및 korean 관리자 영역에만 있다. 요청하신 '학습지/웹툰을 모바일에서 보는 화면' 중 웹툰 파트는 학생 표면에 미구현으로 판단된다(학습지 뷰어는 /g/w/[taskId]/doc 로 존재).
- `/g/me`(내 기록 탭), `/g/track/[trackId]`, `/g/unit/[unitId]/learn`(개념 레슨), `/g/vocab`(취약 단어장), `/g/x/[taskId]`(시험 결과), StatusWindow(상태창) 는 파일 존재만 확인했고 내부 UI 스펙은 읽지 않았다. 특히 상태창(gd.css:926-1034 의 다크 패널 — linear-gradient(168deg,#101d31,#0b1523), border #2c4a77, XP 게이지 linear-gradient(90deg,#2563eb,#60a5fa 60%,#93c5fd))은 CSS는 확보했으나 실제 렌더 컴포넌트(src/components/study-os/status-window.tsx)를 열지 않아 문구·레이아웃 미확인.
- `TabletQuestionView`(src/app/t/[token]/taking-parts/question-view.tsx, 444줄) 를 읽지 않았다. /g/q 문항 본문의 마커·밑줄·지문 박스 렌더 상세(폰트 크기, 지문 박스 테두리 등)는 이 파일에 있으므로 문항 본문 영역의 픽셀 스펙은 미확정이다.
- mobile/ 디렉토리의 android/ 네이티브 코드(RouteGuardPlugin, 매니페스트, 스플래시 리소스)와 ios-overlay/ 는 확인하지 않았다. 앱 아이콘·스플래시 이미지의 실제 디자인은 미확인.
- `(student-app)/exams/[examId]/result` 페이지와 mypage 하위 탭(성적/출석/결제/QnA/배지/히트맵) 은 파일 목록만 확인했고 내부 UI는 읽지 않았다.
- `/g` 와 `(student-app)` 두 표면이 현재 각각 어느 정도 트래픽/우선순위를 갖는지는 코드만으로 판단 불가. Capacitor 설정이 /g 만 허용(allowNavigation www.smoat.co.kr, 경로 화이트리스트 /g·/t·/a)한다는 사실로 보아 네이티브 앱 = /g 가 확실하나, (student-app)이 웹 전용으로 병행 운영 중인지 레거시인지는 확인하지 못했다.


---

## [각도 K] 라이브 사이트(www.smoat.co.kr) 실측 + repo 코드 대조 — 실제 공개 랜딩의 섹션 순서/헤드라인/카피 자구, 공개적으로 내세우는 기능 목록, 숫자 표기(유형 수) 검증. 핵심 발견: 랜딩·features는 "25유형", /about·llms.txt·가이드/FAQ SEO 콘텐츠는 "19유형"으로 서로 다르게 표기되며, 이 불일치가 라이브에도 그대로 노출되고 있다. 또한 /features 는 라이브에서 404(인덱스 페이지 부재, 하위 7개 상세 페이지만 존재).

### 관측 사실

- **라이브 랜딩 히어로 헤드라인은 2줄 구조이며, 2번째 줄만 파랑 그라디언트 텍스트다. 코드와 라이브가 완전히 일치한다.**
  - 근거: `src/components/landing/hero-scene.tsx:434-438`
  - 실제 문구: 영어시험 고민은 이제 끝! / SMOAT가 모든 걸 해드립니다
- **히어로 서브카피는 일반 텍스트 1줄 + 파랑 pill(알약) 배지 1줄로 쪼개져 있다. pill 은 bg-blue-100 / text-blue-800.**
  - 근거: `src/components/landing/hero-scene.tsx:449-451`
  - 실제 문구: SMOAT의 영어 내신·수능 최적화 AI로 / 10시간을 10분으로 단축해드립니다!
- **히어로 상단 eyebrow 배지는 Sparkles 아이콘 + bg-blue-500/15 · text-blue-300 · h-8 rounded-full.**
  - 근거: `src/components/landing/hero-scene.tsx:422-425`
  - 실제 문구: 영어 내신·수능 최적화 AI
- **히어로 CTA 2개. 1차는 파랑 필(bg-blue-600, h-52~58px, ring-4 ring-blue-500/15), 2차는 글래스 고스트(border-white/[0.28], bg-white/[0.12], backdrop-blur-xl).**
  - 근거: `src/components/landing/hero-scene.tsx:464-479`
  - 실제 문구: SMOAT 시작하기 / 실제 결과물 보기
- **히어로 배경은 네이비 3-stop 라디얼 그라디언트 + 34px 잉크 그리드 + 파랑 글로우 블롭. 정확한 토큰: bg-[radial-gradient(120%_80%_at_50%_-8%,#1B2A4A_0%,#111C34_45%,#0B1220_100%)].**
  - 근거: `src/components/landing/hero-scene.tsx:404, src/components/landing/shared/scene-ui.tsx:15-16,19-20,27`
- **라이브 랜딩 섹션 순서는 헤더 → 히어로 → 세미나 프로모 → FEATURE 01~06 → 07 아카이브 → 실제 결과물 샘플 → 최종 CTA 이며, repo page.tsx 의 컴포넌트 배치 순서와 정확히 같다(QuestionBurst→Annotation→ExamPaper→Intake→Report→Webtoon→Folder→Sample→Cta).**
  - 근거: `src/app/page.tsx:50-90`
- **헤더 내비 라벨 9개가 라이브와 코드 동일. 첫 항목만 실제 라우트(/seminar)이고 나머지는 앵커 스크롤이다.**
  - 근거: `src/components/landing/landing-header.tsx:11-21`
  - 실제 문구: 단체 세미나 / 25유형 출제 / 학습지 생성 / 시험지 / 자료 추출 / 시험 리포트 / 지문 웹툰 / 아카이브 / 샘플
- **헤더 우측 액션은 '로그인'(고스트 버튼, 모달 오픈)과 '회원 가입'(bg-slate-950 검정 필 + ArrowRight). PC 상단 미스크롤 상태에선 회원가입 버튼이 lg:bg-white / lg:text-slate-950 으로 반전된다.**
  - 근거: `src/components/landing/landing-header.tsx:99-113`
  - 실제 문구: 로그인 / 회원 가입
- **각 FEATURE 섹션은 동일 문법: 킥커(FEATURE · OO, text-blue-600, tracking-[0.14em], uppercase) + 배경 고스트 아웃라인 숫자(01~06, -webkit-text-stroke:2px #BFDBFE, lg:190px) + h2(lg:38px, font-black, 강조어만 text-blue-600).**
  - 근거: `src/components/landing/shared/scene-ui.tsx:44-49,64,73, src/components/landing/question-burst-scene.tsx:235-251`
- **FEATURE 01 은 '25유형'을 라벨·헤드라인·본문 3곳에서 반복한다. 라이브 카피와 코드가 자구까지 일치.**
  - 근거: `src/components/landing/question-burst-scene.tsx:238,248-250,255-261`
  - 실제 문구: FEATURE · 25유형 문제 생성 / 지문 하나로 시작하는, 초고속 AI 문제 생성 / 지문을 넣는 순간, 빈칸·어법·순서부터 서술형까지 내신·수능 25유형 문항이 단 몇 초 만에 완성됩니다.
- **'25유형'은 마케팅 수사가 아니라 실제 데이터 구조와 정확히 일치한다. QUESTION_TYPE_GROUPS 는 수능/모의고사 객관식 14개 + 내신 서술형 8개 + 어휘 3개 = 정확히 25개다.**
  - 근거: `src/lib/question-type-ui.ts:308-349`
- **25유형 전체 라벨(그룹 순서대로): 빈칸 추론, 어법 판단, 네모 어법, 어휘 적절성, 글의 순서, 문장 삽입, 주제 추론, 요지/주장, 제목 추론, 함축 의미 추론, 지칭 추론, 내용 일치, 요약문 완성(객관식), 무관한 문장 / 조건부 영작, 문장 전환, 핵심 표현 빈칸, 요약문 완성, 요약문 영작, 배열 영작, 주제문 영작, 문법 오류 수정 / 문맥 속 의미, 동의어, 반의어.**
  - 근거: `src/lib/question-type-ui.ts:30-289`
  - 실제 문구: 수능/모의고사 객관식 · 내신 서술형 · 어휘
- **주제/요지(TOPIC_MAIN_IDEA)는 레지스트리에는 있으나 25유형 칩 목록에서 의도적으로 제외된 레거시 호환 유형이다. 즉 '25'는 노출 유형 기준 카운트다.**
  - 근거: `src/lib/question-type-ui.ts:110-119`
- **[숫자 표기 불일치] 라이브 /about 은 '19유형'으로 표기한다. 랜딩(25유형)과 정면으로 어긋난다.**
  - 근거: `src/app/about/page.tsx:45,48,55,58,104,113,118`
  - 실제 문구: 스모트(SMOAT)는 영어 지문 분석, 내신·수능 19유형 AI 영어 문제 생성, Word 시험지 자동 제작, 그리고 학원 운영까지 한곳에서 끝내는 영어학원 AI 올인원 서비스입니다.
- **[숫자 표기 불일치 범위] '19유형'은 /about 외에도 llms.txt, /resources, SEO 가이드/아티클/FAQ 콘텐츠 전반에 광범위하게 남아 있다. 반면 랜딩·features 상세·structured-data·seo/config 는 '25유형'이다.**
  - 근거: `src/app/llms.txt/route.ts:22, src/app/resources/page.tsx:251, src/lib/seo/guides-content.json:49,52,74, src/lib/seo/faq-content.json:36 vs src/lib/seo/config.ts:51, src/lib/seo/structured-data.ts:127`
- **라이브 /features 는 HTTP 404. app/features 디렉터리에 page.tsx 가 없고 하위 7개 상세 라우트만 존재한다: ai-question-generation, passage-analysis, exam-builder, exam-report, passage-webtoon, question-extraction, academy-erp.**
  - 근거: `src/app/features (page.tsx 부재, 하위 7개 디렉터리만 존재)`
- **라이브 /features/ai-question-generation 은 정상 렌더되며 '25유형'으로 표기. H1과 CTA 카피가 코드와 일치.**
  - 근거: `src/app/features/ai-question-generation/page.tsx:38,40,53,142`
  - 실제 문구: AI 영어 문제 생성 — 수능·내신·EBS·모의고사 25유형 자동 출제 / 지문 분석부터 25유형 출제, Word·한글 시험지·해설지까지 — SMOAT 하나로 끝냅니다.
- **세미나 프로모 배너는 관리자에서 입력한 DB 값(제목·혜택·일정·정원·커버)을 그대로 렌더한다. 라이브 노출값은 제목 '시험기간이 10배 편해지는! 내신영어 AI 활용 세미나', 정원 20명, 2026.07.26 22:00, 워크토크 선릉점(서울 강남).**
  - 근거: `src/components/landing/seminar-promo-section.tsx:11-31,56,60,65-67`
  - 실제 문구: 모집중 / 선착순 20명 / 세미나 신청하기
- **세미나 배너의 '모집중' 배지는 bg-blue-500 필 안에 흰 점 + animate-ping 링이 무한 반복되는 라이브 인디케이터다.**
  - 근거: `src/components/landing/seminar-promo-section.tsx:51-57`
- **세미나 마감 카운트다운은 1초 틱, SSR 하이드레이션 회피를 위해 마운트 전엔 '--:--:--' 를 그린다(라이브 스크랩에서 관측된 '--:--:--'의 원인). D-N + HH:MM:SS 포맷, 붉은 톤(border-red-400/50, bg-red-500/15, text-red-200/90).**
  - 근거: `src/components/landing/seminar-countdown.tsx:19-22,25,34-46`
  - 실제 문구: 신청 마감까지
- **라이브 랜딩 FEATURE 01 우측은 정적 이미지가 아니라 실제 동작하는 라이브 데모다. 좌측 유형 칩을 누르면 우측에서 해당 유형 문제가 즉시 생성된다(PC ≥lg 한정, dynamic import·뷰포트 근접 시 청크 로드).**
  - 근거: `src/components/landing/question-burst-scene.tsx:18-31,274-278,312-317, src/components/landing/demo/step3-generate/type-chip-selector.tsx:32`
  - 실제 문구: 유형을 클릭하면 오른쪽에서 문제가 바로 생성됩니다
- **아직 아무 유형도 선택하지 않으면 첫 번째 칩(빈칸 추론)에 ring-2 ring-blue-400/60 + animate-pulse 가 걸려 클릭을 유도한다.**
  - 근거: `src/components/landing/demo/step3-generate/type-chip-selector.tsx:45,57-59`
- **모바일(<lg)에서는 라이브 데모 대신 타자기 목업이 돌고, 타이핑 연출은 꺼진다(완성 상태 즉시 렌더). PC 타자기 목업 속도 상수: 발문 26ms/자, 제시문 18ms/자, 선지 16ms/자, 단계 간 200ms, 완성 후 2400ms 유지 뒤 다음 유형 자동 전환.**
  - 근거: `src/components/landing/question-burst-scene.tsx:40-44,177-179,196-208`
- **'실제 결과물 샘플' 섹션은 2개 PDF 카드 그리드다. 각 카드는 첫 페이지 썸네일 + eyebrow + 제목 + 메타 + 설명 + 태그칩 3개 + 버튼 2개 구조.**
  - 근거: `src/components/landing/sample-scene.tsx:18-38,71-149`
  - 실제 문구: 실전 모의고사 문제지 / 독해 28문항 (18~45번) · 7쪽 / 심층 지문 분석 학습지 / 지문 분석 + 실전 학습지 · 22쪽
- **샘플 섹션 헤드라인은 3줄 분할, 가운데 줄만 파랑 강조. 하단 각주로 회원가입 불필요를 명시한다.**
  - 근거: `src/components/landing/sample-scene.tsx:56-61,151-153`
  - 실제 문구: 말로만 설명하지 않겠습니다. / 직접 SMOAT AI의 우수한 품질을 / 확인해보세요. / 학습 목적으로 제작된 샘플 자료입니다 · 회원가입 없이 열람할 수 있습니다
- **최종 CTA 섹션은 다시 네이비 라디얼(#1B2A4A→#0B1220 62%) 배경으로 돌아오고, 헤드라인 2번째 줄만 #7DB0FF→#3B82F6 그라디언트 텍스트다. 버튼은 bg-blue-500 / 글래스 2종.**
  - 근거: `src/components/landing/cta-scene.tsx:11,43-45,53-66`
  - 실제 문구: 가장 진보된 방식의 / 영어 출제 시스템 / 분석부터 출제, 시험지, 리포트까지 — 모두 이곳에 있습니다. / 지금 바로 시작하기→ / 가격 보기→
- **라이브 푸터의 운영사 정보: 주식회사 네안데르, 서비스명 SMOAT, 사업자등록번호 683-86-02812, 서울 마포구 독막로36길 10-6, 1층(대흥동), info@neander.co.kr, 02-336-3368. about 페이지가 BUSINESS_INFO 단일 소스를 참조한다.**
  - 근거: `src/app/about/page.tsx:13,73-78`
- **FEATURE 섹션들은 배경색이 교대(zebra)한다: 01 흰색(bg-white), 02 #F8FAFC, 03 #F8FAFC, 04 #F8FAFC, 05, 06 #F8FAFC, 07 아카이브만 네이비(SCENE_NAVY_BG + 흰 텍스트), 샘플 #F8FAFC, CTA 네이비. 즉 네이비는 히어로/07/CTA 3곳에만 쓰인다.**
  - 근거: `src/components/landing/question-burst-scene.tsx:229, src/components/landing/annotation-scene.tsx:84, src/components/landing/webtoon-scene.tsx:35, src/components/landing/folder-scene.tsx:32, src/components/landing/sample-scene.tsx:44, src/components/landing/cta-scene.tsx:11`
- **FEATURE 02~06 헤드라인 자구(라이브 = 코드 일치). 각 h2 는 '강조어만 파랑' 규칙을 따른다.**
  - 근거: `src/components/landing/annotation-scene.tsx:91,101, src/components/landing/exam-paper-scene.tsx:44,51, src/components/landing/intake-scene.tsx:51,61, src/components/landing/report-scene.tsx:61,71, src/components/landing/webtoon-scene.tsx:44,55, src/components/landing/folder-scene.tsx:39,44-46,51-52`
  - 실제 문구: FEATURE · 학습지 생성 / FEATURE · 1초 만에 시험지 파일로 → 워드(DOCX), 한글(HWPX), PDF / FEATURE · 자료 추출 → 지문이 텍스트로 들어옵니다. / FEATURE · 시험 리포트 → 학생별 분석 리포트가 완성됩니다. / FEATURE · 지문 기반 웹툰 → 웹툰으로 / FEATURE · 아카이브와 학원 운영 → 이 모든 것들을 철저하게 파일 시스템 기반으로 관리합니다.
- **라이브 /seminar 상세 페이지의 커리큘럼 4항목과 혜택 3항목이 확인된다(관리자 입력값 기반).**
  - 근거: `https://www.smoat.co.kr/seminar (WebFetch, 2026-07-24 취득)`
  - 실제 문구: 필기 기반 지문 분석 / 유형 및 난이도별 변형 문제 제작 / 자체 시험지 편집 / 지문 기반 웹툰 생성 // 100% 실전형 세미나 강의 / AI 활용 가이드북 제공 / 참석자만을 위한 시크릿 선물
- **라이브 랜딩은 lg 이상에서 CSS scroll-snap 풀페이지 덱처럼 동작한다. 모든 섹션 래퍼에 lg:snap-start + lg:min-h-[100svh] 가 걸려 한 화면 = 한 기능 구조다. 상단에는 ScrollProgress 바가 있다.**
  - 근거: `src/app/page.tsx:49,56,64-90,48`

### 덱 재현 대상 (visualSpec)

#### 히어로 슬라이드 (네이비 + 3D 플로팅 시험지 빌더 목업)

- 왜: SMOAT의 첫인상 그 자체. 세미나 오프닝 슬라이드로 그대로 쓰면 '이 화면 본 적 있죠?'가 즉시 성립한다. 네이비+블루 토큰과 3D 부유 대시보드는 덱 전체 톤앤매너의 기준점이 된다.
- 소스: `src/components/landing/hero-scene.tsx`
- 시각 스펙:

```
[배경] section 전체: background: radial-gradient(120% 80% at 50% -8%, #1B2A4A 0%, #111C34 45%, #0B1220 100%). 그 위에 잉크 그리드 오버레이 — linear-gradient(rgba(148,180,255,0.06) 1px, transparent 1px) + linear-gradient(90deg, 동일), background-size: 34px 34px. 상단 중앙에 글로우 블롭: position absolute, left 50%, translateX(-50%), top -40px, width 820px, height 420px, border-radius 9999px, background radial-gradient(closest-side, rgba(59,130,246,0.38), transparent), filter blur(20px).\n[레이아웃] 세로 스택 중앙정렬. max-width 1220px, padding-inline 32px. 상단 여백 pt 112px.\n[1) eyebrow 배지] inline-flex, height 32px, border-radius 9999px, background rgba(59,130,246,0.15), padding-inline 16px, gap 8px, font-size 13px, font-weight 800, letter-spacing 0.04em, color #93C5FD(blue-300). 좌측에 Sparkles 아이콘 14px. 텍스트: "영어 내신·수능 최적화 AI".\n[2) H1] font-weight 900, font-size 72px(lg), line-height 1.15, letter-spacing -0.025em, color #FFFFFF, word-break keep-all. 2줄: 1줄 "영어시험 고민은 이제 끝!" (흰색), 줄바꿈, 2줄 "SMOAT가 모든 걸 해드립니다" → background: linear-gradient(90deg, #7DB0FF, #3B82F6); background-clip:text; color:transparent.\n[3) 서브카피] margin-top 24px, max-width 880px, font-size 19px, font-weight 700, line-height 32px, color #B6C2D9. 1줄: "SMOAT의 영어 내신·수능 최적화 AI로". 줄바꿈 후 pill: inline-flex, margin-top 10px, border-radius 9999px, background #DBEAFE(blue-100), padding 6px 20px, font-size 17px, font-weight 800, color #1E40AF(blue-800), 텍스트 "10시간을 10분으로 단축해드립니다!".\n[4) CTA 2개] margin-top 32px, flex, gap 12px, 중앙정렬. 1차: height 58px, padding-inline 40px, border-radius 9999px, background #2563EB(blue-600), color #fff, font-size 16px, font-weight 900, box-shadow 0 24px 54px -22px rgba(37,99,235,1), 추가 ring: box-shadow 겹쳐 0 0 0 4px rgba(59,130,246,0.15). 텍스트 "SMOAT 시작하기" + ArrowRight 16px. hover: translateY(-2px), background #1D4ED8. 2차: height 54px, padding-inline 24px, border 1px solid rgba(255,255,255,0.28), background rgba(255,255,255,0.12), backdrop-filter blur(24px), color #fff, font-weight 900, font-size 14px, FileText 아이콘 + "실제 결과물 보기".\n[5) 3D 대시보드 목업] margin-top 64px. 부모에 perspective:1600px; perspective-origin:top. 카드 래퍼에 무한 애니메이션: @keyframes float { 0%,100% { transform: translateY(0) rotateX(13deg) rotateY(-9deg) rotateZ(3deg);} 50% { transform: translateY(-12px) rotateX(15deg) rotateY(-11deg) rotateZ(4deg);} } animation: float 8s ease-in-out infinite. max-width 1120px.\n  · 외곽 베젤: border-radius 34px, border 10px solid rgba(2,6,23,0.9), background rgba(2,6,23,0.9), box-shadow 0 36px 110px -40px rgba(15,23,42,0.8).\n  · 내부 스크린: border-radius 24px, height 468px, background #F8FAFC(slate-50), overflow hidden.\n  · 브라우저 크롬 바: height 48px, background #fff, border-bottom 1px #F1F5F9. 좌측 신호등 원 3개 10px — #FCA5A5, #FCD34D, #6EE7B7. 그 옆 URL 필: background #F1F5F9, border-radius 9999px, padding 4px 12px, font-size 11px, font-weight 900, color #64748B, 텍스트 "smoat.co.kr/workbench/exams/create". 우측: 초록 필(background #ECFDF5, color #047857, CheckCircle2 + "저장됨"), 파랑 필(background #2563EB, color #fff, Download + "출력").\n  · 본문 3열 그리드: 172px | 1fr | 246px.\n    - 좌 사이드바(bg #fff, border-right #F1F5F9): 상단 로고 — 32px 정사각 rounded 12px background #2563EB 안에 흰 'S', 옆에 'SMOAT' 13px/900. 메뉴 4개 "문제 생성 / 시험지 생성 / 학습지 생성 / 자료 추출", 2번째(시험지 생성)만 active — background #EFF6FF, color #1D4ED8, 좌측 점 6px #3B82F6; 나머지는 color #94A3B8, 점 #E2E8F0. 아래 최근파일 카드 3개: ["고2 영어 중간","12문항 · 편집중"](active: border #BFDBFE, bg rgba(239,246,255,0.8)), ["수능형 미니 모의고사","20문항"], ["어법 집중 세트","8문항"].\n    - 중앙: eyebrow "시험지 생성"(10px/900, color #3B82F6, uppercase), h2 "고2 영어 중간고사 시험지 편집"(22px/900, #020617). 우측 상단 배지 "A4 · 2단 · 12문항"(white 필, border #DBEAFE, color #1D4ED8) + 검정 필 "자동 저장"(background #020617, color #fff, Save 아이콘). 그 아래 캔버스: border-radius 16px, border 1px #E2E8F0, background rgba(241,245,249,0.9), padding 12px. 캔버스 좌상단 플로팅 라벨 "1페이지 편집중"(white 필 + LayoutTemplate 아이콘 #2563EB), 우상단 "AI 추천 배치"(background #2563EB, color #fff, Sparkles). 캔버스 중앙에 A4 종이: width 76%, max-width 420px, background #fff, border-radius 10px, border 1px #E2E8F0, box-shadow 0 24px 70px -40px rgba(15,23,42,0.6), padding 16px. 종이 헤더: "2026학년도 1학기"(8px/900, #2563EB) + "고2 영어 중간고사"(15px/900) + 우측 반/이름 표(2x2 그리드, border #E2E8F0), 아래 border-bottom 1px #0F172A. 지시문 박스: background #F8FAFC, 8px, "다음 글을 읽고 물음에 답하시오. 각 문항의 답을 하나만 고르시오.". 문항 2단 그리드 4개: 1 "빈칸 추론"(번호칩 background #020617), 2 "어법 판단"(선택 상태 — border #93C5FD, background rgba(239,246,255,0.45), box-shadow 0 0 0 2px rgba(37,99,235,0.12), 번호칩 #2563EB, 우측 "선택됨" 필), 3 "글의 순서", 4 "조건부 영작". 2번 문항 좌측에 드래그 핸들 GripVertical(16px, background #2563EB, color #fff, rounded 4px)이 붙고 @keyframes cursor {0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}} animation 2.4s ease-in-out infinite 로 깜빡인다. 하단 파이프라인 카드 4개(1x4 그리드): 아이콘칩 36px rounded 12px + 제목/부제 — [지면 편집 / A4 2단 레이아웃 / bg #3B82F6], [문항 추가 / 라이브러리에서 배치 / bg #06B6D4], [자동 저장 / 편집 내용 즉시 반영 / bg #10B981], [파일 출력 / DOCX·HWPX·PDF / bg #F59E0B]. 카드 자체는 border 1px rgba(255,255,255,0.7), background rgba(255,255,255,0.82), backdrop-blur, border-radius 16px.\n    - 우 사이드바: 헤더 "시험지 설정"(Settings2 #2563EB) + 우측 배지 "12문항"(bg #EFF6FF, color #1D4ED8). 3칸 토글 ["A4","2단"] active(background #2563EB, color #fff) + ["정답지"] inactive(background #F8FAFC, color #64748B). "문항 라이브러리" 박스(bg #F8FAFC, border #F1F5F9, radius 16px) 안에 "+ 새 문항"(color #2563EB) 및 흰 행 6개: 1. 빈칸 추론 / 2. 어법 판단 / 3. 글의 순서 / 4. 문장 삽입 / 5. 제목 추론 / 6. 조건부 영작 (각 행 우측 Plus 아이콘 #2563EB). 최하단 검정 카드(background #020617, radius 16px, padding 16px): "Export Ready"(FileText, color #BFDBFE) / "고2영어_중간.docx"(20px/900 흰색) / "시험지·정답지 함께 생성"(11px, #CBD5E1).\n  · 좌우에 떠 있는 유리 배지 3개(xl 이상만 표시, translateZ 로 깊이감): border-radius 16px, border 1px rgba(255,255,255,0.75), background rgba(255,255,255,0.86), backdrop-blur(24px), box-shadow 0 24px 70px -35px rgba(15,23,42,0.65), 내부 40px 아이콘칩(bg #EFF6FF, color #2563EB) + 라벨(11px/700 #94A3B8) + 값(14px/900 #020617). ①좌상단(-left-40px, top 48px, translateZ(80px)): PencilLine / "시험지 생성" / "실제 지면 직접 편집". ②우상단(-right-24px, top 80px, translateZ(60px)): ClipboardList / "문항 구성" / "12문항 자동 배치". ③좌하단(bottom 48px, -left-16px, translateZ(90px)): Download / "출력 완료" / "DOCX·HWPX·PDF".\n[등장 모션] 상단 텍스트 블록은 staggerChildren 0.12s, delayChildren 0.15s. eyebrow: opacity 0→1, y 20→0, 0.6s cubic-bezier(0.16,1,0.3,1). H1: opacity 0→1, y 34→0, blur 8px→0, 0.8s 동일 이징. 서브: y 22→0, blur 6px→0, 0.7s. CTA: y 18→0, 0.6s. 대시보드: opacity 0→1, y 60→0, 0.9s, delay 0.55s.
```

#### 25유형 칩 셀렉터 (인터랙티브 유형 그리드)

- 왜: '25유형'이라는 숫자를 슬라이드에서 증명하는 유일한 자산. 25개 칩을 실제로 세어 보여줄 수 있고, 클릭 → 우측 생성이라는 제품의 핵심 인터랙션을 슬라이드에서 그대로 재현할 수 있다. 세미나 청중에게 '19가 아니라 25'를 각인시키는 데 최적.
- 소스: `src/components/landing/demo/step3-generate/type-chip-selector.tsx + src/lib/question-type-ui.ts:308-349`
- 시각 스펙:

```
[레이아웃] 세로 스택 gap 12px. 최상단 유도 헤더: flex, gap 6px, font-size 13px, font-weight 900, color #2563EB, MousePointerClick 아이콘 16px(미선택 시 animate-bounce), 텍스트 "유형을 클릭하면 오른쪽에서 문제가 바로 생성됩니다".\n[그룹] 3개 그룹, 각 그룹 헤더는 font-size 11px, font-weight 700, text-transform uppercase, letter-spacing 0.14em, color #94A3B8. 그룹명 그대로: "수능/모의고사 객관식" → "내신 서술형" → "어휘".\n[칩 컨테이너] margin-top 6px, display flex, flex-wrap wrap, gap 6px.\n[칩 기본] display inline-block, border-radius 9999px, border 1px solid #E2E8F0, background #FFFFFF, padding 4px 12px, font-size 12.5px, font-weight 700, color #334155, box-shadow 0 1px 2px rgba(0,0,0,0.05), transition all 150ms. hover: translateY(-2px), border-color #60A5FA, color #1D4ED8, box-shadow 0 4px 6px -1px rgba(0,0,0,0.1).\n[칩 선택됨] border-color #2563EB, background #2563EB, color #FFFFFF, box-shadow 0 4px 6px -1px rgba(0,0,0,0.1).\n[유도 펄스] 아무것도 선택 안 된 상태에서 첫 칩(빈칸 추론)만: box-shadow 0 0 0 2px rgba(96,165,250,0.6) + animation pulse 2s cubic-bezier(0.4,0,0.6,1) infinite.\n[칩 텍스트 — 정확히 25개, 이 순서로]\n· 수능/모의고사 객관식 (14): 빈칸 추론, 어법 판단, 네모 어법, 어휘 적절성, 글의 순서, 문장 삽입, 주제 추론, 요지/주장, 제목 추론, 함축 의미 추론, 지칭 추론, 내용 일치, 요약문 완성(객관식), 무관한 문장\n· 내신 서술형 (8): 조건부 영작, 문장 전환, 핵심 표현 빈칸, 요약문 완성, 요약문 영작, 배열 영작, 주제문 영작, 문법 오류 수정\n· 어휘 (3): 문맥 속 의미, 동의어, 반의어\n[슬라이드용 인터랙션 제안] 칩 클릭 시 우측 패널에 해당 유형 카드가 나타나는 구조. 섹션 헤더 카피는 랜딩 그대로: 킥커 "FEATURE · 25유형 문제 생성"(color #2563EB, 14px/800, uppercase, letter-spacing 0.14em), h2 "지문 하나로 시작하는," + 줄바꿈 + "초고속 AI 문제 생성"(color #2563EB), 본문 "지문을 넣는 순간, 빈칸·어법·순서부터 서술형까지 내신·수능 25유형 문항이 단 몇 초 만에 완성됩니다."(15px, color #4B5563, 강조부 "내신·수능 25유형 문항이 단 몇 초 만에"만 color #111827/font-weight 700).
```

#### FEATURE 씬 프레임 (킥커 + 고스트 숫자 + 강조 헤드라인)

- 왜: 랜딩의 6개 기능 섹션이 전부 이 한 벌의 문법으로 되어 있다. 이 프레임 하나만 슬라이드 마스터로 만들면 기능 소개 슬라이드 6~7장을 동일 톤으로 찍어낼 수 있다.
- 소스: `src/components/landing/shared/scene-ui.tsx`
- 시각 스펙:

```
[섹션 배경 — 라이트형] background #F8FAFC (FEATURE 01만 #FFFFFF). 위에 잉크 그리드: linear-gradient(rgba(15,23,42,0.045) 1px, transparent 1px) + linear-gradient(90deg, rgba(15,23,42,0.045) 1px, transparent 1px), background-size 34px 34px.\n[섹션 배경 — 다크형(아카이브/CTA)] background radial-gradient(120% 80% at 50% -8%, #1B2A4A 0%, #111C34 45%, #0B1220 100%) + 그리드 rgba(148,180,255,0.06) 34px.\n[그리드 구조] 컨테이너 max-width 1480px, padding-inline 64px, display grid, grid-template-columns minmax(0,5fr) minmax(0,7fr), align-items center, gap 32px. 좌 = 카피, 우 = 제품 목업/데모.\n[고스트 숫자] 카피 컬럼 부모 position relative, 숫자는 position absolute, top -8px, left -16px, z-index 0. font-size 190px, font-weight 900, line-height 0.8, letter-spacing -0.05em, color transparent, -webkit-text-stroke: 2px #BFDBFE, font-variant-numeric tabular-nums, user-select none. 값은 "01"~"06".\n[킥커] display flex, align-items center, gap 10px, font-size 14px, font-weight 800, text-transform uppercase, letter-spacing 0.14em, color #2563EB (다크 배경일 땐 #93C5FD). 값 예: "FEATURE · 25유형 문제 생성" / "FEATURE · 학습지 생성" / "FEATURE · 1초 만에 시험지 파일로" / "FEATURE · 자료 추출" / "FEATURE · 시험 리포트" / "FEATURE · 지문 기반 웹툰" / "FEATURE · 아카이브와 학원 운영".\n[H2] position relative(고스트 숫자 위), font-size 38px, font-weight 900, line-height 1.24, letter-spacing -0.02em, color #0F172A(다크형은 #FFFFFF), word-break keep-all. 강조 부분만 <span> color #2563EB (다크형은 #7DB0FF). 실제 값:\n · 01: "지문 하나로 시작하는," / [파랑]"초고속 AI 문제 생성"\n · 02: 강조 [파랑]"바로 수업 가능한 학습지"\n · 03: 강조 [파랑]"워드(DOCX), 한글(HWPX), PDF"\n · 04: 강조 [파랑]"지문이 텍스트로" 들어옵니다.\n · 05: 강조 [파랑]"학생별 분석 리포트"가 완성됩니다.\n · 06: 강조 [파랑]"웹툰으로"\n · 07(다크): "이 모든 것들을 철저하게" / [#7DB0FF]"파일 시스템 기반으로 관리"합니다.\n[본문] margin-top 16px, max-width 48rem, font-size 15px, font-weight 500, line-height 1.7, color #4B5563(다크형 #B6C2D9), word-break keep-all. 강조 어구는 <strong> color #111827 / font-weight 700 (다크형 #FFFFFF).\n[등장 모션] Reveal — opacity 0→1 + translateY 16px→0, 뷰포트 진입 시 1회, 킥커 delay 0, H2 delay 0.08s, 본문 delay 0.16s, 칩/뱃지 delay 0.3s. 이징 cubic-bezier(0.16,1,0.3,1), duration 0.5~0.6s.
```

#### 세미나 프로모 배너 (모집중 + 카운트다운)

- 왜: 이번 덱이 바로 '세미나용'이다. 랜딩에 실제로 걸려 있는 그 세미나 배너를 슬라이드로 그대로 띄우면 '지금 여러분이 신청한 그 배너'가 되어 도입부 몰입도가 극대화된다. 라이브 인디케이터 + 카운트다운이 모션 소스로도 최적.
- 소스: `src/components/landing/seminar-promo-section.tsx + src/components/landing/seminar-countdown.tsx`
- 시각 스펙:

```
[컨테이너] max-width 1320px, border-radius 28px, overflow hidden, border 1px solid #E2E8F0, background #fff, box-shadow 0 30px 80px -50px rgba(15,23,42,0.55). hover: translateY(-2px), box-shadow 0 40px 90px -46px rgba(37,99,235,0.5). 높이 calc(100svh - 240px), min-height 480px.\n[그리드] grid-template-columns 1fr 1fr — 좌 텍스트, 우 커버 이미지.\n[좌 패널] background linear-gradient(to bottom right, #020617, #0F172A, #172554), color #fff, padding 56px, display flex, flex-direction column, justify-content center, gap 24px, position relative. 좌상단 장식: absolute, left -64px, top -64px, size 256px, border-radius 9999px, background rgba(59,130,246,0.2), filter blur(48px).\n[배지 행] flex, gap 8px.\n · '모집중' 배지: inline-flex, gap 6px, border-radius 9999px, background #3B82F6, padding 4px 12px, font-size 12px, font-weight 900. 좌측에 6px 흰 점 + 그 위에 동일 크기 흰 원이 animate-ping(@keyframes ping{75%,100%{transform:scale(2);opacity:0}} 1s cubic-bezier(0,0,0.2,1) infinite, opacity 0.7).\n · 정원 배지: border-radius 9999px, background rgba(255,255,255,0.1), padding 4px 12px, font-size 12px, font-weight 700, color #DBEAFE, Users 아이콘 14px, 텍스트 "선착순 20명".\n[제목] font-size 38px, font-weight 900, line-height 1.25, letter-spacing -0.025em, white-space pre-line. 값: "시험기간이 10배 편해지는! 내신영어 AI 활용 세미나".\n[메타 행] flex, column-gap 20px, row-gap 6px, font-size 14.5px, color #CBD5E1. ①CalendarClock 아이콘 16px(color #93C5FD) + "2026.07.26 22:00", ②MapPin 16px(color #93C5FD) + "워크토크 선릉점 (서울 강남)".\n[카운트다운] inline-flex, gap 10px, border-radius 12px, border 1px solid rgba(248,113,113,0.5), background rgba(239,68,68,0.15), padding 8px 14px. AlarmClock 16px color #F87171. 라벨 "신청 마감까지" — font-size 12px, font-weight 700, color rgba(254,202,202,0.9). 숫자 — font-family monospace, font-size 15px, font-weight 900, font-variant-numeric tabular-nums, color #fff, 포맷 "D-2 03:14:07"(D-N 부분만 color #F87171). 1초마다 갱신. 마운트 전 초기값은 "--:--:--".\n[CTA] inline-flex, border-radius 9999px, background #FFFFFF, color #020617, padding 12px 24px, font-size 15px, font-weight 900, ArrowRight 16px. 카드 hover 시 translateX(2px).\n[우 패널] 커버 이미지 object-fit cover 전면. 이미지 없을 때 폴백: background linear-gradient(to bottom right, #EFF6FF, #F8FAFC, #E0E7FF), 중앙에 Users 아이콘 40px(stroke-width 1.5, color #94A3B8) + 텍스트 "SMOAT 단체 세미나"(14px/700).\n[세미나 상세 슬라이드용 추가 카피] 커리큘럼 4항목: "필기 기반 지문 분석", "유형 및 난이도별 변형 문제 제작", "자체 시험지 편집", "지문 기반 웹툰 생성". 혜택 3항목: "100% 실전형 세미나 강의", "AI 활용 가이드북 제공", "참석자만을 위한 시크릿 선물".
```

#### 실제 결과물 샘플 카드 2종

- 왜: '말로만 설명하지 않겠습니다'는 세미나 발표의 논증 전환점 그 자체다. 28문항/7쪽, 22쪽 같은 구체 숫자가 있어 신뢰 슬라이드로 강력하고, 카드 2장 그리드는 슬라이드 레이아웃으로 바로 이식된다.
- 소스: `src/components/landing/sample-scene.tsx`
- 시각 스펙:

```
[섹션] background #F8FAFC + 잉크 그리드(rgba(15,23,42,0.045) 1px / 34px). max-width 1480px, padding-inline 64px.\n[헤더] 중앙정렬, max-width 900px. 킥커 "실제 결과물 샘플"(font-size 14px, font-weight 800, uppercase, letter-spacing 0.14em, color #2563EB). h2 — font-size clamp(24px,2.8vw,40px), font-weight 900, line-height 1.24, letter-spacing -0.02em, color #0F172A, word-break keep-all, 3줄: "말로만 설명하지 않겠습니다." / "직접 [#2563EB]SMOAT AI의 우수한 품질[/]을" / "확인해보세요.". 본문 margin-top 16px, font-size 15px, line-height 1.7, font-weight 500, color #4B5563: "SMOAT가 실제로 생성한 두 자료입니다. 직접 열어 보고 품질로 판단하세요."\n[카드 그리드] grid-template-columns 1fr 1fr, gap 32px, max-width 64rem, 중앙정렬.\n[카드] display flex column, overflow hidden, border-radius 16px, border 1px solid #DBEAFE, background #fff, box-shadow 0 20px 60px -15px rgba(59,130,246,0.08).\n[썸네일 영역] height 150px, background #F1F5F9, border-bottom 1px #EFF6FF, position relative. 이미지 object-fit cover, object-position top, hover 시 scale(1.02) transition 500ms. 하단 페이드: absolute inset-x 0, bottom 0, height 64px, background linear-gradient(to top, rgba(255,255,255,0.9), transparent). 우하단 배지: absolute bottom 12px right 12px, border-radius 9999px, background rgba(2,6,23,0.8), backdrop-blur, padding 6px 12px, font-size 11px, font-weight 900, color #fff, ExternalLink 12px + "클릭해서 전체 보기".\n[카드 본문] padding 16px. eyebrow — font-size 11px, uppercase, letter-spacing 0.2em, font-weight 800, color #3B82F6. 제목 — font-size 18px, font-weight 800, color #111827. 메타 행 — margin-top 4px, font-size 13px, font-weight 700, color #94A3B8, FileText 14px 아이콘. 설명 — margin-top 8px, font-size 13.5px, line-height 1.65, font-weight 500, color #4B5563, word-break keep-all. 태그 칩 — border-radius 9999px, border 1px solid #DBEAFE, background rgba(239,246,255,0.6), padding 4px 10px, font-size 11px, font-weight 700, color #1D4ED8.\n[카드 버튼 2개] margin-top 16px, flex, gap 12px, 각각 flex:1, height 44px, border-radius 9999px, font-size 13.5px, font-weight 900. 좌: background #3B82F6, color #fff, box-shadow 0 10px 20px rgba(59,130,246,0.2), hover background #2563EB, ExternalLink 16px + "브라우저 미리보기". 우: border 1px solid #CBD5E1, background #fff, color #1E293B, hover border #60A5FA + color #2563EB, Download 16px + "PDF 다운로드".\n[카드 1 실제 값] eyebrow "MOCK EXAM" / 제목 "실전 모의고사 문제지" / 메타 "독해 28문항 (18~45번) · 7쪽" / 설명 "수능 독해 전 유형을 실전 구성 그대로 — 이대로 인쇄해 쓸 수 있습니다." / 태그 "수능 실전 구성","전 유형 출제","2단 조판".\n[카드 2 실제 값] eyebrow "PASSAGE ANALYSIS" / 제목 "심층 지문 분석 학습지" / 메타 "지문 분석 + 실전 학습지 · 22쪽" / 설명 "지문 한 편을 해석·구조·어법·어휘·실전 학습지까지 한 권으로 완성했습니다." / 태그 "문장별 직독직해","논리 구조 분석","실전 학습지".\n[각주] margin-top 12px, 중앙정렬, font-size 12.5px, font-weight 500, color #94A3B8: "학습 목적으로 제작된 샘플 자료입니다 · 회원가입 없이 열람할 수 있습니다".\n[모션] 카드별 opacity 0→1 + translateY 24px→0, duration 0.5s, delay = index × 0.12s, ease cubic-bezier(0.16,1,0.3,1), viewport once, amount 0.2.
```

#### 클로징 CTA 슬라이드 (네이비 + 그라디언트 헤드라인)

- 왜: 세미나 마지막 슬라이드로 그대로 쓸 수 있는 완성된 클로징. 히어로와 같은 네이비/그라디언트 문법이라 덱의 수미상관 구조를 만든다.
- 소스: `src/components/landing/cta-scene.tsx`
- 시각 스펙:

```
[섹션] background radial-gradient(120% 120% at 50% 0%, #1B2A4A, #0B1220 62%) + 그리드 오버레이(rgba(148,180,255,0.06) 1px, 34px). 상단 중앙 글로우: top 0, width 760px, height 400px, radial-gradient(closest-side, rgba(59,130,246,0.38), transparent), blur(20px).\n[레이아웃] flex column, 중앙정렬, max-width 1440px, padding-inline 32px.\n[1) 이미지 배너] margin-bottom 24px, width 100%, max-width 920px, height clamp(150px, calc(100svh - 600px), 300px), border-radius 16px, border 1px solid rgba(147,197,253,0.2), background #071426, box-shadow 0 30px 90px -34px rgba(37,99,235,0.7), 이미지 object-fit cover. alt "알파벳과 영어 시험지가 분석되어 정돈된 문항으로 생성되는 과정".\n[2) 브랜드 아이콘] margin-bottom 24px, size 56px, border-radius 16px, box-shadow 0 10px 30px rgba(59,130,246,0.3).\n[3) H2] font-size clamp(34px,3.8vw,56px), font-weight 900, line-height 1.16, letter-spacing -0.03em, color #fff, word-break keep-all, max-width 56rem. 2줄: "가장 진보된 방식의" / "영어 출제 시스템" — 2줄만 background linear-gradient(90deg,#7DB0FF,#3B82F6); background-clip:text; color:transparent.\n[4) 서브] margin-top 20px, font-size 18px, line-height 1.625, font-weight 500, color #B6C2D9, max-width 42rem: "분석부터 출제, 시험지, 리포트까지 — 모두 이곳에 있습니다."\n[5) 버튼 2개] margin-top 32px, flex, gap 16px. 좌: height 56px, padding-inline 40px, border-radius 9999px, background #3B82F6, color #fff, font-weight 800, font-size 16px, box-shadow 0 18px 40px -14px rgba(59,130,246,0.85), hover background #60A5FA + translateY(-2px), 텍스트 "지금 바로 시작하기" + 우측 8px 간격 "→". 우: 동일 사이즈, border 1px solid rgba(255,255,255,0.28), background rgba(255,255,255,0.12), color #fff, font-weight 800, hover border rgba(255,255,255,0.5) + background rgba(255,255,255,0.2), 텍스트 "가격 보기" + "→".\n[모션] Stagger 컨테이너 — 자식 간 gap 0.12s, viewport amount 0.25. 각 Item opacity 0→1 + y 이동, 아이콘/버튼 Item 은 pop(scale 0.96→1) 적용.
```

#### 랜딩 전체 = 풀페이지 스냅 덱 구조 (덱 아키텍처 참조)

- 왜: 이 제품의 랜딩 자체가 이미 '한 화면 = 한 기능'의 인터랙티브 덱이다. 세미나 슬라이드 덱의 네비게이션/스냅 구조를 제품과 동일하게 맞추면 '제품과 발표자료가 같은 언어'라는 메타 메시지가 성립한다.
- 소스: `src/app/page.tsx`
- 시각 스펙:

```
[스냅 구조] 각 섹션 래퍼: scroll-snap-align start (lg 이상만), min-height 100svh, display flex, align-items center, padding-top 112px, padding-bottom 40px. 부모에 scroll-snap-type: y proximity/mandatory. 모바일에서는 스냅 해제하고 자연 스크롤.\n[섹션 순서 — 슬라이드 순서로 그대로 이식 가능]\n 1 히어로(네이비)\n 2 세미나 프로모(라이트 배경 위 카드)\n 3 #section-question — FEATURE 01 25유형 문제 생성 (bg #FFFFFF)\n 4 #section-annotation — FEATURE 02 학습지 생성 (bg #F8FAFC)\n 5 #section-exam — FEATURE 03 1초 만에 시험지 파일로 (bg #F8FAFC)\n 6 #section-intake — FEATURE 04 자료 추출 (bg #F8FAFC)\n 7 #section-report — FEATURE 05 시험 리포트\n 8 #section-webtoon — FEATURE 06 지문 기반 웹툰 (bg #F8FAFC)\n 9 #section-folder — FEATURE 07 아카이브와 학원 운영 (네이비, 흰 텍스트)\n 10 #section-samples — 실제 결과물 샘플 (bg #F8FAFC)\n 11 CTA (네이비)\n[배경 리듬] 네이비는 1·9·11 세 곳에만. 나머지는 #FFFFFF/#F8FAFC + 34px 잉크 그리드. 이 명암 리듬이 덱의 챕터 구분자 역할을 한다.\n[고정 요소] 상단 고정 헤더(height 80px → 스크롤 시 64px, background 흰색 → lg에서 rgba(255,255,255,0.72) + backdrop-blur(40px), box-shadow 0 1px 0 rgba(15,23,42,0.08)). 헤더 중앙 알약형 내비: border-radius 9999px, border 1px rgba(255,255,255,0.8), background rgba(255,255,255,0.68), padding 4px, font-size 12px, font-weight 900, color #334155, backdrop-blur(40px), 각 항목 padding 8px 12px, hover background #EFF6FF + color #1D4ED8. 항목: 단체 세미나 / 25유형 출제 / 학습지 생성 / 시험지 / 자료 추출 / 시험 리포트 / 지문 웹툰 / 아카이브 / 샘플. 우측 로그인(고스트) + 회원 가입(background #020617, color #fff, hover background #2563EB). 좌측 로고: 원형 브랜드 아이콘 + 'SMOAT'(18px/900, 스크롤 전 lg에서 흰색, 스크롤 후 #020617).\n[보조] 상단 스크롤 프로그레스 바, 우하단 맨위로 버튼.
```


### 갭 / 미확인

- https://www.smoat.co.kr/features 는 HTTP 404 를 반환했다(추측 아님, 실측). repo 에도 src/app/features/page.tsx 가 없고 하위 7개 상세 라우트만 존재하므로 '기능 인덱스 페이지'는 공개적으로 존재하지 않는다. 헤더 내비에도 /features 링크는 없다.
- 라이브 가격/요금 페이지(/credits/products)는 이번 정찰에서 fetch 하지 않았다. 랜딩 CTA에 '가격 보기' 버튼이 /credits/products 로 걸려 있다는 사실만 코드로 확인(src/components/landing/cta-scene.tsx:61). 실제 요금제 금액·플랜명은 미확인.
- 세미나 참가비/가격은 라이브 /seminar 에서 확인되지 않았다(WebFetch 결과에 pricing 없음). 무료인지 유료인지 단정 불가.
- 랜딩 상단 배너(LandingBannerStrip)와 팝업(LandingPopup)은 DB(platform-settings) 기반 동적 콘텐츠라 코드에 고정 문구가 없다. 라이브 취득 시점(2026-07-24)에 노출된 배너 문구는 '단체 세미나 모집 중! 스모트 AI 활용 세미나 신청하기' 로 관측되었으나 언제든 바뀔 수 있다.
- 세미나 배너의 제목·정원·일정·혜택은 전부 관리자 입력 DB 값이다(src/components/landing/seminar-promo-section.tsx:9). 슬라이드에 하드코딩하면 실제 세미나가 바뀔 때 어긋난다.
- FEATURE 02~06 의 제품 목업 내부 세부(학습지 미리보기, 리포트 카드, 웹툰 컷 등)는 이번 라운드에서 헤드라인/배경 토큰까지만 확보했다. 각 목업의 전체 시각 스펙(내부 텍스트·수치·색)은 미수집 — 필요하면 annotation-scene.tsx / exam-paper-scene.tsx / report-scene.tsx / webtoon-scene.tsx / intake-scene.tsx / folder-scene.tsx 전문 정독이 추가로 필요하다.
- 라이브 사이트의 실제 렌더 결과는 WebFetch(HTML→markdown 변환 + 요약 모델)를 거친 것이라, 반응형 분기(모바일/PC)나 JS 이후 상태는 완전히 반영되지 않았을 수 있다. 색·치수 스펙은 전부 repo 코드에서 인용했고 라이브 픽셀 측정은 하지 않았다.
- '25 vs 19 유형' 불일치가 의도된 단계적 마이그레이션(19→25)의 잔여인지, 실수인지는 코드만으로 판단 불가. 다만 랜딩·features·structured-data 는 25, about·llms.txt·guides/faq/articles JSON 은 19 로 갈려 있음은 확정.
