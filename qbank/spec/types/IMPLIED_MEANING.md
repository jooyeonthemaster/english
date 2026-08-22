# 함축 의미 추론 (IMPLIED_MEANING)

> 분류 **선택형(대의파악 계열)** · 지문변형 **없음(PASSTHROUGH)** · 정답 머리표 **`정답:`** · 최소 지문 길이 **코드상 하한 없음(판단 하한 4문장/약 60단어 — §7-P9)**
>
> 검증: `qbank/work/_probe-IMPLIED_MEANING.ts` — 5문항 유닛 `blocking 0 / qualityBlocking 0 / ok=true`, 음성 대조군 8건 전부 의도대로 반려. 저장소 픽스처 `scripts/_test-md-implied.ts` 177/177 통과(2026-07-28 실행).

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문 속 **짧은 표현 한 곳(≤6단어)에 밑줄**을 긋고, 그 표현이 **함축하는 의미**를 고르게 한다.
학생은 밑줄을 문장으로 되돌린 뒤 **앞뒤 근거 문장을 이어** 필자의 판단·인과·평가를 복원해야 한다.

- **어휘 문제가 아니다.** 단일 단어·대명사·기능어·사전식 숙어는 파서가 아니라 게이트가 반려한다(`gate-implied.ts:199-203`). 그 자리는 `CONTEXT_MEANING`·`REFERENCE` 의 것이다.
- **대의파악 계열이다.** 프롬프트 선언: "함축 의미 추론은 대의파악 계열이다… 밑줄의 함축을 '이 글의 요지는 ___다'의 빈칸에 넣었을 때 글 전체의 요지로 환원되어야 한다"(`prompts-implied.ts:190-193`). 이 선언은 장식이 아니라 **KILLER 에서 기계가 집행**한다(`isCentralImpliedMeaningTarget` — §4 Q1).
- **다른 유형과의 결정적 차이**: 이 유형은 지문을 한 글자도 바꾸지 않는다. 마커도, 빈칸도, 재구성 대조도 없다. **지문과의 결속점이 `밑줄:` 한 줄뿐**이다(`parser-implied.ts:6-9`). 그 한 줄이 지문 축자와 어긋나면 게이트 → 어댑터 → 후처리(`findExpressionInPassage`) 어느 층에서든 전체가 죽는다.
- **승부처**: (a) 밑줄 자리 선정, (b) 오답 {N−K}개의 기제 분산. 지문 창작 부담이 0이므로 남은 전부가 이 둘이다.
- **핵심 판단축**: 「표면의 말(직역)」과 「글의 중심 의미」 사이의 **거리**. 거리 0 = 독해 확인 문제(실패), 중심 의미와 무관 = 나쁜 함축 문제(실패).

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (qbank 유닛 컨테이너 포함)

```md
<!-- ITEM 1
difficulty: BASIC|INTERMEDIATE|KILLER
point: <이 문항만의 출제 포인트 — 유닛 내 중복 금지(POINT_DUPLICATE)>
craft: <설계 메모 — 정답 도출 경로와 최강 미끼>
-->
밑줄: <지문 축자 표현 — 6단어 이내·90자 이내·지문에 1회만 등장·한 줄>
① <선지 1 — 영어 3단어 이상>
② <선지 2>
③ <선지 3>
④ <선지 4>
⑤ <선지 5>
정답: <①~⑤ 중 하나. 복수면 ", " 로 병기 — 예: ②, ④>
해설: <한국어 2문장. 어느 근거 문장을 어떻게 이어 표면 의미에서 함축으로 넘어가는지. 합니다체>
오답:
① <기제이름 — 왜 매력적이고 왜 탈락인지 1문장>
② <기제이름 — …>
④ <기제이름 — …>
⑤ <기제이름 — …>
```

- `<!-- ITEM n ... -->` 는 **qbank 컨테이너 규약**이지 md-qgen 계약이 아니다(`qbank/harness/qgen-core.ts:19-47`). 하네스가 여기서 잘라 낸 **아래 본문만**이 계약 대상이다.
- `오답:` 목록에는 **정답 라벨을 넣지 않는다.** 정확히 `optionCount − answerCount` 줄.
- 장식 0: 굵게·헤딩·불릿·인용·표·백틱을 쓰지 않는다(파서가 흡수하긴 하지만 관용은 계약이 아니다).

### 2-2. 검증된 정상 픽스처 전문 — `scripts/_test-md-implied.ts:50-71` (verbatim)

지문(`scripts/_test-md-implied.ts:50-55`):

```
Cities often replace their oldest pavements with cheap modern slabs, and the change is defended as ordinary maintenance. Yet the worn stones hold the marks of generations who crossed them, and those marks vanish the moment the surface is lifted. Planners who measure only cost and durability rarely count what disappears with the ground itself. A neighbourhood that loses its worn paving loses one of the few records it kept without ever meaning to. In the end, the city was rewriting a page it had never read.
```

문항(`scripts/_test-md-implied.ts:59-71`, `TARGET = "a page it had never read"`):

```md
밑줄: a page it had never read
① The city produced a brand-new written record.
② Careful restoration preserved the older layers of memory.
③ The city destroyed a history it never understood.
④ Every modern paving project should be stopped now.
⑤ Residents demanded the cheaper slabs for their streets.
정답: ③
해설: 이 글은 낡은 포장이 사라질 때 세대의 흔적도 함께 사라진다고 말합니다. 마지막 문장의 밑줄은 도시가 무엇을 지우는지 이해하지 못한 채 손댔다는 필자의 판단을 함축하므로, 이해하지 못한 역사를 없앴다는 진술이 정답입니다.
오답:
① 표면직역 — 밑줄을 글자 그대로만 읽어 기록을 새로 만들었다는 뜻으로 옮겼을 뿐, 필자의 판단이 빠져 있습니다.
② 방향반대 — 지문의 핵심어인 흔적을 앞세웠지만 필자는 보존이 아니라 소실을 말하고 있어 평가 방향이 정반대입니다.
④ 범위확대 — 지문은 어떤 처방도 제시하지 않았는데 사업 중단이라는 지시로 범위를 넓혔습니다.
⑤ 근거없음 — 주민의 선호는 지문에 근거가 전혀 없는 서술입니다.
```

