import assert from "node:assert/strict";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  manifestBytes,
  paths,
  publicArtifactBytes,
  sha256,
} from "./core.mjs";

const publicBytes = publicArtifactBytes();
const manifest = manifestBytes(publicBytes);
if (process.argv.includes("--write")) {
  writeFileSync(paths.publicArtifact, publicBytes, "utf8");
  writeFileSync(paths.manifest, manifest, "utf8");
} else {
  assert(existsSync(paths.publicArtifact), "missing audit-public.json; run --write");
  assert(existsSync(paths.manifest), "missing MANIFEST.sha256; run --write");
  assert.equal(readFileSync(paths.publicArtifact, "utf8"), publicBytes, "public audit drift");
  assert.equal(readFileSync(paths.manifest, "utf8"), manifest, "audit manifest drift");
}

const publicArtifact = JSON.parse(publicBytes) as Record<string, unknown>;
process.stdout.write(`${JSON.stringify({
  verdict: publicArtifact.verdict,
  publicArtifactSha256: sha256(publicBytes),
  manifestSha256: sha256(manifest),
  apiCandidatesConsumed: 0,
}, null, 2)}\n`);

if (process.argv[1] && path.resolve(process.argv[1]) !== fileURLToPath(import.meta.url)) {
  throw new Error("build.mts must be invoked directly");
}
