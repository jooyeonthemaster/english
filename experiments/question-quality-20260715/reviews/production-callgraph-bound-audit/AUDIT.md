# 프로덕션 문제 생성 호출 그래프·물리 호출 상한 독립 감사

## 판정

**FAIL / BLOCKED** — 현재 코드에는 캠페인 또는 프로덕션 요청 전체에 대해 증명 가능한 유한 물리 LLM 호출 상한이 없다. 따라서 현재 상태로는 “프로덕션 정책을 그대로 재현하되 최대 1,000문항/정해진 USD 안에서 중단된다”는 실행 보장을 할 수 없다.

이번 감사에서는 **API·DB·브라우저 호출을 한 번도 하지 않았다.** 코드를 정적으로 추적했으며, `physical call`은 애플리케이션에서 Atlas/OpenRouter로 나가는 **클라이언트 측 fetch 1회**로 정의했다. OpenRouter 내부의 공급자 재라우팅은 애플리케이션에서 관찰할 수 없으므로 이 수에 포함하지 않는다.

가장 중요한 결과는 다음과 같다.

1. 사용자가 지정한 현재 화면 `/director/workbench/questions/generate`는 설정한 문항 수를 한 번에 생성하지 않는다. 클라이언트가 각 문항을 `count=1`인 fast 요청으로 분해한다(`use-generation-handlers.ts:549-595`). fast 서버 스키마도 `count.max(1)`을 강제한다(`fast/route.ts:66-70`). 그러므로 아래 표의 기본 단위는 **현재 화면의 문항 1개짜리 서버 요청 1건**이다.
2. 저장소 기본값만 놓고도 문항 1개가 소비할 수 있는 정책상 최악 상한은 STANDARD 빈칸 KILLER **648 fetch**, STANDARD 확장 어법 **675 fetch**, PREMIUM 사다리 어법 **432 fetch**다. 270초 deadline이 보통 이 전에 실행을 끊겠지만, 즉시 실패하는 요청에는 시간 하한이 없으므로 deadline은 호출 수 상한의 대체물이 아니다.
3. `GEMINI_QUESTION_MAX_RETRIES`와 `GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS`는 양의 정수 상한이 없고(`concurrency-config.ts:1-9,133-138`), 레거시 단일/자동 경로에는 요청 또는 AI plan 크기의 유한 상한도 없다. 따라서 저장소 전체에서 환경·입력과 무관한 전역 유한 상한은 존재하지 않는다.
4. 현재 `usageEvents`, `attempts`, 비용 기록은 물리 fetch 원장이 아니다. SDK 내부 재시도, 실패 호출, JSON continuation repair 비용이 빠질 수 있어 이 값으로 cap 준수를 증명할 수 없다.

기계 판독 가능한 전체 수치와 공식은 `callgraph-bound.json`, 무네트워크 검증은 `verify-callgraph-bound.mjs`에 있다.

## 1. 실제 현재 화면 경로

현재 페이지는 `QuestionsGeneratePage`에서 공통 `GeneratePageClient`를 사용하고, 수동 생성 핸들러가 유형별 요청 수를 다음과 같이 쪼갠다.

```text
사용자 배치 설정
  └─ passage × type × repeatCount를 문항 단위 unit으로 분해
      └─ unit마다 POST /api/workbench/ai-jobs/question-generation/fast (count=1)
          └─ runQuestionGenerationWithEmptyRetry
              ├─ strict pass A회
              ├─ STANDARD: rescue/relaxed pass
              ├─ rejection-pool 재승인(0 LLM) 또는 scarce/salvage pass
              └─ pass마다 type 생성 + 조건부 candidate repair + 조건부 solver
```

근거:

- 페이지 연결: `src/app/(director)/director/workbench/questions/generate/page.tsx:3-9`
- UI의 unit 분해와 `count: 1`: `src/app/(director)/director/workbench/generate/use-generation-handlers.ts:549-595`
- fast 요청 스키마의 `count=1`: `src/app/api/workbench/ai-jobs/question-generation/fast/route.ts:66-81`
- fast 엔진 호출과 270초 deadline: 같은 파일 `509-541`
- 유형별 pass는 `Promise.all(plan.map(...))`: `run-question-generation.ts:423-427`

