# 네모 어법 (GRAMMAR_CHOICE_COMBO)

> **분류** 어법(객관식 5지선다·조합형) · **지문변형** ○ (마커 3곳만, 그 밖은 1글자도 금지) · **정답 머리표** `정답:` (원문자 ①~⑤) · **최소 지문 길이** 코드 강제 없음 / 실무 하한 90단어(판단 — 3문장 이상 + 유닛 5~8문항 × 3표적 비중복)
>
> 필수 섹션 6개: `네모지문:` `원형·포인트:` `선지:` `정답:` `해설:` `오답:`
> 진실원 파일: `src/lib/md-qgen/parser-combo.ts` · `src/lib/md-qgen/gate-combo.ts`
> 검증: `qbank/work/_probe-GRAMMAR_CHOICE_COMBO.ts` — **24/24 통과** (verified=true)

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문 안 세 곳에 `(A) [ 후보1 / 후보2 ]` 네모가 박히고, 학생은 **세 자리 전부**를 각각 판정한 뒤
그 판정 결과의 **조합**을 5개 선지에서 고른다.

밑줄 어법(`GRAMMAR_ERROR`)과 결정적으로 다른 세 가지:

| 축 | 밑줄 어법 | **네모 어법** |
|---|---|---|
| 과제 | 5곳 중 **틀린 1곳 찾기** | 3곳 각각에서 **둘 중 옳은 쪽 고르기** |
| 정답 키 | 라벨 1개 | **세 자리의 조합** (부분 정답 없음) |
| 디코이 자리 | 정문 4곳이 디코이 | **디코이 자리가 0** — 세 네모가 전부 정답 포인트다 (`lane-combo.ts:133`) |
| 지문 변형량 | 정답 자리 1곳만 오류 주입 | **0곳** — 원문은 항상 옳고, 틀린 후보는 네모 안에만 존재한다 (`parser-combo.ts:12-14`) |

인지 부하의 원천은 "세 번의 독립 판정 + 조합 소거"다. 한 자리만 확신해도 선지가 2~3개로 줄지만
확정되지는 않는다 — 그래서 **near-miss 선지(한 자리만 틀린 선지)가 게이트 필수 요건**이다
(`gate-combo.ts:267-269`). 한 자리만 검증하고 넘어가는 풀이를 구조적으로 차단하는 장치다.

두 후보가 나란히 보이므로, 틀린 후보가 **어떤 통사 해석으로도** 성립하면 즉시 복수정답이 된다.
게이트가 시제 단독 토글·수량 의미토글·지각동사 보어 토글을 **하드 반려**하는 이유가 이것이다
(`gate-combo.ts:206-219`).

---

## 2. 마크다운 골격

### 2-1. 복붙 가능한 실물 골격

````md
<!-- ITEM <n>
difficulty: <BASIC|INTERMEDIATE|KILLER>
point: <이 문항이 겨냥하는 출제 포인트 한 줄 — 유닛 내 전부 달라야 한다>
craft: <설계 메모 — 게이트 대상 아님>
-->
네모지문:
<지문 전문을 한 글자도 바꾸지 않고 그대로. 단 세 곳만 [[A:올바른표현|틀린표현]] [[B:...]] [[C:...]] 로 감싼다. 파이프 왼쪽=원문 축자, 오른쪽=네가 만든 변형. 라벨은 지문 등장 순서대로 A→B→C.>

원형·포인트:
(A) <올바른 표현> | <틀린 표현> | <포인트코드 a~m 한 글자>
(B) <올바른 표현> | <틀린 표현> | <포인트코드>
(C) <올바른 표현> | <틀린 표현> | <포인트코드>

선지:
① <A값> …… <B값> …… <C값>
② <A값> …… <B값> …… <C값>
③ <A값> …… <B값> …… <C값>
④ <A값> …… <B값> …… <C값>
⑤ <A값> …… <B값> …… <C값>
정답: <①~⑤ 중 세 자리 전부 올바른 유일한 조합>
해설: <한국어 합니다체. (A)→(B)→(C) 순으로 각 자리가 왜 옳은지 구조 근거. KILLER 는 80자 이상.>
오답:
① <이 조합의 어느 네모가 왜 틀렸는지 1문장>
② <…>
④ <…>
⑤ <…>
````

> `<!-- ITEM n ... -->` 블록은 **qbank 컨테이너 규약**이다(`qbank/harness/qgen-core.ts:47`).
> md-qgen 계약 대상은 그 아래 본문뿐이다. 컨테이너를 md-qgen 파서에 그대로 넣어도 무해하지만,
> 하네스가 잘라 넣는 것이 정본 경로다.

### 2-2. 검증된 정상 픽스처 전문 (`scripts/_test-md-combo.ts:36-66` verbatim)

지문 (`PASSAGE`):

```
Urban canopies cool dense blocks, yet the benefit that these canopies provide disappears when roots have no room to spread. Soil compacted by heavy construction traffic holds almost no water, so young trees starve within a single dry summer. Planners who understand this widen the trenches, add structural soil, and protect the root zone before a single sapling arrives.
```

문항 마크다운 (`GOOD`):

```md
네모지문:
Urban canopies cool dense blocks, yet the benefit that these canopies [[A:provide|provides]] disappears when roots have no room to spread. Soil [[B:compacted|compacting]] by heavy construction traffic holds almost no water, so young trees starve within a single dry summer. Planners who understand this widen the trenches, add structural soil, and [[C:protect|protecting]] the root zone before a single sapling arrives.

원형·포인트:
(A) provide | provides | d
(B) compacted | compacting | c
(C) protect | protecting | i

선지:
① provides …… compacted …… protect
② provide …… compacting …… protecting
③ provide …… compacted …… protect
④ provides …… compacting …… protect
⑤ provide …… compacted …… protecting
정답: ③
해설: (A)는 관계절의 선행사가 복수인 these canopies 이므로 복수 동사 provide 가 옳고, (B)는 뒤에 by 행위자구가 이어져 흙이 다져지는 쪽이므로 과거분사 compacted 가 옳습니다. (C)는 앞의 widen, add 와 등위로 이어지는 자리라 같은 형태의 protect 가 옳습니다.
오답:
① (A)의 provides 는 선행사 these canopies 의 수와 어긋납니다.
② (B)의 compacting 은 능동이라 by 행위자구와 충돌하고, (C)의 protecting 은 등위 짝의 형태를 깨뜨립니다.
④ (A)의 provides 가 수일치를 깨고, (B)의 compacting 이 태를 뒤집습니다.
⑤ (C)의 protecting 은 widen, add 와 병렬을 이루지 못합니다.
```

이 픽스처의 선지 행렬 설계(그대로 복제 가능한 표준형):

