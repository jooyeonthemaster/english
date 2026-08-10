# md-qgen 전 유형 승차 스펙 (확정 스펙 — 단일 진실원)

> **이 문서가 구현 함대의 유일한 지시서다.** 채팅 맥락·연구노트(`experiments/*/research-note.md`,
> `research-ledger.md`)는 참고 자료일 뿐 계약이 아니다. **계약은 현재 저장소에 실제로 구현되어
> 돌고 있는 빈칸(BLANK_INFERENCE)·어법(GRAMMAR_ERROR) 코드다.** 충돌 시 언제나 실코드가 이긴다.
>
> 작성: 감독(오케스트레이터) · 근거: 아래 파일 전문 정독
> 최종 갱신: 2026-07-26

---

## §0. 목표와 성공조건

### 목표
문제 생성의 **모든 유형**을 빈칸·어법이 쓰는 **md 원큐 + SSE 스트리밍 레인**으로 승차시킨다.
버릴 것: 복잡한 JSON 스키마 강제, 무거운 다단 파이프라인(어법 사다리·인라인 E-gate 검수리).
가져올 것: 마크다운 출력 계약, 결정형 정규식 파서, 0원 게이트, 실시간 사고/본문 스트리밍,
아름다운 공예 프롬프트(롤 선언 + few-shot 해부 + 오답 기제 분류학 + 자기검산).

### 우선순위 (P0 = 사용자 실장애 보고분)
| 순위 | 유형 코드 | 라벨 | 실장애 |
|---|---|---|---|
| P0-1 | `GRAMMAR_CHOICE_COMBO` | 네모 어법 | 생성 실패 — "AI 응답이 지연되어 시간 안에 생성을 마치지 못했습니다" |
| P0-2 | `SENTENCE_ORDER` | 글의 순서 | 생성 실패 — "문제 생성 중 오류가 발생했습니다" |
| P0-3 | `VOCAB_CHOICE` | 어휘 적절성 | 생성이 지나치게 느림 |
| P0-4 | `ANTONYM` | 반의어 | 지문 밑줄 라벨이 `(A)~(E)` — 수능 표준 `①~⑤` 여야 함 |
| P1 | `SENTENCE_INSERT` `IRRELEVANT` `SUMMARY_COMPLETE_MC` | 구조형 잔여 | — |
| P1 | `TITLE` `TOPIC` `MAIN_IDEA` `TOPIC_MAIN_IDEA` `IMPLIED_MEANING` `REFERENCE` `CONTENT_MATCH` | 선택형 | — |
| P2 | `SYNONYM` `CONTEXT_MEANING` `GRAMMAR_CORRECTION` 및 서술형 계열 | 잔여 | — |

### 성공조건 (객관 게이트 — "된 것 같다" 금지)
1. `npx tsc --noEmit` 통과 (에러 0).
2. `npm run lint` 신규 에러 0.
3. 해당 유형이 `md-stream` 라우트로 라우팅되고, **BASIC / INTERMEDIATE / KILLER 3난이도 전부**
   프롬프트 분기가 존재한다.
4. 파서 단위 테스트(`tests/unit`)에서 정상 md 샘플 → 파싱 → 게이트 클린 → 어댑터 → 후처리 성공.
5. 기존 빈칸·어법 경로 **바이트 무회귀**(기존 파일의 기존 함수 시그니처·문자열 불변).
6. 유형별 UI 설정이 전부 프롬프트/게이트/후처리에서 실제로 집행된다(설정 무시 구멍 0).

### 절대 금지
- 커밋·푸시·배포 금지. (배포는 `vercel --prod` 이며 사용자 건별 명시 승인 사항이다.)
- 기존 빈칸·어법의 프롬프트 문자열·파서 정규식·게이트 로직 **수정 금지**(추가만 허용).
- 한 에이전트가 자기 소유 밖 파일 수정 금지.
- 파일 500줄 초과 금지(400줄에서 분할 검토).

---

## §1. 정본 해부 — 8층 계약

빈칸·어법이 통과하는 층이 정확히 8개다. 신규 유형은 **8층 전부**를 채워야 한다.

```
[1] 라우팅       클라이언트가 md-stream 으로 보낼 자격 판정
[2] 설정 해석    UI 설정 → resolved 값
[3] 프롬프트     마크다운 출력 계약 + 공예 수사
[4] 스트리밍     OpenRouter SSE 1콜, 사고/본문 델타 emit
[5] 파서         정규식 결정형 파싱
[6] 스냅+게이트  0원 자동보정 → 0원 무결성 검사 → (반려 시) 1회 재생성
[7] 어댑터       md 객체 → 프로덕션 AI 문항 형상
[8] 후처리·저장  postProcessQuestion → shuffle → validate(기록만) → save
```

### [1] 라우팅 계약

**서버** — `src/app/api/workbench/ai-jobs/question-generation/md-stream/route.ts`
- `MD_STREAM_SUBTYPES: Set<string>` (route.ts:100) 에 코드가 있어야 한다.
- 부적격 시 **400 + `{ code: "MD_STREAM_INELIGIBLE" }`** 를 반환한다 → 클라이언트가 fast 로 폴백.
- 부적격 판정 지점 4곳: ①env 킬스위치 `QGEN_MD_STREAM=off` ②`MD_STREAM_SUBTYPES` 미포함
  ③`mdEligible` 설정 범위 밖 ④국어 지문(`isKoreanSubject`).

