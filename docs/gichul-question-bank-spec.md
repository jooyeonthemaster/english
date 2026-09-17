# 기출 문제 은행 × 시험지 조판 「기출 문제 불러오기」 — 확정 스펙 (26-09-07)

> **지시 원문(톡방 고객 요청 → 사용자 지시)**: "변형문제 말고 기출 빈칸은 빈칸, 문장삽입은 문장삽입,
> 순서는 순서만 분류해서 뽑을 수 있을까요? … 2012-2018년도 평가원 빈칸문제만 뽑고 싶다 … 분석 말고
> 문제만요! … 평가원 2012-2018 문장삽입만 정리하고 싶다" → "이 시험지 조판 기능에서 … 하위 탭에다가
> 기출 문제 불러오기 버튼 … 우리 전체 년도 문제를 가져올 수 있도록 … 우리 db 에 있는 모든 전체
> 문제 데이터를 우리 시험지 조판 형태에 맞춰서 철저하게 구축 … 여기 시험지 조판에서 그대로 렌더링".
>
> 이 문서가 **정본**이다. 함대(구현·검수 에이전트)는 채팅 맥락이 아니라 이 문서만 읽는다.
> 임의 숫자·임의 문구·임의 유형 추가 = **critical**. 사실 정정은 이 문서를 먼저 고친 뒤 코드로 간다.

---

## 0. 한 줄 정의

클래스 스튜디오 **시험지 조판 뷰**의 2층 필터 바에 「기출 문제 불러오기」 버튼을 두고, 모달에서
**연도 범위 × 출제기관(평가원/교육청) × 학년 × 회차 × 유형** 으로 걸러 고른 기출 문항을
**학원 DB 의 Passage + Question 행으로 반입**하면, 반입된 문항이 중앙 목록에 즉시 나타나
**자동으로 체크되어(E25) 우측 시험지에 그대로 조판**된다. 문항 형태는 AI 생성 문항과 **동형**이라
빌더·정답표·해설·DOCX/HWPX 내보내기·학생 응시 표면이 전부 무수정으로 동작한다.

---

## 1. 데이터 인벤토리 (실측 26-09-07)

| 자산 | 위치 | 규모 | 내용 |
|---|---|---|---|
| 지문 코퍼스 | `src/data/exam-passages/passages.json` | 4,540 | 복원 완료 본문 + 메타(year/exam/board/grade/era/type/typeGroup/answer/reconstructionKind/plantedError) |
| 문제 원문 | `src/data/exam-passages/problems.json` | 3,604 키 / 3,775 문항 | `rawProblems[{qNum,kind,stem(≤160자 절단),choices[],point,markers,letterMarkers}]` + `answerKey` + `sourcePdf` |
| 복원 메타 | `english-exam-passages/passages.jsonl` | 1,633(평가원) | `reconstruction{blankFilledWith, order[], insertedAt, insertedSentence, removedSentence, removedMarker, correction, suggestedCorrection}` |
| 원본 PDF | `experiments/question-quality-20260721-corpus/pdfs/` (평가원 <hash>.pdf) · `pdfs_ebsi/` (학평) | 210/211 (2027_09 만 `.tmp-trend-v2/srcpdf/2027_09.pdf`) | 2단 조판 원본. **PyMuPDF 로 벡터 밑줄·빈칸선·박스 추출 가능**(`.tmp-trend-v2/extract-origin.py` 선례) |
| 원형 forms | `.tmp-trend-v2/forms/{2026_06,2026_09,2027_06,2027_09}.forms.json` | 4회차 80문항 | 완전 원형(⟦BLANK⟧·⟦S1⟧·⟦M1⟧·⟦U1:span⟧·orderForm·summarySentence·footnotes) — **견본·오라클** |

### 1.1 커버리지 매트릭스 (문제 원문 보유 = 반입 후보)

| typeGroup | 평가원(문제/지문) | 교육청(문제/지문) | 결정론 재료 |
|---|---|---|---|
| 빈칸추론 | 266/367 | 496/620 | 코퍼스 본문 + 정답 선지 → 빈칸 위치(중복 출현 시 PDF 빈칸선으로 확정) |
| 문장삽입 | 93/112 | 211/234 | 선지 5개 = 마커 사이 구간(문제 원문) + 주어진 문장(평가원 recon 111/112 · 학평은 PDF 박스/발문 머리) |
| 글의순서 | 93/111 | 207/234 | **PDF 필요**((A)(B)(C) 단락 경계) — 코퍼스 본문 = 정답 순서 오라클 |
| 무관한문장 | 56/72 | 98/117 | 선지 5문장(문제 원문) + 도입 문장(코퍼스 본문 앞부분) |
| 어법 | 69/108 | 213/250 | **PDF 벡터 밑줄 필요**(현행 markers 는 ①뒤 5단어 창 — 정확 범위 아님). 코퍼스 본문은 교정형(정답 자리 원문과 다름), `plantedError`/`correction` 이 오형 오라클 |
| 어휘 | 70/92 | 89/104 | PDF 벡터 밑줄 필요. 본문은 인쇄 그대로(오형 유지) |
| 요약문 | 55/69 | 149/173 | **PDF 필요**(요약 문장) + 선지 "A …… B" |
| 주장/요지/주제/제목/내용일치 | 47+66+71+74+75 | 145+154+156+163+152 | 코퍼스 본문 + 선지 5개 → 완전 결정론 |
| 함축의미 | 34/48 | 71/71 | 발문의 밑줄구(「밑줄 친 X가 …」) → 본문에서 위치 |
| 지칭 | 5/8 | 94/125 | 발문 밑줄어 + **PDF 밑줄 위치**(대명사 다중 출현) |
| 장문(41-42·43-45) | 112/153 | — | 세트. 41=제목/주제 · 42=(a)~(e) 어휘 · 43=(A)~(D) 순서 · 44=(a)~(e) 지칭 · 45=내용 불일치 |

era 분포(문제 원문 보유분): modern 2,579 · foreign_pdf 364 · foreign_old 575 · ab2014 66.
배점: `[3점]` 951 · 미표기 2,784(=2점) · 1점 17(구형).

### 1.2 시험지 빌더가 기대하는 직렬화 (실 DB 표본 `.tmp-gichul-bank/_db-shapes.json`)

| subType | questionText | options | correctAnswer | 지문 흐름 |
|---|---|---|---|---|
| BLANK_INFERENCE | `발문\n\n<본문, 빈칸은 _____>` | `[{label:"①",text}]` 또는 `"1"` 라벨 | `"②"`/`"2"` | embedded |
| GRAMMAR_ERROR | `발문\n\n<본문, __(A) expr__ … __(E) expr__>` | `[{label:"(A)",text:expr}…]` | `"(C)"` | embedded |
| VOCAB_CHOICE | `발문\n\n<본문, __(a) word__ …>` | `[{label:"1",text:word}…]` | `"5"` | embedded |
| SENTENCE_ORDER | `발문\n\n[주어진 문장] …\n\n(A) …\n(B) …\n(C) …` | `[{label:"1",text:"(A)-(C)-(B)"}…]` | `"3"` | embedded(atomic) |
| SENTENCE_INSERT | `발문\n\n[주어진 문장] …\n\n<본문, ① … ② … ⑤ 인라인>` | `[{label:"1",text:"①"}…]` (canonical) | `"③"` | embedded |
| IRRELEVANT | `발문\n\n<도입 문장> ① __문장__ ② __문장__ … ⑤ __문장__` | `[{label:"①",text:"①"}…]` | `"④"` | embedded |
| SUMMARY_COMPLETE_MC | `발문\n\n↓\n<요약문, (A) _____ (B) _____>` | `[{label:"1",text:"a …… b",blankValues:[…],blankA,blankB}]` | `"4"` | source(지문 박스 인라인 + ↓ + 요약 박스) |
| TOPIC / MAIN_IDEA / TITLE / CONTENT_MATCH | `발문` 만 | `[{label:"1",text}…]` | `"2"` | source(출처 지문 박스) |
| IMPLIED_MEANING / REFERENCE | `발문\n\n<본문, __밑줄구__>` | `[{label:"1",text}…]` | `"2"` | embedded |

(정확한 라벨 정본·structuredData 필수 키·각주 위치·다중정답 규칙은 §3 계약표 — 정찰 렌즈 1 결과로 확정.)

---

## 2. 제품 결정 (재논의 금지 — 사용자 지시에서 직접 도출)

1. **위치**: 시험지 조판 뷰의 **2층 필터 바(유형·난이도·프리미엄 select 줄) 우측 끝**에
   「기출 문제 불러오기」 버튼(h-7, 파란 outline, `BookMarked` 아이콘). 같은 버튼을 **빈 상태**
   (「아직 조판할 문항이 없습니다」) 카드에도 보조 CTA 로 둔다 — 고객의 첫 사용 동선이 정확히 빈
   클래스에서 시작한다. 학습지 조판 뷰·지문관리 뷰에는 두지 않는다(요청 범위 밖).
2. **표면**: 모달(Dialog). 중앙 열은 조판 열림 시 420px 라 인라인 브라우저는 찌그러진다.
   모달은 `max-w-[1120px] h-[86vh]`, `sm` 미만 전면 시트. 3열: **필터 레일(좌, 208px) | 목록(중) |
   미리보기(우, lg 이상 360px)**. 좁으면 필터는 상단 칩 줄로, 미리보기는 행 확장(아코디언)으로 강등.
3. **필터**: 연도 **범위**(from~to 두 개의 select — 고객 요청 "2012-2018") · 출제기관 토글
   [평가원 | 교육청] · 회차(수능/6월/9월 · 3/4/7/10/11월…) · 학년(고1/고2/고3 — 교육청에서만 의미) ·
   유형(코퍼스 typeGroup 15종, 다중) · 검색어. facet 카운트는 **나머지 필터로 좁힌 수**(기존
   `computeFacets` 관례). 상단에 「반입 가능 N문항」 실시간 표기.
4. **선택**: 행 체크(클릭) + 「현재 조건 전체 선택」(상한 **150문항**, 초과 시 안내). 선택은
   페이지·필터를 넘나들어 누적. 이미 이 클래스에 담긴 문항은 「담김」 배지 + 체크 비활성(중복 반입 0).
5. **반입**: 「선택 N문항 시험지에 담기」 → 서버 액션 1왕복(지문함 Passage 등록(멱등 `kice:<passageId>`)
   + Question 생성(멱등 `gichul:<bankId>`) + 클래스 담기) → 토스트 → 중앙 목록 재조회 → **반입분
   자동 체크**(체크 순서 = 선택 순서 = 시험지 순서) → E25 발화 ②로 조판 표면 자동 개방(xl 이상).
6. **정답·배점**: 공식 정답을 `correctAnswer` 로, 배점은 원본 그대로(3점/2점; 구형 1점은 2점으로
   정규화하지 않고 원본 유지). 해설(QuestionExplanation)은 만들지 않는다(고객: "분석 말고 문제만").
7. **표시 정체**: 반입 Question 은 `aiGenerated=false`, `approved=true`(공식 문항 — 검수 불필요),
   `difficulty` 는 배점 기반(3점=KILLER, 2점=INTERMEDIATE) — 목록의 난이도·프리미엄 필터가 그대로 먹는다.
   태그 `["기출", "gichul:<bankId>", "kice-exam:<examId>"]` — 기계용 키는 표시에서 숨는다
   (`getDisplayQuestionTags`). 중앙 목록 행에 **「기출」 배지**(additive 필드 `origin:"gichul"`).
8. **지문 제목**: `formatExamTitle` 정본("2024학년도 수능 영어 31번 · 빈칸추론") — 기출 지문 반입과
   같은 Passage 행을 공유한다(같은 지문을 기출 지문 탭에서 이미 담았으면 그 Passage 에 Question 만 붙는다).
9. **미지원 범위(1차 출하)**: 장문 43-45 세트(순서 4단락 (A)~(D) — 빌더 정규식 [A-C]), 구형 네모
   어법/어휘(box_choice — GRAMMAR_CHOICE_COMBO 매핑은 2차), 구형 이중 빈칸 (A)(B) 짝 선지, 영어 발문
   구형. 미지원 항목은 은행에 `status:"unsupported"` 로 남기되 **모달에서 보이지 않는다**(카운트에서도
   제외 — 「보이는데 못 담는」 상태 금지).

---

## 3. 은행 데이터 계약 (`src/data/exam-passages/questions.json` + `questions-facets.json`)

```ts
interface ExamBankItem {
  id: string;                 // bankId = 코퍼스 passage id (+ 세트 멤버는 "#41" 접미)
  passageId: string;          // 코퍼스 passage id — Passage 행(kice:<passageId>) 공유 키
  examId: string; year: number; exam: string; board: string; grade: "고1"|"고2"|"고3"; era: string; form: string;
  qNum: number;               // 인쇄 문항 번호
  typeGroup: string;          // 코퍼스 묶음 유형(필터 축)
  subType: string;            // 빌더 subType
  points: number;             // 2 | 3 (구형 1 유지)
  direction: string;          // 발문(인쇄 그대로 — 표준 발문은 CANON 표)
  questionText: string;       // 빌더 직렬화 완성본(§1.2 / §3.1)
  options: Array<{ label: string; text: string; blankValues?: {label:string;value:string}[]; blankA?: string; blankB?: string }>;
  correctAnswer: string;
  structuredData: Record<string, unknown>; // 렌더가 읽는 최소 키만(§3.1)
  passageTitle: string;       // formatExamTitle
  passageContent: string;     // Passage.content = 코퍼스 복원 본문(+각주 없음)
  footnotes: string[];        // "* dilute: 묽게 하다" — questionText/passage 꼬리에 직렬화(§3.1)
  status: "ok" | "unsupported";
  unsupportedReason?: string;
  provenance: { form: "corpus" | "pdf" | "agent"; gates: string[]; verifiedBy?: string[] };
}
```

### 3.1 subType 별 직렬화 계약 (정찰 렌즈 1 확정 — `src/lib/question-generation-persistence.ts` buildGeneratedQuestionText 동형)

공통: 단락 경계는 **`

`**(빌더 splitFirstParagraph 가 `
{2,}` 로 stem/body 를 가른다) · 빈칸은 정확히 `_____`(밑줄 5개) · 밑줄 `__x__` 안에 `_` 금지 · 표시 라벨은 저장 label 과 무관하게 index 원문자(①…)로 강제 · `[빈칸 정답]/[정답]/[해설]` 라벨 라인은 questionText 에 절대 금지(학생 페이로드 누수 경로) · `Question.type="MULTIPLE_CHOICE"`, `options` 는 JSON 문자열, `aiGenerated=false`, `approved=true`, `points` 원본 배점.

| subType | questionText | options / correctAnswer | structuredData 필수 키 | 지문 흐름 · 비고 |
|---|---|---|---|---|
| BLANK_INFERENCE | `발문

<본문, _____>` (+`

각주`) | label "1".."5" / `"N"` | direction, originalExpression, passageWithBlank, options, correctAnswer | embedded. `blanks[]` 넣지 말 것(정답 누수 직렬화) |
| GRAMMAR_ERROR | `발문

<본문, __(A) 표현__ …(E)>` | label "(A)".."(E)" text=표현 / `"(C)"` | direction, passageWithMarkers(각주는 **이 안**), markedExpressions[{label,expression,isError,errorExpression?,correction?}], options, correctAnswer, correctAnswers | embedded. **렌더 시 questionText 재조립**(direction 필수). 선지 목록 미렌더(채점용) |
| VOCAB_CHOICE | `발문

<본문, __(a) word__ …(e)>` | label "1".."5" text=word / `"N"` | direction, passageWithMarkers, markedWords[{label,word,originalWord,substituteWord,isInappropriate,betterWord?}], options, correctAnswer, vocabDisplayMode | embedded. 재조립·선지 미렌더 동일 |
| SENTENCE_ORDER | `발문

[주어진 문장] …

(A) …
(B) …
(C) …` | label "1".."5" text "(A)-(C)-(B)" / `"N"` | direction, givenSentence, paragraphs[{label:"(A)",text}], options, correctAnswer | embedded·atomic. 3단락 고정((D) 미지원). [주어진 문장] 블록 안 빈 줄 금지 |
| SENTENCE_INSERT | `발문

[주어진 문장] …

<본문, ① … ⑤ 인라인>` | canonical label "1".."N" text "①".."N" / `"③"`(원문자) | direction, givenSentence, passageWithMarkers, options, correctAnswer | embedded. 마커 5~8, options 길이가 계약 |
| IRRELEVANT | `발문

<도입> ① __문장__ … ⑤ __문장__` | label·text 원문자 / `"④"` | direction, passageWithNumbers, sentences[5], irrelevantIndex(0-base), options, correctAnswer | embedded. 마커 없는 도입 문장 허용 |
| SUMMARY_COMPLETE_MC | `발문

↓
<요약문, (A)/(B) 마커만>` | label "1".."5" text "a …… b"(+blankValues/blankA/blankB) / `"N"` | direction, summaryWithBlanks, options, correctAnswer, blanks[{label:"(A)",answer}] | source+INLINE. 지문 박스 → ↓ → 요약 박스. `↓` 뒤는 `
` 하나 |
| TOPIC / MAIN_IDEA / TITLE / CONTENT_MATCH | `발문` 만 | label "1".."5" / `"N"` | direction, options, correctAnswer(, matchType) | source+INLINE. **passage*·paragraphs 키 금지**(지문 박스 소실). 각주 미인쇄(1차 한계) |
| IMPLIED_MEANING | `발문

<본문, __밑줄구__>` | label "1".."5" / `"N"` | direction, underlinedExpression, passageWithUnderline, options, correctAnswer | embedded. 밑줄 1곳 |

