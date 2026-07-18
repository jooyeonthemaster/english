// T8a 허용 답안 집합(acceptedAnswers) 계약 테스트.
// 서술형 자동채점 4유형(WORD_ORDER·FILL_BLANK_KEY·SUMMARY_COMPLETE(blank 단위)·
// GRAMMAR_CORRECTION(segment 단위))의 AI 출력 스키마에 optional string[] 필드가
// 추가됐고, ① acceptedAnswers 포함 응답이 파싱에서 보존되며 ② 필드 부재도 그대로
// 통과(하위호환)하고 ③ 후처리(postProcessQuestion)가 저장 데이터까지 필드를
// 보존하는지(패스스루/스프레드 + GRAMMAR_CORRECTION 명시 정규화), 그리고 ④ 생성
// 프롬프트(ESSAY_PROMPTS)에 동등 허용답 나열 지시가 들어갔는지, ⑤ top-level 필드
// 추가가 correctAnswer 위치(=끝-5) 계약을 깨지 않는지 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import essaySchemas from "@/lib/question-schemas-essay";
import essayPrompts from "@/lib/question-prompts-essay";
import postprocess from "@/lib/question-postprocess";

const {
  fillBlankKeySchema,
  summaryCompleteSchema,
  buildSummaryCompleteSchema,
  wordOrderSchema,
  grammarCorrectionSchema,
} = essaySchemas;
const { ESSAY_PROMPTS } = essayPrompts;
const { postProcessQuestion } = postprocess;

const shapeKeys = (schema: any): string[] => Object.keys(schema.shape ?? {});

const TAIL = ["explanation", "keyPoints", "tags", "difficulty"];

// ── Fixtures (acceptedAnswers 포함) ──────────────────────────────────────────
const wordOrderFixture = {
  direction: "주어진 단어를 배열하여 문장을 완성하시오.",
  scrambledWords: ["raining", "is", "it"],
  wordBankDistractors: [],
  modelAnswer: "It is raining.",
  acceptedAnswers: ["It is raining.", "It's raining."],
  correctAnswer: "It is raining.",
  explanation: "테스트 해설",
  keyPoints: ["p1", "p2", "p3"],
  tags: ["배열"],
  difficulty: "BASIC",
};

const fillBlankFixture = {
  direction: "빈칸에 들어갈 말을 본문에서 찾아 쓰시오.",
  sentenceWithBlank: "The cat sat on the _____.",
  answer: "mat",
  acceptedAnswers: ["mat", "the mat"],
  correctAnswer: "mat",
  explanation: "테스트 해설",
  keyPoints: ["p1", "p2", "p3"],
  tags: ["빈칸"],
  difficulty: "BASIC",
};

const summaryCompleteFixture = {
  direction: "요약문의 빈칸에 들어갈 말을 쓰시오.",
  summaryWithBlanks: "Regular (A) improves overall (B).",
  blanks: [
    { label: "(A)", answer: "exercise", acceptedAnswers: ["exercise", "working out"] },
    { label: "(B)", answer: "health", acceptedAnswers: ["health"] },
  ],
  correctAnswer: "(A) exercise, (B) health",
  explanation: "테스트 해설",
  keyPoints: ["p1", "p2", "p3"],
  tags: ["요약"],
  difficulty: "BASIC",
};

const summaryCompleteBuilt3Fixture = {
  direction: "요약문의 빈칸에 들어갈 말을 쓰시오.",
  summaryWithBlanks: "A (A) leads to (B) and finally (C).",
  blanks: [
    { label: "(A)", answer: "cause", acceptedAnswers: ["cause"] },
    { label: "(B)", answer: "effect", acceptedAnswers: ["effect", "result"] },
    { label: "(C)", answer: "outcome", acceptedAnswers: ["outcome"] },
  ],
  correctAnswer: "(A) cause, (B) effect, (C) outcome",
  explanation: "테스트 해설",
  keyPoints: ["p1", "p2", "p3"],
  tags: ["요약"],
  difficulty: "BASIC",
};

