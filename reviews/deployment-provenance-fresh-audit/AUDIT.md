# Production deployment provenance fresh-eyes audit

감사일: 2026-07-15 KST

대상 배포: `dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD`

최종 판정: **FAIL — 기존 69개 집합은 내부 수치가 맞는 좁은 부분집합이지만, production question-generation source snapshot으로는 선택이 불완전하다.**

## 판정 요약

기존 산출물의 산술과 해시를 깨는 오류는 찾지 못했다. 기록 당시 기준 `69 deployed / 58 CURRENT_EXACT / 11 HISTORY_RECONSTRUCTABLE_DRIFT / 2 LOCAL_ONLY_POST_DEPLOYMENT / 0 DEPLOYED_UNMATCHED_DRIFT`는 맞고, 11개 drift 목록과 Git 복원 commit도 모두 독립 재계산과 일치한다. Vercel read-only API가 현재 반환하는 metadata도 `source=cli`, `githubCommitSha=467c6d107137a91088d3eba1620ba4036a63d709`, `gitDirty="1"`로 pinned index와 정확히 같다. 69개 파일을 내용 API에서 다시 받아 실제 바이트 SHA-1을 계산한 결과도 **69/69 UID 일치**다.

그러나 이 결과는 `isRelevant`에 하드코딩한 좁은 prefix 집합 안에서만 완전하다. 배포 당시 69개 파일의 실제 소스를 기준으로 정적 로컬 import를 해석하면, 고정 집합 밖의 **직접 의존 파일 42개, 직접 edge 96개**가 나온다. 재귀 정적 로컬 import 폐쇄는 **240개 파일**이며 그중 **171개가 pinned index에 없다**. 따라서 baseline과 O40의 “관련 dependency 69개”, “production snapshot” 해석은 과도하다.

## 독립 검증 결과

| 검증 항목 | 결과 | 판정 |
|---|---:|---:|
| Live deployment metadata | pinned metadata와 전 필드 일치 | PASS |
| 전체 Vercel source tree | 4,410 files | 관찰값 |
| 좁은 선택 predicate | 정확히 69 files, pinned index와 UID까지 일치 | PASS |
| `deploymentPath -> localPath` | 전 69개가 `deploymentPath = "src/" + localPath`; 충돌 0 | PASS |
| UID가 실제 raw SHA-1인지 | Vercel content 69/69 재다운로드·재해시 일치 | PASS |
| 기록 당시 상태 집계 | 69 / 58 / 11 / 2 / 0 | PASS |
| 11개 drift 파일·Git 복원 commit | 전부 일치 | PASS |
| pinned/report/markdown/script 해시 | baseline·O40와 전부 일치 | PASS |
| canonical JSON·Markdown 재렌더 | 기록된 두 파일 hash와 일치 | PASS |
| 실제 직접 로컬 의존성 포함 여부 | 42 files / 96 edges 누락 | **FAIL** |
| 정적 로컬 import 폐쇄 포함 여부 | 240 중 171 files 누락 | **FAIL** |
| dirty worktree 시점의 장기 재현성 | 현재 재실행은 기록 hash와 불일치 | **FAIL** |
| Trigger worker version parity | 기존 baseline대로 미확인 | BLOCKED |

Live static-closure manifest SHA-256은 `9afb6b6d75273a66187c917027a767689a42c701a0e52cff6c01a071841a7cdb`다. 이는 경로와 Vercel UID를 정렬한 manifest의 hash이며, 원문이나 비밀값은 포함하지 않는다.

## 기존 수치와 11개 drift 재검산

기록된 상태 수는 다음과 같이 정확히 재현됐다.

- `relevantDeployedFiles = 69`
- `relevantUnionFiles = 71`
- `CURRENT_EXACT = 58`
- `HISTORY_RECONSTRUCTABLE_DRIFT = 11`
- `LOCAL_ONLY_POST_DEPLOYMENT = 2`
- `DEPLOYED_UNMATCHED_DRIFT = 0`

11개 drift와 가장 최근 복원 commit/EOL variant도 모두 일치한다.

