# 요약문 영작 (SUMMARY_WRITING)

> 분류 **서술형(영작 계열 · 선지 없음)** · 지문변형 **없음(PASSTHROUGH — `question-postprocess/types.ts:79`)** · 정답 머리표 **`정답(A):` 계열(빈칸별)** · 최소 지문 길이 **코드 제약 0** — `isEligible`(`lane-summary-writing.ts:100-112`)은 `summaryWritingBlankCount` 만 보고, 게이트 어디에도 지문 길이 하한이 없다.
>
> ⚠ **이 유형에는 `정답:`(선지 원문자) 줄도 `오답:` 절도 없다.** 26유형 일괄 템플릿에 `정답: ①` 을 박으면 이 유형은 전량 죽는다.
> 정답의 진실원은 **빈칸별 `정답(A):` 줄**이고, 꼬리는 `채점기준:` + `해설:` 이다(`prompts-summary-writing.ts:5-6`).
> ⚠ **`모범답안:` `미끼:` `연결틀:` 세 줄은 받지 않는다.** 셋 다 기계가 결정형으로 파생한다(`prompts-summary-writing.ts:9-22`).
>
> 전 유형 공통 계약은 [`../recon/00-contract.md`](../recon/00-contract.md), 품질 규범은 [`../quality-constitution.md`](../quality-constitution.md).
> 이 문서의 모든 주장은 코드 직독 + `qbank/work/_probe-SUMMARY_WRITING.ts` tsx 실행 검증을 거쳤다(6문항 유닛 · blocking 0 · qualityBlocking 0 · 64/64 통과).

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

**"글을 요약한 문장을 고르는 것"이 아니라 "글을 요약한 문장의 판단이 걸린 어구를 직접 영어로 써 내는 것"이 과제다.**

학생이 하는 일은 셋이 직렬로 붙어 있다.

1. **글 전체를 한 문장으로 압축**한다 — 한 단락·한 사례만 요약하면 빈칸을 못 채운다(`prompts-summary-writing.ts:331`).
2. 그 압축문에서 **비어 있는 자리가 논지의 어느 축인지** 판정한다(원인인가 귀결인가, 조건인가 결과인가).
3. 그 축을 **영어 다단어 어구로 조립**한다. 선지가 없으므로 소거법이 통하지 않는다.

### 다른 유형과 무엇이 다른가

| 유형 | 학생 산출물 | SUMMARY_WRITING 과의 차이 |
|---|---|---|
| `SUMMARY_COMPLETE_MC` / `SUMMARY_COMPLETE` | 요약문 빈칸 **선택**(5지) | 여기는 **쓴다.** 오답 5개 설계라는 승부처가 통째로 사라지고, 그 자리를 **미끼 칩 설계 + 표적 어구 설계**가 대신한다 |
| `TOPIC_SENTENCE_WRITING`(cloze) | 주제문 빈칸 영작 | 표적이 **주제 한 줄**이다. 주제문은 판단만 남기고, 요약문은 **흐름(원인→귀결)을 압축**한다. 그래서 이 유형은 근거가 두 문장 이상에 걸치는 설계가 기본이다(`prompts-summary-writing.ts:71`) |
| `CONDITIONAL_WRITING` / `SENTENCE_TRANSFORM` | 문장 전체 영작·변형 | 저 둘은 채점이 `FREE_WRITING`(항상 사람) — `answer-spec.ts:250, 271-273`. 여기는 **자동채점이 실제로 돈다**(EXACT/LEMMA) |
| `WORD_ORDER` | 지문에 실재하는 문장의 어순 배열 | WORD_ORDER 의 표적은 지문 문장이다. 여기 표적은 **지문 어디에도 없는 압축 명제**다 — 그래서 「지문 축자 복사」가 반려 사유다(`gate-summary-writing.ts:418-434`) |

### 지문을 한 글자도 건드리지 않는다 — 그 자리를 무엇이 대신하는가

인라인 마커 4종(`[[A:…]]` `[[1]]` `[[1:문장]]` `[[them]]`)을 **하나도 쓰지 않는다.**
파서 산출 타입 `MdSummaryWritingQuestion`(`parser-summary-writing.ts:45-60`)에 지문 필드가 없고
후처리도 PASSTHROUGH 다(`question-postprocess/types.ts:79`). 즉 **「지문 재구성 대조」 게이트가 아예 없다.**
그 대신 이 유형만의 대조 축이 넷이다(`parser-summary-writing.ts:25-27`).

1. **정답 ↔ 지문 축자 대조** — 정답이 지문 문장의 통째 복사이면 영작이 베껴쓰기로 전락(`gate-…:418-434`)
2. **정답 ↔ 요약문 누수 대조** — 정답의 연속 2토큰이 학생에게 보이는 요약문에 이미 있으면 무효(`gate-…:405-416`)
3. **정답 ↔ 보기 칩 조립 가능성** — 칩만으로 정답을 만들 수 없으면 채점 불능(`gate-…:251-267`)
4. **설정 ↔ 산출 정합** — 발문이 [보기]/[해석]을 말하는데 그 상자가 비면 학생이 존재하지 않는 상자를 찾는다(`gate-…:436-447`)

**어댑터가 100% 완제품을 낸다**(`adapter-summary-writing.ts:4-13`). 후처리가 만들어 주는 필드는 **하나도 없다.**
게이트가 못 잡으면 그대로 학생 화면이다.

---

## 2. 마크다운 골격

### 2-0. 줄 순서와 빈 줄은 **계약이다** (먼저 읽어라)

`정답(A):` `동치(A):` `핵심어(A):` 는 라벨 뒤에 라틴 문자가 오므로 머리표 가드
`HEAD_CONTENT_GUARD`(`parser-summary-writing.ts:130`)를 통과하지 못한다 → **섹션 정지 키워드가 아니다.**
목록 모드 블록(`보기:` `채점기준:`)의 유일한 종결자는 **빈 줄**이다(`parser-summary-writing.ts:306-310`).

- ✅ `보기:` 줄과 `정답(A):` 그룹 사이에 **빈 줄 1개 필수** — 없으면 정답·동치·핵심어 줄이 통째로 칩이 된다(프로브 S1 실측: 칩 9→15, 반려 2건).
- ✅ 채점기준 항목 **사이에는 빈 줄 금지** — 넣으면 그 아래 항목이 **조용히 사라진다**(프로브 S2 실측: criteria 2→1, 게이트 클린).
- ✅ `채점기준:` 앞 빈 줄은 있어도 없어도 된다(`채점기준` 은 정지 키워드 — 프로브 S3).

### 2-1. 복붙 골격 A — 표준형(보기 O · 해석 O · keyword 채점) · 빈칸 1개

```md
요약문: <(A) 를 정확히 1회 포함하는 영어 한 문장. 라벨만 두고 정답 어구·밑줄(____)은 절대 넣지 마라. 라벨 제외 6단어 이상>
해석: <한국어 한 문장 — 글 전체 의미. 정답 구간을 1:1 직역하지 마라>
보기: <칩1 / 칩2 / 칩3 / 칩4 / 칩5 / 칩6 / 칩7>

정답(A): <이 빈칸에 들어갈 영어 어구 — 2단어 이상. 요약문에 대입하면 문장이 완성된다>
동치(A): <그 빈칸에 그대로 들어가는 완전한 대체 어구 하나. 여럿이면 이 줄을 여러 번. 없으면 이 줄 생략>
핵심어(A): <", " 로 이은 핵심 단어 — 한 단어씩, 정답 어구에 등장하는 형태 그대로>

채점기준:
- <채점 축: 한국어 한 줄>
- <채점 축: 한국어 한 줄>
해설: <한국어 딱 2문장. 합니다체>
```

> `채점기준:` 은 `scoringGranularity=rubric` 일 때만 **필수**다(`lane-summary-writing.ts:84`). keyword/exact 에서 써도
> 반려되지 않고 `structuredData.scoringCriteria` 로 저장된다 — 강사면 참고용으로 쓰는 편이 낫다.

### 2-2. 복붙 골격 B — KILLER 기본형(해석 없음 · 루브릭 채점 · 목표 단어수 비노출)

```md
요약문: <(A) 를 정확히 1회 포함하는 영어 한 문장 — 지문 표면 위 한 층의 상위 명제>
보기: <칩1 / 칩2 / 칩3 / 칩4 / 칩5 / 칩6 / 칩7>

정답(A): <2단어 이상 영어 어구>
동치(A): <구문을 바꾼 완전한 대체 어구>

채점기준:
- <채점 축: 한국어 한 줄>
- <채점 축: 한국어 한 줄>
해설: <한국어 딱 2문장>
```

> KILLER 프리셋은 `glossEnabled:false` 다(`question-type-generation-settings/summary-writing.ts:117-137`).
> **`해석:` 줄을 쓰면 반려가 아니라 절삭된다**(`gate-summary-writing.ts:82-85` — corrections 기록). 처음부터 쓰지 마라.
> `핵심어(X):` 는 rubric/exact 에서 자동채점이 읽지 않는다(`lane-…:87`, `grade.ts:52`) — 확신 없으면 생략이 옳다.

### 2-3. 복붙 골격 C — 보기 상자 없음 · 빈칸 2~3개

