import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES,
  adaptQuestionGenerationResearchProfileCandidate,
  applyQuestionGenerationResearchPromptProfile,
  buildQuestionGenerationResearchProfileResponseSchema,
  getQuestionGenerationResearchPromptProfileId,
  getQuestionGenerationResearchPromptProfileMaxOutputTokens,
  isQuestionGenerationResearchSingleShotProfileActive,
  runWithQuestionGenerationResearchPromptProfile,
  type QuestionGenerationResearchPromptProfileId,
} from "@/lib/question-generation-research-profiles";
import {
  QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  runWithQuestionGenerationResearchRuntime,
  type QuestionGenerationResearchOperation,
  type QuestionGenerationResearchRuntime,
  type QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";

class ProfileProbeRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId = "profile-probe";
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

function withProfile<T>(
  profileId: QuestionGenerationResearchPromptProfileId,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithQuestionGenerationResearchPromptProfile(profileId, () =>
    runWithQuestionGenerationResearchRuntime(new ProfileProbeRuntime(), fn),
  );
}

const BASE_SURFACE = Object.freeze({
  typePrompt: "CURRENT TYPE",
  typeQualityRubric: "CURRENT RUBRIC",
  targetCandidateBlock: "CURRENT CANDIDATES",
  finalChecklist: "CURRENT CHECKLIST",
  customPrompt: "CURRENT SETTINGS",
});

test("ordinary no-profile calls preserve exact object identity", () => {
  const schema = z.object({ questions: z.array(z.object({ value: z.string() })) });
  assert.equal(
    applyQuestionGenerationResearchPromptProfile(BASE_SURFACE, {
      subType: "GRAMMAR_ERROR",
      plan: "STANDARD",
    }),
    BASE_SURFACE,
  );
  assert.equal(
    buildQuestionGenerationResearchProfileResponseSchema(schema, {
      subType: "GRAMMAR_ERROR",
      plan: "STANDARD",
    }),
    schema,
  );
  const candidate = { value: "ordinary" };
  const adapted = adaptQuestionGenerationResearchProfileCandidate(
    candidate,
    "passage",
  );
  assert.equal(adapted.ok, true);
  if (!adapted.ok) return;
  assert.equal(
    adapted.question,
    candidate,
  );
});

test("profile scope requires the sealed research runtime and cannot nest", async () => {
  await assert.rejects(
    () =>
      runWithQuestionGenerationResearchPromptProfile(
        QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G0_CURRENT_CONTROL,
        () => getQuestionGenerationResearchPromptProfileId(),
      ),
    /requires an active/,
  );
  await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G0_CURRENT_CONTROL,
    async () => {
      assert.equal(isQuestionGenerationResearchSingleShotProfileActive(), true);
      await assert.rejects(
        () =>
          runWithQuestionGenerationResearchPromptProfile(
            QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G1_FINAL_CHECKLIST_ABLATION,
            async () => undefined,
          ),
        /already active/,
      );
    },
  );
});

