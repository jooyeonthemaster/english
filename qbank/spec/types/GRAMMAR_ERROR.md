# 어법 판단 (GRAMMAR_ERROR)

> **분류** 어법(밑줄 N지선다·정답 K개) · **지문변형** ○ (마커 K곳만 오형 주입, 그 밖은 1글자도 금지) · **정답 머리표** `정답:` (라벨 `(A)`~`(J)`) · **최소 지문 길이** 코드 강제 없음(`feasibility.ts:27-62` 은 SENTENCE_ORDER 만 게이트) / **코퍼스 자가보정 하한 80단어·4문장** (`qbank/spec/unit-plan.json` calibration.어법 = `{n:358, minWords:80, minSentences:4}`)
>
> 필수 섹션 5개: `밑줄지문:` `원형·포인트:` `정답:` `고침:`(또는 `고침(X):`) `해설:` — K<N 이면 `오답:` 추가(총 6개)
> 진실원 파일: `src/lib/md-qgen/parser.ts` (`parseMdGrammar` · `gateMdQuestion` 어법 분기) · `src/lib/md-qgen/adapter.ts` (`adaptMdGrammarToAiQuestion`)
> **이 유형은 정본(canon)이다** — `lane-registry` 에 없고 `md-stream/route.ts` 가 직접 분기한다(`route.ts:385-400, 1077-1081`). 오프라인 하네스는 `qbank/harness/canon.ts` 의 래퍼가 담당한다.
> 검증: `qbank/work/_probe-GRAMMAR_ERROR.ts` — **78/78 통과** (verified=true)
> 계획 물량: 유닛 **4,369** · 목표 문항 **23,921** · 배제 지문 105 (`qbank/spec/unit-plan.json` byType.GRAMMAR_ERROR)

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문 안 **N곳(5~10)** 에 밑줄이 그어지고, 그중 **K곳(1~N)** 만 어법상 틀린 형태로 바뀌어 있다.
학생은 밑줄 하나하나를 **독립적으로 정오 판정**한 뒤, 틀린 자리를 찾아낸다.

핵심은 "틀린 것을 찾기"가 아니라 **"밑줄 자리에서 멀리 떨어진 단서를 추적하기"** 다.
밑줄만 보면 다섯 자리 전부가 자연스러워 보여야 하고, 진짜 주어의 핵·선행사·병렬 시작점·행위자구처럼
**밑줄 밖에 있는 구조**를 읽어야만 오형이 드러나야 한다(`prompts.ts:466-467`).

### 형제 유형과의 결정적 차이 (★ 네모 어법과의 관계)

| 축 | **GRAMMAR_ERROR (밑줄 어법)** | GRAMMAR_CHOICE_COMBO (네모 어법) | GRAMMAR_CORRECTION (고쳐쓰기) |
|---|---|---|---|
| 경로 | **정본** — 라우트 직접 분기 (`route.ts:385-400`) | 레인 (`lane-combo.ts`) | 레인 (`lane-grammar-correction.ts`) |
| 지문 마커 | `[[A:표현]]` (값 1개) — `parser.ts:143` | `[[A:올바른\|틀린]]` (값 2개) — `parser-combo.ts` | 문장 단위 발췌 |
| 자리 수 노브 | **markerCount 5~10** (`grammar.ts:7-11`) | 3 고정, 노브 없음 (`lane-combo.ts:41-50`) | errorCount 1~5 (`grammar.ts:25-29`) |
| 정답 수 노브 | **answerCount 1~N** (`grammar.ts:13-17`) | 없음(조합 1개) | errorCount 와 동일 |
| 지문 변형량 | 정답 K곳만 오형 주입 | **0곳** — 원문은 항상 옳고 틀린 후보는 네모 안에만 | 발췌 문장에 오류 주입 |
| 학생 과제 | N곳 각각 정오 판정 → 틀린 K곳 지목 | 3자리 각각 둘 중 택1 → 조합 소거 | 틀린 곳을 **직접 고쳐 쓰기**(서술형) |
| 미끼 자리 | **N−K곳**(정문 밑줄)이 미끼 | 미끼 자리 0 — 세 네모가 전부 출제 지점 | — |
| 학생 표면 라벨 | `①`~`⑩` (`parser.ts:660-666`) | `①`~`⑤`(조합 선지) | — |
| 저장 라벨 | `(A)`~`(J)` (`adapter.ts:283-305`) | `(A)(B)(C)` 슬롯 | — |
| 선지 셔플 | **없음** — `SHUFFLE_OPTION_TYPES` 에 미포함 (`question-diversity.ts:508-522`) | 있음 (`question-diversity.ts:521`) | 해당 없음 |
| 정답의 진실원 | `markedExpressions[].isError` (`adapter.ts:241-242`) | 조합 정답 라벨 | 수정 세그먼트 |

**셔플이 없다는 사실이 다각화 설계를 바꾼다.** 어법의 밑줄 라벨은 후처리가 **지문 등장 순서로 재부여**한다
(`grammar-error.ts:122-145`). 즉 `(A)`~`(E)` 는 지문 위치의 함수이고, 정답 라벨 위치는 **오형을 지문 어디에 심는가**로만
결정된다. 정답이 매번 `(C)` 에 몰리면 그건 셔플러가 아니라 저자의 책임이다(`question-diversity.ts:425-433` 이
프로덕션에서 위치 스티어링 지시를 넣는 이유).

---

## 2. 마크다운 골격

### 2-1. 복붙 가능한 실물 골격 (표준형 5마커·1정답)

````md
<!-- ITEM <n>
difficulty: <BASIC|INTERMEDIATE|KILLER>
point: <이 문항이 겨냥하는 출제 포인트 한 줄 — 유닛 내 전부 달라야 한다>
craft: <설계 메모 — 게이트 대상 아님>
-->
밑줄지문:
<지문 전문을 한 글자도 바꾸지 않고 그대로 한 줄로. 단 다섯 곳만 [[A:표현]] [[B:표현]] [[C:표현]] [[D:표현]] [[E:표현]] 로 감싼다. 정답 자리 한 곳만 마커 안 표현이 오형이고, 나머지 네 곳은 원문 그대로다. 라벨은 지문 등장 순서대로 A→B→C→D→E.>

원형·포인트:
(A) <이 자리의 원문 형태(정답 자리는 고친 원형, 미끼는 마커 안 표현과 동일)> | <포인트코드 a~m 한 글자>
(B) <원문 형태> | <포인트코드>
(C) <원문 형태> | <포인트코드>
(D) <원문 형태> | <포인트코드>
(E) <원문 형태> | <포인트코드>
정답: (<정답 라벨 하나>)
고침: <정답 자리를 고친 원형 — 원형·포인트의 그 라벨 값과 동일해야 안전>
해설: <한국어 합니다체. 오형 표면을 먼저 인용하고 그 다음 정답형을 제시한다. 밑줄 밖 어느 단서로 판정하는지 명시.>
오답:
(<비정답 라벨1>) <학생이 헷갈리는 지점 + 왜 옳은지 1문장>
(<비정답 라벨2>) <…>
(<비정답 라벨3>) <…>
(<비정답 라벨4>) <…>
````

> `<!-- ITEM n ... -->` 블록은 **qbank 컨테이너 규약**이다(`qbank/harness/qgen-core.ts:30-57`).
> md-qgen 계약 대상은 그 아래 본문뿐이다.

#### 비표준형 변주 2종 (골격 차이만)

**(가) N마커·K정답 (K≥2)** — `정답:` 은 `", "` 병기, `고침:` 은 **라벨식**으로 K줄, `오답:` 은 **N−K개**.

```md
정답: (B), (E)
고침(B): <B 자리를 고친 원형>
고침(E): <E 자리를 고친 원형>
해설: <정답 라벨당 1~2문장>
오답:
(A) <…>
(C) <…>
(D) <…>
(F) <…>
(G) <…>
```

**(나) K=N (전 밑줄이 정답)** — `오답:` 섹션 **전체를 생략**한다(`parser.ts:343-346` wrongNeeded=0).

```md
정답: (A), (B), (C), (D), (E)
고침(A): <…>
고침(B): <…>
고침(C): <…>
고침(D): <…>
고침(E): <…>
해설: <다섯 자리가 각각 왜 오형인지>
```

### 2-2. 검증된 정상 픽스처 전문 (`scripts/_test-md-multi-formats.ts` verbatim)

공통 지문 (`GR_PASSAGE`, `scripts/_test-md-multi-formats.ts:206-211`):

```
The researchers who study urban wildlife have discovered that many species adapt quickly to city environments. Raccoons, for example, have learned to open containers that were designed to keep them out. What surprises scientists most is the speed at which these behaviors spread through populations. Young animals watch their mothers closely and imitate the techniques that prove successful. As cities grow, the animals living in them will continue to develop skills that their rural cousins never need.
```

**(1) 표준 5·1** (`scripts/_test-md-multi-formats.ts:313-329`) — 프로브 P1-1 gate 0:

```md
밑줄지문:
The researchers [[A:who study]] urban wildlife [[B:have discovered]] that many species adapt quickly to city environments. Raccoons, for example, have learned [[C:opening]] containers that [[D:were designed]] to keep them out. What surprises scientists most is the speed at which these behaviors spread through populations. Young animals [[E:watch]] their mothers closely and imitate the techniques that prove successful. As cities grow, the animals living in them will continue to develop skills that their rural cousins never need.

원형·포인트:
(A) who study | b
(B) have discovered | d
(C) to open | k
(D) were designed | e
(E) watch | a
정답: (C)
고침: to open
해설: learn 은 to부정사를 목적어로 취하므로 opening 이 아니라 to open 이 필요합니다.
오답:
(A) 선행사가 복수 사람 명사라 who 가 옳습니다.
(B) 주어가 복수라 have 가 옳습니다.
(D) 주어와 수동 관계라 옳습니다.
(E) 주어가 복수라 watch 가 옳습니다.
```

