import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as quality from "../../../../src/lib/question-quality/index";
import * as grammarShared from "../../../../src/lib/question-quality/validators/grammar/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const reviewsRoot = path.dirname(here);
const v4Dir = path.join(reviewsRoot, "deterministic-splits-remediation-reaudit-v4");
const v5Dir = path.join(reviewsRoot, "deterministic-splits-remediation-reaudit-v5");
const v5HarnessPath = path.join(v5Dir, "audit.mts");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const qualityRuntime =
  (quality as unknown as { default?: typeof quality }).default ?? quality;
const grammarRuntime =
  (grammarShared as unknown as { default?: typeof grammarShared }).default ?? grammarShared;
const { validateQuestionQuality } = qualityRuntime;
const { findGrammarKeypointNonexistentLabel, findGrammarTerminologyRegister } =
  grammarRuntime;

type PriorFailure = {
  source?: string;
  id: string;
  category: string;
  expected: boolean;
  observed: boolean;
  input: string;
  displayInput?: string;
  oracle?: string;
};

type V5Replay = {
  verdict: "PASS" | "BLOCK";
  summary: {
    total: number;
    pass: number;
    fail: number;
    failedCaseIds: string[];
    v4SemanticReplay: { total: number; pass: number; fail: number; verdict: string };
    newHoldout: { total: number; pass: number; fail: number };
  };
  failures: PriorFailure[];
  safety: Record<string, number>;
  provenance: { auditScriptSha256: string };
};

type HoldoutCase = {
  id: string;
  category: string;
  expected: boolean;
  observed: boolean;
  pass: boolean;
  polarity: "positive" | "negative";
  input: string;
  displayInput: string;
  oracle: string;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha(relativePath: string): string {
  return sha256(readFileSync(path.join(repoRoot, relativePath)));
}

function directoryHashes(dir: string, names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => [name, sha256(readFileSync(path.join(dir, name)))]),
  );
}