| 파일 | 복원 commit | variant |
|---|---|---|
| `src/app/api/ai/generate-questions-auto/_lib/constants.ts` | `3f155ca682ba` | `crlf` |
| `src/app/api/ai/generate-questions-auto/_lib/prompts.ts` | `448488cae9ab` | `crlf` |
| `src/app/api/ai/generate-questions-auto/_lib/question-repair.ts` | `448488cae9ab` | `crlf` |
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts` | `448488cae9ab` | `git-object-bytes` |
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts` | `448488cae9ab` | `git-object-bytes` |
| `src/lib/atlas-ai.ts` | `448488cae9ab` | `crlf` |
| `src/lib/question-generation-prompt-contract.ts` | `448488cae9ab` | `crlf` |
| `src/lib/question-quality/core.ts` | `27372abb9742` | `crlf` |
| `src/lib/question-quality/dispatcher.ts` | `448488cae9ab` | `crlf` |
| `src/lib/question-quality/validators/blank/inference.ts` | `3f155ca682ba` | `crlf` |
| `src/lib/question-quality/validators/grammar/combo.ts` | `3f155ca682ba` | `crlf` |

두 local-only 파일도 기록과 같다.

- `src/lib/atlas-research-fetch-boundary.ts`
- `src/lib/question-quality/validators/blank/seam.ts`

## 치명 결함 F1 — 선택 completeness가 성립하지 않는다

원본 스크립트의 `isRelevant`는 특정 route/prefix와 Atlas 파일만 고른다. “그 predicate가 고른 파일을 빠짐없이 캡처했는가”에는 답이 yes지만, “문제 생성 동작을 결정하는 관련 source dependency를 빠짐없이 캡처했는가”에는 답이 no다.

특히 다음 누락은 영어 문제 품질·후처리·비용·실행 정책을 직접 바꿀 수 있다.

- `src/lib/blank-point-catalog.ts`
- `src/lib/grammar-frames.ts`
- `src/lib/grammar-point-catalog.ts`
- `src/lib/question-postprocess/index.ts` 및 processor 폐쇄
- `src/lib/question-schemas.ts`, `src/lib/question-ai-schemas-mc.ts`
- `src/lib/question-type-generation-settings/index.ts` 및 유형별 설정 폐쇄
- `src/lib/feature-flags.ts`
- `src/lib/platform-api-costs.ts`
- `src/lib/passage-point-tokenizer.ts`, `src/lib/passage-sentence-utils.ts`
- `src/lib/question-diversity.ts`
- `src/lib/sentence-insert-options.ts` 및 point catalog들
- `src/lib/summary-complete-mc.ts`, `src/lib/summary-writing.ts`, `src/lib/topic-sentence-writing.ts`

배포 원문에서 확인한 42개 직접 누락 파일 전체는 다음과 같다.

```text
src/actions/workbench.ts
src/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config.ts
src/lib/annotation-prompt.ts
src/lib/auth.ts
src/lib/blank-point-catalog.ts
src/lib/concurrency-config.ts
src/lib/credit-costs.ts
src/lib/credits.ts
src/lib/feature-flags.ts
src/lib/grammar-correction-display.ts
src/lib/grammar-frames.ts
src/lib/grammar-point-catalog.ts
src/lib/irrelevant-point-catalog.ts
src/lib/korean/core/passage-meta.ts
src/lib/korean/core/render-model.ts
src/lib/korean/core/shuffle.ts
src/lib/korean/prompts/generation.ts
src/lib/korean/prompts/planning.ts
src/lib/korean/quality/codes.ts
src/lib/korean/quality/dispatch.ts
src/lib/korean/quality/solver-gate.ts
src/lib/korean/registry/index.ts
src/lib/korean/settings.ts
src/lib/passage-point-tokenizer.ts
src/lib/passage-sentence-utils.ts
src/lib/platform-api-costs.ts
src/lib/prisma.ts
src/lib/question-ai-schemas-mc.ts
src/lib/question-diversity.ts
src/lib/question-postprocess/index.ts
src/lib/question-postprocess/text-utils.ts
src/lib/question-postprocess/types.ts
src/lib/question-schemas.ts
src/lib/question-type-generation-settings/index.ts
src/lib/sentence-insert-options.ts
src/lib/sentence-insert-point-catalog.ts
src/lib/sentence-order-point-catalog.ts
src/lib/summary-complete-mc.ts
src/lib/summary-writing.ts
src/lib/topic-sentence-writing.ts
src/lib/workbench-ai-job-credit.ts
src/lib/workbench-ai-job-stale-cleanup.ts
```

재귀 폐쇄의 240은 정적 string-literal `import`/`export from`/`require`만 센 하한이다. computed import, 파일 시스템 접근, environment/config, Prisma generated client, 외부 서비스 상태, 별도 Trigger worker는 포함하지 않으므로 “240이면 완전하다”는 결론도 아직 내릴 수 없다.

