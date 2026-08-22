# 배열 영작 (WORD_ORDER)

> **분류** 서술형(선지 없음 · 칩 배열) · **지문변형** ×(PASSTHROUGH — 지문은 원문 그대로 문항과 함께 인쇄) · **정답 머리표** **`모범답안:`** (`정답:` 은 폴백 · `정답: ①` 계열 아님) · **최소 지문** [판단] 약 90단어 / 6문장 (코드 하한 없음 — §3-0 참조)
>
> 정찰 근거: `src/lib/md-qgen/{parser-word-order,gate-word-order,adapter-word-order,lane-word-order,prompts-word-order}.ts` 직독 + `scripts/_test-md-word-order.ts` 픽스처 + `qbank/work/_probe-WORD_ORDER.ts` tsx 실행 검증(48/48 통과 · blocking 0 · qualityBlocking 0).
> 공유 계약은 [`../recon/00-contract.md`](../recon/00-contract.md), 품질 규범은 [`../quality-constitution.md`](../quality-constitution.md).
> **`snap-word-order.ts` 는 존재하지 않는다** — 오토스냅은 `gate-word-order.ts:398` `autoSnapWordOrderChips` 에 들어 있다.

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

학생이 보는 것은 **뒤섞인 칩 목록**과 (있다면) 한국어 힌트 한 줄뿐이다. 고를 선지가 없고,
학생은 칩을 늘어놓아 **하나의 완결된 영어 문장**을 직접 써낸다. 채점은 학생이 쓴 문자열을
`modelAnswer`(및 `acceptedAnswers`)와 **정확일치 대조**한다(`exam-scoring/grade.ts:52` — 정규화는
대소문자·공백·문말구두점·스마트따옴표만 흡수, `exam-scoring/normalize.ts:84-96`).

**요구되는 인지 작업 3층:**

1. **지문 판정** — 어느 절이 종속절인가, 누가 행위자인가, 무엇이 무엇의 원인인가.
   미끼 칩이 정확히 이 판정을 시험하므로, 지문을 읽지 않으면 미끼를 배제할 수 없다.
2. **통사 재구성** — 정답 문장은 지문 문장의 **변형본**이다(태·시제·구문 전환·패러프레이즈).
   지문에서 찾아 베껴 쓰는 경로는 게이트가 F급으로 차단한다(`gate-word-order.ts:264-278`).
3. **어순 확정** — 칩 경계가 곧 통사 단위이므로, 조각을 배치하려면 어떤 조각이 어느 자리를
   요구하는지(분사구문 문두, 행위자 전치사구 후치, 관계사절 후행 …)를 확정해야 한다.

**다른 유형과의 결정적 차이 세 가지:**

| 축 | WORD_ORDER | 대비 |
|---|---|---|
| 정답의 진실원 | `모범답안:` **한 줄** — 그 줄의 ` / ` 경계가 **곧 칩** | 객관식은 `정답: ①` + 선지 줄 |
| 정답을 두 번 적지 않는다 | 26-07-26 §1-B 철칙1 개정으로 `칩:` 줄이 계약에서 소멸. "칩으로 정답을 조립할 수 없음" 이 **검사가 아니라 항등식**이 되었다(`parser-word-order.ts:301-309`) | `SENTENCE_ORDER` 는 조각·정답을 별도로 적는다 |
| 오답 설계의 자리 | 선지가 없으므로 오답 공학이 전부 **미끼 칩**에 실린다 | 5지선다는 선지 4개에 분산 |

> ⚠ **PASSTHROUGH + 비차단 조합이 이 유형의 위험이다.**
> `WORD_ORDER` 는 `PASSTHROUGH_TYPES` 다(`src/lib/question-postprocess/types.ts:80`) — 후처리가
> 지문 필드·라벨·발문을 하나도 만들어 주지 않고, 어댑터 산출이 곧 최종 저장·인쇄 형상이다.
> 게다가 프로덕션 md-stream 은 품질 검증기 결과를 기록만 하고 차단하지 않는다.
> **여기서 못 잡은 결함은 학생 화면·시험지·채점까지 그대로 간다**(`gate-word-order.ts:7-11`).

> ⚠ **지문이 문항 안에 함께 인쇄된다** (`src/app/t/[token]/taking-parts/question-view.tsx:34,185`
> `PASSAGE_CONTENT_SUBTYPES`). 그래서 정답이 지문 문장의 통째 복사면 "필사 문제"가 된다.

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (신형식 — 현행 계약)

```md
모범답안: <청크1> / <청크2> / <청크3> / <청크4> / <청크5>
미끼: <미끼1> / <미끼2>
힌트: <한국어 한 줄 — 문장이 글에서 하는 역할만. 생략하려면 이 줄을 통째로 지운다>
허용답:
- <정답 청크만으로 과부족 없이 조립되는 등가 어순 문장. 확신 없으면 이 섹션을 통째로 지운다>
해설: <한국어 2문장, 합니다체 — ①어떤 구문 전환을 적용했는지 ②그 어순이 왜 유일하게 성립하는지>
```

**핵심 규칙 5줄 요약**

- `모범답안:` 줄은 **정답 문장을 ` / ` 로 끊어 쓴 한 줄**이다. 그 조각이 곧 정답 칩이고,
  ` / ` 를 지우고 이어 읽으면 완결 문장이 되어야 한다. 마지막 청크에 **문말 마침표를 붙인다**.
- `미끼:` 는 정답에 **쓰이지 않는 새 칩**이다. 위 청크를 다시 적는 것이 아니다.
- `힌트:` `허용답:` 은 선택. 안 쓸 거면 **줄/섹션을 통째로 지운다**(빈 값으로 두지 마라).
- `해설:` 이 **마지막 줄**이다. 그 뒤에 설계 노트·발문·요약 어떤 줄도 붙이지 마라.
- **장식 0** — 굵게·헤딩·불릿(허용답 제외)·인용·표 파이프·백틱·따옴표 래퍼를 쓰지 않는다.

### 2-2. qbank 컨테이너 (유닛 = 지문 1 × WORD_ORDER × 5~8문항)

```md
<!-- ITEM 1
difficulty: BASIC
point: <이 문항만의 출제 포인트 — 유닛 내 중복 시 POINT_DUPLICATE 반려>
craft: <설계 의도 메모(선택)>
settings: {"stemLanguage":"en"}
-->
모범답안: ...
미끼: ...
해설: ...

<!-- ITEM 2
...
-->
```

`<!-- ITEM n -->` 은 **qbank 규약이지 md-qgen 규약이 아니다**(`qbank/harness/qgen-core.ts:57`
`ITEM_HEADER = /<!--\s*ITEM\s+(\d+)\s*\n([\s\S]*?)-->/g`). 헤더 본문의 키는
`/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/` 로 읽는다(`:78`) — **헤더 키는 반드시 ASCII**다.

| 컨테이너 반려 조건 | 문자열 | file:line |
|---|---|---|
| `<!-- ITEM n -->` 헤더가 하나도 없음 | ``ITEM 헤더가 하나도 없다 — 컨테이너 형식 위반(`<!-- ITEM 1 ... -->`)`` | `:68` (프로브 B8) |
| `settings:` 가 JSON 이 아님 | `ITEM n: settings 가 JSON 이 아니다 — …` | `:86` |
| `difficulty:` 가 3값이 아님 | `ITEM n: difficulty 가 BASIC\|INTERMEDIATE\|KILLER 가 아니다 — …` | `:91` |
| **`point:` 누락** | `ITEM n: point(출제 포인트) 누락 — 포인트 다각화 추적 불가` | `:93` |
| 헤더 뒤 본문이 빔 | `ITEM n: 본문이 비어 있다` | `:94` |
| ITEM 번호가 1부터 연속이 아님 | `ITEM 번호 비연속: k 자리에 n` | `:95` |

