# 어휘 적절성 (VOCAB_CHOICE)

> **분류** 선택형(밑줄 마커형 객관식) · **지문변형** ○ (마커 안 단어만 치환, 마커 밖 1글자 불가) · **정답 머리표** `정답:` (라벨 `(a)`~`(j)`) · **최소 지문 길이** 코드 하드게이트 없음 / 실질 하한 = "지문 전체에서 딱 1회만 등장하는 내용어"가 `markerCount` 개 이상 (판단 하한 90단어, 8마커 이상은 140단어)

> 출처: 정찰 에이전트 `VOCAB_CHOICE` (2026-07-28). 코드 직독 + tsx 실행 검증(§검증 로그).
> 공유 계약은 [`../recon/00-contract.md`](../recon/00-contract.md), 품질 규범은 [`../quality-constitution.md`](../quality-constitution.md).

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문 전체가 그대로 제시되고 그 안의 낱말 5~10개에 밑줄이 쳐진다. 학생은 밑줄 친 단어 중 **문맥이 요구하는 의미를 배반하는 단어**를 골라낸다. 발문은 `다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?` (정답 2개 이상이면 `…적절하지 않은 것을 모두 고르시오.`) — `adapter-vocab.ts:36-41`.

**다른 유형과의 경계**

| 축 | VOCAB_CHOICE | 인접 유형 |
|---|---|---|
| 판단 대상 | 이 단어가 **이 문맥의 의미**를 지고 있는가 | `GRAMMAR_ERROR`: 이 형태가 **문법적으로** 성립하는가 |
| 선지 | 지문 안 밑줄 자리 자체(표시어가 곧 선지 텍스트) | `SYNONYM`/`ANTONYM`: 밑줄 1곳 + 별도 후보 선지 |
| 정답 근거 | 밑줄 문장이 아니라 **다른 문장의 논리·수치** | `CONTEXT_MEANING`: 밑줄 표현의 사전적 다의 해소 |
| 지문 변형 | 정답 자리 단어를 오용어로 **교체** (+ 변형 모드면 비정답도 동의어로 변장) | `BLANK_INFERENCE`: 표현을 빈칸으로 **삭제** |

출제 형상은 어법(`GRAMMAR_ERROR`)과 동형이지만 **라벨 축이 다르다** — 어법은 대문자 `(A)~(J)`, 어휘는 **소문자 `(a)~(j)`**. 정규식·스캐폴드를 어법에서 복사하면 마커가 통째로 인식되지 않는다(`parser-vocab.ts:21-22, 33`).

**이 유형이 죽는 지점**: 정답이 "밑줄 문장 하나만 읽어도 이상한 단어"이면 어휘력 시험이지 독해 시험이 아니다. 오용어는 밑줄 문장 안에서 품사·굴절·연어가 전부 맞아 자연스럽게 읽혀야 하고, 어긋남은 **다른 문장의 논리·수치·인과**로만 확정돼야 한다(`prompts-vocab.ts:96-102`).

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (SOURCE_EXACT · markerCount=5 · answerCount=1)

```md
밑줄지문:
<지문 전체를 한 글자도 바꾸지 말고 그대로 옮겨 적되, 밑줄 5곳만 [[a:표시어]] ~ [[e:표시어]] 로 감싼다. 정답 자리만 표시어가 원문과 다른 오용어이고, 나머지 4곳의 표시어는 원문 단어 그대로다. 마커 밖 텍스트는 구두점·대소문자·띄어쓰기까지 원문과 완전히 동일해야 한다.>

원형·판단축:
(a) <이 자리의 원문 단어(지문 축자 — 정답 자리도 오용어가 아니라 원문 단어)> | <n|v|j|d|c 중 한 글자>
(b) <원문 단어> | <축코드>
(c) <원문 단어> | <축코드>
(d) <원문 단어> | <축코드>
(e) <원문 단어> | <축코드>
정답: <(a)~(e) 중 정답 라벨 1개. 2개 이상이면 ", " 로 병기 — 예: (b), (d)>
고침(<정답 라벨>): <그 자리의 원문 단어 — '원형·판단축' 의 같은 라벨 원형과 한 글자도 달라선 안 된다. 정답 라벨마다 한 줄씩>
해설: <합니다체 한국어. 이 글의 논지 축 → 정답 자리가 요구하는 의미축 → 표시된 단어가 그 축을 배반하는 근거 문장(영어 원문 인용 가능) 순으로.>
오답:
(<비정답 라벨>) <이 단어가 이 문맥에서 왜 적절한지 + 학생이 어디서 헷갈리는지. 비정답 라벨마다 정확히 한 줄, 정답 라벨은 절대 넣지 않는다.>
```

qbank 유닛 파일에서는 이 골격 앞에 컨테이너 헤더가 붙는다(qbank 규약, md-qgen 규약 아님 — `qbank/harness/qgen-core.ts:47`):

```md
<!-- ITEM 1
difficulty: BASIC
point: <이 문항이 겨냥하는 출제 포인트 — 유닛 내 중복 금지>
craft: <설계 의도 한 줄>
settings: {"markerCount":5,"answerCount":1}
-->
```

### 2-2. 검증된 정상 픽스처 전문 — `scripts/_test-md-vocab.ts` (5·1 SOURCE_EXACT, `buildMd(FX5)` 산출)

```md
밑줄지문:
Urban tree canopies [[a:intensify]] summer surface heat in ways that concrete pavements never can. Shade from a mature street tree [[b:lowers]] the temperature of the asphalt beneath it by several degrees at midday. Because maintenance budgets remain [[c:scarce]], however, many councils [[d:postpone]] new planting for another fiscal year. The savings look [[e:substantial]] on a spreadsheet, yet they offset only a fraction of the cooling that is lost. Residents then pay the difference through higher electricity bills every August.

원형·판단축:
(a) mitigate | v
(b) lowers | v
(c) scarce | n
(d) postpone | d
(e) substantial | j
정답: (a)
고침(a): mitigate
해설: 이 글은 가로수 그늘이 지표 온도를 낮춘다는 결과를 바로 다음 문장에서 수치로 제시합니다. 따라서 표시된 단어가 그 방향을 배반하면 문맥상 쓰임이 적절하지 않습니다.
오답:
(b) 이 자리는 앞뒤 문장의 논리와 방향이 일치하므로 문맥상 적절합니다.
(c) 이 자리는 앞뒤 문장의 논리와 방향이 일치하므로 문맥상 적절합니다.
(d) 이 자리는 앞뒤 문장의 논리와 방향이 일치하므로 문맥상 적절합니다.
(e) 이 자리는 앞뒤 문장의 논리와 방향이 일치하므로 문맥상 적절합니다.
```

