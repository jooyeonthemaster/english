# Student-facing explanation concision audit v1

## Verdict

**FAIL — explanation correctness is the primary defect; verbosity is a separate structural amplifier.** The latest 15-item dump averages 383.5 characters in the main explanation and 876.1 characters across main explanation, four wrong-option explanations and three key points. Fresh full-item review classifies 9/15 as factually invalid, 2/15 as accurate but redundant, 1/15 as long but necessary, and 3/15 as concise-sufficient. The sealed independent V4 result independently agrees on the same 9 factual-invalid items.

The eight rows after the Vercel boundary are only two distinct passages. They average 380.8 main characters and 847.9 total student-facing characters; 5/8 have sealed V4 failures. This is a serious small-window signal, **not a current prevalence estimate**: the dump crosses a dirty deployment, Trigger parity is unknown, and the worktree contains later uncommitted fixes.

The historical premium grammar 60 is the decisive counterexample to a length-only solution. Its main explanations are already short (mean 212.6, median 205.5, range 102–327; zero above 450), yet 11/60 fail sealed V4 and 22/60 are fatal overall. The 60 rows are two runs over 30 passages, not 60 independent observations.

## Quantitative findings

| Cohort | Rows / passage clusters | Main chars mean / median | Total student-facing chars mean / median | Main >450 | Sealed V4 fail |
|---|---:|---:|---:|---:|---:|
| Latest 15, mixed boundary | 15 / 5 | 383.5 / 336 | 876.1 / 856 | 3 | 9 |
| Latest post-deploy window | 8 / 2 | 380.8 / 335 | 847.9 / 807.5 | 2 | 5 |
| Historical premium grammar | 60 / 30 | 212.6 / 205.5 | 593.2 / 584.5 | 0 | 11 |
| Manually reviewed premium stratum | 18 / 9 | 225.1 / 228.5 | 611.3 / 617 | 0 | 11 |

Every latest item carries four separate wrong-option explanations (mean combined 352.8 characters) and three key points (mean combined 139.7). The latest manual review found repeated premise/key restatement in 4/15, procedural/meta filler in 4/15, unsupported or false terminology in 6/15, decisive evidence omitted in 5/15, and a visible label/key namespace mismatch in 1/15. Lexical heuristics under-detected these judgments; they remain screening tools, not semantic validators.

The most damaging post-boundary examples are not merely wordy:

- Q011 states a false absolute that a following object forces active voice and calls the predicate `비인칭`; retained-object passives such as `be permitted something` are licensed.
- Q012 misanalyzes complementizer `that` as a relative pronoun and assigns another slot the wrong syntactic relation.
- Q014 ignores a defensible reduced-passive parse and gives an antecedent analysis incompatible with plural `help`.
- Q010 rejects `imbalance` without confronting the displayed `not ... natural balance`, while its marker/explanation namespaces diverge.
- Q001 gives a wrong-option antecedent analysis incompatible with plural agreement.

## Why the current contract produces repetition

The current worktree contains useful new gates for retained-object passives, complementizer `that`, factual terminology and grammar-only explanation repair. Those fixes postdate the historical rows and must not be evaluated as if they generated them.

The active output contract still pulls in opposing directions:

- the blank schema asks the main explanation to cover every wrong-option trap while `wrongOptionExplanations` separately requires all four wrong options;
- the common prompt asks for 3–5 main sentences and exactly three key points even when the proof is one local rule;
- grammar schema/prompt says 200–450 characters, but the actual hard gate is only above 650 and the soft gate above 500;
- a generic KILLER warning penalizes explanations below 80 characters, even though several accurate historical grammar explanations are near 100–180;
- explanation-only repair is grammar-only and reuses the full question response schema rather than a narrow explanation envelope.

Thus minimum-length pressure and duplicate coverage create filler, while maximum length does not guarantee accuracy. The correct model is two axes: **validity first, concision second**.

## Minimal deterministic contract recommended

Do not add a global prose minimum. Require evidence components and use type-aware hard ceilings:

1. `explanation` proves the answer only. It must not repeat all wrong-option verdicts. Required shape is `decisive evidence/structure → verdict → correction or answer inference`; one optional trap sentence is allowed.
2. Suggested initial ceilings, to be calibrated rather than assumed: single-answer GRAMMAR_ERROR 360 characters; BLANK BASIC/INTERMEDIATE 320 and KILLER 420; GRAMMAR_CHOICE_COMBO 160 per slot and 480 total; other single-answer MC 360. Multi-answer grammar gets 140 characters per answer plus 100 shared, capped at 600.
3. `wrongOptionExplanations` remains exact-label complete, one sentence each, hard maximum 180 characters; it alone owns option-by-option rejection.
4. `keyPoints` remains three only where the product truly needs three. Each must be a short label/evidence anchor, at most 60 characters, and must not repeat a sentence from the main explanation.
5. Hard factual gates precede length checks: answer/wrong-label parity, displayed-surface-first grammar explanation, known category contradictions, complementizer/relative distinction, retained-object passive ambiguity, antecedent-number compatibility, and visible-source contradiction.

These bounds would have flagged the latest 518/614-character blank explanations and 569-character combo without rejecting the manually judged 410-character long-but-necessary blank. They would not have caught the 11 short premium V4 failures; those require the factual gates. Any production threshold therefore needs a new held-out calibration packet before being a release gate.

## Conditional explanation-only repair

No unconditional call is justified. Trigger at most one narrow repair only when the question body has passed all non-explanation validity checks and at least one hard explanation code fires. Return only `{explanation, wrongOptionExplanations, keyPoints}` under a micro-schema; bind it to hashes of passage, displayed item, options and answer; reject the merge if those hashes change.

Before the call, deterministic normalization may remove exact duplicate sentences and stale answer-label entries. The repair prompt must carry the exact failed fields, required evidence anchors, visible labels and forbidden false claims. Re-run factual, label, evidence-preservation and length gates after merge. A second failure is terminal for that candidate; do not recursively regenerate.

False-positive risks are highest for multi-answer grammar, combination items, sentence-order evidence chains, quoted English punctuation, legitimate specialist terminology in teacher-only text, and intentional short key-point summaries. That is why ceilings are type-aware, semantic regexes are never sufficient alone, and the repair is conditional.

## Reproducibility and limits

`audit.mjs --write` regenerates `audit-data.json` and `source-hashes.json`; `verify.mjs` checks regeneration, invariants and every manifest hash. All inspected inputs and current production sources have byte counts and SHA-256 hashes. This audit made zero network, model, API, database and secret calls.

The latest dump is heavily KILLER-skewed, contains five passages, and crosses deployment state. Historical premium rows repeat 30 passages. The audit therefore supports defect-family and contract conclusions, not population prevalence or causal before/after claims.
