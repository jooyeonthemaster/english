/* eslint-disable no-console */
/**
 * 학생 시험 리포트 — E2E 시각 감사용 테스트 테넌트 시드.
 *   npx tsx scripts/_exam-report-seed-test.ts            # 생성/재사용 + 크레딧 충전
 *   npx tsx scripts/_exam-report-seed-test.ts --cleanup  # 테스트 분석 데이터만 soft-delete
 * 출력: 로그인 이메일/비밀번호, academyId. (전용 테넌트 — 실사용 데이터와 격리)
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const EMAIL = "exam-report-test@smoat.test";
const PASSWORD = "ExamReport!2026";
const ACADEMY_NAME = "__EXAMREPORT_TEST__";
const SLUG = "exam-report-test";
const CODE = "9271";

async function main() {
  if (process.argv.includes("--cleanup")) {
    const academy = await prisma.academy.findUnique({ where: { slug: SLUG } });
    if (!academy) return console.log("테스트 테넌트 없음");
    const now = new Date();
    const a = await prisma.examAnalysis.updateMany({
      where: { academyId: academy.id, deletedAt: null },
      data: { deletedAt: now },
    });
    const s = await prisma.examReportStudent.updateMany({
      where: { academyId: academy.id, deletedAt: null },
      data: { deletedAt: now, shareEnabled: false },
    });
    console.log(`cleanup: analyses ${a.count}, students ${s.count}`);
    return;
  }

  let academy = await prisma.academy.findUnique({ where: { slug: SLUG } });
  if (!academy) {
    academy = await prisma.academy.create({
      data: { name: ACADEMY_NAME, slug: SLUG, code: CODE, status: "ACTIVE" },
    });
    console.log("academy created:", academy.id);
  } else {
    console.log("academy reused:", academy.id);
  }

  const hashed = await bcrypt.hash(PASSWORD, 10);
  const staff = await prisma.staff.upsert({
    where: { email: EMAIL },
    update: { password: hashed, isActive: true, academyId: academy.id },
    create: {
      academyId: academy.id,
      email: EMAIL,
      password: hashed,
      name: "시험리포트 테스터",
      role: "DIRECTOR",
      authProvider: "credentials",
    },
  });

  await prisma.creditBalance.upsert({
    where: { academyId: academy.id },
    update: { balance: 1000, expiresAt: null },
    create: { academyId: academy.id, balance: 1000 },
  });

  console.log(JSON.stringify({ academyId: academy.id, staffId: staff.id, email: EMAIL, password: PASSWORD }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
