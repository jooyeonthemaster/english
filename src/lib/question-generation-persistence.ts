import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "@/lib/concurrency-config";
import {
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return rawTags
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

export function buildGeneratedQuestionText(q: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value);
  };

  push(q.direction);
  if (q.matchType) parts.push(`[type: ${String(q.matchType)}]`);
  push(q.passageWithBlank);
  push(q.passageWithMarkers);
  push(q.passageWithUnderline);
  push(q.passageWithNumbers);
  if (q.givenSentence) parts.push(`[given] ${String(q.givenSentence)}`);
  if (Array.isArray(q.paragraphs)) {
    parts.push(
      q.paragraphs
        .map((p) => {
          const row = p as Record<string, unknown>;
          return `${String(row.label ?? "")} ${String(row.text ?? "")}`.trim();
        })
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (q.referenceSentence) parts.push(`[reference] ${String(q.referenceSentence)}`);
  if (q.originalSentence) parts.push(`[original] ${String(q.originalSentence)}`);
  if (Array.isArray(q.conditions) && q.conditions.length > 0) {
    parts.push(
      `[conditions]\n${q.conditions
        .map((c, i) => `${i + 1}. ${String(c)}`)
        .join("\n")}`,
    );
  }
  push(q.sentenceWithBlank);
  if (q.summaryWithBlanks) parts.push(`[summary] ${String(q.summaryWithBlanks)}`);
  if (Array.isArray(q.blanks) && q.blanks.length > 0) {
    parts.push(
      `[blank answers] ${q.blanks
        .map((b) => {
          const row = b as Record<string, unknown>;
          return `${String(row.label ?? "")} ${String(row.answer ?? "")}`.trim();
        })
        .join(", ")}`,
    );
  }
  if (Array.isArray(q.scrambledWords) && q.scrambledWords.length > 0) {
    parts.push(`[word order] ${q.scrambledWords.map(String).join(" / ")}`);
  }
  if (q.contextHint) parts.push(`[hint] ${String(q.contextHint)}`);
  if (q.sentenceWithError) {
    parts.push(`[error sentence] ${String(q.sentenceWithError)}`);
  }
  if (q.targetWord) parts.push(`[target] ${String(q.targetWord)}`);
  if (q.contextSentence) parts.push(`[context] ${String(q.contextSentence)}`);
  if (q.questionText && !q.direction) push(q.questionText);

  return parts.filter(Boolean).join("\n\n");
}

export async function saveGeneratedQuestionsForJob({
  academyId,
  passageId,
  questions,
  generationPlan,
  skipPassageEligibilityCheck = false,
}: {
  academyId: string;
  passageId: string;
  questions: Record<string, unknown>[];
  generationPlan: QuestionGenerationPlan;
  skipPassageEligibilityCheck?: boolean;
}): Promise<string[]> {
  if (questions.length === 0) return [];

  if (!skipPassageEligibilityCheck) {
    const eligiblePassage = await prisma.passage.findFirst({
      where: { id: passageId, academyId },
      select: { id: true },
    });
    if (!eligiblePassage) {
      throw new Error("Passage not found before saving questions.");
    }
  }

  const createdIds: string[] = [];
  const createInputs = questions.map((q) => {
    const plan = normalizeQuestionGenerationPlan(
      q._generationPlan ?? generationPlan,
    );
    const tags = mergeQuestionGenerationPlanTag(readQuestionTags(q.tags), plan);
    const enriched = { ...q, _generationPlan: plan, tags };
    const options = q.options;
    const explanation = q.explanation;
    const keyPoints = q.keyPoints;
    const wrongOptionExplanations = q.wrongOptionExplanations;

    const explanationCreate =
      typeof explanation === "string" && explanation.trim()
        ? {
            create: {
              content: explanation,
              keyPoints:
                keyPoints === undefined || keyPoints === null
                  ? null
                  : typeof keyPoints === "string"
                    ? keyPoints
                    : JSON.stringify(keyPoints),
              wrongOptionExplanations:
                wrongOptionExplanations === undefined ||
                wrongOptionExplanations === null
                  ? null
                  : typeof wrongOptionExplanations === "string"
                    ? wrongOptionExplanations
                    : JSON.stringify(wrongOptionExplanations),
              aiGenerated: true,
            },
          }
        : undefined;

    return {
      data: {
        academyId,
        passageId,
        type: Array.isArray(options) ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
        subType:
          typeof q._typeId === "string"
            ? q._typeId
            : typeof q.subType === "string"
              ? q.subType
              : null,
        questionText: buildGeneratedQuestionText(q),
        structuredData: toPrismaJson(enriched),
        options: Array.isArray(options) ? JSON.stringify(options) : null,
        correctAnswer:
          typeof q.correctAnswer === "string"
            ? q.correctAnswer
            : typeof q.modelAnswer === "string"
              ? q.modelAnswer
              : "",
        points: 1,
        difficulty:
          typeof q.difficulty === "string" ? q.difficulty : "INTERMEDIATE",
        tags: JSON.stringify(tags),
        aiGenerated: true,
        approved: false,
        explanation: explanationCreate,
      },
    };
  });

  await prisma.$transaction(
    async (tx) => {
      for (const input of createInputs) {
        const question = await tx.question.create(input);
        createdIds.push(question.id);
      }
    },
    { maxWait: 10_000, timeout: QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS },
  );

  return createdIds;
}
