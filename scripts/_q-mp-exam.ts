/* eslint-disable no-console */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });
import { prisma } from "../src/lib/prisma";
const A = "cmpi4i6nq0000jr04ktxo3qx8";
async function main() {
  console.log("자체 시험지(Exam) 수:", await prisma.exam.count({ where: { academyId: A } }));
  const ex = await prisma.exam.findMany({ where: { academyId: A }, select: { id:true, title:true, status:true, createdAt:true }, take: 10 });
  console.log(JSON.stringify(ex, null, 1));
  console.log("ExamSubmission 수:", await prisma.examSubmission.count({ where: { exam: { academyId: A } } }));
  console.log("소윤 로스터의 ExamSubmission:", await prisma.examSubmission.count({ where: { studentId: "cmsgu2m010001ld04fhfmo520" } }));
}
main().finally(() => prisma.$disconnect());
