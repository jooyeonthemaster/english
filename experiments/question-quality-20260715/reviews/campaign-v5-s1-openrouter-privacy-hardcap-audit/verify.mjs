import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const result = readJson(join(here, "audit-result.json"));
const sources = readJson(join(here, "source-evidence.json"));

assert.equal(
  result.verdict,
  "BLOCK_EXECUTION_ACCOUNT_PRIVACY_PROVIDER_ALLOWLIST_AND_PROVIDER_HARD_CAP_UNPROVEN",
);
assert.equal(result.authorization.campaignEligibleAssignments, 0);
assert.equal(result.authorization.generationAuthorized, false);
assert.equal(result.authorization.apiCandidateCount, 0);
assert.equal(result.safety.modelApiCalls, 0);
assert.equal(result.safety.generationApiCalls, 0);
assert.equal(result.safety.executionPriceSnapshotCreated, false);
assert.equal(result.safety.credentialValuesRead, 0);
assert.equal(result.hardCapAssessment.frozenReservationUsd, 44.16);
assert.equal(result.hardCapAssessment.providerSideHardMaximumCertified, false);
assert.equal(result.accountSpecificEvidence.signedInBrowserAvailable, false);
assert.equal(result.accountSpecificEvidence.authenticatedAccountRequests, 0);

assert.equal(result.frozenWire.assignments, 180);
assert.equal(result.frozenWire.allRequireParameters, true);
for (const key of [
  "rowContractsWithZdr",
  "rowContractsWithDataCollection",
  "rowContractsWithProviderOnly",
  "rowContractsWithProviderOrder",
  "rowContractsWithAllowFallbacks",
  "generationAuthorizedRows",
]) {
  assert.equal(result.frozenWire[key], 0, key);
}

for (const source of sources.sources) {
  assert.equal(source.status, 200, source.url);
  assert.match(source.sha256, /^[0-9a-f]{64}$/);
  assert.ok(source.bytes > 0);
  assert.match(source.url, /^https:\/\/openrouter\.ai\//);
}
assert.equal(sources.zdrEndpointPreview.status, 200);
assert.equal(sources.zdrEndpointPreview.exactTargetRows, 6);
assert.equal(sources.zdrEndpointPreview.executionPriceSnapshot, false);
assert.equal(sources.zdrEndpointPreview.pricingValuesExtracted, false);
assert.equal(sources.zdrEndpointPreview.pricingValuesPersisted, false);
assert.ok(!Object.hasOwn(sources.zdrEndpointPreview, "pricing"));
assert.deepEqual(sources.zdrEndpointPreview.targetModelsFound.sort(), [
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.5-flash",
]);
const premium = sources.zdrEndpointPreview.rows.filter(
  (row) => row.modelId === "google/gemini-3.1-pro-preview",
);
const standard = sources.zdrEndpointPreview.rows.filter(
  (row) => row.modelId === "google/gemini-3.5-flash",
);
assert.equal(premium.length, 3);
assert.equal(standard.length, 3);
assert.ok(premium.every((row) => row.status === -2));
assert.ok(standard.every((row) => row.status === 0));
assert.ok(
  sources.zdrEndpointPreview.rows.every(
    (row) => row.providerName === "Google" && row.tag.startsWith("google-vertex/"),
  ),
);

for (const evidence of result.localEvidence) {
  const path = join(root, evidence.path);
  const bytes = readFileSync(path);
  assert.equal(bytes.length, evidence.bytes, evidence.path);
  assert.equal(sha256(bytes), evidence.sha256, evidence.path);
}

const queuePath = join(
  root,
  "experiments/question-quality-20260715/design/campaign-v5-s1/private/s1-queue-v5.json",
);
const queue = readJson(queuePath);
assert.equal(queue.campaignEligibleAssignments, 0);
assert.equal(queue.generationAuthorized, false);
assert.equal(queue.assignments.length, 180);
assert.ok(queue.assignments.every((row) => row.generationAuthorized === false));
assert.ok(
  queue.assignments.every((row) => row.wireContract.providerRequireParameters === true),
);
for (const key of [
  "zdr",
  "dataCollection",
  "providerOnly",
  "providerOrder",
  "allowFallbacks",
]) {
  assert.ok(
    queue.assignments.every((row) => !Object.hasOwn(row.wireContract, key)),
    key,
  );
}

const envText = readFileSync(join(root, ".env.local"), "utf8");
const envNames = new Set(
  envText
    .split(/\r?\n/u)
    .map((line) => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u)?.[1])
    .filter(Boolean),
);
for (const name of result.localConfiguration.envLocalPresentNames) {
  assert.ok(envNames.has(name), `expected env name present: ${name}`);
}
for (const name of result.localConfiguration.envLocalAbsentNames) {
  assert.ok(!envNames.has(name), `expected env name absent: ${name}`);
}

const artifactFiles = readdirSync(here)
  .filter((name) => statSync(join(here, name)).isFile())
  .filter((name) => name !== "MANIFEST.sha256");
const artifactText = artifactFiles
  .map((name) => readFileSync(join(here, name), "utf8"))
  .join("\n");
assert.doesNotMatch(artifactText, /sk-or-v1-[a-z0-9]{16,}/iu);
assert.doesNotMatch(artifactText, /AIza[0-9A-Za-z_-]{20,}/u);
assert.doesNotMatch(artifactText, /OPENROUTER_API_KEY\s*=\s*[^<\s]/u);
assert.doesNotMatch(artifactText, /"pricing"\s*:/u);

const manifestLines = readFileSync(join(here, "MANIFEST.sha256"), "utf8")
  .trim()
  .split(/\r?\n/u);
for (const line of manifestLines) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/u);
  assert.ok(match, `invalid manifest line: ${line}`);
  const [, expected, name] = match;
  const path = join(here, name);
  assert.equal(sha256(readFileSync(path)), expected, name);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      verdict: result.verdict,
      offline: true,
      modelApiCalls: 0,
      generationAuthorized: false,
      checkedLocalEvidence: result.localEvidence.length,
      checkedPublicSourceSeals: sources.sources.length + 1,
      checkedManifestFiles: manifestLines.length,
      root: relative(process.cwd(), root) || ".",
    },
    null,
    2,
  ),
);