각주(`* word: 뜻`): embedded 유형은 지문 문자열 끝 `

` 뒤 한 단락(렌더는 지문 흐름에 이어 붙음). source 유형은 1차 미인쇄(Passage.content 는 코퍼스 정본과 공유해 손대지 않는다).
정답표 표기: VOCAB_CHOICE→평문 숫자, GRAMMAR_ERROR→원문자, 그 외 correctAnswer 원문 그대로(현 시스템 실태 — 통일 금지).

### 3.2 유형 매핑 + 표준 발문(CANON — 수능 고정 지시문, 내용 창작 아님)

| typeGroup | subType | 발문(인쇄본 우선, 없으면 CANON) |
|---|---|---|
| 빈칸추론 | BLANK_INFERENCE | 다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오. |
| 어법 | GRAMMAR_ERROR | 다음 글의 밑줄 친 부분 중, 어법상 틀린 것은? |
| 어휘 | VOCAB_CHOICE | 다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은? |
| 글의순서 | SENTENCE_ORDER | 주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 고르시오. |
| 문장삽입 | SENTENCE_INSERT | 글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오. |
| 무관한문장 | IRRELEVANT | 다음 글에서 전체 흐름과 관계 없는 문장은? |
| 요약문 | SUMMARY_COMPLETE_MC | 다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은? |
| 주장 | MAIN_IDEA | 다음 글에서 필자가 주장하는 바로 가장 적절한 것은? |
| 요지 | MAIN_IDEA | 다음 글의 요지로 가장 적절한 것은? |
| 주제 | TOPIC | 다음 글의 주제로 가장 적절한 것은? |
| 제목 | TITLE | 다음 글의 제목으로 가장 적절한 것은? |
| 내용일치 | CONTENT_MATCH | (인쇄본 — "X에 관한 다음 글의 내용과 일치하지 않는 것은?") |
| 함축의미 | IMPLIED_MEANING | (인쇄본 — "밑줄 친 X가 다음 글에서 의미하는 바로 가장 적절한 것은?") |
| 지칭 | REFERENCE | (인쇄본) |
| 장문 41 / 42 | TITLE·TOPIC / VOCAB_CHOICE(letter) | 윗글의 제목으로 가장 적절한 것은? / 밑줄 친 (a)~(e) 중에서 문맥상 낱말의 쓰임이 적절하지 않은 것은? |
| 장문 43-45 | (1차 미지원) | — |

---

## 4. 구축 파이프라인 (`scripts/gichul-bank/`)

```
A. extract-forms.py   PDF(210) → .tmp-gichul-bank/origin/<examId>.json
                      {qSlices(열 정렬 본문), underlines[{q, words}], blanks[], boxes[], points, footnotes}
B. build-bank.mjs     passages.json + problems.json + passages.jsonl(recon) + origin → bank-draft.json
                      유형별 결정론 변환 + 게이트 G1~G9 → status ok | pending(issues[]) | unsupported
C. 함대(Workflow)      pending 항목: 원형 복원 에이전트(스키마 강제) → 게이트 재실행 → 검증 에이전트(반증)
D. verify-bank.mjs    전수 게이트 + 표본 렌더 스냅숏(빌더 실렌더) + 블라인드 풀이 표본(정답 일치율)
E. assemble           questions.json(압축 1줄) + questions-facets.json + docs 커버리지 보고
```

### 4.1 결정론 게이트 (전 항목 필수 — 하나라도 실패 = pending)

| G | 검사 |
|---|---|
| G1 | 선지 5개(순서/삽입/무관은 canonical), 정답 ∈ 1..5, 선지 텍스트 비어있지 않음, 꼬리 잡음(다음 문항 발문·「확인 사항」·페이지 학년 표기) 제거 |
| G2 | 본문 축자 오라클: 유형별 역변환한 본문 == 코퍼스 복원 본문(공백·인용부호 정규화 후, 어법/어휘는 정답 스팬 제외) |
| G3 | 마커 개수: 빈칸 `_____` 정확히 1(다중 빈칸은 미지원), 삽입 ①~⑤ 5개 순서대로, 무관 ①~⑤ 5문장, 어법/어휘 밑줄 5개, 순서 (A)(B)(C) 3단락 + 주어진 글 |
| G4 | 한글 잔존 0(본문) · ⟦⟧/⟨⟩ 토큰 잔존 0 · 각주는 footnotes 로 분리 |
| G5 | 정답 정합: 빈칸 정답 선지 == 복원 삽입구 / 삽입 정답 위치에 주어진 문장 넣으면 == 코퍼스 / 순서 정답 배열 == 코퍼스 / 무관 정답 문장 == removedSentence(평가원) |
| G6 | 어수 90~420 · 선지 길이 ≤ 200자 |
| G7 | 발문 한글·물음표 종결(영어 발문 구형은 unsupported) |
| G8 | 빌더 파서 왕복: `questionStemAndBody`/`structuredSegments`/`sentenceOrderSegmentsFromQuestionText` 를 실제 import 해 세그먼트 수·마커 수가 기대와 같음 |
| G9 | 세트/중복: 같은 passageId 에 subType 중복 0, bankId 유일 |

### 4.2 검증 게이트 (V)

- V1 실렌더 스냅숏: 유형별 표본 3 + 에이전트 수리분 전량을 시험지 빌더로 실제 렌더(Playwright)해 스크린샷 → 검수 에이전트 Read.
- V2 블라인드 풀이: 층화 표본(유형×기관 각 5) 을 풀이 에이전트가 정답키 없이 풀어 일치율 보고 — 불일치는 전부 재검수.
- V3 완전성 비평가: 「무엇이 빠졌나」.

---

## 5. 앱 통합 (파일·계약) — (정찰 렌즈 3 확정 후 보강)

| 파일 | 역할 |
|---|---|
| `src/lib/exam-passages/question-bank-types.ts` | 은행 타입·질의 타입·상수(순수) |
| `src/lib/exam-passages/question-bank.ts` | `server-only` 로더·질의(facet)·byIds |
| `src/app/api/exam-passages/questions/route.ts` | GET 질의(스태프 세션) |
| `src/actions/studio/exam-questions.ts` | `importExamQuestionsToStudioClass({ bankIds, classId })` · `listStudioClassGichulBankIds({ classId })` |
| `src/components/workbench/exam-question-bank/*` | 모달·필터 레일·목록 행·미리보기(공유 컴포넌트) |
| `composer-list-pane.tsx` | additive prop `onOpenExamBank` → 2층 바 버튼 + 빈 상태 CTA |
| `library-pane.tsx` | 모달 호스트 상태 · 반입 후 refresh + 자동 체크 |
| `src/actions/studio/questions.ts` | 행에 `origin:"gichul"` additive |

---

## 6. 검증 게이트(앱) — 26-09-07 실측 결과

### 6.1 데이터(은행) 게이트 — 전부 통과
| 게이트 | 결과 |
|---|---|
| 결정론 G1~G7 (`build-bank.mjs`) | 3,584 후보 → ok 2,987 · pending 142 · unsupported 455(장문 112·지칭 99·네모 어법/어휘 136·이중 빈칸 57·정답 미확보 ~50) |
| 함대 수동 복원 (`wf_3cb42aed-7b8`, 49기 147건) | fixed 105 · unsupported 18 · cannot 22 · 게이트 거부 2(단어 수 미달) — `apply-repairs.mjs` 가 재게이트 후 병합 |
| 정답 정본 | 평가원 정답표 PDF(홀/짝/A/B 병합) + EBSi 해설지 표(영어 머리 뒤 첫 표만) → `answer-keys.json`. 코퍼스≠공식 57건은 공식 채택 |
| G8 빌더 왕복 (`verify-bank.ts`) | **13 subType 3,079문항 fail 0** (questionStemAndBody·structuredSegments·옵션 목록 판정 실제 코드로 재파싱) |
| 각주 귀속 게이트(표제어가 지문∪questionText 에 존재) | 요약 2/78 · 주제 1/98 · 삽입 1/196 외 전 유형 0 — 이웃(41~42 세트) 각주 혼입은 origin.mjs trailingFootnotes 분리로 해소 |
| 적대 검증 함대(329 표본) | 정답 불일치 13건 → 형(홀/짝/A/B) 오류·코퍼스 오염으로 전량 원인 규명·수리 · 요약문 절단·삽입 중복·꼬리 절단 수리 |
| 최종 산출 | `src/data/exam-passages/questions.json` **3,080문항 8.49MB** · `passageContentOverride` 7건(요약문 지문 박스 기반 절단 복원, 전부 문장 끝 마감·한글 0) · 어법 markedExpressions/어휘 markedWords 에 `surroundingText`(±6단어) 152/169·110/123 |

### 6.2 앱 게이트 — 전부 통과
- tsc 0 · eslint 0 에러(경고 3건은 전부 이 작업 이전부터 있던 줄: composer-list-pane 1386·library-pane 812·question-body-layout 18).
- `.tmp-gichul-bank/probe-exam-bank.mjs` B0~B6 **PASS @1536**: 진입 → 버튼 → 모달(반입 가능 N) → 가로 스크롤 0 → 필터(2012~2018·평가원·빈칸추론 → 91문항) → 전체 선택 → 담기 토스트 → 목록 +91·[기출] 배지 91·자동 체크 91 → 조판 자동 개방 3p. **@1280/1920/1024/390 B0~B3 PASS**(390 은 칩 모드 팝오버 경로).
- `.tmp-gichul-bank/probe-render-types.mjs` R1~R4 **PASS**(4회 재주행): 13유형 각 1문항 선택(필터 전환에도 선택 유지) → 담기 → 자동 체크 13 → 조판 5p → **조판 innerText 에 13문항 발문·첫 선지 전부 등장** → 페이지 캡처 `shots/render-p1..5.png`(IntersectionObserver 지연 마운트라 프레임마다 스크롤 후 캡처).
- 감독 육안 검수(1536·1280·1920·1024·390 모달 + 조판 5p): 찌그러짐·절단·가로 스크롤 없음. 발견·수리: 각주 인라인 접힘(§9), 칸 경계 밑줄 유실(§9), 회차 빈도순 정렬(달력순으로 교체).

### 6.4 3,080문항 전수 조판 렌더 검증(사용자 요구 「모든 문제를 시험지 조판에 렌더·육안 확인」)
- **경로**: DB 를 거치지 않는 개발 전용 페이지 `/director/dev/gichul-render?offset&limit[&type][&ids]` — 은행 항목을 반입 액션과 **같은 Question 모양**(structuredData._gichul 포함)으로 조립(`src/lib/exam-passages/question-bank-render.ts`)해 실제 조판기 `ExamDetailPaperPreview`(모든 페이지 즉시 마운트, additive `forceMountAllPages`)로 그린다. 스태프 세션 필요, 프로덕션은 `GICHUL_RENDER_DEV=1` 없으면 404.
- **하네스** `.tmp-gichul-bank/probe-render-all.mjs`: 배치 30문항(≈페이지 10장)씩 열어 (1) 문항별 DOM 게이트 — present·발문 머리·첫 선지·본문/지문 머리(따옴표 접기, 마커·빈칸·[주어진 문장] 제거)·각주 표제어(내장형만)·원시 토큰(`__ ⟦ undefined`)·밑줄 마커 수(어법·어휘 5, 함축 ≥1, 무관 ≥5)·가로 넘침·페이지 세로 넘침 (2) 페이지 스크린샷 `render-all/b<offset>-p<N>.png` + 문항→페이지 매핑 `report.json`. 음성테스트 `--negative`(가짜 문항 주입 → 5게이트 RED 확인).
- **계기 교정 이력**: 첫 300건 오탐 14건 전부 계기 문제(코퍼스 직선 따옴표 vs 인쇄본 곱슬 따옴표 · 내장형/출처형 지문 위치 · `[주어진 문장]`·`↓`·`__` 토큰 · 출처형 각주 미인쇄) → 교정 후 0~90 fails 0.
- **시각 검수**: 페이지 이미지 전량을 25장/기 함대가 Read(안 읽은 청크는 coverage_gaps 로 적발) + 중재(같은 원인 병합·관례 오탐 제거) + 감독 표본 육안(유형×시대 층화). 결과는 §10 에 착지.

### 6.3 적대 검수 함대(`wf_26478724-4e0`, 렌즈 6 + 중재) — 결과는 §10 에 착지

---

## 7. 열린 결정(사용자) — 기본값으로 진행

| # | 결정 | 기본값 |
|---|---|---|
| 1 | 반입 크레딧 과금 | **0(무료)** — 기출 지문 반입과 동일 정책 |
| 2 | 장문 43-45 | 1차 미지원(2차에 QuestionSet 정식안) |
| 3 | 구형(2003~2009) 변형 유형 | 표준형만 반입, 나머지 unsupported |

---

## 8. UI 확정 설계 — 「기출 문제 불러오기」 (26-09-07 감독 확정 · 함대 필독)

### 8.1 진입 버튼 (composer-list-pane.tsx — additive prop `onOpenExamBank?: () => void`)

- 위치 ①: `qAxis` 2층 필터 바(유형·난이도·프리미엄 select 줄)의 **4번째 자식**. 이 줄은 이미 `flex-wrap` 이라 조판 열림
  (중앙 420px)에서 2줄로 떨어져도 붕괴가 없다(정찰 렌즈 3 실측). `ml-auto` 로 우측 정렬 — 1줄에 들어가면 오른쪽 끝,
  2줄이면 둘째 줄 오른쪽 끝.
- 형태: `h-7` 축(SELECT_CLS 와 같은 높이), `rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-semibold
  text-blue-700 hover:border-blue-300 hover:bg-blue-100`, 아이콘 `BookMarked`(lucide, `size-3.5`) + 라벨 **「기출 문제
  불러오기」**(자구 고정). `data-tour="composer-exam-bank"`(정적 속성 — memo 무접촉).
- 위치 ②: 빈 상태(`axisTotal === 0`, 「아직 조판할 문항이 없습니다」) 카드의 힌트 아래 같은 버튼(사이즈 `h-8`, 라벨 동일).
  같은 화면에 진입구 2개가 되는 것은 의도 — 빈 클래스에서의 첫 동선이 정확히 여기서 시작한다(고객 사례).
- 미전달(`onOpenExamBank` undefined) 시 두 버튼 모두 미렌더(`onOpenQuestion` 선례).
- ⚠ memo 계약: 호스트(library-pane)가 `useCallback(…, [])` 안정 참조로 내린다. 객체 prop 금지.

### 8.2 모달 컴포넌트 — `src/components/workbench/exam-question-bank/` (공유 컴포넌트, 스튜디오 외 호스트 재사용 가능)

```
exam-question-bank/
├── index.tsx                    # export { ExamQuestionBankModal } + 타입 re-export
├── exam-question-bank-modal.tsx # Dialog 껍데기 + 3열 레이아웃 + 푸터(≤ 400줄)
├── use-exam-question-bank.ts    # 데이터·필터·선택 훅(fetch /api/exam-passages/questions, 300ms 디바운스, 선택 누적)
├── bank-filter-rail.tsx         # 좌측 필터 레일(연도 범위·출제기관·회차·학년·유형) + 상단 칩 모드
├── bank-row.tsx                 # 목록 행(체크·배지·미리보기·「담김」)
└── bank-question-preview.tsx    # 우측 미리보기(시험지 원형 렌더 — 발문·지문(마커 렌더)·선지·정답 토글)
```

**Props(정본)**:
```ts
export interface ExamQuestionBankModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 담김 배지·중복 차단 — 호스트가 listStudioClassExamBankIds 로 채워 내린다(참조 안정 책임 호스트) */
  importedBankIds: ReadonlySet<string>;
  /** 클래스명(헤더·CTA 문구) */
  scopeLabel: string | null;
  /** 담기 — 호스트가 서버 액션 호출·토스트·목록 갱신·자동 체크를 소유. ok=true 면 모달이 선택을 비우고 닫는다 */
  onImport: (bankIds: string[]) => Promise<{ ok: boolean }>;
  /** 처리 중(CTA 스피너·비활성) */
  importing: boolean;
}
```