> 픽스처는 `scripts/_test-md-vocab.ts:27-98` 의 `PASSAGE`·`FX5`·`buildMd` 를 그대로 실행해 얻은 문자열이다. 이 문서 작성 시 tsx 로 재현해 확인했다.
> 같은 파일이 8·2(`FX8`, `:72-77`) · 10·3(`FX10`, `:78-84`) · 5·1 동의어 변형(`FX5V`, `:85-89`) 픽스처도 클린 통과시킨다(`:132-138`).

### 2-3. 동의어 변장 모드 골격 (`synonymVariants: true`)

계약이 **반전**된다 — 밑줄 `markerCount` 곳 **전부**의 표시어가 원문과 달라야 한다.

```md
밑줄지문:
<밑줄 5곳 전부를 원문과 다른 단어로 표시한다. 비정답 4곳 = 그 자리에 완벽히 들어맞는 근접 동의어(품사·굴절·수·시제·연어 동일), 정답 1곳 = 문맥상 틀린 단어. 마커 밖은 여전히 원문 그대로.>

원형·판단축:
(a) <지문 축자 원문 단어 — 변장 여부와 무관하게 항상 원문> | <축코드>
...
정답: (d)
고침(d): <(d) 자리의 원문 단어>
해설: ...
오답:
(a) ...
```

> ⚠ 변형 모드에서도 `원형·판단축` 의 원형은 **언제나 지문 축자 원문 단어**다. 여기에 동의어를 적으면 지문 재구성 게이트가 즉시 반려한다(`prompts-vocab.ts:140`, `gate-vocab.ts:76-79`).

---

## 3. 파서 계약 (★ 가장 중요)

진실원은 `src/lib/md-qgen/parser-vocab.ts` 다. `prompts-vocab.ts` 의 지침 문구가 느슨해도 아래 규칙이 계약이다.

### 3-0. 문서 전역 규칙

| # | 규칙 | 근거 | 어기면 사라지는 것 |
|---|---|---|---|
| R0 | **1 마크다운 문서 = 1문항.** 모든 섹션은 첫 매치만 취한다 | `parser-vocab.ts:96,98,138,166` | 2번째 문항이 조용히 소멸하거나 첫 문항을 오염 |
| R1 | 섹션 순서 고정: `밑줄지문:` → `원형…:` → `정답:` → `고침(x):` → `해설:` → `오답:` | `:96,98,166` 의 lookahead 구조 | 순서가 어긋나면 그 섹션이 통째로 빈 값 |
| R2 | 모든 머리표는 **줄머리(^)** 고정. 들여쓰기·인용(`>`)·굵게(`**`)·헤딩(`#`)·표 파이프 금지 | `parser-vocab.ts` 는 `decoration.ts` 를 **import 하지 않는다**(`:25-30`) | 머리표 전체 — 정답이면 "정답 라벨 0개"라는 **엉뚱한 사유**로 반려(음성테스트 N1 실증) |
| R3 | 마커 밖 지문은 **한 글자도** 바꿀 수 없다 | `gate-vocab.ts:76-79` + `reconstructVocabPassage`(`parser-vocab.ts:184-193`) | 「지문 재구성 불일치」 (N3 실증) |
| R4 | 비교 정규화가 흡수하는 것은 곱슬따옴표·en/em dash·`…`·연속 공백뿐 | `parser.ts:67-74` | 그 외 모든 문자 차이는 반려 |

### 3-1. `밑줄지문:` 섹션

```ts
text.match(/^밑줄지문:\s*\n([\s\S]*?)(?=^원형|^정답:)/m)?.[1]?.trim() ?? ""
```
`parser-vocab.ts:96`

- **본문은 반드시 다음 줄부터.** `\s*\n` 이 개행을 강제하므로 `밑줄지문: It is natural…` 처럼 같은 줄에 쓰면 매치 실패 → `markedPassage=""` → 「밑줄지문 누락」 즉시 반려(음성테스트 N2 실증).
- 종료는 줄머리가 `원형` 또는 `정답:` 인 줄. 지문 본문 안에 그런 줄이 생기지 않게 한다(영어 지문이므로 사실상 무해).
- `trim()` 되므로 앞뒤 빈 줄은 무해. 단 **지문 내부 개행은 그대로 보존**된다 — 원문이 한 줄이면 한 줄로 적어라(코퍼스 지문은 개행 0: `qbank/spec/corpus-stats.json` `hygiene.hasNewline: 0`).

### 3-2. 인라인 마커

```ts
export const INLINE_VOCAB_MARK_RE = /\[\[([a-j]):((?:(?!\]\]).)+)\]\]/g;
```
`parser-vocab.ts:33`

- 라벨은 **소문자 `a`~`j` 만**. `[[A:word]]` 는 마커가 아니다 → 마커 수 부족 + 재구성 불일치 동시 발화.
- 콜론 뒤 표시어는 `]]` 를 포함할 수 없고, 파싱 시 `trim()` 된다(`:132`).
- 마커 등장 순서가 곧 라벨 순서여야 한다: `(a)(b)(c)…` (`gate-vocab.ts:64-70`).
- 같은 라벨을 두 번 쓰면 `reconstructVocabPassage` 가 **첫 매치 하나만** 원형으로 되돌리므로(`parser-vocab.ts:186-191`, `new RegExp` 에 `g` 없음) 재구성 불일치 + 라벨 중복이 함께 뜬다.

### 3-3. `원형·판단축:` 섹션

```ts
text.match(/^원형[^\n]*:\s*\n([\s\S]*?)(?=^정답:)/m)?.[1] ?? ""      // 헤더
/^[([]?([a-jA-J])[)\].:]\s*(.+)$/.exec(rawLine.trim())               // 각 줄
```
`parser-vocab.ts:98, 110`

