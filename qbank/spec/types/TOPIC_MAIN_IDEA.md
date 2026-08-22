# 주제·요지 파악 (TOPIC_MAIN_IDEA)

> **분류** 선택형(객관식, 지문 무변형 PASSTHROUGH) · **지문변형** 없음(한 글자도 건드리지 않는다) ·
> **정답 머리표** `정답:` (+ 이 유형에만 있는 필수 머리표 `근거문장:`) ·
> **최소 지문 길이** 코드 상 하한 없음([미상] — 레인 `isEligible` 은 설정만 본다, `lane-topic-main-idea.ts:93-111`).
> 실질 하한은 근거문장 조건: 지문에 **완결된 영어 문장**이 있고 그 문장이 fold 후 5단어·12자 이상이어야 한다
> (`parser-topic-main-idea.ts:293,319,337`).

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

학생은 **지문 전체를 한 문장으로 접어야** 한다. 어느 한 단락·한 문장을 확인하는 작업이 아니라,
도입의 통념 → 전환 → 기제 → 귀결이라는 **글의 골격 전체를 관통하는 명제 하나**를 고르는 작업이다.

다른 유형과의 경계:

| 축 | TOPIC_MAIN_IDEA | 이웃 유형 |
|---|---|---|
| 선지 형식 | **설정으로 결정**: `optionLanguage=ko` → 한국어 완결 진술문(요지) / `en` → 영어 명사구(주제) — `lane-topic-main-idea.ts:66-70` | `TOPIC` 은 영어 명사구 고정, `MAIN_IDEA` 는 한국어 진술문 고정(레거시 분리형) |
| 지문 접점 | **지문을 변형하지 않는다.** 그래서 "지문 재구성 대조"라는 최강 게이트가 없고, 대신 `근거문장:` 한 줄이 유일한 지문 정박점 — `parser-topic-main-idea.ts:6-9`, `gate-topic-main-idea.ts:5-8` | 빈칸·어법·순서 계열은 재구성 대조가 작동 |
| 정답의 성질 | 글 전체의 재진술(POSITIVE) 또는 글 전체와 **명백히 어긋나는 진술**(NEGATIVE) — `prompts-topic-main-idea.ts:299-304` | `TITLE` 은 제목성(함축·수사) 요구, `IMPLIED_MEANING` 은 밑줄 어구 국소 해석 |
| 후처리 | **PASSTHROUGH** — 후처리가 선지·라벨을 만들어 주지 않는다. 어댑터가 완제품을 낸다 — `question-postprocess/types.ts:66-72`, `adapter-topic-main-idea.ts:5-13` | 빈칸 계열은 후처리가 `passageWithBlank` 등을 합성 |

**즉 이 유형에서 승부는 전적으로 "선지 5~8개의 설계"에서 갈린다.** 지문은 그대로 나가고, 게이트가 볼 수 있는
것은 선지 형상 + 근거문장 정박뿐이다(`gate-topic-main-idea.ts:5-11`). 나머지 전부가 저작자의 책임이다.

---

## 2. 마크다운 골격

### 2-1. 복붙용 골격 (요지 모드 = `optionLanguage:ko` 기본값, 5지선다, 정답 1개, POSITIVE)

```md
근거문장: <정답 판단의 축이 된 지문 문장 하나 — 문장 첫 글자부터 종결 구두점까지 축자 복사. 조각·두 문장 결합 금지>
① <한국어 완결 진술문 — …합니다./…이다./…해야 한다.>
② <한국어 완결 진술문>
③ <한국어 완결 진술문>
④ <한국어 완결 진술문>
⑤ <한국어 완결 진술문>
정답: <①~⑤ 중 하나>
해설: <2문장. 근거문장이 무엇을 말하는지 + 정답이 왜 글 전체를 대표하는지. 합니다체, 한국어, 선지를 번호로 지칭 금지>
오답:
① <기제이름 — 왜 매력적이고 왜 탈락인지 1문장>
② <기제이름 — …>
④ <기제이름 — …>
⑤ <기제이름 — …>
```

- **정답 라벨 줄은 `오답:` 블록에 넣지 않는다**(위 예시는 정답이 ③이라 ①②④⑤ 네 줄).
- 발문(`다음 글의 요지로 가장 적절한 것은?`)은 **서버가 설정에서 합성한다. 출력하지 마라** — `adapter-topic-main-idea.ts:99-104`.
- `## 지문` 블록을 다시 쓰지 마라(프롬프트 입력이지 모델 출력이 아니다 — `prompts-topic-main-idea.ts:348`).

### 2-2. 주제 모드 골격 (`settings: {"optionLanguage":"en"}`)

```md
근거문장: <지문 문장 축자>
① <English noun phrase — 중심 화제 + 필자의 관점. 완결 문장·한국어 금지, 소재만 적은 명사구 금지>
② <English noun phrase>
③ <English noun phrase>
④ <English noun phrase>
⑤ <English noun phrase>
정답: <①~⑤ 중 하나>
해설: <한국어 2문장 — 선지가 영어여도 해설은 한국어다>
오답:
① <기제이름 — 한국어 1문장>
② <…>
④ <…>
⑤ <…>
```

### 2-3. 검증된 정상 픽스처 전문 (요지 모드) — `scripts/_test-md-topic-main-idea.ts:41-53`

지문(`scripts/_test-md-topic-main-idea.ts:29-35`):

```text
Streaming platforms promise that their recommendation engines will broaden what listeners encounter. The claim is intuitive, since no human curator could survey a catalogue of that size. In practice, however, a recommendation is a statistical restatement of choices that have already been made. Because the model is trained on what a listener has approved before, its suggestions drift toward the center of that history. The catalogue that appears to be infinite is therefore experienced as a narrow corridor. What expands is the number of available items, not the range of taste that a listener actually exercises.
```