// GRAMMAR_CORRECTION: superRefine 게이트 통과용 clean fixture (스키마 보존 검사)
const grammarCorrectionFixture = {
  direction: "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.",
  underlinedSegments: [
    {
      label: "(A)",
      sourceText: "He goes to school every day.",
      displayedText: "He go to school every day.",
      isError: true,
      errorPart: "go",
      correctedPart: "goes",
      acceptedAnswers: ["goes", "does go"],
    },
  ],
  correctAnswer: "(A) goes",
  explanation: "테스트 해설",
  keyPoints: ["p1", "p2", "p3"],
  tags: ["어법"],
  difficulty: "BASIC",
};

// GRAMMAR_CORRECTION: 후처리 정규화(trim·중복 제거) 검사용 messy fixture
const grammarCorrectionMessyFixture = {
  ...grammarCorrectionFixture,
  underlinedSegments: [
    {
      ...grammarCorrectionFixture.underlinedSegments[0],
      acceptedAnswers: ["goes", " goes ", "does go", "goes", "", 42],
    },
  ],
};

// ── 스키마 파싱: acceptedAnswers 보존 ────────────────────────────────────────
function parseTop(schema: any, fixture: any) {
  const r = schema.safeParse(fixture);
  return { success: r.success, accepted: r.success ? r.data.acceptedAnswers ?? null : null };
}
function parseBlanks(schema: any, fixture: any) {
  const r = schema.safeParse(fixture);
  return {
    success: r.success,
    accepted: r.success ? r.data.blanks.map((b: any) => b.acceptedAnswers ?? null) : null,
  };
}
function parseSegments(schema: any, fixture: any) {
  const r = schema.safeParse(fixture);
  return {
    success: r.success,
    accepted: r.success
      ? r.data.underlinedSegments.map((s: any) => s.acceptedAnswers ?? null)
      : null,
  };
}
const stripTop = (f: any) => {
  const { acceptedAnswers, ...rest } = f;
  return rest;
};
const stripBlanks = (f: any) => ({
  ...f,
  blanks: f.blanks.map((b: any) => {
    const { acceptedAnswers, ...rest } = b;
    return rest;
  }),
});
const stripSegments = (f: any) => ({
  ...f,
  underlinedSegments: f.underlinedSegments.map((s: any) => {
    const { acceptedAnswers, ...rest } = s;
    return rest;
  }),
});

const schema = {
  wordOrder: {
    withAccepted: parseTop(wordOrderSchema, wordOrderFixture),
    without: parseTop(wordOrderSchema, stripTop(wordOrderFixture)),
  },
  fillBlank: {
    withAccepted: parseTop(fillBlankKeySchema, fillBlankFixture),
    without: parseTop(fillBlankKeySchema, stripTop(fillBlankFixture)),
  },
  summaryComplete: {
    withAccepted: parseBlanks(summaryCompleteSchema, summaryCompleteFixture),
    without: parseBlanks(summaryCompleteSchema, stripBlanks(summaryCompleteFixture)),
  },
  summaryCompleteBuilt3: {
    withAccepted: parseBlanks(buildSummaryCompleteSchema(3), summaryCompleteBuilt3Fixture),
  },
  grammarCorrection: {
    withAccepted: parseSegments(grammarCorrectionSchema, grammarCorrectionFixture),
    without: parseSegments(grammarCorrectionSchema, stripSegments(grammarCorrectionFixture)),
  },
};

