# 조건부 영작 (CONDITIONAL_WRITING)

> 분류 **서술형(선지 없음)** · 지문변형 **없음 — 이 유형의 마크다운에는 지문이 아예 없다**(`parser-conditional-writing.ts:6-8`) · 정답 머리표 **`모범답안:`** (`정답:` 은 구형 폴백 별칭) · 최소 지문 길이 **md-qgen 자체 하한 0**(`lane-conditional-writing.ts:48-50` `isEligible(){return true}`), **qbank 계획 하한 95단어·4문장**(요지 그룹 p05 실측 — `qbank/harness/plan.mjs:118,127-160`)
>
> 검증: `qbank/work/_probe-CONDITIONAL_WRITING.ts` — **37/37 PASS**
> (유닛 6문항 `blocking 0` · `qualityBlocking 0`, 노브 4축, 함정 20종, 경계값 5종, 유닛 중복 게이트 2종)
> 상위 계약: [`../recon/00-contract.md`](../recon/00-contract.md) · 품질 규범: [`../quality-constitution.md`](../quality-constitution.md) · 저작 지침: [`../craft/00-AUTHORING.md`](../craft/00-AUTHORING.md)

> ⚠ **품질 헌법 §0 「지문 변형 허용 범위」표는 이 유형을 ○(지정 문장의 통사 변형)으로 분류하지만, 코드상 변형 대상은 지문이 아니라 `모범답안`이다.**
> 이 유형의 md 문서에는 지문 필드가 존재하지 않고(§3), 학생 화면의 지문은 원문 그대로 INLINE 렌더된다
> (`src/app/t/[token]/taking-parts/question-view.tsx:34-48` `PASSAGE_CONTENT_SUBTYPES`).
> **따라서 지문 재구성 대조 게이트도, 인라인 마커(`[[A:…]]`)도 이 유형에는 없다.** 마커를 쓰면 그 문자열이 그대로 학생 화면에 인쇄된다.

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

학생 화면에는 **원문 지문 전체 + 한국어 문장 1개 + 작성 조건 목록**이 함께 놓인다
(`student-safe-data.ts:347-352` — 학생에게 노출되는 필드는 `referenceSentence` 와 `conditions[]` 둘뿐).
학생은 그 한국어 문장을 **조건을 전부 만족시키는 영어 한 문장**으로 옮긴다.

핵심은 「번역」이 아니다. **지문이 눈앞에 있으므로 원문 문장을 찾아 베껴 쓰는 경로가 항상 열려 있고, 조건이 그 경로를 끊는 유일한 장치**다.
프롬프트가 이 설계를 한 줄로 못박는다 — *"조건 ②가 지문 원문의 첫 단어를 봉쇄하고 조건 ①이 도치 가정법을 강제하는 순간, **학생이 지문을 찾아 베껴 쓰는 경로가 조건 자체로 끊긴다**"* (`prompts-conditional-writing.ts:48`).

즉 요구되는 인지 작업은 **「같은 명제를 지정된 통사 장치로 재생성하기」**다:
① 한국어 문장에서 명제를 복원하고 → ② 원문 어휘·연결어가 봉쇄된 상태에서 → ③ 지정된 구문(가정법 도치·분열문·분사구문 등)으로 그 명제를 **처음부터 다시 조립**한다.

그래서 이 유형의 게이트는 다른 어떤 유형보다 **「정답이 지문의 복사인가」**를 집요하게 본다 —
게이트 #5 는 축자 복사와 근사 복사를 두 겹으로 잡고(`gate-conditional-writing.ts:281-302`),
같은 축이 `validateQuestionQuality` 에도 `cond-writing-verbatim-answer`(error, RELAXED_BLOCKING)로 이중 배치돼 있다(`dispatcher.ts:1072-1090`).

### 다른 유형과의 구별

| 유형 | md 안의 지문 | 정답 머리표 | 정답의 형태 | 채점 |
|---|---|---|---|---|
| **CONDITIONAL_WRITING** | **없음** | **`모범답안:`** | 영어 완성 문장 1개(6~40단어) | **MANUAL_ONLY**(`answer-spec.ts:250,271-273`) |
| `SENTENCE_TRANSFORM` | 없음 (`originalSentence` 로 원문 문장을 실음) | `모범답안:` | 영어 문장 1개 | MANUAL_ONLY (같은 `FREE_WRITING` 집합) |
| `WORD_ORDER` | 없음 (`scrambledWords[]`) | `모범답안:` | 어순 배열 결과 | 규칙 채점 가능 |
| `SUMMARY_WRITING` | 없음 (`summaryWithBlanks`) | **`정답(A):`** 계열 | 빈칸별 어구 | 빈칸 대조 |
| `BLANK_INFERENCE`(정본) | **있음**(`빈칸지문:`) | `정답:` + 선지 ①~⑤ | 원문자 | 자동 |

★ 결정적 차이 3가지
1. **선지가 없다.** `options` 키를 만들면 `correctAnswer`(= 영어 문장)가 어떤 선지와도 안 맞아 `correct-answer-mismatch`(RELAXED_BLOCKING)로 죽는다 — `adapter-conditional-writing.ts:14-16`.
2. **`정답:` 줄을 쓰지 않는다.** `모범답안:` 이 정답의 유일 진실원이고 어댑터가 `correctAnswer` 로 복제한다 — `adapter-conditional-writing.ts:58-60`. (`정답:` 은 **모범답안이 없을 때만** 폴백으로 채택 — `parser-conditional-writing.ts:255-256`.)
3. **`오답:` 블록이 없다.** 오답 선지 개념 자체가 없으므로 품질 헌법 §3 의 (L,F) 택소노미는 **조건 설계와 채점기준 설계**로 번안된다(§8-C).

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (플레이스홀더 `<꺾쇠>`)

```md
우리말: <표적 문장의 한국어 번역 한 줄. 영어를 한 글자도 쓰지 마라(괄호 병기·인용 포함). 원문의 절·수식어를 잘라내지 말고 의미 범위 1:1.>
조건:
- <조건 1 — 학생이 답안에 문자 그대로 써야(또는 쓰지 말아야) 하는 표현만 작은따옴표로 감쌀 것>
- <조건 2>
- <조건 3 (선택)>
모범답안: <조건을 전부 만족하는 영어 완성 문장 한 줄. 6~40단어. 지문 문장의 복사가 아닐 것.>
채점기준:
- <채점 항목 1 — 무엇을 확인해 몇 점인지>
- <채점 항목 2>
- <채점 항목 3 (선택)>
해설: <한국어 2문장. ① 각 조건이 모범답안의 어느 부분에서 어떻게 충족되는지 ② 원문 대비 어떤 시제·태·구문 전환을 썼는지. 합니다체. 30~400자.>
```

**개수 계약**: 조건 `난이도별 최소`(BASIC 1 / INTERMEDIATE 2 / KILLER 2) `~ 4개` · 채점기준 `2~5개` · 모범답안 `6~40단어` · 해설 `30~400자`.
**섹션 순서는 파서가 강제하지 않는다**(§3-R20). 그러나 **`해설:` 은 반드시 문서 마지막**에 둬라 — 해설 섹션이 뒤따르는 텍스트를 흡수하기 때문이다(§3-R14).

### 2-2. ★ 검증된 정상 픽스처 전문 — `scripts/_test-md-conditional-writing.ts:41-61`

원본 소스(지문·모범답안 상수 포함, verbatim):

```ts
const PASSAGE =
  "Museums that display historical dress face a peculiar difficulty. " +
  "Garments survive, but the gestures that once animated them do not. " +
  "Without the information contained in art, such displays would be an awkward imitation of the original makers' intentions. " +
  "Painters recorded how a sleeve was pushed back and how a collar was left open, and those records let curators restore posture as well as fabric. " +
  "What looks like a technical detail is therefore a form of historical evidence.";

const MODEL_ANSWER =
  "Had it not been for the information art contains, these exhibits would merely imitate what their first makers intended, awkwardly.";
```

전개된 마크다운 실물 (`GOOD` — 픽스처 테스트에서 `gate 0` · `corrections 0` · `quality error 0` 확인):