function hasCode(issues: Array<{ code: string }>, code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

const v5Replay = JSON.parse(
  execFileSync(process.execPath, [tsxCli, v5HarnessPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
) as V5Replay;

assert.equal(v5Replay.summary.total, 712, "frozen v5 replay must contain 712 cases");
assert.equal(v5Replay.summary.v4SemanticReplay.total, 520);
assert.equal(v5Replay.summary.newHoldout.total, 192);
assert.equal(v5Replay.failures.length, v5Replay.summary.fail);
assert.deepEqual(
  v5Replay.failures.map((failure) => failure.id),
  v5Replay.summary.failedCaseIds,
);
for (const [name, count] of Object.entries(v5Replay.safety)) {
  assert.equal(count, 0, `v5 replay safety counter ${name} must remain zero`);
}
assert.equal(
  fileSha(
    "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v5/audit.mts",
  ),
  v5Replay.provenance.auditScriptSha256,
);

const cases: HoldoutCase[] = [];

function addCase(
  id: string,
  category: string,
  expected: boolean,
  observed: boolean,
  input: string,
  oracle: string,
  displayInput = input,
): void {
  cases.push({
    id,
    category,
    expected,
    observed,
    pass: expected === observed,
    polarity: expected ? "positive" : "negative",
    input,
    displayInput,
    oracle,
  });
}

// ---------------------------------------------------------------------------
// Independent local fixtures. This harness is read-only outside its own v6
// artifact directory and makes no API, browser, network, or database call.
// ---------------------------------------------------------------------------

const summaryPassage =
  "Reliable reviewers compare several pieces of evidence before accepting a claim. " +
  "That practice prevents a single noisy observation from deciding the result.";
const summaryBase = {
  direction: "Complete the summary by choosing the best words for (A) and (B).",
  summaryWithBlanks:
    "Reviewers make more (A) judgments by comparing evidence, limiting reliance on (B) observations.",
  blanks: [
    { label: "(A)", answer: "reliable" },
    { label: "(B)", answer: "noisy" },
  ],
  options: [
    { label: "1", text: "reliable / noisy", blankA: "reliable", blankB: "noisy" },
    { label: "2", text: "reliable / stable", blankA: "reliable", blankB: "stable" },
    { label: "3", text: "hasty / noisy", blankA: "hasty", blankB: "noisy" },
    { label: "4", text: "hasty / stable", blankA: "hasty", blankB: "stable" },
    { label: "5", text: "random / fixed", blankA: "random", blankB: "fixed" },
  ],
  correctAnswer: "1",
  explanation:
    "Comparing evidence supports reliable judgments and reduces reliance on noisy observations.",
};

function directionHasFatal(direction: string): boolean {
  return hasCode(
    validateQuestionQuality({
      typeId: "SUMMARY_COMPLETE_MC",
      question: { ...summaryBase, direction },
      passage: summaryPassage,
      requestedDifficulty: "INTERMEDIATE",
    }),
    "summary-mc-direction-task-mismatch",
  );
}

const blankBase = {
  difficulty: "INTERMEDIATE",
  blankAnswerMode: "PARAPHRASE",
  passageWithBlank:
    "Institutions preserve effects of earlier choices. Their strongest long-term consequence is _____.",
  originalExpression: "lasting limits on how institutions can respond",
  answerLogic:
    "The answer restates the lasting institutional limits in new wording without copying the source phrase.",
  options: [
    { label: "1", text: "durable constraints on institutional choice" },
    { label: "2", text: "a temporary administrative convenience" },
    { label: "3", text: "an immediate expansion of discretion" },
    { label: "4", text: "a purely symbolic public gesture" },
    { label: "5", text: "an easily reversible procedural choice" },
  ],
  correctAnswer: "1",
  explanation: "Earlier choices can constrain what institutions are later able to do.",
};

function blankIssues(question: Record<string, unknown>) {
  return validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question,
    passage:
      "Institutions preserve effects of earlier choices, creating lasting limits on how they can respond.",
    requestedDifficulty: "INTERMEDIATE",
    blankInferenceParaphraseAnswer: true,
  });
}

function explanationHasFatal(explanation: string): boolean {
  return hasCode(
    blankIssues({ ...blankBase, explanation }),
    "blank-explanation-narrative-circled-numbering",
  );
}

function residualHasFatal(passageWithBlank: string, correctText: string): boolean {
  return hasCode(
    blankIssues({
      ...blankBase,
      passageWithBlank,
      options: [{ label: "1", text: correctText }, ...blankBase.options.slice(1)],
    }),
    "blank-paraphrase-correct-residual-visible",
  );
}

const sentenceOrderBase = {
  givenSentence:
    "People sometimes assume that communication improves whenever a speaker adds more information.",
  paragraphs: [
    {
      label: "(A)",
      text:
        "Listeners still have to decide which details deserve attention during a difficult exchange. Their goals and prior knowledge guide that decision.",
    },
    {
      label: "(B)",
      text:
        "Effective speakers guide attention instead of merely adding disconnected facts. Relevance matters as much as the amount of information presented.",
    },
    {
      label: "(C)",
      text:
        "An excessively long message can hide the point it was meant to clarify. Additional content therefore does not guarantee better understanding.",
    },
  ],
  options: [
    { label: "1", text: "(A)-(B)-(C)" },
    { label: "2", text: "(A)-(C)-(B)" },
    { label: "3", text: "(B)-(A)-(C)" },
    { label: "4", text: "(B)-(C)-(A)" },
    { label: "5", text: "(C)-(A)-(B)" },
  ],
  correctAnswer: "2",
};

function paragraphHasEmptyFatal(text: string): boolean {
  return hasCode(
    validateQuestionQuality({
      typeId: "SENTENCE_ORDER",
      question: {
        ...sentenceOrderBase,
        paragraphs: sentenceOrderBase.paragraphs.map((paragraph, index) =>
          index === 1 ? { ...paragraph, text } : paragraph,
        ),
      },
      passage: "",
      requestedDifficulty: "INTERMEDIATE",
    }),
    "sentence-order-empty-paragraph",
  );
}

const markedExpressions = [
  { label: "(A)", pointCode: "a" },
  { label: "(B)", pointCode: "b" },
  { label: "(C)", pointCode: "c" },
];

// ---------------------------------------------------------------------------
// 1. Summary evidence/source phrasing. Positives clearly assign a separately
// scored content-evidence task. Negatives use the same vocabulary solely as
// evidence for choosing the pair that fills summary slots (A)/(B).
// ---------------------------------------------------------------------------

const evidenceMixedDirections = [
  "요약문의 빈칸 (A), (B)를 완성하시오. 별도 문항으로 글의 내용에 근거하지 않은 주장을 고르시오.",
  "요약문의 빈칸 (A)와 (B)를 채우시오. 그와 별개로 본문의 내용에 근거하지 않은 진술을 찾으시오.",
  "요약문 빈칸 (A), (B)에 말을 넣으시오. 추가로 글의 내용에 뒷받침되지 않는 주장을 선택하시오.",
  "요약문의 빈자리 (A), (B)를 완성하시오. 따로 본문의 내용에 뒷받침되지 않는 진술을 고르시오.",
  "요약문 빈칸 (A)와 (B)에 적절한 말을 넣으시오. 별도로 글의 내용에 어긋나는 주장을 찾으시오.",
  "요약문의 두 빈칸 (A), (B)를 채우시오. 이어서 본문의 내용과 모순되는 진술을 선택하시오.",
  "요약문 빈칸 (A), (B)를 먼저 완성하시오. 별개 과제로 글의 내용을 근거로 옳지 않은 진술을 고르시오.",
  "요약문의 빈칸 (A)와 (B)에 단어를 넣으시오. 또한 본문 내용을 근거로 사실이 아닌 주장을 찾으시오.",
  "요약문 빈칸 (A), (B)를 완성하시오. 이와 독립적으로 글에서 뒷받침할 근거가 없는 주장을 고르시오.",
  "요약문의 빈자리 (A), (B)를 채우시오. 두 번째 과제로 본문이 뒷받침하지 않는 진술을 선택하시오.",
  "요약문 빈칸 (A)와 (B)를 완성하시오. 별도로 글의 증거로 정당화할 수 없는 주장을 찾으시오.",
  "요약문의 두 빈칸 (A), (B)를 채우시오. 추가로 본문에 제시된 증거가 지지하지 않는 진술을 고르시오.",
  "Complete summary blanks (A) and (B). As a separate task, choose the claim for which the passage provides no evidence.",
  "Fill (A) and (B) in the summary. Independently select the statement not supported by evidence in the text.",
  "Complete the summary at (A) and (B); then identify the assertion with no textual support in the source passage.",
  "Choose the pair for summary slots (A) and (B). Separately, select the claim that cannot be justified from the passage.",
];

evidenceMixedDirections.forEach((direction, index) => {
  addCase(
    `v6-summary-evidence-mixed-${String(index + 1).padStart(2, "0")}`,
    "summary-evidence-source-v6",
    true,
    directionHasFatal(direction),
    direction,
    "The direction explicitly separates summary completion from a second scored task whose answer is an unsupported, contradictory, or unjustified claim; mismatch fatal is mandatory.",
  );
});

const evidenceBoundDirections = [
  "글의 내용을 근거로 요약문의 빈칸 (A), (B)에 가장 적절한 단어 쌍을 고르시오.",
  "본문의 내용을 근거로 요약문 빈칸 (A)와 (B)를 완성할 표현을 선택하시오.",
  "글에서 뒷받침되는 단어 조합으로 요약문의 빈칸 (A), (B)를 채우시오.",
  "본문 근거와 일치하도록 요약문 빈자리 (A)와 (B)에 들어갈 한 쌍을 고르시오.",
  "글의 내용과 모순되지 않게 요약문의 두 빈칸 (A), (B)를 완성하시오.",
  "본문에 근거한 요약이 되도록 빈칸 (A)와 (B)에 알맞은 표현을 넣으시오.",
  "근거 없는 단어 조합은 피하고 요약문 빈칸 (A), (B)에 들어갈 한 쌍만 선택하시오.",
  "본문이 뒷받침하는 두 표현을 골라 요약문의 빈자리 (A)와 (B)를 채우시오.",
  "Using evidence from the passage, complete summary blanks (A) and (B) with one option pair.",
  "Choose the pair for summary positions (A) and (B) that is supported by the source text.",
  "Complete summary slots (A) and (B) without contradicting the passage's content.",
  "Select expressions for summary blanks (A) and (B) that are grounded in passage evidence.",
  "For summary positions (A) and (B), reject unsupported pairs and choose the one backed by the text.",
  "Fill summary blanks (A) and (B) so the completed summary matches the evidence in the passage.",
  "Based only on the source text, choose one pair to complete summary labels (A) and (B).",
  "Complete the summary at (A) and (B) with the two words best justified by the passage.",
];

evidenceBoundDirections.forEach((direction, index) => {
  addCase(
    `v6-summary-evidence-bound-${String(index + 1).padStart(2, "0")}`,
    "summary-evidence-source-v6",
    false,
    directionHasFatal(direction),
    direction,
    "Evidence/source language only constrains which pair fills summary slots (A)/(B); there is no second answer object, so the mixed-task fatal must abstain.",
  );
});

// ---------------------------------------------------------------------------
// 2. Circled role split, with new finite correct-option verdict forms and new
// procedural narratives. All strings differ from v4/v5 explanations.
// ---------------------------------------------------------------------------

const finiteVerdicts = [
  "정답이다",
  "정답입니다",
  "정답이라고 판단한다",
  "정답으로 판단된다",
  "정답이라고 본다",
  "정답으로 보인다",
  "정답임이 분명하다",
  "정답으로 확정된다",
  "정답이라고 결론짓는다",
  "정답임이 확실하다",
  "적절하다고 판단한다",
  "적절하다고 판정한다",
  "정답으로 귀결된다",
  "정답이라고 판정한다",
  "정답으로 인정된다",
  "정답이라고 할 수 있다",
];

function directOptionExplanation(verdict: string): string {
  return [
    `① 첫째 선택지는 지문의 범위를 정확히 지켜 ${verdict}.`,
    `② 둘째 선택지는 인과 방향을 올바르게 반영해 ${verdict}.`,
    `③ 셋째 선택지는 핵심 결론을 빠짐없이 담아 ${verdict}.`,
  ].join(" ");
}

finiteVerdicts.forEach((verdict, index) => {
  const explanation = directOptionExplanation(verdict);
  addCase(
    `v6-circled-direct-${String(index + 1).padStart(2, "0")}`,
    "blank-circled-role-v6",
    false,
    explanationHasFatal(explanation),
    explanation,
    "Every circled marker heads a complete finite verdict about that numbered option; it is an option citation rather than procedural numbering.",
  );
});

const procedureTriples = [
  ["질문의 범위를 한정한다", "핵심 문장을 표시한다", "근거와 결론을 연결한다"],
  ["빈칸의 문법 역할을 본다", "주변 표현의 의미를 읽는다", "전체 문장의 뜻을 정리한다"],
  ["글쓴이의 문제의식을 찾는다", "해결책이 제시된 부분을 찾는다", "두 내용을 비교한다"],
  ["반복되는 명사를 묶는다", "대조되는 표현을 나눈다", "문단 사이 관계를 설명한다"],
  ["앞 문장의 원인을 찾는다", "뒤 문장의 결과를 찾는다", "인과 방향을 확인한다"],
  ["주장과 예시를 구분한다", "예시가 맡은 기능을 적는다", "주장을 다시 표현한다"],
  ["시간 표현을 모은다", "사건의 선후를 배열한다", "변화의 흐름을 요약한다"],
  ["대상의 공통점을 찾는다", "차이점을 표로 나눈다", "비교의 목적을 확인한다"],
  ["지시어가 나온 문장을 읽는다", "앞선 명사 후보를 모은다", "문맥에 맞는 대상을 좁힌다"],
  ["접속부사의 뜻을 확인한다", "앞뒤 문장의 관계를 정한다", "논리 전환을 설명한다"],
  ["핵심 동사의 주어를 찾는다", "수식 범위를 구분한다", "문장 구조를 다시 적는다"],
  ["문단의 첫 문장을 읽는다", "세부 설명을 묶는다", "문단의 중심 내용을 쓴다"],
  ["낯선 단어의 주변 문맥을 본다", "긍정과 부정 단서를 나눈다", "가능한 의미를 정리한다"],
  ["문제에서 요구한 대상을 표시한다", "본문의 대응 표현을 찾는다", "두 표현을 대조한다"],
  ["사실 진술을 모은다", "해석에 해당하는 문장을 나눈다", "확인 가능한 결론만 남긴다"],
  ["전체 글을 두 부분으로 나눈다", "각 부분의 역할을 적는다", "공통 주제를 한 줄로 쓴다"],
];

procedureTriples.forEach(([first, second, third], index) => {
  const explanation = `① 우선 ${first}. ② 그다음 ${second}. ③ 끝으로 ${third}.`;
  addCase(
    `v6-circled-procedure-${String(index + 1).padStart(2, "0")}`,
    "blank-circled-role-v6",
    true,
    explanationHasFatal(explanation),
    explanation,
    "The circled digits enumerate three reading/solution steps and never identify or judge an option; narrative-numbering fatal is mandatory.",
  );
});

// ---------------------------------------------------------------------------
// 3. Ghost labels: 16 new decoration prefixes paired metamorphically with the
// same decorated nonexistent (J) after substantive prose.
// ---------------------------------------------------------------------------

const decorativePrefixes = [
  "⚑ ",
  "◈ ",
  "◉ ",
  "⬥ ",
  "➽ ",
  "⟡ ",
  "※※ ",
  ":::: ",
  "~~③~~ ",
  "3. >> ",
  "{ } ⇒ ",
  "🧩 ",
  "🪶 ",
  "\u2063◆ ",
  "\uFEFF☛ ",
  "\u20DD☆ ",
];

decorativePrefixes.forEach((prefix, index) => {
  const ghost = `${prefix}(J) 관계사의 선행사를 확인한다.`;
  addCase(
    `v6-ghost-leading-${String(index + 1).padStart(2, "0")}`,
    "grammar-ghost-decoration-v6",
    true,
    Boolean(findGrammarKeypointNonexistentLabel([ghost], markedExpressions)),
    ghost,
    "Only punctuation, symbols, numbers, marks, or Cf decoration precedes nonexistent label (J); it is an unambiguous leading ghost anchor.",
  );

  const prose = `실제 설명 문장에서는 장식 예시 ${prefix}(J)를 본문 중간 표기로 언급한다.`;
  addCase(
    `v6-ghost-prose-${String(index + 1).padStart(2, "0")}`,
    "grammar-ghost-decoration-v6",
    false,
    Boolean(findGrammarKeypointNonexistentLabel([prose], markedExpressions)),
    prose,
    "The same decorated (J) follows substantive prose and is not a leading keyPoint label, so the ghost detector must abstain.",
  );
});

// ---------------------------------------------------------------------------
// 4. Terminology register: new explicit linguistic uses of 계사 versus new,
// disambiguated lexical/calendar collisions.
// ---------------------------------------------------------------------------

const terminologyPositives = [
  "학생 해설에 ‘계사’라는 문법학 용어가 그대로 남아 있다.",
  "이 문장은 be동사를 계사로 분류하는 전문 이론을 소개한다.",
  "계사라는 명칭은 학교 문법의 be동사 설명보다 전문적이다.",
  "교사용 분석에서 사용한 계사 개념을 학생 답지에서는 풀어 써야 한다.",
  "연결 기능을 계사 기능이라고만 적으면 학습자에게 불친절하다.",
  "계사 구문이라는 연구 용어 대신 실제 동사 형태를 제시한다.",
  "해설의 계사 범주 언급은 정답 판단에 필요하지 않다.",
  "계사 구조 분석을 중학생용 설명으로 바꾸어야 한다.",
  "계사 생략이라는 전문 표현을 구체적인 생략 현상으로 설명한다.",
  "계사적 용법이라는 말만으로는 학생이 오류를 찾기 어렵다.",
  "계사성에 관한 논의는 교사 참고 자료로 옮긴다.",
  "계사화라는 분석어를 학생용 핵심 포인트에서 제거한다.",
  "계사형 분류보다 문장에 나타난 be동사를 직접 보여 준다.",
  "계사구라는 용어는 학교 시험 해설에 지나치게 압축적이다.",
  "계사 체계에 기대는 설명을 쉬운 연결동사 표현으로 고친다.",
  "언어학자가 말하는 계사류를 학생에게 암기시키지 않는다.",
];

terminologyPositives.forEach((input, index) => {
  addCase(
    `v6-terminology-specialist-${String(index + 1).padStart(2, "0")}`,
    "grammar-terminology-v6",
    true,
    Boolean(findGrammarTerminologyRegister(input)),
    input,
    "Context explicitly fixes 계사 or its derivative as a linguistic classification, so the specialist-register finding is required.",
  );
});

const terminologyNegatives = [
  "공인회계사협회가 새 윤리 지침을 발표했다.",
  "회계사시험 일정이 공식 누리집에 게시되었다.",
  "세계사전시 해설판이 두 언어로 제작되었다.",
  "세계사연표를 보며 주요 사건의 순서를 익혔다.",
  "통계사례 분석 결과가 정책 보고서에 실렸다.",
  "통계사전에서 새로운 지표의 정의를 찾아보았다.",
  "설계사업 책임자가 공사 일정을 다시 조정했다.",
  "설계사례 모음에는 친환경 건물 도면이 포함되었다.",
  "기계사용 지침을 읽고 보호 장비를 착용했다.",
  "기계사양 표에 전력 소비량이 자세히 적혀 있다.",
  "관계사례 연구는 조직 내 갈등을 다룬다.",
  "인간관계사전에는 의사소통 용어가 정리되어 있다.",
  "계사년생의 가족 기록을 족보에서 확인했다.",
  "계사월주 표기를 전통 달력과 대조했다.",
  "계사일주 계산법을 역사 자료에 적용했다.",
  "계사시주 기록은 옛 문서의 시간 표기다.",
];

terminologyNegatives.forEach((input, index) => {
  addCase(
    `v6-terminology-lexical-${String(index + 1).padStart(2, "0")}`,
    "grammar-terminology-v6",
    false,
    Boolean(findGrammarTerminologyRegister(input)),
    input,
    "The overlapping characters belong to a disambiguated ordinary compound or explicit sexagenary-calendar form, not the linguistic specialist term 계사.",
  );
});

// ---------------------------------------------------------------------------
// 5. Residual punctuation: 16 new exact transformed answers and 16 minimal
// punctuation/grapheme mutations that must remain distinct.
// ---------------------------------------------------------------------------

const residualPairs: Array<[correct: string, mutation: string]> = [
  ["scope, scale, and sequence", "scope; scale, and sequence"],
  ["reader/writer contract", "reader|writer contract"],
  ["care & maintenance plan", "care + maintenance plan"],
  ["policy (not preference)", "policy [not preference)"],
  ["finding: limited access", "finding; limited access"],
  ["U.K. standard", "U-K. standard"],
  ["recall; precision tradeoff", "recall: precision tradeoff"],
  ["theory + evidence", "theory & evidence"],
  ["stimulus→response link", "stimulus←response link"],
  ["pass/fail threshold", "pass-fail threshold"],
  ["5:4 split", "5;4 split"],
  ["factor(s) interact", "factor[s) interact"],
  ["“civic duty”", "‘civic duty”"],
  ["L/M/N model", "L/M-X model"],
  ["case_id field", "case-id field"],
  ["R&D review", "R+D review"],
];

residualPairs.forEach(([correct, mutation], index) => {
  const exactCarrier =
    `The memorandum visibly states ${correct}. Its broader conclusion is _____.`;
  addCase(
    `v6-residual-exact-${String(index + 1).padStart(2, "0")}`,
    "blank-residual-punctuation-v6",
    true,
    residualHasFatal(exactCarrier, correct),
    JSON.stringify({ correctText: correct, passageWithBlank: exactCarrier }),
    "The full transformed answer is visibly copyable with all meaningful punctuation preserved; residual-answer fatal is mandatory.",
  );

  const mutationCarrier =
    `The memorandum visibly states ${mutation}. Its broader conclusion is _____.`;
  addCase(
    `v6-residual-mutated-${String(index + 1).padStart(2, "0")}`,
    "blank-residual-punctuation-v6",
    false,
    residualHasFatal(mutationCarrier, correct),
    JSON.stringify({ correctText: correct, passageWithBlank: mutationCarrier }),
    "The visible phrase differs by meaningful punctuation or one grapheme, so the exact transformed-answer residual detector must abstain.",
  );
});

// ---------------------------------------------------------------------------
// 6. Sentence-order Cf: select the next 16 runtime property members after the
// 16 post-v4 members consumed by v5. Each gets empty and visible metamorphs.
// ---------------------------------------------------------------------------

const v4CfCodePoints = new Set([
  0x00ad, 0x0600, 0x0601, 0x0602, 0x0603, 0x0604, 0x0605, 0x061c, 0x06dd,
  0x070f, 0x0890, 0x0891, 0x08e2, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e,
  0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0x2061, 0x2062,
  0x2063, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0x206a, 0x206b, 0x206c,
  0x206d, 0x206e, 0x206f, 0xfeff, 0xfff9, 0xfffa, 0xfffb, 0x110bd, 0x110cd,
  0x13430, 0x13431, 0x13432, 0x13433, 0x13434, 0x1bca0, 0x1bca1, 0x1bca2,
  0x1bca3, 0x1d173, 0x1d174, 0x1d175, 0x1d176, 0x1d177, 0x1d178, 0x1d179,
  0x1d17a, 0xe0001, 0xe0020, 0xe007f,
]);

const postV4CfCodePoints: number[] = [];
for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
  if (v4CfCodePoints.has(codePoint)) continue;
  if (/^\p{Cf}$/u.test(String.fromCodePoint(codePoint))) {
    postV4CfCodePoints.push(codePoint);
  }
}
const v5CfCodePoints = postV4CfCodePoints.slice(0, 16);
const selectedCfCodePoints = postV4CfCodePoints.slice(16, 32);
assert.equal(selectedCfCodePoints.length, 16);
assert.ok(selectedCfCodePoints.every((codePoint) => !v5CfCodePoints.includes(codePoint)));

