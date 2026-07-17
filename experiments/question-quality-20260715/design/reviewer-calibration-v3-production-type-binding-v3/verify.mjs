import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const base = dirname(fileURLToPath(import.meta.url));
const repo = resolve(base, "../../../..");
const bindingPath = join(base, "binding.json");
const hostilePath = join(base, "hostile-fixtures.json");
const reportPath = join(base, "REPORT.md");
const manifestPath = join(base, "MANIFEST.sha256");
const binding = JSON.parse(readFileSync(bindingPath, "utf8"));
const hostile = JSON.parse(readFileSync(hostilePath, "utf8"));
const checks = [];

const REQUIRED_SOURCE_PATHS = [
  "src/lib/question-type-ui.ts",
  "src/app/(director)/director/workbench/questions/generate/page.tsx",
  "src/app/(director)/director/workbench/generate/generate-page-client.tsx",
  "src/app/(director)/director/workbench/generate/generate-page-types.ts",
  "src/app/(director)/director/workbench/generate/generation-config-panel.tsx",
  "src/app/(director)/director/workbench/generate/use-generation-handlers.ts",
  "src/app/(director)/director/workbench/generate/workspace/use-workspace-generation.ts",
  "src/app/(director)/director/workbench/generate/fast-generation-scheduler.ts",
  "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  "src/app/api/workbench/ai-jobs/question-generation/route.ts",
  "src/trigger/workbench-question-generation.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  "src/lib/question-schemas.ts",
  "src/lib/question-ai-schemas-mc.ts",
  "src/lib/question-ai-schemas-vocab.ts",
  "src/lib/question-schemas-essay.ts",
  "src/lib/question-schemas-vocab.ts"
];

const EXPECTED_UPSTREAMS = new Map([
  ["reviewer-calibration-v3-replacement-v1", "ea73ff0796f73065f701a294c5ee3b768a9f8ff8d8ffb79979fbe72abe64ba64"],
  ["reviewer-calibration-v3-production-type-binding-v2", "4e81452d0c74f3361cd01a59e5ec6406ea2fde729fd79f588dcdaf07c380de14"]
]);

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

function normalizeOutput(value) {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return {
    status: result.status,
    stdout: normalizeOutput(result.stdout || ""),
    stderr: normalizeOutput(result.stderr || "")
  };
}

