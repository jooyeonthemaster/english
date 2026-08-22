# 글의 순서 (SENTENCE_ORDER)

> **분류** 선택형(순열 5지선다) · **지문변형** ○ (분할·재배열, 단 축자 무손실) · **정답 머리표** `정답:` (원문자 ①~⑤) · **최소 지문** 약 80단어 / 7문장 (실무 하한 110단어 / 8문장)
>
> 정찰 근거: `src/lib/md-qgen/{parser-order,gate-order,gate-order-variant,adapter-order,lane-order,prompts-order}.ts` 직독 + `scripts/_test-md-order.ts` 픽스처 + `qbank/work/_probe-SENTENCE_ORDER.ts` tsx 실행 검증(전 골격 통과).
> 공유 계약은 [`../recon/00-contract.md`](../recon/00-contract.md), 품질 규범은 [`../quality-constitution.md`](../quality-constitution.md).

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

주어진 글(지문 맨 앞 1~2문장) 뒤에 이어질 **세 단락 (A)(B)(C) 의 배열**을 고르는 문항이다.
학생이 실제로 하는 일은 **이음매 세 곳**(주어진 글→첫 단락, 첫→둘째, 둘째→셋째)에서
"무엇이 무엇을 되받는가"를 판정하는 것이다. 판정 재료는 응집장치(cohesion device) —
지시사/대명사의 선행어, 연결사의 방향, 시간·절차의 진행, 어휘 사슬, 인과의 원인·결과 자리다.

**다른 유형과의 결정적 차이 두 가지:**

1. **정답이 지문 자체에서 결정론적으로 도출된다.** 다른 유형은 모델이 정답을 "고르지만", 이 유형의 정답은
   원문 순서 그 자체다. 게이트가 조각들의 원문 좌표를 정렬해 정답 순열을 **재도출**하고, 저작자가 적은
   `정답:` 과 대조한다(`gate-order.ts:359-361`). 즉 **정답을 틀리게 적을 자유가 없다.**
2. **문항의 실체는 선지가 아니라 절단선이다.** 선지 5개는 6가지 순열 중 5개를 고른 것이라 사실상 고정이고,
   설계 자유도는 전부 "지문을 어디서 자르는가 · 어느 조각에 어떤 라벨을 붙이는가"에 있다
   (`prompts-order.ts:8` "프롬프트의 중심은 선지 문구가 아니라 **절단선 설계**다").

**최강 불변식** — 이 한 줄이 모든 형식 계약을 함축한다(`parser-order.ts:6-9`):

```
주어진 글 + (원문 순서로 이어 붙인 세 단락) == 지문 전체
```

이것이 통과하면 축자 분할·비중첩·무손실·전량 커버가 동시에 증명된다. 이것이 깨지면 문항이 아니라 파본이다.

> ⚠ **후처리가 전혀 없다.** `SENTENCE_ORDER` 는 `PASSTHROUGH_TYPES` 다
> (`src/lib/question-postprocess/types.ts:68-69`). 어댑터 산출이 곧 최종 저장·인쇄 형상이며,
> 게이트에서 못 잡은 결함은 학생 화면과 시험지까지 그대로 간다.
> **선지 셔플도 없다** — `SHUFFLE_OPTION_TYPES` 에 이 유형이 없다(`src/lib/question-diversity.ts:508-521`).
> 정답 번호 위치는 **저작자가 결정하는 축**이다.

---

## 2. 마크다운 골격

### 2-1. 기본형 (prefixVariationCount = 0, 기본값)

```md
주어진글: <지문 맨 앞 1~2문장을 한 글자도 바꾸지 않고. 개행 없이 한 줄. 70단어 이하>
단락(A): <지문의 연속 구간 축자. 2문장 이상·24단어 이상. 개행 없이 한 줄>
단락(B): <지문의 연속 구간 축자. 2문장 이상·24단어 이상. 개행 없이 한 줄>
단락(C): <지문의 연속 구간 축자. 2문장 이상·24단어 이상. 개행 없이 한 줄>
① (A)-(C)-(B)
② (B)-(A)-(C)
③ (B)-(C)-(A)
④ (C)-(A)-(B)
⑤ (C)-(B)-(A)
정답: <①~⑤ 중 원문 순서와 일치하는 하나. (A)-(B)-(C) 금지>
해설: <한국어 2문장. 이음매마다 어떤 응집장치가 순서를 확정하는지 지목. 합니다체>
오답:
① <이 배열이 어느 이음매에서 왜 깨지는지 1문장>
② <〃>
④ <〃>
⑤ <〃>
```

- `오답:` 목록은 **정답 번호를 뺀 4개**만 적는다. 라벨은 선지 번호를 그대로 쓴다(오름차순 권장, 순서는 무관).
- 선지 5줄은 **순열 문자열만** 적는다. 근거·설명을 붙이면 그 줄이 정답을 흘리고 파서가 순열 해석에 실패한다.

### 2-2. 단락 변형형 (prefixVariationCount = N, 1~3)

라벨 순서대로 **앞에서 N개** 단락에만 축자 줄 바로 뒤에 변형 줄을 **한 줄 더** 붙인다(2단 출력).

```md
주어진글: <언제나 축자 — 어떤 설정에서도 변형 금지>
단락(A): <지문 축자 — 게이트가 이 줄로 무손실 분할·정답 순서를 검산한다>
단락(A,변형): <바로 위 줄의 첫 문장만 같은 뜻 다른 표현으로 1문장 재진술 + 2번째 문장부터는 위 줄과 한 글자도 다르지 않게 그대로>
단락(B): <지문 축자>
단락(B,변형): <〃>
단락(C): <지문 축자 — 변형 대상이 아니면 변형 줄을 만들지 마라>
① (A)-(C)-(B)
... (이하 기본형과 동일)
```

### 2-3. qbank 유닛 컨테이너 (md-qgen 계약이 아니라 **하네스 규약**)

한 `.md` = 한 유닛(지문 1 × 유형 1 × 문항 5~8). 하네스가 `<!-- ITEM n ... -->` 로 1문항씩 잘라 레인에 넣는다
(`qbank/harness/qgen-core.ts:47-99`). 잘라낸 **뒤의 본문만**이 md-qgen 계약 대상이다.

```md
<!-- ITEM 1
difficulty: KILLER
point: 참조 해소 — 'that argument' 의 선행어가 (C) 에만 있다
craft: ②는 인과 역전, ④는 선행어 부재로 near-miss
settings: {"prefixVariationCount":0}
-->
주어진글: ...
```

- `difficulty` 는 `BASIC|INTERMEDIATE|KILLER` (`qgen-core.ts:79-82`)
- `point` 누락 = 컨테이너 반려. 유닛 내 `point` 중복 = `POINT_DUPLICATE` 차단(`qgen-core.ts:325-333`)
- `settings` 는 그 문항의 유형 설정 오버라이드(JSON) — `{"prefixVariationCount":2}` 등

### 2-4. ★ 검증된 정상 픽스처 전문 — `scripts/_test-md-order-fixtures.ts` (mdOf() 기본값 = `GOOD`)

`scripts/_test-md-order.ts:62-63` 에서 `게이트: 정상 입력 클린` 으로 검증되는 실물이다.
지문은 `passageOf(GIVEN, P_B, P_C, P_A)` = 아래 네 조각을 **원문 순서(주어진 글→B→C→A)** 로 공백 하나로 이은 것.

