# 반의어 (ANTONYM)

> 분류 **어휘(선택형)** · 지문변형 **없음(마킹만, 본문 1글자도 불변)** · 정답 머리표 **`정답:` + `바른짝:` 2줄** · 최소 지문 길이 **코드 규정 없음(=0)**, 단 「지문에 정확히 1회만 등장하는 내용어」를 유닛 전체가 소비하므로 실질 하한은 **어휘 예산**이 결정한다(§8).
>
> 검증: `qbank/work/_probe-ANTONYM.ts` — **26/26 PASS** (parse → autoSnap → gate → adapt → postProcess → validateQuestionQuality → gateUnit 컨테이너까지 전 경로).
> 상위 계약: [`../recon/00-contract.md`](../recon/00-contract.md) · 품질 규범: [`../quality-constitution.md`](../quality-constitution.md)

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문 안의 단어 5~10개에 밑줄을 치고, 각 단어 옆에 「반의어라고 주장하는 짝 단어」를 붙여 제시한다.
학생은 **그중 반의 관계가 성립하지 않는 단 하나**를 고른다. 발문은 고정이다 —
`지문의 밑줄 친 단어와 짝 단어의 반의어 관계가 바르지 않은 것은?` (`src/lib/md-qgen/adapter-antonym.ts:27-28`)

요구되는 인지 작업은 **"사전 반의어 판정"이 아니라 "이 지문에서 이 단어가 쓰인 의미축의 반대인가"** 다.
설계의 심장은 `prompts-antonym.ts:42` 의 **오축(誤軸) 다의어 함정**이다 —
`common` 이 "빈번한"이 아니라 "공유된"으로 쓰인 지문에서 `common - rare` 를 제시하면,
사전상 정당한 반의어이므로 훑어보면 완벽해 보이지만 이 글의 의미축(공유↔개별)이 아니다.

### 다른 유형과의 구별

| 유형 | 지문 | 학생이 보는 것 | 판정 대상 |
|---|---|---|---|
| **ANTONYM** | **무변형** + 밑줄 N개 | `단어 - 짝단어` N쌍 | 쌍의 **관계**가 깨진 곳 |
| `SYNONYM` | 무변형 + 밑줄 | 동의어 후보 | 같은 뜻인가 |
| `CONTEXT_MEANING` | 무변형 + 밑줄 1개 | 뜻풀이 선지 | 단어 1개의 문맥 의미 |
| `VOCAB_CHOICE` | **어휘 치환** | 치환된 단어 | 치환이 부적절한 곳 |
| `GRAMMAR_ERROR` | **오류 주입** | 밑줄 | 문법 오류 지점 |

★ 결정적 차이: 어법·어휘 계열은 "변형된 마커 개수 == 정답 개수"가 불변식이지만,
**ANTONYM 은 「변형 0」이 불변식이다.** `parser-antonym.ts:7-9` 가 못 박아 둔 경고다 —
`gateMdQuestion` 의 어법 분기를 복사하면 100% 반려된다.

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (플레이스홀더 `<꺾쇠>`)

```md
밑줄지문:
<지문 전문을 한 글자도 바꾸지 않고 그대로 옮긴다. 표적 단어 N곳만 [[A:단어]] ~ [[N번째라벨:단어]] 로 감싼다. 라벨은 지문 등장 순으로 A,B,C,... 오름차순. 마커 안 단어는 원문 축자(굴절형·대소문자 포함).>

짝:
(A) <마커 (A) 안의 단어와 완전히 동일> - <짝 단어 한 덩어리>
(B) <...> - <...>
(C) <...> - <...>
(D) <...> - <...>
(E) <...> - <...>
정답: (<반의 관계가 깨진 쌍의 라벨 하나>)
바른짝: <정답 자리 단어의, 이 지문 문맥에서의 실제 반의어 한 단어>
해설: <2문장. 그 단어가 이 지문에서 갖는 의미축이 무엇이고 짝 단어가 왜 그 축의 반대가 아닌지. 합니다체, 한국어.>
오답:
(A) <이 쌍이 이 지문 문맥에서 왜 정확한 반의 관계인지 1문장>
(B) <...>
(C) <...>
(D) <...>
```

> **오답 목록에는 정답 라벨을 넣지 않는다.** 줄 수는 정확히 `pairCount - 1`.
> 각 줄은 **1열(들여쓰기·불릿 금지)** 에서 `(라벨)` 로 시작해야 한다 (§3-R11).

### 2-2. ★ 검증된 정상 픽스처 전문 — `scripts/_test-md-antonym.ts:29-71`

원본 소스(`markedFrom` 은 `PASSAGE` 의 각 단어 첫 매치를 `[[라벨:단어]]` 로 감싸는 헬퍼):

```ts
const PASSAGE =
  "Languages that seem unrelated often share a common ancestor buried deep in prehistory. " +
  "Comparative linguists diverge from earlier scholars by tracing regular sound correspondences rather than surface resemblances. " +
  "Written records preserve only a thin slice of that history, so reconstruction must proceed by inference. " +
  "Sound change is usually gradual, spreading through a speech community over generations. " +
  "The resulting dialects eventually become distinct enough to count as separate languages.";

const MARKS: [string, string][] = [
  ["A", "common"], ["B", "diverge"], ["C", "preserve"], ["D", "gradual"], ["E", "distinct"],
];
```

전개된 마크다운 실물 (probe P1 에서 `gate 0` 재확인):

```md
밑줄지문:
Languages that seem unrelated often share a [[A:common]] ancestor buried deep in prehistory. Comparative linguists [[B:diverge]] from earlier scholars by tracing regular sound correspondences rather than surface resemblances. Written records [[C:preserve]] only a thin slice of that history, so reconstruction must proceed by inference. Sound change is usually [[D:gradual]], spreading through a speech community over generations. The resulting dialects eventually become [[E:distinct]] enough to count as separate languages.

짝:
(A) common - rare
(B) diverge - converge
(C) preserve - discard
(D) gradual - abrupt
(E) distinct - indistinguishable
정답: (A)
바른짝: separate
해설: 이 글에서 common 은 "빈번한"이 아니라 "공유된"의 뜻으로 쓰였습니다. rare 는 빈도축의 반의어라 문맥 의미축과 어긋나며, 실제 반의어는 separate 입니다.
오답:
(B) 갈라진다는 뜻의 diverge 와 한데 모인다는 converge 는 같은 축의 정반대입니다.
(C) 보존한다는 preserve 와 버린다는 discard 는 보존축의 정반대입니다.
(D) 점진적이라는 gradual 과 급작스럽다는 abrupt 는 속도축의 정반대입니다.
(E) 구별된다는 distinct 와 구별되지 않는다는 indistinguishable 은 같은 축의 정반대입니다.
```

