import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { manifestBytes, paths, publicArtifactBytes, sha256 } from "./core.mts";

const write = process.argv.includes("--write");
const publicBytes = publicArtifactBytes();
const manifest = manifestBytes(publicBytes);

if (write) {
  writeFileSync(paths.publicArtifact, publicBytes, "utf8");
  writeFileSync(paths.manifest, manifest, "utf8");
} else {
  assert(existsSync(paths.publicArtifact), "missing remediation-public.json; run with --write");
  assert(existsSync(paths.manifest), "missing MANIFEST.sha256; run with --write");
  assert.equal(readFileSync(paths.publicArtifact, "utf8"), publicBytes, "public remediation drift");
  assert.equal(readFileSync(paths.manifest, "utf8"), manifest, "remediation manifest drift");
}

console.log(
  JSON.stringify(
    {
      status: write ? "WROTE" : "PASS",
      verdict:
        "PASS_REMEDIATED_CORPUS_QUALITY_AND_STRUCTURE_GATES_NOT_EXTERNAL_DISPATCH_AUTHORIZATION",
      publicArtifactSha256: sha256(publicBytes),
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
