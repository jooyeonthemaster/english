# 주제문 영작 (TOPIC_SENTENCE_WRITING)

> 분류 **서술형(영작 계열 · 선지 없음)** · 지문변형 **없음(PASSTHROUGH)** · 정답 머리표 **모드별로 다르다 — `주제문:`(scrambled, 그 줄이 곧 모범답안) / `정답(A):`(cloze)** · 최소 지문 길이 **코드 제약 없음(0)** — `isEligible`(`lane-topic-sentence-writing.ts:149-167`)은 모드·빈칸수·미끼수만 보고, 게이트에도 지문 길이 하한이 없다.
>
> ⚠ **이 유형에는 `정답:` 줄도 `오답:` 절도 없다.** 26유형 일괄 템플릿에 `정답:`을 박으면 이 유형은 전량 반려된다(`gate-topic-sentence-writing.ts:231-235` 모드 XOR).
>
> 전 유형 공통 계약은 [`../recon/00-contract.md`](../recon/00-contract.md), 품질 규범은 [`../quality-constitution.md`](../quality-constitution.md).
> 이 문서의 모든 주장은 코드 직독 + `qbank/work/_probe-TOPIC_SENTENCE_WRITING.ts` tsx 실행 검증을 거쳤다(7문항 유닛 · blocking 0 · qualityBlocking 0).

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

**"글의 주제를 알아보는 것"이 아니라 "글의 주제를 영어로 만들어 내는 것"이 과제다.**
선지가 없으므로 소거법이 통하지 않는다. 학생은 (a) 글 전체를 덮는 명제를 스스로 세우고 (b) 그것을
제시된 재료로 실제 영어 문장/명사구로 조립해야 한다. 독해 판정과 영작 수행이 한 문항 안에서 직렬로
연결되는 유일한 대의파악 계열이다.

### 두 모드는 사실상 서로 다른 인지 작업이다 — `prompts-topic-sentence-writing.ts:239-275`

| 모드 | 학생이 보는 것 | 학생이 하는 일 | 실패하는 지점 |
|---|---|---|---|
| `scrambled` (배열) | `[배열 단어]` 칩 나열 + (선택)`[주제 힌트]` | 칩을 **전부 소비해** 하나의 완결된 주제문/명사구로 배열 | 어느 동사·어느 극성을 어디에 놓느냐 — 논지를 읽어야만 결정된다 |
| `cloze` (빈칸 완성) | `[주제문]`(빈칸 마스킹) + `[보기]` + (선택)`[주제 힌트]` | 골격은 주어졌고 **논지를 지고 있는 어구만** 영작 | 두 빈칸이 대조 구조의 양극이면 한쪽을 틀리면 반대쪽도 어긋난다 |

`scrambled` 은 WORD_ORDER 계열, `cloze` 는 SUMMARY_WRITING 계열의 이식이며 품질 게이트도 그
두 유형의 코드를 그대로 재사용한다(`validators/topic-sentence/writing.ts:9-19`).

### 인접 유형과의 경계

| 유형 | 요구 산출물 | TOPIC_SENTENCE_WRITING 과의 차이 |
|---|---|---|
| `TOPIC` / `MAIN_IDEA` | 주제구·요지를 **고르는** 5지선다 | 여기는 **쓴다.** 선지가 없어 정답 위장·오답 설계 축이 통째로 사라지고, 승부처가 "표적 명제 설계 + 재료·미끼 설계"로 이동한다 |
| `SUMMARY_WRITING` | 요약문의 빈칸 영작 | 표적이 "요약문"이 아니라 **주제 한 줄**이다. 요약은 글의 흐름을 압축하고 주제문은 판단만 남긴다 |
| `WORD_ORDER` | 지정 문장의 어순 배열 | WORD_ORDER 의 표적은 **지문에 실재하는 문장**이다. 여기 표적은 지문 어디에도 없는 **새로 세운 명제**다(그래서 `verbatimCopyRun` 이 축자 복사를 반려한다 — `gate-topic-sentence-writing.ts:146-152`) |
| `SUMMARY_COMPLETE` | 요약문 빈칸 5지선다 | 선택 vs 생산 |

### 지문을 한 글자도 건드리지 않는다

인라인 마커 4종(`[[A:…]]` `[[1]]` `[[1:…]]` `[[them]]`)을 **하나도 쓰지 않는다.** 파서에 지문
재출력 필드가 없고(`parser-topic-sentence-writing.ts:30-64` — `MdTswQuestion` 에 지문 필드 없음),
후처리도 PASSTHROUGH 다(`question-postprocess/types.ts:81`). 즉 **「지문 재구성 대조」 게이트가 아예 없다.**
그 대신 이 유형만의 대조 축이 둘 있다:

1. **칩 ↔ 정답 타일링** — 재료가 정답을 과부족 없이 덮는가(`gate-topic-sentence-writing.ts:262-323`)
2. **정답 ↔ 지문 축자 대조** — 정답이 지문 문장의 통째 복사이면 영작이 받아쓰기로 전락(`:146-152`)

**어댑터가 100% 완제품을 낸다**(`adapter-topic-sentence-writing.ts:5-8`). 게이트가 못 잡으면 그대로 출하된다.

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 A — `scrambled` (배열) · `fidelity: verbatim`

```md
방식: scrambled
주제문: <완성된 영어 주제문/명사구 한 줄. 이 줄이 곧 모범답안이다 — 별도 `모범답안:` 줄을 쓰지 마라>
칩: <재료1 / 재료2 / 재료3 / ...>
힌트: <한국어 한 줄. hintEnabled=true 일 때만. 정답 어구를 영어로 노출하지 마라>
허용답:
- <같은 칩 멀티셋으로 조립되는 등가 어순 문장. 확신 없으면 `허용답:` 줄과 이 줄을 통째로 생략>
해설: <한국어 2문장. ①이 주제를 어느 논리 흐름에서 도출했는지 ②학생이 어디서 흔들리는지>
```

> `fidelity: verbatim` 에서는 **`미끼:` 줄을 쓰지 않는다.** 미끼는 "칩을 정답에 타일링하고 남는 것"으로
> 기계가 파생 확정한다(`snap-topic-sentence-writing.ts:51-142, 322-338`). 선언해도 무시된다.
> `fidelity` 가 `inflected`/`mixed` 일 때만 `칩:` 아래에 `미끼: <미끼1 / 미끼2>` 줄을 넣는다.

### 2-2. 복붙 골격 B — `cloze` (빈칸 완성)

```md
방식: cloze
주제문: <(A), (B) placeholder 를 각 정확히 1회 포함하는 영어 한 줄. 정답 어구는 절대 넣지 마라>
보기: <칩1 / 칩2 / 칩3 / ...>
미끼: <미끼1 / 미끼2>
힌트: <한국어 한 줄. hintEnabled=true 일 때만>

정답(A): <이 빈칸에 들어갈 영어 어구 — 2단어 이상>
동치(A): <같은 뜻으로 인정할 다른 답 / 또 다른 답>   ← 없으면 이 줄 생략
정답(B): <이 빈칸에 들어갈 영어 어구 — 2단어 이상>
동치(B): <…>   ← 없으면 이 줄 생략

채점기준:
- <부분점수 항목 1>   ← scoringGranularity=rubric 일 때만, 2개 이상
- <부분점수 항목 2>
해설: <한국어 2문장>
```

> cloze 는 **`모범답안:` 줄을 쓰지 않는다.** 주제문의 `(A)(B)` 를 정답으로 치환해 기계가 합성한다
> (`parser-topic-sentence-writing.ts:283-293, 400-401`). 쓰면 무시되고 corrections 만 남는다.
> cloze 는 `허용답:` 도 읽지 않는다(`:402-403` — scrambled 전용). 등가 답은 `동치(X):` 로만 싣는다.

### 2-3. 검증된 정상 픽스처 전문 — `scripts/_test-md-topic-sentence-writing.ts` verbatim

대응 지문은 `scripts/_test-md-topic-sentence-writing.ts:51-56`.

**BASIC (`:78-82`) — scrambled · nounPhrase · chunk · verbatim · 미끼 0**

