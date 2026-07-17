import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const files = [
  "experiments/question-quality-20260715/reviews/deterministic-structural-remediation-v9/REMEDIATION.md",
  "experiments/question-quality-20260715/reviews/deterministic-structural-remediation-v9/replay.mts",
  "experiments/question-quality-20260715/reviews/deterministic-structural-remediation-v9/verify.mjs",
  "experiments/question-quality-20260715/reviews/deterministic-structural-remediation-v9/finalize-manifest.mjs",
  "experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v9/cases.json",
  "experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v9/PRE_INSPECTION_MANIFEST.json",
  "experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v9-independent-adjudication/adjudications.private.json",
  "experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v9-independent-adjudication/MANIFEST.json",
  "src/lib/question-quality/validators/summary/mc.ts",
  "src/lib/question-quality/validators/grammar/shared.ts",
  "src/lib/question-quality/validators/sentence-order.ts",
  "tests/unit/summary-mc-direction-split.test.mjs",
  "tests/unit/grammar-keypoint-core10.test.mjs",
  "tests/unit/sentence-order-quality.test.mjs",
  "tests/unit/grammar-generation-quality.test.mjs",
];

const lines = files.map((relativePath) => {
  const hash = createHash("sha256")
    .update(readFileSync(path.join(repoRoot, relativePath)))
    .digest("hex");
  return `${hash}  ${relativePath}`;
});
writeFileSync(path.join(here, "MANIFEST.sha256"), `${lines.join("\n")}\n`, "utf8");
