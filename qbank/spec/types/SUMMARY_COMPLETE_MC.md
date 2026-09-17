# 요약문 완성 객관식 (SUMMARY_COMPLETE_MC)

> **분류** 선택형(조합 선지 5지선다 — 값 2~4개를 ` …… ` 로 연결) · **지문변형** **없음(PASSTHROUGH)** — 빈칸은 지문이 아니라 **새로 쓴 영어 요약문 한 문장** 안에 있다 · **정답 머리표** `정답:` (원문자 `①`~`⑤`) + **이 유형에만 있는 필수 머리표 `요약문:`** · **최소 지문 길이** 코드 하드게이트 0 (게이트가 지문을 쓰는 곳은 8-토큰 복사 검사 하나뿐 — `gate-summary-mc.ts:70-84`) / 판단 하한 **110단어**(5문항), **150단어**(8문항)

> 출처: 정찰 에이전트 `SUMMARY_COMPLETE_MC` (2026-07-28). 코드 직독 + tsx 실행 검증(§검증 로그, 38/38 통과).
> 공유 계약은 [`../recon/00-contract.md`](../recon/00-contract.md), 품질 규범은 [`../quality-constitution.md`](../quality-constitution.md).

> ⚠ **헌법 §0 「지문 변형 허용 범위」 표의 `SUMMARY_COMPLETE*` 행(○ 빈칸 치환)은 이 유형에 적용되지 않는다.**
> 코드상 이 유형은 `PASSTHROUGH_TYPES` 멤버이고(`question-postprocess/types.ts:75`), 어댑터는 `passageWith*` 계열 필드를 **하나도 만들지 않으며**(`adapter-summary-mc.ts:15-16`), 게이트에도 「지문 재구성 대조」가 없다(`gate-summary-mc.ts:8-12`).
> 지문은 **한 글자도 건드리지 않는다.** 빈칸이 뚫리는 곳은 저작자가 새로 쓴 요약문 한 문장이다.

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

수능 40번형. 지문 전체를 **영어 한 문장으로 압축한 요약문**이 주어지고, 그 문장 안의 빈칸 `(A)`·`(B)`(설정에 따라 `(C)`·`(D)`)에 들어갈 값의 **조합**을 5지선다에서 고른다. 발문은 `다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?` — `adapter-summary-mc.ts:41-43`.

학생이 실제로 하는 일은 세 겹이다.
1. **지문 전체의 논지·인과 축을 하나로 접기** — 요약문이 지문의 어느 한 문장이 아니라 글 전체의 압축이므로, 부분만 읽으면 어느 칸도 확정되지 않는다.
2. **추상화 1단계 번역** — 정답 값은 지문 표면어의 복사가 아니라 상위 개념이다(`prompts-summary-mc.ts:76-78`). 지문에서 그 단어를 찾는 전략이 원천 봉쇄된다.
3. **두 칸의 교차 검증** — 조합 선지 구조가 강제하는 인지 작업이다. **반쪽 정답 함정**(한 칸은 정답, 다른 칸은 오답)이 형식상 의무이므로(`gate-summary-mc.ts:127-149`), 한 칸만 맞힌 학생은 반드시 걸린다.

**다른 유형과의 경계**

| 축 | SUMMARY_COMPLETE_MC | 인접 유형 |
|---|---|---|
| 빈칸이 있는 곳 | **저작자가 새로 쓴 요약문 한 문장** | `BLANK_INFERENCE`: **지문 본문**의 표현을 삭제 |
| 지문 | 한 글자도 안 건드림(PASSTHROUGH) | `BLANK_INFERENCE`·`VOCAB_CHOICE`: 지문 변형 후 재구성 대조 게이트 |
| 선지 | **값 2~4개의 조합**(` …… ` 연결) | `TITLE`/`TOPIC`: 단일 문장·구 |
| 근거 범위 | 글 **전체**의 논지 압축 | `MAIN_IDEA`: 근거 문장 1개 지정 가능 |
| 정답의 진실원 | `정답:` 줄 **하나** — 빈칸 정답은 그 줄이 가리키는 선지 값에서 **파생** | `SUMMARY_COMPLETE`(서술형): `정답(A):` 라벨별 머리표 |
| 산출 | `options[].blankValues` + `blanks[].answer` | 일반 객관식: `options[].text` 만 |

**이 유형이 죽는 지점**
- 요약문이 지문 문장의 재배열이면 실격이다 — 게이트가 **연속 8토큰 복사**를 결정형으로 잡는다(`gate-summary-mc.ts:69-84,280-286`). 이 유형의 핵심 품질축은 지문 보존이 아니라 **압축 재진술**이다.
- 한 칸만 보고 풀리면 조합 선지를 쓸 이유가 없다. KILLER 에서는 반쪽 정답 2종이 **하드 게이트**다(`:405`).
- **빈칸 정답을 따로 적는 줄이 없다.** `정답: ③` 이 유일한 진실원이고 `blanks[].answer` 는 어댑터가 파생한다(`adapter-summary-mc.ts:89-91`). 그래서 fast 레인의 고질 결함 `summary-mc-correct-pair-mismatch` 가 **구조적으로 발생 불가**다.

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (blankCount = 2, 기본값)

```md
요약문: <(A) 와 (B) 가 각각 정확히 1회씩, (A)→(B) 순서로 들어간 **영어 한 문장**. 8~60단어. 반드시 마침표(또는 ?/!)로 끝낸다. 지문과 연속 8단어 이상 겹치면 실격. 빈칸 라벨 뒤에 밑줄·말줄임표를 붙이지 않는다. 정답 값을 문장 안에 노출하지 않는다.>
① <(A)값> …… <(B)값>
② <(A)값> …… <(B)값>
③ <(A)값> …… <(B)값>
④ <(A)값> …… <(B)값>
⑤ <(A)값> …… <(B)값>
정답: <①~⑤ 중 하나 — 이 줄이 정답의 유일한 진실원>
해설: <한국어 합니다체 2문장. 논지 축 한 문장 → 지문 근거(영어 원문 직접 인용) → 두 칸 도출. 한 줄로 쓴다.>
오답:
<비정답 원문자> <어느 칸의 어떤 값이 왜 어긋나는지 1문장 — 정답 번호를 제외한 4개, 각 1줄>
<비정답 원문자> <…>
<비정답 원문자> <…>
<비정답 원문자> <…>
```

- 값은 `" …… "`(**공백 + U+2026 + U+2026 + 공백**)로 연결한다 — `prompts-summary-mc.ts:31`.
- 각 값은 **영어 단어 또는 짧은 어구, 6단어 이하**. 값 앞에 `(A)` 라벨을 다시 붙이지 않는다.
- **같은 열(빈칸)의 값 5개는 단어 수 편차 3 이내**여야 한다(`gate-summary-mc.ts:355-361`).
- 반쪽 정답 2종 필수: `(A)`만 정답인 조합 1개 + `(B)`만 정답인 조합 1개. 맞는 쪽 값은 정답 값을 **한 글자도 바꾸지 말고** 복사한다.

qbank 유닛 파일에서는 이 골격 앞에 컨테이너 헤더가 붙는다(qbank 규약, md-qgen 규약 아님 — `qbank/harness/qgen-core.ts:47,66-85`):

```md
<!-- ITEM 1
difficulty: KILLER
point: <이 문항이 겨냥하는 출제 포인트 — 유닛 내 중복 금지>
craft: <설계 의도 한 줄>
settings: {"blankCount":3}
-->
```

> ⚠ `settings` 의 빈칸 수 키는 **`blankCount`**(별칭 `summaryBlankCount`)다 — `question-type-generation-settings/summary.ts:37-43`.
> `summaryCompleteMcBlankCount` 는 **리졸버의 출력 필드명**이지 입력 키가 아니다. 그 이름으로 쓰면 **조용히 무시**되고 기본값 2로 채점된다(프로브 P6 실증).

