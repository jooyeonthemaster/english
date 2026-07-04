/**
 * Live quality loop for IMPLIED_MEANING.
 *
 * Exercises the same Gemini workbench pipeline used by
 * /director/workbench/questions/generate, then audits underline placement,
 * evidence depth, options, and quality gates on varied passages.
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
    id: "memory-learning",
    text: `Many students treat memory as if it were strengthened only by repeated exposure. Re-reading notes may feel productive because the words become familiar, but familiarity is not the same as retrieval. Learning becomes more durable when students are forced to recall information before looking at the answer. This struggle exposes what is missing and gives later review a clearer target. For that reason, testing should not be understood merely as a way to measure learning after it happens, but as a tool that helps learning happen.`,
  },
  {
    id: "reason-emotion",
    text: `Imagine that you choose one cereal over another and explain the choice by saying that it is healthier. If someone keeps asking why health matters, why a longer life is desirable, and why comfort should be valued, your reasons cannot continue forever as pure reasons. At some point, reasons have to be based on something. What are reasons ultimately based on? They are ultimately based on non-reason, such as values, feelings, or emotions. This does not make reasoning worthless; it shows that we are creatures of both reason and emotion. We begin to reason long before we begin to reason effectively.`,
  },
  {
    id: "automation-responsibility",
    text: `Automation is often described as a simple replacement of human labor by machines, but that picture is too narrow. New tools usually remove some tasks while creating new kinds of coordination, judgment, and oversight. A spreadsheet did not eliminate financial work; it changed what counted as valuable financial work. Similarly, artificial intelligence may handle routine drafting or classification, but people will still need to decide which goals matter and whether the results are appropriate. The central issue is not whether machines can perform tasks, but how human responsibility is reorganized around them.`,
  },
  {
    id: "history-evidence",
    text: `Historical evidence does not speak by itself. A diary, a law, or a photograph becomes meaningful only when placed in relation to other evidence and to the questions historians ask. This does not mean that historians can invent any story they like. Their interpretations are constrained by what the sources make possible and by what other explanations fail to account for. The craft of history therefore lies between imagination and discipline: seeing patterns while remaining answerable to evidence.`,
  },
  {
    id: "urban-heat",
    text: `Cities are usually warmer than surrounding rural areas because concrete and asphalt absorb and release heat differently from soil and vegetation. This urban heat effect becomes dangerous during long heat waves, especially for people without access to cooling. Planting trees can help, but shade alone is not enough if housing quality, public cooling centers, and emergency communication are ignored. A serious heat policy must combine physical design with social protection. Otherwise, a city may look greener while remaining unsafe for the residents most exposed to heat.`,
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
  const circled = ["??, "??, "??, "??, "??];
  const circledIndex = circled.findIndex((label) => text.startsWith(label));
  if (circledIndex >= 0) return String(circledIndex + 1);
  const match = text.match(/^[([]?([1-5])[\]).:]?/);
  return match?.[1] ?? text;
}

function getCorrectOption(question: GeneratedQuestion) {
  const correctLabel = normalizeLabel(question.correctAnswer);
  const options = Array.isArray(question.options)
    ? question.options.filter((option): option is Record<string, unknown> =>
        typeof option === "object" && option !== null)
    : [];
  return options.find((option) => normalizeLabel(option.label) === correctLabel);
}

function countUnderlineMarkers(text: string): number {
  return (text.match(/__[^_]+__/g) ?? []).length;
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
    typeId: "IMPLIED_MEANING",
    question,
    passage,
    requestedDifficulty: "KILLER",
  });
  const qualityErrors = qualityIssues.filter((issue) => issue.severity === "error");
  const qualityWarnings = qualityIssues.filter((issue) => issue.severity === "warning");
  const correctOption = getCorrectOption(question);
  const passageWithUnderline = normalizeText(question.passageWithUnderline);

  return {
    ok: qualityErrors.length === 0,
    qualityErrors,
    qualityWarnings,
    underlinedExpression: normalizeText(question.underlinedExpression),
    correctAnswer: question.correctAnswer,
    correctText: normalizeText(correctOption?.text),
    impliedMeaning: normalizeText(question.impliedMeaning),
    evidenceChain: question.evidenceChain,
    underlineMarkerCount: countUnderlineMarkers(passageWithUnderline),
    options: question.options,
  };
}

async function runCase(passage: { id: string; text: string }, runIndex: number) {
  console.log(`[implied-meaning-quality] ${passage.id} run ${runIndex + 1}/${RUNS_PER_PASSAGE}`);
  const generationResult = await runQuestionGenerationWithEmptyRetry({
    plan: [
      {
        subType: "IMPLIED_MEANING",
        count: 1,
        reason: "IMPLIED_MEANING KILLER quality loop",
        targetPoints: [],
      },
    ],
    schoolType: "high school",
    gradeInfo: "grade 2",
    passageContent: passage.text,
    teacherIntentBlock: "",
    analysisContext: "",
    diffLabel: "KILLER",
    diffInstruction: "top-tier implied meaning inference with near-miss distractors",
    generationPlan: "STANDARD",
  }, {
    maxAttempts: 3,
    logPrefix: "IMPLIED-MEANING-QUALITY",
  });

  const question = generationResult.questions[0];
  const audit = auditQuestion(question, passage.text);
  console.log(
    `[implied-meaning-quality] ${passage.id} ok=${audit.ok ? "yes" : "no"} attempts=${generationResult.attempts}`,
  );
  if (audit.underlinedExpression) {
    console.log(`[implied-meaning-quality] underline: ${audit.underlinedExpression}`);
    console.log(`[implied-meaning-quality] answer: ${audit.correctText}`);
  }
  if (audit.qualityErrors?.length) {
    console.log(`[implied-meaning-quality] errors: ${JSON.stringify(audit.qualityErrors)}`);
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
  const outPath = path.join(OUTDIR, "implied-meaning-quality.json");
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

  console.log(`[implied-meaning-quality] ok ${okCount}/${results.length}`);
  console.log(`[implied-meaning-quality] wrote ${outPath}`);

  if (okCount !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
