import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const base = dirname(fileURLToPath(import.meta.url));
const repo = resolve(base, "../../../..");
const subject = resolve(base, "../../design/reviewer-calibration-v3-production-type-binding-v3");
const auditPath = join(base, "audit.json");
const reportPath = join(base, "REPORT.md");
const manifestPath = join(base, "MANIFEST.sha256");
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const binding = JSON.parse(readFileSync(join(subject, "binding.json"), "utf8"));
const checks = [];

const SUBJECT_MANIFEST_SHA256 = "d01349a4856097992ea4ef48f65221ed6adb44ca4b7baad9198d99ecb9638481";
const SUBJECT_AUDIT_CORE_SHA256 = "356085dcf0a5d34b5026519b03ea2d1e098db97de5a5e5b769aba8ff6fcc60cb";
const SUBJECT_MANIFEST_ENTRIES = {
  "REPORT.md": "14cef3db21f36618f8ca649d98af39009435aadba33ee783beab97f735872ddc",
  "binding.json": "7a0d1e8ebe0a19b055e351cb479f3d86ec38d9e6f138764a427252238947feb1",
  "hostile-fixtures.json": "c49bfcaae9a104931377400587f913779e115ab69efa3ab065a0ef9efb035a3d",
  "verify.mjs": "c8e3061a216e26d0d73a17e89ff02e94caa4c34dbde312e4e2ad7fe611484f6f"
};
const UPSTREAM_MANIFESTS = new Map([
  ["reviewer-calibration-v3-replacement-v1", "ea73ff0796f73065f701a294c5ee3b768a9f8ff8d8ffb79979fbe72abe64ba64"],
  ["reviewer-calibration-v3-production-type-binding-v2", "4e81452d0c74f3361cd01a59e5ec6406ea2fde729fd79f588dcdaf07c380de14"]
]);
const REQUIRED_SOURCES = [
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

function check(name, condition, detail = undefined) {
  checks.push({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
}

function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}

function setEq(name, actual, expected) {
  eq(name, [...new Set(actual)].sort(), [...new Set(expected)].sort());
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

function normalizeOutput(value) {
  return String(value || "").replace(/\r\n/g, "\n").trimEnd();
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return {
    status: result.status,
    stdout: normalizeOutput(result.stdout),
    stderr: normalizeOutput(result.stderr)
  };
}

function parseManifest(path) {
  const rows = new Map();
  for (const line of readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || rows.has(match[2])) throw new Error(`Invalid or duplicate manifest row: ${line}`);
    rows.set(match[2], match[1]);
  }
  return rows;
}

function duplicates(values) {
  const seen = new Set();
  const dup = new Set();
  for (const value of values) {
    if (seen.has(value)) dup.add(value);
    seen.add(value);
  }
  return [...dup];
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

function clone(value) {
  return structuredClone(value);
}

function sourceStat(path) {
  const s = statSync(path, { bigint: true });
  return { size: s.size.toString(), mtimeNs: s.mtimeNs.toString() };
}

function collectSource(path) {
  const absolute = join(repo, path);
  const exists = existsSync(absolute);
  const trackedResult = git(["ls-files", "--error-unmatch", "--", path], true);
  const rawBlob = exists ? git(["hash-object", "--no-filters", "--", path], true) : { status: 1, stdout: "" };
  const filteredBlob = exists ? git(["hash-object", `--path=${path}`, "--", path], true) : { status: 1, stdout: "" };
  const indexStage = git(["ls-files", "--stage", "--", path], true).stdout;
  const headBlob = git(["rev-parse", `HEAD:${path}`], true);
  const lastCommit = git(["log", "-1", "--format=%H", "--", path], true);
  const indexBlobSha1 = indexStage.split(/\s+/)[1] || null;
  const filtered = filteredBlob.status === 0 ? filteredBlob.stdout : null;
  return {
    path,
    exists,
    tracked: trackedResult.status === 0 && trackedResult.stdout === path,
    worktreeSha256: exists ? fileSha(absolute) : null,
    worktreeRawGitBlobSha1: rawBlob.status === 0 ? rawBlob.stdout : null,
    worktreeFilteredGitBlobSha1: filtered,
    indexStage,
    indexBlobSha1,
    derivedGitDirty: typeof filtered === "string" && typeof indexBlobSha1 === "string" && filtered !== indexBlobSha1,
    headBlobSha1: headBlob.status === 0 ? headBlob.stdout : null,
    lastPathCommit: lastCommit.status === 0 && lastCommit.stdout ? lastCommit.stdout : null,
    statusPorcelainV2: git(["status", "--porcelain=v2", "--untracked-files=all", "--", path], true).stdout,
    lsFilesVerbose: git(["ls-files", "-v", "--", path], true).stdout,
    stat: exists ? sourceStat(absolute) : null,
    attrs: git(["check-attr", "filter", "text", "eol", "--", path], true).stdout
  };
}

function collectSnapshot(paths) {
  return {
    repoFreeze: {
      repoHeadCommit: git(["rev-parse", "--verify", "HEAD^{commit}"]).stdout,
      repoHeadTree: git(["rev-parse", "HEAD^{tree}"]).stdout,
      headRef: git(["symbolic-ref", "--quiet", "HEAD"], true).stdout
    },
    sources: paths.map(collectSource)
  };
}

function validateSnapshot(expected, actual) {
  const reasons = new Set();
  if (actual.repoFreeze.repoHeadCommit !== expected.repoFreeze.repoHeadCommit) reasons.add("REPO_HEAD_DRIFT");
  if (actual.repoFreeze.repoHeadTree !== expected.repoFreeze.repoHeadTree) reasons.add("REPO_TREE_DRIFT");
  if (actual.repoFreeze.headRef !== expected.repoFreeze.headRef) reasons.add("REPO_REF_DRIFT");
  const expectedPaths = expected.productionSources.map((row) => row.path);
  if (duplicates(expectedPaths).length || JSON.stringify(expectedPaths) !== JSON.stringify(REQUIRED_SOURCES)) {
    reasons.add("SOURCE_SET_INVALID");
  }
  const actualByPath = new Map(actual.sources.map((row) => [row.path, row]));
  for (const row of expected.productionSources) {
    const now = actualByPath.get(row.path);
    const expectedComplete =
      row.trackedRequired === true &&
      /^[a-f0-9]{40}$/.test(row.headBlobSha1 || "") &&
      /^[a-f0-9]{40}$/.test(row.lastPathCommit || "") &&
      /^[a-f0-9]{40}$/.test(row.worktreeRawGitBlobSha1 || "") &&
      /^[a-f0-9]{40}$/.test(row.worktreeFilteredGitBlobSha1 || "") &&
      /^[a-f0-9]{40}$/.test(row.indexBlobSha1 || "") &&
      /^[A-Z] /.test(row.lsFilesVerbose || "");
    const actualComplete =
      now?.exists === true && now?.tracked === true &&
      /^[a-f0-9]{40}$/.test(now?.headBlobSha1 || "") &&
      /^[a-f0-9]{40}$/.test(now?.lastPathCommit || "") &&
      /^[A-Z] /.test(now?.lsFilesVerbose || "");
    if (!expectedComplete || !actualComplete) reasons.add("SOURCE_TRACKING_INVALID");
    if (!now) continue;
    if (now.worktreeSha256 !== row.worktreeSha256) reasons.add("WORKTREE_SHA_DRIFT");
    if (now.worktreeRawGitBlobSha1 !== row.worktreeRawGitBlobSha1) reasons.add("WORKTREE_RAW_GIT_BLOB_DRIFT");
    if (now.worktreeFilteredGitBlobSha1 !== row.worktreeFilteredGitBlobSha1) reasons.add("WORKTREE_FILTERED_GIT_BLOB_DRIFT");
    if (now.indexStage !== row.indexStage || now.indexBlobSha1 !== row.indexBlobSha1) reasons.add("INDEX_STAGE_DRIFT");
    if (now.derivedGitDirty !== row.derivedGitDirty) reasons.add("DERIVED_GIT_DIRTY_DRIFT");
    if (now.headBlobSha1 !== row.headBlobSha1) reasons.add("HEAD_BLOB_DRIFT");
    if (now.lastPathCommit !== row.lastPathCommit) reasons.add("LAST_PATH_COMMIT_DRIFT");
    if (now.statusPorcelainV2 !== row.statusPorcelainV2) reasons.add("PATH_STATUS_DRIFT");
    if (now.lsFilesVerbose !== row.lsFilesVerbose) reasons.add("LSFILES_FLAG_DRIFT");
  }
  return reasons;
}

function mutateSnapshot(actual, mutation) {
  const value = clone(actual);
  const first = value.sources[0];
  if (mutation === "HEAD") value.repoFreeze.repoHeadCommit = "0".repeat(40);
  if (mutation === "TREE") value.repoFreeze.repoHeadTree = "0".repeat(40);
  if (mutation === "REF") value.repoFreeze.headRef = "refs/heads/other";
  if (mutation === "SAME_BYTES_UNTRACKED") first.tracked = false;
  if (mutation === "REMOVED") {
    first.exists = false; first.worktreeSha256 = null; first.worktreeRawGitBlobSha1 = null;
    first.worktreeFilteredGitBlobSha1 = null;
  }
  if (mutation === "INDEX_VS_HEAD") first.headBlobSha1 = "0".repeat(40);
  if (mutation === "STAGED_ONLY") {
    first.indexStage = first.indexStage.replace(/[a-f0-9]{40}/, "1".repeat(40));
    first.indexBlobSha1 = "1".repeat(40);
    first.statusPorcelainV2 = `1 M. N... 100644 100644 100644 ${first.headBlobSha1} ${first.indexBlobSha1} ${first.path}`;
  }
  if (mutation === "UNSTAGED_RACY") {
    first.worktreeSha256 = "2".repeat(64); first.worktreeRawGitBlobSha1 = "2".repeat(40);
    first.worktreeFilteredGitBlobSha1 = "2".repeat(40);
  }
  if (mutation === "INTENT_TO_ADD") {
    first.headBlobSha1 = null; first.indexBlobSha1 = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";
    first.indexStage = `100644 ${first.indexBlobSha1} 0\t${first.path}`;
  }
  if (mutation === "ASSUME_UNCHANGED") first.lsFilesVerbose = `h ${first.path}`;
  if (mutation === "SKIP_WORKTREE") first.lsFilesVerbose = `s ${first.path}`;
  if (mutation === "RENAME") first.statusPorcelainV2 = `2 R. N... 100644 100644 100644 ${first.headBlobSha1} ${first.indexBlobSha1} R100 ${first.path}\told`;
  if (mutation === "COPY") first.statusPorcelainV2 = `2 C. N... 100644 100644 100644 ${first.headBlobSha1} ${first.indexBlobSha1} C100 ${first.path}\told`;
  if (mutation === "LAST_COMMIT") first.lastPathCommit = "3".repeat(40);
  if (mutation === "FILTER") first.worktreeFilteredGitBlobSha1 = "4".repeat(40);
  return value;
}

function unwrap(node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression?.(current))) {
    current = current.expression;
  }
  return current;
}

function astFor(path, text = readFileSync(join(repo, path), "utf8")) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function walk(root, predicate, { skipNestedFunctions = false } = {}) {
  const found = [];
  function visit(node, isRoot = false) {
    if (predicate(node)) found.push(node);
    if (skipNestedFunctions && !isRoot && ts.isFunctionLike(node)) return;
    ts.forEachChild(node, (child) => visit(child, false));
  }
  visit(root, true);
  return found;
}

function first(root, predicate) {
  return walk(root, predicate)[0];
}

function propertyName(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function initializer(ast, name) {
  return unwrap(first(ast, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)?.initializer);
}

function objectKeys(ast, name) {
  let value = initializer(ast, name);
  if (value && ts.isCallExpression(value)) value = unwrap(value.arguments[0]);
  if (!value || !ts.isObjectLiteralExpression(value)) return [];
  return value.properties.filter((row) => !ts.isSpreadAssignment(row)).map((row) => propertyName(row.name)).filter(Boolean);
}

function objectSpreads(ast, name) {
  const value = initializer(ast, name);
  if (!value || !ts.isObjectLiteralExpression(value)) return [];
  return value.properties.filter(ts.isSpreadAssignment).map((row) => unwrap(row.expression)).filter(ts.isIdentifier).map((row) => row.text);
}

function uiGroupReferences(ast) {
  const value = initializer(ast, "QUESTION_TYPE_GROUPS");
  if (!value) return [];
  return walk(value, (node) => ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "QUESTION_TYPE_UI")
    .map((node) => node.name.text);
}

function namedImportLocal(ast, moduleName, importedName) {
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== moduleName) continue;
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const match = bindings.elements.find((element) => (element.propertyName?.text || element.name.text) === importedName);
    if (match) return match.name.text;
  }
  return null;
}

