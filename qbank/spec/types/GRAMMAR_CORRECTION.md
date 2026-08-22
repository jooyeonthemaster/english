# 문법 오류 수정 (GRAMMAR_CORRECTION)

> **분류** 어법 서술형(선지 없음) · **지문변형** ○ (마커 안 딱 한 곳만, 그 밖은 1글자도 금지) · **정답 머리표** **`정답:` 줄이 없다** — 정답의 진실원은 `고침(A): 틀린 표현 → 올바른 표현` 줄 · **최소 지문 길이** 코드 강제 없음 / 실무 하한 90단어(판단 — 유닛 5~8문항이 서로 다른 밑줄 문장을 요구, 코퍼스 p05=91)
>
> 필수 섹션 3개: `밑줄지문:` `고침(라벨):` `해설:` · 선택 1개: `허용답(라벨):`
> **금지 섹션**: `정답:` · `오답:` (파서가 **경계로만** 인식한다 — `parser-grammar-correction.ts:101-113`)
> 진실원 파일: `src/lib/md-qgen/parser-grammar-correction.ts` · `src/lib/md-qgen/gate-grammar-correction.ts`
> 검증: `qbank/work/_probe-GRAMMAR_CORRECTION.ts` — **68/68 통과** (verified=true)

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문의 한 문장(또는 절)에 밑줄이 그어져 있고, **그 밑줄 안 어딘가에 어법 오류가 하나 심어져 있다.**
학생은 ① 밑줄 안에서 **틀린 자리를 스스로 찾아내고** ② 그 자리를 **원문 형태로 직접 고쳐 쓴다.**
선지가 없으므로 소거법이 통하지 않는다 — 산출은 문자열이고, 채점은 `correctedPart`(+`acceptedAnswers`) 집합과의 대조다.

밑줄 어법(`GRAMMAR_ERROR`)·네모 어법(`GRAMMAR_CHOICE_COMBO`)과 결정적으로 다른 세 가지:

| 축 | 밑줄 어법 | 네모 어법 | **문법 오류 수정** |
|---|---|---|---|
| 과제 | 5곳 중 틀린 1곳 **고르기** | 3곳 각각 옳은 쪽 **고르기** | 밑줄 안 오류를 **찾아 고쳐 쓰기**(서술형) |
| 디코이(옳은 밑줄) | 4곳 | 0곳 | **0곳 — 모든 밑줄이 오류다** (`adapter-grammar-correction.ts:19-20`, `processors/grammar-correction.ts:43-50`) |
| 정답 표면 | 원문자 라벨 | 원문자 라벨 | **문자열** `(A) attract` 형식으로 후처리가 조립 (`processors/grammar-correction.ts:148-150`) |
| 학생이 보는 것 | 밑줄 5곳 | 네모 3곳 | **변형된 문장 하나**(displayedText) — 오류 자리는 안 알려준다 |

**핵심 설계 명제**: 밑줄은 **오류 토큰보다 훨씬 넓어야** 한다. 오류 토큰만 밑줄 치면 "여기가 틀렸다"를 이미 알려 준 것이라
과제가 성립하지 않는다. 게이트가 `밑줄이 고칠 표현 자체` · `밑줄 구간이 너무 짧음`으로 **하드 반려**한다
(`gate-grammar-correction.ts:110-119`). 반대로 두 문장을 묶으면 `너무 김(60단어 초과)`로 반려된다(`:46, 120-124`).

그리고 서술형이므로 **답이 유일해야 한다.** 두 형태가 다 성립하면 채점이 무너지므로, 게이트가
시제 단독 교체 · 수량 의미토글/논쟁쌍 · 지각·사역동사 보어 토글 · 능수동 부정사 선호를 전부 **error 로 승격 차단**한다
(`gate-grammar-correction.ts:126-154` — fast 검증기에서 이식).

---

## 2. 마크다운 골격

### 2-1. 복붙 가능한 실물 골격 (기본 = 밑줄 1곳)

````md
<!-- ITEM <n>
difficulty: <BASIC|INTERMEDIATE|KILLER>
point: <이 문항이 겨냥하는 출제 포인트 한 줄 — 유닛 내 전부 달라야 한다>
craft: <설계 메모 — 게이트 대상 아님>
-->
밑줄지문:
<지문 전문을 한 글자도 바꾸지 말고 한 줄로 그대로 옮긴다. 단 한 곳만 [[A:구간]] 으로 감싼다. 마커 안에는 원문의 그 문장(또는 절)을 통째로 넣되, 그 안의 표현 딱 한 곳만 틀린 형태로 바꿔 적는다. 바꾼 그 한 곳을 뺀 나머지는 마커 안팎 모두 원문과 완전히 동일해야 한다.>

고침(A): <마커 안에 실제로 적은 틀린 표현> → <원문에 있던 올바른 표현>
허용답(A): <올바른 표현과 완전히 동등한 다른 교정형이 있으면 " | " 로 나열(예: in which | where). 없으면 이 줄을 통째로 생략한다.>
해설: <한국어 합니다체. 그 자리가 요구하는 구조가 무엇이고 왜 표시된 형태가 비문인지. KILLER 는 80자 이상 권장.>
````

### 2-2. 밑줄 2곳 이상 — **`settings:` 로 개수를 선언해야 한다**

기본 `errorCount` 는 **1**이다(`question-type-generation-settings/grammar.ts:29`).
선언 없이 마커를 2개 쓰면 `밑줄 마커 2개 (1개 필요)` 로 즉시 반려된다(probe P3b-e 실측).

````md
<!-- ITEM <n>
difficulty: KILLER
point: <…>
settings: {"errorCount":2}
-->
밑줄지문:
<… [[A:구간]] … [[B:구간]] …>

고침(A): <틀린 표현> → <올바른 표현>
고침(B): <틀린 표현> → <올바른 표현>
해설: <(A)부터 순서대로 각 1~2문장>
````

### 2-3. 검증된 정상 픽스처 전문 (`scripts/_test-md-grammar-correction.ts:36-77` verbatim)

지문 (`PASSAGE` = S1~S6 을 공백 하나로 연결):

```
Trees planted along a busy street, whose canopies overlap by midsummer, reduce the surface temperature of the pavement beneath them. City planners who ignore this cooling effect often underestimate how much energy a neighborhood spends on air conditioning. A row of young saplings, together with a strip of grass, was installed last spring as a pilot project. Cool air settles near the shaded ground. Residents reported that the sidewalk felt noticeably cooler within two summers. The number of similar projects has grown steadily since the first measurements were published.
```

문항 마크다운 (`GOOD` — 밑줄 2곳, `errorCount:2`):

```md
밑줄지문:
[[A:Trees planted along a busy street, whose canopies overlap by midsummer, reduces the surface temperature of the pavement beneath them.]] City planners who ignore this cooling effect often underestimate how much energy a neighborhood spends on air conditioning. [[B:A row of young saplings, together with a strip of grass, were installed last spring as a pilot project.]] Cool air settles near the shaded ground. Residents reported that the sidewalk felt noticeably cooler within two summers. The number of similar projects has grown steadily since the first measurements were published.

고침(A): reduces → reduce
고침(B): were → was
허용답(A): reduce | do reduce
해설: (A)의 진짜 주어는 Trees 이므로 복수 동사 reduce 가 와야 합니다. (B)의 주어는 A row 이므로 together with 로 이어진 명사구에 끌리지 말고 단수 동사 was 를 써야 합니다.
```