**클라이언트** — `src/app/(director)/director/workbench/generate/use-generation-handlers.ts`
- `MD_STREAM_TYPES: Set<string>` (:241) 에 코드가 있어야 한다.
- `NEXT_PUBLIC_QGEN_MD_STREAM === "off"` 면 전면 폴백(빌드타임 플래그).

> ⚠ **이 두 Set 은 공유 편집 지점이다. 구현 에이전트는 절대 건드리지 마라. 감독이 일괄 처리한다.**

### [2] 설정 해석 계약

```ts
const effectiveDifficulty = readQuestionTypeDifficultySetting(config.questionTypeSettings, config.difficulty);
const resolvedSettings   = resolveQuestionTypeGenerationSettings(subType, config.questionTypeSettings, effectiveDifficulty);
```
- `resolvedSettings` 는 **fast 레인과 동일한 결정 소스**(`question-type-generation-settings/dispatchers.ts`)다.
  md 레인이 자체 기본값을 만들면 "설정 무시" 버그가 난다 — 실제로 그 사고가 있었고(route.ts:452~456 주석)
  같은 실수를 반복하지 마라.
- `mdDifficulty` 매핑: `BASIC | INTERMEDIATE → 그대로`, **그 외 전부 `KILLER`**.
  ```ts
  const mdDifficulty: MdDifficulty =
    effectiveDifficulty === "BASIC" || effectiveDifficulty === "INTERMEDIATE"
      ? effectiveDifficulty : "KILLER";
  ```
- `mdEligible` — 설정이 md 프롬프트가 커버하는 범위 안일 때만 true. 범위 밖은 fast 폴백.

### [3] 프롬프트 계약 — 공예 수사 골격

`src/lib/md-qgen/prompts.ts` 의 `buildMdBlankPrompt` / `buildMdGrammarPrompt` 가 정본이다.
**모든 신규 유형 프롬프트는 아래 7블록 골격을 그대로 재현한다.**

```
[블록 1] 롤 선언 + 헤드라인 (난이도 분기)
  "너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. {헤드라인}"
  KILLER  → "…KILLER 문항 1개를 설계하라. 선지 다섯 개 하나하나에 명확한 출제 의도가 박힌
             아름다운 킬러 문항이어야 한다. 학생이 어느 지점에서 흔들릴지를 계산하고
             학생 머리 꼭대기에서 설계하라."
  BASIC/INT → "…문항 1개(난이도: 기본 — 교과서 수준 확인형 / 중급 — 모의고사 중위권, 추론 필요)를
             설계하라. 선지 다섯 개 하나하나에 명확한 출제 의도가 있어야 한다."

[블록 2] few-shot 해부 (KILLER 한정 가능)
  "## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)"
  ★ 규칙 나열보다 실물 해부가 공예를 끌어올린다(정본 주석의 확정 결론).
  ★ 반드시 "이 설계가 아름다운 이유"를 1줄 포함할 것.

[블록 3] 표적 설계 — 난이도별 3분기 (BASIC/INTERMEDIATE/KILLER 전부 필수)
  "## 표적 설계 (기본 난이도)"  → 근거 깊이 1문장, 명료한 정답
  "## 표적 설계 (중급 난이도)"  → 근거 깊이 2문장(인과·대조 연결)
  "## 표적 설계"                → 논지 수렴 자리, 근거 2문장 이상 분산

[블록 4] 오답/미끼 기제 분류학 — 같은 기제 중복 금지
  빈칸 4종: 방향반대(최매력) / 도입부함정 / 범위확대 / 근거없음(통념형)
  어법:     "학생이 무엇으로 잘못 고치고 싶어지는 자리" + 오인 축 분산 + 관성 미끼 최대 1개
  ★ 소재 구속: 오답 재료는 전부 "지문에 실재하는 소재·어휘". 지문 밖 개념 수입 금지
    (수입하면 학생이 지문을 안 읽고 소거한다 — 그건 함정이 아니라 장식이다).
  ★ 층위 일치: 다섯 선지의 문법 형식·의미 층위를 맞춰라.

[블록 5] 마감 규칙
  "## 마감 — 위반하면 시험 요령으로 뚫린다"
  - 즉사 오답 금지: 최소 2개는 상위권도 끝까지 저울질해야 한다.
  - 절대 표현(completely·never 류)을 오답에만 몰지 마라.
  - 선지 길이는 서로 ±3단어 이내.

[블록 6] 출력 전 자기검산 (사고 안에서 수행)
  "## 출력 전 자기검산 (사고 안에서 수행)"
  - 각 오답이 왜 틀렸는지 지문 근거로 한 줄씩 답해보라 — 못 대면 재설계.
  - {유형 고유 불변식 검사}
  - 오답 목록에 정답 번호를 절대 포함하지 마라.
  - 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

[블록 7] 출력 형식 (마크다운) + 지문
  "## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)"
  {리터럴 형식 — 파서와 1:1 계약}
  ""
  "## 지문"
  {passage}
```

