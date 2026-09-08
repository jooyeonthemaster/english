import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const J = (x: any) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2);
async function q(l: string, s: string) { try { console.log(`\n### ${l}\n` + J(await p.$queryRawUnsafe(s))); } catch (e: any) { console.log(`\n### ${l}\nERROR: ${e.message?.slice(0,200)}`); } }
async function main() {
  await q("allocation_dist", `select amount, count(*) n from credit_transactions where type='ALLOCATION' group by 1 order by 2 desc limit 15`);
  await q("adjustment_rows", `select "academyId", amount, left(coalesce(description,''),80) d, "createdAt"::date from credit_transactions where type='ADJUSTMENT' order by amount desc limit 20`);
  await q("balances", `select round(avg(balance)) avg_bal, round(percentile_cont(0.5) within group (order by balance)::numeric) p50, max(balance) max, count(*) n from credit_balances`);
  await q("subscription_plans", `select * from subscription_plans limit 20`);
  await q("subscription_payments", `select status, count(*) n, sum(amount) krw from subscription_payments group by 1`);
  await q("provider_pricing", `select provider, left("modelPattern",50) m, "unitType", "inputUsdPer1M", "outputUsdPer1M", "unitUsd", "effectiveFrom"::date from provider_pricing order by "effectiveFrom" desc limit 30`);
  await q("cost_per_op_recent30", `
    select "operationType", count(*) rows, round(sum("costUsd"),3) usd, round(avg("costUsd"),5) avg_usd,
      round(avg("inputTokens")) in_avg, round(avg("outputTokens")) out_avg
    from platform_api_usage_costs where "usageAt" > now() - interval '30 days' group by 1 order by 3 desc limit 15`);
  await q("tutor_tables", `select table_name from information_schema.tables where table_schema='public' and table_name like 'tutor%' order by 1`);
  await q("app_events", `select count(*) n, min("createdAt")::date f, max("createdAt")::date l from app_events`);
  await q("passage_count", `select count(*) n, count(distinct "academyId") a from passages`);
  await q("exams", `select count(*) n, count(distinct "academyId") a from exams`);
  await p.$disconnect();
}
main();