사용자가 한 번에 20문항을 누르면 아래 “문항 1개 요청” 상한이 20개 독립 요청에 적용된다. 클라이언트 동시성은 지연시간을 줄일 뿐 총 물리 호출 상한을 줄이지 않는다.

## 2. 원자 호출의 중첩 상한

### 2.1 AI SDK 내부 재시도

락 파일은 `ai@6.0.99`를 고정한다(`package-lock.json:9428-9437`). 이 버전의 `generateObject`와 `generateText`는 `maxRetries`를 넘기지 않으면 기본 재시도 2회, 즉 SDK operation당 최대 **3 physical fetch**를 수행한다. 프로덕션 호출은 어느 곳에서도 AI SDK의 `maxRetries`를 명시적으로 0으로 고정하지 않는다.

이를 `H=3`이라 하자.

### 2.2 `generateQuestionObject` 한 번

`generateQuestionObject` 자체가 다시 `attempt=0..maxRetries` 외부 루프를 가진다(`question-generation-llm.ts:234-262`). 저장소 기본 `maxRetries=2`이므로 외부 시도는 3회다.

일반 외부 시도 한 번의 가능한 최악 경로는 다음과 같다.

```text
structured generateObject       최대 H=3
  └─ masked 400 / grammar-too-large
      └─ prompt-JSON generateText 최대 H=3
          └─ parse/schema 실패
              └─ JSON repair generateText 최대 H=3
합계                              최대 3H=9
```

근거:

- structured call과 PREMIUM `experimental_repairText`: `question-generation-llm.ts:322-351`
- masked 400/compiled grammar fallback: `376-406`
- prompt-JSON `generateText`: `588-651`
- fallback 결과의 continuation repair: `657-691`
- repair `generateText`: `725-797`

따라서 저장소 기본값의 일반 `generateQuestionObject` 한 번은

`G = (R+1) × 3H = 3 × 9 = 27 physical fetch`

이다. Claude 전용 `forceJsonFallback`은 structured 단계를 건너뛰므로

`F = (R+1) × 2H = 3 × 6 = 18`

이다. 현재 기본 PREMIUM QGEN은 Gemini 3.1 Pro라 이 강제 분기는 기본적으로 발동하지 않는다(`atlas-ai.ts:138-141`, `run-question-generation.ts:748-752`).

중요하게도 PREMIUM structured parse repair와 masked-error fallback을 한 외부 시도에서 동시에 모두 타지는 않는다. 그래서 일반 외부 시도 상한은 12가 아니라 9다. 반대로 prompt-JSON fallback 안의 repair는 같은 시도에서 실제로 이어질 수 있으므로 6을 반드시 예약해야 한다.

### 2.3 PREMIUM 어법 사다리

사다리의 `fireOnce`도 AI SDK `generateObject`를 직접 부르며 SDK 재시도 상한 `H=3`을 상속한다(`grammar-premium-ladder.ts:490-537`).

`callLadderModel`은 다음 세 번의 `fireOnce`까지 갈 수 있다.

1. 첫 호출이 parse/schema 오류
2. parse retry가 non-parse 400/reasoning 오류
3. reasoning fallback

루프와 fallback 근거는 `grammar-premium-ladder.ts:557-593`이다. 따라서 한 stage는 최대 `3H=9 fetch`다.

전체 사다리의 정책상 최장 성공적 제어 흐름은 다음과 같다.

- 최초 split: answer-only + add-decoys = 2 stages
- hard regeneration 최대 2회, 각 split 2 stages = 4 stages
- 최초 cycle 및 각 regeneration cycle에서 soft repair 1회 = 최대 3 stages
- 총 9 stages

`GRAMMAR_PREMIUM_MAX_REGENS=2`는 `grammar-premium-ladder.ts:57`, split/repair loop는 `672-776`에 있다. 따라서 사다리 자체 상한은