function functionDeclaration(ast, name) {
  return first(ast, (node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
}

function functionValue(ast, name) {
  const decl = first(ast, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name);
  let value = unwrap(decl?.initializer);
  if (value && ts.isCallExpression(value)) value = unwrap(value.arguments[0]);
  return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : functionDeclaration(ast, name);
}

function identifierCalls(root, name, skipNestedFunctions = false) {
  return walk(root, (node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name, { skipNestedFunctions });
}

function identifierReferences(root, name) {
  return walk(root, (node) => ts.isIdentifier(node) && node.text === name);
}

function jsxElements(ast, tag) {
  return walk(ast, (node) => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === tag);
}

function jsxAttribute(node, name) {
  return node.attributes.properties.find((row) => ts.isJsxAttribute(row) && row.name.text === name);
}

function jsxAttributeIdentifier(node, name) {
  const attr = jsxAttribute(node, name);
  const expression = attr && ts.isJsxExpression(attr.initializer) ? unwrap(attr.initializer.expression) : null;
  return expression && ts.isIdentifier(expression) ? expression.text : null;
}

function jsxAttributeIsTrue(node, name) {
  const attr = jsxAttribute(node, name);
  if (!attr) return false;
  if (!attr.initializer) return true;
  const expression = ts.isJsxExpression(attr.initializer) ? unwrap(attr.initializer.expression) : null;
  return expression?.kind === ts.SyntaxKind.TrueKeyword;
}

function importedModuleNames(ast) {
  return ast.statements.filter(ts.isImportDeclaration).filter((node) => ts.isStringLiteral(node.moduleSpecifier)).map((node) => node.moduleSpecifier.text);
}

function selectedAt(order, epoch, role) {
  const n = order.length;
  const main = (epoch - 1) % n;
  const holdout = (epoch - 1 + Math.ceil(n / 2)) % n;
  const index = role === "MAIN" ? main : holdout;
  return { index, typeId: order[index] };
}

function rows(families) {
  return families.flatMap((family) => [1, 2, 3, 4].map((epoch) => {
    const main = selectedAt(family.rotationOrder, epoch, "MAIN");
    const holdout = selectedAt(family.rotationOrder, epoch, "HOLDOUT");
    return { familyId: family.familyId, epoch, mainIndex: main.index, mainTypeId: main.typeId, holdoutIndex: holdout.index, holdoutTypeId: holdout.typeId };
  }));
}

function coverage(families, epochCount, roles) {
  const values = new Set();
  for (let epoch = 1; epoch <= epochCount; epoch += 1) {
    for (const family of families) for (const role of roles) values.add(selectedAt(family.rotationOrder, epoch, role).typeId);
  }
  return values;
}

function reachableImportedCallFixture(text, importedName) {
  const ast = astFor("fixture.ts", text);
  const importDecl = ast.statements.find((node) => ts.isImportDeclaration(node));
  const bindings = importDecl?.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return false;
  const spec = bindings.elements.find((row) => (row.propertyName?.text || row.name.text) === importedName);
  if (!spec) return false;
  const local = spec.name.text;
  const root = functionDeclaration(ast, "root");
  if (!root) return false;
  const shadows = walk(root.body, (node) =>
    (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)) &&
    ts.isIdentifier(node.name) && node.name.text === local,
    { skipNestedFunctions: true }
  );
  if (shadows.length) return false;
  let reached = false;
  function visit(node, live = true, isRoot = false) {
    if (!live || reached) return;
    if (!isRoot && ts.isFunctionLike(node)) return;
    if (ts.isIfStatement(node) && node.expression.kind === ts.SyntaxKind.FalseKeyword) {
      if (node.elseStatement) visit(node.elseStatement, live, false);
      return;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === local) reached = true;
    ts.forEachChild(node, (child) => visit(child, live, false));
  }
  visit(root, true, true);
  return reached;
}

// External binding: neither the author's report nor its verifier is used as authority.
eq("audit subject id", audit.subjectArtifactId, "reviewer-calibration-v3-production-type-binding-v3");
eq("audit subject manifest metadata", audit.subjectCandidateManifestSha256, SUBJECT_MANIFEST_SHA256);
eq("audit subject core metadata", audit.subjectAuditCoreSha256, SUBJECT_AUDIT_CORE_SHA256);
eq("audit verdict", audit.verdict, "FAIL_BLOCKERS");
eq("math/execution verdict split", [audit.mathVerdict, audit.executionAuthorityVerdict], ["PASS_CANONICAL_AND_ROTATION_MATH", "FAIL_NOT_ISSUABLE"]);
eq("subject verifier not authority", audit.subjectVerifierUsedAsAuthority, false);
eq("blocker codes", audit.blockers.map((row) => row.code), [
  "SECONDARY_BATCH_NOT_REACHABLE_FROM_REQUESTED_ROUTE",
  "LEGACY_TRIGGER_BRANCH_IS_DEAD_CODE",
  "SCHEMA_RUNTIME_SOURCE_CLOSURE_FAIL_OPEN",
  "INTERACTIVE_DISPATCH_CLOSURE_INCOMPLETE"
]);

const subjectManifestPath = join(subject, "MANIFEST.sha256");
eq("subject manifest bytes", fileSha(subjectManifestPath), SUBJECT_MANIFEST_SHA256);
eq("subject manifest entries", Object.fromEntries(parseManifest(subjectManifestPath)), SUBJECT_MANIFEST_ENTRIES);
for (const [file, hash] of Object.entries(SUBJECT_MANIFEST_ENTRIES)) eq(`subject file ${file}`, fileSha(join(subject, file)), hash);
eq("subject artifact id", binding.artifactId, audit.subjectArtifactId);
eq("subject core embedded", binding.semanticDigests.auditCoreSha256, SUBJECT_AUDIT_CORE_SHA256);
eq("subject core independent recompute", semanticSha(auditCoreView(binding)), SUBJECT_AUDIT_CORE_SHA256);

eq("upstream count", binding.upstreams.length, 2);
for (const upstream of binding.upstreams) {
  eq(`upstream expected hash ${upstream.artifactId}`, upstream.manifestSha256, UPSTREAM_MANIFESTS.get(upstream.artifactId));
  const upstreamDir = resolve(subject, upstream.path);
  const upstreamManifest = join(upstreamDir, "MANIFEST.sha256");
  eq(`upstream manifest bytes ${upstream.artifactId}`, fileSha(upstreamManifest), upstream.manifestSha256);
  eq(`upstream manifest entries ${upstream.artifactId}`, Object.fromEntries(parseManifest(upstreamManifest)), upstream.manifestEntries);
  for (const [file, hash] of Object.entries(upstream.manifestEntries)) eq(`upstream bytes ${upstream.artifactId}/${file}`, fileSha(join(upstreamDir, file)), hash);
}

eq("subject source set", binding.sourceAuthority.productionSources.map((row) => row.path), REQUIRED_SOURCES);
const snapA = collectSnapshot(REQUIRED_SOURCES);
const snapB = collectSnapshot(REQUIRED_SOURCES);
eq("real snapshot matches subject", [...validateSnapshot(binding.sourceAuthority, snapA)], []);
eq("repeat snapshot matches subject", [...validateSnapshot(binding.sourceAuthority, snapB)], []);
eq("stable repo freeze", snapA.repoFreeze, snapB.repoFreeze);
for (let index = 0; index < snapA.sources.length; index += 1) {
  const a = snapA.sources[index];
  const b = snapB.sources[index];
  eq(`stable double-read ${a.path}`, {
    sha: a.worktreeSha256, raw: a.worktreeRawGitBlobSha1, filtered: a.worktreeFilteredGitBlobSha1,
    index: a.indexStage, head: a.headBlobSha1, status: a.statusPorcelainV2, flag: a.lsFilesVerbose, stat: a.stat, attrs: a.attrs
  }, {
    sha: b.worktreeSha256, raw: b.worktreeRawGitBlobSha1, filtered: b.worktreeFilteredGitBlobSha1,
    index: b.indexStage, head: b.headBlobSha1, status: b.statusPorcelainV2, flag: b.lsFilesVerbose, stat: b.stat, attrs: b.attrs
  });
}
check("CRLF/raw-filtered clean evidence", snapA.sources.some((row) =>
  row.statusPorcelainV2 === "" && row.derivedGitDirty === false &&
  row.worktreeRawGitBlobSha1 !== row.indexBlobSha1 && row.worktreeFilteredGitBlobSha1 === row.indexBlobSha1
));

const hostileStates = [
  ["HEAD", "REPO_HEAD_DRIFT"], ["TREE", "REPO_TREE_DRIFT"], ["REF", "REPO_REF_DRIFT"],
  ["SAME_BYTES_UNTRACKED", "SOURCE_TRACKING_INVALID"], ["REMOVED", "SOURCE_TRACKING_INVALID"],
  ["INDEX_VS_HEAD", "HEAD_BLOB_DRIFT"], ["STAGED_ONLY", "INDEX_STAGE_DRIFT"],
  ["UNSTAGED_RACY", "WORKTREE_SHA_DRIFT"], ["INTENT_TO_ADD", "SOURCE_TRACKING_INVALID"],
  ["ASSUME_UNCHANGED", "SOURCE_TRACKING_INVALID"], ["SKIP_WORKTREE", "SOURCE_TRACKING_INVALID"],
  ["RENAME", "PATH_STATUS_DRIFT"], ["COPY", "PATH_STATUS_DRIFT"],
  ["LAST_COMMIT", "LAST_PATH_COMMIT_DRIFT"], ["FILTER", "WORKTREE_FILTERED_GIT_BLOB_DRIFT"]
];
for (const [mutation, expected] of hostileStates) {
  check(`hostile provenance ${mutation}`, validateSnapshot(binding.sourceAuthority, mutateSnapshot(snapA, mutation)).has(expected));
}

eq(".gitattributes sha", fileSha(join(repo, audit.repositoryAttributeEvidence.path)), audit.repositoryAttributeEvidence.sha256);
eq(".gitattributes HEAD blob", git(["rev-parse", "HEAD:.gitattributes"]).stdout, audit.repositoryAttributeEvidence.headBlobSha1);
eq("info attributes absent", existsSync(join(repo, ".git/info/attributes")), false);
eq("core attributes file not configured", git(["config", "--get", "core.attributesfile"], true).stdout, "");
check("relevant filter attrs unspecified", snapA.sources.every((row) => row.attrs.split("\n").every((line) => /: (filter|text|eol): unspecified$/.test(line))));

for (const evidence of audit.evidenceSources) {
  eq(`evidence bytes ${evidence.path}`, fileSha(join(repo, evidence.path)), evidence.sha256);
  const tracked = git(["ls-files", "--error-unmatch", "--", evidence.path], true).status === 0;
  eq(`evidence tracked state ${evidence.path}`, tracked, evidence.tracked);
  check(`evidence excluded from subject ${evidence.path}`, !REQUIRED_SOURCES.includes(evidence.path));
}

const paths = {
  ui: REQUIRED_SOURCES[0], route: REQUIRED_SOURCES[1], client: REQUIRED_SOURCES[2], alias: REQUIRED_SOURCES[3],
  panel: REQUIRED_SOURCES[4], handlers: REQUIRED_SOURCES[5], workspace: REQUIRED_SOURCES[6], scheduler: REQUIRED_SOURCES[7],
  fast: REQUIRED_SOURCES[8], legacy: REQUIRED_SOURCES[9], trigger: REQUIRED_SOURCES[10], runtime: REQUIRED_SOURCES[11],
  structured: REQUIRED_SOURCES[12], ai: REQUIRED_SOURCES[13], vocab: REQUIRED_SOURCES[14],
  passageGrid: "src/app/(director)/director/workbench/generate/passage-card-grid.tsx",
  typeDetail: "src/app/(director)/director/workbench/generate/generation-config-panel-parts/type-numeric-detail.tsx"
};
const ast = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, astFor(path)]));

