# 빈칸 추론 (BLANK_INFERENCE)

> **분류** 선택형(①~⑤ 5지선다) · **지문변형** ○ (표적 구간 → 빈칸 치환. **단, 저자는 지문을 md 에 옮겨 적지 않는다**) · **정답 머리표** `정답:` (①~⑤) · **최소 지문 길이** 코드 강제 없음(`feasibility.ts:27-62` 은 SENTENCE_ORDER 만 게이트) / **코퍼스 자가보정 하한 97단어·4문장** (`qbank/spec/unit-plan.json` calibration.빈칸추론 = `{n:987, minWords:97, minSentences:4}`)
>
> 필수 섹션 5개: `빈칸원문:` · `①`~`⑤` 선지 5줄 · `정답:` · `해설:` · `오답:`
> 다중 빈칸(2~3)은 `빈칸원문:` 대신 `빈칸원문(A):`·`빈칸원문(B):`[·`빈칸원문(C):`] + 조합 선지(` …… ` 연결)
> 진실원 파일: `src/lib/md-qgen/parser.ts` (`parseMdBlank` · `parseMdMultiBlank` · `gateMdQuestion` blank 분기 · `gateMdMultiBlank`) · `src/lib/md-qgen/adapter.ts` (`adaptMdBlankToAiQuestion` · `adaptMdMultiBlankToAiQuestion`)
> **이 유형은 정본(canon)이다** — `lane-registry` 에 없고 `md-stream/route.ts` 가 직접 분기한다(`route.ts:355-383, 1055-1076`). 오프라인 하네스는 `qbank/harness/canon.ts` 래퍼가 담당한다.
> 검증: `qbank/work/_probe-BLANK_INFERENCE.ts` — **75/75 통과** (verified=true)
> 계획 물량: 유닛 **4,159** · 목표 문항 **22,858** · 배제 지문 315 (`qbank/spec/unit-plan.json` byType/skippedByType.BLANK_INFERENCE)

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문의 한 구간(또는 2~3구간)이 통째로 지워지고, 학생은 **지워진 자리에 원래 무엇이 있었는지를 글 전체의 논리로 복원**한다.

핵심은 "빈칸 문장 읽기"가 아니라 **"빈칸 밖 문장들이 만드는 논리 축에서 그 자리의 값을 연역하기"** 다.
빈칸 문장 하나만 읽고 풀리면 그 문항은 미달이다(`prompts.ts:49, 54`).
정답은 원문 표현의 **재진술**이지 복사가 아니며(모드에 따라 다름 — §6), 오답 넷은 지문에 실재하는 소재·어휘로만 만든다(`prompts.ts:79`).

### 형제 유형과의 결정적 차이

| 축 | **BLANK_INFERENCE** | SUMMARY_COMPLETE_MC | FILL_BLANK_KEY | GRAMMAR_ERROR |
|---|---|---|---|---|
| 경로 | **정본** — 라우트 직접 분기 (`route.ts:355-383`) | 레인 | 레인 | **정본** |
| 빈칸이 뚫리는 곳 | **지문 본문** | 별도로 작성한 요약문 | 지문 본문 | — |
| 저자가 지문을 재출력하는가 | **아니오** — `빈칸원문:` 한 줄만 축자 인용 | 아니오 | 아니오 | **예** (`밑줄지문:` 전문 복사) |
| 빈칸 개수 노브 | **1~3** (`shared.ts:32-36`) | 1~2 | — | — |
| 선지 | ①~⑤ 5개 고정 | ①~⑤ | 없음(서술형) | ①~⑩ |
| 정답의 진실원 | `정답:` 줄의 ①~⑤ | 〃 | `모범답안:` | `markedExpressions[].isError` |
| 선지 셔플 | **있음** (`question-diversity.ts:508-522`) | 있음 | 해당 없음 | 없음 |
| 정답 표현 변형 노브 | **3모드**(PARAPHRASE/SOURCE_EXACT/DOUBLE_NEGATIVE) | paraphrase 축만 | — | — |

### ★ 이 유형이 어법과 근본적으로 다른 점 — "지문을 옮겨 적지 않는다"

어법은 지문 전문을 복사해 마커를 박고 **재구성 대조 게이트**를 통과해야 한다. 빈칸은 다르다.
`빈칸원문:` **한 줄만** 지문 축자이면 되고, 빈칸 치환은 후처리(`processBlankInference`, `blank-inference.ts:90`)가
`passage.slice` 로 기계 수행한다. 즉 **지문 훼손 사고의 표면적이 한 줄로 줄어든다.**

대신 그 한 줄이 전부다 — 축자에서 벗어나면 오토스냅 사거리 밖에서 즉사한다(§3-5).

---

## 2. 마크다운 골격

### 2-1. 복붙 가능한 실물 골격 — 단일 빈칸 (blankCount = 1, 기본)

````md
<!-- ITEM <n>
difficulty: <BASIC|INTERMEDIATE|KILLER>
point: <이 문항이 겨냥하는 출제 포인트 한 줄 — 유닛 내 전부 달라야 한다>
craft: <설계 메모 — 게이트 대상 아님>
settings: {"paraphraseAnswer": true}
-->
빈칸원문: <지문에서 빈칸으로 뚫을 구 — 지문 축자, 한 줄, 한 글자도 변경 금지>
① <선지 1>
② <선지 2>
③ <선지 3>
④ <선지 4>
⑤ <선지 5>
정답: <①~⑤ 중 하나>
해설: <한국어 합니다체. 근거 문장 2곳을 인용해 잇고 정답 도출까지. 줄머리에 원형숫자를 쓰지 마라>
오답:
<정답이 아닌 라벨1> <기제 이름 + 왜 매력적이고 왜 탈락인지 1문장>
<정답이 아닌 라벨2> <…>
<정답이 아닌 라벨3> <…>
<정답이 아닌 라벨4> <…>
````

> `<!-- ITEM n ... -->` 블록은 **qbank 컨테이너 규약**이다(`qgen-core.ts:30-57`). md-qgen 계약 대상은 그 아래 본문뿐이다.
> `settings:` 는 유형 세부 노브를 문항 단위로 덮어쓴다 — **단 `doubleNegative` 만은 이 경로로 켜지지 않는다**(§6·§7 F10).

### 2-2. 복붙 가능한 실물 골격 — 다중 빈칸 (blankCount = 2~3)

````md
<!-- ITEM <n>
difficulty: <BASIC|INTERMEDIATE|KILLER>
point: <출제 포인트>
craft: <설계 메모>
-->
빈칸원문(A): <(A) 자리 원문 구 — 지문 축자>
빈칸원문(B): <(B) 자리 원문 구 — 지문 축자, (A)와 다른 문장>
① <A값> …… <B값>
② <A값> …… <B값>
③ <A값> …… <B값>
④ <A값> …… <B값>
⑤ <A값> …… <B값>
정답: <①~⑤ 중 하나>
해설: <각 빈칸의 근거 문장을 연결해 정답 조합을 도출. 합니다체>
오답:
<라벨1> <어느 빈칸의 어떤 값이 왜 어긋나는지 1문장>
<라벨2> <…>
<라벨3> <…>
<라벨4> <…>
````

- 라벨은 **`(A)`→`(B)`→`(C)` 지문 등장 순서 고정**. 역전하면 반려(§4).
- 값 구분자는 **` …… `**(공백 + `…`(U+2026) 2개 + 공백) **리터럴 고정**. 다른 구분자를 쓰면 전 선지가 반려된다(§7 F11).
- 빈칸 3개면 `빈칸원문(C):` 줄과 각 선지의 3번째 값을 추가한다.

### 2-3. 검증된 정상 픽스처 — 리포 원본

**단일 빈칸: [픽스처 없음].** 리포의 단일 빈칸 스크립트 2종(`scripts/_test-md-source-exact.ts`,
`scripts/_test-md-double-negative.ts`)은 **실시간 API 호출 테스트**라 마크다운 픽스처를 담고 있지 않다.
따라서 아래 §2-4 의 단일 빈칸 실물은 **정찰이 새로 작성해 프로브로 통과시킨 것**이다.

**다중 빈칸은 리포 픽스처가 있다** — `scripts/_test-md-multi-formats.ts:34-54, 131-145` verbatim.
프로브 P1 에서 gate 0 · adapt ok · postProcess ok 재확인.

지문 (`MB_PASSAGE`, `scripts/_test-md-multi-formats.ts:34-39`):

```
Coral reefs support a quarter of all marine life despite covering less than one percent of the ocean floor. Their calcium structures provide shelter for countless species that would otherwise fall prey to predators. Rising water temperatures force corals to expel the algae that supply most of their energy. Without these partners, the corals turn white and begin to starve. Scientists now breed heat-tolerant strains in the hope of rebuilding damaged reefs.
```

**(1) 다중 빈칸 2개** (`scripts/_test-md-multi-formats.ts:41-54`):

```md
빈칸원문(A): provide shelter for countless species
빈칸원문(B): expel the algae that supply most of their energy
① offer refuge to numerous organisms …… absorb the nutrients that fuel growth
② guard their own territory fiercely …… eject the partners that power them
③ shield a vast range of creatures …… discharge the organisms that feed them
④ shield a vast range of creatures …… strengthen the bonds that sustain them
⑤ compete with invading species …… discharge the organisms that feed them
정답: ③
해설: 두 번째 문장은 산호 구조가 뭇 생물의 피난처임을 말하고, 세 번째 문장은 수온 상승이 에너지 공급원을 방출하게 함을 말합니다. 두 근거를 종합하면 ③의 조합이 가장 적절합니다.
오답:
① 첫 값은 그럴듯하나 두 번째 값이 영양 흡수로 방향이 반대입니다.
② 첫 값이 지문에 없는 영역 다툼 서사로 어긋납니다.
④ 첫 값은 정답과 같지만 두 번째 값이 유대 강화로 반대인 near-miss 입니다.
⑤ 첫 값이 경쟁 서사로 지문 밖 개념입니다.
```

**(2) 다중 빈칸 3개** (`scripts/_test-md-multi-formats.ts:131-145`):

```md
빈칸원문(A): provide shelter for countless species
빈칸원문(B): expel the algae that supply most of their energy
빈칸원문(C): breed heat-tolerant strains
① offer refuge to numerous organisms …… absorb the nutrients that fuel growth …… abandon damaged colonies entirely
② shield a vast range of creatures …… discharge the organisms that feed them …… cultivate temperature-resistant varieties
③ guard their own territory fiercely …… eject the partners that power them …… cultivate temperature-resistant varieties
④ shield a vast range of creatures …… strengthen the bonds that sustain them …… abandon damaged colonies entirely
⑤ compete with invading species …… discharge the organisms that feed them …… monitor reef decline passively
정답: ②
해설: 산호 구조의 역할, 수온 상승의 결과, 과학자들의 대응이 각각 두 번째·세 번째·다섯 번째 문장에 근거합니다. 세 근거를 종합하면 ②의 조합이 가장 적절합니다.
오답:
① 세 번째 값이 포기 서사로 지문과 반대입니다.
③ 첫 값이 지문에 없는 영역 다툼입니다.
④ 두 번째 값이 유대 강화로 반대입니다.
⑤ 세 번째 값이 수동 관찰로 지문의 능동 대응과 어긋납니다.
```