**(2) 비표준 7·2** (`scripts/_test-md-multi-formats.ts:213-233`) — 프로브 P1-2 gate 0:

```md
밑줄지문:
The researchers [[A:who study]] urban wildlife [[B:has discovered]] that many species adapt quickly to city environments. Raccoons, for example, have learned [[C:to open]] containers that [[D:were designed]] to keep them out. What surprises scientists most is the speed [[E:which]] these behaviors spread through populations. Young animals [[F:watch]] their mothers closely and imitate the techniques that prove successful. As cities grow, the animals [[G:living]] in them will continue to develop skills that their rural cousins never need.

원형·포인트:
(A) who study | b
(B) have discovered | d
(C) to open | k
(D) were designed | e
(E) at which | b
(F) watch | a
(G) living | c
정답: (B), (E)
고침(B): have discovered
고침(E): at which
해설: (B)는 주어 The researchers 가 복수이므로 has 가 아니라 have 가 필요합니다. (E)는 the speed 를 선행사로 받는 전치사+관계사 자리이므로 at which 가 필요합니다.
오답:
(A) 선행사가 복수 사람 명사라 who 가 옳습니다.
(C) learn 뒤 to부정사 목적어 자리라 옳습니다.
(D) 주어 containers 와 수동 관계라 옳습니다.
(F) 주어가 복수라 watch 가 옳습니다.
(G) the animals 를 능동 수식하는 현재분사라 옳습니다.
```

**(3) K=N (5·5)** (`scripts/_test-md-multi-formats.ts:351-366`) — 프로브 P1-3 gate 0. `오답:` 섹션 없음:

```md
밑줄지문:
The researchers [[A:which study]] urban wildlife [[B:has discovered]] that many species adapt quickly to city environments. Raccoons, for example, have learned [[C:opening]] containers that [[D:designing]] to keep them out. What surprises scientists most is the speed at which these behaviors spread through populations. Young animals [[E:watches]] their mothers closely and imitate the techniques that prove successful. As cities grow, the animals living in them will continue to develop skills that their rural cousins never need.

원형·포인트:
(A) who study | b
(B) have discovered | d
(C) to open | k
(D) were designed | e
(E) watch | a
정답: (A), (B), (C), (D), (E)
고침(A): who study
고침(B): have discovered
고침(C): to open
고침(D): were designed
고침(E): watch
해설: 다섯 자리 모두 오형입니다. (A)는 사람 선행사, (B)는 복수 수일치, (C)는 to부정사 목적어, (D)는 수동태, (E)는 복수 수일치가 각각 필요합니다.
```

### 2-3. 정찰이 새로 작성해 통과시킨 유닛 실물 (프로브 P2/P3 — **5문항 전건** gate 0 / adapt ok / postprocess ok / quality error 0 / gateUnit blocking 0)

지문 (`PASSAGE`, 96단어·5문장):

```
Scientists who study coral reefs have long argued that the animals living in them depend on microscopic algae. These partners, packed into the tissues of each polyp by a slow process of infection, supply most of the energy that a coral needs to build its skeleton. When the water grows too warm, the algae are expelled, and the reef turns a ghostly white. What surprises researchers most is the speed at which whole colonies collapse. Reefs that recover quickly tend to sit in currents that carry cooler water, so restoration teams now map temperature patterns before they plant new fragments.
```

**표적 배분표** (문항을 쓰기 **전에** 채운 것 — §8 절차의 실물):

| # | 난이도 | 정답 G코드 | 정답 자리(지문 위치) | 오형 | 미끼 코드 팔레트 | 정답 라벨 |
|---|---|---|---|---|---|---|
| 1 | BASIC | d 수일치 | S1 주절 본동사 | have long argued → has long argued | b, c, k, e | (B) |
| 2 | INTERMEDIATE | b 관계사 | S4 전치사+관계대명사 | at which → which | d, c, e, k | (D) |
| 3 | INTERMEDIATE | a 정동사vs준동사 | S3 등위절 서술어 | turns → turning | c, d, b, b | (C) |
| 4 | KILLER | c 분사(태) | S2 삽입 분사구 | packed → packing | b, d, a, k | (B) |
| 5 | KILLER | k 부정사vs동명사 | S5 tend 보어 | to sit → sitting | b, d, e, b | (E) |

정답 라벨 분포 (B, D, C, B, E) — 한 라벨에 몰리지 않음. 정답 G코드 5종 전부 상이. 미끼 팔레트도 매 문항 다름.

<details open>
<summary><b>ITEM 1 — BASIC · (d) 수일치</b></summary>

```md
<!-- ITEM 1
difficulty: BASIC
point: 수일치 — 관계절에 가려진 복수 주어와 본동사
craft: 관계절 who study coral reefs 를 걷어내야 주어가 보인다
-->
밑줄지문:
Scientists [[A:who study]] coral reefs [[B:has long argued]] that the animals [[C:living in them]] depend on microscopic algae. These partners, packed into the tissues of each polyp by a slow process of infection, supply most of the energy that a coral needs [[D:to build]] its skeleton. When the water grows too warm, the algae [[E:are expelled]], and the reef turns a ghostly white. What surprises researchers most is the speed at which whole colonies collapse. Reefs that recover quickly tend to sit in currents that carry cooler water, so restoration teams now map temperature patterns before they plant new fragments.

원형·포인트:
(A) who study | b
(B) have long argued | d
(C) living in them | c
(D) to build | k
(E) are expelled | e
정답: (B)
고침: have long argued
해설: (B) "has long argued"의 주어는 관계절 "who study coral reefs"에 가려진 복수 명사 "Scientists"이므로 단수형 has 는 성립하지 않고 "have long argued"가 필요합니다. 관계절을 걷어내고 주절의 주어와 동사를 맞추면 수가 어긋난 것이 드러납니다.
오답:
(A) 선행사 "Scientists"가 사람이고 관계절 안에서 주어 자리이므로 who 가 옳습니다.
(C) "the animals"를 뒤에서 능동으로 수식하는 현재분사 자리라 living 이 옳습니다.
(D) "needs"의 목적어로 오는 to부정사 자리라 to build 가 옳습니다.
(E) 주어 "the algae"가 방출되는 쪽이므로 수동태 are expelled 가 옳습니다.
```
</details>

<details>
<summary><b>ITEM 2 — INTERMEDIATE · (b) 관계사</b></summary>

```md
<!-- ITEM 2
difficulty: INTERMEDIATE
point: 관계사 — 완전한 절 앞의 전치사+관계대명사
craft: 절의 완전성으로 판정. 미끼 (B)는 by 행위자구, (E)는 tend 보어
-->
밑줄지문:
Scientists who study coral reefs [[A:have long argued]] that the animals living in them depend on microscopic algae. These partners, [[B:packed]] into the tissues of each polyp by a slow process of infection, supply most of the energy that a coral needs to build its skeleton. When the water grows too warm, the algae [[C:are expelled]], and the reef turns a ghostly white. What surprises researchers most is the speed [[D:which]] whole colonies collapse. Reefs that recover quickly tend [[E:to sit]] in currents that carry cooler water, so restoration teams now map temperature patterns before they plant new fragments.

원형·포인트:
(A) have long argued | d
(B) packed | c
(C) are expelled | e
(D) at which | b
(E) to sit | k
정답: (D)
고침: at which
해설: (D) "which"가 이끄는 절은 "whole colonies collapse"로 이미 완전하므로 관계대명사만으로는 자리가 채워지지 않고, 선행사 "the speed"를 받는 전치사를 포함한 "at which"가 필요합니다. 앞 문장의 "at which"와 같은 구조를 절의 완전성으로 판정해야 합니다.
오답:
(A) 관계절에 가려진 복수 주어 "Scientists"와 수가 맞으므로 have long argued 가 옳습니다.
(B) 뒤에 "by a slow process of infection"이라는 행위자구가 이어져 수동 관계이므로 과거분사 packed 가 옳습니다.
(C) 주어 "the algae"가 방출되는 쪽이므로 수동태 are expelled 가 옳습니다.
(E) tend 는 to부정사를 보어로 취하므로 to sit 이 옳습니다.
```
</details>

<details>
<summary><b>ITEM 3 — INTERMEDIATE · (a) 정동사 vs 준동사</b></summary>

```md
<!-- ITEM 3
difficulty: INTERMEDIATE
point: 정동사 대 준동사 — 등위절의 비어 있는 서술어 자리
craft: and 앞뒤 절의 동사 수 세기. 미끼에 관계사 2종 배치
-->
밑줄지문:
Scientists who study coral reefs have long argued that the animals [[A:living in them]] depend on microscopic algae. These partners, packed into the tissues of each polyp by a slow process of infection, [[B:supply]] most of the energy that a coral needs to build its skeleton. When the water grows too warm, the algae are expelled, and the reef [[C:turning]] a ghostly white. What surprises researchers most is the speed [[D:at which]] whole colonies collapse. Reefs that recover quickly tend to sit in currents [[E:that carry]] cooler water, so restoration teams now map temperature patterns before they plant new fragments.

원형·포인트:
(A) living in them | c
(B) supply | d
(C) turns | a
(D) at which | b
(E) that carry | b
정답: (C)
고침: turns
해설: (C) "turning"은 등위접속사 and 가 이어 붙인 두 번째 절의 서술어 자리에 놓여 있는데, 그 절에는 다른 정동사가 없으므로 준동사는 올 수 없고 정동사 turns 가 필요합니다. and 앞뒤 절의 동사 수를 세어 보면 자리가 비어 있음이 드러납니다.
오답:
(A) "the animals"를 뒤에서 능동으로 수식하는 현재분사구라 living in them 이 옳습니다.
(B) 삽입된 분사구를 걷어내면 주어가 복수 "These partners"이므로 supply 가 옳습니다.
(D) 뒤 절이 완전하고 선행사가 "the speed"이므로 전치사를 포함한 at which 가 옳습니다.
(E) 선행사 "currents"가 복수이고 관계절 안에서 주어 자리이므로 that carry 가 옳습니다.
```
</details>

