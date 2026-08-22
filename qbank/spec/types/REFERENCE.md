# 지칭 추론 (REFERENCE)

> 분류: **선택형(5지선다)** · 지문변형: **없음(PASSTHROUGH)** · 정답 머리표: **`정답:`** · 최소 지문 길이: **코드 상 하한 없음** — 다만 표적 대명사가 지문 시작에서 **20자 이후**에 있어야 한다(`gate-reference.ts:109`, `219-222`). 유닛(5~8문항)을 만들려면 그 조건을 만족하는 **서로 다른 대명사 출현이 5~8개** 필요하다.

> **필독 선행 문서**: [`../recon/00-contract.md`](../recon/00-contract.md)(공유 계약) · [`../quality-constitution.md`](../quality-constitution.md)(품질 헌법)
> 이 문서의 모든 규칙은 코드 직독 + `qbank/work/_probe-REFERENCE.ts` 실행 검증 결과다. 추측 없음.

---

## 1. 정체성 — 이 유형이 학생에게 요구하는 인지 작업

지문의 **대명사 한 개**에 밑줄이 그어지고, 학생은 그 대명사가 가리키는 **선행사(명사구)** 를 한국어 선지 5개에서 고른다.

**요구하는 인지 작업**: *조응(anaphora) 해소*. 밑줄이 든 문장 하나만으로는 풀리지 않게 설계되며, 학생은
① 수·격 일치로 후보를 좁히고 → ② 의미역(누가 하는가 / 무엇이 당하는가)을 따지고 → ③ 앞뒤 문장의 **인과·대조 흐름**으로 확정해야 한다.
최고 난도는 "**최근접 명사가 문법적으로 완벽히 가능한데 논리적으로만 불가능한 자리**"다(`prompts-reference.ts:46`).

**다른 유형과의 경계 — 헷갈리면 유형 자체가 무효가 된다.**

| 비교 대상 | 차이 |
|---|---|
| `CONTEXT_MEANING`·`SYNONYM`·`ANTONYM` | 저쪽은 **어휘의 의미**를 묻는다. 이쪽은 어휘를 몰라도 되고 **담화 구조**를 묻는다. 표적도 내용어가 아니라 **기능어(대명사)** 다 |
| `IMPLIED_MEANING` | 저쪽은 밑줄 친 **구절 전체의 함의**. 이쪽은 밑줄 친 **한 단어가 대신하는 명사구** — 정답이 지문에 실물로 존재한다 |
| `BLANK_INFERENCE` | 저쪽은 지문을 변형(빈칸 치환)한다. 이쪽은 **지문을 한 글자도 건드리지 않는다**(밑줄은 후처리가 렌더 시점에 긋는다) |

**구조적 특이점 3가지** — 이 유형만의 것이다.
1. **모델이 지문을 재출력하지 않는다.** 다른 유형의 「지문 재구성 대조」 게이트가 없다(`parser-reference.ts:6`). 대신 **밑줄문장 한 줄**만 축자로 옮긴다.
2. **선지가 한국어**다. 지문은 영어인데 선지·해설·오답해설이 전부 한국어 명사구다(`gate-reference.ts:272-273`).
3. **정답의 진실원이 이중 좌표**다. "어느 대명사인가"(마커 안 단어)와 "지문 어디에 있는가"(마커의 문장 내 오프셋)를 **한 줄로 동시에** 확정한다(`prompts-reference.ts:10-16`). 두 칸으로 나눠 받으면 두 값이 어긋나는 실패 모드가 생기기 때문이다.

---

## 2. 마크다운 골격

### 2-1. 복붙용 골격 (qbank 컨테이너 포함)

```md
<!-- ITEM 1
difficulty: BASIC
point: <이 문항이 겨냥한 출제 포인트 — 유닛 내에서 유일해야 한다>
craft: <설계 메모. 게이트는 안 보지만 검수 렌즈가 본다>
-->
밑줄문장: <표적 대명사가 든 지문 문장 하나를 한 글자도 바꾸지 말고 한 줄로 옮기되, 표적 대명사 한 곳만 [[them]] 처럼 감싼다>

① <한국어 지칭 대상 후보 — 지문에 실재하는 명사구>
② <한국어 지칭 대상 후보>
③ <한국어 지칭 대상 후보>
④ <한국어 지칭 대상 후보>
⑤ <한국어 지칭 대상 후보>
정답: <①~⑤ 중 하나>
해설: 밑줄 친 대명사는 '<정답 선지 문구를 한 글자도 다르지 않게 그대로>'를 가리킵니다. <근거 문장 두 곳을 이어 확정하는 둘째 문장. 합니다체.>
오답:
<정답 아닌 라벨 1> <기제이름> — <왜 매력적이고 왜 탈락인지 1문장>
<정답 아닌 라벨 2> <기제이름> — <…>
<정답 아닌 라벨 3> <기제이름> — <…>
<정답 아닌 라벨 4> <기제이름> — <…>
```

> `<!-- ITEM n ... -->` 는 **qbank 컨테이너 규약**이지 md-qgen 규약이 아니다(`qbank/harness/qgen-core.ts:47`). 하네스가 이 주석으로 1문항씩 잘라 낸 **뒤의 본문**만이 md-qgen 계약 대상이다.
> `## 지문` 블록은 **모델 출력이 아니다** — 프롬프트 입력이다(`prompts-reference.ts:132-133`). 저작물에 절대 넣지 마라.

### 2-2. ★ 검증된 정상 픽스처 전문 (`scripts/_test-md-reference.ts:41-65`)

지문(`scripts/_test-md-reference.ts:41-50`):

```
City planners once treated public objections as noise to be managed. The planners archived every objection they had collected during the residents’ review, and later cities reused them, skipping years of consultation. Residents who had filed those complaints never learned that their words had traveled so far. Archivists now argue that such records deserve the same care as engineering drawings.
```

문항 본문(`GOOD`, `scripts/_test-md-reference.ts:52-65`) — **한 글자도 바꾸지 않은 전문**:

```md
밑줄문장: The planners archived every objection they had collected during the residents’ review, and later cities reused [[them]], skipping years of consultation.

① 훗날 계획을 참고한 다른 도시들
② 계획가들이 모아 둔 반대 의견들
③ 계획을 세운 도시 계획가들
④ 도시 계획 절차 전체
⑤ 반대 의견을 낸 주민들
정답: ②
해설: 밑줄 친 대명사는 '계획가들이 모아 둔 반대 의견들'을 가리킵니다. 앞 절이 반대 의견을 모아 보관했다고 밝히고 뒤 절이 그 기록을 다시 써서 협의 기간을 줄였다고 말하므로, 지칭 대상은 도시가 아니라 모아 둔 의견 기록입니다.
오답:
① 최근접 명사 함정 — 바로 앞 주어와 수가 같아 위치상 가장 유혹적이지만, 다시 쓰인 것은 도시가 아니라 기록입니다.
③ 역할 전도 — 의견을 모은 주체라 같은 문장에 등장하지만, 재사용되는 대상은 그 주체가 아닙니다.
④ 범위 이동 — 실제 지칭보다 한 단계 넓은 범주여서 재사용 대상이 될 수 없습니다.
⑤ 다른 마디의 주역 — 앞뒤 문장의 주역이지만 이 자리에서 다시 쓰인 것은 사람이 아니라 기록입니다.
```

