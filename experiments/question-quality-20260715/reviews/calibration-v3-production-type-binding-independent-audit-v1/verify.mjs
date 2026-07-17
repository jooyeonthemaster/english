import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const base = dirname(fileURLToPath(import.meta.url));
const repo = resolve(base, "../../../..");
const target = join(
  repo,
  "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v1",
);
const binding = JSON.parse(readFileSync(join(target, "binding.json"), "utf8"));
const prior = JSON.parse(
  readFileSync(join(repo, binding.priorDesignMismatch.priorProtocolPath), "utf8"),
);

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
function findVariable(ast, variableName) {
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
  visit(ast);
  if (!declaration?.initializer) {
    throw new Error(`Variable ${variableName} not found in ${ast.fileName}`);
  }
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
  const hits = object.properties.filter(
    (property) => ts.isPropertyAssignment(property) && propertyName(property.name) === key,
  );
  if (hits.length !== 1) throw new Error(`${context}.${key} must have one property assignment`);
  return hits[0].initializer;
}
function objectKeys(source, variableName) {
  const object = objectLiteral(findVariable(source.ast, variableName).initializer, variableName);
  const keys = [];
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      throw new Error(`${variableName} contains a non-static property`);
    }
    const key = propertyName(property.name);
    if (!key) throw new Error(`${variableName} contains an unsupported key`);
    keys.push(key);
  }
  return keys;
}
function nestedValueArrays(source, variableName, childArrayKey = undefined) {
  const initializer = unwrap(findVariable(source.ast, variableName).initializer);
  const containers = ts.isObjectLiteralExpression(initializer)
    ? initializer.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) throw new Error(`${variableName} must be static`);
        return arrayLiteral(property.initializer, `${variableName}.${propertyName(property.name)}`);
      })
    : arrayLiteral(initializer, variableName).elements.map((element, index) => {
        const object = objectLiteral(element, `${variableName}[${index}]`);
        return childArrayKey
          ? arrayLiteral(propertyAssignment(object, childArrayKey, `${variableName}[${index}]`), childArrayKey)
          : arrayLiteral(element, `${variableName}[${index}]`);
      });
  const ids = [];
  for (const container of containers) {
    for (const element of container.elements) {
      const object = objectLiteral(element, `${variableName} value item`);
      const value = unwrap(propertyAssignment(object, "value", `${variableName} value item`));
      if (!ts.isStringLiteral(value)) throw new Error(`${variableName} value is not a string literal`);
      ids.push(value.text);
    }
  }
  return ids;
}
function extractUiGroups(source) {
  const groups = arrayLiteral(
    findVariable(source.ast, "QUESTION_TYPE_GROUPS").initializer,
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
        throw new Error(`QUESTION_TYPE_GROUPS[${groupIndex}].items[${itemIndex}] is dynamic`);
      }
      return item.name.text;
    });
  });
}
function stringProperty(source, variableName, objectKey, nestedKey = undefined) {
  const root = objectLiteral(findVariable(source.ast, variableName).initializer, variableName);
  const member = objectLiteral(propertyAssignment(root, objectKey, variableName), `${variableName}.${objectKey}`);
  const value = unwrap(
    propertyAssignment(member, nestedKey ?? objectKey, `${variableName}.${objectKey}`),
  );
  if (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) {
    throw new Error(`${variableName}.${objectKey}.${nestedKey} is not a literal`);
  }
  return value.text;
}
function flatStringProperty(source, variableName, objectKey) {
  const root = objectLiteral(findVariable(source.ast, variableName).initializer, variableName);
  const value = unwrap(propertyAssignment(root, objectKey, variableName));
  if (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) {
    throw new Error(`${variableName}.${objectKey} is not a literal`);
  }
  return value.text;
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
  const value = unwrap(findVariable(source.ast, variableName).initializer);
  return ts.isIdentifier(value) && value.text === expected;
}
function isEnglishPanelConditional(source) {
  const ko = unwrap(findVariable(source.ast, "koPanel").initializer);
  const groups = unwrap(findVariable(source.ast, "panelTypeGroups").initializer);
  const koExact =
    ts.isBinaryExpression(ko) &&
    ko.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    ts.isIdentifier(ko.left) &&
    ko.left.text === "passageSubject" &&
    ts.isStringLiteral(ko.right) &&
    ko.right.text === "KOREAN";
  const groupsExact =
    ts.isConditionalExpression(groups) &&
    ts.isIdentifier(groups.condition) &&
    groups.condition.text === "koPanel" &&
    ts.isIdentifier(groups.whenTrue) &&
    groups.whenTrue.text === "QUESTION_TYPE_GROUPS_KO" &&
    ts.isIdentifier(groups.whenFalse) &&
    groups.whenFalse.text === "EXAM_TYPE_GROUPS";
  return koExact && groupsExact;
}
function hasCall(source, receiverText, methodName) {
  let found = false;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === methodName &&
      node.expression.expression.getText(source.ast) === receiverText
    ) {
      found = true;
    }
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
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(source.ast);
  return found;
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
  editConfig: parse("src/lib/question-ai-edit/type-edit-config.ts"),
};

