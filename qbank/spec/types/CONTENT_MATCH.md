# 내용 일치·불일치 (CONTENT_MATCH)

> **분류** 선택형(객관식, 지문 무변형 PASSTHROUGH) · **지문변형** 없음(한 글자도 건드리지 않는다) ·
> **정답 머리표** `정답:` (+ 이 유형에만 있는 **필수 머리표 `선지:` / `근거:`**) ·
> **최소 지문 길이** 코드 상 하한 없음 — 레인 `isEligible` 은 설정만 본다(`lane-content-match.ts:82-99`).
> 실질 하한은 게이트 #7 의 분포 상한 산식이다: `cap = max(1, ceil(optionCount / 지문문장수))`
> (`gate-content-match.ts:198`). 지문 문장 수 ≥ `optionCount` 여야 cap=1 이 되어 근거 5~12줄이
> **서로 다른 문장**으로 성립한다 → **실무 하한 = 문장 5개 이상, 약 80단어**(판단; 코드 강제 아님).

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

학생은 **진술문 하나하나를 지문의 특정 문장과 대조**해 참·거짓을 판정한다. 글 전체를 한 문장으로 접는
작업(TOPIC_MAIN_IDEA)이 아니고, 밑줄 어구를 국소 해석하는 작업(IMPLIED_MEANING)도 아니다.
**N개의 독립된 사실 판정을 병렬로 수행**하고, 그중 설정된 극성에 맞는 것 `answerCount` 개를 고른다.

