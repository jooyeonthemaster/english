import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { coverSchema } from "@/lib/passage-report/analysis-report/schema";
import { prisma } from "@/lib/prisma";

/** GET — 학원의 표지 프리셋 목록 */
export async function GET() {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const presets = await prisma.coverPreset.findMany({
    where: { academyId: staff.academyId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, cover: true, updatedAt: true },
    take: 60,
  });
  return NextResponse.json({ presets });
}

/** POST — 현재 표지를 프리셋으로 저장 */
export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  let body: { name?: unknown; cover?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "프리셋 이름을 입력하세요." }, { status: 400 });

  const parsed = coverSchema.safeParse(body.cover);
  if (!parsed.success) return NextResponse.json({ error: "표지 설정이 올바르지 않습니다." }, { status: 400 });

  const preset = await prisma.coverPreset.create({
    data: {
      academyId: staff.academyId,
      name: name.slice(0, 60),
      cover: parsed.data as never,
      createdById: staff.id,
    },
    select: { id: true, name: true, cover: true, updatedAt: true },
  });
  return NextResponse.json({ preset });
}
