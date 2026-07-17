# 물리 호출·후보·할당 계보 설계 (v4)

상태: 하네스 구현 및 무네트워크 적대 테스트 완료. 프로덕션 호출부 연결,
현재 소스 기준 callgraph 재고정, provider-side 지출 상한이 끝나기 전에는 실제
API phase를 열지 않는다.

## 1. 서로 다른 세 가지 수치

`candidate`라는 단어를 하나의 숫자로 뭉개지 않는다.

| 수치 | 의미 | 반환/재사용 |
|---|---|---|
| assignment `maxCandidateOutputs` | 시작 전에 잡는 최악조건 ITT 기회 envelope | 할당이 열려 있는 동안 형제 작업이 사용할 수 없다 |
| `usedCandidateOutputs` | pre-fetch lease로 실제 발급된 후보 생성 기회 | 실패·timeout·never-sent 뒤에도 queue top-up에 재사용하지 않는다 |
| `observedSemanticCandidates` | 캡처된 응답을 고정 parser로 읽어 실제 발견한 완성 문항 수 | schema-invalid라도 완성 문항이면 포함하고 모든 hash를 보존한다 |

`never_sent`는 네트워크 결과가 0임을 증명하지만, 이미 발급된 ITT 기회를 새
작업으로 바꾸지는 않는다. `unknown_after_send`는 최대 출력 가능성을 소비한
것으로 처리하며, 청구액이 확정될 때까지 할당 종료를 막는다.

## 2. 시작 전 whole-assignment admission

독립 root 작업마다 `admitAssignment`가 다음 최악조건을 한 트랜잭션에서
예약한다.

- 물리 provider 호출 수
- 후보 생성 기회 수
- 보수적 USD 상한

세 상한 중 하나라도 부족하면 provider 호출 전에 작업 전체를 거부한다. 작업이
시작된 뒤 형제 작업 때문에 retry/repair 사다리가 중간에서 잘리는 것을 허용하지
않는다. 각 물리 호출은 이후 이 envelope와 batch/campaign 상한을 동시에
소비한다. registry seal 시 모든 entry의 최대 사용 횟수, 구조적 후보 수,
`maxRequestBodyUtf8Bytes`, 최대 출력 token, 가격 증명을 합산해 각 assignment
contract가 이 전체 graph 최악조건보다 작지 않은지 검증한다.

후보 기회 envelope는 종료 뒤에도 queue top-up 근거로 되돌리지 않는다. 반면
미사용 물리 호출·USD capacity는 모든 증거와 청구가 종결된 뒤 실제 사용량으로
축소될 수 있다.

## 3. 고정 registry와 동적 child 요청

정적 root 요청은 endpoint/model/body/prompt/schema/output cardinality를 정확한
hash로 고정한다. 부모 응답에 따라 본문이 달라지는 repair, continuation, solver,
ladder child는 미래 bytes를 미리 적지 않는다. 대신 registry가 다음을 고정한다.

- derivation contract ID와 구현 artifact hash
- 허용 parent entry 목록
- stage transition (`fromEntryId -> toEntryId`)
- entry별 최대 사용 횟수
- schema, model, token cap, 구조적 최대 출력 수

runtime derivation receipt는 부모 물리 호출 ID, 부모 응답 본문 hash, exact child
body/prompt hash를 artifact와 함께 self-hash한다. controller와 ledger가 모두 이
결속을 검증한 뒤에만 child lease를 발급한다. `parent_physical_call_id`와 transition
ID는 immutable call contract에 남는다.

현재 구현은 이 receipt를 검증하는 primitive까지만 제공한다. 공개 caller는 최신
부모 physical call ID만 얻을 수 있고 trusted parent response hash나 AI SDK가 실제
직렬화할 child wire body를 사전에 얻을 수 없다. caller가 이를 재구성해 receipt를
만드는 방식은 허용하지 않는다. 실제 repair/ladder 연결 전에는 boundary가 actual
wire request를 파싱한 시점에 controller의 durable parent body·transition을 조회해
receipt를 mint/authorize하는 trusted handoff와 무네트워크 통합 테스트가 필요하다.

## 4. 응답·parser 증거

