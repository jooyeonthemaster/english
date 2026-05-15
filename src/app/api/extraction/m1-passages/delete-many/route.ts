import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteManySchema = z.object({
  draftIds: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const parsed = deleteManySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_PAYLOAD",
      "삭제 요청이 올바르지 않습니다.",
      400,
      parsed.error.issues,
    );
  }

  // Single SQL DELETE with academy-scoped filter.
  // The cascade chain (changes, sourceMatches, collectionItems) is handled
  // by the foreign-key onDelete: Cascade declarations in the schema.
  const result = await prisma.extractionM1PassageDraft.deleteMany({
    where: {
      id: { in: parsed.data.draftIds },
      job: { academyId: staff.academyId },
    },
  });

  return NextResponse.json({
    requested: parsed.data.draftIds.length,
    deleted: result.count,
  });
}
