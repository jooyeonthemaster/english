# Retry/cost Pareto study v1

현재 문제생성 콜그래프를 바꾸지 않고, `count=1`에서 재시도·구제·어법 사다리·Trigger 재실행이 어떻게 곱해지는지 정적 산술로 분해한 오프라인 연구 번들이다. 기준은 봉인된 `current-callgraph-topology-audit-v2`와 그 감사가 고정한 현재 소스다.

이 번들은 네트워크, 모델, API, DB, 시크릿/환경값을 읽지 않았고 문제 후보를 만들지 않았다. 프로덕션 소스도 수정하지 않았다.

## 핵심 결과

- ordinary full-schema wrapper의 현재 호환 최장 경로는 application 3회 × 명시적 SDK 호출 3개 × SDK physical 3회 = **27 physical fetches**다.
- Premium 어법 사다리는 현재 한 strict pass당 **54 physical fetches**다.
- outer quality pass와 Trigger crash replay까지 더하면 봉인 감사의 count=1 물리 상한(648/162/675/513/378/270)을 모두 재현한다.
- `SDK retry=1`, wrapper application retry=0, outer/사다리 유지안은 transport retry 한 층을 보존하면서 ordinary wrapper 물리 배수를 27→6으로 낮춘다. 그러나 이는 **구조적 Pareto 후보**일 뿐 품질 결론이 아니다.
- 총 USD 상한은 여전히 `null`이다. 입력 bytes/tokens에 소스 강제 상한이 없고, 가격 스냅샷이 admission용으로 낡았으며, 배포 실효 모델을 증명하지 않았고, durable assignment budget 기본값이 `OFF`이기 때문이다.
- `questions[]`에는 provider-visible `maxItems=1`이 없다. count=1 후처리 slice와 wire cardinality는 별개다.

## 파일

- `REPORT.md`: 결론, 현재 정확 상한, 구조적 Pareto 해석
- `formulas.json`: 기계 판독 수식·축·셀·실패 분류
- `scenario-matrix.json`: 2,952개 전수 조합
- `profile-comparison.json`: 9개 이름 붙은 정책 프로필 비교
- `evidence-plan.md`: 변경 전 계측·블라인드 held-out 검증 계획
- `implementation-proposal.md`: 나중에 적용할 최소 소스 변경안(현재 미적용)
- `source-hashes.json`: 봉인 감사·가격증거·현재 소스 해시
- `build.mjs`, `verify.mjs`, `MANIFEST.sha256`: 결정론 재생성·검증·봉인

## 재현

저장소 루트에서 다음을 실행한다.

```powershell
node experiments/question-quality-20260715/design/retry-cost-pareto-v1/build.mjs
node experiments/question-quality-20260715/design/retry-cost-pareto-v1/verify.mjs
```

첫 명령은 기본적으로 파일을 쓰지 않는다. `--write`는 시나리오/프로필 JSON을 결정론적으로 다시 만들 때만 사용한다.

