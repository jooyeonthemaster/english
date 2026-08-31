# 확정 스펙 — 「내신 변형문제 · 내신 지문분석 · 교과서별 지문분석 × AI」 콘텐츠 24건 신설

버전 v1.0 · 2026-08-27 · **이 문서가 유일한 진실원이다.** 작업 에이전트는 채팅 맥락이
아니라 이 문서만 읽고 작업한다.

---

## 1. 배경 — 왜 이걸 만드는가

전수 실측(`docs/seo-status-2608.md` §4.7)에서 확정된 사실:

- SEO 자산 58건의 `targetKeyword` 중 **「AI」 0건, 「구문」 0건, 「지문 분석」 1건, 「내신」 3건**
- 「변형문제」는 16건이나 되지만 **전부 수식어가 수능특강·수능완성·EBS·모의고사·교과서출판사** —
  **「내신 × 변형문제」 교차점이 통째로 비어 있다**
- 최대 카테고리 `types` 21건(36%)은 「빈칸추론 문제」류 **유형명** = 학생·정보탐색 의도.
  `/types` 실적이 이를 증명한다 — **136노출 4클릭, CTR 2.9%**
- 결론: **우리는 학생이 칠 말에 21건을 쓰고, 원장이 칠 말에 0건을 썼다.**

실측 근거(콘솔):
- 네이버에서 **「영어 변형문제 제작」 82노출**, **「영어 지문 분석 방법」 31노출/CTR 16.1%**,
  **「영어 구문 분석」 19노출/CTR 15.8%** 로 이미 수요가 확인됨. 그런데 **전용 자산이 없다.**
- 구글 `/features/ai-question-generation` 은 메타가 이미 정확한데(`AI 영어 문제 생성 —
  내신·수능 24유형 자동 출제`) **3개월 노출 51** — 허브를 떠받칠 스포크가 없다.

**이 작업의 목적**: 「내신 × 변형문제 × AI」와 「지문분석」 축에 스포크 24건을 심어
`/features/ai-question-generation`·`/features/passage-analysis` 허브의 토픽 권위를 세운다.

---

## 2. 성공조건 (객관적 정의)

1. `node scripts/seo/validate-articles.mjs` → **오류 0건** (종료코드 0)
2. `articles-content.json` 이 50건 → **74건**
3. 신규 24건 전부 `targetKeyword` 유일 (카니벌라이제이션 0)
4. 적대 검수에서 **critical 0건**
5. 빌드 통과 (`npx tsc --noEmit` 또는 `npm run build`)

---

## 3. 신설 목록 24건 — 확정

슬러그·카테고리·타깃키워드는 **변경 금지**. 최종 URL = `<허브경로>/<slug>`
(`types`→`/types`, `exams`→**`/exam-prep`**, `textbooks`→`/textbooks`, `guides`→`/guides`)

### 축 A — 내신 변형문제 (8건)

| # | slug | category | targetKeyword | 이 글만의 각도(중복 방지) |
|---|---|---|---|---|
| A1 | `naesin-variant-questions` | guides | 영어 내신 변형문제 | **축 허브.** 내신 변형문제의 정의·수능 변형문제와의 결정적 차이(출제 범위가 학교 진도에 묶임)·학원이 직접 만들어야 하는 이유 |
| A2 | `naesin-variant-ai` | guides | 영어 내신 변형문제 AI | AI 생성의 실제 한계와 검수 체크리스트. "AI가 만든 문제를 그대로 내면 안 되는 이유"와 원장이 최종 검수할 5지점 |
| A3 | `naesin-english-ai` | guides | 영어 내신 AI | 내신 대비 **전 과정**(지문 확보→분석→출제→조판→리포트)에서 AI가 담당 가능한 구간과 사람이 남아야 하는 구간 |
| A4 | `naesin-question-program` | guides | 내신 영어 문제 출제 프로그램 | 도구 선택 기준. 문제은행형 vs 생성형 비교, 학원 규모별 판단 기준 |
| A5 | `naesin-variant-workflow` | guides | 영어 내신 변형문제 제작 | **실무 워크플로 단계별 매뉴얼.** 시험 4주 전부터 역산한 제작 일정표 |
| A6 | `school-exam-variant` | guides | 학교별 영어 내신 변형문제 | 같은 교과서라도 학교마다 다른 출제 관행(부교재·프린트·범위 공지) 대응법 |
| A7 | `go1-naesin-english` | exams | 고1 영어 내신 변형문제 | 고1 특수성 — 중등→고등 전환, 첫 내신, 공통영어1·2 신과정 |
| A8 | `go2-naesin-english` | exams | 고2 영어 내신 변형문제 | 고2 특수성 — 과목 분화(영어Ⅰ/Ⅱ·영어독해와작문), 수능 연계 시작 |