<details>
<summary><b>ITEM 4 — KILLER · (c) 분사의 태</b></summary>

```md
<!-- ITEM 4
difficulty: KILLER
point: 분사 — 행위자구를 동반한 삽입 분사구의 태
craft: by 행위자구가 밑줄에서 6단어 떨어져 있다. 정답 코드 c 는 미끼에 없음
-->
밑줄지문:
Scientists [[A:who study]] coral reefs have long argued that the animals living in them depend on microscopic algae. These partners, [[B:packing]] into the tissues of each polyp by a slow process of infection, [[C:supply]] most of the energy that a coral needs to build its skeleton. When the water grows too warm, the algae are expelled, and the reef [[D:turns]] a ghostly white. What surprises researchers most is the speed at which whole colonies collapse. Reefs that recover quickly tend [[E:to sit]] in currents that carry cooler water, so restoration teams now map temperature patterns before they plant new fragments.

원형·포인트:
(A) who study | b
(B) packed | c
(C) supply | d
(D) turns | a
(E) to sit | k
정답: (B)
고침: packed
해설: (B) "packing"은 뒤에 이어지는 "by a slow process of infection"이라는 행위자구와 충돌합니다. 삽입구의 의미상 주어인 "These partners"가 채워 넣어지는 쪽이므로 수동을 나타내는 과거분사 packed 가 필요합니다.
오답:
(A) 선행사 "Scientists"가 사람이고 관계절 안에서 주어 자리이므로 who study 가 옳습니다.
(C) 삽입된 분사구를 걷어내면 주어가 복수 "These partners"이므로 supply 가 옳습니다.
(D) 등위접속사 and 가 이어 붙인 절의 서술어 자리라 정동사 turns 가 옳습니다.
(E) tend 는 to부정사를 보어로 취하므로 to sit 이 옳습니다.
```
</details>

<details>
<summary><b>ITEM 5 — KILLER · (k) 부정사 vs 동명사</b></summary>

```md
<!-- ITEM 5
difficulty: KILLER
point: 부정사 대 동명사 — tend 의 보어 형태
craft: 문장 뒤쪽 map 과의 가짜 병렬이 오독 유인. 정답 코드 k 는 미끼에 없음
-->
밑줄지문:
Scientists [[A:who study]] coral reefs have long argued that the animals living in them depend on microscopic algae. These partners, packed into the tissues of each polyp by a slow process of infection, [[B:supply]] most of the energy that a coral needs to build its skeleton. When the water grows too warm, the algae [[C:are expelled]], and the reef turns a ghostly white. What surprises researchers most is the speed [[D:at which]] whole colonies collapse. Reefs that recover quickly tend [[E:sitting]] in currents that carry cooler water, so restoration teams now map temperature patterns before they plant new fragments.

원형·포인트:
(A) who study | b
(B) supply | d
(C) are expelled | e
(D) at which | b
(E) to sit | k
정답: (E)
고침: to sit
해설: (E) "sitting"은 tend 의 보어 자리에 놓여 있는데, tend 는 동명사가 아니라 to부정사를 보어로 취하므로 to sit 이 필요합니다. 같은 문장 뒤쪽의 "map"과 병렬로 읽으려 해도 주어와 접속 관계가 달라 성립하지 않습니다.
오답:
(A) 선행사 "Scientists"가 사람이고 관계절 안에서 주어 자리이므로 who study 가 옳습니다.
(B) 삽입된 분사구를 걷어내면 주어가 복수 "These partners"이므로 supply 가 옳습니다.
(C) 주어 "the algae"가 방출되는 쪽이므로 수동태 are expelled 가 옳습니다.
(D) 뒤 절이 완전하고 선행사가 "the speed"이므로 전치사를 포함한 at which 가 옳습니다.
```
</details>

---

## 3. 파서 계약 (★ 가장 중요)

### 3-0. 파서에는 두 경로가 있다 — **v2(밑줄지문) 만 써라**

`parseMdGrammar` 는 `밑줄지문:` 섹션 유무로 갈린다(`parser.ts:180`).

| 경로 | 트리거 | 마크 획득 | qbank 채택 |
|---|---|---|---|
| **v2 (지문 복사)** | `밑줄지문:` 섹션 존재 | 인라인 마커 `[[A:표현]]` + `원형·포인트:` 메타 (`parser.ts:181-199`) | ★ **정본. 이것만 쓴다** |
| v1 (구형 3파이프) | `밑줄지문:` 부재 | `(A) 원문 \| 표시형 \| 코드 [\| 앵커]` 줄 (`parser.ts:225-233`) | 금지 — 위치앵커·모호성 게이트가 추가로 붙는다 |

> **v1 로 떨어지면 무엇이 사라지는가**: `밑줄지문:` 헤더를 한 글자라도 다르게 쓰면(예: `밑줄 지문:`) v2 정규식이
> 매치되지 않아 v1 로 떨어지고, v1 의 3파이프 줄이 없으므로 `marks = []` → 게이트가 「밑줄 0개 (5개 필요)」로
> **early return** 하며 다른 모든 사유를 숨긴다. (프로브 P4-16 실증)

프로덕션 프롬프트도 v2 만 지시한다(`prompts.ts:445-453, 399-403`).

### 3-1. 섹션 추출 정규식 전수 (v2 경로)

| # | 대상 | 정규식 / 리터럴 | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|
| R1 | 밑줄지문 | `/^밑줄지문:\s*\n([\s\S]*?)(?=^원형·포인트:\|^원형:)/m` → `.trim()` | `parser.ts:180-181` | 마크 전부. v1 로 낙하 |
| R2 | 원형·포인트 | `/^원형·포인트:\s*\n([\s\S]*?)(?=^정답:)/m` | `parser.ts:183` | 전 마크의 `original`·`code` (게이트가 라벨별로 2줄씩 반려) |
| R3 | 메타 줄 | `/^\(([A-J])\)\s*(.+?)\s*\|\s*\(?\s*([a-m])\s*\)?(?:\s+[^\|]*)?$/gm` | `parser.ts:186-188` | 그 라벨의 원형·코드 |
| R4 | 인라인 마커 | `/\[\[([A-J]):((?:(?!\]\]).)+)\]\]/g` | `parser.ts:143` | 그 마크 자체(개수 반려) |
| R5 | 정답 줄 | `/^정답:\s*(.+)$/m` → 선행 라벨 런 `/^\s*(\(([A-J])\)(?:\s*,\s*\([A-J]\))*)/` → `/\(([A-J])\)/g` | `parser.ts:153-161` | 정답 전체 |
| R6 | 고침(라벨식) | `/^고침\(([A-J])\):\s*(.+)$/gm` | `parser.ts:164-166` | 그 라벨의 고침 |
| R7 | 고침(구형 단일) | `/^고침:\s*(.+)$/m` — **`fixes` 가 비어 있고 `answer` 가 있을 때만** 첫 정답에 귀속 | `parser.ts:167-170` | 고침 |
| R8 | 해설 | `/^해설:\s*([\s\S]*?)(?=^오답:)/m` → 없으면 `/^해설:\s*([\s\S]+)$/m` | `parser.ts:209-212` | 해설 |
| R9 | 오답 섹션 | `text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? ""` | `parser.ts:200` | 오답해설 전부 |
| R10 | 오답 줄 | `/^\(([A-J])\)\s*(.+)$/gm` — 정답 라벨 제외 + **실재 마크 라벨만** | `parser.ts:213-221` | 그 줄 |

**전 정규식이 `^`(멀티라인 행두) 앵커다.** 머리표 앞에 공백·`>`·`-`·`#`·`|` 가 하나라도 붙으면 그 섹션이 통째로 사라진다.
정본 파서는 `decoration.ts` 를 **import 하지 않는다**(00-contract §8). 관용은 없다.

### 3-2. 인라인 마커 (`[[A:표현]]`)

- 라벨은 **`A`~`J` 대문자만**. `K` 이상·소문자·숫자는 마커로 인식되지 않는다(프로브 P6-14 실증).
- 값은 `]]` 를 포함할 수 없다(`(?:(?!\]\]).)+` — 최소 1글자).
- `INLINE_MARK_RE` 는 **전역 플래그**다. `matchAll` 전용이며 `exec`/`test` 는 `lastIndex` 오염을 남긴다(`parser.ts:142`).
- 마커는 지문 **등장 순서대로 A→B→C…** 여야 한다. 순서가 어긋나도 파서·게이트는 통과하지만 후처리가
  `Label reordered to passage order` 경고와 함께 라벨을 재부여하고(`grammar-error.ts:122-145`), 해설 본문의
  `(D)` 같은 라벨 언급까지 재매핑한다(`grammar-error.ts:190-197`). **저자가 순서를 지키면 이 개입이 0이다.**
