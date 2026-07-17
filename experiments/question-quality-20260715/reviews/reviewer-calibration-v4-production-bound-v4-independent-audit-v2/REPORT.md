# Reviewer calibration v4 production-bound — independent conformance audit v2

## 판정

**FAIL_BLOCKERS** — 이 v4 주체는 설계 전용·권한 0 상태로 봉인한다. 실제 calibration, C0, S1, 결과 열람 권한을 승인하지 않는다. 새 불변 successor가 아래 7개 blocker를 모두 수정하고 새 독립 감사를 통과해야 한다.

이 감사가 고정한 주체는 `experiments/question-quality-20260715/design/reviewer-calibration-v4-production-bound-v4`이다. 주체 `MANIFEST.sha256`의 SHA-256은 `303b954e729f89fc21b95271d5cd895434c96bd193c24a31a393052b0ba63b05`, 13개 파일을 byte count와 함께 다시 계산한 snapshot root는 전후 모두 `bcc3a013fd504abaddcf5203e895ddd24e34897183d711788be75ad524afcec0`이었다. 감사 중 주체 변경은 없었다.

## 독립 재현

기존 v1 검증기 `independent-verify.py` 전체를 읽고 동일한 sealed subject에 대해 필수 plain 실행을 두 번 수행했다. 두 실행 모두 다음 결과로 일치했다.

- status: `PASS_INDEPENDENT_VERIFIER_EXPECTED_SUBJECT_FAIL`
- subject verdict: `FAIL_BLOCKERS`
- total cases: `17,816`
- case digest: `9d9ce9978678b602d4d60ba6c1daf4b54a696d88f0ec3cc9ad71368422e4ab0c`
- subject snapshot: `bcc3a013fd504abaddcf5203e895ddd24e34897183d711788be75ad524afcec0`
- blocker count: `7`

증거 필드를 추출한 세 번째 JSON 실행도 같은 case digest, snapshot, 판정을 냈다. 사용한 독립 검증기 SHA-256은 `46914b7ab81c8f24114c8b3b63fc2fa79645dd84cd760407b728c70521d39cab`, public implementation만 호출한 target probe SHA-256은 `5dab21abffa6749656b6b30de2782c886e289a940cf7bea18f89fc0fd0705370`이다. 주체의 `verify.mjs`, `schema-hostile.py`, `hostile-fixtures.json`은 실행하거나 신뢰하지 않았다.

## Blocker 최소 재현

### 1. `V4-B1-IDENTITY_REGISTRY_SEAL_DOES_NOT_REVALIDATE_BIJECTION`

두 principal `p1/p2`와 alias `a1/a2`를 만들고 reverse map에는 `p1->[a1]`, `p2->[a2]`를 넣되 forward map만 `a1->p2`, `a2->p1`로 교차했다. 실제 custodian attestation 객체 없이 opaque digest만 넣었다.

- 기대: seal 또는 assignment 단계에서 양방향 map 불일치와 검증되지 않은 binding을 거부한다.
- 관측: registry가 `ready=true`, `sealed=true`가 되고 root가 생성됐으며 `a1/p2` 역할 할당도 `true`를 반환했다.

### 2. `V4-B1-ATTESTATION_BASE64_HAS_NONCANONICAL_ALIASES`

64개 zero byte의 canonical Base64 마지막 data character를 `A..P`로 바꾼 16개 문자열을 identity attestation schema에 넣었다.

- 기대: canonical 표현 하나만 허용한다.
- 관측: 16개 모두 schema-valid이고 같은 64 bytes로 decode됐다. round-trip canonical인 것은 하나뿐이며 15개 alias가 남았다.

### 3. `V4-B7-SEALED_POLICY_VALIDATOR_REREADS_MUTABLE_DERIVED_STATE`

정상 sealed policy를 clone한 뒤 source `policyRows`는 그대로 두고 파생 tuple `MAIN_CERTIFICATION_PHASE1 / RAW_PRIVATE_TRUSTED_GOLD`만 `DENY`에서 `ALLOW(PACKET_AUTHOR)`로 바꾸고 파생 root도 교체했다.

- 기대: validator가 recomputation 결과의 immutable tuple/root만 사용해 거부한다.
- 관측: recomputed sealed root만 원본과 비교한 뒤 caller가 바꾼 `policyRegistry.tuples`와 `policyRegistry.roots`를 다시 읽어 authorization을 `true`로 승인했다.

### 4. `V4-B7-AUTHORIZATION_DOES_NOT_DEREFERENCE_AUTHORITATIVE_STATE_OR_ALIAS`

authorization이 `ACTIVATION_GRANTED`를 스스로 현재 상태라고 주장하게 하고, presented alias는 `different_alias_0001`, role assignment alias는 `assignment_alias_0001`로 만들었다. authoritative state-event chain이나 sealed identity registry는 validator 입력에 존재하지 않는다.