const routeComponentLocal = namedImportLocal(ast.route, "../../generate/generate-page-client", "GeneratePageClient");
eq("route import resolved", routeComponentLocal, "GeneratePageClient");
const routeDefault = ast.route.statements.find((node) => ts.isFunctionDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
const routeReturn = first(routeDefault, (node) => ts.isReturnStatement(node));
const routeJsx = unwrap(routeReturn?.expression);
check("route returns imported client", ts.isJsxSelfClosingElement(routeJsx) && routeJsx.tagName.getText(ast.route) === routeComponentLocal);
check("route manual literal dominates return", ts.isStringLiteral(jsxAttribute(routeJsx, "defaultMode")?.initializer) && jsxAttribute(routeJsx, "defaultMode").initializer.text === "manual");
check("route omits Korean subjectScope", !jsxAttribute(routeJsx, "subjectScope"));

const clientFn = functionDeclaration(ast.client, "GeneratePageClient");
check("client exported component exists", Boolean(clientFn?.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)));
const handlerCalls = identifierCalls(clientFn, "useGenerationHandlers");
const workspaceHookCalls = identifierCalls(clientFn, "useWorkspaceGeneration");
eq("client handler hook count", handlerCalls.length, 1);
eq("client workspace hook count", workspaceHookCalls.length, 1);
eq("client direct batch invocation count", identifierCalls(clientFn, "handleBatchGenerate").length, 0);
check("client invokes workspace handler", identifierCalls(clientFn, "handleWorkspaceGenerate").length >= 2);
const panelNodes = jsxElements(ast.client, "GenerationConfigPanel");
eq("client panel instance count", panelNodes.length, 1);
check("client panel hides generation buttons", jsxAttributeIsTrue(panelNodes[0], "hideGenerateButtons"));
eq("client panel receives batch callback", jsxAttributeIdentifier(panelNodes[0], "handleBatchGenerate"), "handleBatchGenerate");
eq("client panel receives workspace callback", jsxAttributeIdentifier(panelNodes[0], "onWorkspaceGenerate"), "handleWorkspaceGenerate");
eq("client panel subject dataflow", jsxAttributeIdentifier(panelNodes[0], "passageSubject"), "activeRowSubject");

