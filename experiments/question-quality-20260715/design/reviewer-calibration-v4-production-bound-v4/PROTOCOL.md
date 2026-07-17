# Protocol: production-bound reviewer calibration v4

## 1. Boundary and disposition

This package is design evidence, not an execution record. It contains public
schemas, empty registries, deterministic implementation modules, hostile tests,
and lineage pins. It contains no real principal source ID, pseudonym, item,
answer, gold, private path, environment value, database row, network response,
model response, API candidate, or operational ledger entry. All runtime examples
in the verifier are synthetic constants.

The v3 subject manifest is pinned at
`39f9d4729e9a09c7c4dc9644477bcdbd81c2f09b15b31f6837ea80ee73c59cd6`.
Its independent audit manifest is pinned at
`d9f8256c9307a47e3ee11408b895f59d0047581058d5f82fa01107d5432adea5`,
and the audit JSON is pinned at
`679e0ead6ae9cae524b2f4072a78c34f523f70ecee7e50c8f3e3cfe695eac80d`.
The audit verdict remains `FAIL_BLOCKERS`; v4 neither overwrites nor promotes it.

## 2. Stable principal identity

At execution time, an identity custodian supplies a secret key of at least 256
bits. The key is never serialized into this artifact. `semantics.mjs` applies
NFKC, trimming, ASCII-only case folding, and strict ASCII patterns to the
authority namespace, canonical principal source ID, and pseudonym. It then uses
HMAC-SHA-256 with versioned, length-framed domains to derive:

- one canonical source commitment from one authoritative source ID;
- one stable principal commitment from that source commitment and namespace;
- an independently authored Ed25519 custodian attestation over the principal,
  source commitment, and complete canonical pseudonym set. The custodian public
  key must already be trusted for that exact custodian principal, and its SPKI
  SHA-256 fingerprint is part of the signed assertion.

The registry enforces source-to-principal and principal-to-source one-to-one
cardinality while permitting one or more canonical pseudonyms for a principal.
Pseudonym collisions, source collisions, untrusted keys, invalid signatures,
forged attestations, and self-attestation
produce a denial record and leave the pre-attempt registry intact. Role
incompatibility is evaluated by principal commitment, never display alias.

## 3. Materialized coverage

A PASS cannot be credited from a free-floating type string. It must point to one
immutable eligible materialization and match all of these fields exactly:

- materialization event hash and materialization record root;
- slot ID, canonical type, canonical family, and eligible phase;
- composite fingerprint and derivation proof;
- terminal decision event, terminal decision hash, and terminal `PASS`;
- unique-answer and fatal-check PASS seals.

For a requested scope, both maps have exactly the requested type keys: the PASS
event map and the materialization event map. Events, materializations, and slots
are each unique across credited types. The ordered map root binds all matched
fields; the recomputation root additionally binds the scope. Certificates,
candidate, and grant must independently recompute the same root. `FOCUS_ONLY` is
exactly `GRAMMAR_ERROR`, then `BLANK_INFERENCE`; `ALL_25` is the exact 25-type
production order.

## 4. Typed canonical payload bytes

The only activation payload profiles are:

- `NARA_QCAL_V4_ACTIVATION_CANDIDATE_PAYLOAD_1`;
- `NARA_QCAL_V4_ACTIVATION_CANDIDATE_AUDIT_PAYLOAD_1`;
- `NARA_QCAL_V4_ACTIVATION_GRANT_PAYLOAD_1`.

Their exact fields are executable constants in `canonicalize.mjs`. Extra or
missing fields fail closed. Strict JSON input rejects duplicate keys and trailing
bytes before parsing. Serialization accepts only JSON primitives, dense arrays,
and plain objects; it rejects nonfinite numbers, unsupported members, cycles,
and lone surrogates. Object keys are sorted, negative zero becomes zero, and
UTF-8 JCS bytes are framed as:

`domain || u16(versionLength) || version || u16(kindLength) || kind ||
u16(profileLength) || profile || u64(payloadLength) || payload`.

Candidate excludes its own digest. Audit includes the prior candidate digest but
excludes its own digest. Grant includes prior candidate and audit digests but
excludes its own digest. Thus every required digest is reproducible and no
fixed-point/self-reference is possible.

## 5. Derived fingerprints

Fingerprint derivation uses version
`NARA_QCAL_V4_FINGERPRINT_NFKC_WS_ASCII_FOLD_8TOKEN_1`. Execution supplies full
text, visible surface, surface template, topic tags, scenario entities, author
principal commitment, canonical type, family-or-null, and rotation epoch.

Text normalization is exact: valid Unicode scalars, NFKC, CRLF/CR to LF, Unicode
whitespace collapse, trim, and ASCII A-Z folding. The module commits the raw
UTF-8 inputs, hashes the normalized full text, hashes the sorted set of
contiguous eight-token windows, canonicalizes topic and scenario sets, binds the
item-author principal/type/family/epoch, derives a surface structural template,
and finally derives the composite from the six ordered components plus the input
root/type/family/epoch. Claims are accepted only after full recomputation.
The slot proof then domain-hashes the exact derived bundle, phase, and slot ID;
the slot must independently match author principal, type, family, epoch, input
root, composite, phase prefix, and grammar/blank/nonfocus block.

## 6. Policy and grant

The seven policy rows materialize one explicit ALLOW-or-default-DENY tuple for
every phase/state/resource combination. Each tuple has
nonempty exact allowed and denied role sets that form a disjoint partition of all
17 roles. Authorization must locate the exact phase/state/resource tuple,
dereference an active assignment for the actor principal and exact role, and bind
the sealed registry root plus all component roots.

Policy sealing fails if rows, any of the 12 state deny sets, resource proofs,
transition proofs, or post-activation scope are empty. The sealed root commits:

- matrix and all-state allow/deny roots;
- all-tuple allowed/denied-role roots;
- resource-class and state-transition proof roots;
- post-activation scope, allow, deny, allowed-role, and denied-role roots.

Final grant validation recomputes the sealed policy, candidate bytes, audit
bytes, and shared coverage root. A materialized audit record must bind the exact
audit report, audit manifest, canonical bytes, candidate event, and candidate
bytes, with ledger ordinals satisfying candidate < audit <= manifest < grant.
Candidate, auditor, and grant-author principals are pairwise distinct. Candidate
and audit remain authority-false. Only the final grant payload may set authority
and scope-bound result access true.

## 7. Access chain and post-activation denial

Resource access remains an append-only four-event transaction:
`AUTHORIZATION -> OPEN -> CAPABILITY_CONSUME -> CLOSE`. Transaction ID,
capability, ordinals, prior hashes, referenced event hashes, and timestamps bind
every edge. No content bytes may be released before OPEN or CONSUME is sealed,
and use ordinal must equal one.

Even after a legitimate grant, the following remain explicitly denied:
`OUT_OF_SCOPE_S1_RESULT`, `OTHER_RATER_IDENTITY`, `RAW_HIDDEN_COMMITMENT`,
`REJECTION_SURPLUS_HISTORY`, and `RAW_PRIVATE_TRUSTED_GOLD`.

## 8. Acceptance rule

Author verification cannot accept itself. A fresh auditor must rehash this exact
MANIFEST, independently rerun or reimplement the hostile checks, and issue a
separate immutable review artifact. Until that review returns an admissible PASS,
all registries remain empty and unready, all counters stay zero, and there is no
execution, evaluation, scoring, generation, certificate, result-access, or grant
authority.