### 2-3. qbank 컨테이너 실물 (유닛 1문항분)

```md
<!-- ITEM 1
difficulty: KILLER
point: 보존주의 프레임 — 마지막 문장의 curious 를 오축 다의어로 겨냥
craft: 정답 (E) 는 '호기심'축 반의어를 제시해 '기이한'축을 은폐한다
-->
밑줄지문:
...
```

`settings:` 줄로 노브를 준다: `settings: {"pairCount": 7}` (`qbank/harness/qgen-core.ts:70-77, 369-378`).
ITEM 헤더는 **qbank 규약이지 md-qgen 규약이 아니다** — 하네스가 잘라낸 뒤의 본문만이 파서 계약 대상이다.

---

## 3. 파서 계약 (★ 가장 중요)

> 진실원은 `src/lib/md-qgen/parser-antonym.ts` 다. `prompts-antonym.ts` 의 지시가 느슨해도 파서가 계약이다.
> **`decoration.ts` 는 이 파서가 import 하지 않는다** — 머리표 장식은 전부 침묵 유실이다(R2, probe E6).

### 섹션 추출 4종

| # | 규칙 | 정규식/리터럴 원문 | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|
| R1 | **밑줄지문 본문은 머리표 다음 줄부터** | `/^밑줄지문:\s*\n([\s\S]*?)(?=^짝:)/m` → `[1].trim()` | `parser-antonym.ts:98-99` | `밑줄지문:` 과 같은 줄에 본문을 두면 `markedPassage=""` → 마커 0개 (probe **E1**) |
| R2 | 종료 경계는 **행두 `짝:`** (lookahead) | `(?=^짝:)` | `parser-antonym.ts:99` | 행두 `짝:` 이 없으면 지문 통째 유실 |
| R3 | **짝 섹션** = `^짝:` 단독행 우선, 실패 시 `^짝:` 접두 | `text.split(/^짝:\s*$/m)[1] ?? text.split(/^짝:/m)[1] ?? ""` | `parser-antonym.ts:100` | 첫 매치 뒤 전부가 섹션. 문서에 `짝:` 이 두 번 나오면 뒤가 잘린다 |
| R4 | 쌍 스캔 범위 = 짝 섹션 중 **`^오답:` 이전 전부** | `pairSection.split(/^오답:/m)[0]` | `parser-antonym.ts:101` | `정답:`/`바른짝:`/`해설:` 줄도 이 범위 안이다 → 산문이 쌍으로 오인될 수 있다(R12) |
| R5 | **오답 섹션** = `^오답:` 단독행 우선 → 문서 끝까지 | `text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? ""` | `parser-antonym.ts:102-103` | 오답 뒤에 붙인 잡문도 오답 줄로 스캔된다 |

### 값 4종

| # | 규칙 | 정규식 원문 | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|
| R6 | **정답 = 알파벳 라벨** (원문자 불가) | `/^정답:\s*[([]?([A-Ja-j])[)\].]?/m` → `parenLabel` | `parser-antonym.ts:105-107` | `정답: ①` → **정답 누락** (probe **E4**). `(A)` `A` `[A]` `A.` `a` 전부 허용 |
| R7 | **바른짝 = 행 전체** | `/^바른짝:\s*(.+)$/m` → `trim()` | `parser-antonym.ts:120` | 줄이 없으면 **바른짝 누락** |
| R8 | **해설** = `^해설:` → `^오답:` 직전, 없으면 문서 끝까지 | `/^해설:\s*([\s\S]*?)(?=^오답:)/m` → 폴백 `/^해설:\s*([\s\S]+)$/m` | `parser-antonym.ts:121-124` | 다중행 허용. 단 그 행들은 R4 범위 안이라 R12 위험 |
| R9 | **오답 줄** — 첫 칸에서 라벨로 시작 | `/^[([]?([A-Ja-j])[)\].]?\s*(.+)$/gm`, 이후 `label && label !== answer` 필터 | `parser-antonym.ts:111-113` | **선행 공백·불릿·파이프 불관용** → 그 줄 유실 → `오답해설 N개` 반려 (probe **E2**) |

> ⚠ **비대칭 경보**: 짝 줄(R10)은 불릿·굵게·표 파이프를 흡수하지만 **오답 줄(R9)은 흡수하지 않는다.**
> 같은 문서 안에서 관용 범위가 다르다. 저작 규칙은 양쪽 모두 **장식 0**.

### 쌍 줄 문법

| # | 규칙 | 원문 | file:line | 어기면 |
|---|---|---|---|---|
| R10 | 줄머리 = `[선택 파이프][선택 불릿][선택 **]라벨[선택 )].][선택 **]` | `PAIR_LINE_HEAD = /^\s*\|?\s*(?:[-*•]\s*)?(?:\*\*)?[([]?([A-Ja-j])[)\].]?(?:\*\*)?\s*(.+)$/` | `parser-antonym.ts:49-50` | 라벨로 시작하지 않는 줄은 **조용히 무시** → 쌍 개수 부족 |
| R11 | 라벨 정규화 | `parenLabel`: `[()[\].:]` 제거 → 대문자 → 1글자 A~J 면 `(X)`, 아니면 `""` | `parser-antonym.ts:42-45` | `(K)` 등은 빈 라벨 → 그 줄 폐기 |
| R12 | 값 분리 = **공백-대시-공백 우선**, 폴백 맨몸 대시 | `/^(.+?)\s+[-–—]\s+(.+)$/` → 실패 시 `/^(.+)[-–—](.+)$/` | `parser-antonym.ts:56-62` | `well-being` 이 안 깨지는 이유. **반대로: 짝~오답 사이의 산문 줄이 A~J 로 시작하고 ` - ` 를 포함하면 쌍으로 오인** → `어휘쌍 6개` (probe **E3**) |
| R13 | 파이프 드리프트 흡수 = **쌍으로 읽히는 첫 칸**만 | `head[2].split("\|").map(splitWordAndAntonym).find(r => r !== null)` | `parser-antonym.ts:82-87` | `(A) x - y \|\| X \| z` 도 `x - y` 로 읽힌다 |

