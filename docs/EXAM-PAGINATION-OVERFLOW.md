# 시험지 조판 세로 넘침 — 추정 모델과 실측 가드 (26-09-19 · 26-09-30 보강)

> 읽는 사람: 시험지 조판(`src/components/exams/paper-builder`)을 다음에 만질 개발자.
> 한 줄 요약: **추정으로 나누고(exam-font 모델), 그려진 칸을 재서 바로잡는다(실측 가드).**
> 26-09-29 · 30 보강: 선지 묶음(§3.4) · PDF 해설 블록 줄 단위 분할(§3.5) · 「쪽당 N문제」는 해설 모드에서 끈다(§3.2 · §5).
> 인쇄 경로(전 쪽 마운트 · 인쇄 컨트롤러 · 검증)는 [`docs/EXAM-PRINT-PIPELINE.md`](EXAM-PRINT-PIPELINE.md).
> 무엇을 찍을지(지문 싣기 · 지문 묶음 박스 · 「원문 지문 없음」)와 웹 · HWPX · DOCX 선지 묶음 대응표는 [`docs/EXAM-PAPER-MODEL.md`](EXAM-PAPER-MODEL.md).

## 1. 무슨 일이 있었나

사용자 신고(26-09-19): 「시험지 조판에서 문제가 페이지 밖으로 밀려 내려간다」.
신고된 시험지는 3빈칸 조합 선지(A)(B)(C) 문항 + 장문 세트 43-45번이었고, 왼쪽 칸이 **174px 넘쳤다**.

전수 측정(학원 문항 1,251개 · 2단 comfortable):

| | 쪽수 | 넘친 칸 |
|---|---|---|
| 수리 전 | 216쪽(14배치) | **30칸** (최대 +162px) |
| 수리 후 | 같은 배치 −3쪽 | **0칸** |
| 수리 후 전수(25배치) | 381쪽 | **0칸** (가드 보정 33회) |

즉 **넘침을 없애면서 쪽수는 오히려 줄었다**(칸을 더 정확히 채우므로).

## 2. 원인 — 추정이 실제 렌더와 어긋난 다섯 자리

조판기(`pagination.ts`)는 글자 폭·줄높이를 **추정**해 칸을 채운다. 추정이 실제보다 작으면 칸이 넘치고,
크면 들어갈 내용이 다음 쪽으로 밀린다. 실측으로 확인된 어긋남:

| # | 어긋난 곳 | 실측 |
|---|---|---|
| 1 | 다중 빈칸 조합 선지를 「한 줄짜리 인라인 텍스트」로 봄 | 실제 그리드 420px ↔ 추정 250px (**−170px**) |
| 2 | 선지 줄높이 상수 1.45 (실제는 페이지 행간 1.58/1.46 상속) | 선지 줄마다 −1.4px |
| 3 | 본문 문단 사이 빈 줄을 세었지만 렌더는 접는다(`collapseBodyParagraphsForDisplay`) | 문단마다 +18px 과대 |
| 4 | 칸을 넘어 이어지는 조각의 「(N번 계속)」 라벨 자리 미반영 | 쪼개진 문항마다 **−20.4px** (60/60 일치) |
| 5 | 문항당 고정 오버헤드 28px(=12+16)이 실제 여백(4+4+4)과 불일치 | 문항마다 +16px 과대 |

또한 줄 수 추정 자체가 글자 부류 평균 폭 모델이라 문단마다 ±1~2줄 틀렸다(본문 179개 중 70개).

## 3. 고친 구조 — 2층

### 3.1 추정 층: `textMetrics: "exam-font"` (미리보기·인쇄)

미리보기는 임베드 글꼴(`public/fonts/exam/MalgunGothic-*.woff2`)로 그려지므로 **글자 폭이 결정적**이다.

- `exam-font-metrics.ts` — 그 글꼴의 실제 전진폭 표(정체/굵은꼴). fontTools 로 hmtx 를 읽어 박았다.
- `exam-text-wrap.ts` — 브라우저 줄바꿈 재현.
  - flow 모드(`wrapParagraphExact`): 칸 경계 분할용 줄 문자열. **공백에서만** 끊는다(렌더가 줄을
    공백으로 다시 잇기 때문에 단어를 쪼개면 글자가 갈라진다).
  - count 모드(`countParagraphLinesExact`): 원자 블록(선지·발문) 높이용. 브라우저처럼 한글 음절
    사이·하이픈 뒤에서도 끊어 센다.
  - 렌더러(`renderFormattedInline`)가 만드는 모양을 그대로 잰다: `__밑줄__` = 굵은꼴(600→700면),
    빈칸 `_____` = inline-block min-w 4.5em + mx-1, 단독 마커 ①·(A) = mx-0.5, ① 은 다음 단어와 nbsp 묶음.
  - `countStemLinesExact`: 발문은 semibold + 앞에 「N.」 번호(굵게)·메타 배지가 첫 줄을 먹는다.
