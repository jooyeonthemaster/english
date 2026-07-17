# Campaign v6 S1 immutable design

This package freezes the 180-assignment S1 screen over the remediated
`original-s1-v6` corpus. It is a design artifact, not dispatch authorization.
The private queue contains exact passage text, row-level rights/PII/scope
bindings, assignment membership, and seeded order; it is directory-gitignored
and intentionally absent from the public manifest. The public artifact exposes
only aggregate allocation and whole-artifact commitments.

Allocation is fixed before any model call:

- grammar: 4 profiles x 2 plans x 2 difficulties x 6 passages = 96;
- blank Standard: 4 profiles x 2 difficulties x 6 passages = 48;
- blank Premium: B0/B2/B3 x 2 difficulties x 6 passages = 36;
- B1 Premium = 0.

Every assignment permits one candidate opportunity, one physical fetch, one
semantic question, one outer attempt, and zero SDK retries. Replacement,
top-up, ladder, repair, solver, fallback, and salvage paths are disabled. The
models remain Gemini 3.5 Flash for Standard and Gemini 3.1 Pro Preview for
Premium; reasoning is off. The route contract is exactly
`google-vertex/global` in both `only` and `order`, with fallbacks disabled,
parameter support required, data collection denied, and ZDR required.
The former profile-integration audit is retained only as a historical
baseline. Current G3 abstention and B3 self-attestation claims are bound to the
separately sealed `prompt-profile-negative-evidence-audit-v1` results,
findings, report, source closure, and manifest. Its offline PASS is not treated
as live quality evidence.

The source passages are newly composed for this campaign, so a historical DB
cleanliness requirement is explicitly not applicable. This does not waive the
bound original-authorship, no-PII-observed, and campaign-limited processing
records. The builder refuses to seal until both the remediation artifact and
the fresh independent-v2 audit bind the same private, public, and manifest
hashes. The independent audit includes sentence-level review, all 30 grammar
bindings, all six blank placements, and a final repository-overlap recapture.

The previous v5 flat per-call caps are not execution authority. This design
reserves a non-authorizing $100 planning ceiling: 912,000 maximum output tokens,
9,000,000 exact-body UTF-8 bytes, 4,096 server-overhead tokens per assignment,
and a 1.10 safety multiplier. The stress calculation charges Standard at
$2.70/$16.20 and Premium at $7.20/$32.40 per million input/output units; it
also charges every not-yet-known body byte at the higher Premium input rate.
That deliberately conservative design bound is $99.1229184. Actual admission must use a
fresh (at most 15 minutes old) schema-v2 exact-tag price proof and the separate
durable controller. A calculated campaign maximum above $100 blocks execution
and requires an explicit design amendment; it never auto-shrinks the sample.

Offline reproduction:

```powershell
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v6-s1/build.mts --write
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v6-s1/build.mts
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v6-s1/verify.mts
npx.cmd tsc -p experiments/question-quality-20260715/design/campaign-v6-s1/tsconfig.json --noEmit
```

These commands read local files only. They do not read secrets or call a
database, network, provider, or model. The package remains
`IMMUTABLE_DESIGN_EXECUTION_BLOCKED` until exact-wire, price, credential,
durable-controller, independent audit, and explicit authorization gates all
pass.