### 2-2. 검증된 정상 픽스처 전문 — `scripts/_test-md-summary-mc.ts` (2칸, `GOOD` = `:53-65`)

지문(`:42-48`):

```
Playground designers once treated every scrape as a design failure, so they smoothed the ground, lowered the frames, and padded every edge. Children who grow up on such surfaces rarely meet a hazard small enough to teach them anything at all. Researchers who tracked school injuries found that the calmest looking yards produced the worst falls once pupils reached open ground. The reason is that judging height, speed, and grip is a skill, and a skill only develops where it is exercised. Removing the small risks removes the practice, and the practice is what keeps a young body upright. Protection, in other words, can quietly manufacture the very fragility it promises to prevent.
```

문항 본문:

```md
요약문: By engineering hazards out of play spaces, adults leave children (A) in the judgment that protects them, so safety itself becomes a source of (B).
① untrained …… vulnerability
② untrained …… independence
③ uninterested …… vulnerability
④ overprotected …… confidence
⑤ distracted …… boredom
정답: ①
해설: 지문은 위험을 전부 걷어낸 놀이터가 오히려 더 큰 사고를 낳는다고 밝힙니다. 위험 판단이 연습으로만 자라는 기술이라는 근거에서, 보호가 아이를 훈련되지 않은 상태로 남겨 취약성의 원인이 된다는 요약이 도출됩니다.
오답:
② 앞칸은 맞지만 지문은 보호의 귀결을 자립이 아니라 취약성으로 규정하므로 뒷칸이 어긋납니다.
③ 뒷칸은 맞지만 지문이 말하는 결핍은 흥미가 아니라 판단 훈련이므로 앞칸이 어긋납니다.
④ 지문은 보호가 자신감을 준다고 말한 적이 없으며 두 값 모두 인과 방향이 뒤집혔습니다.
⑤ 산만함과 지루함은 지문에 근거가 없는 소재라 요약문의 인과 축과 무관합니다.
```

> ①=정답, ②=(A)만 정답, ③=(B)만 정답, ④=두 칸 모두 방향 반전, ⑤=지문 밖 소재. **이 5행 배치가 이 유형의 표준 골격이다.**
> 본 문서 작성 시 tsx 로 재현해 `gate 0` 을 확인했다(프로브 P1).

### 2-3. 3칸 골격 (`blankCount: 3`)

```md
요약문: A listener stores a (A) beat, notices the moment a player (B) it, and feels the emotion that this small (C) creates.
① steady …… bends …… breach
② steady …… bends …… delay
③ steady …… doubles …… breach
④ random …… bends …… breach
⑤ random …… doubles …… delay
정답: ①
해설: …
오답:
② …
③ …
④ …
⑤ …
```

3칸 이상에서는 반쪽 정답 2종 대신 **near-miss(한 칸만 틀린 조합) 1개 이상**이 요구된다(`gate-summary-mc.ts:143-148`). 위 예는 ②③④가 전부 near-miss다. 프로브 P6 에서 `gate 0` 확인.

---

## 3. 파서 계약 (★ 가장 중요)

진실원은 `src/lib/md-qgen/parser-summary-mc.ts` 다. `prompts-summary-mc.ts` 의 지침이 느슨해도 아래가 계약이다.

### 3-0. 문서 전역 규칙

| # | 규칙 | 근거 | 어기면 사라지는 것 |
|---|---|---|---|
| R0 | **1 마크다운 문서 = 1문항.** 모든 섹션은 첫 매치만 취한다 | `parser-summary-mc.ts:208,211,216,222,237` | 2번째 문항이 조용히 소멸하거나 첫 문항을 오염 |
| R1 | 섹션 순서 고정: `요약문:` → 선지 5줄 → `정답:` → `해설:` → `오답:` | `:211`(선지는 `정답:` 앞) · `:239`(해설은 `오답:`까지) | 선지가 `정답:` 뒤에 있으면 폴백 경로로만 잡히고, 해설이 `정답:` 앞이면 해설이 잘린다 |
| R2 | **머리표 4종(`요약문:` `정답:` `해설:` `오답:`)은 장식이 흡수된다** — 굵게·헤딩·불릿·인용(`>`)·표 파이프·전각 콜론(`：`)·콜론 앞뒤 공백 | `KEYWORD_HEAD`/`KEYWORD_TAIL` `:101-102` + `keywordLineRe` `:109-111` | (없음 — 이 유형은 관용 축이다. **단 이것은 이 파서만의 관용이다.** 정본 `parser.ts` 는 흡수하지 않는다 — 00-contract §8) |
| R3 | 그럼에도 **qbank 저작 규칙은 「장식 0」** — 유형마다 관용 범위가 다르므로 계약으로 착각하지 않는다 | 00-contract §8 | — |
| R4 | 지문은 **한 글자도 쓰지 않는다.** 이 유형의 md 본문에 지문을 다시 적는 섹션은 존재하지 않는다 | `parser-summary-mc.ts:229-246`(필드 5개뿐) | 지문을 적어도 파서가 무시하지만, 선지 줄로 오인될 수 있다 |

### 3-1. 머리표 매처 (4종 공통 축)

```ts
const KEYWORD_HEAD = String.raw`^[ \t]*\|?[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]*)?(?:[-*•+][ \t]*)?(?:\*\*|__)?[ \t]*`;
const KEYWORD_TAIL = String.raw`[ \t]*(?:\*\*|__)?[ \t]*[:：][ \t]*(?:\*\*|__)?[ \t]*`;
function keywordLineRe(word, anchorEol = false) {
  return new RegExp(`${KEYWORD_HEAD}${word}${KEYWORD_TAIL}${anchorEol ? "$" : ""}`, "m");
}
const SUMMARY_HEAD_RE     = keywordLineRe("요약문");
const ANSWER_HEAD_RE      = keywordLineRe("정답");
const EXPLANATION_HEAD_RE = keywordLineRe("해설");
const WRONG_HEAD_EOL_RE   = keywordLineRe("오답", true);   // 헤더 뒤 아무것도 없는 줄
const WRONG_HEAD_RE       = keywordLineRe("오답");
```
`parser-summary-mc.ts:101-124`

- 머리표는 **줄머리(`^`) + `m` 플래그**. 문장 중간의 "정답:" 은 잡히지 않는다.
- 콜론은 반각 `:` 또는 전각 `：` 둘 다 가능. 콜론 **생략은 불가**(`[:：]` 는 필수).
- 흡수되는 접두: 공백/탭 · 파이프 `|` 1개 · 인용 `>` 다중 · 헤딩 `#`~`######` · 불릿 `- * • +` · 굵게 `**`/`__`.
- **어기면**: 머리표를 인식 못 하면 그 필드가 통째로 빈 값이 되고, 게이트가 「요약문 누락」·「정답 누락」·「해설 누락」이라는 **사실과 다른 원인**을 재생성 피드백으로 실어 보낸다(`:94-100` 주석의 실측 사고).

### 3-2. `요약문:` 섹션

```ts
function parseSummaryLine(text) {
  const after = text.split(SUMMARY_HEAD_RE)[1];
  if (after === undefined) return "";
  const collected = [];
  for (const rawLine of after.split(/\r?\n/)) {
    if (SECTION_BREAK_RE.test(rawLine)) break;
    const line = cleanCell(rawLine);
    if (!line) { if (collected.length > 0) break; continue; }
    collected.push(line);
  }
  return collected.join(" ").replace(/\s+/g, " ").trim();
}
```
`parser-summary-mc.ts:187-201`

