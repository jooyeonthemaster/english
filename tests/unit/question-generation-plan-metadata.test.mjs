import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import plans from "@/lib/question-generation-plans";
import typeSettings from "@/lib/question-type-generation-settings";

const {
  QUESTION_GENERATION_PLANS,
  getQuestionGenerationCreditCost,
  getQuestionGenerationPlanFromTags,
  getVisibleQuestionTags,
  mergeQuestionGenerationPlanTag,
  sanitizeAiModelDisclosureText,
  withQuestionGenerationPlanMetadata,
} = plans;

const {
  getEffectiveQuestionTypeDifficulty,
  getEffectiveQuestionTypeGenerationPlan,
  getQuestionTypeGenerationCreditCost,
  readQuestionTypeDifficultySetting,
  readQuestionTypeGenerationPlanSetting,
} = typeSettings;

const premiumTags = mergeQuestionGenerationPlanTag(
  ["Claude Sonnet 4.6", "빈칸 추론", "프리미엄 생성"],
  "PREMIUM",
);

const enriched = withQuestionGenerationPlanMetadata(
  {
    questionText: "Choose the best answer.",
    tags: ["Gemini 3.5 Flash", "어법", "Claude"],
  },
  "PREMIUM",
);

console.log(JSON.stringify({
  standardCost: getQuestionGenerationCreditCost(7, "STANDARD"),
  premiumCost: getQuestionGenerationCreditCost(7, "PREMIUM"),
  premiumTags,
  premiumPlanFromTags: getQuestionGenerationPlanFromTags(premiumTags),
  visibleTags: getVisibleQuestionTags(enriched.tags),
  enrichedPlan: enriched._generationPlan,
  enrichedTags: enriched.tags,
  planConfigs: QUESTION_GENERATION_PLANS,
  sanitized: sanitizeAiModelDisclosureText("Claude Sonnet 4.6 and Gemini 3.5 Flash generated this."),
  directTypePlan: readQuestionTypeGenerationPlanSetting({ generationPlan: "PREMIUM" }, "STANDARD"),
  directTypeDifficulty: readQuestionTypeDifficultySetting({ difficulty: "KILLER" }, "BASIC"),
  inheritedTypePlan: getEffectiveQuestionTypeGenerationPlan(
    { BLANK_INFERENCE: { generationPlan: "PREMIUM" } },
    "GRAMMAR_ERROR",
    "STANDARD",
  ),
  mappedTypePlan: getEffectiveQuestionTypeGenerationPlan(
    { BLANK_INFERENCE: { generationPlan: "PREMIUM" } },
    "BLANK_INFERENCE",
    "STANDARD",
  ),
  mappedTypeDifficulty: getEffectiveQuestionTypeDifficulty(
    { BLANK_INFERENCE: { difficulty: "KILLER" } },
    "BLANK_INFERENCE",
    "BASIC",
  ),
  mappedTypeCreditCost: getQuestionTypeGenerationCreditCost(
    7,
    { BLANK_INFERENCE: { generationPlan: "PREMIUM" } },
    "BLANK_INFERENCE",
    "STANDARD",
  ),
}));
`;

test("question generation plan metadata preserves premium pricing and tags", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".question-generation-plan-metadata-harness.mts");

  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const result = JSON.parse(raw);

    assert.equal(result.standardCost, 7);
    assert.equal(result.premiumCost, 14);
    assert.deepEqual(result.premiumTags, ["프리미엄 생성", "빈칸 추론"]);
    assert.equal(result.premiumPlanFromTags, "PREMIUM");
    assert.equal(result.enrichedPlan, "PREMIUM");
    assert.deepEqual(result.enrichedTags, ["프리미엄 생성", "어법"]);
    assert.deepEqual(result.visibleTags, ["어법"]);
    assert.equal("modelLabel" in result.planConfigs.STANDARD, false);
    assert.equal("modelLabel" in result.planConfigs.PREMIUM, false);
    assert.doesNotMatch(
      `${result.planConfigs.STANDARD.description} ${result.planConfigs.PREMIUM.description}`,
      /gemini|claude|sonnet/i,
    );
    assert.equal(result.sanitized, "AI and AI generated this.");
    assert.equal(result.directTypePlan, "PREMIUM");
    assert.equal(result.directTypeDifficulty, "KILLER");
    assert.equal(result.inheritedTypePlan, "STANDARD");
    assert.equal(result.mappedTypePlan, "PREMIUM");
    assert.equal(result.mappedTypeDifficulty, "KILLER");
    assert.equal(result.mappedTypeCreditCost, 14);
  } finally {
    rmSync(harnessPath, { force: true });
  }
});

function source(relPath) {
  return readFileSync(path.join(repoRoot, relPath), "utf8");
}

test("premium generation plan is wired through generation and review surfaces", () => {
  const expectations = [
    [
      "src/app/api/ai/generate-question/route.ts",
      [
        "readQuestionTypeGenerationPlanSetting(",
        "readQuestionTypeDifficultySetting(",
        "getQuestionGenerationCreditCost(CREDIT_COSTS[operationType], generationPlan)",
        "withQuestionGenerationPlanMetadata(question, generationPlan)",
      ],
    ],
    [
      "src/app/api/ai/generate-questions-auto/route.ts",
      [
        "const generationPlan = normalizeQuestionGenerationPlan(rawGenerationPlan);",
        "getQuestionGenerationCreditCost(",
        "withQuestionGenerationPlanMetadata(question, generationPlan)",
      ],
    ],
    [
      "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
      [
        "const effectiveGenerationPlan =",
        "readQuestionTypeGenerationPlanSetting(",
        "readQuestionTypeDifficultySetting(",
        "getQuestionGenerationCreditCost(",
        "mergeQuestionGenerationPlanTag(",
        "question._generationPlan ?? effectiveGenerationPlan",
        "_generationPlan: questionPlan",
      ],
    ],
    [
      "src/trigger/workbench-question-generation.ts",
      [
        "const effectiveGenerationPlan =",
        "readQuestionTypeGenerationPlanSetting(",
        "readQuestionTypeDifficultySetting(",
        "getQuestionGenerationCreditCost(",
        "mergeQuestionGenerationPlanTag(",
        "question._generationPlan ?? effectiveGenerationPlan",
        "_generationPlan: questionPlan",
      ],
    ],
    [
      "src/app/(director)/director/workbench/generate/generation-config-panel.tsx",
      [
        "getTypeDifficulty(typeId)",
        "getTypeGenerationPlan(typeId)",
        "setTypeGenerationPlan(typeId, next)",
        "GenerationPlanSelector",
      ],
    ],
    [
      "src/components/workbench/passage-detail/exam-points-editor.tsx",
      [
        "GenerationPlanSelector",
        "generationPlan,",
        "generationPlan={generationPlan}",
      ],
    ],
    [
      "src/components/workbench/passage-detail/exam-points/actions.ts",
      [
        "generationPlan,",
        "mergeQuestionGenerationPlanTag(readQuestionTags(q.tags), plan)",
        "structuredData: q._typeId ? { ...q, _generationPlan: plan, tags } : undefined",
      ],
    ],
    [
      "src/actions/workbench/questions.ts",
      [
        "enrichGeneratedQuestionPlanMetadata(q)",
        "mergeQuestionGenerationPlanTag(incomingTags, plan)",
        "tags: updateTags !== undefined ? JSON.stringify(updateTags) : undefined",
      ],
    ],
    [
      "src/components/admin/admin-questions-client.tsx",
      [
        "getQuestionGenerationPlanFromTags(",
        "QUESTION_GENERATION_PLAN_TAGS[generationPlan]",
      ],
    ],
    [
      "src/components/admin/admin-passage-detail/readonly-question-card.tsx",
      [
        "getQuestionGenerationPlanFromTags(",
        "QUESTION_GENERATION_PLAN_TAGS[generationPlan]",
      ],
    ],
  ];

  for (const [relPath, needles] of expectations) {
    const text = source(relPath);
    for (const needle of needles) {
      assert.ok(
        text.includes(needle),
        `${relPath} should include ${JSON.stringify(needle)}`,
      );
    }
  }
});
