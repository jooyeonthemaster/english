# Evaluation authority v2 — independent adversarial audit v1

Verdict: **PASS_NO_BLOCKERS** for the frozen, public-only, design-only authority contract.

This verdict does **not** grant evaluator authority, scoring authority, reviewer or adjudicator authorization, S1 result access, generation, profile selection, or release. The immutable disposition remains `PRE_ACCESS_UNAUTHORIZED`, with 0 authorized reviewers, 0 authorized adjudicators, 0 access events, 0 phase seals, and 0 eligible assignments. A separate immutable execution-evidence package and a fresh independent audit are still required.

## Frozen subject

- `protocol.json`: `149228ef8ce2273f143a8a265c070a69735124d5a140e2e0ca2bca3d88b479fa`
- `public-manifest.json`: `c62fb02e27b0342ce31fe8fc38ec32034738bfe2ddadec9fe2861a1ae8e614bd`
- `MANIFEST.sha256`: `ac4ed7ee8bd5eb21bd45837f2a7396219142e6ccd3a1fe933916238e447f0180`
- exact subject files: 10; manifest rows independently rehashed: 9/9

The audit code did not import or execute the subject builder, verifier, or hostile suite. Those files were only byte-hashed as members of the frozen subject manifest. Protocol semantics, upstream lineage, mutation detection, and access-event counterexamples were independently implemented in this review package.

## Result

- independent semantic and artifact checks: PASS
- adversarial protocol mutations: **127/127 detected**
- concrete access-event scenarios: **12/12**
- pinned upstreams: **10/10 exact bytes**
- upstream public manifest rows independently rehashed: **23/23**
- forbidden declared rows refused without opening: **1**
- prohibited activity: **0**

The single refused row is a `private` path declared by the current-source S1 manifest. The manifest itself is an exact pinned public upstream, but this audit deliberately did not open that row. No private material, trusted or pending gold, answer/reveal payload, environment or secret, database, network, model/API, or budget ledger was accessed.

## Adversarial coverage

The independent mutations covered the old 998+2 allocation and outcome-driven drift; singleton grammar/blank taxonomies; unauthorized scores, ranking, selection, and release; phase skips, reordering, overlap, replay, and post-open changes; all trusted-gold auditor collisions; one-reviewer and nonfresh-adjudicator variants; missing and empty deny sets for each of all nine states; late/backfilled ALLOW events; actor, role, phase, resource, visible-surface, capability, and authorization-hash mismatches; strict authorization/open/close time inequalities; DENY receipts; removal of every required phase seal; S1 packet/result opening before its gates; leakage of each hidden class; removal of each hidden-commitment binding; n=6 ranking claims; missing type-binding v4 subject/audit pins; inherited failed draft/v2 authority; and every permanent false/zero authority boundary.

One proposed counterexample was retained as an explicit negative result: a local state deny set does not repeat every S1 hidden class. That does not create an access path because the contract is conjunctive. All eight classes are content of a separate presealed hidden commitment, and revealing that commitment requires the reviewer's own sealed phase-1 response plus a bound prior ALLOW receipt. The exact phase-1 allowlist is student-visible-only, leakage forces quarantine/revocation/DENY/no-result-access, and every one of the nine states independently retains a nonempty phase-appropriate deny set.

## Independent findings

1. The active allocation is exactly C0=2, S1=180, S2=480, S3=92, S4=144, S5=102, totaling 1,000 with used=0 and no outcome-driven reallocation, replacement, or top-up.
2. Legacy singleton fields are rejected history, not active taxonomy. Grammar uses sealed accepted point-family and correction-equivalence sets; blank uses all seven proposition axes with one or two decisive axes.
3. Calibration order is fresh pilot 12 → fresh disjoint main 24 → independent trusted-gold audit → fresh disjoint one-time holdout 24. State transitions and immutable seals prevent skipping, overlap, retroactive authorization, threshold relaxation, or replay.
4. Activation requires two distinct current reviewers and one fresh adjudicator. The trusted-gold auditor cannot also be packet author, pilot/main/holdout rater, or S1 reviewer/adjudicator.
5. Access receipts bind a prior ALLOW event, actor, role, phase, resource, visible surface, capability, and `authorizedAt < openedAt <= closedAt`. DENY has no open receipt. All nine states have explicit nonempty deny sets, and all 15 phase seals are mandatory.
6. S1 phase 1 exposes only the exact blinded student-visible surface. Plan; model/provider/route; profile/prompt arm; cost/token/usage; answer/key; explanation/key points/wrong-option explanations; author target/grade; and generation metadata are separately precommitted and hidden.
7. A cell of n=6 supports only mechanism, binding, deterministic-safety, yield/cost-envelope, and new-fatal-family screening. It cannot support arm ranking, winner selection, superiority/noninferiority, confidence-based ranking, or release.
8. Production type-binding v4 and its independent `PASS_NO_BLOCKERS` audit are exact pinned upstreams. Neither is treated as evaluator or scoring authority, and failed predecessor drafts are not inherited.

## Reproduction

From the repository root, run twice:

```powershell
node experiments/question-quality-20260715/reviews/evaluation-authority-v2-independent-audit-v1/independent-verify.mjs
```

Both runs must report `PASS_NO_BLOCKERS`, `127/127` mutations, `12/12` access scenarios, 23 rehashed public upstream rows, one refused forbidden declared row, and zero prohibited activity.
