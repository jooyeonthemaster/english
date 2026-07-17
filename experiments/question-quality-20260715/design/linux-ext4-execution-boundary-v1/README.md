# Linux ext4 execution boundary v1

This is a design-only, fail-closed bridge for a future two-opportunity C0 connectivity pilot. It records the important local fact: WSL Ubuntu's `/home` resolves to native `ext4`, while the repository under `/mnt/d` resolves to `9p`/`v9fs`. The latter is never accepted as crash-durable even if an `fsync` call returns success.

The package deliberately does not authorize or perform execution. The present WSL Node is `v22.22.0`; the current v6 contract names a Windows `v24.7.0` frozen runtime; neither `package.json` nor `vercel.json` pins the production Node version; deployed commit parity is not proven. Runtime parity therefore remains blocked.

## Intended future sequence

1. Finish and independently audit an immutable v6 successor.
2. Produce a complete exact source manifest, including the independently recomputed production compiler closure, and materialize only those regular files into an empty native-ext4 directory. Do not copy the repository, `.git`, private artifacts, environment files, or Windows `node_modules`.
3. Through a separate authorization, ingress the sealed private compiler input and run a Linux-native `npm ci`/toolchain freeze with exact provenance. Windows-built bundles are not reusable.
4. Prove production Git/runtime parity. Unknown is a blocker, not a compatibility assumption.
5. Through another audited transition, create a native-ext4 authority epoch from an exact all-zero origin ledger snapshot. The ext4 ledger becomes the only authority; the Windows JSON remains immutable and nonauthoritative.
6. Hold a nonblocking kernel `flock` for the entire lifecycle, repeat the mount/identity preflight, atomically reserve exactly `C0=2`, and use the private journal only as receipt evidence—not as a second capacity ledger.
7. Before each send, durably commit a no-replay/dispatch-intent marker. After a crash at or beyond this point, never replay.
8. Execute no-network WSL terminate/restart recovery tests before any live authorization.
9. Export only a content-addressed public mirror to Windows. The ext4 ledger and result remain authoritative and retained, so a 9p copy failure is recoverable by re-export.

## Current closure

`current-worktree-public-source-closure-v1.json` is an exact byte/hash allowlist of the public bootstrap material observed in the current worktree. It is intentionally marked `executionComplete=false`: generated Linux artifacts, the full production compiler closure, a private input ingress, and all authorization artifacts are absent. Any drift invalidates this package's binding and requires a new manifest/audit.

## Verification

`node experiments/question-quality-20260715/design/linux-ext4-execution-boundary-v1/verify.mjs` performs public, read-only verification. `node .../hostile-mutations.mjs` exercises fail-closed mutations in memory. Neither command probes a credential, private path, ledger, network endpoint, database, or provider.

There is intentionally no dispatch, install, build, transfer, migration, or recovery command in this package.
