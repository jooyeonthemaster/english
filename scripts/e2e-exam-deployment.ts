/* eslint-disable no-console */
/**
 * 시험지 배포·OMR 즉시채점 — 실 API E2E 검증 (26-07-09 대개편).
 *   npx tsx scripts/e2e-exam-deployment.ts [--exam <examId>] [--student <studentId>] [--base http://localhost:3000] [--keep]
 *
 * 흐름(실데이터·실서버):
 *  1. 대상 시험지(기본: 22유형 시험지)·로스터 학생 로드, 기존 E2E 제출행 정리 후
 *     할당 행 생성(assignStudentsToExam 과 동일 형상 — status ASSIGNED·토큰 발급·orderSnapshot).
 *  2. 문항별 AnswerSpec(실엔진)으로 응답 매트릭스 구성 — 짝수 orderNum=정답,
 *     홀수=오답, 마지막 2문항=미입력, MANUAL_ONLY=자유 텍스트.
 *  3. POST /api/t/[token]/save (부분 저장) → 미입력 상태로 submit → 400 INCOMPLETE 기대
 *     → confirmIncomplete:true 재제출 → {ok:true} 기대.
 *  4. 응답 본문 정답 누출 스캔(실 정답 문자열 카나리) + DB 사후 검증:
 *     status·scoreSummary 카운트가 사전 기대치와 정확 일치, ExamReportStudent
 *     브리지(studentId·responses·gradingConfirmed), ExamAnalysis INTERNAL 존재.
 *  5. --keep 없으면 E2E 산출 행 정리(제출행·브리지 학생행 soft delete 아님 — 물리 삭제.
 *     INTERNAL 분석은 시험지 소유물이라 유지).
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { prisma } from "../src/lib/prisma";
import { generateShareToken } from "../src/lib/exam-report/share-token";
import { buildAnswerSpec } from "../src/lib/exam-scoring/answer-spec";
import type { AnswerSpec, StudentInput } from "../src/lib/exam-scoring/types";

const args = process.argv.slice(2);
function argOf(flag: string, fallback: string): string {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const EXAM_ID = argOf("--exam", "cmpyxison0001jm04ppc2p4ts");
const STUDENT_ID = argOf("--student", "cmpavfoiq0001mm9sga30eupz");
const BASE = argOf("--base", "http://localhost:3000");
const KEEP = args.includes("--keep");

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed += 1;
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** 스펙에서 "정답 입력"을 만든다(엔진과 독립 검증을 위해 원자료만 사용). */
function correctInputOf(spec: AnswerSpec): StudentInput | null {
  if (spec.inputKind === "SINGLE_CHOICE") return { choice: spec.correctChoices![0] };
  if (spec.inputKind === "MULTI_CHOICE") return { choices: [...spec.correctChoices!] };
  if (spec.inputKind === "TEXT_SINGLE" || spec.inputKind === "TEXT_MULTI") {
    const texts: Record<string, string> = {};
    for (const f of spec.fields ?? []) texts[f.key] = f.answers[0];
    return { texts };
  }
  return null; // MANUAL_ONLY
}

/** 확실한 오답 입력. */
function wrongInputOf(spec: AnswerSpec): StudentInput | null {
  if (spec.inputKind === "SINGLE_CHOICE" || spec.inputKind === "MULTI_CHOICE") {
    const count = spec.optionCount ?? 5;
    const correctSet = new Set(spec.correctChoices ?? []);
    for (let i = 1; i <= count; i++) {
      if (!correctSet.has(String(i))) {
        return spec.inputKind === "SINGLE_CHOICE"
          ? { choice: String(i) }
          : { choices: [String(i)] };
      }
    }
    return { choice: "1" };
  }
  if (spec.inputKind === "TEXT_SINGLE" || spec.inputKind === "TEXT_MULTI") {
    const texts: Record<string, string> = {};
    for (const f of spec.fields ?? []) texts[f.key] = "zzz-wrong-answer";
    return { texts };
  }
  return null;
}