- `multi-blank-grid-metrics.ts` — (A)(B)(C) 컬럼 그리드 높이. CSS Grid auto 트랙 알고리즘(min-content
  에서 출발해 여유 폭 균등 분배, max-content 에서 동결)을 그대로 따라 열 폭을 구하고 셀마다 접는다.

정확도(실측 대조): 선지 **355/355 줄 일치**(종전 327/355), 문항 조각 높이 **중앙값 +1.8px**,
칸 단위 추정−실측 **중앙값 +6~7px**(살짝 보수적 — 가드가 도는 횟수를 줄이려는 의도).

### 3.2 실측 층: 넘침 가드 `hooks/use-overflow-guarded-pagination.ts`

추정이 아무리 정확해도 「절대」는 보장 못 한다. 그래서 그려진 뒤 **실제로 잰다**.

1. 그려진 페이지를 앞에서부터 훑어 칸 내용의 아래끝이 `main` 아래끝을 넘는 **첫 칸**을 찾는다.
2. 그 칸의 추정 용량을 낮춘다(`columnCapacityAdjust[페이지:칸]`) — 넘친 만큼 비례 축소, 최소 1px 은
   반드시 낮춰 마지막 블록이 다음 칸으로 가게 한다. 그 칸보다 **뒤 칸의 보정은 버린다**(앞이 바뀌면 무효).
3. `useLayoutEffect` 안에서 다시 나눈다 → **페인트 전에** 끝나 사용자는 넘친 프레임을 보지 않는다.

불변식·한계:
- 입력(그룹·설정)이 바뀌면 보정을 통째로 버리고 처음부터 잰다 — 위치 기반이라 낡으면 해롭다.
- **시험지 글꼴 면**(Malgun Gothic Exam 400 · 700)이 로딩 중일 때만 재지 않는다(대체 글꼴로 잰 값은 거짓). `loadingdone` 에서
  다시 잰다. 전역 `document.fonts.status` 는 보지 않는다 — 무관한 UI 글꼴(Pretendard CDN)이 걸리면 가드가 영영 못 잰다(PRINT-R1).
- 블록이 하나뿐인 칸(한 칸보다 큰 원자 블록)·6회(`MAX_ATTEMPTS_PER_COLUMN`) 시도해도 안 되는 칸은 `stuck` 으로 포기한다(무한
  루프 방지). 포기한 칸이 여전히 넘치면 결과는 `stuck-overflow`(수렴이지만 깨끗하지 않음) — 인쇄 잡이 인쇄 순간 넘친 칸을 실측해
  원격 측정 `guard:'stuck'` · `overflowColumns` 로 보고한다(PRINT-R3). 가장 흔한 원인이던 긴 PDF 해설은 §3.5 로 없어졌다.
- 수렴 신호 `isSettled()` — 마지막 측정이 clean/stuck-overflow/exhausted 이고 그 측정의 조판 · 마운트 수 · 글꼴 에폭이 지금과
  같을 때만 참. 인쇄 컨트롤러가 print() 전에 이것을 기다린다(시간 추측 없음).
- 지연 마운트된 페이지는 마운트 시점(`onPageMounted`)에 잰다.
- 「쪽당 N문제」 강제 배치가 **실제로 켜진** 경우(`forcedPerPageEnabled(settings)`)만 칸 용량을 안 쓰므로 가드도 돌지 않는다
  (`isSettled` 는 참). **해설 포함(`includeAnswers`) 모드에서는 강제 배치를 끈다** — 강제 배치는 칸 용량 ∞ · 가드 꺼짐이라 해설이
  붙은 문항이 한 칸보다 커지면 종이 아래로 잘렸다(26-09-30 E1, 빌더 「쪽당 2문제」 + [PDF 해설] 넘친 칸 17). HWPX
  (`export-hwpx/_lib/builder.ts` `forcePerPage = forceTwoPerPage && !includeAnswers`)와 같은 정책이다.
