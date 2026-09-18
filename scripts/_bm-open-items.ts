import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,160)}`);}}
(async()=>{
await q("help_posts", `select id, left(coalesce(title,''),40) t, status, "createdAt"::date, "academyId" from help_posts order by "createdAt" desc limit 15`);
await q("help_tables", `select table_name from information_schema.tables where table_schema='public' and (table_name like '%help%' or table_name like '%inquir%' or table_name like '%support%')`);
await q("share_token_col", `select column_name from information_schema.columns where table_name='exam_analyses' and column_name='shareToken'`);
await q("sept_new_academy_usage", `
 with a as (select id from academies where "createdAt">='2026-09-01'),
      u as (select "academyId" aid, count(*) n from credit_transactions where type='CONSUMPTION' group by 1)
 select count(*) sept_signups, count(u.aid) used, round(avg(u.n)) avg_events,
  count(*) filter (where u.n>=20) used_20plus from a left join u on u.aid=a.id`);
await q("top_academies_30d", `select "academyId", count(*) n from credit_transactions where type='CONSUMPTION' and "createdAt">now()-interval '30 days' group by 1 order by 2 desc limit 8`);
await p.$disconnect();})();