### 2-3. 자체 검증 실물 — `qbank/work/_probe-IMPLIED_MEANING.ts` ITEM 5 (KILLER, gate 0 / quality 0)

```md
밑줄: mistaking a history for a defect
① The museum wrote a fresh history for each restored object.
② Skilled restoration recovered the traces that time had worn away.
③ The museum erased evidence of a past it had failed to value.
④ Every restoration workshop should be closed to protect artifacts.
⑤ Visitors preferred objects that looked freshly made.
정답: ③
해설: 둘째 문장은 흠집이 물건을 거쳐 간 손과 날씨의 기록이라고 말하고, 셋째 문장은 자국을 지운 물건이 어디에 있었는지 말할 수 없게 된다고 밝힙니다. 두 근거를 이으면 밑줄은 박물관이 가치를 알아보지 못한 과거의 증거를 스스로 지웠다는 함축이 됩니다.
오답:
① 표면직역 — 역사라는 낱말만 붙들어 새 기록을 썼다는 뜻으로 옮겼을 뿐입니다.
② 방향반대 — 지문의 핵심어인 흔적을 앞세웠지만 필자는 회복이 아니라 소실을 말합니다.
④ 범위확대 — 지문은 어떤 처방도 내놓지 않았는데 작업장 폐쇄라는 지시로 넓혔습니다.
⑤ 근거없음 — 관람객의 선호는 지문에 근거가 없는 서술입니다.
```

---

## 3. 파서 계약 (★ 가장 중요)

진실원은 `src/lib/md-qgen/parser-implied.ts` 다. 프롬프트(`prompts-implied.ts:228-231`)가 느슨해도 여기가 계약이다.

### 3-0. 문서 골격 — 섹션 절단 순서

| # | 규칙 | 원문 | file:line | 어기면 사라지는 것 |
|---|---|---|---|---|
| S1 | `오답:` 머리표 **첫 매치**로 문서를 2분할. 앞=본문, 뒤=오답 구역 | `text.split(WRONG_SECTION_RE)` | `parser-implied.ts:182,185` | `오답:` 이 두 번 나오면 두 번째 이후 오답해설이 통째로 소실 |
| S2 | 선지 구역 = 본문에서 **`정답:` 머리표 앞까지** | `beforeWrong.split(ANSWER_SECTION_RE)[0]` | `parser-implied.ts:184` | 선지를 `정답:` 뒤에 쓰면 엄격 구역이 빈다 |
| S3 | 선지 0개일 때만 구제로 `오답:` 앞 전체를 다시 훑는다 | `if (options.length === 0) options = parseLabeledLines(beforeWrong)` | `parser-implied.ts:207-211` | 구제는 **0개일 때만**. 1개라도 읽히면 넓혀 읽지 않는다 |
| S4 | 1 문서 = 1 문항. 모든 값 정규식이 **첫 매치**만 취한다 | `text.match(...)?.[1]` | `parser-implied.ts:187,190` / 00-contract §3 | 한 파일에 2문항을 붙이면 2번째가 조용히 사라지거나 1번째를 오염 |

### 3-1. 섹션 머리표 정규식 (원문 그대로)

