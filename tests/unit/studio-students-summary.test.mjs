// 「학생 관리」 판 요약 집계(students-shared.tsx summarizeStudents · entryBadge)와
// 시험 분석 퍼널(next-step.ts summarizeFunnelStudents · classifyFunnelStudent)의
// **동치** 단위 테스트 (docs/exam-analysis-v4-spec.md §1-3 「같은 함수」).
//
// 결함 이력: 판은 「채점 미확정 = 채점 대기」로 뭉뚱그려 「채점 대기 3」을 찍고,
// 레일은 같은 3명을 「답안 링크를 보내세요 (3명)」으로 말했다. 이제 판·레일은
// classifyFunnelStudent 한 술어로 링크 전 → 제출 대기 → 채점 대기 → 채점 확정을
// 나눈다. 이 테스트는 3학생 픽스처에서 두 집계가 갈리지 않음을 고정한다.
//
// tsx 하네스 관용구(exam-funnel 테스트와 동일): TS 모듈을 임시 하네스에서 import
// 해 JSON 으로 찍고 여기서 단정한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as shared from "@/app/(director)/director/studio/workbench/students-shared";
import * as ns from "@/lib/exam-report/next-step";
const S: any = (shared as any).default ?? shared;
const N: any = (ns as any).default ?? ns;
const { summarizeStudents, entryBadge, classifyEntry } = S;
const { summarizeFunnelStudents, classifyFunnelStudent } = N;

let seq = 0;
function entry(over: Record<string, any> = {}) {
  seq += 1;
  return Object.assign({
    reportStudentId: "rs" + seq, analysisId: "a1", title: "중간고사", examType: "MIDTERM",
    sourceType: "MANUAL", updatedAt: "2026-09-01T00:00:00.000Z", totalScore: null, maxScore: null,
    gradingConfirmed: false, reportStatus: "NONE", shareEnabled: false, shareToken: null,
    answerEnabled: false, answerToken: null, answerSubmittedAt: null, examSubmissionId: null,
  }, over);
}
function student(id: string, exams: any[]) {
  return { studentId: id, name: id, studentCode: "C" + id, grade: 1, lastStudyAt: null, exams };
}

// 3학생 픽스처 — 같은 비INTERNAL 시험 1건씩: 링크 전 / 제출 대기 / 채점 대기(제출됨)
const external = [
  student("A", [entry()]),
  student("B", [entry({ answerEnabled: true, answerToken: "t" })]),
  student("C", [entry({ answerEnabled: true, answerToken: "t", answerSubmittedAt: "2026-09-01" })]),
];
// INTERNAL 3학생 — 링크 축이 없다: 미확정 / 확정+리포트 전 / 확정+리포트 완성+공유 꺼짐
const internal = [
  student("A", [entry({ sourceType: "INTERNAL", examSubmissionId: "sub1" })]),
  student("B", [entry({ sourceType: "INTERNAL", gradingConfirmed: true })]),
  student("C", [entry({ sourceType: "INTERNAL", gradingConfirmed: true, reportStatus: "GENERATED", shareToken: "s" })]),
];
// 다시험 학생 — 시험 2건 중 1건만 채점 대기, 1건은 링크 전 → 두 칩 모두 1
const multi = [
  student("A", [
    entry({ answerEnabled: true, answerToken: "t", answerSubmittedAt: "2026-09-01" }),
    entry(),
  ]),
];

