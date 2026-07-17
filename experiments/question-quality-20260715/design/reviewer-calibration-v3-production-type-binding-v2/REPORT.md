# Reviewer calibration v3 production type binding v2

상태: **V2 VALID / V1 EXECUTION INVALID / OFFLINE ZERO-COST**

## 정정 결론

`reviewer-calibration-v3-production-type-binding-v1`의 canonical UI 25, focus 2, nonfocus 23, 23→8 family mapping과 source hash는 유효하다. 그러나 rotation 선언식과 verifier 계산식이 달랐다. 이 결함은 `V1_ROTATION_FORMULA_VERIFIER_DIVERGENCE` BLOCKER이며 v1은 실행에 사용할 수 없다. v1 파일은 provenance를 위해 수정하지 않았다.

v2는 다음 하나의 `selectedAt(rotationOrder, epoch, role)` 함수로 공식, 32개 materialized schedule rows, coverage 수학을 모두 계산한다.

- `main = (epoch - 1) mod n`
- `holdout = (epoch - 1 + ceil(n / 2)) mod n`

여기서 epoch는 1부터 시작하고 `n`은 family size다.

## v1 실패 증명

v1 선언의 main 공식은 `2 × (epoch - 1) mod n`이었다. 그러나 verifier의 main-only coverage는 `(epoch - 1) mod n`으로 계산했다.

`n=4`에서 선언식을 따르면 epoch 1~4의 main index는 `0, 2, 0, 2`다. 서로 다른 index가 2개뿐이므로 4개 유형 전체를 main-only로 접할 수 없다. 반면 verifier는 `0, 1, 2, 3`을 사용해 거짓 PASS를 만들었다. 따라서 v1 manifest와 byte는 그대로 보존하되 rotation과 coverage 주장은 모두 폐기했다.

## Corrected schedule 검증

대표 family size별 schedule은 다음과 같다.

| 크기 | Epoch 1 main/holdout | Epoch 2 main/holdout | 결과 |
|---:|---|---|---|
| n=2 | `0 / 1` | `1 / 0` | 한 epoch에서 2개 전부 접촉 |
| n=3 | `0 / 2` | `1 / 0` | 두 epoch에서 3개 전부 접촉 |
| n=4 | `0 / 2` | `1 / 3` | 두 epoch에서 4개 전부 접촉 |

모든 family에서 main과 holdout은 같은 epoch에 충돌하지 않는다. 실제 8 family에 적용하면:

- 단일 epoch: main 8 + holdout 8 = 서로 다른 16유형
- 두 epoch main+holdout: canonical 23유형 전부 접촉
- 네 epoch main-only: canonical 23유형 전부 접촉

단일 epoch all-type 주장은 금지한다. 또한 contact ≠ certification이다. 각 type이 fresh main 또는 activation holdout에서 실제 PASS coverage event를 가져야만 all-type certification을 주장할 수 있다.

## Materialized schedule

`binding.json#scheduleRows`에는 8 family × epoch 1~4 = 32개 행을 materialize했다. verifier는 별도의 식을 쓰지 않고 동일한 `selectedAt`으로 32개 행을 다시 만들고 byte-semantic equality를 확인한다. 그 뒤 같은 함수로 단일 epoch 16, 두 epoch 23, main-only 네 epoch 23을 다시 계산한다.

## Hostile 산술 검증

다음 6개 변조가 전부 차단된다.

1. n=2에서 holdout offset을 0으로 바꿔 main과 충돌
2. n=3 materialized epoch-2 holdout을 main과 같은 값으로 변경
3. n=4 main-only 계산에 v1의 2-step 공식을 재사용
4. 결과를 보고 epoch-1 main을 epoch-3 type으로 교체
5. 32개 schedule row 중 하나 삭제
6. 서로 다른 family에 canonical type을 중복 배치

## Source 및 canonical binding

v2는 v1 manifest SHA-256 `655bfc33ef47f06752fddde0c2ac4c3750ca7468d97d84a241dca28fefac1539`를 exact 결박한다. v1의 source snapshot 전체 hash와 각 source worktree SHA-256, Git HEAD blob, clean/modified 상태를 다시 확인한다. 동시에 AST로 현재 generation UI 25, focus 2, nonfocus 23, structured/AI schema 26을 독립 추출한다.

canonical universe와 8 family는 유효한 v1 부분과 exact 일치하지만, v2 rotation만 새로운 정본이다. 이후 실행 packet은 v1이 아니라 v2 manifest를 결박해야 한다.

## 활동

network/API/model/DB/secret/trusted-gold 접근과 API candidate 소비는 모두 0이다.
