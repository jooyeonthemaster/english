# Call-site inventory

Snapshot date: 2026-07-15 KST. This is a source inventory, not a claim that the
budget is implemented.

## User-facing Workbench path in scope

The current director UI sends manual generation to:

```text
src/app/(director)/director/workbench/generate/use-generation-handlers.ts
  -> POST /api/workbench/ai-jobs/question-generation/fast
  -> src/app/api/workbench/ai-jobs/question-generation/fast/route.ts
  -> runQuestionGenerationWithEmptyRetry
```

The persistent alternative is:

```text
src/app/api/workbench/ai-jobs/question-generation/route.ts
  -> Trigger task "workbench-question-generation"
  -> src/trigger/workbench-question-generation.ts
  -> runQuestionGenerationWithEmptyRetry
```

Both must enroll the same durable job ID. Protecting only the fast route would
leave the Trigger topology and its whole-task retry outside the cap.

## Provider paths reached by the engine

The ordinary English question engine reaches Atlas/OpenRouter through the AI
SDK provider created in `src/lib/atlas-ai.ts`:

- `generateQuestionObject` / prompt-JSON fallback / JSON repair;
- candidate repair;
- grammar solver;
- Premium grammar answer/add-decoy/repair ladder stages.

The ladder imports `atlasChatModel` directly, but that model still uses the same
SDK fetch. Therefore the budget must wrap the provider fetch, not only
`generateQuestionObject`.

No direct import of `postAtlasChatCompletionAsGeminiLike` was found in the
English Workbench question-generation engine at this snapshot. This fact must
be asserted by a static regression test; it is not safe to assume forever.

## Other callers of the shared outer generator

The following source paths also call
`runQuestionGenerationWithEmptyRetry` but are not automatically covered merely
by enrolling Workbench jobs:

- `src/app/api/ai/generate-question/route.ts`
- `src/app/api/ai/generate-questions-auto/route.ts`
- `src/lib/custom-question-types/generator.ts`
- `src/lib/korean/sets/generate.ts`
- `src/lib/question-sets/generate-set.ts`
- `src/lib/similar-exam-generation/generation.ts`
- `src/lib/similar-exam-generation/question-analysis/generator.ts`
- `src/lib/tutor/program-generation.ts`

Each needs its own durable assignment identity and policy before an all-product
coverage claim is valid. v1 is intentionally scoped to the director Workbench
job path named by the user.

## Bypass regression rule

Canary is blocked if any enrolled Workbench path:

1. imports a direct Atlas/OpenRouter REST helper;
2. supplies a provider-specific fetch that does not compose the budget
   boundary;
3. invokes native/global `fetch` for an AI completion;
4. creates a new task/job identity for an automatic retry;
5. can run provider work before the durable budget row is initialized.