### 2-4. 정찰이 새로 작성해 통과시킨 단일 빈칸 유닛 실물 (프로브 P2/P3 — **5문항 전건** gate 0 / adapt ok / postProcess ok / quality error 0 / `gateUnit` blocking 0 · qualityBlocking 0)

지문 (`_probe-BLANK_INFERENCE.ts:76-83`, 7문장):

```
Early telescopes were judged almost entirely by how much light they could gather, and observatories competed to build ever wider mirrors. That contest hid a quieter problem, because the atmosphere blurs an image long before a larger mirror can sharpen it. Engineers eventually admitted that additional width bought them nothing, and they turned instead to correcting the distortion itself. Adaptive optics bends a flexible mirror hundreds of times a second so that it cancels the turbulence it measures. The gain came from repairing what the sky had already damaged rather than from collecting more light. Modern designers therefore treat the atmosphere as part of the instrument rather than as an obstacle outside it. A telescope that ignores the medium it looks through wastes most of the aperture its builders paid for.
```

**표적 배분표** (문항을 쓰기 **전에** 채운 것 — §8-3 절차의 실물):

| # | 난이도 | 겨냥 문장 | 추론 논리(코어) | 빈칸 표적 | 정답 라벨 |
|---|---|---|---|---|---|
| 1 | BASIC | S1 | 재진술·환언 | competed to build ever wider mirrors | ① |
| 2 | INTERMEDIATE | S2→S3 | 인과·기제 채우기 | additional width bought them nothing | ① |
| 3 | INTERMEDIATE | S3→S4 | 재진술·환언(기제 서술) | cancels the turbulence it measures | ① |
| 4 | KILLER | S4·S5 | 대조 전환 + 추상화 | repairing what the sky had already damaged | ① |
| 5 | KILLER | S6·S7 | 추상 개념 명명(태도 규정) | as part of the instrument rather than as an obstacle outside it | ① |

> 정답 라벨이 전부 ①인 것은 **qbank 하네스가 셔플을 돌리지 않기 때문**이다(§5 주). 프로덕션 저장 경로는
> `shuffleQuestionOptionsForDiversity` 로 위치를 섞는다(`route.ts:1100-1103`). 다만 저작 단계에서 정답을
> 한 자리에 몰아 두는 것은 게으름의 신호이므로, **실제 저작에서는 ①~⑤에 분산하라**(§8-2 축 G).

> `craft:` 는 게이트 대상이 아니다(`qgen-core.ts:102` 가 저장만 한다). 프로브는 5문항에 같은 문자열을 썼고
> 아래는 가독성을 위해 문항별로 풀어 쓴 것이다 — **`point:` 값만 유닛 내 전부 달라야 한다.**

<details open>
<summary><b>ITEM 1 — BASIC · 재진술</b></summary>

```md
<!-- ITEM 1
difficulty: BASIC
point: 도입 통념 — 초기 평가 기준이 낳은 경쟁 행위 재진술
craft: 정답은 근거 두 문장을 잇는 재진술이고 오답은 지문 소재를 재활용한 근접 미끼다
settings: {"paraphraseAnswer": true}
-->
빈칸원문: competed to build ever wider mirrors
① raced one another to make their mirrors larger
② measured the turbulence above each observatory site
③ replaced their flexible mirrors every few seconds
④ shared their images with distant research teams
⑤ abandoned wide apertures in favor of smaller ones
정답: ①
해설: 첫 문장은 초기 망원경의 평가 기준이 집광량이었다고 밝히고, 뒤 문장들이 그 경쟁이 더 넓은 거울로 이어졌음을 확인합니다. 따라서 빈칸에는 거울을 더 크게 만들려 경쟁했다는 재진술이 들어갑니다.
오답:
② 난기류 측정은 후반부 적응광학 대목의 내용이라 이 문장의 시점과 어긋납니다.
③ 유연한 거울을 초당 수백 번 움직이는 것은 적응광학의 작동 방식이지 초기 경쟁이 아닙니다.
④ 관측 자료를 공유했다는 서술은 지문 어디에도 근거가 없습니다.
⑤ 지문은 더 넓은 거울을 향한 경쟁을 말하므로 구경을 포기했다는 진술은 방향이 반대입니다.
```
</details>

<details>
<summary><b>ITEM 2 — INTERMEDIATE · 인과</b></summary>

```md
<!-- ITEM 2
difficulty: INTERMEDIATE
point: 전환점 — 확장이 무의미해진 이유를 잇는 인과
craft: S2 의 대기 흐림과 S3 의 방향 전환을 이어야만 값이 확정된다
settings: {"paraphraseAnswer": true}
-->
빈칸원문: additional width bought them nothing
① extra aperture stopped improving what they saw
② the atmosphere rewarded every increase in mirror size
③ observatories had already reached the limits of funding
④ wider mirrors gathered light faster than before
⑤ turbulence was easier to measure with larger mirrors
정답: ①
해설: 둘째 문장은 대기가 먼저 상을 흐린다고 말하고, 셋째 문장은 기술자들이 결국 왜곡 교정으로 방향을 틀었다고 말합니다. 두 근거를 이으면 빈칸에는 구경을 더 넓혀도 보이는 것이 나아지지 않았다는 인정이 들어갑니다.
오답:
② 대기는 더 큰 거울을 보상하지 않고 오히려 상을 흐린다고 했으므로 논지가 뒤집힙니다.
③ 예산 한계는 지문이 다루지 않는 소재입니다.
④ 표면의 소재만 재활용했을 뿐, 방향을 튼 이유를 설명하지 못합니다.
⑤ 난기류 측정 난이도는 거울 크기와 결부되어 서술되지 않았습니다.
```
</details>

<details>
<summary><b>ITEM 3 — INTERMEDIATE · 기제 환언</b></summary>

```md
<!-- ITEM 3
difficulty: INTERMEDIATE
point: 기제 설명 — 적응광학이 수행하는 동작의 환언
craft: S4 의 동작 서술과 S3 의 목적 서술을 이어 붙여야 값이 확정된다
settings: {"paraphraseAnswer": true}
-->
빈칸원문: cancels the turbulence it measures
① undoes the very distortion it has just detected
② stores the light it collects for later analysis
③ tracks how far each star has drifted upward
④ removes the need for atmospheric correction entirely
⑤ sharpens the image by widening the mirror further
정답: ①
해설: 넷째 문장은 유연한 거울이 초당 수백 번 휘어진다고 말하고, 셋째 문장은 그 목적이 왜곡 교정임을 밝힙니다. 두 문장을 이으면 빈칸에는 방금 측정한 왜곡을 되돌린다는 재진술이 들어갑니다.
오답:
② 빛을 저장해 나중에 분석한다는 절차는 지문에 근거가 없습니다.
③ 별의 이동 추적은 지문이 말하는 보정 작동과 다른 작업입니다.
④ 보정의 필요를 없앤다는 진술은 보정을 수행한다는 지문 논지와 어긋납니다.
⑤ 거울을 더 넓히는 방식은 지문이 효과가 없다고 밝힌 접근입니다.
```
</details>

<details>
<summary><b>ITEM 4 — KILLER · 대조 전환 + 추상화</b></summary>

```md
<!-- ITEM 4
difficulty: KILLER
point: 귀결 — 이득의 출처를 대조 구조 안에서 추상화
craft: rather than 대조의 앞항을 추상 재진술로 복원해야 한다. 뒷항(더 많은 빛)이 최강 미끼
settings: {"paraphraseAnswer": true}
-->
빈칸원문: repairing what the sky had already damaged
① undoing the damage that the air had already inflicted on the image
② gathering more starlight than an earlier mirror could deliver
③ widening the aperture until the blur became tolerable
④ predicting where the turbulence would appear next
⑤ recording the sky for longer periods each night
정답: ①
해설: 다섯째 문장은 이득의 출처가 더 많은 빛이 아니라고 못 박고, 넷째 문장은 그 장치가 난기류를 상쇄한다고 서술합니다. 두 근거를 종합하면 빈칸에는 대기가 이미 훼손한 상을 되돌린다는 추상 재진술이 들어갑니다.
오답:
② 더 많은 빛을 모으는 쪽은 문장 뒷부분이 명시적으로 배제한 항목입니다.
③ 구경을 넓히는 접근은 셋째 문장이 소득이 없다고 판정한 방식입니다.
④ 난기류의 위치를 예측한다는 서술은 상쇄한다는 서술과 다른 작업입니다.
⑤ 관측 시간을 늘린다는 방법은 지문이 제시하지 않은 대안입니다.
```
</details>

<details>
<summary><b>ITEM 5 — KILLER · 추상 개념 명명</b></summary>

```md
<!-- ITEM 5
difficulty: KILLER
point: 결론 태도 — 대기를 장비의 일부로 재규정하는 관점
craft: 마지막 문장의 판정(무시하면 낭비)이 두 번째 근거. 선지 전부 as 로 시작해 층위 일치
settings: {"paraphraseAnswer": true}
-->
빈칸원문: as part of the instrument rather than as an obstacle outside it
① as a working component of the telescope instead of an external nuisance
② as a fixed background whose behavior the design can safely ignore
③ as a rival whose interference the builders should learn to endure
④ as a resource that supplies more starlight to the wider mirrors
⑤ as a variable that only the largest observatories need to model
정답: ①
해설: 여섯째 문장은 현대 설계자들의 태도를 규정하고, 마지막 문장은 매질을 무시한 망원경이 구경을 낭비한다고 못 박습니다. 두 근거를 종합하면 빈칸에는 대기를 장비의 일부로 취급한다는 재진술이 들어갑니다.
오답:
② 마지막 문장이 매질을 무시하는 설계를 낭비라고 판정하므로 배경으로 방치한다는 진술은 배제됩니다.
③ 견디는 대상으로 두는 태도는 장비의 일부로 삼는다는 태도와 다릅니다.
④ 대기가 별빛을 더 공급한다는 서술은 지문에 근거가 없습니다.
⑤ 큰 관측소만 고려하면 된다는 제한은 지문이 두지 않은 범위 축소입니다.
```
</details>

---

## 3. 파서 계약 (★ 가장 중요)

### 3-0. 두 파서가 있고 **호출자가 노브로 고른다**

| blankCount | 파서 | 게이트 | 어댑터 |
|---|---|---|---|
| 1 (기본) | `parseMdBlank` (`parser.ts:76-100`) | `gateMdQuestion` blank 분기 (`parser.ts:270-280`) | `adaptMdBlankToAiQuestion` |
| 2~3 | `parseMdMultiBlank` (`parser.ts:104-139`) | `gateMdMultiBlank` (`parser.ts:358-418`) | `adaptMdMultiBlankToAiQuestion` |

분기는 **설정값** `blankCount >= 2` 로만 결정된다(`route.ts:356`, `canon.ts:133`). 마크다운 내용으로 자동 판별하지 않는다.
→ **설정이 1인데 `빈칸원문(A):` 형식을 쓰면 `parseMdBlank` 가 돌아 「빈칸원문 누락」으로 죽는다.** 그 반대도 같다.

### 3-1. 섹션 추출 정규식 전수 — 단일 빈칸 (`parseMdBlank`)

