# Deterministic split remediation re-audit v4

## Verdict

**BLOCK — 482/520 passed; 38 deterministic boundary failures remain.**

The blocking rule is strict: one expectation mismatch blocks. The previously defined v3 corpus was rerun first and passed 242/242 on the audited source snapshot. The v4 extension then added 278 independently generated property/metamorphic cases; 240 passed and 38 failed.

This artifact is an independent validator audit. It made no production or existing-test edits and used no model API, browser, network, or database access.

## Audited snapshot

The exact production/test hashes are embedded in `RESULTS.json`. The v4 harness hash is `3e4cddb00bf6ffb868b9512aa6588d55b2eb42dbcd455a5c6d61027f96f98320`; the inherited v3 harness hash is `07dd5df02b085942142a30e6b19a8cd1c97ca1f7f227846e270c0fb1c318f3d8`.

## Design

The extension uses data-driven transformations rather than copies of old literals:

- Summary directions: 16 valid summary-bound controls, 16 English mixed-task variants, and 12 natural Korean mixed-task variants. Objects and clause joiners vary independently.
- Circled explanations: 12 finite option-verdict forms paired with 12 attributive/meta-level judgment forms. Three circled markers per case exercise the fatal threshold.
- Ghost keyPoint labels: 24 Unicode/Markdown/list decorations, each paired with the same decoration after real prose.
- Residual leakage: 18 exact punctuation-preserving positives, 18 one-character/morpheme mutation negatives, and 6 intended normalization equivalences.
- `계사` terminology: 18 standalone or specialist-term positives paired against 20 ordinary-word/calendar compounds.
- Unicode format controls: 65 code points selected by the runtime `\p{Cf}` property, 16 visible-text controls, and one all-property mixture.

## Results

| Family | Cases | Pass | Fail | Error direction |
|---|---:|---:|---:|---|
| inherited v3 corpus | 242 | 242 | 0 | — |
| summary direction | 44 | 19 | 25 | false negatives |
| circled verdict/meta split | 24 | 15 | 9 | false positives |
| ghost-label prefix split | 48 | 46 | 2 | false negatives |
| residual punctuation/morphology | 42 | 42 | 0 | — |
| terminology boundary | 38 | 36 | 2 | false negatives |
| Unicode `Cf` | 82 | 82 | 0 | — |
| **total** | **520** | **482** | **38** | **BLOCK** |

### 1. Summary mixed-task detection — 25 false negatives

All 16 summary-bound controls passed, including grammar wording bound specifically to summary labels `(A)` and `(B)`. Twenty-five clearly independent second tasks escaped the fatal: 15 English and 10 Korean. Missed objects include highlighted clauses/sentences, heading or main idea, unsupported/contradictory content, irrelevant/coherence-breaking sentences, insertion, order, reference, and contextually inappropriate vocabulary. The failures persist across conjunction, semicolon, em dash, slash, parenthesis, and natural Korean clause linkage.

This is not a separator-only gap: the invariant is whether a second task has its own object outside the two summary slots.

### 2. Circled option verdicts — 9 false positives

All 12 attributive/meta-level narrative controls correctly triggered the fatal. Nine equally explicit finite option verdicts were nevertheless mistaken for narrative numbering. Missed terminal predicates include `오답이라고 본다`, `오답으로 보인다`, `오답임이 분명하다`, `오답으로 확정된다`, `오답이라고 결론짓는다`, `오답임이 확실하다`, `부적절하다고 판단한다`, `오답으로 귀결된다`, and `오답이라고 판정한다`.

The safe boundary is syntactic role: a finite terminal verdict about the option is a valid option reference; a judgment expression embedded attributively before a meta noun/action remains narrative.

### 3. Ghost-label decorations — 2 false negatives

All 24 prose-before-label controls passed, so the detector did not become broadly eager. Two genuine leading decorations escaped: zero-width-space plus bullet before `(F)`, and a checkbox emoji carrying a variation selector before `(F)`. Both prefixes contain no prose and should still expose the nonexistent leading label.

### 4. `계사` specialist compounds — 2 false negatives

All 20 ordinary/calendar controls passed, including `관계사`, `회계사`, `세계사`, and `계사년/월/일/시`. Two genuine specialist register terms escaped: `영계사` and `의사계사`. These are the same student-facing register problem as the already recognized prefixed specialist forms, not ordinary lexical compounds.

### 5. Fully passing adversarial boundaries

The punctuation-preserving residual comparator passed all 42 exact/mutation/equivalence cases. The sentence-order empty-paragraph gate passed all 65 runtime-selected `Cf` characters, the 16 visible-text controls, and their combined mixture. These boundaries should be preserved while fixing the four blocked families.

## Reproduction and integrity

Run `node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v4/verify.mjs` from the repository root. The verifier checks frozen counts, failure IDs, zero-use safety counters, artifact hashes, inherited harness/manifest hashes, and audited source/test hashes. It performs semantic replay only when the audited source snapshot has not drifted.

Exact inputs and observations for all 38 failures are in `RESULTS.json`; all generated cases and their oracles are in `audit.mts`.
