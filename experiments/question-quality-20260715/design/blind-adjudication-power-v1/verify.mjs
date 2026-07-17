import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPowerResults,
  conditionalPower,
  zeroEventUpperBound,
} from "./power-analysis.mjs";
import {
  CALIBRATION_THRESHOLDS,
  canonicalRfc3339Micros,
  makeMetric,
  metricMeets,
  scoreCalibrationReviewer,
} from "./calibration-scoring.mjs";
import {
  assertSchemaSupported,
  usedSchemaKeywords,
  validateJsonSchema,
} from "./strict-json-schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(join(here, name), "utf8"));
const design = readJson("design.json");
const schema = readJson("review-record.schema.json");
const certificateSchema = readJson("calibration-certificate.schema.json");
const fixtures = readJson("synthetic-fixtures.json");
const mutationFixtures = readJson("mutation-fixtures.json");
const savedPower = readJson("power-results.json");
const sourceClosure = readJson("source-closure.json");
const repoRoot = join(here, "../../../..");

const checks = [];
function assert(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

function deepClose(actual, expected, path = "root") {
  if (typeof actual === "number" && typeof expected === "number") {
    assert(Math.abs(actual - expected) <= 1e-12, `${path} numeric replay`);
    return;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    assert(
      Array.isArray(actual) && Array.isArray(expected),
      `${path} both arrays`,
    );
    assert(actual.length === expected.length, `${path} array length`);
    actual.forEach((value, index) =>
      deepClose(value, expected[index], `${path}[${index}]`),
    );
    return;
  }
  if (actual && typeof actual === "object") {
    assert(expected && typeof expected === "object", `${path} both objects`);
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    assert(
      JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
      `${path} object keys`,
    );
    for (const key of actualKeys)
      deepClose(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  assert(actual === expected, `${path} exact value`);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const propositionAxes = [
  "actorOrTarget",
  "polarity",
  "conditionOrModality",
  "causalRelationAndDirection",
  "scopeOrQuantifier",
  "stance",
  "temporalRelation",
];

function analyzeReviewRecord(record) {
  const schemaErrors = validateJsonSchema(schema, record);
  if (schemaErrors.length > 0) {
    return {
      classification: "RECORD_INVALID",
      recordInvalidCodes: ["JSON_SCHEMA_INVALID"],
      itemFindingCodes: [],
      schemaErrors,
    };
  }

  const invalid = new Set();
  const findings = new Set();
  const addInvalid = (code) => invalid.add(code);
  const addFinding = (code) => findings.add(code);

  const expectedFamily = design.allTypeEvidenceContract.typeFamily[record.type];
  if (record.evidenceFamily !== expectedFamily) addInvalid("TYPE_EVIDENCE_FAMILY_MISMATCH");
  const sealedMicros = canonicalRfc3339Micros(record.blindSolve.sealedAt);
  const revealedMicros = canonicalRfc3339Micros(record.revealAudit.revealedAt);
  if (sealedMicros === null) addInvalid("BLIND_SOLVE_TIMESTAMP_INVALID");
  if (revealedMicros === null) addInvalid("REVEAL_TIMESTAMP_INVALID");
  if (sealedMicros !== null && revealedMicros !== null && revealedMicros <= sealedMicros) {
    addInvalid("PHASE_ORDER_INVALID");
  }

  const hasLabelAnswer = record.blindSolve.answerLabels.length > 0;
  const hasTextAnswer = record.blindSolve.answerText.mode !== "NONE";
  if (record.blindSolve.disposition === "ANSWER" && !hasLabelAnswer && !hasTextAnswer) {
    addInvalid("ANSWER_PAYLOAD_EMPTY");
  }
  if (
    ["NO_ANSWER", "UNEVALUABLE"].includes(record.blindSolve.disposition) &&
    (hasLabelAnswer || hasTextAnswer)
  ) {
    addInvalid("NONANSWER_HAS_PAYLOAD");
  }
  if (
    record.blindSolve.disposition === "MULTIPLE" &&
    record.blindSolve.answerLabels.length < 2 &&
    record.blindSolve.alternativeAnswerLabels.length < 2 &&
    !hasTextAnswer
  ) {
    addInvalid("MULTIPLE_PAYLOAD_INSUFFICIENT");
  }

  const failedDomains = Object.entries(record.validity.domains)
    .filter(([, pass]) => !pass)
    .map(([domain]) => domain);
  for (const domain of failedDomains) addFinding(`ITEM_FATAL_DOMAIN_${domain.toUpperCase()}`);
  if (record.validity.unresolved) addFinding("ITEM_FATAL_UNRESOLVED");
  const expectedAnyFatal = failedDomains.length > 0 || record.validity.unresolved;
  if (record.validity.anyFatal !== expectedAnyFatal) {
    addInvalid("FATAL_DOMAIN_AGGREGATE_MISMATCH");
  }
  if (
    record.validity.independentlyDefensibleAnswers.length !==
    record.validity.independentlyDefensibleAnswerCardinality
  ) {
    addInvalid("ANSWER_LIST_CARDINALITY_MISMATCH");
  }
  if (
    record.validity.declaredAnswerCardinality !==
    record.validity.independentlyDefensibleAnswerCardinality
  ) {
    addFinding("ITEM_ANSWER_CARDINALITY_MISMATCH");
    if (!record.validity.anyFatal) addInvalid("FATAL_ITEM_FINDING_NOT_ACKNOWLEDGED");
  }

  if (
    record.explanationAudit.allClaimsAccurate !==
    record.validity.domains.explanationTruth
  ) {
    addInvalid("EXPLANATION_DOMAIN_AGGREGATE_MISMATCH");
  }
  if (!record.explanationAudit.allClaimsAccurate) addFinding("ITEM_EXPLANATION_FALSE");
  if (record.explanationAudit.unsupportedClaimCount > 0) {
    addFinding("ITEM_EXPLANATION_UNSUPPORTED_CLAIM");
  }

  if (!record.validity.anyFatal && record.craft) {
    const scores = Object.values(record.craft.scores);
    if (["B", "A"].includes(record.grade)) {
      if (scores.some((score) => score < 2) || median(scores) < 3) {
        addInvalid("GRADE_BA_CRAFT_THRESHOLD_MISMATCH");
      }
      if (
        record.craft.intentCoverageFraction < 0.75 ||
        record.craft.materialShortcut ||
        record.craft.scores.explanationEconomy < 2 ||
        record.craft.holisticMaterialDefect
      ) {
        addInvalid("GRADE_BA_READINESS_THRESHOLD_MISMATCH");
      }
    }
    if (record.grade === "A") {
      if (
        scores.some((score) => score < 3) ||
        record.craft.scores.pedagogicalPointWorthiness !== 4 ||
        record.craft.scores.shortcutResistance !== 4
      ) {
        addInvalid("GRADE_A_CRAFT_THRESHOLD_MISMATCH");
      }
      if (record.craft.intentCoverageFraction !== 1) {
        addInvalid("GRADE_A_INTENT_COVERAGE_MISMATCH");
      }
    }
    if (record.grade === "C") addFinding("ITEM_CRAFT_NOT_SHIP_READY");
  }

  let specializedFatalFinding = false;
  if (record.type === "GRAMMAR_ERROR") {
    const audit = record.grammarAudit;
    if (audit.markedSites.length !== audit.declaredMarkerCount) {
      addInvalid("GRAMMAR_MARKER_COUNT_AGGREGATE_MISMATCH");
    }
    const labels = audit.markedSites.map((site) => site.label);
    if (new Set(labels).size !== labels.length) addInvalid("GRAMMAR_LABEL_DUPLICATE");
    const keySites = audit.markedSites.filter((site) => site.isKey);
    if (keySites.length !== audit.declaredAnswerCount) {
      addInvalid("GRAMMAR_KEY_COUNT_AGGREGATE_MISMATCH");
    }
    for (const site of audit.markedSites) {
      if (site.isKey && site.displayedGrammaticality !== "UNGRAMMATICAL") {
        addFinding("ITEM_GRAMMAR_KEY_DEFENSIBLE");
        specializedFatalFinding = true;
      }
      if (!site.isKey && site.displayedGrammaticality !== "GRAMMATICAL") {
        addFinding("ITEM_GRAMMAR_DECOY_INVALID");
        specializedFatalFinding = true;
      }
      if (!site.sourceCorrect || !site.correctionRestoresSource) {
        addFinding("ITEM_GRAMMAR_SOURCE_CORRECTION_FAIL");
        specializedFatalFinding = true;
      }
      if (!site.explanationAccurate) {
        addFinding("ITEM_GRAMMAR_SITE_EXPLANATION_FALSE");
        specializedFatalFinding = true;
      }
      if ((site.isKey && site.diagnosis !== "ANSWER_ERROR") || (!site.isKey && site.diagnosis !== "VALID_DECOY")) {
        addInvalid("GRAMMAR_SITE_DIAGNOSIS_MISMATCH");
      }
    }
    const familyCount = new Set(audit.markedSites.map((site) => site.pointFamily)).size;
    if (familyCount !== audit.distinctPointFamilies) {
      addInvalid("GRAMMAR_POINT_FAMILY_AGGREGATE_MISMATCH");
    }
    const explanationsAccurate = audit.markedSites.every((site) => site.explanationAccurate);
    if (audit.allExplanationsAccurate !== explanationsAccurate) {
      addInvalid("GRAMMAR_EXPLANATION_AGGREGATE_MISMATCH");
    }
    const correctionsRoundTrip = audit.markedSites.every(
      (site) => site.sourceCorrect && site.correctionRestoresSource,
    );
    if (audit.allCorrectionsRoundTrip !== correctionsRoundTrip) {
      addInvalid("GRAMMAR_CORRECTION_AGGREGATE_MISMATCH");
    }
    if (record.grade === "A" && record.difficulty === "KILLER") {
      if (keySites.some((site) => site.pointWorthiness !== 4)) {
        addInvalid("GRAMMAR_A_KEY_POINT_THRESHOLD_MISMATCH");
      }
      if (audit.markedSites.some((site) => !site.isKey && site.pointWorthiness < 2)) {
        addInvalid("GRAMMAR_A_DECOY_POINT_THRESHOLD_MISMATCH");
      }
      if (familyCount < 3) addInvalid("GRAMMAR_A_DIVERSITY_THRESHOLD_MISMATCH");
    }
  }

  if (record.type === "BLANK_INFERENCE") {
    const audit = record.blankAudit;
    const optionLabels = audit.options.map((option) => option.label);
    if (new Set(optionLabels).size !== optionLabels.length) addInvalid("BLANK_OPTION_LABEL_DUPLICATE");
    const keys = audit.options.filter((option) => option.isKey);
    const wrong = audit.options.filter((option) => !option.isKey);
    if (keys.length !== 1) {
      addFinding("ITEM_BLANK_KEY_COUNT_NOT_ONE");
      specializedFatalFinding = true;
    }
    const seamsPass = audit.options.every((option) => option.slotGrammarCompatible);
    if (!seamsPass) {
      addFinding("ITEM_BLANK_SLOT_INCOMPATIBLE");
      specializedFatalFinding = true;
    }
    if (audit.allFiveSlotGrammarCompatible !== seamsPass) {
      addInvalid("BLANK_SEAM_AGGREGATE_MISMATCH");
    }
    if (!audit.uniqueAnswer) {
      addFinding("ITEM_BLANK_ANSWER_NOT_UNIQUE");
      specializedFatalFinding = true;
    }

    const oracleAxes = audit.axisOracle.map((entry) => entry.axis);
    if (
      new Set(oracleAxes).size !== 7 ||
      propositionAxes.some((axis) => !oracleAxes.includes(axis))
    ) {
      addInvalid("BLANK_AXIS_ORACLE_NOT_EXACT_SEVEN");
    }
    for (const entry of audit.axisOracle) {
      if (!entry.answerPreserved) {
        addFinding(`ITEM_BLANK_AXIS_LOSS_${entry.axis.toUpperCase()}`);
        specializedFatalFinding = true;
      }
    }
    const allAxesPreserved = audit.axisOracle.every((entry) => entry.answerPreserved);
    if (audit.answerPreservesAllAxes !== allAxesPreserved) {
      addInvalid("BLANK_AXIS_PRESERVATION_AGGREGATE_MISMATCH");
    }

    const wrongAxes = wrong.map((option) => option.primaryIntentAxis);
    const distinctness = wrong.length ? new Set(wrongAxes).size / wrong.length : 0;
    if (new Set(wrongAxes).size !== wrongAxes.length) {
      addFinding("ITEM_BLANK_DISTRACTOR_AXIS_DUPLICATE");
    }
    if (Math.abs(audit.wrongOptionPrimaryAxisDistinctness - distinctness) > 1e-12) {
      addInvalid("BLANK_DISTINCTNESS_AGGREGATE_MISMATCH");
    }
    if (keys.length === 1) {
      if (keys[0].primaryIntentAxis !== "CORRECT" || keys[0].divergentAxes.length !== 0) {
        addInvalid("BLANK_KEY_AXIS_ENCODING_MISMATCH");
      }
    }
    for (const option of wrong) {
      if (option.primaryIntentAxis === "CORRECT") addInvalid("BLANK_WRONG_AXIS_ENCODED_CORRECT");
      if (!option.passageGrounded) addFinding("ITEM_BLANK_WRONG_NOT_PASSAGE_GROUNDED");
      if (option.divergentAxes.length === 0 || !option.singleDecisiveFlaw) {
        addFinding("ITEM_BLANK_WRONG_NO_DECISIVE_FLAW");
      }
    }
    if (record.grade === "A" && record.difficulty === "KILLER") {
      if (audit.requiredEvidenceLinkCount < 2) addInvalid("BLANK_A_EVIDENCE_THRESHOLD_MISMATCH");
      if (
        wrong.some(
          (option) => option.nearMissStrength < 3 || !option.singleDecisiveFlaw || option.cheapGiveaway,
        )
      ) {
        addInvalid("BLANK_A_NEAR_MISS_THRESHOLD_MISMATCH");
      }
      if (distinctness !== 1) addInvalid("BLANK_A_DISTINCTNESS_THRESHOLD_MISMATCH");
    }
  }

  for (const check of record.typeSpecificEvidence) {
    if (!check.pass) addFinding(`ITEM_TYPE_CHECK_FAILED_${check.checkId}`);
  }
  if (specializedFatalFinding && !record.validity.anyFatal) {
    addInvalid("FATAL_ITEM_FINDING_NOT_ACKNOWLEDGED");
  }

  const recordInvalidCodes = [...invalid].sort();
  const itemFindingCodes = [...findings].sort();
  return {
    classification: recordInvalidCodes.length > 0 ? "RECORD_INVALID" : itemFindingCodes.length > 0 ? "ITEM_FINDING" : "CLEAN_RECORD",
    recordInvalidCodes,
    itemFindingCodes,
    schemaErrors: [],
  };
}

function decodePointerPart(part) {
  return part.replaceAll("~1", "/").replaceAll("~0", "~");
}

function applyMutation(record, mutation) {
  const parts = mutation.path.split("/").slice(1).map(decodePointerPart);
  let parent = record;
  for (const part of parts.slice(0, -1)) parent = parent[part];
  const key = parts.at(-1);
  if (mutation.op === "remove") {
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
    return;
  }
  if (mutation.op === "replace" || mutation.op === "add") {
    parent[key] = structuredClone(mutation.value);
    return;
  }
  throw new Error(`Unsupported fixture mutation ${mutation.op}`);
}

const expectedTypes = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
  "TOPIC_SENTENCE_WRITING",
  "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
];

assert(
  design.schemaVersion === "blind-adjudication-power-v1",
  "design version",
);
assert(design.status === "DESIGN_ONLY_EXECUTION_BLOCKED", "execution blocked");
assert(
  JSON.stringify(design.claimBoundary) ===
    JSON.stringify({
      s1MechanismScreenTopology: "DIRECT_SINGLE_DISPATCH_SINGLE_CANDIDATE",
      productionCoreWireRootClaim: "OFFLINE_REQUEST_CONSTRUCTION_REPLAY_ONLY",
      fullProductionTopologyParityClaimed: false,
      premiumGrammarLadderPolicyParityClaimed: false,
      productionRetryRepairFallbackPolicyParityClaimed: false,
      productionQualityParityClaimed: false,
      requiredBeforeAnyParityClaim:
        "A separate versioned topology audit must bind the admitted live Premium grammar ladder and every retry, repair, fallback, solver, and candidate-producing branch, including its worst-case candidate and cost multiplier.",
    }),
  "S1 core-wire claim boundary fail closed",
);
assert(
  design.apiAccounting.newFullQuestionCandidatesConsumed === 0,
  "design API zero",
);
assert(design.apiAccounting.networkCalls === 0, "design network zero");
assert(design.apiAccounting.databaseCalls === 0, "design DB zero");
assert(design.scope.activeEnglishTypes.length === 25, "25 active types");
assert(
  new Set(design.scope.activeEnglishTypes).size === 25,
  "active types unique",
);
assert(
  JSON.stringify(design.scope.activeEnglishTypes) ===
    JSON.stringify(expectedTypes),
  "active types exact order",
);
assert(
  design.scope.coverageDifficulties.join(",") === "BASIC,INTERMEDIATE,KILLER",
  "all difficulty levels covered",
);
assert(
  design.scope.excludedRegisteredLegacyTypes.includes("TOPIC_MAIN_IDEA"),
  "legacy excluded",
);
assert(
  Object.keys(design.allTypeEvidenceContract.typeFamily).length === 25,
  "25 type-family mappings",
);
assert(
  Object.keys(design.allTypeEvidenceContract.typeFamily).every((type) =>
    expectedTypes.includes(type),
  ),
  "type-family keys active",
);
const boundRubricPath = join(
  repoRoot,
  design.allTypeEvidenceContract.bindingArtifact,
);
assert(existsSync(boundRubricPath), "bound all-types rubric exists");
assert(
  createHash("sha256").update(readFileSync(boundRubricPath)).digest("hex") ===
    design.allTypeEvidenceContract.bindingArtifactObservedSha256,
  "bound all-types rubric hash exact",
);

const budget = design.sampling.candidateBudget;
const scheduled =
  budget.S0_CONNECTIVITY_RUN_IN +
  budget.S0_FOCUS_BASIC_SENTINELS +
  budget.S1_SCREEN +
  budget.S2_FOCUS_FIRST_LOOK +
  budget.S3_ALL_TYPE_SENTINELS +
  budget.S4_FOCUS_EXTENSION;
assert(scheduled === 998, "scheduled candidate max 998");
assert(budget.TOTAL_SCHEDULED_MAX === scheduled, "scheduled total field exact");
assert(
  scheduled + budget.LOCKED_UNUSED === 1000,
  "scheduled plus locked equals global cap",
);
assert(budget.GLOBAL_CAP === 1000, "global cap 1000");
assert(
  design.sampling.S0_CONNECTIVITY_RUN_IN.candidateOpportunities === 2,
  "connectivity two calls",
);
assert(
  design.sampling.S0_CONNECTIVITY_RUN_IN.analysisEligibility === "NONE",
  "connectivity excluded",
);
assert(
  design.sampling.S0_FOCUS_BASIC_SENTINELS.candidateOpportunities === 4,
  "focus BASIC four",
);
assert(design.sampling.S1_SCREEN.minimumCellN === 6, "S1 cell n6");
assert(
  design.sampling.S2_FOCUS_FIRST_LOOK.passageClustersPerTypePlan === 60,
  "S2 cell n60",
);
assert(
  design.sampling.S2_FOCUS_FIRST_LOOK.totalCandidateOpportunities === 480,
  "S2 480",
);
assert(
  design.sampling.S3_ALL_TYPE_SENTINELS.nonFocusTypeCount === 23,
  "23 nonfocus types",
);
assert(
  design.sampling.S3_ALL_TYPE_SENTINELS.rowsPerType === 4,
  "four rows per nonfocus",
);
assert(
  design.sampling.S3_ALL_TYPE_SENTINELS.totalCandidateOpportunities === 92,
  "S3 92",
);
assert(
  design.sampling.S3_ALL_TYPE_SENTINELS.cellPattern.join(",") ===
    "STANDARD_BASIC,STANDARD_KILLER,PREMIUM_BASIC,PREMIUM_KILLER",
  "nonfocus BASIC/KILLER extremes",
);
assert(design.reviewerCalibration.packetSize === 24, "calibration packet 24");
assert(
  ["GRAMMAR", "BLANK", "NONFOCUS"].every(
    (block) =>
      design.reviewerCalibration.composition[block].items === 8 &&
      design.reviewerCalibration.composition[block].fatal === 2 &&
      ["gradeF", "gradeC", "gradeB", "gradeA"].every(
        (grade) => design.reviewerCalibration.composition[block][grade] === 2,
      ),
  ),
  "calibration exact block composition",
);
assert(
  design.reviewerCalibration.composition.global.fatal === 6 &&
    design.reviewerCalibration.composition.global.nonfatal === 18,
  "calibration fatal 6 nonfatal 18",
);
assert(
  design.reviewerCalibration.calibrationReviewState.plan ===
    "CALIBRATION_NOT_APPLICABLE" &&
    design.reviewerCalibration.calibrationReviewState.statusAtReview ===
      "UNASSESSED" &&
    design.reviewerCalibration.calibrationReviewState.certifiedAtReview === false,
  "calibration circular certification removed",
);
assert(
  design.reviewerCalibration.certificateScope.allActiveTypesCertified === false,
  "certificate not all-type blanket",
);
assert(
  design.reviewerCalibration.certificateScope.blankAxes.length === 7 &&
    design.reviewerCalibration.certificateScope.blankAxes.includes("stance") &&
    design.reviewerCalibration.certificateScope.blankAxes.includes(
      "temporalRelation",
    ),
  "certificate exact seven blank axes",
);
const thresholdPair = ({ numerator, denominator }) => [numerator, denominator];
const expectedRuntimeThresholds = {
  global: Object.fromEntries(
    Object.entries(design.reviewerCalibration.passThresholds.global).map(
      ([name, fraction]) => [name, thresholdPair(fraction)],
    ),
  ),
  block: Object.fromEntries(
    Object.entries(design.reviewerCalibration.passThresholds.eachBlock).map(
      ([name, fraction]) => [name.replace(/WhenApplicable$/u, ""), thresholdPair(fraction)],
    ),
  ),
};
assert(
  JSON.stringify(CALIBRATION_THRESHOLDS) ===
    JSON.stringify(expectedRuntimeThresholds),
  "executable calibration thresholds exactly equal design",
);
assert(
  design.reviewerCalibration.metricContract.formulas.blindSolveExactAgreement
    .includes("acceptedAnswerSets"),
  "blind solve formula binds accepted answer sets",
);
assert(
  design.grammarModule.calibrationCertificateSurfaceScope.code ===
    "EXACT_5_MARKERS_1_INVALID",
  "grammar calibration exact surface scope",
);
assert(
  design.sampling.S4_FOCUS_EXTENSION.maximumPassageClustersPerTypePlan === 90,
  "S4 max n90",
);
assert(
  design.sequentialDecision.finalLook.requiredTypePlanEvaluableN === 86,
  "final evaluable n86",
);
assert(
  design.sequentialDecision.finalLook.requiredChallengerFatalCount === 0,
  "final fatal zero",
);
assert(
  2 *
    (design.inference.alphaSpending.perTypeInterim +
      design.inference.alphaSpending.perTypeFinal) ===
    design.inference.familywiseAlpha,
  "alpha union arithmetic",
);
assert(
  zeroEventUpperBound(
    86,
    design.inference.fatalAcceptance.perCellOneSidedAlpha,
  ) < 0.05,
  "n86 simultaneous fatal upper below five percent",
);
assert(
  zeroEventUpperBound(
    85,
    design.inference.fatalAcceptance.perCellOneSidedAlpha,
  ) > 0.05,
  "n85 simultaneous fatal upper above five percent",
);

assert(schema.$schema.includes("2020-12"), "schema draft 2020-12");
assert(schema.additionalProperties === false, "schema root closed");
assert(
  schema.properties.schemaVersion.const === "blind-review-record-v2",
  "review schema v2",
);
assert(schema.properties.type.enum.length === 25, "schema type enum count");
assert(
  JSON.stringify(schema.properties.type.enum) === JSON.stringify(expectedTypes),
  "schema type enum exact",
);
assert(
  schema.$defs.grammarAudit && schema.$defs.blankAudit,
  "focus schema modules",
);
assert(schema.allOf.length >= 3, "schema conditional modules");
assertSchemaSupported(schema);
assertSchemaSupported(certificateSchema);
assert(usedSchemaKeywords(schema).includes("oneOf"), "schema oneOf executed");
assert(usedSchemaKeywords(schema).includes("if"), "schema conditionals executed");

const refSiblingSchema = {
  $defs: { text: { type: "string" } },
  $ref: "#/$defs/text",
  minLength: 3,
};
assert(
  validateJsonSchema(refSiblingSchema, "ab").some((error) => error.keyword === "minLength"),
  "$ref sibling assertion executed",
);
const inheritedRequired = Object.create({ ownedOnlyByPrototype: "not-valid" });
assert(
  validateJsonSchema(
    {
      type: "object",
      required: ["ownedOnlyByPrototype"],
      properties: { ownedOnlyByPrototype: { type: "string" } },
    },
    inheritedRequired,
  ).some((error) => error.keyword === "required"),
  "inherited property cannot satisfy required",
);
for (const malformed of [
  { required: "not-an-array" },
  { type: ["string", "null"] },
  { enum: [] },
  { properties: [] },
  { minItems: -1 },
  { pattern: "[" },
  { unknownKeyword: true },
]) {
  let rejected = false;
  try {
    assertSchemaSupported(malformed);
  } catch {
    rejected = true;
  }
  assert(rejected, `malformed schema rejected ${JSON.stringify(malformed)}`);
}

assert(
  fixtures.privacy.containsActualQuestion === false,
  "fixture no actual question",
);
assert(
  fixtures.privacy.containsActualPassage === false,
  "fixture no actual passage",
);
assert(
  fixtures.privacy.containsDatabaseIdentifier === false,
  "fixture no DB ID",
);
assert(fixtures.privacy.containsCredential === false, "fixture no credential");
for (const fixtureCase of mutationFixtures.cases) {
  const base = fixtures.baseRecords[fixtureCase.base];
  assert(Boolean(base), `fixture ${fixtureCase.id} base exists`);
  const record = structuredClone(base);
  for (const mutation of fixtureCase.mutations) applyMutation(record, mutation);
  const result = analyzeReviewRecord(record);
  const expectedInvalid = [...fixtureCase.expectedRecordInvalidCodes].sort();
  const expectedFindings = [...fixtureCase.expectedItemFindingCodes].sort();
  assert(
    result.classification === fixtureCase.expectedClassification,
    `fixture ${fixtureCase.id} classification ${result.classification}`,
  );
  assert(
    JSON.stringify(result.recordInvalidCodes) === JSON.stringify(expectedInvalid),
    `fixture ${fixtureCase.id} record invalid ${JSON.stringify(result.recordInvalidCodes)}`,
  );
  assert(
    JSON.stringify(result.itemFindingCodes) === JSON.stringify(expectedFindings),
    `fixture ${fixtureCase.id} item findings ${JSON.stringify(result.itemFindingCodes)}`,
  );
}

const hashText = (value) => createHash("sha256").update(value).digest("hex");
const gradePattern = ["F", "F", "C", "C", "B", "B", "A", "A"];
const nonfocusTypes = [
  "TITLE",
  "SENTENCE_ORDER",
  "FILL_BLANK_KEY",
  "SUMMARY_WRITING",
  "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING",
  "VOCAB_CHOICE",
  "MAIN_IDEA",
];

function setSyntheticGrade(record, grade) {
  record.grade = grade;
  if (grade === "F") {
    record.validity.domains.taskAndRender = false;
    record.validity.anyFatal = true;
    record.validity.fatalCodes = ["synthetic-gold-fatal"];
    record.craft = null;
    return;
  }
  record.validity.domains.taskAndRender = true;
  record.validity.anyFatal = false;
  record.validity.fatalCodes = [];
  if (!record.craft) record.craft = structuredClone(fixtures.baseRecords.VALID_NONFOCUS_B.craft);
  if (grade === "A") {
    Object.keys(record.craft.scores).forEach((key) => {
      record.craft.scores[key] = 4;
    });
    record.craft.intentCoverageFraction = 1;
    record.craft.materialShortcut = false;
    record.craft.holisticMaterialDefect = false;
    record.craft.holisticReasonCode = "BEAUTIFUL_CALIBRATION_GOLD";
  }
}

function makeCalibrationPair(block, index) {
  const baseName =
    block === "GRAMMAR"
      ? "VALID_GRAMMAR_A"
      : block === "BLANK"
        ? "VALID_BLANK_A"
        : "VALID_NONFOCUS_B";
  const record = structuredClone(fixtures.baseRecords[baseName]);
  const itemId = `CAL_${block}_${String(index + 1).padStart(2, "0")}`;
  record.itemPseudonym = itemId;
  record.reviewId = `REV_${block}_${String(index + 1).padStart(2, "0")}`;
  record.surfaceSha256 = hashText(`${itemId}:surface`);
  record.relabelMapSha256 = hashText(`${itemId}:relabel`);
  record.blindSolve.sealedRecordSha256 = hashText(`${itemId}:phase1`);
  record.revealAudit.revealSha256 = hashText(`${itemId}:phase2`);
  if (block === "NONFOCUS") {
    record.type = nonfocusTypes[index];
    record.evidenceFamily = design.allTypeEvidenceContract.typeFamily[record.type];
  }
  const grade = gradePattern[index];
  setSyntheticGrade(record, grade);
  const gold = {
    itemId,
    block,
    evidenceFamily: record.evidenceFamily,
    expectedBindings: {
      type: record.type,
      surfaceSha256: record.surfaceSha256,
      relabelMapSha256: record.relabelMapSha256,
      phaseOneRecordSha256: record.blindSolve.sealedRecordSha256,
    },
    acceptedAnswerSets: [
      {
        disposition: record.blindSolve.disposition,
        answerLabels: [
          ...new Set([
            ...record.blindSolve.answerLabels,
            ...record.blindSolve.alternativeAnswerLabels,
          ]),
        ].sort(),
        answerTextSha256: record.blindSolve.answerText.sha256,
      },
    ],
    goldFatal: grade === "F",
    goldGrade: grade,
    grammarOracle:
      block === "GRAMMAR"
        ? record.grammarAudit.markedSites.map((site) => ({
            label: site.label,
            displayedGrammaticality: site.displayedGrammaticality,
            diagnosis: site.diagnosis,
            pointFamily: site.pointFamily,
            correctionRestoresSource: site.correctionRestoresSource,
            explanationAccurate: site.explanationAccurate,
          }))
        : null,
    blankOracle:
      block === "BLANK"
        ? {
            options: record.blankAudit.options.map((option) => ({
              label: option.label,
              slotGrammarCompatible: option.slotGrammarCompatible,
              passageGrounded: option.passageGrounded,
              primaryIntentAxis: option.primaryIntentAxis,
              divergentAxes: option.divergentAxes,
              singleDecisiveFlaw: option.singleDecisiveFlaw,
            })),
            axes: record.blankAudit.axisOracle.map((axis) => ({
              axis: axis.axis,
              answerPreserved: axis.answerPreserved,
            })),
          }
        : null,
  };
  return { record, gold };
}

const calibrationPairs = ["GRAMMAR", "BLANK", "NONFOCUS"].flatMap((block) =>
  Array.from({ length: 8 }, (_, index) => makeCalibrationPair(block, index)),
);
const perfectInput = {
  reviewRecords: calibrationPairs.map(({ record }) => structuredClone(record)),
  goldItems: calibrationPairs.map(({ gold }) => structuredClone(gold)),
  recordSchema: schema,
  typeFamily: design.allTypeEvidenceContract.typeFamily,
};
const perfectScore = scoreCalibrationReviewer(perfectInput);
assert(perfectScore.decision === "PASS", "perfect per-reviewer calibration passes");
assert(
  perfectScore.metrics.global.blindSolveExactAgreement.numerator === 1 &&
    perfectScore.metrics.global.blindSolveExactAgreement.denominator === 1 &&
    perfectScore.metrics.global.blindSolveCounts.correct === 24 &&
    perfectScore.metrics.global.blindSolveCounts.required === 24,
  "perfect blind solve agreement derives 24/24",
);
assert(perfectScore.metrics.global.counts.TP === 6, "calibration raw TP six");
assert(perfectScore.metrics.global.counts.TN === 18, "calibration raw TN eighteen");
assert(
  perfectScore.metrics.global.focusFieldCompleteness.numerator === 1 &&
    perfectScore.metrics.global.focusFieldCompleteness.denominator === 1,
  "structural focus completeness exact one",
);
assert(
  perfectScore.metrics.blocks.NONFOCUS.focusFieldCompleteness === null &&
    perfectScore.metrics.blocks.NONFOCUS.focusFieldCounts === null,
  "nonfocus cannot inflate focus completeness",
);

const missedFatalInput = structuredClone(perfectInput);
const missedFatal = missedFatalInput.reviewRecords.find(
  (record) => record.itemPseudonym === "CAL_GRAMMAR_01",
);
missedFatal.validity.domains.taskAndRender = true;
missedFatal.validity.anyFatal = false;
missedFatal.validity.fatalCodes = [];
missedFatal.grade = "C";
missedFatal.craft = structuredClone(fixtures.baseRecords.VALID_NONFOCUS_B.craft);
const missedFatalScore = scoreCalibrationReviewer(missedFatalInput);
assert(missedFatalScore.decision === "FAIL_METRICS", "missed fatal fails calibration");
assert(
  missedFatalScore.reasonCodes.includes("GRAMMAR_FATALSENSITIVITY_BELOW_THRESHOLD") &&
    missedFatalScore.reasonCodes.includes("GLOBAL_FATALSENSITIVITY_BELOW_THRESHOLD"),
  "fatal sensitivity global and block gates",
);

const missingInput = structuredClone(perfectInput);
missingInput.reviewRecords.pop();
const missingScore = scoreCalibrationReviewer(missingInput);
assert(missingScore.decision === "FAIL_INCOMPLETE", "missing record fails incomplete");
assert(missingScore.metrics === null, "incomplete metrics are null");

const forgedInput = structuredClone(perfectInput);
forgedInput.reviewRecords[0].recordValid = true;
forgedInput.reviewRecords[0].complete = true;
const forgedScore = scoreCalibrationReviewer(forgedInput);
assert(forgedScore.decision === "FAIL_INCOMPLETE", "forged validity flags rejected by strict schema");

const nonfocusInflationInput = structuredClone(perfectInput);
const nonfocusInflation = nonfocusInflationInput.reviewRecords.find((record) => record.block === "NONFOCUS");
nonfocusInflation.focusRequired = 999999;
nonfocusInflation.focusCompleted = 999999;
const nonfocusInflationScore = scoreCalibrationReviewer(nonfocusInflationInput);
assert(nonfocusInflationScore.decision === "FAIL_INCOMPLETE", "nonfocus focus-count injection rejected");

const grammarDiagnosticInput = structuredClone(perfectInput);
for (const record of grammarDiagnosticInput.reviewRecords.filter((row) => row.block === "GRAMMAR").slice(0, 3)) {
  record.grammarAudit.markedSites.forEach((site, index) => {
    site.pointFamily = `ALT_FAMILY_${index}`;
  });
}
const grammarDiagnosticScore = scoreCalibrationReviewer(grammarDiagnosticInput);
assert(grammarDiagnosticScore.decision === "FAIL_METRICS", "grammar site disagreement fails");
assert(
  grammarDiagnosticScore.reasonCodes.includes("GRAMMAR_GRAMMARSITEAGREEMENT_BELOW_THRESHOLD"),
  "grammar site block gate named",
);

const blankDiagnosticInput = structuredClone(perfectInput);
for (const record of blankDiagnosticInput.reviewRecords.filter((row) => row.block === "BLANK").slice(0, 3)) {
  record.blankAudit.options.forEach((option) => {
    option.passageGrounded = !option.passageGrounded;
  });
}
const blankDiagnosticScore = scoreCalibrationReviewer(blankDiagnosticInput);
assert(blankDiagnosticScore.decision === "FAIL_METRICS", "blank option disagreement fails");
assert(
  blankDiagnosticScore.reasonCodes.includes("BLANK_BLANKOPTIONAGREEMENT_BELOW_THRESHOLD"),
  "blank option block gate named",
);

const axisDiagnosticInput = structuredClone(perfectInput);
const axisRecord = axisDiagnosticInput.reviewRecords.find((row) => row.block === "BLANK");
axisRecord.blankAudit.axisOracle[6].answerPreserved = false;
axisRecord.blankAudit.answerPreservesAllAxes = false;
const axisDiagnosticScore = scoreCalibrationReviewer(axisDiagnosticInput);
assert(axisDiagnosticScore.decision === "FAIL_METRICS", "one blank axis disagreement fails");
assert(
  axisDiagnosticScore.reasonCodes.includes("BLANK_BLANKAXISAGREEMENT_BELOW_THRESHOLD"),
  "seven-axis block gate named",
);

const invalidSealedTimestampInput = structuredClone(perfectInput);
invalidSealedTimestampInput.reviewRecords[0].blindSolve.sealedAt =
  "2026-02-30T01:00:00+09:00";
const invalidSealedTimestampScore = scoreCalibrationReviewer(invalidSealedTimestampInput);
assert(
  invalidSealedTimestampScore.decision === "FAIL_INCOMPLETE" &&
    invalidSealedTimestampScore.reasonCodes.includes(
      "BLIND_SOLVE_TIMESTAMP_INVALID_CAL_GRAMMAR_01",
    ),
  "pattern-shaped invalid sealed timestamp fails closed",
);
const invalidRevealTimestampInput = structuredClone(perfectInput);
invalidRevealTimestampInput.reviewRecords[0].revealAudit.revealedAt =
  "2026-13-15T01:05:00+09:00";
const invalidRevealTimestampScore = scoreCalibrationReviewer(invalidRevealTimestampInput);
assert(
  invalidRevealTimestampScore.decision === "FAIL_INCOMPLETE" &&
    invalidRevealTimestampScore.reasonCodes.includes(
      "REVEAL_TIMESTAMP_INVALID_CAL_GRAMMAR_01",
    ),
  "pattern-shaped invalid reveal timestamp fails closed",
);
assert(
  canonicalRfc3339Micros("2026-07-15T01:00:00.000001+09:00") <
    canonicalRfc3339Micros("2026-07-15T01:00:00.000002+09:00"),
  "phase ordering preserves microsecond precision",
);

const crossItemReuseInput = structuredClone(perfectInput);
const firstBoundRecord = crossItemReuseInput.reviewRecords[0];
const secondBoundRecord = crossItemReuseInput.reviewRecords[1];
[
  firstBoundRecord.surfaceSha256,
  secondBoundRecord.surfaceSha256,
] = [secondBoundRecord.surfaceSha256, firstBoundRecord.surfaceSha256];
[
  firstBoundRecord.relabelMapSha256,
  secondBoundRecord.relabelMapSha256,
] = [secondBoundRecord.relabelMapSha256, firstBoundRecord.relabelMapSha256];
[
  firstBoundRecord.blindSolve.sealedRecordSha256,
  secondBoundRecord.blindSolve.sealedRecordSha256,
] = [
  secondBoundRecord.blindSolve.sealedRecordSha256,
  firstBoundRecord.blindSolve.sealedRecordSha256,
];
const crossItemReuseScore = scoreCalibrationReviewer(crossItemReuseInput);
assert(
  crossItemReuseScore.decision === "FAIL_INCOMPLETE" &&
    crossItemReuseScore.reasonCodes.includes("SURFACE_BINDING_MISMATCH_CAL_GRAMMAR_01") &&
    crossItemReuseScore.reasonCodes.includes("RELABEL_BINDING_MISMATCH_CAL_GRAMMAR_01") &&
    crossItemReuseScore.reasonCodes.includes("PHASE1_BINDING_MISMATCH_CAL_GRAMMAR_01"),
  "cross-item surface relabel and phase-one reuse fails closed",
);

function makeBlindAnswerWrong(record) {
  record.blindSolve.disposition = "ANSWER";
  record.blindSolve.answerLabels = ["WRONG"];
  record.blindSolve.alternativeAnswerLabels = [];
  record.blindSolve.answerText = {
    mode: "NONE",
    inlineTexts: [],
    privateTextRef: null,
    sha256: null,
  };
}

const allBlindWrongInput = structuredClone(perfectInput);
allBlindWrongInput.reviewRecords.forEach(makeBlindAnswerWrong);
const allBlindWrongScore = scoreCalibrationReviewer(allBlindWrongInput);
assert(
  allBlindWrongScore.decision === "FAIL_METRICS" &&
    allBlindWrongScore.reasonCodes.includes(
      "GLOBAL_BLINDSOLVEEXACTAGREEMENT_BELOW_THRESHOLD",
    ) &&
    ["GRAMMAR", "BLANK", "NONFOCUS"].every((block) =>
      allBlindWrongScore.reasonCodes.includes(
        `${block}_BLINDSOLVEEXACTAGREEMENT_BELOW_THRESHOLD`,
      ),
    ),
  "24 wrong blind solves cannot certify from hindsight-only evidence",
);

const globalBlindBoundaryInput = structuredClone(perfectInput);
for (const block of ["GRAMMAR", "BLANK", "NONFOCUS"]) {
  makeBlindAnswerWrong(
    globalBlindBoundaryInput.reviewRecords.find((record) => record.block === block),
  );
}
const globalBlindBoundaryScore = scoreCalibrationReviewer(globalBlindBoundaryInput);
assert(
  globalBlindBoundaryScore.metrics.global.blindSolveCounts.correct === 21 &&
    globalBlindBoundaryScore.reasonCodes.includes(
      "GLOBAL_BLINDSOLVEEXACTAGREEMENT_BELOW_THRESHOLD",
    ) &&
    !globalBlindBoundaryScore.reasonCodes.some((code) =>
      /^(GRAMMAR|BLANK|NONFOCUS)_BLINDSOLVEEXACTAGREEMENT_/u.test(code),
    ),
  "21/24 fails global 9/10 while each 7/8 block passes",
);

const blockBlindBoundaryInput = structuredClone(perfectInput);
blockBlindBoundaryInput.reviewRecords
  .filter((record) => record.block === "GRAMMAR")
  .slice(0, 2)
  .forEach(makeBlindAnswerWrong);
const blockBlindBoundaryScore = scoreCalibrationReviewer(blockBlindBoundaryInput);
assert(
  blockBlindBoundaryScore.metrics.global.blindSolveCounts.correct === 22 &&
    !blockBlindBoundaryScore.reasonCodes.includes(
      "GLOBAL_BLINDSOLVEEXACTAGREEMENT_BELOW_THRESHOLD",
    ) &&
    blockBlindBoundaryScore.reasonCodes.includes(
      "GRAMMAR_BLINDSOLVEEXACTAGREEMENT_BELOW_THRESHOLD",
    ),
  "22/24 passes global but 6/8 grammar fails block gate",
);

const acceptedAlternativeInput = structuredClone(perfectInput);
const acceptedAlternativeGold = acceptedAlternativeInput.goldItems[0];
const acceptedAlternativeRecord = acceptedAlternativeInput.reviewRecords[0];
acceptedAlternativeRecord.blindSolve.answerLabels = ["RATIONAL_ALT"];
acceptedAlternativeRecord.blindSolve.sealedRecordSha256 = hashText(
  "CAL_GRAMMAR_01:phase1:rational-alt",
);
acceptedAlternativeGold.expectedBindings.phaseOneRecordSha256 =
  acceptedAlternativeRecord.blindSolve.sealedRecordSha256;
acceptedAlternativeGold.acceptedAnswerSets.push({
  disposition: "ANSWER",
  answerLabels: ["RATIONAL_ALT"],
  answerTextSha256: null,
});
assert(
  scoreCalibrationReviewer(acceptedAlternativeInput).decision === "PASS",
  "sealed acceptedAnswerSets permit adjudicated rational alternatives",
);

assert(makeMetric(1, 0) === null, "zero denominator metric null");
assert(!metricMeets(null, [0, 1]), "null metric always fails");
assert(metricMeets(makeMetric(9, 10), [9, 10]), "raw equality threshold passes");
assert(!metricMeets(makeMetric(8999, 10000), [9, 10]), "display rounding cannot pass threshold");

const evidenceFamilies = [
  ...new Set(perfectInput.goldItems.map((item) => item.evidenceFamily)),
].sort();
const perfectCertificate = {
  schemaVersion: "reviewer-calibration-certificate-v1",
  certificateId: "CERT_SYNTHETIC_PER_REVIEWER",
  reviewerPseudonym: "RATER_SYN_1",
  packetSha256: hashText("packet"),
  oracleSha256: hashText("oracle"),
  scorerSha256: hashText("scorer"),
  contractSha256: hashText("contract"),
  perReviewer: true,
  scope: {
    focusBlocks: ["GRAMMAR", "BLANK"],
    evidenceFamilies,
    grammarSurfaceContract: "EXACT_5_MARKERS_1_INVALID",
    blankAxes: propositionAxes,
    allActiveTypesCertified: false,
  },
  goldComposition: {
    total: 24,
    fatal: 6,
    nonfatal: 18,
    gradeF: 6,
    gradeC: 6,
    gradeB: 6,
    gradeA: 6,
    perBlock: Object.fromEntries(
      ["GRAMMAR", "BLANK", "NONFOCUS"].map((block) => [
        block,
        { total: 8, fatal: 2, nonfatal: 6, gradeF: 2, gradeC: 2, gradeB: 2, gradeA: 2 },
      ]),
    ),
  },
  comparisonRule: perfectScore.comparisonRule,
  metrics: perfectScore.metrics,
  decision: perfectScore.decision,
  reasonCodes: perfectScore.reasonCodes,
  issuedAt: "2026-07-15T04:00:00+09:00",
  expiresAt: "2026-08-14T04:00:00+09:00",
};
assert(
  validateJsonSchema(certificateSchema, perfectCertificate).length === 0,
  "perfect certificate full schema validation",
);

deepClose(buildPowerResults(), savedPower, "powerResults");
const cpExample = conditionalPower({
  interimChallengerOnly: 25,
  interimControlOnly: 10,
  remainingPairs: 60,
  designPChallengerOnly: 0.25,
  designPControlOnly: 0.1,
  finalAlpha: 0.02,
});
assert(cpExample >= 0 && cpExample <= 1, "conditional power bounded");
assert(
  savedPower.allocations.TOTAL_SCHEDULED_MAX === 998,
  "power allocation 998",
);
assert(savedPower.allocations.LOCKED_UNUSED === 2, "power locked unused two");
assert(savedPower.apiCandidatesConsumed === 0, "power API zero");

assert(
  sourceClosure.privacy.actualPassages === 0,
  "source closure no passages",
);
assert(
  sourceClosure.privacy.actualQuestions === 0,
  "source closure no questions",
);
assert(
  sourceClosure.privacy.databaseIdentifiers === 0,
  "source closure no DB IDs",
);
assert(
  sourceClosure.privacy.credentials === 0,
  "source closure no credentials",
);
assert(sourceClosure.privacy.apiCandidates === 0, "source closure API zero");
assert(sourceClosure.sources.length >= 10, "source closure breadth");
assert(
  sourceClosure.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)),
  "source closure hashes",
);

const artifactFiles = [
  "AMENDMENT.md",
  "README.md",
  "calibration-certificate.schema.json",
  "calibration-scoring.mjs",
  "design.json",
  "mutation-fixtures.json",
  "power-analysis.mjs",
  "power-results.json",
  "review-record.schema.json",
  "source-closure.json",
  "strict-json-schema.mjs",
  "synthetic-fixtures.json",
  "verify.mjs",
];
const combinedText = artifactFiles
  .map((name) => readFileSync(join(here, name), "utf8"))
  .join("\n");
assert(
  !/AIza[0-9A-Za-z_-]{20,}/.test(combinedText),
  "no Google credential shape",
);
assert(
  !/sk-or-v1-[0-9A-Za-z_-]{20,}/.test(combinedText),
  "no OpenRouter credential shape",
);

const manifestPath = join(here, "MANIFEST.sha256");
assert(existsSync(manifestPath), "manifest exists");
const manifestRows = readFileSync(manifestPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert(Boolean(match), `manifest row syntax ${line}`);
    return { expected: match[1], name: match[2] };
  });
assert(manifestRows.length === artifactFiles.length, "manifest row count");
assert(
  JSON.stringify(manifestRows.map((row) => row.name).sort()) ===
    JSON.stringify([...artifactFiles].sort()),
  "manifest exact file set",
);
for (const row of manifestRows) {
  const path = join(here, row.name);
  assert(relative(here, path) === row.name, `manifest local path ${row.name}`);
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  assert(actual === row.expected, `manifest hash ${row.name}`);
}

process.stdout.write(
  `${JSON.stringify(
    {
      verdict: "PASS_DESIGN_ONLY_EXECUTION_BLOCKED",
      checks: checks.length,
      fixtureCases: mutationFixtures.cases.length,
      calibrationMutationFamilies: 12,
      activeTypes: design.scope.activeEnglishTypes.length,
      scheduledCandidateMax: scheduled,
      lockedUnused: budget.LOCKED_UNUSED,
      apiCandidatesConsumed:
        design.apiAccounting.newFullQuestionCandidatesConsumed,
      conditionalPowerSyntheticExample: cpExample,
    },
    null,
    2,
  )}\n`,
);
