import type { Prisma } from "@prisma/client";
import type { StructuredOcrResponse } from "@/lib/extraction/ocr";
import { encodeCircled } from "./helpers";

type StructuredOcrBlock = StructuredOcrResponse["blocks"][number];

export function buildExtractionItemRows(params: {
  jobId: string;
  pageId: string;
  pageIndex: number;
  structured: StructuredOcrResponse;
}): Prisma.ExtractionItemCreateManyInput[] {
  const { jobId, pageId, pageIndex, structured } = params;

  // The page-level meta (pageNumber / pageTotal / examCode / subject / etc.)
  // is needed on EVERY page so finalize can reorder mixed uploads and cluster
  // multi-test jobs. OCR only outputs an EXAM_META block on page 1, so on
  // pages without one we stamp `structured.pageMeta` onto the FIRST item's
  // `examMeta`. Finalize's page-ordering reader picks up either source.
  const pageMetaJson = structured.pageMeta
    ? ((structured.pageMeta as unknown) as Prisma.InputJsonValue)
    : null;
  const hasExamMetaBlock = structured.blocks.some(
    (b) => b.blockType === "EXAM_META",
  );

  return structured.blocks.map((b: StructuredOcrBlock, i: number) => {
    const sharedPassageRange =
      typeof b.sharedPassageRange === "string" &&
      b.sharedPassageRange.trim().length > 0
        ? b.sharedPassageRange.trim()
        : null;

    // 1st-pass question analysis (풀이 + 유형 분류) — 2차 grounded restoration
    // 호출이 별도 problem-evidence 호출 없이 이 정보를 그대로 활용한다.
    const questionAnalysis =
      b.blockType === "QUESTION_STEM" && b.questionAnalysis
        ? {
            questionType: b.questionAnalysis.questionType ?? null,
            typeLabel: b.questionAnalysis.typeLabel ?? null,
            answer: b.questionAnalysis.answer ?? null,
            answerConfidence: b.questionAnalysis.answerConfidence ?? null,
            evidence: Array.isArray(b.questionAnalysis.evidence)
              ? b.questionAnalysis.evidence
              : [],
            warnings: Array.isArray(b.questionAnalysis.warnings)
              ? b.questionAnalysis.warnings
              : [],
          }
        : null;

    const questionMeta: Prisma.InputJsonValue | undefined =
      b.blockType === "QUESTION_STEM"
        ? ({
            number: b.questionNumber ?? null,
            sharedPassageRange,
            ...(questionAnalysis ? { analysis: questionAnalysis } : {}),
          } as Prisma.InputJsonValue)
        : undefined;
    const choiceMeta: Prisma.InputJsonValue | undefined =
      b.blockType === "CHOICE"
        ? {
            index: b.choiceIndex ?? null,
            label: encodeCircled(b.choiceIndex ?? undefined),
            isAnswer: b.isAnswer ?? false,
          }
        : undefined;
    const examMeta: Prisma.InputJsonValue | undefined =
      b.blockType === "EXAM_META"
        ? ((structured.pageMeta ?? {}) as Prisma.InputJsonValue)
        : !hasExamMetaBlock && i === 0 && pageMetaJson !== null
          ? pageMetaJson
          : undefined;

    // 1차 호출에서는 더 이상 본문 복원을 시도하지 않는다 — 복원은 2차의
    // grounded restoration 호출이 담당. 페이지 경계 메타(continues*)는 그대로
    // PASSAGE_BODY passageMeta에 보존해 finalize 의 그룹 빌더가 사용한다.
    const passageMeta: Prisma.InputJsonValue | undefined =
      b.blockType === "PASSAGE_BODY"
        ? {
            wordCount: b.content.split(/\s+/).filter(Boolean).length,
            markerDetected: sharedPassageRange !== null,
            questionRange: sharedPassageRange,
            continuesFromPrevious: b.continuesFromPrevious === true,
            continuesToNext: b.continuesToNext === true,
            boundaryConfidence: b.boundaryConfidence ?? null,
          }
        : undefined;

    return {
      jobId,
      pageId,
      sourcePageIndex: [pageIndex],
      blockType: b.blockType,
      content: b.content,
      rawText: b.content,
      confidence: b.confidence ?? null,
      order: pageIndex * 1000 + i,
      localOrder: null,
      questionMeta,
      choiceMeta,
      examMeta,
      passageMeta,
      needsReview: (b.confidence ?? 1) < 0.7,
      status: "DRAFT",
      groupId: null,
      parentItemId: null,
    };
  });
}