> 원본 픽스처는 `mark()` 헬퍼로 마커를 합성하지만(`_test-md-grammar-correction.ts:52-69`), 전개하면 위와 정확히 같다.
> probe P1 에서 이 전개본을 그대로 `gate 0` · `재구성본 == 원 지문` 으로 재확인했다.

### 2-4. 정찰이 새로 작성해 통과시킨 골격 구현본 (probe P2 — gate 0 / snap 0 / adapt / postprocess / quality error 0)

지문:

```
Rivers that once carried timber through the valley now attract kayakers, and the towns along their banks depend on that traffic. A stretch of restored wetland, together with a chain of gravel bars, was added upstream to slow the current. Engineers who monitor the flow record the depth every morning, publish the readings online, and warn paddlers when the water rises. The number of visitors has grown steadily since the first maps were printed. Sediment carried down from the hillside settles behind the bars, forming shallow pools where young fish shelter. Residents say the river feels calmer than it did a decade ago.
```

문항 1 (KILLER, 밑줄 1곳):

```md
밑줄지문:
[[A:Rivers that once carried timber through the valley now attracts kayakers, and the towns along their banks depend on that traffic.]] A stretch of restored wetland, together with a chain of gravel bars, was added upstream to slow the current. Engineers who monitor the flow record the depth every morning, publish the readings online, and warn paddlers when the water rises. The number of visitors has grown steadily since the first maps were printed. Sediment carried down from the hillside settles behind the bars, forming shallow pools where young fish shelter. Residents say the river feels calmer than it did a decade ago.

고침(A): attracts → attract
허용답(A): attract | do attract
해설: 밑줄 친 문장의 진짜 주어는 관계절 that once carried timber through the valley 의 수식을 받는 복수 명사 Rivers 입니다. 동사 바로 앞의 valley 에 끌려 단수형을 쓰면 안 되므로 attracts 를 복수 동사 attract 로 고쳐야 합니다.
```

산출 실측: `correctAnswer = "(A) attract"` · `passageWithUnderline` 에 `__(A) …attracts…__` 1곳 ·
`direction = "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오."` · quality error 0(warning `few-key-points` 1건).

같은 지문의 나머지 4문항(전부 gate 0, 유닛 blocking 0)은 §8-4 표 참조.

---

## 3. 파서 계약 (★ 가장 중요)

파서는 **관대**하고 게이트는 **엄격**하다(`parser-grammar-correction.ts:5-6`).
**`prompts-grammar-correction.ts` 의 지시문은 참고자료일 뿐, 계약은 이 절이다.**

### 3-1. 인식하는 키워드 줄 전부

| 키워드 | 상수 | 역할 | file:line |
|---|---|---|---|
| `밑줄지문` | `PASSAGE_KEY` | 마킹된 지문 본문 | `:97` |
| `고침` | `FIX_KEY` | (틀린 표현, 올바른 표현) 두 칸 · **라벨 부착 대상** | `:98, 115` |
| `허용답` | `ACCEPTED_KEY` | 채점 동치 집합(선택) · **라벨 부착 대상** | `:99, 115` |
| `해설` | `EXPLANATION_KEY` | 한국어 해설 | `:100` |
| `정답` / `오답` | — | **계약에 없다.** 섹션 **경계로만** 인식해 지문 흡수를 막는다 | `:101-113` |

**어기면 사라지는 것**: `밑줄지문` 이 없으면 `markedPassage=""` → 게이트 **즉시 반려 `밑줄지문 누락`**(다른 검사 전부 스킵, `gate:274`).
`해설` 이 없으면 `해설 누락`(`gate:349`). `고침` 이 없으면 자리별로 `(A) 고침 줄 없음 또는 형식 오류 …`(`gate:72-77`).

### 3-2. ★ 키워드 줄 인정 조건 (이 유형 고유 — 한국어 해설 보호)

```ts
// parser-grammar-correction.ts:165-186
if (!/[:：|]/.test(tail) && !piped && !taken.label) return null;
```

공유 `keywordLineRe`(`decoration.ts:98-100`)는 콜론 없는 헤딩(`## 고침`)까지 관용하지만, 이 파서는 거기에
**구분자(`:`·`：`·`|`)가 실제로 있거나 · 값이 아예 없는 헤딩형이거나 · 라벨(`고침(A)`)이 붙은** 줄만 키워드 줄로 인정한다.
→ 그래서 해설 안의 `고침이 필요한 이유는…` · `정답은 …` 같은 **한국어 산문에서 해설이 잘리지 않는다**
(`_test-md-grammar-correction-wave2.ts:242-254` W9 · `-decoration.ts:264-272` D8).

### 3-3. 섹션 절단 규칙

| 대상 | 방식 | 정지 키워드 | file:line |
|---|---|---|---|
| `밑줄지문` | 공유 `sliceKeywordSection` (경계는 **관대한** `isKeywordHead`) | 고침·허용답·해설·정답·오답 | `parser:357-358` · `decoration.ts:141-158` |
| `해설` | 로컬 `sliceKoreanSection` (경계는 **엄격한** `readKeywordLine`) | 밑줄지문·고침·허용답·정답·오답 | `parser:200-216, 420-423` |
| `고침`/`허용답` | 줄 단위 수집(`collectCorrectionKeyLines`) — 값 줄 + **섹션 헤더형** 둘 다 | — | `parser:313-348` |

- **`밑줄지문:` 다음 줄부터 본문**이 정본이지만, **같은 줄에 붙여도 통과한다**(`밑줄지문: Rivers that…`, probe P5-d).
  (네모 어법 `parser-combo.ts:125` 가 `\s*\n` 을 강제하는 것과 다르다.)
- 지문 구간은 추가로 **드리프트 절단**을 받는다 — 계약 밖 한글 라벨 줄(`^[가-힣][^\n:：]{0,14}[:：]`)과
  수평선(`^\s*(?:[-*_=]\s*){3,}$`)에서 잘린다(`parser:226-238`). 지문은 영어라 절대 걸리지 않는다.
- **`정답:` · `오답:` · `포인트:` · `---` 를 지문과 고침 사이에 끼워 넣어도 지문에 흡수되지 않는다**(probe P5-e).
  그래도 **쓰지 마라** — 계약 밖 줄이다.

### 3-4. ★ 인라인 밑줄 마커

```
INLINE_CORRECTION_MARK_RE =
  /\[\[\s*[([]?\s*([A-Ja-j])\s*[)\]]?\s*[:：]\s*((?:(?!\]\]).)+)\]\]/g   // parser:53-54
```

| 규칙 | 내용 | 어기면 |
|---|---|---|
| 라벨 폭 | `[A-Ja-j]` — 설정 상한(5)보다 넓다. 6개 이상 마킹해도 조용히 버리지 않고 개수로 지목 | `밑줄 마커 N개` |
| 관용 표기 | `[[a:…]]` 소문자 · `[[ A:…]]`/`[[A :…]]` 공백 · `[[(A):…]]` 괄호 · `[[A：…]]` 전각 콜론 **전부 통과** (probe P5-b) | — |
| 내용 | `((?!\]\]).)+` — `.` 은 **개행을 매치하지 않는다.** 마커가 줄바꿈을 건너뛸 수 없다 | 마커 유실 → `밑줄 마커 0개` |
| 저장 라벨 | `correctionMarkLabel` 이 `(A)` 대문자로 정규화 (`parser:59-61`) | — |
| 마커 경계 장식 | `**[[A:…]]**` · `[[A:…]]__` 는 **위치 한정 규칙**으로 제거된다(`parser:253-254`) | — |
| 마커 **안** 값 | `cleanMdValue` 통과 → 강조 제거·감싼 따옴표 한 겹 제거·공백 축약 (`parser:408`) | 학생 표면(PASSTHROUGH)에 장식이 새지 않는다 |
| 계약 밖 표기 | `[[A|…]]` · `【A:…】` · `[A:…]` 는 매칭 실패 → 게이트가 `마커 표기가 [[A:구간]] 형식이 아님 — 발견된 형태: '…'` 로 **자리를 지목** (`gate:200-208`, probe P5-c) | 밑줄 전량 소실 |

