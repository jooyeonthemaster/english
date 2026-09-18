import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,200)}`);}}
(async()=>{
// 1) 결제 원장 밖 수동 충전(계좌이체·무통장) — 돈을 낸 흔적
await q("manual_paid_adjustments", `
 select ct."academyId", ct.amount, ct."createdAt"::date d, left(coalesce(ct.description,''),50) descr,
   exists(select 1 from credit_top_ups t where t."academyId"=ct."academyId" and t.status='COMPLETED') in_topups
 from credit_transactions ct
 where ct.type='ADJUSTMENT' and ct.amount>0 and ct.amount<100000
   and (ct.description ilike '%입금%' or ct.description ilike '%계좌%' or ct.description ilike '%이체%' or ct.description ilike '%결제%' or ct.description ilike '%구매%')
 order by ct."createdAt"`);
await q("all_adjustments_recent", `select "academyId", amount, "createdAt"::date d, left(coalesce(description,''),60) descr from credit_transactions where type='ADJUSTMENT' and "createdAt">='2026-07-01' order by "createdAt"`);
await q("bank_deposits", `select status, count(*) n, sum(amount) krw from bank_deposit_notifications group by 1`);
// 2) 결제 원장 상태별 (대기·실패 포함)
await q("topup_status", `select status, count(*) n, sum(price) krw, count(distinct "academyId") academies from credit_top_ups group by 1 order by 2 desc`);
// 3) 결제 학원 정의별 집계
await q("payer_definitions", `
 with pay as (select "academyId" aid, max("createdAt") last_pay from credit_top_ups where status='COMPLETED' group by 1),
      use30 as (select distinct "academyId" aid from credit_transactions where type='CONSUMPTION' and "createdAt">now()-interval '30 days')
 select (select count(*) from pay) ever_paid,
        (select count(*) from pay where last_pay>now()-interval '30 days') paid_30d,
        (select count(*) from pay where last_pay>now()-interval '60 days') paid_60d,
        (select count(*) from pay join use30 on use30.aid=pay.aid) ever_paid_and_used_30d,
        (select count(*) from use30) active_30d`);
// 4) 30일 활성인데 결제 이력 없는 학원: 무엇으로 쓰고 있나(잔액)
await q("active_nonpayers_balance", `
 with use30 as (select "academyId" aid, count(*) n from credit_transactions where type='CONSUMPTION' and "createdAt">now()-interval '30 days' group by 1),
      pay as (select distinct "academyId" aid from credit_top_ups where status='COMPLETED')
 select case when b.balance>=10000 then 'A_레거시대량(1만+)' when b.balance>=500 then 'B_500~1만' when b.balance>0 then 'C_1~499' else 'D_0' end bucket,
   count(*) academies, sum(u.n) events_30d
 from use30 u left join pay on pay.aid=u.aid left join credit_balances b on b."academyId"=u.aid
 where pay.aid is null group by 1 order by 1`);
await q("active_nonpayers_top", `
 with use30 as (select "academyId" aid, count(*) n from credit_transactions where type='CONSUMPTION' and "createdAt">now()-interval '30 days' group by 1),
      pay as (select distinct "academyId" aid from credit_top_ups where status='COMPLETED')
 select u.aid, u.n events_30d, b.balance, a."createdAt"::date signup from use30 u left join pay on pay.aid=u.aid
 left join credit_balances b on b."academyId"=u.aid join academies a on a.id=u.aid where pay.aid is null order by u.n desc limit 10`);
// 5) 결제 학원의 남은 유료 잔액(선불이라 결제 안 해도 고객일 수 있음)
await q("payers_balance", `
 with pay as (select "academyId" aid, max("createdAt") last_pay, sum(price) krw from credit_top_ups where status='COMPLETED' group by 1)
 select pay.aid, pay.last_pay::date, pay.krw, b.balance, b."expiresAt"::date exp from pay left join credit_balances b on b."academyId"=pay.aid order by pay.last_pay desc`);
await p.$disconnect();})();