| 선지 | (A) | (B) | (C) | wrongness |
|---|---|---|---|---|
| ① | ✗ | ○ | ○ | 1 (near-miss) |
| ② | ○ | ✗ | ✗ | 2 |
| ③ | ○ | ○ | ○ | **0 = 정답** |
| ④ | ✗ | ✗ | ○ | 2 |
| ⑤ | ○ | ○ | ✗ | 1 (near-miss) |

세 네모의 틀린 후보가 각각 2회씩 등장 → `틀린 후보 미사용` 반려 회피. 조합 5개 전부 상이.

### 2-3. 정찰이 새로 작성해 통과시킨 골격 구현본 (probe P2 — gate 0 / adapt ok / quality error 0)

지문:

```
Museums that once locked their archives away now publish them online, and the shift has changed who gets to write history. Records digitized by volunteer teams reach students in towns without a single research library. Curators who welcome this trend catalogue the files, translate the labels, and invite readers to correct the errors they find.
```

```md
네모지문:
Museums that once locked their archives away now [[A:publish|publishes]] them online, and the shift has changed who gets to write history. Records [[B:digitized|digitizing]] by volunteer teams reach students in towns without a single research library. Curators who welcome this trend catalogue the files, translate the labels, and [[C:invite|inviting]] readers to correct the errors they find.

원형·포인트:
(A) publish | publishes | d
(B) digitized | digitizing | c
(C) invite | inviting | i

선지:
① publishes …… digitized …… invite
② publish …… digitizing …… inviting
③ publish …… digitized …… invite
④ publishes …… digitizing …… invite
⑤ publish …… digitized …… inviting
정답: ③
해설: (A)는 관계절 that once locked their archives away 를 건너뛴 주어가 복수 Museums 이므로 복수 동사 publish 가 옳고, (B)는 뒤에 by volunteer teams 라는 행위자구가 이어져 기록이 디지털화되는 쪽이므로 과거분사 digitized 가 옳습니다. (C)는 앞의 catalogue, translate 와 등위로 묶이는 자리라 같은 형태의 invite 가 옳습니다.
오답:
① (A)의 publishes 는 관계절에 가려진 복수 주어 Museums 와 수가 어긋납니다.
② (B)의 digitizing 은 능동이라 by 행위자구와 충돌하고, (C)의 inviting 은 등위 짝의 형태를 깨뜨립니다.
④ (A)의 publishes 가 수일치를 깨고, (B)의 digitizing 이 태를 뒤집습니다.
⑤ (C)의 inviting 은 catalogue, translate 와 병렬을 이루지 못합니다.
```

---

## 3. 파서 계약 (★ 가장 중요)

파서는 **관대**하고 게이트는 **엄격**하다(`parser-combo.ts:3-4`). 아래는 파서가 실제로 요구하는 것 전부다.
`prompts-combo.ts` 의 지시문은 참고자료일 뿐, **계약은 이 절이다.**

### 3-1. 섹션 추출 정규식 (전 6종)

| # | 대상 | 정규식 원문 | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|
| R1 | 네모지문 | `/^네모지문:\s*\n([\s\S]*?)(?=^원형·포인트:\|^원형:\|^선지:)/m` → `.trim()` | `parser-combo.ts:125` | `markedPassage=""` → 게이트 **즉시 반려 `네모지문 누락`** (다른 검사 전부 스킵) |
| R2 | 원형·포인트 | `/^원형·포인트:\s*\n([\s\S]*?)(?=^선지:\|^정답:)/m` (폴백 `^원형:`) | `parser-combo.ts:128-130` | 슬롯 0개 → `원형·포인트 항목 0개 (3개 필요)` 즉시 반려 |
| R3 | 슬롯 줄 | `/^[([]?([A-Ca-c])[)\].]?\s*(.+?)\s*\|\s*(.+?)\s*\|\s*\(?\s*([a-mA-M])\s*\)?(?:\s+[^\|]*)?$/gm` | `parser-combo.ts:133-135` | 그 줄만 조용히 누락 → 슬롯 개수 미달 반려 |
| R4 | 선지 | `/^([①②③④⑤])\s*(.+)$/gm` (`선지:` 헤더 뒤 전부, 헤더 없으면 메타 뒤) | `parser-combo.ts:144-157` | 그 줄만 누락 → `선지 4개 (5개 필요)` |
| R5 | 정답 | `/^정답:\s*([①②③④⑤])/m` | `parser-combo.ts:159` | `answer=""` → `정답 누락` |
| R6 | 해설 | `/^해설:\s*([\s\S]*?)(?=^오답:\|^정답:\|^선지:\|^네모지문:\|^원형·포인트:\|^원형:)/m`, 폴백 `/^해설:\s*([\s\S]+)$/m` | `parser-combo.ts:177-181` | `explanation=""` → `해설 누락` |
| R7 | 오답 | `text.split(/^오답:\s*$/m)[1]` (폴백 `/^오답:/m`) 뒤에서 `/^([①②③④⑤])\s*(.+)$/gm`, **정답 라벨 항목은 제거** | `parser-combo.ts:160-166` | `오답해설 0개 (4개 필요)` |

**전부 `^` 앵커 + `m` 플래그 = 머리표는 반드시 줄 첫 칸에서 시작한다.**
`R1` 만 `\s*\n` 을 요구한다 — **`네모지문:` 다음 줄부터** 본문이다(같은 줄에 붙이면 첫 줄이 날아간다).

### 3-2. 인라인 네모 마커

```
COMBO_INLINE_MARK_RE = /\[\[([A-C]):((?:(?!\]\]).)+)\]\]/g      // parser-combo.ts:28
```

- 라벨은 **`A`·`B`·`C` 대문자만.** `[[D:...]]`·`[[a:...]]` 는 **매칭 자체가 안 되어** 리터럴 텍스트로 남는다
  → 마커 개수 부족(`네모 마커 2개`) 또는 **`지문 재구성 불일치`**. (probe P5-g / `[[D:]]` 4번째 삽입 실측)
- 내용은 `((?!\]\]).)+` — `.` 은 **개행을 매치하지 않는다**. **마커가 줄바꿈을 건너뛸 수 없다.**
- 파이프 분해는 정규식 밖에서 `m[2].split("|").map(trim)` (`parser-combo.ts:83`).
  → 파이프를 빠뜨리면 후보 1개로 남아 `네모 후보 1개` 반려(마커 자체가 사라지지는 않는다 — 의도된 관대 설계 `parser-combo.ts:23-26`).
  → **파이프를 2개 이상 쓰면 후보 3개**가 되어 같은 사유로 반려.
- 좌우 순서 고정: **왼쪽 = 어법상 옳은 표현 = 원문 축자**, 오른쪽 = 틀린 표현.
  뒤집으면 `지문 재구성 불일치` (probe P5-l).

### 3-3. ★ 지문 재구성 대조 — 이 유형 최강 불변식