### 축 B — 내신 지문분석 (8건)

| # | slug | category | targetKeyword | 이 글만의 각도 |
|---|---|---|---|---|
| B1 | `naesin-passage-analysis` | guides | 영어 내신 지문 분석 | **축 허브.** 내신 지문 분석이 수능 지문 분석과 다른 점(범위가 닫혀 있어 전수 분석이 가능·필수) |
| B2 | `passage-analysis-method` | guides | 영어 지문 분석 방법 | **방법론 정본.** 7단계 분석 절차(직독직해→구문→어휘→논리구조→주제→출제포인트→오답설계) ※네이버 CTR 16.1% 실증 쿼리 |
| B3 | `passage-analysis-ai` | guides | 영어 지문 분석 AI | AI 분석의 정확도 한계·검증법. 오분석이 나오는 전형적 지점 |
| B4 | `english-syntax-analysis` | guides | 영어 구문 분석 | 구문 분석 단독 심화 — 절 구조·수식 관계 표기법, 학생이 실제로 읽는 표기 ※네이버 CTR 15.8% 실증 쿼리 |
| B5 | `literal-translation-worksheet` | guides | 영어 직독직해 자료 | 직독직해 자료의 끊어읽기 단위 설계와 A4 조판 |
| B6 | `passage-vocabulary-sheet` | guides | 영어 지문 어휘 정리 | 지문 기반 어휘 추출 기준(빈도·난이도·시험 출제 가능성) |
| B7 | `naesin-passage-range` | exams | 내신 영어 지문 범위 정리 | 시험 범위 확정·누락 방지 실무. 교과서+부교재+모의고사+프린트 4계통 관리 |
| B8 | `mock-exam-passage-analysis` | exams | 모의고사 영어 지문 분석 | 모의고사 지문을 내신에 재활용하는 구조(많은 학교가 모의고사를 내신에 포함) |

### 축 C — 교과서별 지문분석 (8건)

| # | slug | category | targetKeyword | 필수 차별화 |
|---|---|---|---|---|
| C1 | `textbook-passage-analysis-ai` | textbooks | 영어 교과서 분석 AI | **축 허브.** 출판사 무관 공통 방법론 + 8개 출판사 글로 분기하는 내부링크 |
| C2 | `neungyul-passage-analysis` | textbooks | 능률 영어 교과서 지문 분석 | 능률 채택본 |
| C3 | `ybm-passage-analysis` | textbooks | YBM 영어 교과서 지문 분석 | YBM — **박준언본·김은형본** 구분 |
| C4 | `chunjae-passage-analysis` | textbooks | 천재 영어 교과서 지문 분석 | 천재 — **조수경본·이재영본** 구분 |
| C5 | `visang-passage-analysis` | textbooks | 비상 영어 교과서 지문 분석 | 비상 채택본 |
| C6 | `donga-passage-analysis` | textbooks | 동아 영어 교과서 지문 분석 | 동아 채택본 |
| C7 | `jihak-passage-analysis` | textbooks | 지학사 영어 교과서 지문 분석 | 지학사 채택본 |
| C8 | `miraen-passage-analysis` | textbooks | 미래엔 영어 교과서 지문 분석 | 미래엔 채택본 |

---

## 4. 스키마 계약 (`ArticleEntry`)

`src/lib/seo/articles-content.ts` 의 타입이 계약이다. JSON 객체 1개 = 아티클 1개.