`difficulty:` 를 아예 안 쓰면 `INTERMEDIATE` 로 폴백한다(`:89,99`) — 반려가 아니라 **조용한 기본값**이다.

### 2-3. 검증된 정상 픽스처 전문

`scripts/_test-md-word-order.ts:840-845` 의 **신형식 정본 픽스처 V2**(게이트 클린 · 보정 0 · 채점 왕복 CORRECT):

```md
모범답안: Spreading faster / than regulators could respond, / the norms / were shaped / by early adopters.
미끼: by regulators / shaped
힌트: 앞 문장의 인과 관계를 뒤집어 결과 쪽에 초점을 둔 문장입니다.
허용답:
- The norms were shaped by early adopters, spreading faster than regulators could respond.
해설: 원인절을 분사구문으로 접고 주절을 수동태로 바꾼 문장입니다. 분사구문이 문두에 오고 행위자를 나타내는 전치사구가 뒤에 놓여야 어순이 성립합니다.
```

대응 지문(`scripts/_test-md-word-order.ts:41-45`):
> Because the technology spread faster than regulators could respond, early adopters quietly shaped the norms that everyone later inherited. Lawmakers arrived years afterward, drafting rules for practices that had already hardened into ordinary habit. Researchers who study this pattern call it a governance lag, and they warn that the interval keeps widening. Each new platform compresses the distance between invention and mass adoption, leaving even less room for public deliberation.

> ⚠ 같은 파일 `:50-56` 의 `GOOD` 픽스처는 **구형(`칩:` 줄) 대조군**이다. 파서가 무회귀
> 폴백으로 흡수할 뿐 **계약이 아니다** — 저작에 복사하지 마라(§7 함정 T9).

### 2-4. 프로브에서 실제로 통과한 6문항 유닛(발췌)

`qbank/work/_probe-WORD_ORDER.ts` — 지문 97단어/6문장, 6문항 전량 blocking 0 · qualityBlocking 0 · 보정 0.

```md
<!-- ITEM 4
difficulty: KILLER
point: S5 it-분열문으로 초점 이동 + 현재완료 전환 — 대조 축을 유지한 채 강조 구조 도입
craft: 미끼를 시제 축(that had earned)과 행위자 축(by steel)으로 분산해 한 번의 판단으로 함께 배제되지 않게 했다
-->
모범답안: It is not raw force / but the slow, noisy manner / of its yielding / that has earned / steel / its good name.
미끼: that had earned / by steel
해설: 대조의 뒷항을 초점 자리로 끌어올린 분열문으로 바꾸고 주절의 시제를 현재완료로 옮긴 문장입니다. 강조 대상 뒤에 관계사절이 이어져야 분열문의 골격이 완성됩니다.
```

```md
<!-- ITEM 5
difficulty: KILLER
point: S2 콜론 병렬을 의사분열문 주어절로 흡수 — 질문의 내용을 문장 주어로 승격
-->
모범답안: What matters / to modern designers / is how a structure / behaves / once damage / has begun.
미끼: have begun / for modern designers
허용답:
- How a structure behaves once damage has begun is what matters to modern designers.
해설: 콜론 뒤에 병렬돼 있던 질문의 내용을 통째로 주어절로 끌어올린 의사분열문입니다. 주어절과 보어절을 맞바꾸어도 같은 칩 조합으로 성립하므로 두 어순을 모두 정답으로 인정합니다.
```

---

## 3. 파서 계약 (★ 가장 중요)

### 3-0. 전 경로 호출 순서

```
lane.parseAndGate(text, ctx)                      lane-word-order.ts:67-80
  ├ parseMdWordOrder(text)                        parser-word-order.ts:274
  ├ autoSnapWordOrderChips(parsed)                gate-word-order.ts:398   ← 스냅이 게이트보다 먼저
  └ gateMdWordOrder(q, passage, {distractorMin})  gate-word-order.ts:97
lane.adapt(parsed, ctx)                           lane-word-order.ts:82-99
postProcessQuestion("WORD_ORDER", ...)            PASSTHROUGH — 무동작
```

**게이트는 스냅 뒤의 형상을 본다.** 스냅이 먼저 고쳐 놓는 항목(허용답 절삭·미끼 재도출·칩 재배열)은
게이트에 도달하지 못한다 → §4 표의 "도달성" 열을 반드시 읽어라.

**지문 길이 하한은 코드에 없다.** 게이트는 `passage` 를 §4 #9(verbatim 대조)와 #12(인용 실재
코퍼스)에만 쓴다. `[판단]` 5~8문항을 서로 다른 문장에서 뽑아야 하므로 **문장 6개 이상 / 90단어 이상**을
실무 하한으로 둔다(프로브 지문 = 97단어/6문장에서 6문항 성립).

### 3-1. 인식하는 라벨 8종 — 정규식 원문 그대로

`parser-word-order.ts:66-73`

| 상수 | 정규식 리터럴 | 의미 |
|---|---|---|
| `KW_MODEL_ANSWER` | `모범[ \t]*답안` | ★ 정답 + 청크 경계 (`모범답안` · `모범 답안`) |
| `KW_ANSWER` | `정답` | 모범답안의 **폴백**(`readKeywordValue` 1순위 실패 시) |
| `KW_CHIPS` | `(?:칩\|배열[ \t]*단어\|제시[ \t]*단어)` | **구형 폴백 전용 — 저작 금지** |
| `KW_DISTRACTOR` | `미끼` | 미끼 칩 |
| `KW_HINT` | `(?:문맥[ \t]*)?힌트` | 한국어 힌트(선택) |
| `KW_ACCEPTED` | `허용[ \t]*답(?:안)?` | 허용답(선택) — `허용답` · `허용 답안` |
| `KW_EXPLANATION` | `해설` | 해설 |
| `KW_RUBRIC` | `채점[ \t]*기준` | **정지 키워드로만 쓰인다** — 필드로 읽지 않는다 |

`ALL_KEYWORDS` 는 위 8개 전부이며 `stopKeywordsExcept(k)` 가 섹션 절단에 쓴다
(`parser-word-order.ts:76-83`). **한 라벨이라도 오타 나면 그 필드가 통째로 사라지고,
게이트가 "해설 누락"·"미끼 0개" 같은 사실과 다른 원인을 지목한다.**

### 3-2. 머리표 관용 폭 (공유 `decoration.ts`)

`keywordLineRe(keyword)` = `` `^[\s>|]*(?:#{1,6}\s*)?(?:[-*•]\s+)?[\s*_~`"'“‘]*` `` + keyword +
`` `[\s*_~`"'”’]*\s*[:：]?[\s*_~`]*[ \t]*` `` + `(.*)$` , 플래그 `m` (`decoration.ts:81-99`)

흡수되는 것: 들여쓰기 · 인용 `>` · 표 파이프 `|` · 헤딩 `#`~`######` · 불릿 `- * •` ·
강조 `* _ ~` 백틱 · 감싼 따옴표 · **전각 콜론 `：`** · **콜론 생략** · 꼬리 공백.
추가로 `stripOrderedBullets` 가 번호 불릿 `1. ` `2) ` 를 진입점에서 제거(`parser-word-order.ts:87`).

