# 무관한 문장 (IRRELEVANT)

> **분류** 선택형(번호 5~10지선다) · **지문변형** ○ (**삽입 only** — 원 지문 전체 축자 + 무관 문장 1개를 두 원문 문장 사이에 끼움) · **정답 머리표** `정답:` (원문자 ①~⑩) · **최소 지문** 코드 하한 **5문장**(`irrelevant.ts:51-58`) · 실무 하한 **8문장 / 130단어**
>
> 정찰 근거: `src/lib/md-qgen/{parser,gate,adapter,lane,prompts}-irrelevant.ts` 직독 + `scripts/_test-md-irrelevant.ts`(1019줄) 픽스처 + `qbank/work/_probe-IRRELEVANT.ts` tsx 실행 검증(48/48 통과).
> 공유 계약은 [`../recon/00-contract.md`](../recon/00-contract.md), 품질 규범은 [`../quality-constitution.md`](../quality-constitution.md).
>
> ⚠ `snap-irrelevant.ts` 파일은 **없다.** 오토스냅은 `parser-irrelevant.ts:288-348` 의 `autoSnapIrrelevantSlots` 안에 있다.

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

학생은 번호가 붙은 N개 문장 중 **글의 논리 흐름에 기여하지 않는 문장 하나**를 고른다.
핵심은 "어휘가 낯선 문장 찾기"가 **아니다**. 계약 문서가 못 박은 철학은 **on-topic / off-logic** 이다
(`prompts-irrelevant.ts:136-137`):

> 무관한 문장은 "완전히 다른 주제의 문장"이 아니다. 지문의 중심 소재어와 핵심 어휘를 그대로 공유하면서
> **문단의 논리 기능만** 어긋나는 문장이다.

이 철학은 장식이 아니라 **게이트로 집행된다** — 삽입 문장이 지문과 내용어를 거의 안 나누면 반려되고
(`gate-irrelevant.ts:347-351`), KILLER 에서는 표시문장 겹침 비율 하한까지 걸린다(`:378-383`).
즉 **"티 나게 무관한 문장"은 형식적으로 불가능하다.**

### 다른 유형과 결정적으로 다른 세 가지

1. **문항의 실체는 "지운 문장"이 아니라 "네가 새로 쓴 문장"이다.**
   이 유형의 계약은 **삽입(insertion)** 이다. 원문 문장을 무관 문장으로 **교체**하는 계약이 아니다
   (`parser-irrelevant.ts:6-11`, `prompts-irrelevant.ts:11-15`). 후처리 `buildSpreadMarkedPassage` 가
   원문 전 문장을 그대로 출력하고 무관 문장만 끼워 넣기 때문에, 교체 계약으로 쓰면 md 설계와 학생
   표면이 어긋나 게이트가 무력화된다.

2. **최강 불변식 — remove-and-reconnect** (`gate-irrelevant.ts:180-187`):

   ```
   정답 마커(삽입 문장)를 통째로 들어내고 나머지 마커를 걷어낸 재구성본  ==  원 지문
   ```

   이 한 줄이 통과하면 마커 밖 무단 편집·비정답 슬롯 변형·원문 문장 유실이 **동시에** 증명된다.
   깨지면 문항이 아니라 파본이다.

3. **지문 첫 문장에는 절대 번호를 붙일 수 없다.** 도입문은 학생이 관련성을 판정하는 기준점이라
   번호 없이 그대로 보여 준다(`gate-irrelevant.ts:237-241` · 프로덕션 `irrelevant-source-first-sentence`).
   → 슬롯 N개를 만들려면 지문에 **첫 문장 외** 원문 문장이 N−1개 필요하다.

### 게이트가 요구하는 "정답 유일성"의 구조

