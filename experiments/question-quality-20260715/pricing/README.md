# OpenRouter 가격 스냅샷

실험 배치의 USD 상한은 코드에 박힌 과거 단가가 아니라 실행 직전 공식 OpenRouter 모델·endpoint API를 읽어 계산한다.

```powershell
npx tsx experiments/question-quality-20260715/pricing/snapshot-openrouter-pricing.ts --write
```

- 인증 키를 사용하지 않는 공개 GET만 수행한다.
- catalog의 최저가 하나가 아니라 활성 endpoint 중 가장 높은 token rate를 보수적으로 사용한다.
- 200k token tier 경계를 별도로 보존한다. 연구 호출은 prompt token hard cap을 200k 미만으로 두지 못하면 상위 tier 단가를 예약한다.
- snapshot age, model canonical slug, endpoint pricing fingerprint가 실행 시점과 다르면 새 call lease를 열지 않는다.
- credit 구매 수수료는 모델 inference usage와 분리해 보고하되, 실제 현금비용 보고에는 별도 행으로 더한다.
