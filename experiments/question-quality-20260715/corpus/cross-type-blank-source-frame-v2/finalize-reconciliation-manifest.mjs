import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const files = [
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/reconcile-and-split.mjs",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/verify-reconciliation.mjs",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/REVIEWER-RECONCILIATION-AUDIT.md",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/reviewer-reconciliation-summary.json",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/REVIEWER-A-MANIFEST.sha256",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/REVIEWER-B-MANIFEST.sha256",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/MANIFEST.sha256",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/POST-FREEZE-TYPECHECK-REMEDIATION.md",
];
const lines = files.map((relativePath) => {
  const hash = createHash("sha256")
    .update(readFileSync(path.join(repoRoot, relativePath)))
    .digest("hex");
  return `${hash}  ${relativePath}`;
});
writeFileSync(
  path.join(here, "RECONCILIATION-MANIFEST.sha256"),
  `${lines.join("\n")}\n`,
  "utf8",
);