```ts
const LEAD = String.raw`[\s>|#•‧-]*`;                 // parser-implied.ts:50
const EM   = String.raw`(?:\*\*|__|\*|_)`;            // parser-implied.ts:52

function sectionHead(keyword: string): string {       // parser-implied.ts:151-156
  return (
    `(?:^${LEAD}${EM}\\s*${keyword}\\s*${EM}?\\s*[:：]\\s*${EM}?` +
    `|^${LEAD}${keyword}\\s*[:：])`
  );
}
function sectionValueRe(keyword: string): RegExp {    // parser-implied.ts:159-161
  return new RegExp(`${sectionHead(keyword)}\\s*(.+)$`, "m");
}
```

| 머리표 | 키워드 리터럴 | 정규식 상수 | file:line |
|---|---|---|---|
| 밑줄 | `밑줄(?:\s*표현)?` → `밑줄:` 또는 `밑줄 표현:` | `TARGET_VALUE_RE` | `parser-implied.ts:166` |
| 정답 | `정답` | `ANSWER_SECTION_RE` / `ANSWER_VALUE_RE` | `parser-implied.ts:164-165` |
| 해설 | `해설` | `EXPLANATION_TO_WRONG_RE` / `EXPLANATION_TAIL_RE` | `parser-implied.ts:167-174` |
| 오답 | `오답` | `WRONG_SECTION_RE` | `parser-implied.ts:163` |

**공백·문자 민감성 (전부 코드 근거)**
- 콜론은 `:` 또는 전각 `：` **둘 다** 허용, 콜론 **생략 불가**(`[:：]` 는 옵셔널이 아니다) — `parser-implied.ts:153-154`. → 콜론을 빼면 그 필드가 통째로 소실된다.
- 머리표는 **줄머리에만** 있어야 한다(`^` + `m`). 문장 중간의 `… 정답: ③` 은 잡히지 않는다.
- 값은 `(.+)$` — **같은 줄**에서만 읽는다(`밑줄:`·`정답:`). 개행하면 값이 빈다.
- 해설만 `[\s\S]*?` 라 여러 줄 허용(`parser-implied.ts:168,172`). `오답:` 이 있으면 그 앞까지, 없으면 문서 끝까지.
- 머리표 장식(굵게·인용·표 파이프·불릿·헤딩)은 흡수된다. **단 이것은 관용이지 계약이 아니다 — 저작 규칙은 장식 0.**

### 3-2. 선지·오답해설 줄 정규식 (원문 그대로)

```ts
const OPTION_LINE_RE = new RegExp(                    // parser-implied.ts:86-88
  `^${LEAD}${EM}?\\s*(?:([①-⑩])|\\(([1-9])\\)|([1-9])[.)])${EM}?[.)]?\\s*(.+)$`,
);
```

| # | 규칙 | file:line | 어기면 사라지는 것 |
|---|---|---|---|
| O1 | 라벨은 원문자 `①~⑩` / `(1)~(9)` / `1.` / `1)` 셋 중 하나. **맨 숫자 + 공백(`3 text`)은 라벨이 아니다** | `parser-implied.ts:87` | 그 줄이 선지에서 사라져 「선지 N개」 반려 |
| O2 | 라벨 뒤 본문 `(.+)$` 가 **비면 그 줄을 버린다** | `parser-implied.ts:106-107` | 선지 개수 부족 |
| O3 | **같은 라벨 두 번 → 첫 줄만** 취한다 | `parser-implied.ts:109` | 두 번째 줄 소실(게이트는 개수로만 인지) |
| O4 | 라벨은 `circledLabel` 로 원문자 축으로 정규화. `"3"`·`"(3)"`·`"3."` → `③` | `parser-implied.ts:37-46` | 범위 밖(0, 11+)이면 라벨 `""` → 줄 버림 |
| O5 | 본문은 `cleanOptionText` = 표 파이프 제거 → **짝 깨진 강조만** 제거. 값 안쪽 정상 강조(`*표면직역*`)는 보존 | `parser-implied.ts:95-97, 61-73` | 여는 `**` 만 남기면 DB·학생 표면에 리터럴 `*` 노출 |
| O6 | 오답해설도 **같은 정규식**으로 읽는다. `wrong` 은 정답 라벨을 자동 제외 | `parser-implied.ts:213-215` | 오답 목록에 정답 줄을 넣어도 무해(파서가 걸러냄) |
| O7 | 오답해설이 **두 줄로 접히면** 둘째 줄은 라벨이 없어 통째로 무시된다 | `parser-implied.ts:101-111` | 해설 내용 소실 — 오답해설은 반드시 한 줄 |

### 3-3. `정답:` 값 파싱 — 선행 라벨 런만 수집

```ts
const answerLine = stripUnbalancedEmphasis(stripTablePipes(text.match(ANSWER_VALUE_RE)?.[1] ?? ""));  // 189-191
const leadingRun = answerLine.match(
  /^\s*((?:[①-⑩]|\(?[1-9]\)?)(?:\s*[,·]\s*(?:[①-⑩]|\(?[1-9]\)?))*)/,
)?.[1] ?? "";                                                                                          // 194-197
const answers = [...new Set([...leadingRun.matchAll(/[①-⑩]|[1-9]/g)].map(m => circledLabel(m[0])).filter(Boolean))];  // 198-204
```

| # | 규칙 | file:line | 어기면 |
|---|---|---|---|
| A1 | 구분자는 **`,` 또는 `·`** 뿐(앞뒤 공백 허용). 프롬프트 지정 표기는 `", "` | `parser-implied.ts:196` / `prompts-implied.ts:129` | **`정답: ③ ④`(공백 병기)는 ④가 조용히 사라진다.** 프로브 C1a 실측: answerCount=1 설정에선 게이트 클린으로 통과해 버린다 |
| A2 | 선행 런 **밖**의 라벨은 무시 — `정답: ③ — ①은 표면 직역` 은 ③만 | `parser-implied.ts:193-197` | (의도된 관용) |
| A3 | 중복 라벨은 Set 으로 1회 | `parser-implied.ts:199` | 「정답 N개」 개수 불일치 |
| A4 | `answer = answers[0]` | `parser-implied.ts:222` | — |
| A5 | **선지 줄에 정답 표시 칸을 두지 않는다.** `정답:` 줄이 유일 진실원 | `parser-implied.ts:28` / `gate-implied.ts:279` | 선지 줄에 O/X 를 쓰면 그 문자가 선지 본문이 된다 |

### 3-4. `밑줄:` 값 확정 — 이 유형의 심장

```ts
function stripTargetDecoration(raw)  // parser-implied.ts:120-137
// 표 파이프 제거 → (짝 깨진 강조 제거 → `..` → ".." → '..' → “..” → ‘..’ 벗기기) ×3회
```
- **문장 구두점은 벗기지 않는다**(지문 축자일 수 있으므로). 그 판단은 스냅이 지문과 대조해 한다 — `parser-implied.ts:117-119`.

탐색기 `locateImpliedTarget(passage, expression)` — `parser-implied.ts:252-278`:

| 흡수하는 차이 | 코드 |
|---|---|
| 공백량 (토큰 사이 `\s+`) | `:259-261` |
| 곱슬/곧은 따옴표, en/em dash | `flexiblePunctuation` `:240-245` |
| 대소문자 (`gi` 플래그) | `:266` |
| 영문 시작/끝이면 **단어 경계 강제** (`art"is"ts` 사고 방지) | `:262-263` |

`count` = 지문 전체 등장 횟수 → 게이트 #2 「자리 모호」의 근거.

0원 자동 보정 `autoSnapImpliedTarget` — `parser-implied.ts:295-340`. **진실원은 지문이다.**

| 순서 | 조건 | 동작 | file:line |
|---|---|---|---|
| 1 | `passage.includes(expr)` | 무보정(최다 경로) | `:304` |
| 2 | 유일 위치 발견 | 지문 축자 슬라이스로 교체 + correction 1건 | `:306-312` |
| 3 | 앞뒤 구두점만 어긋남 | 구두점 정리 후 재탐색 | `:315-327` |
| 4 | 사이 단어 누락(**4단어 이상 구 전용**) | `snapExpressionSpan` 재사용 | `:331-337`, `parser.ts:601-610` |
| — | 위치가 2곳 이상 | **보정하지 않는다** — 게이트가 「자리 모호」로 반려 | `:292-293` |

→ **저작 규칙: 스냅에 기대지 마라.** correction 은 하네스에서 `AUTOSNAP` 경고로 남는다. 지문에서 그대로 복사하라.

### 3-5. 라벨 축 (3중 변환)

| 자리 | 축 | 코드 |
|---|---|---|
| 저작 md | 원문자 `①~⑧`(계약) / 파서는 `⑨⑩`까지 읽어 게이트가 지목 | `parser-implied.ts:15`, `prompts-implied.ts:21-23` |
| 어댑터 산출 | 문자열 숫자 `"1"~"N"` (options 배열 **순서** 기준) | `adapter-implied.ts:51,93-97` |
| 학생 표면 | 표시 계층이 다시 `①~` 로 | `adapter-implied.ts:49-50` |

**`정답: ③` 은 「세 번째로 쓴 선지」를 뜻한다.** 어댑터는 라벨을 인덱스로 바꾼다(`indexByLabel`) — 선지를 ①②④⑤ 처럼 건너뛰어 쓰면 게이트가 라벨 순서로 먼저 반려한다.

---

## 4. 게이트 체크리스트

### 4-A. 차단 축 ① — `gateMdImplied` (`parsed.gateIssues`, 프로덕션·qbank 공통 차단)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {n}개 ({N}개 필요)` | `q.options.length !== optionCount` — **즉시 반환**(다른 검사 전부 생략) | `gate-implied.ts:267-269` |
| `선지 라벨이 ①②③④⑤ 순서가 아님 — 실제 {…}` | 라벨 문자열 연결이 `IMPLIED_MD_CIRCLED.slice(0,N)` 과 불일치 | `gate-implied.ts:65-69` |
| `{라벨} 선지 텍스트 누락` | `!opt.text` | `gate-implied.ts:72-74` |
| `선지 중복 — {A}와 {B}가 같은 내용: '…'` | `normalizeWs(text).toLowerCase()` 동일 | `gate-implied.ts:76-82` |
| `{라벨} 선지에 한글이 섞임 — 선지는 영어 전용: '…'` | `optionLanguage==="en"` && `containsHangul` | `gate-implied.ts:96-98` |
| `{라벨} 선지가 영어 표현이 아님: '…'` | en && `!containsLatinLetter` | `gate-implied.ts:100-102` |
| `{라벨} 선지가 한두 단어 라벨 — 함축 의미는 구·절로 써야 한다: '…'` | en && `countWordsForQuality(text) < 3` | `gate-implied.ts:104-107` |
| `{라벨} 선지가 한국어가 아님 — 교사 설정이 한국어 보기다: '…'` | `optionLanguage==="ko"` && `!containsHangul` | `gate-implied.ts:110-113` |
| `{라벨} 선지가 너무 짧음 — 완결 진술문으로 쓰라: '…'` | ko && `normalizeWs(text).length < 6` | `gate-implied.ts:116-118` |
| `밑줄 표현 누락 — \`밑줄:\` 줄이 없거나 비어 있음` | `!q.expression.trim()` — **단독 반환** | `gate-implied.ts:172` |
| `밑줄 표현이 지문에 축자로 없음 — 지문에서 그대로 복사하라: '…'` | `locateImpliedTarget` = null | `gate-implied.ts:175-177` |
| `밑줄 표현이 지문에 {n}회 등장 — 밑줄 자리가 모호하다…` | `hit.count > 1` | `gate-implied.ts:178-183` |
| `밑줄이 너무 김({w}단어/{c}자) — 6단어 이내 압축 표현으로 잘라라: '…'` | `len>90 \|\| words>6 \|\| lexicalUnits>6` | `gate-implied.ts:186-196`, 상수 `prompts-implied.ts:37-38` |
| `밑줄이 단일 단어 — 함축 추론이 아니라 어휘 문항이 된다: '…'` | `isSingleEnglishToken` = `/^[A-Za-z][A-Za-z'-]*$/` | `gate-implied.ts:199-200`, `core.ts:428-430` |
| `밑줄에 내용어가 2개 미만 — 함축을 지탱하지 못한다: '…'` | `isTinyFunctionWord` 또는 `countContentTokens < 2` | `gate-implied.ts:201-203`, `core.ts:416-424,520-534` |
| `밑줄이 전치사·접속사로 끝나 잘려 있음 — 완결된 압축 구로 다시 잡아라: '…'` | 마지막 토큰이 `IMPLIED_MEANING_TRAILING_FUNCTION_WORDS` 47개 중 하나 | `gate-implied.ts:206-210`, `core.ts:236-250` |
| `밑줄이 수사적 질문(자문자답) 자리 — …답변 쪽의 압축·비유 표현에 밑줄을 그어라: '…'` | 표현 **또는 그 문장**이 `?`/`？` 로 끝남 | `gate-implied.ts:215-222`, `implied-distractor.ts:35-38` |
| `밑줄 직후에서 같은 문장이 뜻을 그대로 풀어 줌 — 함축이 남지 않는다: '…'` | 표현 뒤 180자 이내에 `that is\|namely\|in other words\|this means\|that means\|meaning that\|which means` | `gate-implied.ts:226-233`, `implied-distractor.ts:178-190` |
| `다음 문장이 밑줄의 답을 거의 그대로 풀어 줌 — 밑줄 자리를 옮겨라: '…'` | **KILLER 전용** — `findDirectAnswerLeakage(expr, next)` | `gate-implied.ts:236-242`, `implied-distractor.ts:145-176` |
| `밑줄이 예시·실험 세부 문장 속 지엽 표현 — 중심 논지…로 옮겨라: '…'` | **KILLER 전용** — `isPeripheralDetailImpliedMeaningTarget` | `gate-implied.ts:243-247`, `implied-distractor.ts:137-142` |
| `{라벨} 선지가 절대표현 미끼 — 지문이 그 정도를 명시하지 않아 읽지 않고도 지워진다(‘{word}’): '…'` | **KILLER 전용** — 오답 선지에 절대어. 정답 축을 못 읽었으면 침묵 | `gate-implied.ts:136-159,276`, 큐 목록 `implied-distractor.ts:216-239` |
| `정답 누락 — \`정답:\` 줄이 없거나 라벨을 읽을 수 없음` | `q.answers.length === 0` | `gate-implied.ts:281-282` |
| `정답 {n}개 ({K}개 필요) — 실제 {…}` | `answers.length !== answerCount` | `gate-implied.ts:283-287` |
| `정답 라벨({라벨})이 선지에 없음` | 정답 라벨이 옵션 라벨 집합 밖 | `gate-implied.ts:288-290` |
| `해설 누락` | `!q.explanation` (길이 요구 없음) | `gate-implied.ts:292` |
| `오답해설 {n}개 ({N−K}개 필요) — 정답을 뺀 모든 선지에 1개씩` | `requireWrong !== false` 이고 개수 불일치 | `gate-implied.ts:294-299` |
| `오답해설에 정답 라벨({라벨}) 포함` | (파서가 걸러 실현되기 어려움 — 어댑터 직접 호출 경로용) | `gate-implied.ts:302` |
| `오답해설 라벨({라벨})이 선지에 없음` | 오답 라벨이 옵션 밖 | `gate-implied.ts:303-305` |
| `교사 지정 표현이 밑줄에 없음: '…'` | `ctx.teacherPoints` 비지 않을 때만. 이 유형은 POINT_PICKER 미등재라 실제로 항상 `[]` | `lane-implied.ts:90-102` |