```md
우리말: 예술에 담긴 정보가 없다면, 그러한 전시는 원래 제작자들의 의도를 어색하게 모방한 것에 그칠 것이다.
조건:
- 'Had it not been'으로 시작할 것
- 'without'을 사용하지 말 것
- 총 20단어로 쓸 것
모범답안: Had it not been for the information art contains, these exhibits would merely imitate what their first makers intended, awkwardly.
채점기준:
- 도치 가정법 'Had it not been for'를 정확히 쓰면 2점
- 금지어 없이 같은 조건 의미를 전달하면 1점
- 총 20단어 조건을 지키면 1점
해설: 조건 ①은 도치 가정법 'Had it not been for'로 충족되고, 조건 ②는 원문의 전치사 대신 그 도치 구문이 같은 조건 의미를 지게 하여 지켜집니다. 원문의 명사구를 동사구로 풀어 쓰고 과거 사실의 반대 가정으로 시제를 옮겨 총 20단어를 맞추었습니다.
```

> 이 픽스처의 설계가 왜 아름다운지: 조건 ②(`'without'` 봉쇄)가 **지문 문장의 첫 단어**를 막고, 조건 ①이 도치 가정법을 강제한다.
> 두 조건이 동시에 걸리는 순간 「지문에서 찾아 베끼기」 경로가 **문항 설계 자체로** 차단되고, 채점자는 세 조건을 눈으로 세기만 하면 된다.

### 2-3. qbank 컨테이너 실물 (probe ITEM 4 — `gate 0` 실증)

```md
<!-- ITEM 4
difficulty: KILLER
point: S5 it-분열문으로 초점 이동 + 핵심 명사 봉쇄 — 대조 축을 유지한 채 강조 구조 도입
craft: 'strength' 봉쇄가 원문 대조항의 축자 복사를 끊고, 시작 자리 강제가 분열문 외의 경로를 막는다. 두 조건이 서로 다른 문법 축이라 KILLER 결합 요건을 충족한다
-->
우리말: 강철이 명성을 얻는 것은 순수한 강도 때문이 아니라 느리고 요란하게 항복하는 방식 때문이다.
조건:
- 'It is'로 시작할 것
- 'strength'를 사용하지 말 것
- 총 20단어로 쓸 것
모범답안: It is not brute force but the slow, noisy manner of its yielding that has earned steel its good name.
채점기준:
- 분열문 구조로 초점을 옮기면 2점
- 금지어 없이 강도의 의미를 대체하면 1점
- 원문의 대조 관계를 유지하면 1점
- 총 20단어 조건을 지키면 1점
해설: 조건이 강도를 뜻하는 원문 명사를 봉쇄하므로 다른 어휘로 대체하고 강조 대상을 앞으로 끌어낸 'It is not brute force but'의 분열문으로 초점을 옮겼습니다. 원문의 명사구를 'its yielding'이라는 동명사구로 바꾸어 총 20단어를 맞추었습니다.
```

`settings:` 줄로 노브를 준다: `settings: {"stemLanguage":"en"}` (`qbank/harness/qgen-core.ts:70-77, 369-378`).
ITEM 헤더는 **qbank 규약이지 md-qgen 규약이 아니다** — 하네스가 잘라낸 뒤의 본문만이 파서 계약 대상이다.

---

## 3. 파서 계약 (★ 가장 중요)

> 진실원은 `src/lib/md-qgen/parser-conditional-writing.ts` 다. `prompts-conditional-writing.ts` 의 지시가 느슨해도 파서가 계약이다.
> 이 파서는 **줄 단위 상태기계**다(`:150-154`). 줄 전체를 단일 정규식으로 잡지 않으므로 관용 범위가 넓지만,
> **관용은 계약이 아니다** — 저작 규칙은 `00-AUTHORING.md §7.2` 대로 **장식 0**.

### 3-A. 줄 전처리 — `stripDecoration` (`:102-134`)

모든 줄이 파싱 전에 이 함수를 통과한다. **순서대로** 적용된다.

| # | 규칙 | 원문 | file:line | 어기면 |
|---|---|---|---|---|
| R1 | `\r` 제거 + `trim()` | `line.replace(/\r$/,"").trim()` | `:103` | 선행/후행 공백은 무해 |
| R2 | 블록 인용 제거 | `s.replace(/^>+\s*/,"")` | `:105` | `> 해설: …` 도 인식된다(관용) |
| R3 | **코드펜스 줄은 통째 무시** | `CODE_FENCE_RE` = 줄머리가 역따옴표 3개 또는 물결 3개 | `:73,106-108` | 펜스 자체는 사라지지만 **펜스 안 내용은 그대로 값으로 흘러든다** |
| R4 | 표 구분행(`\|---\|---\|`) 무시 | `TABLE_SEPARATOR_RE = /^\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?$/` (단 `s.includes("\|")` 일 때만) | `:75,109-112` | — |
| R5 | 양끝 파이프 제거 → 내부 파이프가 남으면 **표 행**으로 처리: 셀 분리 → **첫 칸이 번호형이면 버림** → 나머지를 ` — ` 로 이어붙임 | `TABLE_INDEX_CELL_RE = /^(?:\d{1,2}[.)]?\|[①-⑩]\|(?:조건\|기준\|항목)\s*\d{0,2}\|no\.?\s*\d{1,2}\|#\d{1,2})$/i` | `:77-78,113-122` | **양끝 파이프가 없는 `3 \| 총 20단어로 쓸 것` 은 표로 인식되지 않아 파이프가 값에 남고 게이트 #7 이 반려**(probe **E15**) |
| R6 | 헤딩 접두 제거 + `heading=true` 표시 | `/^#{1,6}\s+/` | `:123-124` | 라벨이 아닌 헤딩은 **섹션 종료 신호**(R13) |
| R7 | 불릿 접두 제거 | `BULLET_RE = /^(?:[-*•‣▪]\s+\|[–—]\s+\|\d{1,2}[.)]\s+\|[①-⑩]\s*)/` | `:70,125-126` | **`-` 뒤 공백이 필수**(`- 조건`). `-조건` 은 불릿으로 안 벗겨진다 |
| R8 | **라벨을 감싼 굵게만** 흡수 (본문의 `**` 는 보존) | `/^\*\*(.*?)\*\*\s*$/` · `/^\*\*([^*]{1,24}[:：])\*\*/` · `/^\*\*([^*]{1,24})\*\*(\s*[:：])/` | `:127-132` | 조건 값 안의 `**Without**` 은 여기서 지워지지 않고 **스냅(3-C)** 이 처리한다 |

> ⚠ **R7/R8 은 관용이지 허가가 아니다.** 굵게·표·펜스를 쓰면 스냅이 `corrections[]` 를 남기고 하네스가 `AUTOSNAP` 경고를 찍는다(`qgen-core.ts:313`). probe **P9** 는 장식 0 저작에서 **보정 0건**임을 고정한다.

### 3-B. 라벨 매칭 — `labelRe` / `LABEL_TABLE` (`:53-68`, `matchLabel :136-142`)

```ts
function labelRe(core: string, indexed = false): RegExp {
  const index = indexed ? "\\s*\\d{0,2}\\s*(?:개|번|항)?" : "";
  const aside = "\\s*(?:[(（\\[][^)）\\]]{0,20}[)）\\]])?";
  return new RegExp(
    `^[<[(]?\\s*(?:${core})\\s*[>\\])]?${index}${aside}\\s*(?:[:：]\\s*(.*)|\\s*)$`,
  );
}
```

| # | 필드 | core 정규식 | indexed | file:line |
|---|---|---|---|---|
| R9a | `korean` | `(?:영작할\s*)?우리말(?:\s*문장)?` | ✗ | `:62` |
| R9b | `conditions` | `(?:작성\s*)?조건` | ✓ | `:63` |
| R9c | `modelAnswer` | `모범\s*답안?` | ✗ | `:64` |
| R9d | `criteria` | `채점\s*기준` | ✓ | `:65` |
| R9e | `explanation` | `해설` | ✗ | `:66` |
| R9f | `answerAlias` | `정답` | ✗ | `:67` — **모범답안이 없을 때만 쓰이는 폴백**(`:255-256`) |

**LABEL_TABLE 은 배열이고 첫 매치가 이긴다**(`:137-140`). 따라서 `정답` 은 항상 마지막에 검사된다.

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| R10 | **콜론은 값이 있을 때만 필수** — `(?:[:：]\s*(.*)\|\s*)$` | `:57` | `우리말은 …` 같은 산문은 라벨로 오인되지 않는다. **반대로 `조건` 만 적힌 단독 줄은 섹션을 연다** |
| R11 | 전각 콜론 `：` 허용 · 양옆 `< [ ( > ] )` 허용 · **괄호 부연 접미 20자까지** 허용(`모범답안(예시):`) | `:55-58` | 부연이 20자를 넘으면 라벨로 안 잡히고 **그 줄이 직전 열린 섹션으로 흘러든다** |
| R12 | `조건`·`채점기준` 만 번호 라벨 허용 (`조건 1:` `조건 3개:` `채점기준 2번:`) | `:54` | `모범답안 1:` 은 라벨이 아니다 |

