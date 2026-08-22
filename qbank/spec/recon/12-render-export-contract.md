# 렌더·출력 3경로 호환 계약 (정찰 확정본)

> 정찰 대상: `question-type-renderers.tsx` / `paper-builder/**` / `export-docx/**` / `export-hwpx/**` / `md-qgen/decoration.ts`
> 전제: [`00-contract.md`](00-contract.md) 의 확정 사항(1문서=1문항 · 머리표 3종 · 인라인 마커 4종 · 마커 밖 지문 불변 · 장식 0)은 재조사하지 않았다. 여기 적힌 것은 **파싱 계약 통과 이후**, 즉 저장된 `structuredData` 가 화면·시험지·워드/한컴으로 나갈 때의 계약이다.
> 모든 주장에 `file:line` 인용이 붙어 있다. 확인 못 한 것은 **[미상]** 으로 표기했다.

---

## §0 먼저 읽어라 — 이 문서가 뒤집는 상식 3가지

1. **경로는 3개가 아니라 4개다.** 워크벤치 웹 / 시험지(HTML=PDF) / DOCX / HWPX 가 **서로 다른 4개의 정규식**으로 같은 문자열을 해석한다. DOCX·HWPX 는 정규식이 동일(바이트 호환)하지만, 웹 2종과는 **다르다**.
2. **DOCX·HWPX 만 `_한글자_`(홑 언더스코어)와 `<u>`/`<b>` 를 서식으로 먹는다.** 웹 2경로는 안 먹는다. → 언더스코어 하나가 세 경로를 갈라놓는다.
3. **시험지만 `[대괄호]` 를 하나의 토큰으로 삼킨다.** `[... __밑줄__ ...]` 을 쓰면 시험지에서만 밑줄이 죽고 리터럴 `__` 가 인쇄된다.

> **이 문서의 핵심 산출물은 §7 저작 규칙 체크리스트다.** §1~§6 은 그 근거다.

---

## §1 경로 지도 — 누가 무엇을 렌더하는가

| # | 경로 | 진입 렌더러 | 입력 | 포매터(정규식 주체) |
|---|---|---|---|---|
| **W** | 워크벤치 웹 (문제카드·검수·문제은행) | `question-type-renderers.tsx` 26개 렌더러 | `structuredData` 필드 직접 (`passageWithMarkers` 등) | `renderPassageFormatted` / `renderUnderlinedText` / `renderBlanks` / `renderWithMarkers` / `renderMarkedSentencePassage` — `question-renderer-primitives.tsx:216,246,276,383,416` |
| **P** | 시험지 (A4 미리보기 = 인쇄 PDF) | `a4-paper-page.tsx` | `ExamQuestion.questionText`(직렬화 문자열) + `options` | `renderFormattedInline` — `paper-item-utils.tsx:674-785` |
| **D** | DOCX (MS Word) | `export-docx/_lib/build-builder-document/**` | 〃 | `parseFormattedText` — `export-docx/_lib/parse-formatted-text.ts:8-173` |
| **H** | HWPX (한컴) | `export-hwpx/_lib/render/**` | 〃 | `parseFormattedToRuns` — `export-hwpx/_lib/format.ts:33-107` |

부가 사실:

- **PDF 다운로드는 서버 조판이 아니라 시험지 미리보기 DOM 의 인쇄다** — `answer-key-layout.ts:6-8` ("PDF 다운로드는 미리보기 DOM 을 그대로 인쇄하므로(DOCX/HWPX 처럼 서버에서 붙이지 않는다)"). → **P 경로 = HTML 미리보기 = PDF**. 별도 계약이 아니다.
- W 는 `structuredData` 를 직접 읽고, **P/D/H 는 전부 `questionText` 라는 단일 직렬화 문자열을 읽는다.** 직렬화 주체는 `buildQuestionText` — `generate-questions-dialog/build-question-text.ts:16-86` (동일 복제본이 `generate-page-types.ts:160`, `passage-detail/exam-points/actions.ts:15` 에 3벌 존재).
- 5번째 표면으로 **클립보드 텍스트**(`question-bank-card/build-clipboard-text.ts:292`)와 **학생 응시 화면**(`exam-taking-client.tsx:129` — 패턴 `/__([^_]+)__|_{3,}/g` 만)이 있다. 본 임무 범위 밖이나, 학생 응시 화면은 **원형숫자·`(A)` 를 전혀 처리하지 않는** 가장 빈약한 포매터다.

---

## §2 ★ 포매터 4종 정규식 대조 (이 표가 계약이다)

### 2-1 최상위 토큰 정규식

| 경로 | 정규식 | 출처 |
|---|---|---|
| **W** (일반) | `` /__([^_]+)__\|_{3,}\|([①-⑳㉑-㉟㊱-㊿])/g `` | `question-renderer-primitives.tsx:295` |
| **W** (COMBO) | `` /__([^_]+)__\|_{3,}\|([circled])\|(\[[^\]]+\])\|\(([a-jA-J])\)/g `` | 〃 `:290-294` |
| **P** | `` /__([^_]+)__\|_{3,}\|([①-⑳㉑-㉟㊱-㊿ⓐ-ⓩ])\|\(([a-jA-J])\)\|(\[[^\]]+\])/g `` | `paper-item-utils.tsx:691` |
| **P** (KO 전용 확장) | 위 + 원형 문자 클래스에 `㉠-㉭` 추가 (`subType==null` 또는 `KO_*` 일 때만) | 〃 `:688-690` |
| **D** | `` /<u>(.*?)<\/u>\|<b>(.*?)<\/b>\|__([^_]+)__\|_([^_]+)_\|_{3,}\|([①-⑳㉑-㉟㊱-㊿ⓐ-ⓩ])\|\(([a-jA-J])\)/g `` | `parse-formatted-text.ts:22` |
| **H** | **D 와 문자 단위로 동일** | `format.ts:16` |

**읽어야 할 차이 4가지**

| 토큰 | W | P | D | H | 결과 |
|---|---|---|---|---|---|
| `_홑언더스코어_` | 무시(리터럴) | 무시(리터럴) | **굵게+파랑밑줄** | **굵게+파랑밑줄** | 웹엔 `_x_`, 워드엔 밑줄 `x` — **언더스코어 소실** |
| `<u>…</u>` / `<b>…</b>` | 리터럴 출력 | 리터럴 출력 | 서식 적용 | 서식 적용 | 웹에 태그 노출 |
| `(A)`~`(J)` 단독 | **무시** (COMBO 제외) | 파랑 굵게 (+유형별 ①변환) | 파랑 굵게 | 파랑 굵게 | 웹만 평문 |
| `[대괄호]` 덩어리 | 무시 (COMBO 만 파랑) | **한 토큰으로 삼킴** | 무시 | 무시 | **시험지에서만 내부 마커 사망** |
| `ⓐ`~`ⓩ`(U+24D0~24E9) | **`renderPassageFormatted` 미매칭** | 매칭 | 매칭 | 매칭 | W 는 `renderMarkedSentencePassage`(`:418`)에서만 인식 |

