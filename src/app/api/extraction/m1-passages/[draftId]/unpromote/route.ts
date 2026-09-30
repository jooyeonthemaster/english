import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/lib/app-events";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ draftId: string }>;
}

/** 잠금과 삭제 사이에 다른 요청이 같은 지문을 지웠다(삭제 행 수 ≠ 1) — 트랜잭션을 되돌리고 409. */
class UnpromoteRaceError extends Error {
  constructor() {
    super("지문 삭제가 다른 요청과 겹쳤습니다. 다시 시도해 주세요.");
  }
}

/** Prisma P2003(외래키 위반) — RESTRICT 자식이 남아 DELETE 가 거부됐다. */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2003";
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
    select: { id: true, title: true },
  });
  // Detached or already-deleted Passage — just reset the draft pointers.
  const resetDraftPointers = async () => {
    await prisma.extractionM1PassageDraft.update({
      where: { id: draft.id },
      data: {
        savedPassageId: null,
        reviewStatus: "REVIEWED",
        confirmedAt: null,
      },
    });
    return NextResponse.json({ draftId: draft.id, unpromoted: true });
  };
  if (!passage) return resetDraftPointers();

  // 이 지문을 이미 다른 곳에서 쓰고 있으면 막는다. 운영 외래키 실측(pg_constraint, 26-09-30):
  //   RESTRICT — naeshin_questions · learning_sets · season_passages · session_records · lesson_progress ·
  //              tutor_lessons. 남아 있으면 DELETE 가 외래키 위반으로 실패한다(예전엔 내신 문항을 세지 않아 500).
  //   SET NULL — questions · teacher_prompts. 지우면 원문 보관 없이 고아가 된다 → 정책상 막는다.
  //   CASCADE  — prebuilt_sessions 는 학습 세션이 사라지므로 정책상 막는다. 그 밖의 CASCADE 자식
  //              (passage_analyses · passage_notes · passage_collection_items · passage_bundles ·
  //              passage_reports · webtoons · tutor_conversations)은 지문과 함께 지워진다.
  // 세는 것은 지문 행을 FOR UPDATE 로 잠근 **뒤** 한 번이다(PI-R11): 잠금은 자식 INSERT 의 FOR KEY SHARE 와
  // 충돌하므로 잠근 뒤에는 새 연결이 붙지 못하고, 잠그기 전에 붙은 연결은 이 집계에 잡힌다(TOCTOU 없음).
  const inUse = (list: Array<{ label: string; count: number }>) =>
    errorResponse(
      "PASSAGE_IN_USE",
      `이미 ${list.map((b) => `${b.label} ${b.count}건`).join(", ")}에서 사용 중이라 등록을 취소할 수 없습니다.`,
      409,
      list,
    );

  let outcome:
    | { kind: "gone" }
    | { kind: "in-use"; blockers: Array<{ label: string; count: number }> }
    | { kind: "deleted" };
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM passages
        WHERE id = ${passageId} AND "academyId" = ${staff.academyId}
        FOR UPDATE`;
      if (locked.length === 0) return { kind: "gone" as const };

      const where = { where: { passageId } };
      const counts: Array<[string, number]> = [
        ["문제", await tx.question.count(where)],
        ["교사 프롬프트", await tx.teacherPrompt.count(where)],
        ["내신 문항", await tx.naeshinQuestion.count(where)],
        ["시즌", await tx.seasonPassage.count(where)],
        ["수업 진도", await tx.lessonProgress.count(where)],
        ["수업 기록", await tx.sessionRecord.count(where)],
        ["프리빌트 세션", await tx.prebuiltSession.count(where)],
        ["학습 세트", await tx.learningSet.count(where)],
        ["튜터 레슨", await tx.tutorLesson.count(where)],
      ];
      const blockers = counts
        .filter(([, count]) => count > 0)
        .map(([label, count]) => ({ label, count }));
      if (blockers.length > 0) return { kind: "in-use" as const, blockers };

      await tx.extractionAuditLog.create({
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
      });
      const deleted = await tx.passage.deleteMany({
        where: { id: passageId, academyId: staff.academyId },
      });
      if (deleted.count !== 1) throw new UnpromoteRaceError();
      await tx.extractionM1PassageDraft.update({
        where: { id: draft.id },
        data: {
          savedPassageId: null,
          reviewStatus: "REVIEWED",
          confirmedAt: null,
        },
      });
      return { kind: "deleted" as const };
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    // 트랜잭션은 되돌려졌다(지문 · 초안 · 감사 기록 모두 그대로). 500 대신 이유를 돌려준다.
    if (error instanceof UnpromoteRaceError) {
      return errorResponse("CONFLICT", error.message, 409);
    }
    // 위 목록 밖의 외래키(RESTRICT)가 지문을 붙잡고 있다 — 새 연결 테이블이 생겨도 500 이 아니라 409.
    if (isForeignKeyViolation(error)) {
      return errorResponse(
        "PASSAGE_IN_USE",
        "이 지문을 다른 자료에서 사용 중이라 등록을 취소할 수 없습니다.",
        409,
      );
    }
    console.error("[m1 unpromote] failed:", error);
    return errorResponse("UNPROMOTE_FAILED", "등록 취소 중 오류가 발생했습니다. 다시 시도해 주세요.", 500);
  }

  if (outcome.kind === "gone") return resetDraftPointers();
  if (outcome.kind === "in-use") return inUse(outcome.blockers);

  // 관리자 활동 피드의 「지문 삭제」(PASSAGE_DELETE 감사 — 가드 경로와 같은 이벤트형). 실패해도 삼킨다.
  await logAppEvent({
    academyId: staff.academyId,
    actorType: "STAFF",
    actorId: staff.id,
    eventType: "PASSAGE_DELETE",
    resourceType: "PASSAGE",
    resourceId: passageId,
    metadata: {
      via: "m1-unpromote",
      title: passage.title,
      mode: "plain",
      liveQuestionCount: 0,
      trashedQuestionCount: 0,
      draftId: draft.id,
      jobId: draft.jobId,
    },
  });

  return NextResponse.json({ draftId: draft.id, unpromoted: true });
}