### 인라인 마커

| # | 규칙 | 원문 | file:line | 어기면 |
|---|---|---|---|---|
| R14 | 마커 문법 | `INLINE_ANTONYM_MARK_RE = /\[\[([A-J]):((?:(?!\]\]).)+)\]\]/g` | `parser-antonym.ts:16` | 라벨은 **대문자 A~J 전용**. `[[c:preserve]]` → 수집 실패 (probe **E5**) |
| R15 | 내용은 **줄바꿈 금지·1글자 이상·`]]` 금지** | `.` 는 개행 불포함 | `parser-antonym.ts:16` | 마커가 줄을 넘으면 미수집 |
| R16 | 수집 결과 = `{label:"(X)", shown: m[2].trim()}` (지문 등장 순) | `collectAntonymMarks` | `parser-antonym.ts:130-137` | — |
| R17 | 원문 복원 = 마커를 내용으로 치환 | `stripAntonymMarks` | `parser-antonym.ts:140-144` | 재구성 대조의 기준 |

### 지문 불변식

| # | 규칙 | file:line | 어기면 |
|---|---|---|---|
| R18 | `normalizeWs(stripAntonymMarks(markedPassage)) === normalizeWs(passage)` | `parser-antonym.ts:193` | **지문 재구성 불일치** — 마커 밖 무단 편집과 마커 안 변형을 한 번에 잡는다 |
| R19 | `normalizeWs` 가 흡수하는 것은 **곱슬따옴표 → 곧은따옴표 · en/em dash → `-` · `…` → `...` · 공백 축약** 뿐 | `src/lib/md-qgen/parser.ts:67-74` | **대소문자·구두점·철자 1글자 차이도 반려** (probe **E7**) |
| R20 | 표적 단어의 지문 내 등장 횟수 = **정확히 1** | `countWordBoundaryMatches` = `/(?<![A-Za-z])expr(?![A-Za-z])/g`, `parser.ts:428-436` · 판정 `parser-antonym.ts:242-247` | 0회 → `축자로 없음`, 2회 이상 → `밑줄 자리가 모호함`. **경계는 알파벳만 배제** — 숫자·아포스트로피는 경계로 본다(`object's` 안의 `object` 는 매치) |
| R21 | 라벨 순서 = 지문 등장 순 = `(A)(B)(C)...` 알파벳 오름차순 | `parser-antonym.ts:198-208` | 마커 축·짝 줄 축 **양쪽 다** 검사한다 |

### 자동 보정(0원 스냅)

`autoSnapAntonymPairs` (`parser-antonym.ts:151-168`) — 짝 줄의 `word` 가 마커 내용과 다르면 **마커를 진실원으로** 갈아 끼운다.
단 **보수 가드**: 마커 내용이 원 지문에 단어 경계로 정확히 1회 실재할 때만 채택(`:163`).
마커 자체가 오염된 경우(모델이 지문을 고쳐 씀)는 손대지 않고 게이트가 반려하게 둔다.
보정이 일어나면 `corrections[]` 에 남고 하네스는 `AUTOSNAP` **경고**로 기록한다(`qgen-core.ts:313`).
→ **스냅에 기대지 마라. 짝 줄의 단어는 마커 안 단어와 축자 동일하게 써라.**

### 첫매치 규칙

`정답:` `바른짝:` `해설:` 은 전부 `String.match` 첫 매치다. `짝:` `오답:` 은 `split` 의 `[1]` (첫 구분자 뒤 전부).
→ **1 마크다운 = 1문항.** 두 문항을 이어 붙이면 2번 문항의 `정답:` 은 무시되고 `짝:` 쌍은 1번에 합산되어 `어휘쌍 N개` 로 죽는다.

---

## 4. 게이트 체크리스트

### 4-1. `gateMdAntonym` 반려 사유 전수 — `src/lib/md-qgen/parser-antonym.ts:171-292`

`pairCount` 는 레인이 주입한다(`lane-antonym.ts:110`); 미지정 시 `q.pairs.length`(`:177`)이라 개수 검사가 무력화되므로 **하네스는 항상 주입한다**.

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `어휘쌍 {n}개 ({pairCount}개 필요)` | 짝 줄 파싱 결과 개수 불일치 — **즉시 return, 이후 검사 전무** | `:182-184` |
| `밑줄 마커 {n}개 ({pairCount}개 필요)` | 마커 수 불일치 — **즉시 return** | `:185-188` |
| `밑줄지문 누락` | `markedPassage` 가 빈 문자열 | `:191-192` |
| `지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 마커 안 단어가 변형됨` | `normalizeWs(strip(marked)) !== normalizeWs(passage)` | `:193-195` |
| `밑줄 라벨이 지문 등장순 (A)(B)...(N) 이 아님 — 실제 {...}` | 마커 라벨 시퀀스 ≠ 기대 시퀀스 | `:198-205` |
| `짝 라벨 순서 오류 — (A)(B)...(N) 필요` | 짝 줄 라벨 시퀀스 ≠ 기대 시퀀스 | `:206-208` |
| `{라벨} 표적 단어 누락` | `p.word` 빈값 (이 줄만 continue) | `:214-216` |
| `{라벨} 짝 단어 누락` | `p.antonym` 빈값 | `:218` |
| `{라벨} 표적 단어가 밑줄 마커와 불일치 ('{word}' vs '{shown}')` | 마커 내용 ≠ 짝 줄 단어 (normalizeWs 비교) | `:221-224` |
| `{라벨} 짝 단어가 단어 형태가 아님: '{...}'` | 공백 분리 **4어절 이상** 또는 `(`·`)`·`[`·`]` 포함 | `:227-229` (probe **E8/E9**) |
| `표적 단어 중복: '{word}'` | 문항 내 표적 단어 소문자 중복 | `:231-234` |
| `짝 단어 중복: '{antonym}'` | 문항 내 짝 단어 소문자 중복 | `:235-236` |
| `{라벨} 표적 단어와 짝 단어가 동일` | 소문자 비교 동일 | `:239` |
| `{라벨} 표적 단어가 지문에 축자로 없음(단어 경계 기준): '{word}'` | `countWordBoundaryMatches === 0` | `:243-245` |
| `{라벨} '{word}' 가 지문에 {n}회 등장 — 밑줄 자리가 모호함` | `countWordBoundaryMatches > 1` | `:245-247` |
| `{라벨} 형태 불일치 — {surfaceIssue}` | `findAntonymSurfaceFormIssue` 결과 중 **`past/participle form` 을 제외한 전부** (-s / -ing / -ly / 비교급 / 최상급) | `:257-260` |
| `정답 누락` | `정답:` 줄 파싱 실패 | `:265` |
| `정답 라벨({answer})이 어휘쌍에 없음` | 라벨이 짝 목록에 부재 | `:266` |
| `바른짝 누락` | `바른짝:` 줄 없음 | `:269-270` |
| `바른짝이 정답 쌍의 짝 단어와 동일 — 그 쌍은 오류가 아니게 된다` | 소문자 비교 동일 | `:272-275` |
| `바른짝이 표적 단어와 동일` | 소문자 비교 동일 | `:276-278` |
| `해설 누락` | `해설:` 값 빈값 | `:281` |
| `오답해설 {n}개 ({pairCount-1}개 필요)` | `requireWrong !== false` 일 때 개수 불일치 (레인은 기본값 사용 = 필수) | `:283-286` |
| `오답해설에 정답 라벨 포함` | 파서가 이미 정답 라벨 줄을 걸러내므로(`:113`) 사실상 API 직접 호출 경로 전용 | `:287-289` |
| `교사 지정 표현이 밑줄에 없음: '{text}'` | `ctx.teacherPoints` 각 항목이 어떤 표적 단어와도 포함관계가 아님 (하네스는 `teacherPoints: []` 라 미발화) | `lane-antonym.ts:39-52` |

