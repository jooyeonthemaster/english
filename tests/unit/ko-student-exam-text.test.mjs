import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// KO-LEAK-2 — 학생 디지털 응시 경로(startExam/getExamResult)의 KO questionText
// ============================================================================
// (1) 소스 가드: exam-taking.ts 가 KO 게이트(isKoQuestionType)로
//     buildKoStudentExamText 를 타고, 영어는 기존 repair 경로를 유지하는지.
// (2) 동작: buildKoStudentExamText 가 마킹 지문+발문+【보기】+【조건】을 포함하고
//     정답·해설·evidence·선지를 절대 포함하지 않는지 + 영어/결손 입력 무변경 폴백.
// ============================================================================

// ── (1) 소스 가드 ──────────────────────────────────────────────────────────

test("exam-taking.ts routes KO through buildKoStudentExamText with English path preserved", () => {
  const src = readFileSync(path.join(repoRoot, "src", "actions", "exam-taking.ts"), "utf8");

  // KO 게이트 존재
  assert.ok(src.includes('from "@/lib/korean/student-exam-text"'), "KO 직렬화 모듈 import 누락");
  assert.ok(src.includes("isKoQuestionType(question.subType)"), "KO 게이트(isKoQuestionType) 누락");

  // startExam·getExamResult 둘 다 게이트 헬퍼를 소비
  assert.ok(
    src.includes("questionText: buildStudentQuestionText(eq.question)"),
    "startExam 이 buildStudentQuestionText 를 쓰지 않음",
  );
  assert.ok(
    src.includes("questionText: buildStudentQuestionText(q)"),
    "getExamResult 가 buildStudentQuestionText 를 쓰지 않음",
  );

  // KO 지문 재구성용 passage 관계 조회 (startExam select + getExamResult include)
  const passageSelects = src.match(/passage: \{ select: \{ content: true \} \}/g) ?? [];
  assert.ok(passageSelects.length >= 2, `passage 관계 조회가 2곳 미만: ${passageSelects.length}`);

  // 영어 경로 보존: 게이트 헬퍼가 기존 repair 함수로 폴백
  assert.ok(
    src.includes("return repairGrammarCorrectionQuestionText({"),
    "영어 경로(repairGrammarCorrectionQuestionText) 소실",
  );
});

// ── (2) 동작 하니스 (tsx — @/ 앨리어스 TS 모듈, ko-text-core 패턴 미러) ──────

const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import studentExamText from "@/lib/korean/student-exam-text";
const { buildKoStudentExamText } = studentExamText;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

// ── KO_RD_FACT: 지문 동봉 MC5 + 마커 + 보기 ──
const rdFactPassage =
  "인간의 존엄성은 헌법의 최고 원리이다. 국가는 인간의 존엄성을 보장할 의무를 진다. 이 원리는 모든 기본권 해석의 출발점이 된다.";
const rdFact = buildKoStudentExamText({
  subType: "KO_RD_FACT",
  questionText: "윗글의 내용과 일치하지 않는 것은?",
  structuredData: {
    direction: "윗글의 내용과 일치하지 않는 것은?",
    markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "헌법의 최고 원리" }],
    bogi: { label: "보기", lines: ["ㄱ. 보기 첫 항목", "ㄴ. 보기 둘째 항목"] },
    options: [
      { label: "①", text: "SECRET-선지-일" },
      { label: "②", text: "SECRET-선지-이" },
      { label: "③", text: "SECRET-선지-삼" },
      { label: "④", text: "SECRET-선지-사" },
      { label: "⑤", text: "SECRET-선지-오" },
    ],
    correctAnswer: "③",
    explanation: "SECRET-해설-문자열",
    evidence: ["SECRET-근거-문자열"],
    wrongOptionExplanations: [{ label: "①", explanation: "SECRET-오답-문자열" }],
  },
  passage: { content: rdFactPassage },
});
check("RD_FACT: 지문 본문 포함", rdFact.includes("보장할 의무를 진다"));
check("RD_FACT: 마커 병합(㉠__…__)", rdFact.includes("㉠__헌법의 최고 원리__"));
check("RD_FACT: 발문 포함", rdFact.includes("일치하지 않는 것은?"));
check("RD_FACT: 【보기】 포함", rdFact.includes("【보기】") && rdFact.includes("ㄱ. 보기 첫 항목"));
check("RD_FACT: 지문이 발문보다 앞", rdFact.indexOf("보장할 의무") < rdFact.indexOf("일치하지 않는 것은?"));
check("RD_FACT: 선지 미포함", !rdFact.includes("SECRET-선지"));
check("RD_FACT: 해설 미포함", !rdFact.includes("SECRET-해설-문자열"));
check("RD_FACT: evidence 미포함", !rdFact.includes("SECRET-근거-문자열"));
check("RD_FACT: 오답해설 미포함", !rdFact.includes("SECRET-오답-문자열"));

