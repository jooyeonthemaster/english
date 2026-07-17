# Deterministic Structural Reaudit v9 — Blind Authoring Protocol

## Status and scope

This directory is a pre-inspection, independently authored holdout. It was authored without reading production source, tests, prior v7/v8 cases, results, audits, or any research note. It contains no passage identifier, database identifier, credential, API call, network access, or database access. The authoring script is self-contained and uses only Python's standard library.

The corpus has four independently specified structural families. Each family contains 20 paired contrasts. Every pair contains exactly one `normal` case and one `defect` case, giving 40 cases per family and 160 cases in total.

## Oracle contracts

### F1 — SUMMARY_COMPLETE_MC full-option/key cohesion

An authoritative explanation or stem quotes one complete option surface verbatim. A case is normal exactly when the keyed option label names that quoted option. It is defective when the key names a different option, even if the distractor is semantically related. Partial semantic similarity is irrelevant; the oracle is bound to the complete quoted surface.

### F2 — GRAMMAR_KEY_POINT rendered-label existence

The grammar key point begins with a label reference. A case is normal exactly when that exact label is present in the declared rendered-label inventory. It is defective when the leading reference is absent from the rendered inventory. Raw HTML attributes, comments, tag names, encoded text, Unicode lookalikes, alternate brackets, and alternate list markers do not create the referenced rendered label.

### F3 — SENTENCE_ORDER leading structural labels

Every expected structural label must introduce its own block at the start of a rendered line. A token occurring only mid-sentence, inside a quotation, as a modifier, in inline code, or in lexical/metalinguistic content is not a block delimiter. A normal case has every expected label exactly once in leading-block position. A defective case is missing one leading block even though the missing token appears elsewhere in non-structural context.

### F4 — complete sentence versus dependent fragment

Terminal punctuation alone does not make a complete sentence. The normal member has an independent finite-clause spine (including an interrogative spine or a finite predicate whose subject is an infinitival/fused-relative clause). The defective member lacks an independent finite-clause spine and remains a dependent clause, noun phrase, participial phrase, infinitival phrase, or embedded interrogative despite punctuation, abbreviations, or quotation marks.

## Pair construction rules

1. Pair identifiers are unique and stable.
2. Each pair stays within one family and contains one normal and one defect oracle.
3. Surface literals and topical contexts vary across pairs; no two canonical surface payloads are identical.
4. Each oracle carries a human-readable rationale, structured evidence, and explicit tags.
5. No case is derived from or linked to a production passage, database row, or earlier audit case.

## Verification and sealing

Run `python author_v9_corpus.py --verify-only` from this directory after generation. The verifier checks schema, exact cardinalities, pair symmetry, case/pair uniqueness, canonical surface uniqueness, required rationale/tags, and the family-specific oracle contracts above. It then checks every allowlisted file digest in `PRE_INSPECTION_MANIFEST.json` and the manifest digest recorded in `PRE_INSPECTION_SEAL.sha256`.

The authoring command is `python author_v9_corpus.py --build`. It deterministically rebuilds `cases.json`, verifies it before writing, creates the pre-inspection manifest, writes the seal, and performs a complete post-write verification. It never inspects files outside this directory.

## Handoff boundary

This authoring role stops at corpus generation, self-verification, and pre-inspection sealing. It does not run a production detector, inspect implementation behavior, compare against previous results, or conduct a source-aware audit. Those activities belong to a later, separate evaluator after the seal has been accepted.
