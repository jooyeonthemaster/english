import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
(async()=>{
const r=await p.$queryRawUnsafe(`
 with paid as (select distinct "academyId" aid from credit_top_ups where status='COMPLETED'
               union select unnest(array['cmr07n0ui0003l8046kfi6s6i','cmpj1ph4e0000l104ye4tv76c','cmtrdob3m0000jm04nf2ce50c']))
 select count(distinct t."academyId") tried_never_paid, count(*) attempts, sum(t.price) krw,
   count(distinct t."academyId") filter (where t."createdAt">now()-interval '30 days') tried_30d,
   max((t."createdAt"+interval '9 hours')::date) last_try
 from credit_top_ups t where t.status in ('PENDING','FAILED','WAITING_FOR_DEPOSIT') and t."academyId" not in (select aid from paid)`);
console.log(J(r)); await p.$disconnect();})();