```ts
const SECTION_BREAK_RE = new RegExp(
  `^\\s*\\|?\\s*(?:[-*•]\\s*)?(?:\\*\\*)?(?:[①②③④⑤]|[1-5]\\s*[.)]|#{1,6}\\s)` +
    `|${keywordLookahead("정답", "해설", "오답", "선지", "요약문")}`,
);
```
`:127-130`

- 본문은 **같은 줄에 써도, 다음 줄부터 써도 된다**(프로브 E2 실증). `VOCAB_CHOICE`·`ANTONYM` 의 「본문은 반드시 다음 줄」 규칙과 **정반대**다 — 유형 간 골격 복사 금지.
- 여러 줄이면 **공백 하나로 접힌다**. 빈 줄을 만나면(이미 수집분이 있으면) 종료.
- 종료 조건: 원문자 `①~⑤`로 시작하는 줄 · `1.`/`1)` 형태 · 헤딩 줄 · 4종 머리표(+`선지:`) 줄.
- `cleanCell` 이 선/후행 파이프와 `**` 를 제거하고 공백을 축약한다(`:147-154`).
- **어기면**: 요약문 첫 단어가 `1.` 같은 형태면 그 줄이 절단되고 「요약문 누락」이 뜬다.

### 3-3. 선지(조합) 줄

```ts
const OPTION_LINE_RE =
  /^\s*\|?\s*(?:[-*•]\s*)?(?:\*\*)?(?:([①②③④⑤])|([1-5]))(?:\*\*)?\s*[.)]?\s*(.+)$/;
```
`parser-summary-mc.ts:133-134`

수집 규칙 (`parseOptionLines`, `:161-184`):
1. 선지 구역은 **`정답:` 앞**이다: `primary = beforeWrong.split(ANSWER_HEAD_RE)[0]`. 여기서 5개를 못 채우면 `오답:` 앞 전체로 폴백(`:211-214`).
2. 라벨은 원문자 `①~⑤` 또는 숫자 `1~5`. **숫자 라벨은 `.` 또는 `)` 가 반드시 있어야 한다**(`:171-173`) — 산문 첫 단어가 숫자인 줄을 선지로 오인하지 않기 위한 관용의 상한.
3. `summaryMcCircled` 가 숫자를 원문자로 정규화한다(`:67-72`).
4. **같은 라벨은 첫 줄만 채택**(`seen` Set, `:168`). ① 을 두 번 쓰면 두 번째가 조용히 사라져 「선지 4개」가 된다.
5. 값 본문이 빈 줄은 버린다(`:175`).
6. **어기면**: 선지 수가 5가 아니면 게이트가 **즉시 return** 하여 다른 진단이 전부 은폐된다(`gate-summary-mc.ts:227-231`).

### 3-4. 값 구분자

```ts
const VALUE_SPLIT_RE = /\s*(?:…+|\.{2,}|\?{2,})\s*|\s+[/|]\s+/;
```
`parser-summary-mc.ts:138`

| 인식되는 구분자 | 비고 |
|---|---|
| `…` 1개 이상 (앞뒤 공백 무관) | **계약 리터럴은 `" …… "`(공백+U+2026×2+공백)** — `prompts-summary-mc.ts:31` |
| `.` 2개 이상 (`..` `...` `....`) | 값 내부에 말줄임표를 쓰면 열이 쪼개진다 |
| `?` 2개 이상 | 인코딩 깨짐 복구용 |
| **공백으로 둘러싼** `/` 또는 `\|` | `a / b` 는 쪼개지고 `a/b` 는 안 쪼개진다 |

- 분해 후 `map(trim).filter(Boolean)` — **값 앞뒤의 잉여 구분자는 빈 조각이 되어 흡수된다**(프로브 E4 후반 실증).
- **어기면**: 값 안에 ` / ` 나 `...` 를 쓰면 「① 값 3개 (2개 필요)」. 값 안에 하이픈(`value-based`)이나 붙임 슬래시(`a/b`)는 안전하다.

### 3-5. `정답:` 라인

```ts
const answer = summaryMcCircled(
  text.match(new RegExp(`${ANSWER_HEAD_RE.source}[([［]?[ \\t]*([①②③④⑤]|[1-5])`, "m"))?.[1] ?? "",
);
```
`parser-summary-mc.ts:216-220`

- 허용 표기: `정답: ①` · `정답: 1` · `정답: (1)` · `정답: [①]` · `정답: **①**` · `정답： ①` · `- 정답: ①` · `#### 정답: ①`.
- **첫 매치만.** 해설에 `정답:` 을 또 쓰면 그쪽이 아니라 앞의 것이 이긴다(순서 보장).
- **라벨형 `(A)` 는 정답이 아니다** — `정답: (A)` 로 쓰면 `answer=""` → 「정답 누락」(프로브 E6 실증). 이 유형의 정답 축은 **원문자/숫자**이고 `(A)(B)` 는 **빈칸 라벨 축**이다. 두 축을 섞지 마라.
- **어기면**: 정답이 통째로 사라지고, 게이트가 「정답 누락」 + (정답 축에 걸린 검사들이 전부 무검사 통과) 상태가 된다.

### 3-6. `해설:` 섹션

```ts
text.match(new RegExp(
  `${EXPLANATION_HEAD_RE.source}([\\s\\S]*?)(?=${keywordLookahead("오답","정답","요약문","선지")}|^#{1,6}\\s)`, "m",
))?.[1]?.trim()
?? text.match(new RegExp(`${EXPLANATION_HEAD_RE.source}([\\s\\S]+)$`, "m"))?.[1]?.trim()
?? ""
```
`parser-summary-mc.ts:237-244`

- `해설:` 뒤부터 **다음 머리표 줄(`오답:`/`정답:`/`요약문:`/`선지:`) 또는 헤딩 줄** 직전까지. 여러 줄 가능.
- lookahead 에 `정답` 이 포함된 이유: 섹션 순서가 뒤집혔을 때 해설이 `정답: ③` 줄을 흡수해 **학생 표면에 정답 번호가 박히는** 사고를 막기 위함(`:235-236` 주석).
- **어기면**: 해설 안에 `## ` 로 시작하는 줄이나 머리표를 쓰면 그 지점에서 해설이 잘린다.

### 3-7. `오답:` 섹션

```ts
const wrongSection = text.split(WRONG_HEAD_EOL_RE)[1] ?? text.split(WRONG_HEAD_RE)[1] ?? "";
const wrong = parseOptionLines(wrongSection)
  .map((o) => ({ label: o.label, text: o.text }))
  .filter((w) => w.label !== answer);
```
`parser-summary-mc.ts:222-228`

- 표준은 **`오답:` 단독 줄**(EOL 앵커 우선). 뒤에 내용이 붙어도 폴백이 받는다.
- 항목은 **선지 줄과 완전히 같은 문법**(원문자/숫자 라벨 + 본문). 즉 `② 앞칸은 …` 형태.
- **한 항목 = 한 줄.** 줄바꿈하면 둘째 줄은 라벨이 없어 `OPTION_LINE_RE` 에 걸리지 않고 **조용히 사라진다**(프로브 E5 실증). 개수 게이트는 통과하므로 **무음 손실**이다.
- 정답 라벨 줄은 파서가 걸러낸다(드리프트 관용). 그래도 **쓰지 마라** — 개수가 3개가 되어 반려된다.
- 같은 라벨 2줄이면 첫 줄만 채택(`seen`).

### 3-8. 오토스냅(무손실 보정) — 있어도 기대지 마라

`autoSnapSummaryMc(q)` — `parser-summary-mc.ts:324-374`

