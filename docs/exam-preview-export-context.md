# 시험지 미리보기 ↔ DOCX/HWP 줄넘김 일치 작업 — 컨텍스트 핸드오프

> 새 채팅에서 "미리보기창 + DOCX/HWP 다운로드" 작업을 이어가기 위한 맥락 정리.
> 작성 시점 기준 상태: **미리보기(워드프로세서식 빈 줄) 기능은 완료·유지**, **DOCX/HWP 내보내기 변경은 전부 원복(HEAD)됨**

---

## 0. 한 줄 요약

시험지 빌더(`/director/workbench/exams/create`)에 "워드프로세서처럼 문제 사이를 클릭해 Enter로 빈 줄을 넣는" 기능을 넣었다(완료). 그런데 **다운로드(DOCX/HWP)의 줄넘김·페이지 분할이 화면 미리보기와 달라서** 그걸 맞추려다 여러 번 실패했고, **내보내기 쪽 변경은 일단 전부 되돌렸다**. 핵심 난점은 폰트(미리보기=Apple SD Gothic Neo, 다운로드=맑은 고딕)다.

---

## 1. 목표(원래 사용자 요구)

1. 미리보기에서 문제와 문제 사이를 클릭하면 텍스트 커서가 깜빡이고, **Enter로 한 줄씩 빈 줄 추가 / Backspace로 제거**(워드프로세서처럼). → **완료, 유지 중**
2. 그 빈 줄/줄넘김이 **DOCX·HWP·PDF 다운로드에서도 미리보기와 똑같이** 보여야 함. → **미해결(원복 상태에서 다시 시작 예정)**

---

## 2. 완료되어 유지 중인 것 — 미리보기 "빈 줄(line-gap)" 기능

### 동작
- 미리보기에서 문제 아래 경계(얇은 영역)를 클릭 → 파란 텍스트 캐럿이 깜빡임.
- **Enter** = 빈 줄 1개 추가(아래 내용이 한 줄씩 밀림), 캐럿이 같이 내려감.
- **Backspace** = 빈 줄 1개 제거(캐럿 위로). **Esc** = 캐럿 해제.
- 빈 줄은 "블록"으로 보이지 않음(점선 박스 없음, 순수 여백). 우측 편집 패널의 블록 목록/블록 수에도 안 나옴.
- 빈 줄이 칸/페이지 끝에 닿으면 다음 칸·다음 쪽으로 넘어가고, 캐럿이 화면 밖이면 미리보기가 따라 스크롤.

### 구현 방식
- 내부적으로는 `spacer` 블록을 쓰되 `blockText === LINE_GAP_MARKER("__linegap__")`로 표시한 "한 줄짜리 보이지 않는 여백".
- 저장(draft)·내보내기에 그대로 흐르므로 새로고침/다운로드에도 유지됨.

### 핵심 파일 (모두 유지됨)
- `src/components/exams/paper-builder/types.ts` — `LINE_GAP_MARKER`, `LINE_GAP_MAX_PX`, `isLineGapItem()`.
- `src/components/exams/exam-paper-builder-client-parts/use-paper-items.ts` — `insertLineGap(afterLocalId, lineHeight)`, `removeLineGap(afterLocalId)` (commitItems 통해 undo 지원). **현재 모델: Enter 1회 = 1줄짜리 spacer 1개 새로 삽입(키우기 아님), 캐럿이 새 spacer로 이동.**
- `src/components/exams/exam-paper-builder-client.tsx` — `lineCaret` state, window keydown(Enter/Backspace/Esc, 인라인 편집 중엔 무시), 캐럿 따라 스크롤 effect, 우측 패널에서 line-gap 제외(`panelPaperItems`), 좌측 카드 강조용 `activeQuestionId`.
- `src/components/exams/paper-builder/components/a4-paper-page.tsx` — 갭 클릭영역(`data-line-gap-anchor`), 깜빡이는 캐럿, line-gap spacer를 보이지 않는 한 줄로 렌더, **space-y margin-bottom 상쇄(아래 '버그 교훈' 참고)**.
- `src/components/exams/exam-paper-builder-client-parts/preview-pages.tsx` — `lineCaret`/`setLineCaret` 프롭 전달.
- `src/app/globals.css` — `@keyframes caret-blink` + `.line-gap-caret`(스텝 깜빡임).
- `src/components/exams/paper-builder/paper-item-utils.tsx` — `buildGroups`에 **지문 중복 렌더 방지(passage-dedupe)**: 같은 지문 묶음이 빈 줄(비문항 블록)로 쪼개져도 지문 박스를 한 번만 그림(바로 앞 그룹이 비문항 블록일 때만 dedupe → 일반 시험지 동작 불변).
- (덤) 좌측 문제카드 강조 + 스크롤: `question-bank-card.tsx`(`active` prop, `data-question-card-id`), `question-bank-passage-view.tsx`, `paper-builder/components/question-library-panel.tsx`.