```ts
const rebuilt = rebuildComboWithSlots(q);                                  // parser-combo.ts:111-116
normalizeWs(rebuilt.text) === normalizeWs(passage)                         // gate-combo.ts:357-361
```

마커를 **슬롯 메타의 `correct` 값**으로 되돌린 텍스트가 원 지문과 같아야 한다.
`normalizeWs` (`parser.ts:66-74`) 가 흡수하는 것은 **곱슬따옴표 → 곧은따옴표 · en/em dash → `-` · `…` → `...` · 연속 공백 축약 · 양끝 trim** 뿐.
→ **대소문자·구두점·관사·복수형 그 어떤 차이도 반려다.** 공백 축약 덕에 **문단 개행 삽입은 안전**하다(probe P5-j).

> 코퍼스 실측: 기출 지문에 개행은 0건(`qbank/spec/corpus-stats.json` `hygiene.hasNewline: 0`) —
> 네모지문은 **한 줄**로 쓰는 것이 정본이다.

### 3-4. 슬롯 메타 줄 (`원형·포인트:`)

```
(A) <올바른 표현> | <틀린 표현> | <코드>
```

- 라벨 관용: `(A)` `A)` `[A]` `A.` `a)` 전부 흡수 → `comboParenLabel` 이 `(A)` 로 정규화 (`parser-combo.ts:66-69`).
- 구분자는 **파이프 `|` 정확히 2개.** `\s*\|\s*` 라 주변 공백은 자유.
- 코드는 **`a`~`m` 한 글자**. `(d)` 처럼 괄호를 씌워도 되고, 뒤에 한글 설명을 붙여도 흡수된다
  (`(?:\s+[^|]*)?$` — probe P5-k). **단 설명 안에 `|` 가 있으면 줄 전체가 매칭 실패한다.**
- 코드 닫힌 집합(`adapter.ts:28-43` `POINT_NAME`):
  `a`정동사·준동사 `b`관계사 `c`분사 `d`수일치 `e`능·수동태 `f`형용사·부사 `g`대명사
  `h`목적격보어 `i`병렬 `j`가정법 `k`부정사·동명사 `l`전치사·접속사 `m`비교구문
- **표 파이프 문법 금지**: `| (A) | x | y | d |` 로 쓰면 파이프가 4개라 줄이 통째로 실패한다
  (실측: `원형·포인트 항목 2개 (3개 필요)`).

### 3-5. 선지 줄

- 라벨은 **원문자 `①②③④⑤`** 를 줄 첫 칸에. **정확히 5개.**
- 값 구분자 계약 리터럴은 **` …… `**(공백 + `…` 2개 + 공백, `prompts-combo.ts:39`).
  파서 분해는 `/\s*(?:…+|\.{3,})\s*/` (`parser-combo.ts:31`) — `…` 1개도, `...` 3점도 흡수한다
  (probe P5-d/e). **하지만 저작 규칙은 ` …… ` 고정**이다(드리프트를 스스로 만들지 마라).
- `-` `/` `|` 로 연결하면 값이 1개로 뭉쳐 `선지 ① 값 1개 — 네모 3개와 불일치` 반려.
- 각 값은 그 자리 두 후보 중 하나와 **`comboCmp`(= normalizeWs + toLowerCase, `parser-combo.ts:72-74`) 기준으로 일치**해야 한다.
  대소문자·공백만 다르면 오토스냅 S3 가 정본 표기로 교정한다(`parser-combo.ts:235-250`).

### 3-6. 첫 매치 규칙 · 섹션 순서

- `R5`(정답)·`R6`(해설)·`R1`(네모지문)은 **`m` 플래그 단발 match = 첫 매치만** 취한다.
  → **한 파일에 2문항을 붙이면 2번째가 조용히 사라진다.** 1 md 문서 = 1문항(00-contract §3).
- 섹션 순서는 자유롭다. `해설:` 이 `정답:` 보다 앞서도 lookahead 가 `^정답:` 을 막아 흡수하지 않는다
  (`parser-combo.ts:177-179`). 그래도 **정본 순서(네모지문 → 원형·포인트 → 선지 → 정답 → 해설 → 오답)를 지켜라.**
- `오답:` 뒤 항목의 **순서는 무관**(집합 판정, probe P5-m). 다만 **정답 라벨 항목은 파서가 제거**한다.
- 오답 섹션 뒤에 원문자로 시작하지 않는 잡문이 붙어도 무해하다(probe P5-i). **그래도 쓰지 마라.**

### 3-7. ★ 장식(마크다운 강조) 전면 금지 — 실측 근거

`parser-combo.ts` 는 `decoration.ts` 를 **import 하지 않는다.** 머리표에 장식을 붙이면 그 섹션이 통째로 사라지고
게이트가 **거짓 원인**을 지목한다.

| 저작 실수 | 실제 게이트 출력 | probe |
|---|---|---|
| `**정답:** ③` | `["정답 누락"]` | P5-a |
| `**해설:** …` | `["해설 누락"]` | P5-c |
| `## 네모지문:` | `["네모지문 누락"]` | P5-b |
| `- ① a …… b …… c` | `["선지 4개 (5개 필요)", "오답해설 3개 (4개 필요)"]` | P5-f |
| `\| (A) \| x \| y \| d \|` | `["원형·포인트 항목 2개 (3개 필요)"]` | 실측 |

**→ 굵게·기울임·헤딩·불릿·인용·표·백틱을 어느 줄에도 쓰지 마라. 장식 0.**

### 3-8. 오토스냅 (0원 자동 보정 — 있어도 의존하지 마라)

`autoSnapComboSlots(q, passage)` (`parser-combo.ts:198-253`) 가 세 가지만 고친다:

| 코드 | 조건 | 동작 | file:line |
|---|---|---|---|
| S1 | 메타 `correct` ≠ 마커 왼쪽 **리터럴** && 마커 재구성만 원문과 일치 | 마커 왼쪽을 진실원으로 채택 | `:214-219` |
| S2 | 메타 `wrong` ≠ 마커 오른쪽 && 선지 값이 마커 쪽만 지지 | 마커 오른쪽 채택 | `:221-229` |
| S3 | 선지 값이 후보와 대소문자·공백만 다름 | 후보 정본 표기로 정규화 | `:235-250` |

보정 내역은 `corrections[]` 로 나오고 하네스에서 `AUTOSNAP` 경고로 기록된다.
**보정이 1건이라도 나오면 저작 실패로 간주하고 원본을 고쳐라** — 스냅은 방벽이지 면허가 아니다.

---

## 4. 게이트 체크리스트 — 반려 사유 문자열 전수

`gateMdCombo(q, passage, {slotCount:3, optionCount:5})` (`gate-combo.ts:309-434`).
**빈 배열이면 클린.** `${}` 는 런타임 치환 자리.