```md
요약문: <(A) 와 (B) 를 각 정확히 1회, 그 순서대로 포함하는 영어 한 문장>

정답(A): <2단어 이상 영어 어구>
동치(A): <대체 어구>
정답(B): <2단어 이상 영어 어구 — (A) 와 같은 어구면 반려>

채점기준:
- <채점 축: 한국어 한 줄>
- <채점 축: 한국어 한 줄>
해설: <한국어 딱 2문장>
```

> `wordBankEnabled:false` 이면 `보기:` 줄을 쓰지 마라 — 쓰면 절삭된다(`gate-…:86-89`).
> 빈칸 3개까지 실측 통과 확인(프로브 T1). 라벨은 **`(A)(B)(C)` 연속 고정**이며, `(B)` 만 쓰거나 `(A)(C)` 는 반려다.

### 2-4. 검증된 정상 픽스처 전문 — `scripts/_test-md-summary-writing.ts` verbatim

대응 지문은 `scripts/_test-md-summary-writing.ts:54-59`.

**`GOOD`(`:115-126`) — INTERMEDIATE · 빈칸 1 · 보기 O(usePartial, 미끼 2) · 해석 O · keyword 채점**

```md
요약문: (A), which can lead to greater bias in the result.
해석: 표본의 틀을 넓히지 않은 채 기록만 늘리면 결과의 편향이 오히려 커질 수 있다는 뜻입니다.
보기: without / sample / expanding / collecting / size / the / reducing / increasing / data

정답(A): Collecting data without increasing the sample size
동치(A): Gathering data without increasing the sample size
핵심어(A): collecting, data, sample, size

채점기준:
- 자료 수집과 표본이 함께 드러나면 1점입니다.
- 표본을 늘리지 않았다는 대조가 드러나면 1점입니다.
해설: 이 글은 관측치를 아무리 늘려도 표본의 틀이 고정되어 있으면 편향이 그대로 남는다고 말합니다. 따라서 빈칸에는 표본을 넓히지 않은 채 자료만 모으는 행위가 들어가야 합니다.
```

파생 결과(테스트 단언, `:183-195`): 모범답안 = `Collecting data without increasing the sample size, which can lead to greater bias in the result.` ·
미끼 = 조립 잔여 칩 `expanding`·`reducing` 2개.

**`GOOD_KILLER`(`:128-137`) — KILLER · 빈칸 2 · 보기 X · 해석 X · rubric 채점**

```md
요약문: (A) can make a study look more confident without narrowing (B).
정답(A): Adding records to a sampling frame that never widens
핵심어(A): adding, records, sampling, frame
정답(B): its distance from the population it claims to describe
핵심어(B): distance, population, describe

채점기준:
- 표본 틀이 넓어지지 않는다는 조건이 드러나면 2점입니다.
- 모집단과의 간극이 그대로라는 귀결이 드러나면 2점입니다.
해설: 이 글은 표본 틀을 넓히지 않은 채 기록만 늘리면 정밀도만 올라간다고 말합니다. 그래서 겉보기 확신과 실제 대표성 사이의 간극이 그대로 남는다는 점이 요약의 핵심입니다.
```

> ⚠ 이 픽스처는 `요약문:` 바로 다음 줄에 `정답(A):` 가 온다(빈 줄 없음). **보기 상자가 없을 때만 안전하다** —
> `요약문:` 은 산문 모드라 문장 종결(`SENTENCE_END_RE` — `parser-…:246`)과 라벨성 줄 가드(`:245, 311`)가 이중으로 끊어 준다.
> **`보기:` 가 있는 골격에서는 반드시 빈 줄을 넣어라**(§2-0).

### 2-5. qbank 컨테이너 안에서의 실물 (하네스 입력 형태)

```md
<!-- ITEM 3
difficulty: INTERMEDIATE
point: P3 인과 추적 — 검증 불가능성이 왜 개방이라는 처방으로 이어지는가
craft: usePartial. closing·visitors 두 칩은 어느 정답에도 소비되지 않는 역방향·의미장 미끼다
-->
요약문: Because unseen holdings cannot be challenged, (A) turns a museum's reserve into a genuinely public trust.
해석: 보이지 않는 소장품은 검증될 수 없으므로, 수장고를 진짜 공공의 자산으로 바꾸려면 외부의 시선이 닿는 절차가 필요하다는 뜻입니다.
보기: eyes / closing / record / to / opening / outside / every / visitors / shelf

정답(A): opening every shelf record to outside eyes
동치(A): letting outside eyes read every shelf record
핵심어(A): opening, shelf, record, outside

채점기준:
- 의미: 외부 검증에 개방한다는 축이 드러나면 2점입니다.
- 범위: 일부가 아니라 전체 목록임이 드러나면 1점입니다.
해설: 이 글은 아무도 보지 못하는 소장품은 질문의 대상이 될 수 없다는 점에서 개방의 필요를 끌어냅니다. 따라서 빈칸에는 모든 선반의 기록을 외부의 시선에 여는 행위가 들어가야 합니다.
```

`<!-- ITEM n -->` 는 **qbank 규약이지 md-qgen 규약이 아니다**(`qbank/harness/qgen-core.ts:29-42, 57`).
주석 아래 본문만이 md-qgen 계약 대상이다. `settings` JSON 은 `{ SUMMARY_WRITING: {...} }` 로 병합되어
(`qgen-core.ts:379-387`) `resolveSummaryWritingSettings` 의 nested 경로로 읽힌다
(`question-type-generation-settings/summary-writing.ts:62-68, 84-87, 99-101`).

---

## 3. 파서 계약 (★ 가장 중요)

> 전제: `prompts-summary-writing.ts` 의 지침 문구보다 **아래 파싱 규칙이 우선한다.**
> 문서 하나 = 문항 하나. 정답 값은 각 라벨의 **첫 매치만** 취한다(`parser-summary-writing.ts:400` — `if (!entry.answer)`).

### 3-1. 라벨 줄 매처 `LABELED_LINE_RE` — `parser-summary-writing.ts:143-162`

