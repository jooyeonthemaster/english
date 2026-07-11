/* eslint-disable no-console */
/**
 * UI 검수 전용 E2E 스태프 계정 upsert — 26-07-11 학생관리 대개편 검수용.
 *   npx tsx scripts/_e2e-staff-upsert.ts [--student <studentId>]
 *
 * 대상 학생이 속한 학원에 DIRECTOR 권한 계정(e2e-fable@smoat.test)을 만든다.
 * additive — 기존 계정·비밀번호는 일절 건드리지 않는다. 검수 후 isActive=false
 * 로 내리려면 --deactivate 를 붙여 재실행.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const args = process.argv.slice(2);
function argOf(flag: string, fallback: string): string {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const STUDENT_ID = argOf("--student", "cmpavfoiq0001mm9sga30eupz");
const EMAIL = "e2e-fable@smoat.test";
const PASSWORD = "e2e-fable-2607!";

async function main() {
  const deactivate = args.includes("--deactivate");
  if (deactivate) {
    await prisma.staff.updateMany({ where: { email: EMAIL }, data: { isActive: false } });
    console.log(`deactivated ${EMAIL}`);
    return;
  }
  const student = await prisma.student.findUnique({
    where: { id: STUDENT_ID },
    select: { academyId: true, name: true },
  });
  if (!student) throw new Error(`student not found: ${STUDENT_ID}`);
  const hash = await bcrypt.hash(PASSWORD, 10);
  const staff = await prisma.staff.upsert({
    where: { email: EMAIL },
    create: {
      academyId: student.academyId,
      email: EMAIL,
      password: hash,
      name: "E2E 검수",
      role: "DIRECTOR",
      isActive: true,
      authProvider: "credentials",
    },
    update: { password: hash, isActive: true, academyId: student.academyId },
    select: { id: true, academyId: true },
  });
  console.log(`ok staff=${staff.id} academy=${staff.academyId} email=${EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