### 4-1. 즉시 반려(early return — 나머지 검사 전부 스킵)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `네모지문 누락` | `markedPassage` 가 빈 문자열 | `gate-combo.ts:320` |
| `네모 마커 ${n}개 (3개 필요)` | `[[A-C:…]]` 매치 수 ≠ 3 | `gate-combo.ts:322` |
| `원형·포인트 항목 ${n}개 (3개 필요)` | 슬롯 줄 파싱 결과 ≠ 3 | `gate-combo.ts:323-325` |

### 4-2. 라벨 축 · 마커/메타 정합

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `네모 라벨이 지문 등장순 (A)(B)(C) 이 아님 — 실제 ${실제}` | 마커 등장 순서가 A→B→C 가 아님 | `gate-combo.ts:329-331` |
| `원형·포인트 라벨 순서 오류 — (A)(B)(C) 필요` | 슬롯 줄 순서가 A→B→C 가 아님 | `gate-combo.ts:332-334` |
| `${라벨} 네모 마커가 지문에 없음` | 메타 라벨에 대응하는 마커 부재 | `gate-combo.ts:341` |
| `${라벨} 네모 후보 ${n}개 — '올바름\|틀림' 두 개여야 함` | 파이프 분해 결과 ≠ 2 또는 빈 값 포함 | `gate-combo.ts:345` |
| `${라벨} 올바른 표현이 마커 왼쪽과 불일치 ('${메타}' vs '${마커}')` | `comboCmp` 불일치 (S1 이 못 고친 경우) | `gate-combo.ts:349` |
| `${라벨} 틀린 표현이 마커 오른쪽과 불일치 ('${메타}' vs '${마커}')` | 〃 | `gate-combo.ts:352` |

### 4-3. ★ 지문 무결성

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 올바른 표현이 원문 축자가 아님` | `normalizeWs(rebuilt) !== normalizeWs(passage)` | `gate-combo.ts:356-361` |

> 이 하나가 걸리면 **#11·#12·#12b(누설·giveaway·오라벨)와 문맥 의존 게이트가 전부 스킵**된다
> (`gate-combo.ts:365-366, 377`). 재구성이 깨진 상태로 다른 검사가 클린하다고 착각하지 마라.

### 4-4. 슬롯 단위

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `${라벨} 후보 누락(올바른 표현·틀린 표현 필수)` | `correct` 또는 `wrong` 이 빈 값 | `gate-combo.ts:193` |
| `${라벨} 두 후보가 동일 — 변형되지 않음: '${값}'` | `comboCmp(correct) === comboCmp(wrong)` | `gate-combo.ts:194-196` |
| `${라벨} ${올바른 표현\|틀린 표현}에 금지 문자(/ [ ] \| …) 포함: '${값}'` | `/[/[\]\|…]/` 매치 | `gate-combo.ts:197-201` (상수 `:49`) |
| `${라벨} 포인트코드 누락 또는 범위 밖: '${코드}'` | `/^[a-m]$/` 불일치 | `gate-combo.ts:202-204` |
| `${라벨} 후보쌍 '${c}' ↔ '${w}' 가 시제 단독 교체 — 문맥상 둘 다 가능해 정답 시비` | `isDisputableTenseToggle` (규칙동사 현재↔과거, `did↔do/does`) | `gate-combo.ts:206-208` · `validators/grammar/combo.ts:41-70` |
| `${라벨} 수량 후보쌍 '${c}' ↔ '${w}' 정답 금지 — 둘 다 정문이고 의미만 다른 수량 토글(복수정답)` | `grammar-quantity-meaning-toggle` (few↔a few, little↔much, some↔any …) | `gate-combo.ts:212-216` · `validators/grammar/shared.ts:154-181` |
| `${라벨} 수량 후보쌍 … — 규범 대 실사용이 갈리는 논쟁쌍이거나 진짜 비교급 수식 자리가 아님(복수정답)` | `grammar-quantity-debatable` (fewer↔less, amount↔number, much↔very …) | 〃 `:182-185, 280-296` |
| `${라벨} 수량 후보쌍 … — 가산·불가산 양용 명사 앞이라 가산성 강제가 깨짐(복수정답)` | `grammar-quantity-ambiguous-noun` | 〃 `:196-275` |
| `${라벨} 후보쌍 '${c}' ↔ '${w}' 가 지각·사역동사 보어 자리 — 틀린 후보도 다른 파스로 정문이라 정답이 둘` | `findGrammarPerceptionComplementToggle` (see/watch/hear/feel/notice/observe/help + 목적어) | `gate-combo.ts:217-219` · `shared.ts:697+` |
| `포인트코드 중복 — ${코드들} (세 네모 모두 달라야 함)` | 세 코드에 중복 | `gate-combo.ts:370-373` |

> 수량·지각동사 두 게이트는 **재구성이 정합할 때만** 실행된다(문맥 창 ±60자, `gate-combo.ts:69-75, 209`).

### 4-5. 누설 · giveaway · 해설 오라벨 (재구성 정합 시에만)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `${라벨} 올바른 후보 '${c}' 가 네모 밖 지문에 그대로 남아 있음(정답 누설)` | 길이≥4 · 기능어 아님 · 면제목록 밖 · 네모 밖에 재등장 | `gate-combo.ts:103-105` |
| `${라벨} 틀린 후보 '${w}' 가 네모 밖 지문에 합법 표현으로 등장(정답 시비 위험)` | 〃 (wrong 쪽) | `gate-combo.ts:107-109` |
| `${라벨} 연어 '${직전단어} ${c}' 가 네모 밖 지문에 그대로 남아 있음(정답 누설)` | 직전 영단어+정답후보 연어가 밖에 재등장 (that/what 같은 면제 기능어의 유일한 통로) | `gate-combo.ts:111-116` |
| `${라벨} that·what 판단의 근거 패턴('인지 동사 + that + 완전절')이 네모 밖에 무마킹으로 남아 있음(패턴 누설)` | 후보쌍이 {that, what} 이고 `COGNITION_VERB_THAT_REGEX` 가 네모 밖에 매치 | `gate-combo.ts:118-122` · `validators/grammar/combo.ts:83-84` |
| `${라벨} 가 주격 관계대명사 '${prev}' 직후인데 준동사 후보를 제시 — 그 자리는 정동사 강제라 즉답 giveaway (수일치로 출제할 것)` | 직전 단어 ∈ {who, which, that} && 후보 중 하나가 `to V` 또는 단일토큰 `-ing` | `gate-combo.ts:386-393` · `validators/grammar/combo.ts:126-136` |
| `${라벨} 의 that 은 인지·단언 동사 뒤 명사절 보문소인데 해설이 관계대명사·목적어 결여로 설명 — 사실관계 오류다. …` | 후보쌍 {that, what} · 정답이 that · 네모 직전 80자가 인지동사로 끝남 · 해설/오답해설에 "관계대명사 that" 또는 "목적어가 빠져" 류 문구 | `gate-combo.ts:158-170, 394-396` |

**면제 기능어 목록**(단독 잔존은 봐주는 대신 연어로 잡는다) — `gate-combo.ts:52-53`:
`that what which this these those than then when where while there their they them have has had will would could should must does did not with from into been being`

### 4-6. 선지 형상 · 조합

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 ${n}개 (5개 필요)` | 원문자 줄 개수 ≠ 5 | `gate-combo.ts:401` |
| `선지 라벨이 ①②③④⑤ 순서가 아님` | 라벨 시퀀스 불일치 | `gate-combo.ts:402-408` |
| `선지 ${라벨} 값 ${n}개 — 네모 3개와 불일치하거나 빈 값 포함(구분자는 " …… ")` | 구분자 분해 결과 ≠ 3 또는 빈 값 | `gate-combo.ts:231-234` |
| `선지 ${라벨} 의 ${슬롯라벨} 값 '${v}' 이 두 후보 중 어느 쪽과도 다름` | 제3의 표현 | `gate-combo.ts:244-246` |
| `선지에 동일한 조합이 중복됨` | 조합 키 중복 | `gate-combo.ts:258` |
| `세 네모 전부 올바른 조합이 ${n}개 (정확히 1개 필요)` | all-correct 조합 개수 ≠ 1 | `gate-combo.ts:259-261` |
| `정답 라벨(${answer})이 전부-올바른 조합(${실제})을 가리키지 않음` | 정답 오지정 | `gate-combo.ts:264-266` |
| `한 네모만 틀린 near-miss 선지가 없음 (최소 1개 필요)` | wrongness == 1 인 선지가 0개 | `gate-combo.ts:267-269` |
| `${라벨} 의 틀린 후보가 오답 선지에 한 번도 등장하지 않음` | 어떤 슬롯의 wrong 이 미사용 | `gate-combo.ts:270-274` |
| `정답 누락` | `정답:` 줄 없음 / 원문자 없음 | `gate-combo.ts:262-263, 412-413` |
| `정답 라벨이 선지에 없음` | 정답 원문자가 선지 라벨에 부재 | `gate-combo.ts:414-415` |

