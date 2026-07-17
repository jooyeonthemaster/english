# Retry-envelope implementation audit v1

Snapshot: 2026-07-15 KST, Git HEAD `467c6d107137a91088d3eba1620ba4036a63d709`, dirty pre-existing worktree. The implementation author declared an initial freeze at `2026-07-15T06:37:39.629+09:00`. The first seal attempt failed closed when it detected a root-authorized concurrent structured-cardinality change. The affected retry/cardinality surface was independently rerun, then re-frozen at `2026-07-15T06:52:28.064+09:00`; the resulting 41-file closure and drift provenance are pinned in `source-closure.json`.

## Verdict

**Retry-envelope implementation: PASS.** The current source closes the client-side response-opportunity envelope requested by the design:

- application retry input and environment values are hard-bounded to `0..2`;
- outer input and Workbench Trigger attempts are hard-bounded to `1..2` without removing subtype floors/caps;
- all five direct `generateObject`/`generateText` calls in the audited question-generation closure set `maxRetries` explicitly;
- ordinary source defaults remain `R=2`, SDK `K=2`, outer `E=2`, Trigger `T=2`, and ladder parse retry `=1`;
- research installs the one frozen policy `R=0`, `K=0`, `outer request=1`, ladder parse retry `=0`, structured repair disabled;
- this is single-dispatch **per admitted registered stage**, not single-dispatch for a whole assignment;
- PREMIUM Gemini reasoning is off by source default and the ladder has no reasoning-on fallback; and
- the currently wired repair, solver, repeat-root, and ladder children use trusted physical-parent lineage.

The Workbench structured response schema now carries the normalized server-plan count on both schema branches and emits equal `minItems`/`maxItems`; that narrower cardinality subclaim passes. Two materially different claims remain **BLOCK** and are not smuggled into the PASS:

1. Ordinary forced prompt-JSON is a plain-text provider response. Client-side exact-schema validation can reject extra objects, but it does not bound how many complete question objects the provider can emit before validation.
2. There is no complete authorized four-cell research registry for `STANDARD|PREMIUM × BLANK_INFERENCE|GRAMMAR_ERROR` and all root/repeat/repair/ladder/solver/scarce/salvage stages.

Campaign authorization is therefore **NONE**. This audit authorizes no provider call.

## Boundary findings

`normalizeQuestionGenerationApplicationRetries` accepts only safe integer numbers, preserves zero, and clamps above two. Its environment reader uses the same boundary. Outer and Trigger environment readers require positive safe integers and clamp above two; invalid zero, fractions, unsafe integers, and non-finite values return the source default of two.

The outer cap is applied to caller input before the existing pass graph. Source floors `4/5/6/10`, PREMIUM strict cap `5`, and STANDARD grammar KILLER cap `4` remain. In particular, research `outerMaxAttempts=1` does not mean one assignment call: subtype floors plus relaxed/scarce/salvage operations remain distinct.

An independent TypeScript AST walk found these direct SDK calls:

| File | SDK calls | Explicit `maxRetries` |
|---|---:|---:|
| `src/lib/question-generation-llm.ts` | 4 | 4 |
| `grammar-premium-ladder.ts` | 1 | 1 |

The focused mocked-transport test then proved the behavior rather than only the syntax: ordinary SDK retry made three physical fetches; the research policy made one; application input `999` was limited to three wrappers/nine physical fetches; ordinary PREMIUM repair remained available; research structured and prompt-JSON repair children were absent; ordinary ladder parse failure fired twice and research fired once.

## Source arithmetic

The counting unit is one engine assignment, one English subtype, requested `count=1`, excluding the legacy auto-planner and duplicate client submissions. A physical fetch is a request at the Atlas custom-fetch boundary.

With source defaults:

- `R=2`, so one wrapper has `A=R+1=3` application attempts;
- `K=2`, so one explicit SDK invocation has `H=K+1=3` physical fetches;
- the compatible worst full-schema application route is structured → prompt-JSON → JSON continuation repair, so `O=3A=9` logical SDK responses per wrapper; and
- Workbench Trigger permits `T=2` task attempts.

