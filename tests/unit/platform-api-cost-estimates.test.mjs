import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const tempDir = path.join(repoRoot, ".tmp", "platform-api-cost-estimates");
const harnessPath = path.join(tempDir, "harness.ts");

const harness = `
import { resolveEstimatedPricing } from "@/lib/platform-api-cost-estimates";

process.stdout.write(JSON.stringify({
  flash: resolveEstimatedPricing("OPENROUTER", "TOKENS", "google/gemini-3.5-flash", 20_000),
  proSmall: resolveEstimatedPricing("OPENROUTER", "TOKENS", "google/gemini-3.1-pro-preview", 20_000),
  proLarge: resolveEstimatedPricing("OPENROUTER", "TOKENS", "google/gemini-3.1-pro-preview", 200_000),
  directPro: resolveEstimatedPricing("GOOGLE_GEMINI", "TOKENS", "gemini-3.1-pro-preview", 20_000),
  lite: resolveEstimatedPricing("OPENROUTER", "TOKENS", "google/gemini-3.1-flash-lite", 20_000),
}));
`;

test("Gemini Pro fallback pricing is not silently estimated as Flash", () => {
  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(harnessPath, harness, "utf8");
  try {
    const output = execFileSync(process.execPath, ["--import", "tsx", harnessPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const result = JSON.parse(output);
    assert.deepEqual(result.flash, {
      inputUsdPer1M: 1.5,
      outputUsdPer1M: 9,
      unitUsd: null,
    });
    assert.deepEqual(result.proSmall, {
      inputUsdPer1M: 2,
      outputUsdPer1M: 12,
      unitUsd: null,
    });
    assert.deepEqual(result.proLarge, {
      inputUsdPer1M: 4,
      outputUsdPer1M: 18,
      unitUsd: null,
    });
    assert.deepEqual(result.directPro, result.proSmall);
    assert.deepEqual(result.lite, {
      inputUsdPer1M: 0.25,
      outputUsdPer1M: 1.5,
      unitUsd: null,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
