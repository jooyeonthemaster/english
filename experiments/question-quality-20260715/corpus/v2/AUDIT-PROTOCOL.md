# Corpus v2 independent semantic audit

## Purpose

The selector proves mechanical separation and prior-use constraints. It does **not** prove that a passage is clean, coherent, factually safe, grammar-rich, or suitable for a central KILLER blank. Every `candidateOnly=true` row remains unusable until two independent reviewers and a fresh adjudicator agree.

Reviewers use only the randomized blind packet. They must not inspect `manifest-public.json`, `private/manifest-private.json`, the sealed map, the other review, or selector feature labels before freezing all decisions.

## Decision order

For each blind passage, decide in this order:

1. `surfaceValid`: complete English prose with intact punctuation and no OCR collision, spelling corruption, deliberate grammar mutation, blank residue, option fragments, question directions, numbering, markup, or unrelated appended text.
2. `coherenceValid`: one passage with a recoverable discourse structure; no merged documents, inserted distractor, missing premise, contradiction caused by corruption, or truncated beginning/end.
3. `domainRisk`: `NONE`, `REVIEW`, or `EXCLUDE`. `REVIEW` is for a clean passage whose central claim needs current medical, legal, political, scientific, cultural, or policy verification. `EXCLUDE` is for a claim already implausible, harmful, or materially misleading.
4. Target suitability:
   - `GENERAL`: usable across ordinary comprehension types; it need not be ideal for grammar or blank.
   - `GRAMMAR_KILLER`: contains at least five defensible, source-correct grammar judgment sites across at least three structural families. Decorative function words, adjacent trivial agreement, spelling mistakes, disputed usage, and semantically odd source wording do not count.
   - `BLANK_KILLER`: supports a central claim/mechanism/contrast/inference span whose removal requires multi-sentence synthesis. A local fact, named entity, number, single synonym, copied phrase, or suffix-constrained slot is insufficient.
5. Freeze `PASS`, `EXCLUDE`, or `DOMAIN_REVIEW`, issue codes, and a passage-specific reason. Do not use source reputation or automatic labels as evidence.

Any failed surface/coherence check forces `EXCLUDE`. A target-suitability failure also forces `EXCLUDE` for that focus panel, even if the prose is otherwise clean. Reviewers may not repair passages.

## Required issue codes

Use one or more precise codes when applicable: `OCR_OR_SPELLING_CORRUPTION`, `PUNCTUATION_CORRUPTION`, `GRAMMAR_ERROR_IN_SOURCE`, `DELIBERATE_ERROR_REMAINS`, `QUESTION_SCAFFOLD_REMAINS`, `ANSWER_OPTIONS_APPENDED`, `BLANK_OR_MARKUP_REMAINS`, `TRUNCATED_SOURCE`, `MERGED_UNRELATED_PASSAGES`, `UNRELATED_SENTENCE_APPENDED`, `LOGIC_CORRUPTION`, `FACTUAL_OR_DOMAIN_RISK`, `GRAMMAR_SITES_INSUFFICIENT`, `GRAMMAR_SITES_DISPUTABLE`, `BLANK_ONLY_LOCAL`, `BLANK_BOUNDARY_RISK`, `CENTRAL_LOGIC_INSUFFICIENT`, or a narrowly named additional code.

## Adjudication and stopping

- Agreement is not automatic truth: the adjudicator spot-checks at least 10% of agreements, all `PASS` rows with any issue code, all focus-panel passes near the threshold, and all disagreements.
- Candidate order is frozen. Fill each required panel from adjudicated passes in original queue order; never cherry-pick after seeing generation results.
- Stop auditing reserves only after the quota plus a preregistered 10% passage reserve is certified. Unreviewed rows stay unusable.
- The blind packet hash and each rater file hash are recorded. No model/API calls or database writes are part of this audit.

