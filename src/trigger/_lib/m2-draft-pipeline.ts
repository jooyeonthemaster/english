import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { splitEnglishSentences } from "@/lib/extraction/sentences";
import type { EnrichedDraft } from "@/lib/extraction/segmentation";
import {
  buildRestorationPrompts,
  buildVerificationPrompts,
  passageRestorationResponseSchema,
  passageVerificationResponseSchema,
  type PassageRestorationResponse,
  type PassageVerificationResponse,
  type RestorationQuestionInput,
  type SourceMatchInput,
} from "@/lib/extraction/m2-restoration";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import { generateStructuredTextWithTriggerFetch } from "./gemini-ocr";
import { findM2SourceMatches } from "./m2-source-match";

const TEXT_CALL_TIMEOUT_MS = 120_000;

interface PreparedM2Draft {
  draft: EnrichedDraft;
  questions: RestorationQuestionInput[];
  sourceMatches: SourceMatchInput[];
  restoration: PassageRestorationResponse;
  verification: PassageVerificationResponse;
}

function hasRestorablePassage(draft: EnrichedDraft): boolean {
  return Boolean(draft.passageItemId) && draft.content.trim().length > 0;
}

function sharesPage(a: EnrichedDraft, b: EnrichedDraft): boolean {
  const pages = new Set(a.sourcePageIndex);
  return b.sourcePageIndex.some((page) => pages.has(page));
}

function attachQuestionOnlyDraft(
  target: EnrichedDraft,
  questionOnlyDraft: EnrichedDraft,
): EnrichedDraft {
  const orphanQuestion = questionOnlyDraft.questions[0];
  const syntheticIndex = target.questions.findIndex((question) =>
    question.questionItemId.startsWith("orphan-stem:"),
  );

  if (
    questionOnlyDraft.questions.length === 1 &&
    orphanQuestion &&
    orphanQuestion.choices.length === 0 &&
    syntheticIndex >= 0 &&
    target.questions[syntheticIndex]?.choices.length
  ) {
    const syntheticQuestion = target.questions[syntheticIndex];
    const questions = [...target.questions];
    questions[syntheticIndex] = {
      ...orphanQuestion,
      choices: syntheticQuestion.choices,
      explanation: orphanQuestion.explanation ?? syntheticQuestion.explanation,
    };
    return { ...target, questions };
  }

  return {
    ...target,
    questions: [...questionOnlyDraft.questions, ...target.questions],
  };
}

function prepareRestorableDrafts(drafts: EnrichedDraft[]): EnrichedDraft[] {
  const restorable = drafts
    .filter(hasRestorablePassage)
    .map((draft) => ({ ...draft, questions: [...draft.questions] }));

  for (const questionOnlyDraft of drafts) {
    if (
      hasRestorablePassage(questionOnlyDraft) ||
      questionOnlyDraft.questions.length === 0
    ) {
      continue;
    }

    const targetIndex = restorable
      .map((draft, index) => ({
        draft,
        index,
        sharedPage: sharesPage(questionOnlyDraft, draft),
        distance: Math.abs(draft.passageOrder - questionOnlyDraft.passageOrder),
        direction: draft.passageOrder >= questionOnlyDraft.passageOrder ? 0 : 1,
      }))
      .sort((a, b) => {
        if (a.sharedPage !== b.sharedPage) return a.sharedPage ? -1 : 1;
        if (a.direction !== b.direction) return a.direction - b.direction;
        return a.distance - b.distance;
      })[0]?.index;

    if (targetIndex != null) {
      restorable[targetIndex] = attachQuestionOnlyDraft(
        restorable[targetIndex],
        questionOnlyDraft,
      );
    }
  }

  return restorable;
}

function questionsForRestoration(
  draft: EnrichedDraft,
): RestorationQuestionInput[] {
  return draft.questions.map((q) => ({
    questionNumber: q.questionNumber,
    stem: q.stem,
    choices: q.choices.map((choice) => ({
      label: choice.label,
      content: choice.content,
      isAnswer: choice.isAnswer,
    })),
    explanation: q.explanation,
  }));
}