| # | 대상 | 정규식 / 리터럴 | 적용 범위 | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|---|
| R1 | 오답 분리(선행) | `text.split(/^오답:/m)[0]` → `before` | 전체 | `parser.ts:77` | — (선지 탐색 범위를 결정) |
| R2 | 선지 5줄 | `/^([①②③④⑤])\s*(.+)$/gm` → `{label, text.trim()}` | **`before` 안에서만** | `parser.ts:78-81` | 그 선지 (개수 반려) |
| R3 | 오답 섹션 | `text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? ""` | 전체 | `parser.ts:82` | 오답해설 전부 |
| R4 | 정답 | `/^정답:\s*([①②③④⑤])/m` | 전체 | `parser.ts:83` | 정답 |
| R5 | 오답 줄 | `/^([①②③④⑤])\s*(.+)$/gm` → **정답 라벨 줄은 필터** | 오답 섹션 | `parser.ts:86-88` | 그 줄 |
| R6 | 빈칸원문 | `/^빈칸원문:\s*(.+)$/m` → `[1].trim()` | 전체 | `parser.ts:91` | 빈칸원문 (「빈칸원문 누락」) |
| R7 | 해설 | `/^해설:\s*([\s\S]*?)(?=^오답:)/m` → 없으면 `/^해설:\s*([\s\S]+)$/m` | 전체 | `parser.ts:94-97` | 해설 |

### 3-2. 섹션 추출 정규식 전수 — 다중 빈칸 (`parseMdMultiBlank`)

| # | 대상 | 정규식 / 리터럴 | 적용 범위 | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|---|
| M1 | 오답 분리(선행) | `text.split(/^오답:/m)[0]` → `before` | 전체 | `parser.ts:105` | — |
| M2 | 빈칸원문 라벨 줄 | `/^빈칸원문\(([A-C])\):\s*(.+)$/gm` → `label = "(X)"`, `expression.trim()` | **`before` 안에서만** | `parser.ts:106-109` | 그 빈칸 (개수 반려) |
| M3 | 조합 선지 | `/^([①②③④⑤])\s*(.+)$/gm`, 값 분해는 `optionText.split(/\s*……\s*/)` → `trim` → `filter(Boolean)` | **`before` 안에서만** | `parser.ts:110-121` | 그 선지 / 조합값 |
| M4 | 정답 | `/^정답:\s*([①②③④⑤])/m` | 전체 | `parser.ts:122` | 정답 |
| M5 | 오답 섹션·줄 | 단일과 동일 (`^오답:` split + 원형숫자 줄, 정답 라벨 필터) | — | `parser.ts:123-127` | 오답해설 |
| M6 | 해설 | 단일과 동일 | 전체 | `parser.ts:133-136` | 해설 |

**구분자 계약**: 저작 리터럴은 ` …… `(공백 + `……` + 공백, `prompts.ts:198`).
파서 split 은 `\s*……\s*` 라 **공백 유무만 관용**된다 — `……` 두 글자 자체는 필수다(`parser.ts:117`).

### 3-3. ★ 전 정규식이 `^`(멀티라인 행두) 앵커다 — 장식 전면 금지

정본 파서는 `decoration.ts` 를 **import 하지 않는다**(00-contract §8). 머리표 앞에 공백·`>`·`-`·`#`·`|`·`*` 가
하나라도 붙으면 그 섹션이 **통째로 사라진다.**

프로브 실측(E7·E8·P6-4):

| 저작 실수 | 실제 반려 사유 | 진실 |
|---|---|---|
| `**정답:** ①` | `정답 누락` | 정답을 정확히 썼는데 "없다"고 한다 |
| `## 빈칸원문: …` | `빈칸원문 누락` | 〃 |
| `빈칸 원문: …`(공백 삽입) | `빈칸원문 누락` | 〃 |
| `정답 : ①`(콜론 앞 공백) | `정답 누락` | 〃 |

**→ 저작 규칙: 머리표·선지 줄에 장식 0. 머리표는 픽스처에서 복사해 써라.**

### 3-4. ★ 선지 줄은 `before` 에서 "행두 원형숫자"로만 잡힌다 — 이 유형 고유의 지뢰

`R2` 는 `오답:` **앞 구간 전체**를 훑는다. 즉 `해설:` 본문이라도 **줄머리가 `①`~`⑤` 면 선지로 오인된다.**

프로브 P6-5 실측:

```md
해설: … 들어갑니다.
② 이 선지는 참고 설명입니다.      ← 해설 안의 줄
오답:
```
→ 「**선지 6개 (5개 필요)**」로 유닛 전체 반려.

- 해설은 **한 줄로** 쓰는 것이 가장 안전하다. 여러 줄로 쓸 거면 **어떤 줄도 원형숫자로 시작하면 안 된다.**
- 해설 안에서 선지를 지칭할 때는 문장 중간에 두어라: `… 이므로 ②는 …` (○) / 줄머리 `② 는 …` (×)
- `⑥` 이상은 아예 매칭되지 않는다 → 선지가 조용히 하나 줄어든다(프로브 P6-6).

### 3-5. 빈칸원문의 축자 계약과 오토스냅 사거리

게이트는 `normalizeWs(passage).includes(normalizeWs(originalExpression))` 로만 본다(`parser.ts:272-273`).

`normalizeWs` 가 흡수하는 차이는 **이것뿐**(`parser.ts:67-74`):

| 원문 | 허용 대체 |
|---|---|
| `‘ ’ ʼ` | `'` |
| `“ ”` | `"` |
| `– —` | `-` |
| `…` | `...` |
| 연속 공백/줄바꿈 | 단일 공백 |

**그 외 모든 문자 차이는 반려다.** 다만 반려 직전에 **0원 오토스냅**이 한 번 구제한다
(`autoSnapBlankExpression` → `snapExpressionSpan`, `parser.ts:582-635`).

스냅이 작동하는 조건(4중 가드 — **전부** 만족해야 함):

| 가드 | 조건 | file:line |
|---|---|---|
| 축자 실패 | `passage.includes(oe)` 도 `normalizeWs` 포함도 실패해야 시도한다 | `parser.ts:602-604` |
| 길이 | 표현이 **4단어 이상** | `parser.ts:605-606` |
| 머리·꼬리 | 앞 2단어·뒤 2단어가 지문에 **축자로** 존재 | `parser.ts:607-608` |
| 유일성 | 머리~꼬리로 만든 후보 구간이 **정확히 1개** | `parser.ts:624-625` |
| 자카드 | 토큰 자카드 **≥ 0.66** | `parser.ts:626-633` |

프로브 실측:
- `ever` → `even` 1글자 오타(6단어): **스냅 성공, gate 0** (E6a)
- `repairing what the sky had already damaged` → `the` 누락: **스냅 성공** (E10)
- `built wider mirrors`(3단어): **스냅 불가 → 「빈칸원문이 지문에 축자로 없음」** (E6b·E11)

> **스냅에 의존하지 마라.** 스냅이 돌면 `corrections[]` 에 기록되고 하네스가 `AUTOSNAP` 경고를 남긴다
> (`qgen-core.ts:323`). 경고가 뜬다는 것은 지문에서 복사하지 않고 손으로 옮겨 적었다는 증거다.

다중 빈칸은 같은 가드를 **빈칸별로 독립 반복**한다(`autoSnapMultiBlankExpressions`, `parser.ts:639-658`).

### 3-6. `해설:` 는 `오답:` 직전까지

`/^해설:\s*([\s\S]*?)(?=^오답:)/m` → 없으면 문서 끝까지(`parser.ts:94-97`).
`오답:` 섹션을 생략하면 해설이 뒤 텍스트를 **전부 삼키고**, 게이트는 「오답해설 0개 (4개 필요)」로 반려한다(프로브 P6-7).
**빈칸은 `오답:` 생략이 허용되지 않는다** — 어법의 K=N 케이스 같은 예외가 없다.

### 3-7. 첫 매치 규칙 · 문항 연접 사고

1 마크다운 문서 = **정확히 1문항**(00-contract §3). `정답:`·`빈칸원문:`·`해설:` 은 **첫 매치만** 취한다.

프로브 E9 실측 — 컨테이너 없이 2문항을 이어 붙이면:

| 필드 | 결과 |
|---|---|
| `빈칸원문` / `정답` | **첫 문항 것만** (조용히) |
| `options` | 5개 (첫 `오답:` 앞까지라 우연히 맞는다) |
| `wrong` | **8개** (두 문항 합산) |
| 게이트 | 「오답해설 8개 (4개 필요)」 **단 하나** |

→ 사유 문자열이 원인을 가리키지 않는다. **반드시 `<!-- ITEM n -->` 로 나눠라.**

### 3-8. 파서가 자동으로 걸러내는 것 (관용 — 의존 금지)

- **오답 목록에 정답 라벨 줄이 끼면 제거**된다(`parser.ts:88` / 다중 `parser.ts:127`). 프로브 E5 실증.
  → 그래서 게이트 사유 「오답해설에 정답 라벨 포함」은 **파서 경로에서 발화 불가**다(프로브 P6-8).
  대신 개수가 4개를 넘으면 개수 사유로 반려된다.
- 다중 빈칸 값 구분자의 **공백 드리프트**(`……` 붙여쓰기)는 관용된다(`parser.ts:117`).

### 3-9. 라벨 축 정리

| 자리 | 축 | 근거 |
|---|---|---|
| md 선지 라벨 | `①`~`⑤` (5개 고정) | `parser.ts:78` |
| md 빈칸 라벨(다중) | `(A)` `(B)` `(C)` — 지문 등장순 고정 | `parser.ts:106, 353` |
| 저장 선지 라벨(단일) | **`①`~`⑤` 그대로** | `adapter.ts:131` |
| 저장 선지 라벨(다중) | **`"1"`~`"5"`** (`digitOptionLabel` 변환) | `adapter.ts:74-78, 210` |
| 저장 정답(단일) | `"①"` | `adapter.ts:132` |
| 저장 정답(다중) | `"3"` | `adapter.ts:217` |

> ★ **단일과 다중의 저장 라벨 축이 다르다.** 단일만 원형숫자를 그대로 저장한다.

---

## 4. 게이트 체크리스트 — 반려 사유 문자열 전수

### 4-1. `gateMdQuestion` blank 분기 (`parser.ts:270-280`) — 단일 빈칸

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `빈칸원문 누락` | `!q.originalExpression` | `parser.ts:271` |
| `빈칸원문이 지문에 축자로 없음` | `normalizeWs(passage)` 에 `normalizeWs(oe)` 미포함 (오토스냅 실패 후) | `parser.ts:272-273` |
| `선지 {n}개 (5개 필요)` | `q.options.length !== 5` | `parser.ts:274` |
| `정답 누락` | `!q.answer` | `parser.ts:275` |
| `해설 누락` | `!q.explanation` | `parser.ts:276` |
| `오답해설 {n}개 (4개 필요)` | `requireWrong && q.wrong.length !== 4` | `parser.ts:277-278` |
| `오답해설에 정답 라벨 포함` | `q.wrong` 에 정답 라벨 — **파서 경로 미발화**(§3-8) | `parser.ts:279-280` |

기본값: `requireWrong = true`(`parser.ts:263`). 라우트·canon 모두 옵션 없이 호출한다(`route.ts:379`, `canon.ts:144`).

