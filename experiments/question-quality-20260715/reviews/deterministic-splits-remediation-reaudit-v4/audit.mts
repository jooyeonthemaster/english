import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as quality from "../../../../src/lib/question-quality/index";
import * as grammarShared from "../../../../src/lib/question-quality/validators/grammar/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const baseHarnessPath = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v3/audit.mts",
);
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const qualityRuntime =
  (quality as unknown as { default?: typeof quality }).default ?? quality;
const grammarRuntime =
  (grammarShared as unknown as { default?: typeof grammarShared }).default ?? grammarShared;
const { validateQuestionQuality } = qualityRuntime;
const { findGrammarKeypointNonexistentLabel, findGrammarTerminologyRegister } =
  grammarRuntime;

type AuditCase = {
  id: string;
  category: string;
  expected: boolean;
  observed: boolean;
  pass: boolean;
  input: string;
};

type BaseResult = {
  verdict: string;
  summary: { total: number; pass: number; fail: number; failedCaseIds: string[] };
  safety: Record<string, number>;
  provenance: {
    auditScriptSha256: string;
    auditedSourceAndTestSha256: Record<string, string>;
  };
  policy: { inheritedViolations: string[] };
  caseLedger: {
    baseAllCaseIdsSha256: string;
    basePassedCaseIdsSha256: string;
    extraAllCaseIdsSha256: string;
    extraPassedCaseIdsSha256: string;
  };
  failures: AuditCase[];
};

const base = JSON.parse(
  execFileSync(process.execPath, [tsxCli, baseHarnessPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
) as BaseResult;

const cases: AuditCase[] = [];

function addCase(
  id: string,
  category: string,
  expected: boolean,
  observed: boolean,
  input: string,
): void {
  cases.push({ id, category, expected, observed, pass: expected === observed, input });
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha(relativePath: string): string {
  return sha256(readFileSync(path.join(repoRoot, relativePath)));
}

function hasCode(issues: Array<{ code: string }>, code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

// ---------------------------------------------------------------------------
// Local fixtures. These are deliberately independent of root-owned tests.
// ---------------------------------------------------------------------------

const summaryPassage =
  "Careful teams compare independent measurements before making a decision. " +
  "This practice reduces the risk that one noisy result will determine the outcome.";
const summaryBase = {
  direction: "Complete the summary by choosing the best words for (A) and (B).",
  summaryWithBlanks:
    "Teams can make more (A) decisions by comparing measurements, thereby reducing reliance on (B) results.",
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
    "Independent measurements support reliable decisions and reduce reliance on noisy results.",
};

function directionHasFatal(direction: string): boolean {
  const issues = validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question: { ...summaryBase, direction },
    passage: summaryPassage,
    requestedDifficulty: "INTERMEDIATE",
  });
  return hasCode(issues, "summary-mc-direction-task-mismatch");
}

const blankBase = {
  difficulty: "INTERMEDIATE",
  blankAnswerMode: "PARAPHRASE",
  passageWithBlank:
    "Institutions often retain the effects of earlier choices. Their strongest long-term consequence is _____.",
  originalExpression: "lasting limits on how institutions can respond",
  answerLogic:
    "The answer restates the lasting institutional limits expressed in the source without copying them.",
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
      "Institutions often retain the effects of earlier choices, creating lasting limits on how institutions can respond.",
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
        "Yet listeners must also decide which details deserve attention during a complex exchange. That judgment depends on context, goals, and prior knowledge in the situation at hand.",
    },
    {
      label: "(B)",
      text:
        "Communication therefore succeeds when speakers deliberately guide attention instead of merely adding disconnected facts. Relevance matters as much as the total amount of information supplied to listeners.",
    },
    {
      label: "(C)",
      text:
        "A long message can consequently obscure the central point it was originally meant to clarify. More content does not automatically produce better understanding for attentive listeners in practice.",
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
  const issues = validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question: {
      ...sentenceOrderBase,
      paragraphs: sentenceOrderBase.paragraphs.map((paragraph, index) =>
        index === 1 ? { ...paragraph, text } : paragraph,
      ),
    },
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  });
  return hasCode(issues, "sentence-order-empty-paragraph");
}

