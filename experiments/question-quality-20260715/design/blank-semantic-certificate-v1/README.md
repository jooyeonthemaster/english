# Blank semantic certificate v1

Status: **DESIGN/MECHANISM ONLY — NO API EXECUTION AUTHORIZATION**

This contract addresses a gap that token and format validators cannot close: an option may be grammatical and passage-themed while silently changing the actor, polarity, condition, causal relation, or scope. It adds a blind solver certificate after all free deterministic gates have passed.

## Separation from the generator

The blind solver receives only the student-facing direction, passage with the source span replaced by a blank, and the five visible options. It does not receive the generated key, source answer span as a separate field, `blankDesign`, `blankBlueprint`, explanation, or wrong-option explanations. A `SOURCE_EXACT` answer can naturally appear among the five student-visible options; the prompt never discloses which option it is or repeats the hidden source span outside those options.

The solver must express the inferred target and all five options using the same evidence-bound role IDs and five closed semantic axes:

1. actor/target;
2. polarity;
3. condition/modality;
4. causal relation/direction;
5. scope/quantifier.

The server, not the solver, recomputes axis differences. It also binds all option text and source evidence to the actual student surface, requires a unique independently solved answer equal to the candidate key, and rejects any defensible competing equivalent reading.

For `KILLER`, each of the four distractors must be a high-overlap one-axis distortion and the four primary axes must be distinct. `INTERMEDIATE` and `BASIC` permit at most two changed axes but still require bounded overlap and axis diversity. These are preregistered mechanism policies, not claims that every passage can support them.

On acceptance, generated explanation prose is discarded. The server renders a concise Korean explanation and four wrong-option notes only from exact evidence and versioned axis copy. On any mismatch, it renders nothing.

## What this does not prove

The contract proves that a submitted certificate is internally and surface consistent. It does **not** prove that the blind solver assigned the semantic roles correctly. The five-axis representation may also miss a meaning distinction outside its closed vocabulary. Production use therefore remains blocked pending:

1. a blind human truth holdout with faithful/actor/polarity/condition/cause/scope minimal pairs;
2. false-accept and false-block estimates by plan, difficulty, passage genre, and answer mode;
3. exact provider-wire/schema compatibility and a source-current callgraph bound;
4. ledger registration as an `evaluation_only` call whose physical fetches and USD count even though it does not create a full-question candidate;
5. comparison of no certificate, one low-cost blind certificate, and any dual-agreement policy on cost per human A/B item;
6. a fail-closed policy that records rejection as an ITT outcome rather than silently regenerating or replacing the passage.

The cost-aware order is deterministic gates first, then at most the explicitly reserved semantic evaluation. This artifact does not authorize an automatic retry, rescue, or regeneration. Any such policy consumes separately reserved candidate and physical-call budgets and must win a preregistered economic comparison.

No model/API/network/DB call was made to build or test this artifact. The campaign counter remains zero.
