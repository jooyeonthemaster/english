# 문맥상 의미 (CONTEXT_MEANING)

> **분류** 어휘(단일 밑줄 객관식) · **지문변형** △ (마크다운에 지문을 싣지 않는다 — 후처리가 `__단어__` 를 지문에 주입) · **정답 머리표** `정답:` (라벨 `①`~`⑧`) · **최소 지문 길이** md-qgen 코드 하드게이트 **없음** / 유닛 계획 자가보정 하한 = **55단어·3문장**(`qbank/spec/unit-plan.json` `calibration.어휘`, `qbank/harness/plan.mjs:114,149-160`)

> 출처: 정찰 에이전트 `CONTEXT_MEANING` (2026-07-28). 코드 직독 + tsx 실행 검증(§검증 로그).
> 공유 계약은 [`../recon/00-contract.md`](../recon/00-contract.md), 품질 규범은 [`../quality-constitution.md`](../quality-constitution.md).

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문 안 **다의어 한 곳**에 밑줄이 그어지고, 학생은 "그 단어가 **이 문맥에서** 갖는 의미"를 선지에서 고른다. 발문은 `밑줄 친 단어의 문맥상 의미와 가장 가까운 것은?` (정답 2개 이상이면 `밑줄 친 단어의 문맥상 의미로 적절한 것을 모두 고르시오.`) — `adapter-context-meaning.ts:35-39`.

**변별의 원천은 어휘 난도가 아니라 "문맥이 어느 뜻을 고르게 하는가"다.** `run`·`address`·`charge`·`keep`·`hold` 처럼 **쉬운 단어일수록 좋은 표적**이다(`prompts-context-meaning.ts:201`).

**리트머스 검사(이 유형의 자격증)** — 밑줄 단어를 **사전 대표 의미**로 바꿔 그 문장을 다시 읽는다. 자연스럽게 읽히면 그 표적은 **탈락**이다(`prompts-context-meaning.ts:230`). 밑줄만 보고 사전 뜻으로 바꿔도 정답이 되는 단어는 이 유형이 아니라 `SYNONYM` 이다(`:89, :202`).

**다른 유형과의 경계**

| 축 | CONTEXT_MEANING | 인접 유형 |
|---|---|---|
| 표적 크기 | **단어 또는 5단어 이내 짧은 구** (`gate-context-meaning.ts:279-283`) | `IMPLIED_MEANING`: 구·절·짧은 문장 (긴 표적은 그쪽 자리 — `prompts-context-meaning.ts:207`) |
| 묻는 것 | 그 단어의 **다의 해소** | `SYNONYM`: 문맥 무관 사전 동의어 / `ANTONYM`: 반의어 쌍 |
| 선지 | 별도로 쓴 **뜻풀이 구** N개 | `VOCAB_CHOICE`: 지문 안 밑줄 자리 자체가 선지 |
| 지문 결속 | 밑줄 표적 **1곳**, 지문 축자·자리 유일 | `VOCAB_CHOICE`/`GRAMMAR_ERROR`: 마커 5~10곳 |
| 지문 재출력 | **안 한다** — 마크다운에 지문이 없다 | `VOCAB_CHOICE`: `밑줄지문:` 으로 전문 재출력 |

**★ 이 유형만의 구조적 특징: 지문 재구성 게이트가 없다.** 모델이 지문을 다시 쓰지 않으므로 "마커 밖 1글자 변경" 사고가 원천적으로 없다. 대신 **지문과의 유일한 결속점이 `밑줄:` 한 줄**이고, 후처리가 그 문자열을 `replaceAtPosition(passage, index, length, "__"+word+"__")` 로 **지문에 도로 써 넣는다**(`processors/context-meaning.ts:27-32`). 그래서 축자 실패는 곧 **지문 오염**이며, 게이트가 축자·유일성을 이 유형에서 가장 엄격하게 집행한다(`parser-context-meaning.ts:10-15` 주석).

**이 유형이 죽는 지점**: ① 투명 직역 표적(`exceed→surpass` 류) ② 오답이 전부 정답과 동떨어진 의미장에 있어 도메인 매칭만으로 즉답(`prompts-context-meaning.ts:119` — 실측 최다 결함) ③ 지문이 뜻을 직접 알려 주는 자리(`the word coloratus`)를 밑줄.

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (optionCount=5 · answerCount=1 · optionLanguage=en — 전 기본값)

```md
밑줄: <지문에 딱 1회만 등장하는 다의 내용어 — 지문 축자 그대로, 굴절형·대소문자·하이픈까지. 영문자로 시작해 영문자로 끝난다. 5단어·60자 이내.>
① <뜻풀이 구 — 영어 6단어 이내. 괄호·대괄호·별표·백틱·밑줄표기 금지>
② <뜻풀이 구>
③ <뜻풀이 구>
④ <뜻풀이 구>
⑤ <뜻풀이 구>
정답: <①~⑤ 중 하나. 2개 이상이면 ", " 로 병기 — 예: ②, ④>
해설: <합니다체 한국어. 이 단어가 이 지문에서 어느 의미축으로 쓰였는지 + 그 축을 확정해 주는 근거가 어느 문장인지. 영어 인용은 따옴표 안에 지문 축자로만.>
오답:
<비정답 라벨> <기제이름 — 왜 매력적이고 왜 탈락인지. 정답 라벨을 뺀 모든 선지에 정확히 한 줄씩>
```

qbank 유닛 파일에서는 이 골격 앞에 컨테이너 헤더가 붙는다(qbank 규약, md-qgen 규약 아님 — `qbank/harness/qgen-core.ts:47`):

```md
<!-- ITEM 1
difficulty: BASIC
point: <이 문항이 겨냥하는 출제 포인트 — 유닛 내 중복 금지>
craft: <설계 의도 한 줄>
settings: {"optionCount":5,"answerCount":1}
-->
```

> `settings` 의 키는 **`optionCount` / `answerCount`** 다(`question-type-generation-settings/generic.ts:39,47`). 레인이 읽는 `genericOptionCount` 는 **해석 결과 이름**이지 입력 키가 아니다 — 헤더에 `genericOptionCount` 를 쓰면 조용히 무시되고 기본 5로 돈다.

### 2-2. 검증된 정상 픽스처 전문 — `scripts/_test-md-context-meaning.ts:44-56` (`GOOD`)

지문(`:33-38`, 5문장):

```
Reform movements often stall long before their opponents mount a serious defence. The early leaders win a few visible concessions, and the victory is cheap, bought with promises that cost the powerful nothing. Supporters then read the quiet that follows as proof of progress rather than as a warning. By the time the original demands return to the table, the language of the campaign has been borrowed by the very institutions it set out to change. What began as a challenge ends as a slogan that anyone can repeat without changing anything.
```

마크다운:

```md
밑줄: cheap
① low in price
② poorly made
③ won without real sacrifice
④ obtained by sheer luck
⑤ offered at a discount
정답: ③
해설: 이 글은 초기 지도자들이 얻은 승리가 권력자에게 아무 대가도 치르게 하지 않은 약속으로 산 것이라고 말합니다. 따라서 밑줄 자리는 값이 싸다는 뜻이 아니라 진짜 희생 없이 얻었다는 평가의 의미로 쓰였습니다.
오답:
① 대표뜻 — 가격이 낮다는 가장 흔한 의미라 밑줄만 본 학생이 즉시 집지만, 이 문장에는 가격을 재는 대상이 없습니다.
② 폴리세미 — 조잡하다는 뜻도 이 단어가 실제로 갖지만, 이 문장이 평가하는 것은 물건의 품질이 아니라 승리의 값어치입니다.
④ 문맥 유혹 오독 — 대가가 없었다는 서술을 운으로 옮긴 것이며, 지문은 약속이라는 수단을 분명히 밝히고 있습니다.
⑤ 근접 의미장 — 가격 의미장 안의 오독이라 끝까지 남지만, 할인 여부는 지문 어디에도 없습니다.
```

