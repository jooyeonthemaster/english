# Invalidation notice

Status: **INVALIDATED_FOR_CERTIFICATION / PRESERVED_FOR_CONTENT_AUDIT**

At 2026-07-15 19:39 KST, reviewer 2's still-blind phase-1 submission exposed a protocol defect. Constructed ordering item `Q005` has two independently defended, grammatical, semantically equivalent full-sentence responses. The reviewer froze both exact alternatives in `private/issued/rater-2/phase1-notes.md` before any reveal.

`phase1SubmissionSchema` can encode `MULTIPLE` only as two or more option labels. A constructed item has no valid labels and the schema permits only one `answerText` for `ANSWER`. Consequently, the submission cannot truthfully represent the reviewer's blind judgment and `reveal.mts seal` correctly rejected it with `ANSWER_LABEL_OUT_OF_SET:Q005`.

No answer is to be coerced to a single response, relabeled, or hidden in a synthetic option label. This packet version must not issue reviewer certificates or final gold. Its sealed reviewer-1 work and reviewer-2 pre-reveal work remain immutable evidence for content remediation only.

Replacement requirements:

1. A versioned phase-1 response schema must represent one or more constructed answer texts and accepted equivalence sets without option-label abuse.
2. Seal, reveal, gold, scoring, and hostile tests must bind those texts and their hashes end to end.
3. Items flagged by the independent reviews for alternative answers, polarity reversal, multiple errors, missing errors, omitted accepted corrections, duplicate equivalents, or explanation-label desynchronization must be replaced or rewritten before a new blind issue.
4. New certification requires a fresh packet instance and fresh independent blind workflow. No author grade distribution may be forced.

This invalidation consumed zero model/API candidates, network calls, database calls, or secrets.