### 2-3. 자체 검증한 실물 (KILLER 1문항 — `_probe-REFERENCE.ts` ITEM4)

지문에 다음 문장이 있을 때(`That distinction now shapes acquisition policy across the Netherlands, and several national museums have rebuilt their databases around it.`):

```md
밑줄문장: That distinction now shapes acquisition policy across the Netherlands, and several national museums have rebuilt their databases around [[it]].

① 목록과 증언을 갈라 놓은 구분
② 네덜란드 전역의 수집 정책
③ 박물관들이 새로 만든 데이터베이스
④ 소장품을 무너뜨린 홍수
⑤ 한 기관이 소장한 유물의 수
정답: ①
해설: 밑줄 친 대명사는 '목록과 증언을 갈라 놓은 구분'을 가리킵니다. 앞 문장이 목록은 기관이 가진 것을, 증언은 공동체가 중히 여기는 것을 적는다고 갈라 놓았고 밑줄 문장은 그 갈래가 정책을 바꾸었다고 이어지므로, 데이터베이스를 다시 세운 기준은 정책이 아니라 그 구분입니다.
오답:
② 최근접 명사 함정 — 같은 문장의 목적어라 수와 격이 모두 맞지만, 정책은 그 구분이 낳은 결과이지 재구축의 기준이 아닙니다.
③ 역할 전도 — 재구축의 대상이라 같은 절에 있지만, 대상이 곧 기준일 수는 없습니다.
④ 다른 마디의 주역 — 앞 문단을 움직인 사건이지만 이 문장에서 기준이 된 것은 사건이 아닙니다.
⑤ 범위 이동 — 목록이 세는 수량으로 한 단계 좁혀 놓은 것이어서 기준이 될 수 없습니다.
```

**검증 결과**(`./node_modules/.bin/tsx qbank/work/_probe-REFERENCE.ts`): `gateIssues 0` · `adapt ok` · `postProcess ok` · `quality error 0` · 5문항 유닛 `gateUnit().ok === true`(blocking 0 · qualityBlocking 0).

### 2-4. 섹션 순서는 강제다

```
밑줄문장:  →  ①~⑤ 선지  →  정답:  →  해설:  →  오답:
```

* **선지는 반드시 `오답:` 줄보다 앞**에 있어야 한다. 선지는 `text.split(WRONG_SPLIT_RE)[0]` 구간에서만 수집한다(`parser-reference.ts:194,197`). 뒤에 두면 **선지 0개**.
* `정답:`·`해설:` 은 그 사이 어디에 있어도 정규식이 찾지만, 위 순서를 벗어나지 마라.
* 빈 줄은 자유다(선지 블록 앞뒤 어디든). **밑줄문장과 첫 선지 사이에는 빈 줄 말고 아무것도 넣지 마라**(§7 함정 3).

---

## 3. 파서 계약 (★ 가장 중요)

### 3-0. 공통 접두 관용 — 모든 라벨·선지 줄에 동일 적용

```js
LINE_LEAD   = String.raw`[ \t]*\|?[ \t]*(?:[-*•][ \t]*)?(?:\*\*|__)?[ \t]*`   // parser-reference.ts:99
LABEL_COLON = String.raw`(?:\*\*|__)?[ \t]*[:：][ \t]*(?:\*\*|__)?[ \t]*`      // parser-reference.ts:100
sectionHead(body, tail) = new RegExp(`^${LINE_LEAD}${body}${LABEL_COLON}${tail}`, "m")  // :102-104
```

→ 들여쓰기 · 표 파이프 `|` · 불릿 `- * •` · 굵게 `**`/`__` · 전각 콜론 `：` 를 **라벨 줄과 선지 줄이 대칭으로** 흡수한다.
**하지만 이것은 관용이지 계약이 아니다.** qbank 저작 규칙은 **장식 0**이다(00-contract §8).
🔴 어기면: 관용 범위가 유형마다 달라, 다른 유형 문서를 복사해 쓰는 순간 그 유형에서 필드가 통째로 사라진다.

### 3-1. 밑줄문장

| 항목 | 규칙 | file:line |
|---|---|---|
| 라벨 정규식 | `밑줄[ \t]*(?:친[ \t]*)?(?:문장\|지문)?` + LABEL_COLON → `밑줄문장:` `밑줄:` `밑줄 친 문장:` `밑줄지문:` 전부 인식 | `parser-reference.ts:110,120` |
| 종료 지점 | `(?=^LINE_LEAD(?:[①②③④⑤]\|[1-5][.)][ \t]) \| ^LINE_LEAD(?:정답\|해설\|오답…)LABEL_COLON \| $(?![\s\S]))` — **첫 선지 줄 / 정답·해설·오답 라벨 줄 / 문서 끝** 중 먼저 오는 것 | `parser-reference.ts:115-118` |
| 캡처 후처리 | `.replace(/\s+/g, " ").trim()` — 개행·연속 공백은 한 칸으로 접힌다 | `parser-reference.ts:192` |
| 매치 수 | `text.match(...)` (비전역) → **첫 매치만** | `parser-reference.ts:191` |

🔴 **어기면 무엇이 사라지는가**: 라벨을 못 알아보면 `밑줄문장 누락`(사실과 반대되는 원인 지목). 종료 지점 앞에 잡문을 끼우면 그 잡문이 **밑줄문장에 흡수**되어 `지문에 축자로 없음` 으로 반려된다(실측: `_probe-REFERENCE.ts` D 케이스 — 164자 문장으로 부풀어 반려).

### 3-2. 인라인 마커 — 이 유형의 심장

```js
INLINE_REFERENCE_MARK_RE = /\[\[(?:([A-Za-z0-9]{1,3})\s*:\s*)?((?:(?!\]\]).)+)\]\]/g   // parser-reference.ts:49-50
FALLBACK_MARK_RES = [ /__([^_\n]{1,40})__/g , /\*\*([^*\n]{1,40})\*\*/g ]              // parser-reference.ts:53-56
```

| 규칙 | 내용 | file:line |
|---|---|---|
| 라벨은 **선택** | `[[them]]` 정본. `[[A:them]]` `[[1: them]]` 도 흡수(라벨 1~3자) | `:49-50` |
| 대체 마커 | `[[ ]]` 이 **하나도 없을 때만** `__them__` / `**them**` 을 마커로 인정 | `:244-252` |
| 마커 개수 | **정확히 1개.** `collectMarks` 가 센 값이 `markCount` | `:238-254`, 게이트 `:189-193` |
| 마커 안 정제 | 앞뒤 **비알파벳**을 떼어 `before`/`after` 로 되돌린다 → `[[them,]]` == `[[them]],` | `:284-291` |
| 공백 흡수 | `[[ them ]]` → `inner.trim()` | `:242` |

🔴 어기면: 마커 0개/2개는 **즉시 반려**(이후 검사 전부 스킵). 대체 마커를 쓰면서 선지에도 `**` 를 남기면 선지 게이트가 별도로 터진다.

