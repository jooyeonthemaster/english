# S1 campaign v5 — immutable design queue

Status: **DESIGN COMPLETE / EXECUTION BLOCKED**. This artifact authorizes no live request and consumes `0/1,000` API candidate opportunities.

## Exact screen

The private queue joins only the six frozen dual-pass development passages from grammar v2 and the six frozen dual-pass development passages from blank v2 to their exact snapshot passage bytes. All twelve selected rows are present in the sealed `selected-source-history-v1` baseline, whose 76 selected rows are 76/76 history-clean with zero prior Question or Workbench-job exposure under that baseline.

The 180 assignments are a bounded single-shot mechanism screen:

| Cell | Calls | Per-call cap | Reservation |
|---|---:|---:|---:|
| Grammar Standard | 48 | $0.20 | $9.60 |
| Grammar Premium | 48 | $0.43 | $20.64 |
| Blank Standard | 48 | $0.14 | $6.72 |
| Blank Premium | 36 | $0.20 | $7.20 |
| **Total** | **180** | — | **$44.16** |

Grammar is `4 profiles × 2 plans × 2 difficulties × 6 passages = 96`. Blank Standard is `4 × 2 × 6 = 48`; Blank Premium is `B0/B2/B3 × 2 × 6 = 36`. B1 Premium has exactly zero rows because its provider surface is identical to B0 Premium. Only `INTERMEDIATE` and `KILLER` are included.

Every row fixes one semantic question, one candidate opportunity, one physical fetch, one outer attempt, and zero SDK retries. Grammar output is capped at 6,000 tokens and blank at 4,000. Standard uses `google/gemini-3.5-flash`; Premium uses `google/gemini-3.1-pro-preview`. Reasoning is `{ enabled:false, effort:"none", exclude:true }`, and `provider.require_parameters=true`.

The current fast and Trigger Workbench callsites both form Korean school/grade labels and source difficulty instructions from `DIFF_DESCRIPTION`. To remove that nuisance variable while retaining the production input shape, every S1 row freezes `schoolType="고등학교"`, `gradeInfo="2학년"`, the exact current `INTERMEDIATE` or `KILLER` label, and its exact current difficulty instruction. Teacher intent, analysis context, custom prompt, and target points are empty; type settings and Korean-passage metadata are omitted.

Queue order is a frozen SHA-256 seeded order over the private passage membership and cell. A timeout, malformed response, gate reject, no-safe-site result, or provider error remains that row's terminal intention-to-treat failure. Retry replay, replacement, reordering after outcomes, and top-up are prohibited.

## Privacy boundary

`private/s1-queue-v5.json` contains exact passage text, source identifiers, row digests, split membership, and all 180 assignments. It is git-ignored. The public JSON contains aggregate counts and immutable artifact/queue hashes only; it contains no row ID, row digest, passage text, source identifier, or per-row membership.

## Remaining hard holds

Execution remains blocked until all of these independently pass:

1. documented rights for sending the selected source text to the allowed provider;
2. current endpoint/provider privacy, retention, and allow-list attestation;
3. a separate limited credential with a provider-side hard spend ceiling not above `$44.16`;
4. exact endpoint pricing captured no more than 15 minutes before admission, with every request inside its frozen per-call cap;
5. materialization and exact-wire preflight of the 180-row controller registry;
6. fresh independent review of the private binding, public privacy boundary, and admission arithmetic.

S1 is not production-topology confirmation, cannot select a shipping winner by itself, and does not change a production default.

## Reproduce and verify

```powershell
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v5-s1/build.mts --write
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v5-s1/verify.mts
npx.cmd tsc -p experiments/question-quality-20260715/design/campaign-v5-s1/tsconfig.json --noEmit
```

All commands are offline: no model API, network, database, or secret access is used.
