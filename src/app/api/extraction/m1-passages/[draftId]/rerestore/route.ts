import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";
import { buildM1SourceMatchRows } from "@/lib/extraction/m1-draft-persistence";
import type { RestorationQuestionInput } from "@/lib/extraction/restoration";
import { restoreM1Passage } from "@/trigger/_lib/m1-passage-restoration";

/**
 * draft.metadata.questions(추출 finalize가 저장한 {questionNumber, stem, choices})를
 * RestorationQuestionInput[]로 안전 변환. 있으면 복원 AI에 문제 컨텍스트를 줘
 * (빈칸/순서/삽입 근거) 복원 정확도를 높인다. verbatim/DocAI 드래프트는 questions가
 * 비어 있어 [] 반환 — rawText 단독 복원으로 자연 폴백.
 */
function readQuestionsFromMetadata(metadata: unknown): RestorationQuestionInput[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const raw = (metadata as Record<string, unknown>).questions;
  if (!Array.isArray(raw)) return [];
  const out: RestorationQuestionInput[] = [];
  for (const q of raw) {
    if (!q || typeof q !== "object" || Array.isArray(q)) continue;
    const obj = q as Record<string, unknown>;
    const stem = typeof obj.stem === "string" ? obj.stem : "";
    const questionNumber =
      typeof obj.questionNumber === "number" ? obj.questionNumber : null;
    const choices = Array.isArray(obj.choices)
      ? obj.choices
          .filter((c): c is Record<string, unknown> =>
            Boolean(c) && typeof c === "object" && !Array.isArray(c),
          )
          .map((c) => ({
            label: typeof c.label === "string" ? c.label : "",
            content: typeof c.content === "string" ? c.content : "",
            isAnswer: c.isAnswer === true,
          }))
      : [];
    const explanation =
      typeof obj.explanation === "string" ? obj.explanation : null;
    if (stem || choices.length > 0) {
      out.push({ questionNumber, stem, choices, explanation });
    }
  }
  return out;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

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
      rawText: true,
      sourcePageIndex: true,
      metadata: true,
    },
  });
  if (!draft) {
    return errorResponse("NOT_FOUND", "지문 추출 결과를 찾을 수 없습니다.", 404);
  }

  try {
    const restoration = await restoreM1Passage({
      academyId: staff.academyId,
      rawText: draft.rawText,
      // 문제 컨텍스트가 있으면 복원 정확도↑ (구조화 드래프트). verbatim은 [].
      questions: readQuestionsFromMetadata(draft.metadata),
    });

    const changeRows: Prisma.ExtractionM1PassageDraftChangeCreateManyInput[] =
      restoration.changes.map((change) => ({
        passageDraftId: draft.id,
        sentenceOrder: change.sentenceOrder ?? null,
        before: change.before,
        after: change.after,
        changeType: change.changeType ?? null,
        reason: change.reason ?? null,
        confidence: change.confidence ?? null,
        sourcePageIndex: draft.sourcePageIndex,
      }));
    const sourceMatchRows = buildM1SourceMatchRows({
      passageDraftId: draft.id,
      sourceMatches: restoration.sourceMatches,
    });

    const updated = await prisma.$transaction(
      async (tx) => {
        await tx.extractionM1PassageDraftChange.deleteMany({
          where: { passageDraftId: draft.id },
        });
        await tx.extractionM1PassageSourceMatch.deleteMany({
          where: { passageDraftId: draft.id },
        });
        await tx.extractionM1PassageDraft.update({
          where: { id: draft.id },
          data: {
            restoredText: restoration.restoredText,
            teacherText: restoration.restoredText,
            restorationStatus: restoration.status,
            reviewStatus: "DRAFT",
            confidence: restoration.confidence,
            warnings:
              restoration.warnings.length > 0
                ? (restoration.warnings as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            metadata: restoration.metadata,
          },
        });
        if (changeRows.length > 0) {
          await tx.extractionM1PassageDraftChange.createMany({ data: changeRows });
        }
        if (sourceMatchRows.length > 0) {
          await tx.extractionM1PassageSourceMatch.createMany({
            data: sourceMatchRows,
          });
        }
        return tx.extractionM1PassageDraft.findUniqueOrThrow({
          where: { id: draft.id },
          include: {
            changes: {
              orderBy: [{ sentenceOrder: "asc" }, { createdAt: "asc" }],
            },
            sourceMatches: {
              orderBy: [{ selected: "desc" }, { confidence: "desc" }],
            },
          },
        });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    return NextResponse.json({ draft: updated });
  } catch (err) {
    return errorResponse(
      "RERESTORE_FAILED",
      err instanceof Error ? err.message : "AI 복원을 다시 실행하지 못했습니다.",
      500,
    );
  }
}