### 4-2. `findAntonymSurfaceFormIssue` 세부 축 — `src/lib/question-quality/validators/antonym.ts:262-311`

두 단어 모두 `isSingleEnglishToken`(`/^[A-Za-z][A-Za-z'-]*$/`, `core.ts:428-430`)일 때만 동작한다.

| 축 | 판정 | 근거 |
|---|---|---|
| 3인칭/복수 `-s` | `hasInflectionalS` = `len>3 && /s$/ && !/(ss\|us\|is\|ous\|less\|ness)$/` 가 양쪽 동일해야 | `core.ts:206-212` |
| `-ing` | 양쪽 동일해야 | `validators/antonym.ts:275-281` |
| `-ly` | 양쪽 동일해야 | 〃 |
| 과거·분사 `-ed` | 한쪽만 `-ed` 이고 다른 쪽이 과거형(불규칙 목록 포함)이 아니면 위반. `ADJECTIVAL_PARTICIPLES` 55개(`:330-385`)는 면제 | `:283-296` — **md 게이트는 이 축만 제외**(`parser-antonym.ts:258`) |
| 비교급 | `isLikelyComparativeForm` 화이트리스트 25개 | `:315-317` |
| 최상급 | `isLikelySuperlativeForm` 화이트리스트 25개 | `:321-323` |

### 4-3. `validateQuestionQuality` — **프로덕션은 비차단, qbank 하네스는 차단**

라우트는 기록만 하지만(`00-contract.md §2`), `qgen-core.ts:311` 이 `qualityBlocking` 으로 **차단**한다.
ANTONYM 은 `filterQualityIssues` 를 정의하지 않으므로 **전 코드가 그대로 산다.**

| 코드 | 조건 | file:line |
|---|---|---|
| `antonym-marker-count` | `markedWords.length !== pairCount` | `validators/antonym.ts:78-84` |
| `antonym-missing-passage-markers` | `passageWithMarkers` 없음 | `:86-89` |
| `antonym-render-marker-count` / `antonym-render-label-format` / `antonym-render-missing-label` / `antonym-render-word-mismatch` | 후처리가 만든 `__(A) word__` 렌더와 `markedWords` 불일치 | `:103-117, 182-190` |
| `antonym-duplicate-label` | 라벨 중복 | `:119-123` |
| `antonym-incorrect-pair-count` | `isIncorrectPair===true` 가 정확히 1개가 아님 | `:125-132` |
| `antonym-answer-count` / `antonym-answer-label-mismatch` | `correctAnswer` 가 오류 쌍을 정확히 1개 지시하지 않음 | `:134-152` |
| `antonym-empty-pair` / `antonym-label-format` | 라벨·단어·짝 결측 | `:172-180` |
| `antonym-option-pair-mismatch` | 선지 텍스트가 `word`·`antonym` 을 둘 다 담지 않음 | `:192-202` |
| `antonym-word-not-source-backed` | 단일 영어 토큰인데 지문에 독립 토큰으로 없음 | `:204-206` |
| `antonym-same-word` | 표적 == 짝 | `:208-210` |
| **`antonym-surface-form-mismatch`** | 표면형 위반 — **`past/participle` 축까지 전부** | `:212-215` |
| **`antonym-contestable-pair`** | `findContestableAntonymPair` 금지 쌍 8종 | `:217-224`, 목록 `:430-451` |
| `antonym-missing-correct-antonym` / `antonym-incorrect-pair-not-mutated` / `antonym-correct-antonym-form-mismatch` / `antonym-correct-antonym-contestable` | 정답 쌍의 `correctAntonym` 계열 | `:226-253` |
| `antonym-nonanswer-has-correct-antonym` | 정답 아닌 쌍에 `correctAntonym` 이 붙음 (어댑터가 방지) | `:254-256` |
| `explanation-foreign-script` / `explanation-latin-jam` | 해설에 비한글 CJK / `영단어+다` 짜깁기 | `validators/explanation-foreign-text.ts:99-112` |
| `explanation-quoted-token-missing` | 해설이 따옴표로 인용한 **12자 이상** 영어 조각이 문항 표면에 부재 | `validators/explanation-quoted-tokens.ts:117-162` |
| `type-foreign-field` 계열 | 빈칸 계열 필드 혼입 | `validators/misc.ts` (어댑터 주석 `adapter-antonym.ts:14-15`) |

**금지 쌍 8종**(`validators/antonym.ts:430-451`, 프롬프트 `prompts-antonym.ts:113` 과 동일):
`force-restrain` · `mastery-ignorance` · `rational-emotional` · `dim-clear` · `justify-excuse` ·
`unproductive-passive` · `unproductive-uninterested` · `paid-refunded`
(비교는 `antonymPairKey` 표제어 정규화 후 — `-ies/-ing/-ed/-s` 를 벗겨 비교하므로 굴절형으로 우회 불가, `core.ts:216-224`)

### 4-4. 하네스 유닛 레벨 차단 코드 — `qbank/harness/qgen-core.ts`

