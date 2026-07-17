import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const ladderSource = readFileSync(
  path.join(
    repoRoot,
    "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts",
  ),
  "utf8",
);

test("PREMIUM grammar ladder never hard-codes a Gemini reasoning-on fallback", () => {
  assert.doesNotMatch(ladderSource, /reasoning_effort\s*:\s*["'](?:low|medium|high)["']/i);
  assert.doesNotMatch(ladderSource, /reasoning-fallback/i);
});