function runNode(path, args = []) {
  return spawnSync(process.execPath, [path, ...args], { cwd: dirname(path), encoding: "utf8" });
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

function clone(value) {
  return structuredClone(value);
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

function propertyName(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression?.(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function parseSourceText(path, text) {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
}

function findNode(root, predicate) {
  let found;
  function visit(node) {
    if (found) return;
    if (predicate(node)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

function findInitializer(ast, name) {
  const declaration = findNode(
    ast,
    (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
  );
  return declaration?.initializer ? unwrap(declaration.initializer) : undefined;
}

function objectLiteralFromInitializer(node) {
  const value = unwrap(node);
  if (value && ts.isObjectLiteralExpression(value)) return value;
  if (value && ts.isCallExpression(value)) {
    const first = unwrap(value.arguments[0]);
    if (first && ts.isObjectLiteralExpression(first)) return first;
  }
  return undefined;
}

function objectKeys(ast, name) {
  const object = objectLiteralFromInitializer(findInitializer(ast, name));
  if (!object) return [];
  return object.properties
    .filter((property) => !ts.isSpreadAssignment(property))
    .map((property) => propertyName(property.name))
    .filter(Boolean);
}

function objectSpreadIdentifiers(ast, name) {
  const object = objectLiteralFromInitializer(findInitializer(ast, name));
  if (!object) return [];
  return object.properties
    .filter(ts.isSpreadAssignment)
    .map((property) => unwrap(property.expression))
    .filter(ts.isIdentifier)
    .map((identifier) => identifier.text);
}

function uiReferences(ast) {
  const initializer = findInitializer(ast, "QUESTION_TYPE_GROUPS");
  const ids = [];
  if (!initializer) return ids;
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

function hasNamedImport(ast, moduleName, importedName, localName = importedName) {
  return Boolean(
    findNode(ast, (node) => {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return false;
      if (node.moduleSpecifier.text !== moduleName) return false;
      const bindings = node.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) return false;
      return bindings.elements.some(
        (element) =>
          (element.propertyName?.text || element.name.text) === importedName && element.name.text === localName
      );
    })
  );
}

function jsxAttributeValue(attribute) {
  if (!attribute.initializer) return true;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer)) {
    const expression = unwrap(attribute.initializer.expression);
    if (expression && ts.isStringLiteral(expression)) return expression.text;
    if (expression && ts.isIdentifier(expression)) return { identifier: expression.text };
  }
  return null;
}

function jsxElements(ast, tagName) {
  const rows = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(ast) === tagName) rows.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return rows;
}

function jsxHasAttributes(ast, tagName, requiredNames) {
  return jsxElements(ast, tagName).some((node) => {
    const names = node.attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attribute) => attribute.name.text);
    return requiredNames.every((name) => names.includes(name));
  });
}

function jsxHasLiteral(ast, tagName, attributeName, value) {
  return jsxElements(ast, tagName).some((node) => {
    const attribute = node.attributes.properties.find(
      (candidate) => ts.isJsxAttribute(candidate) && candidate.name.text === attributeName
    );
    return attribute && jsxAttributeValue(attribute) === value;
  });
}

function callObjectPropertyNames(ast, calleeName) {
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === calleeName) {
      const first = unwrap(node.arguments[0]);
      if (first && ts.isObjectLiteralExpression(first)) {
        calls.push(first.properties.map((property) => propertyName(property.name)).filter(Boolean));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return calls;
}

function hasCallObjectProperties(ast, calleeName, requiredNames) {
  return callObjectPropertyNames(ast, calleeName).some((names) =>
    requiredNames.every((name) => names.includes(name))
  );
}

function hasCallNamed(root, name) {
  return Boolean(
    findNode(root, (node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name)
  );
}

function hasPropertyCall(root, objectName, methodName, firstString = undefined) {
  return Boolean(
    findNode(root, (node) => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
      if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== objectName) return false;
      if (node.expression.name.text !== methodName) return false;
      if (firstString === undefined) return true;
      return ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === firstString;
    })
  );
}

function functionNode(ast, name) {
  return findNode(ast, (node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
}

function functionContainsFetch(ast, functionName, endpoint) {
  const fn = functionNode(ast, functionName);
  if (!fn) return false;
  return Boolean(
    findNode(
      fn,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "fetch" &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === endpoint
    )
  );
}

function containsObjectPropertyIdentifier(root, key, identifier) {
  return Boolean(
    findNode(root, (node) => {
      if (ts.isShorthandPropertyAssignment(node)) return node.name.text === key && key === identifier;
      if (!ts.isPropertyAssignment(node) || propertyName(node.name) !== key) return false;
      const value = unwrap(node.initializer);
      return ts.isIdentifier(value) && value.text === identifier;
    })
  );
}

function containsObjectPropertyAccess(root, key, objectName, property) {
  return Boolean(
    findNode(root, (node) => {
      if (!ts.isPropertyAssignment(node) || propertyName(node.name) !== key) return false;
      const value = unwrap(node.initializer);
      return (
        ts.isPropertyAccessExpression(value) &&
        ts.isIdentifier(value.expression) &&
        value.expression.text === objectName &&
        value.name.text === property
      );
    })
  );
}

function containsObjectKeysTypeCounts(root) {
  return Boolean(
    findNode(root, (node) => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
      if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== "Object") return false;
      return (
        node.expression.name.text === "keys" &&
        ts.isIdentifier(node.arguments[0]) &&
        node.arguments[0].text === "typeCounts"
      );
    })
  );
}

function containsElementAccess(root, objectName, argumentName) {
  return Boolean(
    findNode(root, (node) => {
      if (!ts.isElementAccessExpression(node) || !ts.isIdentifier(node.expression)) return false;
      return (
        node.expression.text === objectName &&
        ts.isIdentifier(node.argumentExpression) &&
        node.argumentExpression.text === argumentName
      );
    })
  );
}

function containsCallFirstIdentifier(root, calleeName, argumentName) {
  return Boolean(
    findNode(root, (node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return false;
      return node.expression.text === calleeName && ts.isIdentifier(node.arguments[0]) && node.arguments[0].text === argumentName;
    })
  );
}

function containsMethodOnIdentifier(root, identifier, methods) {
  return Boolean(
    findNode(root, (node) => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
      return (
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === identifier &&
        methods.includes(node.expression.name.text)
      );
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

function materializeRows(families, epochs = 4) {
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

function coverage(families, epochs, roles) {
  const values = new Set();
  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    for (const family of families) {
      for (const role of roles) values.add(selectedAt(family.rotationOrder, epoch, role).typeId);
    }
  }
  return values;
}

function auditCoreView(value) {
  return {
    purpose: value.purpose,
    upstreams: value.upstreams,
    v2FailureProvenance: value.v2FailureProvenance,
    scope: value.scope,
    sourceAuthority: value.sourceAuthority,
    astAuthorityChain: value.astAuthorityChain,
    canonicalUniverse: value.canonicalUniverse,
    families: value.families,
    rotation: value.rotation,
    scheduleRows: value.scheduleRows,
    claims: value.claims
  };
}

function collectActualState(expected) {
  const repoHeadCommit = git(["rev-parse", "--verify", "HEAD^{commit}"]).stdout;
  const repoHeadTree = git(["rev-parse", "HEAD^{tree}"]).stdout;
  const headRef = git(["symbolic-ref", "--quiet", "HEAD"], true).stdout;
  const sources = expected.productionSources.map((source) => {
    const absolute = join(repo, source.path);
    const exists = existsSync(absolute);
    const trackedResult = git(["ls-files", "--error-unmatch", "--", source.path], true);
    const tracked = trackedResult.status === 0 && trackedResult.stdout === source.path;
    const headResult = git(["rev-parse", `HEAD:${source.path}`], true);
    const lastResult = git(["log", "-1", "--format=%H", "--", source.path], true);
    const rawBlobResult = exists ? git(["hash-object", "--no-filters", "--", source.path], true) : { status: 1, stdout: "" };
    const filteredBlobResult = exists
      ? git(["hash-object", `--path=${source.path}`, "--", source.path], true)
      : { status: 1, stdout: "" };
    const indexStage = git(["ls-files", "--stage", "--", source.path], true).stdout;
    const indexBlobSha1 = indexStage.split(/\s+/)[1] || null;
    const worktreeFilteredGitBlobSha1 = filteredBlobResult.status === 0 ? filteredBlobResult.stdout : null;
    return {
      path: source.path,
      exists,
      tracked,
      worktreeSha256: exists ? sha256File(absolute) : null,
      worktreeRawGitBlobSha1: rawBlobResult.status === 0 ? rawBlobResult.stdout : null,
      worktreeFilteredGitBlobSha1,
      indexStage,
      indexBlobSha1,
      derivedGitDirty:
        typeof worktreeFilteredGitBlobSha1 === "string" &&
        typeof indexBlobSha1 === "string" &&
        worktreeFilteredGitBlobSha1 !== indexBlobSha1,
      headBlobSha1: headResult.status === 0 ? headResult.stdout : null,
      lastPathCommit: lastResult.status === 0 && lastResult.stdout ? lastResult.stdout : null,
      statusPorcelainV2: git(["status", "--porcelain=v2", "--untracked-files=all", "--", source.path], true).stdout,
      lsFilesVerbose: git(["ls-files", "-v", "--", source.path], true).stdout
    };
  });
  return { repoFreeze: { repoHeadCommit, repoHeadTree, headRef }, sources };
}

function validateGitSnapshot(expected, actual) {
  const reasons = new Set();
  if (actual.repoFreeze.repoHeadCommit !== expected.repoFreeze.repoHeadCommit) reasons.add("REPO_HEAD_DRIFT");
  if (actual.repoFreeze.repoHeadTree !== expected.repoFreeze.repoHeadTree) reasons.add("REPO_TREE_DRIFT");
  if (actual.repoFreeze.headRef !== expected.repoFreeze.headRef) reasons.add("REPO_REF_DRIFT");

  const expectedPaths = expected.productionSources.map((source) => source.path);
  if (duplicates(expectedPaths).length > 0 || JSON.stringify(expectedPaths) !== JSON.stringify(REQUIRED_SOURCE_PATHS)) {
    reasons.add("SOURCE_SET_INVALID");
  }
  const actualByPath = new Map(actual.sources.map((source) => [source.path, source]));
  for (const source of expected.productionSources) {
    const current = actualByPath.get(source.path);
    const expectedTrackingComplete =
      source.trackedRequired === true &&
      /^[a-f0-9]{40}$/.test(source.headBlobSha1 || "") &&
      /^[a-f0-9]{40}$/.test(source.lastPathCommit || "") &&
      /^[a-f0-9]{40}$/.test(source.worktreeRawGitBlobSha1 || "") &&
      /^[a-f0-9]{40}$/.test(source.worktreeFilteredGitBlobSha1 || "") &&
      /^[a-f0-9]{40}$/.test(source.indexBlobSha1 || "") &&
      typeof source.indexStage === "string" && source.indexStage.length > 0 &&
      /^[A-Z] /.test(source.lsFilesVerbose || "") &&
      source.derivedGitDirty === (source.worktreeFilteredGitBlobSha1 !== source.indexBlobSha1);
    const actualTrackingComplete =
      current?.exists === true &&
      current?.tracked === true &&
      /^[a-f0-9]{40}$/.test(current?.headBlobSha1 || "") &&
      /^[a-f0-9]{40}$/.test(current?.lastPathCommit || "") &&
      /^[A-Z] /.test(current?.lsFilesVerbose || "");
    if (!expectedTrackingComplete || !actualTrackingComplete) reasons.add("SOURCE_TRACKING_INVALID");
    if (!current) {
      reasons.add("SOURCE_TRACKING_INVALID");
      continue;
    }
    if (current.worktreeSha256 !== source.worktreeSha256) reasons.add("WORKTREE_SHA_DRIFT");
    if (current.worktreeRawGitBlobSha1 !== source.worktreeRawGitBlobSha1) reasons.add("WORKTREE_RAW_GIT_BLOB_DRIFT");
    if (current.worktreeFilteredGitBlobSha1 !== source.worktreeFilteredGitBlobSha1) reasons.add("WORKTREE_FILTERED_GIT_BLOB_DRIFT");
    if (current.indexStage !== source.indexStage) reasons.add("INDEX_STAGE_DRIFT");
    if (current.indexBlobSha1 !== source.indexBlobSha1) reasons.add("INDEX_STAGE_DRIFT");
    if (current.derivedGitDirty !== source.derivedGitDirty) reasons.add("DERIVED_GIT_DIRTY_DRIFT");
    if (current.headBlobSha1 !== source.headBlobSha1) reasons.add("HEAD_BLOB_DRIFT");
    if (current.lastPathCommit !== source.lastPathCommit) reasons.add("LAST_PATH_COMMIT_DRIFT");
    if (current.statusPorcelainV2 !== source.statusPorcelainV2) reasons.add("PATH_STATUS_DRIFT");
    if (current.lsFilesVerbose !== source.lsFilesVerbose) reasons.add("LSFILES_FLAG_DRIFT");
  }
  return reasons;
}

function validateAst(texts, value) {
  const reasons = new Set();
  const ast = (path) => parseSourceText(path, texts.get(path));
  const uiPath = REQUIRED_SOURCE_PATHS[0];
  const routePath = REQUIRED_SOURCE_PATHS[1];
  const clientPath = REQUIRED_SOURCE_PATHS[2];
  const aliasPath = REQUIRED_SOURCE_PATHS[3];
  const panelPath = REQUIRED_SOURCE_PATHS[4];
  const batchPath = REQUIRED_SOURCE_PATHS[5];
  const workspacePath = REQUIRED_SOURCE_PATHS[6];
  const fastRoutePath = REQUIRED_SOURCE_PATHS[8];
  const legacyRoutePath = REQUIRED_SOURCE_PATHS[9];
  const triggerPath = REQUIRED_SOURCE_PATHS[10];
  const runtimePath = REQUIRED_SOURCE_PATHS[11];
  const structuredPath = REQUIRED_SOURCE_PATHS[12];
  const aiMcPath = REQUIRED_SOURCE_PATHS[13];
  const aiVocabPath = REQUIRED_SOURCE_PATHS[14];

  const uiAst = ast(uiPath);
  const routeAst = ast(routePath);
  const clientAst = ast(clientPath);
  const aliasAst = ast(aliasPath);
  const panelAst = ast(panelPath);
  const batchAst = ast(batchPath);
  const workspaceAst = ast(workspacePath);
  const fastRouteAst = ast(fastRoutePath);
  const legacyRouteAst = ast(legacyRoutePath);
  const triggerAst = ast(triggerPath);
  const runtimeAst = ast(runtimePath);
  const structuredAst = ast(structuredPath);
  const aiMcAst = ast(aiMcPath);
  const aiVocabAst = ast(aiVocabPath);

  const uiIds = uiReferences(uiAst);
  if (JSON.stringify(uiIds) !== JSON.stringify(value.canonicalUniverse.uiTypeIdsInOrder) || duplicates(uiIds).length > 0) {
    reasons.add("UI_REGISTRY_AST_BROKEN");
  }

  if (
    !hasNamedImport(routeAst, "../../generate/generate-page-client", "GeneratePageClient") ||
    !jsxHasLiteral(routeAst, "GeneratePageClient", "defaultMode", "manual")
  ) reasons.add("ROUTE_ENTRY_AST_BROKEN");

  if (
    !hasNamedImport(clientAst, "./generation-config-panel", "GenerationConfigPanel") ||
    !hasNamedImport(clientAst, "./use-generation-handlers", "useGenerationHandlers") ||
    !hasNamedImport(clientAst, "./workspace/use-workspace-generation", "useWorkspaceGeneration") ||
    !hasCallObjectProperties(clientAst, "useGenerationHandlers", ["typeCounts", "generationPlan", "questionTypeSettings"]) ||
    !hasCallObjectProperties(clientAst, "useWorkspaceGeneration", ["typeCounts", "generationPlan", "questionTypeSettings"]) ||
    !jsxHasAttributes(clientAst, "GenerationConfigPanel", ["typeCounts", "generationPlan", "questionTypeSettings", "onWorkspaceGenerate"])
  ) reasons.add("CLIENT_CHAIN_AST_BROKEN");

  const aliasInitializer = findInitializer(aliasAst, "EXAM_TYPE_GROUPS");
  if (
    !hasNamedImport(aliasAst, "@/lib/question-type-ui", "QUESTION_TYPE_GROUPS") ||
    !aliasInitializer || !ts.isIdentifier(aliasInitializer) || aliasInitializer.text !== "QUESTION_TYPE_GROUPS"
  ) reasons.add("PICKER_ALIAS_AST_BROKEN");

  const panelInitializer = findInitializer(panelAst, "panelTypeGroups");
  const correctPanelBranch =
    panelInitializer &&
    ts.isConditionalExpression(panelInitializer) &&
    ts.isIdentifier(unwrap(panelInitializer.whenTrue)) &&
    unwrap(panelInitializer.whenTrue).text === "QUESTION_TYPE_GROUPS_KO" &&
    ts.isIdentifier(unwrap(panelInitializer.whenFalse)) &&
    unwrap(panelInitializer.whenFalse).text === "EXAM_TYPE_GROUPS";
  if (
    !hasNamedImport(panelAst, "./generate-page-types", "EXAM_TYPE_GROUPS") ||
    !correctPanelBranch ||
    !containsMethodOnIdentifier(panelAst, "panelTypeGroups", ["flatMap", "map"])
  ) reasons.add("PANEL_PICKER_AST_BROKEN");

  const batchHook = functionNode(batchAst, "useGenerationHandlers");
  if (
    !functionContainsFetch(batchAst, "createFastQuestionGenerationJob", "/api/workbench/ai-jobs/question-generation/fast") ||
    !functionContainsFetch(batchAst, "createQuestionGenerationJob", "/api/workbench/ai-jobs/question-generation") ||
    !batchHook ||
    !containsObjectKeysTypeCounts(batchHook) ||
    !containsObjectPropertyIdentifier(batchHook, "questionType", "typeId") ||
    !hasCallNamed(batchHook, "createFastQuestionGenerationJob")
  ) reasons.add("SECONDARY_DISPATCH_AST_BROKEN");

  const workspaceHook = functionNode(workspaceAst, "useWorkspaceGeneration");
  if (
    !hasNamedImport(workspaceAst, "../use-generation-handlers", "createFastQuestionGenerationJob") ||
    !hasNamedImport(workspaceAst, "../fast-generation-scheduler", "scheduleFastGeneration") ||
    !workspaceHook ||
    !containsObjectPropertyIdentifier(workspaceHook, "questionType", "typeId") ||
    !hasCallNamed(workspaceHook, "scheduleFastGeneration") ||
    !hasCallNamed(workspaceHook, "createFastQuestionGenerationJob")
  ) reasons.add("WORKSPACE_DISPATCH_AST_BROKEN");

  if (
    !hasNamedImport(fastRouteAst, "@/app/api/ai/generate-questions-auto/_lib/run-question-generation", "runQuestionGenerationWithEmptyRetry") ||
    !hasCallNamed(fastRouteAst, "runQuestionGenerationWithEmptyRetry") ||
    !objectKeys(fastRouteAst, "requestSchema").includes("questionType") ||
    !containsObjectPropertyIdentifier(fastRouteAst, "subType", "questionType")
  ) reasons.add("FAST_RUNTIME_AST_BROKEN");

  if (
    !objectKeys(legacyRouteAst, "requestSchema").includes("questionType") ||
    !hasPropertyCall(legacyRouteAst, "tasks", "trigger", "workbench-question-generation")
  ) reasons.add("LEGACY_RUNTIME_AST_BROKEN");

  if (
    !hasNamedImport(triggerAst, "@/app/api/ai/generate-questions-auto/_lib/run-question-generation", "runQuestionGenerationWithEmptyRetry") ||
    !hasCallNamed(triggerAst, "runQuestionGenerationWithEmptyRetry") ||
    !containsObjectPropertyAccess(triggerAst, "subType", "config", "questionType")
  ) reasons.add("TRIGGER_RUNTIME_AST_BROKEN");

  if (
    !hasNamedImport(runtimeAst, "@/lib/question-ai-schemas-mc", "AI_QUESTION_SCHEMAS") ||
    !hasNamedImport(runtimeAst, "@/lib/question-ai-schemas-mc", "getAiResponseSchema") ||
    !hasNamedImport(runtimeAst, "@/lib/question-schemas", "QUESTION_SCHEMAS") ||
    !containsElementAccess(runtimeAst, "AI_QUESTION_SCHEMAS", "subType") ||
    !containsElementAccess(runtimeAst, "QUESTION_SCHEMAS", "subType") ||
    !containsCallFirstIdentifier(runtimeAst, "getAiResponseSchema", "subType")
  ) reasons.add("SCHEMA_DISPATCH_AST_BROKEN");

  const expectedSchemaIds = [...value.canonicalUniverse.uiTypeIdsInOrder, "TOPIC_MAIN_IDEA"];
  const structuredIds = objectKeys(structuredAst, "QUESTION_SCHEMAS");
  const aiIds = [
    ...objectKeys(aiMcAst, "AI_MC_QUESTION_SCHEMAS"),
    ...objectKeys(aiVocabAst, "AI_VOCAB_QUESTION_SCHEMAS"),
    ...objectKeys(aiMcAst, "AI_ESSAY_QUESTION_SCHEMAS")
  ];
  const aggregatorSpreads = objectSpreadIdentifiers(aiMcAst, "AI_QUESTION_SCHEMAS");
  if (
    duplicates(structuredIds).length > 0 || duplicates(aiIds).length > 0 ||
    JSON.stringify([...structuredIds].sort()) !== JSON.stringify([...expectedSchemaIds].sort()) ||
    JSON.stringify([...aiIds].sort()) !== JSON.stringify([...expectedSchemaIds].sort()) ||
    !["AI_MC_QUESTION_SCHEMAS", "AI_VOCAB_QUESTION_SCHEMAS", "AI_ESSAY_QUESTION_SCHEMAS"].every((id) => aggregatorSpreads.includes(id))
  ) reasons.add("SCHEMA_REGISTRY_AST_BROKEN");

  return reasons;
}

function validateCanonical(value, v2) {
  const reasons = new Set();
  if (JSON.stringify(value.canonicalUniverse) !== JSON.stringify(v2.canonicalUniverse)) reasons.add("CANONICAL_BINDING_DRIFT");
  const mapped = value.families.flatMap((family) => family.rotationOrder);
  const canonical = value.canonicalUniverse.nonfocusTypeIdsInUiOrder;
  if (
    duplicates(mapped).length > 0 ||
    JSON.stringify([...mapped].sort()) !== JSON.stringify([...canonical].sort())
  ) reasons.add("FAMILY_PARTITION_INVALID");
  if (
    value.rotation.mainIndexFormula !== "(epoch - 1) mod familySize" ||
    value.rotation.holdoutIndexFormula !== "(epoch - 1 + ceil(familySize / 2)) mod familySize" ||
    JSON.stringify(value.scheduleRows) !== JSON.stringify(materializeRows(value.families, 4))
  ) reasons.add("ROTATION_SCHEDULE_INVALID");
  const upstreams = new Map(value.upstreams.map((row) => [row.artifactId, row.manifestSha256]));
  for (const [artifactId, hash] of EXPECTED_UPSTREAMS) {
    if (upstreams.get(artifactId) !== hash) reasons.add("UPSTREAM_BINDING_DRIFT");
  }
  return reasons;
}

function replaceOnce(text, before, after) {
  const index = text.indexOf(before);
  if (index < 0) return text;
  return text.slice(0, index) + after + text.slice(index + before.length);
}

eq("schema version", binding.schemaVersion, "reviewer-calibration-v3-production-type-binding-3");
eq("artifact id", binding.artifactId, "reviewer-calibration-v3-production-type-binding-v3");
eq("route scope", binding.scope.route, "/director/workbench/questions/generate");
eq("manual scope", binding.scope.generationMode, "MANUAL");
eq("English scope", binding.scope.language, "ENGLISH_NON_KOREAN_PANEL");
eq("v2 execution authority rejected", binding.upstreams[1].executionAuthorityAccepted, false);
eq("v2 blocker code", binding.v2FailureProvenance.code, "V2_SOURCE_AUTHORITY_FAIL_OPEN");
eq("v2 execution rejected", binding.v2FailureProvenance.executionAuthorityAccepted, false);

const upstreamObjects = new Map();
eq("upstream count", binding.upstreams.length, 2);
for (const upstream of binding.upstreams) {
  const expectedHash = EXPECTED_UPSTREAMS.get(upstream.artifactId);
  eq(`upstream expected hash ${upstream.artifactId}`, upstream.manifestSha256, expectedHash);
  const upstreamDir = resolve(base, upstream.path);
  const upstreamManifest = join(upstreamDir, "MANIFEST.sha256");
  check(`upstream directory exists ${upstream.artifactId}`, existsSync(upstreamDir));
  check(`upstream manifest exists ${upstream.artifactId}`, existsSync(upstreamManifest));
  if (!existsSync(upstreamManifest)) continue;
  eq(`upstream manifest bytes ${upstream.artifactId}`, sha256File(upstreamManifest), upstream.manifestSha256);
  eq(`upstream manifest entries ${upstream.artifactId}`, Object.fromEntries(parseManifest(upstreamManifest)), upstream.manifestEntries);
  for (const [file, hash] of Object.entries(upstream.manifestEntries)) {
    eq(`upstream file bytes ${upstream.artifactId}/${file}`, sha256File(join(upstreamDir, file)), hash);
  }
  const verification = runNode(join(upstreamDir, "verify.mjs"), ["--check-manifest"]);
  check(`upstream verifier exit ${upstream.artifactId}`, verification.status === 0, verification.stderr || verification.stdout);
  if (upstream.artifactId === "reviewer-calibration-v3-production-type-binding-v2") {
    upstreamObjects.set("v2", JSON.parse(readFileSync(join(upstreamDir, "binding.json"), "utf8")));
  }
}

const v2 = upstreamObjects.get("v2");
check("v2 math binding loaded", Boolean(v2));
if (!v2) throw new Error("Corrected math binding unavailable");
eq("canonical snapshot exact v2", binding.canonicalUniverse, v2.canonicalUniverse);
eq("family snapshot exact v2", binding.families, v2.families);
eq("rotation snapshot exact v2", binding.rotation, v2.rotation);
eq("schedule snapshot exact v2", binding.scheduleRows, v2.scheduleRows);
eq("claim snapshot exact v2", binding.claims, v2.claims);

const expectedSourceSemantic = semanticSha({
  repoFreeze: binding.sourceAuthority.repoFreeze,
  productionSources: binding.sourceAuthority.productionSources
});
eq("source contract semantic digest", binding.sourceAuthority.semanticSha256, expectedSourceSemantic);
eq("source semantic mirror", binding.semanticDigests.productionSourceContractSha256, expectedSourceSemantic);
eq("canonical semantic digest", binding.semanticDigests.canonicalBindingSha256, semanticSha({
  canonicalUniverse: binding.canonicalUniverse,
  families: binding.families,
  rotation: binding.rotation,
  scheduleRows: binding.scheduleRows
}));
eq("audit core semantic digest", binding.semanticDigests.auditCoreSha256, semanticSha(auditCoreView(binding)));

const actualGitState = collectActualState(binding.sourceAuthority);
const baselineGitReasons = validateGitSnapshot(binding.sourceAuthority, actualGitState);
eq("baseline exact git/source validator", [...baselineGitReasons], []);
eq("required source count", binding.sourceAuthority.productionSources.length, REQUIRED_SOURCE_PATHS.length);
eq("required source order", binding.sourceAuthority.productionSources.map((row) => row.path), REQUIRED_SOURCE_PATHS);
for (const source of binding.sourceAuthority.productionSources) {
  const actual = actualGitState.sources.find((row) => row.path === source.path);
  check(`tracked source ${source.path}`, actual?.tracked === true);
  check(`HEAD source ${source.path}`, /^[a-f0-9]{40}$/.test(actual?.headBlobSha1 || ""));
  check(`last commit source ${source.path}`, /^[a-f0-9]{40}$/.test(actual?.lastPathCommit || ""));
  check(`normal ls-files flag ${source.path}`, /^[A-Z] /.test(actual?.lsFilesVerbose || ""));
  eq(`worktree sha ${source.path}`, actual?.worktreeSha256, source.worktreeSha256);
  eq(`raw worktree blob ${source.path}`, actual?.worktreeRawGitBlobSha1, source.worktreeRawGitBlobSha1);
  eq(`filtered worktree blob ${source.path}`, actual?.worktreeFilteredGitBlobSha1, source.worktreeFilteredGitBlobSha1);
  eq(`index stage ${source.path}`, actual?.indexStage, source.indexStage);
  eq(`index blob ${source.path}`, actual?.indexBlobSha1, source.indexBlobSha1);
  eq(`derived Git dirty ${source.path}`, actual?.derivedGitDirty, source.derivedGitDirty);
  eq(`HEAD blob ${source.path}`, actual?.headBlobSha1, source.headBlobSha1);
  eq(`last path commit ${source.path}`, actual?.lastPathCommit, source.lastPathCommit);
  eq(`porcelain-v2 status ${source.path}`, actual?.statusPorcelainV2, source.statusPorcelainV2);
  eq(`ls-files flag ${source.path}`, actual?.lsFilesVerbose, source.lsFilesVerbose);
}

const crlfNormalizedCleanSources = binding.sourceAuthority.productionSources.filter(
  (source) =>
    source.derivedGitDirty === false &&
    source.statusPorcelainV2 === "" &&
    source.worktreeRawGitBlobSha1 !== source.indexBlobSha1 &&
    source.worktreeFilteredGitBlobSha1 === source.indexBlobSha1
);
check("CRLF-normalized clean fixture present", crlfNormalizedCleanSources.length > 0, crlfNormalizedCleanSources.map((row) => row.path));

const sourceTexts = new Map(
  binding.sourceAuthority.productionSources.map((source) => [source.path, readFileSync(join(repo, source.path), "utf8")])
);
const baselineAstReasons = validateAst(sourceTexts, binding);
eq("baseline AST authority validator", [...baselineAstReasons], []);
const baselineCanonicalReasons = validateCanonical(binding, v2);
eq("baseline canonical/rotation validator", [...baselineCanonicalReasons], []);

const oneEpoch = coverage(binding.families, 1, ["MAIN", "HOLDOUT"]);
const twoEpoch = coverage(binding.families, 2, ["MAIN", "HOLDOUT"]);
const fourEpochMain = coverage(binding.families, 4, ["MAIN"]);
eq("single epoch contact 16", oneEpoch.size, 16);
eq("two epoch contact 23", twoEpoch.size, 23);
setEq("two epoch exact IDs", [...twoEpoch], binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
eq("four epoch main contact 23", fourEpochMain.size, 23);
setEq("four epoch exact IDs", [...fourEpochMain], binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
eq("contact not certification", binding.rotation.contactIsCertification, false);
eq("n2 hostile math", [selectedAt(["a", "b"], 1, "MAIN").index, selectedAt(["a", "b"], 1, "HOLDOUT").index], [0, 1]);
eq("n3 hostile math e1", [selectedAt(["a", "b", "c"], 1, "MAIN").index, selectedAt(["a", "b", "c"], 1, "HOLDOUT").index], [0, 2]);
eq("n3 hostile math e2", [selectedAt(["a", "b", "c"], 2, "MAIN").index, selectedAt(["a", "b", "c"], 2, "HOLDOUT").index], [1, 0]);
eq("n4 hostile math e1", [selectedAt(["a", "b", "c", "d"], 1, "MAIN").index, selectedAt(["a", "b", "c", "d"], 1, "HOLDOUT").index], [0, 2]);
eq("n4 hostile math e2", [selectedAt(["a", "b", "c", "d"], 2, "MAIN").index, selectedAt(["a", "b", "c", "d"], 2, "HOLDOUT").index], [1, 3]);

function executeHostileFixture(fixture) {
  const value = clone(binding);
  const actual = clone(actualGitState);
  const texts = new Map([...sourceTexts].map(([path, text]) => [path, text]));
  switch (fixture.mutation) {
    case "CHANGE_ACTUAL_REPO_HEAD_ONLY":
      actual.repoFreeze.repoHeadCommit = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "CHANGE_ACTUAL_REPO_TREE_ONLY":
      actual.repoFreeze.repoHeadTree = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "MAKE_ACTUAL_FIRST_SOURCE_UNTRACKED_AND_NULL":
      actual.sources[0].tracked = false;
      actual.sources[0].headBlobSha1 = null;
      actual.sources[0].lastPathCommit = null;
      actual.sources[0].indexStage = "";
      actual.sources[0].indexBlobSha1 = null;
      actual.sources[0].worktreeFilteredGitBlobSha1 = null;
      actual.sources[0].derivedGitDirty = false;
      actual.sources[0].lsFilesVerbose = "? " + actual.sources[0].path;
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "CHANGE_ACTUAL_FIRST_LAST_PATH_COMMIT":
      actual.sources[0].lastPathCommit = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "CHANGE_ACTUAL_FIRST_PORCELAIN_STATUS":
      actual.sources[0].statusPorcelainV2 = "? " + actual.sources[0].path;
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "CHANGE_ACTUAL_FIRST_INDEX_STAGE":
      actual.sources[0].indexStage = actual.sources[0].indexStage.replace(/[a-f0-9]{40}/, "0".repeat(40));
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "LOWERCASE_ACTUAL_FIRST_LSFILES_FLAG":
      actual.sources[0].lsFilesVerbose = actual.sources[0].lsFilesVerbose[0].toLowerCase() + actual.sources[0].lsFilesVerbose.slice(1);
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "CHANGE_ACTUAL_RAW_BLOB_KEEP_FILTERED_INDEX_AND_STATUS":
      actual.sources[0].worktreeRawGitBlobSha1 = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "CHANGE_ACTUAL_RAW_SHA_AND_BLOB_KEEP_STATUS":
      actual.sources[0].worktreeSha256 = "0".repeat(64);
      actual.sources[0].worktreeRawGitBlobSha1 = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "CHANGE_ROUTE_DEFAULT_MODE_TO_SET": {
      const path = REQUIRED_SOURCE_PATHS[1];
      texts.set(path, replaceOnce(texts.get(path), 'defaultMode="manual"', 'defaultMode="set"'));
      return validateAst(texts, value);
    }
    case "REPLACE_EXAM_ALIAS_WITH_EMPTY_ARRAY": {
      const path = REQUIRED_SOURCE_PATHS[3];
      texts.set(path, replaceOnce(texts.get(path), "export const EXAM_TYPE_GROUPS = QUESTION_TYPE_GROUPS;", "export const EXAM_TYPE_GROUPS = [];"));
      return validateAst(texts, value);
    }
    case "SWAP_PANEL_NON_KOREAN_BRANCH": {
      const path = REQUIRED_SOURCE_PATHS[4];
      texts.set(path, replaceOnce(texts.get(path), "const panelTypeGroups = koPanel ? QUESTION_TYPE_GROUPS_KO : EXAM_TYPE_GROUPS;", "const panelTypeGroups = koPanel ? QUESTION_TYPE_GROUPS_KO : QUESTION_TYPE_GROUPS_KO;"));
      return validateAst(texts, value);
    }
    case "CHANGE_SECONDARY_FAST_ENDPOINT": {
      const path = REQUIRED_SOURCE_PATHS[5];
      texts.set(path, replaceOnce(texts.get(path), 'fetch("/api/workbench/ai-jobs/question-generation/fast"', 'fetch("/api/workbench/ai-jobs/question-generation/fast-mutated"'));
      return validateAst(texts, value);
    }
    case "CHANGE_WORKSPACE_QUESTION_TYPE_PROPERTY": {
      const path = REQUIRED_SOURCE_PATHS[6];
      texts.set(path, replaceOnce(texts.get(path), "questionType: typeId,", "questionTypeRemoved: typeId,"));
      return validateAst(texts, value);
    }
    case "RENAME_FAST_RUNTIME_CALL": {
      const path = REQUIRED_SOURCE_PATHS[8];
      texts.set(path, replaceOnce(texts.get(path), "runQuestionGenerationWithEmptyRetry({", "removedRuntimeCall({"));
      return validateAst(texts, value);
    }
    case "CHANGE_RUNTIME_AI_SCHEMA_INDEX": {
      const path = REQUIRED_SOURCE_PATHS[11];
      texts.set(path, replaceOnce(texts.get(path), "AI_QUESTION_SCHEMAS[subType]", 'AI_QUESTION_SCHEMAS["BLANK_INFERENCE"]'));
      return validateAst(texts, value);
    }
    case "REMOVE_LAST_CANONICAL_NONFOCUS_TYPE":
      value.canonicalUniverse.nonfocusTypeIdsInUiOrder.pop();
      return validateCanonical(value, v2);
    case "DUPLICATE_TOPIC_IN_SECOND_FAMILY":
      value.families[1].rotationOrder.push("TOPIC");
      return validateCanonical(value, v2);
    case "CHANGE_FIRST_SCHEDULE_HOLDOUT":
      value.scheduleRows[0].holdoutTypeId = "MAIN_IDEA";
      return validateCanonical(value, v2);
    case "CORRUPT_V2_UPSTREAM_MANIFEST_HASH":
      value.upstreams[1].manifestSha256 = "0".repeat(64);
      return validateCanonical(value, v2);
    default:
      throw new Error(`Unknown hostile mutation ${fixture.mutation}`);
  }
}

eq("hostile fixture count", hostile.fixtures.length, 20);
eq("hostile fixture IDs unique", new Set(hostile.fixtures.map((fixture) => fixture.fixtureId)).size, 20);
for (const fixture of hostile.fixtures) {
  const reasons = executeHostileFixture(fixture);
  check(`hostile rejected ${fixture.fixtureId}`, reasons.has(fixture.expectedReasonCode), {
    expected: fixture.expectedReasonCode,
    actual: [...reasons]
  });
}

function verifyIndependentAudit() {
  eq("immutable candidate status", binding.status, "SOURCE_AUTHORITY_CANDIDATE_REQUIRES_EXTERNAL_AUDIT");
  eq("external audit required", binding.independentAudit.required, true);
  eq("external immutable-subject mode", binding.independentAudit.mode, "EXTERNAL_IMMUTABLE_SUBJECT");
  eq("audit not embedded", binding.independentAudit.completedInThisArtifact, false);
  eq("candidate alone is not execution authority", binding.issuance.executionEligibleByThisArtifactAlone, false);
  eq("v4 requires external audit manifest", binding.issuance.downstreamV4FreezeRequiresExternalAuditManifest, true);
  eq("candidate alone cannot freeze v4", binding.issuance.downstreamV4FreezeAllowedByThisArtifactAlone, false);
  return "REQUIRED_EXTERNAL";
}

const auditState = verifyIndependentAudit();
for (const [key, value] of Object.entries(binding.activity)) eq(`offline activity ${key}`, value, 0);

if (existsSync(reportPath)) {
  const report = readFileSync(reportPath, "utf8");
  for (const phrase of [
    "V2_SOURCE_AUTHORITY_FAIL_OPEN",
    "repo HEAD",
    "lastPathCommit",
    "porcelain-v2",
    "QUESTION_TYPE_GROUPS",
    "PRIMARY_WORKSPACE",
    "SECONDARY_BATCH",
    "API candidates 0"
  ]) check(`REPORT contains ${phrase}`, report.includes(phrase));
}

if (process.argv.includes("--check-manifest")) {
  check("manifest exists", existsSync(manifestPath));
  if (existsSync(manifestPath)) {
    const expectedFiles = ["REPORT.md", "binding.json", "hostile-fixtures.json", "verify.mjs"];
    const parsed = parseManifest(manifestPath);
    eq("manifest file names", [...parsed.keys()].sort(), [...expectedFiles].sort());
    eq("manifest entry count", parsed.size, expectedFiles.length);
    for (const file of expectedFiles) {
      if (parsed.has(file)) eq(`manifest hash ${file}`, parsed.get(file), sha256File(join(base, file)));
    }
  }
}

const failures = checks.filter((entry) => !entry.pass);
const result = {
  schemaVersion: "reviewer-calibration-v3-production-type-binding-v3-verification-1",
  status:
    failures.length > 0
      ? "FAIL_CLOSED"
      : "PASS_SOURCE_AUTHORITY_CANDIDATE_REQUIRES_EXTERNAL_AUDIT",
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  sourceAuthority: {
    repoHeadCommit: binding.sourceAuthority.repoFreeze.repoHeadCommit,
    trackedProductionSources: binding.sourceAuthority.productionSources.length,
    nullOrUntrackedAccepted: false,
    astAuthorityChainPassed: baselineAstReasons.size === 0
  },
  canonical: {
    uiTypes: binding.canonicalUniverse.uiTypeCount,
    focusTypes: binding.canonicalUniverse.focusTypeIds.length,
    nonfocusTypes: binding.canonicalUniverse.nonfocusTypeCount,
    families: binding.families.length,
    singleEpochContact: oneEpoch.size,
    twoEpochContact: twoEpoch.size,
    fourEpochMainContact: fourEpochMain.size,
    contactIsCertification: binding.rotation.contactIsCertification
  },
  hostileFixtures: {
    total: hostile.fixtures.length,
    rejectedAsExpected: hostile.fixtures.filter((fixture) =>
      executeHostileFixture(fixture).has(fixture.expectedReasonCode)
    ).length
  },
  independentAudit: auditState,
  activity: binding.activity,
  failures
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
