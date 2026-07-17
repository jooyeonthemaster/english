# S1 campaign v5 — independent source-closure delta audit v3

Verdict: **PASS_CURRENT_SOURCE_AND_OFFLINE_WIRE_EXECUTION_REMAINS_BLOCKED**.

This is a compact offline delta audit after the structured research-wire privacy hardening. It authorizes no generation and consumed `0/1,000` API candidate opportunities.

## Delta result

The current campaign public artifact is `f4e2085c90736042329d4a921cc2d28bfc81fe47bf4b72f410253a688c8b909a`; its manifest is `5a31e85be1b8c6c25fd0110f06566193c645f295e92566b60ecdd7ecefd6dff9`. The source closure contains the actual Workbench fast route, Trigger route, generation engine, Atlas entry, production-assignment/research fetch boundaries, shared scope coordinator, budget runtime/policy, research runtime/profiles, LLM wire, phase runner, and callsite adapter at their current hashes.

The official builder was replayed with `--write`. All six pre/post design hashes were identical, including the public artifact, manifest, and private queue, and the official verifier passed afterward. The private queue remains byte-identical at `ba2e64ea9989d594147019c3cf88b066266bbeff11eefb74cb8299732af52583`; its independently recomputed semantic hash remains `c120ebcc5aea5f83c1c9e97447c2913b0ebf76932e2a0cf91d2e10887a86225e`. No passage, membership, assignment, order, cap, or authorization state changed from v2.

## Current emitted research wire

Static inspection of `src/lib/atlas-ai.ts` and the 180-row intercepted offline preflight agree on one exact provider policy:

```json
{
  "order": ["google-vertex/global"],
  "only": ["google-vertex/global"],
  "allow_fallbacks": false,
  "require_parameters": true,
  "data_collection": "deny",
  "zdr": true
}
```

The transform applies that immutable object to structured question-generation research requests and fails closed when the configured gateway is not OpenRouter. The production assignment fetch seam delegates to the research boundary when no production-assignment scope is active.

The offline controller preflight independently observed exactly 180 intercepted fetches and 180 unique wire bodies. Every row used `https://openrouter.ai/api/v1/chat/completions`, strict JSON Schema, reasoning `{enabled:false, effort:"none", exclude:true}`, the exact Google Vertex global-only route above, one completion, one semantic candidate, and the frozen output/cost cap. The separate 15-cell profile/plan wire test passed all four test cases. No provider or external network call occurred.

## Privacy and authorization

The campaign queue and controller row file are both git-ignored and untracked. A private-value scan across the campaign public artifact, controller public artifact, this report, and the machine result found zero frame IDs, row hashes, passage bytes, source identifiers, assignment IDs/keys, exact wire hashes, or credential-shaped values.

Request-level ZDR and routing hardening does not certify account-specific logging, retention, workspace guardrail assignment, or provider account state. Those facts still require redacted authenticated evidence. The campaign remains `campaignEligibleAssignments=0`, `generationAuthorized=false`, and `apiCandidateCount=0`.

Execution remains blocked by:

1. a local source-processing rights decision;
2. authenticated account logging/retention and guardrail attestation;
3. a fresh maximum price for the exact allow-listed provider, captured no more than 15 minutes before admission;
4. a dedicated limited credential and provider-side hard ceiling no greater than `$44.16`;
5. sealed durable per-assignment execution registries and ledger.

The offline exact-wire compilation closes a design/preflight question only; it is not live execution admission.

## Verification

```powershell
node experiments/question-quality-20260715/reviews/campaign-v5-s1-independent-audit-v3/verify-independent-v3.mjs
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v5-s1/verify.mts
npx.cmd tsx experiments/question-quality-20260715/execution/campaign-v5-s1-controller-v1/verify-controller-preflight.mts
npx.cmd tsx --test tests/unit/question-generation-research-profile-wire.test.ts
npx.cmd tsc -p experiments/question-quality-20260715/design/campaign-v5-s1/tsconfig.json --noEmit
npx.cmd tsc -p experiments/question-quality-20260715/execution/campaign-v5-s1-controller-v1/tsconfig.json --noEmit
npx.cmd tsc --noEmit
```

All listed verifications passed. This audit made no model/provider request, external network request, database call, or credential-value recording.