**레이아웃**(DialogContent `p-0 gap-0 overflow-hidden w-[min(1120px,calc(100vw-2rem))] max-w-none h-[min(86vh,880px)] flex flex-col`,
`sm` 미만은 `w-screen h-dvh rounded-none` 전면 시트):
```
┌ 헤더 h-12: [BookMarked] 기출 문제 불러오기  · 「클래스명」            [반입 가능 2,965문항]   [×]
├────────────────────────────────────────────────────────────────────────────────
│ 필터 레일 w-[216px] (lg+) │ 목록(flex-1 min-w-0)                    │ 미리보기 w-[380px] (xl+)
│  검색 input               │ 툴바: [현재 조건 N문항] [전체 선택(≤150)] [선택 해제]│ 선택/호버 행의 시험지 원형
│  학년도 [from ▾]~[to ▾]    │ 행 리스트(가상화 불필요 — 페이지 40)        │  발문 / 지문(밑줄·빈칸·①마커·(A)(B)(C) 단락·
│  출제기관 [평가원][교육청]  │  ☐ 2024 수능 31번 · 빈칸추론 · 3점  [담김]  │   [주어진 문장] 박스 · ↓ 요약 박스) / 선지 ①~⑤
│  회차 ☐수능 ☐9월 ☐6월 …    │    "Over the last decade the attention…"   │  [정답 보기] 토글(기본 숨김)
│  학년 ☐고3 ☐고2 ☐고1       │  … 페이지네이션(기존 Pagination 공유 컴포넌트) │  "미리보기 = 시험지 조판과 같은 렌더 규칙"
│  유형 ☐빈칸추론 ☐문장삽입 … │                                             │
├────────────────────────────────────────────────────────────────────────────────
│ 푸터 h-14: 선택 12문항 · 지문 12개   [유형칩 빈칸추론 8 · 문장삽입 4]      [취소] [선택 12문항 시험지에 담기 ▶]
```
- `lg` 미만: 필터 레일은 목록 위 **칩 줄**(FilterMenu 팝오버 5개 — exam-filter-bar 의 FilterMenu 를 export 해 재사용)로 접힌다.
- `xl` 미만: 미리보기 열은 사라지고 행의 **[미리보기]** 버튼이 인라인 아코디언(행 아래 펼침)으로 대체된다.
- 연도 범위: `select` 2개(from/to, facet years 내림차순). from > to 면 자동 스왑. 기본 전체.
- 출제기관: 세그먼트 토글 2개(평가원 = 대학수학능력시험+수능모의평가 / 교육청 = 학력평가) — boards 를 2값으로 접는다.
- 회차·학년·유형: 체크리스트(FilterMenu list). 유형은 정준 순서 `EXAM_BANK_TYPE_GROUPS`, 카운트는 응답 facets.
- 행: 클릭 = 체크 토글(마키 선택은 1차 없음). 배지: `[2024 수능]`(gradeBadgeClass·boardShortLabel 규칙 — 교육청은 `[2025 고1 3월]`)
  `[31번]` `[빈칸추론]`(typeBadgeClass) `[3점]`(3점만 표시, `bg-slate-900 text-white`). 미리보기 1줄 `truncate`.
  담김: 체크박스 대신 `Check` 아이콘 + `담김` 배지(`text-emerald-700 bg-emerald-50 border-emerald-200`), 클릭 비활성, 툴팁
  「이 클래스에 이미 담긴 문항입니다」.
- 「전체 선택」: 응답 `allIds`(≤150) 를 선택에 합집합. `allIdsTruncated` 면 「조건이 150문항을 넘습니다 — 앞 150개만 선택했어요.
  연도·유형을 더 좁혀 주세요」 인라인 고지.
- 선택 상한 150: 초과 시 CTA 비활성 + 사유. 선택은 페이지·필터를 넘나들어 누적(집합).
- 미리보기 렌더 규칙: 시험지 빌더와 **같은 문법**만 흉내 낸다 — `__x__`→밑줄, `__(A) x__`→ⓐ 마커+밑줄(어법은 ①②③④⑤ 로),
  `_____`→빈칸 상자, `①`~`⑤` 인라인 마커 볼드 파랑, `[주어진 문장] …`→회색 박스, `(A) …` 단락 → 라벨 볼드, `↓` + 요약 박스.
  선지는 마커 4유형(어법·어휘·무관·삽입)은 목록 미렌더(빌더 동일), 나머지는 ①~⑤ 목록. 「정답 보기」 토글 시 정답 선지/마커 강조.
  데이터는 `/api/exam-passages/questions?ids=<id>` 가 아니라 **행 클릭 시 `/api/exam-passages/questions/[id]`** 로 본문을 받는다(목록 응답은 경량).
- 접근성: 행 `role="checkbox" aria-checked`, 헤더 `DialogTitle`, 필터 레일 `aria-label="기출 문항 필터"`, 푸터 CTA `aria-disabled` + `title` 사유.
- 폭 게이트(반드시 실측): 1280×800 / 1536×864 / 1920×1080 / 1024×768(태블릿) / 390×844(모바일 시트). **어느 폭에서도
  텍스트 절단·겹침·가로 스크롤 0** — 행 배지는 `flex-wrap`, 미리보기 1줄은 `truncate`.

### 8.3 호스트 배선 (library-pane.tsx)

1. `const [examBankOpen, setExamBankOpen] = useState(false)`; `openExamBank = useCallback(() => setExamBankOpen(true), [])` →
   `<ComposerListPane onOpenExamBank={openExamBank} …/>`.
2. `importedBankIds`: 모달이 **열릴 때** `listStudioClassExamBankIds({classId})` 1회 조회(state Set) — 닫으면 유지, 반입 성공 후 갱신.
3. `handleImportExamQuestions(bankIds)`:
   - `importExamQuestionsToStudioClass({ bankIds, classId })` 1왕복.
   - 실패: `toast.error(result.error ?? "기출 문항 반입에 실패했습니다.")` → `{ok:false}`.
   - 성공: `pendingAutoPickRef.current = new Set([...createdQuestionIds, ...existingQuestionIds])`; `refreshQuestions()`;
     토스트 정본: `기출 문항 N개를 「{className}」에 담았습니다.`(+ `이미 있던 M개는 그대로 체크했어요` / `건너뛴 K개`),
     `xl` 미만이면 추가 문장 `시험지 조판은 넓은 화면에서 자동으로 열립니다.`; `onLibraryChanged()`; `{ok:true}`.
4. **자동 체크 착지점 = `questionRowByIdRef` 갱신 effect 본문**(ref 대입 직후): `pendingAutoPickRef` 소진 → 미러에 존재하는 id 만
   `handleFlatSelectionChange(new Set([...flatPickedRef.current.keys(), ...hit]))`. ⚠ 서버 액션 직후에 부르면 전건 무음 유실(정찰 렌즈 3).
5. 자동 체크 → `onFlatPickedChange` → E25 발화 ②(픽 증가) → `setExamStudioOpen(true)` — **추가 배선 0**.

### 8.4 중앙 목록 행 「기출」 배지 (additive)

- `listStudioClassQuestions` select 에 `tags` 추가 → 행에 `origin: "gichul" | null`(StudioClassQuestionRow additive 옵셔널).
  판정: tags 에 `gichul:` 접두 태그 존재.
- ComposerListPane 평면 행: 유형 배지 앞에 `[기출]` 배지(`text-blue-700 bg-blue-50 border-blue-200`, 10px). aria-label 자구
  무변경(프로브 계약).

---

## 9. 렌더러 조정(공용 시험지 조판, 26-09-07) — 기출 문항이 드러낸 결함 3건

기존 AI 생성 문항에는 없던 입력(각주 블록·문장 길이 밑줄)이 공용 렌더러의 「통짜」 정책과 충돌했다. 전부 additive·조건부라 기존 조판은 바이트 동일.

| # | 증상(실측) | 원인 | 수정 |
|---|---|---|---|
| R-1 | 빈칸·어휘·무관·함축 본문 끝에 `* consensus: 합의` 가 같은 줄에 붙음 | `paper-item-utils.tsx` `collapsePassageParagraphs` 가 `

` 을 공백으로 접음 · 칸 경계 조각 경로 `joinRenderedLinesForDisplay` 도 단락을 공백으로 이음 | 각주 단락(`^[*＊]\s*[A-Za-z]`)만 `
` 으로 이음 · `text-normalization.ts` `normalizePassageText` 도 동일 규칙(출처 지문 박스 대비) |
| R-2 | 순서 (C) 문단 끝에 각주가 붙음 | `sentenceOrderSegmentsFromQuestionText` 가 꼬리 각주를 (C) 슬라이스에 포함 · 은행은 (C) 뒤 **개행 1개**로 각주를 붙인다 | 꼬리 각주 블록을 `{kind:"text"}` 세그먼트로 분리(`SENTENCE_ORDER_TRAILING_FOOTNOTE_RE`, `
+`) |
| R-3 | 무관한 문장이 칸/쪽 경계에서 쪼개지면 ③④⑤ 밑줄이 사라지고 `__` 가 그대로 찍힘 | 조각 안 `__` 개수가 홀수 → `renderFormattedInline` 의 `__([^_]+)__` 불일치 | `balanceUnderlineMarkersForFragment(text, startsAtBeginning)` — 시작 조각은 끝에, 이어짐 조각은 앞에 `__` 보충(빈칸 `___` 는 세지 않음). 조각이 통째로 한 밑줄 안이라 마커 0개인 경우는 판별 불가(잔존, 드묾) |

| R-4 | 어법 169건 중 101건 밑줄 자리 이동·51건 정답 변경(검수 함대 grammar-sim 실측) | `normalizePaperFields("normalized")` 가 코퍼스 Passage.content 에서 markedExpressions 로 마커를 **재유도**(첫 출현 매칭, surroundingText 0건) — 기출은 이 경로가 인쇄본을 훼손한다 | `render-model.ts` `isGichulImported`(structuredData._gichul) → normalizePaperFields·normalizeStructuredQuestionForDisplay 모두 faithful(null) — 구운 passageWithMarkers 그대로(각주도 보존). 은행에는 별도로 surroundingText 를 채워 타 소비처의 재유도도 안전하게 |
| R-5 | 순서 (C) 문단 각주 인라인(177/295) | 은행이 paragraphs[2].text 안에 `
각주` 로 직렬화 | 데이터: paragraphs 순수 단락 + questionText 꼬리 `

각주` · 렌더러 R-2 와 합쳐 별도 줄 |
| R-6 | 요약문 footnotes 에 이웃 41~42 세트 각주 혼입(36건) | `origin.mjs cleanSlice` 가 세트 머리 이후(trailing) 각주를 슬라이스 각주에 합침 | trailingFootnotes 로 분리(장문 전용). 귀속 게이트 재측정 요약 2/78 |
| R-7 | 요약문 지문 절단 미복원 | 스트림 줄 조립은 요약 박스가 앞/중간에 끼어 머리 유사도가 깨짐 → 절단 감지 무력 | 원형 **지문 박스**(60단어 이상·머리 일치, 각주 줄·인라인 각주 꼬리 제거)를 정본으로 → 7건 복원(+6~+49단어). 실패 경로(pending→함대 수리)에도 대체본 동반 |
| R-8 | 절단 지문이 이미 Passage 행으로 등록된 학원엔 대체본 미적용 | importExamPassages 멱등 보호 | 기존 행 content 가 대체본의 접두이면(사용자 편집 흔적 없음) content 를 대체본으로 늘린다(연결 불변) |

| R-9 | 출처형(주장·요지·주제·제목·내용일치)·요약문 각주 전량 미인쇄(약 450건) | 이 유형은 각주가 questionText 밖(footnotes[])이라 조판에 실을 자리가 없었다(1차 「미지원」으로 두었던 항목) | 반입 액션·렌더 검증 조립기가 `_gichul.footnotes` 를 싣고, `makePaperItem` 이 지문 내용 꼬리에 각주 블록을 붙인다(`

* word: 뜻`). `joinRenderedLinesForDisplay` 두 분기 모두 각주 줄 앞에서 줄을 나눠 지문 박스 아래 별도 줄로 인쇄. AI 생성 문항은 `_gichul` 이 없어 불변. 육안 확인: 주장·요약 3건(`render-all/idsfn2-p01.png`) |

- 삽입(SENTENCE_INSERT)은 원래 별도 경로라 각주가 이미 별도 줄이었다. 요약문 지문 각주는 R-9 로 해소.
- 각주는 은행 직렬화 그대로(`

* word: 뜻`) 두고 렌더러만 고쳤다 — DB 에 저장된 문항은 재반입 없이도 새 렌더를 탄다.

---

## 10. 전수 렌더 검증 결과(26-09-07 심야, 3,080문항 / 934페이지)

### 10.1 자동 게이트(DOM)
- 3,080문항 전부 실제 조판기(ExamDetailPaperPreview)로 렌더 — present·발문·첫 선지·본문 머리·각주·마커 수·원시 토큰·가로 넘침 **실패 0**(계기 교정 후 재검 15건 중 14건 계기 오탐, 1건 각주 표제어 철자 「precipitaion」 인쇄본 그대로).
- 페이지 세로 넘침 1/934(b0600-p01): **공용 페이지네이션의 선지 행 높이 추정 편향**(estimateOptionBlockHeight 1.45 vs 실측 leading 1.58 → 2줄 선지 5개면 ≈11px 과소) 위에 새 각주 줄(+19px, 추정은 정확)이 얹혀 6px 초과. 전 시험지에 걸친 추정치 변경이라 **사용자 결정 항목**(수정안: 선지 줄높이 계수 1.58·글꼴 11.5 로 실측 동기 — 기존 시험지 쪽 나눔이 조금 앞당겨질 수 있음).

### 10.2 감독 육안 표본(시대×유형 층화 70문항 / 75페이지 중 12페이지 정독)
- 2019~2027·2012~2018: 발문·마커·각주·선지·[3점]·정답표 이상 없음.
- **2005~2011 학평·수능에서 데이터 결함 2종 발견**(자동 게이트가 못 보는 것):
  1) **한글 자간 소실** — 발문·선지·각주가 「다음글에서밑줄친부분중」「외모로사람을판단하지마라.」 처럼 공백 없이 인쇄(146문항·587문자열, 대부분 2011년 이전). → 수리 함대(`wf_87ac58d3-d86`, 인쇄 자구 불변 규칙: 공백 제거 문자열 동일성 게이트) + `scripts/gichul-bank/data/text-fixes.json`(결정론 재생) + `assemble-bank.mjs applyTextFixes`.
  2) **선지 오염** — 다음 세트 머리 「[38 39] 다음글의요지로…」가 ⑤ 로, 「Cleopatra.」 조각이 ① 로(8문항: 세트 머리 6·중복 2). 같은 함대가 원형 슬라이스에서 인쇄 선지로 교체(새 자구는 원형 텍스트에 존재해야 통과).
  3) 마지막 선지 꼬리 쪽 번호 3건(「overestimates 3」) → text-fixes.json 수동 등재.
- 발문 자간 공백(「가 다 음」) 4건 → resolveDirection DIRECTION_WORDS 접합.

### 10.3 시각 검수 함대(페이지 이미지 전량, 24장/기)
- `wf_6e4fb2b9-f44`(b0000~b0270, 99장) · `wf_e22949a5-006`(b0300~b3060, 835장) — 결과는 §10.4 에 착지.

### 10.4 시각 검수 함대 결과 착지 + 후속 수리(26-09-08 새벽)
| # | 결함(검수·감독 육안) | 규모 | 조치 |
|---|---|---|---|
| D-1 | 요약문 (A)/(B) 라벨이 줄 경계에서 한 단어 밀림(「older (A) adults … and their goals」) | 9 + 함대 검증 5 | 요약 박스(인쇄 배치) 정본화(`handleSummary` 라벨 자리 검증) + 요약 검증 함대 `wf_eb06e2c1-8f7`(43건: ok 38·fixed 5) → `text-fixes.json summaryWithBlanks` |
| D-2 | 2005~2012 한글 자간 소실(발문·선지·각주) | 148문항·587문자열 | 수리 함대 `wf_87ac58d3-d86` 142건 채택(공백 제거 동일성 게이트), 선지 오염 3건은 토큰 게이트로 재조립 채택, 잔여 0 |
| D-3 | 내용일치 발문 주어 접두(「Matthew Henson에 관한」) 누락 | 24 | 함대 `wf_442436eb-786` 24/24 복원(조각 게이트) · 극성 오류 1건(2005 수능 32번 「일치하는」) 수동 + matchType 재계산 |
| D-4 | 함축의미 밑줄 범위 절단(「the divorce of the hands from」) | 4 | `bodyReplacements` 로 인쇄 구 전체에 밑줄 |
| D-5 | 하이픈 소실(three-dimensional)·비대칭 대시(「 -but」)·각주 마커 공백(「위계의** chromatic」) | 4·3·144 | 수동 치환 + `assemble spaceFootnoteMarkers` 전 항목 정규화 |
| D-6 | 마지막 선지 꼬리 쪽 번호(「overestimates 3」) | 3 | text-fixes 수동 |
| D-7 | 각주 한 줄만 다음 쪽으로 밀려 **각주 한 줄짜리 백지 페이지** | 실측 1 + 잠재 | 페이지네이션 3경로(그룹 지문 줄·구조화 박스 줄·본문 줄) 모두 각주 줄을 앞 줄과 한 블록으로 묶음(`pagination.ts`·`pagination-metrics.ts`) |
| D-8 | 선지 ⑤ 고아·주어진 문장/요약문 쪽 넘김·지문 첫 줄 고아 | 다수(major/minor) | **공용 페이지네이션 정책**(AI 문항 동일) — 사용자 결정 항목(선지 블록 원자화·박스 최소 줄 수) |
| D-9 | 줄표 「 - 」(em dash 아님) | 원본 데이터 유래(코퍼스) | 미조치(원문 표기) |

