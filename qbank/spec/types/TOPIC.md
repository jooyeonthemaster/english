# 주제 추론 (TOPIC)

> 분류: **선택형(객관식)** · 지문변형: **없음(PASSTHROUGH)** · 정답 머리표: **`정답:`** · 최소 지문 길이: **코드상 하한 없음**
> (`lane-topic.ts:121-139` 의 `isEligible` 은 선지/정답 개수만 본다. `feasibility.ts:50` 의 40단어 하한은 SENTENCE_ORDER 전용이라 TOPIC 에는 적용되지 않는다. 교육적 하한은 §8 참조.)

**검증 상태**: `qbank/work/_probe-TOPIC.ts` 로 §2 골격 6문항 유닛을 실제 파이프라인에 태워 `blocking 0 / qualityBlocking 0 / ok=true` 확인 완료(2026-07-28).

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

**주제 = 중심 화제 + 그 화제에 대한 필자의 관점.** 둘 중 하나만 있으면 주제가 아니다 — 화제만 남으면 *소재*, 주장 문장이면 *요지(MAIN_IDEA)* 다 (`prompts-topic.ts:300-302`).

학생이 해야 하는 일은 "이 글이 무엇에 관한 글인가"가 아니라 **"이 글이 그것에 대해 무엇을 판단했는가"** 를 한 구(phrase)로 압축하는 것이다. 그래서 이 유형의 최다 실패는 오답을 못 만드는 것이 아니라 **정답이 소재로 전락하는 것**이고, 프롬프트가 '관점 소거(소재만 맞음)'를 다섯째 오답 기제로 따로 만들어 그 자리를 오답에 먼저 배정하게 하는 이유가 그것이다 (`prompts-topic.ts:16-18, 88-92`).

### 다른 유형과의 경계
| 축 | TOPIC | 이웃 유형 |
|---|---|---|
| 선지 표면 | **압축된 구(명사구·의문사절)**. 완전한 진술문 금지, 마침표로 끝내지 않음 (`prompts-topic.ts:159`) | MAIN_IDEA 는 완전한 주장 진술문 |
| 선지 기본 언어 | **영어**(`optionLanguage` 기본 en — `language.ts:19`) | MAIN_IDEA·TOPIC_MAIN_IDEA 는 기본 한국어 |
| 지문 | **한 글자도 변형 없음.** 지문 재출력도 금지 (`prompts-topic.ts:303`) | BLANK/GRAMMAR/ORDER 계열은 구조적 변형 |
| 게이트가 지키는 것 | 지문 재구성 불변식이 **없다.** 선지 집합의 형상과 정답 축뿐 (`gate-topic.ts:5-9`) | 변형 유형은 재구성 대조가 최강 불변식 |
| 발문 | **모델이 만들지 않는다.** 어댑터가 (극성 × 정답 개수 × 발문 언어) 순수 함수로 생성 (`lane-topic.ts:84-108`) | 대부분 유형은 발문도 모델 산출 |

**발문을 저작하지 마라.** 마크다운에 `발문:` 줄을 쓰면 파서가 줍지 않고(머리표 3종에 없음), 어댑터가 만든 발문이 그대로 나간다. 파싱 구획상 그 줄이 선지 구역에 있으면 직전 선지의 이어진 뒷줄로 접혀 **선지를 오염시킨다**(`parser-topic.ts:196-202`, FOLD_STOP_RE 에 `발문` 이 있어 실제로는 접기가 멈추지만, 선지 구역 안에서는 그냥 버려진다).

---

## 2. 마크다운 골격

### 2-A. 복붙용 골격 (5지·1정답·영어 선지 = 기본 설정)

```md
① <오답 선지 — 영어 명사구/의문사구, 마침표 없음>
② <정답 선지 — 중심 화제 + 필자의 판단이 한 구 안에>
③ <오답 선지>
④ <오답 선지>
⑤ <오답 선지>
정답: ②
해설: <2문장. 논지 전개를 근거로 중심 화제와 필자의 관점을 연결해 정답을 도출. 합니다체>
오답:
① <기제 이름 — 이 선지를 고르는 학생이 글의 어느 지점에서 멈췄는지, 왜 주제가 아닌지 1문장>
③ <같은 형식>
④ <같은 형식>
⑤ <같은 형식>
```

- 선지 줄은 **원문자 + 공백 + 본문** 한 칸뿐이다. 정답 표시 칸을 만들지 마라(§3 R7).
- `정답:` 줄에는 **라벨만**. 정답 선지 본문을 반복하지 마라.
- `오답:` 목록에는 **정답 라벨을 넣지 않는다**(개수 = optionCount − answerCount).
- 굵게·헤딩·불릿·인용·표·백틱을 **쓰지 않는다**(파서가 흡수하기는 하나 계약이 아니다 — 00-contract §8).

### 2-B. 비표준 형식 골격

**부정 극성(`answerPolarity: NEGATIVE`)** — 형식은 동일하고 **의미만 반전**한다. `정답:` 은 "주제로 **부적절한**" 선지이고, `오답:` 목록의 넷은 전부 **타당한** 주제 진술이라 그 해설은 "왜 타당한가"를 쓴다 (`prompts-topic.ts:232-234`).

```md
① <타당한 주제 진술>
② <타당한 주제 진술>
③ <타당한 주제 진술>
④ <타당한 주제 진술>
⑤ <명백히 부적절한 진술 = 정답>
정답: ⑤
해설: <이 글의 주제가 무엇인지 먼저 밝히고, 정답 선지가 그 주제에서 어떻게 벗어나는지. 2문장. 합니다체>
오답:
① <이 선지가 이 글의 주제로 왜 타당한지 지문 근거로 1문장>
② <같은 형식>
③ <같은 형식>
④ <같은 형식>
```

**복수 정답(`answerCount ≥ 2`)** — `정답:` 줄에 `, ` 로 병기한다 (`prompts-topic.ts:222`, 파싱은 `parser-topic.ts:231` 이 `,，·、/` 를 전부 받는다).

```md
① … ② … ③ … ④ … ⑤ … ⑥ … ⑦ … ⑧ …
정답: ②, ③
해설: <…>
오답:
① … ④ … ⑤ … ⑥ … ⑦ … ⑧ …    (= 8 − 2 = 6개)
```

### 2-C. ★ 검증된 정상 픽스처 전문 — `scripts/_test-md-topic.ts:58-69` 원문 그대로

지문(`scripts/_test-md-topic.ts:42-48`):

```
City planners once assumed that the coolest streets were simply the ones with the toughest trees. Newer measurements tell a different story. A single heat-resistant specimen surrounded by open pavement barely lowers the air around it. When canopies overlap, however, the shade becomes continuous and the street holds its cooler air through the afternoon. Planting fewer species in an unbroken line therefore outperforms scattering a catalogue of hardy varieties. What matters for cooling is not the pedigree of each tree but the continuity of the cover they form together.
```

마크다운:

```md
① the rising popularity of heat-resistant trees in modern cities
② why continuous tree cover outweighs species choice in cooling streets
③ how urban trees can fully replace mechanical cooling systems
④ the limited effect of shade on afternoon street temperatures
⑤ the growing variety of trees planted along city streets
정답: ②
해설: 이 글은 강한 수종을 고르면 된다는 통념을 뒤집어, 거리의 기온을 낮추는 것은 나무 하나의 강인함이 아니라 수관이 이어져 만들어지는 그늘의 연속성임을 논증합니다. 따라서 중심 화제와 필자의 판단을 함께 담은 진술이 주제로 가장 적절합니다.
오답:
① 도입부 소재 함정으로, 논지가 꺾이기 전의 통념일 뿐 필자가 반박하려고 꺼낸 배경입니다.
③ 범위 이탈로, 지문이 말하지 않은 해결책까지 논의를 넓힌 진술입니다.
④ 관점 반전으로, 핵심어를 그대로 쓰면서 필자의 평가 방향만 뒤집은 진술입니다.
⑤ 관점 소거로, 중심 화제는 맞지만 필자의 판단이 빠져 소재에 머무릅니다.
```

이 픽스처는 `gateMdTopic(...).length === 0` 으로 고정돼 있다(`scripts/_test-md-topic.ts:101-105`). 본 정찰에서도 `_probe-TOPIC.ts` C1 으로 재확인했다.

### 2-D. 본 정찰이 새로 저작·검증한 실물 (다른 지문, 통과 확인)

지문:

```
Historians of technology often describe the printing press as a machine that spread ideas faster. That description is accurate but shallow. What changed most was not the speed of copying; it was the stability of the copy. Before print, every manuscript drifted a little as scribes worked, so two readers rarely argued from identical pages. Print froze a text in place, and that fixity let scholars in distant cities cite the same line and check one another's claims. Errors could now be located, named, and corrected in later editions. The press mattered less because it made words travel and more because it made disagreement precise.
```

```md
① the growing speed at which printed ideas reached distant readers
② why the fixity of printed text mattered more than its speed
③ how printing removed every error from later scholarly editions
④ the limited importance of textual stability in scholarly disputes
⑤ the spread of printed books across distant European cities
정답: ②
해설: 이 글은 인쇄술의 의의가 복제 속도가 아니라 복제본의 안정성에 있다고 보고 "it was the stability of the copy"라는 재정의를 논지의 축으로 삼습니다. 마지막 문장이 그 판단을 "it made disagreement precise"로 다시 못 박으므로, 중심 화제와 필자의 판단을 함께 담은 진술이 주제로 가장 적절합니다.
오답:
① 도입부 소재 함정으로, 필자가 "accurate but shallow"라고 낮춰 평가한 통설을 그대로 주제로 삼은 진술입니다.
③ 범위 이탈로, 지문은 오류를 찾아 이후 판본에서 고칠 수 있게 되었다고 말할 뿐 오류가 사라졌다고 하지 않습니다.
④ 관점 반전으로, 안정성이라는 핵심어를 그대로 실은 채 필자가 부여한 평가 방향만 뒤집은 진술입니다.
⑤ 관점 소거로, 중심 화제는 맞지만 필자의 판단이 빠져 소재에 머무는 진술입니다.
```

> 해설에 영어를 **따옴표로 인용**한 것은 헌법 §5(근거 지목 = 직접 인용) 준수인 동시에 위험 지점이다 — 인용 조각(12자 이상)이 지문·문항 표면에 **축자로 실재하지 않으면** `explanation-quoted-token-missing` **error** 가 난다 (`explanation-quoted-tokens.ts:117-162`). 인용하려면 반드시 지문에서 복사해 붙여라.

### 2-E. qbank 유닛 컨테이너 (md-qgen 계약 아님 — 하네스 규약)

```md
<!-- ITEM 1
difficulty: BASIC
point: 마지막 문장의 재정의 — 속도가 아니라 안정성이라는 축을 명시 확인
craft: 정답은 재정의 문장의 압축, ①은 도입부 통념, ④는 관점 반전
settings: {"optionLanguage":"ko"}
-->
...위 §2-A 마크다운 그대로...
```

- 헤더 정규식: `/<!--\s*ITEM\s+(\d+)\s*\n([\s\S]*?)-->/g` (`qbank/harness/qgen-core.ts:47`). 필드는 `^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$` 로만 읽힌다(`qgen-core.ts:68`).
- `point` 누락 = `CONTAINER` 반려, ITEM 번호 비연속 = 반려, 문항 수 < minItems(기본 5) = `ITEM_COUNT` 반려 (`qgen-core.ts:83-85, 229-235`).
- `settings` 는 **JSON** 이며 `{TOPIC: {...}}` 로 병합돼 리졸버에 들어간다 (`qgen-core.ts:369-377`). **키 이름은 §6 표의 "설정 키"** 를 쓴다(`genericOptionCount` 가 아니라 `optionCount`).

---

## 3. 파서 계약 (★ 가장 중요)

> 우선순위: **파서가 계약이다.** 프롬프트 문구가 느슨해도 아래 규칙을 어기면 필드가 사라진다.

### R0. 문서 구획 분할 — 무엇이 어디서 읽히는가
`parser-topic.ts:248-252`

```ts
const beforeAnswer   = text.split(answerHead)[0] ?? text;      // `정답:` 머리표 앞
const optionSection  = beforeAnswer.split(wrongHead)[0] ?? …;  // 그 안에서 `오답:` 앞
const wrongSection   = text.split(wrongHead)[1] ?? "";         // `오답:` 뒤 전부
```

| 구획 | 범위 | 무엇을 읽는가 |
|---|---|---|
| 선지 | 문서 시작 ~ **첫 `정답:` 머리표 직전** | 라벨 줄 수확(`readLabeledLines`) |
| 정답 | 첫 `정답:` 줄 | 선행 라벨 런만 |
| 해설 | 첫 `해설:` ~ 첫 `오답:` 직전 (없으면 문서 끝) | 산문 |
| 오답 | 첫 `오답:` 뒤 전부 | 라벨 줄 수확 후 정답 라벨 제거 |

**어기면**: 선지를 `정답:` 줄 **아래**에 쓰면 선지 0개 → `선지 0개 (5개 필요)` 로 전량 반려. 해설·오답 구역의 라벨 줄이 선지로 새는 일은 이 구조가 원천 차단한다.

### R1. 선지 줄 정규식 (원문자 — 계약 축)
`parser-topic.ts:65`

```
/^[\s|>*•‧-]*(?:\*\*|__)?\s*([①-⑳])\s*(?:\*\*|__)?\s*[.):：]?\s*(.+)$/
```

- 라벨은 **원문자 ①~⑳** 를 받되 파싱 상한은 ⑩ (`TOPIC_PARSE_LABELS`, `parser-topic.ts:23-25`; `topicLabel()` 이 11 이상을 빈 문자열로 떨군다 — `parser-topic.ts:55`).
- 라벨 뒤 구분자 `.` `)` `:` `：` 는 선택. 본문은 `(.+)` 이므로 **비어 있으면 그 줄은 통째로 버려진다**.
- 줄 끝 공백은 `trimEnd()` 로 제거된 뒤 매칭된다 (`parser-topic.ts:174`).

**어기면**: 라벨이 안 읽히면 그 줄은 **직전 선지의 이어진 뒷줄로 접혀 들어간다**(R5) — 선지 개수가 줄고 앞 선지가 오염된다.

### R2. 평숫자 폴백 (드리프트 흡수용 — 저작 시 쓰지 마라)
`parser-topic.ts:68`

```
/^[\s|>*•‧-]*(?:\*\*|__)?\s*[([]?\s*(\d{1,2})\s*[)\].:：]\s*(?:\*\*|__)?\s*(.+)$/
```