const markedExpressions = [
  { label: "(A)", pointCode: "a" },
  { label: "(B)", pointCode: "b" },
  { label: "(C)", pointCode: "c" },
];

// ---------------------------------------------------------------------------
// 1. SUMMARY directions — summary-bound labels vs independent task objects.
// The bound forms are metamorphic restatements; the independent forms vary
// object and joiner so detection cannot depend on a finite separator list.
// ---------------------------------------------------------------------------

const validBoundDirections = [
  "Complete the summary at slots (A) and (B); select the grammatically sound pair assigned to those labels.",
  "Finish the summary for labels (A)/(B), choosing the option whose two entries are grammatical in context.",
  "Summarize the passage by filling (A) and (B), then pick the pair that makes both summary positions grammatical.",
  "For the summary's positions (A) and (B), choose the two words that complete its meaning and grammar.",
  "Complete the summary: decide which paired option belongs at labels (A) and (B).",
  "Fill summary labels (A), (B) with the contextually and grammatically appropriate pair.",
  "Choose the grammatically coherent entries for the summary markers (A) and (B).",
  "Supply the best pair for (A)/(B) in the summary, preserving grammatical agreement.",
  "다음 요약문의 (A)와 (B)에 문맥과 어법에 맞는 한 쌍을 넣으시오.",
  "요약문을 완성하도록 표시된 (A)/(B)에 가장 적절한 두 단어를 고르시오.",
  "요약의 두 자리 (A), (B)에 각각 어법상 자연스러운 선택지를 배치하시오.",
  "요약문 속 표지 (A) 및 (B)를 올바른 단어 쌍으로 채우시오.",
  "Complete this summary—place the matching option values into (A) and (B).",
  "Complete this summary / choose one pair for its labeled positions (A) and (B).",
  "Complete the summary while selecting the option values attached to (A) and (B).",
  "Complete the summary, and use the grammatically correct pair for its labels (A) and (B).",
];

validBoundDirections.forEach((direction, index) => {
  addCase(
    `v4-direction-bound-${String(index + 1).padStart(2, "0")}`,
    "summary-direction-v4",
    false,
    directionHasFatal(direction),
    direction,
  );
});

const independentTaskTails = [
  "decide which underlined clause is grammatically unacceptable.",
  "select the highlighted sentence that contains a grammar error.",
  "identify the boldfaced phrase that is grammatically incorrect.",
  "choose the numbered expression whose grammar is wrong.",
  "pick the words that belong in the blank in the paragraph.",
  "choose the heading that best captures the text.",
  "state the central idea of the passage.",
  "identify which claim is unsupported according to the passage.",
  "choose the numbered sentence that is irrelevant to the flow.",
  "determine where the supplied sentence should be inserted.",
  "arrange the following paragraphs into their logical order.",
  "identify what the highlighted pronoun refers to.",
  "select the contextually inappropriate highlighted word.",
  "choose the statement that contradicts the text.",
  "locate the sentence that disrupts the argument's coherence.",
  "write the best title for the reading passage.",
];
const independentJoiners = [
  " and also ",
  "; afterward, ",
  " — separately, ",
  " / independently, ",
  " while you also ",
  " (in addition, ",
];

independentTaskTails.forEach((tail, index) => {
  const joiner = independentJoiners[index % independentJoiners.length];
  const close = joiner.startsWith(" (") ? ")" : "";
  const direction = `Complete the summary for (A) and (B)${joiner}${tail}${close}`;
  addCase(
    `v4-direction-independent-en-${String(index + 1).padStart(2, "0")}`,
    "summary-direction-v4",
    true,
    directionHasFatal(direction),
    direction,
  );
});

