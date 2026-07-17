import assert from "node:assert/strict";
import test from "node:test";

import {
  runQuestionGeneration,
  type RunGenerationInput,
} from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import {
  QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES,
  runWithQuestionGenerationResearchPromptProfile,
  type QuestionGenerationResearchPromptProfileId,
} from "@/lib/question-generation-research-profiles";
import {
  QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  runWithQuestionGenerationResearchRuntime,
  type QuestionGenerationResearchCandidateDecision,
  type QuestionGenerationResearchOperation,
  type QuestionGenerationResearchRuntime,
  type QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";

class SuccessfulProfileRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId = "successful-profile-response-probe";
  readonly retryPolicy =
    QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;
  readonly expectedQuestionsPerStructuredCall = 1;
  readonly operations: QuestionGenerationResearchOperation[] = [];
  readonly stages: QuestionGenerationResearchStage[] = [];
  readonly observed: Array<readonly unknown[]> = [];
  readonly decisions: Array<{
    value: unknown;
    outcome: QuestionGenerationResearchCandidateDecision;
  }> = [];

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
    this.observed.push(values);
  }

  async decideCandidateValue(
    value: unknown,
    outcome: QuestionGenerationResearchCandidateDecision,
  ): Promise<void> {
    this.decisions.push({ value, outcome });
  }
}

function input(subType: "GRAMMAR_ERROR" | "BLANK_INFERENCE", passage: string): RunGenerationInput {
  return {
    plan: [
      {
        subType,
        count: 1,
        reason: "zero-network successful profile response probe",
        targetPoints: [],
      },
    ],
    schoolType: "고등학교",
    gradeInfo: "2학년",
    passageContent: passage,
    teacherIntentBlock: "",
    analysisContext: "",
    diffLabel: "INTERMEDIATE",
    diffInstruction: "두 문장 이상의 구조나 근거를 연결한다.",
    generationPlan: "STANDARD",
    customPrompt: "",
  };
}

