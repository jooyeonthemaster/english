// One-shot: create the "penrose" credentials director account for 펜로즈아카데미.
// Mirrors the social onboarding flow (academy + staff + subscription + credit balance + transaction),
// but uses ID/password (credentials) auth and a fixed 5,000 trial credit allocation.
// Run with: `npx tsx scripts/create-penrose-account.ts`
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const LOGIN_ID = "penrose";
const RAW_PASSWORD = "072369choi!";
const DIRECTOR_NAME = "박보윤";
const ACADEMY_NAME = "펜로즈아카데미";
const INITIAL_CREDITS = 5000;
const FREE_TRIAL_END = new Date("2026-07-01T23:59:59+09:00");

const ACADEMY_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function academyCodeCandidate() {
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += ACADEMY_CODE_ALPHABET[Math.floor(Math.random() * ACADEMY_CODE_ALPHABET.length)];
  }
  return code;
}

async function createUniqueAcademyCode() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const code = academyCodeCandidate();
    const existing = await prisma.academy.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error("Unable to allocate academy code");
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = randomBytes(3).toString("hex");
  return base ? `${base}-${suffix}` : `penrose-${suffix}`;
}

async function main() {
  // Guard: login id must be unique.
  const existing = await prisma.staff.findFirst({
    where: { email: { equals: LOGIN_ID, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    console.error(`❌ Staff with login id "${LOGIN_ID}" already exists (id=${existing.id}). Aborting.`);
    process.exit(1);
  }

  const plan =
    (await prisma.subscriptionPlan.findUnique({ where: { tier: "PREMIUM" } })) ??
    (await prisma.subscriptionPlan.findFirst({
      where: { isActive: true },
      orderBy: { monthlyCredits: "desc" },
    }));
  if (!plan) {
    console.error("❌ No subscription plan found. Seed plans first.");
    process.exit(1);
  }

  const now = new Date();
  const password = await bcrypt.hash(RAW_PASSWORD, 10);
  const code = await createUniqueAcademyCode();

  let academySlug = slugify(ACADEMY_NAME);
  for (let i = 0; i < 5; i += 1) {
    const collision = await prisma.academy.findUnique({ where: { slug: academySlug }, select: { id: true } });
    if (!collision) break;
    academySlug = slugify(ACADEMY_NAME);
  }

  const result = await prisma.$transaction(async (tx) => {
    const academy = await tx.academy.create({
      data: {
        name: ACADEMY_NAME,
        slug: academySlug,
        code,
        status: "TRIAL",
        settings: JSON.stringify({
          onboarding: {
            completedAt: now.toISOString(),
            provider: "credentials",
            campaign: "PENROSE_FEEDBACK_BETA",
            freeUntil: FREE_TRIAL_END.toISOString(),
          },
        }),
      },
    });

    const staff = await tx.staff.create({
      data: {
        academyId: academy.id,
        email: LOGIN_ID,
        password,
        name: DIRECTOR_NAME,
        role: "DIRECTOR",
        isActive: true,
        authProvider: "credentials",
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
        balance: INITIAL_CREDITS,
        monthlyAllocation: INITIAL_CREDITS,
        totalAllocated: INITIAL_CREDITS,
        lastResetAt: now,
      },
    });

    await tx.creditTransaction.create({
      data: {
        academyId: academy.id,
        type: "ALLOCATION",
        amount: INITIAL_CREDITS,
        balanceAfter: INITIAL_CREDITS,
        description: "Penrose feedback beta allocation (credentials)",
        metadata: JSON.stringify({ campaign: "PENROSE_FEEDBACK_BETA", planTier: plan.tier, provider: "credentials" }),
      },
    });

    return { academy, staff };
  });

  console.log("✅ penrose 계정 생성 완료");
  console.log(`   academy.id   = ${result.academy.id}`);
  console.log(`   academy.code = ${result.academy.code}`);
  console.log(`   academy.slug = ${result.academy.slug}`);
  console.log(`   staff.id     = ${result.staff.id}`);
  console.log(`   login id     = ${LOGIN_ID}`);
  console.log(`   plan         = ${plan.tier}`);
  console.log(`   credits      = ${INITIAL_CREDITS}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
