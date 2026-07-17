import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ts from "typescript";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: any };

const reviewRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(reviewRoot, "../../../..");
const targetRelative = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4";
const targetRoot = path.join(repoRoot, targetRelative);
const v2Relative = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2";
const v3Relative = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3";
const v2Root = path.join(repoRoot, v2Relative);
const v3Root = path.join(repoRoot, v3Relative);

const COMPILER_ENTRYPOINT = `${targetRelative}/compile-exact-wire.mts`;
const LIVE_ENTRYPOINTS = [
  `${targetRelative}/capture-price-snapshot.mts`,
  `${targetRelative}/live-child.mts`,
  `${targetRelative}/operator-wrapper.mts`,
  `${targetRelative}/production-runner.ts`,
] as const;
const DECLARED_COMPILER_DATA = [
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/private/pilot-source.private.json",
  "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/protocol.json",
  `${v2Relative}/protocol-v2.json`,
] as const;
const LIVE_DATA = [
  { path: "experiments/question-quality-20260715/budget-ledger.json", kind: "mutable_runtime_data_precondition" },
  { path: `${targetRelative}/private/exact-wire-v4.private.json`, kind: "immutable_runtime_data" },
  { path: `${targetRelative}/protocol-v4.json`, kind: "immutable_runtime_data" },
] as const;

const slash = (value: string): string => value.replaceAll("\\", "/");
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

const stableJson = (value: any): string => JSON.stringify(stableValue(value));

function canonicalRepoFile(absoluteInput: string): string {
  const absolute = path.resolve(absoluteInput);
  const relative = path.relative(repoRoot, absolute);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `path escaped repository: ${absolute}`);
  assert(statSync(absolute).isFile(), `not a regular file: ${relative}`);
  const real = realpathSync.native(absolute);
  const normalize = (candidate: string): string => process.platform === "win32"
    ? path.resolve(candidate).toLowerCase()
    : path.resolve(candidate);
  assert.equal(normalize(real), normalize(absolute), `noncanonical repository path: ${relative}`);
  return absolute;
}

const repoRelative = (absolute: string): string => slash(path.relative(repoRoot, canonicalRepoFile(absolute)));

function readJson(relative: string): JsonObject {
  return JSON.parse(readFileSync(canonicalRepoFile(path.join(repoRoot, relative)), "utf8")) as JsonObject;
}

function row(relative: string, kind: string): JsonObject {
  const bytes = readFileSync(canonicalRepoFile(path.join(repoRoot, relative)));
  return { path: slash(relative), kind, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

interface Edge {
  from: string;
  kind: "static-import" | "static-export" | "import-equals" | "literal-dynamic-import" | "literal-require";
  specifier: string;
  to: string;
}

const resolverOptions: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  baseUrl: repoRoot,
  paths: { "@/*": ["src/*"] },
  allowJs: true,
  resolveJsonModule: true,
  allowImportingTsExtensions: true,
};

function resolveLocal(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const resolved = ts.resolveModuleName(specifier, from, resolverOptions, ts.sys).resolvedModule;
  assert(resolved, `TypeScript could not resolve ${specifier} from ${repoRelative(from)}`);
  const absolute = canonicalRepoFile(resolved.resolvedFileName);
  const relative = slash(path.relative(repoRoot, absolute));
  assert(!relative.startsWith("node_modules/"), `local specifier resolved into node_modules: ${specifier}`);
  return absolute;
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function syntaxImports(file: string): {
  imports: Array<{ specifier: string; kind: Edge["kind"] }>;
  nonliteral: string[];
  importTypes: string[];
} {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const imports: Array<{ specifier: string; kind: Edge["kind"] }> = [];
  const nonliteral: string[] = [];
  const importTypes: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) {
        imports.push({
          specifier: node.moduleSpecifier.text,
          kind: ts.isImportDeclaration(node) ? "static-import" : "static-export",
        });
      } else {
        nonliteral.push(`${repoRelative(file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}:nonliteral-static`);
      }
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (expression && ts.isStringLiteralLike(expression)) {
        imports.push({ specifier: expression.text, kind: "import-equals" });
      } else {
        nonliteral.push(`${repoRelative(file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}:nonliteral-import-equals`);
      }
    } else if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const kind: Edge["kind"] = node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? "literal-dynamic-import"
        : "literal-require";
      if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
        imports.push({ specifier: node.arguments[0]!.text, kind });
      } else {
        nonliteral.push(`${repoRelative(file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}:${kind}`);
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      importTypes.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { imports, nonliteral, importTypes };
}

function computeClosure(entrypoints: readonly string[], sourceKind: string): {
  sourceRows: JsonObject[];
  edges: Edge[];
  externalSpecifiers: string[];
  unresolvedLocal: Array<{ from: string; specifier: string }>;
  nonliteral: string[];
  importTypeSpecifiers: string[];
} {
  const queue = entrypoints.map((entry) => canonicalRepoFile(path.join(repoRoot, entry)));
  const visited = new Set<string>();
  const external = new Set<string>();
  const edges: Edge[] = [];
  const unresolvedLocal: Array<{ from: string; specifier: string }> = [];
  const nonliteral: string[] = [];
  const importTypes = new Set<string>();
  while (queue.length > 0) {
    const absolute = canonicalRepoFile(queue.shift()!);
    const relative = repoRelative(absolute);
    if (visited.has(relative)) continue;
    visited.add(relative);
    if (absolute.endsWith(".json")) continue;
    const parsed = syntaxImports(absolute);
    nonliteral.push(...parsed.nonliteral);
    parsed.importTypes.forEach((specifier) => importTypes.add(specifier));
    for (const imported of parsed.imports) {
      try {
        const target = resolveLocal(absolute, imported.specifier);
        if (target) {
          const to = repoRelative(target);
          edges.push({ from: relative, kind: imported.kind, specifier: imported.specifier, to });
          if (!visited.has(to)) queue.push(target);
        } else {
          external.add(imported.specifier);
        }
      } catch (error) {
        if (imported.specifier.startsWith(".") || imported.specifier.startsWith("@/")) {
          unresolvedLocal.push({ from: relative, specifier: imported.specifier });
        } else {
          throw error;
        }
      }
    }
  }
  const sourceRows = [...visited].sort().map((relative) => row(relative, sourceKind));
  edges.sort((left, right) => {
    const l = `${left.from}\0${left.kind}\0${left.specifier}\0${left.to}`;
    const r = `${right.from}\0${right.kind}\0${right.specifier}\0${right.to}`;
    return l < r ? -1 : l > r ? 1 : 0;
  });
  return {
    sourceRows,
    edges,
    externalSpecifiers: [...external].sort(),
    unresolvedLocal,
    nonliteral,
    importTypeSpecifiers: [...importTypes].sort(),
  };
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

const FS_READ_DATA = new Set(["readFile", "readFileSync", "createReadStream"]);
const FS_READ_METADATA = new Set([
  "access", "accessSync", "existsSync", "lstat", "lstatSync", "realpath", "realpathSync",
  "readdir", "readdirSync", "readlink", "readlinkSync", "stat", "statSync",
]);
const FS_WRITE = new Set([
  "appendFile", "appendFileSync", "close", "closeSync", "copyFile", "copyFileSync", "createWriteStream",
  "fsync", "fsyncSync", "mkdir", "mkdirSync", "open", "openSync", "rename", "renameSync", "rm", "rmSync",
  "unlink", "unlinkSync", "write", "writeFile", "writeFileSync", "writeSync",
]);

interface FsCall {
  path: string;
  line: number;
  operation: string;
  category: "data-read" | "metadata-read" | "write-or-open" | "other";
  argumentExpression: string;
}

function fsCalls(relativeFiles: readonly string[]): FsCall[] {
  const calls: FsCall[] = [];
  for (const relative of relativeFiles) {
    const file = canonicalRepoFile(path.join(repoRoot, relative));
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
    const named = new Map<string, string>();
    const namespaces = new Set<string>();
    const isFsRequire = (expression: ts.Expression): boolean => {
      const value = unwrap(expression);
      return ts.isCallExpression(value) && ts.isIdentifier(value.expression) && value.expression.text === "require" &&
        value.arguments.length === 1 && ts.isStringLiteralLike(value.arguments[0]!) &&
        (value.arguments[0]!.text === "node:fs" || value.arguments[0]!.text === "fs");
    };
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier) &&
        (statement.moduleSpecifier.text === "node:fs" || statement.moduleSpecifier.text === "fs") && statement.importClause) {
        if (statement.importClause.name) namespaces.add(statement.importClause.name.text);
        const bindings = statement.importClause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) named.set(element.name.text, element.propertyName?.text ?? element.name.text);
        }
      }
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !isFsRequire(declaration.initializer)) continue;
        if (ts.isIdentifier(declaration.name)) namespaces.add(declaration.name.text);
        if (ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements) {
            if (ts.isIdentifier(element.name)) named.set(element.name.text, element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : element.name.text);
          }
        }
      }
    }
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && node.initializer && isFsRequire(node.initializer)) {
        if (ts.isIdentifier(node.name)) namespaces.add(node.name.text);
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (ts.isIdentifier(element.name)) named.set(element.name.text, element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : element.name.text);
          }
        }
      }
      if (ts.isCallExpression(node)) {
        let operation: string | null = null;
        if (ts.isIdentifier(node.expression) && named.has(node.expression.text)) operation = named.get(node.expression.text)!;
        if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && namespaces.has(node.expression.expression.text)) {
          operation = node.expression.name.text;
        }
        if (operation) {
          const category = FS_READ_DATA.has(operation)
            ? "data-read"
            : FS_READ_METADATA.has(operation)
              ? "metadata-read"
              : FS_WRITE.has(operation)
                ? "write-or-open"
                : "other";
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          const argumentExpression = node.arguments[0]
            ? node.arguments[0]!.getText(source).replace(/\s+/gu, " ").slice(0, 240)
            : "";
          calls.push({ path: relative, line, operation, category, argumentExpression });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return calls.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.line - right.line);
}