const flat = (rows: any[]) => rows.flatMap((r) => r.exams);
const out: Record<string, any> = {};
out.externalPane = summarizeStudents(external);
out.externalFunnel = summarizeFunnelStudents(flat(external));
out.internalPane = summarizeStudents(internal);
out.internalFunnel = summarizeFunnelStudents(flat(internal));
out.multiPane = summarizeStudents(multi);
out.badges = {
  needLink: entryBadge(entry()),
  awaiting: entryBadge(entry({ answerEnabled: true, answerToken: "t" })),
  needGrading: entryBadge(entry({ answerEnabled: true, answerToken: "t", answerSubmittedAt: "x" })),
  internalUnconfirmed: entryBadge(entry({ sourceType: "INTERNAL", examSubmissionId: "sub1" })),
  confirmed: entryBadge(entry({ gradingConfirmed: true })),
};
out.classParity = [
  entry(), entry({ answerEnabled: true, answerToken: "t" }),
  entry({ answerEnabled: true, answerToken: "t", answerSubmittedAt: "x" }),
  entry({ sourceType: "INTERNAL", examSubmissionId: "sub1" }), entry({ gradingConfirmed: true }),
  entry({ gradingConfirmed: true, reportStatus: "GENERATING" }),
  entry({ gradingConfirmed: true, reportStatus: "GENERATED" }),
  entry({ gradingConfirmed: true, reportStatus: "GENERATED", shareEnabled: true, shareToken: "s" }),
].map((e) => [classifyEntry(e), classifyFunnelStudent(e)]);
console.log(JSON.stringify(out));
`;

function runHarness() {
  const dir = path.join(repoRoot, ".tmp-unit-studio-students");
  mkdirSync(dir, { recursive: true });
  const harnessPath = path.join(dir, "harness.ts");
  writeFileSync(harnessPath, harnessSource);
  try {
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    const line = raw.trim().split("\n").pop();
    return JSON.parse(line);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const R = runHarness();

test("비INTERNAL 3학생 — 판 「채점 대기」= 퍼널 needGrading, 「링크 대기」= needLink+awaitingAnswer", () => {
  const p = R.externalPane;
  const f = R.externalFunnel;
  assert.equal(p.total, 3);
  assert.equal(f.needLink, 1);
  assert.equal(f.awaitingAnswer, 1);
  assert.equal(f.needGrading, 1);
  // 종전 결함: 판은 3(미확정 전부), 레일은 needLink 1 — 이제 같은 술어.
  assert.equal(p.gradingWaiting, f.needGrading);
  assert.equal(p.linkWaiting, f.needLink + f.awaitingAnswer);
  assert.equal(p.reportDone, f.reportGenerated);
  assert.equal(p.shareWaiting, f.needShare);
});

test("INTERNAL 3학생 — 앱 응시 제출자는 채점 대기, 공유 대기는 needShare 와 동치(§16)", () => {
  const p = R.internalPane;
  const f = R.internalFunnel;
  assert.equal(f.needLink + f.awaitingAnswer, 0);
  assert.equal(p.linkWaiting, 0);
  assert.equal(p.gradingWaiting, f.needGrading);
  assert.equal(p.gradingWaiting, 1);
  assert.equal(p.reportDone, f.reportGenerated);
  assert.equal(p.shareWaiting, f.needShare);
  assert.equal(p.shareWaiting, 1);
});

test("다시험 학생 — 시험 단위 분류를 학생 단위 「1건 이상」으로 접는다", () => {
  const p = R.multiPane;
  assert.equal(p.total, 1);
  assert.equal(p.gradingWaiting, 1);
  assert.equal(p.linkWaiting, 1);
});

test("entryBadge — 링크 전(slate) → 제출 대기(blue) → 채점 대기(amber) → 채점 확정(emerald)", () => {
  assert.deepEqual(R.badges.needLink, { label: "링크 전", tone: "slate" });
  assert.deepEqual(R.badges.awaiting, { label: "제출 대기", tone: "blue" });
  assert.deepEqual(R.badges.needGrading, { label: "채점 대기", tone: "amber" });
  // 앱 응시로 제출한 자체 시험지 학생은 「채점 대기」(§16 제출 증거 examSubmissionId).
  assert.deepEqual(R.badges.internalUnconfirmed, { label: "채점 대기", tone: "amber" });
  assert.deepEqual(R.badges.confirmed, { label: "채점 확정", tone: "emerald" });
});

test("classifyEntry === classifyFunnelStudent (8 상태 전수)", () => {
  assert.equal(R.classParity.length, 8);
  for (const [a, b] of R.classParity) assert.equal(a, b);
  assert.deepEqual(
    R.classParity.map(([a]) => a),
    ["needLink", "awaitingAnswer", "needGrading", "needGrading", "needReport", "generating", "needShare", "shared"],
  );
});
