# reviewer-calibration v4 독립 적대 감사

판정: **PASS_NO_BLOCKERS**

이 감사는 `reviewer-calibration-v3-production-type-binding-v4`의 자체 verifier, builder, REPORT 주장, fixture runner를 증거로 재사용하지 않았다. 별도 구현한 `independent-verify.mjs`가 대상 byte seal, Git 상태, 재귀 import 폐쇄, 실제 요청 URL의 AST 데이터 흐름, 유형 집합과 회전 수학, 독립 hostile 변조를 처음부터 다시 계산했다.

## 봉인한 대상

- 대상 snapshot SHA-256: `d126aa316d8c1457d71989441a49d7ca93676687b2032a738d4ea71cd6531967`
- 대상 manifest SHA-256: `715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04`
- 독립 verifier SHA-256: `c8562e2d1d45065a2a77d637179663a94396bc0f64ade98491a53d489fdcde2e`
- source evidence digest: `c46ffa2532dc8b22c11a0e8edf2565d5f4361104c7cc1d18d18a8ae4edc28cc6`
- closure digest: `e574130750851774ab8fb876dcb7e0a7a291380bb6dda773e711adfebbacb1f1`

대상 manifest의 네 파일은 모두 일치했다. 함께 놓인 `build-binding.mjs`는 manifest에 봉인되지 않은 비권위 builder이므로 감사 증거로 실행하거나 신뢰하지 않았다.

## 독립 재계산 결과

- Git HEAD `467c6d107137a91088d3eba1620ba4036a63d709`, tree `e74361c0cfae22a1092bb4738ae21b14f1aa9cb7`, ref `refs/heads/20260714jooyeon`이 일치했다.
- production source 256개는 247 tracked + 9 worktree-only untracked였다. raw/filtered blob, index, HEAD, porcelain-v2, `ls-files -v`, worktree/HEAD 일치 여부와 last-path commit을 전부 다시 계산해 mismatch 0을 확인했다.
- last-path commit은 각 파일마다 정확히 `git log -1 --format=%H -- <path>`로 계산했다. merge commit에서 전역 `--name-only`와 의미가 달라질 수 있으므로 전역 로그를 대용하지 않았다.
- 6개 root에서 로컬 static import, export-from, type-only edge, literal dynamic import와 literal require를 재귀 추적해 241파일·709 edge를 얻었다. parse diagnostic, unresolved local import, nonliteral module load는 모두 0이다.
- 709 edge의 권위는 exact set이다. 배열은 `source → resolved target → specifier → kind → source position` 순서의 canonical evidence serialization임을 별도로 확인했으며, 탐색 발견 순서를 권위로 취급하지 않았다.
- `/director/workbench/questions/generate`는 `manual`, non-Korean 상태에서 desktop row/modal과 mobile `MobileStepNav` 양쪽 모두 `handleWorkspaceGenerate`로 이어졌다. `questionType`과 `questionTypeSettings`는 fast unit, scheduler, literal fast endpoint, manual plan, assignment-budget callback, `runQuestionGenerationWithEmptyRetry`, AI schema 선택까지 이어졌다.
- secondary batch와 legacy Trigger는 이 경로의 positive authority가 아니며 도달 불가/제외 상태가 확인됐다. 모바일 `configOnly` 모달은 설정만 닫고 dispatch하지 않으며, 실제 모바일 dispatch는 하단 step navigation에 있다.
- picker 25개, focus 2개, nonfocus 23개, 8 family, 32 schedule row를 독립 추출·재계산했다. epoch 1 combined distinct=16, epoch 2 combined contact=23, main-only epoch 4 contact=23이다. contact는 certification이 아니며 단일 epoch all-type 주장도 허용되지 않는다.

## 적대 검증과 재현

대상의 54개 fixture runner를 호출하지 않고 별도 20개 변조를 메모리에서 수행했다. manifest byte flip, duplicate JSON key, route scope 변경, desktop/mobile dispatch 제거, early return, endpoint 우회, helper field 제거, budget wrapper 제거, schema 제거, picker/legacy 변경, unresolved/nonliteral/second-hop closure, 수학 변조, TOCTOU, baseline false-positive control을 모두 기대대로 판정했다.

동일한 frozen verifier byte를 수정 없이 두 번 실행했다.

1. `2026-07-15T14:23:15.078Z`–`14:24:38.310Z`: 20/20 check, 20/20 hostile, exit 0.
2. `2026-07-15T14:24:51.929Z`–`14:26:11.630Z`: 20/20 check, 20/20 hostile, exit 0.

두 실행 모두 target, 256 source, Git HEAD/tree/ref의 시작·종료 snapshot이 동일했다.

## 감사기 개발 중 발견과 분리

초기 감사기 실행에서 나온 실패는 대상 blocker와 분리해 보존했다.

- 전역 `git log --name-only`가 merge path history를 정확히 재현하지 못한 4건은 256개 per-path 명령으로 교정했고 전부 대상 값과 일치했다.
- edge set을 AST 발견 순서와 비교한 문제는 exact canonicalized set 비교로 교정했다. 별도의 배열 순서는 resolved target 중심 canonical serialization으로 검증했다.
- `mobileNext`가 parenthesized IIFE라는 점을 초기 AST helper가 풀지 못한 문제는 wrapper/IIFE unwrap으로 교정했다.
- helper hostile가 유사한 앞선 body와 잘못된 `mode` 표면을 잡은 문제는 `createFastQuestionGenerationJob` 이후로 anchor했다.
- canonical-order comparator를 source/specifier로 추측한 후속 문제는 실제 저장 순서를 독립 식별·검증해 바로잡았다.

이 다섯 건은 모두 감사기 결함이었고 대상의 evidence mismatch가 아니었다. 교정 후 frozen verifier의 연속 2회 PASS가 최종 판정 근거다.

## 판정 경계

PASS는 현재 worktree의 `PRIMARY_WORKSPACE_FAST_ONLY`, `MANUAL_AND_NON_KOREAN_ONLY` 실행 바인딩과 25/23/8 회전 계약에 한정된다. deployed commit parity, secondary/legacy 경로, 실제 문항 품질을 주장하지 않는다. 대상·production source·Git freeze·독립 verifier 중 하나라도 바뀌면 fresh audit가 필요하다.

네트워크/provider/model/API candidate/DB/secret/trusted-gold/ledger 접근과 쓰기는 모두 0이었고 대상 파일 쓰기도 0이었다.
