import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const base = dirname(fileURLToPath(import.meta.url));
const repo = resolve(base, "../../../..");
const v3Dir = resolve(base, "../reviewer-calibration-v3-production-type-binding-v3");
const auditDir = resolve(base, "../../reviews/reviewer-calibration-v3-production-type-binding-v3-independent-audit-v1");

const P = {
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
  handlers: "src/app/(director)/director/workbench/generate/use-generation-handlers.ts",
  scheduler: "src/app/(director)/director/workbench/generate/fast-generation-scheduler.ts",
  fastRoute: "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  assignmentBudget: "src/lib/question-generation-assignment-budget.ts",
  runtime: "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  passageGrid: "src/app/(director)/director/workbench/generate/passage-card-grid.tsx",
  numericDetail: "src/app/(director)/director/workbench/generate/generation-config-panel-parts/type-numeric-detail.tsx",
  aiMc: "src/lib/question-ai-schemas-mc.ts",
  aiVocab: "src/lib/question-ai-schemas-vocab.ts",
  structured: "src/lib/question-schemas.ts"
};

const interactiveAuthorityPaths = [
  P.ui, P.route, P.client, P.alias, P.panel, P.workspaceSurface, P.rowSurface,
  P.modal, P.mobileNav, P.workspaceTypes, P.workspaceHook, P.handlers,
  P.scheduler, P.fastRoute, P.assignmentBudget, P.runtime
];

const excludedRouteEvidencePaths = [P.passageGrid, P.numericDetail];
const transitiveRuntimeRoots = [P.fastRoute, P.assignmentBudget, P.runtime, P.aiMc, P.aiVocab, P.structured];

const roleMap = new Map([
  [P.ui, "UI_CANONICAL_REGISTRY"],
  [P.route, "REQUESTED_ROUTE_ENTRY"],
  [P.client, "CLIENT_STATE_AND_CTA_ORCHESTRATOR"],
  [P.alias, "ENGLISH_PICKER_ALIAS"],
  [P.panel, "ENGLISH_PICKER_MUTATION_SURFACE"],
  [P.workspaceSurface, "DESKTOP_WORKSPACE_PROP_BRIDGE"],
  [P.rowSurface, "DESKTOP_ROW_CTA_SURFACE"],
  [P.modal, "DESKTOP_MODAL_CTA_AND_MOBILE_CONFIG_ONLY_SURFACE"],
  [P.mobileNav, "MOBILE_CTA_FORWARDER"],
  [P.workspaceTypes, "ROW_OVERRIDE_TYPECOUNT_SEMANTICS"],
  [P.workspaceHook, "PRIMARY_WORKSPACE_TYPED_DISPATCH"],
  [P.handlers, "SHARED_FAST_HTTP_HELPER_AND_DEAD_LEGACY_EVIDENCE"],
  [P.scheduler, "FAST_CONCURRENCY_SCHEDULER"],
  [P.fastRoute, "FAST_ROUTE_MANUAL_PLAN_RUNTIME_BRIDGE"],
  [P.assignmentBudget, "ASSIGNMENT_BUDGET_CALLBACK_BRIDGE"],
  [P.runtime, "GENERATION_ENGINE_SCHEMA_DISPATCH"],
  [P.passageGrid, "SECONDARY_BATCH_NEGATIVE_REACHABILITY_EVIDENCE"],
  [P.numericDetail, "HIDDEN_LIBRARY_CTA_NEGATIVE_REACHABILITY_EVIDENCE"]
]);

function normalize(value) {
  return String(value || "").replace(/\r\n/g, "\n").trimEnd();
}

function git(args, allowFailure, input) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", input });
  if (!allowFailure && result.status !== 0) throw new Error("git failed: " + args.join(" ") + "\n" + result.stderr);
  return { status: result.status, stdout: normalize(result.stdout) };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha(path) {
  return sha256(readFileSync(path));
}

function semanticSha(value) {
  return sha256(JSON.stringify(value));
}

function parseManifest(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error("bad manifest: " + line);
    values[match[2]] = match[1];
  }
  return values;
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
  ) current = current.expression;
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