> **관용은 계약이 아니다.** 저작 규칙은 여전히 **장식 0**이다. 흡수 경로는 유형마다 다르며,
> 이 유형만 통과하는 장식이 다른 유형에서 필드를 통째로 지운다(00-contract §8).

### 3-3. ★ `모범답안:` 줄 — 정답과 칩이 동시에 나오는 유일 지점

```
modelAnswerLine = stripWordOrderLineWrappers(
    readKeywordValue(text, "모범[ \t]*답안", stop) || readKeywordValue(text, "정답", stop)
)                                                        parser-word-order.ts:284-287
answerChunks    = splitWordOrderChips(modelAnswerLine)   parser-word-order.ts:304
chunksFromAnswer= answerChunks.length > 1                parser-word-order.ts:305
modelAnswer     = chunksFromAnswer ? joinWordOrderChunks(answerChunks) : modelAnswerLine
chips           = chunksFromAnswer ? [...answerChunks, ...distractors] : legacyChips
```

| 규칙 | 근거 | 어기면 무엇이 사라지는가 |
|---|---|---|
| **청크 구분자는 ` / ` 하나뿐** — `CHIP_SLASH_SPLIT = /[ \t]+[/／][ \t]*\|[ \t]*[/／][ \t]+/` (한쪽 공백만 있어도 발화, 전각 `／` 포함) | `parser-word-order.ts:235` | 공백 없는 `a/b` 는 **칩 안의 문자**로 남아 청크가 안 갈린다 → 청크 1개 → 「모범답안 줄에 청크 경계가 없음」 (프로브 E4) |
| **쉼표로는 절대 나누지 않는다** | `parser-word-order.ts:243-254` 주석·구현 | 쉼표만 쓰면 청크 0 → 같은 반려 (프로브 E3) |
| 슬래시가 하나도 없고 **파이프만** 있으면 `CHIP_PIPE_SPLIT = /[ \t]*\|[ \t]*/` 로 나눈다(표 드리프트 흡수) | `parser-word-order.ts:236,246-250` | — (관용이지 계약 아님) |
| **청크 ≥ 2개여야 신형식으로 인식** | `parser-word-order.ts:305` | 1개면 `chunksFromAnswer=false` → `칩:` 줄 폴백 → 그 줄도 없으면 chips=[] → 즉시 반려 |
| `modelAnswer` 는 청크를 **공백으로 이어 붙인 뒤** `/[ \t]+([,.;:!?])/ → "$1"`, `\s+ → " "`, trim | `joinWordOrderChunks` `parser-word-order.ts:261-267` | 청크를 어떻게 끊든 **정답 문장이 함께 움직인다** → "부족 토큰" 반려가 구조적으로 불가능 |
| 값 전체를 감싼 **짝 안 맞는** 래퍼 `" "`, `“ ”`, `[ ]`, `( )` 를 양끝에서 각각 최대 4회 벗긴다. 아포스트로피는 **일부러 제외** | `stripWordOrderLineWrappers` `parser-word-order.ts:185-225` | 짝 맞는 래퍼는 `cleanMdValue`/`^\[(.+)\]$` 가 벗긴다. **문장 중간의 불균형 괄호는 건드리지 않는다**(양끝일 때만 발화) |
| 값 정리 `cleanWordOrderValue`: `cleanMdValue`(강조·감싼따옴표·공백) → 선두/말미 파이프 `^\|+[ \t]*` `[ \t]*\|+$` → 선두 불릿 `^(?:[-•>]\|\d+[.)])[ \t]+` → `^\[(.+)\]$` → 반복(최대 3회 고정점) | `parser-word-order.ts:165-176` | 파이프 한 글자가 남으면 **채점 correctAnswer 에 실려 정답을 정확히 쓴 학생 전원이 오답** (토큰 회계는 파이프를 버려 게이트가 침묵) |
| 빈 조각·`EMPTY_MARKERS`(`""`,`-`,`—`,`–`,`없음`,`(없음)`,`n/a`,`na`,`none`,`null`)는 **조용히 버려진다** | `parser-word-order.ts:54,251-253` | ` /  / ` 를 연달아 쓰면 청크가 **경고 없이 줄어든다** (프로브 E9 — 게이트 클린) |
| `readKeywordValue` 는 값이 **다음 줄**에 있어도 흡수하되 정지 키워드에서 멈춘다 | `decoration.ts:113-134` | — |

### 3-4. `미끼:` · `허용답:` · `힌트:` 줄

| 필드 | 읽는 방식 | file:line | 어기면 |
|---|---|---|---|
| `미끼:` | **인라인 값만** `readInlineValue` → 있으면 `splitWordOrderChips(stripWordOrderLineWrappers(...))`, 비었으면 다음 줄 불릿 목록 `readBulletBlock` | `parser-word-order.ts:296-299` | 값을 **다음 줄 산문**으로 쓰면 그 줄이 통째로 미끼 1개가 된다 |
| `허용답:` | `acceptedInline`(있으면 1개) + `acceptedBullets`(`- ` 불릿 목록) **둘 다** 수집 | `parser-word-order.ts:316-321` | 인라인과 불릿을 함께 쓰면 **둘 다** 채점 집합에 들어간다 |
| `힌트:` | `readKeywordValue`(다음 줄 흡수 O) → `EMPTY_MARKERS` 면 `""` | `parser-word-order.ts:311,338` | 한국어가 아니면 §4 #11 반려 |

`readInlineValue` 는 **줄 단위**로 정규식을 건다 — 여러 줄에 통째로 걸면 `HEAD_TAIL` 의 `[\s…]*`
가 개행을 삼켜 다음 줄을 값으로 캡처하기 때문이다(`parser-word-order.ts:105-115`).

### 3-5. ★ `해설:` 은 마지막 섹션 — 종결자 4종

`readSection(text, "해설", stopAtBlank=true)` (`parser-word-order.ts:122-138`) 이
아래 중 **먼저 오는 것**에서 끊는다:

1. **첫 빈 줄** (`stopAtBlank=true`)
2. 다른 섹션 키워드(공유 `sliceKeywordSection`, `decoration.ts:141`)
3. 코드펜스·마크다운 제목 — `FENCE_OR_HEADING_LINE = /^[ \t]*(?:` + `` `{3,}|#{1,6}[ \t]` `` + `)/` (`parser-word-order.ts:91`)
4. **이름을 모르는 라벨 줄** — `ANY_LABEL_LINE`
   `` /^[ \t]*\|?[ \t]*(?:#{1,6}[ \t]*)?(?:[-*•>][ \t]*)?[*_~`]*[ \t]*[^\s:：][^:：\n]{0,15}[:：]/ `` (`parser-word-order.ts:101-102`)
   → 줄머리에서 **17자 이내에 콜론**이 나오면 경계. 콜론이 **필수**다(공유 규칙과 다름).

| 어기면 | 결과 |
|---|---|
| 해설 뒤에 `설계 노트: 미끼는 …` 을 붙임 | 파서가 끊어 **해설에 실리지 않는다**(프로브 E24). 하지만 그 줄은 유실되므로 애초에 쓰지 마라 |
| 해설 이어지는 줄을 `구조: …` 로 시작 | 그 줄부터 해설이 **잘려 나간다**(ANY_LABEL_LINE) |
| 해설을 빈 줄로 나눠 2문단 | 둘째 문단이 **사라진다** |
| 해설 두 문장을 개행만으로 나눔(빈 줄 없이) | 공백으로 이어 붙여 흡수 — 무해 |

### 3-6. 첫 매치 규칙 · 1문서 1문항

`readKeywordValue` / `sliceKeywordSection` 모두 **첫 매치 줄**만 취한다
(`decoration.ts:119-120,147`). 한 문서에 `모범답안:` 을 두 번 쓰면 두 번째는 조용히 사라진다.
qbank 는 `<!-- ITEM n -->` 로 1문항씩 잘라 넣으므로 이 규칙을 자동으로 지킨다.

### 3-7. 오토스냅 5단계 (게이트 앞에서 형상을 바꾼다)

`autoSnapWordOrderChips` `gate-word-order.ts:398-498`

| # | 동작 | 조건 | corrections 기록 |
|---|---|---|---|
| 1 | 모범답안 문말 종결부호 `.` 보정 | `/[.!?][")'”’\]]?\s*$/` 불일치 | "모범답안에 문장 종결부호(.)를 보정" |
| 2 | 미끼를 칩 축자로 정렬(대소문자·공백만 다르면 교체), 칩에 없으면 **제외** | 항상 | "…칩 축자 '…' 로 보정" / "…칩 목록에 없어 제외" |
| 3 | 과부족 ≠ 0 이면 미끼를 칩·모범답안 대조로 **재도출** | 구형 폴백 전용 | "미끼를 칩·모범답안 대조로 재도출 (…)" |
| 4 | 허용답 중 **토큰 멀티셋이 모범답안과 다른 원소 절삭** | 항상 | "허용답 '…' 이 모범답안과 같은 칩 조합이 아니어서 제외(오답 흡수 방지)" |
| 5 | 칩 재배열 `arrangeWordOrderChips`(해시 정렬 → 결정론 회전, **멱등**) | chips ≥ 2 | 신형식(`chunksFromAnswer`)은 **기록하지 않는다** |

**저작자 관점 3줄:**
- 청크를 정답 어순 그대로 써라. **섞는 것은 프로그램의 일이다**(단계 5).
- 마지막 청크에 마침표를 붙여라(단계 1의 보정 기록을 피한다).
- 허용답에 자신 없으면 **섹션째 지워라**. 틀린 허용답은 반려가 아니라 **조용한 절삭**이다(단계 4).

`corrections` 는 하네스에서 `AUTOSNAP` **경고**로 기록된다(`qbank/harness/qgen-core.ts:323`).
**정상 저작이면 corrections 는 0이어야 한다**(프로브 P9).

---

## 4. 게이트 체크리스트

`gateMdWordOrder` `gate-word-order.ts:97-352`. 빈 배열이면 클린.
기본값: `distractorMin` = 레인이 난이도로 주입 · `chipMin=4` `chipMax=12` `chunkMin=3` `chunkMax=9`
(`prompts-word-order.ts:35-40`).

**도달성** = 레인 경로(파서→스냅→게이트)에서 실제로 발화하는가.

| # | 반려 사유 문자열 | 조건 | file:line | 도달성 |
|---|---|---|---|---|
| 1 | ``모범답안 줄을 인식할 수 없음 — `모범답안: <청크1 / 청크2 / ...>` 한 줄이 필요하다`` | `!q.modelAnswer` (즉시 return) | `gate-word-order.ts:112-116` | O |
| 2 | ``모범답안 줄에 청크 경계가 없음 — 정답 문장을 ` / ` 로 끊어 `모범답안: Spreading faster / than regulators could respond, / the norms` 처럼 써라`` | `q.chips.length === 0` (즉시 return) | `:117-121` | O |
| 3 | `모범답안에 한글이 섞임: '<40자>' — 영어 완성 문장이어야 한다` | `containsHangul(modelAnswer)` | `:126-128` | O |
| 4 | `모범답안에 영어가 없음 — 영어 완성 문장이어야 한다` | `!containsLatinLetter(modelAnswer)` | `:129-131` | O |
| 5 | `모범답안이 N단어 (6단어 이상 필요) — 배열 과제가 성립하지 않는다` | `wordOrderComparableTokens(modelAnswer).length < 6` | `:132-136` | O |
| 6 | `모범답안 가장자리에 장식 기호가 남음: '…' — 라벨 뒤에는 맨 값만 써라(…)` | ``MARKUP_EDGE = /^[|*_`~]|[|*_`~]$/`` | `:69,137-141` | △ 파서 우회 시 |
| 7 | `칩 N개 (4~12개 필요)` | `chips.length < 4 \|\| > 12` | `:144-146` | O |
| 8 | ``빈 칩이 있음 — ` / ` 구분자를 연달아 쓰지 마라`` | `!chip.trim()` | `:148-150` | ✕ 파서가 빈 조각을 먼저 버린다 |
| 9 | `구두점만 있는 칩: ',' — 구두점은 앞뒤 의미 단위에 붙여라` | `PUNCTUATION_ONLY = /^[^\wA-Za-z]+$/` | `:60,152-154` | O |
| 10 | `칩에 한글이 섞임: '…' — 칩은 영어여야 한다` | `containsHangul(chip)` | `:155-157` | O |
| 11 | `칩 가장자리에 장식 기호가 남음: '…' — 칩을 굵게·기울임·표 칸으로 감싸지 마라` | `MARKUP_EDGE` | `:158-160` | △ |
| 12 | `미끼 '…' 가 칩 목록에 없음 — 칩에 실재하는 문자열을 그대로 다시 적어라` | `!chipSet.has(d)` | `:166-171` | ✕ 스냅 2단계가 선제 제거 |
| 13 | `미끼 N개 (M개 이상 필요) — 미끼가 없으면 "칩을 순서대로 전부 쓰기"가 되어 함정 설계가 사라진다` | `distractors.length < distractorMin` | `:172-176` | O |
| 14 | `미끼 '…' 가 정답 청크와 동일 — 같은 칩이 두 번 제시된다. 다른 미끼로 바꿔라` | 미끼 문자열이 정답 청크와 **축자 동일** | `:180-185` | O |
| 15 | `정답 청크 N개 (칩 X − 미끼 Y, 3~9개 필요)` | `chips.length − distractors.length` 범위 밖 | `:188-193` | O |
| 16 | `칩 '…' 가 정답 N단어 중 M단어를 담음 — 한 칩은 정답의 절반을 넘지 못한다` | 비미끼 칩 토큰수 `n*2 > answerTokens.length` | `:196-207` | O |
| 17 | ``칩으로 모범답안을 조립할 수 없음 — 부족 토큰 "x", "y". 모범답안을 남김없이 칩으로 쪼개라`` | `wordOrderAccounting(...).missing.length > 0` | `:213-218` | ✕ 신형식은 항등식 (구형 폴백에서만) |
| 18 | ``칩에서 미끼를 뺀 뒤에도 남는 토큰 "x" — 선언하지 않은 미끼가 있다. 그 칩을 `미끼:` 줄에 전부 적어라`` | `surplus.length > 0` | `:219-223` | ✕ 동상 |
| 19 | `칩을 이어 붙여도 모범답안의 "x" 를 만들 수 없음 — 단어 안의 기호(and/or · km/h)는 구분자가 아니다. 그 조각을 한 칩으로 붙여라` | `wordOrderTightTokens` 문자축 커버 실패 | `:90-94,229-244` | ✕ 신형식은 구조적 불가 (구형 폴백에서만) |
| 20 | `미끼를 빼고 칩을 왼→오로 읽으면 정답 문장이 그대로 나옴 — 정답 칩의 상대 순서를 흐트러뜨려라` | `chipsRevealAnswerOrder` && 미끼 ≥ 1 | `:249-252` | △ 스냅 5단계 탈출 실패 시 |
| 21 | `칩이 정답 어순 그대로 나열됨 — 왼쪽에서 오른쪽으로 읽기만 하면 풀린다` | 동상 && 미끼 0개 | `:253` | △ |
| 22 | `칩 배열이 정답 어순에 가까움(왼→오 읽기로 풀림) — 정답 어순에서 더 멀리 섞어라` | `chipsAreInAnswerOrder`(어간 4자 · 커버리지 ≥ 0.6) | `:255-257`, `topic-sentence-writing.ts:110-149` | △ |
| 23 | `모범답안이 지문 문장의 통째 복사입니다: "…". 시제·태·구문 전환을 최소 1개 넣어 다시 설계하라` | 내용토큰(≥4자) 6개 이상 && `answerRunInPassage(answer, passage, max(6, ⌈0.8n⌉))` 성립 | `:264-278`, `question-quality/core.ts:302-318` | **O ★F급** |
| 24 | `허용답 '…' 에 영어 단어가 없음` | 허용답 토큰 0 | `:286-289` | ✕ 스냅 4단계 절삭 |
| 25 | `허용답 '…' 이 제시 칩만으로 조립되지 않음 (없는 칩을 요구: … · 정답 칩이 남음: …) — 축약형·단어 치환은 허용답이 될 수 없다` | 허용답 토큰 멀티셋 ≠ 모범답안 | `:299-309` | ✕ 스냅 4단계 절삭 |
| 26 | `힌트가 한국어가 아님: '…' — 힌트는 한국어 한 줄이어야 한다` | `!containsHangul(contextHint)` | `:313-316` | O |
| 27 | `힌트에 정답 표현이 그대로 노출됨: "…" — 힌트는 문장의 역할만 가리켜라` | `answerRunInPassage(modelAnswer, contextHint, 3)` | `:317-320` | O |
| 28 | ``해설 누락 — `해설:` 줄에 한국어 2문장을 써라`` | `!q.explanation` | `:324-325` | O |
| 29 | `해설이 한국어가 아님 — 해설은 한국어로만 쓴다` | `!containsHangul(explanation)` | `:326-327` | O |
| 30 | `Explanation field "explanation" quotes an English expression that does not exist in the passage, options, or any visible question surface: "…". Quote only expressions that actually appear in the item (hallucinated citation).` | 따옴표 인용 조각 12자 이상이 코퍼스(정답·칩·허용답·힌트·지문)에 부재 | `:329-339`, `validators/explanation-quoted-tokens.ts:117-162` | O |
| 31 | `해설에 문항과 무관한 영어 문장이 섞임: "…" — 해설은 한국어로만 쓰고 인용은 지문·정답 표현만 허용한다` | 해설 안 **6단어 이상 연속 라틴 단어열**이 코퍼스 단어열에 부재 | `:345-348,364-373` | O |

### 4-1. 어댑터 실패(하네스 코드 `ADAPT`)

| 문자열 | 조건 | file:line |
|---|---|---|
| `모범답안 누락` | `cleanMdValue(modelAnswer)` 가 빈 문자열 | `adapter-word-order.ts:55` |
| `칩 N개 (2개 이상 필요)` | `chips.length < 2` | `adapter-word-order.ts:56-58` |

### 4-2. 품질 검증기 코드(하네스 `qualityBlocking` 축 — 프로덕션은 비차단)

| 코드 | 심각도 | 조건 | file:line |
|---|---|---|---|
| `punctuation-only-chunk` | error | `scrambledWords` 에 구두점 전용 칩 | `question-quality/dispatcher.ts:1130-1132` |
| `scrambled-already-solved` | error | 칩 전체 이어붙임 == modelAnswer | `dispatcher.ts:1135-1137` |
| `scrambled-near-answer-order` | error | `chipsAreInAnswerOrder` | `dispatcher.ts:1142-1152` |
| `word-order-unreconstructable` | error | (칩 − 선언미끼)로 modelAnswer 조립 불가 | `validators/word-order.ts:77-85` |
| `word-order-accepted-unreconstructable` | error | 허용답이 정답 칩의 순수 재배열이 아님 | `validators/word-order.ts:134-141` |
| `writing-answer-verbatim-copy` | error | 게이트 #23 과 동일 판정(중복 그물) | `dispatcher.ts:1072-1090` |
| `writing-answer-verbatim-in-passage` | **warning** | 정답 내용토큰 **3개 연속**이 지문과 일치 | `dispatcher.ts:1054-1064` |
| `few-key-points` | **warning** | KILLER 인데 keyPoints < 3 — **어댑터가 `keyPoints: []` 로 고정**하므로 구조적으로 항상 뜬다. 저작으로 없앨 수 없다 | `adapter-word-order.ts:102` |

### 4-3. 하네스 컨테이너 코드

| 코드 | 축 | file:line |
|---|---|---|
| `CONTAINER` | blocking | `qbank/harness/qgen-core.ts:237` |
| `ITEM_COUNT` | blocking | `:243` |
| `GATE` | blocking (= `parsed.gateIssues` 전량) | `:316` |
| `ADAPT` | blocking | `:318` |
| `POSTPROCESS` | blocking | `:320` |
| `QUALITY:<code>` | severity=error → `qualityBlocking` · warning → `warnings` | `:321-322` |
| `AUTOSNAP` | **경고**(스냅 corrections 전량) | `:323` |
| `POINT_DUPLICATE` | blocking (유닛 축) | `:339` |
| `ANSWER_DUPLICATE` | blocking (유닛 축) | `:359` |
| `UNSUPPORTED_LANE` | blocking | `:149,226` |

`ANSWER_DUPLICATE` 의 표적은 `diversityTargets` = **`modelAnswer` 앞 90자**
(`lane-word-order.ts:119-123`) → **유닛 내 5~8문항의 정답 문장이 전부 달라야 한다.**

---

## 5. adapter 산출 필드

`adaptMdWordOrderToAiQuestion` `adapter-word-order.ts:41-107`. 후처리는 PASSTHROUGH — **어댑터 산출이 최종 형상**.

| 키 | 타입 | 의미 | 비고 |
|---|---|---|---|
| `direction` | string | 발문 | 미끼 ≥1 → `"주어진 단어를 올바른 순서로 배열하여 문장을 완성하시오. (쓰지 않는 단어가 포함되어 있음)"` / 미끼 0 → 괄호 없는 문장 (`:35-39`). `stemLanguage=en` 이면 `"Rearrange the given words to complete the sentence. (Some words are not used.)"` (`lane-word-order.ts:26-29,93-96`) |
| `scrambledWords` | string[] | ★ **학생에게 보이는 칩 전량**(정답 청크 ∪ 미끼) — `arrangeWordOrderChips` 로 정답 어순에서 떨어뜨린 배열 | `:62` · 게이트가 본 배열과 **동일**(같은 결정론 함수·멱등) |
| `wordBankDistractors` | string[] *(조건부 키)* | 🔒비밀 — 미끼 칩. `scrambledWords` 에 실재하는 것만 | `:68-69,93` · 0개면 **키 자체가 없다** |
| `contextHint` | string *(조건부 키)* | 한국어 힌트 | `:83,94` · 빈 값이면 **키 없음** |
| `modelAnswer` | string | 완성 문장(정답의 진실원) | `:95` |
| `acceptedAnswers` | string[] | ★ **선두 원소는 반드시 `modelAnswer`** + 등가 어순들(중복 제거) | `:74-81` · 스키마 계약 `question-schemas-essay.ts:280-282` |
| `correctAnswer` | string | `= modelAnswer` 복제 | `:98` · `commonAnswerField` 계약 |
| `explanation` | string | 한국어 해설 | `:99` |
| `keyPoints` | `[]` | **항상 빈 배열**(합성 금지) | `:102` → `few-key-points` 경고의 원인 |
| `tags` | `[]` | 항상 빈 배열 | `:103` |
| `difficulty` | string | `ctx.rawDifficulty` 그대로 | `:104` |

### 이 유형에만 있는 필드 / 절대 금지 필드

- ★ **`options` 키를 두면 안 된다** — `undefined` 도 아니라 **키 부재**. 서술형은 `correctAnswer` 가
  문장인데 `options` 가 있으면 `validators/options.ts` 가 `correct-answer-mismatch`(RELAXED_BLOCKING)
  를 발화한다(`adapter-word-order.ts:16-18`).
- ★ **`blanks` / `passageWithBlank` / `originalExpression` 도 금지** — 영작형 verbatim 게이트가
  `blanks[].answer` 를 훑는다(`adapter-word-order.ts:18-19`).
- `scrambledWords` / `wordBankDistractors` 조합이 이 유형의 정체성이다.
  학생 페이로드 조립(`exam-scoring/student-safe-data.ts:88,422` `mergeChipsWithDistractors`)은
  **칩에 없는 미끼를 발견하면 추가한 뒤 알파벳 정렬**해 버려 어순 배치를 무너뜨린다 —
  그래서 어댑터가 `present.has(d)` 로 걸러 싣는다(`adapter-word-order.ts:64-69`).
- 채점: `buildAnswerSpec` → `inputKind: "TEXT_SINGLE"` · `textMode: "EXACT"` · 필드 키 `"answer"` ·
  허용 집합 = `acceptedAnswers` (`scripts/_test-md-word-order.ts:634-654`).

---

## 6. 생성 노브

**이 유형은 전용 설정 키가 없다.** `question-type-generation-settings` 폴백이 `stemLanguage`·
`optionLanguage` 만 주므로 `isEligible` 은 **항상 true** 다(`lane-word-order.ts:8-13,47-49`).

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `difficulty` (ITEM 헤더) | `BASIC\|INTERMEDIATE\|KILLER` | `INTERMEDIATE` (헤더 누락 시, `qgen-core.ts:89`) | 셋 중 하나(아니면 CONTAINER 반려) | **미끼 하한**: BASIC/INTERMEDIATE **1** · KILLER **2** (`prompts-word-order.ts:47-49`). 프롬프트 청크 목표: BASIC 4~5 · INTERMEDIATE 5~7 · KILLER 6~8 (`:25-32`) — **게이트는 3~9 로 더 넓다** |
| `settings.stemLanguage` | `"ko"\|"en"` | `"ko"` | 두 값 | **md 형식 불변.** `direction` 만 영어로 교체(`lane-word-order.ts:88-97`). 해설·힌트는 한국어 유지 |
| `distractorMin` (게이트 옵션) | number | 레인이 난이도로 주입 | `Math.max(0, round(n) \|\| 0)` | #13 반려 기준 (`gate-word-order.ts:102`) |
| `chipMin` / `chipMax` | number | **4 / 12** | — | #7 반려 기준 (`prompts-word-order.ts:37-38`) |
| `answerChunkMin` / `answerChunkMax` | number | **3 / 9** | — | #15 반려 기준 (`prompts-word-order.ts:35-36`) |
| `WORD_ORDER_MD_ANSWER_TOKEN_MIN` | 상수 | **6** | — | #5 반려 기준 (`prompts-word-order.ts:40`) |
| `teacherPoints` | string[] | **항상 `[]`** | — | POINT_PICKER_CONFIG 미등재 → 교사포인트 블록 없음 (`lane-word-order.ts:12-13,57-58`) |
| `operationType` | 상수 | `QUESTION_GEN_SINGLE`(2크레딧) | — | 어휘 3종이 아니다 — 틀리면 이중 청구 (`lane-word-order.ts:38-40`) |
| `retryEligible` | boolean | `true` | — | 웹은 반려 시 1회 재생성. **오프라인 하네스에는 재생성이 없다** |

**저작 난이도 3분기 요약 (프롬프트 `prompts-word-order.ts:66-82`)**

| | 변형 | 청크 | 미끼 | 힌트 |
|---|---|---|---|---|
| BASIC | **1가지만**(태 또는 시제) | 2~4단어 의미덩어리 4~5개 | **1개** — 정답 칩의 활용형 | 문장의 역할 한 줄 |
| INTERMEDIATE | 구문 전환 최소 1개(관계절↔분사구문·도치·강조·not only·가정법) | 단어~짧은 구 5~7개 | **1~2개** — 형태 축 + 어휘 축 분산 | 논지에서의 역할만 |
| KILLER | **2개 이상 결합** | 단어 단위 6~8개 | **2개 이상** — 서로 다른 축 | 쓰지 않는 편이 최선 |

---

## 7. 함정 (코드 근거가 있는 것만)

| # | 저작 실수 | 실제로 일어나는 일 | 근거 |
|---|---|---|---|
| **T1** | ` / ` 대신 쉼표·번호·파이프로 청크를 나눔 | 청크 0개 → 「모범답안 줄에 청크 경계가 없음」. `칩:` 줄이 없으므로 **문항 전체 반려** | `parser-word-order.ts:243-254` · 프로브 E3 |
| **T2** | 슬래시 양옆 공백을 뺌(`force/but`) | **구분자로 인식되지 않는다.** 청크 1개 → 같은 반려 | `parser-word-order.ts:235` · 프로브 E4 |
| **T3** | 값을 따옴표·괄호·`**` 로 감쌈 | 지금은 흡수되지만(프로브 B5) 관용이지 계약이 아니다. **쪼갠 뒤에는 여는 기호와 닫는 기호가 다른 청크로 흩어져 쌍 규칙이 영영 발화하지 못한다** → 그 기호가 채점 `correctAnswer` 에 실려 **정답을 정확히 쓴 학생 전원이 오답**(채점 `normalizeText` 는 `" “ ” [ ]` 를 지우지 않는다) | `parser-word-order.ts:198-208` · `exam-scoring/normalize.ts:84-96` |
| **T4** | `미끼:` 줄을 빼먹음 | 신형식에서는 미끼가 칩에 **추가되는** 새 칩이라 재도출이 불가능 → 미끼 0개 → #13 반려(KILLER 는 2개 필요) | `gate-word-order.ts:172-176` · 프로브 E11 |
| **T5** | 미끼를 `모범답안:` 줄 안에 청크로 끼워 넣음 | 그 미끼가 **정답 문장의 일부가 되고**, `미끼:` 줄과 축자 동일해져 #14 「정답 청크와 동일」 반려 | `gate-word-order.ts:180-185` · 프로브 E13 |
| **T6** | 미끼를 정답 청크와 똑같이 적음 | 같은 칩이 학생 화면에 **두 개** 나간다 → #14 반려 | `gate-word-order.ts:177-185` · 프로브 E12 |
| **T7** | 한 청크에 절 하나를 통째로 담음 | 정답의 절반을 넘으면 #16 반려. 넘지 않아도 **배열 과제가 사라진다** | `gate-word-order.ts:196-207` · 프로브 E8 |
| **T8** | 지문 문장을 그대로 잘라 청크로 만듦 | 내용토큰 6개↑ + 80% 연속 일치 → **#23 F급 반려**. 그 아래여도 3연속 일치면 `writing-answer-verbatim-in-passage` **경고**가 붙는다 | `gate-word-order.ts:264-278` · `dispatcher.ts:1054-1064` · 프로브 E16/B6 |
| **T9** | 습관적으로 `칩:` 줄을 씀 | 구형 폴백이 발동해 **청크 파생이 통째로 무력화**되고 스냅이 「칩이 정답 어순으로 읽혀 결정론 재배열」 보정을 남긴다. 관사 하나만 흘려도 #17 「부족 토큰」 반려가 되살아난다 | `parser-word-order.ts:291-309` · 프로브 E25 |
| **T10** | 습관적으로 `정답:` 머리표를 씀 | 폴백으로 흡수돼 **통과는 한다**. 그러나 계약 라벨은 `모범답안:` 이고, `정답:` 은 다른 서술형과 축이 어긋난다 | `parser-word-order.ts:286` · 프로브 E26 |
| **T11** | 허용답을 "비슷한 뜻"으로 씀(`brute force` ↔ `raw force`) | **반려가 아니다.** 스냅이 조용히 절삭하고 `AUTOSNAP` 경고만 남는다 → 의도한 등가 어순이 사라진 채 출하 | `gate-word-order.ts:449-475` · 프로브 E17 |
| **T12** | ` /  / ` 를 연달아 씀 | 빈 조각이 **경고 없이 버려진다**. 청크 수가 조용히 줄어 #15 범위를 벗어날 수 있다 | `parser-word-order.ts:251-253` · 프로브 E9 |
| **T13** | 해설 뒤에 설계 노트·발문·요약을 붙임 | 파서가 `ANY_LABEL_LINE`/빈 줄에서 끊어 **그 줄이 유실**된다. 종결자가 없던 시절에는 해설이 미끼를 알려줬다 | `parser-word-order.ts:96-102,327-330` · 프로브 E24 |
| **T14** | 해설에 영어 문장을 섞음 | 6단어 이상 연속 라틴 단어열이 문항 표면에 없으면 #31 반려 | `gate-word-order.ts:364-373` · 프로브 E22 |
| **T15** | 해설에 지문에 없는 표현을 따옴표 인용 | 12자 이상 조각이 코퍼스에 없으면 #30 반려(환각 인용) | `validators/explanation-quoted-tokens.ts:117-162` · 프로브 E23 |
| **T16** | 힌트를 정답의 1:1 직역으로 씀 | 영어 표현이 들어가면 #27 「정답 표현이 그대로 노출」. 한국어만이면 게이트는 못 보지만 **변별력이 0이 된다** | `gate-word-order.ts:317-320` · 프로브 E19 |
| **T17** | 청크를 미리 섞어서 씀 | `모범답안:` 줄은 **정답 어순**이어야 한다 — ` / ` 를 지우고 이어 읽은 것이 곧 정답 문장이기 때문이다. 섞으면 정답 문장 자체가 비문이 된다 | `parser-word-order.ts:306-308` |
| **T18** | 유닛 5~8문항이 같은 문장을 표적 삼음 | `modelAnswer` 앞 90자가 겹치면 `ANSWER_DUPLICATE` 로 **유닛 전체 반려** | `lane-word-order.ts:119-123` · `qgen-core.ts:355-363` · 프로브 U2 |
| **T19** | `point:` 를 문항마다 대충 씀 | 정규화 후 문자열이 겹치면 `POINT_DUPLICATE` 로 **유닛 전체 반려** | `qgen-core.ts:334-343` · 프로브 U1 |
| **T20** | 마지막 청크에 마침표를 안 붙임 | 반려는 아니지만 스냅이 보정 기록을 남긴다 → `AUTOSNAP` 경고(정상 저작은 corrections 0이어야 한다) | `gate-word-order.ts:404-409` |

---

## 8. 출제 포인트 다각화 축

> **한 지문에서 WORD_ORDER 문항 5~8개를 만드는 방법.**
> 이 유형은 정답이 "지문의 어느 문장을 어떻게 변형했는가" 로 완전히 결정된다.
> 따라서 **표적 문장 × 변형 축 × 미끼 축**의 곱이 다각화 공간 전부다.

### 8-A. 노브로 달라지는 축 (코드 근거)

| 축 | 조작 | 코드 근거 | 실제 차이 |
|---|---|---|---|
| **A1 난이도 → 미끼 하한** | ITEM `difficulty` | `prompts-word-order.ts:47-49` · `gate-word-order.ts:172-176` | BASIC/INTERMEDIATE 미끼 1개, KILLER **2개 이상** → 판단 축의 개수가 달라진다 |
| **A2 난이도 → 청크 입도** | 동상(프롬프트 목표) | `prompts-word-order.ts:25-32,66-82` | BASIC 4~5(의미덩어리) → KILLER 6~8(단어 단위). 게이트 허용은 3~9 이므로 **저작자가 실제 결정한다** |
| **A3 발문 언어** | `settings:{"stemLanguage":"en"}` | `lane-word-order.ts:59-64,88-97` | 학생이 읽는 지시문이 영어. **md 형식·해설·힌트는 불변** — 유닛에 1~2문항 섞으면 표층 형식 다각화(헌법 §7 축 5) |
| **A4 힌트 유무** | `힌트:` 줄 유지/삭제 | `parser-word-order.ts:311,338` · `prompts-word-order.ts:81` | 힌트 있음 = 의미 단서 제공(BASIC), 없음 = 통사 판단만으로 풀기(KILLER) — **난이도 실체 축** |
| **A5 허용답 유무** | `허용답:` 섹션 | `gate-word-order.ts:280-310` | 등가 어순이 실재하는 문장(의사분열문·부사구 이동)만 열 수 있다 → **정답 유일성의 성격 자체를 바꾼다** |
| **A6 미끼 개수** | 1 / 2 / 3+ (칩 상한 12 내) | `gate-word-order.ts:144-146,188-193` | 청크 6 + 미끼 3 = 칩 9. 미끼가 늘수록 "쓰지 않는 칩" 탐색 부담 증가 |

### 8-B. 설계로 달라지는 축 (교육적 판단 — 여기가 진짜 승부처)

#### B1. 표적 문장 (지문 위치) — **1문항 = 1문장 원칙**

`ANSWER_DUPLICATE` 가 같은 정답을 막으므로 **문항 수 = 서로 다른 표적 문장 수**가 된다.
헌법 §7 축 1(논지 위치)을 그대로 적용한다:

| 슬롯 | 표적 | 이 자리에서만 나오는 통사 |
|---|---|---|
| 도입 통념 | 첫 1~2문장 | 과거시제 일반 진술 → 수동 전환이 자연스럽다 |
| 전환점 | 역접·질문 문장 | 콜론 병렬·간접의문문 → 명사절 주어 승격 |
| 기제 설명 | 인과·조건 문장 | 이유절 ↔ 분사구문, 접속사 교체, 도치 |
| 대조·비교 | `more … than` 문장 | 관계절 → 분사구 축약, 비교 축 유지 |
| 사례·근거 | 예시 문장 | 관계절 해체, 명사구 압축 |
| 결론 | 마지막 문장 | it-분열문, 강조, 명사절 → 명사구 |

> 프로브 6문항이 정확히 이 배분이다(S1 태전환 / S3 분사축약 / S4 접속사교체 / S5 분열문 /
> S2 명사절승격 / S6 명사구압축). 6문항 전량 blocking 0.

#### B2. 통사 변형 축 — **같은 변형을 두 번 쓰지 마라**

정답 문장을 만드는 변형은 사실상 이 8종이며, 유닛 내에서 **전부 달라야** 한다
(`prompts-word-order.ts:126,73,78` 이 열거하는 축):

1. **태 전환** 능동↔수동 (행위자를 `by` 구로 후치)
2. **시제/상 전환** 단순과거 ↔ 현재완료 ↔ 진행
3. **절 축약** 관계절 → 분사구 / 동격절 → 명사구
4. **절 확장** 분사구 → 관계절, 전치사구 → 종속절
5. **초점 이동** it-분열문 / 의사분열문(`What … is …`)
6. **도치** 부정어 문두·장소구 문두·so/such
7. **접속 관계 교체** because ↔ since ↔ 분사구문, although ↔ despite
8. **명제 층위 이동** 명사절 주어 ↔ 명사구 주어 / 술부 명사화

KILLER 는 **둘 이상 결합**해야 한다(`prompts-word-order.ts:78`). 결합 쌍 자체가 다각화 축이다:
(수동 + 분사구문) / (가정법 + 도치) / (분열문 + 현재완료) / (관계절 해체 + 명사구 전환).

#### B3. 미끼 기제 택소노미 4종 — **한 유닛에서 같은 기제를 반복하지 마라**

`prompts-word-order.ts:133-139` 가 정의하는 축:

| 기제 | 설계 | 학생이 확정해야 하는 것 |
|---|---|---|
| **형태 함정** | 같은 어근·다른 굴절 (`reduce↔reducing↔reduced`, `has↔had earned`) | 시제·태·수일치 |
| **역할 뒤바꿈** | 행위자·대상을 맞바꾼 전치사구 (`by early adopters ↔ by regulators`) | 지문에서 누가 무엇을 했는가 |
| **연결 함정** | 절 관계를 흔드는 접속사·관계사 (`because↔although↔which`) | 종속 관계의 방향 |
| **근접 의미어** | 정답 어휘의 동의어 (`shaped↔formed`) | 콜로케이션 감각 |

**운용 규칙(헌법 §3 운용규칙 1 번안):** 한 문항의 미끼들은 **서로 다른 기제**여야 하고
(같은 축의 미끼 둘은 한 번의 판단으로 함께 배제된다 — `prompts-word-order.ts:75`),
유닛 전체에서는 4기제가 고르게 나와야 한다. 5문항이면 최소 3기제, 8문항이면 4기제 전부.

**미끼 재료는 반드시 지문의 소재·어휘에서 가져온다**(`prompts-word-order.ts:138`) —
지문 밖 개념을 수입한 미끼는 학생이 읽지도 않고 버린다(헌법 §3 운용규칙 7).
**길이·형식도 정답 칩과 비슷해야 한다**(`:139`) — 유독 짧거나 긴 칩 하나가 "안 쓰는 칩"임을 흘린다.

#### B4. 청크 절단선 설계 — 같은 정답도 절단선이 바뀌면 다른 문항이 된다

| 절단 전략 | 예 | 시험하는 것 |
|---|---|---|
| **절 경계 절단** | `Since inspectors / cannot be everywhere / at once,` | 종속절·주절의 경계 판정 |
| **기능어 독립** | `is how / a structure / behaves` | 관사·전치사가 어느 명사에 붙는가 (`prompts-word-order.ts:74`) |
| **동사구 통째 묶기** | `must report` `were shaped` | 조동사+본동사 결합 (BASIC 부담 완화) |
| **구두점 흡착** | `than regulators could respond, / the norms` | 쉼표를 **앞 조각 끝에** 붙인다 — 구두점 전용 칩은 #9 반려 (`prompts-word-order.ts:144`) |
| **최소 단위 파편화** | `It / is / not / raw force` | 어순 후보가 실제로 갈리게 (KILLER) — 단, 정답 청크 9개 상한 |

#### B5. 난이도 분포 (헌법 §4)

5문항: BASIC 1 / INTERMEDIATE 2 / KILLER 2 · 8문항: BASIC 2 / INTERMEDIATE 3 / KILLER 3.
**전량 KILLER 도, 전량 BASIC 도 금지.**

### 8-C. 6문항 배분 템플릿 (프로브 실증본)

| # | 난이도 | 표적 | 변형(B2) | 미끼 기제(B3) | 절단(B4) | 옵션 |
|---|---|---|---|---|---|---|
| 1 | BASIC | 도입 통념 | ①태 전환 | 형태(수일치) ×1 | 동사구 묶기 4청크 | 힌트 O |
| 2 | INTERMEDIATE | 대조 문장 | ③절 축약 | 형태 + 근접 의미어 | 비교 축 유지 5청크 | 힌트 O |
| 3 | INTERMEDIATE | 기제 설명 | ⑦접속 교체 + ⑧명사화 | 형태(조동사 뒤 원형) + 역할(전치사) | 절 경계 6청크 | 힌트 ✕ |
| 4 | KILLER | 결론 | ⑤분열문 + ②현재완료 | 형태(시제) + 역할(행위자) | 초점 구간 분리 6청크 | 힌트 ✕ |
| 5 | KILLER | 전환점 | ⑤의사분열문 + ⑧층위 이동 | 형태(수일치) + 역할(전치사) | 기능어 독립 6청크 | **허용답 O** |
| 6 | BASIC | 결론(역설) | ⑧명사절→명사구 | 형태(시제) ×1 | 명사구 압축 4청크 | **`stemLanguage:en`** |

**7·8번째를 더 만들 때**: 표적 문장이 남지 않으면 **같은 문장에 다른 변형 축**을 걸어라
(예: S5 를 4번은 분열문으로, 7번은 도치로) — 단 `modelAnswer` 가 90자 이내에서 반드시 달라야 한다.
그것도 소진되면 **문항 수를 줄이고 사유를 남긴다**(헌법 §9 #10).

---

## 부록. 검증 로그

```
$ ./node_modules/.bin/tsx qbank/work/_probe-WORD_ORDER.ts
itemCount = 6 · laneSupported = true
blocking = 0 · qualityBlocking = 0 · warnings = 2
  warn [item 4] QUALITY:few-key-points   ← 어댑터가 keyPoints:[] 로 고정하는 구조적 경고
  warn [item 5] QUALITY:few-key-points
...
48/48 통과
OK — 골격이 게이트를 통과한다
```

- `AUTOSNAP` 보정 0건 · `writing-answer-verbatim-in-passage` 경고 0건(변형 설계 실증, 프로브 B7).
- 저작 실수 27종(E1~E27)을 실제 반려 문자열로 대조 확인 + 경계값 9종(B0~B8) + 유닛 게이트 2종(U1~U2)
  + 노브 8종(K1~K8) + 유닛 통과 11종(P1~P11).
- §4 표의 "도달성 ✕" 항목(#8·#12·#17·#18·#19·#24·#25)은 파서·스냅이 선제 처리해 레인 경로에서는
  발화하지 않는다 — **그래서 그 실수는 반려가 아니라 조용한 변형으로 나타난다**(§7 T11·T12).
