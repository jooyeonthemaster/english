import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  answerSetSchema,
  assertPacketComposition,
  authorPacketSchema,
  calibrationReviewRecordSchema,
  canonicalTimestampSchema,
  hashJson,
  issuedPhase1PacketSchema,
  makeTextAnswer,
  pendingGoldSchema,
  phase1SealSchema,
  phase1SubmissionSchema,
  phaseOneRecordSha,
  sha256,
  withAnswerSetSha,
  type AnswerSet,
  type AuthorPacket,
  type CalibrationReviewRecord,
} from "./contract.mts";
import { computeCalibrationMetrics, evaluateCalibration, scoreLabelSchema } from "./metrics.mts";
import { issuePhase1Packet, privateIssueMapSchema, revealPhase2, sealPhase1Submission } from "./reveal.mts";
import { assertFinalGoldIssuanceEligible, certificateSchema, finalGoldCompositionIssues, finalGoldSchema, scoreFromSealedArtifacts } from "./score.mts";

const here = dirname(fileURLToPath(import.meta.url));
const privateRoot = resolve(here, "private");
function json(path: string): any { return JSON.parse(readFileSync(path, "utf8")); }
function bytesSha(path: string): string { return sha256(readFileSync(path)); }
function clone<T>(value: T): T { return structuredClone(value); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`VERIFY_ASSERTION:${message}`); }

const packet = authorPacketSchema.parse(json(resolve(privateRoot, "items.private.json")));
const pending = pendingGoldSchema.parse(json(resolve(privateRoot, "gold.private.json")));
const publicPacket = json(resolve(here, "packet-public.json"));
const hostile = json(resolve(here, "hostile-fixtures.json")) as { cases: Array<{ id: string; expected: string }> };
assertPacketComposition(packet);

let checks = 0;
function ok(condition: unknown, message: string): void { assert(condition, message); checks += 1; }
const executed = new Set<string>();
function reject(id: string, fn: () => unknown, expectedFragment?: string): void {
  let rejected = false;
  try { fn(); }
  catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (expectedFragment && !text.includes(expectedFragment)) throw new Error(`HOSTILE_WRONG_REJECTION:${id}:${text}`);
    rejected = true;
  }
  if (!rejected) throw new Error(`HOSTILE_NOT_REJECTED:${id}`);
  if (executed.has(id)) throw new Error(`HOSTILE_EXECUTED_TWICE:${id}`);
  executed.add(id); checks += 1;
}

ok(packet.items.length === 24, "24 private items");
for (const block of ["GRAMMAR", "BLANK", "NONFOCUS"]) ok(packet.items.filter((row) => row.block === block).length === 8, `${block} count 8`);
ok(new Set(packet.items.map((row) => row.topicTag)).size === 24, "24 unique topics");
ok(packet.items.every((row) => row.provenance.method === "DIRECT_ORIGINAL_LOCAL_COMPOSITION_FOR_THIS_USER_REQUEST" && !row.provenance.copiedOrAdapted), "all rows directly original");
ok(packet.items.every((row) => !row.provenance.externalApiUsed && !row.provenance.webUsed && !row.provenance.databaseUsed), "offline provenance");
ok(pending.status === "GOLD_ADJUDICATION_PENDING" && pending.items.every((row) => row.finalGold === null), "gold remains pending");
ok(publicPacket.gold.certifiableReviewers === 0, "no certificates");
ok(publicPacket.migration.v1CertificationValidity === "INVALIDATED_FOR_CERTIFICATION", "v1 invalidation preserved");
ok(publicPacket.migration.v1ReviewWorkMigratedAsGold === false, "v1 evidence never gold");
ok(publicPacket.responseContract.constructedSyntheticLabelsForbidden === true, "synthetic constructed labels forbidden");
ok(publicPacket.disjointness.withinPacket.sharedEightGrams === 0, "within-v2 disjoint");
ok(publicPacket.disjointness.currentS1Reference.sharedEightGrams === 0, "S1 disjoint");
ok(packet.items.filter((row) => row.block === "GRAMMAR").every((row) => row.authorHypothesis.typeEvidence.markedSites.filter((site) => site.displayedGrammaticality === "UNGRAMMATICAL").length === 1), "one grammatical error per grammar surface");
ok(packet.items.filter((row) => row.block === "BLANK").every((row) => row.authorHypothesis.typeEvidence.options.filter((option) => option.isKey).length === 1), "one key per blank surface");
ok(packet.items.filter((row) => row.block === "BLANK").every((row) => row.authorHypothesis.typeEvidence.options.every((option) => option.slotGrammarCompatible)), "all blank options slot-grammatical");
ok(packet.items.filter((row) => row.block === "NONFOCUS").some((row) => row.authorHypothesis.expectedAnswer.kind === "MULTIPLE_TEXTS"), "multiple constructed text exercised");
ok(packet.items.filter((row) => row.block === "NONFOCUS").some((row) => row.phase2.storedKey.acceptedEquivalenceSets.length > 1), "multiple accepted equivalence sets exercised");