`L = 9 stages × 9 fetch = 81 physical fetch`

다.

사다리가 81회를 다 쓰고 hard-block budget으로 give-up한 뒤에도 기존 PREMIUM 경로가 실행된다(`run-question-generation.ts:1047-1154`). 그 결과 strict pass 한 번에 사다리 81 + legacy 생성 27 + candidate repair 27 + STANDARD grammar solver 27 = **162 fetch**가 가능하다.

## 3. pass 내부 호출 그래프

`n`을 한 plan item이 요청한 문항 수라 하면, 한 `runQuestionGeneration` pass의 상한은 다음과 같다.

| 유형/모드 | 한 pass의 물리 상한 | 근거 |
|---|---:|---|
| 영어 비어법 | `G(1+n)` | 유형 묶음 생성 1회 + 후보별 full-schema repair 최대 1회 |
| 영어 어법 strict/relaxed, legacy | `G(1+2n)` | 생성 + 후보별 repair + 후보별 STANDARD solver |
| 영어 어법 scarce | `G(1+n)` | scarce는 solver를 생략 |
| PREMIUM 사다리 eligible 어법 strict (`n=1`) | `L+3G=162` | 사다리 give-up + legacy 생성/repair/solver |
| KO strict + `needsSolverGate` | `G(1+n)` | KO는 candidate repair를 건너뛰고 후보별 solver만 실행 |
| KO 나머지 | `G` | 묶음 생성 1회 |

후보 repair 조건은 영어 후보의 blocking error가 1~3개이고 deadline 전일 때다(`run-question-generation.ts:1255-1261`). 비어법은 모든 코드가 repair 대상이며, 어법은 특정 설계 결함이면 건너뛴다(`run-question-generation.ts:231-245`). repair는 설명만 고치는 경우에도 별도 저가 text call이 아니라 **전체 response schema를 다시 생성하는 `generateWithRetry`**다(`question-repair.ts:296-330`). 따라서 “answer/explanation repair는 candidate slot 밖의 작은 비용”으로 계산하면 안 된다.

어법 solver는 생성 plan과 무관하게 STANDARD 모델을 사용하고 strict와 relaxed에서 후보별 한 번 실행된다(`run-question-generation.ts:1416-1437`, `grammar-solver-gate.ts:75-119`). KO solver는 strict에서만 실행된다(`run-question-generation.ts:1370-1409`). 두 solver 모두 내부적으로 동일한 `generateQuestionObject`를 쓰므로 최악 상한은 각각 `G`다.

## 4. strict·relaxed·salvage 외부 사다리

저장소 기본 `E=2`일 때 strict pass 횟수 `A`는 이름의 “empty retry max attempts=2”보다 훨씬 크다.

| 조건 | STANDARD `A` | PREMIUM `A` |
|---|---:|---:|
| 일반 유형 | 4 | 2 |
| SUMMARY_WRITING | 5 | 2 |
| 확장형: SUMMARY_COMPLETE_MC, GRAMMAR_CHOICE_COMBO, IRRELEVANT slot>5, 어법 marker>5/answer>1, 명시적 빈칸 paraphrase/double-negative | 6 | 2 |
| single-blank BLANK_INFERENCE KILLER | 10 | 2 |
| STANDARD GRAMMAR_ERROR KILLER | 4 고정 | 해당 없음 |

근거는 `run-question-generation.ts:1569-1599`다. PREMIUM은 `min(5,E)`이지만 STANDARD의 일반 분기는 `max(base,E)`다.

strict 소진 후에도 다음 pass가 가능하다.

- STANDARD 비어법: relaxed 1회 + rejection pool이 비면 universal salvage 1회
- STANDARD 어법: rescue 또는 relaxed 1회 + grammar-scarce 1회 + universal salvage 1회
- PREMIUM 비어법: universal salvage 1회
- PREMIUM 어법: grammar-scarce 1회 + universal salvage 1회

