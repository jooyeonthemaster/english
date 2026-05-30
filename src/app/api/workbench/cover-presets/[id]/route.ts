import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** DELETE — 표지 프리셋 삭제 (같은 학원만) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const { id } = await params;

  const preset = await prisma.coverPreset.findUnique({ where: { id }, select: { academyId: true } });
  if (!preset || preset.academyId !== staff.academyId) {
    return NextResponse.json({ error: "프리셋을 찾을 수 없습니다." }, { status: 404 });
  }
  await prisma.coverPreset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
