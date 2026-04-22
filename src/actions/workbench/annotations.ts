"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth, getAcademyId } from "./_helpers";
import type {
  ActionResult,
  PassageAnnotationInput,
  PassageAnnotationType,
} from "./_types";

// ---------------------------------------------------------------------------
// Annotation persistence — separate from passage create so users can edit
// markings on an already-saved passage without re-writing everything.
// Mutating annotations invalidates the cached passage-analysis (stamped hash)
// so the next analysis run re-reads the latest teacher intent.
// ---------------------------------------------------------------------------
export async function getPassageAnnotations(passageId: string) {
  await requireAuth();
  const rows = await prisma.passageNote.findMany({
    where: { passageId },
    orderBy: { order: "asc" },
  });
  return rows.map((r) => ({
    id: r.annotationId ?? r.id,
    type: (r.noteType as PassageAnnotationType) ?? "vocab",
    text: r.content,
    memo: r.memo ?? "",
    from: r.highlightStart ?? 0,
    to: r.highlightEnd ?? 0,
  }));
}

export async function savePassageAnnotations(
  passageId: string,
  annotations: PassageAnnotationInput[],
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);

    // Guard: passage belongs to this academy
    const passage = await prisma.passage.findFirst({
      where: { id: passageId, academyId },
      select: { id: true },
    });
    if (!passage) {
      return { success: false, error: "지문을 찾을 수 없습니다." };
    }

    const rows = annotations.map((a, index) => ({
      passageId,
      annotationId: a.id,
      noteType: a.type,
      content: a.text,
      memo: a.memo ?? "",
      highlightStart: a.from,
      highlightEnd: a.to,
      order: index,
    }));

    await prisma.$transaction([
      prisma.passageNote.deleteMany({ where: { passageId } }),
      ...(rows.length > 0
        ? [prisma.passageNote.createMany({ data: rows })]
        : []),
      // Invalidate analysis cache — next /api/ai/passage-analysis call will
      // recompute with the updated teacher intent injected via buildAnalysisPrompt.
      prisma.passageAnalysis.updateMany({
        where: { passageId },
        data: { contentHash: `stale-${Date.now()}` },
      }),
    ]);

    revalidatePath("/director/workbench/passages");
    revalidatePath(`/director/workbench/passages/${passageId}`);
    return { success: true, id: passageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "마킹 저장 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Passage Analysis — Save edited analysis
// ---------------------------------------------------------------------------

export async function updatePassageAnalysis(
  passageId: string,
  analysisData: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    const existing = await prisma.passageAnalysis.findUnique({
      where: { passageId },
    });

    if (!existing) {
      return { success: false, error: "분석 데이터가 존재하지 않습니다." };
    }

    await prisma.passageAnalysis.update({
      where: { passageId },
      data: {
        analysisData,
      },
    });

    revalidatePath(`/director/workbench/passages/${passageId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "분석 데이터 저장 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}
