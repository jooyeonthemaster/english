# Production Assignment Budget v1 — PostgreSQL Integration

## Verdict

`PASS` on an isolated loopback PostgreSQL 16.14 database whose name was prefixed `qgen_budget_ephemeral_`.

This closes the architecture review's missing database evidence for the current source snapshot:

- 100 simultaneous physical fetch attempts under one Workbench job and cap 7 produced exactly 7 committed leases/delegates and 93 rejections.
- A second 100-attempt run used mixed request/output sizes with physical cap 100 and USD reservation cap 8,000 micro-USD. Six calls were admitted at five distinct reservation sizes, 94 were rejected, and the durable total stopped at 7,700.
- Three independently entered assignment scopes resumed ordinals exactly as `1,2,3,4,5`; no ordinal was reclaimed after controller re-instantiation.
- When the terminal Workbench update won the row lock, the fetch remained blocked and then dispatched zero times.
- When one lease committed first, exactly one delegate ran; after the job became terminal, the next fetch dispatched zero times.
- An existing `ENFORCE` row followed by a changed `SHADOW` policy failed closed on `POLICY_DRIFT`; the unscoped callback count was zero.
- The verbatim migration rejected illegal budget and lease states through PostgreSQL CHECK constraints.

No OpenRouter/model API call, external network call, or production database write occurred. Response objects were local fakes; only the explicitly named loopback database was mutated.

## What this does not authorize

This result does not enable `CANARY_ENFORCE` or `ENFORCE`. Remaining prerequisites are an authoritative price snapshot captured within 15 minutes of execution, independently verified provider-side hard-spend controls, statistically justified per-cell caps, and deployment/migration rehearsal in the real staging topology. The operational default remains `OFF`.

## Safety and reproduction

`integration.mts` refuses to start unless `DATABASE_URL` has a loopback host and a database name beginning `qgen_budget_ephemeral_`. Recreate a fresh isolated database, apply `setup-workbench.sql`, then apply the production migration verbatim:

```powershell
# DATABASE_URL must be supplied out of band and point only to the isolated DB.
npx tsx experiments/question-quality-20260715/reviews/production-assignment-budget-v1-postgres-integration/integration.mts --write
node experiments/question-quality-20260715/reviews/production-assignment-budget-v1-postgres-integration/finalize-manifest.mjs
node experiments/question-quality-20260715/reviews/production-assignment-budget-v1-postgres-integration/verify.mjs
```

The test database used for the sealed run was newly created, and the migration file hash is recorded in `results.json`.