pool에서 기존 후보를 재승인하면 LLM은 0회지만, 물리 상한은 pool이 비었거나 모든 후보가 fatal이라 두 생성 pass가 모두 실행되는 경로로 계산해야 한다. 구현 근거는 `run-question-generation.ts:1654-1747,1829-1931`이다.

## 5. 현재 fast 경로의 유형별 기본환경 상한 (`count=1`)

아래 숫자는 저장소 기본 `R=2`, `E=2`, AI SDK hidden retry=2를 쓴다. 실제 배포 환경의 값을 확인했다는 뜻은 아니다. 표의 “STANDARD 최대”는 해당 유형에서 UI가 허용하는 설정/난이도 분기 중 더 큰 값이다.

| 유형 | STANDARD 기본/최대 | PREMIUM 최대 | 상한을 키우는 분기 |
|---|---:|---:|---|
| BLANK_INFERENCE | 324 / **648** | 162 | single-blank KILLER `A=10`; paraphrase/double-negative는 432 |
| GRAMMAR_ERROR | 513 / **675** | **432** | STANDARD 확장 설정 `A=6`; PREMIUM ladder eligible |
| GRAMMAR_CHOICE_COMBO | **432** | 162 | extended `A=6` |
| SUMMARY_COMPLETE_MC | **432** | 162 | extended `A=6` |
| IRRELEVANT | 324 / **432** | 162 | slotCount>5 |
| SUMMARY_WRITING | **378** | 162 | `A=5` |
| VOCAB_CHOICE, SENTENCE_ORDER, SENTENCE_INSERT | 324 | 162 | 기본 |
| TOPIC, MAIN_IDEA, TOPIC_MAIN_IDEA, TITLE | 324 | 162 | 기본 |
| IMPLIED_MEANING, REFERENCE, CONTENT_MATCH | 324 | 162 | 기본 |
| CONDITIONAL_WRITING, SENTENCE_TRANSFORM, FILL_BLANK_KEY | 324 | 162 | 기본 |
| SUMMARY_COMPLETE, WORD_ORDER, TOPIC_SENTENCE_WRITING | 324 | 162 | 기본 |
| GRAMMAR_CORRECTION, CONTEXT_MEANING, SYNONYM, ANTONYM | 324 | 162 | 기본 |

현재 registry에는 영어 유형이 25개가 아니라 **26개**다(`constants.ts:3-30`). `TOPIC_MAIN_IDEA`를 포함한 26개 전부를 `callgraph-bound.json`에 개별 행으로 고정했다.

계산 예:

- 일반 STANDARD 비어법: `(A+2) × G × (1+n) = (4+2)×27×2 = 324`
- KILLER 빈칸: `(10+2)×27×2 = 648`
- 확장 STANDARD 어법: `(6+1)×27×3 + 2×27×2 = 675`
- PREMIUM 사다리 어법: `2×(81+3×27) + 2×27×2 = 432`
- 사다리 비대상 PREMIUM 어법: `2×27×3 + 2×27×2 = 270`

이 값은 실제 평균이나 기대값이 아니다. 예산 컨트롤러가 “절대 초과하지 않는다”고 주장하려면 예약해야 하는 **정책상 최악 envelope**다.

## 6. 다른 프로덕션 진입점

### Fast 경로 — 현재 화면의 기본

- 서버 count는 정확히 1이다.
- 270초 deadline이 있다.
- 서버 내부 physical-call cap은 없다.
- 사용자 배치 전체의 요청 수/physical/USD 합계 cap도 없다.

### Trigger 비동기 경로

`/api/workbench/ai-jobs/question-generation`은 count 1~50을 허용하고 Trigger task로 넘긴다(`question-generation/route.ts:28`). task는 동일 엔진을 `maxAttempts=E`, 540초 deadline으로 부른다(`workbench-question-generation.ts:268-295`). task 자체 retry 기본값도 2다(`concurrency-config.ts:115-116`, task `130-136`).

