import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

process.env.ATLASCLOUD_TEXT_MODEL ??= "google/gemini-3.5-flash";
process.env.GEMINI_QUESTION_THINKING_BUDGET ??= "0";

const OUTDIR = path.join(process.cwd(), ".tmp", "tutor-generation-benchmarks");
const MAX_TYPES = Math.max(1, Number(process.env.TUTOR_BENCH_MAX_TYPES || 5));

const FALLBACK_PASSAGE = {
  id: "fallback-sunk-cost",
  title: "Sunk Cost Fallacy",
  content:
    "Few mistakes in reasoning are as common as the tendency to throw good money after bad. Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim. A factory that has spent millions developing a doomed product will often keep pouring resources into it, simply because so much has already been invested. The same logic infects everyday life: people sit through bad films because they paid for the ticket, stay in unproductive relationships because of the years already invested, and persist in failing careers because turning back would feel like an admission of defeat. Rational decision-making, by contrast, requires evaluating each new choice on its own merits, asking not what has been spent but what is still to gain. The hardest lesson in economics, then, may also be the hardest lesson in life.",
  analysis: {
    sentences: [
      {
        index: 0,
        english: "Few mistakes in reasoning are as common as the tendency to throw good money after bad.",
        korean: "?섎せ??異붾줎 以??대? ?섏걶 怨녹뿉 ??留롮? ?덉쓣 ?잛븘遺볥뒗 寃쏀뼢留뚰겮 ?뷀븳 寃껋? 嫄곗쓽 ?녿떎.",
      },
      {
        index: 1,
        english: "Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim.",
        korean: "寃쎌젣?숈옄?ㅼ? ?대? 留ㅻぐ 鍮꾩슜 ?ㅻ쪟?쇨퀬 遺瑜몃떎.",
      },
      {
        index: 2,
        english: "A factory that has spent millions developing a doomed product will often keep pouring resources into it, simply because so much has already been invested.",
        korean: "?ㅽ뙣???쒗뭹???섎갚留??щ윭瑜???怨듭옣? ?대? 留롮씠 ?ъ옄?덈떎???댁쑀留뚯쑝濡?怨꾩냽 ?먯썝???ъ엯?섍낀 ?쒕떎.",
      },
      {
        index: 3,
        english: "The same logic infects everyday life: people sit through bad films because they paid for the ticket, stay in unproductive relationships because of the years already invested, and persist in failing careers because turning back would feel like an admission of defeat.",
        korean: "媛숈? ?쇰━???쇱긽?먮룄 ?쇱쭊??",
      },
      {
        index: 4,
        english: "Rational decision-making, by contrast, requires evaluating each new choice on its own merits, asking not what has been spent but what is still to gain.",
        korean: "諛섎?濡??⑸━???섏궗寃곗젙? ?대? ??寃껋씠 ?꾨땲???욎쑝濡??살쓣 寃껋쓣 湲곗??쇰줈 ???좏깮???됯??댁빞 ?쒕떎.",
      },
      {
        index: 5,
        english: "The hardest lesson in economics, then, may also be the hardest lesson in life.",
        korean: "?곕씪??寃쎌젣?숈쓽 媛???대젮??援먰썕? ?띠쓽 媛???대젮??援먰썕?닿린???섎떎.",
      },
    ],
    vocabulary: [
      {
        word: "fallacy",
        meaning: "?ㅻ쪟",
        partOfSpeech: "noun",
        pronunciation: "",
        sentenceIndex: 1,
        difficulty: "advanced",
        contextMeaning: "?쇰━?곸쑝濡??섎せ??誘우쓬",
        collocations: ["sunk cost fallacy"],
      },
      {
        word: "justify",
        meaning: "?뺣떦?뷀븯??,
        partOfSpeech: "verb",
        pronunciation: "",
        sentenceIndex: 1,
        difficulty: "intermediate",
        contextMeaning: "誘몃옒 寃곗젙???⑸━?곸씤 寃껋쿂??蹂댁씠寃??섎떎",
      },
      {
        word: "commitments",
        meaning: "?뚯떊, ?쎌냽",
        partOfSpeech: "noun",
        pronunciation: "",
        sentenceIndex: 1,
        difficulty: "intermediate",
        contextMeaning: "?욎쑝濡?怨꾩냽 ?먯썝???ъ엯?섎뒗 寃곗젙",
      },
      {
        word: "merits",
        meaning: "?μ젏, 媛移?,
        partOfSpeech: "noun",
        pronunciation: "",
        sentenceIndex: 4,
        difficulty: "advanced",
        contextMeaning: "洹??좏깮 ?먯껜???꾩옱 媛移?,
      },
    ],
    grammarPoints: [
      {
        id: "g1",
        pattern: "not A but B",
        explanation: "?대? ??鍮꾩슜???꾨땲???욎쑝濡??살쓣 寃껋쓣 湲곗??쇰줈 ?먮떒?쒕떎???議?援ъ“",
        textFragment: "not what has been spent but what is still to gain",
        sentenceIndex: 4,
        examples: [],
        level: "advanced",
        commonMistake: "but ??蹂묐젹 援ъ“瑜??볦퀜 ?댁꽍???먮젮吏?,
        transformations: ["not A but B 媛뺤“援щЦ ?꾪솚"],
      },
      {
        id: "g2",
        pattern: "遺꾩궗援щЦ",
        explanation: "asking? ?욎쓽 evaluating??援ъ껜?뷀븯??遺꾩궗援щЦ",
        textFragment: "asking not what has been spent but what is still to gain",
        sentenceIndex: 4,
        examples: [],
        level: "intermediate",
        commonMistake: "asking???꾩튂?щ줈 ?ㅻ텇??,
      },
    ],
    structure: {
      mainIdea: "留ㅻぐ 鍮꾩슜???쎈ℓ?댁? 留먭퀬 ?꾩옱 ?좏깮??媛移섎줈 ?먮떒?댁빞 ?쒕떎.",
      purpose: "?섎せ???섏궗寃곗젙 諛⑹떇???ㅻ챸?섍퀬 ?⑸━???먮떒 湲곗????쒖떆",
      textType: "expository",
      paragraphSummaries: [],
      keyPoints: [
        "怨쇨굅 ?ъ옄??誘몃옒 ?좏깮???뺣떦?뷀븯吏 ?딅뒗??",
        "?쇱긽?먯꽌??留ㅻぐ 鍮꾩슜 ?ㅻ쪟媛 諛섎났?쒕떎.",
        "?⑸━???먮떒? ?욎쑝濡??살쓣 媛移섏뿉 珥덉젏???붾떎.",
      ],
      blankSuitablePositions: ["not what has been spent but what is still to gain"],
      orderClues: ["寃쎌젣??媛쒕뀗 ?쒖떆 -> 怨듭옣 ?덉떆 -> ?쇱긽 ?덉떆 -> ?⑸━?????],
    },
    examDesign: {
      paraphrasableSegments: [
        {
          original: "throw good money after bad",
          alternatives: ["continue investing resources in a failing choice"],
          sentenceIndex: 0,
          reason: "?듭떖 鍮꾩쑀 ?쒗쁽",
        },
      ],
      structureTransformPoints: [
        {
          original: "Rational decision-making requires evaluating each new choice on its own merits.",
          transformType: "not A but B 蹂묐젹 援ъ“ ?쒖슜",
          example: "Rational decision-making asks not what has been spent but what is still to gain.",
          sentenceIndex: 4,
          reason: "?쒖닠??蹂??媛?μ꽦???믪쓬",
        },
      ],
      summaryKeyPoints: ["past investments", "future gain", "rational decision-making"],
      descriptiveConditions: ["not A but B 援ъ“瑜??ъ슜??寃?],
    },
  },
};

type PassageFixture = {
  id: string;
  title: string;
  content: string;
  analysis: typeof FALLBACK_PASSAGE.analysis;
};

async function loadFixture(): Promise<PassageFixture> {
  const prisma = new PrismaClient();
  try {
    const row = await prisma.passage.findFirst({
      where: { analysis: { isNot: null } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        content: true,
        analysis: { select: { analysisData: true } },
      },
    });
    if (!row?.analysis?.analysisData) return FALLBACK_PASSAGE;
    const parsed = JSON.parse(row.analysis.analysisData);
    if (!parsed?.sentences?.length || !parsed?.vocabulary?.length) return FALLBACK_PASSAGE;
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      analysis: parsed,
    };
  } catch (error) {
    console.warn(`DB fixture unavailable, using fallback passage: ${error instanceof Error ? error.message : String(error)}`);
    return FALLBACK_PASSAGE;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function summarizeDrafts(drafts: Array<{ type: string; mode: string; maxScore: number; estimatedSec: number }>, validCount: number) {
  return {
    total: drafts.length,
    validCount,
    byType: countBy(drafts.map((draft) => draft.type)),
    byMode: countBy(drafts.map((draft) => draft.mode)),
    totalScore: drafts.reduce((sum, draft) => sum + draft.maxScore, 0),
    estimatedMinutes: Math.round(drafts.reduce((sum, draft) => sum + draft.estimatedSec, 0) / 60),
  };
}

async function main() {
  if (!process.env.ATLASCLOUD_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Missing ATLASCLOUD_API_KEY or OPENROUTER_API_KEY.");
  }

  const [
    { buildRuleBasedTutorDrafts, generateTutorDraftsWithModel, validateGroundedDrafts },
    { runQuestionGenerationWithEmptyRetry },
    { buildAnalysisContext },
    { DIFF_DESCRIPTION },
    { buildExamAlignedTutorQuestionPlan, examQuestionToTutorActivityDraft },
  ] = await Promise.all([
    import("../src/lib/tutor/generate-activities"),
    import("../src/app/api/ai/generate-questions-auto/_lib/run-question-generation"),
    import("../src/app/api/ai/generate-questions-auto/_lib/build-analysis-context"),
    import("../src/app/api/ai/generate-questions-auto/_lib/constants"),
    import("../src/lib/tutor/exam-aligned-activities"),
  ]);

  const fixture = await loadFixture();
  const startedAt = Date.now();
  fs.mkdirSync(OUTDIR, { recursive: true });

  const ruleBased = buildRuleBasedTutorDrafts(fixture.analysis);
  const genericStartedAt = Date.now();
  const generic = await generateTutorDraftsWithModel(fixture.analysis);
  const genericMs = Date.now() - genericStartedAt;
  const genericValid = validateGroundedDrafts(generic.activities, fixture.analysis);

  const fullPlan = buildExamAlignedTutorQuestionPlan(fixture.analysis);
  const plan = fullPlan.slice(0, MAX_TYPES);
  const examStartedAt = Date.now();
  const examResult = await runQuestionGenerationWithEmptyRetry({
    plan,
    schoolType: "怨좊벑?숆탳",
    gradeInfo: "",
    passageContent: fixture.content,
    teacherIntentBlock: "",
    analysisContext: buildAnalysisContext({
      analysis: { analysisData: JSON.stringify(fixture.analysis) },
    }),
    diffLabel: "INTERMEDIATE",
    diffInstruction: DIFF_DESCRIPTION.INTERMEDIATE,
    generationPlan: "STANDARD",
    customPrompt: "紐⑤컮???댁떊 ?숈뒿?⑹쑝濡? ?뺣떟 洹쇨굅? ?ㅻ떟 ?⑥젙???쒕졆??臾몄젣瑜??앹꽦?쒕떎.",
    typeSettings: {
      GRAMMAR_ERROR: { markerCount: 5, answerCount: 1 },
      BLANK_INFERENCE: { doubleNegative: false },
      IRRELEVANT: { slotCount: 5 },
    },
  });
  const examMs = Date.now() - examStartedAt;
  const examDrafts = examResult.questions
    .map((question) => examQuestionToTutorActivityDraft(question, fixture.analysis))
    .filter((draft): draft is NonNullable<typeof draft> => Boolean(draft));
  const examValid = validateGroundedDrafts(examDrafts, fixture.analysis);

  const summary = {
    fixture: { id: fixture.id, title: fixture.title, sentenceCount: fixture.analysis.sentences.length },
    env: {
      model: process.env.ATLASCLOUD_TEXT_MODEL,
      questionThinkingBudget: process.env.GEMINI_QUESTION_THINKING_BUDGET,
      maxTypes: MAX_TYPES,
    },
    strategies: {
      ruleBased: summarizeDrafts(ruleBased, validateGroundedDrafts(ruleBased, fixture.analysis).length),
      genericSingleCall: {
        ...summarizeDrafts(generic.activities, genericValid.length),
        model: generic.model,
        latencyMs: genericMs,
      },
      workbenchExamPipeline: {
        ...summarizeDrafts(examDrafts, examValid.length),
        latencyMs: examMs,
        plan: plan.map((item) => item.subType),
        generationAttempts: examResult.attempts,
        relaxedFallback: examResult.relaxedFallback,
        rejectionSummary: examResult.rejectionSummary,
        rawQuestionCount: examResult.questions.length,
      },
    },
    totalWallMs: Date.now() - startedAt,
  };

  const outPath = path.join(OUTDIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        summary,
        samples: {
          generic: generic.activities.slice(0, 4),
          examQuestions: examResult.questions.slice(0, 4),
          examDrafts: examDrafts.slice(0, 4),
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Saved benchmark detail: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