const koreanIndependentDirections = [
  "요약문의 (A), (B)를 완성하고, 별도로 밑줄 친 절 가운데 어법상 틀린 것을 찾으시오.",
  "요약문의 (A), (B)를 완성한 뒤 강조된 문장 중 문법적으로 잘못된 것을 고르시오.",
  "요약문의 (A), (B)를 완성하는 것에 더하여 본문의 빈칸에 들어갈 별도의 어구를 고르시오.",
  "요약문의 (A), (B)를 완성하는 동시에 글을 가장 잘 나타내는 제목을 정하시오.",
  "요약문의 (A), (B)를 완성하고, 이와 별개로 본문의 중심 생각을 진술하시오.",
  "요약문의 (A), (B)를 완성한 다음 글의 내용과 모순되는 진술을 찾으시오.",
  "요약문의 (A), (B)를 완성할 뿐 아니라 흐름을 방해하는 문장도 고르시오.",
  "요약문의 (A), (B)를 완성하면서 주어진 문장이 삽입될 위치도 정하시오.",
  "요약문의 (A), (B)를 완성하고 이어질 단락의 논리적 순서를 별도로 배열하시오.",
  "요약문의 (A), (B)를 완성한 후 강조된 대명사가 가리키는 대상을 찾으시오.",
  "요약문의 (A), (B)를 완성하는 데 이어 문맥상 부적절한 강조 낱말을 고르시오.",
  "요약문의 (A), (B)를 완성하는 한편 본문에 근거하지 않은 주장을 고르시오.",
];

koreanIndependentDirections.forEach((direction, index) => {
  addCase(
    `v4-direction-independent-ko-${String(index + 1).padStart(2, "0")}`,
    "summary-direction-v4",
    true,
    directionHasFatal(direction),
    direction,
  );
});

// ---------------------------------------------------------------------------
// 2. CIRCLED explanations — finite terminal judgments vs attributive/meta
// minimal pairs. Each template is expanded to three markers to meet the fatal
// threshold; only discourse role changes between pair members.
// ---------------------------------------------------------------------------

const terminalVerdicts = [
  "오답이라고 판단한다",
  "오답으로 판단된다",
  "오답이라고 본다",
  "오답으로 보인다",
  "오답임이 분명하다",
  "오답으로 확정된다",
  "오답으로 인정된다",
  "오답이라고 결론짓는다",
  "오답임이 확실하다",
  "부적절하다고 판단한다",
  "오답으로 귀결된다",
  "오답이라고 판정한다",
];

function optionExplanation(verdict: string): string {
  return [
    `① 먼저 이 선지는 범위를 지나치게 넓힌 선택지이므로 ${verdict}.`,
    `② 다음으로 이 선지는 인과 방향을 뒤집은 선택지이므로 ${verdict}.`,
    "③ 마지막으로 이 선지는 지문의 결론과 정확히 일치하므로 정답이라고 판단한다.",
  ].join(" ");
}

terminalVerdicts.forEach((verdict, index) => {
  const explanation = optionExplanation(verdict);
  addCase(
    `v4-circled-terminal-${String(index + 1).padStart(2, "0")}`,
    "blank-circled-v4",
    false,
    explanationHasFatal(explanation),
    explanation,
  );
});

const metaAttributives = [
  "이 선지를 오답이라고 판단하는 이유를 확인한다",
  "이 선지가 오답으로 판단되는 근거를 검토한다",
  "이 선지를 오답이라고 보는 관점을 정리한다",
  "이 선지가 오답으로 보이는 단서를 찾는다",
  "이 선지가 오답임을 밝히는 절차를 따른다",
  "이 선지를 오답으로 확정하는 과정을 설명한다",
  "이 선지를 오답으로 인정하는 원칙을 적용한다",
  "이 선지를 오답이라고 결론짓는 단계를 살핀다",
  "이 선지가 오답인지 검토하는 쟁점을 제시한다",
  "이 선지가 부적절한지 따지는 질문을 던진다",
  "이 선지가 오답으로 귀결될 가능성을 검토한다",
  "이 선지를 오답이라고 판정할지 여부를 논의한다",
];

