import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  runQuestionGeneration,
  type RunGenerationInput,
} from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import {
  ATLAS_PREMIUM_QGEN_MODEL_ID,
  ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING,
  ATLAS_STANDARD_MODEL_ID,
} from "@/lib/atlas-ai";
import {
  QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES,
  runWithQuestionGenerationResearchPromptProfile,
  type QuestionGenerationResearchProfilePlan,
  type QuestionGenerationResearchPromptProfileId,
} from "@/lib/question-generation-research-profiles";
import {
  QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  QUESTION_GENERATION_RESEARCH_STAGES,
  runWithQuestionGenerationResearchRuntime,
  type QuestionGenerationResearchCandidateDecision,
  type QuestionGenerationResearchOperation,
  type QuestionGenerationResearchRuntime,
  type QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";

type QuestionType = "GRAMMAR_ERROR" | "BLANK_INFERENCE";

interface WireCapture {
  input: RequestInfo | URL;
  init?: RequestInit;
  body: Record<string, unknown>;
}

class ProfileWireRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId: string;
  readonly retryPolicy =
    QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;
  readonly expectedQuestionsPerStructuredCall = 1;
  readonly operations: QuestionGenerationResearchOperation[] = [];
  readonly stages: QuestionGenerationResearchStage[] = [];
  readonly observedCandidates: Array<readonly unknown[]> = [];
  readonly decisions: Array<{
    value: unknown;
    outcome: QuestionGenerationResearchCandidateDecision;
  }> = [];

  constructor(
    profileId: QuestionGenerationResearchPromptProfileId,
    plan: string,
  ) {
    this.runtimeId = `profile-wire-${profileId}-${plan}`;
  }

  async runAssignment<T>(fn: () => T | Promise<T>): Promise<T> {
    return fn();
  }

  async runOperation<T>(
    operation: Readonly<QuestionGenerationResearchOperation>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    this.operations.push({ ...operation });
    return fn();
  }

  async runStage<T>(
    stage: Readonly<QuestionGenerationResearchStage>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    this.stages.push({ ...stage });
    return fn();
  }

  async observeCandidateValues(values: readonly unknown[]): Promise<void> {
    this.observedCandidates.push(values);
  }

  async decideCandidateValue(
    value: unknown,
    outcome: QuestionGenerationResearchCandidateDecision,
  ): Promise<void> {
    this.decisions.push({ value, outcome });
  }
}

const PASSAGE =
  "People often trust a conclusion because it feels familiar. Careful readers, however, compare the evidence that supports it before they decide. This discipline makes their final judgment more reliable.";

