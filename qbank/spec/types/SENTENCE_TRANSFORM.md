# 문장 전환 (SENTENCE_TRANSFORM)

> 분류 **서술형(자유영작 — 선지 없음)** · 지문변형 **없음(원문장을 축자 인용만, 지문 본문 1글자도 불변)** · 정답 머리표 **`모범답안:`** (별칭 `정답:` 허용, 정본이 우선) · 최소 지문 길이 **코드 규정 없음(=0)**, 단 「전환 대상 자격을 갖춘 문장」을 유닛이 문항 수만큼 소비하므로 실질 하한은 **문장 예산**이 결정한다(§8-0).
>
> 검증: `qbank/work/_probe-SENTENCE_TRANSFORM.ts` — **74/74 PASS** (parse → autoSnap → gate → adapt → postProcess → validateQuestionQuality → gateUnit 컨테이너까지 전 경로).
> 리포 정본 회귀: `scripts/_test-md-sentence-transform.ts` — **181/181 PASS**.
> 상위 계약: [`../recon/00-contract.md`](../recon/00-contract.md) · 품질 규범: [`../quality-constitution.md`](../quality-constitution.md)

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문에 실재하는 문장 **하나**를 골라 밑줄로 지목하고, 한국어 **조건**(1~4개)을 붙여
학생에게 그 문장을 **영어로 다시 쓰게** 한다. 선지가 없다 — 학생은 빈 줄에 영어 완성 문장을 직접 써낸다.

> 이 유형의 품질은 **"고를 것을 잘 만들었는가"가 아니라 "쓸 것이 하나로 정해지는가"** 로 갈린다
> (`prompts-sentence-transform.ts:97-98`).

요구되는 인지 작업은 **문법 지식 암기가 아니라 문장 구조 읽기**다. 프롬프트의 few-shot 이 못 박은 기준
(`prompts-sentence-transform.ts:39`): 좋은 문항은 "접속사를 지우고 동사를 -ing 로 바꾸는 것만으로는 답에
도달하지 못하고, 종속절의 주어를 주절로 끌어올려 주어를 통일해야 비로소 성립"한다.

### 학생 화면에 실제로 보이는 것 (설계 전제)

| 표면 | 값 | 근거 |
|---|---|---|
| 발문 | `다음 문장을 주어진 조건에 맞게 바꾸어 쓰시오.` 고정 | `adapter-sentence-transform.ts:30-31` |
| 지문 | **원문 전문이 문항과 함께 INLINE 노출** | `taking-parts/question-view.tsx:34-48` (`PASSAGE_CONTENT_SUBTYPES`) |
| 원문장 | 지문 안에서 **`__…__` 밑줄로 표시** | `paper-builder/source-passage-markers.ts:12-14, 60, 95` (`SOURCE_UNDERLINE_SUBTYPES = {WORD_ORDER, SENTENCE_TRANSFORM}`) |
| 조건 | 한국어 목록 | `student-safe-data.ts:354-359` — 학생 안전 필드는 `originalSentence` + `conditions` **둘뿐** |
| 채점 | **MANUAL_ONLY** (기계 채점 불가, 강사 검토) | `exam-scoring/answer-spec.ts:249-250` (`FREE_WRITING`) |

★ **지문이 학생 눈앞에 있다**는 것이 이 유형의 모든 설계 제약의 뿌리다.
따라서 ① 원문장이 축자가 아니면 밑줄이 사라져 학생은 전환할 문장 자체를 못 보고,
② 모범답안이 지문 어딘가에 통째로 있으면 전환이 아니라 베껴 쓰기 과제가 된다. 둘 다 게이트가 차단한다.

### 다른 유형과의 구별

| 유형 | 학생이 받는 재료 | 학생이 산출하는 것 | 정답 머리표 |
|---|---|---|---|
| **SENTENCE_TRANSFORM** | **지문 축자 영어 문장** + 한국어 조건 | 같은 뜻의 다른 통사 구조 영어 문장 | `모범답안:` |
| `CONDITIONAL_WRITING` | **한국어** 참조 문장(`referenceSentence`) + 조건 | 영어 문장 | `모범답안:` |
| `WORD_ORDER` | 뒤섞인 청크 | 배열된 영어 문장 | `모범답안:` |
| `GRAMMAR_CORRECTION` | 오류가 주입된 지문 | 고친 형태 | `정답:` 계열 |

★ CONDITIONAL_WRITING 과 형상이 거의 같지만 **입력 재료가 다르다** — CW 는 한국어를 보고 영작하고,
ST 는 **영어 원문을 보고 통사만 바꾼다.** 그래서 ST 는 지문 verbatim 누수 게이트(`writing-answer-verbatim-in-passage`)
에서 **명시적으로 제외**됐고(`dispatcher.ts:1038, 1039-1046`), 대신 훨씬 좁은 「모범답안 통째 존재」 검사를 쓴다
(`gate-sentence-transform.ts:383-390`).

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (플레이스홀더 `<꺾쇠>`)

```md
원문장: <지문에 실재하는 문장 하나를 처음부터 마침표까지 축자 그대로. 한 줄. 6~60단어. 지문에 딱 1회만 등장하는 문장.>
조건:
- <전환 조건 1 — 한국어 한 줄. 채점자가 눈으로 O/X 를 그을 수 있어야 한다.>
- <전환 조건 2 — 필수·금지 어휘는 반드시 작은따옴표로: 'Had'로 시작할 것 / 'if'를 사용하지 말 것. KILLER 는 서로 다른 축 2개 이상 필수, BASIC·INTERMEDIATE 는 이 줄을 지워도 된다.>
모범답안: <조건을 전부 적용한 영어 완성 문장 한 줄. 5단어 이상. 마침표로 끝낸다. 원문장과 반드시 다르고, 지문 어디에도 통째로 있으면 안 된다.>
채점기준:
- 만점: <이 형태여야 만점이라는 서술 한 줄>
- 부분점수: <어순·축약 차이처럼 감점만 하고 인정하는 동치 변형 한 줄>
- 0점: <의미 변경·조건 미충족처럼 인정하지 않는 형태 한 줄>
해설: <딱 2문장. ①어떤 전환을 원문장의 어느 자리에 적용했는지 ②원문의 명제 의미(극성·hedge·의미역)가 어떻게 보존됐는지. 한국어 합니다체, 한 줄.>
```

> **`정답:` 줄도 `오답:` 블록도 쓰지 않는다.** 선지가 없는 서술형이라 정답의 유일 진실원은 `모범답안:` 한 줄이고,
> 어댑터가 그것을 `correctAnswer` 로 복제한다(`adapter-sentence-transform.ts:62-64`).
> 조건은 난이도별 개수 범위(BASIC·INTERMEDIATE **1~3**, KILLER **2~4**), 채점기준은 **2~5**개다.

### 2-2. ★ 검증된 정상 픽스처 전문 — `scripts/_test-md-sentence-transform.ts:33-54`

지문(`PASSAGE`, 같은 파일 :33-38):

```
Urban planners once treated rooftops as dead space, useful only for equipment. Because the canopy of a green roof intercepts sunlight before it reaches the membrane below, the surface stays measurably cooler through the afternoon. Engineers who monitor these buildings report that the district's cooling effect persists even during prolonged heat waves. The savings are modest for a single structure, yet they accumulate across a dense district. City councils have therefore begun to subsidize installation rather than merely permit it.
```

마크다운 실물 (probe **P1** 에서 `gate 0` 재확인):

```md
원문장: Because the canopy of a green roof intercepts sunlight before it reaches the membrane below, the surface stays measurably cooler through the afternoon.
조건:
- 분사구문으로 전환할 것
- 'Intercepting'으로 시작할 것
모범답안: Intercepting sunlight before it reaches the membrane below, the canopy of a green roof keeps the surface measurably cooler through the afternoon.
채점기준:
- 만점: 분사구문으로 압축되고 원문의 인과 관계가 그대로 유지된 문장
- 부분점수: 어순이나 축약만 다른 동치 변형
- 0점: 원인과 결과가 뒤바뀌었거나 분사구문이 아닌 문장
해설: 종속절의 주어를 주절 주어로 통일한 뒤 접속사와 정동사를 지우고 분사구문으로 압축했습니다. 원문의 인과 관계와 "stays measurably cooler"가 담고 있던 정도 한정이 모두 남아 명제 의미가 그대로 보존됩니다.
```

BASIC(조건 1개) 정상 픽스처 — 같은 파일 `:110-117`:

```md
원문장: Engineers who monitor these buildings report that the district's cooling effect persists even during prolonged heat waves.
조건:
- 관계절을 분사구로 줄여 쓸 것
모범답안: Engineers monitoring these buildings report that the district's cooling effect persists even during prolonged heat waves.
채점기준:
- 만점: 관계절이 분사구로 줄어들고 나머지 의미가 그대로인 문장
- 0점: 관계절이 그대로 남아 있거나 주어가 바뀐 문장
해설: 주격 관계대명사와 정동사를 지우고 현재분사로 줄여 명사구를 압축했습니다. 보고 주체와 지속되는 대상이 그대로여서 의미역과 명제 의미가 보존됩니다.
```

### 2-3. qbank 컨테이너 실물 (유닛 1문항분)

```md
<!-- ITEM 1
difficulty: KILLER
point: 인과 기제 문장 — 부사절을 분사구문으로 압축하며 주어를 통일(절 압축 + 어휘 제약)
craft: 종속절 주어를 주절로 끌어올려야 분사구문이 성립한다 — 기계적 이동으로는 못 푼다
-->
원문장: Because a shopper who faces thirty varieties of jam must compare each one against the rest, the effort of deciding grows faster than the benefit of choosing well.
조건:
- 부사절을 분사구문으로 압축할 것
- 'Facing'으로 시작할 것
모범답안: Facing thirty varieties of jam, a shopper finds that the effort of deciding grows faster than the benefit of choosing well.
채점기준:
- 만점: 부사절이 분사구문으로 압축되고 인과 관계가 유지된 문장
- 부분점수: 분사구문은 맞으나 비교 구문의 어순만 어긋난 문장
- 0점: 인과가 뒤바뀌었거나 접속사가 그대로 남은 문장
해설: 부사절의 주어를 주절 주어와 통일한 뒤 접속사와 정동사를 지워 분사구문으로 압축했습니다. 비교의 두 항과 인과 방향이 그대로여서 원문의 명제 의미와 정도 한정이 보존됩니다.
```

ITEM 헤더는 **qbank 규약이지 md-qgen 규약이 아니다**(`qbank/harness/qgen-core.ts:19-47`) — 하네스가 잘라낸 뒤의 본문만이 파서 계약 대상이다.
**이 유형에는 줄 노브가 없다** — `settings:` 줄은 쓸 일이 없다(§6).

---

## 3. 파서 계약 (★ 가장 중요)

> 진실원은 `src/lib/md-qgen/parser-sentence-transform.ts` 다. 프롬프트 지시가 느슨해도 파서가 계약이다.
> 이 파서는 **자체 관용 계층(`stripMd` + 관용 헤더 정규식)** 을 가진다 — `decoration.ts` 를 import 하지 않지만
> 사실상 같은 범위를 흡수한다. **ANTONYM 과 정반대이므로 다른 유형의 경험을 옮겨 오지 마라.**

### 3-0. 구조 — 상태 기계 (순서 계약 없음)

파서는 문서를 **줄 단위 상태 기계**로 훑는다(`parser-sentence-transform.ts:236-315`). 섹션 순서는 강제되지 않는다(probe **E17**).
`정답:`/`해설:` 처럼 `String.match` 첫 매치를 쓰는 정본 파서와 달리 **모든 라벨이 재진입 가능**하고,
단일값 섹션은 **덮어쓰기가 아니라 이어붙이기**다(`:227-232`) — 이것이 문항 연접 사고의 원인이다(R14).

### 3-1. 라벨(헤더) 문법

