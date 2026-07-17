import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  assertPacketComposition,
  authorPacketSchema,
  calibrationReviewRecordSchema,
  hashJson,
  pendingGoldSchema,
  phase1SubmissionSchema,
  sha256,
  type AuthorPacket,
} from "./contract.mts";
import {
  computeCalibrationMetrics,
  DEFAULT_THRESHOLDS,
  evaluateCalibration,
  scoreLabelSchema,
} from "./metrics.mts";
import {
  issuePhase1Packet,
  revealPhase2,
  sealPhase1Submission,
} from "./reveal.mts";
import {
  assertFinalGoldIssuanceEligible,
  finalGoldCompositionIssues,
  finalGoldSchema,
  scoreFromSealedArtifacts,
} from "./score.mts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const packetPath = join(here, "private", "items.private.json");
const goldPath = join(here, "private", "gold.private.json");
const contractPath = join(here, "contract.mts");
const metricsPath = join(here, "metrics.mts");
const scorePath = join(here, "score.mts");

const checks: string[] = [];
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  checks.push(message);
}

function fileSha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function expectReject(id: string, fn: () => unknown): void {
  let rejected = false;
  try {
    fn();
  } catch {
    rejected = true;
  }
  assert(rejected, `hostile ${id} rejected`);
}

const contentCommitments: Record<string, string> = {
  "OPTIONS:RCAL-B05": "fce045cddc5146f486d8486d1ff777f5ab61dafa27523271a354ce45366ae578",
  "OPTIONS:RCAL-B06": "a52f16608c72367abfa0e51bba783f785ab49d62b7a88df6b793f97976e5c134",
  "OPTIONS:RCAL-B07": "80a5aafce2d7a66bad1aa4f70fc02a4e19e0ad7aef53d27247e3aa108cb3745c",
  "OPTIONS:RCAL-B08": "c58de645da36386ff7224645813d5a58ebdbde246731b5710b649623e5eee3e8",
  "OPTIONS:RCAL-N02": "6116ae54408a0c282a97560781b2ddf37e6e34e280f2fd9a39736c066a6022e9",
  "CONSTRUCTED:RCAL-N04": "ff43b2be0aa2ce28080af8b2e3fc12804b92bb311f7a0ba92ec7da51e33c63e3",
  "GRAMMAR:RCAL-G04": "7710f52ac3957fbf55425265335f6ace2a84feabb8f5ccc3cc73b564833a1bf1",
  "GRAMMAR:RCAL-G05": "d353539c6595cf8014ad8eaa36c0adcca93db3807cdcc04891bf1f4b3340aa85",
  "GRAMMAR:RCAL-G06": "1fe5c1e016004ba0a12722cca03412d621a6347f8c6161218b79f223860aa389",
  "GRAMMAR:RCAL-G07": "f17789f117aa0057ee76d8b095a34a46f33792a31dc725639d5fe08979fb039b",
  "GRAMMAR:RCAL-G08": "ca41ac50141551b2819f03ffa0ce14819fc564eb4b7ece513c979d46e761d54d",
  "ORACLE:RCAL-B01-O3": "4b6d933e0ce97aa24b64b0c48fa7768cc6d60d3a86879854c90d815550a1ea8e",
};

function assertContentCommitments(value: AuthorPacket): void {
  const byId = new Map(value.items.map((item) => [item.itemId, item]));
  for (const id of ["RCAL-B05", "RCAL-B06", "RCAL-B07", "RCAL-B08", "RCAL-N02"]) {
    const item = byId.get(id)!;
    const actual = sha256(JSON.stringify(item.phase1.options.map((option) => option.text)));
    if (actual !== contentCommitments[`OPTIONS:${id}`]) throw new Error(`CONTENT_COMMITMENT_${id}`);
  }
  const n04 = byId.get("RCAL-N04")!;
  const n04Hash = sha256(
    JSON.stringify({ surface: n04.phase1.studentSurface, answers: n04.authorHypothesis.expectedAnswers }),
  );
  if (n04Hash !== contentCommitments["CONSTRUCTED:RCAL-N04"]) throw new Error("CONTENT_COMMITMENT_RCAL-N04");
  for (const id of ["RCAL-G04", "RCAL-G05", "RCAL-G06", "RCAL-G07", "RCAL-G08"]) {
    const item = byId.get(id)!;
    if (item.block !== "GRAMMAR") throw new Error(`CONTENT_COMMITMENT_BLOCK_${id}`);
    const signature = item.authorHypothesis.typeEvidence.markedSites.map((site) => ({
      l: site.canonicalLabel,
      o: site.observedSurface,
      f: site.pointFamily,
      c: site.correction,
    }));
    if (sha256(JSON.stringify(signature)) !== contentCommitments[`GRAMMAR:${id}`]) {
      throw new Error(`CONTENT_COMMITMENT_${id}`);
    }
  }
  const b01 = byId.get("RCAL-B01")!;
  if (b01.block !== "BLANK") throw new Error("CONTENT_COMMITMENT_BLOCK_RCAL-B01");
  const option3 = b01.authorHypothesis.typeEvidence.options[2];
  const b01Hash = sha256(
    JSON.stringify({
      slot: option3.slotGrammarCompatible,
      primary: option3.primaryIntentAxis,
      over: option3.overlappingAxes,
      div: option3.divergentAxes,
    }),
  );
  if (b01Hash !== contentCommitments["ORACLE:RCAL-B01-O3"]) throw new Error("CONTENT_COMMITMENT_RCAL-B01-O3");
}

