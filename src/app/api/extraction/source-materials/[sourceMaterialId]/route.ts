import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ sourceMaterialId: string }>;
}

// Writes to `customLabel`, NOT `title`. The 자료 관리 page displays
// `customLabel` first and falls back to a derived "{job name} 시험지 N"
// label; the auto-set `title` is left alone (other pages still read it).
// `null` / empty string clears the override and reverts to the derived label.
const updateSchema = z.object({
  customLabel: z.string().trim().max(200).nullable(),
});

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { sourceMaterialId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_PAYLOAD",
      "시험지 이름이 올바르지 않습니다.",
      400,
      parsed.error.issues,
    );
  }

  // Academy-scoped existence check
  const existing = await prisma.sourceMaterial.findFirst({
    where: { id: sourceMaterialId, academyId: staff.academyId },
    select: { id: true },
  });
  if (!existing) {
    return errorResponse("NOT_FOUND", "시험지를 찾을 수 없습니다.", 404);
  }

  const next =
    parsed.data.customLabel === null || parsed.data.customLabel.length === 0
      ? null
      : parsed.data.customLabel;

  const updated = await prisma.sourceMaterial.update({
    where: { id: sourceMaterialId },
    data: { customLabel: next },
    select: { id: true, customLabel: true },
  });

  return NextResponse.json({ sourceMaterial: updated });
}