평숫자는 **구분자를 반드시 요구**한다(`1. x` / `(1) x` / `1) x` 는 OK, `1 x` 는 라벨이 아님). 원문자 줄과 평숫자 줄이 섞이면 **같은 라벨은 원문자가 이긴다**(`parser-topic.ts:203-205`). 결과는 `topicLabelIndex` 오름차순으로 정렬된다.

**어기면**: 저작물에서 평숫자를 쓸 이유가 없다. 관용은 모델 드리프트 흡수용이지 계약이 아니다.

### R3. 키워드 머리표 — `정답:` `해설:` `오답:` 셋뿐
`parser-topic.ts:126-132` (`topicKeywordHead(keyword)`, **캡처 그룹 없음** — split 에 그대로 쓰인다)

```
KEY_PREFIX = "^[\\s>|#*_~`•‧+-]*\\s*"
KEY_SUFFIX = "\\s*(?:\\*\\*|__|[*_~`])?\\s*[:：][ \\t]*(?:\\*\\*|__|[*_`~])*[ \\t]*"
HEAD_ANSWER  = topicKeywordHead("정답")   // parser-topic.ts:208
HEAD_EXPLAIN = topicKeywordHead("해설")   // parser-topic.ts:209
HEAD_WRONG   = topicKeywordHead("오답")   // parser-topic.ts:210
```

흡수되는 것: 앞 장식(`- > # | * _ ~ \`` `•‧+`) · `**정답:**` · `**정답**:` · `_정답_:` · 전각 콜론 `：` · 콜론 앞뒤 공백 · 콜론 **뒤** 장식(`정답: **②**`, `정답: \`②\``).
흡수되지 **않는** 것: `【정답】:` 처럼 키워드를 감싼 미지의 장식 — 파서가 못 읽고, **접기도 멈춘다**(R6 이 별도로 방어) (`_test-md-topic-wave2.ts:273-280`).

**어기면**: `정답:` 을 못 읽으면 `answers=[]` → 「정답 누락」이라는 **사실과 다른 원인**이 반려 사유가 되고, 이 유형에서 정답은 다른 어디에도 없으므로 복구 불가다 (`_test-md-topic-wave2.ts:34-41`).

> **`## 지문` / `## 발문` / `주제:` 같은 다른 머리표를 문서에 넣지 마라.** 계약 머리표는 셋뿐이다.

### R4. 정답 줄 파싱 — 선행 라벨 런만 취한다
`parser-topic.ts:227-238`

```ts
const line = text.match(new RegExp(`${HEAD_ANSWER}\\s*(.+)$`, "m"))?.[1] ?? "";
const token = String.raw`(?:[①-⑳]|[([]?\d{1,2}[)\].]?)`;
const run = line.match(new RegExp(String.raw`^\s*(${token}(?:\s*[,，·、/]\s*${token})*)`))?.[1] ?? "";
for (const m of run.matchAll(/[①-⑳]|\d{1,2}/g)) { …중복 제거… }
```

- **첫 매치만** 취한다(`m` 플래그 + `.match`). 문서에 `정답:` 이 둘이면 두 번째는 무시된다.
- 복수 정답 구분자: `,` `，` `·` `、` `/` (앞뒤 공백 허용). **표준은 `, `**.
- 라벨 런은 **줄 선두 앵커(`^`)** 라, 라벨 앞에 다른 말이 오면 런이 시작되지 않는다. 라벨 **뒤**의 부가 설명은 무해하다(`정답: ② — 나머지 넷은 …` 통과, `scripts/_test-md-topic.ts:269`).
- 중복 라벨은 조용히 1회로 접힌다(`!labels.includes(label)`).

**어기면**: `정답: 두 번째 선지` 처럼 라벨 없이 쓰면 `answers=[]` → 정답 누락. `정답: 정답은 ②입니다` 도 런이 안 잡혀 동일.

### R5. 라벨 없는 줄은 **직전 항목에 이어 붙는다** (하드랩 보호)
`parser-topic.ts:169-206`

```ts
if (!line.trim())              { last = null; continue; }   // 빈 줄 = 블록 경계
if (!last || FOLD_STOP_RE.test(line) || FOLD_STOP_NOTE_RE.test(line)) { last = null; continue; }
const cont = continuationText(line);        // \s+→" " 후 선두 "- – — • ‧ > | + *" 1개 제거
if (cont) last.text = `${last.text} ${cont}`;
```

**어기면**: 선지 목록 사이에 주석·설명 산문을 끼워 넣으면 그 산문이 **직전 선지 본문에 통째로 붙는다**. 게이트는 언어 축(한국어 혼입)이나 길이로 잡을 수도, 못 잡을 수도 있다 — 잡히지 않으면 **오염된 선지가 그대로 학생에게 출하된다**.

**접기가 멈추는 곳** (여기 걸리면 그 줄은 버려진다):
- 빈 줄 (`parser-topic.ts:176-179`)
- `FOLD_STOP_RE` = `/^[^가-힣A-Za-z0-9]{0,6}(?:정답|해설|오답|지문|발문|밑줄|원문|주제|선지|고침|포인트)[^가-힣A-Za-z0-9]{0,4}[:：]/` (`parser-topic.ts:140-141`)
- `FOLD_STOP_NOTE_RE` = `/^[^가-힣A-Za-z0-9]{0,4}(?:※|⚠|주의|참고|비고|메모|경고|note\b)/i` (`parser-topic.ts:146`)

### R6. 장식 제거 — `stripTopicDecoration(raw, ownLabel?)`
`parser-topic.ts:94-115`

1. `\s+ → " "` 후 trim
2. 선두 `|` · 말미 `|+` 제거(표 행 잔재)
3. `ownLabel` 이 주어졌고 **선두 토큰이 자기 라벨과 같을 때만** 이중 라벨 절단 (`① ① The role`, `① 1) The role`)
4. 감싼 `**`/`__`/`*`/`_` 최대 2겹 벗김 — **부분 강조는 남는다**
5. 감싼 따옴표(`"` `“” ' ‘’`) 1겹 벗김

**어기면**: **다른 선지를 원문자로 지칭하는 오답 해설(`① ②와 달리 …`)의 `②` 는 살아남는다** — 자기 라벨이 아니기 때문이다(`_test-md-topic-wave2.ts:290-335`). 다만 셔플 재매핑(`question-diversity.ts:534-548`)에 의존하게 되므로, **해설에서 선지를 번호로 지칭하지 마라**(프롬프트 지시 `prompts-topic.ts:195`).

### R7. ★ 정답의 유일 진실원은 `정답:` 줄 하나다
`gate-topic.ts:39-40, 102-104` / `parser-topic.ts:36`

선지 줄 끝에 정답 표시를 붙이면 `ANSWER_MARK_RE` 가 정확히 타격한다:

```
/(?:[（([]\s*(?:정답|답|answer|correct(?:\s+answer)?)\s*[)）\]]|[★✔✅]|\s+—\s*정답)\s*$/i
```

**어기면**: `② … (정답)` / `② … ★` → 「② 선지에 정답 표시가 섞임」 반려. 오답 목록에 정답 줄을 끼워 넣으면 파서가 조용히 걸러내지만(`parser-topic.ts:260`) 오답 개수가 어긋나 반려된다.

### R8. 해설 필드 — 개행이 접힌다
`parser-topic.ts:262-265, 213-220`

```ts
text.match(new RegExp(`${HEAD_EXPLAIN}\\s*([\\s\\S]*?)(?=${HEAD_WRONG})`, "m"))?.[1]
  ?? text.match(new RegExp(`${HEAD_EXPLAIN}\\s*([\\s\\S]+)$`, "m"))?.[1] ?? "";
// cleanProse: \s+→" " · trim · 선두/말미 [*_]+ 제거
```

