import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, posix, resolve } from "node:path";
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

const PATHS = Object.freeze({
  ui: "src/lib/question-type-ui.ts",
  route: "src/app/(director)/director/workbench/questions/generate/page.tsx",
  client: "src/app/(director)/director/workbench/generate/generate-page-client.tsx",
  alias: "src/app/(director)/director/workbench/generate/generate-page-types.ts",
  panel: "src/app/(director)/director/workbench/generate/generation-config-panel.tsx",
  workspaceSurface: "src/app/(director)/director/workbench/generate/workspace/passage-workspace.tsx",
  rowSurface: "src/app/(director)/director/workbench/generate/workspace/workspace-passage-row.tsx",
  modal: "src/app/(director)/director/workbench/generate/workspace/passage-generate-modal.tsx",
  mobileNav: "src/components/workbench/mobile-step-flow.tsx",
  workspaceTypes: "src/app/(director)/director/workbench/generate/workspace/workspace-types.ts",
  workspaceHook: "src/app/(director)/director/workbench/generate/workspace/use-workspace-generation.ts",
  sharedHandlers: "src/app/(director)/director/workbench/generate/use-generation-handlers.ts",
  scheduler: "src/app/(director)/director/workbench/generate/fast-generation-scheduler.ts",
  fastRoute: "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  assignmentBudget: "src/lib/question-generation-assignment-budget.ts",
  runtime: "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  passageGrid: "src/app/(director)/director/workbench/generate/passage-card-grid.tsx",
  numericDetail: "src/app/(director)/director/workbench/generate/generation-config-panel-parts/type-numeric-detail.tsx",
  aiMc: "src/lib/question-ai-schemas-mc.ts",
  aiVocab: "src/lib/question-ai-schemas-vocab.ts",
  structured: "src/lib/question-schemas.ts"
});

const INTERACTIVE_AUTHORITY_PATHS = [
  PATHS.ui,
  PATHS.route,
  PATHS.client,
  PATHS.alias,
  PATHS.panel,
  PATHS.workspaceSurface,
  PATHS.rowSurface,
  PATHS.modal,
  PATHS.mobileNav,
  PATHS.workspaceTypes,
  PATHS.workspaceHook,
  PATHS.sharedHandlers,
  PATHS.scheduler,
  PATHS.fastRoute,
  PATHS.assignmentBudget,
  PATHS.runtime
];

const EXCLUDED_ROUTE_EVIDENCE_PATHS = [
  PATHS.passageGrid,
  PATHS.numericDetail
];

const TRANSITIVE_RUNTIME_ROOTS = [
  PATHS.fastRoute,
  PATHS.assignmentBudget,
  PATHS.runtime,
  PATHS.aiMc,
  PATHS.aiVocab,
  PATHS.structured
];

const BASE_REQUIRED_SOURCE_PATHS = [
  ...new Set([...INTERACTIVE_AUTHORITY_PATHS, ...EXCLUDED_ROUTE_EVIDENCE_PATHS])
];

const DISCOVERED_TRANSITIVE_GRAPH = computeTransitiveImportGraph(new Map(), TRANSITIVE_RUNTIME_ROOTS);
const REQUIRED_SOURCE_PATHS = [
  ...new Set([...BASE_REQUIRED_SOURCE_PATHS, ...DISCOVERED_TRANSITIVE_GRAPH.closurePaths])
];

const EXPECTED_UPSTREAMS = new Map([
  [
    "reviewer-calibration-v3-production-type-binding-v3",
    "d01349a4856097992ea4ef48f65221ed6adb44ca4b7baad9198d99ecb9638481"
  ],
  [
    "reviewer-calibration-v3-production-type-binding-v3-independent-audit-v1",
    "6723b1109d7ff65326745e44b449919b4b3e6e1854c1067f3883d0be5153c0f3"
  ]
]);

const EXPECTED_V3_BLOCKERS = [
  "SECONDARY_BATCH_NOT_REACHABLE_FROM_REQUESTED_ROUTE",
  "LEGACY_TRIGGER_BRANCH_IS_DEAD_CODE",
  "SCHEMA_RUNTIME_SOURCE_CLOSURE_FAIL_OPEN",
  "INTERACTIVE_DISPATCH_CLOSURE_INCOMPLETE"
];

function check(name, condition, detail) {
  const row = { name, pass: Boolean(condition) };
  if (detail !== undefined) row.detail = detail;
  checks.push(row);
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
  return String(value || "").replace(/\r\n/g, "\n").trimEnd();
}

function git(args, allowFailure, input) {
  const result = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    input
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error("git " + args.join(" ") + " failed: " + result.stderr);
  }
  return {
    status: result.status,
    stdout: normalizeOutput(result.stdout),
    stderr: normalizeOutput(result.stderr)
  };
}

function runNode(path, args) {
  return spawnSync(process.execPath, [path, ...(args || [])], {
    cwd: dirname(path),
    encoding: "utf8"
  });
}