- 개발 진단: `localStorage.paperOverflowGuard = "off"` 로 끌 수 있고, `window.__paperOverflowGuard` 에
  보정 횟수·칸별 추정치가 실린다(프로덕션 빌드에는 없다).

### 3.3 왜 HWPX 는 legacy 로 두는가

**어느 HWPX 경로가 웹 조판의 쪽 나눔을 쓰나(26-09-30 정정)**: 기본 2단(네이티브 2단 구역)은 쪽 나눔 계획을 **쓰지 않는다** —
한컴 자동 흐름이고 강제 나눔은 쪽당 N문제 · 항목별 breakBefore 뿐이다. `break-plan.ts`(`paginateGroups`)는 1단 흐름과 2단 표 경로
(`HWPX_NATIVE_2COL=0`)에서만, 해설 포함 · 쪽당 N문제가 아닐 때만 계산한다(1단은 한컴이 웹보다 촘촘하면 쪽 바닥 공백 — EXAM-PAPER-MODEL §12).
그 계산도 **한컴이 그린다**는 전제다: 한국어는 어절 단위로 끊고, 다중 빈칸 선지는 「값1 …… 값2」 한 문단으로 그린다. 그래서
`textMetrics` 기본값(legacy) + `multiBlankOptionLayout: "inline"` 을 명시해 종전 보정값을 유지한다.
**미리보기 쪽 수치를 HWPX 에 그대로 옮기지 말 것.** 아래 §3.4 선지 묶음 · §3.5 해설 줄 단위 분할도 exam-font 에서만 켜지므로
HWPX 쪽 나눔은 바이트 동일하다(HWPX 는 한컴 keepWithNext 로 같은 규칙을 따로 구현 — `docs/EXAM-PAPER-MODEL.md` §9).

### 3.4 선지 묶음(keep-together) — `pagination-keep.ts` (26-09-29, 계약 `docs/EXAM-PAPER-MODEL.md` §9)

- **규칙**: 한 문항의 선지 ①~⑤(다중 빈칸 그리드 행 · 객관식 추가 슬롯 ⑥… 포함)는 칸 · 쪽 경계에서 쪼개지 않는다. 발문 뒤 본문이
  `KEEP_SHORT_BODY_LINES`(=2)줄 이하이고 곧바로 첫 선지가 오면 **발문 + 그 줄 + 선지**를 한 묶음으로 본다(칸 바닥에 발문만 남는
  고아 방지). **한 칸보다 긴 묶음만** 예외로 종전처럼 블록 단위로 흘린다. **지문 · 본문 줄은 묶지 않는다**(한 문단이 15~18줄이라
  묶으면 큰 공백이 생긴다).
- **조판기 동작**(`keptRunEnd` 가 묶음 머리 → 끝 index 를 준다): 묶음 머리에서 (1) 지금 칸에 묶음 전체가 안 들어가고 (2) 빈 다음
  칸에는 들어가면 머리 앞에서 칸을 넘긴다. 머리를 놓은 뒤 묶음 전체가 그 칸에 들어가면 나머지 블록은 넘침 판정 없이 같은 칸에
  둔다(추정 합의 부동소수 잡음으로 마지막 선지만 갈라지는 것 방지). 묶음 비용은 블록 높이 합이다 — 같은 문항 · 같은 조각 안의
  뒤 블록에는 여백 · 「(N번 계속)」 라벨이 더 붙지 않는다(`marginalCostForBlock` 과 일치).
- **켜짐**(`keepOptionGroupsEnabled`): `settings.keepOptionGroups` 명시값, 없으면 `textMetrics === "exam-font"`(미리보기 · 인쇄)일
  때만. HWPX `break-plan`(legacy)은 꺼짐. 「쪽당 N문제」 강제 배치가 켜지면 끈다(칸 용량을 안 쓴다) — 해설 모드는 강제 배치를
  끄므로 선지 묶음이 켜진다.
