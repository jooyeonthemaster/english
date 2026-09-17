# 핵심 표현 빈칸 (FILL_BLANK_KEY)

> 분류 **서술형(단답 직접 기입, 선지 없음)** · 지문변형 **있음(정답 스팬 1곳을 `_____` 로 치환 — 치환은 후처리가 원지문에 수행)** · 정답 머리표 **`정답:`** (서술형이지만 `모범답안:` 이 **아니다**) · 최소 지문 길이 **코드 규정 없음(=0)**, 단 「첫 문장 표적 금지 + 정답 표현 지문 내 1회 등장 + 유닛 내 정답 전량 상이」가 겹쳐 실질 하한은 **비울 수 있는 문장 개수**가 결정한다(§8-0).
>
> 검증: `qbank/work/_probe-FILL_BLANK_KEY.ts` — **67/67 PASS** (parse → autoSnap → gate → adapt → postProcess → validateQuestionQuality → gateUnit 5문항 유닛까지 전 경로).
> 상위 계약: [`../recon/00-contract.md`](../recon/00-contract.md) · 품질 규범: [`../quality-constitution.md`](../quality-constitution.md)

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

학생 화면에는 **지문 전체가 빈칸 하나만 뚫린 채로** 보이고(`passageWithBlank`, `student-safe-data.ts:361-367`),
학생은 그 자리에 들어갈 표현을 **손으로 쓴다**. 채점은 선지 선택이 아니라
**지문 축자 정답과의 완전일치**다 — `buildAnswerSpec` 이 `inputKind: TEXT_SINGLE` · `textMode: EXACT` 를 부여하고
(`exam-scoring/answer-spec.ts:292-300`), `normalizeText` 가 흡수하는 것은 **대소문자·다중공백·문말 구두점·스마트따옴표·NFC·폭0 문자**뿐이다(`exam-scoring/normalize.ts:84-96`).

그래서 이 유형의 급소는 5지선다와 완전히 다르다. **오답을 설계하는 유형이 아니라, 오답이 생길 여지를 없애는 유형이다**
(`prompts-fill-blank-key.ts:74-80`). 좋은 표적은 두 조건을 **동시에** 만족해야 한다(`prompts-fill-blank-key.ts:124-127`):

1. **유일 지목** — 문맥이 그 자리에 들어갈 표현을 한 가지로 좁혀 준다. 깨지면 정답을 아는 학생이 오답 처리된다.
2. **축자 부재** — 그 표현이 지문의 다른 어디에도 그대로 다시 나오지 않는다. 깨지면 지문을 안 읽은 학생이 베껴 쓴다.

두 조건은 각각 게이트로 집행된다: ①은 기계가 못 보므로 **설계 책임**(검수 렌즈 ①), ②는 `G7/G8` 이 결정형으로 차단한다(§4-1 「정답이 지문에 {n}회 등장」).

### 다른 유형과의 구별

| 유형 | 학생이 보는 것 | 학생이 하는 것 | 채점 |
|---|---|---|---|
| **FILL_BLANK_KEY** | 지문 전체 + 빈칸 1개 | **지문에 있는 표현을 찾아 쓴다** | EXACT 문자열 일치 |
| `BLANK_INFERENCE` | 지문 + 빈칸 1개 + **선지 5개** | 고른다 | 선지 라벨 |
| `SUMMARY_COMPLETE` | 지문 + **요약문**의 빈칸 | 요약문에 쓴다(추상화) | EXACT |
| `CONDITIONAL_WRITING` / `WORD_ORDER` | 조건·청크 | **문장을 짓는다** | `모범답안:` 기반 |
| `SENTENCE_TRANSFORM` | 원문장 + 조건 | 통사 변형 | `모범답안:` 기반 |

★ 결정적 차이 1: **서술형인데 머리표가 `정답:` 이다.** 조건부영작·문장변형·어순배열은 `모범답안:` 이지만(00-contract §4),
이 유형의 파서는 `정\s*답` 만 계약 라벨로 인정한다(`parser-fill-blank-key.ts:143`). `모범답안:` 을 쓰면 **정답이 통째로 사라진다**.

★ 결정적 차이 2: **정답은 창작이 아니라 지문 축자다.** 패러프레이즈·동의어는 전부 오답이며(`grade.ts` EXACT),
허용답 칸조차 존재하지 않는다 — 표기 변형은 어댑터가 결정론으로 파생한다(`adapter-fill-blank-key.ts:97-141`).

---

## 2. 마크다운 골격

### 2-1. 복붙 골격 (플레이스홀더 `<꺾쇠>`)

```md
빈칸문장: <지문의 표적 문장 **한 문장**을 한 줄로 그대로 옮기되, 정답 스팬만 _____ 로 바꾼다. 빈칸은 정확히 1개. 나머지는 철자·구두점·대소문자까지 한 글자도 바꾸지 않는다. 지문 첫 문장은 금지.>
정답: <_____ 자리에 원래 있던 지문 축자 표현. 2~7단어(권장 2~5). 관사(a/an/the)로 시작 금지, 구두점으로 끝나기 금지, 따옴표·괄호·콜론·세미콜론 포함 금지. 지문 전체에서 정확히 1회만 등장해야 한다.>
해설: <딱 2문장. ①빈칸 문장이 글의 논지에서 하는 역할 ②정답을 유일하게 지목하는 지문 단서(어느 문장의 무엇). 한국어 합니다체, 전체 400자 이내. 영어 인용은 지문 축자로 한 조각 12단어 이내.>
```

> 세 줄이 전부다. `허용답:` `발문:` `지문:` `모범답안:` 칸을 **만들지 마라** — 계약 라벨은 `빈칸문장:` `정답:` `해설:` 셋뿐이다(`gate-fill-blank-key.ts:188`).
> 장식(굵게·헤딩·불릿·표·인용)은 이 유형의 파서가 흡수하지만(§3-R2), **저작 규칙은 장식 0** 이다(00-contract §8).

### 2-2. ★ 검증된 정상 픽스처 전문 — `scripts/_test-md-fill-blank-key.ts:49-64`

지문(`PASSAGE`):

```
Every laboratory keeps a drawer of experiments that never worked. A researcher who reviews only her own notebook will read those failures as bad luck, because the mistake that produced them is invisible from the inside. Colleagues, by contrast, arrive without that blind spot and attack the argument at exactly the joint where it was weakest. What a lone researcher cannot supply for herself is the adversarial scrutiny that turns a private hunch into a public claim. Science therefore advances less through individual brilliance than through the stubborn habit of letting other people look.
```

마크다운 실물 (probe **P1** 에서 `gate 0` 재확인):

```md
빈칸문장: What a lone researcher cannot supply for herself is the _____ that turns a private hunch into a public claim.
정답: adversarial scrutiny
해설: 이 문장은 앞의 두 장면(혼자 보는 사람의 사각과 동료의 반박)을 하나의 개념으로 압축하는 자리입니다. 바로 앞 문장이 동료가 논증의 가장 약한 이음매를 공격한다고 서술하므로, 빈칸에는 그 공격적 검증 절차를 가리키는 표현이 들어갑니다.
```

해부(왜 이것이 정상인가):
- 표적은 **4번째 문장**(첫 문장 금지 통과) · 빈칸 1개 · 관사 `the` 는 빈칸 **밖**에 남았다.
- 정답 `adversarial scrutiny` 는 지문 전체에서 **1회**만 등장한다 — 앞 문장들은 `attack the argument`, `blind spot` 처럼 **다른 말**로 개념을 예비했을 뿐이다.
- 빈칸 뒤 관계절 `that turns ... into a public claim` 이 단수 명사구를 통사적으로 강제한다(동사구·절은 애초에 못 들어간다).
- 해설은 한국어 2문장·167자, 영어 인용 0.