const uiGroups = extractUiGroups(source.ui);
const uiIds = uiGroups.flat();
const focusIds = ["BLANK_INFERENCE", "GRAMMAR_ERROR"];
const nonfocusIds = uiIds.filter((id) => !focusIds.includes(id));
const uiMetaIds = objectKeys(source.ui, "QUESTION_TYPE_UI");
const structuredIds = objectKeys(source.structured, "QUESTION_SCHEMAS");
const aiMcIds = objectKeys(source.aiMc, "AI_MC_QUESTION_SCHEMAS");
const aiEssayIds = objectKeys(source.aiMc, "AI_ESSAY_QUESTION_SCHEMAS");
const aiVocabIds = objectKeys(source.aiVocab, "AI_VOCAB_QUESTION_SCHEMAS");
const aiIds = sortedUnique([...aiMcIds, ...aiEssayIds, ...aiVocabIds]);
const filterIds = nestedValueArrays(source.filter, "TYPE_SUBTYPE_MAP", "subtypes");
const legacyIds = nestedValueArrays(source.legacy, "QUESTION_SUBTYPES");

eq("production UI group sizes", uiGroups.map((group) => group.length), [14, 8, 3]);
eq("production UI ordered 25", uiIds, binding.canonicalUniverse.uiTypeIdsInOrder);
eq("production UI count", uiIds.length, 25);
eq("production UI unique count", new Set(uiIds).size, 25);
eq("fixed focus two", binding.canonicalUniverse.focusTypeIds, focusIds);
eq("production nonfocus ordered 23", nonfocusIds, binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
eq("production nonfocus count", nonfocusIds.length, 23);

check(
  "QUESTION_TYPE_GROUPS imported by alias module via AST",
  hasNamedImport(source.pageTypes, "@/lib/question-type-ui", "QUESTION_TYPE_GROUPS"),
);
check(
  "EXAM_TYPE_GROUPS is exact identifier alias via AST",
  initializerIsIdentifier(source.pageTypes, "EXAM_TYPE_GROUPS", "QUESTION_TYPE_GROUPS"),
);
check("English panel branch is exact via AST", isEnglishPanelConditional(source.panel));
check("panelTypeGroups feeds allTypeItems flatMap", hasCall(source.panel, "panelTypeGroups", "flatMap"));
check("rendered groups iterate group.items", hasCall(source.panel, "group.items", "map"));

eq("structured schema count", structuredIds.length, 26);
eq("AI schema count", aiIds.length, 26);
eq("filter count", filterIds.length, 26);
eq("legacy constant count", legacyIds.length, 24);
setEq("structured and AI schemas", structuredIds, aiIds);
setEq("UI metadata and schemas", uiMetaIds, structuredIds);
eq("schema-only relative to UI", difference(structuredIds, uiIds), ["TOPIC_MAIN_IDEA"]);
eq("filter-only relative to UI", difference(filterIds, uiIds), ["TOPIC_MAIN_IDEA"]);
eq("legacy missing relative to UI", difference(uiIds, legacyIds), ["GRAMMAR_CHOICE_COMBO"]);
eq("legacy extra relative to UI", difference(legacyIds, uiIds), []);
check("route indexes AI registry via AST", hasRegistryIndex(source.route, "AI_QUESTION_SCHEMAS"));
check("route indexes structured registry via AST", hasRegistryIndex(source.route, "QUESTION_SCHEMAS"));

const topicMetaDescription = stringProperty(
  source.structured,
  "QUESTION_TYPE_META",
  "TOPIC_MAIN_IDEA",
  "description",
);
const topicTagline = flatStringProperty(source.editConfig, "TYPE_TAGLINES", "TOPIC_MAIN_IDEA");
check("structured metadata explicitly says legacy", topicMetaDescription.includes("레거시"));
check("edit config explicitly says legacy integrated", topicTagline.includes("레거시 통합형"));
const topicClass = binding.schemaAndUiDrift.classification.find(
  (entry) => entry.typeId === "TOPIC_MAIN_IDEA",
);
const comboClass = binding.schemaAndUiDrift.classification.find(
  (entry) => entry.typeId === "GRAMMAR_CHOICE_COMBO",
);
eq("classification entry count", binding.schemaAndUiDrift.classification.length, 2);
eq("legacy classification exact status", topicClass?.status, "LEGACY_SCHEMA_AND_FILTER_COMPATIBILITY_ONLY");
eq("legacy UI eligibility", topicClass?.newGenerationUiEligible, false);
eq("legacy calibration eligibility", topicClass?.calibrationCanonicalEligible, false);
eq("legacy rewrite forbidden", topicClass?.automaticAliasRewriteAllowed, false);
eq("legacy semantic successors", topicClass?.semanticSuccessors, ["TOPIC", "MAIN_IDEA"]);
eq("combo drift status", comboClass?.status, "CANONICAL_UI_AND_SCHEMA_LEGACY_CONSTANT_MISSING");
eq("combo UI eligibility", comboClass?.newGenerationUiEligible, true);
eq("combo calibration eligibility", comboClass?.calibrationCanonicalEligible, true);
eq("combo rewrite forbidden", comboClass?.automaticAliasRewriteAllowed, false);

const mappedIds = binding.families.flatMap((family) => family.rotationOrder);
eq("family count", binding.families.length, 8);
eq("family ID uniqueness", new Set(binding.families.map((family) => family.familyId)).size, 8);
eq("mapped count", mappedIds.length, 23);
eq("mapped uniqueness", new Set(mappedIds).size, 23);
setEq("23 to 8 mapping exhaustive", mappedIds, nonfocusIds);
eq("focus injection absent", intersection(mappedIds, focusIds), []);
eq("legacy injection absent", intersection(mappedIds, ["TOPIC_MAIN_IDEA"]), []);

function selectedAt(family, epoch, holdout = false) {
  return family.rotationOrder[(2 * (epoch - 1) + (holdout ? 1 : 0)) % family.rotationOrder.length];
}
function coverageThrough(epochCount, includeHoldout) {
  const result = new Set();
  for (let epoch = 1; epoch <= epochCount; epoch += 1) {
    for (const family of binding.families) {
      result.add(selectedAt(family, epoch, false));
      if (includeHoldout) result.add(selectedAt(family, epoch, true));
    }
  }
  return result;
}
const epoch1Combined = coverageThrough(1, true);
const epoch2Combined = coverageThrough(2, true);
const epoch4Main = coverageThrough(4, false);
const epoch24Main = coverageThrough(24, false);
const unreachableByMain = difference(nonfocusIds, [...epoch24Main]);
eq("main formula literal", binding.rotation.mainIndexFormula, "(2 * (epoch - 1)) mod familySize");
eq(
  "holdout formula literal",
  binding.rotation.holdoutIndexFormula,
  "(2 * (epoch - 1) + 1) mod familySize",
);
eq("epoch one combined distinct", epoch1Combined.size, 16);
eq("epoch two combined exact coverage", epoch2Combined.size, 23);
setEq("epoch two combined exact IDs", [...epoch2Combined], nonfocusIds);
eq("four-epoch main-only actual coverage", epoch4Main.size, 19);
eq("eventual main-only actual coverage", epoch24Main.size, 19);
eq(
  "main-only unreachable exact IDs",
  unreachableByMain,
  ["TOPIC_SENTENCE_WRITING", "GRAMMAR_CORRECTION", "CONTEXT_MEANING", "ANTONYM"],
);
eq("binding records false main-only epoch claim", binding.rotation.mainOnlyEpochsToTouchAll23, 4);
check(
  "binding main-only claim is mathematically false",
  epoch4Main.size !== 23 && epoch24Main.size !== 23,
  { epoch4: epoch4Main.size, eventual: epoch24Main.size, unreachableByMain },
);
eq("combined coverage epoch claim remains correct", binding.rotation.mainPlusHoldoutEpochsToTouchAll23, 2);

const priorIds = prior.nonfocusConstruct.families.flatMap((family) => family.logicalTypes);
const priorOnly = difference(priorIds, nonfocusIds);
const productionOnly = difference(nonfocusIds, priorIds);
const exactIntersection = intersection(priorIds, nonfocusIds);
eq("prior logical count", priorIds.length, 23);
eq("prior logical unique", new Set(priorIds).size, 23);
eq("prior exact intersection", exactIntersection.length, 9);
eq("prior only count", priorOnly.length, 14);
eq("production only count", productionOnly.length, 14);
eq("prior-only exact IDs", priorOnly, binding.priorDesignMismatch.priorOnlyLogicalIds);
eq("production-only exact IDs", productionOnly, binding.priorDesignMismatch.productionOnlyCanonicalIds);
eq("prior blocker severity", binding.priorDesignMismatch.severity, "BLOCKER");
eq("prior standalone blocked", binding.priorDesignMismatch.standalonePriorProtocolIssuanceEligible, false);

const actualHead = git(["rev-parse", "HEAD"]).stdout.trim();
eq("repository HEAD", actualHead, binding.freeze.repositoryHead);
const sourceEvidence = [];
for (const item of binding.sources) {
  const absolute = join(repo, item.path);
  const actualSha = fileSha(absolute);
  const status = git(["status", "--porcelain=v1", "--untracked-files=all", "--", item.path]).stdout.trim();
  const clean = status.length === 0;
  const blobResult = git(["rev-parse", `HEAD:${item.path}`], true);
  const headBlob = blobResult.status === 0 ? blobResult.stdout.trim() : null;
  const lastCommitText = git(["log", "-1", "--format=%H", "--", item.path]).stdout.trim();
  const lastCommit = lastCommitText || null;
  eq(`source SHA ${item.path}`, actualSha, item.worktreeSha256);
  eq(`source dirty state ${item.path}`, clean, item.cleanAtFreeze);
  eq(`source HEAD blob ${item.path}`, headBlob, item.headBlobSha1);
  eq(`source last path commit ${item.path}`, lastCommit, item.lastPathCommit);
  sourceEvidence.push({
    path: item.path,
    sha256: actualSha,
    gitStatus: status || "CLEAN",
    clean,
    headBlob,
    lastCommit,
  });
}

const headAiMcText = git(["show", "HEAD:src/lib/question-ai-schemas-mc.ts"]).stdout;
const headAiMc = parse("src/lib/question-ai-schemas-mc.ts", headAiMcText);
setEq(
  "dirty AI MC registry unchanged from HEAD",
  objectKeys(source.aiMc, "AI_MC_QUESTION_SCHEMAS"),
  objectKeys(headAiMc, "AI_MC_QUESTION_SCHEMAS"),
);
setEq(
  "dirty AI essay registry unchanged from HEAD",
  objectKeys(source.aiMc, "AI_ESSAY_QUESTION_SCHEMAS"),
  objectKeys(headAiMc, "AI_ESSAY_QUESTION_SCHEMAS"),
);

function parseManifest(text) {
  const entries = new Map();
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
    if (!match || entries.has(match[2])) throw new Error(`Invalid manifest line: ${line}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}
const targetManifest = parseManifest(readFileSync(join(target, "MANIFEST.sha256"), "utf8"));
const targetManifestFiles = ["REPORT.md", "binding.json", "verify.mjs"];
eq("target manifest exact names", [...targetManifest.keys()].sort(), [...targetManifestFiles].sort());
for (const file of targetManifestFiles) {
  eq(`target manifest hash ${file}`, targetManifest.get(file), fileSha(join(target, file)));
}

const authorRun = spawnSync("node", [join(target, "verify.mjs"), "--check-manifest"], {
  cwd: repo,
  encoding: "utf8",
});
check("author verifier exits zero", authorRun.status === 0, {
  status: authorRun.status,
  stderr: authorRun.stderr,
});
const authorResult = JSON.parse(authorRun.stdout);
eq("author verifier reports pass", authorResult.status, "PASS_WITH_DECLARED_PRIOR_DESIGN_BLOCKER");
eq("author verifier reports 154 checks", authorResult.checks, 154);
eq("author verifier reports zero failures", authorResult.failed, 0);

const authorVerifier = parse(
  "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v1/verify.mjs",
);
check(
  "author combined schedule hardcodes stride two",
  /const offset = 2 \* \(epoch - 1\) \+ \(holdout \? 1 : 0\)/.test(authorVerifier.text),
);
check(
  "author main-only proof silently substitutes stride one",
  /family\.rotationOrder\[\(epoch - 1\) % family\.rotationOrder\.length\]/.test(authorVerifier.text),
);
check(
  "author verifier never reads main formula field",
  !authorVerifier.text.includes("mainIndexFormula"),
);
check(
  "author verifier never reads holdout formula field",
  !authorVerifier.text.includes("holdoutIndexFormula"),
);
check(
  "author verifier gates dirty-state check on truthy HEAD blob",
  /if \(source\.headBlobSha1\)[\s\S]{0,500}clean state/.test(authorVerifier.text),
);
check(
  "author verifier never validates lastPathCommit",
  !authorVerifier.text.includes("lastPathCommit"),
);
check(
  "author authority chain is asserted with raw substring checks",
  authorVerifier.text.includes("pageTypesSource.text.includes") &&
    authorVerifier.text.includes("panelSource.text.includes"),
);

function classificationCodes(candidate) {
  const codes = [];
  const topic = candidate.schemaAndUiDrift.classification.find((entry) => entry.typeId === "TOPIC_MAIN_IDEA");
  const combo = candidate.schemaAndUiDrift.classification.find((entry) => entry.typeId === "GRAMMAR_CHOICE_COMBO");
  if (
    candidate.schemaAndUiDrift.classification.length !== 2 ||
    topic?.status !== "LEGACY_SCHEMA_AND_FILTER_COMPATIBILITY_ONLY" ||
    topic?.newGenerationUiEligible !== false ||
    topic?.calibrationCanonicalEligible !== false ||
    topic?.automaticAliasRewriteAllowed !== false ||
    !same(topic?.semanticSuccessors, ["TOPIC", "MAIN_IDEA"]) ||
    combo?.status !== "CANONICAL_UI_AND_SCHEMA_LEGACY_CONSTANT_MISSING" ||
    combo?.newGenerationUiEligible !== true ||
    combo?.calibrationCanonicalEligible !== true ||
    combo?.automaticAliasRewriteAllowed !== false
  ) {
    codes.push("ALIAS_CLASSIFICATION_DRIFT");
  }
  return codes;
}
function familyCodes(candidate) {
  const codes = [];
  const ids = candidate.families.flatMap((family) => family.rotationOrder);
  if (ids.length !== 23 || new Set(ids).size !== 23 || !same(sortedUnique(ids), sortedUnique(nonfocusIds))) {
    codes.push("FAMILY_DUPLICATE_OR_OMISSION");
  }
  if (intersection(ids, focusIds).length) codes.push("FAMILY_FOCUS_INJECTION");
  if (ids.includes("TOPIC_MAIN_IDEA")) codes.push("FAMILY_LEGACY_INJECTION");
  return codes;
}
function rotationCodes(candidate) {
  const codes = [];
  if (
    candidate.rotation.mainIndexFormula !== "(2 * (epoch - 1)) mod familySize" ||
    candidate.rotation.holdoutIndexFormula !== "(2 * (epoch - 1) + 1) mod familySize"
  ) {
    codes.push("ROTATION_FORMULA_DRIFT");
  }
  return codes;
}
function registryCodes(observed) {
  const codes = [];
  if (!same(observed.uiIds, uiIds)) codes.push("CANONICAL_UI_BINDING_MISMATCH");
  if (!same(sortedUnique(observed.structuredIds), sortedUnique(structuredIds))) codes.push("SCHEMA_SET_DRIFT");
  return codes;
}
function sourceCodes(candidate, observedBytes) {
  const codes = [];
  for (const item of candidate.sources) {
    if (sha256(observedBytes.get(item.path)) !== item.worktreeSha256) {
      codes.push("SOURCE_SHA_MISMATCH");
      break;
    }
  }
  return codes;
}
function gitMetadataCodes(candidate) {
  const codes = [];
  for (const item of candidate.sources) {
    const actual = sourceEvidence.find((entry) => entry.path === item.path);
    if (item.cleanAtFreeze !== actual.clean) codes.push("GIT_DIRTY_STATE_DRIFT");
    if (item.headBlobSha1 !== actual.headBlob) codes.push("HEAD_BLOB_DRIFT");
    if (item.lastPathCommit !== actual.lastCommit) codes.push("LAST_PATH_COMMIT_DRIFT");
  }
  return sortedUnique(codes);
}
function manifestCodes(entries) {
  const codes = [];
  for (const file of targetManifestFiles) {
    if (entries.get(file) !== fileSha(join(target, file))) codes.push("MANIFEST_HASH_MISMATCH");
  }
  return sortedUnique(codes);
}
function mutation(name, mutate, expectedCode) {
  const context = {
    candidate: clone(binding),
    observed: { uiIds: [...uiIds], structuredIds: [...structuredIds] },
    bytes: new Map(binding.sources.map((item) => [item.path, readFileSync(join(repo, item.path))])),
    manifest: new Map(targetManifest),
  };
  mutate(context);
  const codes = sortedUnique([
    ...classificationCodes(context.candidate),
    ...familyCodes(context.candidate),
    ...rotationCodes(context.candidate),
    ...registryCodes(context.observed),
    ...sourceCodes(context.candidate, context.bytes),
    ...gitMetadataCodes(context.candidate),
    ...manifestCodes(context.manifest),
  ]);
  const pass = codes.includes(expectedCode);
  check(`hostile mutation rejected: ${name}`, pass, { expectedCode, codes });
  return { name, expectedCode, detectedCodes: codes, rejected: pass };
}

const hostileMutations = [
  mutation(
    "canonical UI deletion",
    ({ observed }) => { observed.uiIds = observed.uiIds.filter((id) => id !== "ANTONYM"); },
    "CANONICAL_UI_BINDING_MISMATCH",
  ),
  mutation(
    "schema enum addition",
    ({ observed }) => { observed.structuredIds.push("HOSTILE_NEW_TYPE"); },
    "SCHEMA_SET_DRIFT",
  ),
  mutation(
    "schema enum removal",
    ({ observed }) => { observed.structuredIds = observed.structuredIds.filter((id) => id !== "ANTONYM"); },
    "SCHEMA_SET_DRIFT",
  ),
  mutation(
    "legacy alias misclassification",
    ({ candidate }) => {
      candidate.schemaAndUiDrift.classification.find((entry) => entry.typeId === "TOPIC_MAIN_IDEA").automaticAliasRewriteAllowed = true;
    },
    "ALIAS_CLASSIFICATION_DRIFT",
  ),
  mutation(
    "family duplicate",
    ({ candidate }) => { candidate.families[7].rotationOrder[1] = "FILL_BLANK_KEY"; },
    "FAMILY_DUPLICATE_OR_OMISSION",
  ),
  mutation(
    "family omission",
    ({ candidate }) => { candidate.families[7].rotationOrder.pop(); },
    "FAMILY_DUPLICATE_OR_OMISSION",
  ),
  mutation(
    "focus injection",
    ({ candidate }) => { candidate.families[7].rotationOrder[1] = "BLANK_INFERENCE"; },
    "FAMILY_FOCUS_INJECTION",
  ),
  mutation(
    "legacy injection",
    ({ candidate }) => { candidate.families[7].rotationOrder[1] = "TOPIC_MAIN_IDEA"; },
    "FAMILY_LEGACY_INJECTION",
  ),
  mutation(
    "rotation formula drift",
    ({ candidate }) => { candidate.rotation.mainIndexFormula = "(epoch - 1) mod familySize"; },
    "ROTATION_FORMULA_DRIFT",
  ),
  mutation(
    "source byte mutation",
    ({ bytes }) => {
      const path = "src/lib/question-type-ui.ts";
      bytes.set(path, Buffer.concat([bytes.get(path), Buffer.from("\n// hostile mutation\n")]));
    },
    "SOURCE_SHA_MISMATCH",
  ),
  mutation(
    "manifest hash mutation",
    ({ manifest }) => { manifest.set("binding.json", "0".repeat(64)); },
    "MANIFEST_HASH_MISMATCH",
  ),
  mutation(
    "dirty-state metadata mutation",
    ({ candidate }) => { candidate.sources[0].cleanAtFreeze = false; },
    "GIT_DIRTY_STATE_DRIFT",
  ),
  mutation(
    "HEAD blob null bypass",
    ({ candidate }) => { candidate.sources[0].headBlobSha1 = null; },
    "HEAD_BLOB_DRIFT",
  ),
  mutation(
    "last-path-commit mutation",
    ({ candidate }) => { candidate.sources[0].lastPathCommit = "0".repeat(40); },
    "LAST_PATH_COMMIT_DRIFT",
  ),
];

const aliasLine = "export const EXAM_TYPE_GROUPS = QUESTION_TYPE_GROUPS;";
const brokenAliasText = source.pageTypes.text.replace(
  aliasLine,
  `export const EXAM_TYPE_GROUPS = []; // ${aliasLine}`,
);
const brokenAlias = parse(
  "src/app/(director)/director/workbench/generate/generate-page-types.ts",
  brokenAliasText,
);
check(
  "hostile commented-alias mutation fools author substring predicate",
  brokenAliasText.includes(aliasLine),
);
check(
  "hostile commented-alias mutation rejected by independent AST predicate",
  !initializerIsIdentifier(brokenAlias, "EXAM_TYPE_GROUPS", "QUESTION_TYPE_GROUPS"),
);
hostileMutations.push({
  name: "commented alias semantic break",
  expectedCode: "AUTHORITY_CHAIN_AST_MISMATCH",
  detectedCodes: ["AUTHORITY_CHAIN_AST_MISMATCH"],
  rejected: !initializerIsIdentifier(brokenAlias, "EXAM_TYPE_GROUPS", "QUESTION_TYPE_GROUPS"),
  authorSubstringPredicateWouldPassAfterCoherentRebind: brokenAliasText.includes(aliasLine),
});

const auditReport = JSON.parse(readFileSync(join(base, "report.json"), "utf8"));
const auditEvidence = JSON.parse(readFileSync(join(base, "evidence.json"), "utf8"));
eq(
  "audit report schema",
  auditReport.schemaVersion,
  "calibration-v3-production-type-binding-independent-audit-report-1",
);
eq("audit report status", auditReport.status, "FAIL_CLOSED");
eq("audit report production verdict", auditReport.verdicts.productionBinding.status, "FAIL_CLOSED");
eq("audit report prior verdict", auditReport.verdicts.priorV3Standalone.status, "BLOCKED");
eq("audit report finding IDs", auditReport.findings.map((finding) => finding.id), ["B-01", "M-01", "M-02", "M-03"]);
eq(
  "audit evidence schema",
  auditEvidence.schemaVersion,
  "calibration-v3-production-type-binding-independent-audit-evidence-1",
);
eq("audit evidence target hashes", auditEvidence.target.hashes, {
  "REPORT.md": "730613f34f5d5d42645dc1670d4f41c5d79c0b85d7f3ca5b0a1d8cf6f9a14a82",
  "binding.json": "f731f790413bb6fa7bb5ec9be797553032846e1d8902d3e94b46d75066702c18",
  "verify.mjs": "36ff4873d80d01c5198e28e658f43ae429ddc99a7e26f033efd36e49e08b96c8",
  "MANIFEST.sha256": "655bfc33ef47f06752fddde0c2ac4c3750ca7468d97d84a241dca28fefac1539",
});
eq("audit evidence four-epoch main count", auditEvidence.rotationCounterexample.epochFourMainOnlyDistinct, 19);
eq("audit evidence eventual main count", auditEvidence.rotationCounterexample.eventualMainOnlyDistinct, 19);
eq("audit evidence unreachable IDs", auditEvidence.rotationCounterexample.unreachableByMain, unreachableByMain);
eq("audit evidence hostile count", auditEvidence.hostileMutations.length, 15);
check("audit evidence hostile all rejected", auditEvidence.hostileMutations.every((entry) => entry.rejected));

const auditManifestFiles = ["REPORT.md", "report.json", "evidence.json", "verify.mjs"];
const auditManifest = parseManifest(readFileSync(join(base, "MANIFEST.sha256"), "utf8"));
eq("audit manifest exact names", [...auditManifest.keys()].sort(), [...auditManifestFiles].sort());
for (const file of auditManifestFiles) {
  eq(`audit manifest hash ${file}`, auditManifest.get(file), fileSha(join(base, file)));
}

const targetFiles = ["REPORT.md", "binding.json", "verify.mjs", "MANIFEST.sha256"];
const targetHashes = Object.fromEntries(targetFiles.map((file) => [file, fileSha(join(target, file))]));
const failures = checks.filter((entry) => !entry.pass);
const result = {
  schemaVersion: "calibration-v3-production-type-binding-independent-audit-verification-1",
  auditStatus: failures.length === 0 ? "AUDIT_REPRODUCED" : "AUDIT_VERIFICATION_FAILED",
  targetBindingVerdict: "FAIL_CLOSED",
  priorDesignVerdict: "BLOCKED",
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  extracted: {
    productionUiCount: uiIds.length,
    focusCount: focusIds.length,
    nonfocusCount: nonfocusIds.length,
    structuredSchemaCount: structuredIds.length,
    aiSchemaCount: aiIds.length,
    filterCount: filterIds.length,
    legacyConstantCount: legacyIds.length,
    familyCount: binding.families.length,
    priorIntersection: exactIntersection.length,
    priorOnly: priorOnly.length,
    productionOnly: productionOnly.length,
  },
  rotation: {
    epoch1MainPlusHoldout: epoch1Combined.size,
    epoch2MainPlusHoldout: epoch2Combined.size,
    epoch4MainOnlyActual: epoch4Main.size,
    eventualMainOnlyActual: epoch24Main.size,
    unreachableByMain,
    recordedMainOnlyEpochClaim: binding.rotation.mainOnlyEpochsToTouchAll23,
  },
  authorVerifier: {
    reportedStatus: authorResult.status,
    checks: authorResult.checks,
    failed: authorResult.failed,
    scheduleSubstitution: true,
    formulaFieldsRead: false,
    lastPathCommitRead: false,
    dirtyCheckGatedByHeadBlob: true,
    authorityChainUsesSubstring: true,
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
  },
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