function parseManifest(path) {
  const rows = new Map();
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error("Invalid manifest line: " + line);
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
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(current)) ||
      ts.isParenthesizedExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function parseSourceText(path, text) {
  const kind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : path.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
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

function findNodes(root, predicate) {
  const found = [];
  function visit(node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

function variableDeclaration(ast, name) {
  return findNode(
    ast,
    (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
  );
}

function initializer(ast, name) {
  const declaration = variableDeclaration(ast, name);
  return declaration && declaration.initializer ? unwrap(declaration.initializer) : undefined;
}

function functionLike(ast, name) {
  const declaration = findNode(
    ast,
    (node) => ts.isFunctionDeclaration(node) && node.name && node.name.text === name
  );
  if (declaration) return declaration;
  const value = initializer(ast, name);
  if (!value) return undefined;
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return value;
  if (ts.isCallExpression(value)) {
    const first = unwrap(value.arguments[0]);
    if (first && (ts.isArrowFunction(first) || ts.isFunctionExpression(first))) return first;
  }
  return undefined;
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
  const object = objectLiteralFromInitializer(initializer(ast, name));
  if (!object) return [];
  return object.properties
    .filter((property) => !ts.isSpreadAssignment(property))
    .map((property) => propertyName(property.name))
    .filter(Boolean);
}

function objectSpreadIdentifiers(ast, name) {
  const object = objectLiteralFromInitializer(initializer(ast, name));
  if (!object) return [];
  return object.properties
    .filter(ts.isSpreadAssignment)
    .map((property) => unwrap(property.expression))
    .filter(ts.isIdentifier)
    .map((identifier) => identifier.text);
}

function uiReferences(ast) {
  const root = initializer(ast, "QUESTION_TYPE_GROUPS");
  const ids = [];
  if (!root) return ids;
  function visit(node) {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "QUESTION_TYPE_UI"
    ) ids.push(node.name.text);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return ids;
}

function hasNamedImport(ast, moduleName, importedName, localName) {
  const expectedLocal = localName || importedName;
  return Boolean(findNode(ast, (node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return false;
    if (node.moduleSpecifier.text !== moduleName) return false;
    const bindings = node.importClause && node.importClause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return false;
    return bindings.elements.some((element) => {
      const imported = element.propertyName ? element.propertyName.text : element.name.text;
      return imported === importedName && element.name.text === expectedLocal;
    });
  }));
}

function hasNamespaceImport(ast, moduleName, localName) {
  return Boolean(findNode(ast, (node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return false;
    if (node.moduleSpecifier.text !== moduleName) return false;
    const bindings = node.importClause && node.importClause.namedBindings;
    return Boolean(bindings && ts.isNamespaceImport(bindings) && bindings.name.text === localName);
  }));
}

function hasAnyImport(ast, moduleName) {
  return Boolean(findNode(ast, (node) =>
    ts.isImportDeclaration(node) &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    node.moduleSpecifier.text === moduleName
  ));
}

function jsxTagName(node, ast) {
  return node.tagName.getText(ast);
}

function jsxOpenings(ast, tagName) {
  return findNodes(ast, (node) =>
    (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
    jsxTagName(node, ast) === tagName
  );
}

function jsxAttribute(node, name) {
  return node.attributes.properties.find(
    (candidate) => ts.isJsxAttribute(candidate) && candidate.name.text === name
  );
}

function jsxAttributeExpression(node, name) {
  const attribute = jsxAttribute(node, name);
  if (!attribute || !attribute.initializer) return undefined;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer;
  if (ts.isJsxExpression(attribute.initializer)) return unwrap(attribute.initializer.expression);
  return undefined;
}

function jsxHasLiteral(ast, tagName, attributeName, value) {
  return jsxOpenings(ast, tagName).some((node) => {
    const expression = jsxAttributeExpression(node, attributeName);
    return Boolean(expression && ts.isStringLiteral(expression) && expression.text === value);
  });
}

function jsxHasIdentifier(ast, tagName, attributeName, value) {
  return jsxOpenings(ast, tagName).some((node) => {
    const expression = jsxAttributeExpression(node, attributeName);
    return Boolean(expression && ts.isIdentifier(expression) && expression.text === value);
  });
}

function jsxHasBooleanTrue(ast, tagName, attributeName) {
  return jsxOpenings(ast, tagName).some((node) => {
    const attribute = jsxAttribute(node, attributeName);
    if (!attribute) return false;
    if (!attribute.initializer) return true;
    const expression = jsxAttributeExpression(node, attributeName);
    return expression && expression.kind === ts.SyntaxKind.TrueKeyword;
  });
}

function callExpressions(root, calleeName) {
  return findNodes(root, (node) =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === calleeName
  );
}

function hasCall(root, calleeName, argumentNames) {
  return callExpressions(root, calleeName).some((call) => {
    if (!argumentNames) return true;
    if (call.arguments.length !== argumentNames.length) return false;
    return argumentNames.every((name, index) => {
      const argument = unwrap(call.arguments[index]);
      if (name.includes(".")) return Boolean(argument && argument.getText() === name);
      return ts.isIdentifier(argument) && argument.text === name;
    });
  });
}

function callObjectLiteral(root, calleeName) {
  for (const call of callExpressions(root, calleeName)) {
    const first = unwrap(call.arguments[0]);
    if (first && ts.isObjectLiteralExpression(first)) return first;
  }
  return undefined;
}

function objectPropertyValue(object, name) {
  if (!object) return undefined;
  const property = object.properties.find((candidate) => propertyName(candidate.name) === name);
  if (!property) return undefined;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  if (ts.isPropertyAssignment(property)) return unwrap(property.initializer);
  return undefined;
}

function objectHasIdentifier(object, key, identifier) {
  const value = objectPropertyValue(object, key);
  return Boolean(value && ts.isIdentifier(value) && value.text === identifier);
}

function objectHasPropertyAccess(object, key, objectName, memberName) {
  const value = objectPropertyValue(object, key);
  return Boolean(
    value &&
    ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === objectName &&
    value.name.text === memberName
  );
}

function containsElementAccess(root, objectName, argumentName) {
  return Boolean(findNode(root, (node) => {
    if (!ts.isElementAccessExpression(node) || !ts.isIdentifier(node.expression)) return false;
    const argument = unwrap(node.argumentExpression);
    return node.expression.text === objectName && ts.isIdentifier(argument) && argument.text === argumentName;
  }));
}

function containsPropertyAssignment(root, key, predicate) {
  return Boolean(findNode(root, (node) => {
    if (!ts.isPropertyAssignment(node) || propertyName(node.name) !== key) return false;
    return predicate(unwrap(node.initializer));
  }));
}

function strictEqualityText(root, ast, leftName, literal) {
  return Boolean(findNode(root, (node) => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return false;
    const left = unwrap(node.left);
    const right = unwrap(node.right);
    return ts.isIdentifier(left) && left.text === leftName && ts.isStringLiteral(right) && right.text === literal;
  }));
}

function hasDestructuredHookBinding(ast, hookName, bindingName) {
  return Boolean(findNode(ast, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isObjectBindingPattern(node.name) || !node.initializer) return false;
    const value = unwrap(node.initializer);
    if (!ts.isCallExpression(value) || !ts.isIdentifier(value.expression) || value.expression.text !== hookName) return false;
    return node.name.elements.some((element) => element.name.getText(ast) === bindingName);
  }));
}

function selectedAt(rotationOrder, epoch, role) {
  const n = rotationOrder.length;
  const mainIndex = (epoch - 1) % n;
  const holdoutIndex = (epoch - 1 + Math.ceil(n / 2)) % n;
  const index = role === "MAIN" ? mainIndex : holdoutIndex;
  return { index, typeId: rotationOrder[index] };
}

function materializeRows(families, epochs) {
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
    v3FailureProvenance: value.v3FailureProvenance,
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

function sourceSemanticView(value) {
  return {
    repoFreeze: value.repoFreeze,
    deployedCommitParity: value.deployedCommitParity,
    closureBoundary: value.closureBoundary,
    transitiveClosurePolicy: value.transitiveClosurePolicy,
    interactiveAuthorityPaths: value.interactiveAuthorityPaths,
    excludedRouteEvidencePaths: value.excludedRouteEvidencePaths,
    transitiveRuntimeRoots: value.transitiveRuntimeRoots,
    transitiveRuntimeClosure: value.transitiveRuntimeClosure,
    transitiveImportEdges: value.transitiveImportEdges,
    nonLiteralModuleLoads: value.nonLiteralModuleLoads,
    unresolvedLocalImports: value.unresolvedLocalImports,
    worktreeOnlyPaths: value.worktreeOnlyPaths,
    productionSources: value.productionSources
  };
}

function linesByPath(output, paths, kind) {
  const map = new Map(paths.map((path) => [path, ""]));
  if (!output) return map;
  for (const line of output.split("\n").filter(Boolean)) {
    let matched;
    for (const path of paths) {
      if (
        line === "? " + path ||
        line.endsWith("\t" + path) ||
        line.endsWith(" " + path) ||
        line.includes("\t" + path + "\t")
      ) {
        matched = path;
        break;
      }
    }
    if (matched) {
      const prior = map.get(matched);
      map.set(matched, prior ? prior + "\n" + line : line);
    } else if (kind === "status") {
      map.set("__UNMAPPED__", (map.get("__UNMAPPED__") || "") + line + "\n");
    }
  }
  return map;
}

function collectActualState(expected) {
  const paths = expected.productionSources.map((source) => source.path);
  const existingPaths = paths.filter((path) => existsSync(join(repo, path)));
  const input = existingPaths.join("\n") + (existingPaths.length ? "\n" : "");
  const rawHashes = git(["hash-object", "--no-filters", "--stdin-paths"], false, input).stdout.split("\n").filter(Boolean);
  const filteredHashes = git(["hash-object", "--stdin-paths"], false, input).stdout.split("\n").filter(Boolean);
  const rawByPath = new Map(existingPaths.map((path, index) => [path, rawHashes[index] || null]));
  const filteredByPath = new Map(existingPaths.map((path, index) => [path, filteredHashes[index] || null]));

  const stageOutput = git(["ls-files", "--stage", "--", ...paths], true).stdout;
  const stageByPath = linesByPath(stageOutput, paths, "stage");
  const verboseOutput = git(["ls-files", "-v", "--", ...paths], true).stdout;
  const verboseByPath = linesByPath(verboseOutput, paths, "verbose");
  const statusOutput = git(["status", "--porcelain=v2", "--untracked-files=all", "--", ...paths], true).stdout;
  const statusByPath = linesByPath(statusOutput, paths, "status");
  const headOutput = git(["ls-tree", "-r", "--full-tree", "HEAD", "--", ...paths], true).stdout;
  const headByPath = linesByPath(headOutput, paths, "head");

  const sources = paths.map((path) => {
    const absolute = join(repo, path);
    const exists = existsSync(absolute);
    const indexStage = stageByPath.get(path) || "";
    const stageMatch = /^\d+ ([a-f0-9]{40}) \d+\t/.exec(indexStage);
    const indexBlobSha1 = stageMatch ? stageMatch[1] : null;
    const headLine = headByPath.get(path) || "";
    const headMatch = /^\d+ blob ([a-f0-9]{40})\t/.exec(headLine);
    const headBlobSha1 = headMatch ? headMatch[1] : null;
    const tracked = Boolean(indexStage);
    const lastResult = tracked ? git(["log", "-1", "--format=%H", "--", path], true) : { stdout: "" };
    const filtered = filteredByPath.get(path) || null;
    return {
      path,
      exists,
      tracked,
      sourceState: tracked ? "TRACKED_WORKTREE" : "WORKTREE_ONLY_UNTRACKED",
      worktreeSha256: exists ? sha256File(absolute) : null,
      worktreeRawGitBlobSha1: rawByPath.get(path) || null,
      worktreeFilteredGitBlobSha1: filtered,
      indexStage,
      indexBlobSha1,
      derivedGitDirty: tracked && filtered && indexBlobSha1 ? filtered !== indexBlobSha1 : null,
      headBlobSha1,
      lastPathCommit: tracked && lastResult.stdout ? lastResult.stdout : null,
      statusPorcelainV2: statusByPath.get(path) || "",
      lsFilesVerbose: verboseByPath.get(path) || "",
      worktreeMatchesHead: tracked && filtered && headBlobSha1 ? filtered === headBlobSha1 : false
    };
  });

  return {
    repoFreeze: {
      repoHeadCommit: git(["rev-parse", "--verify", "HEAD^{commit}"], false).stdout,
      repoHeadTree: git(["rev-parse", "HEAD^{tree}"], false).stdout,
      headRef: git(["symbolic-ref", "--quiet", "HEAD"], true).stdout
    },
    unmappedStatus: statusByPath.get("__UNMAPPED__") || "",
    sources
  };
}

function validateGitSnapshot(expected, actual) {
  const reasons = new Set();
  if (actual.repoFreeze.repoHeadCommit !== expected.repoFreeze.repoHeadCommit) reasons.add("REPO_HEAD_DRIFT");
  if (actual.repoFreeze.repoHeadTree !== expected.repoFreeze.repoHeadTree) reasons.add("REPO_TREE_DRIFT");
  if (actual.repoFreeze.headRef !== expected.repoFreeze.headRef) reasons.add("REPO_REF_DRIFT");
  if (actual.unmappedStatus) reasons.add("SOURCE_STATUS_UNMAPPED");
  if (expected.deployedCommitParity !== false) reasons.add("DEPLOYED_PARITY_INVALID");
  if (expected.closureBoundary !== "CURRENT_WORKTREE_FULL_TRANSITIVE_LOCAL_STATIC_RUNTIME_CLOSURE") {
    reasons.add("CLOSURE_BOUNDARY_INVALID");
  }
  if (JSON.stringify(expected.productionSources.map((row) => row.path)) !== JSON.stringify(REQUIRED_SOURCE_PATHS)) {
    reasons.add("SOURCE_SET_INVALID");
  }
  if (duplicates(expected.productionSources.map((row) => row.path)).length > 0) reasons.add("SOURCE_SET_INVALID");
  const declaredUntracked = expected.productionSources
    .filter((source) => source.sourceState === "WORKTREE_ONLY_UNTRACKED")
    .map((source) => source.path);
  if (JSON.stringify(expected.worktreeOnlyPaths) !== JSON.stringify(declaredUntracked)) reasons.add("WORKTREE_ONLY_SET_INVALID");
  const actualByPath = new Map(actual.sources.map((row) => [row.path, row]));
  for (const source of expected.productionSources) {
    const current = actualByPath.get(source.path);
    if (!current) {
      reasons.add("SOURCE_SET_INVALID");
      continue;
    }
    const mustBeUntracked = expected.worktreeOnlyPaths.includes(source.path);
    if (mustBeUntracked) {
      const expectedValid =
        source.sourceState === "WORKTREE_ONLY_UNTRACKED" &&
        source.deployedCommitParity === false &&
        source.indexStage === "" &&
        source.indexBlobSha1 === null &&
        source.headBlobSha1 === null &&
        source.lastPathCommit === null &&
        source.lsFilesVerbose === "" &&
        source.statusPorcelainV2 === "? " + source.path &&
        source.derivedGitDirty === null &&
        source.worktreeMatchesHead === false;
      const currentValid =
        current.exists === true &&
        current.tracked === false &&
        current.sourceState === "WORKTREE_ONLY_UNTRACKED" &&
        current.indexStage === "" &&
        current.indexBlobSha1 === null &&
        current.headBlobSha1 === null &&
        current.lastPathCommit === null &&
        current.lsFilesVerbose === "" &&
        current.statusPorcelainV2 === "? " + source.path;
      if (!expectedValid || !currentValid) reasons.add("WORKTREE_ONLY_STATE_INVALID");
    } else {
      const expectedValid =
        source.sourceState === "TRACKED_WORKTREE" &&
        /^[a-f0-9]{40}$/.test(source.indexBlobSha1 || "") &&
        /^[a-f0-9]{40}$/.test(source.headBlobSha1 || "") &&
        /^[a-f0-9]{40}$/.test(source.lastPathCommit || "") &&
        /^[A-Z] /.test(source.lsFilesVerbose || "") &&
        source.derivedGitDirty === (source.worktreeFilteredGitBlobSha1 !== source.indexBlobSha1) &&
        source.worktreeMatchesHead === (source.worktreeFilteredGitBlobSha1 === source.headBlobSha1);
      const currentValid =
        current.exists === true &&
        current.tracked === true &&
        current.sourceState === "TRACKED_WORKTREE" &&
        /^[a-f0-9]{40}$/.test(current.indexBlobSha1 || "") &&
        /^[a-f0-9]{40}$/.test(current.headBlobSha1 || "") &&
        /^[a-f0-9]{40}$/.test(current.lastPathCommit || "") &&
        /^[A-Z] /.test(current.lsFilesVerbose || "");
      if (!expectedValid || !currentValid) reasons.add("TRACKED_SOURCE_STATE_INVALID");
    }
    if (current.worktreeSha256 !== source.worktreeSha256) reasons.add("WORKTREE_SHA_DRIFT");
    if (current.worktreeRawGitBlobSha1 !== source.worktreeRawGitBlobSha1) reasons.add("WORKTREE_RAW_GIT_BLOB_DRIFT");
    if (current.worktreeFilteredGitBlobSha1 !== source.worktreeFilteredGitBlobSha1) reasons.add("WORKTREE_FILTERED_GIT_BLOB_DRIFT");
    if (current.indexStage !== source.indexStage || current.indexBlobSha1 !== source.indexBlobSha1) reasons.add("INDEX_STAGE_DRIFT");
    if (current.derivedGitDirty !== source.derivedGitDirty) reasons.add("DERIVED_GIT_DIRTY_DRIFT");
    if (current.headBlobSha1 !== source.headBlobSha1) reasons.add("HEAD_BLOB_DRIFT");
    if (current.lastPathCommit !== source.lastPathCommit) reasons.add("LAST_PATH_COMMIT_DRIFT");
    if (current.statusPorcelainV2 !== source.statusPorcelainV2) reasons.add("PATH_STATUS_DRIFT");
    if (current.lsFilesVerbose !== source.lsFilesVerbose) reasons.add("LSFILES_FLAG_DRIFT");
    if (current.worktreeMatchesHead !== source.worktreeMatchesHead) reasons.add("HEAD_WORKTREE_PARITY_DRIFT");
  }
  return reasons;
}

function resolveLocalModule(fromPath, specifier) {
  let basePath;
  if (specifier.startsWith("@/")) basePath = "src/" + specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    basePath = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  } else return null;
  const candidates = [];
  if (extname(basePath)) candidates.push(basePath);
  else {
    candidates.push(
      basePath + ".ts", basePath + ".tsx", basePath + ".mts", basePath + ".cts",
      basePath + ".js", basePath + ".jsx", basePath + ".mjs", basePath + ".cjs", basePath + ".json"
    );
    candidates.push(
      posix.join(basePath, "index.ts"), posix.join(basePath, "index.tsx"),
      posix.join(basePath, "index.mts"), posix.join(basePath, "index.cts"),
      posix.join(basePath, "index.js"), posix.join(basePath, "index.jsx"),
      posix.join(basePath, "index.mjs"), posix.join(basePath, "index.cjs"),
      posix.join(basePath, "index.json")
    );
  }
  return candidates.find((candidate) => existsSync(join(repo, candidate))) || "UNRESOLVED::" + fromPath + "::" + specifier;
}

function directImportSpecifiers(ast) {
  const values = [];
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      values.push(statement.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      values.push(statement.moduleSpecifier.text);
    }
  }
  return values;
}

function staticModuleEdges(ast, fromPath) {
  const edges = [];
  const nonLiteral = [];
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      const allNamedTypeOnly = Boolean(
        clause && clause.namedBindings && ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.length > 0 &&
        clause.namedBindings.elements.every((element) => element.isTypeOnly)
      );
      edges.push({
        from: fromPath,
        specifier: statement.moduleSpecifier.text,
        edgeKind: clause && (clause.isTypeOnly || allNamedTypeOnly) ? "IMPORT_TYPE_ONLY_INCLUDED" : "IMPORT_RUNTIME_OR_MIXED",
        position: statement.pos
      });
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const allNamedTypeOnly = Boolean(
        statement.exportClause && ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.length > 0 &&
        statement.exportClause.elements.every((element) => element.isTypeOnly)
      );
      edges.push({
        from: fromPath,
        specifier: statement.moduleSpecifier.text,
        edgeKind: statement.isTypeOnly || allNamedTypeOnly ? "EXPORT_TYPE_ONLY_INCLUDED" : "EXPORT_RUNTIME_OR_MIXED",
        position: statement.pos
      });
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) {
        const argument = node.arguments[0] && unwrap(node.arguments[0]);
        if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
          edges.push({
            from: fromPath,
            specifier: argument.text,
            edgeKind: isDynamicImport ? "DYNAMIC_IMPORT_LITERAL" : "REQUIRE_LITERAL",
            position: node.pos
          });
        } else {
          nonLiteral.push({
            path: fromPath,
            loadKind: isDynamicImport ? "DYNAMIC_IMPORT_NON_LITERAL" : "REQUIRE_NON_LITERAL",
            position: node.pos
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { edges, nonLiteral };
}

function computeTransitiveImportGraph(texts, roots) {
  const closure = new Set(roots);
  const queue = [...roots];
  const visited = new Set();
  const edges = [];
  const unresolved = [];
  const nonLiteral = [];
  while (queue.length > 0) {
    const path = queue.shift();
    if (visited.has(path)) continue;
    visited.add(path);
    const absolute = join(repo, path);
    if (!existsSync(absolute)) {
      unresolved.push({ from: path, specifier: "<root-or-discovered-path-missing>", edgeKind: "MISSING_LOCAL_FILE" });
      continue;
    }
    if (/\.json$/i.test(path)) continue;
    const text = texts.has(path) ? texts.get(path) : readFileSync(absolute, "utf8");
    const ast = parseSourceText(path, text);
    const discovered = staticModuleEdges(ast, path);
    nonLiteral.push(...discovered.nonLiteral);
    for (const edge of discovered.edges) {
      const resolvedPath = resolveLocalModule(path, edge.specifier);
      if (!resolvedPath) continue;
      if (resolvedPath.startsWith("UNRESOLVED::")) {
        unresolved.push({ ...edge, resolvedPath });
        continue;
      }
      const complete = { ...edge, to: resolvedPath };
      edges.push(complete);
      if (!closure.has(resolvedPath)) {
        closure.add(resolvedPath);
        queue.push(resolvedPath);
      }
    }
  }
  const edgeOrder = (left, right) =>
    left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to) ||
    left.edgeKind.localeCompare(right.edgeKind) ||
    left.specifier.localeCompare(right.specifier) ||
    left.position - right.position;
  return {
    closurePaths: [...closure].sort(),
    edges: edges.sort(edgeOrder),
    unresolved: unresolved.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    nonLiteral: nonLiteral.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  };
}

function conditionalIdentifiers(node) {
  const value = unwrap(node);
  if (!value || !ts.isConditionalExpression(value)) return null;
  const whenTrue = unwrap(value.whenTrue);
  const whenFalse = unwrap(value.whenFalse);
  return {
    whenTrue: ts.isIdentifier(whenTrue) ? whenTrue.text : null,
    whenFalse: ts.isIdentifier(whenFalse) ? whenFalse.text : null
  };
}

function resolveCriticalSubtree(texts, selector) {
  const text = texts.has(selector.path) ? texts.get(selector.path) : readFileSync(join(repo, selector.path), "utf8");
  const ast = parseSourceText(selector.path, text);
  if (selector.selectorType === "FUNCTION") return functionLike(ast, selector.name);
  if (selector.selectorType === "INITIALIZER") return initializer(ast, selector.name);
  if (selector.selectorType === "JSX_OPENING") return jsxOpenings(ast, selector.tagName)[selector.index || 0];
  if (selector.selectorType === "CALL_CONTAINING_FUNCTION") {
    const functions = findNodes(ast, (node) => ts.isArrowFunction(node) || ts.isFunctionExpression(node));
    return functions.find((node) => hasCall(node, selector.calleeName));
  }
  return undefined;
}

function validateCriticalSubtrees(texts, criticalSubtrees) {
  const drift = [];
  for (const selector of criticalSubtrees || []) {
    const node = resolveCriticalSubtree(texts, selector);
    const actual = node ? sha256Bytes(node.getText()) : null;
    if (actual !== selector.semanticSha256) {
      drift.push({ selectorId: selector.selectorId, actual, expected: selector.semanticSha256 });
    }
  }
  return drift;
}

function validateAst(texts, value) {
  const reasons = new Set();
  const astCache = new Map();
  const ast = (path) => {
    if (!astCache.has(path)) astCache.set(path, parseSourceText(path, texts.get(path)));
    return astCache.get(path);
  };

  const uiAst = ast(PATHS.ui);
  const routeAst = ast(PATHS.route);
  const clientAst = ast(PATHS.client);
  const aliasAst = ast(PATHS.alias);
  const panelAst = ast(PATHS.panel);
  const workspaceSurfaceAst = ast(PATHS.workspaceSurface);
  const rowSurfaceAst = ast(PATHS.rowSurface);
  const modalAst = ast(PATHS.modal);
  const mobileNavAst = ast(PATHS.mobileNav);
  const workspaceAst = ast(PATHS.workspaceHook);
  const handlersAst = ast(PATHS.sharedHandlers);
  const schedulerAst = ast(PATHS.scheduler);
  const fastRouteAst = ast(PATHS.fastRoute);
  const assignmentAst = ast(PATHS.assignmentBudget);
  const runtimeAst = ast(PATHS.runtime);
  const passageGridAst = ast(PATHS.passageGrid);
  const numericDetailAst = ast(PATHS.numericDetail);
  const aiMcAst = ast(PATHS.aiMc);
  const aiVocabAst = ast(PATHS.aiVocab);
  const structuredAst = ast(PATHS.structured);

  const computedGraph = computeTransitiveImportGraph(texts, TRANSITIVE_RUNTIME_ROOTS);
  if (
    JSON.stringify(value.sourceAuthority.transitiveRuntimeRoots) !== JSON.stringify(TRANSITIVE_RUNTIME_ROOTS) ||
    JSON.stringify(value.sourceAuthority.transitiveRuntimeClosure) !== JSON.stringify(DISCOVERED_TRANSITIVE_GRAPH.closurePaths) ||
    JSON.stringify(computedGraph.closurePaths) !== JSON.stringify(DISCOVERED_TRANSITIVE_GRAPH.closurePaths) ||
    JSON.stringify(value.sourceAuthority.transitiveImportEdges) !== JSON.stringify(DISCOVERED_TRANSITIVE_GRAPH.edges) ||
    JSON.stringify(computedGraph.edges) !== JSON.stringify(DISCOVERED_TRANSITIVE_GRAPH.edges) ||
    JSON.stringify(value.sourceAuthority.unresolvedLocalImports) !== JSON.stringify(computedGraph.unresolved) ||
    JSON.stringify(value.sourceAuthority.nonLiteralModuleLoads) !== JSON.stringify(computedGraph.nonLiteral)
  ) reasons.add("TRANSITIVE_IMPORT_CLOSURE_DRIFT");
  if (computedGraph.unresolved.length > 0) reasons.add("UNRESOLVED_LOCAL_IMPORT");
  if (computedGraph.nonLiteral.length > 0) reasons.add("NON_LITERAL_MODULE_LOAD");

  const subtreeDrift = validateCriticalSubtrees(texts, value.astAuthorityChain.criticalSubtrees);
  if (subtreeDrift.length > 0) reasons.add("AUTHORITY_SUBTREE_DRIFT");

  const uiIds = uiReferences(uiAst);
  if (
    JSON.stringify(uiIds) !== JSON.stringify(value.canonicalUniverse.uiTypeIdsInOrder) ||
    duplicates(uiIds).length > 0 ||
    uiIds.includes("TOPIC_MAIN_IDEA")
  ) reasons.add("UI_REGISTRY_AST_BROKEN");

  const routeNodes = jsxOpenings(routeAst, "GeneratePageClient");
  const routeExact = routeNodes.some((node) =>
    jsxAttributeExpression(node, "defaultMode") &&
    !jsxAttribute(node, "subjectScope")
  );
  if (
    !hasNamedImport(routeAst, "../../generate/generate-page-client", "GeneratePageClient") ||
    !jsxHasLiteral(routeAst, "GeneratePageClient", "defaultMode", "manual") ||
    !routeExact
  ) reasons.add("ROUTE_ENTRY_AST_BROKEN");

  const aliasValue = initializer(aliasAst, "EXAM_TYPE_GROUPS");
  if (
    !hasNamedImport(aliasAst, "@/lib/question-type-ui", "QUESTION_TYPE_GROUPS") ||
    !aliasValue || !ts.isIdentifier(aliasValue) || aliasValue.text !== "QUESTION_TYPE_GROUPS"
  ) reasons.add("PICKER_ALIAS_AST_BROKEN");

  const panelBranch = conditionalIdentifiers(initializer(panelAst, "panelTypeGroups"));
  const applyCount = functionLike(panelAst, "applyTypeCount");
  const incrementCount = functionLike(panelAst, "incrementTypeCount");
  const applySetter = applyCount ? callExpressions(applyCount, "setTypeCounts") : [];
  const incrementSetter = incrementCount ? callExpressions(incrementCount, "setTypeCounts") : [];
  if (
    !hasNamedImport(panelAst, "./generate-page-types", "EXAM_TYPE_GROUPS") ||
    !hasNamedImport(panelAst, "@/lib/question-type-ui", "QUESTION_TYPE_GROUPS_KO") ||
    !strictEqualityText(panelAst, panelAst, "passageSubject", "KOREAN") ||
    !panelBranch || panelBranch.whenTrue !== "QUESTION_TYPE_GROUPS_KO" || panelBranch.whenFalse !== "EXAM_TYPE_GROUPS" ||
    applySetter.length === 0 || incrementSetter.length === 0 ||
    !containsElementAccess(applyCount || panelAst, "draft", "id") ||
    !containsElementAccess(incrementCount || panelAst, "draft", "id")
  ) reasons.add("PANEL_PICKER_AST_BROKEN");

  const clientFn = functionLike(clientAst, "GeneratePageClient");
  const setActive = functionLike(clientAst, "handleSetActiveRow");
  const activeGenerate = functionLike(clientAst, "handleGenerateActiveRow");
  const koSetMode = initializer(clientAst, "koSetMode");
  const modalNodes = jsxOpenings(clientAst, "PassageGenerateModal");
  const modalNode = modalNodes[0];
  const modalGenerate = modalNode ? jsxAttributeExpression(modalNode, "onGenerate") : undefined;
  const modalGenerateBranch = conditionalIdentifiers(modalGenerate);
  const panelNodes = jsxOpenings(clientAst, "GenerationConfigPanel");
  const panelNode = panelNodes[0];
  const desktopSurfaceConnected = jsxHasIdentifier(clientAst, "PassageWorkspace", "onOpenRowSettings", "handleSetActiveRow");
  if (
    !clientFn ||
    !hasNamedImport(clientAst, "./workspace/use-workspace-generation", "useWorkspaceGeneration") ||
    !hasNamedImport(clientAst, "./workspace/passage-workspace", "PassageWorkspace") ||
    !hasNamedImport(clientAst, "./workspace/passage-generate-modal", "PassageGenerateModal") ||
    !hasDestructuredHookBinding(clientAst, "useWorkspaceGeneration", "handleWorkspaceGenerate") ||
    !desktopSurfaceConnected ||
    !setActive || !hasCall(setActive, "selectRow", ["localId"]) ||
    callExpressions(setActive, "setGenModalOpen").every((call) => call.arguments[0] && call.arguments[0].kind !== ts.SyntaxKind.TrueKeyword)
  ) reasons.add("DESKTOP_EVENT_SURFACE_AST_BROKEN");

  if (
    !activeGenerate || !hasCall(activeGenerate, "handleWorkspaceGenerate", ["activeRowId"]) ||
    !koSetMode || !strictEqualityText(koSetMode, clientAst, "activeRowSubject", "KOREAN") ||
    !modalGenerateBranch || modalGenerateBranch.whenFalse !== "handleGenerateActiveRow" ||
    !modalNode || !jsxHasIdentifier(clientAst, "PassageGenerateModal", "configOnly", "isMobileViewport") ||
    !panelNode ||
    !jsxHasIdentifier(clientAst, "GenerationConfigPanel", "passageSubject", "activeRowSubject") ||
    !jsxHasIdentifier(clientAst, "GenerationConfigPanel", "typeCounts", "panelTypeCounts") ||
    !jsxHasIdentifier(clientAst, "GenerationConfigPanel", "setTypeCount", "panelSetTypeCount") ||
    !jsxHasIdentifier(clientAst, "GenerationConfigPanel", "setTypeCounts", "panelSetTypeCounts") ||
    !jsxHasBooleanTrue(clientAst, "GenerationConfigPanel", "hideGenerateButtons")
  ) reasons.add("MODAL_DISPATCH_AST_BROKEN");

  const workspaceSurfaceFn = functionLike(workspaceSurfaceAst, "PassageWorkspace");
  const rowOpenProp = jsxOpenings(workspaceSurfaceAst, "WorkspacePassageRow").some((node) => {
    const expression = jsxAttributeExpression(node, "onOpenSettings");
    return Boolean(expression && hasCall(expression, "onOpenRowSettings", ["row.localId"]));
  });
  const rowFn = functionLike(rowSurfaceAst, "WorkspacePassageRow");
  const rowButtonConnected = findNodes(rowFn || rowSurfaceAst, ts.isJsxSelfClosingElement).length >= 0 &&
    jsxOpenings(rowSurfaceAst, "button").some((node) => {
      const tour = jsxAttributeExpression(node, "data-generate-tour");
      const onClick = jsxAttributeExpression(node, "onClick");
      return Boolean(
        tour && ts.isStringLiteral(tour) && tour.text === "row-generate-button" &&
        onClick && ts.isIdentifier(onClick) && onClick.text === "onOpenSettings"
      );
    });
  if (!workspaceSurfaceFn || !rowOpenProp || !rowFn || !rowButtonConnected) {
    reasons.add("DESKTOP_EVENT_SURFACE_AST_BROKEN");
  }

  const modalFn = functionLike(modalAst, "PassageGenerateModal");
  const modalClickHandlers = jsxOpenings(modalAst, "button")
    .map((node) => jsxAttributeExpression(node, "onClick"))
    .filter((node) => node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node)));
  const generationClick = modalClickHandlers.find((handler) => hasCall(handler, "onGenerate", []));
  const configIf = generationClick && findNode(generationClick, (node) => {
    if (!ts.isIfStatement(node) || !ts.isIdentifier(unwrap(node.expression)) || unwrap(node.expression).text !== "configOnly") return false;
    return hasCall(node.thenStatement, "onClose", []) && !hasCall(node.thenStatement, "onGenerate");
  });
  if (!modalFn || !generationClick || !configIf) reasons.add("MODAL_EVENT_SURFACE_AST_BROKEN");

  const mobileNext = initializer(clientAst, "mobileNext");
  const mobileCalls = mobileNext ? callExpressions(mobileNext, "handleWorkspaceGenerate") : [];
  const mobileZeroArg = mobileCalls.some((call) => call.arguments.length === 0);
  const mobileWorkspacePredicate = mobileNext ? strictEqualityText(mobileNext, clientAst, "mobileStep", "workspace") : false;
  const mobileNavFn = functionLike(mobileNavAst, "MobileStepNav");
  const mobileForward = mobileNavFn && Boolean(findNode(mobileNavFn, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessChain(node.expression) && !ts.isPropertyAccessExpression(node.expression)) return false;
    const expression = node.expression;
    return ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) &&
      expression.expression.text === "next" && expression.name.text === "onClick";
  }));
  if (
    !mobileNext || !mobileZeroArg || !mobileWorkspacePredicate ||
    !jsxHasIdentifier(clientAst, "MobileStepNav", "next", "mobileNext") ||
    !mobileNavFn || !mobileForward
  ) reasons.add("MOBILE_EVENT_SURFACE_AST_BROKEN");

  const workspaceHook = functionLike(workspaceAst, "useWorkspaceGeneration");
  const workspaceGenerate = functionLike(workspaceAst, "handleWorkspaceGenerate");
  const effCounts = initializer(workspaceAst, "effTypeCounts");
  const effCountsText = effCounts ? effCounts.getText(workspaceAst) : "";
  const entriesCall = workspaceGenerate && findNode(workspaceGenerate, (node) =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Object" &&
    node.expression.name.text === "entries" && node.arguments[0] &&
    ts.isIdentifier(unwrap(node.arguments[0])) && unwrap(node.arguments[0]).text === "effTypeCounts"
  );
  const pushCalls = workspaceGenerate ? findNodes(workspaceGenerate, (node) =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "fastUnits" &&
    node.expression.name.text === "push"
  ) : [];
  const typedPush = pushCalls.some((call) => {
    const object = unwrap(call.arguments[0]);
    return ts.isObjectLiteralExpression(object) && objectHasIdentifier(object, "questionType", "typeId");
  });
  const creatorCalls = workspaceGenerate ? callExpressions(workspaceGenerate, "createFastQuestionGenerationJob") : [];
  const typedCreator = creatorCalls.some((call) => {
    const object = unwrap(call.arguments[0]);
    return ts.isObjectLiteralExpression(object) &&
      objectHasPropertyAccess(object, "questionType", "unit", "questionType") &&
      objectHasPropertyAccess(object, "questionTypeSettings", "unit", "settings") &&
      objectPropertyValue(object, "count") && objectPropertyValue(object, "count").getText(workspaceAst) === "1" &&
      objectPropertyValue(object, "mode") && ts.isStringLiteral(objectPropertyValue(object, "mode")) &&
      objectPropertyValue(object, "mode").text === "MANUAL";
  });
  const scheduledCreator = callExpressions(workspaceGenerate || workspaceAst, "scheduleFastGeneration").some((call) =>
    call.arguments[0] && hasCall(call.arguments[0], "createFastQuestionGenerationJob")
  );
  if (
    !workspaceHook || !workspaceGenerate ||
    !hasNamedImport(workspaceAst, "../use-generation-handlers", "createFastQuestionGenerationJob") ||
    !hasNamedImport(workspaceAst, "../fast-generation-scheduler", "scheduleFastGeneration") ||
    !strictEqualityText(effCounts || workspaceAst, workspaceAst, "effMode", "manual") ||
    !effCountsText.includes("item.row.override!.typeCounts") || !effCountsText.includes("typeCounts") ||
    !entriesCall || !typedPush || !typedCreator || !scheduledCreator ||
    hasCall(workspaceGenerate, "createQuestionGenerationJob")
  ) reasons.add("WORKSPACE_TYPE_DATAFLOW_AST_BROKEN");

  const fastHelper = functionLike(handlersAst, "createFastQuestionGenerationJob");
  const helperFetch = fastHelper && callExpressions(fastHelper, "fetch").find((call) =>
    call.arguments[0] && ts.isStringLiteral(call.arguments[0]) &&
    call.arguments[0].text === "/api/workbench/ai-jobs/question-generation/fast"
  );
  const helperBody = helperFetch && findNode(helperFetch, (node) =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "JSON" &&
    node.expression.name.text === "stringify" &&
    node.arguments[0] && ts.isObjectLiteralExpression(unwrap(node.arguments[0])) &&
    objectHasIdentifier(unwrap(node.arguments[0]), "questionType", "questionType")
  );
  if (!fastHelper || !helperFetch || !helperBody) reasons.add("SHARED_FAST_HELPER_AST_BROKEN");

  const schedulerFn = functionLike(schedulerAst, "scheduleFastGeneration");
  if (
    !schedulerFn || !hasCall(schedulerFn, "task") ||
    !callExpressions(schedulerFn, "pump").length ||
    !containsPropertyAssignment(schedulerFn, "ok", (node) => node.kind === ts.SyntaxKind.TrueKeyword)
  ) reasons.add("SCHEDULER_AST_BROKEN");

  const requestSchemaKeys = objectKeys(fastRouteAst, "requestSchema");
  const manualPlan = functionLike(fastRouteAst, "buildManualPlan");
  const postFn = functionLike(fastRouteAst, "POST");
  const planSubtype = manualPlan && containsPropertyAssignment(manualPlan, "subType", (node) =>
    ts.isIdentifier(node) && node.text === "questionType"
  );
  const budgetCalls = postFn ? callExpressions(postFn, "runWithQuestionGenerationAssignmentBudget") : [];
  const nestedRuntime = budgetCalls.some((call) =>
    call.arguments[1] && hasCall(call.arguments[1], "runQuestionGenerationWithEmptyRetry")
  );
  if (
    !requestSchemaKeys.includes("questionType") || !requestSchemaKeys.includes("mode") ||
    !manualPlan || !planSubtype || !postFn ||
    !hasNamedImport(fastRouteAst, "@/app/api/ai/generate-questions-auto/_lib/run-question-generation", "runQuestionGenerationWithEmptyRetry") ||
    !hasNamedImport(fastRouteAst, "@/lib/question-generation-assignment-budget", "runWithQuestionGenerationAssignmentBudget") ||
    !nestedRuntime ||
    hasAnyImport(fastRouteAst, "@trigger.dev/sdk/v3")
  ) reasons.add("FAST_ROUTE_RUNTIME_AST_BROKEN");

  const budgetFn = functionLike(assignmentAst, "runWithQuestionGenerationAssignmentBudget");
  const activeFn = functionLike(assignmentAst, "runActive");
  if (
    !budgetFn || callExpressions(budgetFn, "fn").length < 2 ||
    !hasCall(budgetFn, "runActive", ["descriptor", "admission", "fn"]) ||
    !activeFn || !hasCall(activeFn, "runWithAtlasProductionAssignmentScope")
  ) reasons.add("ASSIGNMENT_BUDGET_CALLBACK_AST_BROKEN");

  const runtimeFn = functionLike(runtimeAst, "runQuestionGeneration");
  const retryFn = functionLike(runtimeAst, "runQuestionGenerationWithEmptyRetry");
  const responseCall = runtimeFn && callExpressions(runtimeFn, "getAiResponseSchema").some((call) =>
    call.arguments[0] && ts.isIdentifier(unwrap(call.arguments[0])) && unwrap(call.arguments[0]).text === "subType"
  );
  const retryCallsEngine = retryFn && hasCall(retryFn, "runQuestionGeneration");
  if (
    !runtimeFn || !retryFn || !retryCallsEngine ||
    !hasNamedImport(runtimeAst, "@/lib/question-ai-schemas-mc", "AI_QUESTION_SCHEMAS") ||
    !hasNamedImport(runtimeAst, "@/lib/question-ai-schemas-mc", "getAiResponseSchema") ||
    !hasNamedImport(runtimeAst, "@/lib/question-schemas", "QUESTION_SCHEMAS") ||
    !containsElementAccess(runtimeFn, "AI_QUESTION_SCHEMAS", "subType") ||
    !containsElementAccess(runtimeFn, "QUESTION_SCHEMAS", "subType") ||
    !responseCall
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
    !["AI_MC_QUESTION_SCHEMAS", "AI_VOCAB_QUESTION_SCHEMAS", "AI_ESSAY_QUESTION_SCHEMAS"].every((name) => aggregatorSpreads.includes(name))
  ) reasons.add("SCHEMA_REGISTRY_AST_BROKEN");

  const clientBatchCalls = clientFn ? callExpressions(clientFn, "handleBatchGenerate") : [];
  const hookBatch = functionLike(handlersAst, "handleBatchGenerate");
  const enqueueCalls = hookBatch ? callExpressions(hookBatch, "enqueueJob") : [];
  const passageGridFn = functionLike(passageGridAst, "PassageCardGrid");
  const passageGridBatchCalls = passageGridFn ? callExpressions(passageGridFn, "handleBatchGenerate") : [];
  const panelWorkspaceButtonGuard = panelAst.getText().includes("!hideGenerateButtons") &&
    panelAst.getText().includes("TypeNumericDetail.renderLibraryGenerateButton");
  const libraryButton = functionLike(numericDetailAst, "renderLibraryGenerateButton");
  if (
    clientBatchCalls.length !== 0 || enqueueCalls.length !== 0 || passageGridBatchCalls.length !== 0 ||
    !panelWorkspaceButtonGuard || !libraryButton || !hasCall(libraryButton, "handleBatchGenerate", []) ||
    value.scope.claimedReachablePath !== "PRIMARY_WORKSPACE_FAST_ONLY" ||
    !value.scope.excludedPaths.some((row) => row.pathClass === "LEGACY_TRIGGER")
  ) reasons.add("DEAD_PATH_REAUTHORIZED");

  return reasons;
}

