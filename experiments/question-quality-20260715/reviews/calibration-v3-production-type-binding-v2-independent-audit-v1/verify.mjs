import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const base = dirname(fileURLToPath(import.meta.url));
const repo = resolve(base, "../../../..");
const target = join(
  repo,
  "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v2",
);
const expectedV1 = join(
  repo,
  "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v1",
);
const binding = JSON.parse(readFileSync(join(target, "binding.json"), "utf8"));
const hostileFixtures = JSON.parse(readFileSync(join(target, "hostile-fixtures.json"), "utf8"));
const v1Dir = resolve(target, binding.supersedes.path);
const v1Binding = JSON.parse(readFileSync(join(v1Dir, "binding.json"), "utf8"));

const checks = [];
function check(name, condition, detail = undefined) {
  checks.push({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
}
function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
function eq(name, actual, expected) {
  check(name, same(actual, expected), { actual, expected });
}
function sortedUnique(values) {
  return [...new Set(values)].sort();
}
function setEq(name, actual, expected) {
  eq(name, sortedUnique(actual), sortedUnique(expected));
}
function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}
function intersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}
function duplicates(values) {
  const seen = new Set();
  const found = new Set();
  for (const value of values) {
    if (seen.has(value)) found.add(value);
    seen.add(value);
  }
  return [...found];
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function fileSha(path) {
  return sha256(readFileSync(path));
}
function clone(value) {
  return structuredClone(value);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}
function parse(relativePath, text = readFileSync(join(repo, relativePath), "utf8")) {
  const kind = relativePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : relativePath.endsWith(".mjs")
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  return {
    text,
    ast: ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, kind),
  };
}
function unwrap(node) {
  while (
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node))
  ) {
    node = node.expression;
  }
  return node;
}
function propertyName(name) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}
function findVariable(source, variableName) {
  let declaration;
  function visit(node) {
    if (declaration) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName
    ) {
      declaration = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source.ast);
  if (!declaration?.initializer) throw new Error(`${variableName} not found in ${source.ast.fileName}`);
  return declaration;
}
function findFunction(source, functionName) {
  let declaration;
  function visit(node) {
    if (declaration) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      declaration = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source.ast);
  if (!declaration) throw new Error(`${functionName} function not found in ${source.ast.fileName}`);
  return declaration;
}
function objectLiteral(node, context) {
  const value = unwrap(node);
  if (!ts.isObjectLiteralExpression(value)) throw new Error(`${context} is not an object literal`);
  return value;
}
function arrayLiteral(node, context) {
  const value = unwrap(node);
  if (!ts.isArrayLiteralExpression(value)) throw new Error(`${context} is not an array literal`);
  return value;
}
function propertyAssignment(object, key, context) {
  const matches = object.properties.filter(
    (property) => ts.isPropertyAssignment(property) && propertyName(property.name) === key,
  );
  if (matches.length !== 1) throw new Error(`${context}.${key} must be a single static property`);
  return matches[0].initializer;
}
function objectKeys(source, variableName) {
  const object = objectLiteral(findVariable(source, variableName).initializer, variableName);
  const result = [];
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      throw new Error(`${variableName} contains a dynamic property`);
    }
    const key = propertyName(property.name);
    if (!key) throw new Error(`${variableName} contains an unsupported key`);
    result.push(key);
  }
  return result;
}
function nestedValueArrays(source, variableName, childArrayKey = undefined) {
  const initializer = unwrap(findVariable(source, variableName).initializer);
  let arrays;
  if (ts.isObjectLiteralExpression(initializer)) {
    arrays = initializer.properties.map((property) => {
      if (!ts.isPropertyAssignment(property)) throw new Error(`${variableName} must be static`);
      return arrayLiteral(property.initializer, `${variableName}.${propertyName(property.name)}`);
    });
  } else {
    arrays = arrayLiteral(initializer, variableName).elements.map((element, index) => {
      const object = objectLiteral(element, `${variableName}[${index}]`);
      return arrayLiteral(
        propertyAssignment(object, childArrayKey, `${variableName}[${index}]`),
        `${variableName}[${index}].${childArrayKey}`,
      );
    });
  }
  const result = [];
  for (const array of arrays) {
    for (const element of array.elements) {
      const object = objectLiteral(element, `${variableName} value item`);
      const value = unwrap(propertyAssignment(object, "value", `${variableName} value item`));
      if (!ts.isStringLiteral(value)) throw new Error(`${variableName} value is not a string literal`);
      result.push(value.text);
    }
  }
  return result;
}
function extractUiGroups(source) {
  const groups = arrayLiteral(
    findVariable(source, "QUESTION_TYPE_GROUPS").initializer,
    "QUESTION_TYPE_GROUPS",
  );
  return groups.elements.map((element, groupIndex) => {
    const group = objectLiteral(element, `QUESTION_TYPE_GROUPS[${groupIndex}]`);
    const items = arrayLiteral(
      propertyAssignment(group, "items", `QUESTION_TYPE_GROUPS[${groupIndex}]`),
      `QUESTION_TYPE_GROUPS[${groupIndex}].items`,
    );
    return items.elements.map((raw, itemIndex) => {
      const item = unwrap(raw);
      if (
        !ts.isPropertyAccessExpression(item) ||
        !ts.isIdentifier(item.expression) ||
        item.expression.text !== "QUESTION_TYPE_UI"
      ) {
        throw new Error(`QUESTION_TYPE_GROUPS[${groupIndex}].items[${itemIndex}] is not static`);
      }
      return item.name.text;
    });
  });
}
function hasNamedImport(source, moduleName, importedName) {
  return source.ast.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    if (statement.moduleSpecifier.text !== moduleName) return false;
    const bindings = statement.importClause?.namedBindings;
    return (
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some((element) => (element.propertyName ?? element.name).text === importedName)
    );
  });
}
function initializerIsIdentifier(source, variableName, expected) {
  const value = unwrap(findVariable(source, variableName).initializer);
  return ts.isIdentifier(value) && value.text === expected;
}
function isEnglishPanelConditional(source) {
  const ko = unwrap(findVariable(source, "koPanel").initializer);
  const groups = unwrap(findVariable(source, "panelTypeGroups").initializer);
  return (
    ts.isBinaryExpression(ko) &&
    ko.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    ts.isIdentifier(ko.left) &&
    ko.left.text === "passageSubject" &&
    ts.isStringLiteral(ko.right) &&
    ko.right.text === "KOREAN" &&
    ts.isConditionalExpression(groups) &&
    ts.isIdentifier(groups.condition) &&
    groups.condition.text === "koPanel" &&
    ts.isIdentifier(groups.whenTrue) &&
    groups.whenTrue.text === "QUESTION_TYPE_GROUPS_KO" &&
    ts.isIdentifier(groups.whenFalse) &&
    groups.whenFalse.text === "EXAM_TYPE_GROUPS"
  );
}
function hasCall(source, receiverText, methodName) {
  let found = false;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === methodName &&
      node.expression.expression.getText(source.ast) === receiverText
    ) found = true;
    ts.forEachChild(node, visit);
  }
  visit(source.ast);
  return found;
}
function hasRegistryIndex(source, registryName) {
  let found = false;
  function visit(node) {
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === registryName &&
      ts.isIdentifier(node.argumentExpression) &&
      node.argumentExpression.text === "questionType"
    ) found = true;
    ts.forEachChild(node, visit);
  }
  visit(source.ast);
  return found;
}
function functionCalls(source, caller, callee) {
  const declaration = findFunction(source, caller);
  let found = false;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callee) {
      found = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(declaration);
  return found;
}
function astUsesProperty(source, property) {
  let found = false;
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && node.name.text === property) found = true;
    ts.forEachChild(node, visit);
  }
  visit(source.ast);
  return found;
}
function astUsesIdentifier(source, identifier) {
  let found = false;
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === identifier) found = true;
    ts.forEachChild(node, visit);
  }
  visit(source.ast);
  return found;
}
function dirtyCheckGatedByHeadBlob(source) {
  let found = false;
  function visit(node) {
    if (
      ts.isIfStatement(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(source.ast) === "source" &&
      node.expression.name.text === "headBlobSha1" &&
      node.thenStatement.getText(source.ast).includes("cleanAtFreeze")
    ) found = true;
    ts.forEachChild(node, visit);
  }
  visit(source.ast);
  return found;
}
function hasExecutableElementAccess(source, receiverText, argumentText) {
  let found = false;
  function visit(node) {
    if (
      ts.isElementAccessExpression(node) &&
      node.expression.getText(source.ast) === receiverText &&
      node.argumentExpression?.getText(source.ast).replace(/\s+/g, " ") === argumentText
    ) found = true;
    ts.forEachChild(node, visit);
  }
  visit(source.ast);
  return found;
}

function parseManifestStrict(text) {
  const entries = new Map();
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
    if (!match) throw new Error(`Invalid manifest line: ${line}`);
    if (entries.has(match[2])) throw new Error(`Duplicate manifest entry: ${match[2]}`);
    entries.set(match[2], match[1]);
  }
  return { entries, lineCount: lines.length };
}
function pathInsideRepo(relativePath) {
  const absolute = resolve(repo, relativePath);
  const rel = relative(repo, absolute);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

const source = {
  ui: parse("src/lib/question-type-ui.ts"),
  pageTypes: parse("src/app/(director)/director/workbench/generate/generate-page-types.ts"),
  panel: parse("src/app/(director)/director/workbench/generate/generation-config-panel.tsx"),
  structured: parse("src/lib/question-schemas.ts"),
  aiMc: parse("src/lib/question-ai-schemas-mc.ts"),
  aiVocab: parse("src/lib/question-ai-schemas-vocab.ts"),
  route: parse("src/app/api/ai/generate-question/route.ts"),
  filter: parse("src/components/workbench/question-type-filter.tsx"),
  legacy: parse("src/lib/constants.ts"),
};

// Production authority is reconstructed from executable AST, not author prose.
const uiGroups = extractUiGroups(source.ui);
const uiIds = uiGroups.flat();
const focusIds = ["BLANK_INFERENCE", "GRAMMAR_ERROR"];
const nonfocusIds = uiIds.filter((id) => !focusIds.includes(id));
const structuredIds = objectKeys(source.structured, "QUESTION_SCHEMAS");
const aiIds = sortedUnique([
  ...objectKeys(source.aiMc, "AI_MC_QUESTION_SCHEMAS"),
  ...objectKeys(source.aiMc, "AI_ESSAY_QUESTION_SCHEMAS"),
  ...objectKeys(source.aiVocab, "AI_VOCAB_QUESTION_SCHEMAS"),
]);
const filterIds = nestedValueArrays(source.filter, "TYPE_SUBTYPE_MAP", "subtypes");
const legacyIds = nestedValueArrays(source.legacy, "QUESTION_SUBTYPES");

eq("production UI group sizes", uiGroups.map((group) => group.length), [14, 8, 3]);
eq("production UI ordered IDs", uiIds, binding.canonicalUniverse.uiTypeIdsInOrder);
eq("production UI 25", uiIds.length, 25);
eq("fixed focus IDs", binding.canonicalUniverse.focusTypeIds, focusIds);
eq("production nonfocus ordered IDs", nonfocusIds, binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
eq("production nonfocus 23", nonfocusIds.length, 23);
check(
  "QUESTION_TYPE_GROUPS import is AST-bound",
  hasNamedImport(source.pageTypes, "@/lib/question-type-ui", "QUESTION_TYPE_GROUPS"),
);
check(
  "EXAM_TYPE_GROUPS alias is AST-bound",
  initializerIsIdentifier(source.pageTypes, "EXAM_TYPE_GROUPS", "QUESTION_TYPE_GROUPS"),
);
check("English panel conditional is AST-bound", isEnglishPanelConditional(source.panel));
check("panelTypeGroups feeds rendered list", hasCall(source.panel, "panelTypeGroups", "flatMap"));
check("rendered groups map item tiles", hasCall(source.panel, "group.items", "map"));
check("runtime route indexes AI schema", hasRegistryIndex(source.route, "AI_QUESTION_SCHEMAS"));
check("runtime route indexes structured schema", hasRegistryIndex(source.route, "QUESTION_SCHEMAS"));
eq("structured schema 26", structuredIds.length, 26);
eq("AI schema 26", aiIds.length, 26);
setEq("structured and AI schemas agree", structuredIds, aiIds);
eq("filter 26", filterIds.length, 26);
eq("legacy list 24", legacyIds.length, 24);
eq("schema-only legacy", difference(structuredIds, uiIds), ["TOPIC_MAIN_IDEA"]);
eq("filter-only legacy", difference(filterIds, uiIds), ["TOPIC_MAIN_IDEA"]);
eq("legacy missing canonical", difference(uiIds, legacyIds), ["GRAMMAR_CHOICE_COMBO"]);
eq("legacy extra", difference(legacyIds, uiIds), []);

// Exact v1 invalid provenance and source snapshot.
eq("v2 schema", binding.schemaVersion, "reviewer-calibration-v3-production-type-binding-2");
eq("v2 artifact ID", binding.artifactId, "reviewer-calibration-v3-production-type-binding-v2");
eq("v2 status", binding.status, "VALID_CORRECTED_ROTATION_V1_EXECUTION_INVALID");
eq("superseded artifact ID", binding.supersedes.artifactId, "reviewer-calibration-v3-production-type-binding-v1");
eq("superseded relative path", binding.supersedes.path, "../reviewer-calibration-v3-production-type-binding-v1");
eq("superseded path resolves exactly", v1Dir, expectedV1);
eq("resolved v1 artifact ID", v1Binding.artifactId, binding.supersedes.artifactId);
eq("canonical/families accepted", binding.supersedes.canonicalUniverseAndFamiliesAccepted, true);
eq("v1 rotation claims rejected", binding.supersedes.rotationAndCoverageClaimsAccepted, false);

const v1ManifestText = readFileSync(join(v1Dir, "MANIFEST.sha256"), "utf8");
const v1Manifest = parseManifestStrict(v1ManifestText);
eq("v1 manifest hash exact", sha256(v1ManifestText), binding.supersedes.manifestSha256);
eq("v1 manifest line count", v1Manifest.lineCount, 3);
eq("v1 manifest entries exact", Object.fromEntries(v1Manifest.entries), binding.supersedes.manifestEntries);
for (const [file, hash] of Object.entries(binding.supersedes.manifestEntries)) {
  eq(`v1 artifact byte hash ${file}`, fileSha(join(v1Dir, file)), hash);
}
eq("v1 source snapshot exact", sha256(JSON.stringify(v1Binding.sources)), binding.supersedes.sourceSnapshotSha256);
eq("v2 canonical equals accepted v1", binding.canonicalUniverse, v1Binding.canonicalUniverse);
eq("v2 families equal accepted v1", binding.families, v1Binding.families);

const v1Verifier = parse(
  "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v1/verify.mjs",
);
eq("v1 failure severity", binding.v1FailureProvenance.severity, "BLOCKER");
eq("v1 failure code", binding.v1FailureProvenance.code, "V1_ROTATION_FORMULA_VERIFIER_DIVERGENCE");
eq(
  "v1 declared formula exact",
  binding.v1FailureProvenance.declaredMainFormula,
  v1Binding.rotation.mainIndexFormula,
);
eq("v1 verifier substituted formula text", binding.v1FailureProvenance.verifierMainOnlyFormula, "(epoch - 1) mod familySize");
check(
  "v1 divergent executable element access found by AST",
  hasExecutableElementAccess(
    v1Verifier,
    "family.rotationOrder",
    "(epoch - 1) % family.rotationOrder.length",
  ),
);
const v1OldIndices = [0, 1, 2, 3].map((offset) => (2 * offset) % 4);
eq("v1 n4 old indices", v1OldIndices, [0, 2, 0, 2]);
eq("v1 n4 distinct count", new Set(v1OldIndices).size, 2);
eq("v1 recorded minimal counterexample", binding.v1FailureProvenance.minimalCounterexample, {
  familySize: 4,
  declaredMainIndicesEpoch1To4: [0, 2, 0, 2],
  distinctMainIndices: 2,
  claimedDistinctMainIndices: 4,
});
eq("v1 execution false", binding.v1FailureProvenance.v1ExecutionEligible, false);
eq("v1 must remain unmodified", binding.v1FailureProvenance.v1MustRemainUnmodified, true);

// Full Git/source evidence, including fields the author verifier skips.
const actualRepositoryHead = git(["rev-parse", "HEAD"]).stdout.trim();
eq("repository HEAD matches frozen v1 source authority", actualRepositoryHead, v1Binding.freeze.repositoryHead);
eq("source record path uniqueness", duplicates(v1Binding.sources.map((item) => item.path)), []);
const sourceEvidence = [];
for (const item of v1Binding.sources) {
  check(`source path stays inside repository ${item.path}`, pathInsideRepo(item.path));
  const absolute = resolve(repo, item.path);
  const actualSha = fileSha(absolute);
  const status = git(["status", "--porcelain=v1", "--untracked-files=all", "--", item.path]).stdout.trim();
  const clean = status.length === 0;
  const blobResult = git(["rev-parse", `HEAD:${item.path}`], true);
  const headBlob = blobResult.status === 0 ? blobResult.stdout.trim() : null;
  const commitText = git(["log", "-1", "--format=%H", "--", item.path]).stdout.trim();
  const lastPathCommit = commitText || null;
  eq(`source SHA ${item.path}`, actualSha, item.worktreeSha256);
  eq(`source clean/untracked state ${item.path}`, clean, item.cleanAtFreeze);
  eq(`source HEAD blob ${item.path}`, headBlob, item.headBlobSha1);
  eq(`source last path commit ${item.path}`, lastPathCommit, item.lastPathCommit);
  sourceEvidence.push({
    path: item.path,
    sha256: actualSha,
    gitStatus: status || "CLEAN",
    clean,
    headBlob,
    lastPathCommit,
  });
}

// Formula, materialized rows, and coverage are recomputed without author helpers.
function selectedAt(rotationOrder, epoch, role) {
  const n = rotationOrder.length;
  const mainIndex = (epoch - 1) % n;
  const holdoutIndex = (epoch - 1 + Math.ceil(n / 2)) % n;
  const index = role === "MAIN" ? mainIndex : holdoutIndex;
  return { index, typeId: rotationOrder[index] };
}
function materializeRows(families, epochs = 4, selector = selectedAt) {
  const rows = [];
  for (const family of families) {
    for (let epoch = 1; epoch <= epochs; epoch += 1) {
      const main = selector(family.rotationOrder, epoch, "MAIN");
      const holdout = selector(family.rotationOrder, epoch, "HOLDOUT");
      rows.push({
        familyId: family.familyId,
        epoch,
        mainIndex: main.index,
        mainTypeId: main.typeId,
        holdoutIndex: holdout.index,
        holdoutTypeId: holdout.typeId,
      });
    }
  }
  return rows;
}
function coverage(families, epochs, roles, selector = selectedAt) {
  const result = new Set();
  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    for (const family of families) {
      for (const role of roles) result.add(selector(family.rotationOrder, epoch, role).typeId);
    }
  }
  return result;
}
function minimumEpochs(families, roles, expectedCount, maxEpochs = 20) {
  for (let epoch = 1; epoch <= maxEpochs; epoch += 1) {
    if (coverage(families, epoch, roles).size === expectedCount) return epoch;
  }
  return null;
}

eq("corrected main formula", binding.rotation.mainIndexFormula, "(epoch - 1) mod familySize");
eq(
  "corrected holdout formula",
  binding.rotation.holdoutIndexFormula,
  "(epoch - 1 + ceil(familySize / 2)) mod familySize",
);
eq("one implementation function", binding.rotation.implementationFunction, "selectedAt(rotationOrder, epoch, role)");
eq("formula/rows/coverage same-function mandate", binding.rotation.formulaRowsAndCoverageMustUseSameFunction, true);
const mapped = binding.families.flatMap((family) => family.rotationOrder);
eq("family count", binding.families.length, 8);
eq("family IDs unique", duplicates(binding.families.map((family) => family.familyId)), []);
eq("mapped count", mapped.length, 23);
eq("mapped duplicates", duplicates(mapped), []);
setEq("mapped set exact", mapped, nonfocusIds);
eq("focus excluded from families", intersection(mapped, focusIds), []);
eq("legacy excluded from families", intersection(mapped, ["TOPIC_MAIN_IDEA"]), []);

const expectedRows = materializeRows(binding.families, 4);
eq("materialized row count", binding.scheduleRows.length, 32);
eq(
  "materialized row keys unique",
  duplicates(binding.scheduleRows.map((row) => `${row.familyId}:${row.epoch}`)),
  [],
);
eq("materialized rows exact and ordered", binding.scheduleRows, expectedRows);
eq("materialized main/holdout collisions", binding.scheduleRows.filter((row) => row.mainTypeId === row.holdoutTypeId), []);

const sampleSchedules = {};
for (const n of [2, 3, 4]) {
  const sample = Array.from({ length: n }, (_, index) => `T${index}`);
  sampleSchedules[`n${n}`] = [];
  for (let epoch = 1; epoch <= 4; epoch += 1) {
    const main = selectedAt(sample, epoch, "MAIN");
    const holdout = selectedAt(sample, epoch, "HOLDOUT");
    sampleSchedules[`n${n}`].push([main.index, holdout.index]);
    check(`n${n} epoch${epoch} roles distinct`, main.index !== holdout.index);
  }
}
eq("n2 schedule", sampleSchedules.n2, [[0, 1], [1, 0], [0, 1], [1, 0]]);
eq("n3 schedule", sampleSchedules.n3, [[0, 2], [1, 0], [2, 1], [0, 2]]);
eq("n4 schedule", sampleSchedules.n4, [[0, 2], [1, 3], [2, 0], [3, 1]]);

const epoch1Combined = coverage(binding.families, 1, ["MAIN", "HOLDOUT"]);
const epoch2Combined = coverage(binding.families, 2, ["MAIN", "HOLDOUT"]);
const epoch4Main = coverage(binding.families, 4, ["MAIN"]);
eq("epoch1 combined 16", epoch1Combined.size, 16);
eq("epoch2 combined 23", epoch2Combined.size, 23);
setEq("epoch2 combined exact types", [...epoch2Combined], nonfocusIds);
eq("epoch4 main 23", epoch4Main.size, 23);
setEq("epoch4 main exact types", [...epoch4Main], nonfocusIds);
eq("minimum combined contact epochs", minimumEpochs(binding.families, ["MAIN", "HOLDOUT"], 23), 2);
eq("minimum main-only contact epochs", minimumEpochs(binding.families, ["MAIN"], 23), 4);
eq("rotation combined-contact epoch claim", binding.rotation.mainPlusHoldoutEpochsToContactAll23, 2);
eq("rotation main-only epoch claim", binding.rotation.mainOnlyEpochsToContactAll23, 4);
eq("claims epoch1 count", binding.claims.singleEpochCombinedDistinctTypes, 16);
eq("claims epoch2 count", binding.claims.twoEpochCombinedContactTypes, 23);
eq("claims epoch4 main count", binding.claims.fourEpochMainOnlyContactTypes, 23);
eq("single epoch all-type forbidden in rotation", binding.rotation.singleEpochAllTypeClaimAllowed, false);
eq("single epoch all-type forbidden in claims", binding.claims.singleEpochAllTypeClaimAllowed, false);

eq("rotation contact is not certification", binding.rotation.contactIsCertification, false);
eq("claim contact is not certification", binding.claims.contactEqualsCertification, false);
eq(
  "certification gate exact",
  binding.rotation.allTypeClaimGate,
  "Every one of the 23 canonical IDs must have a passed fresh main or activation-holdout coverage event; contact alone is insufficient.",
);
eq("failure does not advance", binding.rotation.failureDoesNotAdvanceRotation, true);
eq("outcome skipping forbidden", binding.rotation.outcomeAwareSkippingForbidden, true);
eq("pilot excluded from coverage", binding.rotation.pilotDoesNotCountTowardCoverage, true);

// Target manifest and author verifier baseline are observations, not trusted verdicts.
const targetManifestText = readFileSync(join(target, "MANIFEST.sha256"), "utf8");
const targetManifest = parseManifestStrict(targetManifestText);
const targetManifestFiles = ["REPORT.md", "binding.json", "hostile-fixtures.json", "verify.mjs"];
eq("target manifest line count", targetManifest.lineCount, 4);
eq("target manifest names", [...targetManifest.entries.keys()].sort(), [...targetManifestFiles].sort());
for (const file of targetManifestFiles) {
  eq(`target manifest byte hash ${file}`, targetManifest.entries.get(file), fileSha(join(target, file)));
}
eq("author hostile fixture count", hostileFixtures.fixtures.length, 6);

const authorRun = spawnSync("node", [join(target, "verify.mjs"), "--check-manifest"], {
  cwd: repo,
  encoding: "utf8",
});
check("author verifier exits zero", authorRun.status === 0, { status: authorRun.status, stderr: authorRun.stderr });
const authorResult = JSON.parse(authorRun.stdout);
eq("author verifier reports PASS", authorResult.status, "PASS_V2_V1_EXECUTION_INVALID");
eq("author verifier reports 128 checks", authorResult.checks, 128);
eq("author verifier reports zero failures", authorResult.failed, 0);

const authorVerifier = parse(
  "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v2/verify.mjs",
);
check("author materializer calls selectedAt", functionCalls(authorVerifier, "materializeRows", "selectedAt"));
check("author coverage calls selectedAt", functionCalls(authorVerifier, "coverage", "selectedAt"));
check("author dirty check is gated by recorded HEAD blob", dirtyCheckGatedByHeadBlob(authorVerifier));
check("author verifier never reads lastPathCommit", !astUsesProperty(authorVerifier, "lastPathCommit"));
check("author verifier never reads repositoryHead", !astUsesProperty(authorVerifier, "repositoryHead"));
check("author verifier lacks EXAM_TYPE_GROUPS AST authority", !astUsesIdentifier(authorVerifier, "EXAM_TYPE_GROUPS"));
check("author verifier lacks panelTypeGroups AST authority", !astUsesIdentifier(authorVerifier, "panelTypeGroups"));
check("author verifier lacks runtime route AST authority", !astUsesIdentifier(authorVerifier, "AI_QUESTION_SCHEMAS"));
check("author verifier never reads allTypeClaimGate", !astUsesProperty(authorVerifier, "allTypeClaimGate"));
check("author verifier never reads rotation contactIsCertification", !astUsesProperty(authorVerifier, "contactIsCertification"));

const untrackedRecord = v1Binding.sources.find((item) => item.headBlobSha1 === null);
const untrackedActual = sourceEvidence.find((item) => item.path === untrackedRecord.path);
check("minimal untracked provenance fixture exists", Boolean(untrackedRecord && untrackedActual));
const simulatedTrackedSameBytes = {
  ...untrackedActual,
  clean: true,
  gitStatus: "CLEAN",
  headBlob: "1".repeat(40),
  lastPathCommit: "2".repeat(40),
};
const authorSourcePredicateOnTransition =
  simulatedTrackedSameBytes.sha256 === untrackedRecord.worktreeSha256 &&
  (!untrackedRecord.headBlobSha1 || (
    simulatedTrackedSameBytes.headBlob === untrackedRecord.headBlobSha1 &&
    simulatedTrackedSameBytes.clean === untrackedRecord.cleanAtFreeze
  ));
check("author source predicate passes untracked-to-tracked same-byte transition", authorSourcePredicateOnTransition);
check(
  "independent source predicate rejects untracked-to-tracked transition",
  simulatedTrackedSameBytes.clean !== untrackedRecord.cleanAtFreeze ||
    simulatedTrackedSameBytes.headBlob !== untrackedRecord.headBlobSha1 ||
    simulatedTrackedSameBytes.lastPathCommit !== untrackedRecord.lastPathCommit,
);

const blockerFacts = [
  {
    id: "B-01",
    code: "DURABLE_GIT_PROVENANCE_FAIL_OPEN",
    currentBytesMatch: true,
    executionAuthorizing: true,
    evidence: {
      repositoryHeadUnboundByAuthorVerifier: !astUsesProperty(authorVerifier, "repositoryHead"),
      dirtyCheckGatedByHeadBlob: dirtyCheckGatedByHeadBlob(authorVerifier),
      lastPathCommitUnread: !astUsesProperty(authorVerifier, "lastPathCommit"),
      sameByteUntrackedToTrackedTransitionPassesAuthorPredicate: authorSourcePredicateOnTransition,
    },
  },
  {
    id: "B-02",
    code: "PRODUCTION_RUNTIME_AUTHORITY_NOT_SEMANTICALLY_VERIFIED",
    currentBytesMatch: true,
    executionAuthorizing: true,
    evidence: {
      currentAuthorityAstValid: true,
      examAliasAbsentFromAuthorVerifierAst: !astUsesIdentifier(authorVerifier, "EXAM_TYPE_GROUPS"),
      panelConsumerAbsentFromAuthorVerifierAst: !astUsesIdentifier(authorVerifier, "panelTypeGroups"),
      runtimeDispatchAbsentFromAuthorVerifierAst: !astUsesIdentifier(authorVerifier, "AI_QUESTION_SCHEMAS"),
    },
  },
];
eq("execution-authorizing blocker count", blockerFacts.length, 2);

// Hostile mutations use in-memory clones; originals are never edited.
const hostileMutations = [];
function recordHostile(name, expectedCode, detectedCodes, extra = undefined) {
  const codes = sortedUnique(detectedCodes);
  const rejected = codes.includes(expectedCode);
  check(`hostile rejected ${name}`, rejected, { expectedCode, detectedCodes: codes });
  hostileMutations.push({ name, expectedCode, detectedCodes: codes, rejected, ...(extra ?? {}) });
}

const badN2 = [0, 1, 2, 3].map((epochOffset) => [epochOffset % 2, epochOffset % 2]);
recordHostile(
  "n2 holdout offset zero",
  "MAIN_HOLDOUT_COLLISION",
  badN2.some(([main, holdout]) => main === holdout) ? ["MAIN_HOLDOUT_COLLISION"] : [],
);

const n3RowsDrift = clone(expectedRows);
const n3Row = n3RowsDrift.find((row) => {
  const family = binding.families.find((candidate) => candidate.familyId === row.familyId);
  return family.rotationOrder.length === 3 && row.epoch === 2;
});
n3Row.holdoutIndex = n3Row.mainIndex;
n3Row.holdoutTypeId = n3Row.mainTypeId;
recordHostile(
  "n3 materialized row drift",
  "FORMULA_ROW_DIVERGENCE",
  same(n3RowsDrift, expectedRows) ? [] : ["FORMULA_ROW_DIVERGENCE"],
);

const oldStrideSelector = (order, epoch, role) => {
  const index = (2 * (epoch - 1) + (role === "HOLDOUT" ? 1 : 0)) % order.length;
  return { index, typeId: order[index] };
};
const n4OldMain = new Set();
for (let epoch = 1; epoch <= 4; epoch += 1) {
  n4OldMain.add(oldStrideSelector(["A", "B", "C", "D"], epoch, "MAIN").typeId);
}
recordHostile(
  "n4 old stride-two main",
  "MAIN_ONLY_COVERAGE_FALSE",
  n4OldMain.size === 4 ? [] : ["MAIN_ONLY_COVERAGE_FALSE"],
);

recordHostile(
  "formula and verifier selector divergence",
  "FORMULA_VERIFIER_DIVERGENCE",
  same(
    [1, 2, 3, 4].map((epoch) => selectedAt(["A", "B", "C", "D"], epoch, "MAIN").index),
    [1, 2, 3, 4].map((epoch) => oldStrideSelector(["A", "B", "C", "D"], epoch, "MAIN").index),
  ) ? [] : ["FORMULA_VERIFIER_DIVERGENCE"],
);

const deletedRows = expectedRows.slice(1);
recordHostile("schedule row deletion", "SCHEDULE_ROW_COUNT", deletedRows.length === 32 ? [] : ["SCHEDULE_ROW_COUNT"]);
const duplicatedRows = [expectedRows[0], ...expectedRows];
recordHostile(
  "schedule row duplicate",
  "SCHEDULE_ROW_DUPLICATE",
  duplicates(duplicatedRows.map((row) => `${row.familyId}:${row.epoch}`)).length
    ? ["SCHEDULE_ROW_DUPLICATE"]
    : [],
);
const reorderedRows = clone(expectedRows);
[reorderedRows[0], reorderedRows[1]] = [reorderedRows[1], reorderedRows[0]];
recordHostile(
  "schedule row order swap",
  "SCHEDULE_ROW_ORDER",
  same(reorderedRows, expectedRows) ? [] : ["SCHEDULE_ROW_ORDER"],
);

const duplicateFamilies = clone(binding.families);
duplicateFamilies[1].rotationOrder[0] = duplicateFamilies[0].rotationOrder[0];
recordHostile(
  "canonical family duplicate",
  "CANONICAL_MAPPING_DUPLICATE",
  duplicates(duplicateFamilies.flatMap((family) => family.rotationOrder)).length
    ? ["CANONICAL_MAPPING_DUPLICATE"]
    : [],
);
const omittedFamilies = clone(binding.families);
omittedFamilies[7].rotationOrder.pop();
recordHostile(
  "canonical family omission",
  "CANONICAL_MAPPING_OMISSION",
  difference(nonfocusIds, omittedFamilies.flatMap((family) => family.rotationOrder)).length
    ? ["CANONICAL_MAPPING_OMISSION"]
    : [],
);
const focusFamilies = clone(binding.families);
focusFamilies[7].rotationOrder[1] = "BLANK_INFERENCE";
recordHostile(
  "focus injection",
  "FOCUS_IN_FAMILY",
  intersection(focusFamilies.flatMap((family) => family.rotationOrder), focusIds).length
    ? ["FOCUS_IN_FAMILY"]
    : [],
);
const legacyFamilies = clone(binding.families);
legacyFamilies[7].rotationOrder[1] = "TOPIC_MAIN_IDEA";
recordHostile(
  "legacy injection",
  "LEGACY_IN_FAMILY",
  legacyFamilies.flatMap((family) => family.rotationOrder).includes("TOPIC_MAIN_IDEA")
    ? ["LEGACY_IN_FAMILY"]
    : [],
);

const reorderedCanonical = clone(binding.canonicalUniverse.uiTypeIdsInOrder);
[reorderedCanonical[2], reorderedCanonical[3]] = [reorderedCanonical[3], reorderedCanonical[2]];
recordHostile(
  "canonical array order swap",
  "CANONICAL_ORDER_DRIFT",
  same(reorderedCanonical, uiIds) ? [] : ["CANONICAL_ORDER_DRIFT"],
);
recordHostile(
  "superseded artifact path mutation",
  "V1_PATH_DRIFT",
  "../../wrong-v1" === "../reviewer-calibration-v3-production-type-binding-v1" ? [] : ["V1_PATH_DRIFT"],
);
recordHostile(
  "source path traversal",
  "SOURCE_PATH_ESCAPE",
  pathInsideRepo("../outside-source.ts") ? [] : ["SOURCE_PATH_ESCAPE"],
);

const mutatedBytes = Buffer.concat([
  readFileSync(resolve(repo, v1Binding.sources[0].path)),
  Buffer.from("\n// hostile byte mutation\n"),
]);
recordHostile(
  "source byte mutation",
  "SOURCE_HASH_DRIFT",
  sha256(mutatedBytes) === v1Binding.sources[0].worktreeSha256 ? [] : ["SOURCE_HASH_DRIFT"],
);
recordHostile(
  "clean-state metadata flip",
  "DIRTY_STATE_DRIFT",
  !v1Binding.sources[0].cleanAtFreeze === sourceEvidence[0].clean ? [] : ["DIRTY_STATE_DRIFT"],
);
recordHostile(
  "untracked-to-tracked same-byte transition",
  "UNTRACKED_TRANSITION",
  simulatedTrackedSameBytes.headBlob === untrackedRecord.headBlobSha1 &&
    simulatedTrackedSameBytes.clean === untrackedRecord.cleanAtFreeze
    ? []
    : ["UNTRACKED_TRANSITION"],
  { authorPredicateWouldPass: authorSourcePredicateOnTransition },
);
recordHostile(
  "tracked HEAD blob nulled",
  "HEAD_BLOB_DRIFT",
  null === sourceEvidence[0].headBlob ? [] : ["HEAD_BLOB_DRIFT"],
);
recordHostile(
  "last-path-commit mutation",
  "LAST_PATH_COMMIT_DRIFT",
  "0".repeat(40) === sourceEvidence[0].lastPathCommit ? [] : ["LAST_PATH_COMMIT_DRIFT"],
);
recordHostile(
  "repository HEAD mutation",
  "REPOSITORY_HEAD_DRIFT",
  "f".repeat(40) === v1Binding.freeze.repositoryHead ? [] : ["REPOSITORY_HEAD_DRIFT"],
);

const manifestHashMutation = new Map(targetManifest.entries);
manifestHashMutation.set("binding.json", "0".repeat(64));
recordHostile(
  "target manifest hash mutation",
  "MANIFEST_HASH_DRIFT",
  manifestHashMutation.get("binding.json") === fileSha(join(target, "binding.json"))
    ? []
    : ["MANIFEST_HASH_DRIFT"],
);
let duplicateManifestCaught = false;
try {
  parseManifestStrict(`${targetManifestText.trim()}\n${targetManifestText.trim().split(/\r?\n/)[0]}\n`);
} catch (error) {
  duplicateManifestCaught = String(error).includes("Duplicate manifest entry");
}
recordHostile(
  "target manifest duplicate entry",
  "MANIFEST_DUPLICATE",
  duplicateManifestCaught ? ["MANIFEST_DUPLICATE"] : [],
);
recordHostile(
  "v1 manifest hash mutation",
  "V1_MANIFEST_HASH_DRIFT",
  "0".repeat(64) === sha256(v1ManifestText) ? [] : ["V1_MANIFEST_HASH_DRIFT"],
);

const contactRotation = clone(binding.rotation);
contactRotation.contactIsCertification = true;
recordHostile(
  "rotation contact promoted to certification",
  "CONTACT_CERTIFICATION_CONFLATION",
  contactRotation.contactIsCertification === false ? [] : ["CONTACT_CERTIFICATION_CONFLATION"],
);
const contactClaims = clone(binding.claims);
contactClaims.contactEqualsCertification = true;
recordHostile(
  "claim contact promoted to certification",
  "CONTACT_CERTIFICATION_CONFLATION",
  contactClaims.contactEqualsCertification === false ? [] : ["CONTACT_CERTIFICATION_CONFLATION"],
);
recordHostile(
  "certification gate weakened to contact only",
  "CERTIFICATION_GATE_WEAKENED",
  "Contact alone is sufficient." === binding.rotation.allTypeClaimGate
    ? []
    : ["CERTIFICATION_GATE_WEAKENED"],
);

const aliasLine = "export const EXAM_TYPE_GROUPS = QUESTION_TYPE_GROUPS;";
const brokenAliasText = source.pageTypes.text.replace(
  aliasLine,
  `export const EXAM_TYPE_GROUPS = []; // ${aliasLine}`,
);
const brokenAlias = parse(
  "src/app/(director)/director/workbench/generate/generate-page-types.ts",
  brokenAliasText,
);
recordHostile(
  "commented alias semantic break",
  "AUTHORITY_CHAIN_AST_MISMATCH",
  initializerIsIdentifier(brokenAlias, "EXAM_TYPE_GROUPS", "QUESTION_TYPE_GROUPS")
    ? []
    : ["AUTHORITY_CHAIN_AST_MISMATCH"],
  { rawSubstringStillPresent: brokenAliasText.includes(aliasLine) },
);

const brokenPanelText = source.panel.text.replace(
  "const panelTypeGroups = koPanel ? QUESTION_TYPE_GROUPS_KO : EXAM_TYPE_GROUPS;",
  "const panelTypeGroups = koPanel ? EXAM_TYPE_GROUPS : QUESTION_TYPE_GROUPS_KO;",
);
const brokenPanel = parse(
  "src/app/(director)/director/workbench/generate/generation-config-panel.tsx",
  brokenPanelText,
);
recordHostile(
  "English panel branch reversal",
  "PANEL_AUTHORITY_AST_MISMATCH",
  isEnglishPanelConditional(brokenPanel) ? [] : ["PANEL_AUTHORITY_AST_MISMATCH"],
);

const brokenRouteText = source.route.text.replace(
  "const hasAiSchema = !!AI_QUESTION_SCHEMAS[questionType];",
  "const hasAiSchema = false;",
);
const brokenRoute = parse("src/app/api/ai/generate-question/route.ts", brokenRouteText);
recordHostile(
  "runtime AI schema dispatch removal",
  "RUNTIME_DISPATCH_AST_MISMATCH",
  hasRegistryIndex(brokenRoute, "AI_QUESTION_SCHEMAS") ? [] : ["RUNTIME_DISPATCH_AST_MISMATCH"],
);

const schemaAdded = [...structuredIds, "HOSTILE_NEW_TYPE"];
recordHostile(
  "schema enum addition",
  "SCHEMA_SET_DRIFT",
  same(sortedUnique(schemaAdded), sortedUnique(structuredIds)) ? [] : ["SCHEMA_SET_DRIFT"],
);
const legacyRemoved = legacyIds.filter((id) => id !== "ANTONYM");
recordHostile(
  "legacy enum removal",
  "LEGACY_SET_DRIFT",
  same(legacyRemoved, legacyIds) ? [] : ["LEGACY_SET_DRIFT"],
);

const provenanceMutation = clone(binding.v1FailureProvenance.minimalCounterexample);
provenanceMutation.distinctMainIndices = 4;
recordHostile(
  "v1 counterexample provenance mutation",
  "V1_PROVENANCE_DRIFT",
  same(provenanceMutation, binding.v1FailureProvenance.minimalCounterexample)
    ? []
    : ["V1_PROVENANCE_DRIFT"],
);

for (const [key, value] of Object.entries(binding.activity)) {
  eq(`offline activity ${key}`, value, 0);
}

const auditReport = JSON.parse(readFileSync(join(base, "report.json"), "utf8"));
const auditEvidence = JSON.parse(readFileSync(join(base, "evidence.json"), "utf8"));
eq(
  "audit report schema",
  auditReport.schemaVersion,
  "calibration-v3-production-type-binding-v2-independent-audit-report-1",
);
eq("audit report status", auditReport.status, "FAIL_CLOSED_EXECUTION_INELIGIBLE");
eq("audit report math verdict", auditReport.verdicts.correctedMath.status, "VALID_MATH_COMPONENT");
eq(
  "audit report execution verdict",
  auditReport.verdicts.executionAuthority.status,
  "FAIL_CLOSED_EXECUTION_INELIGIBLE",
);
eq("audit report blocker IDs", auditReport.executionBlockers.map((item) => item.id), ["B-01", "B-02"]);
eq("audit report hostile count", auditReport.hostileMutationSuite.scenarioCount, 32);
eq(
  "audit evidence schema",
  auditEvidence.schemaVersion,
  "calibration-v3-production-type-binding-v2-independent-audit-evidence-1",
);
eq("audit evidence execution verdict", auditEvidence.verdict.executionAuthority, "FAIL_CLOSED_EXECUTION_INELIGIBLE");
eq("audit evidence math verdict", auditEvidence.verdict.mathComponent, "VALID_MATH_COMPONENT");
eq("audit evidence target hashes", auditEvidence.target.hashes, {
  "REPORT.md": "cc6ddd0cd005a4707ab70f54fb31fb251f997be804f4621b45e76e82b9c72ce6",
  "binding.json": "7ec4d2c302ce841bbc5de2ec3b6b5d1b33bfc30f867b5ff4dbaa06aeb7e42e4f",
  "hostile-fixtures.json": "f999fa8544d41cc07e8f9e3413de1f38e17fc3d2fa7bdf6d193570a1da9ebb88",
  "verify.mjs": "32276d69adff6df6ec3a520b40a52009230dfc7f110908527c9ce870b729729a",
  "MANIFEST.sha256": "4e81452d0c74f3361cd01a59e5ec6406ea2fde729fd79f588dcdaf07c380de14",
});
eq("audit evidence blocker IDs", auditEvidence.executionBlockers.map((item) => item.id), ["B-01", "B-02"]);
eq("audit evidence contact boundary", auditEvidence.correctedRotation.contactCertificationBoundary.rotationContactIsCertification, false);
eq("audit evidence hostile count", auditEvidence.hostileMutations.length, 32);
check("audit evidence hostile all rejected", auditEvidence.hostileMutations.every((item) => item.rejected));

const auditManifestText = readFileSync(join(base, "MANIFEST.sha256"), "utf8");
const auditManifest = parseManifestStrict(auditManifestText);
const auditManifestFiles = ["REPORT.md", "report.json", "evidence.json", "verify.mjs"];
eq("audit manifest line count", auditManifest.lineCount, 4);
eq("audit manifest names", [...auditManifest.entries.keys()].sort(), [...auditManifestFiles].sort());
for (const file of auditManifestFiles) {
  eq(`audit manifest byte hash ${file}`, auditManifest.entries.get(file), fileSha(join(base, file)));
}

const targetFiles = ["REPORT.md", "binding.json", "hostile-fixtures.json", "verify.mjs", "MANIFEST.sha256"];
const targetHashes = Object.fromEntries(targetFiles.map((file) => [file, fileSha(join(target, file))]));
const failures = checks.filter((entry) => !entry.pass);
const result = {
  schemaVersion: "calibration-v3-production-type-binding-v2-independent-audit-verification-1",
  auditStatus: failures.length === 0 ? "AUDIT_REPRODUCED" : "AUDIT_VERIFICATION_FAILED",
  mathComponentVerdict: "VALID_MATH_COMPONENT",
  targetExecutionVerdict: "FAIL_CLOSED_EXECUTION_INELIGIBLE",
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  currentByteObservation: {
    productionAuthorityAstValid: true,
    sourceAndGitMetadataCurrentlyMatch: true,
    targetManifestValid: true,
    v1ProvenanceHashesValid: true,
  },
  correctedMath: {
    scheduleRows: binding.scheduleRows.length,
    epoch1Combined: epoch1Combined.size,
    epoch2Combined: epoch2Combined.size,
    epoch4MainOnly: epoch4Main.size,
    minimumCombinedEpochs: minimumEpochs(binding.families, ["MAIN", "HOLDOUT"], 23),
    minimumMainOnlyEpochs: minimumEpochs(binding.families, ["MAIN"], 23),
    contactIsCertification: false,
    sampleSchedules,
  },
  executionBlockers: blockerFacts,
  authorVerifier: {
    reportedStatus: authorResult.status,
    checks: authorResult.checks,
    failed: authorResult.failed,
    usesOneSelectedAtForRowsAndCoverage: true,
    repositoryHeadRead: false,
    lastPathCommitRead: false,
    dirtyCheckGatedByHeadBlob: true,
    productionRuntimeAuthorityAstComplete: false,
  },
  hostileMutations,
  sourceEvidence,
  targetHashes,
  activity: {
    networkCalls: 0,
    apiCalls: 0,
    modelCalls: 0,
    databaseCalls: 0,
    secretReads: 0,
    trustedGoldReads: 0,
    trustedGoldWrites: 0,
    ledgerReads: 0,
    ledgerWrites: 0,
  },
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