### 3-C. 상태기계 — `parseMdConditionalWriting` (`:155-260`)

| # | 규칙 | 원문 | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|
| R13 | **빈 줄은 섹션을 닫지 않는다.** 펜스·구분행·빈 줄은 `continue` | `:176-178` | `:176-178` | 조건 목록 중간의 빈 줄은 무해 |
| R14 | **알 수 없는 헤딩은 섹션 종료** | `if (heading) { section="none" }` | `:223-226` | `## 지문` 을 뒤에 붙여도 해설이 오염되지 않는다 |
| R15 | 수평선(`---` `===` `___` `***`)도 섹션 종료 | `HORIZONTAL_RULE_RE = /^[-=_*]{3,}$/` | `:71,181-184` | — |
| R16 | **값이 있는 `우리말:`/`모범답안:`/`정답:` 은 섹션을 열지 않는다**(`section="none"`). 값이 비면 섹션을 열고 **다음 본문 줄 1개**를 값으로 삼은 뒤 닫는다 | `:189-200, 228-236` | `:189-200` | `모범답안:` 단독 줄 + 다음 줄 값 = 정상 동작 |
| R17 | **`조건:`/`채점기준:` 은 값 유무와 무관하게 섹션을 연다.** 라벨 줄의 값은 인라인 불릿을 벗겨 첫 항목으로 push | `stripInlineBullet` `:144-147, 201-212` | `:201-212` | `조건: - 'X'로 시작할 것` 도 항목 1개로 받는다 |
| R18 | **`해설:` 섹션은 뒤따르는 줄을 계속 흡수한다.** 단 보수 가드 — 이미 해설을 받은 뒤 오는 **한글 0글자 + 30자 이상**인 줄은 지문 에코로 보고 섹션을 닫는다 | `:239-248` | `:243-246` | 해설 뒤에 한국어 잡문을 붙이면 **그대로 해설에 합쳐진다**(게이트 #12 상한이 잡는다) |
| R19 | 여러 줄 해설은 **공백 1개로 join** | `explanationLines.join(" ").trim()` | `:258` | 해설에 `\n` 이 남지 않는다 |
| R20 | **필드 순서를 파서가 강제하지 않는다** — LABEL_TABLE 은 순서 무관 | `:186-219` | — | 그러나 R18 때문에 `해설:` 은 반드시 마지막 |
| R21 | **첫매치 규칙** — `korean`/`modelAnswer`/`answerAlias` 는 `if (!x) x = value` 로 **첫 값만** 채택 | `:190,194,198` | — | 두 번째 `우리말:` 줄은 무시된다. **단 두 번째 라벨의 값이 비면 섹션이 열려 다음 줄이 값을 덮어쓴다**(`:229`) — 라벨을 두 번 쓰지 마라 |
| R22 | 조건·채점기준은 **append** — 라벨이 두 번 나오면 항목이 합산된다 | `:204,210,237-238` | — | 1 마크다운 = 1문항 계약 위반 시 조건 개수 초과로 죽는다 |

> ### ★ 1 마크다운 = 1문항 (00-contract §3)
> 두 문항을 이어 붙이면 **2번 문항의 `우리말:`·`모범답안:` 은 조용히 버려지고**(R21) **조건·채점기준만 1번에 합산돼**(R22)
> `조건 6개 — 4개 이하여야 한다` 라는 **원인과 무관한 사유**로 죽는다. 하네스의 `<!-- ITEM n -->` 로 반드시 잘라라.

### 3-D. 0원 자동 보정 — `autoSnapConditionalWriting` (`:356-401`)

| # | 보정 | 원문 | file:line |
|---|---|---|---|
| S1 | `우리말`·`모범답안` 을 통째로 감싼 `**…**` · `` `…` `` · `"…"` 제거 | `unwrapValue :265-276` | `:362-368` |
| S2 | 작은따옴표는 **내부에 아포스트로피가 없을 때만** 벗긴다(`makers'` 보호) | `:273-274` | — |
| S3 | 조건·채점기준의 `**X**` / `` `X` `` 영어 토큰 → **작은따옴표로 승격**(= 기계 검증 대상화). 단 `shouldPromoteToken` 통과분만 | `tidyConditionText :329-349` | `:370-386` |
| S4 | **승격 금지 목록** — 문법 용어 30종(`passive voice`·`inversion`·`subjunctive`·`cleft`·`relative clause` …) + 머리 단어 정규식 | `CW_GRAMMAR_TERMS :283-292` · `CW_GRAMMAR_HEAD_RE :294-295` | — |
| S5 | 승격 조건: **금지 신호가 있으면 무조건 승격** / 모범답안에 실재하면 승격 / **단일 영어 토큰이면 승격** | `:310-320` | — |
| S6 | 나머지 `**`·백틱은 표기만 제거, 공백 축약 | `:345-348` | — |
| S7 | 해설은 **공백만** 다듬는다(대시·말줄임 치환 금지) | `:397` | — |
| S8 | **의미가 걸린 값(조건 숫자 ↔ 모범답안 단어 수)은 절대 손대지 않는다** — 어느 쪽이 진실인지 코드가 모른다 | `:351-354` | — |

> **스냅에 기대지 마라.** 승격은 조건의 **기계 의미를 바꾸는** 보정이라 `corrections[]` 에 명시되고 하네스 경고가 뜬다.
> 처음부터 작은따옴표로 써라 — 그리고 **문법 용어에는 절대 따옴표를 쓰지 마라**(§7 T3).

### 3-E. 이 유형에 **없는** 것 (다른 유형 습관이 죽는 자리)

| 없는 것 | 근거 | 쓰면 |
|---|---|---|
| 지문 필드(`빈칸지문:`·`밑줄지문:` 등) | `parser-conditional-writing.ts:6-8` | 라벨이 아니므로 직전 섹션으로 흘러들거나(→ 조건 오염) 무시된다 |
| 인라인 마커 `[[A:x]]` `[[1]]` `[[them]]` | 마커 수집 코드 자체가 없다 | 문자열 그대로 학생 화면에 인쇄 |
| 지문 재구성 대조 게이트 | `parser-conditional-writing.ts:6-7` | — |
| 선지 `① ② ③` | 어댑터가 `options` 를 만들지 않는다 `adapter-conditional-writing.ts:14-16` | ①로 시작한 줄은 **불릿로 취급돼 벗겨진다**(R7) → 조건/채점기준 항목으로 흡수 |
| `정답:` 을 정본으로 쓰기 | `:255-256` 은 폴백일 뿐 | 모범답안이 있으면 `정답:` 값은 **버려진다** |
| `오답:` 블록 | 라벨 테이블에 없다 | 직전 섹션(해설)으로 흡수 → 해설 400자 초과로 반려 |

---

## 4. 게이트 체크리스트

### 4-1. `gateMdConditionalWriting` 반려 사유 전수 — `src/lib/md-qgen/gate-conditional-writing.ts:189-441`

호출: `lane.parseAndGate` → `gateMdConditionalWriting(q, ctx.passage, { difficulty: ctx.difficulty })` (`lane-conditional-writing.ts:75-84`).
`requireCriteria` 기본 `true`(`:195`) — **레인은 이 옵션을 넘기지 않으므로 채점기준은 항상 필수다.**

| # | 사유 문자열 | 조건 | file:line |
|---|---|---|---|
| G01 | `조건 {N}번이 비었음` | trim 후 빈 항목 | `:148-151` |
| G02 | `조건 {N}번이 한국어 지시문이 아님: '{앞40자}'` | `!containsHangul(condition)` | `:152-154` |
| G03 | `조건 {N}번이 너무 김({len}자) — 한 줄 지시문으로 줄여라` | `length > 120` | `:155-157` |
| G04 | `조건 {N}번에 마크다운 잔재가 남아 있음(받은 값: '{앞40자}') — …` | `CW_MARKDOWN_RESIDUE_RE` = 파이프 · 역따옴표 · 별표 2개 중 하나라도 존재 (`:65`) | `:158-163` |
| G05 | `조건 {N}번에 모범답안이 노출됨(겹친 구간: "{run}") — …` | 인용 스팬 제거 후 `answerRunInPassage(modelAnswer, condition, 3)` | `:164-173` |
| G06 | `조건 {N}번이 앞 조건과 중복: '{앞40자}'` | `normalizeComparableText` 동일 | `:174-178` |
| G07 | `우리말 줄을 인식할 수 없음 — 영작할 한국어 문장이 비었다` | `korean` 빈값 | `:204` |
| G08 | ``모범답안 줄을 인식할 수 없음 — 이 유형의 정답은 `모범답안:` 줄이 유일 진실원이다`` | `modelAnswer` 빈값 | `:205-207` |
| G09 | ``조건 항목이 하나도 없음 — `조건:` 아래에 `- ` 목록으로 적어라`` | `conditions.length === 0` | `:208-210` |
| G10 | `해설 누락` | `explanation` 빈값 | `:211` |
| — | **조기 반환** — `korean` 또는 `modelAnswer` 가 없으면 여기서 종료. **단 G01~G06 은 그 앞에서 이미 돌았다** | | `:213,215` |
| G11 | `우리말 줄이 한국어가 아님(받은 값: '{앞50자}')` | `!containsHangul(korean)` | `:218-220` |
| G12 | `우리말 줄에 모범답안의 영어 표현이 노출됨: "{run}" — …` | `answerRunInPassage(modelAnswer, korean, 3)` | `:221-225` |
| G13 | `우리말 줄에 조건의 인용 표현이 그대로 적혀 있음: "X", "Y" — …` | 조건의 인용 토큰(3자+)이 우리말에 문자로 존재 | `:231-249` |
| G14 | `우리말 줄에 영어 어구가 섞여 있음: "{앞50자}" — …` | `/[A-Za-z][A-Za-z'-]*(?:[ \t]+[A-Za-z][A-Za-z'-]*)+/` — **영어 2어절 연속** | `:63,250-255` |
| G15 | `모범답안이 영어 문장이 아님(받은 값: '{앞50자}')` | `!containsLatinLetter` | `:258-260` |
| G16 | `모범답안에 한글이 섞여 있음 — 영어 완성 문장 한 줄이어야 한다` | `containsHangul(modelAnswer)` | `:261-263` |
| G17 | `모범답안이 여러 줄임 — 완성 문장 하나를 한 줄로 써라` | `/\n/.test(q.modelAnswer)` — **파서가 줄 단위라 `\n` 이 들어올 수 없다 → 실질 도달 불가**(probe E12 실증) | `:264-266` |
| G18 | `모범답안이 {n}단어 — 6~40단어여야 한다` | `countWords` 범위 밖 | `:269-274` (상수 `prompts-conditional-writing.ts:31-32`) |
| G19 | `모범답안이 지문 문장의 축자 복사임: "{앞70자}" — …` | 구두점 제거·소문자화 후 `passage.includes(answer)` | `:281-286` |
| G20 | `모범답안이 지문 문장의 사실상 통째 복사임(연속 일치: "{run}") — …` | 내용토큰 6개+ 이고 `answerRunInPassage(answer, passage, max(6, ceil(n*0.8)))` | `:287-301` |
| G21 | `조건 {n}개 — {difficulty} 난이도는 {min}개 이상 필요하다` | `0 < n < CW_MD_CONDITION_MIN[difficulty]` | `:305-309` |
| G22 | `조건 {n}개 — 4개 이하여야 한다(학생이 동시에 만족시킬 수 없다)` | `n > 4` | `:310-314` |
| G23 | `조건 중에 기계로 검증 가능한 항목이 없음 — …` | `!conditions.some(isMachineCheckableCondition)` | `:319-323` |
| G24 | `조건 위반 — CONDITIONAL_WRITING condition "…" requires exactly N word(s), but modelAnswer has M. …` | 정본 검증기 (a) | `:326-331` · `validators/conditional-writing.ts:62-79` |
| G25 | `조건 위반 — CONDITIONAL_WRITING condition "…" forbids "T", but modelAnswer still uses it. …` | 정본 검증기 (c) | 〃 `:84-97` |
| G26 | `조건 위반 — CONDITIONAL_WRITING condition "…" requires "T", but modelAnswer does not contain it. …` | 정본 검증기 (b) | 〃 `:98-108` |
| G27 | `조건 '{앞40자}' 은 자리 지정을 부정형으로 썼다 — …` | `/(?:시작\|끝내\|끝나\|끝맺\|마무리\|마치)\S{0,3}\s*(?:말\|마\|않)/` | `:61,345-350` |
| G28 | `조건 '{앞40자}' 은 그 표현으로 문장을 시작할 것을 요구하는데, 모범답안은 '{앞32자}…' 로 시작한다` | 인용 토큰 **바로 뒤** 시작 신호 + `answerEdge.startsWith` 실패 | `:57,353-358` |
| G29 | `조건 '{앞40자}' 은 그 표현으로 문장을 끝낼 것을 요구하는데, 모범답안은 '…{뒤32자}' 로 끝난다` | 인용 토큰 바로 뒤 끝 신호 + `answerEdge.endsWith` 실패 | `:58-59,359-363` |
| G30 | `채점기준 {n}개 — 2~5개 필요하다(이 유형은 기계 채점이 불가능해 채점기준이 채점의 전부다)` | `n < 2` | `:370-373` |
| G31 | `채점기준 {n}개 — 5개 이하여야 한다` | `n > 5` | `:374-378` |
| G32 | `채점기준 {N}번이 한국어가 아님: '{앞40자}'` | `!containsHangul` | `:380-383` |
| G33 | `채점기준 {N}번에 마크다운 잔재가 남아 있음(받은 값: '{앞40자}') — …` | `CW_MARKDOWN_RESIDUE_RE` (G04 와 동일) | `:384-388` |
| G34 | `해설이 한국어가 아님(받은 값: '{앞40자}')` | `!containsHangul(explanation)` | `:394-395` |
| G35 | `해설이 {n}자 — 조건이 어디서 충족되는지와 어떤 구문 전환을 썼는지를 담은 2문장으로 써라` | `length < 30` | `:396-400` |
| G36 | `해설이 {n}자 — 400자 이하 딱 2문장으로 줄여라(지문·채점기준이 해설 아래로 흘러 들어왔는지 확인하라)` | `length > 400` | `:404-408` |
| G37 | `해설에 지문 원문이 통째로 섞여 들어옴(연속 일치: "{앞60자}…") — …` | `answerRunInPassage(explanation, passage, 8)` | `:409-420` |
| G38 | `해설이 문항 어디에도 없는 영어 표현을 인용함: "{fragment}" — …` | `findExplanationQuotedTokenIssue` — **12자 이상** 영어 인용 조각이 `modelAnswer`·`conditions`·`referenceSentence`·`scoringCriteria`·`passage` 어디에도 없음 | `:421-437` · `validators/explanation-quoted-tokens.ts:117-162` |

### 4-2. 판정 보조 함수 — 정확한 의미

| 함수 | 규칙 | file:line |
|---|---|---|
| `isMachineCheckableCondition` | **(a)** 범위 수식이 없고 `/(\d{1,3})\s*(?:개의?\s*)?단어/` 매치 → 참 · **(b)** 인용 영어 토큰이 0개 → 거짓 · **(c)** 토큰이 있고 금지 신호 **또는** 필수 신호가 있으면 참 | `gate-conditional-writing.ts:119-130` |
| 범위 수식 | `/이내\|이하\|이상\|미만\|내외\|안팎\|정도\|최소\|최대\|약\s*\d\|\d+\s*[~〜–-]\s*\d+/` — 붙으면 **정확 단어 수로 치지 않는다**(검증도 안 하고 기계 검증 가능으로도 안 친다) | `:44-45` |
| 금지 신호 | `/(?:사용하지\|쓰지\|포함하지\|넣지\|포함시키지)\s*(?:말\|마\|않)\|금지/` | `:47-48` |
| 필수 신호 | `/반드시\|포함\|사용\|활용\|넣어\|넣을\|쓸\s*것\|쓰시오\|써야\|시작\|끝(?:날\|나\|낼\|맺)\|들어가/` | `:49-50` |
| 인용 토큰 | `/['‘’"“”]([A-Za-z][A-Za-z' -]{0,40}?)['‘’"“”]/g` — **영어로 시작하는 40자 이하**만. 한국어를 따옴표로 감싸면 토큰이 아니다 | `:43` |
| 시작 자리 신호 | 인용 토큰 **닫는 따옴표 바로 뒤** 문자열이 `/^\s*[)）\]]?\s*(?:\(?으\)?)?(?:로\|부터)\s*(?:문장을\s*)?시작/` | `:57,87-96` |
| 끝 자리 신호 | 〃 `/^\s*[)）\]]?\s*(?:\(?으\)?)?로\s*(?:문장을\s*)?(?:끝\|마무리\|마치)/` | `:58-59` |
| `countWords` | `/[A-Za-z]+(?:['-][A-Za-z]+)?\|\d+(?:[.,]\d+)*/g` — `well-being` 1단어 · `it's` 1단어 · `makers'` 1단어 · 숫자 1단어 | `question-quality/core.ts:336-341` |
| `answerRunInPassage(a, b, n)` | 양쪽을 소문자화 후 **길이 4자 이상 내용토큰**만 뽑아, `a` 의 **연속 n개**가 `b` 에 그대로 있으면 그 구간 반환 | `core.ts:276-282, 302-318` |
| 금지 토큰 판정 | **단일 영어 토큰이면 단어 경계**(`\bX\b`), 다어절이면 느슨한 포함 → `'without'` 금지는 `with no` 를 잡지 않는다 | `validators/conditional-writing.ts:87-89` · `core.ts:367-370, 428-430` |
| 필수 토큰 판정 | 항상 느슨한 포함(`containsLoose`) — 굴절형 관용 | 〃 `:101` |

### 4-3. `validateQuestionQuality` — 프로덕션은 비차단, **qbank 하네스는 차단**

라우트는 기록만 하지만(`00-contract.md §2`), `qgen-core.ts:311` 이 `qualityBlocking` 으로 차단한다.
이 레인은 `filterQualityIssues` 를 정의하지 않으므로 **전 코드가 그대로 산다**.

| 코드 | 심각도 | 조건 | file:line |
|---|---|---|---|
| `cond-writing-verbatim-answer` | **error** | 모범답안 내용토큰 6개+ 이고 80% 이상이 지문에 연속 verbatim. **SALVAGE 에서도 제외된 F급** | `dispatcher.ts:1072-1090` |
| `cond-writing-condition-violated` | **error** | 게이트 #9 와 **동일 함수** — 게이트를 통과하면 여기도 통과 | `dispatcher.ts:2549-2551` |
| `explanation-foreign-script` | **error** | 해설에 한자·가나·중문 구두점 (한글 직후 괄호 병기는 예외) | `validators/explanation-foreign-text.ts:97-104` |
| `explanation-latin-jam` | **error** | 해설에 `소문자영단어 + 다` 직접 접합(`steals다`) | 〃 `:105-112` |
| `explanation-quoted-token-missing` | **error** | 해설의 12자 이상 영어 인용이 문항 표면 전체에 부재. **게이트 #12 보다 코퍼스가 넓다**(structuredData 전 필드) | `dispatcher.ts:837-843` |
| `writing-answer-verbatim-in-passage` | warning | 모범답안 내용토큰 **3연속**이 지문에 존재 | `dispatcher.ts:1054-1064` |
| `killer-needs-multiple-conditions` | warning | `difficulty==="KILLER"` 이고 조건 1개 (게이트 #6 이 먼저 error 로 잡는다) | `dispatcher.ts:2541-2545` |
| `few-key-points` | warning | KILLER 인데 `keyPoints` 3개 미만 — **어댑터가 항상 `[]` 를 내므로 KILLER 문항마다 뜬다. 무해**(probe 실측) | `validators/misc.ts:80` |

> ★ `writing-answer-verbatim-in-passage`(warning)는 **차단하지 않지만 설계 실패의 조기 경보**다.
> 모범답안이 지문 문장과 내용토큰 3개만 연속으로 겹쳐도 뜬다 → 뜨면 어휘를 더 갈아라. probe 6문항은 **전량 무발화**다.

### 4-4. 하네스 유닛 레벨 차단 코드 — `qbank/harness/qgen-core.ts`

| 코드 | 조건 | file:line |
|---|---|---|
| `UNSUPPORTED_LANE` | 레지스트리 미등록 (CONDITIONAL_WRITING 은 해당 없음 — `lane-registry.ts:38,69` 등록 레인) | `:216` |
| `CONTAINER` | `<!-- ITEM n -->` 헤더 결측·번호 비연속·`point:` 누락·본문 공백·settings JSON 파싱 실패 | `:227`, `splitItems :47-101` |
| `ITEM_COUNT` | 문항 수 < `minItems`(기본 5 · 티어별 5~8) | `:233` |
| `GATE` | `gateMdConditionalWriting` 이슈 전수 | `:306` |
| `ADAPT` | `영작할 우리말 문장 없음` / `작성 조건 없음` / `모범답안 없음` | `:308` · `adapter-conditional-writing.ts:45-47` |
| `POSTPROCESS` | PASSTHROUGH 라 사실상 발생하지 않음 | `:310` |
| `POINT_DUPLICATE` | 유닛 내 `point:` 정규화 문자열 중복 | `:329` (probe **U1**) |
| **`ANSWER_DUPLICATE`** | **`diversityTargets` 중복 — 이 유형은 `referenceSentence` 앞 90자**가 target | `:349` · `lane-conditional-writing.ts:126-133` (probe **U2**) |

> ★ **이 유형 최대 제약**: `diversityTargets = [referenceSentence.trim().slice(0,90)]`.
> **두 문항이 같은 한국어 문장을 표적으로 삼으면 유닛 전체가 반려된다.**
> → 문항 수 상한 = 지문의 **서로 다른 논지 담지 문장 수**. 계산은 §8-0.

---

## 5. adapter 산출 필드

`adaptMdConditionalWritingToAiQuestion` (`src/lib/md-qgen/adapter-conditional-writing.ts:34-67`)
→ `postProcessQuestion("CONDITIONAL_WRITING", …)` = **PASSTHROUGH**(`question-postprocess/types.ts:76` · `index.ts:49,55-61`) — **후처리가 만들어 주는 것이 하나도 없다. 어댑터가 100% 완제품을 낸다.**

probe 실측 `structuredData` 키 (ITEM 1):
`direction, referenceSentence, conditions, modelAnswer, scoringCriteria, correctAnswer, explanation, keyPoints, tags, difficulty`

| 키 | 타입 | 의미 | file:line |
|---|---|---|---|
| `direction` | string | 고정 발문 `다음 우리말을 주어진 조건에 맞게 영작하시오.` · `stemLanguage:"en"` 이면 `Write the Korean sentence below in English, following the given conditions.` | `:28-32,52` · 교체 `lane-conditional-writing.ts:91-97` |
| **`referenceSentence`** | string | **이 유형 고유.** `우리말:` 값 = 학생이 영작할 한국어 문장. **학생 노출 필드**(`student-safe-data.ts:347-352`) · **`diversityTargets` 의 유일 소스** | `:38,53` |
| **`conditions[]`** | string[] | **이 유형 고유.** `조건:` 항목 전량(빈 항목 제거). **학생 노출 필드 — 여기 적은 것은 전부 시험지에 인쇄된다** | `:40,54` |
| **`modelAnswer`** | string | **정답의 유일 진실원.** 영어 완성 문장 1개 | `:39,55` |
| **`scoringCriteria[]`** | string[]? | **이 유형 고유.** 사람 채점(MANUAL_ONLY)의 유일 근거. **비면 키 자체를 싣지 않는다**(빈 배열이 렌더에서 빈 상자를 만든다) | `:41,56-57` |
| `correctAnswer` | string | **`modelAnswer` 와 문자 동일**(복제). 두 값을 모델에게 따로 받지 않는 이유 | `:58-60` |
| `explanation` | string | `해설:` 원문 | `:61` |
| `keyPoints` | `[]` | **항상 빈 배열**(합성 금지 — 정본 규약). KILLER 에서 `few-key-points` warning 유발하나 무해 | `:62` · 경고 `:19-21` |
| `tags` / `difficulty` | `[]` / string | `ctx.rawDifficulty` 그대로 | `:63-64` |

**절대 만들면 안 되는 키** (`adapter-conditional-writing.ts:14-18`)
- `options` — **`undefined` 조차 금지.** 비어 있지 않으면 `correct-answer-mismatch`(RELAXED_BLOCKING)
- `blanks` / `passageWithBlank` / `originalExpression` — `dispatcher.ts:1049-1053` verbatim 누수 게이트가 `blanks[].answer` 를 훑는다

**어댑터 실패 조건**(= 하네스 `ADAPT` 차단, `:45-47`): `referenceSentence` 빈값 → `영작할 우리말 문장 없음` · `conditions` 0개 → `작성 조건 없음` · `modelAnswer` 빈값 → `모범답안 없음`.
렌더 가능 판정이 `referenceSentence && conditions` 를 요구하므로(`components/workbench/question-renderers.tsx:737`) 둘 중 하나라도 비면 카드가 아예 그려지지 않는다.

**채점 계약**: `buildAnswerSpec` 이 `FREE_WRITING` 집합으로 분기해 **항상 `MANUAL_ONLY` / `manualReason:"자유영작 — 기계 채점 불가"`** 를 낸다
(`exam-scoring/answer-spec.ts:250,271-273`). `acceptedAnswers` 계약이 아예 없고, 모범답안과 똑같이 써도 `NEEDS_REVIEW` 다
(`scripts/_test-md-conditional-writing.ts:677-706`). → **채점기준이 곧 채점의 전부다.**

저장 시 `structuredData` = 위 산출 + `_typeId`/`_typeLabel`/`_generationPlan`/`difficulty` + tags (`00-contract.md §11`).
`type` 은 `Array.isArray(q.options)` 가 false 이므로 **`SHORT_ANSWER`** 로 저장된다(`question-generation-persistence.ts:242-263`).

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `difficulty` (ITEM 헤더) | `BASIC\|INTERMEDIATE\|KILLER` | `INTERMEDIATE` (하네스 `qgen-core.ts:79`) | 3값 | **★ 직접 영향.** 조건 개수 하한을 바꾼다 — BASIC **1** / INTERMEDIATE **2** / KILLER **2** (`prompts-conditional-writing.ts:19-23` → 게이트 `:196,305-309`). KILLER 에서 조건 1개면 warning 도 추가(`dispatcher.ts:2541-2545`). probe **K1/K2** |
| `stemLanguage` | `"ko"\|"en"` | `"ko"` (`language.ts:37`) | 2값 | **md 형식 무영향.** `direction` 문자열만 교체. 우리말·조건·채점기준·해설은 한국어 유지 (`lane-conditional-writing.ts:60-67, 91-97`). probe **P8/K3** |
| `optionLanguage` | `"ko"\|"en"` | `"ko"` | — | **무영향.** toggle scope 가 `'stem'` 이라 저장돼도 무시된다 (`language.ts:64-79`) |
| `variantIndex` (하네스가 `ITEM n-1` 로 자동 주입) | number | 0 | — | **md 형식 무영향.** 이 레인은 `variantIndex` 를 읽지 않는다 |
| `teacherPoints` | `{text}[]` | `[]` | — | **이 유형은 교사 포인트 블록을 아예 만들지 않는다** — `POINT_PICKER_CONFIG` 미등록 (`lane-conditional-writing.ts:69-72`) |

**전용 노브가 없다.** `resolveQuestionTypeGenerationSettings` 가 이 유형에 대해 `stemLanguage`/`optionLanguage` 폴백만 돌려주고
(`question-type-generation-settings/dispatchers.ts:352-360`), `isEligible` 은 항상 `true` 다(`lane-conditional-writing.ts:48-50`).
→ **「설정 범위 밖」이라는 개념이 없다.** 다각화는 전부 저작 설계로 만든다(§8).

**형식 상수 단일 진실원** — `prompts-conditional-writing.ts`

| 상수 | 값 | line | 게이트 사용처 |
|---|---|---|---|
| `CW_MD_CONDITION_MIN` | `{BASIC:1, INTERMEDIATE:2, KILLER:2}` | `:19-23` | G21 |
| `CW_MD_CONDITION_MAX` | `4` | `:25` | G22 |
| `CW_MD_CRITERIA_MIN` / `MAX` | `2` / `5` | `:27-28` | G30 / G31 |
| `CW_MD_ANSWER_WORDS_MIN` / `MAX` | `6` / `40` | `:31-32` | G18 |
| 난이도별 권장 길이(**게이트 비강제**) | BASIC `8~16단어` · INTERMEDIATE `12~20단어` · KILLER `14~24단어` | `:35-39` | — (프롬프트 지시용) |

**과금 축**: `QUESTION_GEN_SINGLE`(2크레딧) — 어휘 3종이 아니다 (`lane-conditional-writing.ts:41`).
**재생성**: `retryEligible: true` (`:44`) — 웹 경로 한정. **오프라인 하네스에는 재생성이 없다**(00-contract §2).

ITEM 헤더 표기: `settings: {"stemLanguage":"en"}` → 하네스가 `{CONDITIONAL_WRITING:{stemLanguage:"en"}}` 로 감싸 주입 (`qgen-core.ts:369-378`).

---

## 7. 함정 (전부 코드 근거 + probe 실증)

| # | 함정 | 결과 | 근거 |
|---|---|---|---|
| **T1** | **`정답:` 을 습관적으로 추가** | 모범답안이 있으면 **`정답:` 값이 조용히 버려진다**. 반대로 `모범답안:` 을 빼고 `정답:` 만 쓰면 폴백으로 통과해 **형식이 표류한다** | probe **E2**(관용 실측) · `parser-conditional-writing.ts:255-256` |
| **T2** | **선지 `① … ⑤ …` 를 만듦** | `①` 은 불릿로 취급돼 벗겨지고(R7) 그 줄이 **직전 섹션 항목으로 흡수**된다. 어댑터까지 가면 `correct-answer-mismatch` | `:70,125-126` · `adapter-conditional-writing.ts:14-16` |
| **T3** | **구문·문법 용어를 작은따옴표로 인용** (`'cleft sentence'로 쓸 것`, `'passive voice'로 쓸 것`) | 기계가 그 문자열을 답안에서 찾다 실패 → **`조건 위반`(G26)로 정상 문항이 자동 반려** | probe **E3** · `validators/conditional-writing.ts:98-108` |
| **T4** | **조건의 숫자와 모범답안 실제 단어 수 불일치** | `조건 위반 — requires exactly N word(s), but modelAnswer has M`. **스냅은 절대 고쳐 주지 않는다**(S8) | probe **E4** · `:62-79` · `parser…:351-354` |
| **T5** | **금지어를 모범답안이 실제로 사용** | `조건 위반 — forbids "T", but modelAnswer still uses it`. 단일 토큰은 **단어 경계**로 본다(`without` 금지가 `with no` 를 안 잡는 이유) | probe **E5** · `:84-97` |
| **T6** | **`'X'로 시작할 것` 인데 모범답안이 X로 시작하지 않음** | G28. 정본 검증기는 **부분 문자열 포함만** 보므로 통과하지만, md 게이트가 문두를 따로 강제한다 | probe **E6** · `gate…:333-358` |
| **T7** | **자리 지정을 부정형으로** (`'Without'으로 시작하지 말 것`) | G27. 기계가 이를 **"반드시 Without 을 쓸 것"으로 오독**한다. 금지는 `'…'을 사용하지 말 것`, 자리 지정은 `'…'으로 시작할 것` 둘 중 하나로만 | probe **E7** · `:61,345-350` |
| **T8** | **구문 요구만으로 조건 구성** (`수동태로 쓸 것` + `분사구문을 쓸 것`) | G23 `기계로 검증 가능한 항목이 없음`. **①시작어·필수어휘 ②금지어 ③정확 단어수 중 최소 1개**가 반드시 필요 | probe **E8** · `:119-130,319-323` |
| **T9** | **조건 줄에 모범답안·예시·검산 메모 병기** (`(예: It is not brute force …)`) | G05 `조건 N번에 모범답안이 노출됨`. **조건은 학생 화면에 그대로 인쇄된다** — 영작 과제가 베껴쓰기로 전락 | probe **E9** · `:164-173` · `student-safe-data.ts:347-352` |
| **T10** | **우리말 줄에 영어 괄호 병기** (`없었다면(Had it not been for)`) | G13 또는 G14. **영어 2어절 연속이면 무조건 죽는다.** 영작할 것을 문제에 미리 인쇄하면 문항이 사라진다 | probe **E10** · `:63,231-255` |
| **T11** | **모범답안이 지문 문장의 축자/근사 복사** | G19/G20 + quality `cond-writing-verbatim-answer`(error). **SALVAGE 에서도 제외된 F급**. 실측 4건(runIndex 37/38/47/48)이 이 형태로 llm fatal | probe **E11** · `:281-302` · `dispatcher.ts:1066-1090` |
| **T12** | **모범답안 6단어 미만 / 40단어 초과** | G18. 난이도 권장 폭(8~24)보다 절대 폭이 넓지만 그 밖은 즉사 | probe **E13/B4** · `:269-274` |
| **T13** | **조건 5개 이상** | G22 `4개 이하여야 한다`. 학생이 동시에 만족시킬 수 없는 조건 더미는 문항이 아니다(실측 폐기 사유) | probe **E14/B1** · `:310-314` |
| **T14** | **조건·채점기준에 표 파이프·백틱·별표** | G04/G33. ★ **양끝 파이프가 있으면 파서가 표로 흡수하지만**(R5) `3 \| 총 20단어로 쓸 것` 처럼 **한쪽만 있으면 흡수되지 않고 그대로 반려** | probe **E15** · `:65,158-163` |
| **T15** | **채점기준 1개 또는 6개 이상** | G30/G31. 이 유형은 기계 채점이 불가능하므로 채점기준이 채점의 전부다 | probe **E16/B2** · `:369-378` |
| **T16** | **해설이 문항에 없는 영어를 인용** | G38. **12자 이상** 조각만 검사한다(짧은 인용은 통과하지만 그건 오탐 방지용 관용이지 허가가 아니다) | probe **E17** · `validators/explanation-quoted-tokens.ts:35-37,143-160` |
| **T17** | **해설 뒤에 지문·잡문을 덧붙임** | 한글 없는 30자 이상 줄이면 파서 가드가 막지만(R18), **한국어 잡문은 그대로 해설에 합쳐져** G36(400자)·G37(지문 런)로 죽는다 | probe **E18**(가드 실증) · `parser…:239-248` · `gate…:404-420` |
| **T18** | **조건을 영어 지시문으로 작성** (`Use exactly twenty words.`) | G02 `한국어 지시문이 아님`. 조건·채점기준·해설은 **전부 한국어**, 영어는 **조건의 인용 토큰 안에서만** 허용 | probe **E19** · `:152-154` |
| **T19** | **같은 우리말 문장을 두 문항이 표적으로** | 유닛 전량 `ANSWER_DUPLICATE`. 표적은 `referenceSentence` 앞 90자다 | probe **U2** · `lane-conditional-writing.ts:126-133` |
| **T20** | **`point:` 를 무성의하게** (`영작 연습`) | 유닛 전량 `POINT_DUPLICATE` | probe **U1** · `qgen-core.ts:325-333` |
| **T21** | **한 파일에 2문항을 이어 붙임** | 2번의 우리말·모범답안은 **조용히 버려지고** 조건·채점기준만 합산 → `조건 6개` 라는 **거짓 원인**으로 반려 | R21/R22 · `00-contract §3` |
| **T22** | **인라인 마커·`빈칸지문:` 등 타 유형 습관** | 라벨이 아니므로 직전 섹션으로 흘러들거나 학생 화면에 문자 그대로 인쇄 | §3-E |

> ### 관용으로 확인됐지만 **쓰지 마라** (probe OBSERVE)
> `**조건:**` 같은 머리표 굵게(E1), `모범답안(예시):` 괄호 부연, 표 형식 조건, 코드펜스로 감싼 모범답안 —
> 전부 파서가 흡수하지만 **스냅 보정 로그가 남고**, 관용 범위는 유형마다 다르다(00-contract §8).
> **장식 0 이면 probe P9 처럼 `corrections 0` 이 나온다. 그것이 목표 상태다.**

---

## 8. 출제 포인트 다각화 축

### 8-0. ★ 표적 예산 (하드 제약, 코드 근거)

`diversityTargets = [referenceSentence.slice(0,90)]` (`lane-conditional-writing.ts:126-133`) →
**문항 1개 = 표적 문장 1개**, 중복 시 `ANSWER_DUPLICATE` 로 **유닛 전량 반려**(probe U2).

따라서 **문항 수 상한 = 지문의 「논지를 담지한 서로 다른 문장」 수**다. 표적 실격 문장은 프롬프트가 못박는다(`prompts-conditional-writing.ts:166-169`):
1. 예시 나열·수치 부연·장식 수식만 있는 문장 → **실격**
2. 앞 문장의 대명사(`this`·`such`·`they`)에 기대는 문장 → **실격**(한국어로 옮기는 순간 지시 대상이 사라진다)

**코퍼스 실측**(4,537지문, `plan.mjs:173-189` 문장 분할):
| 지표 | 값 |
|---|---|
| 문장 수 p05 / p25 / **p50** / p75 / p95 | 4 / 6 / **7** / 8 / 11 |
| 문장 6개 이상 | 82.3% |
| 문장 7개 이상 | 62.9% |
| **문장 8개 이상** | **40.2%** |

→ **S 티어(8문항)를 요구하는 지문의 약 60%는 문장이 8개 미만이다.** 여기에 위 실격 규칙까지 적용하면 실제 표적 후보는 문장 수의 절반~2/3 수준이다.
**표적이 모자라면 문항 수를 줄이고 사유를 남겨라**(품질 헌법 §9-10, 불변조건 I8). 억지로 같은 문장을 쪼개 두 번 쓰면 유닛 전체가 죽는다.

> 표적을 늘리는 **정당한** 방법 하나: 한 문장 안에 **독립된 두 명제**가 있을 때(예: `not A but B` 대조문, 세미콜론 병렬문)
> 각각을 별도의 완결 명제로 번역하면 우리말이 달라지므로 표적이 갈린다. 단 **둘 다 그 자체로 명제가 완결돼야** 한다.

### 8-A. 노브로 달라지는 축 (코드 근거)

| 축 | 값 | 무엇이 실제로 달라지는가 | 근거 |
|---|---|---|---|
| **A1 난이도** | BASIC / INTERMEDIATE / KILLER | 조건 개수 하한 **1 / 2 / 2**. 유닛 분포는 헌법 §4(5문항 1/2/2, 8문항 2/3/3) | `prompts…:19-23` · 게이트 G21 |
| **A2 조건 개수** | 1~4 | 학생이 동시에 관리할 제약 수 = 체감 난도의 1차 결정 요인 | G21/G22 |
| **A3 채점기준 개수·배점** | 2~5 | 부분점수 구조. 구문 2점 + 어휘 1점 + 형식 1점 / 균등 1점씩 / 구문 3점 집중 등 | G30/G31 |
| **A4 모범답안 길이** | 6~40단어 (권장 BASIC 8~16 · INTERMEDIATE 12~20 · KILLER 14~24) | 표적 문장 선정과 직결. 게이트는 절대 폭만 본다 | `prompts…:31-39` · G18 |
| **A5 발문 언어** | `stemLanguage` ko/en | `direction` 문자열만. **형식·게이트 무영향** — 유닛에 1~2문항 섞어 표면 변화를 준다 | probe P8 |

> **A5 를 제외하면 노브가 없다.** 이 유형의 다각화는 **99% 설계**다.

### 8-B. ★ 설계로 달라지는 축 (교육적 판단) — 6축

문항 N개는 아래 6축의 **좌표가 서로 달라야** 한다. 축 하나만 돌리면 "표현만 다른 같은 문항"이 된다.

**B1. 표적 문장의 논지 지도 위치** (`00-AUTHORING.md §2`)
`도입 통념` / `전환점(however·rather than)` / `기제 설명` / `사례·부연` / `결론·함의`
→ 표적이 바뀌면 `referenceSentence` 가 바뀌고 `ANSWER_DUPLICATE` 축이 자동으로 갈린다. **가장 값싸고 가장 강한 축.**

**B2. 요구 통사 장치** — 무엇을 학생 머릿속에서 **재조립**하게 할 것인가
| 장치 | 조건 표현 예 | 표적 문장의 조건 |
|---|---|---|
| 태 전환(능동↔수동) | `수동태로 쓸 것` | 명확한 행위자 + 목적어 |
| 가정법 도치 | `가정법 도치로 쓸 것` + `'Had it not been'으로 시작할 것` | 조건·전제를 담은 문장 |
| it-분열문(강조구문) | `'It is'로 시작할 것` | `not A but B` 대조 |
| 분사구문 | `수식어를 분사구로 줄여 쓸 것` | 관계절이 얹힌 문장 |
| 간접의문문 | `간접의문문 어순으로 쓸 것` | 콜론·의문 형식의 문장 |
| `not only A but also B` | `not only A but also B 상관접속사 구문을 사용할 것` | 병렬 두 항 |
| 비교·최상급 | `비교급 구문으로 쓸 것` | 정도 차이를 말하는 문장 |
| 명사절 ↔ 명사구 압축 | `주어를 명사절 대신 단순 명사구로 쓸 것` | `What … is …` 형태 |
| 무생물 주어 | `사물을 주어로 삼을 것` | 사람 주어 문장 |
| 접속사 교체 | `'Since'로 시작할 것` + 원문 접속사 금지 | 인과·양보절 |

★ **KILLER 는 서로 다른 문법 축 2개 이상을 결합**한다(`prompts…:59-64`). 도치+도치는 하나로 친다.
★ **1단계 기계적 이동(부사절 전치 등)만으로 풀리는 전환은 KILLER 실격**(같은 자리).

**B3. 조건 분류학 조합** (`prompts-conditional-writing.ts:67-81`)
① 시작어·필수 어휘 지정 / ② 금지 어휘 / ③ 정확 단어 수 / ④ 구문 요구
→ **①~③ 중 최소 1개 필수**(G23), ④ 는 단독 사용 금지. **문항마다 조합을 바꿔라**:
`①+④` / `②+④` / `②+③` / `①+②+③` / `①+②+④` / `②+③+④` …

**B4. 봉쇄 지점** — 금지어를 **무엇에 거는가**. 이것이 학생이 스스로 생성해야 하는 것을 결정한다.
| 봉쇄 대상 | 학생이 만들어야 하는 것 | 예 |
|---|---|---|
| 원문 **연결어** | 같은 논리 관계의 대체 장치 | `'without'` 금지 → 가정법 도치 / `'because'` 금지 → `Since`·분사구문 |
| 원문 **핵심 명사** | 동의 표현 · 상위어 · 풀어쓰기 | `'strength'` 금지 → `brute force` |
| 원문 **주어** | 태 전환 · 무생물 주어 | `'engineers'` 금지 → 수동태 |
| 원문 **동사** | 명사화 · 다른 동사 선택 | `'judged'` 금지 → `was rated` |
| 원문 **프레임 명사** | 내용 자체를 주어로 승격 | `'question'` 금지 → `What matters now is …` |

**B5. 자리 강제** — `시작 지정` / `끝 지정` / `없음`. 자리를 강제하면 학생이 **문장 전체를 그 자리에 맞춰 재설계**해야 한다(G28/G29).

**B6. 우리말 번역의 통사 거리** — 원문 어순을 그대로 옮긴 번역 vs **자연스러운 한국어 어순으로 재배열한 번역**.
후자는 학생이 영어 어순을 스스로 복원해야 하므로 같은 표적·같은 조건이어도 인지 부하가 다르다.
단 **원문의 절·수식어를 잘라내면 안 된다**(의미 범위 1:1) — 자르면 학생 답과 모범답안의 길이가 어긋나 채점이 붕괴한다(`prompts…:168`).

### 8-C. 오답 공학의 번안 — 선지가 없는 유형에서 (L,F) 를 어디에 쓰는가

품질 헌법 §3 의 오답 택소노미는 이 유형에서 **「학생이 실제로 쓸 오답 문장」** 으로 번안된다.
채점기준은 그 예상 오답을 **감점 축으로 명시**해야 한다.

| 예상 학생 오답 | 대응 코드 | 채점기준에 반영하는 법 |
|---|---|---|
| 지문 문장을 그대로 베낌 | L1(핵심명사 재사용) | `금지어 없이 같은 의미를 전달하면 N점` — 금지어 조건이 이 경로를 봉쇄 |
| 조건은 지켰으나 명제가 어긋남 | F1(관계 왜곡) | `원문의 대조/인과 관계를 유지하면 N점` |
| 구문은 맞으나 단어 수 초과 | F7(한정어 왜곡) | `총 N단어 조건을 지키면 1점` |
| 시작어만 붙이고 나머지는 원문 어순 | F5(세부 승격) | `지정된 시작 표현으로 문장을 열면 N점` + 구문 항목 별도 배점 |
| 구문 이름은 알지만 형태가 틀림 | F2 | `분사구/분열문 형태를 정확히 쓰면 N점` |

**채점기준 작성 규칙**(G30~G33 + `prompts…:102`): 각 항목에 **"무엇을 확인해 몇 점인지"**. `문법이 정확할 것` 같은 만능 문구는 채점자가 쓰지 않는다.

### 8-D. 6문항 유닛 설계표 (probe 로 `blocking 0` · `qualityBlocking 0` 실증)

지문: 다리 설계에서 「파괴 하중」이 아니라 「손상 후 거동」이 판단 기준이 됐다는 글 (97단어·6문장).

| # | 난이도 | 표적(B1) | 통사 장치(B2) | 조건 조합(B3) | 봉쇄 지점(B4) | 자리(B5) | 단어수 |
|---|---|---|---|---|---|---|---|
| 1 | BASIC | S1 도입 통념 | 태 전환(수동) | ②+③+④ | 원문 주어 `engineers` | 없음 | 16 |
| 2 | INTERMEDIATE | S3 기제 대조 | 관계절→분사구 축약 | ②+③+④ | 원문 연결어 `without` | 없음 | 16 |
| 3 | INTERMEDIATE | S4 인과 근거 | 접속사 교체 | ①+②+③ | 원문 접속사 `because` | **시작** | 17 |
| 4 | KILLER | S5 결론 대조 | it-분열문 + 어휘 대체 | ①+②+③ | 원문 핵심 명사 `strength` | **시작** | 20 |
| 5 | KILLER | S2 전환점 | 간접의문문 주어절 승격 | ①+②+③ | 원문 프레임 명사 `question` | **시작** | 18 |
| 6 | BASIC | S6 함의 | 명사절→명사구 압축 | ②+③+④ | 원문 핵심 명사 `weakness` | 없음 | 14 |

난이도 분포 BASIC 2 / INTERMEDIATE 2 / KILLER 2 · `point:` 6개 전부 상이 · `referenceSentence` 6개 전부 상이 ·
`writing-answer-verbatim-in-passage` **전량 무발화** · 오토스냅 보정 **0건**.

> **이 표를 그대로 베끼지 마라.** 베낄 것은 **좌표가 6개 축에서 전부 다르다는 사실**이지 특정 장치 목록이 아니다.
> 표적 문장의 통사가 그 장치를 허락하지 않으면(예: 대조가 없는 문장에 it-분열문) 억지로 끼우지 말고 다른 장치를 골라라.

### 8-E. 저작 전 자기검산 (출력 전 반드시 — `prompts-conditional-writing.ts:104-112` 이식)

1. 정확 단어 수 조건이 있으면 **모범답안 단어를 하나씩 세어** 일치 확인 (`well-being` 1 · `it's` 1 · `makers'` 1)
2. 필수 인용 토큰이 모범답안에 **문자 그대로** 있는가. `…으로 시작할 것`이면 정말 **맨 앞**인가
3. 작은따옴표로 감싼 것이 전부 **답안에 문자 그대로 들어갈 표현**인가 (문법 용어면 따옴표를 벗기고 한국어로 풀어써라)
4. 금지 토큰이 모범답안에 없는가 — 굴절형까지
5. 지문에서 표적 문장을 찾아 모범답안과 나란히 놓고 **연속 6단어 이상 겹치는 구간**이 있으면 재설계
6. 우리말 줄에 영어가 **한 글자도** 없는가. 원문의 절·수식어를 잘라 먹지 않았는가
7. 조건 두 개가 서로를 배제하지 않는가 — **모범답안 하나로 전부 동시에 만족되는가**
8. 해설이 인용한 영어가 **모범답안·조건·지문에 실제로 있는가**(12자 이상 조각은 게이트가 잡는다)
9. 조건 목록에 **조건만** 있는가 — 예시·검산 메모가 남아 있으면 학생 화면에 정답이 인쇄된다

---

## 부록 — 검증 재현

```bash
./node_modules/.bin/tsx qbank/work/_probe-CONDITIONAL_WRITING.ts   # 37/37 PASS
./node_modules/.bin/tsx scripts/_test-md-conditional-writing.ts    # 프로덕션 픽스처 테스트
```

probe 가 고정하는 것:
- **P1~P9** 6문항 유닛 `blocking 0` · `qualityBlocking 0` · `corrections 0` · `ANSWER_DUPLICATE` 무발화 · `options` 키 부재 · `correctAnswer === modelAnswer`
- **K1~K4** 난이도별 조건 하한(1/2/2) · `mdFormat` 보고값 · `stemLanguage` extras 1블록 + 발문 교체 · `isEligible` 항상 true
- **E1~E20** 함정 20종의 실제 반려 문자열(관용 4종은 OBSERVE 로 기록)
- **B1~B5** 경계값 — 조건 4개 클린 / 채점기준 5개 클린·6개 반려 / 해설 400자 초과 반려 / 모범답안 41단어 반려 / 범위 수식 단어 수 무발화
- **U1~U2** `POINT_DUPLICATE` · `ANSWER_DUPLICATE` 유닛 전량 반려