function validateCanonical(value, v3) {
  const reasons = new Set();
  if (JSON.stringify(value.canonicalUniverse) !== JSON.stringify(v3.canonicalUniverse)) reasons.add("CANONICAL_BINDING_DRIFT");
  if (JSON.stringify(value.families) !== JSON.stringify(v3.families)) reasons.add("CANONICAL_BINDING_DRIFT");
  if (JSON.stringify(value.rotation) !== JSON.stringify(v3.rotation)) reasons.add("CANONICAL_BINDING_DRIFT");
  if (JSON.stringify(value.claims) !== JSON.stringify(v3.claims)) reasons.add("CANONICAL_BINDING_DRIFT");
  const mapped = value.families.flatMap((family) => family.rotationOrder);
  if (
    duplicates(mapped).length > 0 ||
    JSON.stringify([...mapped].sort()) !== JSON.stringify([...value.canonicalUniverse.nonfocusTypeIdsInUiOrder].sort())
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

function replaceRequired(text, before, after) {
  const index = text.indexOf(before);
  if (index < 0) throw new Error("Hostile fixture source token missing: " + before.slice(0, 120));
  return text.slice(0, index) + after + text.slice(index + before.length);
}

function executeHostileFixture(fixture, actualGitState, sourceTexts, v3) {
  const value = clone(binding);
  const actual = clone(actualGitState);
  const texts = new Map([...sourceTexts].map(([path, text]) => [path, text]));
  const setText = (path, before, after) => texts.set(path, replaceRequired(texts.get(path), before, after));
  const untrackedIndex = value.sourceAuthority.productionSources.findIndex((row) => row.sourceState === "WORKTREE_ONLY_UNTRACKED");
  const trackedIndex = value.sourceAuthority.productionSources.findIndex((row) => row.sourceState === "TRACKED_WORKTREE");
  switch (fixture.mutation) {
    case "CHANGE_REPO_HEAD":
      actual.repoFreeze.repoHeadCommit = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "CHANGE_REPO_TREE":
      actual.repoFreeze.repoHeadTree = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "CHANGE_REPO_REF":
      actual.repoFreeze.headRef = "refs/heads/hostile";
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "TRACKED_TO_UNTRACKED": {
      const row = actual.sources[trackedIndex];
      row.tracked = false;
      row.sourceState = "WORKTREE_ONLY_UNTRACKED";
      row.indexStage = "";
      row.indexBlobSha1 = null;
      row.headBlobSha1 = null;
      row.lastPathCommit = null;
      row.lsFilesVerbose = "";
      row.statusPorcelainV2 = "? " + row.path;
      return validateGitSnapshot(value.sourceAuthority, actual);
    }
    case "UNTRACKED_TO_TRACKED": {
      const row = actual.sources[untrackedIndex];
      row.tracked = true;
      row.sourceState = "TRACKED_WORKTREE";
      row.indexStage = "100644 " + "0".repeat(40) + " 0\t" + row.path;
      row.indexBlobSha1 = "0".repeat(40);
      row.headBlobSha1 = "0".repeat(40);
      row.lastPathCommit = "0".repeat(40);
      row.lsFilesVerbose = "H " + row.path;
      row.statusPorcelainV2 = "";
      return validateGitSnapshot(value.sourceAuthority, actual);
    }
    case "UNTRACKED_DISAPPEARS":
      actual.sources[untrackedIndex].exists = false;
      actual.sources[untrackedIndex].worktreeSha256 = null;
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "UNTRACKED_RAW_DRIFT_SAME_STATUS":
      actual.sources[untrackedIndex].worktreeSha256 = "0".repeat(64);
      actual.sources[untrackedIndex].worktreeRawGitBlobSha1 = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "CRLF_RAW_DRIFT_KEEP_FILTERED":
      actual.sources[trackedIndex].worktreeSha256 = "0".repeat(64);
      actual.sources[trackedIndex].worktreeRawGitBlobSha1 = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "SET_DEPLOYED_PARITY_TRUE":
      value.sourceAuthority.deployedCommitParity = true;
      return validateGitSnapshot(value.sourceAuthority, actual);
    case "ADD_RUNTIME_DIRECT_IMPORT":
      texts.set(PATHS.runtime, "import {} from \"@/lib/question-generation-prompt-contract\";\n" + texts.get(PATHS.runtime));
      return validateAst(texts, value);
    case "REMOVE_RUNTIME_DIRECT_IMPORT":
      setText(PATHS.runtime, "from \"@/lib/question-generation-research-runtime\";", "from \"zod\";");
      return validateAst(texts, value);
    case "ADD_NON_LITERAL_DYNAMIC_IMPORT":
      texts.set(PATHS.runtime, "const hostileModulePath = \"@/lib/question-generation-prompt-contract\";\nvoid import(hostileModulePath);\n" + texts.get(PATHS.runtime));
      return validateAst(texts, value);
    case "ADD_SECOND_HOP_LOCAL_IMPORT":
      texts.set("src/lib/question-generation-prompt-contract.ts", "import {} from \"@/lib/marked-question-surface-normalization\";\n" + texts.get("src/lib/question-generation-prompt-contract.ts"));
      return validateAst(texts, value);
    case "MUTATE_KOREAN_TRANSITIVE_BYTE": {
      const row = actual.sources.find((source) => source.path === "src/lib/korean/types/KO_LIT_PSYCH.ts");
      if (!row) throw new Error("Korean transitive hostile target missing");
      row.worktreeSha256 = "0".repeat(64);
      row.worktreeRawGitBlobSha1 = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    }
    case "MUTATE_ENGLISH_SECOND_HOP_BYTE": {
      const row = actual.sources.find((source) => source.path === "src/lib/question-generation-prompt-contract.ts");
      if (!row) throw new Error("English second-hop hostile target missing");
      row.worktreeSha256 = "0".repeat(64);
      row.worktreeRawGitBlobSha1 = "0".repeat(40);
      return validateGitSnapshot(value.sourceAuthority, actual);
    }
    case "CHANGE_ROUTE_MODE":
      setText(PATHS.route, "defaultMode=\"manual\"", "defaultMode=\"set\"");
      return validateAst(texts, value);
    case "REMOVE_ROUTE_ENGLISH_DEFAULT":
      setText(PATHS.route, " defaultMode=\"manual\"", " defaultMode=\"manual\" subjectScope=\"KOREAN\"");
      return validateAst(texts, value);
    case "BREAK_EXAM_ALIAS":
      setText(PATHS.alias, "export const EXAM_TYPE_GROUPS = QUESTION_TYPE_GROUPS;", "export const EXAM_TYPE_GROUPS = [];");
      return validateAst(texts, value);
    case "BREAK_PANEL_BRANCH":
      setText(PATHS.panel, "const panelTypeGroups = koPanel ? QUESTION_TYPE_GROUPS_KO : EXAM_TYPE_GROUPS;", "const panelTypeGroups = koPanel ? QUESTION_TYPE_GROUPS_KO : QUESTION_TYPE_GROUPS_KO;");
      return validateAst(texts, value);
    case "DETACH_DESKTOP_CLIENT_PROP":
      setText(PATHS.client, "onOpenRowSettings={handleSetActiveRow}", "onOpenRowSettings={() => {}}");
      return validateAst(texts, value);
    case "DETACH_WORKSPACE_ROW_PROP":
      setText(PATHS.workspaceSurface, "onOpenSettings={() => onOpenRowSettings?.(row.localId)}", "onOpenSettings={() => {}}");
      return validateAst(texts, value);
    case "DETACH_ROW_BUTTON":
      setText(PATHS.rowSurface, "onClick={onOpenSettings}", "onClick={() => {}}");
      return validateAst(texts, value);
    case "DETACH_DESKTOP_HANDLER":
      setText(PATHS.client, "void handleWorkspaceGenerate(activeRowId);", "void Promise.resolve(activeRowId);");
      return validateAst(texts, value);
    case "DETACH_MODAL_ON_GENERATE":
      setText(PATHS.modal, "onGenerate();", "onClose();");
      return validateAst(texts, value);
    case "BREAK_ENGLISH_MODAL_BRANCH":
      setText(PATHS.client, "koSetMode ? handleGenerateKoSetActiveRow : handleGenerateActiveRow", "koSetMode ? handleGenerateKoSetActiveRow : handleGenerateKoSetActiveRow");
      return validateAst(texts, value);
    case "DETACH_MOBILE_GENERATION":
      setText(PATHS.client, "void handleWorkspaceGenerate();", "void Promise.resolve();");
      return validateAst(texts, value);
    case "DETACH_MOBILE_NAV_FORWARD":
      setText(PATHS.mobileNav, "next.onClick?.();", "next.onDisabledHint?.();");
      return validateAst(texts, value);
    case "BREAK_EFFECTIVE_TYPE_COUNTS":
      setText(PATHS.workspaceHook, "const effTypeCounts =", "const effTypeCountsRemoved =");
      return validateAst(texts, value);
    case "BREAK_FAST_UNIT_TYPE":
      setText(PATHS.workspaceHook, "questionType: typeId,", "questionTypeRemoved: typeId,");
      return validateAst(texts, value);
    case "BREAK_SCHEDULED_TYPE":
      setText(PATHS.workspaceHook, "questionType: unit.questionType,", "questionType: \"BLANK_INFERENCE\",");
      return validateAst(texts, value);
    case "CHANGE_FAST_ENDPOINT":
      setText(PATHS.sharedHandlers, "/api/workbench/ai-jobs/question-generation/fast", "/api/workbench/ai-jobs/question-generation/fast-hostile");
      return validateAst(texts, value);
    case "REMOVE_HELPER_QUESTION_TYPE":
      setText(
        PATHS.sharedHandlers,
        "  const res = await fetch(\"/api/workbench/ai-jobs/question-generation/fast\", {\r\n    method: \"POST\",\r\n    headers: { \"Content-Type\": \"application/json\" },\r\n    credentials: \"include\",\r\n    body: JSON.stringify({\r\n      passageId,\r\n      mode,\r\n      count,\r\n      questionType,\r\n      questionTypeSettings,",
        "  const res = await fetch(\"/api/workbench/ai-jobs/question-generation/fast\", {\r\n    method: \"POST\",\r\n    headers: { \"Content-Type\": \"application/json\" },\r\n    credentials: \"include\",\r\n    body: JSON.stringify({\r\n      passageId,\r\n      mode,\r\n      count,\r\n      questionTypeSettings,",
      );
      return validateAst(texts, value);
    case "REMOVE_SCHEDULER_TASK_CALL":
      setText(PATHS.scheduler, "      task()", "      Promise.resolve()")
      return validateAst(texts, value);
    case "BREAK_FAST_PLAN_SUBTYPE":
      setText(PATHS.fastRoute, "subType: questionType,", "subType: \"BLANK_INFERENCE\",");
      return validateAst(texts, value);
    case "REMOVE_FAST_RUNTIME_CALLBACK":
      setText(PATHS.fastRoute, "() => runQuestionGenerationWithEmptyRetry({", "() => Promise.resolve({ questions: [], usageEvents: [] }), void ({");
      return validateAst(texts, value);
    case "REMOVE_BUDGET_FN_CALLS":
      setText(PATHS.assignmentBudget, "if (admission.mode === \"OFF\") return fn();", "if (admission.mode === \"OFF\") return Promise.resolve(undefined as T);");
      setText(PATHS.assignmentBudget, "      return fn();", "      return Promise.resolve(undefined as T);");
      return validateAst(texts, value);
    case "BREAK_AI_SCHEMA_INDEX":
      setText(PATHS.runtime, "AI_QUESTION_SCHEMAS[subType]", "AI_QUESTION_SCHEMAS[\"BLANK_INFERENCE\"]");
      return validateAst(texts, value);
    case "BREAK_RESPONSE_SCHEMA_CALL":
      setText(PATHS.runtime, "getAiResponseSchema(subType, {", "getAiResponseSchema(\"BLANK_INFERENCE\", {");
      return validateAst(texts, value);
    case "REAUTHORIZE_ENQUEUE":
      setText(PATHS.sharedHandlers, "const handleBatchGenerate = useCallback(async () => {", "const handleBatchGenerate = useCallback(async () => { void enqueueJob({});");
      return validateAst(texts, value);
    case "REAUTHORIZE_GRID_BATCH":
      setText(PATHS.passageGrid, "export function PassageCardGrid({", "export function PassageCardGrid({");
      texts.set(PATHS.passageGrid, texts.get(PATHS.passageGrid).replace(/\n}\s*$/, "\nvoid handleBatchGenerate();\n}\n"));
      return validateAst(texts, value);
    case "REMOVE_CANONICAL_TYPE":
      value.canonicalUniverse.nonfocusTypeIdsInUiOrder.pop();
      return validateCanonical(value, v3);
    case "DUPLICATE_FAMILY_TYPE":
      value.families[1].rotationOrder.push("TOPIC");
      return validateCanonical(value, v3);
    case "BREAK_ROTATION_ROW":
      value.scheduleRows[0].holdoutTypeId = "MAIN_IDEA";
      return validateCanonical(value, v3);
    case "CORRUPT_UPSTREAM_HASH":
      value.upstreams[0].manifestSha256 = "0".repeat(64);
      return validateCanonical(value, v3);
    case "EARLY_RETURN_DESKTOP_HANDLER":
      setText(PATHS.client, "    void handleWorkspaceGenerate(activeRowId);", "    return;\n    void handleWorkspaceGenerate(activeRowId);");
      return validateAst(texts, value);
    case "EARLY_RETURN_MODAL_CLICK":
      setText(PATHS.modal, "              onGenerate();", "              return;\n              onGenerate();");
      return validateAst(texts, value);
    case "EARLY_RETURN_MOBILE_HANDLER":
      setText(PATHS.client, "              void handleWorkspaceGenerate();", "              return;\n              void handleWorkspaceGenerate();");
      return validateAst(texts, value);
    case "EARLY_RETURN_WORKSPACE_HANDLER":
      setText(PATHS.workspaceHook, "      const effTypeCounts =", "      return;\n      const effTypeCounts =");
      return validateAst(texts, value);
    case "EARLY_RETURN_FAST_HELPER":
      setText(PATHS.sharedHandlers, "  const res = await fetch(\"/api/workbench/ai-jobs/question-generation/fast\"", "  throw new Error(\"hostile\");\n  const res = await fetch(\"/api/workbench/ai-jobs/question-generation/fast\"");
      return validateAst(texts, value);
    case "EARLY_RETURN_SCHEDULER_TASK":
      setText(PATHS.scheduler, "      task()", "      return;\n      task()")
      return validateAst(texts, value);
    case "EARLY_THROW_FAST_ROUTE_CALLBACK":
      setText(PATHS.fastRoute, "      () => runQuestionGenerationWithEmptyRetry({", "      () => { throw new Error(\"hostile\"); return runQuestionGenerationWithEmptyRetry({");
      setText(
        PATHS.fastRoute,
        "        deadlineAt: requestStartedAt + 270_000,\r\n      }),\n    );",
        "        deadlineAt: requestStartedAt + 270_000,\r\n      });\n      },\n    );"
      );
      return validateAst(texts, value);
    case "EARLY_THROW_BUDGET_WRAPPER":
      setText(PATHS.assignmentBudget, "  let admission: QuestionGenerationAssignmentBudgetAdmission;", "  throw new Error(\"hostile\");\n  let admission: QuestionGenerationAssignmentBudgetAdmission;");
      return validateAst(texts, value);
    case "EARLY_THROW_SCHEMA_DISPATCH":
      setText(PATHS.runtime, "      const hasAiSchema = !!AI_QUESTION_SCHEMAS[subType];", "      throw new Error(\"hostile\");\n      const hasAiSchema = !!AI_QUESTION_SCHEMAS[subType];");
      return validateAst(texts, value);
    case "EARLY_THROW_RESPONSE_SCHEMA_BUILDER":
      setText(PATHS.aiMc, "export function getAiResponseSchema(", "export function getAiResponseSchema(");
      texts.set(PATHS.aiMc, texts.get(PATHS.aiMc).replace(/(export function getAiResponseSchema\([^]*?\)\s*\{)/, "$1\n  throw new Error(\"hostile\");"));
      return validateAst(texts, value);
    default:
      throw new Error("Unknown hostile mutation: " + fixture.mutation);
  }
}

eq("schema version", binding.schemaVersion, "reviewer-calibration-v3-production-type-binding-4");
eq("artifact id", binding.artifactId, "reviewer-calibration-v3-production-type-binding-v4");
eq("candidate status", binding.status, "PRODUCTION_ROUTE_BINDING_CANDIDATE_REQUIRES_EXTERNAL_AUDIT");
eq("route scope", binding.scope.route, "/director/workbench/questions/generate");
eq("scope state predicate", binding.scope.statePredicate, "MANUAL_AND_NON_KOREAN_ONLY");
eq("primary-only claim", binding.scope.claimedReachablePath, "PRIMARY_WORKSPACE_FAST_ONLY");
eq("not deployed parity", binding.sourceAuthority.deployedCommitParity, false);
eq("upstream count", binding.upstreams.length, 2);
eq("v3 blocker codes", binding.v3FailureProvenance.blockerCodes, EXPECTED_V3_BLOCKERS);
eq("v3 math accepted only", binding.v3FailureProvenance.acceptedFromV3, ["CANONICAL_25_23_SET", "EIGHT_FAMILY_PARTITION", "ROTATION_MATH"]);
eq("v3 execution rejected", binding.v3FailureProvenance.executionAuthorityAccepted, false);

const upstreamObjects = new Map();
for (const upstream of binding.upstreams) {
  const expectedHash = EXPECTED_UPSTREAMS.get(upstream.artifactId);
  eq("upstream expected hash " + upstream.artifactId, upstream.manifestSha256, expectedHash);
  const upstreamDir = resolve(base, upstream.path);
  const upstreamManifest = join(upstreamDir, "MANIFEST.sha256");
  check("upstream directory exists " + upstream.artifactId, existsSync(upstreamDir));
  check("upstream manifest exists " + upstream.artifactId, existsSync(upstreamManifest));
  if (!existsSync(upstreamManifest)) continue;
  eq("upstream manifest bytes " + upstream.artifactId, sha256File(upstreamManifest), upstream.manifestSha256);
  eq("upstream manifest entries " + upstream.artifactId, Object.fromEntries(parseManifest(upstreamManifest)), upstream.manifestEntries);
  for (const [file, hash] of Object.entries(upstream.manifestEntries)) {
    eq("upstream file bytes " + upstream.artifactId + "/" + file, sha256File(join(upstreamDir, file)), hash);
  }
  if (upstream.artifactId === "reviewer-calibration-v3-production-type-binding-v3") {
    upstreamObjects.set("v3", JSON.parse(readFileSync(join(upstreamDir, "binding.json"), "utf8")));
  }
  if (upstream.artifactId.endsWith("independent-audit-v1")) {
    const audit = JSON.parse(readFileSync(join(upstreamDir, "audit.json"), "utf8"));
    eq("v3 audit verdict", audit.verdict, "FAIL_BLOCKERS");
    eq("v3 audit execution verdict", audit.executionAuthorityVerdict, "FAIL_NOT_ISSUABLE");
    eq("v3 audit blocker codes exact", audit.blockers.map((row) => row.code), EXPECTED_V3_BLOCKERS);
  }
}

const v3 = upstreamObjects.get("v3");
check("v3 binding loaded", Boolean(v3));
if (!v3) throw new Error("Immutable v3 math binding unavailable");
eq("canonical exact v3", binding.canonicalUniverse, v3.canonicalUniverse);
eq("families exact v3", binding.families, v3.families);
eq("rotation exact v3", binding.rotation, v3.rotation);
eq("schedule exact v3", binding.scheduleRows, v3.scheduleRows);
eq("claims exact v3", binding.claims, v3.claims);

eq("interactive authority paths", binding.sourceAuthority.interactiveAuthorityPaths, INTERACTIVE_AUTHORITY_PATHS);
eq("excluded evidence paths", binding.sourceAuthority.excludedRouteEvidencePaths, EXCLUDED_ROUTE_EVIDENCE_PATHS);
eq("transitive runtime roots", binding.sourceAuthority.transitiveRuntimeRoots, TRANSITIVE_RUNTIME_ROOTS);
eq("transitive runtime closure", binding.sourceAuthority.transitiveRuntimeClosure, DISCOVERED_TRANSITIVE_GRAPH.closurePaths);
eq("transitive runtime edges", binding.sourceAuthority.transitiveImportEdges, DISCOVERED_TRANSITIVE_GRAPH.edges);
eq("unresolved local imports forbidden", binding.sourceAuthority.unresolvedLocalImports, []);
eq("non-literal module loads forbidden", binding.sourceAuthority.nonLiteralModuleLoads, []);
check("type-only edges included", binding.sourceAuthority.transitiveImportEdges.some((row) => row.edgeKind.includes("TYPE_ONLY_INCLUDED")));
check("Korean registry fanout sealed", binding.sourceAuthority.transitiveRuntimeClosure.filter((path) => path.startsWith("src/lib/korean/types/")).length >= 38);
check("second-hop prompt contract sealed", binding.sourceAuthority.transitiveRuntimeClosure.includes("src/lib/question-generation-prompt-contract.ts"));
for (const path of [
  PATHS.assignmentBudget,
  "src/lib/question-generation-research-profiles.ts",
  "src/lib/question-generation-research-runtime.ts",
  "src/lib/question-generation-research-schema.ts"
]) {
  const row = binding.sourceAuthority.productionSources.find((source) => source.path === path);
  eq("required worktree-only source state " + path, row && row.sourceState, "WORKTREE_ONLY_UNTRACKED");
}
eq("required source count", binding.sourceAuthority.productionSources.length, REQUIRED_SOURCE_PATHS.length);
eq("required source order", binding.sourceAuthority.productionSources.map((row) => row.path), REQUIRED_SOURCE_PATHS);

const expectedSourceSemantic = semanticSha(sourceSemanticView(binding.sourceAuthority));
eq("source semantic digest", binding.sourceAuthority.semanticSha256, expectedSourceSemantic);
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
eq("baseline exact source validator", [...baselineGitReasons], []);
for (const source of binding.sourceAuthority.productionSources) {
  const actual = actualGitState.sources.find((row) => row.path === source.path);
  eq("source state " + source.path, actual && actual.sourceState, source.sourceState);
  eq("raw SHA256 " + source.path, actual && actual.worktreeSha256, source.worktreeSha256);
  eq("raw Git blob " + source.path, actual && actual.worktreeRawGitBlobSha1, source.worktreeRawGitBlobSha1);
  eq("filtered Git blob " + source.path, actual && actual.worktreeFilteredGitBlobSha1, source.worktreeFilteredGitBlobSha1);
  eq("index stage " + source.path, actual && actual.indexStage, source.indexStage);
  eq("index blob " + source.path, actual && actual.indexBlobSha1, source.indexBlobSha1);
  eq("HEAD blob " + source.path, actual && actual.headBlobSha1, source.headBlobSha1);
  eq("last path commit " + source.path, actual && actual.lastPathCommit, source.lastPathCommit);
  eq("porcelain-v2 " + source.path, actual && actual.statusPorcelainV2, source.statusPorcelainV2);
  eq("ls-files flag " + source.path, actual && actual.lsFilesVerbose, source.lsFilesVerbose);
}

const crlfCleanSources = binding.sourceAuthority.productionSources.filter((source) =>
  source.sourceState === "TRACKED_WORKTREE" &&
  source.derivedGitDirty === false &&
  source.statusPorcelainV2 === "" &&
  source.worktreeRawGitBlobSha1 !== source.indexBlobSha1 &&
  source.worktreeFilteredGitBlobSha1 === source.indexBlobSha1
);
check("CRLF normalized clean evidence exists", crlfCleanSources.length > 0, crlfCleanSources.map((row) => row.path));

const sourceTexts = new Map(
  binding.sourceAuthority.productionSources.map((source) => [source.path, readFileSync(join(repo, source.path), "utf8")])
);
const baselineAstReasons = validateAst(sourceTexts, binding);
eq("baseline path-sensitive AST validator", [...baselineAstReasons], []);
const baselineCanonicalReasons = validateCanonical(binding, v3);
eq("baseline canonical validator", [...baselineCanonicalReasons], []);

const oneEpoch = coverage(binding.families, 1, ["MAIN", "HOLDOUT"]);
const twoEpoch = coverage(binding.families, 2, ["MAIN", "HOLDOUT"]);
const fourEpochMain = coverage(binding.families, 4, ["MAIN"]);
eq("single epoch contact", oneEpoch.size, 16);
eq("two epoch contact", twoEpoch.size, 23);
setEq("two epoch exact IDs", [...twoEpoch], binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
eq("four epoch main contact", fourEpochMain.size, 23);
setEq("four epoch exact IDs", [...fourEpochMain], binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
eq("contact is not certification", binding.rotation.contactIsCertification, false);
eq("n2 rotation", [selectedAt(["a", "b"], 1, "MAIN").index, selectedAt(["a", "b"], 1, "HOLDOUT").index], [0, 1]);
eq("n3 rotation epoch 1", [selectedAt(["a", "b", "c"], 1, "MAIN").index, selectedAt(["a", "b", "c"], 1, "HOLDOUT").index], [0, 2]);
eq("n3 rotation epoch 2", [selectedAt(["a", "b", "c"], 2, "MAIN").index, selectedAt(["a", "b", "c"], 2, "HOLDOUT").index], [1, 0]);
eq("n4 rotation epoch 1", [selectedAt(["a", "b", "c", "d"], 1, "MAIN").index, selectedAt(["a", "b", "c", "d"], 1, "HOLDOUT").index], [0, 2]);

eq("hostile fixture count", hostile.fixtures.length, 54);
eq("hostile fixture IDs unique", new Set(hostile.fixtures.map((row) => row.fixtureId)).size, hostile.fixtures.length);
for (const fixture of hostile.fixtures) {
  const reasons = executeHostileFixture(fixture, actualGitState, sourceTexts, v3);
  check("hostile rejected " + fixture.fixtureId, reasons.has(fixture.expectedReasonCode), {
    expected: fixture.expectedReasonCode,
    actual: [...reasons]
  });
}

eq("external audit required", binding.independentAudit.required, true);
eq("immutable subject audit mode", binding.independentAudit.mode, "EXTERNAL_IMMUTABLE_SUBJECT");
eq("audit incomplete in candidate", binding.independentAudit.completedInThisArtifact, false);
eq("candidate grants no execution", binding.issuance.executionEligibleByThisArtifactAlone, false);
eq("candidate grants no downstream freeze", binding.issuance.downstreamV4FreezeAllowedByThisArtifactAlone, false);
eq("fresh pass audit required", binding.issuance.downstreamV4FreezeRequiresFreshPassAuditManifest, true);
for (const [key, value] of Object.entries(binding.activity)) eq("offline activity " + key, value, 0);

if (existsSync(reportPath)) {
  const report = readFileSync(reportPath, "utf8");
  for (const phrase of [
    "PRIMARY_WORKSPACE_FAST_ONLY",
    "MANUAL_AND_NON_KOREAN_ONLY",
    "WORKTREE_ONLY_UNTRACKED",
    "deployedCommitParity=false",
    "SECONDARY_BATCH_NOT_REACHABLE_FROM_REQUESTED_ROUTE",
    "LEGACY_TRIGGER_BRANCH_IS_DEAD_CODE",
    "one-hop",
    "API candidates 0"
  ]) check("REPORT contains " + phrase, report.includes(phrase));
}

if (process.argv.includes("--check-manifest")) {
  check("manifest exists", existsSync(manifestPath));
  if (existsSync(manifestPath)) {
    const expectedFiles = ["REPORT.md", "binding.json", "hostile-fixtures.json", "verify.mjs"];
    const parsed = parseManifest(manifestPath);
    eq("manifest names", [...parsed.keys()].sort(), [...expectedFiles].sort());
    eq("manifest entry count", parsed.size, expectedFiles.length);
    for (const file of expectedFiles) {
      if (parsed.has(file)) eq("manifest hash " + file, parsed.get(file), sha256File(join(base, file)));
    }
  }
}

const failures = checks.filter((row) => !row.pass);
const result = {
  schemaVersion: "reviewer-calibration-v3-production-type-binding-v4-verification-1",
  status: failures.length ? "FAIL_CLOSED" : "PASS_CANDIDATE_REQUIRES_EXTERNAL_AUDIT",
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  sourceAuthority: {
    repoHeadCommit: binding.sourceAuthority.repoFreeze.repoHeadCommit,
    sourceCount: binding.sourceAuthority.productionSources.length,
    trackedCount: binding.sourceAuthority.productionSources.filter((row) => row.sourceState === "TRACKED_WORKTREE").length,
    worktreeOnlyUntrackedCount: binding.sourceAuthority.productionSources.filter((row) => row.sourceState === "WORKTREE_ONLY_UNTRACKED").length,
    deployedCommitParity: binding.sourceAuthority.deployedCommitParity,
    transitiveRuntimeClosureCount: binding.sourceAuthority.transitiveRuntimeClosure.length,
    transitiveImportEdgeCount: binding.sourceAuthority.transitiveImportEdges.length,
    astAuthorityChainPassed: baselineAstReasons.size === 0
  },
  scope: {
    route: binding.scope.route,
    statePredicate: binding.scope.statePredicate,
    claimedReachablePath: binding.scope.claimedReachablePath,
    desktopSurface: "PASSAGE_MODAL_FOOTER",
    mobileSurface: "MOBILE_STEP_NAV"
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
      executeHostileFixture(fixture, actualGitState, sourceTexts, v3).has(fixture.expectedReasonCode)
    ).length
  },
  independentAudit: "REQUIRED_FRESH_EXTERNAL",
  activity: binding.activity,
  failures
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
if (failures.length > 0) process.exitCode = 1;
