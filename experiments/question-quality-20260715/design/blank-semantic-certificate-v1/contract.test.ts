import assert from "node:assert/strict";
import test from "node:test";

import {
  bindAndRenderBlankSemanticCertificate,
  BLANK_SEMANTIC_CERTIFICATE_VERSION,
  blankSemanticCertificateSchema,
  buildBlindBlankSemanticCertificatePrompt,
  propositionAxisDifferences,
  type BlankProposition,
  type BlankSemanticCandidate,
  type BlankSemanticCertificate,
} from "./contract";

const passage =
  "Many organizations assume that tighter central control always improves consistency. " +
  "Yet when decisions are distributed, local teams detect changing conditions earlier. " +
  "Local teams can then adjust practice without discarding shared goals. " +
  "This does not eliminate central standards; it means standards work best when those closest to a problem can adapt them.";

const candidate: BlankSemanticCandidate = {
  direction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
  passageText: passage,
  originalExpression:
    "standards work best when those closest to a problem can adapt them",
  surroundingText:
    "This does not eliminate central standards; it means standards work best when those closest to a problem can adapt them.",
  blankAnswerMode: "PARAPHRASE",
  options: [
    { label: "1", text: "shared standards improve when local actors can adapt their use" },
    { label: "2", text: "shared standards improve when central authorities alone adapt them" },
    { label: "3", text: "shared standards fail when local actors adapt their use" },
    { label: "4", text: "shared standards improve only if local actors face no constraints" },
    { label: "5", text: "local adaptation governs every organizational decision without exception" },
  ],
  correctAnswer: "1",
  difficulty: "KILLER",
  explanation: "DO NOT LEAK GENERATED EXPLANATION",
  wrongOptionExplanations: { "2": "DO NOT LEAK GENERATED WRONG OPTION PROSE" },
  blankBlueprint: { answerMeaningAxis: "DO NOT LEAK INTERNAL BLUEPRINT" },
};

const claim: BlankProposition = {
  actorRoleIds: ["R1"],
  targetRoleIds: ["R2"],
  polarity: "AFFIRMATIVE",
  condition: "CONTEXT_DEPENDENT",
  modality: "QUALIFIED",
  relation: "IMPROVES",
  causalDirection: "ACTOR_TO_TARGET",
  scope: "GENERAL_CLASS",
  quantifier: "NON_UNIVERSAL",
};

function analysis(
  label: "1" | "2" | "3" | "4" | "5",
  proposition: BlankProposition,
  axis: BlankSemanticCertificate["optionAnalyses"][number]["divergentAxes"],
): BlankSemanticCertificate["optionAnalyses"][number] {
  const option = candidate.options.find((entry) => entry.label === label)!;
  return {
    label,
    optionTextExact: option.text,
    verdict: axis.length === 0 ? "FULL_EQUIVALENT" : "ONE_AXIS_DISTORTION",
    proposition,
    divergentAxes: axis,
    semanticOverlap: "HIGH",
    supportingRoleIds: ["R1", "R2"],
    sourceEvidenceExact: [
      "Yet when decisions are distributed, local teams detect changing conditions earlier.",
      "Local teams can then adjust practice without discarding shared goals.",
    ],
    competingEquivalentReading: "NONE_DEFENSIBLE",
  };
}

const certificate: BlankSemanticCertificate = {
  certificateVersion: BLANK_SEMANTIC_CERTIFICATE_VERSION,
  overallVerdict: "UNIQUE_ANSWER",
  studentAnswer: "1",
  evidenceRoles: [
    {
      roleId: "R1",
      roleClass: "PERSON_OR_GROUP",
      evidenceSpanExact: "local teams",
    },
    {
      roleId: "R2",
      roleClass: "OBJECT_OR_SYSTEM",
      evidenceSpanExact: "central standards",
    },
    {
      roleId: "R3",
      roleClass: "INSTITUTION",
      evidenceSpanExact: "tighter central control",
    },
  ],
  inferredTargetProposition: claim,
  targetEvidenceExact: [
    "Yet when decisions are distributed, local teams detect changing conditions earlier.",
    "Local teams can then adjust practice without discarding shared goals.",
  ],
  optionAnalyses: [
    analysis("1", claim, []),
    analysis(
      "2",
      { ...claim, actorRoleIds: ["R3"] },
      ["ACTOR_TARGET"],
    ),
    analysis("3", { ...claim, polarity: "NEGATED" }, ["POLARITY"]),
    analysis(
      "4",
      { ...claim, condition: "NECESSARY_CONDITION" },
      ["CONDITION_MODALITY"],
    ),
    analysis(
      "5",
      { ...claim, scope: "UNIVERSAL", quantifier: "ALL" },
      ["SCOPE_QUANTIFIER"],
    ),
  ],
};

test("a unique four-axis KILLER certificate renders server-owned concise copy", () => {
  const result = bindAndRenderBlankSemanticCertificate(candidate, certificate);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(Object.keys(result.rendered.wrongOptionExplanations).length, 4);
  assert.equal(result.rendered.keyPoints.length, 2);
  const rendered = JSON.stringify(result.rendered);
  assert.doesNotMatch(rendered, /DO NOT LEAK/u);
  assert.deepEqual(result.calculatedDecoyAxes["2"], ["ACTOR_TARGET"]);
  assert.deepEqual(result.calculatedDecoyAxes["3"], ["POLARITY"]);
});

