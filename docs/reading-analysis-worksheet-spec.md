# 직독직해 분석본 학습지 (4번째 variant) — 확정 스펙

> 정본. 2026-08-31 시작. 레퍼런스: `public/12868_2_(s) 1 Two Heroes Who Fought a Deadly Disease.pdf` (12p, 감독이 전장 정독함).
> 목표: 클래스 스튜디오 「학습지 생성」에 4번째 variant **직독직해 분석본(reading)** 을 추가하고,
> 기존 학습지 파이프라인(조판실 문서·편집·문제 추가·빈칸/드릴·단어 생성)에 **완전 연동**한다.

## §0 성공 조건 (1줄)

지문 N개 선택 → 「직독직해 분석본」 라디오 선택 → 생성 → 조판실에 별도 문서 유형으로 등장,
레퍼런스 PDF와 동급의 문장 카드 조판이 A4 인쇄로 나오고, 기존 학습지가 하는 모든 연동(편집·칩 내비·
문제 추가·활동 패널·인쇄/다운로드)이 동작한다.

## §1 레퍼런스 구조 해부 (감독 실측 — 픽셀 단위 관찰)

12페이지, A4 세로. 문장 55개 = 카드 55장. 페이지당 3~5카드.

### §1.1 문서 상위 구조 (순서 고정)

