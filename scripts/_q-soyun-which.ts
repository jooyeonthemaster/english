/* eslint-disable no-console */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });
import { prisma } from "../src/lib/prisma";
const KST = (d: Date|null|undefined) => d ? new Date(d.getTime()+9*3600e3).toISOString().replace("T"," ").slice(0,19) : "-";
const IDS = [
  { id: "cmsgu2m010001ld04fhfmo520", tag: "소윤A(3학년, 08-06)" },
  { id: "cmtf8dq150001jc0aley1ku0y", tag: "소윤B(1학년, 08-30)" },
];
async function main() {
  for (const { id, tag } of IDS) {
    console.log("=========", tag, id, "=========");
    const s = await prisma.student.findUnique({ where: { id } });
    console.log("  school:", s?.school, "| grade:", s?.grade, "| phone:", s?.phone, "| status:", s?.status, "| createdAt:", KST(s?.createdAt), "| updatedAt:", KST(s?.updatedAt));
    const enr = await prisma.classEnrollment.findMany({ where: { studentId: id }, include: { class: { select: { name: true } } } });
    console.log("  반 등록:", enr.map(e => `${e.class.name}(${KST(e.createdAt)})`).join(", ") || "없음");
    console.log("  출결:", await prisma.attendance.count({ where: { studentId: id } }));
    console.log("  과제(StudyAssignmentTask):", await prisma.studyAssignmentTask.count({ where: { studentId: id } }));
    console.log("  단어시험 결과:", await prisma.vocabTestResult.count({ where: { studentId: id } }));
    console.log("  학습 진행(StudyProgress):", await prisma.studyProgress.count({ where: { studentId: id } }));
    console.log("  세션기록:", await prisma.sessionRecord.count({ where: { studentId: id } }));
    console.log("  내신리포트 연결:", await prisma.examReportStudent.count({ where: { studentId: id, deletedAt: null } }));
    console.log("  상담:", await prisma.consultation.count({ where: { studentId: id } }));
    console.log("  학부모 연결:", await prisma.parentStudent.count({ where: { studentId: id } }));
  }
}
main().finally(() => prisma.$disconnect());