const panelGroups = initializer(ast.panel, "panelTypeGroups");
check("panel English false branch is EXAM", ts.isConditionalExpression(panelGroups) && ts.isIdentifier(unwrap(panelGroups.whenFalse)) && unwrap(panelGroups.whenFalse).text === "EXAM_TYPE_GROUPS");
const koPanel = initializer(ast.panel, "koPanel");
check("panel Korean discriminator uses passageSubject", ts.isBinaryExpression(koPanel) && koPanel.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && koPanel.getText(ast.panel).includes('passageSubject === "KOREAN"'));
const libraryRender = first(ast.panel, (node) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "renderLibraryGenerateButton");
const libraryGuard = libraryRender && first(libraryRender.parent, (node) => ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken && ts.isIdentifier(node.operand) && node.operand.text === "hideGenerateButtons");
check("panel library CTA guarded by hideGenerateButtons", Boolean(libraryGuard));

eq("PassageCardGrid batch calls", identifierCalls(ast.passageGrid, "handleBatchGenerate").length, 0);
check("PassageCardGrid only receives unused batch prop", identifierReferences(ast.passageGrid, "handleBatchGenerate").length >= 1);
eq("type-detail isolated CTA call", identifierCalls(ast.typeDetail, "handleBatchGenerate").length, 1);
check("secondary batch route unreachable", identifierCalls(clientFn, "handleBatchGenerate").length === 0 && jsxAttributeIsTrue(panelNodes[0], "hideGenerateButtons") && identifierCalls(ast.passageGrid, "handleBatchGenerate").length === 0);