async function main() {
  console.log(`\n■ E2E 시험지 배포·즉시채점 — exam=${EXAM_ID} student=${STUDENT_ID} base=${BASE}\n`);

  // ── 1. 픽스처 로드 + 할당 행 생성 ──────────────────────────────────────────
  const exam = await prisma.exam.findUnique({
    where: { id: EXAM_ID },
    include: {
      questions: {
        where: { question: { deletedAt: null } },
        orderBy: { orderNum: "asc" },
        include: { question: true },
      },
    },
  });
  if (!exam) throw new Error(`시험지 없음: ${EXAM_ID}`);
  const student = await prisma.student.findUnique({ where: { id: STUDENT_ID } });
  if (!student) throw new Error(`학생 없음: ${STUDENT_ID}`);
  check("픽스처: 시험지·학생 같은 학원", exam.academyId === student.academyId);
  console.log(`  시험지 "${exam.title}" 문항 ${exam.questions.length}개 · 학생 ${student.name}`);

  await prisma.examReportStudent.deleteMany({
    where: { studentId: STUDENT_ID, examSubmissionId: { not: null } },
  });
  await prisma.examSubmission.deleteMany({
    where: { examId: EXAM_ID, studentId: STUDENT_ID },
  });

  const token = generateShareToken();
  const orderSnapshot = exam.questions.map((eq) => ({
    questionId: eq.questionId,
    orderNum: eq.orderNum,
    points: eq.points,
  }));
  const submission = await prisma.examSubmission.create({
    data: {
      examId: EXAM_ID,
      studentId: STUDENT_ID,
      answers: "{}",
      status: "ASSIGNED",
      accessToken: token,
      accessEnabled: true,
      mode: "TABLET",
      orderSnapshot,
      assignedAt: new Date(),
      assignedBy: "e2e-harness",
    },
  });
  console.log(`  할당 생성: submission=${submission.id} token=${token.slice(0, 8)}…`);

  // ── 2. 응답 매트릭스 + 기대치 산출 ────────────────────────────────────────
  const specs = exam.questions.map((eq) => ({
    orderNum: eq.orderNum,
    spec: buildAnswerSpec({
      id: eq.questionId,
      type: eq.question.type,
      subType: eq.question.subType,
      options: eq.question.options,
      correctAnswer: eq.question.correctAnswer,
      structuredData: eq.question.structuredData,
      points: eq.points,
    }),
  }));

  const manualCount = specs.filter((s) => s.spec.inputKind === "MANUAL_ONLY").length;
  console.log(
    `  스펙 분포: ${JSON.stringify(
      specs.reduce<Record<string, number>>((acc, s) => {
        acc[s.spec.inputKind] = (acc[s.spec.inputKind] ?? 0) + 1;
        return acc;
      }, {}),
    )}`,
  );
  check("스펙: MANUAL_ONLY 강등이 전 문항을 삼키지 않음", manualCount < specs.length / 2,
    `manual=${manualCount}/${specs.length}`);

  // 미입력 = 자동채점 가능한 문항 중 뒤에서 2개(기대 unknown 산정을 단순하게).
  const gradable = specs.filter((s) => s.spec.inputKind !== "MANUAL_ONLY");
  const blankOrderNums = new Set(gradable.slice(-2).map((s) => s.orderNum));

  let expectCorrect = 0;
  let expectWrong = 0;
  const responses: Record<string, StudentInput | null> = {};
  const canaries: string[] = [];
  for (const { orderNum, spec } of specs) {
    if (blankOrderNums.has(orderNum)) continue; // 미입력
    if (spec.inputKind === "MANUAL_ONLY") {
      responses[spec.questionId] = { texts: { answer: "E2E free-writing sample answer." } };
      continue; // NEEDS_REVIEW 기대
    }
    // 텍스트 정답 원문을 누출 카나리로 수집(선지 토큰은 오탐이 많아 제외).
    if (spec.fields) for (const f of spec.fields) canaries.push(f.answers[0]);
    if (orderNum % 2 === 0) {
      responses[spec.questionId] = correctInputOf(spec);
      expectCorrect += 1;
    } else {
      responses[spec.questionId] = wrongInputOf(spec);
      expectWrong += 1;
    }
  }
  const expectUnknown = blankOrderNums.size; // NEEDS_REVIEW 는 UNKNOWN 아님(별도 카운트 없음 — scoreSummary 는 unknown 에 합산)
  console.log(
    `  기대치: correct=${expectCorrect} wrong=${expectWrong} blank=${expectUnknown} manual(NEEDS_REVIEW)=${manualCount}`,
  );

  // ── 3. save(부분) → submit(INCOMPLETE) → submit(confirm) ──────────────────
  const firstBatch = Object.fromEntries(Object.entries(responses).slice(0, 5));
  const saveRes = await fetch(`${BASE}/api/t/${token}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses: firstBatch }),
  });
  check("save: 200", saveRes.status === 200, `got ${saveRes.status}: ${await saveRes.clone().text()}`);

  const incompleteRes = await fetch(`${BASE}/api/t/${token}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses }),
  });
  const incompleteBody = (await incompleteRes.json()) as { code?: string; missing?: number[] };
  check("submit(미확인): 400 INCOMPLETE", incompleteRes.status === 400 && incompleteBody.code === "INCOMPLETE",
    `got ${incompleteRes.status} ${JSON.stringify(incompleteBody).slice(0, 200)}`);
  check("submit(미확인): missing = 미입력 문항",
    JSON.stringify([...(incompleteBody.missing ?? [])].sort((a, b) => a - b)) ===
    JSON.stringify([...blankOrderNums].sort((a, b) => a - b)));

  const submitRes = await fetch(`${BASE}/api/t/${token}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses, confirmIncomplete: true }),
  });
  const submitText = await submitRes.text();
  check("submit(확정): 200 {ok:true}", submitRes.status === 200 && JSON.parse(submitText).ok === true,
    `got ${submitRes.status} ${submitText.slice(0, 200)}`);

  // 누출 스캔 — 제출 응답에 정오·점수·정답 카나리 부재.
  const leakTargets = ["correctAnswer", "scoreSummary", "CORRECT", "earnedPoints", ...canaries.slice(0, 20)];
  for (const c of leakTargets) {
    if (submitText.includes(c)) {
      check(`누출: submit 응답에 "${c.slice(0, 30)}"`, false);
    }
  }
  check("누출: submit 응답 클린", failures.filter((f) => f.startsWith("누출")).length === 0);

  // ── 4. DB 사후 검증 ───────────────────────────────────────────────────────
  const after = await prisma.examSubmission.findUnique({ where: { id: submission.id } });
  if (!after) throw new Error("제출 행 소실");
  const summary = (after.scoreSummary ?? {}) as {
    correctCount?: number; wrongCount?: number; partialCount?: number; unknownCount?: number;
    totalScore?: number | null; maxScore?: number | null;
  };
  console.log(`  결과: status=${after.status} summary=${JSON.stringify(summary)}`);

  const expectStatus = manualCount + expectUnknown > 0 ? "SUBMITTED" : "GRADED";
  check(`상태: ${expectStatus}`, after.status === expectStatus, `got ${after.status}`);
  check("채점: correctCount 일치", summary.correctCount === expectCorrect,
    `expect ${expectCorrect} got ${summary.correctCount}`);
  check("채점: wrongCount 일치", summary.wrongCount === expectWrong,
    `expect ${expectWrong} got ${summary.wrongCount}`);
  check("채점: unknownCount = 미입력+NEEDS_REVIEW", summary.unknownCount === expectUnknown + manualCount,
    `expect ${expectUnknown + manualCount} got ${summary.unknownCount}`);

  // 정답 100% 케이스 검산: totalScore = 짝수 문항 배점 합.
  const expectScore = specs
    .filter((s) => !blankOrderNums.has(s.orderNum) && s.spec.inputKind !== "MANUAL_ONLY" && s.orderNum % 2 === 0)
    .reduce((sum, s) => sum + s.spec.points, 0);
  check("채점: totalScore = 정답 배점 합", summary.totalScore === expectScore,
    `expect ${expectScore} got ${summary.totalScore}`);

  // 브리지 검증
  const reportStudent = await prisma.examReportStudent.findFirst({
    where: { examSubmissionId: submission.id },
  });
  check("브리지: ExamReportStudent 생성", reportStudent != null);
  if (reportStudent) {
    check("브리지: studentId 귀속", reportStudent.studentId === STUDENT_ID);
    check("브리지: 이름 로스터 승계", reportStudent.studentName === student.name);
    check("브리지: gradingConfirmed=false(UNKNOWN 잔존)", reportStudent.gradingConfirmed === false);
    const responsesArr = (reportStudent.responses ?? []) as Array<{ number: string; status: string }>;
    check("브리지: 응답 전 문항 매핑", responsesArr.length === specs.length,
      `expect ${specs.length} got ${responsesArr.length}`);
    const st = (n: string) => responsesArr.find((r) => r.number === n)?.status;
    const firstEven = specs.find((s) => s.orderNum % 2 === 0 && !blankOrderNums.has(s.orderNum) && s.spec.inputKind !== "MANUAL_ONLY");
    if (firstEven) check("브리지: 짝수 문항 CORRECT", st(String(firstEven.orderNum)) === "CORRECT");
  }
  const internal = await prisma.examAnalysis.findFirst({
    where: { sourceExamId: EXAM_ID, sourceType: "INTERNAL", deletedAt: null },
  });
  check("브리지: INTERNAL ExamAnalysis 존재", internal != null);
  if (internal) {
    check("브리지: analysis status=ANALYZED", internal.status === "ANALYZED");
    const structure = (internal.structure ?? {}) as { questions?: unknown[] };
    check("브리지: structure 전 문항", (structure.questions ?? []).length === specs.length);
  }

  // 재제출 잠금
  const lockRes = await fetch(`${BASE}/api/t/${token}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses: {}, confirmIncomplete: true }),
  });
  check("잠금: 재제출 409/403", lockRes.status === 409 || lockRes.status === 403, `got ${lockRes.status}`);

  // ── 5. 정리 ───────────────────────────────────────────────────────────────
  if (!KEEP) {
    await prisma.examReportStudent.deleteMany({ where: { examSubmissionId: submission.id } });
    await prisma.examSubmission.delete({ where: { id: submission.id } });
    console.log("  정리: E2E 제출·브리지 행 삭제(INTERNAL 분석은 유지)");
  } else {
    console.log(`  유지(--keep): /t/${token} 로 응시면 확인 가능`);
  }

  console.log(`\n■ 결과: ${passed} passed / ${failures.length} failed`);
  if (failures.length > 0) {
    console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("E2E 실패:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
