# 문장 삽입 (SENTENCE_INSERT)

> **분류** 구조형 (표면은 자리 5~8지선다이나 선지는 서버가 생성한다) · **지문변형** ○ (문장 1개 추출 + 자리 마커 주입, 축자 무손실) · **정답 머리표** `정답:` (원문자 ①~⑧) · **최소 지문** 자리수+1 문장 (자리 5 → **6문장**, 코드 하한) / 실무 하한 10문장·150단어
>
> 정찰 근거: `src/lib/md-qgen/{parser-sentence-insert,gate-sentence-insert,adapter-sentence-insert,lane-sentence-insert,prompts-sentence-insert}.ts` 직독 + `scripts/_test-md-sentence-insert.ts`·`_test-md-sentence-insert-wave2.ts` 픽스처 + `qbank/work/_probe-SENTENCE_INSERT.ts` tsx 실행 검증(전 골격 통과).
> 공유 계약은 [`../recon/00-contract.md`](../recon/00-contract.md), 품질 규범은 [`../quality-constitution.md`](../quality-constitution.md).
> **snap 전용 파일은 없다** — `autoSnapInsertGiven` 이 `parser-sentence-insert.ts:425-470` 안에 있다.

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문에서 **문장 하나를 통째로 빼내** 박스에 따로 보여 주고, 남은 지문의 문장 사이 후보 자리 5~8곳 중
**그 문장이 원래 있던 자리**를 고르게 하는 문항이다(수능 38·39번).

학생이 실제로 하는 일은 "어디에 넣어도 말이 되는가"가 아니라 **응집 단절 복원**이다:

> 정답은 "주어진 문장이 잘 어울리는 자리"가 아니라 **나머지 자리에서는 고리가 끊기고
> 한 자리에서만 앞 고리와 뒤 고리가 동시에 닫히는 자리**다 (`prompts-sentence-insert.ts:6-8`).

- **앞 고리** — 주어진 문장의 지시어·대명사·정관사·연결사가 되받는 선행 내용이 **정답 직전 문장에만** 있다.
- **뒤 고리** — 정답 **직후** 문장이 주어진 문장이 도입한 요소(대명사·정관사 명사)를 다시 받는다.
  주어진 문장을 빼면 그 자리에 선행어가 사라져 뒤 문장이 공중에 뜬다.

**다른 유형과의 결정적 차이 세 가지**

1. **정답을 틀리게 적을 자유가 없다.** 게이트가 「번호지문에서 마커를 걷어내고 정답 자리에 삽입문장을
   되돌리면 원 지문과 한 글자도 다르지 않다」를 결정형으로 검산한다(`gate-sentence-insert.ts:359-368`,
   `parser-sentence-insert.ts:174-189`). 이 한 검사가 **지어낸 문장 · 무단 편집 · 정답 오지정** 세 가지를
   동시에 잡는다. 정답 번호를 바꾸고 싶으면 **빼낼 문장을 바꿔야** 한다.
2. **문항의 실체는 선지가 아니라 "무엇을 빼내느냐 + 어디에 마커를 두느냐"다.** 선지는 서버가
   `①②③④⑤` 로 결정론 생성하므로(`processors/sentence-insert.ts:183`, `sentence-insert-options.ts:10-15`)
   저작자가 쓸 선지 줄 자체가 **존재하지 않는다**.
3. **`글의 순서`(SENTENCE_ORDER)와 형제지만 반대 방향이다.** 순서는 지문 전체를 네 조각으로 덮고,
   삽입은 지문에서 한 문장만 떼어낸다. 그래서 `diversityTargets` 가 **축자 문장**을 회피 표적으로
   내보내도 계약과 충돌하지 않는다(`lane-sentence-insert.ts:189-205`) — 즉 **유닛 안에서 같은 문장을
   두 번 빼낼 수 없다**(하네스 `ANSWER_DUPLICATE`).

**최강 불변식** — 이 한 줄이 모든 형식 계약을 함축한다:

```
strip(번호지문의 마커) 에 정답 자리로 삽입문장을 되끼우면 == 원 지문
```

> ⚠ **후처리가 있다.** `processSentenceInsert`(`src/lib/question-postprocess/processors/sentence-insert.ts`)가
> `passageWithMarkers`·`options`·`omittedSourceSentence(Index)` 를 만들고 정답을 추출 자리 기준으로 **재키잉**한다.
> md 레인은 이미 같은 값을 결정형으로 계산해 보내므로 `Re-keyed …` 경고가 뜨지 않는 것이 **정상**이다
> (`adapter-sentence-insert.ts:126-130`). 경고가 뜨면 좌표가 어긋난 것이다.
> **선지 셔플은 없다** — `SHUFFLE_OPTION_TYPES` 에 이 유형이 없다(`src/lib/question-diversity.ts:508-521`).
> 자리 번호는 지문 위치에 결속돼 있어 셔플하면 문항이 파괴된다.

---

## 2. 마크다운 골격

### 2-1. 기본형 (paraphrasePrefix = false, 기본값)

```md
삽입문장: <지문에서 빼낸 그 문장을 한 글자도 바꾸지 말고 그대로. 개행 없이 한 줄.>
번호지문:
<그 문장을 뺀 나머지 지문 전체를 한 글자도 바꾸지 않고 그대로 옮기되, 문장과 문장 사이 후보 자리 N곳에 [[1]] ~ [[N]] 을 등장 순서대로 끼워 넣는다. 마커 밖 텍스트는 원문과 완전히 동일.>

정답: <①~⑧ 중 빼낸 문장이 원래 있던 자리. 양끝([[1]]·[[N]]) 금지 — 가운데 자리여야 한다>
해설: <한국어 2문장. 그 자리에서 앞 고리와 뒤 고리가 각각 무엇으로 닫히는지. 자리 번호(원문자) 사용 금지 — 문장 내용을 인용해 지목. 합니다체>
오답:
① <이 자리가 어느 고리에서 왜 끊기는지 1문장. 원문자 사용 금지>
② <〃>
④ <〃>
⑤ <〃>
```

- `오답:` 은 **정답 번호를 뺀 (N−1)개**. 라벨은 자리 원문자를 그대로 쓴다.
- **선지 줄을 쓰지 마라.** 서버가 `①`~`⑧` 를 결정론 생성한다. 선지 줄을 적으면 후처리가
  `Ignored AI-provided SENTENCE_INSERT options` 경고와 함께 통째로 버린다(`processors/sentence-insert.ts:184-186`).
- **`번호지문:` 아래에는 지문 외 어떤 줄도 두지 마라.** 다음 섹션 머리표(`정답:`/`해설:`/`오답:`)까지의
  모든 텍스트가 번호지문으로 흡수된다(§3-P4·§7-1).

### 2-2. 변형형 (paraphrasePrefix = true) — 2단 출력

`삽입문장:` 줄 **바로 다음**에 한 줄을 더 붙인다. 축자 줄은 그대로 남는다(게이트가 이 줄로 재구성을 검산한다).

```md
삽입문장: <지문 축자 — 어떤 설정에서도 여기는 축자다>
삽입문장(변형): <바로 위 줄의 **앞부분만** 다른 표현으로 다시 쓰고, 뒷부분은 위 줄과 한 글자도 다르지 않게 그대로 이어 붙인다. 개행 없이 한 줄.>
번호지문:
... (이하 기본형과 동일)
```

### 2-3. qbank 유닛 컨테이너 (md-qgen 계약이 아니라 **하네스 규약**)

한 `.md` = 한 유닛(지문 1 × 유형 1 × 문항 5~8). 하네스가 `<!-- ITEM n ... -->` 로 1문항씩 잘라 레인에 넣는다
(`qbank/harness/qgen-core.ts:57-109`, 헤더 정규식 `/<!--\s*ITEM\s+(\d+)\s*\n([\s\S]*?)-->/g`).
잘라낸 **뒤의 본문만**이 md-qgen 계약 대상이다.

```md
<!-- ITEM 1
difficulty: KILLER
point: S5 '변명 목록'을 되받는 these 의 선행어 해소 — 참조 해소(anaphora_reference)
craft: 최강 미끼는 ④(앞 고리는 닫히나 뒤 문장의 that week 이 받을 대상이 없음)
settings: {"slotCount":5}
-->
삽입문장: ...
```

- `difficulty` 는 `BASIC|INTERMEDIATE|KILLER` (`qgen-core.ts:89-92`)
- `point` 누락 = 컨테이너 반려(`qgen-core.ts:93`). 유닛 내 `point` 중복 = `POINT_DUPLICATE` 차단(`qgen-core.ts:334-343`)
- `settings` 는 그 문항의 유형 설정 오버라이드(JSON) — `{"slotCount":8}` · `{"paraphrasePrefix":true}` 등

### 2-4. ★ 검증된 정상 픽스처 전문 — `scripts/_test-md-sentence-insert.ts:74-90` (`fixture({})` = `GOOD`)

`_test-md-sentence-insert.ts:131` 에서 `게이트: 정상 입력 클린` 으로 검증되는 실물이다.
지문은 아래 10문장을 공백 하나로 이은 것이고, 빼낸 문장은 **S[2]**(`OMIT_INDEX = 2`), 정답은 **②**다.