### 4-2. `gateMdMultiBlank` (`parser.ts:358-418`) — 다중 빈칸 (2~3)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `빈칸 수 {n} (2~3만 지원)` | `count < 2 \|\| count > 3` | `parser.ts:367` |
| `빈칸 {n}개 ({count}개 필요)` | 파싱된 빈칸 수 ≠ 설정값 | `parser.ts:368-369` |
| `빈칸 라벨 순서 오류 — {기대}필요, 실제 {실제}` | 라벨 join 이 `(A)(B)[(C)]` 와 불일치 | `parser.ts:370-375` |
| `{label} 빈칸원문 누락` | 값이 빈 문자열 | `parser.ts:379-381` |
| `{label} 빈칸원문이 지문에 축자로 없음` | `normalizeWs` 기준 미포함 | `parser.ts:384-386` |
| `{A}·{B} 빈칸 구간이 겹침 — 서로 다른 문장에서 선택 필요` | 두 빈칸 구간이 문자 인덱스로 중첩 (최초 1건만 보고) | `parser.ts:390-400` |
| `선지 {n}개 (5개 필요)` | `q.options.length !== 5` | `parser.ts:402` |
| `선지 {label} 값 {n}개 — 빈칸 {count}개와 불일치하거나 빈 값 포함` | `blankValues.length !== count` 또는 빈 값 | `parser.ts:403-408` |
| `정답 누락` | `!q.answer` | `parser.ts:409` |
| `정답 라벨이 선지에 없음` | 정답 라벨과 같은 선지가 없음 | `parser.ts:410-411` |
| `해설 누락` | `!q.explanation` | `parser.ts:412` |
| `오답해설 {n}개 (4개 필요)` | `requireWrong && wrong.length !== 4` | `parser.ts:413-414` |
| `오답해설에 정답 라벨 포함` | **파서 경로 미발화** | `parser.ts:415-416` |

`blankCount` 는 라우트·canon 이 **설정 실값**을 넘긴다(`route.ts:364`, `canon.ts:137`) — 파싱 개수 드리프트는 반려된다.
`gateMdQuestion` 에 multiBlank 를 넘기면 `gateMdMultiBlank` 로 위임되지만 그때는 `blankCount` 가 **파싱 개수** 기준이 된다(`parser.ts:264-267`).

### 4-3. 어댑터 실패 (하네스 `ADAPT` 차단)

**단일** — `adapter.ts:91-143`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `빈칸원문 누락` | `!oe` | `adapter.ts:102` |
| `빈칸원문이 지문에 축자로 없음` | `indexOf` 실패 + `normalizeWs` 포함도 실패 | `adapter.ts:104-110` |
| `선지 {n}개` | `options.length !== 5` | `adapter.ts:111` |
| `정답 누락` | `!q.answer` | `adapter.ts:112` |

**다중** — `adapter.ts:153-229`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `빈칸 {n}개 (2~3개 필요)` | `blanks.length` 범위 밖 | `adapter.ts:162-164` |
| `빈칸원문{label} 누락` | 값 없음 | `adapter.ts:174` |
| `빈칸원문{label}이 지문에 축자로 없음` | 축자·정규화 모두 실패 | `adapter.ts:176-178` |
| `선지 {n}개` | 5개 아님 | `adapter.ts:187` |
| `선지 {label} 조합값 {n}개 (빈칸 {n}개와 불일치 또는 공백)` | 값 개수/공백 | `adapter.ts:188-198` |
| `정답 누락` | `!q.answer` | `adapter.ts:199` |

> 게이트를 통과하면 이 사유들은 원리상 발화하지 않는다(게이트가 상위 집합). 발화하면 게이트 우회 버그다.

### 4-4. 후처리 실패 (하네스 `POSTPROCESS` 차단) — `question-postprocess/processors/blank-inference.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `Missing originalExpression field` | 단일 — 필드 부재 | `blank-inference.ts:31-33` |
| `Expression not found in passage: "…"` | 단일 — verbatim·정규화·퍼지 탐색 모두 실패 | `blank-inference.ts:38-48` |
| `Multi-blank BLANK_INFERENCE must contain 2~3 blanks, got {n}` | 다중 | `blank-inference.ts:136-143` |
| `Multi-blank BLANK_INFERENCE blank {i} is missing originalExpression` | 다중 | `blank-inference.ts:149-156` |
| `Multi-blank expression not found in passage: "…"` | 다중 | `blank-inference.ts:157-167` |
| `Multi-blank BLANK_INFERENCE blanks overlap in the passage; choose separated expressions.` | 다중 — 구간 중첩 | `blank-inference.ts:171-183` |
| `Multi-blank option {i} is not an object` | 다중 | `blank-inference.ts:210-217` |
| `Multi-blank option {i} must provide {n} non-empty blankValues` | 다중 | `blank-inference.ts:222-229` |
| `Multi-blank BLANK_INFERENCE must have exactly 5 options, got {n}` | 다중 | `blank-inference.ts:237-244` |
| `Multi-blank correctAnswer "{x}" does not match any option label` | 다중 | `blank-inference.ts:250-257` |

후처리는 **경고**도 낸다(차단 아님, `pp.warnings`):
`correctAnswer option "…" text … Auto-fixed option text.`(SOURCE_EXACT 정답 덮어쓰기 — `blank-inference.ts:76-80`),
`{MODE} mode expected a transformed correct option, but correct option matches originalExpression.`(`:82-86`),
`Reordered multi-blank labels to follow passage order.`(`:193-195`),
`Multi-blank correct option did not match the source expressions; auto-fixed…`(`:262-267`).

### 4-5. 유닛 차단 (qbank 하네스 — 문항 하나로는 보이지 않는다) — `qgen-core.ts`

| 코드 | 조건 | file:line |
|---|---|---|
| `UNSUPPORTED_LANE` | 레인 조회 실패. BLANK_INFERENCE 는 `canon.ts` 가 채우므로 **미발화** | `qgen-core.ts:226` |
| `CONTAINER` | `<!-- ITEM n -->` 부재 · 번호 비연속 · `difficulty` 오값 · `point:` 누락 · `settings:` JSON 파싱 실패 · 본문 공백 | `qgen-core.ts:68, 86, 91, 93-95` |
| `ITEM_COUNT` | 문항 수 < minItems(기본 5) | `qgen-core.ts:240-246` |
| `GATE` | §4-1 / §4-2 사유 전부 | `qgen-core.ts:316` |
| `ADAPT` / `POSTPROCESS` | §4-3 / §4-4 | `qgen-core.ts:317-320` |
| `POINT_DUPLICATE` | 유닛 내 `point:` 값이 정규화 후 중복 | `qgen-core.ts:335-343` |
| `ANSWER_DUPLICATE` | `diversityTargets` 중복 — **빈칸은 채널이 살아 있다**(`canon.ts:75-82` = 정답 선지 text) | `qgen-core.ts:346-363` |

> ★ **어법과 달리 빈칸의 `ANSWER_DUPLICATE` 는 실제로 작동한다**(프로브 E14 실증).
> 다만 표적이 "정답 선지 텍스트"라 **같은 구간을 뚫고 정답만 다르게 쓰면 통과한다** — 부록 B 참조.

### 4-6. 품질 차단(`qualityBlocking`) — 프로덕션은 기록만, qbank 는 차단

라우트는 `validateQuestionQuality` 를 **비차단**으로 쓴다(`route.ts:1104-1123`, 00-contract §2). 하네스는 별도 축으로 차단한다(`qgen-core.ts:194, 321`).

**★ SHIP-FIRST 강등 규칙**: 아래 코드들은 `add("error", …)` 로 들어와도 반환 직전에 **warning 으로 강등**된다
(`question-quality/core.ts:31-62` `SHIP_FIRST_WARNING_CODES`) — 즉 차단되지 않는다:
`blank-target-too-small` · `blank-target-list-like` · `blank-killer-target-too-easy` ·
`blank-paraphrase-correct-too-thin` · `blank-paraphrase-difficulty-mismatch` ·
`blank-paraphrase-killer-giveaway-distractors` · `blank-paraphrase-killer-too-easy` ·
`blank-paraphrase-missing-answer-logic` · `blank-paraphrase-option-imbalance` ·
`blank-paraphrase-option-source-copy` · `blank-paraphrase-target-too-wide` ·
`blank-paraphrase-target-trailing-function`

> `blank-paraphrase-missing-answer-logic` 은 **md 경로에서 항상 발화한다**(어댑터가 `answerLogic` 을 만들지 않음).
> 강등 덕에 무해하지만, 유닛 경고 목록에 상수처럼 뜨는 노이즈다(프로브 P2/P3 실측).

#### (가) 모드 무관 — 단일 빈칸 (`validators/blank/inference.ts`)

| code | severity | 조건 | file:line |
|---|---|---|---|
| `blank-missing-answer` | error | 정답 라벨에 해당하는 선지 text 부재 | `inference.ts:50-53` |
| `blank-source-reconstruction-mismatch` | error | `passageWithBlank` 에 빈칸원문을 되꽂은 복원본 ≠ 원문 | `inference.ts:55-66`, `source-reconstruction.ts:15-37` |
| `blank-span-full-sentence` | error | 빈칸이 문장을 열고 직후 종결 + 정답이 소문자 술부 | `span-carve.ts:54-68` |
| `blank-span-clause-carve` | error | 콤마 직후에서 시작하는 빈칸이 콤마를 가로질러 삼킴 | `span-carve.ts:70-85` |
| `blank-span-sentence-swallow` | error | 빈칸원문이 **호스트 문장의 88% 이상** | `span-carve.ts:103-123` |
| `blank-trailing-dependent` | warning | 빈칸 직후 `, nor/which/in which/whom` 잔여 | `span-carve.ts:134-149` |
| `blank-relative-tail-contract` | error(high) | 빈칸 뒤 관계절 꼬리의 수일치가 선지 일부만 배제 | `seam.ts:223-247` |
| `blank-finite-tail-agreement-contract` | error(high) | 빈칸 뒤 정동사의 수일치가 선지 일부만 배제 | `seam.ts:249-266` |
| `blank-double-connector-boundary` | error | 빈칸 직전 접속사를 **일부** 선지만 중복 | `seam.ts:268-282` |
| `blank-double-preposition-boundary` | error | 빈칸 직후 전치사를 **일부** 선지만 중복 | `seam.ts:284-297` |
| `blank-double-punctuation-boundary` | error | 빈칸 직후 구두점을 **일부** 선지만 중복 | `seam.ts:299-312` |
| `blank-article-boundary` | error | 빈칸 직전 `a/an` 이 **일부** 선지만 문법적으로 배제 | `seam.ts:314-327` |
| `blank-explanation-narrative-circled-numbering` | error | 해설이 원형숫자를 **담화 단계 번호로** 2회 이상 사용 | `inference.ts:230-236` |
| `blank-explanation-step-numbering` | warning | 선지 인용 없는 원형숫자 2회 이상 | `inference.ts:223-229` |
| `blank-answer-residual-visible` | error | **비변형 모드** — 빈칸원문이 `passageWithBlank` 에 그대로 남음(정답 누출) | `inference.ts:245-256` |
| `blank-paraphrase-correct-residual-visible` | error | **변형 모드** — 재진술 정답이 `passageWithBlank` 에 축자로 존재 | `inference.ts:263-275` |
| `blank-crosses-contrast` | 변형=error / 그 외=warning | 빈칸이 `but/rather/instead` 대조 표지를 삼킴 | `inference.ts:291-297` |
| `blank-target-too-small` | (강등) warning | KILLER + 내용어 2개 미만. `granularity="word"` 면 스킵 | `inference.ts:299-309` |
| `blank-killer-target-too-easy` | (강등) warning | KILLER + 비변형 모드에서 표적이 저가치 | `inference.ts:311-320`, `inference-distractor.ts:17` |
| `blank-single-abstract-noun` | 변형=error / 그 외=warning | 빈칸원문이 단일 추상명사 화이트리스트(`core.ts:374-376`). `granularity="word"` 면 스킵 | `inference.ts:322-328` |
| `blank-target-list-like` | (강등) warning | 콜론·세미콜론·콤마 2개↑·90자↑·내용어 11개↑ | `inference.ts:330-336`, `core.ts:380-390` |
| `blank-adjacent-conclusion-conflict` | error | 빈칸 인접 문장이 정답을 그대로 풀어 씀 | `inference.ts:338-344`, `inference-distractor.ts:226` |
| `blank-awkward-correct-option` | error | 정답 선지에 비수능 어색 표현 | `inference.ts:346-353` |
| `blank-option-infinitive-past-form` | error | `to + 불규칙 과거형` | `inference.ts:357-367` |
| `blank-option-slot-syntax` | error | 선지가 빈칸 문장에서 통사적으로 깨짐(문맥 중복·전치사 스택) | `inference.ts:371-382` |
| `blank-awkward-option` | error | 오답 선지에 비수능 어색 표현 | `inference.ts:383-391` |
| `blank-mid-coordinated-list-carve` | error | 빈칸이 `_____, X, Y, and Z` 등위 나열 머리에 carve | `inference.ts:398-408` |
| `blank-example-list-slot` | 변형=error / 그 외=warning | `such as/including/for example` 직후 빈칸 | `inference.ts:410-416` |
| `blank-slot-subject-swallowed` | error | 빈칸이 주어를 삼킨 완전절인데 술부만인 선지 존재 | `inference.ts:448-471` |
| `blank-slot-aux-agreement-broken` | error | 조동사 삼킴 + 동명사 주어인데 어느 선지도 수일치 불가 | `inference.ts:478-499` |
| `blank-slot-double-verb-option` | error | be동사가 빈칸 직전에 남았는데 정동사 시작 선지 존재 | `inference.ts:505-519` |
| `blank-weak-distractors` | 변형/KILLER=**error** / 그 외=warning | 매력 오답 0개 | `inference.ts:522-545` |