selectedCfCodePoints.forEach((codePoint) => {
  const char = String.fromCodePoint(codePoint);
  const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
  const emptyOnly = ` \r${char}\r `;
  addCase(
    `v6-cf-empty-u${hex}`,
    "sentence-order-cf-v6",
    true,
    paragraphHasEmptyFatal(emptyOnly),
    emptyOnly,
    "Removing the newly selected Cf member and surrounding whitespace leaves no visible paragraph content; empty-paragraph fatal is mandatory.",
    `paragraph.text=" \\r\\u{${hex}}\\r "`,
  );

  const visible =
    `Readers${char} can still see every substantive word in this sentence. Another complete sentence confirms that the paragraph contains real prose.`;
  addCase(
    `v6-cf-visible-u${hex}`,
    "sentence-order-cf-v6",
    false,
    paragraphHasEmptyFatal(visible),
    visible,
    "Removing the embedded Cf member leaves two complete visible prose sentences, so the paragraph is structurally nonempty.",
    `paragraph.text="Readers\\u{${hex}} can still see every substantive word in this sentence. Another complete sentence confirms that the paragraph contains real prose."`,
  );
});

const ambiguityExclusions = [
  {
    id: "exclude-summary-evidence-method",
    family: "summary-evidence-source-v6",
    candidate: "본문을 근거로 답을 확인한 뒤 (A), (B)를 완성하시오.",
    reason: "Checking evidence describes a solution method and does not unambiguously request a second scored response.",
  },
  {
    id: "exclude-summary-unsupported-pair-pronoun",
    family: "summary-evidence-source-v6",
    candidate: "(A), (B)를 채우고 근거 없는 것은 제외하시오.",
    reason: "것 may refer to a summary pair or to a separate statement, so the answer object is not syntactically fixed.",
  },
  {
    id: "exclude-circled-nominal-fragments",
    family: "blank-circled-role-v6",
    candidate: "① 정답 근거 ② 오답 이유",
    reason: "Bare nominal fragments lack both finite option verdicts and narrative discourse predicates, leaving marker role indeterminate.",
  },
  {
    id: "exclude-circled-single-marker",
    family: "blank-circled-role-v6",
    candidate: "① 우선 문맥을 읽는다.",
    reason: "One marker cannot satisfy the two-marker narrative fatal threshold and does not test the intended split.",
  },
  {
    id: "exclude-ghost-roman-letter",
    family: "grammar-ghost-decoration-v6",
    candidate: "I (J) 관계사를 확인한다.",
    reason: "I can be English prose or a Roman-numeral list marker, so the prefix is not an unambiguous decoration-only control.",
  },
  {
    id: "exclude-ghost-quoted-heading",
    family: "grammar-ghost-decoration-v6",
    candidate: "‘(J) 관계사’라는 제목을 검토한다.",
    reason: "The quoted text could be a discussed heading or an actual keyPoint anchor; the structural role is not fixed.",
  },
  {
    id: "exclude-term-bare-calendar-stem",
    family: "grammar-terminology-v6",
    candidate: "오늘은 계사에 해당한다.",
    reason: "Without an explicit 년/월/일/시 suffix or linguistic context, 계사 may be a calendar stem or the grammar term.",
  },
  {
    id: "exclude-term-relative-standard",
    family: "grammar-terminology-v6",
    candidate: "관계사 용법을 설명한다.",
    reason: "관계사 is a legitimate school-grammar term containing the same character sequence and tests policy scope, not the 계사 boundary.",
  },
  {
    id: "exclude-residual-apostrophe-equivalence",
    family: "blank-residual-punctuation-v6",
    candidate: "students’ duty vs students' duty",
    reason: "Curly and ASCII apostrophes are intentionally normalized as equivalent and cannot serve as strict negative controls.",
  },
  {
    id: "exclude-residual-slash-spacing",
    family: "blank-residual-punctuation-v6",
    candidate: "input/output vs input / output",
    reason: "The contract does not establish slash-adjacent whitespace as semantic, so assigning either polarity would be oracle speculation.",
  },
  {
    id: "exclude-cf-tag-in-broken-word",
    family: "sentence-order-cf-v6",
    candidate: "one lexical fragment split only by a tag character",
    reason: "A malformed fragment does not establish substantive paragraph content even if some visible letters remain.",
  },
  {
    id: "exclude-cf-punctuation-only",
    family: "sentence-order-cf-v6",
    candidate: "Cf plus visible punctuation but no words",
    reason: "Visible punctuation alone is not a sentence-order paragraph, so nonempty glyph presence is insufficient for a negative oracle.",
  },
];

