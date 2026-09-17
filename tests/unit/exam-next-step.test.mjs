// 시험 분석 「다음 단계」 도출(src/lib/exam-report/next-step.ts) 계약 단위 테스트
// (docs/exam-analysis-v4-spec.md §2.2). tsx 하네스 관용구(adaptive-poll 테스트와 동일):
// TS 모듈을 임시 하네스에서 import 해 JSON 으로 찍고 여기서 단정한다.
//
// 검증 축:
//  1. 판정 순서 — 후보 → ANALYZING → boost RUNNING → FAILED → DRAFT → INTERNAL
//     SHALLOW → 게이트 → 학생 0 → 링크 → 채점 → 리포트 → 공유 → 완료.
//  2. detail 이 있으면 학생 집계를 detail.students 로 재계산(요약 폴 무시).
//  3. 여정 칸(journey) done/active/pending 정합 — active 는 정확히 1칸(all-done 은 0칸).
//  4. 크레딧 총액은 입력 단가 × 대상 수(하드코딩 0).
//  5. summarizeFunnelStudents 의 need* 분류가 학생 단위 배타(합 = total).
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as m from "@/lib/exam-report/next-step";
const mod: any = (m as any).default ?? (m as any)["module.exports"] ?? m;
const { deriveExamNextStep, summarizeFunnelStudents, classifyFunnelStudent, resolveRailDockPerspective } = mod;
const costs = { boostPerQuestion: 1, reportPerStudent: 5 };

function students(total: number, over: Record<number, any> = {}) {
  const st: any = { total, answerIssued: 0, answerSubmitted: 0, graded: 0, reportGenerated: 0,
    reportGenerating: 0, reportFailed: 0, shared: 0, needLink: 0, awaitingAnswer: 0,
    needGrading: 0, needReport: 0, needShare: 0 };
  return Object.assign(st, over);
}
function row(over: any = {}) {
  return Object.assign({
    id: "a1", title: "t", status: "ANALYZED", schoolName: null, grade: null, examType: "MIDTERM",
    studentCount: 0, reportCount: 0, sourceType: "IMAGE", hasSourceFiles: true, progress: null,
    createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z",
    funnel: { questionCount: 20, confirmedCount: 20, gateOpen: true, grandfathered: false,
      hasExamLevel: true, depth: "DEEP", boost: null, students: students(0) },
  }, over);
}
function withFunnel(base: any, patch: any) {
  return { ...base, funnel: { ...base.funnel, ...patch } };
}
function studentRow(over: any = {}) {
  return Object.assign({ id: "s", studentName: "x", gradingConfirmed: false, reportStatus: "NONE",
    shareEnabled: false, answerToken: null, answerEnabled: false, answerSubmittedAt: null,
    examSubmissionId: null }, over);
}