### 3-5. ★ 지문 재구성 대조 — 이 유형 최강 불변식

```ts
// gate-grammar-correction.ts:326-346
const rebuilt = reconstructCorrectionPassage(q);          // 마커 → 복원 원문(sourceText)
normalizeWs(rebuilt) !== normalizeWs(passage)  → 반려
```

`sourceText` 는 **받지 않는다.** 코드가 복원한다 — `displayedText` 안의 `errorPart` **1회**를 `correctedPart` 로 되돌린 것
(`parser:441-453`). 그래서:

1. **마커 안에서 두 곳 이상을 바꾸면** 복원본이 원문과 달라 `(A) 되돌린 밑줄 구간이 지문에 축자로 없음 …` (`gate:102-107`, probe P5-g).
2. **마커 밖을 한 글자라도 바꾸면** `지문 재구성 불일치 — … — 처음 어긋나는 자리: 출력 '…' · 원문 '…'` (`gate:331-335`, probe P5-f).
3. 복원에 실패한 자리(고침 줄 누락 등)가 있으면 **센티널로 비우고 마커 밖만 부분 대조**한다 —
   그 경우 거짓 `지문 재구성 불일치` 를 얹지 않는다(`gate:326-346`, probe P5-p).

`normalizeWs`(`parser.ts:67-74`)가 흡수하는 것은 **곱슬따옴표 → 곧은따옴표 · en/em dash → `-` · `…` → `...` · 연속 공백 축약 · 양끝 trim** 뿐.
→ **대소문자·구두점·관사·복수형 어떤 차이도 반려다.** 공백 축약 덕에 **개행 삽입은 안전**(probe P5-h).

> 코퍼스 실측: 기출 지문에 개행 0건(`qbank/spec/corpus-stats.json` `hygiene.hasNewline: 0`).
> **밑줄지문은 한 줄로 쓰는 것이 정본이다.**

### 3-6. `고침` 줄 문법

```
고침(A): <틀린 표현> → <올바른 표현>
```

- **라벨 접두 관용**(`takeLabelPrefix`, `parser:140-146`): `(A):` `[A]:` `A:` `A)` `A.` `(A)`(콜론 없음) `(A) |`(표 행) · 소문자 전부.
  라벨 뒤 **경계를 반드시 요구**하므로 `고침: is → are` 의 `i`, `허용답: a | b` 의 `a` 를 라벨로 오인하지 않는다.
- **구분자 우선순위**(`splitCorrectionPair`, `parser:265-285`):
  1. 화살표 `→ ⟶ ⇒ ➔ ➞ --> -> =>`
  2. 파이프 `|`
  3. **공백으로 둘러싼** 대시 ` - ` ` – ` ` — `
  → `well-being` 처럼 표현 안의 하이픈은 공백 경계 덕에 안전하다(`_test-md-grammar-correction.ts:328-332`).
  **저작 규칙은 ` → `(공백-화살표-공백) 고정**이다. 드리프트를 스스로 만들지 마라.