- 내보내기 쪽 짝: HWPX `export-hwpx/_lib/keep-policy.ts`(역할 → keepWithNext · keepLines, 끄기 env `HWPX_KEEP_TOGETHER=0`), DOCX
  `export-docx/_lib/keep-policy.ts`(역할 → keepNext · keepLines · 행 cantSplit — 26-09-30 DOCX-KEEP). **DOCX 본문 문단에는 keepNext 가
  없다**(종전 「선지 앞 마지막 본문 문단 keepNext」는 한컴에서 연 DOCX 에 74~82% 빈 단 · 선지 쪼개짐을 냈다 — HW-1). 세 출력의 역할 ·
  엔진 차이 대응표는 EXAM-PAPER-MODEL §9. 검사: `exam-paper-option-keep`(조판) · `hwpx-keep-together`(HWPX) · `docx-keep-policy`(DOCX).
  웹 PDF 의 선지 갈림을 글자로 세는 스캐너를 만들 때는 줄 머리에 문장 마커 ①~⑤ 가 오는 지문(무관한 문장 · 어법)을 선지로 세지 않게 할 것.

### 3.5 PDF 해설 블록 — 렌더 줄 단위 흐름 (26-09-30, PRINT-R3 · R9)

- 해설 포함 PDF(`includeAnswers`)는 문항 뒤에 인라인 정답 · 해설을 붙인다. `explanation-content.ts` 가 행 목록(정답 배지 · 라벨 ·
  문단 · 글머리 · 오답 행 — DOCX 해설과 같은 구성)을 만들고, exam-font 에서는 `explanation-layout.ts` 가 흐르는 행(문단 · 글머리 ·
  오답)을 **렌더 줄 단위 흐름 단위**(`ExplanationUnit`)로 쪼개 조판기에 `kind:"explanation"` 블록 여러 개로 넘긴다. 칸 경계에서는
  줄 사이에서 갈라지고, 뒷조각은 「(N번 계속)」 라벨 아래 이어진다. 종전에는 해설 전체가 원자 블록이라 한 칸보다 긴 해설
  (순서 배열 1,085자)이 가드 stuck → 종이 끝에서 잘렸다(1쪽 2칸 +166px).
- **추정 = 렌더**: 줄 나눔은 Blink 규칙 재현(`explanation-line-break.ts` — 공백 뒤는 항상, 한글 음절 사이는 UAX #14, 인쇄 가능 ASCII
  쌍은 Blink 실측 표, 「폭 합 ≤ 줄 폭 LayoutUnit + 1/64」), 글자 폭은 임베드 글꼴의 정확한 폭(`explanation-glyphs.ts`). 조각
  경계 = 줄 경계라 뒷조각을 따로 그려도 같은 줄이 나온다. 조각이 문항 조각의 맨 처음(계속 라벨 바로 뒤)이면 첫 행의 위 여백을
  그리지 않는다(비용에서 `unit.topGap` 을 뺀다).
- **해설 원문 마크다운**: `explanation-markdown.ts`(웹 · DOCX · HWPX 공용) — `**굵게**` → 굵은 조각(700면 폭으로 잰다), 짝 없는
  `**` 제거, 인라인 코드는 백틱만 뗌, 해설 본문 줄머리 「- 」「* 」「• 」 → 글머리(•) 행. `__` · `[..](..)` · `<..>` 는 건드리지
  않는다(빈칸 · 라벨 · 작품 제목).
- legacy 조판은 종전 원자 블록(`estimateExplanationBlockHeight`)이다. 다만 HWPX `break-plan` 은 해설 포함 모드에서 계산하지 않으므로
  (§3.3) 운영에서 이 분기에 닿는 호출자는 없다(26-09-30 정정). HWPX 해설은 한컴 자동 흐름 + keep 정책이 나눈다.
- 검사: `tests/unit/exam-paper-explanation-split.test.mjs`(용량 초과 · 분할 · 복원 · 골든 · 굵게 · 쪽당 N문제 해설 해제), 실엔진은
  `print-e2e button --explanation` · `force-per-page`.
- 실측: 줄 나눔 교정 해설 1,306건 × 3폭 줄 머리 100%, 새 표본 1,421건 × 6폭 58,548 중 58,544 일치(남은 4행은 어느 글꼴에도
  없는 ⑯~⑳ 가 든 한 해설) · 해설 조각 높이 추정-렌더 불일치 0/329 · 해설 PDF 내부 53 · 고객 80 · 107 → 26/26 · 44/44 · 63/63쪽
  넘침 0 · 선지 갈림 0.

## 4. 인쇄 경로도 같이 고쳤다

