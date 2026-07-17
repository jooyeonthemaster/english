# Verification report

## Result

`PASS_DESIGN_INVARIANTS_ONLY_EXECUTION_NO_GO`

This PASS means the eight profiles, exact prompt bytes, executable schema drafts, frozen rubric, screen arithmetic, zero-call cost measurements, source pins, and artifact hashes are internally reproducible. It does **not** authorize provider calls, prove production parity, certify provider JSON-schema compatibility, or select a winning profile.

## Checks

- External model/API calls: 0
- Full-question candidates consumed: 0/1,000
- DB writes: 0
- Browser calls: 0
- Production source edits from this task: 0
- Production default changes: 0
- Profiles: 8 total; control/minimal/intermediate/structured for each focus type
- Rejected Flash premium ladder/w5 diet reintroduced: no
- CORE-10 schema enum: exactly `a,b,c,d,e,f,g,h,i,k`
- Grammar site certificate precedes `markedExpressions` and replaces internal `errorDesign`
- Blank blueprint precedes `options` and replaces internal `blankDesign`
- Grammar screen arithmetic: 96 fixed single-shot calls
- Blank screen arithmetic: 84 fixed single-shot calls; PREMIUM B1 is excluded as a byte-identical B0 duplicate, and B1 cannot enter the two-plan S2
- Total screen arithmetic: 180 fixed calls
- Holdout target: 240 ITT assignments/type, explicitly not 240 candidate slots/type
- Checklist accounting: 512-character payload; 514-character rendered-surface delta after builder separators
- Frozen screen output caps: grammar 6,000; blank 4,000
- Frozen screen per-call USD caps: grammar STANDARD/PREMIUM `$0.20/$0.43`; blank STANDARD/PREMIUM `$0.14/$0.20`
- Six-cluster screen uses fixed priority and deterministic eligibility; raw A/B, beauty, and cost point estimates cannot rank arms
- Parse threshold is at least 10/12 per applicable plan; structured binding denominator includes failures and allows at most 2/24 mismatches
- Holdout fatal-free noninferiority margin: -5 percentage points
- Holdout economic ratio margin: strict upper bound below 1.25; zero A/B or missing billing fails
- Primary family IDs/order and type gates match byte-for-byte across rubric/spec/verifier: `G_FATAL_NI,B_FATAL_NI,G_AB_SUP,B_AB_SUP,G_COST_NI,B_COST_NI`; six one-sided tests, Holm alpha 0.05, paired cluster bootstrap seed 20260715 and 100,000 replicates
- Frozen rubric specifies fatal families, exact validity/readiness/craft/beauty fields, A/B/C/F, forced-failure and unresolved handling
- PREMIUM grammar S2 control is the actual eligible ladder, including triggered regeneration/repair, solver, fallback, and salvage; only G3 changes the answer stage
- S2 whole-queue admission is `SOURCE_UNPINNED_BLOCK` pending a fresh source-bound callgraph; stale 675/378 ceilings are no-execution blockers
- The 23 nonfocus types × 12 rows are smoke/defect discovery only
- Provider schema, adapter, and exact-wire compatibility remain explicit NO-GO until zero-network exact-provider-transform fixtures pass
- All profile rows explicitly deny production-parity status
- Holdout disjointness, no-replacement ITT rule, no efficacy peeking, and no automatic top-up are machine-asserted
- Working-tree production/evidence hashes match the source pin set used by the measurement verifier
- Expected prompt/schema/surface/cost measurements reproduce byte-for-byte
- Manifest file sizes and SHA-256 values reproduce

## Commands

```powershell
$env:NODE_OPTIONS=''
npx tsx experiments/question-quality-20260715/design/prompt-profiles-v1/verify.ts
npx tsc --noEmit --pretty false
```

Both commands must complete with exit code 0 after the manifest is frozen.

## Measurement qualifications

- Character totals use one frozen 697-character passage and current source-pinned builders.
- Token estimates use a single observed 2.2696 chars/token calibration plus 1.8–3.0 sensitivity, not an official model tokenizer.
- Expected output token counts are planning assumptions, not observations; hard screen output caps are larger and separately verified against USD ceilings.
- PREMIUM grammar general-path screen rows are not the eligible production ladder's cost/yield.
- The ladder measurement is a representative two-stage fixture because add-decoys embeds model-generated answer bytes.
- The pinned price snapshot is stale for execution. A fresh price capture and proved controller lease are mandatory.
- Current production prompt/call-path reconstruction is source-level. Compiled Vercel/Trigger byte parity remains outside this artifact.
- A compiling Zod schema/adapter is not provider compatibility. Exact request transform, captured response-byte binding, and postprocess replay remain untested.

## Remaining execution blockers

1. Provider/controller/parser fresh PASS and complete call-site integration.
2. Current callgraph envelopes and exact candidate/physical/USD whole-queue admission.
3. Private passage binding and manual holdout eligibility.
4. Fresh price snapshot and provider-side spend cap.
5. Zero-network exact-wire tests for every profile, plan, and stage.
6. Independent design audit and merge into the global ≤1,000 frozen registry.
7. Route/deployment confirmation before any default can change.