### 4-7. 해설 · 오답해설

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `해설 누락` | `explanation` 빈 값 | `gate-combo.ts:419-420` |
| `해설이 슬롯 라벨에서 끊김 — 마지막 네모 설명이 통째로 누락(생성 절단)` | 해설 안 마지막 `(A~C)` 뒤에 실질 문자 0 | `gate-combo.ts:173-182, 422-423` |
| `해설에 '정답:' 라인이 섞임 — 학생 표면에 정답 번호가 노출됨(섹션 순서 드리프트)` | 해설 본문에 `^\s*정답\s*[:：]` | `gate-combo.ts:426-428` |
| `오답해설 ${n}개 (4개 필요)` | 오답 항목 수 ≠ 4 | `gate-combo.ts:288-290` |
| `오답해설 라벨 중복 — ${라벨들} (선지마다 정확히 하나)` | 라벨 집합에 중복 | `gate-combo.ts:291-293` |
| `오답해설 본문 없음 — 라벨만 찍고 내용이 비었음(생성 절단)` | 항목 본문이 공백 | `gate-combo.ts:294-296` |
| `오답해설 없는 선지 ${라벨들} — 정답 제외 선지 전부에 해설이 있어야 함` | 정답 제외 선지 중 미커버 | `gate-combo.ts:297-304` |
| `오답해설에 정답 라벨 포함` | `wrong[]` 에 정답 라벨 (파서가 걸러도 직접 주입 시) | `gate-combo.ts:431` |

### 4-8. 레인 추가 게이트

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `교사 지정 표현이 네모에 없음: '${text}'` | `ctx.teacherPoints` 가 있는데 어떤 슬롯의 `correct` 와도 부분일치하지 않음 | `lane-combo.ts:60-73` |

### 4-9. 유닛(qbank 하네스) 차단 — 문항 하나로는 보이지 않는다

| 코드 | 조건 | file:line |
|---|---|---|
| `CONTAINER` | `<!-- ITEM n -->` 헤더 누락·번호 비연속·`point:` 누락·본문 없음 | `qbank/harness/qgen-core.ts:57-85` |
| `ITEM_COUNT` | 문항 수 < `minItems`(기본 5) | `qgen-core.ts:229-236` |
| `POINT_DUPLICATE` | 두 문항의 `point:` 값이 정규화 후 동일 | `qgen-core.ts:325-333` |
| **`ANSWER_DUPLICATE`** | 두 문항의 `diversityTargets` 가 겹침 = **어떤 `correctExpression` 이 재사용됨** | `qgen-core.ts:336-353` · `lane-combo.ts:208-220` |
| `ADAPT` / `POSTPROCESS` | 어댑터·후처리 실패 | `qgen-core.ts:307-310` |
| `QUALITY:*` | `validateQuestionQuality` 의 error (프로덕션은 비차단, qbank 는 차단) | `qgen-core.ts:311` |

> **`ANSWER_DUPLICATE` 가 이 유형의 진짜 난관이다.** 5문항 = 15개, 8문항 = 24개의
> **서로 다른 정답 표현**이 한 지문에서 나와야 한다(probe P4 로 발화 실증).

### 4-10. 경고(비차단)이지만 알아야 할 것

| 코드 | 조건 | file:line |
|---|---|---|
| `few-key-points` | KILLER 인데 `keyPoints.length < 3` — **어댑터가 항상 `[]` 라 KILLER 전건 발생**(구조적, 무시) | `validators/misc.ts:76-81` · `adapter-combo.ts:117` |
| `thin-killer-explanation` | KILLER 해설 80자 미만 | `validators/misc.ts:71-73` |
| `combo-killer-trap-mix` | KILLER 인데 2자리 이상 틀린 선지가 2개 미만 | `validators/grammar/combo.ts:392-396` |
| `combo-killer-point-mix` | KILLER 인데 하드 포인트(b·c·i)가 2슬롯 미만 | `validators/grammar/combo.ts:397-400` |
| `combo-wrong-candidate-unused` / `combo-missing-single-slot-trap` | fast 축 warning — md 게이트는 같은 축을 **error 로 승격**해 이미 차단 | `validators/grammar/combo.ts:385-390` |

---

## 5. adapter 산출 필드

`adaptMdComboToAiQuestion(q, passage, difficulty)` (`adapter-combo.ts:41-122`) → 후처리 → `structuredData`.

