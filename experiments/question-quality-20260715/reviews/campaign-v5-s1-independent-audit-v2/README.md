# S1 campaign v5 — independent source-closure re-audit v2

Verdict: **PASS_DESIGN_INTEGRITY_EXECUTION_REMAINS_BLOCKED**.

This is an offline, independently reconstructed audit of the rebuilt S1 design. It does not authorize a provider request, does not claim production-topology parity or efficacy, and consumed `0/1,000` API candidate opportunities.

## Independent finding and remediation boundary

The first candidate rebuild presented to this audit had public artifact SHA-256 `4f33322d7b5ad98663adc0560f743c622e936836c9a9bbfdd5aab696b7d67273` and manifest SHA-256 `76b718f59b37d407fe14222e2e997dd7e6015811e2aaeb915fbd3d2b07fb0058`. The audit rejected that closure because its `production_fast_callsite` role pointed to `src/app/api/ai/generate-questions-auto/route.ts`, not the Workbench fast route whose production budget wrapping had changed. It also omitted the newly interposed `atlasProductionAssignmentFetch` transport chain.

The final rebuilt design fixes that defect. Its public source closure now includes the actual Workbench fast and Trigger callsites plus `atlas-ai`, the production-assignment and research fetch boundaries, the shared scope coordinator, assignment-budget runtime/policy, research runtime, question-generation LLM wire, direct research runner, and callsite adapter. The final public artifact is `bfe0dff9d5ebfed1eea4f1622d4c7bbecbca2db7172f925a1fc07640d46f8747`; the final design manifest is `5187e43d2bd4f7ea42bbf1cf165d39aae2909ce10e861296f96045e9406f71dd`.

## What was reconstructed

The verifier does not import the design builder. It independently joins the frozen grammar and blank reconciliation ledgers to their private source frames, the exact v3 source snapshot, and the sealed selected-source history baseline. It verifies both reviewer verdicts, disposition, development split, exact source identity, normalized and raw passage hashes, byte lengths, and zero historical exposure.

That reconstruction yields exactly 12 content-disjoint development passages: six grammar and six blank. It then independently rebuilds and compares every assignment key, seeded order rank, ordinal, assignment ID, model, fixed Workbench input, wire declaration, retry/fetch budget, cost cap, topology flags, and authorization flag for all 180 rows.

The frozen allocation is:

| Cell | Calls | Per-call cap | Reservation |
|---|---:|---:|---:|
| Grammar Standard | 48 | $0.20 | $9.60 |
| Grammar Premium | 48 | $0.43 | $20.64 |
| Blank Standard | 48 | $0.14 | $6.72 |
| Blank Premium | 36 | $0.20 | $7.20 |
| **Total** | **180** | — | **$44.16** |

The other independent margins are Grammar 96 / Blank 84, Standard 96 / Premium 84, Intermediate 90 / Killer 90, and B1 Premium 0.

## Semantic queue drift result

The private file SHA-256 remains `ba2e64ea9989d594147019c3cf88b066266bbeff11eefb74cb8299732af52583`. Its semantic SHA-256 is independently recomputed after removing only the self-digest field and remains `c120ebcc5aea5f83c1c9e97447c2913b0ebf76932e2a0cf91d2e10887a86225e`. Both values are identical to the predecessor seal. Thus the source-closure repair changed no passage, membership, assignment, order, request, cap, or authorization fact.

## Wire and privacy scope

Static source inspection confirms the intended S1 contract: Standard `google/gemini-3.5-flash`, Premium `google/gemini-3.1-pro-preview`, reasoning disabled/excluded, `provider.require_parameters=true`, one structured question, 6,000 grammar / 4,000 blank output-token caps, one outer attempt, zero SDK retries, and one physical-fetch opportunity. The newly interposed production fetch wrapper delegates exactly to the research boundary when no production-assignment scope is active.

This is not an exact-wire preflight. The 180-row controller registry has not been materialized, current environment overrides have not been admitted against it, and no provider request was made. That remains a hard execution hold.

The private queue is git-ignored and untracked. The verifier compares the public artifact against every private frame ID, content hash, source identifier, passage byte string, passage hash/token, and assignment ID/key/order rank and finds zero leaks. It also finds no credential-shaped value. Exact passage bytes and row membership remain private.

## Authorization and remaining holds

Every private assignment and both public/private campaign summaries remain unauthorized: campaign-eligible assignments 0, generated candidates 0, model API calls 0, network calls 0, database calls 0, and secret accesses 0.

This artifact satisfies only the independent-audit hold. Execution remains blocked until all five external holds pass independently:

1. documented rights to send the selected source text to the allowed provider;
2. current endpoint/provider privacy, retention, and allow-list attestation;
3. a separate limited credential with a provider-side hard spend ceiling no greater than `$44.16`;
4. exact endpoint worst-case pricing captured no more than 15 minutes before admission;
5. a materialized 180-row exact-wire controller registry and complete preflight.

## Offline verification

```powershell
node experiments/question-quality-20260715/reviews/campaign-v5-s1-independent-audit-v2/verify-independent-v2.mjs
npx.cmd tsc -p experiments/question-quality-20260715/design/campaign-v5-s1/tsconfig.json --noEmit
npx.cmd eslint experiments/question-quality-20260715/design/campaign-v5-s1/build.mts experiments/question-quality-20260715/design/campaign-v5-s1/verify.mts experiments/question-quality-20260715/reviews/campaign-v5-s1-independent-audit-v2/verify-independent-v2.mjs
npx.cmd tsc --noEmit
```

All verification is local and read-only. The audit verifier performs no network, database, model, or secret operation.

Final rerun result: the official design verifier, this independent verifier, the design TypeScript check, targeted ESLint, and the repository-wide TypeScript check all passed.
