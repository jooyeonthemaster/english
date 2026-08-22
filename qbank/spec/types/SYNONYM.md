# 동의어 (SYNONYM)

> 분류 **선택형(어휘 계열)** · 지문변형 **없음 — md 에 지문을 쓰지 않는다** · 정답 머리표 **`정답:`** · 최소 지문 길이 **코드상 하한 없음(판단 하한 4문장/약 80단어 — §7-P14)**
>
> 검증: `qbank/work/_probe-SYNONYM.ts` **55/55 통과** — 5문항 유닛 `blocking 0 / qualityBlocking 0 / ok=true`, 음성·관용 대조군 26건 전부 의도대로 발화. 저장소 픽스처 `scripts/_test-md-synonym.ts` 156/156 통과(2026-07-28 실행).

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문 속 **단어 하나(≤3단어)에 밑줄**을 긋고, **그 자리에서 의미가 가장 가까운 후보**를 고르게 한다.
학생이 해야 하는 것은 사전 검색이 아니라 **대입 검사(uniqueness test)** 다 — 후보 N개를 원문장의 표적 자리에 하나씩 넣어 보고, 의미·어조·연어·논지 구조를 **동시에** 지키는 것이 정확히 K개인지 확인하는 일이다(`prompts-synonym.ts:189-192`, 원전 `question-generation-prompt-contract.ts:146`).

- **지문을 한 글자도 바꾸지 않는다. 그리고 md 에 지문을 쓰지도 않는다.** 이 유형의 저작물은 `대상:` 한 줄 + 선지 + 정답/해설/오답이 전부다(`prompts-synonym.ts:151-152`). 밑줄(`__표적__`)은 **후처리가 스스로 그린다**(`question-postprocess/processors/synonym.ts:36-41`).
  > ⚠ 헌법 §0 「지문 변형 허용 범위」 표는 SYNONYM 을 "어휘 치환 + 밑줄/네모 표기 ○" 로 적고 있으나, 그것은 fast 레인/구형 축이다. **md 레인 SYNONYM 은 지문 치환이 없고 지문 재구성 게이트도 없다**(`gate-synonym.ts:18-19` — "어법 분기의 '변형된 마커 수 == 정답 수' 계열 불변식을 복사하면 100% 반려된다").
- **지문 결속점이 `대상:` 한 줄뿐이다**(`parser-synonym.ts:7-10`). 그 한 줄이 지문 축자와 어긋나거나 지문에 2회 이상 등장하면 게이트가 죽인다. 게이트를 뚫더라도 후처리는 **실패하지 않고 경고만 남긴 채 밑줄 없는 문항을 저장한다**(`processors/synonym.ts:28-34`) — 즉 **게이트가 유일한 방어선**이다.
- **`문맥 문장(contextSentence)` 을 저작하지 않는다.** 표적 자리가 유일하게 확정되면 코드가 지문에서 잘라 낸다(`parser-synonym.ts:11-14, 327-367`; `adapter-synonym.ts:79-83`). md 에 `문맥:` 칸을 만들면 계약 위반이자 재진술 드리프트 실패 모드가 하나 늘 뿐이다.
- **인접 유형과의 경계**
  | 유형 | 표적 | 선지 표면 | 결정적 차이 |
  |---|---|---|---|
  | **SYNONYM** | 단어 1개(≤3단어, `SYNONYM_MD_TARGET_MAX_WORDS=3`) | **영어 단어/짧은 구(≤4단어)** | 표적↔선지 **굴절 형태 정합**을 기계가 강제(`gate-synonym.ts:308-345`) |
  | `IMPLIED_MEANING` | 압축 표현(≤6단어, 내용어 2개 이상) | 영어 **3단어 이상 진술문** | 단일 단어 표적은 게이트가 반려 |
  | `CONTEXT_MEANING` | 밑줄 단어(`underlinedWord`) | 뜻풀이형 선지 | 별도 레인·별도 필드 |
  | `ANTONYM` | 지문에 마커 5~10개 주입 | `word - antonym` 쌍 | 지문 재구성 대조 게이트 있음 |
- **승부처**: (a) 표적 단어 선정 — 문맥을 봐야 뜻이 결정되는 다의어·전이어인가, (b) 오답 {N−K}개의 **기제 분산**. 지문 창작 부담이 0이므로 남은 전부가 이 둘이다.
- **핵심 판단축**: 「사전이 알려 주는 의미」와 「이 문장이 요구하는 의미」의 **거리**. 거리 0 = 단어장 문항(실패), 거리가 문맥과 무관 = 억지 문항(실패).

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (qbank 유닛 컨테이너 포함)

```md
<!-- ITEM 1
difficulty: BASIC|INTERMEDIATE|KILLER
point: <이 문항만의 출제 포인트 — 유닛 내 중복 금지(POINT_DUPLICATE)>
craft: <설계 메모 — 정답 도출 경로와 최강 미끼>
settings: {"optionCount":5,"answerCount":1}
-->
대상: <지문 축자 단어 — 3단어 이내·지문에 1회만 등장·한 줄·장식 없음>
① <영어 단어 또는 4단어 이내의 짧은 구>
② <영어 단어 또는 짧은 구>
③ <영어 단어 또는 짧은 구>
④ <영어 단어 또는 짧은 구>
⑤ <영어 단어 또는 짧은 구>
정답: <①~⑤ 중 하나. 복수면 ", " 로 병기 — 예: ②, ④>
해설: <한국어 2문장. 표적이 이 문맥에서 갖는 의미가 무엇이고 정답이 왜 그 의미를 보존하는지. 합니다체>
오답:
① <기제이름 — 왜 매력적이고 어느 한 조건에서 어긋나는지 1문장>
③ <기제이름 — …>
④ <기제이름 — …>
⑤ <기제이름 — …>
```

- `<!-- ITEM n ... -->` 는 **qbank 컨테이너 규약**이지 md-qgen 계약이 아니다(`qbank/harness/qgen-core.ts:19-47`). 하네스가 여기서 잘라 낸 **아래 본문만**이 계약 대상이다. `settings:` 는 기본값(5지1정답)이면 생략해도 된다.
- `오답:` 목록에는 **정답 라벨을 넣지 않는다.** 정확히 `optionCount − answerCount` 줄 — 위 골격은 정답이 ②인 경우라 ①③④⑤ 네 줄이다. 정답이 ④면 ①②③⑤ 가 된다.
- 장식 0: 굵게·헤딩·불릿·인용·표·백틱을 쓰지 않는다(이 파서는 흡수하지만 **관용은 계약이 아니다** — 00-contract §8).

### 2-2. 검증된 정상 픽스처 전문 — `scripts/_test-md-synonym.ts:47-67` (verbatim)

지문(`scripts/_test-md-synonym.ts:47-53`):

```
Managers who suppress every disagreement eventually cultivate a silence that looks like consensus. The quiet is then read as approval, so nobody asks what the team has stopped saying aloud. Junior staff learn fast that raising a concern costs more than staying still. Researchers at Cornell traced the same drift in hospital teams and in newsrooms. By the time a project fails, the warning signs have been circulating privately for months. What the company lost was never the argument itself but the information the argument carried.
```

문항(`scripts/_test-md-synonym.ts:55-67`):

