# 제목 추론 (TITLE)

> 분류 **선택형(대의파악 계열)** · 지문변형 **없음(PASSTHROUGH)** · 정답 머리표 **`정답:`** · 최소 지문 길이 **코드 제약 없음(0)** — 게이트·레인·라우트 어디에도 지문 길이 하한이 없다(`lane-title.ts:90-102` 은 선지수·정답수만 본다).
>
> 전 유형 공통 계약은 [`../recon/00-contract.md`](../recon/00-contract.md), 품질 규범은 [`../quality-constitution.md`](../quality-constitution.md).
> 이 문서의 모든 주장은 코드 직독 + `qbank/work/_probe-TITLE.ts` tsx 실행 검증을 거쳤다.

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

**"무엇에 대한 글인가(소재)"가 아니라 "그래서 무엇이라 말하는가(판단)"까지 읽어야 풀린다.**
정답 제목은 글의 논지가 수렴하는 자리 — 전환 이후의 결론, 인과의 귀결, 지문이 만들어 낸 역설 — 를
**한 줄 표제로 압축한 재진술**이다. 지문 문장의 축자 복사는 제목이 아니라 인용이며, 게이트가
`정답 선지가 지문 축자 복사(N단어)` 로 직접 반려한다(`parser-title.ts:384-392`).

### 인접 유형과의 경계
| 유형 | 요구 산출물 | TITLE 과의 차이 |
|---|---|---|
| `TOPIC` | 소재 + 통제 관점의 **주제구** | 제목은 표제 형상(명사구·의문형·콜론 부제)이라 **압축·수사**가 추가로 요구된다 |
| `MAIN_IDEA` | 요지를 **완결된 진술문**으로 | 제목은 진술문이면 안 된다 — 하나만 완전한 문장이면 형식만으로 걸러진다(`prompts-title.ts:151`) |
| `IMPLIED_MEANING` | 밑줄 표현의 **함축** | TITLE 은 지문에 밑줄·마커를 넣지 않는다(인라인 마커 4종 전부 미사용) |

### 형식이 가장 짧은 유형이라는 뜻
지문을 한 글자도 건드리지 않으므로 **「지문 재구성 대조」 게이트가 아예 없다**(`parser-title.ts:5-8`).
그래서 게이트의 무게중심이 전부 **선지 형상(개수·라벨 축·중복·언어·길이 균형)** 과
**정답·오답해설 축 정합** 에 실린다. 형식이 헐거운 만큼 **오답 설계와 해설 사실성이 유일한 승부처**다.
후처리도 없다(`PASSTHROUGH_TYPES`, `question-postprocess/types.ts:67-72`) — **게이트가 못 잡으면 그대로 출하된다.**

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (기본형 = 선지 5 · 정답 1 · 영어 선지 · 긍정 극성)

```md
① <표제 1 — 명사구/동명사구/의문형/콜론 부제 중 한 형상>
② <표제 2>
③ <표제 3>
④ <표제 4>
⑤ <표제 5>
정답: <①~⑤ 중 하나>
해설: <1문장: 이 글의 논지 축이 무엇인가. 2문장: 정답 표제가 그 축을 어떻게 압축하는가. 합니다체·한국어>
오답:
② <기제이름 — 왜 매력적이고 왜 탈락인지 한 줄. 정답 라벨은 절대 넣지 마라>
③ <기제이름 — …>
④ <기제이름 — …>
⑤ <기제이름 — …>
```

부정 극성(`answerPolarity: NEGATIVE`)일 때 `오답:` 절의 의미만 뒤집힌다 — **형식은 완전히 동일**하다.
그 절에는 "적절한(타당한) 나머지 N개가 각각 왜 제목으로 타당한지"를 한 줄씩 쓴다(`prompts-title.ts:171, 227-229`).

복수정답(`answerCount ≥ 2`)일 때 정답 줄만 바뀐다: `정답: ①, ②` (`, ` 병기 — `prompts-title.ts:219`).
`오답:` 절에는 정답 라벨을 제외한 나머지 전부가 와야 한다.

### 2-2. 검증된 정상 픽스처 전문 — `scripts/_test-md-title.ts:47-58` verbatim

```md
① Why Silencing a City Can Make It Louder
② Sound Barriers: A Proven Cure for Traffic Noise
③ The Rising Toll of Traffic Noise on Health
④ Redesigning Streets Around Human Perception
⑤ Why People Complain More Than They Suffer
정답: ①
해설: 이 글은 방음벽으로 소음의 총량을 줄였는데도 주민들이 오히려 더 시끄럽다고 느낀 역설을 다룹니다. 시끄러움을 결정하는 것은 소리의 절대량이 아니라 배경과의 대비이므로 조용하게 만들려는 시도가 성가심을 키운다는 결론이 제목의 축입니다.
오답:
② 방향반대 — 핵심 소재인 방음벽을 표제로 앞세워 가장 제목다워 보이지만 필자가 말한 실패를 성공으로 뒤집었습니다.
③ 도입부함정 — 논지 전환 이전의 도입 서술에 시야가 갇힌 제목이라 이 글의 결론이 아닙니다.
④ 범위확대 — 지각이라는 재료는 지문에 있지만 도시 설계 전반의 처방까지는 지문이 말하지 않았습니다.
⑤ 근거없음 — 그럴듯한 통념이지만 지문에 이를 뒷받침하는 문장이 하나도 없습니다.
```

