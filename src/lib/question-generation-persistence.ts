import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "@/lib/concurrency-config";
import {
  buildGrammarCorrectionQuestionTextForDisplay,
  grammarCorrectionErrorSentenceForQuestionText,
} from "@/lib/grammar-correction-display";
import {
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";

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
  const typeId =
    typeof q._typeId === "string"
      ? q._typeId
      : typeof q.subType === "string"
        ? q.subType
        : "";
  const isSummaryCompleteMc = typeId === "SUMMARY_COMPLETE_MC";
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value);
  };

  if (typeId === "GRAMMAR_CORRECTION") {
    const text = buildGrammarCorrectionQuestionTextForDisplay(q);
    if (text) return text;
  }

  // 커스텀 레이아웃(v2): 생성기가 LayoutDoc 에서 결정적으로 조립한 questionText(마커 미니 DSL)를
  // 그대로 저장한다 — 시험지/DOCX/HWPX 파서가 이 문자열을 소비한다. 필드 조합 직렬화를 타면
  // direction 만 남는 문제가 있어 명시 분기(GRAMMAR_CORRECTION 과 같은 전례).
  if (typeId === "CUSTOM_LAYOUT" && typeof q.questionText === "string" && q.questionText.trim()) {
    return q.questionText;
  }

  push(q.direction);
  // 주어진 문장(문장삽입·글의 순서)은 지문/단락 '위'에 박스로 와야 한다.
  // 한글 라벨 '[주어진 문장]'으로 통일해 DOCX/HWPX 파서(parseQuestionSections)·
  // 시험지 렌더(splitSentenceInsertGivenBlock)와 일치시킨다. (이전: '[given]'을
  // passageWithMarkers '뒤'에 직렬화해 시험지에서 주어진 문장이 지문 아래로 가고
  // 영문 '[given]' 라벨이 노출되던 버그를 바로잡음.)
  if (q.givenSentence) parts.push(`[주어진 문장] ${String(q.givenSentence)}`);
  push(q.passageWithBlank);
  if (typeId !== "GRAMMAR_CORRECTION") push(q.passageWithMarkers);
  push(q.passageWithUnderline);
  push(q.passageWithNumbers);
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

  if (q.referenceSentence) parts.push(`[영작할 우리말] ${String(q.referenceSentence)}`);
  if (q.originalSentence) parts.push(`[원문] ${String(q.originalSentence)}`);
  if (Array.isArray(q.conditions) && q.conditions.length > 0) {
    parts.push(
      `[조건]\n${q.conditions
        .map((c, i) => `${i + 1}. ${String(c)}`)
        .join("\n")}`,
    );
  }
  push(q.sentenceWithBlank);
  if (q.summaryWithBlanks) {
    const summary = isSummaryCompleteMc
      ? formatSummaryCompleteMcSummaryForDisplay(
        String(q.summaryWithBlanks),
        readSummaryBlankAnswersFromQuestionLike(q),
      )
      : String(q.summaryWithBlanks);
    parts.push(isSummaryCompleteMc ? `\u2193\n${summary}` : `[요약문] ${summary}`);
  }
  if (!isSummaryCompleteMc && Array.isArray(q.blanks) && q.blanks.length > 0) {
    parts.push(
      `[빈칸 정답] ${q.blanks
        .map((b) => {
          const row = b as Record<string, unknown>;
          return `${String(row.label ?? "")} ${String(row.answer ?? "")}`.trim();
        })
        .join(", ")}`,
    );
  }
  if (Array.isArray(q.scrambledWords) && q.scrambledWords.length > 0) {
    parts.push(`[배열 단어] ${q.scrambledWords.map(String).join(" / ")}`);
  }
  if (q.contextHint) parts.push(`[힌트] ${String(q.contextHint)}`);
  if (q.sentenceWithError && typeId !== "GRAMMAR_CORRECTION") {
    push(grammarCorrectionErrorSentenceForQuestionText(q));
  }
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