- 기대: authoritative event sequence에서 현재 상태를 도출하고 sealed identity/assignment에서 현재 canonical alias를 역참조한다.
- 관측: self-claimed state를 신뢰하고 두 alias를 비교하지 않아 `true`를 반환했다.

### 5. `V4-B3B4-GRANT_DOES_NOT_DEREFERENCE_SCOPE_CERTIFICATES_OR_AUDIT_EVENTS`

candidate와 두 certificate claim은 `FOCUS_ONLY` (`GRAMMAR_ERROR`, `BLANK_INFERENCE`)인데 grant의 nested coverage는 `ALL_25`로 만들었다. candidate/audit/grant에는 같은 opaque coverage scalar를 넣었다. preexisting audit는 arbitrary hash들과 monotone ordinals `10/11/11 < grant 12`, `recordedBeforeGrant=true`만 제공했다.

- 기대: grant scope가 candidate 및 모든 dereferenced certificate scope의 부분집합인지 확인하고, append-only sequence의 실제 candidate/audit/manifest bytes와 exact ordinal/content를 검증한다.
- 관측: nested scope나 실제 event body를 역참조하지 않아 `FOCUS_ONLY -> ALL_25` grant와 hashes-only audit record가 함께 `true`로 승인됐다. 독립 oracle은 scope escalation 512건과 hashes-only audit 512건을 모두 거부했다.

### 6. `V4-B6-NO_REPLAY_TOMBSTONE_DISJOINTNESS_VALIDATOR_NOT_EXPORTED`

이미 tombstone set에 있는 composite fingerprint를 재사용하는 512건을 만들었다.

- 기대: reservation/materialization/tombstone registry를 함께 재계산해 overlap과 재사용을 막는 public validator가 있어야 한다.
- 관측: 독립 oracle은 512건 모두 replay로 식별했지만 public export에는 reservation/tombstone/disjointness/replay validator가 0개다.

### 7. `V4-B8-ACCESS_CHAIN_AND_SINGLE_USE_VALIDATOR_NOT_EXPORTED`

각 seed마다 개별 schema는 만족하지만 transaction ID, capability token, ordinal, event hash, timestamp가 서로 끊긴 `AUTHORIZATION -> OPEN -> CAPABILITY_CONSUME -> CLOSE` 레코드를 만들었다.

- 기대: 하나의 transaction/capability와 순서·시간을 묶고 authoritative registry에서 두 번째 consume를 원자적으로 거부하는 semantic validator가 있어야 한다.
- 관측: 1,024개 disconnected chain의 개별 레코드는 모두 schema-valid이고, access/transaction/capability sequence validator export는 0개다.

## 케이스 행렬

| 그룹 | 건수 |
|---|---:|
| accessDisconnectedChains | 1,024 |
| canonicalDomainSeparation | 384 |
| canonicalFieldOrder | 3,072 |
| canonicalFieldSet | 354 |
| canonicalNumbers | 288 |
| canonicalStrictJson | 384 |
| canonicalUnicode | 256 |
| coverageDistinctMaterialization | 1,024 |
| fingerprintBindingSwaps | 1,024 |
| fingerprintClaimValidation | 512 |
| fingerprintContentDerivation | 5,000 |
| fingerprintCrossImplementation | 1 |
| fingerprintTombstoneOracle | 512 |
| grantAuditMaterializationOracle | 512 |
| grantScopeOracle | 512 |
| identityBijectionOracle | 512 |
| identityCanonicalization | 512 |
| identityOpaqueBase64Canonicality | 16 |
| identityRoleSeparationOracle | 204 |
| policyExactRoleResourceMatrix | 1,666 |
| schemaCompilation | 47 |
| **합계** | **17,816** |

## 통과한 기반 성질

이 실패 판정은 모든 기반 구현이 무효라는 뜻은 아니다. 독립 검사에서 Draft 2020-12 schema 46개와 event branch 23개가 compile됐고, canonical field-order/number/Unicode/domain vectors, 7-component fingerprint 교차 구현 sample, focus coverage의 reused-slot 거부, 7×14=98 policy tuple 및 17-role partition은 통과했다. 이 positive control들은 blocker를 상쇄하지 않는다.

## 데이터 계보와 활동

직접 upstream 11개를 byte rehash했고 public audit JSON 4개에서 요구된 negative blocker code 14개를 확인했다. private row는 열지 않았다. secret/environment, network, provider/model, database, ledger, question-generation 호출은 모두 0이며 API candidate 소비도 0이다.

## 실패 봉인

이 리뷰는 위 순서의 7개 blocker를 `SEALED_FAIL_BLOCKERS`로 고정한다. v4 파일을 사후 재해석하여 PASS로 바꿀 수 없다. 새 immutable successor와 그 successor를 대상으로 한 fresh independent audit만 재개 조건을 충족한다. 자세한 exact subject snapshot, 각 최소 재현, 케이스 그룹, zero-authority 판정은 `verdict.json`에 있다.
