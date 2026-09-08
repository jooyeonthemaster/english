/* eslint-disable no-console */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });
import { prisma } from "../src/lib/prisma";
const A = "cmpi4i6nq0000jr04ktxo3qx8";
const KST = (d: Date|null) => d ? new Date(d.getTime()+9*3600e3).toISOString().replace("T"," ").slice(0,19) : "-";
async function main() {
  const students = await prisma.student.findMany({
    where: { academyId: A },
    select: { id:true, name:true, grade:true, school:true, status:true, createdAt:true },
    orderBy: { createdAt: "asc" },
  });
  console.log("M.P학원 로스터 학생 수:", students.length);
  for (const s of students) {
    const linked = await prisma.examReportStudent.count({ where: { studentId: s.id, deletedAt: null } });
    console.log(`${s.id} | ${s.name.padEnd(6)} | ${s.grade}학년 | ${s.status} | 생성 ${KST(s.createdAt)} | 내신리포트 연결 ${linked}건`);
  }
  console.log("\n=== 이름에 '소윤' 포함 ===");
  for (const s of students.filter(x => x.name.includes("소윤"))) {
    const rows = await prisma.examReportStudent.findMany({ where: { studentId: s.id }, select: { id:true, studentName:true, examAnalysisId:true, deletedAt:true } });
    console.log(s.id, s.name, `grade=${s.grade}`, "→", JSON.stringify(rows.map(r=>({id:r.id.slice(0,10), del:!!r.deletedAt}))));
  }
  console.log("\n=== 반(Class) 확인 ===");
  const cls = await prisma.class.findMany({ where: { academyId: A }, select: { id:true, name:true } });
  console.log(cls.map(c=>c.name).join(" | "));
}
main().finally(() => prisma.$disconnect());
