import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const tmpDir = path.join(repoRoot, ".tmp-atlas-ai-tests");
let harnessId = 0;

function runAtlasHarness(source, env = {}) {
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, `harness-${process.pid}-${harnessId++}.ts`);
  writeFileSync(harnessPath, source, "utf8");
  try {
    return JSON.parse(
      execSync(`npx tsx "${harnessPath}"`, {
        cwd: repoRoot,
        env: {
          ...process.env,
          OPENROUTER_GEMINI_REASONING_EFFORT: "",
          ATLASCLOUD_GEMINI_REASONING_EFFORT: "",
          OPENROUTER_REASONING_EFFORT: "",
          ATLASCLOUD_REASONING_EFFORT: "",
          ...env,
        },
        encoding: "utf8",
      }),
    );
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

test("Atlas Gemini requests disable OpenRouter reasoning by default", () => {
  const result = runAtlasHarness(`
    import { atlasReasoningRequestFor } from "@/lib/atlas-ai";
    process.stdout.write(JSON.stringify(atlasReasoningRequestFor("google/gemini-3.5-flash")));
  `);

  assert.deepEqual(result, {
    reasoning: {
      enabled: false,
      effort: "none",
      exclude: true,
    },
  });
});

test("Atlas Gemini requests use reasoning map instead of reasoning_effort", () => {
  const result = runAtlasHarness(`
    import { atlasReasoningRequestFor } from "@/lib/atlas-ai";
    process.stdout.write(JSON.stringify(atlasReasoningRequestFor("gemini-3.5-flash", undefined, "none")));
  `);

  assert.equal("reasoning_effort" in result, false, JSON.stringify(result));
  assert.equal(result.reasoning.enabled, false);
});

test("Atlas Gemini requests override SDK reasoning defaults to disabled", () => {
  const result = runAtlasHarness(`
    import { atlasReasoningRequestFor } from "@/lib/atlas-ai";
    process.stdout.write(JSON.stringify(atlasReasoningRequestFor("google/gemini-3.5-flash", { enabled: true, effort: "medium" })));
  `);

  assert.deepEqual(result, {
    reasoning: {
      enabled: false,
      effort: "none",
      exclude: true,
    },
  });
});

test("Atlas non-Gemini requests keep explicit reasoning_effort", () => {
  const result = runAtlasHarness(`
    import { atlasReasoningRequestFor } from "@/lib/atlas-ai";
    process.stdout.write(JSON.stringify(atlasReasoningRequestFor("anthropic/claude-sonnet-5", undefined, "low")));
  `);

  assert.deepEqual(result, { reasoning_effort: "low" });
});

test("Question generation treats OpenRouter credit exhaustion as non-retryable", () => {
  const result = runAtlasHarness(`
    import { isNonRetryableQuestionGenerationProviderError } from "@/lib/question-generation-llm";
    const error = new Error("This request requires more credits, or fewer max_tokens. You requested up to 20000 tokens, but can only afford 4198. To increase, visit https://openrouter.ai/settings/credits and add more credits");
    process.stdout.write(JSON.stringify(isNonRetryableQuestionGenerationProviderError(error)));
  `);

  assert.equal(result, true);
});
