import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import {
  getStaffDisplayTitle,
  normalizeStaffDisplayTitle,
  parseAcademySettings,
  setStaffDisplayTitleInSettings,
} from "@/lib/staff-display";

const phoneRegex = /^(0\d{1,2}-?\d{3,4}-?\d{4})$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const colorRegex = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

const patchSchema = z.object({
  // 프로필 (Staff)
  name: z.string().min(1, "이름을 입력해주세요.").max(50, "이름은 50자 이하여야 합니다.").optional(),
  email: z.string().regex(emailRegex, "올바른 이메일 형식이 아닙니다.").optional(),
  phone: z.string().regex(phoneRegex, "올바른 전화번호 형식이 아닙니다.").or(z.literal("")).optional(),
  avatarUrl: z.string().url("올바른 URL이 아닙니다.").or(z.literal("")).optional(),
  displayTitle: z.string().max(20, "직함은 20자 이하여야 합니다.").optional(),
  // 학원 정보 (Academy)
  academyName: z.string().min(1, "학원명을 입력해주세요.").max(100, "학원명은 100자 이하여야 합니다.").optional(),
  academyPhone: z.string().regex(phoneRegex, "올바른 전화번호 형식이 아닙니다.").or(z.literal("")).optional(),
  address: z.string().max(160, "주소는 160자 이하여야 합니다.").or(z.literal("")).optional(),
  color: z.string().regex(colorRegex, "올바른 색상 코드가 아닙니다.").optional(),
  logoUrl: z.string().url("올바른 URL이 아닙니다.").or(z.literal("")).optional(),
  estimatedStudents: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getStaffSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }
    if (session.role !== "DIRECTOR") {
      return NextResponse.json({ error: "원장 권한이 필요합니다" }, { status: 403 });
    }

    const staff = await prisma.staff.findUnique({
      where: { id: session.id },
      select: {
        name: true,
        email: true,
        phone: true,
        role: true,
        avatarUrl: true,
        authProvider: true,
        academy: {
          select: {
            name: true,
            phone: true,
            address: true,
            color: true,
            logoUrl: true,
            code: true,
            settings: true,
          },
        },
      },
    });

    if (!staff) {
      return NextResponse.json({ error: "계정을 찾을 수 없습니다" }, { status: 404 });
    }

    const settings = parseAcademySettings(staff.academy?.settings ?? null);

    return NextResponse.json({
      name: staff.name,
      email: staff.email,
      phone: staff.phone ?? "",
      avatarUrl: staff.avatarUrl ?? "",
      displayTitle: getStaffDisplayTitle(settings, session.id, staff.role),
      authProvider: staff.authProvider ?? "credentials",
      academyName: staff.academy?.name ?? "",
      academyPhone: staff.academy?.phone ?? "",
      address: staff.academy?.address ?? "",
      color: staff.academy?.color ?? "#3B82F6",
      logoUrl: staff.academy?.logoUrl ?? "",
      code: staff.academy?.code ?? "",
      estimatedStudents: typeof settings.estimatedStudents === "string" ? settings.estimatedStudents : "",
    });
  } catch (error) {
    console.error("[DIRECTOR_ACCOUNT_GET] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getStaffSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }
    if (session.role !== "DIRECTOR") {
      return NextResponse.json({ error: "원장 권한이 필요합니다" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다" },
        { status: 400 }
      );
    }
    const data = parsed.data;

    if (data.name !== undefined && data.name.trim().length === 0) {
      return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    }
    if (data.academyName !== undefined && data.academyName.trim().length === 0) {
      return NextResponse.json({ error: "학원명을 입력해주세요." }, { status: 400 });
    }

    const staff = await prisma.staff.findUnique({
      where: { id: session.id },
      select: { academyId: true, authProvider: true, email: true, role: true },
    });
    if (!staff) {
      return NextResponse.json({ error: "계정을 찾을 수 없습니다" }, { status: 404 });
    }

    // ── 이메일 변경 처리 (Google 계정은 잠금) ──
    let nextEmail: string | undefined;
    if (data.email !== undefined && data.email.toLowerCase() !== staff.email.toLowerCase()) {
      if (staff.authProvider === "google") {
        return NextResponse.json(
          { error: "Google 계정 이메일은 변경할 수 없습니다" },
          { status: 400 }
        );
      }
      const lowered = data.email.toLowerCase();
      const existing = await prisma.staff.findFirst({
        where: { email: { equals: lowered, mode: "insensitive" }, NOT: { id: session.id } },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json({ error: "이미 사용 중인 이메일입니다" }, { status: 400 });
      }
      nextEmail = lowered;
    }

    // ── Staff 업데이트 ──
    const staffData: Record<string, unknown> = {};
    if (data.name !== undefined) staffData.name = data.name.trim();
    if (nextEmail !== undefined) staffData.email = nextEmail;
    if (data.phone !== undefined) staffData.phone = data.phone || null;
    if (data.avatarUrl !== undefined) staffData.avatarUrl = data.avatarUrl || null;
    // ── Academy 업데이트 ──
    const academyData: Record<string, unknown> = {};
    if (data.academyName !== undefined) academyData.name = data.academyName.trim();
    if (data.academyPhone !== undefined) academyData.phone = data.academyPhone || null;
    if (data.address !== undefined) academyData.address = data.address || null;
    if (data.color !== undefined) academyData.color = data.color;
    if (data.logoUrl !== undefined) academyData.logoUrl = data.logoUrl || null;

    let displayTitle: string | undefined;
    if (data.displayTitle !== undefined) {
      displayTitle = normalizeStaffDisplayTitle(data.displayTitle);
    }

    const shouldUpdateSettings = data.estimatedStudents !== undefined || data.displayTitle !== undefined;

    if (Object.keys(staffData).length > 0 || Object.keys(academyData).length > 0 || shouldUpdateSettings) {
      await prisma.$transaction(async (tx) => {
        if (Object.keys(staffData).length > 0) {
          await tx.staff.update({ where: { id: session.id }, data: staffData });
        }

        const nextAcademyData = { ...academyData };
        if (shouldUpdateSettings) {
          const current = await tx.academy.findUnique({
            where: { id: staff.academyId },
            select: { settings: true },
          });
          let merged = parseAcademySettings(current?.settings ?? null);
          if (data.estimatedStudents !== undefined) {
            merged = { ...merged, estimatedStudents: data.estimatedStudents };
          }
          if (data.displayTitle !== undefined) {
            merged = setStaffDisplayTitleInSettings(merged, session.id, displayTitle ?? "");
          }
          nextAcademyData.settings = JSON.stringify(merged);
        }

        if (Object.keys(nextAcademyData).length > 0) {
          await tx.academy.update({ where: { id: staff.academyId }, data: nextAcademyData });
        }
      });
    }

    return NextResponse.json({
      success: true,
      displayTitle:
        displayTitle !== undefined
          ? displayTitle || getStaffDisplayTitle({}, session.id, staff.role)
          : undefined,
    });
  } catch (error) {
    console.error("[DIRECTOR_ACCOUNT_PATCH] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
