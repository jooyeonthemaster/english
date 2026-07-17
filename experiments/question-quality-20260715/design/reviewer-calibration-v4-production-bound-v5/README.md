# Reviewer calibration v4 production-bound v5

This directory is the immutable public-only successor to
`reviewer-calibration-v4-production-bound-v4`. The v4 subject and its independent
v2 audit remain unchanged. That audit's seven blockers are pinned as negative
requirements. This v5 package is author evidence only and grants no execution,
certificate, scoring, result-access, calibration, C0, S1, or generation authority.

## What v5 closes

1. Identity sealing revalidates the complete source/principal/pseudonym bijection,
   dereferences and cryptographically verifies every raw Ed25519 custodian
   attestation, and binds role assignments to the exact sealed principal, alias,
   raw attestation, and registry root.
2. Ed25519 signatures accept only the one canonical Base64 representation:
   strict alphabet and padding, exact 64-byte decode, and decode/re-encode equality.
3. Authorization and denial rebuild immutable policy tuples and roots only from
   canonical source rows. Caller-mutated derived tuples or roots are never used.
4. Authorization and denial derive current state, current canonical alias, and
   active principal-role assignment from hash-chained authoritative event ledgers.
   Self-claimed future state or a stale/different alias is rejected.
5. Grant validation dereferences exact reviewer-certificate, candidate, audit
   report, audit manifest, and grant event bodies from one append-only sequence.
   It recomputes canonical bytes, coverage, content, hashes, and ordinals. Grant
   scope must be within the candidate and both certificates; `FOCUS_ONLY` can
   never become `ALL_25`.
6. `fingerprint.mjs` exports whole-registry no-replay enforcement plus atomic
   reserve, materialize, tombstone, and issue transitions. Reservation,
   materialization, tombstone, and previously-issued composite sets are disjoint.
7. `semantics.mjs` exports the complete
   `AUTHORIZATION -> OPEN -> CAPABILITY_CONSUME -> CLOSE` validator and atomic
   consume operation. One transaction and capability bind all four events,
   ordinals, prior hashes, references, timestamps, pre-seal byte counts, use
   ordinal, registry roots, and permanent single-use state.

The v3 positive findings remain executable: strict typed canonical payloads,
materialized 25-type coverage, seven-component content-derived fingerprints,
exact role partitions, sealed policy roots, and the five permanent
post-activation denials.

## Verify

Run from this directory:

```powershell
node verify.mjs
```

The verifier:

- rehashes 13 direct public upstreams, including the exact v4 subject and v4
  independent `FAIL_BLOCKERS` audit;
- independently confirms all seven v4 blocker codes and zero activity;
- runs all 23 Draft 2020-12 schema baselines and 3,142 structural attacks;
- runs more than 24,000 deterministic semantic bypass attacks, including 20,000
  bulk ledger, capability, fingerprint-lifecycle, and access-chain attacks;
- checks the exact package file set, public manifest rows, and own SHA-256 seal.

A successful default run means only
`PASS_AUTHOR_EVIDENCE_COMPLETE_PENDING_FRESH_INDEPENDENT_AUDIT_NO_AUTHORITY`.
It cannot accept itself. A new independent audit of this exact manifest is still
required before any operational use.

## Boundary

All verifier identities, ledgers, fingerprints, and events are synthetic public
constants generated in memory. This package reads no private path, actor, item,
answer, gold, environment value, secret, database, provider, model, generation
ledger, or network resource. It performs no question generation and consumes
zero API candidates.