| 스냅 | 동작 | 조건·한계 | file:line |
|---|---|---|---|
| S1 | 요약문 빈칸 라벨 표기 정규화 — 전각 괄호 `（a）`·소문자 → `(A)` | 무조건 | `:330-337` (`LABEL_MARKER_RE :252`) |
| S2 | 요약문 라벨 뒤 빈칸선 제거 — `(A) _____`/`(A) ……`/`(A) ---` → `(A)` | 라벨 **직후**에 붙은 것만 | `:338-342` (`BLANK_RUN_AFTER_MARKER_RE :253`) |
| S3 | 선지 값 표기 정규화 — 굵게 `**`·양끝 따옴표·양끝 파이프·라벨 접두(`(A) x` / `A: x`)·꼬리 `,;` 제거 | 값의 **내용**은 손대지 않는다. 맨몸 라벨(`A x`)은 구분자가 있어야 라벨로 본다 | `:269-286` (`:255,260,261,263`) |
| S4 | 값 라벨 기준 열 재정렬 — `⑤ (B) boredom …… (A) distracted` 를 라벨 순으로 되돌림 | **전 값에 라벨이 있고 서로 다를 때만.** 부분 라벨·중복 라벨이면 손대지 않고 `valueLabels` 를 남겨 게이트가 자리를 지목 | `:294-310, 356-362` |

스냅 결과는 `corrections[]` 로 기록되고 qbank 하네스에서 `AUTOSNAP` **경고**로 남는다(`qgen-core.ts:313`). **경고 0을 목표로 저작하라** — 스냅이 돌았다는 것은 형식을 틀렸다는 뜻이다.

---

## 4. 게이트 체크리스트

판정의 진실원은 `parsed.gateIssues` 다(00-contract §2). 아래가 **전수**다.

### 4-1. `gateMdSummaryMc` — `src/lib/md-qgen/gate-summary-mc.ts`

호출 인자: `{blankCount(기본 2), optionCount(기본 5), requireWrong(기본 true), difficulty(기본 "KILLER")}` — `:215-218`.
레인은 `{blankCount, optionCount:5, difficulty: ctx.rawDifficulty}` 를 넘긴다(`lane-summary-mc.ts:115-119`) → **`requireWrong` 은 항상 true**.

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `요약문 누락 — '요약문:' 줄이 없거나 비어 있음` | `q.summary` 가 빈 문자열 (**즉시 return**) | :223-224 |
| `선지 {n}개 ({m}개 필요) — 각 줄은 '① 값1 …… 값2' 형식이어야 함` | `options.length !== optionCount` (**즉시 return**) | :226-231 |
| `요약문에 설정 범위 밖 빈칸 라벨 {…} 가 있음 — {labels} 만 써야 함` | 라벨열 ≠ 기대열 **이면서** 범위 밖 라벨 존재 | :236-243 |
| `요약문 빈칸 라벨이 {labels} 순서로 각 1회가 아님 — 실제 {…\|없음}` | 라벨열 ≠ 기대열(순서·개수) | :243-247 |
| `요약문에 {(A)} 가 {n}회 등장 (정확히 1회 필요)` | 개별 라벨 등장 수 ≠ 1 | :249-253 |
| `요약문에 한국어가 섞임 — 영어 한 문장이어야 함` | 요약문에 `[가-힣]` | :256 |
| `요약문에 영어 본문이 없음` | 라벨 제거 후 `[A-Za-z]` 0개 | :257-259 |
| `요약문이 문장 종결 부호 없이 끝남("...{tail}") — 생성이 잘린 요약문` | 끝의 따옴표·괄호·공백 제거 후 마지막 문자가 `.!?` 아님 | :262-267 |
| `요약문이 두 문장 이상 — 한 문장으로 압축해야 함` | `sentenceEndCount > 1` (약어 `U.S.` 는 세지 않는 보수 계수) | :59-67, 268-270 |
| `요약문이 {n}단어로 너무 짧음 (8단어 이상 필요)` | 라벨 제거 후 단어 수 < 8 | :34, 273-276 |
| `요약문이 {n}단어로 너무 김 (60단어 이하)` | 단어 수 > 60 | :35, 276-278 |
| `요약문이 지문을 연속 8단어 이상 그대로 옮김("{gram}") — 재진술로 다시 쓸 것` | 소문자·영숫자 토큰 기준 8-gram 일치 | :41, 69-84, 280-286 |
| `선지 번호가 {①②③④⑤} 순서가 아님 — 실제 {…\|없음}` | 라벨열 ≠ `①②③④⑤` | :289-294 |
| `{①} 값 {n}개 ({m}개 필요) — ' …… ' 로 {m}개를 연결할 것` | `values.length !== blankCount` (그 선지 이후 검사 중단 + `shapeOk=false`) | :297-304 |
| `{①} {(A)} 값이 비어 있음` | 값이 공백 | :307-310 |
| `{①} {(A)} 값에 한국어가 섞임: '{…}'` | 값에 `[가-힣]` | :312-313 |
| `{①} {(A)} 값이 영어가 아님: '{…}'` | 값에 `[A-Za-z]` 0개 | :314-316 |
| `{①} {(A)} 값에 빈칸 라벨이 붙어 있음: '{…}'` | 값 안에 `(A)`~`(D)`(전각 포함) 잔존 | :317-319 |
| `{①} {(A)} 값에 표 구분자 '\|' 가 남아 있음: '{…}' — 값만 적을 것` | 값에 `\|` 잔존 | :322-326 |
| `{①} {n}번째 값의 라벨이 {(A)} — 그 자리는 {(B)} 값이어야 함` | 스냅이 남긴 `valueLabels[i]` 가 그 열 라벨과 불일치 | :330-335 |
| `{①} {(A)} 값이 {n}단어로 김 (6단어 이하): '{…}'` | 값 단어 수 > 6 | :36, 336-341 |
| `{(A)} 열의 값이 전부 동일('{…}') — 그 빈칸을 묻지 않는 문항이 됨` | 열의 distinct 값 < 2 (`shapeOk` 일 때만) | :347-354 |
| `{(A)} 열의 값 길이 편차가 {n}단어 — 열 병렬 위반(±3단어 이내)` | 열의 max−min 단어 수 > 3 | :38, 355-361 |
| `{…} 조합이 정답 {①} 조합과 완전히 동일` | 정답과 값이 전부 같은 오답 존재 | :364-375 |
| `조합 중복: {…} 가 같은 값 조합` | 정답이 끼지 않은 조합 중복 | :377 |
| `정답 누락 — '정답: ①' 형식의 줄이 필요함` | `q.answer` 빈 값 | :383-384 |
| `정답 라벨({①})이 선지에 없음` | 정답 라벨이 options 에 없음 | :385-386 |
| `{(A)} 정답 값('{…}')이 요약문에 그대로 노출됨 — 빈칸이 무의미해짐` | 정규화 후 4자 이상 정답 값이 요약문에 부분문자열로 존재 | :391-400 |
| `(A)만 정답이고 (B)가 틀린 반쪽 정답 조합이 없음 — 한쪽 빈칸만 보고 풀리는 문항이 됨` | blankCount 2 · **KILLER(또는 난이도 미지정)에서만 차단** | :127-136, 402-405 |
| `(B)만 정답이고 (A)가 틀린 반쪽 정답 조합이 없음 — 한쪽 빈칸만 보고 풀리는 문항이 됨` | 〃 | :137-142, 402-405 |
| `한 칸만 틀린 near-miss 조합이 없음 — {(A)(B)(C)} 를 전부 검증해야 풀리게 설계할 것` | blankCount ≥ 3 · KILLER 에서만 차단 | :143-148, 402-405 |
| `KILLER 함정 강도 부족 — 정답 (A) '{a}' 와 짝지은 채로 (B) 자리만 '{b}' 와 같은 의미장의 다른 값으로 바꾼 오답이 없음. 가장 강한 (B) 함정을 정답 (A)에 붙일 것` | `difficulty==="KILLER" && blankCount===2` **그리고** `summarySemanticFamily(answerB) !== null` | :162-184, 411-413 |
| `KILLER 함정 강도 부족 — 정답 (B) '{b}' 와 짝지은 채로 (A) 자리만 '{a}' 와 같은 의미장의 다른 값으로 바꾼 오답이 없음. 가장 강한 (A) 함정을 정답 (B)에 붙일 것` | 〃 (`summarySemanticFamily(answerA) !== null`) | :185-192, 411-413 |
| `해설 누락` | `q.explanation` 빈 값 | :417 |
| `오답해설 {n}개 ({m}개 필요) — 정답 번호를 제외한 모든 선지에 1줄씩` | `wrong.length !== optionCount-1` (requireWrong=true 일 때) | :419-424 |
| `오답해설에 정답 라벨 포함` | wrong 에 정답 라벨(파서 필터 우회 시) | :425-427 |

