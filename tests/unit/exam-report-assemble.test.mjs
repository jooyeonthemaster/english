import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// report-assemble.ts 결정론 조립 계약 검증 — tsx 하니스(JSON 요약).
const harnessSource = `
import assembleMod from "@/lib/exam-report/report-assemble";
import gradingMod from "@/lib/exam-report/grading";
const { assembleReportSkeleton, mergeNarrativeIntoDoc, mergePreservedFields } = assembleMod;
const { computeScoreSummary, computeDataLevel } = gradingMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}
const json = (v) => JSON.stringify(v);

function q(number, order, kind, points, correctAnswer) {
  return { number, order, kind, points, questionText: "Q" + number, correctAnswer };
}
const structure = {
  questions: [
    q("1", 1, "MC", 5, "3"),
    q("2", 2, "MC", 5, "2"),
    q("3", 3, "MC", 5, "4"),
    q("4", 4, "MC", 5, "1"),
    q("5", 5, "SHORT", 10, "recall"),
  ],
  sharedPassages: [],
  totalPoints: null,
};
function an(number, status, typeLabel, difficulty, keyConcepts, trapDesign) {
  return {
    number, analysisStatus: status, typeLabel, difficulty,
    difficultyRationale: "", explanation: "e", intent: "i", examPoint: "p",
    keyConcepts, solvingStrategy: "", trapDesign,
  };
}
const analysis = {
  perQuestion: [
    an("1", "OK", "빈칸추론", 5, ["추론", "문맥"], [{ choice: "2", why: "w", attractiveness: 2 }]),
    an("2", "OK", "어법", 2, ["시제"], [{ choice: "3", why: "w", attractiveness: 3 }, { choice: "5", why: "w", attractiveness: 1 }]),
    an("3", "OK", "어법", 4, ["수일치", "시제"], [{ choice: "1", why: "w", attractiveness: 2 }]),
    an("4", "OK", "제목", 5, ["주제"], undefined),
    an("5", "FAILED", "미분석", 3, [], undefined),
  ],
  examLevel: null,
};
const r = (number, status, extra = {}) => ({ number, status, source: "MANUAL", reviewed: true, ...extra });
const responses = [
  r("1", "CORRECT"),
  r("2", "WRONG", { chosenChoice: "3" }),
  r("3", "WRONG", { chosenChoice: "2" }),
  r("4", "CORRECT"),
  r("5", "PARTIAL", { earnedPoints: 6 }),
];
const scoreSummary = computeScoreSummary(structure, responses);
const dataLevel = computeDataLevel(structure, responses);

const doc = assembleReportSkeleton({
  structure, analysis, responses, scoreSummary, dataLevel,
  studentName: "홍길동", examLabel: "1학기 중간 영어", academyName: "스모트학원", dateLabel: "2026-07-06",
});

// ── 골격 구조 ──
check("doc: version 1", doc.version === 1);
check("doc: themeId indigo-consult", doc.themeId === "indigo-consult");
check("doc: cover 매핑", doc.cover.templateId === "gradient-band" && doc.cover.title === "시험 분석 리포트" && doc.cover.subtitle === "1학기 중간 영어" && doc.cover.studentName === "홍길동" && doc.cover.academyName === "스모트학원");
check("doc: 섹션 9종", doc.sections.length === 9);
check("doc: 섹션 id = sec-type", json(doc.sections.map((s) => s.id)) === json(["sec-scoreOverview", "sec-typePerformance", "sec-difficultyMatrix", "sec-trapAnalysis", "sec-wrongDeepDive", "sec-conceptMap", "sec-strengthWeakness", "sec-studyPlan", "sec-teacherComment"]));
check("doc: 모든 narrative 빈 문자열", doc.sections.every((s) => s.narrative === ""));

const byType = Object.fromEntries(doc.sections.map((s) => [s.type, s]));

// ── scoreOverview ──
check("scoreOverview: score/max", byType.scoreOverview.data.score === 16 && byType.scoreOverview.data.maxScore === 30);
check("scoreOverview: correctRate = round(2/5*100)=40", byType.scoreOverview.data.correctRate === 40);
check("scoreOverview: unknownCount 0", byType.scoreOverview.data.unknownCount === 0);
check("scoreOverview: v2 정오 분해 counts (correct2/wrong2/partial1)", byType.scoreOverview.data.correctCount === 2 && byType.scoreOverview.data.wrongCount === 2 && byType.scoreOverview.data.partialCount === 1);

// ── typePerformance ──
const rowsByLabel = Object.fromEntries(byType.typePerformance.data.rows.map((row) => [row.typeLabel, row]));
check("typePerf: 어법 그룹 total2 wrong2 earned0", rowsByLabel["어법"].total === 2 && rowsByLabel["어법"].wrong === 2 && rowsByLabel["어법"].earnedPoints === 0);
check("typePerf: 빈칸추론 correct1 earned5", rowsByLabel["빈칸추론"].correct === 1 && rowsByLabel["빈칸추론"].earnedPoints === 5);
check("typePerf: FAILED → 미분석 그룹, PARTIAL earned6", rowsByLabel["미분석"].total === 1 && rowsByLabel["미분석"].earnedPoints === 6);

// ── typePerformance v2: 소수 배점 합산 round2 (float 잔여 박멸) ──
{
  const structureF = {
    questions: [q("1", 1, "MC", 1.1, "1"), q("2", 2, "MC", 2.2, "3")],
    sharedPassages: [],
    totalPoints: null,
  };
  const analysisF = {
    perQuestion: [
      an("1", "OK", "빈칸추론", 3, ["a"], undefined),
      an("2", "OK", "빈칸추론", 3, ["b"], undefined),
    ],
    examLevel: null,
  };
  const responsesF = [r("1", "CORRECT"), r("2", "CORRECT")];
  const docF = assembleReportSkeleton({
    structure: structureF, analysis: analysisF, responses: responsesF,
    scoreSummary: computeScoreSummary(structureF, responsesF),
    dataLevel: computeDataLevel(structureF, responsesF),
    studentName: "n", examLabel: "e", academyName: "a", dateLabel: "d",
  });
  const rowF = docF.sections.find((s) => s.type === "typePerformance").data.rows[0];
  check("typePerf: 소수 배점 round2 (1.1+2.2 → 3.3 정확)", rowF.points === 3.3 && rowF.earnedPoints === 3.3);
}

// ── difficultyMatrix ──
check("matrix: cells 5개", byType.difficultyMatrix.data.cells.length === 5);
check("matrix: FAILED 문항 difficulty 3", byType.difficultyMatrix.data.cells.find((c) => c.number === "5").difficulty === 3);
check("matrix: easyMistakes = [2] (diff2 WRONG)", json(byType.difficultyMatrix.data.easyMistakes) === json(["2"]));
check("matrix: hardWins = [1,4] (diff5 CORRECT)", json(byType.difficultyMatrix.data.hardWins) === json(["1", "4"]));

// ── trapAnalysis ──
const trapItems = byType.trapAnalysis.data.items;
check("trap: WRONG MC(선지있음) 2건", trapItems.length === 2);
check("trap: Q2 설계함정 적중(chosen3∈trapDesign)", trapItems.find((i) => i.number === "2").wasDesignedTrap === true);
check("trap: Q3 설계함정 아님(chosen2∉trapDesign)", trapItems.find((i) => i.number === "3").wasDesignedTrap === false);
check("trap: 대상<3 → susceptibility UNKNOWN", byType.trapAnalysis.data.trapSusceptibility === "UNKNOWN");

// ── wrongDeepDive ──
const wdItems = byType.wrongDeepDive.data.items;
check("wrongDeep: WRONG+PARTIAL 3건", wdItems.length === 3 && json(wdItems.map((i) => i.number)) === json(["2", "3", "5"]));
check("wrongDeep: conceptTags = keyConcepts", json(wdItems.find((i) => i.number === "3").conceptTags) === json(["수일치", "시제"]));
check("wrongDeep: whatHappened/fixPoint 빈 문자열", wdItems.every((i) => i.whatHappened === "" && i.fixPoint === ""));

// ── conceptMap ──
const weakByConcept = Object.fromEntries(byType.conceptMap.data.weak.map((w) => [w.concept, w]));
check("conceptMap: weak 시제 2회 w2 related[2,3]", weakByConcept["시제"].weight === 2 && json(weakByConcept["시제"].relatedNumbers) === json(["2", "3"]));
check("conceptMap: weak 수일치 1회 w1", weakByConcept["수일치"].weight === 1);
const strongByConcept = Object.fromEntries(byType.conceptMap.data.strong.map((w) => [w.concept, w]));
check("conceptMap: strong 추론(CORRECT diff5) w1", strongByConcept["추론"].weight === 1 && json(strongByConcept["추론"].relatedNumbers) === json(["1"]));

// ── mergeNarrativeIntoDoc ──
const payload = {
  verdictLine: "총평 한 줄",
  narratives: {
    scoreOverview: "성적 서술", typePerformance: "유형 서술", difficultyMatrix: "난이도 서술",
    trapAnalysis: "함정 서술", wrongDeepDive: "오답 서술", conceptMap: "개념 서술",
    strengthWeakness: "강약 서술", studyPlan: "계획 서술",
  },
  trapWhyByNumber: { "2": "함정이유2", "999": "무시됨" },
  wrongItems: [
    { number: "2", whatHappened: "무엇2", fixPoint: "교정2" },
    { number: "999", whatHappened: "무시", fixPoint: "무시" },
  ],
  strengths: ["강점1"], weaknesses: ["약점1"],
  studyPlanWeeks: [{ label: "1주차", focus: "포커스", tasks: ["t1"] }],
  teacherCommentDraft: "초안 총평",
};
const merged = mergeNarrativeIntoDoc(doc, payload);
const mByType = Object.fromEntries(merged.sections.map((s) => [s.type, s]));
check("merge: verdictLine 이 scoreOverview narrative 맨 앞줄", mByType.scoreOverview.narrative.startsWith("총평 한 줄") && mByType.scoreOverview.narrative.includes("성적 서술"));
check("merge: typePerformance narrative", mByType.typePerformance.narrative === "유형 서술");
check("merge: trapWhy number 매칭", mByType.trapAnalysis.data.items.find((i) => i.number === "2").trapWhy === "함정이유2");
check("merge: 골격에 없는 trapWhy(999) 무시", !mByType.trapAnalysis.data.items.some((i) => i.number === "999"));
check("merge: wrongItems 매칭", mByType.wrongDeepDive.data.items.find((i) => i.number === "2").whatHappened === "무엇2");
check("merge: 골격에 없는 wrongItem(999) 무시", !mByType.wrongDeepDive.data.items.some((i) => i.number === "999"));
check("merge: strengths/weaknesses", json(mByType.strengthWeakness.data.strengths) === json(["강점1"]) && json(mByType.strengthWeakness.data.weaknesses) === json(["약점1"]));
check("merge: studyPlan weeks", mByType.studyPlan.data.weeks.length === 1 && mByType.studyPlan.data.weeks[0].label === "1주차");
check("merge: teacherComment 초안", mByType.teacherComment.data.comment === "초안 총평");
check("merge: 원본 doc 불변(새 객체)", doc.sections.find((s) => s.type === "scoreOverview").narrative === "");

// ── mergePreservedFields ──
const prior = mergeNarrativeIntoDoc(doc, payload);
prior.themeId = "slate-pro";
prior.typography = { headingFamily: "Hahmlet" };
prior.cover = { ...prior.cover, title: "보존 표지" };
prior.sections = prior.sections.map((s) => (s.type === "scoreOverview" ? { ...s, hidden: true } : s));
prior.sections = prior.sections.map((s) => (s.type === "teacherComment" ? { ...s, data: { comment: "강사수정본" } } : s));

const fresh = assembleReportSkeleton({
  structure, analysis, responses, scoreSummary, dataLevel,
  studentName: "홍길동", examLabel: "1학기 중간 영어", academyName: "스모트학원", dateLabel: "2026-07-06",
});
const preserved = mergePreservedFields(fresh, prior);
const pByType = Object.fromEntries(preserved.sections.map((s) => [s.type, s]));
check("preserve: themeId 보존", preserved.themeId === "slate-pro");
check("preserve: typography 보존(v2)", preserved.typography && preserved.typography.headingFamily === "Hahmlet");
check("preserve: cover 보존", preserved.cover.title === "보존 표지");
check("preserve: hidden 보존", pByType.scoreOverview.hidden === true);
check("preserve: teacherComment(강사수정본) 보존", pByType.teacherComment.data.comment === "강사수정본");

// 강사 total 이 비어있으면 새 초안 유지(빈 값이므로 fresh 의 "" 유지)
const priorEmptyComment = mergeNarrativeIntoDoc(doc, payload);
priorEmptyComment.sections = priorEmptyComment.sections.map((s) => (s.type === "teacherComment" ? { ...s, data: { comment: "  " } } : s));
const preserved2 = mergePreservedFields(fresh, priorEmptyComment);
const p2Teacher = preserved2.sections.find((s) => s.type === "teacherComment");
check("preserve: 빈 강사코멘트는 보존 안 함(fresh 유지)", p2Teacher.data.comment === "");

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-report-assemble-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const summary = runHarness();

test("exam-report assemble: 결정론 리포트 조립 계약", () => {
  assert.equal(summary.failed, 0, `assemble failures: ${JSON.stringify(summary.failures)}`);
  assert.ok(summary.passed >= 34, `expected ≥34 checks, got ${summary.passed}`);
});
