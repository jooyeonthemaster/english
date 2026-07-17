import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileSha256 = (filePath) => sha256(readFileSync(filePath));
const result = JSON.parse(readFileSync(path.join(here, "audit-result.json"), "utf8"));

assert.equal(
  result.verdict,
  "BLOCK_NOT_A_DEDICATED_ZERO_USAGE_HARD_CAPPED_S1_CREDENTIAL",
);
assert.equal(result.authorization.generationAuthorized, false);
assert.equal(result.authorization.apiCandidateCount, 0);
assert.equal(result.safety.metadataRequests, 1);
assert.equal(result.safety.modelRequests, 0);
assert.equal(result.safety.generationRequests, 0);
assert.equal(result.safety.accountMutations, 0);
assert.equal(result.safety.credentialValuesPrinted, 0);
assert.equal(result.safety.credentialValuesPersisted, 0);
assert.equal(
  result.credentialAttestation.providerNoOverrunSemanticsPubliclyDocumented,
  false,
);
assert.equal(result.credentialAttestation.plaintextCredentialPersisted, false);
assert.equal(result.credentialAttestation.credentialHashPersisted, false);
assert.equal(result.credentialAttestation.credentialLabelPersisted, false);

const publicRelease = [
  readFileSync(path.join(here, "README.md"), "utf8"),
  readFileSync(path.join(here, "audit-result.json"), "utf8"),
  readFileSync(path.join(here, "MANIFEST.sha256"), "utf8"),
].join("\n");
assert.equal(/sk-or-v1-[A-Za-z0-9_-]+/u.test(publicRelease), false);
assert.equal(/authorization\s*:\s*bearer/iu.test(publicRelease), false);

const lines = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8")
  .trim()
  .split(/\r?\n/u);
assert.equal(lines.length, 4);
for (const line of lines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match);
  assert.equal(fileSha256(path.join(here, match[2])), match[1]);
}

process.stdout.write(
  `${JSON.stringify({
    verdict: "PASS_SEALED_READ_ONLY_METADATA_AUDIT_EXECUTION_BLOCKED",
    sourceVerdict: result.verdict,
    generationRequests: result.safety.generationRequests,
    credentialValuesPersisted: result.safety.credentialValuesPersisted,
    artifactSha256: fileSha256(path.join(here, "audit-result.json")),
    manifestSha256: fileSha256(path.join(here, "MANIFEST.sha256")),
  }, null, 2)}\n`,
);
