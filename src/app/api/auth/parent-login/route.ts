import { NextRequest, NextResponse } from "next/server";
import { loginParentByPhone, loginParentByToken } from "@/lib/auth-parent";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.token) {
      const session = await loginParentByToken(body.token);
      return NextResponse.json({ success: true, parentId: session.parentId });
    }

    if (body.phone) {
      // For phone login, we need the academyId
      // Since this is a single-academy app, find the parent by phone across all academies
      const { prisma } = await import("@/lib/prisma");
      const parent = await prisma.parent.findFirst({
        where: { phone: body.phone },
        select: { academyId: true },
      });

      if (!parent) {
        return NextResponse.json(
          { error: "등록되지 않은 전화번호입니다" },
          { status: 404 }
        );
      }

      const session = await loginParentByPhone(parent.academyId, body.phone);
      return NextResponse.json({ success: true, parentId: session.parentId });
    }

    return NextResponse.json(
      { error: "전화번호 또는 토큰이 필요합니다" },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "로그인 중 오류가 발생했습니다";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
