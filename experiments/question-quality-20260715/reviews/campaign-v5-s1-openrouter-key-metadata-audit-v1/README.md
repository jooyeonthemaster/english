# OpenRouter key metadata audit

This is a single read-only `GET /api/v1/key` inspection of the locally configured OpenRouter credential. It persists no key value, key hash, or key label and makes no model or generation request. The public result records only admission booleans needed to decide whether the credential is a fresh, dedicated, non-resetting S1 key capped at no more than the frozen `$44.16` reservation.

The audit cannot prove atomic no-overrun behavior for concurrent in-flight requests, account logging settings, guardrail assignment, or endpoint availability. Those remain separate execution holds even if every key-metadata boolean is true.

```powershell
npx tsx experiments/question-quality-20260715/reviews/campaign-v5-s1-openrouter-key-metadata-audit-v1/capture.mts
node experiments/question-quality-20260715/reviews/campaign-v5-s1-openrouter-key-metadata-audit-v1/verify.mjs
```
