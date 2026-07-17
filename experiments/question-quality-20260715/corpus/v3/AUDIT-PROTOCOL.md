# Corpus v3 blind-audit protocol

The candidate queue is not a generation corpus. No row becomes usable merely
because it passed deterministic linting or appeared in a packet.

## Blinding and independence

- Each reviewer receives the same frozen order and sees only `blindId` plus the
  passage.
- Source, repository/DB origin, split, intended target, queue position, and all
  academy/passage identifiers remain sealed.
- Both reviewers evaluate every passage on surface integrity, discourse
  coherence, domain integrity, grammar suitability, and blank suitability.
- Reviewers must attest that they did not see the sealed map or one another's
  decisions. Reviewer identities must be distinct.

## Decisions

- Agreement on PASS or FAIL is final at the independent-review stage.
- Every disagreement requires a named adjudicator, a PASS/FAIL decision, and a
  nonempty rationale after both reviews are frozen.
- A missing review, PENDING value, missing attestation, or unresolved
  disagreement makes the item unusable.
- Audit order is immutable. For each panel, PASS rows are consumed in
  `queueSequence` order until the preregistered target is reached. Later reserve
  rows remain unused; they cannot inflate the certified sample.

## Target-specific adjudication (after unsealing)

- Grammar killer: source integrity is necessary but not sufficient; retain only
  passages with multiple independently testable grammatical relations and no
  forced or dubious correction point.
- Blank killer: the source-document `originalType` must itself be blank
  inference, confidence must be high, and `reconstructionKind` must be exactly
  `blank`. A blank-looking tag or heuristic alone is a hard failure.
- General panels: maintain exact origin/split targets and final length/discourse
  constraints. `reviewedAt` is descriptive metadata, never an automatic DB
  eligibility requirement.

## Certification

Certification requires G=66, B=66, and exactly DB33+repo33 in each general
split after retained rows are included. Exact/near collisions with past,
retained, focus, dev, or holdout material invalidate certification. The final
verifier must pass both pinned reconstruction and live-staleness checks.
