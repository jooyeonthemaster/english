# Prompt-profile integration audit v2 — latest-source closure

## Verdict

**Local integration: PASS. Campaign execution: NO_GO.**

The frozen S1 prompt-profile mechanism is correctly integrated into the latest inspected source, but this is not permission or evidence to run the live campaign. This audit consumed **0 API candidates**, made **0 external network calls**, and performed **0 application-DB reads/writes**.

The earlier independent BLOCK result is preserved byte-for-byte in `PRE_FIX_EVIDENCE.json`, with its own `PRE_FIX_SEAL.sha256`. The current PASS is a new latest-source judgment; it does not erase or rewrite the pre-fix record.

## What now passes

- Eight profile IDs are scoped to the sealed research runtime and bounded by question type and plan. B1 Premium is rejected before operation, stage, or transport because it is byte-identical to B0.
- The four frozen compact prompt strings remain byte-exact:
  - G2: 960 characters, `fc01702f…43bb`
  - G3: 1,641 characters, `001139b7…bee1`
  - B2: 926 characters, `ff10990a…58cb8`
  - B3: 1,612 characters, `1b98cb8a…bcca`
- The provider-visible G3 and B3 JSON schemas are exactly equal to frozen v1 after applying the server-owned `questions.length(1)` boundary. There are no differing JSON paths.
- The G3 adapter now fail-closes every non-answer marker unless its exact window occurs once in the admitted passage and its exact expression occurs once inside that window. The pre-fix fabricated non-answer probe is rejected.
- The B3 adapter now requires four distinct distractor primary mechanisms. Cross-row uniqueness is not expressible in the provider JSON Schema used here, so the raw schema still parses the adversarial four-`STANCE_SHIFT` object; the server adapter rejects it before finalization or admission. This is a deliberate two-layer boundary, not a silent acceptance.
- Engine-entry preflight requires one plan item, count 1, empty target points, empty teacher/custom/previous-feedback text, no diversity override, strict mode, and attempt index 0. The tested count, multi-plan, target-point, custom-prompt, retry-attempt, and relaxed-mode drifts all fail before operation, stage, or fetch.
- All 15 applicable profile-plan cells traverse the actual production question-generation entrypoint and emit one intercepted physical wire each. Each wire proves:
  - Standard model `google/gemini-3.5-flash`
  - Premium model `google/gemini-3.1-pro-preview`
  - `provider.require_parameters=true`
  - `reasoning={enabled:false, effort:"none", exclude:true}` and no alternate reasoning-effort field
  - exact `questions.minItems=maxItems=1`
  - grammar `max_tokens=6000`, blank `max_tokens=4000`
  - one root structured stage and no ladder, repair, solver, or prompt-JSON child
- Raw provider-candidate object identity is used for observation and terminal decision; adapted objects are not substituted into the research ledger.
- Four local mock provider responses cover accepted and deliberately mismatched G3/B3 full response paths from OpenRouter-shaped bytes through SDK parse, raw observation, adapter, production finalizer/current gate, and terminal acceptance/rejection.
- No-profile prompt and schema functions preserve exact object identity. Ordinary retry/repair paths remain covered and unchanged by the profile opt-in.

## Verification performed

The focused suite passed **70/70** tests. It included profile unit tests, all 15 real-entrypoint wire cells, accepted/rejected full-response fixtures, retry-envelope checks, exact response cardinality, fetch-boundary accounting, the callsite adapter, and Phase-C entrypoint/cardinality tests.

`npx.cmd tsc --noEmit` passed. Focused ESLint over the production integration, harness, tests, and this verifier passed.

`source-closure.json` pins every frozen-design, production-integration, harness, verification-test, and toolchain file used in the judgment. `MANIFEST.sha256` seals every file in this audit directory except itself. The verifier recomputes the prompt/schema/adversarial evidence, checks source closure, checks the preserved pre-fix seal, validates recorded test coverage, and validates the directory manifest.

Run:

```powershell
npx.cmd tsx experiments/question-quality-20260715/reviews/prompt-profile-integration-audit-v2/verify.ts
```

## Why campaign execution remains NO_GO

This PASS proves local integration only. Live S1 execution stays blocked until all of the following are independently satisfied:

1. A provider-side hard spending cap is attested for the campaign credential.
2. The reconciled source pool and private 180-cell assignment queue are frozen and admitted under the campaign controller.
3. Live provider results are generated, blinded, and judged; no quality effect has been measured in this audit.
4. Any mechanism-screen winner receives a separately preregistered confirmation through the actual release topology. S1 deliberately suppresses production ladder/repair/solver branches, so it cannot by itself prove production-topology performance.

Accordingly, no profile is promoted, no live request is authorized, and the campaign counter remains **0/1000**.