const v1 = authorPacketSchema.safeParse(json(resolve(here, "../reviewer-calibration-packet-v1/private/items.private.json")));
ok(!v1.success, "v1 cannot masquerade as v2");
const v1Raw = json(resolve(here, "../reviewer-calibration-packet-v1/private/items.private.json"));
const v1Normalized = new Set(v1Raw.items.map((row: any) => row.phase2.authorizedSource.toLowerCase().replace(/[^a-z]+/gu, " ").trim()));
ok(packet.items.every((row) => !v1Normalized.has(row.phase2.authorizedSource.toLowerCase().replace(/[^a-z]+/gu, " ").trim())), "no exact normalized v1 source reuse");

const contractSha = bytesSha(resolve(here, "contract.mts"));
const issue = issuePhase1Packet({ packet, reviewerPseudonym: "V2_PROTOCOL_TESTER", seed: "v2-offline-deterministic-seed-20260715", contractSha256: contractSha });
const issueAgain = issuePhase1Packet({ packet, reviewerPseudonym: "V2_PROTOCOL_TESTER", seed: "v2-offline-deterministic-seed-20260715", contractSha256: contractSha });
ok(hashJson(issue) === hashJson(issueAgain), "deterministic issue");
ok(new Set(issue.phase1.items.map((row) => row.surfaceSha256)).size === 24, "unique issued surfaces");

function mapAnswer(answer: AnswerSet, canonicalToDisplay: Record<string, string>): AnswerSet {
  if (answer.kind === "SINGLE_LABEL") return withAnswerSetSha({ kind: "SINGLE_LABEL", label: canonicalToDisplay[answer.label] ?? answer.label });
  if (answer.kind === "MULTIPLE_LABELS") return withAnswerSetSha({ kind: "MULTIPLE_LABELS", labels: answer.labels.map((label) => canonicalToDisplay[label] ?? label) });
  return answer;
}

const authorById = new Map(packet.items.map((row) => [row.itemId, row]));
const issuedByPseudo = new Map(issue.phase1.items.map((row) => [row.itemPseudonym, row]));
const submission = phase1SubmissionSchema.parse({
  schemaVersion: "reviewer-calibration-phase1-submission-v2", packetInstanceId: issue.phase1.packetInstanceId,
  reviewerPseudonym: issue.phase1.reviewerPseudonym, phase1PacketSha256: hashJson(issue.phase1),
  answers: issue.privateMap.rows.map((mapRow) => {
    const issued = issuedByPseudo.get(mapRow.itemPseudonym)!; const author = authorById.get(mapRow.itemId)!;
    const answer = mapAnswer(author.authorHypothesis.expectedAnswer as AnswerSet, mapRow.canonicalToDisplay);
    return { itemPseudonym: mapRow.itemPseudonym, surfaceSha256: issued.surfaceSha256, answer, answerSetSha256: answer.setSha256, confidence: "HIGH" };
  }),
});
const seal = sealPhase1Submission({ phase1: issue.phase1, submission, sealedAt: "2026-07-15T20:00:00.123456+09:00" });
const reveal = revealPhase2({ packet, phase1: issue.phase1, submission, seal, privateMap: issue.privateMap });
ok(reveal.items.every((row) => row.sealedBlindRecordSha256.length === 64), "per-item sealed blind record revealed by hash");
ok(reveal.items.some((row) => row.storedKey.canonicalAnswer.kind === "MULTIPLE_TEXTS"), "multiple texts survive reveal");
ok(reveal.items.some((row) => row.storedKey.acceptedEquivalenceSets.length > 1), "accepted equivalence sets survive reveal");
const orderedLabels = withAnswerSetSha({ kind: "MULTIPLE_LABELS", labels: ["1", "2"] });
const reversedLabels = withAnswerSetSha({ kind: "MULTIPLE_LABELS", labels: ["2", "1"] });
ok(orderedLabels.setSha256 === reversedLabels.setSha256, "label-set hash is member-order-insensitive");
const orderedTexts = withAnswerSetSha({ kind: "MULTIPLE_TEXTS", texts: [makeTextAnswer("First exact sentence."), makeTextAnswer("Second exact sentence.")] });
const reversedTexts = withAnswerSetSha({ kind: "MULTIPLE_TEXTS", texts: [...orderedTexts.texts].reverse() });
ok(orderedTexts.setSha256 === reversedTexts.setSha256, "constructed-set hash is member-order-insensitive");
ok(makeTextAnswer("Exact text.").textSha256 !== makeTextAnswer("Exact  text.").textSha256, "exact text hash preserves byte distinctions");

