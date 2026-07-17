# Source-pinned current path and historical constraints

This trace describes the local working tree captured for this design. It does not claim that the local tree, the Vercel compiled Lambda, and the promoted Trigger worker are byte-identical. The deployment-closure audit separately proved a 245-file raw-source closure; compiled artifacts, external packages, generated Prisma, runtime data, and exact Trigger promotion remain outside that proof.

## Pin

- Repository: `D:\Desktop\2026project\nara`
- Branch: `20260714jooyeon`
- HEAD: `467c6d107137a91088d3eba1620ba4036a63d709`
- Working tree: dirty before this design; unrelated user/agent changes were preserved.
- API/model/DB/browser calls made by this design: 0
- Production source files edited by this design: 0

Relevant working-tree SHA-256 values at capture:

| File | SHA-256 |
|---|---|
| `src/lib/question-prompts-mc.ts` | `56b736e9f5fa639146d30c811589182099708eba06d0f9e3b4338c0a098e0206` |
| `src/lib/question-generation-prompt-contract.ts` | `5fcf0144529af8b5cc72616c25fd45535d5920098acc5434e7c7ec428e9cd354` |
| `src/lib/question-ai-schemas-mc.ts` | `bb921628a894646addd851e1ac97f30c0d65ac657826e7413bc41a25abbc52ac` |
| `src/app/api/ai/generate-questions-auto/_lib/prompts.ts` | `7d6f0d25e2933f122323dda29d3f65bacb03dafc62444f4cff72088e8422bf59` |
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts` | `b13d1b161286d12ce44eb23ff8f4e594421676109bf8c348abea0c9393ebd4a5` |
| `src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts` | `40141d5ecf0c713f1d706cbedf434f2a7eef86d44fa3ddd22142ddba3f3c22a3` |
| `src/app/api/ai/generate-questions-auto/_lib/question-repair.ts` | `811702366ba41f36310d2a80963ad35076c37ed4a695f1eac3b69d4dbc4729dc` |
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts` | `a672875d20315667b7a662737930f63c76328136656bbb635c014d5f1ed24bff` |
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts` | `bda4f9f2c10a7284a74424b16799024ff07e3956cc5357292b4ce9416cc549d4` |
| `src/app/api/ai/generate-questions-auto/_lib/grammar-solver-gate.ts` | `be7a80c1e4e9833f5b05352c532375534b5a1f19102b12f6fea89b9f5310da88` |
| `src/lib/korean/quality/solver-gate.ts` | `0684d70bceeb33de90f56f5cd055aac3327274c5a6e39d188c1597d197e3b499` |
| `src/lib/question-generation-research-runtime.ts` | `bf087a05daf3b13c03fa48dfe2962872c13c3f5aeb9022941fccb06d8381aff6` |
| `experiments/question-quality-20260715/offline/out/prompt-constraint-census.json` | `a5c9ca9d8f2d68bf5afcab97cfad042099e3a2644e3d692d78890e80ef356831` |
| `experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json` | `4b8c0cf36d3bca226e6ce824fa566ef96e496c384cb37256a987247332cc73e3` |

The shared research note remained live while sibling audits appended new observations, so it is cited as evolving evidence rather than a verifier-enforced source pin. The immutable profile artifact records the rejected decisions it relied on in `profile-spec.json`.

These stable direct-file pins are still not a source-closed topology-envelope hash. The research-runtime integration now has passing local tests, but the last independent full callgraph audit predates the pinned source closure. Accordingly `profile-spec.json` freezes `sourceTopologyEnvelopeStatus=SOURCE_UNPINNED_BLOCK`: local prompt reconstruction and direct call-site files can be verified, but no `S2` assignment or production-parity claim is authorized until a fresh closed-source callgraph is independently hashed and reviewed.

## Exact local assembly path

### Shared setup

`run-question-generation.ts` resolves the effective type difficulty and plan, then reads `STRUCTURED_TYPE_PROMPTS[subType]`, the type-quality rubric, type settings, diversity signals, teacher points, and a source-derived target-candidate block. It obtains a Zod response envelope from `getAiResponseSchema`, then calls `buildGenerationPrompt`.

After generation, the same path normalizes, post-processes, reconstructs the student-visible passage, applies deterministic quality validators, optionally invokes the grammar solver, records rejection/repair state, and only then admits or salvages a candidate. Prompt experiments cannot claim success from parse or gate acceptance alone.

The pinned working tree also wraps the root operation with `runQuestionGenerationResearchOperation` and records candidate-capable stages through `question-generation-research-runtime.ts`. The general structured/JSON-fallback stages, PREMIUM grammar answer/regeneration/add-decoy/repair stages, candidate repairs, solver children, parsed rejection, and accepted/salvaged terminal decisions are now explicit call-site observations. Those hooks improve lineage accounting; they do not supply the missing source-closed callgraph envelope or authorize this profile registry.

### STANDARD general path

1. `buildGenerationPrompt(... generationPlan="STANDARD")`
2. `buildGeminiCompactGenerationPrompt(...)`
3. One user prompt containing passage, optional analysis/teacher/diversity blocks, type prompt, output instructions, difficulty, marking rubric, quality contract, final checklist, and output rules.
4. `generateWithRetry(...)`
5. `generateQuestionObject(...)`
6. Vercel AI SDK `generateObject(...)`
7. `atlasChatModel(ATLAS_STANDARD_MODEL_ID)` → OpenRouter-compatible provider.

The attested current fallback model is `google/gemini-3.5-flash`. Gemini reasoning is transformed to `{enabled:false, effort:"none", exclude:true}`. Wrapper retry fallback is 2; the installed AI SDK also has its own default retry layer unless explicitly overridden at the operation. Those are physical-call/cost concerns and are intentionally removed only in the bounded single-shot screening estimand.

`GRAMMAR_ERROR` is already registered for a type-scoped STANDARD contract. `BLANK_INFERENCE` production default is still `production_legacy`, so it receives the whole cross-type contract tail. The existing research-only `force_type_scoped` switch reduced the frozen blank lower-bound surface from 45,676 to 29,141 characters without changing production default bytes.

That switch is the `B1` STANDARD-only diagnostic. PREMIUM never consumes the STANDARD contract tail, making `B1` byte-identical to `B0` there. The design therefore schedules no PREMIUM `B1` call and does not permit `B1` into the two-plan confirmatory holdout; there is no sham duplicate.

For STANDARD grammar, the current KILLER path asks the model for one spare decoy (`G=K+1`) and deterministically trims before validation. The current general-path grammar output cap is 8,192 for BASIC/INTERMEDIATE and 12,000 for KILLER, bounded by the surrounding generation floor/cap logic.

### PREMIUM general path

`buildGenerationPrompt(... generationPlan="PREMIUM")` separates a static system preamble (type prompt, rubric, structured instructions, difficulty/common output rules) from a dynamic user prompt (passage, analysis, target points/settings, final checklist). It does not append the STANDARD-only quality contract. `generateQuestionObject` resolves the question-generation model to `google/gemini-3.1-pro-preview`, uses strict structured output, and retains PREMIUM JSON repair/fallback behavior when triggered.

`BLANK_INFERENCE` uses this general path for both plans. During finalize, INTERMEDIATE and KILLER blank items are forced to `PARAPHRASE` unless the explicit double-negative setting applies. Therefore a profile cannot infer the visible-answer mode only from prompt wording.

### Eligible PREMIUM grammar path

The production branch uses the specialized ladder only when all of these are true:

- `subType === "GRAMMAR_ERROR"`
- effective plan is PREMIUM
- quality mode is strict
- English, one requested item
- final marker count 5 and answer count 1
- no teacher points, custom prompt, or teacher-intent block

The ladder does **not** consume the general grammar prompt. It runs:

1. answer-only schema/prompt with two embedded few-shot examples;
2. add-decoys full grammar schema/prompt with the answer fields locked;
3. current finalize/gates;
4. hard-block regeneration, up to two complete answer-only + add-decoys cycles;
5. at most one targeted repair in a cycle for non-hard defects;
6. if the ladder gives up, the legacy PREMIUM general path can still run.

Each logical ladder stage retries a schema-parse failure once with the same thinking-off shape. The former hard-coded `reasoning_effort:"low"` fallback has been removed. AI SDK physical retries remain a separate layer until a sealed campaign runner overrides and accounts for them.

This is why the prompt mechanism screen cannot call a one-shot Pro grammar arm “production parity.” The fair screen fixes one candidate-capable call for both models. In confirmation, the control must be the whole eligible ladder just described—including triggered regeneration/repair, solver, legacy fallback, and salvage—not a general-path Pro sham. Only `G3` has a frozen ladder treatment mapping: replace `answerDesign` with the structured site certificate in the answer-only stage and leave add-decoys plus every downstream policy fixed. `G1/G2` remain diagnostic screen mechanisms unless a later pre-unblinded design defines and verifies a ladder mapping.

## Measured prompt surface

The zero-call census used one 697-character passage and current production builders. It omitted live diversity history, teacher instructions, saved analysis, target points, and the private grammar final checklist, so values are lower bounds rather than token counts.

| Type | STANDARD lower bound | PREMIUM general-path lower bound | Schema | Largest special layer |
|---|---:|---:|---:|---|
| GRAMMAR_ERROR | 61,784 chars | 54,568 chars | 4,672 chars | target-candidate block 30,093 chars |
| BLANK_INFERENCE | 45,676 chars | 17,087 chars | 2,403 chars | STANDARD full cross-type contract tail |

An additional current grammar probe including the 512-character final-checklist payload, type settings, diversity, spare decoy schema, and representative passages measured 64,578–64,929 STANDARD characters and 57,363–57,714 PREMIUM-general characters. Ablating that payload changes the rendered builder surface by 514 characters because two separator newlines disappear with it. One observed PREMIUM request calibrated 57,714 characters to 25,429 input tokens, or 2.2696 characters/token. That single ratio is used only as a planning estimate, with 1.8–3.0 sensitivity bounds; it is not a tokenizer proof.

## Git history consulted

The important lineage is not a simple “June bad, July good” chronology:

| Commit | Time (KST) | Relevant change |
|---|---|---|
| `f73ce5ee` | 2026-06-17 20:19 | BLANK target-point focus wiring |
| `91f7e91e` | 2026-06-18 16:17 | BLANK reliability overhaul and PREMIUM prompt caching |
| `591cdb41` / merge `1c4aa0f6` | 2026-06-18/19 | ship-first reclassification, partial repair, C pre-gate |
| `2498788e` | 2026-06-19 02:48 | blank-option parallelism prompt nudge |
| `5973144c` | 2026-06-22 23:16 | large snapshot of generation-quality changes |
| `b637feb8` | 2026-06-23 19:04 | grammar quantity point and disputed-usage gates |
| `448488ca` | 2026-07-14 23:33 | grammar overhaul, premium ladder, Gemini 3.1 Pro question-generation switch |

Current local prompt-related files also contain uncommitted post-HEAD changes. Historical DB rows lack a generator commit/deployment/prompt digest, so month or timestamp alone cannot identify which prompt generated a question.

## Prior experiments that constrain this design

- Flash + premium ladder: 73.3% at about KRW 79 versus then-current STANDARD 63–77% at about KRW 36. It is not proposed again.
- Flash diet/w5: about KRW 73, with 6 defects among 10 cases. It is not proposed again.
- Pro alone: 63.3%. Model substitution is not treated as a sufficient mechanism.
- Historical premium grammar `60/60 ok` was independently regraded as F22/C38/A0/B0 across 30 passage clusters and cost $5.144148 over 242 logged physical calls. `ok` was workflow acceptance, not validity or beauty.
- The latest mixed 15-item audit was F11/C4/A0/B0. Confirmed defects included no-answer/multiple-answer grammar, false grammar explanations, blank suffix seam leakage, and weak KILLER distractors.
- Repeated blacklist growth, fixed five-site forcing, resend-all-soft-errors, and blanket short-span rules were tried or rolled back. The new arms therefore separate one deletion, positive compression, and a small structured artifact instead of adding another undifferentiated rule pile.

## Evidence artifacts used

- `experiments/question-quality-20260715/research-note.md`
- `experiments/question-quality-20260715/offline/PROMPT-CONSTRAINT-CENSUS.md`
- `experiments/question-quality-20260715/offline/out/prompt-constraint-census.json`
- `experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json`
- `experiments/question-quality-20260715/reviews/deployment-closure-archive/`
- `docs/grammar-premium-ladder-spec.md`
- `experiments/grammar-quality-20260714/x-strategies.ts`

## Adapter/wire boundary

The research Zod schemas and adapters compile locally, but that does not establish provider JSON-schema compatibility. Execution remains `UNTESTED_NO_GO` until zero-network fixtures pass every plan/profile/stage through the exact provider transform, capture the exact request wire object, bind captured response bytes to the experimental adapter, and replay the current postprocess and validators. Unsupported schema keywords, order changes, unions, or silent schema simplification are blocking defects, not implementation details that may be repaired after holdout freeze.
