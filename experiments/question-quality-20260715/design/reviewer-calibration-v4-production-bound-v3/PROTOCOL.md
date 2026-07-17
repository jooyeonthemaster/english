# Production-bound reviewer calibration protocol v3

## Status and authority boundary

This artifact is design-only, unissued, and blocked pending a fresh independent audit. It is the author-side successor requested by the v2 independent audit; it does not overwrite, reinterpret, or promote v2. The exact v2 subject manifest and exact v2 `FAIL_BLOCKERS` audit manifest are direct upstreams.

No event instance is present. Actor assignments, materialized slots, fingerprint reservations, access transactions, passed-coverage events, certificates, activation candidates, candidate audits, grants, and result accesses are all zero. The future `ACTIVATION_GRANT` schema describes what a separate execution package would have to prove; its existence here is not a grant.

## B1-B8 closure matrix

| Blocker | Material closure in v3 | Fail-closed evidence |
|---|---|---|
| B1 trusted-gold self-audit | `PACKET_AUTHOR`, `ITEM_AUTHOR`, and `GOLD_AUTHOR` are distinct explicit roles. Artifact classes map to exact author roles. The trusted-gold auditor is incompatible with every other role and must bind role- and artifact-authorship-exclusion proofs plus packet/item/gold author registries. | Role registry is empty; audit report instances are zero; hostile role and authorship collisions are rejected. |
| B2 activation self-review | The independent activation auditor is incompatible with all authors, reviewers, the trusted-gold auditor, adjudicators, custodian, result viewer, candidate author, and grant author. The audit event binds the exact candidate event/bytes plus role and artifact-authorship exclusions. | Candidate, audit, and grant counts are zero. Synthetic self-review collisions are rejected. |
| B3 scope escalation | Certificates and candidates bind `FOCUS_ONLY` or `ALL_25`, the exact ordered type IDs, exact count, a unique passed-event hash per canonical type, and the coverage-map root. Each hash must resolve to a matching passed event from main or holdout. Epoch-1 contact with 16 nonfocus types cannot satisfy `ALL_25`. | Focus requires exactly grammar and blank; all-types requires all 25. Wider or mixed candidate scope is forbidden. |
| B4 circular activation | The chain is candidate with authority/result access false, then an independent audit of the exact preexisting candidate with authority/result access false, then a separate final grant that binds the already sealed PASS audit report and its later package manifest. Neither candidate nor audit report may embed a future audit-package manifest hash. | Pre-grant result access is forbidden; state skips and future-hash injections are rejected. |
| B5 incomplete slot evidence | Slot materialization requires the item/source, visible surface, answer key, trusted gold, explanation/fatal/craft evidence, author hypothesis/target, rejection history, surplus history, packet order/relabel, rights/PII, normalized fingerprint bundle, and exact type-family-rotation proof commitments. | Alias types, unknown/wrong families, wrong epoch rotation, missing commitments, or late fingerprint reservations are rejected. |
| B6 replay and overlap | Every slot reserves seven normalized fingerprint components before materialization. The 12/24/24 phases require 60 unique composites, a 1,770-pair proof, component roots, and permanent failed/rejected/previously-issued tombstones. | Cross-phase duplicates and every tombstone replay class are rejected. |
| B7 opaque access authorization | Authorization and denial events bind the exact current state, phase, resource class, resource hash, actor, policy digest, phase-state allowlist digest, state deny-set digest, resource-policy proof, and transition evidence. Phase-1 schemas encode only blind visible surface or frozen public codebook. | Empty policy registries are valid only while the design is unissued. They cannot authorize access or support a grant. Post-activation deny remains nonempty and excludes out-of-scope results, identities, raw hidden commitments, rejection/surplus history, and raw private gold. |
| B8 pre-open/replay access | Access is four immediately consecutive append-only events: `AUTHORIZATION -> OPEN -> CAPABILITY_CONSUME -> CLOSE`. Every event binds the prior hash; timestamps bind event times; content cannot be released before OPEN and CONSUME are sealed; capability hashes are globally unique and single-use with `useOrdinal = 1`. | Missing, reordered, gapped, backdated, replayed, or mismatched events are rejected. |

## Exact sequence and state chain

The future item sequence is fixed at 12 taxonomy-pilot items, 24 main-certification items, an independent trusted-gold audit, and a one-time 24-item activation holdout. There are 60 future slots and zero filled slots. Pilot contact never grants coverage credit.

The state chain has 12 exact states and 11 one-step transitions. Authority and result access remain false through `ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE`. Only a later `ACTIVATION_GRANT`, in a separate execution artifact, may move to `ACTIVATION_GRANTED`, and even then result access is exact-scope only.

## Exact type and rotation binding

The 25 UI type IDs, two focus IDs, 23 nonfocus IDs, eight families, and main/holdout rotation are copied from the accepted production type-binding v4 bytes. The binding manifest, binding JSON, canonical snapshot, and independent audit manifest are all exact SHA-256 upstreams. Methodology v3 is retained only as methodology and grants no type, execution, certificate, actor, item, or gold authority.

Focus certification uses the exact gate order `GRAMMAR_ERROR`, `BLANK_INFERENCE`. The production binding's canonical focus order remains `BLANK_INFERENCE`, `GRAMMAR_ERROR`; the sets are identical and the distinct order is explicit rather than accidental. `ALL_25` uses the exact UI order.

## Public-only verification boundary

The verifier may read only this public package, the nine exact direct public upstreams, and safe rows of their public manifests. It rehashes 38 direct manifest rows and the safe nested evaluation-authority closure. A nested `private/.gitignore` row is counted and refused before path resolution or file opening.

The hostile verifier checks the actual protocol objects, registry state, schema required fields/constants/enums/conditionals, and executable semantic decisions. It does not count prose occurrences as closure. In particular, a synthetic access or grant fixture cannot pass with an empty policy digest, allowlist, deny set, resource-policy proof, or state-transition proof.

## Noncircular audit handoff

After this package is sealed, a fresh auditor must work from the immutable bytes and write to a separate review directory. A valid independent result must identify this package's `MANIFEST.sha256`, recompute all safe bytes independently, avoid importing this verifier as authority, and issue either blockers or `PASS_NO_BLOCKERS`. Until such an artifact exists, this package's only admissible disposition is author evidence complete and independent audit pending.