const submissionByPseudo = new Map(submission.answers.map((row) => [row.itemPseudonym, row]));
const mapByPseudo = new Map(issue.privateMap.rows.map((row) => [row.itemPseudonym, row]));
function recordsFromHypotheses(): CalibrationReviewRecord[] {
  return issue.privateMap.rows.map((mapRow) => {
    const author = authorById.get(mapRow.itemId)!; const blind = submissionByPseudo.get(mapRow.itemPseudonym)!; const issued = issuedByPseudo.get(mapRow.itemPseudonym)!;
    const base = {
      schemaVersion: "reviewer-calibration-review-record-v2", reviewerPseudonym: issue.phase1.reviewerPseudonym, itemPseudonym: mapRow.itemPseudonym,
      block: author.block, surfaceSha256: issued.surfaceSha256, relabelMapSha256: hashJson(mapRow),
      phaseOneRecordSha256: phaseOneRecordSha(blind.itemPseudonym, blind.surfaceSha256, blind.answer as AnswerSet, blind.confidence),
      phase1SubmissionSha256: hashJson(submission), phase2RevealSha256: hashJson(reveal), blindAnswer: blind.answer,
      blindAnswerSetSha256: blind.answerSetSha256, anyFatal: author.authorHypothesis.intendedGrade === "F",
      fatalDomains: author.authorHypothesis.intendedFatalDomains, fatalCodes: author.authorHypothesis.intendedFatalCodes,
      grade: author.authorHypothesis.intendedGrade, calibrationStatus: "UNASSESSED",
    };
    if (author.block === "GRAMMAR") {
      const canonical = new Map(author.authorHypothesis.typeEvidence.markedSites.map((row) => [row.canonicalLabel, row]));
      const grammarSiteJudgments = ["A", "B", "C", "D", "E"].map((display) => {
        const row = canonical.get((mapRow.displayToCanonical[display] ?? display) as "A" | "B" | "C" | "D" | "E")!;
        return { site: display, displayedGrammaticality: row.displayedGrammaticality, diagnosis: row.diagnosis, pointFamily: row.pointFamily, correction: row.correction, correctionRestoresSource: row.correctionRestoresSource, explanationAccurate: row.explanationAccurate };
      });
      return calibrationReviewRecordSchema.parse({ ...base, grammarSiteJudgments, blankOptionJudgments: [], blankAxisJudgments: [] });
    }
    if (author.block === "BLANK") {
      const canonical = new Map(author.authorHypothesis.typeEvidence.options.map((row) => [row.canonicalLabel, row]));
      const blankOptionJudgments = ["1", "2", "3", "4", "5"].map((display) => {
        const row = canonical.get((mapRow.displayToCanonical[display] ?? display) as "1" | "2" | "3" | "4" | "5")!;
        return { label: display, slotGrammarCompatible: row.slotGrammarCompatible, passageGrounded: row.passageGrounded, primaryIntentAxis: row.primaryIntentAxis, divergentAxes: row.divergentAxes, singleDecisiveFlaw: row.singleDecisiveFlaw };
      });
      const blankAxisJudgments = author.authorHypothesis.typeEvidence.axisOracle.map((row) => ({ axis: row.axis, answerPreserved: row.answerPreserved, supportedValueEvidenceRefs: row.evidenceRefs }));
      return calibrationReviewRecordSchema.parse({ ...base, grammarSiteJudgments: [], blankOptionJudgments, blankAxisJudgments });
    }
    return calibrationReviewRecordSchema.parse({ ...base, grammarSiteJudgments: [], blankOptionJudgments: [], blankAxisJudgments: [] });
  });
}
const records = recordsFromHypotheses();
ok(records.length === 24, "24 synthetic non-gold review fixtures");
ok(new Set(records.map((row) => row.phaseOneRecordSha256)).size === 24, "cross-item phase1 records unique");