## 치명 결함 F2 — pinned UID index만으로 dirty source를 장기 복원할 수 없다

UID가 raw SHA-1이라는 가정 자체는 69/69 실증됐다. 하지만 SHA-1은 content identifier이지 content archive가 아니다. 기존 index에는 원문이 없고, 보고서가 `CURRENT_EXACT`로 분류한 다음 두 파일은 Git history의 raw/LF/CRLF 어느 variant에도 match가 없다.

- `src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts`
- `src/lib/question-quality/validators/sentence-insert.ts`

기록 시점에는 current worktree가 배포 바이트와 exact였으므로 당시 분류는 맞다. 그러나 그 worktree는 별도로 동결되지 않았다. 실제로 감사 중 전자의 작업 파일이 후속 개선으로 바뀌어, 원본 스크립트의 현재 재실행 결과는 기록된 report SHA-256 `74a5a3c09f5dddf25f2acfc87d7ff57b0c14f646df78959a88aa030eaf2db636`과 달라졌다. 진행 중인 다른 개선까지 반영되며 두 감사 실행의 rebuild hash도 `e03ce473e508bc0c159ede575253f836204b0d7d7ef5621475261c4c686ab9c1`, `b4e18b1d06460c93ef6575eefc2caabddd2a47cfc61ec52495b479094e76fb31`로 달라졌다.

이는 과거 report가 잘못됐다는 뜻이 아니다. “동일한 mutable worktree 상태를 입력하면 결정론적”이라는 뜻일 뿐, 그 입력 상태가 artifact로 고정되지 않아 미래 재현이 보장되지 않는다는 뜻이다. 현재는 Vercel content API로 원문을 회수할 수 있지만, 외부 보존 기간에 기대지 않으려면 Git으로 복원되지 않는 raw bytes를 별도 content-addressed bundle로 보존해야 한다.

## 해시 검증

- pinned index: `aae88590de597fb6d19c2884493337d4a97dcac43da654e956d9926142fa3fa1`
- recorded JSON report: `74a5a3c09f5dddf25f2acfc87d7ff57b0c14f646df78959a88aa030eaf2db636`
- recorded Markdown: `30f346331b40f4864163e69bbf65b1e063538da89623dfc1ccc07e9a07c12806`
- original audit script: `7e27e45a463ba49b9ff4278b058b9e9e4f45fb18ad48bbae939f60de70abdfb5`
- live static-closure manifest: `9afb6b6d75273a66187c917027a767689a42c701a0e52cff6c01a071841a7cdb`

기존 baseline과 O40은 앞의 네 hash를 정확히 기록했다. 기록된 JSON을 canonical key-order로 직렬화하고 그 JSON에서 Markdown을 다시 렌더한 hash도 기존 파일과 같다.

## 요구 수정

이 증거를 full production parity 근거로 사용하기 전에 다음이 필요하다.

1. 기존 69개 산출물을 “narrow hand-selected subset”으로 명시해 baseline/O40의 `관련 dependency` 및 `source snapshot` 표현을 제한한다.
2. **배포 당시 원문**에서 시작한 local import closure manifest를 생성한다. current worktree import graph를 대신 쓰면 안 된다.
3. manifest의 각 path/UID를 raw content SHA-1로 검증하고, Git raw/LF/CRLF로 복원되지 않는 파일은 content-addressed raw bundle에 보존한다.
4. 정적 import 밖의 runtime config/data, environment flags, Prisma/generated schema, computed imports를 별도 목록으로 더한다.
5. 별도 Trigger worker version/source parity를 고정한다.
6. 확장 snapshot을 fresh-eyes로 다시 감사하고 나서야 DB cohort나 production-identical 생성 실험의 provenance 근거로 승격한다.

## 재현 명령과 안전성

```powershell
node reviews/deployment-provenance-fresh-audit/verify.mjs
node reviews/deployment-provenance-fresh-audit/verify.mjs --live-closure
```

`--live-closure`는 저장된 Vercel CLI 인증 또는 `VERCEL_TOKEN`을 메모리에서만 사용한다. 토큰, response source text, environment 값은 출력하거나 파일로 쓰지 않는다. 이번 감사에서는 Vercel GET만 사용했고, model/OpenRouter 호출, 문제 생성, DB write, browser 제어, deployment/production mutation은 모두 0회다.