| # | 규칙 | 정규식/리터럴 원문 | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|
| R1 | 헤더 = `[여는괄호?] 라벨 [닫는괄호?] 콜론 값` | `` `^${LABEL_OPEN}\s*(?:${alts})\s*${LABEL_CLOSE}\s*${COLON_CLASS}\s*(.*)$` `` — 값은 **항상 캡처 1번** | `:165-169` | 콜론이 없으면 헤더가 아니다 → 그 줄이 직전 섹션에 흡수됨 |
| R2 | 콜론 클래스 6종 | `[:\uFF1A\uFE55\uFE13\u2236\u02D0]` (`:` `：` `﹕` `︓` `∶` `ː`) | `:160` | — (전부 허용) |
| R3 | 라벨 괄호 흡수 | `LABEL_OPEN = [\[({\u3010\u300C\u3014<]?` · `LABEL_CLOSE = [\])}\u3011\u300D\u3015>]?` | `:161-162` | `[원문장]:` `【모범답안】:` `「해설」:` 전부 읽힌다 |
| R4 | **원문장** 라벨 대안 | `원\s*문장\|원래\s*문장\|대상\s*문장\|전환\s*대상(?:\s*문장)?\|원문` | `:173` | 그 외 표기(`문장:`·`Original:`)는 헤더가 아님 → **원문장 누락** |
| R5 | **조건** 라벨 대안 | `전환\s*조건\|작성\s*조건\|조건` | `:174` | 미매칭 시 **조건 누락** |
| R6 | **모범답안** 정본 라벨 | `모범\s*답안(?:\s*문장)?\|모범답\|모범\s*답` | `:175` | — |
| R7 | **모범답안 별칭**(`alias:true`) | `정답(?:\s*문장)?\|답안\|답` | `:176` | 별칭은 **별도 슬롯**에 담기고 `modelAnswer \|\| modelAnswerAlias` 로 정본이 이긴다(`:321`, probe **E2'**) |
| R8 | **채점기준** 라벨 대안 | `채점\s*기준\|채점\s*포인트\|채점\s*요소` | `:177` | 미매칭 시 **채점기준 0개** 반려 |
| R9 | **해설** 라벨 | `해\s*설` | `:178` | 미매칭 시 **해설 누락** |
| R10 | 라벨 매칭은 **선언 순 첫 매치** | `matchHeader` 가 `HEADERS` 배열을 순회하며 첫 매치 반환 | `:199-205` | `원문장` 이 `정답` 보다 앞이므로 충돌 없음 |

### 3-2. 장식 흡수 (`stripMd`) — ★ ANTONYM 과 정반대

| # | 걷어내는 것 | 원문 | file:line | 비고 |
|---|---|---|---|---|
| R11 | 강조 `*`·`**`·`***`, `__`·`___` | `.replace(/\*{1,3}/g,"").replace(/_{2,3}/g,"")` | `:145-146` | `**모범답안:**` · `*원문장*:` · `__해설:__` 전부 읽힌다(probe **E1**) |
| R12 | 선행 공백·인용 `>` | `.replace(/^[\s>]*/,"")` | `:147` | |
| R13 | 표 파이프 · 헤딩 · 불릿/번호/원문자 · 후행 파이프 | `.replace(/^\|\s*/,"")` · `.replace(/^#{1,6}\s*/,"")` · `.replace(/^(?:[-•\u2022\u00B7\u25CF\u25CB\u25AA\u25E6\u2023\u2043\u30FB]\|\d{1,2}[.)]\|[\u2460-\u2473])\s+/,"")` · `.replace(/\s*\|+\s*$/,"")` | `:148-152` | `- ` `* ` `• ` `1. ` `1) ` `①` 전부 동일 취급 |
| R14 | 코드펜스 줄은 **통째 무시** | `if (/^\s*(?:```\|~~~)/.test(rawLine)) continue;` | `:237` | ```` ```md ```` 로 감싸도 통과(probe **E18**) |
| R15 | 값을 감싼 따옴표 제거 | `unwrapQuotes`: `` /^["'`\u2018\u2019\u201C\u201D]([\s\S]+)["'`\u2018\u2019\u201C\u201D]$/ `` → `[1].trim()`. **`originalSentence`·`conditions`·`modelAnswer` 에만 적용, `scoringCriteria`·`explanation` 에는 미적용** | `:193-197, 319-323` | 값을 통째로 따옴표로 감싸도 벗겨진다 |

> ⚠ **관용이 있어도 저작 규칙은 「장식 0」이다.** 이 파서가 관대한 것과 다른 유형(ANTONYM·정본 `parser.ts`)이
> 무관용인 것은 별개 사실이며, 26유형 공용 템플릿을 만들 때 관용을 계약으로 착각하면 다른 유형에서 죽는다
> (`../recon/00-contract.md §8`).

### 3-3. 섹션 본문 규칙 — 어디서 끊기는가

| # | 섹션 | 누적 규칙 | 끊기는 조건 | file:line | 어기면 |
|---|---|---|---|---|---|
| R16 | `조건:` / `채점기준:` | 헤더 줄의 값이 있으면 그것부터 push, 이후 **빈 줄이 아닌 모든 줄**을 항목으로 push | 다음 헤더 또는 **헤딩 줄**(`/^\s*#{1,6}\s/`) | `:246-249, 258-268` | **목록 사이 빈 줄은 섹션을 끊지 않는다**(`:265`). 조건 뒤 산문 한 줄을 흘리면 그것이 **조건이 된다**(probe **E4**) |
| R17 | `원문장:` / `모범답안:` | 값이 있으면 저장, 다음 줄부터는 **공백 하나로 이어붙임** | ① 빈 줄 ② `UNKNOWN_LABEL_RE` 매칭 줄 ③ **직전까지 모은 값이 이미 문장 종결부호로 끝났을 때** | `:299-314` | 종결부호로 끝났으면 다음 줄을 흡수하지 않는다(`:308-311`) → 대안 답안 줄이 정답을 오염시키지 않음(probe **E5**) |
| R18 | 미지 라벨 감지 | `UNKNOWN_LABEL_RE = /^[^\s:\uFF1A]{1,16}\s*[:\uFF1A]/` | 단일값 섹션을 끊는다 | `:183, 300-303` | `출처:` `지문:` 류 꼬리가 정답에 섞이지 않는다 |
| R19 | `해설:` | 한국어(`/[\uAC00-\uD7A3]/`) 포함 줄만 누적. **한국어 없는 줄은 최대 2줄 보류** 후 뒤에 한국어가 오면 편입, 안 오면 폐기 | 빈 줄에서 즉시 끊김 | `:181, 191, 270-297` | 인용 줄 3줄 이상이면 지문 재출력으로 보고 섹션을 끊는다(`:283-287`). **한국어 줄은 무엇이든 삼킨다** — `오답:` 블록을 붙이면 해설이 오염된다(probe **E20**) |
| R20 | 헤딩 줄은 상태 초기화 | `if (isHeading) { state = null; }` | — | `:238, 258-262` | 형식 뒤 `## 지문` 재출력이 해설을 오염시키지 않는다(probe **E19**) |
| R21 | 최종 조립 | `conditions`/`scoringCriteria` 는 `.filter(Boolean)`, `explanation` 은 `parts.join(" ").trim()` | — | `:317-324` | 해설의 줄바꿈은 **공백 하나**로 접힌다 |

★ **R17 의 이어붙이기 때문에 「1 마크다운 = 1문항」이 이 유형에서 특히 치명적이다.**
ITEM 헤더 없이 두 문항을 이어 붙이면 `원문장`·`모범답안`이 **공백으로 접합**되고 `조건`·`채점기준`은 **합산**된다
(probe **E3**: `원문장이 2개 문장임` + `모범답안이 2개 문장임`; 두 원문장이 지문에서 인접하지 않으면 **E3'** `지문에 축자로 없음`).

### 3-4. 지문 좌표계 — 접기(fold) 비교

| # | 규칙 | 원문 | file:line | 의미 |
|---|---|---|---|---|
| R22 | 접기 좌표 = 정본 `normalizeWs` 관용 + **대소문자 접기** | `foldChar`: `‘’ʼ→'` · `“”→"` · `–—→-` · `…→...` · 그 외 `toLowerCase()` | `:41-47` | 곱슬따옴표·대시·말줄임·**대소문자**·공백 차이는 흡수된다 |
| R23 | 공백은 **전부 단일 공백으로 축약**(선행 공백 제거) | `foldForLocate` — `/\s/` 는 pendingSpace 로 접힘 | `:49-70` | `\n\n` 도 공백 하나가 된다 → **문단을 넘는 슬라이스도 매칭에 성공**(그래서 게이트가 따로 막는다, G7) |
| R24 | 위치 탐색 = 접기 좌표 `indexOf` 후 **원문 슬라이스 복원** | `locateSentenceInPassage` → `{verbatim, index, count, startsAtSentenceBoundary, endsAtSentenceBoundary}` | `:110-129` | `verbatim` 은 **지문 원문 슬라이스**라 그대로 저장하면 시험지 밑줄 `indexOf` 가 한 방에 성공 |
| R25 | 문장 끝 판정 | `SENTENCE_END_RE = /[.!?]["'\u2019\u201D)\]]*$/` | `:90` | 마침표·물음표·느낌표 + 닫는 따옴표/괄호까지 허용 |
| R26 | 문장 시작 판정 | `before.length === 0 \|\| SENTENCE_END_RE.test(before)` (`before` = 앞부분 `trimEnd()`) | `:121, 126` | 지문 첫 문장도 시작 경계로 인정 |
| R27 | 등장 횟수 | `countOccurrences` — 겹치지 않는 전수 카운트 | `:77-88, 125` | 접기 좌표 기준이므로 **대소문자만 다른 재등장도 2회로 센다** |

### 3-5. 자동 보정(0원 스냅) — `autoSnapSentenceTransform` `:346-390`

지문이 진실원이다. 원문장이 지문 축자와 **표기만** 다르면 지문 원문 슬라이스로 갈아 끼운다.

| 순서 | 동작 | 채택 조건 | corrections 문구 | file:line |
|---|---|---|---|---|
| ① 구두점 복원 | 문말 `[.!?]…` 를 떼고 `.` `!` `?` 를 차례로 붙여 재탐색 | `count === 1` **且** `endsAtSentenceBoundary` **且** 문단 경계 미포함 | `원문장에 누락된 문말 구두점을 지문 축자로 복원` | `:359-375` |
| ② 표기 보정 | 직접 매칭 슬라이스로 교체 | ①이 일어나지 **않았을 때만** · `count === 1` · `verbatim !== 입력` · 문단 경계 미포함 | `원문장을 지문 축자로 보정(표기 차이 흡수)` | `:376-386` |

**보수 가드**: 접기 좌표에서 **정확히 1회**일 때만 채택한다. 여러 번 나오거나 지문에 없으면 손대지 않고 게이트가 반려한다(probe **E13**).
보정이 일어나면 하네스가 `AUTOSNAP` **경고**로 기록한다(`qgen-core.ts:313`).
→ **스냅에 기대지 마라.** 축자로 쓰면 corrections 0 이고, 그것이 정상이다(probe **P2/P3**).

### 3-6. 첫매치·다중매치 정리

- 이 파서에는 `String.match` 첫매치가 **없다**. 전부 상태 기계다.
- 같은 라벨이 두 번 나오면 **덮어쓰기가 아니라 이어붙이기**(단일값) 또는 **누적**(목록)이다.
- 유일한 "먼저가 이긴다" 규칙은 **정본 라벨 vs 별칭**(R7)뿐이다.

---

## 4. 게이트 체크리스트

### 4-1. `gateMdSentenceTransform` 반려 사유 전수 — `src/lib/md-qgen/gate-sentence-transform.ts:239-453`

레인은 `{ difficulty: ctx.difficulty }` 만 넘긴다(`lane-sentence-transform.ts:75`) → **`requireScoringCriteria` 는 항상 기본값 `true`.**
`difficulty` 미지정 시 기본은 **KILLER**(`:244`).
상수: `ORIGINAL_MIN_WORDS=6` `ORIGINAL_MAX_WORDS=60` `MODEL_MIN_WORDS=5` `CONDITION_MIN_CHARS=3` `CONDITION_MAX_CHARS=120` (`:58-67`),
`SCORING_MIN=2` `SCORING_MAX=5` (`prompts-sentence-transform.ts:29-30`),
조건 범위 `BASIC{1,3}` `INTERMEDIATE{1,3}` `KILLER{2,4}` (`prompts-sentence-transform.ts:17-26`).

#### #1 원문장 축 (11종)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `원문장 누락 — '원문장:' 줄에 지문 문장 하나를 축자로 옮겨라` | `!q.originalSentence` | `:250-251` |
| `원문장이 지문에 축자로 없음: '{앞70자}' — 지문 문장을 한 글자도 바꾸지 말고 그대로 옮겨라` | `locateSentenceInPassage === null` | `:253-257` |
| `원문장이 지문에 {n}회 등장 — 밑줄 자리가 모호하니 지문에서 한 번만 나오는 문장을 골라라: '{앞50자}'` | `located.count > 1` | `:259-263` |
| `원문장이 지문 축자와 표기가 다름 — 지문 원문은 '{verbatim 앞70자}'` | `located.verbatim !== q.originalSentence` (스냅이 못 고친 잔여) | `:264-268` |
| `원문장이 문장 중간에서 시작함 — 문장 처음부터 통째로 옮겨라: '{앞50자}'` | `!startsAtSentenceBoundary` | `:269-273` |
| `원문장이 문장 끝(마침표·물음표·느낌표)으로 끝나지 않음 — 절만 잘라 오지 말고 문장을 통째로 옮겨라` | `!endsAtSentenceBoundary` | `:274-278` |
| `원문장이 지문의 문단 경계(빈 줄)를 넘어 걸쳐 있음 — 한 문단 안의 문장 하나만 골라라: '{앞50자}'` | `PARAGRAPH_BREAK_RE.test(located.verbatim)`, `PARAGRAPH_BREAK_RE = /\n[ \t]*\n/` | `:282-286` · `parser:328` |
| `원문장이 {n}개 문장임 — 전환 대상은 문장 하나여야 한다(밑줄 범위와 모범답안의 범위가 어긋난다): '{앞60자}'` | `countInnerSentenceBoundaries > 0` | `:289-294` |
| `원문장이 {n}단어로 너무 짧아 전환할 손잡이가 없음 — 6단어 이상인 문장을 골라라` | `0 < countWords < 6` | `:296-300` |
| `원문장이 {n}단어로 너무 김 — 60단어 이하인 문장 하나를 골라라(학생이 손으로 다시 써야 한다)` | `countWords > 60` | `:301-305` |
| `원문장에 한국어가 섞임 — 지문 영어 문장을 그대로 옮겨야 한다` | `/[가-힣]/` | `:306-308` |

#### #2 조건 축 (8종)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `조건 누락 — '조건:' 아래에 '- ' 목록으로 전환 조건을 써라` | `conditions.length === 0` | `:312-313` |
| `조건 {n}개 — KILLER 는 서로 다른 축의 조건이 2개 이상 필요하다` | `difficulty==="KILLER"` 且 `length < 2` | `:314-317` |
| `조건 {n}개 ({min}개 이상 필요)` | 그 외 난이도에서 `length < min` | `:318` |
| `조건 {n}개 ({max}개 이하로 줄여라)` | `length > max` (BASIC·INTER 3, KILLER 4) | `:320-322` |
| `조건 {i} 이 비었거나 너무 짧음: '{c}'` | `c.length < 3` — **이 조건은 이후 검사 skip** | `:326-329` |
| `조건 {i} 이 너무 김({len}자) — 한 줄 한 조건으로 줄여라: '{앞40자}…'` | `c.length > 120` | `:330-332` |
| `조건 {i} 에 한국어가 없음 — 조건은 한국어 한 줄로 쓴다: '{앞40자}'` | `!/[가-힣]/` | `:333-335` |
| `조건 {i} 이 앞 조건과 중복: '{앞40자}'` | `normalizeComparableText` 동일(소문자·곱슬따옴표·공백 정규화) | `:336-338` |

#### #3 모범답안 형상 축 (6종)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `모범답안 누락 — '모범답안:' 줄이 이 문항 정답의 유일한 진실원이다` | `!q.modelAnswer` | `:342-343` |
| `모범답안에 한국어가 섞임 — 영어 완성 문장 한 줄만 써라: '{앞50자}'` | `/[가-힣]/` | `:345-346` |
| `모범답안에 영문이 없음 — 영어 완성 문장을 써라` | 위 미해당 且 `!/[A-Za-z]/` | `:347-349` |
| `모범답안이 {n}단어로 너무 짧음 — 완성된 문장으로 써라: '{전문}'` | `0 < countWords < 5` | `:350-353` |
| `모범답안이 문장부호로 끝나지 않음(절단형 의심) — 완성 문장으로 끝맺어라: '{끝40자}'` | `!SENTENCE_END_RE.test(trim())` | `:354-358` |
| `모범답안이 {n}개 문장임 — 영어 완성 문장 **한 줄**만 써라(대안 답안·부연 금지): '{앞60자}'` | `countInnerSentenceBoundaries > 0` | `:362-367` |

#### #4~#5 전환 이행·누수 (2종)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `모범답안이 원문장과 (구두점·대소문자 제외) 동일 — 요청한 전환이 적용되지 않았다. 조건이 지시한 전환을 실제로 수행하라` | `stripForTransformCompare` 동일 — `normalizeComparableText(normalizeText(v)).replace(/[^\p{L}\p{N}\s]/gu,"").replace(/\s+/g," ").trim()` | `:371-377`, 계산 `:122-127` |
| `모범답안이 지문에 그대로 들어 있음 — 학생이 베껴 쓸 수 있다: '{앞60자}'` | `foldForTransformMatch(model).length >= 20` 且 접기 지문에 포함 | `:383-390` |

#### #6 조건 기계 강제 (3종) — `conditionComplianceIssues :188-236`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `조건 '{조건}' 은 정확히 {N}단어를 요구하는데 모범답안은 {M}단어다 — 모범답안이나 조건 중 하나를 고쳐 맞춰라` | 조건에 **범위 수식이 없고**(`/이내\|이하\|이상\|미만\|내외\|안팎\|정도\|최소\|최대\|약\s*\d\|\d+\s*[~〜–-]\s*\d+/` 미매칭) **전체 범위 한정어**가 붙은 정확 개수: `/(?:총\|전체\|전부\|모두\|통틀어\|문장\s*(?:을\|은\|를\|는\|으로\|로)\|답안?\s*(?:을\|은\|를\|는\|으로\|로))\s*(?:정확히\s*)?(\d{1,3})\s*(?:개의?\s*)?단어/` | `:200-208`, 정규식 `:71-72, 84-85` |
| `조건 '{조건}' 은 '{token}' 사용을 금지하는데 모범답안이 아직 쓰고 있다` | 역할 `forbidden` 且 (단일 토큰이면 `containsStandaloneToken` = `\btoken\b` / 아니면 `containsLoose`) | `:214-224` |
| `조건 '{조건}' 이 요구한 '{token}' 이 모범답안에 없다 — 조건을 실제로 충족하도록 다시 써라` | 역할 `required` 且 `!containsLoose(modelAnswer, token)` | `:225-231` |

**인용 토큰 추출**: `` /['‘’"“”]([A-Za-z][A-Za-z' -]{0,40}?)['‘’"“”]/g `` (`:70`) — 영문자로 시작하고 영문자·아포스트로피·공백·하이픈만, 최대 41자.
**역할 판정**(`resolveTokenRoles :169-182`):
- 인용 토큰이 **1개**면 조건 줄 **전체**로 판정 (`금지 어휘: 'X'` 처럼 신호가 앞에 오는 형태를 살리기 위함)
- **2개 이상**이면 **그 토큰 바로 뒤 ~ 다음 토큰 앞** 구간으로만 판정 (한국어는 `'X'를 쓰지 말고` 처럼 신호가 뒤에 온다)
- 금지 신호 `/(?:사용하지|쓰지|포함하지|넣지|포함시키지)\s*(?:말|마|않)|금지/` (`:86-87`)
- 필수 신호 `/반드시|포함|사용|활용|넣어|넣을|쓸\s*것|쓰시오|써야|시작|끝(?:날|나|낼|맺)|들어가/` (`:88-89`)
- 어느 쪽도 없으면 `unknown` → **검사하지 않는다**(놓치는 방향의 오차만 남긴다)

#### #7 채점기준 축 (4종)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `채점기준 {n}개 (2개 이상 필요 — 만점 형태와 0점 형태를 최소한 구분하라)` | `length < 2` | `:396-400` |
| `채점기준 {n}개 (5개 이하로 줄여라)` | `length > 5` | `:401-403` |
| `채점기준 {i} 이 비었거나 너무 짧음: '{s}'` | `s.length < 3` | `:405-409` |
| `채점기준 {i} 이 앞 항목과 중복: '{앞40자}'` | `normalizeComparableText` 동일 | `:410-412` |

#### #8 해설 축 (5종)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `해설 누락 — '해설:' 줄에 딱 2문장으로 써라` | `!q.explanation` | `:417-418` |
| `해설이 너무 짧음: '{전문}'` | `length < 20` | `:420-422` |
| `해설에 한국어가 없음 — 해설은 한국어(합니다체)로 쓴다` | `!/[가-힣]/` | `:423-425` |
| `해설이 문장 중간에서 끊김 — 합니다체 문장으로 끝맺어라(끝부분: '{끝30자}')` | `!/(?:[.!?]["'’”)\]]*\|다\|까\|요\|죠\|음\|임)$/` | `:428-432`, 정규식 `:119` |
| `해설이 문항·지문에 없는 영어 표현을 인용함(환각 인용): '{fragment}'` | `findExplanationQuotedTokenIssue` — 따옴표 인용 조각 **12자 이상**이 지문+원문장+조건+모범답안+채점기준 코퍼스에 부재 | `:435-449` · `validators/explanation-quoted-tokens.ts:35-37, 143-161` |

> **문장 경계 카운터**(`countInnerSentenceBoundaries :97-112`): `` /([.!?])["'’”)\]]*\s+(?=[A-Z"“'‘(])/g `` 매칭 수.
> 이니셜(`U.S.` `J.R.`)과 관습 약어(`Mr Mrs Ms Dr Prof Sr Jr St vs etc approx Fig No Inc Ltd Co`)는 세지 않는다(`:105-108`).

**총 39종.** 게이트는 **즉시 return 하지 않고 전부 수집**한다 — ANTONYM 과 달리 한 번에 여러 사유가 나온다.

### 4-2. `validateQuestionQuality` — 프로덕션 비차단, qbank 하네스는 차단

`qgen-core.ts:311` 이 `qualityBlocking` 으로 차단한다. 이 유형은 `filterQualityIssues` 를 정의하지 않으므로 전 코드가 산다.

| 코드 | severity | 조건 | file:line |
|---|---|---|---|
| `transform-answer-not-transformed` | **error** | md 게이트 #4 와 **동일 계산** — 이중 방어 | `dispatcher.ts:2557-2569` |
| `killer-needs-multiple-conditions` | warning | `difficulty==="KILLER"` 且 `conditions.length < 2` (md 게이트는 **반려로 승격**) | `dispatcher.ts:2541-2545` |
| `explanation-quoted-token-missing` | **error** | 해설의 12자+ 영어 인용이 문항 표면·지문에 부재. **코퍼스가 md 게이트보다 넓다**(direction·correctAnswer 포함) | `dispatcher.ts:840-843` |
| `explanation-foreign-script` | **error** | 해설에 비한글 CJK(한자·가나·`、。`). 한글 직후 괄호 병기만 예외 | `validators/explanation-foreign-text.ts:32-33, 97-104` |
| `explanation-latin-jam` | **error** | `[a-z]{2,}다` 직접 접합(`steals다`) | `validators/explanation-foreign-text.ts:39-41, 105-112` |
| `passage-boundary-spacing-corruption` / `passage-duplicate-sentence` / `passage-joined-sentence-token` | **error** | **지문 자체**의 오염 — 문장부호 뒤 공백 없음·문장 중복 등 | `dispatcher.ts:790-794` · `passage-integrity.ts:36-80` |
| `difficulty-mismatch` | warning | `question.difficulty !== requestedDifficulty` (하네스가 동기화하므로 미발화) | `dispatcher.ts:796-798` |
| `thin-killer-explanation` | warning | KILLER 且 해설 80자 미만 | `validators/misc.ts:71-74` |
| `few-key-points` | warning | KILLER 且 `keyPoints.length < 3` — **어댑터가 `keyPoints: []` 를 고정하므로 KILLER 문항마다 항상 뜬다(정상)** | `validators/misc.ts:76-81` · `adapter:66-68` |

**미발화 확인**(설계상 안전):
- `type-foreign-field` — `TYPE_SIGNATURE_FOREIGN_FIELDS` 에 이 유형 엔트리가 **없다**(`validators/misc.ts:25-33`)
- `option-count`·`correct-answer-mismatch` 계열 — `options` 키가 없어 `validateOptions` 가 즉시 return(`validators/options.ts:128-129`)
- `mid-word-marker` — `passageWith*` 필드를 만들지 않음(`validators/grammar/marked.ts:10-19`)
- `writing-answer-verbatim-in-passage` — 이 유형은 **명시 제외**(`dispatcher.ts:1038-1046`)

### 4-3. 하네스 유닛 레벨 차단 코드 — `qbank/harness/qgen-core.ts`

| 코드 | 조건 | file:line |
|---|---|---|
| `UNSUPPORTED_LANE` | 레지스트리 미등록 (ST 는 해당 없음 — `lane-registry` 등록 레인) | `:205-223` |
| `CONTAINER` | `<!-- ITEM n -->` 결측·번호 비연속·`point:` 누락·본문 공백·`settings:` JSON 파싱 실패 | `:227`, `splitItems :49-99` |
| `ITEM_COUNT` | 문항 수 < `minItems`(기본 5) | `:229-236` |
| `GATE` | `gateMdSentenceTransform` 이슈 전수 | `:306` |
| `ADAPT` | 어댑터 실패(원문장·조건·모범답안 결측) | `:307-308` |
| `POSTPROCESS` | PASSTHROUGH 실패 | `:309-310` |
| `POINT_DUPLICATE` | 유닛 내 `point:` 정규화 문자열 중복 | `:324-333` |
| **`ANSWER_DUPLICATE`** | **`diversityTargets` 중복 — 이 유형은 「원문장 앞 90자」가 유일 target** | `:335-353` · `lane-sentence-transform.ts:121-125` |

> ★ **ST 최대 제약**: `diversityTargets = [originalSentence.trim().slice(0, 90)]`.
> **유닛 안의 두 문항이 같은 문장을 전환 대상으로 삼으면 유닛 전체가 반려된다**(probe **P4**).
> 앞 90자가 같은 문장(같은 도입부의 장문 2개)도 충돌한다 — 문장 예산 계산은 §8-0.

---

## 5. adapter 산출 필드

`adaptMdSentenceTransformToAiQuestion` (`src/lib/md-qgen/adapter-sentence-transform.ts:39-73`) → `postProcessQuestion("SENTENCE_TRANSFORM", ...)` = **PASSTHROUGH**(`question-postprocess/types.ts:68-82`).

> ★ **후처리가 만들어 주는 것이 하나도 없다.** 어댑터가 완제품을 낸다. ANTONYM 처럼 `options`·`passageWithMarkers` 를
> 후처리가 합성해 주지 않는다(`adapter:5-8` 주석).

### 어댑터가 만드는 것

| 키 | 타입 | 의미 | file:line |
|---|---|---|---|
| `direction` | string | 고정 발문 `다음 문장을 주어진 조건에 맞게 바꾸어 쓰시오.` · `stemLanguage:"en"` 이면 `Rewrite the following sentence according to the given conditions.` 로 **레인이 사후 교체** | `adapter:30-31, 55` · `lane:35-36, 85-91` |
| **`originalSentence`** | string | **이 유형 고유.** 지문 축자 문장. 시험지 밑줄은 이 값으로 렌더 계층이 직접 찾는다 | `adapter:43, 56` · `source-passage-markers.ts:60, 95` |
| **`conditions`** | string[] | **이 유형 고유(CW 와 공유).** 한국어 조건. `.trim().filter(Boolean)` | `adapter:45, 57` |
| **`modelAnswer`** | string | **정답의 유일 진실원.** 영어 완성 문장 | `adapter:44, 58` |
| `scoringCriteria` | string[]? | **비면 키 자체를 만들지 않는다** — 빈 배열을 저장하면 렌더가 '채점 기준' 빈 박스를 그린다 | `adapter:46, 59-61` |
| `correctAnswer` | string | **`modelAnswer` 의 복제.** 별도 `정답:` 줄을 받지 않는 이유 | `adapter:62-64` |
| `explanation` | string | `해설:` 원문 | `adapter:65` |
| `keyPoints` | `[]` | **합성 금지**(정본 규약 — 합성문이 모델 오태깅을 학생 표면에 노출한 실사고) | `adapter:66-68` |
| `tags` / `difficulty` | `[]` / string | `difficulty` 는 `ctx.rawDifficulty` 원본 전달 | `adapter:69-70` · `lane:80-84` |

### 절대 만들면 안 되는 키 (어댑터 주석 `:13-23`)

| 금지 키 | 만들면 |
|---|---|
| **`options`** (undefined 도 아니라 **키 부재**) | `validateOptions` 가 `correctAnswer`(= 문장)를 어떤 선지와도 못 맞춰 `correct-answer-mismatch`(RELAXED_BLOCKING) |
| `blanks` | 영작형 verbatim 게이트가 `blanks[].answer` 를 훑는다(`dispatcher.ts:1049-1053`) |
| `passageWithBlank` · `acceptedAnswers` 계열 | 이 유형은 `FREE_WRITING` → `MANUAL_ONLY` 라 계약에 없다. 오답 흡수 사고의 씨앗 |

### 렌더·채점 계약

- **렌더 가능 판정** = `!!q.originalSentence && !!q.conditions` — 둘 중 하나라도 비면 카드가 안 그려진다(`question-renderers.tsx:738-739`, 어댑터 주석 `:22-23`)
- **학생 안전 필드** = `originalSentence` + `conditions` **둘뿐** (`student-safe-data.ts:354-359`) — `modelAnswer`·`scoringCriteria`·`explanation` 은 학생에게 안 보인다
- **채점** = `MANUAL_ONLY`. 정답을 그대로 써도 `NEEDS_REVIEW`, 오답도 `NEEDS_REVIEW` (`answer-spec.ts:249-250`, 리포 테스트 `:656-681`)

저장 시 `structuredData` = 위 산출 + `_typeId`/`_typeLabel`/`_generationPlan`/`difficulty` + tags (`../recon/00-contract.md §11`).
`type` = `SHORT_ANSWER` (options 가 배열이 아니므로 — `00-contract.md §11`).

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| **`difficulty`** (ITEM 헤더) | `BASIC\|INTERMEDIATE\|KILLER` | `INTERMEDIATE` (`qgen-core.ts:79`) | 3값 | **★ 직접 영향 — 이 유형의 유일한 형식 노브.** 조건 개수 범위를 결정: BASIC·INTERMEDIATE **1~3**, KILLER **2~4** (`prompts-sentence-transform.ts:17-26` → `gate:245, 314-322`). probe **P5** 로 실측 |
| `stemLanguage` | `"ko"\|"en"` | `"ko"` (`language.ts:38`) | 2값 | **md 형식 무영향.** `direction` 만 영어로 교체. 조건·채점기준·해설은 한국어 유지 (`lane:57-67, 85-91`) |
| `requireScoringCriteria` | boolean | `true` | — | **레인이 넘기지 않는다** → 항상 `true`. `answer-only` 모드는 레인 경로에서 도달 불가 (`lane:75` vs `gate:49-50, 246`) |
| `variantIndex` (하네스가 `ITEM n-1` 로 자동 주입) | number | 0 | — | **무영향.** `buildExtras` 가 참조하지 않는다 (`lane:57-67`) |
| `teacherPoints` | `{text}[]` | `[]` | — | **무영향.** `POINT_PICKER_CONFIG` 에 이 유형이 **없어**(확인: 미등재) 항상 빈 배열이고, 레인이 준수 게이트를 만들지 않는다 (`lane:15-16`) |

**적격성**: `isEligible()` 은 **항상 true** — 이 유형 전용 설정 키가 존재하지 않는다(`lane:47-51`).
`resolveQuestionTypeGenerationSettings` 에 분기가 없어 폴백이 `stemLanguage`/`optionLanguage` 만 돌려준다(`dispatchers.ts:352-360`).
`supportsGenericOptionCount` 목록에도 없다(`generic.ts:23-36`) → `optionCount`·`answerCount` 노브 없음.
**과금 축**: `QUESTION_GEN_SINGLE` (2크레딧) — 어휘 3종이 아니다(`lane:42`).
**retryEligible**: `true` (`lane:45`).

> ★ **결론: ITEM 헤더의 `difficulty:` 말고는 돌릴 노브가 없다.** `settings:` 줄을 쓸 일이 없으므로
> 다각화는 전부 **설계**로 만들어야 한다(§8-C). ANTONYM 의 `pairCount` 같은 표층 형식 노브가 이 유형에는 존재하지 않는다.

---

## 7. 함정 (전부 코드 근거 + probe 실증)

| # | 함정 | 결과 | 근거 |
|---|---|---|---|
| **T1** | 원문장을 요약·의역·짜깁기하거나 한 글자라도 고쳐 씀 | `원문장이 지문에 축자로 없음`. 학생 시험지에서 밑줄이 사라져 전환할 문장 자체가 안 보인다 | probe **E13** · `gate:253-257` · `source-passage-markers.ts:12-14` |
| **T2** | **절만 잘라 옴** (`Because …below,`) 또는 문장 중간부터 옮김 | `문장 끝(마침표…)으로 끝나지 않음` / `문장 중간에서 시작함` | `gate:269-278` · 리포 테스트 `:158-172` |
| **T3** | 두 문장을 이어 원문장으로 씀 | `원문장이 2개 문장임`. 밑줄 범위와 모범답안 범위가 어긋난다 | probe **E10** · `gate:289-294` |
| **T4** | 문단(빈 줄)을 넘는 구간을 원문장으로 | `문단 경계(빈 줄)를 넘어 걸쳐 있음`. **접기 좌표는 `\n\n` 을 공백으로 접어 매칭에 성공하므로 스스로는 못 느낀다** — 조판이 `[원문]` 블록만 제거해 원문 뒷부분이 학생 지면에 고아 텍스트로 인쇄되던 결함 | probe **E10** · `gate:282-286` · `parser:340-344` · `question-body-layout.ts:433-435` |
| **T5** | 지문에 두 번 나오는 문장을 고름(대소문자만 달라도 2회로 센다) | `지문에 {n}회 등장 — 밑줄 자리가 모호` | `gate:259-263` · `parser:77-88`(접기 좌표 카운트) |
| **T6** | 6단어 미만 문장(`This is important.`)을 고름 | `너무 짧아 전환할 손잡이가 없음`. 애초에 전환이 성립하지 않는다 | `gate:296-300` · `prompts:105-106` |
| **T7** | **대안 답안을 덧붙임** (`… Alternatively …`) | 같은 줄이면 `모범답안이 2개 문장임`, 다음 줄이면 **조용히 폐기**(파서가 안 잇는다). 채점이 MANUAL_ONLY 라 강사가 오염된 값을 채점 기준으로 읽는다 | probe **E5/E5'** · `gate:362-367` · `parser:304-311` |
| **T8** | 모범답안을 지문의 다른 문장으로 씀(또는 전환 결과가 우연히 지문에 있음) | `모범답안이 지문에 그대로 들어 있음` — 지문이 INLINE 노출이라 베껴 쓰기 과제가 된다 | probe **E11** · `gate:383-390` |
| **T9** | 구두점·대소문자만 바꾸고 전환하지 않음 | `전환이 적용되지 않았다` — md 게이트와 `validateQuestionQuality` **양쪽**에서 error | `gate:371-377` · `dispatcher.ts:2557-2569` |
| **T10** | `총 N단어로 쓸 것` 을 쓰고 실제로 세지 않음 | `정확히 N단어를 요구하는데 모범답안은 M단어다`. **`countWords` 는 하이픈·아포스트로피 결합어를 1단어로 센다**(`core.ts:336-341`) | probe **E9** · `gate:200-208` |
| **T11** | `'X'를 쓰지 말고 'Y'를 사용할 것` 처럼 금지·필수를 한 줄에 | **이제는 통과한다**(토큰별 역할 판정). 단 **인용 토큰이 1개뿐일 때는 줄 전체로 판정**하므로 `'Due to'를 쓰되 because 는 금지` 처럼 한쪽만 따옴표를 치면 역할이 뒤집힌다 | `gate:169-182` · 리포 테스트 `:826-870` |
| **T12** | 필수·금지 어휘에 **따옴표를 안 씀** | 기계 검사가 그 조건을 **아예 읽지 못한다** — 반려도 안 되고 검증도 안 된다(조용한 무검증) | `gate:70, 210-211` · `prompts:122` |
| **T13** | 조건에 한국어를 안 씀(`- use a participial phrase`) | `조건 N 에 한국어가 없음` | probe **E8** · `gate:333-335` |
| **T14** | 조건 목록 뒤에 라벨 없는 산문 한 줄을 흘림 | **그 줄이 조건이 된다** → 개수 초과/한국어 검사에 걸리거나, 걸리지 않으면 학생 화면에 이상한 조건이 출력된다 | probe **E4** · `parser:264-268` |
| **T15** | 해설이 영어 인용 줄로 끝남(줄바꿈 인용) | `해설이 문장 중간에서 끊김`. 뒤에 한국어가 오면 편입되지만(**E6'**) 없으면 반려 | probe **E6** · `gate:428-432` · `parser:282-296` |
| **T16** | 해설에서 지문에 없는 영어 구절을 12자 이상 따옴표 인용 | `환각 인용`. md 게이트와 quality 양쪽 | probe **E7** · `gate:435-449` |
| **T17** | 해설에 `…분사구문이다.` 대신 `…participle다` 류 접합 / 한자·가나 혼입 | `explanation-latin-jam` / `explanation-foreign-script` (quality error → 하네스 차단) | `explanation-foreign-text.ts:32-41` |
| **T18** | KILLER 인데 조건 1개 | `KILLER 는 서로 다른 축의 조건이 2개 이상 필요하다` (fast 의 warning 을 md 가 **반려로 승격**) | probe **P5** · `gate:314-317` |
| **T19** | 채점기준을 1개만 씀 | `채점기준 1개 (2개 이상 필요…)`. **레인 경로에서 채점기준은 면제되지 않는다** | probe **E14** · `gate:396-400` · `lane:75` |
| **T20** | 유닛 내 두 문항이 **같은 원문장** | `ANSWER_DUPLICATE` — 유닛 전체 반려 | probe **P4** · `lane:121-125` · `qgen-core.ts:345-353` |
| **T21** | 한 `.md` 에 여러 문항을 ITEM 헤더 없이 이어 붙임 | 단일값이 **공백으로 접합**되고 목록이 **합산** → `원문장이 2개 문장임`+`모범답안이 2개 문장임`(인접 문장이면) 또는 `지문에 축자로 없음`(비인접). ANTONYM 처럼 "첫 문항만 읽히는" 것이 아니라 **뒤섞인다** | probe **E3/E3'** · `parser:227-232, 299-314` |
| **T22** | 다른 유형 습관대로 `정답:` 줄을 추가 | 이 파서는 `정답:` 을 **모범답안 별칭**으로 읽는다. 정본 `모범답안:` 이 있으면 무시되지만(**E2'**), 정본 없이 `정답:` 만 쓰면 그것이 modelAnswer 가 된다 | probe **E2/E2'** · `parser:172-179, 321` |
| **T23** | 다른 유형 습관대로 `오답:` 블록을 추가 | **`오답` 은 어떤 라벨 대안에도 없다** → 헤더가 아니다. 직전 상태가 `해설` 이면 `오답:` 줄과 그 아래 한국어 줄들이 **해설에 통째로 흡수된다**(게이트는 한국어·길이·종결어미만 보므로 CLEAN 으로 통과해 학생 표면까지 나간다) | probe **E20** · `parser:172-179, 270-296` |
| **T24** | 원문장이 60단어 초과 | `너무 김 — 60단어 이하인 문장 하나를 골라라` | `gate:301-305` · 리포 테스트 `:1029-1041` |

---

## 8. 출제 포인트 다각화 축

> **선행 제약을 먼저 계산하라.** ST 는 다각화 이전에 **문장 예산**이 유닛 규모를 결정한다.
> 그리고 **표층 형식 노브가 하나도 없다**(§6) — ANTONYM 의 `pairCount` 같은 탈출구가 없다.
> 이 유형의 다각화는 **100% 설계**다.

### 8-0. ★ 문장 예산 (하드 제약, 코드 근거)

`diversityTargets = [originalSentence.slice(0,90)]`(`lane:121-125`) + `ANSWER_DUPLICATE`(`qgen-core.ts:345-353`)
→ **유닛의 모든 문항은 서로 다른 지문 문장을 전환 대상으로 삼아야 한다.**

**전환 대상 자격**(게이트 #1 전수, `gate:249-309`):

1. 지문에 **축자로 실재** + **정확히 1회**(접기 좌표 = 대소문자 무시)
2. **문장 처음부터 문말 구두점까지** 통째 — 절 조각 금지
3. **한 문장**(내부 문장 경계 0) · **한 문단** 안 (빈 줄 미포함)
4. **6단어 이상 60단어 이하**
5. 한국어 미포함
6. (설계 요건) **전환할 손잡이**가 최소 하나: 종속절·분사구·수동태·조동사·비교급·인과 접속사 (`prompts:105`)

| 유닛 규모 | 필요한 서로 다른 자격 문장 수 |
|---|---|
| 5문항 | **5** |
| 6문항 | **6** |
| 8문항 | **8** |

**저작 절차 1단계 = 예산 실사.** probe 의 `sentenceBudget()`(`_probe-SENTENCE_TRANSFORM.ts` P6) 을 그대로 써라 —
지문을 문장 단위로 쪼개 위 1~5를 결정형으로 검사한다. probe 실측: 9문장 지문에서 자격 문장 **9개**(8문항 여유),
여기에 `This is why.` 류 5단어 미만 2문장을 섞으면 자격 문장은 그대로 9개(예산 미증가).

> ⚠ **기출 지문은 보통 6~9문장이고 그중 1~2개는 5단어 미만이거나 손잡이가 없다.**
> 8문항 유닛은 대부분의 지문에서 **불가능**하다. 5문항을 기본으로 잡고, 예산이 모자라면
> 문항 수를 줄여 보고하라(품질 헌법 §9-10: 수량으로 품질을 상쇄하지 않는다).

### 8-A. 노브로 달라지는 축 (코드 근거)

| 축 | 조작 | 코드 근거 | 실효 |
|---|---|---|---|
| **A1 난이도 = 조건 개수 범위** | ITEM `difficulty:` | `prompts:17-26` → `gate:245, 314-322` | **이 유형의 유일한 형식 축.** BASIC·INTERMEDIATE 는 조건 1~3, KILLER 는 2~4. 헌법 §4 배분(5문항 = BASIC 1 / INTERMEDIATE 2 / KILLER 2)을 그대로 쓰면 조건 개수가 자동으로 `1 / 1~2 / 2~3` 로 흩어진다 |
| **A2 조건 개수 자체** | 같은 난이도 안에서 1↔2↔3 | `gate:314-322` | INTERMEDIATE 문항 2개를 조건 1개·2개로 나누면 학생이 하는 검증 횟수가 달라진다 |
| A3 발문 언어 | `settings: {"stemLanguage":"en"}` | `lane:57-67, 85-91` | 발문만 영어. **유닛 전체를 한 축으로 통일**하는 편이 낫다(문항 간 차이 축으로 쓰면 산만) |

### 8-B. ★ 전환 축 팔레트 (이 유형의 1순위 다각화 축)

프롬프트가 선언한 6축(`prompts:110-116`). **한 유닛에서 같은 축을 두 문항의 주축으로 쓰지 마라** — 헌법 §7 「1개 문항의 N개 사본」이다.

| # | 축 | 조작 | 난이도 적성 | 손잡이가 되는 문장 |
|---|---|---|---|---|
| **X1** | **태(voice)** | 능동↔수동. 행위자를 `by` 구로 남길지 지울지까지 조건이 정한다 | BASIC~INTERMEDIATE | 타동사 + 명시 행위자 |
| **X2** | **시제·상(tense/aspect)** | 단순↔완료·진행 | INTERMEDIATE | **종속절 시제 일치가 따라 움직이는 문장에서만** 의미가 있다 |
| **X3** | **절 압축(reduction)** | 관계절↔분사구·동격구, 부사절↔분사구문 | 전 난이도 | 관계절·부사절. **의미상 주어 통일이 관건** |
| **X4** | **구문 전환(construction)** | 가정법·도치·it-cleft·`so~that↔too~to`·`not only A but also B`·비교구문 | INTERMEDIATE~KILLER | 조건절·강조 대상·정도 표현 |
| **X5** | **품사 전환(nominalization)** | 동사절↔명사구(that절↔동명사구·추상명사구) | KILLER | that절 목적어 |
| **X6** | **연결 전환(connective)** | 접속사↔전치사구(`because↔because of`, `although↔despite`, `so↔therefore`) | BASIC~INTERMEDIATE | 인과·양보 접속사 |

**KILLER 규칙**(`prompts:50-54`): 조건 2개가 **서로 다른 축**이어야 한다(`X4+X3`, `X1+X3` 등). 같은 축을 두 번 쪼갠 것은 조건 2개가 아니다.
그리고 **1단계 기계적 이동만으로 풀리는 전환은 금지** — 부사절을 문두로 옮기기, 접속사만 갈아 끼우기.

### 8-C. 설계로 달라지는 축 (교육적 판단)

#### C1. 조건 설계 유형 — 출력을 몇 겹으로 조이는가 (★2순위 축)

조건의 **역할 구성**이 문항의 성격을 바꾼다. 문항마다 다른 조합을 써라.

| 유형 | 형태 | 효과 | 게이트 상호작용 |
|---|---|---|---|
| **K1 축 지정만** | `수동태로 바꿀 것` | 출력이 넓다 — BASIC 전용 | 기계 검사 없음 |
| **K2 축 + 시작어 고정** | `+ 'Facing'으로 시작할 것` | 출력이 **하나로 수렴**. 채점 폭주 차단 장치(`prompts:36`) | 필수 토큰 검사 발화(`gate:225-231`) |
| **K3 축 + 금지어** | `+ 'if'를 사용하지 말 것` | 우회 경로 봉쇄 | 금지 토큰 검사 발화(`gate:214-224`) |
| **K4 축 + 필수+금지 동시** | `'because'를 쓰지 말고 'Due to'를 사용할 것` | 축 X6 의 정석. 두 토큰 역할이 갈려 판정됨 | 토큰별 역할 판정(`gate:169-182`) |
| **K5 축 + 총 단어 수** | `+ 총 22단어로 쓸 것` | 압축·확장의 정도를 고정 | **반드시 실제로 세라**(`gate:200-208`). 하이픈 결합어 1단어 |
| **K6 축 + 부분 범위 제약** | `+ 전치사구는 4단어로 만들 것` | 문장 일부의 형태를 지정 | **검사되지 않는다**(전체 범위 한정어 없음) — 설계 자유도는 높지만 자가 검산 필수 |
| **K7 축 2개(서로 다른 축)** | `가정법 과거완료로 + 도치할 것` | KILLER 정석 | 조건 개수 하한 충족 |

> 5문항 유닛 기본 배치: `K1(BASIC) / K2·K3(INTERMEDIATE) / K4·K7(KILLER)`.

#### C2. 원문장의 담화 위치 = 학생이 다시 읽는 자리

| 위치 | 전형적 문장 형상 | 잘 붙는 축 |
|---|---|---|
| 도입 통념 | `once assumed that …, but …` | X6(대조 연결), X2(시제) |
| 기제 설명(인과) | `Because …, …` | X3(부사절→분사구문), X6 |
| 실측·근거 | `Researchers who … report that …` | X3(관계절→분사구), X1 |
| 양보·한정 | `Although …, …` | X6(`despite`), X4 |
| 반사실·조건 | `If … had been …, … would have …` | X4(도치), X3 |
| 결론·평가 | `The lesson is not that … but that …` | X5(명사구화), X4(cleft) |

**문항마다 다른 위치를 겨냥하라.** 부수 효과로 §8-0 문장 예산이 자동으로 분산되고, 학생은 지문 전체를 다시 읽게 된다.

#### C3. 의미 보존 3대 검산의 **초점**을 문항마다 옮기기 (`prompts:134-138`)

| 초점 | 설계 | 해설이 다루는 것 |
|---|---|---|
| **극성** | 부정·이중부정이 들어간 문장을 전환 대상으로 | 긍정/부정이 뒤집히지 않았는가 |
| **양상(hedge)** | `seem`·`may`·`tend to`·`usually` 가 있는 문장 | 완화 표현이 사라져 단정문이 되지 않았는가 |
| **의미역** | 행위자·대상이 분명한 타동사 문장(X1 태 전환과 궁합) | 누가 무엇을 하는가가 그대로인가 |
| **정도 한정** | `measurably`·`modest`·`faster than` 류 정도 표현 | 정도 한정이 떨어지지 않았는가 |

같은 유닛에서 해설이 매번 같은 검산을 반복하면 5문항이 아니라 1문항의 5개 사본이다.

#### C4. 채점기준의 입도(粒度)

채점기준은 2~5개다(`gate:396-403`). 개수와 성격을 문항마다 달리하라.

| 구성 | 형태 | 언제 |
|---|---|---|
| 2단(만점/0점) | 이분법 | BASIC — 판정이 자명할 때 |
| 3단(만점/부분점수/0점) | 표준 | INTERMEDIATE |
| 4~5단 | 만점 + 조건별 부분점수 2~3 + 0점 | KILLER — 조건이 2개 이상이라 부분 충족 상태가 여럿 |

**부분점수 항목이 곧 "무엇을 동치로 인정하는가" 선언**이다. 이것이 문항마다 달라야 강사 채점이 실제로 갈린다.

#### C5. 원문장 길이·복잡도 스펙트럼

| 대역 | 단어 | 성격 |
|---|---|---|
| 짧은 단문 | 6~12 | 전환 결과가 뻔하다 — BASIC 에서만, 유닛에 1개 이하 |
| 표준 복문 | 13~22 | 종속절 1개. INTERMEDIATE 주력 |
| 장문 다층 | 23~40 | 종속절 2개 이상 / 비교구문 동반. KILLER |
| 초장문 | 41~60 | 상한 근처. 학생이 손으로 다시 써야 하므로 **유닛에 1개 이하** |

#### C6. `point:` 문자열 설계 (하네스가 결정형으로 강제)

`POINT_DUPLICATE` 는 정규화(소문자·비문자 제거) 후 **완전일치**만 본다(`qgen-core.ts:315-333, 379-384`).
→ 문자열만 바꿔 우회하지 마라. `point:` 는 **C2 위치 + B 전환축 + C1 조건 유형**을 담아 쓴다.
예: `인과 기제 문장 — 부사절을 분사구문으로 압축하며 주어를 통일(절 압축 + 어휘 제약)`

### 8-D. 5문항 유닛 설계표 (probe 로 gate 0 · quality 0 실증된 실물)

지문(probe `PASSAGE`, 9문장 · 선택 과잉과 큐레이션):

| # | difficulty | 원문장(담화 위치) | 전환 축 | 조건 유형 | 조건 수 | 검산 초점 |
|---|---|---|---|---|---|---|
| 1 | BASIC | `Researchers who track purchases …`(실측 근거) | **X3** 절 압축(관계절→분사구) | K1 | 1 | 의미역 |
| 2 | INTERMEDIATE | `The effect is modest …, yet …`(누적 평가) | **X6** 연결 전환(등위→종속 양보) | K2 (`'Although'` 시작) | 1 | 극성·논리 관계 |
| 3 | INTERMEDIATE | `Designers have therefore begun to curate …`(실천) | **X1** 태 | K2+K3 (`'by designers'` 필수) | 2 | 의미역 |
| 4 | KILLER | `Because a shopper who faces thirty …`(인과 기제) | **X3 + 어휘 제약** | K7 (`'Facing'` 시작) | 2 | 정도 한정·인과 방향 |
| 5 | KILLER | `If a menu had been trimmed earlier, …`(반사실) | **X4** 구문 전환(if 생략 도치) | K7 = K2+K3 (`'Had'` 필수 + `'if'` 금지) | 2 | 반사실 양상·시제 층위 |

> 이 표는 **형식 검증용 실물**이다(probe P3: blocking 0 · qualityBlocking 0 · AUTOSNAP 0).
> 난이도 배분은 헌법 §4(5문항 = BASIC 1 / INTERMEDIATE 2 / KILLER 2)를 만족하고,
> 전환 축은 X3·X6·X1·X3·X4 로 X3 이 2회다 — 실제 저작에서는 4번을 X5(명사구화)나 X4 로 바꿔
> **5문항 5축**을 채우는 것이 목표다.

---

## 부록 — 검증 재현

```bash
./node_modules/.bin/tsx qbank/work/_probe-SENTENCE_TRANSFORM.ts   # 74/74 PASS
npx tsx scripts/_test-md-sentence-transform.ts                    # 181/181 PASS (리포 정본 회귀)
```

probe 커버리지:
**P1** 리포 픽스처 재현 · **P2** §2 골격 5문항 전 경로(gate/adapt/postProcess/quality) ·
**P3** gateUnit 5문항 유닛(blocking 0 · qualityBlocking 0 · AUTOSNAP 0) ·
**P4** `ANSWER_DUPLICATE` 실증 · **P5** 난이도별 조건 개수 상·하한 · **P6** 문장 예산 실사기 ·
**E1~E20** 파서·게이트 날붙이 22종(머리표 장식 흡수 · `정답:` 별칭 · 문항 연접 2형 · 조건 흡수 ·
대안 답안 2형 · 해설 절단/편입 · 환각 인용 · 조건 한국어 · 총N단어 2형 · 문단 경계 · 지문 통째 복사 ·
스냅 보정 2형 · 지어낸 원문장 · 채점기준 개수 · 위치탐색 · 값 다음 줄 · 섹션 순서 · 코드펜스 · 지문 재출력 · `오답:` 흡수).
