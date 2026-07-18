import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

function tsFiles(directory: string): string[] {
  const absolute = join(root, directory);
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = join(directory, entry.name);
    return entry.isDirectory()
      ? tsFiles(relative)
      : entry.isFile() && /\.tsx?$/.test(entry.name)
        ? [relative]
        : [];
  });
}

test("both Workbench paths install the same job-scoped production budget", () => {
  const fast = read(
    "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  );
  const trigger = read("src/trigger/workbench-question-generation.ts");
  for (const [source, route] of [
    [fast, "FAST"],
    [trigger, "TRIGGER"],
  ] as const) {
    assert.match(source, /runWithQuestionGenerationAssignmentBudget\(/);
    assert.match(source, new RegExp(`route: "${route}"`));
    assert.match(source, /jobId:/);
    assert.match(source, /\(\) => runQuestionGenerationWithEmptyRetry\(/);
  }
});

test("the shared Atlas provider composes through the physical-call boundary", () => {
  const atlas = read("src/lib/atlas-ai.ts");
  // W2-A 가드 fetch 가 물리 콜 경계를 래핑한다 — 경계 합성(assignment fetch 경유)은
  // createAtlasModelCallGuardFetch(atlasProductionAssignmentFetch) 로 보존된다.
  assert.match(atlas, /fetch: atlasModelCallGuardFetch/);
  assert.match(
    atlas,
    /createAtlasModelCallGuardFetch\(\s*atlasProductionAssignmentFetch\s*,?\s*\)/,
  );
  assert.doesNotMatch(atlas, /fetch: atlasResearchFetch/);
});

test("enrolled engine sources contain no direct OpenRouter REST bypass", () => {
  const files = [
    "src/lib/question-generation-llm.ts",
    ...tsFiles("src/app/api/ai/generate-questions-auto/_lib"),
    "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
    "src/trigger/workbench-question-generation.ts",
  ];
  const bypasses = files.flatMap((file) => {
    const source = read(file);
    const reasons: string[] = [];
    if (source.includes("postAtlasChatCompletionAsGeminiLike")) {
      reasons.push("direct Atlas REST helper");
    }
    if (/globalThis\.fetch\s*\(/.test(source)) reasons.push("global fetch");
    if (/fetch\s*\(\s*[`'"]https:\/\/(?:openrouter|api\.atlas)/i.test(source)) {
      reasons.push("literal provider fetch");
    }
    return reasons.map((reason) => `${file}: ${reason}`);
  });
  assert.deepEqual(bypasses, []);
});

test("semantic budget drift cannot fail open and Trigger claims with a terminal-state CAS", () => {
  const runtime = read("src/lib/question-generation-assignment-budget.ts");
  const semanticRethrows = [
    ...runtime.matchAll(
      /if \(error instanceof QuestionGenerationAssignmentBudgetError\) \{\s*throw error;\s*\}/g,
    ),
  ];
  assert.ok(
    semanticRethrows.length >= 2,
    "enrollment and pre-fetch paths must both rethrow semantic budget errors",
  );

  const trigger = read("src/trigger/workbench-question-generation.ts");
  assert.match(trigger, /workbenchAiJob\.updateMany\(/);
  assert.match(trigger, /\{ status: "PENDING", triggerRunId: null \}/);
  assert.match(trigger, /\{ status: "PROCESSING", triggerRunId: ctx\.run\.id \}/);
  assert.match(trigger, /if \(claimed\.count !== 1\)/);
  assert.match(trigger, /ASSIGNMENT_BUDGET_REJECTED/);
});
