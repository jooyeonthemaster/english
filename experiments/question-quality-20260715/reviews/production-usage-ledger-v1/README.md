# Production question-generation usage ledger v1

This read-only audit reconstructs the lower-bound operational footprint of
Workbench question generation from `WorkbenchAiJob` and
`PlatformApiUsageCost`. It compares June 2026, July before the current Vercel
deployment timestamp, and the timestamp-correlated post-deployment cohort.

```powershell
npx tsx experiments/question-quality-20260715/reviews/production-usage-ledger-v1/audit.mts --label baseline-20260715 --write
```

The public artifact contains aggregate counts, rates, quantiles, model names,
and cryptographic bindings only. The gitignored private artifact contains one
sanitized row per job with a pseudonymous job key. Neither artifact contains
passage text, question text, explanations, prompts, titles, raw database IDs,
academy IDs, staff IDs, generation IDs, or error messages.

Important limits:

- `PlatformApiUsageCost` records successful top-level usage events returned to
  the route. It can omit SDK retries, failed provider requests, JSON repair,
  and calls made before an exception. Event/call counts are therefore lower
  bounds, not physical provider-call counts.
- The ledger metadata field named `attempts` is polymorphic: ordinary object
  generation writes its reported attempt count, while the premium grammar
  ladder writes a logical ladder-attempt index. The audit keeps it only as a
  descriptive distribution and never treats it as an HTTP-call count.
- A `RECORDED` cost is the gateway-reported amount. `DB`, `ENV`, and
  `ESTIMATE` costs are reconstructed estimates. The mixed total is never
  described as an invoice total.
- The post-deployment cohort is timestamp-correlated only. Historical job rows
  do not store generator commit, deployment ID, prompt digest, or runtime
  configuration digest, so it cannot establish source-version causality.
- The script performs only `findMany` reads and disconnects without calling any
  model or provider API. It never mutates production data.