```md
방식: scrambled
주제문: the combined effect of compact building and reliable transit service
칩: and reliable transit service / the combined effect / of compact building
힌트: 밀집 개발과 믿을 만한 대중교통이 함께 갔을 때 생기는 효과를 가리키는 표현입니다.
해설: 글은 차선 확장이 왜 실패했는지와 대중교통에 투자한 도시가 왜 달랐는지를 나란히 놓습니다. 마지막 문장이 두 조건이 함께 있어야 효과가 난다고 못 박으므로 주제는 둘의 결합 효과입니다.
```

**INTERMEDIATE (`:84-91`) — scrambled · sentence · word · verbatim · 미끼 1**

```md
방식: scrambled
주제문: Dense development paired with transit investment lowers the total commuting burden of a city.
칩: lowers the total / of a city / Dense development / increases / commuting burden / paired with / transit investment
미끼: increases
힌트: 밀집 개발과 대중교통 투자가 함께 갈 때 도시 전체의 통근 부담이 줄어든다는 이야기입니다.
허용답:
- Transit investment paired with dense development lowers the total commuting burden of a city.
해설: 차선을 늘린 도시는 유발 수요로 다시 막혔고 대중교통에 투자한 도시만 다른 결과를 얻었습니다. 마지막 문장이 밀집과 서비스가 함께여야 한다고 못 박으므로 주제는 둘의 결합이 통근 부담을 낮춘다는 명제입니다.
```

> ⚠ 이 픽스처의 `미끼: increases` 줄은 **verbatim 이라 파서가 무시하고 칩 타일링으로 재파생한다.**
> 프로브 실측 corrections: `` 미끼는 칩 타일링에서 파생 확정(선언값 '없음' → 'increases') ``.
> 값이 같아 무해할 뿐이며, **저작 규칙은 verbatim 에서 `미끼:` 줄을 쓰지 않는 것**이다.

**KILLER (`:93-105`) — cloze · sentence · 2빈칸 · inflected · 미끼 2 · rubric**

```md
방식: cloze
주제문: Congestion eases not by (A) but by (B) working together.
보기: capacity / expand / and / transit / housing / compact / widening / road / frequent / highways
미끼: widening / highways

정답(A): expanding road capacity
정답(B): compact housing and frequent transit
동치(B): frequent transit and compact housing

채점기준:
- 두 빈칸이 대조 구조의 양극을 각각 채우면 각 2점입니다.
- 한쪽만 맞으면 부분점수 2점을 부여합니다.
해설: 차선 확장은 유발 수요로 상쇄되고 대중교통 투자만으로도 오래된 습관이 바뀌지 않는다고 글이 말합니다. 마지막 문장이 두 조건의 동시 충족을 요구하므로 주제문은 확장이 아니라 밀집과 서비스의 결합에 방점을 둡니다.
```

합성 모범답안(파서 산출): `Congestion eases not by expanding road capacity but by compact housing and frequent transit working together.`

**단일 빈칸 cloze (`:499-507`)** — `settings: {"blankCount":1}`

```md
방식: cloze
주제문: Congestion eases only where (A) arrive together.
보기: compact / housing / and / frequent / transit / widening / highways
미끼: widening / highways
정답(A): compact housing and frequent transit
채점기준:
- 밀집과 서비스 두 축이 모두 들어가면 만점입니다.
- 한 축만 있으면 절반 점수입니다.
해설: 글은 차선 확장이 유발 수요로 상쇄된다는 사실과 대중교통 투자만으로는 부족하다는 사실을 함께 제시합니다. 마지막 문장이 두 조건의 동시 충족을 요구하므로 빈칸은 둘의 결합을 받습니다.
```

> 원 픽스처는 라벨 없는 `정답:` 줄(실측 드리프트 흡수 경로)이다. **저작은 `정답(A):` 를 쓴다** — 프로브에서
> `정답(A):` 로 바꿔도 게이트 클린임을 확인했다.

### 2-4. qbank 컨테이너 안에서의 실물 (하네스 입력 형태)

```md
<!-- ITEM 4
difficulty: KILLER
point: 조건 구조 단일 빈칸 — only where 절이 요구하는 동시 충족 조건을 한 어구로 세운다
craft: 골격이 조건절만 남아 학생은 '무엇이 함께 도착해야 하는가'를 스스로 채워야 한다
settings: {"blankCount":1}
-->
방식: cloze
주제문: Congestion eases only where (A) arrive together.
...
```

`<!-- ITEM n -->` 는 **qbank 규약이지 md-qgen 규약이 아니다**(`qbank/harness/qgen-core.ts:57-109`).
주석 아래 본문만이 md-qgen 계약 대상이다. `settings` JSON 은
`{ TOPIC_SENTENCE_WRITING: {...} }` 로 병합되어(`qgen-core.ts:379-387`)
`resolveTopicSentenceWritingSettings` 의 nested 경로로 읽힌다(`question-type-generation-settings/topic-sentence-writing.ts:79-84, 96-102, 110-118`).

---

## 3. 파서 계약 (★ 가장 중요)

> 전제: `prompts-topic-sentence-writing.ts` 의 지침 문구보다 **아래 파싱 규칙이 우선한다.**
> 문서 하나 = 문항 하나. 파서는 각 라벨의 **첫 매치만** 취한다(`firstLabelValue` — `parser-topic-sentence-writing.ts:150-154`).

### 3-0. 모드는 설정이 정한다 — `방식:` 줄은 정보량 0

`parseMdTopicSentenceWriting(text, mode)` 의 `mode` 는 **호출자가 주는 설정값**이다
(`lane-topic-sentence-writing.ts:201`). 모델이 낸 `방식:` 줄은 `declaredMode` 로만 보관되고
(`parser-topic-sentence-writing.ts:394`), 어긋나도 **반려되지 않고 corrections 로 기록만** 된다
(`snap-topic-sentence-writing.ts:207-211`). 실제 모드 위반 검출기는 §4 의 모드 XOR 게이트다.
→ **어기면 사라지는 것: 없다.** 다만 `방식:` 줄은 관례상 반드시 쓴다(형식 자기검증 신호).

### 3-1. 라벨 줄 매처 (장식 관용 범위) — `parser-topic-sentence-writing.ts:74-89`