해설은 여러 줄로 써도 **한 줄로 접혀 저장**된다. `오답:` 머리표가 없으면 문서 끝까지 전부 해설이 된다 — **`오답:` 을 빠뜨리면 오답 해설이 통째로 해설에 흡수**되고 「오답해설 0개」로 반려된다.

### R9. 오토스냅이 손대는 것 (0원 보정, `parseAndGate` 안에서 자동 실행)
`parser-topic.ts:287-320` · `lane-topic.ts:159-173`

| 보정 | 조건 | 기록 문구 |
|---|---|---|
| 선지 장식 잔재 제거 | `stripTopicDecoration` 결과가 달라질 때 | `{라벨} 선지 장식 제거` |
| 마침표 **제거** 통일 | 일부 선지만 `.` 로 끝날 때 (전부 끝나면 무보정) | `선지 마침표 표기 통일({라벨들} 의 마침표 제거)` |
| 오답 해설 장식 제거 | 〃 | (기록 없음) |

스냅은 **내용을 지어내지 않는다**(마침표를 붙이지 않고 떼기만 한다). corrections 는 qbank 하네스에서 `AUTOSNAP` **warning** 으로 남는다(`qgen-core.ts:313`) — 저작물은 corrections 0 을 목표로 한다.

### R10. 길이 단위
`parser-topic.ts:326-332` — 영어 선지 = **공백 분리 단어 수**, 한국어 선지 = **공백 제외 글자 수**. §4 의 모든 길이 판정이 이 단위다.

---

## 4. 게이트 체크리스트

> 진실원은 `gateMdTopic()` 이 돌려주는 배열이다(빈 배열 = 클린). 라우트도 qbank 하네스도 이 배열 하나로 차단한다.
> 기본값: `optionCount = q.options.length`, `answerCount = 1`, `optionLanguage = "en"`, `requireWrong = true` (`gate-topic.ts:62-65`). 레인은 여기에 **교사 설정 실값**을 넣는다(`lane-topic.ts:166-170`).

### 4-A. gate-topic.ts 반려 사유 전수

| # | 사유 문자열 (템플릿) | 조건 | file:line |
|---|---|---|---|
| 1 | `선지 {n}개 ({N}개 필요) — 읽힌 라벨 {labels}` | `q.options.length !== optionCount` → **즉시 return, 다른 검사 전부 생략** | `gate-topic.ts:70-76` |
| 2 | `선지 라벨 중복: {label}` | 같은 라벨 2회 | `gate-topic.ts:82` |
| 3 | `선지 라벨 {label} 누락` | ①~Ⓝ 중 빠진 라벨 | `gate-topic.ts:86` |
| 4 | `선지 라벨 {label} 은 범위 밖 — {expected} 만 쓴다` | `topicLabelIndex ≥ optionCount` | `gate-topic.ts:90` |
| 5 | `{label} 선지 텍스트 누락` | 본문 빈 문자열 | `gate-topic.ts:99` |
| 6 | `{label} 선지에 정답 표시가 섞임 — 정답은 '정답:' 줄에만 쓴다` | `ANSWER_MARK_RE` 히트 | `gate-topic.ts:102-104` |
| 7 | `{label} 선지에 한국어가 섞임 — 이 문항의 선지는 영어여야 한다` | en 설정 + 한글 포함 | `gate-topic.ts:106-107` |
| 8 | `{label} 선지에 영문이 없음 — 영어 주제구로 써라` | en 설정 + 라틴 문자 0 | `gate-topic.ts:108-110` |
| 9 | `{label} 선지에 한국어가 없음 — 이 문항의 선지는 한국어여야 한다` | ko 설정 + 한글 0 | `gate-topic.ts:111-113` |
| 10 | `{label} 선지가 너무 짧아 주제 진술이 아님: '{앞40자}'` | units < **en 3 / ko 6** | `gate-topic.ts:116-117` |
| 11 | `{label} 선지가 너무 김({units}) — 주제 선지는 압축된 구다: '{앞50자}…'` | units > **en 25 / ko 80** | `gate-topic.ts:118-122` |
| 12 | `{label} 선지가 지문 표현을 그대로 옮김: '{앞50자}'` | units ≥ 5 이고 `normalizeWs(선지).toLowerCase()` 가 지문에 substring 으로 존재 | `gate-topic.ts:125-128` |
| 13 | `선지 중복: {A} 와 {B} 이 같은 표현` | 정규화 후 동일 본문 | `gate-topic.ts:130-131` |
| 14 | `선지 길이 불균형 — {L}({n}) vs {S}({m}). 서로 비슷한 길이로 맞춰라` | 최장 ≥ 최단×**2.2** **그리고** 차 ≥ **en 4 / ko 12** (동시 충족) | `gate-topic.ts:140-151` |
| 15 | `정답 선지 {L} 만 유독 김({n} vs 2위 {m}) — 길이로 정답이 드러난다` | 정답이 최장 **그리고** ≥ 2위×**1.5** **그리고** 차 ≥ **3** | `gate-topic.ts:152-162` |
| 16 | `정답 누락 — '정답:' 줄이 없거나 라벨을 읽을 수 없음` | `answers.length === 0` | `gate-topic.ts:166-167` |
| 17 | `정답 라벨 {n}개 ({K}개 필요) — 읽힌 값 {labels}` | 개수 불일치 | `gate-topic.ts:168-172` |
| 18 | `정답 라벨({a})이 선지에 없음` | 정답 라벨이 선지 라벨 집합 밖 | `gate-topic.ts:173-175` |
| 19 | `해설 누락` | `explanation` 빈 문자열 | `gate-topic.ts:186` |
| 20 | `해설이 너무 짧음: '{explanation}'` | 길이 < 10 | `gate-topic.ts:187` |
| 21 | `오답해설 {n}개 ({m}개 필요) — 읽힌 라벨 {labels}` | `m = optionCount − answerCount` | `gate-topic.ts:190-198` |
| 22 | `오답해설 라벨 중복: {label}` | 같은 라벨 2회 | `gate-topic.ts:201` |
| 23 | `오답해설 라벨({label})이 선지에 없음` | 선지 라벨 집합 밖 | `gate-topic.ts:203` |
| 24 | `오답해설에 정답 라벨({label}) 포함` | (파서가 걸러내므로 직접 호출 경로 방어) | `gate-topic.ts:204` |
| 25 | `{label} 오답 해설이 비었음` | trim 후 빈 문자열 | `gate-topic.ts:209` |
| 26 | `{label} 오답 해설이 문장으로 성립하지 않음({n}자) — 받은 값: '{text}'` | 길이 < **12** | `gate-topic.ts:210-214` |
| 27 | `{label} 오답 해설 누락` | 비정답 선지에 대응 오답해설 없음. **정답 축이 깨져 있으면(16·18) 발화하지 않는다** | `gate-topic.ts:183, 216-223` |

> **#1 은 즉시 return 이다.** 개수가 틀리면 다른 사유가 하나도 안 나온다 — "이슈 1건뿐"이라고 안심하지 마라.
> **#27 억제 규칙**: `answerAxisBroken`(정답 0개 또는 선지에 없는 라벨)이면 파생 메시지를 만들지 않는다(`gate-topic.ts:177-183`). 정답 축이 멀쩡한데 오답 해설이 빠진 경우에만 나온다.