function initializer(ast, name) {
  const declaration = findNode(ast, (node) =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
  );
  return declaration && declaration.initializer ? unwrap(declaration.initializer) : undefined;
}

function functionLike(ast, name) {
  const declaration = findNode(ast, (node) =>
    ts.isFunctionDeclaration(node) && node.name && node.name.text === name
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

function staticModuleEdges(ast, fromPath) {
  const edges = [];
  const nonLiteral = [];
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      const allNamedTypeOnly = Boolean(
        clause && clause.namedBindings && ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((element) => element.isTypeOnly)
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
        statement.exportClause.elements.length > 0 && statement.exportClause.elements.every((element) => element.isTypeOnly)
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
          edges.push({ from: fromPath, specifier: argument.text, edgeKind: isDynamicImport ? "DYNAMIC_IMPORT_LITERAL" : "REQUIRE_LITERAL", position: node.pos });
        } else {
          nonLiteral.push({ path: fromPath, loadKind: isDynamicImport ? "DYNAMIC_IMPORT_NON_LITERAL" : "REQUIRE_NON_LITERAL", position: node.pos });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { edges, nonLiteral };
}

function computeTransitiveImportGraph(roots) {
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
    const ast = parseSourceText(path, readFileSync(absolute, "utf8"));
    const discovered = staticModuleEdges(ast, path);
    nonLiteral.push(...discovered.nonLiteral);
    for (const edge of discovered.edges) {
      const resolvedPath = resolveLocalModule(path, edge.specifier);
      if (!resolvedPath) continue;
      if (resolvedPath.startsWith("UNRESOLVED::")) {
        unresolved.push({ ...edge, resolvedPath });
        continue;
      }
      edges.push({ ...edge, to: resolvedPath });
      if (!closure.has(resolvedPath)) {
        closure.add(resolvedPath);
        queue.push(resolvedPath);
      }
    }
  }
  const edgeOrder = (left, right) =>
    left.from.localeCompare(right.from) || left.to.localeCompare(right.to) ||
    left.edgeKind.localeCompare(right.edgeKind) || left.specifier.localeCompare(right.specifier) || left.position - right.position;
  return {
    closurePaths: [...closure].sort(),
    edges: edges.sort(edgeOrder),
    unresolved: unresolved.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    nonLiteral: nonLiteral.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  };
}

const transitiveGraph = computeTransitiveImportGraph(transitiveRuntimeRoots);
if (transitiveGraph.unresolved.length > 0) throw new Error("unresolved local imports: " + JSON.stringify(transitiveGraph.unresolved));
if (transitiveGraph.nonLiteral.length > 0) throw new Error("non-literal module loads: " + JSON.stringify(transitiveGraph.nonLiteral));
const requiredPaths = [...new Set([...interactiveAuthorityPaths, ...excludedRouteEvidencePaths, ...transitiveGraph.closurePaths])];

function linesByPath(output, paths) {
  const map = new Map(paths.map((path) => [path, ""]));
  for (const line of String(output || "").split("\n").filter(Boolean)) {
    const path = paths.find((candidate) =>
      line === "? " + candidate || line.endsWith("\t" + candidate) || line.endsWith(" " + candidate) || line.includes("\t" + candidate + "\t")
    );
    if (path) map.set(path, map.get(path) ? map.get(path) + "\n" + line : line);
  }
  return map;
}

const existingPaths = requiredPaths.filter((path) => existsSync(join(repo, path)));
const hashInput = existingPaths.join("\n") + "\n";
const rawHashes = git(["hash-object", "--no-filters", "--stdin-paths"], false, hashInput).stdout.split("\n");
const filteredHashes = git(["hash-object", "--stdin-paths"], false, hashInput).stdout.split("\n");
const rawByPath = new Map(existingPaths.map((path, index) => [path, rawHashes[index]]));
const filteredByPath = new Map(existingPaths.map((path, index) => [path, filteredHashes[index]]));
const stageByPath = linesByPath(git(["ls-files", "--stage", "--", ...requiredPaths], true).stdout, requiredPaths);
const statusByPath = linesByPath(git(["status", "--porcelain=v2", "--untracked-files=all", "--", ...requiredPaths], true).stdout, requiredPaths);
const verboseByPath = linesByPath(git(["ls-files", "-v", "--", ...requiredPaths], true).stdout, requiredPaths);
const headByPath = linesByPath(git(["ls-tree", "-r", "--full-tree", "HEAD", "--", ...requiredPaths], true).stdout, requiredPaths);

function collect(path) {
  const absolute = join(repo, path);
  if (!existsSync(absolute)) throw new Error("missing source: " + path);
  const indexStage = stageByPath.get(path) || "";
  const indexMatch = /^\d+ ([a-f0-9]{40}) \d+\t/.exec(indexStage);
  const indexBlobSha1 = indexMatch ? indexMatch[1] : null;
  const tracked = Boolean(indexStage);
  const headLine = headByPath.get(path) || "";
  const headMatch = /^\d+ blob ([a-f0-9]{40})\t/.exec(headLine);
  const headBlobSha1 = headMatch ? headMatch[1] : null;
  const lastResult = tracked ? git(["log", "-1", "--format=%H", "--", path], true) : { status: 1, stdout: "" };
  const rawBlob = rawByPath.get(path);
  const filteredBlob = filteredByPath.get(path);
  const chainNodes = [];
  if (roleMap.has(path)) chainNodes.push(roleMap.get(path));
  if (transitiveGraph.closurePaths.includes(path)) chainNodes.push("FULL_TRANSITIVE_LOCAL_STATIC_RUNTIME_CLOSURE");
  return {
    path,
    chainNodes,
    sourceState: tracked ? "TRACKED_WORKTREE" : "WORKTREE_ONLY_UNTRACKED",
    deployedCommitParity: false,
    worktreeSha256: fileSha(absolute),
    worktreeRawGitBlobSha1: rawBlob,
    worktreeFilteredGitBlobSha1: filteredBlob,
    indexStage,
    indexBlobSha1,
    derivedGitDirty: tracked ? filteredBlob !== indexBlobSha1 : null,
    headBlobSha1,
    lastPathCommit: lastResult.status === 0 && lastResult.stdout ? lastResult.stdout : null,
    statusPorcelainV2: statusByPath.get(path) || "",
    lsFilesVerbose: verboseByPath.get(path) || "",
    worktreeMatchesHead: tracked && headBlobSha1 ? filteredBlob === headBlobSha1 : false
  };
}

function jsxOpenings(ast, tagName) {
  const found = [];
  function visit(node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(ast) === tagName
    ) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}

function callNamed(root, name) {
  return Boolean(findNode(root, (node) =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name
  ));
}

function criticalSubtreeNode(selector) {
  const text = readFileSync(join(repo, selector.path), "utf8");
  const ast = parseSourceText(selector.path, text);
  if (selector.selectorType === "FUNCTION") return functionLike(ast, selector.name);
  if (selector.selectorType === "INITIALIZER") return initializer(ast, selector.name);
  if (selector.selectorType === "JSX_OPENING") return jsxOpenings(ast, selector.tagName)[selector.index || 0];
  if (selector.selectorType === "CALL_CONTAINING_FUNCTION") {
    const functions = [];
    function visit(node) {
      if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && callNamed(node, selector.calleeName)) functions.push(node);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    return functions[0];
  }
  return undefined;
}

const criticalSubtreeSelectors = [
  { selectorId: "route-entry-function", path: P.route, selectorType: "FUNCTION", name: "QuestionsGeneratePage" },
  { selectorId: "client-row-activation", path: P.client, selectorType: "FUNCTION", name: "handleSetActiveRow" },
  { selectorId: "client-desktop-generate", path: P.client, selectorType: "FUNCTION", name: "handleGenerateActiveRow" },
  { selectorId: "client-mobile-next", path: P.client, selectorType: "INITIALIZER", name: "mobileNext" },
  { selectorId: "client-ko-predicate", path: P.client, selectorType: "INITIALIZER", name: "koSetMode" },
  { selectorId: "client-workspace-opening", path: P.client, selectorType: "JSX_OPENING", tagName: "PassageWorkspace", index: 0 },
  { selectorId: "client-modal-opening", path: P.client, selectorType: "JSX_OPENING", tagName: "PassageGenerateModal", index: 0 },
  { selectorId: "client-panel-opening", path: P.client, selectorType: "JSX_OPENING", tagName: "GenerationConfigPanel", index: 0 },
  { selectorId: "client-mobile-nav-opening", path: P.client, selectorType: "JSX_OPENING", tagName: "MobileStepNav", index: 0 },
  { selectorId: "panel-component", path: P.panel, selectorType: "FUNCTION", name: "GenerationConfigPanel" },
  { selectorId: "panel-apply-count", path: P.panel, selectorType: "FUNCTION", name: "applyTypeCount" },
  { selectorId: "panel-increment-count", path: P.panel, selectorType: "FUNCTION", name: "incrementTypeCount" },
  { selectorId: "desktop-workspace-surface", path: P.workspaceSurface, selectorType: "FUNCTION", name: "PassageWorkspace" },
  { selectorId: "desktop-row-surface", path: P.rowSurface, selectorType: "FUNCTION", name: "WorkspacePassageRow" },
  { selectorId: "modal-component", path: P.modal, selectorType: "FUNCTION", name: "PassageGenerateModal" },
  { selectorId: "modal-generate-click", path: P.modal, selectorType: "CALL_CONTAINING_FUNCTION", calleeName: "onGenerate" },
  { selectorId: "mobile-nav-component", path: P.mobileNav, selectorType: "FUNCTION", name: "MobileStepNav" },
  { selectorId: "workspace-hook", path: P.workspaceHook, selectorType: "FUNCTION", name: "useWorkspaceGeneration" },
  { selectorId: "workspace-primary-handler", path: P.workspaceHook, selectorType: "FUNCTION", name: "handleWorkspaceGenerate" },
  { selectorId: "shared-handler-hook", path: P.handlers, selectorType: "FUNCTION", name: "useGenerationHandlers" },
  { selectorId: "shared-fast-helper", path: P.handlers, selectorType: "FUNCTION", name: "createFastQuestionGenerationJob" },
  { selectorId: "fast-scheduler", path: P.scheduler, selectorType: "FUNCTION", name: "scheduleFastGeneration" },
  { selectorId: "fast-plan", path: P.fastRoute, selectorType: "FUNCTION", name: "buildManualPlan" },
  { selectorId: "fast-post", path: P.fastRoute, selectorType: "FUNCTION", name: "POST" },
  { selectorId: "budget-wrapper", path: P.assignmentBudget, selectorType: "FUNCTION", name: "runWithQuestionGenerationAssignmentBudget" },
  { selectorId: "budget-active", path: P.assignmentBudget, selectorType: "FUNCTION", name: "runActive" },
  { selectorId: "generation-engine", path: P.runtime, selectorType: "FUNCTION", name: "runQuestionGeneration" },
  { selectorId: "generation-retry", path: P.runtime, selectorType: "FUNCTION", name: "runQuestionGenerationWithEmptyRetry" },
  { selectorId: "ai-response-schema", path: P.aiMc, selectorType: "FUNCTION", name: "getAiResponseSchema" },
  { selectorId: "secondary-grid-negative", path: P.passageGrid, selectorType: "FUNCTION", name: "PassageCardGrid" },
  { selectorId: "hidden-library-cta", path: P.numericDetail, selectorType: "FUNCTION", name: "renderLibraryGenerateButton" },
  { selectorId: "ui-picker-registry", path: P.ui, selectorType: "INITIALIZER", name: "QUESTION_TYPE_GROUPS" },
  { selectorId: "english-picker-alias", path: P.alias, selectorType: "INITIALIZER", name: "EXAM_TYPE_GROUPS" }
];

const criticalSubtrees = criticalSubtreeSelectors.map((selector) => {
  const node = criticalSubtreeNode(selector);
  if (!node) throw new Error("critical AST selector failed: " + selector.selectorId);
  return { ...selector, semanticSha256: sha256(node.getText()) };
});

const v3 = JSON.parse(readFileSync(join(v3Dir, "binding.json"), "utf8"));
const audit = JSON.parse(readFileSync(join(auditDir, "audit.json"), "utf8"));
const productionSources = requiredPaths.map(collect);
const worktreeOnlyPaths = productionSources
  .filter((source) => source.sourceState === "WORKTREE_ONLY_UNTRACKED")
  .map((source) => source.path);
const sourceAuthority = {
  contract: "Exact current-worktree authority. Every listed path binds raw SHA-256, raw and clean-filtered Git blobs, exact index/HEAD/history/status metadata when tracked, or exact worktree-only untracked absence from index/HEAD/history when untracked. Any state or byte transition fails closed.",
  closureBoundary: "CURRENT_WORKTREE_FULL_TRANSITIVE_LOCAL_STATIC_RUNTIME_CLOSURE",
  closureBoundaryLimit: "The closure recursively follows every local static import, export-from, literal dynamic import, and literal require from the named fast-route/runtime/schema roots. Type-only edges are conservatively included. Unresolved or non-literal module loads are forbidden. Node/package imports are external and excluded.",
  transitiveClosurePolicy: {
    staticImports: "INCLUDED_RECURSIVELY",
    exportFrom: "INCLUDED_RECURSIVELY",
    typeOnlyImports: "INCLUDED_CONSERVATIVELY",
    literalDynamicImports: "INCLUDED_RECURSIVELY",
    literalRequires: "INCLUDED_RECURSIVELY",
    nonLiteralModuleLoads: "FORBIDDEN",
    unresolvedLocalImports: "FORBIDDEN",
    externalPackagesAndNodeBuiltins: "OUTSIDE_LOCAL_BYTE_CLOSURE"
  },
  deployedCommitParity: false,
  repoFreeze: {
    repoHeadCommit: git(["rev-parse", "--verify", "HEAD^{commit}"], false).stdout,
    repoHeadTree: git(["rev-parse", "HEAD^{tree}"], false).stdout,
    headRef: git(["symbolic-ref", "--quiet", "HEAD"], false).stdout
  },
  interactiveAuthorityPaths,
  excludedRouteEvidencePaths,
  transitiveRuntimeRoots,
  transitiveRuntimeClosure: transitiveGraph.closurePaths,
  transitiveImportEdges: transitiveGraph.edges,
  nonLiteralModuleLoads: transitiveGraph.nonLiteral,
  unresolvedLocalImports: transitiveGraph.unresolved,
  worktreeOnlyPaths,
  productionSources
};

const sourceView = {
  repoFreeze: sourceAuthority.repoFreeze,
  deployedCommitParity: sourceAuthority.deployedCommitParity,
  closureBoundary: sourceAuthority.closureBoundary,
  transitiveClosurePolicy: sourceAuthority.transitiveClosurePolicy,
  interactiveAuthorityPaths: sourceAuthority.interactiveAuthorityPaths,
  excludedRouteEvidencePaths: sourceAuthority.excludedRouteEvidencePaths,
  transitiveRuntimeRoots: sourceAuthority.transitiveRuntimeRoots,
  transitiveRuntimeClosure: sourceAuthority.transitiveRuntimeClosure,
  transitiveImportEdges: sourceAuthority.transitiveImportEdges,
  nonLiteralModuleLoads: sourceAuthority.nonLiteralModuleLoads,
  unresolvedLocalImports: sourceAuthority.unresolvedLocalImports,
  worktreeOnlyPaths: sourceAuthority.worktreeOnlyPaths,
  productionSources: sourceAuthority.productionSources
};
sourceAuthority.semanticSha256 = semanticSha(sourceView);

const binding = {
  schemaVersion: "reviewer-calibration-v3-production-type-binding-4",
  artifactId: "reviewer-calibration-v3-production-type-binding-v4",
  status: "PRODUCTION_ROUTE_BINDING_CANDIDATE_REQUIRES_EXTERNAL_AUDIT",
  purpose: "Replace the failed v3 execution-authority claim with a fail-closed, current-worktree-only certificate for the actually reachable manual, non-Korean primary workspace fast path. Preserve v3 canonical/rotation math, reject its execution claim, bind worktree-only runtime dependencies explicitly, and remain non-issuable pending a fresh independent audit.",
  upstreams: [
    {
      artifactId: "reviewer-calibration-v3-production-type-binding-v3",
      path: "../reviewer-calibration-v3-production-type-binding-v3",
      manifestSha256: fileSha(join(v3Dir, "MANIFEST.sha256")),
      manifestEntries: parseManifest(join(v3Dir, "MANIFEST.sha256")),
      accepted: ["CANONICAL_25_23_SET", "EIGHT_FAMILY_PARTITION", "ROTATION_MATH"],
      executionAuthorityAccepted: false
    },
    {
      artifactId: "reviewer-calibration-v3-production-type-binding-v3-independent-audit-v1",
      path: "../../reviews/reviewer-calibration-v3-production-type-binding-v3-independent-audit-v1",
      manifestSha256: fileSha(join(auditDir, "MANIFEST.sha256")),
      manifestEntries: parseManifest(join(auditDir, "MANIFEST.sha256")),
      verdict: audit.verdict,
      acceptedAsFailureProvenance: true
    }
  ],
  v3FailureProvenance: {
    auditArtifactId: audit.artifactId,
    auditVerdict: audit.verdict,
    blockerCodes: audit.blockers.map((row) => row.code),
    acceptedFromV3: ["CANONICAL_25_23_SET", "EIGHT_FAMILY_PARTITION", "ROTATION_MATH"],
    executionAuthorityAccepted: false,
    remediation: {
      SECONDARY_BATCH_NOT_REACHABLE_FROM_REQUESTED_ROUTE: "Removed from positive authority; bound only as negative evidence.",
      LEGACY_TRIGGER_BRANCH_IS_DEAD_CODE: "Legacy route and Trigger are excluded and exact-bound only through immutable failure provenance.",
      SCHEMA_RUNTIME_SOURCE_CLOSURE_FAIL_OPEN: "Fast route, budget wrapper, generation runtime, and schema roots are recursively resolved through all local static/re-export/literal dynamic edges; every discovered worktree byte and Git state is exact-bound.",
      INTERACTIVE_DISPATCH_CLOSURE_INCOMPLETE: "Desktop row/modal CTA and mobile MobileStepNav event surfaces are now bound and path-checked."
    }
  },
  scope: {
    route: "/director/workbench/questions/generate",
    statePredicate: "MANUAL_AND_NON_KOREAN_ONLY",
    generationModePredicate: "genMode/effMode === manual",
    languagePredicate: "activeRowSubject/passageSubject !== KOREAN",
    claimedReachablePath: "PRIMARY_WORKSPACE_FAST_ONLY",
    claimedSurfaces: ["DESKTOP_PASSAGE_MODAL_FOOTER", "MOBILE_STEP_NAV_NEXT"],
    excludedPaths: [
      { pathClass: "SECONDARY_LIBRARY_BATCH", reachability: "NOT_REACHABLE_FROM_CLAIMED_ROUTE_STATE", reason: "The mounted panel has hideGenerateButtons and PassageCardGrid never invokes handleBatchGenerate." },
      { pathClass: "LEGACY_TRIGGER", reachability: "DEAD_FROM_PRIMARY_WORKSPACE", reason: "useWorkspaceGeneration imports only createFastQuestionGenerationJob; enqueueJob has no call in handleBatchGenerate." },
      { pathClass: "ENGLISH_SET_MODE", reachability: "OUT_OF_SCOPE", reason: "Question-set endpoint is not the manual per-type fast path." },
      { pathClass: "KOREAN_SET_MODE", reachability: "OUT_OF_SCOPE", reason: "Korean subject and KO set handlers are excluded by the state predicate." },
      { pathClass: "ALTERNATE_ENTRYPOINTS", reachability: "OUT_OF_SCOPE", reason: "Other UI and auto-generation routes are not the requested URL." }
    ]
  },
  sourceAuthority,
  astAuthorityChain: {
    subtreePolicy: "Exact parsed AST subtree hashes supplement dataflow predicates so an early return or throw that leaves an identifier textually present still fails closed.",
    criticalSubtrees,
    positivePath: [
      "QuestionsGeneratePage -> GeneratePageClient(defaultMode=manual, no subjectScope)",
      "QUESTION_TYPE_GROUPS(25) -> EXAM_TYPE_GROUPS -> non-Korean GenerationConfigPanel",
      "type tile id -> panel typeCounts -> active row override typeCounts",
      "desktop WorkspacePassageRow.onOpenSettings -> PassageGenerateModal.onGenerate -> handleWorkspaceGenerate(activeRowId)",
      "mobile MobileStepNav.next.onClick -> handleWorkspaceGenerate()",
      "effTypeCounts entries typeId -> FastUnit.questionType -> unit.questionType",
      "scheduleFastGeneration -> createFastQuestionGenerationJob -> literal fast endpoint",
      "fast POST -> buildManualPlan subType=questionType -> assignment budget callback -> runQuestionGenerationWithEmptyRetry",
      "runQuestionGeneration -> AI_QUESTION_SCHEMAS[subType] -> getAiResponseSchema(subType); QUESTION_SCHEMAS fallback explicit"
    ],
    negativePredicates: [
      "No Trigger import in the fast route",
      "No createQuestionGenerationJob call in useWorkspaceGeneration",
      "No handleBatchGenerate CallExpression in GeneratePageClient or PassageCardGrid",
      "No enqueueJob CallExpression in handleBatchGenerate",
      "Mobile configOnly modal branch closes without onGenerate"
    ]
  },
  canonicalUniverse: v3.canonicalUniverse,
  families: v3.families,
  rotation: v3.rotation,
  scheduleRows: v3.scheduleRows,
  claims: v3.claims,
  semanticDigests: {},
  independentAudit: {
    required: true,
    mode: "EXTERNAL_IMMUTABLE_SUBJECT",
    completedInThisArtifact: false,
    requiredVerdict: "PASS_NO_BLOCKERS",
    subjectMustRemainByteIdentical: true
  },
  issuance: {
    executionEligibleByThisArtifactAlone: false,
    v3ExecutionEligible: false,
    downstreamV4FreezeRequiresFreshPassAuditManifest: true,
    downstreamV4FreezeAllowedByThisArtifactAlone: false,
    deployedCommitParityClaimAllowed: false
  },
  activity: {
    externalNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
    databaseCalls: 0,
    secretReads: 0,
    trustedGoldReads: 0,
    trustedGoldWrites: 0
  }
};

binding.semanticDigests.canonicalBindingSha256 = semanticSha({
  canonicalUniverse: binding.canonicalUniverse,
  families: binding.families,
  rotation: binding.rotation,
  scheduleRows: binding.scheduleRows
});
binding.semanticDigests.productionSourceContractSha256 = sourceAuthority.semanticSha256;
binding.semanticDigests.auditCoreSha256 = semanticSha({
  purpose: binding.purpose,
  upstreams: binding.upstreams,
  v3FailureProvenance: binding.v3FailureProvenance,
  scope: binding.scope,
  sourceAuthority: binding.sourceAuthority,
  astAuthorityChain: binding.astAuthorityChain,
  canonicalUniverse: binding.canonicalUniverse,
  families: binding.families,
  rotation: binding.rotation,
  scheduleRows: binding.scheduleRows,
  claims: binding.claims
});

writeFileSync(join(base, "binding.json"), JSON.stringify(binding, null, 2) + "\n", "utf8");
process.stdout.write(JSON.stringify({
  artifactId: binding.artifactId,
  repoFreeze: sourceAuthority.repoFreeze,
  sourceCount: sourceAuthority.productionSources.length,
  trackedCount: sourceAuthority.productionSources.filter((row) => row.sourceState === "TRACKED_WORKTREE").length,
  worktreeOnlyCount: sourceAuthority.productionSources.filter((row) => row.sourceState === "WORKTREE_ONLY_UNTRACKED").length,
  sourceSemanticSha256: sourceAuthority.semanticSha256,
  auditCoreSha256: binding.semanticDigests.auditCoreSha256
}, null, 2) + "\n");