**해설 블록 계약** (전 유형 공통):
```
정답: <①~⑤ 하나>
해설: <딱 2문장 — 근거 문장 연결과 정답 도출만. 합니다체>
오답:
① <기제이름 — 왜 매력적이고 왜 탈락인지 1문장> (정답 번호는 제외하고 오답 4개만)
...
```
`MdExplanationMode = "full" | "answer-only"` 두 모드를 반드시 지원한다.

**선지 라벨 축 (중대)**:
- 5지 선다 유형(빈칸·순서·삽입·무관·요약MC·선택형 전부·네모어법 조합·**반의어**·어휘)
  → 마크다운 선지 라벨은 **`①②③④⑤` 원문자**를 쓴다.
- `(A)~(J)` 라벨은 **지문 내부 밑줄/네모/단락 식별자**로만 쓴다(어법 밑줄, 순서 단락).
- 어댑터에서 선지 라벨을 프로덕션 축으로 변환한다:
  - 숫자 축 스키마 → `digitOptionLabel()` 로 `"1"~"5"` (adapter.ts:75)
  - 원문자 표시 축 → `circledForMarkIndex(i)` (parser.ts:664)

### [4] 스트리밍 계약

`streamOnce()` (route.ts:~168) — **수정 금지, 재사용만**.
```ts
POST https://openrouter.ai/api/v1/chat/completions
{ model, messages:[{role:"user",content:prompt}], max_tokens: 14_000, stream: true,
  usage:{include:true}, reasoning:{ enabled:true, effort:"high", exclude:false } }
signal: AbortSignal.timeout(max(10_000, timeoutMs))
```
- SSE 프레임: `{t:"r", d}` 사고 델타 · `{t:"c", d}` 본문 델타 · `{t:"meta", jobId}` ·
  `{t:"retry", reason}` · `{t:"done", ...}` · `{t:"error", message}`.
- 표시용 델타는 `sanitizeAiModelDisclosureText()` 로 모델명 마스킹(파싱용 내부 `text` 는 원문 유지).
- 시간 예산: `maxDuration = 300`(Vercel) / 내부 벽 **270_000ms** / 콜 타임아웃 `min(240_000, budgetMs())`.
- 클라이언트 이탈 시 emit 만 무시하고 생성·저장은 계속(최선 시도).

> ⚠ **max_tokens 14_000 의 근거**: 사고와 출력이 상한을 공유한다. 6k 에서 절단 실측이 있었다.
> 지문 전체를 재출력하는 유형(어법 밑줄지문·네모어법·순서 단락)은 출력이 길다 —
> 상한을 낮추지 마라.

### [5] 파서 계약

- 순수 모듈. **의존성 0**(서버·클라이언트 공용).
- `normalizeWs()` 로 비교 전 정규화: 곱슬따옴표 `''""` → 곧은따옴표, 대시 `–—` → `-`,
  `…` → `...`, 연속 공백 → 단일 공백, trim. **비교는 반드시 이걸 통과시켜라.**
- **드리프트 관용**: 모델이 지시를 안 지키는 실측 패턴을 파서가 흡수한다.
  예) 오답 목록에 정답 줄을 끼워 넣음 → `.filter(w => w.label !== answer)` 로 제거.
  구분자 공백 드리프트 → `split(/\s*……\s*/)`.
  파서는 **관대하게**, 게이트는 **엄격하게**.
- 정규식은 `^...$` + `gm` 플래그의 라인 단위 매칭이 기본.

### [6] 스냅 + 게이트 계약

**스냅(0원 자동보정)** — 게이트 반려 주계통을 먼저 흡수한다.
- `autoSnapBlankExpression` / `autoSnapGrammarMarks` / `autoSnapMultiBlankExpressions`
- 반환 `{ question, corrections: string[] }` — corrections 는 잡 result 에 기록.
- 보수 가드: 확실할 때만 교정, 애매하면 그대로 두고 게이트가 반려하게 한다.
- 단어 경계 필수: `wordBoundaryRegex()` — `"is"` 를 순차 indexOf 로 찾으면 `art"is"ts`
  단어 내부에 마커가 박히는 실사고가 있었다. 다중 등장은 **위치앵커(직전 문맥)** 로 유일 확정.

**게이트(0원 결정형 검사)** — `string[]` 반환, 빈 배열 = 클린.
정본이 검사하는 불변식 부류(신규 유형도 대응물을 반드시 만들 것):
1. **축자 정합** — 지문에서 뽑은 표현이 지문에 정말 있는가(`normalizeWs` 기준).
2. **지문 무결성** — 지문을 재출력하는 유형은, 마커를 원형으로 되돌린 **재구성본이 원문과
   완전히 일치**해야 한다(`지문 재구성 불일치` — 모델의 무단 편집을 한 방에 잡는 최강 게이트).
3. **개수 정합** — 선지 5개, 오답해설 (전체−정답)개, 마커 N개, 정답 K개.
4. **정답 축 동기** — "정답 라벨 집합"과 "실제로 변형된 자리 집합"이 일치하는가.
   (게이트와 어댑터가 서로 다른 축을 보면 오염 문항이 저장된다 — 실제 봉합 이력.)