기본값: `optionCount = q.options.length`, `answerCount = 1`, `optionLanguage = "en"`, `difficulty = "KILLER"`, `requireWrong = true` — `gate-implied.ts:259-263`. **레인은 항상 실제 설정을 넘긴다**(`lane-implied.ts:172-177`).

### 4-B. 차단 축 ② — 어댑터 실패 (`gateIssues` 0 인데도 죽는 자리)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {n}개 (4~8개 필요)` | 옵션 수가 4~8 밖 | `adapter-implied.ts:38-46` |
| `밑줄 표현 누락` | `!q.expression.trim()` | `adapter-implied.ts:47` |
| `정답 라벨({라벨})이 선지에 없음` | — | `adapter-implied.ts:55-57` |
| `정답 누락` | 정답 인덱스 0개 | `adapter-implied.ts:60` |
| `정답이 전 선지 — 오답이 하나도 없음` | `answerIndices.length >= options.length` | `adapter-implied.ts:61-63` |

### 4-C. 차단 축 ③ — 후처리 (`postProcessQuestion`)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `Missing underlinedExpression field` | — | `question-postprocess/processors/implied-meaning.ts:13-20` |
| `Underlined expression not found in passage: "…"` | `findExpressionInPassage` 실패 | `…/implied-meaning.ts:22-34` |

