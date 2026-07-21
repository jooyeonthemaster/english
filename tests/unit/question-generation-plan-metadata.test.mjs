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

test("question generation plan metadata unifies pricing and preserves tags", () => {
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
    // 이원 요금 v2(26-07-22 사용자 확정): PREMIUM = 2배 부활(O213 3.6 프리미엄).
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
    // 이원 요금 v2: 유형 설정이 PREMIUM 이면 유형별 단가도 2배를 따른다.
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
        // 단일 상품(26-07-21): 결정 함수 단일 소스. 저장 스탬프는 엔진의 문항별
        // _generationPlan 을 우선한다(KO 동결 정합).
        "resolveEffectiveGenerationPlan(",
        "readQuestionTypeDifficultySetting(",
        "getQuestionGenerationCreditCost(CREDIT_COSTS[operationType], generationPlan)",
        "withQuestionGenerationPlanMetadata(",
      ],
    ],
    [
      "src/app/api/ai/generate-questions-auto/route.ts",
      [
        "const generationPlan = normalizeQuestionGenerationPlan(rawGenerationPlan);",
        "getQuestionGenerationCreditCost(",
        // 엔진의 문항별 스탬프 우선(KO 동결 정합) — 26-07-20.
        "withQuestionGenerationPlanMetadata(",
        "._generationPlan ??",
      ],
    ],
    [
      "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
      [
        // 단일 상품(26-07-21): 결정 함수 단일 소스.
        "resolveEffectiveGenerationPlan(",
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
        // 단일 상품(26-07-21): 결정 함수 단일 소스.
        "resolveEffectiveGenerationPlan(",
        "readQuestionTypeDifficultySetting(",
        "getQuestionGenerationCreditCost(",
        "mergeQuestionGenerationPlanTag(",
        "question._generationPlan ?? effectiveGenerationPlan",
        "_generationPlan: questionPlan",
      ],
    ],
    [
      // 패널은 유형별 난이도 UI를 추출 파트(type-numeric-detail)로 위임한다.
      // (상품 단일화 T1: 유형별 생성플랜 선택 UI 는 더 이상 노출하지 않는다.)
      "src/app/(director)/director/workbench/generate/generation-config-panel.tsx",
      [
        "TypeNumericDetail.renderPerTypeDifficultyImpl(",
        "TypeNumericDetail.renderTypeDetailContentImpl(",
      ],
    ],
    [
      // 추출 파트가 유형별 난이도 읽기/쓰기를 실제로 구현한다. 생성플랜 선택 UI 는
      // T1 에서 제거됐으므로 여기서 readQuestionTypeGenerationPlanSetting 호출을
      // 가드하지 않는다(서버측 읽기 로직은 아래 shared.ts 엔트리로 별도 가드).
      "src/app/(director)/director/workbench/generate/generation-config-panel-parts/type-numeric-detail.tsx",
      [
        // @ts-nocheck 제거(2라운드)로 읽기가 형상 좁힘 캐스트를 경유하지만
        // 의미는 동일: typeId 인덱싱 + ?.difficulty 옵셔널 읽기 + 패치 쓰기.
        "questionTypeSettings[typeId]",
        ")?.difficulty",
        "patchTypeSettings(typeId, { difficulty:",
      ],
    ],
    [
      // 상품 단일화로 유형별 생성플랜 선택 UI 는 사라졌지만, 서버측 우선순위
      // 읽기 로직(questionTypeSettings[typeId].generationPlan → 전역 fallback)은
      // 그대로 보존되어야 한다(생성 경로 서버 호환). 이 가드가 그 의도를 지킨다.
      "src/lib/question-type-generation-settings/shared.ts",
      [
        "export function readQuestionTypeGenerationPlanSetting(",
      ],
    ],
    [
      // 상품 단일화 T1: 포인트 짚어주기 출제 UI 도 생성플랜 선택기(GenerationPlanSelector)
      // 를 노출하지 않는다. 플랜은 STANDARD 고정으로 서버 액션·결과 표시에 계속 전달된다.
      "src/components/workbench/passage-detail/exam-points-editor.tsx",
      [
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