**`blank-weak-distractors` 회피 규칙**(`inference-distractor.ts:28-49`) — 오답 하나가 "매력적"으로 세어지려면
① 지문 내용어 **2개 이상** 재사용 · ② 정답과 내용어 **1개 이상** 공유 · ③ 부정 단서 + 지문 내용어 1개 중 하나.
KILLER 또는 변형 모드에서 **0개면 error(차단)**, 1개면 warning.

#### (나) PARAPHRASE 모드 전용 (`validators/blank/paraphrase.ts` + `inference.ts:547-625`)

| code | severity | 조건 | file:line |
|---|---|---|---|
| `blank-paraphrase-answer-not-transformed` | **error** | 정답 선지 == 빈칸원문(정규화 비교) | `paraphrase.ts:54-59`, `inference.ts:601-610` |
| `blank-paraphrase-answer-too-verbatim` | **error** | near-verbatim 재진술 | `paraphrase.ts:60-66` |
| `blank-paraphrase-subject-slot-mismatch` | error | 스팬은 주어 포함 절인데 정답은 술부만 | `paraphrase.ts:194` |
| `blank-paraphrase-verb-form-slot-mismatch` | error | 동사 형태 슬롯 불일치 | `paraphrase.ts:207` |
| `blank-paraphrase-clause-slot-mismatch` | error | 절 슬롯 불일치 | `paraphrase.ts:219` |
| `blank-killer-giveaway-distractors` | error | KILLER 인데 오답이 즉사형 | `paraphrase.ts:277` |
| `blank-paraphrase-polarity-loss` | error | 원문의 극성을 정답이 잃음 | `paraphrase.ts:319` |
| `blank-killer-span-too-wide` | error | **KILLER** + 빈칸원문 12단어 초과 또는 90자 초과 | `paraphrase.ts:113-125` |
| `blank-paraphrase-slot-missing-subject` | error | 스팬이 주격 대명사 시작인데 정답이 무주어 | `inference.ts:551-562` |
| `blank-paraphrase-slot-to-infinitive` | error | `to _____` 슬롯에 동명사 정답 | `inference.ts:564-570` |
| `blank-paraphrase-slot-double-verb` | error | be동사 뒤 빈칸인데 정동사 시작 정답 | `inference.ts:573-584` |
| `blank-killer-polarity-shortcut` | error(0개)/warning(1개) | 정답이 부정 극성인데 부정 오답이 부족 | `inference.ts:588-600` |
| `blank-paraphrase-too-similar` | warning | 정답이 원문 내용어의 60% 초과 재사용 | `inference.ts:611-624` |

#### (다) DOUBLE_NEGATIVE 모드 전용 (`inference.ts:627-735`)

| code | severity | 조건 | file:line |
|---|---|---|---|
| `double-negative-answer-not-transformed` | error | 정답 == 빈칸원문 | `inference.ts:629-635` |
| `double-negative-no-option-negation` | **error** | **정답 선지에 부정 단서가 없음** | `inference.ts:637-643` |
| `negative-paraphrase-not-enough-negative-distractors` | error | 부정 오답 0개 | `inference.ts:645-650` |
| `negative-paraphrase-thin-negative-distractors` | warning | 부정 오답 1개 | `inference.ts:651-657` |
| `negative-paraphrase-negative-option-shortcut` | error(<2)/warning(<3) | 부정 선지 총합 부족 | `inference.ts:659-671` |
| `negative-paraphrase-copula-slot-mismatch` 외 슬롯 4종 | error | 부정 패러프레이즈 슬롯 결함 | `inference-distractor.ts:101-122` |
| `negative-paraphrase-too-many-negation-cues` | error | 부정 기제 과다 | `inference-distractor.ts:139` |
| `negative-paraphrase-tangled-negation` | error | `not…without` 류 꼬임 | `inference-distractor.ts:158` |
| `negative-paraphrase-no-subject-double-negation` | error | `No 주어 + 부정 술어` 구조 | `inference-distractor.ts:180` |
| `double-negative-option-capitalization` | error | 선지에 이상한 대문자 | `inference.ts:691-702` |
| `double-negative-weak-rarely-slot` | error | 약한 부정(rarely) + 내용어 3개 미만 | `inference.ts:704-710` |
| `double-negative-clause-missing-subject` | error | `since/because/that` 뒤인데 주어 없는 정답 | `inference.ts:712-718` |
| `double-negative-because-phrase-slot` | error | `because _____` 에 전치사구 정답 | `inference.ts:720-726` |
| `double-negative-thin-logic` | warning | `answerLogic` 20자 미만(md 경로 상시) | `inference.ts:728-735` |

부정 단서 판정은 `hasNegationCue`(`inference-distractor.ts:53-65`) — `not/no/never/without/lack/fail/prevent/cannot/unable/impossible/free from/non-·un-·in-` 계열 + `rather than` 등.

#### (라) 다중 빈칸 전용 (`validators/blank/multi.ts`)

| code | severity | 조건 | file:line |
|---|---|---|---|
| `multi-blank-count` | error | 빈칸 수 불일치 (이후 검사 중단) | `multi.ts:88-95` |
| `multi-blank-label` | error | 라벨이 `(A)(B)(C)` 지문 순서와 불일치 | `multi.ts:102-108` |
| `multi-blank-missing-expression` | error | 빈칸원문 부재 | `multi.ts:109-112` |
| `multi-blank-expression-not-in-passage` | error | 축자 부재 | `multi.ts:114-120` |
| `multi-blank-weak-expression` | warning | 기능어·경량구(`doing things` 류) | `multi.ts:121-131` |
| `multi-blank-missing-passage` | error | `passageWithBlank` 부재 | `multi.ts:136-138` |
| `multi-blank-marker-count` | error | `"(A) _____"` 마커가 정확히 1회가 아님 | `multi.ts:141-146` |
| `multi-blank-answer-visible` | error | 빈칸 표현이 `passageWithBlank` 에 그대로 노출 | `multi.ts:151-156` |
| `multi-blank-answer-partial-visible` | error | 핵심 부분구가 노출 | `multi.ts:159-165` |
| `multi-blank-option-values` | error | 조합값 개수/공백 | `multi.ts:177-182` |
| `multi-blank-duplicate-option` | error | 두 선지의 조합이 동일 | `multi.ts:190-193` |
| `multi-blank-missing-correct-option` | error | 정답 라벨이 선지에 없음 | `multi.ts:195-198` |
| `multi-blank-correct-option-mismatch` | error | **SOURCE_EXACT** 인데 정답 조합이 원문과 다름 | `multi.ts:205-210` |
| `multi-blank-paraphrase-correct-source-exact` | error | **PARAPHRASE** 인데 정답 조합이 원문 축자 | `multi.ts:218-223` |
| `blank-paraphrase-answer-too-verbatim` | error | PARAPHRASE 인데 한 값이 원문에 너무 가까움 | `multi.ts:228-233` |
| `multi-blank-weak-near-miss` | warning | 한 빈칸만 틀린 near-miss 선지 부재 | `multi.ts:250-255` |

#### (마) 공통 언어 게이트 (전 유형)

| code | severity | 조건 | file:line |
|---|---|---|---|
| `explanation-foreign-script` | error | 해설에 비한글 CJK(한자·가나) 혼입 | `validators/explanation-foreign-text.ts:99-103` |
| `explanation-latin-jam` | error | `steals다` 류 "영단어+한국어 어미" 짜깁기 | `validators/explanation-foreign-text.ts:107-111` |
| `few-key-points` | warning | `keyPoints` 빈 배열 — **md 경로 상시** | (어댑터가 항상 `[]`, `adapter.ts:117`) |

---

## 5. adapter 산출 필드

### 5-1. 단일 빈칸 (`adaptMdBlankToAiQuestion`, `adapter.ts:91-143`)

```jsonc
{
  "direction": "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",   // 상수
  "blankDesign": "md 원큐 경량 경로 — 설계 메모는 해설로 갈음합니다.",  // 후처리가 삭제
  "originalExpression": "competed to build ever wider mirrors",        // 지문 축자
  "blankAnswerMode": "PARAPHRASE",   // ★ 이 유형의 심장 — 후처리·품질검증기가 이걸로 갈린다
  "surroundingText": "…",            // contextAround(pad 45). 축자 실패 시 ""
  "options": [{ "label": "①", "text": "…" }],   // ★ 라벨이 원형숫자 그대로
  "correctAnswer": "①",
  "wrongOptionExplanations": [{ "label": "②", "explanation": "…" }],  // 배열로 나감
  "explanation": "…",
  "keyPoints": [],                   // ★ 항상 빈 배열 — 합성 금지(adapter.ts:115-117)
  "tags": [],
  "difficulty": "BASIC"
}
```

**후처리(`processBlankInference`) 이후 최종 `structuredData` 키 집합**(프로브 P6-14 로 고정):

```
blankAnswerMode, correctAnswer, difficulty, direction, explanation, keyPoints,
options, originalExpression, passageWithBlank, surroundingText, tags, wrongOptionExplanations
```