```
slug            string   소문자 케밥케이스
category        "types" | "exams" | "textbooks" | "guides"
targetKeyword   string   §3 표의 값 그대로
metaTitle       string   15~70자. 타깃 키워드를 반드시 포함
metaDescription string   60~200자. 타깃 키워드 포함 + 이 글의 고유 각도 명시
keywords        string[] 8~12개
updatedAt       "2026-08-27"
eyebrow         string   빵부스러기용 짧은 라벨
h1              string   metaTitle 과 달라야 함(더 길고 서술적)
intro           string[] 3문단. **첫 문단은 반드시 "X는 ~입니다" 정의문**(네이버 지식스니펫)
sections        Section[] 5~7개
faq             {question,answer}[]  5개
ctaTitle        string
ctaBody         string
related         {href,label,description?}[]  4~6개
```

```
Section {
  heading     string        H2
  paragraphs  string[]      2~4개. 각 원소가 <p> 하나
  bullets?    string[]
  table?      { headers: string[]; rows: string[][] }   // 모든 row 길이 == headers 길이
  callout?    { title, body }
  sample?     { passage, question, options?[5], answer, explanation }
}
```

---

## 5. 품질 기준선 — 견본

**참조 견본**: `src/lib/seo/articles-content.json` 의 `common-english-guide`
(총 8,571자 / intro 3문단 / sections 6 / faq 5 / sample 1 / related 6)

**신규 24건도 이 수준에 맞춘다.** 최소선: 총 5,000자 이상, sections 5개 이상, faq 5개.
문체는 **합니다체**, 독자는 **영어학원 원장·강사**(학생 아님).

---

## 6. 금지사항 (위반 = critical)

1. **기출 지문 인용 절대 금지.** `sample.passage` 는 **전량 창작 영어 원문**이다.
   수능·모의고사·EBS·교과서 실제 지문을 그대로 옮기면 저작권 위반이다.
2. **사실·숫자 창작 금지.** 확인되지 않은 저자명·단원 수·페이지 수·통계·연도를 지어내지 마라.
   - 교과서 저자 표기는 **§3 표에 명시된 것만** 사용(박준언·김은형·조수경·이재영).
     그 외 출판사는 **「채택본」·「검정본」 같은 일반 표기**를 쓴다. 이는 기존 자산의 확립된 관행이다.
   - 불확실하면 **쓰지 마라.** "약 N개" 같은 얼버무림도 금지.
3. **타사 서비스 비방 금지.** 비교는 기능 축으로만.
4. **`targetKeyword` 중복 금지.** §3 배정값만 사용.
5. **`related.href` 는 실존 경로만.** §7 목록 밖의 경로 금지.
6. **교과서 8건(C2~C8)의 본문 재탕 금지.** 출판사명만 바꾼 동일 문장은 doorway page 로
   구글 제재 대상이다. 각 글은 그 출판사 고유의 확인법·자료 수급 상황·실무 팁을 담아야 한다.
7. **다른 아티클 파일을 건드리지 마라.** 각 에이전트는 **자기 1건만** 출력한다.

---

## 7. `related.href` 로 쓸 수 있는 실존 경로

**기능 허브(우선 연결 대상 — 토픽 권위를 여기로 수렴시킨다)**
```
/features/ai-question-generation   AI 영어 문제 생성
/features/passage-analysis         영어 지문 분석
/features/exam-builder             Word·한글 시험지 제작
/features/exam-report              시험 리포트
/features/question-extraction      지문·문항 추출
/features/academy-erp              영어학원 관리
```

**허브 인덱스**: `/guides` `/types` `/exam-prep` `/textbooks` `/resources` `/faq` `/glossary` `/about`

