# Reviewer calibration v4 production-bound v2 protocol

Status: **DESIGN_ONLY_UNISSUED_EXECUTION_BLOCKED**. This snapshot is immutable in meaning and never becomes an activation artifact.

## 1. Normative sources

Evaluation-authority v2 supplies the fail-closed sequence, access provenance, hidden-commitment, and zero-current-authority boundary. Its public subject and independent audit are exact byte pins. Production-type-binding v4 and its independent audit supply the only current production type/family/rotation universe. Reviewer-calibration v3 replacement supplies methodology only and grants no certificate, score, actor, execution, or production-type authority.

Any missing byte, audit verdict drift, snapshot drift, source conflict, alias inference, or legacy v1/v2 binding use fails closed. Production-bound v1 is a superseded unmanifested draft; it cannot be executed or used to fill a slot.

## 2. Immutable empty slots

`registries.json` defines 60 future slots without any payload:

- taxonomy pilot: `TP-G-01..04`, `TP-B-01..04`, `TP-N-01..04`;
- main certification: eight grammar, eight blank, and eight nonfocus slots;
- activation holdout: eight grammar, eight blank, and eight nonfocus slots.

Every payload and commitment field is null, every operational registry is empty, and every eligibility or issuance flag is false. Materializing one future slot requires a new append-only event that binds its phase/block/ordinal, current binding-v4 type/family/epoch, item identity/source, visible surface, answer, trusted gold/accepted constraints, explanation evidence, author hypothesis, rejection history, packet order/relabel map, and rights/PII pass. No in-place repair or backfill of an opened packet is permitted.

## 3. Exact order and evidence

The only allowed order is fresh pilot 12 → fresh disjoint main 24 → independent trusted-gold audit → fresh disjoint one-time holdout 24 → separate audited activation event. Phase overlap, skipping, reorder, retroactive pass, post-open taxonomy or threshold changes, failed-item replay, and replacement/backfill are prohibited.

All 19 seals listed in `protocol.json` are conjunctive. No downstream phase opens until the prior decision and access evidence are sealed. The trusted-gold audit has no new items and cannot grant scoring authority by itself.

## 4. Roles

Future activation requires exactly two distinct current certification reviewers, one fresh adjudicator, one independent trusted-gold auditor, and one independent activation auditor. Actor identities must first appear as salted pseudonyms in an immutable registry. No role is assigned here.

The trusted-gold auditor is incompatible with every packet author, pilot/main/holdout rater, S1 reviewer, S1 adjudicator, and S1 result custodian. The fresh adjudicator must be distinct from all packet/item authors, both reviewers, the trusted-gold auditor, any prior S1 result viewer, and the independent activation auditor.

## 5. Capability and receipt protocol

An authorization event is sealed before a resource is opened. It binds actor pseudonym, role, phase, resource hash, visible-surface hash, single-use capability hash, and current deny-set hash. The close receipt must bind the prior ALLOW event and the exact same fields. Authorization must precede the receipt in the hash chain and satisfy `authorizedAt < openedAt <= closedAt`.

A denied attempt is append-only evidence with null authorization/open/close fields and no receipt. Capabilities expire at phase close and cannot be reused. Missing, late, or backfilled authorization is a denial, never a ledger repair.

## 6. Blindness and hidden commitments

Even the student-visible surface requires a capability. Phase 1 exposes only that blinded surface and a frozen public codebook. The following remain separately presealed and hidden: item identity/source; answer; trusted gold and accepted constraints; explanation/fatal/craft evidence; author hypothesis/target; rejection and surplus history; other-rater records; adjudication draft; type/family/epoch; and model/provider/route/profile/prompt/cost/usage/generation metadata.

Hidden reveal requires the rater's own phase-1 response seal and a new bound capability. Rejection history is never shown to raters. Any leak quarantines the actor and packet, revokes the capability, records a DENY, and prevents score, certificate, and activation.

## 7. Type binding and claims

The exact UI universe is 25 IDs: two focus and 23 nonfocus IDs arranged in the eight binding-v4 families. Main selects `(epoch - 1) mod familySize`; holdout selects `(epoch - 1 + ceil(familySize / 2)) mod familySize`. The same function must produce both schedule rows and coverage evidence. Main and holdout differ within every family/epoch, failure does not advance rotation, and outcome-aware substitution is forbidden.

One epoch contacts 16 distinct nonfocus types; two combined epochs contact 23; four main-only epochs contact 23. Contact is never certification. Every type-specific claim requires a fresh passed coverage event for that exact canonical type.

## 8. Activation boundary

This package contains no activation event. A future event must live in a separate immutable package and bind this design manifest, both evaluation-authority pins, all production-type-binding v4 pins, role/incompatibility proof, every phase/access seal, exactly two distinct reviewer certificates, one fresh adjudicator, and zero pre-authority violations. That event itself requires a separate independent `PASS_NO_BLOCKERS` audit.

Until then every authority, score, certificate, result access, profile selection, generation, and release claim remains `NONE` or `false`, and every operational count remains zero.
