import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createWorkbenchPassage } from "@/actions/workbench";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  draftIds: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
});

function draftText(row: { teacherText: string; restoredText: string; rawText: string }) {
  return (
    row.teacherText?.trim() ||
    row.restoredText?.trim() ||
    row.rawText?.trim() ||
    ""
  );
}

/**
 * Register selected M1 extraction drafts as real passages (server-side), so the
 * picker only ever carries previews. Reads each draft's full text here and
 * delegates to the shared createWorkbenchPassage action (call-only). Returns a
 * draftId → passageId map. Similar-exam-scoped.
 */
export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const draftIds = [...new Set(parsed.data.draftIds)];

  const rows = await prisma.extractionM1PassageDraft.findMany({
    where: {
      id: { in: draftIds },
      deletedAt: null,
      job: { academyId: staff.academyId },
    },
    select: {
      id: true,
      title: true,
      teacherText: true,
      restoredText: true,
      rawText: true,
      savedPassageId: true,
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  const results: Array<{ draftId: string; passageId: string }> = [];
  // Preserve the caller's order.
  for (const draftId of draftIds) {
    const row = byId.get(draftId);
    if (!row) continue;
    if (row.savedPassageId) {
      results.push({ draftId, passageId: row.savedPassageId });
      continue;
    }
    const content = draftText(row);
    if (!content) continue;
    const created = await createWorkbenchPassage({
      title: row.title?.trim() || "추출 자료",
      content,
      sourceDraftId: row.id,
      // 동형 시험지 생성은 사람 검수가 아니므로 원본 자료를 검수완료로 올리지 않는다.
      markReviewed: false,
    });
    if (created.success && created.id) {
      results.push({ draftId, passageId: created.id });
    }
  }

  return NextResponse.json({ passages: results });
}