```md
근거문장: What expands is the number of available items, not the range of taste that a listener actually exercises.
① 추천 알고리즘은 사람이 감당할 수 없는 규모의 목록을 대신 훑어 이용자가 몰랐던 취향을 발견하게 해 줍니다.
② 추천 모델이 과거 데이터에 치우치지 않도록 기업은 알고리즘의 작동 방식을 공개해야 합니다.
③ 추천 알고리즘은 이용자가 이미 승인한 선택을 통계적으로 재생산하기 때문에 목록이 넓어 보여도 실제 취향의 폭은 좁아집니다.
④ 이용자에게 제시되는 항목의 수는 플랫폼이 보유한 목록의 규모에 따라 결정됩니다.
⑤ 추천 알고리즘은 이용자의 과거 선택을 재료로 삼아 취향의 폭을 꾸준히 넓혀 왔습니다.
정답: ③
해설: 글은 추천이 새로움을 넓혀 준다는 통념을 제시한 뒤 추천이 이미 승인된 선택의 통계적 재진술이라는 근거로 이를 반박합니다. 마지막 문장이 늘어나는 것은 항목의 수일 뿐 실제로 행사되는 취향의 폭이 아니라고 못 박으므로, 글 전체를 대표하는 진술은 취향의 폭이 좁아진다는 것입니다.
오답:
① 도입부함정 — 반박 이전의 통념을 그대로 옮겨 매력적이지만 글은 그 통념을 곧바로 뒤집습니다.
② 범위확대 — 소재는 같지만 작동 방식을 공개해야 한다는 처방은 지문이 하지 않은 주장입니다.
④ 세부과장 — 항목의 수라는 표면 사실만 말해 필자의 판단이 빠져 있습니다.
⑤ 방향반대 — 핵심어는 정답과 같지만 취향의 폭이 넓어졌다고 방향을 뒤집었습니다.
```

### 2-4. 검증된 정상 픽스처 전문 (주제 모드) — `scripts/_test-md-topic-main-idea.ts:56-68`

```md
근거문장: What expands is the number of available items, not the range of taste that a listener actually exercises.
① how streaming platforms assemble catalogues of enormous size
② the way recommendation engines narrow taste by recycling past approvals
③ the need for open disclosure of how ranking models are trained
④ a human curator's advantage over statistical models in music selection
⑤ the steady widening of listener taste driven by data-based suggestion
정답: ②
해설: 글은 추천이 선택의 폭을 넓힌다는 통념을 제시한 뒤 추천이 과거 선택의 통계적 재진술임을 들어 반박합니다. 늘어나는 것은 항목의 수일 뿐이라는 마지막 문장이 논지를 확정하므로 중심 화제는 추천이 취향을 좁힌다는 것입니다.
오답:
① 범위축소 — 목록의 규모는 소재일 뿐 필자의 관점이 빠져 있습니다.
③ 범위확대 — 지문이 하지 않은 제도적 처방으로 확장했습니다.
④ 근거없음 — 사람 큐레이터와의 우열은 지문에 근거가 없습니다.
⑤ 방향반대 — 핵심어는 같지만 논지의 방향이 정반대입니다.
```

### 2-5. qbank 유닛 컨테이너 (5~8문항을 한 파일에)

`<!-- ITEM n ... -->` 는 **qbank 규약이지 md-qgen 규약이 아니다**(`00-contract.md` §3). 하네스가 잘라낸 뒤의 본문만
파서에 들어간다 — `qbank/harness/qgen-core.ts:47,62-65`.

```md
<!-- ITEM 1
difficulty: BASIC
point: <이 문항만의 출제 포인트 — 유닛 내 중복 금지>
craft: <설계 메모(선택)>
settings: {"optionLanguage":"en"}
-->
근거문장: …
① …
```

`settings:` 는 JSON 한 줄이며 `rawTypeSettings[subType]` 에 병합된다(`qgen-core.ts:369-377`).
**노브를 바꾸지 않는 문항은 `settings:` 줄 자체를 생략한다.**

> 5문항 유닛 실물(노브 3종 분기 포함)이 `qbank/work/_probe-TOPIC_MAIN_IDEA.ts` 안에 있고, 이 프로브가
> `splitItems → parseAndGate → adapt → postProcess → validateQuestionQuality` 전 구간 클린을 실측했다(§검증).

---

## 3. 파서 계약 (★ 가장 중요)

> **prompts 의 문구가 아니라 아래 정규식이 계약이다.** 프롬프트는 "머리표 네 개를 그대로 쓰고 콜론을 빼지 마라"
> (`prompts-topic-main-idea.ts:376`)라고만 하지만, 파서는 그보다 넓거나 **좁게** 잡는 지점이 있다.

### 3-0. 문서 단위

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P0 | **1 마크다운 = 정확히 1문항.** 모든 머리표 정규식이 `m` 플래그 + `String.match` 첫 매치만 취한다 | `parser-topic-main-idea.ts:124-136,216-217` | 2번째 문항 이후가 **조용히 소멸**하거나 첫 문항을 오염 |
| P1 | 발문 줄(`발문: …`)을 써도 무시된다. 발문은 어댑터가 설정으로 합성 | `parser-topic-main-idea.ts:146`(CONTINUATION_STOP), `adapter-topic-main-idea.ts:99-104` | (안전) — 다만 쓸 이유가 없다 |

### 3-1. 섹션 머리표 문법 — `sectionHead()` `parser-topic-main-idea.ts:107-123`

