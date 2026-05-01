import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { verifyOnboardingToken } from "@/lib/onboarding-token";
import { signSocialBridgeToken } from "@/lib/social-bridge";

const phoneRegex = /^(0\d{1,2}-?\d{3,4}-?\d{4})$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const onboardingSchema = z.object({
  token: z.string().min(1),
  academyName: z.string().min(1, "학원명을 입력해주세요").max(100),
  directorName: z.string().min(1, "이름을 입력해주세요").max(50),
  directorEmail: z.string().regex(emailRegex, "올바른 이메일 형식이 아닙니다"),
  directorPhone: z
    .string()
    .regex(phoneRegex, "올바른 전화번호 형식이 아닙니다")
    .optional()
    .or(z.literal("")),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = randomBytes(3).toString("hex");
  return base ? `${base}-${suffix}` : `nara-${suffix}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_payload" },
      { status: 400 },
    );
  }

  const { token, academyName, directorName, directorEmail, directorPhone } =
    parsed.data;

  const payload = await verifyOnboardingToken(token);
  if (!payload) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 400 });
  }

  // For Google: token has email — must match form email exactly (anti-tampering).
  if (payload.provider === "google") {
    if (!payload.email || payload.email !== directorEmail) {
      return NextResponse.json({ error: "email_mismatch" }, { status: 400 });
    }
  }

  const existingByEmail = await prisma.staff.findUnique({
    where: { email: directorEmail },
    select: { id: true },
  });
  if (existingByEmail) {
    return NextResponse.json(
      { error: "email_already_used" },
      { status: 409 },
    );
  }

  if (payload.provider === "kakao" && payload.kakaoId) {
    const existingByKakao = await prisma.staff.findUnique({
      where: { kakaoId: payload.kakaoId },
      select: { id: true },
    });
    if (existingByKakao) {
      return NextResponse.json(
        { error: "kakao_already_used" },
        { status: 409 },
      );
    }
  }

  if (payload.provider === "google" && payload.supabaseUserId) {
    const existingBySupabase = await prisma.staff.findUnique({
      where: { supabaseUserId: payload.supabaseUserId },
      select: { id: true },
    });
    if (existingBySupabase) {
      return NextResponse.json(
        { error: "supabase_already_used" },
        { status: 409 },
      );
    }
  }

  const placeholderPassword = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

  // Generate a unique slug — retry up to 5 times on rare collisions.
  let academySlug = slugify(academyName);
  for (let i = 0; i < 5; i += 1) {
    const collision = await prisma.academy.findUnique({
      where: { slug: academySlug },
      select: { id: true },
    });
    if (!collision) break;
    academySlug = slugify(academyName);
  }

  // Resolve a default subscription plan for social self-signup (STARTER tier).
  // Falls back to the lowest-priced plan if STARTER isn't seeded.
  const plan =
    (await prisma.subscriptionPlan.findUnique({ where: { tier: "STARTER" } })) ??
    (await prisma.subscriptionPlan.findFirst({ orderBy: { monthlyPrice: "asc" } }));
  if (!plan) {
    return NextResponse.json({ error: "no_plan_available" }, { status: 500 });
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const initialCredits = plan.monthlyCredits;

  const staff = await prisma.$transaction(async (tx) => {
    const academy = await tx.academy.create({
      data: {
        name: academyName,
        slug: academySlug,
        phone: directorPhone || null,
        status: "ACTIVE",
      },
    });

    const created = await tx.staff.create({
      data: {
        academyId: academy.id,
        email: directorEmail,
        password: placeholderPassword,
        name: directorName,
        phone: directorPhone || null,
        role: "DIRECTOR",
        isActive: true,
        supabaseUserId:
          payload.provider === "google" ? payload.supabaseUserId : null,
        kakaoId: payload.provider === "kakao" ? payload.kakaoId : null,
        authProvider: payload.provider,
        lastLoginAt: now,
      },
    });

    await tx.academySubscription.create({
      data: {
        academyId: academy.id,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    await tx.creditBalance.create({
      data: {
        academyId: academy.id,
        balance: initialCredits,
        monthlyAllocation: plan.monthlyCredits,
        totalAllocated: initialCredits,
        lastResetAt: now,
      },
    });

    await tx.creditTransaction.create({
      data: {
        academyId: academy.id,
        type: "ALLOCATION",
        amount: initialCredits,
        balanceAfter: initialCredits,
        description: `Initial credit allocation for social signup (${payload.provider})`,
      },
    });

    return created;
  });

  const bridgeToken = await signSocialBridgeToken({
    staffId: staff.id,
    email: staff.email,
    provider: payload.provider,
  });

  return NextResponse.json({ ok: true, bridgeToken });
}