### 4-2. 비차단 권고 — `summaryMcGateAdvisories` (반려 아님)

| 문자열 | 조건 | file:line |
|---|---|---|
| `참고(비차단): (A)만 정답…` / `참고(비차단): (B)만 정답…` / `참고(비차단): 한 칸만 틀린 near-miss…` | **BASIC·INTERMEDIATE** 에서 반쪽 정답/near-miss 부재 | gate-summary-mc.ts:440-452 |

레인은 `gateIssues.length === 0` 일 때만 이 권고를 `corrections` 에 붙인다(`lane-summary-mc.ts:126-129`) → qbank 하네스에서 `AUTOSNAP` 경고로 기록된다(`qgen-core.ts:313`).

> **차단 예산 설계**: `summary-mc-missing-half-correct-traps` 는 검증기에서 `SHIP_FIRST_WARNING_CODES` 강등 대상이라(`question-quality/core.ts:61`, 강등 지점 `dispatcher.ts:893-899`) fast 레인이 정상 출하한다. md 가 전 난이도에서 하드 반려하면 회귀가 되므로 KILLER 만 차단한다(`gate-summary-mc.ts:196-209` 주석).

### 4-3. 어댑터 실패 (게이트 통과 후 차단) — `adapter-summary-mc.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `요약문 누락` | `!q.summary` | :69 |
| `선지 {n}개 (5개 필요)` | `options.length !== 5` | :70-75 |
| `정답 누락` | `!q.answer` | :76 |
| `정답 라벨({①})이 선지에 없음` | 정답 라벨 미존재 | :77-79 |
| `선지 {①} 조합값 {n}개 (빈칸 {m}개와 불일치 또는 공백)` | 값 개수 불일치 또는 공백 값 | :80-87 |

### 4-4. 후처리 — 실패 경로 없음

`SUMMARY_COMPLETE_MC` 는 `PASSTHROUGH_TYPES` 멤버(`question-postprocess/types.ts:75`). 후처리가 하는 일은 하나뿐이다:
`wrongOptionExplanations` **배열 → Record 정규화**(`question-postprocess/index.ts:165-167`). 어댑터가 배열형으로 내는 이유가 이것이다.

### 4-5. qbank 하네스 유닛 게이트 — `qbank/harness/qgen-core.ts`

| 코드 | 조건 | file:line |
|---|---|---|
| `CONTAINER` | `<!-- ITEM n -->` 헤더 누락·번호 비연속·`point:` 누락·`settings:` JSON 파손·본문 공백 | :49-99 |
| `ITEM_COUNT` | 문항 수 < minItems(기본 5) | :229-237 |
| `GATE` | 위 4-1 전수 | :306 |
| `ADAPT` / `POSTPROCESS` | 4-3 / 4-4 | :307-310 |
| `POINT_DUPLICATE` | 유닛 내 `point:` 값 중복(정규화 비교) | :324-333 |
| `ANSWER_DUPLICATE` | **두 문항의 빈칸 정답 값이 한 칸이라도 겹치면 차단** — `diversityTargets` 가 `blanks[].answer` **전량**이다 | :336-353 + lane-summary-mc.ts:169-183 |

> ⚠ `gateUnit` 은 `lane.isEligible` 을 **호출하지 않는다**. 범위 밖 `blankCount` 는 `clampSummaryMcMdBlankCount` 가 조용히 접는다(1→2, 9→4).

### 4-6. 품질 검증기(`qualityBlocking`) — 프로덕션은 비차단, qbank 은 차단

`validateSummaryCompleteMcQuestion` (`question-quality/validators/summary/mc.ts:7-311`) 의 **error** 코드 전수:

`summary-mc-missing-direction` · `summary-mc-direction-task-mismatch` · `summary-mc-missing-summary` · `summary-mc-blank-marker-count` · `summary-mc-stem-unterminated` · `summary-mc-summary-language` · `summary-mc-missing-blank-answer` · `summary-mc-answer-language` · `summary-mc-answer-leaks-in-summary` · `summary-mc-correct-completion-ungrammatical` · `summary-mc-awkward-collocation`\* · `summary-mc-correct-answer-mismatch` · `summary-mc-correct-pair-mismatch` · `summary-mc-answer-object-mismatch` · `summary-mc-option-pair-shape` · `summary-mc-option-language` · `summary-mc-duplicate-correct-option` · `summary-mc-missing-half-correct-traps`\* · `summary-mc-killer-weak-a-trap` · `summary-mc-killer-weak-b-trap` · `summary-mc-killer-buried-a-trap` · `summary-mc-killer-buried-b-trap` · `summary-mc-killer-too-easy-a-column` · `summary-mc-killer-too-easy-b-column`

\* = `SHIP_FIRST_WARNING_CODES` 강등 대상 → **warning 으로 내려와 qbank 에서도 차단하지 않는다**(`core.ts:60-61`, `dispatcher.ts:893-899`).

**warning 전용**: `summary-mc-direction-frame` · `summary-mc-summary-too-many-sentences` · `summary-mc-missing-all-but-one-trap` · `summary-mc-explanation-experimental-jargon` · (KILLER 공통) `thin-killer-explanation` · `few-key-points` · `shallow-killer-options` · `option-length-giveaway`.

> **구조적으로 항상 뜨는 경고**: 어댑터가 `keyPoints: []` 를 **고정**으로 내므로(`adapter-summary-mc.ts:122`) KILLER 문항은 `few-key-points` 경고를 반드시 받는다. 정상이다(프로브 P3 에서 KILLER 2문항에만 발생, blocking 0).

공통 error 중 이 유형에서 실제로 밟기 쉬운 것:

| 코드 | 조건 | file:line |
|---|---|---|
| `explanation-quoted-token-missing` | 해설이 따옴표로 인용한 **12자 이상** 영어 조각이 지문·문항 표시면 어디에도 없음. 검사 코퍼스에 **원 지문이 포함**되므로 지문 문장 축자 인용은 안전 | validators/explanation-quoted-tokens.ts:36-37, 122, 143-161 |
| `explanation-foreign-script` | 해설에 한자·가나 (한글 직후 괄호 병기만 예외) | validators/explanation-foreign-text.ts |
| `explanation-latin-jam` | `steals다` 류 영단어+한국어 종결어미 접합 | 〃 |

---

## 5. adapter 산출 필드

`adaptMdSummaryMcToAiQuestion(q, difficulty, blankCount)` — `adapter-summary-mc.ts:63-126`

