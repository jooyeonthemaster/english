# Reviewer calibration v4 production-bound v4

This directory is an immutable, public-only successor to
`reviewer-calibration-v4-production-bound-v3`. The v3 subject remains unchanged,
and its fresh independent audit remains an immutable `FAIL_BLOCKERS` input. This
v4 artifact is author evidence only. It has not run calibration, inspected an
actor or item, issued a certificate, opened a result, or granted authority.

## What v4 closes

The predecessor audit found six material gaps. v4 closes them with executable
code rather than prose-only digest fields:

1. `semantics.mjs` derives stable, domain-separated principal commitments from
   authoritative canonical source IDs, permits multiple canonical pseudonyms for
   one principal, requires a pretrusted-custodian Ed25519 attestation, denies mapping
   collisions without partial mutation, and compares role exclusions at the
   principal level.
2. Every coverage PASS dereferences an exact materialization event and matches
   its slot, type, family, phase, derived fingerprint, eligibility, and terminal
   decision. Distinct types require distinct events, materializations, and slots.
3. `canonicalize.mjs` implements strict duplicate-free JSON parsing, an RFC
   8785/JCS-compatible serializer for finite ECMAScript JSON values, exact typed
   candidate/audit/grant field projections, and domain/version/kind/profile/length
   framing. A payload never contains its own canonical digest.
4. `fingerprint.mjs` recomputes a versioned seven-component fingerprint from the
   actual private inputs available only at execution time. Raw-input commitments,
   normalized components, the composite, author principal, type, family, and
   epoch are bound together.
5. Every executable allow tuple contains nonempty exact `allowedRoles` and
   `deniedRoles`; authorization dereferences an active role assignment for the
   exact principal and binds every sealed policy root.
6. A grant is impossible against an empty, unready, unsealed, or mutated policy
   registry. It binds the candidate and audit canonical bytes, coverage root,
   all-state allow/deny roots, all-tuple role roots, resource and transition proof
   roots, and post-activation scope roots.

The original B1-B8 protections remain in force, including the append-only
`AUTHORIZATION -> OPEN -> CAPABILITY_CONSUME -> CLOSE` chain and the exact five
post-activation denials.

## Verify

Run from this directory:

```powershell
node verify.mjs
```

The verifier rehashes all 11 pinned public upstreams and safe manifest rows,
checks the exact v3 `FAIL_BLOCKERS` audit and its six codes, validates all zero
authority/activity counters, runs Draft 2020-12 structural attacks, and executes
stateful semantic attacks against the implementation modules. Python's
`jsonschema` package is used only by `schema-hostile.py` for Draft 2020-12 schema
validation; it reads only `event-schemas.json` beside it.

Successful verification means only that the author evidence is internally
complete and tamper-evident. Acceptance still requires a new independent audit
in a separate immutable review package. Until that happens, execution,
certification, scoring, result access, and generation authority are all false.
