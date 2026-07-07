import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";

// Wave-3 DISTRACTOR-CRAFT 프롬프트 패스 검증(경량).
// 1) 각 소유 섹션에 새 규칙 문자열이 실재하는지 (프롬프트 회귀 가드)
// 2) blank 후보 블록의 자기설명 인접(self-giveaway) 결정론 제외가 실제로 동작하는지

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import mc from "@/lib/question-prompts-mc";
import essay from "@/lib/question-prompts-essay";
import vocab from "@/lib/question-prompts-vocab";
import rubric from "@/lib/question-quality/rubric";
import blank from "@/lib/question-quality/candidate-blocks/blank";

const { MC_PROMPTS } = mc as any;
const { ESSAY_PROMPTS } = essay as any;
const { VOCAB_PROMPTS } = vocab as any;
const { TYPE_QUALITY_RUBRICS } = rubric as any;
const { isSelfExplainedBlankCandidate, buildStandardBlankInferenceCandidateBlock } = blank as any;

const out: Record<string, unknown> = {};

out.prompts = {
  sentenceOrderPlausibility:
    MC_PROMPTS.SENTENCE_ORDER.includes("오답 순열 그럴듯함") &&
    MC_PROMPTS.SENTENCE_ORDER.includes("미해소 대용어"),
  sentenceOrderSelfCheck: MC_PROMPTS.SENTENCE_ORDER.includes("자체 검증"),
  referenceTraps:
    MC_PROMPTS.REFERENCE.includes("최근접 명사 함정") &&
    MC_PROMPTS.REFERENCE.includes("병렬 구조 함정"),
  referenceExplanationMatch: MC_PROMPTS.REFERENCE.includes("해설-정답표 일치"),
  impliedCentralTarget:
    MC_PROMPTS.IMPLIED_MEANING.includes("중심 논지 연결 필수") &&
    MC_PROMPTS.IMPLIED_MEANING.includes("주제 환원 검사") &&
    MC_PROMPTS.IMPLIED_MEANING.includes("인접 재진술 검사"),
  // 26-07-06 mc-reading 루프: 반의어 교체 soft("최후의 수단") → hard 금지 승격
  // (실측 VOCAB_CHOICE PREM 96→98). 계약도 새 규칙으로 갱신.
  vocabChoiceCraft:
    MC_PROMPTS.VOCAB_CHOICE.includes("같은 품사·같은 굴절형") &&
    MC_PROMPTS.VOCAB_CHOICE.includes("직접 반의어·극성 반전 교체 금지") &&
    MC_PROMPTS.VOCAB_CHOICE.includes("반의어 1:1 교체는 BASIC 전용"),
  contextMeaningPolysemy:
    VOCAB_PROMPTS.CONTEXT_MEANING.includes("polysemy 함정") &&
    VOCAB_PROMPTS.CONTEXT_MEANING.includes("같은 의미장"),
  wordOrderTransform:
    ESSAY_PROMPTS.WORD_ORDER.includes("원문 변형 필수") &&
    ESSAY_PROMPTS.WORD_ORDER.includes("원문 문장을 그대로 재배열하는 과제 금지"),
  wordOrderDecoys: ESSAY_PROMPTS.WORD_ORDER.includes("최소 1개(KILLER는 2개 이상)"),
  summaryWritingDistractors: ESSAY_PROMPTS.SUMMARY_WRITING.includes("항상 2개 이상"),
};

out.rubrics = {
  sentenceOrderAnaphor: (TYPE_QUALITY_RUBRICS.SENTENCE_ORDER || []).some((r) =>
    r.includes("unresolved anaphor"),
  ),
  contextMeaningPolysemy: (TYPE_QUALITY_RUBRICS.CONTEXT_MEANING || []).some((r) =>
    r.includes("polysemy trap"),
  ),
  referenceMismatch: (TYPE_QUALITY_RUBRICS.REFERENCE || []).some((r) =>
    r.includes("label/explanation mismatch"),
  ),
  wordOrderTransform: (TYPE_QUALITY_RUBRICS.WORD_ORDER || []).some((r) =>
    r.includes("structural transformation"),
  ),
  summaryWritingExists: Array.isArray(TYPE_QUALITY_RUBRICS.SUMMARY_WRITING),
};

// ── 자기설명 인접(self-giveaway) 결정론 제외 ──
out.selfExplained = {
  restatementNext: isSelfExplainedBlankCandidate(
    "The economy depends on shared expectations about fairness.",
    "depends on shared expectations about fairness",
    "In other words, people trade because they trust the rules.",
  ),
  normalNext: isSelfExplainedBlankCandidate(
    "The economy depends on shared expectations about fairness.",
    "depends on shared expectations about fairness",
    "Markets collapsed several times during the last century.",
  ),
  colonAfterSpan: isSelfExplainedBlankCandidate(
    "The lesson requires a simple habit: reviewing your notes every day.",
    "requires a simple habit",
    "Many students ignore it.",
  ),
  spanAfterColon: isSelfExplainedBlankCandidate(
    "The lesson is simple: consistent review beats cramming every time.",
    "consistent review beats cramming",
    "Many students ignore it.",
  ),
};

// 후보 블록 통합: 재진술 표지가 뒤따르는 문장은 후보 목록에서 빠져야 한다.
{
  const passage = [
    "These platforms create a trusting environment among complete strangers.",
    "In other words, users rely on mutual reviews to feel safe.",
    "The economy depends on shared expectations about fairness in every exchange.",
  ].join(" ");
  const block = buildStandardBlankInferenceCandidateBlock(passage);
  out.candidateBlock = {
    excludesSelfExplained: !block.includes("trusting environment among complete strangers"),
    keepsCleanCandidate: block.includes("shared expectations about fairness"),
    mentionsRule: block.includes("자기설명 인접"),
  };
}

console.log(JSON.stringify(out));
`;

function runHarness() {
  const harnessPath = path.join(repoRoot, "tests", "unit", ".wave3-craft-prompts-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      /* ignore */
    }
  }
}

const result = runHarness();

test("wave3 prompt rules are present in every owned section", () => {
  for (const [key, value] of Object.entries(result.prompts)) {
    assert.equal(value, true, `prompt marker missing: ${key}`);
  }
});

test("wave3 rubric bars are present for owned types", () => {
  for (const [key, value] of Object.entries(result.rubrics)) {
    assert.equal(value, true, `rubric marker missing: ${key}`);
  }
});

test("self-explained blank candidates are detected deterministically", () => {
  assert.equal(result.selfExplained.restatementNext, true);
  assert.equal(result.selfExplained.normalNext, false);
  assert.equal(result.selfExplained.colonAfterSpan, true);
  assert.equal(result.selfExplained.spanAfterColon, false);
});

test("standard blank candidate block drops self-explained sentences and keeps clean ones", () => {
  assert.equal(result.candidateBlock.excludesSelfExplained, true);
  assert.equal(result.candidateBlock.keepsCleanCandidate, true);
  assert.equal(result.candidateBlock.mentionsRule, true);
});