> ⚠ **`[대괄호]` 삼킴의 정확한 메커니즘**: P 의 정규식은 좌→우 스캔에서 `[` 위치에 도달하면 `__…__`·`_{3,}`·원형·`\(…\)` 가 모두 실패하고 `(\[[^\]]+\])` 가 성사된다. `[^\]]+` 는 언더스코어를 포함하므로 `[see __note__]` 전체가 group 4 로 잡혀 **내부의 `__note__` 가 리터럴로 인쇄된다** (`paper-item-utils.tsx:755-766`). D/H 는 대괄호 규칙이 없어 정상 밑줄이 된다.

### 2-2 밑줄 안 라벨 분리 정규식 (`__(A) expr__` → 마커 + 밑줄)

| 경로 | 원형숫자 접두 | 알파벳 괄호 접두 | 출처 |
|---|---|---|---|
| **W** | (없음) | `/^\(([a-jA-J])\)\s*(.+)$/` | `question-renderer-primitives.tsx:308` |
| **P** | `/^([circled+24D0-24E9(+3260-326D)])\s*(.+)$/` | `/^\(([a-jA-J])\)\s*(.+)$/` | `paper-item-utils.tsx:702-706, 722` |
| **D** | `/^([①-⑳㉑-㉟㊱-㊿])\s(.+)$/` | `/^\(([a-jA-J])\)\s(.+)$/` | `parse-formatted-text.ts:56, 79` |
| **H** | 〃 (동일) | 〃 (동일) | `format.ts:62, 73` |

> ★ **D/H 는 `\s`(공백 정확히 1개), W/P 는 `\s*`(0개 이상).**
> → `__(A)expression__`(공백 없음)은 **웹 2경로에서는 마커가 분리되고 DOCX/HWPX 에서는 분리되지 않는다**(`(A)expression` 전체가 밑줄).
> → 정본 산출물은 `__${label} ${sanitized}__` 로 공백 1개 — `question-postprocess/processors/grammar-error.ts:233`, `vocab-choice.ts:249`, `antonym.ts:164`, `grammar-correction.ts:111`. **이 형상을 어기지 마라.**
> D/H 의 원형숫자 접두 클래스에는 `ⓐ-ⓩ`(ⓐ~ⓩ)가 **빠져 있다** — `__ⓐ 문장__` 은 D/H 에서 마커 분리가 안 된다.

---

## §3 요소별 3경로 대조표 (임무 질문 ①)

`①` = 원형숫자, `(A)` = 알파벳 괄호 라벨.

### 3-1 밑줄 (단일 밑줄 — IMPLIED_MEANING · CONTEXT_MEANING · SYNONYM · REFERENCE)

| 축 | 저장 리터럴 | W (워크벤치) | P (시험지/PDF) | D (DOCX) | H (HWPX) |
|---|---|---|---|---|---|
| 표기 | `__expression__` | `<span class="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900">` `primitives.tsx:228-233` | `<span class="font-semibold underline decoration-blue-500 underline-offset-4">` `paper-item-utils.tsx:736-740` | `TextRun{bold:true, underline:{SINGLE, color:"3B82F6"}}` `parse-formatted-text.ts:100-108, 31` | `RunNode{bold:true, underline:"SOLID", underlineColor:"#3B82F6"}` `format.ts:83-88` |
| 색 | blue-500 데코 | blue-500 데코 | `#3B82F6` | `#3B82F6` | 4경로 색 일치 |
| **굵기** | — | **semibold** | semibold | **bold** | **bold** | 미세 불일치(무해) |

### 3-2 밑줄 + 라벨 (GRAMMAR_ERROR · VOCAB_CHOICE · ANTONYM · GRAMMAR_CORRECTION)

| 축 | 저장 리터럴 | W | P | D | H |
|---|---|---|---|---|---|
| 저장 축 | `__(A) expr__` ~ `__(J) expr__` | — | — | — | — |
| **학생 표면 라벨** | | GRAMMAR_ERROR: **`①`** (`primitives.tsx:311-316`)<br>ANTONYM/VOCAB_CHOICE: `formatInlineMarkersForSubtype` 로 **`①`** (`question-type-renderers.tsx:220,815`)<br>그 외: `(A)` 유지 | **`①`** — `formatInlineMarkersForSubtype` 가 `paper-item-utils`·`pagination-metrics.ts:616`·`a4-paper-page.tsx:1225` 에서 선적용 | **`①`** — `build-builder-document/question.ts:54` 가 동일 함수 선적용 | **`①`** — `render/question.ts:325`, `render/fragment.ts:430,466,470` |
| 라벨 색 | | `font-bold text-blue-600` `primitives.tsx:319` | `font-bold text-blue-700` `paper-item-utils.tsx:710` | `#1D4ED8`(markerBlue) `styles.ts:43` | `#1D4ED8` `tokens.ts:16` |
| 변환 주체 | | 렌더러별 개별 | 공용 `formatInlineMarkersForSubtype` (`option-display.ts:262-279`) | 〃 | 〃 |

> `formatInlineMarkersForSubtype` 는 **5유형만** 변환한다: SENTENCE_INSERT → IRRELEVANT → VOCAB_CHOICE → GRAMMAR_ERROR → ANTONYM (`option-display.ts:262-279`). **GRAMMAR_CHOICE_COMBO · GRAMMAR_CORRECTION 은 목록에 없다** → 이 두 유형의 `(A)` 는 4경로 전부에서 `(A)` 로 남는다.

### 3-3 네모(박스) — GRAMMAR_CHOICE_COMBO

| 축 | 값 | 근거 |
|---|---|---|
| 저장 리터럴 | `` `(A) [left / right]` `` (평문 — 전용 마커 없음) | `question-postprocess/processors/grammar-choice-combo.ts:229-241` (주석: "네모 치환: `(A) [좌 / 우]` 평문 — 렌더러 특수 마커 불필요") |
| **W** | 대괄호 덩어리 → `font-semibold text-blue-700`, `(A)` → `font-bold text-blue-600` | `primitives.tsx:290-294, 347-360` (`subType==="GRAMMAR_CHOICE_COMBO"` 일 때만) |
| **P** | 대괄호 → `font-semibold text-blue-700`, `(A)` → 파랑 | `paper-item-utils.tsx:755-766` (`subType` 게이트 동일) |
| **D** | **대괄호 규칙 없음 → 검정 평문 `[left / right]`**. `(A)` 만 파랑 | `parse-formatted-text.ts:22` (패턴에 `\[…\]` 대안 부재) |
| **H** | **동일 — 검정 평문** | `format.ts:16` |

> ★ **어느 경로에서도 실제 사각 테두리는 그려지지 않는다.** "네모"는 대괄호 + 색이다. **DOCX/HWPX 에서는 색조차 없다** — `grep -rn "GRAMMAR_CHOICE_COMBO" export-docx/ export-hwpx/` 결과가 `SUBTYPE_LABELS`(레이블 문자열) 2건뿐임을 확인.