| D-10 | 2차 시각 검수 함대(`wf_e22949a5-006`, 835장 전부 읽음, 원시 412건 → confirmed 23·dropped 9) 추가 데이터 결함: 영문·숫자 뒤 조사 앞 공백(「Post 의」) 11 · 선지 꼬리 「) 영역」 2 · 삽입 본문에 주어진 문장 중복 2 · 그림 문항(삽화 없이는 풀이 불가) 4 · 함축 밑줄 절단(따옴표 케이스) 2 | 21 | `assemble glueParticles` 전 항목 정규화 · text-fixes 수동 · **그림 문항 4건은 `scripts/gichul-bank/data/excluded-ids.json` 으로 은행에서 제외(3,080 → 3,076)** |
| D-11 | 요약문 「(A)」 라벨과 빈칸선이 줄 끝에서 분리(22건) | 렌더러 | `renderFormattedInline` 이 라벨 뒤 빈칸선을 같은 조각으로 소비해 `whitespace-nowrap` 한 덩어리로 그림(전 시험지 공통, 시각 개선만) |

- 렌더러 정책(사용자 결정, 미조치): 선지 블록 원자화(①~⑤ 분할 30건) · 주어진 문장/요약문 박스 분할 금지(9) · 지문 첫 줄/마지막 2줄 고아(15+) · 마커형 본문 「(다음 칸으로 이어짐 →)」 라벨 미배선(30) · 삽입·순서 각주 위 빈 줄 간격(20) · 세로 넘침 안전여유(2/934) · 한글 각주 음절 줄바꿈(keep-all) · 대시/따옴표 타이포 통일.
- 데이터 파일 `scripts/gichul-bank/data/text-fixes.json`(169건)·`excluded-ids.json`(4건)은 결정론 재생 입력이라 커밋 대상.

### 10.5 최종 전수 렌더(run3, 26-09-08) — 3,076문항 / 103배치 / 926페이지
- **DOM 게이트 실패 3 → 전부 해소**(재주행 `idsfixes5` 0건 + 음성 주입 fake-q1 은 present·direction·option·passage 4게이트 전부 울림):
  - `ebsi_go3_20190710-q35`(무관) 「passage」 — **계기 비대칭**: 첫 문장이 짧아 ① 이 머리 슬라이스 안에 들어왔는데 렌더 쪽만 라벨을 뗐다 → 머리도 `stripLabels` 로 접음. 칼럼 넘김 라벨(「(14번 계속)」「(이어서)」)도 비교 전 제거.
  - `ebsi_go1_20100616-q32`(빈칸 (A), (B) 2빈칸형 — 은행 유일) 「direction」 — 계기(발문 머리에 라벨) + **실데이터 3건**: (A) 라벨 없는 빈칸·(B) 뒤 빈칸선 없음·본문 끝에 선지 머리행 「(A) (B)」 잔재. 원형 PDF(「drawing board. (A) , your best friend」·「thinking to do.」 뒤 각주)로 확인 → `bodyReplacements` 3건. **G8 blank-count 규칙을 「발문에 (A)…(B) 면 빈칸 2개」로 보정**(게이트 오탐은 게이트를 고친다).
  - `ebsi_go1_20120904-q25`(어휘) 「footnote」 — 각주 배열이 본문과 어긋남(PDF 원문 오탈자 「precipitaion: ( )」, 본문은 이미 「precipitation: 강수량」) → 배열을 본문 자구로 동기.
- **감독 육안(2005 수능 b3060-p02)에서 아포스트로피 소실 발견**(「a worm s cannot」) → 전수 스캔 `[A-Za-z] s [a-z]` 2건(2005_SN q35·q41) · 코퍼스 정본에 worm's/patient's 실재 → `bodyReplacements`.
- 페이지 세로 넘침 **1/926**(b0480-p01, 2024 6월 고2 q4): 우측 칼럼 끝 각주+선지 ① 2줄이 하단 여백을 침범 — §10.1 과 같은 **공용 선지 행 높이 추정 편향**(한글 2줄 선지 4개 + 영문 2줄 선지). 기출 전용 결함 아님, 사용자 결정(1.45→1.58 보정은 기존 시험지 전부 재페이지네이션).
- G8 렌더 왕복 3,076 / fail 0 · tsc 0 · eslint 0 error.
- 감독 최종 육안 8페이지: b0480-p01(넘침 확인)·b1590-p04·b2430-p05·b2760-p03/04·b3000-p01(2007 9월)·b2910-p01(2009 학평 요약·어법)·b2790-p06(2010 6월 삽입·순서)·b3060-p02(2005 수능)·idsfixes4-p01/02 — 수리 4건 모두 의도대로 인쇄.
- 계기 함정(재발 금지): ① heredoc/python 문자열로 JS·TS 를 패치하면 `
` 이 실제 개행으로 풀려 정규식이 두 줄로 쪼개진다(verify-bank.ts 실측) — 정규식은 `.*` 로 쓰거나 Edit 도구. ② G8 루프의 `it` 은 PaperItem 래퍼라 `direction` 이 없다(은행 항목은 `b`).


---

## 11. 2차 설계 — 모달 폐기, 인라인 기출 브라우저 (26-09-08 사용자 피드백 착지 · 함대 필독)

### 11.0 사용자 피드백(26-09-08 새벽, 실사용 후) → 결정
| # | 피드백(요지) | 결정 |
|---|---|---|
| F-1 | 「기출 문제 불러오기」 누르면 **모달**이 뜨는 것 자체가 싫다. 왼쪽(중앙 목록) 섹션에 기출 문제가 **리스트업**되는 형태여야 한다 | **모달 전면 폐기.** 문항 축 목록판이 「기출 문제」 소스 모드로 전환되어 같은 자리에 은행 목록을 그린다(§11.2) |
| F-2 | 필터링이 **체계적**이어야 한다 | 학년도(범위)·시험·출제기관·학년·유형·배점·검색을 목록 상단 필터 바 + 활성 칩으로(§11.3) |
| F-3 | 「시험지에 담기」가 뭔지 모르겠다. 담기 과정 자체가 필요 없다. 「이미 담김/중복」 멘트가 이해 불가 | **「담기」 개념·CTA·「담김」 배지·중복 토스트 전부 폐기.** 기출 행의 체크 = 지금 조판 중인 시험지에 넣기(다른 문항과 동일). DB 행 생성은 체크 순간 **무언(無言)·멱등**으로 일어난다(§11.4). 체크 상태의 정의는 「이 시험지에 들어 있음」 하나뿐 |
| F-4 | 모달 열면 오른쪽 섹션이 **자동으로 다음 문제로 틱틱 넘어간다**, 중앙은 선택이 안 된다, 전반적으로 **랙** | 원인 규명 필수(§11.1 RCA). 모달 폐기로 표면은 사라지지만 **같은 메커니즘이 인라인 판에 재현되면 안 된다** → 재발 게이트(§11.6 G-lag) |
| F-5 | 「내가 담은 적도 없는데 이미 담김」 | **감독 과실**: 검증 프로브가 실제 학원 클래스(2학년·고1 정예반·한영고)에 221문항을 반입해 두었다. 26-09-08 새벽 소프트 삭제 + 클래스 링크 221건 제거(되돌림 파일 `.tmp-gichul-bank/cleanup-2609-reversal.json`). **이후 모든 프로브는 전용 QA 클래스에서만 돈다**(§11.6) |
| F-6 | 「시험지」 패널 리사이즈 바를 **시험지 조판 때 오른쪽으로 더** 끌 수 있어야 한다 | 클램프 확장(§11.5) — 현행 상한/중앙 최소폭 실측 후 결정 |
| F-7 | 「기출 문제 불러오기」 버튼이 그 가로 줄을 **혼자 다 쓰도록** | 전폭(full-width) 버튼 1줄로 재설계(§11.2) |
| F-8 | UI 는 **미학적으로**, 플로우는 **자연스럽게**, 철저히 검수 | 시각 검수 함대(폭 3종 스크린샷) + 행동 게이트(Playwright) + 적대 검수(§11.6) |

(§11.1~§11.6 은 정찰 결과 착지 후 이어서 기록)

### 11.4 「체크 = 시험지에 넣기」 데이터 경로 — 정찰(서버 계약) 착지
정찰 결과(파일:줄은 26-09-08 기준):
- 저장 경로는 **DB Question 행을 강제**한다 — `saveExamPaperDraft`(`src/actions/exam-paper-builder.ts:822~946`)가 `questionId` 소유·`deletedAt:null` 을 전량 대조하고, 이 액션은 스튜디오 밖 5개 라우트가 공유한다. picks 의 키 도메인은 `Question.id`(`studio-home-client.tsx:2117 flatPicked`), `handleFlatSelectionChange` 는 미러에 없는 id 를 조용히 버린다(`library-pane.tsx:977`). → **가상 항목(bankId 만 든 픽) 기각**: 관문 4곳 + 공유 저장 액션 + IndexedDB 초안이 가상 항목을 세션 너머로 영속시키는 지뢰.
- 반입 액션 `importExamQuestionsToStudioClass`(`src/actions/studio/exam-questions.ts:86`)는 학원 스코프 태그 `gichul:<bankId>` 로 멱등이며 `questionIdsInOrder` 로 요청 순서를 보존한다. **1콜 비용 = DB 왕복 12~16회**(그중 `tags contains "kice:"` 전량 스캔 2회: `exam-passages.ts:103`, `exam-questions.ts:125` — 후자는 26-09-08 단위 S 가 제거, 전자만 멱등 정본으로 유지) + revalidate 3벌 + 후속 `refreshQuestions()` 1액션. Next 서버 액션은 **직렬 큐**(`docs/class-studio-spec.md:460~464`)라 체크 1개당 순진하게 1콜을 쏘면 **체크 20개 = 60~100초 큐 점유**(앱 전체 액션이 뒤에 줄 선다).

**결정 A′ — 코얼레싱 물질화(materialize-on-pick, batched)**
1. 기출 행 체크 → 즉시 **낙관 체크 표시**(행 로컬 상태 `pending`) → 400~600ms 디바운스 버퍼에 bankId 적재 → 버퍼를 **1콜**로 `importExamQuestionsToStudioClass({ bankIds, classId })` → `questionIdsInOrder` 를 기존 자동 체크 대기열(`pendingAutoPickRef` 합집합, `library-pane.tsx:997~1018`)에 넣고 `refreshQuestions()` 1회 → 미러 도착 시 조판 픽으로 착지(기존 계약 무변경). 버스트 동안 추가 체크는 같은 버퍼에 합류(디바운스 연장, 상한 150/콜).
2. 체크 해제 → 조판 픽에서 제거(`handleFlatSelectionChange`)만. Question 행은 남긴다(삭제 경로 없음·다른 시험지가 참조 가능). 버퍼에 아직 있으면 버퍼에서만 뺀다(콜 전 취소).
3. **체크 상태의 유일한 정의 = 「이 조판(flatPicked)에 들어 있음」**. 은행 행 ↔ Question.id 매핑은 `listStudioClassExamBankIds`(bankId→questionId, `exam-questions.ts:233`)로 판 진입 시 1회 + 반입 응답으로 증분 갱신. 「담김」 배지·「이미 담김」 토스트·「N문항 담기」 CTA·`importedBankIds` 차단(`use-exam-question-bank.ts:280`) **전부 삭제**.
4. 토스트: 성공 토스트 없음(체크가 곧 결과). 실패(네트워크·클래스 부재·skipped>0)만 1개, 실패한 행은 체크를 되돌린다.
5. 낙관 행 삽입 금지(정찰 권고 그대로) — 미러 실재 계약(`library-pane.tsx:1002~1004`)을 깨지 않는다. 대신 행 단위 `pending` 스피너로 「넣는 중」을 보인다.
6. **선행 수리 2건**(서버, 함대 단위 S):
   - `importExamPassages` 가 `passageIdByExamId` 맵을 반환 → `exam-questions.ts:125` 의 2번째 `kice:` 전량 스캔 제거.
   - `exam-passages.ts:151~156` 의 재담기 `createdAt` 터치에 opt-out(`touchCreatedAt:false`) — 조판 픽 경로는 지문함 정렬을 흔들지 않는다(2026-08-11 정책은 지문 담기 전용).

### 11.7 서버 계약 사실(함대 참고)
- 목록 API `GET /api/exam-passages/questions`(`route.ts:34~47`): `q, yearFrom, yearTo, exams, grades, boards, types, page, pageSize(≤100, 기본 40), ids`. 응답 `ExamBankRow`(본문 없음, preview 140자) + facets(나머지 필터로 좁힌 수) + `allIds(≤150)`. 캐시 헤더 없음(클라 `no-store`). 8.5MB JSON 은 모듈 스코프 1회 적재(요청당 비용 아님) — 요청당 계산은 전량 필터 1 + facet 5패스.
- 단건 전문 `GET /api/exam-passages/questions/[id]` → `{ item }`.
- 배점 필터는 API 에 **없다**(`points` 미지원) → §11.3 에서 추가 여부 결정.

### 11.2 인라인 기출 브라우저 — UI 확정(함대 필독, 정찰 렌즈 착지)
**자리**: 시험지 조판 뷰(`assetView === "exam"`, `ComposerListPane lockedKind="question"`)의 중앙 열(조판 중 420px 고정 — §11.5 에서 가변화). 기출 모드가 켜지면 **같은 자리**에 `ExamBankInlinePanel` 을 그리고 `ComposerListPane` 은 `hidden` 유지 마운트(필터·스크롤·렌더 캡 보존, 기존 mount-gate 계약 `library-pane.tsx:2639~2660` 과 동형). 학습지 조판 뷰(카드 모드)에는 진입구가 없다(§2-1 유지).

**진입 버튼(F-7)** — `composer-list-pane.tsx` 2층 필터 줄(`:2747~2806`)의 `ml-auto h-7` 버튼을 **철거**하고, 2층 줄 **아래에 전폭 한 줄**(자기 줄을 혼자 씀)로 재설계:
```
┌──────────────────────────────────────────────────────────┐
│ ▤  기출 문제 불러오기        평가원·교육청 3,076문항 · 2005~2027  ›│  h-9, w-full, rounded-lg
└──────────────────────────────────────────────────────────┘
```
- `data-tour="composer-exam-bank"`, 자구 「기출 문제 불러오기」 고정(프로브 계약). 스타일: `flex h-9 w-full items-center gap-2 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-3 text-[12px] font-bold text-blue-700 hover:border-blue-300 hover:from-blue-100` + 우측 보조 텍스트(`text-[11px] font-medium text-blue-500/80`, `@container` 34rem 미만이면 「3,076문항」만) + `ChevronRight`. 1층 h-9 검색 줄엔 절대 넣지 않는다(`:2791~2792`).
- 빈 상태 CTA(`composer-exam-bank-empty`)도 같은 전폭 스타일(높이 h-10).
- 프롭은 그대로 `onOpenExamBank?: () => void`(0인자 함수, memo 계약 `:446~448`). 카운트 문구는 호스트가 `examBankSummary?: string`(원시 문자열) 로 내린다.

**패널 구조** (`src/components/workbench/exam-question-bank/inline/` 신설, 모달 파일군은 완료 후 삭제):
```
ExamBankInlinePanel (flex h-full min-h-0 flex-col, @container)
├ 헤더 1줄 h-10: [← 내 문항으로]  기출 문제 · 「2학년」        [선택 N ▾]
│    ← 버튼: data-exam-bank-back, aria-label="내 문항 목록으로 돌아가기"
│    「선택 N」= 지금 시험지에 들어 있는 기출 수(flatPicked ∩ 은행). 클릭 → 해당 행만 보기 토글(data-exam-bank-only-picked)
├ 필터 바(§11.3) — sticky top, bg-white/95 backdrop-blur, border-b
├ 활성 필터 칩 줄(있을 때만): [2025~2027 ×][6월·9월 ×][빈칸추론 ×] … [초기화]
├ 결과 줄 h-8: 「현재 조건 3,076문항」 · [이 페이지 전체 선택 □]  ·  정렬 [최신순|회차순]
├ 목록(min-h-0 flex-1 overflow-y-auto, data-exam-bank-list) — 행 40개/페이지, 가상화 없음(40행)
│   행 = BankInlineRow(memo): 
│   ┌ □  2027 6월 · 21번  [함축의미] [3점]                     👁 ┐  1줄: 회차·번호(text-[11.5px] font-semibold text-slate-700) + 유형 배지(typeBadgeClass) + 3점 배지(bg-slate-900 text-white)
│   │    In fact, scientists attributing consciousness to any…     │  2줄: preview 1줄 말줄임(text-[12px] text-slate-600)
│   └────────────────────────────────────────────────────────────────┘
│   체크(□) = 「이 시험지에 들어 있음」. pending 이면 스피너(Loader2 animate-spin). 행 클릭 = 토글. 👁 = 전문 미리보기 팝오버(텍스트만, 조판기 렌더 금지)
└ 푸터 h-10: 공유 Pagination(≪ ‹ 1 2 3 … 77 › ≫), 페이지 바뀌면 목록 컨테이너 scrollTo({top:0}) 만(scrollIntoView 금지)
```
- 행 체크 시 시각 즉시 반영(낙관) → 400~600ms 코얼레싱 → 1콜 반입 → 자동 체크 착지(§11.4). 실패 시 되돌림 + 행 옆 `AlertCircle` 툴팁 + 토스트 1개.
- **DragSelect 밖**에 마운트한다(마키 선택이 은행 행을 집지 않도록, `composer-list-pane.tsx:46~54`).
- 뷰포트 유틸(sm:/lg:) 금지, `@container` 만(`:241~242`). 420px 에서 필터 바가 2줄로 떨어져도 붕괴 없어야 한다(F-8 시각 게이트 폭 3종).
- 접근성: 행 체크는 `role="checkbox" aria-checked`, `aria-label="{회차} {번호}번 {유형} 시험지에 넣기"`. 키보드: 목록에서 ↑↓ 이동·Space 토글.
- 미학: 색은 파랑(기출) 1계열, 회색 위계 2단, 배지 라운드 `rounded-md`, 행 hover `bg-slate-50`, 체크 행 `border-blue-300/80 bg-blue-50/60`(ComposerListPane 체크 행과 동일 — 같은 화면에서 같은 뜻은 같은 모양).