### 4-D. 차단 축 ④ — 품질 검증 error (프로덕션은 **비차단**, qbank 하네스는 `qualityBlocking` 으로 **차단**)

`validateQuestionQuality` → `lane.filterQualityIssues` 통과분. 레인이 제거하는 것은 **계약 부재 3종뿐**(`lane-implied.ts:237-244`):
`implied-meaning-missing-surface-meaning` · `implied-meaning-thin-reasoning-gap` · `implied-meaning-thin-evidence-chain`.

| 코드 | 조건 | 극성 | file:line |
|---|---|---|---|
| `implied-meaning-missing-expression` | underlinedExpression 없음 | error | `validators/implied.ts:31-34` |
| `implied-meaning-stem-language` | 발문 언어가 설정과 불일치 | error | `validators/implied.ts:36-50` |
| `implied-meaning-option-language` | en 설정에 한글 선지 | error | `validators/implied.ts:53-62` |
| `implied-meaning-option-not-english` | en 설정에 라틴문자 0 | error | `validators/implied.ts:63-70` |
| `implied-meaning-missing-underline` | `passageWithUnderline` 에 `__` 없음 | error | `validators/implied.ts:101-103` |
| `implied-meaning-underline-count` | `__…__` 마커가 정확히 1개가 아님 | error | `validators/implied.ts:105-107` |
| `implied-meaning-underline-target-mismatch` | 밑줄 텍스트 ≠ underlinedExpression | error | `validators/implied.ts:110-119` |
| `implied-meaning-target-too-long` | 90자/6단어/6어휘단위 초과 | error(전 난이도) | `validators/implied.ts:139-145` |
| `implied-meaning-target-trailing-function` | 후행 기능어 | error(전 난이도) | `validators/implied.ts:147-153` |
| `implied-meaning-target-not-in-passage` | 정규화 비교로도 지문에 없음 | error | `validators/implied.ts:186-192` |
| **`implied-meaning-noncentral-target`** | **`!isCentralImpliedMeaningTarget(...)`** | **KILLER=error / 그 외 warning** | `validators/implied.ts:200-214` |
| `implied-meaning-direct-answer-leak` | 다음 문장 또는 같은 문장 누출 | KILLER=error / 그 외 warning | `validators/implied.ts:215-225` |
| `implied-meaning-single-word-target` / `-target-too-short` / `-rhetorical-question-target` | (게이트가 전 난이도 선차단) | KILLER=error | `validators/implied.ts:121-135,158-167` |
| `implied-meaning-absolute-giveaway-option` | 오답 절대어(게이트가 KILLER 선차단) | KILLER=error | `validators/implied.ts:292-305` |
| `implied-meaning-weak-distractors` / `-low-surface-gap` / `-shallow-correct-option` / `-answer-summary-mismatch` / `-option-too-short` | — | warning(기록만) | `validators/implied.ts:71-98,227-290` |
| `few-key-points` | KILLER && `keyPoints.length < 3` — 어댑터가 `keyPoints: []` 를 고정 산출하므로 **KILLER 문항에 항상 붙는다.** 정상이다 | warning(기록만) | `validators/misc.ts:76-80`, `adapter-implied.ts:106` |

> ★ **`implied-meaning-noncentral-target` 이 이 유형 최대의 숨은 반려원이다.** 게이트는 통과시키지만 KILLER 에서 `qualityBlocking` 이 된다. 프로브 C5 실측: 같은 md 가 KILLER 에서 `quality=1`, INTERMEDIATE 에서 `quality=0`.
> 통과 조건(하나라도 참) — `implied-distractor.ts:87-100`:
> 1. `hasCentralClaimCue(문장)` — `central issue|in the end|for that reason|therefore|thus|consequently|as a result|this is why|the point|the lesson|a durable solution|a serious .* must|must therefore|not whether|not merely|not simply|not the same as|rather than|instead of|does not mean|it shows that|ultimately|the craft of|the result is|the consequence is` (`:102-104`)
> 2. `hasFigurativeOrCompressedSignal(표현)` — 은유 어휘 화이트리스트(`archive|belonging|mirror|lens|map|grave|weight|carry|craft|promise|memory|blank page|…`) (`:110-112`)
> 3. `hasOpeningContrastSignal` — 문장 index ≤1 + 표현에 대조 표지 + 문장에 통념 프레이밍 (`:114-123`)
> 4. `hasConclusionContrastSignal` — 마지막 2문장 + 표현 대조 표지 + 문장 경고 어휘 (`:125-135`)
> 5. 마지막 2문장 && `hasCentralSentenceSignal(문장)` — 논지 명사 화이트리스트 (`:106-108`)
> 그리고 `isPeripheralDetailImpliedMeaningTarget` 이 참이면 무조건 탈락(`:93,137-142`).

