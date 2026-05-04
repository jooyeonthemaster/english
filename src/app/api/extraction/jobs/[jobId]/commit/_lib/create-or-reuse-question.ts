import { Prisma as PrismaNS } from "@prisma/client";
import type { QuestionInput, TxClient } from "./types";
import { CommitPayloadError, ERR_CROSS_TENANT } from "./types";

const CHOICE_LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦"] as const;

/**
 * Promote a Question payload into a Question row — re-commit safe.
 *
 * Same reasoning as createOrReusePassage: Question.sourceExtractionItemId is
 * @unique, and questionSets with a single sourceItemId must survive a re-
 * commit without colliding on the unique constraint.
 */
export async function createOrReuseQuestion(
  tx: TxClient,
  args: {
    academyId: string;
    sourceMaterialId: string;
    passageId: string | null;
    bundleId: string | null;
    input: QuestionInput;
    /** When true, overwrite teacher-edited fields on re-commit (opt-in). */
    overwriteExisting: boolean;
  },
): Promise<{ row: { id: string }; skipped: boolean }> {
  const {
    academyId,
    sourceMaterialId,
    passageId,
    bundleId,
    input,
    overwriteExisting,
  } = args;

  // Pack choices into the canonical JSON shape used everywhere else.
  const options =
    input.choices && input.choices.length > 0
      ? JSON.stringify(
          input.choices.map((text, idx) => ({
            label: CHOICE_LABELS[idx] ?? `${idx + 1}`,
            text,
          })),
        )
      : null;

  const type = options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER";

  const sourceExtractionItemId =
    input.sourceItemIds && input.sourceItemIds.length === 1
      ? input.sourceItemIds[0]
      : undefined;

  const data = {
    academyId,
    passageId: passageId ?? undefined,
    sourceMaterialId,
    bundleId: bundleId ?? undefined,
    sourceExtractionItemId,
    questionNumber: input.questionNumber,
    type,
    questionText: input.stem,
    options,
    correctAnswer: input.correctAnswer ?? "",
    points: input.points !== undefined ? Math.round(input.points) : 1,
    aiGenerated: false,
    approved: false,
  };

  // Fast path: existing question already promoted from this ExtractionItem.
  if (sourceExtractionItemId) {
    const existing = await tx.question.findFirst({
      where: {
        academyId,
        sourceExtractionItemId,
      },
      select: { id: true },
    });
    if (existing) {
      if (overwriteExisting) {
        const updated = await tx.question.update({
          where: { id: existing.id },
          data,
        });
        return { row: updated, skipped: false };
      }
      return { row: existing, skipped: true };
    }
  }

  try {
    const created = await tx.question.create({ data });
    return { row: created, skipped: false };
  } catch (err) {
    if (
      err instanceof PrismaNS.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      sourceExtractionItemId
    ) {
      const winner = await tx.question.findFirst({
        where: {
          academyId,
          sourceExtractionItemId,
        },
        select: { id: true },
      });
      if (winner) {
        if (overwriteExisting) {
          const updated = await tx.question.update({
            where: { id: winner.id },
            data,
          });
          return { row: updated, skipped: false };
        }
        return { row: winner, skipped: true };
      }
      // Cross-tenant: the sourceExtractionItemId unique is held by a Question
      // in another academy. Raise 403 instead of a generic 500.
      throw new CommitPayloadError(
        ERR_CROSS_TENANT,
        "다른 학원에서 이미 사용된 추출 데이터입니다.",
        { sourceItemIds: input.sourceItemIds },
      );
    }
    throw err;
  }
}
