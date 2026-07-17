# v7 summary answer-object remediation

Date: 2026-07-15 KST  
Verdict: **PASS_POST_FIT_REPLAY_ONLY / INDEPENDENT_REAUDIT_REQUIRED**

## Change

`summary-mc-direction-task-mismatch` no longer treats nearby claim/evidence words as proof of a separate content-match task. The validator now resolves the commanded answer object first:

- Korean: inspect the explicit selection command, ignore source-frame objects such as `제시문을 기준으로`, and classify the remaining selected head as a claim/statement or a blank-completion pair.
- English: classify the first answer-object head following the last selection command, so `choose the pair ... statement ...` is not confused with `choose the statement ...`.

This is intentionally a bounded syntactic invariant. It does not claim general semantic parsing.

## Evidence

- Frozen v7 summary family before remediation: 64/96, FN 18, FP 14.
- Current replay of the same immutable 96 cases: **96/96**, FN 0, FP 0.
- Focused unit suite: 9/9 PASS.
- Targeted ESLint: PASS.
- Full `tsc --noEmit`: PASS at freeze time.

The 96/96 result is post-fit because the implementation was informed by v7. It is not an independent holdout and does not promote the global deterministic gate to PASS. A new adversarial corpus must vary particles, word order, omitted objects, nominalized commands, English relative clauses, and source phrases after the object.

## Safety

Model/API calls 0, network calls 0, DB calls 0. Campaign candidate use remains 0/1,000.

