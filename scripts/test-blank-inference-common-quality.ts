/**
 * Live quality loop for ordinary BLANK_INFERENCE mode.
 *
 * This exercises the same Gemini workbench pipeline with the negative
 * paraphrase setting disabled, so common BLANK_INFERENCE quality gates can be
 * checked separately from DOUBLE_NEGATIVE-specific rules.
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

import { runQuestionGenerationWithEmptyRetry } from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { validateQuestionQuality } from "../src/lib/question-quality";

const OUTDIR = path.join(process.cwd(), "scripts", "_gen_audit_out");
const RUNS_PER_PASSAGE = Math.max(1, Number(process.env.RUNS_PER_PASSAGE || 1));

const PASSAGES = [
  {
    id: "food-security",
    text: `The governments of virtually every country on the planet attach great importance to achieving food security and a wide variety of mechanisms have been developed to realize this goal. The first issue governments face in achieving national food security is the problem of ensuring that adequate amounts of food are available to the resident population. Some governments have set goals of food self-sufficiency, which means most if not all of the food available in a country comes from the domestic farming system. However, food security does not require food self-sufficiency because countries can import food items not easily produced within the country. Agricultural products are, after all, highly sensitive to climatic, soil and other conditions that tend to vary around the world. Even countries with extremely productive agricultural sectors are not fully self-sufficient in all food items. In general, the problem of assuring adequate food supplies is solved by relying on both domestic production and imports. A realistic food security policy for Korea should therefore distinguish between crops that require a stable domestic base and crops whose supplies must be secured through diversified import channels.`,
  },
  {
    id: "public-health",
    text: `Public health campaigns often fail when they treat information as the only missing ingredient. People may already know that exercise, sleep, and vaccination reduce risk, yet still fail to change their behavior. The problem is that health decisions are made inside routines, social pressures, and material constraints. A worker who understands the value of sleep may still be unable to sleep enough if night shifts constantly disrupt the body. Effective public health policy therefore does more than repeat facts; it changes the environments in which healthy choices become realistic.`,
  },
  {
    id: "ai-automation",
    text: `Automation is often described as a simple replacement of human labor by machines, but that picture is too narrow. New tools usually remove some tasks while creating new kinds of coordination, judgment, and oversight. A spreadsheet did not eliminate financial work; it changed what counted as valuable financial work. Similarly, artificial intelligence may handle routine drafting or classification, but people will still need to decide which goals matter and whether the results are appropriate. The central issue is not whether machines can perform tasks, but how human responsibility is reorganized around them.`,
  },
  {
    id: "urban-heat",
    text: `Cities are usually warmer than surrounding rural areas because concrete and asphalt absorb and release heat differently from soil and vegetation. This urban heat effect becomes dangerous during long heat waves, especially for people without access to cooling. Planting trees can help, but shade alone is not enough if housing quality, public cooling centers, and emergency communication are ignored. A serious heat policy must combine physical design with social protection. Otherwise, a city may look greener while remaining unsafe for the residents most exposed to heat.`,
  },
  {
    id: "memory-learning",
    text: `Many students treat memory as if it were strengthened only by repeated exposure. Re-reading notes may feel productive because the words become familiar, but familiarity is not the same as retrieval. Learning becomes more durable when students are forced to recall information before looking at the answer. This struggle exposes what is missing and gives later review a clearer target. For that reason, testing should not be understood merely as a way to measure learning after it happens, but as a tool that helps learning happen.`,
  },
  {
    id: "biodiversity",
    text: `Biodiversity is sometimes valued only because it gives humans useful products such as medicines, crops, or genetic resources. Those benefits are real, but they are not the whole story. Species also form relationships that keep ecosystems functioning in ways that are difficult to notice until they are lost. A pollinator, a fungus, or a predator may seem minor when viewed alone, yet its disappearance can weaken the entire network. Protecting biodiversity therefore means protecting relationships, not simply preserving a list of useful species.`,
  },
  {
    id: "scientific-models",
    text: `Scientific models are powerful because they simplify reality, but their usefulness depends on remembering what has been left out. A climate model, for instance, cannot include every tree, cloud, and human decision in perfect detail. Instead, it represents patterns that matter for a particular question. Problems arise when a model built for one purpose is treated as if it answered every possible question. Good science uses models as disciplined approximations, not as substitutes for judgment.`,
  },
  {
    id: "consumer-choice",
    text: `More choice is often associated with greater freedom, yet too many options can make decisions harder rather than easier. When consumers face dozens of nearly identical products, they spend mental energy comparing details that may not matter. The result can be delay, dissatisfaction, or reliance on superficial cues such as packaging. Choice is valuable when it helps people express real preferences. It becomes burdensome when it overwhelms the attention required to know what those preferences are.`,
  },
  {
    id: "history-evidence",
    text: `Historical evidence does not speak by itself. A diary, a law, or a photograph becomes meaningful only when placed in relation to other evidence and to the questions historians ask. This does not mean that historians can invent any story they like. Their interpretations are constrained by what the sources make possible and by what other explanations fail to account for. The craft of history therefore lies between imagination and discipline: seeing patterns while remaining answerable to evidence.`,
  },
  {
    id: "ocean-plastics",
    text: `Plastic pollution in the ocean is often imagined as a problem that can be solved simply by removing visible waste. Cleanup efforts are useful, but they address only part of the cycle. If production, packaging design, waste systems, and consumer habits remain unchanged, new plastic will continue to enter waterways faster than old plastic can be collected. A durable solution must therefore move upstream as well as downstream. It must reduce the flow of plastic into the ocean, not merely remove what has already arrived.`,
  },
];

type GeneratedQuestion = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeLabel(value: unknown): string {
  const text = normalizeText(value);
  return text.replace(/^[([]?([1-5])[\]).]?\s*$/, "$1");
}

function getCorrectOption(question: GeneratedQuestion) {
  const correctLabel = normalizeLabel(question.correctAnswer);
  const options = Array.isArray(question.options)
    ? question.options.filter((option): option is Record<string, unknown> =>
        typeof option === "object" && option !== null)
    : [];
  return options.find((option) => normalizeLabel(option.label) === correctLabel);
}

function auditQuestion(question: GeneratedQuestion | undefined, passage: string) {
  if (!question) {
    return {
      ok: false,
      reason: "no-question",
      qualityErrors: [],
      qualityWarnings: [],
    };
  }

  const qualityIssues = validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question,
    passage,
    requestedDifficulty: "KILLER",
  });
  const qualityErrors = qualityIssues.filter((issue) => issue.severity === "error");
  const qualityWarnings = qualityIssues.filter((issue) => issue.severity === "warning");
  const correctOption = getCorrectOption(question);

  return {
    ok: qualityErrors.length === 0,
    qualityErrors,
    qualityWarnings,
    originalExpression: normalizeText(question.originalExpression),
    correctAnswer: question.correctAnswer,
    correctText: normalizeText(correctOption?.text),
    passageWithBlank: normalizeText(question.passageWithBlank),
    options: question.options,
  };
}

async function runCase(passage: { id: string; text: string }, runIndex: number) {
  console.log(`[blank-common-quality] ${passage.id} run ${runIndex + 1}/${RUNS_PER_PASSAGE}`);
  const generationResult = await runQuestionGenerationWithEmptyRetry({
    plan: [
      {
        subType: "BLANK_INFERENCE",
        count: 1,
        reason: "BLANK_INFERENCE common quality loop",
        targetPoints: [],
      },
    ],
    schoolType: "high school",
    gradeInfo: "grade 2",
    passageContent: passage.text,
    teacherIntentBlock: "",
    analysisContext: "",
    diffLabel: "KILLER",
    diffInstruction: "high-difficulty blank inference with attractive distractors",
    generationPlan: "STANDARD",
    typeSettings: { BLANK_INFERENCE: { doubleNegative: false } },
  }, {
    maxAttempts: 3,
    logPrefix: "BLANK-COMMON-QUALITY",
  });

  const question = generationResult.questions[0];
  const audit = auditQuestion(question, passage.text);
  console.log(
    `[blank-common-quality] ${passage.id} ok=${audit.ok ? "yes" : "no"} attempts=${generationResult.attempts}`,
  );
  if (audit.originalExpression) {
    console.log(`[blank-common-quality] original: ${audit.originalExpression}`);
    console.log(`[blank-common-quality] answer: ${audit.correctText}`);
  }
  if (audit.qualityErrors?.length) {
    console.log(`[blank-common-quality] errors: ${JSON.stringify(audit.qualityErrors)}`);
  }

  return {
    passageId: passage.id,
    runIndex,
    attempts: generationResult.attempts,
    question,
    audit,
  };
}

async function main() {
  if (!process.env.ATLASCLOUD_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("ATLASCLOUD_API_KEY or OPENROUTER_API_KEY is required.");
  }

  fs.mkdirSync(OUTDIR, { recursive: true });
  const results = [];
  for (const passage of PASSAGES) {
    for (let runIndex = 0; runIndex < RUNS_PER_PASSAGE; runIndex += 1) {
      results.push(await runCase(passage, runIndex));
    }
  }

  const okCount = results.filter((result) => result.audit.ok).length;
  const outPath = path.join(OUTDIR, "blank-common-quality.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      runsPerPassage: RUNS_PER_PASSAGE,
      okCount,
      total: results.length,
      results,
    }, null, 2),
  );

  console.log(`[blank-common-quality] ok ${okCount}/${results.length}`);
  console.log(`[blank-common-quality] wrote ${outPath}`);

  if (okCount !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
