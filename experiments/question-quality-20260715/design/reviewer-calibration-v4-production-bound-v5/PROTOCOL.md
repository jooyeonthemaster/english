# Protocol: production-bound reviewer calibration v5

## 1. Disposition and immutable lineage

This package is public design evidence, not an execution record. It is the
successor to the immutable v4 subject whose manifest SHA-256 is
`303b954e729f89fc21b95271d5cd895434c96bd193c24a31a393052b0ba63b05`.
The direct predecessor audit manifest is
`454b0b5d5fa7c1a9b112c45f1797301c46cef5868b83c6d2f5d7964b67fcd571`;
its `verdict.json` SHA-256 is
`4c287ecbcebe20735168acc631ec9f6cb97f135958c7e58c3a1dc1ae237825c4`.
That verdict remains `FAIL_BLOCKERS` with seven blockers. v5 does not edit,
reinterpret, or promote either predecessor.

All registries in this package are empty and unready. All activity and authority
counters are zero. No actor, item, answer, gold, private path, environment value,
secret, database row, network response, model response, API candidate, or
generation ledger is read or written.

## 2. Identity registry and raw attestation

Stable principals retain the v4 HMAC derivation from a canonical authority
namespace and canonical authoritative source ID. A principal may have several
canonical pseudonyms, but the registry enforces:

- one source commitment maps to exactly one principal;
- every principal record maps back to exactly one source commitment;
- every pseudonym maps to exactly one principal and appears exactly once in that
  principal's sorted forward set;
- every principal record points to a present raw custodian attestation;
- every raw attestation is revalidated at seal and sealed-registry use.

The attestation contains the namespace, source commitment, principal commitment,
complete canonical pseudonym set, custodian principal, pretrusted custodian SPKI
fingerprint, custodian role, Ed25519 algorithm, verdict, signature, and digest.
Signature text must match strict Base64 syntax, decode to exactly 64 bytes, and
re-encode byte-for-byte to the supplied string. This eliminates alternate pad-bit
representations.

Sealing recomputes the complete registry root from raw records and maps. A crossed
map, missing attestation, forged signature, untrusted key, changed pseudonym set,
or non-bijection fails before the registry can become ready.

## 3. Authoritative state, alias, and role

`appendAuthoritativeLedgerEvent` and
`validateAuthoritativeAppendOnlyLedger` define the public event-chain primitive.
Every event has a one-based consecutive ordinal, exact prior-event SHA-256,
canonical event SHA-256 excluding only its own hash field, strict millisecond UTC
timestamp, and nondecreasing time.

The state ledger contains only consecutive `STATE_TRANSITION` events over the
fixed state enum. The current state is derived by replay, never accepted from the
authorization or denial claim.

The identity ledger contains alias activation, role activation, and role
revocation events bound to the exact sealed identity registry. Current alias and
active principal-role assignment are derived by replay. Authorization and denial
must present the exact derived alias, assignment event, principal, role, and
identity root. Optional legacy assignment input may only agree with this
authoritative result; it cannot create authority.

## 4. Immutable source-only policy recomputation

`sealPolicyRegistry` canonical-clones only source policy rows, state deny sets,
resource proofs, transition proofs, and post-activation scope. It reconstructs
all 98 phase/state/resource tuples, exact allowed/denied role partitions, and all
component roots, then deep-freezes the result.

Authorization and denial call the same source-only reconstruction and consume
only its returned tuples, proofs, and roots. They never read caller-owned derived
tuples or derived roots after recomputation. A caller may mutate a copied derived
DENY tuple to ALLOW and replace its matrix or role roots, but the validator still
uses the source-derived DENY and rejects the request.

The original five post-activation denials remain exact:
`OUT_OF_SCOPE_S1_RESULT`, `OTHER_RATER_IDENTITY`,
`RAW_HIDDEN_COMMITMENT`, `REJECTION_SURPLUS_HISTORY`, and
`RAW_PRIVATE_TRUSTED_GOLD`.

## 5. Scope and authoritative activation events

Coverage evidence remains materialized and recomputed from exact passed events,
materializations, slots, type/family bindings, fingerprints, terminal decisions,
and distinctness. `FOCUS_ONLY` is exactly `GRAMMAR_ERROR` then
`BLANK_INFERENCE`; `ALL_25` is the exact production order.

Grant validation requires one authoritative append-only ledger containing:

1. two distinct `REVIEWER_CERTIFICATE` events;
2. one `ACTIVATION_CANDIDATE` event;
3. one `ACTIVATION_CANDIDATE_AUDIT_REPORT` event;
4. one `ACTIVATION_AUDIT_MANIFEST` event;
5. one `ACTIVATION_GRANT` event.

Every referenced event is found by exact event hash and kind. Candidate, audit,
and grant typed canonical bytes are recomputed. The audit manifest must bind the
exact candidate and audit events and canonical bytes, with strict ordering:
certificate < candidate < audit report < audit manifest < grant.

The grant's type set must be a subset of the candidate request and each
certificate. It must also equal the exact audited candidate scope. Consequently,
a focus certificate or focus candidate can never authorize an all-25 grant.
Opaque hashes, caller-supplied ordinals, or a hashes-only preexisting-audit record
cannot substitute for event bodies in the authoritative sequence.

## 6. Fingerprint lifecycle

The existing seven-component content-derived fingerprint and slot proof remain
unchanged. v5 adds an exported lifecycle registry with four mutually exclusive
states:

- active reservation;
- materialization;
- tombstone;
- previously issued.

`validateFingerprintReservationMaterializationTombstoneDisjointness` recomputes
every reservation bundle and materialization slot binding, validates tombstone
and issue source commitments, checks globally unique lifecycle IDs, rejects any
composite overlap, and recomputes the whole registry root.

Atomic reserve, materialize, tombstone, and issue operations validate the old
state, apply exactly one transition to a canonical clone, recompute the root,
validate the new state, and return a deep-frozen registry. A failed, rejected,
revoked, active, materialized, or previously-issued composite cannot be reserved
again.

## 7. Single-use access chain

The exported validator consumes exactly four events:
`AUTHORIZATION -> OPEN -> CAPABILITY_CONSUME -> CLOSE`.
It binds:

- one transaction ID and one capability hash across all four events;
- consecutive ordinals, exact prior hashes, and canonical event hashes;
- authorization/open/consume references and ordinals;
- strict authorization-before-open and monotone consume/close times;
- exact `occurredAt` to action-time equality;
- zero bytes released before OPEN and CONSUME seals;
- `useOrdinal === 1`;
- capability uniqueness proof and before/after state roots.

The capability registry records issued, consumed, revoked, and completed
transactions plus the next event ordinal and last event hash. Its full registry
root binds both logical single-use state and chain position. Atomic consume adds
the capability to issued and consumed exactly once, closes the transaction, and
advances the authoritative chain. Reusing either capability or completed
transaction fails.

## 8. Verification and acceptance

`node verify.mjs` rehashes all 13 direct upstreams and safe nested manifest rows,
checks both predecessor FAIL audits, compiles all Draft 2020-12 schemas, executes
3,142 structural mutations, and executes more than 24,000 deterministic semantic
bypass attacks. The semantic matrix includes 5,000 cases each for append-only
ledger corruption, capability-state corruption, fingerprint lifecycle replay,
and disconnected access chains.

The verifier also checks the exact package file set and own manifests. Its PASS
is author evidence only. Acceptance requires a new independent auditor to freeze
and inspect this exact `MANIFEST.sha256`, independently reproduce hostile cases,
and publish a separate immutable review package. Until then, execution,
certification, scoring, result access, calibration, C0, S1, and generation remain
unauthorized.