const packet = authorPacketSchema.parse(readJson(packetPath));
assertPacketComposition(packet);
assertContentCommitments(packet);
const pendingGold = pendingGoldSchema.parse(readJson(goldPath));
const publicArtifact = readJson(join(here, "packet-public.json"));
const protocol = readJson(join(here, "protocol.json"));
const upstreamDesign = readJson(
  join(repoRoot, "experiments", "question-quality-20260715", "design", "blind-adjudication-power-v1", "design.json"),
) as any;
const fixtures = readJson(join(here, "hostile-fixtures.json")) as {
  schemaVersion: string;
  containsActualQuestion: boolean;
  containsActualPassage: boolean;
  cases: Array<{ id: string; target: string; expected: string }>;
};

assert(packet.items.length === 24, "packet has 24 items");
assert(pendingGold.status === "GOLD_ADJUDICATION_PENDING", "gold remains pending");
assert(pendingGold.items.every((item) => item.finalGold === null), "no fabricated final gold");
assert(publicArtifact.status === "GOLD_ADJUDICATION_PENDING", "public status pending");
assert(publicArtifact.gold.certifiableReviewers === 0, "zero certifiable reviewers before gold");
assert(publicArtifact.candidateAccounting.newFullQuestionCandidates === 0, "zero candidate use");
assert(publicArtifact.candidateAccounting.modelApiCalls === 0, "zero model calls");
assert(publicArtifact.candidateAccounting.networkCalls === 0, "zero network calls");
assert(publicArtifact.candidateAccounting.databaseCalls === 0, "zero DB calls");
assert(publicArtifact.composition.uniqueTopicTags === 24, "24 unique topic tags");
assert(publicArtifact.disjointness.withinPacket.sharedNgrams === 0, "zero internal eight-gram overlap");
assert(publicArtifact.disjointness.currentS1Reference.sharedEightGrams === 0, "zero S1 eight-gram overlap");
assert(publicArtifact.disjointness.currentS1Reference.exactNormalizedDuplicates === 0, "zero S1 exact overlap");
assert(hashJson(protocol.thresholds) === hashJson(DEFAULT_THRESHOLDS), "protocol thresholds equal executable thresholds");
assert(
  hashJson(upstreamDesign.reviewerCalibration.passThresholds) === hashJson(DEFAULT_THRESHOLDS),
  "executable thresholds equal bound V6 calibration thresholds",
);
for (const binding of publicArtifact.upstreamBindings as Array<{ path: string; sha256: string }>) {
  assert(fileSha(join(repoRoot, binding.path)) === binding.sha256, `upstream binding current ${binding.path}`);
}

const contractSha256 = fileSha(contractPath);
const issueA = issuePhase1Packet({
  packet,
  reviewerPseudonym: "RATER_FIXTURE_1",
  seed: "calibration-fixture-seed-0001",
  contractSha256,
});
const issueAReplay = issuePhase1Packet({
  packet,
  reviewerPseudonym: "RATER_FIXTURE_1",
  seed: "calibration-fixture-seed-0001",
  contractSha256,
});
const issueB = issuePhase1Packet({
  packet,
  reviewerPseudonym: "RATER_FIXTURE_2",
  seed: "calibration-fixture-seed-0002",
  contractSha256,
});
assert(hashJson(issueA) === hashJson(issueAReplay), "phase1 issuance deterministic");
assert(hashJson(issueA.phase1) !== hashJson(issueB.phase1), "reviewer packets independently relabeled");
const phase1Text = JSON.stringify(issueA.phase1);
for (const forbidden of ["\"authorHypothesis\":", "\"authorStratum\":", "\"storedKey\":", "\"explanation\":", "RCAL-G", "RCAL-B", "RCAL-N"]) {
  assert(!phase1Text.includes(forbidden), `phase1 omits ${forbidden}`);
}

const authorById = new Map(packet.items.map((item) => [item.itemId, item]));
const submissionAnswers = issueA.privateMap.rows.map((row) => {
  const item = authorById.get(row.itemId)!;
  const disposition = item.authorHypothesis.expectedDisposition;
  const constructed = item.phase1.labelMode === "CONSTRUCTED";
  const answerText = constructed && disposition === "ANSWER" ? item.authorHypothesis.expectedAnswers[0] : null;
  return {
    itemPseudonym: row.itemPseudonym,
    disposition,
    answerLabels: constructed ? [] : item.authorHypothesis.expectedAnswers.map((answer) => row.canonicalToDisplay[answer] ?? answer),
    answerText,
    answerTextSha256: answerText === null ? null : sha256(answerText),
    confidence: "HIGH" as const,
  };
});
const submission = phase1SubmissionSchema.parse({
  schemaVersion: "reviewer-calibration-phase1-submission-v1",
  packetInstanceId: issueA.phase1.packetInstanceId,
  reviewerPseudonym: issueA.phase1.reviewerPseudonym,
  phase1PacketSha256: hashJson(issueA.phase1),
  answers: submissionAnswers,
});
const seal = sealPhase1Submission({ phase1: issueA.phase1, submission, sealedAt: "2026-07-15T12:00:00+09:00" });
const reveal = revealPhase2({ packet, phase1: issueA.phase1, submission, seal, privateMap: issueA.privateMap });
assert(reveal.items.length === 24, "phase2 reveals all and only sealed rows");
const revealText = JSON.stringify(reveal);
for (const forbidden of ["authorHypothesis", "authorStratum", "intendedGrade", "rationale", "finalGold"]) {
  assert(!revealText.includes(forbidden), `phase2 omits ${forbidden}`);
}

