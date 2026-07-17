# Retry-envelope closure v1 (design only)

Snapshot: 2026-07-15 KST, Git HEAD `467c6d107137a91088d3eba1620ba4036a63d709`.

## 결론

현재 네 셀(`STANDARD|PREMIUM × BLANK_INFERENCE|GRAMMAR_ERROR`)의 엔진 1회 실행에는 소스로 증명되는 절대 호출 상한이 없다. 기존 감사의 주된 결론은 맞지만, 원인을 환경변수 두 개로만 적으면 불완전하다. 같은 값이 공개 함수 인수로 다시 유입되며, `Infinity`, `NaN`, 큰 정수에 대한 호출 경계 정규화도 없다. 또한 Workbench Trigger의 작업 재시도 환경변수도 같은 무상한 판독기를 사용하므로, "엔진 실행 1회"가 아니라 "Trigger에 제출된 문항 배정 1건"을 단위로 잡으면 별도의 무상한 배수가 하나 더 있다.

최소 폐쇄안은 세 종류의 재시도를 분리한다.

1. **transport application retry (`R`)**: `generateQuestionObject`의 `for (attempt=0; attempt<=maxRetries)`와 사다리의 파싱 재호출.
2. **AI SDK retry (`K`)**: `generateObject`/`generateText` 한 번 안에서 일어나는 숨은 provider 재호출.
3. **quality-pass / task retry (`E`, `T`)**: `runQuestionGenerationWithEmptyRetry`의 바깥 품질 패스와 Trigger 작업 전체 재시도.

프로덕션 기본값을 바꾸지 않는 권고 상한은 `R=2`, `K=2`, `E=2`, `T=2`다. 환경변수뿐 아니라 각 공개 인수의 실제 소비 지점에서 다시 정규화해야 한다. 이 네 상한을 모두 적용하면 기존 저장소 기본 진단값 648/162/675/378 physical fetch가 엔진 실행 1회의 절대 상한이 된다. Trigger 작업 전체의 보수적 상한은 각각 두 배다.

연구 런타임에서는 환경변수나 러너 인수를 이용하지 않고, ALS가 활성화된 경우 서버 소유의 동결 정책 `R=0, K=0, ladderParseRetry=0, structuredRepair=false`를 주입한다. 이것은 **등록된 provider stage 하나당 single-dispatch**를 뜻한다. 바깥 strict/relaxed/scarce/salvage 패스는 서로 다른 연구 stage이므로 자동으로 한 번이 되지 않는다.

이 디렉터리는 설계·정적 검증 산출물뿐이다. 프로덕션 코드, 환경변수, API, 네트워크, DB는 변경하거나 호출하지 않았다.

## 기존 감사와의 대조

`current-callgraph-envelope-audit`의 현재 소스 산술은 재현된다. 다만 다음을 보강해야 한다.

- `GEMINI_QUESTION_MAX_RETRIES`만 상한 처리해도 `GenerateQuestionObjectArgs.maxRetries`와 `generateWithRetry(..., maxRetries)`가 큰 값을 직접 전달할 수 있다.
- `GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS`만 상한 처리해도 `runQuestionGenerationWithEmptyRetry(..., {maxAttempts})`와 Phase-C 러너 인수가 큰 값을 직접 전달할 수 있다.
- `WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS`도 무상한이다. 기존 4셀 표는 Trigger 작업 전체가 아니라 엔진 호출 1회의 표로 명명해야 한다.
- 현재 연구 런타임이 활성화되어도 SDK `maxRetries`는 기본 2이고, 사다리 파싱 재호출은 최대 1회 남는다. 한 lease만 등록한 controller가 두 번째 물리 호출을 거부하는 것은 `K=0`을 설정했다는 증거가 아니다.
- PREMIUM strict `experimental_repairText`는 첫 구조화 응답 이후 `QUESTION_JSON_REPAIR`를 추가로 시도할 수 있다. exact controller가 이를 거부할 수는 있지만, 런타임 자체가 single-dispatch인 것은 아니다. 연구 strict 경로에서는 callback을 설치하지 않아야 한다.
- ordinary `questions: z.array(...)`에는 여전히 최대 길이가 없다. 아래의 `candidateResponses`는 완성 문항을 낼 수 있는 **논리 SDK 응답 기회**이지, wire에서 방출 가능한 문항 객체 수의 상한이 아니다. ordinary 문항 객체 수는 이 변경만으로는 계속 schema-unbounded다.
- `forceJsonFallback`/`json_object` 연구 stage는 retry를 0으로 만들어도 구조적 cardinality가 고정되지 않는다. exact 후보 stage로 등록하지 못하게 하는 기존 controller 규칙은 계속 필요하다.

