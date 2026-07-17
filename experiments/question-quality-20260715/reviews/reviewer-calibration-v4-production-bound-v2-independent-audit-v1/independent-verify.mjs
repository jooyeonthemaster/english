import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const SUBJECT_REL = "experiments/question-quality-20260715/design/reviewer-calibration-v4-production-bound-v2";
const AUDIT_REL = "experiments/question-quality-20260715/reviews/reviewer-calibration-v4-production-bound-v2-independent-audit-v1";
const SUBJECT = path.join(ROOT, ...SUBJECT_REL.split("/"));
const SUBJECT_ONLY = process.argv.includes("--subject-only");

const SUBJECT_HASHES = Object.freeze({
  "event-schemas.json": "0569b2406f2eb244cc4c7b44a01c379b0af6bb3e72d79eaac6a5f7f510709511",
  "hostile-fixtures.json": "206ddcdfe2ab25c98977100f72faa09146fe8a350d56a2a346094d665e80f79f",
  "MANIFEST.sha256": "10801e127bb612e2bb6909acf857ff6fa2ef0cac667a0fd7e4e39f774e656413",
  "protocol.json": "d537cc551612951565bacd8293786b44a5b18276720f9b04e6ab21d932f074de",
  "PROTOCOL.md": "b12e2c0835c639a02081eea33498927c78b60dc0bd335468d228a8374b8b2611",
  "public-manifest.json": "2b5426fdab4e5d56e0e8e45ebdd34f0cabf8c72270b1d3ac7b4932dca1332d98",
  "README.md": "32b19a8a3f5080b61858cac52bb4dcc89a7edef00c68bcebbaec5c72b926a8f9",
  "registries.json": "0ee8e767b6f712a946c3c5e94f271e07fd266ad2f0e1d14694bbf1851a5de6cc",
  "verify.mjs": "e46651bd24107abd4b910a6815f3012a36e3c3020acdf9042fc22d20c8958a56",
});

const DIRECT_UPSTREAMS = Object.freeze([
  ["evaluation-authority-v2-public-manifest", "experiments/question-quality-20260715/design/evaluation-authority-v2/public-manifest.json", "c62fb02e27b0342ce31fe8fc38ec32034738bfe2ddadec9fe2861a1ae8e614bd"],
  ["evaluation-authority-v2-subject-manifest", "experiments/question-quality-20260715/design/evaluation-authority-v2/MANIFEST.sha256", "ac4ed7ee8bd5eb21bd45837f2a7396219142e6ccd3a1fe933916238e447f0180"],
  ["evaluation-authority-v2-independent-audit-manifest", "experiments/question-quality-20260715/reviews/evaluation-authority-v2-independent-audit-v1/MANIFEST.sha256", "0cdf9d676bdec820e728a3b3890237b3b80d201caa2c20afc7af46ed6482adf5"],
  ["production-type-binding-v4-subject-manifest", "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/MANIFEST.sha256", "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04"],
  ["production-type-binding-v4-independent-audit-manifest", "experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1/MANIFEST.sha256", "796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d"],
  ["reviewer-calibration-v3-replacement-v1-protocol", "experiments/question-quality-20260715/design/reviewer-calibration-v3-replacement-v1/protocol.json", "4c27307bf83586a5ffb5301f4aaa6915ca5da8ec4e985f9a259185da8495e162"],
  ["reviewer-calibration-v3-replacement-v1-manifest", "experiments/question-quality-20260715/design/reviewer-calibration-v3-replacement-v1/MANIFEST.sha256", "ea73ff0796f73065f701a294c5ee3b768a9f8ff8d8ffb79979fbe72abe64ba64"],
]);

const TYPES = Object.freeze([
  "BLANK_INFERENCE", "GRAMMAR_ERROR", "GRAMMAR_CHOICE_COMBO", "VOCAB_CHOICE",
  "SENTENCE_ORDER", "SENTENCE_INSERT", "TOPIC", "MAIN_IDEA", "TITLE",
  "IMPLIED_MEANING", "REFERENCE", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC",
  "IRRELEVANT", "CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE", "SUMMARY_WRITING", "WORD_ORDER", "TOPIC_SENTENCE_WRITING",
  "GRAMMAR_CORRECTION", "CONTEXT_MEANING", "SYNONYM", "ANTONYM",
]);

