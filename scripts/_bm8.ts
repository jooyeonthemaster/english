import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,220)}`);}}
(async()=>{
// A) 동일 관측창 코호트 비교 (우측 절단 제거) — 가입 후 D0-7 활성화 / D8-35 재방문 / D36-65 재방문
await q("cohort_equal_window", `
 with a as (select id, "createdAt" c, to_char("createdAt"+interval '9 hours','YYYY-MM') coh from academies),
      u as (select "academyId" aid, "createdAt" t from credit_transactions where type='CONSUMPTION')
 select a.coh, count(distinct a.id) signups,
   count(distinct a.id) filter (where now() >= a.c + interval '35 days') obs35,
   count(distinct a.id) filter (where exists (select 1 from u where u.aid=a.id and u.t < a.c + interval '7 days')) act_d7,
   count(distinct a.id) filter (where now() >= a.c + interval '35 days' and exists (select 1 from u where u.aid=a.id and u.t >= a.c + interval '7 days' and u.t < a.c + interval '35 days')) ret_d8_35,
   count(distinct a.id) filter (where now() >= a.c + interval '65 days' and exists (select 1 from u where u.aid=a.id and u.t >= a.c + interval '35 days' and u.t < a.c + interval '65 days')) ret_d36_65,
   count(distinct a.id) filter (where now() >= a.c + interval '65 days') obs65
 from a group by 1 order by 1`);
// B) 이탈 후 복귀(부활) — 30일 이상 공백 뒤 재사용한 학원
await q("resurrection", `
 with u as (select "academyId" aid, "createdAt" t, lag("createdAt") over (partition by "academyId" order by "createdAt") prev from credit_transactions where type='CONSUMPTION')
 select to_char(t+interval '9 hours','YYYY-MM') m, count(distinct aid) resurrected
 from u where prev is not null and t - prev > interval '30 days' group by 1 order by 1`);
// C) 8월 대형 결제 학원의 정체 (신규인가 복귀인가)
await q("august_buyers", `
 select t."academyId", t.price, t."createdAt"::date paid_at, a."createdAt"::date signed_up,
   (select count(*) from credit_transactions ct where ct."academyId"=t."academyId" and ct.type='CONSUMPTION') total_events,
   (select min(ct."createdAt")::date from credit_transactions ct where ct."academyId"=t."academyId" and ct.type='CONSUMPTION') first_use
 from credit_top_ups t join academies a on a.id=t."academyId"
 where t.status='COMPLETED' and t."createdAt" >= '2026-08-01' order by t.price desc`);
// D) 품질 직접 지표 — 문항 품질경고 비율 추이
await q("quality_warnings_by_month", `
 select to_char("createdAt"+interval '9 hours','YYYY-MM') m, count(*) total,
   count(*) filter (where "structuredData"::text like '%_qualityWarnings%[%') with_warn_field,
   count(*) filter (where "structuredData"::text like '%_reviewRecommended":true%') review_flag,
   count(*) filter (where "structuredData"::text like '%_qualityMode":"relaxed"%') relaxed
 from questions group by 1 order by 1`);
// E) 재생성 압력 — 같은 지문에 대해 반복 생성한 비율(품질 불만 대리지표)
await q("regen_pressure", `
 with t as (select to_char(q."createdAt"+interval '9 hours','YYYY-MM') m, q."passageId" pid, q."subType" st, count(*) n from questions q group by 1,2,3)
 select m, count(*) combos, round(avg(n),2) avg_per_combo, count(*) filter (where n>=3) heavy_repeat from t group by 1 order by 1`);
// F) 학원별 마지막 활동일 분포 (지금 살아있는 게 몇 곳인가)
await q("alive_now", `
 with u as (select "academyId" aid, max("createdAt") last from credit_transactions where type='CONSUMPTION' group by 1)
 select count(*) ever_used,
   count(*) filter (where last > now()-interval '7 days') d7,
   count(*) filter (where last > now()-interval '14 days') d14,
   count(*) filter (where last > now()-interval '30 days') d30,
   count(*) filter (where last > now()-interval '60 days') d60 from u`);
await p.$disconnect();})();