function scoreLabel(author: AuthorPacket["items"][number]) {
  const common = { itemId: author.itemId, block: author.block, canonicalAnswer: author.phase2.storedKey.canonicalAnswer, acceptedEquivalenceSets: author.phase2.storedKey.acceptedEquivalenceSets, anyFatal: author.authorHypothesis.intendedGrade === "F", grade: author.authorHypothesis.intendedGrade };
  if (author.block === "GRAMMAR") return scoreLabelSchema.parse({ ...common, grammarSites: author.authorHypothesis.typeEvidence.markedSites.map((row) => ({ site: row.canonicalLabel, displayedGrammaticality: row.displayedGrammaticality, diagnosis: row.diagnosis, pointFamily: row.pointFamily, correctionRestoresSource: row.correctionRestoresSource, explanationAccurate: row.explanationAccurate })), blankOptions: [], blankAxes: [] });
  if (author.block === "BLANK") return scoreLabelSchema.parse({ ...common, grammarSites: [], blankOptions: author.authorHypothesis.typeEvidence.options.map((row) => ({ label: row.canonicalLabel, slotGrammarCompatible: row.slotGrammarCompatible, passageGrounded: row.passageGrounded, primaryIntentAxis: row.primaryIntentAxis, divergentAxes: row.divergentAxes, singleDecisiveFlaw: row.singleDecisiveFlaw })), blankAxes: author.authorHypothesis.typeEvidence.axisOracle.map((row) => ({ axis: row.axis, answerPreserved: row.answerPreserved })) });
  return scoreLabelSchema.parse({ ...common, grammarSites: [], blankOptions: [], blankAxes: [] });
}
const labels = packet.items.map(scoreLabel);
const metricInput = { schemaVersion: "reviewer-calibration-score-input-v2", goldStatus: "FINAL_ADJUDICATED_GOLD", packetSha256: "1".repeat(64), oracleSha256: "2".repeat(64), reviewerPseudonym: "V2_PROTOCOL_TESTER", gold: labels, review: clone(labels) };
const perfectMetrics = computeCalibrationMetrics(metricInput);
ok(perfectMetrics.blindSolveExactAgreement.numerator === 24 && perfectMetrics.blindSolveExactAgreement.denominator === 24, "answer-set exact metric");
ok(evaluateCalibration(perfectMetrics).pass, "perfect synthetic fixture passes thresholds");

const finalGoldFixture = finalGoldSchema.parse({
  schemaVersion: "reviewer-calibration-final-gold-v2", artifactId: "reviewer-calibration-packet-v2", status: "FINAL_ADJUDICATED_GOLD",
  packetPrivateSha256: bytesSha(resolve(privateRoot, "items.private.json")), contractSha256: bytesSha(resolve(here, "contract.mts")), metricsSha256: bytesSha(resolve(here, "metrics.mts")),
  independentRatersPerItem: 2, freshAdjudicatorsPerItem: 1,
  items: packet.items.map((author, index) => ({ itemId: author.itemId, block: author.block, independentReviewRecordSha256: [sha256(`${author.itemId}:R1`), sha256(`${author.itemId}:R2`)], adjudicatorFreshSolve: { recordSha256: sha256(`${author.itemId}:ADJ-SOLVE`), answer: author.phase2.storedKey.canonicalAnswer, answerSetSha256: author.phase2.storedKey.canonicalAnswer.setSha256 }, adjudicationRecordSha256: sha256(`${author.itemId}:ADJ:${index}`), finalLabel: scoreLabel(author) })),
});
ok(finalGoldCompositionIssues(finalGoldFixture).length === 0, "balanced synthetic final-gold shape only");

const scorerInput = {
  packetRaw: packet, packetPrivateSha256: bytesSha(resolve(privateRoot, "items.private.json")), contractSha256: bytesSha(resolve(here, "contract.mts")), metricsSha256: bytesSha(resolve(here, "metrics.mts")), scorerSha256: bytesSha(resolve(here, "score.mts")),
  phase1Raw: issue.phase1, submissionRaw: submission, sealRaw: seal, mapRaw: issue.privateMap, revealRaw: reveal, recordsRaw: records,
  issuedAt: "2026-07-15T20:01:00+09:00", expiresAt: "2026-08-15T20:01:00+09:00",
};

const baselineItemHashes = new Map(packet.items.map((row) => [row.itemId, hashJson(row)]));
function assertContentBound(candidate: AuthorPacket): void { for (const row of candidate.items) if (baselineItemHashes.get(row.itemId) !== hashJson(row)) throw new Error(`CONTENT_COMMITMENT_DRIFT:${row.itemId}`); }

