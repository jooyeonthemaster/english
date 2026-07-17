import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { z } from "zod";

import {
  normalizeQuestionGenerationApplicationRetries,
  normalizeQuestionGenerationOuterAttempts,
} from "@/lib/concurrency-config";
import {
  generateQuestionObject,
  generateQuestionText,
} from "@/lib/question-generation-llm";
import {
  QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  getQuestionGenerationResearchTransportPolicy,
  runWithQuestionGenerationResearchRuntime,
  type QuestionGenerationResearchOperation,
  type QuestionGenerationResearchRuntime,
  type QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";
import { runGrammarPremiumLadder } from "@/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder";

class SingleDispatchProbeRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId = "retry-envelope-probe";
  readonly retryPolicy =
    QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;
  readonly expectedQuestionsPerStructuredCall = 1;

  async runAssignment<T>(fn: () => T | Promise<T>): Promise<T> {
    return fn();
  }

  async runOperation<T>(
    _operation: Readonly<QuestionGenerationResearchOperation>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    return fn();
  }

  async runStage<T>(
    _stage: Readonly<QuestionGenerationResearchStage>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    return fn();
  }

  async observeCandidateValues(): Promise<void> {}

  async decideCandidateValue(): Promise<void> {}
}

function retryable503(): Response {
  return new Response(JSON.stringify({ error: { message: "retry probe" } }), {
    status: 503,
    headers: {
      "content-type": "application/json",
      "retry-after": "0",
    },
  });
}

