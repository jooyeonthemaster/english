# Phase-C exact-cardinality route integration audit

Snapshot: `2026-07-15`, repository HEAD `467c6d107137a91088d3eba1620ba4036a63d709` plus the dirty Phase-C worktree.

## Outcome

Phase C adds a research-only exact semantic-cardinality route while preserving ordinary production behavior:

- **Mechanistic policy: PASS.** Counts 1 and 3 survive Zod, the AI SDK, Atlas request transformation, and the exact mocked wire as equal `minItems/maxItems`.
- **Registered engine-entry route: PASS for one failure fixture.** A sealed one-question `BLANK_INFERENCE` assignment invokes the actual `runQuestionGenerationWithEmptyRetry` function and produces one structured ITT `no_candidate` with no prompt-JSON network downgrade.
- **Full production parity: BLOCK.** Multi-question lineage, retained parents, successful downstream branches, billing recovery, HTTP/Trigger orchestration, all types, and live provider acceptance are unproved.

External provider calls were **0**. No secret value was inspected, logged, persisted, or sent. No application/canonical database was opened; the durable controller test uses only an isolated temporary test ledger, which is deleted in `finally`.

## Implementation

### Sealed cardinality

`QuestionGenerationCallsiteAdapter` now exposes `expectedQuestionsPerStructuredCall`, derived from candidate contracts in its sealed registry. It does not accept a separate caller-provided count. Every candidate-producing entry available to the adapter must agree on one positive safe integer.

`runWithQuestionGenerationResearchRuntime` validates and freezes that count in ALS. `runQuestionGeneration` independently verifies the actual production plan count is a positive safe integer equal to the sealed count before provider work.

`buildResearchAwareQuestionResponseSchema` is the single schema wrapper used by:

- `getAiResponseSchema`; and
- the alternate structured `QUESTION_SCHEMAS` branch.

With no runtime, it returns the existing unbounded `z.array(questionSchema)`. With the runtime, it returns `z.array(questionSchema).length(sealedCount)`.

### Research-only provider routing

`atlasCloud.transformRequestBody` adds:

```json
{ "provider": { "require_parameters": true } }
```

only when both conditions hold:

1. a question-generation research runtime is active; and
2. the transformed request actually uses `response_format.type=json_schema`.

Existing provider fields are preserved. Ordinary structured calls and research plain-text calls receive no added provider field.

### Strict failure as ITT

Ordinary production still uses prompt-inlined JSON fallback for eligible masked-400 or grammar-too-large failures.

Inside the research runtime, the same strict failure is an ITT no-candidate. `generateQuestionObject` skips the unconstrained prompt-JSON branch, retains normal structured retry/deadline handling, and throws when that handling is exhausted. This prevents an unbounded semantic response from entering a cardinality-attested assignment.

### Concrete experimental runner

`experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts` is a concrete one-subtype runner. Before installing ALS it verifies:

- exactly one production plan item exists;
- its count is a positive safe integer; and
- its count equals the adapter's sealed count.

It then invokes the actual `runQuestionGenerationWithEmptyRetry` entrypoint inside the adapter assignment. It is deliberately not wired into production HTTP or Trigger routes.

## Zero-network evidence

### Actual wire

`structured-cardinality-wire.test.ts` captures the actual body passed by `atlasChatModel` to its fetch seam:

| Case | `minItems` | `maxItems` | `provider.require_parameters` |
|---|---:|---:|---|
| No runtime | absent | absent | absent |
| Research count 1 | 1 | 1 | `true` |
| Research count 3 | 3 | 3 | `true` |
| Research plain text | n/a | n/a | absent |

It also proves the alternate wrapper shares the rule, invalid counts reject before callback, and the no-runtime stage wrapper returns the exact callback promise.

### Actual entrypoint

`actual-entrypoint-campaign.test.ts` uses a deterministic STANDARD `BLANK_INFERENCE ×1` input:

1. A zero-network compiler invocation captures the actual research-shaped production request.
2. That exact body, prompt, schema, model, endpoint, parser, pricing proof, corpus row, and one-candidate envelope are sealed into the controller registry.
3. An independent run uses `QuestionGenerationCallsiteAdapter` and the concrete Phase-C runner to call the actual engine entrypoint.
4. The mocked provider returns the observed masked-400 shape with reported usage.
5. The replay body hash must equal the sealed hash.

Observed replay:

- provider dispatches: **1**;
- structured dispatches: **1**;
- prompt-JSON dispatches: **0**;
- candidate slots: **1**;
- terminal outcome: **`no_candidate`**;
- assignment state: **`closed`**.

A mismatched plan count of 2 is rejected before assignment admission.

## Ordinary-production non-regression

Outside the opt-in runtime:

- `getAiResponseSchema("BLANK_INFERENCE")` still accepts `{ questions: [] }`;
- its actual wire remains unbounded;
- Atlas adds no `provider` routing field;
- existing forced/masked prompt-JSON fallback code remains enabled; and
- operation/stage wrappers preserve their direct return identity.

The legacy Wave-3 static tests were updated only to recognize the already-existing Claude-model guard and Phase-B `researchStage` field; their fallback behavior assertions remain unchanged.

## Verification commands

```powershell
.\node_modules\.bin\tsx.cmd --test `
  tests/unit/atlas-research-fetch-boundary.test.ts `
  experiments/question-quality-20260715/harness/atlas-controller.test.ts `
  experiments/question-quality-20260715/harness/question-generation-callsite-adapter.test.ts `
  experiments/question-quality-20260715/reviews/provider-callsite-phase-c/structured-cardinality-wire.test.ts `
  experiments/question-quality-20260715/reviews/provider-callsite-phase-c/actual-entrypoint-campaign.test.ts `
  tests/unit/fallback-json-null-promotion.test.mjs `
  tests/unit/wave1-schema-order.test.mjs `
  tests/unit/wave3-premium-writing.test.mjs

.\node_modules\.bin\tsx.cmd experiments/question-quality-20260715/harness/test.ts

.\node_modules\.bin\tsc.cmd --noEmit --pretty false
```

Targeted ESLint covers all changed Phase-C production, harness, and test files. `verify.ps1` reruns the frozen focused evidence and hash checks.

Recorded result for the frozen snapshot:

- focused boundary/controller/callsite/schema/Phase-C suite: **68/68 PASS**;
- budget-guard harness: **25/25 PASS**;
- targeted ESLint: **PASS, zero warnings**;
- global `tsc --noEmit --pretty false`: **PASS**;
- external provider/network calls: **0**.

## Explicit blockers

1. A successful multi-question actual-entrypoint run is not proved. Exact count alone does not solve interleaved child lineage.
2. A failed child repair followed by reuse of an older retained candidate remains incompatible with latest-parent enforcement.
3. `unknown_after_send` still requires billing reconciliation and leaves the assignment open.
4. Forced prompt-JSON types are research ITT failures until a conservative semantic envelope is separately designed and proved.
5. HTTP route, Trigger, set-member, persistence, and live provider behavior are not exercised.
6. No claim is made that every registered subtype's schema is accepted by every eligible OpenRouter provider.

See `BYPASS-SCAN.md` for the route inventory and split verdict.