### 3-4 번호 마커 ①②③

| 축 | 값 | 근거 |
|---|---|---|
| 생성 | `getCircledNumber(i)`: 0–9 → `①`~`⑩` 상수배열, 10–19 → `U+2460+i`, 20–34 → `U+3251+…`, 35–49 → `U+32B1+…`, 그 외 → `(n+1)` | `question-postprocess/types.ts:28-44` |
| **W** | `font-extrabold text-blue-600 text-[18px] mx-1 relative -top-[1px]` | `primitives.tsx:337-345` |
| **P** | `mx-0.5 font-bold text-blue-700` | `paper-item-utils.tsx:742-747` |
| **D** | `TextRun{bold:true, color:"1D4ED8"}` — **`markerColor` 인자와 무관하게 항상 파랑** | `parse-formatted-text.ts:110-120` |
| **H** | 〃 동일 | `format.ts:89-91` |
| 문장 마커(IRRELEVANT) | `ⓐ`~`ⓔ`(U+24D0~) 레거시를 표시 시점에 `①` 로 정규화 | W: `primitives.tsx:62-68, 416-419` / P·D·H: `formatIrrelevantPassageMarkers` `option-display.ts:108-123` |

### 3-5 (A)(B)(C) — 다중빈칸 · SENTENCE_ORDER 단락 라벨

| 축 | 값 | 근거 |
|---|---|---|
| 다중빈칸 지문 마커 | `(A) _____` 형 — 저장 계약 | `option-display.ts:306-311` 주석 |
| SENTENCE_ORDER 단락 라벨 | **리터럴 `(A)`/`(B)`/`(C)` 강제** | `md-qgen/adapter-order.ts:17` ("⚠ paragraphs[].label 은 반드시 리터럴 `(A)`/`(B)`/`(C)` 다"), 검사 `:55` |
| SENTENCE_ORDER 색 | **검정** (다른 유형은 파랑) | P: `paper-item-utils.tsx:635` / D: `build-builder-document/question.ts:591` / H: `render/section-types.ts:218-230` (`renderParagraphs` → `markerColor: COLORS.black`) |
| 선지 본문의 `(A)` 색 | **검정** | D: `parse-formatted-text.ts:30`(기본 파랑) 대비 / H: `render/options.ts:104` `markerColor: COLORS.black` |

### 3-6 빈칸

| 축 | 값 | 근거 |
|---|---|---|
| 정본 리터럴 | **`_____` (언더스코어 정확히 5개)** | `question-postprocess/types.ts:27` `export const BLANK = "_____"` · `md-qgen/prompts-fill-blank-key.ts:28` `FILL_BLANK_KEY_MD_BLANK = "_____"` |
| 매칭 | `_{3,}` (3개 이상이면 전부 빈칸) | 4경로 공통 |
| **W** | `<span class="inline-block min-w-[100px] border-b-2 border-blue-400 mx-1">&nbsp;</span>` | `primitives.tsx:362-370, 258-264` |
| **P** | `<span class="mx-1 inline-block min-w-[56px] border-b border-slate-500">&nbsp;</span>` | `paper-item-utils.tsx:767-778` |
| **D** | `TextRun{text:"               "(공백 15), underline:SINGLE}` — **검정** | `parse-formatted-text.ts:132-142` |
| **H** | `push("               ", {underline:"SOLID"})` — 동일 | `format.ts:95-97` |
| 요약문(SUMMARY_COMPLETE_MC) | 표시 시점에 `(A)` 뒤로 `_____` 를 **주입**하고 `_{6,}` 는 `_____` 로 축약 | `lib/summary-complete-mc.ts:215-221` |

> ★ **게이트가 실제로 막는다**: 요약문 본문에 `_____` 를 직접 쓰면 `(A) _____ _____` 로 이중 인쇄된다 → `md-qgen/gate-summary-complete.ts:234-236` 이 「요약문에 밑줄(`_____`)이 있음 — 빈칸 자리는 라벨 `(A)` 로만 표시할 것」으로 반려.

---

## §4 선지 표기 규약 — 원문자 vs 숫자, 축 변환 지점 (임무 질문 ③)

### 4-1 3축의 정체

| 축 | 값 | 사는 곳 |
|---|---|---|
| **md 저작 축** | `①`~`⑤`(일반) / `(A)`~`(J)`(마커) | 저작 md 원문 |
| **저장 축** | `"1"`~`"8"` 숫자 문자열 (일반) / `"(A)"` 유지 (어법·반의어 지문 마커) | `options[].label` — `md-qgen/adapter.ts:74-78` `digitOptionLabel` |
| **학생 표면 축** | `①`~`⑩` | 렌더 시점 |

### 4-2 ★ 변환 지점은 단 하나: `optionDisplayLabel`

```ts
// option-display.ts:29-39
export function optionDisplayLabel(subType, index, storedLabel) {
  if (subType && CUSTOM_LABEL_SUBTYPES.has(subType)) {   // CUSTOM / CUSTOM_LAYOUT
    const t = (storedLabel ?? "").trim();
    if (t) return t;
  }
  return optionOrdinalLabel(index);                       // = getCircledNumber(index)
}
```

> ★★ **`CUSTOM`/`CUSTOM_LAYOUT` 을 뺀 전 유형에서 저장 라벨은 무시되고 배열 인덱스로 `①②③④⑤` 가 붙는다.**
> → 저장 라벨이 `"3"`인데 배열 0번이면 화면에는 `①` 이 찍힌다.
> → **선지 배열 순서가 곧 학생 표면 번호다.** 셔플 후 라벨과 순서가 어긋나면 정답이 어긋난다.

**동일 함수를 쓰는 곳 (= 4경로 축 일치 보증)**
| 경로 | 호출 |
|---|---|
| W | `optionBadgeDisplay` 가 원형숫자를 **평문 숫자로 되돌려** 파란 원 배지 안에 넣는다 — `primitives.tsx:459-466, 552` (원 안 원문자 방지) |
| P | `a4-paper-page.tsx:1316-1319, 1397-1401` |
| D | `render-options.ts:166, 208`, `build-builder-document/question.ts:632-` |
| H | `render/options.ts:94` |

### 4-3 선지 목록 자체를 그리지 않는 4유형

```ts
// option-display.ts:10-15, 51-53
const PASSAGE_MARKER_ONLY_SUBTYPES = new Set(["GRAMMAR_ERROR","IRRELEVANT","SENTENCE_INSERT","VOCAB_CHOICE"]);
export function shouldRenderOptionListForSubtype(subType) { return !PASSAGE_MARKER_ONLY_SUBTYPES.has(subType || ""); }
```

