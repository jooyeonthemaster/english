import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,200)}`);}}
(async()=>{
await q("manual_payers", `
 select a.id, (a."createdAt"+interval '9 hours')::date signup, b.balance,
  (select count(*) from credit_transactions c where c."academyId"=a.id and c.type='CONSUMPTION' and c."createdAt">now()-interval '30 days') ev_30d,
  (select max(c."createdAt")::date from credit_transactions c where c."academyId"=a.id and c.type='CONSUMPTION') last_use
 from academies a left join credit_balances b on b."academyId"=a.id
 where a.id in ('cmr07n0ui0003l8046kfi6s6i','cmpj1ph4e0000l104ye4tv76c','cmtrdob3m0000jm04nf2ce50c')`);
await q("legacy_big_balance_active", `
 with use30 as (select "academyId" aid, count(*) n from credit_transactions where type='CONSUMPTION' and "createdAt">now()-interval '30 days' group by 1)
 select u.aid, u.n ev_30d, b.balance, left(a.name,20) name, a.status,
  (select left(coalesce(description,''),30) from credit_transactions t where t."academyId"=u.aid and t.type in ('ADJUSTMENT','ALLOCATION') and t.amount>=10000 order by t.amount desc limit 1) grant_note,
  exists(select 1 from credit_top_ups t where t."academyId"=u.aid and t.status='COMPLETED') paid
 from use30 u join credit_balances b on b."academyId"=u.aid join academies a on a.id=u.aid where b.balance>=10000 order by u.n desc`);
await q("pg_settlement_check", `select 19800*0.9791 a, 49500*0.9791 b, 132000*0.9791 c, 118800*0.9791 d, 39600*0.9791 e`);
await p.$disconnect();})();
