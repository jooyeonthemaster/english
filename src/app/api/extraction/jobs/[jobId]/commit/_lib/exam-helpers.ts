import type { M4CommitRequest } from "@/lib/extraction/zod-schemas";
import { CommitPayloadError } from "./types";

/**
 * Validate that the `bundles` payload, if supplied, does not assign the same
 * passageOrder to two different bundles. That would deterministically trip
 * PassageBundle's @@unique([sourceMaterialId, passageId]) constraint mid-
 * transaction and roll the whole commit back. We raise a 400 here instead.
 */
export function validateBundlesPayload(bundles: M4CommitRequest["bundles"]): void {
  if (!bundles || bundles.length === 0) return;

  const seenPassageOrders = new Set<number>();
  const seenQuestionOrders = new Set<number>();

  for (const bundle of bundles) {
    if (seenPassageOrders.has(bundle.passageOrder)) {
      throw new CommitPayloadError(
        "BUNDLE_DUPLICATE_PASSAGE",
        "동일한 지문을 가리키는 묶음이 두 개 이상입니다.",
        { passageOrder: bundle.passageOrder },
      );
    }
    seenPassageOrders.add(bundle.passageOrder);

    for (const order of bundle.questionOrders) {
      if (seenQuestionOrders.has(order)) {
        throw new CommitPayloadError(
          "BUNDLE_DUPLICATE_QUESTION",
          "같은 문제가 두 개의 묶음에 동시에 포함되었습니다.",
          { questionOrder: order },
        );
      }
      seenQuestionOrders.add(order);
    }
  }
}

/**
 * Resolve the ordered list of question ids to attach to the Exam via
 * ExamQuestion. Supports an explicit whitelist (`payload.exam.questionOrders`),
 * bundle-scoped inclusion, or the legacy "all questions" fallback.
 */
export function resolveExamQuestionIds(args: {
  payloadExam: NonNullable<M4CommitRequest["exam"]>;
  questionByOrder: Map<number, string>;
  createdQuestionIds: string[];
  bundledQuestionIds: Set<string>;
  hasBundles: boolean;
}): string[] {
  const {
    payloadExam,
    questionByOrder,
    createdQuestionIds,
    bundledQuestionIds,
    hasBundles,
  } = args;

  // Whitelist mode — defensive against future schema field. The Zod schema
  // currently omits `questionOrders`, but accepting it opportunistically
  // keeps the door open without breaking older clients.
  const maybeOrders = (payloadExam as { questionOrders?: unknown }).questionOrders;
  if (Array.isArray(maybeOrders) && maybeOrders.length > 0) {
    const ids: string[] = [];
    for (const raw of maybeOrders) {
      if (typeof raw !== "number" || !Number.isInteger(raw)) {
        throw new CommitPayloadError(
          "BUNDLE_QUESTION_MISSING",
          "exam.questionOrders에 유효하지 않은 값이 있습니다.",
          { value: raw },
        );
      }
      const qid = questionByOrder.get(raw);
      if (!qid) {
        throw new CommitPayloadError(
          "BUNDLE_QUESTION_MISSING",
          "exam.questionOrders가 존재하지 않는 문제를 참조합니다.",
          { questionOrder: raw },
        );
      }
      ids.push(qid);
    }
    return ids;
  }

  // Bundle-scoped: only attach questions that belong to a bundle.
  if (hasBundles) {
    return createdQuestionIds.filter((id) => bundledQuestionIds.has(id));
  }

  // Fallback: every question, insertion order.
  return createdQuestionIds.slice();
}
