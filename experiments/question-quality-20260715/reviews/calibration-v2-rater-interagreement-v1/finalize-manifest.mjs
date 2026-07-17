import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const relativeRoot = "experiments/question-quality-20260715/reviews/calibration-v2-rater-interagreement-v1";
const names = [
  "README.md",
  "build.mjs",
  "finalize-manifest.mjs",
  "private/.gitignore",
  "report.json",
  "verify-score-bindings.mts",
  "verify.mjs",
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rows = names.map((name) => {
  const relative = `${relativeRoot}/${name}`;
  return `${sha(readFileSync(path.join(repoRoot, relative)))}  ${relative}`;
});
writeFileSync(path.join(here, "MANIFEST.sha256"), `${rows.join("\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ manifestRows: rows.length, manifestSha256: sha(`${rows.join("\n")}\n`) }, null, 2)}\n`);