### 11.3 필터 체계(F-2)
필터 바(2줄 허용, `flex flex-wrap gap-1.5 px-3 py-2`):
1. 검색 input(`h-8 flex-1 min-w-[160px]`, 디바운스 250ms, aria-label="기출 검색", data-exam-bank-search) — 본문·발문·선지·제목·회차 부분일치(API `q`).
2. 학년도: `select` 2개(시작·끝, aria-label="학년도 시작"/"학년도 끝", `SELECT_CLS`) — 2005~2027, 시작>끝이면 자동 교환.
3. 시험: `FilterMenu`(multi, narrowHost) — 6월·9월·수능·예비·3월·4월·5월·7월·8월·10월·11월·12월(facet 카운트 표시).
4. 출제기관: FilterMenu(multi) — 대학수학능력시험·수능모의평가·학력평가.
5. 학년: FilterMenu(multi) — 고3·고2·고1.
6. 유형: FilterMenu(multi, grid) — 13유형 + 카운트.
7. 배점: FilterMenu(multi) — 2점·3점 → **API 에 `points` 파라미터 신설**(`ExamBankQuery.points?: number[]`, `matches()` 1줄, facet 은 생략 가능).
- 활성 칩 줄: 값별 × 제거, 「초기화」(data-exam-bank-reset-filters). 필터 상태는 세션 내 유지(패널 닫았다 열어도 유지, 클래스 바뀌면 유지 — 필터는 클래스와 무관).
- 정렬: 최신순(연도↓·시험순·번호↑, 기본) / 회차순(examId, 번호) — 클라이언트 정렬 금지, API 가 정렬(현행 `assemble` 정렬이 최신순이므로 기본은 무변경, 회차순은 옵션 `sort=exam`).
- 요청: 필터 변경마다 AbortController 로 직전 요청 취소, keep-previous, 응답 도착까지 결과 줄에 얇은 진행 바(스켈레톤 플래시 금지).

### 11.5 조판 중 중앙 열 가변화(F-6)
정찰 사실: 조판 중 중앙 열은 `w-[420px] shrink-0` 리터럴(`studio-home-client.tsx:4387~4395`), 시험지 aside 는 `flex-1` 잔여라 dossier 핸들의 드래그가 **무효**(rAF 로 쓴 `style.width` 가 flex-basis 0 에 묻힘, `resizable-panels.tsx:188~214`).
결정: 조판 중에는 핸들이 **중앙 열 폭**을 조절한다.
- `studio-home-client.tsx`: `composeCenterWidth` 상태(기본 420, localStorage `studio-compose-center-width`), 조판 중 중앙 열 `style={{width: composeCenterWidth}}` + `data-panel-key="compose-center"`; aside 는 그대로 flex-1.
- 클램프: min 420, max = containerWidth − tree 폭 − 핸들 2개 − **시험지 최소 560**(A4 미리보기 하한; 실측 후 조정). 드래그는 기존 fast path(`data-panel-key` 조회 → rAF → pointerup 1회 커밋) 재사용: `useResizablePanels` 에 조판 전용 spec 을 추가하지 말고, `PanelHandle` 이 조판 중엔 `panelKey="compose-center"`·`sign=+1`(오른쪽으로 끌면 중앙이 넓어짐) 로 동작하도록 `onResize` 콜백 경로를 하나 열어 준다(기존 dossier 스펙 무변경 = 비조판 레이아웃 무회귀).
- 핸들의 클릭-닫기(collapse) 동작은 유지.
- 게이트: 조판 열림 상태에서 핸들을 +200px 드래그 → 중앙 열 620px, aside 폭 감소, 정답표·A4 페이지 프레임 가로 스크롤 0; 새로고침 후 620 복원; 조판 닫으면 비조판 폭(dossier 360) 그대로.

### 11.6 검증 게이트(사용자 요구 F-8 · 재발 금지)
- **G-qa-class**: 모든 프로브는 전용 클래스 「QA-기출-브라우저(삭제예정)」 에서만 돈다(감독이 생성, 종료 시 삭제 + 반입 행 소프트 삭제). 실제 클래스 id 는 프로브 코드에 등장 금지.
- **G-flow**(Playwright, `.tmp-gichul-bank/probe-inline-bank.mjs`): 시험지 조판 진입 → 전폭 버튼 존재·폭 = 부모 폭(±2px) → 클릭 → `[role="dialog"]` **부재** · 인라인 패널 `data-exam-bank-inline` 가시 → 필터 3종 조작(유형·학년도·검색) 결과 수 변화 → 행 3개 체크 → 네트워크: `importExamQuestionsToStudioClass` **1회**(코얼레싱) → 3행 체크 유지·pending 해제 → 시험지 조판 `#exam-paper-print-root` 에 문항 3개 → 1개 해제 → 조판 2개 → 「← 내 문항으로」 → ComposerListPane 복귀, 필터 상태 보존 → 다시 열면 체크 상태 = 조판 기준.
- **G-lag**: 패널 열린 뒤 5초간 `PerformanceObserver` long task 합 < 300ms, 리렌더 카운터(React Profiler 훅 대신 `data-render-seq` 증가 수) 안정, 페이지 요청 수 = 조작 수(무한 재조회 없음), 오른쪽 조판 판이 사용자 입력 없이 바뀌지 않음(2초 관찰 DOM 서명 불변) — §11.1 의 메커니즘 재발 방지.
- **G-visual**: 폭 1280·1536·1920 × {패널 기본, 필터 2줄, 체크 3개, 빈 결과} 스크린샷 → 시각 검수 함대(적대 편향) → 중재 → 수리 → 재캡처.
- **G-a11y**: axe 주요 위반 0(체크박스 role/aria, 버튼 라벨).
- **G-regress**: 기존 프로브 `probe-exam-bank.mjs`(모달 계약)는 **폐기**하고 `probe-inline-bank.mjs` 로 대체 · `.tmp-studio-qa` 의 `data-panel-key="dossier"` 프로브 무회귀 · tsc 0 · eslint 0 error · 500줄 규칙(신규 파일).

### 11.1 RCA — 모달 「틱틱 넘어감·선택 불가·랙·이미 담김」(정찰 `root-cause-analyst`, 26-09-08)
| 증상 | 근본 원인(파일:줄) | 인라인 설계에서의 처방 |
|---|---|---|
| 오른쪽 미리보기가 저절로 다음 문제로 넘어감 | 자율 루프는 **없다**. 미리보기 활성화가 `onMouseEnter`+200ms 타이머(`exam-question-bank-modal.tsx:97~104`, `bank-row.tsx:80~81`)라, 관성 스크롤·레이아웃 이동(다이얼로그 zoom-in, 스켈레톤→행 교체, 툴바 줄바꿈, 「담김」 배지 지연 도착)으로 **행이 정지한 커서 밑을 지나갈 때마다** 브라우저가 합성 mouseenter 를 쏘고 타이머가 차례로 만료 → 활성 행이 목록 순서대로 걸어가며 매 틱 미리보기 fetch(`:87~89`) | **호버 미리보기 폐지.** 미리보기는 명시적 👁 클릭 팝오버만. 스크롤 중 타이머 없음 |
| 중앙 목록 선택 불가 | 반입된 행을 **체크됨+비활성**으로 그림(`bank-row.tsx:87~110`), 푸터는 `selected` 만 셈 → 1페이지가 전부 「담김」이면 「다 체크됐는데 선택 0」. 그 페이지가 전부 담김이었던 이유 = 감독 프로브 반입(F-5) | 「담김」 상태 자체 폐지(§11.4-3) |
| 전반적 랙 | 단일 핫스팟 없음, **팬아웃**: 훅이 매 렌더 새 `api` 객체(`use-exam-question-bank.ts:388~434`) → 모든 콜백 재생성, `BankRow` 40개 비메모, 필터 레일 2벌 상시 마운트(Popover 5개), 미리보기 모델 매 렌더 재계산(`bank-question-preview.tsx:285,197`), 목록 fetch 에 AbortController 없음(StrictMode 2중 요청), 「담김」 집합은 직렬 액션 큐 뒤에서 늦게 도착, **반입마다 `revalidatePath("/director/studio","layout")`(`passages.ts:46~49`) 로 스튜디오 전체 RSC 리프레시** | memo 행 + 안정 콜백, 필터 바 1벌, AbortController, 미리보기 지연 로드, **픽 경로는 revalidatePath 생략**(§11.4-6c) |
| 「이미 담김/중복」 멘트 | 토스트 description 「이미 있던 M개는 그대로 체크했어요」(`library-pane.tsx:1116~1119`) — 배지는 **클래스** 스코프(passage 링크∩태그), 서버 멱등은 **학원** 스코프(`exam-questions.ts:11~12`) 라 다른 클래스에 반입된 항목이 선택 가능하게 보였다가 existing 으로 돌아옴 + 「담김」 집합 지연 도착 레이스(선택 집합 미가지치기) | 토스트·배지 폐지. 체크 = 조판 소속 하나. 매핑은 반입 응답의 `mapping` 으로 즉시 갱신 |

### 11.4-6c (추가) 픽 경로 revalidate 생략
`importExamQuestionsToStudioClass` → `addPassagesToStudioClass` 가 매 호출 `revalidatePath(studio, "layout")` 2벌 + `importExamPassages` 의 revalidate 2벌을 부른다. 조판 픽은 로컬 상태(`refreshQuestions` + `onLibraryChanged`)로 충분하므로 픽 경로에는 `{ revalidate: false }` 옵션(additive, 기본 true = 기존 호출부 무회귀)을 뚫어 **RSC 전체 리프레시를 하지 않는다**.

### 11.8 패널 ↔ 호스트 계약(함대 P·H 동시 구현의 단일 진실원 — `src/components/workbench/exam-question-bank/inline/types.ts` 가 정본)
- 호스트(library-pane)가 소유: 기출 모드 on/off, `bankMap`(bankId↔questionId, 진입 시 `listStudioClassExamBankIds` 1회 + 반입 응답 `mapping` 으로 증분), 코얼레싱 버퍼(400ms, 상한 150), `pending/failed` 집합, `flatPicked` 파생 `pickedBankIds`.
- 패널(inline)이 소유: 필터 상태·페이지·fetch(AbortController·keep-previous)·미리보기 팝오버·키보드 이동.
- 패널은 서버 액션을 **직접 부르지 않는다**(호스트 콜백만). 패널 props 는 원시값·ReadonlySet·안정 콜백만(memo 계약).
- 반입 액션 반환에 `mapping: { bankId; questionId }[]` 추가(additive) — `questionIdsInOrder` 는 skipped 가 있으면 요청 배열과 정렬이 어긋나므로 매핑 재료로 쓰지 않는다.
- 삭제 대상(완료 후 감독이 지움): `exam-question-bank-modal.tsx`, `use-exam-question-bank.ts`, `bank-row.tsx`, `bank-filter-rail.tsx`, 구 `index.ts` export. `bank-question-preview.tsx` 의 모델/토크나이저는 `inline/bank-preview.tsx` 로 **이동**해 팝오버가 쓴다.

### 11.9 구현 착지 + 게이트 결과(26-09-08)
**함대**: `wf_497d2366-ebb`(5단위 병렬 S·P·H·C·R + 게이트 1회 통과, 6기 · 오류 0). 감독 후속 수리 4건(아래 ③~⑥).
- ① 서버(S): `importExamPassages(ids, overrides?, { touchCreatedAt, revalidate })` + `passageIdByExamId` 반환, `importExamQuestionsToStudioClass({ mode:"pick" })` → 2번째 `kice:` 전량 스캔 제거·revalidatePath 생략·`mapping[]` 반환, `addPassagesToStudioClass({ revalidate })`, 은행 API `points`·`sort=exam`.
- ② 패널(P): `src/components/workbench/exam-question-bank/inline/{exam-bank-inline-panel,bank-inline-filters,bank-inline-row,use-exam-bank-inline,bank-preview,types,index}` 7파일(전부 500줄 미만). 모달 6파일 삭제. `globals.css` 모달 예외 블록 → `[data-exam-bank-inline]` 폰 밀도 예외로 교체.
- ③ 호스트(H): library-pane 기출 블록 교체(모달·importedBankIds·토스트 전부 삭제, 코얼레싱 400ms·mapping·pending/failed·hidden 유지 마운트). 버튼(C): composer-list-pane 전폭 h-9 1줄 + `examBankSummary` 원시 prop, 빈 상태 CTA 동형.
- ④ 리사이즈(R+감독): `resizable-panels.tsx` override 경로(`overrideKey/Sign/Range/onOverrideCommit`, 기존 spec·storageKey 무회귀) + `studio-home-client` `composeCenterWidth`(localStorage `studio-compose-center-width`, `data-panel-key="compose-center"`). **COMPOSE_ASIDE_MIN 560→508**: 실측 사다리(440: 36px · 464: 17px · 484: 20px · 500: 4px 넘침) — 접힌 썸네일 20 + 핸들 컬럼 24 + 패딩 40 + 스크롤바 17 + A4×0.5 = 498 + 프레임 여백.
- ⑤ 빌더 자동 접힘(감독, `exam-paper-builder-client.tsx`): 컨테이너 < 420+24+260(+좌 핸들) 이면 편집 패널을 **표시상** 접고(`narrowRightForced`), < 545 면 썸네일 띠도 접는다(`narrowThumbsForced`) — 저장 상태 무접촉·넓어지면 자동 복귀. 이것이 §10 결정 원장의 「1536 조판 자동 개방 편집 패널 절단」 도 해소했다(1536 기본 aside 599px 에서 넘침 114 → 0).
- ⑥ `use-preview-zoom.ts` fitZoom `Math.round → Math.floor`: 올림 쪽에서 최대 4px 넘쳐 스크롤러에 가로 스크롤바가 생기던 선재 결함(508 에서 3px 실측).

**게이트(`.tmp-gichul-bank/probe-inline-bank.mjs`, 전용 QA 클래스 `cmtreuopx0001mmvckou0zr4s`, 매 주행 전 `_qa-class-cleanup.ts --reset`)**
| 폭 | 결과 | 핵심 실측 |
|---|---|---|
| 1536 | **40/40**(v5, 수리 사이클 뒤 · 게이트 40종) | 전폭 버튼 = 부모 폭 636/636 · 다이얼로그 0 · 필터 3,076→698(빈칸)→216(2012~2018)→206(검색)→초기화 3,076 · 체크 3 = 반입 POST **1회**·토스트 0·조판 3문항 · 해제 → 2 · 뒤로 → 내 문항 체크 2 · 재진입 상태 idle/picked/picked · 랙 idle 3초 long task 57~72ms·리렌더 ≤2·조판 판 불변 · 리사이즈 420→512(클램프 상한) · 새로고침 복원 · 페이지 넘침 0 · 페이지 오류 0 |
| 1920 | **41/41**(v6, 수리 사이클 뒤) | 편집 패널 열린 채 조판(63%) → 드래그 +200 → 편집 패널 260 으로 줄며 **유지**(I16)·썸네일 접힘·넘침 0 · 포커스·단조성·취소 레이스·40페이지 페이지네이션·툴바 경계 전부 통과 |
| 1280 | 39/41(v7) | **선재 한계**: 사이드바 220 + 트리 248 + 중앙 420 고정 → aside **352px**(핸들 여유 0, no-travel 판정 PASS). 편집 패널·썸네일을 접어도 스크롤러 251px < A4×0.5(397) 라 36px 넘침(전엔 편집 패널 320 이 열린 채 잘려 페이지 대부분이 안 보였다 — 개선됐으나 미해소). 해소안은 §11.10 결정 |
- ⑦ 인플라이트 코얼레싱(감독, final 주행 실측: 클릭 간격 >400ms 면 버스트가 2콜로 갈라짐): 반입 진행 중 들어온 체크는 버퍼에만 쌓고 착지 뒤 꼬리 flush 1회 — 느린 클릭 N개 = 최대 2콜(게이트 I11: 700ms 간격 3개 → posts=2·전부 picked). 클래스 전환 폐기 경로에서도 플래그를 풀어 다음 반입이 죽지 않게 했다.
- 계기 교정 이력(재발 금지): 총계는 `data-exam-bank-filtered-total` **속성값**으로(첫 fetch 전 텍스트 「0문항」 오탐) · `addInitScript` 는 reload 마다 재실행되어 localStorage 초기화가 복원 게이트를 스스로 지웠다(sessionStorage 1회 가드) · 초기화 스크립트가 `document.documentElement` 생성 전에 돌아 `appendChild` null 오류를 페이지 오류로 계수했다 · 이미 반입된 행은 콜 0 이 정답(instant 판정 병기).

