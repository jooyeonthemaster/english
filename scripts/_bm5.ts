import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const J = (x: any) => JSON.stringify(x, (_k,v)=> typeof v==='bigint'?Number(v):v, 2);
async function q(l:string,s:string){try{console.log(`\n### ${l}\n`+J(await p.$queryRawUnsafe(s)));}catch(e:any){console.log(`\n### ${l}\nERR ${e.message?.slice(0,150)}`);}}
async function main(){
  for (const t of ["tutor_attempts","tutor_assignments","tutor_progress","tutor_learning_events","tutor_student_sessions","tutor_conversations","tutor_mastery","assignment_submissions","exam_submissions","student_daily_missions","app_events"]) {
    await q(t, `select count(*) n from ${t}`);
  }
  await q("app_events_by_type", `select "eventType", count(*) n from app_events group by 1 order by 2 desc limit 15`);
  await q("students_detail", `select "academyId", count(*) n, min("createdAt")::date f, max("createdAt")::date l from students group by 1 order by 2 desc`);
  await p.$disconnect();
}
main();
