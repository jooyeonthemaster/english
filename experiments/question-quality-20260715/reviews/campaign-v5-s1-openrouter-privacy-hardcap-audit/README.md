# Campaign v5 S1 — OpenRouter privacy and hard-cap audit

Captured: **2026-07-15 16:10 KST**  
Verdict: **BLOCK — account privacy controls, effective provider allow-list, and a provider-side no-overrun spend ceiling are not certified.**

This is a read-only prerequisite audit. It made **zero model/generation requests**, consumed **0/1,000** candidate opportunities, created no execution price snapshot, read no credential value, and authorizes no S1 assignment.

## What the public OpenRouter surface proves

- OpenRouter supports per-request Zero Data Retention with `provider.zdr=true`; it can also be enforced at account or guardrail level. ZDR restricts inference to endpoints whose provider policy is classified as zero-retention. [Official ZDR documentation](https://openrouter.ai/docs/guides/features/zdr)
- Provider routing is permissive by default: `data_collection` defaults to `allow` and `allow_fallbacks` defaults to `true`. The request can instead set `data_collection:"deny"`, an explicit `only`/`order` list, and disabled fallbacks. [Official provider-routing documentation](https://openrouter.ai/docs/guides/routing/provider-selection)
- OpenRouter says it does not store prompt/response content unless the account opts into private input/output logging or product-improvement use; it still stores request metadata. Those opt-ins are account-specific state, not something the public docs certify for this account. [Data-collection documentation](https://openrouter.ai/docs/guides/privacy/data-collection), [input/output logging documentation](https://openrouter.ai/docs/guides/features/input-output-logging)
- Guardrails can intersect provider/model allow-lists, enforce Google ZDR, and impose per-key/member budgets. Public documentation proves the capability, not that a guardrail is configured and assigned to the S1 credential. [Guardrails documentation](https://openrouter.ai/docs/guides/features/guardrails)
- OpenRouter exposes optional per-key credit limits and `limit_remaining`. Public docs do not state a strict no-overrun contract for concurrent/in-flight requests. Workspace budgets explicitly allow already-dispatched requests to finish and therefore may overshoot. [Credit-limit documentation](https://openrouter.ai/docs/api_reference/limits), [workspace-budget documentation](https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets)

The unauthenticated ZDR endpoint preview was captured only for privacy/routing evidence. It contained six exact target rows, all on Google Vertex tags: three for Standard and three for Premium. Standard rows reported raw `status=0`; all Premium rows reported raw `status=-2`. Both target models advertised `reasoning` and `response_format`. OpenRouter's public documentation found in this audit did not define the negative status value, so the preview proves catalog inclusion, not Premium availability or successful routing. No pricing field was extracted or persisted from this endpoint.

## What the frozen S1 wire currently proves

The 180-row private queue requires `provider.require_parameters=true`, reasoning off, fixed output caps, and one physical fetch. It contains **zero** row-level contracts for `zdr`, `data_collection`, provider `only`/`order`, or `allow_fallbacks=false`. The production request transform likewise adds only `require_parameters` for structured research requests.

The local environment scan was name-only. `.env.local` contains a generic `OPENROUTER_API_KEY` variable name and the expected base/model variable names, but no S1-specific credential variable, no management-key variable, no privacy/ZDR variable, and no active assignment-budget policy variable. A generic key's presence proves neither that it is dedicated nor that it has any limit. No value or secret-file hash was recorded.

The in-app/account browser was unavailable, and no authenticated account endpoint was called. Consequently this audit cannot establish the current OpenRouter logging toggles, product-improvement opt-in, account/guardrail ZDR state, guardrail assignment, provider/model allow-list, credential limit, remaining limit, prior usage, BYOK inclusion, or key exclusivity.

## Hard-cap conclusion

`$44.16` is a valid **local reservation total**, not yet a certified OpenRouter-side maximum. OpenRouter documents per-key limits as spending caps, but the public material reviewed here does not promise atomic reservation of every in-flight request against the remaining key limit. It explicitly says workspace budgets may slightly exceed their limit because dispatched work completes. Therefore neither a workspace budget nor an uninspected generic key can satisfy the frozen requirement for an independently enforced provider-side ceiling of `$44.16` or less.

The local PostgreSQL assignment budget is useful defense in depth, but it is not proof of the separate provider credential/limit and its enforcing mode is not configured in the inspected local environment.

## Required redacted admission evidence

All items below must pass without disclosing a plaintext credential:

1. A fresh, dedicated S1 key, not shared with production or another campaign. A redacted account/API attestation must show `limit <= 44.16`, `limit_reset=null`, `limit_remaining=limit`, zero prior usage, `include_byok_in_limit=true`, and a short expiry. If OpenRouter cannot attest no-overrun semantics for in-flight requests, the provider-side-hard-ceiling hold remains open regardless of the displayed limit.
2. Redacted account evidence that both private input/output logging and OpenRouter use of inputs/outputs are off for the S1 workspace.
3. A guardrail or exact request contract enforcing Google ZDR, exactly the two S1 model IDs, and only explicitly vetted Google Vertex provider tags. Exact provider slugs must come from the current endpoint surface; do not infer them from display names.
4. Exact wire must include `zdr:true`, `data_collection:"deny"`, an allow-list/pin, disabled fallback outside that set, and `require_parameters:true`. The provider response/routing metadata must prove the selected endpoint stayed inside the attested set.
5. Re-check Premium's negative ZDR-preview status and endpoint eligibility immediately before the separate exact-wire preflight. This is availability evidence, not a generation authorization.
6. Preserve the local single-fetch/zero-retry controller and keep campaign concurrency bounded. This does not replace item 1.

Until these account-specific facts are independently captured and verified, `campaignEligibleAssignments=0`, `generationAuthorized=false`, and `apiCandidateCount=0` must remain unchanged.

## Reproduce

```powershell
node experiments/question-quality-20260715/reviews/campaign-v5-s1-openrouter-privacy-hardcap-audit/verify.mjs
```

The verifier is offline. It verifies the sealed artifact, current local wire/queue evidence, and a name-only `.env.local` scan. It never loads or prints an environment value.
