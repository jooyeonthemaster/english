import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createUniqueAcademyCode } from "@/lib/tutor/academy-code";
import { verifyOnboardingToken } from "@/lib/onboarding-token";
import { signSocialBridgeToken } from "@/lib/social-bridge";
import { SIGNUP_CREDITS } from "@/lib/feedback-program";
import { processReferralOnSignup } from "@/lib/growth/referral";

const FREE_TRIAL_END = new Date("2026-07-01T23:59:59+09:00");

const phoneRegex = /^(0\d{1,2}-?\d{3,4}-?\d{4})$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const onboardingSchema = z.object({
  token: z.string().min(1),
  academyName: z.string().min(1, "academy_required").max(100),
  directorName: z.string().min(1, "name_required").max(50),
  directorEmail: z.string().regex(emailRegex, "invalid_email"),
  directorPhone: z.string().regex(phoneRegex, "invalid_phone"),
  address: z.string().min(1, "address_required").max(160),
  estimatedStudents: z.string().optional().default(""),
  referralCode: z.string().optional(),
  agree: z.boolean().refine(Boolean, "agreement_required"),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = randomBytes(3).toString("hex");
  return base ? `${base}-${suffix}` : `smoat-${suffix}`;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("02")) {
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length >= 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  return phone.trim();
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

  const payload = await verifyOnboardingToken(parsed.data.token);
  if (!payload) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 400 });
  }

  const academyName = parsed.data.academyName.trim();
  const directorName = parsed.data.directorName.trim();
  const directorEmail = parsed.data.directorEmail.trim().toLowerCase();
  const directorPhone = normalizePhone(parsed.data.directorPhone);
  const address = parsed.data.address.trim();
  const estimatedStudents = parsed.data.estimatedStudents?.trim() || null;

  if (payload.provider === "google") {
    const payloadEmail = payload.email?.trim().toLowerCase();
    if (!payloadEmail || payloadEmail !== directorEmail) {
      return NextResponse.json({ error: "email_mismatch" }, { status: 400 });
    }
  }

  const existingByEmail = await prisma.staff.findFirst({
    where: { email: { equals: directorEmail, mode: "insensitive" } },
    select: { id: true },
  });
  if (existingByEmail) {
    return NextResponse.json({ error: "email_already_used" }, { status: 409 });
  }

  if (payload.provider === "kakao" && payload.kakaoId) {
    const existingByKakao = await prisma.staff.findUnique({
      where: { kakaoId: payload.kakaoId },
      select: { id: true },
    });
    if (existingByKakao) {
      return NextResponse.json({ error: "kakao_already_used" }, { status: 409 });
    }
  }

  if (payload.provider === "google" && payload.supabaseUserId) {
    const existingBySupabase = await prisma.staff.findUnique({
      where: { supabaseUserId: payload.supabaseUserId },
      select: { id: true },
    });
    if (existingBySupabase) {
      return NextResponse.json({ error: "supabase_already_used" }, { status: 409 });
    }
  }

  const plan =
    (await prisma.subscriptionPlan.findUnique({ where: { tier: "PREMIUM" } })) ??
    (await prisma.subscriptionPlan.findFirst({
      where: { isActive: true },
      orderBy: { monthlyCredits: "desc" },
    }));

  if (!plan) {
    return NextResponse.json({ error: "no_plan_available" }, { status: 500 });
  }

  const now = new Date();
  // New signups receive a small starter allocation; additional free credits
  // are granted through the "협업 피드백 이벤트" program (see /lib/feedback-program).
  const initialCredits = SIGNUP_CREDITS;
  const placeholderPassword = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

  let academySlug = slugify(academyName);
  for (let i = 0; i < 5; i += 1) {
    const collision = await prisma.academy.findUnique({
      where: { slug: academySlug },
      select: { id: true },
    });
    if (!collision) break;
    academySlug = slugify(academyName);
  }

  const { academy, staff } = await prisma.$transaction(async (tx) => {
    const academy = await tx.academy.create({
      data: {
        name: academyName,
        slug: academySlug,
        code: await createUniqueAcademyCode(tx),
        phone: directorPhone,
        address,
        status: "TRIAL",
        settings: JSON.stringify({
          onboarding: {
            completedAt: now.toISOString(),
            provider: payload.provider,
            campaign: "FREE_UNTIL_2026_07_01",
            freeUntil: FREE_TRIAL_END.toISOString(),
            estimatedStudents,
          },
        }),
      },
    });

    const createdStaff = await tx.staff.create({
      data: {
        academyId: academy.id,
        email: directorEmail,
        password: placeholderPassword,
        name: directorName,
        phone: directorPhone,
        role: "DIRECTOR",
        isActive: true,
        supabaseUserId: payload.provider === "google" ? payload.supabaseUserId : null,
        kakaoId: payload.provider === "kakao" ? payload.kakaoId : null,
        authProvider: payload.provider,
        lastLoginAt: now,
      },
    });

    await tx.academySubscription.create({
      data: {
        academyId: academy.id,
        planId: plan.id,
        status: "TRIAL",
        currentPeriodStart: now,
        currentPeriodEnd: FREE_TRIAL_END,
        trialEndsAt: FREE_TRIAL_END,
      },
    });

    await tx.creditBalance.create({
      data: {
        academyId: academy.id,
        balance: initialCredits,
        monthlyAllocation: initialCredits,
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
        description: `Free trial allocation until 2026-07-01 (${payload.provider})`,
        metadata: JSON.stringify({
          campaign: "FREE_UNTIL_2026_07_01",
          planTier: plan.tier,
          provider: payload.provider,
        }),
      },
    });

    return { academy, staff: createdStaff };
  });

  // Referral attribution — runs AFTER the onboarding transaction commits so both
  // academies' CreditBalance rows exist. The code can arrive via the onboarding
  // form (parsed) or the smoat_ref cookie carried through the OAuth round trip.
  // Strictly best-effort: referral logic must NEVER block or fail signup.
  const referralCodeCandidate =
    parsed.data.referralCode?.trim() || request.cookies.get("smoat_ref")?.value;
  if (referralCodeCandidate) {
    try {
      await processReferralOnSignup({
        code: referralCodeCandidate,
        referredAcademyId: academy.id,
        referredStaffId: staff.id,
        referredAcademyName: academyName,
        referredDirectorPhone: directorPhone,
        referredDirectorEmail: directorEmail,
        signupIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        signupUserAgent: request.headers.get("user-agent"),
      });
    } catch (referralError) {
      console.error("[onboarding] referral attribution failed", referralError);
    }
  }

  const bridgeToken = await signSocialBridgeToken({
    staffId: staff.id,
    email: staff.email,
    provider: payload.provider,
  });

  return NextResponse.json({ ok: true, bridgeToken });
}