function answerSignal(question: RestorationQuestionInput): string | null {
  const marked = question.choices.find((choice) => choice.isAnswer);
  if (!marked) return null;
  return `${marked.label} ${marked.content}`;
}

function fallbackRestoration(problemText: string, error: unknown): PassageRestorationResponse {
  return {
    status: "FAILED",
    method: "FAILED",
    restoredText: problemText,
    confidence: 0,
    sentences: splitEnglishSentences(problemText).map((text, index) => ({
      order: index + 1,
      text,
      status: "UNRESOLVED",
    })),
    changes: [],
    unresolvedMarkers: [],
    warnings: [
      `Restoration failed: ${error instanceof Error ? error.message : String(error)}`,
    ],
  };
}

function fallbackVerification(error: unknown): PassageVerificationResponse {
  return {
    status: "FAIL",
    confidence: 0,
    warnings: [
      `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
    ],
    remainingProblemMarkers: [],
    suspiciousChanges: [],
    teacherReviewRequired: true,
  };
}

async function restorePassage(input: {
  problemText: string;
  questions: RestorationQuestionInput[];
  sourceMatches: SourceMatchInput[];
}): Promise<PassageRestorationResponse> {
  const prompts = buildRestorationPrompts(input);
  try {
    const result = await generateStructuredTextWithTriggerFetch({
      stage: "passage-restoration",
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      timeoutInMs: TEXT_CALL_TIMEOUT_MS,
      schema: passageRestorationResponseSchema,
    });
    return result.object;
  } catch (err) {
    return fallbackRestoration(input.problemText, err);
  }
}

async function verifyRestoration(input: {
  problemText: string;
  restoration: PassageRestorationResponse;
  questions: RestorationQuestionInput[];
}): Promise<PassageVerificationResponse> {
  const prompts = buildVerificationPrompts({
    problemText: input.problemText,
    restoredText: input.restoration.restoredText,
    questions: input.questions,
    changes: input.restoration.changes,
  });
  try {
    const result = await generateStructuredTextWithTriggerFetch({
      stage: "restoration-verification",
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      timeoutInMs: TEXT_CALL_TIMEOUT_MS,
      schema: passageVerificationResponseSchema,
    });
    return result.object;
  } catch (err) {
    return fallbackVerification(err);
  }
}

function sentenceRows(input: {
  passageDraftId: string;
  problemText: string;
  restoration: PassageRestorationResponse;
}): Prisma.ExtractionPassageSentenceCreateManyInput[] {
  const restoredSentences =
    input.restoration.sentences.length > 0
      ? input.restoration.sentences
      : splitEnglishSentences(input.restoration.restoredText).map((text, idx) => ({
          order: idx + 1,
          text,
          status: "OK" as const,
        }));
  const problemSentences = splitEnglishSentences(input.problemText);

  return restoredSentences.map((sentence, idx) => ({
    passageDraftId: input.passageDraftId,
    order: sentence.order || idx + 1,
    problemText: problemSentences[idx] ?? null,
    restoredText: sentence.text,
    status: sentence.status,
    metadata: {} as Prisma.InputJsonValue,
  }));
}

export async function persistM2ExtractionDrafts(input: {
  jobId: string;
  academyId: string;
  sourceMaterialId: string | null;
  drafts: EnrichedDraft[];
}): Promise<{ passageDraftCount: number; questionDraftCount: number }> {
  const restorableDrafts = prepareRestorableDrafts(input.drafts);
  if (restorableDrafts.length === 0) {
    return { passageDraftCount: 0, questionDraftCount: 0 };
  }

  const prepared: PreparedM2Draft[] = [];
  for (const draft of restorableDrafts) {
    const questions = questionsForRestoration(draft);
    const sourceMatches = await findM2SourceMatches({
      academyId: input.academyId,
      problemText: draft.content,
    });
    const restoration = await restorePassage({
      problemText: draft.content,
      questions,
      sourceMatches,
    });
    const verification = await verifyRestoration({
      problemText: draft.content,
      restoration,
      questions,
    });
    prepared.push({ draft, questions, sourceMatches, restoration, verification });
  }

  await prisma.$transaction(async (tx) => {
    await tx.extractionPassageDraft.deleteMany({ where: { jobId: input.jobId } });
    await tx.extractionQuestionDraft.deleteMany({ where: { jobId: input.jobId } });

    for (const item of prepared) {
      const warnings = [
        ...item.restoration.warnings,
        ...item.verification.warnings,
      ];
      const passageDraft = await tx.extractionPassageDraft.create({
        data: {
          jobId: input.jobId,
          sourceMaterialId: input.sourceMaterialId,
          passageOrder: item.draft.passageOrder,
          sourcePageIndex: item.draft.sourcePageIndex,
          problemText: item.draft.content,
          restoredText: item.restoration.restoredText,
          teacherText: item.restoration.restoredText,
          restorationStatus: item.restoration.status,
          verificationStatus: item.verification.status,
          reviewStatus: "DRAFT",
          confidence: item.restoration.confidence,
          warnings: warnings as Prisma.InputJsonValue,
          metadata: {
            passageItemId: item.draft.passageItemId,
            model: {
              restoration: getExtractionAiModelName("passage-restoration"),
              verification: getExtractionAiModelName("restoration-verification"),
            },
            verification: item.verification,
          } as Prisma.InputJsonValue,
        },
      });

      if (item.sourceMatches.length > 0) {
        await tx.extractionPassageSourceMatch.createMany({
          data: item.sourceMatches.map((match, index) => ({
            passageDraftId: passageDraft.id,
            sourceType: match.sourceType,
            sourceId: match.sourceId ?? null,
            sourceRef: match.sourceRef ?? null,
            title: match.title,
            publisher: match.publisher ?? null,
            unit: match.unit ?? null,
            year: match.year ?? null,
            confidence: match.confidence,
            method: "LOCAL_DB",
            reason: match.reason,
            selected: index === 0 && match.confidence >= 0.9,
            metadata: (match.metadata ?? {}) as Prisma.InputJsonValue,
          })),
        });
      }

      const restorationRow = await tx.extractionPassageRestoration.create({
        data: {
          passageDraftId: passageDraft.id,
          method: item.restoration.method,
          status: item.restoration.status,
          confidence: item.restoration.confidence,
          originalText: item.draft.content,
          restoredText: item.restoration.restoredText,
          modelUsed: getExtractionAiModelName("passage-restoration"),
          unresolvedMarkers: item.restoration.unresolvedMarkers as Prisma.InputJsonValue,
          warnings: item.restoration.warnings as Prisma.InputJsonValue,
          rawResponse: item.restoration as Prisma.InputJsonValue,
        },
      });

      if (item.restoration.changes.length > 0) {
        await tx.extractionPassageRestorationChange.createMany({
          data: item.restoration.changes.map((change) => ({
            restorationId: restorationRow.id,
            sentenceOrder: change.sentenceOrder ?? null,
            before: change.before,
            after: change.after,
            reason: change.reason,
            evidenceQuestionNumber: change.evidenceQuestionNumber ?? null,
            evidenceType: change.evidenceType,
            confidence: change.confidence,
          })),
        });
      }

      const sentences = sentenceRows({
        passageDraftId: passageDraft.id,
        problemText: item.draft.content,
        restoration: item.restoration,
      });
      if (sentences.length > 0) {
        await tx.extractionPassageSentence.createMany({
          data: sentences,
        });
      }

      for (const [questionIndex, question] of item.draft.questions.entries()) {
        await tx.extractionQuestionDraft.create({
          data: {
            jobId: input.jobId,
            passageDraftId: passageDraft.id,
            questionOrder: item.draft.passageOrder * 1000 + questionIndex,
            questionNumber: question.questionNumber,
            sourcePageIndex: item.draft.sourcePageIndex,
            stem: question.stem,
            choices: question.choices as unknown as Prisma.InputJsonValue,
            answer: answerSignal(item.questions[questionIndex]) ?? null,
            explanation: question.explanation,
            questionType: null,
            confidence: item.draft.confidence,
            warnings: [] as Prisma.InputJsonValue,
            reviewStatus: "DRAFT",
            metadata: {
              questionItemId: question.questionItemId,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
  });

  return {
    passageDraftCount: prepared.length,
    questionDraftCount: prepared.reduce(
      (sum, item) => sum + item.draft.questions.length,
      0,
    ),
  };
}