### 4-E. 차단 축 ⑤ — qbank 유닛 게이트 (`qgen-core.ts`)

| 코드 | 조건 | file:line |
|---|---|---|
| `CONTAINER` | `<!-- ITEM n -->` 누락·번호 비연속·`point:` 누락·본문 공백·settings JSON 파손 | `qgen-core.ts:57-85` |
| `ITEM_COUNT` | 문항 < 5 | `qgen-core.ts:229-236` |
| `POINT_DUPLICATE` | 유닛 내 `point:` 정규화 값 중복 | `qgen-core.ts:325-333` |
| `ANSWER_DUPLICATE` | 두 문항의 `diversityTargets`(= `underlinedExpression`) 동일 | `qgen-core.ts:336-353`, `lane-implied.ts:216-221` |

---

## 5. adapter 산출 필드

`adaptMdImpliedToAiQuestion` → `postProcessQuestion` 후 `structuredData` 에 실리는 키.

| 키 | 값 | 생산자 | 비고 |
|---|---|---|---|
| `direction` | 단일: `다음 글에서 밑줄 친 부분이 함축 의미하는 바로 가장 적절한 것은?` / 복수: `다음 글에서 밑줄 친 부분이 함축하는 의미로 적절한 것을 모두 고르시오.` | 어댑터 `:27-31,89` | `stemLanguage="en"` 이면 레인이 영어 문장으로 교체(`lane-implied.ts:42-46,190-195`). 복수 발문에 **"모두"** 가 있어야 generic-multi-answer 게이트 통과 |
| **`underlinedExpression`** | 지문 축자 표현 | 어댑터 `:91` → 후처리가 지문 슬라이스로 **재확정** `:36,58` | ★ 이 유형 고유. `diversityTargets` 의 원천 |
| **`surroundingText`** | 표적 주변 윈도우(자리 유일할 때만, 아니면 `""`) | 어댑터 `:70-72` (`contextAround`) | ★ 이 유형 고유. 코드가 계산 — md 에 칸을 만들지 않는다 |
| **`passageWithUnderline`** | 지문에 `__표현__` 을 삽입한 전문 | **후처리만** `:37-42,59` | ★ 이 유형 고유. **어댑터에서 만들면 충돌**(`adapter-implied.ts:11-12`) |
| `options[]` | `{label:"1".."N", text}` — md 순서 보존 | 어댑터 `:93-96`, 후처리가 선지 접두 라벨 제거 `:127-151` | |
| `correctAnswer` | `"3"` / 복수 `"2, 4"` | 어댑터 `:97` | |
| `correctAnswers[]` | **복수 정답일 때만** 생성 | 어댑터 `:101-103` | 단일에 넣으면 fast 산출과 형상이 달라진다 |
| `wrongOptionExplanations[]` | `{label:"1".., explanation}` — 정답 제외, 빈 문자열 제외 | 어댑터 `:77-84` | |
| `explanation` | `해설:` 값 | 어댑터 `:105` | |
| `keyPoints` | **항상 `[]`** (합성 금지) | 어댑터 `:106`, 근거 `:14-15` | `few-key-points` warning 은 정상 |
| `tags` | `[]` | 어댑터 `:107` | |
| `difficulty` | `ctx.rawDifficulty` | 어댑터 `:108` | |

**절대 실리면 안 되는 것**: `blanks` · `passageWithBlank` · `originalExpression` (빈칸 계열 이물) — `adapter-implied.ts:13`, 회귀 고정 `scripts/_test-md-implied.ts:676-682`.

---

## 6. 생성 노브

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `optionCount` (`genericOptionCount`) | number | **5** | 4~8 (`clampImpliedMdOptionCount`) | 선지 줄 수 · 라벨 상한 `①~⑧` · `오답:` 줄 수(N−K) — `prompts-implied.ts:25-27,40-47`, `generic.ts:7-11` |
| `answerCount` (`genericAnswerCount`) | number | **1** | 1 ~ (optionCount−1) (`clampImpliedMdAnswerCount`) | `정답:` 줄의 라벨 개수(`", "` 병기) · 오답해설 줄 수 · 발문(단일/모두 고르기) — `prompts-implied.ts:28-29,49-60` |
| `optionLanguage` | `"ko"\|"en"` | **"en"** | 토글 실제 동작(`scope="stem-option"`) | 선지 언어. en=3단어 이상 영어 / ko=6자 이상 한국어 완결 진술문 — `language.ts:23,64-72`, `gate-implied.ts:88-122` |
| `stemLanguage` | `"ko"\|"en"` | **"ko"** | — | **선지·해설에는 영향 없음.** `direction` 문자열만 교체 — `lane-implied.ts:78-82,157-161,190-195` |
| `difficulty` | `BASIC\|INTERMEDIATE\|KILLER` | (전역 폴백) | — | **게이트 극성을 바꾼다**: KILLER 에서만 「다음 문장 누출」·「지엽 표적」·「절대표현 미끼」 반려 + `noncentral-target` 이 error 로 승격 — `gate-implied.ts:236-247,276`, `validators/implied.ts:210` |
| `variantIndex` / `variantCount` | number | 0 / 1 | — | 저작 md 형식에는 영향 없음(프롬프트의 후보 로테이션 전용) — `lane-implied.ts:149-153` |
| `teacherPoints` | array | `[]` | — | POINT_PICKER 미등재라 항상 빈 배열. 있으면 지정 표현이 밑줄에 포함돼야 함 — `lane-implied.ts:84-102` |
| (하드 상수) `IMPLIED_MD_TARGET_MAX_WORDS` | 6 | — | 변경 불가 | 밑줄 단어 수 상한 — `prompts-implied.ts:37` |
| (하드 상수) `IMPLIED_MD_TARGET_MAX_CHARS` | 90 | — | 변경 불가 | 밑줄 문자 수 상한 — `prompts-implied.ts:38` |

`isEligible`: `4 ≤ optionCount ≤ 8` && `1 ≤ answerCount ≤ optionCount − 1` — `lane-implied.ts:113-129`. 벗어나면 유형 자체가 실행되지 않는다.

---

## 7. 함정 (코드 근거 있는 것만)

