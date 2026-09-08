import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();const J=(x:any)=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?Number(v):v,2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,150)}`);}}
(async()=>{
await q("model_30d",`select left(model,55) model, count(*) rows, round(sum("costUsd"),3) usd, round(avg("costUsd"),5) avg, round(avg("inputTokens")) intok, round(avg("outputTokens")) outtok, round(avg("inputUsdPer1M"),3) in1m, round(avg("outputUsdPer1M"),3) out1m from platform_api_usage_costs where "usageAt">now()-interval '30 days' group by 1 order by 3 desc limit 15`);
await q("fx",`select distinct "usdToKrwRate" from platform_api_usage_costs order by 1 desc limit 5`);
await p.$disconnect();})();