function completion(object: unknown): Response {
  return new Response(
    JSON.stringify({
      id: "profile-response-zero-network",
      object: "chat.completion",
      created: 1,
      model: "google/gemini-3.5-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(object) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function runSuccessfulResponse(args: {
  profileId: QuestionGenerationResearchPromptProfileId;
  subType: "GRAMMAR_ERROR" | "BLANK_INFERENCE";
  passage: string;
  candidate: Record<string, unknown>;
}): Promise<{
  result: Record<string, unknown>[];
  runtime: SuccessfulProfileRuntime;
  fetches: number;
}> {
  const runtime = new SuccessfulProfileRuntime();
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (async () => {
    fetches += 1;
    return completion({ questions: [args.candidate] });
  }) as typeof fetch;
  try {
    const result = await runWithQuestionGenerationResearchPromptProfile(
      args.profileId,
      () =>
        runWithQuestionGenerationResearchRuntime(runtime, () =>
          runQuestionGeneration(input(args.subType, args.passage)),
        ),
    );
    return { result, runtime, fetches };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("G3 exact response bytes bind raw certificate and reach the student surface", async () => {
  const targetSentence =
    "The reports that the committee reviewed, which were based on interviews with residents, show a consistent pattern.";
  const passage = [
    "Researchers who study local habits collect reports from several neighborhoods before drawing conclusions.",
    targetSentence,
    "Officials then compare policies designed to reduce waste with earlier programs.",
    "These comparisons help local leaders explain the changes clearly to families.",
    "Only after several trials do the officials accept results that remain stable across districts.",
  ].join(" ");
  const certificate = {
    certificationStatus: "CERTIFIED",
    sourceSentenceExact: targetSentence,
    sourceExpressionExact: "which were",
    surroundingTextExact: targetSentence,
    pointCode: "d",
    frame: "nonrestrictive relative-clause agreement",
    governingRule:
      "The finite verb in the nonrestrictive relative clause agrees with the plural antecedent reports.",
    mutation: {
      sourceForm: "which were",
      displayedError: "which was",
      correction: "which were",
      mutationClass: "SUBJECT_VERB_AGREEMENT",
    },
    strongestAlternativeParse:
      "Treat which as referring to the singular committee rather than reports.",
    whyAlternativeFails:
      "The relative clause is adjacent to and semantically predicates being interview-based of the plural reports.",
    mutationOnlyCertifiedSite: true,
  };
  const markedExpressions = [
    {
      label: "(A)",
      expression: "who",
      errorExpression: "who",
      isError: false,
      surroundingText: "Researchers who study local habits collect reports",
      pointCode: "b",
    },
    {
      label: "(B)",
      expression: "which were",
      errorExpression: "which was",
      correction: "which were",
      isError: true,
      surroundingText: targetSentence,
      pointCode: "d",
    },
    {
      label: "(C)",
      expression: "designed",
      errorExpression: "designed",
      isError: false,
      surroundingText: "Officials then compare policies designed to reduce waste",
      pointCode: "c",
    },
    {
      label: "(D)",
      expression: "clearly",
      errorExpression: "clearly",
      isError: false,
      surroundingText: "help local leaders explain the changes clearly to families",
      pointCode: "f",
    },
    {
      label: "(E)",
      expression: "remain",
      errorExpression: "remain",
      isError: false,
      surroundingText: "results that remain stable across districts",
      pointCode: "a",
    },
  ];
  const candidate = {
    direction: "다음 글의 밑줄 친 부분 중 어법상 틀린 것은?",
    siteCertificate: certificate,
    markedExpressions,
    correctAnswers: ["(B)"],
    correctAnswer: "(B)",
    options: markedExpressions.map((marked) => ({
      label: marked.label,
      text: marked.errorExpression,
    })),
    wrongOptionExplanations: [
      {
        label: "(A)",
        expression: "who",
        pointCode: "b",
        explanation:
          "who는 사람을 뜻하는 선행사 Researchers를 받아 관계절의 주어 역할을 하므로 적절하다.",
      },
      {
        label: "(C)",
        expression: "designed",
        pointCode: "c",
        explanation:
          "designed는 정책이 폐기물을 줄이도록 설계된 수동 관계를 나타내는 과거분사이므로 적절하다.",
      },
      {
        label: "(D)",
        expression: "clearly",
        pointCode: "f",
        explanation:
          "clearly는 동사 explain을 수식하여 설명하는 방식을 나타내는 부사이므로 적절하다.",
      },
      {
        label: "(E)",
        expression: "remain",
        pointCode: "a",
        explanation:
          "remain은 복수 선행사 results를 주어로 하는 관계절의 복수 동사이므로 적절하다.",
      },
    ],
    explanation:
      "(B)의 화면 표현 'which was'에서 which가 이끄는 계속적 용법의 관계절은 바로 앞의 복수 명사 The reports를 수식한다. 중간의 that절과 쉼표 수식어를 걷어 내면 골격은 The reports, which were based on interviews, show ...가 된다. 따라서 단수 동사 was는 선행사 reports와 수가 맞지 않아 비문이며, 복수 동사 were를 사용한 'which were'로 고쳐야 한다. committee를 선행사로 보는 해석은 의미와 수식 위치 모두 성립하지 않는다.",
    keyPoints: [
      "(B) 수일치 — 관계절의 선행사 reports와 복수 동사 were의 호응",
      "(A) 관계대명사 — 사람 선행사 Researchers를 받는 주격 who",
      "(C) 분사 태 — 수동 관계를 나타내는 과거분사 designed",
    ],
    tags: ["관계절", "수일치", "분사"],
    difficulty: "INTERMEDIATE",
  };

  const { result, runtime, fetches } = await runSuccessfulResponse({
    profileId:
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    subType: "GRAMMAR_ERROR",
    passage,
    candidate,
  });

  assert.equal(fetches, 1);
  assert.equal(runtime.observed.length, 1);
  assert.equal(runtime.observed[0].length, 1);
  assert.equal(runtime.decisions.length, 1);
  assert.equal(runtime.decisions[0].value, runtime.observed[0][0]);
  assert.equal(runtime.decisions[0].outcome, "parsed_accepted");
  assert.equal(result.length, 1);
  assert.equal(Object.hasOwn(result[0], "siteCertificate"), false);
  assert.equal(Object.hasOwn(result[0], "errorDesign"), false);
  assert.match(String(result[0].passageWithMarkers), /__\(B\) which was__/);
  assert.equal(result[0].correctAnswer, "(B)");

  const mismatched = structuredClone(candidate);
  mismatched.siteCertificate.mutation.displayedError = "which are";
  const rejected = await runSuccessfulResponse({
    profileId:
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    subType: "GRAMMAR_ERROR",
    passage,
    candidate: mismatched,
  });
  assert.equal(rejected.fetches, 1);
  assert.deepEqual(rejected.result, []);
  assert.equal(rejected.runtime.observed.length, 1);
  assert.equal(rejected.runtime.decisions.length, 1);
  assert.equal(
    rejected.runtime.decisions[0].value,
    rejected.runtime.observed[0][0],
  );
  assert.equal(rejected.runtime.decisions[0].outcome, "parsed_rejected");

  const incompleteCertified = structuredClone(candidate);
  delete (incompleteCertified.siteCertificate as Partial<typeof certificate>)
    .whyAlternativeFails;
  const schemaRejected = await runSuccessfulResponse({
    profileId:
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    subType: "GRAMMAR_ERROR",
    passage,
    candidate: incompleteCertified,
  });
  assert.equal(schemaRejected.fetches, 1);
  assert.deepEqual(schemaRejected.result, []);
  assert.deepEqual(schemaRejected.runtime.observed, []);
  assert.deepEqual(schemaRejected.runtime.decisions, []);
});

test("G3 minimal NO_SAFE_SITE is observed once and terminally rejected without a fake question", async () => {
  const passage =
    "Every candidate site in this short passage remains grammatical under a plausible alternative parse.";
  const candidate = {
    siteCertificate: {
      certificationStatus: "NO_SAFE_SITE",
      abstentionReason:
        "No single inflectional mutation is unambiguously wrong under all plausible parses.",
    },
  };

  const { result, runtime, fetches } = await runSuccessfulResponse({
    profileId:
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    subType: "GRAMMAR_ERROR",
    passage,
    candidate,
  });

  assert.equal(fetches, 1);
  assert.deepEqual(result, []);
  assert.equal(runtime.observed.length, 1);
  assert.equal(runtime.observed[0].length, 1);
  assert.equal(runtime.observed[0][0], runtime.decisions[0]?.value);
  assert.equal(runtime.decisions.length, 1);
  assert.equal(runtime.decisions[0].outcome, "parsed_rejected");
  assert.deepEqual(runtime.observed[0][0], candidate);
  assert.deepEqual(Object.keys(candidate), ["siteCertificate"]);
  assert.deepEqual(Object.keys(candidate.siteCertificate).sort(), [
    "abstentionReason",
    "certificationStatus",
  ]);
});

test("B3 exact response bytes bind the five-row ledger and reach the student surface", async () => {
  const sentence1 =
    "Students remember new information better when they connect new facts to personal experiences.";
  const sentence2 =
    "This connection gives abstract ideas a familiar anchor and makes later recall easier.";
  const sentence3 =
    "By building such anchors, learners turn isolated facts into knowledge they can use.";
  const passage = `${sentence1} ${sentence2} ${sentence3}`;
  const options = [
    { label: "1", text: "link new facts with their own experiences" },
    { label: "2", text: "separate new facts from their own experiences" },
    { label: "3", text: "connect abstract ideas only to later recall" },
    { label: "4", text: "turn every familiar anchor into isolated facts" },
    { label: "5", text: "use quick guessing to make later recall easier" },
  ];
  const distractorIntent = (
    label: "2" | "3" | "4" | "5",
    intent:
      | "CAUSE_EFFECT_REVERSAL"
      | "AGENT_TARGET_SWAP"
      | "SCOPE_NARROWING"
      | "STANCE_SHIFT",
    evidenceId: "E1" | "E2" | "E3",
  ) => ({
    label,
    status: "DISTRACTOR",
    proposedText: options[Number(label) - 1].text,
    intent,
    borrowedPassageConcept: "facts, experience, anchors, and recall",
    errorDistance: {
      semanticOverlap: "HIGH",
      distortionCount: "ONE",
      eliminationDepth: "TWO_LINKED_CLUES",
    },
    decisiveExclusion: {
      evidenceIds: [evidenceId],
      reason: "It changes the relation stated by the cited evidence.",
    },
    mutuallyExclusiveWithAnswer:
      "The option cannot preserve the passage's linking relation at the same time as the answer.",
    sameSlotProof: "It is a base-form verb phrase governed by they.",
  });
  const blueprint = {
    target: {
      originalExpressionExact: "connect new facts to personal experiences",
      surroundingTextExact: sentence1,
      discourseRole: "TOPIC_CLAIM",
      answerMeaningAxis:
        "Learners remember information better by linking unfamiliar facts with their own experience.",
      evidenceAnchors: [
        {
          id: "E1",
          exactQuote: sentence1,
          contribution: "States the memory benefit and the linking condition.",
        },
        {
          id: "E2",
          exactQuote: sentence2,
          contribution: "Explains that familiarity creates an anchor for later recall.",
        },
        {
          id: "E3",
          exactQuote: sentence3,
          contribution: "Shows that anchors turn isolated facts into usable knowledge.",
        },
      ],
      slotContract: {
        prefixExact: "Students remember new information better when they ",
        suffixExact: ".",
        syntacticCategory: "VERB_PHRASE",
        polarity: "POSITIVE",
        scope: "WHOLE_PASSAGE_THESIS",
        register: "ACADEMIC",
      },
    },
    optionIntentLedger: {
      correctIntent: {
        label: "1",
        status: "CORRECT",
        proposedText: options[0].text,
        meaningRelation: "EQUIVALENT_SYNTHESIS",
        evidenceIds: ["E1", "E2", "E3"],
        sameSlotProof: "It is a base-form verb phrase governed by they.",
      },
      distractorIntents: [
        distractorIntent("2", "CAUSE_EFFECT_REVERSAL", "E1"),
        distractorIntent("3", "SCOPE_NARROWING", "E2"),
        distractorIntent("4", "AGENT_TARGET_SWAP", "E3"),
        distractorIntent("5", "STANCE_SHIFT", "E2"),
      ],
    },
    seamAudit: {
      allFiveGrammatical: true,
      noOptionRepeatsBoundaryMaterial: true,
      noPolarityOrLengthGiveaway: true,
    },
  };
  const candidate = {
    direction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
    blankBlueprint: blueprint,
    originalExpression: "connect new facts to personal experiences",
    surroundingText: sentence1,
    blankAnswerMode: "PARAPHRASE",
    answerLogic:
      "첫 문장의 연결 조건을 둘째 문장의 familiar anchor와 셋째 문장의 usable knowledge가 함께 뒷받침한다.",
    options,
    correctAnswer: "1",
    wrongOptionExplanations: [
      {
        label: "2",
        explanation:
          "새 사실과 경험이라는 소재는 같지만 둘을 분리해 연결이 기억을 돕는다는 인과를 뒤집는다.",
      },
      {
        label: "3",
        explanation:
          "abstract ideas와 recall을 빌리지만 개인 경험이 만드는 친숙한 anchor 관계를 later recall 하나로 축소한다.",
      },
      {
        label: "4",
        explanation:
          "anchor와 isolated facts를 사용하지만 학습자가 사실을 지식으로 바꾸는 방향을 거꾸로 제시한다.",
      },
      {
        label: "5",
        explanation:
          "later recall과 easier를 빌리지만 지문이 강조한 연결과 구축 대신 근거 없는 quick guessing을 넣는다.",
      },
    ],
    explanation:
      "빈칸은 첫 문장에서 새 정보가 더 잘 기억되는 조건을 완성한다. 첫 문장은 새 사실을 개인 경험과 연결한다고 말하고, 둘째 문장은 그 연결이 추상적 생각에 친숙한 닻을 주어 회상을 쉽게 만든다고 설명한다. 셋째 문장도 그런 닻이 고립된 사실을 활용 가능한 지식으로 바꾼다고 보강한다. 따라서 1번이 전체 인과를 보존한다. 2번은 관계 반전, 3번은 범위 축소, 4번은 방향 전도, 5번은 근거 없는 태도 전환이다.",
    keyPoints: ["개인 경험과 새 사실의 연결", "친숙한 기억 닻", "고립된 사실의 지식화"],
    tags: ["빈칸추론", "인과", "패러프레이즈"],
    difficulty: "INTERMEDIATE",
  };

  const { result, runtime, fetches } = await runSuccessfulResponse({
    profileId:
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
    subType: "BLANK_INFERENCE",
    passage,
    candidate,
  });

  assert.equal(fetches, 1);
  assert.equal(runtime.observed.length, 1);
  assert.equal(runtime.observed[0].length, 1);
  assert.equal(runtime.decisions.length, 1);
  assert.equal(runtime.decisions[0].value, runtime.observed[0][0]);
  assert.equal(runtime.decisions[0].outcome, "parsed_accepted");
  assert.equal(result.length, 1);
  assert.equal(Object.hasOwn(result[0], "blankBlueprint"), false);
  assert.equal(Object.hasOwn(result[0], "blankDesign"), false);
  assert.match(String(result[0].passageWithBlank), /they _____\./);
  assert.equal(result[0].correctAnswer, "1");

  const mismatched = structuredClone(candidate);
  mismatched.blankBlueprint.optionIntentLedger.distractorIntents[0].proposedText =
    "separate every signal from the visible option";
  const rejected = await runSuccessfulResponse({
    profileId:
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
    subType: "BLANK_INFERENCE",
    passage,
    candidate: mismatched,
  });
  assert.equal(rejected.fetches, 1);
  assert.deepEqual(rejected.result, []);
  assert.equal(rejected.runtime.observed.length, 1);
  assert.equal(rejected.runtime.decisions.length, 1);
  assert.equal(
    rejected.runtime.decisions[0].value,
    rejected.runtime.observed[0][0],
  );
  assert.equal(rejected.runtime.decisions[0].outcome, "parsed_rejected");

  // The literal true values are model assertions, not admission proof. Keep
  // the ledger text synchronized so the adapter accepts it, then introduce a
  // punctuation seam that the deterministic quality gate must recompute from
  // the actual student-visible blank surface.
  const falseSeamAttestation = structuredClone(candidate);
  falseSeamAttestation.options[1].text = `${falseSeamAttestation.options[1].text}.`;
  falseSeamAttestation.blankBlueprint.optionIntentLedger.distractorIntents[0]
    .proposedText = falseSeamAttestation.options[1].text;
  assert.deepEqual(falseSeamAttestation.blankBlueprint.seamAudit, {
    allFiveGrammatical: true,
    noOptionRepeatsBoundaryMaterial: true,
    noPolarityOrLengthGiveaway: true,
  });
  const seamRejected = await runSuccessfulResponse({
    profileId:
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
    subType: "BLANK_INFERENCE",
    passage,
    candidate: falseSeamAttestation,
  });
  assert.equal(seamRejected.fetches, 1);
  assert.deepEqual(seamRejected.result, []);
  assert.equal(seamRejected.runtime.observed.length, 1);
  assert.equal(seamRejected.runtime.decisions.length, 1);
  assert.equal(seamRejected.runtime.decisions[0].outcome, "parsed_rejected");
});