- W: `question-type-renderers.tsx:152`(GRAMMAR_ERROR) / IRRELEVANT·SENTENCE_INSERT·VOCAB_CHOICE 렌더러는 `OptionList` 자체를 부르지 않음(`:443-454, 273-285, 211-241`)
- P/D/H: `render-options.ts:128`, `render/options.ts:77`, `a4-paper-page.tsx:914-915`
- **오답 분석(선지별 해설)은 이 4유형도 렌더된다** — `shouldRenderWrongAnalysisForSubtype` `option-display.ts:60-65` (26-07-06 실측 버그 수정 지점)

→ **이 4유형에 대해 md 저작 시 선지 텍스트를 아무리 잘 써도 학생은 보지 못한다.** 지문 마커 `①~⑤` 가 곧 선지다.

### 4-4 선지 텍스트 유형별 표시 변환 (`optionDisplayTextForSubtype` `option-display.ts:402-427`)

| 유형 | 변환 |
|---|---|
| GRAMMAR_ERROR | `optionReferenceLabel(index)` = `(A)`~ 로 **텍스트를 통째 대체** (실제로는 목록 미렌더라 사실상 dead) |
| SENTENCE_INSERT | `getCircledNumber(위치마커인덱스 ?? index)` |
| ANTONYM | 선두 `(A) ` 접두 제거 — `stripAntonymOptionLabel` `:146-148` (이중 라벨 실사용 신고 26-07-26) |
| 그 외 | 무변환 |
| BLANK_INFERENCE 다중빈칸 | **여기서 변환하지 않는다** — 표면별 명시 처리 (`:423-426` 주석: "숨은 일괄 변환 금지") |

### 4-5 다중 빈칸 조합 선지 — 4경로 표시 형상

| 축 | 값 | 근거 |
|---|---|---|
| 저장 | `text = blankValues.join(" …… ")` — 구분자는 **공백+`……`+공백** | `option-display.ts:313` `MULTI_BLANK_VALUE_SEPARATOR = " …… "` |
| 발동 게이트 | `multiBlankOptionMatrix(options)` — **선지 전원이 2값 이상**이어야 발동, 하나라도 아니면 `null` | `:384-400` |
| **W** | `MultiBlankOptionGrid` — CSS grid 컬럼 헤더 `(A)/(B)/(C)` | `primitives.tsx:487-524`, `multi-blank-option-grid.tsx:48-` |
| **P** | 동일 컴포넌트 | `a4-paper-page.tsx:1294-1320` |
| **D** | 무테두리 `Table` (헤더행 + 값 셀, 구분 셀에 `……`) | `render-options.ts:33-118`, `build-builder-document/question.ts:621-630` |
| **H** | **공백 패딩 헤더 문단 1줄** + 일반 선지 문단 (비례 글꼴이라 근사 정렬) | `render/options.ts:31-68` |

> ★ 값 안에 ` …… ` 를 쓰면 컬럼이 하나 늘어난다. **값 텍스트에 `……`(U+2026 2개) 를 절대 넣지 마라** — split 패턴 `/\s*……\s*/` (`:316`).
> 이미 `(A)` 접두가 붙은 값은 재라벨하지 않는다 — `MULTI_BLANK_ALREADY_LABELED_PATTERN` `:319`.

---

## §5 절대 쓰면 안 되는 문자·구문 (임무 질문 ②)

> **P0 = 출력이 깨진다(경로 간 불일치·문자 소실). P1 = 오조판(레이아웃/섹션 오인). P2 = 미관.**

| 등급 | 금지 | 무슨 일이 나는가 | 근거 |
|---|---|---|---|
| **P0** | **홑 언더스코어 `_`** (지문·선지·해설·모범답안 전부) | W/P 는 리터럴, **D/H 는 `_([^_]+)_` 로 삼켜 굵게+밑줄** → 언더스코어가 사라지고 서식이 생긴다. `snake_case`·`a_b` 전부 해당 | `parse-formatted-text.ts:22,53-58` / `format.ts:16,59-61` vs `primitives.tsx:295`, `paper-item-utils.tsx:691` |
| **P0** | **`__` 마커 내부의 `_`** | `__([^_]+)__` 는 `[^_]` 라 매칭 자체가 실패 → **4경로 전부 밑줄 소실**. 후처리는 `_{2,}`만 `--` 로 치환하고 홑 `_` 는 안 건드린다 | `text-utils.ts:507-510` `sanitizeExpressionForMarker` |
| **P0** | **`<u>` `<b>` `</u>` `</b>` 리터럴** | D/H 는 서식으로 소비(태그 소실), W/P 는 태그를 그대로 인쇄 | `parse-formatted-text.ts:22,47-52` / `format.ts:53-58` |
| **P0** | **`__…__` 가 개행을 걸치는 것** | D/H 는 `content.split("\n")` 후 **행마다** 매칭 → 행마다 홀수 `__` 만 남아 **리터럴 언더스코어로 인쇄** | `export-docx/.../passage.ts:57-71` · `export-hwpx/.../render/passage.ts:29-30` · `question.ts:536,560-595` — 그리고 이 결함을 KO 가 겪은 기록: `ko-paper-adapter.ts:260-267` 주석 + `balanceKoUnderlineMarkersPerLine` |
| **P0** | **`[대괄호]` 안에 `__밑줄__`·`(A)`·`_____`** | **시험지(P)에서만** 대괄호 전체가 한 토큰이라 내부 마커 전멸 | `paper-item-utils.tsx:691, 755-766` |
| **P0** | 밑줄 라벨과 표현 사이 **공백 0개 또는 2개 이상** (`__(A)expr__`) | D/H 는 `\s`(정확히 1) 요구 → 마커 분리 실패, `(A)expr` 통째 밑줄 | `parse-formatted-text.ts:79` / `format.ts:73` vs `paper-item-utils.tsx:722`(`\s*`) |
| **P0** | 빈칸을 `___`(3) 또는 `______`(6+) 로 표기 | 매칭은 되나 정본이 아니다. 요약문 계열은 `_{6,}`→`_____` 축약 로직에 걸리고, 폭 추정이 어긋난다 | `types.ts:27` · `summary-complete-mc.ts:218` |
| **P1** | **문단 첫머리에 `[…]`** — 특히 `[조건]`/`[요약문]`/`[보기]`/`[힌트]`/`[원문]`/`[주어진 문장]`/`[해석]`/`[앞글자]`/`[배열 단어]`/`[유형:`/`[빈칸 정답]`/`[주제문]`/`[주제 힌트]`/`[오류 문장]`/`[대상 단어]`/`[문맥]` | D/H 가 `\n\n` 블록 접두로 매칭해 **전용 섹션 박스**로 오조판. `[대상 단어]`·`[문맥]`·`[빈칸 정답]` 은 **학생지에서 통째 삭제**된다 | `parse-question-sections.ts:47-51, 55-101, 118-121` · `text-normalization.ts:3-8` (`ANSWER_METADATA_BLOCK_RE`/`INTERNAL_METADATA_BLOCK_RE` 가 블록을 drop) |
| **P1** | **문단 첫머리에 `(A) ` `(B) ` `(C) ` `(a) `**(SENTENCE_ORDER 아닌 유형에서) | D 가 그 블록을 `paragraphs`(단락 목록) 섹션으로 오인 | `parse-question-sections.ts:161-170` |
| **P1** | SENTENCE_ORDER 단락 **본문 안**에 `(A)`/`(B)`/`(C)`/`[A]`/`A.`/`A)` | 단락 경계 오탐. 강한 마커가 2개 미만이면 **맨몸 대문자 `A `/`B `/`C ` 조차** 마커로 잡힌다 | `question-body-layout.ts:237-238, 268-284` |
| **P1** | 발문(첫 단락)에 **원형숫자 또는 `__밑줄__`** 을 넣고 전체가 **35단어 초과** | `questionTextLooksEmbedded` 가 "지문 내장형"으로 오판 → **출처 지문 박스가 통째로 사라진다**(source-flow 유형) | `passage-policy.ts:81-82, 122-129, 159-163, 183-190` |
| **P1** | 한 블록 안에서 **2줄 이상이 `[…]`/`(A)`/`①`/`1.`/`- ` 로 시작** | `shouldKeepLineBreaks` 가 하드 개행을 보존 → 산문이 줄줄이 끊긴다(반대로 1줄만이면 전부 한 줄로 뭉개짐) | `text-normalization.ts:1-2, 49-61, 98-118` |
| **P1** | 해설·오답해설에 `__…__`, `_…_`, `(A)` | **웹 시험지 해설은 평문 렌더**(`exam-explanation-block.tsx:50-71`)인데 **D/H 해설은 포매터를 탄다**(`build-builder-document/answer.ts:102,144,207` · `render/answer.ts:126,153,221`) → 경로별로 다르게 보인다 |
| **P2** | `&` `<` `>` `"` `'` | HWPX 는 `escapeXml` 로 안전(`escape.ts:2-9`), DOCX 는 라이브러리가 처리, 웹은 React 가 처리. **깨지지는 않지만** `<u>`/`<b>` 조합만 조심 |
| **P2** | 탭 `\t` | `normalizeBaseText` 가 행 경계 탭만 정리(`text-normalization.ts:30-37`), 폭 계산은 공백과 동일 0.34 (`pagination-metrics.ts:80`) |
| **P2** | 제어문자 U+0000–08, 0B, 0C, 0E–1F, FFFE, FFFF | HWPX 에서 **무음 삭제** | `escape.ts:15-21` |

