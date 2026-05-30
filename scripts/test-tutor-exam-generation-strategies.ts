import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

process.env.GEMINI_MODEL ??= "gemini-3.5-flash";
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
        korean: "잘못된 추론 중 이미 나쁜 곳에 더 많은 돈을 쏟아붓는 경향만큼 흔한 것은 거의 없다.",
      },
      {
        index: 1,
        english: "Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim.",
        korean: "경제학자들은 이를 매몰 비용 오류라고 부른다.",
      },
      {
        index: 2,
        english: "A factory that has spent millions developing a doomed product will often keep pouring resources into it, simply because so much has already been invested.",
        korean: "실패할 제품에 수백만 달러를 쓴 공장은 이미 많이 투자했다는 이유만으로 계속 자원을 투입하곤 한다.",
      },
      {
        index: 3,
        english: "The same logic infects everyday life: people sit through bad films because they paid for the ticket, stay in unproductive relationships because of the years already invested, and persist in failing careers because turning back would feel like an admission of defeat.",
        korean: "같은 논리는 일상에도 퍼진다.",
      },
      {
        index: 4,
        english: "Rational decision-making, by contrast, requires evaluating each new choice on its own merits, asking not what has been spent but what is still to gain.",
        korean: "반대로 합리적 의사결정은 이미 쓴 것이 아니라 앞으로 얻을 것을 기준으로 새 선택을 평가해야 한다.",
      },
      {
        index: 5,
        english: "The hardest lesson in economics, then, may also be the hardest lesson in life.",
        korean: "따라서 경제학의 가장 어려운 교훈은 삶의 가장 어려운 교훈이기도 하다.",
      },
    ],
    vocabulary: [
      {
        word: "fallacy",
        meaning: "오류",
        partOfSpeech: "noun",
        pronunciation: "",
        sentenceIndex: 1,
        difficulty: "advanced",
        contextMeaning: "논리적으로 잘못된 믿음",
        collocations: ["sunk cost fallacy"],
      },
      {
        word: "justify",
        meaning: "정당화하다",
        partOfSpeech: "verb",
        pronunciation: "",
        sentenceIndex: 1,
        difficulty: "intermediate",
        contextMeaning: "미래 결정을 합리적인 것처럼 보이게 하다",
      },
      {
        word: "commitments",
        meaning: "헌신, 약속",
        partOfSpeech: "noun",
        pronunciation: "",
        sentenceIndex: 1,
        difficulty: "intermediate",
        contextMeaning: "앞으로 계속 자원을 투입하는 결정",
      },
      {
        word: "merits",
        meaning: "장점, 가치",
        partOfSpeech: "noun",
        pronunciation: "",
        sentenceIndex: 4,
        difficulty: "advanced",
        contextMeaning: "그 선택 자체의 현재 가치",
      },
    ],
    grammarPoints: [
      {
        id: "g1",
        pattern: "not A but B",
        explanation: "이미 쓴 비용이 아니라 앞으로 얻을 것을 기준으로 판단한다는 대조 구조",
        textFragment: "not what has been spent but what is still to gain",
        sentenceIndex: 4,
        examples: [],
        level: "advanced",
        commonMistake: "but 뒤 병렬 구조를 놓쳐 해석이 흐려짐",
        transformations: ["not A but B 강조구문 전환"],
      },
      {
        id: "g2",
        pattern: "분사구문",
        explanation: "asking은 앞의 evaluating을 구체화하는 분사구문",
        textFragment: "asking not what has been spent but what is still to gain",
        sentenceIndex: 4,
        examples: [],
        level: "intermediate",
        commonMistake: "asking을 전치사로 오분석",
      },
    ],
    structure: {
      mainIdea: "매몰 비용에 얽매이지 말고 현재 선택의 가치로 판단해야 한다.",
      purpose: "잘못된 의사결정 방식을 설명하고 합리적 판단 기준을 제시",
      textType: "expository",
      paragraphSummaries: [],
      keyPoints: [
        "과거 투자는 미래 선택을 정당화하지 않는다.",
        "일상에서도 매몰 비용 오류가 반복된다.",
        "합리적 판단은 앞으로 얻을 가치에 초점을 둔다.",
      ],
      blankSuitablePositions: ["not what has been spent but what is still to gain"],
      orderClues: ["경제학 개념 제시 -> 공장 예시 -> 일상 예시 -> 합리적 대안"],
    },
    examDesign: {
      paraphrasableSegments: [
        {
          original: "throw good money after bad",
          alternatives: ["continue investing resources in a failing choice"],
          sentenceIndex: 0,
          reason: "핵심 비유 표현",
        },
      ],
      structureTransformPoints: [
        {
          original: "Rational decision-making requires evaluating each new choice on its own merits.",
          transformType: "not A but B 병렬 구조 활용",
          example: "Rational decision-making asks not what has been spent but what is still to gain.",
          sentenceIndex: 4,
          reason: "서술형 변형 가능성이 높음",
        },
      ],
      summaryKeyPoints: ["past investments", "future gain", "rational decision-making"],
      descriptiveConditions: ["not A but B 구조를 사용할 것"],
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
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.");
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
    schoolType: "고등학교",
    gradeInfo: "",
    passageContent: fixture.content,
    teacherIntentBlock: "",
    analysisContext: buildAnalysisContext({
      analysis: { analysisData: JSON.stringify(fixture.analysis) },
    }),
    diffLabel: "INTERMEDIATE",
    diffInstruction: DIFF_DESCRIPTION.INTERMEDIATE,
    generationPlan: "STANDARD",
    customPrompt: "모바일 내신 학습용으로, 정답 근거와 오답 함정이 뚜렷한 문제를 생성한다.",
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
      model: process.env.GEMINI_MODEL,
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