- `shown` 은 `m[2].trim()` 으로 트림된다(`parser.ts:196`). 마커 안 선행/후행 공백은 흡수되지만, 마커 **바깥**
  공백은 재구성 대조에 그대로 남는다.

### 3-3. ★ 지문 재구성 대조 — 이 유형 최강 불변식

게이트는 `markedPassage` 의 각 마커를 **그 라벨의 `original` 로 되돌린 재구성본**을 만들어 소스 지문과 비교한다.

```ts
let reconstructed = q.markedPassage;
for (const m of q.marks) {
  reconstructed = reconstructed.replace(
    new RegExp(`\\[\\[${m.label[1]}:(?:(?!\\]\\]).)+\\]\\]`),
    () => m.original,
  );
}
if (normalizeWs(reconstructed) !== pn) v.push("지문 재구성 불일치 — …");
```
— `parser.ts:293-302`

이 한 검사가 **위치·축자·무단편집을 동시에** 잡는다(프로덕션 `PASSAGE_TAMPERED` 등가).

`normalizeWs` 가 흡수하는 차이는 **이것뿐**이다(`parser.ts:67-74`):

| 원문 | 허용 대체 |
|---|---|
| `‘ ’ ʼ` | `'` |
| `“ ”` | `"` |
| `– —` | `-` |
| `…` | `...` |
| 연속 공백/줄바꿈 | 단일 공백 |

**그 외 모든 문자 차이는 반려다.** 관사 하나, 쉼표 하나, 대소문자 하나가 다르면 유닛 전체가 죽는다.

> ⚠ 정규식은 **비전역**이라 라벨당 **첫 매치 1회만** 치환한다. 같은 라벨을 두 번 쓰면 두 번째 마커가 그대로
> 남아 재구성이 반드시 실패한다.

### 3-4. `원형·포인트:` 메타 줄

```
(A) who study | b
```

- 라벨 `(A)`~`(J)` → `original` → `|` → `code`(a~m 한 글자). `original` 은 `.trim()`, `code` 는 소문자 1글자.
- 코드 뒤 괄호·한글 설명 드리프트는 관용된다(`(c) 분사` 형 — `parser.ts:185, 187`). **하지만 저작 규칙은 한 글자.**
- 코드는 `a`~`m` 만. `POINT_NAME` 에 없는 코드는 어댑터가 `"a"` 로 강제 치환한다(`adapter.ts:303`).

| code | 의미 (`adapter.ts:28-42`) | code | 의미 |
|---|---|---|---|
| a | 정동사·준동사 | h | 목적격보어 |
| b | 관계사 | i | 병렬 |
| c | 분사 | j | 가정법 |
| d | 수일치 | k | 부정사·동명사 |
| e | 능·수동태 | l | 전치사·접속사 |
| f | 형용사·부사 | m | 비교구문 |
| g | 대명사 | | |

**`original` 의 의미는 라벨마다 다르다** (`prompts.ts:449`):
- **정답 라벨** → 지문의 **원문(옳은) 형태**. 마커 안 `shown` 은 오형.
- **미끼 라벨** → 마커 안 `shown` 과 **완전히 동일**해야 한다.

> 어기면: 미끼에서 `original ≠ shown` 이면 오토스냅이 `original := shown` 으로 덮어쓰고(§3-8),
> 그 결과 재구성본이 원문과 달라져 「지문 재구성 불일치」라는 **엉뚱한 사유**로 반려된다(프로브 P4-5b).

### 3-5. `정답:` 줄 — 선행 라벨 런만 읽는다

```ts
const answerLine = text.match(/^정답:\s*(.+)$/m)?.[1] ?? "";
const leadingRun = answerLine.match(/^\s*(\(([A-J])\)(?:\s*,\s*\([A-J]\))*)/)?.[1] ?? "";
const answers = [...new Set([...leadingRun.matchAll(/\(([A-J])\)/g)].map((m) => `(${m[1]})`))];
```
— `parser.ts:153-161`

- 구분자 리터럴은 **`, `**(쉼표+공백). 정규식은 `\s*,\s*` 라 공백 드리프트는 관용되지만 **쉼표는 필수**다.
- **`(B) (E)` 처럼 쉼표 없이 나열하면 두 번째부터 버려진다.**
- 라벨 런 **뒤**의 부가 설명은 무시된다: `정답: (C) — (D)는 옳음` → `answers = ["(C)"]` (`parser.ts:154-156`).
- 라벨 런이 **줄 맨 앞**에서 시작해야 한다. `정답: 밑줄 (C)` 처럼 앞에 다른 글자가 오면 `leadingRun = ""` → **정답 0개**.
- `new Set` 으로 중복 제거 → `정답: (B), (B)` 는 1개로 접힌다 → 「정답 라벨 1개 (설정 2개)」.
- `answer` = `answers[0]` (하위호환 단일 축), `answers` = 전체 (`parser.ts:162`).

### 3-6. `고침:` / `고침(X):` 줄

| answerCount | 형식 | 게이트가 보는 것 |
|---|---|---|
| 1 | `고침: <원형>` | `q.fix` 비어 있으면 「고침 누락」 (`parser.ts:336-337`) |
| ≥2 | `고침(B): <원형>` 을 정답 라벨마다 1줄 | 라벨별 `q.fixes[label]` 없으면 「고침((B)) 누락」 (`parser.ts:338-341`) |

- **구형 `고침:` 은 `fixes` 가 비어 있을 때만** 첫 정답에 귀속된다(`parser.ts:168-170`).
  → K≥2 인데 `고침:` 한 줄만 쓰면 두 번째 정답의 고침이 없어 반려.
- 반대로 K=1 인데 `고침(B):` 라벨식을 써도 통과한다(`fix` 폴백 `Object.values(fixes)[0]`, `parser.ts:171-172`).
  **안전을 위해 K=1 은 `고침:`, K≥2 는 `고침(X):` 로 통일하라.**
- 고침 값은 **정답 라벨의 `original` 과 동일**해야 한다. 다르면 후처리가 `Correction normalized to source expression`
  경고와 함께 덮어쓰거나(`grammar-error.ts:61-72`), 품질 검증기가 `grammar-correction-not-source-backed` 를 낸다
  (`dispatcher.ts:1391-1397`).

### 3-7. `해설:` / `오답:`

- **`해설:` 은 `오답:` 직전까지** 캡처된다(`parser.ts:210`). `오답:` 이 없으면 문서 끝까지(`parser.ts:211`).
  → K=N(오답 섹션 생략)일 때 해설 뒤에 아무 텍스트나 붙이면 전부 해설로 빨려 들어간다.
- **`오답:` 뒤 라벨 줄은 `(A)` 형식**이다. 학생 표면의 `①` 이 아니다.
- 파서가 자동으로 걸러내는 것(관용, 의존 금지):
  - 정답 라벨이 오답 목록에 끼면 제거 (`parser.ts:219`) — 프로브 P4-12
  - 마커에 없는 잉여 라벨 줄 무시 (`parser.ts:220`) — 프로브 P4-13
- 오답해설 개수는 **정확히 `markerCount − answerCount`** 여야 한다(`parser.ts:343-346`).

### 3-8. 오토스냅 (0원 자동 보정 — 있어도 **의존하지 마라**)

`autoSnapGrammarMarks` 의 v2 분기는 **단 하나의 교정**만 한다(`parser.ts:541-557`):

```ts
if (!answerSet.has(m.label) && m.original && normalizeWs(m.original) !== normalizeWs(m.shown)) {
  corrections.push(`${m.label} 미끼 원형 교정: '${m.original}' → '${m.shown}'`);
  return { ...m, original: m.shown };
}
```

- **미끼 라벨만.** 정답 라벨의 원형 드리프트는 절대 보정되지 않는다(프로브 P4-15).
- 교정은 `corrections[]` 에 기록되고 qbank 하네스에서 `AUTOSNAP` **경고**로 남는다(`qgen-core.ts:323`).
- v1 경로의 `snapSpanNearAnchor` 위치 스냅(`parser.ts:476-530`)은 **v2 에서 실행되지 않는다.**

> **저작 규칙: corrections 는 0이어야 한다.** 경고가 뜬다는 것은 원형·포인트 섹션과 마커가 어긋났다는 뜻이고,
> 그 어긋남이 정답 라벨에서 일어나면 즉시 반려다.

### 3-9. ★ 장식(마크다운 강조) 전면 금지 — 실측 근거

정본 파서는 `decoration.ts` 를 import 하지 않는다. 프로브 P4-11 실측:

```md
**정답: (B)**
**고침: have long argued**
```
→ `answers = []`, `fix = ""` → 게이트가 「정답 라벨 0개 (설정 1개)」 + 「고침 누락」을 낸다.
**정답을 정확히 썼는데 "정답이 없다"는 거짓 원인이 보고된다.**

금지 목록(머리표·마커·메타·선지 줄 전체):
`**굵게**` · `*기울임*` · `` `백틱` `` · `# 헤딩` · `- 불릿` · `> 인용` · `| 표` · 들여쓰기 · 전각 콜론 `：`

### 3-10. 첫 매치 규칙 · 섹션 순서

- 1 마크다운 문서 = **정확히 1문항**(00-contract §3). 파서는 `^정답:` 등을 **첫 매치만** 취한다(`parser.ts:153`).
- 섹션 순서는 정규식 lookahead 로 **강제**된다:
  `밑줄지문:` → `원형·포인트:` → `정답:` → (`고침`) → `해설:` → (`오답:`)
  - R1 은 `원형·포인트:` 를 종료 앵커로 쓴다 → 순서가 바뀌면 밑줄지문이 통째로 잘못 잘린다.
  - R2 는 `정답:` 을 종료 앵커로 쓴다 → `정답:` 이 `원형·포인트:` 앞에 오면 메타가 빈다.