| 변화 | 내용 | 근거 |
|---|---|---|
| **`passageWithBlank` 추가** | 지문의 표적 구간을 `_____`(언더바 5개)로 치환한 전문 | `blank-inference.ts:90`, `types.ts:27` |
| `originalExpression` 정규화 | 비변형 모드는 **실제로 빈칸 처리된 지문 구간**(`passage.slice`)으로 교체 | `blank-inference.ts:55-59` |
| **`blankDesign` 삭제** | 학생/저장 데이터에 남기지 않음 | `blank-inference.ts:95-98` |
| **`wrongOptionExplanations` 배열 → `Record<"②","설명">`** | 공통 정규화 | `question-postprocess/index.ts:167`, `question-wrong-option-explanations.ts:26-39` |

### 5-2. 다중 빈칸 (`adaptMdMultiBlankToAiQuestion`, `adapter.ts:153-229`)

```jsonc
{
  "direction": "다음 글의 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",  // 라벨 나열
  "blanks": [{ "label": "(A)", "originalExpression": "…", "surroundingText": "…" }],
  "blankAnswerMode": "PARAPHRASE",       // DOUBLE_NEGATIVE 없음 — 두 모드뿐
  "options": [{ "label": "1", "text": "<A값> …… <B값>", "blankValues": ["…","…"] }],
  "correctAnswer": "3",                  // ★ 숫자 문자열
  "wrongOptionExplanations": [{ "label": "1", "explanation": "…" }],
  "explanation": "…", "keyPoints": [], "tags": [], "difficulty": "…"
}
```

**후처리 이후 최종 키 집합**(프로브 P6-14):

```
blankAnswerMode, blanks, correctAnswer, difficulty, direction, explanation,
keyPoints, options, passageWithBlank, tags, wrongOptionExplanations
```

- `originalExpression`(단일 축)·`surroundingText` 가 **없다**. `blanks[]` 는 `{label, originalExpression}` 로 축약된다(`blank-inference.ts:189-192`).
- `passageWithBlank` 는 `"(A) _____"` 형태 라벨 마커를 포함한다(`blank-inference.ts:197-202`).
- 라벨·조합값은 **지문 등장 순서로 재정렬**된다(`blank-inference.ts:186-195, 230`).

### 5-3. 이 유형에만 있는 필드

| 필드 | 의미 | 근거 |
|---|---|---|
| **`blankAnswerMode`** | `PARAPHRASE` / `SOURCE_EXACT` / `DOUBLE_NEGATIVE`. **후처리의 정답 덮어쓰기 여부와 품질검증기의 모드 분기를 동시에 결정한다** | `adapter.ts:99, 125`, `blank-inference.ts:27-29`, `inference.ts:27-34` |
| `originalExpression` | 빈칸으로 지워진 지문 구간(단일 전용) | `adapter.ts:129` |
| `blanks[]` | 다중 전용. `(A)~(C)` + 각 원문 구간 | `adapter.ts:207` |
| `options[].blankValues` | 다중 전용. 빈칸별 값 배열 | `adapter.ts:215` |
| `passageWithBlank` | **후처리가 붙인다** — 어댑터에는 없다 | `blank-inference.ts:105` |

### 5-4. 저장 직전 (프로덕션 경로 전용)

라우트가 `_typeId`/`_typeLabel`(`"빈칸 추론"`)/`_generationPlan`/`difficulty`/`tags` 를 붙이고
**`shuffleQuestionOptionsForDiversity` 로 선지를 섞는다**(`route.ts:1093-1103`).

> ★ **qbank 하네스는 셔플을 돌리지 않는다**(`qgen-core.ts` 에 호출 없음). 따라서 유닛 파일의 정답 라벨이
> 최종 시험지의 정답 라벨은 아니다. 그러나 해설이 선지를 **평숫자로 지칭**(`3번`, `선지 5`, `(3)`)하거나
> **원형숫자 범위**(`①~④`)로 지칭하면 셔플이 **통째로 취소된다**(`question-diversity.ts:590-594`, 프로브 P6-3).
> 잡 result 어디에도 흔적이 남지 않는 **조용한 실패**다 — 해설에서는 `②는 …` 처럼 단일 원형숫자만 써라.

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 | file:line |
|---|---|---|---|---|---|
| `blankCount` | number | **1** | **1~3** (`Math.round` 후 clamp, 비수치는 기본값) | **형식 자체를 바꾼다.** 1 = `빈칸원문:` 단일 / 2~3 = `빈칸원문(A):`+` …… ` 조합 선지 | `shared.ts:32-36, 165-170`, `blank-inference.ts:72-82` |
| `paraphraseAnswer` (빈칸 변형) | boolean | `false` | — | `answerMode` = PARAPHRASE(true) / SOURCE_EXACT(false). **정답 선지가 재진술이냐 원문 축자냐** | `blank-inference.ts:7-11`, `dispatchers.ts:295-296, 323-324` |
| `doubleNegative` (부정-부정) | boolean | `false` | **단일 빈칸 전용** · **flat 경로 전용** | `answerMode` = DOUBLE_NEGATIVE. `paraphraseAnswer` 를 강제 false 로 누른다 | `dispatchers.ts:297-300, 322-324` |
| `blankGranularity` (빈칸 단위) | `auto`\|`word`\|`phrase`\|`clause` | `auto` | 그 외 값은 전부 `auto` | **파서·게이트에는 영향 0.** 프롬프트의 표적 크기 지시 + **품질검증기의 `word` 예외 스위치** | `blank-inference.ts:18-70`, `inference.ts:26` |
| `pointFocus` (출제 포인트 집중) | boolean | `false` | — | 프롬프트에만 코어4 논리 가이드 주입. **파싱·게이트 무관** | `dispatchers.ts:301-305`, `blank-point-catalog.ts:165-225` |
| `difficulty` | `BASIC`\|`INTERMEDIATE`\|`KILLER` | `INTERMEDIATE` | — | 프롬프트 서사 + **품질검증기 KILLER 전용 게이트 3종**(`blank-killer-span-too-wide`·`blank-killer-giveaway-distractors`·`blank-weak-distractors` error 승격) | `route.ts:605-608`, `paraphrase.ts:113-125, 263-277`, `inference.ts:522-545` |
| `stemLanguage` / `optionLanguage` | `ko`/`en` | `ko`/`ko` | — | fast 레인 전용. **md 정본 경로는 소비하지 않는다** | `language.ts` |

### 노브 읽기 규칙

- `blankCount`·`paraphraseAnswer`·`blankGranularity`·`pointFocus` — **flat 우선 → `rawSettings.BLANK_INFERENCE.<key>` 폴백**
  (`shared.ts:88-115`, `blank-inference.ts:21-26`). qbank 의 `<!-- ITEM n --> settings:` 는 중첩 경로로 들어가므로 정상 동작한다.
- **`doubleNegative` 만 예외**: `isRecord(rawSettings) && rawSettings.doubleNegative === true` — **평면만** 본다(`dispatchers.ts:299-300`).
  → 프로덕션은 클라이언트가 유형 하위 객체를 그대로 보내므로 평면이 되어 작동하고(`use-generation-handlers.ts:1071-1074`),
  qbank 의 ITEM `settings:` 는 `{BLANK_INFERENCE:{...}}` 로 감싸이므로(`qgen-core.ts:379-387`) **무시된다**(프로브 P4).
  DN 유닛은 `gateUnit({rawTypeSettings: {doubleNegative: true}})` 처럼 **유닛 레벨 평면 설정**으로 켜라(프로브 P6-2 로 병합 후에도 유효함을 실증).

### ★ answerMode 3종이 마크다운에 만드는 차이 (이 유형의 핵심)

| | **PARAPHRASE** | **SOURCE_EXACT** | **DOUBLE_NEGATIVE** |
|---|---|---|---|
| 켜는 법 | `paraphraseAnswer: true` | 기본값(둘 다 off) | `doubleNegative: true` (flat, 단일 빈칸만) |
| 마크다운 **형식** | 동일 | 동일 | 동일 |
| 정답 선지 내용 | 빈칸원문의 **의미 등가 재진술**(표면 어휘 재사용 최소) | **빈칸원문과 축자로 동일해야 안전** | 빈칸원문의 **부정/결여 패러프레이즈**(부정 기제 1개 필수) |
| 후처리 개입 | 없음 — 공예 정답 보존 | **정답 선지 text 를 빈칸원문 축자로 덮어쓴다** (`blank-inference.ts:64-81`) | 없음 — 보존 |
| 어긴 대가 | `blank-paraphrase-answer-not-transformed`(error) | **경고만 뜨고 조용히 덮어써진다** — 공예 정답 소멸 | `double-negative-no-option-negation`(error) |
| 오답 추가 요구 | 정답이 부정 극성이면 부정 오답 ≥1 필수 | — | **부정 오답 ≥1 필수, 부정 선지 총 ≥2** |
| 다중 빈칸(2~3) | 지원 | 지원 | **미지원** — 리졸버가 강제 false (`dispatchers.ts:298`) |

**프로브 P5 실증**:
- SOURCE_EXACT 로 ITEM1 을 돌리면 정답 선지가 `raced one another to make their mirrors larger` → **`competed to build ever wider mirrors` 로 덮어써진다.** 차단이 아니라 `pp.warnings` 에만 기록된다.
- PARAPHRASE 면 공예 정답이 그대로 살아남는다.
- DOUBLE_NEGATIVE 면 정답은 보존되지만 부정 기제가 없어 `double-negative-no-option-negation` error 로 차단된다.

> **저작 규칙**: `settings:` 로 `paraphraseAnswer` 를 켜지 않은 채 재진술 정답을 쓰면 **그 정답은 저장되지 않는다.**
> 재진술 정답을 쓸 거면 **반드시** `settings: {"paraphraseAnswer": true}` 를 함께 적어라.

---

## 7. 함정 (코드 근거 있는 것만)

### F1. `**정답:**` — 필드가 증발하고 **거짓 원인**이 보고된다 ★최우선
정본 파서는 `decoration.ts` 를 안 쓴다. `정답 누락`·`빈칸원문 누락`이 나오는데 실제로는 장식 때문이다.
(`parser.ts:83, 91` / 프로브 E7·E8·P6-4 / 00-contract §8)

### F2. ★ 해설 줄머리의 원형숫자가 **선지로 오인**된다 — 이 유형 고유
선지 정규식이 `오답:` 앞 구간 **전체**를 훑는다(`parser.ts:77-81`). 해설을 여러 줄로 쓰면서
`② …` 로 줄을 시작하면 「선지 6개 (5개 필요)」. 해설은 **한 줄로**, 선지 지칭은 **문장 중간에서**(프로브 P6-5).

### F3. `settings:` 없이 재진술 정답을 쓰면 정답이 조용히 원문으로 바뀐다 ★
SOURCE_EXACT 가 기본값이고, 후처리는 정답 선지를 빈칸원문으로 **덮어쓴 뒤 경고만 남긴다**
(`blank-inference.ts:64-81`). 게이트도 품질검증기도 차단하지 않는다 — **유닛은 통과하고 문항만 죽는다.**
(프로브 P5)

### F4. `paraphraseAnswer` 를 켰는데 정답이 원문 축자면 차단된다
`blank-paraphrase-answer-not-transformed`(error, 비강등) — `paraphrase.ts:54-59`, 프로브 E13.
near-verbatim(한두 단어만 교체)도 `blank-paraphrase-answer-too-verbatim` 으로 잡힌다(`paraphrase.ts:60-66`).