### 2-3. qbank 컨테이너 실물 (유닛 1문항분)

```md
<!-- ITEM 1
difficulty: INTERMEDIATE
point: 반론의 핵심 — 통념이 놓친 비용을 처음 명명하는 자리
craft: 앞 두 문장의 통념(선택지는 무시하면 그만)을 뒤집는 개념을 한 어구로 압축시킨다
-->
빈칸문장: What that argument overlooks is the _____, which grows faster than the number of items on the shelf.
정답: mental cost of comparison
해설: 이 문장은 앞 문장의 통념을 반박하며 글의 논지를 여는 자리입니다. 앞 문장이 선택지는 무시하면 그만이라고 서술하고 뒤 문장이 기준을 새로 만들어야 하는 수고를 묘사하므로, 빈칸에는 비교에 드는 정신적 비용을 가리키는 표현이 들어갑니다.
```

노브를 줄 때만 `settings:` 줄을 추가한다: `settings: {"stemLanguage": "en"}` (`qgen-core.ts:71-77, 369-377`).
ITEM 헤더는 **qbank 규약이지 md-qgen 규약이 아니다** — 하네스가 잘라낸 뒤의 본문만이 파서 계약 대상이다.

---

## 3. 파서 계약 (★ 가장 중요)

> 진실원은 `src/lib/md-qgen/parser-fill-blank-key.ts` + `gate-fill-blank-key.ts` 다.
> ⚠ **`snap-fill-blank-key.ts` 는 존재하지 않는다** — 오토스냅은 `parser-fill-blank-key.ts:336-434` 의 `autoSnapFillBlankKey` 다.
> ★ 이 유형은 **`decoration.ts` 를 import 한다**(`parser-fill-blank-key.ts:13`). 정본 `parser.ts` 계열(BLANK_INFERENCE·GRAMMAR_ERROR)과 달리 머리표 장식이 흡수된다 — 그래도 저작 규칙은 장식 0(§7-T14).

### 3-A. 문서 구조 — 줄 단위 관대 스캐너 (★ 첫매치가 아니다)