> 같은 파일이 복수 정답 픽스처 `MULTI`(6지·정답 2 — `:380-393`)와 한국어 보기 픽스처 `KO_OPTIONS`(`:415-427`)도 클린 통과시킨다(`:399, :431`).

### 2-3. 복수 정답 골격 (`answerCount ≥ 2`)

```md
밑줄: <표적>
① <뜻풀이 구>
② <뜻풀이 구>
③ <뜻풀이 구>
④ <뜻풀이 구>
⑤ <뜻풀이 구>
⑥ <뜻풀이 구>
정답: ②, ④
해설: <두 뜻이 모두 이 문맥에서 성립하되 서로 다른 측면을 짚는다는 것을 밝힌다>
오답:
① <기제이름 — …>
③ <기제이름 — …>
⑤ <기제이름 — …>
⑥ <기제이름 — …>
```

> ⚠ 복수 정답 구분자는 **`, ` 또는 ` · ` 뿐**이다(`parser-context-meaning.ts:256`). `②와 ④`·`② 및 ④`·`②/④` 는 두 번째 라벨이 **통째로 버려져** 「정답 1개 (2개 필요)」가 뜬다.
> ⚠ 복수 정답이면 발문이 자동으로 "모두 고르시오" 로 바뀐다(`adapter-context-meaning.ts:102-104`) — 이 문자열이 없으면 `generic-multi-answer-direction` error(`dispatcher.ts:824-831`). 어댑터가 만들므로 저작자가 손댈 것은 없다.

### 2-4. 한국어 보기 골격 (`optionLanguage: "ko"`)

선지만 바뀐다. 각 선지는 **30자 이내 한국어 뜻풀이 구**(`gate-context-meaning.ts:200-204`).

```md
밑줄: cheap
① 값이 낮다는 뜻
② 조잡하게 만들었다는 뜻
③ 진짜 희생 없이 얻었다는 뜻
④ 순전히 운으로 얻었다는 뜻
⑤ 할인해 내놓았다는 뜻
정답: ③
해설: …
오답:
…
```

---

## 3. 파서 계약 (★ 가장 중요)

진실원은 `src/lib/md-qgen/parser-context-meaning.ts` 다. `prompts-context-meaning.ts` 의 지침이 느슨해도 아래가 계약이다.

### 3-0. 문서 전역 규칙

| # | 규칙 | 근거 | 어기면 사라지는 것 |
|---|---|---|---|
| R0 | **1 마크다운 문서 = 1문항.** 모든 키워드 줄은 `m` 플래그 정규식의 **첫 매치**만 취한다 | `parser-context-meaning.ts:200-209, 219-225, 238, 249` | 2번째 문항의 필드가 조용히 소멸하거나 1번 문항을 오염 |
| R1 | **지문을 마크다운에 싣지 않는다.** `밑줄:`·선지·`정답:`·`해설:`·`오답:` 다섯 요소가 전부다 | `prompts-context-meaning.ts:148-150` (출력 계약 주석), `:238-244` (출력 형식 블록) | 지문을 덧붙이면 그 줄들이 해설·오답 구역을 오염시킨다 |
| R2 | **줄바꿈 구분자는 `\r\n`·`\r`·`\n` 전부 안전.** 선지 파싱이 `split(/\r\n|[\r\n]/)` 로 분리한다 | `parser-context-meaning.ts:121` | (안전 — CRLF 회귀는 이미 봉합됨, `_test-md-context-meaning-decoration.ts:318-342`) |
| R3 | **마크다운 장식은 이 유형에 한해 광범위하게 흡수된다** — 굵게·기울임·강조·백틱·헤딩·불릿·인용·표 파이프·전각 콜론 | `:60 (EMPH), :65-67, :78-93, :184-189` | (안전. 단 **짝이 깨진 표지가 본문 한가운데** 남으면 게이트가 반려 — §4) |
| R4 | **그래도 qbank 저작 규칙은 「장식 0」이다.** 관용은 계약이 아니고, 유형마다 관용 범위가 다르다 | `../recon/00-contract.md §8` | 다른 유형 골격에 복사했을 때 그쪽에서 터진다 |

### 3-1. 키워드 줄 문법 (밑줄·정답·해설·오답 **네 줄이 같은 빌더를 공유**)

```ts
const EMPH = String.raw`(?:\*{1,3}|_{1,3}|\x60)`;                                  // :60
const KEY_HEAD = String.raw`^\s*(?:>\s*)?#{0,6}\s*(?:[-*•+]\s*)?${EMPH}?\s*`;      // :184
const KEY_TAIL = String.raw`\s*${EMPH}?\s*[:：]\s*${EMPH}?\s*`;                    // :185
keywordLineSource(label, tail) = `${KEY_HEAD}(?:${label})${KEY_TAIL}${tail}`       // :187-189
```

라벨 확장(`parser-context-meaning.ts:191-195`):

| 머리표 | 허용 라벨 정규식 | 통과하는 표기 |
|---|---|---|
| 밑줄 | `밑줄(?:\s*(?:단어\|표현\|어휘\|어구))?` | `밑줄:` `밑줄 단어:` `밑줄 표현:` `밑줄 어휘:` `밑줄 어구:` |
| 정답 | `정답(?:\s*(?:및\|과)\s*해설)?` | `정답:` `정답 및 해설:` `정답과 해설:` |
| 해설 | `(?:정답\s*(?:및\|과)\s*)?해설` | `해설:` `정답 및 해설:` |
| 오답 | `오답(?:\s*(?:해설\|선지))?` | `오답:` `오답 해설:` `오답 선지:` |

- 콜론은 반각 `:` / 전각 `：` 둘 다. 콜론 뒤 공백은 0개도 허용.
- **저작 표준은 장식 0의 `밑줄:` `정답:` `해설:` `오답:` 넉 줄**이다.
- ⚠ **어기면 사라지는 것**: 라벨 문자열 자체가 위 목록 밖이면(`정답 라벨:`·`Answer:`·`밑줄 부분:`) 그 필드가 **통째로 유실**되고 게이트는 「정답 누락」·「해설 누락」·「밑줄 표현 누락」이라는 **사실과 다른 원인**을 뱉는다.

### 3-2. `밑줄:` 줄 — 이 유형의 심장

```ts
const TARGET_LINE_RE = new RegExp(keywordLineSource(TARGET_LABEL, String.raw`(.+)$`), "m");  // :202-205
word = stripTargetDecoration(text.match(TARGET_LINE_RE)?.[1] ?? "")                          // :238, :279
```

`stripTargetDecoration`(`:140-162`):
1. `[*_`]` **전량 제거** (짝 여부 무관) — 영어 지문에 이 문자가 없으므로 남길 이유가 없다.
2. 좌우 표 파이프 `|` 제거 · trim.
3. 짝이 맞는 따옴표만 최대 3회 벗김: `"…"` `'…'` `“…”` `‘…’`.
4. **문장 구두점(마침표·쉼표)은 벗기지 않는다** — 그건 스냅이 지문과 대조해 판단한다.

- **한 줄이어야 한다.** `(.+)$` 의 `.` 는 개행을 먹지 않는다 → 표적을 두 줄로 쓰면 뒷줄이 사라진다.
- ⚠ **어기면 사라지는 것**: 밑줄 줄이 없으면 `word=""` → 「밑줄 표현 누락」 하나로 즉시 return(`gate-context-meaning.ts:268`) — 다른 결함이 전부 가려진다.

### 3-3. 선지 줄

```ts
const OPTION_LINE_RE = new RegExp(String.raw
  `^\s*(?:>\s*)?#{0,6}\s*\|?\s*(?:[-*•+]\s*)?${EMPH}?\s*(?:([①-⑩])|\(([1-9])\)|([1-9])[.)])${EMPH}?[.)]?\s*(.+)$`);  // :65-67
```

- 라벨 축 3종: **원문자 `①`~`⑩`** / `(3)` / `3.` `3)`. 숫자 라벨은 **괄호나 마침표를 반드시 동반**해야 한다(해설 산문의 숫자 오인 방지, `:64` 주석). → `circledLabel`(`:42-52`)이 전부 원문자로 정규화.
- **저작 표준은 원문자 `①`부터 `optionCount` 번째까지 연속**. 계약 상한은 `⑧`(`prompts-context-meaning.ts:18-20`)이지만 파서는 `⑨⑩`까지 읽어 게이트가 지목하게 한다(`:20-21` 주석).
- 본문은 `cleanOptionText`(`:105-112`)가 표 파이프 → `stripInlineEmphasis`(`:78-93`) 순으로 정리. **양끝 대칭 절단** + 짝 맞는 `**…**` `__…__` `` `…` `` `*…*` 최대 3회 반복 제거.
- **같은 라벨이 두 줄이면 첫 줄만** 채택(`:129`).
- **한 선지 = 정확히 한 줄.** 줄바꿈으로 이어 쓰면 둘째 줄은 라벨이 없어 버려진다.
- ⚠ **어기면 사라지는 것**: 라벨을 빠뜨리거나 라벨 뒤에 본문이 없으면(`③` 만 있는 줄) 그 선지가 사라져 「선지 4개 (5개 필요)」.

**선지 구역 확정 순서**(`:233-235, 268-270`):

```ts
beforeWrong          = text.split(WRONG_SECTION_RE)[0] ?? text          // `오답:` 앞
strictOptionSection  = beforeWrong.split(ANSWER_SECTION_RE)[0]          // 그중 `정답:` 앞
options = parseLabeledLines(strictOptionSection).length > 0
        ? parseLabeledLines(strictOptionSection)
        : parseLabeledLines(beforeWrong)                                // 엄격 구역이 비었을 때만 확장
