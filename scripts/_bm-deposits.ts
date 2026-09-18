import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,200)}`);}}
(async()=>{
// 입금자명은 첫 글자+길이로만 마스킹, rawText 미출력
await q("deposits_unmatched_ignored", `
 select d.status, d.amount, (coalesce(d."occurredAt",d."receivedAt")+interval '9 hours')::date dt,
   left(coalesce(d."depositorName",''),1)||'*'||length(coalesce(d."depositorName",'')) who,
   left(coalesce(d.note,''),70) note,
   (select count(*) from credit_top_ups t where t.price=d.amount and t.status in ('WAITING_FOR_DEPOSIT','PENDING')
      and abs(extract(epoch from (t."createdAt"-coalesce(d."occurredAt",d."receivedAt"))))<3*86400) near_open_orders,
   (select count(*) from credit_top_ups t where t.price=d.amount and t.status='COMPLETED'
      and abs(extract(epoch from (t."createdAt"-coalesce(d."occurredAt",d."receivedAt"))))<3*86400) near_completed
 from bank_deposit_notifications d where d.status in ('UNMATCHED','IGNORED','MANUAL_GRANT','AMBIGUOUS','FAILED')
 order by coalesce(d."occurredAt",d."receivedAt")`);
await q("waiting_for_deposit_orders", `
 select t."academyId", t.price, t."creditAmount", (t."createdAt"+interval '9 hours')::date dt, t.status,
   exists(select 1 from credit_top_ups c where c."academyId"=t."academyId" and c.status='COMPLETED' and c."createdAt">=t."createdAt") later_completed
 from credit_top_ups t where t.status='WAITING_FOR_DEPOSIT' order by t."createdAt"`);
await q("matched_deposits_by_month", `select to_char(coalesce("occurredAt","receivedAt")+interval '9 hours','YYYY-MM') m, status, count(*) n, sum(amount) krw from bank_deposit_notifications group by 1,2 order by 1,2`);
await p.$disconnect();})();
