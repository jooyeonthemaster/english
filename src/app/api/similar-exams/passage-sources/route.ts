import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_LEN = 200;
const DRAFT_LIMIT = 300;

interface DraftRow {
  id: string;
  title: string | null;
  preview: string;
  source_name: string;
}

/**
 * Unified passage-source list for the 동형 모의고사 picker: registered passages
 * PLUS unregistered M1 extraction drafts. Returns only short PREVIEWS (never the
 * full text) so the page stays fast even when an academy has thousands of drafts
 * — full draft text is fetched server-side only for the selected ones at
 * generation time (see passages/from-drafts). Similar-exam-scoped; reads shared
 * tables only.
 */
export async function GET() {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const passages = await prisma.passage.findMany({
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
  });

  // Raw query with left() so the full draft text never leaves the DB — only a
  // short preview is transferred. (Academies can have thousands of drafts.)
  // The length is inlined as a literal (parameterizing it confuses left()'s
  // type resolution). A draft-query failure must not break the passage list.
  let draftRows: DraftRow[] = [];
  try {
    draftRows = await prisma.$queryRaw<DraftRow[]>(Prisma.sql`
      SELECT
        d.id AS id,
        d.title AS title,
        left(coalesce(nullif(d."teacherText", ''), nullif(d."restoredText", ''), d."rawText"), 200) AS preview,
        coalesce(nullif(j."displayName", ''), j."originalFileName", '') AS source_name
      FROM "extraction_m1_passage_drafts" d
      JOIN "extraction_jobs" j ON j.id = d."jobId"
      WHERE j."academyId" = ${staff.academyId}
        AND d."deletedAt" IS NULL
        AND d."savedPassageId" IS NULL
        AND d."reviewStatus" IN ('DRAFT', 'REVIEWED')
        AND length(coalesce(nullif(d."teacherText", ''), nullif(d."restoredText", ''), d."rawText")) > 0
      ORDER BY d."createdAt" DESC
      LIMIT ${DRAFT_LIMIT}
    `);
  } catch (error) {
    console.error("[similar-exams/passage-sources] draft query failed", error);
    draftRows = [];
  }

  return NextResponse.json({
    passages: passages.map((p) => ({
      id: p.id,
      title: p.title,
      preview: p.content.slice(0, PREVIEW_LEN),
      grade: p.grade,
      school: p.school,
      analyzed: Boolean(p.analysis),
      questionCount: p._count.questions,
    })),
    drafts: draftRows.map((d) => ({
      id: d.id,
      title: d.title?.trim() || d.source_name || "추출 자료",
      preview: d.preview,
      sourceName: d.source_name,
    })),
  });
}