- `고침` 은 `matchAll`/단일 match 라 위치 자유지만, 관례상 `정답:` 바로 뒤에 둔다.

---

## 4. 게이트 체크리스트 — 반려 사유 문자열 전수

### 4-1. `gateMdQuestion` 어법 분기 (`parser.ts:281-347`) — **프로덕션과 동일 축**

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `밑줄 {n}개 ({markerCount}개 필요)` | `q.marks.length !== markerCount` — **early return, 나머지 검사 전부 스킵** | `parser.ts:284-285` |
| `{label} 원형 누락(원형·포인트 섹션 불일치)` | v2 에서 `!m.original` (메타 줄 부재/파싱 실패) | `parser.ts:290` |
| `{label} 포인트코드 누락` | v2 에서 `!m.code` | `parser.ts:291` |
| `지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 원형이 틀림` | 마커를 원형으로 되돌린 재구성본 ≠ 지문(normalizeWs 비교) | `parser.ts:300-302` |
| `{label} 원문표현이 지문에 축자로 없음(단어 경계 기준)` | **v1 경로 전용** — `countWordBoundaryMatches === 0` | `parser.ts:305-307` |
| `{label} '{original}' 위치 모호({n}회 등장) — 위치앵커 필요` | **v1 경로 전용** — 다중 등장 + 앵커 없음 | `parser.ts:309-310` |
| `{label} 위치앵커로 자리를 확정하지 못함` | **v1 경로 전용** — 앵커로 자리 확정 실패 | `parser.ts:311-312` |
| `정답 라벨 {n}개 (설정 {answerCount}개)` | `q.answers.length !== answerCount` | `parser.ts:326-327` |
| `변형 밑줄 {n}개 (정답 {answerCount}개만 변형)` | `shown !== original` 인 마크 수 ≠ answerCount | `parser.ts:328-329` |
| `정답 라벨({answerKey})과 변형 밑줄({changedKey}) 불일치` | 개수는 맞으나 라벨 집합이 다름 | `parser.ts:330-335` |
| `고침 누락` | `answerCount === 1` 이고 `!q.fix` | `parser.ts:336-337` |
| `고침({label}) 누락` | `answerCount >= 2` 이고 `!q.fixes[label]` | `parser.ts:338-341` |
| `해설 누락` | `!q.explanation` | `parser.ts:342` |
| `오답해설 {n}개 ({markerCount−answerCount}개 필요)` | `requireWrong` 이고 개수 불일치. K=N 이면 0개 요구 | `parser.ts:343-346` |

기본값: `markerCount = 5`, `answerCount = 1`, `requireWrong = true` (`parser.ts:263, 282-283`).
라우트는 `resolvedSettings` 실값을 전달한다(`route.ts:393-396`).

### 4-2. 라우트 전용 (교사 지정 포인트) — qbank 에서는 미발화

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `교사 지정 표현이 밑줄에 없음: '{text}'` | 지정 구간이 어느 마크의 `original`/`shown` 과도 포함관계가 아님 | `route.ts:339-341` |

qbank 하네스는 `teacherPoints: []` 로 고정이라(`qgen-core.ts:132`) 이 축은 발화하지 않는다.

### 4-3. 어댑터 실패 (하네스 `ADAPT` 차단) — `adapter.ts:244-262`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `밑줄 {n}개 (5~10개 필요)` | `marks.length < 5 \|\| > 10` | `adapter.ts:249-251` |
| `정답 누락` | `answers` 와 `answer` 모두 빈 값 | `adapter.ts:256` |
| `정답 라벨({label})이 밑줄에 없음` | 정답 라벨이 마크 라벨 집합에 없음 | `adapter.ts:258-262` |

> 게이트를 통과하면 이 셋은 원리상 발화하지 않는다(게이트가 상위 집합). 발화하면 게이트 우회 버그다.

### 4-4. 후처리 실패 (하네스 `POSTPROCESS` 차단) — `grammar-error.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `Missing markedExpressions field` | `markedExpressions` 부재/비배열 | `grammar-error.ts:43-45` |
| `Could not locate any marked expressions in the passage` | 모든 마커의 지문 위치 탐색 실패 | `grammar-error.ts:242-249` |

### 4-5. 유닛 차단 (qbank 하네스 — 문항 하나로는 보이지 않는다) — `qgen-core.ts`

| 코드 | 조건 | file:line |
|---|---|---|
| `UNSUPPORTED_LANE` | 레인 조회 실패. GRAMMAR_ERROR 는 `canon.ts` 가 채우므로 **미발화** | `qgen-core.ts:226` |
| `CONTAINER` | `<!-- ITEM n -->` 부재·번호 비연속·`point:` 누락·`settings:` JSON 파싱 실패·본문 공백 | `qgen-core.ts:68, 86, 93-95` |
| `ITEM_COUNT` | 문항 수 < minItems(기본 5) | `qgen-core.ts:240-246` |
| `GATE` | §4-1 사유 전부 | `qgen-core.ts:316` |
| `ADAPT` / `POSTPROCESS` | §4-3 / §4-4 | `qgen-core.ts:317-320` |
| `POINT_DUPLICATE` | 유닛 내 `point:` 값이 정규화 후 중복 | `qgen-core.ts:335-343` |
| `ANSWER_DUPLICATE` | `lane.diversityTargets` 중복 — **GRAMMAR_ERROR 는 현재 채널이 죽어 있다(부록 B-2)** | `qgen-core.ts:346-363` |

### 4-6. 품질 차단(`qualityBlocking`) — 프로덕션은 기록만, qbank 는 차단

`validateQuestionQuality` 는 라우트에서 **비차단**이다(`route.ts:1104-1123`, 00-contract §2). 하네스는 별도 축으로 차단한다
(`qgen-core.ts:194, 321`). GRAMMAR_ERROR 분기는 `dispatcher.ts:1162-2470` 으로 **26유형 중 가장 길다**. 형상 축 핵심:

| code | 조건 | file:line |
|---|---|---|
| `grammar-marker-count` | `markedExpressions.length !== grammarMarkerCount` | `dispatcher.ts:1173-1175` |
| `grammar-render-marker-count` | `passageWithMarkers` 의 `__(X) …__` 개수 불일치 | `dispatcher.ts:1176-1178` |
| `grammar-marker-too-dense` | **인접 마커 사이 단어가 2개 미만** | `dispatcher.ts:1179-1185`, `185-197` |
| `grammar-error-count` | `isError` 라벨 수 ≠ `grammarAnswerCount` | `dispatcher.ts:1191-1193` |
| `grammar-correct-answer-labels` | `correctAnswer(s)` 와 `isError` 라벨 집합 불일치 | `dispatcher.ts:1197-1203` |
| `grammar-decoy-point-diversity` | 마커 5개 이상 + 코드 4개 이상인데 **distinct 코드 < 3** | `dispatcher.ts:1207-1217` |
| `grammar-decoy-point-monotony` | 코드 5개 이상 중 **한 코드가 3회 이상** | `dispatcher.ts:1221-1234` |
| `grammar-killer-answer-point-repeated` | **KILLER 한정** — 정답 pointCode 가 미끼에도 등장 | `dispatcher.ts:1241-1259` |
| `grammar-killer-generic-answer-point` | **KILLER 한정** — 정답 pointCode 가 `a` 또는 `m` | `dispatcher.ts:1581-1591` |
| `grammar-error-not-mutated` | 마커를 벗긴 지문 == 원문 / `errorExpression === expression` | `dispatcher.ts:1359-1371, 1381-1383` |
| `grammar-source-expression-not-backed` | 정답의 `expression` 이 지문에 없음 | `dispatcher.ts:1384-1390` |
| `grammar-correction-not-source-backed` | `correction` 이 지문에 없음 | `dispatcher.ts:1391-1397` |
| `grammar-error-pos-change` | 오형이 품사를 넘어감(형/동 → 명) | `dispatcher.ts:1398-1404` |
| `grammar-tense-only-error` | 시제 단독 토글(수일치 제외) | `dispatcher.ts:1408-1414` |
| `grammar-correction-form-exposed` | 정답의 교정형이 지문 다른 곳에 축자로 남아 있음 | `dispatcher.ts:1342-1354` |
| `grammar-disputed-usage-target` | `A and B ... each + 단수동사` 자리에 밑줄 | `dispatcher.ts:1260-1276` |
| `grammar-marker-adjacent-duplicate` | 마커가 인접 단어를 삼켜 중복 렌더 | `dispatcher.ts:1280-1289` |
| `grammar-surrounding-missing-marker` | `surroundingText` 에 자기 표현이 없음 | `dispatcher.ts:1295-1304` |
| `grammar-killer-overdrilled-answer` | **KILLER 한정** — `that↔what`, 형↔부(-ly), `one/each of` 수일치, 인접 수일치 | `dispatcher.ts:1909-1918` |
| `grammar-killer-thin-answer` | **KILLER 한정** — 장거리 구조 없는 로컬 1토큰 변경 | `dispatcher.ts:1899-1905` |
| `grammar-obvious-*` (20+종) | 한눈 비문 패턴(double -ing, 인접 수일치, `learn to`→`-ing` 등) | `dispatcher.ts:1465-2135` |
| `grammar-explanation-*` (10+종) | 해설 메타 누설·용어 오류·오라벨·정답 범위 누설 | `dispatcher.ts:2290-2470` |
| `mid-word-marker` | `passageWithMarkers` 의 마커가 단어 내부에 박힘 | `validators/grammar/marked.ts:26-30` |

