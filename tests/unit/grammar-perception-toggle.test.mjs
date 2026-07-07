// 지각동사 보어 토글 게이트 — 실사고 재현 (2026-07-04 KILLER 출하 사고):
// 원문 "We see the democratizing power of AI to broaden ..."에서 to를 지운
// (E) broaden 이 지각동사 구문(see+O+원형)으로 재해석되어 정문 = 무정답 문항이
// 정상 경로로 출하됐다. 이 게이트가 그 문항을 error 로 차단하는지, 그리고
// 정상 출제(*saw him to cross)는 통과시키는지 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import quality from "@/lib/question-quality";
import grammarShared from "../src/lib/question-quality/validators/grammar/shared.ts";
import grammarCandidates from "../src/lib/question-quality/candidate-blocks/grammar.ts";
import generationConstants from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts";

const { validateQuestionQuality } = quality;
const { findGrammarPerceptionComplementToggle } = grammarShared;
const { selectUsableGrammarCandidates } = grammarCandidates;
const { RELAXED_BLOCKING_QUALITY_CODES, GRAMMAR_SCARCE_RELAXABLE_CODES } = generationConstants;

// 실사고 지문 원문(2026-07-04, questions cmr6eekqk001cmmeklxvs3pf9의 소스).
const pharmaPassage =
  "In the pharmaceutical industry, algorithms are being employed to find treatments and drugs for rare diseases that to date haven't received much attention. " +
  "The hard truth has always been that pharma devotes more research and development resources to diseases that affect the rich. " +
  "The definition of rare has too often been associated with poor ― that is, even if a disease is quite prevalent in a population that cannot afford to pay for it (for example, people living in the developing world), the disease has been neglected compared to First World illnesses. " +
  "By lowering the cost of data collection, mining, and analysis in drug development and clinical trials, AI can help offset imbalances in the pharmaceutical industry that direct attention to diseases that \\"pay,\\" whether because the disease is more common or because it is prevalent among demographics that can pay more. " +
  "We see the democratizing power of AI to broaden the attention of the medical and research communities to find cures to traditionally neglected health issues and among traditionally neglected populations.";

// DB에 실제 출하됐던 (E) 구조를 그대로 재현.
const shippedDefectiveItem = {
  direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
  difficulty: "KILLER",
  passageWithMarkers: pharmaPassage
    .replace("are being employed", "are __(A) being employed__")
    .replace("diseases that affect", "diseases __(B) that__ affect")
    .replace("too often been associated", "too often __(C) been associated__")
    .replace("because the disease is more common", "because the disease __(D) is__ more common")
    .replace("power of AI to broaden", "power of AI __(E) broaden__"),
  markedExpressions: [
    { label: "(A)", expression: "being employed", errorExpression: "being employed", isError: false, pointCode: "e", surroundingText: "In the pharmaceutical industry, algorithms are being employed to find treatments and drugs for rare diseases" },
    { label: "(B)", expression: "that", errorExpression: "that", isError: false, pointCode: "b", surroundingText: "devotes more research and development resources to diseases that affect the rich" },
    { label: "(C)", expression: "been associated", errorExpression: "been associated", isError: false, pointCode: "e", surroundingText: "The definition of rare has too often been associated with poor ― that is" },
    { label: "(D)", expression: "is", errorExpression: "is", isError: false, pointCode: "d", surroundingText: "whether because the disease is more common or because it is prevalent among demographics" },
    { label: "(E)", expression: "to broaden", errorExpression: "broaden", correction: "to broaden", isError: true, pointCode: "c", surroundingText: "We see the democratizing power of AI to broaden the attention of the medical and research communities" },
  ],
  options: [
    { label: "(A)", text: "being employed" },
    { label: "(B)", text: "that" },
    { label: "(C)", text: "been associated" },
    { label: "(D)", text: "is" },
    { label: "(E)", text: "broaden" },
  ],
  correctAnswer: "(E)",
  wrongOptionExplanations: {
    "(A)": "현재진행 수동태 be being p.p.가 적절하다.",
    "(B)": "diseases를 선행사로 하는 주격 관계대명사 that이 적절하다.",
    "(C)": "현재완료 수동태 have been p.p.가 적절하다.",
    "(D)": "단수 주어 the disease에 맞는 단수 동사 is가 적절하다.",
  },
  explanation:
    "이 문장의 동사는 see이고 the democratizing power of AI가 목적어이다. 명사 power를 수식하여 의미를 완성하려면 형용사적 용법의 to부정사가 필요하므로 broaden은 to broaden으로 고쳐야 한다.",
  keyPoints: ["to부정사의 형용사적 용법", "현재진행 수동태", "주격 관계대명사"],
};

const shippedDefectiveQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: shippedDefectiveItem,
  passage: pharmaPassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const helperVerdicts = {
  // 실사고 방향: 원문 to-V → 원형. 지각동사 보어 파스로 정문 → 차단.
  shippedDefect: findGrammarPerceptionComplementToggle(
    "to broaden",
    "broaden",
    "We see the democratizing power of AI to broaden the attention of the medical and research communities",
    pharmaPassage,
  ),
  // 역방향: 원문 원형 → to-V. 목적어에 to부정사 보문 명사(power) → 정문 파스 → 차단.
  reverseWithLicensingNoun: findGrammarPerceptionComplementToggle(
    "broaden",
    "to broaden",
    "We see the democratizing power of AI broaden the attention of the medical and research communities",
  ),
  // V-ing↔원형 토글도 지각동사 뒤면 둘 다 정문 → 차단.
  ingToggleAfterWatch: findGrammarPerceptionComplementToggle(
    "playing",
    "play",
    "From the balcony we watch the children playing in the yard",
  ),
  // 정상 출제: *saw him to cross (보문 명사 없음) → 통과해야 함.
  classicSafeError: findGrammarPerceptionComplementToggle(
    "cross",
    "to cross",
    "We saw him cross the street before the light changed",
  ),
  // 수동 지각(was seen to leave)은 목적어가 없어 보어 파스 불성립 → 통과.
  passivePerception: findGrammarPerceptionComplementToggle(
    "to leave",
    "leave",
    "The suspect was seen to leave the building",
  ),
  // 절 경계(that) 너머의 지각동사는 무관 → 통과.
  acrossClauseBoundary: findGrammarPerceptionComplementToggle(
    "to grow",
    "grow",
    "Researchers see that the economy continued to grow last year",
  ),
  // help는 O+원형/O+to-V 둘 다 정문 → 보문 명사 없어도 차단.
  helpToggle: findGrammarPerceptionComplementToggle(
    "escape",
    "to escape",
    "The guide helped the hikers escape the storm",
  ),
};

const usable = selectUsableGrammarCandidates(pharmaPassage, "KILLER");

console.log(JSON.stringify({
  shippedDefectiveQuality,
  helperVerdicts,
  forbiddenExpressions: usable.forbidden.map((f) => f.expression.toLowerCase()),
  candidateExpressions: usable.candidates.map((c) => c.expression.toLowerCase()),
  relaxedBlocks: RELAXED_BLOCKING_QUALITY_CODES.has("grammar-perception-complement-toggle"),
  scarceRelaxes: GRAMMAR_SCARCE_RELAXABLE_CODES.has("grammar-perception-complement-toggle"),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-perception-toggle-harness.mts");
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

test("shipped defective item (see ... power of AI to broaden → broaden) is blocked as error", () => {
  assert.ok(
    result.shippedDefectiveQuality.some(
      (issue) =>
        issue.severity === "error" &&
        issue.code === "grammar-perception-complement-toggle",
    ),
    JSON.stringify(result.shippedDefectiveQuality),
  );
});

test("helper flags both toggle directions and ing-toggle after perception verbs", () => {
  assert.ok(result.helperVerdicts.shippedDefect, "to→bare after see must be flagged");
  assert.ok(
    result.helperVerdicts.reverseWithLicensingNoun,
    "bare→to after see with licensing noun (power) must be flagged",
  );
  assert.ok(result.helperVerdicts.ingToggleAfterWatch, "ing↔bare after watch must be flagged");
  assert.ok(result.helperVerdicts.helpToggle, "bare→to after help must be flagged");
});

test("helper passes legitimate perception-verb items", () => {
  assert.equal(result.helperVerdicts.classicSafeError, null, "saw him to cross must stay usable");
  assert.equal(result.helperVerdicts.passivePerception, null, "was seen to leave has no object complement parse");
  assert.equal(result.helperVerdicts.acrossClauseBoundary, null, "see that-clause is a different clause");
});

test("candidate detector forbids the perception to-V site instead of recommending it", () => {
  assert.ok(
    result.forbiddenExpressions.includes("to broaden"),
    JSON.stringify(result.forbiddenExpressions),
  );
  assert.ok(
    !result.candidateExpressions.includes("to broaden"),
    JSON.stringify(result.candidateExpressions),
  );
});

test("code blocks in relaxed mode and is never scarce-relaxable", () => {
  assert.equal(result.relaxedBlocks, true);
  assert.equal(result.scarceRelaxes, false);
});