### 11.10 열린 결정(사용자)
- **1280 뷰포트 조판**: aside 352px 는 어떤 접힘으로도 A4×0.5 를 못 담는다. 선택지 — (a) 조판 중 클래스 트리(248) 자동 접기(aside 600), (b) 조판 중 중앙 열 하한 420→360(입력면 축소), (c) 빌더 줌 하한 0.5→0.4(글자 가독 저하), (d) 현상 유지(1280 은 xl 경계·실사용 드묾). 감독 권고 **(a)** — 트리는 핸들 클릭으로 즉시 복귀하고 조판 중엔 거의 쓰지 않는다.
- 「선택 N」 토글이 `?ids=` 모드로 들어가며 필터 바를 안내 줄로 바꾼다(함대 P 판단) — 필터를 유지한 채 클라이언트 필터로 바꿀지.
- 조판 aside 툴바(A4·배포 토글·저장·인쇄·다운로드)가 508px 에서 「A4」 라벨을 숨긴다(빌더 선재 반응형) — 허용 여부.

### 11.11 드래그 성능 계약 완성(26-09-08, 사용자 지시 「기존의 부드러운 드래그를 제대로 활용」)
- 핸들은 이미 전역 계약(직접 DOM + rAF + 포인터 캡처 + 커밋 1회)을 탔지만, 조판 중엔 **폭이 바뀌는 시험지 판 안의 ResizeObserver 3개**(빌더 그리드 폭 → setBuilderWidth·클램프, 미리보기 fitZoom, 툴바 compact 라벨)가 프레임마다 setState 를 쏴 조판 전체를 드래그 내내 리렌더했다. 실측(1920, 40스텝 2초 드래그): 33ms 초과 프레임 13 · 최대 100ms · 조판 DOM 변이 115.
- 처방 `src/components/layout/panel-drag-freeze.ts`: 드래그 시작에 `body[data-panel-dragging]`, 종료에 표식 제거 + `smoat:panel-resize-end` 이벤트. 관찰자는 `deferWhileDragging(apply)` 로 감싸 드래그 중엔 마지막 값만 보관, 놓을 때 1회 적용(드래그 아닐 땐 즉시 = 무회귀). 적용: resizable-panels(begin/end), exam-paper-builder-client(그리드 폭), use-preview-zoom(fitZoom), preview-toolbar(compact).
- 실측(계측 `.tmp-gichul-bank/_dbg-drag-perf.mjs`, 드래그/놓음 구간 분리): 1920 드래그 구간 p50·p90 17ms, 33ms 초과 2, 최대 50~83 · 놓음 구간 1프레임 67~83ms(미룬 재계산 1회) · 조판 DOM 변이 115→14. 1536: 초과 1, 변이 55→14.

### 11.12 적대 검수 → 수리 사이클(26-09-08)
검수 함대 `wf_e0c826f9-211`(코드 3렌즈 + 시각 2렌즈, 원시 60+건 → 중재 confirmed 33 · dropped 19) → 수리 함대 `wf_c8bb8d74-e76`(H2·P2·S2·C2·B2 + 게이트 tsc 0·eslint 0).
| # | 확정 결함 | 수리 |
|---|---|---|
| 1 | **pending 해제 시점 ≠ 체크 착지 시점** — 반입 응답~자동 체크 사이 행이 idle 로 보여 재클릭이 2번째 POST | `bankAwaitingPickRef(questionId→bankId)`: flush 는 실패·취소·skipped 만 즉시 빼고, 미러 effect 가 hit 소진 시 pending 해제·miss 는 failed+토스트 |
| 2 | 인플라이트 중 체크→해제→재체크→해제 시 취소 표식 소실 | 해제 = 버퍼 delete + cancelled.add **항상** |
| 3 | 클래스 전환 시 매핑 조회 헛발사 | 검수 수정안(뷰 가드)은 H2 가 반박(그 커밋에선 assetView 가 아직 exam) → **클래스 축 렌더 중 전이 판정** `examBankSeenClassId` 로 감독이 적용 |
| 4~7 | 포커스 관리(열기→← 버튼, 뒤로→진입 버튼) · pending Set 헛렌더 · classCtx null 언마운트(→ 유지 마운트 + scopeLabel null) · 짧은 보조 문구 | H2/C2(`exam-bank-entry-button.tsx` 로 CTA 1벌화, `examBankSummaryShort`) |
| 8~14 | 팝오버 안 ↑↓ 가로채기 · 👁 40개 탭 정지점 · 페이지네이션 420px 넘침 · 행 aria-label 학년 누락 · 👁/팝오버 이름 · aria-busy/invalid · 필터 변경 시 스크롤 top | P2 |
| 15~20 | 미리보기 2단계 실패 시 문항 폐기 · 헤더 「」 절단 · 필터/칩 memo · X 버튼 폰 밀도 예외 · bank-preview 459줄 분리(`bank-preview-model.ts`) · 「선택만 보기」 로컬 필터+150 청크 · FilterMenu ▾ 소실 | P2(+공유 exam-filter-bar 1곳) |
| 21 | **기존 지문 본문 보강 분기가 절대 발화 안 함**(곱슬 따옴표·대시로 startsWith 실패, 실측 0/7 → 정규화 후 7/7) | S2 `squashForPrefix` + draft rawText/restoredText/teacherText 동기 갱신 |
| 22 | **클래스 지문 링크 300 초과 시 픽 무음 유실** | S2 `listStudioClassQuestions` take:300 제거 |
| 23~27 | 클래스 담기 청크 실패 삼킴(→ skipped+error) · passageIdByExamId 결정론(orderBy)+사본 전량 스캔 · 트랜잭션 옵션 통일 · route 정수 검증 · 검색 blob 에 본문 전체 | S2 |
| 28 | **조판 툴바 좌측 클러스터 압착(「/」 조각)** | B2: 좌측 shrink-0·우측 min-w-0·compact 에서 인쇄/다운로드 → 「⋯」 메뉴, flex-wrap 허용 |
| 29 | 편집 패널이 썸네일보다 먼저 접히고 1920 +200 에서 소실 | B2: `PREVIEW_COL_MIN_COLLAPSED=498`, hideLeft 클램프 중앙 예약 420→498(`centerMin` additive) → 782~842 구간에서 편집 패널이 260 으로 줄며 생존 |
| 30~31 | no-travel 핸들 표시(`dragDisabled`) · 「페이지」 접힘 탭 아이콘 구분 | B2 |
- dropped 19 중 결정 항목은 §11.10 으로 이관(1280 · 「선택 N」 방식 · 대형 UI 리맵 폰트 체계 · 「3점」 검정 알약 · 은행 행 자구 vs 내 문항 자구 · 해제한 기출이 내 문항에 잔류 · 검색 본문 범위는 §11.3 정본대로 본문 포함으로 확정).
- 게이트 추가(프로브): I4b pending→picked 단조성(≤50ms 폴링) · I12 취소 레이스(응답 2초 홀드) · I13 40페이지 페이지네이션 경계 · I14 툴바 자식 경계 · I15 포커스 · I16 1920 +200 뒤 편집 패널 유지 · I17 no-travel 핸들 aria-disabled.

## 11.13 3차 — 체크 즉시 조판 · 마키 드래그 · 아이콘 필터 · 날짜 정렬(26-09-08 사용자 피드백)
### 11.13.0 피드백 → 결정
| # | 피드백 | 결정 |
|---|---|---|
| G-1 | 「이 부분에서 부드러운 스크롤 구현하라고 했잖아」(기출 목록) + 앞선 「기존의 부드러운 드래그를 제대로 활용」 | **감독 오독 정정**: 요구는 리사이즈 바가 아니라 「내 문항」 목록의 **마키 드래그 선택**(`DragSelect`, 전역 드래그 계약: deferCommit·인라인 틴트·rAF 자동 스크롤)이다. 기출 목록에 같은 DragSelect 를 붙인다(§11.13.2) |
| G-2 | 체크 한 번에 로딩이 길다. 내 문제함에 안 담기더라도 바로 시험지에 렌더되면 안 되나 | **체크 즉시 조판**: 은행 항목을 클라이언트에서 BuilderQuestion 으로 조립해 임시 id(`bank:<bankId>`)로 조판기에 바로 넣고, DB 반입은 뒤에서(코얼레싱 그대로) 착지하면 **제자리 개명**(§11.13.1). 체감 = 내 문항 체크와 동일(수십~수백 ms) |
| G-3 | 필터 버튼이 좁으면 찌그러진다. 가로 스크롤 말고 직관적 아이콘으로 | 필터 바 `@container`: 좁으면 라벨 숨기고 아이콘+툴팁(시험 CalendarDays · 출제기관 Landmark · 학년 GraduationCap · 유형 Tags · 배점 Award), 카운트 배지 유지(§11.13.3) |
| G-4 | 기출을 선택하면 내 문항처럼 부드럽게 조판되는 느낌 | G-2 와 동일 + pending 스피너는 DB 동기화 표시로만 |
| G-5 | 내 문항 카드의 날짜 태그 위치가 이상하다 | 날짜를 액션 클러스터 아래 **카드 우측 끝**에 정렬(§11.13.4) |

### 11.13.1 체크 즉시 조판 — 계약
- 레지스트리 `src/components/exams/paper-builder/client-question-registry.ts`: `registerClientQuestion(id,q)` · `getClientQuestion(id)` · `registerQuestionIdAlias(temp, real)` · `takeQuestionIdAlias(temp)` · `isClientQuestionId(id)`(접두 `bank:`).
- 조립 `src/lib/exam-passages/question-bank-client-builder.ts`: `fetchBankItemAsBuilderQuestion(bankId)` = 단건 GET(+지문 박스 유형이면 `/api/exam-passages?ids=`) → 서버 반입과 같은 컬럼 매핑의 BuilderQuestion(임시 id). API 라우트라 서버 액션 직렬 큐를 타지 않는다.
- 호스트(library-pane) 체크 흐름: ① pending 낙관 ② `fetchBankItemAsBuilderQuestion` → `registerClientQuestion` → **그 다음** 임시 id 를 flatPicked 에 넣는다(`handleFlatSelectionChange(next, extraMeta)` — 미러에 없는 id 는 extraMeta 로 메타 공급, additive 2번째 인자) ③ 코얼레싱 반입(기존) ④ 착지: `registerQuestionIdAlias(temp, qid)` → flatPicked 의 키를 **같은 자리**에서 temp→qid 교체 → pending 해제(bankMap 갱신). 해제(전/후)·실패는 temp 또는 real 을 flatPicked 에서 빼고 레지스트리 정리.
- 조판기(exam-paper-builder-client): `resolveQuestionsForPaperInsertion` 이 서버 fetch 전에 레지스트리를 본다 · 동기화 effect 가 제거될 id 에 alias 가 있고 그 real 이 추가될 id 면 paperItems 의 questionId/sourceQuestion.id 를 **제자리 개명**하고 add/remove 를 건너뛴다 · `saveDraft` 는 `bank:` 항목이 남아 있으면 「기출 문항을 아직 넣는 중입니다 — 잠시 후 저장」 토스트 후 중단 · IndexedDB 초안에는 `bank:` 항목을 싣지 않는다.
- pickedBankIds 파생: flatPickedIds 의 `bank:` 접두 id 는 bankId 직결, 나머지는 역맵. 따라서 체크 직후부터 picked(+pending 스피너)이고 idle 창이 없다 — §11.12-1 의 awaiting 미러 소진은 불필요해져 제거.
### 11.13.2 마키 드래그(기출 목록)
- 목록 컨테이너(스크롤) > `<DragSelect deferCommit value={picked∪pending} onChange={(next, meta)=>…}>` > 행(`data-drag-item-id={bankId}`, 👁 는 버튼이라 자동 제외). add 드래그 = next − value 를 `onTogglePickMany(ids,true)`, remove 드래그 = value − next 를 false. 행은 `<div role="listitem">`(DragSelect 는 div 래퍼), 컨테이너 `role="list"`. rAF 자동 스크롤·인라인 틴트·놓을 때 1회 커밋은 DragSelect 계약 그대로.
### 11.13.3 아이콘 필터
- FilterMenu(공유) additive props `icon?: ReactNode`, `labelClassName?: string` — 트리거 = `{icon}<span className={labelClassName}>{label}</span>{count}{▾}`, `title={label}`. 은행 필터 바 루트에 `@container`, 라벨 span 은 `hidden @[30rem]:inline`. 5개 아이콘 위 표 참조. 가로 스크롤 금지.
### 11.13.4 카드 날짜
- composer-list-pane 문항/학습지 행: 날짜를 2줄(배지 줄)에서 빼고 액션 클러스터를 `flex-col items-end` 로 만들어 [⤢ ›] 아래 우측 끝에 `text-[10px] tabular-nums text-slate-400` 로 둔다(2줄 baseline 과 같은 높이, pr 축은 기존 10px 규약 유지).
### 11.13.5 게이트(추가)
- I18 즉시 조판: 체크 클릭 → `#exam-paper-print-root` 에 해당 문항 등장까지 **≤ 600ms**(반입 POST 전에 등장해야 한다) · 착지 뒤 data-paper-item-id 접두가 실제 id 로 바뀌고 순서·개수 불변 · 반입 POST 여전히 1회.
- I19 마키: 행 3개를 가로지르는 드래그 → 3행 picked·조판 3 · 해제 드래그(선택 행에서 시작) → 빠짐.
- I20 아이콘 필터: 420px 에서 라벨 span 이 hidden, 버튼 폭 ≥ 40, 5개 모두 한 줄·경계 안; 1920 에서 라벨 보임.
- I21 날짜: 내 문항 행의 날짜 span 우측 끝 = 행 우측 패딩 축(±2px), 2줄 baseline 과 ±3px.

### 11.13.6 착지 보정(감독, 26-09-08)
- **페이지 프리페치**: 패널 훅이 목록(40행)을 받으면 유휴 시간에 `GET /api/exam-passages/questions?ids=<40>&full=1`(응답 `fullItems`, 신설) 과 지문 박스 유형의 본문 `GET /api/exam-passages?ids=<csv>` 를 미리 받아 클라이언트 캐시(`question-bank-client-builder.ts` primeBankItems/primeBankPassages, 상한 400건)에 넣는다. `fetchBankItemAsBuilderQuestion` 은 캐시를 먼저 봐 체크 시 **네트워크 0**. 실측 전(단건 GET 66ms + 본문 53ms + 조판 ≈ 180~640ms) → 후(조판만).
- **pending 행 해제 허용**: 패널이 pending 행 클릭을 무시하던 가드 제거 — 체크 직후 몇 초간 취소가 막혀 「눌러도 안 빠진다」로 읽혔다(진단 `_dbg-cancel.mjs`: uncheck 클릭이 [bank-toggle] 없이 증발).
- **첫 체크의 지연 = 조판 판 첫 마운트(E25 자동 개방)**: dev 에서 ~4초(온디맨드 컴파일 포함), 판이 열린 뒤 체크는 179~232ms(진단 `_dbg-pick.mjs`). 내 문항 첫 체크도 같은 마운트 비용을 낸다 — 프리페치 대상이 아니라 §11.10 결정 후보(기출 모드 진입 시 조판 판 선마운트).
- 조판 항목 DOM 에 `data-question-id`(현재 questionId) 추가 — `data-paper-item-id` 는 localId(삽입 시 고정)라 개명이 안 보였다(프로브 오탐 원인).
- 호스트 픽 제출을 함수형 업데이트(`onFlatPickedUpdate`, 오케스트레이터 additive prop)로 전환(단위 H4) — 제출 shadow 가 남기던 stale base 창 제거.

