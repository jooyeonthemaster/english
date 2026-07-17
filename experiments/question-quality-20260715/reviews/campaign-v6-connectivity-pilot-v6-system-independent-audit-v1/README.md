# Campaign v6 connectivity pilot v6 — system independent audit v1

Verdict: **FAIL_BLOCKERS**

This is a fresh, non-live audit of the non-observer system boundary in
`execution/campaign-v6-connectivity-pilot-v6`. It deliberately grants no
behavioral authority to `strict-json-observer.ts` or `offline.test.ts`, and it
does not use the author's tests as proof. `SUBJECT.sha256` binds all 36 other
top-level subject files; their canonical snapshot hash is
`e70ea9adb77a75a7034e1804bd569b70f057506a7395d9533ba3bcb36287cb85`.
The subject snapshot was identical before and after the matrix.

The independent matrix ran 388 scenarios: 388 passed and 0 harness failures.
Here “passed” means that a positive invariant held or a specified hostile
counterexample/blocker was reproduced. No network, metadata endpoint,
provider, model, API, database, credential, subject-private file, global
ledger, freeze, or subject write occurred. Actual filesystem transactions and
markers were confined to an ephemeral review-local scratch directory and
removed before completion.

## Blocking findings

### S1_PRIVATE_RUN_ANCESTOR_DIRECTORY_ENTRY_NOT_DURABLE

`live-io.ts:133-149` creates `private/runs` and then the per-run directory with
`mkdirSync`, but performs no parent-directory fsync for either mkdir. The first
reservation marker is created at `production-runner.ts:602`; its marker
primitive fsyncs the marker's immediate parent (`runRoot`), not the directory
containing the newly created `runRoot` entry (`runsRoot`). Thus the claim at
`production-runner.ts:608` that the marker is durable before global reservation
does not prove that the run directory itself survives a crash. A crash can
leave a durable global reservation without a recoverable private no-replay
directory.

Required correction: after creating `runsRoot`, durably persist its entry in
the exact `privateRoot`; after creating `runRoot`, durably persist its entry in
the exact `runsRoot`; attest both identities before writing or relying on the
reservation marker. Crash recovery must treat every interrupted mkdir/fsync
stage explicitly.

### S2_AUTHOR_AND_COMPILER_TSX_TRANSFORMER_UNSEALED

The author build and isolated compiler execute TypeScript through
`node_modules/tsx/dist/cli.mjs` (`build-offline.mts:46` and
`compiler-client.mts:11`). The planned subject manifest beginning at
`build-offline.mts:51`, the frozen bundler provenance, and the compiler closure
do not bind the installed tsx implementation bytes or an independently derived
transformation. `package-lock.json` is a dependency declaration, not an
attestation of installed transformer bytes. Both author generation and its
same-path checks can therefore be changed by an unsealed transformer while
clean source hashes remain unchanged.

Required correction: remove the transformer from the authority path by using a
plain-Node independently derived build, or seal the complete tsx/transpiler
implementation and prove the source-to-executed-JavaScript mapping with an
independent implementation.

### S3_OPERATOR_BOOTSTRAP_PRELOAD_ENVIRONMENT_UNSEALED

`operator-wrapper.mts` imports Node and subject modules before any runtime
attestation and has no exact operator environment or preload check. The audit's
benign `NODE_OPTIONS=--require=...` probe ran before the entrypoint and changed
global process state in all five repetitions. Bundle and Node executable hashes
are checked only after module evaluation has begun, so they do not establish a
clean bootstrap. The permanent author gate currently prevents dispatch, but a
future authorization successor cannot safely reuse this bootstrap unchanged.

Required correction: introduce a trusted launcher that starts the operator
with an exact environment and no preload/loader/resolution influence, then
attest the bundle and Node bytes before any credential, metadata, ledger, or
network-capable module is evaluated.

### S4_CASE_ALIAS_ENVIRONMENT_POLICY_BYPASS

`author-environment.ts:23-24` computes an uppercase name but tests the original
name against the exact forbidden-name set. Synthetic Windows-relevant aliases
`node_options`, `node_path`, and `esbuild_binary_path` were accepted in all five
independent repetitions. The child allowlist happens not to copy them, but the
parent process has already started and can already have been influenced.

Required correction: canonicalize every compared environment name and reject
case aliases; this is additional to, not a replacement for, a clean external
bootstrap.

### S5_DEPLOYED_NODE_RUNTIME_PARITY_UNBOUND

The frozen design records a local Node executable and targets Node 24, but the
tracked `package.json` has no Node engine and tracked `vercel.json` has no Node
runtime pin. An ignored local project metadata file currently says `24.x`, but
it is untracked, stale-capable, and absent from the planned subject closure. It
cannot establish deployed/production parity. Its SHA-256 is recorded in
`evidence.json`; no project or organization identifier is reported.

Required correction: bind a tracked, deployment-effective runtime policy and
independently verify the deployed runtime identity/semantics needed by the
production-equivalence claim. An ignored workstation file is not authority.

### S6_NO_CURRENT_FROZEN_SUBJECT_OR_MANIFEST

The current directory has no subject `MANIFEST.sha256`, author report, frozen
runtime artifact, frozen bundles, compiler/live closure artifacts, or public
wire seal. `protocol-v6.json` contains hashes and paths for artifacts that are
not present. This is correctly fail-closed, but there is no immutable executable
subject to approve.

Required correction: do not freeze the current source. Close S1-S5 in a new
successor, rerun independent audits, then materialize and seal all runtime and
closure artifacts. Until then execution, freeze, provider, model, and result
authority remain false.

## Independently confirmed system behavior

- Windows/unsupported platforms reject before directory, marker, or repository
  transaction mutation (60 pre-mutation cases plus 13 platform-policy cases).
- The transaction keeps the temp descriptor open across rename, reattests
  path/descriptor/hash identity, fsyncs the renamed target, fsyncs the exact
  parent, and post-attests. Temp/target replacement, post-rename tampering,
  target-fsync failure, and parent-fsync failure were all rejected; post-rename
  failures were typed `COMMIT_UNKNOWN` with no replay (80 cases total).
- The exclusive marker ordering and its open/write/fsync/attest/close/parent
  durability/final-attest failures behaved fail-closed (60 cases).
- A failed intent made both settlement and quarantine unreachable; successful
  intent selected exactly one branch in order (100 cases).
- The permanent author gate currently prevents provider and metadata dispatch.

These positives do not cure the six blockers and do not grant live authority.

## Reproduction

Run the plain verifier twice:

```text
node experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v6-system-independent-audit-v1/verify.mjs
node experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v6-system-independent-audit-v1/verify.mjs
```

The verifier checks the sealed review files, all 36 exact subject rows, the
machine-readable verdict, and reruns the 388-scenario matrix through the local
tsx CLI. It performs no live or subject mutation.