| # | 규칙 | 원문 | file:line | 어기면 |
|---|---|---|---|---|
| **R1** | 입력을 `/\r?\n/` 로 **줄 단위 분해**해 순차 스캔한다. 라벨 줄이 나오면 새 섹션을 열고, 라벨이 아닌 줄은 **직전 섹션에 이어 붙인다** | `for (const rawLine of String(text ?? "").split(/\r?\n/))` | `parser-fill-blank-key.ts:204` | 문장을 두 줄로 접어 써도 흡수된다(관용). 반대로 **군더더기 산문 줄이 값에 접합**될 수 있다 |
| **R2** | 라벨 판정은 **공유 머리표 정규식 하나**뿐 | `keywordLineRe(keyword)` = `` /^[\s>|]*(?:#{1,6}\s*)?(?:[-*•]\s+)?[\s*_~`"'“‘]*{KW}[\s*_~`"'”’]*\s*[:：]?[\s*_~`]*[ \t]*(.*)$/m `` | `decoration.ts:81-99` · 호출 `parser-fill-blank-key.ts:160` | 들여쓰기·인용 `>`·표 파이프 `\|`·헤딩 `#`~`######`·불릿 `- * •`·강조 `* _ ~` 백틱·전각 콜론 `：`·꼬리 공백을 **전부 흡수**한다 |
| **R3** | 계약 라벨은 **정확히 4개**이고 키워드에 `\s*` 가 끼어 있다 | `[{sentence:"빈\\s*칸\\s*문\\s*장"}, {accepted:"허\\s*용\\s*답"}, {answer:"정\\s*답"}, {explanation:"해\\s*설"}]` | `parser-fill-blank-key.ts:140-145` | `빈칸 문장:` `정 답:` 같은 내부 공백 드리프트는 흡수. **그 밖의 라벨은 전부 미지 라벨**(R6) |
| **R4** | 콜론도 표 파이프도 없는 머리표(`## 정답`)는 **값이 다음 줄에 있을 때만** 인정 | `if (!/[:：\|]/.test(head) && value.trim()) return null;` | `parser-fill-blank-key.ts:164` | 한국어 산문 `정답은 ~입니다`가 라벨로 오인돼 값이 오염되는 것을 막는다. **해설 안에 `정답은…` 을 써도 안전** |
| **R5** | 마크다운 헤딩 줄(`^\s*#{1,6}\s`)은 **섹션을 닫는다** | `if (/^\s*#{1,6}\s/.test(line)) { current = null; continue; }` | `parser-fill-blank-key.ts:218-221` | `## 지문` + 지문 재출력이 해설에 딸려 드는 오염을 차단. (`### 정답:` 은 R2 가 먼저 라벨로 흡수) |
| **R6** | 계약 라벨이 아닌데 라벨처럼 보이는 줄(`^짧은머리[:：]`)은 **직전 버킷에 이어붙이지 않고** 모아 두고 섹션을 닫는다 | `UNKNOWN_LABEL_HEAD = "(?:[^\\s:：\|][^:：\|]{0,11})"`, `http://` 스킴 제외 | `parser-fill-blank-key.ts:148, 178-182, 225-229` | `답변:` `모범답안:` `발문:` 등을 쓰면 **그 값이 어느 필드에도 안 실린다** → `정답 누락` + 「읽지 못한 라벨 줄」 동반 반려 (probe **E11**) |
| **R7** | 코드펜스(` ``` ` / `~~~`)는 섹션을 닫는다 | `FENCE_RE = /^\s*(?:```\|~~~)/` | `parser-fill-blank-key.ts:126, 234-237` | 꼬리에 코드펜스로 지문을 재출력해도 해설이 오염되지 않는다 |
| **R8** | 라벨이 나오기 전의 줄(`current === null`)은 **기록 없이 버려진다** | `if (!current) continue;` | `parser-fill-blank-key.ts:230` | 서두 인사말·메타 설명은 무해하게 사라진다(관용). 단 `droppedLines` 에도 안 남는다 |
| **R9** | 내용 없는 장식 줄(표 구분선·수평선)은 버린다 | `DECORATION_ONLY_RE = /^[\s\|:=*+-]+$/` | `parser-fill-blank-key.ts:123, 233` | `\|---\|---\|` 표 구분선 안전 |
| **R10** | 불릿·번호목록 접두는 **라벨 판정용 사본**에서만 벗긴다(본문 줄은 원형 유지) | `LIST_PREFIX_RE = /^\s*(?:[-*•·‣▪▶►○●◦–—]{1,3}\|\d+[.)])\s*/` | `parser-fill-blank-key.ts:101, 208-209` | `1. 정답:` `– 정답:` `▶ 정답:` 전부 읽힌다 |
| **R11** | ★ **첫매치가 아니라 누적이다.** 같은 라벨이 두 번 나오면 값이 **공백으로 이어 붙는다** | `buckets.sentence.join(" ")` / `buckets.answer.join(" ")` | `parser-fill-blank-key.ts:212-213, 258-262` | **1 md = 1문항 위반의 형상이 다른 유형과 다르다.** 두 문항을 이어 붙이면 `정답 A 정답 B` 로 **합쳐져** 오염된다(probe **E12**) — 조용히 사라지는 게 아니다 |

### 3-B. 섹션별 값 규칙

| # | 규칙 | 원문 | file:line | 어기면 |
|---|---|---|---|---|
| **R12** | **정답 섹션은 한 줄뿐** — 값이 들어온 뒤의 줄은 흡수하지 않고 `droppedLines` 로 뺀다 | `if (current === "answer" && buckets.answer.length > 0) { droppedLines.push(...); continue; }` | `parser-fill-blank-key.ts:241-244` | `정답:` 다음 줄에 부연을 써도 정답이 `adversarial scrutiny 이 표현은 4번째 문장에…` 로 오염되지 않는다 |
| **R13** | **해설 섹션은 마지막이라 종결자가 없다** — 한글 없는 40자 초과 줄에서 닫는다 | `cont.length > 40 && !/[가-힣]/.test(cont)` → `droppedLines`, `current = null` | `parser-fill-blank-key.ts:128-131, 247-251` | 해설 꼬리에 지문을 재출력해도 해설에 실리지 않는다. **역으로: 해설을 영어로만 40자 넘게 쓰면 그 줄이 버려진다** |
| **R14** | 모든 값은 **단일 정리 경로**를 통과한다 | `cleanSealedValue = unsealBlanks(cleanMdValue(stripCellPipes(raw)))`, `cleanMdValue = unwrapQuotes(stripEmphasis(t)).replace(/\s+/g," ").trim()` | `parser-fill-blank-key.ts:108-110` · `decoration.ts:75-78` | 강조 표식 제거 + **값 전체를 감싼 따옴표 한 겹** 제거 + 공백 축약. `정답: "X"` `정답: **X**` `정답: \`X\`` 전부 `X` 로 정리 |
| **R15** | 값 안의 **줄바꿈은 공백으로 접힌다**(버킷 join + `\s+`→` `) | `buckets.sentence.join(" ")` | `parser-fill-blank-key.ts:258` | 빈칸문장을 두 줄로 접어 써도 한 줄로 복원된다. **탭·다중공백도 단일 공백으로** — 지문에 다중공백이 있어도 비교축이 접으므로 안전 |
| **R16** | ★ **빈칸 마커 `_{3,}` 는 강조 제거기로부터 봉인된다** — 낱말에 붙어 있으면 강조, 아니면 마커. 짝 추적으로 `___라벨___:` 의 닫는 런을 가려낸다 | `sealBlanks` / `BLANK_SEAL = ""` / `WORDISH_RE = /[A-Za-z0-9가-힣]/` | `parser-fill-blank-key.ts:61-89, 206` | 문장 **맨 앞**이 빈칸인 경우(`빈칸문장: _____ now anchors…`)에도 마커가 살아남는다. 폭(3·4·5·10)까지 보존 |

### 3-C. 오토스냅(0원 자동 보정) — `autoSnapFillBlankKey`

| # | 보정 | 조건 | file:line |
|---|---|---|---|
| **S0** | 미지 라벨 줄·버려진 줄을 `corrections[]` 로 기록(반려 아님) | 항상 | `:348-353` |
| **S1** | 빈칸 마커 폭 정규화 `____` `__________` → `_____` | 마커가 있으면 | `:356-362` |
| **S2** | 빈칸을 안 뚫은 문장에서 정답 스팬을 `_____` 로 치환 | 마커 0개 **且** 정답이 문장에 **정확히 1회** | `:366-372` |
| **S3** | 정답 꼬리 구두점 절삭 | 절삭본이 **프레임을 복원할 때만** 채택 | `:375-385` |
| **S4** | 관사를 빈칸 **밖**으로 이동 (`_____`(= "the X") → `the _____` + 정답 `X`) | 나머지가 2단어 이상 **且** 마커 1개 **且** 이동 전후 프레임 성립 | `:390-403` |
| **S5** | 허용답 절삭 — 정답의 **표기 변형이 아닌** 원소를 폐기 + 기록 | `orthographicKey(raw) !== orthographicKey(answer)` | `:405-423` |

> **스냅에 기대지 마라.** S2·S4 는 프레임이 이미 성립할 때만 동작한다. probe **E4** 실측:
> 빈칸 **밖**에 이미 `the` 가 있는데 정답을 `the mental cost of comparison` 으로 쓰면 스냅이 구제하지 못하고
> 「관사로 시작」 + 「되끼운 문장이 지문에 없음」 **2건**으로 반려된다.
> 보정이 일어나면 하네스가 `AUTOSNAP` **경고**로 기록한다(`qgen-core.ts:313`).

### 3-D. 비교축 — 게이트 전역이 **하나의 폭**을 쓴다

| # | 규칙 | 원문 | file:line |
|---|---|---|---|
| **R17** | 축자 대조 비교축 = `normalizeWs` + **소문자화** | `fillBlankKeyComparable(v) = normalizeWs(v).toLowerCase()` | `parser-fill-blank-key.ts:45-47` |
| **R18** | `normalizeWs` 가 흡수하는 것 = **곱슬따옴표 → 곧은따옴표 · en/em dash → `-` · `…` → `...` · 공백 축약** 뿐 | `parser.ts:67-74` | 00-contract §5 |
| **R19** | 프레임 복원문 = 마커에 정답을 되끼운 뒤 **구두점 앞 공백 제거 + 양끝 따옴표/마침표/말줄임 절삭 + trim** | `restoreFillBlankKeySentence` | `parser-fill-blank-key.ts:276-285` |
| **R20** | 정답 등장 판정 정규식은 **양방향 변종 문자군**으로 되펼친다 | `` (?<![A-Za-z]){body}(?![A-Za-z]) `` (`gi`), body 안에서 `'`→`['’ʼ‛]`, `"`→`["“”]`, `-`→`[-–—]`, `\s+`→`\s+`, `...`→`(?:\.\.\.\|…)` | `parser-fill-blank-key.ts:448-458` |

> ★ 결론: **G6(프레임)·G7(축자)·G16(인용)이 전부 같은 폭으로 접힌다.** 곱슬 아포스트로피 지문에 곧은 따옴표 정답을 써도,
> en 대시 지문을 하이픈으로 인용해도 통과한다. **대소문자 차이도 게이트는 통과시킨다**(ANTONYM 의 `normalizeWs` 대조와 다르다) —
> 그러나 저작 규칙은 **축자 그대로**다(학생 표면·채점 표면이 갈린다).

### 3-E. 인라인 마커

이 유형은 `[[A:표현]]` 계열 마커를 **쓰지 않는다.** 유일한 인라인 문법은 **빈칸 마커 `_____`(언더스코어 3개 이상)** 하나뿐이다
(`prompts-fill-blank-key.ts:28` `FILL_BLANK_KEY_MD_BLANK = "_____"`, 게이트 판정은 `/_{3,}/` — `gate-fill-blank-key.ts:199`).

---

## 4. 게이트 체크리스트

### 4-1. `gateMdFillBlankKey` 반려 사유 전수 — `src/lib/md-qgen/gate-fill-blank-key.ts:160-324`

옵션 2개(`requireExplanation`·`forbidFirstSentence`)는 **레인이 넘기지 않으므로 둘 다 기본 true**(`lane-fill-blank-key.ts:78`).

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| ``빈칸문장 누락 — `빈칸문장:` 줄이 없거나 값이 비어 있음`` | `swb` 빈값 | `:174` |
| ``정답 누락 — `정답:` 줄이 없거나 값이 비어 있음`` | `answer` 빈값 | `:175` |
| ``해설 누락 — `해설:` 줄이 없거나 값이 비어 있음`` | `explanation` 빈값 (requireExplanation 기본 true) | `:176` |
| ``파서가 읽지 못한 라벨 줄 {n}개 — 계약 라벨은 `빈칸문장:` `정답:` `해설:` 셋뿐이다: "…"`` | **다른 반려가 이미 1건 이상 있을 때만** + `unknownLabelLines.length > 0` | `:186-193` |
| — (**이후 검사 전면 중단**) | `!swb \|\| !answer` → 즉시 return | `:196` |
| `빈칸문장에 빈칸 마커(_____)가 없음 — 정답 스팬을 _____ 로 바꿔라` | `(swb.match(/_{3,}/g) ?? []).length === 0` | `:199-203` |
| `빈칸문장에 빈칸이 {n}개 — 단일 정답 유형이므로 정확히 1개여야 한다(…)` | 마커 2개 이상 | `:204-208` |
| `정답이 {n}단어 — … 핵심 표현(2~7단어 콜로케이션)이어야 한다. 단어 하나만 비우면 동의어가 다 맞아 채점이 무너진다` | `wordCount(answer) < 2` | `:212-215` (`FILL_BLANK_KEY_MD_WORD_MIN=2`, `prompts:31`) |
| `정답이 {n}단어 — 문장을 통째로 비운 셈이라 복원 불가다(2~7단어로 스팬을 좁혀라)` | `wordCount(answer) > 7` | `:216-219` (`WORD_MAX=7`, `prompts:32`) |
| `정답에 문장부호·괄호·따옴표가 포함됨 — 어구만 써라: '…'` | `/[_"“”()[\]{}<>;:]/.test(answer)` | `:56, 221-223` |
| `정답이 문장부호로 끝남 — 구두점은 빈칸 밖에 남겨라: '…'` | `/[.,;:!?]$/.test(answer)` | `:224-226` |
| `정답이 관사로 시작함('…') — 관사는 빈칸 밖에 남겨라. 학생이 관사를 쓸지 말지로 채점이 갈린다` | `/^(a\|an\|the)\s/i.test(answer)` | `:227-231` |
| `빈칸문장에서 빈칸을 뺀 단어가 {n}개뿐 — 문맥이 정답을 지목하지 못한다(원문 문장 전체를 그대로 옮겨라)` | 프레임 단어 < **4** | `:35, 236-240` |
| `빈칸문장이 {n}단어 — 지문의 '한 문장'만 옮겨야 한다(문단을 통째로 붙여넣지 마라)` | 프레임 단어 > **60** | `:37, 241-245` |
| `빈칸문장이 문장 {n+1}개를 이어 붙임 — 지문의 한 문장만 옮겨라(문장 경계 {n}곳 발견)` | `internalSentenceBreaks(swb) > 0` | `:92-102, 246-251` |
| `빈칸문장 복원 실패 — 빈칸에 정답을 되끼운 문장을 만들 수 없음` | 마커 1개인데 복원문이 빈 문자열 | `:259-260` |
| **`빈칸에 정답('…')을 되끼운 문장이 지문에 없음 — … 철자·구두점·어형을 손대지 마라: "…"`** | `!passageComparable.includes(restored)` — **이 유형 최강 게이트(G6)** | `:261-264` |
| `빈칸을 지문 첫 문장에 뚫었다 — 앞 문맥이 없어 정답이 유일하게 지목되지 않는다. 논지가 전개된 뒤의 문장을 골라라` | `passageComparable.indexOf(restored) === 0` | `:265-268` |
| `정답('…')이 지문에 축자로 없음 — 이 유형의 정답은 지문에 실제로 있는 표현이어야 한다` | `countFillBlankKeyAnswerOccurrences === 0` | `:273-277` |
| **`정답('…')이 지문에 {n}회 등장 — 빈칸 처리 뒤에도 본문에 정답이 남아 학생이 찾아 베낀다. 지문에서 한 번만 나오는 표현을 골라라`** | 등장 횟수 > 1 | `:278-282` |
| `정답('…')이 빈칸문장에 그대로 남아 노출됨 — 그 스팬을 _____ 로 바꿔라` | `answerBoundaryRegex(answer).test(swb)` | `:285-289` |
| `정답이 자음골격/언더스코어 난독으로 빈칸문장에 노출됨 — 빈칸은 _____ 로만 표기하라` | `deobf !== swb` **且** deobf 에 정답 등장 | `:293-298` |
| `해설에 한국어가 없음 — 해설은 한국어(합니다체)로 쓴다` | `!containsHangul(explanation)` | `:302-304` |
| `해설이 {n}자 — 계약은 '딱 2문장'(400자 이내)이다. 지문이나 군더더기가 섞였는지 확인하라: "…"` | `explanation.length > 400` | `:39, 307-311` |
| `해설이 지문을 연속 30단어 이상 그대로 옮겨 실었다 — 지문 인용은 한 조각 12단어 이내로 줄이고 나머지는 한국어로 설명하라: "…"` | 표적 문장(복원문) 겹침 구간은 **면제** | `:53, 134-150, 312-318` |
| `해설이 인용한 영어 표현이 지문·빈칸문장·정답 어디에도 없음(환각 인용): "…"` | 따옴표 안 영어 조각이 **12자 이상**인데 코퍼스에 부재. 코퍼스 = `지문 + 빈칸문장 + 정답` | `:58-60, 105-122, 319-320` |

**문장 경계 판정 세부**(`internalSentenceBreaks`, `:92-102`): `([A-Za-z0-9.'’]+)[.!?]["'”’)\]]?\s+(?=[A-Z“"'(])` 매칭 중
① 1글자 이니셜(`J. Smith`) ② **내부 점이 있는 약어**(`U.S.` `Ph.D.` `N.A.S.A.` `a.k.a.` — `isDottedAbbreviation :85-89`)
③ 약어 목록 23개(`mr mrs ms dr prof st vs etc fig no jr sr approx dept est ex al eg ie cf inc ltd co` — `:69-72`)를 제외한 나머지를 경계로 센다.

### 4-2. `validateQuestionQuality` — **프로덕션은 비차단, qbank 하네스는 차단**

라우트는 기록만 하지만(00-contract §2), `qgen-core.ts:311` 이 `qualityBlocking` 으로 **차단**한다.
FILL_BLANK_KEY 레인은 `filterQualityIssues` 를 정의하지 않으므로 **전 코드가 그대로 산다.**

| 코드 | severity | 조건 | file:line |
|---|---|---|---|
| `fbk-multiple-blanks` | error | 렌더 본문(`passageWithBlank` 우선, 없으면 `sentenceWithBlank`)에 `_{3,}` 2개 이상 | `validators/blank/fill-key.ts:20-32` |
| `fbk-answer-residual-leak` | **error**(다토큰) / warning(단일토큰) | 렌더 본문에 정답이 단어경계로 잔존 | `:34-53` |
| `fbk-direction-word-count-mismatch` | error | 발문이 "N단어" 를 명시했는데 정답 단어 수 불일치. **어댑터 발문 상수에는 수량 표현이 없어 미발화** | `:55-91` |
| `fbk-missing-blank-marker` | error | `sentenceWithBlank` 에 `_{3,}` 없음 | `:96-103` |
| `fbk-frame-altered` | error | 복원문(20자 이상)이 원문에 부재 — G6 의 검증기 대응물 | `:114-138` |
| `fbk-answer-skeleton-leak` | error | 자음골격/언더스코어 난독 복원 시 정답 토큰열 노출 | `:139-151` |
| `explanation-foreign-script` | error | 해설에 비한글 CJK(한자·가나·중문 구두점). 한글 직후 괄호 병기만 예외 | `validators/explanation-foreign-text.ts:99-105` |
| `explanation-latin-jam` | error | 해설에 `영단어+다` 직접 접합(`steals다`) | `:108-114` |
| `explanation-quoted-token-missing` | error | 해설이 따옴표 인용한 **12자 이상** 영어 조각이 문항 표면 전체(지문 + 문항 JSON 문자열 리프)에 부재 | `validators/explanation-quoted-tokens.ts:117-162` |
| `passage-boundary-spacing-corruption` / `passage-duplicate-sentence` / `passage-joined-sentence-token` | error | **지문 자체**의 무결성 — 유형 무관, 문항마다 재발화 | `dispatcher.ts:790-793` · `passage-integrity.ts:59,79,99` |
| `difficulty-mismatch` | warning | `requestedDifficulty !== question.difficulty` | `dispatcher.ts:796-798` |
| `thin-killer-explanation` | warning | KILLER 인데 해설 80자 미만 | `validators/misc.ts:72-74` |
| **`few-key-points`** | warning | KILLER 인데 `keyPoints.length < 3` — 어댑터가 `keyPoints: []` **고정**이라 **KILLER 문항마다 항상 발화**(차단 아님, probe P3 실측) | `validators/misc.ts:79-81` · `adapter-fill-blank-key.ts:175` |

**미발화 확정**: `validateOptions` 는 `options` 가 비-배열/빈배열이면 **즉시 return** 하므로(`validators/options.ts:122-129`) 선지 계열 코드는 나오지 않는다.
`validateTypeSignature` 의 `TYPE_SIGNATURE_FOREIGN_FIELDS` 에 FILL_BLANK_KEY 항목이 **없어**(`validators/misc.ts:25-33`) `type-foreign-field` 도 안 나온다 —
그래도 어댑터가 이물 필드를 막는다(§5).

### 4-3. 하네스 유닛 레벨 차단 코드 — `qbank/harness/qgen-core.ts`

| 코드 | 조건 | file:line |
|---|---|---|
| `UNSUPPORTED_LANE` | 레지스트리 미등록 (FILL_BLANK_KEY 는 **등록됨** — `lane-registry.ts:40,71`) | `:216` |
| `CONTAINER` | `<!-- ITEM n -->` 결측·번호 비연속·`point:` 누락·본문 공백·`settings` JSON 파싱 실패 | `:227`, `splitItems :49-99` |
| `ITEM_COUNT` | 문항 수 < `minItems`(기본 5) | `:233` |
| `GATE` | `gateMdFillBlankKey` 이슈 전수 | `:306` |
| `ADAPT` | 어댑터 실패(빈칸문장 누락 / 정답 누락 / 빈칸 마커 없음) | `:308` · `adapter-fill-blank-key.ts:154-158` |
| `POSTPROCESS` | `processFillBlankKey` 실패 — ⚠ **이 프로세서는 항상 `success: true`** 다. 정답을 못 찾아도 `warnings` 만 남기고 통과시킨다 | `:310` · `processors/fill-blank-key.ts:21-43` |
| `POINT_DUPLICATE` | 유닛 내 `point:` 정규화 문자열 중복 | `:329` |
| **`ANSWER_DUPLICATE`** | **`diversityTargets` 중복 — FILL_BLANK_KEY 는 「정답 문자열 1건」이 targets 다** | `:349` · `lane-fill-blank-key.ts:109-116` |

> ★ `POSTPROCESS` 는 이 유형에서 **사실상 무력하다.** 후처리가 지문에서 정답을 못 찾으면 `passageWithBlank` 를 만들지 않고
> `Could not find FILL_BLANK_KEY answer in passage: "…"` 경고만 남긴 채 성공으로 반환한다(`processors/fill-blank-key.ts:35-43`).
> 그 경우 학생 화면은 지문 전체가 아니라 **`sentenceWithBlank` 한 문장으로 축소**된다(`student-safe-data.ts:361-366`).
> G6·G7 을 통과했다면 후처리도 반드시 찾으므로 정상 경로에서는 발생하지 않는다(probe P8: 5문항 전부 `warnings 0`).

---

## 5. adapter 산출 필드

`adaptMdFillBlankKeyToAiQuestion` (`src/lib/md-qgen/adapter-fill-blank-key.ts:143-180`)
→ `postProcessQuestion("FILL_BLANK_KEY", …)` → `processFillBlankKey` (`processors/fill-blank-key.ts:4-53`).

### 어댑터가 만드는 것

| 키 | 타입 | 의미 | file:line |
|---|---|---|---|
| `direction` | string | **고정 발문 상수** `"다음 빈칸에 들어갈 알맞은 말을 본문에서 찾아 쓰시오."`. `stemLanguage:"en"` 이면 `"Write the expression from the passage that best fits the blank."` 로 교체 | `:36-40, 163` · `lane-fill-blank-key.ts:88-90` |
| **`sentenceWithBlank`** | string | **이 유형 고유.** `빈칸문장:` 값. 저장 직전 `cleanFillBlankKeyValue` 로 한 번 더 씻는다(PASSTHROUGH 라 후처리가 안 씻어 준다) | `:151, 164` |
| **`answer`** | string | **정답의 유일한 진실원.** 채점 필드 키가 `"answer"` 다 | `:152, 165` · `answer-spec.ts:292-300` |
| **`acceptedAnswers[]`** | string[] | **이 유형 고유.** `[정답, …결정론 축약형 파생(최대 4), …스냅 통과 모델 제공분]`. **정답이 항상 선두** | `:126-141, 166-169` |
| `correctAnswer` | string | `answer` 의 **사본**(스키마 `commonAnswerField`) | `:171` |
| `explanation` | string | `해설:` 값(장식 정리 후) | `:172` |
| `keyPoints` | `[]` | **합성 금지**(정본 규약) — KILLER 에서 `few-key-points` 경고를 상시 유발하지만 의도된 것 | `:173-175` |
| `tags` / `difficulty` | `[]` / string | ITEM 헤더의 `difficulty` 가 그대로 실린다 | `:176-177` |

**금지 키(어댑터가 구조적으로 차단)** — `adapter-fill-blank-key.ts:10-15`:
- `options` — **키 자체를 두지 않는다**(`undefined` 도 아니다). 두면 `correct-answer-mismatch` 발화 위험.
- `passageWithBlank` — **후처리 전담**. 어댑터가 만들면 이중 생성 충돌.
- `blanks` · `markedWords` · `originalExpression` · `scrambledWords` · `modelAnswer` — 타 유형 필드.

### 후처리가 추가하는 것

| 키 | 값 | file:line |
|---|---|---|
| **`passageWithBlank`** | 원지문에서 `findExpressionInPassage(passage, answer, reconstructedContext)` 로 찾은 스팬 1곳만 `_____` 로 치환한 **지문 전문** | `processors/fill-blank-key.ts:29-51` |

`reconstructedContext = sentenceWithBlank.replace(/_{3,}/g, answer)` 가 위치 힌트로 쓰인다(`:17-19`) —
그래서 **빈칸문장이 원문 축자여야 후처리가 올바른 자리를 뚫는다.**
탐색 전략은 ①문맥창 ②exact ③대소문자 무시 ④정규화 순(`text-utils.ts:195-247`).

**셔플 없음** — 선지가 없으므로 `shuffleQuestionOptionsForDiversity` 는 무해 통과.
저장 시 `structuredData` = 위 산출 + `_typeId`/`_typeLabel`/`_generationPlan`/`difficulty` + tags (00-contract §11).
`type` 은 `Array.isArray(q.options)` 가 false 이므로 **`SHORT_ANSWER`** 로 저장된다(00-contract §11).

### 채점 왕복 (서술형 계열의 핵심 축)

`buildAnswerSpec` → `inputKind: "TEXT_SINGLE"` · `textMode: "EXACT"` · `fields[0] = {key:"answer", label:"답", answers: [정답, ...acceptedAnswers]}` (`answer-spec.ts:292-300`).
`gradeAnswer` 는 `normalizeText` 후 집합 완전일치만 본다 — **대소문자·문말 구두점·앞뒤 공백·스마트따옴표는 CORRECT, 동의어·관사 추가는 WRONG**
(`scripts/_test-md-fill-blank-key.ts:1184-1190` 실측).

---

## 6. 생성 노브

★ **이 유형에는 유형 전용 설정 노브가 하나도 없다.** `resolveQuestionTypeGenerationSettings` 에 FILL_BLANK_KEY 분기가 없어
generic 폴백으로 떨어지고(`dispatchers.ts:353-360`), `supportsGenericOptionCount` 목록에도 없다(`generic.ts:23-35`).
그래서 `isEligible` 은 **항상 true** 이고(`lane-fill-blank-key.ts:54-56`), **난이도 3분기의 유일한 집행 지점은 프롬프트**다.

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `difficulty` (ITEM 헤더) | `BASIC\|INTERMEDIATE\|KILLER` | `INTERMEDIATE` (`qgen-core.ts:89`) | 3값 | **형식 무영향**(3줄 동일, probe P7). 프롬프트 분기 = 표적 설계 블록(`prompts:55-71`) + few-shot 유무(BASIC 만 제거, `:116`) + 정답 단어수 권장(`2~3` / `3~4` / `2~5`, `:118-119`). **게이트 폭은 난이도와 무관하게 2~7 고정.** 저장 `difficulty` 값과 `validateKillerBar` 발화 여부만 실제로 바뀐다 |
| `stemLanguage` | `"ko"\|"en"` | `"ko"` (`language.ts:39`) | 2값 | **형식 무영향.** `direction` 상수만 영문으로 교체되고 **해설은 한국어 유지**. 토글 scope 는 `'stem'`(`language.ts:75-77`)이라 `optionLanguage` 는 무의미. 표기는 평면(`{"stemLanguage":"en"}`)·중첩(`{"FILL_BLANK_KEY":{"stemLanguage":"en"}}`) 둘 다 읽힌다(`language.ts:107-127`, probe P6) |
| `mode`(MdExplanationMode) | `"full"\|"answer-only"` | `"full"` | 2값 | 레인이 **항상 `"full"` 로 고정 호출**한다(`lane-fill-blank-key.ts:59`) → 실질 조작 불가. `answer-only` 면 해설이 1문장 계약이 되지만 도달 경로가 없다 |
| `variantIndex` / `variantCount` | number | 0 / 1 | — | **이 레인은 사용하지 않는다.** `buildExtras` 가 `stemLanguage` 만 본다(`lane-fill-blank-key.ts:62-72`) |
| `teacherPoints` | `{text}[]` | `[]` | — | **미지원.** `POINT_PICKER_CONFIG` 미등재라 항상 빈 배열이고 준수 게이트도 없다(`lane-fill-blank-key.ts:16-18`) |

**과금 축**: `QUESTION_GEN_SINGLE` — 어휘 3종(`CONTEXT_MEANING`·`SYNONYM`·`ANTONYM`)이 아니다(`lane-fill-blank-key.ts:48`).
**재생성**: `retryEligible: true` (`:51`) — 웹 경로 한정. 하네스에는 재생성이 없다(00-contract §2).
**mdFormat 포렌식**: `{sections:["빈칸문장","정답","해설"], blankCount:1, acceptedAnswers:"derived", stemLanguage}` (`:98-107`).

---

## 7. 함정 (전부 코드 근거 + probe 실증)

| # | 함정 | 결과 | 근거 |
|---|---|---|---|
| **T1** | 서술형이라고 `모범답안:` 을 씀 | **정답 누락** + 「읽지 못한 라벨 줄」. 이 유형의 머리표는 `정답:` 이다 | `parser-fill-blank-key.ts:143` · probe **E11** |
| **T2** | 지문 **첫 문장**에 빈칸 | `빈칸을 지문 첫 문장에 뚫었다` — 다른 게이트를 다 통과해도 여기서 죽는다 | `gate:265-268` · probe **E1** |
| **T3** | 정답을 **1단어**로(형용사·일반동사 하나) | `정답이 1단어` 반려. 게이트 이전에 **채점이 무너지는 설계**다(important/crucial/vital 이 다 맞는다) | `gate:212-215` · `prompts:79` · probe **E2** |
| **T4** | 정답에 관사 포함(`the mental cost of comparison`) | 빈칸 밖에 이미 `the` 가 있으면 스냅이 구제 못 하고 **「관사로 시작」+「지문에 없음」 2건** | `gate:227-231, 261-264` · probe **E4** |
| **T5** | 빈칸문장을 옮기며 **한 단어라도 손질**(`grows faster`→`grows more quickly`) | `되끼운 문장이 지문에 없음` — 최강 게이트 G6 | `gate:261-264` · probe **E5** |
| **T6** | 두 문장을 이어 붙여 빈칸문장으로 | `문장 2개를 이어 붙임`. ⚠ `U.S.`·`Ph.D.` 는 경계로 세지 않으므로 **정상 한 문장은 오탐되지 않는다** | `gate:246-251, 85-89` · probe **E6** |
| **T7** | 빈칸을 2곳 뚫음(다중 빈칸 습관) | `빈칸이 2개` — 이 유형은 **단일 정답 전용** | `gate:204-208` · probe **E7** |
| **T8** | 지문에 **2회 이상 등장**하는 표현을 정답으로 | `{n}회 등장 — 학생이 찾아 베낀다`. 후처리가 첫 등장만 빈칸 처리하므로 본문에 정답이 남는다 | `gate:278-282` · `processors/fill-blank-key.ts:49` · probe **E8** |
| **T9** | 해설을 영어로 씀 | `해설에 한국어가 없음`. 게다가 **한글 없는 40자 초과 줄은 파서가 아예 버린다** | `gate:302-304` · `parser:247-251` · probe **E9** |
| **T10** | 해설에 지문에 없는 영어를 따옴표 인용 | `환각 인용`. **12자 이상 조각만** 검사하므로 짧은 인용은 통과하지만, `explanation-quoted-token-missing`(품질)이 이중으로 본다 | `gate:105-122` · `explanation-quoted-tokens.ts:117-162` · probe **E10** |
| **T11** | 해설이 400자 초과 / 지문을 연속 30단어 재출력 | `딱 2문장` / `30단어 이상`. **표적 문장 인용은 면제**되지만 다른 문장 전문을 옮기면 걸린다 | `gate:307-318` · probe **E13/E14** |
| **T12** | 해설에 `…라는 뜻이다` 대신 `…라는 뜻steals다` 류 접합, 한자·가나 혼입 | `explanation-latin-jam` / `explanation-foreign-script` — **md 게이트에는 없고 품질 검증기에만 있다**(게이트만 돌리면 못 본다) | `explanation-foreign-text.ts:99-113` |
| **T13** | 한 `.md` 에 여러 문항을 ITEM 헤더 없이 이어 붙임 | ★ **다른 유형과 형상이 다르다.** 파서가 첫매치가 아니라 **버킷 누적**이라 `정답: A B` 로 **합쳐진다**. 게이트가 반려하긴 하지만 원인 메시지가 엉뚱해진다 | `parser:212-213, 258-262` · probe **E12/E12'** |
| **T14** | 머리표에 굵게·헤딩·불릿을 씀 | **이 유형은 흡수한다**(probe E15 통과). 그러나 ANTONYM·정본 파서는 **죽는다** — 유형별로 관용 범위가 다르므로 전 유형 공통 규칙은 **장식 0** | `decoration.ts:81-99` vs 00-contract §8 |
| **T15** | `허용답:` 칸을 만들어 동의어를 넣음 | 스냅이 **표기 변형이 아닌 원소를 전량 폐기**하고 `corrections` 로 기록. 폐기되지 않으면 **지문에 없는 표현을 쓴 학생이 만점**을 받는 되돌릴 수 없는 채점 사고 | `parser:405-423` · `adapter:17-25` |
| **T16** | 유닛 내 두 문항이 **같은 표현**을 비움 | `ANSWER_DUPLICATE` — `diversityTargets` 가 정답 문자열이므로 정규화(소문자·비문자 제거) 후 완전일치면 유닛 전체 반려 | `lane:109-116` · `qgen-core.ts:349` · probe **P4** |
| **T17** | 빈칸문장을 **문장 일부(절)** 만 옮김 | 프레임 단어 4개 이상이면 게이트는 **통과한다**(부분 문자열이므로 G6 도 통과). 그러나 학생이 보는 것은 `passageWithBlank`(지문 전문)라 문제가 되지 않는 대신, **유일 지목 근거가 얇아진다** — 규범상 한 문장 전체를 옮겨라 | `gate:236-240` · `prompts:83` |
| **T18** | 정답 대소문자를 지문과 다르게 씀 | 게이트는 **통과한다**(비교축이 소문자화). 그러나 `answer` 는 그대로 저장돼 강사 표면에 노출된다 — 축자로 써라 | `parser:45-47` |
| **T19** | 정답에 콜론·세미콜론·괄호가 든 스팬 선택 | `정답에 문장부호·괄호·따옴표가 포함됨`. **쉼표·마침표·하이픈·아포스트로피는 금지 문자에 없다**(꼬리 구두점만 별도 반려) | `gate:56, 221-226` |
| **T20** | KILLER 인데 해설이 80자 미만 | `thin-killer-explanation` **경고**(차단 아님). `few-key-points` 는 `keyPoints:[]` 고정이라 **KILLER 마다 항상** 뜬다 — 경고 노이즈를 결함으로 오독하지 마라 | `validators/misc.ts:72-81` · probe **P3** |

---

## 8. 출제 포인트 다각화 축

> **선행 제약을 먼저 계산하라.** 이 유형은 다각화 이전에 **표적 문장 예산**이 유닛 규모를 결정한다.

### 8-0. ★ 표적 예산 (하드 제약, 코드 근거)

한 문항이 성립하려면 표적 문장·정답 스팬이 아래를 **동시에** 만족해야 한다.

| 조건 | 근거 |
|---|---|
| 지문 **첫 문장이 아닐 것** | `gate:265-268` |
| 정답 스팬이 지문 전체에서 **정확히 1회** 등장 | `gate:278-282` |
| 정답이 **2~7단어**, 관사·구두점 제외 | `gate:212-219` |
| 빈칸 뺀 프레임이 **4~60단어**, 문장 경계 0 | `gate:236-251` |
| 유닛 내 **모든 문항의 정답이 서로 다를 것** | `qgen-core.ts:349` · `lane:109-116` |
| 유닛 내 **모든 `point:` 가 서로 다를 것** | `qgen-core.ts:329` |

→ **5문항 유닛 = 서로 다른 표적 스팬 5개**, 8문항이면 8개. 같은 문장에서 서로 다른 스팬 2개를 비우는 것은 **형식상 가능하지만**
(정답이 다르면 `ANSWER_DUPLICATE` 미발화) 헌법 §7 「1개 문항의 N개 사본」에 걸린다 — **문항마다 다른 문장**을 기본으로 삼아라.

**저작 절차 1단계 = 예산 실사.** 지문에서 「첫 문장 제외 · 2~7단어 콜로케이션이 있고 · 그 콜로케이션이 지문에 1회만 나오는」 문장을 먼저 전부 세라.
probe 실측 지문(8문장·142단어)에서 후보 문장은 7개, 그중 §1의 2조건(유일 지목 + 축자 부재)을 만족한 것은 5개였다.
**예산이 모자라면 문항 수를 줄여 보고하라**(헌법 §9-10: 수량으로 품질을 상쇄하지 않는다).

### 8-A. 노브로 달라지는 축 (코드 근거)

| 축 | 조작 | 코드 근거 | 실효 |
|---|---|---|---|
| **A1 난이도** | ITEM `difficulty:` | `prompts:55-71, 116-119` · `validateKillerBar` | **형식은 안 바뀐다.** 저장 `difficulty` + 근거 깊이 규범(BASIC 1문장 / INTERMEDIATE 2문장 / KILLER 흩어진 2문장 이상)만 바뀐다. 헌법 §4 배분(5문항 = BASIC 1 / INTERMEDIATE 2 / KILLER 2) 준수 |
| **A2 정답 길이** | 설계값 (게이트 2~7, 난이도 권장 2~3 / 3~4 / 2~5) | `gate:212-219` · `prompts:118-119` | 2단어와 5단어는 **학생 작업이 다르다** — 2단어는 콜로케이션 재인, 5단어는 구 전체 재구성. 유닛 안에서 길이를 흩어라 |
| **A3 발문 언어** | `settings: {"stemLanguage":"en"}` | `lane:64-70, 88-90` | 발문만 영어. **유닛 전체를 한 축으로 통일**하는 편이 낫다 |

> 노브 축이 3개뿐이고 그중 형식을 바꾸는 것은 **하나도 없다.** → **이 유형의 다각화는 전부 §8-B 설계 축에서 나온다.**

### 8-B. 설계로 달라지는 축 (교육적 판단) — 이 유형의 승부처

#### B1. 표적 문장의 **논지 위치** (최우선 축)

| 위치 | 표적 성격 | 난이도 적성 | 학생이 하는 일 |
|---|---|---|---|
| **P1 통념 진술부**(도입 2~3번째 문장) | 글이 반박하려는 통념의 핵심어 | BASIC | 뒤 문장의 반박을 읽고 통념을 복원 |
| **P2 전환점**(`however`/`what … overlooks` 이후) | 통념이 놓친 것을 **처음 명명**하는 어구 | INTERMEDIATE | 앞의 통념과 뒤의 설명을 이어야 확정 |
| **P3 기제 설명부** | 인과가 작동하는 방식을 서술하는 동사구 | KILLER | 원인·결과 두 문장을 종합 |
| **P4 사례·근거부** | 실험·관찰 결과를 요약하는 어구 | INTERMEDIATE | 사례와 주장의 대응 확인 |
| **P5 귀결·결론부**(마지막 1~2문장) | 글 전체가 압축되는 어구 | BASIC(앞이 풀어 썼을 때) / KILLER(추상화 1단계) | 전체 논지를 한 어구로 |

→ **5문항이면 P1~P5 를 1:1 배분하는 것을 기본값으로 삼아라.** 부수 효과로 `ANSWER_DUPLICATE`·`POINT_DUPLICATE` 가 자동 회피된다.

#### B2. 빈칸 스팬의 **통사 범주** — 학생 작업이 근본적으로 달라진다

| 범주 | 예 | 통사 구속 장치 | 위험 |
|---|---|---|---|
| **S1 명사구(핵심 개념 명명)** | `the _____, which grows faster…` | 뒤 관계절이 단수 명사구 강제 | 가장 안전. 정답 유일성 확보 쉬움 |
| **S2 동사구(기제 서술)** | `a shopper must _____ that did not exist…` | 조동사 뒤 + 목적어 관계절 | 시제·수 형태가 고정되어야 함 |
| **S3 전치사구·부사구** | `lingered as a _____` | 전치사가 명사구 강제 | 짧아지기 쉬움 → 1단어 반려 주의 |
| **S4 술어 전체(be보어)** | `is valuable only when someone else has _____` | 완료 조동사 뒤 | 길어지기 쉬움 → 7단어 상한 주의 |
| **S5 복합 명사구(수식어 포함)** | `absorbed the work of elimination` | — | 5단어 이상 → KILLER 전용 |

→ **문항마다 범주를 바꿔라.** 같은 범주 2회까지 허용, 3회부터는 「사본」이다.
⚠ **금지 표적**(`prompts:70`): 숫자·고유명사·연도·단순 연결어(however/therefore)·장식 수식어.
지우고도 문장 의미가 멀쩡한 자리는 표적이 아니다.

#### B3. **근거 배치** — 정답을 지목하는 단서가 어디 있는가 (난이도의 실체)

| 배치 | 설계 | 난이도 |
|---|---|---|
| **E1 바로 앞 문장이 다른 말로 풀어 놓음** | 인접 문장 1개로 확정 | BASIC (`prompts:57`) |
| **E2 앞뒤 두 문장을 인과/대조로 이어야 확정** | 빈칸 문장 하나만으로는 안 채워짐 | INTERMEDIATE (`prompts:62`) |
| **E3 근거가 서로 떨어진 두 문장 이상에 흩어짐** | 도입부 통념 + 결론부 귀결을 종합 | KILLER (`prompts:67`) |
| **E4 대명사·지시어 되받기** | 뒤 문장이 `that borrowing`·`the second` 처럼 정답 어구를 대명사로 되받음 | INTERMEDIATE~KILLER (`prompts:80`) |
| **E5 관용 콜로케이션 구속** | 대체어가 존재하지 않는 결합(`done the sorting`) | BASIC~INTERMEDIATE (`prompts:80`) |

> ★ **유일 지목은 KILLER 에서도 타협 불가다**(`prompts:69`). 이 유형에서 어려워야 하는 것은 **"찾기"이지 "맞히기"가 아니다.**
> 여러 표현이 다 들어맞는 자리는 어려운 문항이 아니라 **고장 난 문항**이다 — 자동채점이 축자 일치이므로 동의어를 쓴 상위권 학생이 0점을 받는다.

#### B4. **근접 오답 예상** — 선지가 없는 유형의 오답 공학 (헌법 §3 의 이 유형 번안)

선지가 없으므로 (L,F) 팔레트를 **오답 설계**가 아니라 **표적 검증**에 쓴다(`prompts:74-80`).
표적을 정한 뒤 **학생이 쓸 법한 표현 3개**를 실제로 떠올려 아래로 분류하라.

| 판정 | 조건 | 조치 |
|---|---|---|
| **합격** | 셋 다 의미가 어긋난다 | 문맥이 유일 지목하고 있다는 증거 |
| **실격** | 셋 중 하나가 **정답과 의미가 같은데 표기가 다르다**(동의어·어순 변형·관계사 치환 in which↔where) | **표적 재선정.** 채점이 무너진다 |

문항마다 **떠올린 3개와 각각이 어긋나는 이유**를 `craft:` 에 남겨라 — 검수 렌즈 ①(블라인드 풀이)의 판정 근거가 된다.

#### B5. 해설의 **근거 제시 형식** (문항마다 달리해 학습 자료로 기능하게)

| 형식 | 예 | 제약 |
|---|---|---|
| **X1 인접 문장 지목** | "바로 앞 문장이 …라고 서술하므로" | 가장 흔함. 3회 이상이면 단조롭다 |
| **X2 축자 인용 동반** | `앞 문장이 "an extra choice can be ignored" 라고 서술해` | 인용은 **한 조각 12단어 이내**, 지문 축자 그대로(`prompts:142` · `gate:312-320`) |
| **X3 논지 구조 지목** | "이 문장은 글의 결론으로 …를 한정합니다" | 위치 P5 와 궁합 |
| **X4 통사 구속 지목** | "빈칸 뒤 관계절이 단수 명사구를 요구하므로" | KILLER 에서 유일성 방어에 유효 |

**공통 제약**: 한국어 합니다체 2문장 · 400자 이내 · 비한글 CJK 금지 · `영단어+다` 접합 금지 · 지문 연속 30단어 재출력 금지.

#### B6. `point:` 문자열 설계 (하네스가 결정형으로 강제)

`POINT_DUPLICATE` 는 정규화(소문자·비문자 제거) 후 **완전일치**만 본다(`qgen-core.ts:379-384`).
→ 문자열만 바꿔 우회하지 마라. `point:` 는 **B1 위치 + B3 근거배치 + 정답 표적**을 담아 쓴다.
예: `반론의 핵심 — 통념이 놓친 비용을 처음 명명하는 자리`

### 8-C. 5문항 유닛 설계표 (probe 로 gate 0 · quality 0 실증된 실물)

지문: probe `PASSAGE` (선택지 과잉의 역설, 8문장 142단어).

| # | difficulty | 위치(B1) | 통사 범주(B2) | 근거 배치(B3) | 정답 | 단어수 |
|---|---|---|---|---|---|---|
| 1 | BASIC | P5 결론부 | S4 완료 조동사 뒤 | E1+E5 (앞 문장이 풀어 씀 + 관용 결합) | `done the sorting` | 3 |
| 2 | INTERMEDIATE | P2 전환점 | S1 명사구 | E2 (앞 통념 + 뒤 설명) | `mental cost of comparison` | 4 |
| 3 | KILLER | P3 기제 설명 | S2 동사구 | E3 (앞뒤 두 문장 종합 + 관계절 구속) | `invent criteria` | 2 |
| 4 | KILLER | P4 사례 귀결 | S3 전치사구 | E3 (대비 + 만족도 저하 종합) | `private reproach` | 2 |
| 5 | INTERMEDIATE | P4→대응 | S5 복합 명사구 | E4 (마지막 문장의 `sorting` 이 되받음) | `absorbed the work of elimination` | 5 |

> 난이도 배분 BASIC 1 / INTERMEDIATE 2 / KILLER 2 = 헌법 §4 준수.
> 위치 P2·P3·P4·P4·P5 로 흩어졌고(P1 미사용 — 2번째 문장의 콜로케이션이 §1-2조건 미달), 통사 범주 5종이 전부 다르며, 정답 단어수는 2·2·3·4·5 로 분산.
> probe **P3**: `blocking 0` · `qualityBlocking 0` · `ok true`.

---

## 부록 — 검증 재현

```bash
./node_modules/.bin/tsx qbank/work/_probe-FILL_BLANK_KEY.ts   # 67/67 PASS
npx tsx scripts/_test-md-fill-blank-key.ts                    # 리포 정본 회귀 스위트
```

probe 커버리지: P1 리포 픽스처 · P2 §2 골격 5문항 단일경로(gate/스냅/등장횟수/프레임) ·
P3 gateUnit 5문항 유닛(blocking·qualityBlocking 0 + structuredData 실측) · P4 `ANSWER_DUPLICATE` 실증 ·
P5~P7 노브(isEligible·mdFormat·stemLanguage 평면/중첩·난이도 3분기) · P8 검증기 error 0 + 후처리 warnings 0 ·
E1~E16 파서/게이트 날붙이 16종(첫문장·1단어·8단어·관사·스냅 관사외출·프레임 편집·문장 이어붙임·빈칸 2개·정답 2회 등장·
영어 해설·환각 인용·축자 인용 통과·미지 라벨·문항 연접 누적 오염·해설 400자·지문 30단어 재출력·장식 관용·꼬리 지문 재출력).
