import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ draftId: string }>;
}

export async function POST(_req: Request, ctx: RouteContext) {
  const { draftId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const draft = await prisma.extractionM1PassageDraft.findFirst({
    where: {
      id: draftId,
      deletedAt: null,
      job: { academyId: staff.academyId, deletedAt: null },
    },
    select: {
      id: true,
      jobId: true,
      passageOrder: true,
      title: true,
      savedPassageId: true,
      job: {
        select: { displayName: true, originalFileName: true },
      },
    },
  });
  if (!draft) {
    return errorResponse("NOT_FOUND", "지문 추출 결과를 찾을 수 없습니다.", 404);
  }

  if (!draft.savedPassageId) {
    return errorResponse(
      "NOT_PROMOTED",
      "아직 검수가 완료되지 않은 자료입니다.",
      400,
    );
  }

  const passageId = draft.savedPassageId;
  const passage = await prisma.passage.findFirst({
    where: { id: passageId, academyId: staff.academyId },
    select: { id: true },
  });
  // Detached or already-deleted Passage — just reset the draft pointers.
  if (!passage) {
    await prisma.extractionM1PassageDraft.update({
      where: { id: draft.id },
      data: {
        savedPassageId: null,
        reviewStatus: "REVIEWED",
        confirmedAt: null,
      },
    });
    return NextResponse.json({ draftId: draft.id, unpromoted: true });
  }

  // Block when the Passage has already been consumed elsewhere. Cascading
  // children (PassageAnalysis, PassageNote, NaeshinQuestion, collection/bundle
  // items, Webtoon, TutorConversation) get cleaned up automatically; SetNull
  // children (WorkbenchAiJob, TutorAiLog) keep their rows. We only need to
  // guard the restrict-style relations that would otherwise lose data.
  const [
    questionCount,
    teacherPromptCount,
    seasonPassageCount,
    lessonProgressCount,
    sessionRecordCount,
    prebuiltSessionCount,
    learningSetCount,
    tutorLessonCount,
  ] = await Promise.all([
    prisma.question.count({ where: { passageId } }),
    prisma.teacherPrompt.count({ where: { passageId } }),
    prisma.seasonPassage.count({ where: { passageId } }),
    prisma.lessonProgress.count({ where: { passageId } }),
    prisma.sessionRecord.count({ where: { passageId } }),
    prisma.prebuiltSession.count({ where: { passageId } }),
    prisma.learningSet.count({ where: { passageId } }),
    prisma.tutorLesson.count({ where: { passageId } }),
  ]);

  const blockers: Array<{ label: string; count: number }> = [];
  if (questionCount > 0) blockers.push({ label: "문제", count: questionCount });
  if (teacherPromptCount > 0)
    blockers.push({ label: "교사 프롬프트", count: teacherPromptCount });
  if (seasonPassageCount > 0)
    blockers.push({ label: "시즌", count: seasonPassageCount });
  if (lessonProgressCount > 0)
    blockers.push({ label: "수업 진도", count: lessonProgressCount });
  if (sessionRecordCount > 0)
    blockers.push({ label: "수업 기록", count: sessionRecordCount });
  if (prebuiltSessionCount > 0)
    blockers.push({ label: "프리빌트 세션", count: prebuiltSessionCount });
  if (learningSetCount > 0)
    blockers.push({ label: "학습 세트", count: learningSetCount });
  if (tutorLessonCount > 0)
    blockers.push({ label: "튜터 레슨", count: tutorLessonCount });

  if (blockers.length > 0) {
    const summary = blockers
      .map((b) => `${b.label} ${b.count}건`)
      .join(", ");
    return errorResponse(
      "PASSAGE_IN_USE",
      `이미 ${summary}에서 사용 중이라 등록을 취소할 수 없습니다.`,
      409,
      blockers,
    );
  }

  await prisma.$transaction([
    prisma.extractionAuditLog.create({
      data: {
        academyId: staff.academyId,
        actorStaffId: staff.id,
        action: "M1_DRAFT_UNPROMOTE",
        targetType: "EXTRACTION_M1_PASSAGE_DRAFT",
        targetId: draft.id,
        targetLabel:
          draft.title || draft.job.displayName || draft.job.originalFileName,
        metadata: {
          jobId: draft.jobId,
          passageOrder: draft.passageOrder,
          passageId,
        },
      },
    }),
    prisma.passage.delete({ where: { id: passageId } }),
    prisma.extractionM1PassageDraft.update({
      where: { id: draft.id },
      data: {
        savedPassageId: null,
        reviewStatus: "REVIEWED",
        confirmedAt: null,
      },
    }),
  ]);

  return NextResponse.json({ draftId: draft.id, unpromoted: true });
}
