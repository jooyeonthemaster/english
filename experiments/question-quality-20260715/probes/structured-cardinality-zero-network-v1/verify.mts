import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const repoRoot = process.cwd();

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const probePath = path.join(here, "probe.mts");
const resultPath = path.join(here, "RESULT.json");
const schemaPath = path.join(repoRoot, "src/lib/question-ai-schemas-mc.ts");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const manifestPath = path.join(here, "MANIFEST.sha256");

const [probeBytes, resultBytes, schemaBytes] = await Promise.all([
  readFile(probePath),
  readFile(resultPath, "utf8"),
  readFile(schemaPath),
]);
const frozen = JSON.parse(resultBytes) as Record<string, unknown>;
assert.equal(frozen.probeSha256, sha256(probeBytes));
assert.equal(frozen.currentSchemaSourceSha256, sha256(schemaBytes));

const raw = execFileSync(process.execPath, [tsxCli, probePath], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, NODE_OPTIONS: "" },
});
const replay = JSON.parse(raw) as Record<string, unknown>;
assert.deepEqual({ ...replay, probeSha256: sha256(probeBytes) }, frozen);

const manifest = await readFile(manifestPath, "utf8");
for (const line of manifest.trim().split(/\r?\n/)) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  assert(match, `invalid manifest line: ${line}`);
  const [, expected, relative] = match;
  assert.equal(sha256(await readFile(path.join(here, relative))), expected);
}

process.stdout.write("PASS structured-cardinality zero-network v1\n");