```

- **정상 순서는 `밑줄:` → 선지 → `정답:`.** 선지를 `정답:`/`해설:` 뒤에 써도 구제되지만(`:266-267`), 그건 드리프트 구제지 계약이 아니다.
- ⚠ 해설 산문에 `1.`·`(2)` 같은 번호 목록을 쓰면 **엄격 구역이 아니라 확장 경로에서만** 선지로 오인될 수 있다. 해설에 번호 목록을 쓰지 마라.

### 3-4. `정답:` 줄 — 정답의 **유일** 진실원

```ts
const ANSWER_LINE_RE = new RegExp(keywordLineSource(ANSWER_LABEL, String.raw`(.+)$`), "m");   // :206-209
answerLine = (text.match(ANSWER_LINE_RE)?.[1] ?? "").replace(/[*_`]/g, "").trim();            // :249-252
leadingRun = answerLine.match(
  /^\s*((?:[①-⑩]|\(?[1-9]\)?)(?:\s*[,·]\s*(?:[①-⑩]|\(?[1-9]\)?))*)/)?.[1] ?? "";              // :254-257
answers = [...new Set([...leadingRun.matchAll(/[①-⑩]|[1-9]/g)].map(m => circledLabel(m[0])).filter(Boolean))];  // :258-264
```

- **선행 라벨 런만** 수집한다. `정답: ③ — ①은 대표뜻 함정입니다` 의 `①` 은 정답이 아니다.
- 복수 정답 구분자는 **`,` 와 `·` 뿐**. 앞뒤 공백은 자유.
- 중복 라벨은 `Set` 으로 1회만 담긴다.
- 값 쪽 `* _ \`` 는 **전량 제거**되므로 `정답: **③**` 도 안전.
- **선지 줄에 정답 표시 칸을 두지 않는다**(철칙 1 — `prompts-context-meaning.ts:157`). `③ won without real sacrifice (정답)` 처럼 쓰면 괄호 게이트에 걸린다.
- ⚠ **어기면 사라지는 것**: 라벨을 못 읽으면 `answers=[]` → 「정답 누락」. 두 번째 라벨을 못 읽으면 「정답 1개 (2개 필요)」라는 **거짓 원인**이 재생성 피드백으로 나간다.

### 3-5. `해설:` 블록

```ts
const SECTION_STOP_SRC = keywordLineSource(`${WRONG_LABEL}|${ANSWER_LABEL}|${TARGET_LABEL}`);       // :216-218
const EXPLANATION_RE = new RegExp(
  keywordLineSource(EXPLANATION_LABEL, `([\\s\\S]*?)(?=${SECTION_STOP_SRC}|$(?![\\s\\S]))`), "m");  // :219-225
explanation = stripInlineEmphasis(text.match(EXPLANATION_RE)?.[1] ?? "");                           // :283
```

- 본문은 `해설:` **같은 줄부터** 시작해도 되고 **다음 줄부터 여러 줄**이어도 된다.
- **종료선은 모든 키워드 줄**(`오답`/`정답`/`밑줄` 계열) 또는 문서 끝. `오답:` 이 없으면 문서 끝까지 삼킨다.
- ⚠ **어기면 사라지는 것**: 해설 본문 안에서 줄머리에 `오답`/`정답`/`밑줄` + 콜론을 쓰면 그 줄부터 해설이 **잘린다**. 불릿 `- 오답: …` 도 KEY_HEAD 가 흡수하므로 똑같이 자른다.

### 3-6. `오답:` 섹션

```ts
const WRONG_SECTION_RE = new RegExp(keywordLineSource(WRONG_LABEL), "m");   // :199-200
wrongSection = text.split(WRONG_SECTION_RE)[1] ?? "";                       // :236
wrong = parseLabeledLines(wrongSection).filter(w => !answerSet.has(w.label));// :273-275
```

- 항목은 **선지 줄과 같은 라벨 문법**. `오답:` 은 값 없는 단독 줄이 표준.
- **정답 라벨 줄은 조용히 버려진다**(`:274`) — 오답 목록에 정답 줄을 끼워 넣어도 개수만 줄어든다.
- ⚠ **어기면 사라지는 것**: `오답:` 머리표가 없으면 `wrongSection=""` → 「오답해설 0개 (4개 필요)」. 오답 항목의 라벨을 빠뜨리면 그 줄이 사라져 개수가 어긋난다.
- `answer-only` 모드(오답 섹션 없음)는 **레인이 쓰지 않는다** — `buildBasePrompt` 가 항상 `"full"` 을 넘기고(`lane-context-meaning.ts:132`), 게이트의 `requireWrong` 도 레인이 넘기지 않아 기본 `true` 다(`gate-context-meaning.ts:355`). **오답 섹션은 항상 필수.**

### 3-7. 밑줄 표적 위치 탐색기 (게이트·어댑터·스냅이 공유하는 단일 소스)

```ts
export function locateContextMeaningTarget(passage, word): {index, length, count} | null   // :311-337
  body = word.trim().split(/\s+/).map(t => flexiblePunctuation(escapeRegExp(t))).join("\\s+")
  pre  = /^[A-Za-z0-9]/.test(trimmed) ? "(?<![A-Za-z0-9])" : ""
  post = /[A-Za-z0-9]$/.test(trimmed) ? "(?![A-Za-z0-9])" : ""
  re   = new RegExp(`${pre}${body}${post}`, "gi")      // ★ 대소문자 무시 + 전역
  count = [...passage.matchAll(re)].length
```

`flexiblePunctuation`(`:299-304`)이 흡수하는 변형: `' ‘ ’ ʼ` ↔ / `" “ ”` ↔ / `- – —` ↔. 그 외 문자 차이는 없다.

- **공백량은 흡수된다**(`\s+`), **대소문자는 탐색에서만 흡수**된다 — 게이트가 `slice !== word` 로 **축자 일치를 다시 요구**한다(`gate-context-meaning.ts:311-316`).
- **`count` 는 대소문자 무시 전역 카운트다.** 문두 대문자 재등장(`Cheap` … `cheap`)도 2회로 센다 → 「2회 등장」 반려.
- ⚠ **어기면 사라지는 것**: 못 찾으면 「축자로 없음」으로 그 자리에서 return(`:300-305`) — 뒤의 mention·고유명사 검사가 전부 건너뛰어진다.

### 3-8. 오토스냅(0원 무손실 보정) — 있어도 기대지 마라

`autoSnapContextMeaningTarget(q, passage)` — `parser-context-meaning.ts:354-398`

| # | 조건 | 동작 | 한계 |
|---|---|---|---|
| 0 | `passage.includes(word)` (**단어 경계 없는 순수 부분문자열**) | **무보정 즉시 반환**(`:363`) | ⚠ `sect` 가 `section` 안에 있으면 스냅이 안 돌고 게이트가 「축자로 없음」으로 반려한다 |
| 1 | 지문에 **유일하게** 걸릴 때 | 지문 축자 슬라이스로 교체(`:365-371`) | 대소문자·공백량·따옴표/대시 드리프트 구제 |
| 2 | 앞뒤 구두점만 어긋날 때 | 구두점 트림 후 유일 슬라이스로 교체(`:374-386`) | `cheap.` → `cheap` |
| 3 | 사이 단어를 빠뜨린 **4단어 이상 구** | `snapExpressionSpan`(`parser.ts:601-635`) — 유일 구간 + 자카드 ≥ 0.66 | 3단어 이하는 오스냅 위험으로 포기 |
| — | 2회 이상 등장 | **손대지 않는다**(보수 가드) | 게이트가 「자리 모호」로 반려 |

스냅이 돌면 `corrections[]` 에 기록되고 qbank 하네스는 `AUTOSNAP` **경고**로 남긴다(`qgen-core.ts:313`). **경고 0을 목표로 저작하라** — 스냅이 돌았다는 것은 축자를 틀렸다는 뜻이다.

---

## 4. 게이트 체크리스트

판정의 진실원은 `parsed.gateIssues` 다(`../recon/00-contract.md §2`). 아래가 **전수**다.

### 4-1. `gateMdContextMeaning` — `src/lib/md-qgen/gate-context-meaning.ts`

`{label}`=원문자 라벨, `{…}`=60자 잘린 인용, `N`/`M`=수치.

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {N}개 ({M}개 필요)` | 선지 수 ≠ optionCount (**즉시 return** — 다른 검사 전부 생략) | gate-context-meaning.ts:359-361 |
| `선지 라벨이 {①②③④⑤} 순서가 아님 — 실제 {…}` | 라벨열 ≠ `①`부터 optionCount 개 연속 | :108-112 |
| `{label} 선지 텍스트 누락` | 선지 본문 빈 문자열 | :116-117 |
| `선지 중복 — {label}와 {label}가 같은 내용: '{…}'` | 두 선지가 정규화·소문자 비교로 동일 | :120-122 |
| `{label} 선지에 마크다운 장식이 남음 — 별표·백틱·밑줄표기 없이 뜻풀이만 적어라: '{…}'` | 파서가 못 벗긴 `* \` _` 잔재 (짝이 깨져 본문 한가운데 박힘) | :150-154 |
| `{label} 선지에 괄호 주석이 있음 — 서버가 괄호 안을 삭제하므로 뜻풀이만 남겨라: '{…}'` | 선지에 `(` `)` `[` `]` | :158-162 |
| `{label} 선지가 밑줄 단어와 동일 — 동어반복: '{…}'` | 선지 소문자 == 표적 소문자 | :166-167 |
| `{label} 선지가 밑줄 단어의 굴절형 — 동어반복: '{…}' vs '{…}'` | 둘 다 단일 영어 토큰이고 어간 공유(`-ing/-ed/-es/-s/-d` + 자음중복) | :168-177 / :71-95 |
| `{label} 선지에 한글이 섞임 — 선지는 영어 전용: '{…}'` | optionLanguage=en 인데 한글 포함 | :180-182 |
| `{label} 선지가 영어 표현이 아님: '{…}'` | optionLanguage=en 인데 라틴 문자 0 | :183-186 |
| `{label} 선지가 문장으로 늘어짐 — 6단어 이내 뜻풀이 구로 줄여라: '{…}'` | optionLanguage=en 인데 공백 분리 7단어 이상 | :188-192 |
| `{label} 선지가 한국어가 아님 — 교사 설정이 한국어 보기다: '{…}'` | optionLanguage=ko 인데 한글 0 | :194-198 |
| `{label} 선지가 너무 김 — 30자 이내 뜻풀이로 줄여라: '{…}'` | optionLanguage=ko 인데 31자 이상 | :200-204 |
| `정답 선지({label})만 여러 단어이고 나머지는 전부 한 단어 — 형태로 정답이 들킨다` | 정답 1개 && 비정답 ≥3 && 정답 ≥2단어 && 비정답 **전부** 1단어 | :213-222 |
| `밑줄 표현 누락 — \`밑줄:\` 줄이 없거나 비어 있음` | `word` 가 빈 문자열 (**표적 검사 즉시 return**) | :268 |
| `밑줄 표현이 영문자로 시작·종료하지 않음 — 구두점·따옴표를 빼고 단어만 적어라: '{…}'` | 양끝이 `[A-Za-z]` 가 아님 | :271-274 |
| `밑줄이 너무 김({N}단어/{M}자) — 5단어 이내 단어·짧은 구로 잘라라: '{…}'` | 6단어 이상 **또는** 61자 이상 | :279-283 |
| `밑줄이 기능어 단독(관사·전치사·대명사 류) — 문맥 의미를 물을 수 없다: '{…}'` | `isTinyFunctionWord` (a/an/the/it/its/is/are/was/were/be/been/in/on/at/to/of/for/as/by/or/and/but) | :290-293 / question-quality/core.ts:422-424 |
| `밑줄이 너무 짧음 — 내용어 한 단어 이상이어야 한다: '{…}'` | 영문자 수 < 2 | :294-296 |
| `밑줄 표현이 지문에 축자로 없음(단어 경계 기준) — 지문에서 그대로 복사하라: '{…}'` | `locateContextMeaningTarget` 이 null (**표적 검사 return**) | :300-305 |
| `밑줄 표현이 지문에 {N}회 등장 — 밑줄 자리가 모호하다. 한 번만 나오는 표현을 골라라: '{…}'` | count ≥ 2 (**대소문자 무시 카운트**) | :306-310 |
| `밑줄 표현이 지문 표기와 다름 — 지문은 '{…}' 인데 '{…}' 로 적었다(굴절형·대소문자까지 축자여야 한다)` | 지문 슬라이스 ≠ 적어 온 문자열 | :311-316 |
| `밑줄이 지문이 용어 자체를 설명·인용하는 자리(the word ~ / called ~) — 뜻이 지문에 이미 적혀 있어 문항이 성립하지 않는다: '{…}'` | 앞 40자가 `the word/term/phrase/expression` · `called` · `named` · `known as` · `meaning` · `means` · `refers to` 로 끝남 | :322-325 / :52-53 |
| `밑줄이 따옴표로 인용된 토큰 — 지문이 언급하는 말이지 문맥 속에서 쓰인 어휘가 아니다: '{…}'` | 바로 앞이 여는 따옴표 && 바로 뒤가 닫는 따옴표 | :326-330 |
| `밑줄이 문장 중간의 대문자 시작 토큰 — 고유명사·외국어 표기는 표적이 될 수 없다: '{…}'` | 대문자 시작 단일 토큰인데 문장 첫 단어가 아님 | :333-341 / :59-65 |
| `{어디}에 평숫자 선지 지칭('{…}')이 있음 — 선지는 출제 후 재배열되므로 …` | 해설·오답해설에 `N번`(째 제외) · `선지 N` · `보기 N` · `(N)` · `①~③` 류 범위 표기 | :250-256 / :238-239 |
| `정답 누락 — \`정답:\` 줄이 없거나 라벨을 읽을 수 없음` | `answers.length === 0` | :373 |
| `정답 {N}개 ({M}개 필요) — 실제 {…}` | 정답 라벨 수 ≠ answerCount | :374-378 |
| `정답 라벨({label})이 선지에 없음` | 정답 라벨이 선지 라벨 집합 밖 | :379-381 |
| `해설 누락` | `explanation` 빈 문자열 | :383 |
| `오답해설 {N}개 ({M}개 필요) — 정답을 뺀 모든 선지에 1개씩` | 오답 항목 수 ≠ optionCount − answerCount | :385-390 |
| `오답해설에 정답 라벨({label}) 포함` | (파서 필터를 우회했을 때) | :392-393 |
| `오답해설 라벨({label})이 선지에 없음` | 오답 라벨이 선지 라벨 집합 밖 | :394-396 |

### 4-2. 레인 추가 게이트 — `src/lib/md-qgen/lane-context-meaning.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `교사 지정 표현이 밑줄에 없음: '{…}'` | `ctx.teacherPoints` 의 표현이 표적과 포함관계가 아님 | lane-context-meaning.ts:87-102 |

> 이 유형은 `POINT_PICKER_CONFIG` 미등재라 **실제로는 `teacherPoints` 가 항상 비어 온다**(`:80-86` 주석). qbank 하네스도 `teacherPoints: []` 를 고정으로 넘긴다(`qgen-core.ts:122`) → 사실상 무발화.

### 4-3. 어댑터 실패 (게이트 통과 후 차단) — `adapter-context-meaning.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {N}개 (4~8개 필요)` | 선지 수 범위 밖 | adapter-context-meaning.ts:46-54 |
| `밑줄 표현 누락` | `word` 빈 문자열 | :55-56 |
| `정답 라벨({label})이 선지에 없음` | 라벨→인덱스 매핑 실패 | :61-66 |
| `정답 누락` | 정답 인덱스 0개 | :69 |
| `정답이 전 선지 — 오답이 하나도 없음` | 정답 수 ≥ 선지 수 | :70-72 |

### 4-4. 후처리 실패 — `question-postprocess/processors/context-meaning.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `Missing underlinedWord field` | `underlinedWord` 없음 | context-meaning.ts:13-15 |
| `Word not found in passage: "{…}"` | `findWordInPassage` 4전략 전부 실패 | :17-25 / text-utils.ts:331-400 |

> `findWordInPassage` 는 `surroundingText` 컨텍스트 → `\b단어\b` → 대소문자 무시 → 정규화 순으로 시도한다. **부분문자열 폴백은 없다**(dig\_\_it\_\_al 사고 방지). 게이트를 통과했으면 여기서 실패하지 않는다.

### 4-5. qbank 하네스 유닛 게이트 — `qbank/harness/qgen-core.ts`

| 코드 | 조건 | file:line |
|---|---|---|
| `CONTAINER` | `<!-- ITEM n -->` 헤더 누락·번호 비연속·`point:` 누락·`settings:` JSON 파손·본문 공백 | qgen-core.ts:49-99 |
| `ITEM_COUNT` | 문항 수 < minItems(기본 5) | :229-237 |
| `GATE` | 위 4-1·4-2 전수 | :306 |
| `ADAPT` / `POSTPROCESS` | 4-3 / 4-4 | :307-310 |
| `POINT_DUPLICATE` | 유닛 내 `point:` 값 중복(소문자·비문자 정규화 비교) | :324-333, :379-384 |
| `ANSWER_DUPLICATE` | **두 문항의 `underlinedWord` 가 같으면 유닛 전체 차단** | :336-353 + lane-context-meaning.ts:203-209 |

### 4-6. 품질 검증기(`qualityBlocking`) — 프로덕션 비차단, qbank 차단

이 유형은 **전용 검증기가 없다**(`validateVocabChoiceQuestion` 같은 함수가 없음). 밟히는 것은 공통 게이트뿐이다.

| 코드 | 조건 | file:line |
|---|---|---|
| `option-count` | 선지 수 ≠ genericOptionCount (레인이 `qualityArgs` 로 넘긴 값) | validators/options.ts:140-142 |
| `duplicate-option-label` / `duplicate-option-text` / `empty-option-text` | 라벨/본문 중복·빈 선지 | :146-158 |
| `option-spelling-triple-letter` | 선지에 같은 글자 3연속 토큰(`iii`·`www` 제외) | :160-179 |
| `correct-answer-mismatch` | `correctAnswer` 라벨이 선지 라벨과 불일치 | :195-218 |
| `generic-answer-count` | **answerCount ≥ 2 일 때만** — 정답 라벨 수 불일치 | dispatcher.ts:810-823 |
| `generic-multi-answer-direction` | **answerCount ≥ 2 일 때만** — 발문에 `모두/all/apply` 없음 (어댑터가 자동 생성하므로 무발화) | dispatcher.ts:824-831 |
| `target-not-standalone` | 표적이 단일 영어 토큰인데 지문에 독립 토큰으로 없음 | dispatcher.ts:963-973 |
| `type-foreign-field` | `blanks` · `passageWithBlank` · `originalExpression` 유출 (어댑터가 애초에 안 만든다) | validators/misc.ts:25-33, 37-50 |
| `mid-word-marker` | `passageWithUnderline` 의 `__…__` 가 단어 내부에 박힘 | validators/grammar/marked.ts:26-30 |
| `explanation-foreign-script` | 해설·오답해설에 한자·가나·중문 구두점 (한글 직후 괄호 병기만 예외) | explanation-foreign-text.ts:97-104 |
| `explanation-latin-jam` | `steals다` 류 영단어+종결어미 접합 | :105-112 |
| `explanation-quoted-token-missing` | 해설이 따옴표로 인용한 **12자 이상** 영어 조각이 지문·선지·문항 표면 어디에도 없음 | explanation-quoted-tokens.ts:143-161 |

> **경고(비차단)**: `weak-target-word`(기능어 표적 — md 게이트가 이미 error 로 승격) · `few-key-points`·`thin-killer-explanation`(KILLER 한정, misc.ts:66-81) · `shallow-killer-options`·`option-length-giveaway`(misc.ts:83-96) · `difficulty-mismatch`.
> 어댑터가 `keyPoints: []` 를 **고정**으로 내므로(`adapter-context-meaning.ts:119`) **KILLER 문항은 `few-key-points` 경고를 구조적으로 항상 받는다 — 정상이다.**

---

## 5. adapter 산출 필드

### 5-1. 어댑터 산출 (`adaptMdContextMeaningToAiQuestion`, `adapter-context-meaning.ts:41-124`)

| 키 | 값 | 비고 |
|---|---|---|
| `direction` | 정답 1개 → `밑줄 친 단어의 문맥상 의미와 가장 가까운 것은?` / 2개 이상 → `밑줄 친 단어의 문맥상 의미로 적절한 것을 모두 고르시오.` | `:35-39, 102-104`. `stemLanguage=en` 이면 레인이 영어 발문으로 교체(`lane-context-meaning.ts:177-182`) |
| **`underlinedWord`** | **★ 이 유형 고유.** 자리가 유일하면 **지문 축자 슬라이스**, 아니면 모델 문자열 | `:78-82`. 후처리가 이 문자열을 지문에 도로 써 넣는다 — 축자 실패 = 지문 오염 |
| **`surroundingText`** | **★ 이 유형 고유.** 표적 좌우 45자 문맥 조각(단어 중간 절단 방지) | `:83-85` / `adapter.ts:45-64`. 자리가 모호하면 `""` (후처리 단어경계 탐색에 위임) |
| `options[]` | `{label:"1"…"N", text}` — **원문자 → 숫자 문자열 축 변환** | `:107-110`. 학생 표면의 `①` 표기는 렌더 계층 담당 |
| `correctAnswer` | `"3"` / `"2, 4"` (1-based 숫자, `", "` 조인) | `:111` |
| `correctAnswers` | **정답 2개 이상일 때만** 배열 생성 (단일이면 키 자체가 없다) | `:112-116` |
| `wrongOptionExplanations[]` | `{label:"1"…, explanation}` — 1-based 숫자 축. **본문이 빈 항목은 제외** | `:88-97` |
| `explanation` | 해설 원문 | `:118` |
| `keyPoints` | **항상 `[]`** (합성 금지 — 오태깅 노출 실사고) | `:119` |
| `tags` / `difficulty` | `[]` / `ctx.rawDifficulty` | `:120-121` |

**금지 필드**: `passageWithUnderline`(후처리 소관 — 이중 생성 충돌), `blanks`·`passageWithBlank`·`originalExpression`(`type-foreign-field` error) — `:12-20` 주석.

### 5-2. 후처리가 더하는 최종 `structuredData`

| 키 | 후처리 동작 | file:line |
|---|---|---|
| **`passageWithUnderline`** | **후처리가 만드는 유일한 필드.** `findWordInPassage` 로 자리를 찾아 `__단어__` 삽입 | processors/context-meaning.ts:17-39 |
| `options[].text` | `sanitizeSingleVocabOptionText` — **선지 앞 라벨 접두 제거 + 괄호·대괄호 안 내용 삭제** | postprocess/index.ts:191-222, 240-242 |
| `wrongOptionExplanations` | 배열 → Record 정규화 후 표시 선지와 정렬 | postprocess/index.ts:166-188 |

이후 라우트가 `_typeId`/`_typeLabel`/`_generationPlan`/`difficulty`/`tags` 를 붙이고 `shuffleQuestionOptionsForDiversity` 를 거쳐 `structuredData` 로 저장한다(`../recon/00-contract.md §11`).

> ★ **셔플 대상 유형이다**(`question-diversity.ts:508-522` `SHUFFLE_OPTION_TYPES`). 해설·오답해설에 평숫자 선지 지칭이 하나라도 있으면 `shuffleQuestionOptionsForDiversity` 가 **재배열을 통째로 포기**하고 원본을 그대로 돌려준다(`question-diversity.ts:580-594`). 잡 result·경고 어디에도 흔적이 없는 **조용한 실패**라 게이트(`gate-context-meaning.ts:242-258`)가 유일한 방어선이다.

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 | file:line |
|---|---|---|---|---|---|
| `optionCount` | number | 5 | **4~8** (`Math.round` 후 clamp, 비수 → 5) | 선지 줄 수 · 라벨 `①`~`⑧` · 오답해설 수(= optionCount − answerCount) | generic.ts:7-11,38-43 · prompts-context-meaning.ts:22-24,40-47 |
| `answerCount` (별칭 `correctAnswerCount`) | number | 1 | **1 ~ optionCount−1** | `정답:` 라벨 수 · 오답해설 수 · 발문 단수/복수 · `correctAnswers` 배열 생성 여부 | generic.ts:13-15,46-56 · prompts-context-meaning.ts:25-26,49-60 |
| `optionLanguage` | `"ko"`\|`"en"` | **`"en"`** | — | **en**: 선지 = 6단어 이내 영어 뜻풀이 구 / **ko**: 30자 이내 한국어 뜻풀이 | language.ts:41,64-72 · gate-context-meaning.ts:179-205 · prompts-context-meaning.ts:186-189 |
| `stemLanguage` | `"ko"`\|`"en"` | `"ko"` | — | **마크다운 본문 불변.** 발문만 영어로 교체(어댑터 후단) · 해설은 한국어 유지 | language.ts:41 · lane-context-meaning.ts:74-78,145-149,177-182 |
| `difficulty` (ITEM 헤더) | `BASIC`\|`INTERMEDIATE`\|`KILLER` | `INTERMEDIATE` | — | **마크다운 형식 불변.** 표적 설계 기준(근거 깊이 1문장/2문장/글 전체)과 품질 경고 기준만 바뀜 | qgen-core.ts:79-89 · prompts-context-meaning.ts:74-91 |

**설정 읽기 경로**: flat 우선 → `rawSettings["CONTEXT_MEANING"]` 중첩 폴백 — 수치 노브는 `shared.ts:88-102`, 언어 노브는 `language.ts:107-122`. qbank ITEM 헤더의 `settings:` JSON 은 `{CONTEXT_MEANING: {...}}` 로 병합된다(`qgen-core.ts:369-377`).

**적격성**(`lane-context-meaning.ts:113-129`): `4 ≤ optionCount ≤ 8 && 1 ≤ answerCount ≤ optionCount−1`. 범위 밖이면 레인 자체가 유형을 거부한다. 단 `parseAndGate` 로 들어오는 값은 이미 clamp 되므로 실질 방어는 게이트가 한다.

**과금 축**: `QUESTION_GEN_VOCAB`(1크레딧) — `SYNONYM`·`ANTONYM` 과 함께 3종만(`lane-context-meaning.ts:108`, `credit-costs`). qbank 은 과금 경로를 타지 않는다.

---

## 7. 함정 (전부 코드 근거 있음 · ★는 본 문서 프로브 음성테스트로 실증)

1. ★ **표적은 지문 전체에서 딱 1회만 등장해야 한다 — 대소문자 무시 카운트다.** `locateContextMeaningTarget` 이 `gi` 플래그로 세므로(`parser-context-meaning.ts:325`) 문두 대문자 재등장(`Reserves` … `reserves`)도 2회로 잡혀 「2회 등장」 반려(`gate-context-meaning.ts:306-310`). **후보를 고르기 전에 반드시 전수 카운트를 하라.**
2. ★ **표적은 지문 축자여야 한다 — 굴절형·대소문자까지.** 탐색은 대소문자를 무시하지만 게이트가 `slice !== word` 로 다시 비교한다(`:311-316`). 스냅이 유일 자리일 때만 구제하고, 그마저도 `AUTOSNAP` 경고를 남긴다.
3. ★ **기능어 단독 밑줄 금지.** `a/an/the/it/its/is/are/…` 20개 닫힌 집합(`question-quality/core.ts:422-424`). fast 레인은 warning 이지만 **md 는 반려로 승격**돼 있다(`gate-context-meaning.ts:12-14, 290-293`).
4. ★ **선지에 괄호를 쓰지 마라.** 후처리 `sanitizeSingleVocabOptionText` 가 괄호 **안을 말없이 삭제**한다(`postprocess/index.ts:233-242`). 게이트가 미리 반려하는 이유가 바로 그 조용한 글자 소실이다(`:158-162`).
5. ★ **해설·오답해설에 평숫자 선지 지칭 금지.** `1번 뜻`·`선지 3`·`보기 2`·`(3)`·`①~③`. 이 유형은 **"사전 1번 뜻"이 정답 기제를 설명하는 가장 자연스러운 한국어**라 발생 확률이 유독 높다(`gate-context-meaning.ts:227-239` 주석). 선지를 가리킬 때는 **내용을 인용하거나 원문자 단독**(`③과 견주면`)만 써라 — 원문자 단독은 셔플이 재매핑하므로 안전하다.
6. ★ **유닛 내 표적 재사용 = 유닛 전체 차단.** `diversityTargets` 가 `underlinedWord` 하나를 낸다(`lane-context-meaning.ts:203-209`) → 두 문항이 같은 단어를 밑줄 치면 `ANSWER_DUPLICATE`(`qgen-core.ts:336-353`). N문항이면 **서로 다른 N개 표적**이 필요하다.
7. ★ **`settings` 와 실제 선지 수가 어긋나면 즉시 반려.** 헤더 `optionCount:6` 인데 선지 5개 → 「선지 5개 (6개 필요)」 하나로 **즉시 return** 되어 다른 결함이 전부 가려진다(`gate-context-meaning.ts:359-361`). 헤더와 본문을 함께 고쳐라.
8. ★ **오답해설은 정답을 뺀 **모든** 선지에 정확히 한 줄.** 개수가 아니라 라벨 대응이다. 정답 줄을 오답 목록에 끼우면 파서가 **조용히 버려서**(`parser-context-meaning.ts:273-275`) 개수만 줄어든다.
9. ★ **optionLanguage=en 인데 한국어 선지를 쓰면 반려.** 기본값이 **en** 이다(`language.ts:41`) — 한국어 뜻풀이를 쓰려면 반드시 `settings:{"optionLanguage":"ko"}` 를 함께 적어라.
10. ★ **선지가 표적 단어(또는 굴절형)면 동어반복 반려.** `charge` 표적에 `charging` 선지 → 반려(`gate-context-meaning.ts:168-177`). 단일 토큰끼리만 비교하므로 다단어 선지는 검사 대상이 아니다.
11. **`밑줄:` 값을 두 줄로 쓰지 마라.** `(.+)$` 가 개행을 못 먹어 뒷줄이 사라진다(`parser-context-meaning.ts:202-205`).
12. **표적이 다른 단어의 부분문자열이면 스냅이 안 돈다.** `autoSnap` 의 첫 분기가 `passage.includes(word)` 라는 **단어 경계 없는** 검사이기 때문(`:363`). `sect`(← `section`) 같은 표적은 무보정으로 게이트에 도달해 「축자로 없음」이 뜬다.
13. **표적 앞이 `the word/term/phrase` · `called` · `named` · `known as` · `meaning` · `means` · `refers to` 면 반려.** 지문이 뜻을 직접 알려 주는 자리다(`gate-context-meaning.ts:52-53, 322-325`). 따옴표로 감싸인 토큰도 같은 이유로 반려(`:326-330`).
14. **문장 중간의 대문자 시작 단어(고유명사)는 표적이 될 수 없다.** 문장 첫 단어인지 여부는 앞 문자가 `.!?:;"'“”‘’()[]—–-` 인지로 판정한다(`:56-65, 333-341`). 즉 **문두 대문자 표적은 통과**하지만, 앞의 함정 1(대소문자 무시 카운트)과 겹치기 쉽다.
15. **선지 형태 평행성.** 정답만 다단어이고 나머지가 **전부** 한 단어면 반려(`:213-222`). 반대 방향(정답만 1단어)은 검사하지 않지만 §3 규범 6(층위 일치) 위반이다.
16. **복수 정답 구분자는 `,` 와 `·` 뿐.** `②와 ④`·`② 및 ④` 는 두 번째가 사라진다(`parser-context-meaning.ts:256`).
17. **해설 본문 안에서 줄머리에 `오답`/`정답`/`밑줄` + 콜론을 쓰지 마라.** 그 줄부터 해설이 잘린다(`:216-225`). 불릿을 붙여도(`- 정답: …`) 똑같이 잘린다.
18. **해설의 영어 인용은 12자 이상이면 실재해야 한다.** 검사 코퍼스에 **원 지문이 포함**되므로(`explanation-quoted-tokens.ts:122`) 지문 문장을 축자로 인용하는 것은 안전하다. 임의 조합·의역 인용은 error.
19. **해설은 한국어만.** 한자·가나 혼입, `steals다` 류 접합은 error(`explanation-foreign-text.ts`). 표적 단어를 한국어 문장에 섞을 때는 조사만 붙여라(`cheap 은`) — 종결어미 직결(`cheap다`)은 반려.
20. **투명 직역 표적 금지(실측 최다 결함).** 밑줄만 보고 사전 대표 의미로 바꿔도 정답이 되면 그건 `SYNONYM` 이다(`prompts-context-meaning.ts:89, 202`). 게이트가 못 잡는 축이므로 저작·검수가 책임진다.
21. **오답이 전부 정답과 동떨어진 의미장에 있으면 안 된다.** 최소 2개는 정답과 같은 의미장(근접 도메인)에 둔다 — 도메인 매칭만으로 즉답되는 것이 실측 최다 결함(`prompts-context-meaning.ts:119`). 이것도 게이트 밖이다.

---

## 8. 출제 포인트 다각화 축

> 한 지문에서 이 유형으로 5~8문항을 만들 때, **무엇을 달리해야 "N개 문항"이 되는가**.

### 8-A. 하드 제약 — 이것이 다각화를 강제한다

`ANSWER_DUPLICATE` 가 `underlinedWord` 를 유닛 범위에서 유일하게 만든다(`lane-context-meaning.ts:203-209` + `qgen-core.ts:336-353`). 즉 **N문항 = 서로 다른 N개 표적**이다. 그리고 각 표적은

1. 지문 전체에서 **정확히 1회**(대소문자 무시) 등장하고,
2. **기능어가 아니고**,
3. **문장 중간 대문자 토큰이 아니고**,
4. **인용·언급 자리가 아니고**,
5. **리트머스 검사를 통과**(사전 대표 의미로 바꾸면 문장이 무너짐)해야 한다.

**후보 풀 실측**(코퍼스 4,537지문, "1회만 등장 + 3자 이상 + 기능어 제외" 기준): min **12** · p05 **39** · p50 **61** · max 155. **8개 미만인 지문은 0건.** → 1~4번 조건은 수량 제약이 되지 않는다. **진짜 병목은 5번(다의성·문맥 의존성)이다.**

**저작 절차**: ① 지문에서 1회만 등장하는 내용어를 전부 뽑는다 → ② 각 후보에 리트머스 검사를 돌려 "사전 대표 의미로 바꾸면 문장이 어색해지는" 것만 남긴다 → ③ 남은 후보를 아래 축으로 배분한 **표를 먼저 확정**한다 → ④ 문항을 쓴다. 이 순서를 뒤집으면 마지막 문항에서 반드시 막힌다.

### 8-B. 노브로 달라지는 축 (코드 근거)

| 축 | 값 | 문항이 실제로 달라지는 지점 | 근거 |
|---|---|---|---|
| `optionCount` | 4 / 5 / 6 / 7 / 8 | 오답 기제 슬롯 수(= optionCount − answerCount). 5기제 분류학을 4슬롯에 압축할지 7슬롯으로 펼칠지가 달라진다 | prompts-context-meaning.ts:99-122 |
| `answerCount` | 1 / 2 / 3 | 발문이 단수↔복수로 갈리고(`adapter:102-104`), **"이 문맥에서 성립하는 서로 다른 측면 K개"** 를 찾는 완전히 다른 과제가 된다 | prompts-context-meaning.ts:193-196 |
| `optionLanguage` | en / ko | **인지 작업이 실제로 바뀐다.** en 은 영영 뜻풀이 독해가 한 겹 더 얹히고, ko 는 순수 문맥 판단만 남는다 | gate-context-meaning.ts:179-205 |
| `difficulty` | BASIC / INTERMEDIATE / KILLER | 표적 선정 기준이 **근거 깊이 1문장 → 앞뒤 2문장(대조 표지 뒤) → 글 전체 논지·태도**로 이동 | prompts-context-meaning.ts:74-91 |
| `stemLanguage` | ko / en | 발문 언어만. **다각화 축으로는 약하다** — 이것만 다른 두 문항은 사본이다 | lane-context-meaning.ts:145-149,177-182 |

### 8-C. 설계로 달라지는 축 (교육적 판단 — 여기가 진짜 승부처)

1. **표적의 다의 유형**(닫힌 3축, `prompts-context-meaning.ts:84-87`)
   - (1) **다의어의 비주류 뜻** — 사전에 있으나 먼저 외우는 뜻이 아닌 것 (`run`·`address`·`charge`·`keep`·`hold`)
   - (2) **비유·전이 의미** — 구체 영역 단어가 추상 영역으로 (경제 글의 `hunger`, 생태 글의 `currency`)
   - (3) **태도·격식·연어로만 결정되는 의미** — 사전 뜻 목록에 그대로는 없고, 필자의 평가나 붙어 있는 짝이 있어야 확정
   → 5문항이면 (1)(1)(2)(3)(3) 처럼 배분한다. KILLER 에는 (3)을 최우선.
2. **표적의 형태 대역** — 단일 동사 / 단일 명사 / 형용사·부사 / **구동사·관용구**(최대 5단어 허용이 이 축을 열어 준다, `gate:279-283`). 형태가 바뀌면 학생이 동원하는 언어 지식이 바뀐다.
3. **논지 위치** — 도입 통념 / 개념 정의 / 기제 설명 / 사례·데이터 / 대조·전환 / 결론·경고. 지문의 논증 구조를 순회하면 학생은 매번 다른 문장을 정독하게 된다.
4. **근거 깊이·거리** — ① 밑줄 문장 안에서 확정 ② 앞뒤 인접 문장의 인과·대조로 확정 ③ 글 전체의 논지·태도로만 확정. 이것이 실질 난이도 축이다(헌법 §4).
5. **오답 기제 팔레트**(닫힌 5기제, `prompts-context-meaning.ts:105-111`)
   | 기제 | 정의 |
   |---|---|
   | **대표뜻** | 그 단어를 배울 때 가장 먼저 외우는 의미 — **이 유형의 최강 미끼, 매 문항 필수**(`:114`) |
   | **폴리세미** | 다른 문맥이라면 실제로 가질 수 있는 또 하나의 사전 뜻 |
   | **문맥 유혹 오독** | 주변 문장의 소재·이미지·연상이 부르는 뜻 |
   | **근접 의미장** | 정답과 같은 도메인이나 정도·방향·함축이 어긋난 뜻 |
   | **연어 오독** | 붙어 있는 짝(전치사·목적어·관용구)을 다른 관용으로 읽은 뜻 |
   → 대표뜻은 고정 슬롯이므로, **나머지 슬롯을 문항마다 다르게 조합**하는 것이 팔레트 다각화다. 5지선다 4슬롯이면 `대표뜻+폴리세미+문맥유혹+근접의미장` / `대표뜻+연어오독+폴리세미+근접의미장` / `대표뜻+문맥유혹+연어오독+근접의미장` … 처럼 돌린다.
6. **정답 뜻이 속한 의미 도메인** — 물리·수량 / 시간 / 경제·비용 / 심리·태도 / 사회·관계. 문항마다 도메인을 바꾸면 "정답만 이 지문 소재와 붙어 있다"는 표면 단서가 생기지 않는다.
7. **리트머스 강도** — 사전 대표 의미를 대입했을 때 문장이 ① **문법까지 깨지는가**(BASIC) ② **읽히지만 어색한가**(INTERMEDIATE) ③ **매끄럽게 읽히지만 글 전체 논지와 어긋나는가**(KILLER). ③이 이 유형 최고 난도의 정의다.
8. **정답 라벨 위치** — 셔플이 저장 직전에 재배열하지만(`question-diversity.ts:508-522`), 마크다운 원본에서 정답이 매번 `①②` 앞자리에 몰리면 검수·수리 단계의 인간 앵커링이 생긴다. 유닛 안에서 흩어라(프롬프트도 예시 라벨을 홀수 인덱스부터 뽑아 앵커링을 피한다: `prompts-context-meaning.ts:130-134`).

### 8-D. 5문항 유닛 표준 배분 (권장 템플릿)

| # | difficulty | option·answer | 표적 형태 | 다의 유형 | 논지 위치 | 근거 거리 | 오답 팔레트(대표뜻 고정 + 3) |
|---|---|---|---|---|---|---|---|
| 1 | BASIC | 5·1 | 단일 명사 | (1) 비주류 뜻 | 개념·전제 문장 | 같은 문장 | 폴리세미 · 문맥유혹 · 근접의미장 |
| 2 | INTERMEDIATE | 5·1 | 형용사·분사 | (1) 비주류 뜻 | 기제 설명 | 인접 2문장(because 절) | 문맥유혹 · 근접의미장 · 폴리세미 |
| 3 | INTERMEDIATE | 5·1 | 단일 동사 | (2) 전이 의미 | 대조·전환 | 앞뒤 2문장 | 폴리세미 · 근접의미장 · 문맥유혹 |
| 4 | KILLER | **6·1** | **구동사** | (3) 연어 결정 | 비교·대조 | 밑줄 문장 밖까지 | 연어오독 · 폴리세미 · 문맥유혹 · 근접의미장 |
| 5 | KILLER | 5·1 | 추상 명사 | (2) 비유 의미 | 첫 문장 개념어 | **글 전체 종합** | 문맥유혹 · 폴리세미 · 근접의미장 |

8문항으로 늘릴 때 추가할 3칸: **`answerCount=2`(복수 정답) 1문항** · **`optionLanguage="ko"` 1문항** · **`optionCount=8`(오답 7슬롯) 1문항**. 이 셋은 노브만으로 인지 작업이 실제로 달라지는 자리다.

(본 문서 §검증 로그의 프로브가 정확히 위 5문항 배분으로 blocking 0 · qualityBlocking 0 을 통과했다.)

---

## 검증 로그

- 프로브: `qbank/work/_probe-CONTEXT_MEANING.ts` — 실코퍼스 지문 `2027_06_5095396-q23`(180단어)에 §2 골격으로 **5문항 유닛**을 손으로 저작해 `gateUnit`(parser → autosnap → gate → adapt → postProcess → validateQuestionQuality → POINT/ANSWER 중복)에 통과시켰다.
- 결과: `blocking 0 / qualityBlocking 0`, 전 문항 `gate 0 · adapt true · post true · qErr 0`.
  표적: `reserves` / `streamlined` / `afford` / `get by` / `telescoping` (5종 유일).
  경고 2건은 `few-key-points`(KILLER 2문항) — 어댑터가 `keyPoints: []` 를 고정으로 내므로 **구조적으로 불가피**하며 비차단이다. `AUTOSNAP` 경고 0.
- 음성테스트 **10/10 검출**: 축자 불일치 · 2회 등장 · 기능어 단독 · 선지 괄호 주석 · 해설 평숫자 지칭 · 유닛 내 표적 재사용 · settings↔선지 수 불일치 · 오답해설 1줄 삭제 · 영어 설정에 한글 선지 · 선지 동어반복.
- 실행: `./node_modules/.bin/tsx qbank/work/_probe-CONTEXT_MEANING.ts`
