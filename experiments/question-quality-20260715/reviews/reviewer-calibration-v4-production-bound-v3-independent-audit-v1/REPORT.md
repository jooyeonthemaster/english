# Reviewer calibration v3 — fresh independent hostile audit

## Verdict

`FAIL_BLOCKERS`.

The exact sealed subject is `reviewer-calibration-v4-production-bound-v3` at manifest SHA-256 `39f9d4729e9a09c7c4dc9644477bcdbd81c2f09b15b31f6837ea80ee73c59cd6`. The subject remains design-only, empty, unissued, and authority-free. This review does not certify a reviewer, grant evaluator/scoring/result authority, authorize execution, or consume a question-generation candidate.

The v3 author package materially improves the failed v2 design: all 20 event branches compile under JSON Schema 2020-12; exact role/type enums are closed; focus and all-25 arrays are exact; 60 slots and 1,770 fingerprint pairs are declared; the 12-state chain and nonempty deny sets are present; phase 1 cannot structurally encode answer/gold access; and the four-event single-use capability chain is explicit. Those gains are preserved. Six residual blockers still allow the evidence to be fabricated or applied to the wrong actor/resource.

## Independent method

The subject `verify.mjs` was neither imported nor executed. The subject hostile fixture was not opened or parsed. Both were hashed only as opaque manifest members. The audit independently:

- rehashed all 9 direct public upstream bytes and 38 direct manifest rows;
- rehashed all 10 nested evaluation-authority upstream bytes and 23 safe rows of 24 nested manifest rows;
- refused `private/.gitignore` before path resolution or opening;
- compiled the exact schema with Python `jsonschema`'s `Draft202012Validator` and an independent strict RFC3339 checker;
- built one valid independent baseline for each of the 20 one-of branches;
- ran 1,522 fresh structural mutations, all rejected;
- ran 657 semantic/access/state-machine attacks, of which the declared contract rejected 344 and left 313 grouped bypass instances;
- ran 2,179 total deterministic attacks, case digest `59051053e13cad2d2db17c964d1f33f6d54a4d90b6e5afc9dbf9c95a31c0a7a1`.

## Blockers

1. **B1/B2 actor identity aliasing remains unprovable.** Role names reject case/Unicode aliases, but actor exclusions compare only case-sensitive pseudonym strings. There is no stable one-person/one-pseudonym commitment or normalization proof. One person represented as `Actor-Pseudonym-0000` and `actor-pseudonym-0000` can occupy incompatible author/auditor roles.

2. **B3 passed coverage is not bound to a materialized slot.** A pass event has an arbitrary `slotId` and type, but no materialization-event hash and no rule requiring slot existence, eligibility, distinctness, or type/phase equality. Twenty-five distinct pass events can reuse `MC-N-01` and claim every type.

3. **B4 canonical payload hashes have no defined domain.** The general event hash excludes only `eventSha256`; the required candidate/audit canonical-byte digest fields remain inside the bytes they appear to hash. Whole-event computation is self-referential, while arbitrary values also validate. The high-level three-step order is sound, but the claimed exact-byte subproof is not reproducible.

4. **B6 fingerprints are not derived from committed content.** Seven hashes are present, but their normalization and composite formulas are absent. Sixty identical surfaces can be paired with sixty arbitrary unique bundles and pass every declared disjointness/tombstone comparison.

5. **B7 policy rows omit allowed roles.** They constrain state and resource class but not actor role. An allowlisted resource can therefore be authorized to a wrong role; the matrix cannot reject, for example, a packet author reading the trusted-gold audit bundle.

6. **B7 final grant is not bound to nonempty policy state.** `ACTIVATION_GRANT` turns authority and result access on without binding policy, allowlist, deny-set, resource-policy, transition, or policy-readiness evidence. A grant remains structurally valid while `policyRegistry.ready` is false, contradicting the package's own stated grant boundary.

## Required successor

Create a new immutable successor rather than modifying v3. It must bind roles to a unique stable identity commitment, bind every pass event to one exact eligible materialized slot and terminal decision, define versioned deterministic fingerprint derivation, add role allowlists to each policy tuple, bind the final grant to a sealed nonempty result-access policy, and give candidate/audit canonical payload hashes explicit domain-separated field lists. The successor then needs another fresh independent hostile audit; author-side tests cannot promote this failed subject.