function metaExplanation(attribute: string): string {
  const first = attribute.replace(/^이 선지/, "첫 번째 선지");
  const second = attribute.replace(/^이 선지/, "두 번째 선지");
  const third = attribute.replace(/^이 선지/, "세 번째 선지");
  return [
    `① 먼저 ${first}.`,
    `② 다음으로 ${second}.`,
    `③ 마지막으로 ${third}.`,
  ].join(" ");
}

metaAttributives.forEach((attribute, index) => {
  const explanation = metaExplanation(attribute);
  addCase(
    `v4-circled-meta-${String(index + 1).padStart(2, "0")}`,
    "blank-circled-v4",
    true,
    explanationHasFatal(explanation),
    explanation,
  );
});

// ---------------------------------------------------------------------------
// 3. GHOST labels — arbitrary Unicode/Markdown decoration vs the same
// decoration preceded by prose. This is a true metamorphic minimal pair.
// ---------------------------------------------------------------------------

const decorativePrefixes = [
  "※ ", "☞ ", "▶ ", "◆ ", "◇ ", "🅐 ", "ⓐ ", "Ⓐ ", "㉠ ", "Ⅰ. ",
  "Ⅻ) ", "１． ", "①） ", "(가) ", "[가] ", "가、 ", ">> ", "### ",
  "- [x] ", "1. > ", "**①** ", "\u200B• ", "☑️ ", "📝 ",
];

decorativePrefixes.forEach((prefix, index) => {
  const ghost = `${prefix}(F) 분사 선택을 확인한다.`;
  const ghostFinding = findGrammarKeypointNonexistentLabel([ghost], markedExpressions);
  addCase(
    `v4-ghost-decoration-${String(index + 1).padStart(2, "0")}`,
    "grammar-ghost-v4",
    true,
    Boolean(ghostFinding),
    ghost,
  );

  const prose = `설명 문장 뒤의 예시 ${prefix}(F)는 실제 keyPoint 라벨이 아니다.`;
  const proseFinding = findGrammarKeypointNonexistentLabel([prose], markedExpressions);
  addCase(
    `v4-ghost-prose-${String(index + 1).padStart(2, "0")}`,
    "grammar-ghost-v4",
    false,
    Boolean(proseFinding),
    prose,
  );
});

// ---------------------------------------------------------------------------
// 4. RESIDUALS — exact punctuation-preserving positives and one-character or
// one-morpheme negatives, followed by intended normalization metamorphisms.
// ---------------------------------------------------------------------------

const residualPairs: Array<[exact: string, mutation: string]> = [
  ["evidence, context, and judgment", "evidence; context, and judgment"],
  ["cost/benefit analysis", "cost-benefit analysis"],
  ["research & development strategy", "research + development strategy"],
  ["evidence (not intuition)", "evidence [not intuition)"],
  ["principle: shared responsibility", "principle; shared responsibility"],
  ["U.S. policy", "U-S. policy"],
  ["speed; accuracy", "speed: accuracy"],
  ["theory + practice", "theory & practice"],
  ["cause→effect chain", "cause←effect chain"],
  ["yes/no answer", "yes-no answer"],
  ["2:1 ratio", "2;1 ratio"],
  ["word(s) choice", "word[s) choice"],
  ["“public art”", "‘public art”"],
  ["A/B/C framework", "A/B-D framework"],
  ["data_quality score", "data-quality score"],
  ["R&D investment", "R+D investment"],
  ["pros/cons table", "pros&cons table"],
  ["input—output relation", "input/output relation"],
];