### 4-B. 어댑터 실패 (게이트 통과 후 차단 — 하네스 `ADAPT` 코드)
`adapter-topic.ts`

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {n}개 (4~8개 필요)` | `< 4` 또는 `> 10`(TOPIC_PARSE_LABELS 길이) | `adapter-topic.ts:41-43` |
| `정답 라벨 누락` | `answers.length === 0` | `adapter-topic.ts:44` |
| `선지 라벨을 해석할 수 없음: '{label}'` | `topicDigitLabel` 이 빈 문자열 | `adapter-topic.ts:55` |
| `선지 라벨 중복({label}) — 저장 라벨이 겹친다` | 숫자 라벨 충돌 | `adapter-topic.ts:56-58` |
| `{label} 선지 텍스트 누락` | trim 후 빈 문자열 | `adapter-topic.ts:59` |
| `정답 라벨({a})이 선지에 없음` | 〃 | `adapter-topic.ts:66-69` |
| `오답해설 라벨 중복({label}) — 해설이 덮어써진다` | Map 덮어쓰기 소실 차단 | `adapter-topic.ts:78-82` |

### 4-C. 품질 검증기 error (프로덕션 비차단 · **qbank 하네스는 차단** — `qualityBlocking`)

| 코드 | 조건 | file:line |
|---|---|---|
| `option-count` | 선지 수 ≠ `genericOptionCount` | `validators/options.ts:140-142` |
| `duplicate-option-label` / `duplicate-option-text` / `empty-option-text` | 라벨·본문 중복/공백 | `validators/options.ts:146-158` |
| `option-spelling-triple-letter` | 같은 글자 3연속 토큰(오타 탐지) | `validators/options.ts:160-179` |
| `correct-answer-mismatch` | `correctAnswer` 라벨이 선지에 없음 | `validators/options.ts:195-218` |
| `generic-answer-count` | `answerCount ≥ 2` 인데 정답 라벨 수 불일치 | `dispatcher.ts:810-823` |
| `generic-multi-answer-direction` | 복수 정답인데 발문에 `모두|all|apply` 없음 (어댑터가 구조적으로 만족) | `dispatcher.ts:824-831` |
| `topic-direction-mismatch` | **stem ko** 인데 발문에 `주제` 없음 (어댑터가 구조적으로 만족) | `validators/topic.ts:52-55` |
| `topic-option-language` | optionLanguage=en 인데 한글 포함 또는 라틴 0 | `validators/topic.ts:73-83` |
| `gist-polarity-direction-mismatch` / `gist-polarity-field-mismatch` | NEGATIVE 설정인데 발문이 부정형이 아님 / `answerPolarity` 필드 불일치 | `validators/topic.ts:12-35`, 호출 `dispatcher.ts:879-884` |
| `type-foreign-field` | `blanks`·`passageWithBlank`·`originalExpression`·`blankAnswerMode` 중 하나라도 존재 | `validators/misc.ts:25-33, 42-50` |
| `explanation-foreign-script` | 한국어 해설에 한자·가나·중문 구두점(한글 직후 괄호 병기는 예외) | `explanation-foreign-text.ts:32-34, 97-104` |
| `explanation-latin-jam` | `steals다` 류 영단어+종결어미 접합 | `explanation-foreign-text.ts:39-41, 105-112` |
| `explanation-quoted-token-missing` | 해설이 따옴표로 인용한 영어 조각(12자 이상)이 지문·문항 표면에 없음 | `explanation-quoted-tokens.ts:117-162` |
| `passage-integrity-*` | 지문 자체 결함(기출 원문이면 무발화) | `dispatcher.ts:790-794` |

**무해한 warning (TOPIC md 레인에서 구조적으로 발생)**:
`few-key-points` — KILLER 문항인데 `keyPoints.length < 3`. 어댑터가 `keyPoints: []` 를 **의도적으로** 낸다(`adapter-topic.ts:102-104`). 수리 대상 아니다.
`thin-killer-explanation` — KILLER 해설이 80자 미만(`validators/misc.ts:72-74`). 2문장 합니다체면 대개 넘는다.

### 4-D. qbank 유닛 게이트 (하네스 고유 — `qgen-core.ts`)

| 코드 | 조건 | file:line |
|---|---|---|
| `CONTAINER` | ITEM 헤더 없음 · settings JSON 파싱 실패 · difficulty 오값 · `point` 누락 · 본문 빈 값 · 번호 비연속 | `qgen-core.ts:57-85` |
| `ITEM_COUNT` | 문항 수 < minItems(기본 5) | `qgen-core.ts:229-235` |
| `POINT_DUPLICATE` | 정규화된 `point:` 값이 유닛 안에서 중복 | `qgen-core.ts:315-333` |
| `ANSWER_DUPLICATE` | `diversityTargets` 문자열이 겹침 = **정답 선지 앞 44자가 같음** | `qgen-core.ts:336-353`, `lane-topic.ts:241` |
| `UNSUPPORTED_LANE` | 해당 없음(TOPIC 은 등록 레인) | `qgen-core.ts:205-224` |

---

## 5. adapter 산출 필드

`adapter-topic.ts:92-108` → `postProcessQuestion("TOPIC", …)` 은 **PASSTHROUGH** 라 필드를 만들지 않는다(`question-postprocess/index.ts:55-61`).

| 키 | 타입 | 값 | 근거 |
|---|---|---|---|
| `direction` | `string` | **어댑터가 결정론으로 생성.** 모델 산출 아님 | `lane-topic.ts:84-108, 175-188` |
| `options` | `{label, text}[]` | 라벨은 **숫자 문자열 `"1"`~`"8"`** (md 의 ①~⑧ 은 내부 축), 원문자 순서로 정렬 | `adapter-topic.ts:29-33, 48-62` |
| `correctAnswer` | `string` | 정답 라벨 `", "` join (`"2"` / `"2, 6"`) | `adapter-topic.ts:98` |
| `correctAnswers` | `string[]` | **정답 2개 이상일 때만 존재.** 단일 정답이면 키 자체가 없다 | `adapter-topic.ts:99` |
| `wrongOptionExplanations` | `{label, explanation}[]` | 정답 제외 선지 순서. 빈 해설은 제외됨 | `adapter-topic.ts:84-90` |
| `explanation` | `string` | `해설:` 값(개행 접힘) | `adapter-topic.ts:106` |
| `keyPoints` | `[]` | **항상 빈 배열** — 합성 금지(정본 `adapter.ts:319-322` 근거) | `adapter-topic.ts:102-104` |
| `tags` | `[]` | 〃 | `adapter-topic.ts:105` |
| `difficulty` | `string` | `ctx.rawDifficulty` 원본 그대로 | `adapter-topic.ts:106` |

### 이 유형에만 있는(또는 없는) 것 — ★
- **`passageWith*` 계열이 하나도 없다.** 지문 무변형 유형이라 후처리도 만들지 않는다. 만들면 `type-foreign-field` error (`validators/misc.ts:27`).
- **후처리가 오답 해설 앞머리를 붙인다.** TOPIC 은 `VISIBLE_KOREAN_OPTION_TYPES` 라(`question-postprocess/index.ts:256-262`), 오답 해설이 그 선지 문구를 포함하지 않으면
  `'{선지 본문}' 선택지는 {해설}` 로 재작성된다(`index.ts:303`). → **오답 해설은 "…선택지는" 뒤에 이어 붙여도 자연스러운 서술**로 써라. `도입부 소재 함정으로, …입니다.` 형태가 그 요구를 만족한다.
- **배열 → Record 정규화**: `wrongOptionExplanations` 는 저장 시 `{"1": "...", "3": "..."}` Record 가 된다(`normalizeWrongOptionExplanations`, `scripts/_test-md-topic.ts:397-402`).
- **선지가 저장 시 셔플된다.** TOPIC 은 `SHUFFLE_OPTION_TYPES` (`question-diversity.ts:508-516`). 정답 라벨·오답 해설·해설 속 원문자 지칭은 함께 재매핑되지만(`question-diversity.ts:534-548`), **평숫자 지칭(`3번`, `선지 2`)은 재매핑되지 않아 문항이 무효가 된다** (`question-diversity.ts:474-480`).

---

## 6. 생성 노브

> 노브는 **ITEM 헤더의 `settings:` JSON** 으로 준다. 리졸버가 읽는 **설정 키**와 레인이 읽는 **resolved 필드명이 다르다** — 반드시 아래 "설정 키" 열을 써라.

| 설정 키 (md/settings) | resolved 필드 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|---|
| `optionCount` (alias 없음) | `genericOptionCount` | number | **5** | `4~8` (`clampTopicMdOptionCount`, `prompts-topic.ts:44-48`; 리졸버 `generic.ts:38-43`) | 선지 줄 개수 = 이 값. 라벨은 ①~Ⓝ. 게이트 #1 이 실값으로 정확 검사 |
| `answerCount` (alias `correctAnswerCount`) | `genericAnswerCount` | number | **1** | `1 ~ optionCount−1` (`clampTopicMdAnswerCount`, `prompts-topic.ts:51-56`; `generic.ts:46-56`) | `정답:` 줄 라벨 개수. 오답 해설 개수 = `optionCount − answerCount`. 2 이상이면 발문이 "모두 고르시오"로 바뀜 |
| `answerPolarity` | `answerPolarity` | `"NEGATIVE"` \| undefined | undefined(=POSITIVE) | `"NEGATIVE"` 만 유효, 그 외 전부 undefined (`shared.ts:121-133`) | **형식 불변, 의미 반전.** `정답:` = 부적절 선지, `오답:` = 타당한 선지의 타당성 근거 |
| `optionLanguage` | (rawTypeSettings 직독) | `"en"` \| `"ko"` | **`"en"`** (`language.ts:19`) | en/ko 외 값은 기본값으로 폴백 (`language.ts:92-97`) | 선지 표면 언어. 게이트 #7~#9 · 길이 단위(en 단어 / ko 글자) · 길이 임계가 통째로 바뀜 |
| `stemLanguage` | (rawTypeSettings 직독) | `"en"` \| `"ko"` | **`"ko"`** (`language.ts:19`) | 〃 | **마크다운에 영향 없음.** 어댑터 발문 언어만 바꾼다 (`lane-topic.ts:184`) |
| `difficulty` (ITEM 헤더 필드) | `ctx.difficulty` | `BASIC\|INTERMEDIATE\|KILLER` | `INTERMEDIATE` (하네스 기본) | 셋 외는 CONTAINER 반려 (`qgen-core.ts:79-82`) | **마크다운 형식에 영향 없음.** 프롬프트의 표적 설계 분기(`prompts-topic.ts:70-84`)와 저작 목표만 바뀜. `difficulty` 필드로 저장 |

### 발문 결정표 (`buildTopicDirection` — `lane-topic.ts:84-108`, 8분기 전수)

| 극성 | 정답 수 | stem ko | stem en |
|---|---|---|---|
| POSITIVE | 1 | `다음 글의 주제로 가장 적절한 것은?` | `Which of the following is the best topic of the passage?` |
| POSITIVE | ≥2 | `다음 글의 주제로 적절한 것을 모두 고르시오.` | `Choose all of the following that are appropriate topics of the passage.` |
| NEGATIVE | 1 | `다음 글의 주제로 가장 적절하지 않은 것은?` | `Which of the following is NOT an appropriate topic of the passage?` |
| NEGATIVE | ≥2 | `다음 글의 주제로 적절하지 않은 것을 모두 고르시오.` | `Choose all of the following that are NOT appropriate topics of the passage.` |

### 적격성 (`isEligible` — `lane-topic.ts:121-139`)
`4 ≤ optionCount ≤ 8` **그리고** `1 ≤ answerCount ≤ optionCount − 1`. 벗어나면 유형 자체가 생성 대상에서 빠진다.

---

## 7. 함정 (코드 근거 있는 것만)

### T1. ★ 설정 키를 `genericOptionCount` 로 쓰면 **조용히 무시**된다
리졸버가 읽는 키는 `optionCount`/`answerCount` 다(`generic.ts:38-56`). `genericOptionCount` 는 **resolved 출력 필드명**이다.
→ ITEM 헤더에 `{"genericOptionCount":8}` 를 쓰고 8지 마크다운을 저작하면 게이트는 기본 5지로 검사해 `선지 8개 (5개 필요)` 로 반려한다.
**실증**: `_probe-TOPIC.ts` D1 (PASS).

### T2. ★ 유닛 안에서 정답 선지의 **앞 44자가 겹치면** 유닛 전체가 반려된다
`diversityTargets` 가 `이미 쓴 주제 문구 "{정답 본문 앞 44자}" — …` 를 내고(`lane-topic.ts:241`), 하네스가 문자열 정규화 후 중복을 `ANSWER_DUPLICATE` 로 차단한다(`qgen-core.ts:336-353`).
한 지문의 주제는 하나이므로 **5~8문항의 정답 선지가 서로 비슷해지는 것이 이 유형의 구조적 숙명**이다 → 정답 문구를 매 문항 다른 어휘·다른 통사로 재설계해야 한다(§8-B1).
**실증**: `_probe-TOPIC.ts` D2 (PASS).

### T3. 선지가 지문 문장의 축자 조각이면 반려
`units ≥ 5` 이고 정규화된 선지 문자열이 지문의 substring 이면 `{label} 선지가 지문 표현을 그대로 옮김` (`gate-topic.ts:125-128`). 주제 선지는 **압축**이지 인용이 아니다. 핵심 명사 1~2개 공유는 안전하지만 5단어 이상 연속 복사는 금지.

### T4. 길이 두 겹 함정
- 전체 불균형(#14): 최장 ≥ 최단×2.2 **AND** 차 ≥ en 4 / ko 12.
- 정답 돌출(#15): 정답이 최장 **AND** ≥ 2위×1.5 **AND** 차 ≥ 3.
→ **실무 규칙: 영어 선지는 9~11단어 밴드 안에, 한국어 선지는 공백 제외 18~24자 밴드 안에 전부 몰아넣어라.** 정답을 최장으로 만들지 마라(헌법 §3 운용규칙 4와 동일 방향).
KILLER 에서는 추가로 `option-length-giveaway` warning(최장 ≥ 최단×3 AND 차 > 18자, `validators/misc.ts:93-95`)까지 본다.

### T5. `오답:` 머리표 누락 → 해설이 오답 해설을 통째로 삼킨다
해설 추출은 `오답:` 이 없으면 `(…)([\s\S]+)$` 로 문서 끝까지 먹는다(`parser-topic.ts:264`). 결과는 「오답해설 0개 (4개 필요)」 + 비대해진 해설.

### T6. 선지 목록 사이의 산문 = 직전 선지 오염
라벨 없는 줄은 **버려지지 않고 이어 붙는다**(`parser-topic.ts:196-202`). 목록 중간에 `(참고: …)` 를 넣으면 `FOLD_STOP_NOTE_RE`(`parser-topic.ts:146`)가 막아 주지만, 그 목록에 없는 형태의 사족은 그대로 붙는다. **선지 5줄 사이에 아무것도 넣지 마라.**

### T7. 오답 해설 12자 미만 = 반려
`WRONG_TEXT_MIN = 12` (`gate-topic.ts:50, 210-214`). 「도입부 소재 함정」(8자) 같은 라벨만 적으면 반려된다. 기제 이름 + 근거 1문장을 반드시 붙여라.

### T8. 해설 언어 규약 위반은 품질 error
- 한자·가나·중문 구두점(`、` `。`) 혼입 → `explanation-foreign-script` (`explanation-foreign-text.ts:32-34`). **한글 직후 괄호 병기만 예외.**
- `steals다` 류 접합 → `explanation-latin-jam`.
- 따옴표 영어 인용 12자 이상이 지문·문항 표면에 없으면 → `explanation-quoted-token-missing`. **인용은 반드시 지문에서 복사하라.**

### T9. 해설에서 선지를 **번호로** 지칭하면 셔플 후 문항이 무효
저장 시 선지가 셔플된다(`question-diversity.ts:508-516`). 원문자(`②`)는 재매핑되지만 평숫자(`3번`, `선지 2`)는 재매핑 대상이 아니다(`question-diversity.ts:534-548`, 지시는 `prompts-topic.ts:195`). → **선지를 지칭할 땐 그 선지의 내용을 인용하라.**

### T10. 오답 해설을 "…선택지는" 앞머리와 어울리게 써라
후처리가 `'{선지 본문}' 선택지는 {해설}` 로 재작성한다(`question-postprocess/index.ts:303`). 오답 해설을 `이 선지는 …입니다` 로 시작하면 `'the growing speed…' 선택지는 이 선지는 …입니다` 라는 이중 주어 비문이 학생 표면에 나간다.

### T11. 마침표 표기 혼재 = 자동 보정 + warning
일부 선지만 `.` 로 끝나면 스냅이 전부 떼고 correction 을 남긴다(`parser-topic.ts:301-311`). 영어 선지 규약은 **마침표 없음**(`prompts-topic.ts:159`)이므로 처음부터 전부 빼라.

### T12. NEGATIVE 극성에서 "타당한 선지"에 시비가 붙으면 문항이 죽는다
게이트는 이걸 못 본다(의미 판정 불가, `gate-topic.ts:9-10`). 네 선지 전부가 **독립적으로 이 글의 주제로 방어 가능**해야 한다 — "덜 포괄적이라 부적절"이라는 시비 하나면 복수정답이다(`prompts-topic.ts:166-169`).

### T13. `## 지문` 블록을 출력에 넣지 마라
지문은 프롬프트 **입력**이지 모델 출력이 아니다(00-contract §4, `prompts-topic.ts:303`). 문서 앞에 지문을 붙이면 그 줄들이 선지 구역에 들어가고, 라벨이 없으니 전부 버려지거나(첫 라벨 이전) 접힘 대상이 된다.