```md
주어진글: In medieval manuscripts the margin was at first a purely practical space. Scribes used it to flag copying errors and to squeeze in words they had accidentally left out.
단락(A): Modern scholars now mine that layered record for evidence about who actually read a given book. A crowded margin can reveal a whole community of readers whose names appear in no catalogue at all.
단락(B): But this narrow role soon widened. Readers began to answer the text rather than merely correct it, and their remarks filled the space that copyists had once reserved for repairs.
단락(C): Later owners read those remarks and answered them in turn. Over several generations the margin therefore carried a slow conversation—each hand replying to a voice it had never met.
① (A)-(C)-(B)
② (B)-(A)-(C)
③ (B)-(C)-(A)
④ (C)-(A)-(B)
⑤ (C)-(B)-(A)
정답: ③
해설: 주어진 글의 오류 교정이라는 좁은 쓰임을 (B)의 첫 문장이 되받아 관행의 확장을 알립니다. (C)가 그 논평의 누적을 세대 단위로 잇고 (A)가 그 누적을 근거로 오늘날의 복원을 말하므로 순서가 하나로 확정됩니다.
오답:
① 지시 대상이 아직 등장하지 않아 첫 이음매부터 끊깁니다.
② 마지막 단락의 인과가 받을 대상이 없어 끝 이음매가 깨집니다.
④ 누적된 논평을 가리키는 표현이 그 논평보다 앞서 나옵니다.
⑤ 시간 진행이 거꾸로 놓여 세대 흐름이 어긋납니다.
```

**변형 2개 버전**(`mdOf({ variants: V2 })`, `prefixVariationCount: 2` — `_test-md-order.ts:164` 클린 검증):

```md
주어진글: In medieval manuscripts the margin was at first a purely practical space. Scribes used it to flag copying errors and to squeeze in words they had accidentally left out.
단락(A): Modern scholars now mine that layered record for evidence about who actually read a given book. A crowded margin can reveal a whole community of readers whose names appear in no catalogue at all.
단락(A,변형): Present-day scholars now dig through that layered record to learn who really opened a given book. A crowded margin can reveal a whole community of readers whose names appear in no catalogue at all.
단락(B): But this narrow role soon widened. Readers began to answer the text rather than merely correct it, and their remarks filled the space that copyists had once reserved for repairs.
단락(B,변형): Yet such a narrow use soon broadened. Readers began to answer the text rather than merely correct it, and their remarks filled the space that copyists had once reserved for repairs.
단락(C): Later owners read those remarks and answered them in turn. Over several generations the margin therefore carried a slow conversation—each hand replying to a voice it had never met.
① (A)-(C)-(B)
② (B)-(A)-(C)
③ (B)-(C)-(A)
④ (C)-(A)-(B)
⑤ (C)-(B)-(A)
정답: ③
해설: 주어진 글의 오류 교정이라는 좁은 쓰임을 (B)의 첫 문장이 되받아 관행의 확장을 알립니다. (C)가 그 논평의 누적을 세대 단위로 잇고 (A)가 그 누적을 근거로 오늘날의 복원을 말하므로 순서가 하나로 확정됩니다.
오답:
① 지시 대상이 아직 등장하지 않아 첫 이음매부터 끊깁니다.
② 마지막 단락의 인과가 받을 대상이 없어 끝 이음매가 깨집니다.
④ 누적된 논평을 가리키는 표현이 그 논평보다 앞서 나옵니다.
⑤ 시간 진행이 거꾸로 놓여 세대 흐름이 어긋납니다.
```

### 2-5. 신규 검증본 — `qbank/work/_probe-SENTENCE_ORDER.ts` (본 정찰이 새로 저작·통과시킨 실물)

픽스처 재사용이 아니라 **임의 지문에서 골격이 성립한다는 증명**이다.
`parse → autoSnap → gate → adapt → postProcess → validateQuestionQuality` 전 구간 통과(gateIssues 0 · quality error 0).

지문(111단어 / 8문장, 원문 순서 = 주어진 글 → B → C → A):
```
Early city planners treated noise as an unavoidable by-product of commerce. A workshop that woke a whole street was simply proof that the street was earning its keep. That tolerance ended when doctors began linking constant clatter to sleeplessness and heart strain. Councils answered with the first noise ordinances, which fined workshops for hammering after dark. Enforcement proved harder than drafting. Inspectors carried no instrument that could measure a complaint, so a magistrate had to decide whose ears counted as reasonable. The portable sound meter settled that argument in the 1930s by turning loudness into a number anyone could read. Noise complaints became measurable claims rather than quarrels between neighbours.
```

```md
주어진글: Early city planners treated noise as an unavoidable by-product of commerce. A workshop that woke a whole street was simply proof that the street was earning its keep.
단락(A): The portable sound meter settled that argument in the 1930s by turning loudness into a number anyone could read. Noise complaints became measurable claims rather than quarrels between neighbours.
단락(B): That tolerance ended when doctors began linking constant clatter to sleeplessness and heart strain. Councils answered with the first noise ordinances, which fined workshops for hammering after dark.
단락(C): Enforcement proved harder than drafting. Inspectors carried no instrument that could measure a complaint, so a magistrate had to decide whose ears counted as reasonable.
① (A)-(C)-(B)
② (B)-(A)-(C)
③ (B)-(C)-(A)
④ (C)-(A)-(B)
⑤ (C)-(B)-(A)
정답: ③
해설: 소음을 상업의 부산물로 용인하던 도입을 (B)의 첫 문장이 'That tolerance'로 되받아 규제의 등장으로 넘깁니다. (C)가 그 조례의 집행 난점을 잇고 (A)가 'that argument'로 그 다툼을 받아 계측기로 종결하므로 순서가 하나로 확정됩니다.
오답:
① (A)가 받을 '그 다툼'이 아직 제시되지 않아 첫 이음매부터 끊깁니다.
② 집행 난점을 다루는 (C)가 그 난점을 종결하는 (A)보다 뒤에 놓여 인과가 뒤집힙니다.
④ (C)의 'Enforcement'가 가리킬 조례가 아직 도입되지 않았습니다.
⑤ 계측기로 다툼이 끝난 뒤에 다시 다툼이 시작되어 시간 진행이 거꾸로 놓입니다.
```

계측: 주어진글 28단어/2문장 · (A) 30단어/2문장 · (B) 28단어/2문장 · (C) 25단어/2문장 (최대/최소 1.20 · given/avg 1.01).

변형 2개 버전(`prefixVariationCount: 2`, 동일하게 클린 통과)에서 추가되는 두 줄:

```md
단락(A,변형): That argument was settled in the 1930s by a portable meter that turned loudness into a number anyone could read. Noise complaints became measurable claims rather than quarrels between neighbours.
단락(B,변형): That easy tolerance ended once physicians tied the ceaseless clatter to lost sleep and strained hearts. Councils answered with the first noise ordinances, which fined workshops for hammering after dark.
```

---

## 3. 파서 계약 (★ 가장 중요)

파서 진입점: `parseMdSentenceOrder(text)` — `parser-order.ts:85-152`.
**정본 규약**: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게. 관대함은 **관용이지 계약이 아니다** —
아래 "정규 형식" 열을 그대로 쓰고 관용에 기대지 마라.

### 3-1. 줄 단위 문법