function processEnvReferences(relativeFiles: readonly string[]): Array<{ path: string; line: number; expression: string }> {
  const rows: Array<{ path: string; line: number; expression: string }> = [];
  for (const relative of relativeFiles) {
    const file = canonicalRepoFile(path.join(repoRoot, relative));
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, scriptKind(file));
    const isProcessEnv = (node: ts.Node): boolean => ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
      node.expression.text === "process" && node.name.text === "env";
    const visit = (node: ts.Node): void => {
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && isProcessEnv(node.expression)) {
        rows.push({
          path: relative,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          expression: node.getText(source).slice(0, 180),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return rows.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.line - right.line);
}

function parseManifest(relativeManifest: string): Array<{ hash: string; path: string }> {
  const text = readFileSync(path.join(repoRoot, relativeManifest), "utf8").trim();
  const seen = new Set<string>();
  return text.split(/\r?\n/gu).map((line) => {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert(match, `malformed manifest row: ${line}`);
    assert(!seen.has(match[2]!), `duplicate manifest row: ${match[2]}`);
    seen.add(match[2]!);
    const bytes = readFileSync(canonicalRepoFile(path.join(repoRoot, match[2]!)));
    assert.equal(sha256(bytes), match[1], `manifest byte mismatch: ${match[2]}`);
    return { hash: match[1]!, path: slash(match[2]!) };
  });
}

function walkFiles(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.push(slash(path.relative(repoRoot, absolute)));
    }
  };
  visit(root);
  return result.sort();
}

function schemaSummary(schema: JsonObject): JsonObject {
  const keywords = new Set<string>();
  const types = new Set<string>();
  const keywordCounts: Record<string, number> = {};
  const constraints: Record<string, number> = {};
  const walk = (candidate: any): void => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
    for (const key of Object.keys(candidate)) {
      keywords.add(key);
      keywordCounts[key] = (keywordCounts[key] ?? 0) + 1;
      if (["enum", "const", "minimum", "maximum", "pattern", "minItems", "maxItems", "minLength", "maxLength", "required", "additionalProperties"].includes(key)) {
        constraints[key] = (constraints[key] ?? 0) + 1;
      }
    }
    if (typeof candidate.type === "string") types.add(candidate.type);
    if (candidate.properties && typeof candidate.properties === "object" && !Array.isArray(candidate.properties)) {
      Object.values(candidate.properties).forEach(walk);
    }
    if (candidate.items) walk(candidate.items);
  };
  walk(schema);
  return {
    keywords: [...keywords].sort(),
    types: [...types].sort(),
    keywordCounts,
    constraintCounts: constraints,
  };
}

function validForSchema(schema: JsonObject): any {
  if (Object.hasOwn(schema, "const")) return structuredClone(schema.const);
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return structuredClone(schema.enum[0]);
  switch (schema.type) {
    case "object": {
      const result: JsonObject = {};
      const properties = schema.properties as JsonObject;
      for (const [key, child] of Object.entries(properties)) result[key] = validForSchema(child as JsonObject);
      return result;
    }
    case "array": {
      const minimum = typeof schema.minItems === "number" ? schema.minItems : 0;
      const count = Math.max(minimum, 1);
      return Array.from({ length: count }, () => validForSchema(schema.items));
    }
    case "string": {
      const minimum = typeof schema.minLength === "number" ? schema.minLength : 0;
      let value = "A".repeat(Math.max(minimum, 1));
      if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) value = "AA";
      return value;
    }
    case "integer": {
      const minimum = typeof schema.minimum === "number" ? Math.ceil(schema.minimum) : 0;
      return minimum;
    }
    case "number":
      return typeof schema.minimum === "number" ? schema.minimum : 0;
    case "boolean":
      return true;
    case "null":
      return null;
    default:
      throw new Error(`cannot synthesize schema type ${String(schema.type)}`);
  }
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function setAt(root: any, pathParts: Array<string | number>, value: any): void {
  let cursor = root;
  for (let index = 0; index < pathParts.length - 1; index += 1) cursor = cursor[pathParts[index]!];
  cursor[pathParts[pathParts.length - 1]!] = value;
}

function deleteAt(root: any, pathParts: Array<string | number>): void {
  let cursor = root;
  for (let index = 0; index < pathParts.length - 1; index += 1) cursor = cursor[pathParts[index]!];
  delete cursor[pathParts[pathParts.length - 1]!];
}