const categories = [...new Set(cases.map((item) => item.category))];
assert.equal(categories.length, 6);
assert.equal(cases.length, 192);
assert.ok(cases.length >= 160);
assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
assert.equal(new Set(cases.map((item) => item.input)).size, cases.length);
assert.ok(cases.every((item) => item.id.startsWith("v6-")));
assert.ok(cases.every((item) => !item.id.startsWith("v4-") && !item.id.startsWith("v5-")));
assert.equal(new Set(ambiguityExclusions.map((item) => item.id)).size, ambiguityExclusions.length);
assert.ok(ambiguityExclusions.every((item) => item.reason.length >= 40));

const priorAuditSource = [
  readFileSync(path.join(v4Dir, "audit.mts"), "utf8"),
  readFileSync(path.join(v5Dir, "audit.mts"), "utf8"),
].join("\n");
const priorAuditLiteralCollisionIds = cases
  .filter((item) => priorAuditSource.includes(item.input))
  .map((item) => item.id);
assert.deepEqual(priorAuditLiteralCollisionIds, []);

const categorySummary = Object.fromEntries(
  categories.map((category) => {
    const categoryCases = cases.filter((item) => item.category === category);
    const expectedPositive = categoryCases.filter((item) => item.expected).length;
    const expectedNegative = categoryCases.length - expectedPositive;
    assert.equal(categoryCases.length, 32, `${category} must have 32 holdouts`);
    assert.equal(expectedPositive, 16, `${category} must have 16 positive controls`);
    assert.equal(expectedNegative, 16, `${category} must have 16 negative controls`);
    return [
      category,
      {
        total: categoryCases.length,
        pass: categoryCases.filter((item) => item.pass).length,
        fail: categoryCases.filter((item) => !item.pass).length,
        expectedPositive,
        expectedNegative,
        observedPositive: categoryCases.filter((item) => item.observed).length,
        observedNegative: categoryCases.filter((item) => !item.observed).length,
      },
    ];
  }),
);