- 헤더는 `원형` 으로 시작해 **콜론으로 끝나는** 한 줄이면 된다(`원형:`·`원형·포인트:` 도 통과). 저작 표준은 `원형·판단축:`.
- 헤더 다음 줄부터 `정답:` 전까지가 메타 구역. **`정답:` 이 없으면 메타가 통째로 비어** 전 라벨의 원형이 사라진다.
- 각 줄은 `라벨 + 구분자` 로 시작해야 한다. 구분자는 `)` `]` `.` `:` 중 하나 — `(a) word | v` · `a) word | v` · `a. word | v` 전부 통과, **`a word | v` 는 통과하지 않는다**(그 줄 전체가 무시 → 「(a) 원형 누락」).
- 값은 첫 `|` 앞이 **원형**(trim), 뒤에서 **첫 알파벳 한 글자**를 소문자로 뽑아 **판단축 코드**로 쓴다(`:114-118`). `| V` · `| v(방향 반전)` 같은 드리프트는 흡수되지만 저작 표준은 `| v`.
- `|` 가 없으면 코드는 `""` → 「판단축 코드 누락」. **원형은 살아남는다**(2단 파싱, `:100-107`).
- 같은 라벨이 두 줄 있으면 **뒤 줄이 이긴다**. 단 앞 줄에 코드가 있고 뒤 줄에 없으면 앞 줄이 보존된다(`:119`).

### 3-4. `정답:` 라인

```ts
text.match(/^정답:\s*(.+)$/m)?.[1] ?? ""
const TOKEN = /^[([]?([a-jA-J])[)\].]?(?![A-Za-z])/;
const SEP = /^\s*(?:,|、|·|\/|&|\+|와|과|및|그리고|and)\s*/;
```
`parser-vocab.ts:138, 73-74`

- **선행 라벨 런만** 수집한다. `정답: (a) — (c)는 적절합니다` 의 `(c)` 는 정답이 아니다(`:66-69`).
- 복수 정답 표준 표기는 `정답: (b), (d)`. 구분자 관용은 위 `SEP` 전수.
- 대문자 라벨(`(A)`)은 소문자로 접혀 흡수되지만 저작 표준은 소문자.
- 중복 라벨은 1회만 담긴다(`:79`).
- **머리표에 장식을 붙이면 정답이 통째로 사라진다** — `**정답:**` → `answers=[]` → 「정답 라벨 0개 (설정 1개)」.

### 3-5. `고침(x):` 라인

```ts
text.matchAll(/^고침\s*[([]([a-jA-J])[)\]]\s*:\s*(.+)$/gm)   // 라벨형 (표준)
text.match(/^고침:\s*(.+)$/m)                                 // 구형 단일 (라벨형이 0개일 때만)
```
`parser-vocab.ts:142, 145-148`

- 괄호는 `()` 또는 `[]`. **괄호 없는 `고침a:` 는 매치되지 않는다.**
- 값은 그 자리의 **원형과 축자 동일**해야 한다(`gate-vocab.ts:169-173`). 누락 시 오토스냅이 원형으로 채운다(`parser-vocab.ts:291-297`).
- **위치는 `해설:` 앞.** `해설:` 뒤·`오답:` 앞에 두면 고침으로도 파싱되지만 **해설 본문에도 함께 들어가** 학생 화면에 출제 메타가 노출된다(`:166` 의 해설 캡처가 `^오답:` 까지이기 때문).
- 정답이 아닌 라벨에 고침을 붙이면 반려(`gate-vocab.ts:204-206`).

### 3-6. `해설:` / `오답:` 섹션

```ts
text.match(/^해설:\s*([\s\S]*?)(?=^오답:)/m)?.[1]?.trim()
  ?? text.match(/^해설:\s*([\s\S]+)$/m)?.[1]?.trim() ?? ""
const wrongSection = text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";
[...wrongSection.matchAll(/^[([]?([a-jA-J])[)\].:]\s*(.+)$/gm)]
  .map((m) => ({ label: parenLabel(m[1]), text: m[2].trim() }))
  .filter((w) => w.label && !answerSet.has(w.label) && markLabels.has(w.label))
```
`parser-vocab.ts:166-168, 151, 154-157`

- 해설 본문은 `해설:` **같은 줄부터** 시작해도 되고 여러 줄이어도 된다(다음 `오답:` 까지 전부).
- `오답:` 는 **단독 줄** 표준. 항목은 메타 라인과 같은 라벨 문법(`(b) …`).
- 정답 라벨 줄과 마커에 없는 라벨 줄은 **조용히 버려진다** — 개수만 맞추려고 정답 줄을 끼우면 「오답해설 누락 라벨」이 뜬다.
- 오답 항목의 라벨 대문자 표기는 흡수된다(`parenLabel`, `:61-64`).
- `answerCount == markerCount` 이면 오답 섹션 자체를 **쓰지 마라**(`prompts-vocab.ts:167-169`).

### 3-7. 오토스냅(무손실 보정) — 있어도 기대지 마라

`autoSnapVocabMarks(parsed, passage, {synonymVariants, answerCount})` — `parser-vocab.ts:235-303`

| 스냅 | 조건 | 한계 |
|---|---|---|
| (1) 비정답 원형을 마커 표시어로 교정 | **SOURCE_EXACT 전용** + 정답 축이 신뢰될 때만(`:249-252`: 정답 라벨이 전부 실재 마커 라벨 && 개수 == answerCount) | 변형 모드에선 절대 안 돈다 |
| (2) 원형 대소문자 전용 스냅 | 원형이 지문에 대소문자만 달리 **유일하게** 등장할 때(`:209-219`) | 유일하지 않으면 포기 |
| (3) 누락된 고침 채우기 | 정답 라벨의 고침이 비었을 때 원형으로 채움(`:291-297`) | 고침 값이 원형과 다르면 손대지 않는다 |

스냅 결과는 `corrections[]` 로 기록되며 qbank 하네스에서 `AUTOSNAP` **경고**로 남는다(`qgen-core.ts:313`). **경고 0을 목표로 저작하라** — 스냅이 돌았다는 것은 형식을 틀렸다는 뜻이다.

