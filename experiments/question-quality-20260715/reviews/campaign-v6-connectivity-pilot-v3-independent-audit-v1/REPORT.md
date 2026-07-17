# Campaign v6 connectivity pilot v3 — independent release-readiness audit

Verdict: **FAIL — DO NOT AUTHORIZE OR DISPATCH.**

This was a deterministic, local-only audit. It made no network, provider, model, API, browser, production-database, credential, or secret-value access; consumed zero candidates; did not execute the public price collector; and left the target package and global ledger byte-for-byte unchanged.

## Release blockers

### F-001 — incomplete production-compiler provenance (critical)

The v3 live runtime closure is fixed, but the production-compiler/source freeze is not. Starting independently from `campaign-v6-connectivity-pilot-v3/compile-exact-wire.mts`, a TypeScript-AST traversal of static imports/exports, import-equals, literal dynamic imports, and literal `require` calls resolves **191** repository-local files with zero unresolved local imports and zero nonliteral dynamic loads.

The private v3 wire artifact reports an inherited `productionSourceClosure` of only **32** rows with semantic commitment `26725e6f8b90368fdd168a491117414f56689f964506a430e2b405fd12d3796b`. Only **27** of those rows are in the actual compiler graph. The commitment omits **164** actual compiler files, including both the v2 compiler it executes and the v3 compiler wrapper itself, plus `protocol-core.ts` and 161 production dependencies. Five claimed rows are runtime data/policy files outside the import graph.

Fresh offline compilation reproduces the two stored body bytes today, but this does not repair the missing source commitment. The known v2 incomplete-closure defect therefore survives in v3 compiler provenance.

### F-002 — response/usage evidence is not strict (high)

An independent deterministic parser test was accepted with all of the following simultaneously:

- `finish_reason: "length"`;
- a one-property `{ "unexpected": true }` object instead of a production-schema question;
- fractional token counters `1.5 + 0.5 = 2`;
- zero reported cost.

That evidence can be marked successful by the runner because the parser checks only that one nonempty object exists. Release success therefore does not establish an allowed terminal finish reason, full committed-schema validity, or integer usage evidence.

## Checks that passed

- V2 is unchanged: all 15 files match the literal SHA-256 baseline captured by the prior independent v2 review.
- The independent v3 live repository closure is exactly eight source files plus three runtime-data rows (protocol, private exact wire, and global ledger), for 11 exact byte/hash rows and commitment `f06e4a429b5102d166f66f6b8708741b263c39d7219be007aab28f386f9aad4f`. It reproduces `live-closure-v3.json`; no minimum-count substitute is used.
- `test-support.ts` resolves only to itself and the already-live pure parser/core dependencies; the test-support module itself is outside the live graph and adds no network, process-environment, filesystem, worker, or child-process capability.
- Runner, child, and operator contain no test-mode/offline/injected-transport authority, arbitrary delegate factory, mutable test environment, or alternate model-dispatch seam. The one model-dispatch call site is `production-runner.ts`. The price collector has a separate public-metadata GET call site and was not run.
- Current `liveExecutionAuthorized`, `hostileAuditPassed`, and `dispatchCommandPresent` values are all false. Direct CLI execution of the operator wrapper reaches only the unconditional blocked entrypoint.
- Stored wire order and hashes are exact: Standard `google/gemini-3.5-flash` body `5c68b632…2003`, then Premium `google/gemini-3.1-pro-preview` body `aed07356…e643`; route is `google-vertex/global` only, fallbacks off, reasoning off, strict JSON-schema request, one completion and one semantic candidate per fetch.
- The serial runner breaks on the first failed/timeout/unknown assignment and exposes no retry, repair, fallback, replacement, or top-up path.
- The public result key set exactly matches the protocol allowlist and excludes raw/private response, question, prompt, credential, and provider-request identifiers.
- The global ledger hash is `9a05a64e…a1e`, with 0 used and 0 reserved of 1000. The future path uses an exclusive `wx` lock and atomic rename for a +2 global reservation and records a private +2 reservation.
- Price evidence requires a 15-minute maximum age, canonical slug, exact endpoint cardinality, all returned active endpoints and overrides, charge dimensions, required structured-output parameters, and a self content hash. No price collection occurred during this audit.
- The dormant operator streams `.env.local` only inside the future-authorized function, retains only a unique `OPENROUTER_API_KEY` assignment, supplies a minimal child environment, and contains no key logging, hashing, or persistence.
- The 22-row author manifest, 22 author offline tests, scoped TypeScript check, and fetch-denied `build-offline.mts --check` write/no-write parity all reproduce under sanitized local child environments. Target and ledger hashes remain unchanged.

## Exact audited hashes

| Artifact | SHA-256 |
|---|---|
| `protocol-v3.json` | `9502c1801584084dd026365aaacca46b30c63a1c0aea392f8de3cb32d2f55e15` |
| private exact-wire v3 | `754144b8ea8cd4c5f4cda1c4aab591cec9caae44db6f39c7bf9f870b136f7dcb` |
| public exact-wire v3 | `cf20076d6f023a200f65366eff2627016fed127fe4060f0a8f85dcf6dd3f433b` |
| `live-closure-v3.json` | `86609d2f688f854ed63bbdf35b84f586252becb1f0787e4f2c1ec29e13e79d10` |
| independent 11-row live closure | `f06e4a429b5102d166f66f6b8708741b263c39d7219be007aab28f386f9aad4f` |
| author `MANIFEST.sha256` | `f5baacde25a267e6a6413a5f21380f1ed735308b39213099393eab1d4c78b192` |
| global ledger | `9a05a64ed97c4746b7fe56933374d2179178885bd3e1db93f830f938bafdea1e` |

`SOURCE-HASHES.sha256` commits the exact audited target, both live and compiler graphs, v2 baseline files, runtime data, compiler inputs, root configuration, and local toolchain entry files. `REVIEW-MANIFEST.json` is self-excluding and commits every other review artifact.

## Reproduction

From the repository root:

```powershell
node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v3-independent-audit-v1/verify.mts
```

The verifier uses OS-temporary files only, supplies sanitized child environments, relies on the compiler's audited fetch-deny/capture guard, never invokes the network-capable price collector or live child, and fails if the target package or global ledger changes.