```
HEAD_BULLET = (?:[-*•#][ \t]*)
HEAD_BOLD   = (?:\*\*|__)
body        = <NAME>(?![가-힣A-Za-z0-9])
withColon   = ^[ \t]*HEAD_BULLET* (HEAD_BOLD[ \t]*)? body [ \t]* HEAD_BOLD? [ \t]* [:：] [ \t]* HEAD_BOLD? [ \t]*
boldClosed  = ^[ \t]*HEAD_BULLET* HEAD_BOLD [ \t]* body [ \t]* ([:：][ \t]*)? HEAD_BOLD [ \t]* ([:：][ \t]*)?
headingLine = ^[ \t]*HEAD_BULLET+ body [ \t]*$
```

이름 리터럴(유형 전용, 교차 오염 방지) — `parser-topic-main-idea.ts:111-114`:

| 머리표 | 정규식 이름 | 허용 표기 |
|---|---|---|
| 근거문장 | `근거(?:[ \t]*(?:문장\|문))?` | `근거문장:` `근거 문장:` `근거문:` `근거:` |
| 정답 | `정답(?:[ \t]*(?:라벨\|번호))?` | `정답:` `정답 라벨:` `정답 번호:` |
| 해설 | `해설(?:[ \t]*(?:요지\|정리))?` | `해설:` `해설 요지:` `해설 정리:` |
| 오답 | `오답(?:[ \t]*(?:해설\|풀이\|선지\|목록\|리스트))?` | `오답:` `오답 해설:` `오답 풀이:` … |

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P2 | 콜론은 `:` 또는 전각 `：`. **콜론이 있으면** 불릿(`-*•`)·해시(`#`)·굵게 장식 자유 | `parser:119` | — |
| P3 | 콜론 생략은 **굵게로 닫힌 경우**(`**정답** ③`)와 **불릿/해시가 줄 전체를 차지한 경우**(`### 오답 해설`)만 | `parser:120-121` | 그 외 콜론 생략 시 필드가 **통째로 소멸** → 게이트가 "정답 누락" 같은 **거짓 원인**을 지목 |
| P4 | 이름 바로 뒤에 한글·영문·숫자가 붙으면 머리표가 아니다(`정답률`·`해설이`) | `parser:118` | (안전장치) 본문 줄이 머리표로 오인돼 섹션 경계가 앞으로 밀리는 것을 막는다 |
| **P5** | **저작 규칙: 장식 0.** `근거문장:` `정답:` `해설:` `오답:` 를 **맨몸으로** 쓴다 | `00-contract.md` §8 | 관용 범위는 유형마다 다르다 — 이 유형에서 통해도 다른 유형에서 터진다 |

### 3-2. 선지·오답해설 줄 — `GIST_LINE_HEAD` `parser-topic-main-idea.ts:62-63`

```regex
/^\s*\|?\s*(?:[-*•]\s*)?(?:\*\*)?\s*(?:([①-⑧])|[(（[]\s*([1-8])\s*[)）\]]|([1-8])\s*[.)．、])\s*(?:\*\*)?\s*(.+)$/
```

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P6 | 라벨 축은 **원문자 `①`~`⑧`**. `(3)` `3.` `3)` `3、` 도 흡수되지만 **저작은 원문자로만 한다** | `parser:62-63,171` | 맨몸 숫자는 뒤에 `.)．、` 가 있어야만 라벨 — `2026년에는…` 같은 산문은 선지로 잡히지 않는다(과잉관용 방지, 테스트 `scripts/_test-md-topic-main-idea.ts:329-339`) |
| P7 | **라벨 뒤 텍스트는 한 칸뿐.** 정답 표시(O/X·별표·`(정답)`)를 줄에 쓰지 않는다 | `prompts:19-20`, 스냅 `parser:368,404-406`, 게이트 `gate:46,86-88` | 스냅이 못 걷어낸 변형은 게이트 반려. 걷어내진 경우도 `corrections` 로 기록되어 검수에 뜬다 |
| P8 | 표 파이프(`\| ④ \| 텍스트`)와 굵게(`**②**`)는 흡수, `**` 는 텍스트에서 제거 | `parser:65-70,172,189` | — (그래도 쓰지 마라) |
| **P9** | **라벨 없는 줄은 직전 항목의 텍스트에 공백으로 이어 붙는다.** 즉 선지·오답해설을 **개행으로 나누면 한 줄로 병합**된다 | `parser:185-190` | 병합이 안 되던 시절엔 **절단된 선지가 게이트 CLEAN 으로 출하**됐다(회귀 A, `scripts/_test-md-topic-main-idea-regress.ts:58-94`). 지금은 병합되지만 **의도치 않은 메모·주석이 선지에 흡수**될 수 있다 → 선지·해설은 반드시 **한 줄**로 쓴다 |
| P10 | 병합 중단 조건: 빈 줄 / 다른 섹션 머리표 / `#` 헤딩 / 표 구분선 / **라벨 축 밖 원문자(`①-⑳`)** | `parser:140-153,181-188` | 빈 줄을 넣으면 그 뒤 산문은 선지에 안 붙는다(안전). `⑨` 같은 축 밖 원문자는 병합되지 않고 게이트에 드러난다 |

### 3-3. `정답:` 줄 — `parseGistAnswerRun` `parser-topic-main-idea.ts:76-92`

```regex
token = /^(?:([①-⑧])|[(（[]\s*([1-8])\s*[)）\]]|([1-8])(?![0-9]))/
sep   = /^\s*(?:[,·、]|과|와|and)\s*/i
```

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P11 | **선행 라벨 런만** 수집한다. `정답: ②, ④` → 둘 다 / `정답: ② — ④는 범위확대` → **②만** | `parser:76-92` | 정답 뒤에 산문을 붙여도 안전하지만, 복수정답을 산문 뒤에 적으면 **뒤쪽 정답이 소멸** |
| P12 | 구분자는 `, ` `·` `、` `과` `와` `and` | `parser:87` | 다른 구분자(`/`, `및`)로 이으면 두 번째 정답 이후가 소멸 → `정답 1개 (2개 필요)` 반려 |
| P13 | **정답의 유일 진실원은 `정답:` 줄이다.** 선지 줄에 정답 표시를 다시 받지 않는다 | `prompts:17-20`, `parser:29` | 중복 계약은 반의어 유형에서 실사용 2연속 반려의 원인이었다 |

