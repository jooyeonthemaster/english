import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const files = [
  "experiments/question-quality-20260715/reviews/deterministic-v8-structural-remediation/AUDIT.md",
  "experiments/question-quality-20260715/reviews/deterministic-v8-structural-remediation/replay.mts",
  "experiments/question-quality-20260715/reviews/deterministic-v8-structural-remediation/verify.mjs",
  "experiments/question-quality-20260715/reviews/deterministic-v8-structural-remediation/finalize-manifest.mjs",
  "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v8/cases.json",
  "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v8/blind-seal.json",
  "src/lib/question-quality/validators/summary/mc.ts",
  "src/lib/question-quality/validators/grammar/shared.ts",
  "src/lib/question-quality/validators/sentence-order.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
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

