import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,200)}`);}}
(async()=>{
// 1) 무료 살포 시기 특정: 무상 지급(ALLOCATION/ADJUSTMENT) 일자·규모
await q("free_grants_by_week", `
 select to_char(date_trunc('week',"createdAt"+interval '9 hours'),'YYYY-MM-DD') wk, type,
   count(*) n, count(distinct "academyId") academies, sum(amount) credits,
   count(*) filter (where amount>=3000 and amount<100000000) big_grants
 from credit_transactions where type in ('ALLOCATION','ADJUSTMENT') and amount>0
   and coalesce(description,'') not like '%입금%' and coalesce(description,'') not like '%계좌이체%'
 group by 1,2 order by 1,2`);
await q("allocation_amount_by_month", `
 select to_char("createdAt"+interval '9 hours','YYYY-MM') m, amount, count(*) n
 from credit_transactions where type='ALLOCATION' group by 1,2 order by 1,3 desc`);
// 2) 결제 학원 전원: 무료기(5/1~6/30) 사용량, 첫 결제 전 사용량, 무상 크레딧
await q("payers_profile", `
 with pay as (select "academyId" aid, min("createdAt") first_pay, max("createdAt") last_pay, count(*) n_pay, sum(price) krw
              from credit_top_ups where status='COMPLETED' group by 1),
      c as (select "academyId" aid, "createdAt" t from credit_transactions where type='CONSUMPTION'),
      g as (select "academyId" aid, sum(amount) free_credits from credit_transactions
            where type in ('ALLOCATION','ADJUSTMENT') and amount>0 and amount<100000000
              and coalesce(description,'') not like '%입금%' and coalesce(description,'') not like '%계좌이체%' group by 1)
 select pay.aid, a."createdAt"::date signup, pay.first_pay::date first_pay, pay.last_pay::date last_pay, pay.n_pay, pay.krw,
   coalesce(g.free_credits,0) free_credits,
   (select count(*) from c where c.aid=pay.aid and c.t < '2026-07-01'::timestamp - interval '9 hours') ev_may_jun,
   (select count(distinct to_char(c.t+interval '9 hours','YYYY-MM-DD')) from c where c.aid=pay.aid and c.t < '2026-07-01'::timestamp - interval '9 hours') days_may_jun,
   (select count(*) from c where c.aid=pay.aid and c.t < pay.first_pay) ev_before_pay,
   (select count(*) from c where c.aid=pay.aid and c.t > now()-interval '30 days') ev_30d
 from pay join academies a on a.id=pay.aid left join g on g.aid=pay.aid
 order by pay.first_pay`);
// 3) 역방향: 무료기 활발 사용자 중 몇 %가 결제했나 (임계별)
await q("reverse_free_heavy_to_paid", `
 with c as (select "academyId" aid, count(*) ev, count(distinct to_char("createdAt"+interval '9 hours','YYYY-MM-DD')) days
            from credit_transactions where type='CONSUMPTION' and "createdAt" < '2026-07-01'::timestamp - interval '9 hours' group by 1),
      pay as (select distinct "academyId" aid from credit_top_ups where status='COMPLETED')
 select '1건 이상' tier, count(*) users, count(pay.aid) paid from c left join pay on pay.aid=c.aid
 union all select '20건 이상', count(*), count(pay.aid) from c left join pay on pay.aid=c.aid where c.ev>=20
 union all select '100건 이상', count(*), count(pay.aid) from c left join pay on pay.aid=c.aid where c.ev>=100
 union all select '3일 이상 사용', count(*), count(pay.aid) from c left join pay on pay.aid=c.aid where c.days>=3`);
await p.$disconnect();})();
