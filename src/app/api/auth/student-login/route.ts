import { NextRequest, NextResponse } from "next/server";
import { loginStudent } from "@/lib/auth-student";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "학생 코드를 입력해주세요" },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { studentCode: code.trim() },
      select: { academyId: true },
    });

    if (!student) {
      return NextResponse.json(
        { error: "등록되지 않은 학생 코드입니다" },
        { status: 404 }
      );
    }

    const session = await loginStudent(student.academyId, code.trim());
    return NextResponse.json({ success: true, studentId: session.studentId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "로그인 중 오류가 발생했습니다";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