| # | 요소 | 정규식 / 리터럴 (원문) | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|
| P1 | 주어진 글 | `/^주어진\s*글\s*[:：]\s*(.+)$/m` · 폴백 `/^제시문\s*[:：]\s*(.+)$/m` | `parser-order.ts:87-88` | `given` 이 `""` → 게이트가 **즉시 return** `주어진 글 누락` (이후 검사 전부 미실행) |
| P2 | 단락(축자) 머리표 | `head = /^단락\s*[(（[]?\s*([ABCabc])\s*[)）\]]?\s*[:：]\s*/` | `parser-order.ts:92` | 한 줄이라도 못 잡으면 `단락 N개 (3개 필요)` 로 **즉시 return** |
| P3 | 단락 본문(한 줄 계약) | `new RegExp(head.source + "(.+)$", "gm")` — 3개 이상 매치되면 이 경로 확정 | `parser-order.ts:94-98` | 3개 미만이면 개행 폴백으로 떨어져 **뒤 라인을 삼킬** 위험 |
| P4 | 단락 본문(개행 폴백) | `head.source + "([\\s\\S]*?)" + stop` · `stop = "(?=^단락\\s*[(（[]?\\s*[ABCabc]\|^[①②③④⑤]\|^정답\\s*[:：]\|^해설\\s*[:：]\|$(?![\\s\\S]))"` | `parser-order.ts:93,98` | 폴백 경로는 여러 줄을 **공백 하나로 접는다**(`.replace(/\s+/g," ")`) |
| P5 | 라벨 정규화 | `` label = `(${m[1].toUpperCase()})` `` | `parser-order.ts:101` | 소문자 `(a)` 도 `(A)` 로 승격된다(라벨 축은 언제나 대문자 3종) |
| P6 | 본문 정규화 | `m[2].replace(/\s+/g, " ").trim()` | `parser-order.ts:102` | 저장 형상은 **항상 한 줄** — 단락 안에 개행을 넣어도 접힌다 |
| P7 | 변형 머리표 | `varHead = /^단락\s*[(（[]?\s*([ABCabc])\s*[)）\]]?\s*[,，、]?\s*[(（[]?\s*변형\s*[)）\]]?\s*[:：]\s*/` | `parser-order.ts:107-108` | P2 와 **상호 배타**(라벨과 콜론 사이 `변형` 유무). 오타 나면 변형 줄이 축자 줄로 오인되어 라벨 4개가 된다 |
| P8 | 변형 본문 개행 흡수 | 한 줄 포획이 `/[.!?]["'”’)\]]*$/` 로 끝나지 **않고** 다줄 포획이 그 접두면 다줄 채택 | `parser-order.ts:117-126` | 문장이 완결된 한 줄은 확장하지 않는다(뒤 라인 삼킴 방지) |
| P9 | 정답 | `/^정답\s*[:：]\s*([①②③④⑤])/m` — **첫 매치만** | `parser-order.ts:129` | 못 잡으면 `answer=""` → `정답 누락` |
| P10 | 선지 줄 | `optionLine = /^([①②③④⑤])\s*(.+)$/gm` — 적용 대상은 `text.split(/^오답\s*[:：]/m)[0]` | `parser-order.ts:128,130-135` | `오답:` 이 없으면 오답해설 4줄이 **선지로 흡수**되어 `선지 9개` |
| P11 | 순열 해석 | `/[（([]\s*([ABC])\s*[）)\]]/g` (3개·중복 없음·A B C 전부) · 실패 시 `/\b([ABC])\b/g` 폴백 | `parser-order.ts:62-73` | 해석 실패 시 `order=[]` → `선지 X 가 (A)(B)(C) 순열이 아님` |
| P12 | 오답 섹션 | `text.split(/^오답\s*[:：]\s*$/m)[1] ?? text.split(/^오답\s*[:：]/m)[1]` | `parser-order.ts:137-138` | `오답:` 뒤에 같은 줄로 내용을 쓰면 첫 항목이 잘릴 수 있다 → **`오답:` 은 단독 줄** |
| P13 | 오답 항목 | `optionLine` 재사용 + `.filter(w => w.label !== answer)` | `parser-order.ts:143-145` | 오답 목록에 정답 번호를 끼우면 **조용히 제거**된다(게이트 #12 가 집합으로 잡는다) |
| P14 | 해설 | `/^해설\s*[:：]\s*([\s\S]*?)(?=^오답\s*[:：])/m` · 폴백 `/^해설\s*[:：]\s*([\s\S]+)$/m` | `parser-order.ts:147-150` | 못 잡으면 `해설 누락` |

### 3-2. 공백·문자 민감성

- **머리표 앞에 어떤 문자도 오면 안 된다.** 전 정규식이 `^`(multiline) 앵커다. `## 주어진글:` · `- ③ ...` ·
  `**정답: ③**` 은 전부 매치 실패다(프로브 실증: §7-1).
- `parser-order.ts` 는 **`decoration.ts` 를 import 하지 않는다.** 굵게·헤딩·불릿·인용·표 파이프·백틱 흡수가
  **하나도 없다.** → **장식 0.**
- 콜론은 반각 `:` 와 전각 `：` 둘 다 허용(`[:：]`). 정규 형식은 반각.
- 머리표 안의 공백은 `\s*` 로 흡수되지만(`단락 (A) ：`), 정규 형식은 `단락(A):` 다.
- 라벨 괄호는 `( （ [` / `) ） ]` 를 흡수하고, 아예 없어도 된다(`단락A:`). 정규 형식은 반각 소괄호.

### 3-3. 라벨 축 (자리마다 다르다)

| 자리 | 축 | 근거 |
|---|---|---|
| 단락 머리표 · 선지 순열 문자열 | `(A)` `(B)` `(C)` 리터럴 | `parser-order.ts:57` `ORDER_LABELS` |
| 학생 표면 선지 번호 | 원문자 `①②③④⑤` **정확히 5개, 이 순서** | `gate-order.ts:51,344-346` |
| `정답:` 값 | 원문자 `①~⑤` | `parser-order.ts:129` |
| 저장 선지 라벨 | `"1"`~`"5"` (`digitOptionLabel`) | `adapter-order.ts:79` |
| 저장 `paragraphs[].label` | **리터럴 `"(A)"/"(B)"/"(C)"`** — 다르면 화면은 멀쩡한데 인쇄물만 깨진다 | `adapter-order.ts:17-21` |
| 진단 키 | 주어진 글 = 문자열 `"주어진 글"` | `parser-order.ts:59` `GIVEN_KEY` |

### 3-4. 첫 매치 규칙 · 1문서 1문항

`정답:` `해설:` `주어진글:` 은 전부 **첫 매치만** 취한다. 한 파일에 2문항 이상을 넣으면 뒤 문항이
조용히 사라지거나 앞 문항을 오염시킨다(`00-contract.md` §3). 유닛 파일은 반드시 `<!-- ITEM n -->` 로 자른다.

### 3-5. 0원 자동 보정 (autoSnap) — 별도 `snap-order.ts` 파일은 **없다**

`autoSnapOrderChunks(q, passage)` 가 `parser-order.ts:345-415` 안에 있다. 보정 2종:

1. **단락 제시 순서 정렬** — 라벨이 (A)(B)(C) 가 아닌 순서로 제시되면 라벨 기준 정렬(`:351-360`).
   변형 줄도 같은 축으로 함께 정렬(`:364-372`).
2. **구두점 드리프트 복원** — fold(alnum+공백)로 자리를 찾은 뒤 **원문 문자 그대로 재적재**
   (곱슬따옴표·em-dash·말줄임을 곧은 문자로 바꿔 적은 실측 패턴)(`:374-409`).
   축자 줄을 보정하면 같은 라벨 변형 줄의 **꼬리**도 같은 축으로 옮긴다(`:396-407`).

**보수 가드**: 단어 수준 재작성은 fold 단계에서 자리를 못 찾아 **보정되지 않고 게이트로 간다**
(`_test-md-order.ts:246-250`). 스냅에 기대지 마라 — 처음부터 원문 문자를 그대로 옮겨라.

### 3-6. 축자 대조의 두 축 (fold vs normalizeWs)

| 축 | 무엇을 무시하는가 | 쓰는 곳 |
|---|---|---|
| `foldForOrderMatch` | 구두점 **전부** + 대소문자 (alnum+단일공백만 남김) | 조각 위치 확정 · 무손실 분할 판정(#6) — `parser-order.ts:162-187` |
| `normalizeWs` | 곱슬따옴표→곧은따옴표 · en/em dash→`-` · `…`→`...` · 공백 축약 **만** | 최종 재구성 대조(#13) — `parser.ts:67-74`, `gate-order.ts:427-430` |

→ 단어를 고치면 #6 에서, 구두점을 고치면 #13 에서 잡힌다. **원문 문자를 그대로 옮기는 것 외에 방법이 없다.**

---

## 4. 게이트 체크리스트

진입점 `gateMdSentenceOrder(q, passage, {prefixVariationCount?, requireWrong?})` — `gate-order.ts:192-434`.
레인이 여기에 `teacherPointIssues` 를 더한다(`lane-order.ts:141-147`). **빈 배열 = 클린.**

> #1~#3 은 **즉시 return** 이다 — 하나 걸리면 나머지 진단이 아예 나오지 않는다.

### 4-1. 축자 축 (언제나 집행)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `단락 {n}개 (3개 필요)` | `paragraphs.length !== 3` — **즉시 return** | `gate-order.ts:202` |
| `단락 라벨이 (A)(B)(C) 순서가 아님 — 실제 {labelRun\|없음}` | 라벨 연결이 `(A)(B)(C)` 가 아님 — **즉시 return** | `gate-order.ts:204` |
| `주어진 글 누락` | `!q.given` — **즉시 return** | `gate-order.ts:205` |
| `주어진 글이 {n}문장 (1~2문장이어야 함)` | `countDisplaySentences < 1 \|\| > 2` | `gate-order.ts:175-177` |
| `주어진 글이 {n}단어 (70단어 이하여야 함)` | `countWords > 70` | `gate-order.ts:178-180` |
| `주어진 글에 단락 라벨 {X} 포함` | `/[（([]\s*[ABC]\s*[）)\]]/gi` 매치 + 인접문자·직접인용 면제 통과 | `gate-order.ts:89,212-213` |
| `단락 {L} 본문 누락` | `!p.text` | `gate-order.ts:219-220` |
| `{key} 앞에 순서 번호가 붙어 정답 순서가 노출됨` | `^\s*[0-9]{1,2}(?![0-9])\s*[.)·]\s*(?=[A-Za-z])` 또는 `^\s*(?:[①-⑳]\|[([][0-9]{1,2}[)\]])\s*[.)·]?\s*(?=[A-Za-z])` | `gate-order.ts:149-150,160-162` |
| `{key}에 구조 라벨 {X} 가 재등장` | 본문에 `(A)`·`[a]`·`Ⓐ` 등(`/(?:[（(]\s*[ABC]\s*[）)]\|[［[]\s*[ABC]\s*[］\]]\|[ⒶⒷⒸⓐⓑⓒ])/giu`), 인접문자·직접인용 면제 | `gate-order.ts:81,163-165` |
| `단락 {L} 이 {n}문장 ({min}문장 이상 필요)` | `min = (지문문장수-1 >= 6) ? 2 : 1` | `gate-order.ts:231-240` |
| `단락 {L} 이 {n}단어 ({min}단어 이상 필요)` | `budget = 지문단어수-12`; `min = budget>=72 ? 24 : max(8, floor(budget/6))` | `gate-order.ts:233-243` |
| `단락 분량 불균형 ({a/b/c}단어 — 최대/최소 1.9 이하 필요)` | `max/min > 1.9` | `gate-order.ts:249-252` |
| `주어진 글({n}단어)이 단락 평균({m}단어) 대비 너무 김` | `given/avg > 1.3` | `gate-order.ts:253-256` |
| `{key} 이(가) 지문 축자 분할이 아님 — 원문에서 그대로 찾을 수 없음(단어를 고쳐 썼거나 문장을 합침)` | fold 대조로 조각을 원문에서 못 찾음 | `gate-order.ts:265` |
| `주어진 글이 지문 맨 앞 조각이 아님 — 원문 순서상 {X} 이(가) 앞선다` | 정렬 후 첫 조각이 주어진 글이 아님 | `gate-order.ts:272` |
| `지문 앞부분 {n}단어가 어느 조각에도 실리지 않음` | 첫 조각 시작 > 0 | `gate-order.ts:274` |
| `{X} 와 {Y} 가 원문의 같은 구간을 중복 사용` | 스팬 중첩 | `gate-order.ts:280` |
| `{X} 와 {Y} 사이 원문 {n}단어 유실` | 스팬 사이 간격 > 1 | `gate-order.ts:283` |
| `지문 끝 {n}단어가 어느 조각에도 실리지 않음 — 지문 전체를 네 조각으로 나눠야 한다` | 마지막 조각 뒤 잔여 토큰 | `gate-order.ts:288` |
| `{X} 와 {Y} 의 경계가 문장 경계가 아님 — 이음매 '{seam}' 에 문장 종결부호가 없다. 절단은 마침표 뒤에서만 하라` | 이음매 원문 문자열에 `[.!?]` 없음 | `gate-order.ts:303-307` |
| `{X} 이(가) 약어 '{abbr}.' 에서 끝남 — 그 마침표는 문장 끝이 아니다...` | 이음매 마침표 앞 토큰이 `mr mrs ms dr prof rev gen sen rep gov col lt sgt capt fig vol vs cf viz e.g i.e` | `gate-order.ts:143-146,311-318` |
| `{X} 이(가) 소문자 '{opener}' 로 시작 — 문장 한가운데를 잘랐다. 절단은 문장 경계에서만 하라` | 조각 첫 알파벳이 소문자 + 면제식 `^(?:[a-z]+[A-Z]\|(von\|van\|de\|…)\s+[A-Z])` 불통과 | `gate-order.ts:132-136,321-327` |
| `선지 {n}개 (5개 필요)` | `options.length !== 5` | `gate-order.ts:333` |
| `선지 {L} 가 (A)(B)(C) 순열이 아님: '{text}'` | 순열 해석 실패 | `gate-order.ts:337` |
| `선지 순열 중복: {perm}` | 같은 순열 2회 | `gate-order.ts:341` |
| `선지 번호가 ①~⑤ 순서가 아님` | 라벨 연결 ≠ `①②③④⑤` 접두 | `gate-order.ts:344-346` |
| `정답 누락` | `!q.answer` | `gate-order.ts:350` |
| `정답 라벨({X})이 선지에 없음` | 정답 라벨의 선지 부재 | `gate-order.ts:351` |
| `정답 선지가 유효한 순열이 아님` | 정답 선지 order 길이 ≠ 3 | `gate-order.ts:352` |
| `정답이 표시 순서 (A)-(B)-(C) — 라벨을 섞어 재배치하라` | 정답 순열 == `(A)-(B)-(C)` | `gate-order.ts:356` |
| `정답 불일치 — 원문 순서는 {derived} 인데 정답은 {claimed} 로 표시됨` | 원문 좌표에서 도출한 순열 ≠ 표기 정답 | `gate-order.ts:359-361` |
| `단락 {L} 이 '{marker}' 로 시작해 첫 자리 후보에서 공짜로 소거됨 — 절단 위치를 옮겨 첫 문장을 자립화하라` | 정답 첫 단락을 뺀 단락이 미해소 연결사/지시 명사구로 시작 | `gate-order.ts:59-72,368-373` |
| `해설 누락` | `!q.explanation` | `gate-order.ts:400` |
| `오답해설 라벨 중복: {X} — 선지마다 정확히 한 줄씩 써라` | 중복 라벨 | `gate-order.ts:405` |
| `오답해설에 선지에 없는 라벨: {X}` | 선지 밖 라벨 | `gate-order.ts:407` |
| `오답해설 {n}개 ({m}개 필요)` | 정답 확정 시에만 · `need = 선지 - 정답` | `gate-order.ts:413-415` |
| `오답해설 누락 라벨: {X}` | 〃 | `gate-order.ts:417` |
| `오답해설에 정답 번호 포함` | 〃 | `gate-order.ts:418` |
| `재구성 결과가 원문과 구두점 수준에서 어긋남 — 원문 문장부호를 그대로 옮겨라` | `normalizeWs(given+원문순서단락) !== normalizeWs(passage)` | `gate-order.ts:425-431` |

### 4-2. 단락 변형 축 (`prefixVariationCount > 0` 일 때만)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `단락 변형 설정이 꺼져 있는데 변형본 줄이 출력됨: {labels}` | variation=0 인데 변형 줄 존재 | `gate-order.ts:384` |
| `단락 변형 설정({n}개)인데 '단락(A,변형):' 줄이 없음` | 변형 줄 0개 | `gate-order.ts:385` |
| `단락 변형본 라벨이 {need} 가 아님 — 실제 {got} (라벨 순서대로 앞에서 {n}개 단락에만 붙인다)` | 라벨 집합·순서 불일치 | `gate-order.ts:386` |
| `단락 {L} 변형본: 축자 단락이 1문장이라 '첫 문장만 재진술'이 성립하지 않음` | 축자 단락에 tail 없음 | `gate-order-variant.ts:245` |
| `단락 {L} 변형본의 2번째 문장 이후가 축자와 다름 — 첫 문장만 재진술하고 나머지 문장은 '단락{L}:' 줄을 한 글자도 바꾸지 말고 이어 붙여라` | `normalizeWs(변형).endsWith(normalizeWs(축자tail))` 실패 | `gate-order-variant.ts:250` |
| `단락 {L} 변형본에 재진술된 첫 문장이 없음 — 축자 본문을 그대로 옮겨 적었다` | head 부분이 빈 문자열 | `gate-order-variant.ts:255` |
| `단락 {L} 변형본 첫 문장에 영어 단어가 없음 — 지문과 같은 언어로 재진술하라` | `countWords(varHead) === 0` | `gate-order-variant.ts:260` |
| `단락 {L} 변형본 첫 문장에 한글이 섞임 — 지문과 같은 언어(영어)로만 재진술하라` | `/[ᄀ-ᇿ㄰-㆏가-힯]/` | `gate-order-variant.ts:181,265` |
| `단락 {L} 변형본이 첫 문장 하나를 {n}문장으로 늘림 — 변형본의 첫 문장은 1문장이어야 한다` | `splitOrderFirstSentence(varHead).tail` 존재 | `gate-order-variant.ts:271-273` |
| `단락 {L} 변형본 첫 문장이 종결부호로 끝나지 않음 — 마침표를 빠뜨리면 표시면에서 뒷문장과 한 문장으로 붙는다` | `/[.!?]["'”’)\]]*$/` 불통과 | `gate-order-variant.ts:182,276-277` |
| `단락 {L} 변형본 첫 문장에 새 표현이 없음 — 축자를 그대로 옮기면 암기 무력화 효과가 없다` | `orderAddedTokenCount === 0` | `gate-order-variant.ts:281-282` |
| `단락 {L} 변형본 첫 문장이 축자 첫 문장을 통째로 품고 있음 — 앞뒤에 말을 덧붙이는 것은 재진술이 아니다` | `varFold.includes(srcFold)` | `gate-order-variant.ts:285-286` |
| `단락 {L} 변형본 첫 문장이 지문 축자 구간을 그대로 옮겨 옴 — 자기 문장으로 다시 써라` | `foldedPassage.includes(varFold)` | `gate-order-variant.ts:289-290` |
| `단락 {L} 변형본 첫 문장 분량 이탈 ({n}단어 vs 축자 {m}단어 — 0.6~1.7배 안에서 재진술하라)` | 비율 이탈 | `gate-order-variant.ts:180,292-293` |
| `단락 {L} 변형본에서 위치를 결정하는 응집 단서({cues})가 모두 사라짐 — 최소 하나는 종류와 방향을 그대로 둔 채…` | 축자에 단서가 있었는데 변형본 단서 0개 | `gate-order-variant.ts:304-307` |
| `단락 {L} 변형본이 단서의 **방향**을 뒤집음 ({from → to}) — 종류만 같고 방향이 반대면 표시면이 정답 키와 반대 순서를 지시한다` | `orderFlippedCue` (`시간·순서(후행)↔(선행)` 등) | `gate-order-variant.ts:165-176,309-311` |
| `단락 {L} 변형본의 지시 대상이 앞 조각이 아니라 {X} 쪽으로 옮겨감 — 되받는 선행어는 축자와 같은 것을 가리켜야 한다(다른 배열도 성립해 복수정답이 된다)` | `anchorRelocation` | `gate-order-variant.ts:198-223,313-315` |
| `단락 {L} 변형본이 축자 첫 문장과 내용상 이어지지 않음 (공통 내용어 {n}개 — {m}개 이상 필요)…` | `minShared = srcStems.size>=8 ? 2 : 1` | `gate-order-variant.ts:320-324` |
| `단락 {L} 변형본이 앞 조각과 이어 주던 어휘 사슬({stems})을 전부 지움 — 이 문장에는 연결사도 지시사도 없어 그 사슬이 유일한 자리 근거다` | 단서 0개 첫 문장에서만 | `gate-order-variant.ts:331-342` |
| `단락 {L} 변형본이 자기 축자 첫 문장보다 단락 {X} 과(와) 훨씬 더 겹침 (공통 내용어 {n}개 vs {m}개) — 재진술 대상은 그 단락 자신의 첫 문장이다` | `closest.n>=3 && closest.n>=shared+2` | `gate-order-variant.ts:346-351` |
| `표시면 기준 단락 {L} 이 {n}문장 (2문장 이상 필요) — 학생이 보는 것은 변형본이다` | 표시면 재집행 | `gate-order-variant.ts:371-373` |
| `표시면 기준 단락 {L} 이 {n}단어 (24단어 이상 필요) — 재진술로 줄이지 마라` | 〃 | `gate-order-variant.ts:374-376` |
| `표시면 기준 단락 분량 불균형 ({a/b/c}단어 — 최대/최소 1.9 이하 필요)…` | 〃 | `gate-order-variant.ts:378-381` |

> ★ 변형이 켜져도 **정답 키 축(#1~#3·#6·#6-b·#8·#13)은 전부 축자 줄로 그대로 돈다.**
> 반면 #4·#5·#10 은 **표시면(변형본)** 기준으로 한 번 더 집행된다(`gate-order.ts:388-394`).

### 4-3. 교사 지정 포인트 축 (`ctx.teacherPoints` 가 있을 때만)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `교사 지정 문장이 변형 대상 단락의 첫 문장이라 학생 표시면에서 사라짐: '{...}' — 절단선을 옮겨…` | 축자 이음매에는 있는데 표시면에는 없음 | `lane-order.ts:79` |
| `교사 지정 문장이 주어진 글·단락 경계 어디에도 없음: '{...}'` | 주어진 글 포함도, 어떤 단락의 시작/끝도 아님 | `lane-order.ts:80` |

### 4-4. qbank 하네스 추가 축 (프로덕션에는 없다)

`qgen-core.ts` 는 `validateQuestionQuality` 의 error 도 **차단**한다(`qualityBlocking`). 이 유형에서 실제로 발화하는 것:

| 코드 | 조건 | file:line |
|---|---|---|
| `sentence-order-paragraph-too-short` | 단락 < **2문장** (지문 길이 완화 **없음**) | `validators/sentence-order.ts:158-163` |
| `sentence-order-paragraph-too-thin` | 단락 < **24단어** (완화 없음) | `validators/sentence-order.ts:165-170` |
| `sentence-order-dependent-fragment` | 조각 안에 종속절 단독 문장 | `validators/sentence-order.ts:116-122` |
| `explanation-quoted-token-missing` | 해설·오답해설이 따옴표로 인용한 **영어 12자 이상 조각**이 지문·문항 표면에 실재하지 않음 | `validators/explanation-quoted-tokens.ts:37-38,143-151` |
| `sentence-order-paragraph-not-source-backed` | 단락이 원문 축자가 아님 — **variation>0 이면 설계상 필연이라 레인이 걸러낸다** | `lane-order.ts:197-200` |

→ **md 게이트는 짧은 지문에 하한을 완화하지만 품질 검증기는 완화하지 않는다.**
프로브 실증: 30단어/4문장 지문은 md 게이트 2건 + 품질 error `sentence-order-paragraph-too-short` / `-too-thin`.

---

## 5. adapter 산출 필드

`adaptMdSentenceOrderToAiQuestion(q, passage, difficulty, paragraphMode)` — `adapter-order.ts:38-120`.
후처리가 없으므로 **여기가 최종 저장 형상**이다.

| 키 | 값 | 근거 |
|---|---|---|
| `direction` | `"주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?"` (stemLanguage=en 이면 `"Which is the most appropriate order of the paragraphs following the given passage?"`) | `adapter-order.ts:35-36` · `lane-order.ts:37-38,163` |
| **`givenSentence`** | 주어진 글 — **어떤 모드에서도 지문 축자** | `adapter-order.ts:107` |
| **`paragraphs[]`** | `{label:"(A)"\|"(B)"\|"(C)", text}` — 라벨은 **리터럴 고정**. variation>0 이면 변형본이 있는 라벨만 변형본 텍스트 | `adapter-order.ts:69-73`, `parser-order.ts:275-278` |
| `options[]` | `{label:"1"~"5", text:"(B)-(C)-(A)"}` — 텍스트는 모델 원문이 아니라 **파싱된 순열에서 결정론 재조립** | `adapter-order.ts:78-81` |
| `correctAnswer` | `"1"~"5"` (`digitOptionLabel(q.answer)`) | `adapter-order.ts:110` |
| `wrongOptionExplanations` | 어댑터에서는 `[{label:"1", explanation}]` 배열 → 후처리가 `Record<"1"\|…, string>` 으로 정규화 | `adapter-order.ts:95-101` · `_test-md-order.ts:274-275` |
| `explanation` | 한국어 해설 원문 | `adapter-order.ts:112` |
| `keyPoints` | **항상 `[]`** — 합성 금지 | `adapter-order.ts:113-115` |
| `tags` | `[]` | `adapter-order.ts:116` |
| `difficulty` | `ctx.rawDifficulty` 그대로 | `adapter-order.ts:117` |

**이 유형에만 있는 필드**: `givenSentence` · `paragraphs[]`(라벨 리터럴 `(A)(B)(C)`).
**절대 흘리면 안 되는 이물 필드**: `blanks` · `passageWithBlank` · `passageWithMarkers` · `originalExpression`
— `validators/misc.ts` 의 `type-foreign-field` 로 찍힌다(`adapter-order.ts:22-23`).

**어댑터 자체 반려**(게이트를 통과해도 여기서 죽는 경우): 단락 3개 아님 / 라벨 순서 아님 /
선지 5개·순열 아님 / 정답 라벨 선지 밖 / 주어진 글 누락 / 단락 본문 누락 / **오답해설 라벨 중복**
(`adapter-order.ts:51-94`).

**직렬화·인쇄 왕복**: `buildGeneratedQuestionText` 가 `[주어진 문장] {given}` + `(A) {본문}` 줄을 만들고
(`src/lib/question-generation-persistence.ts:102`), DOCX 역파싱이 그것을 다시 쪼갠다
(`src/components/exams/paper-builder/question-body-layout.ts:286` `sentenceOrderSegmentsFromQuestionText`).
라벨 리터럴이 어긋나면 **화면은 멀쩡한데 인쇄물만 깨진다**.

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `SENTENCE_ORDER.prefixVariationCount` | number | `0` | `0~3` (`Math.min/max` + 반올림) | **★ 유일하게 md 형상을 바꾸는 노브.** N개면 `단락(A,변형):`…`단락(C,변형):` 줄이 라벨 순서대로 앞에서 N개 추가된다. 게이트 #11 + 변형 전용 19종 + 표시면 재집행이 켜진다 |
| `SENTENCE_ORDER.pointFocus` | boolean | `false` | — | md 형상 무변경. 프롬프트 extras 에 응집장치 코어 3종 가이드 주입(`lane-order.ts:119-124`) |
| `SENTENCE_ORDER.stemLanguage` | `"ko"\|"en"` | `"ko"` | — | md 형상 무변경. 어댑터가 `direction` 을 영어로 교체(`lane-order.ts:158-164`) |
| `SENTENCE_ORDER.optionLanguage` | `"ko"\|"en"` | `"en"` | — | md 형상 무변경. `qualityArgs` 로만 전달(`lane-order.ts:171-175`) |
| `difficulty` | `BASIC\|INTERMEDIATE\|KILLER` | — | — | md 형상 무변경. 프롬프트 절단선 설계 지시만 3분기(`prompts-order.ts:56-73`). **게이트는 난이도로 완화되지 않는다** |
| `teacherPoints` | `{text, unit}[]` | `[]` | — | md 형상 무변경. 지정 문장이 주어진 글 안 또는 어떤 단락의 시작/끝에 와야 한다(`lane-order.ts:58-84`) |
| `variantIndex` / `variantCount` | number | `0` / `1` | — | md 형상 무변경. pointFocus + diversityEnabled 시 코어 응집장치를 회전 지정(`sentence-order-point-catalog.ts:162-171`) |

관련 상수: `SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MIN/MAX/DEFAULT = 0/3/0`
(`question-type-generation-settings/shared.ts:26,28,30`) ·
`clampOrderMdPrefixVariationCount` (`prompts-order.ts:33-40`) ·
`isEligible` 은 0~3 전 범위를 승차시킨다(`lane-order.ts:95-108`).

**형식 고정 상수** (노브가 아니다 — 바꿀 수 없다):
`paragraphCount = 3` · `optionCount = 5` (`lane-order.ts:185-186`) ·
주어진 글 1~2문장/70단어 이하 · 단락 2문장/24단어 이상 · 단락 비 1.9 이하 · given/avg 1.3 이하.

---

## 7. 함정 (전부 코드 근거 또는 프로브 실증)

**7-1. 장식은 이 유형에서 100% 치명이다** — `parser-order.ts` 는 `decoration.ts` 를 import 하지 않는다.
프로브 실증(`qbank/work/_probe-SENTENCE_ORDER.ts` 함정 실증 블록):

| 저작 실수 | 실제 반려 |
|---|---|
| `**정답: ③**` | `정답 누락` (거짓 원인) |
| `## 주어진글: …` | `주어진 글 누락` (즉시 return — 다른 진단 전멸) |
| `- ③ (B)-(C)-(A)` | `선지 4개 (5개 필요)` + `선지 번호가 ①~⑤ 순서가 아님` + `정답 라벨(③)이 선지에 없음` |
| `모범답안: ③` (서술형 머리표 오용) | `정답 누락` |

**7-2. `오답:` 머리표를 빠뜨리면 오답해설 4줄이 선지로 흡수된다.**
파서가 `beforeWrong = text.split(/^오답\s*[:：]/m)[0]` 로 선지를 뽑기 때문(`parser-order.ts:128,131`).
프로브 실증: `선지 9개 (5개 필요)` + `선지 ① 가 (A)(B)(C) 순열이 아님: '(A)가 받을…'` 4건 + `오답해설 0개 (8개 필요)`.
→ **`오답:` 은 반드시 단독 줄로 존재해야 한다.**

**7-3. 절단선을 쉼표·접속사 뒤에 두면 #6 은 침묵하고 #6-b 만 잡는다.**
중간 절단도 완전한 무손실 분할이다(`gate-order.ts:14-16`). 실제로 쉼표 뒤를 자른 md 가 게이트 13종·품질
검증기·어댑터를 전부 통과해 저장·인쇄까지 간 적이 있다(`gate-order.ts:294-297`).
→ **모든 조각은 대문자로 시작하고 마침표(또는 `?!`)로 끝나야 한다.**

**7-4. 약어 마침표는 문장 끝이 아니다.** `… as Prof.` 에서 자르면 이음매에 종결부호가 있고 다음 조각이
대문자로 시작해 #6-b 두 검사를 **모두 우회한다** — 그래서 전용 사전이 있다(`gate-order.ts:138-146`).
`Mr. Mrs. Ms. Dr. Prof. Rev. Gen. Sen. Rep. Gov. Col. Lt. Sgt. Capt. Fig. Vol. vs. cf. viz. e.g. i.e.` 뒤에서 자르지 마라.
반대로 `U.S.` `Inc.` `etc.` `et al.` 은 의도적으로 사전에서 제외됐다 — 문장을 실제로 끝낼 수 있다.

**7-5. 소문자로 시작하는 조각은 면제 목록 밖이면 전부 반려다.**
면제되는 것은 **단어 내부 대문자**(`iPhone` `mRNA` `macOS`)와 **성씨 접두 + 대문자 고유명사**
(`von Neumann` `de Broglie` `van der Waals`)뿐이다(`gate-order.ts:132-136`).
`de facto standards…` 같은 일반구는 면제되지 않는다.

**7-6. 정답 첫 단락을 뺀 두 단락이 연결사·지시 명사구로 시작하면 문항이 무너진다(#10).**
차단 목록(`gate-order.ts:59-60`): `however nevertheless nonetheless therefore thus hence consequently conversely
instead moreover furthermore besides likewise similarly meanwhile finally also yet but then in contrast by contrast
on the contrary as a result for example for instance in addition in other words in short that is even so after all
at the same time` + `these|those|such + 명사`.
**예외 1**: `Yet another/more/again/other …` 는 한정사구라 면제(`gate-order.ts:68`).
**예외 2**: 정답 배열의 **첫 단락 하나만** 면제(`gate-order.ts:369`).
→ 해결책은 선지를 빼는 게 아니라 **절단선을 옮기는 것**이다. 되받음은 문장 안쪽(둘째 절·목적어 자리)에 둔다.

**7-7. 단락 본문에 `(A)` 를 쓰면 반려되지만, 직접 인용이면 면제된다.**
`One hand wrote "(A)" beside the line` 은 통과(`gate-order.ts:91-105,115`), `Group (a) shows …` 는 반려.
`f(A)` `(A)level` 처럼 인접 문자가 붙은 것도 면제(`gate-order.ts:113-114`). **소문자 `(a)` 도 잡힌다**(`/giu`).

**7-8. 오답 목록에 정답 번호를 끼우면 파서가 조용히 지운 뒤 게이트가 개수로 잡는다.**
`parser-order.ts:145` 의 필터 → `오답해설 3개 (4개 필요)` + `오답해설 누락 라벨` 이라는 **간접 진단**이 나온다.
라벨 중복도 마찬가지(`오답해설 라벨 중복`) — 어댑터에서도 한 번 더 막힌다(`adapter-order.ts:88-94`).

**7-9. 정답을 임의로 고를 수 없다.** 게이트가 원문 좌표에서 순열을 재도출해 대조한다(`gate-order.ts:353-361`).
정답 위치를 바꾸고 싶으면 **라벨 배정을 바꿔라** — `정답:` 만 고치면 `정답 불일치` 다.

**7-10. `(A)-(B)-(C)` 는 정답이 될 수 없다.** 라벨 배정 시 원문 순서와 제시 순서가 우연히 일치하지 않게 하라
(`gate-order.ts:356`).

**7-11. 지문 첫 조각은 반드시 주어진 글이다.** `diversityTargets` 가 축자 스팬을 회피 표적으로 내보내면
계약과 논리적으로 충돌해 재생성까지 같은 반려로 수렴하므로, 표적은 **절단 좌표(단어 수)** 로 나온다
(`lane-order.ts:202-222`). 저작 시에도 "주어진 글을 지문 중간에서 뽑는" 설계는 불가능하다.

**7-12. 변형 줄의 2번째 문장 이후는 축자와 `normalizeWs` 동일이어야 한다.**
한 글자만 달라도 `2번째 문장 이후가 축자와 다름`(`gate-order-variant.ts:249-250`).
첫 문장은 **정확히 1문장** · 종결부호 필수 · 0.6~1.7배 단어 수 · 축자를 통째로 품으면 안 되고 · 새 토큰이 있어야 하고 ·
지문 다른 구간 복사 금지 · 단서 종류와 **방향** 보존 · 되받는 선행어 유지 · 공통 내용어 1~2개 이상.

**7-13. 변형 시 분량 관리는 축자와 표시면 **두 축**을 동시에 만족해야 한다.**
개별 변형은 0.6~1.7배 안인데 표시면 합계가 2.1배로 무너지는 조합이 실재한다
(`_test-md-order-fixtures.ts:101-104`, `_test-md-order.ts:146-147`).

**7-14. 해설의 영어 인용은 지문에 실재해야 한다.** 12자 이상 조각이 문항 표면에 없으면
`explanation-quoted-token-missing`(`validators/explanation-quoted-tokens.ts:37-38`).
해설은 한국어·합니다체이며, 영어는 **따옴표 안 인용만** 허용된다(품질 헌법 §5).

**7-15. 지문이 짧으면 이 유형은 성립하지 않는다.** 품질 검증기의 단락 하한(2문장·24단어)에는 완화가 없다.
→ 최소 지문 ≈ 24×3 + 주어진 글 ≈ **80단어 / 7문장**. 실무 하한은 **110단어 / 8문장**
(주어진 글 2문장 + 단락마다 2문장). 이 미만 지문에는 이 유형을 배정하지 마라.

---

## 8. 출제 포인트 다각화 축

> 한 지문에서 5~8문항. 이 유형의 다각화는 **"어디서 자르는가"** 가 전부다.
> 지문이 고정이고 선지 5개도 사실상 고정이므로, 절단선·라벨 배정·오답 기제·해설 초점이 문항의 실체다.
> **같은 절단선 + 같은 라벨 배정 = 같은 문항이다.** 정답 번호만 다르게 하는 것은 다각화가 아니다.

### 8-A. 노브로 달라지는 축 (코드 근거 있음)

| 축 | 값 | 근거 | 다각화 효과 |
|---|---|---|---|
| **A1. 단락 변형 수** | `prefixVariationCount` 0 / 1 / 2 / 3 | `lane-order.ts:95-108` | **가장 큰 축.** 0 = 순수 배열 추론. 1~3 = 지문을 외운 학생의 표면 대조를 무력화하고 "재진술된 문장에서도 응집 단서를 읽어내는" 능력을 추가로 요구. 문항마다 0/1/2 를 섞으면 같은 절단선이어도 인지 과제가 달라진다 |
| **A2. 난이도** | `BASIC` / `INTERMEDIATE` / `KILLER` | `prompts-order.ts:56-73` · 헌법 §4 | BASIC = 이음매마다 표면 단서 1개(단, 문장 **안쪽**). INTERMEDIATE = 정답 배열 전체로 서로 다른 단서 2종 수렴. KILLER = 이음매 3곳에 서로 다른 장치 + 표면 훑기로는 최소 2배열 생존. 유닛 배분: 5문항 = B1/I2/K2, 8문항 = B2/I3/K3 |
| **A3. 응집장치 focus** | `pointFocus` + `variantIndex` 회전 | `sentence-order-point-catalog.ts:127-131,162-171` | 기출 550문항 LLM 검증 분포 기반 코어 3종을 **문항마다 돌려 지정** |
| **A4. 발문 언어** | `stemLanguage` ko/en | `lane-order.ts:127-131,163` | 표층 형식 축(헌법 §7-5). 유닛에 1~2문항만 en 배치 가능 |

### 8-B. 설계로 달라지는 축 (교육적 판단 — 여기가 진짜 승부처)

**B1. 절단 좌표 (★ 최우선 축)**
같은 지문이라도 "어느 문장 뒤에서 자르는가"에 따라 완전히 다른 문항이 된다.
지문이 8문장이면 주어진 글 1~2문장 + 6~7문장을 3등분하는 방법이 여럿이다.
- 주어진 글 1문장형 vs 2문장형 (도입을 얼마나 주는가 → 첫 이음매의 난이도가 바뀐다)
- 단락 경계를 논지 전환점에 맞추기 vs **전환점 한 문장 뒤로 밀기**(전환 문장을 앞 단락 꼬리에 붙이면
  이음매 단서가 문장 안쪽으로 들어가 난이도가 오른다)
- 균등 3등분(2/2/2) vs 비균등(3/2/2 — 단, 최대/최소 1.9 이하)
> 레인의 `diversityTargets` 가 실제로 내보내는 회피 표적이 **절단 좌표(단어 수)** 다:
> `이미 쓴 절단 좌표(단어수) 주어진글 N · 단락 a/b/c — 같은 자리에서 자르지 마라` (`lane-order.ts:219-221`).
> **문항마다 `주어진글 N · 단락 a/b/c` 조합이 달라야 한다.** 하네스도 이 문자열로 `ANSWER_DUPLICATE` 를 잡는다
> (`qgen-core.ts:336-353`).

**B2. 라벨 배정 = 정답 순열**
절단선이 같아도 라벨을 어떻게 붙이냐에 따라 정답이 달라진다. 원문 순서 X→Y→Z 에 (A)(B)(C) 를 붙이는
방법은 6가지이고 그중 `(A)-(B)-(C)` 만 금지되므로 **5가지**가 남는다.
정답 번호를 ①~⑤ 로 고르게 분산시켜라(셔플이 없으므로 저작자가 유일한 통제자다 —
`question-diversity.ts:508-521`). 다만 **B2 단독 변경은 다각화가 아니다** — B1 또는 B3 와 함께 바꿔라.

**B3. 판정 단서 종류 (응집장치 축 — 기출 550문항 검증 분포)**
같은 절단선이라도 "학생이 무엇을 읽고 푸는가"를 이동시킬 수 있다.

| 코드 | 이름 | 기출 비중 | 신호 |
|---|---|---|---|
| `temporal_sequence` | 시간·서사 순서 | **42.9%** (코어) | then/next/after/later/finally · 사건 진행 단계 |
| `anaphora_reference` | 참조 해소 | **24%** (코어) | this/these/such/the+명사 의 선행어가 직전 조각에만 존재 |
| `contrast_reversal` | 대조 전환 | **15.5%** (코어) | however/but/instead — 표지뿐 아니라 **내용이 정반대**여야 진짜 대조 |
| `example_elaboration` | 예시·구체화 | 9.3% (보조) | for example/in one study — 일반 명제가 바로 앞에 |
| `cause_effect` | 인과·결과 | 4.2% (희소) | therefore/as a result — 원인이 직전에만 |
| `addition_extension` | 첨가·심화 | 3.3% (희소) | moreover/in addition |
| `coherence_bridge` | 표지 없는 담화 연속 | 0.9% (희소) | 화제 연속만 — **정답 복수화 위험 최대** |

출처: `sentence-order-point-catalog.ts:20-120`(EBSi 기출 550문항 LLM 전수 분류, 2026-06-19).
→ **유닛 5문항이면 코어 3종을 최소 한 번씩 + 보조 1종**. 희소 축(인과·첨가·담화연속)에 2문항 이상 기대지 마라.
→ ⚠ 코어를 바꾸려면 대개 절단선도 함께 옮겨야 한다(B1 과 연동되는 축이다).

**B4. 오답 4개의 기제 구성** (헌법 §3 (L,F) 팔레트의 이 유형 번안 — `prompts-order.ts:177`)
- ① 선행어 부재 — 지시사가 가리킬 대상이 아직 등장하지 않음
- ② 시간 역행 — 뒤 단계가 앞 단계보다 먼저
- ③ 인과 역전 — 결과가 원인 앞에
- ④ 일반·구체 뒤집힘 — 예시가 주장보다 먼저
- ⑤ 어휘 사슬 단절 — 정관사·재언급이 첫 등장보다 앞섬

**같은 기제 두 개를 한 문항에 넣지 마라.** 문항마다 4개 슬롯의 조합을 달리 짜면 5문항이 서로 다른 오답 팔레트를 갖는다.
**near-miss 의무**: 정답과 **한 자리만 다른** 배열을 문항마다 최소 1개 넣되, 어느 자리를 비트는지
(첫 이음매 / 가운데 / 끝)를 문항마다 바꿔라 — 이것만으로도 학생이 검산해야 하는 이음매가 달라진다.

**B5. 이음매 난이도 배치**
"가장 어려운 이음매"를 어디에 두는가: 주어진 글→첫 단락 / 첫→둘째 / 둘째→셋째.
첫 이음매가 어려우면 학생이 처음부터 막히고, 마지막 이음매가 어려우면 두 배열까지 좁힌 뒤 갈린다 —
**체감 난이도와 오답 분포가 완전히 달라진다.**

**B6. 해설 초점**
같은 문항이어도 해설이 (a) 이음매 3곳을 균등 서술하는가, (b) 결정적 이음매 1곳을 파고드는가,
(c) 오답 배열이 깨지는 지점을 대조하는가에 따라 학습 가치가 달라진다.
해설은 **딱 2문장**이 계약이므로(`prompts-order.ts:100`) 초점을 명시적으로 골라야 한다.

### 8-C. 유닛 5문항 설계 예시 (충돌 없는 조합)

| # | 난이도 | prefixVariation | 절단 좌표(주어진글/단락) | 코어 장치 | 정답 순열 | near-miss 위치 |
|---|---|---|---|---|---|---|
| 1 | BASIC | 0 | 2문장 / 2·2·2 | 참조 해소 | (B)-(C)-(A) | 끝 이음매 |
| 2 | INTERMEDIATE | 0 | 1문장 / 2·3·2 | 시간·서사 순서 | (C)-(A)-(B) | 첫 이음매 |
| 3 | INTERMEDIATE | 1 | 2문장 / 3·2·2 | 대조 전환 | (B)-(A)-(C) | 가운데 |
| 4 | KILLER | 0 | 1문장 / 2·2·3 | 참조+시간 수렴 | (C)-(B)-(A) | 끝 이음매 |
| 5 | KILLER | 2 | 2문장 / 2·3·2 | 대조+인과 수렴 | (A)-(C)-(B) | 첫 이음매 |

**검산**: `point:` 5개가 전부 다른가(POINT_DUPLICATE) · 절단 좌표 5조합이 전부 다른가(ANSWER_DUPLICATE) ·
정답 번호가 ①~⑤ 에 고르게 흩어졌는가 · 난이도 배분이 §4 를 만족하는가.
**⚠ 지문이 짧아 절단 좌표를 5가지로 못 만들면 문항 수를 줄여라** — 헌법 §9-10(수를 채우려고 품질을 낮추지 않는다).

---

## 검증 기록

`qbank/work/_probe-SENTENCE_ORDER.ts` (tsx 실행, 2026-07-28):

```
── 지문 계측 ──
passage: 111단어 / 8문장
주어진글: 28단어 / 2문장 · (A): 30단어 / 2문장 · (B): 28단어 / 2문장 · (C): 25단어 / 2문장

PASS 골격 A — 변형 0 (기본형)
PASS 골격 B — 변형 1 ((A)만)
PASS 골격 B — 변형 2 ((A)(B))

── 함정 실증 ──
PASS 장식(굵게) 정답 머리표 `**정답: ③**` → 정답 누락
PASS 헤딩 붙인 주어진글 `## 주어진글:` → 주어진 글 누락
PASS 서술형 머리표 `모범답안:` 오용 → 정답 누락
PASS 불릿 선지 `- ③ ...` → 선지 4개 (5개 필요) / …
PASS 오답 머리표 누락(오답 줄만) → 선지 9개 (5개 필요) / …
     짧은 지문(30단어/4문장): md게이트 2건 / 품질 error [explanation-quoted-token-missing,
       sentence-order-paragraph-too-short, sentence-order-paragraph-too-thin]

전 골격 통과
```

경로: `parseAndGate`(gateIssues 0) → `adapt`(ok) → `postProcessQuestion`(PASSTHROUGH ok) →
`validateQuestionQuality`(error 0, `filterQualityIssues` 적용).