| 키 | 타입 | 의미 | 근거 |
|---|---|---|---|
| `direction` | string | `"(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?"` (stemLanguage=en 이면 영어 발문으로 교체) | `adapter-combo.ts:35-36` · `lane-combo.ts:36-37, 178-181` |
| **`slots[]`** | array(3) | **이 유형 고유.** `{label:"(A)", correctExpression, wrongExpression, surroundingText, pointCode}` | `adapter-combo.ts:71-86` |
| ├ `label` | string | `(A)`~`(C)` — 후처리가 지문 등장순으로 재부여 | `processors/grammar-choice-combo.ts:19` |
| ├ `correctExpression` | string | 원문 축자 = **`diversityTargets` 의 진실원** | `lane-combo.ts:208-220` |
| ├ `wrongExpression` | string | 변형형 |  |
| ├ `surroundingText` | string | 재구성본에서 ±45자(`contextAround`), 위치 확정 실패 시 `""` | `adapter.ts:45-64` |
| └ `pointCode` | `"a"`~`"m"` | 닫힌 집합 밖이면 `"a"` 로 강등 | `adapter-combo.ts:84` |
| **`options[]`** | array(5) | `{label:"1"~"5", text, slotValues:string[3]}` — **라벨은 숫자 문자열**(원문자 아님) | `adapter-combo.ts:88-94` · `adapter.ts:75-78` |
| ├ `text` | string | `slotValues.join(" - ")` — md 의 ` …… ` 가 **` - ` 로 재조립**된다 | `adapter-combo.ts:32, 92` |
| └ `slotValues` | string[3] | (A)(B)(C) 순서 값 · 셔플 시 `text` 와 동행 | `adapter-combo.ts:93` |
| `correctAnswer` | `"1"`~`"5"` | `digitOptionLabel(q.answer)` → 후처리가 all-correct 조합으로 **재계산**(불일치 시 경고 후 자동 교정) | `adapter-combo.ts:112` · `processors/grammar-choice-combo.ts:330, 362` |
| `wrongOptionExplanations` | `[{label,explanation}]` → 후처리에서 Record | 라벨 축은 선지와 동일한 `"1"~"5"` · **빈 본문도 버리지 않는다**(1:1 매핑 규약) | `adapter-combo.ts:98-104` |
| `explanation` | string | md `해설:` 원문 (후처리가 라벨 재매핑 + 출제 메타 문구 제거) | `adapter-combo.ts:114` |
| `keyPoints` | `[]` | **항상 빈 배열.** 합성 금지(모델 오태깅 노출 실사고) → `few-key-points` warning 상수 발생 | `adapter-combo.ts:115-117` |
| `tags` | `[]` | 〃 |  |
| `difficulty` | string | ctx 난이도 그대로 |  |
| **`passageWithMarkers`** | string | **후처리 산출** — `(A) [ 좌 / 우 ]` 결정형 렌더 + 정답 좌우 위치를 해시로 셔플. **어댑터가 만들면 안 된다** | `processors/grammar-choice-combo.ts:363` · `adapter-combo.ts:11-15` |

**이물 필드 금지**: `blanks` · `passageWithBlank` · `originalExpression` · `markedExpressions` 를 넣으면
`type-foreign-field` error (`adapter-combo.ts:21-23`).

---

## 6. 생성 노브

`resolveQuestionTypeGenerationSettings("GRAMMAR_CHOICE_COMBO", raw, difficulty)` 의 산출은
**`grammarPointFocus` 단독**이다(+ 언어 2축) — `dispatchers.ts:121-136`.

| 키 | 타입 | 기본값 | 클램프/범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `pointFocus` | boolean | UI 저장 기본 `true` (`dispatchers.ts:506-510`) / **raw=null 이면 `false`** (`shared.ts:104-115`, probe 실측) | true·false | **본문 형식 무영향.** 프롬프트에서 (i)병렬을 하드풀·예시·강한자리에서 제거하고 (d)수일치로 치환 → **저작 시 (C)를 병렬로 쓸지 관계사/수일치로 쓸지의 정책 신호** (`prompts-combo.ts:86-127, 151-158`) |
| `stemLanguage` | `"ko"\|"en"` | `"ko"` (`language.ts:15`) | 두 값 | **본문 형식 무영향.** `en` 이면 어댑터가 `direction` 을 영어 발문으로 교체할 뿐 (`lane-combo.ts:144-148, 178-181`) |
| `optionLanguage` | `"ko"\|"en"` | `"ko"` | — | **무효.** toggle scope 가 `stem` 이라 UI 노출조차 없고 `qualityArgs` 가 구조 기본값 `ko` 로 고정 보고 (`lane-combo.ts:185-198` · `language.ts:64-79`) |
| `slotCount` / `comboSlotCount` / `boxCount` / `markerCount` / `grammarChoiceComboSlotCount` | number | 없음(미지원) | **3만 허용** — 3 이외 값이면 `isEligible=false` → fast 폴백 | `lane-combo.ts:44-50, 87-95` · `prompts-combo.ts:244-247`. **네모 3개·선지 5개는 하드코딩 상수다** (`prompts-combo.ts:35-36`) |
| `difficulty` (ITEM 헤더) | `BASIC\|INTERMEDIATE\|KILLER` | `INTERMEDIATE` | 3값 | 게이트 형식 무영향. `KILLER` 만 `few-key-points`·`thin-killer-explanation`·`combo-killer-*` warning 축이 켜진다 |
| `variantIndex` / `variantCount` | number | 0 / 1 | — | 하네스가 `ITEM n` 에서 자동 주입(`qgen-core.ts:247-248`). 프롬프트 포인트 로테이션 전용, 저작물 형식 무영향 |
| `teacherPoints` | `{text,unit}[]` | `[]` | — | 있으면 **세 슬롯 중 하나의 `correct` 가 그 문자열을 포함하거나 포함돼야** 한다(`lane-combo.ts:60-73`). qbank 기본 경로에서는 항상 `[]`(`qgen-core.ts:122`) |

> **요약: 이 유형에 마크다운 형식을 바꾸는 노브는 하나도 없다.** 3네모·5선지·6섹션은 불변이다.
> 다양성은 전부 §8 의 설계 축에서 나온다.

---

## 7. 함정 (코드 근거 있는 것만)

1. **머리표에 장식을 붙이면 그 섹션이 통째로 증발하고, 게이트는 거짓 원인을 지목한다.**
   `**정답:** ③` → `정답 누락`. `## 네모지문:` → `네모지문 누락`. (§3-7 실측표)
2. **`네모지문:` 과 본문을 같은 줄에 쓰면 안 된다.** R1 이 `\s*\n` 을 요구한다(`parser-combo.ts:125`).
3. **마커 밖 1글자 변경 = 하드 반려.** 흔한 사고: 원문 `“…”` 를 `"…"` 로 바꾸는 것은 안전하지만(normalizeWs),
   관사 추가·복수형 수정·쉼표 삽입은 전부 `지문 재구성 불일치`. **원문은 항상 옳다고 가정하라**(`prompts-combo.ts:297`).