function syntheticRecord(row: (typeof issueA.privateMap.rows)[number]) {
  const item = authorById.get(row.itemId)!;
  const blind = submission.answers.find((answer) => answer.itemPseudonym === row.itemPseudonym)!;
  const anyFatal = item.authorHypothesis.intendedGrade === "F";
  const base = {
    schemaVersion: "reviewer-calibration-review-record-v1",
    reviewerPseudonym: issueA.phase1.reviewerPseudonym,
    itemPseudonym: row.itemPseudonym,
    block: item.block,
    surfaceSha256: issueA.phase1.items.find((candidate) => candidate.itemPseudonym === row.itemPseudonym)!.surfaceSha256,
    relabelMapSha256: hashJson(row),
    phaseOneRecordSha256: hashJson(blind),
    phase1SubmissionSha256: hashJson(submission),
    phase2RevealSha256: hashJson(reveal),
    disposition: blind.disposition,
    answerLabels: blind.answerLabels,
    answerText: blind.answerText,
    answerTextSha256: blind.answerTextSha256,
    anyFatal,
    fatalDomains: item.authorHypothesis.intendedFatalDomains,
    fatalCodes: item.authorHypothesis.intendedFatalCodes,
    grade: item.authorHypothesis.intendedGrade,
    grammarSiteJudgments: [],
    blankOptionJudgments: [],
    blankAxisJudgments: [],
    calibrationStatus: "UNASSESSED",
  } as Record<string, unknown>;
  if (item.block === "GRAMMAR") {
    base.grammarSiteJudgments = item.authorHypothesis.typeEvidence.markedSites
      .map((site) => ({
        site: row.canonicalToDisplay[site.canonicalLabel] ?? site.canonicalLabel,
        displayedGrammaticality: site.displayedGrammaticality,
        diagnosis: site.diagnosis,
        correction: site.correction,
        pointFamily: site.pointFamily,
        correctionRestoresSource: site.correctionRestoresSource,
        explanationAccurate: site.explanationAccurate,
      }))
      .sort((a, b) => a.site.localeCompare(b.site));
  }
  if (item.block === "BLANK") {
    base.blankOptionJudgments = item.authorHypothesis.typeEvidence.options
      .map((option) => ({
        label: row.canonicalToDisplay[option.canonicalLabel] ?? option.canonicalLabel,
        slotGrammarCompatible: option.slotGrammarCompatible,
        passageGrounded: option.passageGrounded,
        primaryIntentAxis: option.primaryIntentAxis,
        divergentAxes: option.divergentAxes,
        singleDecisiveFlaw: option.singleDecisiveFlaw,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    base.blankAxisJudgments = item.authorHypothesis.typeEvidence.axisOracle.map((axis) => ({
      axis: axis.axis,
      answerPreserved: axis.answerPreserved,
      supportedValueEvidenceRefs: axis.evidenceRefs,
    }));
  }
  return calibrationReviewRecordSchema.parse(base);
}

const syntheticRecords = issueA.privateMap.rows.map(syntheticRecord);
assert(syntheticRecords.length === 24, "strict synthetic review bundle valid");

function syntheticLabel(item: AuthorPacket["items"][number]) {
  const base = {
    itemId: item.itemId,
    block: item.block,
    disposition: item.authorHypothesis.expectedDisposition,
    answerSet: item.authorHypothesis.expectedAnswers,
    acceptedAnswerSets: [item.authorHypothesis.expectedAnswers],
    anyFatal: item.authorHypothesis.intendedGrade === "F",
    grade: item.authorHypothesis.intendedGrade,
    grammarSites: [],
    blankOptions: [],
    blankAxes: [],
  } as Record<string, unknown>;
  if (item.block === "GRAMMAR") {
    base.grammarSites = item.authorHypothesis.typeEvidence.markedSites.map((site) => ({
      site: site.canonicalLabel,
      displayedGrammaticality: site.displayedGrammaticality,
      diagnosis: site.diagnosis,
      pointFamily: site.pointFamily,
      correctionRestoresSource: site.correctionRestoresSource,
      explanationAccurate: site.explanationAccurate,
    }));
  }
  if (item.block === "BLANK") {
    base.blankOptions = item.authorHypothesis.typeEvidence.options.map((option) => ({
      label: option.canonicalLabel,
      slotGrammarCompatible: option.slotGrammarCompatible,
      passageGrounded: option.passageGrounded,
      primaryIntentAxis: option.primaryIntentAxis,
      divergentAxes: option.divergentAxes,
      singleDecisiveFlaw: option.singleDecisiveFlaw,
    }));
    base.blankAxes = item.authorHypothesis.typeEvidence.axisOracle.map((axis) => ({
      axis: axis.axis,
      answerPreserved: axis.answerPreserved,
    }));
  }
  return scoreLabelSchema.parse(base);
}

const syntheticGoldLabels = packet.items.map(syntheticLabel);
function score(review: typeof syntheticGoldLabels) {
  return computeCalibrationMetrics({
    schemaVersion: "reviewer-calibration-score-input-v1",
    goldStatus: "FINAL_ADJUDICATED_GOLD",
    packetSha256: "a".repeat(64),
    oracleSha256: "b".repeat(64),
    reviewerPseudonym: "RATER_FIXTURE_1",
    gold: syntheticGoldLabels,
    review,
  });
}
const perfectMetrics = score(structuredClone(syntheticGoldLabels));
assert(evaluateCalibration(perfectMetrics).pass, "perfect reviewer passes every gate");
assert(perfectMetrics.gwetAc1Fatal.value === 1, "perfect Gwet AC1 equals one");
assert(perfectMetrics.quadraticWeightedKappaGrade.value === 1, "perfect QWK equals one");
assert(
  perfectMetrics.focusFieldCompleteness.numerator === 456 &&
    perfectMetrics.focusFieldCompleteness.denominator === 456,
  "focus completeness derives all 456 atomic fields",
);
assert(
  perfectMetrics.grammarSiteAgreement.denominator === 200 &&
    perfectMetrics.blankOptionAgreement.denominator === 200 &&
    perfectMetrics.blankAxisAgreement.denominator === 56,
  "focus agreement denominators bind 5x5 grammar, 5x5 blank, and seven axes",
);

const sensitivityFail = structuredClone(syntheticGoldLabels);
const missedFatal = sensitivityFail.find((row) => row.block === "GRAMMAR" && row.anyFatal)!;
missedFatal.anyFatal = false;
missedFatal.grade = "C";
const sensitivityDecision = evaluateCalibration(score(sensitivityFail));
assert(sensitivityDecision.reasonCodes.includes("FATAL_SENSITIVITY_BELOW_THRESHOLD"), "one missed fatal fails sensitivity");

const specificityFail = structuredClone(syntheticGoldLabels);
for (const row of specificityFail.filter((candidate) => !candidate.anyFatal).slice(0, 3)) {
  row.anyFatal = true;
  row.grade = "F";
}
const specificityDecision = evaluateCalibration(score(specificityFail));
assert(specificityDecision.reasonCodes.includes("FATAL_SPECIFICITY_BELOW_THRESHOLD"), "three false fatals fail specificity");

const blindBoundaryPass = structuredClone(syntheticGoldLabels);
for (const block of ["GRAMMAR", "BLANK"] as const) {
  blindBoundaryPass.find((candidate) => candidate.block === block && candidate.disposition === "ANSWER")!.answerSet = ["WRONG"];
}
assert(evaluateCalibration(score(blindBoundaryPass)).pass, "blind solve 22/24 and 7/8 block boundaries pass");
const blindGlobalFail = structuredClone(blindBoundaryPass);
blindGlobalFail.find((candidate) => candidate.block === "NONFOCUS" && candidate.disposition === "ANSWER")!.answerSet = ["WRONG"];
assert(
  evaluateCalibration(score(blindGlobalFail)).reasonCodes.includes("GLOBAL_BLIND_SOLVE_EXACT_AGREEMENT_BELOW_THRESHOLD"),
  "blind solve 21/24 fails global 9/10 gate",
);
const blindBlockFail = structuredClone(syntheticGoldLabels);
for (const row of blindBlockFail.filter((candidate) => candidate.block === "GRAMMAR" && candidate.disposition === "ANSWER").slice(0, 2)) {
  row.answerSet = ["WRONG"];
}
assert(
  evaluateCalibration(score(blindBlockFail)).reasonCodes.includes("GRAMMAR_BLIND_SOLVE_EXACT_AGREEMENT_BELOW_THRESHOLD"),
  "blind solve 6/8 fails grammar block 7/8 gate",
);

const grammarBoundaryPass = structuredClone(syntheticGoldLabels);
let grammarChanged = 0;
for (const row of grammarBoundaryPass.filter((candidate) => candidate.block === "GRAMMAR")) {
  for (const site of row.grammarSites) {
    if (grammarChanged >= 10) break;
    site.pointFamily = site.pointFamily === "PARALLEL_FORM" ? "SUBJECT_VERB_AGREEMENT" : "PARALLEL_FORM";
    grammarChanged += 1;
  }
}
assert(evaluateCalibration(score(grammarBoundaryPass)).pass, "grammar 190/200 boundary passes exactly");
const grammarDiagnosticFail = structuredClone(grammarBoundaryPass);
const grammarEleventh = grammarDiagnosticFail.find((row) => row.block === "GRAMMAR")!.grammarSites[0];
grammarEleventh.explanationAccurate = !grammarEleventh.explanationAccurate;
assert(
  evaluateCalibration(score(grammarDiagnosticFail)).reasonCodes.includes("GRAMMAR_SITE_AGREEMENT_BELOW_THRESHOLD"),
  "grammar 189/200 fails exact 19/20 gate",
);

const blankBoundaryPass = structuredClone(syntheticGoldLabels);
let blankChanged = 0;
for (const row of blankBoundaryPass.filter((candidate) => candidate.block === "BLANK")) {
  for (const option of row.blankOptions) {
    if (blankChanged >= 10) break;
    option.passageGrounded = !option.passageGrounded;
    blankChanged += 1;
  }
}
assert(evaluateCalibration(score(blankBoundaryPass)).pass, "blank 190/200 boundary passes exactly");
const blankDiagnosticFail = structuredClone(blankBoundaryPass);
const blankEleventh = blankDiagnosticFail.find((row) => row.block === "BLANK")!.blankOptions[0];
blankEleventh.singleDecisiveFlaw = !blankEleventh.singleDecisiveFlaw;
assert(
  evaluateCalibration(score(blankDiagnosticFail)).reasonCodes.includes("BLANK_OPTION_AGREEMENT_BELOW_THRESHOLD"),
  "blank 189/200 fails exact 19/20 gate",
);

const axisFail = structuredClone(syntheticGoldLabels);
axisFail.find((row) => row.block === "BLANK")!.blankAxes[0].answerPreserved = false;
assert(
  evaluateCalibration(score(axisFail)).reasonCodes.includes("BLANK_AXIS_AGREEMENT_BELOW_THRESHOLD"),
  "one of 56 blank-axis errors fails exact 1/1 gate",
);

const blockSpecificityBoundary = structuredClone(syntheticGoldLabels);
const boundaryFalsePositive = blockSpecificityBoundary.find(
  (row) => row.block === "NONFOCUS" && !row.anyFatal && row.grade === "C",
)!;
boundaryFalsePositive.anyFatal = true;
boundaryFalsePositive.grade = "F";
assert(evaluateCalibration(score(blockSpecificityBoundary)).pass, "block specificity 5/6 boundary passes exactly");
const blockSpecificityFail = structuredClone(blockSpecificityBoundary);
const secondFalsePositive = blockSpecificityFail.find(
  (row) => row.block === "NONFOCUS" && !row.anyFatal && row.grade === "C",
)!;
secondFalsePositive.anyFatal = true;
secondFalsePositive.grade = "F";
assert(
  evaluateCalibration(score(blockSpecificityFail)).reasonCodes.includes("NONFOCUS_FATAL_SPECIFICITY_BELOW_THRESHOLD"),
  "block specificity 4/6 fails exact 5/6 gate",
);

const blockQwkFail = structuredClone(syntheticGoldLabels);
for (const row of blockQwkFail.filter((candidate) => candidate.block === "NONFOCUS" && !candidate.anyFatal)) {
  row.grade = "C";
}
assert(
  evaluateCalibration(score(blockQwkFail)).reasonCodes.includes("NONFOCUS_GRADE_QWK_BELOW_THRESHOLD"),
  "block QWK distortion fails exact 3/5 gate",
);

const finalGoldFixture = finalGoldSchema.parse({
  schemaVersion: "reviewer-calibration-final-gold-v1",
  artifactId: "reviewer-calibration-packet-v1",
  status: "FINAL_ADJUDICATED_GOLD",
  packetPrivateSha256: fileSha(packetPath),
  contractSha256,
  metricsSha256: fileSha(metricsPath),
  independentRatersPerItem: 2,
  freshAdjudicatorsPerItem: 1,
  items: syntheticGoldLabels.map((label) => ({
    itemId: label.itemId,
    block: label.block,
    independentReviewRecordSha256: [sha256(`R1:${label.itemId}`), sha256(`R2:${label.itemId}`)],
    adjudicatorFreshSolveSha256: sha256(`FRESH:${label.itemId}`),
    adjudicationRecordSha256: sha256(`ADJ:${label.itemId}`),
    finalLabel: label,
  })),
});
assert(finalGoldFixture.items.length === 24, "synthetic final-gold contract fixture valid");

const reviewByPseudo = new Map(syntheticRecords.map((record) => [record.itemPseudonym, record]));
const firstGrammarPseudo = issueA.privateMap.rows.find((row) => row.itemId.startsWith("RCAL-G"))!.itemPseudonym;
const firstBlankPseudo = issueA.privateMap.rows.find((row) => row.itemId.startsWith("RCAL-B"))!.itemPseudonym;
const firstNonfocusPseudo = issueA.privateMap.rows.find((row) => row.itemId.startsWith("RCAL-N"))!.itemPseudonym;

const hostileHandlers: Record<string, () => void> = {
  AUTHOR_DUPLICATE_ITEM_ID: () => {
    const value = structuredClone(packet);
    value.items[1].itemId = value.items[0].itemId;
    assertPacketComposition(authorPacketSchema.parse(value));
  },
  AUTHOR_PROVENANCE_EXTERNAL_DISPATCH: () => {
    const value = structuredClone(packet) as any;
    value.items[0].provenance.externalProviderApiDispatchAuthorized = true;
    authorPacketSchema.parse(value);
  },
  INLINE_MARKER_MISSING: () => {
    const value = structuredClone(packet) as any;
    value.items.find((item: any) => item.block === "GRAMMAR").phase1.studentSurface = value.items.find((item: any) => item.block === "GRAMMAR").phase1.studentSurface.replace("⟦A:", "A:");
    authorPacketSchema.parse(value);
  },
  INLINE_MARKER_DUPLICATE: () => {
    const value = structuredClone(packet) as any;
    value.items.find((item: any) => item.block === "GRAMMAR").phase1.studentSurface += " ⟦A: duplicate⟧";
    authorPacketSchema.parse(value);
  },
  INLINE_MARKER_ORDER: () => {
    const value = structuredClone(packet) as any;
    const row = value.items.find((item: any) => item.block === "GRAMMAR");
    row.phase1.studentSurface = row.phase1.studentSurface.replace("⟦A:", "⟦X:").replace("⟦B:", "⟦A:").replace("⟦X:", "⟦B:");
    authorPacketSchema.parse(value);
  },
  OPTION_LABEL_DUPLICATE: () => {
    const value = structuredClone(packet) as any;
    const row = value.items.find((item: any) => item.phase1.labelMode === "OPTIONS");
    row.phase1.options[1].canonicalLabel = row.phase1.options[0].canonicalLabel;
    authorPacketSchema.parse(value);
  },
  GRAMMAR_EVIDENCE_DUPLICATE: () => {
    const value = structuredClone(packet) as any;
    const row = value.items.find((item: any) => item.block === "GRAMMAR");
    row.authorHypothesis.typeEvidence.markedSites[1].canonicalLabel = "A";
    authorPacketSchema.parse(value);
  },
  GRAMMAR_OBSERVED_SURFACE_DRIFT: () => {
    const value = structuredClone(packet) as any;
    const row = value.items.find((item: any) => item.block === "GRAMMAR");
    row.authorHypothesis.typeEvidence.markedSites[0].observedSurface += " drift";
    authorPacketSchema.parse(value);
  },
  GRAMMAR_CORRECTION_SOURCE_DRIFT: () => {
    const value = structuredClone(packet) as any;
    const row = value.items.find((item: any) => item.block === "GRAMMAR");
    row.authorHypothesis.typeEvidence.markedSites[0].correction += " drift";
    authorPacketSchema.parse(value);
  },
  AUTHOR_B01_SEMANTIC_AXIS_DRIFT: () => {
    const value = structuredClone(packet) as any;
    const row = value.items.find((item: any) => item.itemId === "RCAL-B01");
    const option = row.authorHypothesis.typeEvidence.options[2];
    option.primaryIntentAxis = "causal_reversal";
    authorPacketSchema.parse(value);
  },
  AUTHOR_AB_OPTION_PACK_DRIFT: () => {
    const value = structuredClone(packet) as any;
    const row = value.items.find((item: any) => item.itemId === "RCAL-B07");
    row.phase1.options[1].text = row.phase1.options[0].text;
    assertContentCommitments(authorPacketSchema.parse(value));
  },
  AUTHOR_GRAMMAR_TAXONOMY_DRIFT: () => {
    const value = structuredClone(packet) as any;
    const row = value.items.find((item: any) => item.itemId === "RCAL-G05");
    row.authorHypothesis.typeEvidence.markedSites[4].pointFamily = "PARTICIPLE_VOICE";
    assertContentCommitments(authorPacketSchema.parse(value));
  },
  AUTHOR_N04_SHORTCUT_DRIFT: () => {
    const value = structuredClone(packet) as any;
    const row = value.items.find((item: any) => item.itemId === "RCAL-N04");
    row.phase1.studentSurface = row.phase1.studentSurface.replace(" / has", "");
    assertContentCommitments(authorPacketSchema.parse(value));
  },
  BLANK_EVIDENCE_DUPLICATE: () => {
    const value = structuredClone(packet) as any;
    const row = value.items.find((item: any) => item.block === "BLANK");
    row.authorHypothesis.typeEvidence.options[1].canonicalLabel = "1";
    authorPacketSchema.parse(value);
  },
  SUBMISSION_DUPLICATE_PSEUDONYM: () => {
    const value = structuredClone(submission);
    value.answers[23].itemPseudonym = value.answers[0].itemPseudonym;
    sealPhase1Submission({ phase1: issueA.phase1, submission: value, sealedAt: seal.sealedAt });
  },
  SUBMISSION_UNKNOWN_LABEL: () => {
    const value = structuredClone(submission);
    const answer = value.answers.find((candidate) => candidate.answerLabels.length > 0)!;
    answer.disposition = "ANSWER";
    answer.answerLabels = ["Z"];
    sealPhase1Submission({ phase1: issueA.phase1, submission: value, sealedAt: seal.sealedAt });
  },
  SUBMISSION_ANSWER_LABEL_AND_TEXT: () => {
    const value = structuredClone(submission);
    const answer = value.answers.find((candidate) => candidate.disposition === "ANSWER" && candidate.answerLabels.length === 1)!;
    answer.answerText = "conflicting text";
    answer.answerTextSha256 = sha256(answer.answerText);
    phase1SubmissionSchema.parse(value);
  },
  SUBMISSION_MULTIPLE_ONE_LABEL: () => {
    const value = structuredClone(submission);
    const answer = value.answers.find((candidate) => candidate.disposition === "MULTIPLE")!;
    answer.answerLabels = answer.answerLabels.slice(0, 1);
    phase1SubmissionSchema.parse(value);
  },
  SUBMISSION_EMPTY_DISPOSITION_HAS_LABEL: () => {
    const value = structuredClone(submission);
    const answer = value.answers.find((candidate) => candidate.disposition === "NO_ANSWER")!;
    answer.answerLabels = ["A"];
    phase1SubmissionSchema.parse(value);
  },
  SUBMISSION_BLANK_TEXT: () => {
    const value = structuredClone(submission);
    const answer = value.answers.find((candidate) => candidate.answerText !== null)!;
    answer.answerText = "   ";
    answer.answerTextSha256 = sha256(answer.answerText);
    phase1SubmissionSchema.parse(value);
  },
  SUBMISSION_TEXT_HASH_MISMATCH: () => {
    const value = structuredClone(submission);
    const answer = value.answers.find((candidate) => candidate.answerText !== null)!;
    answer.answerTextSha256 = "0".repeat(64);
    phase1SubmissionSchema.parse(value);
  },
  SUBMISSION_PACKET_HASH_MISMATCH: () => {
    const value = structuredClone(submission);
    value.phase1PacketSha256 = "0".repeat(64);
    sealPhase1Submission({ phase1: issueA.phase1, submission: value, sealedAt: seal.sealedAt });
  },
  PHASE1_INVALID_CALENDAR_TIMESTAMP: () => {
    sealPhase1Submission({ phase1: issueA.phase1, submission, sealedAt: "2026-02-30T12:00:00+09:00" });
  },
  SEAL_SUBMISSION_HASH_MISMATCH: () => {
    const value = structuredClone(seal);
    value.phase1SubmissionSha256 = "0".repeat(64);
    revealPhase2({ packet, phase1: issueA.phase1, submission, seal: value, privateMap: issueA.privateMap });
  },
  PRIVATE_MAP_MUTATION: () => {
    const value = structuredClone(issueA.privateMap);
    [value.rows[0].itemId, value.rows[1].itemId] = [value.rows[1].itemId, value.rows[0].itemId];
    revealPhase2({ packet, phase1: issueA.phase1, submission, seal, privateMap: value });
  },
  REVEAL_WITH_UNVALIDATED_SUBMISSION: () => {
    const value = structuredClone(submission);
    value.answers[0].confidence = value.answers[0].confidence === "HIGH" ? "LOW" : "HIGH";
    revealPhase2({ packet, phase1: issueA.phase1, submission: value, seal, privateMap: issueA.privateMap });
  },
  REVIEW_GRAMMAR_INCOMPLETE_SET: () => {
    const value = structuredClone(reviewByPseudo.get(firstGrammarPseudo)!);
    value.grammarSiteJudgments.pop();
    calibrationReviewRecordSchema.parse(value);
  },
  REVIEW_GRAMMAR_ATOMIC_MISSING: () => {
    const value = structuredClone(reviewByPseudo.get(firstGrammarPseudo)!) as any;
    delete value.grammarSiteJudgments[0].explanationAccurate;
    calibrationReviewRecordSchema.parse(value);
  },
  REVIEW_BLANK_DUPLICATE_SET: () => {
    const value = structuredClone(reviewByPseudo.get(firstBlankPseudo)!);
    value.blankOptionJudgments[1].label = value.blankOptionJudgments[0].label;
    calibrationReviewRecordSchema.parse(value);
  },
  REVIEW_BLANK_ATOMIC_MISSING: () => {
    const value = structuredClone(reviewByPseudo.get(firstBlankPseudo)!) as any;
    delete value.blankOptionJudgments[0].passageGrounded;
    calibrationReviewRecordSchema.parse(value);
  },
  REVIEW_BLANK_AXIS_INCOMPLETE: () => {
    const value = structuredClone(reviewByPseudo.get(firstBlankPseudo)!);
    value.blankAxisJudgments.pop();
    calibrationReviewRecordSchema.parse(value);
  },
  REVIEW_BLANK_AXIS_DUPLICATE: () => {
    const value = structuredClone(reviewByPseudo.get(firstBlankPseudo)!);
    value.blankAxisJudgments[1].axis = value.blankAxisJudgments[0].axis;
    calibrationReviewRecordSchema.parse(value);
  },
  REVIEW_NONFOCUS_HAS_FOCUS_FIELDS: () => {
    const value = structuredClone(reviewByPseudo.get(firstNonfocusPseudo)!);
    value.grammarSiteJudgments = structuredClone(reviewByPseudo.get(firstGrammarPseudo)!.grammarSiteJudgments);
    calibrationReviewRecordSchema.parse(value);
  },
  REVIEW_FATAL_GRADE_MISMATCH: () => {
    const value = structuredClone(syntheticRecords.find((record) => record.anyFatal)!);
    value.grade = "C";
    calibrationReviewRecordSchema.parse(value);
  },
  REVIEW_ANSWER_LABEL_AND_TEXT: () => {
    const value = structuredClone(syntheticRecords.find((record) => record.disposition === "ANSWER" && record.answerLabels.length === 1)!) as any;
    value.answerText = "conflicting text";
    value.answerTextSha256 = sha256(value.answerText);
    calibrationReviewRecordSchema.parse(value);
  },
  REVIEW_SURFACE_BINDING_REUSE: () => {
    const value = structuredClone(syntheticRecords);
    value[1].surfaceSha256 = value[0].surfaceSha256;
    scoreFromSealedArtifacts({
      packetRaw: packet,
      packetPrivateSha256: fileSha(packetPath),
      goldRaw: finalGoldFixture,
      goldSha256: hashJson(finalGoldFixture),
      contractSha256,
      metricsSha256: fileSha(metricsPath),
      scorerSha256: fileSha(scorePath),
      phase1Raw: issueA.phase1,
      submissionRaw: submission,
      sealRaw: seal,
      mapRaw: issueA.privateMap,
      revealRaw: reveal,
      recordsRaw: value,
      issuedAt: "2026-07-15T13:00:00+09:00",
      expiresAt: "2026-07-22T13:00:00+09:00",
    });
  },
  REVIEW_PHASE1_BINDING_REUSE: () => {
    const value = structuredClone(syntheticRecords);
    value[1].phaseOneRecordSha256 = value[0].phaseOneRecordSha256;
    scoreFromSealedArtifacts({
      packetRaw: packet,
      packetPrivateSha256: fileSha(packetPath),
      goldRaw: finalGoldFixture,
      goldSha256: hashJson(finalGoldFixture),
      contractSha256,
      metricsSha256: fileSha(metricsPath),
      scorerSha256: fileSha(scorePath),
      phase1Raw: issueA.phase1,
      submissionRaw: submission,
      sealRaw: seal,
      mapRaw: issueA.privateMap,
      revealRaw: reveal,
      recordsRaw: value,
      issuedAt: "2026-07-15T13:00:00+09:00",
      expiresAt: "2026-07-22T13:00:00+09:00",
    });
  },
  METRIC_DUPLICATE_ITEM_ID: () => {
    const review = structuredClone(syntheticGoldLabels);
    review[23].itemId = review[0].itemId;
    score(review);
  },
  METRIC_BLOCK_MISMATCH: () => {
    const review = structuredClone(syntheticGoldLabels) as any;
    const index = review.findIndex((row: any) => row.block === "NONFOCUS");
    review[index] = {
      ...review[index],
      block: "GRAMMAR",
      grammarSites: structuredClone(syntheticGoldLabels.find((row) => row.block === "GRAMMAR")!.grammarSites),
      blankOptions: [],
      blankAxes: [],
    };
    score(review);
  },
  FINAL_GOLD_DUPLICATE_RATER_HASH: () => {
    const value = structuredClone(finalGoldFixture);
    value.items[0].independentReviewRecordSha256[1] = value.items[0].independentReviewRecordSha256[0];
    finalGoldSchema.parse(value);
  },
  FINAL_GOLD_UNBALANCED_ISSUANCE: () => {
    const value = structuredClone(finalGoldFixture);
    const row = value.items.find((item) => item.finalLabel.grade === "A")!;
    row.finalLabel.grade = "B";
    const truthfulGold = finalGoldSchema.parse(value);
    assert(finalGoldCompositionIssues(truthfulGold).length > 0, "truthful unbalanced gold records eligibility reason");
    assertFinalGoldIssuanceEligible(truthfulGold);
  },
  PENDING_GOLD_SCORING: () => {
    scoreFromSealedArtifacts({
      packetRaw: packet,
      packetPrivateSha256: fileSha(packetPath),
      goldRaw: pendingGold,
      goldSha256: fileSha(goldPath),
      contractSha256,
      metricsSha256: fileSha(metricsPath),
      scorerSha256: fileSha(scorePath),
      phase1Raw: issueA.phase1,
      submissionRaw: submission,
      sealRaw: seal,
      mapRaw: issueA.privateMap,
      revealRaw: reveal,
      recordsRaw: syntheticRecords,
      issuedAt: "2026-07-15T13:00:00+09:00",
      expiresAt: "2026-07-22T13:00:00+09:00",
    });
  },
  CERTIFICATE_REVERSED_TIME: () => {
    scoreFromSealedArtifacts({
      packetRaw: packet,
      packetPrivateSha256: fileSha(packetPath),
      goldRaw: finalGoldFixture,
      goldSha256: hashJson(finalGoldFixture),
      contractSha256,
      metricsSha256: fileSha(metricsPath),
      scorerSha256: fileSha(scorePath),
      phase1Raw: issueA.phase1,
      submissionRaw: submission,
      sealRaw: seal,
      mapRaw: issueA.privateMap,
      revealRaw: reveal,
      recordsRaw: syntheticRecords,
      issuedAt: "2026-07-22T13:00:00+09:00",
      expiresAt: "2026-07-15T13:00:00+09:00",
    });
  },
};

assert(fixtures.schemaVersion === "reviewer-calibration-hostile-fixtures-v1", "hostile fixture version");
assert(fixtures.containsActualQuestion === false && fixtures.containsActualPassage === false, "hostile fixtures contain no item text");
assert(fixtures.cases.length >= 24, "at least 24 hostile cases");
for (const fixture of fixtures.cases) {
  assert(fixture.expected === "REJECT", `hostile ${fixture.id} expectation reject`);
  const handler = hostileHandlers[fixture.id];
  assert(Boolean(handler), `hostile ${fixture.id} handler exists`);
  expectReject(fixture.id, handler);
}

const publicText = readFileSync(join(here, "packet-public.json"), "utf8");
for (const item of packet.items) {
  const sample = item.phase1.studentSurface.slice(0, 40);
  assert(!publicText.includes(sample), `public omits exact text ${item.itemId}`);
}
assert(!/AIza[0-9A-Za-z_-]{20,}/u.test(publicText), "public has no Google credential shape");
assert(!/sk-or-v1-[0-9A-Za-z_-]{20,}/u.test(publicText), "public has no OpenRouter credential shape");

const privateRelative = relative(repoRoot, packetPath).replaceAll("\\", "/");
const ignored = spawnSync("git", ["check-ignore", "--quiet", privateRelative], { cwd: repoRoot });
assert(ignored.status === 0, "private item artifact is gitignored");
const tracked = spawnSync("git", ["ls-files", "--error-unmatch", privateRelative], { cwd: repoRoot, encoding: "utf8" });
assert(tracked.status !== 0, "private item artifact is untracked");

const manifestPath = join(here, "MANIFEST.sha256");
assert(existsSync(manifestPath), "manifest exists");
const manifestRows = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u).filter(Boolean);
assert(manifestRows.length >= 15, "manifest has broad closure");
for (const row of manifestRows) {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(row);
  assert(Boolean(match), `manifest row format ${row}`);
  const path = join(here, match![2]);
  assert(existsSync(path), `manifest file exists ${match![2]}`);
  assert(fileSha(path) === match![1], `manifest hash ${match![2]}`);
}

process.stdout.write(
  `${JSON.stringify({
    verdict: "PASS_PENDING_GOLD_PACKET_NO_CERTIFICATION",
    checks: checks.length,
    hostileCases: fixtures.cases.length,
    items: packet.items.length,
    goldStatus: pendingGold.status,
    certifiableReviewers: 0,
    modelApiCalls: 0,
    networkCalls: 0,
    databaseCalls: 0,
  }, null, 2)}\n`,
);
