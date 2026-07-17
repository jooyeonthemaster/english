# Campaign v5 S1 independent audit

## Verdict

**PASS — design integrity only; execution remains blocked.** The frozen queue is a reproducible 180-assignment, single-shot S1 mechanism screen. This audit closes the independent-review evidence item, but it does not authorize a request, consume an API candidate, establish production-topology parity, or make a quality/efficacy claim.

## Independently verified

- Replayed the official builder with `--write` and the official verifier. Public artifact, private queue, and design-manifest hashes were identical before and after the replay.
- Ran the design-local TypeScript check and ESLint on `build.mts` and `verify.mts`; both passed.
- Ran `verify-independent.mjs`, which does not import the builder or official verifier. It reconstructs the allocation and binding from the frozen JSON, current upstream files, reconciliation corpora, source snapshot, and history baseline.
- Bound exactly 12 dual-pass development passages: 6 grammar and 6 blank. Every one joins an exact row in the 76/76 history-clean baseline; all 76 baseline rows have zero Question, AI-question, and Workbench-job exposure in that captured baseline.
- Reconstructed all 180 unique assignment keys and deterministic order ranks. The allocation is Grammar 96 / Blank 84, Standard 96 / Premium 84, Intermediate 90 / Killer 90, with B1 Premium exactly 0.
- Checked every row's model, reasoning-off contract, `require_parameters`, count-1 schema, output cap, one candidate opportunity, one physical-fetch cap, one outer attempt, zero SDK retries, no ladder/repair/solver/fallback/salvage, no replacement/top-up, and authorization false.
- Recomputed the hard reservation: `48×$0.20 + 48×$0.43 + 48×$0.14 + 36×$0.20 = $44.16`.
- Recomputed the private file and semantic hashes and checked every published upstream file hash and byte count against current bytes.
- Confirmed the private queue is git-ignored and untracked. Scanning all design-manifest public files found zero exact passage, row ID, row digest, source ID, assignment ID/key/rank, or credential-value leaks.

## Frozen hashes

| Artifact | SHA-256 |
|---|---|
| Private queue file | `ba2e64ea9989d594147019c3cf88b066266bbeff11eefb74cb8299732af52583` |
| Private semantic queue | `c120ebcc5aea5f83c1c9e97447c2913b0ebf76932e2a0cf91d2e10887a86225e` |
| Public campaign artifact | `5b06e262850239d2fd86eb827028515f28bd2674f6f326b15d6ba70536606e59` |
| Design manifest | `d64e98ad52a7ffc8afbaebc9e868a1f0ed4a8002d1638f67b902403a407e4355` |

## Authorization and remaining holds

The independent-audit evidence item is satisfied by this artifact, while the frozen public design correctly remains unmodified and still labels itself blocked. `campaignEligibleAssignments=0`, `generationAuthorized=false`, and `apiCandidateCount=0` remain unchanged.

Five non-audit holds still block execution:

1. documented rights to send the selected source text to the allowed provider;
2. current endpoint retention/privacy and provider allow-list attestation;
3. a separate limited credential with a provider-side hard ceiling no greater than `$44.16`;
4. exact endpoint pricing captured within 15 minutes of admission, with every request below its frozen cell cap;
5. a materialized 180-row controller registry and exact-wire preflight.

No API, network, database, or secret access occurred in this audit. Production source and private queue semantics were not edited.

## Reproduce

```powershell
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v5-s1/build.mts --write
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v5-s1/verify.mts
npx.cmd tsc --noEmit -p experiments/question-quality-20260715/design/campaign-v5-s1/tsconfig.json
npx.cmd eslint experiments/question-quality-20260715/design/campaign-v5-s1/build.mts experiments/question-quality-20260715/design/campaign-v5-s1/verify.mts
node experiments/question-quality-20260715/reviews/campaign-v5-s1-independent-audit/verify-independent.mjs
```
