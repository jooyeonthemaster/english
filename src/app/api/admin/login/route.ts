import { NextRequest, NextResponse } from "next/server";
import { loginAdmin } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (!password) {
      return NextResponse.json(
        { error: "비밀번호를 입력하세요" },
        { status: 400 },
      );
    }

    // 비밀번호만으로 인증 — 첫 번째 활성 SuperAdmin 계정 사용
    const admin = await prisma.superAdmin.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });

    if (!admin) {
      return NextResponse.json(
        { error: "관리자 계정이 없습니다" },
        { status: 401 },
      );
    }

    const result = await loginAdmin(admin.email, password);

    return NextResponse.json({
      success: true,
      admin: { id: result.id, name: result.name, role: result.role },
    });
  } catch {
    return NextResponse.json(
      { error: "비밀번호가 올바르지 않습니다" },
      { status: 401 },
    );
  }
}