4. **파이프 왼쪽에 틀린 표현을 놓는 좌우 뒤집기.** 왼쪽이 원문 축자다 → `지문 재구성 불일치` (probe P5-l).
5. **라벨 D 이상·소문자 라벨.** `[[D:x|y]]` 는 정규식이 `[A-C]` 라 **매칭 자체가 안 되고** 리터럴로 남는다
   → 마커 부족 또는 재구성 불일치 (probe P5-g, `parser-combo.ts:28`).
6. **선지 값을 `-`·`/`·`|` 로 연결.** ` …… ` 만 분해된다 → `값 1개` 반려 (`parser-combo.ts:31`).
   후보 안에 `/ [ ] | …` 를 쓰는 것도 금지 문자 반려(`gate-combo.ts:49, 197-201`).
7. **원형·포인트 줄을 표 문법으로.** 파이프 4개 → 줄 전체 매칭 실패 → `원형·포인트 항목 2개` (실측).
8. **포인트코드 뒤 설명에 `|` 포함.** `(d) 수일치 | 복수주어` → 줄 실패. 설명은 파이프 없이.
9. **시제만 바꾼 틀린 후보.** `realizes↔realized`, `did↔do/does` → `시제 단독 교체` 하드 반려
   (`gate-combo.ts:206-208`). 불규칙 과거(`spend↔spent`)는 미커버지만 **품질상 여전히 금지**다.
10. **수량 토글을 정답으로.** `few↔a few`, `fewer↔less`, `many↔much`(양용명사 앞), `much↔very`(비교급 아닌 자리)
    → `수량 후보쌍 … 정답 금지` (`gate-combo.ts:212-216`).
11. **지각·사역동사 목적격보어 자리.** `watch their children [struggle/struggling]` → 둘 다 정문 → 반려
    (`gate-combo.ts:217-219`).
12. **주격 관계대명사 직후 준동사 후보.** `a device that [measures/measuring]` → `즉답 giveaway` 반려.
    **그 자리는 수일치로 내라**(`[measures/measure]`) — `gate-combo.ts:386-393`.
    ⚠ **게이트 사각지대**: 관계대명사와 네모 사이에 부사가 끼면(`that once [locked/locking]`) 직전 단어가
    `once` 라 게이트가 못 잡는다(probe ITEM2 통과 실측). **프롬프트 규칙(`prompts-combo.ts:184-187`)상
    여전히 약한 네모이므로 저작 단계에서 스스로 배제하라.**
13. **후보 표현이 지문 다른 곳에 그대로 남아 있음(누설).** 네모 밖 평행구는 답안지다 —
    `정답 누설` / `정답 시비 위험` / `연어 … 누설` / `패턴 누설` 4분기 (`gate-combo.ts:85-125`).
    **네모로 만들 표현이 지문에 딱 한 번만 등장하는지 반드시 확인하라.**
14. **that/what 네모의 해설에 "목적격 관계대명사" 또는 "목적어가 빠져".**
    인지·단언 동사 뒤 that 은 **명사절 보문소**다 → `명사절 보문소인데 해설이 …` 반려
    (`gate-combo.ts:143-147, 158-170`). "뒤 절이 완전하다 / what 을 넣으면 잉여 명사구가 생긴다"로 써라.
15. **해설이 `(C)` 로 끝나고 내용이 없음.** 마지막 라벨 뒤 실질 문자 0 → `해설이 슬롯 라벨에서 끊김`
    (`gate-combo.ts:173-182`). 라벨을 문장 끝에 두지 마라.
16. **해설 안에 `정답:` 줄 삽입.** 학생 표면 노출 → 반려 (`gate-combo.ts:426-428`).
17. **오답해설 라벨 중복.** 개수는 4개라 상쇄돼 보이지만 Record 정규화가 하나를 삼킨다 →
    `오답해설 라벨 중복` + `오답해설 없는 선지 ⑤` 동시 발생 (`gate-combo.ts:285-306`).
18. **한 파일에 여러 문항.** 파서는 첫 매치만 취한다 — 2번째부터 조용히 증발(00-contract §3).
19. **유닛 내 `correctExpression` 재사용.** 다른 문항에서 같은 정답 표현을 다시 쓰면 `ANSWER_DUPLICATE`
    로 **유닛 전체가 차단**된다 (`qgen-core.ts:336-353`, probe P4).
20. **오토스냅에 의존.** `corrections` 가 나오면 그것은 통과가 아니라 사고 직전이다. 원본을 고쳐라.

---

## 8. 출제 포인트 다각화 축 — 한 지문에서 5~8문항 만들기

### 8-0. 이 유형의 하드 제약 (다각화 설계 전에 먼저 계산하라)

- 문항 하나가 **3개의 `correctExpression`** 을 소비한다.
- `ANSWER_DUPLICATE` 는 **유닛 전체에서 문자열 재사용을 0으로** 요구한다(`qgen-core.ts:336-353`).
  → **5문항 = 15개, 8문항 = 24개의 서로 다른 원문 표현**이 필요하다.
- 게다가 각 표현은 **지문에 딱 한 번만 등장**해야 한다(누설 게이트, §4-5).
- `point:` 값도 유닛 내 전부 달라야 한다(`POINT_DUPLICATE`).

> **먼저 지문에서 "네모로 만들 수 있는 자리" 목록을 20~25개 뽑고 시작하라.**
> 자리 재고가 부족하면 문항 수를 줄여 보고한다(헌법 §9-10). 90단어 미만 지문은 이 유형에 부적합하다.

### 8-1. 노브로 달라지는 축 (코드 근거)

| 축 | 값 | 코드 근거 | 무엇이 실제로 달라지는가 |
|---|---|---|---|
| **난이도** | BASIC / INTERMEDIATE / KILLER | `prompts-combo.ts:132-148` · 헌법 §4 배분(5문항=1/2/2, 8문항=2/3/3) | BASIC: 판단 근거가 **네모가 속한 절 안**. INTERMEDIATE: 구조 1단계 분석. KILLER: **장거리 의존 + 2자리 이상 틀린 선지 2개↑ + 하드포인트(b·c·i) 2슬롯↑** (`validators/grammar/combo.ts:392-400`) |
| **pointFocus** | ON / OFF | `prompts-combo.ts:86-127` · `dispatchers.ts:121-136` | ON: (i)병렬 **전면 금지** → 하드풀 {b,c,d}. OFF: {b,c,i}. 유닛 내에서 ON/OFF 를 섞어 (i)병렬 문항과 (b)관계사 문항을 의도적으로 분리 가능 |
| **stemLanguage** | ko / en | `lane-combo.ts:144-148` | 발문만 영어. **표층 형식 다각화 축**(헌법 §7-5)으로 8문항 중 1~2개에 쓸 수 있다 |
| 슬롯 수·선지 수 | — | `prompts-combo.ts:35-36` | **불변(3/5). 다각화 축이 아니다.** |