| 키 | 값 | 비고 |
|---|---|---|
| `direction` | ko: `다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?` / en: `Which set of words best fits blanks (A), (B) in the one-sentence summary of the passage?` | `:41-48`. en 은 레인이 `stemLanguage="en"` 일 때 사후 치환(`lane-summary-mc.ts:140-148`) |
| **`summaryWithBlanks`** | md `요약문:` 값 **축자 전달**(라벨만, 밑줄 없음) | `:113`. **이 유형 고유.** 학생 표면의 `(A) _____` 는 표시 계층이 붙인다(`summary-complete-mc.ts:215-230`) |
| **`blanks[]`** | `[{label:"(A)", answer}, {label:"(B)", answer}, …]` — **정답 선지의 값에서 파생** | `:89-91`. **이 유형 고유.** md 가 빈칸 정답을 따로 받지 않기 때문(규범 §1-B 철칙 1) |
| `options[]` | `{label:"1"~"5", text, blankValues[], blankA, blankB, …}` | `:93-100` |
| ├ `label` | **숫자 문자열 `"1"`~`"5"`**(`digitOptionLabel`, `adapter.ts:75-78`) | 원문자 ① 을 그대로 내면 셔플이 정답 키를 통째로 어긋나게 한다 |
| ├ `text` | 값을 **계약 리터럴 `" …… "` 로 결정론 재조립** — md 원문의 구분자 드리프트를 여기서 흡수 | `:97` |
| ├ **`blankValues[]`** | `[{label:"(A)", value}, {label:"(B)", value}, …]` | `:98`. **이 유형 고유** |
| └ **`blankA`~`blankD`** | legacy `summaryPairOptionSchema` 호환 평면 필드 | `:51-61, 99`. **이 유형 고유** |
| `correctAnswer` | `digitOptionLabel(q.answer)` = `"1"`~`"5"` | `:116` |
| `wrongOptionExplanations[]` | `[{label:"2", explanation}, …]` — **배열형**(후처리가 Record 로 정규화) | `:105-107` |
| `explanation` | 해설 원문 | `:118` |
| `keyPoints` | **항상 `[]`** (합성 금지 — 출제자 노트 노출 사고 방지) | `:119-122` |
| `tags` / `difficulty` | `[]` / `ctx.rawDifficulty` | `:123` |

**만들지 않는 것**: `passageWithBlank` · `passageWithMarkers` · `originalExpression` · `markedWords` — 지문 파생 필드가 하나도 없다(`:16`, 픽스처 `_test-md-summary-mc.ts:412-418` 가 이를 검사).

**셔플 상호작용**: 이 유형은 `SHUFFLE_OPTION_TYPES` 멤버(`question-diversity.ts:518`). 저장 직전 선지가 재배열되며, 옵션 객체의 모든 키(`text`·`blankValues`·`blankA/B`)가 함께 이동하고 `correctAnswer`·`wrongOptionExplanations` 가 재매핑된다(`:652`). **해설·오답해설에서 선지를 "3번" 같은 평숫자로 지칭하면 셔플 후 어긋난다** — 원문자나 값 자체를 인용하라(`prompts-summary-mc.ts:162`).

**저장**: `structuredData` = 위 산출 + `_typeId`/`_typeLabel`/`_generationPlan`/`difficulty` + 셔플 + tags (00-contract §11).

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 | file:line |
|---|---|---|---|---|---|
| **`blankCount`** (별칭 `summaryBlankCount`) | number | **2** | **2~4** (`Math.round` 후 clamp) | 요약문 라벨 수(`(A)`~`(D)`) = 선지 한 줄의 값 개수 = `blanks[]` 길이. 2칸이면 반쪽 정답 2종, 3칸 이상이면 near-miss 1개가 요구된다 | settings/summary.ts:7-11,37-43 · prompts-summary-mc.ts:23-25,33-47 · gate-summary-mc.ts:114-148 |
| `optionCount` | number | **5** | **노브 없음(5 고정)** | 선지 5줄 · 오답해설 4줄. 게이트 인자로는 존재하나 레인이 항상 5를 넘긴다 | prompts-summary-mc.ts:27-28 · lane-summary-mc.ts:117 |
| `requireWrong` | boolean | **true** | — | `오답:` 섹션 필수 여부. **레인이 넘기지 않으므로 항상 true** | gate-summary-mc.ts:217 |
| `stemLanguage` | `"ko"`\|`"en"` | `"ko"` | — | **마크다운 본문 불변.** 발문만 영어로 교체(어댑터 후단). 요약문·선지는 구조적으로 영어 고정, 해설은 한국어 고정 | language.ts:28,61-79 · lane-summary-mc.ts:96-105,140-148 |
| `optionLanguage` | `"ko"`\|`"en"` | `"en"` | — | **무효 노브** — 이 유형의 토글 scope 는 `"stem"` 뿐. `qualityArgs` 는 저장값이 아니라 구조 기본값 `"en"` 을 **하드코딩 보고**한다 | language.ts:61-79 · lane-summary-mc.ts:152-160 |
| `difficulty` (ITEM 헤더) | `BASIC`\|`INTERMEDIATE`\|`KILLER` | `INTERMEDIATE` | — | **형식은 불변, 게이트 강도가 바뀐다.** KILLER = 반쪽정답/near-miss 하드 차단 + 함정 강도 검사. BASIC·INTERMEDIATE = 비차단 권고 | qgen-core.ts:79-89 · gate-summary-mc.ts:99-103,219,402-413 |

**적격성**(`lane-summary-mc.ts:68-86`): `resolved.summaryCompleteMcBlankCount` 와 `resolved.blankCount` 가 모두 정수 2~4 여야 한다. 범위 밖이면 레인이 거부. **단 qbank `gateUnit` 은 `isEligible` 을 호출하지 않으므로** 실질 방어는 클램프 + 게이트가 한다.

**설정 읽기 경로**: flat 우선 → `rawSettings["SUMMARY_COMPLETE_MC"]` 중첩 폴백(`settings/shared.ts:88-102`). qbank ITEM 헤더의 `settings:` JSON 은 `{SUMMARY_COMPLETE_MC:{...}}` 로 병합된다(`qgen-core.ts:369-377`).
**교사 지정 포인트**: 이 유형은 `POINT_PICKER_CONFIG` 미등재라 `teacherPoints` 가 항상 `[]` 이고 준수 게이트가 없다(`lane-summary-mc.ts:10-15`).

---

## 7. 함정 (전부 코드 근거 있음 · ★는 프로브로 실증)

1. ★ **`정답: (A)` 로 쓰면 정답이 통째로 사라진다.** 이 유형의 정답 축은 **원문자 `①~⑤`**, `(A)(B)` 는 **빈칸 라벨 축**이다. 두 축을 섞으면 「정답 누락」(`parser-summary-mc.ts:216-220`). 어법·어휘 골격에서 복사해 오는 최다 사고 지점.
2. ★ **값 안에 ` / ` 나 `...` 를 쓰면 열이 쪼개진다.** `VALUE_SPLIT_RE`(`:138`)가 공백으로 둘러싼 슬래시/파이프와 2점 이상 마침표를 구분자로 본다 → 「① 값 3개 (2개 필요)」. 붙임 슬래시(`a/b`)·하이픈(`value-based`)은 안전하다.
3. ★ **오답 해설을 두 줄로 쓰면 둘째 줄이 조용히 사라진다.** 라벨 없는 줄은 `OPTION_LINE_RE` 에 걸리지 않는다(`:133-134,161-184`). 개수 게이트는 통과하므로 **무음 손실**이다 — 한 항목 = 한 줄.
4. ★ **요약문에 정답 값을 노출하지 마라.** 4자 이상 정답 값이 요약문 안에 부분문자열로 있으면 반려(`gate-summary-mc.ts:391-400`). 어형이 조금 달라도 정규화 후 부분문자열이면 걸린다.
5. ★ **요약문이 지문과 연속 8단어 겹치면 실격.** 토큰은 소문자·영숫자만 남기고 비교하므로 구두점 바꿔치기로는 못 피한다(`:50-56,69-84`). 요약문은 **재진술**이지 발췌가 아니다.
6. ★ **같은 열의 값 길이 편차가 3단어를 넘으면 반려.** 정답만 길거나 하나만 어구면 내용을 안 읽어도 걸러진다(`:355-361`). 실무적으로 **전 값 1~2단어로 통일**하는 것이 가장 안전하다.
7. ★ **KILLER 에서 반쪽 정답 2종은 하드 게이트다.** `(A)`만 맞는 조합 1개 + `(B)`만 맞는 조합 1개. **맞는 쪽 값은 정답 값과 축자 동일**해야 한다(`summaryMcCmp` 비교 — 대소문자·양끝 따옴표·꼬리 구두점만 흡수, `:58-64`). 미묘하게 다르게 쓰면 반쪽 정답으로 인정되지 않는다.
8. ★ **KILLER 함정 강도 게이트는 「의미장」이 잡힐 때만 발화한다.** `SUMMARY_SEMANTIC_FAMILIES` 는 **6개 하드코딩 목록**(altruistic·evolutionary·responsibility·technology·equality·environmental)이고, 정답 값이 그 목록의 어느 단어도 **부분문자열로 포함하지 않으면 검사가 통째로 건너뛰어진다**(`killer-trap.ts:105-200`, 가드 `gate-summary-mc.ts:177,185`). 즉 **게이트 통과 ≠ 함정이 강하다** — 이 축은 검수 렌즈 ④(미끼 심사)가 책임진다.
   반대로 정답 값이 `moral`·`technical`·`social`·`human`·`access` 처럼 목록에 걸리면 **같은 의미장의 반쪽 정답을 반드시 붙여야** 한다. (부분문자열 판정이라 `allocation` 이 `local` 에 걸리는 식의 우발 발화도 있다.)