5. **정답 누출 금지** — 오답해설에 정답 라벨이 포함되면 반려.
6. **필드 존재** — 정답·해설·고침 누락 반려.
7. **구간 비중첩** — 여러 표적을 뽑는 유형은 구간이 겹치면 반려.
8. **교사 지정 준수** — `teacherPointComplianceIssues()` (해당 유형에 포인트 기능이 있으면).

**재생성 정책** (route.ts:~860 주석 계약):
- 게이트 반려 + `budgetMs() > 30_000` 이면 **1회만** 재생성. 프롬프트에 반려 사유를 주입:
  ```
  [반려 재생성] 직전 출력이 기계 검사에서 반려되었다: {issues}. 위반을 전부 해소하고
  같은 요구사항으로 완제품을 다시 설계하라.
  ```
- 재생성 채택 조건: `retryParsed.gateIssues.length <= parsedMd.gateIssues.length` (더 나빠지면 버림).
- 재재생성 없음. 남은 반려는 **실패 + 크레딧 환불** (깨진 문항을 저장하지 않는다).
- **신규 유형은 전부 `retryEligible = true`** 로 시작한다(초기 반려율 실측이 없으므로 보수 정책).

### [7] 어댑터 계약

- `src/lib/md-qgen/adapter.ts` 패턴: `{ ok, error?, aiQuestion? }` 반환.
- **순수 매핑만** 한다. 후처리·검증·셔플은 앱 레이어(라우트) 소관.
  레이어 규칙: `lib` 은 `app/_lib` 을 import 하지 않는다.
- `keyPoints` 는 **빈 배열**로 둔다 — 합성 keyPoints 가 모델 오태깅을 학생 표면에 노출한 사고가
  있었다(adapter.ts:319~322). 신규 유형도 동일.
- `surroundingText` 는 위치 탐색 정확도에 직결 — 표현을 못 찾으면 `""` 로 두어 후처리 퍼지 탐색에
  맡긴다. `Math.max(0, -1) = 0` 으로 지문 맨앞을 오려 보내는 오배치를 만들지 마라.
- `difficulty` 는 `effectiveDifficulty` 원본을 그대로 싣는다(md 3단계가 아님).

### [8] 후처리·저장 계약

```ts
const pp = postProcessQuestion(subType, passage.content, adapt.aiQuestion);
const mapped = { ...pp.data, _typeId, _typeLabel: TYPE_LABELS[subType], _generationPlan, difficulty };
const finalQuestion = shuffleQuestionOptionsForDiversity(mapped, subType);
const qualityIssues = validateQuestionQuality({ typeId, question, passage, requestedDifficulty, ...typeCounts });
// qualityIssues 는 차단하지 않는다 — result.qualityIssues 로 기록만.
await saveGeneratedQuestionsForJob({ academyId, passageId, questions:[questionForDisplay],
                                     generationPlan, skipPassageEligibilityCheck: true });
```
- **어댑터는 최소 입력만** 만들고, 후처리가 만들어 주는 것(passageWithBlank·라벨 재부여·
  발문 정규화 등)은 **절대 어댑터에서 만들지 마라**. 이중 생성은 충돌한다.
- 각 유형의 프로세서(`src/lib/question-postprocess/processors/`)를 반드시 정독해
  "어댑터가 넘겨야 할 최소 입력"과 "후처리가 채우는 것"의 경계를 문서화할 것.

---

## §1-B. 형식 설계 철칙 — 실사용 사고에서 증류된 것 (위반 시 critical)

> 26-07-26 반의어가 **실사용에서 2연속 반려**됐다. 원인은 모델 능력도, 프롬프트 품질도
> 아니었다. **형식 계약이 과했다.**

### 철칙 1. 한 정보는 한 곳에서만 받아라 (SINGLE SOURCE PER FACT)
반의어 초기 형식은 줄마다 `| O/X |` 칸을 받아 "이 쌍이 정답인가"를 표시하게 했다.
그런데 `정답:` 줄이 이미 같은 사실을 말하고 있었다 — **중복 계약**이다.
실측 결과: 모델이 `||`(파이프 2개)를 써서 칸이 밀렸고 정답 판정이 통째로 무너졌다.
칸을 없애고 `정답:` 줄만 진실원으로 두자 실패 모드가 **사라졌다**(코드도 짧아졌다).

- 정답은 `정답:` 줄이 유일 진실원. 줄마다 정답 여부를 다시 받지 마라.
- 수정형(고침·바른짝)은 `고침:` / `바른짝:` 전용 줄. 어법 정본이 그렇게 한다.
- 라벨 줄에 받는 것은 **그 자리 고유 데이터**뿐이다(원문 표현·짝 단어·포인트 코드).

### 철칙 2. 줄당 칸 수를 최소화하라
칸 하나 = 실패 모드 하나. 칸이 3개면 구분자 드리프트 지점이 2개다.
정말 필요한 칸만 남기고, 파생 가능한 것은 코드로 계산하라.