대응 지문은 `scripts/_test-md-title.ts:40-45`. 비표준 형상(선지 8 · 정답 2) 픽스처는 `:464-480`,
한국어 선지 픽스처는 `:580-591`.

### 2-3. qbank 컨테이너 안에서의 실물 (하네스 입력 형태)

```md
<!-- ITEM 1
difficulty: KILLER
point: 표면 어휘 0회 재사용 — 결론을 '대가'의 각도로 추상화한 표제 판별
craft: ③④는 지문에 실재하는 문장을 표제화했지만 결론이 아니다
settings: {"optionCount":5,"answerCount":1}
-->
① Measuring Decibels: A Century of Progress
② The Hidden Cost of Chasing Lower Decibels
...
```
`<!-- ITEM n -->` 는 **qbank 규약이지 md-qgen 규약이 아니다**(`qbank/harness/qgen-core.ts:20-47`).
주석 아래 본문만이 md-qgen 계약 대상이다.

---

## 3. 파서 계약 (★ 가장 중요)

> 전제: `prompts-title.ts` 의 지침 문구보다 **아래 파싱 규칙이 우선한다.**
> 문서 하나 = 문항 하나. 파서는 각 필드의 **첫 매치만** 취한다.

### 3-1. 구역 분할 — `parser-title.ts:212-214`
```ts
const beforeWrong  = text.split(WRONG_HEAD_RE)[0]        ?? text;
const beforeAnswer = beforeWrong.split(ANSWER_HEAD_RE)[0] ?? beforeWrong;
const optionRegion = beforeAnswer.split(EXPLANATION_HEAD_RE)[0] ?? beforeAnswer;
```
**선지 구역 = 세 머리표(`오답:`·`정답:`·`해설:`) 중 가장 먼저 나오는 것 이전.**
어기면: 해설·오답 절의 번호 나열이 선지로 줍혀 `선지 N개` 반려.