**기존 아티클** (경로 = 허브경로 + slug)
```
/guides/    chatgpt-question-limits · explanation-sheet · grading-rubric · exam-paper-template
            passage-extraction · lesson-material-routine · mock-exam-playbook · vocab-test-maker
            program-selection · question-bank-vs-ai
            ebs-variant-questions · english-descriptive-questions · word-english-exam-paper
            blank-inference-questions · grammar-questions · english-question-bank
            mock-exam-variant · english-passage-analysis-worksheet
/exam-prep/ go1-march-mock · go1-mock-english · go2-mock-english · go3-mock-english
            mock-exam-calendar · suneung-english · suneung-teukgang · suneung-dokhae
            suneung-wanseong · naesin-exam-period
/textbooks/ common-english-guide · neungyul-english · ybm-english · chunjae-english
            visang-english · donga-english · jihak-english · miraen-english · textbook-copyright
/types/     blank-inference · grammar-error · grammar-choice · vocab-in-context · sentence-order
            sentence-insert · topic-main-idea · title-inference · implied-meaning
            reference-inference · content-match · summary-completion · irrelevant-sentence
            descriptive-overview · conditional-writing · sentence-transform · summary-writing
            word-arrangement · grammar-correction · topic-sentence-writing · synonym-antonym
```

**신규 24건 상호 링크도 허용** — §3 표의 slug 를 해당 허브경로에 붙이면 된다.

### 내부링크 요구사항
- `related` 4~6개 중 **최소 1개는 기능 허브**(`/features/...`)
- **최소 2개는 같은 축의 다른 신규 글**(축 내 결속)
- **최소 1개는 기존 아티클**(기존 자산과 연결)

---

## 8. 산출 형식

에이전트는 **`ArticleEntry` JSON 객체 1개**만 반환한다. 배열·주석·마크다운 코드펜스 금지.
파일에 직접 쓰지 않는다 — 감독이 취합해 `articles-content.json` 에 병합한다.

---

## 9. 검증 — 게이트 2종 (둘 다 음성테스트 통과)

```bash
node scripts/seo/validate-articles.mjs          # 스키마·중복·링크·분량. 오류 0건이어야 함
node scripts/seo/cross-similarity.mjs           # 아티클 간 중복도(doorway). 위험쌍 0이어야 함
node scripts/seo/cross-similarity.mjs --cat textbooks   # 교과서 축 집중 점검
node scripts/seo/merge-articles.mjs <입력.json> # 팬아웃 산출물 멱등 병합
```

### 9.1 `validate-articles.mjs` — 결함 11종 주입 음성테스트 통과 (2026-08-27)

`DUP_SLUG` · `DUP_TARGET_KEYWORD` · `DUP_META_TITLE` · `RELATED_BROKEN` · `RELATED_SELF` ·
`SECTION_THIN` · `THIN_CONTENT` · `TABLE_RAGGED` · `KEYWORD_NOT_LANDED` ·
`SLUG_CROSS_SOURCE` · `TARGET_CROSS_SOURCE` — **전부 검출 확인.** 종료코드 0/1 정상.

> 교차소스 2종은 이번에 신설했다. `/guides/[slug]` 는 `guides-content.json`(랜딩 셸)과
> `articles-content.json`(category:"guides") 두 소스를 함께 서빙하는데, 라우트 주석은
> "슬러그는 두 소스에 걸쳐 유일해야 한다(검증 스크립트에서 보장)"고 적어 두었으나
> **그 스크립트는 실재하지 않았다.** 슬러그가 겹치면 한쪽이 조용히 가려진다.

### 9.2 `cross-similarity.mjs` — doorway 검출 음성테스트 통과 (2026-08-27)

한글 4-gram Jaccard + 완전일치 문장 추출. 임계 WARN ≥ 0.30 / DANGER ≥ 0.45.

- 기준선: **기존 교과서 9건은 전부 0.30 미만** — 실제로 차별화돼 있음이 확인됨
- 음성테스트: 출판사명만 치환한 완전 클론 → **0.979 DANGER, 완전일치 문장 88개** 검출
- 음성테스트: 절반만 다시 쓴 부분중복 → **0.717 DANGER, 68개** 검출
- 위험쌍 존재 시 종료코드 1 (CI 게이트로 사용 가능)

### 9.3 라우팅 확인

`/guides/[slug]` · `/exam-prep/[slug]` · `/textbooks/[slug]` · `/types/[slug]` 전부 실재하며
`createArticleRoute` + `dynamicParams = false` 로 동작한다. **JSON 에 항목을 추가하면
라우트·사이트맵·RSS·허브 목록에 자동 편입**된다(`PUBLIC_ROUTES` 가 `ARTICLES` 를 map).