```ts
const EMPH        = "(?:\\*\\*|__|[*_`])";
const LINE_PREFIX = `^[ \\t]*(?:>[ \\t]*)*\\|?[ \\t]*(?:#{1,6}[ \\t]*)?(?:[-*•][ \\t]*)?${EMPH}?`;
const LABEL_SEP   = "[ \\t]*[:：|][ \\t]*";
const LABEL_INDEX = `[([（]?[ \\t]*([A-Za-z])[ \\t]*[)\\]）]?[ \\t]*${EMPH}?`;
```

- 흡수: 앞 공백/탭 · 인용 `>`(반복 가능) · **표 파이프 `|` 1개** · 헤딩 `#`~`######` · 불릿 `- * •` ·
  굵게 `**`/`__` · 이탤릭 `*`/`_` · 코드 스팬 `` ` `` · 전각 콜론 `：` · **구분자로서의 파이프 `|`**
- **콜론(또는 전각 콜론, 또는 파이프)은 필수다.** `주제문 the combined effect` 는 통째로 사라진다.
- 라벨 첨자는 전각 괄호 `（A）`·대괄호 `[A]`·괄호 없음 `정답 A:`·소문자 `정답(a):` 전부 흡수하고
  `tswParenLabel` 이 `"(A)"` 로 정규화한다(`:197-200`, 범위는 `A`~`J` — `LABEL_KEYS` `:66`).
- ⚠ **`decoration.ts` 의 관용은 이 파일에 적용되지 않는다.** 이 파서는 자체 정규식이다 →
  **저작 규칙은 장식 0.** 굵게·헤딩·불릿·인용·표를 쓰지 마라. (관용이 있더라도 관용은 계약이 아니다.)

### 3-2. 값 세정 `cleanValue` — `:126-148`

수렴할 때까지 반복 적용되는 순서: **trim 먼저** → `←` 이하 절단 → 선두 EMPH 제거 → 말미 EMPH 제거 →
말미 `|` 제거 → 짝 장식(`" "` `' '` `“ ”` `‘ ’` `「 」` `『 』`, `:108-115`)이 **양끝 다 있을 때만** 제거.

- **`←` 는 값 안에 절대 쓰지 마라.** `칩: a / b / c   ← 셔플 필수` 는 `← ...` 가 잘려나간다(`:130`).
  이건 방어 장치지 기능이 아니다 — 정당한 화살표도 같이 죽는다.
- 어기면 사라지는 것: `←` 뒤 전부.

### 3-3. 나열 구분자는 **슬래시 하나뿐** — `splitTswChips` `:207-212`

```ts
raw.split(/\s*[/|]\s*/).map(cleanValue).filter(Boolean)
```

- `칩:`/`보기:`/`미끼:`/`동치(X):` 값에 쓰이는 유일한 구분자는 ` / ` 다. 파이프 `|` 도 같은 경계로 흡수된다.
- **쉼표는 구분자가 아니다.** 영어 어구에는 쉼표가 실재하므로 일부러 뺐다(`:203-206`).
- ★ **영어 어구 안에 `/` 나 `|` 를 절대 쓰지 마라.** 실측:
  `주제문: the combined and/or joint effect …` → 주제문은 온전히 남지만 `and/or` 가 `and`,`or` 두 토큰이 되어
  「부족 토큰 "or", "joint", "and"」 반려. `칩: and/or reliable transit service` → 칩이 2개로 쪼개져
  「정답에 쓰이지 않는 잉여 토큰이 있음 — "or"」 반려.
- 어기면 사라지는 것: 재료 하나가 둘로 쪼개져 **타일링이 영구 실패**한다.

### 3-4. `라벨: 값` 은 한 줄로 끝내라 — `foldedLabelValue` `:174-194`

파서는 접힌 값을 **최대 2줄**까지 이어 붙이지만 조건이 전부 만족돼야 한다:
① 다음 줄이 알려진 라벨 머리(`KNOWN_HEAD_RE`)도 표 행도 빈 줄도 아님 ② 한글 없음
③ 소문자 알파벳으로 시작(머리 줄 값이 비었으면 대문자까지 허용) ④ 지금까지의 값이 문말 부호로 끝나지 않음.

- 대문자로 이어지는 줄은 **붙지 않는다** → 정답이 조각으로 잘린 채 살아남는다. 게이트가
  「미끼를 뺀 재료(N토큰)가 정답(M토큰)보다 …많음 — 모범답안이 잘려 들어왔거나…」로 잡지만
  이건 **비-verbatim 경로에서만**이다(`gate-topic-sentence-writing.ts:311-322`).
- 어기면 사라지는 것: 두 번째 줄 이하가 통째로. **접지 마라.**

### 3-5. 섹션 경계 `KNOWN_HEAD_RE` — `:97-99`

```ts
new RegExp(`${LINE_PREFIX}(?:방식|주제문|주제|칩|보기|미끼|힌트|허용답|채점기준|해설|모범답안|정답|동치)${EMPH}?(?:${LABEL_INDEX})?${LABEL_SEP}`)
```

**라벨 글자만으로는 끊지 않는다 — 구분자(`:` `：` `|`)까지 있어야 경계다.**
실측: 채점기준 항목 `- 해설 기준에 따라 한쪽만 맞으면…` → 정상 수집(2개).
`- 해설: 한쪽만 맞으면…` → 섹션이 끊기고 **그 항목이 해설로 납치**된다(채점기준 1개 → 루브릭 반려).

→ **저작 규칙: 목록 항목을 `방식/주제문/주제/칩/보기/미끼/힌트/허용답/채점기준/해설/모범답안/정답/동치` +
콜론 으로 시작하지 마라.**

### 3-6. 목록 섹션 `허용답:` / `채점기준:` — `parseListSection` `:221-246`

- 머리 줄에 값이 붙어 있으면(`허용답: 한 줄짜리`) 그것도 항목 1개로 수집(`:228-229`).
- **불릿 없는 평문 줄도 항목으로 받는다**(`:241`). `- ` `* ` `• ` `1. ` `1) ` 접두는 벗겨진다(`:240`).
- 종료 조건: 알려진 라벨 머리 · 마크다운 헤딩 · 표 행 · **빈 줄 2연속**(`:232-236`).
  실측: 항목 사이에 빈 줄 2줄을 넣으면 그 아래가 통째로 사라진다(루브릭 2개 → 1개 → 반려).
- **첫 매치 이후 `break`**(`:243`) — 같은 라벨이 두 번 나오면 두 번째 블록은 무시된다.
- 어기면 사라지는 것: 목록 항목 일부 또는 전부.

### 3-7. 해설 `parseExplanation` — `:248-264`

머리 줄 이후 **알려진 라벨 머리나 표 행이 나올 때까지 모든 줄을 흡수**해 공백 하나로 잇는다.
빈 줄도 끊지 않는다.

- 실측: `해설:` 아래에 사족 한 줄을 두면 **게이트는 클린인데 해설에 그 줄이 섞여 저장된다.**
- → **저작 규칙: `해설:` 은 반드시 문서의 마지막 블록이고, 그 아래에 아무것도 두지 마라.**
- 어기면: 조용한 오염(반려 없음) — 검수 렌즈 ②가 잡아야 한다.

### 3-8. `주제문:` 의 진실원 — `:338-345`

```ts
const strayModelAnswer = foldedLabelValue(text, "모범답안");
const labelledTopic    = foldedLabelValue(text, "주제문") || foldedLabelValue(text, "주제");
const topic = labelledTopic || (mode === "scrambled" ? strayModelAnswer : "");
```

- `주제문:` 이 없으면 `주제:` 를, 그것도 없고 scrambled 면 `모범답안:` 을 흡수한다(cloze 는 흡수 안 함).
- 둘 다 오면 `주제문:` 이 이기고 어긋남을 corrections 에 남긴다(`snap-…:272-282`).
- `modelAnswer` = scrambled → `topic` 그대로 / cloze → `synthesizeTswModelAnswer(topic, blanks)`
  = 주제문의 라벨 문자열을 정답으로 **문자열 치환**하고 `\s{2,}`→` `, `\s+([,.;:!?])`→`$1` 정리(`:283-293`).

### 3-9. 빈칸 정답 수집 — `:355-389`

```ts
const answerRe  = new RegExp(`${LINE_PREFIX}정답${EMPH}?[ \\t]*${LABEL_INDEX}${LABEL_SEP}(.+)$`, "gm");
const variantRe = new RegExp(`${LINE_PREFIX}동치${EMPH}?[ \\t]*${LABEL_INDEX}${LABEL_SEP}(.+)$`, "gm");
```

- **같은 라벨이 두 번 오면 첫 줄만 취한다**(`:362` `blankMap.has(label)` 가드).
- `정답(X):` 이 하나도 없으면 **라벨 없는 `정답:` 을 `(A)` 로 흡수**(`:366-369`). `동치:` 도 동형(`:381-387`).
- ★ **이 수집은 모드와 무관하게 돌아간다.** `sawAnswerLine = blankMap.size > 0`(`:409`) 이므로
  **scrambled 문서에 `정답:` 이나 `정답(A):` 이 한 줄이라도 있으면 모드 XOR 로 반려**된다(실측 확인).
- `blanks` 는 라벨 `localeCompare` 오름차순으로 정렬된다(`:389`) — `(A)(B)` 순서는 파서가 보장한다.
- 어기면 사라지는 것: 중복 라벨의 두 번째 값 / (scrambled 에서) 문항 전체.

### 3-10. `주제문:` 안의 placeholder 는 **정확히 `(A)` 리터럴** — `gate-…:360-366`

게이트가 `countLiteral(q.topic, "(A)")`(순수 문자열 split 카운트, `question-quality/core.ts:286-289`)로
센다. 파서의 라벨 정규화(`(a)`→`(A)`)는 **`정답(a):` 줄에만** 적용되고 주제문 본문에는 적용되지 않는다.

실측: 주제문의 `(a)` → 「주제문에 (A) 가 0회」. `( A )` → 「주제문에 (A) 가 0회」.
→ **주제문 안에는 공백 없는 대문자 `(A)` `(B)` 만.**

### 3-11. 토큰화 규칙 (게이트가 쓰는 두 종류)

| 함수 | 정규식 | 쓰이는 곳 |
|---|---|---|
| `tswWordTokens` (`parser-…:296-300`) | `/[A-Za-z]+(?:['’-][A-Za-z]+)*/g` → 소문자, `’`→`'` | verbatim 타일링·멀티셋 대조 |
| `summaryWritingComparableTokens` (`question-quality/core.ts:276-282`) | 정규화 후 `/[a-z]+(?:[-'][a-z]+)*/g` 중 **길이 ≥4만** | 축자 복사·누수·"칩이 정답 전체" 판정 |
| `summaryWritingWordTokens` (`validators/summary/writing.ts:6-10`) | `/[A-Za-z]+(?:[-'][A-Za-z]+)*/g` → 소문자, 길이 제한 없음 | `findUnbuildableWordBankBlanks` 조립 판정 |
| `countWords` (`core.ts:336-341`) | `/[A-Za-z]+(?:['-][A-Za-z]+)?|\d+(?:[.,]\d+)*/g` | 완성 답안 단어수 |

**하이픈·아포스트로피 결합어는 1토큰**이다(`trade-off`, `city's`). 칩과 정답에서 같은 표기를 써야 타일링이 맞는다.

### 3-12. 첫 매치 규칙 요약

| 라벨 | 매치 방식 | file:line |
|---|---|---|
| `방식:` `칩:` `보기:` `미끼:` `힌트:` | `firstLabelValue` — 첫 줄만 | `:150-154`, `:394-397` |
| `주제문:` `주제:` `모범답안:` | `foldedLabelValue` — 첫 머리 줄 + 접힘 최대 2줄 | `:174-194` |
| `정답(X):` `동치(X):` | `matchAll` 전량 스캔, **라벨별 첫 줄만** | `:356-387` |
| `허용답:` `채점기준:` | `parseListSection` — 첫 블록만(`break`) | `:221-246` |
| `해설:` | `parseExplanation` — 첫 블록, 경계까지 전부 흡수 | `:248-264` |

---

## 4. 게이트 체크리스트

`gateMdTopicSentenceWriting(q, passage, shape)` = `gateCommon` + (`gateScrambled` | `gateCloze`) —
`gate-topic-sentence-writing.ts:462-471`. 빈 배열이면 클린.

### 4-1. 공통 (`gateCommon` `:111-225`)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `주제문 줄 누락 — 출력이 마크다운 표로 보인다. 표를 쓰지 말고 \`주제문: <값>\` 처럼 **라벨: 값** 한 줄 형식으로 다시 내라` | `!q.topic` && 표 행(`^\|.*\|$`) 2줄 이상 | `:121-127` |
| `주제문 줄 누락 — \`주제문:\` 으로 시작하는 줄이 필요하다` | `!q.topic` (표 아님) | `:121-127` |
| `모범답안이 비어 있음(주제문/빈칸 정답으로 완성문을 만들 수 없음)` | `!q.modelAnswer` | `:131-133` |
| `모범답안이 영어가 아님: '<앞 50자>'` | 한글 포함 또는 라틴 문자 없음 | `:134-136` |
| `완성 답안이 N단어 — 주제문은 6~24단어여야 한다` | `topicForm=sentence` 범위 밖 | `:41-45, 137-145` |
| `완성 답안이 N단어 — 주제 명사구은 3~16단어여야 한다` | `topicForm=nounPhrase` 범위 밖 | `:41-45, 137-145` |
| `모범답안이 지문 문장의 통째 복사입니다: "<run>". 시제·태·구문 전환이나 상위어 환언을 최소 1개 넣어 다시 설계하라` | 내용토큰(≥4자) 6개 이상 & `max(6, ceil(n*0.8))` 개 연속 런이 지문에 존재 | `:64-72, 146-152` |
| `[주제 힌트] 사용 설정인데 \`힌트:\` 줄이 없음 — 발문이 없는 박스를 가리키게 된다` | `hintEnabled` && `!q.hint` | `:155-157` |
| `[주제 힌트]에 정답 어구가 그대로 노출됨: '<앞 50자>' — 힌트는 논지 방향만 가리켜라` | 힌트와 정답이 내용토큰 **2개 이상 연속** 공유 | `:52-61, 158-169` |
| `정답 조립에 쓰이지 않는 잉여 재료가 N개 (설정은 정확히 M개) — 남는 칩 "…"` | 파생 레짐(scrambled+verbatim)에서 남는 칩 수 ≠ 설정 | `:180-197` |
| `정답 조립에 쓰이지 않는 잉여 재료가 0개 (설정은 정확히 M개) — 정답에 쓰이지 않는 미끼 재료 M개를 칩 나열에 섞어라` | 파생 레짐, 남는 칩 0인데 설정 >0 | `:186-190` |
| `미끼 N개 (설정은 정확히 M개)` | 비파생 경로(cloze 또는 fidelity≠verbatim)에서 `미끼:` 개수 불일치 | `:191-195` |
| `미끼 N개 (설정은 정확히 0개) — 미끼 0개 설정이라 발문에 '쓰지 않는 단어' 안내가 없다` | 위와 같고 설정이 0 | `:191-195` |
| `미끼 '<x>' 가 제시 재료 안에 없음 — 미끼는 화면에 실제로 있는 칩이어야 한다` | 비파생 경로에서 미끼가 칩에 부재(normalizeWs+소문자 비교) | `:199-208` |
| `구두점만으로 된 재료가 있음: '<chip>'` | 칩이 `/^[^\wA-Za-z]+$/` | `:210-215` |
| `해설 누락` | `!q.explanation` | `:217` |
| `채점기준 N개 (루브릭 채점 설정이라 2개 이상 필요)` | `scoringGranularity=rubric` && 항목 <2 | `:218-222` |

### 4-2. `scrambled` 전용 (`gateScrambled` `:228-333`)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `설정은 배열(scrambled) 모드인데 빈칸 정답 줄(\`정답(A):\`)이 있음 — 두 모드를 섞으면 렌더·채점이 갈린다` | `q.sawAnswerLine` (라벨 없는 `정답:` 포함) | `:231-235` |
| `배열 재료가 N개 — \`칩:\` 줄에 2개 이상 필요하다` | `chips.length < 2` (**이후 검사 즉시 중단**) | `:236-239` |
| `칩 나열이 정답 어순대로 읽혀 어순이 누설됨(재배열해도 탈출 불가한 칩 구성)` | 스냅 재배열 **후에도** `chips.join(" ")===modelAnswer` 또는 `chipsAreInAnswerOrder` | `:241-249` |
| `재료 '<앞 50자>' 하나가 정답 전체를 담고 있음 — 더 쪼개라` | 한 칩의 내용토큰열이 정답 내용토큰열 전체를 포함 | `:250-260` |
| `미끼를 뺀 재료로 정답을 조립할 수 없음 — 부족 토큰 "a", "b" … 외 N개` | verbatim: 멀티셋 부족 | `:267-278` |
| `정답에 쓰이지 않는 잉여 토큰이 있음 — "…". 재료 하나는 **통째로 쓰이거나 통째로 안 쓰이거나** 둘 중 하나여야 한다(…). 그렇게 보이는 재료: '<칩>'` | verbatim, 파생 실패 상태에서 잉여 토큰 | `:279-298` |
| `미끼로 선언되지 않은 잉여 재료가 있음 — 남는 토큰 "…". 미끼면 \`미끼:\` 줄에 선언하고, 아니면 빼라` | verbatim, 파생 성공 상태에서 잉여 | `:296` |
| `정답 조립에 필요한 핵심 내용어 N개가 재료에 없음 — 부족 어간 "…"` | 비-verbatim: 어간(앞 4자) 부족이 2개 이상 & 정답 어간 3개 이상 | `:299-310` |
| `미끼를 뺀 재료(N토큰)가 정답(M토큰)보다 K토큰 많음 — 모범답안이 잘려 들어왔거나 선언되지 않은 잉여 재료가 있다. \`주제문:\` 은 줄바꿈 없이 한 줄로 완결해서 내라` | 비-verbatim: `supply > demand + max(1, round(demand*0.2))` | `:311-322` |
| `허용답 '<앞 50자>' 가 모범답안과 토큰 구성이 다름` | 스냅 절삭 후에도 남은 멀티셋 불일치(사후 불변식) | `:325-330` |

### 4-3. `cloze` 전용 (`gateCloze` `:336-459`)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `설정은 빈칸 완성(cloze) 모드인데 빈칸 정답 줄이 없음 — \`정답(A):\` · \`정답(B):\` 을 내라` | `!q.sawAnswerLine` | `:340-346` |
| `` `보기:` 줄 누락 — 발문이 [보기]를 지시하므로 칩이 반드시 있어야 한다 `` | `chips.length === 0` | `:347-349` |
| `빈칸 N개 (M개 필요)` | `blanks.length !== blankCount` | `:350-352` |
| `빈칸 라벨이 (A)(B) 순이 아님 — 실제 (A)(C)` / `… 실제 없음` | 라벨 시퀀스 불일치 | `:353-358` |
| `주제문에 (A) 가 N회 — 정확히 1회여야 한다` | `countLiteral(topic, label) !== 1` | `:360-366` |
| `주제문 골격에 내용 단어가 N개뿐 — 빈칸을 빼고도 완결된 문장 뼈대가 보여야 한다` | 라벨 제거 후 `[A-Za-z]` 포함 토큰 < 3 | `:368-379` |
| `(A) 정답 누락` | `!blank.answer` | `:383-385` |
| `(A) 정답이 영어가 아님: '<앞 40자>'` | 한글 포함 또는 라틴 없음 | `:387-389` |
| `(A) 정답이 한 단어('x') — 이 유형의 빈칸은 다단어 어구를 받는 자리다` | `tswWordTokens(answer).length < 2` | `:390-394` |
| `빈칸 정답 중복: '<answer>'` | 두 빈칸 정답이 normalizeWs+소문자 동일 | `:395-397` |
| `(A) 정답이 지문 문장의 통째 복사입니다: "<run>"` | `verbatimCopyRun` (내용토큰 6개 이상일 때만 발화) | `:399-402` |
| `(A) 정답이 주제문에 그대로 노출됨: "<tokens>" — 빈칸 자리에는 라벨만 두어라` | 정답 내용토큰 2개 이상이 주제문(라벨 제거본)에 연속 존재 | `:405-419` |
| `[보기]가 빈칸 정답 어순대로 읽혀 어순이 누설됨` | 재배열 후에도 `chipsAreInAnswerOrder(chips, 빈칸정답 이어붙임)` | `:421-426` |
| `[보기] 칩으로 (A) 정답 조립 불가 — 부족 토큰 "…". 필요한 단어를 보기에 넣어라(같은 단어가 두 번 필요하면 칩도 두 개)` | `findUnbuildableWordBankBlanks` 결함 | `:428-442` |
| `재료 '<앞 50자>' 하나가 (A) 정답을 통째로 담고 있음` | 한 칩이 다단어 정답 전체를 포함 | `:444-455` |

### 4-4. 어댑터 실패(게이트 클린 후 `ADAPT` 차단) — `adapter-topic-sentence-writing.ts:34-47`

`모범답안이 비어 있음` · `배열 재료 N개 (2개 이상 필요)` · `주제문(빈칸판) 누락` · `빈칸 정답 없음` · `빈칸 라벨·정답 누락`
— 게이트가 선행 차단하므로 정상 경로에서는 도달하지 않는다.

### 4-5. 품질 검증기(하네스 `qualityBlocking` 축, 프로덕션은 비차단)

`validators/topic-sentence/writing.ts` + 디스패처 공통. **error 만 적었다.**

| 코드 | 조건 | file:line |
|---|---|---|
| `sw-modelanswer-present` | modelAnswer 공백 | `:59-66` |
| `tsw-mode-xor` | scrambledWords 와 blanks+summaryWithBlanks 가 둘 다 / 둘 다 아님 | `:68-83` |
| `sw-answer-language` | modelAnswer·blanks[].answer 가 영어가 아님 | `:85-111` |
| `tsw-scrambled-too-few` | scrambledWords < 2 | `:115-122` |
| `punctuation-only-chunk` | 구두점 전용 칩 | `:124-136` |
| `scrambled-already-solved` | 칩/보기가 정답 어순으로 읽힘 | `:138-151, 255-269` |
| `tsw-scrambled-reconstruct` | 비미끼 칩에 정답 핵심 내용어 2개 이상 부재 | `:153-184` |
| `sw-summary-blank-marker-count` | summaryWithBlanks 공백 또는 라벨 횟수 ≠1 | `:207-226` |
| `tsw-cloze-degenerate-stem` | 골격 내용어 <3 | `:228-244` |
| `tsw-blank-answer-present` | 빈칸 answer 공백 | `:246-253` |
| `sw-answer-not-in-summary` | 정답 어구가 summaryWithBlanks·koreanGloss·scrambledWords·wordBank 에 통째 노출 | `:271-300, 327-413` |
| `tsw-answer-not-buildable-from-wordbank` | 보기 칩으로 빈칸 정답 조립 불가 | `:302-324` |
| `writing-answer-verbatim-copy` | 정답이 지문 문장의 사실상 통째 복사 | `dispatcher.ts:1072-1091` |
| `explanation-foreign-script` / `explanation-latin-jam` | 해설에 비한글 CJK / `영단어+다` 짜깁기 | `validators/explanation-foreign-text.ts:91-114` |
| `explanation-quoted-token-missing` | 해설이 따옴표로 인용한 영어(12자 이상 조각)가 문항·지문 어디에도 없음 | `validators/explanation-quoted-tokens.ts:117-163` |

**항상 뜨는 무해 경고(warning — 차단 아님):**
`few-key-points`(KILLER — 어댑터가 `keyPoints: []` 를 하드코딩, `adapter-…:84`),
`writing-answer-verbatim-in-passage`(내용토큰 3연속만 겹쳐도 발화 — `dispatcher.ts:1054-1064`),
`AUTOSNAP` corrections. 프로브 7문항에서 실측된 경고 8건이 전부 이 셋이다.

---

## 5. adapter 산출 필드 — `adapter-topic-sentence-writing.ts:49-91`

| 키 | 값 | 비고 |
|---|---|---|
| `direction` | 결정론 합성 발문(한/영) | **AI 문구 금지.** `resolved.topicSentenceWritingDirection` 또는 `buildTswMdDirectionEn` |
| `mode` | `"scrambled"` \| `"cloze"` | 설정값 |
| `topicForm` | `"sentence"` \| `"nounPhrase"` | 설정값 |
| `koreanGloss` | 힌트 — **`힌트:` 가 있을 때만 키 생성** | `[주제 힌트]` 박스로 렌더 |
| ★ `scrambledWords` | 칩 배열 — **scrambled 전용** | cloze 면 키 자체가 없다 |
| ★ `summaryWithBlanks` | 빈칸판 주제문 — **cloze 전용** | 이름은 SUMMARY 유산, 실체는 주제문 |
| ★ `wordBank` | `[보기]` 칩 — **cloze 전용** | |
| ★ `blanks[]` | `{label:"(A)", answer, acceptableVariants?}` — **cloze 전용** | `label` 이 곧 학생 답안 키 `StudentInput.texts["(A)"]` |
| `wordBankDistractors` | 미끼 — 개수 >0 일 때만 키 생성 | **칩 원문 문자열**이어야 런타임 정확일치가 맞는다 |
| `clueMode` / `wordBankFidelity` / `blankAssignment` / `sourceMode` / `sourceSentenceParaphrase` | 설정 복제 메타 | 렌더 마스킹·검증기가 읽는다 |
| `modelAnswer` | 완성 답안(scrambled=주제문, cloze=치환 합성본) | |
| `acceptableVariants` | **scrambled 전용 최상위** 허용답 | cloze 의 동치는 `blanks[].acceptableVariants` |
| `scoringCriteria` | 채점기준 — 있을 때만 키 생성 | |
| `correctAnswer` | `modelAnswer` 와 동기화 | 저장 시 `correctAnswer` 컬럼 |
| `explanation` | 한국어 해설 | |
| `keyPoints` | **항상 `[]`** | 합성 금지(`:84`) — KILLER `few-key-points` 경고의 원인 |
| `tags` | `[]` | |
| `difficulty` | `ctx.rawDifficulty` | |

### 이 유형에만 있는 계약

- ⚠ **`options` 키를 아예 만들지 않는다**(키 부재 — `undefined` 도 아님). 비어 있지 않은 `options` 가 있으면
  `validateOptions` 가 `correct-answer-mismatch` 를 발화한다(`adapter-…:9-12`).
- ⚠ **모드 XOR — 반대 모드 필드는 키 자체를 만들지 않는다**(`:55-57, 65-75`).
- ⚠ `blanks[].label` 은 `"(A)"` 괄호 대문자 고정. `"A"`/`"(a)"` 로 새면 저장된 학생 응답과 desync 한다.
- ⚠ `requiredLemmas` 를 만들지 않는다 — TSW 채점 `textMode` 는 항상 `VARIANTS` 라 조회되지 않는다(`:16-19`).
- 반환 직전 `reshuffleTopicSentenceWritingChips` 를 직접 호출한다(`:91`) — 스냅이 이미 같은 변환을
  적용했으므로 멱등 no-op.

### 저장 매핑

`postProcessQuestion` 은 PASSTHROUGH(`question-postprocess/types.ts:81`) → `structuredData` 는 위 그대로 +
`_typeId`/`_typeLabel`/`_generationPlan`/`difficulty`. `type` 은 `options` 가 없으므로 **`SHORT_ANSWER`**,
`correctAnswer` 는 `q.correctAnswer`(= modelAnswer).

### 채점 왕복 (프로브 실측)

| 모드 | `inputKind` / `textMode` | 필드 키 | 부분점수 |
|---|---|---|---|
| scrambled | `TEXT_SINGLE` / `VARIANTS` | `answer` | 없음 |
| cloze | `TEXT_MULTI` / `VARIANTS` | `(A)`, `(B)` | 있음(빈칸별 균등 배점) |

프로브 실측: 모범답안·허용답 → `CORRECT` / 오답 → `WRONG` / cloze 한쪽만 → `PARTIAL 2점` / 동치(B) → `CORRECT`.

---

## 6. 생성 노브

`resolveTopicSentenceWritingSettings(rawSettings, difficulty)` — `question-type-generation-settings/topic-sentence-writing.ts:189-315`.
**난이도 프리셋이 먼저 깔리고, 강사 설정이 덮고, 호환성 매트릭스(F)가 마지막에 강제한다.**
qbank 에서는 ITEM 헤더 `settings:` JSON 이 `{TOPIC_SENTENCE_WRITING: {...}}` 로 병합돼 nested 경로로 읽힌다.

### 6-1. 난이도 프리셋 (실측 — `:121-182`)

| 노브 | BASIC | INTERMEDIATE | KILLER |
|---|---|---|---|
| `mode` | scrambled | scrambled | **cloze** |
| `topicForm` | **nounPhrase** | sentence | sentence |
| `hintEnabled` | true | true | **false** |
| `hintLooseness` | literal | natural | natural |
| `chunking` | **chunk** | word | word |
| `distractors` | **0** | 1 | 2 |
| `fidelity` | verbatim | verbatim | **inflected** |
| `scrambleOrder` | random | scrambleStrong | scrambleStrong |
| `blankCount` | 1 | 1 | **2** |
| `blankAssignment` | separate | separate | separate |
| `clueMode` | none | none | none |
| `sourceMode` | explicit | paraphrase | **inference** |
| `sourceSentenceParaphrase` | false | false | **true** |
| `scoringGranularity` | keyword | keyword | **rubric** |
| 배점(발문) | `[2점]` | `[3점]` | `[4점]` |

### 6-2. 노브 전수표

| 키 | 타입 | 기본값 | 클램프/허용 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `mode` | `"scrambled"\|"cloze"` | 난이도 프리셋 | 두 값만 | **골격 A/B 를 통째로 가른다.** scrambled=`주제문:`+`칩:`, cloze=`주제문:`(라벨판)+`보기:`+`정답(X):` |
| `topicForm` | `"sentence"\|"nounPhrase"` | 프리셋 | 두 값만 | 완성 답안 단어수 게이트: sentence 6~24 / nounPhrase 3~16 (`gate-…:42-45`). nounPhrase 는 정동사 금지 |
| `hintEnabled` | boolean | 프리셋 | — | true → `힌트:` **필수**, false → `힌트:` 쓰면 스냅이 버림 |
| `hintLooseness` | `literal\|natural\|gist` | 프리셋 | 3값 | 힌트 강도만 바꾼다. 게이트 영향 없음(단, 어느 강도든 영어 정답 어구 2연속 노출은 반려) |
| `chunking` | `word\|chunk\|mixed` | 프리셋 | 3값 | `칩:`/`보기:` 의 분할 단위. chunk=4~7덩어리, word=관사·전치사도 개별 칩 |
| `distractors` | number | 프리셋(0/1/2) | **0~3** (`prompts-…:56-57`, `:68-75`) | 개수 게이트. >0 이면 발문에 "(쓰지 않는 단어가 포함됨)" 이 붙는다 |
| `fidelity` | `verbatim\|inflected\|mixed` | 프리셋 | 3값 | ★ **verbatim+scrambled 만 미끼 파생 레짐.** 그때는 `미끼:` 줄을 쓰지 않고, 타일링이 과부족 0이어야 한다. 그 외는 `미끼:` 선언 필수 + 어간 커버리지 판정 |
| `scrambleOrder` | `random\|scrambleStrong` | 프리셋 | 2값 | 프롬프트 지시만. 실제 어순 누수는 스냅의 결정론 재배열이 집행 |
| `blankCount` | number | 프리셋(1/1/2) | **1~2** (`prompts-…:54-55`) | cloze 라벨 개수. `(A)` 또는 `(A)(B)` |
| `blankAssignment` | `separate\|shared` | 프리셋 | 2값 | cloze && blankCount≥2 일 때만 유효, 아니면 `separate` 강제(`settings:294-296`) |
| `clueMode` | `none\|firstLetter\|wordCount` | none | 3값 | 학생 화면 단서만. 마크다운 형식 무변화 |
| `sourceMode` | `explicit\|paraphrase\|inference` | 프리셋 | 3값 | 표적 명제를 "명시 결론 / 환언 / 추론"으로 잡으라는 설계 지시(`prompts-…:125-129`) |
| `sourceSentenceParaphrase` | boolean | 프리셋 | — | true → 빈칸 밖 고정 프레임도 지문 표면과 다르게 |
| `scoringGranularity` | `exact\|keyword\|rubric` | 프리셋 | 3값 | **rubric → `채점기준:` 2개 이상 필수** (`gate-…:218-222`) |
| `stemLanguage` | `"ko"\|"en"` | `"ko"` | 2값 | 발문 언어. **마크다운은 그대로**(힌트·해설·채점기준은 항상 한국어) — `lane-…:191-195` |
| `difficulty` | `BASIC\|INTERMEDIATE\|KILLER` | ITEM 헤더 | 3값 | 프리셋 전체 + 배점 |

### 6-3. 호환성 강제(F) — `settings:290-296`, `lane-…:82-84`

```ts
effectiveBlankCount     = (mode === "cloze" && topicForm === "nounPhrase") ? 1 : blankCount;
effectiveBlankAssignment= (mode === "cloze" && effectiveBlankCount >= 2) ? blankAssignment : "separate";
```

실측: `{mode:"cloze", topicForm:"nounPhrase", blankCount:2}` → `blankCount=1`.
`{blankCount:3}` → 2로 클램프. `{blankCount:0}` → 1. `{distractors:5}` → 3. `{distractors:-1}` → 0.

---

## 7. 함정 (코드 근거 있는 것만)

1. **`정답:` 을 scrambled 에 쓰면 문항이 죽는다.** 라벨 없는 `정답:` 한 줄만 있어도
   `sawAnswerLine=true` 가 되어 모드 XOR 로 반려(`parser-…:366-369`, `gate-…:231-235`). 실측 확인.
   → 26유형 공용 템플릿에 `정답:` 을 박지 마라.

2. **verbatim scrambled 에 `미끼:` 를 쓰면 계약 위반이다(무해하지만).** 파서·스냅이 무시하고
   칩 타일링으로 재파생한다(`snap-…:322-338`). 선언값이 파생값과 다르면 corrections 만 남고 파생값이 이긴다.
   → **verbatim 에서는 미끼를 "정답에 안 쓰이는 칩"으로 칩 나열 안에 섞기만 하면 된다.**

3. **cloze 는 미끼를 파생하지 않는다.** 실측: KILLER cloze 에서 `미끼:` 줄을 지우면
   「미끼 0개 (설정은 정확히 2개)」 반려. → **cloze 이고 distractors>0 이면 `미끼:` 줄 필수.**

4. **영어 어구 안의 슬래시가 재료를 쪼갠다.** `and/or`, `he/she`, `24/7` 전부 금지(`parser-…:207-212`).
   실측 2건 반려 확인. 파이프 `|` 도 같다.

5. **`←` 이하가 잘린다.** 출력 형식 리터럴의 화살표 주석을 그대로 에코하면 마지막 재료에 붙어 있던
   한국어가 잘리는 대신, 정당한 화살표도 함께 죽는다(`parser-…:130`).

6. **`라벨: 값` 을 두 줄로 접으면 값이 잘린다.** 이어붙임 가드가 소문자 시작만 허용하므로
   대문자로 이어지는 줄은 붙지 않는다(`parser-…:186`). verbatim 경로에서는 「부족/잉여 토큰」으로,
   비-verbatim 에서는 「모범답안이 잘려 들어왔거나…」로 반려된다(`gate-…:311-322`).

7. **`해설:` 뒤에 아무것도 두지 마라.** 다음 라벨 머리가 없으면 뒤의 모든 줄이 해설로 흡수된다.
   실측: 사족 한 줄 추가 → **게이트 클린인데 해설이 오염**(조용한 사고, `parser-…:255-260`).

8. **목록 항목을 알려진 라벨+콜론으로 시작하지 마라.** `- 해설: …` 은 섹션을 끊고 그 항목을
   해설로 납치한다. 실측: 루브릭 2개 → 1개 → 「채점기준 1개」 반려.

9. **목록 안에 빈 줄 2연속을 두지 마라.** 그 아래가 통째로 사라진다(`parser-…:232-236`). 실측 확인.

10. **주제문 안 placeholder 는 정확히 `(A)`.** `(a)`·`( A )`·`[A]` 전부 「(A) 가 0회」 반려
    (`gate-…:360-366`, `countLiteral` 은 순수 문자열 카운트).

11. **빈칸 정답은 반드시 2단어 이상.** 한 단어면 「이 유형의 빈칸은 다단어 어구를 받는 자리다」(`gate-…:390-394`).

12. **정답이 지문 문장의 통째 복사면 반려.** 내용토큰(≥4자) 6개 이상 & 그 중 80% 이상이 지문에
    연속 존재하면 발화(`gate-…:64-72`). **패러프레이즈·구문 전환·상위어 환언을 최소 1개 넣어라.**
    실측: 지문 첫 문장을 그대로 주제문으로 쓰면 반려.

13. **힌트에 영어 정답 어구를 넣지 마라.** 힌트와 정답이 내용토큰 2개만 연속 겹쳐도 반려(`gate-…:158-169`).
    실측: `힌트: 핵심은 compact building 입니다.` → 반려. **힌트는 순수 한국어로 써라.**

14. **한 칩이 정답 전체(또는 다단어 빈칸 정답 전체)를 담으면 안 된다** — 배열/영작이 받아쓰기가 된다
    (`gate-…:250-260`, `:444-455`).

15. **칩이 공급하지 않는 내부 구두점을 정답에 넣지 마라.** 스냅이 구두점 제거형을 허용답으로
    파생해 만점 불가를 막지만(`snap-…:164-182, 297-309`), 정석은 부호를 칩에 붙여 주는 것이다(`together,`).
    문말 마침표는 채점이 흡수하므로 무관.

16. **`허용답:` 은 같은 칩 멀티셋으로 조립되는 등가 어순만.** 토큰 구성이 다르면 스냅이 절삭하고
    (`snap-…:283-296`), 잔여가 있으면 게이트가 반려(`gate-…:325-330`).
    `동치(X):` 는 **보기 칩으로 조립 가능해야** 살아남는다(`snap-…:240-268`).

17. **cloze 에 `허용답:` 을 쓰면 조용히 사라진다.** 파서가 scrambled 에서만 읽는다(`parser-…:402-403`).
    실측: `acceptedVariants=[]`. 등가 답은 반드시 `동치(X):` 로.

18. **`채점기준:` 은 rubric 일 때만 의미가 있다.** keyword/exact 에서 써도 반려되지는 않지만
    `structuredData.scoringCriteria` 로 그대로 저장돼 학생 화면 밖 산출물이 늘어난다.

19. **`(A)(B)` 정답이 같으면 반려**(`gate-…:395-397`). 두 빈칸은 서로 다른 어구를 받아야 한다.

20. **장식 0.** 파서가 굵게·불릿·헤딩·표를 관용하지만 **관용은 계약이 아니다.**
    유형마다 관용 범위가 다르고(`00-contract.md §8`), 값 오염은 게이트를 통과해 **채점에서만** 터진다.

---

## 8. 출제 포인트 다각화 축

> **같은 지문에서 5~8문항.** 답만 다르고 묻는 방식이 같으면 1문항의 N개 사본이다(헌법 §7).
> 이 유형은 선지가 없어 "오답 5개 재설계"라는 다각화 수단이 없다. 대신 **모드·형상·재료 설계**라는
> 다른 유형에 없는 축이 열려 있다 — 그게 이 유형의 다각화 자산이다.
> 하네스가 결정형으로 집행하는 것은 `point:` 문자열 중복(`POINT_DUPLICATE`)과
> `modelAnswer` 앞 90자 중복(`ANSWER_DUPLICATE`, `lane-…:260-264`) 둘뿐이다. **나머지는 설계 책임이다.**

### 8-A. 노브로 달라지는 축 (코드 근거 — ITEM `settings:` 로 문항마다 바꿀 수 있다)

| # | 축 | 값 | 학생의 인지 작업이 어떻게 달라지나 | 근거 |
|---|---|---|---|---|
| A1 | **모드** | `scrambled` ↔ `cloze` | 배열=전량 소비 조립(어순 판정) / 빈칸=골격 주어짐(핵심 어구 생산). **가장 큰 축** | `prompts-…:239-275` |
| A2 | **주제 형상** | `sentence` ↔ `nounPhrase` | 문장은 술어까지 판정(무엇이 무엇을 한다) / 명사구는 관계 명명(무엇이라 부를 것인가) | `gate-…:42-45` |
| A3 | **재료 단위** | `chunk` ↔ `word` ↔ `mixed` | 청크=의미 덩어리 배치 / 단어=전치사·관사까지 통사 재구성. 같은 표적도 난이도가 통째로 바뀐다 | `prompts-…:135-139` |
| A4 | **미끼 수** | 0 / 1 / 2 / 3 | 0=전량 사용(발문이 그렇게 약속) / >0=선별 판단 추가 | `prompts-…:150-157` |
| A5 | **어형 정합** | `verbatim` ↔ `inflected` ↔ `mixed` | verbatim=배치만 / inflected=시제·수일치까지 학생이 만든다 | `prompts-…:140-145` |
| A6 | **빈칸 수** | 1 ↔ 2 | 1=단일 어구 생산 / 2=대조 양극 배분(한쪽 오류가 반대쪽을 무너뜨림) | `prompts-…:318-327` |
| A7 | **표적 출처** | `explicit` ↔ `paraphrase` ↔ `inference` | 명시 결론 확인 / 환언 / 문단 간 논리 접기 | `prompts-…:125-129` |
| A8 | **힌트** | on(literal/natural/gist) ↔ off | 힌트 없음이 가장 어렵다. gist 는 방향만, literal 은 거의 직역 | `prompts-…:179-186` |
| A9 | **채점 입도** | `keyword` ↔ `rubric` | rubric 이면 `채점기준:` 2줄이 붙어 부분점수 설계가 문항의 일부가 된다 | `gate-…:218-222` |
| A10 | **발문 언어** | `ko` ↔ `en` | 표층 형식만 — 지시문 독해 부담 추가 | `lane-…:116-138` |
| A11 | **난이도** | BASIC / INTERMEDIATE / KILLER | A1~A9 를 한 번에 갈아 끼우는 프리셋. 유닛 배분은 헌법 §4 | `settings:121-182` |

> **프로브 실증**: 7문항 중 ITEM 4 는 `{"blankCount":1}`, ITEM 7 은
> `{"mode":"cloze","distractors":1,"stemLanguage":"en"}` 로 프리셋을 덮어 전부 게이트 클린이었다.
> 발문이 `다음 글의 주제문 빈칸 (A)에…` / `Referring to the [주제 힌트] box, write the words for blanks (A) …`
> 로 실제로 갈렸다.

### 8-B. 설계로 달라지는 축 (교육적 판단 — 코드가 강제하지 않는다)

| # | 축 | 무엇을 달리하나 | 왜 이게 다른 문항인가 |
|---|---|---|---|
| B1 | **표적 명제의 논지 위치** | 도입 통념의 귀결 / 전환점 / 기제 / 사례의 함의 / 최종 결론 | 같은 지문에서도 "무엇을 주제로 볼 것인가"가 달라진다. 프로브 ITEM 1(결론 결합효과) vs ITEM 5(도입 통념의 대가) |
| B2 | **표적의 추상화 층위** | 결론 재진술 → 두 문장 통합 → 문단 간 추론 상위 명제 | `sourceMode` 와 짝지어 쓰면 A7 이 실제 인지 부하로 번역된다 |
| B3 | **표적 명제의 통사 구조** | 단순 SVO / `not A but B` / `only when …` / `less X than Y` / 분사 수식 | 구조가 곧 판정 지점이다. 대조 구조는 극성 오판이 즉시 오답이 되게 만든다 |
| B4 | **미끼가 경쟁하는 자리** | 동사(방향) / 명사(범위) / 접속(논리) / 한정어(강도) | 프로브: `increases`(방향 반대), `separately`(조건의 극성), `widening/highways`(소재는 맞지만 논지 반대) |
| B5 | **미끼의 매력 코드(L)** | L1 핵심명사 재사용 / L3 통념 공명 / L4 위치 인접 / L7 다른 지점 참 | 헌법 §3. **무관한 단어는 미끼가 아니라 장식이다**(`prompts-…:152`) |
| B6 | **cloze 골격이 남기는 정보량** | 프레임이 논리 관계를 다 드러냄 ↔ 관계만 남기고 내용은 전부 빈칸 | `Congestion eases not by (A) but by (B) …`(관계 노출) vs `Congestion eases only where (A) …`(조건만 노출) |
| B7 | **빈칸이 받는 품사·역할** | 명사구 / 동명사구 / 형용사구 / 관계 명명 | 프로브 ITEM 3(A=동명사구, B=명사구 병렬), ITEM 7(관계 명명 명사구) |
| B8 | **어느 문장 쌍을 근거로 삼는가** | 1·2문장 / 3·4문장 / 4·5문장 | 헌법 §1-2 근거 이중화. 문항마다 근거 쌍을 옮기면 학생이 지문 전역을 훑게 된다 |
| B9 | **허용답/동치의 범위** | 없음 / 등가 어순 1개 / 동의 어구 2개 | 정답 유일성을 어디까지 느슨하게 볼지가 문항 성격을 바꾼다. 단 오답 흡수는 금물(스냅이 절삭) |
| B10 | **해설이 짚는 흔들림 지점** | 어느 단어를 먼저 집는가 / 어느 극을 뒤집는가 / 어느 하위 주제로 빠지는가 | 해설 2문장 중 두 번째 문장의 내용축. 문항마다 달라야 다각화가 학습으로 연결된다 |

### 8-C. 5~8문항 조합 레시피 (프로브에서 실제로 통과한 7문항 구성)

| # | 난이도 | 모드·형상 | 노브 오버라이드 | 표적 위치 | 미끼 경쟁 자리 |
|---|---|---|---|---|---|
| 1 | BASIC | scrambled · nounPhrase · chunk | (프리셋) | 결론(결합 효과) | 없음(전량 사용) |
| 2 | INTERMEDIATE | scrambled · sentence · word | (프리셋) | 결론(인과 방향) | 동사 극성 `increases` |
| 3 | KILLER | cloze · sentence · 2빈칸 | (프리셋) | 추론 상위 명제(`not A but B`) | 소재 동형 `widening/highways` |
| 4 | KILLER | cloze · sentence · 1빈칸 | `{"blankCount":1}` | 조건 구조(`only where`) | 동일 소재 재활용 |
| 5 | BASIC | scrambled · nounPhrase · chunk | (프리셋) | **도입 통념의 대가** | 없음 |
| 6 | INTERMEDIATE | scrambled · sentence · word | (프리셋) | 동시성 조건 재진술 | 조건 극성 `separately` |
| 7 | BASIC | **cloze** · nounPhrase · 1빈칸 | `{"mode":"cloze","distractors":1,"stemLanguage":"en"}` | 두 조건의 **관계 명명** | 반대 관계 `separation` |

같은 프리셋을 두 번 쓴 쌍(1·5, 2·6)은 **B1(논지 위치)와 B4(미끼 자리)로 갈랐다.**
프리셋만 돌려서는 3문항이 한계다 — 5문항 이상은 반드시 B축이 개입해야 한다.

### 8-D. 이 유형에서 다각화가 실패하는 전형

- **같은 명제를 모드만 바꿔 두 번 묻기** — `ANSWER_DUPLICATE` 가 문자열이 다르면 통과시킨다.
  프로브 ITEM 3·4 는 문자열이 달라 게이트를 통과하지만, 실전에서는 **표적 명제의 논지 위치까지 옮겨야** 한다.
- **미끼를 매번 "무관한 단어"로 채우기** — 즉시 소거돼 함정이 아니다(`prompts-…:152`). 문항마다
  경쟁 자리(B4)를 옮겨야 미끼가 실제 판정 부하가 된다.
- **전 문항을 결론 문장 재진술로 통일** — B1 이 하나로 고정되면 5문항이 사실상 1문항이다.
- **`허용답:`/`동치:` 를 남발** — 스냅이 절삭하며 corrections 를 쌓고, 살아남은 것이 오답을 흡수하면
  정답 유일성(헌법 §1-1)이 무너진다.

---

## 검증 기록

`qbank/work/_probe-TOPIC_SENTENCE_WRITING.ts` — `./node_modules/.bin/tsx` 실행.

```
itemCount=7 laneSupported=true ok=true
blocking=0 qualityBlocking=0 warnings=8
```

- 7문항 전량 `parseAndGate` → `adapt` → `postProcessQuestion` → `validateQuestionQuality` 통과.
- `POINT_DUPLICATE` / `ANSWER_DUPLICATE` 미발화.
- 경고 8건은 전부 무해 계통(`writing-answer-verbatim-in-passage` 3 · `few-key-points` 2 · AUTOSNAP 3).
- 채점 왕복: scrambled 모범답안/허용답 `CORRECT`, 오답 `WRONG`; cloze 양쪽 `CORRECT 4점`,
  한쪽만 `PARTIAL 2점`, 동치(B) `CORRECT`.