```ts
const GAP         = String.raw`[ \t*_~\x60]*`;
const LABEL_PART  = String.raw`${GAP}[（([]?${GAP}([A-Za-z])${GAP}[)）\]]?`;
const COLON_AHEAD = String.raw`(?=[ \t*_~\x60"'”’]*[:：])`;
const LABELED_LINE_RE = keywordLineRe(
  String.raw`(정답|동치|핵심어)${LABEL_PART}${COLON_AHEAD}`,
);
```

`keywordLineRe`(`decoration.ts:98-100`)가 감싸는 실제 정규식:

```ts
const HEAD_LEAD = String.raw`^[\s>|]*(?:#{1,6}\s*)?(?:[-*•]\s+)?[\s*_~\x60"'“‘]*`;   // decoration.ts:81
const HEAD_TAIL = String.raw`[\s*_~\x60"'”’]*\s*[:：]?[\s*_~\x60]*[ \t]*`;            // decoration.ts:83
// 최종: ^HEAD_LEAD (정답|동치|핵심어) LABEL_PART COLON_AHEAD HEAD_TAIL (.*)$   … 플래그 "m"
```

- **m[1]=키워드 · m[2]=라벨 문자 · m[3]=값.** 값은 줄 끝까지.
- **반드시 한 줄씩** 물린다(`parser-…:392` — `text.split(/\r?\n/)` 루프). 여러 줄에 통째로 물리면 값이 빈 줄이 다음 줄을 훔친다(`:155-159`).
- 라벨 뒤 **콜론은 필수**(`COLON_AHEAD`). `정답 A 부터 보자` 같은 산문은 빈칸이 되지 않는다(`:148-151`).
- 흡수되는 드리프트(전부 실측 통과 — `scripts/_test-md-summary-writing.ts:1378-1404`):
  `정답 A:` · `정답(a):` · `정답[A]:` · `정답（A）:` · `정답 (A) :` · `**정답(A):**` · `**정답**(A):` ·
  `정답(**A**):` · `정답(__A__):` · `### 정답(A):` · `> - 정답(A):` · `정답(A)：`
- ⚠ **어기면 사라지는 것**: 이 정규식에 안 걸리는 줄은 **그 라벨 자체가 존재하지 않게 된다** →
  게이트 #1 이 「빈칸 정답 0개 (1개 필요)」로 전량 반려한다.

### 3-2. 라벨 정규화 `summaryWritingLabel` — `parser-…:62-71`

```ts
const LABEL_KEYS = "ABC";
key = raw.trim().replace(/[()[\]（）［］.:：]/g, "").toUpperCase();
return key.length === 1 && LABEL_KEYS.includes(key) ? `(${key})` : "";
```

- 라벨 축은 **A·B·C 셋뿐**이다. `(D)` 이상 / 두 글자 / 숫자는 빈 문자열이 되고 **그 줄은 `continue` 로 버려진다**(`:396-397`).
- ⚠ **어기면 사라지는 것**: `정답(D): …` 은 **아무 신호 없이 소멸**한다. 요약문에 `(D)` 가 남아 있으면 게이트 #2 가
  「설정 범위 밖 라벨」로 잡지만(`gate-…:366-373`), 요약문에도 없으면 **완전 무흔적**이다.

### 3-3. 라벨별 값 누적 — `parser-…:392-406`

| 키워드 | 동작 | 근거 |
|---|---|---|
| `정답` | **첫 줄만** 채택(`if (!entry.answer)`) — 같은 라벨을 두 번 쓰면 두 번째는 버려진다 | `:400` |
| `동치` | `splitVariantList` 결과를 **누적 push** — 줄을 여러 번 써도 된다 | `:402` |
| `핵심어` | `splitLemmaList` 결과를 **누적 push** | `:404` |

빈칸 배열은 마지막에 **라벨 사전순 정렬**된다(`:438` — `blanks.sort((a,b)=>a.label.localeCompare(b.label))`).
→ `정답(C):` 를 먼저 써도 결과는 `(A)(B)(C)` 다(프로브 T2 실측).

### 3-4. 값 구분자 리터럴 (고정)

| 필드 | 구분자 | 폴백 | 근거 |
|---|---|---|---|
| `보기:` 칩 | ` / ` (정규식 `\s*[/｜\|]\s*`) | 슬래시로 2개 미만이면 **쉼표**로 재분할 | `parser-…:230-238` |
| `동치(X):` | ` / ` 또는 `;` (`\s+\/\s+\|\s*;\s*`) | **없음 — 쉼표로 절대 쪼개지 않는다** | `parser-…:215-222` |
| `핵심어(X):` | `,` (쉼표가 있으면 우선), 없으면 ` / ` | | `parser-…:202-207` |

- ⚠ **동치를 쉼표로 이어 쓰면 한 덩어리로 굳는다**(설계 의도 — `:209-214`). `"Not only A, but also B"` 처럼
  영어 어구 안에 쉼표가 실재하기 때문이다. 동치가 여럿이면 **`동치(X):` 줄을 여러 번 쓰는 것이 계약**이다.
- ⚠ **칩 안에 `/` `|` 를 넣지 마라** — `and/or`, `24/7` 은 두 칩으로 쪼개진다.
- ⚠ **어기면 사라지는 것**: 쉼표로 이은 동치는 반쪽이 아니라 통짜가 되어 **만점 정답 집합에 쓰레기가 실린다**(게이트 무발화 — 프로브 E9).

### 3-5. 값 세정 `cleanValue` / `cleanSummaryValue` — `parser-…:167-199`

```ts
const TABLE_PIPE_TAIL_RE = /\s*\|+\s*$/;                    // :167
cleanValue(raw) = cleanMdValue(raw 에서 표 파이프 꼬리 제거)
                    .replace(TABLE_PIPE_TAIL_RE, "")
                    .replace(/[,;]+$/, "")                   // 꼬리 쉼표·세미콜론 제거
                    .trim();                                 // :173-176
```

`cleanMdValue`(`decoration.ts:75-78`) = `unwrapQuotes(stripEmphasis(text)).replace(/\s+/g," ").trim()`
- `stripEmphasis`(`decoration.ts:19, 30-48`): `*{1,3}` `_{1,3}` `~{1,2}` 백틱`{1,3}` 제거. **언더스코어는 양옆이 모두 낱말 문자면 보존**(snake_case 방어).
- `unwrapQuotes`(`decoration.ts:52-69`): 값 **전체를 감싼** 따옴표 한 겹만 제거. 안쪽에 같은 따옴표가 또 있으면 손대지 않는다.

**요약문만 예외** — `cleanSummaryValue`(`:190-199`)가 `_{4,}` 빈칸선을 제어문자로 마스킹해 보존한 뒤 되돌린다(`:185-187`).
`____`(4개 이상)는 **게이트가 지목해야 할 결함**이고, `__값__`(3개 이하)은 마크다운 강조라 벗긴다(`:178-184`).

- ⚠ **어기면 사라지는 것**: 값 끝에 쉼표를 남기면 조용히 잘린다. `요약문: … bias,` → `… bias`.

### 3-6. 섹션 키워드 전수 — `parser-…:105-117`

```ts
export const SUMMARY_WRITING_SECTION_KEYWORDS = [
  "요약문","해석","보기","미끼","정답","동치","핵심어","모범답안","채점기준","해설","오답",
] as const;
```

블록 절단은 `sliceKeywordSection`(`decoration.ts:141-158`)이 **자기 키워드를 뺀 나머지 전량**을 정지 키워드로 받아 처리한다(`parser-…:134-136`).

**머리표 가드** `HEAD_CONTENT_GUARD`(`parser-…:130-131`):

```ts
const HEAD_CONTENT_GUARD = "(?=[^0-9A-Za-z가-힣ㄱ-ㆎ]*(?:[:：]|$))";
const headKw = (k) => `${k}${HEAD_CONTENT_GUARD}`;
```

→ 키워드 뒤에 (장식·공백을 제외하고) **콜론이나 줄끝만** 와야 머리표로 본다.
→ **`정답(A):` 은 `(A)` 의 `A` 때문에 가드를 통과하지 못한다 = 정지 키워드가 아니다.** (§2-0 빈 줄 계약의 근거)
→ 반면 `- 정답 표현이 드러나면 2점` 같은 **루브릭 항목은 머리표로 오인되지 않는다**(`:119-128`, 계약 개정 26-07-27).

### 3-7. 블록 판독 3모드 `readBlockLines` — `parser-…:291-316`

| 모드 | 대상 | 종료 조건 |
|---|---|---|
| `prose` | `요약문:` `해석:` | 빈 줄 · 정지 키워드 · **라벨성 줄**(`/^\S+[ \t]*[:：]/` — `:245`) · **문장 종결**(`/[.!?…]["'”’)\]]?$/` — `:246`) |
| `fold` | `해설:` | 빈 줄 · 정지 키워드 · 라벨성 줄 (여러 줄을 공백으로 이어 붙임) |
| `list` | `보기:` `채점기준:` | 빈 줄 · 정지 키워드 **뿐** — 라벨성 가드를 걸지 않는다(`:285-289`) |

공통 전처리 `stripListLead`(`:254-263`)가 구조 줄머리만 최대 4회 벗긴다:

```ts
const LIST_LEAD_RE = /^[ \t]*(?:>[ \t]*|#{1,6}[ \t]+|\|[ \t]*|(?:[-*•]|\d+[.)])[ \t]+)/;
```

- 선두 빈 줄은 건너뛰고, **값이 하나라도 모인 뒤의 빈 줄은 블록의 끝**이다(`:306-310`).
- ⚠ **어기면 사라지는 것**:
  · `보기:` 뒤 빈 줄 누락 → 정답·동치·핵심어 줄이 **칩으로 편입**(프로브 S1: 칩 9→15, 반려 2건).
  · 채점기준 항목 사이 빈 줄 → 그 아래 항목이 **게이트 클린인 채로 소실**(프로브 S2).
  · `해설:` 뒤에 사족 한 줄 → 그 줄이 해설에 **흡수**(프로브 E28, 무발화).

### 3-8. 라벨 없는 단일형 흡수 — `parser-…:408-427`

`byLabel.size === 0` 또는 **인식된 라벨이 정확히 1개**일 때만, 맨몸 `정답:` / `동치:` / `핵심어:` 를 읽어 채운다
(`bareKeywordValue` — `:366-370`, 키워드 **바로 뒤가 콜론**인 줄만 본다).
빈칸이 2개 이상이면 이 경로는 돌지 않는다.

- 값이 다음 줄에 있어도 흡수한다(`readKeywordValue` — `decoration.ts:113-134`).
- ⚠ **저작 규칙: 언제나 `정답(A):` 를 써라.** 맨몸 `정답:` 은 드리프트 흡수 경로이지 계약이 아니다.

### 3-9. 요약문 라벨 축 — 세 개의 서로 다른 스캐너

| 함수 | 정규식 | 용도 |
|---|---|---|
| `summaryWritingLabelSequence` | `/[(（]\s*([A-Ca-c])\s*[)）]/g` | 등장 **순서** 판정(전각·소문자 허용) — `:74-78` |
| `summaryWritingRenderedLabels` | `/\(([A-Z])\)/g` | **학생 렌더가 마스킹하는 축**(반각+대문자 전체) — `:87-89` |
| `stripSummaryWritingLabels` | `/[(（]\s*[A-Ca-c]\s*[)）]/g` → 공백 | 영어 판정·단어수 계산용 — `:92-97` |

게이트는 **`countLiteral(summary, "(A)")`**(순수 문자열 카운트 — `question-quality/core.ts:286-289`)로 개수를 센다.
→ **요약문 안 라벨은 정확히 `(A)` 리터럴이어야 한다.** `( A )`·`（A）`·`(a)` 는 스냅 S1(`snap-…:115-121`)이
`(A)` 로 정규화해 주지만, **정규화는 관용이지 계약이 아니다** — 저작은 `(A)` 로 쓴다.

### 3-10. 결정형 파생(받지 않는 필드) — `parser-…:458-469`, `snap-…:248-270`

```ts
// 모범답안 = 요약문의 라벨을 정답으로 치환 → 공백 정돈 → 구두점 앞 공백 제거
summaryWritingMdModelAnswer(q)                  // parser-…:458-469
// 미끼 = 어느 정답에도 소비되지 않는 칩(정본 조립 알고리즘의 잔여)
deriveSummaryWritingDistractors(chips, blanks)  // snap-…:248-270
```

- ⚠ **`모범답안:` `미끼:` `연결틀:` 줄을 쓰지 마라.** 파서가 읽지 않으므로 무시되지만,
  `모범답안:` 은 **섹션 키워드**라 블록 경계로 작동해 앞 섹션을 끊는다(`:105-117`).
  프로브 E1 실측: `정답(A):` 를 `모범답안:` 으로 바꾸면 「정답(A) 줄을 인식할 수 없음」 반려.

### 3-11. 토큰화 규칙 (게이트·채점이 쓰는 네 종류)

| 함수 | 정의 | 쓰이는 곳 |
|---|---|---|
| `summaryWritingAnswerTokens` | `.toLowerCase().split(/[^a-z0-9']+/)` — 아포스트로피 보존 | 핵심어 ↔ 정답 표면형 대조(`parser-…:472-477`), `grade.ts:58` 과 동일 |
| `summaryWritingWordTokens` | `/[A-Za-z]+(?:[-'][A-Za-z]+)*/g` → 소문자 | 칩 조립 판정(`validators/summary/writing.ts:6-10`) |
| `summaryWritingComparableTokens` | 정규화 후 `[a-z]+…` 중 **4글자 이상만** | 누수·축자복사 판정(`question-quality/core.ts:276-282`) |
| `wordCount`(게이트 전용) | `/[A-Za-z]+(?:[-'][A-Za-z]+)*/g` 개수 | 정답 단어수·요약문 단어수(`gate-…:95-97`) |

---

## 4. 게이트 체크리스트

> 판정의 진실원은 `parsed.gateIssues` 하나다(`00-contract.md §2`). 아래가 **전수**다(`gate-summary-writing.ts`).
> `#1` 두 항목은 **즉시 return** 이라 다른 사유가 함께 나오지 않는다.

### 4-1. 반려 사유 문자열 전수

| 사유 문자열(요지) | 조건 | file:line |
|---|---|---|
| `빈칸 정답 N개 (M개 필요) — 인식된 라벨: … / 필요: …` | 인식 라벨 수 ≠ `blankCount` (**즉시 return**) | `gate-…:337-343` |
| `정답 라벨이 (A)(B) 이 아님 — 실제 …` | 라벨 집합이 `(A)…` 연속이 아님 (**즉시 return**) | `gate-…:344-348` |
| `` `요약문:` 줄은 있으나 값을 읽지 못함 — … `` | `summary` 빈 값 + `headsSeen` 에 요약문 있음 | `gate-…:352-356` |
| `요약문 누락` | `summary` 빈 값 + 줄 자체 없음 | `gate-…:352-356` |
| `요약문에 (A) 가 N회 — 정확히 1회여야 함` | `countLiteral(summary,label) !== 1` | `gate-…:358-360` |
| `요약문에 설정 범위 밖 라벨: (D) — …` | 등장 라벨 ∪ 렌더 라벨 − 기대 라벨 ≠ ∅ | `gate-…:362-373` |
| `요약문 라벨 등장 순서가 (A)(B) 이 아님 — 실제 …` | 등장 순서 불일치 | `gate-…:374-380` |
| `요약문이 영어 문장이 아님` | 라벨 제거본에 한글 포함 or 라틴문자 없음 | `gate-…:381-384` |
| `요약문에 다른 섹션 줄이 섞여 있음: '…' — …` | `STRAY_SECTION_LINE_RE` 적중 | `gate-…:107-110, 385-393` |
| `요약문에 밑줄(____)이 남아 있음 — …` | `/_{3,}/` | `gate-…:394-396` |
| `요약문이 N단어 — 글 전체를 압축한 한 문장이어야 함` | 라벨 제거본 `wordCount < 6` | `gate-…:397-399` |
| `정답(A) 줄을 인식할 수 없음(받은 값: '')` | `blank.answer` 빈 값 | `gate-…:152-155` |
| `정답(A) 이 영어 어구가 아님: '…'` | 한글 포함 or 라틴문자 없음 | `gate-…:157-159` |
| `정답(A) 이 N단어 — 이 유형은 다단어 어구가 정답이어야 함: '…'` | `wordCount < 2` | `gate-…:160-165` |
| `정답(A) 이 N단어 — 발문이 정확히 X단어를 요구함` | `targetWordsMode==="exact"` && 단어수 불일치 | `gate-…:166-169` |
| `정답(A) 이 N단어 — 발문이 약 X단어(허용 …)를 안내함` | `targetWordsMode==="approx"` && 목표와의 차이 > 2 | `gate-…:170-177` |
| `정답(A) 이 다른 빈칸 정답과 동일` | 정규화 소문자 키 중복 | `gate-…:178-180` |
| `핵심어(A) 누락 — 부분점수 채점 근거가 없음` | `requireLemmas`(=keyword 채점) && lemmas 0개 | `gate-…:182-185` |
| `핵심어(A) 'x' 가 정답 어구에 없는 형태 — …` | lemma 가 (정답∪동치) 토큰 집합에 없음 | `gate-…:186-198` |
| `동치(A) 항목이 영어가 아님: '…'` | 한글 포함 or 라틴문자 없음 | `gate-…:202-207` |
| `동치(A) 항목 '…' 이 N단어 — 정답(M단어)의 완전한 대체 정답이 아니라 조각으로 보임. …` | 동치 단어수 < 2 또는 정답의 절반 미만 | `gate-…:208-217` |
| `` `보기:` 줄은 있으나 칩을 하나도 읽지 못함 — … `` | 칩 0개 + `보기` 머리표는 존재 | `gate-…:227-233` |
| `보기 칩 N개 — 교사 설정이 [보기] 제공이므로 최소 2개가 필요함(…)` | 칩 < 2 | `gate-…:227-233` |
| `보기 칩 하나가 정답(A) 어구를 통째로 담고 있음 — 정답이 그대로 노출됨` | 정규화 칩이 다단어 정답을 포함 | `gate-…:236-249` |
| `보기 칩으로 (A) 정답 조립 불가 — 부족 토큰 "x", "y"` | 정본 `findUnbuildableWordBankBlanks` 결함 | `gate-…:251-267` |
| `보기 칩 나열이 정답 어순 그대로 — 어순이 무료로 노출됨` | `chipsFollowAnswerOrder`(정답 토큰열이 칩 토큰열 전체를 포함) | `gate-…:269-272` |
| `보기 칩에 불릿·번호 잔재가 있음: '…' — …` | 칩에 `-` `*` `•` 또는 선두 번호 | `gate-…:274-282` |
| `보기 칩에 라벨성 문자열이 섞임: '…' — …` | 칩에 콜론(`:` 또는 `：`) | `gate-…:283-290` |
| `보기에 정답에 쓰이지 않는 칩이 N개 남음(useAll 은 전량 사용이 계약) — …` | `useAll` && 잔여 칩 > 0 | `gate-…:292-300` |
| `보기에 미끼 칩이 N개 — usePartial 은 … 최소 M개 필요함. …` | `usePartial` && 잔여 < `max(1, boxDistractors)` | `gate-…:301-314` |
| `[해석]이 있는데 보기 칩 전부가 정답 단어 — … 받아쓰기가 됨` | gloss O + usePartial + 잔여 0 + 다단어 정답 존재 | `gate-…:316-324` |
| `정답(A) 어구가 요약문에 통째로 노출됨: "…" — 빈칸에는 라벨만 두세요` | 정답 내용토큰(2+) 연속열이 요약문에 존재 | `gate-…:133-144, 405-416` |
| `모범답안이 지문 문장의 통째 복사입니다: "…". …` | 내용토큰 6+ && 80%+ 연속 런이 지문에 존재 | `gate-…:122-131, 418-434` |
| `` `해석:` 줄은 있으나 값을 읽지 못함 — … `` | `glossEnabled` && gloss 빈 값 + 머리표 존재 | `gate-…:437-443` |
| `해석 누락 — 발문이 [해석]을 참고하라고 지시하므로 반드시 필요함` | `glossEnabled` && 줄 자체 없음 | `gate-…:437-443` |
| `해석이 한국어가 아님` | gloss 에 한글 없음 | `gate-…:444-446` |
| `` `해설:` 줄은 있으나 값을 읽지 못함 — … `` | explanation 빈 값 + 머리표 존재 | `gate-…:453-458` |
| `해설 누락` | explanation 빈 값 + 줄 자체 없음 | `gate-…:453-458` |
| `해설이 한국어가 아님` | explanation 에 한글 없음 | `gate-…:459-461` |
| `` `채점기준:` 줄은 있으나 항목을 하나도 읽지 못함 — … `` | `requireCriteria`(=rubric) && criteria 0개 + 머리표 존재 | `gate-…:462-468` |
| `채점기준 누락 — 루브릭 채점 설정이라 사람이 읽을 항목별 기준이 필요함` | `requireCriteria` && 줄 자체 없음 | `gate-…:462-468` |

### 4-2. 반려가 아니라 **절삭**(corrections 기록, 게이트 클린)

| 동작 | 조건 | file:line |
|---|---|---|
| `교사 설정이 [해석] 미제공이라 해석 줄을 절삭` | `!glossEnabled` && gloss 존재 | `gate-…:82-85` |
| `교사 설정이 [보기] 미제공이라 보기 칩을 절삭` | `!wordBankEnabled` && 칩 존재 | `gate-…:86-89` |

### 4-3. 오토스냅 5종(반려 아님 — `snap-summary-writing.ts:109-186`)

| 코드 | 동작 | file:line |
|---|---|---|
| S1 | 요약문 라벨 표기 정규화(전각·소문자 → `(A)`) | `snap-…:27, 114-121` |
| S2 | 요약문 **라벨 직후** 빈칸선/말줄임/대시 제거 | `snap-…:28, 123-130` |
| S3 | 정답과 동일하거나 중복인 동치 제거 | `snap-…:138-147, 159-161` |
| S4 | 핵심어를 단어 단위 소문자 + **정답 표면형**으로 스냅, 미대응은 드롭 | `snap-…:41-75, 148-158` |
| S5 | 칩 나열이 정답 어순이면 결정형 재배열 | `snap-…:81-85, 173-183` |

> **저작 규칙: 스냅이 손댈 것이 하나도 없게 써라.** 프로브 P7 은 6문항 corrections 0건을 단언한다.

### 4-4. 어댑터 실패(게이트 클린 후 `ADAPT` 로 차단) — `adapter-summary-writing.ts:74-82`

`요약문 누락` · `빈칸 정답 없음` · `빈칸 라벨 또는 정답 누락` · `모범답안 파생 실패`

### 4-5. 품질 검증기(하네스 `qualityBlocking` 축 — 프로덕션은 비차단)

`validateSummaryWritingQuestion`(`validators/summary/writing.ts:207-502`) + 공통 영작 게이트(`dispatcher.ts:1039-1091`).

| 코드 | severity | 의미 | md 게이트와의 관계 |
|---|---|---|---|
| `sw-modelanswer-present` | error | modelAnswer 빈 값 | 어댑터가 파생하므로 정상 경로에서 불발 |
| `sw-summary-blank-marker-count` | error | 요약문 라벨 개수가 1이 아님 | md 게이트가 선차단 |
| `sw-answer-language` | error | 정답/모범답안이 영어 아님 | md 게이트가 선차단 |
| `sw-answer-not-in-summary` | error | 정답 어구 요약문 누수 | md 게이트와 **동일 알고리즘** |
| `sw-wordbank-no-answer-order` | error | 보기가 정답 어순 | 스냅 S5 가 먼저 고침 |
| `sw-wordbank-answer-coverage` | error | 한 칩이 다단어 정답 통째 | md 게이트와 동형 |
| `sw-answer-not-buildable-from-wordbank` | error | 칩으로 조립 불가 | md 게이트가 **같은 정본 함수** 호출 |
| `sw-gloss-answer-leak` | error | 해석 + 미끼 0 조합 | md 게이트와 동형 |
| `sw-direction-wordbank-mismatch` | error | 발문이 가리키는 상자가 빔 | 어댑터의 설정 복제로 방지 |
| `sw-distractor-semantic` | **warning** | usePartial 인데 미끼 목록 빔 | 파생이라 정상 경로에서 불발 |
| `writing-answer-verbatim-in-passage` | **warning** | 정답 내용토큰 3+ 연속이 지문에 존재 | 흔한 무해 경고 |
| `writing-answer-verbatim-copy` | error | 내용토큰 6+ · 80%+ 연속 복사 | md 게이트가 **동일 임계**로 선차단 |
| `few-key-points` | **warning** | KILLER 인데 keyPoints < 3 | `keyPoints:[]` 고정이라 **KILLER 전 문항에서 항상 뜬다** — 무해 |

위 error 코드 대부분은 `RELAXED_BLOCKING_QUALITY_CODES` 에 등재돼 fast 폴백에서도 실제로 문항을 죽인다
(`run-question-generation-constants.ts:38, 272-288`).

---

## 5. adapter 산출 필드 — `adapter-summary-writing.ts:52-132`

| 키 | 값 | 비고 |
|---|---|---|
| `direction` | 결정론 합성 발문(한국어 고정) | **AI 문구 금지.** `resolved.summaryWritingDirection` 또는 `buildSummaryWritingDirection` — `lane-…:64-73` |
| ★ `summaryWithBlanks` | `요약문:` 값(라벨 그대로) | 학생 화면은 이걸 마스킹해 그린다(`summary-writing.ts:104-132`) |
| `koreanGloss` | `해석:` 값 — **glossEnabled && 값 존재일 때만 키 생성** | 없으면 키 자체가 없다 |
| `wordBank` | `보기:` 칩 — **wordBankEnabled && 칩 1개 이상일 때만** | |
| ★ `wordBankDistractors` | **파생** 미끼(잔여 칩) — 0개면 키 없음 | `wordBank` 의 부분집합 보장(`adapter-…:85-88`) |
| `wordBankPolicy` / `wordBankFidelity` / `blankAssignment` / `clueMode` / `targetWordsMode` / `connectorFrame` / `summarySourceMode` / `sourceSentenceParaphrase` | 설정 메타 8종 복제 | 렌더 마스킹·검증기가 읽는다(`adapter-…:110-118`) |
| ★ `blanks[]` | `{label:"(A)", answer, acceptableVariants?, requiredLemmas?, targetWordCount?}` | `label` 이 **곧 학생 답안 입력 키**(`answer-spec.ts:210, 213`) |
| ★ `modelAnswer` | **파생** — 요약문 라벨을 정답으로 치환 | `parser-…:458-469` |
| `scoringCriteria` | `채점기준:` 항목 — 있을 때만 키 생성 | |
| ★ `scoringMode` | `exact→EXACT` / `keyword→LEMMA` / `rubric→LLM_RUBRIC` | `adapter-…:44-50` |
| `correctAnswer` | `modelAnswer` 와 동일 문자열 | `adapter-…:123` |
| `explanation` | 한국어 해설 | |
| `keyPoints` | **항상 `[]`** | 합성 금지(`adapter-…:125-127`) — KILLER `few-key-points` 경고의 원인 |
| `tags` | `[]` | |
| `difficulty` | `ctx.rawDifficulty` | |

### 이 유형에만 있는 계약

- ⚠ **`options` 키를 아예 만들지 않는다**(키 부재). 비어 있지 않은 `options` 는 `correct-answer-mismatch`(RELAXED_BLOCKING)로 차단(`adapter-…:15-16`).
- ⚠ **`blankGlosses` · `firstLetterHint` · `passageWithBlank` 를 만들지 마라**(`adapter-…:17-19`). 앞글자 단서는 렌더가 `blanks[].answer` 에서 직접 파생한다(`summary-writing.ts:110-127`).
- ⚠ **`blanks[].label` 은 `"(A)"` 괄호 대문자 고정.** 이 문자열이 그대로 채점 입력 키가 된다(`answer-spec.ts:210` → `grade.ts:115`). `"A"`·`"(a)"` 로 새면 저장된 학생 응답과 desync 한다.
- ⚠ **`targetWordCount` 는 `targetWordsMode` 가 `hidden` 이 아닐 때만 실린다**(`adapter-…:95-98`) — 설정값의 복제이지 모델 산출이 아니다.
- 어댑터가 **입력 전량을 `cleanMdValue` 로 다시 세척한다**(`adapter-…:40-41, 58-72`). 라벨만 예외(`:38`).

### 저장 매핑

`postProcessQuestion` 은 PASSTHROUGH(`question-postprocess/types.ts:79`) → `structuredData` = 위 그대로 +
`_typeId`/`_typeLabel`/`_generationPlan`/`difficulty`. `options` 가 없으므로 `type` 은 **`SHORT_ANSWER`**,
`correctAnswer` 컬럼은 `q.correctAnswer`(= modelAnswer) — `00-contract.md §11`.

프로브 실측 `structuredData` 키 순서:
`direction, summaryWithBlanks, koreanGloss, wordBank, wordBankPolicy, wordBankFidelity, blankAssignment, clueMode, targetWordsMode, connectorFrame, summarySourceMode, sourceSentenceParaphrase, blanks, modelAnswer, scoringCriteria, scoringMode, correctAnswer, explanation, keyPoints, tags, difficulty`

### 채점 왕복 — `answer-spec.ts:307-313`

| scoringMode | inputKind / textMode | 필드 키 | 부분점수 |
|---|---|---|---|
| `LLM_RUBRIC`(rubric) | **`MANUAL_ONLY`** — 항상 `NEEDS_REVIEW` | — | — |
| `LEMMA`(keyword) | 빈칸 1 → `TEXT_SINGLE` / 2개 이상 → `TEXT_MULTI`, `LEMMA` | `(A)`,`(B)` | 있음 |
| `EXACT`(exact) | 위와 동일, `VARIANTS` | 위와 동일 | 있음 |

LEMMA 판정(`grade.ts:52-59`): 정답/동치 **정확 일치** → `CORRECT`; 아니면 표제어가 **전부** 학생 답 토큰에 있으면 `NEEDS_REVIEW`, 없으면 `WRONG`.
→ **`핵심어(X):` 는 "부분점수"가 아니라 "사람 확인으로 넘길지"를 가르는 스위치다.**

---

## 6. 생성 노브

`resolveSummaryWritingSettings(rawSettings, difficulty)` — `question-type-generation-settings/summary-writing.ts:167-322`.
**난이도 프리셋이 먼저 깔리고 → 강사 설정이 덮고 → 호환성 매트릭스(F)가 마지막에 강제한다.**
qbank 에서는 ITEM 헤더 `settings:` JSON 이 `{SUMMARY_WRITING:{...}}` 로 병합돼 nested 경로로 읽힌다.

### 6-1. 난이도 프리셋 (실측 — `summary-writing.ts:92-160`)

| 노브 | BASIC | INTERMEDIATE | KILLER |
|---|---|---|---|
| `glossEnabled` | true | true | **false** |
| `glossLooseness` | **literal** | natural | natural |
| `wordBankEnabled` | true | true | true |
| `wordBankUsage` | **useAll** | usePartial | usePartial |
| `wordBankFidelity` | verbatim | verbatim | **inflected** |
| `wordBankOrder` | **random** | scrambleStrong | scrambleStrong |
| `wordBankChunking` | **chunk** | word | word |
| `blankAssignment` | separate | separate | **shared** |
| `targetWordsMode` | approx | approx | **hidden** |
| `connectorFrame` | **full** | partial | partial |
| `summarySourceMode` | paraphrase | paraphrase | **inference** |
| `sourceSentenceParaphrase` | false | false | **true** |
| `scoringGranularity` | keyword | keyword | **rubric** |
| 배점(발문) | `[2점]` | `[3점]` | `[4점]` |

> ⚠ **숫자 노브 3종(`blankCount`·`boxDistractors`·`targetWordsPerBlank`)은 난이도 프리셋을 타지 않는다.**
> `readNumericSetting` 이 `NumericSettingSpec.defaultValue` 를 쓰기 때문이다(`shared.ts:88-102`).
> 실측(프로브 K1): 전 난이도에서 `blankCount=1` · `boxDistractors=0` · `targetWordsPerBlank=7`.
> **빈칸을 2개로 하려면 ITEM `settings` 에 명시해야 한다.** 프리셋 표의 `blankCount 2`(`:128, :150`)는 사실상 죽은 값이다.

### 6-2. 노브 전수표

| 키 | 타입 | 기본값 | 클램프/허용 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `blankCount` | number | **1**(`summary.ts:23`) | **1~3**(`summary.ts:19-21`, `prompts-…:32-33`) | `정답(X):` 줄 개수와 요약문 라벨 개수. 게이트 #1 이 정확 일치를 요구 |
| `glossEnabled` | boolean | 프리셋 | — | true → `해석:` **필수**, false → 쓰면 절삭 |
| `glossLooseness` | `literal`/`natural`/`gist`/`partial` | 프리셋 | 4값 | 해석 강도 지시만(`prompts-…:171-178`). 게이트 영향 없음 |
| `wordBankEnabled` | boolean | 프리셋(true) | — | true → `보기:` **필수(칩 2개 이상)**, false → 쓰면 절삭 |
| `wordBankUsage` | `useAll`/`usePartial`/`freeCount` | 프리셋 | 3값 | **useAll → 잔여 칩 0 강제** / **usePartial → 미끼 최소 `max(1,boxDistractors)`개** / freeCount → 개수 검사 없음 |
| `boxDistractors` | number | **0**(`summary.ts:29`) | **0~4**(`summary.ts:25-27`) | usePartial 의 미끼 요구 개수(바닥 1 — `prompts-…:103-107`) |
| `wordBankFidelity` | `verbatim`/`inflected`/`mixed` | 프리셋 | 3값 | 칩 형태 지시. inflected 면 칩=기본형, 정답=굴절형. 발문에 "(필요시 어형을 바꿔)" 추가(`settings:368-370`) |
| `wordBankChunking` | `word`/`chunk`/`mixed` | 프리셋 | 3값 | 칩 분할 단위 지시(`prompts-…:116-124`). chunk 여도 **한 칩이 정답 절반 이상을 담으면 안 된다** |
| `wordBankOrder` | `random`/`alphabetical`/`scrambleStrong` | 프리셋 | 3값 | 칩 나열 지시만(`prompts-…:149-155`). 실제 어순 누수는 스냅 S5 가 집행 |
| `blankAssignment` | `separate`/`shared` | 프리셋 | 2값 | blankCount 2 이상일 때만 프롬프트에 등장(`prompts-…:156-162`). 게이트 없음 |
| `targetWordsMode` | `exact`/`approx`/`hidden` | 프리셋 | 3값 | **exact → 정답 단어수 정확 일치 게이트** / approx → ±2 / hidden → 검사 없음 + 발문에 단어수 미표기 |
| `targetWordsPerBlank` | number | **7**(`summary.ts:35`) | **3~17**(`summary.ts:31-33`) | 위 게이트의 목표값. 발문 문구에 그대로 박힌다 |
| `clueMode` | `none`/`firstLetter`/`firstLetterDashes`/`skeleton`/`wordCount`/`koreanChunk` | 프리셋(none) | 6값 | 학생 화면 단서만. **마크다운 형식 무변화**(단서는 기계 파생 — `prompts-…:235-246`). firstLetter 계열이면 발문에서 단어수 문구가 사라진다(`settings:383-390`) |
| `connectorFrame` | `full`/`partial`/`bare` | 프리셋 | 3값 | 요약문에서 빈칸 밖 프레임을 얼마나 남길지(`prompts-…:196-204`). 게이트 없음 — **설계 축** |
| `summarySourceMode` | `paraphrase`/`inference` | 프리셋 | 2값 | 요약문이 재진술인가 상위 명제인가(`prompts-…:206-214`). 게이트 없음 — **설계 축** |
| `sourceSentenceParaphrase` | boolean | 프리셋 | — | true → 빈칸 **밖** 문장도 지문 표현과 다르게 |
| `scoringGranularity` | `exact`/`keyword`/`rubric` | 프리셋 | 3값 | **keyword → `핵심어(X):` 필수** / **rubric → `채점기준:` 필수** / exact → 둘 다 선택(`lane-…:84-87`) |
| `stemLanguage` | `ko`/`en` | `ko` | 2값 | **발문은 항상 한국어**(`lane-…:16-21`). en 이면 extras 블록 1개만 추가 — **마크다운 형식 무변화** |
| `difficulty` | `BASIC`/`INTERMEDIATE`/`KILLER` | ITEM 헤더 | 3값 | 위 프리셋 전체 + 배점 + 프롬프트 서사 3분기 |

### 6-3. 호환성 강제(F) — `summary-writing.ts:282-300` (프로브 K3~K5 실측)

```ts
if (!wordBankEnabled) { wordBankUsage = "useAll"; boxDistractors = 0; }              // #1
if (wordBankUsage !== "usePartial") { boxDistractors = 0; }                          // #6
if (wordBankEnabled && wordBankUsage === "useAll" && targetWordsMode === "exact")
  targetWordsMode = "approx";                                                        // #5
if (difficulty === "KILLER" && glossEnabled && glossLooseness === "literal")
  glossLooseness = "natural";                                                        // #7
```

숫자 클램프는 `normalizeNumericSetting`(`shared.ts:65-75`) — `Math.min(max, Math.max(min, Math.round(n)))`, 비수치면 기본값.
즉 `{blankCount:4}` → 3, `{blankCount:0}` → 1, `{boxDistractors:9}` → 4, `{targetWordsPerBlank:99}` → 17.
`isEligible`(`lane-…:100-112`)은 `summaryWritingBlankCount` 키가 **1~3 정수가 아니면 레인 자체를 거부**한다(키 부재는 적격).

---

## 7. 함정 (코드 근거 있는 것만)

1. **`보기:` 줄과 `정답(A):` 사이의 빈 줄을 빼지 마라.** `정답(A):` 은 머리표 가드를 통과하지 못해
   정지 키워드가 아니다(`parser-…:130`). 목록 모드는 빈 줄로만 끝난다(`:306-310`).
   **실측(프로브 S1): 칩 9→15, 「보기 칩 하나가 정답(A) 어구를 통째로 담고 있음」+「라벨성 문자열이 섞임」 반려 2건.**

2. **채점기준 항목 사이에 빈 줄을 넣지 마라.** 그 아래 항목이 **게이트 클린인 채로 사라진다**(프로브 S2: criteria 2→1).
   `requireCriteria` 는 항목 수가 0인지만 본다(`gate-…:462`) — 1개만 남아도 통과한다. **조용한 사고다.**

3. **`모범답안:` 를 쓰지 마라.** 이 유형은 받지 않는다(`prompts-…:298`). 게다가 섹션 키워드라 블록을 끊는다.
   실측(E1): `정답(A):` → `모범답안:` 로 바꾸면 「정답(A) 줄을 인식할 수 없음(받은 값: '')」.

4. **`정답: ①` 을 쓰지 마라.** 선지가 없는 유형이다(`prompts-…:324`). 라벨 없는 `정답:` 은 blankCount=1 에서만
   드리프트로 흡수되고(`parser-…:413-427`), 2개 이상이면 「빈칸 정답 0개」다.

5. **`정답(D):` 는 무흔적으로 사라진다.** 라벨 축은 A·B·C 뿐(`parser-…:62, 396-397`).
   요약문에 `(D)` 가 남아야만 게이트가 잡는다(`gate-…:362-373`).

6. **정답은 반드시 2단어 이상.** 한 단어면 「다단어 어구가 정답이어야 함」(`gate-…:160-165`). 어휘 받아쓰기가 아니다.

7. **두 빈칸 정답이 같으면 반려**(`gate-…:178-180`). 대소문자·공백 차이는 흡수된다.

8. **동치를 쉼표로 이어 쓰지 마라.** 쪼개지지 않고 한 덩어리로 굳어 **만점 정답 집합에 쓰레기가 실린다**
   (`parser-…:209-222`, 프로브 E9 — 게이트 무발화). 여럿이면 `동치(X):` 줄을 여러 번 써라.
   반대로 **정답의 절반 미만인 짧은 동치**는 「조각으로 보임」으로 반려된다(`gate-…:208-217`).

9. **핵심어는 정답 어구에 실제로 등장하는 형태 그대로, 한 단어씩.** 채점기가 토큰 정확 대조를 한다(`grade.ts:58`).
   구(句)로 적으면 스냅이 쪼개고(S4), 대응 형태가 없으면 드롭하며, **전부 미대응이면** 「정답 어구에 없는 형태」 반려(`gate-…:186-198`).
   `핵심어` 필수화는 **keyword 채점일 때만**이다(`lane-…:87`) — exact/rubric 에서 억지로 채우지 마라.

10. **칩 안에 `/` `|` 를 넣지 마라.** 칩 구분자다(`parser-…:230-238`). `and/or`·`24/7` 은 두 칩이 된다.

11. **`보기:` 블록에 메모를 붙이지 마라.** 목록 모드에는 라벨성 가드가 없어 `Note: …` 가 칩으로 굳고,
    게이트가 「라벨성 문자열이 섞임」으로 반려한다(`gate-…:283-290`, 프로브 E14).

12. **usePartial 이면 미끼가 실재해야 한다.** 요구 개수는 `max(1, boxDistractors)`(`prompts-…:103-107` 와 `gate-…:301-314` 가 같은 함수를 쓴다).
    `boxDistractors` 기본값은 0 이지만 바닥이 1 이라 **usePartial 에서는 항상 최소 1개**가 필요하다.
    반대로 **useAll 이면 잔여 칩이 0이어야 한다**(`gate-…:292-300`).

13. **한 칩에 다단어 정답을 몰아넣지 마라.** 정답 통째 노출(`gate-…:236-249`). chunk 설정이어도 마찬가지다.

14. **칩만으로 정답이 조립돼야 한다.** 관사·전치사까지 포함, 같은 단어가 2회 필요하면 칩도 2개(`gate-…:251-267`).
    기능어(`the`·`of`·`along` 등)는 **정확 일치한 칩만** 공급원이 된다(`validators/summary/writing.ts:36-51, 108-109`).

15. **정답 어구가 지문 문장의 통째 복사면 반려.** 내용토큰 6개 이상 && 80% 이상 연속 런(`gate-…:122-131`).
    **부분 복사(4토큰 등)는 경고만 뜨고 통과한다** — 검수 렌즈가 잡아야 하는 자리다.

16. **정답의 연속 2토큰이 요약문(빈칸 밖)에 있으면 반려**(`gate-…:133-144`).
    ⚠ 판정은 **정답 내용토큰 전량**이 연속으로 있을 때만 발화한다 — **앞부분만 노출된 부분 누수는 게이트를 통과한다**(프로브 E22-b).

17. **요약문에 밑줄(`___`)을 그리지 마라.** 빈칸 표시는 라벨만이고 밑줄은 표시 계층이 붙인다(`gate-…:394-396`).
    라벨 **직후**의 빈칸선만 스냅 S2 가 제거해 준다 — 문장 중간의 밑줄은 반려다.

18. **요약문은 라벨 제외 6단어 이상**(`gate-…:397-399`). 요약문 안 라벨 등장 순서는 `(A)(B)(C)` 고정(`gate-…:374-380`, 프로브 T3).
    단 `정답(X):` **줄**의 기재 순서는 자유다(파서가 정렬 — 프로브 T2).

19. **`해설:` 뒤에 아무것도 두지 마라.** 다음 섹션 머리표가 없으면 뒤 줄이 전부 해설로 흡수된다
    (`parser-…:291-316` fold 모드, 프로브 E28 — **게이트 클린인 채 해설 오염**).

20. **해설·채점기준·해석은 한국어.** 영어면 각각 「해설이 한국어가 아님」·「해석이 한국어가 아님」(`gate-…:444-446, 459-461`).
    해설은 **딱 2문장**이 계약이다(`prompts-…:287-288`) — 게이트는 세지 않지만 검수 렌즈가 본다.

21. **장식 0.** 파서가 굵게·불릿·헤딩·표 파이프·전각 콜론·백틱을 전부 관용하지만(`decoration.ts`) **관용은 계약이 아니다**
    (`00-contract.md §8`). 유형마다 관용 범위가 다르고, 값 오염은 게이트를 통과해 학생 화면에서만 터진다.

22. **`해석:`/`보기:` 를 설정과 어긋나게 쓰면 절삭된다**(반려 아님 — `gate-…:75-91`). 조용히 사라지므로
    "썼는데 학생 화면에 없다"는 사고가 된다. **설정을 먼저 확인하고, 꺼져 있으면 쓰지 마라.**

23. **정답 앞에 선지 번호(`①`)를 붙여도 게이트가 잡지 못한다**(프로브 E2 — 무발화, `structuredData.answer` 에 `① …` 그대로 저장).
    **선지 표기는 이 유형에 존재하지 않는다.**

---

## 8. 출제 포인트 다각화 축

> **같은 지문에서 5~8문항.** 답만 다르고 묻는 방식이 같으면 1문항의 N개 사본이다(헌법 §7).
> 이 유형은 선지가 없어 "오답 5개 재설계"라는 다각화 수단이 없다. 대신 **표적 어구 설계 + 요약문 골격 설계 + 미끼 칩 설계**
> 라는 세 축이 열려 있다.
> 하네스가 결정형으로 집행하는 것은 `point:` 문자열 중복(`POINT_DUPLICATE` — `qgen-core.ts:335-343`)과
> `diversityTargets` 중복(`ANSWER_DUPLICATE` — `qgen-core.ts:355-363`) 둘뿐이다.
> `diversityTargets` = **`blanks[].answer` 앞 90자**(`lane-…:193-206`) → **정답 어구 문자열만 다르면 게이트는 통과한다.**
> 나머지는 전부 설계 책임이다.

### 8-A. 노브로 달라지는 축 (코드 근거 — ITEM `settings:` 로 문항마다 바꿀 수 있다)

| # | 축 | 값 | 학생의 인지 작업이 어떻게 달라지나 | 근거 |
|---|---|---|---|---|
| A1 | **빈칸 수** | 1 / 2 / 3 | 1=단일 명제 생산 / 2=대조 양극 **배분 판단**(한쪽 오류가 반대쪽을 무너뜨림) / 3=3항 구조 분해 | `prompts-…:32-33`, 프로브 T1 |
| A2 | **보기 상자** | on / off | on=재료 선별+조립 / **off=재료 없이 논지만으로 어구 생성**(가장 어렵다) | `prompts-…:109-114` |
| A3 | **보기 사용 규약** | `useAll` / `usePartial` / `freeCount` | useAll=전량 소비 재배열(어순 판정만) / usePartial=미끼 선별 판단 추가 / freeCount=자유 선택 | `gate-…:292-314` |
| A4 | **미끼 수** | 0~4 (usePartial 에서 바닥 1) | 미끼가 늘수록 "문장에 대입해 보는" 검증 횟수가 늘어난다 | `summary.ts:25-29`, `prompts-…:103-107` |
| A5 | **칩 단위** | `word` / `chunk` / `mixed` | word=관사·전치사까지 통사 재구성 / chunk=의미 덩어리 배치. **같은 표적도 난이도가 통째로 바뀐다** | `prompts-…:116-124` |
| A6 | **어형 정합** | `verbatim` / `inflected` / `mixed` | verbatim=배치만 / **inflected=시제·수·태를 학생이 만든다** | `prompts-…:142-148` |
| A7 | **해석 상자** | on(literal/natural/gist/partial) / off | off 가 가장 어렵다. gist=요지만, partial=빈칸 구간만 뭉갬 | `prompts-…:166-182` |
| A8 | **목표 단어수** | `exact` / `approx` / `hidden` | exact=정확 개수 게이트(형식 부담) / hidden=길이 자유(설계 부담) | `gate-…:166-177` |
| A9 | **연결틀** | `full` / `partial` / `bare` | full=문장 골격 전부 보임 / partial=짧은 연결부만 / **bare=뼈대만 → 학생이 훨씬 많이 쓴다** | `prompts-…:196-204` |
| A10 | **요약 출처** | `paraphrase` / `inference` | 재진술 / **지문에 문장으로 없는 상위 명제** | `prompts-…:206-214` |
| A11 | **빈칸 밖 재작성** | `sourceSentenceParaphrase` on/off | on=표면 매칭 암기 차단 | `prompts-…:211-213` |
| A12 | **채점 입도** | `keyword` / `exact` / `rubric` | keyword→`핵심어(X):` 필수(부분 인정) / exact→`동치(X):` 를 빠짐없이(정확 일치) / rubric→`채점기준:` 필수(사람 채점) | `lane-…:84-87` |
| A13 | **난이도** | BASIC / INTERMEDIATE / KILLER | A2~A12 를 한 번에 갈아 끼우는 프리셋 + 배점 + 프롬프트 서사 | `summary-writing.ts:92-160` |

> **프로브 실증**: 6문항 중 ITEM 2 는 `{"targetWordsPerBlank":5}`, ITEM 4 는 `{"blankCount":2}`,
> ITEM 6 은 `{"wordBankEnabled":false,"blankCount":2}` 로 프리셋을 덮어 전부 게이트 클린이었다.
> 발문이 실제로 `… 각 빈칸을 약 7단어로 …` / `… [보기]에서 필요한 단어만 골라 …` / `… 영작하시오. [4점]` 로 갈렸다.

### 8-B. 설계로 달라지는 축 (교육적 판단 — 코드가 강제하지 않는다)

| # | 축 | 무엇을 달리하나 | 왜 이게 다른 문항인가 |
|---|---|---|---|
| B1 | **표적 명제의 논지 위치** | 도입 통념 / 반대 논거 / 전환점 / 기제 / 사례의 함의 / 결론 | 같은 지문에서도 "무엇을 요약으로 볼 것인가"가 달라진다. 프로브 ITEM 1(도입 명제) vs ITEM 2(반대 논거) vs ITEM 5(원리) |
| B2 | **추론 층위** | 명시 확인 → 재진술 → 인과 추적 → 추상화 → 반전 적용 | 헌법 §7-2. `summarySourceMode`(A10)와 짝지어야 실제 인지 부하로 번역된다 |
| B3 | **빈칸이 받는 논리 역할** | 조건 / 원인 / 귀결 / 대조항 / 범위 한정 / 원리 명명 | 빈칸 2개면 **둘을 서로 다른 역할**로(`prompts-…:72`). 같은 역할 두 개를 비우면 빈칸이 하나인 것과 같다 |
| B4 | **요약문 골격이 남기는 정보량** | 관계 전부 노출 / 관계만 노출 / 뼈대만 | `(A), which can lead to greater bias …`(귀결 노출) vs `(A) once justified X, but (B) has made Y`(대조 구조만) vs `(A), which is why …`(원리 자리만) |
| B5 | **빈칸 어구의 통사 형태** | 동명사구 / 명사구 / 관계절 포함 명사구 / 절(S+V) | 프로브: ITEM 1 동명사구, ITEM 4(A) 한정 명사구, ITEM 5 절(`Accountability begins where display ends`) |
| B6 | **미끼의 기제(택소노미)** | **어형 미끼** / **의미장 미끼** / **역방향 미끼** | `prompts-…:84-90`. **같은 기제를 두 번 쓰지 마라.** 무관한 단어는 미끼가 아니라 장식이다 |
| B7 | **미끼가 경쟁하는 자리** | 동사(방향) / 명사(범위) / 전치사(관계) / 한정어(강도) | 프로브: ITEM 3 `closing`(역방향)·`visitors`(의미장), ITEM 4 `secrecy`·`auction`, ITEM 5 `spectacle`·`visitor` |
| B8 | **근거 문장 쌍** | 1·2문장 / 2·3문장 / 3·4문장 / 4·6문장 | 헌법 §1-2 근거 이중화. 문항마다 근거 쌍을 옮기면 학생이 지문 전역을 훑는다 |
| B9 | **해석 상자의 뭉갬 지점** | 직역 / 자연 의역 / 요지만 / 빈칸 구간만 상위 개념화 | 해석이 정답을 역번역으로 복원하면 받아쓰기다(`prompts-…:181` 역번역 자기검산) |
| B10 | **동치 허용 범위** | 없음 / 구문 전환 1개 / 어순·동의구문 2~3개 | 정답 유일성을 어디까지 느슨하게 볼지가 문항 성격을 바꾼다. exact 채점이면 여기가 곧 채점표다 |
| B11 | **채점기준의 축** | 의미 / 범위 / 어순 / 정확성 / 층위 | rubric 문항에서 **무엇을 점수로 볼지**가 문항의 절반이다. 프로브 6문항 모두 축을 다르게 잡았다 |
| B12 | **해설이 짚는 흔들림 지점** | 어느 단어를 먼저 집는가 / 어느 극을 뒤집는가 / 어느 하위 주제로 새는가 | 해설 2문장 중 두 번째 문장의 내용축. 문항마다 달라야 다각화가 학습으로 연결된다 |

### 8-C. 5~8문항 조합 레시피 (프로브에서 실제로 통과한 6문항 구성)

| # | 난이도 | 노브 오버라이드 | 표적(논지 위치) | 빈칸 역할·형태 | 미끼 기제 |
|---|---|---|---|---|---|
| 1 | BASIC | (프리셋: useAll·해석 O) | 도입 명제(비공개 = 감시 이탈) | 동명사구 처방 | 없음(전량 사용) |
| 2 | BASIC | `{"targetWordsPerBlank":5}` | 반대 논거(큐레이터의 두 근거) | 두 근거를 한 명사구로 묶기 | 없음 |
| 3 | INTERMEDIATE | (프리셋: usePartial) | 인과 추적(검증 불가 → 개방) | 동명사구 + 범위 한정 | 역방향 `closing` · 의미장 `visitors` |
| 4 | INTERMEDIATE | `{"blankCount":2}` | 대조 배분(과거 명분 / 현재 장치) | (A) 명사구 / (B) 명사구 | 의미장 `secrecy` · 소재 인접 `auction` |
| 5 | KILLER | (프리셋: 해석 X·rubric·hidden·inflected) | 원리 추출(사례 위 한 층) | **절(S+V)** | 의미장 `spectacle` · 어형 `visitor` |
| 6 | KILLER | `{"wordBankEnabled":false,"blankCount":2}` | 반전 적용(변명 → 감사 대상) | 두 명사구가 하나의 명제를 쪼갬 | 없음(재료 없음) |

같은 난이도를 두 번 쓴 쌍(1·2, 3·4, 5·6)은 **B1(논지 위치)·A1(빈칸 수)·A8(목표 단어수)** 로 갈랐다.
**프리셋만 돌려서는 3문항이 한계다** — 5문항 이상은 반드시 B축이 개입해야 한다.

8문항으로 늘릴 때 추가로 열 축(권장 순서): ⑦ `{"connectorFrame":"bare"}` 로 골격을 최소화한 INTERMEDIATE,
⑧ `{"scoringGranularity":"exact","glossLooseness":"gist"}` 로 **동치 설계가 곧 채점표가 되는** BASIC.

### 8-D. 이 유형에서 다각화가 실패하는 전형

- **전 문항이 결론 문장의 재진술** — B1 이 하나로 고정되면 5문항이 사실상 1문항이다.
  `ANSWER_DUPLICATE` 는 **문자열만** 보므로(`qgen-core.ts:396-401` 정규화) 어구를 살짝만 바꿔도 통과한다. 게이트를 믿지 마라.
- **미끼를 매번 "무관한 단어"로 채우기** — 학생이 읽지도 않고 버린다(`prompts-…:88`). 문항마다 **기제(B6)와 자리(B7)를 옮겨라.**
- **빈칸 2개를 같은 논리 역할로 비우기** — 배분 판단이 사라져 빈칸 하나짜리와 같아진다(`prompts-…:72`).
- **해석을 매번 직역으로** — 역번역으로 정답이 복원되면 영작이 아니라 받아쓰기다(`prompts-…:181`).
- **`핵심어(X):` 를 전 문항 동일 단어로** — LEMMA 채점에서 판정이 사실상 같아진다.
- **KILLER 를 "정답을 길게"로 오해** — 길이는 난이도가 아니다. KILLER 의 축은 **층위(A10 inference)와 재료 박탈(A2 off)** 이다.

---

## 검증 기록

`qbank/work/_probe-SUMMARY_WRITING.ts` — `./node_modules/.bin/tsx qbank/work/_probe-SUMMARY_WRITING.ts`

```
itemCount = 6 · laneSupported = true
blocking = 0 · qualityBlocking = 0 · warnings = 2
  warn [item 5] QUALITY:few-key-points   (KILLER · keyPoints:[] 고정에 따른 무해 경고)
  warn [item 6] QUALITY:few-key-points
64/64 통과
```

- 6문항 전량 `parseAndGate` → `adapt` → `postProcessQuestion` → `validateQuestionQuality` 통과.
- `POINT_DUPLICATE` / `ANSWER_DUPLICATE` 미발화. 오토스냅 corrections **0건**(장식 0 저작의 증거).
- 게이트 반려 사유 **E1~E29 전수 실증**(각 저작 실수 → 실제 반려 문자열 대조).
- 구조 실증: S1(보기 뒤 빈 줄 필수) · S2(채점기준 항목 사이 빈 줄 = 조용한 소실) · S3(채점기준 앞 빈 줄 불필요).
- 상한 실증: T1(blankCount=3 클린) · T2(정답 줄 역순 기재 허용) · T3(요약문 라벨 등장 순서 고정).
- 노브 실증: K1~K11(숫자 노브 프리셋 미적용 · 호환성 매트릭스 #1/#5/#7 · isEligible 1~3 · mdFormat · stemLanguage).
- 참고 픽스처: `scripts/_test-md-summary-writing.ts`(1812줄) 도 동일 파이프라인 + 채점 왕복까지 전량 통과 상태다.