async function parserAudit(privateArtifact: JsonObject): Promise<JsonObject> {
  const parserModuleRaw = await import(pathToFileURL(path.join(targetRoot, "response-parser.ts")).href);
  const parserModule = (parserModuleRaw as any).default ?? parserModuleRaw;
  const parse = parserModule.parseConnectivityResponseV4 as (input: any) => JsonObject;
  assert.equal(typeof parse, "function");

  interface CaseResult { id: string; expected: "accept" | "reject"; observed: "accept" | "reject"; error?: string }
  const cases: CaseResult[] = [];
  const schemaSummaries: JsonObject[] = [];
  const execute = (id: string, expected: "accept" | "reject", input: any): void => {
    try {
      parse(input);
      cases.push({ id, expected, observed: "accept" });
    } catch (error) {
      cases.push({ id, expected, observed: "reject", error: error instanceof Error ? error.message : String(error) });
    }
  };
  const makeEnvelope = (rowValue: JsonObject, schema: JsonObject, content: any): JsonObject => ({
    rawText: JSON.stringify({
      id: "req_offline_audit",
      model: rowValue.modelId,
      provider: "google-vertex/global",
      choices: [{ index: 0, finish_reason: "stop", message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1, cost: 0 },
    }),
    requestedModel: rowValue.modelId,
    allowedServedModels: [rowValue.modelId],
    expectedProvider: "google-vertex/global",
    allowedFinishReasons: ["stop"],
    responseSchema: schema,
  });
  const mutateEnvelope = (base: JsonObject, mutation: (response: JsonObject) => void): JsonObject => {
    const next = deepClone(base);
    const response = JSON.parse(next.rawText);
    mutation(response);
    next.rawText = JSON.stringify(response);
    return next;
  };

  for (const rowValue of privateArtifact.rows as JsonObject[]) {
    const body = JSON.parse(rowValue.bodyText) as JsonObject;
    const schema = body.response_format.json_schema.schema as JsonObject;
    const content = validForSchema(schema);
    const prefix = String(rowValue.plan).toLowerCase();
    const base = makeEnvelope(rowValue, schema, content);
    execute(`${prefix}:valid-actual-schema`, "accept", base);
    schemaSummaries.push({
      plan: rowValue.plan,
      schemaSha256: sha256(stableJson(schema)),
      ...schemaSummary(schema),
    });

    for (const reason of ["length", "content_filter", "tool_calls", null, undefined] as const) {
      execute(`${prefix}:finish-${String(reason)}`, "reject", mutateEnvelope(base, (response) => {
        if (reason === undefined) delete response.choices[0].finish_reason;
        else response.choices[0].finish_reason = reason;
      }));
    }
    execute(`${prefix}:choices-zero`, "reject", mutateEnvelope(base, (response) => { response.choices = []; }));
    execute(`${prefix}:choices-two`, "reject", mutateEnvelope(base, (response) => { response.choices.push(deepClone(response.choices[0])); }));
    execute(`${prefix}:choice-index-wrong`, "reject", mutateEnvelope(base, (response) => { response.choices[0].index = 1; }));
    execute(`${prefix}:content-null`, "reject", mutateEnvelope(base, (response) => { response.choices[0].message.content = null; }));
    execute(`${prefix}:content-missing`, "reject", mutateEnvelope(base, (response) => { delete response.choices[0].message.content; }));
    execute(`${prefix}:content-invalid-json`, "reject", mutateEnvelope(base, (response) => { response.choices[0].message.content = "{"; }));
    execute(`${prefix}:message-tool-calls-coexists`, "reject", mutateEnvelope(base, (response) => {
      response.choices[0].message.tool_calls = [{ id: "call_offline", type: "function", function: { name: "x", arguments: "{}" } }];
    }));
    execute(`${prefix}:served-model-wrong`, "reject", mutateEnvelope(base, (response) => { response.model = "unattested/model"; }));
    execute(`${prefix}:provider-wrong`, "reject", mutateEnvelope(base, (response) => { response.provider = "other-route"; }));
    execute(`${prefix}:request-id-missing`, "reject", mutateEnvelope(base, (response) => { delete response.id; }));
    execute(`${prefix}:questions-zero`, "reject", mutateEnvelope(base, (response) => {
      const parsed = JSON.parse(response.choices[0].message.content); parsed.questions = []; response.choices[0].message.content = JSON.stringify(parsed);
    }));
    execute(`${prefix}:questions-two`, "reject", mutateEnvelope(base, (response) => {
      const parsed = JSON.parse(response.choices[0].message.content); parsed.questions.push(deepClone(parsed.questions[0])); response.choices[0].message.content = JSON.stringify(parsed);
    }));

    const schemaCases: Array<{ id: string; content: any }> = [];
    const walk = (schemaNode: JsonObject, valueNode: any, pathParts: Array<string | number>): void => {
      if (schemaNode.type === "object") {
        const extra = deepClone(content); setAt(extra, pathParts, { ...valueNode, __offline_extra: true });
        schemaCases.push({ id: `extra:${pathParts.join(".") || "root"}`, content: extra });
        for (const required of schemaNode.required as string[]) {
          const missing = deepClone(content); deleteAt(missing, [...pathParts, required]);
          schemaCases.push({ id: `missing:${[...pathParts, required].join(".")}`, content: missing });
        }
        const wrong = deepClone(content); setAt(wrong, pathParts, []);
        schemaCases.push({ id: `wrong-type-object:${pathParts.join(".") || "root"}`, content: wrong });
        for (const [key, childSchema] of Object.entries(schemaNode.properties as JsonObject)) {
          walk(childSchema as JsonObject, valueNode[key], [...pathParts, key]);
        }
      } else if (schemaNode.type === "array") {
        const wrong = deepClone(content); setAt(wrong, pathParts, {});
        schemaCases.push({ id: `wrong-type-array:${pathParts.join(".")}`, content: wrong });
        if (typeof schemaNode.minItems === "number" && schemaNode.minItems > 0) {
          const below = deepClone(content); setAt(below, pathParts, []);
          schemaCases.push({ id: `minItems:${pathParts.join(".")}`, content: below });
        }
        if (typeof schemaNode.maxItems === "number") {
          const above = deepClone(content);
          setAt(above, pathParts, Array.from({ length: schemaNode.maxItems + 1 }, () => validForSchema(schemaNode.items)));
          schemaCases.push({ id: `maxItems:${pathParts.join(".")}`, content: above });
        }
        if (Array.isArray(valueNode) && valueNode.length > 0) walk(schemaNode.items, valueNode[0], [...pathParts, 0]);
      } else {
        const wrong = deepClone(content);
        const wrongValue = schemaNode.type === "string" ? 7 : schemaNode.type === "boolean" ? "true" : schemaNode.type === "null" ? 0 : "not-a-number";
        setAt(wrong, pathParts, wrongValue);
        schemaCases.push({ id: `wrong-type-${schemaNode.type}:${pathParts.join(".")}`, content: wrong });
        if (Array.isArray(schemaNode.enum)) {
          const outside = deepClone(content); setAt(outside, pathParts, "__outside_enum__");
          schemaCases.push({ id: `enum:${pathParts.join(".")}`, content: outside });
        }
        if (typeof schemaNode.minLength === "number" && schemaNode.minLength > 0) {
          const below = deepClone(content); setAt(below, pathParts, "");
          schemaCases.push({ id: `minLength:${pathParts.join(".")}`, content: below });
        }
      }
    };
    walk(schema, content, []);
    for (const candidate of schemaCases) {
      execute(`${prefix}:schema:${candidate.id}`, "reject", makeEnvelope(rowValue, schema, candidate.content));
    }

    for (const [id, mutation] of [
      ["prompt-negative", (response: any) => { response.usage.prompt_tokens = -1; }],
      ["prompt-zero", (response: any) => { response.usage.prompt_tokens = 0; response.usage.total_tokens = 0; }],
      ["prompt-fractional", (response: any) => { response.usage.prompt_tokens = 1.5; response.usage.total_tokens = 1.5; }],
      ["prompt-unsafe", (response: any) => { response.usage.prompt_tokens = 9007199254740992; response.usage.total_tokens = 9007199254740992; }],
      ["completion-negative", (response: any) => { response.usage.completion_tokens = -1; response.usage.total_tokens = 0; }],
      ["total-inexact", (response: any) => { response.usage.total_tokens = 2; }],
      ["cost-negative", (response: any) => { response.usage.cost = -0.01; }],
      ["cost-null", (response: any) => { response.usage.cost = null; }],
    ] as Array<[string, (response: any) => void]>) {
      execute(`${prefix}:usage:${id}`, "reject", mutateEnvelope(base, mutation));
    }
    const infiniteCost = deepClone(base);
    infiniteCost.rawText = infiniteCost.rawText.replace('"cost":0', '"cost":1e309');
    execute(`${prefix}:usage:cost-nonfinite`, "reject", infiniteCost);
  }

  const syntheticSchema: JsonObject = {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", additionalProperties: false, properties: { text: { type: "string", minLength: 1 } }, required: ["text"] } },
      probe: {
        type: "object",
        additionalProperties: false,
        properties: {
          bounded: { type: "string", minLength: 2, maxLength: 3, pattern: "^[A-Z]+$" },
          integer: { type: "integer", minimum: 2, maximum: 4 },
          number: { type: "number", minimum: 0.5, maximum: 1.5 },
          flag: { type: "boolean" },
          nil: { type: "null" },
          list: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: ["x", "y"] } },
        },
        required: ["bounded", "integer", "number", "flag", "nil", "list"],
      },
    },
    required: ["questions", "probe"],
  };
  const syntheticRow = privateArtifact.rows[0] as JsonObject;
  const syntheticContent = validForSchema(syntheticSchema);
  const syntheticBase = makeEnvelope(syntheticRow, syntheticSchema, syntheticContent);
  execute("synthetic:valid", "accept", syntheticBase);
  const syntheticMutations: Array<[string, (value: any) => void]> = [
    ["maxLength", (value) => { value.probe.bounded = "AAAA"; }],
    ["pattern", (value) => { value.probe.bounded = "aa"; }],
    ["integer-minimum", (value) => { value.probe.integer = 1; }],
    ["integer-maximum", (value) => { value.probe.integer = 5; }],
    ["integer-fractional", (value) => { value.probe.integer = 2.5; }],
    ["number-minimum", (value) => { value.probe.number = 0.4; }],
    ["number-maximum", (value) => { value.probe.number = 1.6; }],
    ["array-maxItems", (value) => { value.probe.list = ["x", "x", "x"]; }],
    ["array-enum", (value) => { value.probe.list = ["z"]; }],
    ["null-wrong", (value) => { value.probe.nil = false; }],
  ];
  for (const [id, mutation] of syntheticMutations) {
    const candidate = deepClone(syntheticContent); mutation(candidate);
    execute(`synthetic:${id}`, "reject", makeEnvelope(syntheticRow, syntheticSchema, candidate));
  }
  const unsupportedSchema = deepClone(syntheticSchema);
  unsupportedSchema.properties.probe.properties.bounded.oneOf = [{ type: "string" }];
  execute("synthetic:unsupported-keyword", "reject", makeEnvelope(syntheticRow, unsupportedSchema, syntheticContent));

  const mismatches = cases.filter((candidate) => candidate.expected !== candidate.observed);
  return {
    actualSealedSchemaSummaries: schemaSummaries,
    totalCases: cases.length,
    expectedAccepts: cases.filter((candidate) => candidate.expected === "accept").length,
    expectedRejects: cases.filter((candidate) => candidate.expected === "reject").length,
    observedAccepts: cases.filter((candidate) => candidate.observed === "accept").length,
    observedRejects: cases.filter((candidate) => candidate.observed === "reject").length,
    mismatches,
    allCases: cases,
    exactSchemaCoveragePass: mismatches.filter((candidate) => candidate.id !== "standard:message-tool-calls-coexists" && candidate.id !== "premium:message-tool-calls-coexists").length === 0,
    requiredFinishReasonRejectCasesPass: ["finish-length", "finish-content_filter", "finish-tool_calls", "finish-null", "finish-undefined"].every((suffix) =>
      cases.filter((candidate) => candidate.id.endsWith(suffix)).every((candidate) => candidate.observed === "reject")),
    requiredTokenCostRouteModelAndCardinalityCasesPass: mismatches.every((candidate) => candidate.id.endsWith("message-tool-calls-coexists")),
    messageToolCallsCoexistenceRejected: !mismatches.some((candidate) => candidate.id.endsWith("message-tool-calls-coexists")),
  };
}

function extractDiffInstruction(): string {
  const relative = "src/app/api/ai/generate-questions-auto/_lib/constants.ts";
  const file = canonicalRepoFile(path.join(repoRoot, relative));
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "DIFF_DESCRIPTION" || !declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      for (const property of declaration.initializer.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name) ? property.name.text : "";
        if (name !== "INTERMEDIATE") continue;
        assert(ts.isStringLiteralLike(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer));
        return property.initializer.text;
      }
    }
  }
  throw new Error("DIFF_DESCRIPTION.INTERMEDIATE was not found");
}

