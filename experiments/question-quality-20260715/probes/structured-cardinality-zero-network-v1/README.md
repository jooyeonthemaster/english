# Structured cardinality zero-network probe v1

This probe captures the exact AI SDK request body with an in-memory fetch delegate. It never contacts a provider and never reads an API key.

It tests three distinct claims:

1. the current `getAiResponseSchema("BLANK_INFERENCE")` production wrapper emits an unbounded `questions[]` schema and even accepts an empty array client-side; the same structural census is repeated across all 64 registered AI types and the 25 active English UI types;
2. `z.array(item).length(1)` and `.length(3)` survive the SDK transform as equal `minItems`/`maxItems` in strict `json_schema` mode;
3. `provider.require_parameters=true` added by the OpenAI-compatible request transform survives into the exact wire body.

Run:

```powershell
npx tsx experiments/question-quality-20260715/probes/structured-cardinality-zero-network-v1/probe.mts
npx tsx experiments/question-quality-20260715/probes/structured-cardinality-zero-network-v1/verify.mts
```

This is mechanistic evidence only. It does not prove that OpenRouter's selected Gemini endpoints accept every production schema, that prompt-JSON fallbacks preserve cardinality, or that changing the production wrapper is regression-free.
