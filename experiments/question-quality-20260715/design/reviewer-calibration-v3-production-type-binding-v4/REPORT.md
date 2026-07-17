# Production type binding v4 — 외부 감사 후보

## 판정

이 산출물은 `/director/workbench/questions/generate`의 수동 영어 생성 경로와 평가 캘리브레이션의 25개 문항 유형 집합을 동일한 현재 worktree에 묶은 fail-closed 감사 후보이다. 자체 검증은 통과했지만, 상태는 `PRODUCTION_ROUTE_BINDING_CANDIDATE_REQUIRES_EXTERNAL_AUDIT`이며 신선한 독립 감사 전에는 생성 실험 또는 품질 판정 권한을 부여하지 않는다.

적용 상태 조건은 `MANUAL_AND_NON_KOREAN_ONLY`, 도달 가능한 생성 경로 주장은 `PRIMARY_WORKSPACE_FAST_ONLY`이다. 데스크톱은 passage modal footer, 모바일은 `MobileStepNav`의 실제 이벤트 흐름을 시작점으로 추적한다.

## v3 실패에서 보존하거나 폐기한 것

v3의 집합·8개 family·회전 수학만 보존했다. v3의 실행 권한은 다음 차단 사유 때문에 보존하지 않았다.

- `SECONDARY_BATCH_NOT_REACHABLE_FROM_REQUESTED_ROUTE`
- `LEGACY_TRIGGER_BRANCH_IS_DEAD_CODE`
- `SCHEMA_RUNTIME_SOURCE_CLOSURE_FAIL_OPEN`
- `INTERACTIVE_DISPATCH_CLOSURE_INCOMPLETE`

따라서 예전의 one-hop 폐쇄 방식은 권한 근거로 폐기했다. v4는 로컬 정적 import, export-from, literal dynamic import와 literal require를 재귀적으로 따라가는 전체 전이 폐쇄를 계산하며, 미해결 로컬 import와 비리터럴 모듈 로드를 fail-closed 처리한다.

## 프로덕션 경로 권위

현재 HEAD는 `467c6d107137a91088d3eba1620ba4036a63d709`이다. 총 256개 production source를 봉인했고, 이 중 247개는 tracked worktree, 9개는 `WORKTREE_ONLY_UNTRACKED`이다. 전이 runtime closure는 241개 파일과 709개 import edge로 구성된다.

9개 untracked 파일은 배포 커밋에 존재한다고 간주하지 않는다. 이 산출물의 명시적 상태는 `deployedCommitParity=false`이며, 현재 worktree 연구 결과를 배포 결과로 오인할 수 없다.

실제 경로는 URL route → manual client → 데스크톱/모바일 이벤트 표면 → workspace generation → fast scheduler → fast POST route → manual plan → assignment budget → shared runtime → 유형별 schema까지 연결한다. 요청 URL에서 도달하지 않는 secondary batch와 legacy Trigger branch는 제외 근거로만 봉인하며 재승인하지 않는다.

## 문항 유형과 회전 설계

UI에 노출되는 영어 유형은 정확히 25개이며, 집중 유형은 `GRAMMAR`와 `BLANK_INFERENCE`, 비집중 유형은 23개이다. 비집중 유형은 8개 의미·작업 family로 분할된다. 동일 epoch에서 main+holdout이 접촉하는 유형은 16/23이고, 두 epoch 누적 main+holdout과 네 epoch main-only는 각각 23/23을 접촉한다. 이 수치는 유형 접촉 증거일 뿐 품질 인증이 아니다.

canonical binding SHA-256은 `433d72598f123a19950b57e4684d0ba004031d3beb0860fc5d5d226ddcf8022b`, production source contract SHA-256은 `8eb7cb9708ac1a8a4c49212a453222259387a87254908cc6a7bbdcf95b60bca4`, audit core SHA-256은 `1a2f89960958fd6975055a5b8631d39cd5eb393b0e90f4cae81591fc400035bf`이다.

## 자체 검증 결과와 활동 경계

기준 및 적대 검사 2,701/2,701을 통과했고, 54/54 hostile fixture가 예상된 차단 사유로 거절되었다. fixture는 Git 상태·CRLF·untracked byte·전이 import·비리터럴 import·2-hop source byte·데스크톱/모바일 이벤트·유형 전달·fast route·assignment budget·runtime·AI/structured schema·dead path 재승인 변조를 포함한다.

이 단계에서 외부 네트워크, provider/model, DB, secret, trusted-gold 읽기·쓰기는 모두 0이다. **API candidates 0**이며 1,000개 후보 예산을 소비하지 않았다.

```powershell
node experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/verify.mjs
node experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/verify.mjs --check-manifest
```