const positiveControls = cases.filter((item) => item.expected).length;
const negativeControls = cases.length - positiveControls;
assert.equal(positiveControls, 96);
assert.equal(negativeControls, 96);

const holdoutFailures = cases.filter((item) => !item.pass);
const failures = [
  ...v5Replay.failures.map((failure) => ({
    source: "v5-semantic-replay",
    ...failure,
    displayInput: failure.displayInput ?? failure.input,
  })),
  ...holdoutFailures.map(
    ({ id, category, expected, observed, input, displayInput, oracle }) => ({
      source: "v6-holdout",
      id,
      category,
      expected,
      observed,
      input,
      displayInput,
      oracle,
    }),
  ),
];

const auditedSourceAndTestPaths = [
  "src/lib/question-quality/index.ts",
  "src/lib/question-quality/core.ts",
  "src/lib/question-quality/dispatcher.ts",
  "src/lib/question-quality/validators/summary/mc.ts",
  "src/lib/question-quality/validators/blank/inference.ts",
  "src/lib/question-quality/validators/grammar/shared.ts",
  "src/lib/question-quality/validators/sentence-order.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
  "tests/unit/sentence-order-quality.test.mjs",
  "tests/unit/summary-mc-direction-split.test.mjs",
  "tests/unit/blank-explanation-step-numbering.test.mjs",
  "tests/unit/question-validity-invariants.test.mjs",
  "tests/unit/grammar-keypoint-core10.test.mjs",
  "tests/unit/grammar-killer-overdrilled.test.mjs",
  "tests/unit/summary-mc-collocation-severity-split.test.mjs",
];
const auditedSourceAndTestSha256 = Object.fromEntries(
  auditedSourceAndTestPaths.map((relativePath) => [relativePath, fileSha(relativePath)]),
);

