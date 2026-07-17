# Evaluation authority v2

This is a public-only, design-only, fail-closed authority gate for S1 evaluation. It binds the current all-type rubric, exact 1,000-candidate registry, current-source S1 plan, v3 replacement taxonomy, production-type binding v4, and the v4 independent audit. It does not issue a reviewer certificate, scoring authority, evaluator authority, result access, generation authority, profile decision, or release claim.

All nine states have explicit nonempty deny sets. Access opens require prior sealed authorization and capability, and close receipts bind actor, phase, resource, visible surface, capability, and ordered authorization/open/close timestamps. The trusted-gold auditor is incompatible with pilot, main, and holdout raters. S1 phase 1 exposes only student-visible question content plus blinded identity/order/relabel data; plan, route/model/provider, prompt/profile arm, cost/usage, answer, explanations, author grade, and generation metadata remain in a separate presealed hidden commitment.

Current immutable disposition:

- `DESIGN_ONLY_EXECUTION_BLOCKED`
- `PRE_ACCESS_UNAUTHORIZED`
- `evaluatorAuthorityGranted=false`
- `authorizedReviewers=0`
- `authorizedAdjudicators=0`
- `eligibleAssignments=0`

Only the exact public upstream paths in `protocol.json` may be read. Any `private/` path, gold/answer/reveal content, environment or secret, database, network, model/API, or budget ledger is outside this artifact's authority.

Local deterministic verification:

```powershell
npx tsc -p experiments/question-quality-20260715/design/evaluation-authority-v2/tsconfig.json
npx tsx experiments/question-quality-20260715/design/evaluation-authority-v2/build.mts
npx tsx experiments/question-quality-20260715/design/evaluation-authority-v2/verify.mts
npx tsx experiments/question-quality-20260715/design/evaluation-authority-v2/hostile-tests.mts
```

`build.mts --write` is permitted only to materialize deterministic files inside this package. An actual transition requires a separate immutable execution-evidence package and independent audit; this design snapshot itself remains unauthorized permanently.