test("blind prompt blanks the source span and omits answer, design, and explanations", () => {
  const prompt = buildBlindBlankSemanticCertificatePrompt(candidate);
  assert.match(prompt, /__________/u);
  assert.doesNotMatch(prompt, /standards work best when those closest/u);
  assert.doesNotMatch(prompt, /DO NOT LEAK/u);
  assert.doesNotMatch(prompt, /정답은 1번/u);
  for (const option of candidate.options) assert.match(prompt, new RegExp(option.text));
});

test("the binder independently calculates all five protected semantic axes", () => {
  const mutations: Array<[Partial<BlankProposition>, string]> = [
    [{ actorRoleIds: ["R3"] }, "ACTOR_TARGET"],
    [{ polarity: "NEGATED" }, "POLARITY"],
    [{ condition: "NECESSARY_CONDITION" }, "CONDITION_MODALITY"],
    [{ relation: "CAUSES" }, "CAUSAL_RELATION"],
    [{ scope: "UNIVERSAL" }, "SCOPE_QUANTIFIER"],
  ];
  for (const [mutation, expected] of mutations) {
    assert.deepEqual(propositionAxisDifferences(claim, { ...claim, ...mutation }), [
      expected,
    ]);
  }
});

test("a solver certificate that distorts the keyed answer fails closed", () => {
  const changed = structuredClone(certificate);
  changed.optionAnalyses[0].proposition = {
    ...changed.optionAnalyses[0].proposition,
    polarity: "NEGATED",
  };
  changed.optionAnalyses[0].divergentAxes = ["POLARITY"];
  changed.optionAnalyses[0].verdict = "ONE_AXIS_DISTORTION";
  const result = bindAndRenderBlankSemanticCertificate(candidate, changed);
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  const codes = result.rejectionCodes.join(",");
  assert.ok(result.rejectionCodes.includes("ANSWER_ROLE_MISMATCH"), codes);
  assert.ok(result.rejectionCodes.includes("ANSWER_NOT_EQUIVALENT"), codes);
});

test("text, role, and source-evidence claims are bound to actual student surfaces", () => {
  const changed = structuredClone(certificate);
  changed.optionAnalyses[1].optionTextExact = "fabricated option";
  changed.optionAnalyses[1].supportingRoleIds = ["R8"];
  changed.optionAnalyses[1].sourceEvidenceExact = ["fabricated source evidence"];
  const result = bindAndRenderBlankSemanticCertificate(candidate, changed);
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.ok(result.rejectionCodes.includes("OPTION_TEXT_MISMATCH"));
  assert.ok(result.rejectionCodes.includes("ROLE_REFERENCE_UNKNOWN"));
  assert.ok(result.rejectionCodes.includes("EVIDENCE_NOT_BOUND"));
});

test("KILLER rejects multi-axis, low-overlap, duplicate-axis distractors", () => {
  const changed = structuredClone(certificate);
  changed.optionAnalyses[1].proposition.polarity = "NEGATED";
  changed.optionAnalyses[1].divergentAxes = ["ACTOR_TARGET", "POLARITY"];
  changed.optionAnalyses[1].verdict = "MULTI_AXIS_DISTORTION";
  changed.optionAnalyses[2].proposition = {
    ...claim,
    actorRoleIds: ["R3"],
  };
  changed.optionAnalyses[2].divergentAxes = ["ACTOR_TARGET"];
  changed.optionAnalyses[2].semanticOverlap = "MEDIUM";
  const result = bindAndRenderBlankSemanticCertificate(candidate, changed);
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.ok(result.rejectionCodes.includes("TOO_MANY_DISTORTION_AXES"));
  assert.ok(result.rejectionCodes.includes("OVERLAP_TOO_LOW"));
  assert.ok(result.rejectionCodes.includes("AXIS_DIVERSITY_LOW"));
});

test("non-unique, competing, malformed, and non-unique source cases fail closed", () => {
  const nonUnique = structuredClone(certificate);
  nonUnique.overallVerdict = "MULTIPLE_ANSWERS";
  nonUnique.studentAnswer = "MULTIPLE";
  nonUnique.optionAnalyses[1].competingEquivalentReading = "PLAUSIBLE_EQUIVALENT";
  const result = bindAndRenderBlankSemanticCertificate(candidate, nonUnique);
  assert.equal(result.accepted, false);
  if (!result.accepted) {
    assert.ok(result.rejectionCodes.includes("SOLVER_NOT_UNIQUE"));
    assert.ok(result.rejectionCodes.includes("ALTERNATIVE_READING_DEFENSIBLE"));
  }

  const unknownField = structuredClone(certificate) as unknown as Record<string, unknown>;
  unknownField.modelReasoning = "free-form reasoning is forbidden";
  assert.equal(blankSemanticCertificateSchema.safeParse(unknownField).success, false);

  const duplicateSpanCandidate = {
    ...candidate,
    passageText: `${passage} ${candidate.originalExpression}`,
  };
  const duplicate = bindAndRenderBlankSemanticCertificate(
    duplicateSpanCandidate,
    certificate,
  );
  assert.equal(duplicate.accepted, false);
  if (!duplicate.accepted) {
    assert.deepEqual(duplicate.rejectionCodes, ["SOURCE_SPAN_NOT_UNIQUE"]);
  }
});