reject("AUTHOR_DUPLICATE_ITEM_ID", () => { const x = clone(packet); x.items[1].itemId = x.items[0].itemId; assertPacketComposition(authorPacketSchema.parse(x)); });
reject("AUTHOR_PROVENANCE_EXTERNAL_DISPATCH", () => { const x: any = clone(packet); x.items[0].provenance.externalProviderApiDispatchAuthorized = true; authorPacketSchema.parse(x); });
for (const [id, mutation] of [
  ["INLINE_MARKER_MISSING", (x: any) => { x.items[0].phase1.studentSurface = x.items[0].phase1.studentSurface.replace("⟦A:", "A:"); }],
  ["INLINE_MARKER_DUPLICATE", (x: any) => { x.items[0].phase1.studentSurface = x.items[0].phase1.studentSurface.replace("⟦B:", "⟦A:"); }],
  ["INLINE_MARKER_ORDER", (x: any) => { x.items[0].phase1.studentSurface = x.items[0].phase1.studentSurface.replace("⟦A:", "⟦Z:").replace("⟦B:", "⟦A:").replace("⟦Z:", "⟦B:"); }],
] as const) reject(id, () => { const x: any = clone(packet); mutation(x); authorPacketSchema.parse(x); });
reject("OPTION_LABEL_DUPLICATE", () => { const x: any = clone(packet); const row = x.items.find((r: any) => r.block === "BLANK"); row.phase1.options[1].canonicalLabel = "1"; authorPacketSchema.parse(x); });
reject("GRAMMAR_EVIDENCE_DUPLICATE", () => { const x: any = clone(packet); x.items[0].authorHypothesis.typeEvidence.markedSites[1].canonicalLabel = "A"; authorPacketSchema.parse(x); });
reject("GRAMMAR_OBSERVED_SURFACE_DRIFT", () => { const x: any = clone(packet); x.items[0].authorHypothesis.typeEvidence.markedSites[0].observedSurface += " drift"; authorPacketSchema.parse(x); });
reject("GRAMMAR_CORRECTION_SOURCE_DRIFT", () => { const x: any = clone(packet); x.items[0].authorHypothesis.typeEvidence.markedSites[0].correction += " drift"; authorPacketSchema.parse(x); });
reject("AUTHOR_B01_SEMANTIC_AXIS_DRIFT", () => { const x: any = clone(packet); const row = x.items.find((r: any) => r.itemId === "RCAL2-B01"); row.authorHypothesis.typeEvidence.options[1].divergentAxes = []; authorPacketSchema.parse(x); });
for (const [id, itemId, mutate] of [
  ["AUTHOR_AB_OPTION_PACK_DRIFT", "RCAL2-B07", (row: any) => { row.phase1.options[1].text += " drift"; }],
  ["AUTHOR_GRAMMAR_TAXONOMY_DRIFT", "RCAL2-G07", (row: any) => { row.authorHypothesis.typeEvidence.markedSites[0].pointFamily = "PARALLEL_FORM"; }],
  ["AUTHOR_N04_SHORTCUT_DRIFT", "RCAL2-N04", (row: any) => { row.phase1.studentSurface += " obvious hint"; }],
] as const) reject(id, () => { const x = clone(packet); mutate(x.items.find((row) => row.itemId === itemId)); assertContentBound(authorPacketSchema.parse(x)); });
reject("BLANK_EVIDENCE_DUPLICATE", () => { const x: any = clone(packet); const row = x.items.find((r: any) => r.block === "BLANK"); row.authorHypothesis.typeEvidence.options[1].canonicalLabel = "1"; authorPacketSchema.parse(x); });

reject("SUBMISSION_DUPLICATE_PSEUDONYM", () => { const x: any = clone(submission); x.answers[1].itemPseudonym = x.answers[0].itemPseudonym; sealPhase1Submission({ phase1: issue.phase1, submission: phase1SubmissionSchema.parse(x), sealedAt: seal.sealedAt }); });
reject("SUBMISSION_UNKNOWN_LABEL", () => { const x: any = clone(submission); const row = x.answers.find((a: any) => a.answer.kind === "SINGLE_LABEL"); row.answer = withAnswerSetSha({ kind: "SINGLE_LABEL", label: "Z" }); row.answerSetSha256 = row.answer.setSha256; sealPhase1Submission({ phase1: issue.phase1, submission: x, sealedAt: seal.sealedAt }); });
reject("SUBMISSION_ANSWER_LABEL_AND_TEXT", () => { const x: any = clone(submission); const row = x.answers.find((a: any) => a.answer.kind === "SINGLE_LABEL"); row.answer.text = makeTextAnswer("conflict"); phase1SubmissionSchema.parse(x); });
reject("SUBMISSION_MULTIPLE_ONE_LABEL", () => { const x: any = clone(submission); x.answers[0].answer = { kind: "MULTIPLE_LABELS", labels: ["1"], setSha256: "0".repeat(64) }; phase1SubmissionSchema.parse(x); });
reject("SUBMISSION_EMPTY_DISPOSITION_HAS_LABEL", () => { const x: any = clone(submission); x.answers[0].answer = { ...withAnswerSetSha({ kind: "NO_ANSWER" }), label: "1" }; phase1SubmissionSchema.parse(x); });
reject("SUBMISSION_BLANK_TEXT", () => { const x: any = clone(submission); const row = x.answers.find((a: any) => a.answer.kind === "SINGLE_TEXT"); row.answer.text = makeTextAnswer(" "); row.answer.setSha256 = "0".repeat(64); phase1SubmissionSchema.parse(x); });
reject("SUBMISSION_TEXT_HASH_MISMATCH", () => { const x: any = clone(submission); const row = x.answers.find((a: any) => a.answer.kind === "SINGLE_TEXT"); row.answer.text.textSha256 = "0".repeat(64); phase1SubmissionSchema.parse(x); });
reject("SUBMISSION_PACKET_HASH_MISMATCH", () => { const x = clone(submission); x.phase1PacketSha256 = "0".repeat(64); sealPhase1Submission({ phase1: issue.phase1, submission: x, sealedAt: seal.sealedAt }); });
reject("PHASE1_INVALID_CALENDAR_TIMESTAMP", () => sealPhase1Submission({ phase1: issue.phase1, submission, sealedAt: "2026-02-30T00:00:00Z" }));
reject("SEAL_SUBMISSION_HASH_MISMATCH", () => { const x = clone(seal); x.phase1SubmissionSha256 = "0".repeat(64); revealPhase2({ packet, phase1: issue.phase1, submission, seal: x, privateMap: issue.privateMap }); });
reject("PRIVATE_MAP_MUTATION", () => { const x = clone(issue.privateMap); x.rows[0].displayToCanonical[Object.keys(x.rows[0].displayToCanonical)[0] ?? "1"] = "Z"; revealPhase2({ packet, phase1: issue.phase1, submission, seal, privateMap: x }); });
reject("REVEAL_WITH_UNVALIDATED_SUBMISSION", () => { const x: any = clone(submission); const row = x.answers.find((a: any) => a.answer.kind === "SINGLE_LABEL"); row.answer = withAnswerSetSha({ kind: "SINGLE_LABEL", label: "Z" }); row.answerSetSha256 = row.answer.setSha256; revealPhase2({ packet, phase1: issue.phase1, submission: x, seal, privateMap: issue.privateMap }); });

