// One-shot backfill: ensure every Academy has a CreditBalance + AcademySubscription
// Run once with: `npx tsx scripts/backfill-credits.ts`
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plan =
    (await prisma.subscriptionPlan.findUnique({ where: { tier: "STARTER" } })) ??
    (await prisma.subscriptionPlan.findFirst({ orderBy: { monthlyPrice: "asc" } }));
  if (!plan) {
    console.error("No subscription plan found. Seed plans first.");
    process.exit(1);
  }
  console.log(`Using plan: ${plan.tier} (monthlyCredits=${plan.monthlyCredits})`);

  const academies = await prisma.academy.findMany({
    select: {
      id: true,
      name: true,
      creditBalance: { select: { id: true } },
      subscriptions: { select: { id: true }, take: 1 },
    },
  });

  let fixed = 0;
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  for (const a of academies) {
    const needsBalance = !a.creditBalance;
    const needsSub = a.subscriptions.length === 0;
    if (!needsBalance && !needsSub) continue;

    console.log(`Backfilling ${a.name} (${a.id}) — balance=${needsBalance}, sub=${needsSub}`);

    await prisma.$transaction(async (tx) => {
      if (needsSub) {
        await tx.academySubscription.create({
          data: {
            academyId: a.id,
            planId: plan.id,
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }
      if (needsBalance) {
        await tx.creditBalance.create({
          data: {
            academyId: a.id,
            balance: plan.monthlyCredits,
            monthlyAllocation: plan.monthlyCredits,
            totalAllocated: plan.monthlyCredits,
            lastResetAt: now,
          },
        });
        await tx.creditTransaction.create({
          data: {
            academyId: a.id,
            type: "ALLOCATION",
            amount: plan.monthlyCredits,
            balanceAfter: plan.monthlyCredits,
            description: "Backfill: initial credit allocation",
          },
        });
      }
    });

    fixed += 1;
  }

  console.log(`Done. Fixed ${fixed} academy/academies.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