test("the eight prompt treatments are exact and type/plan bounded", async () => {
  const g0 = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G0_CURRENT_CONTROL,
    () =>
      applyQuestionGenerationResearchPromptProfile(BASE_SURFACE, {
        subType: "GRAMMAR_ERROR",
        plan: "STANDARD",
      }),
  );
  assert.deepEqual(g0, BASE_SURFACE);
  assert.equal(
    await withProfile(
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G0_CURRENT_CONTROL,
      () => getQuestionGenerationResearchPromptProfileMaxOutputTokens(),
    ),
    6_000,
  );
  assert.equal(
    await withProfile(
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B0_CURRENT_CONTROL,
      () => getQuestionGenerationResearchPromptProfileMaxOutputTokens(),
    ),
    4_000,
  );

  const g1 = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G1_FINAL_CHECKLIST_ABLATION,
    () =>
      applyQuestionGenerationResearchPromptProfile(BASE_SURFACE, {
        subType: "GRAMMAR_ERROR",
        plan: "STANDARD",
      }),
  );
  assert.equal(g1.finalChecklist, "");
  assert.equal(g1.typePrompt, BASE_SURFACE.typePrompt);

  for (const profileId of [
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G2_POSITIVE_COMPACT,
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
  ]) {
    const surface = await withProfile(profileId, () =>
      applyQuestionGenerationResearchPromptProfile(BASE_SURFACE, {
        subType: "GRAMMAR_ERROR",
        plan: "PREMIUM",
      }),
    );
    assert.match(surface.typePrompt, /CORE-10/);
    assert.equal(surface.typeQualityRubric, "");
    assert.equal(surface.targetCandidateBlock, "");
    assert.equal(surface.customPrompt, "");
  }

  const b1 = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B1_TYPE_SCOPED_TAIL,
    () =>
      applyQuestionGenerationResearchPromptProfile(BASE_SURFACE, {
        subType: "BLANK_INFERENCE",
        plan: "STANDARD",
      }),
  );
  assert.equal(b1.standardContractScope, "force_type_scoped");

  for (const profileId of [
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B2_POSITIVE_COMPACT,
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
  ]) {
    const surface = await withProfile(profileId, () =>
      applyQuestionGenerationResearchPromptProfile(BASE_SURFACE, {
        subType: "BLANK_INFERENCE",
        plan: "PREMIUM",
      }),
    );
    assert.match(surface.typePrompt, /모든 선지가 같은 문법 자리/);
    assert.equal(surface.standardContractScope, "force_type_scoped");
    assert.equal(surface.customPrompt, "");
  }

  await assert.rejects(
    () =>
      withProfile(
        QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B1_TYPE_SCOPED_TAIL,
        () =>
          applyQuestionGenerationResearchPromptProfile(BASE_SURFACE, {
            subType: "BLANK_INFERENCE",
            plan: "PREMIUM",
          }),
      ),
    /byte-identical to B0/,
  );
  await assert.rejects(
    () =>
      withProfile(
        QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G0_CURRENT_CONTROL,
        () =>
          applyQuestionGenerationResearchPromptProfile(BASE_SURFACE, {
            subType: "BLANK_INFERENCE",
            plan: "STANDARD",
          }),
      ),
    /requires GRAMMAR_ERROR/,
  );
});