---

# 개정 v1.1 (2026-08-28) — 전역 정합 검수 반영

1라운드(집필·검수·수정 69기)와 2라운드(재검증·재수정·정합 24기)를 거친 뒤,
**전역 정합 검수**가 단위 검수로는 구조적으로 잡히지 않는 결함 15건을,
**완전성 비평**이 11건을 보고했다. 그중 확정 처방을 여기 정본으로 박는다.

## 10. 확정 정본 — 여러 글에 복제되는 사실은 여기서만 정의한다

팬아웃은 같은 사실을 여러 표면에 복제한다. 아래 항목은 **이 절이 유일한 정의**이며,
개별 글은 자기 버전을 새로 만들지 말고 이 정의를 따르거나 정본 글로 위임한다.

### 10.1 지문 분석 모델 — 7단계 (정본: `passage-analysis-method`)

```
① 직독직해 → ② 구문 → ③ 어휘 → ④ 논리구조 → ⑤ 주제 → ⑥ 출제 포인트 → ⑦ 오답 설계
```

- **정본 글은 `/guides/passage-analysis-method` 하나다.** 여기서만 전체 단계를 상술한다.
- `naesin-passage-analysis`(축B 허브)는 **자체 모델(6층 등)을 정의하지 않는다.**
  이 7단계를 인용하고 「내신에서 어느 단계에 힘을 싣는가」라는 자기 각도만 다룬다.
- 교과서 축(C1~C8)이 「층」을 언급할 때도 이 7단계를 따르고, 개수를 바꿔 부르지 않는다.

### 10.2 문항 검수 5지점 — (정본: `naesin-variant-ai`)

```
① 정답 유일성  ② 오답 매력도  ③ 지문 근거  ④ 기억 차단  ⑤ 난이도 정합
```

- **정본 글은 `/guides/naesin-variant-ai` 하나다.**
- `naesin-variant-workflow`·`naesin-english-ai` 는 **다른 개수·다른 이름의 목록을 만들지 않는다.**
  검수 단계를 언급할 때는 이 5지점을 그대로 쓰거나 정본 글로 위임한다.
- 「AI 분석 결과 확인 지점」류 목록도 같은 원칙 — 정본은 `/guides/passage-analysis-ai` 하나다.

### 10.3 고1 자료 운영 — (정본: `go1-naesin-english`)

- **정본**: 고1은 과목명은 공통(공통영어1·2)이지만 **학교별 채택본이 갈리고, 같은 출판사
  안에서도 저자 표기로 판본이 갈린다.** 따라서 반을 학교·채택본 단위로 편성해야 하고
  자체 제작 비중이 크다.
- `go2-naesin-english` 는 「고1은 학년 공통 한 벌로 커버된다」는 취지의 서술을
  **전부 제거한다**(본문·표·related description 포함). 고2의 차별점은
  「채택본이 갈린다」가 아니라 **「과목 자체가 갈린다」** 위에 세운다.

### 10.4 창작 샘플 지문 — 소재 배타 배정

같은 소재·같은 논지의 지문이 여러 글에 나오면 자기중복이다. 아래 배정을 지킨다.

| 글 | 소재 | 비고 |
|---|---|---|
| `naesin-variant-questions` | 음식물 손실(food waste) | 유지 |
| `naesin-passage-range` | 지도(map) | **지도 논지는 이 글만** |
| `english-syntax-analysis` | 도서관 선반 | **도서관 배경은 이 글만** |
| `naesin-variant-ai` | **교체** — 시간 측정/시계 계열 | 지도 금지 |
| `naesin-variant-workflow` | **교체** — 씨앗 보관/종자은행 계열 | 도서관 금지 |
| `passage-analysis-ai` | **교체** — 소리·소음 계열 | 도서관 금지 |

- 정답 번호도 글마다 분산한다(모두 ②로 몰지 않는다).

### 10.5 한글(HWPX) 출력 성숙도 — **해소됨 (2026-08-31 사용자 확정: 베타 아님)**