### 철칙 3. 파서가 데이터를 조용히 버리게 두지 마라
줄 전체를 단일 정규식으로 매칭하면, 사소한 드리프트에 그 줄이 통째로 사라지고
게이트에는 **"개수 부족"으로만** 보인다. 진짜 원인이 은폐된다.
→ 줄 단위로 관대하게 파싱하고, 무엇이 잘못됐는지는 게이트가 지목하게 하라.

### 철칙 4. 반려 시 모델 원본 출력을 남겨라
라우트가 `result.mdRawText`(선두 8k)를 저장한다. 이게 없으면 "모델이 형식을 어겼나 /
파서가 못 읽었나"를 구분할 수 없어 원인 규명이 추측이 된다. 이미 배선돼 있으니
**레인이 따로 할 일은 없다** — 다만 이 사실을 알고 게이트 메시지를 설계하라
(게이트 문구가 곧 재생성 프롬프트에 실리는 피드백이다).

### 철칙 5. 게이트 메시지는 자리를 지목하라
`"어휘쌍 3개 (5개 필요)"` 는 모델에게 무엇을 고칠지 알려주지 못한다.
`"(C) O/X 표시를 인식할 수 없음(받은 값: '')"` 처럼 **어느 라벨의 무엇이 어떻게**
잘못됐는지 적어라. 재생성 성공률이 여기서 갈린다.

---

## §2. 프롬프트 확장 블록 계약 (설정 집행)

라우트의 `buildPrompt(feedback)` 이 base 프롬프트 뒤에 `extras` 를 이어붙인다. 순서 고정:

```
{base 유형 프롬프트}

{유형 세부 설정 블록 — 필요한 만큼}
{교사 지정 포인트 블록 — buildTeacherPointsPromptBlock(teacherPoints)}
{다양성 회피 블록 — diversityBlock}
{교사 추가 지시 — customPrompt}
{[반려 재생성] 피드백 — feedback}
```

- 설정 블록이 base 의 지시를 **뒤집어야** 할 때는 헤더에 명시한다:
  `"## 정답 형식 (필수 — 위의 '추상 패러프레이즈' 지시보다 우선한다)"`
- 다양성 회피: 같은 지문+유형의 최근 8건에서 표적을 뽑아 회피 목록 주입.
  **신규 유형은 자기 유형의 표적 필드를 이 수집기에 등록해야 한다**(route.ts:~640 블록).
- 병렬 배치(`variantCount > 1`)면 분산 힌트 추가.

### 질문 언어 설정
UI 에 "질문 언어(한국어/영어)" 토글이 있다. 발문 언어 집행 지점을 각 유형에서 확인하고,
md 레인에서도 동일하게 집행하라(어댑터의 `direction` 또는 후처리).

---

## §3. 아키텍처 — 레인 디스크립터(Lane Descriptor) · 파일 소유권

> 상세 근거·유형별 정밀 스펙은 **[md-qgen-recon-synthesis.md](./md-qgen-recon-synthesis.md)**
> (정찰 함대 6기 + 종합 1기 산출, 전 항목 파일:줄 실측). 이 절은 그 결론의 계약 요약이다.

### 3-1. 레인 디스크립터

신규 유형은 **`MdLane` 인터페이스 하나만 구현**하면 md-stream 라우트에 승차한다
(`src/lib/md-qgen/lane-types.ts`). 라우트는 유형이 늘어도 if-else 사슬이 늘지 않고,
정본(빈칸·어법) 분기는 `getMdLane(subType) === null` 로 **바이트 무회귀**로 남는다.

`MdLane` 이 요구하는 것: `subType` · `operationType`(과금) · `retryEligible` ·
`isEligible` · `buildBasePrompt` · `buildExtras` · `parseAndGate` · `adapt` ·
`qualityArgs` · `mdFormat` · `diversityTargets`.

⚠ **`MdAnyQuestion` 유니언은 확장하지 않는다.** `parser.ts:57-63` 이 기록한 실측
(md-lab `exam-sheet.tsx`·`question-editor.tsx` 내로우잉 컴파일 실패)이 근거다.
레인 파싱 결과는 `MdLaneParsed.question: unknown` 으로 통과시킨다.

### 3-2. 견본(EXEMPLAR) — 반의어. **이 4파일을 그대로 베껴라**

| 파일 | 역할 | 줄수 |
|---|---|---|
| `src/lib/md-qgen/prompts-antonym.ts` | 프롬프트(난이도 3분기 · few-shot · 자기검산 · 출력형식 리터럴) | ~150 |
| `src/lib/md-qgen/parser-antonym.ts` | 파서 + 스냅 + 게이트 | ~230 |
| `src/lib/md-qgen/adapter-antonym.ts` | 어댑터(후처리 경계 주석 포함) | ~110 |
| `src/lib/md-qgen/lane-antonym.ts` | 레인 디스크립터 | ~150 |
| `scripts/_test-md-antonym.ts` | 0원 픽스처 **40/40 통과** | ~230 |

견본이 실증한 것: 파싱→스냅→게이트 13종→어댑터→`postProcessQuestion` 왕복→과금 축.
**자기 유형 구현이 끝나면 이 테스트와 같은 밀도의 픽스처를 반드시 만들어라.**

