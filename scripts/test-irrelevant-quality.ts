/**
 * Live quality loop for the IRRELEVANT question type.
 *
 * Exercises the same STANDARD/Gemini workbench pipeline used by generation:
 * prompt builder -> schema output -> post-process -> quality validation.
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
    id: "sunk-cost",
    text: `Few mistakes in reasoning are as common as the tendency to throw good money after bad. Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim. A factory that has spent millions developing a doomed product will often keep pouring resources into it, simply because so much has already been invested. The same logic infects everyday life: people sit through bad films because they paid for the ticket, stay in unproductive relationships because of the years already invested, and persist in failing careers because turning back would feel like an admission of defeat. Rational decision-making, by contrast, requires evaluating each new choice on its own merits, asking not what has been spent but what is still to gain. The hardest lesson in economics, then, may also be the hardest lesson in life.`,
  },
  {
    id: "attention-design",
    text: `Designers often assume that adding more features gives users more freedom, but attention is not an unlimited resource. Each extra button or notification asks the user to decide whether it matters, and those tiny decisions accumulate. A clean interface is therefore not merely an aesthetic preference; it is a way of protecting the user's ability to focus on the task. This is why experienced designers remove options that technically work but do not support the main goal. The best products often feel powerful not because every possible action is visible, but because the next useful action is easy to recognize. In that sense, simplicity is less about having fewer parts than about making attention go where it should.`,
  },
  {
    id: "memory-sleep",
    text: `Memory is often treated as a storage system, as if the brain simply files away whatever happens during the day. In reality, remembering is an active process in which the brain selects, reorganizes, and connects information. Sleep plays a crucial role in this process because it gives the brain time to stabilize useful patterns without the noise of new input. Studies of learning show that people often perform better after sleep than after an equal amount of waking rest. This improvement does not mean that sleep magically creates knowledge; rather, it strengthens relationships among ideas that were already encountered. For students, the lesson is that review and rest work together, not that one can replace the other.`,
  },
  {
    id: "urban-privacy",
    text: `Smart-city technology promises to make urban life smoother by collecting data from roads, buildings, and public services. Sensors can help reduce traffic, detect broken infrastructure, and send emergency crews where they are needed most. Yet the same systems that make a city responsive can also make its residents easier to monitor. The central question is not whether data is useful, but who controls it and how long it is kept. Without clear rules, convenience can quietly become a form of surveillance. A truly smart city must therefore measure progress not only by efficiency, but also by the protection of civic trust.`,
  },
];

type GeneratedQuestion = Record<string, unknown>;

function normalizeLabel(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  const circledMap: Record<string, string> = {
    "??: "1",
    "??: "2",
    "??: "3",
    "??: "4",
    "??: "5",
  };
  return (circledMap[text] ?? text).replace(/^[\(\[]?([1-5])[\)\].]?\s*$/, "$1");
}

function normalizeComparableText(value: string): string {
  return value
    .replace(/[?쒋?/g, "\"")
    .replace(/[?섃?/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function containsComparableSentence(passage: string, sentence: string): boolean {
  const comparablePassage = normalizeComparableText(passage);
  const comparableSentence = normalizeComparableText(sentence).replace(/[.!?]+$/, "");
  return comparableSentence.length >= 20 && comparablePassage.includes(comparableSentence);
}

const STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "because",
  "before",
  "being",
  "could",
  "during",
  "from",
  "have",
  "into",
  "more",
  "most",
  "only",
  "other",
  "same",
  "should",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
]);

function contentTokens(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
  const content = new Set<string>();
  for (const token of tokens) {
    if (STOPWORDS.has(token)) continue;
    content.add(token);
    for (const part of token.split("-")) {
      if (part.length > 3 && !STOPWORDS.has(part)) content.add(part);
    }
    const stem = lightStem(token);
    if (stem !== token && !STOPWORDS.has(stem)) content.add(stem);
  }
  return content;
}

function lightStem(token: string): string {
  if (token.length > 7 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 6 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 6 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 5 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function containsStandaloneToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function findNewExtremeCue(sentence: string, passage: string): string | null {
  const cues = ["always", "never", "everyone", "everybody", "completely", "entirely"];
  for (const cue of cues) {
    if (containsStandaloneToken(sentence, cue) && !containsStandaloneToken(passage, cue)) {
      return cue;
    }
  }
  return null;
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
    typeId: "IRRELEVANT",
    question,
    passage,
    requestedDifficulty: "KILLER",
  });
  const qualityErrors = qualityIssues.filter((issue) => issue.severity === "error");
  const qualityWarnings = qualityIssues.filter((issue) => issue.severity === "warning");
  const sentences = Array.isArray(question.sentences)
    ? question.sentences.map((sentence) => String(sentence))
    : [];
  const irrelevantIndex = Number(question.irrelevantIndex);
  const inserted = sentences[irrelevantIndex] ?? "";
  const sourceSentences = sentences.filter((_, index) => index !== irrelevantIndex);
  const sourceCopied = sourceSentences.filter((sentence) =>
    containsComparableSentence(passage, sentence),
  ).length;
  const insertedTokens = contentTokens(inserted);
  const sourceOverlap = countOverlap(insertedTokens, contentTokens(sourceSentences.join(" ")));
  const sourceOverlapRatio = sourceOverlap / Math.max(1, insertedTokens.size);
  const adjacentOverlap = countOverlap(
    insertedTokens,
    contentTokens([
      sentences[irrelevantIndex - 1],
      sentences[irrelevantIndex + 1],
    ].filter(Boolean).join(" ")),
  );
  const styleAlerts = [
    /\ballow(?:s|ed|ing)?\s+\w+\s+to\s+active\b/i.test(inserted)
      ? "awkward-allow-to-active"
      : "",
    findNewExtremeCue(inserted, passage)
      ? `new-extreme-cue:${findNewExtremeCue(inserted, passage)}`
      : "",
  ].filter(Boolean);
  const answerOk = normalizeLabel(question.correctAnswer) === String(irrelevantIndex + 1);
  const ok =
    qualityErrors.length === 0 &&
    styleAlerts.length === 0 &&
    sentences.length === 5 &&
    answerOk &&
    sourceCopied === 4 &&
    sourceOverlap >= 2;

  return {
    ok,
    answerOk,
    sourceCopied,
    sourceOverlap,
    sourceOverlapRatio: Number(sourceOverlapRatio.toFixed(2)),
    adjacentOverlap,
    styleAlerts,
    irrelevantIndex,
    correctAnswer: question.correctAnswer,
    inserted,
    qualityErrors,
    qualityWarnings,
  };
}

async function runCase(passage: { id: string; text: string }, runIndex: number) {
  console.log(`[irrelevant-quality] ${passage.id} run ${runIndex + 1}/${RUNS_PER_PASSAGE}`);
  const generationResult = await runQuestionGenerationWithEmptyRetry({
    plan: [
      {
        subType: "IRRELEVANT",
        count: 1,
        reason: "IRRELEVANT quality loop",
        targetPoints: [],
      },
    ],
    schoolType: "high school",
    gradeInfo: "grade 2",
    passageContent: passage.text,
    teacherIntentBlock: "",
    analysisContext: "",
    diffLabel: "KILLER",
    diffInstruction: "same-topic but discourse-breaking ?섎뒫??臾닿???臾몄옣",
    generationPlan: "STANDARD",
  }, {
    maxAttempts: 3,
    logPrefix: "IRRELEVANT-QUALITY",
  });

  const question = generationResult.questions[0];
  const audit = auditQuestion(question, passage.text);
  console.log(
    `[irrelevant-quality] ${passage.id} ok=${audit.ok ? "yes" : "no"} answer=${audit.correctAnswer ?? "-"} source=${audit.sourceCopied ?? 0}/4 overlap=${audit.sourceOverlap ?? 0} ratio=${audit.sourceOverlapRatio ?? 0} adjacent=${audit.adjacentOverlap ?? 0}`,
  );
  if (audit.inserted) {
    console.log(`[irrelevant-quality] inserted: ${audit.inserted}`);
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
  const outPath = path.join(OUTDIR, "irrelevant-quality.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: process.env.ATLASCLOUD_TEXT_MODEL ?? "google/gemini-3.5-flash",
        okCount,
        total: results.length,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\n[irrelevant-quality] ok=${okCount}/${results.length} saved=${outPath}`);
  if (okCount !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
