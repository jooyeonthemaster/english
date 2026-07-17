# Explanation concision offline audit v1

Read-only audit of current explanation contracts plus the local latest-15 and premium-grammar-60 artifacts. No production code, provider, network, API, database or secret was touched.

Rebuild and verify from the repository root:

```powershell
node experiments/question-quality-20260715/reviews/explanation-concision-offline-audit-v1/audit.mjs --write
node experiments/question-quality-20260715/reviews/explanation-concision-offline-audit-v1/verify.mjs
```

`manual-review.json` contains the four-class rubric and item notes. `audit-data.json` contains reproducible measurements; semantic manual judgments are deliberately separated from regex screening signals.
