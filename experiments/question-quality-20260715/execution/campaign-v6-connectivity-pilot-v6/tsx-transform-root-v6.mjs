import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const lockPath = path.join(here, "tsx-transformer-lock-v6.json");

// Deliberately not listed inside the lock it roots: including this file there
// would create an unsatisfiable root-hash <-> lock-hash cycle. A fresh subject
// audit and the future S6 manifest pin this small plain-JavaScript root itself.
export const EXPECTED_TRANSFORMER_LOCK_BYTES_V6 = 4076;
export const EXPECTED_TRANSFORMER_LOCK_SHA256_V6 =
  "4c1d7ea0ac2d11a55eecbf3fec72a186eae8da41d4ee3366a58742b65d2b6958";

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function assertIndependentlyRootedTransformerLockV6() {
  const stat = lstatSync(lockPath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    comparable(realpathSync.native(lockPath)) !== comparable(lockPath)
  ) {
    throw new Error(
      "transformer lock is not the exact direct real root target",
    );
  }
  const bytes = readFileSync(lockPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    bytes.byteLength !== EXPECTED_TRANSFORMER_LOCK_BYTES_V6 ||
    sha256 !== EXPECTED_TRANSFORMER_LOCK_SHA256_V6
  ) {
    throw new Error(
      "transformer lock differs from the independent pre-transform root",
    );
  }
  return { bytes: bytes.byteLength, sha256 };
}