function malformedCompletion(model: string): Response {
  return new Response(
    JSON.stringify({
      id: "retry-envelope-malformed",
      object: "chat.completion",
      created: 1,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: '{"value":' },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function validCompletion(model: string, content: string): Response {
  return new Response(
    JSON.stringify({
      id: "retry-envelope-valid",
      object: "chat.completion",
      created: 1,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("public application and outer retry normalization is total and hard-bounded", () => {
  const malformed: unknown[] = [
    undefined,
    null,
    "2",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    0.5,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ];
  for (const value of malformed) {
    assert.equal(normalizeQuestionGenerationApplicationRetries(value), 2);
    assert.equal(normalizeQuestionGenerationOuterAttempts(value), 2);
  }

  assert.equal(normalizeQuestionGenerationApplicationRetries(0), 0);
  assert.equal(normalizeQuestionGenerationApplicationRetries(1), 1);
  assert.equal(normalizeQuestionGenerationApplicationRetries(2), 2);
  assert.equal(normalizeQuestionGenerationApplicationRetries(3), 2);
  assert.equal(normalizeQuestionGenerationApplicationRetries(999), 2);

  assert.equal(normalizeQuestionGenerationOuterAttempts(0), 2);
  assert.equal(normalizeQuestionGenerationOuterAttempts(1), 1);
  assert.equal(normalizeQuestionGenerationOuterAttempts(2), 2);
  assert.equal(normalizeQuestionGenerationOuterAttempts(3), 2);
  assert.equal(normalizeQuestionGenerationOuterAttempts(999), 2);
});

test("question retry environment values cannot exceed the source hard caps", () => {
  const cases = [
    ["", { application: 2, outer: 2, trigger: 2 }],
    ["0", { application: 0, outer: 2, trigger: 2 }],
    ["1", { application: 1, outer: 1, trigger: 1 }],
    ["2", { application: 2, outer: 2, trigger: 2 }],
    ["3", { application: 2, outer: 2, trigger: 2 }],
    ["999", { application: 2, outer: 2, trigger: 2 }],
    ["1.5", { application: 2, outer: 2, trigger: 2 }],
    ["NaN", { application: 2, outer: 2, trigger: 2 }],
    ["Infinity", { application: 2, outer: 2, trigger: 2 }],
    ["-1", { application: 2, outer: 2, trigger: 2 }],
  ] as const;

  const script = [
    'import("./src/lib/concurrency-config.ts").then((m) => {',
    '  const c = m.GEMINI_QUESTION_MAX_RETRIES === undefined ? (m.default ?? m["module.exports"]) : m;',
    "  process.stdout.write(JSON.stringify({",
    "    application: c.GEMINI_QUESTION_MAX_RETRIES,",
    "    outer: c.GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS,",
    "    trigger: c.WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS,",
    "  }));",
    "});",
  ].join("\n");

  for (const [raw, expected] of cases) {
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          GEMINI_QUESTION_MAX_RETRIES: raw,
          GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS: raw,
          TRIGGER_WORKBENCH_QUESTION_MAX_ATTEMPTS: raw,
        },
      },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), expected, `raw=${raw}`);
  }
});

test("research runtime accepts only the canonical frozen single-dispatch policy", async () => {
  assert.equal(getQuestionGenerationResearchTransportPolicy(), undefined);
  assert.equal(
    Object.isFrozen(QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY),
    true,
  );

  let invoked = 0;
  const forged = {
    ...new SingleDispatchProbeRuntime(),
    retryPolicy: { ...QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY },
    runAssignment: async <T>(fn: () => T | Promise<T>) => fn(),
    runOperation: async <T>(
      _operation: Readonly<QuestionGenerationResearchOperation>,
      fn: () => T | Promise<T>,
    ) => fn(),
    runStage: async <T>(
      _stage: Readonly<QuestionGenerationResearchStage>,
      fn: () => T | Promise<T>,
    ) => fn(),
    observeCandidateValues: async () => {},
    decideCandidateValue: async () => {},
  } as QuestionGenerationResearchRuntime;
  await assert.rejects(
    () =>
      runWithQuestionGenerationResearchRuntime(forged, () => {
        invoked += 1;
      }),
    /sealed single-dispatch retry policy/,
  );
  assert.equal(invoked, 0);

  await runWithQuestionGenerationResearchRuntime(
    new SingleDispatchProbeRuntime(),
    () => {
      assert.equal(
        getQuestionGenerationResearchTransportPolicy(),
        QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
      );
    },
  );
});

test("ordinary SDK transport gets three physical tries while research gets one", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let ordinaryCalls = 0;
    globalThis.fetch = (async () => {
      ordinaryCalls += 1;
      return retryable503();
    }) as typeof fetch;
    await assert.rejects(() =>
      generateQuestionObject({
        schema: z.object({ value: z.string() }),
        prompt: "zero-network ordinary retry probe",
        generationPlan: "STANDARD",
        maxRetries: 0,
      }),
    );
    assert.equal(ordinaryCalls, 3);

    let clampedApplicationCalls = 0;
    globalThis.fetch = (async () => {
      clampedApplicationCalls += 1;
      return retryable503();
    }) as typeof fetch;
    await assert.rejects(() =>
      generateQuestionObject({
        schema: z.object({ value: z.string() }),
        prompt: "zero-network application hard-cap probe",
        generationPlan: "STANDARD",
        maxRetries: 999,
      }),
    );
    assert.equal(clampedApplicationCalls, 9);

    let researchCalls = 0;
    globalThis.fetch = (async () => {
      researchCalls += 1;
      return retryable503();
    }) as typeof fetch;
    await assert.rejects(() =>
      runWithQuestionGenerationResearchRuntime(
        new SingleDispatchProbeRuntime(),
        () =>
          generateQuestionObject({
            schema: z.object({ value: z.string() }),
            prompt: "zero-network research retry probe",
            generationPlan: "STANDARD",
            maxRetries: 999,
          }),
      ),
    );
    assert.equal(researchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("plain question text transport uses the same explicit SDK and research caps", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let ordinaryCalls = 0;
    globalThis.fetch = (async () => {
      ordinaryCalls += 1;
      return retryable503();
    }) as typeof fetch;
    await assert.rejects(() =>
      generateQuestionText({
        prompt: "zero-network ordinary text retry probe",
        generationPlan: "STANDARD",
        maxRetries: 0,
      }),
    );
    assert.equal(ordinaryCalls, 3);

    let researchCalls = 0;
    globalThis.fetch = (async () => {
      researchCalls += 1;
      return retryable503();
    }) as typeof fetch;
    await assert.rejects(() =>
      runWithQuestionGenerationResearchRuntime(
        new SingleDispatchProbeRuntime(),
        () =>
          generateQuestionText({
            prompt: "zero-network research text retry probe",
            generationPlan: "STANDARD",
            maxRetries: 999,
          }),
      ),
    );
    assert.equal(researchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("research PREMIUM strict failure cannot invoke the structured repair child", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return malformedCompletion("google/gemini-3.1-pro-preview");
  }) as typeof fetch;
  try {
    await assert.rejects(() =>
      runWithQuestionGenerationResearchRuntime(
        new SingleDispatchProbeRuntime(),
        () =>
          generateQuestionObject({
            schema: z.object({ value: z.string() }),
            prompt: "zero-network PREMIUM repair suppression probe",
            generationPlan: "PREMIUM",
            maxRetries: 999,
          }),
      ),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ordinary PREMIUM keeps its existing structured repair child", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1
      ? malformedCompletion("google/gemini-3.1-pro-preview")
      : validCompletion(
          "google/gemini-3.1-pro-preview",
          '{"value":"repaired"}',
        );
  }) as typeof fetch;
  try {
    const result = await generateQuestionObject({
      schema: z.object({ value: z.string() }),
      prompt: "zero-network ordinary PREMIUM repair preservation probe",
      generationPlan: "PREMIUM",
      maxRetries: 0,
    });
    assert.deepEqual(result.object, { value: "repaired" });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("prompt-JSON fallback repair is preserved ordinarily and suppressed in research", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let ordinaryCalls = 0;
    globalThis.fetch = (async () => {
      ordinaryCalls += 1;
      return ordinaryCalls === 1
        ? malformedCompletion("google/gemini-3.1-pro-preview")
        : validCompletion(
            "google/gemini-3.1-pro-preview",
            '{"value":"fallback-repaired"}',
          );
    }) as typeof fetch;
    const ordinary = await generateQuestionObject({
      schema: z.object({ value: z.string() }),
      prompt: "zero-network ordinary prompt-JSON repair probe",
      generationPlan: "PREMIUM",
      maxRetries: 0,
      forceJsonFallback: true,
    });
    assert.deepEqual(ordinary.object, { value: "fallback-repaired" });
    assert.equal(ordinaryCalls, 2);

    let researchCalls = 0;
    globalThis.fetch = (async () => {
      researchCalls += 1;
      return malformedCompletion("google/gemini-3.1-pro-preview");
    }) as typeof fetch;
    await assert.rejects(() =>
      runWithQuestionGenerationResearchRuntime(
        new SingleDispatchProbeRuntime(),
        () =>
          generateQuestionObject({
            schema: z.object({ value: z.string() }),
            prompt: "zero-network research prompt-JSON repair suppression probe",
            generationPlan: "PREMIUM",
            maxRetries: 999,
            forceJsonFallback: true,
          }),
      ),
    );
    assert.equal(researchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("grammar ladder parse retry is two fires ordinarily and one in research", async () => {
  const originalFetch = globalThis.fetch;
  const input = {
    passageContent:
      "Readers compare evidence carefully before accepting a conclusion.",
    difficulty: "INTERMEDIATE",
    difficultyInstruction: "Build one defensible item.",
    finalize: async () => ({
      ok: false as const,
      errors: ["probe"],
      warnings: [],
      hardBlockCodes: ["probe"],
      answerRelPos: null,
    }),
  };
  try {
    let ordinaryCalls = 0;
    globalThis.fetch = (async () => {
      ordinaryCalls += 1;
      return malformedCompletion("google/gemini-3.1-pro-preview");
    }) as typeof fetch;
    const ordinary = await runGrammarPremiumLadder(input);
    assert.equal(ordinary.status, "gave-up");
    assert.equal(ordinary.calls.length, 2);
    assert.equal(ordinaryCalls, 2);

    let researchCalls = 0;
    globalThis.fetch = (async () => {
      researchCalls += 1;
      return malformedCompletion("google/gemini-3.1-pro-preview");
    }) as typeof fetch;
    const research = await runWithQuestionGenerationResearchRuntime(
      new SingleDispatchProbeRuntime(),
      () => runGrammarPremiumLadder(input),
    );
    assert.equal(research.status, "gave-up");
    assert.equal(research.calls.length, 1);
    assert.equal(researchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