### 미리보기 overflow 버그 교훈 (반드시 기억)
- 증상: 빈 줄을 넣으면 문제가 페이지 여백을 넘어감.
- **진범: Tailwind v4의 `space-y-*`는 16px 간격을 자식의 `margin-TOP`이 아니라 `margin-BOTTOM`에 넣는다.** 그래서 "margin-top:0으로 상쇄"는 무효였고, 빈 줄마다 16px이 몰래 붙어 18px이어야 할 빈 줄이 34px로 렌더됐다.
- **해결:** a4-paper-page.tsx에서 "다음 형제가 line-gap인 fragment"의 `margin-bottom`을 0으로(인라인 스타일). 페이지네이션 쪽도 line-gap 그룹엔 `GROUP_GAP`을 더하지 않게 맞춤(`pagination.ts`의 `ensureFragment`/`marginalCostForBlock`에 `isLineGapGroup`). 22개 시나리오 브라우저 검증 통과.

---

## 3. 미해결 — DOCX/HWP 다운로드를 미리보기와 일치시키기 (현재 원복됨)

### 되돌린 파일(=HEAD 원상복구, "내보내기 건드리기 전" 상태)
- `src/app/api/exams/[examId]/export-docx/_lib/build-builder-document.ts`
- `src/app/api/exams/[examId]/export-hwpx/_lib/break-plan.ts`
- `src/app/api/exams/[examId]/export-hwpx/_lib/builder.ts`

> 새 작업은 이 3개 파일에서 다시 시작하게 됨. (미리보기/페이지네이션 파일은 그대로 둠.)

### 근본 원인 (진단 완료)
1. **폰트 불일치(가장 큰 원인).** 미리보기 글꼴 스택은 `"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo"`(a4-paper-page.tsx). **맥에는 맑은 고딕(Malgun)이 없어서** 브라우저 미리보기는 **Apple SD Gothic Neo**로 폴백된다. 반면 DOCX/HWP는 **맑은 고딕**을 쓴다(Windows·한컴 호환 기본값, `export-docx/_lib/styles.ts`). 두 글꼴은 영문 글자폭이 달라서 같은 칸 폭에서도 줄바꿈 위치가 달라지고(예: 미리보기는 "techniques is to"까지, DOCX는 "techniques is"까지) → 페이지 분할 지점이 어긋난다.
   - **단 폭은 동일함을 확인**: DOCX 칸 폭 = 미리보기 칸 폭 = **5169 twips**. 즉 폭 문제 아님, 순수 폰트(글자폭) 차이.
   - 결과적으로 맥 미리보기(Apple SD Gothic Neo, 더 좁음)가 맑은 고딕보다 한 줄에 더 많이 담는다 → 미리보기가 "낙관적"이고 실제 다운로드는 덜 담긴다.
2. **렌더 경로가 다름.** 미리보기는 `paginateGroups`(명시적 페이지/단 배치). HWPX는 `computePaginatedLayout`(= 같은 paginateGroups를 서버에서) → "페이지당 단별 표"로 강제 배치해서 미리보기와 맞춤. **그러나 DOCX는 Word의 네이티브 2단 자동 흐름**에 맡겨서 분할 지점이 다름.
3. **빈 줄(custom block)이 있으면 강제 레이아웃이 꺼진다.** HWPX의 `hasCustomBlocks = blocks.some(b => b.blockType !== "question")` 가드가 **line-gap spacer까지 포함**해서, 빈 줄이 있으면 HWPX도 강제 표 레이아웃 대신 네이티브 흐름으로 폴백한다. 즉 빈 줄 시험지는 HWPX조차 미리보기와 안 맞을 수 있다.

