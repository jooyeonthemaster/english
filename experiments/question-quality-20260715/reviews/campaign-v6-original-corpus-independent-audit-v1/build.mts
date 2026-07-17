import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { manifestBytes, paths, publicAuditBytes, sha256 } from "./core.mts";

const write = process.argv.includes("--write");
const publicBytes = publicAuditBytes();
const manifest = manifestBytes(publicBytes);

if (write) {
  writeFileSync(paths.publicAudit, publicBytes, "utf8");
  writeFileSync(paths.manifest, manifest, "utf8");
} else {
  assert(existsSync(paths.publicAudit), "missing audit-public.json; run with --write");
  assert(existsSync(paths.manifest), "missing MANIFEST.sha256; run with --write");
  assert.equal(readFileSync(paths.publicAudit, "utf8"), publicBytes, "public audit drift");
  assert.equal(readFileSync(paths.manifest, "utf8"), manifest, "audit manifest drift");
}

console.log(
  JSON.stringify(
    {
      status: write ? "WROTE" : "PASS",
      verdict:
        "BLOCK_UNCONDITIONAL_S1_V6_ADMISSION_PENDING_TEXT_METADATA_DIFFICULTY_AND_BLANK_POSITION_REMEDIATION",
      publicAuditSha256: sha256(publicBytes),
      manifestSha256: sha256(manifest),
      candidateApiCalls: 0,
      networkCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
    },
    null,
    2,
  ),
);