지문(`_test-md-sentence-insert.ts:34-46`):
```
Urban planners once treated street trees as ornament, a pleasant afterthought bolted onto finished road designs. Field measurements have since shown that a mature canopy holds pavement temperatures several degrees below an open street. But this cooling comes at a cost that few municipal budgets ever name. That expense surfaces in pruning contracts, sidewalk repairs, and the slow work of replacing roots that lift concrete. Cities that ignore those bills end up removing the very canopy they paid to establish. Planting programs therefore succeed only when a city's maintenance money is committed for decades, not seasons. The lesson is that shade is infrastructure, and infrastructure has to be maintained. Some cities now fund canopy care through stormwater fees, treating leaves as drainage equipment. Others fold the same costs into transportation budgets, where pavement life is already tracked. Either route works, provided the money outlasts the mayor who announced it.
```

문항 마크다운(마커는 표시문장 0·1·3·5·7 뒤 = `GOOD_AFTER = [0,1,3,5,7]`):
```md
삽입문장: But this cooling comes at a cost that few municipal budgets ever name.
번호지문:
Urban planners once treated street trees as ornament, a pleasant afterthought bolted onto finished road designs. [[1]] Field measurements have since shown that a mature canopy holds pavement temperatures several degrees below an open street. [[2]] That expense surfaces in pruning contracts, sidewalk repairs, and the slow work of replacing roots that lift concrete. Cities that ignore those bills end up removing the very canopy they paid to establish. [[3]] Planting programs therefore succeed only when a city's maintenance money is committed for decades, not seasons. The lesson is that shade is infrastructure, and infrastructure has to be maintained. [[4]] Some cities now fund canopy care through stormwater fees, treating leaves as drainage equipment. Others fold the same costs into transportation budgets, where pavement life is already tracked. [[5]] Either route works, provided the money outlasts the mayor who announced it.

정답: ②
해설: 앞 문장이 그늘의 냉각 효과를 처음 진술하므로 그 뒤에서만 되받는 지시어가 해소됩니다. 바로 뒤 문장이 가리키는 비용도 이 문장이 도입한 대가를 받습니다.
오답:
① 이 자리는 앞 문장이 아직 냉각 효과를 말하지 않아 되받을 대상이 없습니다.
③ 이 자리는 앞 문장이 아직 냉각 효과를 말하지 않아 되받을 대상이 없습니다.
④ 이 자리는 앞 문장이 아직 냉각 효과를 말하지 않아 되받을 대상이 없습니다.
⑤ 이 자리는 앞 문장이 아직 냉각 효과를 말하지 않아 되받을 대상이 없습니다.
```

변형본 버전(`_test-md-sentence-insert.ts:295-300`, `paraphrasePrefix: true` 로 클린 검증)에서 추가되는 줄:
```md
삽입문장(변형): Yet this relief carries a cost that few municipal budgets ever name.
```

### 2-5. 신규 검증본 — `qbank/work/_probe-SENTENCE_INSERT.ts` (본 정찰이 새로 저작·통과시킨 실물)

픽스처 재사용이 아니라 **임의 지문에서 골격이 성립한다는 증명**이다.
`parseAndGate → adapt → postProcessQuestion → validateQuestionQuality` 전 구간 통과
(gateIssues 0 · adapt ok · post ok · quality error 0 · **재키잉 경고 0**).

지문(158단어 / 10문장, 빼낼 문장 = S[5]):
```
Early telephone engineers assumed that a clear line was simply a quiet one. Their switchboards were tuned to strip away every hiss and crackle that crept into the copper wire. Subscribers nevertheless complained that the scrubbed voices sounded flat and oddly distant. Laboratory tests confirmed that listeners judged the filtered speech to be less trustworthy than the noisy original. Engineers first blamed the handsets, then the wiring, and finally the subscribers themselves. But these excuses collapsed once the filters themselves were switched off for a week. During that week complaints fell so sharply that the engineering notes stopped mentioning them at all. The lesson was that a channel stripped of every irregularity also erases the faint cues by which a listener judges mood and distance. Modern codecs therefore reserve a thin band for the hiss their predecessors had treated as dirt. A call that arrives perfectly silent between words now reads as a fault rather than a triumph.
```

**골격 A — 자리 5개, 정답 ③** (마커는 표시문장 0·2·4·6·8 뒤):
```md
삽입문장: But these excuses collapsed once the filters themselves were switched off for a week.
번호지문:
Early telephone engineers assumed that a clear line was simply a quiet one. [[1]] Their switchboards were tuned to strip away every hiss and crackle that crept into the copper wire. Subscribers nevertheless complained that the scrubbed voices sounded flat and oddly distant. [[2]] Laboratory tests confirmed that listeners judged the filtered speech to be less trustworthy than the noisy original. Engineers first blamed the handsets, then the wiring, and finally the subscribers themselves. [[3]] During that week complaints fell so sharply that the engineering notes stopped mentioning them at all. The lesson was that a channel stripped of every irregularity also erases the faint cues by which a listener judges mood and distance. [[4]] Modern codecs therefore reserve a thin band for the hiss their predecessors had treated as dirt. A call that arrives perfectly silent between words now reads as a fault rather than a triumph. [[5]]

정답: ③
해설: 앞 문장이 기사들이 수화기와 배선과 가입자를 차례로 탓했다고 열거하므로 그 변명 목록을 되받는 지시어가 바로 그 뒤에서만 해소됩니다. 뒤 문장은 필터를 끈 '한 주 동안'을 다시 가리키므로 그 기간을 처음 도입하는 문장이 그 자리에 있어야 뒷문장의 지시가 성립합니다.
오답:
① 선행어 미도입 — 아직 어떤 변명도 제시되지 않아 되받을 목록이 없고, 필터를 끈 기간도 뒤 문장이 가리킬 수 없습니다.
② 어휘 미끼 — 앞 문장이 불평을 말해 관련돼 보이지만 변명은 아직 등장하지 않아 지시가 뜹니다.
④ 단방향 정합 — 앞 고리는 닫히지만 실험 결과가 곧바로 이어져야 할 자리라 뒤 고리가 끊깁니다.
⑤ 연결 논리 오정렬 — 이미 불평이 사라진 뒤라 변명이 무너졌다는 역접이 받을 대상이 없습니다.
```

계측: `omittedIndex=5` · `matchingGaps=[2]`(0-based 서수 → ③ 하나뿐) · `afterDisplayIndex=[0,2,4,6,8]` ·
어댑터 `markerAfterSentenceIndices=[0,2,4,7,9]` · `correctAnswer="3"` · 후처리 `correctAnswer="③"`(재키잉 없음).

**골격 B — 자리 8개, 정답 ⑤**: 같은 지문에서 마커를 표시문장 0~7 뒤에 두고 `정답: ⑤`,
오답해설 7줄(`① ② ③ ④ ⑥ ⑦ ⑧`). 게이트·어댑터·후처리·품질 전부 클린.

**골격 C — paraphrasePrefix 2단 출력**: 골격 A 에 아래 한 줄을 추가. 클린 통과.
```md
삽입문장(변형): Yet these justifications fell apart once the filters themselves were switched off for a week.
```
(축자 14단어 / 변형 15단어 = 1.07배 · 공통 꼬리 10토큰 ≥ 필요 4토큰 · 접두부에 `these`(지시어)와 `Yet`(연결사) 보존)

---

## 3. 파서 계약 (★ 가장 중요)

파서 진입점: `parseMdSentenceInsert(text)` — `parser-sentence-insert.ts:374-413`.
**정본 규약**: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
이 유형의 파서는 **`decoration.ts` 를 import 하지 않지만, 자체 장식 관용 정규식을 갖고 있다**
(`parser-sentence-insert.ts:290-344`). 그래도 관용은 **관용이지 계약이 아니다** — 아래 "정규 형식"을 그대로 써라.

### 3-0. 장식 관용 부품 (모든 머리표 줄에 공통 적용)