---

## 4. 게이트 체크리스트

판정의 진실원은 `parsed.gateIssues` 다(00-contract §2). 아래가 **전수**다.

### 4-1. `gateMdVocab` — `src/lib/md-qgen/gate-vocab.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `밑줄지문 누락` | `markedPassage` 가 빈 문자열 (**즉시 return**) | gate-vocab.ts:54 |
| `밑줄 마커 {n}개 ({m}개 필요)` | 지문 속 마커 수 ≠ markerCount (**즉시 return**) | :55-58 |
| `밑줄 {n}개 ({m}개 필요)` | `marks` 수 ≠ markerCount (**즉시 return**) | :59-61 |
| `밑줄 라벨이 지문 등장순 (a)(b)… 이 아님 — 실제 {…}` | 마커 라벨열 ≠ `(a)(b)(c)…` | :64-69 |
| `원형·판단축 라벨 순서 오류 — {…} 필요` | 메타 라벨열 ≠ 등장순 | :71-73 |
| `지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 원형이 지문 축자가 아님` | `normalizeWs(reconstruct(q)) !== normalizeWs(passage)` | :76-79 |
| `밑줄 라벨 중복: {(x)}` | 같은 라벨이 두 번 | :96 |
| `{(x)} 원형 누락(원형·판단축 섹션 불일치)` | 그 라벨의 메타 줄이 없음 (**그 마커 검사 중단**) | :100-102 |
| `{(x)} 표시어 누락` | 마커 안이 빈 문자열 | :104 |
| `{(x)} 판단축 코드 누락` | `\|` 뒤 코드 없음 | :106 |
| `{(x)} 판단축 코드 '{c}' 가 닫힌 집합(n·v·j·d·c) 밖` | 코드가 `VOCAB_MD_AXIS_CODES` 밖 | :107-109 |
| `{(x)} 원형가 단어 형태가 아님: '{…}'` / `{(x)} 표시어가 단어 형태가 아님: '{…}'` | 4단어 이상이거나 `()` `[]` 포함 | :112-119 |
| `{(x)} 원형이 지문에 축자로 없음(단어 경계 기준): '{…}'` | 지문 내 단어경계 일치 0회 | :123-125 |
| `{(x)} 원형 '{…}' 이 지문에 {n}회 등장 — 밑줄 자리가 모호하고 정답이 누설된다` | 2회 이상 등장 | :126-127 |
| `{(x)} 정답 원단어 '{…}' 이 밑줄 밖 지문에 대소문자만 달리 남아 있음 — 학생이 지문만 보고 정답을 역추론한다` | 정답 자리 한정, 대소문자 무시 잔존(4자 이상 단일 영단어·기능어 제외) | :128-133 / validators/vocab.ts:34-44 |
| `표적 단어 중복: '{…}'` | 두 자리의 원형이 같음(소문자 비교) | :135-137 |
| `표시어 중복: '{…}' — 학생 표면에 글자까지 같은 선지가 두 개 실린다` | 두 자리의 표시어가 같음 | :142-146 |
| `{(x)} 표시어가 정답 자리({(y)})의 원문 단어와 동일 — 정답 노출` | 표시어 == 다른 **정답** 자리의 원형 | :155-159 |
| `{(x)} 표시어가 다른 밑줄({(y)})의 원문 단어와 동일 — 그 자리도 같은 단어로 표시돼 선지가 겹치고 정답이 유일하지 않다` | 표시어 == 화면에 실제 표시 중인 다른 자리의 원형 | :159-161 |
| `{(x)} 정답 자리인데 표시어가 원형과 동일 — 오용어로 교체되지 않음` | 정답인데 미변형 | :165-167 |
| `고침{(x)} 누락` | 정답 라벨의 고침 없음 | :168-169 |
| `고침{(x)} '{f}' 이 원형 '{o}' 과 다름` | 고침 ≠ 원형(정규화 비교) | :170-172 |
| `{(x)} 동의어 변형 모드인데 표시어가 원문 그대로` | `synonymVariants=true` 인 비정답이 미변형 | :174-176 |
| `{(x)} 비정답 표시어가 원문과 다름 ('{s}' vs '{o}') — 동의어 변형 모드가 아니면 원문 그대로여야 한다` | SOURCE_EXACT 비정답이 변형됨 | :177-180 |
| `정답 라벨 {n}개 (설정 {m}개)` | 정답 라벨 수 ≠ answerCount | :183-185 |
| `정답 라벨({(x)})이 밑줄에 없음` | 정답 라벨이 마커에 없음 | :187-189 |
| `정답 라벨({…})과 오용 표시 자리({…}) 불일치` | **SOURCE_EXACT 전용** — 변형된 자리 집합 ≠ 정답 집합 | :193-203 |
| `{(x)} 은 정답이 아닌데 고침이 붙어 있음` | 비정답 라벨에 고침 | :204-206 |
| `해설 누락` | `해설:` 본문 없음 | :209 |
| `오답해설 라벨 중복: {…} — 비정답 라벨당 정확히 한 줄` | 오답 라벨 중복 | :216-219 |
| `오답해설 누락 라벨: {…} — 비정답 {n}곳 전부에 한 줄씩 필요` | 비정답 라벨 미커버 | :222-225 |
| `오답해설 {n}개 ({m}개 필요)` | 커버는 됐으나 개수 불일치 | :226-227 |
| `오답해설에 정답 라벨 포함` | wrong 에 정답 라벨(파서 필터를 우회한 경우) | :230-232 |
| `({x}) 구동사 머리만 치환해 particle 이 잔류 — 문법 파손만으로 정답이 드러난다` | 원문이 구동사인데 head 만 교체 | :237-257 / validators/vocab/substitution-seam.ts:388-424 |
| `({x}) 치환 자리 주변 문장부호가 원문과 다름 — 한 단어 교체를 벗어난 무단 변형` | 정답 치환 자리 좌/우 문장부호 불일치(SOURCE_EXACT 전용) | :258 / substitution-seam.ts:427-456 |

