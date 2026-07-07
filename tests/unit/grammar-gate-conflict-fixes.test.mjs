// 어법(GRAMMAR_ERROR) 후보블록/프레임의 게이트 충돌 수정 검증 (2026-07-06).
// - frame 5(that vs what)의 errorRecipe 가 'N what' 을 정답으로 유도하지 않는지
// - KILLER 분기에 'N what' 정답 금지 라인이 존재하는지
// - 금지표면 블록이 GRAMMAR_ERROR/GRAMMAR_CORRECTION 프롬프트에 각각 1회만 등장하는지
// - shallow 'depends on' 억제 라인이 무조건 존재하는지
// - mid-sentence "only by/in/with + what/which" 오분류 후보가 제거되는지(관계사 프레임 커버리지는 유지)
// - 긴 후보 표면이 단어 중간이 아니라 단어 경계에서 잘리는지
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import grammarCandidates from "../src/lib/question-quality/candidate-blocks/grammar.ts";
import grammarFrames from "../src/lib/grammar-frames.ts";

const {
  buildGrammarErrorCandidateBlock,
  buildGrammarCorrectionCandidateBlock,
  findGrammarGenerationCandidates,
  selectUsableGrammarCandidates,
} = grammarCandidates;
const { GRAMMAR_FRAMES, buildGrammarFrameKnowledge } = grammarFrames;

const noisyGlassPassage =
  "Clear and perfect as it might appear to our eyes, the technical term for this mess depends on who you're asking. " +
  "In theory it is both liquid and solid, though, given the way it behaves, it is the latter. " +
  "The glass is slowly sinking over time, despite it being one of the oldest substances.";

// mid-sentence 자유관계절 목적어 — 부정어 도치가 아님(전치사구).
const antPassage =
  "The whole colony is guided only by what a single ant can sense in its immediate surroundings.";

// 60자 초과 병렬(not only ... but also) 매치 — 단어 중간에서 잘리던 지점을 재현.
const parallelTruncationPassage =
  "Researchers observed not only the biological adaptations that the creatures develop but also their migratory patterns.";

const forbiddenHeaderRe = /## Forbidden grammar target surfaces detected in this passage/g;
const countForbidden = (block) => (block.match(forbiddenHeaderRe) || []).length;

const frame5 = GRAMMAR_FRAMES.find((frame) => frame.id === 5);
const frameKnowledgeBasic = buildGrammarFrameKnowledge("judgment", "BASIC");

const killerErrorBlock = buildGrammarErrorCandidateBlock(noisyGlassPassage, 5, 1, "KILLER");
const correctionBlock = buildGrammarCorrectionCandidateBlock(noisyGlassPassage, 1, "KILLER");

const antCandidates = findGrammarGenerationCandidates(antPassage, "KILLER");
const antUsable = selectUsableGrammarCandidates(antPassage, "KILLER");

const truncationCandidates = findGrammarGenerationCandidates(parallelTruncationPassage, "KILLER");

console.log(JSON.stringify({
  frame5ErrorRecipe: frame5 ? frame5.errorRecipe : "",
  frameKnowledgeBasicHasDecoyOnly: frameKnowledgeBasic.includes("미끼 반증용"),
  killerErrorBlock,
  killerForbiddenCount: countForbidden(killerErrorBlock),
  correctionForbiddenCount: countForbidden(correctionBlock),
  antCandidateExpressions: antCandidates.map((c) => c.expression.toLowerCase()),
  antCandidateCodes: antCandidates.map((c) => c.code),
  antUsableExpressions: antUsable.candidates.map((c) => c.expression.toLowerCase()),
  truncationExpressions: truncationCandidates.map((c) => c.expression.toLowerCase()),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-gate-conflict-fixes-harness.mts");
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

test("frame 5 (that vs what) no longer promotes 'N what' as an answer recipe", () => {
  // 정답 유도 문구가 제거됐는지: 옛 문구는 사라지고, 반려/미끼 반증용 프레이밍이 있어야 한다.
  assert.equal(
    result.frame5ErrorRecipe.includes("선행사가 이미 있는 자리에 what 을 넣는 변형도 명백한 비문"),
    false,
    result.frame5ErrorRecipe,
  );
  assert.match(result.frame5ErrorRecipe, /반려/);
  assert.match(result.frame5ErrorRecipe, /미끼 반증용/);
  assert.equal(result.frameKnowledgeBasicHasDecoyOnly, true);
});

test("KILLER GRAMMAR_ERROR guardrail bans the 'N what' form as the answer (mirrors INTERMEDIATE)", () => {
  assert.match(result.killerErrorBlock, /keep an 'N what' form only for decoy disproof/);
});

test("shallow 'depends on' ban is present unconditionally in the GRAMMAR_ERROR guardrail", () => {
  assert.match(result.killerErrorBlock, /Shallow 'depends on' ban/);
});

test("forbidden-surface block prints exactly once per prompt (no duplicate)", () => {
  assert.equal(result.killerForbiddenCount, 1, `GRAMMAR_ERROR forbidden count=${result.killerForbiddenCount}`);
  assert.equal(result.correctionForbiddenCount, 1, `GRAMMAR_CORRECTION forbidden count=${result.correctionForbiddenCount}`);
});

test("mid-sentence 'only by/in/with + what/which' is not offered as a negative-inversion candidate", () => {
  const startsWithOnlyByWhat = (list) => list.some((expr) => /^only\s+(?:by|in|with)\s+(?:what|which)\b/.test(expr));
  assert.equal(startsWithOnlyByWhat(result.antCandidateExpressions), false, JSON.stringify(result.antCandidateExpressions));
  assert.equal(startsWithOnlyByWhat(result.antUsableExpressions), false, JSON.stringify(result.antUsableExpressions));
  // 커버리지 유지: 관계사/명사절(코드 b) 프레임은 그대로 후보로 남는다.
  assert.ok(result.antCandidateCodes.includes("b"), JSON.stringify(result.antCandidateCodes));
});

test("long candidate spans are truncated at a word boundary, not mid-word", () => {
  // 완전한 단어 경계 결과가 있어야 하고, 옛 mid-word 컷("...creatures de...")은 없어야 한다.
  assert.ok(
    result.truncationExpressions.some((expr) => expr === "not only the biological adaptations that the creatures..."),
    JSON.stringify(result.truncationExpressions),
  );
  assert.ok(
    result.truncationExpressions.every((expr) => !/\bde\.\.\.$/.test(expr)),
    JSON.stringify(result.truncationExpressions),
  );
});
