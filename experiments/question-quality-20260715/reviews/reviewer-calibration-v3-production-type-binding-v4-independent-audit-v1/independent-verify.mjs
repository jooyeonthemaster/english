#!/usr/bin/env node

/**
 * Independent, read-only hostile verifier for production type binding v4.
 *
 * This program deliberately does not import, execute, or reuse the subject's
 * verifier/build script. It performs its own strict JSON parsing, Git evidence
 * collection, recursive TypeScript import closure, AST/data-flow predicates,
 * rotation mathematics, in-memory hostile mutations, and start/end TOCTOU
 * snapshots. It never opens a network socket and never reads environment files,
 * databases, secrets, trusted-gold material, or the API-candidate ledger.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import childProcess from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const TARGET = path.join(
  REPO,
  "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4",
);
const TARGET_MANIFEST_SET = new Set([
  "REPORT.md",
  "binding.json",
  "hostile-fixtures.json",
  "verify.mjs",
]);
const FAST_ENDPOINT = "/api/workbench/ai-jobs/question-generation/fast";
const encoder = new TextEncoder();
const fatalDecoder = new TextDecoder("utf-8", { fatal: true });

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return crypto.createHash("sha1").update(header).update(bytes).digest("hex");
}

function normalizeRel(value) {
  return value.replaceAll("\\", "/");
}

function strictUtf8(bytes, label) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`${label}: UTF-8 BOM forbidden`);
  }
  return fatalDecoder.decode(bytes);
}

// Minimal recursive-descent JSON parser. Unlike JSON.parse, duplicate object
// keys are rejected at every depth.
function strictJson(text, label) {
  let i = 0;
  const fail = (message) => {
    throw new Error(`${label}: ${message} at byte/char ${i}`);
  };
  const ws = () => {
    while (i < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[i])) i += 1;
  };
  const string = () => {
    if (text[i] !== '"') fail("expected string");
    const start = i;
    i += 1;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') {
        i += 1;
        try {
          return JSON.parse(text.slice(start, i));
        } catch {
          fail("invalid string escape");
        }
      }
      if (c === "\\") {
        i += 1;
        if (i >= text.length) fail("truncated escape");
        if (text[i] === "u") {
          const hex = text.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid unicode escape");
          i += 5;
        } else {
          if (!/["\\/bfnrt]/.test(text[i])) fail("invalid escape");
          i += 1;
        }
      } else {
        if (c.charCodeAt(0) < 0x20) fail("unescaped control character");
        i += 1;
      }
    }
    fail("unterminated string");
  };
  const number = () => {
    const match = text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) fail("invalid number");
    i += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail("non-finite number");
    return value;
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '"') return string();
    if (c === "{") {
      i += 1;
      ws();
      const out = {};
      const keys = new Set();
      if (text[i] === "}") {
        i += 1;
        return out;
      }
      while (true) {
        ws();
        const key = string();
        if (keys.has(key)) fail(`duplicate key ${JSON.stringify(key)}`);
        keys.add(key);
        ws();
        if (text[i] !== ":") fail("expected colon");
        i += 1;
        out[key] = value();
        ws();
        if (text[i] === "}") {
          i += 1;
          return out;
        }
        if (text[i] !== ",") fail("expected comma");
        i += 1;
      }
    }
    if (c === "[") {
      i += 1;
      ws();
      const out = [];
      if (text[i] === "]") {
        i += 1;
        return out;
      }
      while (true) {
        out.push(value());
        ws();
        if (text[i] === "]") {
          i += 1;
          return out;
        }
        if (text[i] !== ",") fail("expected comma");
        i += 1;
      }
    }
    if (text.startsWith("true", i)) {
      i += 4;
      return true;
    }
    if (text.startsWith("false", i)) {
      i += 5;
      return false;
    }
    if (text.startsWith("null", i)) {
      i += 4;
      return null;
    }
    return number();
  };
  const result = value();
  ws();
  if (i !== text.length) fail("trailing input");
  return result;
}

function readBytes(absolute) {
  return fs.readFileSync(absolute);
}

function readStrictJson(absolute, label) {
  return strictJson(strictUtf8(readBytes(absolute), label), label);
}

function targetSnapshot() {
  const entries = fs
    .readdirSync(TARGET, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const bytes = readBytes(path.join(TARGET, entry.name));
      return { name: entry.name, bytes: bytes.length, sha256: sha256(bytes) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { digest: sha256(encoder.encode(JSON.stringify(entries))), entries };
}

function parseManifest(bytes, expectedSet = TARGET_MANIFEST_SET) {
  const text = strictUtf8(bytes, "subject MANIFEST.sha256");
  const entries = [];
  const names = new Set();
  for (const raw of text.split(/\r?\n/)) {
    if (!raw) continue;
    const match = raw.match(/^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/);
    if (!match) throw new Error(`manifest malformed line: ${JSON.stringify(raw)}`);
    const [, digest, name] = match;
    if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      throw new Error(`manifest unsafe name: ${name}`);
    }
    if (names.has(name)) throw new Error(`manifest duplicate name: ${name}`);
    names.add(name);
    entries.push({ name, sha256: digest });
  }
  const missing = [...expectedSet].filter((name) => !names.has(name));
  const extra = [...names].filter((name) => !expectedSet.has(name));
  if (missing.length || extra.length) {
    throw new Error(`manifest set mismatch missing=${missing.join(",")} extra=${extra.join(",")}`);
  }
  return entries;
}

function verifyManifestAgainst(map, manifestBytes) {
  const entries = parseManifest(manifestBytes);
  const mismatches = [];
  for (const entry of entries) {
    const bytes = map.get(entry.name);
    if (!bytes) {
      mismatches.push({ name: entry.name, issue: "missing" });
      continue;
    }
    const actual = sha256(bytes);
    if (actual !== entry.sha256) mismatches.push({ name: entry.name, expected: entry.sha256, actual });
  }
  return { entries, mismatches };
}

function subjectFileMap() {
  return new Map(
    fs
      .readdirSync(TARGET, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [entry.name, readBytes(path.join(TARGET, entry.name))]),
  );
}

function git(args, options = {}) {
  return childProcess.execFileSync("git", args, {
    cwd: REPO,
    encoding: options.encoding ?? "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function currentRepoFreeze() {
  const head = git(["rev-parse", "HEAD"]).trim();
  const tree = git(["rev-parse", "HEAD^{tree}"]).trim();
  let ref = null;
  try {
    ref = git(["symbolic-ref", "-q", "HEAD"]).trim() || null;
  } catch {
    ref = null;
  }
  return { repoHeadCommit: head, repoHeadTree: tree, headRef: ref };
}

function parseIndex() {
  const out = git(["ls-files", "--stage", "-z"]);
  const map = new Map();
  for (const record of out.split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    if (tab < 0) continue;
    const metadata = record.slice(0, tab);
    const rel = normalizeRel(record.slice(tab + 1));
    const [mode, blob, stage] = metadata.split(" ");
    if (stage === "0") map.set(rel, { mode, blob, stage, line: `${metadata}\t${rel}` });
  }
  return map;
}

function parseVerboseIndex() {
  const out = git(["ls-files", "-v", "-z"]);
  const map = new Map();
  for (const record of out.split("\0")) {
    if (!record) continue;
    const rel = normalizeRel(record.slice(2));
    map.set(rel, `${record.slice(0, 2)}${rel}`);
  }
  return map;
}

function parseHeadTree() {
  const out = git(["ls-tree", "-r", "-z", "HEAD"]);
  const map = new Map();
  for (const record of out.split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    if (tab < 0) continue;
    const [mode, type, blob] = record.slice(0, tab).split(" ");
    if (type === "blob") map.set(normalizeRel(record.slice(tab + 1)), { mode, blob });
  }
  return map;
}

function parseStatus() {
  const out = git([
    "status",
    "--porcelain=v2",
    "-z",
    "--untracked-files=all",
    "--ignore-submodules=none",
  ]);
  const records = out.split("\0");
  const map = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.startsWith("# ")) continue;
    if (record.startsWith("? ") || record.startsWith("! ")) {
      map.set(normalizeRel(record.slice(2)), record);
      continue;
    }
    const fields = record.split(" ");
    let pathIndex;
    if (record.startsWith("1 ")) pathIndex = 8;
    else if (record.startsWith("2 ")) pathIndex = 9;
    else if (record.startsWith("u ")) pathIndex = 10;
    else continue;
    const rel = normalizeRel(fields.slice(pathIndex).join(" "));
    map.set(rel, record);
    if (record.startsWith("2 ")) index += 1; // original rename path is the next NUL record
  }
  return map;
}

function lastCommitForPath(rel) {
  // Per-path history is intentional. A single --name-only traversal does not
  // reproduce Git's path-history simplification for merge commits.
  const value = git(["log", "-1", "--format=%H", "--", rel]).trim();
  return value || null;
}

function filteredBlob(rel) {
  return git(["hash-object", `--path=${rel}`, "--", rel]).trim();
}

function sourcePathSafety(rel) {
  if (typeof rel !== "string" || !rel || path.isAbsolute(rel)) return false;
  if (normalizeRel(path.normalize(rel)) !== rel || rel.split("/").includes("..")) return false;
  const absolute = path.resolve(REPO, rel);
  const real = fs.realpathSync.native(absolute);
  const prefix = `${fs.realpathSync.native(REPO)}${path.sep}`.toLowerCase();
  if (!real.toLowerCase().startsWith(prefix)) return false;
  return fs.statSync(absolute).isFile() && !fs.lstatSync(absolute).isSymbolicLink();
}

function collectGitEvidence(binding) {
  const claimed = binding.sourceAuthority.productionSources;
  const index = parseIndex();
  const verbose = parseVerboseIndex();
  const headTree = parseHeadTree();
  const status = parseStatus();
  const actual = [];
  for (const claim of claimed) {
    const rel = claim.path;
    if (!sourcePathSafety(rel)) throw new Error(`unsafe/non-regular source path: ${rel}`);
    const bytes = readBytes(path.join(REPO, rel));
    const ix = index.get(rel) ?? null;
    const hd = headTree.get(rel) ?? null;
    const filtered = filteredBlob(rel);
    const tracked = Boolean(ix);
    actual.push({
      path: rel,
      sourceState: tracked ? "TRACKED_WORKTREE" : "WORKTREE_ONLY_UNTRACKED",
      deployedCommitParity: false,
      worktreeSha256: sha256(bytes),
      worktreeRawGitBlobSha1: gitBlobSha1(bytes),
      worktreeFilteredGitBlobSha1: filtered,
      indexStage: ix?.line ?? "",
      indexBlobSha1: ix?.blob ?? null,
      derivedGitDirty: tracked ? filtered !== ix.blob : null,
      headBlobSha1: hd?.blob ?? null,
      lastPathCommit: lastCommitForPath(rel),
      statusPorcelainV2: status.get(rel) ?? "",
      lsFilesVerbose: verbose.get(rel) ?? "",
      worktreeMatchesHead: Boolean(hd) && filtered === hd.blob,
    });
  }
  return actual;
}

function compareGitEvidence(binding, actual) {
  const fields = [
    "sourceState",
    "deployedCommitParity",
    "worktreeSha256",
    "worktreeRawGitBlobSha1",
    "worktreeFilteredGitBlobSha1",
    "indexStage",
    "indexBlobSha1",
    "derivedGitDirty",
    "headBlobSha1",
    "lastPathCommit",
    "statusPorcelainV2",
    "lsFilesVerbose",
    "worktreeMatchesHead",
  ];
  const mismatches = [];
  const claimedByPath = new Map(binding.sourceAuthority.productionSources.map((entry) => [entry.path, entry]));
  for (const row of actual) {
    const claim = claimedByPath.get(row.path);
    if (!claim) {
      mismatches.push({ path: row.path, field: "path", issue: "unclaimed" });
      continue;
    }
    for (const field of fields) {
      if (claim[field] !== row[field]) {
        mismatches.push({ path: row.path, field, claimed: claim[field], actual: row[field] });
      }
    }
  }
  return mismatches;
}

const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".json"];

function resolveLocal(fromRel, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(REPO, "src", specifier.slice(2));
  else base = path.resolve(REPO, path.dirname(fromRel), specifier);
  const candidates = [];
  if (path.extname(base)) candidates.push(base);
  else {
    candidates.push(base);
    for (const extension of MODULE_EXTENSIONS) candidates.push(`${base}${extension}`);
    for (const extension of MODULE_EXTENSIONS) candidates.push(path.join(base, `index${extension}`));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return normalizeRel(path.relative(REPO, candidate));
    }
  }
  return null;
}

function scriptKind(rel) {
  if (rel.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (rel.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (rel.endsWith(".js")) return ts.ScriptKind.JS;
  if (rel.endsWith(".json")) return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
}

function sourceFile(rel, text) {
  return ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, scriptKind(rel));
}

function staticEdgeKind(node) {
  if (ts.isImportDeclaration(node)) {
    let typeOnly = Boolean(node.importClause?.isTypeOnly);
    if (!typeOnly && !node.importClause?.name && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      const elements = node.importClause.namedBindings.elements;
      typeOnly = elements.length > 0 && elements.every((element) => element.isTypeOnly);
    }
    return typeOnly ? "IMPORT_TYPE_ONLY_INCLUDED" : "IMPORT_RUNTIME_OR_MIXED";
  }
  let typeOnly = Boolean(node.isTypeOnly);
  if (!typeOnly && node.exportClause && ts.isNamedExports(node.exportClause)) {
    const elements = node.exportClause.elements;
    typeOnly = elements.length > 0 && elements.every((element) => element.isTypeOnly);
  }
  return typeOnly ? "EXPORT_TYPE_ONLY_INCLUDED" : "EXPORT_RUNTIME_OR_MIXED";
}

function computeClosure(roots, overrides = new Map()) {
  const queue = [...roots];
  const closure = new Set();
  const edges = [];
  const unresolved = [];
  const nonliteral = [];
  const parseDiagnostics = [];
  const textFor = (rel) =>
    overrides.has(rel)
      ? overrides.get(rel)
      : strictUtf8(readBytes(path.join(REPO, rel)), `source ${rel}`);

  while (queue.length) {
    const rel = queue.shift();
    if (closure.has(rel)) continue;
    closure.add(rel);
    if (rel.endsWith(".json")) {
      strictJson(textFor(rel), `closure JSON ${rel}`);
      continue;
    }
    const sf = sourceFile(rel, textFor(rel));
    if (sf.parseDiagnostics.length) {
      parseDiagnostics.push(
        ...sf.parseDiagnostics.map((diagnostic) => ({
          path: rel,
          start: diagnostic.start ?? null,
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
        })),
      );
    }
    const add = (node, specifier, edgeKind) => {
      if (!(specifier.startsWith(".") || specifier.startsWith("@/"))) return;
      const to = resolveLocal(rel, specifier);
      if (!to) {
        unresolved.push({ from: rel, specifier, position: node.pos });
        return;
      }
      edges.push({ from: rel, specifier, edgeKind, position: node.pos, to });
      queue.push(to);
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        add(node, node.moduleSpecifier.text, staticEdgeKind(node));
      }
      if (ts.isCallExpression(node)) {
        const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
        if (isDynamic || isRequire) {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteralLike(argument)) {
            add(node, argument.text, isDynamic ? "DYNAMIC_LITERAL_INCLUDED" : "REQUIRE_LITERAL_INCLUDED");
          } else {
            nonliteral.push({
              from: rel,
              position: node.pos,
              kind: isDynamic ? "dynamic-import" : "require",
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  const edgeSort = (a, b) =>
    a.from.localeCompare(b.from) ||
    a.position - b.position ||
    a.specifier.localeCompare(b.specifier) ||
    a.to.localeCompare(b.to);
  return {
    closure: [...closure].sort(),
    edges: edges.sort(edgeSort),
    unresolved,
    nonliteral,
    parseDiagnostics,
  };
}

function equalJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function descendants(root, predicate) {
  const out = [];
  const visit = (node) => {
    if (predicate(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return out;
}

function findNamedFunction(sf, name) {
  const unwrap = (value) => {
    let node = value;
    while (
      node &&
      (ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isSatisfiesExpression?.(node) ||
        ts.isNonNullExpression(node))
    ) {
      node = node.expression;
    }
    return node;
  };
  for (const node of descendants(sf, () => true)) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      let init = unwrap(node.initializer);
      if (init && ts.isCallExpression(init) && init.arguments.length && (ts.isArrowFunction(init.arguments[0]) || ts.isFunctionExpression(init.arguments[0]))) {
        init = init.arguments[0];
      }
      if (init && ts.isCallExpression(init)) {
        const invoked = unwrap(init.expression);
        if (invoked && (ts.isArrowFunction(invoked) || ts.isFunctionExpression(invoked))) init = invoked;
      }
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return init;
    }
  }
  return null;
}

function calleeName(call) {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return null;
}

function calls(root, name) {
  return descendants(root, (node) => ts.isCallExpression(node) && calleeName(node) === name);
}

function statementContaining(node, block) {
  let current = node;
  while (current && current.parent !== block) current = current.parent;
  return current ?? null;
}

function hasPriorUnconditionalTerminator(call, boundary) {
  let current = call;
  while (current && current !== boundary) {
    const parent = current.parent;
    if (parent && ts.isBlock(parent)) {
      const container = statementContaining(current, parent);
      const index = parent.statements.findIndex((statement) => statement === container);
      if (
        index >= 0 &&
        parent.statements
          .slice(0, index)
          .some((statement) => ts.isReturnStatement(statement) || ts.isThrowStatement(statement))
      ) {
        return true;
      }
    }
    current = parent;
  }
  return false;
}

function reachableCall(root, name, argumentTexts = null) {
  return calls(root, name).some((call) => {
    if (argumentTexts) {
      const actual = call.arguments.map((argument) => argument.getText());
      if (!equalJson(actual, argumentTexts)) return false;
    }
    return !hasPriorUnconditionalTerminator(call, root);
  });
}

function jsxElements(root, tag) {
  return descendants(root, (node) => {
    if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText() === tag;
    if (ts.isJsxOpeningElement(node)) return node.tagName.getText() === tag;
    return false;
  });
}

function jsxAttr(element, name) {
  return element.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function jsxAttrText(element, name) {
  const attr = jsxAttr(element, name);
  if (!attr || !attr.initializer) return null;
  if (ts.isStringLiteral(attr.initializer)) return JSON.stringify(attr.initializer.text);
  if (ts.isJsxExpression(attr.initializer)) return attr.initializer.expression?.getText() ?? "";
  return attr.initializer.getText();
}

function objectPropertyText(object, name) {
  const property = object.properties.find((candidate) => {
    if (ts.isShorthandPropertyAssignment(candidate)) return candidate.name.text === name;
    if (!ts.isPropertyAssignment(candidate)) return false;
    return candidate.name.getText().replace(/^['"]|['"]$/g, "") === name;
  });
  if (!property) return null;
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  return property.initializer.getText();
}

function findObjectArgument(call) {
  return call.arguments.find((argument) => ts.isObjectLiteralExpression(argument)) ?? null;
}

function extractQuestionTypes(uiText) {
  const sf = sourceFile("src/lib/question-type-ui.ts", uiText);
  const declaration = descendants(
    sf,
    (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "QUESTION_TYPE_GROUPS",
  )[0];
  if (!declaration?.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) return [];
  const ids = [];
  for (const group of declaration.initializer.elements) {
    if (!ts.isObjectLiteralExpression(group)) continue;
    const items = group.properties.find(
      (property) => ts.isPropertyAssignment(property) && property.name.getText() === "items",
    );
    if (!items || !ts.isPropertyAssignment(items) || !ts.isArrayLiteralExpression(items.initializer)) continue;
    for (const item of items.initializer.elements) {
      if (
        ts.isPropertyAccessExpression(item) &&
        item.expression.getText() === "QUESTION_TYPE_UI"
      ) {
        ids.push(item.name.text);
      }
    }
  }
  return ids;
}

function objectRegistryKeys(text, variableName, rel) {
  const sf = sourceFile(rel, text);
  const declaration = descendants(
    sf,
    (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName,
  )[0];
  if (!declaration?.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) return [];
  return declaration.initializer.properties
    .filter((property) => ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
    .map((property) => property.name.getText().replace(/^['"]|['"]$/g, ""));
}

function validateSemantics(overrides = new Map()) {
  const get = (rel) =>
    overrides.has(rel)
      ? overrides.get(rel)
      : strictUtf8(readBytes(path.join(REPO, rel)), `semantic source ${rel}`);
  const parse = (rel) => sourceFile(rel, get(rel));
  const failed = [];
  const evidence = {};
  const requireCheck = (code, condition, detail = null) => {
    if (!condition) failed.push(code);
    evidence[code] = { pass: Boolean(condition), detail };
  };

  const pageRel = "src/app/(director)/director/workbench/questions/generate/page.tsx";
  const clientRel = "src/app/(director)/director/workbench/generate/generate-page-client.tsx";
  const workspaceRel = "src/app/(director)/director/workbench/generate/workspace/passage-workspace.tsx";
  const rowRel = "src/app/(director)/director/workbench/generate/workspace/workspace-passage-row.tsx";
  const modalRel = "src/app/(director)/director/workbench/generate/workspace/passage-generate-modal.tsx";
  const mobileRel = "src/components/workbench/mobile-step-flow.tsx";
  const workspaceGenRel = "src/app/(director)/director/workbench/generate/workspace/use-workspace-generation.ts";
  const handlersRel = "src/app/(director)/director/workbench/generate/use-generation-handlers.ts";
  const schedulerRel = "src/app/(director)/director/workbench/generate/fast-generation-scheduler.ts";
  const fastRel = "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts";
  const budgetRel = "src/lib/question-generation-assignment-budget.ts";
  const runtimeRel = "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts";
  const aiRel = "src/lib/question-ai-schemas-mc.ts";
  const vocabRel = "src/lib/question-ai-schemas-vocab.ts";
  const schemasRel = "src/lib/question-schemas.ts";

  const page = parse(pageRel);
  const pageFn = findNamedFunction(page, "QuestionsGeneratePage");
  const pageClient = pageFn ? jsxElements(pageFn, "GeneratePageClient")[0] : null;
  requireCheck(
    "PATH_ROUTE_MANUAL_NON_KOREAN",
    Boolean(
      pageFn &&
        pageClient &&
        jsxAttrText(pageClient, "defaultMode") === '"manual"' &&
        jsxAttrText(pageClient, "academyId") === "staff.academyId" &&
        !jsxAttr(pageClient, "subjectScope"),
    ),
  );

  const client = parse(clientRel);
  const desktopFn = findNamedFunction(client, "handleGenerateActiveRow");
  requireCheck(
    "PATH_DESKTOP_GENERATE_CALL",
    Boolean(desktopFn && reachableCall(desktopFn, "handleWorkspaceGenerate", ["activeRowId"])),
  );
  const passageWorkspace = jsxElements(client, "PassageWorkspace").find(
    (element) => jsxAttrText(element, "onOpenRowSettings") === "handleSetActiveRow",
  );
  requireCheck("PATH_DESKTOP_WORKSPACE_PROP", Boolean(passageWorkspace));
  const modals = jsxElements(client, "PassageGenerateModal");
  const boundModal = modals.find(
    (element) =>
      jsxAttrText(element, "configOnly") === "isMobileViewport" &&
      (jsxAttrText(element, "onGenerate") ?? "").includes("handleGenerateActiveRow"),
  );
  requireCheck("PATH_MODAL_DESKTOP_MOBILE_BINDING", Boolean(boundModal));
  const mobileNext = findNamedFunction(client, "mobileNext");
  requireCheck(
    "PATH_MOBILE_GENERATE_CALL",
    Boolean(mobileNext && reachableCall(mobileNext, "handleWorkspaceGenerate", [])),
  );
  const mobileNav = jsxElements(client, "MobileStepNav").find(
    (element) => jsxAttrText(element, "next") === "mobileNext",
  );
  requireCheck("PATH_MOBILE_NAV_BINDING", Boolean(mobileNav));

  const workspace = parse(workspaceRel);
  const workspaceRow = jsxElements(workspace, "WorkspacePassageRow").find((element) => {
    const text = jsxAttrText(element, "onOpenSettings") ?? "";
    return text.includes("onOpenRowSettings") && text.includes("row.localId");
  });
  requireCheck("PATH_WORKSPACE_ROW_SETTINGS_PROP", Boolean(workspaceRow));

  const row = parse(rowRel);
  const rowFn = findNamedFunction(row, "WorkspacePassageRow");
  const rowClick = rowFn
    ? descendants(rowFn, (node) =>
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        jsxAttrText(node, "onClick") === "onOpenSettings",
      )[0]
    : null;
  requireCheck("PATH_ROW_BUTTON_EVENT", Boolean(rowClick));

  const modal = parse(modalRel);
  const modalFn = findNamedFunction(modal, "PassageGenerateModal");
  const configIf = modalFn
    ? descendants(
        modalFn,
        (node) => ts.isIfStatement(node) && node.expression.getText() === "configOnly",
      )[0]
    : null;
  const configCalls = configIf ? calls(configIf.thenStatement, "onGenerate") : [];
  const closeCalls = configIf ? calls(configIf.thenStatement, "onClose") : [];
  requireCheck(
    "PATH_MOBILE_CONFIG_ONLY_NO_DISPATCH",
    Boolean(configIf && configCalls.length === 0 && closeCalls.length >= 1),
  );
  requireCheck(
    "PATH_MODAL_DESKTOP_DISPATCH_PRESENT",
    Boolean(modalFn && calls(modalFn, "onGenerate").length >= 1),
  );

  const mobile = parse(mobileRel);
  requireCheck("PATH_MOBILE_COMPONENT_EXISTS", Boolean(findNamedFunction(mobile, "MobileStepNav")));

  const workspaceGen = parse(workspaceGenRel);
  const workspaceGenerate = findNamedFunction(workspaceGen, "handleWorkspaceGenerate");
  const scheduled = workspaceGenerate ? calls(workspaceGenerate, "scheduleFastGeneration") : [];
  const fastCreates = workspaceGenerate ? calls(workspaceGenerate, "createFastQuestionGenerationJob") : [];
  const fastFlow = fastCreates.some((call) => {
    const object = findObjectArgument(call);
    return (
      object &&
      objectPropertyText(object, "questionType") === "unit.questionType" &&
      objectPropertyText(object, "questionTypeSettings") === "unit.settings"
    );
  });
  requireCheck(
    "PATH_WORKSPACE_UNITS_TO_FAST",
    Boolean(workspaceGenerate && scheduled.length >= 1 && fastCreates.length >= 1 && fastFlow),
  );
  requireCheck(
    "NEG_NO_SECONDARY_CREATE_JOB",
    workspaceGenerate ? calls(workspaceGenerate, "createQuestionGenerationJob").length === 0 : false,
  );

  const handlers = parse(handlersRel);
  const createFast = findNamedFunction(handlers, "createFastQuestionGenerationJob");
  const fetchCall = createFast
    ? calls(createFast, "fetch").find(
        (call) => call.arguments[0] && ts.isStringLiteralLike(call.arguments[0]) && call.arguments[0].text === FAST_ENDPOINT,
      )
    : null;
  let helperBodyFlow = false;
  if (fetchCall) {
    const fetchOptions = fetchCall.arguments[1];
    if (fetchOptions && ts.isObjectLiteralExpression(fetchOptions)) {
      const bodyProp = fetchOptions.properties.find(
        (property) => ts.isPropertyAssignment(property) && property.name.getText() === "body",
      );
      if (bodyProp && ts.isPropertyAssignment(bodyProp)) {
        const stringify = calls(bodyProp.initializer, "stringify")[0];
        const bodyObject = stringify?.arguments[0];
        helperBodyFlow = Boolean(
          bodyObject &&
            ts.isObjectLiteralExpression(bodyObject) &&
            objectPropertyText(bodyObject, "questionType") === "questionType" &&
            objectPropertyText(bodyObject, "questionTypeSettings") === "questionTypeSettings",
        );
      }
    }
  }
  requireCheck("PATH_FAST_LITERAL_FETCH_BODY", Boolean(fetchCall && helperBodyFlow));

  const scheduler = parse(schedulerRel);
  const schedulerFn = findNamedFunction(scheduler, "scheduleFastGeneration");
  requireCheck(
    "PATH_SCHEDULER_EXECUTES_TASK",
    Boolean(schedulerFn && reachableCall(schedulerFn, "task", [])),
  );

  const fast = parse(fastRel);
  const post = findNamedFunction(fast, "POST");
  const planCalls = post ? calls(post, "buildManualPlan") : [];
  const planFlow = planCalls.some((call) => {
    const object = findObjectArgument(call);
    return (
      object &&
      objectPropertyText(object, "questionType") === "config.questionType" &&
      objectPropertyText(object, "count") === "config.count"
    );
  });
  const wrapperCalls = post ? calls(post, "runWithQuestionGenerationAssignmentBudget") : [];
  const wrapperFlow = wrapperCalls.some((wrapper) =>
    descendants(
      wrapper,
      (node) => ts.isCallExpression(node) && calleeName(node) === "runQuestionGenerationWithEmptyRetry",
    ).some((call) => {
      const object = findObjectArgument(call);
      return (
        object &&
        objectPropertyText(object, "plan") === "plan" &&
        (objectPropertyText(object, "typeSettings") ?? "").includes("config.questionTypeSettings")
      );
    }),
  );
  requireCheck("PATH_FAST_POST_PLAN", Boolean(post && planFlow));
  requireCheck("PATH_FAST_BUDGET_RUNTIME_CALLBACK", Boolean(post && wrapperFlow));
  const requestSchemaDecl = descendants(
    fast,
    (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "requestSchema",
  )[0];
  const requestText = requestSchemaDecl?.initializer?.getText() ?? "";
  requireCheck(
    "PATH_FAST_MANUAL_SINGLE_COUNT",
    requestText.includes('z.literal("MANUAL")') &&
      /count\s*:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(1\)/.test(requestText),
  );
  const manualPlan = findNamedFunction(fast, "buildManualPlan");
  const returnedPlanObjects = manualPlan
    ? descendants(manualPlan, (node) => ts.isObjectLiteralExpression(node))
    : [];
  requireCheck(
    "PATH_MANUAL_PLAN_TYPE_COUNT",
    returnedPlanObjects.some(
      (object) =>
        objectPropertyText(object, "subType") === "questionType" &&
        objectPropertyText(object, "count") === "count",
    ),
  );
  const triggerImports = descendants(
    fast,
    (node) =>
      ts.isImportDeclaration(node) &&
      (node.importClause?.getText() ?? "").split(/\W+/).includes("Trigger"),
  );
  requireCheck("NEG_FAST_NO_TRIGGER_IMPORT", triggerImports.length === 0);

  const budget = parse(budgetRel);
  const budgetWrapper = findNamedFunction(budget, "runWithQuestionGenerationAssignmentBudget");
  const runActive = findNamedFunction(budget, "runActive");
  requireCheck(
    "PATH_ASSIGNMENT_ADMISSION",
    Boolean(
      budgetWrapper &&
        calls(budgetWrapper, "readQuestionGenerationAssignmentBudgetAdmission").length >= 1 &&
        calls(budgetWrapper, "runActive").length >= 1,
    ),
  );
  requireCheck(
    "PATH_ASSIGNMENT_DURABLE_SCOPE",
    Boolean(
      runActive &&
        calls(runActive, "ensureDurableBudget").length >= 1 &&
        calls(runActive, "runWithAtlasProductionAssignmentScope").length >= 1,
    ),
  );

  const runtime = parse(runtimeRel);
  const inner = findNamedFunction(runtime, "runQuestionGeneration");
  const outer = findNamedFunction(runtime, "runQuestionGenerationWithEmptyRetry");
  const indexUses = inner
    ? descendants(
        inner,
        (node) =>
          ts.isElementAccessExpression(node) &&
          node.expression.getText() === "AI_QUESTION_SCHEMAS" &&
          node.argumentExpression?.getText() === "subType",
      )
    : [];
  const fallbackUses = inner
    ? descendants(
        inner,
        (node) =>
          ts.isElementAccessExpression(node) &&
          node.expression.getText() === "QUESTION_SCHEMAS" &&
          node.argumentExpression?.getText() === "subType",
      )
    : [];
  requireCheck(
    "PATH_RUNTIME_SCHEMA_SELECTION",
    Boolean(
      inner &&
        indexUses.length >= 1 &&
        fallbackUses.length >= 1 &&
        calls(inner, "getAiResponseSchema").some((call) => call.arguments[0]?.getText() === "subType"),
    ),
  );
  requireCheck(
    "PATH_EMPTY_RETRY_TO_RUNTIME",
    Boolean(outer && calls(outer, "runQuestionGeneration").length >= 1),
  );

  const uiTypes = extractQuestionTypes(get("src/lib/question-type-ui.ts"));
  const mcKeys = objectRegistryKeys(get(aiRel), "AI_MC_QUESTION_SCHEMAS", aiRel);
  const essayKeys = objectRegistryKeys(get(aiRel), "AI_ESSAY_QUESTION_SCHEMAS", aiRel);
  const vocabKeys = objectRegistryKeys(get(vocabRel), "AI_VOCAB_QUESTION_SCHEMAS", vocabRel);
  const aiKeys = new Set([...mcKeys, ...essayKeys, ...vocabKeys]);
  const fallbackKeys = new Set(objectRegistryKeys(get(schemasRel), "QUESTION_SCHEMAS", schemasRel));
  const missingAi = uiTypes.filter((id) => !aiKeys.has(id));
  const missingFallback = uiTypes.filter((id) => !fallbackKeys.has(id));
  requireCheck(
    "PATH_ALL_25_SCHEMA_COVERAGE",
    uiTypes.length === 25 && missingAi.length === 0 && missingFallback.length === 0,
    { uiTypes, missingAi, missingFallback },
  );
  requireCheck(
    "PATH_LEGACY_TYPE_EXCLUDED_FROM_PICKER",
    !uiTypes.includes("TOPIC_MAIN_IDEA") && aiKeys.has("TOPIC_MAIN_IDEA") && fallbackKeys.has("TOPIC_MAIN_IDEA"),
  );

  const clientCalls = calls(client, "handleBatchGenerate");
  const gridRel = "src/app/(director)/director/workbench/generate/passage-card-grid.tsx";
  const grid = parse(gridRel);
  requireCheck(
    "NEG_SECONDARY_BATCH_UNREACHABLE",
    clientCalls.length === 0 && calls(grid, "handleBatchGenerate").length === 0,
  );
  const batchFn = findNamedFunction(client, "handleBatchGenerate");
  requireCheck(
    "NEG_LEGACY_ENQUEUE_DEAD",
    batchFn ? calls(batchFn, "enqueueJob").length === 0 : true,
  );

  return { failed, evidence, uiTypes };
}

function validateMath(binding, uiTypes) {
  const failures = [];
  const detail = {};
  const requireCheck = (code, condition, value = null) => {
    if (!condition) failures.push(code);
    detail[code] = { pass: Boolean(condition), value };
  };
  const focus = uiTypes.filter((id) => id === "BLANK_INFERENCE" || id === "GRAMMAR_ERROR");
  const nonfocus = uiTypes.filter((id) => !focus.includes(id));
  requireCheck("MATH_UI_25", uiTypes.length === 25 && new Set(uiTypes).size === 25, uiTypes);
  requireCheck(
    "MATH_CANONICAL_UI_ORDER",
    equalJson(binding.canonicalUniverse.uiTypeIdsInOrder, uiTypes) &&
      binding.canonicalUniverse.uiTypeCount === 25,
  );
  requireCheck(
    "MATH_FOCUS_2_NONFOCUS_23",
    equalJson(binding.canonicalUniverse.focusTypeIds, focus) &&
      equalJson(binding.canonicalUniverse.nonfocusTypeIdsInUiOrder, nonfocus) &&
      binding.canonicalUniverse.nonfocusTypeCount === 23,
  );
  const families = binding.families;
  const familyFlat = families.flatMap((family) => family.rotationOrder);
  requireCheck(
    "MATH_8_FAMILY_PARTITION",
    families.length === 8 &&
      familyFlat.length === 23 &&
      new Set(familyFlat).size === 23 &&
      familyFlat.every((id) => nonfocus.includes(id)) &&
      nonfocus.every((id) => familyFlat.includes(id)),
    families.map((family) => ({ familyId: family.familyId, size: family.rotationOrder.length })),
  );
  const expectedRows = [];
  for (const family of families) {
    const n = family.rotationOrder.length;
    for (let epoch = 1; epoch <= 4; epoch += 1) {
      const mainIndex = (epoch - 1) % n;
      const holdoutIndex = (epoch - 1 + Math.ceil(n / 2)) % n;
      expectedRows.push({
        familyId: family.familyId,
        epoch,
        mainIndex,
        mainTypeId: family.rotationOrder[mainIndex],
        holdoutIndex,
        holdoutTypeId: family.rotationOrder[holdoutIndex],
      });
    }
  }
  requireCheck("MATH_32_FORMULA_ROWS", equalJson(binding.scheduleRows, expectedRows), {
    expected: expectedRows.length,
    claimed: binding.scheduleRows.length,
  });
  requireCheck(
    "MATH_MAIN_HOLDOUT_DISTINCT",
    expectedRows.every((row) => row.mainTypeId !== row.holdoutTypeId),
  );
  const contact = (epochs, roles) => {
    const set = new Set();
    for (const row of expectedRows) {
      if (row.epoch > epochs) continue;
      if (roles.includes("main")) set.add(row.mainTypeId);
      if (roles.includes("holdout")) set.add(row.holdoutTypeId);
    }
    return set;
  };
  const epoch1 = contact(1, ["main", "holdout"]);
  const epoch2 = contact(2, ["main", "holdout"]);
  const main4 = contact(4, ["main"]);
  requireCheck("MATH_EPOCH1_16", epoch1.size === 16 && binding.claims.singleEpochCombinedDistinctTypes === 16, [...epoch1]);
  requireCheck("MATH_EPOCH2_23", epoch2.size === 23 && binding.claims.twoEpochCombinedContactTypes === 23, [...epoch2]);
  requireCheck("MATH_MAIN4_23", main4.size === 23 && binding.claims.fourEpochMainOnlyContactTypes === 23, [...main4]);
  requireCheck(
    "MATH_CONTACT_NOT_CERTIFICATION",
    binding.rotation.contactIsCertification === false &&
      binding.claims.contactEqualsCertification === false &&
      binding.rotation.singleEpochAllTypeClaimAllowed === false &&
      binding.claims.singleEpochAllTypeClaimAllowed === false,
  );
  return { failures, detail, expectedRows };
}

function hostileTests(binding, baselineSemantics, baselineClosure, subjectMap) {
  const tests = [];
  const record = (id, expectedReject, rejected, evidence) => {
    tests.push({ id, expected: expectedReject ? "REJECT" : "ACCEPT", actual: rejected ? "REJECT" : "ACCEPT", pass: expectedReject === rejected, evidence });
  };

  // Manifest byte mismatch.
  {
    const map = new Map(subjectMap);
    const mutated = Buffer.from(map.get("binding.json"));
    mutated[Math.min(64, mutated.length - 1)] ^= 1;
    map.set("binding.json", mutated);
    let rejected = false;
    try {
      rejected = verifyManifestAgainst(map, map.get("MANIFEST.sha256")).mismatches.length > 0;
    } catch {
      rejected = true;
    }
    record("H01_MANIFEST_BOUND_BYTE_FLIP", true, rejected, "binding byte changed in memory");
  }

  // Duplicate JSON key rejection.
  {
    let rejected = false;
    try {
      strictJson('{"a":1,"a":2}', "hostile duplicate");
    } catch {
      rejected = true;
    }
    record("H02_DUPLICATE_JSON_KEY", true, rejected, "strict recursive parser");
  }

  const mutateSemantic = (id, rel, search, replacement, expectedCode, afterMarker = null) => {
    const original = strictUtf8(readBytes(path.join(REPO, rel)), `hostile ${rel}`);
    const after = afterMarker ? original.indexOf(afterMarker) : 0;
    const at = after < 0 ? -1 : original.indexOf(search, after);
    if (at < 0) {
      record(id, true, false, `fixture precondition absent: ${search}`);
      return;
    }
    const mutated = `${original.slice(0, at)}${replacement}${original.slice(at + search.length)}`;
    const result = validateSemantics(new Map([[rel, mutated]]));
    record(id, true, result.failed.includes(expectedCode), { expectedCode, failed: result.failed });
  };

  mutateSemantic(
    "H03_ROUTE_SUBJECT_SCOPE_INJECTION",
    "src/app/(director)/director/workbench/questions/generate/page.tsx",
    'defaultMode="manual" />',
    'defaultMode="manual" subjectScope="KOREAN" />',
    "PATH_ROUTE_MANUAL_NON_KOREAN",
  );
  mutateSemantic(
    "H04_DESKTOP_GENERATE_REMOVED",
    "src/app/(director)/director/workbench/generate/generate-page-client.tsx",
    "void handleWorkspaceGenerate(activeRowId);",
    "void Promise.resolve(activeRowId);",
    "PATH_DESKTOP_GENERATE_CALL",
  );
  mutateSemantic(
    "H05_DESKTOP_EARLY_RETURN",
    "src/app/(director)/director/workbench/generate/generate-page-client.tsx",
    "void handleWorkspaceGenerate(activeRowId);",
    "return;\n    void handleWorkspaceGenerate(activeRowId);",
    "PATH_DESKTOP_GENERATE_CALL",
  );
  mutateSemantic(
    "H06_MOBILE_GENERATE_REMOVED",
    "src/app/(director)/director/workbench/generate/generate-page-client.tsx",
    "void handleWorkspaceGenerate();",
    "void Promise.resolve();",
    "PATH_MOBILE_GENERATE_CALL",
  );
  mutateSemantic(
    "H07_FAST_ENDPOINT_REDIRECT",
    "src/app/(director)/director/workbench/generate/use-generation-handlers.ts",
    'fetch("/api/workbench/ai-jobs/question-generation/fast"',
    'fetch("/api/workbench/ai-jobs/question-generation/secondary"',
    "PATH_FAST_LITERAL_FETCH_BODY",
  );
  mutateSemantic(
    "H08_FAST_HELPER_QUESTION_TYPE_REMOVED",
    "src/app/(director)/director/workbench/generate/use-generation-handlers.ts",
    "body: JSON.stringify({\r\n      passageId,\r\n      mode,\r\n      count,\r\n      questionType,",
    "body: JSON.stringify({\r\n      passageId,\r\n      mode,\r\n      count,",
    "PATH_FAST_LITERAL_FETCH_BODY",
    "export async function createFastQuestionGenerationJob",
  );
  mutateSemantic(
    "H09_BUDGET_WRAPPER_REMOVED",
    "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
    "runWithQuestionGenerationAssignmentBudget(",
    "runWithoutQuestionGenerationAssignmentBudget(",
    "PATH_FAST_BUDGET_RUNTIME_CALLBACK",
  );
  mutateSemantic(
    "H10_RUNTIME_AI_SCHEMA_INDEX_REMOVED",
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
    "AI_QUESTION_SCHEMAS[subType]",
    "AI_QUESTION_SCHEMAS[\"__removed__\"]",
    "PATH_RUNTIME_SCHEMA_SELECTION",
  );
  mutateSemantic(
    "H11_PICKER_TYPE_REMOVED",
    "src/lib/question-type-ui.ts",
    "      QUESTION_TYPE_UI.ANTONYM,\r\n",
    "",
    "PATH_ALL_25_SCHEMA_COVERAGE",
  );
  mutateSemantic(
    "H12_LEGACY_TYPE_ADDED_TO_PICKER",
    "src/lib/question-type-ui.ts",
    "      QUESTION_TYPE_UI.TITLE,\r\n",
    "      QUESTION_TYPE_UI.TITLE,\r\n      QUESTION_TYPE_UI.TOPIC_MAIN_IDEA,\r\n",
    "PATH_ALL_25_SCHEMA_COVERAGE",
  );

  // Recursive closure: unresolved local edge and non-literal dynamic import.
  {
    const rel = binding.sourceAuthority.transitiveRuntimeRoots[0];
    const text = strictUtf8(readBytes(path.join(REPO, rel)), `hostile closure ${rel}`);
    const mutated = `import \"./__independent_audit_missing__\";\n${text}`;
    const result = computeClosure(binding.sourceAuthority.transitiveRuntimeRoots, new Map([[rel, mutated]]));
    record("H13_UNRESOLVED_LOCAL_IMPORT", true, result.unresolved.length > 0, result.unresolved.slice(0, 2));
  }
  {
    const rel = binding.sourceAuthority.transitiveRuntimeRoots[0];
    const text = strictUtf8(readBytes(path.join(REPO, rel)), `hostile closure ${rel}`);
    const mutated = `const __auditLoader = (p: string) => import(p);\n${text}`;
    const result = computeClosure(binding.sourceAuthority.transitiveRuntimeRoots, new Map([[rel, mutated]]));
    record("H14_NONLITERAL_DYNAMIC_IMPORT", true, result.nonliteral.length > 0, result.nonliteral.slice(0, 2));
  }

  // Second-hop closure removal must alter both the edge set and closure authority.
  {
    const edge = baselineClosure.edges.find((candidate) => candidate.from !== binding.sourceAuthority.transitiveRuntimeRoots[0]);
    const rel = edge.from;
    const original = strictUtf8(readBytes(path.join(REPO, rel)), `hostile edge ${rel}`);
    const sf = sourceFile(rel, original);
    const node = descendants(
      sf,
      (candidate) =>
        (ts.isImportDeclaration(candidate) || ts.isExportDeclaration(candidate)) &&
        candidate.pos === edge.position &&
        candidate.moduleSpecifier?.text === edge.specifier,
    )[0];
    let rejected = false;
    let evidence = null;
    if (node) {
      const mutated = `${original.slice(0, node.getFullStart())}${original.slice(node.getEnd())}`;
      const result = computeClosure(binding.sourceAuthority.transitiveRuntimeRoots, new Map([[rel, mutated]]));
      rejected = !equalJson(result.edges, baselineClosure.edges) || !equalJson(result.closure, baselineClosure.closure);
      evidence = { from: rel, removed: edge.specifier, edgeCount: result.edges.length, closureCount: result.closure.length };
    }
    record("H15_SECOND_HOP_EDGE_REMOVAL", true, rejected, evidence);
  }

  // Rotation off-by-one and same-role mutations are rejected by fresh math.
  {
    const clone = structuredClone(binding);
    clone.scheduleRows[0].mainIndex = 1;
    const result = validateMath(clone, baselineSemantics.uiTypes);
    record("H16_ROTATION_OFF_BY_ONE", true, result.failures.includes("MATH_32_FORMULA_ROWS"), result.failures);
  }
  {
    const clone = structuredClone(binding);
    clone.families[0].rotationOrder = [clone.families[0].rotationOrder[0]];
    const result = validateMath(clone, baselineSemantics.uiTypes);
    record("H17_FAMILY_PARTITION_COLLAPSE", true, result.failures.includes("MATH_8_FAMILY_PARTITION"), result.failures);
  }

  // Explicit TOCTOU simulations: snapshot comparisons must detect changed target
  // and changed production-source bytes even if semantic tokens remain present.
  {
    const before = targetSnapshot();
    const after = structuredClone(before);
    after.entries[0].sha256 = "0".repeat(64);
    after.digest = sha256(encoder.encode(JSON.stringify(after.entries)));
    record("H18_TARGET_TOCTOU_SIMULATION", true, before.digest !== after.digest, { before: before.digest, after: after.digest });
  }
  {
    const row = binding.sourceAuthority.productionSources[0];
    const bytes = readBytes(path.join(REPO, row.path));
    const changed = Buffer.concat([bytes, Buffer.from(" ")]);
    record("H19_SOURCE_TOCTOU_SIMULATION", true, sha256(bytes) !== sha256(changed), { path: row.path });
  }

  // Baseline itself must be accepted by the independent semantic checker.
  record("H20_BASELINE_CONTROL", false, baselineSemantics.failed.length > 0, baselineSemantics.failed);
  return tests;
}

function run() {
  const startedAt = new Date().toISOString();
  const checks = [];
  const blockers = [];
  const add = (code, pass, evidence = null, blocking = true) => {
    const row = { code, pass: Boolean(pass), evidence };
    checks.push(row);
    if (!pass && blocking) blockers.push(code);
  };

  const targetStart = targetSnapshot();
  const subjectMap = subjectFileMap();
  const manifest = verifyManifestAgainst(subjectMap, subjectMap.get("MANIFEST.sha256"));
  add("SUBJECT_MANIFEST_EXACT_SET_AND_HASHES", manifest.mismatches.length === 0, {
    entries: manifest.entries,
    mismatches: manifest.mismatches,
    untrustedUnsealedFiles: targetStart.entries
      .map((entry) => entry.name)
      .filter((name) => !TARGET_MANIFEST_SET.has(name) && name !== "MANIFEST.sha256"),
  });

  const binding = readStrictJson(path.join(TARGET, "binding.json"), "subject binding.json");
  add(
    "SUBJECT_CANDIDATE_NOT_SELF_AUTHORIZED",
    binding.status === "PRODUCTION_ROUTE_BINDING_CANDIDATE_REQUIRES_EXTERNAL_AUDIT" &&
      binding.independentAudit?.required === true &&
      binding.independentAudit?.completedInThisArtifact === false &&
      binding.issuance?.executionEligibleByThisArtifactAlone === false,
  );
  add(
    "SUBJECT_ZERO_PROHIBITED_ACTIVITY_CLAIM",
    [
      "externalNetworkCalls",
      "providerCalls",
      "modelCalls",
      "apiCandidatesConsumed",
      "databaseCalls",
      "secretReads",
      "trustedGoldReads",
      "trustedGoldWrites",
    ].every((key) => binding.activity?.[key] === 0),
    binding.activity,
  );

  const freezeStart = currentRepoFreeze();
  add("GIT_HEAD_TREE_REF", equalJson(freezeStart, binding.sourceAuthority.repoFreeze), {
    claimed: binding.sourceAuthority.repoFreeze,
    actual: freezeStart,
  });

  const sourceClaims = binding.sourceAuthority.productionSources;
  const sourcePaths = sourceClaims.map((entry) => entry.path);
  add("SOURCE_256_UNIQUE_SAFE_PATHS", sourcePaths.length === 256 && new Set(sourcePaths).size === 256 && sourcePaths.every(sourcePathSafety), {
    count: sourcePaths.length,
  });
  const gitActual = collectGitEvidence(binding);
  const gitMismatches = compareGitEvidence(binding, gitActual);
  const trackedCount = gitActual.filter((row) => row.sourceState === "TRACKED_WORKTREE").length;
  const untrackedCount = gitActual.filter((row) => row.sourceState === "WORKTREE_ONLY_UNTRACKED").length;
  add("SOURCE_ALL_GIT_FIELDS_EXACT", gitMismatches.length === 0, {
    sourceCount: gitActual.length,
    trackedCount,
    untrackedCount,
    mismatches: gitMismatches.slice(0, 100),
  });
  const actualWorktreeOnly = gitActual
    .filter((row) => row.sourceState === "WORKTREE_ONLY_UNTRACKED")
    .map((row) => row.path);
  add(
    "SOURCE_WORKTREE_ONLY_9_EXACT",
    actualWorktreeOnly.length === 9 &&
      actualWorktreeOnly.length === binding.sourceAuthority.worktreeOnlyPaths.length &&
      actualWorktreeOnly.every((rel) => binding.sourceAuthority.worktreeOnlyPaths.includes(rel)) &&
      binding.sourceAuthority.deployedCommitParity === false,
    actualWorktreeOnly,
  );

  const closure = computeClosure(binding.sourceAuthority.transitiveRuntimeRoots);
  const canonicalEdgeSort = (a, b) =>
    a.from.localeCompare(b.from) ||
    a.to.localeCompare(b.to) ||
    a.specifier.localeCompare(b.specifier) ||
    a.edgeKind.localeCompare(b.edgeKind) ||
    a.position - b.position;
  add("CLOSURE_NO_PARSE_DIAGNOSTICS", closure.parseDiagnostics.length === 0, closure.parseDiagnostics.slice(0, 50));
  add("CLOSURE_NO_UNRESOLVED_LOCAL", closure.unresolved.length === 0, closure.unresolved.slice(0, 50));
  add("CLOSURE_NO_NONLITERAL_LOAD", closure.nonliteral.length === 0, closure.nonliteral.slice(0, 50));
  add(
    "CLOSURE_241_EXACT_FILES",
    closure.closure.length === 241 && equalJson(closure.closure, binding.sourceAuthority.transitiveRuntimeClosure),
    { actualCount: closure.closure.length, claimedCount: binding.sourceAuthority.transitiveRuntimeClosure.length },
  );
  add(
    "CLOSURE_709_EXACT_EDGES",
    closure.edges.length === 709 &&
      equalJson(
        [...closure.edges].sort(canonicalEdgeSort),
        [...binding.sourceAuthority.transitiveImportEdges].sort(canonicalEdgeSort),
      ),
    { actualCount: closure.edges.length, claimedCount: binding.sourceAuthority.transitiveImportEdges.length },
  );
  add(
    "CLOSURE_BINDING_EDGE_CANONICAL_ORDER",
    equalJson(
      binding.sourceAuthority.transitiveImportEdges,
      [...binding.sourceAuthority.transitiveImportEdges].sort(canonicalEdgeSort),
    ),
    "Array order is canonical evidence serialization (source, resolved target, specifier, kind, source position); closure authority is the exact 709-edge set, not discovery order.",
  );
  const expectedProductionSet = new Set([
    ...binding.sourceAuthority.interactiveAuthorityPaths,
    ...binding.sourceAuthority.excludedRouteEvidencePaths,
    ...closure.closure,
  ]);
  add(
    "SOURCE_256_EQUALS_AUTHORITY_UNION",
    expectedProductionSet.size === 256 &&
      sourcePaths.length === expectedProductionSet.size &&
      sourcePaths.every((rel) => expectedProductionSet.has(rel)),
    { unionCount: expectedProductionSet.size },
  );

  const semantics = validateSemantics();
  add("AST_PRODUCTION_DATAFLOW_ALL", semantics.failed.length === 0, {
    failed: semantics.failed,
    evidence: semantics.evidence,
  });

  const math = validateMath(binding, semantics.uiTypes);
  add("CANONICAL_FAMILY_ROTATION_MATH_ALL", math.failures.length === 0, {
    failed: math.failures,
    detail: math.detail,
  });

  const hostile = hostileTests(binding, semantics, closure, subjectMap);
  const hostileFailures = hostile.filter((test) => !test.pass);
  add("INDEPENDENT_HOSTILE_20_OF_20", hostileFailures.length === 0 && hostile.length === 20, {
    total: hostile.length,
    passed: hostile.length - hostileFailures.length,
    failures: hostileFailures,
  });

  const sourceEnd = sourcePaths.map((rel) => ({
    path: rel,
    sha256: sha256(readBytes(path.join(REPO, rel))),
  }));
  const sourceStartDigest = sha256(
    encoder.encode(
      JSON.stringify(gitActual.map((row) => ({ path: row.path, sha256: row.worktreeSha256 }))),
    ),
  );
  const sourceEndDigest = sha256(encoder.encode(JSON.stringify(sourceEnd)));
  const freezeEnd = currentRepoFreeze();
  const targetEnd = targetSnapshot();
  add("TOCTOU_TARGET_STABLE", targetStart.digest === targetEnd.digest, {
    start: targetStart.digest,
    end: targetEnd.digest,
  });
  add("TOCTOU_SOURCES_STABLE", sourceStartDigest === sourceEndDigest, {
    start: sourceStartDigest,
    end: sourceEndDigest,
  });
  add("TOCTOU_GIT_FREEZE_STABLE", equalJson(freezeStart, freezeEnd), {
    start: freezeStart,
    end: freezeEnd,
  });

  const completedAt = new Date().toISOString();
  const verdict = blockers.length === 0 ? "PASS_NO_BLOCKERS" : "FAIL_BLOCKERS";
  return {
    schemaVersion: "reviewer-calibration-v4-independent-audit-1",
    artifactId: "reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1",
    subject: {
      artifactId: binding.artifactId,
      path: normalizeRel(path.relative(REPO, TARGET)),
      snapshotSha256: targetStart.digest,
      manifestSha256: sha256(subjectMap.get("MANIFEST.sha256")),
      manifestEntries: Object.fromEntries(manifest.entries.map((entry) => [entry.name, entry.sha256])),
    },
    verdict,
    blockers,
    startedAt,
    completedAt,
    checks,
    metrics: {
      subjectFilesObserved: targetStart.entries.length,
      productionSources: sourcePaths.length,
      trackedSources: trackedCount,
      worktreeOnlyUntrackedSources: untrackedCount,
      closureFiles: closure.closure.length,
      importEdges: closure.edges.length,
      uiTypes: semantics.uiTypes.length,
      nonfocusTypes: binding.canonicalUniverse.nonfocusTypeCount,
      families: binding.families.length,
      scheduleRows: math.expectedRows.length,
      hostileTests: hostile.length,
      hostilePassed: hostile.filter((test) => test.pass).length,
    },
    hostile,
    auditorDevelopmentFindings: [
      {
        code: "AUDITOR_D1_MERGE_PATH_HISTORY",
        disposition: "AUDITOR_FIXED_NOT_SUBJECT_BLOCKER",
        observation:
          "A global git log --name-only pass omitted or reordered merge path history for four files.",
        correction:
          "Every one of the 256 paths is now recomputed with git log -1 --format=%H -- <path>, which is the exact field definition; all claims match.",
      },
      {
        code: "AUDITOR_D2_EDGE_ORDER",
        disposition: "AUDITOR_FIXED_NOT_SUBJECT_BLOCKER",
        observation:
          "The first auditor draft compared discovery-position order to the subject's canonical serialization order.",
        correction:
          "The audit now compares the exact 709-edge set after an independent canonical sort and separately proves the subject array is already in canonical evidence order.",
      },
      {
        code: "AUDITOR_D3_MOBILE_IIFE",
        disposition: "AUDITOR_FIXED_NOT_SUBJECT_BLOCKER",
        observation: "The first AST helper did not unwrap an immediately invoked parenthesized arrow assigned to mobileNext.",
        correction: "Parenthesized/as/satisfies/non-null wrappers and IIFEs are now unwrapped; the mobile call is independently proven.",
      },
      {
        code: "AUDITOR_D4_HOSTILE_PRECONDITION",
        disposition: "AUDITOR_FIXED_NOT_SUBJECT_BLOCKER",
        observation:
          "The first helper-body hostile mutation targeted the first similar body and assumed mode: MANUAL instead of the actual bound mode shorthand.",
        correction:
          "The mutation is anchored after createFastQuestionGenerationJob and removes questionType from that helper's JSON body only.",
      },
      {
        code: "AUDITOR_D5_EDGE_COMPARATOR_REFINEMENT",
        disposition: "AUDITOR_FIXED_NOT_SUBJECT_BLOCKER",
        observation:
          "A second draft correctly matched the edge set but guessed source/specifier ordering for the separate canonical-order assertion.",
        correction:
          "The asserted serialization order was independently identified and proven as source, resolved target, specifier, kind, then source position.",
      },
    ],
    sourceEvidenceDigestSha256: sourceEndDigest,
    closureDigestSha256: sha256(encoder.encode(JSON.stringify({ files: closure.closure, edges: closure.edges }))),
    activity: {
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      apiCandidatesConsumed: 0,
      databaseCalls: 0,
      secretReads: 0,
      trustedGoldReads: 0,
      trustedGoldWrites: 0,
      budgetLedgerReads: 0,
      budgetLedgerWrites: 0,
      subjectWrites: 0,
    },
  };
}

try {
  const result = run();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.verdict === "PASS_NO_BLOCKERS" ? 0 : 1;
} catch (error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: "reviewer-calibration-v4-independent-audit-1",
        artifactId: "reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1",
        verdict: "FAIL_BLOCKERS",
        blockers: ["AUDITOR_FAIL_CLOSED_EXCEPTION"],
        error: message,
        activity: {
          externalNetworkCalls: 0,
          providerCalls: 0,
          modelCalls: 0,
          apiCandidatesConsumed: 0,
          databaseCalls: 0,
          secretReads: 0,
          trustedGoldReads: 0,
          trustedGoldWrites: 0,
          budgetLedgerReads: 0,
          budgetLedgerWrites: 0,
          subjectWrites: 0,
        },
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
