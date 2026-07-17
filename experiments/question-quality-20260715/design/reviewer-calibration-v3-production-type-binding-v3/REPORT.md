# Production type binding v3 — immutable audit subject

## 판정

이 패킷은 정정 회전식과 실제 `/director/workbench/questions/generate` 수동 영어 생성 경로를 하나의 fail-closed 소스 권위 계약으로 묶은 **독립 감사 전 불변 후보**다. 자체 검증을 통과해도 이 파일 하나만으로 실행 권한이나 v4 봉인 권한을 주지 않는다. 후속 v4는 이 v3 매니페스트와 별도 독립 감사의 `PASS_NO_BLOCKERS` 매니페스트를 동시에 exact-bind해야 한다.

v1의 선언 회전식과 검증 회전식 불일치에 이어, v2에서는 `V2_SOURCE_AUTHORITY_FAIL_OPEN`이 확인됐다. v2의 25/23 유형 집합, 8개 family, 정정 회전 수학은 유지하지만 실행 소스 권위로는 사용하지 않는다.

## v2에서 닫지 못했던 구멍

- repo HEAD와 전체 symbolic ref가 묶이지 않았다.
- `headBlobSha1`가 null인 소스는 핵심 검사를 건너뛸 수 있었다.
- 기록된 `lastPathCommit`을 검증하지 않았다.
- `git diff --quiet`의 boolean만 사용해 index/HEAD/경로 상태를 독립적으로 고정하지 않았다.
- URL route에서 `QUESTION_TYPE_GROUPS`와 runtime schema dispatch까지 이어지는 AST 권위 사슬을 증명하지 않았다.

## v3 소스 동결

17개 production source 모두 다음을 필수로 묶는다.

- exact repo HEAD commit, tree, full `refs/heads/...` symbolic ref
- raw worktree SHA-256와 raw Git blob
- `.gitattributes`/CRLF 필터를 적용한 worktree Git blob
- index stage와 index blob
- HEAD blob과 `lastPathCommit`
- exact `porcelain-v2` path status와 `ls-files -v` flag

Windows CRLF 정규화 때문에 raw blob과 index blob이 다르면서 Git상 clean일 수 있다. 그래서 raw SHA/blob은 바이트 드리프트 검출에만 쓰고, Git dirty는 **filtered worktree blob != index blob**으로 결정한다. 빈 porcelain은 clean의 단독 근거가 아니다. 같은 크기·mtime을 유지하거나 porcelain이 비어 있어도 raw SHA/blob이 달라지면 실패한다. null, untracked, lowercase assume-unchanged/skip-worktree 상태는 실패한다.

## 실제 UI → runtime 권위 사슬

검증 범위는 수동 영어 생성이며 두 실제 dispatch를 모두 포함한다.

1. URL route가 `GeneratePageClient defaultMode="manual"`을 렌더한다.
2. `QUESTION_TYPE_GROUPS`의 25개 참조가 `EXAM_TYPE_GROUPS = QUESTION_TYPE_GROUPS`로 직접 연결된다.
3. 비국어 `GenerationConfigPanel`은 `EXAM_TYPE_GROUPS`를 사용하고 `typeCounts`를 client에 유지한다.
4. `PRIMARY_WORKSPACE`는 `useWorkspaceGeneration`이 `typeId → questionType`을 보존해 fast endpoint로 보낸다.
5. `SECONDARY_BATCH`는 `useGenerationHandlers`가 양수 `typeCounts`를 열거해 fast 또는 legacy endpoint로 보낸다.
6. fast route는 shared runtime을 직접 호출하고, legacy route는 `workbench-question-generation` Trigger task를 거쳐 같은 runtime을 호출한다.
7. runtime은 `subType`으로 `AI_QUESTION_SCHEMAS`, `QUESTION_SCHEMAS`, `getAiResponseSchema`를 dispatch한다.

국어, set-mode preset/question-set endpoint, 다른 생성 dialog는 이 좁은 주장에 포함하지 않는다.

## 회전식과 주장 경계

- main: `(epoch - 1) mod familySize`
- holdout: `(epoch - 1 + ceil(familySize / 2)) mod familySize`
- 동일 `selectedAt` 함수가 n=2/3/4 반례, 32개 물질화 행, 접촉 커버리지를 모두 산출한다.
- 단일 epoch main+holdout 접촉은 16/23이다.
- 2 epoch main+holdout과 4 epoch main-only는 각각 23/23을 접촉한다.
- 접촉은 유형별 인증이 아니다.

## 적대 검증과 활동

20개 synthetic hostile fixture가 repo HEAD/tree, untracked/null, 마지막 경로 커밋, porcelain/index/flag, CRLF, 같은 크기·mtime 가정의 raw mutation, route/picker/panel, workspace/batch/API/runtime/schema AST, 유형 누락·중복, 회전 행, upstream hash 변조를 각각 차단한다.

외부 네트워크 0, provider/model 호출 0, DB 0, secret/trusted-gold read 0, **API candidates 0**이다.

```powershell
node experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v3/verify.mjs
node experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v3/verify.mjs --check-manifest
```
