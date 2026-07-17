# Current call-graph topology audit v2

이 번들은 2026-07-15 현재 dirty worktree의 문제 생성 엔진을 **정적·오프라인**으로 다시 추적한 결과다. 이전 `reviews/current-callgraph-envelope-audit`는 변경하지 않았다. 네트워크, 모델, API, DB, 브라우저, 시크릿/환경값 조회는 모두 0이다.

## 결론

현재 ordinary production의 한 assignment/engine execution 물리 호출 수는 소스에서 유한하게 증명된다. 새 hard cap은 application retry 2, AI SDK retry 2, caller-requested outer attempt 2, Trigger attempt 2다. 다만 STANDARD의 유형별 strict floor(4/5/6/10)는 outer request cap보다 우선하므로 실제 pass 수가 2가 되는 것은 아니다.

프리미엄 어법 사다리의 현재 최댓값은 **54 physical fetches**다.

```text
3 cycles (initial + hard regeneration 2)
× 3 stages per cycle (answer-only + add-decoys + soft repair)
× 2 fires per stage (one parse retry)
× 3 physical fetches per fire (SDK maxRetries=2)
= 54
```

- `42`는 soft repair를 사다리 전체에서 한 번만 허용한다고 잘못 센 값이다. 실제 코드는 hard regeneration 때 `repairedThisCycle=false`로 되돌린다.
- `81`은 제거된 세 번째 reasoning-fallback fire를 포함한 구식 토폴로지다.

count=1 한 engine execution의 adversarial ceiling은 다음과 같다. 각 full-schema wrapper가 compatible 최대 경로(structured → prompt JSON → continuation repair)를 끝까지 타고, 각 pass에서 후보 1개가 부분수리 대상이 된다고 둔 소스 상한이다.

| 셀 | candidate logical | design logical | eval logical | physical | Trigger crash replay(×2) |
|---|---:|---:|---:|---:|---:|
| STANDARD 빈칸 KILLER 단일빈칸 | 216 | 0 | 0 | **648** | **1,296** |
| PREMIUM 빈칸 | 54 | 0 | 0 | **162** | **324** |
| STANDARD 어법 확장설정(6-pass) | 162 | 0 | 63 | **675** | **1,350** |
| STANDARD 어법 5-marker/KILLER | 126 | 0 | 45 | **513** | **1,026** |
| PREMIUM 어법 사다리 대상 | 96 | 12 | 18 | **378** | **756** |
| PREMIUM 어법 사다리 비대상 | 72 | 0 | 18 | **270** | **540** |

여기서 logical response는 AI SDK 함수 1회다. SDK retry는 logical을 늘리지 않고 physical을 늘린다. 일반 스키마의 `questions` 배열에는 max가 없으므로, 한 wire response 안의 실제 question-object 수는 구조적으로 고정되지 않는다. 엔진은 parsing 뒤 `count=1`로 slice하지만, 이것은 wire cardinality 보장이 아니다.

## outer / salvage 경로

- STANDARD 일반 비어법: strict 4 + relaxed 1 + universal salvage 1 → 324 physical.
- STANDARD SUMMARY_WRITING: strict 5 + 2 → 378.
- STANDARD 확장형: strict 6 + 2 → 432.
- STANDARD 단일빈칸 KILLER: strict 10 + 2 → 648.
- PREMIUM 비어법: strict 2 + universal salvage 1 → 162.
- STANDARD 어법은 relaxed 뒤 scarce와 universal salvage를 모두 시도할 수 있다. KILLER rescue 분기는 relaxed 대신 rescue를 쓴다.
- PREMIUM 어법은 relaxed를 생략하지만 scarce와 universal salvage를 차례로 시도할 수 있다. strict 사다리가 give-up하면 같은 pass에서 legacy generation + candidate repair + STANDARD grammar solver가 이어질 수 있으므로 사다리와 legacy는 worst case에서 가산된다.

## Trigger replay와 durable budget

Trigger는 `maxAttempts=2`이고 claim CAS가 동일 `run.id`의 `PROCESSING` 재진입을 허용한다. 정상적으로 catch가 끝나면 먼저 job을 terminal로 만든 뒤 rethrow하므로 다음 attempt는 skip한다. 그러나 provider work 후 process crash/kill 또는 terminal write 실패가 있으면 같은 assignment가 한 번 더 시작될 수 있어 OFF 상태의 hard envelope는 최대 2배다.

durable assignment budget의 기본 mode는 **OFF**다.

- OFF: row/scope/enforcement 없음.
- AUDIT: 관측만 하며 cap이 null이다.
- SHADOW: lease/reservation은 기록하지만 max call/cost를 enforce하지 않는다.
- CANARY_ENFORCE: 선택 bucket만 enforce하고 나머지는 SHADOW다.
- ENFORCE: job ID 기준 durable lease가 Trigger attempts를 통산해 physical/cost cap을 enforce한다.

FAST와 Trigger Workbench 두 실행 경로는 budget wrapper 안에 있다. 하지만 공유 엔진의 legacy auto, direct generate-question, tutor, similar-exam 두 경로, question-set, custom-type, Korean-set 소비자는 wrapper 밖이다. 따라서 “현재 Workbench 두 경로 coverage”는 PASS지만 “모든 production engine consumer의 universal guard”는 FAIL이다.

## 모델과 비용

환경값을 읽지 않은 상태에서 증명되는 **source default**는 Standard `google/gemini-3.5-flash`, Premium qgen/grammar ladder `google/gemini-3.1-pro-preview`, grammar solver Standard다. 모두 일부 또는 전부 env override 가능하므로 deployment-effective model attestation은 아니다.

로컬 가격 증거는 `pricing/openrouter-pricing-snapshot.json` 하나만 사용했다. 그 파일의 all-active emergency rate는 Flash $2.70/$16.20, Pro $7.20/$32.40 per 1M input/output tokens다. 그러나 snapshot은 admission freshness를 이미 만족하지 못한다.

더 중요한 제한은 ordinary 엔진/Workbench request schema가 DB passage 및 최종 prompt의 input bytes를 source-level로 제한하지 않는다는 점이다. 따라서 finite call count만으로는 finite USD 총액을 만들 수 없다. `envelope.json`의 USD 값은 stale emergency output rate와 wire output cap만 사용한 **output-only reservation diagnostic**이며 ship-ready total cost cap이 아니다. fresh price, effective-model attestation, request-byte cap, ENFORCE policy가 함께 있어야 ship-ready cost를 말할 수 있다.

## 재현

저장소 루트에서 다음 명령은 파일 해시, 설치 SDK anchor, current source branch anchor, 산술, 가격 증거, manifest를 오프라인으로 검증한다.

```powershell
node experiments/question-quality-20260715/reviews/current-callgraph-topology-audit-v2/verify.mjs
```

기계 판독 결과는 `envelope.json`, 감사 closure는 `source-files.json`, 번들 고정은 `MANIFEST.sha256`에 있다.