HTTP terminal evidence와 response clone evidence는 순서와 무관하게 각각
append-only로 기록한다. clone은 응답 본문 hash, served model/provider, token,
raw/upstream cost를 보존한다. trusted research response-capture 경계는 원본
stream을 직접 최대 16 MiB까지만 읽고 exact bytes를 controller private BLOB으로
넘긴다. 허용 범위의 응답은 동일 bytes로 SDK용 `Response`를 재구성한다.
`Response.clone()`의 읽지 않은 tee branch에 전체 본문이 쌓이는 경로는 쓰지 않는다.
상한 초과/읽기 실패 응답은 SDK에 전달하지 않고 증거를 남겨 fail-close한다. 반면
research scope가 없는 production fast path는 native response를 그대로 반환한다.
JSON export에는 원문을 싣지 않는다.
성공한 후보 생성 응답은 호출자가 재구성한 JSON을 신뢰하지 않고, 물리 응답마다
자동으로 다음 순서를 실행한다.

1. parser에 전달된 exact raw bytes의 hash가 clone의 응답 본문 hash와 같은지
   확인한다.
2. registry에 고정된 artifact hash와 일치하는 parser 구현을 실행한다.
3. semantic full-question disposition, 개수, 모든 normalized output hash를 하나의
   원자적 분류로 저장한다.
4. 예약 수를 넘은 출력도 버리지 않고 별도 semantic row로 모두 보존한 뒤 batch를
   breach하고 assignment를 quarantine한다.

JSON/schema가 틀렸다는 이유만으로 완성 문항을 0개로 세지 않는다. 반대로 성공
응답을 raw bytes/parser evidence 없이 `no_candidate`로 닫을 수도 없다.

## 5. crash/restart 상태 기계

registry, assignment, call contract, terminal, clone, parser evidence가 SQLite에
남으므로 새 controller는 열린 할당을 hydrate한다.

```text
lease only
  -> never_sent (명시적 증명, replay 금지)
  -> unknown_after_send (전송 여부 불명, replay 금지·billing 대기)

terminal first -> restart settle -> clone later -> restart reconcile
clone first    -> terminal 대기  -> terminal later -> restart settle/reconcile
usage final    -> exact response parser -> gate decision -> assignment close
```

어느 경우에도 동일 physical call을 자동 재전송하지 않는다. HTTP terminal이 있는
호출은 clone/body evidence 없이는 종료할 수 없고, usage가 final이 아니거나 후보
결정이 pending이면 종료할 수 없다.

## 6. 가격 증명

각 entry는 다음 자료를 self-hash한다.

- 허용 provider 목록 hash와 가격 snapshot hash
- 허용 provider 중 최대 input/output USD rate
- server token overhead upper bound와 1보다 큰 safety multiplier
- canonical UTC `validAt`/`validThrough` (최대 24시간)

새 assignment와 물리 call 시각이 이 창 밖이면 fail-close한다. 이는 로컬
과소예약을 막기 위한 계약이지 외부 결제를 물리적으로 차단하지는 않는다. 실제
phase 전에는 동일 범위의 provider project/key hard spending ceiling이 별도로
필요하다.

## 7. API phase 전 남은 필수 조건

1. 현재 프로덕션 소스와 환경을 기준으로 callgraph/envelope를 다시 산출하고 독립
   검수 hash를 registry에 고정한다.
2. root, retry, continuation, repair, solver, PREMIUM ladder의 모든 실제 호출부에
   scope와 stage transition을 연결한다.
3. raw OpenRouter response wrapper를 직접 읽는 parser 구현과 artifact hash를
   entry별로 검수한다. exact bytes 전달 자체는 trusted response-capture 경계가 맡는다.
4. caller-supplied dynamic receipt를 제거하고 actual wire 시점의 trusted
   mint/authorize 경로를 구현·검증한다.
5. direct OpenRouter/native-fetch 우회 경로를 정적·동적으로 차단한다.
6. provider-side hard spend ceiling과 미확정 billing 조회 절차를 고정한다.
7. 위 연결을 거친 route-parity 무네트워크 통합 테스트와 두 번째 fresh audit가
   PASS할 때까지 API counter는 0을 유지한다.