### F5. 빈칸원문 축자 이탈 — 스냅 사거리 밖이면 즉사
4단어 미만이거나 머리·꼬리 2단어가 어긋나면 오토스냅이 포기한다(`parser.ts:605-608`, 프로브 E6b·E11).
**지문에서 복사해 붙여라.** 손으로 옮겨 적으면 관사·복수형 하나로 죽는다.

### F6. 문장을 통째로 삼키면 gate 는 통과하고 quality 가 문다
호스트 문장의 **88% 이상**을 빈칸으로 잡으면 `blank-span-sentence-swallow`(error, 비강등)
— `span-carve.ts:103-123`, 프로브 E12. `gateIssues` 는 0이라 원인이 안 보인다.

### F7. 빈칸 경계가 문법 지름길을 만든다 (seam 6종)
빈칸 **직전**에 접속사/관사(`a/an`), 빈칸 **직후**에 전치사/구두점/관계절 꼬리/정동사가 남았는데
그것이 선지 일부만 배제하면 전부 error 다(`seam.ts:223-327`).
→ **빈칸 경계는 "문법 슬롯이 모든 선지에 동일하게 열리는" 자리로 잡아라.**

### F8. 등위 나열의 머리를 뚫으면 문법만으로 풀린다
`_____, X, Y, and Z` 형태 → `blank-mid-coordinated-list-carve`(error) — `inference.ts:398-408`.
`such as/including/for example` 직후도 변형 모드에서 error(`inference.ts:410-416`).

### F9. 정답이 지문 다른 곳에 남아 있으면 누출
- 비변형 모드: 빈칸원문이 `passageWithBlank` 에 또 있으면 `blank-answer-residual-visible`(`inference.ts:245-256`)
- 변형 모드: 재진술 정답이 지문에 축자로 있으면 `blank-paraphrase-correct-residual-visible`(`inference.ts:263-275`)
→ **표적을 고를 때 그 표현(과 정답 표현)이 지문에 한 번만 등장하는지 확인하라.**

### F10. 부정-부정(DN)의 3중 함정
1. **ITEM `settings:` 로는 켜지지 않는다** — 중첩 경로라 무시된다(`dispatchers.ts:299-300`, 프로브 P4). 유닛 레벨 flat 으로 켜라.
2. 정답에 부정 기제가 없으면 `double-negative-no-option-negation`(error) — 프로브 P5.
3. **부정 오답 ≥1, 부정 선지 총 ≥2** 가 아니면 error(`inference.ts:645-671`). 부정어 유무만으로 정답이 드러나면 안 된다.
4. 다중 빈칸(≥2)에서는 리졸버가 DN 을 강제 false 로 만든다 — 조합형 킬러는 PARAPHRASE 로 설계하라.

### F11. 다중 빈칸 구분자 리터럴
` …… ` 이외의 구분자(`/`, `...`, `~`)를 쓰면 조합이 값 1개로 뭉쳐 **선지 5개 전부** 반려된다
(`parser.ts:117`, 프로브 P6-9). `…`(U+2026) **2개**다 — 마침표 6개가 아니다.

### F12. 다중 빈칸 라벨 축
- `(A)(B)(C)` **지문 등장 순서 고정**. 역전하면 「빈칸 라벨 순서 오류」(`parser.ts:370-375`, 프로브 P6-10).
- `(D)` 이상은 정규식 `[A-C]` 밖이라 **아예 파싱되지 않는다** → 개수 반려(프로브 P6-11).
- 두 빈칸 구간이 겹치면 「빈칸 구간이 겹침」(`parser.ts:390-400`). 후처리도 같은 조건으로 실패한다(`blank-inference.ts:171-183`).

### F13. 한 파일에 컨테이너 없이 문항을 붙이면 2번부터 조용히 사라진다
파서는 첫 매치만 취한다. 반드시 `<!-- ITEM n ... -->` 로 나눠라(`qgen-core.ts:57`, 프로브 E9).

### F14. ★ qbank 하네스가 `blankGranularity` 를 넘기지 않는다 — **단어 단위 빈칸이 오차단된다**
`canon.ts:175-179` 의 `qualityArgs` 는 `{ blankCount }` 만 넘긴다. `validateQuestionQuality` 가 읽는 키는
`blankInferenceBlankCount` / `blankInferenceParaphraseAnswer` / `blankInferenceGranularity` 다(`dispatcher.ts:64-68`).
결과:
- 단일 추상명사 빈칸(`simplicity` 등 `core.ts:374-376` 화이트리스트)이 변형 모드에서 **`blank-single-abstract-noun` error 로 차단**된다.
  라우트 경로에서는 `granularity="word"` 가 이 검사를 건너뛰므로 **같은 문항이 웹에서는 통과한다**(프로브 P6-1b 실증).
- `blank-target-too-small` 도 같은 이유로 발화하지만 SHIP-FIRST 강등 대상이라 warning 에 그친다(프로브 P6-1a).
→ **수리 전까지 qbank 에서는 `blankGranularity: "word"` 유닛을 만들지 마라.** 부록 B 참조.

### F15. 해설 언어 규약
한국어 합니다체만. 영어 인용은 반드시 따옴표 안.
비한글 CJK 혼입 → `explanation-foreign-script`(error), `steals다` 류 짜깁기 → `explanation-latin-jam`(error)
(`validators/explanation-foreign-text.ts:99-111`, 헌법 §5).

### F16. 해설이 원형숫자를 담화 단계 번호로 쓰면 error
`① 먼저 … ② 다음으로 …` 형태가 2회 이상이면 `blank-explanation-narrative-circled-numbering`(error, 비강등)
— `inference.ts:230-236`. **`먼저/이어서/따라서`** 를 쓰고 원형숫자는 선지 지칭에만 남겨라.

### F17. 오답이 지문 소재를 안 쓰면 KILLER·변형 모드에서 차단된다
`blank-weak-distractors` 는 매력 오답 0개일 때 error(비강등) — `inference.ts:522-545`.
오답 하나당 **지문 내용어 2개 재사용 / 정답과 내용어 1개 공유 / 부정 단서+내용어 1개** 중 하나는 반드시 만족시켜라.

---

## 8. 출제 포인트 다각화 축 — 한 지문에서 5~8문항 만들기

### 8-0. 이 유형의 구조적 이점과 제약 (설계 전에 먼저 계산하라)

**이점**: 빈칸은 `TYPE_CAP` 이 없는 유형이다(`plan.mjs:86-96`). 제목·주제처럼 "하나의 논지"로 수렴하지 않고
**지문의 서로 다른 자리를 지운다**. 티어별 목표는 S=8 / A=7 / B=6 / C·D=5 (`plan.mjs:66-72`).

**제약 5가지**:
1. `ANSWER_DUPLICATE` 가 **살아 있다** — 두 문항의 **정답 선지 텍스트**가 정규화 후 같으면 유닛 반려(`canon.ts:75-82`, `qgen-core.ts:346-363`). 어법과 달리 기계가 잡아 준다.
2. `POINT_DUPLICATE` — `point:` 값이 겹치면 반려.
3. 빈칸 표적은 **한 번만 등장하는 표현**이어야 한다(F9 누출 게이트).
4. 빈칸 경계가 문법 지름길을 만들면 안 된다(F7 seam 6종).
5. 코퍼스 하한 **97단어·4문장**(`unit-plan.json` calibration.빈칸추론). 5~8문항이면 **서로 다른 표적 자리 5~8개**를 먼저 뽑아야 한다.

### 8-1. 노브로 달라지는 축 (코드 근거)

| 축 | 설정 | 범위 | 효과 | 근거 |
|---|---|---|---|---|
| **빈칸 개수** | `blankCount` | 1 / 2 / 3 | 1=수능 표준 단일 / 2~3=조합형(인지 작업이 "한 자리 복원"→"여러 자리 동시 정합"으로 **질적으로 바뀐다**) | `shared.ts:32-36` |
| **정답 변형 모드** | `paraphraseAnswer` / `doubleNegative` | 3모드 | SOURCE_EXACT=원문 복원형(어휘 정확도) / PARAPHRASE=추상 재진술형(추론) / DOUBLE_NEGATIVE=부정 극성 함정형(킬러) | `dispatchers.ts:295-300` |
| **빈칸 단위** | `blankGranularity` | auto/word/phrase/clause | 표적 크기를 강제 → **선지 층위가 통째로 바뀐다**(단어 5개 vs 절 5개) | `blank-inference.ts:37-70` |
| **난이도** | `difficulty` | 3단 | KILLER 는 표적 12단어·90자 상한 + 즉사 오답 금지 + 매력 오답 필수 | `paraphrase.ts:113-125`, `inference.ts:532` |
| **포인트 집중** | `pointFocus` | bool | 정답 논리를 코어4로 좁힘(프롬프트 축, 게이트 무관) | `blank-point-catalog.ts:139-147` |

> **노브 조합만으로 형태가 다른 문항 6종**이 나온다:
> `1·SOURCE_EXACT` / `1·PARAPHRASE` / `1·DOUBLE_NEGATIVE` / `1·word단위` / `2빈칸·PARAPHRASE` / `3빈칸·SOURCE_EXACT`.
> 다만 이것은 **껍데기의 다양성**이다. 아래 8-2 가 본체다.
> **주의**: 현재 qbank 에서 `word` 단위는 F14 때문에 사용 금지, `doubleNegative` 는 유닛 레벨 flat 설정으로만 켜진다.

### 8-2. 설계로 달라지는 축 (교육적 판단 — 여기가 승부처)

#### 축 A — 정답이 완성하는 **추론 논리** (최우선)

기출 716문항 LLM 검증 분포(`blank-point-catalog.ts:43-132`). 유닛의 문항마다 **다른 논리**를 배정하라.

| 순위 | 코드 | 이름 | 점유 | 이 지문에 쓸 수 있는가 판정 기준 |
|---|---|---|---|---|
| 1 | `cause_effect_completion` | 인과·기제 채우기 | 23.7% | `Thus/therefore/as a result/because` 로 이어지는 **단일 기제의 직접 귀결**이 있는가 |
| 2 | `concept_labeling` | 추상 개념 명명 | 20.1% | 구체 정황만 묘사되고 그것을 부를 **상위 추상명사** 자리가 비어 있는가 |
| 3 | `restate_paraphrase` | 재진술·정의 환언 | 16.8% | `In other words/즉/동격 콜론`, `X is ___` 계사 정의문이 있는가 |
| 4 | `contrast_reversal` | 대조 전환 반대개념 | 14.4% | 역접 표지 **와** 의미 반전이 **동시에** 있는 자리인가 (표지만 있으면 대조 아님) |
| 5 | `global_thesis_completion` | 전체 주제문 완성 | 11.9% | 서두 두괄식/말미 결론이고 본문 전체가 그 근거인가 |
| 6 | `discourse_connector` | 담화 연결어 추론 | 5.9% | (A)(B) 연결어 쌍 — **다중 빈칸에서만** 자연스럽다 |
| 7 | `example_to_principle` | 예시→원리 일반화 | 5.2% | 사례가 2개 이상 병렬되고 같은 결론을 향하는가 |
| 8 | `analogy_mapping` | 유추 대응 사상 | 2.1% | `just as/similarly/like the ~` 명시적 비유가 있는가 |

