import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const base = dirname(fileURLToPath(import.meta.url));
const designRoot = resolve(base, "..");
const protocolPath = join(base, "protocol.json");
const registriesPath = join(base, "registries.json");
const schemasPath = join(base, "event-schemas.json");
const hostilePath = join(base, "hostile-fixtures.json");
const readmePath = join(base, "README.md");
const manifestPath = join(base, "MANIFEST.sha256");

const protocol = JSON.parse(readFileSync(protocolPath, "utf8"));
const registries = JSON.parse(readFileSync(registriesPath, "utf8"));
const schemas = JSON.parse(readFileSync(schemasPath, "utf8"));
const hostile = JSON.parse(readFileSync(hostilePath, "utf8"));
const checks = [];

function check(name, condition, detail = undefined) {
  checks.push({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
}

function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}

function setEq(name, actual, expected) {
  eq(name, [...new Set(actual)].sort(), [...new Set(expected)].sort());
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function semanticSha(value) {
  return sha256Bytes(JSON.stringify(value));
}

function clone(value) {
  return structuredClone(value);
}

function parseManifest(path) {
  const rows = new Map();
  for (const line of readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Invalid manifest line: ${line}`);
    rows.set(match[2], match[1]);
  }
  return rows;
}

function runNode(path, args = []) {
  return spawnSync(process.execPath, [path, ...args], { encoding: "utf8", cwd: designRoot });
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function expandSlots(specs, candidate) {
  return specs.flatMap((spec) =>
    Array.from({ length: spec.count }, (_, zeroIndex) => {
      const ordinal = zeroIndex + 1;
      const row = {
        slotId: `${spec.prefix}-${String(ordinal).padStart(candidate ? 3 : 2, "0")}`,
        stage: spec.stage,
        block: spec.block,
        ordinal,
        typeId: spec.typeCycle[zeroIndex % spec.typeCycle.length],
        familyId: spec.familyCycle[zeroIndex % spec.familyCycle.length]
      };
      if (candidate) {
        row.briefId = spec.briefCycle[zeroIndex % spec.briefCycle.length];
        row.authorRoleId = spec.authorRoleCycle[zeroIndex % spec.authorRoleCycle.length];
      }
      return row;
    })
  );
}

function selectedAt(rotationOrder, epoch, role) {
  const n = rotationOrder.length;
  const mainIndex = (epoch - 1) % n;
  const holdoutIndex = (epoch - 1 + Math.ceil(n / 2)) % n;
  const index = role === "MAIN" ? mainIndex : holdoutIndex;
  return { index, typeId: rotationOrder[index] };
}

function familyPlan(binding, epoch, role) {
  return binding.families.map((family) => ({
    familyId: family.familyId,
    typeId: selectedAt(family.rotationOrder, epoch, role).typeId
  }));
}

function materializeRotationRows(families, epochs = 4) {
  const rows = [];
  for (const family of families) {
    for (let epoch = 1; epoch <= epochs; epoch += 1) {
      const main = selectedAt(family.rotationOrder, epoch, "MAIN");
      const holdout = selectedAt(family.rotationOrder, epoch, "HOLDOUT");
      rows.push({
        familyId: family.familyId,
        epoch,
        mainIndex: main.index,
        mainTypeId: main.typeId,
        holdoutIndex: holdout.index,
        holdoutTypeId: holdout.typeId
      });
    }
  }
  return rows;
}

function contactedTypes(families, epochs, roles) {
  const types = new Set();
  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    for (const family of families) {
      for (const role of roles) types.add(selectedAt(family.rotationOrder, epoch, role).typeId);
    }
  }
  return types;
}

function pairKey(left, right) {
  return [left, right].sort().join("|");
}

function validateCore(p, r, binding, expectedUpstreams) {
  const reasons = new Set();
  const canonicalNonfocus = binding.canonicalUniverse.nonfocusTypeIdsInUiOrder;
  const mapped = binding.families.flatMap((family) => family.rotationOrder);

  if (duplicateValues(mapped).length > 0) reasons.add("NONFOCUS_DUPLICATE");
  if (difference(canonicalNonfocus, mapped).length > 0 || difference(mapped, canonicalNonfocus).length > 0) {
    reasons.add("NONFOCUS_COVERAGE_MISMATCH");
  }
  if (
    difference(p.typeUniverse.nonfocusTypeIds, canonicalNonfocus).length > 0 ||
    difference(canonicalNonfocus, p.typeUniverse.nonfocusTypeIds).length > 0
  ) {
    reasons.add("BINDING_TYPE_DRIFT");
  }
  if (p.typeUniverse.priorLogicalTypesUsed !== false) reasons.add("PRIOR_LOGICAL_TYPES_FORBIDDEN");
  if (p.selection.outcomeRelabelForBalanceAllowed !== false) reasons.add("OUTCOME_RELABEL_FORBIDDEN");
  if (p.selection.evidenceRewriteForBalanceAllowed !== false) reasons.add("EVIDENCE_REWRITE_FORBIDDEN");
  if (p.selection.candidateSkippingAfterOutcomeAllowed !== false) reasons.add("OUTCOME_SKIP_FORBIDDEN");
  if (p.scoring.grammar.postIssueConstraintExpansionAllowed !== false) {
    reasons.add("POST_ISSUE_SCORER_EXPANSION_FORBIDDEN");
  }
  if (p.scoring.blank.postIssueVectorExpansionAllowed !== false) {
    reasons.add("POST_ISSUE_SCORER_EXPANSION_FORBIDDEN");
  }
  if (p.sealing.acceptedSetOrConstraintRevisionAfterBlindPacketSealAllowed !== false) {
    reasons.add("POST_ISSUE_SCORER_EXPANSION_FORBIDDEN");
  }
  if (p.rotation.outcomeAwareTypeSubstitutionAllowed !== false) reasons.add("ROTATION_CHERRY_PICK_FORBIDDEN");

  for (const brief of r.authorBriefs) {
    if (brief.targetGrade !== null && brief.targetGrade !== undefined) reasons.add("GRADE_TARGET_IN_AUTHOR_BRIEF");
    if (brief.targetFatal !== null && brief.targetFatal !== undefined) reasons.add("GRADE_TARGET_IN_AUTHOR_BRIEF");
  }

  const actualMain = r.typePlans.mainNonfocus;
  const actualHoldout = r.typePlans.holdoutNonfocus;
  const expectedMain = familyPlan(binding, p.rotation.epoch, "MAIN");
  const expectedHoldout = familyPlan(binding, p.rotation.epoch, "HOLDOUT");
  if (JSON.stringify(actualMain) !== JSON.stringify(expectedMain) || JSON.stringify(actualHoldout) !== JSON.stringify(expectedHoldout)) {
    reasons.add("ROTATION_PLAN_MISMATCH");
  }

  const actualUpstreamHashes = new Map(p.upstreams.map((upstream) => [upstream.artifactId, upstream.manifestSha256]));
  for (const [artifactId, hash] of expectedUpstreams.entries()) {
    if (actualUpstreamHashes.get(artifactId) !== hash) reasons.add("UPSTREAM_HASH_DRIFT");
  }

  const roleById = new Map(r.roleRegistry.roleSlots.map((role) => [role.roleId, role]));
  const incompatible = new Set(r.roleRegistry.incompatibleClassPairs.map(([left, right]) => pairKey(left, right)));
  const actorRoles = new Map();
  for (const bindingRow of r.roleRegistry.actorBindings) {
    if (!roleById.has(bindingRow.roleId)) {
      reasons.add("UNKNOWN_ROLE_BINDING");
      continue;
    }
    if (!actorRoles.has(bindingRow.actorPseudonym)) actorRoles.set(bindingRow.actorPseudonym, []);
    actorRoles.get(bindingRow.actorPseudonym).push(roleById.get(bindingRow.roleId));
  }
  for (const roles of actorRoles.values()) {
    for (let i = 0; i < roles.length; i += 1) {
      for (let j = i + 1; j < roles.length; j += 1) {
        if (incompatible.has(pairKey(roles[i].roleClass, roles[j].roleClass))) {
          reasons.add("INCOMPATIBLE_ROLE_OVERLAP");
        }
        if (
          roles[i].roleClass === roles[j].roleClass &&
          r.roleRegistry.distinctWithinClass.includes(roles[i].roleClass)
        ) {
          reasons.add("INCOMPATIBLE_ROLE_OVERLAP");
        }
      }
    }
  }

  const operationalArrays = Object.values(r.operationalState);
  if (!operationalArrays.every((value) => Array.isArray(value) && value.length === 0)) {
    reasons.add("DESIGN_PACKET_NOT_EMPTY");
  }
  for (const value of Object.values(p.emptyOperationalState)) {
    if (value !== 0) reasons.add("DESIGN_PACKET_NOT_EMPTY");
  }
  return reasons;
}

function validateEventChain(events) {
  const reasons = new Set();
  let previousHash = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.sequence !== index + 1 || event.previousEventHash !== previousHash) {
      reasons.add("APPEND_ONLY_CHAIN_BROKEN");
    }
    previousHash = event.eventSha256;
  }
  return reasons;
}

function validateAccessSequence(events) {
  const reasons = validateEventChain(events);
  const preAccessByHash = new Map();
  for (const event of events) {
    if (event.eventType === "PRE_ACCESS_AUTHORIZED") preAccessByHash.set(event.eventSha256, event);
    if (event.eventType === "ACCESS_RECEIPT") {
      const pre = preAccessByHash.get(event.preAccessEventSha256);
      if (!pre) {
        reasons.add("ACCESS_BEFORE_PRESEAL");
        continue;
      }
      if (
        pre.resourceId !== event.resourceId ||
        pre.resourceSha256 !== event.resourceSha256 ||
        pre.capabilityTokenSha256 !== event.capabilityTokenSha256
      ) {
        reasons.add("ACCESS_BINDING_MISMATCH");
      }
      const authorized = Date.parse(pre.authorizedAt);
      const opened = Date.parse(event.openedAt);
      const closed = Date.parse(event.closedAt);
      if (!(authorized < opened && opened <= closed)) reasons.add("ACCESS_BEFORE_PRESEAL");
    }
  }
  return reasons;
}

const expectedUpstreamHashes = new Map(protocol.upstreams.map((upstream) => [upstream.artifactId, upstream.manifestSha256]));
const upstreamObjects = new Map();
for (const upstream of protocol.upstreams) {
  const upstreamDir = resolve(base, upstream.path);
  const upstreamManifestPath = join(upstreamDir, "MANIFEST.sha256");
  check(`upstream directory exists ${upstream.artifactId}`, existsSync(upstreamDir));
  check(`upstream manifest exists ${upstream.artifactId}`, existsSync(upstreamManifestPath));
  if (!existsSync(upstreamManifestPath)) continue;
  eq(`upstream manifest hash ${upstream.artifactId}`, sha256File(upstreamManifestPath), upstream.manifestSha256);
  const actualEntries = parseManifest(upstreamManifestPath);
  eq(`upstream manifest entries ${upstream.artifactId}`, Object.fromEntries(actualEntries), upstream.manifestEntries);
  for (const [file, expectedHash] of Object.entries(upstream.manifestEntries)) {
    eq(`upstream file hash ${upstream.artifactId}/${file}`, sha256File(join(upstreamDir, file)), expectedHash);
  }
  const verifyPath = join(upstreamDir, "verify.mjs");
  const verifyResult = runNode(verifyPath, ["--check-manifest"]);
  check(`upstream verifier exit ${upstream.artifactId}`, verifyResult.status === 0, verifyResult.stderr || verifyResult.stdout);
  if (upstream.artifactId === "reviewer-calibration-v3-replacement-v1") {
    upstreamObjects.set("methodology", JSON.parse(readFileSync(join(upstreamDir, "protocol.json"), "utf8")));
  }
  if (upstream.artifactId === "reviewer-calibration-v3-production-type-binding-v2") {
    upstreamObjects.set("binding", JSON.parse(readFileSync(join(upstreamDir, "binding.json"), "utf8")));
  }
}

const methodology = upstreamObjects.get("methodology");
const binding = upstreamObjects.get("binding");
check("replacement methodology loaded", Boolean(methodology));
check("production binding loaded", Boolean(binding));
if (!methodology || !binding) throw new Error("Normative upstream unavailable");
eq("upstream IDs exact", protocol.upstreams.map((row) => row.artifactId), [
  "reviewer-calibration-v3-replacement-v1",
  "reviewer-calibration-v3-production-type-binding-v2"
]);
eq("corrected binding artifact", binding.artifactId, "reviewer-calibration-v3-production-type-binding-v2");
eq("corrected binding status", binding.status, "VALID_CORRECTED_ROTATION_V1_EXECUTION_INVALID");
eq("binding bytes exact", sha256File(join(resolve(base, protocol.upstreams[1].path), "binding.json")), protocol.upstreams[1].bindingSha256);
eq("accepted source snapshot preserved", binding.supersedes.sourceSnapshotSha256, protocol.upstreams[1].acceptedSourceSnapshotSha256);
eq(
  "binding canonical semantic hash",
  semanticSha({ canonicalUniverse: binding.canonicalUniverse, families: binding.families, rotation: binding.rotation }),
  protocol.upstreams[1].canonicalBindingSha256
);
eq("v1 execution path disabled", protocol.upstreams[1].v1ExecutionPathAllowed, false);

eq("protocol schema", protocol.schemaVersion, "reviewer-calibration-v4-production-bound-protocol-1");
eq("protocol unissued status", protocol.status, "DESIGN_UNISSUED_OFFLINE");
eq("registries empty status", registries.status, "EMPTY_SLOTS_ONLY_NO_ITEMS_NO_GOLD");
eq("epoch agreement", registries.epoch, protocol.rotation.epoch);

eq("focus types direct bound", protocol.typeUniverse.focusTypeIds, binding.canonicalUniverse.focusTypeIds);
eq("nonfocus types direct bound", protocol.typeUniverse.nonfocusTypeIds, binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
eq("nonfocus exact count", protocol.typeUniverse.nonfocusTypeIds.length, 23);
eq("focus exact count", protocol.typeUniverse.focusTypeIds.length, 2);
eq("family IDs direct bound", protocol.typeUniverse.familyIds, binding.families.map((family) => family.familyId));
eq("prior logical types disabled", protocol.typeUniverse.priorLogicalTypesUsed, false);
eq("legacy schema-only slot allowlist empty", protocol.typeUniverse.legacySchemaOnlyIdsAllowedInSlots, []);
eq("single epoch all-23 claim disabled", protocol.typeUniverse.singleEpochAll23ClaimAllowed, false);

const priorLogicalIds = methodology.nonfocusConstruct.families.flatMap((family) => family.logicalTypes);
const priorOnlyIds = [...new Set(priorLogicalIds)].filter(
  (id) => !binding.canonicalUniverse.nonfocusTypeIdsInUiOrder.includes(id)
);
const ownTypeMaterial = JSON.stringify({ protocol: protocol.typeUniverse, registries: registries.typePlans });
eq("prior-only logical IDs absent from v4 type material", priorOnlyIds.filter((id) => ownTypeMaterial.includes(`\"${id}\"`)), []);

eq("taxonomy item count", protocol.stages.taxonomyPilot.items, 12);
eq("taxonomy block total", Object.values(protocol.stages.taxonomyPilot.byBlock).reduce((a, b) => a + b, 0), 12);
eq("taxonomy rater count", protocol.stages.taxonomyPilot.raters, 3);
eq("taxonomy coverage credit false", protocol.stages.taxonomyPilot.coverageCredit, false);
eq("main item count", protocol.stages.mainCertification.items, 24);
eq("main block total", Object.values(protocol.stages.mainCertification.byBlock).reduce((a, b) => a + b, 0), 24);
eq("main rater count", protocol.stages.mainCertification.raters, 3);
eq("holdout item count", protocol.stages.freshActivationHoldout.items, 24);
eq("holdout block total", Object.values(protocol.stages.freshActivationHoldout.byBlock).reduce((a, b) => a + b, 0), 24);
eq("holdout rater count", protocol.stages.freshActivationHoldout.raters, 3);
eq("holdout fatal total", protocol.stages.freshActivationHoldout.fatalPerBlock * 3, 12);

const anchorSlots = expandSlots(registries.anchorSlotGenerators, false);
const candidateSlots = expandSlots(registries.candidateSlotGenerators, true);
eq("expanded anchor slot count", anchorSlots.length, 60);
eq("committed anchor slot count", registries.expandedCommitments.anchorSlotCount, 60);
eq("expanded anchor slot digest", semanticSha(anchorSlots), registries.expandedCommitments.anchorSlotsSha256);
eq("anchor slot IDs unique", new Set(anchorSlots.map((row) => row.slotId)).size, 60);
eq("expanded candidate slot count", candidateSlots.length, 576);
eq("committed candidate slot count", registries.expandedCommitments.candidateSlotCount, 576);
eq("expanded candidate slot digest", semanticSha(candidateSlots), registries.expandedCommitments.candidateSlotsSha256);
eq("candidate slot IDs unique", new Set(candidateSlots.map((row) => row.slotId)).size, 576);

for (const stage of ["TAXONOMY", "MAIN", "HOLDOUT"]) {
  for (const block of ["GRAMMAR", "BLANK", "NONFOCUS"]) {
    const stageCandidates = candidateSlots.filter((row) => row.stage === stage && row.block === block);
    eq(`${stage}/${block} candidate cap`, stageCandidates.length, 64);
    eq(`${stage}/${block} ordinals`, stageCandidates.map((row) => row.ordinal), Array.from({ length: 64 }, (_, i) => i + 1));
  }
}

const roleIds = registries.roleRegistry.roleSlots.map((role) => role.roleId);
eq("role IDs unique", new Set(roleIds).size, roleIds.length);
eq("unbound role slot actor fields", registries.roleRegistry.roleSlots.filter((role) => role.actorBinding !== null), []);
eq("operational actor bindings empty", registries.roleRegistry.actorBindings, []);
for (const candidate of candidateSlots) {
  check(`candidate author role exists ${candidate.slotId}`, roleIds.includes(candidate.authorRoleId));
}
const briefById = new Map(registries.authorBriefs.map((brief) => [brief.briefId, brief]));
eq("brief IDs unique", briefById.size, registries.authorBriefs.length);
for (const brief of registries.authorBriefs) {
  eq(`grade-neutral brief grade ${brief.briefId}`, brief.targetGrade, null);
  eq(`grade-neutral brief fatal ${brief.briefId}`, brief.targetFatal, null);
  check(`brief has no composition cell ${brief.briefId}`, !("compositionCell" in brief));
  check(`brief has no accepted response ${brief.briefId}`, !("acceptedResponse" in brief));
}
for (const candidate of candidateSlots) {
  check(`candidate brief exists ${candidate.slotId}`, briefById.has(candidate.briefId));
  if (briefById.has(candidate.briefId)) eq(`candidate brief block ${candidate.slotId}`, briefById.get(candidate.briefId).block, candidate.block);
}

eq("rotation main formula exact", protocol.rotation.mainFormula, binding.rotation.mainIndexFormula);
eq("rotation holdout formula exact", protocol.rotation.holdoutFormula, binding.rotation.holdoutIndexFormula);
eq("binding schedule generated by selectedAt", binding.scheduleRows, materializeRotationRows(binding.families, 4));
eq("main type plan follows epoch rotation", registries.typePlans.mainNonfocus, familyPlan(binding, 1, "MAIN"));
eq("holdout type plan follows epoch rotation", registries.typePlans.holdoutNonfocus, familyPlan(binding, 1, "HOLDOUT"));
eq("main types distinct", new Set(registries.typePlans.mainNonfocus.map((row) => row.typeId)).size, 8);
eq("holdout types distinct", new Set(registries.typePlans.holdoutNonfocus.map((row) => row.typeId)).size, 8);
eq(
  "epoch-one combined distinct contact",
  new Set([...registries.typePlans.mainNonfocus, ...registries.typePlans.holdoutNonfocus].map((row) => row.typeId)).size,
  16
);

const twoEpochContact = contactedTypes(binding.families, 2, ["MAIN", "HOLDOUT"]);
eq("two epoch contact count", twoEpochContact.size, 23);
setEq("two epoch contact exact canonical IDs", [...twoEpochContact], protocol.typeUniverse.nonfocusTypeIds);
const fourEpochMain = contactedTypes(binding.families, 4, ["MAIN"]);
eq("four epoch main contact count", fourEpochMain.size, 23);
eq("n2 epoch1 corrected pair", [selectedAt(["a", "b"], 1, "MAIN").index, selectedAt(["a", "b"], 1, "HOLDOUT").index], [0, 1]);
eq("n3 epoch1 corrected pair", [selectedAt(["a", "b", "c"], 1, "MAIN").index, selectedAt(["a", "b", "c"], 1, "HOLDOUT").index], [0, 2]);
eq("n3 epoch2 corrected pair", [selectedAt(["a", "b", "c"], 2, "MAIN").index, selectedAt(["a", "b", "c"], 2, "HOLDOUT").index], [1, 0]);
eq("n4 epoch1 corrected pair", [selectedAt(["a", "b", "c", "d"], 1, "MAIN").index, selectedAt(["a", "b", "c", "d"], 1, "HOLDOUT").index], [0, 2]);
eq("n4 epoch2 corrected pair", [selectedAt(["a", "b", "c", "d"], 2, "MAIN").index, selectedAt(["a", "b", "c", "d"], 2, "HOLDOUT").index], [1, 3]);

eq("candidate max prefix", protocol.selection.maximumPrefix, 64);
eq("acquisition slot cap", protocol.acquisition.candidateSlotsPerStageBlockMaximum, 64);
eq("initial open prefix", protocol.acquisition.initialOpenPrefixPerStageBlock, 16);
eq("preflight count", protocol.acquisition.preflightCount, 2);
eq("blind pilot count", protocol.acquisition.blindPilotCount, 2);
eq("in-place repair forbidden", protocol.acquisition.inPlaceRepairAllowed, false);
eq("surface revision new slot", protocol.acquisition.surfaceRevisionCreatesNewCandidateSlot, true);
eq("first-to-fill algorithm", protocol.selection.algorithm, "PREFIX_FIRST_FEASIBLE_THEN_LEXICOGRAPHIC");
eq("outcome relabel forbidden", protocol.selection.outcomeRelabelForBalanceAllowed, false);
eq("evidence rewrite forbidden", protocol.selection.evidenceRewriteForBalanceAllowed, false);
eq("outcome skip forbidden", protocol.selection.candidateSkippingAfterOutcomeAllowed, false);
eq("surplus deletion forbidden", protocol.selection.surplusDeletionAllowed, false);

eq("constructed exact text enumeration forbidden", protocol.scoring.constructedExactTextEnumerationAllowed, false);
eq("grammar closed constraint scorer", protocol.scoring.grammar.scorerKind, "CLOSED_GRAMMAR_SEMANTIC_CONSTRAINTS");
eq("grammar response may be novel", protocol.scoring.grammar.responseMayBeNovelText, true);
eq("grammar constraint bundle closed", protocol.scoring.grammar.constraintBundleClosedAtIssue, true);
eq("grammar expansion forbidden", protocol.scoring.grammar.postIssueConstraintExpansionAllowed, false);
eq("blank proposition-vector scorer", protocol.scoring.blank.scorerKind, "SEALED_PROPOSITION_VECTOR");
eq("blank axes count", protocol.scoring.blank.axes.length, 7);
eq("blank relation count", protocol.scoring.blank.relations.length, 8);
eq("blank primary singleton absent", protocol.scoring.blank.primaryIntentSingletonRequired, false);
eq("blank exact prose absent", protocol.scoring.blank.exactDiagnosticProseRequired, false);
eq("blank vector expansion forbidden", protocol.scoring.blank.postIssueVectorExpansionAllowed, false);

eq("seal order pre-access before open", protocol.sealing.requiredOrder.indexOf("PRE_ACCESS_AUTHORIZATION_SEAL") < protocol.sealing.requiredOrder.indexOf("RESOURCE_OPEN"), true);
eq("seal order scorer before blind packet", protocol.sealing.requiredOrder.indexOf("FOCUS_SCORER_SEAL") < protocol.sealing.requiredOrder.indexOf("BLIND_PACKET_SEAL"), true);
eq("post-blind scorer revision forbidden", protocol.sealing.acceptedSetOrConstraintRevisionAfterBlindPacketSealAllowed, false);
eq("append-only events required", protocol.sealing.allOperationalEventsAppendOnly, true);
eq("previous event hash required", protocol.sealing.eventHashBindsPreviousEventHash, true);
eq("pre-access required", protocol.accessProvenance.preAccessEventRequired, true);
eq("pre-access before open required", protocol.accessProvenance.preAccessMustBeSealedBeforeResourceOpen, true);
check("phase2 denies other raters", protocol.accessProvenance.phase2DeniedResources.includes("OTHER_RATER_SUBMISSIONS"));
check("phase2 denies author hypothesis", protocol.accessProvenance.phase2DeniedResources.includes("AUTHOR_HYPOTHESIS"));
check("late pre-access cannot be repaired", protocol.accessProvenance.missingOrLatePreAccessAction.includes("NO_RETROACTIVE_LEDGER"));

eq("event schema draft", schemas.$schema, "https://json-schema.org/draft/2020-12/schema");
check("schema candidate event exists", Boolean(schemas.$defs.candidateAuthoredEvent));
check("schema seal event exists", Boolean(schemas.$defs.sealEvent));
check("schema pre-access event exists", Boolean(schemas.$defs.preAccessEvent));
check("schema receipt event exists", Boolean(schemas.$defs.accessReceiptEvent));
check("schema coverage event exists", Boolean(schemas.$defs.coverageEvent));
check("schema rejection event exists", Boolean(schemas.$defs.rejectionEvent));
check("schema grammar constraints exists", Boolean(schemas.$defs.grammarConstraintBundle));
check("schema blank vector exists", Boolean(schemas.$defs.blankPropositionScorer));
check("grammar schema has no exact accepted texts", !JSON.stringify(schemas.$defs.grammarConstraintBundle).includes("acceptedText"));
eq("grammar schema additional properties closed", schemas.$defs.grammarConstraintBundle.additionalProperties, false);
eq("blank schema additional properties closed", schemas.$defs.blankPropositionScorer.additionalProperties, false);

const pythonSchemaCheck = spawnSync(
  "python",
  [
    "-c",
    "import json,sys; from jsonschema import Draft202012Validator; Draft202012Validator.check_schema(json.load(open(sys.argv[1], encoding='utf-8')))",
    schemasPath
  ],
  { encoding: "utf8", cwd: base }
);
check("Draft 2020-12 meta-schema validation", pythonSchemaCheck.status === 0, pythonSchemaCheck.stderr);

for (const [key, value] of Object.entries(protocol.emptyOperationalState)) eq(`empty operational ${key}`, value, 0);
for (const [key, value] of Object.entries(protocol.activity)) eq(`offline activity ${key}`, value, 0);
for (const [key, value] of Object.entries(registries.operationalState)) eq(`empty registry ${key}`, value, []);

const baselineReasons = validateCore(protocol, registries, binding, expectedUpstreamHashes);
eq("baseline semantic validator", [...baselineReasons], []);

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const validAccessEvents = [
  {
    sequence: 1,
    previousEventHash: null,
    eventType: "PRE_ACCESS_AUTHORIZED",
    eventSha256: hashA,
    resourceId: "BLIND_SURFACE_BUNDLE",
    resourceSha256: hashB,
    capabilityTokenSha256: hashC,
    authorizedAt: "2026-07-15T12:00:00.000Z"
  },
  {
    sequence: 2,
    previousEventHash: hashA,
    eventType: "ACCESS_RECEIPT",
    eventSha256: hashB,
    preAccessEventSha256: hashA,
    resourceId: "BLIND_SURFACE_BUNDLE",
    resourceSha256: hashB,
    capabilityTokenSha256: hashC,
    openedAt: "2026-07-15T12:00:01.000Z",
    closedAt: "2026-07-15T12:00:02.000Z"
  }
];
eq("valid synthetic access sequence", [...validateAccessSequence(validAccessEvents)], []);

function executeHostileFixture(fixture) {
  const p = clone(protocol);
  const r = clone(registries);
  const b = clone(binding);
  let reasons;
  switch (fixture.mutation) {
    case "REMOVE_LAST_TYPE_FROM_FAMILY_8":
      b.families[7].rotationOrder.pop();
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "ADD_TOPIC_TO_FAMILY_2":
      b.families[1].rotationOrder.push("TOPIC");
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "ENABLE_OUTCOME_RELABEL":
      p.selection.outcomeRelabelForBalanceAllowed = true;
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "SET_FIRST_BRIEF_TARGET_GRADE_A":
      r.authorBriefs[0].targetGrade = "A";
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "ENABLE_POST_ISSUE_GRAMMAR_CONSTRAINT_EXPANSION":
      p.scoring.grammar.postIssueConstraintExpansionAllowed = true;
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "SYNTHETIC_RECEIPT_TIMESTAMP_BEFORE_AUTHORIZATION": {
      const events = clone(validAccessEvents);
      events[1].openedAt = "2026-07-15T11:59:59.000Z";
      reasons = validateAccessSequence(events);
      break;
    }
    case "BIND_AUTHOR_AND_RATER_TO_SAME_ACTOR":
      r.roleRegistry.actorBindings.push(
        { roleId: "AUTHOR_G_1", actorPseudonym: "ACTOR_COLLISION" },
        { roleId: "CERTIFICATION_RATER_1", actorPseudonym: "ACTOR_COLLISION" }
      );
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "ADD_UNBOUND_NONFOCUS_TYPE":
      p.typeUniverse.nonfocusTypeIds.push("UNBOUND_NEW_TYPE");
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "CORRUPT_BINDING_UPSTREAM_MANIFEST_HASH":
      p.upstreams[1].manifestSha256 = "0".repeat(64);
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "REPLACE_EPOCH1_MAIN_FAMILY1_TYPE_WITH_TITLE":
      r.typePlans.mainNonfocus[0].typeId = "TITLE";
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "SYNTHETIC_REJECTION_SEQUENCE_GAP":
      reasons = validateEventChain([
        { sequence: 1, previousEventHash: null, eventSha256: hashA },
        { sequence: 3, previousEventHash: hashA, eventSha256: hashB }
      ]);
      break;
    case "ADD_MATERIALIZED_CANDIDATE_ROW":
      r.operationalState.materializedCandidateRows.push({ candidateSlotId: "RCAL4-TAX-G-CAND-001" });
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "ENABLE_PRIOR_LOGICAL_TYPES":
      p.typeUniverse.priorLogicalTypesUsed = true;
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    case "ENABLE_OUTCOME_AWARE_TYPE_SUBSTITUTION":
      p.rotation.outcomeAwareTypeSubstitutionAllowed = true;
      reasons = validateCore(p, r, b, expectedUpstreamHashes);
      break;
    default:
      throw new Error(`Unknown hostile mutation ${fixture.mutation}`);
  }
  return reasons;
}

eq("hostile fixture count", hostile.fixtures.length, 14);
eq("hostile fixture IDs unique", new Set(hostile.fixtures.map((fixture) => fixture.fixtureId)).size, 14);
for (const fixture of hostile.fixtures) {
  const reasons = executeHostileFixture(fixture);
  check(
    `hostile rejected ${fixture.fixtureId}`,
    reasons.has(fixture.expectedReasonCode),
    { expected: fixture.expectedReasonCode, actual: [...reasons] }
  );
}

if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, "utf8");
  for (const phrase of [
    "DESIGN / UNISSUED / OFFLINE",
    "taxonomy pilot 12",
    "main 24",
    "fresh holdout 24",
    "pre-access",
    "exact-text",
    "proposition-vector",
    "단일 epoch",
    "ledger 0"
  ]) {
    check(`README contains ${phrase}`, readme.includes(phrase));
  }
}

if (process.argv.includes("--check-manifest")) {
  check("manifest exists", existsSync(manifestPath));
  if (existsSync(manifestPath)) {
    const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    const expectedFiles = ["README.md", "protocol.json", "registries.json", "event-schemas.json", "hostile-fixtures.json", "verify.mjs"];
    eq("manifest entry count", lines.length, expectedFiles.length);
    const parsed = new Map();
    for (const line of lines) {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
      check(`manifest line format ${line.slice(-28)}`, Boolean(match));
      if (match) parsed.set(match[2], match[1]);
    }
    eq("manifest file names", [...parsed.keys()].sort(), expectedFiles.sort());
    for (const file of expectedFiles) {
      if (parsed.has(file)) eq(`manifest hash ${file}`, parsed.get(file), sha256File(join(base, file)));
    }
  }
}

const failures = checks.filter((entry) => !entry.pass);
const result = {
  schemaVersion: "reviewer-calibration-v4-production-bound-verification-1",
  status: failures.length === 0 ? "PASS_EXECUTION_READY_BUT_UNISSUED" : "FAIL_CLOSED",
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  hostileFixtures: {
    total: hostile.fixtures.length,
    rejectedAsExpected: hostile.fixtures.filter((fixture) => executeHostileFixture(fixture).has(fixture.expectedReasonCode)).length
  },
  commitments: {
    canonicalFocusTypes: protocol.typeUniverse.focusTypeIds.length,
    canonicalNonfocusTypes: protocol.typeUniverse.nonfocusTypeIds.length,
    families: protocol.typeUniverse.familyIds.length,
    targetAnchorSlots: anchorSlots.length,
    emptyCandidateSlots: candidateSlots.length,
    materializedCandidates: registries.operationalState.materializedCandidateRows.length,
    goldRecords: registries.operationalState.goldRecords.length,
    operationalLedgerEvents: protocol.emptyOperationalState.ledgerEvents
  },
  activity: protocol.activity,
  failures
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
