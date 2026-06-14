import { NextRequest, NextResponse } from "next/server";
import { loginTutorStudent, DEVICE_LIMIT_EXCEEDED, TUTOR_DEVICE_LIMIT } from "@/lib/auth-tutor-student";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

async function isRateLimited(req: NextRequest, academySlug: string) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / WINDOW_MS) * WINDOW_MS);
  const record = await prisma.tutorLoginRateLimit.upsert({
    where: {
      academySlug_ip_windowStart: {
        academySlug,
        ip,
        windowStart,
      },
    },
    create: {
      academySlug,
      ip,
      windowStart,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
    select: { count: true },
  });
  return record.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const academySlug = String(body.academySlug ?? "").trim();
    const academyCode = String(body.academyCode ?? "").trim();
    const studentCode = String(body.studentCode ?? "").trim();

    if (!academySlug || !academyCode || !studentCode) {
      return NextResponse.json({ error: "로그인 정보를 확인해주세요." }, { status: 401 });
    }
    if (await isRateLimited(req, academySlug)) {
      return NextResponse.json({ error: "잠시 후 다시 시도해주세요." }, { status: 429 });
    }

    const session = await loginTutorStudent({ academySlug, academyCode, studentCode });
    return NextResponse.json({ ok: true, studentId: session.studentId });
  } catch (error) {
    if (error instanceof Error && error.message === DEVICE_LIMIT_EXCEEDED) {
      return NextResponse.json(
        {
          error: `등록된 기기 ${TUTOR_DEVICE_LIMIT}대를 초과했습니다. 학원에 기기 해제를 요청하세요.`,
          code: DEVICE_LIMIT_EXCEEDED,
        },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "로그인 정보를 확인해주세요." }, { status: 401 });
  }
}
