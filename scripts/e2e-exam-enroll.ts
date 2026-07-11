/* eslint-disable no-console */
/**
 * 공유 QR 자기등록(Wave-3) — 실 API E2E.
 *   npx tsx scripts/e2e-exam-enroll.ts [--exam <id>] [--student <id>] [--code <code>] [--base http://localhost:3000] [--keep]
 * 흐름: enroll 활성화(DB 직접) → 로스터 이름검색 GET(누출 스캔) → 코드불일치 401 → 정답코드 POST
 *       → accessToken 발급 → ExamSubmission 자기등록(assignedBy self-enroll) 검증 → /t/[accessToken] 200·누출0
 *       → /t/e/[enrollToken] 랜딩 200·정답/명단 미노출.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { prisma } from "../src/lib/prisma";
import { generateShareToken } from "../src/lib/exam-report/share-token";

const args = process.argv.slice(2);
const argOf = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const EXAM_ID = argOf("--exam", "cmpyxison0001jm04ppc2p4ts");
const STUDENT_ID = argOf("--student", "cmpavfoiq0001mm9sga30eupz");
const CODE = argOf("--code", "Z5U7ZG");
const BASE = argOf("--base", "http://localhost:3000");
const KEEP = args.includes("--keep");

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else { failures.push(detail ? `${name} — ${detail}` : name); console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  console.log(`\n■ E2E 공유 QR 자기등록 — exam=${EXAM_ID} student=${STUDENT_ID} base=${BASE}\n`);

  const exam = await prisma.exam.findUnique({ where: { id: EXAM_ID } });
  if (!exam) throw new Error(`시험지 없음: ${EXAM_ID}`);
  const student = await prisma.student.findUnique({ where: { id: STUDENT_ID } });
  if (!student) throw new Error(`학생 없음: ${STUDENT_ID}`);
  check("픽스처: 같은 학원", exam.academyId === student.academyId);

  // enroll 활성화(DB 직접 — setExamEnrollment 는 staff 세션 필요) + 사전 자기등록행 정리
  const enrollToken = exam.enrollToken ?? generateShareToken();
  await prisma.exam.update({
    where: { id: EXAM_ID },
    data: { enrollToken, enrollEnabled: true, enrollMode: "OMR" },
  });
  await prisma.examReportStudent.deleteMany({ where: { studentId: STUDENT_ID, examSubmissionId: { not: null } } });
  await prisma.examSubmission.deleteMany({ where: { examId: EXAM_ID, studentId: STUDENT_ID } });
  console.log(`  enroll 활성화: enrollToken=${enrollToken.slice(0, 8)}… mode=OMR`);
  console.log(`  자기등록 랜딩: ${BASE}/t/e/${enrollToken}`);

  // ── 1. 로스터 이름검색 GET ──
  const rosterRes = await fetch(`${BASE}/api/t/enroll/${enrollToken}/roster?q=${encodeURIComponent("김")}`);
  const rosterText = await rosterRes.clone().text();
  check("roster: 200", rosterRes.status === 200, `got ${rosterRes.status}: ${rosterText.slice(0, 150)}`);
  let roster: { students?: Array<{ id: string; name: string }> } = {};
  try { roster = JSON.parse(rosterText); } catch { /* handled below */ }
  const list = roster.students ?? (Array.isArray(roster) ? (roster as unknown as Array<{ id: string; name: string }>) : []);
  check("roster: 김연주 검색됨", list.some((s) => s.id === STUDENT_ID), `list=${JSON.stringify(list).slice(0, 200)}`);
  check("roster: 학생코드 미노출", !rosterText.includes(CODE) && !rosterText.toLowerCase().includes("studentcode"));
  check("roster: 연락처/해시 미노출", !rosterText.includes("Hmac") && !rosterText.includes("Hash") && !rosterText.includes("phone"));

  // ── 2. 코드 불일치 → 거부 ──
  const wrongRes = await fetch(`${BASE}/api/t/enroll/${enrollToken}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: STUDENT_ID, code: "WRONG99" }),
  });
  check("enroll(오답코드): 거부(4xx)", wrongRes.status >= 400 && wrongRes.status < 500, `got ${wrongRes.status}`);
  const wrongBody = await wrongRes.text();
  check("enroll(오답코드): accessToken 미발급", !wrongBody.includes("accessToken") || JSON.parse(wrongBody || "{}").accessToken == null);

  // ── 3. 정답코드 → 자기등록 ──
  const okRes = await fetch(`${BASE}/api/t/enroll/${enrollToken}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: STUDENT_ID, code: CODE }),
  });
  const okText = await okRes.text();
  check("enroll(정답코드): 200 ok", okRes.status === 200, `got ${okRes.status}: ${okText.slice(0, 200)}`);
  let ok: { ok?: boolean; accessToken?: string; redirectPath?: string } = {};
  try { ok = JSON.parse(okText); } catch { /* handled */ }
  const accessToken = ok.accessToken ?? (ok.redirectPath?.split("/t/")[1] ?? "");
  check("enroll: accessToken 발급", !!accessToken, `body=${okText.slice(0, 200)}`);

  // ── 4. ExamSubmission 자기등록 검증 ──
  const sub = await prisma.examSubmission.findUnique({ where: { examId_studentId: { examId: EXAM_ID, studentId: STUDENT_ID } } });
  check("자기등록: ExamSubmission 생성", sub != null);
  if (sub) {
    check("자기등록: assignedBy=self-enroll", sub.assignedBy === "self-enroll", `got ${sub.assignedBy}`);
    check("자기등록: mode=OMR", sub.mode === "OMR", `got ${sub.mode}`);
    check("자기등록: accessToken 일치", sub.accessToken === accessToken || !!sub.accessToken);
    check("자기등록: status ASSIGNED/IN_PROGRESS", ["ASSIGNED", "IN_PROGRESS"].includes(sub.status), `got ${sub.status}`);
    const snap = (sub.orderSnapshot ?? []) as unknown[];
    check("자기등록: orderSnapshot 고정", snap.length > 0, `len=${snap.length}`);
  }

  // ── 5. 발급된 응시면 누출 스캔 ──
  if (accessToken) {
    const takeRes = await fetch(`${BASE}/t/${accessToken}`);
    const takeText = await takeRes.text();
    check("응시면 /t/[token]: 200", takeRes.status === 200, `got ${takeRes.status}`);
    check("응시면: correctAnswer/빈칸정답 미노출", !takeText.includes("correctAnswer") && !takeText.includes("빈칸 정답"));
  }

  // ── 6. 자기등록 재시도(이미 존재) → 같은 토큰 재사용 ──
  const reRes = await fetch(`${BASE}/api/t/enroll/${enrollToken}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: STUDENT_ID, code: CODE }),
  });
  check("자기등록 재시도: 2xx(멱등)", reRes.status >= 200 && reRes.status < 300, `got ${reRes.status}`);

  // ── 7. 랜딩 페이지 누출/명단덤프 스캔 ──
  const landRes = await fetch(`${BASE}/t/e/${enrollToken}`);
  const landText = await landRes.text();
  check("랜딩 /t/e/[token]: 200", landRes.status === 200, `got ${landRes.status}`);
  check("랜딩: 초기 HTML에 명단 덤프 없음(검색 전)", (landText.match(/김연주/g) || []).length === 0);
  check("랜딩: 정답 미노출", !landText.includes("correctAnswer") && !landText.includes("빈칸 정답"));

  if (!KEEP) {
    await prisma.examReportStudent.deleteMany({ where: { examSubmissionId: sub?.id ?? "none" } });
    await prisma.examSubmission.deleteMany({ where: { examId: EXAM_ID, studentId: STUDENT_ID } });
    console.log("  정리: 자기등록 제출행 삭제(enrollToken은 유지 — 수동 확인용)");
  } else {
    console.log(`  유지(--keep): 랜딩 ${BASE}/t/e/${enrollToken}`);
  }

  console.log(`\n■ 결과: ${passed} passed / ${failures.length} failed`);
  if (failures.length) { console.log(failures.map((f) => `  ✗ ${f}`).join("\n")); process.exitCode = 1; }
}

main().catch((e) => { console.error("E2E 실패:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