---

## 5. adapter 산출 필드 (`adaptMdGrammarToAiQuestion`, `adapter.ts:244-351`)

```jsonc
{
  "direction": "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",     // K≥2 면 "…틀린 것을 모두 고르시오." (개수 미노출)
  "errorDesign": "md 원큐 경량 경로 — 설계 메모는 해설로 갈음합니다.", // 후처리가 저장 전 삭제
  "markedExpressions": [                                          // ★ 이 유형의 심장
    {
      "label": "(A)",              // (A)~(J) — 저장 축
      "expression": "who study",   // = 원형·포인트의 original (지문 축자)
      "isError": false,            // ★ 정답의 진실원. correctAnswer 는 파생값
      "errorExpression": "who study", // 학생이 보는 표면. 미끼는 expression 과 동일(전 마커 필수)
      "surroundingText": "…",      // contextAround(pad 45) — 위치 탐색 창
      "pointCode": "b"             // POINT_NAME 에 없으면 "a" 로 강제
      // isError 인 경우에만 추가: "correction": "<고침>"
    }
  ],
  "correctAnswers": ["(B)"],        // answers 배열 그대로
  "correctAnswer": "(B)",           // answers.join(", ")  → K≥2 면 "(B), (E)"
  "options": [                      // 파생 뷰(학생 표면)
    { "label": "①", "text": "who study" }  // label = circledForMarkIndex(i) ①~⑩, text = shown
  ],
  "wrongOptionExplanations": [      // 배열 — 후처리가 Record 로 정규화
    { "label": "(A)", "expression": "who study", "pointCode": "b", "explanation": "…" }
  ],
  "explanation": "…",
  "keyPoints": [],                  // ★ 항상 빈 배열 — 합성 금지(포인트 오태깅 사고, adapter.ts:319-323)
  "tags": [],
  "difficulty": "BASIC"
}
```

### 이 유형에만 있는 필드

| 필드 | 의미 | 근거 |
|---|---|---|
| **`markedExpressions[].isError`** | **정답의 진실원.** 후처리가 이것으로 `correctAnswer`·`correctAnswers`·발문을 재생성한다 | `adapter.ts:241-242`, `grammar-error.ts:154-166` |
| `markedExpressions[].errorExpression` | 학생이 지문에서 실제로 보는 표면. **전 마커 필수** — 미끼는 `expression` 과 동일 | `adapter.ts:297-298` |
| `markedExpressions[].correction` | `isError` 마커에만. `fixes[label] → fix → original` 순 폴백 | `adapter.ts:299-301` |
| `markedExpressions[].pointCode` | a~m. 후처리가 표면과 대조해 부적합하면 재추론한다 | `adapter.ts:303`, `grammar-error.ts:638-680` |
| `correctAnswers` (배열) | K≥2 저장 축. `correctAnswer` 는 `", "` join 문자열 | `adapter.ts:335-337` |

### 후처리가 덧붙이는 것 (`processGrammarError`, `grammar-error.ts:35-277`)

| 키 | 생성 방식 | 근거 |
|---|---|---|
| **`passageWithMarkers`** | 지문의 각 마커 자리를 `__(A) 표시형__` 으로 치환한 전문 | `grammar-error.ts:233, 251` |
| `direction` | K≥2 면 **강제** `"다음 글의 밑줄 친 부분 중, 어법상 틀린 것을 모두 고르시오."`, K=1 이면 "모두/전부/N개" 포함 시 단일형으로 교체 | `grammar-error.ts:516-525` |
| `correctAnswer` / `correctAnswers` | `isError` 라벨에서 **재생성**(모델 값 무시) | `grammar-error.ts:154-165` |
| `wrongOptionExplanations` | 배열 → `Record<"(A)", "설명">` 변환 | `grammar-error.ts:603-636` |
| `options[].text` | `getMarkedSurfaceExpression` = isError면 `errorExpression`, 아니면 `expression` | `grammar-error.ts:495-513, 527-532` |
| `explanation` | 오형 표면을 정답형보다 먼저 언급하지 않으면 **한국어 문장이 앞에 자동 삽입**된다 | `grammar-error.ts:542-570` |
| — | `errorDesign` **삭제** | `grammar-error.ts:253-258` |

> 최종 `structuredData` = 후처리 산출 + `_typeId`/`_typeLabel`/`_generationPlan`/`difficulty` + tags
> (`route.ts:1093-1099`, `question-generation-persistence.ts:213`). `type` 은 `options` 가 배열이므로 `MULTIPLE_CHOICE`.

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 | file:line |
|---|---|---|---|---|---|
| `markerCount` (alias `errorCount`) | number | **5** | **5~10** (반올림 후 clamp) | 마커 개수 = 라벨 `(A)`~`(J)` 상한. 게이트 「밑줄 N개」 기준 | `grammar.ts:7-11, 33-39` |
| `answerCount` (alias `correctAnswerCount`) | number | **1** | **1 ~ markerCount** (동적 상한) | 1이면 `고침:`·단일 발문·오답 N−1개 / ≥2면 `정답: (B), (E)`·`고침(X):` K줄·「모두 고르시오」 | `grammar.ts:13-17, 41-47` |
| `pointFocus` | boolean | `false` | — | 프롬프트에 고빈출 톱셋 가이드 주입(`b d k c g f e h`). **파싱·게이트에는 영향 없음** | `dispatchers.ts:107`, `grammar-point-catalog.ts:255, 495-503` |
| `difficulty` | `BASIC\|INTERMEDIATE\|KILLER` | `INTERMEDIATE` | — | 프롬프트 서사만 바뀐다. **게이트는 무관**. 단 KILLER 는 품질 검증기의 추가 게이트 5종이 켜진다 | `route.ts:605-608`, `dispatcher.ts:1241, 1582, 1899, 1909, 1919` |
| `stemLanguage` / `optionLanguage` | `ko`/`en` | `ko`/`ko` | — | fast 레인 전용. **md 정본 경로는 소비하지 않는다** | `language.ts:13` |

### 노브 읽기 규칙 (`shared.ts:88-102`)

`rawSettings.markerCount` (flat) **우선** → `rawSettings.GRAMMAR_ERROR.markerCount` (nested) 폴백.
비수치·`NaN` 은 `Math.min(defaultValue, max)` 로 낙하(`shared.ts:72`).

### 프롬프트 분기 (`prompts.ts:410-421`)

```ts
const markerCount = Math.min(10, Math.max(5, Math.round(opts?.markerCount ?? 5)));
const answerCount = Math.min(markerCount, Math.max(1, Math.round(opts?.answerCount ?? 1)));
if (markerCount !== 5 || answerCount !== 1) return buildMdGrammarVariantPrompt(...);
```
**5·1 은 기존 프롬프트와 바이트 동일**(프로브 P6-7). 그 외는 변형 빌더.

### 적격성 (`route.ts:490-495`)

```ts
subType === "GRAMMAR_ERROR" && markerCount >= 5 && markerCount <= 10 &&
answerCount >= 1 && answerCount <= markerCount
```
범위 밖 값은 클램프로 흡수되므로 실질적으로 항상 적격이다. KO(국어) 지문은 md 레인 비대상(`route.ts:519-524`).
`maxTokens` 는 이 유형만 **20,000** 으로 특별 취급된다(`dispatchers.ts:374-376`).

---

## 7. 함정 (코드 근거 있는 것만)

### F1. `**정답:**` — 정답이 증발하고 **거짓 원인**이 보고된다 ★최우선
정본 파서는 `decoration.ts` 를 안 쓴다. `answers=[]`, `fix=""` → 「정답 라벨 0개 (설정 1개)」+「고침 누락」.
**정답을 제대로 썼는데 "없다"고 반려된다.** (`parser.ts:153`, 프로브 P4-11 / 00-contract §8)

### F2. 미끼 자리를 오형으로 만들면 「지문 재구성 불일치」로 위장된다 ★
미끼의 `shown ≠ original` 이면 오토스냅이 `original := shown` 으로 덮어쓴다(`parser.ts:547-550`).
그 결과 재구성본이 원문과 달라져 **원인과 전혀 다른 사유**가 나온다.
- 오토스냅 **전** 게이트: 「변형 밑줄 2개 (정답 1개만 변형)」
- 실제 파이프라인: 「지문 재구성 불일치 …」 **단독** (프로브 P4-5 / P4-5b)

같은 이유로 「정답 라벨(…)과 변형 밑줄(…) 불일치」는 v2 실경로에서 **사실상 발화하지 않는다** — 대신
「변형 밑줄 0개」+「지문 재구성 불일치」로 나타난다(프로브 P4-6b). **사유 문자열로 원인을 역추적하지 마라.**

### F3. 「밑줄 N개」는 early return — 다른 사유를 전부 숨긴다
`if (q.marks.length !== markerCount) return [...]` (`parser.ts:284-285`).
마커를 하나 빠뜨리면 정답·고침·해설 문제가 있어도 **보이지 않는다.** 재저작 시 개수부터 맞춰라.

### F4. `원형·포인트:` 헤더 한 글자 드리프트 = 전 마크 소실
`원형/포인트:` 로 쓰면 R1 의 종료 앵커(`^원형·포인트:|^원형:`)가 안 걸려 밑줄지문 캡처가 실패하고 `marks = 0`
→ 「밑줄 0개 (5개 필요)」 (프로브 P4-17). **가운뎃점 `·` 는 U+00B7 이 아니라 U+318D 계열 드리프트에 취약하다 —
픽스처에서 복사해 써라.**