> **확정**: 한글(HWPX) 내보내기는 **베타가 아니다.** 2026-08-27 HWPX 대개편(`b28bcd98`)
> 이후 정식 기능이며, 낡은 「베타」 라벨을 코드 7곳·아티클 2곳에서 제거했다.
> 제거 위치: `features/exam-builder/page.tsx`(5) · `features/ai-question-generation/page.tsx`(1)
> · `components/landing/exam-paper-scene.tsx`(1) · 아티클 `naesin-question-program`(2).
> 단 「베타 아님」이 「Word 와 픽셀 동일」을 뜻하지는 않으므로 표현은 **지원 사실까지만** 남겼다.
>
> 아래는 결정 이전의 기록이다.

#### (기록) 결정 이전 상태

- `src/app/features/exam-builder/page.tsx` 는 5곳에서 「한글(HWPX, **베타**)」이라 쓴다.
  그런데 그 파일의 최종 수정은 **2026-08-22** 이고, **HWPX 대개편은 2026-08-27**
  (커밋 `b28bcd98` + 사용자 공지 릴리즈 노트)에 나갔다. **즉 베타 라벨이 5일 낡았다.**
- 신규 24건 중 18건이 한글을 언급하고 그중 1건(`naesin-question-program`)만 베타를 명시한다.
- **어느 쪽이 참인지는 제품 결정 사항이다.** 확정 전까지 이 표현을 일괄 수정하지 않는다.
  사이트 전역 명칭(`feature-links.ts` 의 「Word·한글 시험지 제작」)과는 이미 정합하므로
  현 상태로도 모순은 아니다.

## 11. 내부링크 구조 요건 (강화)

전역 정합 실측에서 **고아 4건**(`naesin-question-program`·`school-exam-variant`·
`donga-passage-analysis`·`jihak-passage-analysis` — 신규 24건 중 아무도 링크하지 않음)과
**기존 50건 → 신규 24건 링크 0개**가 확인됐다.

- 신규 글을 수정할 때 `related` 에 **위 고아 4건 중 최소 1건**을 우선 편입한다.
- 본문에서 다른 글로 **위임하는 문장을 쓴다면 그 글을 `related` 에 반드시 넣는다.**
  「~는 다른 글에 정리해 두었습니다」라고 쓰고 링크가 없으면 독자를 버리는 것이다
  (실제로 `go2-naesin-english` 가 두 번 위임하고 두 번 다 링크가 없었다).
- 기능 허브 → 축 허브 역링크는 **감독이 처리 완료**했다
  (`src/lib/seo/feature-links.ts` 의 `TOPIC_SPOKES`, `relatedForFeature`).
  개별 글은 이 부분을 건드리지 않는다.

## 12. 미해결 — 후속 결정/작업 원장

| # | 항목 | 상태 |
|---|---|---|
| 1 | 한글(HWPX) 베타 여부 (§10.5) | **✅ 해소 — 베타 아님 확정, 라벨 9곳 제거(26-08-31)** |
| 2 | 「영어 변형문제 제작」(네이버 82노출) exact 대응 자산 0건 | 후속 신설 후보 |
| 3 | 「기출」·「수행평가」·「중등」·「학원 커리큘럼」 축 공백 | 후속 신설 후보 |
| 4 | 기존 50건 → 신규 24건 역링크 0개 | 후속 |
| 5 | 아티클 이미지 자산 0 / 스키마에 이미지 필드 없음 | 후속 |
| 6 | E-E-A-T: `articleSchema` 의 author 가 Organization 뿐, Person 저자 신호 없음 | 후속 |
| 7 | 약속한 산출물(지문 대장·학교 프로파일·4주 일정표)의 **실물 템플릿 없음** | 후속 |

---

# 실행 완료 기록 (2026-08-28)

## 13. 성공조건 대조

| # | 조건 | 결과 |
|---|---|---|
| 1 | `validate-articles.mjs` 오류 0건 | **✅ 0건** |
| 2 | articles 50 → 74건 | **✅ 74건** (types 21 / exams 14 / textbooks 17 / guides 22) |
| 3 | 신규 24건 targetKeyword 유일 | **✅** (교차소스 포함 중복 0) |
| 4 | 적대 검수 critical 0건 | **✅** 재검증까지 통과 |
| 5 | 빌드 통과 | **✅** `next build` exit 0, 신규 24건 **24/24 정적 생성 확인** |