```md
대상: cultivate
① till
② foster
③ tolerate
④ fabricate
⑤ endure
정답: ②
해설: 이 글에서 cultivate 는 밭을 간다는 뜻이 아니라 침묵이라는 분위기를 서서히 길러 낸다는 뜻으로 쓰였습니다. foster 는 의도치 않게 무언가를 자라게 한다는 의미여서 목적어와 인과 구조를 그대로 지키므로 정답입니다.
오답:
① 다의어 오축 — 경작한다는 뜻의 정당한 사전 동의어지만 침묵을 목적어로 받지 못합니다.
③ 논지 배반 — 관리자가 침묵을 허용했다는 말이 되어 만들어 냈다는 인과가 사라집니다.
④ 강도 이동 — 의도적으로 날조한다는 세기가 과해 무의식적 결과라는 문맥과 어긋납니다.
⑤ 의미장 이웃 — 침묵과 자주 붙어 다녀 연상으로 끌리지만 동의 관계가 아닙니다.
```

복수 정답(6지 2정답) 픽스처는 `scripts/_test-md-synonym.ts:386-399`.

### 2-3. 자체 검증 실물 — `qbank/work/_probe-SYNONYM.ts` ITEM 5 (KILLER, gate 0 / quality 0)

지문 마지막 문장: `The discipline a designer needs is therefore not restraint alone but the nerve to advertise a gap.`

```md
대상: advertise
① promote
② disclose
③ conceal
④ tolerate
⑤ exaggerate
정답: ②
해설: 마지막 문장은 설계자에게 필요한 것이 절제가 아니라 "the nerve to advertise a gap" 이라고 말합니다. 여기서 advertise 는 상품을 광고한다는 뜻이 아니라 모르는 자리를 감추지 않고 드러낸다는 뜻이므로 disclose 가 정답입니다.
오답:
① 다의어 오축 — 광고한다는 뜻의 정당한 사전 동의어지만 이 문장의 목적어는 상품이 아니라 빈틈입니다.
③ 방향 반대 — 감춘다는 뜻이라 앞 문장이 비판한 은폐로 되돌아갑니다.
④ 논지 배반 — 참고 견딘다는 말이 되어 드러내라는 처방이 사라집니다.
⑤ 강도 이동 — 과장한다는 세기가 더해져 사실대로 밝힌다는 요구를 넘어섭니다.
```

> 해설의 영어 인용 `"the nerve to advertise a gap"` 은 **지문 축자**라서 통과한다(프로브 P7c). 축자가 아니면 `explanation-quoted-token-missing` **error** 다(프로브 P7a) — §4-D.

---

## 3. 파서 계약 (★ 가장 중요)

진실원은 `src/lib/md-qgen/parser-synonym.ts` 다. 프롬프트(`prompts-synonym.ts:226-229`)가 느슨해도 여기가 계약이다.

### 3-0. 문서 골격 — 섹션 절단 순서

| # | 규칙 | 원문 | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|
| S1 | `오답:` 머리표 **첫 매치**로 문서를 2분할. 앞=본문, 뒤=오답 구역 | `text.split(WRONG_SECTION_RE)` | `parser-synonym.ts:205,208` | 해설 안에 줄머리 `오답…` 을 쓰면 거기서 잘려 오답해설이 통째로 소실 |
| S2 | 선지 구역 = 본문에서 **`정답:` 머리표 앞까지** | `beforeWrong.split(ANSWER_SECTION_RE)[0]` | `parser-synonym.ts:207` | 선지를 `정답:` 뒤에 쓰면 엄격 구역이 빈다 |
| S3 | 선지 0개일 때만 구제로 `오답:` 앞 전체를 다시 훑는다 | `if (options.length === 0) options = parseLabeledLines(beforeWrong)` | `parser-synonym.ts:228-232` | 구제는 **0개일 때만**. 1개라도 읽히면 넓혀 읽지 않는다 |
| S4 | 1 문서 = 1 문항. 모든 값 정규식이 **첫 매치**만 취한다(`m` 플래그, `g` 없음) | `text.match(...)?.[1]` | `parser-synonym.ts:210,212` / 00-contract §3 | 한 파일에 2문항을 붙이면 2번째가 조용히 사라지거나 1번째를 오염 |

### 3-1. 키워드 줄 관용 — 네 머리표가 **같은 두 조각을 공유**한다

```ts
const KEY_LINE_HEAD = "^#{0,6}[ \\t]*(?:[-*•][ \\t]*)?(?:\\*\\*)?[ \\t]*";        // parser-synonym.ts:172
const KEY_LINE_SEP  = "(?:\\*\\*)?[ \\t]*[:：][ \\t]*(?:\\*\\*)?[ \\t]*";           // parser-synonym.ts:174
function keywordLineRe(label, tail = "") {                                        // parser-synonym.ts:176-178
  return new RegExp(`${KEY_LINE_HEAD}(?:${label})${KEY_LINE_SEP}${tail}`, "m");
}
const WRONG_SECTION_SOURCE =                                                      // parser-synonym.ts:183
  `${KEY_LINE_HEAD}오답(?:[ \\t]*해설)?(?:\\*\\*)?[ \\t]*(?:[:：][ \\t]*(?:\\*\\*)?[ \\t]*|(?=[ \\t]*\\*{0,2}[ \\t]*\\r?$))`;
const ANSWER_SECTION_RE  = keywordLineRe("정답");                                  // :185
const ANSWER_LINE_RE     = keywordLineRe("정답", "(.+)$");                         // :186
const EXPLANATION_LINE_RE= keywordLineRe("해설", `([\\s\\S]*?)(?=${WRONG_SECTION_SOURCE})`); // :187-190
const EXPLANATION_TAIL_RE= keywordLineRe("해설", "([\\s\\S]+)$");                  // :191
const TARGET_LINE_RE     = keywordLineRe(                                         // :194-197
  "대상(?:[ \\t]*단어)?|밑줄(?:[ \\t]*단어)?|표적(?:[ \\t]*단어)?", "(.+)$");
```

| # | 규칙 | file:line | 어기면 사라지는 것 |
|---|---|---|---|
| K1 | 머리표는 **줄머리에만**(`^` + `m`). 문장 중간의 `… 정답: ②` 는 안 잡힌다 | `:172,177` | 그 필드 통째 소실 |
| K2 | 콜론은 `:` 또는 전각 `：` — **생략 불가**(`[:：]` 는 옵셔널 아님) | `:174` | 「대상 단어 누락 / 정답 누락 / 해설 누락」이라는 **사실과 다른 사유** (프로브 E5) |
| K3 | 헤딩 `#`~`######` · 불릿 `- * •` · 굵게 `**` · 전각 콜론은 **흡수**된다 (`**정답:**`·`- 해설:`·`## 오답:` 모두 통과 — 프로브 E4) | `:172-174` | (관용) **단 계약이 아니다. 장식 0 을 지켜라** — `parser.ts` 정본은 흡수하지 않는다(00-contract §8) |
| K4 | `오답` 은 **콜론 없는 헤더**(`### 오답`)도 그 줄이 헤더뿐일 때 받는다 | `:183` | 못 읽으면 오답 구역이 해설에 먹혀 「오답해설 0개」 로만 보인다 |
| K5 | 표적 라벨 별칭: `대상:` `대상 단어:` `밑줄:` `밑줄 단어:` `표적:` `표적 단어:` (**계약 표기는 `대상:`**) | `:194-197` | 다른 라벨(`단어:`·`타깃:`)은 미인식 → 「대상 단어 누락」 |
| K6 | `대상:`·`정답:` 값은 `(.+)$` — **같은 줄**에서만 읽는다 | `:186,197` | 값을 다음 줄에 쓰면 필드가 빈다(프로브 E6) |
| K7 | `해설:` 만 `[\s\S]*?` 라 여러 줄 허용. `오답:` 이 있으면 그 앞까지, 없으면 문서 끝까지 | `:187-191` | — |
| K8 | 해설 값은 `stripEmphasisSpans` → 후행 `**` 제거 → trim | `:248-254` | 본문 중간 `**강조**` 도 벗겨져 저장 표면에 마크업 0 |

