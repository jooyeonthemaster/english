// 커스텀 유형 실험실 e2e 검증용 일회성 샌드박스 계정 생성/정리.
// create-penrose-account.ts 의 온보딩 미러 패턴을 그대로 따른다(구독/크레딧 포함).
//
//   생성: npx tsx scripts/e2e-custom-lab-sandbox.ts create
//   정리: npx tsx scripts/e2e-custom-lab-sandbox.ts cleanup
//
// 정리는 이 샌드박스 학원에 매달린 모든 데이터(잡/유형/지문/문항/시험지/크레딧)를
// 학원 단위로 삭제한다. 절대 다른 학원을 건드리지 않는다(academyId 스코프 고정).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const LOGIN_ID = "e2e-customlab";
const RAW_PASSWORD = "e2e-customlab-2026!";
const ACADEMY_NAME = "[E2E검증] 커스텀유형 실험실";

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

async function create() {
  const existing = await prisma.staff.findFirst({
    where: { email: { equals: LOGIN_ID, mode: "insensitive" } },
    select: { id: true, academyId: true },
  });
  if (existing) {
    console.log(JSON.stringify({ ok: true, reused: true, academyId: existing.academyId, loginId: LOGIN_ID }));
    return;
  }

  const plan = await prisma.subscriptionPlan.findFirst({
    where: { isActive: true },
    orderBy: { monthlyCredits: "desc" },
  });
  if (!plan) throw new Error("No subscription plan found");

  const now = new Date();
  const password = await bcrypt.hash(RAW_PASSWORD, 10);
  const code = await createUniqueAcademyCode();
  const slug = `e2e-customlab-${randomBytes(3).toString("hex")}`;

  const result = await prisma.$transaction(async (tx) => {
    const academy = await tx.academy.create({
      data: {
        name: ACADEMY_NAME,
        slug,
        code,
        status: "TRIAL",
        settings: JSON.stringify({ e2eSandbox: { purpose: "custom-lab-verification", createdAt: now.toISOString() } }),
      },
    });
    const staff = await tx.staff.create({
      data: {
        academyId: academy.id,
        email: LOGIN_ID,
        password,
        name: "검증봇",
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
        currentPeriodEnd: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
        trialEndsAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
      },
    });
    await tx.creditBalance.create({
      data: {
        academyId: academy.id,
        balance: 500,
        monthlyAllocation: 500,
        totalAllocated: 500,
        lastResetAt: now,
      },
    });
    return { academy, staff };
  });

  console.log(
    JSON.stringify({ ok: true, academyId: result.academy.id, staffId: result.staff.id, loginId: LOGIN_ID }),
  );
}

async function cleanup() {
  const staff = await prisma.staff.findFirst({
    where: { email: { equals: LOGIN_ID, mode: "insensitive" } },
    select: { id: true, academyId: true },
  });
  if (!staff) {
    console.log(JSON.stringify({ ok: true, nothingToClean: true }));
    return;
  }
  const academyId = staff.academyId;
  const academy = await prisma.academy.findUnique({ where: { id: academyId }, select: { name: true } });
  if (!academy || !academy.name.startsWith("[E2E검증]")) {
    throw new Error(`safety: academy ${academyId} is not the e2e sandbox (name=${academy?.name})`);
  }

  // 자식 → 부모 순서 삭제. 전부 academyId 스코프.
  const del = async (label: string, fn: () => Promise<{ count: number }>) => {
    const r = await fn().catch((e) => {
      console.warn(`  ! ${label}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      return { count: -1 };
    });
    console.log(`  - ${label}: ${r.count}`);
  };

  await del("examQuestions", () =>
    prisma.examQuestion.deleteMany({ where: { exam: { academyId } } }));
  await del("exams", () => prisma.exam.deleteMany({ where: { academyId } }));
  await del("questionExplanations", () =>
    prisma.questionExplanation.deleteMany({ where: { question: { academyId } } }));
  await del("questions", () => prisma.question.deleteMany({ where: { academyId } }));
  await del("customQuestionTypeVersions", () =>
    prisma.customQuestionTypeVersion.deleteMany({ where: { type: { academyId } } }));
  await del("customQuestionTypes", () =>
    prisma.customQuestionType.deleteMany({ where: { academyId } }));
  await del("customTypeAnalysisJobs", () =>
    prisma.customTypeAnalysisJob.deleteMany({ where: { academyId } }));
  await del("customQuestionGenerationJobs", () =>
    prisma.customQuestionGenerationJob.deleteMany({ where: { academyId } }));
  await del("passageAnalyses", () =>
    prisma.passageAnalysis.deleteMany({ where: { passage: { academyId } } }));
  await del("passages", () => prisma.passage.deleteMany({ where: { academyId } }));
  await del("creditTransactions", () =>
    prisma.creditTransaction.deleteMany({ where: { academyId } }));
  await del("creditBalances", () => prisma.creditBalance.deleteMany({ where: { academyId } }));
  await del("academySubscriptions", () =>
    prisma.academySubscription.deleteMany({ where: { academyId } }));
  await del("appEvents", () => prisma.appEvent.deleteMany({ where: { academyId } }).catch(() => ({ count: 0 })));
  await del("staff", () => prisma.staff.deleteMany({ where: { academyId } }));
  await del("academy", () => prisma.academy.deleteMany({ where: { id: academyId } }));

  console.log(JSON.stringify({ ok: true, cleaned: academyId }));
}

async function main() {
  const mode = process.argv[2];
  if (mode === "create") await create();
  else if (mode === "cleanup") await cleanup();
  else throw new Error("usage: create | cleanup");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