### 3-3. 원문 좌표 확정 — 「지문 재구성 대조」의 대체물

```js
pattern = `(${looseSource(before)})(?<![A-Za-z])(${looseSource(pronoun)})(?![A-Za-z])(${looseSource(after)})`
for (const flags of ["g", "gi"]) { … }        // parser-reference.ts:339-369
```

`looseSource`(`:301-319`)가 흡수하는 차이 — **이것만 안전하다**:

| 원문 | 흡수 대상 |
|---|---|
| 공백 1개 | `\s+` (개행 포함 — 여러 줄 지문에서도 한 줄 밑줄문장이 매칭된다. **실측 확인**) |
| `'` | `' ‘ ’ ʼ` |
| `"` | `" “ ”` |
| `-` | `- – —` |
| `…` | `…` 또는 `...` |

**그 외 한 글자라도 다르면 좌표를 못 얻고 반려된다.** 요약·축약·대문자화·구두점 교체·관사 추가 전부 반려다.
대소문자만 어긋난 경우는 2차 시도(`gi`)로 구제되고 `caseRelaxed=true` 가 되며, `autoSnapReference` 가 지문 축자로 되돌린다(`:460-483`).

🔴 어기면: `밑줄문장(N자)이 지문에 축자로 없음` — **이 유형 최다 반려 사유**.

### 3-4. 밑줄 자리의 유일 확정 (4중 불변식)

`gate-reference.ts:6-10` 이 명시한 이 유형의 최강 불변식. 넷 모두 통과해야 후처리가 **모델이 의도한 그 자리**에 밑줄을 긋는다.

1. 밑줄문장이 원문에 축자로 존재 (`locateReferenceTarget` 이 null 이 아님)
2. 원문에서 **딱 한 번** 등장 (`matchCount === 1`)
3. 마커가 **1개**
4. 그 자리를 지목하는 **문맥 창**을 만들 수 있음 — `buildReferenceContext(passage, index, length, pad=45)` 가 만든 창을 `referenceContextResolves` 가 후처리 규칙 그대로 재현해 검산 (`:381-451`)

**창 계산 규칙**(§8 다각화의 물리적 제약이므로 반드시 이해할 것):
* 표적 앞뒤 **45자**를 뜬다.
* 창 왼쪽에 **같은 대명사**(대소문자 무시, 단어 경계)가 있으면 그 마지막 등장 **뒤로** 왼쪽 끝을 민다(`:392-403`).
* 단어 중간 절단 방지로 경계까지 밀고, 선행·후행 공백을 버린다(`:404-424`).

**실측(프로브)**: 같은 대명사가 근처에 반복돼도 창 왼쪽 밀기 덕분에 대부분 통과한다 — `Scholars cited them, and journalists later quoted [[them]] …` 는 **앞 출현·뒤 출현 둘 다 resolves=true**(`scripts/_test-md-reference.ts:660-719` 및 자체 프로브). 이 검사가 실제로 터지는 경우는 **창 텍스트가 지문 앞쪽에 똑같이 또 있을 때**(= 반복 문장)다.
🔴 어기면: `표적 '…' 의 밑줄 자리를 유일하게 지목하는 문맥을 만들 수 없음` — 후처리가 **엉뚱한 출현에 밑줄**을 그을 위험을 사전 차단한 것이다.

### 3-5. 선지

```js
CIRCLED_OPTION_LINE = new RegExp(`^${LINE_LEAD}([①②③④⑤])(?:\\*\\*|__)?[ \\t]*[.)]?[ \\t]*(.+)$`, "gm")  // :131-134
DIGIT_OPTION_LINE   = new RegExp(`^${LINE_LEAD}([1-5])(?:\\*\\*|__)?[ \\t]*[.)][ \\t]*(.+)$`, "gm")      // :135-138
```

| 규칙 | 내용 | file:line |
|---|---|---|
| 수집 구간 | `text.split(WRONG_SPLIT_RE)[0]` — **`오답:` 줄 이전 전체** | `:194,197` |
| 라벨 축 | 학생 표면은 `①②③④⑤`. `1)` `2.` 도 흡수하되 **원문자 5개가 다 모이면 숫자 폴백을 켜지 않는다** | `:145-157` |
| 숫자 라벨 주의 | 원문자가 5개 미만일 때만 숫자 폴백 → 이때 **해설 속 `1) …` 열거가 선지로 오인**된다 | `:146-148` |
| 텍스트 위생 | 앞 파이프·잔여 라벨 반복 제거 → 뒤 파이프 제거. **굵게/밑줄은 일부러 안 지운다**(게이트가 잡아야 하므로) | `:170-181` |
| 한 줄 계약 | `(.+)$` — 선지는 **반드시 한 줄**. 줄바꿈하면 두 번째 줄은 라벨이 없어 **조용히 버려진다** | `:131-138` |
| 라벨 정규화 | `circledLabel` — `②`/`2`/`(2)` 계열을 `②` 로 | `:81-86` |

🔴 어기면: 선지 줄바꿈 → 텍스트 절단(게이트가 못 잡을 수 있다). 해설에 `① …` 로 시작하는 줄 → **선지 6개**가 되어 「오답 섹션 라벨 미인식」이라는 **엉뚱한 원인**이 지목된다.

### 3-6. 정답

