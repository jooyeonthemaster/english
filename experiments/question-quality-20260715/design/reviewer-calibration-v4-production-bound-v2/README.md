# Reviewer calibration v4 — production-bound v2

This is a permanent **DESIGN_ONLY / UNISSUED / EXECUTION_BLOCKED** empty-slot contract. It defines how reviewer calibration may later be executed, but it contains no question item, answer, trusted or pending gold, reveal, actor identity, capability, access event, response, score, certificate, adjudicator authorization, or activation event.

Current authority is exactly zero:

- evaluator and scoring authority: `false`
- execution and generation authorization: `false`
- authorized reviewers and adjudicators: `0`
- filled or eligible slots: `0`
- access and phase-seal events: `0`
- reviewer certificates and activation events: `0`

## Bound authority chain

The contract pins the evaluation-authority v2 public manifest (`c62fb02e…`) and its independent audit manifest (`0cdf9d67…`), plus production-type-binding v4 subject manifest (`715818a8…`), subject snapshot (`d126aa31…`), and independent audit manifest (`796adc11…`). Reviewer-calibration v3 replacement is used only for methodology, construct definitions, thresholds, and fail-closed scoring principles. It cannot supply production type IDs, execution authority, reviewer certificates, actors, items, answers, or gold.

The old production-bound v1 draft and production-type-binding v1/v2 are explicitly superseded and have no authority. Binding v4 is the sole current source for the exact 25 UI types, two focus types, 23 nonfocus types, eight families, and rotation.

## Future sequence only

1. Fresh 12-item taxonomy pilot: grammar 4, blank 4, nonfocus 4.
2. Fresh disjoint 24-item main certification: grammar 8, blank 8, nonfocus 8.
3. Fresh independent trusted-gold audit after the main decision is sealed.
4. Fresh disjoint one-time 24-item activation holdout: grammar 8, blank 8, nonfocus 8.
5. A separate immutable activation event, followed by a separate independent `PASS_NO_BLOCKERS` audit.

Activation requires two distinct current reviewer certificates and one fresh adjudicator. The trusted-gold auditor cannot also be any packet author, pilot/main/holdout rater, S1 reviewer/adjudicator, or S1 result custodian. This design never performs those assignments or transitions.

## Access and leakage boundary

Every future read, including the blinded surface, requires a prior append-only sealed `ALLOW` authorization and a single-use capability. Authorization and close receipt must bind the same actor, role, phase, resource, visible surface, capability, and deny set, with `authorizedAt < openedAt <= closedAt`. A `DENY` has no open receipt. Late or retroactive authorization, chain insertion, rewrite, and deletion are forbidden.

Phase 1 permits only the blinded student-visible surface and frozen public codebook. Item identity/source, answer, trusted gold, explanation/scoring evidence, author hypothesis, rejection history, other-rater records, adjudication drafts, type/rotation identity, and generation metadata stay in separate presealed commitments. Rejection history is never visible to raters. Leakage quarantines actor and packet, revokes the capability, records a DENY, and grants no score or certificate.

## Rotation boundary

At epoch 1, main and holdout each contact one different type per nonfocus family, for 16 distinct types. Across two epochs they contact all 23 nonfocus types; main-only requires four epochs. **Contact is not certification.** Each canonical type needs its own fresh passed main or activation-holdout coverage event. Pilot rows never count as coverage, and failures never advance or skip rotation.

## Verification

From the repository root:

```powershell
node experiments/question-quality-20260715/design/reviewer-calibration-v4-production-bound-v2/verify.mjs
```

The verifier independently rehashes every exact upstream and safe public manifest row, reconstructs binding-v4 rotation, checks the empty registries and schemas, rejects 183 hostile mutations, and exercises 12 access-order/binding counterexamples. It refuses forbidden paths and performs no network, API, model, database, environment, private-result, or ledger operation.