| Cell | Candidate logical | Evaluation logical | Design logical | Engine physical | Trigger physical |
|---|---:|---:|---:|---:|---:|
| STANDARD / BLANK_INFERENCE | 216 | 0 | 0 | **648** | **1296** |
| PREMIUM / BLANK_INFERENCE | 54 | 0 | 0 | **162** | **324** |
| STANDARD / GRAMMAR_ERROR | 162 | 63 | 0 | **675** | **1350** |
| PREMIUM / GRAMMAR_ERROR | 96 | 18 | 12 | **378** | **756** |

The derivations are serialized in `envelope.json` and independently recomputed by `verify.mjs`. These are response-opportunity bounds, not bounds on complete semantic objects a provider may emit in an ordinary plain-text prompt-JSON response.

## Research semantics and lineage

The canonical policy is frozen and accepted only by object identity. At an active stage, application retry, SDK retry, and ladder parse retry are zero, while `experimental_repairText` and prompt-JSON continuation repair are not installed. The source comment and runtime interface correctly preserve separate assignment, operation, and stage scopes.

Dynamic lineage was checked at the actual callsites:

- candidate repair and both solver gates carry the exact raw provider-returned candidate as `derivationParentValue`;
- ladder answer regeneration and ladder repair carry their exact prior full candidate;
- add-decoys immediately follows its answer-only design call, and legacy fallback immediately follows ladder give-up, so the adapter binds the trusted latest physical call with no intervening provider dispatch;
- outer repeat roots bind the adapter's trusted latest physical call; and
- unknown, forged, cross-assignment, or stale parents fail before child network dispatch.

This is a mechanistic lineage closure for currently wired paths. It is not evidence that a complete registry exists. The adapter deliberately fails on an unregistered child, and no production campaign runner instantiates it.

## Explicit blocks

### Ordinary response cardinality

Both structured branches in the Workbench production builder now pass `expectedTypeCount` from the normalized server plan. The shared wrapper validates that count and produces an exact array schema; a zero-network wire test confirms equal `minItems`/`maxItems`. Callers that supply no owned count retain the legacy unbounded wrapper.

The full ordinary engine route can still use forced prompt-JSON as plain text. Its eventual client-side exact-schema validation and later slicing cannot retroactively limit the number of complete question objects already emitted by the provider. Status: **BLOCK_PLAINTEXT_PROMPT_JSON_UNBOUNDED**.

### Four-cell operational registry

Only test-local/mechanistic registries are present. There is no frozen operational set covering every root, repeat, candidate repair, JSON variant, ladder child, solver, scarce, and salvage transition for all four cells. Status: **BLOCK_NOT_PRESENT**. No four-cell research arithmetic or execution authorization is claimed here.

## Verification

All commands ran after the implementation freeze and before artifact sealing:

| Check | Result |
|---|---:|
| Focused retry/reasoning mocked transport | 10/10 PASS |
| Phase-C + boundary + controller + adapter | 68/68 PASS |
| Budget-guard harness | 25/25 PASS |
| Grammar regression | 199/199 PASS |
| Post-re-freeze retry/reasoning/cardinality | 15/15 PASS |
| Post-re-freeze Phase-C/cardinality wire | 9/9 PASS |
| Targeted ESLint | PASS, zero warnings |
| Global `tsc --noEmit --pretty false` | PASS |

Recorded test assertions: **326/326 PASS** (302 in the initial frozen run plus 24 post-drift targeted rechecks). An intermediate TypeScript invocation caught a concurrently half-written new test and failed; after root completed that authorized test-only narrowing fix and declared the surface stable, the final global invocation passed. External network/API calls were zero. No application or external database was touched; controller tests used disposable test-local SQLite ledgers only. No secret value was inspected or persisted, and no live candidate was generated. The audit changed no production file and no existing design artifact.

Run the immutable verifier from the repository root:

```powershell
node experiments/question-quality-20260715/reviews/retry-envelope-implementation-audit-v1/verify.mjs
```

The verifier checks the full source closure, artifact manifest, AST callsite exhaustiveness, caps/defaults, research policy, reasoning, lineage hooks, open blocks, and all arithmetic. Any source or artifact drift fails closed.
