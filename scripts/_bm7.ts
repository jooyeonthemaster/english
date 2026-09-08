import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,220)}`);}}
(async()=>{
// 1) 가입월 코호트 × 경과월 활동 삼각행렬 (우측 절단 주의)
await q("cohort_triangle", `
 with a as (select id, to_char("createdAt"+interval '9 hours','YYYY-MM') coh from academies),
      u as (select "academyId" aid, to_char("createdAt"+interval '9 hours','YYYY-MM') m from credit_transactions where type='CONSUMPTION' group by 1,2),
      j as (select a.coh, a.id, u.m,
            (extract(year from to_date(u.m,'YYYY-MM'))-extract(year from to_date(a.coh,'YYYY-MM')))*12
            + (extract(month from to_date(u.m,'YYYY-MM'))-extract(month from to_date(a.coh,'YYYY-MM'))) k
            from a join u on u.aid=a.id)
 select coh, k::int, count(distinct id) academies from j group by 1,2 order by 1,2`);
await q("cohort_size", `select to_char("createdAt"+interval '9 hours','YYYY-MM') coh, count(*) signups from academies group by 1 order by 1`);
// 2) 활성 학원의 다음달 잔존율 (품질 개선 전/후 비교의 정공법)
await q("month_over_month_retention", `
 with u as (select "academyId" aid, to_char("createdAt"+interval '9 hours','YYYY-MM') m from credit_transactions where type='CONSUMPTION' group by 1,2)
 select a.m, count(*) active, count(b.aid) returned_next, round(100.0*count(b.aid)/count(*),1) pct
 from u a left join u b on b.aid=a.aid and to_date(b.m,'YYYY-MM')=to_date(a.m,'YYYY-MM')+interval '1 month'
 group by 1 order by 1`);
// 3) 활성 학원당 사용 강도 추이 (품질↑ → 더 많이 쓴다?)
await q("intensity_per_active", `
 select to_char("createdAt"+interval '9 hours','YYYY-MM') m, count(distinct "academyId") active,
   count(*) events, round(count(*)::numeric/count(distinct "academyId"),1) events_per_academy,
   round(sum(-amount)::numeric/count(distinct "academyId"),1) credits_per_academy
 from credit_transactions where type='CONSUMPTION' group by 1 order by 1`);
// 4) 실패/환불률 = 품질 대리지표
await q("refund_rate_by_month", `
 with c as (select to_char("createdAt"+interval '9 hours','YYYY-MM') m, sum(-amount) used from credit_transactions where type='CONSUMPTION' group by 1),
      r as (select to_char("createdAt"+interval '9 hours','YYYY-MM') m, count(*) n, sum(amount) refunded from credit_transactions where type='REFUND' group by 1)
 select c.m, c.used, r.n refund_events, r.refunded, round(100.0*r.refunded/c.used,2) refund_pct from c left join r on c.m=r.m order by 1`);
await q("refund_by_op", `select "operationType", count(*) n, sum(amount) credits, min("createdAt")::date f, max("createdAt")::date l from credit_transactions where type='REFUND' group by 1 order by 3 desc limit 12`);
// 5) AI 잡 실패율 추이
await q("ai_job_status_by_month", `
 select to_char("createdAt"+interval '9 hours','YYYY-MM') m, status, count(*) n from workbench_ai_jobs group by 1,2 order by 1,3 desc`);
// 6) 재구매·결제 규모 추이 (지불의사 = 품질 인식의 대리지표)
await q("purchase_by_cohort", `
 select to_char(a."createdAt"+interval '9 hours','YYYY-MM') coh, count(distinct a.id) signups,
  count(distinct t."academyId") paid, round(100.0*count(distinct t."academyId")/count(distinct a.id),1) pct
 from academies a left join credit_top_ups t on t."academyId"=a.id and t.status='COMPLETED'
 group by 1 order by 1`);
await q("avg_ticket_by_month", `select to_char(coalesce("completedAt","createdAt")+interval '9 hours','YYYY-MM') m, count(*) n, round(avg(price)) avg_ticket, max(price) max_ticket from credit_top_ups where status='COMPLETED' group by 1 order by 1`);
// 7) 최근 가입 코호트가 실제로 살아있나 (8·9월 가입자의 9월 활동)
await q("recent_cohort_alive", `
 with a as (select id, to_char("createdAt"+interval '9 hours','YYYY-MM') coh from academies),
      u as (select "academyId" aid, max("createdAt") last_use, count(*) n from credit_transactions where type='CONSUMPTION' group by 1)
 select a.coh, count(*) signups, count(u.aid) ever_used,
   count(*) filter (where u.last_use > now() - interval '14 days') active_14d,
   count(*) filter (where u.last_use > now() - interval '30 days') active_30d
 from a left join u on u.aid=a.id group by 1 order by 1`);
await p.$disconnect();})();