### 시도했던 접근과 실패 이유 (반복 금지용)
- (a) **빈 줄 spacing 보정**: DOCX/HWP에서 빈 줄을 "본문 한 줄" 높이로 렌더(빈 단락 + spaceAfter 제거, `exactLineSpacing(SIZE_BODY,1.58)=284twips` / HWPX `lineSpacingPct:158`). 빈 줄 자체 크기는 맞췄지만, 본문 줄바꿈(폰트) 차이로 4번문제 등 여전히 어긋남.
- (b) **DOCX를 HWPX처럼 강제 레이아웃(페이지당 2단 표)으로 재작성**: `computePaginatedLayout` → 페이지당 `[좌|gap|우]` 무테 표 + `cantSplit`. → **첫 표가 헤더 뒤 1쪽에 안 들어가면 `cantSplit` 때문에 통째로 2쪽으로 점프 → 1쪽이 빈 페이지가 됨.** Word 표의 한계.
- (c) **(b)를 단 나눔(ColumnBreak)으로 교체**: 네이티브 2단 흐름 + 각 단 경계에 `ColumnBreak`. → 빈 페이지 문제는 해결됐고 분포는 미리보기와 일치(1쪽:문제1·2|3, 2쪽:4·5|6, 3쪽:정답표). 하지만 사용자가 "원점 복귀" 요청해서 **(a)(b)(c) 전부 원복**.

### 남은 트레이드오프(다음 결정 포인트)
- **A. DOCX/HWP를 미리보기 레이아웃으로 강제**(ColumnBreak 방식이 유망). 단점: 맑은 고딕이 더 커서 빡빡한 칸은 넘칠 위험. 완화책으로 "안전여백(contentSafetyPx)을 더 줘서 다시 계산했을 때 페이지 수가 늘면 네이티브로 폴백"하는 가드를 넣었었음.
- **B. 미리보기를 진짜 맑은 고딕 레이아웃으로** (페이지네이션 추정을 맑은 고딕 기준으로 보정하거나, 미리보기에 맑은 고딕-호환 웹폰트를 임베드). → 미리보기 = 모든 다운로드. 단점: 맥엔 맑은 고딕이 없어 임베드 필요(라이선스 이슈 가능). 사용자는 "독스/한글 생성을 우선시하고 거기에 미리보기를 맞춰도 좋다"고 했음 → **B 방향도 명시적으로 허용**.
- **C. 그대로 두고 PDF로 안내**: PDF 다운로드는 미리보기를 브라우저가 그대로 인쇄한 것이라 **미리보기와 100% 일치**. DOCX/HWP는 맑은 고딕 편집본.

---

## 4. 아키텍처 지도 (어디를 보면 되나)

### 미리보기 / 페이지네이션 (공용 엔진)
- `src/components/exams/paper-builder/pagination.ts` — `paginateGroups(groups, settings)` → `PaperPage[]`(페이지 → 단 → `RenderFragment` → `RenderItemPart`). 줄 단위로 문항/지문을 쪼개 칸에 배치.
- 타입: `src/components/exams/paper-builder/types.ts` — `PaperPage`, `RenderFragment`, `RenderItemPart`, `StructRow`.
- 그룹화: `paper-item-utils.tsx`의 `buildGroups`.
- 렌더: `a4-paper-page.tsx`(미리보기), 인쇄 CSS `print-styles.tsx`.
- 페이지 용량: `pageMetrics()` (firstPageHeader 기본 comfortable 96 / compact 82px). **미리보기는 firstPageHeaderPx를 안 넘김 → 기본값 사용.**

### HWPX 내보내기 (이미 강제 레이아웃을 함 — 참고 구현)
- `export-hwpx/_lib/builder.ts` — 메인. `useColumnTables = columns===2 && !hasCustomBlocks`일 때 `computePaginatedLayout` → 페이지당 표. overflow면 폴백.
- `export-hwpx/_lib/break-plan.ts` — `computePaginatedLayout()`(서버에서 paginateGroups 재현), `reconstructPaperItems()`. **여기서 firstPageHeaderPx를 실제 헤더 높이로 넘김(미리보기와 살짝 다를 수 있음).**
- `export-hwpx/_lib/render/fragment.ts` — `renderPassageFragment`, `renderQuestionPart`(part를 BlockNode로). **DOCX 강제 레이아웃 만들 때 1:1 참고 대상.**
- 렌더 모듈: `render/question.ts`, `render/passage.ts`, `tokens.ts`(SIZE.body=9pt 등).