---

## 8. 출제 포인트 다각화 축

> **한 지문 × TOPIC 으로 5~8문항.** 그런데 한 지문의 주제는 하나다 — 그래서 이 유형의 다각화는 "다른 답을 묻는 것"이 아니라 **"같은 주제에 도달하는 서로 다른 인지 경로를 요구하는 것"** 이다. 이걸 놓치면 5문항이 1문항의 5개 사본이 되고, `ANSWER_DUPLICATE`(T2)가 기계적으로 그걸 잡아낸다.

### 8-A. 노브로 달라지는 축 (코드 근거 — 하네스가 결정형으로 검증)

| 축 | 설정 | 만들 수 있는 변주 | 근거 |
|---|---|---|---|
| **A1 극성** | `answerPolarity: "NEGATIVE"` | "가장 적절한 것" ↔ "적절하지 **않은** 것". 후자는 **오답 해설의 성격이 통째로 반전**(왜 타당한가) → 학생이 4번 검증해야 한다 | `lane-topic.ts:66-70, 100-104`; `prompts-topic.ts:104-109` |
| **A2 선지 개수** | `optionCount: 4~8` | 4지(소거 압박↑, 미끼 밀도↑) / 5지(표준) / 6~8지(기제 5종 전개 + 재배치, `prompts-topic.ts:112-116`) | `prompts-topic.ts:44-48` |
| **A3 정답 개수** | `answerCount: 1 ~ N−1` | 단일 정답 ↔ 복수 정답("모두 고르시오"). 복수는 **정답끼리 상하위 개념이면 안 된다**는 새 제약을 학생·저작자 모두에게 건다 | `prompts-topic.ts:292-294`; `lane-topic.ts:58-64` |
| **A4 선지 언어** | `optionLanguage: "en"\|"ko"` | 영어 명사구(표준) ↔ 한국어 명사구. **한국어는 층위 위반 위험이 커진다**("…해야 한다"는 MAIN_IDEA 표면) | `prompts-topic.ts:147-160`; 게이트 #7~#9 |
| **A5 발문 언어** | `stemLanguage: "en"\|"ko"` | 한국어 발문(표준) ↔ 영어 발문. 마크다운 무변화 — 학생 표면만 바뀜 | `lane-topic.ts:90-99` |
| **A6 난이도** | ITEM `difficulty:` | BASIC(주제문 명시) / INTERMEDIATE(두 문장 종합) / KILLER(글 전체 분산 + 표면 어휘 재사용 0 목표) | `prompts-topic.ts:70-84`; 헌법 §4 |