| 코드 | 조건 | file:line |
|---|---|---|
| `UNSUPPORTED_LANE` | 레지스트리 미등록 (ANTONYM 은 해당 없음) | `:216` |
| `CONTAINER` | `<!-- ITEM n -->` 헤더 결측·번호 비연속·`point:` 누락·본문 공백·settings JSON 파싱 실패 | `:227`, `splitItems :47-101` |
| `ITEM_COUNT` | 문항 수 < `minItems`(기본 5) | `:233` |
| `GATE` | `gateMdAntonym` + 교사포인트 이슈 전수 | `:306` |
| `ADAPT` | 어댑터 실패 | `:308` |
| `POSTPROCESS` | `processAntonym` 실패 | `:310` |
| `POINT_DUPLICATE` | 유닛 내 `point:` 정규화 문자열 중복 | `:329` |
| **`ANSWER_DUPLICATE`** | **`diversityTargets` 중복 — ANTONYM 은 「밑줄 단어 전량」이 targets 다** | `:349` + `lane-antonym.ts:144-155` |

> ★ **ANTONYM 최대 제약**: `diversityTargets` 가 정답 단어가 아니라 `markedWords[].word` **전부**를 반환한다
> (`lane-antonym.ts:146-153`). 따라서 **유닛 안의 두 문항이 같은 단어에 밑줄만 쳐도 `ANSWER_DUPLICATE` 로 유닛 전체가 반려된다.**
> probe **P4** 로 실증. 어휘 예산 계산은 §8.

---

## 5. adapter 산출 필드

`adaptMdAntonymToAiQuestion` (`src/lib/md-qgen/adapter-antonym.ts:30-111`) → `postProcessQuestion("ANTONYM", ...)` (`processors/antonym.ts:66-218`) → `normalizePostProcessResult` (`question-postprocess/index.ts:151-186`).

### 어댑터가 만드는 것

| 키 | 타입 | 의미 | file:line |
|---|---|---|---|
| `direction` | string | 고정 발문. `stemLanguage:"en"` 이면 영어 발문으로 교체 | `adapter-antonym.ts:27-28, 98` · `lane-antonym.ts:28-29, 126-129` |
| **`markedWords[]`** | `{label, word, antonym, isIncorrectPair, correctAntonym?, surroundingText}` | **이 유형 고유.** `label` 은 **`"(A)"` 대문자 고정** — ① 로 내면 검증기·앵커추출이 기존 DB 문항과 함께 깨진다 | `:62-82`, 경고 `:11-13` |
| ┗ `antonym` | string | 학생에게 보이는 짝 단어 | `:73` |
| ┗ `isIncorrectPair` | boolean | `p.label === q.answer` — 정확히 1개만 true | `:74` |
| ┗ `correctAntonym` | string? | **정답 쌍에만** 붙는다(`바른짝:`). 다른 쌍에 붙이면 `antonym-nonanswer-has-correct-antonym` | `:75-77` |
| ┗ `surroundingText` | string | 재구성본이 원문과 정합할 때의 좌표 기반 문맥창. 실패 시 `""` (후처리 단어경계 폴백에 위임) | `:78-81` |
| `correctAnswer` | string | **숫자 문자열** `"1"`~`"N"` = 정답 쌍의 1-based 인덱스 | `:101` |
| `wrongOptionExplanations[]` | `{label:"1".."N", explanation}` | **라벨 축이 `(A)` 가 아니라 숫자**로 재매핑된다. 빈 해설은 탈락 | `:85-93` |
| `explanation` | string | `해설:` 원문 | `:102` |
| `keyPoints` | `[]` | **합성 금지**(정본 규약) | `:104-106` |
| `tags` / `difficulty` | `[]` / string | | `:107-108` |

**금지 필드**: `blanks` · `passageWithBlank` · `originalExpression` — 빈칸 계열 필드를 흘리면 `type-foreign-field` error (`adapter-antonym.ts:14-15`).

### 후처리가 추가·재작성하는 것

| 키 | 값 | file:line |
|---|---|---|
| **`passageWithMarkers`** | 원 지문에 `__(A) word__` 형태로 밑줄 삽입 (RTL 치환) | `processors/antonym.ts:163-164, 201` |
| **`options[]`** | `{label:"1".."N", text:"word - antonym"}` — 전량 재생성. 생성 시엔 `"(A) word - antonym"` 이지만 `sanitizeAntonymOptionText` 가 라벨 접두를 벗긴다 | `:202-205` + `question-postprocess/index.ts:244-254` |
| `correctAnswer` | 오류 쌍 인덱스로 **재부여** (불일치 시 실패 반환) | `:190-199, 211` |
| `markedWords` | 라벨 정규화 + `correctAntonym` 을 정답 쌍에만 남김 | `:172-178, 213` |

**셔플 없음** — `SHUFFLE_OPTION_TYPES` (`question-diversity.ts:508-521`)에 ANTONYM 이 없다.
→ **선지 번호 = 라벨 순번 = 지문 등장 순.** 정답 번호는 저작자가 `정답:` 으로 직접 결정한다(§8-B).

저장 시 `structuredData` = 위 산출 + `_typeId`/`_typeLabel`/`_generationPlan`/`difficulty` + tags (`00-contract.md §11`).

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `pairCount` (별칭 `optionCount`·`markerCount`) | number | **5** | **5~10** (`normalizeNumericSetting`) | **직접 영향.** 마커 수·짝 줄 수·라벨 마지막 글자(`(E)`~`(J)`)·오답해설 수(`pairCount-1`)를 전부 결정. probe **P7** 로 7쌍 실측 | `question-type-generation-settings/antonym.ts:7-27` · 해석 `dispatchers.ts:282-291` · 재클램프 `prompts-antonym.ts:21-25` · 게이트 주입 `lane-antonym.ts:31-36, 110` |
| `difficulty` (ITEM 헤더) | `BASIC\|INTERMEDIATE\|KILLER` | `INTERMEDIATE` | 3값 | **md 형식 무영향.** 프롬프트 분기(`prompts-antonym.ts:35-50, 85-91`)와 `validateKillerBar`·`difficulty-mismatch` 경고에만 작용 |
| `stemLanguage` | `"ko"\|"en"` | `"ko"` | 2값 | **md 형식 무영향.** `direction` 만 영어로 교체. 해설·오답해설은 한국어 유지 | `lane-antonym.ts:95-99, 126-129` |
| `variantIndex` (하네스가 `ITEM n-1` 로 자동 주입) | number | 0 | — | **md 형식 무영향.** 후보 가드레일 목록을 회전시킨다(`rotateByVariantIndex`) | `qgen-core.ts:247` · `candidate-blocks/antonym.ts:99-102` |
| `teacherPoints` | `{text}[]` | `[]` | — | 지정 표현이 표적 단어와 포함관계여야 함. **하네스는 항상 빈 배열** | `lane-antonym.ts:39-52` · `qgen-core.ts:122` |

