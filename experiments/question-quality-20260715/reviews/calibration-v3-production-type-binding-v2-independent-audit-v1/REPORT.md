# Calibration v3 production type binding v2 — independent hostile audit v1

상태: **FAIL_CLOSED / EXECUTION INELIGIBLE**  
수학 구성요소: **VALID_MATH_COMPONENT**  
감사 대상: `design/reviewer-calibration-v3-production-type-binding-v2`

## 결론

v2가 정정한 rotation 수식, 32개 materialized row, n=2/3/4 schedule, 16/23/23 contact 계산은 모두 독립 재현에 성공했다. v1 무효 provenance와 현재 source bytes·Git metadata·manifest도 지금 이 순간의 관측값과 일치한다. `contact ≠ certification` 주장과 passed fresh coverage event gate도 현재 문서에서는 올바르다.

그러나 이것만으로 durable execution authority가 되지는 않는다. v2 작성자 verifier는 repository HEAD를 결박하지 않고, `headBlobSha1`이 null이면 dirty/untracked 검사를 건너뛰며, `lastPathCommit`을 전혀 읽지 않는다. 또한 실제 production 경로 `QUESTION_TYPE_GROUPS → EXAM_TYPE_GROUPS → GenerationConfigPanel → runtime schema dispatch`를 AST로 검증하지 않는다. 동일 source bytes를 유지한 채 untracked source가 tracked로 바뀌는 최소 반례에서도 작성자 verifier의 source predicate는 PASS한다.

따라서 현재 bytes가 우연히 맞다는 관측과 향후 실행을 허가할 durable authority를 분리한다.

| 판정 대상 | 판정 | 근거 |
|---|---|---|
| v2 corrected rotation/math | **VALID_MATH_COMPONENT** | 32/32 rows exact, n=2/3/4 충돌 없음, 16/23/23 재현 |
| 현재 production/source snapshot 관측 | **CURRENT_BYTES_MATCH** | SHA, HEAD blob, porcelain state, last-path commit 모두 현재 값과 일치 |
| v2 전체 execution authority | **FAIL_CLOSED / INELIGIBLE** | Git provenance와 runtime authority의 fail-open verifier blocker 2건 |
| 접촉만으로 certification 달성 | **NO** | 두 contact flag가 false이고 fresh passed event가 별도 필요 |

## 유효한 수학 구성요소

독립 verifier는 작성자 helper를 가져오지 않고 다음 식을 직접 실행했다.

- main: `(epoch - 1) mod n`
- holdout: `(epoch - 1 + ceil(n / 2)) mod n`

대표 schedule은 다음과 같다.

| n | Epoch 1~4 main/holdout |
|---:|---|
| 2 | `0/1, 1/0, 0/1, 1/0` |
| 3 | `0/2, 1/0, 2/1, 0/2` |
| 4 | `0/2, 1/3, 2/0, 3/1` |

모든 epoch에서 main과 holdout은 다르다. 실제 8 family에 적용한 32개 행은 수식으로 새로 만든 행과 순서까지 정확히 같았다.

- 1 epoch main+holdout: 16개 distinct
- 2 epoch main+holdout: 23개 전부 contact, 최소 epoch=2
- 4 epoch main-only: 23개 전부 contact, 최소 epoch=4

작성자 verifier도 v1과 달리 `materializeRows`와 `coverage` 양쪽에서 같은 `selectedAt`을 호출한다. 이 부분의 formula/verifier divergence는 해소됐다.

## B-01 — durable Git provenance가 fail-open이다 (BLOCKER)

현재 v1 source snapshot의 11개 record는 독립 재현과 일치한다. tracked source 9개는 clean, `question-ai-schemas-mc.ts`는 modified, prior protocol은 untracked이며 각각의 SHA·HEAD blob·last-path commit도 맞다. 문제는 기록값이 아니라 실행 시 drift를 판정하는 작성자 verifier다.

대상 verifier의 source loop는 다음 구조다.

- `verify.mjs:159`: `if (source.headBlobSha1)`
- `verify.mjs:161`: 이 조건 안에서만 `git diff --quiet`와 `cleanAtFreeze` 비교
- `lastPathCommit`: executable AST에서 참조 0회
- `repositoryHead`: executable AST에서 참조 0회

최소 반례는 현재 untracked prior protocol record다.

1. 동결 record는 `headBlobSha1=null`, `cleanAtFreeze=false`, `lastPathCommit=null`이다.
2. 파일 bytes를 바꾸지 않고 동일 내용으로 Git에 추가·commit하면 SHA-256은 그대로다.
3. 실제 상태는 tracked/clean, HEAD blob과 last-path commit이 생기고 repository HEAD도 바뀐다.
4. 작성자 verifier는 record의 `headBlobSha1`이 null이므로 3번의 모든 변화를 검사하지 않고 source SHA만 통과시킨다.

이것은 artifact를 다시 쓰지 않아도 발생하는 live provenance bypass다. `git diff --quiet` 역시 staged/untracked를 포함한 전체 상태 판정이 아니므로 fail-closed 조건을 충족하지 못한다.

## B-02 — production runtime authority가 semantic하게 검증되지 않는다 (BLOCKER)

독립 TypeScript AST 검사는 현재 경로가 실제로 맞음을 확인했다.

1. `QUESTION_TYPE_GROUPS`: 정적 14+8+3, 총 25개
2. `EXAM_TYPE_GROUPS`: initializer가 정확히 `QUESTION_TYPE_GROUPS`
3. `GenerationConfigPanel`: `passageSubject !== "KOREAN"` 경로에서 `EXAM_TYPE_GROUPS`
4. `panelTypeGroups.flatMap`이 렌더되는 `group.items.map`으로 연결
5. runtime route가 `AI_QUESTION_SCHEMAS[questionType]`와 `QUESTION_SCHEMAS[questionType]`를 실제 dispatch