**중립(안전)으로 확인된 것**
- 곱슬따옴표 `“”‘’`, en/em dash `–—`, `…`(U+2026) — 어떤 포매터에도 토큰이 아니다. (단 `……` 2연속은 다중빈칸 구분자와 충돌 — §4-5)
- `*` `~` `` ` `` `#` `|` `>` — **md-qgen 파서 쪽 장식 흡수 대상**이지만(`decoration.ts:19,80-96`), **렌더·출력 4경로는 이들을 전혀 해석하지 않는다.** 즉 여기까지 살아 나오면 **리터럴로 인쇄된다**. → 00-contract §8 "장식 0" 규칙은 렌더 관점에서도 동일하게 필수다.
- `(K)`~`(Z)` 알파벳 괄호 — 포매터 클래스가 `[a-jA-J]` 라 무해. 단 `optionReferenceLabel` 은 A~Z 를 만든다(`option-display.ts:41-45`).

---

## §6 한 지문 복수 문항의 조판 (임무 질문 ④)

### 6-1 그룹 3종

| 그룹 종류 | `groupId` | 지문 박스 | 지시문 | 생성 지점 |
|---|---|---|---|---|
| **솔로(기본)** | `single:<localId>` | **문항마다 1개씩** (source-flow 유형) | 없음 | `paper-item-utils.tsx:324` |
| **지문별 재그룹**(수동 액션) | `passage:<passageId>` | **그룹 첫 문항만** (`seen` 가드) | 없음 | `use-paper-items.ts:75-113`, 호출 `:883-887` `regroupByPassage()` |
| **장문 세트**(`setId` 보유) | `set:<setId>` | 그룹 선두 1개 (병합 지문) | **`[n~m] 다음 글을 읽고, 물음에 답하시오.`** | `paper-item-utils.tsx:196-206` |

> ★ **우리 유닛(지문 1 × 유형 1 × 5~8문항)은 `setId` 가 없으므로 기본값이 "솔로"다** → 같은 지문이 **5~8번 반복 인쇄**된다. 교사가 `regroupByPassage()` 를 눌러야 1회로 합쳐진다. 이건 저작 규칙이 아니라 **운영 사실**이므로 납품 문서에 명시할 것.

### 6-2 세트 병합 지문의 재구성

```
buildQuestionSetMergedPassage(setRender)
  = reconstructPassageView(layout.fullPassage ?? canonicalPassage,
                           members.flatMap(m => m.spans)).text
```
`lib/question-sets/render.ts:12-24`

`reconstruct.ts:9-13` 이 **출력 형식 계약을 명문화**한다 — 이것이 본 문서 §3 의 상위 규범이다:
```
Blank:     _____ (BLANK)      matched by /_{3,}/g
Marker:    __(A) expr__       matched by /__([^_]+)__/g → /^\(([a-jA-J])\)\s*(.+)$/
Underline: __word__           matched by /__([^_]+)__/g
```

세트 멤버는 **baked 지문을 저장하지 않고 span anchor 만 저장**한다(`reconstruct.ts:4-7`) — 지문 유출 방지. 앵커 탐색 실패 시 `missing` 으로 DEGRADED (`:82-86`).

### 6-3 지문 흐름(embedded vs source) — 지문 박스가 그려지는지 결정

`passage-policy.ts:12-46` `QUESTION_PASSAGE_FLOW_RULES`:

| flow | 유형 | 조판 |
|---|---|---|
| **embedded**(지문이 questionText 안) | BLANK_INFERENCE, GRAMMAR_ERROR, GRAMMAR_CHOICE_COMBO, VOCAB_CHOICE, SENTENCE_ORDER, SENTENCE_INSERT, IMPLIED_MEANING, REFERENCE, IRRELEVANT, FILL_BLANK_KEY, GRAMMAR_CORRECTION, CONTEXT_MEANING, ANTONYM, CUSTOM(_LAYOUT) | 별도 지문 박스 **없음** — 문항 본문이 곧 지문 |
| **source**(별도 지문) | TOPIC, MAIN_IDEA, TOPIC_MAIN_IDEA, TITLE, CONTENT_MATCH, SUMMARY_COMPLETE_MC, CONDITIONAL_WRITING, SENTENCE_TRANSFORM, SUMMARY_COMPLETE, SUMMARY_WRITING, WORD_ORDER, TOPIC_SENTENCE_WRITING, SYNONYM | 지문 박스 렌더 |
| INLINE_SOURCE(그중 문항 **안**에 박스로) | 위 source 중 SYNONYM 포함 13종 | `passage-policy.ts:48-62`, 원자 배치 `question-body-layout.ts:48-60` |
| 기본 미동봉(정답 유출) | CONDITIONAL_WRITING, SENTENCE_TRANSFORM | `passage-policy.ts:176-181` `ANSWER_BEARING_SOURCE_SUBTYPES` |

