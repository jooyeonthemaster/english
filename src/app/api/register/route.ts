import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ─── Validation Schema ───────────────────────────────────────────────────────

const phoneRegex = /^(0\d{1,2}-?\d{3,4}-?\d{4})$/;

const registerSchema = z.object({
  academyName: z.string().min(1, "학원명을 입력해주세요").max(100),
  directorName: z.string().min(1, "이름을 입력해주세요").max(50),
  directorEmail: z.string().email("올바른 이메일 형식이 아닙니다"),
  directorPhone: z.string().min(1, "연락처를 입력해주세요").regex(phoneRegex, "올바른 전화번호 형식이 아닙니다"),
  desiredPlan: z.enum(["STARTER", "STANDARD", "PREMIUM"]).default("STANDARD"),
  // Optional fields (kept in DB but not required from form)
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  businessNumber: z.string().optional().nullable(),
  estimatedStudents: z.number().int().min(0).optional().nullable(),
  message: z.string().optional().nullable(),
});

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || "입력값이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Check for duplicate email in Staff table
    const existingStaff = await prisma.staff.findUnique({
      where: { email: data.directorEmail },
      select: { id: true },
    });

    if (existingStaff) {
      return NextResponse.json(
        { error: "이미 등록된 이메일입니다. 기존 계정으로 로그인해주세요." },
        { status: 409 },
      );
    }

    // Check for duplicate pending registration
    const existingRegistration = await prisma.academyRegistration.findFirst({
      where: { directorEmail: data.directorEmail, status: "PENDING" },
      select: { id: true },
    });

    if (existingRegistration) {
      return NextResponse.json(
        { error: "이미 동일한 이메일로 신청이 접수되어 있습니다. 승인 대기 중입니다." },
        { status: 409 },
      );
    }

    // phone 필드가 없으면 directorPhone을 사용
    const registration = await prisma.academyRegistration.create({
      data: {
        academyName: data.academyName,
        phone: data.phone || data.directorPhone,
        directorName: data.directorName,
        directorEmail: data.directorEmail,
        directorPhone: data.directorPhone,
        desiredPlan: data.desiredPlan,
        address: data.address ?? undefined,
        businessNumber: data.businessNumber ?? undefined,
        estimatedStudents: data.estimatedStudents ?? undefined,
        message: data.message ?? undefined,
        status: "PENDING",
      },
    });

    return NextResponse.json(
      { success: true, registrationId: registration.id, message: "신청이 접수되었습니다." },
      { status: 201 },
    );
  } catch (error) {
    console.error("[REGISTER] Error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