const handleBatch = functionValue(ast.handlers, "handleBatchGenerate");
const fastRunner = functionValue(ast.handlers, "runManualUnitsWithFastPath");
const enqueueJob = functionValue(ast.handlers, "enqueueJob");
check("batch function reaches fast runner", identifierCalls(handleBatch, "runManualUnitsWithFastPath").length === 1);
eq("batch function never reaches enqueueJob", identifierCalls(handleBatch, "enqueueJob").length, 0);
check("fast runner calls fast creator", identifierCalls(fastRunner, "createFastQuestionGenerationJob").length >= 1);
eq("enqueueJob whole-file invocation count", identifierCalls(ast.handlers, "enqueueJob").length, 0);
eq("legacy creator call confined to dead enqueue callback", identifierCalls(ast.handlers, "createQuestionGenerationJob").length, 1);
check("dead enqueue callback contains legacy creator", identifierCalls(enqueueJob, "createQuestionGenerationJob").length === 1);

const workspaceGenerate = functionValue(ast.workspace, "handleWorkspaceGenerate");
check("workspace constructs typed fast requests", identifierCalls(workspaceGenerate, "createFastQuestionGenerationJob").length >= 1 && identifierCalls(workspaceGenerate, "scheduleFastGeneration").length >= 1);
check("workspace questionType gets typeId", walk(workspaceGenerate, (node) => ts.isPropertyAssignment(node) && propertyName(node.name) === "questionType" && ts.isIdentifier(unwrap(node.initializer)) && unwrap(node.initializer).text === "typeId").length >= 1);
const schedulerFn = functionDeclaration(ast.scheduler, "scheduleFastGeneration");
check("scheduler executes task callback", identifierCalls(schedulerFn, "task").length === 1);

