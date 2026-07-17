import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const base = dirname(fileURLToPath(import.meta.url));
const repo = resolve(base, "../../../..");
const bindingPath = join(base, "binding.json");
const reportPath = join(base, "REPORT.md");
const manifestPath = join(base, "MANIFEST.sha256");
const binding = JSON.parse(readFileSync(bindingPath, "utf8"));
const checks = [];

function check(name, condition, detail = undefined) {
  checks.push({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
}

function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}

function setEq(name, actual, expected) {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  eq(name, a, e);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function semanticSha(value) {
  return sha256Bytes(JSON.stringify(value));
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

function parseSource(relativePath) {
  const absolute = join(repo, relativePath);
  const text = readFileSync(absolute, "utf8");
  return {
    text,
    ast: ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  };
}

function findVariableInitializer(ast, variableName) {
  let found;
  function visit(node) {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!found) throw new Error(`Variable ${variableName} not found in ${ast.fileName}`);
  return found;
}

function unwrapExpression(node) {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isParenthesizedExpression(node)) {
    node = node.expression;
  }
  return node;
}

function propertyNameText(name) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function objectKeys(ast, variableName) {
  const initializer = unwrapExpression(findVariableInitializer(ast, variableName));
  if (!ts.isObjectLiteralExpression(initializer)) throw new Error(`${variableName} is not an object literal`);
  return initializer.properties
    .filter((property) => ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
    .map((property) => propertyNameText(property.name))
    .filter(Boolean);
}

function stringValueFields(ast, variableName) {
  const initializer = findVariableInitializer(ast, variableName);
  const values = [];
  function visit(node) {
    if (ts.isPropertyAssignment(node) && propertyNameText(node.name) === "value" && ts.isStringLiteral(node.initializer)) {
      values.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(initializer);
  return values;
}

function questionTypeUiReferences(ast, variableName) {
  const initializer = findVariableInitializer(ast, variableName);
  const ids = [];
  function visit(node) {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "QUESTION_TYPE_UI"
    ) {
      ids.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(initializer);
  return ids;
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

const sourcesByPath = new Map(binding.sources.map((source) => [source.path, source]));
const sourceCache = new Map();
for (const source of binding.sources) {
  const absolute = join(repo, source.path);
  check(`source exists ${source.path}`, existsSync(absolute));
  if (!existsSync(absolute)) continue;
  eq(`source sha256 ${source.path}`, sha256File(absolute), source.worktreeSha256);
  if (source.headBlobSha1) {
    const blob = git(["rev-parse", `HEAD:${source.path}`]).stdout.trim();
    eq(`HEAD blob ${source.path}`, blob, source.headBlobSha1);
    const cleanResult = git(["diff", "--quiet", "--", source.path], { allowFailure: true });
    eq(`clean state ${source.path}`, cleanResult.status === 0, source.cleanAtFreeze);
  }
  if (source.path.endsWith(".ts") || source.path.endsWith(".tsx")) {
    sourceCache.set(source.path, parseSource(source.path));
  }
}

eq("repository HEAD", git(["rev-parse", "HEAD"]).stdout.trim(), binding.freeze.repositoryHead);
eq("binding schema", binding.schemaVersion, "reviewer-calibration-v3-production-type-binding-1");
eq("binding status", binding.status, "BINDING_VALID_PRIOR_PROTOCOL_STANDALONE_BLOCKED");

for (const [key, value] of Object.entries(binding.freeze.activity)) {
  eq(`offline activity ${key}`, value, 0);
}

const uiSource = sourceCache.get("src/lib/question-type-ui.ts");
const schemaSource = sourceCache.get("src/lib/question-schemas.ts");
const aiMcSource = sourceCache.get("src/lib/question-ai-schemas-mc.ts");
const aiVocabSource = sourceCache.get("src/lib/question-ai-schemas-vocab.ts");
const constantsSource = sourceCache.get("src/lib/constants.ts");
const filterSource = sourceCache.get("src/components/workbench/question-type-filter.tsx");
const pageTypesSource = sourceCache.get("src/app/(director)/director/workbench/generate/generate-page-types.ts");
const panelSource = sourceCache.get("src/app/(director)/director/workbench/generate/generation-config-panel.tsx");
const routeSource = sourceCache.get("src/app/api/ai/generate-question/route.ts");
const editConfigSource = sourceCache.get("src/lib/question-ai-edit/type-edit-config.ts");

const uiIds = questionTypeUiReferences(uiSource.ast, "QUESTION_TYPE_GROUPS");
const uiMetadataIds = objectKeys(uiSource.ast, "QUESTION_TYPE_UI");
const structuredSchemaIds = objectKeys(schemaSource.ast, "QUESTION_SCHEMAS");
const aiMcIds = objectKeys(aiMcSource.ast, "AI_MC_QUESTION_SCHEMAS");
const aiEssayIds = objectKeys(aiMcSource.ast, "AI_ESSAY_QUESTION_SCHEMAS");
const aiVocabIds = objectKeys(aiVocabSource.ast, "AI_VOCAB_QUESTION_SCHEMAS");
const aiIds = [...new Set([...aiMcIds, ...aiVocabIds, ...aiEssayIds])];
const legacyIds = stringValueFields(constantsSource.ast, "QUESTION_SUBTYPES");
const filterIds = stringValueFields(filterSource.ast, "TYPE_SUBTYPE_MAP");

eq("canonical UI ordered IDs", uiIds, binding.canonicalUniverse.uiTypeIdsInOrder);
eq("canonical UI count", uiIds.length, 25);
eq("canonical UI unique", new Set(uiIds).size, 25);
eq("focus IDs", binding.canonicalUniverse.focusTypeIds, ["BLANK_INFERENCE", "GRAMMAR_ERROR"]);
const extractedNonfocus = uiIds.filter((id) => !binding.canonicalUniverse.focusTypeIds.includes(id));
eq("nonfocus ordered IDs", extractedNonfocus, binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
eq("nonfocus exact count", extractedNonfocus.length, 23);
eq("nonfocus unique", new Set(extractedNonfocus).size, 23);
eq("focus excluded from nonfocus", extractedNonfocus.filter((id) => binding.canonicalUniverse.focusTypeIds.includes(id)), []);

eq("structured schema count", structuredSchemaIds.length, 26);
eq("structured schema unique", new Set(structuredSchemaIds).size, 26);
eq("AI schema count", aiIds.length, 26);
eq("AI schema unique", new Set(aiIds).size, 26);
setEq("AI and structured schemas agree", aiIds, structuredSchemaIds);
setEq("UI metadata and schema registries agree", uiMetadataIds, structuredSchemaIds);
eq("schema only relative to UI", difference(structuredSchemaIds, uiIds), ["TOPIC_MAIN_IDEA"]);
eq("UI missing schema", difference(uiIds, structuredSchemaIds), []);

eq("filter count", filterIds.length, 26);
eq("filter unique", new Set(filterIds).size, 26);
eq("filter only relative to UI", difference(filterIds, uiIds), ["TOPIC_MAIN_IDEA"]);
eq("UI missing filter", difference(uiIds, filterIds), []);
eq("legacy QUESTION_SUBTYPES count", legacyIds.length, 24);
eq("legacy QUESTION_SUBTYPES unique", new Set(legacyIds).size, 24);
eq("legacy missing relative to UI", difference(uiIds, legacyIds), ["GRAMMAR_CHOICE_COMBO"]);
eq("legacy extra relative to UI", difference(legacyIds, uiIds), []);

eq("recorded schema count", binding.schemaAndUiDrift.structuredSchemaTypeCount, structuredSchemaIds.length);
eq("recorded AI schema count", binding.schemaAndUiDrift.aiSchemaTypeCount, aiIds.length);
eq("recorded filter count", binding.schemaAndUiDrift.filterTypeCount, filterIds.length);
eq("recorded legacy count", binding.schemaAndUiDrift.legacyQuestionSubtypesCount, legacyIds.length);
eq("recorded schema extra", binding.schemaAndUiDrift.schemaOnlyRelativeToNewGenerationUi, ["TOPIC_MAIN_IDEA"]);
eq("recorded filter extra", binding.schemaAndUiDrift.filterOnlyRelativeToNewGenerationUi, ["TOPIC_MAIN_IDEA"]);
eq("recorded legacy missing", binding.schemaAndUiDrift.legacyQuestionSubtypesMissingRelativeToUi, ["GRAMMAR_CHOICE_COMBO"]);
eq("recorded legacy extra", binding.schemaAndUiDrift.legacyQuestionSubtypesExtraRelativeToUi, []);

const topicLegacy = binding.schemaAndUiDrift.classification.find((entry) => entry.typeId === "TOPIC_MAIN_IDEA");
check("TOPIC_MAIN_IDEA classification exists", Boolean(topicLegacy));
if (topicLegacy) {
  eq("TOPIC_MAIN_IDEA legacy compatibility status", topicLegacy.status, "LEGACY_SCHEMA_AND_FILTER_COMPATIBILITY_ONLY");
  eq("TOPIC_MAIN_IDEA excluded from new UI", topicLegacy.newGenerationUiEligible, false);
  eq("TOPIC_MAIN_IDEA excluded from calibration", topicLegacy.calibrationCanonicalEligible, false);
  eq("TOPIC_MAIN_IDEA no automatic rewrite", topicLegacy.automaticAliasRewriteAllowed, false);
  eq("TOPIC_MAIN_IDEA semantic successors", topicLegacy.semanticSuccessors, ["TOPIC", "MAIN_IDEA"]);
  check(
    "TOPIC_MAIN_IDEA explicit legacy-integrated source label",
    editConfigSource.text.includes('TOPIC_MAIN_IDEA: "주제 또는 요지 추론(레거시 통합형)."')
  );
}
const comboDrift = binding.schemaAndUiDrift.classification.find((entry) => entry.typeId === "GRAMMAR_CHOICE_COMBO");
check("GRAMMAR_CHOICE_COMBO classification exists", Boolean(comboDrift));
if (comboDrift) {
  eq("GRAMMAR_CHOICE_COMBO remains canonical", comboDrift.calibrationCanonicalEligible, true);
  eq("GRAMMAR_CHOICE_COMBO legacy constant drift", comboDrift.status, "CANONICAL_UI_AND_SCHEMA_LEGACY_CONSTANT_MISSING");
}

check(
  "page types imports QUESTION_TYPE_GROUPS",
  pageTypesSource.text.includes('import { QUESTION_TYPE_GROUPS } from "@/lib/question-type-ui"')
);
check(
  "EXAM_TYPE_GROUPS exact binding",
  pageTypesSource.text.includes("export const EXAM_TYPE_GROUPS = QUESTION_TYPE_GROUPS;")
);
check(
  "English generation panel consumes EXAM_TYPE_GROUPS",
  panelSource.text.includes("const panelTypeGroups = koPanel ? QUESTION_TYPE_GROUPS_KO : EXAM_TYPE_GROUPS;")
);
check(
  "route checks AI schema by question type",
  routeSource.text.includes("AI_QUESTION_SCHEMAS[questionType]")
);
check(
  "route checks structured schema by question type",
  routeSource.text.includes("QUESTION_SCHEMAS[questionType]")
);

eq("family count", binding.families.length, 8);
const familyIds = binding.families.map((family) => family.familyId);
eq("family IDs unique", new Set(familyIds).size, 8);
const mappedIds = binding.families.flatMap((family) => family.rotationOrder);
eq("mapped ID count", mappedIds.length, 23);
eq("mapped IDs unique", new Set(mappedIds).size, 23);
setEq("mapping exhaustive over canonical nonfocus", mappedIds, extractedNonfocus);
eq("mapping has no focus IDs", mappedIds.filter((id) => binding.canonicalUniverse.focusTypeIds.includes(id)), []);
eq("mapping has no legacy schema-only ID", mappedIds.filter((id) => id === "TOPIC_MAIN_IDEA"), []);
check("every family has at least two types", binding.families.every((family) => family.rotationOrder.length >= 2));

function selectedAt(family, epoch, holdout) {
  const offset = 2 * (epoch - 1) + (holdout ? 1 : 0);
  return family.rotationOrder[offset % family.rotationOrder.length];
}

const epoch1Main = binding.families.map((family) => selectedAt(family, 1, false));
const epoch1Holdout = binding.families.map((family) => selectedAt(family, 1, true));
const epoch1Combined = new Set([...epoch1Main, ...epoch1Holdout]);
eq("one main per family", epoch1Main.length, 8);
eq("one holdout per family", epoch1Holdout.length, 8);
eq("main and holdout differ within epoch", epoch1Main.filter((id, index) => id === epoch1Holdout[index]), []);
eq("single epoch distinct canonical count", epoch1Combined.size, 16);
eq("recorded single epoch count", binding.rotation.singleEpochDistinctCanonicalTypes, 16);
eq("single epoch all-type claim forbidden", binding.rotation.singleEpochAllTypeClaimAllowed, false);

const twoEpochCoverage = new Set();
for (let epoch = 1; epoch <= 2; epoch += 1) {
  for (const family of binding.families) {
    twoEpochCoverage.add(selectedAt(family, epoch, false));
    twoEpochCoverage.add(selectedAt(family, epoch, true));
  }
}
eq("two-epoch main plus holdout coverage", twoEpochCoverage.size, 23);
setEq("two-epoch coverage exact IDs", [...twoEpochCoverage], extractedNonfocus);
eq("recorded combined coverage epochs", binding.rotation.mainPlusHoldoutEpochsToTouchAll23, 2);

const fourEpochMainCoverage = new Set();
for (let epoch = 1; epoch <= 4; epoch += 1) {
  for (const family of binding.families) {
    fourEpochMainCoverage.add(family.rotationOrder[(epoch - 1) % family.rotationOrder.length]);
  }
}
eq("four-epoch main-only coverage", fourEpochMainCoverage.size, 23);
setEq("four-epoch main-only exact IDs", [...fourEpochMainCoverage], extractedNonfocus);
eq("recorded main-only coverage epochs", binding.rotation.mainOnlyEpochsToTouchAll23, 4);
eq("rotation failure does not advance", binding.rotation.failureDoesNotAdvanceRotation, true);
eq("rotation outcome-aware skipping forbidden", binding.rotation.outcomeAwareSkippingForbidden, true);
eq("pilot excluded from coverage", binding.rotation.pilotDoesNotCountTowardCoverage, true);

const priorPath = join(repo, binding.priorDesignMismatch.priorProtocolPath);
const prior = JSON.parse(readFileSync(priorPath, "utf8"));
const priorTypes = prior.nonfocusConstruct.families.flatMap((family) => family.logicalTypes);
const priorOnly = difference(priorTypes, extractedNonfocus);
const productionOnly = difference(extractedNonfocus, priorTypes);
const intersection = priorTypes.filter((id) => extractedNonfocus.includes(id));
eq("prior logical count", priorTypes.length, 23);
eq("prior logical unique", new Set(priorTypes).size, 23);
eq("prior exact intersection count", intersection.length, 9);
eq("prior-only mismatch IDs", priorOnly, binding.priorDesignMismatch.priorOnlyLogicalIds);
eq("production-only mismatch IDs", productionOnly, binding.priorDesignMismatch.productionOnlyCanonicalIds);
eq("design mismatch severity blocker", binding.priorDesignMismatch.severity, "BLOCKER");
eq("design mismatch code", binding.priorDesignMismatch.code, "PRIOR_V3_LOGICAL_UNIVERSE_NOT_PRODUCTION_BOUND");
eq("prior standalone issuance blocked", binding.priorDesignMismatch.standalonePriorProtocolIssuanceEligible, false);
eq("issuance repeats prior block", binding.issuance.priorProtocolStandaloneEligible, false);
eq("binding semantically valid", binding.issuance.thisBindingArtifactSemanticallyValid, true);

eq("UI semantic digest", semanticSha(binding.canonicalUniverse.uiTypeIdsInOrder), binding.semanticDigests.uiTypeIdsInOrderSha256);
eq("nonfocus semantic digest", semanticSha(binding.canonicalUniverse.nonfocusTypeIdsInUiOrder), binding.semanticDigests.nonfocusTypeIdsInUiOrderSha256);
eq("families semantic digest", semanticSha(binding.families), binding.semanticDigests.familiesSha256);
eq("drift semantic digest", semanticSha(binding.schemaAndUiDrift), binding.semanticDigests.schemaAndUiDriftSha256);
eq("rotation semantic digest", semanticSha(binding.rotation), binding.semanticDigests.rotationSha256);

if (existsSync(reportPath)) {
  const report = readFileSync(reportPath, "utf8");
  for (const phrase of [
    "25개",
    "23개",
    "TOPIC_MAIN_IDEA",
    "GRAMMAR_CHOICE_COMBO",
    "단일 epoch",
    "BLOCKER",
    "network/API/model/DB/secret/trusted-gold"
  ]) {
    check(`report contains ${phrase}`, report.includes(phrase));
  }
}

if (process.argv.includes("--check-manifest")) {
  check("manifest exists", existsSync(manifestPath));
  if (existsSync(manifestPath)) {
    const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    const expectedFiles = ["REPORT.md", "binding.json", "verify.mjs"];
    eq("manifest entry count", lines.length, expectedFiles.length);
    const parsed = new Map();
    for (const line of lines) {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
      check(`manifest line format ${line.slice(-24)}`, Boolean(match));
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
  schemaVersion: "reviewer-calibration-v3-production-type-binding-verification-1",
  status: failures.length === 0 ? "PASS_WITH_DECLARED_PRIOR_DESIGN_BLOCKER" : "FAIL_CLOSED",
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  extracted: {
    canonicalUiTypes: uiIds.length,
    focusTypes: binding.canonicalUniverse.focusTypeIds.length,
    canonicalNonfocusTypes: extractedNonfocus.length,
    structuredSchemaTypes: structuredSchemaIds.length,
    aiSchemaTypes: aiIds.length,
    filterTypes: filterIds.length,
    legacyConstantTypes: legacyIds.length,
    mappedFamilies: binding.families.length,
    mappedNonfocusTypes: mappedIds.length,
    priorExactIntersection: intersection.length,
    priorOnly: priorOnly.length,
    productionOnly: productionOnly.length
  },
  blocker: {
    code: binding.priorDesignMismatch.code,
    severity: binding.priorDesignMismatch.severity,
    priorProtocolStandaloneEligible: false,
    resolutionCondition: binding.priorDesignMismatch.resolutionCondition
  },
  activity: binding.freeze.activity,
  failures
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