### 3-2. 선지·오답해설 줄 정규식 (원문 그대로)

```ts
const OPTION_LINE_RE =                                                     // parser-synonym.ts:62-63
  /^\s*\|?\s*(?:[-*•]\s*)?(?:\*\*)?(?:([①-⑩])|\(([1-9])\)|([1-9])[.)])(?:\*\*)?[.)]?\s*(.+)$/;
```

| # | 규칙 | file:line | 어기면 사라지는 것 |
|---|---|---|---|
| O1 | 라벨은 원문자 `①~⑩` / `(1)~(9)` / `1.` / `1)` 셋 중 하나. **맨 숫자 + 공백(`3 text`)은 라벨이 아니다** | `:63` | 그 줄이 선지에서 사라져 「선지 N개」 반려 |
| O2 | 라벨 앞의 표 파이프 `|`·불릿 `- * •`·여는 `**` 는 흡수 — **선지 줄과 오답 줄이 같은 관용 수준**(프로브 E7·E8) | `:62-63` | (관용) ANTONYM 은 오답 줄이 불관용이라 여기서 갈린다 |
| O3 | 라벨 뒤 본문 `(.+)$` 가 **비면 그 줄을 버린다** | `:145-146` | 선지 개수 부족 |
| O4 | **같은 라벨 두 번 → 첫 줄만** 취한다 | `:148` | 두 번째 줄 소실(게이트는 개수로만 인지) |
| O5 | `circledLabel` 로 원문자 축 정규화. `"3"`·`"(3)"`·`"3."` → `③`, 범위 밖(0·11+)은 `""` → 줄 버림 | `:47-57` | — |
| O6 | 본문은 `cleanOptionText`: `stripEmphasisSpans`(중간 `**…**`·백틱) → `stripInlineDecoration`(양끝 `** * __ _ ` ~~ " ' “” ‘’` 4회 반복) → 선행 `- – — : ：` 제거 → **후행 `,`·`;` 만** 제거, 3회 반복 | `:83-136` | 중간 쉼표(`fabricate, invent`)는 **일부러 남긴다** — 게이트가 반려해야 하므로 |
| O7 | 오답해설도 **같은 정규식**으로 읽는다. `wrong` 은 정답 라벨을 자동 제외하고 그 라벨을 `answerLabelsInWrong` 에 기록 | `:234-240` | 오답 칸에 정답 줄을 넣으면 개수가 하나 비어 반려(단 이유는 지목된다 — 프로브 E12) |
| O8 | 오답해설이 **두 줄로 접히면** 둘째 줄은 라벨이 없어 통째로 무시된다 | `:140-150` | 해설 내용 소실 — 오답해설은 반드시 한 줄 |

### 3-3. `정답:` 값 파싱 — 선행 라벨 런만 수집

```ts
const answerLine = text.match(ANSWER_LINE_RE)?.[1] ?? "";                              // :212
const leadingRun = answerLine.match(
  /^\s*((?:[①-⑩]|\(?[1-9]\)?)(?:\s*[,·]\s*(?:[①-⑩]|\(?[1-9]\)?))*)/,
)?.[1] ?? "";                                                                          // :215-218
const answers = [...new Set([...leadingRun.matchAll(/[①-⑩]|[1-9]/g)]
  .map((m) => circledLabel(m[0])).filter(Boolean))];                                   // :219-225
```

| # | 규칙 | file:line | 어기면 |
|---|---|---|---|
| A1 | 구분자는 **`,` 또는 `·`** 뿐(앞뒤 공백 허용). 계약 표기는 `", "` | `:217` | **`정답: ② ④`(공백 병기)는 ④가 조용히 사라진다.** 프로브 E2 실측: `answerCount=1` 설정에선 **게이트 클린으로 통과**해 정답 하나짜리 문항이 출하된다 |
| A2 | 선행 런 **밖**의 라벨은 무시 — `정답: ② — ④는 강도가 과함` 은 ②만 | `:215-218` | (의도된 관용) |
| A3 | 중복 라벨은 `Set` 으로 1회 | `:219-225` | 「정답 N개」 개수 불일치 |
| A4 | `answer = answers[0]` | `:247` | — |
| A5 | **선지 줄에 정답 표시 칸을 두지 않는다.** `정답:` 줄이 유일 진실원 | `:33`, `gate-synonym.ts:410` | 선지 줄에 O/X·(정답)을 쓰면 그 문자가 선지 본문이 된다 |

### 3-4. `대상:` 값 확정 — 이 유형의 심장

값 정리: `stripTargetDecoration = stripInlineDecoration`(`:159-161`) — 양끝 마크다운·따옴표만 벗기고 **문장 구두점은 벗기지 않는다**(지문 축자일 수 있으므로). 그 판단은 스냅이 지문과 대조해 한다(`:155-158`).

탐색기 `locateSynonymTarget(passage, target)` — `parser-synonym.ts:280-306`. **게이트·어댑터·스냅이 전부 이 하나를 쓴다**(층간 불일치 방지, `:260-264`).

| 흡수하는 차이 | 코드 |
|---|---|
| 공백량 (토큰 사이 `\s+`) | `:286-289` |
| 곱슬/곧은 따옴표, en/em dash | `flexiblePunctuation` `:267-272` |
| 대소문자 (`gi` 플래그) | `:294` |
| 영문 시작/끝이면 **단어 경계 강제** (`art"is"ts` 사고 방지) | `:290-291` |

`count` = 지문 전체 등장 횟수 → 게이트 「자리 모호」의 근거(`gate-synonym.ts:218-223`).

0원 자동 보정 `autoSnapSynonymTarget` — `parser-synonym.ts:377-428`. **진실원은 지문이다.**

| 순서 | 조건 | 동작 | file:line |
|---|---|---|---|
| 1 | `passage.includes(target)` | 무보정(최다 경로) | `:386` |
| 2 | 유일 위치 발견 | 지문 축자 슬라이스로 교체 + correction 1건 | `:388-394` |
| 3 | 앞뒤 구두점·따옴표·대시만 어긋남 | 구두점 정리 후 재탐색 | `:396-409` |
| 4 | 선행 한정어(`the a an its their his her our your this that these those`) 를 함께 적음 | 한정어 제거 후 재탐색 | `:411-425` |
| — | 위치가 2곳 이상 | **보정하지 않는다** — 게이트가 「자리 모호」로 반려 | `:309-313, 386-394` |

→ **저작 규칙: 스냅에 기대지 마라.** correction 은 하네스에서 `AUTOSNAP` 경고로 남는다(`qgen-core.ts:313`). 지문에서 그대로 복사하라(프로브 P3 는 AUTOSNAP 0 을 확인한다).

### 3-5. 파생값 `contextSentence` — 코드가 만든다

`synonymContextSentence(passage, index, length)` — `parser-synonym.ts:327-367`.
표적 **앞쪽**으로는 직전 문장 종결부호(`. ! ?` + 공백) 또는 빈 줄 다음부터, **뒤쪽**으로는 표적 뒤 첫 종결부호까지를 잘라 낸다. 400자 초과·분해 실패 시 **표적 ±60자 윈도우**로 폴백(`:315-316, 359-365`).
쓰이는 곳: ① 후처리 `findWordInPassage` 의 1순위 전략(`surroundingText` 윈도우 우선 탐색, `text-utils.ts:339-348`) ② `passageWithUnderline` 이 없을 때의 폴백 표면.

### 3-6. 라벨 축 (3중 변환)

| 자리 | 축 | 코드 |
|---|---|---|
| 저작 md | 원문자 `①~⑧`(계약, `optionCount` 상한 8) / 파서는 `⑨⑩` 까지 읽어 게이트가 지목 | `parser-synonym.ts:19-20`, `prompts-synonym.ts:22-24` |
| 어댑터 산출 | 문자열 숫자 `"1"~"N"` (options 배열 **순서** 기준) | `adapter-synonym.ts:59,104-108` |
| 학생 표면 | 표시 계층이 다시 `①~` 로 | `adapter-synonym.ts:57-58` |

**`정답: ②` 는 「두 번째로 쓴 선지」를 뜻한다.** 어댑터가 라벨을 인덱스로 바꾸므로(`indexByLabel`), 선지를 ①②④⑤ 처럼 건너뛰어 쓰면 게이트가 라벨 순서로 먼저 반려한다.

---

## 4. 게이트 체크리스트

### 4-A. 차단 축 ① — `gateMdSynonym` (`parsed.gateIssues`, 프로덕션·qbank 공통 차단)

호출: `lane-synonym.ts:150-165` → `gateMdSynonym(q, passage, {optionCount, answerCount})`.
기본값: `optionCount = q.options.length`, `answerCount = 1`, `requireWrong = true` — `gate-synonym.ts:384-386`. **레인은 항상 실제 설정을 넘긴다.**

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {n}개 ({N}개 필요) — 인식된 라벨 {…}, {…} 줄이 없거나 형식이 어긋남, {…} 는 계약 밖 라벨` | `q.options.length !== optionCount`. **조기 return 하지 않는다** — 나머지 검사도 계속 돈다(라벨 순서 검사만 끈다) | `gate-synonym.ts:389,397-403`, `labelDiffNote :367-376` |
| `선지 라벨이 ①②③④⑤ 순서가 아님 — 실제 {…}` | 라벨 연결이 `SYNONYM_MD_CIRCLED.slice(0,N)` 과 불일치 (개수 불일치 시 생략) | `gate-synonym.ts:111-115` |
| `{라벨} 선지 텍스트 누락` | `!opt.text` | `gate-synonym.ts:119-121` |
| `선지 중복 — {A}와 {B}가 같은 단어: '…'` | `compareKey`(장식·따옴표·후행구두점 제거 + 소문자) 동일 | `gate-synonym.ts:123-127, 91-102` |
| `선지 {A}와 {B}가 같은 단어의 굴절형 — 독립된 후보가 아니다: '…'` | `antonymPairKey` 동일(ies→y, -ing/-ed/-s 절단) | `gate-synonym.ts:130-141`, `core.ts:216-224` |
| `{라벨} 선지에 한글이 섞임 — 선지는 영어 단어/구 전용: '…'` | `containsHangul` | `gate-synonym.ts:157-159` |
| `{라벨} 선지가 영어 표현이 아님: '…'` | `!containsLatinLetter` | `gate-synonym.ts:161-164` |
| `{라벨} 선지에 괄호 뜻풀이·부연이 붙음 — 단어만 남겨라: '…'` | `/[()[\]{}]/` | `gate-synonym.ts:165-169` |
| `{라벨} 선지에 뜻풀이·병기가 붙음 — 구분자 '{x}' 로 두 표현이 이어져 있다…` | `/\s[-–—]\s\|[–—/\|:;=,]/` — **공백 대시·en/em대시·`/`·`\|`·`:`·`;`·`=`·`,`**. 맨몸 하이픈(`well-being`)은 통과 | `gate-synonym.ts:175-180` |
| ``{라벨} 선지에 마크다운 장식(**·_·`)이 남음 — 단어만 써라: '…'`` | ``/[*_`~]/`` | `gate-synonym.ts:183-187` |
| `{라벨} 선지가 {w}단어 — 동의어 선지는 4단어 이내의 단어·짧은 구다: '…'` | `countWordsForQuality > SYNONYM_MD_OPTION_MAX_WORDS(4)` | `gate-synonym.ts:188-193`, `prompts-synonym.ts:40` |
| `{라벨} 선지가 문장 형태 — 동의어 후보 단어만 써라: '…'` | `/[.!?]/` | `gate-synonym.ts:194-198` |
| `대상 단어 누락 — \`대상:\` 줄이 없거나 비어 있음` | `!q.target.trim()` — **단독 반환**(다른 표적 검사 생략) | `gate-synonym.ts:210` |
| `대상 단어가 지문에 축자로 없음 — 지문에서 그대로 복사하라(굴절형·대소문자 포함): '…'` | `locateSynonymTarget` = null | `gate-synonym.ts:213-217` |
| `대상 단어가 지문에 {n}회 등장 — 밑줄 자리가 모호하다. 한 번만 나오는 단어를 골라라: '…'` | `hit.count > 1` | `gate-synonym.ts:218-223` |
| `대상이 {w}단어 — 3단어 이내의 단어(또는 한 덩어리 숙어)로 잡아라: '…'` | `countWordsForQuality > SYNONYM_MD_TARGET_MAX_WORDS(3)` | `gate-synonym.ts:226-231`, `prompts-synonym.ts:38` |
| `대상이 기능어 — 내용어(동사·명사·형용사·부사)를 골라라: '…'` | `isTinyFunctionWord(target)` 또는 **모든 토큰**이 `SYNONYM_FUNCTION_WORDS`(관사·대명사·be/조동사·전치사·접속사 **89개**) | `gate-synonym.ts:234-237, 55-70`, `core.ts:422-424` |
| `대상이 고유명사로 보임(문장 중간의 대문자 단어) — 일반 내용어를 골라라: '…'` | 단일 토큰 + `/^[A-Z]/` + 문장 첫머리가 아님(직전 2자가 `[.!?]\s` 도 `\n` 도 아님) | `gate-synonym.ts:241-247` |
| `{라벨} 선지가 대상 단어와 동일 — 자기 자신은 동의어 후보가 아니다: '…'` | `compareKey(opt) === cleanText(target).toLowerCase()` | `gate-synonym.ts:319-322` |
| `{라벨} 선지가 대상 단어의 굴절형 — 다른 단어를 써라: '…' (대상 '…')` | `antonymPairKey` 동일 | `gate-synonym.ts:323-329` |
| `{라벨} 형태 불일치 — "{t}" and "{o}" do not share third-person/plural -s form` | 표적·선지 **둘 다 단일 영어 토큰**일 때만. `hasInflectionalS` 불일치. **표적 또는 선지가 단수 -s 명사/학문명(-ics)/방향부사(-wards)면 면제** | `gate-synonym.ts:286-301, 263-274`, `validators/antonym.ts:269-273`, `core.ts:206-212` |
| `{라벨} 형태 불일치 — … do not share -ing / -ly form` | 접미사 유무 불일치 | `validators/antonym.ts:275-281` |
| `{라벨} 형태 불일치 — … do not share comparative / superlative form` | `isLikelyComparativeForm` / `isLikelySuperlativeForm` 화이트리스트 | `validators/antonym.ts:298-309, 315-323` |
| `형태 불일치 — 선지 {n}개가 전부 대상 '{t}' 과 굴절 형태가 어긋난다(…). 대상의 품사·굴절형을 다시 확인하고…` | 형태 위반이 **2개 이상이면서 전 선지**일 때 한 줄로 집계 | `gate-synonym.ts:337-343` |
| — (**발화하지 않음**) | `past/participle form` 축은 **의도적으로 제외**(26-07-27 과잉차단 실측: `raw-unrefined`·`natural-forced`) | `gate-synonym.ts:290-292` |
| `{해설\|{라벨} 오답해설}가 선지를 평숫자로 지칭함('{x}') — 선지 순서는 출제 후 재배열된다…` | `UNMAPPABLE_MENTION` = `/(?:[1-9]\s*번(?!째))\|(?:선지\s*[1-9])\|(?:보기\s*[1-9])\|(?:\(\s*[1-9]\s*\))\|(?:[①-⑳]\s*[~∼〜‐–—-]\s*[①-⑳])/` | `gate-synonym.ts:348-364, 78-79` |
| `정답 누락 — \`정답:\` 줄이 없거나 라벨을 읽을 수 없음` | `q.answers.length === 0` | `gate-synonym.ts:412-413` |
| `정답 {n}개 ({K}개 필요) — 실제 {…}` | `answers.length !== answerCount` | `gate-synonym.ts:414-418` |
| `정답 라벨({라벨})이 선지에 없음` | 정답 라벨이 옵션 라벨 집합 밖 | `gate-synonym.ts:419-421` |
| `해설 누락` | `!normalizeText(q.explanation)` (길이 요구 없음) | `gate-synonym.ts:423` |
| `오답해설 {n}개 ({N−K}개 필요) — 정답을 뺀 모든 선지에 1개씩. 인식된 라벨 {…}{ · 정답 라벨 {…} 줄이 오답 칸에 있어 제외됨(정답 해설은 \`해설:\` 줄에 쓴다)}` | `requireWrong !== false` && 개수 불일치 | `gate-synonym.ts:425-438` |
| `오답해설에 정답 라벨({라벨}) 포함` | (파서가 걷어내므로 직접 호출 경로용) | `gate-synonym.ts:440-441` |
| `오답해설 라벨({라벨})이 선지에 없음` | 오답 라벨이 옵션 밖 | `gate-synonym.ts:442-444` |
| `교사 지정 표현이 대상 단어가 아님: '…'` | `ctx.teacherPoints` 가 비지 않을 때만. **이 유형은 POINT_PICKER 미등재라 실제로 항상 `[]`** | `lane-synonym.ts:89-101` |

### 4-B. 차단 축 ② — 어댑터 실패 (`gateIssues` 0 인데도 죽는 자리)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {n}개 (4~8개 필요)` | 옵션 수가 4~8 밖 | `adapter-synonym.ts:45-53` |
| `대상 단어 누락` | `!q.target.trim()` | `adapter-synonym.ts:54-55` |
| `정답 라벨({라벨})이 선지에 없음` | — | `adapter-synonym.ts:62-65` |
| `정답 누락` | 정답 인덱스 0개 | `adapter-synonym.ts:68` |
| `정답이 전 선지 — 오답이 하나도 없음` | `answerIndices.length >= options.length` | `adapter-synonym.ts:69-71` |

### 4-C. 차단 축 ③ — 후처리 (`postProcessQuestion`)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `Missing targetWord field` | **error(차단)** | `question-postprocess/processors/synonym.ts:16-23` |
| `Word not found in passage: "…"` | **warning — 차단하지 않는다.** `passageWithUnderline` 없이 저장된다 | `processors/synonym.ts:28-34` |

> ★ 이 유형에서 후처리는 방어선이 아니다. 표적 축자·자리 유일 게이트(4-A)를 통과시키는 것이 전부다.

### 4-D. 차단 축 ④ — 품질 검증 error (프로덕션은 **비차단**, qbank 하네스는 `qualityBlocking` 으로 **차단**)

`lane.filterQualityIssues` 가 없으므로(`lane-synonym.ts` 미구현) **전량이 그대로 올라온다.** SYNONYM 코드는 `SHIP_FIRST_WARNING_CODES` 에 하나도 없어 강등도 없다(`core.ts:31-62`).

| 코드 | 조건 | 극성 | file:line |
|---|---|---|---|
| `passage-boundary-spacing-corruption` / `passage-duplicate-sentence` / `passage-joined-sentence-token` | **지문 자체** 결함(구두점 뒤 공백 없음·문장 중복·문장시작어 접합) | error | `passage-integrity.ts:36-106`, 호출 `dispatcher.ts:790-794` |
| `type-foreign-field` | `blanks` / `passageWithBlank` / `originalExpression` 중 하나라도 있으면 | error | `validators/misc.ts:31,42-50` |
| `option-count` | `options.length !== genericOptionCount` (SYNONYM 은 `MC_TYPE_IDS`) | error | `validators/options.ts:43,140-142` |
| `duplicate-option-label` / `duplicate-option-text` / `empty-option-text` | — (게이트가 선차단) | error | `validators/options.ts:144-158` |
| `option-spelling-triple-letter` | 선지에 같은 글자 3연속(`iii`·`www` 제외) — **게이트에 없는 독립 축** | error | `validators/options.ts:160-179, 12-22` |
| `correct-answer-mismatch` | `correctAnswer` 라벨이 옵션에 없음 | error | `validators/options.ts:195-218` |
| `generic-answer-count` | `answerCount ≥ 2` 인데 정답 라벨 수 불일치 | error | `dispatcher.ts:810-823` |
| `generic-multi-answer-direction` | `answerCount ≥ 2` 인데 발문에 `모두\|all\|apply` 없음 — 어댑터의 MULTI 발문이 보장 | error | `dispatcher.ts:824-831`, `adapter-synonym.ts:37-38` |
| **`explanation-foreign-script`** | 해설·오답해설에 **한자·가나·중문 구두점**. 한글 직후 괄호 한자 병기만 예외 | error | `validators/explanation-foreign-text.ts:32-34,97-104` |
| **`explanation-latin-jam`** | 해설에 `소문자영단어 + 다` 직접 접합(`assured다`) | error | `validators/explanation-foreign-text.ts:39-41,105-112` |
| **`explanation-quoted-token-missing`** | 해설이 따옴표로 인용한 **12자 이상** 영어 조각이 지문·선지 등 표면 어디에도 없음 | error | `validators/explanation-quoted-tokens.ts:117-162` |
| `mid-word-marker` | `passageWithUnderline` 의 `__…__` 가 단어 내부 (findWordInPassage 가 `\b` 를 쓰므로 사실상 무발화) | error | `validators/grammar/marked.ts:6-31` |
| `explanation-choice-count-mismatch` | 해설이 "N지선다"라 진술하는데 실제 선지 수와 다름 | warning | `validators/options.ts:254-272` |
| `thin-wrong-option-explanations` | KILLER && 오답해설 수 부족 | warning | `validators/options.ts:241-246` |
| `thin-killer-explanation` | KILLER && 해설 80자 미만 | warning | `validators/misc.ts:71-74` |
| `few-key-points` | KILLER && `keyPoints.length < 3` — 어댑터가 `keyPoints: []` 를 고정 산출하므로 **KILLER 문항에 항상 붙는다. 정상이다** | warning | `validators/misc.ts:76-81`, `adapter-synonym.ts:116` |

> **SYNONYM 은 `validateTypeSpecific` 에 전용 분기가 없다**(`dispatcher.ts:926-2577` 전수 — SYNONYM 케이스 부재). `SHORT_TARGET_TYPES` 에도 미등재라(`dispatcher.ts:752-756`) `target-not-standalone` 도 발화하지 않는다. **즉 이 유형의 품질 축은 "공통 게이트 + 해설 언어 3종" 이 전부**이고, 표적·선지 품질은 오롯이 4-A 가 진다.

### 4-E. 차단 축 ⑤ — qbank 유닛 게이트 (`qgen-core.ts`)

| 코드 | 조건 | file:line |
|---|---|---|
| `CONTAINER` | `<!-- ITEM n -->` 누락·번호 비연속·`point:` 누락·본문 공백·`settings:` JSON 파손·difficulty 값 오류 | `qgen-core.ts:57-85` |
| `ITEM_COUNT` | 문항 < 5(기본) | `qgen-core.ts:229-236` |
| `POINT_DUPLICATE` | 유닛 내 `point:` 정규화 값 중복 | `qgen-core.ts:325-333` (프로브 P5b) |
| `ANSWER_DUPLICATE` | 두 문항의 `diversityTargets`(= **`targetWord` 하나**) 동일 | `qgen-core.ts:336-353`, `lane-synonym.ts:204-209` (프로브 P5a) |

---

## 5. adapter 산출 필드

`adaptMdSynonymToAiQuestion` → `postProcessQuestion` 후 `structuredData` 에 실리는 키.

| 키 | 값 | 생산자 | 비고 |
|---|---|---|---|
| `direction` | 단일: `다음 밑줄 친 단어의 의미와 가장 유사한 것은?` / 복수: `다음 밑줄 친 단어의 의미와 가장 유사한 것을 모두 고르시오.` | 어댑터 `:34-38,100` | `stemLanguage="en"` 이면 레인이 영어 문장으로 교체(`lane-synonym.ts:42-46,173-178`). 복수 발문에 **"모두"** 가 있어야 `generic-multi-answer-direction` 통과 |
| **`targetWord`** | 지문 축자 표적 단어 | 어댑터 `:102` | ★ 이 유형 고유. `diversityTargets` 의 원천, 후처리 밑줄의 좌표 |
| **`contextSentence`** | 표적을 감싸는 **지문 축자 문장**(자리 유일할 때만, 아니면 `""`) | 어댑터 `:79-83` → `synonymContextSentence` | ★ 이 유형 고유. **코드가 계산 — md 에 칸을 만들지 마라** |
| **`passageWithUnderline`** | 지문에 `__표적__` 을 삽입한 전문 | **후처리만** `processors/synonym.ts:36-41` | ★ **어댑터에서 만들면 충돌**(`adapter-synonym.ts:12-13`) |
| `options[]` | `{label:"1".."N", text}` — md 순서 보존 | 어댑터 `:104-107`, 후처리가 라벨 접두·괄호 뜻풀이 제거(`question-postprocess/index.ts:191-241`) | 게이트가 괄호를 이미 반려하므로 정상 경로에선 무발화 |
| `correctAnswer` | `"2"` / 복수 `"2, 5"` | 어댑터 `:108` | |
| `correctAnswers[]` | **복수 정답일 때만** 생성 | 어댑터 `:111-113` | 단일에 넣으면 fast 산출과 형상이 달라진다 |
| `wrongOptionExplanations[]` | `{label:"1".., explanation}` — 정답 제외, 빈 문자열 제외 | 어댑터 `:86-95` | 후처리가 Record 로 정규화 |
| `explanation` | `해설:` 값 | 어댑터 `:115` | |
| `keyPoints` | **항상 `[]`** (합성 금지) | 어댑터 `:116`, 근거 `:18-19` | `few-key-points` warning 은 정상 |
| `tags` | `[]` | 어댑터 `:117` | |
| `difficulty` | `ctx.rawDifficulty` | 어댑터 `:118` | |

**절대 실리면 안 되는 것**: `blanks` · `passageWithBlank` · `originalExpression` (빈칸 계열 이물, `type-foreign-field` error) — `adapter-synonym.ts:15-17`, `validators/misc.ts:31`.

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `optionCount` (resolved `genericOptionCount`) | number | **5** | 4~8 (`clampSynonymMdOptionCount`) | 선지 줄 수 · 라벨 상한 `①~⑧` · `오답:` 줄 수(N−K) — `prompts-synonym.ts:26-28,42-49`, `generic.ts:22-43` |
| `answerCount` (resolved `genericAnswerCount`, alias `correctAnswerCount`) | number | **1** | 1 ~ (optionCount−1) (`clampSynonymMdAnswerCount`) | `정답:` 줄의 라벨 개수(`", "` 병기) · 오답해설 줄 수 · 발문(단일/모두 고르기) — `prompts-synonym.ts:29-30,51-62`, `generic.ts:46-56` |
| `stemLanguage` | `"ko"\|"en"` | **"ko"** | — | **선지·해설에는 영향 없음.** `direction` 문자열만 교체 + 프롬프트에 언어 블록 1개 추가 — `lane-synonym.ts:68-72,137-148,173-178` |
| `optionLanguage` | — | **"en" 구조 고정** | 변경 불가 | `getQuestionLanguageToggleScope("SYNONYM") === "stem"` 이라 저장값을 무시한다. 레인이 상수 `"en"` 을 쓴다 — `lane-synonym.ts:74-81`, `language.ts:61-79` |
| `difficulty` | `BASIC\|INTERMEDIATE\|KILLER` | (전역 폴백) | — | **게이트 극성을 바꾸지 않는다**(`gateMdSynonym` 은 difficulty 를 받지 않는다). 바뀌는 것은 ① 프롬프트의 표적 설계 분기(`prompts-synonym.ts:79-94`) ② BASIC 은 few-shot 생략(`:178`) ③ KILLER 에서 품질 **warning** 2종 추가 — `validators/misc.ts:66-81` |
| `variantIndex` / `variantCount` | number | 0 / 1 | — | 저작 md 형식에 영향 없음(`lane-synonym.ts` 미사용) |
| `teacherPoints` | array | `[]` | — | POINT_PICKER 미등재라 항상 빈 배열. 있으면 지정 표현이 표적과 포함관계여야 함 — `lane-synonym.ts:83-101` |
| (하드 상수) `SYNONYM_MD_TARGET_MAX_WORDS` | 3 | — | 변경 불가 | 표적 단어 수 상한 — `prompts-synonym.ts:38` |
| (하드 상수) `SYNONYM_MD_OPTION_MAX_WORDS` | 4 | — | 변경 불가 | 선지 단어 수 상한 — `prompts-synonym.ts:40` |

- `isEligible`: `4 ≤ optionCount ≤ 8` && `1 ≤ answerCount ≤ optionCount − 1` — `lane-synonym.ts:112-128`. 벗어나면 유형 자체가 실행되지 않는다.
- 유닛에서는 `<!-- ITEM n -->` 헤더의 `settings:` JSON 으로 문항별 지정한다(`qgen-core.ts:71-78,369-377`). 키 이름은 **`optionCount`/`answerCount`/`stemLanguage`** (resolved 이름 `genericOptionCount` 가 아니다 — `generic.ts:39,47`). 프로브 P4a/P4b 에서 6지2정답·영어 발문 모두 `blocking 0 / qualityBlocking 0` 확인.
- 과금 축: `QUESTION_GEN_VOCAB`(1크레딧) — `lane-synonym.ts:107`. `retryEligible: true`(`:110`)라 프로덕션은 반려 시 1회 재생성하지만 **오프라인 하네스에는 재생성이 없다**(00-contract §2).

---

## 7. 함정 (코드 근거 있는 것만)

| # | 함정 | 무슨 일이 나는가 | 근거 |
|---|---|---|---|
| **P1** | `정답: ② ④` — **공백으로 병기** | ④가 **조용히 사라진다**. `answerCount=1` 설정에선 게이트도 클린이라 "정답 하나짜리 문항"으로 출하된다. 반드시 `", "` 또는 `·` | `parser-synonym.ts:217`, 프로브 E2/E2' 실측 |
| **P2** | 표적이 지문에 **2회 이상 등장** | `대상 단어가 지문에 N회 등장 — 밑줄 자리가 모호` 반려. 스냅도 손대지 않는다. `blank`·`the argument` 처럼 흔한 말을 조심 | `gate-synonym.ts:218-223`, 프로브 E1 |
| **P3** | 표적을 **원형으로 되돌려** 적음(`cultivated` → `cultivate`) | 지문 축자가 아니면 반려. 스냅은 구두점·한정어·대소문자만 흡수하고 **굴절형은 복원하지 않는다** | `parser-synonym.ts:377-428`, `gate-synonym.ts:213-217` |
| **P4** | 표적과 **선지의 굴절 형태 불일치** | 표적이 `-s`(3인칭/복수)면 선지 전부 `-s`, `-ing` 이면 전부 `-ing`, `-ly` 면 전부 `-ly`. 하나만 어긋나면 그 라벨, 전부 어긋나면 대상을 지목한 한 줄. **`-ed`(과거·분사) 축은 면제** | `gate-synonym.ts:286-301,337-343`, 프로브 E10/E10'/E11 |
| **P5** | `-s` 로 끝나는데 **굴절이 아닌** 단어를 표적으로 잡음 | 면제 경로는 세 겹뿐이다: ①`NON_INFLECTIONAL_S_WORDS` 29개(`species·series·news·means·lens·bias·corps·chaos·canvas·atlas·alias·ethos·pathos·cosmos·census·surplus·headquarters·premises·goods·savings·odds·riches·customs·always·perhaps·sometimes·besides·nonetheless·whereas`) ②`/(?:ics\|wards)$/` ③core 의 `ss\|us\|is\|ous\|less\|ness` 종결(`process·campus·analysis·crisis`). **이 셋 어디에도 없는 -s 단어**(실측: `clothes`·`outskirts`)를 표적으로 잡으면 **선지 5개가 전부 「-s 형태 불일치」로 반려**돼 문항이 100% 실패하고, 그 문구가 재생성 피드백이 되어 모델이 억지 복수화로 끌려간다 | `gate-synonym.ts:263-274`, `core.ts:206-212`, 프로브 E16/E16' |
| **P6** | 선지에 **뜻풀이 병기** — `fabricate, invent` · `fabricate / invent` · `fabricate: invent` · `fabricate - invent` | `뜻풀이·병기가 붙음` 반려. 정답 선지가 이러면 뜻풀이가 곧 정답 힌트다. **하이픈 합성어(`hand-rear`·`well-being`)는 통과** | `gate-synonym.ts:175-180`, 프로브 E3 |
| **P7** | 선지에 **괄호·한글·마침표** | 각각 `괄호 뜻풀이·부연` / `한글이 섞임` / `문장 형태` 반려. 후처리가 괄호를 떼어내 주긴 하지만 **떼면 선지가 통째로 달라지므로 게이트가 먼저 반려한다** | `gate-synonym.ts:157-198,146-152` |
| **P8** | 표적을 **선지에 넣음**(자기 자신 또는 굴절형) | `대상 단어와 동일` / `대상 단어의 굴절형` 반려 = 정답 누출 | `gate-synonym.ts:319-329`, 프로브 E14 |
| **P9** | 해설·오답해설에서 선지를 **평숫자로 지칭**(`2번`·`선지 3`·`보기 2`·`(2)`·`②~④`) | `평숫자로 지칭함` 반려. 선지는 저장 직전 셔플된다(`SHUFFLE_OPTION_TYPES` 에 SYNONYM 포함 — `question-diversity.ts:517`). 단어를 직접 쓰거나 원문자만 써라 | `gate-synonym.ts:78-79,348-364`, 프로브 E13 |
| **P10** | 해설에 **지문에 없는 영어 문구를 따옴표 인용** | 12자 이상 조각이면 `explanation-quoted-token-missing` **error** → qualityBlocking. 인용은 **지문 축자만** | `validators/explanation-quoted-tokens.ts:117-162`, 프로브 P7a/P7c |
| **P11** | 해설에 **영단어+종결어미 짜깁기**(`assured다`) 또는 **한자·가나** | `explanation-latin-jam` / `explanation-foreign-script` error | `validators/explanation-foreign-text.ts:32-41`, 프로브 P7b |
| **P12** | 콜론 생략(`대상 confident`) 또는 값 개행 | 머리표 정규식이 `[:：]` 를 요구하고 값은 `(.+)$` 라 같은 줄만 읽는다 → 필드 통째 소실 → 「대상 단어 누락」이라는 **사실과 다른 사유** | `parser-synonym.ts:174,197`, 프로브 E5/E6 |
| **P13** | 오답해설을 **두 줄로 접음** | 둘째 줄은 라벨이 없어 통째로 무시된다. 개수는 맞아 게이트는 통과 → 학생 표면에 반쪽 해설 | `parser-synonym.ts:140-150` |
| **P14** | 지문이 짧아 표적 후보가 모자람 | 코드상 하한은 없다. 그러나 유닛 5~8문항은 **서로 다른 `targetWord`** 를 요구하고(`ANSWER_DUPLICATE`), 각 표적은 **지문 전체에서 1회만** 등장해야 한다. 프로브 지문(146단어)은 1회 등장 5자 이상 토큰이 75개였다 — 4문장/약 80단어 아래로 내려가면 KILLER 급 다의어 표적이 고갈된다 | `qgen-core.ts:336-353`, `gate-synonym.ts:218-223`, 프로브 실측 |
| **P15** | 표적이 **문장 중간의 대문자 단어** | 고유명사 추정 반려. 지문의 브랜드·인명·지명은 표적이 될 수 없다 | `gate-synonym.ts:241-247` |
| **P16** | 선지 라벨 건너뛰기(`①②④⑤⑥`)·중복 | 라벨 순서 반려. 중복 라벨은 첫 줄만 살아 「선지 N개」 반려 | `gate-synonym.ts:111-115`, `parser-synonym.ts:148` |
| **P17** | 머리표에 마크다운 장식 | 이 파서는 흡수하지만 **정본 `parser.ts` 는 흡수하지 않는다.** 유형마다 관용 범위가 다르므로 **장식 0** 을 지켜라 | `parser-synonym.ts:163-197`, 00-contract §8, 프로브 E4 |
| **P18** | 해설 본문 줄머리에 `오답`·`정답`·`해설`·`대상` 으로 시작하는 줄 | `오답` 은 그 지점에서 문서를 잘라 오답 구역을 오염시킨다(첫 매치 split). 해설은 한 줄로 쓰고 줄머리 키워드를 피하라 | `parser-synonym.ts:205,208` |

---

## 8. 출제 포인트 다각화 축

한 지문에서 이 유형으로 **5~8문항**을 만드는 방법. 실증: `qbank/work/_probe-SYNONYM.ts` 가 지문 1개(8문장·146단어)에서 5문항을 만들어 `blocking 0 / qualityBlocking 0` 을 받았다.

> **이 유형의 다각화 1축은 언제나 「표적 단어」다.** `diversityTargets = [targetWord]` 하나뿐이므로(`lane-synonym.ts:204-209`) **표적이 겹치는 순간 유닛 전체가 `ANSWER_DUPLICATE` 로 죽는다.** 표적 N개를 먼저 확정하고 문항을 짜라.

### 8-A. 노브로 달라지는 축 (코드 근거)

| 축 | 조작 | 코드 근거 | 문항이 어떻게 달라지는가 |
|---|---|---|---|
| **A1. 선지 수** | `settings: {"optionCount":4~8}` | `prompts-synonym.ts:26-28`, `generic.ts:38-43` | 오답 슬롯이 3~7로 변한다 → **기제 팔레트 크기가 강제로 달라진다**(4지=기제 3종, 6지=5종). 오답 6종 분류학(§8-B4)을 다 쓰려면 7지가 필요하다 |
| **A2. 정답 수** | `settings: {"answerCount":1~N−1}` | `prompts-synonym.ts:29-30,182-185` | 단일 선택 ↔ **모두 고르기**. 복수 정답은 "서로 다른 측면에서 표적 의미를 만족시키는 두 후보"를 요구해 인지 작업 자체가 바뀐다(발문도 교체). 프로브 P4a: 6지2정답 gate 0 |
| **A3. 발문 언어** | `settings: {"stemLanguage":"en"}` | `lane-synonym.ts:42-46,137-148` | 표층 형식만. 다각화 기여도 최하 — **이것만 바꾼 두 문항은 사본이다** |
| **A4. 난이도** | `difficulty:` BASIC / INTERMEDIATE / KILLER | `prompts-synonym.ts:79-94` | **게이트 극성은 안 바뀐다**(§6). 바뀌는 것은 설계 기준: BASIC=근거 1문장, INTERMEDIATE=앞뒤 문장의 논리 방향(사전 동의어 오답 최소 1개), KILLER=다의어·전이어 표적 + 사전 동의어 오답 2개 이상. 헌법 §4 배분: 5문항=B1/I2/K2, 8문항=B2/I3/K3 |
| — | **보기 언어** | `lane-synonym.ts:74-81` | **조작 불가.** 구조 고정 `"en"` — 다각화 축이 아니다 |

### 8-B. 설계로 달라지는 축 (교육적 판단 — 여기가 진짜 다각화다)

| 축 | 내용 | 실행 규칙 |
|---|---|---|
| **B1. 표적의 품사** | 동사 / 명사 / 형용사 / 부사 / 구동사·숙어(2~3단어) | 한 유닛에서 **같은 품사를 3회 이상 쓰지 마라.** 품사가 바뀌면 굴절 정합 축(P4)도 함께 바뀌어 선지 설계가 통째로 달라진다. 구동사 표적은 선지도 구(phrase)가 되어 형태 게이트가 자동 면제된다(`gate-synonym.ts:330-331`) |
| **B2. 표적의 논지 위치** | 도입 통념 / 논지 전환점 / 기제 설명 / 사례·근거 / 결론 압축 | **한 유닛에서 같은 위치를 두 번 겨냥하지 마라.** 결론부의 전이어는 KILLER 가, 도입부의 서술 형용사는 BASIC 이 가져가는 것이 자연스럽다 |
| **B3. 의미 전이의 종류** | (1) **다의어**(사전에 여러 뜻: `cultivate`·`address`·`charge`·`run`) (2) **비유적 전이**(구체→추상: `advertise a gap`) (3) **평가어**(필자 태도가 실린 형용사·부사) (4) **전문·기술 용어의 일상화** (5) **투명 내용어**(BASIC 전용) | `prompts-synonym.ts:88-93`. **KILLER 2문항은 (1)·(2) 에서 각각 하나씩** 뽑으면 사본이 되지 않는다. (5)만으로 채운 유닛은 단어장이지 문항이 아니다 |
| **B4. 오답 기제 팔레트(6종)** | ①**다의어 오축**(다른 사전 의미의 정당한 동의어) ②**연어 위반** ③**강도 이동** ④**태도 극성** ⑤**논지 역할 배반** ⑥**의미장 이웃** | `prompts-synonym.ts:102-122`. 오답 2개 이상이면 **①은 필수 포함**. **문항마다 나머지 슬롯의 조합을 달리 짜라** — 5지 문항 5개가 전부 `①②③⑥` 이면 그건 1문항의 5개 사본이다. 헌법 §3 의 (L,F) 코드와 1:1 대응시켜 `craft:` 에 적어라 |
| **B5. 최강 미끼의 정체** | 어느 오답이 중위권을 끄는가 — 다의어 오축(L3 통념 공명) / 의미장 이웃(L1 핵심명사 재사용) / 강도 이동(L2 부분사실) | 문항마다 **다른 기제를 최강으로** 놓는다. `craft:` 줄에 명시해 검수 렌즈 ④가 대조할 수 있게 |
| **B6. 정답이 요구하는 판단 근거** | 목적어 연어 / 주어의 성격 / 앞 문장이 세운 인과 / 필자의 태도 극성 / 문단 전체의 논지 역할 | `prompts-synonym.ts:91`. **같은 표적이라도 정답을 확정하는 근거가 다르면 다른 문항이고, 근거가 같으면 표적이 달라도 사실상 사본**(검수 렌즈 ⑤ 대상) |
| **B7. 정답의 사전 거리** | 정답이 (a) 1순위 사전 동의어인가 (b) 문맥에서만 성립하는 2순위인가 | KILLER 는 (b) 를 쓰되 **"가장 희귀한 동의어"를 정답으로 삼지 마라**(`prompts-synonym.ts:90`) — 어휘 자랑은 변별이 아니다 |

### 8-C. 5문항 배치 견본 (프로브 실물 — 전부 통과)

| # | 난이도 | 표적 | 품사(B1) | 논지 위치(B2) | 전이 종류(B3) | 정답 | 오답 팔레트(B4) |
|---|---|---|---|---|---|---|---|
| 1 | BASIC | `confident` | 형용사 | 도입 묘사 | 투명 내용어 | assured | 방향반대·의미장이웃·소재연상·논지배반 |
| 2 | INTERMEDIATE | `charming` | 형용사(-ing) | 도입 통념(현대 독자의 평가) | 평가어 | appealing | 태도극성·의미장이웃·연어위반·강도이동 |
| 3 | INTERMEDIATE | `preserved` | 동사(-ed) | 기제 설명 | 다의어 | maintained | 방향반대·연어위반·**다의어오축**·의미장이웃 |
| 4 | KILLER | `inherit` | 동사(원형) | 논지 전환점 | 비유적 전이 | take on | 논지배반·방향반대·태도극성·의미장이웃 |
| 5 | KILLER | `advertise` | 동사(원형) | 결론 압축 | 비유적 전이 | disclose | **다의어오축**·방향반대·논지배반·강도이동 |

- 표적 5개가 전부 다르므로 `ANSWER_DUPLICATE` 통과, `point:` 5개가 전부 다르므로 `POINT_DUPLICATE` 통과.
- **굴절 축을 일부러 흩었다**: 2번은 `-ing` 축(선지 5개 전부 `-ing`), 3번은 `-ed` 축, 4·5번은 원형. 이 하나만으로도 선지 세트가 서로 절대 재활용되지 않는다.
- 8문항으로 늘릴 때는 A1(선지 수)·A2(복수 정답)을 3·5번 계열에 얹어 표층 형식까지 갈라라 — 단, **A3(발문 언어) 단독 변주는 사본이다.**

### 8-D. 표적 후보를 0원으로 미리 뽑는 법

이 유형에는 `buildMdImpliedCandidateBlock` 같은 후보 생성기가 **없다**(`prompts-synonym.ts` 전수 — 후보 블록 부재). 대신 게이트가 요구하는 조건이 전부 결정형이므로 저작 전에 손으로 거르면 된다:

1. `locateSynonymTarget(passage, w).count === 1` — **지문 전체에서 1회만** 등장 (`parser-synonym.ts:280-306`)
2. `SYNONYM_FUNCTION_WORDS` 89개 + `isTinyFunctionWord` 20개에 없음 (`gate-synonym.ts:55-66,234-237`, `core.ts:422-424`)
3. 문장 첫머리가 아닌 대문자 단어가 아님 (`gate-synonym.ts:241-247`)
4. 3단어 이내 (`gate-synonym.ts:226-231`)
5. `-s` 로 끝난다면 굴절형인지 단수형인지 확정 — 단수형이면 면제 목록에 있는지 확인 (`gate-synonym.ts:263-274`)

→ 이 5조건을 통과한 목록을 먼저 만들고 **B1(품사)·B2(위치)·B3(전이 종류)로 분배**하면 P2(자리 모호)·P4(형태 불일치)·P15(고유명사) 사고가 사전에 소거된다.