const fastRuntimeLocal = namedImportLocal(ast.fast, "@/app/api/ai/generate-questions-auto/_lib/run-question-generation", "runQuestionGenerationWithEmptyRetry");
eq("fast runtime import", fastRuntimeLocal, "runQuestionGenerationWithEmptyRetry");
check("fast POST calls runtime", identifierCalls(functionDeclaration(ast.fast, "POST"), fastRuntimeLocal).length >= 1);
check("legacy route triggers named task", walk(functionDeclaration(ast.legacy, "POST"), (node) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "trigger" && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "workbench-question-generation").length === 1);
check("Trigger task calls runtime", identifierCalls(ast.trigger, "runQuestionGenerationWithEmptyRetry").length >= 1);
check("runtime indexes AI schema", walk(ast.runtime, (node) => ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "AI_QUESTION_SCHEMAS" && ts.isIdentifier(node.argumentExpression) && node.argumentExpression.text === "subType").length >= 1);
check("runtime indexes fallback schema", walk(ast.runtime, (node) => ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "QUESTION_SCHEMAS" && ts.isIdentifier(node.argumentExpression) && node.argumentExpression.text === "subType").length >= 1);
check("runtime selected AI branch calls getAiResponseSchema", identifierCalls(ast.runtime, "getAiResponseSchema").length >= 1);

