import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const J = (x: any) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2);
async function q(l: string, s: string) { try { console.log(`\n### ${l}\n` + J(await p.$queryRawUnsafe(s))); } catch (e: any) { console.log(`\n### ${l}\nERROR: ${e.message?.slice(0,200)}`); } }
async function main() {
  await q("events_30d", `select "operationType", count(*) events, sum(-amount) credits from credit_transactions where type='CONSUMPTION' and "createdAt">now()-interval '30 days' group by 1 order by 2 desc`);
  // 무제한 크레딧(1M) 학원 3곳의 월별 원가 = "무료 개방 시 행동" 자연실험
  await q("unlimited_academies_monthly", `
    select "academyId", to_char("usageAt"+interval '9 hours','YYYY-MM') m, round(sum("costUsd"),2) usd, sum(calls) calls
    from platform_api_usage_costs
    where "academyId" in ('cmommhl7a0000mmekxmbqfefe','cmp6widqc0000l604skbduz0y','cmor7zue60000v3c47bjl7h63','cmp3lj3810001jr04s1hzfbbk','cmp0uus900000l804cfq0wphc','cmpihc24n0000l104xzthkjpp')
    group by 1,2 order by 1,2`);
  // 상위 학원 월별 원가 (헤비 유저 상한)
  await q("top_academy_monthly", `
    select "academyId", to_char("usageAt"+interval '9 hours','YYYY-MM') m, round(sum("costUsd"),2) usd
    from platform_api_usage_costs where "academyId" is not null
    group by 1,2 having sum("costUsd")>10 order by 3 desc limit 25`);
  // 크레딧 1개당 실제 원가 (월별) = 마진 계산의 핵심
  await q("cost_vs_credits_monthly", `
    with c as (select to_char("usageAt"+interval '9 hours','YYYY-MM') m, sum("costUsd") usd from platform_api_usage_costs group by 1),
         t as (select to_char("createdAt"+interval '9 hours','YYYY-MM') m, sum(-amount) credits from credit_transactions where type='CONSUMPTION' group by 1)
    select c.m, round(c.usd,2) usd, t.credits, round((c.usd*1400)/nullif(t.credits,0),1) krw_cost_per_credit from c join t on c.m=t.m order by 1`);
  // 최근 30일 QUESTION_GEN_SINGLE 호출/이벤트 비율
  await q("qgen_calls_vs_events_30d", `
    select (select count(*) from platform_api_usage_costs where "operationType"='QUESTION_GEN_SINGLE' and "usageAt">now()-interval '30 days') calls,
           (select count(*) from credit_transactions where type='CONSUMPTION' and "operationType"='QUESTION_GEN_SINGLE' and "createdAt">now()-interval '30 days') events,
           (select round(sum("costUsd"),2) from platform_api_usage_costs where "operationType"='QUESTION_GEN_SINGLE' and "usageAt">now()-interval '30 days') usd`);
  // 학습지(PASSAGE_ANALYSIS) 1건 원가
  await q("worksheet_30d", `
    select (select count(*) from platform_api_usage_costs where "operationType"='PASSAGE_ANALYSIS' and "usageAt">now()-interval '30 days') calls,
           (select count(*) from credit_transactions where type='CONSUMPTION' and "operationType"='PASSAGE_ANALYSIS' and "createdAt">now()-interval '30 days') events,
           (select round(sum("costUsd"),2) from platform_api_usage_costs where "operationType"='PASSAGE_ANALYSIS' and "usageAt">now()-interval '30 days') usd`);
  // 학원별 문항 생성량 분포 (성수기 헤비유저)
  await q("qgen_per_academy_month", `
    with t as (select "academyId", to_char("createdAt"+interval '9 hours','YYYY-MM') m, count(*) n from credit_transactions where type='CONSUMPTION' and "operationType" in ('QUESTION_GEN_SINGLE','AUTO_GEN_BATCH','QUESTION_GEN_VOCAB') group by 1,2)
    select round(avg(n)) avg, percentile_cont(0.5) within group (order by n) p50, percentile_cont(0.9) within group (order by n) p90, max(n) max, count(*) n_academy_months from t`);
  await p.$disconnect();
}
main();