### 11.13.7 3차 게이트 결과(26-09-08)
| 폭 | 결과 | 핵심 실측 |
|---|---|---|
| 1536 | **48/48**(p3g) | 판 열린 뒤 체크 → 조판 **0ms**(프리페치 캐시, 같은 프레임) · 첫 3체크(판 마운트 포함) 722ms · 착지 뒤 임시 id 0·순서 보존 · 버스트 3 = POST 1 + 4번째 1 · 취소 레이스(응답 2초 홀드, 체크→해제→재체크→해제) 최종 idle·조판 불변 · 마키 담기 3 → 조판 +3, 해제 드래그 2 → 정확히 2 빠짐 · 아이콘 필터(420px 라벨 0·한 줄·경계 안, 넓으면 라벨 5) · 날짜 우측 정렬(rightGap 1px, 배지 줄 +3px) · 포커스·단조성·페이지네이션·툴바 경계 전부 통과 |
| 1920 | **49/49**(p3g) | 편집 패널 유지·마키·즉시 조판·취소 레이스 전부 통과 |
| 1280 | 46/49(p3g) | 선재 aside 352px 한계 2건(§11.10) + 필터 라벨 임계 계기 오탐 1(루트 492 < 504 → 아이콘이 정답) |
- 단위 H4(호스트 픽 제출 함수형 업데이트): 오케스트레이터 additive `onFlatPickedUpdate` → 4개 제출 지점 순수 updater · shadow 기구 제거 · **취소 뒤 불필요 POST 의 원인 = 서버 액션 직렬 큐 대기 중 인자 고정** → 목록 재조회 진행 중이면 flush 를 미루고(버퍼 유지) 완료 커밋에서 흘림(`_dbg-cancel.mjs` 3/3 POST 0회).
- 조판기: 외부 동기화 add 가 await(서버 재조회) 중 해제되면 착지 시 최신 동기 집합에 없는 id 를 버린다(유령 항목 수리, `_dbg-cancel-real.mjs` 실측).
- 잔존(설계 밖): 다른 판의 서버 액션이 큐에 있을 때의 flush→POST 창(취소 표식이 착지에서 무해화, POST 1회 낭비) — 반입을 API 라우트로 옮기는 설계 변경 후보.
- **유형 팝오버 칩화**(26-09-08 사용자 지적 「무관한문\n장」): 공유 FilterMenu grid 분기를 4열 고정 그리드 → 라벨 자연 폭 칩 `flex flex-wrap`(w-300, whitespace-nowrap) + 문항 수(활성 파랑)로 교체. 지문 자료실 유형 필터도 같은 분기라 함께 개선. 캡처 `.tmp-gichul-bank/shots-inline/type-menu-1536.png`(13칩 5줄, 글자 중간 꺾임 0).

- **배점 필터 → 문항 번호 필터**(26-09-08 사용자 요구): 배점 메뉴 제거, 「번호」 메뉴(Hash 아이콘, 칩 그리드, facet 실재 번호 18~45 + 건수, 칩 「N번」) 신설. 서버 `qNums` 파라미터·facet 축(`qNums`·`counts.qNum`, 정적 facets.json 에 없어 모듈 스코프 1회 계산) 추가. API `points` 는 남겨 두되 UI 에서 제거(§11.3-7 폐기).
- 번호 메뉴는 FilterMenu `dense`(신설, grid 7열·숫자만·건수는 툴팁) — 28개 번호 4줄. 20번 선택 시 총계 151 실측.

---

## 12. 3차 — 장문 세트(41-42 · 43-45) 전수 반입 (26-09-08 사용자 지시 「고1·2·3 학평·모평·수능 전부, 필살기, 데이터 가공은 Opus」 · 함대 필독 정본)

### 12.0 전수조사 결과(감독 실측, `.tmp-gichul-bank/sets/census.mjs` · `census2.mjs` → `census*.json`)

| 항목 | 실측 |
|---|---|
| 원본(origin) 시험지 | 211 (평가원 57 · 고1 학평 64 · 고2 58 · 고3 32). **PDF 는 이미 전부 추출돼 있다 — 새 다운로드 없음** |
| 현대형(43~45 세트 있음) 시험지 | **158** = 고3 66(평가원 57 + 학평 9) · 고1 47 · 고2 45 · 2012~2027 |
| 43-45 세트 | 158 (표준 「순서(A)~(D)+지칭(a)~(e)+내용불일치」 154 · 변형 4) |
| 41-42 세트 | 152 = 「제목+어휘(a)~(e)」 **101**(2019~) · 「제목+**단일 빈칸**」 **49**(2014~2018, 발문 「위 글의 빈칸에 들어갈 말로…」) · 기타 2 |
| 세트 지문 텍스트가 코퍼스(passages.json)에 있는 것 | **82 / 758 헤더** — **평가원 37회차만**. 학평 117회차의 세트는 코퍼스에 없다 → **origin(PDF 스트림)만이 정본** |
| 정답표 결손 | 16회차: 학평 14(sol PDF 는 있으나 표 파싱 실패: go1 171122·211124·220324·240328 / go2 160901·180308·180905·181121·190307·211124·220324 / go3 170712·181016·230711·250710) · 2025_SN(코퍼스 세트 answer 있음) · 2027_09(`.tmp-trend-v2/srcpdf/2027_09.answers.json` + problems.json answerKey) |
| 구형 세트(2005~2013 수능·학평 46-48/49-50 등) | ≈75세트, 멤버 유형 혼합(제목·빈칸·순서4단락·지칭·내용·심경…) — **2차 범위(generic 경로, 화이트리스트 밖 멤버는 unsupported)** |
| **데이터 공백(사용자 결정)** | 고3 **3월·4월 학평 2015~2025 는 PDF 자체가 없다**(세트만이 아니라 은행 전체). 필요하면 EBSi 수집 별도 작업 |

계기 함정(census 실측): PDF 벡터 밑줄(`underlines[].prev="(a)"`)은 (a)~(e) 5개 중 일부만 잡힌다(147세트 결손) — **스트림 텍스트의 `(a) word` 토큰이 정본**, 벡터 밑줄은 다단어 스팬 보조. 43-45 지문은 q42 슬라이스 trailing, 41-42 는 q40 trailing(`origin.mjs setPassageLines`). 단락 라벨 「(A)」는 단독 줄. 페이지 넘김 가구(「8」「고1」「홀수형」)가 지문 한가운데 낀다(FURNITURE_RE). 각주는 세트 지문 뒤(trailingFootnotes). 2017_09_5007019 · ebsi_go1_20120314 는 단락 라벨이 표준과 다르다(개별 확인).

### 12.1 제품 결정(감독)

1. **세트 = 조판 단위.** 은행 목록에서 세트는 카드 1개(마스터 체크 + 멤버 행). 마스터 체크 = 전 멤버, 멤버 행은 개별 토글 가능(부분 세트 허용 — 조판기 세트 그룹은 멤버 수 무관). 헤더 총계는 **문항 수**, 페이지네이션은 **단위(세트 1 = 1단위)** 기준 — 세트가 페이지 경계에서 쪼개지지 않는다.
2. **인쇄 형식 = 평가원 원형.** 공유 지문 1박스 머리에 「[43~45] 다음 글을 읽고, 물음에 답하시오.」(조판기 setPrompt 가 문항 번호로 파생) · 43-45 지문은 (A)(B)(C)(D) **단락 분리**(라벨 단락 머리) · (a)~(e) 는 **라벨은 평문, 단어만 밑줄** · 42/44 선지는 「① (a) ② (b) ③ (c) ④ (d) ⑤ (e)」 한 줄 · 43 선지 표준 5순열 「① (B)-(D)-(C) …」 · 45 한국어 선지.
3. **멤버 subType**: 41 TITLE/TOPIC/MAIN_IDEA(발문) · 42 VOCAB_CHOICE(어휘형) 또는 BLANK_INFERENCE(단일 빈칸형, 2014~2018) · 43 SENTENCE_ORDER(구조 멤버) · 44 REFERENCE · 45 CONTENT_MATCH. 새 subType 신설 금지.
4. **멤버 본문에 지문·단락·마커를 넣지 않는다**(세트 persistence 계약 `prepareSetMember` 와 동형: `_setMember:true`, `_spans`, baked passage 없음). 43 도 `paragraphs` 를 structuredData 에 넣지 않는다(넣으면 passage-policy 가 임베드로 판정해 단락이 두 번 찍힌다). 단락은 **세트 레이아웃**만 가진다.
5. **표시 베이스(displayedPassage) ≠ 정본 지문(canonical).** 표시 베이스 = 인쇄본 그대로(43-45: `(A) …\n\n(B) …\n\n(C) …\n\n(D) …` 셔플 순서 · 41-42: 심긴 어휘 오류 그대로 · `(a) ` 라벨 평문 포함 · 빈칸형은 `_____` 포함). canonical = 코퍼스 본문(43-45: 정답 순서로 재배열한 이야기 · 41-42: 교정 원문, 라벨 없음). Passage 행(kice:<passageId>) 본문은 canonical(기출 지문 탭과 공유, 불변).
6. **학평 세트 지문은 코퍼스에 추가한다**(사용자 「데이터를 가져와야」): `passages.json` 에 ExamPassage 행 append(id `ebsi_go1_20260324-q43-44-45` 관례 · typeGroup 「장문」 · type 「장문(43-45)」/「장문(41-42)」 · reconstructionKind order/vocab_error/blank · answer 맵 · grade · era modern · wordCount) + `facets.json` 재계산 + `problems.json` 에 rawProblems/answerKey append. **되돌림 파일**(`.tmp-gichul-bank/sets/corpus-append-reversal.json`)을 남긴다. 41-42 어휘형의 canonical 은 **해설지(EBSi sol PDF)에서 교정어를 복원**한 본문 — 복원 실패 세트는 코퍼스에 넣지 않고 은행에서도 unsupported(사실 창작 금지: 교정어를 추측으로 채우면 critical).
7. **정답 정본 우선순위**: 공식 정답표(answer-keys.json, 형 일치) → 함대가 해설지에서 복원한 정답(`answers-extra.json`, 증거 페이지 첨부) → 코퍼스/problems.json answerKey. 43 정답 순열로 canonical 재배열, 44/42 정답으로 isInappropriate/odd-one 표시.
8. **1차 은행 무회귀**: 기존 3,076 단일 문항·G8·프로브(1536 48/48 등)는 그대로 통과해야 한다. questions.json 항목 모양은 additive 만.

### 12.2 데이터 계약(additive)

```ts
// src/data/exam-passages/question-sets.json — 세트 정본(멤버 항목은 questions.json 에 그대로 들어가고 setKey 로 연결)
interface ExamBankSet {
  key: string;                // = 코퍼스 passage id ("2026_SN_5093799-q43-44-45" / "ebsi_go1_20260324-q41-42")
  passageId: string;          // = key (Passage 행 kice:<passageId>)
  examId: string; year: number; exam: string; board: string; grade: string; era: string; form: string;
  qNums: number[];            // [43,44,45]
  label: string;              // "43~45" (setPrompt 는 조판기가 문항 번호로 파생하므로 표시용)
  memberIds: string[];        // bankId 순서 = qNum 순서 ("<key>#43" …)
  unsupportedQNums: number[]; // 파싱 실패로 빠진 멤버(부분 세트)
  displayedPassage: string;   // 인쇄본 표시 베이스(라벨 (a)~(e) 평문 포함 · 43-45 는 "(A) …\n\n(B) …" 셔플 · 빈칸형 _____ 포함)
  canonicalPassage: string;   // 코퍼스 정본(라벨 없음 · 정답 순서 · 교정 원문)
  layout: LayoutDescriptor;   // 43-45: {type:"SENTENCE_ORDER", blocks:[{label:"(A)",text,canonicalIndex,displayOrder}], fullPassage: displayedPassage, fingerprintHash}
                              // 41-42: {type:"NONE", fullPassage: displayedPassage, fingerprintHash}  ※ correctOrder 는 서버 전용 — 은행 JSON 에 넣지 않는다
  footnotes: string[];
  passageTitle: string;       // formatExamTitle 정본("2026학년도 수능 영어 43-45번 · 장문")
  provenance: { textSource: "origin" | "corpus+origin"; answerSource: string; vocabCorrection?: { planted: string; original: string; evidence: string } | null };
}
// questions.json 멤버 항목(ExamBankItem additive)
interface ExamBankItem { /* 기존 */ setKey?: string; setLabel?: string; setQNums?: number[]; }
// 멤버 structuredData: { _typeId, direction, options, correctAnswer, _setMember:true, _isStructural(43 만 true), _spans: Anchor[],
//   _gichul: { …기존, set: { key, label, qNums } , optionList?: "letters" } }
//   42(어휘)·44(지칭): _spans = 5 × { kind:"UNDERLINE", spanText, passageForm, surroundingText(≥30자, 라벨 "(a) " 포함한 원문 창), findStrategy:"wordStrict", occurrenceIndex? }
//   42(빈칸형): _spans = [] (표시 베이스에 _____ 가 이미 있다) · options 5 · correctAnswer "N"
//   43: _spans = [] · options 표준 5순열(인쇄 순열) · correctAnswer "N" · 43-45 는 4단락 — 조판기 정규식 [A-C] 는 멤버 본문에 단락이 없으므로 무관
//   44: options [{label:"1",text:"(a)"}…] · correctAnswer "N" · 42 어휘도 동일 선지 모양(SOURCE_EXACT 아님)
//   45: options 한국어 5 · matchType 「불일치」/「일치」(발문)
// 렌더 계약(§12.4): 조판기는 _gichul.set 이 있으면 멤버 본문을 「발문+선지」만 그리고 지문은 세트 그룹 머리 1박스(setRender/_spans 병합)로 그린다.
```

API(additive): `GET /api/exam-passages/questions` 응답에 `sets?: Record<string, ExamBankSet>`(응답 행이 참조하는 세트만, `full=1` 또는 목록 모두) · 목록 행 `ExamBankRow` 에 `setKey?/setLabel?/setQNums?` · 페이지네이션은 단위(세트=1) · `qNums` 필터는 멤버 번호로 세트를 남기되 세트의 **다른 멤버도 함께 보인다**(체크는 개별) · `typeGroups` 에 「장문」 = 세트 멤버 전부, 멤버 개별 typeGroup(제목·어휘·글의순서·지칭·내용일치·빈칸추론)도 그대로 필터됨 · facet 카운트는 멤버 수 · `GET …/questions/[id]` 는 `{item, set?}`.

### 12.3 파이프라인(scripts/gichul-bank/, Opus 소유)

```
A. build-sets.mjs  origin 211 → 세트 후보 전수(현대형 41-42·43-45 + 구형 generic) → .tmp-gichul-bank/sets/sets-draft.json
   - 세트 헤더 정규식 /\[\s*(\d+)\s*[～~\-–]\s*(\d+)\s*\]/ 이 **다음 문항 슬라이스 꼬리**에 있음 → setPassageLines(origin, firstQ)
   - 지문: 가구 제거·각주 분리·(A)~(D) 단독 줄 라벨로 블록 분할·(a)~(e) 토큰 → 스팬(벡터 밑줄 words 우선, 없으면 라벨 뒤 1토큰) + 주변 창
   - 멤버: originSlice(qNum) → splitStem/splitChoices → 발문 분류(제목/주제/요지/주장/어휘/빈칸/순서/지칭/내용/기타) → 핸들러(기존 handleSource·parseOrderPerms 재사용)
   - 정답: officialAnswer → answers-extra.json → 코퍼스 answer/problems answerKey → 없으면 set unsupported(no-answer)
   - canonical: 코퍼스 text 있으면 그것(+오라클 sim≥0.9, 43-45 는 정답 순서 재배열본과 대조) / 없으면 43-45 = (A)+정답순열, 41-42 어휘 = vocab-corrections.json 교정 적용, 빈칸형 = 정답 선지 삽입
   - 게이트 S1~S8: S1 멤버 수=qNums 수(부분 세트는 unsupportedQNums 기록) · S2 43-45 블록 4개 라벨 (A)(B)(C)(D) 순 · S3 (a)~(e) 스팬 5개 모두 표시 베이스에서 wordStrict+surrounding 으로 유일 위치 확정(reconstructPassageView 와 같은 규칙 — 실제 함수를 tsx 로 import 해 왕복) · S4 선지 5·정답 1..5·한국어 발문·물음표 · S5 canonical 어수 150~600, 한글 잔존 0, 사설영역 글리프 0 · S6 43 정답 순열이 인쇄 순열표에 있음 · S7 45 선지 한국어 · S8 세트 키·멤버 id 유일, 기존 questions.json id 와 충돌 0
B. answers-extra(Opus 함대): 결손 16회차 해설지/정답표 → .tmp-gichul-bank/sets/answers-extra.json {examId:{qNum:answer, evidence}}
C. vocab-corrections(Opus 함대): 학평 41-42 어휘형(≈64세트) sol PDF → {setKey:{planted, original, evidence(해설 인용)}} — 평가원은 코퍼스 plantedError 사용
D. assemble-sets.mjs  sets-draft(ok) → question-sets.json + questions.json 멤버 병합(정렬: 은행 정준) + questions-facets.json + passages.json/facets.json/problems.json append(되돌림 파일)
E. verify-sets.ts(G8 세트판): 조판기 실제 함수(buildQuestionSetMergedPassage/reconstructPassageView/structuredSegments/normalizePassageText)로 전 세트 왕복 — 병합 지문에 밑줄 5·라벨 5·단락 4, 멤버 본문에 지문 0
F. 렌더 전수: /director/dev/gichul-render?sets=1 … + probe-render-all --sets → 전 세트 페이지 PNG → 시각 검수 함대 + 감독 표본
```