const FAMILIES = Object.freeze([
  ["NF-F1-GLOBAL_MEANING_SELECTION", ["TOPIC", "MAIN_IDEA", "TITLE"]],
  ["NF-F2-LOCAL_INFERENCE_AND_REFERENCE", ["IMPLIED_MEANING", "REFERENCE", "CONTENT_MATCH"]],
  ["NF-F3-DISCOURSE_STRUCTURE", ["SENTENCE_ORDER", "SENTENCE_INSERT", "IRRELEVANT"]],
  ["NF-F4-GRAMMAR_FORM_DIAGNOSIS", ["GRAMMAR_CHOICE_COMBO", "GRAMMAR_CORRECTION"]],
  ["NF-F5-LEXICAL_SEMANTICS", ["VOCAB_CHOICE", "CONTEXT_MEANING", "SYNONYM", "ANTONYM"]],
  ["NF-F6-SUMMARY_AND_COMPRESSION", ["SUMMARY_COMPLETE_MC", "SUMMARY_COMPLETE", "SUMMARY_WRITING"]],
  ["NF-F7-CONTROLLED_REWRITE_AND_ORDER", ["CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "WORD_ORDER"]],
  ["NF-F8-TARGETED_CONSTRUCTED_EXPRESSION", ["FILL_BLANK_KEY", "TOPIC_SENTENCE_WRITING"]],
]);

const STATES = Object.freeze([
  "PRE_ACCESS_UNAUTHORIZED", "TAXONOMY_PILOT_12_ISSUED", "TAXONOMY_PILOT_12_PASSED_SEALED",
  "MAIN_CERTIFICATION_24_ISSUED", "MAIN_CERTIFICATION_24_PASSED_SEALED",
  "INDEPENDENT_TRUSTED_GOLD_AUDIT_PASSED_SEALED", "ACTIVATION_HOLDOUT_24_ISSUED",
  "ACTIVATION_HOLDOUT_24_PASSED_SEALED", "EVALUATOR_AUTHORITY_GRANTED",
]);

const PHASE_SEALS = Object.freeze([
  "ROLE_REGISTRY_SHA256", "TAXONOMY_PILOT_PACKET_SHA256", "TAXONOMY_PILOT_ALL_RESPONSE_SHA256S",
  "TAXONOMY_PILOT_DECISION_SHA256", "MAIN_PACKET_SHA256", "MAIN_ALL_PHASE1_RESPONSE_SHA256S",
  "MAIN_REVEAL_SHA256", "MAIN_ALL_PHASE2_RESPONSE_SHA256S", "MAIN_DECISION_SHA256",
  "TRUSTED_GOLD_AUDIT_INPUT_SHA256", "TRUSTED_GOLD_AUDIT_ACCESS_EVENTS_SHA256",
  "TRUSTED_GOLD_AUDIT_REPORT_SHA256", "HOLDOUT_PACKET_SHA256", "HOLDOUT_ALL_RESPONSE_SHA256S",
  "HOLDOUT_DECISION_SHA256", "TWO_DISTINCT_REVIEWER_CERTIFICATES_SHA256S",
  "FRESH_ADJUDICATOR_BINDING_SHA256", "SEPARATE_ACTIVATION_EVENT_SHA256",
  "SEPARATE_ACTIVATION_AUDIT_MANIFEST_SHA256",
]);

const HIDDEN_BINDINGS = Object.freeze([
  "SLOT_ID", "PHASE_BLOCK_AND_ORDINAL", "ITEM_IDENTITY_AND_SOURCE", "VISIBLE_SURFACE_SHA256",
  "ANSWER_KEY", "TRUSTED_GOLD_AND_ACCEPTED_EQUIVALENCE_OR_CONSTRAINTS",
  "EXPLANATION_AND_FATAL_CRAFT_EVIDENCE", "AUTHOR_HYPOTHESIS_AND_TARGET",
  "REJECTION_AND_SURPLUS_HISTORY_COMMITMENT", "TYPE_FAMILY_ROTATION_EPOCH",
  "PACKET_ORDER_AND_RELABEL_COMMITMENT",
]);

const HIDDEN_CLASSES = Object.freeze([
  "ITEM_IDENTITY_AND_SOURCE", "ANSWER_KEY", "TRUSTED_GOLD", "EXPLANATION_AND_SCORING_EVIDENCE",
  "AUTHOR_HYPOTHESIS_AND_TARGET", "REJECTION_AND_SURPLUS_HISTORY", "OTHER_RATER_RECORDS",
  "ADJUDICATION_DRAFT", "TYPE_FAMILY_ROTATION_EPOCH",
  "MODEL_PROVIDER_ROUTE_PROFILE_PROMPT_COST_USAGE_GENERATION_METADATA",
]);

const TRUSTED_AUDITOR_INCOMPATIBLE = Object.freeze([
  "ANY_PACKET_AUTHOR", "TAXONOMY_PILOT_RATER", "MAIN_CERTIFICATION_RATER",
  "ACTIVATION_HOLDOUT_RATER", "S1_REVIEWER", "S1_ADJUDICATOR", "S1_RESULT_CUSTODIAN",
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => JSON.stringify(value);
const same = (left, right) => json(left) === json(right);
const clone = (value) => structuredClone(value);

function normalizeRelative(relative) {
  assert.equal(typeof relative, "string", "path must be a string");
  assert(relative.length > 0 && !path.isAbsolute(relative), `absolute/empty path refused: ${relative}`);
  const slash = relative.replaceAll("\\", "/");
  const components = slash.split("/");
  assert(!components.includes("") && !components.includes(".") && !components.includes(".."), `noncanonical path refused: ${relative}`);
  return slash;
}

function isForbidden(relative) {
  return normalizeRelative(relative).split("/").some((component) => component.toLowerCase() === "private");
}

function absoluteFor(relative) {
  const safe = normalizeRelative(relative);
  assert(!isForbidden(safe), `forbidden private resource refused: ${safe}`);
  const absolute = path.resolve(ROOT, ...safe.split("/"));
  const rel = path.relative(ROOT, absolute);
  assert(rel && !rel.startsWith("..") && !path.isAbsolute(rel), `repository escape refused: ${safe}`);
  const stat = lstatSync(absolute);
  assert(stat.isFile() && !stat.isSymbolicLink(), `non-direct regular file refused: ${safe}`);
  const real = realpathSync(absolute);
  const realRel = path.relative(ROOT, real);
  assert(realRel && !realRel.startsWith("..") && !path.isAbsolute(realRel), `realpath escape refused: ${safe}`);
  return absolute;
}

function readSafe(relative) {
  return readFileSync(absoluteFor(relative));
}

function parseSafeJson(relative) {
  const bytes = readSafe(relative);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.notEqual(text.charCodeAt(0), 0xfeff, `BOM refused: ${relative}`);
  return JSON.parse(text);
}

function resolveManifestRow(manifestRelative, rowPath) {
  const normalized = normalizeRelative(rowPath);
  if (normalized.startsWith("experiments/")) return normalized;
  return path.posix.normalize(path.posix.join(path.posix.dirname(manifestRelative), normalized));
}

function verifyManifest(manifestRelative) {
  const bytes = readSafe(manifestRelative);
  const lines = bytes.toString("utf8").trimEnd().split(/\r?\n/u);
  const rows = [];
  const names = new Set();
  let refusedPrivateRows = 0;
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  ([^\r\n]+)$/u.exec(line);
    assert(match, `invalid manifest row in ${manifestRelative}: ${line}`);
    const rowPath = normalizeRelative(match[2]);
    assert(!names.has(rowPath), `duplicate manifest row in ${manifestRelative}: ${rowPath}`);
    names.add(rowPath);
    const resolvedPath = resolveManifestRow(manifestRelative, rowPath);
    if (isForbidden(resolvedPath)) {
      refusedPrivateRows += 1;
      rows.push({ path: rowPath, resolvedPath, expectedSha256: match[1], observedSha256: null, disposition: "REFUSED_PRIVATE_PATH_UNOPENED" });
      continue;
    }
    const observedSha256 = sha256(readSafe(resolvedPath));
    assert.equal(observedSha256, match[1], `manifest row drift: ${resolvedPath}`);
    rows.push({ path: rowPath, resolvedPath, expectedSha256: match[1], observedSha256, disposition: "REHASHED_PUBLIC_ROW" });
  }
  return { manifestRelative, manifestSha256: sha256(bytes), rowCount: rows.length, rehashedRows: rows.length - refusedPrivateRows, refusedPrivateRows, rows };
}

function subjectHashes() {
  const actualNames = readdirSync(SUBJECT, { withFileTypes: true });
  assert(actualNames.every((entry) => entry.isFile() && !entry.isSymbolicLink()), "subject contains a non-file or symlink");
  const names = actualNames.map((entry) => entry.name).sort();
  assert.deepEqual(names, Object.keys(SUBJECT_HASHES).sort(), "subject exact file set drifted");
  const rows = {};
  for (const [name, expected] of Object.entries(SUBJECT_HASHES)) {
    const relative = `${SUBJECT_REL}/${name}`;
    const observed = sha256(readSafe(relative));
    assert.equal(observed, expected, `subject file drift: ${name}`);
    rows[name] = observed;
  }
  return rows;
}

function assertDirectAndNestedLineage(subjectPublicManifest) {
  assert.equal(subjectPublicManifest.publicOnly, true);
  assert.deepEqual(subjectPublicManifest.forbiddenPathComponents, ["private"]);
  assert.equal(subjectPublicManifest.upstreams.length, DIRECT_UPSTREAMS.length);
  const direct = [];
  for (let index = 0; index < DIRECT_UPSTREAMS.length; index += 1) {
    const [id, relative, expected] = DIRECT_UPSTREAMS[index];
    const declared = subjectPublicManifest.upstreams[index];
    assert.deepEqual(
      [declared.id, declared.path, declared.expectedSha256, declared.observedSha256],
      [id, relative, expected, expected],
      `subject upstream row drift: ${id}`,
    );
    const observed = sha256(readSafe(relative));
    assert.equal(observed, expected, `direct upstream drift: ${id}`);
    direct.push({ id, path: relative, sha256: observed });
  }

  const directManifestRows = [];
  for (const [, relative] of DIRECT_UPSTREAMS.filter(([, value]) => value.endsWith("MANIFEST.sha256"))) {
    directManifestRows.push(verifyManifest(relative));
  }
  assert.equal(directManifestRows.reduce((sum, row) => sum + row.rowCount, 0), 26, "direct manifest lineage row count drift");
  assert.equal(directManifestRows.reduce((sum, row) => sum + row.refusedPrivateRows, 0), 0, "direct manifest lineage contains forbidden rows");

  const evaluation = parseSafeJson(DIRECT_UPSTREAMS[0][1]);
  assert.equal(evaluation.status, "DESIGN_ONLY_EXECUTION_BLOCKED");
  assert.equal(evaluation.publicOnly, true);
  assert.equal(evaluation.authority.evaluatorAuthorityGranted, false);
  assert.equal(evaluation.authority.scoringAuthorityGranted, false);
  assert.equal(evaluation.authority.authorizedReviewers, 0);
  assert.equal(evaluation.authority.authorizedAdjudicators, 0);
  assert.equal(evaluation.upstreams.length, 10, "evaluation nested upstream byte count drift");
  const evaluationNested = [];
  const evaluationNestedManifests = [];
  for (const row of evaluation.upstreams) {
    assert(!isForbidden(row.path), `evaluation public manifest directly names a forbidden path: ${row.path}`);
    const observed = sha256(readSafe(row.path));
    assert.equal(observed, row.sha256, `evaluation nested upstream drift: ${row.id}`);
    assert.equal(observed, row.observedSha256, `evaluation observed pin drift: ${row.id}`);
    evaluationNested.push({ id: row.id, path: row.path, sha256: observed });
    if (row.path.endsWith("MANIFEST.sha256")) evaluationNestedManifests.push(verifyManifest(row.path));
  }

  const evaluationAudit = parseSafeJson("experiments/question-quality-20260715/reviews/evaluation-authority-v2-independent-audit-v1/audit.json");
  assert.equal(evaluationAudit.verdict, "PASS_NO_BLOCKERS");
  assert.equal(evaluationAudit.subject.publicManifestSha256, DIRECT_UPSTREAMS[0][2]);
  assert.equal(evaluationAudit.subject.manifestSha256, DIRECT_UPSTREAMS[1][2]);
  assert.equal(evaluationAudit.disposition.evaluatorAuthorityGranted, false);
  assert.equal(evaluationAudit.disposition.scoringAuthorityGranted, false);
  assert.equal(evaluationAudit.disposition.authorizedReviewers, 0);
  assert.equal(evaluationAudit.disposition.authorizedAdjudicators, 0);
  assert.equal(evaluationAudit.disposition.eligibleAssignments, 0);

  const bindingAudit = parseSafeJson("experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1/audit.json");
  assert.equal(bindingAudit.verdict, "PASS_NO_BLOCKERS");
  assert.equal(bindingAudit.subject.manifestSha256, DIRECT_UPSTREAMS[3][2]);
  assert.equal(bindingAudit.subject.snapshotSha256, "d126aa316d8c1457d71989441a49d7ca93676687b2032a738d4ea71cd6531967");
  assert.equal(bindingAudit.subject.manifestEntries["binding.json"], "47df395f54179538d27a714ac0df4dc9e82f04b767bc82f45b8473c38d04cc3d");
  assert.equal(bindingAudit.astEvidence.uiTypeCount, 25);
  assert.equal(bindingAudit.mathEvidence.focusTypes, 2);
  assert.equal(bindingAudit.mathEvidence.nonfocusTypes, 23);
  assert.equal(bindingAudit.mathEvidence.families, 8);

  const methodology = parseSafeJson(DIRECT_UPSTREAMS[5][1]);
  assert.equal(methodology.status, "DESIGN_ONLY_UNISSUED");
  assert.equal(methodology.artifactId, "reviewer-calibration-v3-replacement-v1");
  assert.equal(methodology.grammarConstruct.equivalenceRules.singletonPointFamilyRequired, false);
  assert.equal(methodology.blankConstruct.rules.everyOptionHasAllSevenAxes, true);

  return {
    direct,
    directManifestRows: directManifestRows.reduce((sum, row) => sum + row.rowCount, 0),
    evaluationNested,
    evaluationNestedManifestRows: evaluationNestedManifests.reduce((sum, row) => sum + row.rowCount, 0),
    evaluationNestedSafeRowsRehashed: evaluationNestedManifests.reduce((sum, row) => sum + row.rehashedRows, 0),
    forbiddenPrivateRowsRefusedUnopened: evaluationNestedManifests.reduce((sum, row) => sum + row.refusedPrivateRows, 0),
    evaluationAuthorityAuditVerdict: evaluationAudit.verdict,
    bindingAuditVerdict: bindingAudit.verdict,
    bindingSnapshotSha256: bindingAudit.subject.snapshotSha256,
    methodologyStatus: methodology.status,
  };
}

function selectedAt(order, epoch, role) {
  const offset = role === "main" ? 0 : Math.ceil(order.length / 2);
  const index = (epoch - 1 + offset) % order.length;
  return { index, typeId: order[index] };
}

function recomputeMath(binding, protocol, registries) {
  assert.deepEqual(binding.canonicalUniverse.uiTypeIdsInOrder, TYPES);
  assert.deepEqual(binding.canonicalUniverse.focusTypeIds, TYPES.slice(0, 2));
  assert.deepEqual(binding.canonicalUniverse.nonfocusTypeIdsInUiOrder, TYPES.slice(2));
  assert.equal(binding.canonicalUniverse.uiTypeCount, 25);
  assert.equal(binding.canonicalUniverse.nonfocusTypeCount, 23);
  assert.deepEqual(binding.families, FAMILIES.map(([familyId, rotationOrder]) => ({ familyId, rotationOrder })));
  assert.deepEqual(protocol.typeUniverse.uiTypeIdsInOrder, TYPES);
  assert.deepEqual(protocol.typeUniverse.focusTypeIds, TYPES.slice(0, 2));
  assert.deepEqual(protocol.typeUniverse.nonfocusTypeIdsInUiOrder, TYPES.slice(2));
  assert.deepEqual(protocol.typeUniverse.families, FAMILIES.map(([familyId, rotationOrder]) => ({ familyId, rotationOrder })));

  const schedule = [];
  for (const [familyId, order] of FAMILIES) {
    for (let epoch = 1; epoch <= 4; epoch += 1) {
      const main = selectedAt(order, epoch, "main");
      const holdout = selectedAt(order, epoch, "holdout");
      assert.notEqual(main.typeId, holdout.typeId, `${familyId}/${epoch} main/holdout collision`);
      schedule.push({ familyId, epoch, mainIndex: main.index, mainTypeId: main.typeId, holdoutIndex: holdout.index, holdoutTypeId: holdout.typeId });
    }
  }
  assert.deepEqual(binding.scheduleRows, schedule);
  const epoch1 = new Set(schedule.filter((row) => row.epoch === 1).flatMap((row) => [row.mainTypeId, row.holdoutTypeId]));
  const twoEpoch = new Set(schedule.filter((row) => row.epoch <= 2).flatMap((row) => [row.mainTypeId, row.holdoutTypeId]));
  const fourMain = new Set(schedule.map((row) => row.mainTypeId));
  assert.equal(epoch1.size, 16);
  assert.equal(twoEpoch.size, 23);
  assert.equal(fourMain.size, 23);
  assert.equal(binding.rotation.contactIsCertification, false);
  assert.equal(protocol.rotation.contactIsCertification, false);

  const expectedSlots = [];
  for (const [phase, blocks] of [["TP", [["G", 4], ["B", 4], ["N", 4]]], ["MC", [["G", 8], ["B", 8], ["N", 8]]], ["AH", [["G", 8], ["B", 8], ["N", 8]]]]) {
    for (const [block, count] of blocks) for (let ordinal = 1; ordinal <= count; ordinal += 1) expectedSlots.push(`${phase}-${block}-${String(ordinal).padStart(2, "0")}`);
  }
  assert.equal(expectedSlots.length, 60);
  assert.deepEqual(registries.slotRegistry.expandedSlotIds, expectedSlots);
  return { uiTypes: 25, focusTypes: 2, nonfocusTypes: 23, families: 8, scheduleRows: 32, epoch1CombinedDistinct: 16, twoEpochCombinedContact: 23, fourEpochMainOnlyContact: 23, futureSlots: 60 };
}

function validateBase(protocol, registries, schemas, publicManifest) {
  const errors = [];
  const add = (condition, code) => { if (!condition) errors.push(code); };
  add(protocol.status === "DESIGN_ONLY_UNISSUED_EXECUTION_BLOCKED", "STATUS");
  add(protocol.artifactId === "reviewer-calibration-v4-production-bound-v2", "STATUS");
  const permanent = protocol.permanentDesignBoundary ?? {};
  for (const key of ["thisArtifactTransitions", "issued", "executionAuthorized", "evaluatorAuthorityGranted", "scoringAuthorityGranted", "generationAuthorized", "resultAccessAuthorized", "profileSelectionAuthorized", "releaseClaimAuthorized"]) add(permanent[key] === false, "PERMANENT_FALSE");
  for (const key of ["reviewerCertificatesIssued", "authorizedReviewers", "authorizedAdjudicators"]) add(permanent[key] === 0, "PERMANENT_ZERO");
  add(permanent.designOnly === true && permanent.separateImmutableExecutionPackageRequired === true && permanent.separateIndependentlyAuditedActivationEventRequired === true, "PERMANENT_GATE");

  add(protocol.upstreams?.length === DIRECT_UPSTREAMS.length, "UPSTREAM_PIN");
  for (let index = 0; index < DIRECT_UPSTREAMS.length; index += 1) add(protocol.upstreams?.[index]?.sha256 === DIRECT_UPSTREAMS[index][2], "UPSTREAM_PIN");
  add(same(protocol.typeUniverse?.uiTypeIdsInOrder, TYPES), "TYPE_UNIVERSE");
  add(same(protocol.typeUniverse?.focusTypeIds, TYPES.slice(0, 2)), "TYPE_UNIVERSE");
  add(same(protocol.typeUniverse?.nonfocusTypeIdsInUiOrder, TYPES.slice(2)), "TYPE_UNIVERSE");
  add(protocol.typeUniverse?.uiTypeCount === 25 && protocol.typeUniverse?.nonfocusTypeCount === 23 && protocol.typeUniverse?.familyCount === 8, "TYPE_UNIVERSE");
  add(same(protocol.typeUniverse?.families, FAMILIES.map(([familyId, rotationOrder]) => ({ familyId, rotationOrder }))), "FAMILY_BINDING");

  const rotation = protocol.rotation ?? {};
  for (const key of ["epochIsOneBased", "formulaRowsAndCoverageMustUseSameFunction", "oneMainAndOneHoldoutPerFamilyPerEpoch", "mainAndHoldoutMustBeDifferentWithinEpoch", "failureDoesNotAdvanceRotation", "outcomeAwareSkippingForbidden", "pilotDoesNotCountTowardCoverage"]) add(rotation[key] === true, "ROTATION");
  add(rotation.singleEpochAllTypeClaimAllowed === false && rotation.contactIsCertification === false, "ROTATION");
  add(rotation.singleEpochDistinctCanonicalTypes === 16 && rotation.mainPlusHoldoutEpochsToContactAll23 === 2 && rotation.mainOnlyEpochsToContactAll23 === 4 && rotation.scheduleRows === 32, "ROTATION");

  const expectedPhases = ["TAXONOMY_PILOT", "MAIN_CERTIFICATION", "INDEPENDENT_TRUSTED_GOLD_AUDIT", "ACTIVATION_HOLDOUT", "SEPARATE_INDEPENDENTLY_AUDITED_ACTIVATION_EVENT"];
  add(same(protocol.calibrationSequence?.exactOrder?.map((row) => row.phase), expectedPhases), "SEQUENCE");
  add(protocol.calibrationSequence?.exactOrder?.[0]?.freshItems === 12 && same(protocol.calibrationSequence.exactOrder[0].blocks, { GRAMMAR: 4, BLANK: 4, NONFOCUS: 4 }), "SEQUENCE");
  add(protocol.calibrationSequence?.exactOrder?.[1]?.freshItems === 24 && same(protocol.calibrationSequence.exactOrder[1].blocks, { GRAMMAR: 8, BLANK: 8, NONFOCUS: 8 }), "SEQUENCE");
  add(protocol.calibrationSequence?.exactOrder?.[2]?.freshItems === 0 && protocol.calibrationSequence.exactOrder[2].independent === true, "SEQUENCE");
  add(protocol.calibrationSequence?.exactOrder?.[3]?.freshItems === 24 && protocol.calibrationSequence.exactOrder[3].oneTime === true && same(protocol.calibrationSequence.exactOrder[3].blocks, { GRAMMAR: 8, BLANK: 8, NONFOCUS: 8 }), "SEQUENCE");
  add(protocol.calibrationSequence?.exactOrder?.[4]?.freshItems === 0 && protocol.calibrationSequence.exactOrder[4].independent === true && protocol.calibrationSequence.exactOrder[4].containedInThisArtifact === false, "SEQUENCE");
  add(protocol.calibrationSequence?.totalFutureItemSlots === 60 && protocol.calibrationSequence?.currentFilledItemSlots === 0, "SEQUENCE");
  for (const key of ["phaseOverlapAllowed", "phaseSkipOrReorderAllowed", "taxonomyRevisionAfterLaterPacketOpenAllowed", "thresholdRelaxationAfterOpeningAllowed", "retroactivePassAllowed", "failedItemReplayAllowed", "replacementOrBackfillIntoOpenedPacketAllowed"]) add(protocol.calibrationSequence?.[key] === false, "SEQUENCE_FAIL_CLOSED");
  add(protocol.calibrationSequence?.pairwiseDisjointByNormalizedTextWindowTopicScenarioAuthorAndSurfaceFingerprint === true, "SEQUENCE_DISJOINT_CLAIM");

  add(protocol.roles?.requiredForSeparateActivation?.distinctCertificationReviewers === 2, "ROLE_REQUIREMENTS");
  add(protocol.roles?.requiredForSeparateActivation?.freshAdjudicators === 1 && protocol.roles.requiredForSeparateActivation.independentTrustedGoldAuditors === 1 && protocol.roles.requiredForSeparateActivation.independentActivationAuditors === 1, "ROLE_REQUIREMENTS");
  add(protocol.roles?.currentAssignedActors === 0 && protocol.roles?.reviewersMustBeDistinct === true && protocol.roles?.sameActorAcrossIncompatibleRolesAllowed === false, "ROLE_REQUIREMENTS");
  add(same(protocol.roles?.trustedGoldAuditorIncompatibleWith, TRUSTED_AUDITOR_INCOMPATIBLE), "ROLE_REQUIREMENTS");

  const access = protocol.accessControl ?? {};
  add(access.currentState === STATES[0] && same(access.stateOrder, STATES), "ACCESS_STATE");
  add(access.eventOrder === "AUTHORIZATION_SEALED_BEFORE_OPEN_THEN_CLOSE_RECEIPT" && access.authorizationMustPrecedeOpenInHashChain === true, "ACCESS_ORDER");
  add(access.timestampRule === "authorizedAtRfc3339 < openedAtRfc3339 <= closedAtRfc3339", "ACCESS_ORDER");
  for (const key of ["capabilitySingleUse", "capabilityExpiresAtPhaseClose", "everyDeniedAttemptAppendOnlyRecorded"]) add(access[key] === true, "ACCESS_CAPABILITY");
  for (const key of ["lateOrBackfilledAuthorizationAllowed", "retroactiveEventInsertionAllowed", "eventDeletionOrRewriteAllowed", "denyEventHasOpenReceipt"]) add(access[key] === false, "ACCESS_FAIL_CLOSED");
  add(access.currentAccessEvents === 0, "ACCESS_ZERO");
  for (const state of STATES) add(Array.isArray(access.denySets?.[state]) && access.denySets[state].length > 0, "DENY_SET");
  add(same(Object.keys(access.denySets ?? {}), STATES), "DENY_SET");

  add(protocol.hiddenCommitments?.sealedBeforePacketIssue === true && protocol.hiddenCommitments?.separateFromVisibleSurface === true, "HIDDEN_GATE");
  add(same(protocol.hiddenCommitments?.requiredPerSlotBindings, HIDDEN_BINDINGS), "HIDDEN_BINDINGS");
  add(same(protocol.hiddenCommitments?.hiddenFromPhase1Classes, HIDDEN_CLASSES), "HIDDEN_CLASSES");
  add(protocol.hiddenCommitments?.visibleSurfaceRequiresPreAccessCapability === true && protocol.hiddenCommitments?.hiddenRevealRequiresOwnResponseSealAndNewBoundCapability === true && protocol.hiddenCommitments?.rejectionHistoryNeverVisibleToRaters === true, "HIDDEN_GATE");
  add(same(protocol.requiredPhaseSeals, PHASE_SEALS), "PHASE_SEALS");
  add(protocol.activation?.containedInThisArtifact === false && protocol.activation?.currentActivationEvents === 0 && protocol.activation?.separateIndependentAuditRequired === true && protocol.activation?.requiredAuditVerdict === "PASS_NO_BLOCKERS" && protocol.activation?.retroactiveActivationAllowed === false && protocol.activation?.thisDesignMayBeEditedIntoActivation === false, "ACTIVATION_GATE");
  add(Object.values(protocol.claims ?? {}).every((value) => value === "NONE"), "CLAIMS_NONE");
  add(Object.values(protocol.emptyOperationalState ?? {}).every((value) => value === 0), "OPERATIONAL_ZERO");
  add(Object.values(protocol.activity ?? {}).every((value) => value === 0), "ACTIVITY_ZERO");
  add(Object.values(protocol.publicOnlyBoundary?.activity ?? {}).every((value) => value === 0), "ACTIVITY_ZERO");

  add(registries.slotRegistry?.totalFutureSlots === 60 && registries.slotRegistry?.expandedSlotIds?.length === 60, "SLOT_COUNT");
  add(registries.slotRegistry?.filledSlots === 0 && registries.slotRegistry?.eligibleSlots === 0 && registries.slotRegistry?.issuedSlots === 0 && registries.slotRegistry?.slotPayloads?.length === 0, "REGISTRY_ZERO");
  add(registries.roleRegistry?.assignedActorCount === 0 && registries.roleRegistry?.saltedPseudonymCount === 0 && registries.roleRegistry?.incompatibilityProofs?.length === 0 && registries.roleRegistry?.ready === false, "REGISTRY_ZERO");
  for (const group of [registries.phaseEvidenceRegistries, registries.accessRegistries, registries.contentCommitmentRegistries]) for (const value of Object.values(group ?? {})) add(Array.isArray(value) && value.length === 0, "REGISTRY_ZERO");
  for (const key of ["contactEvents", "passedFreshCoverageEvents"]) add(Array.isArray(registries.coverageRegistry?.[key]) && registries.coverageRegistry[key].length === 0, "REGISTRY_ZERO");
  add(registries.coverageRegistry?.contactCount === 0 && registries.coverageRegistry?.certifiedCanonicalTypeCount === 0 && registries.coverageRegistry?.contactIsCertification === false && registries.coverageRegistry?.singleEpochAllTypeClaimAllowed === false, "REGISTRY_ZERO");
  for (const [key, value] of Object.entries(registries.operationalState ?? {})) add(typeof value === "string" ? value === "PRE_ACCESS_UNAUTHORIZED" : (typeof value === "boolean" ? value === false : value === 0), "REGISTRY_ZERO");
  add(Object.values(schemas["x-currentInstanceCounts"] ?? {}).every((value) => value === 0), "SCHEMA_ZERO");
  add(publicManifest.authority?.designOnly === true && publicManifest.authority?.issued === false && publicManifest.authority?.executionAuthorized === false && publicManifest.authority?.evaluatorAuthorityGranted === false && publicManifest.authority?.scoringAuthorityGranted === false, "PUBLIC_AUTHORITY_ZERO");
  add(Object.values(publicManifest.activity ?? {}).every((value) => value === 0), "PUBLIC_ACTIVITY_ZERO");
  return [...new Set(errors)];
}

function buildMutations(base) {
  const rows = [];
  const add = (id, expectedCode, mutate) => {
    const docs = { protocol: clone(base.protocol), registries: clone(base.registries), schemas: clone(base.schemas), publicManifest: clone(base.publicManifest) };
    mutate(docs);
    const errors = validateBase(docs.protocol, docs.registries, docs.schemas, docs.publicManifest);
    rows.push({ id, expectedCode, detected: errors.includes(expectedCode), observedCodes: errors });
  };

  for (const key of ["thisArtifactTransitions", "issued", "executionAuthorized", "evaluatorAuthorityGranted", "scoringAuthorityGranted", "generationAuthorized", "resultAccessAuthorized", "profileSelectionAuthorized", "releaseClaimAuthorized"]) add(`permanent-false-${key}`, "PERMANENT_FALSE", ({ protocol }) => { protocol.permanentDesignBoundary[key] = true; });
  for (const key of ["reviewerCertificatesIssued", "authorizedReviewers", "authorizedAdjudicators"]) add(`permanent-zero-${key}`, "PERMANENT_ZERO", ({ protocol }) => { protocol.permanentDesignBoundary[key] = 1; });
  for (let index = 0; index < DIRECT_UPSTREAMS.length; index += 1) add(`upstream-pin-${index}`, "UPSTREAM_PIN", ({ protocol }) => { protocol.upstreams[index].sha256 = "f".repeat(64); });
  for (let index = 0; index < TYPES.length; index += 1) add(`ui-type-${index}`, "TYPE_UNIVERSE", ({ protocol }) => { protocol.typeUniverse.uiTypeIdsInOrder[index] = `MUTATED_${index}`; });
  for (let familyIndex = 0; familyIndex < FAMILIES.length; familyIndex += 1) for (let typeIndex = 0; typeIndex < FAMILIES[familyIndex][1].length; typeIndex += 1) add(`family-${familyIndex}-type-${typeIndex}`, "FAMILY_BINDING", ({ protocol }) => { protocol.typeUniverse.families[familyIndex].rotationOrder[typeIndex] = `MUTATED_${familyIndex}_${typeIndex}`; });
  for (const key of ["epochIsOneBased", "formulaRowsAndCoverageMustUseSameFunction", "oneMainAndOneHoldoutPerFamilyPerEpoch", "mainAndHoldoutMustBeDifferentWithinEpoch", "failureDoesNotAdvanceRotation", "outcomeAwareSkippingForbidden", "pilotDoesNotCountTowardCoverage"]) add(`rotation-true-${key}`, "ROTATION", ({ protocol }) => { protocol.rotation[key] = false; });
  for (const key of ["singleEpochAllTypeClaimAllowed", "contactIsCertification"]) add(`rotation-false-${key}`, "ROTATION", ({ protocol }) => { protocol.rotation[key] = true; });
  for (const [index, expected] of [[0, 12], [1, 24], [2, 0], [3, 24], [4, 0]]) add(`sequence-fresh-${index}`, "SEQUENCE", ({ protocol }) => { protocol.calibrationSequence.exactOrder[index].freshItems = expected + 1; });
  for (const key of ["phaseOverlapAllowed", "phaseSkipOrReorderAllowed", "taxonomyRevisionAfterLaterPacketOpenAllowed", "thresholdRelaxationAfterOpeningAllowed", "retroactivePassAllowed", "failedItemReplayAllowed", "replacementOrBackfillIntoOpenedPacketAllowed"]) add(`sequence-failclosed-${key}`, "SEQUENCE_FAIL_CLOSED", ({ protocol }) => { protocol.calibrationSequence[key] = true; });
  for (const state of STATES) {
    add(`deny-delete-${state}`, "DENY_SET", ({ protocol }) => { delete protocol.accessControl.denySets[state]; });
    add(`deny-empty-${state}`, "DENY_SET", ({ protocol }) => { protocol.accessControl.denySets[state] = []; });
  }
  for (const seal of PHASE_SEALS) add(`seal-remove-${seal}`, "PHASE_SEALS", ({ protocol }) => { protocol.requiredPhaseSeals = protocol.requiredPhaseSeals.filter((value) => value !== seal); });
  for (const binding of HIDDEN_BINDINGS) add(`hidden-binding-remove-${binding}`, "HIDDEN_BINDINGS", ({ protocol }) => { protocol.hiddenCommitments.requiredPerSlotBindings = protocol.hiddenCommitments.requiredPerSlotBindings.filter((value) => value !== binding); });
  for (const hidden of HIDDEN_CLASSES) add(`hidden-class-remove-${hidden}`, "HIDDEN_CLASSES", ({ protocol }) => { protocol.hiddenCommitments.hiddenFromPhase1Classes = protocol.hiddenCommitments.hiddenFromPhase1Classes.filter((value) => value !== hidden); });
  for (const role of TRUSTED_AUDITOR_INCOMPATIBLE) add(`trusted-auditor-remove-${role}`, "ROLE_REQUIREMENTS", ({ protocol }) => { protocol.roles.trustedGoldAuditorIncompatibleWith = protocol.roles.trustedGoldAuditorIncompatibleWith.filter((value) => value !== role); });
  for (const key of ["capabilitySingleUse", "capabilityExpiresAtPhaseClose", "everyDeniedAttemptAppendOnlyRecorded"]) add(`access-true-${key}`, "ACCESS_CAPABILITY", ({ protocol }) => { protocol.accessControl[key] = false; });
  for (const key of ["lateOrBackfilledAuthorizationAllowed", "retroactiveEventInsertionAllowed", "eventDeletionOrRewriteAllowed", "denyEventHasOpenReceipt"]) add(`access-false-${key}`, "ACCESS_FAIL_CLOSED", ({ protocol }) => { protocol.accessControl[key] = true; });
  for (const key of Object.keys(base.protocol.emptyOperationalState)) add(`operational-zero-${key}`, "OPERATIONAL_ZERO", ({ protocol }) => { protocol.emptyOperationalState[key] = 1; });
  for (const key of Object.keys(base.protocol.activity)) add(`activity-zero-${key}`, "ACTIVITY_ZERO", ({ protocol }) => { protocol.activity[key] = 1; });
  for (const key of Object.keys(base.protocol.publicOnlyBoundary.activity)) add(`public-boundary-activity-zero-${key}`, "ACTIVITY_ZERO", ({ protocol }) => { protocol.publicOnlyBoundary.activity[key] = 1; });
  for (const key of Object.keys(base.protocol.claims)) add(`claim-${key}`, "CLAIMS_NONE", ({ protocol }) => { protocol.claims[key] = "CLAIMED"; });
  for (const [groupName, group] of [["phase", base.registries.phaseEvidenceRegistries], ["access", base.registries.accessRegistries], ["content", base.registries.contentCommitmentRegistries]]) for (const key of Object.keys(group)) add(`registry-${groupName}-${key}`, "REGISTRY_ZERO", ({ registries }) => { const target = groupName === "phase" ? registries.phaseEvidenceRegistries : groupName === "access" ? registries.accessRegistries : registries.contentCommitmentRegistries; target[key].push({ synthetic: true }); });
  for (const key of ["contactEvents", "passedFreshCoverageEvents"]) add(`registry-coverage-${key}`, "REGISTRY_ZERO", ({ registries }) => { registries.coverageRegistry[key].push({ synthetic: true }); });
  for (const key of Object.keys(base.schemas["x-currentInstanceCounts"])) add(`schema-instance-${key}`, "SCHEMA_ZERO", ({ schemas }) => { schemas["x-currentInstanceCounts"][key] = 1; });
  for (const key of Object.keys(base.publicManifest.activity)) add(`public-manifest-activity-${key}`, "PUBLIC_ACTIVITY_ZERO", ({ publicManifest }) => { publicManifest.activity[key] = 1; });
  return rows;
}

function validateClaimedAccess(authorization, receipt) {
  const errors = [];
  if (authorization.eventKind !== "AUTHORIZATION" || authorization.decision !== "ALLOW") errors.push("PRIOR_ALLOW");
  if (receipt.eventKind !== "ACCESS_RECEIPT" || receipt.decision !== "ALLOW") errors.push("RECEIPT");
  if (!(authorization.eventOrdinal < receipt.eventOrdinal)) errors.push("CHAIN_ORDER");
  if (receipt.authorizationEventSha256 !== authorization.eventSha256) errors.push("AUTHORIZATION_HASH");
  for (const key of ["actorPseudonym", "actorRole", "phase", "resourceSha256", "visibleSurfaceSha256", "capabilityTokenSha256", "denySetSha256"]) if (authorization[key] !== receipt[key]) errors.push(`BIND_${key}`);
  const times = [receipt.authorizedAtRfc3339, receipt.openedAtRfc3339, receipt.closedAtRfc3339].map(Date.parse);
  if (!times.every(Number.isFinite) || !(times[0] < times[1] && times[1] <= times[2])) errors.push("CLAIMED_TIME_ORDER");
  return errors;
}

function buildAccessScenarios(schemas) {
  const authorization = {
    eventKind: "AUTHORIZATION", decision: "ALLOW", eventOrdinal: 10, eventSha256: "a".repeat(64),
    actorPseudonym: "reviewer-pseudonym-0001", actorRole: "MAIN_CERTIFICATION_RATER",
    phase: "MAIN_CERTIFICATION_PHASE1", resourceSha256: "b".repeat(64), visibleSurfaceSha256: "c".repeat(64),
    capabilityTokenSha256: "d".repeat(64), denySetSha256: "e".repeat(64),
  };
  const receipt = {
    ...authorization, eventKind: "ACCESS_RECEIPT", decision: "ALLOW", eventOrdinal: 11, eventSha256: "f".repeat(64),
    authorizationEventSha256: authorization.eventSha256, authorizedAtRfc3339: "2026-07-16T00:00:00.000Z",
    openedAtRfc3339: "2026-07-16T00:00:00.001Z", closedAtRfc3339: "2026-07-16T00:00:00.002Z",
  };
  const rows = [{ id: "valid-claimed-pair", expected: "ACCEPT", observed: validateClaimedAccess(authorization, receipt).length === 0 ? "ACCEPT" : "REJECT" }];
  for (const key of ["actorPseudonym", "actorRole", "phase", "resourceSha256", "visibleSurfaceSha256", "capabilityTokenSha256", "denySetSha256"]) {
    const errors = validateClaimedAccess(authorization, { ...receipt, [key]: `${receipt[key]}-mutated` });
    rows.push({ id: `reject-mismatch-${key}`, expected: "REJECT", observed: errors.includes(`BIND_${key}`) ? "REJECT" : "ACCEPT" });
  }
  for (const [id, authPatch, receiptPatch, expectedCode] of [
    ["reject-auth-hash", {}, { authorizationEventSha256: "0".repeat(64) }, "AUTHORIZATION_HASH"],
    ["reject-reversed-ordinal", { eventOrdinal: 12 }, {}, "CHAIN_ORDER"],
    ["reject-equal-auth-open", {}, { authorizedAtRfc3339: receipt.openedAtRfc3339 }, "CLAIMED_TIME_ORDER"],
    ["reject-open-after-close", {}, { openedAtRfc3339: "2026-07-16T00:00:00.003Z" }, "CLAIMED_TIME_ORDER"],
    ["reject-invalid-time", {}, { openedAtRfc3339: "not-a-time" }, "CLAIMED_TIME_ORDER"],
    ["reject-nonallow-auth", { decision: "DENY" }, {}, "PRIOR_ALLOW"],
    ["reject-nonreceipt", {}, { eventKind: "DENIAL" }, "RECEIPT"],
  ]) {
    const errors = validateClaimedAccess({ ...authorization, ...authPatch }, { ...receipt, ...receiptPatch });
    rows.push({ id, expected: "REJECT", observed: errors.includes(expectedCode) ? "REJECT" : "ACCEPT" });
  }

  const defs = schemas.$defs;
  const authProperties = defs.capabilityAuthorization.allOf[1].properties;
  const receiptProperties = defs.accessReceipt.allOf[1].properties;
  const eventKinds = schemas.oneOf.map((row) => row.$ref.split("/").at(-1));
  rows.push({ id: "bypass-phase1-answer-as-opaque-resource", expected: "BLOCKED_BY_DESIGN", observed: authProperties.resourceClass === undefined && authProperties.state === undefined && authProperties.phaseAllowlistProofSha256 === undefined ? "NOT_BLOCKED" : "BLOCKED_BY_DESIGN" });
  rows.push({ id: "bypass-arbitrary-deny-set-hash", expected: "BLOCKED_BY_DESIGN", observed: authProperties.denySetSha256?.const === undefined ? "NOT_BLOCKED" : "BLOCKED_BY_DESIGN" });
  rows.push({ id: "bypass-backdated-actual-open-no-open-event", expected: "BLOCKED_BY_DESIGN", observed: eventKinds.includes("accessOpen") || eventKinds.includes("capabilityOpen") ? "BLOCKED_BY_DESIGN" : "NOT_BLOCKED" });
  rows.push({ id: "bypass-capability-second-receipt", expected: "BLOCKED_BY_DESIGN", observed: receiptProperties.capabilityConsumptionOrdinal !== undefined || eventKinds.includes("capabilityConsumption") ? "BLOCKED_BY_DESIGN" : "NOT_BLOCKED" });
  rows.push({ id: "bypass-capability-second-authorization", expected: "BLOCKED_BY_DESIGN", observed: authProperties.capabilityUseIndex !== undefined ? "BLOCKED_BY_DESIGN" : "NOT_BLOCKED" });
  rows.push({ id: "bypass-denial-without-state-deny-set-binding", expected: "BLOCKED_BY_DESIGN", observed: defs.denialEvent.allOf[1].properties.denySetSha256 !== undefined && defs.denialEvent.allOf[1].properties.state !== undefined ? "BLOCKED_BY_DESIGN" : "NOT_BLOCKED" });
  return rows;
}

function findBlockers(protocol, registries, schemas, readme, protocolMarkdown) {
  const roleEnum = schemas.$defs.role.enum;
  const rolePairs = new Set(protocol.roles.roleIncompatibilities.map((pair) => [...pair].sort().join("|")));
  const certificateProperties = schemas.$defs.reviewerCertificate.allOf[1].properties;
  const activationProperties = schemas.$defs.separateActivationEvent.allOf[1].properties;
  const materialization = schemas.$defs.slotMaterialization.allOf[1];
  const authorizationProperties = schemas.$defs.capabilityAuthorization.allOf[1].properties;
  const eventKinds = schemas.oneOf.map((row) => row.$ref.split("/").at(-1));
  const blockers = [];
  const push = (code, title, evidence, consequence) => blockers.push({ code, severity: "BLOCKER", title, evidence, consequence });

  const authorRolesAbsent = !roleEnum.includes("ITEM_AUTHOR") && !roleEnum.includes("TRUSTED_GOLD_AUTHOR") && !roleEnum.includes("GOLD_AUTHOR");
  const trustedAuthorIncompatAbsent = !protocol.roles.trustedGoldAuditorIncompatibleWith.includes("ANY_PHASE_ITEM_AUTHOR") && !protocol.roles.trustedGoldAuditorIncompatibleWith.includes("TRUSTED_GOLD_AUTHOR") && !protocol.roles.trustedGoldAuditorIncompatibleWith.includes("ANY_GOLD_AUTHOR");
  if (authorRolesAbsent && trustedAuthorIncompatAbsent) push(
    "B1_TRUSTED_GOLD_SELF_AUDIT_NOT_EXCLUDED",
    "Trusted-gold independence does not cover item or gold authorship",
    "protocol.json roles names ANY_PACKET_AUTHOR only; event-schemas.json role enum has PACKET_AUTHOR but no ITEM_AUTHOR or GOLD_AUTHOR; no normative definition makes packet author a superset of item/gold author.",
    "A trusted-gold auditor can author an item or its gold without violating any materialized role incompatibility, then audit their own work.",
  );

  const activationAuditorRequiredPairs = ["ANY_PACKET_AUTHOR", "ANY_PHASE_ITEM_AUTHOR", "TRUSTED_GOLD_AUTHOR", "CERTIFICATION_REVIEWER_1", "CERTIFICATION_REVIEWER_2", "TRUSTED_GOLD_AUDITOR", "S1_RESULT_CUSTODIAN"];
  const activationAuditorMissing = activationAuditorRequiredPairs.filter((role) => !rolePairs.has(["INDEPENDENT_ACTIVATION_AUDITOR", role].sort().join("|")));
  if (activationAuditorMissing.length > 0) push(
    "B2_ACTIVATION_AUDITOR_SELF_REVIEW_NOT_EXCLUDED",
    "Independent activation auditor is compatible with authors, reviewers, gold auditor, and custodian",
    `protocol.json roleIncompatibilities omits INDEPENDENT_ACTIVATION_AUDITOR collisions with: ${activationAuditorMissing.join(", ")}.`,
    "The actor who authored packets/gold, earned a certificate, performed the trusted-gold audit, or held S1 results can also issue the activation PASS audit.",
  );

  const coverageMissing = certificateProperties.coveredCanonicalTypeIds === undefined && certificateProperties.passedCoverageEventSha256s === undefined && activationProperties.coverageMapSha256 === undefined && activationProperties.passedCoverageEventSha256s === undefined;
  if (coverageMissing) push(
    "B3_EXACT_TYPE_COVERAGE_NOT_BOUND_TO_CERTIFICATE_OR_ACTIVATION",
    "Exact canonical coverage is prose-only at certification and activation",
    "reviewerCertificate has only a generic scope const and phase decision hashes; separateActivationEvent binds no canonical type list, coverage map/count, or passed coverage-event hashes while epoch 1 contacts only 16 of 23 nonfocus types.",
    "Two certificates and one holdout decision can be presented as global 25-type authority without proving fresh passed coverage for each claimed canonical type; contact is declared non-certifying but no gate consumes the coverage registry.",
  );

  const circularAudit = activationProperties.independentActivationAuditManifestSha256 !== undefined && activationProperties.independentActivationAuditVerdict?.const === "PASS_NO_BLOCKERS" && /followed by a separate independent/u.test(readme) && /event itself requires a separate independent/u.test(protocolMarkdown);
  if (circularAudit) push(
    "B4_ACTIVATION_AUDIT_DEPENDENCY_IS_CIRCULAR",
    "Activation event requires the hash and verdict of the audit that must audit that event",
    "README/PROTOCOL order the immutable activation event before its independent audit, but event-schemas.json requires independentActivationAuditManifestSha256 and PASS_NO_BLOCKERS inside the activation event.",
    "A post-event audit cannot be hashed into the already immutable event it audits; a pre-event audit cannot attest the exact later event. The required transition is not constructible without circular or anticipatory evidence.",
  );

  const materializationRequired = new Set(materialization.required);
  const materializationProperties = materialization.properties;
  const missingCommitments = ["explanationEvidenceCommitmentSha256", "authorHypothesisCommitmentSha256", "rotationEpoch"].filter((name) => !materializationRequired.has(name) || materializationProperties[name] === undefined);
  const exactTypeUnbound = materializationProperties.typeId?.enum === undefined || materializationProperties.familyId?.enum === undefined;
  if (missingCommitments.length > 0 || exactTypeUnbound) push(
    "B5_SLOT_MATERIALIZATION_CANNOT_BIND_REQUIRED_HIDDEN_AND_TYPE_EVIDENCE",
    "Slot schema omits required hidden commitments and exact production binding",
    `slotMaterialization omits ${missingCommitments.join(", ")}; typeId is any string and familyId only a prefix pattern. unevaluatedProperties=false prevents supplying omitted commitments.`,
    "A future slot can materialize without presealed explanation/author-hypothesis/epoch evidence or with an alias/wrong type-family pair, defeating hidden-commitment and rotation claims.",
  );

  const disjointnessMissing = materializationProperties.disjointnessProofSha256 === undefined && materializationProperties.normalizedTextWindowFingerprintSha256 === undefined && materializationProperties.topicScenarioAuthorFingerprintSha256 === undefined;
  if (disjointnessMissing) push(
    "B6_FRESH_DISJOINT_NO_REPLAY_SEQUENCE_HAS_NO_MATERIAL_PROOF",
    "Pilot/main/holdout disjointness and replay prohibition are not materialized",
    "calibrationSequence asserts normalized text-window/topic/scenario/author/surface disjointness, but slotMaterialization and activation bind no disjointness proof or normalized fingerprints.",
    "Pilot items or near-duplicate failed items can be replayed/backfilled into main or holdout under new opaque hashes without a verifiable violation.",
  );

  const policyUnbound = authorizationProperties.resourceClass === undefined && authorizationProperties.state === undefined && authorizationProperties.phaseAllowlistProofSha256 === undefined;
  if (policyUnbound) push(
    "B7_ACCESS_AUTHORIZATION_DOES_NOT_BIND_RESOURCE_CLASS_OR_CURRENT_STATE",
    "Opaque resource hashes cannot enforce phase allowlists or deny sets",
    "capabilityAuthorization binds phase and arbitrary resource/visible-surface/deny-set hashes but no current state, resource class, policy digest, or allowlist proof; denialEvent also lacks state and denySetSha256.",
    "An ANSWER_KEY or trusted-gold resource can be labeled by an opaque hash and authorized in phase 1 while satisfying the event shape, so hidden-surface leakage is not fail-closed.",
  );

  const noOpenEvent = !eventKinds.includes("accessOpen") && !eventKinds.includes("capabilityOpen");
  const noConsumption = authorizationProperties.capabilityUseIndex === undefined && schemas.$defs.accessReceipt.allOf[1].properties.capabilityConsumptionOrdinal === undefined && !eventKinds.includes("capabilityConsumption");
  if (noOpenEvent || noConsumption) push(
    "B8_PREOPEN_AND_SINGLE_USE_CAPABILITY_CLAIMS_LACK_CHAIN_EVIDENCE",
    "No sealed OPEN/consumption event proves preauthorization or single use",
    "The chain contains AUTHORIZATION and an after-close ACCESS_RECEIPT only. openedAt is self-reported in the receipt, and no capability consumption index/registry constraint prevents a second authorization or receipt.",
    "An access can occur before a backdated ALLOW is sealed, or the same capability can be reused, while each authorization/receipt pair independently satisfies the declared fields.",
  );

  assert.equal(registries.coverageRegistry.contactIsCertification, false);
  return blockers;
}

function verifyAuditPackage(summary) {
  const auditDirectory = path.join(ROOT, ...AUDIT_REL.split("/"));
  const actual = readdirSync(auditDirectory, { withFileTypes: true });
  assert(actual.every((entry) => entry.isFile() && !entry.isSymbolicLink()), "audit package contains a non-file or symlink");
  assert.deepEqual(actual.map((entry) => entry.name).sort(), ["MANIFEST.sha256", "REPORT.md", "audit.json", "hostile-evidence.json", "independent-verify.mjs"].sort(), "audit exact file set drift");
  const manifest = verifyManifest(`${AUDIT_REL}/MANIFEST.sha256`);
  assert.equal(manifest.rowCount, 4);
  assert.equal(manifest.refusedPrivateRows, 0);
  assert.deepEqual(manifest.rows.map((row) => row.path).sort(), ["REPORT.md", "audit.json", "hostile-evidence.json", "independent-verify.mjs"].sort());
  const audit = parseSafeJson(`${AUDIT_REL}/audit.json`);
  const evidence = parseSafeJson(`${AUDIT_REL}/hostile-evidence.json`);
  assert.equal(audit.verdict, "FAIL_BLOCKERS");
  assert.deepEqual(audit.blockers.map((row) => row.code), summary.blockers.map((row) => row.code));
  assert.equal(audit.subject.manifestSha256, SUBJECT_HASHES["MANIFEST.sha256"]);
  assert.equal(audit.subject.publicManifestSha256, SUBJECT_HASHES["public-manifest.json"]);
  assert.equal(audit.hostileAudit.totalCases, summary.hostileAudit.totalCases);
  assert.equal(audit.hostileAudit.caseDigestSha256, summary.hostileAudit.caseDigestSha256);
  assert.equal(evidence.totalCases, summary.hostileAudit.totalCases);
  assert.equal(evidence.caseDigestSha256, summary.hostileAudit.caseDigestSha256);
  assert(Object.values(audit.activity).every((value) => value === 0));
  return { manifestSha256: manifest.manifestSha256, rows: manifest.rowCount };
}

const startHashes = subjectHashes();
const protocol = parseSafeJson(`${SUBJECT_REL}/protocol.json`);
const registries = parseSafeJson(`${SUBJECT_REL}/registries.json`);
const schemas = parseSafeJson(`${SUBJECT_REL}/event-schemas.json`);
const publicManifest = parseSafeJson(`${SUBJECT_REL}/public-manifest.json`);
const readme = readSafe(`${SUBJECT_REL}/README.md`).toString("utf8");
const protocolMarkdown = readSafe(`${SUBJECT_REL}/PROTOCOL.md`).toString("utf8");

const subjectManifest = verifyManifest(`${SUBJECT_REL}/MANIFEST.sha256`);
assert.equal(subjectManifest.rowCount, 8);
assert.equal(subjectManifest.refusedPrivateRows, 0);
assert.deepEqual(subjectManifest.rows.map((row) => row.path).sort(), Object.keys(SUBJECT_HASHES).filter((name) => name !== "MANIFEST.sha256").sort());
assert.equal(publicManifest.packageFiles.length, 7);
for (const row of publicManifest.packageFiles) {
  assert.equal(sha256(readSafe(`${SUBJECT_REL}/${row.path}`)), row.sha256, `subject public package row drift: ${row.path}`);
  assert.equal(statSync(absoluteFor(`${SUBJECT_REL}/${row.path}`)).size, row.bytes, `subject public package byte count drift: ${row.path}`);
}

const lineage = assertDirectAndNestedLineage(publicManifest);
const binding = parseSafeJson("experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/binding.json");
const math = recomputeMath(binding, protocol, registries);
const baseErrors = validateBase(protocol, registries, schemas, publicManifest);
assert.deepEqual(baseErrors, [], `base zero-authority contract drift: ${baseErrors.join(", ")}`);

const mutations = buildMutations({ protocol, registries, schemas, publicManifest });
const undetectedMutations = mutations.filter((row) => !row.detected);
assert.equal(undetectedMutations.length, 0, `independent mutation detection failures: ${undetectedMutations.map((row) => row.id).join(", ")}`);
const accessScenarios = buildAccessScenarios(schemas);
const ordinaryAccessFailures = accessScenarios.filter((row) => row.expected !== "BLOCKED_BY_DESIGN" && row.expected !== row.observed);
assert.equal(ordinaryAccessFailures.length, 0, `ordinary access scenario failures: ${ordinaryAccessFailures.map((row) => row.id).join(", ")}`);
const structuralBypasses = accessScenarios.filter((row) => row.expected === "BLOCKED_BY_DESIGN" && row.observed === "NOT_BLOCKED");
const blockers = findBlockers(protocol, registries, schemas, readme, protocolMarkdown);
assert.equal(blockers.length, 8, `expected eight independently established blockers, observed ${blockers.length}`);
const cases = [...mutations.map((row) => ({ kind: "MUTATION", ...row })), ...accessScenarios.map((row) => ({ kind: "ACCESS_SCENARIO", ...row }))];
assert(cases.length >= 150, `hostile case floor not met: ${cases.length}`);
const caseDigestSha256 = sha256(Buffer.from(JSON.stringify(cases), "utf8"));

const summary = {
  schemaVersion: "reviewer-calibration-v4-production-bound-v2-independent-verification-1",
  verdict: "FAIL_BLOCKERS",
  subject: { path: SUBJECT_REL, fileCount: Object.keys(startHashes).length, manifestSha256: startHashes["MANIFEST.sha256"], publicManifestSha256: startHashes["public-manifest.json"], exactFileHashes: startHashes },
  lineage,
  math,
  zeroAuthority: {
    futureSlots: 60, filledSlots: 0, eligibleSlots: 0, actorAssignments: 0, accessEvents: 0,
    itemPayloads: 0, answerPayloads: 0, goldPayloads: 0, certificates: 0, activationEvents: 0,
    evaluatorAuthorityGranted: false, scoringAuthorityGranted: false, executionAuthorized: false,
  },
  hostileAudit: {
    independentMutations: mutations.length,
    detectedMutations: mutations.length - undetectedMutations.length,
    accessScenarios: accessScenarios.length,
    structuralBypasses: structuralBypasses.length,
    totalCases: cases.length,
    caseDigestSha256,
  },
  blockers,
  independence: {
    subjectVerifierExecutedOrImported: false,
    subjectVerifierSourceInspectedAsUntrusted: true,
    subjectHostileFixtureInspectedAsUntrusted: true,
    subjectHostileFixtureParsedByIndependentVerifier: false,
    subjectMutationGeneratorReused: false,
    forbiddenPrivateRowsOpened: 0,
    networkCalls: 0,
    apiCalls: 0,
    modelCalls: 0,
    databaseCalls: 0,
    secretReads: 0,
    ledgerReadsOrWrites: 0,
    questionGeneration: 0,
    subjectWrites: 0,
  },
};

if (!SUBJECT_ONLY) summary.auditPackage = verifyAuditPackage(summary);
const endHashes = subjectHashes();
assert.deepEqual(endHashes, startHashes, "subject changed during audit verification");
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