**조합 가능 개수**: A1(2) × A2(5) × A3(가변) × A4(2) × A6(3) 만으로도 5~8문항을 형식만으로 전부 다르게 만들 수 있다. 하지만 **형식만 다른 5문항은 다각화가 아니다**(헌법 §7 원칙). A축은 B축의 그릇일 뿐이다.

### 8-B. 설계로 달라지는 축 (교육적 판단 — 렌즈 ⑤가 심사)

#### B1. ★ 정답 문구의 통사·어휘 재설계 (기계 강제 축)
같은 주제를 **매 문항 다른 구조의 구**로 압축한다. 앞 44자가 겹치면 하네스가 차단한다(T2).

| 통사 틀 | 예 (인쇄술 지문) |
|---|---|
| `why + 비교급` | `why the fixity of printed text mattered more than its speed` |
| `how + 절` | `how identical copies made scholarly disagreement checkable across distant cities` |
| `the + 추상명사 + of` | `the redefinition of print's value as precision rather than reach` |
| `what + 절` | `what changed when copies stopped drifting between readers` |
| 한국어 명사구 | `복제본의 안정성이 학술적 검증을 가능하게 한 이유` |

**규칙**: 5문항이면 통사 틀 5개를 전부 다르게. 정답의 핵심 명사도 최소 1개씩 갈아 끼운다(fixity / identical copies / precision / stability).

#### B2. 정답이 딛는 **근거 자리**를 옮긴다
지문의 어느 문장을 읽어야 그 정답으로 좁혀지는가를 문항마다 다르게 배치한다. 헌법 §7 축1(논지 위치)의 이 유형 번역이다.