9. ★ **`settings` 키는 `blankCount` 다.** `summaryCompleteMcBlankCount` 로 쓰면 **조용히 무시**되고 2칸으로 채점되어, 3칸 문항이 「설정 범위 밖 빈칸 라벨 (C)」로 전량 반려된다(`settings/summary.ts:37-43`, 프로브 P6).
10. ★ **유닛 내 빈칸 정답 값이 한 칸이라도 겹치면 유닛이 통째로 차단된다.** `diversityTargets` 가 `blanks[].answer` 전량이다(`lane-summary-mc.ts:169-183` + `qgen-core.ts:336-353`). 5문항×2칸 = **서로 다른 10개 값**이 필요하다.
11. **요약문은 반드시 종결 부호로 끝난다.** 끝의 따옴표·괄호를 걷어낸 뒤 마지막 문자가 `.!?` 가 아니면 「생성이 잘린 요약문」(`:262-267`).
12. **요약문은 한 문장이다.** `sentenceEndCount > 1` 이면 반려(`:268-270`). 세미콜론·대시로 잇는 것은 안전하지만, 마침표 뒤 대문자가 오면 두 문장으로 센다.
13. **빈칸 라벨은 `(A)`부터 순서대로 각 정확히 1회.** 역순(`(B)`…`(A)`)이면 「순서로 각 1회가 아님」. 선지의 i번째 값이 i번째 라벨의 값이라는 계약이 깨진다(`:234-235` 주석).
14. **라벨 뒤에 밑줄 `_____` 을 붙이지 마라.** 스냅이 지우지만 `AUTOSNAP` 경고가 남는다(`parser-summary-mc.ts:338-342`). 저장 정본은 라벨만이고 밑줄은 표시 계층이 붙인다.
15. **값에 라벨 접두를 붙이지 마라.** `① (A) untrained …… (B) vulnerability` 는 스냅이 떼어 내지만 경고가 남는다. 부분 라벨·중복 라벨이면 스냅이 포기하고 「n번째 값의 라벨이 …」로 반려된다(`:294-310`, `gate-summary-mc.ts:330-335`).
16. **선지 라벨을 중복하지 마라.** `seen` 이 첫 줄만 채택하므로(`:168`) ①을 두 번 쓰면 「선지 4개」가 되고 게이트가 **즉시 return** 하여 다른 진단이 전부 은폐된다.
17. **선지는 `정답:` 앞에 둔다.** 뒤에 두면 폴백 경로(`오답:` 앞 전체)로만 잡히고, 해설 속 번호 목록과 섞이면 조합이 오염된다(`:210-214`).
18. **해설에 헤딩(`## `)이나 머리표를 쓰지 마라.** 그 지점에서 해설이 잘린다(`:239`).
19. **해설의 영어 인용은 12자 이상이면 실재해야 한다.** 검사 코퍼스에 원 지문이 포함되므로 지문 문장 축자 인용은 안전하다(`explanation-quoted-tokens.ts:122`). 요약문·선지 값 인용도 안전(문항 필드 전체가 코퍼스).
20. **해설·오답해설에서 선지를 평숫자("3번")로 지칭하지 마라.** 셔플로 라벨이 바뀐다(`question-diversity.ts:518,652`). 원문자나 값 자체를 인용하라.
21. **오답해설에 정답 라벨을 넣지 마라.** 파서가 걸러내므로 개수가 3개가 되어 「오답해설 3개 (4개 필요)」로 반려된다(`:227`, `gate-summary-mc.ts:419-424`).
22. **정답 조합을 꽂았을 때 요약문이 자연스러운 영어여야 한다.** 검증기가 `question/matter/issue of X to -ing` 형 억지 연결과 `equity/equality/opportunity/responsibility to -ing` 를 error 로 잡는다(`validators/summary/mc.ts:141-162, 862-895`).
23. **머리표 장식이 흡수된다고 해서 쓰지는 마라.** 이 파서는 관대하지만 정본 `parser.ts`(BLANK_INFERENCE·GRAMMAR_ERROR)는 아니다 — 유형별 관용 차이를 계약으로 착각하면 다른 유형에서 터진다(00-contract §8).

---

## 8. 출제 포인트 다각화 축

> 한 지문에서 이 유형으로 5~8문항을 만들 때, **무엇을 달리해야 "N개 문항"이 되는가**.

### 8-A. 하드 제약 — 이것이 다각화를 강제한다

`ANSWER_DUPLICATE` 가 **빈칸 정답 값 전량**을 유닛 범위에서 유일하게 만든다(`lane-summary-mc.ts:169-183` + `qgen-core.ts:336-353`, 정규화는 소문자+영숫자). 즉 **문항 간에 정답 값이 한 칸도 겹칠 수 없다**.

| 유닛 구성 | 필요한 서로 다른 정답 값 수 | 실무 판단 |
|---|---|---|
| 5문항 × 2칸 | 10 | 110단어 이상 지문이면 여유. 본 문서 프로브가 158단어로 통과 |
| 8문항 × 2칸 | 16 | 150단어 이상 권장 |
| 5문항 × 3칸 | 15 | 요약문이 세 겹 사슬을 견뎌야 하므로 논지가 3단 이상인 지문 필요 |
| 5문항 × 4칸 | 20 | 사실상 상한 — 한 문장에 4칸을 자연스럽게 넣기 어렵다 |

**저작 절차**: ① 지문의 논지 축을 5~8개 지점으로 분해한다(도입 통념 / 개념 정의 / 기제 / 유추·사례 / 반증 / 결론·경고) → ② 지점마다 요약문 한 문장을 **먼저** 쓴다 → ③ 각 요약문에서 빈칸 2칸을 정한다 → ④ **정답 값 10개를 표로 늘어놓고 중복을 제거한 뒤** 오답 조합을 채운다. 이 순서를 뒤집으면 마지막 문항에서 반드시 막힌다.

### 8-B. 노브로 달라지는 축 (코드 근거)