일반적인 caught failure는 먼저 job을 FAILED로 기록하고 다시 throw하므로 다음 Trigger attempt가 terminal status를 보고 건너뛴다(`workbench-question-generation.ts:165-167,405-464`). 그러나 프로세스가 provider 호출 후 terminal DB 기록 전에 죽으면 다음 task attempt가 전체 생성을 다시 시작할 수 있다. durable provider ledger는 이 crash window에서도 동일 job envelope를 공유해야 한다.

### 레거시 `/api/ai/generate-question`

동일 엔진과 270초 deadline을 쓰지만 요청 `count`에 서버 상한이 없다(`generate-question/route.ts:155-165,310-338`). 한 type generation call이 n문항을 묶어도 후보 repair/solver는 문항별이므로 위 공식의 `n`에 그대로 대입한다.

### 레거시 `/api/ai/generate-questions-auto`

먼저 planning용 `generateQuestionObject` 1회, 즉 최대 `G`를 추가로 쓴 뒤 plan 전체를 엔진으로 보낸다(`generate-questions-auto/route.ts:147-208`). `planSchema`는 plan 길이와 item count를 제한하지 않는다(`schemas.ts:4-20`). 그러므로 입력 및 모델 출력과 무관한 요청 단위 유한 상한을 증명할 수 없다.

### 공용 엔진의 다른 호출자

custom type, tutor program, question set, Korean set, similar-exam generation도 동일 엔진을 사용한다. 대부분 기본 `E`를 그대로 상속하며 별도 physical/USD cap이 없다. 이 감사의 수식은 각 호출자의 plan과 상위 loop 횟수에 다시 합산해야 한다.

## 7. 비용·호출 관측의 누락

현재 telemetry를 physical ledger로 사용할 수 없는 이유는 다음과 같다.

1. `generateQuestionObject`의 반환 `attempts`는 wrapper outer index 기반이다. SDK hidden retry 횟수와 JSON continuation call을 세지 않는다(`question-generation-llm.ts:357-365,709-715`).
2. prompt-JSON fallback은 첫 `generateText`의 usage만 반환하며 continuation repair의 usage를 폐기한다(`635-715,764-797`).
3. PREMIUM `experimental_repairText`도 repair call의 usage를 outer 결과에 합산하지 않는다(`322-341`).
4. wrapper가 최종 성공하지 못하면 `generateWithRetry`의 `onUsage`가 호출되지 않는다(`generate-with-retry.ts:26-39`). 실패 fetch 비용은 상위 `usageEvents`에 나타나지 않는다.
5. 사다리 실패는 `usage=undefined` 이벤트를 내고, 성공 usage도 그 SDK operation의 앞선 실패 retry 비용을 포함한다고 보장할 수 없다(`grammar-premium-ladder.ts:495-537`).
6. `atlasResearchFetch`는 research scope가 없으면 정확히 native delegate로 통과한다(`atlas-research-fetch-boundary.ts:1096-1105`). 현재 프로덕션 화면 호출에는 fail-closed scope나 durable lease가 없다.

따라서 `usageEvents.length`, `generationResult.attempts`, 현재 비용 테이블의 합은 “실제 physical calls ≤ cap” 또는 “실제 USD ≤ cap”의 증거가 아니다.

## 8. 예산 컨트롤러가 보장해야 할 불변식

캠페인 API를 열기 전에 최소한 다음을 모두 충족해야 한다.