const grammarRecord = records.find((row) => row.block === "GRAMMAR")!; const blankRecord = records.find((row) => row.block === "BLANK")!; const nonfocusRecord = records.find((row) => row.block === "NONFOCUS")!;
reject("REVIEW_GRAMMAR_INCOMPLETE_SET", () => { const x: any = clone(grammarRecord); x.grammarSiteJudgments.pop(); calibrationReviewRecordSchema.parse(x); });
reject("REVIEW_GRAMMAR_ATOMIC_MISSING", () => { const x: any = clone(grammarRecord); delete x.grammarSiteJudgments[0].pointFamily; calibrationReviewRecordSchema.parse(x); });
reject("REVIEW_BLANK_DUPLICATE_SET", () => { const x: any = clone(blankRecord); x.blankOptionJudgments[1].label = x.blankOptionJudgments[0].label; calibrationReviewRecordSchema.parse(x); });
reject("REVIEW_BLANK_ATOMIC_MISSING", () => { const x: any = clone(blankRecord); delete x.blankOptionJudgments[0].primaryIntentAxis; calibrationReviewRecordSchema.parse(x); });
reject("REVIEW_BLANK_AXIS_INCOMPLETE", () => { const x: any = clone(blankRecord); x.blankAxisJudgments.pop(); calibrationReviewRecordSchema.parse(x); });
reject("REVIEW_BLANK_AXIS_DUPLICATE", () => { const x: any = clone(blankRecord); x.blankAxisJudgments[1].axis = x.blankAxisJudgments[0].axis; calibrationReviewRecordSchema.parse(x); });
reject("REVIEW_NONFOCUS_HAS_FOCUS_FIELDS", () => { const x: any = clone(nonfocusRecord); x.grammarSiteJudgments = clone(grammarRecord.grammarSiteJudgments); calibrationReviewRecordSchema.parse(x); });
reject("REVIEW_FATAL_GRADE_MISMATCH", () => { const x: any = clone(grammarRecord); x.grade = x.grade === "F" ? "A" : "F"; calibrationReviewRecordSchema.parse(x); });
reject("REVIEW_ANSWER_LABEL_AND_TEXT", () => { const x: any = clone(grammarRecord); x.blindAnswer.text = makeTextAnswer("conflict"); calibrationReviewRecordSchema.parse(x); });
reject("REVIEW_SURFACE_BINDING_REUSE", () => { const x: any = clone(scorerInput); x.recordsRaw[1].surfaceSha256 = x.recordsRaw[0].surfaceSha256; scoreFromSealedArtifacts(x); }, "REVIEW_SURFACE_OR_MAP_MISMATCH");
reject("REVIEW_PHASE1_BINDING_REUSE", () => { const x: any = clone(scorerInput); x.recordsRaw[1].phaseOneRecordSha256 = x.recordsRaw[0].phaseOneRecordSha256; scoreFromSealedArtifacts(x); }, "REVIEW_PHASE1_RECORD_CROSS_ITEM_REUSE");