### DOCX 내보내기 (현재 네이티브 흐름)
- `export-docx/_lib/build-builder-document.ts` — 메인 `buildBuilderExamDocument`. `appendQuestionGroups`→`buildQuestionBlock`(통문항 렌더)를 Word 네이티브 2단 섹션에 흘림. `buildCustomBlock`(spacer/text/divider/image). **`computePaginatedLayout`/break-plan 안 씀(분할은 Word가 결정).**
- `styles.ts`(DEFAULT_FONT="맑은 고딕"), `parse-formatted-text.ts`, `build-answer-key.ts`, `borders.ts`, `types.ts`(`DocChild`, `BuilderItemResolved`).
- 본문 행간: `exactLineSpacing(halfPt, lineHeight)`, `SIZE_BODY=18(=9pt)`, `BODY_LINE_HEIGHT=1.58`. 페이지 마진: `MM_PER_PX = 210/760`. 단 간격 `space:501`(twips).
- 주의: `break-plan.ts`와 `builder.ts`(HWPX)가 **DOCX의 `BuilderBlock`/`BuilderLayout` 타입을 import**한다(순환 비슷). DOCX에서 break-plan을 쓰려면 `computePaginatedLayout`을 import 가능(이전에 `@/app/api/exams/[examId]/export-hwpx/_lib/break-plan`에서 가져옴).

### PDF
- 서버 라우트 없음. 미리보기 화면을 **브라우저 인쇄(window.print)** → 미리보기와 동일 렌더. (다운로드 메뉴의 "PDF"도 인쇄)

### 다운로드 트리거 (UI)
- `exam-paper-builder-client.tsx`: `handleDownloadDocx/Hwpx`(저장 후 `/api/exams/{id}/export-docx|hwpx?[answers=true]` 링크 클릭), `handlePrint`(PDF=인쇄).
- 메뉴: `exam-paper-builder-client-parts/preview-toolbar.tsx`(PDF / DOCX / DOCX 해설 / HWPX / HWPX 해설; HWPX 버튼엔 "beta" 배지가 있어 접근명이 "HWPX beta"임 — 자동화 시 주의).

---

## 5. 검증 방법 (브라우저·파일 직접 확인) — 그대로 재사용 가능

> 로그인 세션이 필요. 헤드리스 playwright에 NextAuth 쿠키를 직접 발급해 주입한다.

### 세션 쿠키 발급 + 빌더 구동
- 라이브러리: `playwright-core`(설치돼 있음, chromium 1217), `next-auth/jwt`의 `encode`, `dotenv`.
- 쿠키: 이름 `authjs.session-token`, salt `authjs.session-token`, secret=`.env`의 `NEXTAUTH_SECRET`(길이 36), maxAge 86400.
- 토큰 필드: `{ id, role:"DIRECTOR", academyId, academyName, academySlug, name, email, sub }`.
- **개발 DB 사용자(네안데르 학원, 사용자 본인)**: staff `id=cmolpxowo0002mmn0gzac0zo5`, `academyId=cmolpxosm0000mmn0iucxlo51`, `slug=네안데르-3e6fee`. (Prisma 모델명은 `staff`, `user` 아님.)
- 페이지: `http://localhost:3000/director/workbench/exams/create`. 첫 로딩 후 "오늘 하루 보지 않기"(베타 초대 모달) 닫기.
- 문제 추가: 좌측 카드 `[data-question-card-id]` 안의 `button[role=checkbox]` 클릭.
- 빈 줄 추가: 미리보기 `.exam-preview-zoom-content [data-line-gap-anchor]` 클릭 후 `page.keyboard.press("Enter")` 반복.
- 미리보기는 transform scale로 축소돼 있음(`.exam-preview-zoom-content`). overflow 측정 시 getBoundingClientRect를 scale로 나눠 환산. **썸네일/우측 패널이 같은 `.exam-a4-page`를 또 그리므로 측정은 `.exam-preview-zoom-content` 범위로 한정.**
- 저장: 다운로드 메뉴에서 DOCX 클릭하면 auto-save 됨. examId는 DB에서 최신 exam 조회(academyId로) 또는 playwright download 이벤트로 캡처.

### 파일 렌더/검증
- **HWPX**: hwp-mcp `render_hwp_all_pages`(SVG) → playwright `page.setContent(svg)` 후 svg 스크린샷으로 PNG → Read. `get_hwp_info`로 페이지수/폰트 확인. **단, hwp-mcp 렌더러는 2단 colPr을 1단으로 보이게 그리는 등 실제 한컴과 다를 수 있음(프록시로 과신 금지).**
- **DOCX**: `qlmanage -t -s 1600 file.docx -o dir`(Quick Look 썸네일 — **1쪽만, 제목이 세로로 도는 등 저해상도/왜곡** 있음, 대략 구조 확인용). 텍스트는 `textutil -convert txt`. XML 구조는 `unzip -p file.docx word/document.xml`로 직접 확인(표 `<w:tbl>`, 페이지 나눔 `w:type="page"`, 단 나눔 `w:type="column"`, 행간 `w:line=...`).
- **PDF**: playwright `page.emulateMedia("print")` + `page.pdf()`로 미리보기를 그대로 PDF화(가장 충실). `sips -s format png`로 페이지 PNG.
- **테스트 정리**: 만든 테스트 exam은 네안데르 학원에 쌓이므로 Prisma로 최근 생성분 삭제(examQuestion → exam). 임시파일은 `/tmp/exam-dl` 등.