test("G3 and B3 schemas replace only the internal design field and stay exact", async () => {
  const base = z.object({ questions: z.array(z.object({ value: z.string() })) });
  const grammar = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    () =>
      buildQuestionGenerationResearchProfileResponseSchema(base, {
        subType: "GRAMMAR_ERROR",
        plan: "STANDARD",
        grammarMarkerCount: 5,
        grammarAnswerCount: 1,
      }),
  );
  const grammarJson = z.toJSONSchema(grammar) as unknown as {
    properties: {
      questions: {
        minItems: number;
        maxItems: number;
        items: {
          required: string[];
          properties: Record<string, unknown> & {
            siteCertificate: {
              required: string[];
              properties: Record<string, unknown>;
            };
          };
        };
      };
    };
  };
  assert.equal(grammarJson.properties.questions.minItems, 1);
  assert.equal(grammarJson.properties.questions.maxItems, 1);
  assert.ok(grammarJson.properties.questions.items.properties.siteCertificate);
  assert.equal(
    Object.hasOwn(grammarJson.properties.questions.items.properties, "errorDesign"),
    false,
  );
  assert.deepEqual(grammarJson.properties.questions.items.required, [
    "siteCertificate",
  ]);
  assert.deepEqual(
    grammarJson.properties.questions.items.properties.siteCertificate.required,
    ["certificationStatus"],
  );
  assert.equal(JSON.stringify(grammarJson).includes('"anyOf"'), false);
  assert.equal(JSON.stringify(grammarJson).includes('"oneOf"'), false);

  const minimalAbstention = {
    questions: [
      {
        siteCertificate: {
          certificationStatus: "NO_SAFE_SITE",
          abstentionReason:
            "Every plausible mutation remains grammatical under an alternative parse.",
        },
      },
    ],
  };
  assert.equal(grammar.safeParse(minimalAbstention).success, true);
  assert.equal(
    grammar.safeParse({
      questions: [
        { siteCertificate: { certificationStatus: "NO_SAFE_SITE" } },
      ],
    }).success,
    false,
  );
  assert.equal(
    grammar.safeParse({
      questions: [
        {
          siteCertificate: {
            certificationStatus: "NO_SAFE_SITE",
            abstentionReason: "   ",
          },
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    grammar.safeParse({
      questions: [
        {
          siteCertificate: {
            certificationStatus: "NO_SAFE_SITE",
            abstentionReason: "No unambiguous site.",
            sourceExpressionExact: "fabricated",
          },
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    grammar.safeParse({
      questions: [
        {
          direction: "A fabricated question shell",
          siteCertificate: {
            certificationStatus: "NO_SAFE_SITE",
            abstentionReason: "No unambiguous site.",
          },
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    grammar.safeParse({
      questions: [
        { siteCertificate: { certificationStatus: "CERTIFIED" } },
      ],
    }).success,
    false,
  );

  const blank = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
    () =>
      buildQuestionGenerationResearchProfileResponseSchema(base, {
        subType: "BLANK_INFERENCE",
        plan: "PREMIUM",
        blankInferenceBlankCount: 1,
      }),
  );
  const blankProperties = (
    z.toJSONSchema(blank) as unknown as {
      properties: {
        questions: { items: { properties: Record<string, unknown> } };
      };
    }
  ).properties.questions.items.properties;
  assert.ok(blankProperties.blankBlueprint);
  assert.equal(Object.hasOwn(blankProperties, "blankDesign"), false);

  await assert.rejects(
    () =>
      withProfile(
        QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
        () =>
          buildQuestionGenerationResearchProfileResponseSchema(base, {
            subType: "BLANK_INFERENCE",
            plan: "STANDARD",
            blankInferenceBlankCount: 2,
          }),
      ),
    /exactly one blank/,
  );
});

test("G3 adapter binds the certificate to exact passage and marked fields", async () => {
  const passage = "The signal that reaches the receiver remains stable.";
  const certificate = {
    certificationStatus: "CERTIFIED",
    sourceSentenceExact: passage,
    sourceExpressionExact: "reaches",
    surroundingTextExact: passage,
    pointCode: "d",
    frame: "subject-verb agreement",
    governingRule: "The singular subject signal licenses reaches.",
    mutation: {
      sourceForm: "reaches",
      displayedError: "reach",
      correction: "reaches",
      mutationClass: "SUBJECT_VERB_AGREEMENT",
    },
    strongestAlternativeParse: "Treat signal as plural.",
    whyAlternativeFails: "Signal is morphologically singular.",
    mutationOnlyCertifiedSite: true,
  };
  const candidate = {
    siteCertificate: certificate,
    markedExpressions: [
      {
        label: "(A)",
        expression: "reaches",
        errorExpression: "reach",
        correction: "reaches",
        surroundingText: passage,
        pointCode: "d",
        isError: true,
      },
      {
        label: "(B)",
        expression: "stable",
        errorExpression: "stable",
        surroundingText: passage,
        pointCode: "f",
        isError: false,
      },
    ],
  };
  await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    () => {
      const adapted = adaptQuestionGenerationResearchProfileCandidate(
        candidate,
        passage,
      );
      assert.equal(adapted.ok, true);
      if (!adapted.ok) return;
      assert.equal(Object.hasOwn(adapted.question, "siteCertificate"), false);
      assert.deepEqual(JSON.parse(String(adapted.question.errorDesign)), certificate);

      const wrong = structuredClone(candidate);
      (wrong.markedExpressions[0] as Record<string, unknown>).errorExpression =
        "reaching";
      const rejected = adaptQuestionGenerationResearchProfileCandidate(
        wrong,
        passage,
      );
      assert.equal(rejected.ok, false);

      const ambiguous = structuredClone(candidate);
      ambiguous.siteCertificate.surroundingTextExact =
        certificate.sourceExpressionExact;
      (ambiguous.markedExpressions[0] as Record<string, unknown>).surroundingText =
        certificate.sourceExpressionExact;
      const ambiguityRejected = adaptQuestionGenerationResearchProfileCandidate(
        ambiguous,
        `${passage} ${certificate.sourceExpressionExact}`,
      );
      assert.equal(ambiguityRejected.ok, false);

      const fabricatedDecoy = structuredClone(candidate);
      fabricatedDecoy.markedExpressions[1].expression = "fabricated token";
      fabricatedDecoy.markedExpressions[1].errorExpression = "fabricated token";
      const fabricatedDecoyRejected =
        adaptQuestionGenerationResearchProfileCandidate(
          fabricatedDecoy,
          passage,
        );
      assert.equal(fabricatedDecoyRejected.ok, false);
    },
  );
});

test("B3 adapter binds evidence, slot boundaries, all five intents, and key", async () => {
  const passage =
    "Evidence helps only when readers organize the signal carefully before acting.";
  const originalExpression = "organize the signal carefully";
  const options = [
    "organize the signal carefully",
    "collect every signal equally",
    "ignore the signal entirely",
    "delay all action forever",
    "replace evidence with instinct",
  ].map((optionText, index) => ({ label: String(index + 1), text: optionText }));
  const distractorMechanisms = {
    "2": "CAUSE_EFFECT_REVERSAL",
    "3": "AGENT_TARGET_SWAP",
    "4": "SCOPE_NARROWING",
    "5": "STANCE_SHIFT",
  } as const;
  const intent = (label: string, status: "CORRECT" | "DISTRACTOR") => ({
    label,
    status,
    proposedText: options[Number(label) - 1].text,
    ...(status === "CORRECT"
      ? {
          meaningRelation: "EQUIVALENT_SYNTHESIS",
          evidenceIds: ["E1"],
          sameSlotProof: "verb phrase",
        }
      : {
          intent:
            distractorMechanisms[
              label as keyof typeof distractorMechanisms
            ],
          borrowedPassageConcept: "signal",
          errorDistance: {
            semanticOverlap: "HIGH",
            distortionCount: "ONE",
            eliminationDepth: "TWO_LINKED_CLUES",
          },
          decisiveExclusion: { evidenceIds: ["E1"], reason: "reversed" },
          mutuallyExclusiveWithAnswer: "opposite relation",
          sameSlotProof: "verb phrase",
        }),
  });
  const blueprint = {
    target: {
      originalExpressionExact: originalExpression,
      surroundingTextExact: passage,
      discourseRole: "CONCLUSION",
      answerMeaningAxis: "Readers must organize evidence.",
      evidenceAnchors: [
        { id: "E1", exactQuote: passage, contribution: "states the condition" },
      ],
      slotContract: {
        prefixExact: "Evidence helps only when readers ",
        suffixExact: " before acting.",
        syntacticCategory: "VERB_PHRASE",
        polarity: "POSITIVE",
        scope: "WHOLE_PASSAGE_THESIS",
        register: "ACADEMIC",
      },
    },
    optionIntentLedger: {
      correctIntent: intent("1", "CORRECT"),
      distractorIntents: ["2", "3", "4", "5"].map((label) =>
        intent(label, "DISTRACTOR"),
      ),
    },
    seamAudit: {
      allFiveGrammatical: true,
      noOptionRepeatsBoundaryMaterial: true,
      noPolarityOrLengthGiveaway: true,
    },
  };
  const candidate = {
    blankBlueprint: blueprint,
    originalExpression,
    surroundingText: passage,
    options,
    correctAnswer: "1",
  };
  await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
    () => {
      const adapted = adaptQuestionGenerationResearchProfileCandidate(
        candidate,
        passage,
      );
      assert.equal(adapted.ok, true);
      if (!adapted.ok) return;
      assert.equal(Object.hasOwn(adapted.question, "blankBlueprint"), false);
      assert.deepEqual(JSON.parse(String(adapted.question.blankDesign)), blueprint);

      const wrong = structuredClone(candidate);
      (
        wrong.blankBlueprint.optionIntentLedger.distractorIntents[0] as Record<
          string,
          unknown
        >
      ).proposedText = "not the visible option";
      const rejected = adaptQuestionGenerationResearchProfileCandidate(
        wrong,
        passage,
      );
      assert.equal(rejected.ok, false);

      const unboundEvidence = structuredClone(candidate);
      (
        unboundEvidence.blankBlueprint.optionIntentLedger
          .correctIntent as Record<string, unknown>
      ).evidenceIds = ["E2"];
      const evidenceRejected = adaptQuestionGenerationResearchProfileCandidate(
        unboundEvidence,
        passage,
      );
      assert.equal(evidenceRejected.ok, false);

      const duplicatedMechanism = structuredClone(candidate);
      const duplicatedIntents = duplicatedMechanism.blankBlueprint
        .optionIntentLedger.distractorIntents as Array<Record<string, unknown>>;
      duplicatedIntents[1].intent = duplicatedIntents[0].intent;
      const duplicatedMechanismRejected =
        adaptQuestionGenerationResearchProfileCandidate(
          duplicatedMechanism,
          passage,
        );
      assert.equal(duplicatedMechanismRejected.ok, false);
    },
  );
});