function extractLiteralStringArrayConstant(relative: string, constantName: string): string[] {
  const file = canonicalRepoFile(path.join(repoRoot, relative));
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, scriptKind(file));
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== constantName || !declaration.initializer) continue;
      const initializer = unwrap(declaration.initializer);
      assert(ts.isArrayLiteralExpression(initializer), `${constantName} must be a literal array`);
      return initializer.elements.map((element) => {
        assert(ts.isStringLiteralLike(element), `${constantName} must contain only literal strings`);
        return slash(element.text);
      });
    }
  }
  throw new Error(`${constantName} was not found in ${relative}`);
}

async function costAccountingFaultAudit(privateArtifact: JsonObject): Promise<JsonObject> {
  const parserModuleRaw = await import(pathToFileURL(path.join(targetRoot, "response-parser.ts")).href);
  const parserModule = (parserModuleRaw as any).default ?? parserModuleRaw;
  const parse = parserModule.parseConnectivityResponseV4 as (input: any) => JsonObject;
  const rowValue = privateArtifact.rows[0] as JsonObject;
  const body = JSON.parse(rowValue.bodyText) as JsonObject;
  const schema = body.response_format.json_schema.schema as JsonObject;
  const content = validForSchema(schema);
  const makeRaw = (finishReason: string, cost: number): string => JSON.stringify({
    id: "req_offline_cost_fault",
    model: rowValue.modelId,
    provider: "google-vertex/global",
    choices: [{ index: 0, finish_reason: finishReason, message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18, cost },
  });
  const parserInput = (rawText: string): JsonObject => ({
    rawText,
    requestedModel: rowValue.modelId,
    allowedServedModels: [rowValue.modelId],
    expectedProvider: "google-vertex/global",
    allowedFinishReasons: ["stop"],
    responseSchema: schema,
  });
  const fixtures: JsonObject[] = [];

  const parserFailureCost = 0.123456;
  let parserRejected = false;
  try {
    parse(parserInput(makeRaw("length", parserFailureCost)));
  } catch {
    parserRejected = true;
  }
  assert.equal(parserRejected, true);
  fixtures.push({
    id: "sent-http-200-valid-usage-parser-failure",
    sent: true,
    rawUsageCostUsd: parserFailureCost,
    parserRejected: true,
    assignmentEvidencePersistedByRunner: false,
    runnerStateActualCostUsd: 0,
    globalSettlementCostUsd: 0,
    underreportedUsd: parserFailureCost,
  });

  const cap = Number(rowValue.plan === "STANDARD"
    ? readJson(`${targetRelative}/protocol-v4.json`).durableBounds.assignments[0].calculatedWorstCaseUsdCap
    : 0.1);
  const overCapCost = cap + 0.01;
  const parsedOverCap = parse(parserInput(makeRaw("stop", overCapCost)));
  assert.equal(parsedOverCap.actualCostUsd, overCapCost);
  assert(overCapCost > cap);
  fixtures.push({
    id: "sent-http-200-valid-parser-evidence-cost-cap-failure",
    sent: true,
    rawUsageCostUsd: overCapCost,
    parserAccepted: true,
    capFailureOccursBeforeAssignmentEvidencePersistence: true,
    assignmentEvidencePersistedByRunner: false,
    runnerStateActualCostUsd: 0,
    globalSettlementCostUsd: 0,
    underreportedUsd: overCapCost,
  });

  const httpFailureCost = 0.045;
  fixtures.push({
    id: "sent-http-non-ok-body-with-valid-usage",
    sent: true,
    rawUsageCostUsd: httpFailureCost,
    responseOk: false,
    parserInvokedByRunner: false,
    assignmentEvidencePersistedByRunner: false,
    runnerStateActualCostUsd: 0,
    globalSettlementCostUsd: 0,
    underreportedUsd: httpFailureCost,
  });

  const runner = readFileSync(path.join(targetRoot, "production-runner.ts"), "utf8");
  const positions = {
    responseBodyRead: runner.indexOf("rawText = await response.text()"),
    httpOkCheck: runner.indexOf("if (!response.ok)"),
    parserCall: runner.indexOf("const evidence = parseConnectivityResponseV4"),
    capCheck: runner.indexOf("if (evidence.actualCostUsd > assignment.calculatedWorstCaseUsdCap"),
    evidencePersistence: runner.indexOf("assignmentState.evidence = evidence"),
    actualCostAccumulation: runner.indexOf("run.state.actualCostUsd ="),
    catchBlock: runner.indexOf("} catch (error)"),
    settlementEvidenceFilter: runner.indexOf("const evidence = run.state.assignments.map((row) => row.evidence).filter(Boolean)"),
    settlementCost: runner.indexOf("costUsd: run.state.actualCostUsd"),
  };
  assert(positions.responseBodyRead < positions.httpOkCheck);
  assert(positions.httpOkCheck < positions.parserCall);
  assert(positions.parserCall < positions.capCheck);
  assert(positions.capCheck < positions.evidencePersistence);
  assert(positions.evidencePersistence < positions.catchBlock);
  assert(positions.settlementEvidenceFilter < positions.settlementCost);
  assert(fixtures.every((fixture) => fixture.sent === true && fixture.rawUsageCostUsd > 0 && fixture.globalSettlementCostUsd === 0));
  return {
    independentPureFaultFixtures: fixtures,
    staticDataflowCharacterOffsets: positions,
    confirmed: true,
    conclusion: "For HTTP, parser, or cost-cap failures after send, only success evidence contributes usage/cost. A body can contain finite positive usage.cost while global settlement records zero.",
    networkCalls: 0,
    ledgerMutations: 0,
  };
}

function semanticBindingAudit(privateArtifact: JsonObject, compilerRows: JsonObject[]): JsonObject {
  const v2Private = readJson(`${v2Relative}/private/exact-wire-v2.private.json`);
  const v2Core = { ...v2Private };
  delete v2Core.privateSemanticSha256;
  assert.equal(sha256(stableJson(v2Core)), v2Private.privateSemanticSha256);
  assert.deepEqual(privateArtifact.rows, v2Private.rows, "v4 rows differ from inherited production compiler rows");
  assert.deepEqual(privateArtifact.fixedProductionInput, v2Private.fixedProductionInput, "fixed input differs from v2 compiler artifact");

  const v2Closure = v2Private.sourceClosure as JsonObject[];
  assert.equal(sha256(stableJson(v2Closure)), v2Private.sourceClosureSha256);
  for (const closureRow of v2Closure) {
    const current = row(closureRow.path, "unused");
    assert.equal(current.bytes, closureRow.bytes);
    assert.equal(current.sha256, closureRow.sha256);
  }
  const artifactHash = (paths: string[]): string => sha256(stableJson(v2Closure.filter((candidate) => paths.includes(candidate.path))));
  const profileHash = artifactHash([
    "src/lib/question-generation-research-profiles.ts",
    "src/lib/question-generation-research-schema.ts",
    "src/lib/question-generation-prompt-contract.ts",
    "src/app/api/ai/generate-questions-auto/_lib/prompts.ts",
  ]);
  const gateHash = artifactHash([
    "src/lib/question-quality/dispatcher.ts",
    "src/lib/question-quality/core.ts",
    "src/lib/question-quality/validators/blank/inference.ts",
    "src/lib/question-quality/validators/blank/inference-distractor.ts",
    "src/lib/question-quality/validators/blank/shared.ts",
    "src/lib/question-quality/validators/blank/paraphrase.ts",
    "src/lib/question-quality/validators/blank/seam.ts",
    "src/lib/question-quality/validators/options.ts",
    "src/lib/question-type-generation-settings/blank-inference.ts",
  ]);
  const policyHash = artifactHash([
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts",
    "src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts",
    "src/lib/question-generation-llm.ts",
    "src/lib/atlas-ai.ts",
    "src/lib/atlas-research-fetch-boundary.ts",
  ]);
  const protocolV2 = readJson(`${v2Relative}/protocol-v2.json`);
  const corpusPrivate = readJson("experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/private/pilot-source.private.json");
  const diffInstruction = extractDiffInstruction();
  const rowResults: JsonObject[] = [];
  for (const rowValue of privateArtifact.rows as JsonObject[]) {
    const body = JSON.parse(rowValue.bodyText) as JsonObject;
    const promptSurface = {
      messages: body.messages ?? null,
      prompt: body.prompt ?? null,
      input: body.input ?? null,
      instructions: body.instructions ?? null,
    };
    const schema = body.response_format.json_schema.schema;
    const generation = {
      plan: [{
        subType: "BLANK_INFERENCE",
        count: 1,
        reason: String(protocolV2.completeProductionInput.planItem.reason),
        targetPoints: [],
      }],
      schoolType: protocolV2.completeProductionInput.schoolType,
      gradeInfo: protocolV2.completeProductionInput.gradeInfo,
      passageContent: corpusPrivate.row.passageText,
      teacherIntentBlock: "",
      analysisContext: "",
      diffLabel: "INTERMEDIATE",
      diffInstruction,
      generationPlan: rowValue.plan,
      customPrompt: "",
    };
    const requestEnvelope = {
      profileId: "B0_CURRENT_CONTROL",
      ...generation,
      passageContent: corpusPrivate.row.passageText,
      qualityMode: "strict",
      attemptIndex: 0,
    };
    const computed = {
      bodySha256: sha256(rowValue.bodyText),
      bodyUtf8Bytes: Buffer.byteLength(rowValue.bodyText, "utf8"),
      promptSha256: sha256(stableJson(promptSurface)),
      schemaSha256: sha256(stableJson(schema)),
      requestEnvelopeSha256: sha256(stableJson(requestEnvelope)),
      profileArtifactSha256: profileHash,
      gateArtifactSha256: gateHash,
      policyArtifactSha256: policyHash,
    };
    for (const [key, value] of Object.entries(computed)) assert.equal(rowValue[key], value, `${rowValue.plan}.${key} mismatch`);
    rowResults.push({ plan: rowValue.plan, ...computed });
  }
  assert.equal(privateArtifact.productionCompilerAuthority.upstreamPrivateSemanticSha256, v2Private.privateSemanticSha256);
  assert.equal(privateArtifact.productionCompilerAuthority.inheritedThirtyTwoRowClosureSha256, v2Private.sourceClosureSha256);
  assert.equal(privateArtifact.productionCompilerAuthority.inheritedThirtyTwoRowClosureRows, v2Closure.length);
  assert.equal(privateArtifact.productionCompilerClosureSha256, sha256(stableJson(compilerRows)));
  return {
    v2PrivateSemanticSha256: v2Private.privateSemanticSha256,
    inheritedThirtyTwoRowClosureSha256: v2Private.sourceClosureSha256,
    inheritedThirtyTwoRows: v2Closure.length,
    rowBindings: rowResults,
    diffInstructionSha256: sha256(diffInstruction),
  };
}

function staticSafetyAudit(protocol: JsonObject, liveSourcePaths: string[]): JsonObject {
  const capture = readFileSync(path.join(targetRoot, "capture-price-snapshot.mts"), "utf8");
  const runner = readFileSync(path.join(targetRoot, "production-runner.ts"), "utf8");
  const operator = readFileSync(path.join(targetRoot, "operator-wrapper.mts"), "utf8");
  const liveChild = readFileSync(path.join(targetRoot, "live-child.mts"), "utf8");
  assert.deepEqual(protocol.authorization, {
    liveExecutionAuthorized: false,
    hostileAuditPassed: false,
    dispatchCommandPresent: false,
  });
  const captureCliCallsMain = /if\s*\(process\.argv\[1\][\s\S]*?await main\(\)/u.test(capture);
  const captureFetchCalls = [...capture.matchAll(/await fetchPublicJson\(/gu)].length;
  const captureHasAuthorizationGate = /authorization|liveExecutionAuthorized|hostileAuditPassed|dispatchCommandPresent/u.test(capture);
  const operatorBlockedCli = /async function blockedEntrypoint\(\)[\s\S]*?throw new Error\("No dispatch command is present[\s\S]*?await blockedEntrypoint\(\)/u.test(operator);
  const operatorAuthBeforeSecretRead = operator.indexOf("authorization.liveExecutionAuthorized") >= 0 &&
    operator.indexOf("authorization.liveExecutionAuthorized") < operator.indexOf("await readOnlyOpenRouterAssignment()");
  const runnerAuthBeforeReserve = runner.indexOf("assertAuthorized(loaded.protocol)") >= 0 &&
    runner.indexOf("assertAuthorized(loaded.protocol)") < runner.lastIndexOf("reserveGlobalTwo()");
  const reserveBeforeFetchLoop = runner.lastIndexOf("reserveGlobalTwo()") < runner.lastIndexOf("await executeOne(");
  const fetchRedirectError = /directNetworkFetchV4\(ENDPOINT,[\s\S]*?redirect:\s*"error"/u.test(runner);
  const directFetchCallCount = [...runner.matchAll(/await directNetworkFetchV4\(/gu)].length;
  const noInjectedDelegate = !/\b(?:delegate|transport|injectedFetch|fetchFactory|testPermit)\b/iu.test(runner);
  const noRetryTopUpSurface = !/\b(?:retry|top.?up|replacement|fallback)\b/iu.test(runner);
  const breakOnFailure = /const success = await executeOne\([\s\S]*?if \(!success\) break;/u.test(runner);
  const unknownNoReplay = /FAILED_OR_UNKNOWN_AFTER_SEND_TERMINAL[\s\S]*?replayAllowed:\s*false/u.test(runner);
  const settleInFinally = /finally\s*\{[\s\S]*?settleGlobal\(/u.test(runner);
  const initialJournalAfterReserveBeforeTry = runner.indexOf('run.append("DUAL_RESERVATION_COMMITTED"') > runner.lastIndexOf("reserveGlobalTwo()") &&
    runner.indexOf('run.append("DUAL_RESERVATION_COMMITTED"') < runner.indexOf("try {", runner.indexOf("export async function runSealed"));
  const wrapperCredentialPass = {
    retainedAssignments: [...operator.matchAll(/retained\s*=\s*decodeAssignmentValue/gu)].length,
    childCredentialAssignments: [...operator.matchAll(/env\.OPENROUTER_API_KEY\s*=\s*key/gu)].length,
    childLiveMarkerAssignments: [...operator.matchAll(/env\[LIVE_CHILD_ENV\]\s*=\s*"1"/gu)].length,
    inheritedEnvironmentSpread: /\.\.\.process\.env|Object\.assign\([^)]*process\.env/u.test(operator),
    otherCredentialNamesInChildBuilder: [...operator.matchAll(/env\.([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*)\s*=/gu)].map((match) => match[1]),
    envLocalContentsReadByAudit: false,
  };
  assert.equal(captureCliCallsMain, true);
  assert.equal(captureFetchCalls, 2); // one models call plus one source-level loop call for two model endpoint URLs
  assert.equal(operatorBlockedCli, true);
  assert.equal(operatorAuthBeforeSecretRead, true);
  assert.equal(runnerAuthBeforeReserve, true);
  assert.equal(reserveBeforeFetchLoop, true);
  assert.equal(fetchRedirectError, true);
  assert.equal(directFetchCallCount, 1);
  assert.equal(noInjectedDelegate, true);
  assert.equal(breakOnFailure, true);
  assert.equal(unknownNoReplay, true);
  assert.equal(settleInFinally, true);
  assert.equal(wrapperCredentialPass.childCredentialAssignments, 1);
  assert.equal(wrapperCredentialPass.inheritedEnvironmentSpread, false);
  return {
    authorization: protocol.authorization,
    cli: {
      operatorBlocked: operatorBlockedCli,
      liveChildGatedByRunner: runnerAuthBeforeReserve,
      productionRunnerHasNoCliMain: !/process\.argv\[1\][\s\S]*runSealedConnectivityPilotV4/u.test(runner),
      capturePriceSnapshotBlocked: captureHasAuthorizationGate || !captureCliCallsMain,
      capturePriceSnapshotDirectMain: captureCliCallsMain,
      capturePriceSnapshotNetworkCallSites: captureFetchCalls,
      capturePriceSnapshotEffectiveGetCount: 3,
    },
    networkBoundary: {
      modulePrivateFetchCapturedAtLoad: /const directNetworkFetchV4 = globalThis\.fetch\.bind\(globalThis\)/u.test(runner),
      uniqueDirectPostCallSite: directFetchCallCount === 1,
      redirectError: fetchRedirectError,
      injectedDelegateAbsent: noInjectedDelegate,
      alternateNodeTransportImports: liveSourcePaths.filter((relative) => /node:(?:http|https|net|tls|dns)/u.test(readFileSync(path.join(repoRoot, relative), "utf8"))),
    },
    budgetStateMachine: {
      authorizationBeforeReservation: runnerAuthBeforeReserve,
      globalReservationBeforeAnyFetch: reserveBeforeFetchLoop,
      serialBreakOnFirstFailure: breakOnFailure,
      retryFallbackReplacementTopUpSurfaceAbsent: noRetryTopUpSurface,
      unknownAfterSendNoReplay: unknownNoReplay,
      settlementInFinally: settleInFinally,
      initialJournalAppendAfterReservationBeforeProtectedTry: initialJournalAfterReserveBeforeTry,
      synthesizedFaultConclusion: initialJournalAfterReserveBeforeTry
        ? "If the initial DUAL_RESERVATION_COMMITTED journal append throws, the global reservation has committed but execution has not entered the settle-finally region; this leaks a fail-closed reservation without network dispatch."
        : "protected",
    },
    operatorWrapper: wrapperCredentialPass,
    liveChild: {
      productionRunnerImportedBeforeMainEnvironmentAssertion: liveChild.indexOf('from "./production-runner"') < liveChild.indexOf("assertMinimalEnvironment()"),
      credentialLikeEnvironmentNamesRejected: /CREDENTIAL_LIKE[\s\S]*!ALLOWED_EXACT\.has/u.test(liveChild),
      soleCredentialValueReadByRunner: [...runner.matchAll(/process\.env\.OPENROUTER_API_KEY/gu)].length,
    },
  };
}

async function importTimeNetworkAudit(): Promise<JsonObject> {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    throw new Error("INDEPENDENT_AUDIT_NETWORK_DENIED");
  }) as typeof fetch;
  try {
    await import(`${pathToFileURL(path.join(targetRoot, "production-runner.ts")).href}?independent-audit=1`);
    const afterRunner = attempts;
    await import(`${pathToFileURL(path.join(targetRoot, "capture-price-snapshot.mts")).href}?independent-audit=1`);
    return { productionRunnerImportAttempts: afterRunner, captureModuleImportAttempts: attempts - afterRunner, totalAttempts: attempts };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export async function runIndependentAudit(): Promise<{ evidence: JsonObject; report: JsonObject }> {
  const targetProtocolRelative = `${targetRelative}/protocol-v4.json`;
  const privateRelative = `${targetRelative}/private/exact-wire-v4.private.json`;
  const publicRelative = `${targetRelative}/offline-exact-wire-seal-v4.json`;
  const compilerArtifactRelative = `${targetRelative}/compiler-closure-v4.json`;
  const liveArtifactRelative = `${targetRelative}/live-closure-v4.json`;
  const authorRelative = `${targetRelative}/AUTHOR-REPORT.json`;

  const compiler = computeClosure([COMPILER_ENTRYPOINT], "compiler_source");
  assert.deepEqual(compiler.unresolvedLocal, []);
  assert.deepEqual(compiler.nonliteral, []);
  const compilerDataRows = [...DECLARED_COMPILER_DATA].sort().map((relative) => row(relative, "declared_compiler_data"));
  const compilerRows = [...compiler.sourceRows, ...compilerDataRows]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  assert.equal(new Set(compilerRows.map((candidate) => candidate.path)).size, compilerRows.length);
  const compilerArtifactBytes = readFileSync(path.join(repoRoot, compilerArtifactRelative));
  const compilerArtifact = JSON.parse(compilerArtifactBytes.toString("utf8")) as JsonObject;
  assert.deepEqual(compiler.sourceRows, compilerArtifact.sourceFiles, "independent TypeScript resolution source rows differ");
  assert.deepEqual(compilerDataRows, compilerArtifact.declaredDataInputs, "declared compiler data rows differ");
  assert.deepEqual(compilerRows, compilerArtifact.files, "full compiler closure rows differ");
  assert.equal(sha256(stableJson(compiler.sourceRows)), compilerArtifact.exactSourceFileSetAndBytesSha256);
  assert.equal(sha256(stableJson(compilerDataRows)), compilerArtifact.exactDeclaredDataSetAndBytesSha256);
  assert.equal(sha256(stableJson(compilerRows)), compilerArtifact.exactCompilerClosureSetAndBytesSha256);
  const compilerCore = { ...compilerArtifact };
  delete compilerCore.compilerClosureSemanticSha256;
  assert.equal(sha256(stableJson(compilerCore)), compilerArtifact.compilerClosureSemanticSha256);
  const compilerSourcePaths = compiler.sourceRows.map((candidate) => candidate.path as string);
  const compilerFsCalls = fsCalls(compilerSourcePaths);
  const compilerDataReadSourceModules = [...new Set(compilerFsCalls.filter((call) => call.category === "data-read").map((call) => call.path))];
  const allowedCompilerDataReadSources = [
    `${v2Relative}/compile-exact-wire.mts`,
    `${targetRelative}/compile-exact-wire.mts`,
    `${targetRelative}/compiler-closure.mts`,
  ].sort();
  assert.deepEqual(compilerDataReadSourceModules.sort(), allowedCompilerDataReadSources);

  const v2LiteralSourcePaths = extractLiteralStringArrayConstant(`${v2Relative}/compile-exact-wire.mts`, "SOURCE_PATHS");
  assert.equal(v2LiteralSourcePaths.length, 32);
  assert.equal(new Set(v2LiteralSourcePaths).size, 32);
  const v2LiteralSourceRows = v2LiteralSourcePaths.map((relative) => {
    const current = row(relative, "literal_sourceClosure_file_input");
    return { path: current.path, bytes: current.bytes, sha256: current.sha256 };
  });
  const v3Private = readJson(`${v3Relative}/private/exact-wire-v3.private.json`);
  const v3SubsetPaths = (v3Private.productionSourceClosure as JsonObject[]).map((candidate) => candidate.path as string);
  assert.equal(v3SubsetPaths.length, 32);
  assert.deepEqual(v2LiteralSourcePaths, v3SubsetPaths, "v3 historical rows differ from v2 literal SOURCE_PATHS");
  assert.deepEqual(v2LiteralSourceRows, v3Private.productionSourceClosure, "v3 historical row bytes differ from v2 literal SOURCE_PATHS inputs");
  const fullPathSet = new Set(compilerRows.map((candidate) => candidate.path as string));
  const v3Overlap = v3SubsetPaths.filter((candidate) => fullPathSet.has(candidate));
  const v3Only = v3SubsetPaths.filter((candidate) => !fullPathSet.has(candidate));
  const fullOnly = compilerRows.map((candidate) => candidate.path as string).filter((candidate) => !v3SubsetPaths.includes(candidate));
  assert.equal(v3Overlap.length, 29);
  assert.equal(v3Only.length, 3);
  assert(fullOnly.length > 0);
  assert.notDeepEqual([...v3SubsetPaths].sort(), compilerRows.map((candidate) => candidate.path).sort());
  const fullClosureHash = sha256(stableJson(compilerRows));
  const hiddenCompilerFileRows = v2LiteralSourceRows
    .filter((candidate) => !fullPathSet.has(candidate.path))
    .map((candidate) => ({ ...candidate, kind: "undeclared_literal_sourceClosure_file_input" }));
  assert.deepEqual(hiddenCompilerFileRows.map((candidate) => candidate.path), v3Only);
  const actualCompilerInputRows = [...compilerRows, ...hiddenCompilerFileRows]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  assert.equal(actualCompilerInputRows.length, 199);
  const actualCompilerInputHash = sha256(stableJson(actualCompilerInputRows));
  assert.notEqual(actualCompilerInputHash, fullClosureHash);
  const upstreamLiteralClosureHash = sha256(stableJson(v2LiteralSourceRows));
  const deletionResults = compilerRows.map((deleted, index) => ({
    deletedPath: deleted.path,
    rejectedByLength: compilerRows.length - 1 !== compilerRows.length,
    rejectedByHash: sha256(stableJson(compilerRows.filter((_, rowIndex) => rowIndex !== index))) !== fullClosureHash,
  }));
  assert(deletionResults.every((candidate) => candidate.rejectedByLength && candidate.rejectedByHash));
  const actualDeletionResults = actualCompilerInputRows.map((deleted, index) => ({
    deletedPath: deleted.path,
    rejectedByLength: actualCompilerInputRows.length - 1 !== actualCompilerInputRows.length,
    rejectedByHash: sha256(stableJson(actualCompilerInputRows.filter((_, rowIndex) => rowIndex !== index))) !== actualCompilerInputHash,
  }));
  assert(actualDeletionResults.every((candidate) => candidate.rejectedByLength && candidate.rejectedByHash));

  const live = computeClosure(LIVE_ENTRYPOINTS, "source");
  assert.deepEqual(live.unresolvedLocal, []);
  assert.deepEqual(live.nonliteral, []);
  const liveDataRows = [...LIVE_DATA].map((candidate) => row(candidate.path, candidate.kind));
  const liveRows = [...live.sourceRows, ...liveDataRows]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.kind < right.kind ? -1 : 1);
  const liveArtifactBytes = readFileSync(path.join(repoRoot, liveArtifactRelative));
  const liveArtifact = JSON.parse(liveArtifactBytes.toString("utf8")) as JsonObject;
  assert.deepEqual(live.sourceRows, liveArtifact.files.filter((candidate: JsonObject) => candidate.kind === "source"));
  assert.deepEqual(liveRows, liveArtifact.files);
  assert.equal(sha256(stableJson(liveRows)), liveArtifact.exactFileSetAndBytesSha256);
  const liveCore = { ...liveArtifact };
  delete liveCore.closureSemanticSha256;
  assert.equal(sha256(stableJson(liveCore)), liveArtifact.closureSemanticSha256);
  const liveSourcePaths = live.sourceRows.map((candidate) => candidate.path as string);
  assert.equal(liveSourcePaths.length, 8);
  assert.equal(liveDataRows.length, 3);
  assert.equal(liveRows.length, 11);
  assert(liveSourcePaths.every((candidate) => !/(?:test-support|offline\.test|verify|build-offline)/u.test(candidate)));

  const protocolBytes = readFileSync(path.join(repoRoot, targetProtocolRelative));
  const privateBytes = readFileSync(path.join(repoRoot, privateRelative));
  const publicBytes = readFileSync(path.join(repoRoot, publicRelative));
  const authorBytes = readFileSync(path.join(repoRoot, authorRelative));
  const protocol = JSON.parse(protocolBytes.toString("utf8")) as JsonObject;
  const privateArtifact = JSON.parse(privateBytes.toString("utf8")) as JsonObject;
  const publicArtifact = JSON.parse(publicBytes.toString("utf8")) as JsonObject;
  const author = JSON.parse(authorBytes.toString("utf8")) as JsonObject;
  const privateCore = { ...privateArtifact };
  delete privateCore.privateSemanticSha256;
  assert.equal(sha256(stableJson(privateCore)), privateArtifact.privateSemanticSha256);
  assert.equal(upstreamLiteralClosureHash, privateArtifact.productionCompilerAuthority.inheritedThirtyTwoRowClosureSha256);
  const v2PrivateForMutation = readJson(`${v2Relative}/private/exact-wire-v2.private.json`);
  const v2PrivateCoreForMutation = deepClone(v2PrivateForMutation);
  delete v2PrivateCoreForMutation.privateSemanticSha256;
  assert.deepEqual(v2PrivateCoreForMutation.sourceClosure, v2LiteralSourceRows);
  const hiddenInputMutationRegressions = hiddenCompilerFileRows.map((hidden) => {
    const mutatedSourceClosure = deepClone(v2LiteralSourceRows);
    const target = mutatedSourceClosure.find((candidate) => candidate.path === hidden.path)!;
    target.bytes += 1;
    target.sha256 = sha256(`independent-offline-mutation:${hidden.path}`);
    const mutatedUpstreamClosureHash = sha256(stableJson(mutatedSourceClosure));
    const mutatedV2Core = deepClone(v2PrivateCoreForMutation);
    mutatedV2Core.sourceClosure = mutatedSourceClosure;
    mutatedV2Core.sourceClosureSha256 = mutatedUpstreamClosureHash;
    const mutatedV2SemanticSha256 = sha256(stableJson(mutatedV2Core));
    const mutatedV4Core = deepClone(privateCore);
    mutatedV4Core.productionCompilerAuthority.inheritedThirtyTwoRowClosureSha256 = mutatedUpstreamClosureHash;
    mutatedV4Core.productionCompilerAuthority.upstreamPrivateSemanticSha256 = mutatedV2SemanticSha256;
    const mutatedV4SemanticSha256 = sha256(stableJson(mutatedV4Core));
    const result = {
      path: hidden.path,
      authorCompilerClosureCommitmentChanges: false,
      upstreamLiteralClosureCommitmentChanges: mutatedUpstreamClosureHash !== upstreamLiteralClosureHash,
      upstreamPrivateSemanticChanges: mutatedV2SemanticSha256 !== v2PrivateForMutation.privateSemanticSha256,
      v4PrivateSemanticChanges: mutatedV4SemanticSha256 !== privateArtifact.privateSemanticSha256,
    };
    assert.equal(result.authorCompilerClosureCommitmentChanges, false);
    assert.equal(result.upstreamLiteralClosureCommitmentChanges, true);
    assert.equal(result.upstreamPrivateSemanticChanges, true);
    assert.equal(result.v4PrivateSemanticChanges, true);
    return result;
  });
  const publicCore = { ...publicArtifact };
  delete publicCore.publicSemanticSha256;
  assert.equal(sha256(stableJson(publicCore)), publicArtifact.publicSemanticSha256);
  assert.equal(protocol.exactWireCommitment.privateArtifactSha256, sha256(privateBytes));
  assert.equal(protocol.exactWireCommitment.publicArtifactSha256, sha256(publicBytes));
  assert.equal(publicArtifact.privateArtifactSha256, sha256(privateBytes));
  assert.equal(protocol.compilerClosureContract.artifactSha256, sha256(compilerArtifactBytes));
  assert.equal(protocol.compilerClosureContract.semanticSha256, compilerArtifact.compilerClosureSemanticSha256);
  assert.equal(privateArtifact.productionCompilerClosureArtifactSha256, sha256(compilerArtifactBytes));
  assert.equal(privateArtifact.productionCompilerClosureSemanticSha256, compilerArtifact.compilerClosureSemanticSha256);
  assert.equal(privateArtifact.productionCompilerClosureSha256, compilerArtifact.exactCompilerClosureSetAndBytesSha256);
  assert.equal(publicArtifact.productionCompilerClosureArtifactSha256, sha256(compilerArtifactBytes));
  assert.equal(publicArtifact.productionCompilerClosureSemanticSha256, compilerArtifact.compilerClosureSemanticSha256);
  assert.equal(author.protocolSha256, sha256(protocolBytes));
  assert.equal(author.exactWirePrivateSha256, sha256(privateBytes));
  assert.equal(author.exactWirePublicSha256, sha256(publicBytes));
  assert.equal(author.compilerClosureSha256, sha256(compilerArtifactBytes));
  assert.equal(author.compilerClosureSemanticSha256, compilerArtifact.compilerClosureSemanticSha256);
  assert.equal(author.liveClosureSha256, sha256(liveArtifactBytes));
  assert.equal(author.liveClosureSemanticSha256, liveArtifact.closureSemanticSha256);
  assert.equal(author.exactCompilerSourceFiles, compiler.sourceRows.length);
  assert.equal(author.exactCompilerDeclaredDataInputs, compilerDataRows.length);
  assert.equal(author.exactCompilerClosureFiles, compilerRows.length);
  assert.equal(author.exactLiveClosureFiles, liveRows.length);

  const targetManifestRows = parseManifest(`${targetRelative}/MANIFEST.sha256`);
  const targetFilesWithoutManifest = walkFiles(targetRoot).filter((relative) => relative !== `${targetRelative}/MANIFEST.sha256`);
  assert.deepEqual(targetManifestRows.map((candidate) => candidate.path).sort(), targetFilesWithoutManifest);
  const v2ManifestRows = parseManifest(`${v2Relative}/MANIFEST.sha256`);
  const v3ManifestRows = parseManifest(`${v3Relative}/MANIFEST.sha256`);
  const v2ManifestHash = sha256(readFileSync(path.join(v2Root, "MANIFEST.sha256")));
  const v3ManifestHash = sha256(readFileSync(path.join(v3Root, "MANIFEST.sha256")));
  assert.equal(v2ManifestHash, "8234032c53b742648345c06020f37f3f069dd60d883cf490076cc5dde7c18ea2");
  assert.equal(v3ManifestHash, "f5baacde25a267e6a6413a5f21380f1ed735308b39213099393eab1d4c78b192");

  const bindings = semanticBindingAudit(privateArtifact, compilerRows);
  const parser = await parserAudit(privateArtifact);
  const costAccounting = await costAccountingFaultAudit(privateArtifact);
  const staticSafety = staticSafetyAudit(protocol, liveSourcePaths);
  const importTimeNetwork = await importTimeNetworkAudit();
  assert.equal(importTimeNetwork.totalAttempts, 0);

  const compilerEnvRefs = processEnvReferences(compilerSourcePaths);
  const liveEnvRefs = processEnvReferences(liveSourcePaths);
  const liveFsCalls = fsCalls(liveSourcePaths);
  const externalNetworkModules = compiler.externalSpecifiers.filter((specifier) => /^(?:node:)?(?:http|https|net|tls|dns)(?:\/|$)/u.test(specifier));
  assert.deepEqual(externalNetworkModules, []);

  const findings = [
    {
      id: "V4-CLOSURE-004",
      severity: "critical",
      blocker: true,
      title: "Claimed 192+4 compiler closure omits three literal file inputs read by the inherited compiler",
      where: `${v2Relative}/compile-exact-wire.mts:58`,
      evidence: {
        claimedRows: compilerRows.length,
        actualUniqueFileInputs: actualCompilerInputRows.length,
        omitted: hiddenCompilerFileRows.map((candidate) => candidate.path),
        mutationRegressions: hiddenInputMutationRegressions,
      },
      impact: "Each omitted byte input changes the inherited sourceClosure hash, inherited private semantic hash, and v4 private semantic artifact while the advertised compiler-closure commitment remains unchanged.",
    },
    {
      id: "V4-CLI-001",
      severity: "critical",
      blocker: true,
      title: "Price-snapshot live entrypoint bypasses the three authorization flags",
      where: `${targetRelative}/capture-price-snapshot.mts:42`,
      evidence: "The direct CLI guard invokes main(); main performs one models GET and two model-endpoint GETs without loading or checking protocol authorization. Static source has no authorization reference.",
      impact: "A direct command can cause three real external requests while liveExecutionAuthorized, hostileAuditPassed, and dispatchCommandPresent are all false.",
    },
    {
      id: "V4-PARSER-002",
      severity: "minor",
      blocker: false,
      title: "Defense-in-depth gap: parser ignores a coexisting message.tool_calls field",
      where: `${targetRelative}/response-parser.ts:130`,
      evidence: (parser.mismatches as JsonObject[]).filter((candidate) => String(candidate.id).endsWith("message-tool-calls-coexists")),
      impact: "The required finish_reason=tool_calls negative case is correctly rejected. This separate provider-envelope condition is outside the sealed content-schema contract, but exact message-envelope hardening would reject it explicitly.",
    },
    {
      id: "V4-LEDGER-003",
      severity: "major",
      blocker: false,
      title: "One post-reservation pre-try journal fault can leave a fail-closed global reservation unsettled",
      where: `${targetRelative}/production-runner.ts:501`,
      evidence: staticSafety.budgetStateMachine.synthesizedFaultConclusion,
      impact: "No network overrun occurs, but the global two-candidate reservation can be stranded and the private/global state pair is not durably coupled for that fault point.",
    },
    {
      id: "V4-COST-005",
      severity: "major",
      blocker: true,
      title: "Post-send failure paths can settle finite positive billed usage cost as zero",
      where: `${targetRelative}/production-runner.ts:446`,
      evidence: costAccounting.independentPureFaultFixtures,
      impact: "HTTP-status, response-parser, and cost-cap failures do not persist response usage evidence; the final global settlement aggregates only success evidence and state.actualCostUsd, underreporting already-sent/billed calls.",
    },
  ];
  const blockers = findings.filter((candidate) => candidate.blocker);
  const verdict = blockers.length === 0 ? "PASS" : "FAIL";
  const evidence: JsonObject = {
    schemaVersion: "question-quality-connectivity-pilot-v4-independent-audit-evidence-v1",
    generatedFromTargetBytesOnly: true,
    compilerClosure: {
      algorithm: "INDEPENDENT_TYPESCRIPT_RESOLVER_PLUS_AST_TRANSITIVE_V1",
      entrypoints: [COMPILER_ENTRYPOINT],
      sourceFiles: compiler.sourceRows.length,
      declaredDataInputs: compilerDataRows.length,
      totalFiles: compilerRows.length,
      sourceListSha256: sha256(`${compilerSourcePaths.join("\n")}\n`),
      exactSourceSetAndBytesSha256: sha256(stableJson(compiler.sourceRows)),
      exactDeclaredDataSetAndBytesSha256: sha256(stableJson(compilerDataRows)),
      exactClosureSetAndBytesSha256: fullClosureHash,
      artifactBytesSha256: sha256(compilerArtifactBytes),
      artifactSemanticSha256: compilerArtifact.compilerClosureSemanticSha256,
      astImportPlusDeclaredRowsEqualAuthorArtifact: true,
      actualFileInputClosureEqualAuthorArtifact: false,
      actualUniqueFileInputs: actualCompilerInputRows.length,
      actualFileInputListSha256: sha256(`${actualCompilerInputRows.map((candidate) => candidate.path).join("\n")}\n`),
      actualFileInputSetAndBytesSha256: actualCompilerInputHash,
      unresolvedLocalSpecifiers: compiler.unresolvedLocal,
      nonliteralDynamicLoads: compiler.nonliteral,
      importTypeSpecifiersObservedButNonRuntime: compiler.importTypeSpecifiers,
      externalSpecifiers: compiler.externalSpecifiers,
      externalNetworkTransportModules: externalNetworkModules,
      v3ThirtyTwoRowLegacyList: {
        rows: v3SubsetPaths.length,
        overlapWithExactClosure: v3Overlap.length,
        legacyOnlyRows: v3Only,
        exactClosureOnlyRows: fullOnly.length,
        rejectedByExactEquality: true,
        note: "The historical 32-row list is colloquially called a subset, but set comparison shows 29 overlapping rows and 3 legacy-only harness rows; it is decisively not the exact 196-row closure.",
      },
      oneRowDeletionTests: { attempted: deletionResults.length, rejected: deletionResults.filter((candidate) => candidate.rejectedByLength && candidate.rejectedByHash).length },
      actualFileInputOneRowDeletionTests: { attempted: actualDeletionResults.length, rejected: actualDeletionResults.filter((candidate) => candidate.rejectedByLength && candidate.rejectedByHash).length },
      fileSystemCalls: compilerFsCalls,
      dataReadSourceModules: compilerDataReadSourceModules,
      declaredDataPaths: [...DECLARED_COMPILER_DATA],
      literalSourcePathsRows: v2LiteralSourceRows,
      hiddenFileDataInputsDetected: hiddenCompilerFileRows,
      hiddenInputMutationRegressions,
      externalProcessInputs: [{ command: "git rev-parse HEAD", classification: "declared provenance label input; affects artifact gitVersion but not sealed body bytes" }],
      environmentReferences: compilerEnvRefs,
    },
    liveClosure: {
      algorithm: "INDEPENDENT_TYPESCRIPT_RESOLVER_PLUS_AST_TRANSITIVE_RUNTIME_V1",
      entrypoints: [...LIVE_ENTRYPOINTS],
      sourceFiles: live.sourceRows.length,
      runtimeDataFiles: liveDataRows.length,
      totalFiles: liveRows.length,
      sourceListSha256: sha256(`${liveSourcePaths.join("\n")}\n`),
      exactSetAndBytesSha256: sha256(stableJson(liveRows)),
      artifactBytesSha256: sha256(liveArtifactBytes),
      artifactSemanticSha256: liveArtifact.closureSemanticSha256,
      authorExactEquality: true,
      excludedTestSupportVerifyOfflineFiles: true,
      runtimeData: liveDataRows,
      fileSystemCalls: liveFsCalls,
      environmentReferences: liveEnvRefs,
      dynamicContracts: {
        priceSnapshotPath: "argv path constrained under v4/private; strict content hash/schema/freshness",
        secretSource: ".env.local stream, not opened by this audit",
        clock: "Date.now/new Date used for price freshness, journal timestamps, and ledger timestamps",
        processArguments: "runId, price snapshot path, and capture output path",
        mutableOutput: "global ledger transaction plus exclusive private run files",
      },
    },
    artifactBindings: {
      protocolBytesSha256: sha256(protocolBytes),
      privateBytesSha256: sha256(privateBytes),
      privateSemanticSha256: privateArtifact.privateSemanticSha256,
      publicBytesSha256: sha256(publicBytes),
      publicSemanticSha256: publicArtifact.publicSemanticSha256,
      compilerArtifactBytesSha256: sha256(compilerArtifactBytes),
      compilerArtifactSemanticSha256: compilerArtifact.compilerClosureSemanticSha256,
      liveArtifactBytesSha256: sha256(liveArtifactBytes),
      liveArtifactSemanticSha256: liveArtifact.closureSemanticSha256,
      authorReportBytesSha256: sha256(authorBytes),
      allCrossBindingsValid: true,
      wireSemanticBindings: bindings,
    },
    manifests: {
      targetRows: targetManifestRows.length,
      targetExactCoverage: true,
      v2Rows: v2ManifestRows.length,
      v3Rows: v3ManifestRows.length,
      v2ManifestSha256: v2ManifestHash,
      v3ManifestSha256: v3ManifestHash,
      v2MatchesPriorIndependentAuditBaseline: true,
      v3MatchesPriorIndependentAuditBaseline: true,
      everyV2V3ManifestRowMatchesCurrentBytes: true,
    },
    responseParser: parser,
    costAccountingFaults: costAccounting,
    safetyBoundary: staticSafety,
    importTimeNetworkDenySentinel: importTimeNetwork,
    findings,
    activity: {
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      apiCandidatesConsumed: 0,
      productionDatabaseCalls: 0,
      browserCalls: 0,
      realCredentialValuesRead: 0,
      environmentFileContentsRead: 0,
      globalLedgerReservationMutations: 0,
      liveExecutionAuthorizedOrPerformed: false,
    },
  };
  const report: JsonObject = {
    schemaVersion: "question-quality-connectivity-pilot-v4-independent-hostile-audit-report-v1",
    target: targetRelative,
    verdict,
    highestBlockerSeverity: blockers.some((candidate) => candidate.severity === "critical") ? "critical" : blockers.length ? "major" : "none",
    scope: "OFFLINE_STRUCTURE_ONLY",
    liveDisposition: "offline structure only; separate authorized version required",
    authorClaimsTreatedAsAuthority: false,
    independentlyComputed: {
      compilerClosure: {
        astSource: compiler.sourceRows.length,
        declaredData: compilerDataRows.length,
        advertisedTotal: compilerRows.length,
        literalReadInputsMissingFromAdvertisedClosure: hiddenCompilerFileRows.length,
        actualUniqueFileInputs: actualCompilerInputRows.length,
        exactEquality: false,
      },
      liveClosure: { source: live.sourceRows.length, runtimeData: liveDataRows.length, total: liveRows.length, exactEquality: true },
      semanticAndByteBindings: true,
      v2V3BytePreservation: true,
      parserCases: parser.totalCases,
    },
    blockers,
    nonblockingFindings: findings.filter((candidate) => !candidate.blocker),
    sourceListHashes: {
      compilerSourceListSha256: evidence.compilerClosure.sourceListSha256,
      compilerExactClosureSetAndBytesSha256: fullClosureHash,
      actualCompilerFileInputListSha256: evidence.compilerClosure.actualFileInputListSha256,
      actualCompilerFileInputSetAndBytesSha256: actualCompilerInputHash,
      liveSourceListSha256: evidence.liveClosure.sourceListSha256,
      liveExactSetAndBytesSha256: evidence.liveClosure.exactSetAndBytesSha256,
      targetManifestSha256: sha256(readFileSync(path.join(targetRoot, "MANIFEST.sha256"))),
      v2ManifestSha256: v2ManifestHash,
      v3ManifestSha256: v3ManifestHash,
    },
    activity: evidence.activity,
    qualifications: [
      "No quality, reliability, or comparative-performance conclusion follows from two sealed connectivity rows.",
      "No live call, public metadata capture, credential read, database access, browser access, or ledger mutation was authorized or performed.",
      "A PASS was not issued because the actual compiler file-input closure is incomplete, the price-capture CLI bypasses authorization, and post-send failure costs can be settled as zero.",
    ],
  };
  return { evidence, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { evidence, report } = await runIndependentAudit();
  process.stdout.write(`${JSON.stringify({ verdict: report.verdict, blockers: report.blockers, activity: evidence.activity }, null, 2)}\n`);
}