| 상수 | 정규식 원문 | file:line |
|---|---|---|
| `EMPH` | `` [*_]{1,6} `` | `parser-sentence-insert.ts:299` |
| `LINE_HEAD` | `` ^[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]*)?(?:[-+•][ \t]*|\*[ \t]+)?(?:${EMPH}[ \t]*)? `` | `:301` |
| `LINE_SEP` | `` [ \t]*(?:${EMPH})?[ \t]*[:：][ \t]*(?:${EMPH}[ \t]*)? `` | `:303` |
| `VALUE_DECOR` | `` (?:${EMPH}[ \t]*)?["'“‘「『]?[ \t]* `` | `:312` |
| `VARIANT_TAG` | `` [ \t]*[,，、]?[ \t]*[(（\[]?[ \t]*변형[ \t]*[)）\]]? `` | `:319` |
| `SECTION_KEY` | `` (?:삽입문장(?:${VARIANT_TAG})?|번호지문|정답|해설|오답) `` | `:320` |
| `BLOCK_BREAK` | `` (?=${LINE_HEAD}${SECTION_KEY}${LINE_SEP}) `` | `:321` |

→ 굵게·기울임·언더스코어·불릿·헤딩·인용·전각 콜론·앞뒤 공백을 **머리표와 값 양쪽에서** 흡수한다.
프로브 실증: `**정답:** **③**` · `## 번호지문:` · `- ① …` 전부 **클린 통과**.
**그래도 장식 0 이 저작 규칙이다** — 같은 유닛의 다른 유형(정본 빈칸·어법)에서는 같은 장식이 필드를 증발시킨다.

### 3-1. 줄 단위 문법

| # | 요소 | 정규식 / 리터럴 (원문) | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|
| P1 | 삽입문장(축자) | `` new RegExp(`${LINE_HEAD}삽입문장${LINE_SEP}(.+)$`, "m") `` | `parser-sentence-insert.ts:323` | `given=""` → 게이트가 **즉시 return** `삽입문장 누락`. **한 줄 계약** — 개행하면 뒷부분이 잘린다 |
| P2 | 삽입문장(변형) | `` new RegExp(`${LINE_HEAD}삽입문장${VARIANT_TAG}${LINE_SEP}(.+)$`, "m") `` | `:324` | P1 과 **상호 배타**(`삽입문장` 뒤 괄호 유무). 오타 나면 변형 줄이 축자 줄로 오인돼 재구성이 깨진다 |
| P3 | 번호지문(본 경로) | `` new RegExp(`${LINE_HEAD}번호지문${LINE_SEP}\r?\n?([\s\S]*?)${BLOCK_BREAK}`, "m") `` | `:325-328` | 못 잡으면 `번호지문 누락`(**즉시 return**). 머리표 뒤 개행은 있어도 없어도 된다 |
| P4 | 번호지문(꼬리 폴백) | `` new RegExp(`${LINE_HEAD}번호지문${LINE_SEP}\r?\n?([\s\S]+)$`, "m") `` | `:329` | 뒤에 섹션 머리표가 하나도 없으면 **문서 끝까지 전부 번호지문**이 된다 |
| P5 | 정답 | `` new RegExp(`${LINE_HEAD}정답${LINE_SEP}${VALUE_DECOR}\[{0,2}[ \t]*[(（]?[ \t]*([①-⑧]|[1-8])[ \t]*[)）]?`, "m") `` — **첫 매치만** | `:330-333` | `answer=""` → `정답 누락`. `⑨`·`9` 는 매치되지 않는다 |
| P6 | 오답 섹션 절단 | `text.split(WRONG_HEAD_ONLY_RE)[1] ?? text.split(WRONG_HEAD_RE)[1] ?? ""` · `WRONG_HEAD_ONLY_RE = ^LINE_HEAD오답LINE_SEP$` · `WRONG_HEAD_RE = ^LINE_HEAD오답LINE_SEP` | `:334-335,386-387` | `오답:` 머리표가 없으면 오답해설이 **전부 사라진다**(0개) |
| P7 | 오답 항목 줄 | `` /^[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]*)?\|?[ \t]*(?:[-+•][ \t]*|\*[ \t]+)?[*_]{0,3}\[{0,2}[ \t]*[(（]?[ \t]*([①-⑧]|[1-8])[ \t]*[)）]?[ \t]*\]{0,2}[*_]{0,3}[ \t]*[.)．]?[ \t]*(.+)$/ `` | `:343-344` | 라벨로 **시작하지 않는 줄은 통째로 무시**된다(산문 줄 안전). 라벨 뒤 본문이 없으면 그 줄도 무시 |
| P8 | 오답에서 정답 줄 제거 | `if (!label \|\| label === answer) continue;` | `:396` | 오답 목록에 정답 번호를 끼우면 **조용히 삭제**되고 게이트가 `오답해설 N개`·`누락 라벨` 로 **간접 진단**한다 |
| P9 | 해설(본 경로) | `` new RegExp(`${LINE_HEAD}해설${LINE_SEP}([\s\S]*?)${BLOCK_BREAK}`, "m") `` | `:336` | 여러 줄 허용. 못 잡으면 `해설 누락` |
| P10 | 해설(꼬리 폴백) | `` new RegExp(`${LINE_HEAD}해설${LINE_SEP}([\s\S]+)$`, "m") `` | `:337` | `오답:` 이 없으면 해설이 오답 줄까지 **삼킨다** → `해설이 자리 번호(원문자)로…` 라는 **거짓 원인**이 나온다(프로브 실증) |
| P11 | 값 장식 제거 | `stripInsertEmphasis` — `***`/`**`/`*`/`___`/`__`/`_` 를 **짝이 맞을 때만** 최대 3겹까지 벗기고, 끝의 짝 없는 `[*_]{2,3}` 제거 | `:353-367` | **따옴표는 벗기지 않는다** — 지문 문장 자체가 인용문일 수 있어서(축자 계약) |

### 3-2. 인라인 자리 마커

| 요소 | 정규식 원문 | file:line |
|---|---|---|
| 정규 마커 | `` /\[\[\s*(\d{1,2}|[①-⑳])\s*\]\]/g `` — **matchAll 전용** | `parser-sentence-insert.ts:35` |
| 맨 원문자 폴백 | `` /[①-⑳]/g `` — 대괄호 마커가 **0개**일 때만 발동 | `:37,116` |
| 라벨 정규화 | `insertCircledLabel` — 원문자면 그대로, 숫자면 `INSERT_CIRCLED[n-1]`, **1~8 밖은 `""`** | `:54-62` |
| 자리 라벨 축 | `INSERT_CIRCLED = "①②③④⑤⑥⑦⑧"` | `:23` |

- **정규 형식은 `[[1]]` `[[2]]` …** 다. `[[ 3 ]]`(공백) · `[[④]]`(원문자) 도 흡수되지만 쓰지 마라.
- **범위 밖 번호도 전부 수집한다**(`\d{1,2}` · `①-⑳`). `[[9]]`·`[[0]]`·`[[10]]` 을 조용히 버리면 리터럴이
  잔여 지문에 남아 「지문 무단 편집」으로 **오진**되기 때문이다(`:29-33`). 범위 판정은 게이트가 한다.