### 3-2. 키워드 줄 매처 (장식 관용 범위) — `parser-title.ts:42-53`
```ts
const HSPACE     = "[^\\S\\r\\n]";
const KEY_PREFIX = `${HSPACE}*(?:>${HSPACE}*)?(?:[-*•]${HSPACE}+)?(?:#{1,6}${HSPACE}*)?(?:\\*{1,3}|__)?${HSPACE}*`;
const KEY_SUFFIX = `${HSPACE}*(?:\\*{1,3}|__)?${HSPACE}*[:：]`;
keywordHeadRe(word) = new RegExp(`^${KEY_PREFIX}${word}${KEY_SUFFIX}`, "m")   // 캡처 그룹 없음(split 오염 방지)
```
- 흡수: 앞 공백 · 인용 `>` · 불릿 `- * •` · 헤딩 `#`~`######` · 굵게 `**`/`__`(콜론 안팎 모두) · 전각 콜론 `：`
- **흡수하지 않음: 표 파이프 `|` 로 시작하는 키워드 줄**(`| 정답: | ① |`) → 그 필드가 통째로 사라진다.
- **콜론 생략 불가.** `[:：]` 는 필수다. `정답 ①` 은 정답이 통째로 소실된다.
- ⚠ `decoration.ts` 의 관용은 **이 파일에 적용되지 않는다.** 유형마다 관용 범위가 다르다 → **저작 규칙은 장식 0.**

어기면: 해당 필드 소실 → `정답 누락` / `해설 누락` / `오답해설 누락: …` 이라는 **원인과 다른 문구**가 뜬다.

### 3-3. 선지 줄 — `parser-title.ts:165-178`
```ts
const OPTION_LINE_HEAD = /^(?:([①-⑧])|[（(]\s*(\d)\s*[）)]|(\d)\s*[.)])\s*(.*)$/;
// 줄 선두 장식 제거(stripLineDecoration, :128-136): trim → ^| → ^> → ^[-*•]\s+ → ^#{1,6}\s+ → ^**
// 라벨 정규화(titleMdLabel, :114-124): ()[]（）.,:： 제거 후 원문자 or 1~8 아라비아 → 원문자
// 본문 정리(cleanOptionText, :153-161): ** 전부 제거 → trim → ^|\s* → ^[-–—:：)]\s+ → \s*|\s*$ → trim
```
- **한 선지 = 정확히 한 줄.** 라벨 없는 줄은 `continue` 로 **조용히 무시**된다(`:172-174`).
- 맨몸 아라비아 숫자는 **구분자(`.` 또는 `)` 또는 괄호) 필수**. `5 Ways …` 같은 정상 제목을 삼키지 않기 위함(`:163-166`).
- 어기면: 줄바꿈된 선지는 **뒷부분이 조용히 잘린 채 게이트 CLEAN 으로 통과한다**(실측: `④ Redesigning Streets\nAround Human Perception` → 저장 텍스트 `Redesigning Streets`).

### 3-4. 정답 줄 — `parser-title.ts:55-58, 182-202, 218-220`
```ts
ANSWER_LINE_RE = new RegExp(`^${KEY_PREFIX}정답${KEY_SUFFIX}${HSPACE}*(.*)$`, "m");   // 첫 매치만
// payload 의 [*_] 는 전부 제거한 뒤 파싱 (:219) — `정답: **①**, **②**` 유실 방지
// parseAnswerRun: 선행 라벨 '런'만 취한다
const token = /^(?:([①-⑧])|[（(]\s*(\d)\s*[）)]|(\d))\s*[.)]?/;
const separator = rest.match(/^\s*(?:[,、·]|및|과|와|그리고|and)\s*/i) ?? rest.match(/^(?=[①-⑧])/);
```
- 허용 표기(실측 검증, `scripts/_test-md-title.ts:486-490`): `정답: ①, ②` · `정답: ①과 ②` · `정답: ① 및 ②` · `정답: ①②` · `정답: 1, 2` · `정답: (1)` · `정답: ①번`
- **선행 런이 끊기면 그 자리에서 멈춘다.** `정답: ① — ②가 매력적 오답` → 정답은 `①` 하나(부가 설명은 안전).
- 어기면: `정답 누락` 또는 `정답 N개 (M개 필요)`.
- **철칙: 선지 줄에 정답 표시를 다시 쓰지 마라.** 정답의 유일 진실원은 `정답:` 줄이다(`parser-title.ts:26`).

### 3-5. 해설 — `parser-title.ts:59-66, 235-237`
```ts
EXPLANATION_RE      = `^${KEY_PREFIX}해설${KEY_SUFFIX}${HSPACE}*([\s\S]*?)(?=^${KEY_PREFIX}오답${KEY_SUFFIX})`  // 오답 헤더까지
EXPLANATION_TAIL_RE = `^${KEY_PREFIX}해설${KEY_SUFFIX}${HSPACE}*([\s\S]+)$`                                     // 폴백: 문서 끝까지
cleanExplanationText (:141-147): /\*\*|__/g 전부 제거 → ^[\s*_]+ → [\s*_]+$ → trim
```
- **여러 줄·여러 문단 허용**(빈 줄 포함). 실측 확인.
- ⚠ `오답:` 헤더가 없으면 폴백이 문서 **끝까지** 삼킨다 → 해설에 오답 목록이 통째로 실린다.
- 어기면: `해설 누락`.

### 3-6. 오답해설 — `parser-title.ts:223-229`
```ts
const wrongSection = text.split(WRONG_HEAD_RE)[1] ?? "";
const wrong = parseOptionLines(wrongSection)
  .map((row) => ({ label: row.label, text: row.text }))
  .filter((row) => !answerSet.has(row.label));          // 정답 라벨 줄은 파서가 선제 제거
```
- **한 오답해설 = 정확히 한 줄.** 둘째 줄은 라벨이 없어 **조용히 소실**되고 게이트는 CLEAN 을 낸다(실측).
- 정답 라벨로 시작하는 줄은 파서가 걸러낸다 → 게이트 문구 `오답해설에 정답 라벨 포함`(`:429`)은 **파서 경유로는 도달 불가**(어댑터를 직접 부르는 경로 전용).
- 어기면: `오답해설 누락: <라벨> (N개 필요)`.

### 3-7. 오토스냅 (게이트 이전 자동 보정) — `parser-title.ts:249-289`
| 보정 | 조건 | corrections 문구 |
|---|---|---|
| 선지 본문의 자기 라벨 중복 제거 | `^(?:①\|（1）\|1[.)])\s+` 로 시작 — **구분자 필수** | `① 선지 본문의 라벨 중복 표기('①')를 제거` |
| 선지 제시 순서 라벨 순 정렬 | 라벨 집합이 **온전한 순열**일 때만 | `선지 제시 순서를 라벨 순으로 정렬` |
라벨이 중복·결손이면 **손대지 않고** 게이트가 원인을 말한다(보수 가드, `:275-283`).
⚠ 맨몸 숫자 분기는 의도적으로 없다 — `⑤ 5 Ways …` 의 첫 토큰을 삼키던 사고 회귀 방지(`:257-263`).

### 3-8. 공백·정규화 민감성
- 게이트 비교는 전부 `normalizeWs`(`parser.ts:67-74`) 경유: 곱슬따옴표→곧은따옴표 · en/em dash→`-` · `…`→`...` · 공백 축약 · trim.
- **그 외 모든 문자 차이는 그대로 비교된다.** 선지 텍스트 길이(120자)·중복 판정(`toLowerCase()`)·축자 복사 판정 전부 정규화 후 값 기준.

---

## 4. 게이트 체크리스트

### 4-A. `gateMdTitle` 반려 사유 전수 — `parser-title.ts:305-433` (= `parsed.gateIssues`, **차단 축**)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {n}개 ({optionCount}개 필요)` | 선지 개수 불일치 — **즉시 return, 이후 검사 전부 생략** | `parser-title.ts:317-319` |
| `선지 라벨이 {①…}순서가 아님 — 실제 {run\|없음}` | 라벨 런이 `①②③…` 순서와 다름 | `:322-326` |
| `{label} 선지 텍스트 누락` | `normalizeWs(text)` 가 빈 문자열 | `:331-334` |
| `{label} 선지가 제목이 아니라 문장 길이({n}자, 120자 이하 필요)` | 정규화 길이 > `TITLE_OPTION_MAX_CHARS`(120) | `:302, 336-340` |
| `{label} 선지에 한국어가 섞임(영어 제목 설정): '{앞40자}'` | `optionLanguage==="en"` 인데 `[가-힣]` 존재 | `:341-343` |
| `{label} 선지에 영문이 없음(영어 제목 설정)` | `optionLanguage==="en"` 인데 `[A-Za-z]` 없음 | `:344-346` |
| `{label} 선지에 한국어가 없음(한국어 제목 설정): '{앞40자}'` | `optionLanguage==="ko"` 인데 `[가-힣]` 없음 | `:347-349` |
| `선지 중복 — {twin} 와 {label} 가 같은 제목` | 정규화 소문자 텍스트 일치 | `:350-353` |
| `선지 길이 불균형 — {L}({n}자) 와 {S}({m}자). 길이만으로 정답이 드러난다` | `longest >= shortest*3 && longest-shortest > 18` | `:359-370` |
| `정답 누락` | `q.answers.length === 0` | `:374-375` |
| `정답 {n}개 ({answerCount}개 필요) — 실제 {…}` | 정답 라벨 수 ≠ 설정값 | `:376-378` |
| `정답 라벨({label})이 선지에 없음` | 정답 라벨이 선지 라벨 집합 밖 | `:379-381` |
| `{label} 정답 선지가 지문 축자 복사({n}단어) — 제목은 압축 재진술이어야 한다` | 정답 텍스트 **7단어 이상** AND 정규화 소문자 지문에 substring 존재 | `:383-392` |
| `해설 누락` | `q.explanation` 이 빈 문자열 | `:394` |
| `해설에 한국어 산문에 올 수 없는 외국 문자('{c}')가 섞임` | 히라가나·가타카나·CJK한자·중문구두점(한글 직후 괄호 병기는 예외) | `:81-96, 99-111, 395` |
| `해설에 영단어와 종결어미가 직접 접합된 짜깁기('{w}다')가 있음` | `(?:^\|[\s가-힣("'‘“])([a-z]{2,})다(?=[\s.,·)!?"'’”]\|$)` | `:87-90, 395` |
| `{label} 오답해설에 …외국 문자('{c}')가 섞임` | 위와 동일 검사를 오답해설 전수 적용 | `:399-401` |
| `{label} 오답해설에 …짜깁기('{w}다')가 있음` | 〃 | `:399-401` |
| `오답해설 누락: {labels} ({n}개 필요)` | 비정답 라벨 중 오답해설 없는 것. **정답을 못 읽었으면 미발화**(거짓 사유 방지) | `:409-418` |
| `오답해설 라벨 중복 — 해설이 덮어써진다 ({got})` | 같은 라벨의 오답해설 2줄 이상 | `:419-421` |
| `오답해설 본문이 빈 줄이 있음` | 라벨만 있고 본문이 공백 | `:422-424` |
| `오답해설에 없는 선지 라벨: {labels}` | 선지에 없는 라벨의 오답해설 | `:425-426` |
| `오답해설에 정답 라벨 포함` | `q.wrong` 에 정답 라벨 존재 — **파서 경유로는 도달 불가**(`:227-229` 가 선제 필터) | `:428-430` |

`requireWrong: false` 를 주면 오답해설 검사군 전체가 꺼진다(`:313, 406`). **프로덕션·qbank 경로는 항상 기본값 `true`** — `lane-title.ts:125-129` 가 이 키를 넘기지 않는다.

### 4-B. 어댑터 실패 — `adapter-title.ts:84-122` (qbank 하네스 `ADAPT` 코드로 차단)
| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {n}개 (4~8개 필요)` | 선지 수 범위 밖 | `adapter-title.ts:84-86` |
| `정답 라벨 누락` | `answers.length === 0` | `:87` |
| `오답이 하나도 없음 — 정답 개수가 선지 개수와 같다` | `answers.length >= options.length` | `:88-90` |
| `정답 라벨이 선지에 없음: {…}` | 〃 | `:92-96` |
| `빈 선지가 있음` | `option.text.trim()` 이 빔 | `:97-99` |
| `오답해설 라벨 중복({label}) — 해설이 덮어써진다` | `wrongByLabel` 중복 | `:116-122` |

### 4-C. 품질 검증 error — `validateQuestionQuality` (프로덕션은 **비차단**, qbank 하네스는 `qualityBlocking` 으로 **차단**)
| code | 조건 | file:line |
|---|---|---|
| `option-count` | 선지 수 ≠ `genericOptionCount` (4~8 클램프) | `question-quality/validators/options.ts:133-142` |
| `duplicate-option-label` / `duplicate-option-text` / `empty-option-text` | 라벨·텍스트 중복, 빈 선지 | `options.ts:144-158` |
| `option-spelling-triple-letter` | 선지에 같은 글자 3연속 토큰(`iii`·`www` 제외) | `options.ts:160-179` |
| `correct-answer-mismatch` | `correctAnswer` 라벨이 선지에 없음 | `options.ts:195-218` |
| `generic-answer-count` | `answerCount ≥ 2` 인데 정답 라벨 수 불일치 | `question-quality/dispatcher.ts:810-823` |
| `generic-multi-answer-direction` | 복수정답인데 발문에 `모두\|all\|apply` 없음 — 어댑터가 자동 충족 | `dispatcher.ts:824-831` |
| `gist-polarity-direction-mismatch` | `answerPolarity=NEGATIVE` 인데 발문이 부정형 아님 — 어댑터가 자동 충족 | `validators/topic.ts:12-26` |
| `type-foreign-field` | `blanks`·`passageWithBlank`·`originalExpression`·`blankAnswerMode` 유입 | `validators/misc.ts:26, 42-50` |
| `title-direction-foreign` | 발문에 `빈칸\|들어갈 말\|들어가기에\|순서로\|배열\|들어갈 곳` | `misc.ts:52-61` |
| `explanation-quoted-token-missing` | 해설·오답해설의 **따옴표 영어 인용(12자 이상 조각)** 이 지문·선지 어디에도 없음 | `validators/explanation-quoted-tokens.ts:117-162` |
| `explanation-foreign-text` 계열 | 한자·가나 혼입, `영단어+다` 짜깁기(0원 게이트와 중복 방어) | `dispatcher.ts:836-837` |
| `passage-*` 3종 | 지문 자체 무결성(중복 문장·붙은 토큰·경계 공백) | `question-quality/passage-integrity.ts:59, 79, 99` |

경고(비차단)로만 나오는 것: `few-key-points`·`thin-killer-explanation`·`shallow-killer-options`·`option-length-giveaway`·`difficulty-mismatch`
(`validators/misc.ts:66-96`, `dispatcher.ts:796-798`). `keyPoints` 는 어댑터가 **빈 배열로 고정**하므로 KILLER 문항마다 `few-key-points` 경고가 항상 뜬다 — 정상이다(`adapter-title.ts:147-149`).

### 4-D. qbank 유닛 게이트 (문항 간) — `qbank/harness/qgen-core.ts`
| code | 조건 | file:line |
|---|---|---|
| `CONTAINER` | `<!-- ITEM n -->` 헤더 누락·번호 비연속·`point:` 누락·본문 빔·`settings` JSON 파싱 실패 | `qgen-core.ts:57-85` |
| `ITEM_COUNT` | 문항 수 < `minItems`(기본 5) | `:229-236` |
| `POINT_DUPLICATE` | 유닛 내 `point:` 정규화 값 중복 | `:324-333` |
| `ANSWER_DUPLICATE` | 두 문항의 `diversityTargets`(= **정답 선지 텍스트**) 가 같음 | `:335-353` |

---

## 5. adapter 산출 필드 — `adapter-title.ts:132-153`

| 키 | 값 | 비고 |
|---|---|---|
| `direction` | 결정형 발문 8종 중 하나 | **모델이 만들지 않는다.** 극성×복수×언어 조합 — `:45-70` |
| `options[]` | `{ label: "1"~"8", text }` | ★ **원문자가 아니라 숫자 문자열**. `titleDigitLabel`(`:73-76`)이 변환. 원문자 표시는 렌더러 담당 |
| `correctAnswer` | `"1"` 또는 `"1, 2"` | 라벨 순 정렬 후 `", "` 조인 (`:106-109, 141`) |
| `correctAnswers[]` | `["1","2"]` | ★ **정답 2개 이상일 때만 존재**. 단일 정답이면 키 자체가 없다(`:142-144`) |
| `wrongOptionExplanations` | 어댑터 산출 시 `[{label, explanation}]` → 후처리가 `Record<label, string>` 로 정규화 | 빈 문자열 항목은 제거(`:123-129`) |
| `explanation` | 파싱된 해설 원문 | 장식 제거 후 |
| `keyPoints` | `[]` **고정** | 합성 금지 — 오태깅 노출 사고 이력(`:147-149`) |
| `tags` | `[]` 고정 | |
| `difficulty` | `ctx.rawDifficulty` 그대로 | |

**이 유형에만 있는 것 / 없는 것**
- ★ **지문 필드를 하나도 만들지 않는다** — `passageWithMarkers`·`passageWithNumbers`·`passageWithUnderline`·`passageWithBlank` 전부 부재(PASSTHROUGH 계약, `:5-9`).
- ★ 후처리가 하는 일은 `wrongOptionExplanations` 배열→Record 변환 **하나뿐**이다. options 는 무변경.
- ★ 저장 직전 라우트가 `shuffleQuestionOptionsForDiversity` 로 **선지를 섞는다**(`question-diversity.ts:508-512` 에 `TITLE` 등재) → **정답 위치는 저작자가 통제할 수 없다.**

발문 8종 전문 (`adapter-title.ts:52-69`):
| 극성 | 정답수 | ko | en |
|---|---|---|---|
| 긍정 | 1 | `다음 글의 제목으로 가장 적절한 것은?` | `Which of the following is the most appropriate title for the passage?` |
| 긍정 | ≥2 | `다음 글의 제목으로 적절한 것을 모두 고르시오.` | `Choose all the appropriate titles for the passage.` |
| 부정 | 1 | `다음 글의 제목으로 가장 적절하지 않은 것은?` | `Which of the following is NOT an appropriate title for the passage?` |
| 부정 | ≥2 | `다음 글의 제목으로 적절하지 않은 것을 모두 고르시오.` | `Choose all the titles that are NOT appropriate for the passage.` |

---

## 6. 생성 노브

qbank 에서는 `<!-- ITEM n ... settings: {...} -->` 의 **JSON 키 이름**으로 준다(하네스가 `{ TITLE: {…} }` 로 감싼다 — `qgen-core.ts:369-377`).

| 키(settings) | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `optionCount` | number | **5** | `4~8` (반올림 후 클램프; 키 생략·파싱 불가 문자열이면 5) — `prompts-title.ts:43-47` | **선지 줄 개수**와 라벨 축(`①`~`⑧`). 게이트 #1·#2 가 직접 집행 |
| `answerCount` (별칭 `correctAnswerCount`) | number | **1** | `1 ~ optionCount-1` — `prompts-title.ts:50-55`, `generic.ts:46-56` | `정답:` 줄의 라벨 개수(`, ` 병기). **오답해설 줄 수 = optionCount − answerCount** |
| `answerPolarity` | `"NEGATIVE"` 만 유효 | 미설정(=POSITIVE) | `"NEGATIVE"` 외 모든 값은 `undefined` — `shared.ts:121-133` | **마크다운 형식 불변.** `오답:` 절의 의미가 "왜 타당한가"로 반전, 발문이 부정형으로 바뀜 |
| `optionLanguage` | `"ko" \| "en"` | **`"en"`** — `language.ts:22` | 그 외 값은 기본값 폴백 — `language.ts:92-97` | **선지 텍스트 언어**를 게이트가 결정형 집행(#5~#7). `ko` 면 한글 필수, `en` 이면 라틴 필수 + 한글 금지 |
| `stemLanguage` | `"ko" \| "en"` | **`"ko"`** — `language.ts:22` | 〃 | **마크다운에 영향 없음.** 어댑터 발문 언어만 결정(`adapter-title.ts:52-60`) |
| `difficulty` (ITEM 헤더 필드) | `BASIC\|INTERMEDIATE\|KILLER` | `INTERMEDIATE` — `qgen-core.ts:79-82` | 세 값 외는 컨테이너 에러 | 형식 불변. 설계 강도(근거 깊이·표면 어휘 재사용량) 기준이 바뀜 — `prompts-title.ts:100-113, 123-137` |

**적격성 가드** — `lane-title.ts:90-102`: `4 ≤ optionCount ≤ 8` AND `1 ≤ answerCount ≤ optionCount-1`. 벗어나면 레인이 아예 안 돈다.
`optionLanguage` 토글이 실제로 먹는 이유: `TITLE ∈ OPTION_LANGUAGE_FREE_TYPE_IDS`(`language.ts:64-72`) → scope `stem-option`.
`answerPolarity` 토글이 먹는 이유: `TITLE ∈ GIST_POLARITY_TYPE_IDS`(`shared.ts:43-48`).

---

## 7. 함정 — 실제로 게이트를 깨뜨리거나(A) **조용히 통과시키는**(B) 저작 실수

> B 계열이 더 위험하다. 후처리가 없어(`PASSTHROUGH`) **게이트를 통과하면 그대로 출하**된다.

### A. 즉시 반려되는 것
| # | 실수 | 결과 | 근거 |
|---|---|---|---|
| A1 | 선지 줄에 `(정답)`·`O/X`·기제 이름 같은 둘째 칸을 붙임 | 영어 선지 설정에서 `① 선지에 한국어가 섞임` (실측) | `parser-title.ts:341-343` |
| A2 | `정답:` 줄을 빼고 선지 줄로만 정답을 표시 | `정답 누락` + 오답해설 결손 검사 침묵 | `:374-375, 409-414` |
| A3 | 정답 선지에 지문 문장을 그대로 옮김(7단어 이상) | `정답 선지가 지문 축자 복사(N단어)` | `:383-392` |
| A4 | 정답만 길게 씀 | `선지 길이 불균형` (최장 ≥ 최단×3 AND 차 > 18자) | `:359-370` |
| A5 | 해설에 한자·가나 사용 (`决定`·`から`) | `해설에 …외국 문자('决')가 섞임` | `:82-84, 395` |
| A6 | 해설에 `steals다` 류 영단어+종결어미 짜깁기 | `…짜깁기('steals다')가 있음` | `:87-90` |
| A7 | 오답해설을 정답 포함 전 선지에 씀 | 파서가 정답 줄을 필터 → 나머지는 통과하나, 정답 라벨 줄만 소실 | `:227-229` |
| A8 | 오답해설 한 줄 누락 | `오답해설 누락: ③ (4개 필요)` (실측) | `:415-418` |
| A9 | 선지 하나가 120자 초과(문장을 통째로 실음) | `선지가 제목이 아니라 문장 길이(N자, 120자 이하 필요)` | `:302, 336-340` |
| A10 | 해설·오답해설에 지문에 없는 영어 표현을 따옴표로 인용 | 품질 error `explanation-quoted-token-missing` (qbank 차단) | `explanation-quoted-tokens.ts:117-162` |

### B. ★ 조용히 통과하는 것 (전부 tsx 실측)
| # | 실수 | 무엇이 사라지는가 | 근거 |
|---|---|---|---|
| **B1** | **선지 본문을 두 줄에 걸쳐 씀** | 둘째 줄이 통째로 소실 → `④ Redesigning Streets` 만 저장. **게이트 CLEAN** | `parser-title.ts:168-178` |
| **B2** | **오답해설을 두 줄에 걸쳐 씀** | 둘째 줄 소실. **게이트 CLEAN** | `:227` |
| **B3** | 라벨 뒤에 마침표(`②. Sound Barriers`) | 저장 텍스트가 `". Sound Barriers"` — 앞에 `. ` 잔재. `cleanOptionText` 의 제거 클래스 `[-–—:：)]` 에 `.` 이 없다. **게이트 CLEAN** | `:158` |
| **B4** | 오답해설을 표 행으로 씀(`\| ② \| 방향반대 \| … \|`) | 내부 파이프가 본문에 남아 `방향반대 \| 필자가…` 로 저장. **게이트 CLEAN** | `:159-160` |
| **B5** | `optionLanguage: "ko"` 에서 선지에 `(정답)` 표시를 남김 | 한글이 있어 언어 게이트가 안 걸린다 → **정답 누출이 학생 표면에 그대로 출하** | `:347-349` |
| **B6** | `오답:` 헤더를 빼고 해설 뒤에 오답을 나열 | `EXPLANATION_TAIL_RE` 가 문서 끝까지 삼켜 해설에 오답 목록이 실림 + `오답해설 누락` | `:63-66, 223` |
| **B7** | 키워드 줄을 표 파이프로 시작(`\| 정답: ① \|`) | 그 필드 통째 소실 → **원인과 다른 반려 문구** | `:42-44` |
| **B8** | 콜론을 뺌(`정답 ①`) | 정답 통째 소실 | `:44` |
| **B9** | 문항 5개를 한 파일에 이어 붙임(ITEM 주석 없이) | 파서는 첫 매치만 취해 2~5번이 조용히 사라지거나 1번을 오염 | `../recon/00-contract.md §3` |
| **B10** | 문항마다 정답 라벨 위치를 골고루 분산시키는 데 공들임 | 저장 직전 셔플로 무의미해진다 | `question-diversity.ts:508-512` |

### C. 설계 함정 (게이트는 못 잡지만 문항이 무효가 되는 것)
- **부정 극성에서 타당 선지 4개가 서로 다른 근거 문장에 걸리지 않으면 곧 복수정답이다.** 0원 게이트로 판정 불가하고 그대로 출하된다(`prompts-title.ts:84-88` 이 이 사고를 명시적으로 경고).
- 부정 극성에서 "덜 포괄적이다·조금 좁다" 정도의 어긋남은 **이의신청을 부르는 최악의 설계**. 결정형(지지 문장 0개 / 방향 정반대)이어야 한다(`prompts-title.ts:134`).
- 오답을 지문 밖 개념(다른 학문 용어·정책 방안)으로 만들면 학생이 지문을 안 읽고 소거한다 — **함정이 아니라 장식**(`prompts-title.ts:150`).
- 하나만 완전한 진술문이면 내용을 안 읽어도 형식으로 걸러진다 — 선지 전부 표제 형상 통일(`prompts-title.ts:151`).

---

## 8. 출제 포인트 다각화 축

> 한 지문에서 TITLE 문항 5~8개를 만든다. **답만 다르고 묻는 방식이 같으면 1개 문항의 N개 사본이다**(헌법 §7).
> 하네스가 결정형으로 차단하는 것은 둘뿐이다 — `POINT_DUPLICATE`(ITEM 헤더 `point:` 문자열)와
> `ANSWER_DUPLICATE`(정답 **선지 텍스트**, `lane-title.ts:167-193` → `qgen-core.ts:335-353`).
> **즉 5~8문항의 정답 표제는 서로 다른 문자열이어야 한다.** 이것이 이 유형 다각화의 하드 제약이다.

### 8-A. 노브로 달라지는 축 (코드 근거 있음 — ITEM `settings:` 로 즉시 집행)

| 축 | 값 | 무엇이 달라지는가 | 근거 |
|---|---|---|---|
| **극성** | POSITIVE / NEGATIVE | 인지 작업이 **뒤집힌다**. 긍정은 "가장 잘 압축한 하나", 부정은 "혼자 충돌하는 하나". 오답 설계 원리가 통째로 다르다 | `shared.ts:43-48`, `prompts-title.ts:160-172` |
| **정답 수** | 1 / 2 / 3… (≤ optionCount−1) | 복수정답은 **같은 결론을 서로 다른 근거 문장에서 표제화한 둘**을 동시에 요구 — 근거 이중화 자체가 채점 대상이 된다 | `prompts-title.ts:50-55, 273-278` |
| **선지 수** | 4 / 5 / 6 / 7 / 8 | 4는 속도형, 8은 소거 부담형. 8이면 기제 4종을 반복하지 말고 **같은 기제의 다른 각도**로 확장해야 한다 | `prompts-title.ts:140-144` |
| **선지 언어** | en / ko | ko 로 돌리면 **영어 표면 어휘 매칭 전략이 원천 봉쇄**된다. 같은 논지라도 완전히 다른 풀이 경로 | `language.ts:64-72`, `parser-title.ts:341-349` |
| **발문 언어** | ko / en | 학생 표면만 바뀜(형식 불변). 영어 발문 세트를 섞어 실전 감각 축 추가 | `adapter-title.ts:52-60` |
| **난이도** | BASIC / INTERMEDIATE / KILLER | 근거 깊이 1문장 → 2문장 인과·대조 → 논지 수렴 자리 + **표면 어휘 재사용 0** | `prompts-title.ts:100-113` |

유닛 배분(헌법 §4): 5문항 = BASIC 1 / INTERMEDIATE 2 / KILLER 2 · 8문항 = 2/3/3. **전량 KILLER 금지.**

### 8-B. 설계로 달라지는 축 (교육적 판단 — 게이트가 못 보는 곳, 여기가 진짜 승부처)

1. **정답 표제의 수사 각도** — 같은 논지를 다른 표제 형상으로 재진술한다. 문항마다 하나씩 배정:
   ① 논지 축 직진술(`Contrast, Not Volume, Decides What Feels Noisy`)
   ② 결론의 역설을 의문형으로(`Why Silencing a City Can Make It Louder`)
   ③ '대가·비용'의 각도(`The Hidden Cost of Chasing Lower Decibels`)
   ④ 조건절 표제(`When Removing Noise Adds Irritation`)
   ⑤ 콜론 부제형(`Quieter Streets: The Paradox Built In`)
   ⑥ 행위자·주체 각도(`What Engineers Get Wrong About Silence`)
   → **`ANSWER_DUPLICATE` 하드 제약을 만족시키는 정공법이 이 축이다.**

2. **정답의 근거 문장 자리** — 도입 통념 / 전환점(however·yet) / 기제 설명 / 사례 / 결론(귀결).
   BASIC 은 명시 주제문 1곳, INTERMEDIATE 는 서로 다른 두 문장의 인과·대조, KILLER 는 **떨어진 두 문장 이상**.
   같은 결론 문장을 5문항이 전부 겨냥하면 그건 사본이다.

3. **오답 기제 팔레트 구성** — 4종(방향반대·도입부함정·범위확대/세부축소·근거없음, `prompts-title.ts:145-151`)을
   문항마다 **다른 배합**으로. 예: 문항1 = 방향반대+도입부함정+범위확대+근거없음(표준),
   문항2 = 방향반대 2종(서로 다른 각도)+세부축소+근거없음, 문항3 = 범위확대 2종+도입부함정+방향반대.
   헌법 §3 의 (L,F) 코드와 교차해 **같은 F코드 3회 이상 금지**를 유닛 단위로 지킨다.

4. **최강 미끼의 정체** — 어느 기제를 "끝까지 저울질" 자리에 두는가. 문항마다 달라야 한다.
   방향반대(핵심 소재를 표제로 앞세움)가 가장 강하지만 5문항 내내 방향반대만 최강 미끼면 학생이 패턴을 학습한다.
   `L4 위치 인접`(정답 근거 문장 바로 옆)·`L5 세련된 재해석` 계열로 최강 미끼를 교대하라.

5. **표면 어휘 재사용량** — BASIC 은 핵심어 1~2개 재사용 허용, INTERMEDIATE 는 최대 2개, KILLER 는 0개 목표.
   같은 지문에서 "표면 어휘가 가장 많은 선지가 정답인 문항"과 "가장 적은 선지가 정답인 문항"을 섞으면
   표면 매칭 전략이 **양방향으로 실패**한다 — 이 유형에서 가장 강력한 다각화 수단이다.

6. **표제 형상 층위(문항 내 통일 / 문항 간 교대)** — 한 문항 안에서는 5개가 전부 같은 형상이어야 하지만
   (아니면 형식만으로 걸러짐), 문항 1은 전부 명사구, 문항 2는 전부 의문형, 문항 3은 전부 콜론 부제 —
   이렇게 문항 간에 형상을 갈면 같은 정답 내용도 다른 문항이 된다.

7. **오답의 지문 내 좌표** — 오답 4개가 겨냥하는 지문 위치를 문항마다 회전시킨다.
   문항1의 도입부함정이 1문장을 쓰면, 문항2의 도입부함정은 2문장을 쓴다. 지문 전 구간이 최소 한 번씩 오답 재료가 되게 하라.

8. **`point:` 문자열 설계** — 하네스가 정규화 문자열로 중복을 차단하므로(`qgen-core.ts:379-384`),
   "제목 찾기" 같은 유형명 반복은 금지. **"무엇을 겨냥했는가"를 적어라** — 예:
   `논지 축 직진술`, `역설의 인과 추적`, `표면 어휘 0회 재사용`, `부정 극성 — 지문 결론과 정면 충돌 색출`,
   `한국어 표제 — 어휘 매칭 봉쇄`, `복수정답 — 근거 문장이 다른 두 표제`.

### 8-C. 다각화 축으로 **쓸 수 없는 것**
- **정답 라벨 위치(①~⑤)** — 저장 직전 셔플로 무작위화된다(`question-diversity.ts:508-512`).
- **같은 정답 표제의 어순·관사 변형** — `ANSWER_DUPLICATE` 는 정규화 비교라 걸리지 않을 수 있으나, 검수 렌즈 ⑤(다각화 심사)가 의미 중복으로 반려한다(헌법 §8).
- **해설 문장 수만 늘리기** — 인지 작업이 그대로다.

---

## 부록 — 검증 실행

```
./node_modules/.bin/tsx qbank/work/_probe-TITLE.ts
```
6문항 유닛(BASIC 긍정 / INTERMEDIATE 긍정 / KILLER 긍정+영어 인용 해설 / INTERMEDIATE 부정극성 /
KILLER 한국어 선지+영어 발문 / INTERMEDIATE 선지8·정답2)을 `gateUnit` 에 통과시킨다.
**결과: `blocking = 0` · `qualityBlocking = 0` · `ok = true`** (경고는 `few-key-points` 2건 — 어댑터가 `keyPoints: []` 로 고정하므로 KILLER 문항에서 항상 발생하는 정상 경고).
