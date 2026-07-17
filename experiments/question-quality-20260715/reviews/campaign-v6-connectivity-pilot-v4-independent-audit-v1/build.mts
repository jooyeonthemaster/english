import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runIndependentAudit } from "./independent-audit.mts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const args = process.argv.slice(2);
assert(args.length === 1 && (args[0] === "--write" || args[0] === "--check"), "choose exactly one of --write or --check");
const authorGatesBytes = readFileSync(path.join(here, "author-gates.json"));
const authorGates = JSON.parse(authorGatesBytes.toString("utf8")) as Record<string, any>;
assert.equal(authorGates.verdict, "PASS");
const { evidence, report } = await runIndependentAudit();
report.authorGateReproduction = {
  artifactSha256: sha256(authorGatesBytes),
  verdict: authorGates.verdict,
  gates: authorGates.gates.map((gate: Record<string, any>) => ({ id: gate.id, exitCode: gate.exitCode })),
  usedAsVerdictAuthority: false,
};
const outputs = new Map([
  ["evidence.json", `${JSON.stringify(evidence, null, 2)}\n`],
  ["report.json", `${JSON.stringify(report, null, 2)}\n`],
]);
for (const [name, bytes] of outputs) {
  const absolute = path.join(here, name);
  if (args[0] === "--write") writeFileSync(absolute, bytes, "utf8");
  else assert.equal(readFileSync(absolute, "utf8"), bytes, `${name} differs from independently recomputed bytes`);
}
const manifestNames = [
  "author-gates.json",
  "build.mts",
  "evidence.json",
  "independent-audit.mts",
  "README.md",
  "report.json",
  "run-author-gates.mts",
  "tsconfig.json",
  "verify.mts",
] as const;
const reviewRelative = "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1";
const manifestBytes = `${manifestNames
  .map((name) => `${sha256(readFileSync(path.join(here, name)))}  ${reviewRelative}/${name}`)
  .join("\n")}\n`;
const manifestPath = path.join(here, "MANIFEST.sha256");
if (args[0] === "--write") writeFileSync(manifestPath, manifestBytes, "utf8");
else assert.equal(readFileSync(manifestPath, "utf8"), manifestBytes, "MANIFEST.sha256 differs from current review bytes");
process.stdout.write(`${JSON.stringify({ mode: args[0], verdict: report.verdict, evidenceSha256: sha256(outputs.get("evidence.json")!), reportSha256: sha256(outputs.get("report.json")!) }, null, 2)}\n`);