1. **표지 헤더** — 파란 그라데이션(#2b5aa7→#1e3f7a 계열) 라운드 박스:
   - 상단 배지(주황 #e8923a 라운드 필): `2022 개정 교육과정 고등 영어 II` (교육과정/과목 — 메타데이터)
   - 제목(흰색 굵게 ~26px): `Lesson 1. Two Heroes Who Fought a Deadly Disease`
   - 부제(연한 흰색): `NE능률(오선영) | 전 문장 슬래시(/) 구 끊어읽기 & 1:1 직독직해 심층 분석본`
2. **범례 박스** — 연청회색 배경 라운드: `📌 색상별 판서 및 기호 범례:` + 4색 설명
   (빨간색=문법/어법 핵심 · 파란색=핵심 표현/어휘/숙어 · 황토색=접속사/연결사 · 청록색=구조/관계사/분사 · `/`=슬래시 끊어읽기 호흡)
3. **파트 헤더** ×5 — 짙은 남색(#243447 계열) 풀폭 바 + 왼쪽 주황 액센트 두께 ~6px:
   `[본문 N] 한국어 소제목` (예: `[본문 1] 대공황의 절망 속에서 시작된 두 여성 과학자의 밤길`)
   — AI가 지문을 의미 단위 3~6파트로 분할하고 한국어 소제목을 창작.
4. **문장 카드** — 파트 아래에 문장 순서대로.
5. **페이지 푸터** — 중앙: `고등 영어 II [NE능률 오선영] Lesson 1` + 우측: `- N -` (쪽번호).

### §1.2 문장 카드 해부 (핵심 반복 단위)

카드 = 흰(일반) / 연크림(#fdf6ec 계열, 중요문장) 배경 + 라운드 테두리 + 왼쪽 세로 액센트 바
(파랑 #3b82c4(일반) / 주황 #e07b2a(중요)) 4~5px.

내부 5개 층 (순서 고정):

| 층 | 내용 | 시각 |
|---|---|---|
| ① 원문 행 | 번호 배지 + 영어 원문 | 배지: 파란 라운드 사각(일반) / 주황(중요) + ★~★★★ 중요도. 원문 ~15px 짙은 남색, **슬래시 `/`는 주황 굵게 + 좌우 여백**, 색상 하이라이트(§1.3) |
| ② 직독직해 | `👍[직독직해]` + 슬래시 단위 1:1 직역 | 연파랑(#eaf3fd) 박스, 왼쪽 파란 세로바, 파란 글자(#2c66b8). 슬래시 위치·개수 = 원문과 1:1 동일 |
| ③ 완전해석 | `[완전해석]` + 자연스러운 완역 | 연회색(#f4f6f8) 박스, 회색 글자, 점선 상단 구분 |
| ④ 주석 행들 | 라벨 배지 + 해설 1~3행 | 배지: 흰 배경 + 빨강/파랑 테두리 라운드 (예: `어휘` `문법` `표현` `어법` `분사` `분사구문` `시제` `핵심숙어` `전치사구` `수일치` `대명사` `강조구문` `병렬` `관계사` `가정법 과거완료` `수동태` `5형식` `to부정사` `동명사 수동태` `금지/방해구문` `분사수식/부정` `조동사/표현` `어순` `구문/시제` `재귀대명사` `소유격 관계사` `수동태 숙어` `동명사주어 수일치` `과거진행 수동태` — 자유 어휘, 2~8자) + 해설: **볼드 표제**: 설명 (한 행에 `/`로 2개 병기 가능) |

### §1.3 인라인 하이라이트 (원문 내부)

- **빨강(#d63b2f) + 밑줄**: 문법/어법 핵심 (동사 시제·수동태·구문 포인트)
- **파랑(#2c66b8) + 밑줄**: 핵심 표현/어휘/숙어
- **황토(#c98a2d), 밑줄 없음**: 접속사/연결사 (as, but, when, though, because, until, instead…)
- **청록(#2e8b7a), 밑줄 없음(가끔 [대괄호])**: 구조/관계사/분사 수식 (that절, [they faced], suffering from…)
- 하이라이트는 **구/단어 단위**, 문장당 합계 2~6개. 남발 금지 — 카드당 각 색 최대 3.
- `[대괄호]`는 수식·삽입 구조 표시로 원문에 직접 삽입될 수 있음(청록).

### §1.4 직독직해 계약 (품질 핵심)

- 원문 슬래시 조각 수 == 직독직해 조각 수 (1:1). 조각 순서도 원문 순서 그대로(한국어 어순으로 재배열하지 않는다 — 그게 "직독직해").
- 완전해석은 자연 한국어 어순으로 재구성한 완역.
- 중요도: `★0~3`. ★≥1이면 카드가 주황 액센트+크림 배경. (레퍼런스 실측: 55문장 중 ★0 ≈ 24, ★1 ≈ 25, ★★★ ≈ 6 — 대략 절반이 강조. ★★★는 강조구문·가정법·도치 등 킬러 포인트에만.)
- 주석 행: 카드당 1~3행. 각 행 = 라벨 1개 + 해설 텍스트(볼드 표제 + `:` + 설명, `/`로 최대 2~3개 병기).

## §2 상품 정의

- **variant 키**: `reading` (TS 유니언에 4번째로 추가; 마커·DB에는 §5 참조)
- **한국어 이름**: `직독직해 분석본`
- **모달 카피**: 라벨 `직독직해 분석본` / 단가 배지 `지문당 ◈5` /
  설명(=상품 subtitle, §5.2 A-2 와 단일 자구) `전 문장 슬래시 끊어읽기 · 1:1 직독직해 · 완전해석 · 색상 문법 판서 · 교과서/부교재 정밀 분석`
- **과금**: 지문당 ◈5, op는 기존 학습지와 동일 계열(정찰 결과에 따라 확정 — §5).
- **저장/재사용**: 기본 학습지와 동일한 「저장본 재사용/덮어쓰기」 규약을 따른다.

## §3 데이터 모델 (생성 산출물 스키마)

passage_reports 계열 행에 직렬화되는 JSON (마커·필드명은 정찰 후 §5에서 확정):

```ts
interface ReadingAnalysisDoc {
  version: 1;
  header: {
    curriculumBadge: string;   // "2022 개정 교육과정 고등 영어 II" — 미상이면 과목 수준 추정 문자열
    title: string;             // "Lesson 1. Two Heroes ..." — 지문 제목 또는 출처명
    source: string;            // "NE능률(오선영)" 등 출처 — 미상이면 빈 문자열(창작 금지)
    subtitle: string;          // 고정 문구 "전 문장 슬래시(/) 구 끊어읽기 & 1:1 직독직해 심층 분석본"
  };
  parts: Array<{
    label: string;             // "본문 1" (자동 번호)
    titleKo: string;           // 한국어 소제목 (AI 창작 허용 — 지문 내용 요약)
    sentences: number[];       // 이 파트에 속한 문장 no 배열 (연속, 전체를 정확히 분할)
  }>;
  sentences: Array<{
    no: number;                // 1부터 연속
    stars: 0 | 1 | 2 | 3;      // 중요도
    chunks: Array<{            // 슬래시 조각 (원문)
      en: string;              // 조각 원문 (슬래시 미포함)
      ko: string;              // 1:1 직독직해 조각 (원문 어순 그대로)
      marks?: Array<{          // 인라인 하이라이트 (조각 내 부분 문자열)
        text: string;          // 조각 내 실제 부분 문자열과 정확히 일치해야 함
        kind: 'grammar' | 'phrase' | 'connective' | 'structure';
        // grammar=빨강+밑줄, phrase=파랑+밑줄, connective=황토, structure=청록
      }>;
    }>;
    fullKo: string;            // 완전해석
    notes: Array<{
      label: string;           // "어휘" "문법" "분사구문" 등 2~8자 자유 어휘
      tone: 'red' | 'blue';    // 배지 테두리 색 (문법 계열=red, 어휘/표현 계열=blue)
      text: string;            // 평문 "bitterly cold: 몹시 추운 / fiercely: 맹렬하게" — 콜론 앞 표제 자동 볼드(26-08-31 개정: ** 마커 금지, 구본은 렌더 하위호환)
    }>;                        // 1~3개
  }>;
}
```

### §3.1 생성 계약 (프롬프트 게이트 — 위반은 critical)

- C1. `sentences[].chunks[].en` 을 공백 1칸으로 이어붙이면(구두점 앞 공백 정규화 후) **원문 문장과 축자 일치**해야 한다. 원문 개변 금지. 문장 분할은 표준 문장 경계.
- C2. `chunks[].ko` 는 해당 en 조각만 번역(뒤 조각 내용 선반영 금지).
- C3. `marks[].text` 는 그 조각 en의 **부분 문자열로 실존**해야 한다(대소문자 포함 일치).
- C4. `parts[].sentences` 는 1..N 을 **빈틈·중복 없이 분할**. 파트 수 3~6.
- C5. 사실 창작 금지: 출판사/저자 미상이면 `source` 빈 문자열. 임의 숫자·고유명사 추가 = critical.
- C6. 문장 수 상한 없음(교과서 레슨 40~60문장 수용), 지문이 짧으면(모의고사 1지문 ~10문장) 파트 1~2개.
- C7. 주석은 **그 문장에 실존하는 문법 현상**만. 라벨과 해설 불일치 = major.

## §4 렌더 스펙 (A4 인쇄)

> [26-08-31 밀도 실측 교정] 사용자 실사이트 대조 지적(텍스트 과대·세로 비대·여백 과다) →
> 레퍼런스 PDF 를 PyMuPDF 로 직접 실측한 값으로 전 층 교체. **근사 금지 — 이 수치가 정본**:
> 원문 10pt(Medium, 하이라이트만 Bold)·직독직해 8.5pt(원본 9pt Pretendard 계열의 맑은고딕
> 실효 폭 등가)·완전해석/주석 8.5pt·번호 배지 7.5pt·파트 헤더 10pt·표지 제목 14.5pt·범례 8.5pt.
> 층별 검증(카드1 해부): padTop 3.3mm/원문 12.8/gap .8/직독 9.0/gap 1.6/완전 5.8/gap 1.6/
> 주석 11.1/padBot 2.9 = 48.9mm — 우리 렌더가 주석 11.1mm 등 소수점 정합, 잔여 차이는
> 폰트 자폭 줄바꿈뿐. 55문장 전체 렌더 높이 27,987→17,537px(-37%).
> 재검증 계기: `.tmp-reading-qa/measure-layers.mjs`(층별 mm) + `shot-g2-measure.mjs`(블록 mm).

- 기존 학습지 A4 규약(본문폭 184mm, 인쇄 CSS 계약)을 그대로 따른다.
- 카드는 `break-inside: avoid` (카드 내부 절단 금지). 카드 사이에서만 페이지 넘김.
- 파트 헤더는 뒤따르는 첫 카드와 고아 방지(헤더만 페이지 끝에 남기지 않음).
- 표지 헤더·범례는 문서 선두 1회.
- 폰트·크기 계층: 원문 15px(인쇄 시 상대 조정), 직독직해 14px, 완전해석 13px 회색, 주석 12.5px.
- 색상 토큰은 §1.2~1.3 근사값 — 구현은 프로젝트 팔레트로 근사(정확 HEX 강제 아님, 육안 동급).
- 화면(조판실 프리뷰)과 인쇄가 같은 DOM을 쓰는 기존 계약 유지.

## §5 파이프라인 연동 계약 — [2026-08-31 정찰 실측 확정]

정찰 워크플로 wf_525a25f8-2a4 (5렌즈) 실측 기반. 파일:줄 은 정찰 시점 스냅숏.

### §5.1 아키텍처 결정: 「파이널 원페이지 패턴 복제」

파이널 원페이지가 구조적으로 가장 가까운 선례다(자기완결 생성 블록 + 전용 생성기 파일 +
문서 전체를 대체하는 슬롯). 단, **조판은 다르다**: 파이널은 `wrap:"cover"` FlowItem 1개(1장 고정),
직독직해 분석본은 **멀티페이지 문서**라 카드당 FlowItem 로 packFlow 에 참여한다.

### §5.2 수정 지점 전수 (구현 단위)

**A. 상수·타입 (variant 등록)**
1. `src/actions/workbench/passage-constants.ts` — `READING_REPORT_MARKER = "PRIME_READING"` 추가,
   `PRIME_REPORT_MARKERS` 배열(4→5키)·파생 술어에 등록.
2. `src/lib/studio/sheet-products.ts` —
   - `StudioSheetVariant` 에 `"reading"` 추가, `isStudioSheetVariant` 갱신.
   - `STUDIO_SHEET_PRODUCTS` 4번째 상품: label `직독직해 분석본`, subtitle
     `전 문장 슬래시 끊어읽기 · 1:1 직독직해 · 완전해석 · 색상 문법 판서 · 교과서/부교재 정밀 분석`,
     unitCost = unitCostWithBasic = `getPassageAnalysisCreditCost({includeWorksheet:false})` (◈5),
     `koreanSupported: false` (영어 전용 파이프라인).
   - `sheetPromptFlags("reading")` → `{ readingAnalysis: true }`.
   - `SHEET_PLAN_LABEL` 에 `["PRIME_READING", "직독직해 학습지"]` 추가.
     ⚠ 자구 3항 제약(파일 내 주석 정본): ① 첫 어절 「직독직해」는 기존 4키 첫 어절과 상이 ✅
     ② 「기본 학습지」 부분문자열 비포함 ✅ ③ 상품 라벨(`직독직해 분석본`)과 상이 ✅.
3. `src/lib/studio/pick-order.ts` — E30 동반 픽/순서 강제에 reading 순서 규칙 추가
   (기본 → 실전 → 직독직해 → 파이널 권장; 구현 시 기존 비교자 확장).

**B. 발사 체인 (클라)**
4. `workbook-generate-modal.tsx` — 상품 배열 파생이라 카드 자동 렌더.
   지문별 계획 `plans` useMemo 에 reading 분기(견적·덮어쓰기 카운트·koreanExcluded), 라디오 grid 는
   basic/practice 2열 + final/reading 배치 조정(`sm:col-span-2` 정리).
5. `use-studio-queue.ts` — `launchSheets` 에 reading 분기: 항상 fast 라우트,
   promptConfig 에 `sheetPromptFlags` 스프레드(기존 코드 그대로 동작해야 함 — 스프레드가 이미 정본).
6. `use-passage-queue.ts` — `buildAnalysisRequestBody` 에 `readingAnalysis` 전파.
   ⚠ **finalOnepage 계약 복제**: true 일 때만 키 존재(부재 시 요청 바이트 무회귀). normalize(잡 재시도 복원)도.

**C. 서버 판정·API**
7. `src/actions/studio/worksheets.ts` `getStudioSheetStates` — `hasReading`·`readingCached`(덮어쓰기 경고),
   readingReports 질의 1축 추가(기존 5중 Promise.all 에 합류, TAKE 예산 준수).
8. `fast/route.ts` —
   - zod 스키마 `readingAnalysis?: boolean` 추가.
   - 조합 400 게이트: `readingAnalysis` + (`includeWorksheet` | `finalOnepage` | `targetSections`) = 400.
   - 국어 게이트: PRIME_KO 지문 + readingAnalysis = 400.
   - `productOfJobConfig` 에 READING 추가 (⚠ 순서 의존 판정 — finalOnepage 검사와 대칭 위치에).
   - **자기완결 블록** (finalOnepage 블록 :890-1130 패턴 복제): 잡 create → 과금 ◈5 → 생성 →
     품질 게이트(§3.1 C1~C7 서버측 축약판) → `PRIME_READING` PassageReport upsert →
     실패 시 전액 환불 + FAILED + 502. deadline +270s.
   - 활성 잡 가드: 상품 키 READING 로 같은-상품 attach / 타상품 409.
9. `prime/[passageId]/route.ts` — `DocVariant` 에 `"reading"`, `readDocVariant`·마커 산식·
   모양 감지(fail-closed) 갱신. save-as 는 1차 범위에서 `?variant=reading` 400 거절(실전과 동일).
10. `src/trigger/workbench-passage-analysis.ts` — ⚠ 비동기 워커는 PRIME_PRACTICE 도 모르는 비대칭 선례.
    reading 은 fast 전용: 워커 경로에 readingAnalysis 가 실려오면 **명시 거절**(무음 무시 금지).

**D. 생성기 (AI)**
11. `src/lib/passage-report/analysis-report/reading-analysis.ts` 신설 — `final-onepage.ts` 패턴:
    프롬프트 빌더(§3 스키마 + C1~C7 을 지시) + 단일 콜 + 검증 게이트 + 수리 1회.
    모델·effort 는 파이널과 동일 env 핀 계열(신규 env `WORKSHEET_READING_MODEL` 폴백 luna).
    입력: 지문 원문 + (있으면) 기존 PRIME 의 vocabulary/grammar 요약을 컨텍스트로.
    검증 게이트 = `.tmp-reading-qa/gate-schema.mjs` 와 **같은 규칙의 TS 이식판**
    (`validateReadingDoc`) — C1 원문 재조합 축자 대조 포함.
12. 저장 형태 [26-08-31 구현 확정]: `PassageReport.pages` 에 **표준 AnalysisReport 봉투**
    (meta.titleKo 필수 + sections=[reading-analysis 섹션 1개]) — 맨몸 ReadingAnalysisDoc 를 실으면
    GET safeParse 가 null 을 돌려주고 조판 로더가 드롭한다. marker=`PRIME_READING`, templateId=`prime-reading`.

**E. 렌더러**
13. `section-slots.ts` — reading 문서 조기반환 분기(final-onepage :83-87 패턴): 슬롯 1개로 문서 전체 대체.
14. `assemble.tsx` — `pushReadingAnalysis`: 표지 헤더+범례 = wrap `cover` 1개 →
    파트 헤더 = wrap `secheader` → 문장 카드 = 카드당 FlowItem 1개(atomic, 내부 절단 금지).
15. `report-sections/reading-analysis-flow.tsx` 신설 — §1.2 카드 5층 렌더러.
    시각 정본 = `.tmp-reading-qa/proto.html` (감독 제작·레퍼런스 육안 대조 완료).
    기존 프리미티브 재사용 검토: `sentence-canvas.tsx` 의 par-canvas-sep-ch 슬래시 구분은
    필기 캔버스 전용이라 **재사용하지 않는다**(이 문서는 활자 조판이지 손필기 캔버스가 아님).
16. `runs.tsx` — 새 wrap 이 필요하면 등록(기존 `reading` wrap 은 원문+해석 clean 런 소유 —
    **충돌 금지**: 새 wrap 키는 `jikdok` 로 명명). `types.ts` WrapKind 에 `jikdok` 추가.
17. 인쇄: ReportPages/packFlow/인쇄 CSS 기존 계약 그대로(파트 헤더 고아방지는 secheader 가 이미 처리).
    HWPX 다운로드는 1차 제외(학습지 HWPX 대상 목록에 미등록 — 인쇄/PDF 만).

**F. 조판실·활동 연동** — §5.3

### §5.3 조판실·드릴/단어 연동 (정찰 lens 4·5 실측 확정)

**F-1. 문서 형상 (2겹 등록)** — 문서 유형 = planMarker(목록·픽·순서) + section kind(조판 형상) 두 겹.
- 새 섹션 kind `reading-analysis` 1개를 가진 전면 문서 (파이널 패턴).
  `schema.ts` 에 `readingAnalysisSection` 추가(§3 ReadingAnalysisDoc 를 섹션 content 로 수용).
- `section-slots.ts:81-87` final-onepage 패턴으로 **조기반환 슬롯 1개**(headless).
- `NUMBERED_SECTION_LABELS`/`SECTION_LABELS_EN` 동시 등록(미등록 시 헤더 undefined).

**F-2. 조판실 등록 전수** (lens4 【5-a/b/c】 그대로):
- `PRIME_REPORT_MARKERS` 가입(미가입 = worksheet-docs 로더에서 통째 증발).
- 마커 리터럴 **미러 2벌 규약**: `prime/[passageId]/route.ts` 로컬 상수와 passage-constants 를 같은 커밋에.
- `SHEET_PLAN_RANK`: **기존 키 값 무개변**, `PRIME_READING` 은 FINAL(2) 앞 = `1.5` (number Map 이므로 소수 허용;
  구현 시 파일 실측 후 정수 재배열이 더 자연스러우면 기존 상대순서 보존 조건 하에 재배열 허용).
- 동반 픽: `withBasicCompanions` 는 비-PRIME 전부 자동 적용 — reading 도 **의도적으로 그대로 둔다**
  (단어시험지 승격 주입이 부모 PRIME 에 의존하므로 동반이 이득. 기본 행이 없으면 무동작 규칙 3 그대로).
- joinPrev: 확장하지 않는다 — reading 은 자기 표지를 가진 독립 완결 문서(연속 조판 아님).
- `sheet-deploy-eligibility.ts` BLOCKED_REASON 자구 열거에 상품명 추가(판정은 자동 fail-closed).
- REPORT_TAKE 900 → **1200** + truncated 판정식 동반 상향(worksheets.ts:65-78 주석 지시 준수).
- 칩/배지/목차/도시에/실행대 = SHEET_PLAN_LABEL 파생이라 정본 1곳 수정으로 자동 반영(리터럴 복제 금지).

**F-3. 저장 축 (부모 덮어쓰기 방지 — 같은 커밋 필수)**:
`DocVariant` 유니언(route.ts:38) + `readDocVariant` + GET/PATCH 마커 산식 + reading 모양 자기감지 백스톱
+ 편집기 `docVariant` prop 유니언(:488) + `docVariantQuery` + 호스트 `activeDocVariant`(:1475-1479)
+ `prime-analysis-view.tsx` 로더/폴백 체인. save-as 는 `?variant=reading` **명시 400 거절**(practice 패턴).

**F-4. 활동(빈칸·드릴) 연동 — 핵심 결정**:
활동 카드 판정은 실데이터(GenContext)로만 — 문서 종류 스위치 금지(study-activities.ts:1108 계약).
따라서 `extractGenContext`(study-activities.ts:125-207)에 **`reading-analysis` 섹션 폴백을 추가**한다:
`sentences[].chunks[].en` 조각 병합 → 문장 en, `chunks[].ko` → 문장 gloss 계열, notes → 어휘 후보.
이것으로 12종 활동 카드가 실데이터 판정으로 자연 활성화된다(팔레트 전량 잠김 회피 —
실전이 밟은 함정을 밟지 않는 유일한 정합 경로). `resolveActivityGenReport` 는 **건드리지 않는다**
(기본 문서 바이트 동일 무회귀 유지).

**F-5. 단어시험지 승격 주입**:
- `injectedVocabDoc = finalOnepage || practiceDoc` (editor :670) → `|| readingDoc` 추가.
- 호스트 `activeChildPassageId`(:1465-1466) 판정에 reading 추가(부모 PRIME fetch 발사).
- 부모 PRIME 없으면 **잠김 카드 + 사유** 분기(:3212)에 합류시켜 「무설명 증발」 금지.
- `vocabRowsFromMustKnow`(final 전용)는 1차 범위에서 확장하지 않는다.

**F-6. 실전 툴바 누수 차단**: `worksheetSupported`(:2829)·`showGenerateWorksheet`(:3080)·
`saveAsSupported`(:2833) 부정 목록에 readingDoc 추가 (reading 문서 위에서 실전 생성/사본 저장 버튼 금지).

**F-7. 문항(시험지) 합류**: 문항 축은 docKey 앵커라 문서 종류 무관 — **추가 등록 0으로 자동 합류**
(reading 문서가 지문 그룹 마지막 ready 문서면 그 뒤에 문제가 붙는다). 검증 게이트로 확인만 한다.

**F-8. 디지털 스터디(모바일)**: `generationPlan === PRIME` **소비처 게이트**(study-item-preview 드롭)로 배제 — 여기에 더해 배정 선택기(`study-assignments/pickers.ts`)의 무마커 질의는 이번에 PRIME 필터로 봉합(후보에 떴다가 뷰어에서 무설명 빈 화면이 되던 선재 구멍).

**F-9. 미리보기 모달**: `LearningSheetVariant` 에 reading 추가 + `prime-reading-sample.json`
(견본 픽스처 `.tmp-reading-qa/fixture-two-heroes.json` 에서 제작) + 탭 추가.
지문 등록 페이지(passage-input-stack)는 **1차 범위 제외**(스튜디오 모달만 — 사용자 요청 표면).

**F-10. variant 유니언 4벌 동시 확장**: `StudioSheetVariant` · `LearningSheetVariant` ·
편집기 `docVariant` prop · API `DocVariant` + `isStudioSheetVariant` (passage-input-stack 좁힘 술어는 1차 제외라 무변).

## §7 구현 유닛 분해 (팬아웃 소유권 지도)

| 유닛 | 소유 파일(만 수정) | 내용 |
|---|---|---|
| U0 토대 | schema.ts · passage-constants.ts · sheet-products.ts · pick-order.ts · sheet-pick-types.ts · passage-analysis-credit-costs.ts(무변 예상) | 섹션 스키마·마커·4번째 상품·랭크·타입. 모든 유닛의 전제 |
| U1 생성기 | lib/passage-report/analysis-report/reading-analysis.ts(신설) | 프롬프트+단일콜(장문 2분할)+validateReadingDoc+수리 1회 |
| U2 생성 API | fast/route.ts · trigger/workbench-passage-analysis.ts | 자기완결 블록·조합 400·productOfJobConfig·워커 명시 거절 |
| U3 문서 API·서버판정 | prime/[passageId]/route.ts · save-as/route.ts · actions/studio/worksheets.ts · worksheet-docs.ts(확인) | DocVariant·마커 미러·save-as 거절·hasReading·REPORT_TAKE 1200 |
| U4 렌더러 | report-sections/(section-slots.ts · section-flow.tsx · assemble.tsx · reading-analysis-flow.tsx 신설 · types.ts · 라벨 맵) · report-pages/runs.tsx · 인쇄 CSS | 카드 5층 조판. 시각 정본 = .tmp-reading-qa/proto.html |
| U5 모달·발사 | workbook-generate-modal.tsx · use-studio-queue.ts · use-passage-queue.ts · learning-sheet-preview-modal.tsx · prime-reading-sample.json | 4번째 라디오·plans 견적·readingAnalysis 와이어·미리보기 |
| U6 조판실·편집기 | sheet-compose-surface.tsx · AnalysisReportEditor.tsx · prime-analysis-view.tsx | activeDocIsReading·docVariant 배선·injectedVocabDoc·부정목록 3종 |
| U7 활동 엔진 | study-activities.ts | extractGenContext reading-analysis 폴백 (순수·결정론 유지) |

파일 소유 충돌 0 확인. U0 → (U1~U7 병렬) → 검수/수정 파이프라인 → 게이트.

## §5.9 검증 원장 [2026-08-31 — 구현·검수·수리·재검증 완주]

- **파이프라인**: 정찰 5렌즈 → 구현 8기(U0~U7) → 적대 검수 6렌즈(critical 0·major 11·minor 19)
  → 픽스 5기(rejected 0) → 재검증 2렌즈(24/24 착지) → 잔여 minor 2건 감독 직접 수리.
- **최종 게이트 상태**: 전역 tsc 0 · `next build` 정상(라우트 맵 전체 출력 확인) ·
  ws-gate 11/11 PASS(G1=4상품) · contract 테스트 2/2(readingAnalysis presence+재시도 왕복 포함) ·
  G1 스키마 게이트 GREEN+음성 5종 RED(_inject-c1/c3/c4/c1count/c1volume) ·
  G2 렌더 육안 대조 GREEN(레퍼런스 동급, `.tmp-reading-qa/g2-shot.png`) ·
  스파인 55/55 실측(probe-spine-split 4/4) · vocab-match 임계 프로브 3/3.
- **E2E 실생성 [26-08-31 완료]**: 레퍼런스 55문장 실지문 × 실모델(luna) 생성기 직접 호출
  (`.tmp-reading-qa/e2e-generate.tsx`, 앱 과금 우회) — **1차 실패가 생성기 결함 2건을 실측으로 적발**:
  ① 반분할 27문장 콜이 200s 타임아웃(luna 분산) → **세그당 ≤20문장 N분할**로 수리
  (`SEGMENT_MAX_SENTENCES=20`, 세그별 파트 상한 floor(6/segCount)로 병합 ≤6 유지)
  ② 모델이 marks.text 에 따옴표 변형을 써 C3 실패(수리 콜로도 재발) → **파스 후 `repairChunkMarks`**
  (쿼트·대시 정규화 평면에서 en 실제 자구로 교정, 불가 시 해당 mark 만 드롭 — 게이트 완화 금지:
  marks 는 렌더러 문자열 매칭 재료라 게이트만 풀면 하이라이트 무음 소실).
  2차 런 **GREEN**: 3세그 병렬 106~151s(수리 콜 0)·55/55 문장·파트 6·별점 25/19/9/2 ·
  TS+mjs 게이트 쌍 GREEN(blocking 0, minor=하이라이트 밀도 2) · 원문 축자 일치 ·
  실물 렌더 스크린샷(`.tmp-reading-qa/e2e-shot.png`) 레퍼런스 육안 동급.
- **실환경 육안 검증 [26-08-31 완료]**: dev 하네스(`/dev/passage-report?sample=reading`, 실생성
  55문장 등록 — `_reading-e2e.json`)에서 실폰트·실 편집 캔버스·packFlow 실측:
  13페이지 페이지네이션 정상(잔여 4~38mm), **편집 모드 주석 볼드 실동작(`**` 노출 0)**,
  활동 팔레트 실데이터 개방(빈칸 4종·직독직해 3종 미리보기 채움 — extractGenContext 폴백 실증),
  단어시험지 잠김 사유 정상. ⚠ **파트 헤더 앞 페이지 하단 공백(최대 ~68mm)은 정상 동작의
  필연** — 파트 헤더+첫 카드 원자 쌍(헤더 고아 방지)이 잔여보다 크면 함께 이월된다(원본 PDF 도
  같은 규칙). 밀도 교정 전에는 이 공백이 ~2배였다.
- **모델 통일 [26-08-31 사용자 확정 「무조건 3.7flash」]**: 학습지 전 계열 폴백 gemini-3.7-flash 로
  전환 — reading·코어(resilient-generate)·실전 2종(generate)·파이널(final-onepage, **effort 폴백
  xhigh→high 동반** — gemini 비호환 자기 경고 이행). 롤백은 env 핀. md-qgen luna-lane 은 별도 축(무접촉).
- **미실행 게이트**: fast 라우트 경유 실서비스 발사(크레딧 과금 경로 — 스튜디오 UI 에서 사용자 확인) ·
  behavior-exam-studio 전체 재주행(reading 행이 실존하는 클래스 필요) · HWPX(1차 제외) ·
  기존 3상품의 3.7-flash 생성 품질 실측(모델 전환 후 첫 실생성 확인 권장).

### 알려진 한계 원장 (수용 결정)

1. **약어 스파인 트레이드오프**: `splitReadingSentences` 가 문장 말미 `etc.` / `St.` 등
   리스트 약어에서 다음 문장을 병합할 수 있다(Mr./Dr. 과분할 방지의 이면 — 재검증 R1 실측).
   생성·게이트가 같은 스파인을 쓰므로 자기정합은 유지(무음 결함 아님). 빈발 시
   「다음 조각이 소문자로 시작할 때만 병합」으로 조일 것.
2. **카드 물리 한계**: 카드 1장(표지+헤더 동반 시 쌍)이 A4 본문높이(261.2mm)를 넘는 극단
   케이스는 packFlow 설계상 강등(절단) — C1-volume 게이트(90단어/20조각)가 사전 차단.
3. **첫 파트 헤더 고아**: atomic+keepWithNextGroup 쌍으로 230mm 카드까지 동반 보증,
   그 이상은 물리 불가(빈 페이지 초과)로 엔진 설계 한계.
4. **문장 수 셈**: 스파인이 단일 진실원 — 대시/특수 경계로 사람 셈과 ±1 가능. 「55장 카드」류
   개수 약속 카피 금지.
5. **디지털 스터디(모바일)**: reading 은 인쇄 전용(배포 fail-closed·스터디 소비처 게이트 배제) — 1차 범위.
6. **지문 등록 페이지**(passage-input-stack): 1차 제외 — 2차에 열 때는 발사 카드부터 만든 뒤
   미리보기 variants 를 넘겨야 무음 오발사가 없다(모달 variants prop 주석 참조).

## §6 검수 게이트 (하네스)

- G1. 스키마 게이트: 생성 JSON이 §3 스키마 + C1~C7 통과 (자동 스크립트).
- G2. 렌더 게이트: 견본 지문 1개 → Playwright 스크린샷 → 레퍼런스 p1 과 육안 대조(감독 직접).
- G3. 조판실 연동 게이트: 문서 등장·칩 라벨·순서·편집·인쇄 프리뷰 (프로브 스크립트).
- G4. 과금 게이트: 생성 시 op 1건·금액 정확 (DB 실측).
- G5. 음성테스트: C1 위반(원문 개변) 주입 → G1이 RED 인지 확인. 렌더 결함 주입 → G2 RED 확인.
- G6. 회귀 게이트: 기존 3 variant 생성·조판·인쇄 그대로 (기존 프로브 재주행).