residualPairs.forEach(([exact, mutation], index) => {
  const exactCarrier = `The report explicitly names ${exact}. Its governing idea is _____.`;
  addCase(
    `v4-residual-exact-${String(index + 1).padStart(2, "0")}`,
    "blank-residual-v4",
    true,
    residualHasFatal(exactCarrier, exact),
    `${exact} || ${exactCarrier}`,
  );

  const mutationCarrier = `The report explicitly names ${mutation}. Its governing idea is _____.`;
  addCase(
    `v4-residual-negative-${String(index + 1).padStart(2, "0")}`,
    "blank-residual-v4",
    false,
    residualHasFatal(mutationCarrier, exact),
    `${exact} != ${mutation}`,
  );
});

const residualEquivalences: Array<[correct: string, visible: string]> = [
  ["evidence-based reasoning", "evidence based reasoning"],
  ["evidence–based reasoning", "evidence—based reasoning"],
  ["students’ shared duty", "students' shared duty"],
  ["public art", "ｐｕｂｌｉｃ art"],
  ["careful team judgment", "careful\tteam\njudgment"],
  ["long-term planning", "long ‐ term planning"],
];

residualEquivalences.forEach(([correct, visible], index) => {
  const carrier = `The report explicitly names ${visible}. Its governing idea is _____.`;
  addCase(
    `v4-residual-equivalent-${String(index + 1).padStart(2, "0")}`,
    "blank-residual-v4",
    true,
    residualHasFatal(carrier, correct),
    `${correct} ~= ${visible}`,
  );
});

// ---------------------------------------------------------------------------
// 5. 계사 — standalone/specialist positives vs ordinary/calendar compounds.
// ---------------------------------------------------------------------------

const terminologyPositives = [
  "계사", "계사를", "계사로", "계사만", "계사도", "계사라는", "계사인지", "계사부터",
  "비계사문", "유사계사구문", "무계사절", "준계사동사", "영계사", "의사계사",
  "영(零)계사", "계사문", "계사구문", "계사절",
];

terminologyPositives.forEach((term, index) => {
  const input = `${term} 같은 전문 용어는 학생용 해설에서 피한다.`;
  addCase(
    `v4-terminology-positive-${String(index + 1).padStart(2, "0")}`,
    "grammar-terminology-v4",
    true,
    Boolean(findGrammarTerminologyRegister(input)),
    input,
  );
});

const terminologyNegatives = [
  "관계사", "회계사", "세계사", "통계사", "설계사", "중개사", "기계사", "공인회계사",
  "계사년", "계사월", "계사일", "계사시", "계사년생", "계사일주", "계사월주", "계사시주",
  "회계사법", "세계사책", "관계사절", "통계사료",
];

terminologyNegatives.forEach((term, index) => {
  const input = `${term}라는 일반·달력 어휘가 문장에 등장한다.`;
  addCase(
    `v4-terminology-negative-${String(index + 1).padStart(2, "0")}`,
    "grammar-terminology-v4",
    false,
    Boolean(findGrammarTerminologyRegister(input)),
    input,
  );
});

// ---------------------------------------------------------------------------
// 6. Unicode Cf — property-selected code points, not a hand-picked output
// whitelist. Every selected Cf must be empty alone and nonempty in visible prose.
// ---------------------------------------------------------------------------

const cfCandidates = [
  0x00ad, 0x0600, 0x0601, 0x0602, 0x0603, 0x0604, 0x0605, 0x061c, 0x06dd,
  0x070f, 0x0890, 0x0891, 0x08e2, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e,
  0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0x2061, 0x2062,
  0x2063, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0x206a, 0x206b, 0x206c,
  0x206d, 0x206e, 0x206f, 0xfeff, 0xfff9, 0xfffa, 0xfffb, 0x110bd, 0x110cd,
  0x13430, 0x13431, 0x13432, 0x13433, 0x13434, 0x1bca0, 0x1bca1, 0x1bca2,
  0x1bca3, 0x1d173, 0x1d174, 0x1d175, 0x1d176, 0x1d177, 0x1d178, 0x1d179,
  0x1d17a, 0xe0001, 0xe0020, 0xe007f,
];
const cfChars = cfCandidates
  .map((codePoint) => ({ codePoint, char: String.fromCodePoint(codePoint) }))
  .filter(({ char }) => /^\p{Cf}$/u.test(char));