| # | 함정 | 무슨 일이 나는가 | 근거 |
|---|---|---|---|
| **P1** | `정답: ③ ④` — **공백으로 병기** | ④가 **조용히 사라진다**. answerCount=1 설정에선 게이트도 클린이라 "정답 하나짜리 문항"으로 출하된다. 반드시 `", "` 또는 `·` | `parser-implied.ts:196`, 프로브 C1a/C1b/C1c 실측 |
| **P2** | 밑줄에 **문장 전체·긴 절**을 그음 | 7단어부터 즉시 반려(`밑줄이 너무 김`). `countWordsForQuality` 는 공백 분할이라 하이픈 복합어도 1단어지만, `countImpliedMeaningLexicalUnits` 는 `[A-Za-z0-9]+` 개수라 **하이픈·아포스트로피 복합어에서 두 계수가 갈린다**. 둘 다 ≤6이어야 한다 | `gate-implied.ts:186-196`, `core.ts:228-234`, 프로브 C2 |
| **P3** | 표적이 **전치사·접속사로 끝남** (`the marks of`, `not merely a tool for`) | 전 난이도 반려. 금지 목록 47개(`of·to·in·as·but·or·than·while·with·without…`) | `core.ts:243-250`, `scripts/_test-md-implied.ts:223-228` |
| **P4** | 표적이 지문에 **2회 이상 등장** | `밑줄 표현이 지문에 2회 등장` 반려. 스냅도 손대지 않는다. `the surface is lifted` 처럼 흔한 구를 조심 | `gate-implied.ts:178-183`, `parser-implied.ts:281-285` |
| **P5** | **KILLER 인데 중심 논지가 아닌 표적** | 게이트는 통과, `qualityBlocking: implied-meaning-noncentral-target` 로 죽는다. **가장 놓치기 쉬운 반려** | `validators/implied.ts:200-214`, 프로브 C5/C5' |
| **P6** | KILLER 오답에 **절대어**(`always·never·only·completely·entirely·solely·exclusively` / 한국어 `항상·절대·오직·무조건·반드시·전적으로·완전히·완벽·배제·만이/만을/만으로`) | `절대표현 미끼` 반려. **단 지문이 그 단어를 쓰고 있으면 면제**(`passagePattern.test(passage)`). 한국어 조사 `만이/만을/만으로` 가 실전 최다 사고 | `gate-implied.ts:136-159`, `implied-distractor.ts:216-246`, 프로브 C4 |
| **P7** | 오답해설을 **두 줄로 접음** | 둘째 줄은 라벨이 없어 통째로 무시된다. 개수는 맞아 게이트는 통과 → 학생 표면에 반쪽 해설 | `parser-implied.ts:101-111` |
| **P8** | `해설:` 안에 `1. 첫째 근거` 같은 **번호 목록** | 선지 구역이 `정답:` 앞에서 끊기므로 안전(회귀 고정). 그러나 **`정답:` 줄보다 앞**에 번호 줄을 두면 선지로 오인된다 | `parser-implied.ts:184`, `scripts/_test-md-implied.ts:579-590` |
| **P9** | 지문이 너무 짧아 문장이 3개 이하 | 코드상 하한은 없지만 KILLER 중심성 판정이 `sentenceIndex >= sentenceCount − 2` 를 쓰므로 결론부 판정이 무의미해지고, 헌법 §4(KILLER 근거 2문장 이상 분산)를 만족할 자리가 없다 | `implied-distractor.ts:98,131`, 헌법 §4 |
| **P10** | `밑줄:` 값에 **개행** | `(.+)$` 라 첫 줄만 읽힌다 → 축자 불일치 반려 | `parser-implied.ts:160,166` |
| **P11** | 콜론 생략 (`밑줄 a page…`) | 머리표 정규식이 `[:：]` 를 요구 → 필드 통째 소실 → 「밑줄 표현 누락」이라는 **사실과 다른 사유** | `parser-implied.ts:153-154`, `gate-implied.ts:172` |
| **P12** | 선지 라벨 건너뛰기(`①②④⑤⑥`)·중복 | 라벨 순서 반려. 중복 라벨은 첫 줄만 살아 「선지 N개」 반려 | `gate-implied.ts:65-69`, `parser-implied.ts:109` |
| **P13** | en 설정에서 **2단어 선지**(`Cheap slabs`) | `한두 단어 라벨` 반려. 3단어 이상 필수 | `gate-implied.ts:104-107` |
| **P14** | 밑줄 문장이 **물음표로 끝남** | 표현 자체가 평서구여도 **그 문장**이 의문문이면 반려 | `gate-implied.ts:215-222` |
| **P15** | 밑줄 뒤 같은 문장에서 `that is / in other words / this means` 로 풀어 줌 | **전 난이도** 반려(표면-이면 간극 0) | `gate-implied.ts:226-233` |
| **P16** | 유닛 내 두 문항이 **같은 표적**에 밑줄 | `ANSWER_DUPLICATE` 로 유닛 전체 반려 | `qgen-core.ts:336-353` |
| **P17** | 머리표에 마크다운 장식 | IMPLIED 파서는 흡수하지만 **정본 `parser.ts` 는 흡수하지 않는다**. 유형마다 관용 범위가 다르므로 **장식 0** 을 지켜라 | 00-contract §8 |

---

## 8. 출제 포인트 다각화 축

한 지문에서 이 유형으로 **5~8문항**을 만드는 방법. 실증: `qbank/work/_probe-IMPLIED_MEANING.ts` 가 지문 1개(5문장)에서 5문항을 만들어 `blocking 0 / qualityBlocking 0` 을 받았다.

### 8-A. 노브로 달라지는 축 (코드 근거)