### 4-2. 레인 추가 게이트 — `src/lib/md-qgen/lane-vocab.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `교사 지정 표현이 밑줄에 없음: '{…}'` | `ctx.teacherPoints` 의 표현이 어떤 마커의 원형/표시어와도 포함관계가 아님 | lane-vocab.ts:67-82 |

### 4-3. 어댑터 실패 (게이트 통과 후 차단) — `adapter-vocab.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `밑줄 {n}개 (5~10개 필요)` | 마커 수 범위 밖 | adapter-vocab.ts:49-57 |
| `정답 누락` | `answers.length === 0` | :58 |
| `정답 라벨({(x)})이 밑줄에 없음` | 정답 라벨 미존재 | :60-64 |

### 4-4. 후처리 실패 — `question-postprocess/processors/vocab-choice.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `Could not locate originalWord for VOCAB_CHOICE label {x}: "{…}"` | 지문에서 원형 위치 확정 실패 | vocab-choice.ts:232-243 |
| `Could not locate all VOCAB_CHOICE marked words in the passage ({n}/{m})` | 일부 마커 위치 실패 | :272-279 |
| `VOCAB_CHOICE correctAnswer must match the inappropriate label set ({…})` | 정답 집합 ≠ isInappropriate 집합 | :281-295 |

### 4-5. qbank 하네스 유닛 게이트 — `qbank/harness/qgen-core.ts`

| 코드 | 조건 | file:line |
|---|---|---|
| `CONTAINER` | `<!-- ITEM n -->` 헤더 누락·번호 비연속·`point:` 누락·`settings:` JSON 파손·본문 공백 | qgen-core.ts:49-99 |
| `ITEM_COUNT` | 문항 수 < minItems(기본 5) | :229-237 |
| `GATE` | 위 4-1·4-2 전수 | :306 |
| `ADAPT` / `POSTPROCESS` | 4-3 / 4-4 | :307-310 |
| `POINT_DUPLICATE` | 유닛 내 `point:` 값 중복(정규화 비교) | :324-333 |
| `ANSWER_DUPLICATE` | **두 문항이 같은 밑줄 단어를 쓰면 차단** — `diversityTargets` 가 정답만이 아니라 `markedWords[].originalWord` **전량**이다 | :336-353 + lane-vocab.ts:189-200 |

### 4-6. 품질 검증기(`qualityBlocking`) — 프로덕션은 비차단, qbank 은 차단

`validateVocabChoiceQuestion` (`question-quality/validators/vocab.ts:103-422`) 의 error 코드 전수:
`vocab-marker-count` · `vocab-missing-passage-markers` · `vocab-render-marker-count` · `vocab-render-label-format` · `vocab-duplicate-label` · `vocab-inappropriate-count` · `vocab-answer-count` · `vocab-answer-label-mismatch` · `vocab-label-format` · `vocab-render-missing-label` · `vocab-render-word-mismatch` · `vocab-option-word-mismatch` · `vocab-missing-substitute` · `vocab-missing-better-word` · `vocab-not-mutated` · `vocab-better-word-mismatch` · `vocab-answer-not-rendered` · `vocab-better-word-not-source-backed` · `vocab-source-word-visible` · `vocab-nonanswer-has-better-word` · `vocab-nonanswer-source-anchor-missing` · `vocab-nonanswer-not-source-word` · `vocab-nonanswer-not-source-backed` · `vocab-variant-answer-word-exposed` · `vocab-substitution-seam-particle` · `vocab-substitution-unauthorized-mutation`

공통 error 코드 중 이 유형에서 실제로 밟기 쉬운 것:
| 코드 | 조건 | file:line |
|---|---|---|
| `explanation-quoted-token-missing` | 해설이 따옴표로 인용한 **12자 이상** 영어 조각이 지문·문항 표시면 어디에도 없음 | validators/explanation-quoted-tokens.ts:35-37, 143-161 |
| `explanation-foreign-script` | 해설에 한자·가나·중문 구두점 (한글 직후 괄호 병기만 예외) | validators/explanation-foreign-text.ts:32-34, 97-104 |
| `explanation-latin-jam` | `steals다` 류 영단어+종결어미 접합 | :39-41, 105-112 |

> ⚠ 정정: `adapter-vocab.ts:21-23` 주석은 빈칸·어법 전용 필드를 흘리면 `type-foreign-field` 가 찍힌다고 적었지만, `TYPE_SIGNATURE_FOREIGN_FIELDS` 맵에 **VOCAB_CHOICE 항목이 없다**(`validators/misc.ts:25-33`). 이물 필드는 검증기가 **잡지 않는다** — 어댑터·후처리 계약이 유일한 방어다. 마크다운 저작자는 이 필드를 만들 경로가 없으므로 실무상 무관하다.

> **경고(비차단)로만 뜨는 것**: `few-key-points`·`thin-killer-explanation`(KILLER 한정, `validators/misc.ts:66-97`). 어댑터가 `keyPoints: []` 를 **고정**으로 내므로(`adapter-vocab.ts:137`) KILLER 문항은 `few-key-points` 경고를 **구조적으로 항상** 받는다 — 정상이다. 실제 프로브에서도 KILLER 2문항에만 이 경고가 떴고 blocking 은 0이었다.

---

## 5. adapter 산출 필드

### 5-1. 어댑터 산출 (`adaptMdVocabToAiQuestion`, `adapter-vocab.ts:43-142`)