```js
ANSWER_RE = sectionHead("정답", String.raw`[(\[（【]?[ \t]*([①②③④⑤]|[1-5])`)   // parser-reference.ts:121
```

| 규칙 | 내용 |
|---|---|
| 유일 진실원 | **`정답:` 줄 하나뿐**. 선지 줄이나 해설에 정답 표시를 다시 넣지 마라 |
| 값 | `①~⑤` 또는 `1~5`. 여는 괄호 `( [ （ 【` 하나 허용 |
| 매치 | 비전역 → **첫 매치만** |
| 뒤 자유 | 줄 끝 앵커가 없다 — `정답: ②번` 도 `②` 로 읽힌다 |

🔴 어기면: 라벨을 못 읽으면 `정답 누락`. **`**정답:**` 은 이 유형에선 흡수되지만**(`LABEL_COLON`) 정본 `parser.ts` 는 흡수하지 않으므로 습관 들이지 마라.

### 3-7. 해설

```js
EXPLANATION_HEAD_RE = sectionHead("해설", `([\\s\\S]*?)(?=^${LINE_LEAD}${WRONG_LABEL}${LABEL_COLON})`)  // :122-125
EXPLANATION_TAIL_RE = sectionHead("해설", `([\\s\\S]+)$`)                                                // :126
```

`오답:` 줄이 있으면 그 앞까지, 없으면 **문서 끝까지** 흡수하고 `.trim()`. 여러 줄 허용(단 선지 라벨로 시작하는 줄 금지 — §3-5).

### 3-8. 오답해설

```js
WRONG_LABEL          = String.raw`오답[ \t]*(?:해설|선지)?`      // :112 — `오답:` `오답 해설:` `오답선지:`
WRONG_SPLIT_RE       = sectionHead(WRONG_LABEL)                  // :127
WRONG_SPLIT_LINE_RE  = sectionHead(WRONG_LABEL, "$")             // :128 — 라벨만 있는 줄 우선
```

* 오답 섹션 = `split(WRONG_SPLIT_LINE_RE)[1] ?? split(WRONG_SPLIT_RE)[1] ?? ""` (`:199-200`)
* 오답 줄은 **선지와 같은 라인 정규식**으로 파싱된다 → `② 기제이름 — 설명` 형태로 라벨을 붙여라.
* **정답 라벨이 붙은 오답 줄은 파서가 조용히 제거**한다(`:204`). 드리프트 관용이며, 결손은 개수 검사로 드러난다.

🔴 어기면: `오답:` 뒤에 다른 말을 붙이면(`오답 해설은 다음과 같다:`) 라벨 인식에 실패해 **오답 4줄이 선지로 흡수**되고 `선지 9개` 반려가 난다.

### 3-9. 0원 자동 보정 (autoSnap)

`autoSnapReference`(`parser-reference.ts:460-483`) — **자리가 확정된 경우에만** 밑줄문장을 지문 축자로 되돌린다.

| 조건 | 동작 |
|---|---|
| `markCount !== 1` 또는 대명사 없음 | 손대지 않음 (게이트가 반려) |
| 좌표 확정 실패 | 손대지 않음 (게이트가 반려) |
| 좌표 확정 성공 & 축자 불일치 | 지문 축자 + `[[원문대명사]]` 로 **교체**, `corrections` 에 1건 기록 |

흡수 대상: 곱슬따옴표·대시·말줄임 정규화, 공백/개행 접힘, 대소문자. **하네스는 이 보정을 `warnings`(AUTOSNAP)로 기록한다** — 저작 품질 지표이므로 0을 목표로 하라.

---

## 4. 게이트 체크리스트

### 4-1. `gateMdReference` 반려 사유 **전수** (`gate-reference.ts:176-339`)

`#1` 세 건은 **즉시 return** — 하나라도 걸리면 나머지 검사가 통째로 생략된다.

| # | 사유 문자열 | 조건 | file:line |
|---|---|---|---|
| 1 | ``밑줄문장 누락 — `밑줄문장:` 줄에 표적 대명사를 [[ ]] 로 감싼 지문 문장을 그대로 옮겨 적어라`` | `q.markedSentence` 가 빈 문자열 (**즉시 return**) | `gate-reference.ts:185-187` |
| 2 | `밑줄 마커 {N}개 (정확히 1개 필요) — 밑줄문장에서 표적 대명사 한 곳만 [[ ]] 로 감싸라` | `markCount !== 1` (**즉시 return**) | `:189-193` |
| 3 | `밑줄 마커 안이 비었음 — [[them]] 처럼 대명사 한 단어를 감싸라` | 마커 안에서 알파벳을 못 뽑음 (**즉시 return**) | `:195-197` |
| 4 | `밑줄문장이 {N}자 (문장 하나 500자 이내) — 표적이 든 문장 하나만 옮겨 적어라` | 마커 제거본 길이 > `MAX_MARKED_SENTENCE_LENGTH=500` | `:111,199-203` |
| 5 | `밑줄문장({N}자)이 지문에 축자로 없음 — 지문에서 그대로 복사하고 표적 대명사만 [[ ]] 로 감싸라: '{앞 200자}'` | `locateReferenceTarget` 이 null | `:206-212` |
| 6 | `밑줄문장이 지문에 {N}회 등장 — 밑줄 자리가 유일하지 않다. 다른 문장의 대명사를 표적으로 잡아라` | `loc.matchCount > 1` | `:214-218` |
| 7 | `표적 '{p}' 이 지문 맨 앞({N}자 지점)에 있음 — 선행사가 지문 안에 없을 수 있으니 뒤쪽 대명사를 잡아라` | `loc.index < MIN_TARGET_OFFSET(20)` | `:109,219-223` |
| 8 | `표적 '{p}' 의 밑줄 자리를 유일하게 지목하는 문맥을 만들 수 없음 — 같은 대명사가 근처에 반복되지 않는 자리를 잡아라` | `referenceContextResolves` 가 false | `:225-230` |
| 9 | `표적 '{p}' 이 지칭 추론 대상 대명사가 아님 — it·they·them·their·this·these 류 한 단어만 표적으로 쓸 수 있다` | `isReferencePronoun` false (허용 22종 밖) | `:234-237` |
| 10 | `표적 '{p}': 허사 it(it is ... that / it takes ... to) — 가리키는 대상이 없어 지칭 표적이 될 수 없음` | `it` + `EXPLETIVE_IT_FRAMES` 5종 중 하나 매치 | `:55-68,87-89,239-240` |
| 11 | `표적 '{p}': that 이 접속사·관계사·한정사로 읽히는 자리 — 지시대명사 용법(That is ... 류)만 표적으로 허용` | `that` 뒤 첫 단어가 `THAT_PRONOUN_HEADS` 밖 | `:71-76,90-95,239-240` |
| 12 | ``선지 {N}개 (5개 필요) — 오답 섹션 라벨을 인식하지 못해 오답 해설 줄이 선지로 읽혔다. `오답:` 을 다른 말 없이 한 줄로 내라`` | `options.length > 5` | `:244-250` |
| 13 | `선지 {N}개 (5개 필요) — ①~⑤ 다섯 줄로 내라` | `options.length !== 5` (5 미만) | `:251-253` |
| 14 | `선지 라벨 순서 오류 — ①②③④⑤ 필요(실제 {actual})` | 5개인데 라벨 문자열이 `①②③④⑤` 가 아님 | `:254-258` |
| 15 | `{label} 선지 텍스트 누락` | 선지 텍스트가 빈 문자열 | `:262-265` |
| 16 | `{label} 선지에 서식·표 문자가 섞임 — 굵게(**)·밑줄(__)·HTML 태그·표 파이프(\|)를 쓰지 말고 후보 명사구만 써라: '{앞 40자}'` | `/<[^<>]+>\|\*\*\|__\|\|/` 매치 | `:105,267-271` |
| 17 | `{label} 선지가 한국어가 아님 — 지칭 대상을 한국어 명사구로 써라: '{앞 40자}'` | 선지에 `[가-힣]` 이 **하나도 없음** | `:272-274` |
| 18 | `{label} 선지 끝 괄호에 지칭 판정이 박힘 — 정답이 선지에 노출된다. 후보 명사구만 써라: '{앞 40자}'` | `/[(（][^()（）]{1,30}[)）]\s*$/` — 선지 **끝** 괄호 | `:107,275-279` |
| 19 | `{label} 선지가 너무 김({N}자) — 명사구 하나로 줄여라` | `normalizeWs(text).length > 80` | `:280-282` |
| 20 | `선지 중복: '{앞 40자}'` | `compact(text).toLowerCase()` 중복 (공백·따옴표 무시) | `:118-120,283-287` |
| 21 | ``정답 누락 — `정답:` 줄에 ①~⑤ 하나를 적어라`` | `q.answer` 가 빈 문자열 | `:292-293` |
| 22 | `정답 라벨({답})이 선지에 없음` | 그 라벨의 선지가 없음 | `:294-295` |
| 23 | `정답 선지({답})만 유독 긺({N}자 대 오답 평균 {M}자) — 길이로 정답이 표난다` | 선지 5개 & `answerLen >= otherAvg*2.5` **AND** `answerLen - otherAvg >= 20` | `:296-307` |
| 24 | `해설 누락` | `q.explanation` 이 빈 문자열 | `:310-311` |
| 25 | ``해설이 지칭 대상으로 단정한 선지는 {라벨들} '{앞 30자}' 인데 `정답:` 은 {답} '{앞 30자}' 이다 — 해설과 정답 라벨이 어긋났다. 어느 쪽이 옳은지 정하고 정답 라벨과 해설을 같은 선지로 맞춰라`` | 해설이 **정답 선지를 긍정 인용하지 않으면서** 다른 선지를 긍정 단정 | `:133-174,312-315` |
| 26 | `오답해설 {N}개 ({M}개 필요 — 정답 번호 제외 전 선지)` | `requireWrong` && `wrong.length !== min(options,5)-1` | `:318-324` |
| 27 | `오답해설 라벨 중복: {label}` | 같은 라벨이 두 번 | `:325-329` |
| 28 | `오답해설 라벨({label})이 선지에 없음` | 오답 라벨이 선지 라벨 집합 밖 | `:330-332` |
| 29 | `오답해설에 정답 라벨 포함` | `wrong` 에 정답 라벨 존재. **파서 경유로는 도달 불가** — `parser-reference.ts:204` 가 선제 제거한다(실측 확인) | `:335-337` |

### 4-2. 레인 추가 게이트 (`lane-reference.ts:33-49`)

| 사유 문자열 | 조건 | file:line |
|---|---|---|
| `교사 지정 표현이 밑줄문장에 없음: '{앞 60자}'` | `ctx.teacherPoints` 의 표현이 밑줄문장(마커 제거본)에도, 표적 대명사와의 포함 관계에도 없음 | `lane-reference.ts:38-47` |

> 실사용에서는 발화하지 않는다 — REFERENCE 는 `POINT_PICKER_CONFIG` 미등재(`…/point-picker-config.ts:75~`)라 `teacherPoints` 가 항상 `[]`.

### 4-3. 어댑터 실패 (게이트 통과 후 `ADAPT` 로 차단 — `adapter-reference.ts`)

게이트가 클린이면 논리적으로 재현되지 않지만, 하네스가 `blocking`(code=`ADAPT`)으로 잡는다.

| 문자열 | 조건 | file:line |
|---|---|---|
| `선지 {N}개 (5개 필요)` | `options.length !== 5` | `adapter-reference.ts:51-53` |
| `정답 라벨이 선지에 없음` | 정답 라벨의 선지 부재 | `:54-55` |
| `밑줄 마커 {N}개 (정확히 1개 필요)` | `markCount !== 1` 또는 대명사 없음 | `:57-60` |
| `밑줄문장이 지문에 축자로 없음` | 좌표 확정 실패 | `:61-62` |

### 4-4. 후처리 실패 (`POSTPROCESS`)

| 문자열 | 조건 | file:line |
|---|---|---|
| `Missing underlinedPronoun field` | 어댑터 산출에 대명사 없음 | `question-postprocess/processors/reference.ts:13-15` |
| `Pronoun not found in passage: "{p}"` | `findWordInPassage(..., strictContext=true)` 실패 | `:17-30` |

### 4-5. 품질 축 (`qualityBlocking` — 프로덕션은 **비차단**, qbank 하네스는 차단)

| 코드 | 조건 | file:line |
|---|---|---|
| `reference-marker-shape` (error) | ① 선지 라벨/텍스트에 `<태그>`/`**`/`__` ② 라벨이 ①~⑤/1~5 로 안 읽힘 ③ `correctAnswer` 가 선지 라벨 밖 ④ `passageWithUnderline` 의 `__…__` 개수 ≠ 1 ⑤ 밑줄 토큰 ≠ `underlinedPronoun` ⑥ odd-one-out 발문에서 괄호 지칭 정답 노출 | `question-quality/validators/reference.ts:28-119` |
| `target-not-standalone` (error) | `underlinedPronoun` 이 단일 영단어인데 지문에 단어 경계로 존재하지 않음 | `question-quality/dispatcher.ts:753,963-971` |
| `option-count` (error) | 선지 ≠ 5 (REFERENCE ∈ `MC_TYPE_IDS`, 기본 기대치 5) | `validators/options.ts:38,140-141` |
| `duplicate-option-label` / `duplicate-option-text` / `empty-option-text` (error) | 이름 그대로 | `validators/options.ts:144-156` |
| `correct-answer-mismatch` (error) | `correctAnswer` 가 어느 선지 라벨/텍스트와도 안 맞음 | `validators/options.ts:192-214` |
| `explanation-foreign-script` (error) | 해설·오답해설에 한자·가나·중문 구두점 (한글 직후 괄호 병기만 예외) | `validators/explanation-foreign-text.ts:32-34,97-104` |
| `explanation-latin-jam` (error) | `steals다` 처럼 영단어+종결어미 직접 접합 | `validators/explanation-foreign-text.ts:39-41,105-112` |
| `explanation-quoted-token-missing` (error) | 해설이 따옴표로 인용한 **영어 12자 이상 조각**이 지문·선지 등 표시 표면에 없음 | `validators/explanation-quoted-tokens.ts:117-162` |

> `reference-marker-shape` 는 `SHIP_FIRST_WARNING_CODES` **미등재**(`question-quality/core.ts:31-58`) → error 그대로 유지된다.

**경고(비차단)** — KILLER 문항에서 항상 뜨는 것:
`few-key-points`(어댑터가 `keyPoints: []` 고정 — `adapter-reference.ts:94`) · `thin-killer-explanation`(해설 80자 미만일 때) · `option-length-giveaway`(최장 ≥ 최단×3 && 차이 > 18) — `validators/misc.ts:66-96`.
→ **해설은 KILLER에서 80자를 넘겨라**(실측: 넘기면 `few-key-points` 하나만 남는다).

### 4-6. 유닛 축 (`qbank/harness/qgen-core.ts`)

| 코드 | 조건 | file:line |
|---|---|---|
| `CONTAINER` | `<!-- ITEM n -->` 헤더 부재·번호 비연속·`point:` 누락·본문 없음·`settings` JSON 파싱 실패 | `qgen-core.ts:49-99` |
| `ITEM_COUNT` | 문항 수 < `minItems`(기본 5) | `:229-237` |
| `POINT_DUPLICATE` | 두 문항의 `point:` 정규화 값이 같음 | `:324-333` |
| `ANSWER_DUPLICATE` | 두 문항의 `diversityTargets` 정규화 값이 같음 → REFERENCE 는 **`surroundingText`(표적 앞뒤 45자 창)** | `:335-353`, `lane-reference.ts:131-140` |

---

## 5. adapter 산출 필드

`adaptMdReferenceToAiQuestion`(`adapter-reference.ts:46-99`) → `postProcessQuestion`(`processors/reference.ts`) → `structuredData`.

| 키 | 값 | 생산자 | 비고 |
|---|---|---|---|
| `direction` | `다음 글의 밑줄 친 '{pronoun}'의 지칭 대상으로 가장 적절한 것은?` | 어댑터 `:33-37` | `stemLanguage='en'` 이면 `What does the underlined '{p}' in the passage refer to?` (`:40-44`, `lane:107-112`) |
| **`underlinedPronoun`** | **원문 축자** 대명사 (`passage.slice(loc.index, …)`) — 모델이 소문자로 적어도 지문 대소문자 유지 | 어댑터 `:67` | ★ 이 유형 전용. 후처리가 `__{이 값}__` 로 치환하므로 원문과 어긋나면 밑줄 구간 글자가 바뀐다 |
| **`surroundingText`** | `buildReferenceContext(passage, index, length, 45)` — 표적 앞뒤 45자 창(경계 정렬) | 어댑터 `:68` | ★ 이 유형의 **생명줄**. 후처리 `findWordInPassage(strictContext=true)` 가 이 창 안 **첫 단어경계 일치**를 밑줄 처리한다. 동시에 `diversityTargets` 의 값이기도 하다 |
| `options` | `[{label:"1"~"5", text:한국어 명사구}]` | 어댑터 `:85-88`, `digitOptionLabel`(`adapter.ts:75-78`) | 저장 축은 `"1"~"5"` 숫자 문자열 |
| `correctAnswer` | `"1"~"5"` | 어댑터 `:89` | |
| `wrongOptionExplanations` | `[{label:"1"…, explanation}]` → 후처리에서 **Record 로 변환** | 어댑터 `:70-77`, `question-postprocess/index.ts:164-167` | 정답 라벨 제외, 설명이 빈 항목은 탈락 |
| `explanation` | 해설 원문 그대로 | 어댑터 `:95` | |
| `keyPoints` | **항상 `[]`** (합성 금지 — 모델 오태깅 노출 사고 이력) | 어댑터 `:92-94` | KILLER 경고 `few-key-points` 의 원인 |
| `tags` | `[]` | 어댑터 `:96` | |
| `difficulty` | `ctx.rawDifficulty` | 어댑터 `:96` | |
| **`passageWithUnderline`** | 지문에서 표적만 `__pronoun__` 로 감싼 전문 | **후처리 전담** `processors/reference.ts:33-38` | ★ 어댑터가 만들면 이중 생성 충돌. 밑줄 밖은 원문과 **완전 동일**해야 한다 |

**후처리가 추가로 하는 일** — `alignWrongOptionExplanationsWithVisibleOptions`(`question-postprocess/index.ts:256-307`): REFERENCE 는 「보이는 한국어 선지」 유형이라, 오답해설에 그 선지 문구가 **포함돼 있지 않으면** `'{선지텍스트}' 선택지는 {해설}` 로 **자동 접두**된다(`:303`). 오답해설을 쓸 때 이 접두를 계산에 넣어라(문장이 어색해지지 않게 "…입니다" 로 끝내면 자연스럽다).

**금지 필드**: `blanks` · `passageWithBlank` · `originalExpression` 을 흘리면 `type-foreign-field` 가 뜬다(`adapter-reference.ts:19-20`). md 저작에서는 애초에 생성 경로가 없다.

---

## 6. 생성 노브

REFERENCE 는 **유형 전용 수치 노브가 0개**다(`lane-reference.ts:63-67` — `dispatchers.ts` 에 `reference*` 키 0건, 선지 5개 고정).

| 키 | 타입 | 기본값 | 클램프 범위 | 마크다운에 미치는 영향 |
|---|---|---|---|---|
| `stemLanguage` | `"ko" \| "en"` | `"ko"` (`language.ts:24`) | 그 외 값은 기본값으로 정규화 (`language.ts:92-97`) | **마크다운 계약 무변경.** `buildExtras` 가 「질문 언어」 블록 추가(`lane:77-81`), `adapt` 가 `direction` 만 영문 교체(`lane:107-112`). **선지·해설·오답은 한국어 그대로** |
| `optionLanguage` | `"ko" \| "en"` | `"ko"` (`language.ts:24`) | 〃 | **사실상 무효 노브.** REFERENCE 는 `OPTION_LANGUAGE_FREE_TYPE_IDS` 미등재 → toggle scope `'stem'`(`language.ts:64-79`). `qualityArgs` 는 실값을 싣지만(`lane:120`) 품질 검증기가 REFERENCE 에는 이 인자를 쓰지 않는다(`dispatcher.ts:1006-1013`) |
| `optionCount` | — | **5 고정** | 노브 없음 — `GENERIC_OPTION_COUNT_TYPE_IDS` 미등재 (`generic.ts:22-31`) | 선지 5개 강제. 4개·6개는 게이트 반려 |
| `difficulty` (ctx) | `BASIC \| INTERMEDIATE \| KILLER` | 하네스 기본 `INTERMEDIATE` (`qgen-core.ts:79`) | 셋 밖이면 `CONTAINER` 반려 (`:80-82`) | **형식 무변경.** 프롬프트 표적 설계 분기(`prompts:36-50`)·few-shot 유무(`prompts:79`)·KILLER 품질 경고 활성(`dispatcher.ts:888-890`) |
| `teacherPoints` | `{text, unit}[]` | `[]` | `POINT_PICKER_CONFIG` 미등재 → 항상 `[]` | 지정 표현이 밑줄문장 안(또는 표적 대명사와 포함 관계)에 없으면 반려 (`lane:33-49`) |
| `mode`(설명 모드) | `"full" \| "answer-only"` | `"full"` (`prompts:71`) | 레인이 `"full"` 을 **하드코딩**(`lane:70`) → 실질 고정 | `answer-only` 면 프롬프트가 오답 블록을 요구하지 않는다(`prompts:55-57`). **레인은 `gateMdReference` 에 `requireWrong` 옵션도 넘기지 않으므로**(`lane:92`, `gate:181`) 게이트는 항상 `requireWrong=true` → **오답 4개는 언제나 필수** |
| `isEligible` | — | 항상 `true` | — | 어떤 설정에서도 이 유형은 적격 (`lane:65-67`) |

**결론: 저작 에이전트가 만질 노브가 없다.** 다양성은 전부 §8 의 **설계 축**에서 나온다.

---

## 7. 함정

코드 근거가 있는 것만. 번호 앞 🔴 는 실제로 게이트를 깨뜨린 것을 프로브로 재현한 항목이다.

1. 🔴 **밑줄문장을 "옮겨 쓰다가" 한 글자 고치기.** `acquisition policy` → `acquisition policies` 하나로 `밑줄문장(141자)이 지문에 축자로 없음` 반려. `looseSource` 가 흡수하는 것은 **곱슬따옴표·대시·말줄임·공백뿐**이다(`parser-reference.ts:301-319`). 관사 추가, 축약형 풀기(`don't`→`do not`), 대문자화 전부 반려. → **복사·붙여넣기만 하라.**
2. 🔴 **밑줄문장과 첫 선지 사이에 한 줄 끼워 넣기.** `MARKED_SENTENCE_RE` 는 첫 선지 줄까지 **전부 삼킨다**(`:115-120`). 프로브 실측: 164자로 부풀어 `지문에 축자로 없음` 반려 — 게이트가 **엉뚱한 원인**을 지목하므로 디버깅이 어렵다.
3. **해설·오답해설 줄을 `①`/`1)` 로 시작하기.** 선지는 `오답:` 줄 **이전 전체**에서 수집된다(`:194,197`). 해설 안의 열거가 선지가 되어 `선지 6개 이상 → 오답 섹션 라벨 미인식` 이라는 **사실과 다른 원인**이 뜬다(`gate:244-250`).
4. **`오답:` 뒤에 설명 붙이기.** `오답 해설은 다음과 같습니다:` 는 `WRONG_LABEL`(`오답[ \t]*(?:해설|선지)?`)과 안 맞아 섹션 분리에 실패 → 오답 4줄이 선지로 흡수(`:112,127-128`).
5. 🔴 **선지에 괄호로 지칭을 병기하기.** `⑤ 한 기관이 소장한 유물의 수 (목록)` → `선지 끝 괄호에 지칭 판정이 박힘`. 선지 **끝** 괄호만 잡으므로(`gate:107`) 중간 괄호는 통과하지만 쓰지 마라 — 정답 노출 결함이다.
6. 🔴 **선지를 영어로 쓰기.** `② the acquisition policy` → `선지가 한국어가 아님`. 검사는 `[가-힣]` 이 **하나라도** 있는지뿐이라(`gate:272`) `② 수집 정책 acquisition policy` 같은 혼종은 게이트를 뚫는다 — **하지만 하지 마라.** 층위 불일치로 정답이 표난다(헌법 §3-6). (영어를 괄호로 병기하면 이번엔 함정 5의 `끝 괄호` 게이트에 걸린다.)
7. 🔴 **선지에 굵게 넣기.** `③ **박물관들이** …` → `선지에 서식·표 문자가 섞임`. `cleanOptionText` 는 파이프만 지우고 `**`/`__` 는 **일부러 남긴다**(`:168`) — 게이트가 잡으라고.
8. **선지를 두 줄로 쓰기.** 라벨 없는 둘째 줄은 **조용히 버려진다**(`:131-138`). 게이트가 못 잡는 경우가 있어 부패한 선지가 그대로 출하될 수 있다. **선지 = 정확히 한 줄.**
9. 🔴 **해설이 정답이 아닌 선지를 단정하기.** 해설이 **정답 선지를 긍정 인용하지 않으면서** 다른 선지 문구를 긍정 단정하면 반려(`gate:158-174`). **방어법: 해설 첫 문장에 정답 선지 문구를 작은따옴표로 축자 인용하라** — 인용이 확인되는 순간 이 검사는 즉시 통과한다(`:164`). `'A'가 아니라 B` 처럼 부정 표지(`아니/말고/대신`)가 뒤따르는 인용은 인용으로 세지 않는다(`:127,133-142`).
10. **허사 `it` 을 표적으로 잡기.** `It is clear that …` `It takes years to …` `It has long been argued …` `It follows that …` 는 반려(`gate:55-68`). **반면 `It is remarkable for its detail.` `It was clear evidence that …` 같은 정상 지칭 It 은 통과**한다 — 후행 요소(`that/to/whether/how/why/when/what`)가 형용사 **바로 뒤**에 와야만 허사로 본다(`:39-53`).
11. **`that` 을 표적으로 잡기.** 뒤 첫 단어가 `is/was/has/had/will/would/can/could/may/might/should/must/does/did/seems/appears/means/remains/explains/makes/leaves/gives` 계열(`THAT_PRONOUN_HEADS`, `:71-76`)이 아니면 전부 반려. 실질적으로 `That is why …` 류만 허용된다.
12. **허용 목록 밖 단어를 표적으로.** 22종만 허용 — `it its they them their theirs this that these those he him his she her hers we us our ours one ones`(`parser-reference.ts:28-33`). `such` `both` `each` `others` `former` 는 전부 반려.
13. **지문 앞머리 대명사.** 표적이 지문 시작 **20자 이내**면 반려(`gate:109,219-222`). 사실상 첫 문장 앞부분 금지.
14. **문맥 창이 자리를 못 지목하는 경우**(`문맥을 만들 수 없음`, `:225-230`). 창 왼쪽 밀기(`parser:392-403`) 덕에 같은 대명사가 근처에 반복돼도 **대부분 통과한다**(프로브 실측: `cited them … quoted them` 양쪽 다 통과). 실제 위험은 **표적 주변 90자 텍스트가 지문 다른 곳에 그대로 또 있는** 경우 — 즉 반복 문장·반복 구절이다.
15. **지문에 두 번 나오는 문장.** `밑줄문장이 지문에 2회 등장` 반려(`:214-217`). 짧은 반복 문장("They kept the records.")을 피하라.
16. **정답만 길게 쓰기.** `answerLen >= otherAvg*2.5` **AND** `answerLen - otherAvg >= 20` 두 조건이 **동시** 성립할 때만 반려된다(`:302-306`) — 즉 게이트를 통과해도 길이 편향은 남을 수 있다. 헌법 §3-6(최장 ≤ 최단×2)을 스스로 지켜라.
17. **선지 80자 초과**(`normalizeWs` 기준, `:280-281`). 한국어 명사구 하나면 여유롭지만 수식절을 겹치면 넘는다.
18. **오답해설 개수 착각.** 항상 `선지수-1 = 4`개다(`:321-323`). 정답 라벨 줄을 오답에 넣으면 파서가 조용히 제거해 **3개**가 되어 반려된다(`parser:204` + `gate:322`).
19. **KILLER 해설 80자 미만.** 차단은 아니지만 `thin-killer-explanation` 경고(`validators/misc.ts:71-74`). 헌법 §5 를 지키면 자연히 넘는다.
20. **해설에 한자·가나·`영단어+다`.** `explanation-foreign-script` / `explanation-latin-jam` 은 **error** 다(`validators/explanation-foreign-text.ts`). 오답해설도 검사 대상이다.
21. **해설에서 영어를 12자 이상 인용할 때 오탈자.** `explanation-quoted-token-missing`(error) — 인용은 지문 축자여야 한다(`validators/explanation-quoted-tokens.ts:35-37,144-160`).
22. **유닛 안에서 같은 대명사 출현을 두 번 겨냥.** `surroundingText` 가 같아져 `ANSWER_DUPLICATE` 차단(`qgen-core.ts:335-353`). 같은 단어(`them`)라도 **다른 위치**면 창이 달라 통과한다 — 위치가 다각화의 단위다.
23. **`point:` 문구 재활용.** 정규화(소문자·비문자 제거) 후 같으면 `POINT_DUPLICATE` 차단(`:324-333`).

---

## 8. 출제 포인트 다각화 축

> **원칙(헌법 §7)**: 같은 지문·같은 유형의 5~8문항은 서로 다른 **인지 작업**을 요구해야 한다.
> 이 유형에서 문항의 정체성은 **「표적 대명사의 출현 위치」 하나로 결정된다.** 위치가 다르면 선행사가 다르고, 선행사가 다르면 경쟁 후보 지형이 통째로 바뀐다.

### 8-A. 코드가 강제하는 축 (기계 판정)

| 축 | 무엇이 달라야 하는가 | 근거 |
|---|---|---|
| **표적 출현 위치** | `surroundingText`(표적 앞뒤 45자 창)가 **문항마다 달라야** 한다. 같은 대명사라도 다른 출현이면 창이 달라져 통과 | `lane-reference.ts:131-140` + `qgen-core.ts:335-353` |
| **`point:` 문구** | 정규화 후 유일 | `qgen-core.ts:324-333` |
| **난이도** | 5문항: BASIC 1 / INTERMEDIATE 2 / KILLER 2 (헌법 §4). `difficulty:` 헤더로 선언 | `qgen-core.ts:79-82` |
| (선택) 발문 언어 | `settings: {"stemLanguage":"en"}` 로 문항별 발문만 영문화 가능 — **표층 형식 축**(헌법 §7-5) | `qgen-core.ts:246,369-377` + `lane:77-81` |

> ⚠ 코드가 강제하는 것은 **위치의 다름**뿐이다. 위치만 다르고 묻는 방식이 같으면 게이트는 통과하지만 **검수 렌즈 ⑤(다각화 심사)에서 major** 가 난다.

### 8-B. 설계로 만드는 축 (교육적 판단 — 여기가 승부처)

한 지문에서 5~8문항을 만들 때 **아래 축을 조합해 서로 다른 인지 작업**을 요구하라. 각 문항의 `point:` 는 이 조합을 그대로 적으면 된다.

#### 축 ① 조응 거리 (가장 강력한 난이도 조절기)

| 등급 | 구조 | 난이도 |
|---|---|---|
| 문장 내 | 선행사와 표적이 **같은 문장**, 절만 다름 (주-목 전환) | BASIC~INTERMEDIATE |
| 인접 문장 | 바로 앞 문장의 주어/목적어를 받음 | BASIC |
| 원거리 | 사이에 **문장 1~2개**가 끼어 있음 | INTERMEDIATE |
| 개념 지시 | 앞 문장 **전체가 정의한 개념**을 `it`/`this`/`that distinction` 이 받음 | KILLER |

#### 축 ② 대명사 문법 범주 (표층을 갈아 끼운다)

`them`(복수 목적격) / `they`(복수 주격) / `it`(단수 목적·주격) / `its`·`their`·`her`·`his`(소유격) / `this`·`these`·`those`(지시) / `one`·`ones`(대용).
→ 소유격 표적은 "누구의 것인가"를, 지시 표적은 "어느 범주인가"를 묻게 되어 **인지 작업 자체가 다르다**. 한 유닛에서 같은 대명사 형태를 3개 넘게 쓰지 마라.

#### 축 ③ 선행사의 의미 유형

사람·집단 / 사물·자료 / **추상 개념** / 사건·과정 / 명제·주장.
→ 추상 개념·명제를 받는 자리가 KILLER 급이다(선지가 명사구로 잘 안 떨어져 설계가 어렵다 — 다만 **문장 전체를 받는 대명사는 금지**, `prompts-reference.ts:89`).

#### 축 ④ 최근접 명사와 정답의 관계 (미끼 지형)

| 유형 | 설명 | 목표 난이도 |
|---|---|---|
| 최근접 = 정답 | 위치만으로 풀린다 | BASIC |
| 최근접이 수 불일치로 탈락 | 문법 하나로 걸러짐 | BASIC~INTERMEDIATE |
| 최근접이 **수·격 모두 일치**하는데 의미역으로 탈락 | 역할 전도 판단 필요 | INTERMEDIATE |
| 최근접이 **문법적으로 완벽**한데 **논리로만** 탈락 | 앞뒤 문장의 인과·대조를 읽어야 뒤집힘 | **KILLER** (`prompts:46`) |

#### 축 ⑤ 논지 위치 (헌법 §7-1)

도입 통념 / 전환점 / 기제 설명 / 사례 / 결론 — 표적이 놓인 대목을 문항마다 달리하라. 자연스레 축 ①·③이 함께 움직인다.

#### 축 ⑥ 오답 기제 팔레트 (헌법 §3 + `prompts-reference.ts:92-99`)

기본 4종을 **문항마다 배치를 바꿔** 쓴다 — 어느 라벨에 최강 미끼를 두는가도 축이다.

| 기제 | 정의 | (L,F) 대응 |
|---|---|---|
| 최근접 명사 함정 | 밑줄 대명사 **바로 앞**의 명사구. 위치·수·격까지 맞음 | L4 / F1 |
| 역할 전도 | 지칭 대상과 짝을 이루는 반대편(행위자↔피행위자, 제공자↔수혜자) | L6 / F6 |
| 범위 이동 | 실제 지칭보다 한 단계 넓거나(개별→전체) 좁은(제도→조항) 명사구 | L1 / F3 또는 F5 |
| 다른 마디의 주역 | 지문 다른 대목의 주역. 이름값은 큰데 이 자리 후보가 못 됨 | L7 / F2 |

**소재 구속(절대)**: 다섯 선지 전부 **지문에 실재하는 서로 다른 명사구**의 한국어 번역이어야 한다(`prompts:97`). 지어낸 후보는 함정이 아니라 장식이다.

### 8-C. 5문항 유닛 설계 예시 (프로브에서 실제 통과시킨 배치)

| # | 난이도 | 표적 | 축 ① 거리 | 축 ② 범주 | 축 ③ 선행사 | 축 ④ 미끼 지형 |
|---|---|---|---|---|---|---|
| 1 | BASIC | `Her` | 인접 문장 | 소유격 | 사람(개인) | 최근접이 수 불일치로 탈락 |
| 2 | INTERMEDIATE | `them` | 인접 문장 | 복수 목적격 | 사물(기록) | 최근접이 주어라 역할로 탈락 |
| 3 | INTERMEDIATE | `it` | 문장 내(절 전환) | 단수 목적격 | 추상(증명) | 최근접이 주체라 의미역으로 탈락 |
| 4 | KILLER | `it` | 개념 지시(앞 문장 전체) | 단수 목적격 | 추상 개념(대조) | 최근접이 수·격 완벽, 논리로만 탈락 |
| 5 | KILLER | `them` | 문장 내(대조절) | 복수 목적격 | 사물(유물) | 최근접이 복수 일치, 논리로만 탈락 |

→ 5개 `surroundingText` 가 전부 달라 `ANSWER_DUPLICATE` 미발화, `point:` 5개 전부 달라 `POINT_DUPLICATE` 미발화. **`gateUnit().ok === true` 실측 확인.**

### 8-D. 지문이 표적을 5개 못 내놓을 때

`REFERENCE_PRONOUN_LIST` 22종 중 지문 시작 20자 이후에 있고, 45자 안에 같은 대명사 중복이 없고, 그 문장이 지문에서 유일한 출현 — 이 셋을 만족하는 자리를 먼저 **전수 열거**하라. 5개 미만이면 **헌법 §9-10 에 따라 개수를 줄여 보고**하고 사유를 남긴다. 억지로 채우면 `문맥을 만들 수 없음`·`2회 등장` 반려가 무더기로 난다.

---

## 부록 — 검증 재현

```bash
./node_modules/.bin/tsx qbank/work/_probe-REFERENCE.ts   # ALL PASS
npx tsx scripts/_test-md-reference.ts                    # 정본 픽스처 전수
```
