# Deterministic Structural Holdout v10 — Frozen Oracle Protocol

Set ID: `deterministic-structural-reaudit-v10`  
Oracle version: `v10.1`  
Classification vocabulary: exactly `DEFECT` or `NORMAL`.

## Blind adjudication boundary

Judge one case at a time from that case's `fixture` only. Do not consult production code, tests, repositories, prior audit/remediation material, research notes, generated question records, network services, APIs, databases, or secrets. Pair membership, expected labels, rationales, and other cases are not evidence for the case being judged.

A case is `DEFECT` exactly when its family rule below says so. Otherwise it is `NORMAL`. Typography is interpreted literally at Unicode code-point level unless a family rule explicitly says otherwise. No HTML/entity decoding, Unicode normalization, case folding, bracket substitution, or confusable-character folding is allowed.

## Family 1 — SUMMARY_COMPLETE_MC

The visible options are `fixture.options`; `key` is the stored option key and `text` is the entire visible option. The summary carrier is `fixture.carrier`.

1. A carrier with `authority: AUTHORITATIVE` and `kind` equal to `final`, `required`, or `completed` is authoritative.
2. Its `quotedText` must exactly equal the entire `text` of exactly one visible option. That unique option is the quoted option.
3. If an authoritative carrier's quoted option key differs from `storedKey`, classify `DEFECT`.
4. If those keys match, classify `NORMAL`.
5. A carrier with `authority: NON_AUTHORITATIVE` is comparison/negation context. Its mention does not define the answer; a mismatching stored key is therefore `NORMAL` for this family.

The quote glyph and surrounding punctuation do not change the rule. The fixture explicitly supplies `quotedText` so ornamental punctuation is never mistaken for part of the option.

## Family 2 — GRAMMAR_ERROR_LEADING_LABEL

`renderedLabelInventory.state` is `present`, `empty`, or `absent`. Both `empty` and `absent` provide zero rendered labels. `leadingReference` records whether the key point explicitly starts with a student-visible label reference.

1. Only a reference with both `explicit: true` and `atStart: true` invokes this rule.
2. That leading token is legitimate only when `leadingReference.token` is code-point-for-code-point identical to one member of `renderedLabelInventory.labels`.
3. A leading reference with no literal match is `DEFECT`. This includes absent/empty inventories, encoded entities, different brackets, normalization variants, case variants, inserted spaces or invisible characters, and Unicode confusables.
4. A literal match is `NORMAL`.
5. A prose occurrence recorded with `atStart: false` is not a leading label reference and is `NORMAL` under this family, even when the inventory is absent or empty.

Delimiter punctuation following a literal label is prose, not part of the token, unless it is included inside the inventory string itself.

## Family 3 — SENTENCE_ORDER_COMPLETE_UNITS

Every member of `fixture.paragraphs` must be a complete independent sentence unit. A complete unit contains an independent finite clause (including a fully formed independent question) and can stand without a missing matrix clause or omitted predicate.

Classify `DEFECT` if any unit lacks an independent finite clause. Dependent-clause remnants, nonfinite phrases, nominal phrases, passive participial remnants, and interrogative remnants stay defective when wrapped in quotation marks or followed by a period, question mark, colon, semicolon, or dash. Classify `NORMAL` only when every unit is independently complete. The authored `unitAnalysis` records this binary syntactic judgment for deterministic verification.

## Family 4 — SENTENCE_ORDER_STANDALONE_LABELS

Structural labels are only `labelNode` values in `fixture.entries`; label-like text inside `paragraph` or `incidentalMentions` is incidental.

A normal fixture has exactly three entries in order. Their `labelNode` values are exactly `(A)`, `(B)`, `(C)`, and every `placement` is exactly `standalone`. Any alternative structural label system, missing/extra/duplicate label, mixed system, attached punctuation, Unicode lookalike, or inline prefix is `DEFECT`. Quoted or incidental mentions do not count as structural labels and do not make an otherwise exact fixture defective.

## Pairing and tie handling

Each `pairId` contains one `DEFECT` and one `NORMAL` case in the same family. Pairs are contrast controls, not a license to infer one member from the other. The rules are exhaustive for these fixtures; there is no ambiguous or third outcome. If a consumer cannot reproduce a unique outcome, the consumer must report a protocol failure rather than alter the sealed oracle.