### 3-4. 섹션 경계 — `parseMdTopicMainIdea` `parser-topic-main-idea.ts:215-253`

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P14 | 선지 수집 구간 = 문서 시작 ~ (`정답:`/`해설:`/`오답:` 중 **가장 먼저 나오는 자리**). 여기서 2개 미만이면 `오답:` 앞 전체로 폴백 | `parser:225-229` | 선지를 `정답:` 뒤에 쓰면 **폴백 경로**로만 잡히고, `해설:` 뒤에 쓰면 그 줄들이 **해설 값에 섞여 들어간다**(`parser:248-250`). 순서는 `근거문장 → 선지 → 정답 → 해설 → 오답` 고정(`prompts:377-379`) |
| P15 | 해설 = `해설:` 머리표 ~ `오답:` 머리표 직전(없으면 문서 끝까지) | `parser:129-136,248-250` | `오답:` 머리표가 없으면 해설이 오답 목록을 **통째로 삼킨다** |
| P16 | 오답 목록 = `text.split(WRONG_HEAD_RE)[1]`, 그중 **정답 라벨 줄은 파서가 제거** | `parser:231-237` | 오답 목록에 정답 줄을 끼워 넣어도 조용히 제거된다(그래도 쓰지 마라 — 게이트 #10 이 개수로 잡는다) |
| P17 | `근거문장:`/`정답:` 값의 `**` 는 제거 후 trim | `parser:196-198,216-217` | — |

### 3-5. 근거문장 정박 — `parser-topic-main-idea.ts:260-347`

| # | 규칙 | 근거 | 어기면 |
|---|---|---|---|
| P18 | 대조는 **fold 비교**: 소문자화 후 `[a-z0-9]` 만 남기고 나머지는 단일 공백 | `parser:260-285` | 구두점·곱슬따옴표·대소문자 드리프트는 안전. **단어 수준 재작성은 잡힌다** |
| P19 | fold 된 인용이 **12자 미만이면 정박 자체가 실패**(`not-found`) | `parser:293` | 짧은 인용 금지 |
| P20 | 근거문장은 지문의 **완결된 한 문장**이어야 한다: ① 지문 처음이거나 앞이 `.!?` 로 끝나고 ② `[.!?]["'”’)\]]*` 로 끝나고 ③ fold 후 **5단어 이상** | `parser:319,331-347` | 문장 중간 조각·종결 구두점 누락 → `근거문장이 지문의 완결된 한 문장이 아님` 반려(회귀 C, `-regress.ts:197-232`) |
| P21 | 스냅이 보정하는 것: 감싼 따옴표·불릿 제거 / 구두점 드리프트를 **지문 축자로 복원** / 두 문장 결합을 **가장 긴 축자 한 문장으로 축약** | `parser:380-440`(417-434) | 보정되면 `corrections` 에 기록되어 검수에 뜬다 — **보정에 기대지 말고 처음부터 축자로 적어라** |
| P22 | 근거문장은 **학생 표면에 나가지 않는다**(저장도 안 된다) | `parser:26`, `adapter:15-17` | 근거문장에 해설을 섞어 쓰면 정박만 깨지고 얻는 것이 없다 |

### 3-6. 스냅(0원 자동 보정) — `autoSnapTopicMainIdea` `parser-topic-main-idea.ts:380-440`

| 보정 | 조건 | 근거 |
|---|---|---|
| 선지를 라벨 순으로 정렬 | 라벨 중복 없음 + 전부 축 안 | `parser:386-399` |
| 선지 끝 `(정답)`·`(답)`·`(O)`·`(✓)` 제거 | `ANSWER_MARK_TAIL` `parser:368` | `parser:403-406` |
| 선지 앞 중복 라벨 제거(`① ① 내용`) | `DUP_LABEL_HEAD` `parser:370` | `parser:407-413` |
| 근거문장 구두점/따옴표 보정·축약 | 지문에서 자리를 찾을 때만 | `parser:417-434` |

**스냅이 손대면 반드시 `corrections` 가 남는다**(하네스가 `warnings` 로 기록 — `qgen-core.ts:313`). 무보정이 정상이다.

---

## 4. 게이트 체크리스트 — `gate-topic-main-idea.ts` (반려 사유 전수)

`requireWrong` 기본값 `true`(= `options.requireWrong !== false`, `gate:53`). 레인은 이 옵션을 넘기지 않으므로 **항상 true** (`lane-topic-main-idea.ts:141-145`).

| # | 사유 문자열(템플릿) | 조건 | file:line |
|---|---|---|---|
| 1 | `선지 {n}개 ({optionCount}개 필요)` | 선지 수 불일치 — **즉시 return, 다른 검사 전부 생략** | `gate-topic-main-idea.ts:59-61` |
| 2 | `선지 라벨이 {①②③④⑤} 순서가 아님 — 실제 {actual\|없음}` | 라벨이 `①`부터 순서대로가 아님(중복·누락·역순) | `gate:66-70` |
| 3 | `{label} 선지 텍스트 누락` | `normalizeWs(text)` 가 빈 문자열 | `gate:76-78` |
| 4 | `{first}·{label} 선지 텍스트 중복` | 소문자화 후 완전 동일한 선지 2개 | `gate:80-83` |
| 5 | `{label} 선지에 정답 표시가 남아 있음: '{…40자}'` | 선지에 `(정답)`·`(답)`·`(정답임)` — `gate:46` | `gate:86-88` |
| 6 | `{label} 선지가 영어 주제 표현이 아님: '{…40자}'` | `gistMode=TOPIC` 인데 한글 포함 또는 라틴 문자 없음 | `gate:92-95` |
| 7 | `{label} 선지가 한국어 진술문이 아님: '{…40자}'` | `gistMode=MAIN_IDEA` 인데 한글 없음 | `gate:96-98` |
| 8 | `{label} 선지가 지문 축자 복사임 — 재진술이 아님` | `gistMode=TOPIC` 전용. fold 4단어 이상인 선지가 fold 된 지문의 substring | `gate:103-112` |
| 9 | `정답 누락 — '정답:' 줄에서 선지 번호를 읽을 수 없음(받은 값: '{…40자}'). '정답: ②' 형식으로 적어라` | `정답:` 줄은 있으나 라벨 파싱 실패 | `gate:119-124` |
| 10 | `정답 누락` | `정답:` 머리표 자체가 없음 | `gate:119-124` |
| 11 | `정답 {n}개 ({answerCount}개 필요: {…})` | 정답 개수가 설정과 불일치 | `gate:125-127` |
| 12 | `정답 라벨({label})이 선지에 없음` | 정답 라벨이 선지 라벨 집합 밖 | `gate:128-130` |
| 13 | `해설 누락` | `해설:` 값이 빈 문자열 | `gate:133` |
| 14 | `근거문장 누락 — 정답 판단의 축이 된 지문 문장을 축자로 적어라` | `근거문장:` 값 없음 | `gate:138-139` |
| 15 | `근거문장이 지문에 축자로 없음(재진술·두 문장 결합 금지): '{…60자}'` | `verifyGistEvidenceSentence` → `not-found` | `gate:142-145` |
| 16 | `근거문장이 지문의 완결된 한 문장이 아님(문장 처음부터 종결 구두점까지 그대로 옮겨라): '{…60자}'` | `too-short` 또는 `not-a-sentence` | `gate:146-150` |
| 17 | `오답 블록 머리표를 인식할 수 없음 — '오답:' 으로 시작하는 줄 아래에 오답해설 {n}개를 적어라(굵게·해시 장식은 무방하다)` | `wrongSectionFound===false && wrong.length===0 && wrongNeeded>0` | `gate:160-163` |
| 18 | `오답해설 {n}개 ({wrongNeeded}개 필요)` | `wrongNeeded = optionCount - answerCount` 와 불일치 | `gate:165-167` |
| 19 | `오답해설 라벨 중복({label})` | 같은 라벨의 오답해설 2줄 | `gate:169-171` |
| 20 | `오답해설 라벨({label})이 선지에 없음` | 축 밖 라벨 | `gate:172` |
| 21 | `{label} 오답해설 누락` | 비정답 선지 중 해설이 없는 라벨 | `gate:174-178` |
| 22 | `오답해설에 정답 라벨 포함` | 파서 필터를 우회해 정답 라벨이 남은 경우(직접 호출 경로 방어) | `gate:181-183` |
| 23 | `해설이 선지를 번호로 지칭함 — 선지 내용으로 지칭하라` / `{label} 오답해설이 선지를 번호로 지칭함 — …` | 해설·오답해설에 `3번`·`선지 3`·`보기 3`·`(3)`·`①~⑤` 범위 표기 — `gate:42-43` | `gate:186-194` |

### 4-1. 게이트를 통과해도 죽는 자리 — 어댑터 실패 (하네스 코드 `ADAPT`)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {n}개 (2개 이상 필요)` | 선지 2개 미만 | `adapter-topic-main-idea.ts:57-59` |
| `정답 누락` | `answers.length === 0` | `adapter:60` |
| `정답 라벨이 선지에 없음: {…}` | 라벨 불일치 | `adapter:61-65` |
| `정답이 선지 전부 — 오답이 최소 1개는 있어야 한다` | `answers.length >= options.length` | `adapter:66-68` |
| `오답해설 라벨 중복({label}) — 해설이 덮어써진다` | 중복 라벨 | `adapter:80-86` |

### 4-2. qbank 유닛 축 (md-qgen 이 아니라 하네스가 낸다) — `qbank/harness/qgen-core.ts`

| 코드 | 사유 | 조건 | file:line |
|---|---|---|---|
| `CONTAINER` | `ITEM 헤더가 하나도 없다` / `settings 가 JSON 이 아니다` / `point(출제 포인트) 누락` / `본문이 비어 있다` / `ITEM 번호 비연속` | 컨테이너 형식 | `qgen-core.ts:57-85` |
| `ITEM_COUNT` | `문항 {n}개 — 최소 {minItems}개 필요` | 티어별 하한(기본 5) | `qgen-core.ts:229-236` |
| `POINT_DUPLICATE` | `출제 포인트 중복: "{point}" 가 문항 …에 반복` | `point:` 정규화 후 동일 | `qgen-core.ts:324-333` |
| `ANSWER_DUPLICATE` | `정답 표적 중복: "{target}" 가 문항 …의 정답` | **이 유형에서 target = 미끼 선지 텍스트 앞 60자**(정답이 아니다!) — `lane-topic-main-idea.ts:196-220` | `qgen-core.ts:336-353` |
| `UNSUPPORTED_LANE` | 레지스트리 미등록 | 해당 없음(등록됨 — `lane-registry.ts:22,57`) | `qgen-core.ts:205-224` |

---

## 5. adapter 산출 필드 — `adapter-topic-main-idea.ts:96-119`

| 키 | 값 | 비고 |
|---|---|---|
| `direction` | 설정으로 합성된 발문 문자열 | **모델이 쓰지 않는다.** 8가지 조합 = 주제/요지 × 긍정/부정 × 단수/복수 × ko/en — `prompts-topic-main-idea.ts:83-110` |
| `options[]` | `{label:"1".."8", text}` | **원문자 → 숫자 축 변환은 로컬 `gistDigitLabel`**(정본 `digitOptionLabel` 은 ①~⑤ 전용이라 6~8지에서 축이 깨진다) — `adapter:37-42` |
| `correctAnswer` | 정답 라벨을 `", "` 로 이은 문자열(`"3"` / `"2, 3"`) | `adapter:109` |
| `correctAnswers` | **정답 2개 이상일 때만** 배열로 추가 | 단일 정답에서는 키 자체가 없다(채점 MULTI 승격 조건) — `adapter:110` |
| `wrongOptionExplanations` | `[{label:"1", explanation}]` — 비정답 선지 순서, 빈 해설은 제외 | 후처리가 Record 로 정규화 + 한국어 선지 유형이면 `'<선지 텍스트>' 선택지는 …` 접두를 붙인다 — `question-postprocess/index.ts:256-308`. **어댑터가 접두를 미리 붙이면 이중 접두** |
| `explanation` | `해설:` 값 그대로 | |
| `keyPoints` | **항상 `[]`** | 합성 금지 규약 — `adapter:113-115`. KILLER 에서 `few-key-points` 경고가 뜨는 것은 **설계상 정상**(`validators/misc.ts:79-81`) |
| `tags` | `[]` | |
| `difficulty` | `ctx.rawDifficulty` | |

**이 유형에만 있는 것 / 없는 것**

- **없음**: `evidence`(근거문장)는 **저장하지 않는다** — 게이트 전용 정박점(`adapter:15-17`).
- **금지**: `blanks` / `passageWithBlank` / `originalExpression` / `blankAnswerMode` → `type-foreign-field` error
  (`validators/misc.ts:25-33,42-50`).
- **PASSTHROUGH**: 후처리가 선지·라벨을 만들어 주지 않는다(`question-postprocess/types.ts:66-72`). 어댑터 산출이 곧 최종형.
- 저장 후 **선지 셔플 대상**이다(`question-diversity.ts:508-522`). 그래서 게이트 #23(번호 지칭 금지)이 존재한다.

---

## 6. 생성 노브 (전수)

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `optionCount` (resolved: `genericOptionCount`) | number | **5** (`prompts-topic-main-idea.ts:38`, `generic.ts:11`) | **4~8** (`prompts:36-37`, `clampTopicMdOptionCount` `prompts:54-61`) | 선지 줄 수 = 이 값. 라벨은 `①`부터 이 개수만큼(`gate:64-70`). 어긋나면 게이트 #1 즉시 반려 |
| `answerCount` (resolved: `genericAnswerCount`, alias `correctAnswerCount`) | number | **1** (`prompts:40`) | **1 ~ optionCount-1** (`clampTopicMdAnswerCount` `prompts:64-72`) | `정답:` 줄의 라벨 수. 2 이상이면 `정답: ②, ④` 형식 + 발문이 "모두 고르시오"로 바뀐다. 오답해설 수 = `optionCount - answerCount` |
| `optionLanguage` | `"ko"｜"en"` | **"ko"** (`language.ts:21`) | 토글 가능 유형(`language.ts:64-72`) | **문항 형식 자체를 바꾼다.** `ko`=요지(한국어 완결 진술문) / `en`=주제(영어 명사구) — `lane:66-70`. 게이트 #6·#7·#8 의 분기축 |
| `stemLanguage` | `"ko"｜"en"` | **"ko"** (`language.ts:21`) | — | 발문 언어만 바꾼다(마크다운 본문 무영향). `en` 이면 레인이 "해설은 한국어 유지" extras 를 주입 — `lane:128-133` |
| `answerPolarity` | `"NEGATIVE"｜undefined` | undefined(=POSITIVE) | `"NEGATIVE"` 일 때만 유효 — `shared.ts:121-133` | **정답의 성질이 반전된다.** 정답 = "요지로 **부적절한** 선지". 발문이 "가장 적절하지 않은 것은?"으로 바뀌고 오답해설은 "왜 **타당**한지"를 쓴다 — `prompts:299-304,234-237` |
| `difficulty` (ctx) | `BASIC｜INTERMEDIATE｜KILLER` | INTERMEDIATE(하네스 기본) | — | 마크다운 **형식은 불변**. 근거 깊이·추상도 요구만 바뀐다 — `prompts:154-191` |

`isEligible`: `4 ≤ optionCount ≤ 8 && 1 ≤ answerCount ≤ optionCount-1` (`lane-topic-main-idea.ts:93-111`).
과금 축: `QUESTION_GEN_SINGLE`(2크레딧, `lane:88`) — qbank 는 과금 경로를 타지 않는다.

---

## 7. 함정 (코드 근거가 있는 것만)

1. **`오답:` 블록에 정답 라벨을 넣는다** → 파서가 조용히 제거(`parser:235-237`)한 뒤 게이트가
   `오답해설 {n}개 ({wrongNeeded}개 필요)` 로 **엉뚱해 보이는** 반려를 낸다(`gate:165-167`).
   비정답 라벨만, 정확히 `optionCount - answerCount` 개.

2. **해설에서 선지를 번호로 지칭** (`3번`, `선지 3`, `보기 3`, `(3)`, `①~⑤`) → 게이트 #23 반려.
   허용되는 것은 **원문자 단독 언급(`③`)과 선지 내용 지칭**뿐이다(`gate:42-43`, `question-diversity.ts:590-592`).
   실무 안전선: **선지는 내용으로만 지칭한다.**

3. **근거문장을 조각·재진술·두 문장 결합으로 적는다** → #15/#16 반려.
   특히 "종결 구두점 빼먹기"와 "문장 중간부터 시작"이 최다(`-regress.ts:198-212`).
   스냅이 일부를 구제하지만(`parser:417-434`) 자리를 못 찾으면 손대지 않는다.

4. **선지·해설을 여러 줄로 나눠 쓴다** → 지금은 병합되지만(`parser:185-190`), 그 사이에 넣은 설계 메모·주석이
   **선지 텍스트로 흡수**된다. 빈 줄이 있어야만 끊긴다(`parser:181-183`). **한 항목 = 한 줄**(`prompts:375`).

5. **주제 모드(en)에서 지문 문장을 그대로 옮긴 선지** → #8 `지문 축자 복사` 반려(fold 4단어 이상, `gate:103-112`).
   요지 모드(ko)는 이 검사가 **작동하지 않는다**(fold 가 비어 대조 불가, `gate:101-102`) — 한국어 선지의 축자성은
   게이트가 못 보므로 **검수 렌즈가 봐야 한다**.

6. **모드와 선지 언어의 불일치** → `optionLanguage=en` 인데 한국어 선지(#6), `ko` 인데 영어 선지(#7).
   `settings:` 에 `optionLanguage` 를 적었으면 그 문항의 **선지 전부**가 그 언어여야 한다.
   해설·오답해설은 **어느 모드에서도 한국어**다(`lane:128-133`, `validators/explanation-foreign-text.ts`).

7. **해설에 한자·가나 혼입, `영단어+다` 짜깁기** → 품질 축 error
   (`explanation-foreign-script` / `explanation-latin-jam`, `validators/explanation-foreign-text.ts:97-112`).
   한글 직후 괄호 병기만 예외.

8. **해설에서 지문에 없는 영어를 따옴표로 인용** → `explanation-quoted-token-missing` error
   (12자 이상 조각 기준, `validators/explanation-quoted-tokens.ts:117-162`). 인용은 **지문 축자만**.

9. **복수 정답 설정인데 발문을 직접 쓰려는 시도** → 발문은 어댑터가 만든다. 모델이 쓴 발문 줄은 무시되고,
   `answerCount≥2` 이면 품질 축이 발문에 `모두/all/apply` 를 요구한다(`dispatcher.ts:824-831`) — 어댑터가 이미 충족.

10. **유닛 내 미끼 재사용** → `ANSWER_DUPLICATE` 로 **유닛 전체가 차단**된다. 이 유형의 `diversityTargets` 는
    정답이 아니라 **미끼 선지 텍스트 앞 60자**를 표적으로 낸다(`lane:196-220`, `qgen-core.ts:336-353`).
    5~8문항에 걸쳐 **모든 오답 선지의 앞 60자가 서로 달라야 한다**. (프로브 C1 로 검출 실측)

11. **`point:` 문구 중복** → `POINT_DUPLICATE` 로 유닛 차단(`qgen-core.ts:324-333`). 정규화는 소문자화 + 비문자 제거이므로
    문장부호만 바꾼 재탕은 통하지 않는다.

12. **KILLER 문항의 `few-key-points` 경고** → 어댑터가 `keyPoints: []` 를 강제하므로 **회피 불가·무해**
    (`adapter:113-115`, `validators/misc.ts:76-81`). warning 이라 차단하지 않는다. 놀라지 마라.

13. **선지 길이 편중** → `option-length-giveaway` warning(최장 ≥ 최단×3 && 차이 > 18, `validators/misc.ts:93-95`).
    품질헌법 §3-6 은 더 엄격하다(최장 ≤ 최단×2).

---

## 8. 출제 포인트 다각화 축 — 한 지문에서 5~8문항

> 이 유형은 "정답이 하나뿐"인 유형이다. **한 지문의 요지는 하나다.** 그러므로 5~8문항을
> "정답을 바꿔서" 만들 수 없다 — 그렇게 하면 4~7개가 오답인 문항이 된다.
> 레인 주석이 이 함정을 명시한다: 정답을 회피 표적으로 내보내면 "틀린 정답을 만들라"는 지시가 된다
> (`lane-topic-main-idea.ts:187-195`). **다각화의 실체는 ① 표층 형식 노브 ② 미끼 팔레트 ③ 근거 경로다.**

### 8-A. 노브로 달라지는 축 (코드 근거 — `settings:` 한 줄로 결정형 분기)

| 축 | 설정 | 문항이 실제로 달라지는 지점 | 근거 |
|---|---|---|---|
| **선지 언어(=문항 형식)** | `{"optionLanguage":"en"}` | 요지(한국어 진술문) ↔ 주제(영어 명사구). **인지 작업이 다르다**: 진술문은 "명제의 참"을, 명사구는 "화제+관점의 층위"를 판정한다. 게이트 검사축도 바뀐다(#6/#7/#8) | `lane:66-70`, `gate:92-112` |
| **정답 극성** | `{"answerPolarity":"NEGATIVE"}` | 정답 = **부적절한 선지**. 나머지 전부가 타당해야 하므로 **오답 설계가 정답 설계로 뒤집힌다**. 학생은 "가장 좋은 것 고르기"가 아니라 "논지 방향 판정"을 한다 | `lane:72-76`, `prompts:299-304` |
| **선지 수** | `{"optionCount":6}` ~ `8` | 미끼 슬롯이 1~3개 늘어 기제 팔레트를 더 넓게 쓸 수 있다(6개 기제 전부 배치 가능) | `prompts:36-37,305-313` |
| **복수 정답** | `{"answerCount":2}` (+`optionCount`↑) | "모두 고르시오" 형식. 서로 다른 근거로 성립하는 요지 2개를 요구 → **재탕 금지**가 설계의 핵심 | `prompts:320-329`, `adapter:110` |
| **발문 언어** | `{"stemLanguage":"en"}` | 발문만 영어. 마크다운 본문은 불변 → **다각화 효과가 가장 약하다. 단독 축으로 쓰지 마라** | `lane:78-80,128-133` |
| **난이도** | ITEM 헤더 `difficulty:` | 근거 깊이(1문장 → 2문장 → 구조 전체)와 추상도 요구가 바뀐다. 품질헌법 §4 배분(5문항: B1/I2/K2, 8문항: B2/I3/K3) | `prompts:154-191`, `quality-constitution.md` §4 |

**유닛 조합 예 (5문항)**
1. BASIC · ko · POSITIVE · 5지 — 결론 문장 확인형
2. INTERMEDIATE · ko · POSITIVE · 5지 — 통념↔반박 2문장 연결형
3. KILLER · ko · POSITIVE · 5지 — 구조 전체 접기
4. KILLER · **en(주제)** · POSITIVE · 5지 — 명사구 층위 판정
5. INTERMEDIATE · ko · **NEGATIVE** · **6지** — 논지 방향 판정

(8문항 티어면 여기에 ① KILLER·en·NEGATIVE ② INTERMEDIATE·ko·복수정답(6지·2답) ③ BASIC·en 을 더한다.)

### 8-B. 설계로 달라지는 축 (교육적 판단 — 코드가 강제하지 않는다)

1. **근거문장 경로 배분** — 문항마다 `근거문장:` 을 **다른 문장**에서 뽑는다.
   전환 문장 / 기제 문장 / 대조의 양변 / 해법 문장 / 귀결 문장. 같은 문장을 5번 인용하면
   5문항이 사실상 같은 문항이다(게이트는 못 본다 — 검수 렌즈 ⑤의 대상).
   KILLER 는 **필자의 판단이 명시된 문장**만 허용, 예시·통계·인용 문장 금지(`prompts:167,190`).

2. **오답 기제 팔레트 순환** — 6기제(방향반대 / 도입부함정 / 범위확대·처방수입 / 세부과장(예시승격) /
   범위축소(소재만) / 근거없음(통념형), `prompts:305-313`)를 문항마다 **다른 조합**으로 뽑는다.
   품질헌법 §3 의 (L,F) 코드로 환산해 기록하면 중복이 결정형으로 드러난다.
   *한 문항 안에서 같은 기제 2개 금지, 유닛 안에서 같은 조합 2회 금지.*

3. **최매력 미끼의 위치 이동** — "끝까지 경합하는 미끼"를 문항마다 다른 논지 지점에서 만든다
   (도입 통념 / 전환 직후 / 사례 / 결론 인접). 학생이 **어느 지점에서 멈췄는지**를 문항마다 다르게 진단한다.

4. **정답의 추상화 층위** — 같은 요지라도 (a) 결론 문장의 평이한 재진술, (b) 두 문장의 인과 통합,
   (c) 글 전체 구조의 1단계 추상화로 **접는 정도**를 달리한다. 이것이 난이도 축의 실체다.

5. **표면 어휘 겹침 밀도** — BASIC 은 핵심어를 살리고, KILLER 는 **선지 전부가 핵심어를 비슷한 밀도로**
   물게 해 "지문과 단어가 제일 많이 겹치는 것 고르기" 요령을 죽인다(`prompts:165`).

6. **미끼 텍스트 전량 유일** — 8-A/8-B 를 다 지켜도 미끼 문구를 재활용하면 `ANSWER_DUPLICATE` 로
   유닛이 통째로 반려된다(§7-10). 문항 간 미끼는 **소재가 같아도 문장을 새로 써라.**

### 8-C. 하지 말 것

- ❌ **정답을 문항마다 바꾸기** — 요지는 하나다. 두 번째 요지를 만들면 그건 오답이다(`lane:187-195`).
- ❌ **발문 언어(`stemLanguage`)만 바꿔 문항 수 채우기** — 마크다운이 동일해 실질 사본이다.
- ❌ **정답 라벨만 옮기기** — 저장 단계에서 어차피 셔플된다(`question-diversity.ts:508-522`). 다각화가 아니다.

---

## 검증 (실측)

프로브: `qbank/work/_probe-TOPIC_MAIN_IDEA.ts` · 실행 `./node_modules/.bin/tsx qbank/work/_probe-TOPIC_MAIN_IDEA.ts`

```
PASS A: 리포 정상 픽스처 gateIssues=0
[B] itemCount=5 laneSupported=true ok=true
  ITEM 1 [BASIC]        gate=0 adapt=true post=true qErr=0 qWarn=0   direction="다음 글의 요지로 가장 적절한 것은?"      correctAnswer="3" options=5
  ITEM 2 [INTERMEDIATE] gate=0 adapt=true post=true qErr=0 qWarn=0   direction="다음 글의 요지로 가장 적절한 것은?"      correctAnswer="2" options=5
  ITEM 3 [KILLER]       gate=0 adapt=true post=true qErr=0 qWarn=1   (few-key-points — 설계상 정상)
  ITEM 4 [KILLER]       gate=0 adapt=true post=true qErr=0 qWarn=1   direction="다음 글의 주제로 가장 적절한 것은?"      correctAnswer="2" options=5
  ITEM 5 [INTERMEDIATE] gate=0 adapt=true post=true qErr=0 qWarn=0   direction="다음 글의 요지로 가장 적절하지 않은 것은?" correctAnswer="5" options=6
PASS B: blocking=0 · PASS B': qualityBlocking=0
```

음성테스트 10종 전부 검출(불변조건 I7): 미끼재사용 / 포인트중복 / 근거조각 / 근거재진술 / 번호지칭 /
주제모드한국어선지 / 지문축자복사 / 선지개수 / 오답해설누락 / 오답머리표.

> §2 골격은 **실측으로 통과가 확인된 형식**이다. 통과하지 못하는 변형을 임의로 만들지 마라.