### 8-2. 설계로 달라지는 축 (교육적 판단 — 여기가 승부처)

**축 ①  포인트 코드 트리플의 조합** (가장 강한 축)
세 자리 코드는 서로 달라야 한다(`gate-combo.ts:370-373`). a~m 13개에서 3개를 고르는 조합이라
문항마다 **완전히 다른 트리플**을 배정하면 그 자체로 인지 작업이 갈린다.

| 문항 | 트리플 예시 | 겨냥하는 능력 |
|---|---|---|
| 1 (KILLER) | `d`수일치 · `c`분사 · `i`병렬 | 장거리 주어 추적 / 태 판정 / 등위 짝 찾기 |
| 2 (KILLER) | `b`관계사 · `a`정동사·준동사 · `l`전치사·접속사 | 절의 완전·불완전 / 정동사 자리 / 절 vs 구 |
| 3 (INTERMEDIATE) | `e`능·수동태 · `g`대명사 · `f`형용사·부사 | 주어-동사 의미관계 / 지시 대상 / 수식 대상 |
| 4 (INTERMEDIATE) | `k`부정사·동명사 · `h`목적격보어 · `d`수일치(다른 자리) | 동사 보문 유형 / 5형식 / 수 일치 재확인 |
| 5 (BASIC) | `f`형용사·부사 · `c`분사(다른 자리) · `l`전치사·접속사 | 교과서 수준 확인 |

> 코드는 재사용 가능하지만(문항 간 제약 없음) **표현은 재사용 불가**다. `d`수일치를 두 문항에서 쓰되
> 서로 **다른 문장의 다른 동사**를 겨냥하라.

**축 ②  판단 근거의 방향** — 프롬프트가 KILLER 의 생명으로 지목한 축(`prompts-combo.ts:141-147`)
- 왼쪽(선행사·주어) / 오른쪽(by 행위자구·than 절·목적어) / 앞머리(등위 시작점) / 문장 끝(절의 완전성)
- 한 문항 안에서 세 자리의 방향을 **서로 다르게**, 문항 간에는 **방향 배분 자체를 다르게** 짠다.
  (예: 1번은 왼·오·앞, 2번은 끝·왼·오)

**축 ③  겨냥 문장의 논지 위치** (헌법 §7-1)
도입 통념 / 전환점 / 기제 설명 / 사례 / 결론. 문항마다 세 네모가 **어느 문장 3개**에 놓이는지를 바꾼다.
같은 문장 세트를 두 문항이 공유하면 사실상 같은 문항이다.

**축 ④  틀린 후보의 오인 기제** (허용 변형 11종 — `prompts-combo.ts:165`)
①V-ing↔p.p. ②정동사↔준동사 ③that↔what ④which↔where/when ⑤단수V↔복수V ⑥형용사↔부사
⑦능동↔수동 ⑧대명사 수·격 ⑨to부정사↔동명사 ⑩가정법 시제 ⑪전치사↔접속사
→ **문항마다 사용 변형 3개 세트를 겹치지 않게** 배정한다. 헌법 §3 의 (L,F) 팔레트를 여기에 매핑하라:
가까운 명사에 이끌린 수일치 착각(L4 위치 인접) / 능·수동 착각(L6 형식 유사) / 병렬 짝 오인(L2 부분 사실).

**축 ⑤  선지 행렬(wrongness 벡터)의 형상** — `gate-combo.ts:224-276` 이 허용하는 범위 안에서
| 형상 | 벡터 예 | 효과 | 제약 |
|---|---|---|---|
| 표준 | `[1,2,0,2,1]` | near-miss 2 + 2자리 오답 2 | KILLER 요건 충족(2자리 ≥2) |
| 얕은 | `[1,1,0,2,1]` | near-miss 3 — 한 자리씩 꼼꼼히 확인시키는 BASIC/INTERMEDIATE 형 | 2자리 1개라 KILLER warning |
| 깊은 | `[2,2,0,3,1]` | 전부 틀린 선지 1개 포함, 강한 KILLER | near-miss 1개는 **필수** |
정답 번호도 문항마다 다른 자리에 놓아라(`prompts-combo.ts:203`).

**축 ⑥  네모 간 거리**
세 네모를 인접 문장에 모으는 문항 / 지문 처음·중간·끝으로 흩는 문항.
흩을수록 지문 전체를 훑어야 해서 체감 난도가 오른다.

**축 ⑦  해설의 설명 층위** (헌법 §5)
같은 지문이라도 문항마다 해설이 짚는 구조가 달라야 한다 — 선행사 추적 / 태의 의미관계 /
등위 범위 / 절의 완전성. 해설이 서로 베낀 문장이면 다각화 심사(렌즈 ⑤)에서 major.

### 8-3. 유닛 설계 절차 (권장)

1. 지문에서 네모 후보 자리를 20~25개 뽑고 각각에 (문장번호, 포인트코드, 판단방향, 원문표현)을 태깅한다.
2. **원문표현이 지문에 2회 이상 등장하는 자리는 즉시 폐기**(누설 게이트).
3. 표현 중복 없이 3개씩 묶어 문항 5~8개를 만든다. 각 묶음은 **코드 3개가 서로 다르고, 문장 3개가 서로 달라야** 한다.
4. 난이도를 헌법 §4 배분으로 할당하고, 그에 맞춰 판단 거리(절 안 / 구조 1단계 / 장거리)를 조정한다.
5. 문항별 `point:` 를 "무엇을 묻는가" 한 줄로 적되 **문자열이 서로 겹치지 않게** 쓴다.
6. 선지 행렬을 축 ⑤ 에서 골라 배정하고 정답 번호를 분산한다.
7. `qbank/work/_probe-*.ts` 와 동일한 방식으로 `gateUnit` 을 돌려 `blocking 0` 을 확인한 뒤 제출한다.

---

## 부록 A. 검증 기록

```
$ ./node_modules/.bin/tsx qbank/work/_probe-GRAMMAR_CHOICE_COMBO.ts
P1  리포 픽스처 gate 0                                        PASS
P2  골격 구현본 gate 0 / 스냅 0 / adapt / postprocess /
    correctAnswer '3' / quality error 0 / lane.parseAndGate 0  PASS (7건)
P3  qbank 컨테이너 2문항 유닛 blocking 0 · qualityBlocking 0    PASS (2건)
P4  correctExpression 재사용 → ANSWER_DUPLICATE 차단           PASS
P5  계약 경계 실측 13건 (장식·구분자·라벨·재구성·순서)          PASS (13건)
                                                    24/24 통과
```

참고 경고(무해): `few-key-points` — KILLER 문항 전건 발생(어댑터가 `keyPoints: []` 고정).