- **마커 자리 공백 주입 규칙**(`:103-104,126-133`): 마커 왼쪽이 `` /[.!?,;:][)\]"'”’」』›»]*$/ `` 로 닫히고
  오른쪽이 `` /^[\p{L}\p{N}("'“‘「『«]/u `` 로 열릴 때만 공백 한 칸을 넣는다.
  → `…designs.[[1]]Field…`(문장 경계 글루)는 **흡수**되고, `…establish[[3]].`(낱말 뒤 + 구두점 앞)에는
  공백을 넣지 않는다. 후자에 공백을 넣으면 재구성이 깨져 **거짓 반려**가 났던 실측 사고다.

### 3-3. 좌표 계산 — 게이트·어댑터가 **공유하는 단일 계산** (`computeInsertLayout`, `:236-288`)

| 산출 | 계산 | file:line |
|---|---|---|
| `clean` / `marks` | `splitInsertMarkers(numberedPassage)` — 마커 제거 텍스트 + `{num, ordinal, at, raw}` | `:110-146` |
| `sentences` | `splitIntoSentences(passage)` — **후처리와 같은 분할기** | `:241` |
| `matchingGaps` | 마커 자리마다 `` `${clean.slice(0,at)} ${given} ${clean.slice(at)}` `` 을 `normalizeWs` 로 원 지문과 대조 → 일치하는 ordinal 목록 | `:174-189,247` |
| `omittedIndex` | ① `sentences.filter(k!==i).join(" ")` 가 `clean` 과 `normalizeWs` 동일한 첫 `i` ② 실패 시 **matchingGaps 가 있을 때만** 토큰 수 역산 폴백 | `:252-262`, 폴백 `:205-225` |
| `displaySentences` | `sentences.filter(k!==omittedIndex)` | `:263-264` |
| `afterDisplayIndex` | 마커 앞 **토큰 수**(`insertTokenCount`)를 표시문장 누적 토큰 수와 대조. `-1`=문장 경계 아님, `-2`=지문 맨 앞 | `:266-277` |

> ★ **분할기 왕복 손실 폴백**(`:191-225`) — `splitIntoSentences` 는 무손실이 아니다.
> 닫는 따옴표를 다음 문장 선두로 흘리고(`…we own." Field…`), `U.S.` 를 `U.` / `S.` 로 쪼갠다.
> 그래서 축자 완벽 출력도 ①번 경로에서 `omittedIndex=-1` 이 될 수 있어, **복원 증명(matchingGaps)이 선 뒤에만**
> 토큰 수로 역산한다. 인용부호·약어가 든 지문에서도 이 유형이 성립하는 근거다.

### 3-4. 축자 대조의 두 축

| 축 | 무엇을 무시하는가 | 쓰는 곳 | file:line |
|---|---|---|---|
| `normalizeWs` | 곱슬따옴표→곧은따옴표 · en/em dash→`-` · `…`→`...` · 공백 축약 **만** | 재구성 대조(#5)·빼낸 문장 확정 | `parser.ts:67-74` |
| `foldForInsertMatch` | 구두점 **전부** + 대소문자 (`/[\p{L}\p{N}]+/gu` 토큰을 공백으로 이음) | autoSnap 보수 가드 · 변형본 꼬리 대조 | `parser-sentence-insert.ts:75-77` |

→ **마커 밖 지문은 한 글자도 바꿀 수 없다.** 흡수되는 것은 위 4종뿐이다.

### 3-5. 0원 자동 보정 (`autoSnapInsertGiven`, `:425-470`) — 전용 snap 파일 없음

`삽입문장:` 줄이 원문 문장을 **구두점·대소문자만** 다르게 옮겨 적은 경우 원문 축자로 갈아 끼운다.
`corrections` 에 `삽입문장을 지문 축자로 보정(구두점·대소문자 드리프트)` 이 기록된다(`:468`).

**발동 조건과 보수 가드**:
1. 이미 `matchingGaps` 가 성립하면 **손대지 않는다**(`:437-439`) — 축자 증명이 이미 섰다.
2. `foldForInsertMatch(원문) !== foldForInsertMatch(given)` 이면 **보정하지 않는다**(`:465-467`).
   즉 **단어가 하나라도 다르면 스냅은 침묵하고 게이트가 반려한다.**
3. **변형본(`givenVariant`)은 절대 건드리지 않는다**(학생 표시면).

→ **스냅에 기대지 마라.** 처음부터 원문 문자를 그대로 옮기는 것이 유일한 방법이다.

### 3-6. 첫 매치 규칙 · 1문서 1문항

`삽입문장:` `번호지문:` `정답:` `해설:` 은 전부 **첫 매치만** 취한다(`"m"` 플래그, 전역 아님).
한 파일에 2문항 이상을 넣으면 뒤 문항이 조용히 사라지거나 앞 문항을 오염시킨다
(`../recon/00-contract.md` §3). 유닛 파일은 반드시 `<!-- ITEM n -->` 로 자른다.

---

## 4. 게이트 체크리스트

진입점 `gateMdSentenceInsert(q, passage, {slotCount?, paraphrasePrefix?, requireWrong?})`
— `gate-sentence-insert.ts:248-448`. 레인이 여기에 `teacherPointIssues` 를 더한다
(`lane-sentence-insert.ts:145-151`). **빈 배열 = 클린.**

> ⚠ 아래 4건은 **즉시 return** 이다 — 하나 걸리면 나머지 진단이 **아예 나오지 않는다**.
> `삽입문장 누락` · `번호지문 누락` · `지문이 N문장뿐…` · `삽입 자리 마커 N개…`

### 4-1. 형상·좌표 축 (언제나 집행)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `삽입문장 누락` | `!q.given` — **즉시 return** | `gate-sentence-insert.ts:263` |
| `번호지문 누락` | `!q.numberedPassage` — **즉시 return** | `:264` |
| `지문이 {n}문장뿐 — 자리 {S}개를 만들려면 {S+1}문장 이상이어야 한다(지문이 짧아 이 유형이 성립하지 않는다)` | `layout.sentences.length < slotCount + 1` — **즉시 return**. 재생성으로 탈출 불가 | `:271-274` |
| `삽입 자리 마커 {n}개 ({S}개 필요 — [[1]]~[[{S}]]){. rangeNote}` | `layout.marks.length !== slotCount` — **즉시 return** | `:288-294` |
| `마커 번호가 자리 범위(1~{S}) 밖: {raw·raw} — [[1]]~[[{S}]] 만 써라` | `m.num < 1 \|\| m.num > slotCount` | `:280-286,298-299` |
| `마커 번호가 지문 등장순 1..{S} 이 아님 — 실제 {numbering\|없음}` | 마커 번호 연결 ≠ `1,2,…,S` (범위 밖이 없을 때만 발화) | `:300-306` |
| `[[n]] 이(가) 지문 맨 앞에 있음 — 자리는 문장과 문장 사이에만 둔다` | `afterDisplayIndex === -2` | `:217-219` |
| `[[n]] 이(가) 문장 경계가 아님 — 직전이 '…{34자}' 로 끝난다. 마커는 마침표 뒤(문장과 문장 사이)에만 둔다` | `afterDisplayIndex < 0` | `:220-227` |
| `[[a]] 와 [[b]] 사이에 문장이 없음 — 같은 자리에 마커를 두 개 두지 마라` | 두 마커가 같은 표시문장 뒤 | `:228-232` |
| `삽입문장이 지문의 완결된 한 문장이 아님 — 문장 경계에서 통째로 빼내라(반 문장·두 문장 동시 추출 금지)` | `omittedIndex < 0` **이면서** `matchingGaps.length > 0` | `:315-319` |
| `지문 재구성 불일치 — 번호지문이 '원 지문에서 문장 하나만 뺀 형태'가 아니다(마커 밖 텍스트를 고쳐 썼거나 문장을 지어냈다)` | `omittedIndex < 0` **이면서** `matchingGaps.length === 0` | `:320-324` |
| `삽입문장이 지문 축자가 아님 — 번호지문에서 빠진 원문은 '{60자}' 이다` | `matchingGaps.length === 0 && normalizeWs(source) !== normalizeWs(given)` | `:331-335` |
| `지문의 첫 문장을 빼냈음 — 첫 문장은 뺄 수 없다(앞 고리가 없어 자리가 결정되지 않는다). 둘째 문장 이후에서 골라라` | `omittedIndex === 0` (후처리 하드 실패 선반영) | `:337-340` |
| `빼낸 문장이 있던 자리('{40자}' 바로 뒤)에 마커가 없음 — 그 자리에 반드시 마커를 두어라` | `afterDisplayIndex` 에 `omittedIndex-1` 이 없음 (후처리 하드 실패 선반영) | `:343-350` |

### 4-2. 정답 축

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `정답 누락` | `!q.answer` | `:355-356` |
| `정답 라벨({X})이 자리 마커 범위 밖 — ①~{last} 중 하나여야 한다` | `answerOrdinal < 0 \|\| >= marks.length` | `:357-358` |
| `정답 불일치 — 삽입문장을 되돌렸을 때 원 지문이 복원되는 자리는 [[n]]·[[m]] 인데 정답은 {X} 로 표시됨` | 정답이 `matchingGaps` 밖 (matchingGaps 가 비어 있으면 침묵 — #4 가 이미 말했다) | `:359-368` |
| `정답이 양끝 자리({X}) — 가운데 자리({②③④…})가 되도록 빼낼 문장을 다시 골라라` | `answerOrdinal === 0 \|\| === marks.length-1` (fast 는 warning, md 는 **승격**) | `:369-374` |

### 4-3. 문항 성립 축

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `주어진 문장에 응집 단서(지시어·대명사·연결사)가 없음 — 자리가 유일하게 결정되지 않는다(복수정답)` | `!sentenceInsertHasCohesiveCue(displayedGiven)` — 사전은 `validators/sentence-insert.ts:7-20` | `:376-382` |
| `주어진 문장과 거의 같은 문장이 번호지문에 남아 있음: '{60자}' — 정답 자리가 그대로 노출된다` | 표시문장 중 하나와 유사도 ≥ **0.72**. 축자와 변형본 **양쪽** 표면 모두 대조 | `:45,384-399` |

> 유사도는 `validators` 축과 후처리 축 **둘을 계산해 큰 값**을 쓴다(`:97-103`).
> 임계를 두 하류(후처리 0.85 / validators 0.72) 중 낮은 쪽으로 내려 「게이트 클린 → 후처리 하드 실패」
> 밴드를 없앴다(`:36-44`).

### 4-4. 변형(paraphrasePrefix) 축

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `주어진 문장 변형 설정인데 '삽입문장(변형):' 줄이 없음` | `paraphrase && !givenVariant` | `:402-403` |
| `주어진 문장 변형 설정이 꺼져 있는데 '삽입문장(변형):' 줄이 출력됨` | `!paraphrase && givenVariant` | `:404-405` |
| `삽입문장 변형본이 축자와 동일 — 앞부분을 실제로 다시 써라(변형이 아니면 이 설정의 의미가 없다)` | `normalizeWs(variant) === normalizeWs(src)` (이후 검사 중단) | `:151-153` |
| `삽입문장 변형본에 영어 단어가 없음 — 지문과 같은 언어로 다시 써라` | fold 토큰 0 (이후 검사 중단) | `:156-159` |
| `삽입문장 변형본 분량 이탈 ({v}단어 vs 축자 {s}단어 — 0.6~1.6배 안에서 다시 써라)` | `countWords` 비율 이탈 | `:105,160-168` |
| `삽입문장 변형본이 여러 문장으로 늘어남 — 한 문장을 유지하라` | `countDisplaySentences(variant) > 1` | `:169-171` |
| `삽입문장 변형본이 문장 전체를 다시 씀 (축자와 같은 꼬리 {k}토큰 — {n}토큰 이상 필요). 앞부분(도입구·앞 절·주어부)만 바꾸고 뒷부분은 축자 그대로 이어 붙여라` | `srcTokens ≥ 6` 이고 공통 꼬리 < `max(3, round(srcTokens*0.25))` | `:107,172-179` |
| `삽입문장 변형본에 응집 단서(지시어·대명사·연결사)가 하나도 없음 — 자리를 결정하는 단서를 지우지 마라` | `!sentenceInsertHasCohesiveCue(variant)` | `:187-188` |
| `삽입문장 변형본에서 앞 내용을 되받는 지시어·대명사가 사라짐 — 같은 선행어를 가리키는 지시어를 반드시 남겨라(축자 앞부분 '{40자}')` | **변형된 접두부에서만** 대조: `INSERT_ANAPHORA_RE` 가 축자 접두부에는 있고 변형 접두부에는 없음 | `:112-113,185-194` |
| `삽입문장 변형본에서 논리 방향을 지시하던 연결사가 사라짐 — 표현은 바꾸되 같은 방향의 연결사를 남겨라(축자 앞부분 '{40자}')` | 〃 `INSERT_CONNECTIVE_RE` | `:117-118,195-199` |
| `삽입문장 변형본이 지문의 다른 구간을 그대로 옮겨 옴 — 자기 문장으로 다시 써라` | `fold(variant).length ≥ 12 && fold(passage).includes(...)` | `:201-206` |

### 4-5. 해설·오답 축 (`requireWrong !== false` 일 때)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `해설 누락` | `!q.explanation` | `:412` |
| `해설이 자리 번호(원문자)로 위치를 지칭함 — 번호 대신 문장 내용을 인용해 지목하라` | `/[①-⑧]/.test(explanation)` | `:413-417` |
| `오답해설 라벨 중복: {labels} — 자리마다 정확히 한 줄씩 써라` | 라벨 중복 | `:421-425` |
| `오답해설에 자리 범위 밖 라벨: {labels}` | `slotCount` 밖 라벨 | `:426-428` |
| `오답해설 {n}개 ({S-1}개 필요)` | 개수 불일치 | `:420,429` |
| `오답해설 누락 라벨: {labels}` | 정답 제외 전 라벨 중 빠진 것 | `:430-434` |
| `오답해설에 정답 번호 포함` | 정답 라벨이 오답 목록에 존재 — **파서가 먼저 걸러내므로 파싱 경로에서는 사실상 발화하지 않는다**(게이트를 직접 부를 때만) | `:435` |
| `오답해설 {X} 이(가) 자리 번호(원문자)로 다른 위치를 지칭함 — 문장 내용을 인용해 지목하라` | 오답해설 본문에 `[①-⑧]` (첫 1건만) | `:437-444` |

### 4-6. 교사 지정 포인트 축 (`ctx.teacherPoints` 가 있을 때만)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `교사 지정 문장을 빼내지 않았음: '{60자}' — 이 문장을 삽입문장으로 써라` | 지정 문장과 `given`·`givenVariant` 가 포함 관계가 아님(`foldForCompliance`: 소문자 + 비문자 제거) | `lane-sentence-insert.ts:72-90` |

### 4-7. qbank 하네스 추가 축 (프로덕션에는 없다)

`qgen-core.ts` 는 `validateQuestionQuality` 의 error 도 **차단**한다(`qualityBlocking`).
이 유형에서 실제로 발화할 수 있는 코드(`validators/sentence-insert.ts`):

| 코드 | 조건 | file:line |
|---|---|---|
| `sentence-insert-neutral-given` | 주어진 문장에 응집 단서 없음 (게이트 4-3 과 동축) | `validators/sentence-insert.ts:254-259` |
| `sentence-insert-gap-marker-count` | `passageWithMarkers` 의 원문자 개수 ≠ slotCount | `:267-274` |
| `sentence-insert-marker-mid-sentence` / `-marker-empty-gap` | 렌더 결과에서 마커가 문장 경계 밖·인접 빈 갭 | `:98-151,278-280` |
| `sentence-insert-omitted-source-not-backed` | `sourceSentenceToOmit` 이 원 지문 문장이 아님 | `:287-292` |
| `sentence-insert-omitted-source-visible` | 빼낸 문장이 표시 지문에 남아 있음(0.72) | `:294-303` |
| `sentence-insert-answer-desync` | 재구성 자리 / 해설 산문 주장 / 오답해설 라벨이 `correctAnswer` 와 불일치 | `:339-349,392-479` |
| `explanation-quoted-token-missing` | 해설·오답해설이 따옴표로 인용한 **영어 12자 이상** 조각이 지문·문항 표면에 실재하지 않음 | `validators/explanation-quoted-tokens.ts:37-38` |

**warning(차단 아님)**: `sentence-insert-marker-count` · `sentence-insert-marker-order` ·
`sentence-insert-edge-answer` (`:236-248,320-327`).

**하네스 유닛 축**: `POINT_DUPLICATE`(`point:` 문자열 중복, `qgen-core.ts:334-343`) ·
`ANSWER_DUPLICATE`(**같은 문장을 두 번 빼냄**, `qgen-core.ts:345-363`).
두 축 모두 비교 전 `[^\p{L}\p{N}]+ → " "` + 소문자화 정규화를 거친다(`qgen-core.ts:379-391`).

---

## 5. adapter 산출 필드

`adaptMdSentenceInsertToAiQuestion(q, passage, difficulty, givenMode)` — `adapter-sentence-insert.ts:43-140`.
**이 유형은 후처리가 있다.** 아래 표의 "출처" 열을 반드시 구분하라.

| 키 | 값 | 출처 | file:line |
|---|---|---|---|
| `direction` | `"글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?"` (stemLanguage=en 이면 `"Where would the given sentence best fit in the flow of the passage?"`) | 어댑터 / 레인 | `adapter-sentence-insert.ts:34-35` · `lane-sentence-insert.ts:33-34,166-169` |
| **`givenSentence`** | 학생에게 보이는 문장 — `PREFIX_VARIANT` 모드면 **변형본**, 아니면 축자 | 어댑터 | `:98-99,125` |
| **`sourceSentenceToOmit`** | 후처리가 지문에서 지울 문장 — **언제나 원 지문 축자** | 어댑터 | `:97,127` |
| **`markerAfterSentenceIndices`** | **원 지문**(빼낸 문장 포함) 기준 0-based. md 는 표시 좌표에서 계산하므로 `display < omittedIndex ? display : display+1` 로 **역보정(+1)** 해 넘긴다. 후처리가 다시 −1 해 상쇄 | 어댑터 | `:73-91,128` · 후처리 `processors/sentence-insert.ts:204-206` |
| `correctAnswer` | 어댑터: `String(answerOrdinal+1)` = `"1"~"8"` → **후처리가 추출 자리 기준 원문자(`"③"`)로 재키잉** | 어댑터 → 후처리 | `:130` · `processors/sentence-insert.ts:141-166,192` |
| `wrongOptionExplanations` | 어댑터: `[{label:"1", explanation}]` (정답 제외, **빈 해설은 제거**) → 후처리·저장 단계에서 `Record` 로 정규화 | 어댑터 | `:101-118,131` |
| `explanation` | 한국어 해설 원문 | 어댑터 | `:132` |
| `keyPoints` | **항상 `[]`** — 합성 금지(모델 오태깅이 학생 표면에 노출된 실사고) | 어댑터 | `:133-135` |
| `tags` | `[]` | 어댑터 | `:136` |
| `difficulty` | `ctx.rawDifficulty` 그대로 | 어댑터 | `:137` |
| **`passageWithMarkers`** | 표시문장 사이에 `①`~`⑧` 를 끼운 학생 표면 지문 | **후처리 전담** | `processors/sentence-insert.ts:168-180` |
| **`options`** | `[{label:"1", text:"①"}, …]` — 결정론 생성 | **후처리 전담** | `:183` · `sentence-insert-options.ts:10-15` |
| **`omittedSourceSentence`** / **`omittedSourceSentenceIndex`** | 빼낸 문장 축자 / 원 지문 인덱스 | **후처리 전담** | `processors/sentence-insert.ts:195-196` |

**이 유형에만 있는 필드**: `givenSentence` · `sourceSentenceToOmit` · `markerAfterSentenceIndices` ·
`passageWithMarkers` · `omittedSourceSentence(Index)`.

**절대 만들면 안 되는 것**(어댑터 주석 `:12-17`):
- `options` — 후처리가 `Ignored AI-provided …` 경고와 함께 버린다.
- `passageWithMarkers` — 후처리 전담. 이중 생성은 충돌한다.
- `blanks` · `passageWithBlank` · `markedWords` — `validators/misc.ts` 의 `type-foreign-field` error.

**어댑터 자체 반려**(게이트를 통과해도 여기서 죽는 경우, `:54-95,104-110`):
삽입문장 누락 / 번호지문 누락 / 마커 5~8개 아님 / 문장 하나 뺀 형태 아님 / 첫 문장 추출 /
정답 라벨 범위 밖 / 마커가 문장 경계 아님 / 마커가 앞 마커와 같은 자리 / **추출 자리에 마커 없음** /
**오답해설 라벨 중복**.

**`diversityTargets`**(`lane-sentence-insert.ts:195-205`): `omittedSourceSentence` →
`sourceSentenceToOmit` → `givenSentence` 순으로 **첫 하나만** 내보낸다. 이것이 하네스 `ANSWER_DUPLICATE` 축이다.

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `SENTENCE_INSERT.slotCount` (별칭 `optionCount`) | number | `5` | `5~8` — `Math.round` 후 `min/max` 클램프. 비수치는 기본값 5 (`shared.ts:65-75`) | **★ md 형상을 바꾸는 1번 노브.** `[[1]]`~`[[N]]` 마커 개수 · `정답:` 허용 라벨 범위 · 오답해설 줄 수(N−1) · 지문 최소 문장 수(N+1) 가 전부 따라 움직인다. 레인 진입: `resolved.sentenceInsertSlotCount` (`lane-sentence-insert.ts:36-41`), md 프롬프트 클램프 `prompts-sentence-insert.ts:32-39`, 상수 `SENTENCE_INSERT_SLOT_COUNT_MIN/MAX/DEFAULT = 5/8/5` (`question-type-generation-settings/shared.ts:20,22,24`), 설정 스펙 `:150-156` |
| `SENTENCE_INSERT.paraphrasePrefix` | boolean | `false` | `=== true` 일 때만 참 (`shared.ts:104-115`) | **★ md 형상을 바꾸는 2번 노브.** true 면 `삽입문장(변형):` 줄이 **필수**가 되고(없으면 반려), false 면 그 줄이 **있으면 반려**. 변형 전용 게이트 10종이 켜진다. 어댑터 `givenMode` 가 `PREFIX_VARIANT` 로 바뀌어 학생 표면이 변형본이 된다(`lane-sentence-insert.ts:43-48,161`) |
| `SENTENCE_INSERT.pointFocus` | boolean | `false` | — | md 형상 무변경. 프롬프트 extras 에 응집장치 코어 2종(+보조) 가이드 주입(`lane-sentence-insert.ts:120-129`, `sentence-insert-point-catalog.ts:159-191`) |
| `SENTENCE_INSERT.stemLanguage` | `"ko"\|"en"` | `"ko"` | — | md 형상 무변경. 어댑터가 `direction` 을 영어로 교체(`lane-sentence-insert.ts:163-169`) |
| `SENTENCE_INSERT.optionLanguage` | `"ko"\|"en"` | `"en"` | — | md 형상 무변경. `qualityArgs` 로만 전달(`lane-sentence-insert.ts:177`) |
| `difficulty` | `BASIC\|INTERMEDIATE\|KILLER` | — | — | md 형상 무변경. 프롬프트의 **표적 문장 선정** 지시만 3분기(`prompts-sentence-insert.ts:52-69`). BASIC 은 few-shot 해부가 생략된다(`:139`). **게이트는 난이도로 완화되지 않는다** |
| `teacherPoints` | `{text}[]` | `[]` | — | md 형상 무변경. 지정 문장이 **빼낸 문장**이어야 한다(포함 관계, `lane-sentence-insert.ts:72-90`) |
| `variantIndex` / `variantCount` | number | `0` / `1` | — | md 형상 무변경. `pointFocus && variantCount > 1` 일 때 코어 응집장치를 회전 지정(`sentence-insert-point-catalog.ts:169-178`) |

**적격성**(`isEligible`, `lane-sentence-insert.ts:101-111`): `slotCount` 가 유한수이고 5~8 이어야 승차.
미지정이면 기본 5 로 적격. 4·9 는 **레인 자체가 거부**한다.

**형식 고정 상수** (노브가 아니다):
자리 라벨 축 `①②③④⑤⑥⑦⑧` (`parser-sentence-insert.ts:23`) · 오답해설 = slotCount−1 ·
정답은 양끝 금지 · 첫 문장 추출 금지 · 마커는 문장 경계에만.

---

## 7. 함정 (전부 코드 근거 또는 프로브 실증)

**7-1. `번호지문:` 블록은 다음 섹션 머리표까지 **모든 줄을 삼킨다**.**
`BLOCK_BREAK` 가 아는 키워드는 `삽입문장`/`번호지문`/`정답`/`해설`/`오답` 다섯뿐이다
(`parser-sentence-insert.ts:320-321`). 프로브 실증: `정답:` 을 `모범답안:` 으로 쓰면
그 줄이 **번호지문에 흡수**되어 `지문 재구성 불일치` + `정답 누락` 두 줄이 나온다 —
진짜 원인(머리표 오타)을 아무도 말해 주지 않는다.
→ **번호지문과 `정답:` 사이에 빈 줄 외의 어떤 텍스트도 두지 마라.** 구분선(`---`)·주석·소제목 전부 금지.

**7-2. `오답:` 머리표를 빠뜨리면 오답해설이 통째로 사라지고 해설이 그것을 삼킨다.**
파서는 `오답:` 로만 오답 섹션을 자른다(`:334-335,386-387`). 없으면 `EXPLANATION_TAIL_RE` 가
오답 줄까지 해설로 흡수해 게이트가 `해설이 자리 번호(원문자)로 위치를 지칭함` 이라는
**거짓 원인**을 낸다(프로브 실증: 이 진단 + `오답해설 0개 (4개 필요)` + `누락 라벨: ①②④⑤`).
→ **`오답:` 은 단독 줄로 반드시 존재해야 한다.**

**7-3. 정답 번호를 임의로 고를 수 없다.**
게이트가 마커마다 삽입문장을 되끼워 원 지문 복원이 성립하는 자리를 계산한다(`:359-368`).
`정답:` 만 고치면 `정답 불일치 — … 복원되는 자리는 [[3]] 인데 정답은 ④ 로 표시됨`.
→ 정답 위치를 옮기고 싶으면 **빼낼 문장 또는 마커 배치를 바꿔라.**

**7-4. 정답은 `[[1]]` 도 `[[N]]` 도 될 수 없다.**
양끝은 한쪽 고리만 보면 풀려 변별력이 죽는다. fast 레인은 warning 이지만 **md 는 반려로 승격**했다
(`:369-374`). 자리 5개면 정답은 `②③④` 중 하나다.

**7-5. 지문의 첫 문장은 빼낼 수 없다.**
앞 고리가 존재하지 않는다. 게이트(`:337-340`)와 어댑터(`adapter-sentence-insert.ts:64-66`)와
후처리(`processors/sentence-insert.ts:70-77`) **세 곳에서** 막는다.

**7-6. 빼낸 문장 자리에 마커가 없으면 정답을 매길 수 없다.**
후처리가 `markerMap.get(omittedIndex-1)` 로 정답을 재키잉하기 때문이다
(`processors/sentence-insert.ts:147-156`). 게이트가 선반영한다(`:343-350`).
→ **마커 배치 규칙 1순위: "빼낸 자리에 반드시 마커".**

**7-7. 마커는 문장 경계에만. 단어 한복판·쉼표 뒤·절 경계는 전부 반려.**
`[[2]] 이(가) 문장 경계가 아님 — 직전이 '…' 로 끝난다`(`:220-227`, 프로브 실증).
반대로 마침표에 **붙여 쓴** 마커(`designs.[[1]]Field`)는 흡수되고,
낱말 뒤 + 구두점 앞(`establish[[3]].`)도 유령 공백 없이 흡수된다(`:103-104,126-133`) —
후자는 「문장 경계가 아님」이라는 **참 진단**이 나온다.

**7-8. 마커 번호는 지문 등장 순서와 같아야 한다.**
`[[1]][[3]][[2]]…` 처럼 뒤섞으면 `마커 번호가 지문 등장순 1..5 이 아님`(`:300-306`).
학생 표면 번호는 **등장순으로 다시 매겨지므로** 어긋나면 정답 라벨이 어느 자리인지 확정되지 않는다.

**7-9. 범위 밖 마커는 조용히 사라지지 않는다.**
`[[9]]`·`[[0]]`·`[[10]]` 도 전부 수집되어 마커 개수에 포함된다(`parser-sentence-insert.ts:29-35`).
프로브 실증: 자리 5개에 `[[9]]` 하나를 더하면 `삽입 자리 마커 6개 (5개 필요 …). 마커 번호가 자리 범위(1~5) 밖: [[9]]`.

**7-10. 주어진 문장에 응집 단서가 없으면 복수정답이다.**
사전은 `validators/sentence-insert.ts:7-20` — 지시어/대명사(`this that these those such it its they them their he she his her him`)
또는 연결사(`however yet instead nevertheless nonetheless therefore thus hence consequently for example for instance
moreover furthermore in addition besides also then later subsequently afterwards meanwhile on the contrary
in contrast by contrast similarly likewise as a result`).
⚠ **`but` 은 이 사전에 없다.** `But …` 로만 시작하고 지시어가 없는 문장은 단서 0으로 판정될 수 있다.
(게이트의 변형 접두부 전용 사전 `INSERT_CONNECTIVE_RE` 에는 `but/still/though/while/whereas/rather` 가 추가돼 있다 —
`gate-sentence-insert.ts:114-118`. **두 사전은 다르다.**)

**7-11. 빼낸 문장과 거의 같은 문장이 지문에 남아 있으면 정답이 노출된다.**
유사도 0.72 이상이면 반려(`:45,384-399`). 병렬 나열·반복 구조 지문에서 자주 터진다.
→ 표적 문장을 고를 때 **지문 안에 그 문장의 쌍둥이가 없는지** 확인하라.

**7-12. 해설·오답해설에 원문자를 쓰면 즉시 반려.**
`/[①-⑧]/` 하나만 있어도 걸린다(`:413-417,437-444`). 위치는 반드시 **문장 내용을 인용해** 지목하라
(`"'That expense…' 문장 바로 앞 자리"`). 프로덕션에서 표시 번호와 어긋나 문항이 무효가 된 실측 사고가 근거다
(`prompts-sentence-insert.ts:183`).
⚠ 한국어 서수(`첫 번째 자리`)도 위험하다 — 정규식에는 안 걸리지만 렌더 번호와 어긋날 수 있다. **내용 인용만 써라.**

**7-13. 오답 목록에 정답 번호를 끼우면 간접 진단이 나온다.**
파서가 `label === answer` 인 줄을 조용히 지운다(`:396`). 프로브 실증: 라벨 `①②③④`(③이 정답)를 쓰면
`오답해설 3개 (4개 필요)` + `오답해설 누락 라벨: ⑤` — **진짜 원인을 아무도 말하지 않는다.**

**7-14. 두 문장을 한꺼번에 빼거나 반 문장만 빼면 「완결된 한 문장이 아님」.**
재구성은 성립하지만 `omittedIndex` 가 확정되지 않는다(`:315-319`).
토큰 수까지 대조하는 폴백이 있어 이 진단이 살아 있다(`parser-sentence-insert.ts:205-225`).

**7-15. 변형본은 "앞부분만" 다시 쓰는 것이다.**
꼬리 토큰이 축자와 `max(3, srcTokens×0.25)` 개 이상 일치해야 하고, 문장 전체를 다시 쓰면 반려
(`:172-179`). 접두부에서 지시어·연결사가 사라져도 반려(`:185-199`).
⚠ **단서 대조는 변형된 접두부에만 적용된다** — 꼬리를 축자 복사하도록 계약이 강제하므로
문장 전체를 보면 그 꼬리가 검사를 대신 통과시켜, 자리를 고정하던 지시어가 사라진 변형본도 클린이 됐던
실측 결함이 있었다(`:180-184`).

**7-16. 지문이 짧으면 이 유형은 성립하지 않는다 — 재생성으로 탈출 불가.**
`sentences.length < slotCount + 1` 이면 즉시 반려(`:271-274`).
프로브 실증(5문장 지문, 자리 5): `지문이 5문장뿐 — 자리 5개를 만들려면 6문장 이상이어야 한다`.
→ **자리 5 = 6문장 이상, 자리 8 = 9문장 이상.** 실무 하한은 10문장·150단어(마커를 고루 흩고
정답을 가운데에 두려면 여유가 필요하다).

**7-17. 해설의 영어 인용은 지문에 실재해야 한다.**
12자 이상 조각이 문항 표면에 없으면 `explanation-quoted-token-missing`
(`validators/explanation-quoted-tokens.ts:37-38`). 해설은 한국어·합니다체이며 영어는 **따옴표 안 인용만**
허용된다(품질 헌법 §5).

**7-18. 장식은 이 유형에서 흡수되지만, 그것을 계약으로 착각하면 유닛의 다른 유형이 죽는다.**
프로브 실증: `**정답:** **③**` · `## 번호지문:` · `- ① …` 전부 클린.
그러나 정본(빈칸·어법) 파서는 `decoration.ts` 를 쓰지 않아 같은 장식에서 필드가 증발한다
(`../recon/00-contract.md` §8). → **저작 규칙은 전 유형 공통 「장식 0」.**

---

## 8. 출제 포인트 다각화 축

> 한 지문에서 5~8문항. 이 유형의 다각화는 **"어느 문장을 빼내는가"** 가 절반, **"자리를 어떻게 배치하는가"** 가 절반이다.
> **하네스가 같은 문장을 두 번 빼내는 것을 차단한다**(`ANSWER_DUPLICATE`, `lane-sentence-insert.ts:195-205` →
> `qgen-core.ts:345-363`). 즉 **N문항 = 서로 다른 N개 문장**이 강제된다.
> 정답 번호만 다르게 하는 것은 다각화가 아니다.

### 8-A. 노브로 달라지는 축 (코드 근거 있음)

| 축 | 값 | 근거 | 다각화 효과 |
|---|---|---|---|
| **A1. 자리 수** | `slotCount` 5 / 6 / 7 / 8 | `lane-sentence-insert.ts:101-111` · `prompts-sentence-insert.ts:28-39` | 후보 자리가 늘수록 검산 부담이 커지고 오답 기제를 더 많이 심을 수 있다. 자리 8은 **9문장 이상** 지문에서만 가능. 유닛에 5·6·8을 섞으면 같은 지문이어도 표층 형식이 달라진다(헌법 §7-5) |
| **A2. 앞부분 변형** | `paraphrasePrefix` false / true | `lane-sentence-insert.ts:43-48,161` | **가장 큰 인지 축 변화.** false = 순수 응집 판정. true = 지문을 외운 학생의 **표면 대조 지름길을 끊고**, 재진술된 문장에서도 응집 단서를 읽어내는 능력을 추가로 요구한다. 유닛에 1~2문항만 배치 |
| **A3. 난이도** | `BASIC` / `INTERMEDIATE` / `KILLER` | `prompts-sentence-insert.ts:52-69` · 헌법 §4 | BASIC = 표면 단서 1개가 문장 **앞머리**에, 선행 내용은 정답 직전 문장에만. INTERMEDIATE = 전환점 문장 + **앞·뒤 고리 둘 다**, 단서를 주어·목적어 자리에 심음. KILLER = 앞·뒤 고리가 **서로 다른 종류의 장치**, 단서 2~3개가 정답 자리에 수렴하고 오답 자리에는 하나씩 분산, 어휘 겹침이 가장 많은 자리를 일부러 오답으로 |
| **A4. 응집장치 focus** | `pointFocus` + `variantIndex` 회전 | `sentence-insert-point-catalog.ts:134-141,169-178` | 기출 456문항 LLM 검증 코어 2종(참조 해소 49.3% · 대조 전환 32.2%)을 문항마다 돌려 지정 |
| **A5. 발문 언어** | `stemLanguage` ko/en | `lane-sentence-insert.ts:131-136,166-169` | 표층 형식 축. 유닛에 1~2문항만 en |

### 8-B. 설계로 달라지는 축 (교육적 판단 — 여기가 진짜 승부처)

**B1. 표적 문장 = 빼낼 문장 (★ 최우선 축, 하네스가 강제한다)**
`diversityTargets` 가 빼낸 문장 축자를 내보내므로 **문항마다 다른 문장을 빼야 한다.**
어느 문장을 뺄지는 곧 "글의 어느 이음매를 겨냥하는가"다. 지문의 논지 지도(`craft/00-AUTHORING.md` §2)에서:

| 표적 위치 | 겨냥하는 인지 작업 | 주의 |
|---|---|---|
| 도입 통념 직후(S2~S3) | 통념 → 반박의 전환 인식 | 첫 문장(S1)은 금지 |
| 기제 설명 한복판 | 인과 사슬의 한 고리 복원 | 앞뒤 고리 둘 다 걸어야 한다 |
| 사례 도입부 | 일반 → 예시 순서 판정 | ⚠ **병렬 예시 나열 구간의 "총괄 일반화 문장"은 금지** — 어느 예시 앞에 넣어도 읽혀 복수정답(실측 최다 원인, `prompts-sentence-insert.ts:68`) |
| 결론 직전 전환 | 논지 마무리 방향 판정 | 정답이 마지막 자리(양끝)가 되지 않게 마커를 더 뒤에도 두어라 |

**B2. 응집장치 종류 (기출 456문항 LLM 검증 분포 — `sentence-insert-point-catalog.ts:45-126`)**

| 코드 | 이름 | 기출 비중 | 신호 |
|---|---|---|---|
| `anaphora_reference` | 참조 해소 | **49.3%** (코어) | `this/these/that/those/such+명사`·`it/they`·`the+구정보명사` 의 선행어가 정답 직전에만 존재 |
| `contrast_reversal` | 대조 전환 | **32.2%** (코어) | `However/Yet/Instead/Rather/On the other hand/not A but B` — 표지뿐 아니라 **내용이 정반대**여야 진짜 대조 |
| `cause_effect` | 인과·결과 | 4.4% (보조) | `Therefore/Thus/As a result/Hence/This is because` — 원인(결과)이 직전(직후)에만 |
| `addition_extension` | 첨가·심화 | 3.9% (희소) | `Moreover/In addition/not only~but also` |
| `example_elaboration` | 예시·구체화 | 3.7% (희소) | `For example/For instance` — 일반 명제가 바로 앞에 |
| `coherence_bridge` | 표지 없는 담화 연속 | 3.5% (희소) | 화제 연속만 — **정답 복수화 위험 최대** |
| `temporal_sequence` | 시간·절차 순서 | 2.9% (희소) | `Then/Next/After/Subsequently` |

→ **유닛 5문항이면 코어 2종(참조 해소·대조 전환)을 각각 2회 + 보조 인과 1회** 정도가 기출 정합적이다.
→ ⚠ **최대 혼동축**: 주어진 문장에 `but/however` 가 있어도 자리를 실제로 고정하는 것이 역참조면
그건 **대조 전환이 아니라 참조 해소**다(`sentence-insert-point-catalog.ts:69`). `point:` 에 정확히 라벨링하라.
→ 희소 축(첨가·예시·담화연속·시간순서)에 2문항 이상 기대지 마라.

**B3. 고리 구성 — 앞 고리 / 뒤 고리 / 양방향**
같은 문장을 빼더라도 "학생이 무엇을 검산해야 하는가"를 이동시킬 수 있다.

| 구성 | 설계 | 난이도 효과 |
|---|---|---|
| 앞 고리 단독 | 주어진 문장이 앞을 되받기만 함 | 뒤쪽 자리들이 전부 그럴듯해져 **쉬워지지 않는다 — 오히려 복수정답 위험** |
| 뒤 고리 단독 | 정답 직후 문장이 주어진 문장을 받음 | 앞쪽 자리들이 살아난다. 단독 사용 비권장 |
| **양방향(권장)** | 둘 다 | 자리가 두 겹으로 확정. 학생은 양쪽을 다 검산해야 한다 |
| **축 어긋난 양방향(KILLER)** | 앞은 대조 전환, 뒤는 지시 해소 — **다른 종류의 장치** | 굵은 연결사 하나로 결정되지 않는다(`prompts-sentence-insert.ts:64`) |

**B4. 마커 배치 = 오답 자리 설계 (★ 두 번째 축)**
빼낸 문장이 같아도(→ 실제로는 금지되지만) 마커를 어디에 두느냐로 문항이 달라진다.
**같은 표적 문장 + 다른 마커 배치**는 유닛 안에서 쓸 수 없으므로, **표적을 바꿀 때 마커 전략도 함께 바꿔라.**

- **정답 위치 분산** — 자리 5면 `②③④` 중 하나. 유닛 5문항이면 ②②③③④ 처럼 몰지 말고 고르게.
  (셔플이 없으므로 저작자가 유일한 통제자다.)
- **마커 간격** — 균등(2문장마다) vs 비균등(정답 근처를 조밀하게). 조밀하면 near-miss 검산 부담이 커진다.
- **정답 인접 자리의 강도** — 정답 바로 앞/뒤 자리를 최강 미끼로 만들 것인가, 멀리 둘 것인가.

**B5. 오답 자리 5기제 (`prompts-sentence-insert.ts:72-81` — 헌법 §3 (L,F) 팔레트의 이 유형 번안)**

| 기제 | 설명 | (L,F) 대응 |
|---|---|---|
| 1. **어휘 미끼** | 인접 문장이 같은 키워드·동의어를 가져 관련돼 보이나 지시·논리 조건이 안 맞음 | L1 + F1 |
| 2. **단방향 정합** | 앞 고리만(또는 뒤 고리만) 닫히고 반대쪽이 끊김 | L2 + F1 |
| 3. **선행사 미도입** | 지시어·정관사 명사가 아직 도입되지 않은 앞쪽 자리로 유인 | L4 + F2 |
| 4. **연결 논리 오정렬** | 연결사가 표시하는 논리(역접·인과)가 그 자리 두 문장 관계와 비슷하나 정확히는 어긋남 | L5 + F1 |
| 5. **대명사 오연결** | 직전에 선행사처럼 보이는 명사를 두되, 받으면 직후 문장의 지시 사슬이 수·의미에서 모순 | L6 + F6 |

**같은 기제를 한 문항에 두 번 쓰지 마라.** 문항마다 4~7개 슬롯의 조합을 달리 짜면
5문항이 서로 다른 오답 팔레트를 갖는다.
**최강 미끼 1개 의무**(기제 2 또는 4 계열)를 `craft:` 에 명시하라.
**즉사 오답 금지**: 오답 (N−1)개 중 **최소 2개는 상위권도 앞뒤 고리를 실제로 검산해야** 지울 수 있어야 한다
(`prompts-sentence-insert.ts:181`).

**B6. 해설 초점**
해설은 **딱 2문장**이 계약이므로(`prompts-sentence-insert.ts:101`) 초점을 명시적으로 골라야 한다:
(a) 앞 고리 · 뒤 고리를 한 문장씩 / (b) 결정적 고리 하나를 파고들고 나머지는 요약 /
(c) 최강 미끼 자리가 왜 깨지는지 대조. 문항마다 초점을 바꿔라.

### 8-C. 유닛 5문항 설계 예시 (충돌 없는 조합)

| # | 난이도 | slotCount | paraphrase | 표적 문장(빼낼 문장) | 응집장치 | 고리 구성 | 정답 자리 | 최강 미끼 기제 |
|---|---|---|---|---|---|---|---|---|
| 1 | BASIC | 5 | false | S3 (통념→반박 전환) | 참조 해소 | 양방향 | ② | 3. 선행사 미도입 |
| 2 | INTERMEDIATE | 5 | false | S6 (기제 설명 한복판) | 대조 전환 | 양방향 | ③ | 1. 어휘 미끼 |
| 3 | INTERMEDIATE | 6 | true | S5 (사례 도입부) | 참조 해소 | 앞 고리 강 + 뒤 고리 약 | ④ | 2. 단방향 정합 |
| 4 | KILLER | 5 | false | S8 (결론 직전 전환) | 인과·결과 | 축 어긋난 양방향 | ④ | 4. 연결 논리 오정렬 |
| 5 | KILLER | 8 | false | S4 (실험 결과 진술) | 대조 전환 | 축 어긋난 양방향 | ⑤ | 5. 대명사 오연결 |

**검산**:
- `point:` 5개가 전부 다른가 (`POINT_DUPLICATE`)
- **빼낸 문장 5개가 전부 다른가** (`ANSWER_DUPLICATE` — 이 유형의 하드 축)
- 정답이 전부 가운데 자리인가 (①·마지막 금지)
- 정답 번호가 고르게 흩어졌는가 (셔플 없음)
- 각 문항의 지문 문장 수가 `slotCount+1` 을 만족하는가
- 난이도 배분이 헌법 §4 를 만족하는가 (5문항 = B1/I2/K2)

**⚠ 지문이 짧아 표적 문장을 5개 못 뽑으면 문항 수를 줄여라** — 헌법 §9-10(수를 채우려고 품질을 낮추지 않는다).
빼낼 수 있는 문장은 **S2 이후 + 응집 단서 보유 + 지문에 쌍둥이 문장 없음** 을 모두 만족하는 것뿐이다.

---

## 검증 기록

`qbank/work/_probe-SENTENCE_INSERT.ts` (tsx 실행, 2026-07-28):

```
── 지문 계측 ──
passage: 158단어 / 10문장
splitIntoSentences: 10문장 · 원본 배열과 일치=true
삽입문장(S[5]): 14단어 · 변형본: 15단어
layout: omittedIndex=5 · matchingGaps=[2] · afterDisplayIndex=[0,2,4,6,8]

PASS 골격 A — 자리 5개 기본형(정답 ③)
   markerAfterSentenceIndices=[0,2,4,7,9] · adapter correctAnswer=3 · post correctAnswer=③ · omittedIndex=5
PASS 골격 B — 자리 8개(정답 ⑤)
   markerAfterSentenceIndices=[0,1,2,3,4,6,7,8] · adapter correctAnswer=5 · post correctAnswer=⑤ · omittedIndex=5
PASS 골격 C — paraphrasePrefix 2단 출력
   markerAfterSentenceIndices=[0,2,4,7,9] · adapter correctAnswer=3 · post correctAnswer=③ · omittedIndex=5

── 함정 실증 ──
PASS 서술형 머리표 `모범답안:` 오용 → 지문 재구성 불일치 … / 정답 누락
PASS `오답:` 머리표 누락 → 해설이 자리 번호(원문자)로 위치를 지칭함 … / 오답해설 0개 (4개 필요) / 오답해설 누락 라벨: ①②④⑤
PASS 마커 밖 지문 1단어 수정 → 지문 재구성 불일치 …
PASS 삽입문장을 지어냄 → 삽입문장이 지문 축자가 아님 …
PASS 정답을 다른 자리로 표기 → 정답 불일치 — … 복원되는 자리는 [[3]] 인데 정답은 ④ 로 표시됨
PASS 해설에 자리 번호(원문자) 사용 → 해설이 자리 번호(원문자)로 위치를 지칭함 …
PASS 마커를 문장 한가운데 배치 → [[2]] 이(가) 문장 경계가 아님 …
PASS 마커 개수 부족 → 삽입 자리 마커 4개 (5개 필요 — [[1]]~[[5]])
PASS 자리 범위 밖 마커 [[9]] → 삽입 자리 마커 6개 … 마커 번호가 자리 범위(1~5) 밖: [[9]]
PASS 번호지문 맨 앞 마커 → [[1]] 이(가) 지문 맨 앞에 있음 …
PASS 오답해설에 정답 번호 포함 → 오답해설 3개 (4개 필요) / 오답해설 누락 라벨: ⑤
PASS 변형 설정 꺼짐인데 변형 줄 출력 → 주어진 문장 변형 설정이 꺼져 있는데 '삽입문장(변형):' 줄이 출력됨
PASS 변형본이 되받는 지시어를 지움 → 삽입문장 변형본에서 앞 내용을 되받는 지시어·대명사가 사라짐 …
PASS 지문 첫 문장 추출 → 지문의 첫 문장을 빼냈음 — 첫 문장은 뺄 수 없다 …
     짧은 지문(72단어/5문장): 지문이 5문장뿐 — 자리 5개를 만들려면 6문장 이상이어야 한다 …
PASS 정답이 양끝 자리(①) → 정답이 양끝 자리(①) — 가운데 자리(②③④)가 되도록 빼낼 문장을 다시 골라라

── 장식 관용(참고) ──
흡수 `**정답:** **③**` → (클린)
흡수 `## 번호지문:` → (클린)
흡수 오답 라벨 불릿 `- ①` → (클린)

전 골격 통과
```

경로: `parseAndGate`(gateIssues 0) → `adapt`(ok) → `postProcessQuestion`(재키잉 경고 0) →
`validateQuestionQuality`(error 0).