// ── null 입력(LLM null 출력) 파싱 안정성 + null→undefined 정규화 (T8) ─────────
// 일부 LLM 은 "없음"을 빈 배열/미필드 대신 JSON null 로 출력한다. acceptedAnswersField
// 는 null 을 허용(.nullable)하고 undefined 로 정규화(transform)해 파싱 실패를 막는다.
const nullTop = (schema: any, fixture: any) => {
  const r = schema.safeParse({ ...fixture, acceptedAnswers: null });
  return { success: r.success, isUndefined: r.success ? r.data.acceptedAnswers === undefined : null };
};
const nullBlank0 = (schema: any, fixture: any) => {
  const withNull = {
    ...fixture,
    blanks: fixture.blanks.map((b: any, i: number) => (i === 0 ? { ...b, acceptedAnswers: null } : b)),
  };
  const r = schema.safeParse(withNull);
  return { success: r.success, isUndefined: r.success ? r.data.blanks[0].acceptedAnswers === undefined : null };
};
const nullSeg0 = (schema: any, fixture: any) => {
  const withNull = {
    ...fixture,
    underlinedSegments: fixture.underlinedSegments.map((s: any, i: number) =>
      i === 0 ? { ...s, acceptedAnswers: null } : s,
    ),
  };
  const r = schema.safeParse(withNull);
  return {
    success: r.success,
    isUndefined: r.success ? r.data.underlinedSegments[0].acceptedAnswers === undefined : null,
  };
};
const nullHandling = {
  wordOrder: nullTop(wordOrderSchema, wordOrderFixture),
  fillBlank: nullTop(fillBlankKeySchema, fillBlankFixture),
  summaryComplete: nullBlank0(summaryCompleteSchema, summaryCompleteFixture),
  summaryCompleteBuilt3: nullBlank0(buildSummaryCompleteSchema(3), summaryCompleteBuilt3Fixture),
  grammarCorrection: nullSeg0(grammarCorrectionSchema, grammarCorrectionFixture),
};

// ── 후처리 보존 ──────────────────────────────────────────────────────────────
const woPP = postProcessQuestion("WORD_ORDER", "", wordOrderFixture);
const fbPP = postProcessQuestion(
  "FILL_BLANK_KEY",
  "The cat sat on the mat.",
  fillBlankFixture,
);
const scPP = postProcessQuestion("SUMMARY_COMPLETE", "", summaryCompleteFixture);
const gcPP = postProcessQuestion(
  "GRAMMAR_CORRECTION",
  "He goes to school every day.",
  grammarCorrectionMessyFixture,
);

const postprocessResult = {
  wordOrder: {
    success: woPP.success,
    accepted: (woPP.data as any).acceptedAnswers ?? null,
  },
  fillBlank: {
    success: fbPP.success,
    accepted: (fbPP.data as any).acceptedAnswers ?? null,
  },
  summaryComplete: {
    success: scPP.success,
    blankAccepted: Array.isArray((scPP.data as any).blanks)
      ? (scPP.data as any).blanks.map((b: any) => b.acceptedAnswers ?? null)
      : null,
  },
  grammarCorrection: {
    success: gcPP.success,
    error: gcPP.error ?? null,
    segAccepted: Array.isArray((gcPP.data as any).underlinedSegments)
      ? (gcPP.data as any).underlinedSegments.map((s: any) => s.acceptedAnswers ?? null)
      : null,
  },
};

// ── 프롬프트 지시 존재 ───────────────────────────────────────────────────────
const promptContains = (key: string) => ({
  hasField: ESSAY_PROMPTS[key].includes("acceptedAnswers"),
  hasEnumerate: ESSAY_PROMPTS[key].includes("문법·의미가 동등한"),
  hasNoGuess: ESSAY_PROMPTS[key].includes("확신 없는 변형"),
  // FILL_BLANK_KEY 협소화(T8): verbatim(본문에서 찾기) 유형이라 표기 변형만 허용하고
  // 의미 동치 대체 표현(관계사 치환 등)은 금지 — 아래 신호로 검증.
  mentionsVerbatim: ESSAY_PROMPTS[key].includes("표기") && ESSAY_PROMPTS[key].includes("verbatim"),
  forbidsSemanticSub: ESSAY_PROMPTS[key].includes("의미가 같은") && ESSAY_PROMPTS[key].includes("넣지 마세요"),
  forbidsRelativeSwap: ESSAY_PROMPTS[key].includes('"in which"↔"where"'),
});
const prompts = {
  FILL_BLANK_KEY: promptContains("FILL_BLANK_KEY"),
  SUMMARY_COMPLETE: promptContains("SUMMARY_COMPLETE"),
  WORD_ORDER: promptContains("WORD_ORDER"),
  GRAMMAR_CORRECTION: promptContains("GRAMMAR_CORRECTION"),
};