### 6-4 페이지·단 분할

- 시험지 미리보기가 `paginateGroups` 로 페이지/단을 확정 → **HWPX 는 같은 함수를 서버에서 재실행**해 `columnBreak`/`pageBreak` 를 강제 (`export-hwpx/_lib/break-plan.ts:1-21, 464-528`).
- 분할 단위 키: `passage:<firstItemLocalId>` / `question:<localId>` (`:58-64`).
- 폭 모델은 **글리프 단위 근사**: 한중일 1.0 / `A-Z0-9` 0.62 / `a-z` 0.53 / 구두점·`_`·공백 0.34 / 그 외 0.72, 보정계수 `LINE_WIDTH_FUDGE = 1.05` (`pagination-metrics.ts:15, 68-86` · 동일 모델 복제 `export-hwpx/_lib/section-xml.ts:53-72`).
- 폭 계산은 **표시형으로 환산**한다: `__(a) word__` → `① word` (`pagination-metrics.ts:97-99`). 단 `_____` 는 그대로 5글자(=1.7 units)로 세면서 실제 출력은 15칸이라 **빈칸이 많으면 과소추정**된다. → **한 문단에 빈칸을 3개 이상 넣지 마라**(경험칙; 정량 임계값은 [미상]).
- 지문은 **통짜 단일 흐름**으로 접힌다: `normalizePassageText` 가 `\n{2,}` 블록을 **공백으로** 잇는다 (`text-normalization.ts:86-96`). → **P/D/H 에서 지문의 문단 구분은 소멸한다.** W(워크벤치)만 `whitespace-pre-wrap` 으로 개행을 보존한다(`primitives.tsx:207`).
- 정답표: 최장 정답 20자 초과면 5열 그리드 → 전체폭 목록으로 전환 (`answer-key-layout.ts:34`).

---

## §7 ★★ 40만 문항 저작 규칙 체크리스트 (핵심 산출물)

> **저작 에이전트는 이 절만 지키면 된다. 각 항목은 §1~§6 의 근거를 가진다.**
> 표기: **[FATAL]** = 출력 파손 · **[MAJOR]** = 오조판 · **[MINOR]** = 미관.

### A. 문자 금지 (전 필드 — 지문·발문·선지·해설·오답해설·모범답안·조건)

