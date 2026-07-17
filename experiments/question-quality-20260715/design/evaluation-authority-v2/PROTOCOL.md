# Evaluation authority v2 protocol

Status: **DESIGN_ONLY_EXECUTION_BLOCKED**. Evaluator authority is false, scoring authority is false, authorized reviewers are 0, and authorized adjudicators are 0.

## Authority boundary

This package binds only the exact public bytes listed in `protocol.json`. It grants no provider call, result access, score, profile selection, or release authority. It never reads a `private/` path, trusted/pending gold, answers, reveals, environment files, a database, network, model/API, or budget ledger.

The old blind-adjudication-power-v1 **998 scheduled + 2 connectivity** allocation is superseded by the exact global registry: C0=2, S1=180, S2=480, S3=92, S4=144, S5=102. Its singleton `pointFamily`, `primaryIntentAxis`, and `divergentAxes` semantics are also superseded. Grammar uses sealed accepted family/correction sets; blank uses all seven proposition axes with one or two decisive axes. The predecessor grants no scoring authority.

## Required order

1. Start at `PRE_ACCESS_UNAUTHORIZED`.
2. Run a fresh 12-item taxonomy pilot and seal packet, responses, access events, and decision.
3. Run a fresh disjoint 24-item main certification and seal every blind/reveal phase.
4. Obtain a fresh independent trusted-gold audit pass and seal its access events and report.
5. Run a fresh disjoint one-time 24-item activation holdout.
6. Bind two distinct current reviewer certificates and one fresh incompatible-role adjudicator in a separate independently audited activation artifact.

Every state has a nonempty phase-appropriate deny set. Every allowed and denied access is append-only, ordinally chained, and SHA-256 sealed. An open requires a prior ALLOW authorization and capability token; its receipt binds the authorization, actor, role, phase, resource, visible surface, and capability with `authorizedAt < openedAt <= closedAt`. A DENY has no open receipt. Retroactive insertion, skips, reordering, post-open threshold changes, retroactive passes, and failed-item replay are forbidden.

The trusted-gold auditor is incompatible with the taxonomy-pilot, main-certification, and activation-holdout rater roles, as well as packet authoring and S1 review/adjudication. This preserves audit independence and holdout blindness.

## S1 boundary

The exact current S1 plan has 180 assignments: grammar 96 and blank 84, Standard 96 and Premium 84, Intermediate 90 and Killer 90. A cell size of six is only a mechanism, binding, deterministic-safety, yield, cost-envelope, and new-fatal-family screen. It cannot rank arms, select a winner, support superiority/noninferiority, or support release.

The complete S1 blind packet and a separate hidden commitment must be sealed before any result is accessed. Phase 1 exposes only the student-visible question surface plus blinded ID, order, and relabel surface. It hides plan; model/provider/route; profile/prompt arm; cost/token/usage; stored answer/key; explanation, key points, and wrong-option explanations; author target/grade; and generation metadata. The hidden commitment binds those fields but its content is not phase-1 visible. Until evaluator authority, two reviewer certificates, one fresh adjudicator, the S1 packet seal, and immutable per-access allow events all pass, item/aggregate scores, profile selection, and release claims are forbidden.

## Current disposition

This immutable design snapshot remains pre-access with zero access events, zero phase seals, zero authorized people, and zero eligible S1 assignments. Execution evidence must live in a new artifact; this package is never edited into an authorization.