### 3-3. 신규 파일 (유형별 **배타 소유** — 소유 에이전트만 편집)
```
src/lib/md-qgen/prompts-<type>.ts
src/lib/md-qgen/parser-<type>.ts
src/lib/md-qgen/adapter-<type>.ts
src/lib/md-qgen/lane-<type>.ts
scripts/_test-md-<type>.ts
```
`<type>` = `vocab` | `combo` | `order`.

### 3-4. 공용 헬퍼 (import 만, 수정 금지)

PRE-WORK 로 **이미 export 승격 완료**(감독 처리, 바이트 무변경):
```ts
// @/lib/md-qgen/parser
normalizeWs · INLINE_MARK_RE · locateMark · circledForMarkIndex
escapeRegExp · wordBoundaryRegex · countWordBoundaryMatches
snapSpanNearAnchor · snapExpressionSpan · segmentPassage
// @/lib/md-qgen/adapter
POINT_NAME · contextAround · parenLabel · digitOptionLabel
```

🚫 **절대 재사용 금지** (계약이 반대라 그대로 쓰면 100% 사고):
- `autoSnapGrammarMarks` 의 v2 "미끼 원형 교정" 분기 → VOCAB 변형 모드에서 원문과 다른 지문이 저장된다.
- `gateMdQuestion` 어법 분기의 `changed.length === answerCount` → VOCAB 변형 모드 100% 반려.
- `INLINE_MARK_RE`(전역 정규식 · `[A-J]` 대문자 전용) → lastIndex 공유 위험 + VOCAB 소문자 라벨 / COMBO `|` 2택 캡처 구조 불일치. **로컬 상수를 따로 선언하라**(견본 `INLINE_ANTONYM_MARK_RE` 참조).

### 3-5. 공유 편집 지점 — **감독 전용 (에이전트 접근 절대 금지)**
| 파일 | 지점 |
|---|---|
| `src/lib/md-qgen/lane-registry.ts` (신설) | 레인 등록 |
| `md-stream/route.ts` | S1~S15 (import · `MD_STREAM_SUBTYPES` · `mdEligible` · `operationType` · `buildPrompt` · `parseAndGate` · `adapt` · `retryEligible` · 다양성 · `qualityArgs` · `mdFormat`) |
| `use-generation-handlers.ts` | `MD_STREAM_TYPES` (C1) |
| `src/lib/md-qgen/{prompts,parser,adapter}.ts` | 정본 — **FROZEN** |
| `question-postprocess/**` · `question-quality/validators/**` · `md-lab/**` | **FROZEN** |

에이전트는 **자기 lane 의 export 시그니처만** 스펙대로 맞춘다. 배선은 감독이 한다.

---

## §4. 유형별 마크다운 형식 (확정)

> 아래는 감독이 정본 관습(라벨 축·구분자·해설 블록)에 맞춰 확정한 **형식 리터럴**이다.
> 구현 에이전트는 이 형식을 프롬프트와 파서 양쪽에 1:1로 박는다. 임의 변경 금지 —
> 형식을 바꿔야 할 근거를 찾으면 감독에게 보고하고 승인받아라.

### 4-1. `ANTONYM` (반의어) — pairCount 5~10, 정답 1개
```
밑줄지문:
<지문 전체를 한 글자도 바꾸지 말고 그대로 옮겨 적되, 표적 단어 N곳만 [[A:단어]] ~ 로 감싼다>

짝:
(A) <지문 속 단어> - <제시할 짝 단어>
(B) ...
...

정답: <(A)~ 하나 — 반의어 관계가 성립하지 않는 자리>
해설: <딱 2문장 — 정답 자리의 두 단어가 왜 반의 관계가 아닌지, 문맥상 실제 관계는 무엇인지. 합니다체>
오답:
(A) <이 쌍이 왜 올바른 반의어 관계인지 1문장> (정답 라벨 제외 N−1개만)
...
```
- 지문 마킹은 어법의 `[[A:표현]]` 인라인 관습을 그대로 재사용한다(`INLINE_MARK_RE` 공용).
- **최종 학생 표면 라벨은 `①~⑤`** — 어댑터에서 `circledForMarkIndex(i)` 로 파생한다.
  `(A)` 는 md/저장 내부 축일 뿐 표면에 나오면 안 된다. ← **P0-4 장애의 해결점**
- 게이트: 지문 재구성 일치 / 쌍 N개 / 정답 1개 / 오답해설 N−1개 / 각 단어 지문 축자 존재 /
  중복 단어 금지.

### 4-2. `VOCAB_CHOICE` (어휘 적절성) — markerCount 5~10, answerCount 1~N
```
밑줄지문:
<지문 전체 축자 + 표적 N곳만 [[A:표시할단어]] ~ 로 감싼다.
 정답 K곳은 문맥상 부적절한 단어로 교체돼 있고, 나머지는 원문 그대로다>

원형·의도:
(A) <이 자리의 원문 단어(정답 자리는 원문의 올바른 단어, 미끼는 마커 안 단어와 동일)> | <의도 1구>
...

정답: <(A)~ 하나 / K≥2면 ", " 병기>
고침: <정답 자리에 들어가야 할 올바른 단어>   ← K≥2면 `고침(B):` 형식으로 K줄
해설: <딱 2문장 — 문맥 논리와 왜 그 단어가 어긋나는지. 합니다체>
오답:
(A) <학생이 헷갈리는 지점 + 왜 이 단어가 문맥에 맞는지 1문장> (정답 라벨 제외)
...
```
- 어법(`buildMdGrammarPrompt`)의 **밑줄지문 + 원형·포인트 + 고침** 3단 구조를 그대로 이식한다.
  차이는 판단 축이 "문법"이 아니라 "문맥 의미"라는 것뿐 — 게이트·스냅·재구성 검사는 거의 그대로 재사용 가능.