- [ ] **A1 [FATAL]** 언더스코어 `_` 는 **오직 빈칸 `_____`(정확히 5개)와 밑줄 마커 `__…__` 로만** 등장한다. 그 외 위치의 `_` 는 0개. → §5 P0 1·2행
- [ ] **A2 [FATAL]** `__…__` 내부에 `_` 없음. `sanitizeExpressionForMarker` 는 홑 `_` 를 못 지운다.
- [ ] **A3 [FATAL]** `<u>` `<b>` `</u>` `</b>` 문자열 0개.
- [ ] **A4 [FATAL]** `__…__` 는 **한 줄 안에서 열고 닫는다.** 개행을 걸치면 D/H 에서 리터럴 `__` 로 인쇄.
- [ ] **A5 [FATAL]** `[대괄호]` 안에 `__…__`·`_____`·`(A)` 를 넣지 않는다.
- [ ] **A6 [FATAL]** 밑줄 라벨 형상은 **`__(A) 표현__`** — 괄호 라벨 + **공백 정확히 1개** + 표현. `__(A)표현__`·`__(A)  표현__` 금지.
- [ ] **A7 [MINOR]** `……`(U+2026 2연속)는 다중빈칸 구분자 전용. 선지 값 텍스트에 넣지 않는다.
- [ ] **A8 [MINOR]** md 장식(`**` `*` `_` `~` `` ` `` `#` `>` `|`)은 **렌더 4경로가 전혀 해석하지 않는다** → 살아 나오면 그대로 인쇄. 00-contract §8 "장식 0" 을 렌더 관점에서도 재확인.

### B. 마커 형상

- [ ] **B1 [FATAL]** 빈칸은 `_____` (5개). `___`·`______` 금지.
- [ ] **B2 [FATAL]** SUMMARY_COMPLETE 계열 요약문에는 `_____` 를 쓰지 않는다 — **`(A)` 라벨만**. (게이트가 반려: `gate-summary-complete.ts:236`)
- [ ] **B3 [MAJOR]** SENTENCE_ORDER 단락 라벨은 **리터럴 `(A)`/`(B)`/`(C)`**. 단락 **본문**에 `(A)`~`(C)`, `[A]`, `A.`, `A)` 를 넣지 않는다.
- [ ] **B4 [MAJOR]** GRAMMAR_CHOICE_COMBO 네모는 `` `(A) [좌 / 우]` `` 평문. 좌/우 값 안에 `[` `]` `/` 금지(구분자 충돌).
- [ ] **B5 [MINOR]** 원형숫자는 `getCircledNumber` 산출값만 사용(`①`~`⑳`, `㉑`~`㉟`, `㊱`~`㊿`). 그 밖의 원형문자(예: `⓪`, `⑴`)는 어떤 포매터도 인식하지 않는다.
- [ ] **B6 [MINOR]** 레거시 `ⓐ`~`ⓔ`(U+24D0~)를 새로 만들지 마라 — W 의 `renderPassageFormatted` 와 D/H 의 라벨 분리 정규식이 이 범위를 빠뜨린다.

### C. 블록·줄 구조

- [ ] **C1 [MAJOR]** 문단 첫머리를 `[` 로 시작하지 않는다(§5 P1 목록의 15개 예약 라벨은 특히). 지문 안 인용 표기는 `(sic)` 처럼 소괄호로.
- [ ] **C2 [MAJOR]** 발문(첫 단락)에 원형숫자·`__밑줄__` 을 쓰지 않는다 — source-flow 유형에서 지문 박스가 사라진다.
- [ ] **C3 [MAJOR]** 지문 본문은 **개행 없는 단일 흐름**으로 저작한다. 문단 구분은 P/D/H 에서 어차피 소멸한다(`normalizePassageText`).
- [ ] **C4 [MINOR]** 조건 목록은 배열(`conditions: string[]`)로 준다. `[조건] a / b / c` 로 직렬화되며 D 는 이를 **한 항목**으로 취급한다(`parse-question-sections.ts:123-136`).

### D. 선지

- [ ] **D1 [FATAL]** **선지 배열 순서가 곧 학생 표면 번호(①②③④⑤)다.** 저장 라벨은 `CUSTOM`/`CUSTOM_LAYOUT` 을 제외하고 **무시된다**. 정답 라벨과 배열 인덱스를 반드시 정합시켜라.
- [ ] **D2 [MAJOR]** GRAMMAR_ERROR·IRRELEVANT·SENTENCE_INSERT·VOCAB_CHOICE 는 **선지 목록이 렌더되지 않는다.** 지문 마커 `①~⑤` 가 유일한 선택지 표면이다. 선지 텍스트에 정보를 담지 마라(오답해설은 렌더되므로 그쪽에 담을 것).
- [ ] **D3 [MAJOR]** 다중빈칸 조합 선지는 **전 선지가 동일한 값 개수**를 가져야 컬럼 헤더가 발동한다. 하나라도 단일 값이면 `multiBlankOptionMatrix` 가 `null` 을 반환해 **전 선지가 평문 목록으로 떨어진다**.
- [ ] **D4 [MINOR]** 선지 5개 + 최장 표시 텍스트 25자 미만이면 DOCX 가 **2열 표**로 조판한다(`render-options.ts:147`). 5개 선지 길이를 25자 근처에서 들쭉날쭉하게 만들지 마라(경계에서 조판이 튄다).
- [ ] **D5 [MINOR]** ANTONYM 선지 텍스트의 `(A) ` 접두는 표시 시점에 제거된다. 저장 형상은 그대로 두되, `(A)` 를 **의미 있는 정보로 쓰지 마라**.

### E. 해설·오답해설

- [ ] **E1 [MAJOR]** 해설/오답해설은 **평문**으로 쓴다. `__…__`/`_…_`/`(A)` 는 웹 시험지에서 리터럴, DOCX/HWPX 에서 서식으로 갈린다.
- [ ] **E2 [MINOR]** GRAMMAR_ERROR 해설 산문의 `(A)`~`(J)` 는 **전 경로에서 `①`~`⑩` 으로 자동 변환**된다(`circleGrammarLabelMentions` `option-display.ts:203-211`). 다른 유형은 변환되지 않는다 — 유형별로 라벨 표기를 다르게 쓰지 마라.
- [ ] **E3 [MINOR]** 오답해설 Record 의 키는 **평문 숫자**("2")로 남는다(배지 원 안에 넣기 때문). 키에 `②` 를 넣으면 동그라미-안-동그라미가 된다(`option-display.ts:213-218` 주석).
- [ ] **E4 [MINOR]** 정답 문자열이 **20자를 넘으면** 정답표가 5열 그리드에서 전체폭 목록으로 바뀐다(`answer-key-layout.ts:34`). 서술형 모범답안을 `correctAnswer` 에 통째로 넣지 마라.

### F. 유닛(5~8문항) 운영

- [ ] **F1** 우리 유닛은 `setId` 가 없으므로 시험지 기본값에서 **지문이 문항 수만큼 반복 인쇄**된다. 납품 시 "지문별 재그룹" 액션 사용을 안내하거나, 세트 등록 경로를 별도 설계할 것.
- [ ] **F2** 한 유닛 안에서 **embedded 유형과 source 유형을 섞으면** 조판이 갈라진다(embedded 는 지문 박스가 없고 본문이 곧 지문). §6-3 표로 사전 분류할 것.
- [ ] **F3** 빈칸을 한 문단에 다수 넣으면 페이지네이션이 높이를 과소추정한다(`_____`=5글자로 세고 15칸을 인쇄). 정량 임계값은 **[미상]** — 실측 필요.

### G. 저작 후 자동 검사(하네스에 넣을 정규식)

**검사는 반드시 이 순서로 한다** — 정본 빈칸 → 라벨 밑줄 → 일반 밑줄 순으로 유효 토큰을 도려내야 잔여 `_` 판정이 정확해진다.
아래 구현은 **20개 픽스처로 node 실행 검증했다**(오탐 0 / 미탐 0 — G-2 표).

```js
// qbank/harness/lint-render.mjs
const BLANK_OK       = /(?<!_)_{5}(?!_)/g;          // 정본 빈칸: 정확히 5개
const MARKER_LABELED = /__\([a-jA-J]\) [^_\n]+__/g; // __(A) expr__ (공백 1개)
const MARKER_PLAIN   = /__[^_\n]+__/g;              // __expr__

/** 렌더·출력 4경로 호환 린터. 반환 [] 이면 통과. */
export function lintForRender(text, opts = {}) {
  const issues = [];
  const push = (sev, code, msg) => issues.push({ sev, code, msg });
  const noBlank = text.replace(BLANK_OK, "␣"); // 정본 빈칸부터 치환(A2 오탐 차단)

  // ── FATAL ────────────────────────────────────────────────────────────
  if (/<\/?[ub]>/i.test(text))                    push("FATAL","A3","<u>/<b> 태그");
  if (/__[^_]*\n[^_]*__/.test(text))              push("FATAL","A4","개행을 걸친 밑줄 마커");
  if (/\[[^\]]*(?:__|_{3,}|\([a-jA-J]\))[^\]]*\]/.test(text))
                                                  push("FATAL","A5","대괄호 내부 마커");
  if (/__\([a-jA-J]\)(?![ ])/.test(text))         push("FATAL","A6","라벨 뒤 공백 0개");
  if (/__\([a-jA-J]\) {2,}/.test(text))           push("FATAL","A6","라벨 뒤 공백 2개 이상");
  if (/__[^_\n]*[^_\n\s][^_\n]*_[^_\n]*__|__[^_\n]*_[^_\n]*[^_\n\s][^_\n]*__/.test(noBlank))
                                                  push("FATAL","A2","밑줄 마커 내부 언더스코어");

  const stripped = noBlank.replace(MARKER_LABELED, " ").replace(MARKER_PLAIN, " ");
  if (/_/.test(stripped)) {
    const bad = stripped.match(/_+/g).join(" ");
    push("FATAL", /_{3,}/.test(stripped) ? "B1" : "A1",
         "잔여 언더스코어(" + bad + ") — 빈칸은 _____(5개), 밑줄은 __…__ 만 허용");
  }

  // ── MAJOR ────────────────────────────────────────────────────────────
  const RESERVED = /(^|\n)[ \t]*\[(조건|요약문|보기|힌트|원문|주어진\s*문장|해석|빈칸\s*해석|앞글자|배열\s*단어|빈칸\s*정답|주제문|주제\s*힌트|오류\s*문장|대상\s*단어|문맥|유형\s*:|given|summary|conditions?|hint|reference|original|word\s*order|blank\s*answers|target)/i;
  if (RESERVED.test(text))                        push("MAJOR","C1","예약 라벨로 시작하는 문단");
  if (!opts.sentenceOrderParagraph && /(^|\n)[ \t]*\([A-Ca-c]\)[ \t]/.test(text))
                                                  push("MAJOR","B3","문단 첫머리 (A)/(B)/(C)");
  if (opts.isOptionText) {                         // 다중빈칸 조합 선지 전용
    const seps = (text.match(/……/g) || []).length;
    if (seps > 2) push("MAJOR","A7","…… " + seps + "개 — 다중빈칸은 최대 3값(구분자 2개)");
    if (/……/.test(text) && !/^[^…]+(?: …… [^…]+){1,2}$/.test(text.trim()))
                  push("MAJOR","A7","구분자 형상이 ' …… '(공백1+……+공백1)가 아님");
  }
  return issues;
}
```

**G-2 검증 결과 — node 실행 실측 (20 픽스처)**

| 픽스처 | 기대 | 실측 |
|---|---|---|
| `The __(A) transforming__ economy grew, and __(B) rely__ on it.` | clean | clean |
| `It is _____ that matters most.` | clean | clean |
| `__(A) x y__ and _____ then __z__` | clean | clean |
| `Nothing special here at all.` | clean | clean |
| `snake_case is here` | A1 | A1:FATAL |
| `__(A) a_b c__` | A2 | A2,A1:FATAL |
| `<u>hi</u>` | A3 | A3:FATAL |
| `__foo⏎bar__` | A4 | A4,A1:FATAL |
| `[see __note__]` | A5 | A5:FATAL |
| `__(A)word__` / `__(A)  word__` | A6 | A6:FATAL |
| `It is ___ ok` / `It is ______ ok` | B1 | B1:FATAL |
| `[조건] do this` | C1 | C1:MAJOR |
| `(A) First para here` | B3 | B3:MAJOR (순서 예외 시 clean) |
| `heighten the risk …… prioritize speed` (선지) | clean | clean |
| `a …… b …… c` (선지) | clean | clean |
| `a …… b …… c …… d` (선지) | A7 | A7:MAJOR |
| `a……b` (선지) | A7 | A7:MAJOR |

> **호출 범위**: `passage*` / `direction` / `options[].text` / `explanation` / `wrongOptionExplanations[*]` / `modelAnswer` / `conditions[*]` / `keyPoints[*]` 전부.
> **옵션**: `sentenceOrderParagraph:true` — SENTENCE_ORDER 단락 필드(정상적으로 `(A) ` 로 시작). `isOptionText:true` — 선지 텍스트(다중빈칸 구분자 검사 활성).
> **주의 1**: `C1`(예약 라벨)은 `buildQuestionText` 가 직렬화 시점에 **스스로** 붙이는 라벨이다 → **저작 원문에만** 적용하라(직렬화 산출물에 걸면 전량 오탐).
> **주의 2**: A2/A4 는 A1 과 동반 발화한다(잔여 `_` 가 남으므로) — 코드 우선순위로 dedup 하라.

---

## §8 [미상] — 확인하지 못한 것

| # | 항목 | 왜 미상인가 |
|---|---|---|
| 1 | 기출 4,537 지문에 실제로 `_`·`<u>`·`(a)`·`……` 가 몇 건 있는가 | 지문 본문이 로컬 파일이 아니라 DB 에 있다. `qbank/out/**/_passage.json` 은 **감사 기록**(id/auditedAt/reconstructionKind/integrity)일 뿐 본문이 없음 — 실물 확인. **P0 사전 스캔 항목**으로 남긴다 |
| 2 | 빈칸 개수 대비 페이지네이션 과소추정의 정량 임계값 | 코드에 임계값이 없다(글리프 폭 근사만). 실측 필요 |
| 3 | `renderFormattedInline` 이 `subType == null` 로 불릴 때 KO 원형문자(`㉠`~`㉭`) 확장이 켜지는 경로가 영어 문항에 닿는지 | 주석은 "영어 지문 본문에는 ㉠ 이 등장하지 않아 무회귀"라 주장(`paper-item-utils.tsx:682-687`). 영어 지문에 `㉠` 이 없다는 전제는 검증 못 함 |
| 4 | 시험지 조건 목록(`[조건]`)이 빌더 경로(`build-builder-document`)에서 D 와 동일하게 1항목으로 접히는지 | `parse-question-sections.ts:123-136` 은 레거시 `build-question.ts` 경로. 빌더 경로 별도 확인 안 함 |
| 5 | `CUSTOM`/`CUSTOM_LAYOUT` 의 마커 스킴 전체 | 본 프로젝트 26유형에 포함되지 않아 조사 생략 |
| 6 | 학생 응시 화면(`exam-taking-client.tsx`)의 마커 결손(원형숫자·`(A)` 미처리)이 실제 서비스 결함인지 | 본 임무 3경로 밖 |

---

## §9 부록 — 인용 색인 (핵심 파일 20)

| 파일 | 역할 |
|---|---|
| `src/components/workbench/question-renderer-primitives.tsx` | W 포매터 5종 + `OptionList` |
| `src/components/workbench/question-type-renderers.tsx` | W 유형별 렌더러 26종 |
| `src/components/exams/paper-builder/option-display.ts` | **4경로 공용 표시 계약** (라벨 축·마커 변환·다중빈칸) |
| `src/components/exams/paper-builder/paper-item-utils.tsx` | P 포매터 `renderFormattedInline` + 그룹 조립 |
| `src/components/exams/paper-builder/text-normalization.ts` | `questionText`/`passage` 정규화(문단 접힘·메타 블록 삭제) |
| `src/components/exams/paper-builder/passage-policy.ts` | embedded/source 흐름 규칙 |
| `src/components/exams/paper-builder/question-body-layout.ts` | stem/body 분리, SENTENCE_ORDER 세그먼트 |
| `src/components/exams/paper-builder/pagination-metrics.ts` | 글리프 폭 모델·높이 추정 |
| `src/components/exams/paper-builder/explanation-content.ts` | 해설 행 구성(4경로 공용) |
| `src/components/exams/paper-builder/answer-key-layout.ts` | 정답표(= PDF 는 미리보기 인쇄임을 명시) |
| `src/components/exams/paper-builder/marker-render-scheme.ts` | 수능 표준 마커 스킴 테이블(문서화·부분 집행) |
| `src/components/exams/multi-blank-option-grid.tsx` | 다중빈칸 컬럼 그리드(W·P 공용) |
| `src/app/api/exams/[examId]/export-docx/_lib/parse-formatted-text.ts` | **D 포매터** |
| `src/app/api/exams/[examId]/export-docx/_lib/parse-question-sections.ts` | `[…]` 섹션 라벨 매핑 |
| `src/app/api/exams/[examId]/export-docx/_lib/render-options.ts` | D 선지 조판(2열 표 분기·다중빈칸 표) |
| `src/app/api/exams/[examId]/export-hwpx/_lib/format.ts` | **H 포매터** (D 와 정규식 동일) |
| `src/app/api/exams/[examId]/export-hwpx/_lib/escape.ts` | XML escape·제어문자 삭제 |
| `src/app/api/exams/[examId]/export-hwpx/_lib/break-plan.ts` | 미리보기 분할을 한컴에 강제 |
| `src/lib/question-sets/reconstruct.ts` | **출력 형식 계약 명문**(Blank/Marker/Underline) |
| `src/lib/question-postprocess/types.ts` | `BLANK="_____"`, `getCircledNumber`, PASSTHROUGH 목록 |