### F5. `정답: (B) (E)` — 쉼표 없이 나열하면 두 번째부터 버려진다
`leadingRun` 정규식이 `\s*,\s*` 를 요구한다(`parser.ts:158`). 구분자는 **`, `** 고정.
`정답: 밑줄 (C)` 처럼 라벨 앞에 글자가 오면 `leadingRun=""` → 정답 0개.

### F6. K≥2 인데 `고침:` 한 줄
구형 단일 `고침:` 은 `fixes` 가 비었을 때 **첫 정답에만** 귀속된다(`parser.ts:168-170`).
→ 「고침((E)) 누락」. K≥2 는 반드시 라벨식 K줄.

### F7. 마커 밖 1글자
관사·복수형·쉼표 하나가 달라도 「지문 재구성 불일치」. `normalizeWs` 가 흡수하는 것은 곱슬따옴표·dash·`…`·공백뿐
(`parser.ts:67-74`). **지문은 반드시 원본에서 복사해 마커만 삽입하라 — 손으로 옮겨 적지 마라.**

### F8. 마커를 너무 붙이면 품질 게이트가 문다
인접 마커 사이 단어가 **2개 미만**이면 `grammar-marker-too-dense`(`dispatcher.ts:185-197`).
markerCount 10 을 쓰려면 지문에 최소 10개의 서로 떨어진 판정 자리가 있어야 한다.

### F9. 포인트 코드 편중
- distinct 코드 < 3 → `grammar-decoy-point-diversity` (`dispatcher.ts:1207-1217`)
- 한 코드 3회 이상 → `grammar-decoy-point-monotony` (`dispatcher.ts:1221-1234`)
→ **코드당 최대 2회, distinct 3종 이상.** 헌법 §6 운용규칙 1과 동일.

### F10. KILLER 전용 지뢰 5종
| 지뢰 | 금지 내용 | file:line |
|---|---|---|
| 정답 코드 `a`/`m` 금지 | `grammar-killer-generic-answer-point` | `dispatcher.ts:1581-1591` |
| 정답 코드가 미끼에 재등장 금지 | `grammar-killer-answer-point-repeated` | `dispatcher.ts:1241-1259` |
| `that↔what`, 형↔부(-ly), `one/each of` 수일치, 인접 수일치 금지 | `grammar-killer-overdrilled-answer` | `dispatcher.ts:1909-1918` |
| 장거리 구조 없는 로컬 1토큰 변경 금지 | `grammar-killer-thin-answer` | `dispatcher.ts:1899-1905` |
| 단순 조동사 탈락(`has been done`→`done`) 금지 | `grammar-killer-thin-missing-aux` | `dispatcher.ts:1886-1898` |

### F11. 시제 단독 토글·품사 이동 오형
- `outpaces ↔ outpaced` 류 시제 단독 변경 → `grammar-tense-only-error` (`dispatcher.ts:1408-1414`)
- 형/동 → 명 품사 이동 → `grammar-error-pos-change` (`dispatcher.ts:1398-1404`)
→ **"한 단어 교체로 정문이 되는 구조적 오류"**(헌법 §6-3)만 쓴다.

### F12. 정답의 교정형이 지문 다른 곳에 그대로 남아 있으면 정답이 누출된다
`grammar-correction-form-exposed` (`dispatcher.ts:1342-1354`). 표적을 고를 때 그 원문 형태가
지문 다른 자리에 반복되지 않는지 확인하라.

### F13. 해설이 정답형을 오형보다 먼저 말하면 후처리가 문장을 끼워 넣는다
`normalizeGrammarExplanationSurfaceOrder` 가 `(B) "has long argued"는 어법상 틀린 표현이며 "have long argued"로
고쳐야 한다.` 를 **해설 앞에 자동 삽입**한다(`grammar-error.ts:542-570`). 해라체라 합니다체 해설과 어투가 깨진다.
→ **해설은 오형 표면을 먼저 따옴표로 인용하고 그 다음 정답형을 제시하라.**

### F14. 라벨을 지문 등장 순서와 다르게 붙이면 후처리가 라벨과 해설을 전부 재매핑한다
`grammar-error.ts:122-145, 190-197`. 결과가 틀리지는 않지만 저자가 의도한 라벨-해설 대응이 사라진다.
`(A)` 부터 지문 순서대로 붙여라.

### F15. 해설 언어 규약
한국어 합니다체만. 영어 인용은 반드시 따옴표 안. 비한글 CJK 금지, "영단어+한국어 어미" 짜깁기 금지
(헌법 §5 언어규약, `validators/explanation-foreign-text.ts`). `grammar-explanation-meta-leak`(생성 과정 서술)·
`grammar-explanation-answer-range-leak`(정답 범위 누설)도 별도 게이트다(`dispatcher.ts:2433, 2447`).

### F16. `오답:` 을 K=N 인데 쓰면 반려
wrongNeeded = 0 인데 오답 줄이 있으면 「오답해설 N개 (0개 필요)」(`parser.ts:343-346`).

### F17. 한 유닛에 여러 문항을 한 파일에 붙이되 컨테이너 없이 붙이면 2번부터 조용히 사라진다
파서는 첫 매치만 취한다(00-contract §3). 반드시 `<!-- ITEM n ... -->` 로 나눠라(`qgen-core.ts:57`).

---

## 8. 출제 포인트 다각화 축 — 한 지문에서 5~8문항 만들기

### 8-0. 이 유형의 구조적 이점과 제약 (설계 전에 먼저 계산하라)

**이점**: 어법은 `TYPE_CAP` 이 없는 유형이다(`plan.mjs:86-95`). 제목·주제처럼 "하나의 논지"로 수렴하지 않고
**지문의 서로 다른 위치를 겨냥**하므로 8개 이상도 정직하게 나온다. 티어별 목표는 S=8 / A=7 / B=6 / C·D=5
(`plan.mjs:67-71`).

**제약 3가지**:
1. 헌법 §6-6: **유닛 내 N문항은 오류 지점 G코드가 전부 달라야 한다.** → 정답 코드 5~8종이 필요하다.
2. `grammar-decoy-point-diversity`/`monotony`: 문항마다 distinct 코드 3종 이상, 코드당 최대 2회.
3. 코퍼스 하한 80단어·4문장(`unit-plan.json` calibration.어법). 5문항×5마커 = 연 25개 마킹 자리를 뽑아야 하므로,
   **지문에서 어법 판정 가능한 자리를 최소 8~12개 먼저 목록화**하고 시작하라.

### 8-1. 노브로 달라지는 축 (코드 근거)

| 축 | 설정 | 범위 | 효과 | 근거 |
|---|---|---|---|---|
| **밑줄 개수** | `markerCount` | 5~10 | 5=수능 표준 / 7~8=변별 강화(오답 6~7개 해설 필요) / 10=지문 밀도 한계 | `grammar.ts:7-11` |
| **정답 개수** | `answerCount` | 1~N | 1=수능형 / 2~3=「모두 고르시오」 내신형 / K=N=전수 판정형(오답 섹션 소멸) | `grammar.ts:13-17`, `adapter.ts:328-333` |
| **난이도** | `difficulty` | 3단 | KILLER 는 정답 코드 `a`/`m` 금지 + 과훈련 4종 금지 + 장거리 구조 필수 | `dispatcher.ts:1581, 1909, 1899` |
| **포인트 집중** | `pointFocus` | bool | 정답 코드를 `b d k c g f e h` 톱셋으로 좁힘 (프롬프트 축, 게이트 무관) | `grammar-point-catalog.ts:255` |

> **노브 조합만으로도 형태가 다른 문항 4종**이 나온다: `5·1` / `7·2` / `8·1` / `5·5`.
> 다만 이것은 **껍데기의 다양성**이다. 아래 8-2 가 본체다.

### 8-2. 설계로 달라지는 축 (교육적 판단 — 여기가 승부처)

#### 축 A — 정답 G코드 (최우선, 헌법 §6-6 강제)
문항마다 **다른 문법 판단**을 요구한다. 유닛 5문항이면 §6 최빈출 7 중 5개:

| 순위 | 코드 | 포인트 | 이 지문에 쓸 수 있는가 판정 기준 |
|---|---|---|---|
| 1 | a | 정동사vs준동사 | 등위절·세미콜론·접속부사 뒤 서술어 자리가 있는가 (KILLER 금지) |
| 2 | b | 관계사 | 절의 완전/불완전이 갈리는 자리, 추상 선행사+where, `전치사+which` |
| 3 | c | 분사 | by 행위자구·의미상 주어가 있는 후치수식/삽입 분사구 |
| 4 | d | 수일치 | 주어와 동사 사이에 관계절·삽입구·of구가 끼어 있는가 |
| 5 | e | 능·수동태 | 주어-동사 의미관계가 명확히 뒤집히는 자리 |
| 6 | f | 형용사·부사 | 동사 수식 자리 / 계사 보어 자리 (KILLER 는 -ly 맞교환 금지) |
| 7 | i | 병렬 | and/or/but 전후 형태가 실제로 대응하는가 |
| 보조 | k | 부정사·동명사 | `tend/learn/afford` 류 보어 선택 동사가 있는가 |
| 보조 | g | 대명사 | 지시 대상의 수·격이 명확한가 |
| 보조 | h | 목적격보어 | 사역·지각동사가 있는가 |