- **1~4가 코어**(누적 75%). 5문항이면 코어4 + `global_thesis` 로 채우는 것이 기출 분포와 정합한다.
- ⚠ `concept_labeling` ↔ `restate_paraphrase` 는 가장 혼동된다: 재진술은 **빈칸 옆에 동의 표현이 이미 풀려 있는** 문장 단위 동치, 개념명명은 **구체 정황 → 상위 추상명사**의 수직 추상화다(`blank-point-catalog.ts:189`).

#### 축 B — 표적의 **논지 위치**
도입 통념 / 전환점 / 기제 설명 / 사례 / 귀결 / 결론 태도. §2-4 실물은 S1 → S2·S3 → S3·S4 → S4·S5 → S6·S7 로
지문을 왼쪽에서 오른쪽으로 **훑는다**. 같은 문장을 두 문항의 주근거로 쓰지 마라(`craft/00-AUTHORING.md §3`).

#### 축 C — 근거까지의 거리 (난이도의 실체)

| 근거 깊이 | 조작적 정의 | 난이도 | 프롬프트 근거 |
|---|---|---|---|
| 1문장 | 빈칸 문장 안 또는 바로 옆 문장의 재진술로 확인 | BASIC | `prompts.ts:44-47` |
| 2문장 | 인과 또는 대조로 **서로 다른 두 문장**을 이어야 도출 | INTERMEDIATE | `prompts.ts:48-51` |
| 2문장 이상·분산 | 논지가 수렴하는 자리 + 근거가 떨어진 자리에 흩어짐 + 표면 어휘 재사용 0 목표 | KILLER | `prompts.ts:52-56` |
| — | 인접 문장이 정답을 그대로 풀어 써 놓으면 **차단**(`blank-adjacent-conclusion-conflict`) | — | `inference.ts:338-344` |

#### 축 D — 오답 기제 팔레트 (문항마다 다른 4종)

프로덕션 프롬프트의 기제 4종(`prompts.ts:74-78`) — 헌법 §3 의 (L,F) 코드와 대응한다:

| 기제 | 정의 | 대응 (L,F) |
|---|---|---|
| **방향반대**(최매력) | 앞부분에 핵심어구를 실어 정답처럼 보이게 하고 뒷부분에서 논지를 뒤집음 | L1+F4 / L6+F4 |
| **도입부함정** | 논지 전환(however) **이전** 내용에 시야가 갇힌 학생이 고름 | L4+F5 |
| **범위확대/세부확대** | 지문 소재를 쓰되 말하지 않은 범위·해결책으로 확장 | L2+F3 |
| **근거없음(통념형)** | 그럴듯하지만 텍스트 근거 0 | L3+F2 |

**문항마다 이 4종의 배치를 바꿔라.** 예: 문항1은 방향반대를 ②에, 문항2는 ④에 — 그리고 각 기제가 **겨냥하는 문장**을 달리한다.
헌법 §3 운용규칙: 같은 F코드 2회까지, 3회부터 실격. 최강 미끼(L2/L4/L5) 1개 의무.

#### 축 E — 정답의 추상 층위
같은 표적이라도 정답을 **어느 층위로 올리는가**가 다르면 다른 인지 작업이다.
- 표면 재진술(동의어 교체) → BASIC
- 관계 재진술(인과 방향 명시) → INTERMEDIATE
- 상위 개념 번역(원문 핵심 명사·동사 재사용 0) → KILLER (`prompts.ts:55`)

#### 축 F — 선지 극성·형식
- 전 선지 긍정 / 정답만 부정(단, 부정 오답 ≥1 필수 — `inference.ts:588-600`) / DN 모드(부정 선지 ≥2)
- 선지 층위 통일: 빈칸이 병렬의 한 항목이면 다섯 선지 전부 그 문법 형식·의미 층위로(`prompts.ts:80`)
- 길이 ±3단어(`prompts.ts:84`), 불균형은 `blank-paraphrase-option-imbalance`(강등 warning)

#### 축 G — 정답 라벨 분산
qbank 는 셔플하지 않는다(§5-4). 5문항의 정답을 ①에 몰지 말고 ①~⑤에 퍼뜨려라 —
프로덕션 셔플이 어차피 섞더라도, 저작 편중은 **오답 설계를 자리별로 안 했다는 증거**다.

#### 축 H — 형태 변주 (유닛의 마지막 1~2문항)
5문항을 단일 빈칸으로 채운 뒤 6~8번째를 **다중 빈칸(2~3)**으로 만들면 인지 작업이 바뀐다 —
"한 자리 복원"에서 "여러 자리 동시 정합 + near-miss 검증"으로. 8문항 유닛(S/A 티어)에서 특히 유효하다.
단, 다중 빈칸은 `settings: {"blankCount": 2}` 를 ITEM 헤더에 넣어야 파서가 바뀐다(§3-0).

### 8-3. 유닛 설계 절차 (권장)

1. **표적 목록화** — 지문을 문장번호(S1…)로 쪼개고, 빈칸으로 뚫을 수 있는 구간을 전부 뽑는다(목표 8~12개).
   각 후보에 (추론 논리 코드 · 근거 문장 2곳 · 그 표현이 지문에 몇 번 등장하는지)를 붙인다.
   **2회 이상 등장하는 표현은 즉시 탈락**(F9).
2. **표적 배분표 작성** — 문항 수만큼 행을 만들고 (난이도 · 추론 논리 · 겨냥 문장 · 표적 구간 · 정답 층위 ·
   오답 기제 팔레트 · 예상 정답 라벨)을 **문항을 쓰기 전에** 채운다. 논리 중복·문장 중복이 여기서 드러난다.
3. **경계 검산** — 표적마다: 빈칸 직전이 접속사/관사인가? 직후가 전치사/구두점/관계절 꼬리인가?
   호스트 문장의 88%를 넘는가? 콤마를 가로지르는가? 등위 나열 머리인가? (§7 F6·F7·F8)
4. **모드 결정** — 문항별 `settings:` 를 먼저 확정한다. 재진술 정답이면 `{"paraphraseAnswer": true}` **필수**.
5. **문항 작성** — 빈칸원문은 **지문에서 복사**해 붙인다. 선지 5개는 같은 문법 슬롯·같은 층위·±3단어.
6. **해설 작성** — 근거 2문장을 인용해 잇고 정답 도출까지. **한 줄로**, 줄머리 원형숫자 금지, 평숫자·범위 지칭 금지.
   오답해설은 라벨마다 "왜 매력적인가 + 무엇이 틀렸는가 + 어느 문장이 배제하는가".
7. **프로브 실행** — `qbank/work/_probe-BLANK_INFERENCE.ts` 를 견본으로 gate/adapt/postprocess/quality/gateUnit 을 돌린다.

---

## 부록 A. 검증 기록

`qbank/work/_probe-BLANK_INFERENCE.ts` — `./node_modules/.bin/tsx qbank/work/_probe-BLANK_INFERENCE.ts`

```
75/75 통과
```

| 블록 | 내용 | 결과 |
|---|---|---|
| P1 | 리포 픽스처(다중 빈칸 2) gate 0 · adapt · postProcess | 2/2 |
| P2 | §2-4 단일 빈칸 골격 gate 0 · adapt · postProcess · quality error 0 · 어댑터/후처리 형상 | 6/6 |
| P3 | qbank 컨테이너 경유 `gateUnit` 5문항 blocking 0 · qualityBlocking 0 · ok | 5/5 |
| P3' | 다중 빈칸(blankCount 2) 유닛 blocking 0 · 산출 형상 | 3/3 |
| P4 | 노브 클램프·flat/nested 경로·DN 배타 규칙 | 8/8 |
| P5 | answerMode 3종의 산출 차이(SOURCE_EXACT 덮어쓰기 실증 포함) | 5/5 |
| E | 파서·게이트 날붙이 14종(장식·연접·스냅·문장삼킴·유닛 중복) | 16/16 |
| P6 | 정찰 추가 실측(granularity 결함·flat 병합·셔플·머리표 드리프트·해설 줄머리·다중 라벨/구분자·필드 형상) | 25/25 |
| **P7** | **★ 이 문서 §2-4 실물을 md 파일에서 직접 추출해 `gateUnit` 재검증** — blocking 0 · qualityBlocking 0 | 5/5 |

---

## 부록 B. ★ `qbank/harness/canon.ts` 결함 — **수리 필요**

### B-1. `qualityArgs` 키 오배선 (GRAMMAR_ERROR.md 부록 B-1 과 같은 뿌리)

```ts
// qbank/harness/canon.ts:175-179 (현재)
qualityArgs(ctx) {
  const c = readCounts(ctx.resolved);
  if (subType === "BLANK_INFERENCE") return { blankCount: c.blankCount };   // ← 무시되는 키
  return { markerCount: c.markerCount, answerCount: c.answerCount };
}
```

`validateQuestionQuality` 가 읽는 키는 `blankInferenceBlankCount` / `blankInferenceParaphraseAnswer` /
`blankInferenceGranularity` 다(`question-quality/dispatcher.ts:64-68, 776-777, 941-943`).

**실측 영향(프로브 P6-1·P6-12)**:
- 다중 빈칸 **라우팅은 무사하다** — 디스패처가 `question.blanks.length >= 2` 로도 분기하기 때문(`dispatcher.ts:979`).
- `blankInferenceParaphraseAnswer` 도 **사실상 무해** — `question.blankAnswerMode` 가 어댑터에서 이미 박혀 있고 검증기가 그것을 우선한다(`inference.ts:27-34`, `multi.ts:77-79`).
- ★ **`blankInferenceGranularity` 만 실손해**: `word` 단위 빈칸이 qbank 에서만 `blank-single-abstract-noun` error 로 차단된다(P6-1b 실증).

**수리 (라우트 `route.ts:1113-1122` + 프롬프트 경로와 정합하게):**
```ts
qualityArgs(ctx) {
  const c = readCounts(ctx.resolved);
  if (subType === "GRAMMAR_ERROR")
    return { grammarMarkerCount: c.markerCount, grammarAnswerCount: c.answerCount };
  return c.blankCount >= 2
    ? {
        blankInferenceBlankCount: c.blankCount,
        blankInferenceParaphraseAnswer: c.blankParaphrase,
      }
    : {
        blankInferenceGranularity:
          (ctx.resolved.blankInferenceGranularity as string) ?? "auto",
      };
}
```

### B-2. `diversityTargets` 는 작동하지만 **표적이 정답 선지 텍스트다**

```ts
// qbank/harness/canon.ts:75-82
const opts = structuredData.options;
const answer = structuredData.correctAnswer;
// → 정답 라벨과 같은 선지의 text 를 반환
```

라우트의 다양성 회피 목록은 **`originalExpression`(빈칸 표적)**을 쓴다(`route.ts:674-684`).
즉 하네스는 "같은 답을 두 번 묻는가"만 보고 **"같은 자리를 두 번 뚫었는가"는 보지 않는다.**

→ 같은 구간을 뚫고 정답 표현만 다르게 쓴 두 문항은 `ANSWER_DUPLICATE` 를 **통과한다.**
**표적 중복은 저작 에이전트가 표적 배분표(§8-3 절차 2)로 직접 방지해야 한다.**

권장 수리: 빈칸 분기의 반환값에 표적을 **함께** 넣는다.
```ts
// 빈칸: 정답 선지 텍스트 + 빈칸 표적(단일 originalExpression / 다중 blanks[].originalExpression)
```