| 축 | 조작 | 코드 근거 | 문항이 어떻게 달라지는가 |
|---|---|---|---|
| **A1. 난이도** | `difficulty` = BASIC / INTERMEDIATE / KILLER | `gate-implied.ts:236-247`, `validators/implied.ts:210` | 게이트 극성이 실제로 바뀐다. **KILLER 는 표적 선택지가 좁고**(중심성 강제), BASIC/INTERMEDIATE 는 도입부·사례부 표적을 허용한다. 헌법 §4 배분: 5문항=B1/I2/K2, 8문항=B2/I3/K3 |
| **A2. 선지 수** | `optionCount` 4~8 | `prompts-implied.ts:40-47` | 오답 슬롯 수가 3~7로 변한다 → 기제 팔레트 크기가 달라진다. 4지는 기제 3종, 6지는 5종 강제 |
| **A3. 정답 수** | `answerCount` 1 ~ N−1 | `prompts-implied.ts:49-60` | 단일 선택 ↔ **모두 고르기**. 복수 정답은 "서로 다른 측면을 짚는 두 함축"을 요구해 인지 작업 자체가 바뀐다(발문도 교체됨) |
| **A4. 보기 언어** | `optionLanguage` en / ko | `language.ts:64-72`, `gate-implied.ts:88-122` | en=영어 패러프레이즈 변별(어휘 부담 동반), ko=한국어 진술 변별(순수 논리 변별). 같은 표적이라도 측정하는 능력이 다르다 |
| **A5. 발문 언어** | `stemLanguage` ko / en | `lane-implied.ts:157-161,190-195` | 표층 형식만. 다각화 기여도 최하 — 이것만 바꾼 두 문항은 **사본**이다 |

> ⚠ A2~A5 는 유닛 `<!-- ITEM n -->` 의 `settings:` 로 문항별 지정한다(`qgen-core.ts:71-78,369-377`). 프로브 B1/B2 에서 6지2정답·한국어 보기 모두 gate 0 / quality 0 확인.

### 8-B. 설계로 달라지는 축 (교육적 판단 — 여기가 진짜 다각화다)

| 축 | 내용 | 실행 규칙 |
|---|---|---|
| **B1. 표적의 논지 위치** | 도입 통념 / 논지 전환점 / 기제 설명 / 사례·근거 / 결론 압축 | **한 유닛에서 같은 위치를 두 번 겨냥하지 마라.** 결론부는 KILLER 가, 도입 통념은 BASIC 이 가져가는 것이 자연스럽다(중심성 게이트 때문) |
| **B2. 표적의 수사 갈래** | (1) 핵심 압축 (2) **정반대 방향**(필자가 비판·부정하는 표현) (3) **비유·은유** | `prompts-implied.ts:84-87`. 지문에 은유가 있으면 그것이 1순위. **(2)번 표적은 학생이 "정답=지문 요지"로 착각하도록 만드는 자리라 변별력이 가장 크다** |
| **B3. 근거 깊이** | 1문장 / 2문장 인과·대조 / 2문장 이상 분산 | `prompts-implied.ts:74-90`. 난이도(A1)와 짝을 이루되 **독립 축**이다. 같은 KILLER 라도 "인과 2문장"과 "대조 2문장"은 다른 문항 |
| **B4. 오답 기제 팔레트** | ①표면직역 ②방향반대 ③범위확대 ④근거없음(통념형) ⑤부분해석 ⑥인과역전 | `prompts-implied.ts:99-118`. 오답 2개 이상이면 **①과 ②는 필수 포함**. 문항마다 나머지 슬롯의 조합을 달리해 (L,F) 팔레트를 겹치지 않게 짠다(헌법 §3) |
| **B5. 최강 미끼의 정체** | 어느 오답이 중위권을 끄는가 — L2(부분사실) / L4(위치 인접) / L5(세련된 재해석) | 문항마다 **다른 유형의 미끼**를 최강으로 놓는다. `craft:` 줄에 명시해 검수 렌즈 ④가 대조할 수 있게 |
| **B6. 함축의 방향** | 필자의 **평가**(가치 판단) / **인과**(무엇이 무엇을 낳는가) / **범위**(어디까지 참인가) / **주체**(누가 하는가) 중 무엇을 복원시키는가 | 같은 표적이라도 정답이 겨냥하는 판단축이 다르면 다른 문항이다. 반대로 **판단축이 같으면 표적이 달라도 사실상 사본**(검수 렌즈 ⑤ 대상) |

### 8-C. 5문항 배치 견본 (프로브 A 실물 — 전부 통과)

| # | 난이도 | 표적 | 논지 위치(B1) | 수사 갈래(B2) | 오답 팔레트(B4) |
|---|---|---|---|---|---|
| 1 | BASIC | `damage to be corrected` | 도입 통념 | 핵심 압축 | 표면직역·방향반대·근거없음×2 |
| 2 | INTERMEDIATE | `make old objects look new` | 도입(수단의 목적화) | 핵심 압축 | 부분해석·근거없음·범위확대·근거없음 |
| 3 | KILLER | `a small archive of belonging` | 기제 설명 | **비유** | 부분해석·표면직역·근거없음×2 |
| 4 | INTERMEDIATE | `not whether a surface gleams` | 논지 전환점 | **정반대 방향** | 표면직역·인과역전·범위확대·근거없음 |
| 5 | KILLER | `mistaking a history for a defect` | 결론 압축 | **비유** | 표면직역·방향반대·범위확대·근거없음 |

- 표적 5개가 전부 다르므로 `ANSWER_DUPLICATE` 통과, `point:` 5개가 전부 다르므로 `POINT_DUPLICATE` 통과.
- **KILLER 2문항은 중심성 화이트리스트에 걸리는 자리**(3번=`archive|belonging` 은유 신호, 5번=`in the end` 중심 단서)로 배치했다. 1·2번은 `noncentral-target` 이 warning 으로만 기록된다(프로브 실측 warnings 참조).
- 8문항으로 늘릴 때는 A2(선지 수)·A3(복수 정답)·A4(보기 언어)를 3·5번 계열에 얹어 표층 형식까지 갈라라 — 단, **A5 단독 변주는 사본이다.**

### 8-D. 표적 후보를 코드로 미리 뽑는 법 (0원)

`buildMdImpliedCandidateBlock(passage, difficulty, {variantIndex, diversityEnabled})` — `prompts-implied.ts:273-320`.
지문에서 **1회만 등장하는** ≤6단어 후보를 점수순으로 최대 10개 반환하고(`countWordBoundaryMatches === 1` 필터, `:285-290`), `variantIndex` 로 로테이션한다. 후보가 0건이면 guardrail 문구로 대체된다.
→ 저작 전 이 블록을 돌려 **후보 목록을 먼저 확보하고 5~8개로 분배**하면 P4(자리 모호)·P2(길이) 사고가 사전에 소거된다.