| 키 | 값 | 비고 |
|---|---|---|
| `direction` | 정답 1개 → `다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?` / 2개 이상 → `…적절하지 않은 것을 모두 고르시오.` | `:36-41,124-125`. `stemLanguage=en` 이면 레인이 영어 발문으로 교체(`lane-vocab.ts:160-169`) |
| `markedWords[]` | `{label:"(a)", originalWord, substituteWord, isInappropriate, betterWord?, surroundingText}` | **이 유형 고유.** `label` 은 **소문자 `(a)` 축 고정**(`:127-128` 주석·`:19` 경고) |
| ├ `originalWord` | 그 자리의 **지문 축자 원문 단어** — 변장 여부 무관 | 위치 탐색 키(`:94`) |
| ├ `substituteWord` | 화면 표시어. SOURCE_EXACT 비정답은 원문과 동일값 | 전 마커 필수(`:96`) |
| ├ `isInappropriate` | 정답 자리만 `true` | `:88` |
| ├ `betterWord` | **정답 자리에만** = 고침 값(없으면 원형) | `:99-102` |
| └ `surroundingText` | 원 지문 기준 앞뒤 45자 문맥 조각 | `adapter.ts:45-60`, 위치 실패 시 `""` |
| `options[]` | `{label:"(a)", text: 표시어}` | 후처리가 라벨을 `"1"~"N"`, text 를 markedWords 기준으로 덮어쓴다 |
| `vocabDisplayMode` | `"SYNONYM_VARIANT"` \| `"SOURCE_EXACT"` | **이 유형 고유** — 검증기 분기의 진실원(`:130`) |
| `correctAnswer` | `"(a)"` / `"(b), (d)"` (라벨 축) | `:131` |
| `correctAnswers` | 정답 2개 이상일 때만 배열 | `:132` |
| `wrongOptionExplanations[]` | `{label:"1"…, explanation}` — **1-based 숫자 축**(마커 인덱스+1) | `:109-119`. 라벨 축이 여기서 갈린다 |
| `explanation` | 해설 원문 | `:134` |
| `keyPoints` | **항상 `[]`** (합성 금지) | `:135-137` |
| `tags` / `difficulty` | `[]` / `ctx.rawDifficulty` | `:138-139` |

### 5-2. 후처리가 덮어쓰는 최종 `structuredData` (`processors/vocab-choice.ts`)

| 키 | 후처리 동작 | file:line |
|---|---|---|
| `passageWithMarkers` | 지문에 `__(a) 표시어__` 로 재조립 — **어댑터가 만들면 안 된다** | :249, :299 |
| `options[]` | `label` → `"1"~"N"`, `text` → markedWords 표시어로 강제 덮어쓰기 | :303-316 |
| `correctAnswer` / `correctAnswers` | 라벨 축 → **숫자 문자열**(`"1"`, `"2, 4"`) | :318-325 |
| `markedWords[]` | `word` 추가·`substituteWord` 를 표시어로 정규화·비정답 `betterWord` 제거 | :257-264 |
| `wrongOptionExplanations` | 배열 → Record 정규화 | postprocess/index.ts:167 |

이후 라우트가 `_typeId`/`_typeLabel`/`_generationPlan`/`difficulty`/`tags` 를 붙이고 `structuredData` 로 저장한다(00-contract §11).

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 | file:line |
|---|---|---|---|---|---|
| `markerCount` | number | 5 | 5~10 (`Math.round` 후 clamp) | 밑줄 개수 = 메타 줄 수 = 선지 수. 라벨은 `(a)`부터 순서대로 | settings/vocab.ts:7-11,27-32 · prompts-vocab.ts:40-44 |
| `answerCount` (별칭 `correctAnswerCount`) | number | 1 | 1~`markerCount` | `정답:` 라벨 수 · `고침(x):` 줄 수 · 오답해설 수(= marker−answer) · 발문 단수/복수 | settings/vocab.ts:13-17,34-40 · prompts-vocab.ts:46-51 |
| `synonymVariants` | boolean | `false` | — | **계약 반전**: 비정답 표시어가 원문 그대로(false) ↔ 전부 근접 동의어(true) | settings/vocab.ts:21-25 · gate-vocab.ts:174-180 |
| `stemLanguage` | `"ko"`\|`"en"` | `"ko"` | — | 마크다운 본문은 불변. 발문만 영어로 교체(어댑터 후단) · 해설은 한국어 유지 | language.ts:16,124-129 · lane-vocab.ts:117-127,160-169 |
| `optionLanguage` | `"ko"`\|`"en"` | `"en"` | — | **무효 노브** — VOCAB_CHOICE 의 토글 scope 는 `"stem"` 뿐이라 선지 언어는 구조 고정 | language.ts:64-79 |
| `difficulty` (ITEM 헤더) | `BASIC`\|`INTERMEDIATE`\|`KILLER` | `INTERMEDIATE` | — | 마크다운 형식 불변. 프롬프트 분기·품질 경고 기준만 바뀜 | qgen-core.ts:79-89 · prompts-vocab.ts:74-103 |

**설정 읽기 경로**: flat 우선 → `rawSettings["VOCAB_CHOICE"]` 중첩 폴백(`settings/shared.ts:88-115`). qbank ITEM 헤더의 `settings:` JSON 은 `{VOCAB_CHOICE: {...}}` 로 병합된다(`qgen-core.ts:369-377`).

**적격성**(`lane-vocab.ts:95-107`): `5 ≤ markerCount ≤ 10 && 1 ≤ answerCount ≤ markerCount`. 범위 밖이면 레인 자체가 거부한다. 단 `parseAndGate` 로 들어오는 값은 이미 clamp 되므로(`:45-56`) 실질 방어는 게이트가 한다.

---

## 7. 함정 (전부 코드 근거 있음 · ★는 음성테스트로 실증)