// ── KO_GR_PHONO: includesPassage=false — 지문 비동봉 + 보기만 ──
const grPhono = buildKoStudentExamText({
  subType: "KO_GR_PHONO",
  questionText: "fallback",
  structuredData: {
    direction: "<보기>의 ㄱ~ㄴ에 대한 설명으로 적절하지 않은 것은?",
    bogi: { label: "보기", lines: ["ㄱ. 좋은[조은]", "ㄴ. 놓고[노코]"] },
    options: [
      { label: "①", text: "o1" }, { label: "②", text: "o2" }, { label: "③", text: "o3" },
      { label: "④", text: "o4" }, { label: "⑤", text: "o5" },
    ],
    correctAnswer: "①",
  },
  passage: { content: "이 지문은 포함되면 안 된다" },
});
check("GR_PHONO: 보기 포함", grPhono.includes("【보기】") && grPhono.includes("ㄱ. 좋은[조은]"));
check("GR_PHONO: 지문 비동봉 유형은 지문 미포함", !grPhono.includes("이 지문은 포함되면 안 된다"));

// ── KO_NS_CLOZE(BLANK): toRenderModel 경유 — 【보기】+빈칸 토큰 (F2 마스킹 자동 상속 경로) ──
const clozeBogiLines = ["산 너머 남촌에는 누가 살길래", "해마다 봄바람이 (        ) 불어 오네"];
const cloze = buildKoStudentExamText({
  subType: "KO_NS_CLOZE",
  questionText: "fallback",
  structuredData: {
    direction: "<보기>의 빈칸에 들어갈 시어를 원문 그대로 쓰시오.",
    clozeMode: "BLANK",
    clozeSpec: { sourceExcerpt: "해마다 봄바람이 남으로 오네 불어 오네", answerSpan: "남으로 오네" },
    bogi: { label: "보기", lines: clozeBogiLines },
    correctAnswer: "남으로 오네",
    points: 4,
  },
  passage: { content: "산 너머 남촌에는 누가 살길래\\n해마다 봄바람이 남으로 오네 불어 오네" },
});
check("NS_CLOZE: 【보기】 포함", cloze.includes("【보기】"));
check("NS_CLOZE: 빈칸 토큰 유지", cloze.includes("(        )"));
check("NS_CLOZE: 발문 포함", cloze.includes("원문 그대로 쓰시오"));

// ── 서술형 조건 박스 (KO_NS_COND): 【조건】 포함 + 모범답안 미포함 ──
const cond = buildKoStudentExamText({
  subType: "KO_NS_COND",
  questionText: "fallback",
  structuredData: {
    direction: "윗글의 주제를 <조건>에 맞게 서술하시오.",
    essay: {
      conditions: ["한 문장으로 쓸 것", "'대비' 라는 단어를 포함할 것"],
      modelAnswer: "SECRET-모범답안-문자열",
    },
    correctAnswer: "SECRET-모범답안-문자열",
  },
  passage: { content: "봄이 오면 산에 들에 진달래 피네. 진달래 피는 곳에 내 마음도 핀다." },
});
check("NS_COND: 【조건】 포함", cond.includes("【조건】") && cond.includes("• 한 문장으로 쓸 것"));
check("NS_COND: 모범답안 미포함", !cond.includes("SECRET-모범답안-문자열"));

// ── 영어 문항 byte 불변 ──
const english = buildKoStudentExamText({
  subType: "BLANK_INFERENCE",
  questionText: "Original English questionText",
  structuredData: { direction: "should be ignored" },
  passage: { content: "English passage must not be appended" },
});
check("영어: questionText byte 불변", english === "Original English questionText");
check("영어(null subType): byte 불변",
  buildKoStudentExamText({ subType: null, questionText: "plain" }) === "plain");

// ── 폴백(비파괴 강등) ──
check("KO + structuredData 결손 → 저장본 폴백",
  buildKoStudentExamText({ subType: "KO_RD_FACT", questionText: "저장본", structuredData: null }) === "저장본");
check("KO 미등록 유형 → 저장본 폴백",
  buildKoStudentExamText({ subType: "KO_NOT_A_TYPE", questionText: "저장본2", structuredData: { direction: "x" } }) === "저장본2");
check("KO + structuredData 문자열(JSON) 수용",
  buildKoStudentExamText({
    subType: "KO_RD_FACT",
    questionText: "fallback",
    structuredData: JSON.stringify({ direction: "윗글에 대한 설명으로 적절한 것은?" }),
    passage: { content: "짧은 지문." },
  }).includes("적절한 것은?"));

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-student-exam-text-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    // Run through a shell so Windows resolves `npx` (only exists as npx.cmd);
    // execSync takes a single quoted command string (no DEP0190 args warning).
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

test("ko student exam text: passage+bogi+condition included, answers never leak", () => {
  const summary = runHarness();
  assert.equal(
    summary.failed,
    0,
    `ko-student-exam-text failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 18, `expected ≥18 checks, got ${summary.passed}`);
});
