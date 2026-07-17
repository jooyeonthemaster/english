import { createHash } from "node:crypto";
import { posix as pathPosix } from "node:path";
import { TextDecoder } from "node:util";
import ts from "typescript";

export const LOCAL_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".sass",
  ".sql",
  ".prisma",
];

const UTF8_FATAL = new TextDecoder("utf-8", { fatal: true });

export function sha1(value) {
  return createHash("sha1").update(value).digest("hex");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

export function stableJson(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

export function decodeUtf8(raw) {
  try {
    return UTF8_FATAL.decode(raw);
  } catch {
    return null;
  }
}

export function eolVariants(raw) {
  const text = decodeUtf8(raw);
  if (text === null) return [{ variant: "raw", bytes: raw }];
  const lfText = text.replace(/\r\n/g, "\n");
  const lf = Buffer.from(lfText, "utf8");
  const crlf = Buffer.from(lfText.replace(/\n/g, "\r\n"), "utf8");
  const variants = [
    { variant: "raw", bytes: raw },
    { variant: "lf", bytes: lf },
    { variant: "crlf", bytes: crlf },
  ];
  const seen = new Set();
  return variants.filter(({ bytes }) => {
    const digest = sha256(bytes);
    if (seen.has(digest)) return false;
    seen.add(digest);
    return true;
  });
}

function scriptKindFor(localPath) {
  if (localPath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (localPath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (localPath.endsWith(".js") || localPath.endsWith(".mjs")) {
    return ts.ScriptKind.JS;
  }
  if (localPath.endsWith(".json")) return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
}

function isSourceLike(localPath) {
  return /\.(?:[cm]?[jt]sx?)$/i.test(localPath);
}

function staticString(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function locationOf(sourceFile, node) {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: location.line + 1, column: location.character + 1 };
}

function isImportMetaUrl(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "url" &&
    node.expression.kind === ts.SyntaxKind.MetaProperty
  );
}

function moduleReferenceKind(specifier) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return "relative-local";
  }
  if (specifier.startsWith("@/")) return "alias-local";
  if (specifier.startsWith("/")) return "absolute-unsupported";
  return "external";
}

export function collectFileFacts(localPath, raw) {
  const text = decodeUtf8(raw);
  const base = {
    localPath,
    rawSha1: sha1(raw),
    rawSha256: sha256(raw),
    byteLength: raw.length,
    utf8: text !== null,
    parseState: "not-source",
    parseDiagnostics: [],
    moduleReferences: [],
    computedReferences: [],
    environmentNames: [],
  };
  if (text === null || !isSourceLike(localPath)) return base;

  const sourceFile = ts.createSourceFile(
    localPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(localPath),
  );
  const moduleReferences = [];
  const computedReferences = [];
  const environmentNames = new Set();

  function addModule(node, specifier, kind, typeOnly = false) {
    moduleReferences.push({
      kind,
      locality: moduleReferenceKind(specifier),
      specifier,
      typeOnly,
      ...locationOf(sourceFile, node),
    });
  }

  function addComputed(node, kind, expression) {
    const expressionText = expression.getText(sourceFile);
    computedReferences.push({
      kind,
      expressionKind: ts.SyntaxKind[expression.kind],
      expressionSha256: sha256(Buffer.from(expressionText, "utf8")),
      ...locationOf(sourceFile, node),
    });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      const specifier = staticString(node.moduleSpecifier);
      if (specifier !== null) {
        const typeOnly = Boolean(node.importClause?.isTypeOnly);
        addModule(node.moduleSpecifier, specifier, "import", typeOnly);
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const specifier = staticString(node.moduleSpecifier);
      if (specifier !== null) {
        addModule(node.moduleSpecifier, specifier, "export", node.isTypeOnly);
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    ) {
      const specifier = staticString(node.moduleReference.expression);
      if (specifier !== null) {
        addModule(
          node.moduleReference.expression,
          specifier,
          "import-equals",
          node.isTypeOnly,
        );
      }
    } else if (ts.isCallExpression(node)) {
      let kind = null;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) kind = "import-call";
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        kind = "require-call";
      }
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "require" &&
        node.expression.name.text === "resolve"
      ) {
        kind = "require-resolve";
      }
      if (kind && node.arguments.length > 0) {
        const specifier = staticString(node.arguments[0]);
        if (specifier !== null) addModule(node.arguments[0], specifier, kind);
        else addComputed(node, kind, node.arguments[0]);
      }
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "URL" &&
      node.arguments?.length === 2 &&
      isImportMetaUrl(node.arguments[1])
    ) {
      const specifier = staticString(node.arguments[0]);
      if (specifier !== null) addModule(node.arguments[0], specifier, "asset-url");
      else addComputed(node, "asset-url", node.arguments[0]);
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "process" &&
      node.expression.name.text === "env"
    ) {
      environmentNames.add(node.name.text);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "process" &&
      node.expression.name.text === "env" &&
      node.argumentExpression
    ) {
      const name = staticString(node.argumentExpression);
      if (name !== null) environmentNames.add(name);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const parseDiagnostics = sourceFile.parseDiagnostics.map((diagnostic) => {
    const start = diagnostic.start ?? 0;
    const location = sourceFile.getLineAndCharacterOfPosition(start);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    return {
      code: diagnostic.code,
      category: ts.DiagnosticCategory[diagnostic.category],
      line: location.line + 1,
      column: location.character + 1,
      messageSha256: sha256(Buffer.from(message, "utf8")),
    };
  });

  return {
    ...base,
    parseState: parseDiagnostics.length > 0 ? "parsed-with-diagnostics" : "parsed",
    parseDiagnostics,
    moduleReferences: moduleReferences.sort(referenceSort),
    computedReferences: computedReferences.sort(referenceSort),
    environmentNames: [...environmentNames].sort(),
  };
}

function referenceSort(a, b) {
  return (
    (a.line ?? 0) - (b.line ?? 0) ||
    (a.column ?? 0) - (b.column ?? 0) ||
    String(a.kind).localeCompare(String(b.kind)) ||
    String(a.specifier ?? a.expressionSha256).localeCompare(
      String(b.specifier ?? b.expressionSha256),
    )
  );
}

export function localResolutionCandidates(importer, specifier) {
  const withoutQuery = specifier.replace(/[?#].*$/, "");
  let base;
  if (withoutQuery.startsWith("@/")) {
    base = pathPosix.normalize(`src/${withoutQuery.slice(2)}`);
  } else if (withoutQuery.startsWith("./") || withoutQuery.startsWith("../")) {
    base = pathPosix.normalize(
      pathPosix.join(pathPosix.dirname(importer), withoutQuery),
    );
  } else {
    return [];
  }
  if (base === ".." || base.startsWith("../") || pathPosix.isAbsolute(base)) {
    return [];
  }
  const candidates = [base];
  for (const extension of LOCAL_EXTENSIONS) candidates.push(`${base}${extension}`);
  for (const extension of LOCAL_EXTENSIONS) {
    candidates.push(pathPosix.join(base, `index${extension}`));
  }
  return [...new Set(candidates)];
}

export function resolveLocalReference(importer, specifier, sourcePathSet) {
  const candidates = localResolutionCandidates(importer, specifier);
  const matches = candidates.filter((candidate) => sourcePathSet.has(candidate));
  return { candidates, matches, resolved: matches[0] ?? null };
}

export async function buildStaticClosure({ roots, sourceRows, readRaw }) {
  const sourceByPath = new Map(sourceRows.map((row) => [row.localPath, row]));
  const sourcePathSet = new Set(sourceByPath.keys());
  for (const root of roots) {
    if (!sourcePathSet.has(root.localPath)) {
      throw new Error(`closure root is absent from deployment source: ${root.localPath}`);
    }
  }

  const queue = roots.map((root) => root.localPath);
  const factsByPath = new Map();
  const edges = [];
  const unresolvedStatic = [];
  const externalReferences = [];
  const computedReferences = [];

  while (queue.length > 0) {
    const localPath = queue.shift();
    if (factsByPath.has(localPath)) continue;
    const sourceRow = sourceByPath.get(localPath);
    if (!sourceRow) throw new Error(`source index lost closure file: ${localPath}`);
    const raw = await readRaw(sourceRow);
    const facts = collectFileFacts(localPath, raw);
    factsByPath.set(localPath, facts);

    for (const reference of facts.moduleReferences) {
      const common = {
        importer: localPath,
        kind: reference.kind,
        line: reference.line,
        column: reference.column,
        specifier: reference.specifier,
        typeOnly: reference.typeOnly,
      };
      if (
        reference.locality === "relative-local" ||
        reference.locality === "alias-local"
      ) {
        const resolution = resolveLocalReference(
          localPath,
          reference.specifier,
          sourcePathSet,
        );
        if (resolution.resolved) {
          edges.push({
            ...common,
            resolved: resolution.resolved,
            ambiguityCount: resolution.matches.length,
          });
          if (!factsByPath.has(resolution.resolved)) queue.push(resolution.resolved);
        } else {
          unresolvedStatic.push({
            ...common,
            candidateCount: resolution.candidates.length,
            candidateSetSha256: sha256(
              Buffer.from(stableJson(resolution.candidates), "utf8"),
            ),
          });
        }
      } else {
        externalReferences.push({ ...common, locality: reference.locality });
      }
    }
    for (const reference of facts.computedReferences) {
      computedReferences.push({ importer: localPath, ...reference });
    }
  }

  const sortedEdges = edges.sort(edgeSort);
  const files = [...factsByPath.keys()].sort();
  const adjacency = new Map(files.map((file) => [file, []]));
  for (const edge of sortedEdges) adjacency.get(edge.importer)?.push(edge.resolved);
  const reachableFrom = new Map(files.map((file) => [file, []]));
  for (const root of roots) {
    const seen = new Set();
    const pending = [root.localPath];
    while (pending.length > 0) {
      const file = pending.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      reachableFrom.get(file)?.push(root.id);
      for (const target of adjacency.get(file) ?? []) pending.push(target);
    }
  }

  return {
    files,
    factsByPath,
    edges: sortedEdges,
    unresolvedStatic: unresolvedStatic.sort(edgeSort),
    externalReferences: externalReferences.sort(edgeSort),
    computedReferences: computedReferences.sort(referenceSort),
    reachableFrom: Object.fromEntries(
      [...reachableFrom.entries()].map(([file, rootIds]) => [
        file,
        [...new Set(rootIds)].sort(),
      ]),
    ),
  };
}

function edgeSort(a, b) {
  return (
    a.importer.localeCompare(b.importer) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    (a.column ?? 0) - (b.column ?? 0) ||
    String(a.kind).localeCompare(String(b.kind)) ||
    String(a.specifier).localeCompare(String(b.specifier)) ||
    String(a.resolved ?? "").localeCompare(String(b.resolved ?? ""))
  );
}

const SECRET_PATTERNS = [
  {
    id: "google-api-key",
    source: "\\bAIza[0-9A-Za-z_-]{35}\\b",
    flags: "g",
  },
  {
    id: "openai-style-key",
    source: "\\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\\b",
    flags: "g",
  },
  {
    id: "anthropic-key",
    source: "\\bsk-ant-[A-Za-z0-9_-]{20,}\\b",
    flags: "g",
  },
  {
    id: "github-token",
    source: "\\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\\b",
    flags: "g",
  },
  {
    id: "trigger-secret-key",
    source: "\\btr_(?:prod|dev|stg|preview)_[A-Za-z0-9_-]{8,}\\b",
    flags: "gi",
  },
  {
    id: "jwt",
    source:
      "\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\b",
    flags: "g",
  },
  {
    id: "private-key-header",
    source: "-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    flags: "g",
  },
  {
    id: "credentialed-url",
    source:
      "\\b(?:postgres(?:ql)?|mysql|mongodb(?:\\+srv)?|redis):\\/\\/[^\\s:@/]{1,128}:[^\\s@/]{1,256}@",
    flags: "gi",
  },
  {
    id: "named-secret-literal",
    source:
      "(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|password|private[_-]?key)\\s*[:=]\\s*[\\\"'`](.{8,512}?)[\\\"'`]",
    flags: "gi",
  },
];

export function scanSecretPatterns(raw) {
  const text = decodeUtf8(raw);
  if (text === null) return [];
  const results = [];
  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const hashes = [];
    let count = 0;
    for (const match of text.matchAll(regex)) {
      count += 1;
      hashes.push(sha256(Buffer.from(match[0], "utf8")));
      if (count > 10_000) throw new Error(`secret scanner runaway: ${pattern.id}`);
    }
    if (count > 0) {
      results.push({
        patternId: pattern.id,
        count,
        uniqueMatchSha256: [...new Set(hashes)].sort(),
      });
    }
  }
  return results;
}

export function aggregateSecretInventory(files) {
  const aggregate = new Map();
  for (const file of files) {
    for (const match of file.matches) {
      const row = aggregate.get(match.patternId) ?? {
        patternId: match.patternId,
        count: 0,
        fileCount: 0,
        hashes: new Set(),
      };
      row.count += match.count;
      row.fileCount += 1;
      for (const digest of match.uniqueMatchSha256) row.hashes.add(digest);
      aggregate.set(match.patternId, row);
    }
  }
  return [...aggregate.values()]
    .map((row) => ({
      patternId: row.patternId,
      count: row.count,
      fileCount: row.fileCount,
      uniqueMatchSha256: [...row.hashes].sort(),
    }))
    .sort((a, b) => a.patternId.localeCompare(b.patternId));
}

