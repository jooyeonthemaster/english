import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { manifestBytes, paths, publicArtifactBytes, sha256 } from "./core.mts";

const write = process.argv.includes("--write");
const publicBytes = publicArtifactBytes();

if (write) {
  writeFileSync(paths.publicCorpus, publicBytes, "utf8");
  writeFileSync(paths.manifest, manifestBytes(publicBytes), "utf8");
} else {
  assert(existsSync(paths.publicCorpus), "missing corpus-public.json; run with --write");
  assert(existsSync(paths.manifest), "missing MANIFEST.sha256; run with --write");
  assert.equal(readFileSync(paths.publicCorpus, "utf8"), publicBytes, "public artifact drift");
  assert.equal(readFileSync(paths.manifest, "utf8"), manifestBytes(publicBytes), "manifest drift");
}

console.log(
  JSON.stringify(
    {
      status: write ? "WROTE" : "PASS",
      publicArtifactSha256: sha256(publicBytes),
      manifestSha256: sha256(manifestBytes(publicBytes)),
      apiCalls: 0,
      networkCalls: 0,
    },
    null,
    2,
  ),
);