function generationInput(
  subType: QuestionType,
  generationPlan: QuestionGenerationResearchProfilePlan,
): RunGenerationInput {
  return {
    plan: [
      {
        subType,
        count: 1,
        reason: "zero-network research-profile wire probe",
        targetPoints: [],
      },
    ],
    schoolType: "고등학교",
    gradeInfo: "2학년",
    passageContent: PASSAGE,
    teacherIntentBlock: "",
    analysisContext: "",
    diffLabel: "INTERMEDIATE",
    diffInstruction: "두 문장 이상의 구조와 근거를 연결한다.",
    generationPlan,
    customPrompt: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestText(body: Record<string, unknown>): string {
  const messages = body.messages;
  assert.ok(Array.isArray(messages), "Atlas request must contain messages");
  return messages
    .map((message) => {
      assert.ok(isRecord(message));
      const content = message.content;
      if (typeof content === "string") return content;
      if (!Array.isArray(content)) return "";
      return content
        .map((part) =>
          isRecord(part) && typeof part.text === "string" ? part.text : "",
        )
        .join("\n");
    })
    .join("\n\n");
}

function wireQuestionProperties(body: Record<string, unknown>): {
  responseFormat: Record<string, unknown>;
  questions: Record<string, unknown>;
  questionProperties: Record<string, unknown>;
} {
  const responseFormat = body.response_format;
  assert.ok(isRecord(responseFormat));
  assert.equal(responseFormat.type, "json_schema");
  assert.ok(isRecord(responseFormat.json_schema));
  const schema = responseFormat.json_schema.schema;
  assert.ok(isRecord(schema));
  assert.ok(isRecord(schema.properties));
  const questions = schema.properties.questions;
  assert.ok(isRecord(questions));
  assert.equal(questions.minItems, 1);
  assert.equal(questions.maxItems, 1);
  assert.ok(isRecord(questions.items));
  assert.ok(isRecord(questions.items.properties));
  return {
    responseFormat,
    questions,
    questionProperties: questions.items.properties,
  };
}

async function runProfileProbe({
  profileId,
  subType,
  plan,
}: {
  profileId: QuestionGenerationResearchPromptProfileId;
  subType: QuestionType;
  plan: QuestionGenerationResearchProfilePlan;
}): Promise<{
  result: Record<string, unknown>[];
  runtime: ProfileWireRuntime;
  captures: WireCapture[];
}> {
  const runtime = new ProfileWireRuntime(profileId, plan);
  const captures: WireCapture[] = [];
  const originalFetch = globalThis.fetch;
  const sentinel = new Error(`profile-wire-stop-before-network:${profileId}:${plan}`);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    assert.equal(typeof init?.body, "string");
    captures.push({
      input,
      init,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    throw sentinel;
  }) as typeof fetch;

  try {
    const result = await runWithQuestionGenerationResearchPromptProfile(
      profileId,
      () =>
        runWithQuestionGenerationResearchRuntime(runtime, () =>
          runQuestionGeneration(generationInput(subType, plan)),
        ),
    );
    return { result, runtime, captures };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const PROFILE_CELLS: ReadonlyArray<{
  profileId: QuestionGenerationResearchPromptProfileId;
  subType: QuestionType;
  plan: QuestionGenerationResearchProfilePlan;
}> = [
  ...([
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G0_CURRENT_CONTROL,
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G1_FINAL_CHECKLIST_ABLATION,
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G2_POSITIVE_COMPACT,
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
  ] as const).flatMap((profileId) =>
    (["STANDARD", "PREMIUM"] as const).map((plan) => ({
      profileId,
      subType: "GRAMMAR_ERROR" as const,
      plan,
    })),
  ),
  ...([
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B0_CURRENT_CONTROL,
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B2_POSITIVE_COMPACT,
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
  ] as const).flatMap((profileId) =>
    (["STANDARD", "PREMIUM"] as const).map((plan) => ({
      profileId,
      subType: "BLANK_INFERENCE" as const,
      plan,
    })),
  ),
  {
    profileId:
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B1_TYPE_SCOPED_TAIL,
    subType: "BLANK_INFERENCE",
    plan: "STANDARD",
  },
];

const FORBIDDEN_CHILD_STAGES = new Set<string>([
  QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_PROMPT_JSON_FALLBACK,
  QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_JSON_REPAIR,
  QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_CANDIDATE_REPAIR,
  QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_CANDIDATE_REPAIR_JSON,
  QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_SOLVER,
  QUESTION_GENERATION_RESEARCH_STAGES.GRAMMAR_SOLVER,
  QUESTION_GENERATION_RESEARCH_STAGES.GRAMMAR_LADDER_ANSWER_ONLY,
  QUESTION_GENERATION_RESEARCH_STAGES.GRAMMAR_LADDER_ANSWER_REGEN,
  QUESTION_GENERATION_RESEARCH_STAGES.GRAMMAR_LADDER_ADD_DECOYS,
  QUESTION_GENERATION_RESEARCH_STAGES.GRAMMAR_LADDER_REPAIR,
]);

test("all 15 applicable profile-plan cells emit one sealed production wire", async () => {
  assert.equal(PROFILE_CELLS.length, 15);
  assert.equal(ATLAS_STANDARD_MODEL_ID, "google/gemini-3.5-flash");
  assert.equal(
    ATLAS_PREMIUM_QGEN_MODEL_ID,
    "google/gemini-3.1-pro-preview",
  );

  const prompts = new Map<string, string>();
  for (const cell of PROFILE_CELLS) {
    const label = `${cell.profileId}:${cell.plan}`;
    const { result, runtime, captures } = await runProfileProbe(cell);

    // The deliberate transport stop is handled as the production engine's
    // no-candidate outcome; it must never trigger another physical dispatch.
    assert.deepEqual(result, [], `${label} no-candidate result`);
    assert.equal(captures.length, 1, `${label} physical fetch count`);
    const capture = captures[0];
    assert.match(String(capture.input), /\/chat\/completions$/);
    const body = capture.body;
    assert.equal(
      body.model,
      cell.plan === "STANDARD"
        ? ATLAS_STANDARD_MODEL_ID
        : ATLAS_PREMIUM_QGEN_MODEL_ID,
      `${label} model`,
    );

    assert.ok(isRecord(body.provider), `${label} provider policy`);
    assert.deepEqual(
      body.provider,
      ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING,
      `${label} fail-closed privacy and provider route`,
    );
    assert.ok(isRecord(body.reasoning), `${label} explicit reasoning policy`);
    assert.deepEqual(
      body.reasoning,
      { enabled: false, effort: "none", exclude: true },
      `${label} reasoning must be explicitly disabled`,
    );
    assert.equal(Object.hasOwn(body, "reasoning_effort"), false, label);
    assert.equal(
      body.max_tokens,
      cell.subType === "GRAMMAR_ERROR" ? 6_000 : 4_000,
      `${label} frozen S1 output-token cap`,
    );
    assert.equal(Object.hasOwn(body, "max_completion_tokens"), false, label);
    assert.equal(Object.hasOwn(body, "max_output_tokens"), false, label);

    const { questionProperties } = wireQuestionProperties(body);
    if (
      cell.profileId ===
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE
    ) {
      assert.ok(questionProperties.siteCertificate, label);
      assert.equal(Object.hasOwn(questionProperties, "errorDesign"), false, label);
    } else if (
      cell.profileId ===
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER
    ) {
      assert.ok(questionProperties.blankBlueprint, label);
      assert.equal(Object.hasOwn(questionProperties, "blankDesign"), false, label);
    }

    assert.equal(runtime.operations.length, 1, `${label} root operation count`);
    assert.equal(
      runtime.operations[0].rootStage.key,
      QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
      `${label} must bypass the grammar ladder and JSON fallback`,
    );
    assert.deepEqual(
      runtime.stages.map((stage) => stage.key),
      [QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED],
      `${label} structured stage count`,
    );
    assert.equal(
      runtime.stages.some((stage) => FORBIDDEN_CHILD_STAGES.has(stage.key)),
      false,
      `${label} forbidden repair/solver/ladder child`,
    );
    assert.deepEqual(runtime.observedCandidates, [], label);
    assert.deepEqual(runtime.decisions, [], label);
    prompts.set(label, requestText(body));
  }

  for (const plan of ["STANDARD", "PREMIUM"] as const) {
    const g0 = prompts.get(`G0_CURRENT_CONTROL:${plan}`) ?? "";
    const g1 = prompts.get(`G1_FINAL_CHECKLIST_ABLATION:${plan}`) ?? "";
    const g2 = prompts.get(`G2_POSITIVE_COMPACT:${plan}`) ?? "";
    const g3 = prompts.get(`G3_SITE_CERTIFICATE:${plan}`) ?? "";
    assert.match(g0, /출력 직전 최종 자기검증/, `G0:${plan}`);
    assert.doesNotMatch(g1, /출력 직전 최종 자기검증/, `G1:${plan}`);
    assert.match(g2, /CORE-10 구조 지점/, `G2:${plan}`);
    assert.doesNotMatch(g2, /구조화 site certificate/, `G2:${plan}`);
    assert.match(g3, /CORE-10 구조 지점/, `G3:${plan}`);
    assert.match(g3, /구조화 site certificate/, `G3:${plan}`);

    const b0 = prompts.get(`B0_CURRENT_CONTROL:${plan}`) ?? "";
    const b2 = prompts.get(`B2_POSITIVE_COMPACT:${plan}`) ?? "";
    const b3 = prompts.get(`B3_OPTION_INTENT_LEDGER:${plan}`) ?? "";
    assert.match(b0, /BLANK_INFERENCE/, `B0:${plan}`);
    assert.doesNotMatch(b0, /구조화 option-intent ledger/, `B0:${plan}`);
    assert.match(b2, /모든 선지가 같은 문법 자리에/, `B2:${plan}`);
    assert.doesNotMatch(b2, /구조화 option-intent ledger/, `B2:${plan}`);
    assert.match(b3, /모든 선지가 같은 문법 자리에/, `B3:${plan}`);
    assert.match(b3, /구조화 option-intent ledger/, `B3:${plan}`);
  }

  const b0Standard = prompts.get("B0_CURRENT_CONTROL:STANDARD") ?? "";
  const b1Standard = prompts.get("B1_TYPE_SCOPED_TAIL:STANDARD") ?? "";
  assert.match(b0Standard, /SENTENCE_ORDER and SENTENCE_INSERT/);
  assert.doesNotMatch(b1Standard, /SENTENCE_ORDER and SENTENCE_INSERT/);
  assert.match(b1Standard, /BLANK_INFERENCE: all options must fit/);
  assert.ok(
    b1Standard.length < b0Standard.length,
    "B1 STANDARD type-scoped tail must be shorter than B0",
  );
});

test("B1 PREMIUM is excluded before operation, stage, or physical fetch", async () => {
  const profileId =
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B1_TYPE_SCOPED_TAIL;
  const runtime = new ProfileWireRuntime(profileId, "PREMIUM");
  const originalFetch = globalThis.fetch;
  let physicalFetches = 0;
  globalThis.fetch = (() => {
    physicalFetches += 1;
    throw new Error("B1 PREMIUM must never reach fetch");
  }) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        runWithQuestionGenerationResearchPromptProfile(profileId, () =>
          runWithQuestionGenerationResearchRuntime(runtime, () =>
            runQuestionGeneration(
              generationInput("BLANK_INFERENCE", "PREMIUM"),
            ),
          ),
        ),
      /B1_TYPE_SCOPED_TAIL PREMIUM is byte-identical to B0/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(physicalFetches, 0);
  assert.deepEqual(runtime.operations, []);
  assert.deepEqual(runtime.stages, []);
  assert.deepEqual(runtime.observedCandidates, []);
  assert.deepEqual(runtime.decisions, []);
});

test("profile input drift is rejected before operation, stage, or physical fetch", async () => {
  const profileId =
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G0_CURRENT_CONTROL;
  const base = generationInput("GRAMMAR_ERROR", "STANDARD");
  const cases: Array<{
    label: string;
    generation: RunGenerationInput;
    options?: { qualityMode?: "strict" | "relaxed"; attemptIndex?: number };
  }> = [
    {
      label: "count",
      generation: {
        ...base,
        plan: [{ ...base.plan[0], count: 2 }],
      },
    },
    {
      label: "multi-plan",
      generation: {
        ...base,
        plan: [...base.plan, { ...base.plan[0] }],
      },
    },
    {
      label: "target-points",
      generation: {
        ...base,
        plan: [{ ...base.plan[0], targetPoints: ["drift"] }],
      },
    },
    {
      label: "custom-prompt",
      generation: { ...base, customPrompt: "drift" },
    },
    {
      label: "retry-attempt",
      generation: base,
      options: { attemptIndex: 1 },
    },
    {
      label: "relaxed-mode",
      generation: base,
      options: { qualityMode: "relaxed" },
    },
  ];

  for (const probe of cases) {
    const runtime = new ProfileWireRuntime(profileId, probe.label);
    const originalFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (() => {
      fetches += 1;
      throw new Error("profile input drift must never reach fetch");
    }) as typeof fetch;
    try {
      await assert.rejects(
        () =>
          runWithQuestionGenerationResearchPromptProfile(profileId, () =>
            runWithQuestionGenerationResearchRuntime(runtime, () =>
              runQuestionGeneration(probe.generation, probe.options),
            ),
          ),
        /requires one strict count-1 assignment/,
        probe.label,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(fetches, 0, probe.label);
    assert.deepEqual(runtime.operations, [], probe.label);
    assert.deepEqual(runtime.stages, [], probe.label);
  }
});

test("source orders raw observation before profile adaptation and guards all child engines", () => {
  const source = readFileSync(
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
    "utf8",
  );
  const observation = source.indexOf(
    "await observeQuestionGenerationResearchCandidates(generatedQuestions)",
  );
  const loop = source.indexOf("for (const q of generatedQuestions)", observation);
  const adaptation = source.indexOf(
    "adaptQuestionGenerationResearchProfileCandidate(q, passageContent)",
    loop,
  );
  assert.ok(observation >= 0, "raw candidate observation hook missing");
  assert.ok(loop > observation, "raw observation must occur before candidate loop");
  assert.ok(adaptation > loop, "profile adaptation must occur after raw observation");
  assert.match(
    source,
    /let researchDecisionCandidate\s*=\s*q === ladderAcceptedQuestion[\s\S]*?: q;[\s\S]*?adaptQuestionGenerationResearchProfileCandidate\(q, passageContent\)/,
  );
  assert.match(
    source,
    /const useGrammarPremiumLadder\s*=[\s\S]{0,240}!researchSingleShotProfileActive/,
  );
  assert.match(
    source,
    /!researchSingleShotProfileActive\s*&&\s*!koMod[\s\S]{0,300}shouldAttemptCandidateRepair/,
  );
  assert.match(
    source,
    /!researchSingleShotProfileActive\s*&&\s*subType === "GRAMMAR_ERROR"[\s\S]{0,900}runGrammarSolverGate/,
  );
});