1. ★ **머리표에 장식을 붙이면 정답이 사라진다.** `parser-vocab.ts` 는 `decoration.ts` 를 import 하지 않는다(`:25-30`). `**정답:** (c)` → 「정답 라벨 0개 (설정 1개)」라는 **엉뚱한 사유**로 반려된다. 굵게·헤딩·불릿·인용·표 파이프·백틱 전부 금지.
2. ★ **`밑줄지문:` 뒤에 본문을 같은 줄에 쓰면 지문이 통째로 사라진다.** `\s*\n` 강제(`:96`) → 「밑줄지문 누락」.
3. ★ **마커 밖 1글자 편집 = 즉사.** `For example,` → `For instance,` 하나로 「지문 재구성 불일치」. 흡수되는 것은 곱슬따옴표·en/em dash·`…`·연속공백뿐(`parser.ts:67-74`).
4. ★ **유닛 내 밑줄 단어 재사용 = 유닛 전체 차단.** `diversityTargets` 는 정답이 아니라 **전 밑줄 단어**를 낸다(`lane-vocab.ts:189-200`). 문항 1의 `observe` 를 문항 2에서 다시 밑줄 치면 `ANSWER_DUPLICATE` 로 **유닛이 통째로** 반려된다(`qgen-core.ts:336-353`). 5문항×5마커 = **서로 다른 25개 단어**가 필요하다.
5. ★ **`settings` 와 실제 마커 수가 어긋나면 즉시 반려.** ITEM 헤더 `markerCount:8` 인데 마커 5개 → 「밑줄 마커 5개 (8개 필요)」. 헤더와 본문을 함께 고쳐라.
6. ★ **판단축 코드는 `n·v·j·d·c` 닫힌 집합.** 대문자·괄호·한글 설명은 파서가 흡수하지만(`:116-118`) 집합 밖 글자(`z`)는 반려(`gate-vocab.ts:107-109`).
7. ★ **오답해설은 "개수"가 아니라 "비정답 라벨 전수 커버리지"다.** 라벨 하나를 빠뜨리고 다른 라벨을 두 번 쓰면 개수는 맞아도 「오답해설 누락 라벨」+「라벨 중복」이 함께 뜬다(`gate-vocab.ts:213-228`).
8. **대문자 마커 `[[A:word]]` 는 마커가 아니다.** 이 유형은 소문자 축(`:33`). 어법 유형 골격을 복사하면 마커 0개로 즉사한다.
9. **원형 자리에 오용어를 적는 실수.** 정답 자리도 `원형·판단축` 에는 **원문 단어**를 적는다. 변형 모드에서 특히 잦다(`prompts-vocab.ts:140`) — 적으면 「지문 재구성 불일치」+「원형이 지문에 축자로 없음」이 동시에 뜬다.
10. **표적 단어는 지문 전체에서 딱 1회만 등장해야 한다.** 2회 이상이면 「원형 … 이 지문에 N회 등장」(`gate-vocab.ts:126-127`). 정답 자리는 **대소문자만 다른 잔존**(문두 대문자)도 누설로 차단된다(`:128-133`).
11. **표시어 충돌 3종**: ① 두 자리의 표시어가 같음 → 「표시어 중복」 ② 표시어 == 다른 **정답** 자리 원형 → 「정답 노출」 ③ 표시어 == 화면에 표시 중인 다른 자리 원형 → 「선지 겹침」(`:142-161`).
12. **고침은 원형과 축자 동일.** 대소문자만 달라도 스냅이 동기화해 주지만(`parser-vocab.ts:285-290`), 아예 다른 단어를 적으면 「고침(x) '…' 이 원형 '…' 과 다름」. 비정답에 고침을 붙이면 「정답이 아닌데 고침이 붙어 있음」.
13. **고침 줄을 `해설:` 뒤에 두지 마라.** 파싱은 되지만 해설 본문에 섞여 학생 화면에 출제 메타가 노출된다(`parser-vocab.ts:166`).
14. **구동사의 머리만 바꾸지 마라.** `leave out` → `include out` 같은 비존재 결합은 문법 파손만으로 정답이 드러난다 → 「particle 이 잔류」(`gate-vocab.ts:237-257`).
15. **정답 치환 자리의 문장부호를 건드리지 마라.** 좌우 인접 문장부호가 원문과 다르면 「치환 자리 주변 문장부호가 원문과 다름」(SOURCE_EXACT 한정).
16. **해설의 영어 인용은 12자 이상이면 실재해야 한다.** 검사 코퍼스에 **원 지문이 포함**되므로(`explanation-quoted-tokens.ts:122`) 지문 문장을 축자로 인용하는 것은 안전하다. 반대로 렌더 지문(`__(a) word__` 삽입본)을 통째로 인용하면 마커 때문에 불일치가 난다.
17. **해설은 한국어만.** 한자·가나 혼입, `steals다` 류 접합은 error(`explanation-foreign-text.ts`). 해설에 "무엇을 무엇으로 바꿨다"는 출제 과정을 쓰면 `vocab-explanation-meta-leak` 경고(`validators/vocab.ts:415-422`).
18. **표시어·원형은 한 단어.** 4단어 이상이거나 `()`·`[]` 포함이면 「단어 형태가 아님」(`gate-vocab.ts:112-119`).
19. **SOURCE_EXACT 에서 비정답을 살짝 손보지 마라.** 「비정답 표시어가 원문과 다름」 + 「정답 라벨과 오용 표시 자리 불일치」가 동시에 뜬다(`:177-203`).
20. **`answerCount == markerCount` 이면 `오답:` 섹션을 쓰지 마라**(요구 개수 0). 굳이 쓰면 정답 라벨 줄이 필터링돼 빈 섹션이 된다.

---

## 8. 출제 포인트 다각화 축

> 한 지문에서 이 유형으로 5~8문항을 만들 때, **무엇을 달리해야 "N개 문항"이 되는가**.

### 8-A. 하드 제약 — 이것이 다각화를 강제한다

`ANSWER_DUPLICATE` 가 **밑줄 단어 전량**을 유닛 범위에서 유일하게 만든다(`lane-vocab.ts:189-200` + `qgen-core.ts:336-353`). 즉 문항 간에 밑줄 자리가 **한 곳도 겹칠 수 없다**.

| 유닛 구성 | 필요한 서로 다른 밑줄 단어 수 | 실측 가능성 |
|---|---|---|
| 5문항 × 5마커 | 25 | 146단어 지문의 "1회만 등장하는 4자 이상 내용어" = **51개** → 여유 |
| 5문항(5·5·5·8·5) | 28 | 본 문서 프로브 실측 구성 — 통과 |
| 8문항 × 5마커 | 40 | 140단어 이상 지문에서만 안전. 부족하면 문항 수를 줄여 보고한다(불변조건 I8) |
| 5문항 × 8마커 | 40 | 180단어 이상 권장 |

**저작 절차**: ① 지문에서 1회만 등장하는 내용어 목록을 먼저 뽑는다 → ② 문항 수 × markerCount 만큼 배분한다 → ③ 배분표를 확정한 뒤 문항을 쓴다. 이 순서를 뒤집으면 마지막 문항에서 반드시 막힌다.

### 8-B. 노브로 달라지는 축 (코드 근거)