- `synonymVariants` 설정이 켜지면 대체어를 동의어 계열로 강제하는 설정 블록을 추가한다.

### 4-3. `GRAMMAR_CHOICE_COMBO` (네모 어법) — 네모 N개(기본 3), 각 2택
```
네모지문:
<지문 전체 축자 + 네모 N곳만 [[A:선택지1|선택지2]] ~ 로 감싼다.
 두 후보 중 하나만 어법상 옳다>

정답조합: <(A)~(C) 순서대로 옳은 표현을 " …… " 로 연결>
① <A값> …… <B값> …… <C값>
② ...
③ ...
④ ...
⑤ ...
정답: <①~⑤ 하나>
포인트:
(A) <포인트코드 a~m 한 글자> | <왜 그 후보가 옳고 다른 하나가 틀린지 1문장>
(B) ...
(C) ...
해설: <딱 2문장 — 각 네모의 구조 근거. 합니다체>
오답:
① <어느 네모에서 왜 어긋나는지 1문장> (정답 번호 제외 4개만)
...
```
- 선지 구분자는 다중 빈칸과 동일한 **`" …… "`(공백+…+…+공백)** 리터럴 — 이미 파서 관용이 있다.
- 네모 내부 구분자는 `|`.
- 게이트: 지문 재구성 일치(네모를 정답값으로 되돌렸을 때) / 네모 N개 / 각 네모 후보 정확히 2개 /
  조합 선지 5개 / 각 선지 값 N개 / **5개 조합이 서로 다르고 전부 후보 조합 안에 있음** /
  정답 조합이 선지에 존재 / near-miss 1개 이상(한 네모만 틀린 선지).

### 4-4. `SENTENCE_ORDER` (글의 순서) — **구현 확정본**

> 규범 개정(26-07-26): 이 절의 초안(`제시문:` + 블록형)과 정찰 종합 §3-C2(`주어진글:` /
> `단락(A):` 한 줄 라벨형)가 충돌했다. **한 줄 라벨형이 확정본**이다 — 라벨 라인 방식이
> 정본(`빈칸원문(A):`·`고침(B):`)의 관습이고 파서 정규식이 결정형이기 때문이다.

```
주어진글: <지문 맨 앞 1~2문장을 한 글자도 바꾸지 말고 그대로. 개행 없이 한 줄.>
단락(A): <지문의 연속 구간을 한 글자도 바꾸지 말고 그대로. 2문장 이상. 개행 없이 한 줄.>
단락(B): ...
단락(C): ...
① <(A)(B)(C) 순열 하나 — "(B)-(C)-(A)" 형식>
② ... ③ ... ④ ... ⑤ ...
정답: <①~⑤ 하나>
해설: <딱 2문장 — 단락 간 연결 단서(지시어·연결어·정보 흐름)로 순서를 도출. 합니다체>
오답:
① <어느 연결이 왜 깨지는지 1문장> (정답 번호 제외 4개만)
...
```

**prefixVariationCount ≥ 1 일 때 2단 출력** (감독 지시 — fast 의 자기모순 정공법 해결):
```
주어진글: <지문 축자>
주어진글(변형): <위 축자본의 재진술. 학생에게는 이것만 보인다.>
```
게이트는 **축자본으로** 지문 정합을 검사하고, 어댑터가 **변형본을** `givenSentence` 로 싣는다.
fast 레인은 "프롬프트가 패러프레이즈를 지시 → 게이트가 원문 substring 요구"라는 자기모순으로
이 노브가 **1 이상이면 100% 실패**했다(정찰 X3). md 는 두 값을 분리해 그 모순을 없앤다.

⚠ **노브 의미 변경**: fast = "(A)(B)(C) 중 N개 단락의 첫 문장 패러프레이즈" →
md = "주어진 글 하나의 재진술 강도 1/2/3". 제시문이 하나뿐이라 개수를 강도로 재해석한 것이다.
UI 라벨·설명문 갱신이 필요하면 별도 과제.
- **최강 게이트**: `제시문 + 정답순서로 이어붙인 단락들` 을 `normalizeWs` 로 정규화했을 때
  **원 지문과 완전히 일치**해야 한다. 모델이 문장을 고쳐 쓰면 즉시 반려.
  (이 게이트 하나가 순서 유형 결함의 대부분을 결정형으로 잡는다.)
- 선지 순열 게이트: 5개 전부 서로 다름 / 전부 (A)(B)(C) 순열 / 정답 순열이 선지에 존재 /
  수능 관습상 첫 단락이 (A)가 아닌 순열 위주(정답이 `(A)-(B)-(C)` 면 반려 검토).