const uiIds = uiGroupReferences(ast.ui);
eq("UI canonical 25", uiIds, binding.canonicalUniverse.uiTypeIdsInOrder);
eq("UI no duplicates", duplicates(uiIds), []);
const computedNonfocus = uiIds.filter((id) => !new Set(binding.canonicalUniverse.focusTypeIds).has(id));
eq("computed nonfocus 23", computedNonfocus, binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
const expectedSchemaIds = [...uiIds, "TOPIC_MAIN_IDEA"];
const structuredIds = objectKeys(ast.structured, "QUESTION_SCHEMAS");
const aiIds = [...objectKeys(ast.ai, "AI_MC_QUESTION_SCHEMAS"), ...objectKeys(ast.vocab, "AI_VOCAB_QUESTION_SCHEMAS"), ...objectKeys(ast.ai, "AI_ESSAY_QUESTION_SCHEMAS")];
setEq("structured schema 26", structuredIds, expectedSchemaIds);
setEq("AI schema 26", aiIds, expectedSchemaIds);
eq("structured unique", duplicates(structuredIds), []);
eq("AI unique", duplicates(aiIds), []);
check("AI aggregator spreads all partitions", ["AI_MC_QUESTION_SCHEMAS", "AI_VOCAB_QUESTION_SCHEMAS", "AI_ESSAY_QUESTION_SCHEMAS"].every((id) => objectSpreads(ast.ai, "AI_QUESTION_SCHEMAS").includes(id)));
check("all canonical types select AI branch", uiIds.every((id) => new Set(aiIds).has(id)));

const aiImports = importedModuleNames(ast.ai);
const runtimeImports = importedModuleNames(ast.runtime);
const structuredImports = importedModuleNames(ast.structured);
check("AI schema direct unbound research import", aiImports.includes("./question-generation-research-schema") && !REQUIRED_SOURCES.includes("src/lib/question-generation-research-schema.ts"));
check("AI schema direct unbound MC provider", aiImports.includes("./question-schemas-mc") && !REQUIRED_SOURCES.includes("src/lib/question-schemas-mc.ts"));
check("structured direct unbound MC provider", structuredImports.includes("./question-schemas-mc") && !REQUIRED_SOURCES.includes("src/lib/question-schemas-mc.ts"));
for (const moduleName of ["@/lib/question-generation-research-schema", "@/lib/question-generation-research-profiles", "@/lib/question-generation-research-runtime"]) {
  check(`runtime unbound direct import ${moduleName}`, runtimeImports.includes(moduleName));
}
for (const path of [
  "src/lib/question-generation-research-schema.ts",
  "src/lib/question-generation-research-profiles.ts",
  "src/lib/question-generation-research-runtime.ts"
]) {
  eq(`critical dependency is untracked ${path}`, git(["ls-files", "--error-unmatch", "--", path], true).status, 1);
}

const mapped = binding.families.flatMap((family) => family.rotationOrder);
eq("family partition no duplicates", duplicates(mapped), []);
setEq("family partition exact nonfocus", mapped, binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
eq("schedule rows independent", binding.scheduleRows, rows(binding.families));
eq("one epoch contact", coverage(binding.families, 1, ["MAIN", "HOLDOUT"]).size, 16);
eq("two epoch contact", coverage(binding.families, 2, ["MAIN", "HOLDOUT"]).size, 23);
eq("four epoch main contact", coverage(binding.families, 4, ["MAIN"]).size, 23);
eq("contact is not certification", binding.rotation.contactIsCertification, false);
eq("n2", [selectedAt(["a", "b"], 1, "MAIN").index, selectedAt(["a", "b"], 1, "HOLDOUT").index], [0, 1]);
eq("n3 e1/e2", [selectedAt(["a", "b", "c"], 1, "MAIN").index, selectedAt(["a", "b", "c"], 1, "HOLDOUT").index, selectedAt(["a", "b", "c"], 2, "MAIN").index, selectedAt(["a", "b", "c"], 2, "HOLDOUT").index], [0, 2, 1, 0]);
eq("n4 e1/e2", [selectedAt(["a", "b", "c", "d"], 1, "MAIN").index, selectedAt(["a", "b", "c", "d"], 1, "HOLDOUT").index, selectedAt(["a", "b", "c", "d"], 2, "MAIN").index, selectedAt(["a", "b", "c", "d"], 2, "HOLDOUT").index], [0, 2, 1, 3]);

check("alias-aware fixture accepted", reachableImportedCallFixture('import { run as alias } from "./m"; export function root(){ alias(); }', "run"));
check("shadowed import fixture rejected", !reachableImportedCallFixture('import { run } from "./m"; export function root(){ const run=()=>0; run(); }', "run"));
check("dead nested callback fixture rejected", !reachableImportedCallFixture('import { run } from "./m"; export function root(){ const dead=()=>run(); return 1; }', "run"));
check("false branch fixture rejected", !reachableImportedCallFixture('import { run } from "./m"; export function root(){ if(false){ run(); } }', "run"));
check("string literal fixture rejected", !reachableImportedCallFixture('import { run } from "./m"; export function root(){ return "run()"; }', "run"));

for (const [key, value] of Object.entries(audit.activity)) eq(`offline activity ${key}`, value, 0);
const report = readFileSync(reportPath, "utf8");
for (const phrase of ["FAIL_BLOCKERS", "SECONDARY_BATCH", "dead code", "untracked", "API candidate 0"]) check(`report phrase ${phrase}`, report.includes(phrase));

if (process.argv.includes("--check-manifest")) {
  check("audit manifest exists", existsSync(manifestPath));
  if (existsSync(manifestPath)) {
    const expectedFiles = ["REPORT.md", "audit.json", "verify.mjs"];
    const rows = parseManifest(manifestPath);
    eq("audit manifest names", [...rows.keys()].sort(), expectedFiles.sort());
    eq("audit manifest count", rows.size, expectedFiles.length);
    for (const file of expectedFiles) eq(`audit manifest ${file}`, rows.get(file), fileSha(join(base, file)));
  }
}

const failures = checks.filter((row) => !row.pass);
const result = {
  schemaVersion: "reviewer-calibration-v3-production-type-binding-v3-independent-audit-verification-1",
  status: failures.length ? "FAIL_AUDIT_ARTIFACT_INVALID" : "PASS_AUDIT_ARTIFACT_VERIFIED",
  verdict: audit.verdict,
  mathVerdict: audit.mathVerdict,
  executionAuthorityVerdict: audit.executionAuthorityVerdict,
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  blockers: audit.blockers.map((row) => row.code),
  subject: {
    artifactId: audit.subjectArtifactId,
    manifestSha256: audit.subjectCandidateManifestSha256,
    auditCoreSha256: audit.subjectAuditCoreSha256
  },
  activity: audit.activity,
  failures
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