| 축 | 값 | 문항이 실제로 달라지는 지점 | 근거 |
|---|---|---|---|
| `blankCount` | 2 / 3 / 4 | **인지 작업의 겹수.** 2칸 = 인과 한 쌍의 교차 검증, 3칸 = 세 마디 사슬(전제→행위→귀결) 전부 검증, 4칸 = 문장 전체 재구성. 게이트도 반쪽정답 2종 ↔ near-miss 로 바뀐다 | prompts-summary-mc.ts:83-97 · gate-summary-mc.ts:114-148 |
| `difficulty` | BASIC / INTERMEDIATE / KILLER | 근거 깊이 1문장 → 2문장 인과·대조 결합 → 단락 전체 논지 방향. **게이트 강도도 실제로 바뀐다**(KILLER 만 반쪽정답·함정강도 하드 차단) | prompts-summary-mc.ts:59-80 · gate-summary-mc.ts:219,402-413 · 헌법 §4 |
| `stemLanguage` | ko / en | 발문 언어만. **다각화 축으로는 무효** — 인지 작업이 같으므로 이것만 다른 두 문항은 사본이다 | lane-summary-mc.ts:96-105 |
| `optionCount` | (5 고정) | 다각화 축 아님 | prompts-summary-mc.ts:27-28 |

### 8-C. 설계로 달라지는 축 (교육적 판단 — 여기가 진짜 승부처)

1. **요약문이 겨냥하는 논지 위치** — 같은 지문이라도 요약의 초점을 어디에 두느냐로 문항이 갈린다.
   `① 도입 통념` / `② 개념·모형 정의` / `③ 핵심 기제(인과)` / `④ 유추·사례` / `⑤ 반증·조건` / `⑥ 결론·경고` / `⑦ 필연성·범위 진술`.
   본 문서 프로브의 5문항이 각각 ⑥·①·③·④·⑦ 을 겨냥한다. **한 지문에서 7문항까지 이 축만으로 확보된다.**
2. **두 칸의 논리 관계** — `(A)`와 `(B)` 를 무엇으로 묶는가. 이것을 바꾸면 학생이 하는 추론의 **종류**가 바뀐다.
   원인–결과 / 문제–해결 / 대조–귀결 / 수단–목적 / 조건–결과 / **자유–필연**(무엇이든 되지만 없어서는 안 됨) / 전제–파생.
   프로브 문항 5가 「자유–필연」축이다 — 같은 지문의 같은 문장군을 쓰면서도 다른 인지 작업이 된다.
3. **빈칸의 품사·문법 슬롯** — 동사 자리(`(A) the pattern`) / 형용사 자리(`an entirely (B) arrangement`) / 명사 자리(`an internal (A) of a steady beat`) / 분사·수동 자리(`is left (A)`). 슬롯이 바뀌면 동원되는 언어 지식이 바뀌고, 열 병렬 규칙(±3단어)도 자연스럽게 다른 어휘 대역을 쓰게 만든다.
4. **정답 값의 추상화 층위** — 지문 어휘의 1단계 일반화(BASIC) / 상위 개념으로의 번역(INTERMEDIATE) / 지문에 단어가 아예 없는 재개념화(KILLER). `prompts-summary-mc.ts:66,73,78` 의 3분기가 이 축이다.
5. **오답 기제 팔레트** — 문항마다 (L,F) 조합을 달리 짠다(헌법 §3). 이 유형에서 실제로 작동하는 배치:

   | 슬롯 | 전형 기제 | 헌법 코드 |
   |---|---|---|
   | 반쪽 정답 ①((A) 정답 + (B) 오답) | (B)를 **같은 의미장의 다른 귀결**로 | L6 형식유사 + F1 관계왜곡 |
   | 반쪽 정답 ②((B) 정답 + (A) 오답) | (A)를 **근접 의미장 어휘**로 | L2 부분사실 + F7 한정어 왜곡 |
   | 양칸 오답 ③ | **인과 방향 반전** | L3 통념공명 + F4 반대방향 |
   | 양칸 오답 ④ | **지문 밖 소재**(즉사 오답 1개까지만) | — + F2 무근거 |

   프로브 5문항이 전부 이 배치를 쓰되 각 슬롯의 **재료**를 달리한다.
6. **정답 값의 의미장 사용 여부** — 정답 값을 `SUMMARY_SEMANTIC_FAMILIES` 목록 안(`moral`·`technical`·`social`·`human` 등)에 두면 KILLER 함정 강도 게이트가 **실제로 발화**해 설계를 강제한다. 유닛 안에 그런 문항을 1~2개 배치하면 기계 검증의 밀도가 올라간다(프로브 문항 3 = `mechanical`).
7. **요약문의 통사 구조** — 종속절 선행(`Because …, …`) / 시간 순서(`first …, and only then …`) / 양보–전환(`may … , but …`) / 이유 후치(`…, since …`). 구조가 바뀌면 빈칸이 앉는 자리와 학생의 독해 경로가 바뀐다.
8. **정답 번호 분포** — 유닛 안에서 정답이 ① 에만 몰리면 요령으로 뚫린다. 저장 직전 셔플이 있긴 하나(`question-diversity.ts:518`) **저작 단계에서도 흩어라** — 검수 렌즈 ③(형식 규정)이 보는 축이다.

### 8-D. 5문항 유닛 표준 배분 (권장 템플릿 — 프로브 실측 구성)

| # | difficulty | blankCount | 논지 위치 | 두 칸의 논리 관계 | 정답 값 예시(프로브) |
|---|---|---|---|---|---|
| 1 | BASIC | 2 | 결론·경고 | 조건–귀결 | breaks / predictable |
| 2 | INTERMEDIATE | 2 | 도입·모형 정의 | 전제–파생 | template / deviations |
| 3 | **KILLER** | 2 | 핵심 기제 | 조건–결과(의미장 사용) | undisturbed / **mechanical** |
| 4 | INTERMEDIATE | 2 | 유추·사례 | 수단–목적 | original / standard |
| 5 | **KILLER** | 2 | 필연성·범위 | **자유–필연** | omitted / lifeless |

(이 배분이 `blocking 0 / qualityBlocking 0` 으로 통과했다. 8문항으로 확장할 때는 ⑤ 반증·조건, ② 개념 정의의 다른 겹, 3칸 문항 1개를 추가한다.)

---

## 검증 로그

- 프로브: `qbank/work/_probe-SUMMARY_COMPLETE_MC.ts` — 실코퍼스 지문 `ebsi_go2_20260604-q40`(158단어, 2026 고2 6월 40번)에 §2 골격으로 **5문항 유닛**을 손으로 저작해 `gateUnit`(parser → autosnap → gate → adapt → postProcess → validateQuestionQuality → POINT/ANSWER 중복)에 통과시켰다.
- 결과: **`blocking 0 / qualityBlocking 0`**, 전 문항 `gate 0 · adapt true · post true · qErr 0`.
  경고 2건은 `few-key-points`(KILLER 2문항) — 어댑터가 `keyPoints: []` 를 고정으로 내므로 **구조적으로 불가피**하며 비차단이다. `AUTOSNAP` 경고 0.
- 리포 픽스처(`scripts/_test-md-summary-mc.ts` `GOOD`) 재현 `gate 0` 확인.
- 3칸(`blankCount: 3`) 골격 `gate 0` 확인, 같은 본문을 2칸으로 채점하면 즉시 반려 확인.
- 음성테스트 **14/14 검출**: 값 안 ` / ` · 값 안 `...` · 오답해설 줄바꿈 유실 · `정답: (A)` · `(A) _____` 스냅 · 설정 범위 밖 `(C)` · KILLER 함정 강도 · 반쪽정답 부재(KILLER 차단 / BASIC 권고 / 난이도 미지정=KILLER) · 지문 연속 8단어 복사 · 정답 값 요약문 노출 · 열 길이 편차 · `settings` 키 오기(`summaryCompleteMcBlankCount`) · ANSWER_DUPLICATE.
- 관용 확인(반려되지 **않아야** 하는 것): 머리표 4종 장식 동시 드리프트 · 요약문 본문 다음 줄 개행 · 값 앞뒤 잉여 구분자.
- 실행: `./node_modules/.bin/tsx qbank/work/_probe-SUMMARY_COMPLETE_MC.ts` → **38/38 통과**