const cases: Record<string, any> = {};
cases.candidate = deriveExamNextStep({ row: null, candidate: { examId: "e", title: "x", questionCount: 7, classId: null, examType: null, updatedAt: "" }, costs });
cases.analyzing = deriveExamNextStep({ row: row({ status: "ANALYZING", progress: { completed: 3, total: 20 } }), costs });
cases.boost = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL" }), { hasExamLevel: false, depth: "SHALLOW", boost: { status: "RUNNING", startedAt: 1, completed: 2, total: 5 } }), costs });
cases.failed = deriveExamNextStep({ row: row({ status: "FAILED" }), costs });
cases.draftResume = deriveExamNextStep({ row: row({ status: "DRAFT", hasSourceFiles: true }), costs });
cases.draftOrphan = deriveExamNextStep({ row: row({ status: "DRAFT", hasSourceFiles: false, studentCount: 0 }), costs });
cases.internalShallow = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL" }), { hasExamLevel: false, depth: "SHALLOW", questionCount: 5 }), costs });
cases.internalShallowFailed = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL" }), { hasExamLevel: false, depth: "SHALLOW", questionCount: 5, boost: { status: "FAILED", startedAt: 1, completed: 0, total: 5 } }), costs });
// boost 사유별(SHARED #3): DONE+synthFailed → 총평만(무과금) / FAILED+CHARGE_FAILED → 차감 없음 / FAILED+stale → 환불 미상
cases.internalSynthFailed = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL" }), { hasExamLevel: false, depth: "SHALLOW", questionCount: 5, boost: { status: "DONE", startedAt: 1, completed: 5, total: 5, synthFailed: true } }), costs });
cases.internalChargeFailed = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL" }), { hasExamLevel: false, depth: "SHALLOW", questionCount: 5, boost: { status: "FAILED", startedAt: 1, completed: 0, total: 5, error: "CHARGE_FAILED" } }), costs });
cases.internalStale = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL" }), { hasExamLevel: false, depth: "SHALLOW", questionCount: 5, boost: { status: "FAILED", startedAt: 1, completed: 2, total: 5, stale: true } }), costs });
// INTERNAL 게이트는 구조상 열림(SHARED #5): reviewState 비어 있고 학생 0 이어도 review-gate 에 걸리지 않는다
const internalMap = { questions: [1, 2, 3].map((n) => ({ number: String(n), order: n, kind: "MC", points: 5, typeLabel: "", brief: "" })), totalPoints: 15, pageCount: 0 };
const examLevel = { overview: "x", difficultyProfile: { easy: [], medium: [], hard: [], killer: [] }, typeDistribution: [], trapOverview: "", scopeInference: "" };
cases.internalDeepNoStudentsDetail = deriveExamNextStep({
  row: withFunnel(row({ sourceType: "INTERNAL", studentCount: 0 }), { gateOpen: false, confirmedCount: 0, questionCount: 3, hasExamLevel: true, depth: "DEEP", boost: { status: "DONE", startedAt: 1, completed: 3, total: 3 } }),
  detail: { id: "a1", examMap: internalMap, reviewState: {}, analysis: { perQuestion: [], examLevel }, students: [] },
  costs,
});
cases.internalShallowNoStudentsDetail = deriveExamNextStep({
  row: withFunnel(row({ sourceType: "INTERNAL", studentCount: 0 }), { gateOpen: false, confirmedCount: 0, questionCount: 3, hasExamLevel: false, depth: "SHALLOW" }),
  detail: { id: "a1", examMap: internalMap, reviewState: {}, analysis: { perQuestion: [], examLevel: null }, students: [] },
  costs,
});
// 요약 행만(detail 없음)으로도 같은 규칙 — 구버전 funnel 이 gateOpen:false 를 내려도 INTERNAL 은 열림
cases.internalDeepNoStudentsRow = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL", studentCount: 0 }), { gateOpen: false, confirmedCount: 0, questionCount: 3 }), costs });
// 비INTERNAL 은 종전대로 게이트에 걸린다(대조군)
cases.externalGateNoStudentsDetail = deriveExamNextStep({
  row: row({ studentCount: 0 }),
  detail: { id: "a1", examMap: internalMap, reviewState: {}, analysis: { perQuestion: [], examLevel }, students: [] },
  costs,
});
cases.gate = deriveExamNextStep({ row: withFunnel(row(), { gateOpen: false, confirmedCount: 3, questionCount: 22 }), costs });
cases.noStudents = deriveExamNextStep({ row: row(), costs });
cases.noStudentsInternal = deriveExamNextStep({ row: row({ sourceType: "INTERNAL" }), costs });
cases.needLink = deriveExamNextStep({ row: withFunnel(row({ studentCount: 3 }), { students: students(3, { needLink: 2, awaitingAnswer: 1 }) }), costs });
cases.needGrading = deriveExamNextStep({ row: withFunnel(row({ studentCount: 3 }), { students: students(3, { answerIssued: 3, answerSubmitted: 2, needGrading: 2, awaitingAnswer: 1 }) }), costs });
cases.await = deriveExamNextStep({ row: withFunnel(row({ studentCount: 3 }), { students: students(3, { answerIssued: 3, graded: 0, awaitingAnswer: 3 }) }), costs });
cases.reports = deriveExamNextStep({ row: withFunnel(row({ studentCount: 4 }), { students: students(4, { graded: 4, needReport: 3, reportFailed: 1, reportGenerated: 1, needShare: 1 }) }), costs });
cases.generating = deriveExamNextStep({ row: withFunnel(row({ studentCount: 2 }), { students: students(2, { graded: 2, reportGenerating: 2 }) }), costs });
cases.share = deriveExamNextStep({ row: withFunnel(row({ studentCount: 2 }), { students: students(2, { graded: 2, reportGenerated: 2, needShare: 2 }) }), costs });
cases.done = deriveExamNextStep({ row: withFunnel(row({ studentCount: 2 }), { students: students(2, { graded: 2, reportGenerated: 2, shared: 2 }) }), costs });
// detail 우선: 요약은 학생 0 이라 하지만 detail 은 학생 2명(1명 링크 필요)
cases.detailWins = deriveExamNextStep({
  row: row({ studentCount: 0 }),
  detail: {
    id: "a1", examMap: { questions: [{ number: "1", order: 1, kind: "MC", points: 5, typeLabel: "", brief: "" }], totalPoints: 5, pageCount: 1 },
    reviewState: { mapConfirmedNumbers: ["1"] }, analysis: { perQuestion: [], examLevel: { overview: "x", difficultyProfile: { easy: [], medium: [], hard: [], killer: [] }, typeDistribution: [], trapOverview: "", scopeInference: "" } },
    students: [studentRow({ id: "s1" }), studentRow({ id: "s2", gradingConfirmed: true, reportStatus: "GENERATED", shareEnabled: true })],
  },
  costs,
});
// summarizeFunnelStudents 배타성
cases.summary = summarizeFunnelStudents([
  studentRow(),                                                   // needLink
  studentRow({ answerEnabled: true, answerToken: "t" }),          // awaitingAnswer
  studentRow({ answerEnabled: true, answerToken: "t", answerSubmittedAt: "2026" }), // needGrading
  studentRow({ gradingConfirmed: true }),                         // needReport
  studentRow({ gradingConfirmed: true, reportStatus: "FAILED" }), // needReport
  studentRow({ gradingConfirmed: true, reportStatus: "GENERATING" }), // none(generating)
  studentRow({ gradingConfirmed: true, reportStatus: "GENERATED" }),  // needShare
  studentRow({ gradingConfirmed: true, reportStatus: "GENERATED", shareEnabled: true }), // shared
]);
// 앱 응시 제출(examSubmissionId) 축 — 자체 시험지의 「제출됨」 증거(§16)
cases.summaryInternal = summarizeFunnelStudents([
  studentRow({ examSubmissionId: "sub1" }),                 // needGrading(앱 응시 제출)
  studentRow(),                                             // needLink(링크도 응시도 없음)
  studentRow({ gradingConfirmed: true }),                   // needReport
]);
// 【26-09-04】 INTERNAL 강화(AI 분석)는 **관문이 아니라 강화** — 학생 퍼널에 차단
// 단계가 있으면 그것이 도크를 든다. 차단 밖(대기·완료)에서만 internal-deepen 이 뜬다.
const internalShallowFunnel = { hasExamLevel: false, depth: "SHALLOW", questionCount: 5 };
cases.internalShallowNeedGrading = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL", studentCount: 3 }), { ...internalShallowFunnel, students: students(3, { answerIssued: 3, answerSubmitted: 3, needGrading: 2, graded: 1 }) }), costs });
cases.internalShallowNeedReport = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL", studentCount: 2 }), { ...internalShallowFunnel, students: students(2, { graded: 2, needReport: 2 }) }), costs });
cases.internalShallowNeedShare = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL", studentCount: 1 }), { ...internalShallowFunnel, students: students(1, { graded: 1, reportGenerated: 1, needShare: 1 }) }), costs });
cases.internalShallowAwaiting = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL", studentCount: 2 }), { ...internalShallowFunnel, students: students(2, { answerIssued: 2, awaitingAnswer: 2 }) }), costs });
cases.internalShallowAllDone = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL", studentCount: 2 }), { ...internalShallowFunnel, students: students(2, { graded: 2, reportGenerated: 2, shared: 2 }) }), costs });
// 대조군: 같은 배치라도 DEEP 이면 언제나 퍼널 그대로
cases.internalDeepNeedGrading = deriveExamNextStep({ row: withFunnel(row({ sourceType: "INTERNAL", studentCount: 3 }), { students: students(3, { answerIssued: 3, answerSubmitted: 3, needGrading: 2, graded: 1 }) }), costs });
// classifyFunnelStudent — 6명 픽스처(SHARED #4 단일 술어)
const six = [
  studentRow(),                                                                    // needLink
  studentRow({ answerEnabled: true, answerToken: "t" }),                           // awaitingAnswer
  studentRow({ answerEnabled: true, answerToken: "t", answerSubmittedAt: "2026" }), // needGrading
  studentRow({ gradingConfirmed: true, reportStatus: "FAILED" }),                  // needReport
  studentRow({ gradingConfirmed: true, reportStatus: "GENERATED" }),               // needShare
  studentRow({ gradingConfirmed: true, reportStatus: "GENERATED", shareEnabled: true }), // shared
];
cases.summaryClassify = {
  external: six.map((s) => classifyFunnelStudent(s)),
  generating: classifyFunnelStudent(studentRow({ gradingConfirmed: true, reportStatus: "GENERATING" })),
  unknownStatus: classifyFunnelStudent(studentRow({ gradingConfirmed: true, reportStatus: "WEIRD" })),
  // 링크 발급 플래그만 있고 토큰이 없으면 「미발급」
  enabledNoToken: classifyFunnelStudent(studentRow({ answerEnabled: true, answerToken: null })),
  // §16 제출 증거 2계: 앱 응시 제출(examSubmissionId)도 「제출됨」이다.
  appSubmitted: classifyFunnelStudent(studentRow({ examSubmissionId: "sub1" })),
  // 링크만 보내 두고 아직 아무것도 안 한 학생 — 「미제출·링크 발급됨」
  linkOnly: classifyFunnelStudent(studentRow({ answerEnabled: true, answerToken: "t" })),
  // 담기만 하고 링크도 안 보낸 학생 — 「링크 미발급」(종전 INTERNAL 특례는 폐기)
  addedOnly: classifyFunnelStudent(studentRow()),
};
// 레일 도크 관점(26-09-03 리포트 2관점 분리): 분석·검수 단계 = 탭 무관 퍼널(students) /
// 그 뒤 = [학생] 탭만 퍼널, 나머지 탭은 시험지 분석 리포트 공유(exam).
// 키 접두 "summary" = 여정 칸 테스트의 「스텝 아닌 케이스」 제외 규약.
cases.summaryDockPerspective = {
  analyzingSynthesis: resolveRailDockPerspective(cases.analyzing, "synthesis"),
  analyzingStudents: resolveRailDockPerspective(cases.analyzing, "students"),
  gateSynthesis: resolveRailDockPerspective(cases.gate, "synthesis"),
  noStudentsSynthesis: resolveRailDockPerspective(cases.noStudents, "synthesis"),
  noStudentsStudents: resolveRailDockPerspective(cases.noStudents, "students"),
  reportsSynthesis: resolveRailDockPerspective(cases.reports, "synthesis"),
  reportsStudents: resolveRailDockPerspective(cases.reports, "students"),
  reportsSource: resolveRailDockPerspective(cases.reports, "source"),
  doneMeta: resolveRailDockPerspective(cases.done, "meta"),
  doneStudents: resolveRailDockPerspective(cases.done, "students"),
};
console.log(JSON.stringify(cases));
`;

function runHarness() {
  const dir = path.join(repoRoot, ".tmp-unit-exam-next-step");
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

function activeSteps(step) {
  return Object.entries(step.journey).filter(([, v]) => v === "active").map(([k]) => k);
}

test("판정 순서 — kind 가 스펙 §2.2 순서대로 갈린다", () => {
  assert.equal(R.candidate.kind, "candidate-analyze");
  assert.equal(R.analyzing.kind, "analyzing");
  assert.equal(R.boost.kind, "boost-running");
  assert.equal(R.failed.kind, "retry-failed");
  assert.equal(R.draftResume.kind, "resume-draft");
  assert.equal(R.draftOrphan.kind, "resume-upload");
  assert.equal(R.internalShallow.kind, "internal-deepen");
  assert.equal(R.internalShallowFailed.kind, "internal-deepen");
  assert.equal(R.gate.kind, "review-gate");
  assert.equal(R.noStudents.kind, "add-students");
  assert.equal(R.noStudentsInternal.kind, "add-students");
  assert.equal(R.needLink.kind, "issue-answer-links");
  assert.equal(R.needGrading.kind, "confirm-grading");
  assert.equal(R.await.kind, "await-answers");
  assert.equal(R.reports.kind, "generate-reports");
  assert.equal(R.generating.kind, "reports-generating");
  assert.equal(R.share.kind, "share-reports");
  assert.equal(R.done.kind, "all-done");
});

test("크레딧 총액 = 단가 × 대상 수(하드코딩 없음)", () => {
  assert.equal(R.candidate.cta.creditCost, 7);
  assert.equal(R.internalShallow.cta.creditCost, 5);
  // 26-09-04: generate-reports 는 **선택 패널로 가는 이동**이라 과금 칩이 없다
  // (차감은 rail-report-picker 의 확인 버튼에서 — 대상이 확정된 뒤에만).
  assert.equal(R.reports.cta.creditCost, undefined);
  assert.equal(R.reports.count, 3);
  assert.equal(R.needLink.count, 2);
  assert.equal(R.gate.progress.completed, 3);
  assert.equal(R.gate.progress.total, 22);
});

test("학생 0 — INTERNAL 은 답안 링크 보내기(§16), 비INTERNAL 은 학생 추가 · 둘 다 primary", () => {
  // 26-09-04 §16: 자체 시험지의 1차 동선이 「배포 화면」에서 **[학생] 탭 답안 링크**로
  // 바뀌었다(OMR 메인 확정 §15.2). 배포는 description·로스터 섹션 링크로 남는다.
  assert.equal(R.noStudentsInternal.cta.label, "답안 링크 보내기");
  assert.equal(R.noStudentsInternal.cta.tone, "primary");
  assert.match(R.noStudentsInternal.description, /답안 링크/);
  assert.match(R.noStudentsInternal.description, /배포/);
  assert.equal(R.noStudents.cta.tone, "primary");
});

test("INTERNAL 검수 게이트는 구조상 열림 — DEEP+학생 0 → add-students, SHALLOW+학생 0 → internal-deepen", () => {
  assert.equal(R.internalDeepNoStudentsDetail.kind, "add-students");
  assert.match(R.internalDeepNoStudentsDetail.description, /답안 링크/);
  assert.equal(R.internalDeepNoStudentsDetail.journey.review, "done");
  assert.equal(R.internalDeepNoStudentsDetail.journey.analyze, "done");
  assert.equal(R.internalShallowNoStudentsDetail.kind, "internal-deepen");
  assert.equal(R.internalShallowNoStudentsDetail.journey.review, "done");
  assert.equal(R.internalDeepNoStudentsRow.kind, "add-students");
  // 대조군: 비INTERNAL 은 reviewState 비어 있으면 여전히 review-gate
  assert.equal(R.externalGateNoStudentsDetail.kind, "review-gate");
  assert.equal(R.externalGateNoStudentsDetail.progress.completed, 0);
});

test("internal-deepen 자구 — DONE+synthFailed 는 총평만(무과금·synthOnly), CHARGE_FAILED 는 차감 없음, stale 은 환불 미상", () => {
  const s = R.internalSynthFailed;
  assert.equal(s.kind, "internal-deepen");
  assert.equal(s.synthOnly, true);
  assert.equal(s.title, "문항 분석은 끝났지만 총평 생성이 실패했습니다");
  assert.equal(s.cta.label, "총평 다시 생성");
  assert.equal(s.cta.tone, "primary");
  assert.equal(s.cta.creditCost, undefined);
  assert.match(s.description, /추가 과금 없음/);

  const c = R.internalChargeFailed;
  assert.equal(c.kind, "internal-deepen");
  assert.equal(c.synthOnly, undefined);
  assert.match(c.description, /차감 없음/);
  assert.doesNotMatch(c.description, /환불/);
  assert.equal(c.cta.creditCost, 5);

  const z = R.internalStale;
  assert.equal(z.kind, "internal-deepen");
  assert.match(z.description, /환불 여부/);
  assert.doesNotMatch(z.description, /크레딧은 환불/);
  assert.equal(z.cta.creditCost, 5);

  // 사유 없는 FAILED 는 종전 자구(환불 단언) 유지
  assert.match(R.internalShallowFailed.description, /크레딧은 환불/);
  assert.equal(R.internalShallowFailed.synthOnly, undefined);
});

test("classifyFunnelStudent — 배타 단계 + 제출 증거 2계(§16, 26-09-04)", () => {
  const c = R.summaryClassify;
  assert.deepEqual(c.external, ["needLink", "awaitingAnswer", "needGrading", "needReport", "needShare", "shared"]);
  assert.equal(c.generating, "generating");
  assert.equal(c.unknownStatus, "done");
  assert.equal(c.enabledNoToken, "needLink");
  // 앱 응시 제출(examSubmissionId)도 제출됨 — 자체 시험지의 종전 특례를 대체한다.
  assert.equal(c.appSubmitted, "needGrading");
  // 링크만 보낸 학생은 「제출 대기」이지 「채점 필요」가 아니다(옛 INTERNAL 특례의 결함).
  assert.equal(c.linkOnly, "awaitingAnswer");
  // 담기만 한 학생은 「링크 미발급」.
  assert.equal(c.addedOnly, "needLink");
});

test("여정 칸 — active 는 정확히 1칸(all-done 은 0칸), 앞 칸은 done", () => {
  for (const [name, step] of Object.entries(R)) {
    if (name.startsWith("summary")) continue;
    const act = activeSteps(step);
    if (step.kind === "all-done") {
      assert.deepEqual(act, [], name);
      assert.equal(step.journey.reports, "done", name);
    } else {
      assert.equal(act.length, 1, `${name}: active=${act.join(",")}`);
      assert.equal(act[0], step.journeyStep, name);
    }
  }
  assert.equal(R.gate.journey.analyze, "done");
  assert.equal(R.gate.journey.review, "active");
  assert.equal(R.internalShallow.journey.analyze, "active");
  assert.equal(R.share.journey.grading, "done");
  assert.equal(R.share.journey.reports, "active");
  // boost 진행 중엔 analyze 가 active(INTERNAL 은 examLevel 있어야 done)
  assert.equal(R.boost.journey.analyze, "active");
});

test("detail 이 있으면 요약 폴을 무시하고 학생 행으로 재계산한다", () => {
  assert.equal(R.detailWins.kind, "issue-answer-links");
  assert.equal(R.detailWins.count, 1);
  assert.equal(R.detailWins.journey.students, "done");
});

test("summarizeFunnelStudents — need* 는 학생 단위 배타 분류", () => {
  const s = R.summary;
  assert.equal(s.total, 8);
  assert.equal(s.needLink, 1);
  assert.equal(s.awaitingAnswer, 1);
  assert.equal(s.needGrading, 1);
  assert.equal(s.needReport, 2);
  assert.equal(s.reportGenerating, 1);
  assert.equal(s.needShare, 1);
  assert.equal(s.shared, 1);
  assert.equal(s.graded, 5);
  assert.equal(s.reportGenerated, 2);
  assert.equal(s.reportFailed, 1);
  assert.equal(
    s.needLink + s.awaitingAnswer + s.needGrading + s.needReport + s.reportGenerating + s.needShare + s.shared,
    s.total,
  );
  // §16: 자체 시험지도 링크 축이 산다 — 앱 응시 제출 1명(needGrading) · 링크도 응시도
  // 없는 1명(needLink) · 채점 확정 1명(needReport).
  assert.equal(R.summaryInternal.needGrading, 1);
  assert.equal(R.summaryInternal.needLink, 1);
  assert.equal(R.summaryInternal.needReport, 1);
});

test("레일 도크 관점 — 분석·검수 단계는 탭 무관 퍼널, 그 뒤는 [학생] 탭만 퍼널(26-09-03 리포트 2관점)", () => {
  const d = R.summaryDockPerspective;
  // 분석·검수 단계: 어느 탭이든 학생 리포트 퍼널 블록(진행률·검수 CTA)
  assert.equal(d.analyzingSynthesis, "students");
  assert.equal(d.analyzingStudents, "students");
  assert.equal(d.gateSynthesis, "students");
  // 학생·채점·리포트 단계: [학생] 탭 = 퍼널 / 나머지 탭 = 시험지 분석 리포트 공유
  assert.equal(d.noStudentsSynthesis, "exam");
  assert.equal(d.noStudentsStudents, "students");
  assert.equal(d.reportsSynthesis, "exam");
  assert.equal(d.reportsStudents, "students");
  assert.equal(d.reportsSource, "exam");
  assert.equal(d.doneMeta, "exam");
  assert.equal(d.doneStudents, "students");
});

test("INTERNAL 강화(AI 분석)는 관문이 아니라 강화 — 차단 단계가 있으면 퍼널이 이긴다(26-09-04)", () => {
  // 사용자 지적의 실체: "AI 분석은 안 했는데 왜 리포트는 완성이야?" — 리포트 게이트는
  // examLevel 을 요구한 적이 없는데(서버 generate/route.ts) 도크만 그렇게 말했다.
  assert.equal(R.internalShallowNeedGrading.kind, "confirm-grading");
  assert.equal(R.internalShallowNeedReport.kind, "generate-reports");
  assert.equal(R.internalShallowNeedShare.kind, "share-reports");
  // 차단 밖(학생 답안 대기·전원 완료)에서는 강화 권유가 도크를 든다.
  assert.equal(R.internalShallowAwaiting.kind, "internal-deepen");
  assert.equal(R.internalShallowAllDone.kind, "internal-deepen");
  // 학생 0명(add-students)도 차단 밖 — 종전 동작 유지(회귀 대조군).
  assert.equal(R.internalShallow.kind, "internal-deepen");
  assert.equal(R.internalShallowNoStudentsDetail.kind, "internal-deepen");
  // 대조군: DEEP 은 원래부터 퍼널 그대로
  assert.equal(R.internalDeepNeedGrading.kind, "confirm-grading");
  // 여정 「분석」 칸은 status ANALYZED 하나로 판정 — 검수·학생만 ✓이고 분석은 영영
  // 미완인 모순된 스트립을 없앤다(AI 분석 여부는 깊이 배지가 따로 말한다).
  assert.equal(R.internalShallowNeedGrading.journey.analyze, "done");
  assert.equal(R.internalShallowNeedGrading.journey.grading, "active");
});

test("학생 리포트 퍼널 자구 — 「학생 리포트」가 박혀 시험지 분석 리포트와 갈린다(26-09-03)", () => {
  assert.equal(R.reports.kind, "generate-reports");
  assert.match(R.reports.title, /^학생 리포트를 생성하세요/);
  // 26-09-04: 도크 CTA 는 목록에서 **대상을 체크**하는 동작(픽바가 실행·과금).
  assert.equal(R.reports.cta.label, "리포트 대상 3명 체크");
  assert.match(R.generating.title, /^학생 리포트 생성 중/);
  assert.match(R.share.title, /^학생 리포트 공유 링크를 발급하세요/);
});