1. endpoint, model, plan, schema, parser, prompt, retry policy, max-output-token, price snapshot의 hash allowlist를 고정한다.
2. SDK retry를 포함한 **모든 provider fetch 직전** physical slot 1개와 보수적 token/USD lease를 원자 예약한다.
3. 실패, timeout, abort, invalid JSON, schema failure, unknown usage도 호출 1회로 세며 unknown cost는 0원이 아니라 예약 최악값으로 정산한다.
4. root operation → candidate → type/plan → quality mode → stage → logical attempt → physical ordinal의 durable lineage를 기록한다.
5. JSON repair, prompt-JSON fallback, answer-only, add-decoys, ladder repair, legacy candidate repair, solver 각각을 명시적 child scope로 묶는다.
6. process crash/Trigger retry 후에도 동일 job/campaign 원장을 재사용한다. 새 프로세스가 cap을 초기화하면 안 된다.
7. candidate cap, physical-call cap, USD cap을 동시에 요구한다. deadline은 네 번째 보조 stop일 뿐이다.
8. request count, plan length, 중복 type item, `R`, `E`, task retry, max token을 서버 측 유한 범위로 검증한다.
9. 한 assignment를 시작하기 전에 남은 최악 envelope 전체를 예약하거나 시작하지 않는다. cap 때문에 중간 policy를 잘라놓고 production parity라고 부르면 안 된다.
10. `Promise.all`과 여러 fast 요청이 동시 실행되어도 campaign cap은 하나의 원자 카운터를 공유한다.
11. scope/controller 없음, ledger write 실패, 가격 불명, model/endpoint drift, response clone 미정산은 전부 fail closed다.
12. 종료 시 provider boundary observation과 ledger physical ordinal이 누락·중복 없이 1:1인지 재검증하고, 불일치 phase는 전부 무효 처리한다.

## 9. 불확실성과 상한 해석

- 이 감사는 저장소 기본값을 계산했다. 실제 Vercel/Trigger 환경의 `R`, `E`, model override를 읽지 않았으므로 **배포환경 attestation이 아니다**.
- AI SDK 버전은 lock file의 6.0.99를 기준으로 했다. SDK upgrade 시 hidden retry 기본값 검증이 깨지도록 verification script가 고정한다.
- provider 내부의 투명 재라우팅/재시도는 한 애플리케이션 fetch 안에서 일어날 수 있으며 이 감사가 세지 못한다. 비용 lease는 provider 청구 응답까지 보수적으로 처리해야 한다.
- 270/540초 deadline은 실제 실행에서 많은 장기 호출을 잘라 상한보다 낮게 만들 수 있다. 그러나 즉시 오류는 매우 빠르게 중첩될 수 있어 deadline으로 물리 호출 수를 증명할 수 없다.
- 상한은 가능한 제어 흐름의 합이다. 평균 비용 추정이나 발생 확률이 아니다.
- working tree가 dirty하므로 보고서의 source SHA-256과 검증 스크립트가 감사 스냅샷을 고정한다. 관련 파일이 바뀌면 이 상한은 재감사해야 한다.

## 10. 재현

네트워크·DB를 사용하지 않는 검증:

```powershell
node experiments/question-quality-20260715/reviews/production-callgraph-bound-audit/verify-callgraph-bound.mjs
```

검증은 다음을 확인한다.

- 26개 영어 registry 유형의 누락/중복 없음
- `H=3`, `G=27`, `F=18`, `L=81` 산술
- 324/378/432/513/648/675 유형 상한 산술
- fast `count=1`, UI unit 분해, wrapper 기본값, fallback/repair, 사다리, strict attempt class, no-scope passthrough source anchor
- `ai@6.0.99`와 SDK default retry=2
- source snapshot SHA-256 drift

## 최종 결론

현재 구조는 평균적으로 이 상한까지 가지 않더라도, **작은 “문항 1개” 요청 안에 wrapper retry × SDK retry × JSON repair/fallback × 품질 재생성 × candidate repair × solver × premium grammar ladder가 곱셈식으로 중첩**된다. 이 상태에서 후보 수만 1,000으로 제한하거나 `usageEvents`만 더하는 것은 비용·호출 안전장치가 아니다.

실험 실행 전 필수 선행조건은 두 가지다.

1. 위 호출 그래프를 그대로 수용하는 durable pre-fetch lease/controller를 모든 실제 호출 stage에 연결한다.
2. 환경·입력·SDK retry를 유한값으로 freeze한 뒤, assignment별 최악 envelope가 남은 physical/USD budget 안에 들어갈 때만 시작한다.

이 두 조건과 독립 재감사가 통과하기 전에는 production-parity API campaign을 시작하면 안 된다.