// ── 필드 순서 계약 (top-level 추가가 correctAnswer 위치를 깨지 않는지) ────────
const order = {
  wordOrder: shapeKeys(wordOrderSchema),
  fillBlank: shapeKeys(fillBlankKeySchema),
};

console.log(JSON.stringify({ schema, nullHandling, postprocessResult, prompts, order, TAIL }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".accepted-answers-contract-harness.mts");
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

// ── 스키마 보존 ──────────────────────────────────────────────────────────────
test("WORD_ORDER schema keeps top-level acceptedAnswers and stays optional", () => {
  assert.equal(result.schema.wordOrder.withAccepted.success, true);
  assert.deepEqual(result.schema.wordOrder.withAccepted.accepted, [
    "It is raining.",
    "It's raining.",
  ]);
  assert.equal(result.schema.wordOrder.without.success, true, "acceptedAnswers must be optional");
  assert.equal(result.schema.wordOrder.without.accepted, null);
});

test("FILL_BLANK_KEY schema keeps top-level acceptedAnswers and stays optional", () => {
  assert.equal(result.schema.fillBlank.withAccepted.success, true);
  assert.deepEqual(result.schema.fillBlank.withAccepted.accepted, ["mat", "the mat"]);
  assert.equal(result.schema.fillBlank.without.success, true, "acceptedAnswers must be optional");
  assert.equal(result.schema.fillBlank.without.accepted, null);
});

test("SUMMARY_COMPLETE schema keeps per-blank acceptedAnswers (base + built n=3), optional", () => {
  assert.equal(result.schema.summaryComplete.withAccepted.success, true);
  assert.deepEqual(result.schema.summaryComplete.withAccepted.accepted, [
    ["exercise", "working out"],
    ["health"],
  ]);
  assert.equal(
    result.schema.summaryComplete.without.success,
    true,
    "per-blank acceptedAnswers must be optional",
  );
  assert.deepEqual(result.schema.summaryComplete.without.accepted, [null, null]);

  assert.equal(result.schema.summaryCompleteBuilt3.withAccepted.success, true);
  assert.deepEqual(result.schema.summaryCompleteBuilt3.withAccepted.accepted, [
    ["cause"],
    ["effect", "result"],
    ["outcome"],
  ]);
});

test("GRAMMAR_CORRECTION schema keeps per-segment acceptedAnswers, optional", () => {
  assert.equal(result.schema.grammarCorrection.withAccepted.success, true);
  assert.deepEqual(result.schema.grammarCorrection.withAccepted.accepted, [["goes", "does go"]]);
  assert.equal(
    result.schema.grammarCorrection.without.success,
    true,
    "per-segment acceptedAnswers must be optional (superRefine gate must still pass)",
  );
  assert.deepEqual(result.schema.grammarCorrection.without.accepted, [null]);
});

// ── 후처리 보존 (structuredData 까지) ────────────────────────────────────────
test("WORD_ORDER post-process (passthrough) preserves top-level acceptedAnswers", () => {
  assert.equal(result.postprocessResult.wordOrder.success, true);
  assert.deepEqual(result.postprocessResult.wordOrder.accepted, [
    "It is raining.",
    "It's raining.",
  ]);
});

test("FILL_BLANK_KEY post-process preserves top-level acceptedAnswers", () => {
  assert.equal(result.postprocessResult.fillBlank.success, true);
  assert.deepEqual(result.postprocessResult.fillBlank.accepted, ["mat", "the mat"]);
});

test("SUMMARY_COMPLETE post-process (passthrough) preserves per-blank acceptedAnswers", () => {
  assert.equal(result.postprocessResult.summaryComplete.success, true);
  assert.deepEqual(result.postprocessResult.summaryComplete.blankAccepted, [
    ["exercise", "working out"],
    ["health"],
  ]);
});

test("GRAMMAR_CORRECTION post-process preserves + normalizes per-segment acceptedAnswers", () => {
  assert.equal(
    result.postprocessResult.grammarCorrection.success,
    true,
    `post-process failed: ${result.postprocessResult.grammarCorrection.error}`,
  );
  // 입력 ["goes"," goes ","does go","goes","",42] → trim·빈문자·비문자열·중복 제거
  assert.deepEqual(result.postprocessResult.grammarCorrection.segAccepted, [["goes", "does go"]]);
});

// ── 프롬프트 지시 ────────────────────────────────────────────────────────────
// FILL_BLANK_KEY 는 verbatim(본문에서 찾아 쓰기) 유형이라 "의미 동등 나열" 지시가
// 협소화됐다 — 나머지 3유형만 동치 나열 지시를 유지한다.
test("ESSAY_PROMPTS instruct enumerating equivalent accepted answers (SUMMARY_COMPLETE·WORD_ORDER·GRAMMAR_CORRECTION)", () => {
  for (const key of ["SUMMARY_COMPLETE", "WORD_ORDER", "GRAMMAR_CORRECTION"]) {
    const p = result.prompts[key];
    assert.equal(p.hasField, true, `${key} prompt must name acceptedAnswers`);
    assert.equal(p.hasEnumerate, true, `${key} prompt must instruct enumerating equivalents`);
    assert.equal(p.hasNoGuess, true, `${key} prompt must warn against uncertain variants`);
  }
});

// FILL_BLANK_KEY 협소화 계약(T8): verbatim 답의 표기 변형만 허용, 의미 동치 대체
// 표현(관계사 치환 in which↔where 등) 금지 — 'in which↔where' 동치 예시와의 모순 제거.
test("FILL_BLANK_KEY acceptedAnswers is narrowed to verbatim orthographic variants (no semantic equivalents)", () => {
  const p = result.prompts.FILL_BLANK_KEY;
  assert.equal(p.hasField, true, "FILL_BLANK_KEY prompt must name acceptedAnswers");
  assert.equal(p.hasNoGuess, true, "FILL_BLANK_KEY prompt must still warn against uncertain variants");
  assert.equal(p.mentionsVerbatim, true, "FILL_BLANK_KEY must frame the answer as verbatim + 표기 변형");
  assert.equal(p.forbidsSemanticSub, true, "FILL_BLANK_KEY must forbid meaning-equivalent substitutes");
  assert.equal(
    p.forbidsRelativeSwap,
    true,
    "FILL_BLANK_KEY must list 'in which'↔'where' as forbidden, not as an allowed equivalent",
  );
  assert.equal(
    p.hasEnumerate,
    false,
    "FILL_BLANK_KEY must NOT instruct enumerating semantic '문법·의미가 동등한' equivalents (contradicts verbatim)",
  );
});

// null 입력(LLM null 출력) 파싱 안정성 + null→undefined 정규화 (T8)
test("acceptedAnswers accepts LLM null and normalizes null→undefined (all types)", () => {
  for (const key of ["wordOrder", "fillBlank", "summaryComplete", "summaryCompleteBuilt3", "grammarCorrection"]) {
    const n = result.nullHandling[key];
    assert.equal(n.success, true, `${key}: null acceptedAnswers must parse successfully (not fail)`);
    assert.equal(n.isUndefined, true, `${key}: null acceptedAnswers must normalize to undefined`);
  }
});

// ── 필드 순서 계약 유지 ──────────────────────────────────────────────────────
test("adding top-level acceptedAnswers keeps correctAnswer right before the tail", () => {
  for (const key of ["wordOrder", "fillBlank"]) {
    const keys = result.order[key];
    assert.equal(keys[0], "direction", `${key}: direction first`);
    assert.deepEqual(keys.slice(-4), result.TAIL, `${key}: tail intact`);
    assert.equal(
      keys.indexOf("correctAnswer"),
      keys.length - 5,
      `${key}: correctAnswer must sit right before the explanation tail (${JSON.stringify(keys)})`,
    );
    const acceptedIdx = keys.indexOf("acceptedAnswers");
    assert.ok(acceptedIdx >= 0, `${key}: acceptedAnswers field must exist`);
    assert.equal(
      acceptedIdx,
      keys.indexOf("correctAnswer") - 1,
      `${key}: acceptedAnswers must sit right before correctAnswer`,
    );
  }
});
