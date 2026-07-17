# Production type binding v3 — 독립 적대 감사

## 판정

`FAIL_BLOCKERS`입니다. 대상 봉인본의 25/23 유형 집합, 8개 family 분할, 수정된 n=2/3/4 회전 수학은 독립 재계산에서 맞습니다. 그러나 이 수학적 유효성은 전체 실행 권한과 동일하지 않습니다. `/director/workbench/questions/generate`의 실제 호출 우세성(dominance)과 런타임 스키마 소스 폐쇄성에서 차단 결함이 확인되어 이 대상은 v4 실행 패킷의 권한 근거로 발행할 수 없습니다.

대상은 수정하지 않았습니다. 대상 `MANIFEST.sha256`은 `d01349a4856097992ea4ef48f65221ed6adb44ca4b7baad9198d99ecb9638481`, 독립 재계산한 audit core는 `356085dcf0a5d34b5026519b03ea2d1e098db97de5a5e5b769aba8ff6fcc60cb`입니다. 작성자 `verify.mjs`와 REPORT는 권위로 사용하지 않았습니다.

## 차단 결함

### 1. 요청 경로에서 SECONDARY_BATCH가 실행 가능하지 않음

`GeneratePageClient`는 `handleBatchGenerate`를 얻지만 직접 호출하지 않습니다. 이 콜백은 `PassageCardGrid`에 전달되지만 해당 컴포넌트는 이를 구조분해만 하고 호출하거나 재전달하지 않습니다. 유일한 `GenerationConfigPanel` 인스턴스에도 전달되지만 동시에 `hideGenerateButtons`를 참으로 전달하며, 패널의 library CTA는 `!hideGenerateButtons` 아래에 있습니다. 따라서 요청된 경로에서 살아 있는 생성 경로는 `handleWorkspaceGenerate`를 통한 `PRIMARY_WORKSPACE`이고, 봉인본이 선언한 보조 batch 경로는 실제 사용자 호출 경로가 아닙니다.

### 2. legacy → Trigger 분기는 dead code

`createQuestionGenerationJob`은 중첩 콜백 `enqueueJob` 안에서만 호출됩니다. `enqueueJob` 자체의 CallExpression은 0개이며, 선언 외 참조는 React dependency array뿐입니다. 반면 `handleBatchGenerate`가 도달하는 `runManualUnitsWithFastPath`는 fast creator만 호출합니다. 독립 검사는 문자열이나 미사용 함수의 존재를 호출 경로로 인정하지 않습니다.

작성자 검증기는 `createQuestionGenerationJob` 함수 안의 legacy fetch 문자열과 `handleBatchGenerate` 안의 fast 호출을 별도로 발견한 뒤 하나의 경로처럼 합쳤습니다. 이 때문에 dead code, shadowed identifier, 문자열 리터럴, 분리된 함수에 대한 false positive를 막지 못합니다.

### 3. 스키마/runtime 직접 의존성이 소스 권한 밖이며 일부는 untracked

봉인본의 17개 파일에는 다음 직접 production import가 없습니다.

- `src/lib/question-schemas-mc.ts`: `question-schemas.ts`와 `question-ai-schemas-mc.ts`가 직접 사용하지만 tracked-unbound입니다.
- `src/lib/question-generation-research-schema.ts`: AI schema aggregator와 runtime이 직접 사용하며 untracked입니다.
- `src/lib/question-generation-research-profiles.ts`: runtime이 직접 사용하며 untracked입니다.
- `src/lib/question-generation-research-runtime.ts`: runtime이 직접 사용하며 untracked입니다.

canonical 25개 유형은 실제로 모두 `AI_QUESTION_SCHEMAS[subType]`가 참이므로 `getAiResponseSchema` 분기를 탑니다. 즉 `QUESTION_SCHEMAS` fallback 키 집합만 맞는지 보는 것으로는 충분하지 않습니다. 위 직접 의존성은 실제 선택된 AI schema를 만들거나 감싸며, 이 파일을 바꾸거나 제거해도 대상의 17개 source hash와 AST key-set 검증은 그대로 통과할 수 있습니다.

### 4. 이벤트 표면 폐쇄성 누락

패널 CTA를 소유하는 `generation-config-panel-parts/type-numeric-detail.tsx`, batch prop을 받는 `passage-card-grid.tsx`, primary modal의 `onGenerate` 표면을 소유하는 `workspace/passage-generate-modal.tsx`가 대상 source set에 없습니다. 콜백 생성만 묶고 이를 실제 클릭 이벤트까지 이어 주는 모듈을 제외하면 route-to-dispatch 권한 체인이 아닙니다.

## 독립 검증 범위

별도 검증기는 대상 자체 검증기를 호출하지 않고 다음을 재계산합니다.

- 대상 및 두 upstream manifest의 바이트/엔트리 hash
- audit core, repo HEAD commit/tree/full symbolic ref
- 17개 파일의 raw SHA-256, raw Git blob, filtered Git blob, index stage/blob, HEAD blob, lastPathCommit, porcelain-v2, ls-files flag
- CRLF raw != filtered이면서 clean인 실제 사례와 이중 snapshot 안정성
- untracked/null, staged-only, unstaged/racy-clean, intent-to-add, lowercase assume-unchanged/skip-worktree, rename/copy, filter drift, lastPathCommit, ref drift에 대한 fail-closed mutation
- route/client/영어 panel/primary 및 secondary dataflow, fast/legacy/Trigger/runtime/schema 분기
- 25 UI / 23 nonfocus / 중복·누락과 n=2/3/4 회전 반례

네트워크 0, provider/model 0, DB 0, secret/trusted-gold 0, API candidate 0입니다.

```powershell
node experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v3-independent-audit-v1/verify.mjs
node experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v3-independent-audit-v1/verify.mjs --check-manifest
```