| 근거 자리 | 요구되는 독해 | 어울리는 난이도 |
|---|---|---|
| 도입 통념 + 즉각 반박 | 통념이 주제가 아님을 판정 | BASIC |
| 전환점(However/but/;) | 논지가 꺾이는 지점 포착 | INTERMEDIATE |
| 기제 설명(중반 인과) | 원인–결과 방향 추적 | INTERMEDIATE |
| 사례·세부 | 세부가 주제가 아님을 판정(세부 승격 방어) | INTERMEDIATE |
| 결론 재정의(마지막 문장) | 재정의 압축 | BASIC~KILLER |
| **전체 분산(3자리 종합)** | 셋을 다 읽어야 좁혀짐 | KILLER 전용 (`prompts-topic.ts:79-83`) |

#### B3. **오답 기제 팔레트**를 문항마다 다르게 짠다
기제 5종(`prompts-topic.ts:88-92`)에서 매번 다른 조합을 뽑는다. 헌법 §3 (L,F) 코드와의 대응:

| 기제 | 정의 | 헌법 §3 대응 |
|---|---|---|
| 1 관점 반전 | 핵심어 유지 + 평가/인과 방향 반전 | L1·L6 / F4 |
| 2 도입부 소재 함정 | 전환 이전 통념을 주제로 | L2·L4 / F5 |
| 3 범위 이탈 | 지문이 말하지 않은 일반화·해결책·전망 / 세부로 축소 | L7 / F3 |
| 4 지문 밖 통념 | 그럴듯하나 근거 없음 | L3 / F2 (문항당 1개 초과 금지 — 헌법 §1-3) |
| 5 관점 소거 | 화제만 맞고 판단 없음 | L1 / F5 |

**배분 규칙**(코드 근거): 오답 4개면 **관점 반전 + 관점 소거 필수**, 나머지 둘은 2~4번에서 서로 다른 것(`prompts-topic.ts:115`). 오답 3개 이하면 **관점 반전 필수**(`prompts-topic.ts:116`). 오답 5개 이상이면 5종을 하나씩 배정하고 남는 것은 **지문의 다른 문장에 정박**시킨다(`prompts-topic.ts:112-114`).
→ **문항 간 다각화**: 문항1이 (1,2,3,5)면 문항2는 (1,3,4,5), 문항3은 (1,2,4,5) 식으로 팔레트를 회전시키되 **관점 반전은 매번 유지**하고 그 반전의 **대상 문장**을 바꾼다.

#### B4. 최강 미끼의 **정체**를 바꾼다
헌법 §1-4(최강 미끼 실재) · §4(decoyPull 목표)를 이 유형에서 실현하는 네 가지 방식:
1. **관점 반전형** — 정답과 핵심어가 같고 방향만 반대(상위권 저울질용, KILLER 필수)
2. **도입부 정박형** — 지문 앞 1/3만 읽으면 완벽해 보임
3. **관점 소거형** — 화제가 정확해서 "틀린 데가 없어" 보임
4. **한 문장 참형(L7/F3)** — 지문의 다른 대목에서는 참이지만 글 전체의 주제는 아님

한 유닛에서 이 넷을 최소 3종 이상 최강 미끼로 돌려 쓴다.

#### B5. **선지 층위**를 문항마다 통일하되 문항 간에는 바꾼다
`prompts-topic.ts:95` 는 한 문항 안에서 **전 선지를 같은 문법 형식**(명사구 또는 의문사절 중 하나)으로 통일할 것을 요구한다. 이걸 문항 축으로 쓰면:
- 문항1: 전부 `the + 명사구`
- 문항2: 전부 `how/why + 절`
- 문항3: 전부 `what/whether + 절`
- 문항4: 전부 한국어 명사구(A4 노브)

같은 지문을 서로 다른 압축 문법으로 다시 읽게 만드는, 형식과 인지가 함께 움직이는 축이다.

#### B6. 난이도별 **정답의 추상화 거리**를 계단으로 놓는다
- BASIC: 주제문의 자연스러운 압축 (핵심 명사 공유 OK, 축자 복사는 금지 — `prompts-topic.ts:73`)
- INTERMEDIATE: 한 단계 추상화, 핵심 명사 1개 정도만 공유 (`prompts-topic.ts:77`)
- KILLER: 표면 어휘 재사용 **0 목표**의 추상 명사구. 단 "어느 지문에나 붙는 문구"가 되면 실패 (`prompts-topic.ts:81`)

### 8-C. 5문항 / 8문항 배정 견본 (그대로 써도 되는 설계표)

**5문항** (헌법 §4 유닛 배분: BASIC 1 / INTERMEDIATE 2 / KILLER 2)

| # | difficulty | settings | 근거 자리(B2) | 정답 통사(B1) | 오답 팔레트(B3) | 최강 미끼(B4) |
|---|---|---|---|---|---|---|
| 1 | BASIC | (기본) | 결론 재정의 | `why + 비교급` | 2,3,1,5 | 도입부 정박 |
| 2 | INTERMEDIATE | (기본) | 전환점 | `how + 절` | 2,4,1,5 | 관점 반전 |
| 3 | KILLER | (기본) | 전체 분산 | `the + 추상명사 of` | 5,4,1,2 | 관점 반전 |
| 4 | KILLER | `{"optionLanguage":"ko"}` | 기제 설명(인과) | 한국어 명사구 | 2,3,1,5 | 관점 소거 |
| 5 | INTERMEDIATE | `{"answerPolarity":"NEGATIVE"}` | 사례·세부 | (부적절 진술) | — (타당 4) | 한 문장 참형 |

**8문항** — 위 5개에 다음 3개를 더한다.

| # | difficulty | settings | 축 |
|---|---|---|---|
| 6 | INTERMEDIATE | `{"optionCount":8,"answerCount":2}` | 복수 정답 — 재정의와 그 귀결을 **각각 독립 주제**로 성립시킬 수 있는지 |
| 7 | BASIC | `{"optionCount":4}` | 4지 — 소거 압박, 오답 3개 전부 강한 미끼 |
| 8 | KILLER | `{"answerPolarity":"NEGATIVE","optionCount":6}` | 부정 극성 × 6지 — 타당한 선지 5개를 전부 방어해야 하는 최고 난도 설계 |

**이 배정이 만족하는 것**: `point:` 8개 전부 상이(POINT_DUPLICATE 회피) · 정답 통사 8종 상이(ANSWER_DUPLICATE 회피) · 난이도 분포 BASIC 2 / INTERMEDIATE 3 / KILLER 3(헌법 §4) · 형식 축 5종(극성·개수·정답수·선지언어·난이도) 전개.

**금지**: 5문항 전부 같은 통사 틀 · 전부 같은 근거 자리 · 전부 POSITIVE 5지 1정답 · 전량 KILLER 또는 전량 BASIC(헌법 §4).

---

## 부록. 검증 스크립트

- `qbank/work/_probe-TOPIC.ts` — §2 골격(단일 문항 + 6문항 유닛) 실주행. A(단일 문항) / B(유닛) / C(프로덕션 픽스처 회귀) / D(음성 통제 T1·T2) 전 항목 PASS.
- `scripts/_test-md-topic.ts` + `scripts/_test-md-topic-wave2.ts` — 프로덕션 결정론 픽스처. **저작 규칙에 의심이 생기면 여기부터 읽어라.**

실행:
```
./node_modules/.bin/tsx qbank/work/_probe-TOPIC.ts
npx tsx scripts/_test-md-topic.ts
```
