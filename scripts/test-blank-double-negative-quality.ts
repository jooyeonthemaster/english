/**
 * Live quality loop for BLANK_INFERENCE negative-paraphrase mode.
 *
 * Exercises the same Gemini workbench pipeline:
 * type setting -> prompt builder -> schema output -> post-process -> quality validation.
 *
 * The UI setting is still named doubleNegative for backward compatibility,
 * but the intended subtype is now a negative/privative paraphrase blank.
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
  {
    id: "success-identity",
    text: `Winning often brings the awareness that others are watching you. It is much easier to go unnoticed when no one knows who you are or pays attention to you. In those situations, you can make mistakes, be imperfect, and take risks without worrying too much, because no one is really watching. However, once you start to succeed and people begin to notice you, you become more aware that you are being observed. You feel judged, and you may start to worry that others will see your flaws and weaknesses. Because of this, you might try to hide your true self and present a version of yourself that others will respect, as a role model, a responsible person, or a leader. There is nothing wrong with that. But if you do this at the expense of being who you really are, making decisions that please others rather than yourself, you will not remain in that position for long. When you begin to apologize for who you are, you stop growing, which ultimately undermines your ability to sustain success.`,
  },
  {
    id: "vagrancy-ecology",
    text: `It is a common assumption that most vagrant birds are ultimately doomed, aside from the rare cases where individuals are able to reorientate and return to their normal ranges. In turn, it is also commonly assumed that vagrancy itself is a relatively unimportant biological phenomenon. This is undoubtedly true for the majority of cases, as the most likely outcome of any given vagrancy event is that the individual will fail to find enough resources, and/or be exposed to inhospitable environmental conditions, and perish. However, there are many lines of evidence to suggest that vagrancy can, on rare occasions, dramatically alter the fate of populations, species or even whole ecosystems. Despite being infrequent, these events can be extremely important when viewed at the timescales over which ecological and evolutionary processes unfold. The most profound consequences of vagrancy relate to the establishment of new breeding sites, new migration routes and wintering locations. Each of these can occur through different mechanisms, and at different frequencies, and they each have their own unique importance.`,
  },
  {
    id: "sunk-cost",
    text: `Few mistakes in reasoning are as common as the tendency to throw good money after bad. Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim. A factory that has spent millions developing a doomed product will often keep pouring resources into it, simply because so much has already been invested. The same logic infects everyday life: people sit through bad films because they paid for the ticket, stay in unproductive relationships because of the years already invested, and persist in failing careers because turning back would feel like an admission of defeat. Rational decision-making, by contrast, requires evaluating each new choice on its own merits, asking not what has been spent but what is still to gain. The hardest lesson in economics, then, may also be the hardest lesson in life.`,
  },
  {
    id: "ecosystem-resilience",
    text: `A forest is not healthy simply because every tree looks strong at the same moment. Long-term resilience depends on variation: young trees, old trees, fallen wood, fungi, insects, and animals all contribute to the system's ability to recover. When managers remove every irregular feature in the name of order, they may create a landscape that appears clean but is vulnerable to disease or drought. Diversity works like a set of backup routes, allowing energy and nutrients to keep moving when one path is blocked. For this reason, ecological stability is often produced by complexity that looks messy to the human eye.`,
  },
  {
    id: "feedback-learning",
    text: `Students often prefer praise because it feels encouraging, but praise alone rarely shows them what to do next. Useful feedback identifies the gap between current performance and a clearer goal. This does not mean that criticism should be harsh; it means that comments must be specific enough to guide revision. A vague statement such as "good job" may protect confidence for a moment while leaving the student's thinking unchanged. By contrast, feedback that points to a precise next step can make temporary discomfort part of genuine progress.`,
  },
];

type GeneratedQuestion = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeLabel(value: unknown): string {
  const text = normalizeText(value);
  const circledMap: Record<string, string> = {
    "??: "1",
    "??: "2",
    "??: "3",
    "??: "4",
    "??: "5",
  };
  return (circledMap[text] ?? text).replace(/^[([]?([1-5])[\]).]?\s*$/, "$1");
}

function hasNegationCue(text: string): boolean {
  return (
    /\b(?:cannot|can't|not|never|no|none|neither|nor|little|few|hardly|rarely|scarcely|seldom|without|fail|fails|failed|failing|failure|lack|lacks|lacking|absence|absent|devoid|barrier|obstacle|enemy|unable|impossible|irrational|prevent|prevents|preventing|keep|keeps|keeping|exclude|excludes|excluding|eliminate|eliminates|eliminating|reject|rejects|rejecting|neglect|neglects|neglecting|collapse|collapses|collapsing|erosion|erode|erodes|eroding|compromise|compromises|compromising|undermine|undermines|undermining)\b/i.test(text) ||
    /\b(?:non-[a-z]+|nonreason|nonrational)\b/i.test(text) ||
    /\b(?:anything but|nothing but|other than|free from|not based on|not derived from|not a result of|not beyond|not independent of|not distorted by|rather than)\b/i.test(text)
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
    transformed &&
    targetTokenCount >= 2 &&
    attractiveWrongCount >= 1 &&
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
        reason: "BLANK_INFERENCE negative-paraphrase quality loop",
        targetPoints: [],
      },
    ],
    schoolType: "high school",
    gradeInfo: "grade 2",
    passageContent: passage.text,
    teacherIntentBlock: "",
    analysisContext: "",
    diffLabel: "KILLER",
    diffInstruction: "high-difficulty negative-paraphrase blank inference with attractive distractors",
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
  const outPath = path.join(OUTDIR, "blank-negative-paraphrase-quality.json");
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