- 두 칸 모두 `cleanMdValue` 세척 후 **실질 문자**(`/[^\s*_~`"'|]/`)가 있어야 짝으로 인정된다(`parser:257, 280`).
  `고침(A): ** → **` 는 짝이 아니라 → `(A) 고침 줄 없음`.
- **라벨 없는 구형 `고침:` 줄**은 **라벨 줄이 하나도 없을 때만** 첫 밑줄에 귀속된다(`parser:399`).
- **섹션 헤더형**도 읽는다(`parser:313-348`):
  ```
  고침:
  - (A) reduces → reduce
  - (B) were → was
  ```
  섹션 안 항목은 **라벨이 있어야** 항목으로 인정된다(지문 산문 오인 방지, `parser:341-345`).
  섹션 중간의 **모르는 줄은 종료 신호가 아니다**(건너뛰고 계속 수집). **진짜 키워드 줄이 오면** 수집을 끝낸다.

### 3-7. `허용답` 줄 문법 (선택 계약)

- `허용답(A): reduce | do reduce` — **파이프 구분** (`parseAcceptedValues`, `parser:287-293`).
- 각 값은 `cleanMdValue` 세척 + 실질 문자 필터. 장식 껍데기(`**`)는 채점 집합에서 배제된다.
- 스냅이 **올바른 표현을 자동 보충**하고 중복을 제거한다(`snap:89-114`). 보충되면 `corrections` 경고가 남는다.
- 게이트: 틀린 표현이 들어 있으면 `(A) 허용답에 틀린 표현 'X' 이 들어 있음 — 오답이 정답 처리된다`(`gate:179-185`).
- **동등 교정형이 정말 있을 때만 써라.** 확신 없는 변형을 넣으면 오답이 정답 처리된다.

### 3-8. 첫 매치 규칙 · 1 문서 = 1 문항

- `markedPassage` 는 **첫 `밑줄지문:` 부터 첫 정지 키워드까지**만 취한다(`parser:357-358`).
- 반면 `고침`/`허용답` 수집은 **문서 전체를 스캔**한다(`parser:313-348`).
- → **한 파일에 2문항을 붙이면** 2번째 지문은 통째로 사라지고 2번째 고침 줄만 살아남아
  `고침 줄 라벨 중복: (A) — 밑줄 하나당 고침 한 줄이다` 로 반려된다(probe P5-v 실측).
  **1 마크다운 문서 = 정확히 1문항**(00-contract §3). 유닛은 `<!-- ITEM n -->` 로 자른 뒤 넣는다.

### 3-9. 장식(마크다운 강조) — **이 유형은 관용한다. 그래도 쓰지 마라.**

`parser-grammar-correction.ts:41` 은 **`decoration.ts` 를 import 한다**(네모 어법 파서와 정반대).
probe P5-a 로 실측 확인한 통과 형태: `**밑줄지문:**` · `## 밑줄지문:` · `**고침(A):**` · `> 고침(A):` · `**해설:**` ·
`해설：` · `고침(A): **attracts** → **attract**` · `| 고침(A) | … |`(표 행) · `고침(a):` · `고침 A:` — **전부 gate 0**.

> **그래도 qbank 저작 규칙은 `장식 0` 이다**(00-contract §8). 관용 폭은 유형마다 다르고,
> 같은 습관을 다른 유형(`BLANK_INFERENCE`·`GRAMMAR_ERROR`·`GRAMMAR_CHOICE_COMBO`)에 옮기면 그 즉시 필드가 증발한다.
> 이 유형에서 장식이 통과한다는 사실은 **관용이지 계약이 아니다.**

### 3-10. 오토스냅 (0원 자동 보정 — 있어도 의존하지 마라)

`autoSnapCorrectionSegments(q)` (`snap-grammar-correction.ts:40-120`) 가 네 가지만 고친다:

| 코드 | 조건 | 동작 | file:line |
|---|---|---|---|
| S1 | `errorPart` 가 밑줄 안에서 1회가 아님 + 꼬리 구두점 제거본이 정확히 1회 | 꼬리 `[.,;:!?]+` 제거 | `:49-63` |
| S2 | `errorPart` 미검출인데 `correctedPart` 가 정확히 1회 | **화살표 좌우 교정**(실측 최다 드리프트) | `:65-77` |
| S3 | 대소문자만 다른 유일 표면이 있음 | 문두 대문자 스냅 | `:78-87` |
| S4 | 허용답 | 세척·중복 제거 + **올바른 표현 보충** | `:89-114` |

보정 내역은 `corrections[]` → 하네스 `AUTOSNAP` 경고. **1건이라도 나오면 저작 실패로 보고 원본을 고쳐라.**

---

## 4. 게이트 체크리스트 — 반려 사유 문자열 전수

`gateMdGrammarCorrection(q, passage, {errorCount, requestedDifficulty})` (`gate-grammar-correction.ts:259-352`).
**빈 배열이면 클린.** `${}` 는 런타임 치환 자리. `errorCount` 는 1~5 로 클램프된다(`:264-270`).

### 4-1. 즉시 반려 (early return — 나머지 검사 전부 스킵)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `밑줄지문 누락` | `markedPassage` 가 빈 문자열 | `:274` |
| `밑줄 마커 ${n}개 (${errorCount}개 필요)` | `[[A-J:…]]` 매치 수 ≠ errorCount | `:276-283` |
| `마커 표기가 [[A:구간]] 형식이 아님 — 발견된 형태: '${조각}…'` | 마커 0개인데 `[[…` 또는 `[`·`【`·`〔`·`<` + 라벨 + 콜론 형태가 발견됨 (위 사유와 **동반** 출력) | `:200-208, 278-282` |
| `밑줄 구간 ${n}개 (${errorCount}개 필요)` | 세그먼트 수 ≠ errorCount | `:284-286` |

### 4-2. 라벨 축

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `밑줄 라벨이 지문 등장순 ${expected} 이 아님 — 실제 ${actual}` | 마커 라벨 시퀀스가 `(A)(B)(C)…` 가 아님 | `:289-295` |
| `고침 줄 라벨 중복: ${label} — 밑줄 하나당 고침 한 줄이다` | `fixLabels` 에 중복 | `:300-303` |
| `고침${label} 이 있는데 밑줄지문에 ${label} 마커가 없음` | 유령 라벨 | `:305-307` |

### 4-3. 자리별 검사 (`gateSegment`, 라벨을 항상 문다)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `${label} 밑줄 구간이 비어 있음` | `displayedText` 공백 | `:68-71` |
| `${label} 고침 줄 없음 또는 형식 오류 — "고침${label}: <틀린 표현> → <올바른 표현>" 한 줄이 필요하다(받은 값: 틀린 표현 '${e}' · 올바른 표현 '${c}')` | `errorPart` 또는 `correctedPart` 부재 | `:72-77` |
| `${label} 틀린 표현과 올바른 표현이 같음: '${e}'` | 정규화 후 동일 | `:78-81` |
| `${label} 틀린 표현 '${e}' 이 밑줄 구간 안에 없음 — 마커 안에 실제로 적은 형태 그대로 써라` | 단어경계 매치 0회 | `:83-88` |
| `${label} 틀린 표현 '${e}' 이 밑줄 구간에 ${n}회 등장 — 고칠 자리가 유일하지 않으니 밑줄을 옮기거나 더 긴 표현으로 지정하라` | 매치 2회 이상 | `:90-94` |
| `${label} 밑줄 구간의 원문을 복원할 수 없음` | `deriveCorrectionSourceText` null | `:97-101` |
| `${label} 되돌린 밑줄 구간이 지문에 축자로 없음 — 마커 안에서 바꾼 곳이 한 군데가 아니거나 원문을 고쳐 썼다: '${sourceText}'` | 복원본이 지문에 없음 | `:102-107` |
| `${label} 밑줄이 고칠 표현 자체 — 문장 또는 절 단위로 넓혀라` | `sourceText === correctedPart` | `:110-112` |
| `${label} 밑줄 구간이 너무 짧음(${n}단어) — 최소 ${need}단어 이상의 문장·절로 넓혀 오류 자리가 드러나지 않게 하라` | `wordCount(displayedText) < max(5, wordCount(errorPart)+3)` | `:113-119` |
| `${label} 밑줄 구간이 너무 김(${n}단어) — 한 문장 또는 한 절까지만 밑줄 쳐라` | 60단어 초과 | `:46, 120-124` |

### 4-4. 정답 시비 게이트 (fast 검증기 error 승격 이식)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `${label} 시제 단독 교체('${c}' ↔ '${e}')는 문맥상 둘 다 성립해 복수정답 시비가 된다 — 검증된 변형(수일치·관계사·분사 능수동·형부 등)으로 바꿔라` | 규칙동사 현재↔과거(`realizes↔realized`) 또는 `did↔do/does` | `:127-131` · `validators/grammar/combo.ts:41-70` |
| `${label} 수량 표현 정답 시비 — ${메시지}` | ① 의미토글(`few↔a few`, `little↔much`, `some↔any`, `each↔every` …) ② 논쟁쌍(`fewer↔less`, `amount↔number`) ③ 양용 명사(fish/data/species …) 앞 가산성 붕괴 ④ `much↔very`·이중비교급이 진짜 비교급 자리가 아님 | `:132-138` · `validators/grammar/shared.ts:154-338` |
| `${label} 준동사 보어 토글 — ${메시지}` | 지각·사역동사(see/watch/hear/feel/notice/observe/help) + 목적어 뒤 `to V ↔ V-ing ↔ 원형` 토글 / 목적어통제동사 뒤 분사 재파싱 | `:139-147` · `shared.ts:697-766` |
| `${label} 능동·수동 부정사 선호(to gain ↔ to be gained)는 정답 자리로 쓸 수 없다` | `/\bto\s+(?:be\s+)?(?:gain|gained|lose|lost)\b/` | `:148-154` |
| `${label} KILLER 인데 구조 하중이 없는 얇은 표적 — 관계절·삽입구·병렬·수량 주어구·도치 중 하나를 품은 12단어 이상 문장으로 밑줄을 옮겨라` | `requestedDifficulty === "KILLER"` **AND 지문에 12단어 이상 문장이 실재** AND `isThinKillerGrammarCorrectionTarget` | `:155-176` · `validators/grammar/correction.ts:8-21` |

> **KILLER 얇은 표적 판정 로직**(`correction.ts:8-21`): `sourceText+displayedText+errorPart+correctedPart` 에
> 킬러 구조 패턴(관계사+be, with+분사, when/while/if+분사, not only/both/from…but/and,
> the number of/one of/most of…+be, make/find it 보어+to V, 도치, of/with/who/which/that…+be)이
> **하나라도 있으면 얇지 않다**(`shared.ts:420-429`). 없고 `sourceText` 가 10단어 미만이거나
> 단순 수일치 플립인데 `sourceText` 에 `of/which/that/who/with/including/along with/as well as/not only/both/between/from` 이
> 하나도 없으면 **얇다**. ⚠ 지문에 12단어 이상 문장이 하나도 없으면 이 검사는 **아예 돌지 않는다**(도달 불가 요구 방지, `:155-162`).

### 4-5. 허용답 (있을 때만)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `${label} 허용답에 틀린 표현 '${e}' 이 들어 있음 — 오답이 정답 처리된다` | 허용답 중 하나가 `errorPart` 와 동일 | `:179-185` |
| `${label} 허용답에 올바른 표현 '${c}' 이 빠져 있음` | 허용답이 비어 있지 않은데 `correctedPart` 미포함 (**스냅이 먼저 보충하므로 실사용에서는 드묾**) | `:186-191` |

### 4-6. ★ 지문 무결성 · 해설

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 마커 안에서 두 곳 이상을 바꿨다 — 처음 어긋나는 자리: 출력 '${got}…' · 원문 '${want}…'` | 전 자리 복원 성공 + `normalizeWs(rebuilt) !== normalizeWs(passage)` | `:329-335` |
| `지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르다: '${조각}…'(${라벨들} 는 고침 줄을 읽지 못해 대조에서 제외했다)` | 복원 실패 자리가 있을 때의 부분 대조 | `:336-346` |
| `해설 누락` | `explanation` 빈 값 | `:349` |

### 4-7. 레인 추가 게이트

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `교사 지정 표현이 밑줄 구간에 없음: '${text}'` | `ctx.teacherPoints` 가 있는데 어떤 구간의 `sourceText`/`displayedText` 와도 **양방향 부분일치**하지 않음 | `lane-grammar-correction.ts:87-112` |

> qbank 기본 경로에서는 `teacherPoints: []` 라 발화하지 않는다(`qgen-core.ts:122`).

### 4-8. 어댑터 실패 (게이트 통과 후)

| 메시지 | 조건 | file:line |
|---|---|---|
| `밑줄 구간 ${n}개 (1~5개 필요)` | 세그먼트 수가 범위 밖 | `adapter-grammar-correction.ts:62-70` |
| `${label} 밑줄 구간의 원문을 복원할 수 없음(틀린 표현이 구간 안에 유일하게 존재해야 한다)` | 복원 실패 | `:73-83` |

### 4-9. 후처리 실패 (`processors/grammar-correction.ts`)

| 메시지 | 조건 | file:line |
|---|---|---|
| `GRAMMAR_CORRECTION must have 1-5 underlined segments and every underlined segment must have isError=true` | 구간 수 5 초과 또는 `isError!==true` 가 하나라도 있음 | `:42-50` |
| `Could not locate underlined sourceText in the passage: "…"` | `findExpressionInPassage` 실패 | `:90-102` |
| `Every underlined segment must include sourceText` / `Every error underlined segment must include errorPart and correctedPart` | 필드 부재 | `:58-65, 136-146` |

### 4-10. 품질 검증기 error (qbank 는 차단 — `validators/grammar/correction.ts:25-189`)

`grammar-correction-underline-count` · `-missing-passage-underline` · `-underline-count-mismatch` · `-error-count` ·
`-missing-corrected-part` · `-missing-source-text` · `-missing-displayed-text` · `-missing-error-part` · `-not-mutated` ·
`-correction-mismatch` · `-corrected-part-not-in-source-text` · `-error-part-not-in-displayed-text` ·
`-displayed-not-mutated` · `-underline-too-narrow` · `-underlined-segment-short` · `-displayed-text-not-rendered` ·
`-source-text-not-source-backed` · `-debatable-infinitive` · `-tense-only-error` · `-perception-toggle` ·
`-killer-thin-segment` · `-answer-mismatch` · `-sentence-not-source-backed` · `grammar-quantity-*`

> **md 게이트를 통과하면 이 코드들은 전건 무발화한다**(probe P2-i·P3-b 실측: error 0). 같은 축을 게이트가 먼저 잡기 때문이다.
> ⚠ `-killer-thin-segment` 만은 예외 축이 있다 — 검증기는 **지문에 긴 문장이 있는지 묻지 않는다**(`correction.ts:160-174`).
> 짧은 문장만 있는 지문에서 KILLER 를 요청하면 **게이트는 통과하는데 품질 검증기가 error 를 낼 수 있다.**
> → **짧은 지문에서는 KILLER 를 배정하지 마라.**

### 4-11. 유닛(qbank 하네스) 차단 — 문항 하나로는 보이지 않는다

| 코드 | 조건 | file:line |
|---|---|---|
| `CONTAINER` | `<!-- ITEM n -->` 헤더 누락·번호 비연속·`point:` 누락·본문 없음·`settings` JSON 파싱 실패 | `qgen-core.ts:49-99` |
| `ITEM_COUNT` | 문항 수 < `minItems`(기본 5) | `:229-236` |
| `POINT_DUPLICATE` | 두 문항의 `point:` 값이 정규화 후 동일 | `:325-333` |
| **`ANSWER_DUPLICATE`** | 두 문항의 `diversityTargets` 가 겹침 = **어떤 `sourceText`(복원된 원문 밑줄 구간) 가 재사용됨** | `:336-353` · `lane-grammar-correction.ts:191-202` |
| `ADAPT` / `POSTPROCESS` | 어댑터·후처리 실패 | `:307-310` |
| `QUALITY:*` | `validateQuestionQuality` 의 error | `:311` |

> **`ANSWER_DUPLICATE` 가 이 유형의 진짜 난관이다.** 같은 문장에 **다른 오류**를 심어도
> 복원된 `sourceText` 가 같으므로 중복으로 차단된다(probe P4-b 실측).

### 4-12. 경고(비차단)이지만 알아야 할 것

| 코드 | 조건 | file:line |
|---|---|---|
| `few-key-points` | KILLER 인데 `keyPoints.length < 3` — **어댑터가 항상 `[]` 라 KILLER 전건 발생**(구조적, 무시) | `validators/misc.ts:76-81` · `adapter-grammar-correction.ts:137-139` |
| `thin-killer-explanation` | KILLER 해설 80자 미만 | `validators/misc.ts:71-73` |
| `AUTOSNAP` | 스냅 보정 발생 | `qgen-core.ts:313` · `snap:40-120` |

---

## 5. adapter 산출 필드

`adaptMdGrammarCorrectionToAiQuestion(q, passage, difficulty)` (`adapter-grammar-correction.ts:57-144`) → 후처리 → `structuredData`.

| 키 | 타입 | 의미 | 근거 |
|---|---|---|---|
| `direction` | string | 1구간: `"다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오."` / 2구간 이상: `"다음 글의 밑줄 친 (A), (B)에서 각각 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오."` | `:43-55` |
| **`underlinedSegments[]`** | array(1~5) | **이 유형 고유.** 아래 7키 | `:109-129` |
| ├ `label` | `"(A)"~"(E)"` | 대문자 고정 축(후처리가 재정규화) | `:110` · `processors:196-201` |
| ├ **`sourceText`** | string | **코드가 복원한 원문 축자 구간** = `diversityTargets` 의 진실원 | `parser:441-453` · `lane:191-202` |
| ├ `displayedText` | string | 학생이 보는 **변형본**(마커 안 텍스트) | `:110-113` |
| ├ **`isError`** | `true` **고정** | 하나라도 false 면 후처리 통째 실패 | `:118` · `processors:42-50` |
| ├ `errorPart` | string | 밑줄 안에 숨긴 틀린 표현 | `:120` |
| ├ `correctedPart` | string | **정답**(원문에 있던 올바른 표현) | `:121` |
| ├ `acceptedAnswers?` | string[] | **있는 구간에만 실린다.** exam-scoring answer-spec 이 소비하는 채점 동치 집합(T8a) | `:122-124` · `processors:279-298` |
| └ `surroundingText` | string | 재구성본에서 ±(contextAround), 위치 확정 실패 시 `""` | `:127` · `adapter.ts:45-64` |
| `explanation` | string | md `해설:` 원문 | `:136` |
| `keyPoints` | `[]` | **항상 빈 배열.** 합성 금지 → `few-key-points` warning 상수 발생 | `:137-140` |
| `tags` | `[]` | 〃 | `:141` |
| `difficulty` | string | ctx 난이도 그대로 | `:142` |
| **`passageWithUnderline`** | string | **후처리 산출** — `__(A) <변형본>__` 재조립. 어댑터가 만들면 안 된다 | `processors:108-125` |
| **`correctAnswer`** | string | **후처리 산출** — `"(A) attract, (B) publish"` 형식 | `processors:148-150` |
| `errorPart` / `errorParts` / `correctedPart` / `correctedParts` | string / string[] | **후처리 평탄화** | `processors:127-134, 159-162` |
| `passageWithMarkers` · `markedExpressions` · `errorLabel` · `sentenceWithError` · `sentenceWithErrorMarked` · `errorSentenceForQuestionText` | `undefined` | 후처리가 **명시적으로 지운다** | `processors:164-169` |

**어댑터가 절대 만들지 않는 것**: `options` · `wrongOptionExplanations`(선지 없는 서술형) ·
`blanks` · `passageWithBlank` · `originalExpression`(`adapter:21-24`).
저장 시 `type = SHORT_ANSWER` 가 된다(`options` 가 배열이 아니므로, `question-generation-persistence.ts:242-263`).

> 참고: `TYPE_SIGNATURE_FOREIGN_FIELDS`(`validators/misc.ts:25-33`)에 **GRAMMAR_CORRECTION 항목은 없다** —
> 즉 `type-foreign-field` 는 이 유형에서 발화하지 않는다. 그래도 md 에서 그런 필드를 만들 경로 자체가 없다.

---

## 6. 생성 노브

`resolveQuestionTypeGenerationSettings("GRAMMAR_CORRECTION", raw, difficulty)` (`dispatchers.ts:138-155`).

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| **`errorCount`** (별칭 `answerCount`) | number | **1** (`grammar.ts:29`) | **1~5**, `Math.round` 후 클램프 (`prompts-grammar-correction.ts:37-44`) | ★ **유일한 형식 노브.** 마커 개수 = 고침 줄 개수 = 라벨 `(A)`~`(E)` 개수를 **정확히** 결정한다. 불일치 시 `밑줄 마커 N개 (M개 필요)` 즉시 반려. ITEM 헤더 `settings: {"errorCount":2}` 로 지정(probe P3b) |
| `pointFocus` | boolean | **false** (raw=null 일 때, `shared.ts:104-115`) / UI 저장 기본은 `errorCount` 만 (`dispatchers.ts:511-514`) | true·false | **본문 형식 무영향.** true 면 프롬프트에 「출제 포인트 집중」 블록이 붙어 오류 포인트를 기출 최빈출 톱셋 `b,d,k,c,g,f,e,h` 로 제한(`lane:60-71` · `grammar-point-catalog.ts:255`). **저작 시 포인트 선택 정책 신호** |
| `stemLanguage` | `"ko"\|"en"` | `"ko"` (`language.ts:30`) | 두 값 | **무효.** 레인이 언어 블록을 의도적으로 싣지 않고(`lane:144-148`), 후처리 `normalizeGrammarCorrectionDirection` 이 「밑줄」+「고쳐/수정/바르게」가 없는 발문을 한국어 기본 발문으로 되돌린다(`processors:237-247`). **다각화 축이 아니다** |
| `optionLanguage` | `"ko"\|"en"` | `"ko"` | — | **무효.** 선지가 없고 toggle scope 가 `stem`(`language.ts:75-79`) |
| `difficulty` (ITEM 헤더) | `BASIC\|INTERMEDIATE\|KILLER` | `INTERMEDIATE` (`qgen-core.ts:79`) | 3값 | ★ **`KILLER` 일 때만** 얇은 표적 게이트가 켜진다(`gate:160-176`). `few-key-points`·`thin-killer-explanation` warning 축도 KILLER 전용 |
| `variantIndex` / `variantCount` | number | 0 / 1 | — | 하네스가 `ITEM n` 에서 자동 주입(`qgen-core.ts:247-248`). 저작물 형식 무영향 |
| `teacherPoints` | `{text}[]` | `[]` | — | 있으면 지정 표현이 **어떤 밑줄 구간과 양방향 부분일치**해야 한다(`lane:87-112`). qbank 기본 경로는 항상 `[]` |

> **요약: 형식을 바꾸는 노브는 `errorCount` 하나뿐이다.** 나머지 다양성은 전부 §8 의 설계 축에서 나온다.

---

## 7. 함정 (코드 근거 있는 것만)

1. **`errorCount` 를 선언하지 않고 밑줄을 2개 이상 치는 것.** 기본값이 1이라 `밑줄 마커 2개 (1개 필요)` 로 즉사한다
   (`grammar.ts:29` · `gate:276-283`, probe P3b-e). 2곳 이상이면 ITEM 헤더에 `settings: {"errorCount":N}` 필수.
2. **`정답:` 줄을 쓰는 것.** 이 유형에 정답 줄은 **존재하지 않는다**(철칙 1 — `prompts-grammar-correction.ts:178`).
   파서는 경계로만 인식해 조용히 무시하므로 반려조차 안 되지만, **정답이 두 곳에 적히면 검수·수리가 갈린다.**
   `오답:` 섹션도 마찬가지(선지가 없다).
3. **마커 안에서 두 곳을 바꾸는 것.** 복원이 원문과 어긋나 `되돌린 밑줄 구간이 지문에 축자로 없음`(`gate:102-107`, probe P5-g).
   **한 밑줄 = 한 변형**이다.
4. **마커 밖 지문을 1글자라도 손대는 것.** `지문 재구성 불일치` + 어긋난 자리 지목(`gate:329-335`, probe P5-f).
   원문의 곱슬따옴표·en dash·`…` 를 곧은 형태로 바꾸는 것만 안전하다(`normalizeWs`).
5. **오류 토큰만 밑줄 치는 것.** `밑줄이 고칠 표현 자체` + `너무 짧음` 동시 발화(`gate:110-119`, probe P5-i/j).
   밑줄 단어 수 ≥ `max(5, 틀린 표현 단어 수 + 3)`.
6. **두 문장을 한 밑줄로 묶는 것.** 60단어 초과 시 `너무 김(91단어)`(`gate:46, 120-124`, probe P5-w).
7. **틀린 표현이 밑줄 안에 2회 등장.** 관사·전치사처럼 흔한 토큰을 오류로 쓰면 걸린다 —
   `틀린 표현 'a' 이 밑줄 구간에 2회 등장`(`gate:90-94`). 단어 경계 매칭이므로 `settles` 안의 `settle` 은 세지 않는다(`parser:485-488`).
8. **시제만 바꾼 오류.** `attract↔attracted`, `did↔do/does` → `시제 단독 교체` 하드 반려(`gate:127-131`, probe P5-k).
   불규칙 과거(`spend↔spent`)는 게이트 미커버지만 **품질상 여전히 금지**(같은 시비가 발생한다).
9. **수량 표현 오류.** `few↔a few`, `fewer↔less`, `amount↔number`, `many↔much`(양용명사 앞), `much↔very`(비교급 아닌 자리)
   → `수량 표현 정답 시비`(`gate:132-138`, probe P5-l).
10. **지각·사역동사 목적격보어 자리.** `watch them struggle↔struggling` → 둘 다 정문 → `준동사 보어 토글`(`gate:139-147`).
11. **KILLER 인데 짧고 평범한 문장을 표적으로.** `얇은 표적` 반려(`gate:160-176`, probe P5-m).
    같은 표적도 INTERMEDIATE 면 통과한다(probe P5-n) — **난이도를 낮추거나 표적을 옮겨라.**
    ⚠ 반대로 **짧은 문장만 있는 지문**에서 KILLER 를 쓰면 게이트는 통과하는데 품질 검증기가
    `grammar-correction-killer-thin-segment` error 를 낸다(`correction.ts:160-174`).
12. **가짜 영어 형태를 오류로 쓰는 것.** `unfriendlily` · `more better` · `informations` · `childs` — 게이트는 못 잡지만
    실재하지 않는 형태는 어법 오류가 아니라 오타다(`prompts:83`). `friendly`·`costly` 류 -ly 형용사를 부사로 바꾸는 것도 금지.
13. **원문에 없던 제3의 표현을 정답으로.** `correctedPart` 는 **원문에 실재한 그 표현**이어야 한다 —
    아니면 복원본이 지문과 안 맞아 반려(`gate:102-107`).
14. **허용답에 틀린 표현을 넣는 것.** `허용답에 틀린 표현 … 오답이 정답 처리된다`(`gate:179-185`, probe P5-r).
    확신 없는 동등형도 넣지 마라 — 채점 집합에 그대로 저장된다(`processors:286-298`).
15. **해설을 영어로 쓰거나 영단어에 한국어 어미를 붙이는 것.** 해설은 한국어 합니다체만(헌법 §5, `prompts:110`).
    영어 인용은 따옴표 안에.
16. **한 파일에 여러 문항.** 2번째 지문이 통째로 사라지고 `고침 줄 라벨 중복: (A)` 만 뜬다(probe P5-v).
17. **유닛 내에서 같은 문장을 두 번 밑줄 치는 것.** 오류를 다르게 심어도 `sourceText` 가 같아 `ANSWER_DUPLICATE`
    로 **유닛 전체가 차단**된다(`qgen-core.ts:336-353`, probe P4-b). **이 유형 최다 예상 사고.**
18. **오토스냅에 의존.** `corrections` 가 나오면 통과가 아니라 사고 직전이다(화살표 좌우 뒤집힘·꼬리 구두점·허용답 누락).
19. **장식을 습관으로 만드는 것.** 이 유형은 통과하지만(§3-9) 다른 유형에서 같은 습관이 필드를 증발시킨다. **장식 0.**
20. **라벨을 지문 등장순으로 안 붙이는 것.** `(A)(B)(C)…` 고정 —
    `밑줄 라벨이 지문 등장순 (A)(B) 이 아님`(`gate:289-295`).

---

## 8. 출제 포인트 다각화 축 — 한 지문에서 5~8문항 만들기

### 8-0. 이 유형의 하드 제약 (설계 전에 먼저 계산하라)

- 문항 하나가 **`errorCount` 개의 밑줄 구간(sourceText)** 을 소비한다. 기본 1.
- `ANSWER_DUPLICATE` 는 **유닛 전체에서 sourceText 재사용을 0으로** 요구한다(`qgen-core.ts:336-353`).
  → **errorCount=1 의 5문항 = 서로 다른 밑줄 구간 5개**, 8문항이면 8개.
  같은 문장에 다른 오류를 심는 것은 **중복이다**(복원본이 같다).
- 밑줄 구간은 **5단어 이상 60단어 이하**, 그리고 `틀린 표현 단어 수 + 3` 이상.
- `point:` 값도 유닛 내 전부 달라야 한다(`POINT_DUPLICATE`).
- KILLER 로 배정할 문항은 **구조 하중(관계절·삽입구·병렬·수량 주어구·도치·가목적어) 있는 12단어 이상 문장**이 필요하다.

> **먼저 지문 문장을 전부 번호 매기고, 각 문장에 (단어 수 · 구조 하중 유무 · 심을 수 있는 포인트)를 태깅하라.**
> 문장 수가 5개 미만이면 **절 단위로 쪼개** 밑줄 구간을 늘릴 수 있다(같은 문장의 서로 다른 절은 sourceText 가 다르다).
> 그래도 재고가 부족하면 문항 수를 줄여 보고한다(헌법 §9-10).
>
> ⚠ 단, `diversityTargets` 는 `sourceText.slice(0, 90)` 로 비교한다(`lane:191-202`) —
> **한 문장의 앞 90자가 같은 두 구간**(예: 문장 전체 vs 그 문장의 90자 넘는 첫 절)은 중복으로 잡힌다. 뒤쪽 절을 써라.

### 8-1. 노브로 달라지는 축 (코드 근거)

| 축 | 값 | 코드 근거 | 무엇이 실제로 달라지는가 |
|---|---|---|---|
| **errorCount** | 1~5 (`settings`) | `grammar.ts:25-29` · `gate:264-283` | ★ **표층 형식 축.** 1곳(단답 서술형) ↔ 2~3곳(복합 교정). 발문 문자열도 바뀐다(`adapter:52-55`). 8문항이면 1곳 6개 + 2곳 2개처럼 섞어라 — 단 2곳 문항은 밑줄 재고를 2개 먹는다 |
| **난이도** | BASIC / INTERMEDIATE / KILLER | `prompts:61-75` · `gate:160-176` · 헌법 §4(5문항=1/2/2, 8문항=2/3/3) | BASIC: 주어-동사가 붙어 있는 완결 판정(최소 8단어). INTERMEDIATE: 수식어 한 겹 건너뛰기(최소 10단어). KILLER: **구조 하중 필수 + 판정 단서가 오류 자리에서 멀리**(최소 12단어) |
| **pointFocus** | ON / OFF | `lane:60-71` · `grammar-point-catalog.ts:255` | ON: 오류 포인트를 `b`관계사 `d`수일치 `k`부정사·동명사 `c`분사 `g`대명사 `f`형부 `e`태 `h`목적격보어 톱셋으로 제한. OFF: 핵심 10선 전체(`prompts:47-48`) |
| stemLanguage / optionLanguage | — | `lane:144-148` · `processors:237-247` | **무효. 다각화 축이 아니다** |

### 8-2. 설계로 달라지는 축 (교육적 판단 — 여기가 승부처)

**축 ① 오류 포인트 코드** (가장 강한 축 · 헌법 §6 G01~G20 과 정합)
프롬프트 핵심 10선(`prompts:47-48`): `a`정동사·준동사 · `b`관계사(that·what) · `c`분사 능수동 · `d`수일치 · `e`태 ·
`f`형용사·부사 · `g`대명사 · `h`목적격보어 · `i`병렬 · `k`부정사·동명사.
**헌법 §6-6: 유닛 내 5문항은 오류 지점 코드가 전부 달라야 한다.** 코드가 겹치면 답만 다른 사본이다.

**축 ② 판정 단서의 거리와 방향** — KILLER 의 생명(`prompts:70-74`)
- **왼쪽**(진짜 주어의 핵 · 선행사) / **오른쪽**(by 행위자구 · than 절 · 목적어 유무) /
  **앞머리**(등위의 시작점) / **문장 끝**(절의 완전성)
- 문항마다 단서 방향을 바꾼다. 같은 방향이 반복되면 학생은 한 가지 스캔 습관만 익힌다.

**축 ③ 밑줄 구간의 논지 위치** (헌법 §7-1)
도입 통념 / 전환점 / 기제 설명 / 사례 / 결론 — 밑줄 문장이 어느 자리인지 문항마다 달리한다.
`ANSWER_DUPLICATE` 때문에 어차피 문장이 달라야 하므로 **이 축은 공짜로 따라온다** — 대신 **의도적으로 분산**하라
(앞 3문장에 5문항이 몰리면 뒤 절반은 안 읽어도 풀린다).

**축 ④ 밑줄 폭과 절 선택**
- 문장 통째(BASIC 권장) / 주절만 / 종속절만 / 삽입구를 품은 중간 구간.
- 같은 문장이라도 **다른 절**을 밑줄 치면 sourceText 가 달라 중복이 아니다 — 문장 재고가 부족할 때의 정공법.
- 폭이 넓을수록 오류 자리 탐색 비용이 오르고, 좁을수록 답이 노출된다(하한 `max(5, 오류단어+3)`).

**축 ⑤ 답의 형태(학생이 쓰는 문자열)**
- 1단어 굴절(`attract` · `has` · `settles`) / 2~3단어 구(`in which` · `to be gained` 는 금지) /
  기능어 교체(`that → what`, `which → where`).
- **판단이 걸린 최소 단위(보통 1~3단어)** 로 잡아라 — 절 전체를 답으로 만들면 옮겨 적기 시험이 된다(`prompts:99`).
- 답 길이를 문항마다 섞으면 채점 부담도 분산된다.

**축 ⑥ 허용답(`허용답:`) 유무**
- 동등 교정형이 실재하는 자리(`in which | where`, `attract | do attract`)를 1~2문항에 의도적으로 배치하면
  "정답이 하나로만 표기되지 않는다"는 것을 학생에게 가르칠 수 있다.
- 나머지는 허용답 줄을 **생략**해 단일 정답 자리로 둔다. 무분별한 허용답은 오답을 정답 처리한다(§7-14).

**축 ⑦ 오류의 "로컬 자연스러움" 강도**
- 강함: 오류 자리만 보면 자연스럽고 먼 단서로만 반증된다(KILLER).
- 중간: 소리 내어 읽으면 걸리지만 개념을 알아야 이름 붙일 수 있다(INTERMEDIATE).
- 약함: 개념을 알면 즉시 보인다(BASIC).
- **INTERMEDIATE 이상에서 "소리 내어 읽었을 때 즉시 귀에 걸리면 자리를 옮겨라"**(`prompts:69`).

**축 ⑧ 해설이 짚는 구조**
주어의 핵 추적 / 선행사와 절의 완전성 / 태의 의미관계 / 등위 범위 / 수식 대상 —
해설이 서로 베낀 문장이면 다각화 심사(렌즈 ⑤)에서 major.

### 8-3. 유닛 설계 절차 (권장)

1. 지문 문장을 번호 매기고 각 문장에 **(단어 수 · 구조 하중 · 심을 수 있는 포인트 코드 2~3개)** 를 태깅한다.
2. 12단어 이상 + 구조 하중 있는 문장을 골라 **KILLER 슬롯**에 먼저 배정한다(헌법 §4 배분: 5문항=1/2/2).
3. 남은 문장을 INTERMEDIATE·BASIC 에 배정한다. 문장이 모자라면 **절 단위로 분할**한다.
4. 문항마다 **서로 다른 포인트 코드**를 배정하고(축 ①), 단서 방향(축 ②)이 겹치지 않게 조정한다.
5. §7 금지 변형(시제 단독·수량·지각동사·가짜 형태·제3의 표현)에 걸리지 않는지 **각 오류를 개별 검산**한다.
6. `point:` 를 "무엇을 묻는가" 한 줄로 쓰되 **문자열이 서로 겹치지 않게** 한다.
7. `qbank/work/_probe-*.ts` 와 동일한 방식으로 `gateUnit` 을 돌려 `blocking 0` · `qualityBlocking 0` 을 확인한 뒤 제출한다.

### 8-4. 실증 유닛 (probe P3 — 5문항 blocking 0 / qualityBlocking 0)

| # | 난이도 | 밑줄 문장 | 오류(심은 것 → 답) | 포인트 | 단서 방향 |
|---|---|---|---|---|---|
| 1 | KILLER | S1 (관계절이 주어와 동사를 갈라놓음, 21단어) | `attracts → attract` | `d` 수일치 | 왼쪽(진짜 주어 Rivers), 동사 앞 단수 valley 가 유인 |
| 2 | KILLER | S2 (`together with` 삽입구, 19단어) | `were → was` | `d` 수일치(다른 기제) | 왼쪽(주어 핵 A stretch) — 부가구는 주어가 아니다 |
| 3 | INTERMEDIATE | S3 (세 동사 등위, 21단어) | `publishing → publish` | `i` 병렬 | 앞머리(등위의 시작점 record) |
| 4 | BASIC | S4 (`The number of` 주어, 13단어) | `have → has` | `d` 수량 주어구 | 왼쪽 근거리 — 교과서 확인형 |
| 5 | INTERMEDIATE | S5 (과거분사구 후치 수식, 17단어) | `settle → settles` | `c`+`d` 분사 수식 뒤 수일치 | 왼쪽(수식어 걷어내기) |

> 이 유닛은 축 ① 이 완전히 분산되진 않았다(수일치 계열 3문항) — **실전에서는 코드를 전부 달리하라**(헌법 §6-6).
> 위 표는 게이트 통과를 실증하는 최소 예시이며, 품질 A등급 예시가 아니다.

추가 실증: **밑줄 2곳 문항**(`settings: {"errorCount":2}`) 도 blocking 0 ·
`correctAnswer = "(A) attract, (B) publish"` · 발문이 `(A), (B)` 를 열거함을 확인했다(probe P3b).

---

## 부록 A. 검증 기록

```
$ ./node_modules/.bin/tsx qbank/work/_probe-GRAMMAR_CORRECTION.ts
P1   리포 픽스처 gate 0 · 재구성본 == 원 지문                              PASS (2건)
P2   골격 구현본 gate 0 / snap 0 / sourceText 복원 / adapt / postprocess /
     correctAnswer '(A) attract' / passageWithUnderline / 발문 / quality
     error 0 / lane.parseAndGate 0 / resolved.errorCount=1 + 5문항 개별     PASS (16건)
P3   qbank 컨테이너 5문항 유닛 blocking 0 · qualityBlocking 0               PASS (2건)
P3b  settings {"errorCount":2} 승차 · correctAnswer · 발문 ·
     settings 없으면 '밑줄 마커 2개 (1개 필요)' 반려                        PASS (5건)
P4   같은 문장 재밑줄 → ANSWER_DUPLICATE 차단                               PASS (2건)
P5   계약 경계 실측 41건 (장식 관용 12 · 마커 표기 6 · 머리표 동일줄 1 ·
     지문 경계 4 · 재구성 3 · 밑줄 폭 2 · 정답 시비 4 ·
     고침/해설/허용답 7 · 문서 구조 2)                                     PASS (41건)
                                                                  68/68 통과
```

참고 경고(무해): `few-key-points` — KILLER 문항 전건 발생(어댑터가 `keyPoints: []` 고정, `adapter:137-139`).
