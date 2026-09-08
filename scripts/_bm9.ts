import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,220)}`);}}
(async()=>{
// 주간 코호트 × 동일 관측창 D8-30 재방문 (30일 경과분만)
await q("weekly_cohort_d8_30", `
 with a as (select id, "createdAt" c, date_trunc('week', "createdAt"+interval '9 hours') wk from academies where "createdAt" < now()-interval '30 days'),
      u as (select "academyId" aid, "createdAt" t from credit_transactions where type='CONSUMPTION')
 select to_char(wk,'YYYY-MM-DD') week, count(*) signups,
   count(*) filter (where exists(select 1 from u where u.aid=a.id and u.t < a.c+interval '7 days')) act_d7,
   count(*) filter (where exists(select 1 from u where u.aid=a.id and u.t>=a.c+interval '7 days' and u.t<a.c+interval '30 days')) ret_d8_30
 from a group by 1 order by 1`);
// 달력 정렬 비교: 각 코호트가 "가입 후 30일 시점"에 살아있었나 (동일 tenure)
await q("calendar_active_by_cohort_month", `
 with a as (select id, to_char("createdAt"+interval '9 hours','YYYY-MM') coh from academies),
      u as (select "academyId" aid, to_char("createdAt"+interval '9 hours','YYYY-MM') m from credit_transactions where type='CONSUMPTION' group by 1,2)
 select u.m as calendar_month, a.coh as signup_cohort, count(distinct u.aid) active
 from u join a on a.id=u.aid group by 1,2 order by 1,2`);
// 학원별 사용 지속일수(첫 사용~마지막 사용) 코호트별
await q("lifespan_by_cohort", `
 with u as (select "academyId" aid, min("createdAt") f, max("createdAt") l, count(*) n from credit_transactions where type='CONSUMPTION' group by 1),
      a as (select id, to_char("createdAt"+interval '9 hours','YYYY-MM') coh from academies)
 select a.coh, count(*) used, round(avg(extract(epoch from (u.l-u.f))/86400)::numeric,1) avg_lifespan_days,
   round(percentile_cont(0.5) within group (order by extract(epoch from (u.l-u.f))/86400)::numeric,1) p50_days,
   count(*) filter (where u.l-u.f > interval '7 days') over7d, round(avg(u.n)) avg_events
 from u join a on a.id=u.aid group by 1 order by 1`);
// 8월 이후 신규의 제품 사용 폭 (여러 기능을 쓰는가 = 정착 신호)
await q("feature_breadth_by_cohort", `
 with a as (select id, to_char("createdAt"+interval '9 hours','YYYY-MM') coh from academies),
      u as (select "academyId" aid, count(distinct "operationType") ops from credit_transactions where type='CONSUMPTION' group by 1)
 select a.coh, count(*) used, round(avg(u.ops),2) avg_distinct_features, max(u.ops) max_features
 from u join a on a.id=u.aid group by 1 order by 1`);
await p.$disconnect();})();
