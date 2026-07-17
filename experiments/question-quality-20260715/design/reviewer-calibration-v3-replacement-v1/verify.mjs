import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const base = dirname(fileURLToPath(import.meta.url));
const protocolPath = join(base, "protocol.json");
const schemaPath = join(base, "schema.json");
const planPath = join(base, "PLAN.md");
const manifestPath = join(base, "MANIFEST.sha256");

const protocol = JSON.parse(readFileSync(protocolPath, "utf8"));
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const plan = readFileSync(planPath, "utf8");
const checks = [];

function check(name, condition, detail = undefined) {
  checks.push({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
}

function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function approx(name, actual, expected, epsilon = 1e-9) {
  check(name, Math.abs(actual - expected) <= epsilon, { actual, expected, epsilon });
}

function sumValues(object) {
  return Object.values(object).reduce((sum, value) => sum + value, 0);
}

eq("protocol schema version", protocol.schemaVersion, "reviewer-calibration-v3-replacement-protocol-1");
eq("protocol remains unissued", protocol.status, "DESIGN_ONLY_UNISSUED");
eq("artifact id", protocol.artifactId, "reviewer-calibration-v3-replacement-v1");

eq("allowed source count", protocol.sourceBoundary.allowedInputs.length, 4);
for (const [index, source] of protocol.sourceBoundary.allowedInputs.entries()) {
  const absolute = resolve(base, source.path);
  check(`allowed source ${index + 1} exists`, existsSync(absolute), source.path);
  if (existsSync(absolute)) {
    eq(`allowed source ${index + 1} hash`, sha256File(absolute), source.sha256);
  }
}
check(
  "author hypothesis JSON pointers explicitly ignored",
  protocol.sourceBoundary.ignoredEvenIfPresentInAllowedInput.some((pointer) => pointer.includes("authorHypothesis"))
);
check(
  "trusted gold forbidden",
  protocol.sourceBoundary.forbiddenInputs.includes("trusted gold")
);

for (const [key, value] of Object.entries(protocol.activity)) {
  eq(`offline activity ${key}`, value, 0);
}

eq("v2 grammar final composition", protocol.observedV2Evidence.finalComposition.GRAMMAR, { A: 2, B: 2, C: 2, F: 2 });
eq("v2 blank final composition", protocol.observedV2Evidence.finalComposition.BLANK, { A: 2, B: 2, C: 2, F: 2 });
eq("v2 nonfocus final composition", protocol.observedV2Evidence.finalComposition.NONFOCUS, { A: 0, B: 0, C: 3, F: 5 });
eq("v2 composition ineligible", protocol.observedV2Evidence.compositionEligible, false);

const expectedAxes = [
  "actorOrTarget",
  "polarity",
  "conditionOrModality",
  "causalRelationAndDirection",
  "scopeOrQuantifier",
  "stance",
  "temporalRelation"
];
const expectedRelations = [
  "PRESERVED",
  "REVERSED",
  "NARROWED",
  "BROADENED",
  "OMITTED",
  "UNSUPPORTED_ADDITION",
  "SHIFTED",
  "NOT_APPLICABLE"
];
eq("blank seven axes", protocol.blankConstruct.propositionAxes, expectedAxes);
eq("blank relation enum", protocol.blankConstruct.axisRelationEnum, expectedRelations);
eq("blank every option has seven axes", protocol.blankConstruct.rules.everyOptionHasAllSevenAxes, true);
eq("blank decisive axes min", protocol.blankConstruct.rules.decisiveAxesMin, 1);
eq("blank decisive axes max", protocol.blankConstruct.rules.decisiveAxesMax, 2);
eq("blank no singleton primary intent", protocol.blankConstruct.rules.singletonPrimaryIntentRequired, false);
eq("blank post-issue expansion forbidden", protocol.blankConstruct.rules.postIssueEquivalenceExpansionAllowed, false);
eq("blank correct answer mandatory axes", protocol.blankConstruct.rules.correctAnswerPreservesAllMandatoryAxes, true);

eq("grammar no singleton family", protocol.grammarConstruct.equivalenceRules.singletonPointFamilyRequired, false);
eq("grammar no exact correction string", protocol.grammarConstruct.equivalenceRules.exactCorrectionStringRequired, false);
eq("grammar post-issue expansion forbidden", protocol.grammarConstruct.equivalenceRules.postIssueExpansionAllowed, false);
eq("grammar noncompensable field count", protocol.grammarConstruct.nonCompensableFields.length, 4);

const families = protocol.nonfocusConstruct.families;
eq("nonfocus family count", families.length, 8);
const logicalTypes = families.flatMap((family) => family.logicalTypes);
eq("nonfocus logical type count", logicalTypes.length, 23);
eq("nonfocus logical types unique", new Set(logicalTypes).size, 23);
eq("production binding exact count", protocol.nonfocusConstruct.productionBinding.exactCount, 23);
eq("production binding required before authoring", protocol.nonfocusConstruct.productionBinding.requiredBeforeAuthoring, true);
eq("outcome-aware remapping forbidden", protocol.nonfocusConstruct.productionBinding.outcomeAwareRemappingForbidden, true);
eq("nonfocus rotation maximum epochs", protocol.nonfocusConstruct.eightAnchorRepresentation.maximumEpochsToTouchAllLogicalTypesIfTwoFreshRepresentativesPerFamilyPerEpoch, 3);

eq("final anchors per block", protocol.anchorAcquisition.requiredFinalAnchorsPerBlock, 8);
eq("initial pool per block", protocol.anchorAcquisition.initialCandidatePoolPerBlock, 16);
eq("candidate attempt ceiling", protocol.anchorAcquisition.maximumCandidatesAdjudicatedPerBlockPerVersion, 64);
check("authoring brief has no target grade", protocol.anchorAcquisition.stages[0].includes("no target grade"));
check("revision creates new candidate", protocol.anchorAcquisition.revisionRule.includes("new candidate ID"));
eq("main grade target sums to eight", sumValues(protocol.compositionSampling.mainCertificationTargetPerBlock), 8);
eq("main exact spectrum", protocol.compositionSampling.mainCertificationTargetPerBlock, { A: 2, B: 2, C: 2, F: 2 });
check("first-to-fill selection committed", protocol.compositionSampling.selectionRule.includes("first two"));
check("missing cell uses grade-neutral brief", protocol.compositionSampling.missingCellRule.includes("grade-neutral"));
check("attempt failure does not loosen truth", protocol.compositionSampling.attemptLimitRule.includes("do not loosen"));

eq("taxonomy pilot items", protocol.taxonomyPilot.items, 12);
eq("taxonomy pilot block total", sumValues(protocol.taxonomyPilot.byBlock), 12);
eq("taxonomy pilot raters", protocol.taxonomyPilot.raters, 3);
eq("taxonomy pilot equivalences presealed", protocol.taxonomyPilot.acceptedEquivalenceSetsSealedBeforeIssue, true);
eq("taxonomy pilot excludes author hypotheses", protocol.taxonomyPilot.authorHypothesesExcluded, true);
eq("taxonomy pilot max versions", protocol.taxonomyPilot.revisionLoop.maximumPilotVersions, 2);
check("taxonomy pilot failed items cannot mutate", protocol.taxonomyPilot.revisionLoop.forbiddenRevision.includes("issued item truth"));

eq("main items", protocol.mainCertification.items, 24);
eq("main block total", sumValues(protocol.mainCertification.byBlock), 24);
eq("main raters", protocol.mainCertification.raters, 3);
eq("main fresh after pilot", protocol.mainCertification.freshAfterTaxonomyPilot, true);
eq("main equivalences presealed", protocol.mainCertification.acceptedEquivalenceSetsSealedBeforeIssue, true);
eq("main blind answer threshold", protocol.mainCertification.thresholdsPerRater.blindAnswerExactMinimum, { numerator: 23, denominator: 24 });
eq("main fatal sensitivity", protocol.mainCertification.thresholdsPerRater.fatalSensitivity, { numerator: 6, denominator: 6 });
eq("main grammar noncompensable exact", protocol.mainCertification.thresholdsPerRater.grammarNonCompensableExact, 1);
eq("main blank mandatory axes exact", protocol.mainCertification.thresholdsPerRater.blankMandatoryAnswerAxisExact, 1);

eq("holdout items", protocol.freshActivationHoldout.items, 24);
eq("holdout block total", sumValues(protocol.freshActivationHoldout.byBlock), 24);
eq("holdout fresh", protocol.freshActivationHoldout.disjointFromPilotMainAndPriorHoldouts, true);
eq("holdout one-time", protocol.freshActivationHoldout.oneTimeIssuePerRater, true);
eq("holdout fatal total", protocol.freshActivationHoldout.fatalRiskEnrichment.fatal, 12);
eq("holdout nonfatal total", protocol.freshActivationHoldout.fatalRiskEnrichment.nonfatal, 12);
eq("holdout fatal sensitivity", protocol.freshActivationHoldout.thresholdsPerRater.fatalSensitivity, { numerator: 12, denominator: 12 });

const pDetect = (n, p) => 1 - (1 - p) ** n;
approx("power main n24 p.05", protocol.powerAndLimits.mainAnyErrorDetectionProbability["atTrueErrorRate0.05"], pDetect(24, 0.05));
approx("power main n24 p.10", protocol.powerAndLimits.mainAnyErrorDetectionProbability["atTrueErrorRate0.10"], pDetect(24, 0.10));
approx("power main n24 p.15", protocol.powerAndLimits.mainAnyErrorDetectionProbability["atTrueErrorRate0.15"], pDetect(24, 0.15));
approx("power main n24 p.20", protocol.powerAndLimits.mainAnyErrorDetectionProbability["atTrueErrorRate0.20"], pDetect(24, 0.20));
approx("power combined n48 p.05", protocol.powerAndLimits.mainPlusHoldoutAnyErrorDetectionProbability["atTrueErrorRate0.05"], pDetect(48, 0.05));
approx("power combined n48 p.10", protocol.powerAndLimits.mainPlusHoldoutAnyErrorDetectionProbability["atTrueErrorRate0.10"], pDetect(48, 0.10));
approx("power fatal n18 p.10", protocol.powerAndLimits.fatalMissDetectionProbabilityAcross18FatalAnchors["atTrueMissRate0.10"], pDetect(18, 0.10));
approx("power block n16 p.10", protocol.powerAndLimits.perBlockMainPlusHoldoutDetectionProbability["atTrueErrorRate0.10"], pDetect(16, 0.10));

eq("majority vote not authority", protocol.adjudication.majorityVoteIsAuthority, false);
eq("stored answer not authority", protocol.adjudication.storedAnswerIsAuthority, false);
eq("author explanation not authority", protocol.adjudication.authorExplanationIsAuthority, false);
check("gold defect invalidates anchor", protocol.adjudication.goldDefectRule.includes("invalidates"));
eq("no retroactive pass", protocol.failureProtocol.noRetroactivePass, true);
eq("no threshold relaxation", protocol.failureProtocol.noThresholdRelaxationAfterOpening, true);
eq("no rejected candidate deletion", protocol.failureProtocol.noRejectedCandidateDeletion, true);

eq("schema draft", schema.$schema, "https://json-schema.org/draft/2020-12/schema");
check("schema has anchor truth", Boolean(schema.$defs.anchorTruth));
check("schema has rater submission", Boolean(schema.$defs.raterSubmission));
check("schema has adjudication", Boolean(schema.$defs.adjudicationRecord));
eq("schema relation vector required axes", schema.$defs.relationVector.required, expectedAxes);
eq("schema relation enum", schema.$defs.axisRelation.enum, expectedRelations);
eq("schema decisive axes max two", schema.$defs.blankOptionTruth.properties.decisiveAxes.maxItems, 2);
eq("schema anchor closes additional properties", schema.$defs.anchorTruth.additionalProperties, false);
check("schema does not define author hypothesis", !JSON.stringify(schema).includes('"authorHypothesis"'));

const requiredPlanPhrases = [
  "first-to-fill",
  "acceptedCorrectionEquivalenceSets",
  "decisiveAxes",
  "mechanismTags",
  "12-anchor taxonomy pilot",
  "24-anchor certification",
  "Fresh activation holdout",
  "23유형",
  "provider 비용은 0 USD"
];
for (const phrase of requiredPlanPhrases) {
  check(`plan contains ${phrase}`, plan.includes(phrase));
}

if (process.argv.includes("--check-manifest")) {
  check("manifest exists", existsSync(manifestPath));
  if (existsSync(manifestPath)) {
    const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    const expectedFiles = ["PLAN.md", "protocol.json", "schema.json", "verify.mjs"];
    eq("manifest entry count", lines.length, expectedFiles.length);
    const parsed = new Map();
    for (const line of lines) {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
      check(`manifest line format ${line.slice(-24)}`, Boolean(match));
      if (match) parsed.set(match[2], match[1]);
    }
    eq("manifest file names", [...parsed.keys()].sort(), [...expectedFiles].sort());
    for (const file of expectedFiles) {
      if (parsed.has(file)) eq(`manifest hash ${file}`, parsed.get(file), sha256File(join(base, file)));
    }
  }
}

const failed = checks.filter((entry) => !entry.pass);
const report = {
  schemaVersion: "reviewer-calibration-v3-replacement-verification-1",
  status: failed.length === 0 ? "PASS" : "FAIL",
  checks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  activity: {
    externalNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
    databaseCalls: 0,
    secretReads: 0,
    trustedGoldReads: 0,
    trustedGoldWrites: 0
  },
  failures: failed
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
