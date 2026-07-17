# Frozen grammar source-review protocol

Status: **DORMANT — v1 is blocked by a 36-row supply shortage**

This protocol is fixed before either reviewer opens passage text. It activates only after a successor artifact binds exactly the preregistered 186-row frame without changing the 38-pass target, historical evidence, confidence level, reach threshold, or immutable remainder order. The current 150-row shortage inventory must not be reviewed as though it were an operational frame.

Upon valid activation, Reviewer A and Reviewer B each inspect all 186 rows independently. Sampling, dividing rows between reviewers, replacement, top-up, discussing row outcomes, and reading the other reviewer's private or public artifacts are prohibited until both manifests are frozen.

## Shared row outcomes

- `PASS`: every criterion in the assigned lens passes.
- `EXCLUDE`: a source-internal limitation cannot be repaired by prompt wording without changing the passage.
- `DOMAIN_REVIEW`: plausible design headroom may exist, but a material linguistic, factual, or source-integrity premise requires evidence unavailable to that reviewer. It never counts as pass.

Rights/licensing, current history/exposure, and provider authorization are separate campaign-level holds. Their absence does not become a row-level `DOMAIN_REVIEW`, and no row becomes campaign-eligible through these reviews.

## Reviewer A — source integrity and unambiguous CORE-10 site feasibility

For every row, record fixed ratings for:

1. complete opening, ending, sentence boundaries, encoding, and control-character integrity;
2. coherent referents, connectives, quotations, and paragraph progression without missing external context;
3. at least one source-correct site governed by exactly one CORE-10 family: `a` finite/nonfinite, `b` relative/nominal-clause form, `c` participle voice/form, `d` subject–verb agreement, `e` finite voice, `f` adjective/adverb function, `g` pronoun agreement/case, `h` object-complement form, `i` parallel form, or `k` infinitive/gerund complement;
4. a minimal, natural-looking mutation at that site that becomes unambiguously ungrammatical while the exact source form is the unique correction;
5. a passage-contained dependency window sufficient to reject the strongest alternative parse, with a nonlocal governor/dependent relation feasible for the KILLER arm;
6. no pre-existing grammatical defect, dialect/register ambiguity, optional construction, quotation-language exception, double-object/passive ambiguity, or punctuation artifact that could create zero or multiple valid answers;
7. no need to rewrite, add context, or rely on an unstated domain premise to certify the site.

`PASS` requires all seven. The review certifies feasibility; it does not publish a target span. Exact passages, source identifiers, candidate sites, alternative parses, and row notes remain private.

## Reviewer B — four decoy sites, KILLER craft, and closed-rule explanation headroom

For every row, record fixed ratings for:

1. at least four distinct source-correct non-answer expressions that can remain unchanged as meaningful student-visible decoy sites;
2. each decoy requires a real grammatical decision and has a plausible misconception hook, rather than being filler, a typo check, or an obviously safe lexical item;
3. the four decoys collectively offer structural variety and comparable visual/register difficulty without making the key conspicuous by length, rarity, or formatting;
4. one minimal answer mutation can coexist with those four unchanged decoys while leaving exactly one objectively erroneous marker;
5. the KILLER answer requires a genuine nonlocal dependency or competing parse resolution, not local morphology or memorized collocation alone;
6. a concise closed-rule explanation can name the governor/dependent, state the decisive rule, give the exact correction, and eliminate the strongest alternative parse without hand-waving or encyclopedic prose;
7. both an `INTERMEDIATE` and a `KILLER` item are feasible from the same source interpretation without weakening answer determinacy.

`PASS` requires all seven. A row with plausible grammar design but an unresolved language-variety or specialist-source premise is `DOMAIN_REVIEW`, not pass.

## Independence, outputs, reconciliation, and safety

Each reviewer writes a git-ignored private row file and a public aggregate summary/audit. Public outputs contain no passage text, row ID, content hash, source identifier, candidate site, mutation, or row-level decision. Each reviewer manifest is frozen before reconciliation.

Reconciliation occurs only after both manifests are frozen: any `EXCLUDE` excludes; otherwise any `DOMAIN_REVIEW` defers; only `PASS/PASS` is a dual-lens frame pass. At least 38 such passes are required. Review outcomes cannot trigger replacement or top-up within the frozen frame.

No model/API/network/database call and no full-question generation is permitted during source review.
