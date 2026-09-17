# 시험 분석 × 클래스 스튜디오 통합 설계 (26-09-01)

> 발단: "내신 시험 분석·학생 관리 등 전반을 클래스 스튜디오에서 진행하고 싶다.
> 이름은 「시험지 분석」 정도로. 플로우를 압도적으로 쉽게."
>
> 방법: 함대 9기(해부 5축 → 독립 설계 3안 → 적대검수 1기 · 1.32M 토큰 · run `wf_b1a5c557-eea`)
> + 적대검수의 하중 큰 주장 4건(C1·C2·M5·M7)은 감독이 소스에서 재검증.
> 이 문서가 **통합 설계의 정본**이다. 세 설계안 원문·검수 전문은 함대 journal 에 있다.

---

## 0. 결론 요약

**스튜디오에 4번째 뷰 「시험 분석」을 신설**하고(지문관리|학습지 조판|시험지 조판|**시험 분석**),
`ExamAnalysis`에 `classId` 소프트레프 1컬럼을 심어, **클래스 로스터 × 파이프라인 매트릭스**
한 화면에서 학생 일괄 등록→답안링크 일괄 발급→일괄 채점 확정→리포트 일괄 생성→공유
일괄 발급을 배치화한다. exam-report **라우트·서버·검수 게이트·과금은 전량 재사용**(물리 이동 0).
허브(`/workbench/exam-report`)는 학원 전체 원장 + 미분류 버킷으로 **병존**한다.

30명 반 기준 실측 산식: **≈300~370클릭 · 화면 전환 ≈62회 → ≈15클릭 · 전환 0~1회.**

세 설계안(최소침습/플로우 우선/IA 우선)이 **독립적으로 같은 골격에 수렴**했고,
차이는 적대검수(critical 3 · major 9 · minor 10)로 정산해 아래에 합성했다.

**와이어는 v2 가 확정 방향**(§3-2b — 스트립·매트릭스·스마트 버튼 1개, 3요소):
분석 여정(등록→검수→답안→리포트)을 상단 **스텝 스트립**이 계기판으로 표시하고,
중앙은 매트릭스 + 「다음 단계」 스마트 버튼뿐이다. 원안 대시보드(§3-2)는
복잡도 과다로 기각·기록 보존.

---

## 0-b. 구현 상태 (26-09-01 당일 착수)

