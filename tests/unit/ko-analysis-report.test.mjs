import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// PRIME_KO(국어 지문분석 학습지) 회귀 스위트 — TS + "@/..." 앨리어스 → tsx 하니스로 실행해
// JSON 요약을 뽑는다(ko-text-core / analysis-report-worksheet-surface 하니스 패턴 미러).
//   1) 스키마 왕복 + 유니온 격리(영어↔KO 파서 상호 거부, 영어 파서 무회귀)
//   2) coercion 게이트: 문학 근거 verbatim / 퀴즈 정답누출 / 최소 행수
//   3) 렌더 학생표면: 확인 문제 정답 미노출(hiddenAnswers 게이트) + koCheckQuizStudentSurface
//   4) 영어 섹션 렌더 무회귀(sectionFlowItems 의 KO 게이트가 영어 경로를 건드리지 않음)
const harnessSource = `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import koSchemaMod from "@/lib/passage-report/analysis-report/ko-schema";
import koCoerceMod from "@/lib/passage-report/analysis-report/ko-section-coerce";
import enSchemaMod from "@/lib/passage-report/analysis-report/schema";
import sectionFlowMod from "@/components/workbench/analysis-report/report-sections/section-flow";

const {
  koAnalysisReportSchema,
  koCheckQuizStudentSurface,
  isKoAnalysisSectionKind,
  KO_NUMBERED_SECTION_LABELS,
} = koSchemaMod;
const { coerceAndValidateKo, koEvidenceInPassage } = koCoerceMod;
const { analysisReportSchema } = enSchemaMod;
const { sectionFlowItems } = sectionFlowMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}

const passage = "마당 끝 겨울 우물은\\n얼음장 아래로도 깊어서\\n두레박을 내리면\\n잠든 별 하나가 길어 올려졌다";

const quizSection = {
  kind: "ko-check-quiz",
  questions: [
    { no: 1, format: "OX", prompt: "화자는 우물을 회상한다.", answer: "O" },
    { no: 2, format: "OX", prompt: "배경은 여름이다.", answer: "X" },
    { no: 3, format: "단답", prompt: "우물에서 길어 올려진 것으로 표현된 시어는?", answer: "잠든 별" },
    { no: 4, format: "단답", prompt: "새벽마다 줄을 감는 인물은?", answer: "어머니" },
    { no: 5, format: "단답", prompt: "마지막 연에서 우물이 마르지 않은 이유로 제시된 것은?", answer: "기다림" },
  ],
  hiddenAnswers: true,
};

const koReport = {
  schemaVersion: 1,
  subject: "KOREAN",
  brand: "KOREAN READING LAB",
  themeId: "black-white",
  meta: { titleKo: "겨울 우물", titleEn: "", category: "문학 · 현대시", theme: "우물", difficulty: 3, solveTime: "", examTypes: "" },
  sections: [
    { kind: "ko-passage", text: passage },
    { kind: "ko-overview", genre: "현대시", subjectMatter: "겨울 우물", theme: "어머니의 헌신", commentary: "해제예요." },
    quizSection,
  ],
};

// ── 1) 스키마 왕복 + 유니온 격리 ──
const parsed = koAnalysisReportSchema.safeParse(koReport);
check("ko schema round-trip", parsed.success);
check("english parser rejects KO report", !analysisReportSchema.safeParse(koReport).success);
const englishReport = {
  schemaVersion: 1,
  brand: "ENGLISH READING LAB",
  themeId: "black-white",
  meta: { titleKo: "t", titleEn: "t", category: "c", theme: "t", difficulty: 3, solveTime: "3분", examTypes: "주제" },
  sections: [{ kind: "passage", sentences: [{ n: 1, en: "Hello.", ko: "안녕" }], keywords: [] }],
};
check("english parser still accepts english report (no regression)", analysisReportSchema.safeParse(englishReport).success);
check("ko parser rejects english report", !koAnalysisReportSchema.safeParse(englishReport).success);
check("isKoAnalysisSectionKind gate", isKoAnalysisSectionKind("ko-overview") && !isKoAnalysisSectionKind("passage"));
check("ko section labels complete", Object.keys(KO_NUMBERED_SECTION_LABELS).length === 9);

// ── 2) coercion 게이트 ──
check("evidence verbatim helper", koEvidenceInPassage("잠든 별 하나", passage) && !koEvidenceInPassage("없는 구절", passage));
const devRaw = {
  kind: "ko-literary-device",
  rows: [
    { device: "은유", evidence: "잠든 별 하나", effect: "효과1" },
    { device: "상징", evidence: "두레박을 내리면", effect: "효과2" },
    { device: "설의", evidence: "원문에 없는 허위 인용", effect: "반려 대상" },
  ],
};
const devV = coerceAndValidateKo("ko-literary-device", devRaw, { passage });
check("literary device: fake evidence row dropped", devV.ok && devV.section.rows.length === 2);
const devAllFake = coerceAndValidateKo(
  "ko-literary-device",
  { kind: "ko-literary-device", rows: [{ device: "은유", evidence: "전부 허위", effect: "e" }] },
  { passage },
);
check("literary device: all-fake fails min gate", !devAllFake.ok);

const leakQuiz = coerceAndValidateKo("ko-check-quiz", {
  kind: "ko-check-quiz",
  questions: [
    { no: 1, format: "단답", prompt: "정답은 잠든 별 이다. 맞는가?", answer: "잠든 별" },
    { no: 2, format: "OX", prompt: "배경은 겨울이다.", answer: "O" },
    { no: 3, format: "단답", prompt: "누가 줄을 감는가?", answer: "어머니" },
    { no: 4, format: "단답", prompt: "무엇이 길어 올려졌나?", answer: "별 하나" },
    { no: 5, format: "단답", prompt: "어디에 있는 우물인가?", answer: "마당 끝" },
  ],
});
check("quiz: answer-leaking prompt dropped -> below min5 fails", !leakQuiz.ok);
const okQuiz = coerceAndValidateKo("ko-check-quiz", quizSection);
check("quiz: clean 5 questions pass + hiddenAnswers forced true", okQuiz.ok && okQuiz.section.hiddenAnswers === true);

const fewExam = coerceAndValidateKo("ko-exam-points", {
  kind: "ko-exam-points",
  rows: [
    { slot: "내용 일치", asks: "a", basis: "b" },
    { slot: "추론", asks: "a", basis: "b" },
  ],
});
check("exam-points: below min3 fails", !fewExam.ok);

// ── 3) 렌더 학생표면 ──
function renderFlow(section) {
  const items = sectionFlowItems(section, 0, 1);
  return renderToStaticMarkup(
    React.createElement(React.Fragment, null, items.map((it, i) => React.createElement("div", { key: i }, it.node))),
  );
}
const studentHtml = renderFlow(quizSection);
check("student surface renders prompts", studentHtml.includes("길어 올려진 것으로 표현된 시어는?"));
check("student surface hides all answers", !studentHtml.includes("잠든 별</") && !studentHtml.includes(">어머니<") && !studentHtml.includes("Answer Key"));
const teacherHtml = renderFlow({ ...quizSection, hiddenAnswers: false });
check("teacher surface shows answer key", teacherHtml.includes("Answer Key") && teacherHtml.includes("잠든 별"));
const stripped = koCheckQuizStudentSurface(quizSection);
check("koCheckQuizStudentSurface strips answers", stripped.questions.every((q) => q.answer === "" && q.explanation === undefined) && stripped.hiddenAnswers === true);

// ko-passage 원문 행 구분 보존(운문) — pre-wrap 블록으로 렌더.
const passageHtml = renderFlow({ kind: "ko-passage", text: passage });
check("ko-passage keeps verse line breaks", passageHtml.includes("마당 끝 겨울 우물은\\n얼음장"));

// ── 4) 영어 섹션 렌더 무회귀 ──
const enSummaryHtml = renderFlow({ kind: "summary", sentences: ["요약 문장이에요."], thesisEn: "One line thesis." });
check("english summary flow unchanged", enSummaryHtml.includes("One line thesis.") && enSummaryHtml.includes("요약 문장이에요."));

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-analysis-report-harness.mts");
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

test("PRIME_KO analysis report — schema isolation, coercion gates, student surface", () => {
  assert.equal(summary.failed, 0, `ko analysis report failures: ${JSON.stringify(summary.failures)}`);
  assert.ok(summary.passed >= 18, `expected at least 18 checks, got ${summary.passed}`);
});