그래서 이 유형의 승부처는 **"재진술 거리"** 다. 진술이 지문 어휘를 그대로 쓰면 학생은 눈으로 대조만 하고
끝내고(게이트 #4-c 가 축자 복사를 실제로 반려한다 — `gate-content-match.ts:128-130`), 너무 멀면
근거 문장과의 대응이 끊겨 시비가 생긴다.

### 다른 유형과의 경계

| 축 | CONTENT_MATCH | 이웃 유형 |
|---|---|---|
| 지문 접점 | **지문 무변형.** "지문 재구성 대조"라는 최강 게이트가 **존재하지 않는다** — `parser-content-match.ts:6-8`, `gate-content-match.ts:5-8` | 빈칸·어법·순서 계열은 재구성 대조가 작동 |
| 그 빈자리를 메우는 것 | **`근거:` 구역** — 선지마다 1줄, 지문 문장 축자. ① 축자 실재 ② 서로 다름 ③ 지문 등장 순 세 불변식 | TOPIC_MAIN_IDEA 는 `근거문장:` **1줄**(문항당 하나)뿐 |
| 선지 개수 | **5~12** (`prompts-content-match.ts:26-27`) — md-qgen 전 유형 중 최대 폭 | 대의파악 4~8, 대부분 5 고정 |
| 정답 개수 | **1 ~ optionCount** (`prompts-content-match.ts:28`, `lane-content-match.ts:97`) | 대부분 1 |
| 정답 극성 | **`matchType` 설정으로 뒤집힌다**(`일치`/`불일치`, 기본 불일치) — `content-match.ts:13-23` | 대의파악은 `answerPolarity:NEGATIVE` 라는 다른 키 |
| 선지 언어 | **`optionLanguage` 기본 `en`**(2026-06-10 강사 확정) — `language.ts:25-27`. 게이트가 결정형 집행 | TOPIC_MAIN_IDEA 는 기본 `ko` |
| 발문 | **모델이 쓰지 않는다.** 어댑터가 설정에서 결정론 합성 — `adapter-content-match.ts:40-62` | 동일 |
| 후처리 | **PASSTHROUGH** — 지문 필드도 라벨도 만들어 주지 않는다(`question-postprocess/types.ts:74`). 어댑터가 완제품 | 빈칸 계열은 후처리가 합성 |

**즉 이 유형의 마크다운은 다른 유형보다 구역이 하나 더 많다(`선지:` + `근거:`).**
`근거:` 를 빠뜨리면 근거 줄이 선지 구역으로 흘러 들어가 개수가 배로 잡히고, 게이트가 그 사실을
정확히 지목한다(`gate-content-match.ts:77-84`).

---

## 2. 마크다운 골격

### 2-1. 복붙용 골격 (기본값 = 5지 · 정답 1개 · 불일치 · 영문 선지)

```md
선지:
① <English statement — 지문 한 문장을 재진술. 축자 복사 금지. 12~240자>
② <English statement>
③ <English statement>
④ <English statement>
⑤ <English statement>

근거:
① <①의 참·거짓이 확정되는 지문 문장 하나 — 첫 글자부터 마침표까지 축자 그대로>
② <지문 문장 축자 — ①의 근거보다 지문 뒤쪽>
③ <지문 문장 축자>
④ <지문 문장 축자>
⑤ <지문 문장 축자 — 가장 뒤>

정답: <①~⑤ 중 하나>
해설: <한국어 2문장. 정답 진술이 근거 문장의 무엇과 어긋나는지. 합니다체>
오답:
① <왜 참으로 확정되는지 1문장 — 한국어>
② <…>
④ <…>
⑤ <…>
```

- **`오답:` 블록에는 정답 라벨을 넣지 않는다.** 위 예시는 정답이 ③이라 ①②④⑤ 네 줄
  (`gate-content-match.ts:248-268`). 파서가 정답 줄을 조용히 걸러내므로(`parser-content-match.ts:241`)
  넣으면 개수 불일치라는 **엉뚱해 보이는** 반려가 나온다.
- **발문 줄을 쓰지 마라.** 어댑터가 극성·정답 개수·발문 언어에서 합성한다
  (`prompts-content-match.ts:89`, `adapter-content-match.ts:40-62,135`).
- `## 지문` 을 다시 쓰지 마라(프롬프트 입력이지 모델 출력이 아니다 — `prompts-content-match.ts:264-265`).
- **빈 줄은 있어도 없어도 된다**(파서가 빈 줄을 건너뛴다 — `parser-content-match.ts:155`). 다만
  **항목 한 개 = 한 줄**을 지켜라(§3 P9).

### 2-2. 복수정답·6지·일치 골격 (`settings: {"optionCount":6,"answerCount":2,"matchType":"일치"}`)

```md
선지:
① <English statement>
② <English statement>
③ <English statement>
④ <English statement>
⑤ <English statement>
⑥ <English statement>

근거:
① <지문 문장 축자>   ← ①~⑥ 근거가 지문 등장 순서대로
② <지문 문장 축자>
③ <지문 문장 축자>
④ <지문 문장 축자>
⑤ <지문 문장 축자>
⑥ <지문 문장 축자>

정답: <서로 다른 2개를 ", " 로 이어서 — 예: ③, ⑤>
해설: <한국어 2문장 — 두 정답이 각각의 근거 문장과 어떻게 맞아떨어지는지>
오답:
① <…>
② <…>
④ <…>
⑥ <…>
```

### 2-3. 한국어 선지 골격 (`settings: {"optionLanguage":"ko"}`)

`선지:` 구역만 한국어로 바뀐다. **`근거:` 는 언제나 지문 축자(영어)** 이고 **해설·오답해설은 어느 모드에서도
한국어**다(`gate-content-match.ts:121-126`, `prompts-content-match.ts:196-199`).

### 2-4. 검증된 정상 픽스처 전문 — `scripts/_test-md-content-match.ts:50-87`

지문(`scripts/_test-md-content-match.ts:39-48`, 7문장):

```text
Urban planners once treated street trees as decoration rather than infrastructure. A decade of measurements in three coastal cities has changed that assumption. Mature canopies lowered midday street temperatures by up to three degrees. The cooling effect appeared only after the saplings had grown for roughly ten years. Younger plantings offered shade that was too thin to register on the instruments. Residents nevertheless reported feeling cooler long before the sensors agreed. Planners now budget for maintenance across decades instead of a single season.
```

마크다운(`md()` 헬퍼가 조립한 실물 — `GOOD`, 게이트 0 실측):

```md
선지:
① Street trees were once regarded as ornament instead of civic infrastructure.
② Fully grown canopies cut midday street temperatures by as much as three degrees.
③ The temperature drop showed up in the very first summer after planting.
④ People said they felt cooler earlier than the instruments confirmed.
⑤ Maintenance budgets are now planned across decades rather than one season.

근거:
① Urban planners once treated street trees as decoration rather than infrastructure.
② Mature canopies lowered midday street temperatures by up to three degrees.
③ The cooling effect appeared only after the saplings had grown for roughly ten years.
④ Residents nevertheless reported feeling cooler long before the sensors agreed.
⑤ Planners now budget for maintenance across decades instead of a single season.

정답: ③
해설: 지문은 냉각 효과가 묘목이 약 십 년 자란 뒤에야 나타났다고 밝힙니다. 따라서 심은 첫해 여름부터 기온이 내려갔다는 진술은 시점 조건을 떼어 낸 왜곡입니다.
오답:
① 과거에 가로수를 장식으로 여겼다는 첫 문장이 이 진술을 그대로 확정합니다.
② 최대 삼 도까지 낮아졌다는 측정 결과가 이 진술과 정확히 맞습니다.
④ 주민들이 센서보다 먼저 시원함을 느꼈다고 적혀 있어 참입니다.
⑤ 유지비를 수십 년 단위로 잡는다는 마지막 문장과 일치합니다.
```

> 근거 5줄이 지문 **1·3·4·6·7번째** 문장에서 하나씩 나왔다(2·5번은 안 쓰였다). 등장 순서는
> 지켰고 중복은 없다. 이것이 게이트 #7·#8 을 동시에 통과하는 배치다.

### 2-5. 6지·2정답 픽스처 — `scripts/_test-md-content-match.ts:646-666`

```md
선지:
① Street trees have always been treated as essential city infrastructure.
② Ten years of readings across three coastal cities overturned the earlier view.
③ Mature canopies raised midday street temperatures by three degrees.
④ The cooling effect was measurable in the first season after planting.
⑤ Residents felt the difference before the sensors could confirm it.
⑥ Maintenance is now budgeted one season at a time.

근거:
① Urban planners once treated street trees as decoration rather than infrastructure.
② A decade of measurements in three coastal cities has changed that assumption.
③ Mature canopies lowered midday street temperatures by up to three degrees.
④ The cooling effect appeared only after the saplings had grown for roughly ten years.
⑤ Residents nevertheless reported feeling cooler long before the sensors agreed.
⑥ Planners now budget for maintenance across decades instead of a single season.

정답: ②, ⑤
해설: 십 년간의 측정이 기존 통념을 뒤집었다는 서술과 주민 체감이 센서보다 앞섰다는 서술이 지문에 그대로 있습니다. 나머지 진술은 인과나 시점이 뒤집혀 지문과 어긋납니다.
오답:
① 첫 문장은 과거에 장식으로 취급했다고 밝혀 이 진술과 반대입니다.
③ 지문은 기온을 낮췄다고 했으므로 높였다는 진술은 인과 방향이 뒤집혔습니다.
④ 냉각 효과는 약 십 년 뒤에야 나타났으므로 첫 계절 진술은 시점 조건이 빠졌습니다.
⑥ 유지비를 수십 년 단위로 잡는다고 했으므로 한 계절 단위 진술은 어긋납니다.
```

(설정 `{"optionCount":6,"answerCount":2,"matchType":"일치"}` 로 게이트 0 실측 — `scripts/_test-md-content-match.ts:667-675`.)

### 2-6. qbank 유닛 컨테이너 (5~8문항을 한 파일에)

`<!-- ITEM n ... -->` 는 **qbank 규약이지 md-qgen 규약이 아니다**(`00-contract.md` §3). 하네스가 잘라낸 뒤의
본문만 파서에 들어간다 — `qbank/harness/qgen-core.ts:47,62-65`.

```md
<!-- ITEM 1
difficulty: BASIC
point: <이 문항만의 출제 포인트 — 유닛 내 중복 금지>
craft: <설계 메모(선택)>
settings: {"optionLanguage":"ko"}
-->
선지:
① …
```

`settings:` 는 JSON **한 줄**이며 `rawTypeSettings[subType]` 에 병합된다(`qgen-core.ts:369-377`) →
`resolveQuestionTypeGenerationSettings` 가 `contentMatchOptionCount/AnswerCount/Type` 으로 해석한다
(`question-type-generation-settings/dispatchers.ts:175-194`). **노브를 바꾸지 않는 문항은 `settings:` 줄 자체를 생략한다.**

> 5문항 유닛 실물(노브 3종 분기 포함)이 `qbank/work/_probe-CONTENT_MATCH.ts` 안에 있고, 이 프로브가
> `splitItems → parseAndGate → adapt → postProcess → validateQuestionQuality` 전 구간 클린을 실측했다(§검증).

---

## 3. 파서 계약 (★ 가장 중요)

> **prompts 의 문구가 아니라 아래 규칙이 계약이다.** 프롬프트는 "이 형식 그대로"(`prompts-content-match.ts:255`)
> 라고만 말하지만, 파서는 그보다 훨씬 관대한 자리도 있고 **훨씬 좁은 자리도 있다.**
> 이 유형의 파서는 `decoration.ts` 공용 유틸에 전량 위임한다(`parser-content-match.ts:14-20`) — 즉
> **정본 `parser.ts` 보다 장식 관용 범위가 넓다.** 그래도 **저작 규칙은 장식 0** 이다(`00-contract.md` §8).

### 3-0. 문서 단위

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P0 | **1 마크다운 = 정확히 1문항.** 모든 구역 슬라이서가 `findIndex` 로 **첫 머리표만** 잡는다 | `decoration.ts:147`(sliceKeywordSection), `decoration.ts:119-121`(readKeywordValue) | 2번째 문항 이후가 **조용히 소멸**하거나 첫 문항 구역에 흡수 |
| P1 | 발문 줄을 써도 **어댑터가 무시**한다(그러나 `선지:` 머리표 위 산문은 머리표 누락 시 선지 구역으로 흘러든다) | `adapter-content-match.ts:135`, `parser-content-match.ts:133-138` | 쓸 이유가 없다. 쓰지 마라 |
| P2 | 구역은 5개: `선지:` `근거:` `정답:` `해설:` `오답:`. **각 구역은 나머지 네 개를 정지 조건으로 안다** → 순서를 바꿔도 서로를 삼키지 않는다 | `parser-content-match.ts:94,97-99,219-225` | (안전장치) 그래도 위 골격 순서를 지켜라 |

### 3-1. 섹션 머리표 문법 — `decoration.ts:81-105`

```
HEAD_LEAD = ^[\s>|]*(?:#{1,6}\s*)?(?:[-*•]\s+)?[\s*_~`"'“‘]*
HEAD_TAIL = [\s*_~`"'”’]*\s*[:：]?[\s*_~`]*[ \t]*
머리표     = HEAD_LEAD + <키워드> + HEAD_TAIL
```

키워드 리터럴 — **각각 뒤에 "내용 글자 가드"가 붙는다**(`parser-content-match.ts:84-92`):

```
HEAD_CONTENT_GUARD = (?=[^0-9A-Za-z가-힣ㄱ-ㆎ]*(?:[:：]|$))
OPTION_KW   = (?:선지|보기|진술문|진술)  + GUARD
EVIDENCE_KW = 근거(?:[ \t]*문장)?        + GUARD
ANSWER_KW   = 정답                       + GUARD
EXPLAIN_KW  = 해설                       + GUARD
WRONG_KW    = 오답(?:[ \t]*해설)?        + GUARD
```

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P3 | 허용 별칭: `선지:`=`보기:`=`진술문:`=`진술:` / `근거:`=`근거 문장:` / `오답:`=`오답 해설:` | `parser-content-match.ts:88-92` | 그 외 이름(`보기 목록:` `evidence:`)은 머리표가 아니다 → 구역 통째 소멸 |
| P4 | 콜론은 `:` 또는 전각 `：`, **또는 생략 가능**(`HEAD_TAIL` 이 `[:：]?`) | `decoration.ts:83` | — |
| P5 | **내용 글자 가드**: 키워드와 콜론(또는 줄 끝) 사이에 영숫자·한글이 오면 머리표가 **아니다**. `오답 진술은 …` · `근거 문장이 이를 확정합니다` 같은 한국어 산문 줄은 안전 | `parser-content-match.ts:84`, 회귀 `scripts/_test-md-content-match-decoration.ts:404-426` | (안전장치) 이게 없으면 해설 접힘 줄이 구역을 잘라 뒤 항목이 통째 소멸 |
| P6 | 머리표 줄 자체에 값을 붙여도 되고(`정답: ③`) **다음 줄에 써도 된다**(`정답:` 개행 `③`) | `decoration.ts:113-134`, `parser-content-match.ts:229` | — |
| P7 | `선지:` 머리표를 **통째로 빠뜨리면** 다른 구역 머리표 앞까지를 선지 구역으로 복원한다 | `parser-content-match.ts:133-138,219-221` | (구제 경로) — 그래도 쓰라. `근거:` 는 **복원 경로가 없다** |
| **P8** | **저작 규칙: 장식 0.** `선지:` `근거:` `정답:` `해설:` `오답:` 를 **맨몸으로** 쓴다 | `00-contract.md` §8 | 관용 범위는 유형마다 다르다 — 여기서 통해도 다른 유형에서 터진다 |

### 3-2. 항목 줄(선지·근거·오답해설) — `parser-content-match.ts:109-177`

```regex
LINE_LEAD_DECORATION = /^[^\p{L}\p{N}]*/u          // 줄머리 비문자 전부 제거(불릿·인용·표파이프·대시)
LABELED_LINE         = /^(?:([①-⑫])|[([]?(\d{1,2})[)\].])[ \t]*(.*)$/
```

처리 순서(중요): **`cleanMdValue(line)` → `LINE_LEAD_DECORATION` 제거 → `LABELED_LINE` 매치 → `cleanEntryText`**
(`parser-content-match.ts:158,162-164`).

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P9 | 라벨 축은 **원문자 `①`~`⑫`**. 숫자 표기 `3.` `(3)` `3)` `3]` 도 흡수되지만 **저작은 원문자로만** | `parser-content-match.ts:112,162`, `digitToCircled` `:62-65` | 맨몸 숫자(`3 텍스트`)는 라벨이 **아니다**(뒤에 `)]. ` 중 하나가 있어야 한다) → 그 줄이 앞 항목에 병합되거나 `unparsed` 로 빠진다 |
| P10 | 라벨과 본문 사이의 잔여 구분자 `: ： . , 、 · • - – — ) ]` 는 흡수된다(안정될 때까지 반복) | `cleanEntryText` `parser-content-match.ts:118-130` | 남으면 학생 표면 선지가 `": 진술문"` 으로 저장된다(PASSTHROUGH — 후처리가 안 씻는다) |
| P11 | 표 행(`\| ⑤ \| 텍스트 \|`)은 파이프로 쪼개 **비어 있지 않은 첫 칸**만 취한다 | `parser-content-match.ts:121-123` | 두 번째 칸(본문)이 사라진다 → `| ⑤ | 텍스트 |` 는 라벨 칸이 먼저라 우연히 동작하지만, 형식을 바꾸면 즉사 |
| **P12** | **라벨 없는 줄은 직전 항목에 이어 붙는다 — 단 직전 항목이 문장 종결(`.!?。！？` + 닫는 따옴표/괄호)로 끝나지 **않았을 때만**.** 이어 붙인 뒤 다시 `cleanMdValue` | `parser-content-match.ts:168-172` | 종결 부호로 끝난 항목 뒤의 산문은 **`unparsed` 로 빠져** 게이트가 "인식하지 못한 줄" 로 지목(`gate:54-59`). **항목 한 개 = 한 줄**로 써라 |
| P13 | 장식만 있는 줄(`---`, `\|---\|`)은 데이터가 아니다 — 조용히 건너뛴다 | `parser-content-match.ts:158-160` | — |
| P14 | 흡수도 병합도 못 한 줄은 `unparsedOptions` / `unparsedEvidence` 로 **구역별로** 남는다 | `parser-content-match.ts:174,256-257` | 게이트 개수 메시지에 그 줄 선두 20자가 실려 원인을 지목한다 |

### 3-3. `정답:` 줄 — `parseContentMatchAnswerRun` `parser-content-match.ts:185-209`

```regex
ANSWER_LEAD = /^[\s"'“”‘’]+/
token       = /^[([]?([①-⑫]|\d{1,2})[)\].]?(?:번)?/
ANSWER_SEP  = /^(?:[,·、;/&]|및|와|과|그리고|and\b)[ \t]*/i
```

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P15 | 줄 전체를 `cleanMdValue` 로 먼저 씻는다 → `정답: **③**, **⑤**` · `` `③`, `⑤` `` · `"③", "⑤"` 전부 안전 | `parser-content-match.ts:195`, 회귀 `_test-md-content-match-decoration.ts:112-132` | — |
| P16 | **선행 라벨 런만** 수집. `정답: ②, ④` → 둘 다 / `정답: ③ — ④는 참` → **③만** | `parser-content-match.ts:196-207` | 정답 뒤 산문은 안전하지만, 복수정답을 산문 뒤에 적으면 **뒤쪽 정답이 소멸** → `정답 1개 (2개 필요)` + (정답 축 미확정이라) 파생 지시 없음 |
| P17 | 구분자는 `,` `·` `、` `;` `/` `&` `및` `와` `과` `그리고` `and`. **권장은 `", "`** | `parser-content-match.ts:187`, `prompts-content-match.ts:143` | 다른 구분자(`+`, `또는`)로 이으면 두 번째 정답 이후 소멸 |
| P18 | 숫자 정답(`정답: 3`)·`번` 접미(`3번`)도 원문자로 정규화된다 | `parser-content-match.ts:198-200` | — |
| P19 | 중복 라벨은 1회만 담긴다(`labels.includes` 가드) | `parser-content-match.ts:202` | `정답: ③, ③` → 정답 1개 → 개수 반려 |
| **P20** | **정답의 유일 진실원은 `정답:` 줄이다.** 선지 줄·근거 줄에 O/X·정답 표시를 **다시 받지 않는다** | `parser-content-match.ts:44-46`, `prompts-content-match.ts:174-176` | 중복 계약은 반의어 유형에서 실사용 2연속 반려의 원인이었다 |

### 3-4. `해설:` / `오답:` 구역 — `parser-content-match.ts:225,241,244-246`

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P21 | 해설 = `해설:` 머리표 ~ 다른 네 머리표 직전. 값은 `cleanMdValue` 를 통과(강조 제거 + 공백 축약) | `parser-content-match.ts:244-246` | `오답:` 머리표가 없으면 해설이 오답 목록을 **통째로 삼킨다** → `오답해설 0개` |
| P22 | 오답 목록에서 **정답 라벨 줄은 파서가 조용히 제거**한다 | `parser-content-match.ts:241` | 넣으면 개수가 줄어 `오답해설 3개 (4개 필요)` 라는 **엉뚱해 보이는** 반려 |
| P23 | 해설·오답해설은 **여러 줄로 써도 병합**된다(P12 조건 하에서) — 그러나 **한 줄로 써라** | `parser-content-match.ts:168-172` | 설계 메모를 사이에 끼우면 해설 텍스트로 흡수된다 |

### 3-5. 근거 정박 — `foldForContentMatch` / `locateContentMatchSpan` / `splitPassageSentences`

```
fold: 소문자화 → [a-z0-9] 만 남기고 나머지는 단일 공백   (parser-content-match.ts:267-292)
```

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P24 | 게이트의 **1차 대조는 축자**(`normalizeWs(passage).includes(normalizeWs(evidence))`) — fold 는 원인 진단·스냅용 | `gate-content-match.ts:175-183` | 구두점 하나만 달라도 `지문 표기와 다름` (스냅이 못 구제한 경우) |
| P25 | 근거는 **`splitPassageSentences` 가 뽑은 문장과 통째로 일치**해야 한다(절 인용·두 문장 결합 금지) | `gate-content-match.ts:185-191`, 분해기 `parser-content-match.ts:309-340` | `근거가 지문 문장 전체가 아님` 반려. 축자로 존재하기만 해서는 안 된다 |
| P26 | 문장 분해 규칙: `.!?` 로 끊되 **소수점 · 이니셜(`A. Smith`) · 약어(`mr mrs ms dr prof rev gen sen rep gov col lt sgt capt fig vol vs cf viz sr jr st no e.g i.e`) · 마침표 뒤 소문자**는 문장 끝이 아니다 | `parser-content-match.ts:305-306,317-327` | 지문에 `U.S.` `(e.g. …)` `3 p.m.` 이 있어도 안전(회귀 `_test-md-content-match-decoration.ts:324-345`) |
| P27 | `locateContentMatchSpan` 은 **단어 경계 + 유일 등장**을 강제한다. 2회 이상 등장하면 `null` | `parser-content-match.ts:353-375` | 짧은 인용(`the`, `res`)은 자리가 확정되지 않아 스냅이 손대지 않는다 |
| P28 | 근거 값은 **`cleanEntryText` 로 정리되지만 어댑터는 다시 씻지 않는다** — 지문 문장이 따옴표로 싸여 있으면 그대로 보존 | `adapter-content-match.ts:104-107` | — |

### 3-6. 스냅(0원 자동 보정) — `autoSnapContentMatchEvidence` `parser-content-match.ts:396-451`

| 보정 | 조건 | 근거 |
|---|---|---|
| 절 인용 → 그 문장 전문(지문 축자)으로 확장 | 인용이 한 문장 **안에** 들어가고, ① 사실상 문장 전체(fold 동일) **또는** ② 내용어(3자 이상 alnum) **4개 이상** | `parser-content-match.ts:408-427`, 하한 상수 `:387` |
| 재진술 드리프트 → 토큰 포함률 압도 문장으로 복원 | 자리를 못 찾았고, 내용어 ≥4, 최고 포함률 ≥ **0.75** 이며 2위와 **0.15** 이상 벌어짐 | `parser-content-match.ts:429-444` |
| **손대지 않는다** | 짧고 모호한 인용(내용어 3개 이하) · 두 문장에 걸친 인용 · 지어낸 근거 | `parser-content-match.ts:412-421,430,440` |

**스냅이 손대면 반드시 `corrections` 가 남는다**(하네스가 `warnings` 로 기록 — `qgen-core.ts:313`). **무보정이 정상이다.**

---

## 4. 게이트 체크리스트 — `gate-content-match.ts` (반려 사유 전수)

`requireWrong` 기본 `true`(`options.requireWrong !== false`, `gate-content-match.ts:69`). 레인은 이 옵션을
넘기지 않으므로 **항상 true**(`lane-content-match.ts:125-130`). `optionLanguage` 기본 `en`(`gate:70`).

| # | 사유 문자열(템플릿) | 조건 | file:line |
|---|---|---|---|
| 1 | ``\`근거:\` 머리표가 없어 선지 줄과 근거 줄이 한 구역에 섞였다(줄 {n}개) — 선지 {optionCount}줄 뒤에 \`근거:\` 머리표를 쓰고 근거 {optionCount}줄을 따로 적으라`` | 선지 수 불일치 **AND** 근거 0개 **AND** 선지 수 > optionCount — **즉시 return** | `gate-content-match.ts:77-82` |
| 2 | `선지 {n}개 ({optionCount}개 필요){ — 인식하지 못한 줄이 있다: '…20자'(줄머리 장식 없이 라벨로 시작하라)}` | 선지 수 불일치 — **즉시 return, 이후 검사 전부 생략** | `gate:83` (+힌트 `:54-59`) |
| 3 | `선지 라벨이 {①②③④⑤} 순서가 아님 — 실제 {actual\|없음}` | 라벨 런이 `①`부터 순서대로가 아님 | `gate:87-91` |
| 4 | `근거 {n}개 (선지마다 1개씩 {optionCount}개 필요 — \`근거:\` 구역에 {①②③④⑤} 줄을 빠짐없이 적으라){인식하지 못한 줄 힌트}` | 근거 수 불일치 | `gate:94-97` |
| 5 | `근거 라벨이 {①②③④⑤} 순서가 아님 — 실제 {actual\|없음}` | 근거 수는 맞는데 라벨 축이 어긋남 | `gate:98-102` |
| 6 | `{label} 진술문 누락` | 선지 텍스트가 빈 문자열 | `gate:109-112` |
| 7 | `{label} 진술문이 너무 짧아 진술로 성립하지 않음: '{…40자}'` | `normalizeWs(text).length < 12` | `gate:114-116` |
| 8 | `{label} 진술문이 {n}자 — 한 문장 진술로 줄이라` | 길이 > 240 | `gate:117-119` |
| 9 | `{label} 진술문에 한글이 섞임 — 선지는 영어로 쓰라: '{…40자}'` | `optionLanguage=en` 인데 `[ㄱ-ㆎ가-힣]` 포함 | `gate:121-123` |
| 10 | `{label} 진술문이 한국어가 아님 — 선지는 한국어로 쓰라: '{…40자}'` | `optionLanguage=ko` 인데 한글 없음 | `gate:124-126` |
| 11 | `{label} 진술문이 지문 문장의 축자 복사 — 재진술로 바꾸라` | 길이 ≥ 20 이고 `normalizeWs(passage)` 가 그 텍스트를 포함 | `gate:128-130` |
| 12 | `{label} 진술문이 다른 선지와 중복` | fold 동일한 선지 2개 | `gate:132-134` |
| 13 | `진술문 길이 편중(최장 {a}자 · 최단 {b}자) — 길이만 보고 정답이 찍힌다` | `최장 ≥ 최단×3` **AND** `최장-최단 > 18` (프로덕션은 warning, md 는 **error 승격**) | `gate:139-148` |
| 14 | `{label} 근거 누락` | 근거 문장이 빈 문자열 | `gate:165-168` |
| 15 | `{label} 근거가 {n}단어 — 지문 문장 하나만 옮겨 적으라` | 공백 분할 단어 수 > 60 | `gate:169-172` |
| 16 | `{label} 근거가 지문 표기와 다름(구두점·따옴표 변형) — 지문 문장을 한 글자도 바꾸지 말고 옮기라: '{…50자}'` | 축자 불일치인데 **fold 로는 자리가 잡힘** | `gate:174-182` |
| 17 | `{label} 근거 문장이 지문에 없음(지어낸 근거) — 지문에 실재하는 문장만 쓰라: '{…50자}'` | 축자 불일치이고 fold 로도 자리 없음 | `gate:174-182` |
| 18 | `{label} 근거가 지문 문장 전체가 아님(받은 값: '{…50자}') — 그 판정이 확정되는 지문 문장 하나를 마침표까지 통째로 옮기라` | 축자로는 존재하나 `splitPassageSentences` 의 어느 문장과도 완전히 같지 않음(절 인용·두 문장 결합·한 단어) | `gate:185-191` |
| 19 | `{labels} 가 지문 {i}번째 문장 하나를 근거로 함(문장당 최대 {cap}개) — 지문 전체를 고르게 훑으라` | 같은 문장을 근거로 쓴 라벨 수 > `cap = max(1, ceil(optionCount/문장수))`. **근거가 전부 정박됐을 때만 검사** | `gate:197-209` |
| 20 | `{labelB} 근거가 {labelA} 근거보다 지문 앞쪽임 — 근거는 지문 등장 순서대로 배열하라` | 인접 라벨의 문장 인덱스가 역전(첫 발견 1건만 보고) | `gate:212-221` |
| 21 | ``정답 줄에서 라벨을 인식할 수 없음(받은 값: '{…40자}') — \`정답: ①\` 형식으로 원문자 라벨만 적으라`` | `answers` 0개인데 `answerLine` 은 비어 있지 않음 | `gate:226-234` |
| 22 | `정답 누락` | `answers` 0개이고 `answerLine` 도 빈 문자열 | `gate:226-234` |
| 23 | `정답 {n}개 ({answerCount}개 필요) — 실제 '{①, ⑤}'` | 정답 개수가 설정과 불일치 | `gate:235-237` |
| 24 | `정답 라벨({label})이 선지에 없음` | 정답 라벨이 선지 라벨 집합 밖 | `gate:238-240` |
| 25 | `해설 누락` | `해설:` 값이 빈 문자열 | `gate:245` |
| 26 | `오답해설 {n}개 ({optionCount-answerCount}개 필요)` | 개수 불일치 | `gate:249-252` |
| 27 | `{label} 오답해설 누락` | 비정답 라벨 중 해설이 없는 것. **정답 축이 확정됐을 때만**(`answers.length===answerCount && 전부 선지에 실재`) 발화 | `gate:241-243,261-266` |
| 28 | `오답해설 라벨 중복` | `wrong.length !== wrongLabels.size` | `gate:267` |
| 29 | `오답해설에 정답 라벨 포함` | 파서 필터를 우회한 직접 호출 경로 방어 | `gate:269-271` |
| 30 | `교사 지정 문장이 어느 선지의 근거로도 쓰이지 않음: '{…60자}'` | **휴면** — CONTENT_MATCH 는 포인트 픽커 미등재라 라우트가 항상 빈 배열을 넘긴다 | `gate:276-284`, `lane:129` |

### 4-1. 게이트를 통과해도 죽는 자리 — 어댑터 실패 (하네스 코드 `ADAPT`)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {n}개 (5~12개 필요)` | 선지 수 범위 밖 | `adapter-content-match.ts:75-77` |
| `정답 {n}개 ({answerCount}개 필요)` | 정답 수 불일치 | `adapter:79-81` |
| `정답 라벨({label})이 선지에 없음` | 라벨 불일치 | `adapter:84-88` |
| `진술문 누락` | `cleanMdValue` 후 빈 텍스트 | `adapter:98` |
| `오답해설 라벨 중복({label}) — 해설이 덮어써진다` | 중복 라벨 | `adapter:112-114` |

### 4-2. 품질 축 (`validateQuestionQuality` — 프로덕션 비차단, qbank 은 차단)

| 코드 | 심각도 | 조건 | file:line |
|---|---|---|---|
| `content-match-direction-polarity` | error | 발문이 설정 극성과 어긋남 — **어댑터가 결정론 합성하므로 구조적으로 0** | `validators/content-match.ts:22-35`, `dispatcher.ts:867-872` |
| `content-match-type-mismatch` | error | 저장 `matchType` ≠ 설정 | `validators/content-match.ts:37-44` |
| `content-match-answer-explanation-conflict` | **warning** | 오답해설 맵에 정답 라벨이 있음(복수정답 의심) — 게이트 #29 가 먼저 잡는다 | `validators/content-match.ts:56-73`, `dispatcher.ts:873-876` |
| `option-count` | error | 선지 수 ≠ 기대치. **CONTENT_MATCH 는 실제 선지 수(5~12)를 기대치로 읽는 전용 분기**라 사실상 무발화 | `validators/options.ts:79-83,140-142` |
| `duplicate-option-text` / `empty-option-text` / `correct-answer-mismatch` | error | 일반 MC 축 — 게이트가 먼저 잡는다 | `validators/options.ts:150-158,195-218` |
| `explanation-foreign-script` / `explanation-latin-jam` | error | 해설에 한자·가나 혼입 / `영단어+다` 짜깁기 | `validators/explanation-foreign-text.ts:99-112` |
| `explanation-quoted-token-missing` | error | 해설이 따옴표로 인용한 영어 조각(12자 이상)이 문항 표면·지문에 없음 | `validators/explanation-quoted-tokens.ts:37,117-162` |
| `few-key-points` / `thin-killer-explanation` / `option-length-giveaway` | warning (KILLER 한정) | `keyPoints` 3개 미만(어댑터가 `[]` 강제 → **항상 뜬다, 무해**) 등 | `validators/misc.ts:66-97` |

### 4-3. qbank 유닛 축 (md-qgen 이 아니라 하네스가 낸다) — `qbank/harness/qgen-core.ts`

| 코드 | 사유 | 조건 | file:line |
|---|---|---|---|
| `CONTAINER` | `ITEM 헤더가 하나도 없다` / `settings 가 JSON 이 아니다` / `point(출제 포인트) 누락` / `본문이 비어 있다` / `ITEM 번호 비연속` | 컨테이너 형식 | `qgen-core.ts:57-85` |
| `ITEM_COUNT` | `문항 {n}개 — 최소 {minItems}개 필요` | 티어별 하한(기본 5) | `qgen-core.ts:229-236` |
| `POINT_DUPLICATE` | `출제 포인트 중복: "{point}" 가 문항 …에 반복` | `point:` 정규화(소문자+비문자 제거) 후 동일 | `qgen-core.ts:324-333,379-384` |
| `ANSWER_DUPLICATE` | `정답 표적 중복: "{target}" 가 문항 …의 정답` | **이 유형에서 target = 정답 진술문 앞 90자** — `lane-content-match.ts:170-196` | `qgen-core.ts:336-353` |
| `UNSUPPORTED_LANE` | 레지스트리 미등록 | 해당 없음(등록됨 — `lane-registry.ts:25,59`) | `qgen-core.ts:205-224` |

---

## 5. adapter 산출 필드 — `adapter-content-match.ts:132-150`

| 키 | 값 | 비고 |
|---|---|---|
| `direction` | 설정으로 합성된 발문 4분기 | **모델이 쓰지 않는다.** `불일치×1`=`다음 글의 내용과 일치하지 않는 것은?` / `일치×1`=`…일치하는 것은?` / `K≥2`=`…모두 고르시오.` / `stemLanguage=en` 이면 영어 4문형 — `adapter:40-62` |
| `matchType` | `"일치"` \| `"불일치"` | **이 유형 고유 필드.** 교사 설정 그대로. 품질 검증기의 극성 스위치 — `dispatcher.ts:867-872` |
| `options[]` | `{label:"1".."12", text}` | 원문자 → 숫자 축 변환은 `digitLabel`(`adapter:65-67`). 텍스트는 **전부 `cleanMdValue` 통과**(`adapter:94-97`) |
| `correctAnswer` | 정답 라벨을 `", "` 로 이은 문자열(`"3"` / `"3, 5"`) | `adapter:138` |
| `correctAnswers` | **정답 2개 이상일 때만** 배열로 추가 | K=1 에서는 키 자체가 없다(구형 저장 형상 유지) — `adapter:141` |
| `wrongOptionExplanations` | `[{label:"1", explanation}]` — **비정답 라벨만**, 빈 해설 제외 | **이 유형 고유**: 해설 뒤에 `(근거: "<지문 문장>")` 이 자동 부착된다(이미 포함돼 있으면 생략) — `adapter:117-129`. 후처리가 Record 로 정규화 + 한국어 가시선지 유형이라 `'<선지 텍스트>' 선택지는 …` 접두를 붙인다(`question-postprocess/index.ts:256-308`) |
| `explanation` | `해설:` 값(`cleanMdValue` 통과) | `adapter:143` |
| `keyPoints` | **항상 `[]`** | 합성 금지 규약 — `adapter:144-146`. KILLER 에서 `few-key-points` 경고가 뜨는 것은 **설계상 정상** |
| `tags` | `[]` | `adapter:147` |
| `difficulty` | `ctx.rawDifficulty` | `adapter:148` |

**이 유형에만 있는 것 / 없는 것**

- **있음**: `matchType`(극성) · 오답해설의 `(근거: "…")` 부착.
- **없음**: `evidence` 배열은 **저장되지 않는다.** 근거는 게이트가 소비하고, 비정답 라벨의 근거만
  오답해설 문자열 안으로 들어간다. **정답 라벨의 근거는 어디에도 저장되지 않는다**(해설이 그 자리를 서술한다 — `adapter:100-106`).
- **금지**: `blanks` / `passageWithBlank` / `passageWithMarkers` / `originalExpression` / `markedWords`
  (`adapter:20-22`, 회귀 `scripts/_test-md-content-match.ts:588-595`).
- **PASSTHROUGH**: 후처리가 지문 필드도 라벨도 만들지 않는다(`question-postprocess/types.ts:74`).
  받는 정규화는 두 가지뿐 — ① `wrongOptionExplanations` 배열 → Record ② 한국어 가시선지 정렬 접두.
- 저장 후 **선지 셔플 대상**이다(`question-diversity.ts:508-522`). → **해설에서 선지를 번호로 지칭하지 마라**
  (이 유형의 게이트는 그 검사를 하지 않는다 — 검수 렌즈가 봐야 한다).

---

## 6. 생성 노브 (전수)

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `optionCount` (resolved: `contentMatchOptionCount`) | number | **5** (`shared.ts:14`) | **5~12** (`shared.ts:10,12`, `clampContentMatchMdOptionCount` `prompts-content-match.ts:30-37`) | `선지:` 줄 수 = `근거:` 줄 수 = 이 값. 라벨은 `①`부터 이 개수만큼. 어긋나면 게이트 #2 **즉시 return** |
| `answerCount` (resolved: `contentMatchAnswerCount`, alias `correctAnswerCount`) | number | **1** (`shared.ts:18`) | **1 ~ optionCount** (`shared.ts:142-148`, `clampContentMatchMdAnswerCount` `prompts:39-47`) | `정답:` 줄의 라벨 수. 2 이상이면 `정답: ③, ⑤` + 발문 "모두 고르시오" + `correctAnswers` 배열. 오답해설 수 = `optionCount - answerCount` |
| `matchType` (resolved: `contentMatchType`) | `"일치"｜"불일치"` | **"불일치"** (`content-match.ts:16,22`) | 두 값만. "자동" 없음 | **마크다운 형식은 불변, 설계가 뒤집힌다.** `불일치`면 정답이 왜곡 진술·나머지가 참 / `일치`면 정답이 참·나머지가 왜곡 — `prompts:93-121` |
| `optionLanguage` | `"ko"｜"en"` | **"en"** (`language.ts:25-27`) | 토글 가능 유형(`language.ts:64-72` 등재) | **`선지:` 구역의 언어를 결정형으로 강제**한다(게이트 #9/#10). `근거:` 는 언제나 지문 축자, 해설·오답해설은 언제나 한국어 |
| `stemLanguage` | `"ko"｜"en"` | **"ko"** (`language.ts:27`) | — | 발문 언어만 바꾼다. **마크다운 본문 무영향**(레인이 프롬프트 블록조차 안 붙인다 — `lane:110-117`). **다각화 축으로 쓰지 마라** |
| `difficulty` (ITEM 헤더) | `BASIC｜INTERMEDIATE｜KILLER` | INTERMEDIATE(하네스 기본 — `qgen-core.ts:79`) | — | 마크다운 **형식 불변**. 왜곡 기제의 자리와 재진술 강도 요구만 바뀐다 — `prompts:58-69`. few-shot 해부는 **BASIC 을 제외한** 난이도에만 붙는다(`prompts:214`) |

- `isEligible`: `5 ≤ optionCount ≤ 12 && 1 ≤ answerCount ≤ optionCount` (`lane-content-match.ts:82-99`).
  **`answerCount == optionCount` 도 적격**이다(전부 정답 → 오답해설 0개). 실무에서는 쓰지 마라.
- 설정 읽기 순서: `resolved` 1순위 → 없으면 raw 리더 폴백(`lane:39-63`). raw 는 **flat 우선 → nested(`CONTENT_MATCH`) 폴백**
  (`shared.ts:88-102`, `content-match.ts:17-21`). 하네스는 nested 경로를 쓴다(`qgen-core.ts:369-377`).
- 과금 축: `QUESTION_GEN_SINGLE`(`lane:77`) — VOCAB 3종 밖이다. qbank 은 과금 경로를 타지 않는다.
- `mdFormat` 포렌식 메타 = `{optionCount, answerCount, matchType, optionLanguage}` (`lane:161-168`).

---

## 7. 함정 (코드 근거가 있는 것만)

1. **`근거:` 머리표를 빠뜨린다** → 근거 줄이 선지 구역으로 흘러들어 선지가 10개로 잡히고,
   게이트가 **그 원인을 지목한 단일 메시지로 즉시 return** 한다(`gate:77-82`).
   `선지:` 는 누락돼도 복원 경로가 있지만(`parser:133-138`) **`근거:` 에는 없다.**

2. **근거를 절·구절로 적는다** → 스냅이 내용어 4개 이상일 때만 문장 전문으로 확장한다(`parser:421`).
   3개 이하(예: `② canopies`)면 **손대지 않고** 게이트 #18 `근거가 지문 문장 전체가 아님` 으로 반려
   (`scripts/_test-md-content-match.ts:527-539`). **처음부터 마침표까지 통째로 옮겨라.**

3. **두 문장을 이어 붙여 근거로 쓴다** → 축자로는 존재해도 #18 반려(`_test-md-content-match.ts:540-548`).
   한 진술의 참·거짓이 두 문장을 합쳐야 확정된다면, **그중 판정을 확정하는 한 문장**을 골라라.

4. **같은 문장을 두 선지의 근거로 쓴다** → #19. 지문 문장 수 ≥ optionCount 이면 `cap=1` 이라
   **단 한 번의 중복도 반려**된다(`gate:198`).

5. **근거를 지문 등장 순서와 다르게 배열한다** → #20. `①`의 근거가 가장 앞, 마지막 라벨의 근거가 가장 뒤여야 한다
   (`gate:212-221`, `prompts:230`). **선지 순서를 정할 때 근거 문장의 위치가 곧 선지 순서다.**

6. **선지를 지문 문장에서 그대로 복사한다** → #11(길이 20자 이상 + 축자 포함). 재진술 필수(`gate:128-130`).
   ⚠ 이 검사는 `optionLanguage=ko` 에서는 **사실상 작동하지 않는다**(한국어 선지는 영어 지문의 부분문자열이 될 수 없다)
   — 한국어 선지의 축자성은 검수 렌즈가 봐야 한다.

7. **정답 진술만 길게 쓴다** → #13 길이 편중(최장 ≥ 최단×3 **AND** 차이 > 18). 프로덕션은 warning 이지만
   **md 는 error 로 승격**돼 있다(`gate:137-148`). 품질헌법 §3-6 은 더 엄격하다(최장 ≤ 최단×2).

8. **복수정답을 산문 뒤에 적는다**(`정답: ③ 그리고 ⑤도 참`) → 선행 라벨 런만 수집되므로 ⑤가 소멸
   (`parser:196-207`). `정답: ③, ⑤` 형식만 써라.

9. **오답 목록에 정답 라벨을 넣는다** → 파서가 조용히 제거(`parser:241`)한 뒤 #26 이
   `오답해설 3개 (4개 필요)` 라는 **원인과 달라 보이는** 반려를 낸다.

10. **`오답:` 머리표를 빠뜨린다** → 해설 구역이 오답 목록을 통째로 삼켜 `오답해설 0개` (`parser:244-246`).

11. **항목을 여러 줄로 접어 쓴다** → 직전 항목이 종결 부호로 끝났으면 병합되지 않고 `unparsed` 로 빠진다
    (`parser:168`). 게이트는 개수 메시지에 그 줄 선두 20자를 실어 준다(`gate:54-59`). **항목 한 개 = 한 줄.**

12. **해설에 영어를 따옴표로 인용한다** → 그 조각(12자 이상)이 지문·선지·근거 어디에도 없으면
    `explanation-quoted-token-missing` error(`validators/explanation-quoted-tokens.ts:117-162`).
    인용은 **지문 축자만**. 어댑터가 붙이는 `(근거: "…")` 는 이미 축자라 안전하다.

13. **해설에 한자·가나를 섞거나 `영단어+다` 로 짜깁는다** → `explanation-foreign-script` /
    `explanation-latin-jam` error(`validators/explanation-foreign-text.ts:99-112`). 한글 직후 괄호 병기만 예외.

14. **해설에서 선지를 번호로 지칭한다** → 이 유형의 게이트는 **검사하지 않지만**, 저장 후 선지가 셔플되므로
    (`question-diversity.ts:508-522`) 번호 지칭은 학생 화면에서 **틀린 지칭이 된다.** 내용으로 지칭하라.

15. **`settings:` 로 `optionCount` 만 올리고 근거 줄을 안 늘린다** → #4. 선지와 근거는 **항상 같은 개수**다.

16. **유닛 내 정답 진술 재사용** → `ANSWER_DUPLICATE` 로 **유닛 전체 차단**. 표적은 **정답 진술문 앞 90자**
    (`lane:170-196`, `qgen-core.ts:336-353`). 5~8문항의 정답 진술이 전부 달라야 한다.

17. **`point:` 문구 중복** → `POINT_DUPLICATE` 로 유닛 차단(`qgen-core.ts:324-333`). 정규화가
    소문자화+비문자 제거이므로 문장부호만 바꾼 재탕은 통하지 않는다.

18. **KILLER 문항의 `few-key-points` 경고** → 어댑터가 `keyPoints: []` 를 강제하므로 **회피 불가·무해**
    (`adapter:144-146`). warning 이라 차단하지 않는다. 놀라지 마라.

---

## 8. 출제 포인트 다각화 축 — 한 지문에서 5~8문항

> 이 유형은 **다각화가 가장 쉬운 유형**이다. 정답이 "글 전체의 요지" 하나로 수렴하지 않고,
> **지문의 각 문장이 잠재적 정답 자리**이기 때문이다. 레인 주석도 이를 명시한다 —
> 회피 표적은 지문 축자가 아니라 **이미 출제된 정답 진술**이라 어떤 게이트와도 충돌하지 않는다
> (`lane-content-match.ts:170-175`). 그러나 쉬운 만큼 **게으른 다각화**(같은 문장을 계속 정답 자리로 쓰기)도 쉽다.

### 8-A. 노브로 달라지는 축 (코드 근거 — `settings:` 한 줄로 결정형 분기)

| 축 | 설정 | 문항이 실제로 달라지는 지점 | 근거 |
|---|---|---|---|
| **정답 극성** | `{"matchType":"일치"}` | **인지 작업이 반전된다.** 불일치형은 "왜곡 하나 찾기"(소거 4회), 일치형은 "참 하나 찾기"(반증 4회). 발문·`matchType`·오답해설의 논조가 함께 뒤집힌다 | `lane:59-63`, `adapter:40-62`, `prompts:93-121` |
| **선지 수** | `{"optionCount":6}` ~ `12` | 근거 슬롯이 1~7개 늘어 **지문의 더 많은 문장이 판정 대상**이 된다. 12지는 사실상 지문 전문 스캔 | `prompts:26-27`, `gate:71,94` |
| **복수 정답** | `{"answerCount":2}` (+`optionCount`↑) | "모두 고르시오". 서로 다른 기제의 왜곡 2개를 **동시에** 찾아야 하고, 부분 정답이 인정되지 않아 난이도가 계단식으로 오른다 | `prompts:141-143`, `adapter:141` |
| **선지 언어** | `{"optionLanguage":"ko"}` | **대조 작업의 성격이 바뀐다.** en 은 영–영 어휘 대조(재진술 거리 판정), ko 는 영–한 의미 대조(번역 층위 판정). 게이트 #9/#10 의 분기축 | `lane:69-71`, `gate:121-126` |
| **난이도** | ITEM 헤더 `difficulty:` | BASIC=한 문장 안의 명시 사실(수치·주체·시점·유무) / INTERMEDIATE=두 문장의 관계(인과·대조·조건) / KILLER=논지 수렴부의 한정어·인과 방향 | `prompts:58-69` |
| ~~발문 언어~~ | `{"stemLanguage":"en"}` | **마크다운이 한 글자도 안 바뀐다**(레인이 프롬프트 블록조차 안 붙인다). **단독 축으로 쓰지 마라** | `lane:110-117` |

**유닛 조합 예 (5문항)**

1. BASIC · 5지1답 · 불일치 · en — 명시 사실(수치·시점) 반전
2. INTERMEDIATE · 5지1답 · 불일치 · en — 두 문장의 인과 결합 오류
3. KILLER · 5지1답 · 불일치 · en — 논지 수렴부의 한정어 삭제
4. KILLER · 5지1답 · 불일치 · **ko** — 번역 층위 대조(한국어 진술)
5. INTERMEDIATE · **6지2답 · 일치** — 참 진술 2개 동시 확정

(8문항 티어면 ① BASIC·일치·5지 ② KILLER·8지1답·en ③ INTERMEDIATE·6지2답·ko 를 더한다.)

### 8-B. 설계로 달라지는 축 (교육적 판단 — 코드가 강제하지 않는다)

1. **근거 문장 집합의 이동** — 이 유형 다각화의 **1순위 축**이다. 지문이 9문장이고 5지 문항이면
   문항마다 근거 5문장 집합을 다르게 짠다(1·2·3·6·8 → 2·4·5·7·9 → 1·3·4·6·9 …).
   게이트는 **문항 내부의 중복만** 보고 문항 간 중복은 못 본다(`gate:197-209`) — 검수 렌즈 ⑤의 대상이다.
   *같은 5문장을 5문항이 재사용하면 그건 1문항의 5개 사본이다.*

2. **정답 자리(왜곡을 거는 문장)의 이동** — 문항마다 정답 근거를 **다른 논지 위치**에서 뽑는다:
   도입 통념 / 전환 / 기제 / 사례·수치 / 귀결. `ANSWER_DUPLICATE` 는 문자열만 보므로
   같은 문장을 다른 말로 비틀면 게이트는 통과한다 — 그건 다각화가 아니다.

3. **왜곡 기제 4종의 순환** (`prompts:73-76`) — 한 문항 안에서 같은 기제 2회 금지, 유닛 안에서 같은
   (기제 × 논지위치) 조합 2회 금지:
   - ① **인과 뒤집기**(F1/F4) — 원인·결과 교체, 상관 → 인과 격상
   - ② **조건·시점 탈락**(F7) — 전제·조건절·시점을 떼어 무조건 참으로
   - ③ **범위·정도 확대**(F3) — 한정어 → 전칭, 한 사례 → 전체 일반화
   - ④ **주체·대상 바꿔치기**(F6) — 두 집단·두 시점에 속한 서술을 교환

4. **참 진술의 재진술 거리 스펙트럼** — BASIC 은 핵심어를 남기고, KILLER 는 **표면 어휘 대조로는 하나도
   확인되지 않게**(`prompts:68`) 어휘를 멀리 보낸다. 이 거리를 문항마다 달리하면 같은 근거 문장을 써도
   측정하는 능력이 달라진다.

5. **최강 미끼의 위치** — "정답과 끝까지 저울질되는 진술"을 문항마다 다른 라벨·다른 논지 지점에 둔다
   (`prompts:108,120`). 학생이 **어디서 멈췄는지**를 문항마다 다르게 진단한다.

6. **정답 진술 전량 유일** — 8-A/8-B 를 다 지켜도 정답 진술문 앞 90자가 겹치면 `ANSWER_DUPLICATE` 로
   유닛이 통째로 반려된다(§7-16). 소재가 같아도 **문장을 새로 써라.**

### 8-C. 하지 말 것

- ❌ **정답 라벨만 옮기기** — 저장 단계에서 어차피 셔플된다(`question-diversity.ts:508-522`).
- ❌ **`stemLanguage` 만 바꿔 문항 수 채우기** — 마크다운이 동일해 실질 사본이다(`lane:110-117`).
- ❌ **같은 근거 5문장 집합에 왜곡 자리만 옮기기** — 학생이 읽는 문장이 같으면 같은 문항이다.
- ❌ **지문에 없는 사실을 지어내 정답으로 삼기** — 근거 축자 검사(#17)에서 죽고, 통과해도 학생이
  지문을 안 읽고 소거한다(`prompts:104`).

---

## 검증 (실측)

프로브: `qbank/work/_probe-CONTENT_MATCH.ts` · 실행 `./node_modules/.bin/tsx qbank/work/_probe-CONTENT_MATCH.ts`

```
PASS A: 리포 정상 픽스처 gateIssues=0
[B] itemCount=5 laneSupported=true ok=true
  ITEM 1 [BASIC]        gate=0 adapt=true post=true qErr=0 qWarn=0  direction="다음 글의 내용과 일치하지 않는 것은?"        correctAnswer="3"    options=5
  ITEM 2 [INTERMEDIATE] gate=0 adapt=true post=true qErr=0 qWarn=0  direction="다음 글의 내용과 일치하지 않는 것은?"        correctAnswer="2"    options=5
  ITEM 3 [KILLER]       gate=0 adapt=true post=true qErr=0 qWarn=1  (few-key-points — 설계상 정상)                          correctAnswer="4"    options=5
  ITEM 4 [KILLER]       gate=0 adapt=true post=true qErr=0 qWarn=1  optionLanguage=ko 집행                                  correctAnswer="4"    options=5
  ITEM 5 [INTERMEDIATE] gate=0 adapt=true post=true qErr=0 qWarn=0  direction="다음 글의 내용과 일치하는 것을 모두 고르시오." correctAnswer="3, 5" options=6
PASS B: blocking=0 · PASS B': qualityBlocking=0
```

음성테스트 12종 전부 검출(불변조건 I7): 지어낸근거 / 근거단어하나 / 근거순서역전 / 근거중복인용 /
지문축자복사 / 선지언어위반 / 정답개수 / 근거머리표소실 / 오답해설누락 / 포인트중복 / 정답표적중복 / 선지개수.

> §2 골격은 **실측으로 통과가 확인된 형식**이다. 통과하지 못하는 변형을 임의로 만들지 마라.