**적격성**: `isEligible` 은 `antonymPairCount` 가 5~10 유한수일 때만 true (`lane-antonym.ts:65-75`).
**과금 축**: `QUESTION_GEN_VOCAB` (1크레딧) — `CONTEXT_MEANING`·`SYNONYM`·`ANTONYM` 3종 전용 (`lane-antonym.ts:60`).
**출력 토큰**: `pairCount > 5` 이면 8,192 로 상향 (`dispatchers.ts:461-468`).

ITEM 헤더 표기: `settings: {"pairCount": 7}` → 하네스가 `{ANTONYM:{pairCount:7}}` 로 감싸 주입 (`qgen-core.ts:369-378`).

---

## 7. 함정 (전부 코드 근거 + probe 실증)

| # | 함정 | 결과 | 근거 |
|---|---|---|---|
| **T1** | 머리표에 굵게·헤딩·불릿 (`**정답:**`, `## 짝:`) | **정답 누락** 등 **거짓 원인**으로 반려. `decoration.ts` 는 이 파서에 없다 | probe **E6** · `00-contract.md §8` |
| **T2** | `밑줄지문: <지문>` 을 한 줄에 | 지문 통째 유실 → `밑줄 마커 0개` | probe **E1** · `parser-antonym.ts:99` |
| **T3** | 오답 줄에 들여쓰기·불릿 | 그 줄만 유실 → `오답해설 3개 (4개 필요)`. **짝 줄은 관용, 오답 줄은 불관용** | probe **E2** · `:111` vs `:49-50` |
| **T4** | 짝~오답 사이 산문 줄이 A~J 로 시작 + ` - ` 포함 (해설 2행째 등) | 그 줄이 **쌍으로 오인** → `어휘쌍 6개` | probe **E3** · `:101, 56-62` |
| **T5** | `정답: ①` (다른 유형 습관) | **정답 누락**. ANTONYM 은 `(A)~(J)` 축 | probe **E4** · `:105-107` |
| **T6** | 마커 라벨 소문자 `[[a:word]]` | 미수집 → `밑줄 마커 4개`. **짝 줄 라벨은 소문자 허용, 마커는 대문자 전용** | probe **E5** · `:16` vs `:50` |
| **T7** | 지문 재입력 중 대소문자·철자 1글자 변형 | **지문 재구성 불일치**. `normalizeWs` 는 곱슬따옴표·대시·`…`·공백만 흡수 | probe **E7** · `parser.ts:67-74` |
| **T8** | 짝 단어를 구·설명·괄호 병기로 | `단어 형태가 아님` (4어절 이상 또는 괄호류 문자) | probe **E8/E9** · `:227-229` |
| **T9** | `often - rarely` 류 `-ly` 비대칭 | `형태 불일치`. ★ **안전 어휘집 `ANTONYM_SAFE_LEXICON` 의 `often→rarely` 항목 자체가 이 게이트에 걸린다** — 가드레일 제안을 그대로 베끼면 죽는다 | probe **P5** · `candidate-blocks/antonym.ts:76` vs `validators/antonym.ts:275-281` |
| **T10** | `-ed` 단어를 비-`-ed` 와 짝지음 (`hybrid - mixed`, `fixed - changeable`) | **md 게이트는 통과시키지만**(`parser-antonym.ts:258`) `validateQuestionQuality` 의 `antonym-surface-form-mismatch` 가 잡아 **하네스 `qualityBlocking`**. `ADJECTIVAL_PARTICIPLES` 55개만 면제 | `validators/antonym.ts:212-215, 283-296, 330-385` |
| **T11** | 금지 쌍 8종 사용 | `antonym-contestable-pair` (게이트에는 없고 quality 에만 있다 — 게이트만 돌리면 못 본다). 굴절형 우회 불가 | `validators/antonym.ts:430-451` · `core.ts:216-224` |
| **T12** | 지문에 2회 이상 등장하는 단어를 표적으로 | `가 지문에 2회 등장 — 밑줄 자리가 모호함`. 대소문자가 다르면 별개 토큰이므로 문장 첫머리 대문자형에 주의 | `:242-247` · `parser.ts:428-431` |
| **T13** | 짝 줄 단어를 원형·굴절형으로 손질 (`preserves` vs 마커 `preserve`) | 스냅이 조용히 고쳐 `AUTOSNAP` 경고를 남기거나(마커가 지문에 1회 실재할 때만), 아니면 `표적 단어가 밑줄 마커와 불일치` | `:151-168, 221-224` |
| **T14** | 표적을 지문 등장순과 다른 라벨로 | `밑줄 라벨이 지문 등장순 … 이 아님` + `짝 라벨 순서 오류` **동시 2건** | `:198-208` |
| **T15** | 바른짝을 짝 단어나 표적 단어와 같게 | `바른짝이 정답 쌍의 짝 단어와 동일` / `바른짝이 표적 단어와 동일` | `:269-279` |
| **T16** | 오답 목록에 정답 라벨 줄을 넣음 | 파서가 그 줄을 **폐기**한다(`:113`). 나머지가 `pairCount-1` 이면 조용히 통과(probe **E10**), 정답 라벨 줄이 한 자리를 **대신** 차지했으면 `오답해설 3개 (4개 필요)` (probe **E10'**) | `:113, 283-286` |
| **T17** | 해설에 `…반의어는 separate다.` 처럼 영단어+종결어미 접합 | `explanation-latin-jam`. `separate 입니다` 처럼 **띄어 써라** | `explanation-foreign-text.ts:39-41` |
| **T18** | 해설이 지문에 없는 영어 구절을 12자 이상 따옴표 인용 | `explanation-quoted-token-missing` | `explanation-quoted-tokens.ts:35-37, 143-161` |
| **T19** | 유닛 내 두 문항이 **같은 단어에 밑줄** | `ANSWER_DUPLICATE` — 정답이 아니어도 걸린다 | probe **P4** · `lane-antonym.ts:144-155` · `qgen-core.ts:349` |
| **T20** | 한 `.md` 에 여러 문항을 ITEM 헤더 없이 이어 붙임 | 지문·쌍·정답은 **첫 문항만** 읽히고(쌍 5개 유지), 오답 섹션이 2번 문항 본문까지 삼켜 `오답해설 {N}개` 로 붕괴. **어휘쌍 개수로는 안 잡힌다** — 조용한 유실을 개수 게이트가 못 본다 | probe **E11/E11'** · `parser-antonym.ts:99-103` · `00-contract.md §3` |
| **T21** | 짝 줄에 O/X·바른짝 칸을 덧붙임 | 26-07-26 실사용 반려 2연속의 원인이었던 구계약. 지금은 `라벨 단어 - 짝단어` **한 형태뿐** (파이프 잔재는 흡수되지만 쓰지 마라) | `parser-antonym.ts:64-74` · `prompts-antonym.ts:129-133` |

---

## 8. 출제 포인트 다각화 축

> **선행 제약을 먼저 계산하라.** ANTONYM 은 다각화 이전에 **어휘 예산**이 유닛 규모를 결정한다.

### 8-0. ★ 어휘 예산 (하드 제약, 코드 근거)

`diversityTargets = markedWords[].word` 전량(`lane-antonym.ts:144-155`) + `ANSWER_DUPLICATE`(`qgen-core.ts:335-353`)
→ **유닛 내 모든 밑줄 단어는 서로 달라야 한다.**

| 유닛 구성 | 필요한 서로 다른 표적 단어 수 |
|---|---|
| 5문항 × 5쌍 | **25** |
| 8문항 × 5쌍 | **40** |
| 5문항 × 7쌍 | **35** |
| 혼합(5·5·6·6·7) | **29** |

각 표적은 `countWordBoundaryMatches(passage, word) === 1` 이어야 하고(`:242-247`), 관사·전치사·접속사·대명사·be동사는 실격(`prompts-antonym.ts:101`).

**저작 절차 1단계 = 예산 실사.** 지문에서 「4글자 이상 · 1회만 등장 · 내용어」를 먼저 전부 뽑아 세라.
probe 실측: 204단어 지문에서 4글자 이상 1회 등장 토큰 **126개**(기능어 포함) → 5문항×5쌍(25개)은 여유, 8문항(40개)은 내용어만으로 빠듯할 수 있다.
**예산이 모자라면 문항 수를 줄여 보고하라** (품질 헌법 §9-10: 수량으로 품질을 상쇄하지 않는다).

### 8-A. 노브로 달라지는 축 (코드 근거)

| 축 | 조작 | 코드 근거 | 실효 |
|---|---|---|---|
| **A1 쌍 개수** | ITEM `settings: {"pairCount": 5\|6\|7\|8\|9\|10}` | `antonym.ts:7-19` · probe **P7** | 라벨 폭(`(E)`~`(J)`)·오답해설 수가 바뀌어 **표층 형식이 실제로 달라진다.** 5문항 유닛을 `5/5/6/6/7` 로 짜면 후반 문항이 무거워진다. 단 예산이 25→29로 증가 |
| **A2 난이도** | ITEM `difficulty:` | `prompts-antonym.ts:35-50` · `validateKillerBar` | 헌법 §4 배분(5문항 = BASIC 1 / INTERMEDIATE 2 / KILLER 2) 준수 |
| **A3 발문 언어** | `settings: {"stemLanguage":"en"}` | `lane-antonym.ts:95-99, 126-129` | 발문만 영어. 유닛 전체를 한 축으로 통일하는 편이 낫다(문항 간 차이 축으로 쓰면 산만) |
| **A4 후보 회전** | ITEM 순번(자동) | `candidate-blocks/antonym.ts:99-102` | AI 생성 경로 전용. 손저작에서는 **"앞 문항이 쓴 안전 쌍을 재사용하지 마라"** 는 규범으로 번역된다 |

### 8-B. ★ 정답 위치 축 (이 유형 고유 — 셔플이 없다)

`SHUFFLE_OPTION_TYPES` 에 ANTONYM 이 **없다**(`question-diversity.ts:508-521`).
→ 선지 번호 = 라벨 순번 = 지문 등장 순이며, **정답 번호는 `정답:` 줄이 그대로 결정한다.**

다른 유형은 셔플이 정답 위치를 흩어 주지만 ANTONYM 은 **저작자가 흩지 않으면 영원히 몰린다.**
5문항이면 정답 라벨을 `(A)(B)(C)(D)(E)` 로 1:1 배분하는 것을 기본값으로 삼아라
(= 정답 번호 1,2,3,4,5 가 한 번씩). 8문항이면 각 번호 최대 2회.

부수 효과: 정답 라벨이 곧 **지문 내 위치**다. 정답 라벨을 흩는 것은 자동으로 §8-C1(논지 위치) 다각화를 겸한다.

### 8-C. 설계로 달라지는 축 (교육적 판단)

#### C1. 정답 함정 기제 — **문항마다 서로 다른 기제 1종** (최우선 축)

| 기제 | 설계 | 난이도 적성 | 근거 |
|---|---|---|---|
| **M1 오축 다의어** | 지문에서의 의미 ≠ 일상 의미인 단어를 표적으로, **일상 의미의 정당한 사전 반의어**를 짝으로 제시. `바른짝:` 은 문맥 의미의 반의어 | KILLER 1순위 | `prompts-antonym.ts:42, 46` |
| **M2 근접 뉘앙스** | 올바른 반의어와 같은 의미장이되 **정도·방향·함축**이 어긋나는 단어. 문장에 재대입해야 판정됨 | INTERMEDIATE/KILLER 차선 | `prompts-antonym.ts:43, 47` |
| **M3 투명 동의어** | 반의어 자리에 동의어를 앉힌 고전 함정(`increased - raised`) | **BASIC 전용** — KILLER/INTERMEDIATE 에서는 실패 판정 | `prompts-antonym.ts:37, 40, 48` |
| **M4 축 오인** | 척도 자체가 다른 단어(능력축 vs 지식축). ⚠ 금지 쌍 8종에 저촉되지 않게 **새 축**으로 설계 | INTERMEDIATE | `validators/antonym.ts:443-448` |
| **M5 빈도↔지속 등 인접 척도 교체** | 지속축 단어에 빈도축 반의어를 붙임(`endless - occasional`) | INTERMEDIATE | probe 유닛 ITEM 2 |

> 5문항 유닛의 기본 배치: `M3(BASIC) / M5·M2(INTERMEDIATE) / M1·M4(KILLER)`.
> **같은 기제를 두 문항에 쓰면 헌법 §7 「1개 문항의 N개 사본」에 해당한다.**

#### C2. 표적 품사 구성

표면형 게이트가 품사마다 다른 압력을 준다(§4-2) — 이 자체가 학생이 하는 작업을 바꾼다.

| 구성 | 예 | 압력 |
|---|---|---|
| 형용사 중심 | `permanent-temporary`, `stable-unstable` | 척도 판정. 가장 안전 |
| 3인칭 동사(`-s`) 중심 | `strengthens-weakens`, `admits-denies` | 양쪽 `-s` 필수(`hasInflectionalS`) |
| 부사(`-ly`) 중심 | `rarely-frequently`, `quietly-loudly` | 양쪽 `-ly` 필수 |
| 명사 중심 | `uncertainty-certainty`, `defeat-victory` | 추상명사 축 판정 |
| 비교급/최상급 | `older-newer`, `hardest-easiest` | 화이트리스트 안에서만 안전(`:315-323`) |
| `-ing` 분사 | `growing-shrinking` | 양쪽 `-ing` |

→ 5문항이면 **문항마다 지배 품사를 바꿔라.** 부수 효과로 표적 어휘가 자동 분산된다(8-0 예산에 유리).

#### C3. 지문 내 표적 분포 = 학생이 다시 읽는 자리

| 분포 | 설계 |
|---|---|
| 도입 통념 집중 | 글이 반박하려는 통념 문장의 어휘를 5개 |
| 전환점 집중 | `however`·`but` 이후 논지 전환 문장 |
| 기제 설명부 집중 | 인과가 설명되는 중반부 |
| 사례·근거부 집중 | 예시 문장 |
| 전면 분산 | 문장마다 1개씩 (프롬프트 기본 권고 — `prompts-antonym.ts:103`) |

정답 표적은 이 분포 안에서 §8-B 라벨 배분과 함께 결정된다.

#### C4. 의미축 팔레트

한 문항의 5쌍이 쓰는 의미축을 문항마다 바꾼다: 빈도 / 지속·시간 / 강도·정도 / 방향·이동 / 확정성 / 가치·평가 / 범위·일반성 / 가시성 / 능력·성취 / 존재·유무.
같은 축을 두 문항의 **정답 자리**에 쓰지 마라 — 학생이 같은 판정을 두 번 한다.

#### C5. `바른짝:` 의 성격

- **지문 내 단어를 바른짝으로** — 학생이 지문을 다시 읽으면 답이 확인되는 설계(근거 이중화에 유리)
- **지문 밖 단어를 바른짝으로** — 어휘력을 요구하는 설계
문항마다 번갈아 쓰면 해설의 성격도 달라진다.

#### C6. 미끼 쌍(정답 아닌 N-1쌍)의 난이도 스펙트럼

`prompts-antonym.ts:49` 의 규칙: 초등 사전 쌍(`long-short`, `same-different`)은 **문항당 최대 1개**, 나머지는 지문에 정박한 내용어.
문항마다 그 1개를 **넣는/빼는** 것만으로도 소거 난이도가 달라진다. KILLER 문항에서는 0개로.

#### C7. `point:` 문자열 설계 (하네스가 결정형으로 강제)

`POINT_DUPLICATE` 는 정규화(소문자·비문자 제거) 후 **완전일치**만 본다(`qgen-core.ts:325-334, 379-384`).
→ 문자열만 바꿔 우회하지 마라. `point:` 는 **C1 기제 + C3 위치 + 정답 표적**을 담아 쓴다.
예: `보존주의 프레임 — 마지막 문장의 curious 를 오축 다의어로 겨냥`

### 8-D. 5문항 유닛 설계표 (probe 로 gate 0 · quality 0 실증된 실물)

| # | difficulty | 기제 | 정답 라벨(=번호) | 지배 품사 | 표적 5개 | 정답 쌍 → 바른짝 |
|---|---|---|---|---|---|---|
| 1 | KILLER | M1 오축 다의어 | (E) = 5 | 혼합 | growing·preserve·resist·provisional·**curious** | `curious - incurious` → `ordinary` |
| 2 | INTERMEDIATE | M5 척도 교체 | (E) = 5 | 형용사+`-s`동사 | permanent·stable·strengthens·admits·**endless** | `endless - occasional` → `finite` |
| 3 | BASIC | M3 투명 동의어 | (C) = 3 | 부사+형용사 | rarely·different·**neglect**·fatal·quietly | `neglect - carelessness` → `attention` |
| 4 | KILLER | M3′ 유의어 위장(고급어) | (D) = 4 | 형용사+부사 | careful·deliberate·physically·**hybrid**·conservative | `hybrid - composite` → `pure` |
| 5 | INTERMEDIATE | M3″ 추상명사 유의어 | (D) = 4 | 비교급+동사+명사 | older·distort·emerges·**uncertainty**·dilute | `uncertainty - doubt` → `certainty` |

> 이 표는 형식 검증용 실물이다(probe P3: blocking 0 · qualityBlocking 0). **품질 관점에서는 개선 여지가 있다** —
> 정답 라벨이 5/5/3/4/4 로 §8-B 권고(1:1 배분)를 만족하지 않고, 기제도 M3 계열이 3회다.
> 실제 저작에서는 §8-B·C1 을 우선 만족시켜라.

---

## 부록 — 검증 재현

```bash
./node_modules/.bin/tsx qbank/work/_probe-ANTONYM.ts   # 26/26 PASS
npx tsx scripts/_test-md-antonym.ts                    # 리포 정본 회귀 스위트
```

probe 커버리지: P1 리포 픽스처 · P2 §2 골격 단일문항 · P3 gateUnit 5문항 유닛(blocking/qualityBlocking 0) ·
P4 `ANSWER_DUPLICATE` 실증 · P5 `often-rarely` 표면형 위반 · P7 `pairCount:7` ·
E1~E11' 파서 날붙이 13종(머리표 장식·같은 줄 지문·오답 줄 불릿·산문 오인·원문자 정답·소문자 마커·대소문자 드리프트·구/괄호 짝단어·정답 라벨 오답 혼입·문항 연접).