reject("METRIC_DUPLICATE_ITEM_ID", () => { const x: any = clone(metricInput); x.review[1].itemId = x.review[0].itemId; computeCalibrationMetrics(x); });
reject("METRIC_BLOCK_MISMATCH", () => { const x: any = clone(metricInput); const grammarId = x.gold.find((row: any) => row.block === "GRAMMAR").itemId; const blank = x.review.find((row: any) => row.block === "BLANK"); blank.itemId = grammarId; computeCalibrationMetrics(x); });
reject("FINAL_GOLD_DUPLICATE_RATER_HASH", () => { const x: any = clone(finalGoldFixture); x.items[0].independentReviewRecordSha256[1] = x.items[0].independentReviewRecordSha256[0]; finalGoldSchema.parse(x); });
reject("FINAL_GOLD_UNBALANCED_ISSUANCE", () => { const x: any = clone(finalGoldFixture); const row = x.items.find((item: any) => item.block === "GRAMMAR" && item.finalLabel.grade === "A"); row.finalLabel.grade = "B"; assertFinalGoldIssuanceEligible(finalGoldSchema.parse(x)); });
reject("PENDING_GOLD_SCORING", () => scoreFromSealedArtifacts(scorerInput), "GOLD_ADJUDICATION_PENDING");
reject("CERTIFICATE_REVERSED_TIME", () => certificateSchema.parse({ schemaVersion: "reviewer-calibration-certificate-v2", artifactId: "reviewer-calibration-packet-v2", reviewerPseudonym: "TESTER", decision: "FAILED", packetPrivateSha256: "0".repeat(64), finalGoldSha256: "1".repeat(64), contractSha256: "2".repeat(64), metricsSha256: "3".repeat(64), scorerSha256: "4".repeat(64), phase1PacketSha256: "5".repeat(64), phase1SubmissionSha256: "6".repeat(64), phase1SealSha256: "7".repeat(64), phase2RevealSha256: "8".repeat(64), reviewRecordsSha256: "9".repeat(64), thresholds: {}, metrics: {}, reasonCodes: [], scope: { focusTypes: ["GRAMMAR_ERROR", "BLANK_INFERENCE"], allNonfocusTypesCertified: false, supplementalS3CalibrationRequired: true }, issuedAt: "2026-08-01T00:00:00Z", expiresAt: "2026-07-01T00:00:00Z" }));