### 빌드 검사
- `npx tsc --noEmit -p tsconfig.json` (0 errors 목표).
- `npx eslint <file>`.
- 단위테스트 `node --test tests/unit` — **참고: ANTONYM/PARAPHRASE/analysis-report 7개는 내 변경과 무관하게 원래부터 fail(문항 생성 검증 휴리스틱)**.

---

## 6. 새 채팅에서 시작할 때 추천 순서

1. **결정 먼저**: 위 §3 트레이드오프 A/B/C 중 방향 확정(사용자는 A 또는 B 둘 다 열어둠, "다운로드 생성을 우선시"한다고 함).
2. A(다운로드를 미리보기에 맞춤)로 간다면:
   - DOCX는 **표 + cantSplit 금지**(빈 페이지 점프). **ColumnBreak 흐름** 방식 권장(검증상 빈 페이지 없었음). `computePaginatedLayout`(firstPageHeaderPx 미전달=미리보기와 동일) → 페이지의 [좌,우] 단을 순서대로 흘리고 단 경계마다 `ColumnBreak`. `render/fragment.ts`의 part 렌더를 DOCX `DocChild`로 이식(헤더/본문줄/structRows/선지부분/이어짐표시/답란).
   - 빈 줄(custom block)이 있을 때도 레이아웃 경로가 켜지게 `hasCustomBlocks` 가드를 line-gap만 허용하도록 완화.
   - **맑은 고딕 overflow 안전망**: 안전여백을 준 재계산에서 페이지 수가 늘면 네이티브로 폴백.
   - HWPX도 동일 사상으로 line-gap 허용 + 빈 줄 spacing 보정(빈 단락 한 줄, lineSpacingPct 158).
3. B(미리보기를 다운로드에 맞춤)로 간다면:
   - `pagination.ts`의 글자폭 추정 계수를 맑은 고딕 기준으로 보정하거나, 미리보기에 맑은 고딕-호환 웹폰트(@font-face)를 적용해 화면이 실제 출력과 같은 줄바꿈을 갖게. (HWPX/DOCX는 그대로.)
4. 어느 쪽이든 **실제 파일을 만들어 §5로 직접 확인**하며 진행. PDF는 항상 미리보기와 일치하므로 기준선으로 활용.

---

## 7. 주의/함정 모음

- Tailwind v4 `space-y`는 margin-**bottom**(위 §2 버그).
- DOCX 표 `cantSplit`은 한 페이지에 안 들어가면 통째로 다음 쪽 점프(빈 페이지).
- `hasCustomBlocks`가 line-gap spacer까지 잡아 강제 레이아웃을 끔.
- 미리보기는 맥에서 Apple SD Gothic Neo로 폴백(맑은 고딕 미설치). 윈도우면 미리보기도 맑은 고딕이라 더 잘 맞음.
- hwp-mcp 렌더는 2단을 1단으로 보일 수 있음(과신 금지). DOCX는 Quick Look이 저해상도/제목 회전.
- PDF = 미리보기 인쇄(항상 일치). DOCX/HWP = 맑은 고딕(별도 렌더).
- HWPX 다운로드 버튼 접근명은 "HWPX beta"(배지 포함).
- 내보내기 라우트는 `getStaffSession` import는 있으나 export-hwpx는 curl(무인증)으로도 200 받았던 이력 있음 — 인증 동작은 확인하며 진행.
- 테스트 exam은 사용자 학원(네안데르)에 쌓이니 꼭 정리.

---

## 8. 현재 git 상태 (이 문서 작성 시점)

- 내보내기 3파일: **HEAD로 원복됨**(아래). 새 작업은 여기서 출발.
  - `src/app/api/exams/[examId]/export-docx/_lib/build-builder-document.ts`
  - `src/app/api/exams/[examId]/export-hwpx/_lib/break-plan.ts`
  - `src/app/api/exams/[examId]/export-hwpx/_lib/builder.ts`
- 미리보기 line-gap 기능 및 관련 변경: **유지됨**(§2 파일들).
- `tsc --noEmit` 0 errors.