| 단계 | 상태 |
|---|---|
| **v4 대개편(26-09-02)** | **정본 이관 → `docs/exam-analysis-v4-spec.md`** — 사용자 지적 「자체 시험지 카드 클릭 시 오른쪽 백지」의 원인(INTERNAL examLevel 항상 null · 심층 보강이 총평 미생성 · 목록 API 에 다음 단계 재료 0)을 실측 확정하고 ① 목록 2그룹(자체/외부)+미분석 후보 ② 심층 분석 백그라운드+글로우+총평 생성(3.7-flash) ③ 레일 여정 스트립+다음 단계 블록(순수 함수 `next-step.ts` 단일 소스) ④ vision 경로 페이지 청크·페이지 국소 배치·20p ⑤ 5번째 뷰 「학생 관리」를 필살기 함대로 구현. 진행표는 v4 스펙 §6 |
| S2n 인테이크 「페이지 있음」 = 호스트 폭 기반 스택/분할 | **구현+게이트 완료(26-09-03)** — 사용자 재지적 "이건 왜 개선을 안 해"(8페이지 올린 화면). 실측: 스튜디오 중앙 열(패널 664~770px)에서 2컬럼은 **미리보기 230px·레일 380px·CTA 라벨 `등록하고 분석 시작 (...` 절단** — 빈 상태(S2m)와 같은 원인이라 함께 갔어야 했다. 수리: `useContainerNarrow(rootRef, INTAKE_STACK_BREAKPOINT=880)` — **뷰포트가 아니라 패널 자신의 폭**(ResizeObserver+useLayoutEffect, 첫 페인트 전 판정이라 플래시 0)으로 `data-intake-layout=empty|stack|split`. stack(<880) = `PageGrid`(툴바 「등록할 시험지 N페이지·모두 지우기·더 추가」 → 타일 그리드 `auto-fill minmax(104px)` → 선택 페이지 미리보기 h-72) → 시험 정보 폼 → 학생 안내 세로 스크롤 + **하단 고정 CTA(풀폭)**. split(≥880, 허브 1272) = 종전 좌 작업대+핸들+우 레일. 신규 `intake-page-workbench.tsx`(`PageTile` 공용 — 번호·삭제·앞뒤 이동을 레일·그리드가 공유, `PageWorkbench` 는 PC 전용으로 단순화 — 뷰포트 `max-lg:` 모바일 분기 제거, 좁은 뷰포트는 stack 이 담당). parts 407→278. **CTA 과금 pill 은 푸터 `@container` 460px 미만이면 버튼 밖 캡션(`IntakeCreditCaption`)으로 내려간다** — 실측: 허브 기본 레일 420(푸터 400)에서도 `(3페이지)` 라벨이 수 px 절단되던 것까지 잡힘(1차 임계 400 은 가짜 GREEN 직전). 패널 공용 JSX(`studentLaterNote`·`footer`)는 로컬 const 로 추출해 두 레이아웃이 같은 노드를 쓴다(2중 마운트·중복 id 0). 게이트 `.tmp-studio-analysis/probe-intake-stack.mjs` S1~S5: 스튜디오 1600 8장 → stack·타일 8·레일 0·**미리보기 618px(230→618)**·CTA 644px 절단 0·오버플로 0·모두 지우기→empty / 허브 1600 3장 → split·레일 1·미리보기 698·라벨 절단 0·pill 숨김+캡션. `probe-intake-hero.mjs` H4 는 레이아웃 불문(히어로 퇴장+폼+CTA)으로 개정. 스크린샷 `shots-intake/after-studio-1600-stack.png`·`after-hub-1600-split.png` |
| S2m 인테이크 빈 상태 = 단일 컬럼 히어로 | **구현+게이트 완료(26-09-03)** — 사용자 지적 "가로로 찌그러져서 이상해". 실측: 빈 상태도 2컬럼(드롭존 | 레일 가이드+비활 CTA)이라 스튜디오 중앙 열(패널 666px)에서 드롭존 **266×750 세로 막대**, 1280 뷰포트 **150px**(허브는 786×644 라 무증상 — 스튜디오 임베드에서만 터지던 폭 결함). 원인은 레일 `lg:max-w-[50%]` 캡이 아니라 **빈 상태에 레일이 존재한다는 IA 자체**(메타 폼은 페이지가 있어야 의미·CTA 는 비활·가이드만 남음). 수리: `slots.length===0` → `IntakeEmptyHero` 1장(카드 전체 드롭·클릭 타깃, 아이콘·제목·안심 카피·프라이머리 버튼·메타 칩·사용 순서 3단 그리드) / 페이지 생기면 종전 2컬럼(작업대+핸들+레일). 신규 `intake-empty-hero.tsx`(parts 500줄 상한 분리 — 553→407), 구 `UploadDropzone`·`IntakeEmptyGuide`(+container query `<style>`) 삭제. **스텝 그리드는 Tailwind v4 `@container`+`@[520px]:grid-cols-3`** — 스튜디오 중앙 열은 1280 뷰포트에서 434px 라 `sm:` 류 뷰포트 변형은 오판(실측 1280 에서 3단 세로 스택 확인). 드롭 핸들러 3종은 `dropHandlers` 로 공용화. 파일 거부 에러는 레일 푸터가 없으니 히어로가 직접 표기. 계약 셀렉터 `data-intake-panel`·`data-intake-hero`. 게이트 `.tmp-studio-analysis/probe-intake-hero.mjs` H1~H6(빈 상태 레일·핸들 0 / 히어로 폭 ≥560 / 1600 3열·1280 3단 스택 / 파일 추가→2컬럼+메타폼+CTA / 모두 지우기→히어로 복귀 / 오버플로 0) + 전후 스크린샷 `shots-intake/{before,after}-*`. **계기 함정**: 페이지 전역 `input[type=file]`·`aria-label*=패널 폭` 은 스튜디오의 다른 업로더·레일 리사이저를 잡는다 → `[data-intake-panel]` 스코프 필수(1차 실행 가짜 RED 2건) |
| S2l [문항]×[전문] 탭 통합 | **구현+게이트 완료(26-09-03)** — 사용자 지적 "문항 탭이랑 전문 탭 뭐가 다른거임? 중복된거면 없애줘". 실측 판정: **중복 아님, 상보**([문항]=perQuestion AI 분석(난이도·해설·의도·포인트·전략·함정), [전문]=INTERNAL 원문(발문 전문·선지·정답·지문)) — 다만 같은 번호 아코디언 목록이 두 탭에 두 벌 뜨고, 문제를 읽으려면 탭을 오가야 했다. **탭을 없애는 대신 카드 안에서 합친다**: 문항 카드 펼침 = 「문항 원문」 블록(발문+선지+지문 접이) → 분석 블록. INTERNAL 은 [원본] 탭 미렌더(4탭), 비INTERNAL 은 사진 [원본] 탭 생존(5탭). 조인 키 = `number`(=String(orderNum) — `internal-analysis.ts`·`review-questions.ts`·examMap 이 같은 값을 낸다). `RailQuestionSection` 이 `ensureReviewQuestions` 소유(셸 훅 분석당 1회 dedup, 실패 시 자동 재시도 금지 — U5-correctness-1 무한 GET 루프 회피). **행 스파인 = 분석∪원문 합집합**(분석이 아직 없는 문항도 원문만으로 행이 선다 — 구 [전문] 탭 능력 보존, `QuestionCard.analysis` 옵셔널화). `rail-source-section.tsx` 는 사진 전용으로 축소(INTERNAL 분기·`InternalQuestionRow` 삭제). 방어: INTERNAL 인데 activeTab=source 면 questions 로 폴백. 게이트 `.tmp-studio-analysis/probe-tab-merge.mjs` **M1~M7 ALL GREEN**(실 데이터 — INTERNAL 3문항 전부 원문 블록·선지 2·지문 토글 동작, 비INTERNAL 45문항 [원본] 생존, 오버플로 0) + **결함주입 음성테스트 확인**(원문 블록 렌더 차단 시 M3·M4 RED). tsc 0 · eslint 0 |
| S2k 레일 IA = 상단 탭바 | **구현+실측 완료(26-09-02)** — "이것들이 왜 아래에 회색으로 쳐박혀 있는지 모르겠어. 상단 탭으로 올려줘": 접이 섹션 IA(9차 밴드 포함) 폐기 → 헤더 아래 **언더라인 5탭** [총평][학생 N][문항 N][원본(INTERNAL=전문)][정보]. 활성 탭은 콘솔 훅 셸 소유(`activeTab` — sectionOpen 대체, aside·드로어 동기·분석 전환 시 총평 리셋), 계약 셀렉터 `data-rail-tab`. 검수 배너+인라인 에디터는 blocking 이라 전 탭 공통 스크롤러 최상단, **완료 emerald 칩은 [정보] 탭으로 이사**(상시 1줄 점유 제거). 탭 전환 시 인스턴스별 자기 스크롤러 scrollTop=0(scrollIntoView 금지 준수). 정보 탭 = 완료 칩+메타 dl+문항 구성 칩. 강등 상태(ANALYZING/로딩/에러/DRAFT·FAILED 폴백)는 탭바 미렌더. 프로브 탭 셀렉터 개정 — 전 게이트 초록·전 폭 오버플로 0, 360px 드로어에서 5탭 수납 육안 확인(TB1~6) |
| S2j 탈출구 전면 철거 + 검수·채점 인라인화 | **구현+실측 완료(26-09-02)** — 사용자 재재지시 "저 오른쪽 섹션 내에서 다 해결": 새 탭 위임 전부 철거([전체 워크스페이스]·검수하기↗·채점 열기↗·크게 보기↗·로스터 등록↗·시험지 열기↗ — 유일 잔존 새 탭 = 원본 사진 클릭(파일 열람)). 대체 인라인 3종: ① **RailReviewSection** — 게이트 배너 [검수하기] 토글 → 미확인 문항 행 편집기(MC 5선지/서답형 모범답안·배점 입력) + 행별 [확인]·[전체 확인 N](2단, 수정 중 행 있으면 잠금 — 미저장 값 봉인 사고 차단). 변이 = `updateExamMap`(서버가 변경 문항 확인 자동해제+학생 점수 재집계) → `setMapQuestionConfirmed`(번호 배열 CAS). **CAS 버전 체인 = versionRef 로컬 +1 추적**(연속 확인이 refetch 대기 없이 감) ② **정오 타일 편집기** — 타일 탭 → 4상태 토글+MC 학생답(정오 자동 파생 deriveStatusFromChoice)+부분점수, [저장]/[채점 확정](2단) = `updateStudentGrading`(서버 재정규화·재채점). **미채점(responses 0)은 examMap 시드로 첫 채점 가능**. INTERNAL 은 편집 잠금(브리지 자동 채점 정본)·GENERATING 중 잠금 ③ **신규 로스터 등록 폼**(이름+학년 → createRosterStudentForExam, 학생코드 발급 토스트). 푸터는 상태 프라이머리 없으면 미렌더. 프로브 게이트 개정: 「탈출구 0」(a[target=_blank]:not(:has(img)) = 0) + 인라인 채점 편집기 검사 — 전부 초록·오버플로 0. 신규 표면 3종 스크린샷 육안 확인(NE1~3 — 수원중 0/35 검수 패널 실렌더·행 36) |
| S2i 섹션 경계 명확화 | **구현+실측 완료(26-09-02)** — "각 섹션 간의 경계가 명확해야 해": 여백 분리(space-y-5) 폐기 → **그룹 리스트 문법** = 섹션 헤더 전폭 밴드(`h-8 bg-slate-100 px-3`, 호버 slate-200, 카운트 칩은 흰 배경+링) + 스크롤러 `divide-y divide-slate-100` 풀블리드 헤어라인, 콘텐츠는 밴드 아래 흰 지대(`px-3 pb-4 pt-2.5`). 게이트 배너·로딩·에러·메타 폴백은 자체 px-3 py-3 지대. **밴드 slate-50 1차안은 흰 바탕에서 거의 안 읽혀 기각(실측)** — slate-100 이 정답이고 2급 블록(slate-50)과의 층위 분리도 겸한다. 프로브 게이트 전부 초록·오버플로 0. 촬영 함정: 900px 는 드로어 개방 전 레일이 CSS 비가시라 「카드 클릭(무대기) → 드로어 → 콘텐츠 waitFor」 순서 필수 |
| S2h 전 표면 미학 재건 | **구현+18상태 육안 검수 완료(26-09-01 8차, 필살기 8기 `wf_f964897b-02d` 언어1→비평6→합성1)** — 정본 「디자인 언어 v1」: 타이포 5단(10.5/11/12/13/15 — bold 전면 폐지·semibold 상한), 간격 4배수 사다리(섹션 space-y-5·블록 2·행 1), **카드 2단 위계**(1급 만지는 개체=white+slate-200+shadow / 2급 읽는 영역=slate-50+slate-100), **투명도 서픽스 전면 금지**(유일 예외 뱃지 ring/60), **violet 퇴출 — 난이도 신호등 emerald→blue→amber→rose**, 상태 뱃지 rounded-full+ring 단일 문법, 버튼 3단(프라이머리 h-8 blue/세컨더리 중립/텍스트링크 underline-offset), 섹션 헤더 = 28px 히트존+호버 배경+카운트 칩. 구조 처방 6(접이 헤더·빈상태 디스크·학생 행+아코디언 한 개체화(rounded-t/b 연결)·리포트 sticky 헤더 바(부유 칩 철거)·문항 메타 3종 그룹박스·원본 페이지 번호 오버레이). 학생 카드: emerald 버튼 배경 금지→중립 세컨더리, danger idle 을 rose 정직 표기, 미채점 「— / —점」 철거(감독 독자 발견). **채집 하네스 `probe-aesthetic.mjs` — 18상태 레일 클립 스크린샷, 감독이 18장 전수 육안 + 유일 실결함(소수점 배점 「13.4점」 w-8 칩 2줄 꺾임 → w-11+nowrap) 수리·재실측**. 기능 프로브 전 게이트 초록·전 폭 오버플로 0 재확인. **함정: dev 서버가 세션 중 죽을 수 있다 — 재기동 후 첫 goto 는 150s·상세 API 컴파일로 로딩 스냅샷이 잡히므로 콘텐츠 텍스트 waitFor 후 촬영** |
| S2g 총평 집계 재설계 | **구현+시각검수 완료(26-09-01 7차, 사용자 격노 수리)** — 허브 ExamSynthesisPanel 이식분 **철회**: 그쪽 유형 분포가 「라벨 ··· N문항 · 0점」 맨몸 텍스트 행 나열이라 유형 26개 시험에서 위계 0 인 ~700px 벽(실측 스크린샷 — "이건 아니지"). 신규 `analysis-rail/rail-synthesis.tsx`: 난이도=세그먼트 바 1줄+도트 통계 1줄(2×2 그리드 폐기) · 유형 분포=**문항수 내림차순 비례 바 랭킹, 상위 7개+「N개 더 보기」 접이, 0점 표기 생략**(전 행 0점이 노이즈의 주범 — 배점 있는 유형만 amber 칩), 행 title 에 문항 번호 전체. 총평 섹션이 700px→~200px, 360px 드로어 1뷰포트에 게이트~범위추정 전부 수납. **교훈: 허브 컴포넌트 「그대로 import」 판정은 폭만 보면 안 된다 — 데이터 규모(유형 26개)가 조판을 깨는 축** |
| S2f 레일 「분석 결과 콘솔」 대개편 | **구현+시각검수 완료(26-09-01 6차, 필살기 7기 `wf_2986fba7-5c2` 판독4→설계1→적대검수2)** — 사용자 재지시 3축: ①레일 버튼 모달 금지 ②분석 결과·시험지 원본 인라인 ③학생 행=인라인 토글(이동 0). **StudioExamReportModal 철거**(파일 삭제, 열람·처리=레일 인라인, 무거운 편집=새 탭 `target=_blank` 위임 — 새 탭은 페이지 유지라 지시 무위반). 섹션 6종: 게이트(미완시 amber+검수하기↗) → 총평(ExamSynthesisPanel 집계 재사용+overview `line-clamp-4` 접이 — V2-M2) → 학생(아코디언 동시1명·스크롤 앵커 직접 보정·인라인 로스터 추가) → 문항 분석(난이도 버킷 필터 칩 — 45규모 V2-M3) → 원본(사진=서명 URL 클릭 새 탭 / INTERNAL=문항 전문 강등) → 메타. 학생 아코디언: 점수+정오 타일(STATUS_STYLE 단일 소스, 2층 타일 — 다글자 번호 V2-M4)+리포트 생성/재생성(RailConfirmButton 2단, 5cr — CREDIT_COSTS 실측 정본)+인라인 리포트 뷰(ReportDocument `suppressPrintStyles` additive — @page 이중 선언 V1-m2)+공유(끄기=토큰 rotate라 2단 확인 M-2)+답안 링크(disable 후 강제 재페치 — version 증가 함정)+삭제. **급소 수리 4**: ① `use-analysis-detail` keep-previous+`patchDetail`(C-1/C-2 — nonce bump 백지 플래시 근절) ② `useAnalysisConsole` 셸 1인스턴스(학생 캐시 in-flight dedup·원본 서명 URL·문항 전문 — aside/드로어 2중 마운트 페치 0) ③ 자동 수렴 2채널(행 참조 교체 bump + visibilitychange 5s 스로틀 — 모달 닫힘 nonce 대체 M-3/M6) ④ **서버 가드 `assertStudentAddAllowed`**(students.ts 추가 3경로: INTERNAL 거부 + 게이트 재검증 — C2 그랜드파더링 관통·C3 중복 행이 실측 미구현이던 것을 이번 범위 편입). 신규 `analysis-rail/` 5파일. 프로브 콘솔 게이트 5종(모달 0·새탭 링크·인라인 아코디언 URL 불변·필터 칩·원본 이미지) + 전 폭 오버플로 0 — 스크린샷 감독 육안 확인. **폭 정본: 레일=리사이저블 320~960 기본 360(420 아님) — 콘텐츠 플로어 296px 기준 설계** |
| S2e 툴바 통일+플랫 | **구현+시각검수 완료(26-09-01 5차)** — 지문관리 폴더 툴바 행과 자구 동일 규격(AnalysesBoard `compactToolbar`+`toolbarAction` additive, 큰 헤더·BETA·설명 폐기, 단일 카드), 회색 캔버스(bg-[#F4F6F9]) 철거 → **흰 바탕 p-3 + rounded border 패널**(경계는 유지 — "이것처럼 경계는 있어야지" 후속 확정, 지문관리 목록 패널 문법). 레일 에러 [다시 시도](`onRetryDetail`). 프로브 계약 셀렉터 `data-studio-analysis-board`(h2 검사가 통일로 공허해진 전례). **함정: dev 실행 중 `next build` 금지 — `.next` 공유 워커 크래시로 전 API 500 + RSC 고착(복구=dev 재시작)** |
| S2d 인테이크 배타 레이아웃 | **구현+시각검수 완료(26-09-01 4차)** — ① 등록 중 분석 현황 보드 숨김(display 토글 유지 마운트 — 업로드·메타 보존), 인테이크 프레임 고정 560px → flex-1 판 전체(빈 공간·이중 스크롤 해소), 복귀 버튼 「분석 현황으로」 ② IntakeUploadPanel aside 에 `lg:max-w-[50%]` — 절대 px 영속 폭(420)이 좁은 호스트에서 좌 드롭존을 짓누르던 좌우 밸런스 붕괴를 컨테이너 절반 상한으로 구조 보장(허브 무변화). 프로브: 보드 숨김/복귀·1600/1100 인테이크 오버플로 0. **프로브 교훈**: 클래스 픽 상호작용은 공지 팝업·컴파일 타이밍에 취약 → `?class=&view=` URL 직행이 정본(R1 복원 검증 겸용), dev 재컴파일은 라우트 스켈레톤 60s 대기 필요 |
| S2c 액션 전량 레일 이사 | **구현+시각검수 완료(26-09-01 3차)** — 카드 하단 액션 행(학생 추가·시험지 열기·다시 분석·확대) 통째 숨김(`hideCardActions` additive — 카드=순수 선택 리스트, 제목 행 삭제 아이콘만 잔존). 레일 하단 = 상태별 프라이머리(FAILED 다시 분석·DRAFT 이어서 분석 — fireAnalyzeRequest 보드 미러) + [워크스페이스 열기](프라이머리/강등) + [학생 추가]·[시험지 열기 INTERNAL] 2열 그리드. 학생 섹션 중복 링크 제거(같은 동작 1곳 원칙). 프로브 게이트 2종 추가(카드 액션 잔존 0·INTERNAL 레일 시험지 열기) 전부 초록 |
| S2b 카드→레일 개편 | **구현+시각검수 완료(26-09-01 2차)** — 카드 클릭=**우측 레일 상세**(모달 아님, 사용자 지시), 워크스페이스 모달은 확대 아이콘·학생 추가·레일 CTA 전용. 신규: `analysis-detail-rail`(상태·시험정보·검수 게이트 k/N·문항구성·학생 목록·하단 CTA — getMapGateStatus 단일 소스) + `use-analysis-detail`(셸 1인스턴스 페치 — aside·드로어 2중 페치 차단) + 셸 `analysisRailActive`(rail 사슬 **맨 앞**, M6 이행)·선택/모달 셸 소유·클래스 전환 청산 합류. 카드: `hideThumbnail`(스튜디오 썸네일 숨김 — 사용자 지시)+상태 아이콘 칩 승계+`onExpand` 분리+선택 하이라이트+액션 flex-wrap(절단 0). M1 수리: `studentFromHref` 4단 관통(레일·모달 학생 딥링크 ?from= 복귀축). 드로어 버튼 라벨 분석 뷰 문맥화·레일 X <xl 숨김(드로어 X 중복). **시각 검수 실측**: 프로브 `.tmp-studio-analysis/probe-visual.mjs` — 1600/1280/1100/900px 오버플로 0 · 카드 클릭=레일(모달 미발화) · reload 복원 · 드로어 착지 · 지문추가 새 위치 · 조판 필 무건수, 스크린샷 8종 감독 육안 확인 |
| S2 뷰 골격 v1 | **구현 완료·사용자 테스트 대기** — 4번째 필 「시험 분석」(플래그 양쪽 게이트) · `?view=analysis` 복원 · analysis-pane(인테이크 접이+보드+낙관행) · StudioExamReportModal(C1 회피 자체 오버레이+Context export) · AnalysesBoard `onOpenRow`+`onAddStudent` · workspace-client `initialStep` · 폴 `enabled` 게이트. 스펙 §3.10.28 채번. |
| 동반 UI 지시 2건 | 시험지 조판 필 **건수 라벨 제거**(툴팁 유지) · 「지문 추가」 버튼을 스위처 sticky 클러스터 → **지문 목록 툴바(정렬·검색 옆)** 이사(`PassageCardGrid.toolbarAction` additive + `AddPassageLauncher`, `data-tour="add-passage"` 동반 이주 — ch2-add 투어 앵커 무사) |
| 결정 2(자구) | **해소** — 사용자가 "시험 분석 탭"으로 지칭(26-09-01). 기존 표면 개칭(S0)은 별도 미착수. |
| S1 데이터 지층(classId) | 미착수 — **prod DB ALTER 선행 필요라 사용자 승인 대상** |
| S3~S5 (매트릭스·일괄·여정 스트립) | 미착수 — S1 이후 |
| 결정 1(일괄 채점 정책) | 미해소 — S4 착수 전까지 필요 |

v1 화면 계약: 분석 뷰 = 학원 전체 목록(라벨 고지). 클래스 필터·매트릭스는 S1 뒤.
검증: tsc 0 에러 · next build(§ 하단 게이트 절) · **런타임 미검증 — 실사용 테스트 필요**.
G15b 4필 재실측·기존 프로브 5계열 재주행도 미실행(출하 전 게이트로 잔존).

---

## 1. 실측 배경 — 왜 이 설계인가

1. **exam-report 는 클래스와 무연결이다.** `ExamAnalysis` 에 classId 가 없다
   ([schema.prisma:871-905](../prisma/schema.prisma#L871)) — 학원 전역 객체.
   학생은 `ExamReportStudent.studentId` 소프트레프(:933, 인덱스 :945)로만 로스터에 닿는다.
2. **현행 플로우는 학생 단위 반복이다.** 리포트 1건 = 7단계(허브→팝업→학생 전체페이지→
   답안수집→채점→분석→AI리포트→사이드패널 공유→수동 전달). 일괄 공유 없음.
   30명 = 학생 등록 ≈90클릭 + 채점 확정 왕복 ≈60회 전환 + 공유 ≈60클릭.
   (전수 실측: `docs/student-report-access-audit-2609.md`)
3. **스튜디오는 이미 클래스 문맥을 소유한다.** 좌 레일이 클래스·학생 선택을 갖고
   (`?class=<id>` 서버 복원), 중앙 뷰 축(`StudioAssetView`)은 union+satisfies 로
   확장 지점이 컴파일 타임에 방어된다
   ([source-switcher.tsx:89](../src/app/(director)/director/studio/workbench/source-switcher.tsx#L89) ·
   [studio-location.ts:41-45](../src/app/(director)/director/studio/workbench/studio-location.ts#L41)).
4. **기능 흡수의 하우스 패턴이 확립돼 있다.** 학습지 빌더 인-플로우 이식(additive
   props), E21/E24 조판 흡수 — 기존 컴포넌트에 옵셔널 프롭만 더하고 미공급 시
   기존 동작 그대로.

---

## 2. 네이밍 — 「시험 분석」 (「시험지 분석」 기각)

사용자 제안은 "시험지 분석"이었으나 실측 3근거로 **「시험 분석」**을 권고한다:

1. **필 스트립 혼동**: 스튜디오 필에 「시험지 조판」이 이미 있다. 「시험지 분석」이면
   두 필이 "시험지 X"로 3글자 접두를 공유해 스캔 시 뒤 한 단어로만 갈린다.
2. **과금 라벨 수렴**: 크레딧 내역 라벨 "시험지 문항 분석"([credit-costs.ts:68](../src/lib/credit-costs.ts#L68))과
   1글자 차이로 수렴 — 크레딧 내역에서 구분 모호.
3. **선존 라벨 수렴(코드가 이미 이 이름을 쓴다)**: workspace-modal aria-label
   "시험 분석 워크스페이스", analysis-step "시험 분석 시작" CTA, 학생 허브 탭 "시험 분석"
   — 개칭이 아니라 **정합화**다.

의미 체계: 뷰 축 = 「대상+동사」 2어절, **조판=만들기 / 분석=결과 읽기**.

개칭 표면(한 커밋 스윕): src 7곳 —
[task-queue/constants.ts:8](../src/components/workbench/task-queue/constants.ts#L8) ·
[nav-config.ts](../src/components/layout/nav-config.ts) ·
[hub-client.tsx](../src/components/exam-report/hub/hub-client.tsx) ·
[exam-tab.tsx:212](../src/components/students/hub/exam-tab/exam-tab.tsx#L212) ·
[reports-tab.tsx:74,81](../src/components/students/hub/reports-tab.tsx#L74) + 주석 3곳.
docs 6파일(적대검수 m2 실측 — incidents 등 **역사적 사고 문서는 개칭 제외**,
grep 0건 게이트는 src+현행 스펙 문서로 한정). 과금 라벨 2종은 무접촉.

> ⚠ 최종 자구는 사용자 확정 대상(§9 결정 2). "시험지 분석" 강행 시 크레딧 내역
> 병기 서식 재검토가 조건.

---

## 3. 권고안 UI

### 3-1. 뷰 배선 (하우스 절차 전량)

- `StudioAssetView` union 에 `"analysis"` 추가 → `STUDIO_ASSET_VIEWS` satisfies →
  필 4번째(말미) + `viewCounts.analysis`(Record 키라 누락=컴파일 에러).
- URL: `?class=<id>&view=analysis` — 파서/기록이 같은 모듈이라 서버 복원·주소창
  미러 자동 승계. 불변식 「클래스 null → passages」 유지 = **분석 뷰는 클래스 필수**.
- **분석 뷰 무픽 원칙**(안3): 조판류 open 플래그·픽 축·파괴 가드·stepAdvanced 기여·
  print-root 전부 **0** — E24 개방 불변식·인쇄 파이프라인 의무에서 구조적 면제.
- 플래그: 필 렌더 + `parseStudioLocation` **양쪽**을 `ENABLE_EXAM_DEPLOYMENT` 게이트
  (허브 nav 와 운명 공동체 — 비대칭이면 진입로 없는 표면이 남는다. 적대검수 M9).

### 3-2. 와이어 (view=analysis, ≥xl)

```
[좌 레일: 클래스 트리 — 무변경]   [필: 지문관리|학습지 조판|시험지 조판|시험 분석]
[스텝 스트립: 무변경 — 분석은 조판 여정 밖]
┌ 중앙 StudioAnalysisPane ──────────────────────────┐┌ 우 AnalysisActionRail ─┐
│ ▸ 시험지 등록 (접이 — IntakeUploadPanel 재사용,     ││ 퍼널 카운터            │
│   classId 자동 스탬프·클래스 필드 자체가 없음)      ││  학생 n/N → 답안 12/30 │
│ [이 클래스 n] [전체 학원 m] 탭                      ││  → 채점 8 → 리포트 5   │
│ ┌ AnalysesBoard 재사용(+onOpenRow·+onAddStudent) ┐ ││ 게이트 칩 「검수 k/22」 │
│ │ 카드: 뱃지·게이트칩 k/22·INTERNAL·학생 n        │ ││ 일괄 CTA 5종 미러      │
│ └ 카드 클릭 → StudioExamReportModal ─────────────┘ │└────────────────────────┘
│ ▼ 선택 분석 · 로스터 매트릭스                       │  <xl 드로어: 고지 카드
│  [반 전원 담기(게이트 open 후)] [답안링크 일괄 발급] │
│  [채점 일괄 확정 n명] [리포트 일괄 생성 n×5cr]      │
│  [공유 일괄 발급·전체 복사]                          │
│  행: 이름│답안 ●제출/○대기[복사]│채점 ✓/[딥링크]     │
│      │리포트 ✓[보기][공유]/[생성 5cr]/실패[재시도]   │
└─────────────────────────────────────────────────────┘
```

> ⚠ **위 원안 와이어는 기각됐다(26-09-01 당일)** — 사용자 지적 "페이지가 너무
> 복잡해지지 않을까"가 타당: 인테이크 상시 + 탭 + 보드 + 매트릭스 + 우측 퍼널
> 레일 + 일괄 버튼 5개 상시 = 대시보드지 도구가 아니다. 확정 방향은 §3-2b.
> 원안은 삭제하지 않고 남긴다 — 일괄 5액션·매트릭스 열 구성·재사용 계약은
> §3-2b 에 그대로 승계되며, 달라진 것은 **노출 방식**뿐이다.

### 3-2b. 확정 와이어 — 미니멀 파이프라인 + 여정 스트립 (v2)

> 재설계 통찰 2개: ① 일괄 5액션은 병렬이 아니라 **파이프라인**(순서 고정 —
> 퍼널 상태에서 다음 할 일이 유일하게 도출) → 버튼 5개 상시 노출 불요.
> ② 상단 헤더의 **스텝 스트립**(`대상 › 자료 › 조판`)이 스튜디오의 여정
> 계기판인데, 분석 여정은 조판보다 더 선형적이라 이 계기판이 더 잘 어울린다
> (사용자 제안 채택).

```
[헤더 — 뷰에 따라 스트립이 여정을 갈아입는다]
 조판 뷰들: ① 대상 ✓ 2학년·2명 › ② 자료 ✓ › ③ 조판              (현행 무접촉)
 시험 분석: ① 대상 ✓ 2학년·2명 › ② 시험지 ✓ 6월모평 › ③ 검수 22/22 › ④ 답안 12/30 › ⑤ 리포트 5/30
   ①공유(레일 재진입 §3.10.12 그대로) · ②칩=시험지 선택 드롭다운/등록 진입
   ③칩 클릭=검수 모달 · ④칩 클릭=미제출 하이라이트 · 시각 문법(체크/볼드/muted) 재사용

[좌 레일: 클래스 트리 — 무변경]   [필: 지문관리|학습지 조판|시험지 조판|시험 분석]
┌ 중앙 StudioAnalysisPane ────────────────────────────────────────┐
│ 로스터 매트릭스 (화면의 전부 — 열 구성은 §3-2 원안 승계)          │
│  김주연   답안 ●제출   채점 ✓   리포트 ✓ [보기][공유]             │
│  ㄴㅇㄹ   답안 ○대기 [링크복사]  —        —                      │
│─────────────────────────────────────────────────────────────────│
│         [ 다음: 답안 링크 30명에게 발급 ]                    ⋯   │
│           ↑ 스마트 버튼 1개 — 퍼널 상태에서 다음 액션 유일 도출    │
│             나머지 일괄 액션·재시도는 ⋯ 메뉴 뒤                   │
└─────────────────────────────────────────────────────────────────┘
분석 0건: 빈 상태 + [+ 시험지 등록] — IntakeUploadPanel 은 눌렀을 때만 전개
```

**구성요소 3개**(스트립·매트릭스·스마트 버튼)로 압축 — 시험 분석 뷰는 현행
허브보다 단순하다. **원안 대비 삭제**: 우측 AnalysisActionRail(퍼널은 스트립
담당 — ≥xl 우측 레일은 분석 뷰 미마운트, M6 의 rail 분기 자체가 소멸) ·
[이 클래스|전체 학원] 탭(전체는 허브 몫 — §6 IA) · 인테이크 상시 패널 ·
AnalysesBoard 상시 노출(②칩 드롭다운이 선택기 — 클래스당 활성 분석은 보통
1~2건. 50건 목록·검색·필터는 허브가 정본. 단 AnalysesBoard 재사용 자체는
드롭다운 전개면에서 유지 가능 — 구현 시 판단).

**여정 스트립 구현 계약**([step-strip.tsx](../src/app/(director)/director/studio/workbench/step-strip.tsx) 실측 — 151줄 순수 표시 컴포넌트, 상태 판정은 오케스트레이터 props 소유):
1. 기존 스트립 개조 금지 — `AnalysisStepStrip` **형제 컴포넌트**를 같은 헤더
   슬롯에 뷰 조건 마운트. 조판 `stepAdvanced` 무접촉(함정 A10). 라벨 분기
   전례는 파일 내 §M 스위치(「배포」→「조판」)가 이미 있다.
2. `StepChip` export 재사용 — 완료(파랑 체크)/진행(테두리 볼드)/대기(muted)
   시각 문법 단일 소스. memo 원시 props 방어선은 형제 컴포넌트라 무접촉.
3. `data-tour="step-strip"` 앵커는 두 변형 모두 유지(E26 투어·프로브 보호).
   칩 5개 폭은 md~lg 요약 스팬 숨김 + 루트 overflow-hidden 기존 규칙이 방어 —
   단 헤더 스트립 축약 재실측을 S2 게이트에 추가.
4. 스트립·스마트 버튼·매트릭스는 **같은 class-detail 퍼널 데이터**에서 파생 —
   계기판과 버튼이 어긋날 수 없다.
5. 우측 「지문 현황」 드로어 버튼(<xl)은 기존 `rightPanelLabel` 파생으로
   「분석 현황」 자연 전환.

**기각 대안 기록**: (A) 허브만 강화(스튜디오 무접촉 — classId+매트릭스+일괄
액션을 허브에) — 클릭 개선 ~80% 확보 가능하나 전환 마찰 잔존. B 채택 시에도
매트릭스·일괄 액션 코드는 전부 이사 가능해 A 선행이 낭비는 아니었음. (C) §3-2
원안 대시보드 — 동시 노출량 과다로 기각.

### 3-3. 상세 모달 — **스튜디오 소유 오버레이** (WorkspaceModal 본체 금지)

`WorkspaceModal`의 close 는 `closeHref ? router.replace : router.back()`
([workspace-modal.tsx:44-47](../src/components/exam-report/workspace-modal.tsx#L44), **감독 재검증 완료**) —
스튜디오에서 열면 back()=스튜디오 이전 페이지로 이탈, replace=RSC 왕복으로 조판
상태 위험. **적대검수 C1**. → 신규 `StudioExamReportModal`: 자체 fixed 오버레이 +
로컬 setState 닫기(닫힘=언마운트), `WorkspaceModalContext.Provider` 주입으로 기존
X 버튼 재사용(Context export 1줄 필요 — 현재 module-private, m1).
안에는 `ExamReportWorkspaceClient embedded` 직렌더 — 검수 22/22·문항분석·학생관리
탭 원형 그대로. 인터셉팅 라우트 불경유.

### 3-4. 재사용 vs 신규 (파일 단위)

| 구분 | 대상 |
|---|---|
| 재사용(무수정) | IntakeUploadPanel+useIntakeUpload · ExamReportWorkspaceClient(embedded) · board-shared 전부 · getMapGateStatus · CreditCostChip · AddStudentDialog(예외 1명) · assertClassBelongsToAcademy |
| 재사용(additive prop) | AnalysesBoard(+`onOpenRow` **+`onAddStudent`** — 학생추가 CTA 가 별개 핸들러 [analyses-board.tsx:144](../src/components/exam-report/hub/analyses-board.tsx#L144)라 하나로는 이탈 못 막음, M2) · ExamReportWorkspaceClient(+`studentFromHref` — 모달 안 학생 행 클릭이 from 없는 완전 이탈, M1) · useExamReportActivity(+classId, +enabled — 폴러 1개 규칙, m8) |
| 신규 5파일 | `src/components/studio/analysis/{analysis-pane, analysis-roster-matrix, analysis-action-rail, studio-exam-report-modal}.tsx` · `src/actions/exam-report/bulk.ts` |
| 수정 | source-switcher · studio-location · studio-home-client(`analysisRailActive`는 rail **최상위** 우선순위 — passagesPanelBody 앞이면 픽 보유 시 도달 불가 분기, M6) · library-pane(**listActive 음성 판정 유지** — 화이트리스트 전환은 E24 §1⑤와 정면 충돌, M4) · analyses/route.ts · crud.ts · report-bridge.ts · schema |
| **재사용 금지** | HubClient(-m-6 셸·이탈구 없음) · StudentsRosterClient(BASE_PATH 결합) · addExamStudents(고아 재생산) · **WorkspaceModal 본체**(C1) |

### 3-5. 컴팩트 임계 — 재실측이 아니라 **확정 수정 항목**

`compact = stripWidth < 640`, 3필 자연 폭 실측 619.92px
([source-switcher.tsx:343-370](../src/app/(director)/director/studio/workbench/source-switcher.tsx#L343), **감독 재검증 완료**).
4번째 필(≈110~140px) 추가 시 자연 폭 ≈740~760 → 640~750 구간 전체가 풀모드+가로
오버플로(구 임계 560 결함과 동일 증상). **임계 ≈780 인상**(안전측 — 주석의 "임계가
크면 컴팩트로 더 일찍 떨어질 뿐 잘림 없음") + G15b 4필 재실측을 S2 출하 게이트로.

---

## 4. 데이터 변경 — classId 소프트레프 1컬럼

1. **schema**: `ExamAnalysis` += `classId String?`(soft-ref — createdById/sourceExamId
   전례, FK 금지 관례) + `@@index([academyId, classId])`.
2. **마이그레이션**: `prisma/migrations-manual/` surgical SQL(`migrate deploy`/`db push` 금지):
   `ALTER TABLE exam_analyses ADD COLUMN IF NOT EXISTS "classId" text;` + CREATE INDEX.
   **prod ALTER 선행 → 코드 배포** 순서.
3. **목록 API**([analyses/route.ts](../src/app/api/exam-report/analyses/route.ts)):
   select 양쪽(본선+강등 재조회)에 classId + `?classId=` 서버 where(take 50 캡이라
   클라 필터 금지) + `isClassIdUnavailable` 강등 게이트(isSourceExamIdUnavailable :25-34 복제).
   **classId 필터 요청이 강등되면 무필터 폴백 금지** — `{rows:[], degraded}` 반환
   (타 클래스 행 누출 차단, 안2 고유 자구). 주의: 현재 `GET()`은 request 인자
   자체가 없어(:53) 시그니처 변경 포함(m9).
   매트릭스용 `?view=class-detail` 슬림 응답 신설: 학생 행 스칼라만
   ({studentId, answerSubmittedAt, gradingConfirmed, reportStatus, shareEnabled, version})
   + **서버 계산 gate 필드**({confirmed,total,open,grandfathered}) — 클라는 보드 행만으로
   게이트 칩을 계산할 수 없고(structure/analysis 는 egress 금지 관례) 상세 API
   카드별 폴링은 egress 폭탄(M3).
4. **액션**: `createExamAnalysis` += input.classId + assertClassBelongsToAcademy ·
   `syncInternalAnalysisForExam`(report-bridge)의 exam select+create/update 에 classId
   복사(자체 시험지 분석 자동 귀속) · `updateExamMeta` += classId(미분류→클래스 지정).
5. **백필 1회**(INTERNAL 2-hop): `UPDATE exam_analyses ea SET "classId"=e."classId"
   FROM exams e WHERE ea."sourceExamId"=e.id AND ea."classId" IS NULL AND e."classId"
   IS NOT NULL;` — 사진 분석 구행은 백필 불가 = 미분류 버킷(허브에서만).
6. **후속 후보**: `(exam_analysis_id, student_id)` 부분 유니크
   (`WHERE student_id IS NOT NULL`) — 기존 중복 행 사전 감사 후.

### 4-1. 일괄 액션 4종 (`src/actions/exam-report/bulk.ts`)

| 액션 | 핵심 계약 (적대검수 반영) |
|---|---|
| `attachClassRosterToAnalysis` | ENROLLED+ACTIVE 술어(assignments.ts:162-167 복사) → 기존 studentId 제외 → $transaction 재검사 + createManyAndReturn. **서버 거부 2건**: ① 게이트 — `mapConfirmedNumbers` 비어 있으면 거부(**C2**: 승계 규칙 [map-gate.ts:46-49](../src/lib/exam-report/map-gate.ts#L46)가 `studentCount>0`이면 통과라, 일괄 등록이 0/22 검수를 22/22✓로 둔갑시킴 — **감독 재검증 완료**. UI disabled 만으론 부족) ② INTERNAL(sourceExamId 有) 분석 거부(**C3**: 미제출 학생 수동 행 + 브리지 행 이중 생성 → trend 이중 계상) |
| `enableAnswerLinksBulk` | 기존 단건 토큰 발급 멱등 로직(재사용 실측 확인) 서버 루프 — P2002 재시도라 단일 tx 원자성은 불가, **부분 성공 반환** 설계(m4). [이름, URL] 배열 → 클립보드 표 복사 |
| `confirmGradingBulk` | {studentId, **version**}[] 형상 + 서버 재검증(제출 존재 ∧ 미판정 0). ⚠ **정책 자체가 사용자 결정 대상**(§9 결정 1) |
| `enableSharesBulk` | **reportStatus GENERATED 행만**(M8: /r 은 envelope 파스 실패 시 만료 화면 — 미생성 학생 공유를 켜면 죽은 링크 배포) |

리포트 일괄 생성은 **신규 API 0** — 기존 `POST /students/[sid]/generate`(5cr, CAS,
실패 환불) 클라 팬아웃(동시 2~3) + n×5cr 총액 확인 다이얼로그 + 402 즉시 중단·잔여
명단 배너 + GENERATED 스킵(이중과금 방지).

---

## 5. 플로우 before / after (30명·22문항·/a 자가제출 기준)

| 구간 | Before(허브) | After(스튜디오) |
|---|---|---|
| 진입 | 사이드바→허브 1전환 | 필 1클릭(클래스 이미 선택) |
| 인테이크 | 3클릭(클래스 문맥 없음) | 3클릭(classId 자동) |
| 검수 게이트 22/22 | 3(지름길)~22클릭 | **동일**(원버튼 금지 원칙 존중 — 재설계 안 함) |
| 학생 등록 | ≈90클릭(다이얼로그×30) | **1클릭**(반 전원 담기) |
| 답안 링크 배포 | 60클릭+개별 전달 30회 | **2클릭**+단체방 1회 |
| 채점 확정 | ≈90클릭·전환 60회 | **1클릭**(+서답형 k명만 딥링크 왕복 2k) |
| 리포트 생성 | 30클릭 | **2클릭**(150cr 총액 확인) |
| 공유 | 60클릭 | **2클릭** |
| **합계** | **≈300~370클릭 · 전환 ≈62** | **≈15클릭 · 전환 0~1(+2k)** |

7단계 학생 단위 체인 → 「등록→게이트→일괄 5버튼」 3구간. **반복 단위가 학생→반으로 승격.**
잔여 개별 작업은 서답형 채점뿐(본질적 per-student — `?from=` 복귀로 왕복 비용만 최소화).

---

## 6. IA — 허브 병존 (리다이렉트 금지)

- **스튜디오** = 클래스 단위 일상 운영면. **허브** = 학원 전체 원장 + 미분류(classId
  null) 버킷 — 리다이렉트 불가(revalidatePath 27곳 + 인터셉팅 모달 인프라 + 미분류
  행의 집이 전부 거기).
- 혼란 방지 3장치: ① 교차 링크 단방향 2개(허브 행에 "스튜디오에서 열기" 칩 ↔
  스튜디오 헤더에 "학원 전체·미분류 보기") ② 뱃지·게이트 판정은 board-shared/
  getMapGateStatus 단일 소스 import 만 ③ **배치 액션은 허브에 복제하지 않는다.**
- `/students`(ERP 깊이: 수납·반편성)는 별도 트랙 병존. 학생 관리 흡수는 §7 S6.

---

## 7. 출하 계획 (각 단계 독립 출하 가능)

| 단계 | 내용 | 크기 |
|---|---|---|
| **S0** 개칭 | 「시험 분석」 src 7곳 + 현행 스펙 docs(사고 문서 제외) + grep 게이트 | 반나절 |
| **S1** 데이터 지층 | prod ALTER 선행 → schema → 목록 API(+강등 게이트·`{rows:[],degraded}`) → createExamAnalysis → report-bridge → INTERNAL 백필. **UI 0 — 유일하게 숨은 의존 없음이 실측 확인된 단계** | 1일 |
| **S2** 뷰 골격 | union+필+모달(안3 방식)+보드 재사용 read-only. 게이트: 컴팩트 임계 780 인상+G15b 재실측 · 프로브 5계열(e24/e27/e28/e31~34/sweep) 재주행 · 신규 프로브(필 전환·URL 복원·모달 닫기 후 상태 보존·픽 보유 상태 분석 레일·print-root 수 불변) | 2~3일 |
| **S3** 인테이크+귀속 | classId 자동 스탬프, [이 클래스\|전체] 탭, 게이트 칩(서버 계산 필드) | 1일 |
| **S4** 배치 | bulk.ts 4종(C2·C3 서버 거부 포함) + 매트릭스 + 리포트 팬아웃. 결함주입 음성테스트 게이트 | 2~3일 |
| **S5** IA 접합 | 교차 링크·미분류→클래스 지정·투어 ch7 | 1일 |
| **S6** 학생 관리 사다리(별도 트랙) | L1 마운트(StudentFormDialog·과제 컴포저·드로어 2탭) → **정합 4균열 선행 수리**(listClassFolders isActive·capacity 통일·hard delete 가드·revalidate 미러) → 그 후에만 L3 흡수 검토. **순서 강제가 곧 리스크 대응** | 별도 |

---

## 8. 함정 원장 (적대검수 — 구현 시 그대로 게이트로)

**CRITICAL** (전부 감독 재검증 또는 설계 반영 완료)
- **C1** WorkspaceModal 본체 재사용 = 닫기가 스튜디오 파괴(back/replace 딜레마) → 자체 오버레이.
- **C2** 로스터 일괄 등록이 검수 게이트 그랜드파더링 무력화(`studentCount>0` 승계) → attach **서버측** mapConfirmedNumbers 검증.
- **C3** INTERNAL 분석 일괄 등록 = 학생 행 중복+시계열 이중 계상 → 서버 거부.

**MAJOR**
- M1 모달 안 학생 행 클릭 = from 없는 스튜디오 완전 이탈([students-tab.tsx:311-312](../src/components/exam-report/students/students-tab.tsx#L311) `?from=` 미부착) → `studentFromHref` prop.
- M2 AnalysesBoard 학생추가 CTA 는 별개 핸들러 → `onAddStudent` prop 동반.
- M3 게이트 칩·매트릭스 데이터가 현행 API 에 없음 → class-detail 슬림 응답+서버 gate 필드.
- M4 listActive 화이트리스트 전환은 파일 내 계약(음성 판정 근거 주석 :795-800)·E24 §1⑤와 정면 충돌 → **음성 판정 유지**(분석 뷰 fetch 2회 수용).
- M5 컴팩트 임계 640 은 4필에서 산술 확정 초과 → 780 인상은 구현 항목.
- M6 rightPanel 분기를 passagesPanelBody 앞에 넣으면 픽 보유 시 도달 불가 → rail 최상위 우선순위.
- M7 「채점 일괄 확정」= 이 리포가 명문 금지한 원버튼([exam-map-table.tsx:8-9](../src/components/exam-report/analysis/exam-map-table.tsx#L8), **감독 재검증**)의 재생산 + 확정=답안링크 409 잠금 미고지 → §9 결정 1.
- M8 공유 일괄에 GENERATED 필터 없으면 죽은 링크 배포.
- M9 플래그 off 강등은 필 렌더+parse 양쪽.

**MINOR 요지**: WorkspaceModalContext 미export(1줄) · 개칭 docs 6파일(사고 문서 제외) ·
「시험 분석」 선존 라벨 수렴 · 토큰 발급 tx 원자성 불가(부분 성공 반환) ·
폴러 훅에 enabled 인자 필요 · GET() 시그니처 변경 · `?view=` 값은 "analysis" 통일.

---

## 9. 사용자 결정 대기

1. **일괄 채점 확정 정책** — "압도적으로 쉽게" vs 원버튼 금지 원칙의 정면 충돌.
   선택지: (a) 확인 다이얼로그가 30행 점수 스프레드를 보여주는 1클릭+확인 1클릭
   (b) v1 에서 제외(개별 확정 유지) (c) 원버튼 강행(원칙 폐기 — 비권고).
   부작용 고지 필수: 확정 시 /a 재제출 409 잠금.
2. **최종 자구** — 「시험 분석」(권고) vs 「시험지 분석」(사용자 원안).
3. (S2 이후) 게이트 22클릭 자체의 경감 여부 — 이번 설계는 의도적으로 보존.

## 10. 알려진 한계 (정직 고지)

- 서답형 채점은 본질적 per-student — 논술형 위주 시험이면 개선 폭 절반 이하.
- 리포트 일괄 생성은 클라 팬아웃 — 브라우저 이탈 시 잔여 미발사(재클릭 멱등, 서버 큐는 v2).
- 선택 분석 id URL 미영속 — 새로고침 시 매트릭스 접힘(클래스·뷰는 복원).
- 보관(isActive=false) 클래스 분석은 허브에서만 · take 50 캡 답습(51건째 "더보기→허브").
- 클릭 수는 코드 경로 산식이지 사용자 행동 실측이 아님.