추가 게이트(스펙 v1.0 이후 신설) — **4종 전부 통과**

| 게이트 | 결과 |
|---|---|
| `cross-similarity.mjs` | 74건 임계 초과 0쌍 |
| `publisher-density.mjs` | 신규 7건 전부 기준선(11.8%) 이상 |
| `link-graph.mjs` | 고아 0건 · 이슈 0건 |

## 14. 최종 수치

- **신규 24건**: 최소 10,327자 / 중앙 14,256자 / 최대 20,314자 / **합계 347,894자**
  (견본 `common-english-guide` 8,571자 기준선을 전부 상회)
- **사이트맵**: 96 → **121 URL**
- **targetKeyword 토큰 커버리지** (§1 진단 대비)

| 토큰 | 개편 전 | 개편 후 |
|---|---:|---:|
| 내신 | 3 | **12** |
| 지문 분석 | 1 | **11** |
| 구문 | **0** | **1** |
| AI | **0** | **4** |
| 교과서 | 8 | **16** |
| 변형문제 | 16 | **20** |

## 15. 투입

| 라운드 | 에이전트 | 토큰 | 시간 |
|---|---:|---:|---:|
| 1 집필 → 적대검수 → 수정 | 69 | 8.84M | 99분 |
| 2 재검증 → 재수정 → 정합·완전성 | 24 | 3.47M | 57분 |
| 3 정합 표적수정 | 14 | 2.29M | 34분 |
| **누적** | **107** | **14.6M** | **190분** |

검수가 실제로 잡은 것: 1라운드 **critical 16 / major 125**, 2라운드 재검증에서
`incomplete-fix`·`regression`·`new-bug` 추가 검출, 3라운드에서 전역 정합 critical 4 + 완전성 critical 2.

## 16. 이번에 확인된 계기 함정 (재발 방지)

1. **`--no-lint` 가 Next 16 에서 제거됐는데 종료코드 0 이 떴다.** 「빌드 성공」을 종료코드로
   판정하면 안 된다 — `.next/server/app/**/<slug>.html` 산출물을 **세어서** 확인할 것.
   (실제로 이 사고로 0/24 를 24/24 로 오인할 뻔했다.)
2. **Jaccard 중복도 게이트는 doorway 를 놓친다.** 문장을 바꿔 쓰면 통과하지만 출판사 고유
   정보가 없으면 여전히 doorway 다. → `publisher-density.mjs` 를 별도 계기로 세웠다.
   적대 검수 함대가 감독의 게이트보다 나은 척도를 제시한 사례다.
3. **`link-graph` 의 부분문자열 오탐.** 「영어 내신 변형문제」가 「영어 내신 변형문제 **AI**」·
   「**학교별** 영어 내신 변형문제」 안에서도 매칭돼 **정상 링크 6건을 DANGLING 으로 오탐**했다.
   → 위치별 최장일치로 수정. 아티클이 아니라 게이트를 고치는 것이 정답이었다.
4. **에이전트 1기가 「파일을 쓰지 마라」를 어기고 `articles-content.json` 에 직접 썼다.**
   멱등 병합(전면 교체)이 정본으로 덮어 무해했다 — 격리 원칙이 실제로 값을 한 사례.
5. **수정이 회귀를 낳는다.** 지학사의 사실창작(「채택 규모가 작다」)을 걷어내자 **그것이 유일한
   차별화였던 탓에** 고유정보 밀도가 8.6% 로 붕괴(합격선 11.8%). 재검증이 `regression` 으로
   잡아 재수정 후 41.2% 회복. **단발 검수로는 절대 안 잡히는 층이다.**
6. **검수도 틀린다 — 다수결 금지.** 정합 검수가 한글(HWPX) 표기를 「한 글만 다르다」며
   소수를 이상치로 지목했으나, 제품 페이지 실측 결과 **소수가 옳았다**(§10.5).
