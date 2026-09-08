/* 읽기 전용 집계 — 무료화 전략 리서치용. 쓰기 없음. */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const J = (x: any) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2);
async function q(label: string, sql: string) {
  try {
    const r = await p.$queryRawUnsafe(sql);
    console.log(`\n### ${label}\n` + J(r));
  } catch (e: any) {
    console.log(`\n### ${label}\nERROR: ${e.message?.slice(0, 300)}`);
  }
}
async function main() {
  await q("academies_by_status", `select status, count(*) from academies group by 1 order by 2 desc`);
  await q("academies_by_month", `select to_char("createdAt" + interval '9 hours','YYYY-MM') m, count(*) from academies group by 1 order by 1`);
  await q("revenue_by_month", `select to_char(coalesce("completedAt","createdAt") + interval '9 hours','YYYY-MM') m, count(*) n, sum(price) krw, count(distinct "academyId") academies from credit_top_ups where status='COMPLETED' group by 1 order by 1`);
  await q("revenue_total", `select count(*) n, sum(price) krw, count(distinct "academyId") academies, min("createdAt") first, max("createdAt") last from credit_top_ups where status='COMPLETED'`);
  await q("topup_pack_mix", `select "creditAmount", count(*) n, sum(price) krw from credit_top_ups where status='COMPLETED' group by 1 order by 1`);
  await q("paying_academy_ltv", `select "academyId", count(*) n, sum(price) krw, min("createdAt")::date first, max("createdAt")::date last from credit_top_ups where status='COMPLETED' group by 1 order by 3 desc limit 30`);
  await q("consumption_by_op_90d", `select "operationType", count(*) n, sum(-amount) credits from credit_transactions where type='CONSUMPTION' and "createdAt" > now() - interval '90 days' group by 1 order by 3 desc`);
  await q("consumption_by_op_all", `select "operationType", count(*) n, sum(-amount) credits from credit_transactions where type='CONSUMPTION' group by 1 order by 3 desc`);
  await q("consumption_by_month", `select to_char("createdAt" + interval '9 hours','YYYY-MM') m, count(*) n, sum(-amount) credits, count(distinct "academyId") academies from credit_transactions where type='CONSUMPTION' group by 1 order by 1`);
  await q("apicost_by_month", `select to_char("usageAt" + interval '9 hours','YYYY-MM') m, count(*) rows, sum(calls) calls, round(sum("costUsd"),2) usd, sum("costKrw") krw from platform_api_usage_costs group by 1 order by 1`);
  await q("apicost_by_op_90d", `select "operationType", count(*) rows, sum(calls) calls, round(sum("costUsd"),3) usd, round(avg("costUsd"),5) usd_avg_row, sum("inputTokens") intok, sum("outputTokens") outtok from platform_api_usage_costs where "usageAt" > now() - interval '90 days' group by 1 order by 4 desc`);
  await q("apicost_by_provider_90d", `select provider, "unitType", count(*) rows, round(sum("costUsd"),3) usd from platform_api_usage_costs where "usageAt" > now() - interval '90 days' group by 1,2 order by 4 desc`);
  await q("apicost_by_model_90d", `select left(model,60) model, count(*) rows, sum(calls) calls, round(sum("costUsd"),3) usd, round(avg("costUsd"),5) avg_usd from platform_api_usage_costs where "usageAt" > now() - interval '90 days' group by 1 order by 4 desc limit 25`);
  await q("apicost_pricing_source", `select "pricingSource", count(*) rows, round(sum("costUsd"),3) usd from platform_api_usage_costs group by 1 order by 3 desc`);
  await q("apicost_by_academy_90d", `select "academyId", count(*) rows, round(sum("costUsd"),3) usd from platform_api_usage_costs where "usageAt" > now() - interval '90 days' group by 1 order by 3 desc limit 20`);
  await q("students", `select count(*) total, count(*) filter (where "isActive") active from students`);
  await q("students_by_academy", `select "academyId", count(*) n from students group by 1 order by 2 desc limit 20`);
  await q("staff", `select role, count(*) from staff group by 1`);
  await q("seat_billing_runs", `select * from seat_billing_runs order by "yearMonth" desc limit 20`);
  await q("billing_plans", `select * from billing_plans limit 20`);
  await q("questions_by_month", `select to_char("createdAt" + interval '9 hours','YYYY-MM') m, count(*) n from questions group by 1 order by 1`);
  await q("passage_reports_by_month", `select to_char("createdAt" + interval '9 hours','YYYY-MM') m, count(*) n from passage_reports group by 1 order by 1`);
  await q("subscriptions", `select status, count(*) from academy_subscriptions group by 1`);
  await p.$disconnect();
}
main();