### 12.4 앱 변경(단위 소유권)

| 단위 | 파일 | 요지 |
|---|---|---|
| R 렌더러 | `paper-builder/text-normalization.ts`(블록이 `^\([A-D]\)\s` 로 시작하면 각주처럼 `\n` 유지) · `render-model.ts`/option list(`_gichul.optionList==="letters"` → 42/44 선지 한 줄 「① (a) …」) · `paper-item-utils.tsx`(세트 멤버 `_gichul.set` → 본문 발문+선지만, 그룹 머리 setPrompt) · `question-bank-render.ts`(dev 하네스: 멤버 passage.content = displayedPassage, `_spans`, setId 공유) · `verify-bank.ts` 세트 케이스 | 무회귀: AI 세트·KO 세트·단일 문항 렌더 불변(게이트: 기존 R1~R4·run3 표본 재렌더 동일) |
| D 데이터/API | `question-bank-types.ts`(ExamBankSet·행/질의 additive) · `question-bank.ts`(세트 로더·단위 페이지네이션·facet) · `api/exam-passages/questions/{route,[id]}` · `question-bank-client-builder.ts`(세트 → setId `bank-set:<key>` + setRender 조립, 멤버 등록, 프리페치에 sets 포함) · `client-question-registry.ts`(세트 등록/조회 additive) | |
| S 서버 반입 | `actions/studio/exam-questions.ts`(세트 멤버 반입: QuestionSet 생성 — canonicalPassage=코퍼스, displayedPassageLayout=은행 layout(correctOrder 는 정답에서 재구성), layoutFingerprint, setLabel "[43~45]", basePassageId=Passage 행, status OK; 멤버 Question `setId`·`inSet:false`(일반 카드 노출, question-sets.ts:335 선례)·structuredData `_spans/_setMember/_gichul.set`; QuestionSetItem spans/orderInSet=qNum 순/isStructural; **멱등**: 멤버 `gichul:<bankId>` 태그 → 기존 멤버의 setId 재사용, 없는 멤버만 추가; 반환 `mapping[]` + `setMapping:[{setKey,setId}]`) · `listStudioClassQuestions` select 에 `setId`(additive, StudioClassQuestionRow.setId?) | 저장 가드·revalidate 규약 §11.4 유지 |
| B 조판기 | `exam-paper-builder-client.tsx` resolveQuestionsForPaperInsertion: 레지스트리 적중 문항에 `setRender` 가 이미 있으면 서버 세트 조회 없이 `setRenderById/setMembersBySetId` 를 레지스트리로 채움(§11.13 임시 id `bank:` 세트 = `bank-set:`) · alias 개명 시 `setId`/`setRender`/`groupId` 를 실제 세트 id 로 일괄 교체(멤버 전부 같은 그룹 유지) · `removeQuestionIdFromPaper` 의 세트 형제 제거와 flatPicked 의 정합(정찰 착지: 멤버 개별 토글 시 형제가 빠지면 안 된다 → gichul 세트는 개별 제거로 분기) | |
| P 패널 | `exam-question-bank/inline/*`: 세트 카드(마스터 체크 + 멤버 행, 멤버 행이 `data-drag-item-id` 마키 대상) · 미리보기(세트: 공유 지문 + 멤버 발문/선지) · 필터 「장문」·번호 · 헤더 총계 문항 수 | 500줄 규칙 — 세트 카드는 새 파일 `bank-inline-set-card.tsx` |
| H 호스트 | `library-pane.tsx`: 픽 = 멤버 단위(flatPicked 키 = 멤버 bankId) · 마스터 체크 = onTogglePickMany · 물질화 1콜에 세트 멤버 동봉 · 착지 시 setMapping 으로 조판기 개명 + 실제 행 setId 부여 · 프리페치 sets | |
| G 게이트 | `probe-inline-bank.mjs` I22~I28(세트 카드 마스터/멤버 토글·즉시 조판 그룹 1박스·(A)~(D) 4단락·밑줄 5·선지 한 줄·착지 후 그룹 유지·해제 시 형제 잔류·새로고침 후 동일) + `probe-render-all.mjs --sets` + verify-sets + tsc/eslint | 음성테스트: 결함 주입(스팬 1개 제거 → S3 RED, 단락 라벨 제거 → S2 RED, optionList 플래그 제거 → 선지 줄 게이트 RED) |

### 12.5 함정(정찰·실측, 재발 금지)
- `normalizePassageText` 는 단락을 공백으로 잇는다(「전부 통짜」) — 각주 블록만 예외. (A)~(D) 블록 예외를 추가하지 않으면 4단락이 한 문단으로 붙는다.
- 43 멤버 structuredData 에 `paragraphs` 가 있으면 passage-policy 가 임베드로 보고 멤버 안에 단락을 또 그린다.
- 조판기 `removeQuestionIdFromPaper` 는 setId 형제를 함께 지운다(AI 세트 관례) · `resolveQuestionsForPaperInsertion` 은 세트 멤버 1개를 넣으면 형제를 전부 펼친다 — 은행 세트의 「멤버 개별 체크」와 충돌하므로 `_gichul.set` 분기 필수(정찰 R2 가 확정).
- `listStudioClassQuestions` 는 setId 를 안 싣는다 → 호스트 미러에 세트 정보 없음(additive 로 추가).
- ExamDetail(저장 시험지·dev 하네스) 경로는 setRender 없이 `passage.content + _spans` 로 병합한다 → 하네스는 멤버 passage.content 에 표시 베이스를 넣어야 하고, 저장 시험지는 조판 시점 passageContent(병합본)를 보존한다.
- 어휘 42 의 인쇄 본문은 **오답 단어**가 박혀 있다 — canonical(코퍼스·Passage 행) 은 교정 원문. 반대로 넣으면 학습지가 틀린 단어를 가르친다.
- 코퍼스 세트 answer 는 홀수형 기준 — 2016~2021 수능 짝수형 PDF 와 선지 순서가 다르다(1차 함정 동일).
- census: 2027_09 는 problems.json 에만 있고 passages.json 에 없다(코퍼스 미적재 회차) — 세트도 코퍼스 append 대상.

### 12.6 착지 원장 (26-09-08 오후~저녁, 감독)

| 항목 | 실측 |
|---|---|
| origin(추출 원형) | 211 → **316회차** (EBSi 재고 합침 + 신규 다운로드 5회차 + 추출기 수리 12회차). 스캔본 31회차는 텍스트 0(OCR 단위) |
| 세트 후보 | 545 → **ok 451 · pending 86 · unsupported 8** |
| 은행 | 단일 3,076 + **세트 멤버 1,119 = 4,195문항** (`questions.json`), 세트 정본 `question-sets.json` 451 |
| 코퍼스 | passages 4,540 → **4,880**(세트 지문 append 339, 되돌림 `.tmp-gichul-bank/sets/corpus-append-reversal.json`) |
| 게이트 | `verify-sets.ts` 451세트/1,119멤버 **fail 0** · `verify-bank.ts`(G8) 3,076 **fail 0** · tsc 0 |
| 세트 구성 | 43~45 = 207 · 41~42 = 133 · 구형(46-48·49-50 등) = 94 · 고3 215 · 고2 116 · 고1 103 |

**감독이 직접 고친 것(함대 산출 착지 후)**

1. **S8 게이트 멱등 결함** — `build-sets.mjs` 의 S8 이 `questions.json` 전체 id 와 충돌을 봤다. 조립이 이미 멤버를 넣어 둔 뒤 재빌드하면 **자기 자신과 충돌**해 434세트가 전량 pending 으로 강등된다(실측). 충돌 대상을 **단일 문항 id 만**으로 좁혔다(세트 멤버는 assemble-sets 가 매번 걷어내고 다시 넣는 멱등 대상).
2. **`_gichul` 덮어쓰기** — `question-bank-client-builder.ts`·`actions/studio/exam-questions.ts` 가 `...item.structuredData` 를 편 뒤 `_gichul` 을 통째로 새로 써서 멤버의 `set`·`optionList`(§12.2)가 지워졌다. 셋 다(`question-bank-render.ts` 는 함대가 처리) 기존 `_gichul` 을 **펼친 뒤 반입 메타를 덧쓰도록** 병합.
3. **라벨 대문자화(감독 육안이 잡음)** — 조판 실물에서 41-42 공유 지문이 「(A) inevitable」, 44번 발문이 「밑줄 친 (A) ~ (E)」 파란 볼드로 나왔다. 인쇄본은 **소문자 (a)~(e) 평문**이다. 원인 2곳: (a) `parenthesizedMarkerDisplay` 의 `letter.toUpperCase()` (b) standalone 괄호 라벨이 마커로 처리됨. → **원문 대소문자 보존** + **소문자 standalone 라벨은 전역 평문**(호출부 옵션이 아니라 전역 규칙 — 발문·선지·지문이 렌더 지점 6곳에서 그려져 하나만 빠뜨리면 같은 문항 안에서 (a)와 (A)가 섞인다). 무회귀 실측: 평문 소문자 라벨은 REFERENCE 490 · VOCAB_CHOICE 110 이고 **전부 세트 멤버**, 밑줄 마커 소문자는 VOCAB_CHOICE 1,190(원문자 분기라 무관).
4. **선지 꼬리 오염 전수 스윕** — 함대가 「119건」으로 보고한 시험지 말미 안내문 오염은 최종 데이터에 **3건**만 남았다(단일 1 · 세트 2). 단일 1건(`ebsi_go1_20190604-q40`, 선지 ⑤에 다음 세트 머리가 통째로)은 `data/text-fixes.json` 에 결정론 교정 추가. 세트 2건(`2015_06_3026346#45` 「하시오. 하시오.」 · `2011_SN_3000996#50` 「※ 시험이 시작되기 전까지…」)은 `lib/sets.mjs` scrubOptionText 보강 대상 — **함대가 그 파일을 쓰는 중이라 미처리**.

**감독 육안 확인(조판 실물)** — `.tmp-gichul-bank/sets/shot-sets.mjs <setKeys>` 로 dev 렌더 페이지를 PNG 로 떨어뜨려 감독이 직접 봄. 2026 수능 43-45·41-42(kice2), 2026 고1 3월 학평 2세트 + 2013 6월 구형 46-48(mix): 세트 머리 「[n~m] 다음 글을 읽고, 물음에 답하시오.」·(A)~(D) 4단락·(a)~(e) 소문자 밑줄·「① (a) ② (b) …」 한 줄 선지·[3점] 배점·한국어 내용일치 선지가 **전부 인쇄본대로**. 원시 토큰 0.

**남은 결함(사용자 결정 대기)** — 세트 문항의 **선지 블록이 칼럼 경계에서 쪼개진다**(1번 ①②③ 왼쪽 하단 / ④⑤ 오른쪽 상단 「(1번 계속)」). §10.5 의 「선지 블록 원자화」 결정 항목과 같은 사안이고, 세트에서 더 자주 드러난다.

**pending 86 내역** — 어휘 교정어 미확보 63 · 빈칸 위치 미확보 13 · 게이트 RED(S5 6·S4 3·S6 2·S2 1·순열 미파싱 2) · canonical 빈칸 미충전 1. 회수 함대 `wf_3dc827a9-2ce` 진행 중.

### 12.7 회수 함대 + 감독 수리 착지 (26-09-08 저녁)

**회수 함대 `wf_3dc827a9-2ce`(Opus 5, 7기 전원 완주)** — 어휘 교정어 4기 · 빈칸/게이트 1기 · OCR 파일럿 1기 · 완전성 비평 1기.

| 산출 | 결과 |
|---|---|
| 어휘 교정어 | 63회차 전수 재조사 → **21건 회수**(V0 15 · V1 0 · V2 1 · V3 5). 정본 `vocab-corrections.json` 30 → **51** |
| 빈칸 앵커 | `blank-anchors.json` **18건** 신설 + `lib/sets.mjs` 폴백 배선 |
| 게이트 RED | S5 6 · S4 3 · S6/S2/순열 → **S5 1건만 잔존** |
| 완전성 비평 | `.tmp-gichul-bank/sets/completeness.md`(22KB) — 커버리지 매트릭스·누락 원장 10부류·미검증 주장 |
| OCR 파일럿 | 스캔본 31회차 — **문항 무결률 1~3%**, 밑줄·빈칸 벡터가 없어 복원 불가. 전량 육안 검수 필요 → **현 자료원으로는 비경제적** |

**어휘 교정어 42건이 왜 남았나(회수 불가 확정)** — 실패 원인은 탐색 누락이 아니라 자료의 구조적 한계다.
EBSi 학평 해설지 일부 판본은 42번 교정을 「경직성(→가변성)」 같은 **한국어 뜻풀이 화살표로만** 준다.
V1 슬라이스 16회차 전 페이지 텍스트 덤프에서 planted 영단어 출현 **0/16** — 영어 교정어는 인쇄돼 있지 않다.
국역에서 영어를 되짚는 것은 §12.1-6 사실 창작 금지에 정면으로 걸리므로 **추측하지 않는다**.

**감독이 직접 잡은 결함 3건(함대 착지 후)**

1. **게이트 S-R4 오탐** — 순서 세트의 단락 머리를 「ABCD」로 못 박아 **구형 3단락 세트가 RED**로 떴다
   (`ebsi_go3_20070418-q46-47-48`). 기대값을 그 세트의 `layout.blocks` 라벨로 바꿨다(최소 3블록).
   게이트 오탐은 데이터가 아니라 게이트를 고친다.
2. **세트 헤더 붙임표 소실** — 일부 PDF 는 텍스트 레이어에서 붙임표를 공백으로 떨궈 「[46 48]」로 나온다.
   `SET_HEADER_RE` 에 붙임표 생략과 `【 】` 괄호를 허용(후보 545 → 562). **실이득은 작았다** — 완전성 비평이
   예측한 16세트 회수 중 실제 ok 는 2세트(둘 다 멤버 1개)뿐이고 나머지는 글리프 중복으로 멤버 파싱이 안 된다.
   예측보다 실측이 우선한다는 사례로 남긴다.
3. **S9 고아 마커 게이트 신설(감독 육안이 잡음)** — 부분 세트에서 빠진 멤버의 마커가 지문에 그대로 남는다.
   실물 확인: 2017 수능 41-42 는 42(어휘/빈칸)가 빠져 41(제목)만 남았는데 지문 한가운데
   「usually **(A)** psychological clock」·「is **(B)** for batter number one」 이 정체불명으로 찍혔다.
   43(순서)이 빠진 43-45 는 **뒤섞인 순서의 (A)~(D) 단락**이 그대로 남아 글이 읽히지 않는다.
   → 살아있는 멤버가 요구하지 않는 라벨이 지문에 있으면 pending(**16세트 강등**). 「보이는데 못 푸는」 상태 금지(§2-9).
4. **조립기 멱등 결함** — `assemble-sets.mjs` 가 코퍼스에 append 만 하고 걷어내지 않아, pending 으로 강등된
   세트의 지문이 「기출 지문」 탭에 남았다(실측 8건, 전부 고아 마커 보유). 기준선에 없고 이번 ok 세트도 아닌
   세트 지문을 걷어내도록 수정(기준선 지문은 절대 불변).

**최종 상태(26-09-08 저녁)**

| 항목 | 값 |
|---|---|
| 세트 | **482** (3문항 260 · 2문항 222 · 고3 231 · 고1 126 · 고2 125) |
| 은행 | **4,267문항** (단일 3,076 + 세트 멤버 1,191) |
| 코퍼스 | passages **4,916** · 우리가 넣은 고아 지문 0 |
| 게이트 | `verify-sets` 482세트/1,191멤버 **fail 0**(음성테스트 RED 확인) · `verify-bank` 3,076 **fail 0** · tsc 0 |
| 세트 후보 | 562 → ok 482 · pending 61 · unsupported 19 |

**남은 pending 61 / unsupported 19** — 어휘 교정어 42(회수 불가 확정) · S9 고아 마커 16(부분 세트 정책 결정 대기) ·
S5 3 · 빈칸 2 · S4 2 / 멤버 파싱 실패 10 · 발문 화이트리스트 밖 9.

**사용자 결정 대기(신규)**
1. **선지 블록 원자화** — 세트 문항의 선지가 칼럼 경계에서 쪼개진다(①②③ 왼쪽 하단 / ④⑤ 오른쪽 「(N번 계속)」).
   전 시험지 조판 정책이라 세트만 따로 못 바꾼다.
2. **부분 세트 처리** — 어휘 교정어가 없는 41-42 세트 42건은 41(제목)만 살리면 63문항을 회수할 수 있으나,
   공유 지문의 canonical 이 오류 심긴 본문이 되어 코퍼스 오염 방지 장치가 선결이다(S9 게이트가 지금은 막고 있다).
3. **스캔본 31회차** — OCR 무결률 1~3%. 포기하거나, 출처형(제목·주제·요지·내용일치)만 육안 검수로 살리는 별도 작업.
