import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const J = (x: any) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2);
async function q(label: string, sql: string) {
  try { console.log(`\n### ${label}\n` + J(await p.$queryRawUnsafe(sql))); }
  catch (e: any) { console.log(`\n### ${label}\nERROR: ${e.message?.slice(0,300)}`); }
}
async function main() {
  await q("students_total", `select count(*) n, count(distinct "academyId") academies from students`);
  await q("class_enrollments", `select count(*) n from class_enrollments`);
  await q("classes", `select count(*) n, count(distinct "academyId") academies from classes`);
  // 유료 vs 무료 학원의 원가
  await q("cost_paying_vs_free", `
    with payer as (select distinct "academyId" from credit_top_ups where status='COMPLETED')
    select case when c."academyId" in (select "academyId" from payer) then 'PAID' else 'FREE' end grp,
      count(distinct c."academyId") academies, count(*) rows, round(sum(c."costUsd"),2) usd
    from platform_api_usage_costs c where c."academyId" is not null group by 1`);
  // 학원×월 원가 분포 (월간 유지비 실측)
  await q("cost_per_academy_month", `
    select to_char("usageAt" + interval '9 hours','YYYY-MM') m, count(distinct "academyId") academies,
      round(sum("costUsd"),2) usd, round(sum("costUsd")/nullif(count(distinct "academyId"),0),3) usd_per_academy
    from platform_api_usage_costs where "academyId" is not null group by 1 order by 1`);
  await q("cost_academy_month_percentiles", `
    with t as (select "academyId", to_char("usageAt" + interval '9 hours','YYYY-MM') m, sum("costUsd") usd
               from platform_api_usage_costs where "academyId" is not null group by 1,2)
    select count(*) n, round(avg(usd),3) avg, round(percentile_cont(0.5) within group (order by usd)::numeric,3) p50,
      round(percentile_cont(0.9) within group (order by usd)::numeric,3) p90,
      round(percentile_cont(0.99) within group (order by usd)::numeric,3) p99, round(max(usd),3) max from t`);
  // 무료 크레딧 지급 규모
  await q("credit_grants", `select type, count(*) n, sum(amount) credits, count(distinct "academyId") academies from credit_transactions where amount>0 group by 1 order by 3 desc`);
  await q("grants_by_month", `select to_char("createdAt" + interval '9 hours','YYYY-MM') m, type, sum(amount) credits from credit_transactions where amount>0 group by 1,2 order by 1,3 desc`);
  // 리텐션: 소비 활동 월 수 분포
  await q("academy_active_months", `
    with t as (select "academyId", to_char("createdAt" + interval '9 hours','YYYY-MM') m from credit_transactions where type='CONSUMPTION' group by 1,2)
    select cnt months_active, count(*) academies from (select "academyId", count(*) cnt from t group by 1) x group by 1 order by 1`);
  await q("mau_academies", `
    select to_char("createdAt" + interval '9 hours','YYYY-MM') m, count(distinct "academyId") active_academies, count(distinct "staffId") active_staff
    from credit_transactions where type='CONSUMPTION' group by 1 order by 1`);
  // 유료 전환율
  await q("conversion", `
    select (select count(*) from academies) academies,
      (select count(distinct "academyId") from credit_transactions where type='CONSUMPTION') ever_used,
      (select count(distinct "academyId") from credit_top_ups where status='COMPLETED') ever_paid`);
  // 학생앱 사용량
  await q("tutor_attempts", `select count(*) n, count(distinct "studentId") students, min("createdAt") first, max("createdAt") last from tutor_attempts`);
  await q("exam_submissions", `select count(*) n, count(distinct "studentId") students from exam_submissions`);
  await q("vocab_results", `select count(*) n, count(distinct "studentId") students from vocab_test_results`);
  // 문항 1건당 실원가 (월별)
  await q("cost_per_question_month", `
    select to_char(c."usageAt" + interval '9 hours','YYYY-MM') m, sum(c.calls) calls, round(sum(c."costUsd"),2) usd
    from platform_api_usage_costs c where c."operationType"='QUESTION_GEN_SINGLE' group by 1 order by 1`);
  await q("credit_events_per_month_qgen", `
    select to_char("createdAt" + interval '9 hours','YYYY-MM') m, count(*) events, sum(-amount) credits
    from credit_transactions where type='CONSUMPTION' and "operationType"='QUESTION_GEN_SINGLE' group by 1 order by 1`);
  await p.$disconnect();
}
main();
