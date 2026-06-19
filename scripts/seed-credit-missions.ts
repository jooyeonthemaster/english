/**
 * Seed / upsert the credit-mission catalog from DEFAULT_MISSIONS.
 * Idempotent: upserts by mission `key`, so re-running updates copy/rewards safely.
 *
 *   npx tsx scripts/seed-credit-missions.ts
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_MISSIONS } from "../src/lib/growth/constants";

const prisma = new PrismaClient();

async function main() {
  for (const m of DEFAULT_MISSIONS) {
    await prisma.creditMission.upsert({
      where: { key: m.key },
      create: {
        key: m.key,
        title: m.title,
        description: m.description,
        category: m.category,
        cadence: m.cadence,
        rewardCredits: m.rewardCredits,
        iconKey: m.iconKey,
        actionUrl: m.actionUrl,
        ctaLabel: m.ctaLabel,
        sortOrder: m.sortOrder,
        maxRewardPerMonth: m.maxRewardPerMonth,
        isActive: true,
      },
      update: {
        title: m.title,
        description: m.description,
        category: m.category,
        cadence: m.cadence,
        rewardCredits: m.rewardCredits,
        iconKey: m.iconKey,
        actionUrl: m.actionUrl,
        ctaLabel: m.ctaLabel,
        sortOrder: m.sortOrder,
        maxRewardPerMonth: m.maxRewardPerMonth,
      },
    });
    console.log(`upserted mission: ${m.key} (+${m.rewardCredits})`);
  }
  const total = await prisma.creditMission.count();
  console.log(`done — ${total} missions in catalog`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
