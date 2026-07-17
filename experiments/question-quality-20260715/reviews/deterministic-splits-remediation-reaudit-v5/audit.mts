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
const v4Dir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v4",
);
const v4HarnessPath = path.join(v4Dir, "audit.mts");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const qualityRuntime =
  (quality as unknown as { default?: typeof quality }).default ?? quality;
const grammarRuntime =
  (grammarShared as unknown as { default?: typeof grammarShared }).default ?? grammarShared;
const { validateQuestionQuality } = qualityRuntime;
const { findGrammarKeypointNonexistentLabel, findGrammarTerminologyRegister } =
  grammarRuntime;

type PriorFailure = {
  id: string;
  category: string;
  expected: boolean;
  observed: boolean;
  input: string;
};

type V4Replay = {
  verdict: "PASS" | "BLOCK";
  summary: {
    total: number;
    pass: number;
    fail: number;
    failedCaseIds: string[];
    base242: { total: number; pass: number; fail: number };
    extra: {
      total: number;
      pass: number;
      fail: number;
      categories: Record<string, { total: number; pass: number; fail: number }>;
    };
  };
  failures: PriorFailure[];
  safety: Record<string, number>;
  provenance: { auditScriptSha256: string };
  policy: { inheritedViolations: string[] };
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

function hasCode(issues: Array<{ code: string }>, code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

const v4Replay = JSON.parse(
  execFileSync(process.execPath, [tsxCli, v4HarnessPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
) as V4Replay;

assert.equal(v4Replay.summary.total, 520, "frozen v4 replay must contain 520 cases");
assert.equal(v4Replay.summary.base242.total, 242);
assert.equal(v4Replay.summary.extra.total, 278);
assert.equal(v4Replay.failures.length, v4Replay.summary.fail);
assert.deepEqual(
  v4Replay.failures.map((failure) => failure.id),
  v4Replay.summary.failedCaseIds,
);
assert.deepEqual(v4Replay.policy.inheritedViolations, []);
for (const [name, count] of Object.entries(v4Replay.safety)) {
  assert.equal(count, 0, `v4 replay safety counter ${name} must remain zero`);
}
assert.equal(fileSha(
  "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v4/audit.mts",
), v4Replay.provenance.auditScriptSha256);

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
// Independent local fixtures. No production, existing-test, API, network, or
// database mutation is performed by this harness.
// ---------------------------------------------------------------------------

const summaryPassage =
  "Responsible teams compare independent evidence before choosing a policy. " +
  "Doing so limits the chance that one noisy observation controls the decision.";
const summaryBase = {
  direction: "Complete the summary by choosing the best words for (A) and (B).",
  summaryWithBlanks:
    "Teams reach more (A) decisions by comparing evidence, reducing dependence on (B) observations.",
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
    "Independent evidence supports reliable decisions and reduces reliance on noisy observations.",
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
    "People often assume that efficient communication depends only on transmitting more information.",
  paragraphs: [
    {
      label: "(A)",
      text:
        "Yet listeners must decide which details deserve attention during a complex exchange. Context and prior knowledge guide that judgment in practice.",
    },
    {
      label: "(B)",
      text:
        "Communication succeeds when speakers guide attention instead of adding disconnected facts. Relevance matters as much as the amount of information supplied.",
    },
    {
      label: "(C)",
      text:
        "A long message can obscure the central point it was meant to clarify. More content does not automatically create better understanding.",
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
// 1. Summary mixed-task split: 16 unmistakable independent second tasks and
// 16 summary-bound controls. Every string is new relative to frozen v4.
// ---------------------------------------------------------------------------

const mixedTaskDirections = [
  "Complete the summary at (A) and (B). In a separate response, choose the underlined phrase whose grammar is incorrect.",
  "Fill summary slots (A) and (B); then select the expression that fits the blank in the passage.",
  "Complete the summary for (A) and (B). Separately, supply the title that best represents the passage.",
  "Choose the pair for summary positions (A) and (B). Also identify the central idea of the passage.",
  "Finish the summary at (A) and (B), and in addition select the claim that is unsupported according to the passage.",
  "Complete summary labels (A) and (B). As another task, choose the sentence that is irrelevant to the flow.",
  "Fill (A) and (B) in the summary. In addition, determine where the given sentence should be inserted.",
  "Complete the summary with (A) and (B); independently arrange the following paragraphs in logical order.",
  "요약문의 (A)와 (B)를 완성하시오. 그리고 밑줄 친 어구 중 어법상 틀린 것을 찾으시오.",
  "요약문 (A), (B)에 알맞은 말을 넣은 뒤, 본문의 빈칸에 들어갈 별도의 어구를 고르시오.",
  "요약문의 (A)와 (B)를 채우시오. 아울러 글을 가장 잘 나타내는 제목을 고르시오.",
  "요약문 속 (A), (B)를 완성하고, 별도로 본문의 중심 생각을 찾으시오.",
  "요약문의 두 자리 (A), (B)를 채우시오. 그와 별개로, 글의 내용에 근거하지 않은 주장을 고르시오.",
  "요약문 (A)와 (B)를 완성하시오. 이와 별도로 글의 흐름과 관계없는 문장을 고르시오.",
  "요약문의 (A), (B)에 단어를 넣고, 또한 주어진 문장이 삽입될 위치를 정하시오.",
  "요약문 (A)와 (B)를 채운 후, 마지막으로 단락의 논리적 순서를 배열하시오.",
];

mixedTaskDirections.forEach((direction, index) => {
  addCase(
    `v5-summary-mixed-${String(index + 1).padStart(2, "0")}`,
    "summary-mixed-task-v5",
    true,
    directionHasFatal(direction),
    direction,
    "The direction explicitly assigns a second response object outside summary slots (A)/(B); the mismatch fatal is mandatory.",
  );
});

const summaryBoundDirections = [
  "Complete the summary by choosing one paired option for the labeled positions (A) and (B).",
  "Fill (A) and (B) in the summary with the pair that keeps the completed sentence grammatical.",
  "For this summary alone, select the two expressions assigned to blanks (A) and (B).",
  "Choose the option pair that completes both summary markers, (A) and (B), in context.",
  "Supply words for (A) and (B) so that the resulting summary is accurate and grammatical.",
  "Finish the one-sentence summary by placing the appropriate entries at (A) and (B).",
  "Read the summary and choose the paired values that belong in its slots (A) and (B).",
  "Select a single option whose two values complete summary positions (A) and (B).",
  "요약문에 표시된 (A)와 (B)를 하나의 적절한 단어 쌍으로 완성하시오.",
  "다음 요약문의 두 빈자리 (A), (B)에 들어갈 짝을 고르시오.",
  "요약문 (A)와 (B)에 각각 문맥상 자연스러운 단어를 배치하시오.",
  "하나의 선택지에서 두 값을 골라 요약문의 (A), (B)를 채우시오.",
  "요약 내용이 정확해지도록 (A)와 (B)에 알맞은 표현 쌍을 넣으시오.",
  "요약문의 문법과 의미가 모두 자연스럽도록 (A), (B)의 단어 쌍을 고르시오.",
  "표시된 요약 위치 (A) 및 (B)를 완성하는 한 쌍의 답을 선택하시오.",
  "아래 요약문만을 대상으로 (A), (B)에 가장 적절한 두 표현을 넣으시오.",
];

summaryBoundDirections.forEach((direction, index) => {
  addCase(
    `v5-summary-bound-${String(index + 1).padStart(2, "0")}`,
    "summary-mixed-task-v5",
    false,
    directionHasFatal(direction),
    direction,
    "Every requested choice is bound to the two labeled summary slots; no independent task object exists.",
  );
});

// ---------------------------------------------------------------------------
// 2. Blank circled-number role split: finite option verdicts are legitimate;
// circled procedural steps are fatal. The two sets are syntactically explicit.
// ---------------------------------------------------------------------------

const terminalVerdicts = [
  "오답으로 분류된다",
  "오답으로 간주된다",
  "오답에 해당한다",
  "오답이라고 인정된다",
  "오답으로 봐야 한다",
  "오답으로 보아야 한다",
  "오답으로 처리해야 한다",
  "오답으로 분류해야 한다",
  "오답이라고 볼 수 있다",
  "오답이라고 판단할 수 있다",
  "오답이라고 인정할 수 있다",
  "부적절하다고 볼 수 있다",
  "부적절하다",
  "부적절합니다",
  "소거된다",
  "제외한다",
];

function finiteOptionExplanation(verdict: string): string {
  return [
    `① 우선 첫 번째 선택지는 지문의 범위를 과도하게 넓혀 ${verdict}.`,
    `② 이어서 두 번째 선택지는 원인과 결과를 뒤바꾸어 ${verdict}.`,
    `③ 마지막으로 세 번째 선택지는 핵심 조건을 누락해 ${verdict}.`,
  ].join(" ");
}

terminalVerdicts.forEach((verdict, index) => {
  const explanation = finiteOptionExplanation(verdict);
  addCase(
    `v5-circled-finite-${String(index + 1).padStart(2, "0")}`,
    "blank-circled-role-v5",
    false,
    explanationHasFatal(explanation),
    explanation,
    "Each marker heads an explicit finite verdict about a numbered option, so the markers are option references rather than discourse numbering.",
  );
});

const narrativeStepTriples = [
  ["문제의 조건을 확인한다", "근거 문장을 대조한다", "답을 고르는 절차를 정리한다"],
  ["빈칸 앞뒤 문맥을 읽는다", "반복되는 핵심어를 표시한다", "전체 논리를 한 문장으로 묶는다"],
  ["지문의 주장을 찾는다", "세부 근거를 분류한다", "결론과 연결되는 흐름을 적는다"],
  ["첫 문단의 역할을 파악한다", "전환 표현을 살핀다", "마지막 문단의 기능을 확인한다"],
  ["질문이 요구하는 범위를 정한다", "관련 문장을 모은다", "불필요한 정보를 덜어 낸다"],
  ["핵심 개념에 표시한다", "개념 사이 관계를 그린다", "해석 순서를 다시 확인한다"],
  ["주어진 정보를 목록으로 만든다", "정보의 우선순위를 매긴다", "최종 판단 과정을 기록한다"],
  ["문장 구조를 나눈다", "접속어가 잇는 관계를 본다", "전체 의미를 자연스럽게 연결한다"],
  ["화자의 관점을 확인한다", "반대 사례를 검토한다", "주장의 한계를 요약한다"],
  ["원인에 해당하는 문장을 찾는다", "결과를 설명하는 문장을 찾는다", "두 문장의 방향을 비교한다"],
  ["시간 순서를 표시한다", "사건 사이 간격을 확인한다", "변화 과정을 간단히 정리한다"],
  ["공통된 특징을 찾는다", "서로 다른 특징을 나눈다", "비교 결과를 표로 정리한다"],
  ["예시가 설명하는 개념을 찾는다", "예시와 원칙을 연결한다", "일반화 가능한 범위를 확인한다"],
  ["낯선 표현의 문맥을 읽는다", "주변 단어의 의미를 대조한다", "가능한 해석을 하나로 좁힌다"],
  ["문단별 중심 문장을 고른다", "중심 문장끼리 연결한다", "글 전체의 전개를 요약한다"],
  ["질문의 핵심 명사를 표시한다", "지문에서 대응 표현을 찾는다", "두 표현의 의미 차이를 설명한다"],
];

narrativeStepTriples.forEach(([first, second, third], index) => {
  const explanation =
    `① 먼저 ${first}. ② 이어서 ${second}. ③ 마지막으로 ${third}.`;
  addCase(
    `v5-circled-procedure-${String(index + 1).padStart(2, "0")}`,
    "blank-circled-role-v5",
    true,
    explanationHasFatal(explanation),
    explanation,
    "The circled digits enumerate solution procedure steps and contain no option-specific verdict; two or more such markers require the narrative-numbering fatal.",
  );
});

// ---------------------------------------------------------------------------
// 3. Grammar ghost labels: 16 Unicode/Markdown decoration prefixes and exact
// metamorphic controls formed by adding real prose before the same prefix.
// ---------------------------------------------------------------------------

const decorativePrefixes = [
  "\u2060➤ ",
  "🟣 ",
  "☐ ",
  "❖ ",
  "⌁ ",
  "§ ",
  "¶ ",
  "⁂ ",
  "➊ ",
  "❯❯ ",
  "``` ",
  "__②__ ",
  "2) ▸ ",
  "[ ] → ",
  "🧭️ ",
  "\u034F\u200D★ ",
];

decorativePrefixes.forEach((prefix, index) => {
  const ghost = `${prefix}(H) 분사 형태가 문맥에 맞는지 확인한다.`;
  addCase(
    `v5-ghost-leading-${String(index + 1).padStart(2, "0")}`,
    "grammar-ghost-decoration-v5",
    true,
    Boolean(findGrammarKeypointNonexistentLabel([ghost], markedExpressions)),
    ghost,
    "Only Unicode/Markdown decoration precedes the leading (H), which is absent from rendered labels (A)-(C); this is an unambiguous ghost reference.",
  );

  const prose = `해설 본문에서는 예시 기호 ${prefix}(H)를 단순 표기로만 언급한다.`;
  addCase(
    `v5-ghost-prose-${String(index + 1).padStart(2, "0")}`,
    "grammar-ghost-decoration-v5",
    false,
    Boolean(findGrammarKeypointNonexistentLabel([prose], markedExpressions)),
    prose,
    "The identical decorated (H) occurs after substantive prose and is not a leading keyPoint anchor.",
  );
});

// ---------------------------------------------------------------------------
// 4. Grammar terminology: explicit specialist uses of 계사 versus ordinary
// lexical/calendar collisions. Context fixes the intended sense in every case.
// ---------------------------------------------------------------------------

const terminologyPositives = [
  "이 해설은 be동사를 ‘계사’라고 부르므로 학생용 표현으로 바꿔야 한다.",
  "문법학의 계사 개념을 그대로 제시하면 중등 학습자에게 지나치게 전문적이다.",
  "교사용 주석의 계사 분류를 학생 해설에 복사하지 않는다.",
  "여기서 계사란 주어와 보어를 잇는 형식을 가리키는 전문 명칭이다.",
  "해설에 적힌 ‘계사 기능’은 ‘be동사의 연결 기능’으로 풀어 쓴다.",
  "계사 분석이라는 연구자용 표현 대신 익숙한 학교 문법을 사용한다.",
  "이 문장은 계사 구조라는 전문 분류를 학생에게 직접 요구한다.",
  "계사 범주를 언급한 문장을 학습자 친화적으로 고친다.",
  "‘계사 생략’이라는 용어는 구체적인 동사 생략 설명으로 대체한다.",
  "계사적 성질이라는 표현만으로는 학생이 판단 기준을 알기 어렵다.",
  "해설자가 계사류라는 분류명을 사용해 불필요하게 난도를 높였다.",
  "계사화 과정을 논하는 대목은 교사용 심화 설명에 가깝다.",
  "문법 연구에서 말하는 계사성은 학생용 정답 해설에 필요하지 않다.",
  "계사형이라는 표지는 실제 문장 속 be동사로 풀어 설명한다.",
  "이 문맥의 계사구 분석은 학교 시험 해설보다 전문적이다.",
  "계사 체계를 전제로 한 설명을 동사의 실제 쓰임 중심으로 바꾼다.",
];

terminologyPositives.forEach((input, index) => {
  addCase(
    `v5-terminology-specialist-${String(index + 1).padStart(2, "0")}`,
    "grammar-terminology-v5",
    true,
    Boolean(findGrammarTerminologyRegister(input)),
    input,
    "The sentence explicitly uses 계사 as a linguistic classification or a derived specialist term; the student-register finding is required.",
  );
});

const terminologyNegatives = [
  "그 공인회계사는 연말 보고서를 차분히 검토했다.",
  "회계사무소가 다음 달 도심으로 이전한다.",
  "세계사박물관은 고대 무역 전시를 새로 열었다.",
  "세계사 수업에서 산업 혁명의 배경을 배웠다.",
  "통계사업 예산이 올해 의회에서 승인되었다.",
  "통계사무국은 조사 결과를 다음 주 공개한다.",
  "설계사무소 직원들이 새 도서관 도면을 완성했다.",
  "설계사와 건축주가 창문의 위치를 함께 조정했다.",
  "기계산업 전시회에 여러 지역 기업이 참가했다.",
  "기계사고를 막기 위해 작업 전 점검을 실시했다.",
  "인간관계 사례를 읽고 갈등 해결 방식을 토론했다.",
  "관계사례 기록은 상담자의 비밀 유지 원칙을 따른다.",
  "계사년 달력 자료가 지역 박물관에 보관되어 있다.",
  "계사월 기록에는 당시의 강수량이 자세히 적혀 있다.",
  "계사일 표기를 현대 날짜로 환산하는 작업을 마쳤다.",
  "계사시 시각을 기준으로 옛 문서의 사건 순서를 정리했다.",
];

terminologyNegatives.forEach((input, index) => {
  addCase(
    `v5-terminology-lexical-${String(index + 1).padStart(2, "0")}`,
    "grammar-terminology-v5",
    false,
    Boolean(findGrammarTerminologyRegister(input)),
    input,
    "The apparent character overlap belongs to an ordinary profession/history/statistics/design/machinery word or an explicit sexagenary-calendar form, not the linguistic term 계사.",
  );
});

// ---------------------------------------------------------------------------
// 5. Transformed residual punctuation: exact visible answers versus minimal
// punctuation/grapheme mutations. Punctuation is semantic in this comparator.
// ---------------------------------------------------------------------------

const residualPairs: Array<[correct: string, mutation: string]> = [
  ["risk, evidence, and timing", "risk; evidence, and timing"],
  ["input/output balance", "input|output balance"],
  ["law & public trust", "law + public trust"],
  ["model (not measurement)", "model [not measurement)"],
  ["claim: bounded authority", "claim; bounded authority"],
  ["E.U. directive", "E-U. directive"],
  ["precision; recall", "precision: recall"],
  ["design + review", "design & review"],
  ["signal→response pattern", "signal←response pattern"],
  ["accept/reject decision", "accept-reject decision"],
  ["3:2 allocation", "3;2 allocation"],
  ["choice(s) remain", "choice[s) remain"],
  ["“shared space”", "‘shared space”"],
  ["X/Y/Z sequence", "X/Y-Q sequence"],
  ["audit_log entry", "audit-log entry"],
  ["Q&A protocol", "Q+A protocol"],
];

residualPairs.forEach(([correct, mutation], index) => {
  const exactCarrier =
    `The briefing explicitly prints ${correct}. Its main implication is _____.`;
  addCase(
    `v5-residual-exact-${String(index + 1).padStart(2, "0")}`,
    "blank-residual-punctuation-v5",
    true,
    residualHasFatal(exactCarrier, correct),
    JSON.stringify({ correctText: correct, passageWithBlank: exactCarrier }),
    "The complete transformed correct option remains exactly visible in the student carrier, including meaningful punctuation; answer-leak fatal is mandatory.",
  );

  const mutationCarrier =
    `The briefing explicitly prints ${mutation}. Its main implication is _____.`;
  addCase(
    `v5-residual-mutated-${String(index + 1).padStart(2, "0")}`,
    "blank-residual-punctuation-v5",
    false,
    residualHasFatal(mutationCarrier, correct),
    JSON.stringify({ correctText: correct, passageWithBlank: mutationCarrier }),
    "A minimal meaningful punctuation/grapheme mutation makes the visible phrase different from the transformed correct option; the exact residual detector must abstain.",
  );
});

// ---------------------------------------------------------------------------
// 6. Sentence-order Unicode Cf: property-selected code points absent from v4.
// Each code point has an empty-only positive and a visible-prose negative.
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
const selectedCfCodePoints = postV4CfCodePoints.slice(0, 16);
assert.equal(selectedCfCodePoints.length, 16);

selectedCfCodePoints.forEach((codePoint) => {
  const char = String.fromCodePoint(codePoint);
  const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
  const emptyOnly = `\t${char}\n`;
  addCase(
    `v5-cf-empty-u${hex}`,
    "sentence-order-cf-v5",
    true,
    paragraphHasEmptyFatal(emptyOnly),
    emptyOnly,
    "After removal of the property-selected Cf character and whitespace, no visible paragraph content remains; structural empty-paragraph fatal is mandatory.",
    `paragraph.text="\\t\\u{${hex}}\\n"`,
  );

  const visible =
    `Visible${char} words remain part of this complete sentence. A second sentence supplies enough substantive content for readers.`;
  addCase(
    `v5-cf-visible-u${hex}`,
    "sentence-order-cf-v5",
    false,
    paragraphHasEmptyFatal(visible),
    visible,
    "Removing the embedded Cf character leaves two complete visible prose sentences; the paragraph is not structurally empty.",
    `paragraph.text="Visible\\u{${hex}} words remain part of this complete sentence. A second sentence supplies enough substantive content for readers."`,
  );
});

// Candidate forms deliberately excluded before execution because their oracle
// would depend on pragmatics, target-scope interpretation, or a different gate.
const ambiguityExclusions = [
  {
    id: "exclude-summary-implied-response",
    family: "summary-mixed-task-v5",
    candidate: "Read the passage carefully and complete summary slots (A) and (B).",
    reason: "Reading is preparatory, not a separately scored response object, so treating it as a mixed task would be an oracle error.",
  },
  {
    id: "exclude-summary-vague-review",
    family: "summary-mixed-task-v5",
    candidate: "Complete (A) and (B), checking the passage as needed.",
    reason: "Checking the passage is an underspecified method rather than an independent task with its own answer.",
  },
  {
    id: "exclude-circled-bare-judgment",
    family: "blank-circled-role-v5",
    candidate: "① 판단을 검토한다. ② 근거를 검토한다.",
    reason: "Without a discourse cue or option object, the markers' syntactic role is genuinely underdetermined.",
  },
  {
    id: "exclude-circled-quoted-option-fragment",
    family: "blank-circled-role-v5",
    candidate: "① ‘durable constraints…’를 살핀다.",
    reason: "A truncated quotation could be either an option citation or a procedural note and does not reach the two-marker fatal threshold.",
  },
  {
    id: "exclude-ghost-single-letter-prose",
    family: "grammar-ghost-decoration-v5",
    candidate: "A (H) 분사 형태를 확인한다.",
    reason: "A can be either a Markdown list marker or English prose; the prefix role is ambiguous.",
  },
  {
    id: "exclude-ghost-parenthetical-discussion",
    family: "grammar-ghost-decoration-v5",
    candidate: "(H)는 왜 없는가?",
    reason: "The sentence could be a keyPoint anchor or a meta-level question about labels, so it is not a clean holdout oracle.",
  },
  {
    id: "exclude-term-relative",
    family: "grammar-terminology-v5",
    candidate: "관계사 설명을 고친다.",
    reason: "관계사 is itself a school-grammar term while also containing the character sequence 계사; it tests target policy scope, not the 계사 specialist boundary.",
  },
  {
    id: "exclude-term-proper-name",
    family: "grammar-terminology-v5",
    candidate: "계사 연구회가 모였다.",
    reason: "계사 may be a proper name or the linguistic term; context does not disambiguate the sense.",
  },
  {
    id: "exclude-residual-dash-equivalence",
    family: "blank-residual-punctuation-v5",
    candidate: "evidence-based vs evidence based",
    reason: "Whitespace and dash variants are intentionally normalization-equivalent, so they are not valid negative punctuation controls.",
  },
  {
    id: "exclude-residual-case-only",
    family: "blank-residual-punctuation-v5",
    candidate: "Public Trust vs public trust",
    reason: "Case folding is an explicit comparator invariant; using case-only change as a negative would weaken the established oracle.",
  },
  {
    id: "exclude-cf-emoji-only",
    family: "sentence-order-cf-v5",
    candidate: "emoji + variation selector only",
    reason: "A visible emoji is not normal paragraph prose, so nonempty code-point presence does not establish substantive sentence-order content.",
  },
  {
    id: "exclude-cf-combining-only",
    family: "sentence-order-cf-v5",
    candidate: "combining mark plus Cf with no base character",
    reason: "A dangling combining mark has uncertain rendered visibility and belongs to a grapheme-validity policy not this Cf-empty invariant.",
  },
];

const categories = [...new Set(cases.map((item) => item.category))];
assert.equal(categories.length, 6);
assert.equal(cases.length, 192);
assert.ok(cases.length >= 160);
assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
assert.equal(new Set(cases.map((item) => item.input)).size, cases.length);
assert.ok(cases.every((item) => item.id.startsWith("v5-")));
assert.equal(new Set(ambiguityExclusions.map((item) => item.id)).size, ambiguityExclusions.length);
assert.ok(ambiguityExclusions.every((item) => item.reason.length >= 40));

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
  ...v4Replay.failures.map((failure) => ({
    source: "v4-semantic-replay",
    ...failure,
    displayInput: failure.input,
  })),
  ...holdoutFailures.map(
    ({ id, category, expected, observed, input, displayInput, oracle }) => ({
      source: "v5-holdout",
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
const frozenV4ArtifactPaths = [
  "AUDIT.md",
  "RESULTS.json",
  "audit.mts",
  "verify.mjs",
  "MANIFEST.sha256",
];
const frozenV4ArtifactSha256 = Object.fromEntries(
  frozenV4ArtifactPaths.map((name) => [name, sha256(readFileSync(path.join(v4Dir, name)))]),
);

const result = {
  schemaVersion: 1,
  auditDateKst: "2026-07-15",
  auditKind: "deterministic-splits-remediation-reaudit-v5",
  verdict: failures.length === 0 ? "PASS" : "BLOCK",
  summary: {
    total: v4Replay.summary.total + cases.length,
    pass: v4Replay.summary.pass + cases.length - holdoutFailures.length,
    fail: failures.length,
    v4SemanticReplay: {
      total: v4Replay.summary.total,
      pass: v4Replay.summary.pass,
      fail: v4Replay.summary.fail,
      verdict: v4Replay.verdict,
      failedCaseIds: v4Replay.summary.failedCaseIds,
    },
    newHoldout: {
      total: cases.length,
      pass: cases.length - holdoutFailures.length,
      fail: holdoutFailures.length,
      minimumRequired: 160,
      categories: categorySummary,
      controlBalance: {
        positive: positiveControls,
        negative: negativeControls,
      },
      generatedPostV4CfCount: selectedCfCodePoints.length,
      postV4CfPoolCount: postV4CfCodePoints.length,
      ambiguityExclusionCount: ambiguityExclusions.length,
    },
    failedCaseIds: failures.map((failure) => failure.id),
  },
  oraclePolicy: {
    mismatchRule: "Any expected/observed mismatch is blocking; no warning credit, majority vote, or tolerated miss is allowed.",
    positiveDefinition: "A positive control unambiguously requires the named deterministic detector/fatal.",
    negativeDefinition: "A negative control is an explicit boundary neighbor for which that detector/fatal must abstain.",
    balance: "Exactly 16 positive and 16 negative controls per family; 96/96 overall.",
    ambiguityExclusions,
  },
  novelty: {
    frozenV4CaseCount: v4Replay.summary.total,
    newCaseCount: cases.length,
    allIdsUseV5Namespace: true,
    uniqueIdCount: new Set(cases.map((item) => item.id)).size,
    uniqueInputCount: new Set(cases.map((item) => item.input)).size,
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
    v4ReplayHarnessSha256: fileSha(
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v4/audit.mts",
    ),
    v4ReplayHarnessReportedSha256: v4Replay.provenance.auditScriptSha256,
    frozenV4ArtifactSha256,
    auditedSourceAndTestSha256,
  },
  failures,
};

assert.equal(result.summary.total, result.summary.pass + result.summary.fail);
assert.equal(result.summary.fail, result.failures.length);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
