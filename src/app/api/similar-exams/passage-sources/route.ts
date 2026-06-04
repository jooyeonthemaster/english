import { NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Review statuses that count as still-usable, not-yet-promoted M1 drafts.
const VISIBLE_DRAFT_STATUSES = ["DRAFT", "REVIEWED"];

function draftText(row: { teacherText: string; restoredText: string; rawText: string }) {
  return (
    row.teacherText?.trim() ||
    row.restoredText?.trim() ||
    row.rawText?.trim() ||
    ""
  );
}

/**
 * Unified passage-source list for the 동형 모의고사 picker: registered passages
 * PLUS unregistered M1 extraction drafts. Drafts are registered as real
 * passages on demand at generation time. Similar-exam-scoped endpoint — only
 * reads shared tables, never mutates other features.
 */
export async function GET() {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const [passages, draftRows] = await Promise.all([
    prisma.passage.findMany({
      where: { academyId: staff.academyId },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        title: true,
        content: true,
        grade: true,
        school: { select: { id: true, name: true } },
        analysis: { select: { id: true } },
        _count: { select: { questions: true } },
      },
    }),
    prisma.extractionM1PassageDraft.findMany({
      where: {
        deletedAt: null,
        savedPassageId: null,
        reviewStatus: { in: VISIBLE_DRAFT_STATUSES },
        job: { academyId: staff.academyId, deletedAt: null },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        title: true,
        teacherText: true,
        restoredText: true,
        rawText: true,
        job: { select: { displayName: true, originalFileName: true } },
      },
    }),
  ]);

  const drafts = draftRows
    .map((row) => {
      const content = draftText(row);
      if (!content) return null;
      const sourceName =
        row.job?.displayName?.trim() || row.job?.originalFileName?.trim() || "";
      return {
        id: row.id,
        title: row.title?.trim() || sourceName || "추출 자료",
        content,
        sourceName,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  return NextResponse.json({
    passages: passages.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      grade: p.grade,
      school: p.school,
      analyzed: Boolean(p.analysis),
      questionCount: p._count.questions,
    })),
    drafts,
  });
}
