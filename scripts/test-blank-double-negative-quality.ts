/**
 * Live quality loop for BLANK_INFERENCE double-negative mode.
 *
 * Exercises the same Gemini workbench pipeline:
 * type setting -> prompt builder -> schema output -> post-process -> quality validation.
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
    id: "reason-emotion",
    text: `A common but incorrect assumption is that we are creatures of reason when, in fact, we are creatures of both reason and emotion. We cannot get by on reason alone since any reason always eventually leads to a feeling. Should I get a wholegrain cereal or a chocolate cereal? I can list all the reasons I want, but the reasons have to be based on something. For example, if my goal is to eat healthy, I can choose the wholegrain cereal, but what is my reason for wanting to be healthy? I can list more and more reasons such as wanting to live longer, spending more quality time with loved ones, etc., but what are the reasons for those reasons? You should be able to see by now that reasons are ultimately based on non-reason such as values, feelings, or emotions. These deep-seated values, feelings, and emotions we have are rarely a result of reasoning, but can certainly be influenced by reasoning. We have values, feelings, and emotions before we begin to reason and long before we begin to reason effectively.`,
  },
  {
    id: "creative-limits",
    text: `Creative people often imagine that limits are the enemy of originality. Yet a project with no boundaries can leave the mind wandering among too many possible directions. A poet who must write within a fixed form is not deprived of imagination; the form gives each choice a sharper purpose. In the same way, a designer who has to work with limited materials may discover solutions that would never appear in a completely open brief. Constraints do not remove creativity, because they force attention toward relationships that unlimited freedom can hide. The useful question, then, is not whether limits exist, but whether the limits guide the search toward better possibilities.`,
  },
  {
    id: "sleep-memory",
    text: `Memory is often treated as a storage system, as if the brain simply files away whatever happens during the day. In reality, remembering is an active process in which the brain selects, reorganizes, and connects information. Sleep plays a crucial role in this process because it gives the brain time to stabilize useful patterns without the noise of new input. Studies of learning show that people often perform better after sleep than after an equal amount of waking rest. This improvement does not mean that sleep magically creates knowledge; rather, it strengthens relationships among ideas that were already encountered. For students, the lesson is that review and rest work together, not that one can replace the other.`,
  },
  {
    id: "smart-city",
    text: `Smart-city technology promises to make urban life smoother by collecting data from roads, buildings, and public services. Sensors can help reduce traffic, detect broken infrastructure, and send emergency crews where they are needed most. Yet the same systems that make a city responsive can also make its residents easier to monitor. The central question is not whether data is useful, but who controls it and how long it is kept. Without clear rules, convenience can quietly become a form of surveillance. A truly smart city must therefore measure progress not only by efficiency, but also by the protection of civic trust.`,
  },
  {
    id: "attention-design",
    text: `Designers often assume that adding more features gives users more freedom, but attention is not an unlimited resource. Each extra button or notification asks the user to decide whether it matters, and those tiny decisions accumulate. A clean interface is therefore not merely an aesthetic preference; it is a way of protecting the user's ability to focus on the task. This is why experienced designers remove options that technically work but do not support the main goal. The best products often feel powerful not because every possible action is visible, but because the next useful action is easy to recognize. In that sense, simplicity is less about having fewer parts than about making attention go where it should.`,
  },
];

type GeneratedQuestion = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeLabel(value: unknown): string {
  const text = normalizeText(value);
  const circledMap: Record<string, string> = {
    "①": "1",
    "②": "2",
    "③": "3",
    "④": "4",
    "⑤": "5",
  };
  return (circledMap[text] ?? text).replace(/^[([]?([1-5])[\]).]?\s*$/, "$1");
}

function hasNegationCue(text: string): boolean {
  return (
    /\b(?:cannot|can't|not|never|no|none|neither|nor|little|few|hardly|rarely|scarcely|seldom|without|fail|fails|failed|failing|failure|lack|lacks|lacking|absence|absent|barrier|obstacle|enemy|unable|impossible|irrational|exclude|excludes|excluding|eliminate|eliminates|eliminating|reject|rejects|rejecting|neglect|neglects|neglecting|collapse|collapses|collapsing|erosion|erode|erodes|eroding|compromise|compromises|compromising|undermine|undermines|undermining)\b/i.test(text) ||
    /\b(?:non-[a-z]+|nonreason|nonrational)\b/i.test(text) ||
    /\b(?:anything but|nothing but|other than|free from|not based on|not derived from|not a result of|rather than)\b/i.test(text)
  );
}

function extractBlankCarrierText(passageWithBlank: string): string {
  const blankIndex = passageWithBlank.indexOf("_____");
  if (blankIndex < 0) return passageWithBlank;

  const leftBoundary = Math.max(
    passageWithBlank.lastIndexOf(".", blankIndex - 1),
    passageWithBlank.lastIndexOf("!", blankIndex - 1),
    passageWithBlank.lastIndexOf("?", blankIndex - 1),
  );
  const rightPeriod = passageWithBlank.indexOf(".", blankIndex);
  const rightExclamation = passageWithBlank.indexOf("!", blankIndex);
  const rightQuestion = passageWithBlank.indexOf("?", blankIndex);
  const rightCandidates = [rightPeriod, rightExclamation, rightQuestion]
    .filter((index) => index >= 0);
  const rightBoundary = rightCandidates.length
    ? Math.min(...rightCandidates)
    : passageWithBlank.length;

  return passageWithBlank
    .slice(leftBoundary + 1, rightBoundary + 1)
    .replace(/\s+/g, " ")
    .trim();
}

function requiresCompleteClauseAfterConnector(blankCarrierText: string): boolean {
  return /\b(?:since|because|that)\s+_____/.test(blankCarrierText);
}

function startsWithoutClauseSubject(text: string): boolean {
  return /^(?:cannot|can't|can\s+not|can|could|should|would|will|must|may|might|do|does|did|is|are|was|were|be|being|been|has|have|had|fail|fails|failed|failing)\b/i.test(text.trim());
}

function findAwkwardBlankOptionPhrase(text: string): string | null {
  const patterns = [
    "rational tool",
    "rational tools",
    "cognitive preference",
    "cognitive preferences",
    "impulsive desire",
    "impulsive desires",
    "ultimate emotional foundation",
    "emotional distractions",
    "intellectual choices",
    "lack of erosion",
    "absence of erosion",
    "that lack of",
    "which lack of",
  ];
  const normalized = text.toLowerCase();
  return patterns.find((pattern) => normalized.includes(pattern)) ?? null;
}

function findOddCapitalizedOptionToken(text: string): string | null {
  const matches = text.matchAll(/\b[A-Z][a-z]{2,}\b/g);
  for (const match of matches) {
    if (match.index === 0) continue;
    return match[0];
  }
  return null;
}

const STOPWORDS = new Set([
  "about",
  "after",
  "alone",
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
    const stem = lightStemContentToken(token);
    if (stem !== token && !STOPWORDS.has(stem)) content.add(stem);
  }
  return content;
}

function lightStemContentToken(token: string): string {
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
  const correctText = normalizeText(correctOption?.text);
  const originalExpression = normalizeText(question.originalExpression);
  const passageWithBlank = normalizeText(question.passageWithBlank);
  const blankCarrierText = extractBlankCarrierText(passageWithBlank);
  const options = Array.isArray(question.options)
    ? question.options.filter((option): option is Record<string, unknown> =>
        typeof option === "object" && option !== null)
    : [];
  const wrongOptions = options.filter((option) =>
    normalizeLabel(option.label) !== normalizeLabel(question.correctAnswer));
  const passageTokens = contentTokens(passage);
  const correctTokens = contentTokens(correctText);
  const attractiveWrongCount = wrongOptions.filter((option) => {
    const text = normalizeText(option.text);
    const tokens = contentTokens(text);
    const passageOverlap = countOverlap(tokens, passageTokens);
    const correctOverlap = countOverlap(tokens, correctTokens);
    return passageOverlap >= 2 || correctOverlap >= 1 || (hasNegationCue(text) && passageOverlap >= 1);
  }).length;
  const targetTokenCount = contentTokens(originalExpression).size;
  const optionNegation = hasNegationCue(correctText);
  const blankNegation = hasNegationCue(blankCarrierText);
  const transformed = normalizeText(correctText).toLowerCase() !== normalizeText(originalExpression).toLowerCase();
  const awkwardCorrectPhrase = findAwkwardBlankOptionPhrase(correctText);
  const awkwardOptionPhrase = options
    .map((option) => findAwkwardBlankOptionPhrase(normalizeText(option.text)))
    .find(Boolean) ?? null;
  const oddCapitalizedOptionToken = options
    .map((option) => findOddCapitalizedOptionToken(normalizeText(option.text)))
    .find(Boolean) ?? null;
  const exampleListSlot = /\b(?:such as|including|for example)\s+_____/.test(blankCarrierText);
  const crossesContrast = /\b(?:but because|but whether|rather|instead)\b/i.test(originalExpression);
  const clauseMissingSubject =
    requiresCompleteClauseAfterConnector(blankCarrierText) &&
    startsWithoutClauseSubject(correctText);
  const becausePhraseSlot =
    /\bbecause\s+_____/.test(blankCarrierText) &&
    /^(?:without|by|not by)\b/i.test(correctText);
  const ok =
    qualityErrors.length === 0 &&
    optionNegation &&
    blankNegation &&
    transformed &&
    targetTokenCount >= 2 &&
    attractiveWrongCount >= 3 &&
    !awkwardCorrectPhrase &&
    !awkwardOptionPhrase &&
    !oddCapitalizedOptionToken &&
    !exampleListSlot &&
    !crossesContrast &&
    !clauseMissingSubject &&
    !becausePhraseSlot;

  return {
    ok,
    qualityErrors,
    qualityWarnings,
    blankAnswerMode: question.blankAnswerMode,
    originalExpression,
    targetTokenCount,
    passageWithBlank,
    blankCarrierText,
    correctAnswer: question.correctAnswer,
    correctText,
    optionNegation,
    blankNegation,
    awkwardCorrectPhrase,
    awkwardOptionPhrase,
    oddCapitalizedOptionToken,
    exampleListSlot,
    crossesContrast,
    clauseMissingSubject,
    becausePhraseSlot,
    attractiveWrongCount,
    options: question.options,
    answerLogic: question.answerLogic,
  };
}

async function runCase(passage: { id: string; text: string }, runIndex: number) {
  console.log(`[blank-dn-quality] ${passage.id} run ${runIndex + 1}/${RUNS_PER_PASSAGE}`);
  const generationResult = await runQuestionGenerationWithEmptyRetry({
    plan: [
      {
        subType: "BLANK_INFERENCE",
        count: 1,
        reason: "BLANK_INFERENCE double-negative quality loop",
        targetPoints: [],
      },
    ],
    schoolType: "high school",
    gradeInfo: "grade 2",
    passageContent: passage.text,
    teacherIntentBlock: "",
    analysisContext: "",
    diffLabel: "KILLER",
    diffInstruction: "high-difficulty double-negative blank inference with attractive distractors",
    generationPlan: "STANDARD",
    typeSettings: { BLANK_INFERENCE: { doubleNegative: true } },
  }, {
    maxAttempts: 3,
    logPrefix: "BLANK-DN-QUALITY",
  });

  const question = generationResult.questions[0];
  const audit = auditQuestion(question, passage.text);
  console.log(
    `[blank-dn-quality] ${passage.id} ok=${audit.ok ? "yes" : "no"} attempts=${generationResult.attempts} targetTokens=${audit.targetTokenCount ?? 0} optionNeg=${audit.optionNegation ? "yes" : "no"} wrongTrap=${audit.attractiveWrongCount ?? 0}/4`,
  );
  if (audit.originalExpression) {
    console.log(`[blank-dn-quality] original: ${audit.originalExpression}`);
    console.log(`[blank-dn-quality] answer: ${audit.correctText}`);
  }
  if (audit.qualityErrors?.length) {
    console.log(`[blank-dn-quality] errors: ${JSON.stringify(audit.qualityErrors)}`);
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
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is required.");
  }

  fs.mkdirSync(OUTDIR, { recursive: true });
  const results = [];
  for (const passage of PASSAGES) {
    for (let runIndex = 0; runIndex < RUNS_PER_PASSAGE; runIndex += 1) {
      results.push(await runCase(passage, runIndex));
    }
  }

  const okCount = results.filter((result) => result.audit.ok).length;
  const outPath = path.join(OUTDIR, "blank-double-negative-quality.json");
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

  console.log(`[blank-dn-quality] ok ${okCount}/${results.length}`);
  console.log(`[blank-dn-quality] wrote ${outPath}`);

  if (okCount !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