### 4-5. `SENTENCE_INSERT` (문장 삽입) — P1
```
삽입문장: <지문에서 빼낼 문장 — 지문 축자>
번호지문:
<삽입문장을 제거한 나머지 지문 전체 축자 + 삽입 후보 위치 5곳에 [[1]]~[[5]] 마커>
정답: <①~⑤ 하나>
해설: ... / 오답: ...
```
- 게이트: `번호지문에서 마커 제거 + 정답 위치에 삽입문장 삽입` == 원 지문.

### 4-6. `IRRELEVANT` (무관한 문장) — P1
```
번호지문:
<지문 전체 축자 + 문장 5개를 [[1:문장]]~[[5:문장]] 로 감싼다.
 그중 1곳만 글의 흐름과 무관한 새 문장으로 교체돼 있다>
정답: <①~⑤ 하나>
원문: <정답 자리에 원래 있던 지문 축자 문장>
해설: ... / 오답: ...
```
- 게이트: 정답 자리를 `원문` 으로 되돌린 재구성본 == 원 지문. 번호는 지문 등장 순.

### 4-7. 선택형 (`TITLE`/`TOPIC`/`MAIN_IDEA`/`TOPIC_MAIN_IDEA`/`IMPLIED_MEANING`/`CONTENT_MATCH`) — P1
```
① <선지>
② <선지>
③ <선지>
④ <선지>
⑤ <선지>
정답: <①~⑤ 하나>
해설: ... / 오답: ...
```
- 지문 변형이 없는 가장 단순한 형식. `IMPLIED_MEANING`·`REFERENCE` 는 `밑줄:` 라인 추가.
- `CONTENT_MATCH` 는 선지가 지문 내용 진술이므로 **각 선지의 지문 근거 문장**을 오답해설에 요구한다.

---

## §5. 검증 방법 (에이전트 필수 산출)

각 구현 에이전트는 **자기 유형의 단위 테스트**를 반드시 작성한다: `tests/unit/md-qgen-<type>.test.js`
(`node --test tests/unit` 로 구동 — `npm run test:unit`).

최소 테스트 케이스 5종:
1. 정상 md 샘플 → 파싱 성공 → 게이트 `[]` → 어댑터 `ok: true`.
2. 지문 무단 편집 샘플 → 게이트가 "지문 재구성 불일치" 반려.
3. 개수 위반(선지 4개 / 오답해설 개수 불일치) → 게이트 반려.
4. 오답해설에 정답 라벨 포함 → 게이트 반려.
5. 드리프트 관용(공백·따옴표 변형) → 파싱·게이트 통과.

TypeScript 소스를 테스트에서 직접 못 읽으면, 순수 함수라는 점을 이용해
기존 `tests/unit` 의 관습을 먼저 확인하고 그 방식을 따를 것.

---

## §6. 무회귀 규칙 (ZERO-REGRESSION)

1. 기존 빈칸·어법이 **바이트 무변경**으로 동작해야 한다. `git diff` 로 정본 3파일에 변경이
   찍히면 실패다.
2. 불확실한 필드·콜사이트는 보수적으로 **KEEP**. 삭제·리네임 금지.
3. 신규 유형이 md 레인에서 실패해도 **fast 폴백이 살아 있어야** 한다
   (400 `MD_STREAM_INELIGIBLE` 경로를 깨지 마라).
4. 이미 DB 에 저장된 기존 문항의 렌더가 깨지면 안 된다 — 라벨 축을 바꾸는 경우
   (반의어 `(A)` → `①`) **반드시 하위호환 처리**를 넣어라.

---

## §7. 보고 스키마 (에이전트 반환)

```json
{
  "type": "ANTONYM",
  "filesCreated": ["src/lib/md-qgen/types/antonym/prompt.ts", "..."],
  "exports": { "prompt": "buildMdAntonymPrompt", "parse": "parseMdAntonym",
               "snap": "autoSnapMdAntonym", "gate": "gateMdAntonym",
               "adapt": "adaptMdAntonymToAiQuestion" },
  "mdFormat": "<프롬프트에 박은 출력 형식 리터럴 전문>",
  "gateInvariants": ["..."],
  "settingsEnforcement": [{"key":"pairCount","how":"프롬프트 라벨 수 + 게이트 개수 검사"}],
  "difficultyBranches": {"BASIC":"...","INTERMEDIATE":"...","KILLER":"..."},
  "routeWiring": {
    "mdEligible": "<라우트에 넣을 적격 조건식>",
    "buildPrompt": "<라우트 분기 코드 스니펫>",
    "parseAndGate": "<라우트 분기 코드 스니펫>",
    "adapt": "<라우트 분기 코드 스니펫>",
    "settingsRead": "<resolvedSettings 에서 읽을 키와 기본값>"
  },
  "postProcessBoundary": "<어댑터가 넘기는 것 / 후처리가 채우는 것>",
  "regressionRisks": ["..."],
  "tests": ["tests/unit/md-qgen-antonym.test.js"],
  "tscClean": true,
  "uncertain": ["<확신 못 한 것 — 감독 판단 필요>"]
}
```
