# Production usage ledger v1 — independent snapshot audit

## Verdict

`PASS_SNAPSHOT_ARITHMETIC_AND_PRIVACY` for the frozen public v3 snapshot. The audit does not regenerate the ledger or query production; it independently recomputes the public snapshot's arithmetic, declared source hashes, period partitions, daily maxima, model totals, and privacy/safety flags.

- Workbench jobs: **15,311**
- cost rows read: **19,070**
- joined ledger events: **19,064**
- orphan cost rows: **6**
- KST dates: **44**
- mixed ledger cost: **$462.304344**
- largest day: **2026-06-28**, 2,524 jobs / 3,465 events / $85.199761
- post-deployment timestamp-correlated slice: **8 jobs / 19 events / $0.463582**

The deployment split is timestamp correlation only and is not a causal before/after quality estimate. Historical cost combines reconstructed estimates and newly gateway-recorded amounts; it is an operational baseline, not a clean model-price experiment.

The public file asserts no academy/staff/raw database IDs, passage/question/prompt/explanation text, titles, generation IDs, or error messages. Its generating query was read-only and recorded zero DB writes and zero model/provider calls. The private artifact is not opened or republished here; only its declared hash is checked against the frozen manifest.

Reproduce offline:

```powershell
node experiments/question-quality-20260715/reviews/production-usage-ledger-v1-independent-audit/finalize-manifest.mjs
node experiments/question-quality-20260715/reviews/production-usage-ledger-v1-independent-audit/verify.mjs
```