> ⚠ **26-09-29 정정 — 아래 「백지 인쇄」 수리는 가짜 GREEN 이었다.** 최종 구조와 검증 방법은
> [`docs/EXAM-PRINT-PIPELINE.md`](EXAM-PRINT-PIPELINE.md), 사고 경위는
> [`docs/customers/eastim-print-hwpx-2609.md`](customers/eastim-print-hwpx-2609.md) §1 을 볼 것.
> - `use-print-mount-all.ts` 가 켠 전 쪽 마운트를 `LazyPaperPage` 가 **이펙트로** 받아 한 박자 늦게 그렸다. 브라우저는
>   beforeprint 핸들러가 끝나자마자 인쇄 레이아웃을 뜨므로 인쇄에 못 들어간다 — 실제 엔진(printToPDF 직행)으로 뜨면
>   3/29쪽이었다. 「같은 동기 렌더에서 가드도 돈다」도 그래서 성립하지 않았다.
> - 초록을 낸 검증(`paper-print-check.mjs` 종전 판)은 합성 `beforeprint` → `waitForTimeout(1500)` → 측정이었다. 그 1.5초
>   동안 이펙트가 나머지 쪽을 그려 줬다. 검증 스크립트는 `page.pdf()` 직행으로 고쳤고, 대기 금지는 계약 테스트가 지킨다.
> - 이 훅은 소유권 판정 없이 모든 beforeprint 에서 전 쪽을 그려 스튜디오에서 남의 인쇄에도 헛마운트했다 → **삭제**했다.
>   전 쪽 마운트는 이제 `usePrintPortal` 이 포털을 실제로 태웠을 때만 한다. `LazyPaperPage` 는 `mounted || forceMount` 를
>   렌더에서 반영한다. 버튼 인쇄는 인쇄 컨트롤러(`paper-builder/print/`)가 준비 완료 신호를 확인한 뒤에만 부른다.

- ~~**백지 인쇄**: 미리보기는 페이지를 지연 마운트한다. 스크롤하지 않은 쪽은 DOM 에 없어 그대로 인쇄하면
  백지로 나왔다(실측: 5쪽 중 1쪽 백지). `hooks/use-print-mount-all.ts` 가 `beforeprint` 에서 `flushSync`
  로 전 페이지를 동기 마운트한다(버튼 인쇄·Ctrl+P 둘 다). 같은 동기 렌더에서 가드도 돌아 새로 마운트된
  쪽의 넘침까지 바로잡힌 뒤 인쇄된다.~~ (9/19 서술 — 위 정정 참고. 원인 진단 「지연 마운트 쪽은 백지」 자체는 맞았다.)
- **인쇄 글꼴**: `print-styles.tsx` 가 시스템 맑은 고딕을 먼저 썼다 → 맥처럼 그 글꼴이 없는 기기에서
  인쇄만 다른 글꼴로 흘러 미리보기 기준 배치가 잘릴 수 있었다. 임베드 글꼴(`Malgun Gothic Exam`)을
  맨 앞에 둔다.

## 5. 렌더를 바꾸면 같이 바꿔야 하는 자리 (계약)

추정은 렌더의 거울이다. 아래를 고치면 짝이 되는 추정도 고쳐야 한다(안 고치면 넘치거나 빈다).

| 렌더 | 짝이 되는 추정 |
|---|---|
| 문항 조각 `py-0.5` · 헤더 `mb-1` | `itemRenderOverhead()` |
| 본문 `p.mt-1` / 구조화 `div.mt-1` | `QUESTION_BODY_TOP_GAP` |
| 「(N번 계속)」 라벨 | `continuationPartChrome()` |
| 선지 컨테이너 `mt-1.5` · 행 간격 `space-y-1` | `OPTION_BLOCK_TOP_GAP` · `OPTION_ROW_GAP` |
| 선지 글꼴 `text-[11px]`/`text-[10px]` | `estimateOptionBlockHeight` 의 `optionFontPx` |
| 다중 빈칸 그리드(열 템플릿·`columnGap`·`min-w-[18px]`) | `multi-blank-grid-metrics.ts` 상수 |
| `renderFormattedInline` 의 마커·빈칸·밑줄 모양 | `exam-text-wrap.ts` 의 토큰 폭 |
| 지문 박스 `mb-3 py-1`·테두리 | `passageChromeHeight()` |
| 문단 접힘(`collapseBodyParagraphsForDisplay`) | `questionBodyToLines()` (같은 함수를 쓴다) |
| 선지 묶음이 칸을 넘기는 자리(머리 · 끝) | `pagination-keep.ts` `keptRunEnd` · 묶음 비용 = `marginalCostForBlock` 합 |
| 해설 컨테이너 `mt-2` · 라벨 `mt-1.5` · 행 `mt-0.5` · 들여쓰기 `pl-2` · 정답 배지 테두리/패딩 · 글머리 `gap-1`(`components/exam-explanation-block.tsx`) | `explanation-layout.ts` 상수 `EXPLANATION_CONTAINER_TOP` · `EXPLANATION_LABEL_TOP` · `EXPLANATION_ROW_TOP` · `EXPLANATION_ROW_INSET` · `ANSWER_CHROME_V` · `ANSWER_INSET_H` · `BULLET_GAP` |
| 해설 글꼴 크기 · 굵게(`<strong>`) · 글머리(•) | `explanation-glyphs.ts`(정체 · 굵은꼴 폭) · `explanation-markdown.ts`(파싱 — DOCX · HWPX 해설도 같은 함수) |
| 해설만 든 계속 조각의 「(N번 계속)」 라벨 | `continuationPartChrome()`(실측: part 높이 − 추정 = 22.219px = 라벨) |
| 「쪽당 N문제」 강제 배치를 쓰는지 | `forcedPerPageEnabled(settings)` **하나** — 조판기 · `keepOptionGroupsEnabled` · 넘침 가드 `active` 가 함께 본다. `settings.forceTwoPerPage` 를 따로 읽지 말 것(해설 모드 = 꺼짐, HWPX `builder.ts` 와 같은 정책) |

