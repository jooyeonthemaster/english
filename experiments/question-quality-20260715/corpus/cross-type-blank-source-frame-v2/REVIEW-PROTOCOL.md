# Frozen review protocol

This protocol is fixed before either reviewer opens passage text. Both reviewers inspect all 157 rows; sampling, delegation between the two lenses, replacement, top-up, and reading the other reviewer's artifacts are prohibited.

## Shared row outcomes

- `PASS`: every criterion in the assigned lens passes.
- `EXCLUDE`: a source-internal limitation cannot be repaired by prompt wording without changing the passage.
- `DOMAIN_REVIEW`: design headroom may exist, but a material factual or source-integrity premise requires evidence unavailable to the reviewer. This never counts as pass.

Rights/licensing is a separate campaign-level review. Its absence does not become a row-level `DOMAIN_REVIEW`, and no row becomes campaign-eligible through these reviews.

## Reviewer A — source integrity and inference-target feasibility

For every row, record fixed ratings for:

1. complete opening, ending, and sentence boundaries;
2. encoding/OCR/control-character integrity;
3. coherent pronoun, connective, and paragraph progression without missing external context;
4. at least one central semantic unit that can be blanked without rewriting the source;
5. at least two distributed evidence locations that determine that unit's full meaning;
6. no purely connector-only, local-definition-only, dialogue-container, or multi-question-container target;
7. no collision with the supplied frozen history and strict-blank-v1 hashes.

`PASS` requires all seven. The review records feasibility, not a visible target span, in the public artifact. Exact passages, identifiers, candidate spans, and row notes remain private.

## Reviewer B — paired item-design and KILLER headroom

For every row, record fixed ratings for:

1. unique answer determinacy from the unchanged passage;
2. feasible paired `INTERMEDIATE` and `KILLER` items without choosing different source interpretations;
3. KILLER inference requiring at least two linked clues rather than a local synonym;
4. four plausible, same-slot distractors grounded in passage concepts;
5. at least four usable misconception axes among actor/target, polarity, condition/modality, causal relation/direction, scope/quantifier, stance, timing, and half-true relation;
6. no surface-only giveaway from length, register, polarity, or copied wording;
7. factual premise clear enough for an English item reviewer, otherwise `DOMAIN_REVIEW`.

`PASS` requires high answer determinacy, at least medium paired-arm feasibility, and no low rating on target centrality, evidence synthesis, or option headroom.

## Independence, outputs, and safety

Each reviewer writes a git-ignored private row file and a public aggregate summary/audit. Public outputs contain no passage, frame ID, content hash, private identifier, candidate span, or row-level decision. Each manifest is frozen before reconciliation. No model/API/network/DB call and no full-question generation is permitted.

Reconciliation occurs only after both manifests are frozen: any `EXCLUDE` excludes; otherwise any `DOMAIN_REVIEW` defers; only `PASS/PASS` is a dual-lens frame pass. Even then, campaign authorization remains zero pending split balance, current history, rights handling, provider controls, and the sealed generation queue.