반면 작성자 verifier AST에는 `EXAM_TYPE_GROUPS`, `panelTypeGroups`, `AI_QUESTION_SCHEMAS` identifier 사용이 없다. `QUESTION_TYPE_GROUPS`의 25개 reference와 schema key 개수만 검사한다. 따라서 현재 bytes의 우연한 정합성은 확인할 수 있어도, v2를 sole normative authority로 사용하는 다음 실행에서 “실제 picker/runtime 경로”라는 의미를 durable하게 증명하지 못한다.

인메모리 coherent-source 변이에서 alias를 빈 배열로 바꾸고 원래 문장을 주석에 남기자 raw substring은 유지됐지만 독립 AST predicate는 즉시 실패했다. English panel branch reversal과 runtime AI dispatch 제거도 각각 별도 reason code로 차단했다.

## 추가 self-verifier 결함

이 항목들은 위 두 blocker를 강화하지만 현재-byte mismatch로 오인해서는 안 된다.

- `supersedes.path`, artifact ID, v1 acceptance/rejection boolean을 작성자 verifier가 exact constant로 검증하지 않는다.
- 작성자 manifest parser는 `Map.set`으로 duplicate filename을 덮어쓰고 원래 line count를 검사하지 않는다. 현재 manifest는 duplicate 없이 유효하다.
- `rotation.contactIsCertification`과 `allTypeClaimGate`를 읽지 않고 `claims.contactEqualsCertification` 하나만 검사한다. 현재 세 필드는 서로 정합적이지만 미래 drift guard로는 불충분하다.
- v1 verifier divergence 증명은 executable AST가 아니라 `text.includes`다. 독립 감사는 실제 element-access AST node를 찾았다.

## Production universe와 schema drift 재현

| 대상 | 독립 추출 결과 |
|---|---:|
| production UI | 25 |
| focus | 2 (`BLANK_INFERENCE`, `GRAMMAR_ERROR`) |
| canonical nonfocus | 23 |
| structured schema | 26 |
| AI schema union | 26 |
| filter | 26 |
| legacy `QUESTION_SUBTYPES` | 24 |

schema/filter의 UI 외 ID는 `TOPIC_MAIN_IDEA` 하나다. legacy list는 canonical `GRAMMAR_CHOICE_COMBO`만 빠지고 extra는 없다. 8 family는 23개를 정확히 한 번씩 포함하며 focus·legacy injection은 없다.

## v1-invalid provenance

v2가 기록한 v1 manifest SHA-256 `655bfc33ef47f06752fddde0c2ac4c3750ca7468d97d84a241dca28fefac1539`, 세 manifest entry, 각 파일 hash, sources JSON semantic hash는 현재 보존된 v1과 exact 일치한다. executable AST에서 v1 verifier의 main-only 보폭 1 expression을 찾았고, v1 선언 보폭 2의 n=4 반례 `0,2,0,2`도 재현했다. 따라서 다음 두 사실이 동시에 성립한다.

- v1 execution은 계속 invalid다.
- v2의 corrected math만은 valid하다.

## Contact는 certification이 아니다

두 epoch 23개 contact와 네 epoch main-only 23개 contact는 schedule 도달성일 뿐 reviewer certification 완료 증거가 아니다. 현재 binding은 다음을 올바르게 구분한다.

- `rotation.contactIsCertification=false`
- `claims.contactEqualsCertification=false`
- 각 canonical ID에 passed fresh main 또는 activation-holdout coverage event가 있어야 한다는 gate

이번 감사는 ledger를 읽지 않았으며 certification 달성을 주장하지 않는다.

## Hostile mutation 결과

원본을 수정하지 않은 인메모리 clone에서 32개 변이를 모두 차단했다. 범위에는 n=2/3/4, formula/verifier divergence, row deletion/duplicate/order, family omission/duplicate, focus/legacy injection, canonical order, v1/source path, source/manifest hash, dirty/untracked/HEAD/path-commit/repository-HEAD drift, contact-certification conflation, certification gate 약화, alias/panel/runtime AST break, schema/legacy drift, v1 provenance drift가 포함된다.

작성자 verifier 자체는 128/128 PASS를 출력했지만, 이는 위 execution blocker를 검사하지 않은 결과이므로 승인 근거로 사용하지 않았다.

## 해소 조건

v2 파일을 사후 수정하지 말고 v2.1 또는 v3 replacement를 새로 발행해야 한다.

1. repository HEAD를 exact 비교한다.
2. 모든 source에 대해 HEAD blob 유무와 무관하게 `git status --porcelain=v1 --untracked-files=all -- <path>`를 비교한다.
3. `headBlobSha1`과 `lastPathCommit`을 null 포함 exact 비교한다.
4. source·superseded path가 repository 내부의 exact expected path인지 검증한다.
5. UI alias, panel branch, rendered consumer, runtime schema dispatch를 AST node 관계로 검증한다.
6. 두 contact flag와 certification gate를 함께 검사하고 manifest duplicate/line count를 거부한다.
7. 새 manifest를 외부 실행 packet에 결박한 뒤 독립 hostile audit을 다시 통과한다.

## 활동 제한

Network/API/model/DB/secret/trusted-gold/ledger 접근은 모두 0이다. v2 target, v1, v3, production source를 수정하지 않았다.