| 축 | 값 | 문항이 실제로 달라지는 지점 | 근거 |
|---|---|---|---|
| `markerCount` | 5 / 6 / 7 / 8 / 10 | 선지 수 = 소거 난도. 8곳 이상이면 학생이 전 자리를 되짚어야 한다 | prompts-vocab.ts:30-31 |
| `answerCount` | 1 / 2 / 3 | 발문이 단수↔복수로 갈리고(`adapter-vocab.ts:124-125`), 정답 K곳에 **서로 다른 오용 축**을 배분해야 한다 | prompts-vocab.ts:106-127 |
| `synonymVariants` | false / true | **표면 매칭 봉쇄**. 지문을 외운 학생이 "원문과 다른 단어 = 정답" 으로 뚫는 길이 막힌다. 같은 표적이라도 인지 작업이 완전히 달라진다 | prompts-vocab.ts:131-142 |
| `difficulty` | BASIC / INTERMEDIATE / KILLER | 근거 깊이 1문장 → 2문장 → 원거리 종합. 유닛 내 분포는 헌법 §4(5문항: B1/I2/K2) | prompts-vocab.ts:74-103 · quality-constitution.md §4 |
| `stemLanguage` | ko / en | 발문 언어만. **다각화 축으로는 약하다** — 인지 작업이 같으므로 이것만 다른 두 문항은 사본이다 | lane-vocab.ts:117-127 |

### 8-C. 설계로 달라지는 축 (교육적 판단 — 여기가 진짜 승부처)

1. **정답 자리의 오용 기제**(닫힌 5축, `prompts-vocab.ts:117-121`) — 문항마다 정답의 축을 바꾼다.
   - `v` 방향 반전 / `n` 의미장 이웃어 / `j` 정도·범위 이동 / `d` 논리 연결 배반 / `c` 연어 위반
   - 5문항이면 다섯 축을 한 번씩 쓰는 것이 기본형. 같은 축을 두 문항에서 정답으로 쓰면 "답만 다른 같은 문항"이다.
2. **논지 위치** — 정답 자리를 글의 어디에 두는가: 도입 통념 / 개념 정의 / 사례·데이터 / 반증·전환 / 결론·경고. 지문의 논증 구조를 순회하면 학생은 매번 다른 문장을 정독하게 된다.
3. **근거 거리** — 어긋남을 확정하는 근거가 ① 같은 문장 안 ② 바로 다음 문장 ③ 문단을 건너뛴 두 문장의 종합 중 어디에 있는가. 이것이 실질 난이도 축이다(헌법 §4 근거 깊이).
4. **표적 품사 대역** — 동사 중심(방향·인과) / 형용사·부사 중심(정도·평가) / 명사 중심(지시 대상·의미장). 품사가 바뀌면 학생이 동원하는 언어 지식이 바뀐다.
5. **미끼(비정답) 구성** — 비정답 4~7곳을 어떤 축으로 채우는가. "즉사 오답"(아무도 안 고르는 평범한 단어)로만 채우면 정답이 소거로 드러난다. 최소 2곳은 상위권도 되짚게 설계한다(`prompts-vocab.ts:216`).
6. **정답 자리의 표면 자연스러움** — KILLER 는 밑줄 문장 안에서 **원문보다 매끄럽게** 읽히는 오용어를 심는다(`prompts-vocab.ts:100-101`). BASIC 은 그 문장 안에서 드러나도 된다.
7. **밑줄 분포 패턴** — 전 문장 1개씩 고르게 / 논증 핵심 구간에 집중 / 앞부분 밀집 후 결론에 정답. 분포 자체가 학생의 탐색 경로를 바꾼다.
8. **정답 라벨 위치** — 정답이 매번 `(a)`·`(b)` 앞자리에 몰리면 요령으로 뚫린다. 유닛 안에서 정답 라벨을 흩어라(프롬프트도 예시 라벨을 홀수 인덱스부터 뽑아 앵커링을 피한다: `prompts-vocab.ts:53-61`).

### 8-D. 5문항 유닛 표준 배분 (권장 템플릿)

| # | difficulty | marker·answer | 변형 | 정답 오용 축 | 논지 위치 | 근거 거리 |
|---|---|---|---|---|---|---|
| 1 | BASIC | 5·1 | off | `d` 논리 연결 | 개념 정의 문장 | 같은 문장 + 인접절 |
| 2 | INTERMEDIATE | 5·1 | off | `v` 방향 반전 | 사례·데이터 | 인접 2문장 |
| 3 | KILLER | 5·1 | **on** | `v`/`n` | 반증·전환 | 원거리 2문장 종합 |
| 4 | INTERMEDIATE | 8·2 | off | `d` + `j` (축 분리) | 도입 + 결론 | 문항 내 2지점 |
| 5 | KILLER | 5·1 | off | `v` 극성 | 결론·경고 문장 | 조건절 + 결과절 |

(본 문서 §검증 로그의 프로브가 정확히 이 배분으로 blocking 0 · qualityBlocking 0 을 통과했다.)

---

## 검증 로그

- 프로브: `qbank/work/_probe-VOCAB_CHOICE.ts` — 실코퍼스 지문 `ebsi_go1_20250604-q30`(146단어)에 §2 골격으로 **5문항 유닛**을 손으로 저작해 `gateUnit`(parser → autosnap → gate → adapt → postProcess → validateQuestionQuality → POINT/ANSWER 중복)에 통과시켰다.
- 결과: `blocking 0 / qualityBlocking 0`, 전 문항 `gate 0 · adapt true · post true · qErr 0`.
  경고 2건은 `few-key-points`(KILLER 2문항) — 어댑터가 `keyPoints: []` 를 고정으로 내므로 **구조적으로 불가피**하며 비차단이다.
- 음성테스트 **7/7 검출**: 장식 머리표 · 밑줄지문 같은 줄 · 마커 밖 1글자 편집 · 유닛 내 밑줄 단어 재사용 · 오답해설 라벨 삭제 · 판단축 코드 집합 이탈 · settings↔마커 수 불일치.
- 실행: `./node_modules/.bin/tsx qbank/work/_probe-VOCAB_CHOICE.ts`
