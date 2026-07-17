# Linux ext4 execution boundary v1 — independent audit v1

## Verdict

**PASS_DESIGN_BLOCKERS_CORRECT**

The subject is a correctly fail-closed design package. It does not authorize execution. This verdict is not ext4 crash-durability proof, production-runtime parity proof, Linux source materialization, package installation, bundle construction, ledger migration, restart evidence, reservation authority, or permission to contact a provider.

The seven declared blockers are justified and must remain. No blocker was removed.

## Independence and safety boundary

- The subject's `verify.mjs` and `hostile-mutations.mjs` were treated as untrusted. Neither was imported nor executed.
- This audit uses its own validator, its own 44-row byte/SHA recomputation, its own subject manifest verification, its own static executable-surface scan, and direct read-only WSL probes.
- No network, API, provider, model, database, secret, private artifact, or budget-ledger read/mutation occurred.
- No filesystem durability probe was written. In particular, no file was created and no `fsync` result was used as evidence.
- No source copy/staging, package install, build/freeze, ledger migration/reservation, WSL restart, or dispatch occurred.

## Read-only host reprobe

| Boundary | Independent observation | Disposition |
|---|---|---|
| WSL distro | Ubuntu-24.04, WSL2 | Observation only |
| Kernel | `6.6.87.2-microsoft-standard-WSL2`, `x86_64` | Matches subject observation |
| `/home` | target `/`, source `/dev/sdd`, `ext4`; statfs `ext2/ext3`; magic `0xef53`; canonical `/home` | Candidate native filesystem fact, not future-root authorization or crash proof |
| `/mnt/d` | source `D:\\`, `9p`; statfs `v9fs`; canonical `/mnt/d` | Denied as durability authority |
| WSL runtime | Node `v22.22.0`, linux/x64, modules 127, N-API 10, V8 `12.4.254.21-node.33`; npm `10.9.4` | Reprobed read-only |
| Windows runtime | Node `v24.7.0`, win32/x64, modules 137, N-API 10, V8 `13.6.233.10-node.26` | Version, platform, modules ABI, and V8 mismatch WSL |

Neither `package.json` nor `vercel.json` pins the production Node runtime, and deployed-commit parity is not proven. The subject correctly keeps deployment parity at `UNKNOWN_BLOCKED`.

## Public source closure

The audit independently rehashed every allowlisted file, not merely the closure JSON.

- Exact rows: **44 / 44**
- Exact bytes: **1,489,112**
- Row byte/SHA mismatches: **0**
- Recomputed set SHA-256: `4373bd4dd737c2e729170ed2ff57d9a4f5b862c4827a10d5a3225534a02cd85e`
- Forbidden `.git`, `node_modules`, `private`, `.next`, `dist`, `coverage`, `.env*`, key/PEM, secret JSON, private JSON, raw-request, or raw-response paths: **0**
- Symlink/junction rows or ancestors below the source root: **0**
- The Windows source root is not the Linux materialization destination.
- The closure remains `executionComplete=false`; it does not contain a complete production compiler closure, separately authorized private ingress, Linux-native toolchain/frozen runtime, or final authorization.

The subject package itself is pinned by eight exact file hashes. Its manifest has seven nonrecursive rows and matches those files. Static inspection found no child-process/network import or write/copy/install/build/migration/dispatch surface in the two executable verification scripts. Text describing future commands is not an executable command.

## Hostile review

The independent verifier executed **380** one-at-a-time in-memory mutations; **380 were rejected, 0 escaped**. This exceeds the required minimum of 100. Fifty named attacks were added on top of generated scalar, array, blocker, activity, prerequisite, and per-closure-row drift mutations.

| Attack family | Result and required disposition |
|---|---|
| 9p `fsync` success laundering | Rejected. No 9p write was performed; 9p/v9fs remains deny-only evidence. |
| `/mnt/d`, symlink, junction, or bind indirection | Weakening outside-prefix, canonical-chain, most-specific-mount, filesystem-agreement, or symlink/bind prohibitions was rejected. A future root still must be reprobed immediately before reservation. |
| Source drift and recursive ingress | Each of 44 row hashes was drifted independently and rejected. Recursive copy, Windows `node_modules`, `.env`, private, and extra-path ingress remain forbidden. |
| Windows/WSL and deployment mismatch | Claims that package/Vercel runtime is pinned, commit parity is known, or Windows/WSL runtimes match were rejected. |
| Incomplete compiler/private ingress | Clearing either prerequisite was rejected. Public closure cannot substitute for private compiler input. |
| Dual-ledger or Windows authority | Logical authority other than exactly one, reversible migration, or Windows mirror authority was rejected. |
| Flock/concurrent executor | The design requires a nonblocking kernel flock for the full preflight→reservation→dispatch→settlement→export lifetime. A second executor must fail before ledger read or network. Any weakening was rejected. |
| Reservation | Candidate reservation is exactly `C0=2` in one atomic capacity reservation before network. Split reservations, journal-as-authority, and dispatch on unknown commit were rejected. |
| Authority crash boundary | Before durable ext4 acceptance, the origin remains authority and partial ext4 state is quarantined. After acceptance, ext4 is sole authority. Opposite or dual outcomes were rejected. |
| Intent/terminal crash recovery | A durable intent makes the send sent-or-unknown and forbids replay. Missing response never proves no send. Terminal evidence is settled without provider recall. Weakening was rejected. |
| WSL restart | Restart testing remains unauthorized and absent. A graceful restart cannot claim host power-loss durability. False readiness was rejected. |
| Stale/missing Windows mirror | The retained ext4 bundle is the re-export source. Mirror failure cannot change the ledger, authorize deletion/settlement, or trigger replay. Weakening was rejected. |
| Blocker removal and command injection | Each blocker was removed separately and rejected. Dispatch or live candidate authorization was rejected. |

Full named coverage and counts are in `hostile-evidence.json`.

## Blocker disposition

All remain active:

1. `B1_V6_FINAL_FREEZE_AND_INDEPENDENT_AUDIT_NOT_BOUND`
2. `B2_EXECUTION_SOURCE_CLOSURE_AND_PRIVATE_INPUT_INGRESS_INCOMPLETE`
3. `B3_LINUX_NATIVE_TOOLCHAIN_AND_BUNDLES_NOT_MATERIALIZED`
4. `B4_NODE_AND_PRODUCTION_DEPLOYMENT_PARITY_UNKNOWN`
5. `B5_SINGLE_EXT4_LEDGER_AUTHORITY_NOT_MIGRATED_OR_AUDITED`
6. `B6_WSL_RESTART_RECOVERY_NOT_EXECUTED`
7. `B7_LINUX_EXECUTION_AUTHORIZATION_AND_INDEPENDENT_AUDIT_ABSENT`

The package therefore remains design-only with all authorization flags false and all prohibited activity counters zero.

## Reverification

From the repository root, on the same pinned Windows/WSL host:

```powershell
node experiments/question-quality-20260715/reviews/linux-ext4-execution-boundary-v1-independent-audit-v1/independent-verify.mjs
```

Expected verdict: `PASS_DESIGN_BLOCKERS_CORRECT`, 44 closure rows, set SHA above, 380/380 hostile mutations rejected, and all prohibited activity zero.
