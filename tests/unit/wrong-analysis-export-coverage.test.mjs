// 오답 해설(선지별) 내보내기 커버리지 테스트 (26-07-06 실측 버그).
//   버그: 마커 유형(어법 등)은 선지 목록이 없어(hasOptions=false) 웹/PDF·DOCX·HWPX
//   해설과 카드 복사에서 오답 분석이 통째로 누락됐다.
//   수정: shouldRenderWrongAnalysisForSubtype(마커 유형 허용) + 클립보드 [오답 해설]
//   블록 신설 + 어법 라벨 (A)→① 표시 변환(카드 팝오버·시험지·복사 규약 통일).
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import optionDisplay from "../src/components/exams/paper-builder/option-display.ts";
import explanationContent from "../src/components/exams/paper-builder/explanation-content.ts";
import clipboard from "../src/components/workbench/question-bank-card/build-clipboard-text.ts";

const { shouldRenderWrongAnalysisForSubtype } = optionDisplay;
const { buildExplanationRows } = explanationContent;
const { buildQuestionClipboardText } = clipboard;

const grammarExplanation = {
  content: "(B) 자리의 are 는 단수 주어와 어긋난다.",
  keyPoints: JSON.stringify(["(B) 수일치", "(A) 관계대명사", "(D) 분사"]),
  wrongOptionExplanations: JSON.stringify({
    "(A)": "(A)는 목적격 관계대명사 that 이 맞다.",
    "(C)": "복수 주어와 호응한다.",
  }),
};

// ── 시험지(웹/PDF 행 빌더): 어법 = 선지 목록 없음(hasOptions=false) ─────────
const grammarItem = {
  options: [],
  correctAnswer: "(B)",
  sourceQuestion: {
    subType: "GRAMMAR_ERROR",
    type: "MULTIPLE_CHOICE",
    correctAnswer: "(B)",
    structuredData: null,
    explanation: grammarExplanation,
  },
};
const grammarRows = buildExplanationRows(grammarItem);

// 회귀 가드: 선지도 마커도 없는 유형(서술형류)은 여전히 오답 분석 미렌더
const essayItem = {
  options: [],
  correctAnswer: "sample",
  sourceQuestion: {
    subType: "SUMMARY_WRITING",
    type: "ESSAY",
    correctAnswer: "sample",
    structuredData: null,
    explanation: grammarExplanation,
  },
};
const essayRows = buildExplanationRows(essayItem);

// 회귀 가드: 선지 목록 유형은 기존대로 렌더(라벨 무변환)
const blankItem = {
  options: [
    { label: "1", text: "one" },
    { label: "2", text: "two" },
  ],
  correctAnswer: "1",
  sourceQuestion: {
    subType: "BLANK_INFERENCE",
    type: "MULTIPLE_CHOICE",
    correctAnswer: "1",
    structuredData: null,
    explanation: {
      content: "해설.",
      keyPoints: null,
      wrongOptionExplanations: JSON.stringify({ "2": "이유" }),
    },
  },
};
const blankRows = buildExplanationRows(blankItem);

// ── 카드 복사(문제＋해설) ────────────────────────────────────────────────
const clipboardText = buildQuestionClipboardText(
  {
    id: "q1",
    subType: "GRAMMAR_ERROR",
    type: "MULTIPLE_CHOICE",
    questionText: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?\\n본문 __(A) that__ 그리고 __(B) are__.",
    options: [],
    correctAnswer: "(B)",
    explanation: grammarExplanation,
  },
  { includeAnswer: true },
);

const wrongRowsOf = (rows) => rows.filter((r) => r.type === "wrong");

console.log(JSON.stringify({
  gate: {
    grammarNoOptions: shouldRenderWrongAnalysisForSubtype("GRAMMAR_ERROR", false),
    essayNoOptions: shouldRenderWrongAnalysisForSubtype("SUMMARY_WRITING", false),
    optionType: shouldRenderWrongAnalysisForSubtype("BLANK_INFERENCE", true),
  },
  grammar: {
    wrong: wrongRowsOf(grammarRows),
    keyPointBullets: grammarRows.filter((r) => r.type === "bullet").map((r) => r.text),
  },
  essayWrongCount: wrongRowsOf(essayRows).length,
  blankWrong: wrongRowsOf(blankRows),
  clipboardText,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".wrong-analysis-export-harness.mts");
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

const result = runHarness();

test("게이트: 어법(마커 유형)은 선지 없이도 오답 분석 허용, 서술형은 불허", () => {
  assert.equal(result.gate.grammarNoOptions, true);
  assert.equal(result.gate.essayNoOptions, false);
  assert.equal(result.gate.optionType, true);
});

test("시험지 해설: 어법 오답 분석이 렌더되고 라벨·본문이 원형숫자로 변환된다", () => {
  assert.equal(result.grammar.wrong.length, 2, JSON.stringify(result.grammar.wrong));
  assert.equal(result.grammar.wrong[0].label, "①");
  assert.ok(result.grammar.wrong[0].text.startsWith("①"), result.grammar.wrong[0].text);
  assert.equal(result.grammar.wrong[1].label, "③");
});

test("시험지 해설: 어법 핵심 포인트의 라벨 참조도 원형숫자", () => {
  assert.ok(
    result.grammar.keyPointBullets[0].startsWith("②"),
    JSON.stringify(result.grammar.keyPointBullets),
  );
});

test("회귀: 선지·마커 없는 유형은 오답 분석 미렌더, 선지 유형은 라벨 무변환 렌더", () => {
  assert.equal(result.essayWrongCount, 0);
  assert.equal(result.blankWrong.length, 1);
  assert.equal(result.blankWrong[0].label, "2");
});

test("복사(문제＋해설): [오답 해설] 블록이 포함되고 어법 라벨은 원형숫자", () => {
  assert.ok(result.clipboardText.includes("[오답 해설]"), result.clipboardText);
  assert.ok(result.clipboardText.includes("① ①는 목적격") || result.clipboardText.includes("① "), result.clipboardText);
  assert.ok(!result.clipboardText.includes("(A)는 목적격"), "라벨 참조 미변환 잔존");
});