## 6. 측정 도구 (개발 전용)

- 렌더 페이지: `/director/dev/paper-overflow?qids=…|recent=N&skip=M[&cols=1][&density=compact]
  [&passage=boxed|underlined][&meta=1][&answer=0][&bank=…][&setKeys=…][&seed=7]`
  — DB 는 읽기만 하고, 실제 조판기로 전 페이지를 마운트해 그린다. 프로덕션은 `GICHUL_RENDER_DEV=1` 없으면 404.
- 스윕: `node scripts/exam-pagination/paper-sweep.mjs --out out.jsonl [--base URL] [--guard-off] <url|경로…>`
  → `node scripts/exam-pagination/paper-report.mjs out.jsonl` (넘친 칸 · 칸 아래 여백 · 추정−실측 분포)
  - 26-09-30: `--base`(기본 `$PRINT_E2E_BASE` → 첫 URL 의 origin → `http://localhost:3000`), 앞 `/` 없는 경로는 base 에 붙인다.
    가드 스위치는 init script 로 심는다(종전 `localhost:3000/login` 경유는 스태프 쿠키면 AUTH_URL 로 리다이렉트돼 다른 포트에서
    죽었다). 쓰기 가드(`write-guard.mjs`)를 건다 — 다운로드가 시작되면 종료 코드 1.
- 조각별 오차: `node scripts/exam-pagination/paper-parts.mjs --out parts.json <url…>`
- 지문·여백 잔차: `node scripts/exam-pagination/paper-residual.mjs <url…>`
  - 26-09-30: 이 둘도 쓰기 가드 세 겹 + GET 허용 목록(`get-policy.mjs`)을 걸고, 가드 스위치는 init script 로 심으며, 원점은 첫 URL
    에서 가져온다(종전의 `localhost:3000/login` · 쿠키 도메인 하드코딩 제거). 쓰기 가드 판정(`judgeWriteGuard`)이 종료 코드에 들어간다.
- 인쇄: `node scripts/exam-pagination/paper-print-check.mjs <classId> [문항수] | --url <경로> [--base URL]` — 실제 인쇄 엔진
  (`page.pdf`) 직행 → PDF 쪽마다 글자 · 인쇄된 DOM 넘침. 진입점별 인쇄 e2e 는 `print-e2e.mjs`(`docs/EXAM-PRINT-PIPELINE.md` §6).

이 스크립트들은 모두 헤드리스 Playwright + 스태프 세션 쿠키(`.tmp-studio-qa/mint-cookie.mjs`, 또는 `$PRINT_E2E_COOKIE`)를 쓴다.
로컬 `.env` 의 DB 는 운영이다 — 브라우저 컨텍스트에는 반드시 쓰기 가드(`write-guard.mjs`)를 건다(EXAM-PRINT-PIPELINE §6.1).
GET 도 기본 거부다: 새 화면을 스윕하려면 `get-policy.mjs` 의 `READ_ONLY_PAGES` 에 넣고 자가 시험(`node scripts/exam-pagination/write-guard.mjs`)
으로 부작용 0 을 증명받는다 — 막히면 쓰기로 새지 않고 RED/abort 로 드러난다.
