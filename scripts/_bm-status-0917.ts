import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,200)}`);}}
(async()=>{
await q("signups_by_month", `select to_char("createdAt"+interval '9 hours','YYYY-MM') m, count(*) n from academies group by 1 order by 1`);
await q("signups_last_21d_weekly", `select to_char(date_trunc('week',"createdAt"+interval '9 hours'),'MM-DD') wk, count(*) n from academies where "createdAt">now()-interval '35 days' group by 1 order by 1`);
await q("revenue_by_month", `select to_char(coalesce("completedAt","createdAt")+interval '9 hours','YYYY-MM') m, count(*) n, sum(price) krw, count(distinct "academyId") academies from credit_top_ups where status='COMPLETED' group by 1 order by 1`);
await q("sept_payments_detail", `select t."academyId", t.price, t."creditAmount", t."createdAt"::date paid, a."createdAt"::date signup from credit_top_ups t join academies a on a.id=t."academyId" where t.status='COMPLETED' and t."createdAt">='2026-09-01' order by t."createdAt"`);
await q("mau_by_month", `select to_char("createdAt"+interval '9 hours','YYYY-MM') m, count(distinct "academyId") active, count(*) events, sum(-amount) credits from credit_transactions where type='CONSUMPTION' group by 1 order by 1`);
await q("alive_now", `with u as (select "academyId" aid, max("createdAt") last from credit_transactions where type='CONSUMPTION' group by 1)
 select count(*) ever_used, count(*) filter (where last>now()-interval '7 days') d7, count(*) filter (where last>now()-interval '14 days') d14, count(*) filter (where last>now()-interval '30 days') d30 from u`);
// ★ 판정 게이트: 코호트별 D8-30 재방문 (9/17 기준 8월 코호트 대부분 관측 가능)
await q("GATE_d8_30_by_cohort", `
 with a as (select id, "createdAt" c, to_char("createdAt"+interval '9 hours','YYYY-MM') coh from academies),
      u as (select "academyId" aid, "createdAt" t from credit_transactions where type='CONSUMPTION')
 select a.coh,
   count(*) filter (where now()>=a.c+interval '30 days') observable,
   count(*) filter (where now()>=a.c+interval '30 days' and exists(select 1 from u where u.aid=a.id and u.t<a.c+interval '7 days')) activated,
   count(*) filter (where now()>=a.c+interval '30 days' and exists(select 1 from u where u.aid=a.id and u.t>=a.c+interval '7 days' and u.t<a.c+interval '30 days')) ret_d8_30
 from a group by 1 order by 1`);
await q("GATE_d8_30_weekly", `
 with a as (select id, "createdAt" c, date_trunc('week',"createdAt"+interval '9 hours') wk from academies where "createdAt"<now()-interval '30 days'),
      u as (select "academyId" aid, "createdAt" t from credit_transactions where type='CONSUMPTION')
 select to_char(wk,'MM-DD') week, count(*) signups,
   count(*) filter (where exists(select 1 from u where u.aid=a.id and u.t<a.c+interval '7 days')) act_d7,
   count(*) filter (where exists(select 1 from u where u.aid=a.id and u.t>=a.c+interval '7 days' and u.t<a.c+interval '30 days')) ret_d8_30
 from a where wk>='2026-07-01' group by 1 order by 1`);
// 품질: 실패율 (9/8 수리 효과)
await q("ai_job_fail_rate", `select to_char("createdAt"+interval '9 hours','YYYY-MM-DD') d, count(*) total, count(*) filter (where status='FAILED') failed,
 round(100.0*count(*) filter (where status='FAILED')/nullif(count(*),0),1) pct from workbench_ai_jobs where "createdAt">now()-interval '24 days' group by 1 order by 1`);
await q("ai_job_fail_monthly", `select to_char("createdAt"+interval '9 hours','YYYY-MM') m, count(*) total, count(*) filter (where status='FAILED') failed, round(100.0*count(*) filter (where status='FAILED')/nullif(count(*),0),1) pct from workbench_ai_jobs group by 1 order by 1`);
await q("refund_rate", `with c as (select to_char("createdAt"+interval '9 hours','YYYY-MM') m, sum(-amount) used from credit_transactions where type='CONSUMPTION' group by 1),
  r as (select to_char("createdAt"+interval '9 hours','YYYY-MM') m, sum(amount) ref from credit_transactions where type='REFUND' group by 1)
 select c.m, c.used, r.ref, round(100.0*r.ref/c.used,2) pct from c left join r on c.m=r.m order by 1`);
// 원가
await q("api_cost_by_month", `select to_char("usageAt"+interval '9 hours','YYYY-MM') m, count(*) rows, round(sum("costUsd"),2) usd, sum("costKrw") krw from platform_api_usage_costs group by 1 order by 1`);
await q("cost_per_question_recent", `select (select count(*) from credit_transactions where type='CONSUMPTION' and "operationType"='QUESTION_GEN_SINGLE' and "createdAt">now()-interval '30 days') events,
 (select round(sum("costUsd"),2) from platform_api_usage_costs where "operationType"='QUESTION_GEN_SINGLE' and "usageAt">now()-interval '30 days') usd`);
// 학생앱
await q("student_side", `select (select count(*) from students) students, (select count(*) from tutor_attempts) attempts, (select count(*) from tutor_mastery) mastery, (select count(*) from exam_submissions) exam_sub, (select count(*) from vocab_test_results) vocab, (select count(*) from tutor_student_sessions) sessions`);
await q("students_new", `select to_char("createdAt"+interval '9 hours','YYYY-MM') m, count(*) n from students group by 1 order by 1`);
// 구독
await q("subs", `select status, count(*) from academy_subscriptions group by 1`);
await q("sub_payments", `select status, count(*) n, sum(amount) krw from subscription_payments group by 1`);
await p.$disconnect();})();