`j`(가정법)·`m`(비교)·`l`(전치사·접속사)은 **정답 금지, 미끼 전용**(`grammar-point-catalog.ts:506`).

#### 축 B — 정답 자리의 지문 위치 (= 정답 라벨 위치)
셔플이 없으므로(`question-diversity.ts:508-522`) 정답 라벨은 **오형을 심는 문장**이 결정한다.
5문항의 정답 라벨이 `(A)…(E)` 에 고루 퍼지도록 표적 배분표에서 먼저 배치하라.
동시에 **논지 위치**(도입 통념 / 전환점 / 기제 설명 / 사례 / 결론)도 분산한다.

#### 축 C — 판정 단서까지의 거리 (난이도의 실체)
| 거리 | 예 | 난이도 |
|---|---|---|
| 같은 구 안 | `by 행위자구` 바로 뒤 분사 | BASIC |
| 같은 절, 수식어 1개 건너 | 관계절에 가린 주어와 본동사 | INTERMEDIATE |
| 절 경계 넘어 / 병렬 시작점 추적 | and 앞 절의 동사 수 세기, 6단어 떨어진 행위자구 | KILLER |

이 축이 §4 난이도 배분(5문항: BASIC 1 / INTERMEDIATE 2 / KILLER 2)의 조작적 정의다.

#### 축 D — 미끼 팔레트 구성 (문항마다 다른 오인 축 4종)
헌법 §6-4: 미끼 각각의 **"틀려 보이는 이유"** 가 서로 달라야 한다. 오인 축 카탈로그:

1. 삽입구로 멀어진 수일치 착각 2. 능·수동 태 착각 3. 관계사·접속사 혼동 4. 분사 형태 착각
5. 규범 혼동(단수 they 류) 6. 형/부 착시(-ly 형 형용사) 7. p.p.와 과거형이 같은 동사
8. 준사역 뒤 원형 9. 병렬 범위 오독 10. 동격 that 관성

**문항마다 이 10개 중 다른 4개를 뽑는다.** 같은 미끼 세트를 재사용하면 라벨만 바뀐 사본이다.
2-3 실물에서 미끼 팔레트는 `{b,c,k,e} / {d,c,e,k} / {c,d,b,b} / {b,d,a,k} / {b,d,e,b}` 로 전부 다르다.

#### 축 E — 오형 생성 방향 (같은 코드도 방향이 다르면 다른 판단)
`GRAMMAR_MINIMAL_PAIRS` 가 코드별 검증된 변형 방향을 갖고 있다(`grammar-point-catalog.ts:465-475`).
같은 `d`(수일치)라도 `have→has`(주어 원거리) / `carry→carries`(관계절 내 선행사) / `supply→supplies`(삽입구 뒤)는
**추적해야 할 단서가 다르다.** 코드 재사용이 불가피할 때는 방향을 반드시 바꿔라.

#### 축 F — 마커 자리 집합 자체
같은 정답이라도 미끼 5자리 조합이 다르면 학생이 검토하는 문장이 달라진다.
2-3 의 ITEM2 와 ITEM4 는 마커 자리가 겹치지 않는다 — 학생은 서로 다른 문장 4개씩을 읽게 된다.

#### 축 G — 형태 변주 (노브, 유닛의 마지막 1~2문항에 배치)
5문항을 5·1 로 채운 뒤 6~8번째를 `7·2`(모두 고르기) 또는 `5·5`(전수 판정)로 만들면
**인지 작업 자체가 바뀐다** — "하나 찾기"에서 "전부 검증하기"로. 8문항 유닛(S/A 티어)에서 특히 유효하다.

### 8-3. 유닛 설계 절차 (권장)

1. **자리 목록화** — 지문을 문장번호(S1…)로 쪼개고 어법 판정 가능한 자리를 전부 뽑는다(목표 10~14개).
   각 자리에 G코드와 "판정 단서까지의 거리"를 붙인다.
2. **표적 배분표 작성** — 문항 수만큼 행을 만들고 (난이도 · 정답 G코드 · 정답 자리 · 오형 방향 · 미끼 팔레트 ·
   예상 정답 라벨)을 **문항을 쓰기 전에** 채운다. 코드 중복·라벨 편중이 여기서 드러난다.
3. **마커 배치 검산** — 문항마다 인접 마커 사이 단어 ≥2, distinct 코드 ≥3, 코드당 ≤2, KILLER면 정답 코드가
   미끼에 없는지.
4. **지문 복사** — 원본을 그대로 복사해 마커만 삽입한다. 손으로 옮겨 적지 않는다.
5. **원형·포인트 작성** — 미끼는 마커 안 값과 **바이트 동일**, 정답만 원문 형태.
6. **해설 작성** — 오형 표면 먼저 인용 → 정답형 → 밑줄 밖 어느 단서로 판정하는지. 오답해설은 라벨마다
   "학생이 헷갈리는 지점 + 왜 옳은지".
7. **프로브 실행** — `qbank/work/_probe-GRAMMAR_ERROR.ts` 를 견본으로 gate/adapt/postprocess/quality 를 돌린다.

---

## 부록 A. 검증 기록

`qbank/work/_probe-GRAMMAR_ERROR.ts` — `./node_modules/.bin/tsx qbank/work/_probe-GRAMMAR_ERROR.ts`

```
78/78 통과
```

| 블록 | 내용 | 결과 |
|---|---|---|
| P1 | 리포 픽스처 3종(5·1 / 7·2 / 5·5) gate 0 | 3/3 |
| P2 | §2-3 골격 5문항 × (gate 0 · 오토스냅 0 · adapt · postprocess · quality error 0) | 25/25 |
| P2-형상 | 발문·markedExpressions·options·correctAnswers·passageWithMarkers·wrongOptionExplanations 형상 | 7/7 |
| P3 | qbank 컨테이너 경유 `gateUnit` blocking 0 · qualityBlocking 0 · ok / 7·2 컨테이너 blocking 0 | 6/6 |
| P4 | 반려 사유 문자열 19종 재현(장식·재구성·개수·라벨·고침·해설·오답·오토스냅 상호작용 포함) | 21/21 |
| P5 | canon.ts 결함 2건 실증 | 3/3 |
| P6 | 노브 클램프·프롬프트 분기·라벨 축 | 13/13 |

---

## 부록 B. ★ `qbank/harness/canon.ts` 결함 2건 — **수리 필요**

정본 2종 래퍼가 프로덕션 라우트와 **키 이름이 어긋난다.** 프로브가 실증했다(P5-a/b/c).

### B-1. `qualityArgs` 키 오배선 → 비표준 형상이 항상 5·1 로 검증된다

```ts
// qbank/harness/canon.ts:175-179 (현재)
qualityArgs(ctx) {
  const c = readCounts(ctx.resolved);
  if (subType === "BLANK_INFERENCE") return { blankCount: c.blankCount };
  return { markerCount: c.markerCount, answerCount: c.answerCount };   // ← 틀림
}
```

`validateQuestionQuality` 가 받는 키는 `grammarMarkerCount` / `grammarAnswerCount` 다
(`question-quality/dispatcher.ts:41-67, 760-776`). 현재 키는 무시되어 기본값 5·1 로 검증되고,
7·2 유닛이 `grammar-marker-count`·`grammar-error-count` **거짓 오류**를 맞는다(프로브 P5-b 실증).
BLANK_INFERENCE 도 동일 — 올바른 키는 `blankInferenceBlankCount` (`dispatcher.ts:65`).

**수리 (라우트 `route.ts:1113-1122` 와 동일하게):**
```ts
qualityArgs(ctx) {
  const c = readCounts(ctx.resolved);
  if (subType === "GRAMMAR_ERROR")
    return { grammarMarkerCount: c.markerCount, grammarAnswerCount: c.answerCount };
  return c.blankCount >= 2
    ? { blankInferenceBlankCount: c.blankCount, blankInferenceParaphraseAnswer: c.blankParaphrase }
    : {};
}
```

### B-2. `diversityTargets` 형상 불일치 → `ANSWER_DUPLICATE` 채널이 죽어 있다

```ts
// qbank/harness/canon.ts:62-74 (현재)
const marks = structuredData.grammarMarks ?? structuredData.marks;   // ← 그런 키 없음
const fixes = structuredData.fixes;                                  // ← 그런 키 없음
if (typeof structuredData.correctFix === "string") ...               // ← 그런 키 없음
... .filter((m) => m && m.isAnswer)                                  // ← 플래그명은 isError
```

후처리 산출(`structuredData`)이 실제로 갖는 키는 `markedExpressions[]{label, expression, isError, correction}`
(`grammar-error.ts:260-276`). 따라서 GRAMMAR_ERROR 의 `diversityTargets` 는 **항상 빈 배열**이고,
`qgen-core.ts:346-363` 의 `ANSWER_DUPLICATE` 검사가 발화하지 않는다(프로브 P5-a 실증).
= **같은 자리를 정답으로 쓴 문항 2개가 조용히 통과한다.** 헌법 §7 결정형 강제가 이 유형에서만 무력화된 상태.

**수리 (라우트 `route.ts:685-696` 와 동일하게):**
```ts
if (subType === "GRAMMAR_ERROR") {
  const mes = structuredData.markedExpressions;
  if (!Array.isArray(mes)) return [];
  return (mes as Record<string, unknown>[])
    .filter((m) => m && m.isError === true)
    .map((m) => String(m.expression ?? ""));
}
```

> 수리 전까지 **정답 표적 중복은 저작 에이전트가 표적 배분표(§8-3 절차 2)로 직접 방지해야 한다.**
> 기계가 잡아 주지 않는다.
