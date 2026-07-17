# Linux ext4 execution boundary v1 — threat model

## Protected invariants

The future C0 pilot may consume at most two globally counted candidate opportunities, may never replay an opportunity whose send status is unknown, and may have exactly one capacity authority. Credentials, wire payloads, raw responses, question contents, and provider identifiers remain private. A Windows research-tree copy is evidence only; it is never a live ledger.

## Trust boundary

The native WSL2 filesystem observed below `/home` is `/dev/sdd` with `ext4`. The Windows D: drive observed at `/mnt/d` is `9p`/`v9fs`. A successful `fsync` on `/mnt/d` is not accepted as evidence of crash durability. The future execution root, authority epoch, ledger, lock, journals, temporary files, and terminal state must all resolve to the same native ext4 device.

Observation is not proof of execution safety. The mount must be re-probed from inside the exact future process immediately before reservation, and any ambiguity, bind mount, symlink, filesystem mismatch, or probe disagreement blocks execution.

## Threats and required responses

| Threat | Required response |
|---|---|
| `/home` path redirected through a symlink or bind mount | Reject after canonical ancestor and most-specific mount verification. |
| `/mnt/d` returns success from file `fsync` | Treat only as deny evidence; it cannot satisfy durability. |
| Source changes between Windows hashing and Linux materialization | Reject on fd-bound byte/hash or identity mismatch; issue a new manifest and audit. |
| Recursive copy brings `.git`, `.env*`, `node_modules`, private results, or secrets | Recursive copy is forbidden. Materialize only exact allowlisted regular files into an empty ext4 root and reject extras. |
| Windows native packages or bundles are reused on Linux | Reject. A later authorized `npm ci` and freeze must be Linux-native and independently audited. |
| WSL Node happens to run the bundle but differs from production | Reject. Successful execution is not parity evidence. Exact deployment/runtime parity remains a blocker. |
| Windows and ext4 ledgers both accept writes | Reject as split brain. Authority moves one way through a durable ext4 acceptance record; Windows thereafter is an immutable origin or mirror. |
| Crash during authority migration | Absence of the durable ext4 acceptance record leaves origin authority intact; presence makes ext4 sole authority. Partial ext4 state is quarantined. |
| Two operators start simultaneously | The second process must fail on a nonblocking kernel `flock` before ledger read, reservation, or network. |
| Crash after reservation but before send | Resume only if no durable dispatch-intent exists and the same authority epoch and lock are held. |
| Crash after durable dispatch-intent with no response | Count the opportunity as sent-or-unknown, never replay, and settle conservatively or manually. |
| Settlement commit is unknown | Reconcile only from ext4 journal and ledger evidence; never call the provider again. |
| Windows public export is missing or corrupt | Re-export from the retained ext4 content-addressed bundle. It cannot alter settlement or authorize replay. |
| Graceful WSL restart test passes | Record only lifecycle persistence evidence; do not claim host power-loss proof. |
| Private ingress is absent | Block. A public source closure cannot substitute for the private compiler input. |

## Out of scope and still blocked

This package does not install dependencies, copy source files, read a credential, read a private artifact, migrate or read the budget ledger, build bundles, restart WSL, call metadata endpoints, call a provider, or generate a candidate. Production Node/runtime parity, complete compiler closure materialization, private ingress, single-ledger migration, crash tests, and a fresh authorization audit are intentionally unresolved.