## 최소 코드 변경 지도

### 1. `src/lib/concurrency-config.ts`

- 기존 범용 `readPositiveIntegerEnv`는 다른 동시성 설정에 영향을 주지 않도록 유지한다.
- 문제 생성 전용 상수를 추가한다.

```ts
QUESTION_GENERATION_APPLICATION_RETRY_HARD_CAP = 2
QUESTION_GENERATION_SDK_MAX_RETRIES = 2
QUESTION_GENERATION_OUTER_ATTEMPT_HARD_CAP = 2
WORKBENCH_QUESTION_TRIGGER_ATTEMPT_HARD_CAP = 2
```

- `readBoundedPositiveIntegerEnv(name, fallback, hardCap)`을 추가해 세 환경변수의 양의 정수 의미는 보존하되 상한만 적용한다.
- `normalizeQuestionGenerationApplicationRetries(value)`는 유한한 정수를 `0..2`로, 비정상 값은 기본 2로 정규화한다. 명시적 0은 ordinary 직접 호출에서도 보존한다.
- `normalizeQuestionGenerationOuterAttempts(value)`는 유한한 양의 정수를 `1..2`로, 비정상 값은 기본 2로 정규화한다.
- 환경변수 판독과 공개 인수 정규화를 둘 다 테스트한다. 하나만 구현하면 절대 상한은 닫히지 않는다.

배포 환경의 실제 값이 2보다 큰지는 이 설계에서 읽지 않았다. 출시 전 값 자체를 로그에 남기지 않는 redacted attestation으로 `<=2` 여부를 확인해야 한다. 큰 값이 실제 배포되어 있다면 이 변경은 의도적인 비용 상한 변경이다.

### 2. `src/lib/question-generation-research-runtime.ts`

adapter가 수치를 자유롭게 넣는 필드를 추가하지 않는다. 활성 ALS 자체를 권한으로 삼아 모듈 내부 동결 상수를 반환한다.

```ts
const RESEARCH_SINGLE_DISPATCH_POLICY = Object.freeze({
  applicationMaxRetries: 0 as const,
  sdkMaxRetries: 0 as const,
  ladderParseMaxRetries: 0 as const,
  allowStructuredRepair: false as const,
});

export function getQuestionGenerationResearchTransportPolicy() {
  return runtimeStorage.getStore() ? RESEARCH_SINGLE_DISPATCH_POLICY : undefined;
}
```

이 방식은 기존 `QuestionGenerationResearchRuntime` 구현체가 재시도 값을 위조하거나, Phase-C 러너가 환경변수로 0을 흉내 내는 것을 막는다. ordinary no-runtime 경로는 정확히 `undefined`를 받는다.

### 3. `src/lib/question-generation-llm.ts`

- 함수 진입 시 ordinary `maxRetries`를 `0..2`로 정규화하고, 연구 정책이 있으면 0으로 덮는다. 루프 조건·로그·종료 비교는 모두 이 effective 값만 사용한다.
- 다음 네 SDK 호출에 `maxRetries: effectiveSdkMaxRetries`를 명시한다.
  - strict `generateObject`;
  - prompt-JSON `generateText`;
  - JSON continuation repair `generateText`;
  - 일반 텍스트 `generateQuestionText`의 `generateText`(연구 stage는 아니지만 모듈 내 숨은 기본값 제거).
