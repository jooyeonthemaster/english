# Campaign v6 connectivity micro-pilot

Status: **design complete / live execution blocked**. This is a two-call connectivity and route probe, not a quality experiment.

The probe uses one newly composed, PII-free blank-inference passage reserved only for this operational run-in and the unchanged `B0_CURRENT_CONTROL` profile. It sends the same `INTERMEDIATE` assignment once through Standard (`google/gemini-3.5-flash`) and once through Premium (`google/gemini-3.1-pro-preview`). The source and both outputs are excluded from S1/S2/S3/S4 and profile selection. Each started assignment permanently consumes one of the user's 1,000 full-question opportunities even if it fails or is rejected. There is no retry, repair, solver, fallback, replacement, or top-up.

Both requests must be compiled through the current production generation core and run under separate one-entry durable registries plus a shared serial two-call cap. The OpenRouter route is exactly `google-vertex/global`, with fallback disabled, parameter support required, data collection denied, ZDR required, and reasoning disabled. A price snapshot must name that exact endpoint tag; provider/name alone is insufficient because `/flex` and `/priority` share the visible provider/model name but have different rates.

The existing credential may be used only for this bounded probe because the text is direct-original and contains no observed PII, the maximum is two serial no-retry requests, and token/call bounds are local and fail closed. This narrow exception does not satisfy or weaken the full S1 requirement for a fresh dedicated zero-usage provider-capped credential.

No result from two rows can compare quality or endpoint reliability. The only admissible conclusions are whether each fixed request started, whether it received a bounded response, whether the structured response could be correlated to exactly one semantic candidate, and what the observed usage/cost evidence was.

Offline verification:

```powershell
npx.cmd tsx experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/verify.mts
node experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/finalize-manifest.mjs
```

Neither command makes a network, model, provider, or database call.
