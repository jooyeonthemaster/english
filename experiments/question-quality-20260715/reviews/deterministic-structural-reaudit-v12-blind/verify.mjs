import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name));
const json = (name) => JSON.parse(read(name).toString("utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifest = json("manifest.json");

for (const [name, expected] of Object.entries(manifest.files)) {
  const bytes = read(name);
  assert.equal(bytes.length, expected.bytes, `${name}: byte count`);
  assert.equal(sha256(bytes), expected.sha256, `${name}: sha256`);
  assert.equal(statSync(join(here, name)).size, expected.bytes, `${name}: stat size`);
}

const corpus = json("corpus.json");
const oracle = json("oracle.json");
const seal = json("seal.json");
const results = json("results.json");
assert.equal(sha256(read("corpus.json")), seal.corpusSha256);
assert.equal(sha256(read("oracle.json")), seal.oracleSha256);
assert.equal(manifest.corpusSha256, seal.corpusSha256);
assert.equal(manifest.oracleSha256, seal.oracleSha256);
assert.equal(corpus.cases.length, 384);
assert.equal(oracle.cases.length, 384);
assert.equal(seal.familyCount, 64);
assert.equal(new Set(corpus.cases.map((item) => item.id)).size, 384);
assert.equal(new Set(oracle.cases.map((item) => item.id)).size, 384);
assert.deepEqual(new Set(corpus.cases.map((item) => item.id)), new Set(oracle.cases.map((item) => item.id)));
assert.equal(results.sealedInputs.corpusSha256, seal.corpusSha256);
assert.equal(results.sealedInputs.oracleSha256, seal.oracleSha256);
assert.equal(results.targetExactness.tp, 192);
assert.equal(results.targetExactness.tn, 192);
assert.equal(results.targetExactness.fp, 0);
assert.equal(results.targetExactness.fn, 0);
assert.equal(results.sourceAwareControlValidity.validCount, 192);
assert.equal(results.sourceAwareControlValidity.invalidCount, 0);
assert.equal(results.productionBlocking.tp, 138);
assert.equal(results.productionBlocking.tn, 195);
assert.equal(results.productionBlocking.fp, 0);
assert.equal(results.productionBlocking.fn, 51);
assert.equal(results.targetPolicy.policyGapTargetCount, 17);
assert.deepEqual(results.targetPolicy.acceptedNonblockingTargets, ["blank-target-list-like"]);
assert.equal(results.verdict, "PARTIAL");
assert.equal(manifest.verdict, "PARTIAL");
console.log(`VERIFY PASS files=${Object.keys(manifest.files).length} cases=${corpus.cases.length} target=384/384 policyFN=${results.productionBlocking.fn}`);