reject("RAW_FILE_HASH_USED_AS_CANONICAL_PACKET_HASH", () => { const x = clone(submission); x.phase1PacketSha256 = sha256(`${JSON.stringify(issue.phase1, null, 2)}\n`); sealPhase1Submission({ phase1: issue.phase1, submission: x, sealedAt: seal.sealedAt }); });
reject("MULTIPLE_TEXT_CARDINALITY_ONE", () => answerSetSchema.parse({ kind: "MULTIPLE_TEXTS", texts: [makeTextAnswer("One")], setSha256: "0".repeat(64) }));
reject("MULTIPLE_LABEL_CARDINALITY_ONE", () => answerSetSchema.parse({ kind: "MULTIPLE_LABELS", labels: ["1"], setSha256: "0".repeat(64) }));
reject("DUPLICATE_EXACT_CONSTRUCTED_TEXT", () => answerSetSchema.parse(withAnswerSetSha({ kind: "MULTIPLE_TEXTS", texts: [makeTextAnswer("Exact text."), makeTextAnswer("Exact text.")] })));
reject("DUPLICATE_WHITESPACE_EQUIVALENT_TEXT", () => answerSetSchema.parse(withAnswerSetSha({ kind: "MULTIPLE_TEXTS", texts: [makeTextAnswer("Alpha beta."), makeTextAnswer("Alpha   beta.")] })));
reject("DUPLICATE_ACCEPTED_EQUIVALENCE_SET", () => { const x: any = clone(packet); const row = x.items.find((item: any) => item.itemId === "RCAL2-N05"); row.phase2.storedKey.acceptedEquivalenceSets = [row.phase2.storedKey.canonicalAnswer, row.phase2.storedKey.canonicalAnswer]; authorPacketSchema.parse(x); });
reject("LABEL_TEXT_DOMAIN_MIX_IN_ACCEPTED_SETS", () => { const x: any = clone(packet); const row = x.items.find((item: any) => item.itemId === "RCAL2-N05"); row.phase2.storedKey.acceptedEquivalenceSets.push(withAnswerSetSha({ kind: "SINGLE_LABEL", label: "1" })); authorPacketSchema.parse(x); });
reject("CANONICAL_ANSWER_NOT_IN_ACCEPTED_SETS", () => { const x: any = clone(packet); const row = x.items.find((item: any) => item.itemId === "RCAL2-N05"); row.phase2.storedKey.acceptedEquivalenceSets = [withAnswerSetSha({ kind: "SINGLE_TEXT", text: makeTextAnswer("A different complete response.") })]; authorPacketSchema.parse(x); });
reject("CONSTRUCTED_SYNTHETIC_LABEL", () => { const x: any = clone(submission); const constructed = issue.phase1.items.find((row) => row.labelMode === "CONSTRUCTED")!; const row = x.answers.find((answer: any) => answer.itemPseudonym === constructed.itemPseudonym); row.answer = withAnswerSetSha({ kind: "SINGLE_LABEL", label: "INITIAL_ONLY" }); row.answerSetSha256 = row.answer.setSha256; sealPhase1Submission({ phase1: issue.phase1, submission: x, sealedAt: seal.sealedAt }); });
reject("LABELED_ITEM_CONSTRUCTED_TEXT", () => { const x: any = clone(submission); const labeled = issue.phase1.items.find((row) => row.labelMode !== "CONSTRUCTED")!; const row = x.answers.find((answer: any) => answer.itemPseudonym === labeled.itemPseudonym); row.answer = withAnswerSetSha({ kind: "SINGLE_TEXT", text: makeTextAnswer("A full text answer.") }); row.answerSetSha256 = row.answer.setSha256; sealPhase1Submission({ phase1: issue.phase1, submission: x, sealedAt: seal.sealedAt }); });
reject("ANSWER_SET_HASH_MEMBER_ORDER_DRIFT", () => { const good = withAnswerSetSha({ kind: "MULTIPLE_LABELS", labels: ["1", "2"] }); answerSetSchema.parse({ ...good, labels: ["2", "1"], setSha256: sha256(JSON.stringify(["2", "1"])) }); });
reject("PHASE1_CROSS_ITEM_RECORD_HASH_REUSE", () => { const x: any = clone(seal); x.perItemRecordSha256[1].recordSha256 = x.perItemRecordSha256[0].recordSha256; phase1SealSchema.parse(x); if (new Set(x.perItemRecordSha256.map((row: any) => row.recordSha256)).size !== 24) throw new Error("PHASE1_RECORD_HASH_CROSS_ITEM_REUSE"); });
reject("RELABEL_MAP_ROW_CROSS_ITEM_REUSE", () => { const x: any = clone(issue.privateMap); x.rows[1] = clone(x.rows[0]); revealPhase2({ packet, phase1: issue.phase1, submission, seal, privateMap: privateIssueMapSchema.parse(x) }); });
reject("REVIEW_BLIND_ANSWER_HASH_MUTATION", () => { const x: any = clone(grammarRecord); x.blindAnswerSetSha256 = "0".repeat(64); calibrationReviewRecordSchema.parse(x); });
reject("FINAL_GOLD_ADJUDICATOR_ANSWER_HASH_MISMATCH", () => { const x: any = clone(finalGoldFixture); x.items[0].adjudicatorFreshSolve.answerSetSha256 = "0".repeat(64); finalGoldSchema.parse(x); });
reject("FINAL_GOLD_ACCEPTED_SET_DUPLICATE", () => { const x: any = clone(finalGoldFixture); x.items[0].finalLabel.acceptedEquivalenceSets.push(clone(x.items[0].finalLabel.acceptedEquivalenceSets[0])); finalGoldSchema.parse(x); });
reject("ORACLE_ARGUMENT_INJECTION", () => scoreFromSealedArtifacts({ ...scorerInput, goldRaw: finalGoldFixture }), "unrecognized_keys");
reject("TIMESTAMP_FRACTION_OVER_MICROSECONDS", () => canonicalTimestampSchema.parse("2026-07-15T00:00:00.1234567Z"));
reject("TIMESTAMP_OFFSET_OUT_OF_RANGE", () => canonicalTimestampSchema.parse("2026-07-15T00:00:00+15:00"));

const listed = hostile.cases.map((row) => row.id);
ok(new Set(listed).size === listed.length, "hostile IDs unique");
ok(hostile.cases.every((row) => row.expected === "REJECT"), "all hostile cases fail closed");
ok(executed.size === hostile.cases.length, "every hostile case executed");
for (const id of listed) ok(executed.has(id), `hostile executed ${id}`);

process.stdout.write(`${JSON.stringify({ verdict: "PASS_PENDING_GOLD_PACKET_V2_NO_CERTIFICATION", checks, hostileCases: executed.size, items: packet.items.length, goldStatus: pending.status, reviewerIssuesCreated: 0, certificatesCreated: 0, modelApiCalls: 0, networkCalls: 0, databaseCalls: 0, secretReads: 0 }, null, 2)}\n`);