const frozenArtifactNames = [
  "AUDIT.md",
  "RESULTS.json",
  "audit.mts",
  "verify.mjs",
  "MANIFEST.sha256",
];
const frozenV4ArtifactSha256 = directoryHashes(v4Dir, frozenArtifactNames);
const frozenV5ArtifactSha256 = directoryHashes(v5Dir, frozenArtifactNames);

const result = {
  schemaVersion: 1,
  auditDateKst: "2026-07-15",
  auditKind: "deterministic-splits-remediation-reaudit-v6",
  verdict: failures.length === 0 ? "PASS" : "BLOCK",
  summary: {
    total: v5Replay.summary.total + cases.length,
    pass: v5Replay.summary.pass + cases.length - holdoutFailures.length,
    fail: failures.length,
    v5SemanticReplay: {
      total: v5Replay.summary.total,
      pass: v5Replay.summary.pass,
      fail: v5Replay.summary.fail,
      verdict: v5Replay.verdict,
      failedCaseIds: v5Replay.summary.failedCaseIds,
    },
    newHoldout: {
      total: cases.length,
      pass: cases.length - holdoutFailures.length,
      fail: holdoutFailures.length,
      minimumRequired: 160,
      categories: categorySummary,
      controlBalance: { positive: positiveControls, negative: negativeControls },
      generatedFreshCfCount: selectedCfCodePoints.length,
      postV4CfPoolCount: postV4CfCodePoints.length,
      ambiguityExclusionCount: ambiguityExclusions.length,
    },
    failedCaseIds: failures.map((failure) => failure.id),
  },
  oraclePolicy: {
    mismatchRule: "Any expected/observed mismatch blocks; no warning credit, tolerance, majority vote, or oracle relaxation is permitted.",
    positiveDefinition: "A positive control unambiguously requires the named deterministic detector/fatal.",
    negativeDefinition: "A negative control is an explicit boundary neighbor for which that detector/fatal must abstain.",
    balance: "Exactly 16 positive and 16 negative controls per family; 96/96 overall.",
    ambiguityExclusions,
  },
  novelty: {
    frozenV5ReplayCaseCount: v5Replay.summary.total,
    newCaseCount: cases.length,
    allIdsUseV6Namespace: true,
    uniqueIdCount: new Set(cases.map((item) => item.id)).size,
    uniqueInputCount: new Set(cases.map((item) => item.input)).size,
    priorAuditLiteralCollisionIds,
    cfOverlapWithV5Count: selectedCfCodePoints.filter((codePoint) =>
      v5CfCodePoints.includes(codePoint),
    ).length,
    newCaseIdsSha256: sha256(JSON.stringify(cases.map((item) => item.id))),
    newInputsSha256: sha256(JSON.stringify(cases.map((item) => item.input))),
    passedCaseIdsSha256: sha256(
      JSON.stringify(cases.filter((item) => item.pass).map((item) => item.id)),
    ),
  },
  safety: {
    modelApiCalls: 0,
    browserCalls: 0,
    networkCalls: 0,
    databaseReads: 0,
    databaseWrites: 0,
    productionEdits: 0,
    existingTestEdits: 0,
  },
  provenance: {
    auditScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    v5ReplayHarnessSha256: fileSha(
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v5/audit.mts",
    ),
    v5ReplayHarnessReportedSha256: v5Replay.provenance.auditScriptSha256,
    frozenV4ArtifactSha256,
    frozenV5ArtifactSha256,
    auditedSourceAndTestSha256,
  },
  failures,
};

assert.equal(result.summary.total, result.summary.pass + result.summary.fail);
assert.equal(result.summary.fail, result.failures.length);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
