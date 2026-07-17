# Provider fetch-boundary zero-network probe

This directory verifies the physical HTTP-call visibility of
`ai@6.0.99` and `@ai-sdk/openai-compatible@2.0.56` without contacting a
provider, database, browser, or any other network service.

Run from the repository root:

```powershell
.\node_modules\.bin\tsx.cmd --test experiments/question-quality-20260715/probes/provider-fetch-boundary.probe.mjs
```

The probe deliberately uses `https://mock.invalid/v1` and injects a custom
`fetch` that only returns in-memory `Response` objects or throws simulated
network errors. It never delegates to `globalThis.fetch` and never reads an
environment variable.

Covered cases:

1. `generateObject` with omitted `maxRetries` sees three physical requests
   after two retryable HTTP 503 responses.
2. Two simulated retryable network failures plus success also produce three
   custom-fetch invocations.
3. `maxRetries: 0` produces exactly one request.
4. malformed model JSON plus `experimental_repairText` creates another
   provider request; an explicit child ALS scope gives it repair lineage.
5. without that child hook, ALS correctly propagates the operation but cannot
   infer that the nested request is a repair.
6. concurrent operations retain isolated ALS operation IDs.
7. `Response.clone()` can capture response ID, token usage, and billed cost
   while leaving the original body readable by the SDK.

See [RESULTS.md](./RESULTS.md) for the findings and integration constraints.

The implemented trusted boundary is documented in
[PROVIDER-BOUNDARY-PHASE-A.md](./PROVIDER-BOUNDARY-PHASE-A.md). Phase A remains
zero-network and does not authorize an experiment run.