- 그 문장 하나만 빼면 앞뒤가 빈틈없이 이어진다 (게이트 #4 가 기계적으로 증명한다).
- 나머지 표시 문장은 **하나라도** 빼면 논증 사슬이 끊긴다 (기계가 못 보는 축 — 검수 렌즈 ①·④ 소관).

---

## 2. 마크다운 골격

### 2-1. 정규 형식 (복붙용)

```md
번호지문:
<지문 첫 문장(번호 없음, 축자). [[1:<두 번째 이후 원문 문장 축자>]] <번호 안 붙인 원문 문장도 그대로 남긴다> [[2:<원문 문장 축자>]] [[3:<★ 네가 새로 쓴 무관 문장 — 정답>]] [[4:<원문 문장 축자>]] ... [[5:<원문 문장 축자>]] <나머지 원문 문장도 그대로>>

정답: <③ — 무관 문장의 번호. ① 과 ⑤ 는 금지(가운데만)>
해설: <딱 2문장. 그 문장이 어떤 논리 기능에서 어긋나는지 + 빼면 왜 흐름이 복원되는지. 한국어 합니다체. 문장을 번호로 부르지 말고 내용으로 지칭>
오답:
① <이 문장이 글에서 맡는 역할(정의·예시·대조·귀결)과 왜 흐름에 필요한지 1문장>
② <〃>
④ <〃>
⑤ <〃>
```

**골격 불변 규칙 (전부 게이트가 집행)**

| 규칙 | 근거 |
|---|---|
| 번호지문은 **지문 전체**를 담는다. 번호 안 붙인 원문 문장도 한 글자도 빼지 않고 그대로 옮긴다 | `gate-irrelevant.ts:180-187` |
| 번호는 `1`부터 `N`까지, **지문 등장 순서대로**. 건너뛰기·되돌아가기 금지 | `gate-irrelevant.ts:156-163` |
| 무관 문장은 **연속된 두 원문 문장 사이**에 끼운다. 그리고 **바로 앞 문장에도 반드시 번호를 붙인다** | `gate-irrelevant.ts:266-280` |
| 문장의 **끝 구두점까지 마커 안**에 넣는다 | `parser-irrelevant.ts:188-192` (밖에 남기면 스냅이 흡수하지만 기대지 마라) |
| 지문 첫 문장은 감싸지 않는다 | `gate-irrelevant.ts:237-241` |
| 정답은 첫/마지막 번호가 될 수 없다 | `gate-irrelevant.ts:171-176` · `adapter-irrelevant.ts:49-51` |
| `오답:` 은 **단독 줄**, 그 아래 정답 번호를 뺀 N−1줄 | `parser-irrelevant.ts:72-73,224-226` |
| 해설·오답해설 본문에 원문자(①~⑳) 금지 | `gate-irrelevant.ts:83,286-290,304-306` |

### 2-2. qbank 유닛 컨테이너 (md-qgen 계약이 아니라 **하네스 규약**)

한 `.md` = 한 유닛(지문 1 × 유형 1 × 문항 5~8). 하네스가 `<!-- ITEM n ... -->` 로 1문항씩 잘라 레인에 넣는다
(`qbank/harness/qgen-core.ts:47-99`). 잘라낸 **뒤의 본문만**이 md-qgen 계약 대상이다.

```md
<!-- ITEM 1
difficulty: KILLER
point: 역 시계와 광장 시계의 충돌 — 시계의 '세공'을 평가해 논점을 바꿈
craft: 앞 문장 어휘를 6개 이상 재사용하고 논리 기능만 관점 평가로 역전
settings: {"slotCount":7}
-->
번호지문:
...
```

- `difficulty` = `BASIC|INTERMEDIATE|KILLER` (`qgen-core.ts:79-82`)
- `point` 누락 = 컨테이너 반려. 유닛 내 `point` 중복 = `POINT_DUPLICATE` 차단(`qgen-core.ts:325-333`)
- `settings` 는 그 문항의 유형 설정 오버라이드(JSON). **키 이름은 `slotCount`** (`irrelevantSlotCount` 아님 —
  `question-type-generation-settings/irrelevant.ts:13-18`)
- 유닛 내 **`diversityTargets` 중복 = `ANSWER_DUPLICATE` 차단.** 이 유형의 표적은 **삽입한 무관 문장**이므로
  두 문항이 같은 무관 문장을 쓰면 죽는다(`lane-irrelevant.ts:246-253` · `qgen-core.ts:336-353`, 프로브 P2-b 실증)

### 2-3. ★ 검증된 정상 픽스처 전문 — `scripts/_test-md-irrelevant.ts` (`GOOD` = `mdOf()` 기본값)

`_test-md-irrelevant.ts:161-171` 에서 `게이트: 정상 입력 클린(KILLER/BASIC/INTERMEDIATE)` 으로 검증되는 실물.
9문장 지문, 표시 원문 4개(원문 인덱스 1·3·4·7), 무관 문장은 인덱스 3 뒤에 삽입.

원 지문 (`_test-md-irrelevant.ts:42-53`):

```
Early modern cartographers rarely drew what they could see with their own eyes. Most of them worked from travelers' reports, merchant ledgers, and older maps that had themselves been copied many times. A coastline therefore recorded not a survey but a consensus among distant witnesses. When two accounts disagreed, the mapmaker had to decide which informant carried more authority. That decision was rarely announced on the finished sheet, so readers inherited a judgment they could not inspect. Blank interiors were filled with ornament precisely because emptiness invited awkward questions about the limits of the record. Later surveyors who carried instruments into those interiors often found the inherited outlines badly placed. Correcting them meant discarding the authority of the very sources that had made the earlier map persuasive. The history of cartography is thus a history of whose testimony was trusted, not of what the land looked like.
```

문항 실물 (프로브 P0 에서 gate 0 재확인):

```md
번호지문:
Early modern cartographers rarely drew what they could see with their own eyes. [[1:Most of them worked from travelers' reports, merchant ledgers, and older maps that had themselves been copied many times.]] A coastline therefore recorded not a survey but a consensus among distant witnesses. [[2:When two accounts disagreed, the mapmaker had to decide which informant carried more authority.]] [[3:The authority of an informant was often visible in the ornament that surrounded the finished sheet, which collectors prized as a mark of workmanship.]] [[4:That decision was rarely announced on the finished sheet, so readers inherited a judgment they could not inspect.]] Blank interiors were filled with ornament precisely because emptiness invited awkward questions about the limits of the record. Later surveyors who carried instruments into those interiors often found the inherited outlines badly placed. [[5:Correcting them meant discarding the authority of the very sources that had made the earlier map persuasive.]] The history of cartography is thus a history of whose testimony was trusted, not of what the land looked like.

정답: ③
해설: 이 글은 지도의 윤곽선이 누구의 증언을 신뢰했는가의 기록이라는 논지를 일관되게 전개합니다. 장식이 수집가에게 세공의 표시로 평가받았다는 문장은 소재는 같지만 글이 다루는 신뢰와 권위의 논점에서 벗어나 흐름을 끊습니다.
오답:
① 지도 제작자가 어떤 자료를 바탕으로 작업했는지 밝혀 이후 논의의 전제를 세우는 문장입니다.
② 증언이 엇갈릴 때 누구의 권위를 택할지 판단해야 했다는 글의 핵심 문제를 도입합니다.
④ 그 판단이 지면에 드러나지 않았다는 결과를 이어받아 앞 문장의 논지를 확장합니다.
⑤ 후대의 수정이 기존 권위를 버리는 일이었다는 귀결로 논의를 마무리로 이끕니다.
```

### 2-4. 신규 검증본 — `qbank/work/_probe-IRRELEVANT.ts` (본 정찰이 새로 저작·통과시킨 5문항 유닛의 1번)

픽스처 재사용이 아니라 **임의 지문에서 골격이 성립한다는 증명**이다.
`parseAndGate`(gateIssues 0) → `adapt`(ok) → `postProcessQuestion`(warning 0) → `validateQuestionQuality`(error 0) 전 구간 통과.

지문(151단어 / 9문장):

```
Public clocks in early modern towns were set by whoever climbed the tower each morning. A sundial reading, a church bell, and a merchant's pocket watch could disagree by a quarter of an hour without anyone complaining. Local time was therefore a negotiated custom rather than a measured quantity. Railways made that tolerance expensive, because a timetable printed in one town had to be trusted in another. Companies answered by sending a single reference time along the same telegraph wires that carried their signals. Travellers who arrived by train soon found the station clock contradicting the clock in the market square. Town councils argued for years about which of the two deserved to be called correct. The dispute was settled less by astronomy than by the practical need to coordinate distant strangers. Standard time therefore records a change in whom people were willing to trust, not a discovery about the sun.
```

```md
번호지문:
Public clocks in early modern towns were set by whoever climbed the tower each morning. [[1:A sundial reading, a church bell, and a merchant's pocket watch could disagree by a quarter of an hour without anyone complaining.]] Local time was therefore a negotiated custom rather than a measured quantity. [[2:Railways made that tolerance expensive, because a timetable printed in one town had to be trusted in another.]] [[3:Printed timetables were themselves a profitable line of business, and a town that sold many of them could expect a steady return from travellers.]] Companies answered by sending a single reference time along the same telegraph wires that carried their signals. [[4:Travellers who arrived by train soon found the station clock contradicting the clock in the market square.]] Town councils argued for years about which of the two deserved to be called correct. [[5:The dispute was settled less by astronomy than by the practical need to coordinate distant strangers.]] Standard time therefore records a change in whom people were willing to trust, not a discovery about the sun.

정답: ③
해설: 이 글은 시간이 무엇으로 측정되느냐가 아니라 누구의 시계를 믿느냐의 문제였다는 논지를 일관되게 이어 갑니다. 인쇄된 시각표가 수익성 있는 사업이었다는 문장은 소재는 같지만 신뢰의 귀속이라는 논점 대신 상업적 수익을 평가해 흐름을 끊습니다.
오답:
① 해시계와 종과 회중시계가 서로 어긋나도 아무도 문제 삼지 않았다는 출발 상황을 제시해 뒤에 올 논의의 전제를 세웁니다.
② 철도가 그 관용을 비싸게 만들었다는 전환점을 알려 왜 통일된 시간이 필요해졌는지 설명합니다.
④ 역의 시계와 광장의 시계가 어긋난다는 사실을 여행자의 경험으로 구체화해 갈등을 눈에 보이게 만듭니다.
⑤ 그 다툼이 천문학이 아니라 낯선 사람들과의 조율 필요로 정리되었다는 귀결을 제시해 논지를 매듭짓습니다.
```

계측(프로브 실측): 지문겹침 6 · 표시문장겹침 5 · 비율 0.263 · 삽입문 145자(표시평균 112자 · 1.30배).

---

## 3. 파서 계약 (★ 가장 중요)

진입점 `parseMdIrrelevant(text)` — `parser-irrelevant.ts:208-254`.
**정본 규약**: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게. 관용은 **관용이지 계약이 아니다** —
§2-1 정규 형식을 그대로 쓰고 관용에 기대지 마라(qbank 저작 규칙 = 장식 0).

### 3-1. 머리표 문법 — 이 파서는 장식을 흡수한다 (다른 유형과 다름)

`parser-irrelevant.ts:46-58` 이 자체 관용 정규식을 갖고 있다. `decoration.ts` 를 import 하지는 않지만 같은 범위를 자체 구현했다.

```
KEY_LEAD = ^[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]+)?(?:\|[ \t]*)?(?:[-*•+][ \t]+)?(?:\*\*|__|\*)?[ \t]*
KEY_SEP  = [ \t]*(?:\*\*|__|\*)?[ \t]*[:：]\s*(?:\*\*|__|\*)?\s*
```
— `parser-irrelevant.ts:46,48`

| 머리표 | 리터럴 | 컴파일 정규식 | file:line |
|---|---|---|---|
| 번호지문 | `번호지문` | `PASSAGE_HEAD = KEY_LEAD + "번호지문" + KEY_SEP` | `:55` |
| 정답 | `정답` | `ANSWER_HEAD` | `:56` |
| 해설 | `해설` | `EXPLANATION_HEAD` | `:57` |
| 오답 | `오답` | `WRONG_HEAD` | `:58` |

- **흡수되는 것**: 앞 공백/탭 · 인용 `>`(중첩 가능) · 헤딩 `#`~`######` + 공백 · 표 파이프 `|` ·
  불릿 `- * • +` + 공백 · 굵게 `** __ *` · 콜론 앞뒤 공백 · **전각 콜론 `：`** · 콜론 뒤 개행.
- **흡수되지 않는 것**: 머리표 문자열 자체의 변형(`번호 지문:` `무관지문:` `모범답안:`) · 백틱.
- ⚠ `KEY_SEP` 끝의 `\s*` 가 개행을 먹으므로 `번호지문:` 뒤 개행 유무·`정답:` 값이 다음 줄로 내려간 형상 모두 파싱된다
  (`_test-md-irrelevant.ts:387-388,439`).
- **어기면**: 그 필드가 통째로 사라지고 게이트가 「번호지문 누락」·「정답 누락」이라는 **거짓 원인**을 지목한다.

### 3-2. 인라인 번호 마커 (★ 핵심 리터럴)

```js
INLINE_IRRELEVANT_MARK_RE = /\[\[\s*(\d{1,2})\s*[:：]((?:(?!\]\])[\s\S])+)\]\]/g
```
— `parser-irrelevant.ts:33-34`

| 규칙 | 상세 | 어기면 사라지는 것 |
|---|---|---|
| 라벨은 **숫자 1~2자리** | `[[A:...]]` 는 매치 실패 (라벨 축이 `[A-J]` 가 아니다) | 마커 전량 소실 → 「번호 마커 0개」 |
| 여는/닫는 대괄호는 **정확히 `[[` / `]]`** | 닫기를 빠뜨리면 뒤 마커까지 하나로 삼켜진다 | 개수 오류 + 인식 실패 지점 지목(`gate-irrelevant.ts:144-150`) |
| 구분자는 `:` 또는 **전각 `：`** | ASCII 전용이 아니다(`:33-34` 주석) | — |
| 마커 내부 공백 관용 | `[[ 3 : 문장 ]]` 도 매치 (`\s*`) | — |
| 본문은 `[\s\S]` tempered greedy | **개행을 넘는다**(PDF 붙여넣기 하드 개행 흡수) | — |
| 본문 안에 `]]` 를 쓸 수 없다 | `(?!\]\])` 가 첫 `]]` 앞에서 멈춘다 | 마커가 잘려 개수 오류 |
| 본문은 **최소 1자** | 빈 마커 `[[3:]]` 는 매치 실패 | 개수 오류 |
| 슬롯 텍스트는 `\s+`→`" "` 로 접힌다 | `collectIrrelevantMarks` (`:127`) | 저장 `sentences[]` 는 항상 한 줄 |
| **전역 정규식** | `matchAll`/`replace` 로만 쓴다 (`exec`/`test` 금지) | (파서 내부 규약) |

### 3-3. 정답 줄 · 라벨 정규화

```js
ANSWER_LINE_RE = new RegExp(`${ANSWER_HEAD}(.+)$`, "m")   // parser-irrelevant.ts:61 — 첫 매치만
```

값은 `normalizeIrrelevantLabel` 로 정규화된다 — `parser-irrelevant.ts:107-120`:

1. `CIRCLED_RANGE_RE = /[①-⑳]/` 를 **문자열 어디서든** 찾아 `codePoint - 0x245f` → `"1"~"20"` (`:76,110-113`)
2. 원문자가 없으면 `/^[^0-9]{0,4}?(\d{1,2})/` → 1~20 범위면 채택 (`:114-118`)
3. 둘 다 실패하면 `""` → 게이트 「정답 누락」

| 쓰면 되는 표기 | 결과 |
|---|---|
| `정답: ③` **(정규 형식)** | `"3"` |
| `정답: 3` · `정답: (3)` · `정답: 3번` · `정답: [3]` | `"3"` |
| `정답: ③번 문장` · `정답: ③ (수집가 평가로 새는 문장)` | `"3"` |
| ⚠ `정답: 무관한 문장은 3번입니다` | **`""`** — 숫자 앞 비숫자가 4자를 넘으면 실패 (원문자면 통과) |

**저장 축은 숫자 문자열 `"1"~"10"`, 학생 표면 축은 원문자 `①~⑩`** (`parser-irrelevant.ts:79-80`).

### 3-4. 번호지문 추출 (3단 폴백)

```js
NUMBERED_RE      = `${PASSAGE_HEAD}([\s\S]*?)(?=${ANSWER_HEAD}|${EXPLANATION_HEAD}|${WRONG_HEAD})`  // :62-65
NUMBERED_TAIL_RE = `${PASSAGE_HEAD}([\s\S]+)$`                                                      // :66
```

1. `번호지문:` ~ (`정답:`|`해설:`|`오답:`) 직전까지 — 첫 매치
2. 실패 시 `번호지문:` ~ 문서 끝
3. 머리표가 통째로 없으면 **`정답:` 앞 본문에 마커가 하나라도 있으면** 그것을 지문으로 채택 (`:216-219`)

→ 어기면(예: `번호지문:` 뒤에 `정답:`·`해설:`·`오답:` 로 시작하는 줄을 지문 안에 넣으면) 지문이 **거기서 잘린다.**

### 3-5. 해설 · 오답 섹션

```js
EXPLANATION_RE          = `${EXPLANATION_HEAD}([\s\S]*?)(?=${WRONG_HEAD})`   // :67-70
EXPLANATION_TAIL_RE     = `${EXPLANATION_HEAD}([\s\S]+)$`                    // :71
WRONG_SECTION_STRICT_RE = `${WRONG_HEAD}[ \t]*$`   (m)                       // :72  ← 오답: 단독 줄
WRONG_SECTION_LOOSE_RE  = WRONG_HEAD              (m)                        // :73  ← 폴백
WRONG_LINE_RE = /^\s*(?:>\s*)*\|?\s*(?:[-*•+]\s*)?(?:\*\*|__)?[([]?\s*([①-⑳]|\d{1,2})\s*[)\].：]?(?:\*\*|__)?\s*(.+)$/gm   // :199-200
```

- **오답 줄은 반드시 라벨(원문자 또는 숫자)로 시작**해야 줍힌다. 라벨 없는 산문 줄은 조용히 무시된다
  (`_test-md-irrelevant.ts:460-463`).
- 오답 항목 텍스트는 앞뒤 표 파이프를 벗긴다(`:230-234`).
- **오답 목록에 정답 번호를 끼우면 파서가 조용히 제거한다** (`.filter(w => w.label !== answer)` — `:238`).
  개수가 맞으면 게이트가 침묵하므로 **혼자 조용히 사라지는 유일한 축이다.**
- `해설:` 은 `오답:` 앞까지. `오답:` 이 없으면 문서 끝까지 삼킨다.

### 3-6. 첫 매치 규칙 · 1문서 1문항

`번호지문:` `정답:` `해설:` `오답:` 전부 **첫 매치만** 취한다(`m` 플래그, 전역 아님).
한 파일에 2문항 이상 넣으면 뒤 문항이 조용히 사라지거나 앞 문항을 오염시킨다(`00-contract.md` §3).
유닛 파일은 반드시 `<!-- ITEM n -->` 로 자른다.

### 3-7. 축자 대조의 두 축 (서로 다른 정규화 — 어디서 죽는지가 갈린다)

| 축 | 함수 | 무시하는 것 | 쓰는 곳 |
|---|---|---|---|
| `normalizeWs` | `parser.ts:67-74` | 곱슬따옴표→곧은 · en/em dash→`-` · `…`→`...` · 공백 축약 **만** | **게이트 #4 재구성 대조** (`gate-irrelevant.ts:182`) |
| `comparableIrrelevantSentence` | `parser-irrelevant.ts:257-259` | 위 + **대소문자** + **말미 종결부호** | 슬롯↔지문 문장 완전일치 판정 · 중복 판정 · 스냅 |

→ **대소문자를 바꾸면 재구성(#4)에서 죽고, 단어를 바꾸면 재구성과 슬롯 판정(#6) 양쪽에서 죽는다.**
원문 문자를 그대로 옮기는 것 외에 방법이 없다.

### 3-8. 0원 자동 보정 (autoSnap) — `parser-irrelevant.ts:288-348`

레인이 `parseAndGate` 안에서 자동 호출한다(`lane-irrelevant.ts:178-179`). 보정 3종:

| # | 보정 | 조건 | file:line |
|---|---|---|---|
| (1) | 번호 재부여 1..N | 라벨이 **오름차순이되** 1..N 이 아님(예: 2~6) + 정답 라벨이 슬롯 집합 안 → 슬롯·정답·오답·**번호지문 마커 라벨**을 함께 이동 | `:298-314` |
| (2) | 종결 부호 흡수 | 마커 안이 종결부호로 안 끝나고 마커 **바로 뒤**에 고아 부호가 있음 → 슬롯 텍스트로 흡수(번호지문은 안 건드림) | `:316-327` |
| (3) | 비정답 슬롯 축자 스냅 | 곱슬따옴표·대소문자·종결부호만 어긋난 슬롯을 지문 축자로 되돌림. **후보가 유일할 때만** | `:329-345` |

> ⚠ **(3) 은 정답 슬롯에 절대 적용되지 않는다** (`:338`) — 삽입 문장이 지문 문장으로 둔갑하면
> 「삽입문 신규성」 게이트가 무력화되기 때문이다.
> ⚠ 보정이 발생하면 `corrections[]` 에 남고 하네스가 `AUTOSNAP` 경고로 기록한다(`qgen-core.ts:313`).
> **스냅에 기대지 마라 — 처음부터 축자로 써라.**

---

## 4. 게이트 체크리스트

진입점 `gateMdIrrelevant(q, passage, {slotCount?, difficulty?, requireWrong?})` — `gate-irrelevant.ts:129-313`.
레인이 여기에 **지문 대조 적격성**과 **교사 지정 준수**를 더한다(`lane-irrelevant.ts:177-204`). **빈 배열 = 클린.**

> #0~#1 은 **즉시 return** 이다 — 하나 걸리면 나머지 진단이 아예 나오지 않는다.

### 4-1. 레인 선행 축 (`lane-irrelevant.ts`)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선택지 수 {N}개는 이 지문으로 만들 수 없다 — 무관한 문장 유형은 첫 문장을 선지에서 제외하므로, 원문 문장이 최소 5개 이상이어야 합니다. 현재 지문은 {n}문장입니다.` | 지문 문장수−1 < 4 — **단독 반려**(다른 진단 전부 억제) | `lane-irrelevant.ts:182-191` · `question-type-generation-settings/irrelevant.ts:51-58` |
| `선택지 수 {N}개는 이 지문으로 만들 수 없다 — 이 지문은 첫 문장을 제외하면 원문 {m}문장을 사용할 수 있어 선택지 {N}개로 만들 수 없습니다. 선택지 수를 {m+1}개 이하로 줄이거나 더 긴 지문을 선택해 주세요.` | 지문 문장수−1 < N−1 — **단독 반려** | 〃 · `irrelevant.ts:59-66` |
| `교사 지정 문장이 번호 슬롯에 없음: '{...}'` | `ctx.teacherPoints` 의 문장이 어느 슬롯과도 겹치지 않음 (지문 첫 문장이면 **판정 불가로 통과** + 보정 기록) | `lane-irrelevant.ts:75-96` |

### 4-2. 형식 축 (`gate-irrelevant.ts`)

| # | 사유 문자열 | 조건 | file:line |
|---|---|---|---|
| #1 | `번호지문 누락` | `!q.numberedPassage` — **즉시 return** | `:140` |
| #1 | `번호 마커 {n}개 ({N}개 필요)` | 마커 수 ≠ slotCount — **즉시 return** | `:142-143,146-150` |
| #1 | `번호 마커 {n}개 ({N}개 필요) — '[[' 는 {a}곳인데 {b}곳만 마커로 인식됐다. 인식 실패 지점: '{snippet}' (마커는 '[[번호:문장 전체]]' 형식이어야 하고 반드시 ']]' 로 닫아야 한다)` | 위 + 인식 실패한 `[[` 존재 | `:144-149` · `parser-irrelevant.ts:139-153` |
| #1 | `번호 문장 {n}개 ({N}개 필요)` | 슬롯 수 ≠ slotCount — **즉시 return** | `:152-154` |
| #2 | `번호가 지문 등장순 1~{N} 가 아님 — 실제 {labels\|없음}` | 라벨 연결 ≠ `1,2,…,N` | `:156-163` |
| #3 | `정답 누락 — 무관 문장의 번호를 \`정답:\` 줄에 적어라` | `!q.answer` | `:167-168` |
| #3 | `정답 번호({X})가 번호 문장에 없음` | 정답 라벨의 슬롯 부재 | `:169-170` |
| #3 | `정답이 첫/마지막 번호({X}번) — 무관 문장은 가운데 번호(2~{N-1})에 넣어라` | answerIndex 0 또는 N−1 | `:171-176` |
| **#4** | `지문 재구성 불일치 — 무관 문장을 들어낸 번호지문이 원 지문과 다름(마커 밖 텍스트를 고쳤거나 원문 문장을 지웠거나 표시 문장을 변형함)` | `normalizeWs(rebuilt) !== normalizeWs(passage)` | `:180-187` |
| #5 | `{L}번 문장 누락` | 슬롯 텍스트 빈 값 | `:201-204` |
| #5 | `{L}번 문장이 다른 번호와 중복` | `comparableIrrelevantSentence` 동일 | `:205-207` |
| #5 | `{L}번이 문장 하나가 아님(두 문장을 이어붙였거나, 종결 부호가 빠졌거나, 문장 안에 약어·소수점 마침표(Dr. · U.S. · 3.5)가 있어 시스템이 경계를 잡지 못함): '{...60자}' — {행동}` | 종결부호로 안 끝나거나 `splitPassageSentences(text,{includeShort:true}).length !== 1` · 행동은 정답 슬롯이면 `무관 문장은 한 문장이어야 한다 — 약어·소수점 마침표를 피해 다시 써라`, 아니면 `후자라면 그 문장은 표시 대상에서 빼고 다른 문장을 골라라` | `:101-104,209-219` |
| #6 | `{L}번이 지문 축자 문장이 아님(요약·패러프레이즈·결합 금지): '{...60자}'` | 비정답 슬롯이 문장 풀에 완전일치도 부분일치도 없음 | `:225-232` |
| #6 | `{L}번이 지문 문장 경계와 어긋남 — 축자이긴 하나 문장 안에 약어·소수점 마침표(Dr. · U.S. · 3.5)가 있어 시스템이 이 문장을 하나로 자르지 못한다. 이 문장은 표시 대상에서 빼고 다른 문장을 골라라: '{...60자}'` | 완전일치 실패 + 부분일치 성공 | `:114-126,228-232` |
| #6 | `{L}번이 지문 첫 문장 — 도입문은 판단 기준점이라 번호를 붙이면 안 된다` | 매칭 인덱스 0 | `:237-241` |
| #6 | `표시 문장이 원문 등장 순서가 아님 — 번호는 지문에 나온 순서대로 붙여라` | 매칭 인덱스가 비오름차순 (전 슬롯 매칭 성공 시에만) | `:243-248` |
| #7 | `표시 문장이 지문 앞쪽에 몰려 있음 — 지문 뒤쪽 1/3(문장 {k}번 이후)에서 최소 1문장을 표시하라` | **지문 8문장 이상**일 때만 · `max(sourceIndices) < floor(len*2/3)` | `:250-258` |
| #8 | `무관 문장 바로 앞 문장에 번호가 없음 — 앞 문장도 표시 문장이어야 한다(사이 텍스트: '{...60자}')` | 정답 마커 직전 마커와 정답 마커 사이 텍스트가 `/^[\s.!?"'”’)\]]*$/` 불통과 | `:266-280` |
| #9 | `해설 누락` | `!q.explanation` | `:284-285` |
| #9 | `해설 본문이 문장을 번호(①②③)로 지칭함 — 번호가 어긋나면 문항이 무효가 된다. 내용 인용으로 지칭하라` | 해설에 `/[①-⑳]/` | `:83,286-290` |
| #9 | `오답해설 {n}개 ({N-1}개 필요)` | `requireWrong` 기본 true | `:292-296` |
| #9 | `오답해설이 없는 번호: {labels}` | 정답 제외 라벨 중 누락 | `:297-303` |
| #9 | `오답해설 본문이 문장을 번호(①②③)로 지칭함 — 내용 인용으로 지칭하라` | 오답해설에 `/[①-⑳]/` | `:304-306` |
| #9 | `오답해설에 정답 번호 포함` | 파서 필터를 우회한 경우 | `:308-310` |

### 4-3. 삽입 문장 축 (`gateInsertedSentence` — `:320-411`) · 난이도 무관

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `정답 자리 문장이 지문에 이미 있는 문장임 — 무관 문장은 네가 새로 쓴 문장이어야 한다` | `containsComparableSentence(passage, inserted)` (정규화 후 20자 이상 부분문자열) | `:330-334` · `core.ts:448-452` |
| `무관 문장이 지문과 내용어를 거의 공유하지 않음(지문 {p}개·표시문장 {s}개, 지문 2개·표시문장 1개 이상 필요) — 주변 문장의 단어를 재사용해 표면을 위장하라` | `passageOverlap < 2 \|\| sourceOverlap < 1` | `:336-351` |
| `무관 문장 길이가 주변 문장과 어긋남({n}자 · 표시문장 평균 {m}자) — 길이·문체를 맞춰라` | `len < avg*0.45 \|\| len > avg*1.8` (문자 수) | `:353-363` |
| `무관 문장이 역접 연결어로 시작함 — 훑어읽기만으로 들킨다. 같은 방향인 척하는 문장으로 다시 써라` | `/^\s*(however\|yet\|instead\|in\s+contrast\|on\s+the\s+contrary\|conversely\|nevertheless\|nonetheless)\b/i` | `:365-370` |

### 4-4. 삽입 문장 축 — **KILLER 전용** (`difficulty !== "KILLER"` 이면 전부 침묵 — `:372`)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `무관 문장에 새 어휘가 너무 많음(표시문장과 겹치는 비율 {r} < 0.10) — 재료를 지문에서 빌려 와라` | `sourceOverlap / insertedTokens.size < 0.10` | `:378-383` |
| `무관 문장에 지문에 없는 극단어 사용: '{cue}'` | `always never everyone everybody completely entirely guarantees guarantee guaranteed ensures` 중 지문에 없는 것 | `:385-386` · `validators/irrelevant.ts:514-525` |
| `무관 문장이 노골적 반론 단서로 노출됨: '{cue}'` | `however instead "rather than" "by contrast" "on the contrary" nevertheless nonetheless` + backlash 6패턴 중 지문에 없는 것 | `:388-389` · `validators/irrelevant.ts:529-576` |
| `무관 문장이 처방·조언 단서로 노출됨: '{cue}'` | `^to maximize` · `should actively/prioritize/secure/protect/build` · `should focus\|concentrate\|work on` · `encourage researchers` · `develop … relationships with … sponsors` · `must avoid` · `ought to` | `:391-392` · `validators/irrelevant.ts:580-599` |
| `무관 문장이 '주체 + must/should/need to' 조언문 — 서술 지문의 어투에서 벗어나 즉시 들킨다` | `ADVICE_CUE_RE` 매치 + 지문에 `must\|should\|ought to` 없음 | `:51-53,394-398` |
| `무관 문장이 방법론·측정·도구 화제로 샘: '{label}'` | **9패턴** (`METHODOLOGY_DRIFT_PATTERNS`, 프로덕션과 문자 그대로 동일) 중 지문에 없는 것 | `:70-80,400-403` |
| `무관 문장이 지문에 없는 새 무대·소재를 끌어옴: '{cue}'` | `advertising advertisement application apps class classes device devices digital photo photos restaurant restaurants school shopping software sports technologies technology traffic vehicle vehicles weather` 중 지문에 없는 것 | `:405-408` · `validators/irrelevant.ts:603-633` |

**방법론 드리프트 9패턴 전문** (`gate-irrelevant.ts:70-80`):

```
procedure/process requires        /\b(?:the\s+)?(?:procedure|process|method|technique|protocol|system|approach)\s+(?:requires|involves|demands|entails|relies\s+on|depends\s+on)\b/i
it is essential/necessary to      /\bit\s+is\s+(?:essential|necessary|crucial|vital|important|imperative)\s+to\b/i
methodology gerund lead           /^(?:in\s+\w+,?\s+|while\s+[^,]+,\s+)?(?:measuring|optimi[sz]ing|calculating|quantifying|standardi[sz]ing|categori[sz]ing|catalogu?ing|indexing|monitoring|storing|organi[sz]ing|tracking)\b/i
to measure/optimize/...           /\bto\s+(?:measure|optimi[sz]e|calculate|quantify|standardi[sz]e|categori[sz]e|monitor|index|catalog|track)\b/i
measure/track the precise/exact   /\b(?:measure|track|calculate|monitor|quantify)\s+(?:the\s+)?(?:precise|exact|accurate)\b/i
requires precise/sufficient/...   /\brequires?\s+(?:the\s+)?(?:precise|exact|sufficient|accurate|advanced|specialized|highly|careful)\b/i
laboratory/equipment drift        /\b(?:laborator|lab)\w*\s+(?:equipment|procedures?|techniques?|settings?)\b/i
automated tracking/tooling        /\bautomat(?:ed|ically)\s+(?:track|monitor|catalog|index|record)\w*\b/i
develop/build tools/equipment     /\b(?:develop|building|build|design|implement|install)\w*\s+\w*\s*(?:tools?|equipment|software|systems?|infrastructure|mechanisms?|tutorials?|dashboards?|devices?)\b/i
```

### 4-5. 어댑터 자체 반려 (게이트를 통과해도 여기서 죽는다)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `번호 문장 {n}개 (5~10개 필요)` | 슬롯 수 범위 밖 | `adapter-irrelevant.ts:33-41` |
| `정답 번호가 번호 문장에 없음` | 〃 | `:43-45` |
| `정답이 첫/마지막 번호 — 무관 문장은 가운데여야 한다` | 후처리 강제 재배치 차단 | `:49-51` |
| `빈 번호 문장이 있음` | 〃 | `:52-55` |

### 4-6. qbank 하네스 추가 축 — `validateQuestionQuality` **error** (프로덕션은 비차단, 우리는 차단)

`qgen-core.ts:279-293` 이 error 를 `qualityBlocking` 으로 올린다. IRRELEVANT 는 `filterQualityIssues` 를 정의하지 않으므로 **전량 통과**한다.

| 코드 | 조건 | md 게이트와의 차이 | file:line |
|---|---|---|---|
| **`irrelevant-too-many-new-terms`** | **KILLER** · `sourceOverlap / insertedTokens.size < 0.25` | ★ **md 게이트 하한은 0.10** — 그 사이 밴드는 웹에선 저장되고 qbank 에선 죽는다 (프로브 E16 실증) | `validators/irrelevant.ts:178-184` |
| `irrelevant-source-not-verbatim` | 비정답 슬롯이 지문 문장과 대조 불가 | md #6 보다 **느슨**(부분일치 허용) | `:99-104` |
| `irrelevant-source-first-sentence` | 첫 문장이 번호 슬롯 | md #6 과 동일 | `:108-114` |
| `irrelevant-source-order` | 원문 순서 위반 | md #6 과 동일 | `:132-138` |
| `irrelevant-answer-from-source` | 삽입문이 지문에 실재 | md 와 동일 함수 | `:142-148` |
| `irrelevant-index-edge` / `-index-range` / `-answer-index-mismatch` | 정답 위치·인덱스 | 어댑터가 선차단 | `:33-52` |
| `irrelevant-answer-desync` | 해설/keyPoints 산문의 원문자 주장이 정답과 불일치 · 오답해설 맵이 정답 라벨 포함 · 렌더 마커가 삽입문을 안 감쌈 | md #9(원문자 금지)가 선차단 | `:306-396` |
| `irrelevant-marking-count-mismatch` / `-nonconsecutive-marking` / `-marking-sentence-desync` | 후처리 렌더 `passageWithNumbers` 파손 | 설계가 정합이면 발화 안 함 | `:428-484` |
| `irrelevant-inserted-ungrammatical` | KILLER · `/allow(s\|ed\|ing)? \w+ to active/i` | md 에 없음 | `:210-216` |
| `irrelevant-obvious-extreme-cue` · `-prescriptive-advice` · `-methodology-drift` · `-absent-external-setting` | KILLER | md 와 동일 조건 | `:218-291` |
| `explanation-foreign-script` | 해설 계열에 한자·가나·중문 구두점(한글 직후 괄호 병기만 예외) | md 에 없음 | `validators/explanation-foreign-text.ts:32,97-104` |
| `explanation-latin-jam` | 해설에 `[a-z]{2,}다` 짜깁기(`steals다`) | md 에 없음 | `explanation-foreign-text.ts:39-41,105-112` |
| `explanation-quoted-token-missing` | 해설이 따옴표로 인용한 **영어 12자 이상 조각**이 문항 표면·지문에 없음 | md 에 없음 | `validators/explanation-quoted-tokens.ts:37,143-160` |

> ### ⚠ **error → warning 강등 목록** (`core.ts:31-62` `SHIP_FIRST_WARNING_CODES`)
> `irrelevant-too-unrelated` · `irrelevant-obvious-counterclaim-cue` · `irrelevant-prescriptive-giveaway`
> 이 셋은 검증기에서 **warning 으로 강등**되어 qbank 에서도 차단하지 않는다.
> → **이 세 축의 유일한 차단자는 md 게이트다**(프로브 E17 실증). 반대로 `irrelevant-too-many-new-terms` 는
> 강등 목록에서 **의도적으로 제외**됐다(`core.ts:26-27`).
>
> 비차단 warning: `irrelevant-option-labels` · `irrelevant-weak-local-trap`(KILLER 인접 문장 겹침 0) ·
> `irrelevant-style-length-mismatch`(md 에서는 error).

---

## 5. adapter 산출 필드

`adaptMdIrrelevantToAiQuestion(q, passage, difficulty)` — `adapter-irrelevant.ts:28-90`.
**후처리 `processIrrelevant` 가 있으므로 어댑터 산출은 최종 형상이 아니다.**

### 5-1. 어댑터가 만드는 것

| 키 | 값 | 근거 |
|---|---|---|
| `direction` | `"다음 글에서 전체 흐름과 관계 없는 문장은?"` (stemLanguage=en 이면 `"Which sentence does NOT fit in the overall flow of the passage?"`) | `adapter-irrelevant.ts:23,76` · `lane-irrelevant.ts:35-36,213-218` |
| **`sentences[]`** | 슬롯 텍스트를 **번호 순서 그대로**(지문 등장 순). 무관 문장 포함. 비정답은 지문 축자 | `:52` |
| **`irrelevantIndex`** | 삽입 문장의 **0-based** 슬롯 인덱스 | `:43,78` |
| `correctAnswer` | `String(irrelevantIndex + 1)` — 숫자 문자열 | `:80` |
| `wrongOptionExplanations` | `[{label:"1"…"N", explanation}]` — **숫자 문자열 라벨**(후처리 조회 축). 정답 인덱스 제외, 빈 해설 제외 | `:60-71` |
| `explanation` | 한국어 해설 원문 | `:82` |
| `keyPoints` | **항상 `[]`** — 합성 금지 | `:83-85` |
| `tags` | `[]` | `:86` |
| `difficulty` | `ctx.rawDifficulty` 그대로 | `:87` |

> ⚠ **`options` 와 `passageWithNumbers` 를 만들면 안 된다** — 후처리가 전량 재생성하므로 이중 생성이고,
> 어긋나면 마킹 desync 검증기가 error 를 찍는다(`adapter-irrelevant.ts:11-13`).
> ⚠ 빈칸 계열 이물 필드(`blanks`·`passageWithBlank`·`originalExpression`) 금지(`:16`).

### 5-2. 후처리가 만드는 것 → 이것이 `structuredData` (`processors/irrelevant.ts:275-294`)

| 키 | 값 | 근거 |
|---|---|---|
| `sentences[]` | **축자 스냅 후**(융합 복구·프리픽스 확장·구두점 스냅). 어댑터 값과 달라질 수 있다 | `:170-233` |
| `irrelevantIndex` | 엣지 재배치·인트로 제거 반영된 **재정렬 값** | `:141-168,287` |
| `correctAnswer` | **원문자** `①`~`⑩` (`getCircledNumbers`) | `:255,288` |
| **`options[]`** | `{label:"①", text:"①"}` … — **라벨 = 텍스트 = 원문자** (내용 없는 번호 선지) | `:250-254,289` |
| `wrongOptionExplanations` | `Record<"①"\|"②"…, string>` — **원문자 키로 재정렬**. 누락 키는 기본 문구로 덮인다 | `:353-372,290` |
| **`passageWithNumbers`** | 원문 위치에 `① __문장__` 렌더 + 무관 문장을 직전 슬롯 뒤에 삽입. **번호 안 붙은 원문 문장도 전부 남는다** | `:306-336,291` |

**이 유형에만 있는 필드**: `sentences[]` · `irrelevantIndex` · `passageWithNumbers`.
**선지 셔플 없음** — `IRRELEVANT` 는 `SHUFFLE_OPTION_TYPES` 에 없다(`question-diversity.ts:508-522`).
→ **정답 번호 위치는 저작자가 결정하는 축이다.**

**후처리 경고가 나오면 설계가 어긋난 것이다**(프로브 P2 는 경고 0을 요구한다):
`… was placed at an edge; moved to numbered slot N` · `… included the original first passage sentence; removed it` ·
`slot N fused multiple original sentences` · `slot N drifted from original` · `slot N has no close passage match`.

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `IRRELEVANT.slotCount` | number | `5` | `5~10` (`clampIrrelevantMdSlotCount` — 반올림 후 min/max) | **★ 유일하게 md 형상을 바꾸는 노브.** 마커 개수 = N, 표시 원문 = N−1, 오답해설 = N−1, 정답 가능 위치 = 2~N−1. **지문 문장수 ≥ N 필요** | 
| `IRRELEVANT.pointFocus` | boolean | `false` | — | md 형상 무변경. 프롬프트 extras 에 무관성 유형 코어 2종 가이드 주입(`lane-irrelevant.ts:158-167` · `irrelevant-point-catalog.ts:135-166`) |
| `IRRELEVANT.stemLanguage` | `"ko"\|"en"` | `"ko"` | — | md 형상 무변경. 어댑터가 `direction` 을 영어로 교체(`lane-irrelevant.ts:213-218`) |
| `IRRELEVANT.optionLanguage` | `"ko"\|"en"` | `"ko"` | — | md 형상 무변경. 선지가 원문자뿐이라 사실상 무효. `qualityArgs` 로만 전달(`lane-irrelevant.ts:222-228`) |
| `difficulty` | `BASIC\|INTERMEDIATE\|KILLER` | — | — | md 형상 무변경. **게이트 4-4 전체가 KILLER 에서만 켜진다** + 프롬프트 표적 설계 3분기(`prompts-irrelevant.ts:48-62`) |
| `teacherPoints` | `{text, unit}[]` | `[]` | — | md 형상 무변경. 지정 문장이 번호 슬롯 중 하나와 겹쳐야 한다(첫 문장이면 면제) |
| `variantIndex` / `variantCount` | number | `0` / `1` | — | md 형상 무변경. pointFocus + variantCount>1 이면 코어 무관성 유형을 회전 지정 |

관련 상수: `IRRELEVANT_MD_SLOT_COUNT_MIN/MAX = 5/10` (`prompts-irrelevant.ts:21-22`) ·
`IRRELEVANT_SLOT_COUNT_DEFAULT = 5` (`question-type-generation-settings/irrelevant.ts:11`) ·
`IRRELEVANT_ADAPT_SLOT_MIN/MAX = 5/10` (`adapter-irrelevant.ts:25-26`) ·
`isEligible` 은 5~10 만 승차시킨다(`lane-irrelevant.ts:140-150`).

**형식 고정 상수 (노브가 아니다)**: 첫 문장 번호 금지 · 정답은 가운데만 · 오답해설 = N−1 · 삽입 문장 1개 ·
길이 0.45~1.8배 · 지문 겹침 ≥2 · 표시문장 겹침 ≥1(md) / ≥2(품질 warning) · KILLER 비율 ≥0.10(md) / ≥0.25(품질 error).

---

## 7. 함정 (전부 코드 근거 또는 프로브 실증)

**7-1. 이 유형은 "교체"가 아니라 "삽입"이다.**
원문 문장 하나를 무관 문장으로 갈아 끼우면 게이트 #4 가 「지문 재구성 불일치」로 잡는다
(`gate-irrelevant.ts:180-187`). 후처리는 교체된 원문 문장을 지우지 않으므로 md 설계와 학생 표면이
어긋난다(`prompts-irrelevant.ts:11-15`). **번호지문에는 원 지문의 모든 문장이 살아 있어야 한다.**

**7-2. 마커 밖 지문은 한 글자도 못 바꾼다. 마커 안 표시 문장도 마찬가지다.**
프로브 실증: `therefore`→`thus` 한 단어 · `church bell`→`chapel bell` 한 단어 → 둘 다 「지문 재구성 불일치」.
`normalizeWs` 가 흡수하는 것은 곱슬따옴표·en/em dash·`…`·공백뿐이다(`parser.ts:67-74`).
**대소문자도 흡수하지 않는다.**

**7-3. 무관 문장 바로 앞 문장에 번호를 안 붙이면 반려된다(#8).**
후처리 `buildSpreadMarkedPassage` 는 무관 문장을 **"직전 슬롯의 원문 위치" 뒤**에 끼우므로, 앵커가 없으면
설계한 자리와 렌더 자리가 어긋난다(`processors/irrelevant.ts:318,331-333`). 프로브 E4 실증.

**7-4. 지문 첫 문장은 번호 슬롯이 될 수 없다.**
md 게이트 #6 + 프로덕션 `irrelevant-source-first-sentence` 이중 차단. 후처리는 아예 슬롯에서 **제거**해 버린다
(`processors/irrelevant.ts:152-168`). → 슬롯 N개면 **지문 문장이 최소 N개**(첫 문장 제외 N−1개) 필요하다.

**7-5. 정답은 첫/마지막 번호가 될 수 없다.**
md 게이트 #3 + 어댑터 + 품질 `irrelevant-index-edge` **3중 차단**. 후처리는 강제로 가운데로 옮기며 경고를 남긴다
(`processors/irrelevant.ts:141-150`) — 그 재배치는 설계를 깨므로 앞단이 전부 막는다.
→ slotCount 5 면 정답 가능 위치는 **②③④ 3개뿐**이다.

**7-6. 약어·소수점 마침표가 든 문장은 표시 대상에서 빼라.**
`splitPassageSentences` 가 `Dr.` `U.S.` `3.5` 에서 문장을 쪼갠다(`passage-sentence-utils.ts:6`).
그 문장을 번호로 감싸면 축자여도 「문장 하나가 아님」 또는 「지문 문장 경계와 어긋남」으로 반려된다
(`gate-irrelevant.ts:96-104,228-232`, 회귀 `_test-md-irrelevant.ts:820-907`).
반려가 옳다 — 통과시키면 후처리가 슬롯을 `"When two accounts disagreed, Dr."` 로 잘라 학생에게 내보낸다.

**7-7. 표시 문장을 앞부분에 몰아 고르면 반려된다(#7).**
지문 8문장 이상이면 **뒤쪽 1/3**(`floor(len*2/3)` 이후)에서 최소 1문장을 표시해야 한다
(`gate-irrelevant.ts:250-258`). 프로브 E5 실증.

**7-8. 해설·오답해설에 원문자를 쓰면 즉사한다.**
`"무관한 문장은 ③번입니다"` → 「해설 본문이 문장을 번호(①②③)로 지칭함」(`gate-irrelevant.ts:83,286-290`).
실측 최다 결함이다. **문장은 내용 인용으로 지칭하라.** 줄 맨 앞의 오답 라벨은 형식이므로 예외다.

**7-9. 오답 목록에 정답 번호를 끼우면 파서가 조용히 지운다.**
`parser-irrelevant.ts:238` 의 필터가 제거하고, 나머지 개수가 맞으면 **게이트는 침묵한다**(프로브 E8 실증).
반대로 오답 한 줄을 빠뜨리면 「오답해설이 없는 번호: 5」로 정확히 지목된다.

**7-10. ★ KILLER 어휘 비율 — md 게이트 0.10, 품질 검증기 0.25.**
그 사이 밴드(0.10 ≤ ratio < 0.25)는 **md 게이트를 통과하고 웹에선 저장되지만 qbank 하네스에서는
`irrelevant-too-many-new-terms` 로 죽는다**(프로브 E16 실증 · `gate-irrelevant.ts:378-383` vs
`validators/irrelevant.ts:178-184`).
→ **KILLER 삽입 문장은 표시 문장과 겹치는 내용어 비율이 0.25 이상**이어야 한다.
프로브 정상본 실측: 0.263 / 0.474 / 0.333 / 0.450 / 0.368.

**7-11. 반대로 `irrelevant-too-unrelated` 는 품질 error 가 아니다.**
`SHIP_FIRST_WARNING_CODES` 강등 대상(`core.ts:31,47`). 표시문장 겹침 1개짜리 문항은 md 게이트를
통과하고 품질 검증기도 통과한다(프로브 E17 실증) — **md 게이트의 `sourceOverlap ≥ 1` 이 유일한 방어선이다.**
헌법 §3-7(소재 구속)을 지켜 실제로는 3~4개 이상 겹치게 써라.

**7-12. 역접 연결어로 시작하면 난이도 무관 즉사.**
`However / Yet / Instead / In contrast / On the contrary / Conversely / Nevertheless / Nonetheless`
(`gate-irrelevant.ts:366`). 실측 fatal — "However + 반대 주장"은 훑기만으로 걸린다.
**무관 문장은 지문과 같은 방향인 척해야 한다.**

**7-13. KILLER 에서 방법론·측정·도구 화제로 새면 즉사.**
9패턴 전량이 프로덕션과 문자 그대로 동일하다(`gate-irrelevant.ts:70-80`).
`"To measure …, the procedure requires …"` 류가 실측 최빈 자동탈락 패턴이다. 프로브 E14 실증.
BASIC/INTERMEDIATE 에서는 침묵하지만 **품질이 나빠지는 것은 같으므로 전 난이도에서 금지하라.**

**7-14. KILLER 에서 지문에 없는 새 무대 명사(software/school/traffic/…)를 쓰면 즉사.**
22개 큐 목록(`validators/irrelevant.ts:603-628`). 프로브 E15 실증.

**7-15. 삽입 문장 길이는 표시 문장 평균의 0.45~1.8배(문자 수).**
너무 짧으면 「길이가 주변 문장과 어긋남」(프로브 E12). 프로브 정상본 실측 1.24~1.50배.

**7-16. 삽입 문장은 정확히 한 문장이어야 한다.**
두 문장으로 쓰거나 약어·소수점 마침표를 넣으면 「{L}번이 문장 하나가 아님 … 무관 문장은 한 문장이어야 한다
— 약어·소수점 마침표를 피해 다시 써라」(`gate-irrelevant.ts:213-219`).

**7-17. 해설은 한국어·합니다체. 영어 인용은 지문에 실재하는 12자 이상 조각만.**
`explanation-foreign-script`(한자·가나) · `explanation-latin-jam`(`steals다`) ·
`explanation-quoted-token-missing`(환각 인용) 3종이 qbank 에서 차단된다.

**7-18. 유닛 내 두 문항이 같은 무관 문장을 쓰면 `ANSWER_DUPLICATE`.**
`diversityTargets` 가 삽입 문장 앞 90자를 표적으로 낸다(`lane-irrelevant.ts:246-253`).
정규화(`소문자 + 비문자/숫자 → 공백`)가 걸리므로 구두점만 바꾼 재사용도 잡힌다. 프로브 P2-b 실증.

**7-19. 지문이 짧으면 이 유형을 배정하지 마라.**
5문장 지문은 슬롯 5개를 만들 수는 있지만 **첫 문장 외 4문장 전부**를 번호로 감싸야 해서 표시 문장 선택의
자유도가 0이 된다 — 5~8문항이 전부 "같은 4문장 + 다른 삽입문"이 되어 다각화가 붕괴한다.
**실무 하한은 8문장 / 130단어**(그래야 §8-B1 이 성립한다).

---

## 8. 출제 포인트 다각화 축

> 한 지문에서 5~8문항. 이 유형의 다각화는 **"어디에 · 어떤 방식으로 무관 문장을 심는가"** 가 전부다.
> 지문이 고정이고 선지가 번호뿐이므로, **삽입 자리 · 무관성 기제 · 표시 문장 조합 · 정답 위치**가 문항의 실체다.
> **같은 자리에 같은 기제로 심으면 그건 5개 문항이 아니라 1개의 5개 사본이다.**

### 8-A. 노브로 달라지는 축 (코드 근거 있음)

| 축 | 값 | 근거 | 다각화 효과 |
|---|---|---|---|
| **A1. 슬롯 수** | `slotCount` 5~10 | `lane-irrelevant.ts:140-150` · `prompts-irrelevant.ts:21-22` | **가장 큰 표층 축.** 5 = 표시 원문 4개(선택 자유도 높음), 7~8 = 지문 대부분이 번호로 덮여 "번호 안 붙은 문장"이 희소해지고 학생이 **번호 문장끼리의 논리 사슬만으로** 판정해야 한다. 지문 문장수 ≥ N 필요 |
| **A2. 난이도** | `BASIC` / `INTERMEDIATE` / `KILLER` | `prompts-irrelevant.ts:48-62` · `gate-irrelevant.ts:372` | **게이트 강도가 실제로 달라진다.** KILLER 는 어휘비율 0.25(품질) + 극단어·반론·처방·조언·방법론·새무대 6종 큐 차단이 추가로 켜진다. 유닛 배분: 5문항 = B1/I2/K2, 8문항 = B2/I3/K3 (헌법 §4) |
| **A3. 무관성 유형 focus** | `pointFocus` + `variantIndex` 회전 | `irrelevant-point-catalog.ts:111-117,135-166` | 기출 227문항 LLM 검증 분포 기반 코어 2종을 **문항마다 돌려 지정** |
| **A4. 발문 언어** | `stemLanguage` ko/en | `lane-irrelevant.ts:169-173,213-218` | 표층 형식 축(헌법 §7-5). 유닛에 1~2문항만 en 배치 가능 |

### 8-B. 설계로 달라지는 축 (교육적 판단 — 여기가 진짜 승부처)

**B1. 삽입 좌표 (★ 최우선 축)**
같은 지문이라도 **"어느 두 원문 문장 사이에 심는가"** 에 따라 완전히 다른 문항이 된다.
학생이 검산해야 하는 이음매가 통째로 옮겨가기 때문이다.

| 자리 | 학생이 하는 일 | 난이도 경향 |
|---|---|---|
| 도입 직후 (통념 제시 뒤) | 아직 논지가 확정되지 않은 상태에서 "이게 논지인가 곁가지인가"를 판단 | 높음 — 판정 기준이 아직 없다 |
| 전환점 앞뒤 (문제 제기 ↔ 해결) | 전환의 방향을 읽어야 함. 전환 문장 자체를 흉내 낸 문장이 최강 미끼 | 높음 |
| 기제 설명 중간 | 인과 사슬 한 칸이 비는지 판정 | 중간 |
| 사례·구체화 구간 | "또 하나의 사례처럼 보이는 다른 사례" | 낮음~중간 |
| 결론 직전 | 결론이 무엇에서 도출되는지 역추적 | 중간 |

> ⚠ **삽입 좌표는 표시 문장 조합과 연동된다** — 무관 문장 바로 앞 문장은 반드시 번호를 붙여야 하므로(#8),
> 삽입 자리를 옮기면 표시 문장 집합도 함께 바뀐다.

**B2. 무관성 기제 (`irrelevant-point-catalog.ts` — EBSi 기출 227문항 LLM 전수 분류, 2026-06-18)**

| 코드 | 이름 | 기출 비중 | tier | 설계 신호 |
|---|---|---|---|---|
| `topic_intrusion` | 주제 침입 | **63%** | core | 글의 핵심 소재와 **다른 화제**를 끌어들이되 인접 문장의 내용어 3~4개는 재사용해 위장 |
| `scope_shift` | 범위 이탈 | **20.3%** | core | 소재는 그대로, 글이 논증하는 **측면**만 다른 측면으로 이동(정확성 논하는 글에서 비용을 평가) |
| `contrast_misuse` | 대조 오용 | 6.2% | secondary | 글이 옹호하는 주장의 **정반대 입장**. 단 역접어 금지(#4-3) — 내용으로만 충돌 |
| `causal_mismatch` | 인과 오류 | 5.7% | rare | `As a result/Therefore` 로 잇되 도출 결론이 따라 나오지 않음 |
| `conclusion_mismatch` | 결론 불일치 | 4.8% | rare | `In other words/Thus` 로 결론짓는 척하되 실제로는 상반 |

→ **유닛 5문항이면 코어 2종을 최소 2회씩 + 보조 1회.** rare 축에 2문항 이상 기대지 마라.
→ 프롬프트가 KILLER 에서 추가로 제시하는 세부 축(`prompts-irrelevant.ts:59`):
   **관점·평가 역전 / 인과 방향 뒤집기 / 범위·주어 이동(개인↔사회, 이 사례↔일반론) / 하위 주제 드리프트**.
   **두 개 이상을 동시에 어긋내면 티가 난다 — 하나만 골라라.**

**B3. 표시 문장(오답 슬롯) 조합**
같은 삽입 자리라도 **어느 원문 문장에 번호를 붙이느냐**로 오답 4개의 성격이 바뀐다.
프롬프트가 요구하는 것(`prompts-irrelevant.ts:75-79`): 표시 문장은 문단에서 **서로 다른 역할**
(정의·예시·대조·귀결)을 맡은 것으로 고른다 — 오답 해설이 서로 같은 말이 되면 문항이 헐거워진다.

- 9문장 지문 + slotCount 5 → 첫 문장 제외 8문장에서 4개 선택 = **최대 70가지 조합**(제약 반영 후에도 충분).
- 조합을 바꿀 때 **뒤쪽 1/3 포함 규칙(#7)** 과 **삽입 앵커 규칙(#8)** 을 동시에 만족시켜야 한다.
- 문항마다 "표시 문장이 맡은 역할 팔레트"를 다르게 짜라: {정의·예시·대조·귀결} / {통념·전환·기제·결론} / …

**B4. 정답 번호 위치 (셔플이 없으므로 저작자가 유일한 통제자)**
`IRRELEVANT` 는 `SHUFFLE_OPTION_TYPES` 밖이다(`question-diversity.ts:508-522`).
slotCount 5 면 ②③④ 3자리, 7이면 ②~⑥ 5자리. **유닛 안에서 고르게 분산시켜라.**
단 **B4 단독 변경은 다각화가 아니다** — B1 또는 B2 와 함께 바꿔라.

**B5. 오답 4개의 기제 구성** (헌법 §3 (L,F) 팔레트의 이 유형 번안)
오답 = 표시된 원문 문장이므로 "왜 이 문장이 흐름에 필요한가"의 **설명 축**이 오답 설계다.
학생이 실제로 헷갈리는 지점은 다음 다섯이며, 문항마다 조합을 달리 짜라:

- **주제 반복형** — 핵심 소재어가 가장 많이 들어간 문장(L1: 핵심명사 재사용)이라 "너무 당연해서 오히려 의심"
- **위치 인접형** — 정답 바로 앞/뒤 문장(L4). 무관 문장의 어휘를 이어받고 있어 함께 의심받는다
- **구체 사례형** — 일반 논지에서 톤이 튀는 사례 문장(F5: 세부 승격 착시)
- **역할 전환형** — 전환·대조를 담당하는 문장. 방향이 바뀌므로 "어긋난 것처럼" 보인다(L5)
- **결론 선취형** — 결론을 미리 말하는 문장. 앞 문장과의 인과가 멀어 보인다(L4+F1)

**최강 미끼 의무**: 문항마다 **위치 인접형 또는 역할 전환형** 오답을 최소 1개 명시하라(헌법 §3-3).

**B6. 해설 초점**
해설은 **딱 2문장** 계약이므로(`prompts-irrelevant.ts:90`) 초점을 명시적으로 골라야 한다.
(a) 글의 논지 축을 먼저 세우고 삽입문이 그 축에서 어떻게 벗어나는지 / (b) 삽입문을 빼면 앞뒤가 어떻게
이어지는지(remove-and-reconnect) / (c) 무관성 기제 이름을 지목하고 그 기제가 지문 어디를 비트는지.
문항마다 (a)(b)(c) 를 돌려 쓰면 유닛 전체가 학습 자료로 기능한다.
**단 원문자 지칭은 절대 금지**(7-8) — 반드시 내용 인용으로.

### 8-C. 유닛 5문항 설계 예시 (충돌 없는 조합 — 프로브 실물)

| # | 난이도 | slotCount | 삽입 좌표 | 무관성 기제 | 표시 문장(원문 인덱스) | 정답 번호 |
|---|---|---|---|---|---|---|
| 1 | BASIC | 5 | 전환점 직후 (S3 뒤) | 범위 이탈 (수익성 평가) | 1·3·5·7 | ③ |
| 2 | INTERMEDIATE | 5 | 해결책 제시 직후 (S4 뒤) | 범위 이탈 (설비 유지비) | 2·4·6·8 | ③ |
| 3 | INTERMEDIATE | 5 | 갈등 심화 직후 (S6 뒤) | 주제 침입 (시정 건축) | 1·4·6·8 | ④ |
| 4 | KILLER | 5 | 갈등 장면 직후 (S5 뒤) | 관점 역전 (세공 평가) | 2·3·5·7 | ④ |
| 5 | KILLER | 5 | 도입 직후 (S1 뒤) | 범위 이탈 (상업적 이득) | 1·3·6·8 | ② |

**검산 체크리스트**
- `point:` 5개가 전부 다른가 (`POINT_DUPLICATE`)
- 삽입 문장 5개가 전부 다른가 (`ANSWER_DUPLICATE` — 앞 90자 정규화 비교)
- 정답 번호가 ②③④ 에 흩어졌는가 (셔플 없음)
- 표시 문장 조합 5개가 전부 다른가 (같으면 사실상 같은 문항)
- 난이도 배분이 헌법 §4 를 만족하는가
- KILLER 문항의 어휘 겹침 비율이 **0.25 이상**인가 (7-10)
- 지문 8문장 이상이면 문항마다 뒤쪽 1/3 문장을 최소 1개 표시했는가 (#7)

**⚠ 지문이 짧아 삽입 좌표를 5가지로 못 만들면 문항 수를 줄여라** — 헌법 §9-10(수를 채우려고 품질을 낮추지 않는다).

---

## 검증 기록

`qbank/work/_probe-IRRELEVANT.ts` (tsx 실행, 2026-07-28) — **52/52 통과**.
**P5 는 이 문서의 ```md 블록을 파일에서 직접 읽어 게이트에 태운다** — 위 §2-3·§2-4 실물이 바이트 그대로 통과한다는 뜻이다.

```
PASS P0 리포 픽스처 gate 0
── 지문 계측 ──
passage: 151단어 / 9문장
  [BASIC]        지문겹침  6 · 표시문장겹침 5 · 비율 0.263 · 길이 145자 (표시평균 112자 · 1.30배)
  [INTERMEDIATE] 지문겹침  9 · 표시문장겹침 9 · 비율 0.474 · 길이 141자 (표시평균  96자 · 1.48배)
  [INTERMEDIATE] 지문겹침  5 · 표시문장겹침 5 · 비율 0.333 · 길이 135자 (표시평균 109자 · 1.24배)
  [KILLER]       지문겹침 10 · 표시문장겹침 9 · 비율 0.450 · 길이 146자 (표시평균  98자 · 1.49배)
  [KILLER]       지문겹침  7 · 표시문장겹침 7 · 비율 0.368 · 길이 162자 (표시평균 108자 · 1.50배)
PASS P1 [5문항 전부] gate 0 · adapt ok · postprocess ok(warning 0) · quality error 0
PASS P2 gateUnit blocking 0 · qualityBlocking 0 · ok
PASS P2 structuredData: options 5 · correctAnswer ③ · passageWithNumbers 스팬 5
PASS P2 diversityTargets = 삽입 문장 1개뿐 · AUTOSNAP 경고 0
PASS P2-b 같은 무관 문장 재사용 → ANSWER_DUPLICATE
PASS P3 slotCount 7 gate 0 / slotCount 5 로 채점하면 즉시 반려 / settings {"slotCount":7} 집행

── 함정 실증 ──
PASS E1  마커 밖 지문 1글자 수정 → 지문 재구성 불일치
PASS E2  표시 문장(마커 안) 변형 → 지문 재구성 불일치
PASS E3  지문 첫 문장에 번호 → 지문 첫 문장 반려
PASS E4  무관 문장 앞 문장에 번호 없음 → 인접 앵커 반려
PASS E5  표시 문장을 앞쪽에 몰아 고름 → 분산 반려
PASS E6  정답이 첫/마지막 번호 → 반려
PASS E7  해설이 문장을 번호로 지칭 → 반려
PASS E8  오답 목록에 정답 번호를 끼움 → 파서가 조용히 제거(게이트 침묵)
PASS E9  오답 한 줄 누락 → 「오답해설이 없는 번호: 5」
PASS E10 삽입 문장이 지문 원문 → 신규성 반려
PASS E11 삽입 문장이 역접어로 시작 → 난이도 무관 반려
PASS E12 삽입 문장이 너무 짧음 → 길이 반려
PASS E13 지문과 어휘가 안 겹치는 삽입 문장 → 어휘 정박 반려
PASS E14 KILLER 방법론 드리프트 → 반려 / BASIC 에서는 침묵
PASS E15 KILLER 새 무대 수입(software) → 반려
PASS E16 ★ KILLER 어휘비율 0.10~0.25 — md 게이트 통과, 품질 검증기 irrelevant-too-many-new-terms
PASS E17 irrelevant-too-unrelated 는 SHIP_FIRST 강등 — md 게이트가 유일 차단자

── 문서 왕복 ──
PASS P5 문서에서 실물 md 블록 2개 추출
PASS P5 문서 §2-3 픽스처 블록 gate 0
PASS P5 문서 §2-4 신규 검증본 블록 gate 0
PASS P5 문서 블록이 프로브 렌더와 바이트 동일
```

경로: `parseMdIrrelevant` → `autoSnapIrrelevantSlots` → `gateMdIrrelevant`(+레인 적격성·교사포인트) →
`adaptMdIrrelevantToAiQuestion` → `postProcessQuestion("IRRELEVANT")` → `validateQuestionQuality`.