cfChars.forEach(({ codePoint, char }) => {
  const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
  addCase(
    `v4-cf-empty-u${hex}`,
    "sentence-order-cf-v4",
    true,
    paragraphHasEmptyFatal(char),
    `U+${hex}`,
  );
});

cfChars.slice(0, 16).forEach(({ codePoint, char }) => {
  const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
  const visible = `Visible${char} words remain substantive in this complete sentence. A second sentence supplies enough meaningful content for readers.`;
  addCase(
    `v4-cf-visible-u${hex}`,
    "sentence-order-cf-v4",
    false,
    paragraphHasEmptyFatal(visible),
    `visible + U+${hex}`,
  );
});

const cfMixture = cfChars.map(({ char }) => char).join("");
addCase(
  "v4-cf-empty-all-property-members",
  "sentence-order-cf-v4",
  true,
  paragraphHasEmptyFatal(` ${cfMixture} `),
  `${cfChars.length} Cf code points mixed`,
);

const failures = [...base.failures, ...cases.filter((item) => !item.pass)];
const extraPass = cases.filter((item) => item.pass).length;
const total = base.summary.total + cases.length;
const pass = base.summary.pass + extraPass;
const fail = base.summary.fail + cases.length - extraPass;
const categorySummary = Object.fromEntries(
  [...new Set(cases.map((item) => item.category))].map((category) => {
    const categoryCases = cases.filter((item) => item.category === category);
    return [
      category,
      {
        total: categoryCases.length,
        pass: categoryCases.filter((item) => item.pass).length,
        fail: categoryCases.filter((item) => !item.pass).length,
      },
    ];
  }),
);

const inheritedLedgerHash = sha256(
  JSON.stringify({
    base: base.caseLedger.baseAllCaseIdsSha256,
    v3: base.caseLedger.extraAllCaseIdsSha256,
  }),
);

const result = {
  schemaVersion: 1,
  auditDateKst: "2026-07-15",
  auditKind: "deterministic-splits-remediation-reaudit-v4",
  verdict: failures.length === 0 ? "PASS" : "BLOCK",
  summary: {
    total,
    pass,
    fail,
    base242: {
      total: base.summary.total,
      pass: base.summary.pass,
      fail: base.summary.fail,
      failedCaseIds: base.summary.failedCaseIds,
    },
    extra: {
      total: cases.length,
      pass: extraPass,
      fail: cases.length - extraPass,
      categories: categorySummary,
      generatedCfCodePointCount: cfChars.length,
    },
    failedCaseIds: failures.map((item) => item.id),
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
    baseHarnessSha256: fileSha(
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v3/audit.mts",
    ),
    baseHarnessReportedSha256: base.provenance.auditScriptSha256,
    auditedSourceAndTestSha256: base.provenance.auditedSourceAndTestSha256,
    frozenV3BlockManifestSha256: fileSha(
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v3/MANIFEST.sha256",
    ),
  },
  policy: { inheritedViolations: base.policy.inheritedViolations },
  caseLedger: {
    inheritedLedgerSha256: inheritedLedgerHash,
    extraAllCaseIdsSha256: sha256(JSON.stringify(cases.map((item) => item.id))),
    extraPassedCaseIdsSha256: sha256(
      JSON.stringify(cases.filter((item) => item.pass).map((item) => item.id)),
    ),
  },
  failures: failures.map(({ id, category, expected, observed, input }) => ({
    id,
    category,
    expected,
    observed,
    input,
  })),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