- 연구 strict 경로에서는 PREMIUM `experimental_repairText`를 설치하지 않는다. ordinary PREMIUM에는 그대로 설치한다.
- 연구 strict masked-400에서 prompt-JSON으로 내려가지 않는 기존 분기는 유지한다.
- `forceJsonFallback` 연구 후보 stage는 single-dispatch여도 exact가 아니므로 controller가 provider dispatch 전에 계속 거부해야 한다.

### 4. `grammar-premium-ladder.ts` / `grammar-solver-gate.ts`

- `fireOnce`의 직접 `generateObject`에도 explicit SDK retry를 넣는다.
- ordinary 사다리 파싱 재시도는 기존처럼 1회, 연구 런타임은 0회로 한다. 즉 루프 상한은 ordinary 2 fires, research 1 fire다.
- grammar solver는 `generateQuestionObject`를 사용하므로 별도 수치 인수를 추가하지 않는다. 회귀 테스트로 solver가 정책을 우회하지 않는지만 증명한다.
- solver의 주석 "독립 솔버 1회"는 logical gate invocation을 뜻하며, 현재 transport 기준 1회가 아님을 명시한다.

### 5. 직접 호출자

- `runQuestionGenerationWithEmptyRetry`에서 `maxAttempts`를 소비하기 직전에 `1..2`로 정규화한다. hard-coded 유형별 floor(4/5/6/10), PREMIUM cap 5, STANDARD grammar KILLER cap 4는 그대로라서 저장소 기본 동작은 변하지 않는다.
- `generate-with-retry.ts`, `question-repair.ts`, `grammar-solver-gate.ts`는 값을 재정의하지 않고 중앙 경계가 clamp하도록 둔다.
- Phase-C 러너의 `maxAttempts`는 성능 편의 인수일 뿐 예산 권한이 아니다. 2를 넘겨도 중앙에서 clamp되고, 실제 외부 패스는 registry의 derived stage가 없으면 controller가 fail-closed해야 한다.
- Workbench Trigger의 `maxAttempts`도 2로 상한 처리해야 "Trigger 배정 1건" 단위가 유한해진다.

## 정확한 상한 식

기호:

- `R`: full-schema wrapper application retry 수, production 2 / research 0.
- `K`: SDK retry 수, production 2 / research 0.
- `A=R+1`, `H=K+1`.
- `O=3A`: ordinary full-schema wrapper의 최장 호환 경로(strict → prompt JSON → JSON repair)의 논리 SDK 응답 기회.
- `X=1`: exact research full-schema wrapper. strict만 허용하고 repair callback과 prompt-JSON을 금지한다.
- `E<=2`: 바깥 러너 입력 상한. 유형별 hard-coded floor/cap 이후 strict pass 수를 `S`라 한다.
- `T<=2`: Workbench Trigger 전체 작업 시도 수.

프로덕션에서는 `A=3`, `H=3`, `O=9`. 엔진 1회 절대 상한:

| 셀 | strict `S` | candidate responses `C` | evaluation `V` | design `D` | physical `H(C+V+D)` |
|---|---:|---:|---:|---:|---:|
| STANDARD BLANK | 10 | `2O(S+2)=216` | 0 | 0 | **648** |
| PREMIUM BLANK | 2 | `2O(S+1)=54` | 0 | 0 | **162** |
| STANDARD GRAMMAR (valid-settings worst) | 6 | `2O(S+3)=162` | `O(S+1)=63` | 0 | **675** |
| PREMIUM GRAMMAR (ladder eligible) | 2 | `S(12+2O)+4O=96` | `SO=18` | `6S=12` | **378** |

Trigger 작업 전체의 보수적 상한은 위 physical 값에 `T=2`를 곱한 1296/324/1350/756이다. 이 수에는 legacy auto-planner 같은 공유 경로 호출과 외부 클라이언트의 중복 제출은 포함하지 않는다.

연구 single-dispatch에서는 `A=H=X=1`이고 사다리의 각 논리 stage도 한 번만 fire한다. 동일한 outer production topology와 `E<=2`를 유지할 때:

| 셀 | candidate slots `C` | evaluation `V` | design `D` | physical |
|---|---:|---:|---:|---:|
| STANDARD BLANK | 24 | 0 | 0 | **24** |
| PREMIUM BLANK | 6 | 0 | 0 | **6** |
| STANDARD GRAMMAR | 18 | 7 | 0 | **25** |
| PREMIUM GRAMMAR | 20 | 2 | 6 | **28** |

이 연구 표는 완전한 four-cell registry가 존재한다고 가정한 산술일 뿐 실행 허가가 아니다. 현재 registry 누락 상태는 계속 BLOCK이다.

`maxAttempts=1`을 Phase-C 러너에 넘겨도 assignment 전체 single-call이 되지 않는다. STANDARD KILLER blank는 hard-coded floor 10, STANDARD grammar valid-settings worst는 floor 6이며, 뒤에 relaxed/scarce/salvage가 남는다. 연구 문서에서는 반드시 **single-dispatch per registered stage**라고 불러야 한다.

## 제로 네트워크 테스트 계획

1. **환경/인수 경계**: 격리 child process에서 각 환경변수에 빈 값, 0, 음수, 소수, `NaN`, `Infinity`, 3, 999를 넣고 결과가 정의된 기본/상한과 일치하는지 확인한다. 같은 표를 공개 함수 인수에도 반복한다.
2. **SDK physical retry**: fake provider가 429, 429, 성공을 순서대로 반환하게 한다. ordinary는 explicit `maxRetries:2`로 3 delegate fetch, 연구 runtime은 explicit 0으로 정확히 1 fetch 후 실패해야 한다. controller가 두 번째 호출을 거부한 것을 성공으로 세지 말고 delegate/preflight attempt 수가 1임을 증명한다.
3. **wrapper application retry**: SDK retry를 0으로 고정한 fake provider가 schema-invalid 성공 응답을 내게 한다. ordinary wrapper는 최대 3 logical strict calls, 연구 wrapper는 1 call이어야 한다. PREMIUM 연구에서는 continuation repair stage가 관찰되지 않아야 한다.
4. **사다리**: 동일한 parse-failure fixture로 ordinary는 최대 2 fires, 연구는 1 fire임을 증명한다. 각 fire의 SDK 옵션도 2/0을 캡처한다.
5. **solver/repair 상속**: grammar solver와 candidate repair가 중앙 정책을 우회하는 `maxRetries` 값을 전달하지 않는지 회귀 테스트한다.
6. **outer/Trigger 상한**: `maxAttempts=999`와 환경값 999에서 strict pass 수가 저장소 기본 floor/cap을 넘지 않고 Trigger maxAttempts가 2인지 확인한다.
7. **callsite exhaustiveness**: 감사 closure 안의 모든 `generateObject`/`generateText` 호출을 AST로 열거하고 explicit SDK retry 옵션이 없는 신규 호출을 실패시킨다.
8. **산술 재검증**: 이 디렉터리의 `verify.mjs`처럼 네 셀의 default, absolute, research single-dispatch, Trigger 배수를 독립 계산한다.
9. 기존 focused tests, Phase-C wire tests, controller tests, ESLint, 전체 TypeScript를 실행한다. 실제 provider/API와 DB는 이 단계에서 0회다.

## 출시/연구 게이트

- 배포 환경 값의 `<=2` redacted attestation 전에는 "무회귀"라고 판정하지 않는다.
- source hard cap, explicit SDK option, 연구 transport policy, PREMIUM repair 차단 중 하나라도 빠지면 four-cell envelope는 BLOCK이다.
- hard cap이 구현되어도 ordinary wrapper 문항 객체 cardinality는 별도 문제다.
- single-dispatch 구현 후에도 완전한 root/repeat/repair/ladder/solver/scarce/salvage registry와 제한된 API 키가 없으면 캠페인을 시작하지 않는다.
- 프롬프트 비교(single-dispatch estimand)와 실제 장애 내성(production-parity estimand)을 같은 표본으로 섞지 않는다.

