# Grammar source-frame v2 reconciliation closure

Status: **DUAL-PASS SUPPLY SUFFICIENT; EXACT SPLIT FROZEN; GENERATION NOT AUTHORIZED**

The immutable 186-row source frame and both independent full-census reviews were reverified before reconciliation. The precedence rule was applied without exceptions: any `EXCLUDE` produces `EXCLUDE`; otherwise any `DOMAIN_REVIEW` produces `DOMAIN_REVIEW`; only `PASS`/`PASS` produces `DUAL_PASS`.

The result is 137 dual-pass rows, 42 exclusions, and 7 domain-review holds. The 137-row dual-pass supply exceeds the frozen requirement of 38. No excluded or domain-review row can enter any split.

Exactly 38 rows were selected once with the frozen seed `cross-type-grammar-v2-dual-pass-split-20260715-v1`. The split is development 6, confirmatory 20, and reserve 12. Topic quotas are exact:

| Split | art-culture | humanities | science | social | narrative-practical | Total |
|---|---:|---:|---:|---:|---:|---:|
| Development | 1 | 1 | 1 | 1 | 2 | 6 |
| Confirmatory | 2 | 5 | 5 | 4 | 4 | 20 |
| Reserve | 1 | 3 | 3 | 2 | 3 | 12 |

Selection used only frozen topic/discourse/word-band metadata plus a content-blind seeded rank over pseudonymous digests. An independent exhaustive replay reproduced the discourse allocation and every selected row. The selected discourse counts are argumentative 14, expository 15, narrative 8, and practical 1, so no discourse supplies more than half of the 38 rows. Replacement, outcome-dependent top-up, quota relaxation, and later substitution are prohibited and were not used.

The reconciliation public release consists only of this audit, the aggregate reconciliation summary, the deterministic reconciliation program, its independent verifier, and their public manifest. Those reconciliation artifacts contain no row identifier, row content digest, passage text, row-level judgment, per-row split membership, or private-artifact hash. The previously sealed `source-frame-public.json` is an input review frame governed by its own immutable source manifest; it is not part of this reconciliation release.

All 38 selected rows remain ineligible for generation. Historical-exposure refresh, rights review, provider controls, and the operational queue seal are still pending. `campaignEligibleRows` is 0 and `generationAuthorized` is false.

This closure used no model API, network, database, secret, generated-question, or full-question-candidate call. API candidate count remains 0.

Verification command:

```powershell
node experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2/verify-reconciliation.mjs
```
