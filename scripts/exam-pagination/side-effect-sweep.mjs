#!/usr/bin/env node
// ============================================================================
// 부작용 GET 스윕(정적) — 「GET 은 읽기」라는 쓰기 가드의 전제를 코드로 확인한다(26-09-30 COH-4 · GPE-3).
//
//   node scripts/exam-pagination/side-effect-sweep.mjs [--json <out>] [--all]      (cwd = 저장소 루트)
//     src/app 의 모든 route.ts GET/HEAD(+ 메타데이터 경로) · 하네스가 여는 화면(page + 조상 layout + src/proxy.ts) ·
//     읽기 전용 서버 액션(write-guard READ_ONLY_ACTIONS)에서 **함수 단위로** 도달 가능한 코드를 따라가
//     쓰기(prisma 모델 create/update/upsert/delete*, $executeRaw*, 쓰기 SQL 을 담은 $queryRaw, supabase
//     insert/upsert/update/delete · storage upload/remove, fs 쓰기, 외부 fetch POST)를 찾는다.
//   --all 은 부작용 GET 전체 목록을 사람이 읽게 찍는다. 자가 시험(write-guard.mjs)이 sweepSideEffects() 를 불러
//   허용 목록(get-policy.mjs)이 부작용 0 인지 · 부작용 GET 이 전부 막히는지 매번 대조한다.
//
// 방법(타입 검사기 없이 TypeScript 파서만): 모듈마다 최상위 선언 · import · export 를 모으고, 뿌리 심볼의 선언
//   본문에서 참조한 식별자를 같은 파일 선언 · import(→ 해석한 모듈의 export)로 따라간다. "use client" 모듈에서 멈춘다
//   (클라이언트 코드는 서버에서 쓰지 못한다 — 그 코드가 부르는 서버 액션은 POST 라 네트워크 층의 액션 허용 목록이 맡는다).
//   과대 근사다(파라미터 이름이 최상위 이름과 같으면 따라간다 · 객체 리터럴은 통째로 본다). 과소 근사 구멍:
//   동적 디스패치(문자열로 고른 함수) · node_modules 안의 쓰기 · eval. 그래서 가드는 허용 목록 밖을 **기본 거부**한다.
// ============================================================================
import ts from "typescript";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { routePatternSource, samplePath } from "./get-policy.mjs";

const EXTS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".jsx"];
const PRISMA_WRITE_OPS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);
const RAW_WRITE_SQL = /\b(?:INSERT\s+INTO|DELETE\s+FROM|TRUNCATE|MERGE\s+INTO)\b|(?<!\bFOR\s+(?:NO\s+KEY\s+)?)\bUPDATE\s+"?[A-Za-z_]/i;
const FS_WRITE = new Set(["writeFile", "writeFileSync", "appendFile", "appendFileSync", "mkdir", "mkdirSync", "rm", "rmSync", "unlink", "unlinkSync", "rename", "renameSync", "copyFile", "copyFileSync", "createWriteStream"]);
const FS_MODULES = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises"]);
/** 과금 · 저장 부작용 종류. info 는 판정에 넣지 않는다(외부 POST 는 DB 가 아니지만 목록에는 싣는다). */
export const SIDE_EFFECT_KINDS = Object.freeze({ db: "write", "db-raw": "write", supabase: "write", storage: "write", fs: "write", "external-post": "external" });

/**
 * 검토된 하위 트리 건너뛰기 — 선언 안의 특정 속성(메서드)만 GET 경로에서 돌지 않음이 확인된 경우.
 * 사유를 반드시 적고, 보고서에 그대로 싣는다.
 */
export const SKIP_SUBTREES = Object.freeze([
  {
    file: "src/lib/auth.ts",
    property: "authorize",
    reason: "NextAuth Credentials authorize()(staff.update lastLoginAt · logAppEvent LOGIN)는 POST /api/auth/callback/<id> 에서만 돈다. provider 는 Credentials 둘뿐이라 GET 콜백이 없다",
  },
]);

function lowerFirst(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

/** prisma/schema.prisma 의 모델 → 클라이언트 위임 이름(appEvent · creditTransaction …) */
export function prismaDelegates(schemaText) {
  return new Set([...schemaText.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => lowerFirst(m[1])));
}

function bindingNames(name) {
  if (ts.isIdentifier(name)) return [name.text];
  const out = [];
  for (const el of name.elements) if (!ts.isOmittedExpression(el)) out.push(...bindingNames(el.name));
  return out;
}
const hasMod = (node, kind) => !!node.modifiers?.some((m) => m.kind === kind);

/** 프로젝트: 파일 읽기 · 모듈 해석 · 파싱 캐시. files(Map 상대경로 → 소스)를 주면 가상 파일계(자가 시험 픽스처). */
export function createProject({ root = process.cwd(), files = null, delegates = null } = {}) {
  const cache = new Map();
  const norm = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "");
  const exists = (rel) => (files ? files.has(rel) : existsSync(path.join(root, rel)) && statSync(path.join(root, rel)).isFile());
  const read = (rel) => (files ? files.get(rel) ?? null : readFileSync(path.join(root, rel), "utf8"));
  const models = delegates ?? prismaDelegates(files?.get("prisma/schema.prisma") ?? readFileSync(path.join(root, "prisma/schema.prisma"), "utf8"));

  function resolve(fromRel, spec) {
    let base;
    if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
    else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
    else return null; // 패키지(node_modules) — 따라가지 않는다
    const stem = base.replace(/\.(m?js|jsx)$/, "");
    for (const cand of [base, ...EXTS.map((e) => stem + e), ...EXTS.map((e) => `${base}/index${e}`)]) if (exists(cand)) return norm(cand);
    return null;
  }

  function parse(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const source = exists(rel) ? read(rel) : null;
    if (source == null) { cache.set(rel, null); return null; }
    const kind = /\.tsx$/.test(rel) ? ts.ScriptKind.TSX : /\.(m?js|jsx)$/.test(rel) ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, kind);
    const mod = { rel, sf, directive: null, decls: new Map(), imports: new Map(), exports: new Map(), stars: [], init: [], sideImports: [] };
    for (const st of sf.statements) {
      if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
        if (st.expression.text === "use client" || st.expression.text === "use server") mod.directive = st.expression.text;
        continue;
      }
      break;
    }
    const addDecl = (name, node) => { if (!mod.decls.has(name)) mod.decls.set(name, []); mod.decls.get(name).push(node); };
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st)) {
        const spec = st.moduleSpecifier.text;
        const clause = st.importClause;
        if (!clause) { mod.sideImports.push(spec); continue; }
        if (clause.isTypeOnly) continue;
        if (clause.name) mod.imports.set(clause.name.text, { spec, name: "default" });
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) mod.imports.set(nb.name.text, { spec, name: "*" });
        if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) mod.imports.set(el.name.text, { spec, name: (el.propertyName ?? el.name).text });
      } else if (ts.isExportDeclaration(st)) {
        if (st.isTypeOnly) continue;
        const spec = st.moduleSpecifier ? st.moduleSpecifier.text : null;
        if (!st.exportClause) { if (spec) mod.stars.push(spec); continue; }
        if (ts.isNamespaceExport(st.exportClause)) { mod.exports.set(st.exportClause.name.text, { spec, name: "*" }); continue; }
        for (const el of st.exportClause.elements) {
          if (el.isTypeOnly) continue;
          const local = (el.propertyName ?? el.name).text;
          mod.exports.set(el.name.text, spec ? { spec, name: local } : { local });
        }
      } else if (ts.isExportAssignment(st)) {
        addDecl("default", st.expression);
        mod.exports.set("default", { local: "default" });
      } else if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) {
        const isDefault = hasMod(st, ts.SyntaxKind.DefaultKeyword);
        const name = st.name?.text ?? (isDefault ? "default" : null);
        if (!name || (ts.isFunctionDeclaration(st) && !st.body && !st.name)) continue;
        addDecl(name, st);
        if (hasMod(st, ts.SyntaxKind.ExportKeyword)) mod.exports.set(isDefault ? "default" : name, { local: name });
      } else if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          for (const name of bindingNames(d.name)) {
            addDecl(name, d);
            if (hasMod(st, ts.SyntaxKind.ExportKeyword)) mod.exports.set(name, { local: name });
          }
        }
      } else if (!ts.isInterfaceDeclaration(st) && !ts.isTypeAliasDeclaration(st) && !ts.isEnumDeclaration(st) && !ts.isModuleDeclaration(st)) {
        mod.init.push(st); // 모듈 최상위 실행문(가져오는 순간 돈다)
      }
    }
    cache.set(rel, mod);
    return mod;
  }
  return { root, parse, resolve, models, exists, files };
}

// ── 노드 안의 쓰기 · 참조 ─────────────────────────────────────────────────────────────
const skipper = (mod) => {
  const props = SKIP_SUBTREES.filter((s) => s.file === mod.rel).map((s) => s.property);
  return (n) => props.length > 0 && (ts.isPropertyAssignment(n) || ts.isMethodDeclaration(n)) && n.name && ts.isIdentifier(n.name) && props.includes(n.name.text);
};
const isTypeish = (n) => ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeParameterDeclaration(n) || ts.isHeritageClause(n);
function sqlText(node) {
  if (!node) return "";
  if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ? ");
  return "";
}
function chainHasCall(expr, name) {
  for (let e = expr; e; ) {
    if (ts.isCallExpression(e)) { if (ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === name) return true; e = e.expression; }
    else if (ts.isPropertyAccessExpression(e)) e = e.expression;
    else return false;
  }
  return false;
}
function fetchMethod(call) {
  const init = call.arguments[1];
  if (!init || !ts.isObjectLiteralExpression(init)) return null;
  const m = init.properties.find((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "method");
  return m && ts.isStringLiteralLike(m.initializer) ? m.initializer.text.toUpperCase() : null;
}

/** 노드 하나를 훑어 쓰기 지점과 참조를 모은다(노드별 캐시 — 여러 뿌리가 같은 함수를 지난다). */
const scanCache = new WeakMap();
function scanNode(project, mod, node) {
  if (scanCache.has(node)) return scanCache.get(node);
  const result = scanNodeUncached(project, mod, node);
  scanCache.set(node, result);
  return result;
}
function scanNodeUncached(project, mod, node) {
  const writes = [];
  const refs = new Set();
  const ns = [];
  const dyn = [];
  const skip = skipper(mod);
  const hit = (n, kind, what) => {
    const { line } = mod.sf.getLineAndCharacterOfPosition(n.getStart(mod.sf));
    writes.push({ file: mod.rel, line: line + 1, kind, what, text: n.getText(mod.sf).replace(/\s+/g, " ").slice(0, 90) });
  };
  const walk = (n) => {
    if (isTypeish(n) || skip(n)) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) { const a = n.arguments[0]; if (a && ts.isStringLiteralLike(a)) dyn.push(a.text); }
      if (ts.isIdentifier(callee) && callee.text === "require") { const a = n.arguments[0]; if (a && ts.isStringLiteralLike(a)) dyn.push(a.text); }
      if (ts.isPropertyAccessExpression(callee)) {
        const op = callee.name.text;
        const recv = callee.expression;
        if (PRISMA_WRITE_OPS.has(op) && ts.isPropertyAccessExpression(recv) && project.models.has(recv.name.text)) hit(n, "db", `${recv.name.text}.${op}`);
        else if (op === "$executeRaw" || op === "$executeRawUnsafe") hit(n, "db-raw", op);
        else if ((op === "$queryRaw" || op === "$queryRawUnsafe") && RAW_WRITE_SQL.test(sqlText(n.arguments[0]))) hit(n, "db-raw", `${op}(쓰기 SQL)`);
        else if (["insert", "upsert", "update", "delete"].includes(op) && chainHasCall(recv, "from") && !/\bstorage\b/.test(recv.getText(mod.sf))) hit(n, "supabase", op);
        else if (["upload", "remove", "move", "copy", "update"].includes(op) && chainHasCall(recv, "from") && /\bstorage\b/.test(recv.getText(mod.sf))) hit(n, "storage", op);
        else if (FS_WRITE.has(op) && ts.isIdentifier(recv) && (/^(fs|fsp|fsPromises|promises)$/.test(recv.text) || FS_MODULES.has(mod.imports.get(recv.text)?.spec))) hit(n, "fs", op);
      } else if (ts.isIdentifier(callee)) {
        const imp = mod.imports.get(callee.text);
        if (FS_WRITE.has(callee.text) && imp && FS_MODULES.has(imp.spec)) hit(n, "fs", callee.text);
        if (callee.text === "fetch") { const m = fetchMethod(n); if (m && m !== "GET" && m !== "HEAD") hit(n, "external-post", `fetch ${m}`); }
      }
    }
    if (ts.isTaggedTemplateExpression(n) && ts.isPropertyAccessExpression(n.tag)) {
      const op = n.tag.name.text;
      if (op === "$executeRaw" || op === "$executeRawUnsafe") hit(n, "db-raw", op);
      else if (op === "$queryRaw" && RAW_WRITE_SQL.test(sqlText(n.template))) hit(n, "db-raw", "$queryRaw(쓰기 SQL)");
    }
    if (ts.isPropertyAccessExpression(n)) {
      if (ts.isIdentifier(n.expression)) { const imp = mod.imports.get(n.expression.text); if (imp?.name === "*") ns.push({ spec: imp.spec, name: n.name.text }); }
      walk(n.expression);
      return;
    }
    if (ts.isPropertyAssignment(n)) { if (ts.isComputedPropertyName(n.name)) walk(n.name); walk(n.initializer); return; }
    if (ts.isShorthandPropertyAssignment(n)) { refs.add(n.name.text); return; }
    if (ts.isIdentifier(n)) { refs.add(n.text); return; }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return { writes, refs, ns, dyn };
}

// ── 도달 가능성(뿌리 → 쓰기) ─────────────────────────────────────────────────────────
/**
 * 뿌리 심볼들에서 도달 가능한 쓰기. roots: [{file, symbol}] (symbol "*" = 모듈 전체).
 * 반환: {writes:[{…, chain}], clientStops, externals, visited}
 */
export function reach(project, roots) {
  const seen = new Set();
  const parent = new Map();
  const queue = [];
  const writes = [];
  const clientStops = new Set();
  const externals = new Set();
  const initDone = new Set();
  const push = (rel, name, from) => {
    if (!rel) return;
    const key = `${rel}#${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    parent.set(key, from);
    queue.push({ rel, name, key });
  };
  const chainOf = (key) => { const out = []; for (let k = key; k; k = parent.get(k)) out.unshift(k); return out; };
  const follow = (mod, spec, name, from) => {
    const target = project.resolve(mod.rel, spec);
    if (!target) { externals.add(spec); return; }
    push(target, name, from);
  };
  const scanInto = (mod, node, key) => {
    const r = scanNode(project, mod, node);
    for (const w of r.writes) writes.push({ ...w, chain: chainOf(key) });
    for (const id of r.refs) {
      if (mod.decls.has(id)) push(mod.rel, id, key);
      else if (mod.imports.has(id)) { const imp = mod.imports.get(id); follow(mod, imp.spec, imp.name, key); }
    }
    for (const x of r.ns) follow(mod, x.spec, x.name, key);
    for (const spec of r.dyn) follow(mod, spec, "*", key);
  };
  // 뿌리가 가리키는 심볼이 없으면(이름이 바뀜 · 파일 이동) 「깨끗함」으로 읽히지 않게 따로 적는다
  const missingRoots = roots.filter((r) => {
    const mod = project.parse(r.file);
    return !mod || (r.symbol !== "*" && !mod.decls.has(r.symbol) && !mod.exports.has(r.symbol) && !mod.imports.has(r.symbol) && mod.stars.length === 0);
  }).map((r) => `${r.file}#${r.symbol}`);
  for (const r of roots) push(r.file, r.symbol, null);
  while (queue.length) {
    const { rel, name, key } = queue.shift();
    const mod = project.parse(rel);
    if (!mod) continue;
    if (mod.directive === "use client") { clientStops.add(rel); continue; }
    if (!initDone.has(rel)) {
      initDone.add(rel);
      const initKey = `${rel}#<init>`;
      parent.set(initKey, key);
      for (const st of mod.init) scanInto(mod, st, initKey);
      for (const spec of mod.sideImports) follow(mod, spec, "*", initKey);
    }
    if (name === "*") {
      for (const exp of mod.exports.keys()) push(rel, exp, key);
      for (const spec of mod.stars) follow(mod, spec, "*", key);
      continue;
    }
    if (mod.decls.has(name)) { for (const node of mod.decls.get(name)) scanInto(mod, node, key); continue; }
    const exp = mod.exports.get(name);
    if (exp?.local) {
      if (mod.decls.has(exp.local)) push(rel, exp.local, key);
      else if (mod.imports.has(exp.local)) { const imp = mod.imports.get(exp.local); follow(mod, imp.spec, imp.name, key); }
      continue;
    }
    if (exp?.spec) { follow(mod, exp.spec, exp.name, key); continue; }
    if (mod.imports.has(name)) { const imp = mod.imports.get(name); follow(mod, imp.spec, imp.name, key); continue; }
    for (const spec of mod.stars) follow(mod, spec, name, key);
  }
  return { writes, clientStops: [...clientStops], externals: [...externals], visited: seen.size, missingRoots };
}

// ── 발견: route.ts · 메타데이터 경로 · 화면 ────────────────────────────────────────────
function walkFiles(project, dir, out = []) {
  if (project.files) { for (const f of project.files.keys()) if (f.startsWith(`${dir}/`)) out.push(f); return out; }
  for (const e of readdirSync(path.join(project.root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walkFiles(project, rel, out);
    else out.push(rel);
  }
  return out;
}
const ROUTE_FILE = /\/route\.(ts|tsx|js|mjs)$/;
const META_FILE = /\/(sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.(ts|tsx|js)$/;
const PAGE_FILE = /\/page\.(tsx|ts|jsx|js)$/;
export function listAppFiles(project) {
  const all = walkFiles(project, "src/app").filter((f) => !/\/_old_/.test(f));
  return { routes: all.filter((f) => ROUTE_FILE.test(f)), meta: all.filter((f) => META_FILE.test(f)), pages: all.filter((f) => PAGE_FILE.test(f)) };
}
/** GET 에 응답하는 심볼. HEAD 가 없으면 Next 가 GET 으로 대답한다. 메타데이터 파일은 default · generate*. */
export function getSymbols(project, file) {
  const mod = project.parse(file);
  if (!mod) return [];
  if (META_FILE.test(file)) return ["default", "generateSitemaps", "generateImageMetadata"].filter((s) => mod.exports.has(s));
  return ["GET", "HEAD"].filter((s) => mod.exports.has(s));
}
/** 화면 하나의 뿌리: page · 조상 layout/template/loading(default + generateMetadata) · src/proxy.ts 전체 */
export function pageRoots(project, pageFile) {
  const roots = [];
  const add = (file) => {
    const mod = project.parse(file);
    if (!mod) return;
    for (const s of ["default", "generateMetadata", "generateViewport", "generateStaticParams"]) if (mod.exports.has(s)) roots.push({ file, symbol: s });
  };
  add(pageFile);
  for (let dir = path.posix.dirname(pageFile); dir.startsWith("src/app"); dir = path.posix.dirname(dir)) {
    for (const base of ["layout", "template", "loading"]) for (const ext of [".tsx", ".ts", ".jsx", ".js"]) if (project.exists(`${dir}/${base}${ext}`)) add(`${dir}/${base}${ext}`);
    if (dir === "src/app") break;
  }
  for (const proxy of ["src/proxy.ts", "src/middleware.ts"]) if (project.exists(proxy)) roots.push({ file: proxy, symbol: "*" });
  return roots;
}

export const summarize = (res) => {
  const sideEffects = res.writes.filter((w) => SIDE_EFFECT_KINDS[w.kind] === "write");
  const external = res.writes.filter((w) => SIDE_EFFECT_KINDS[w.kind] === "external");
  return { writes: sideEffects.length, external: external.length, sites: [...sideEffects, ...external], visited: res.visited, clientStops: res.clientStops.length, missingRoots: res.missingRoots };
};

/**
 * 전 스윕. actions: {file: [이름…]}(읽기 전용 서버 액션 목록). 반환 {routes, pages, actions}:
 *   routes: [{file, pattern, sample, symbols, writes, external, sites}] — GET 이 없는 route 는 symbols [] (Next 405)
 *   pages:  pageFiles(검사할 화면) 각각 — 레이아웃 · proxy 포함
 */
export function sweepSideEffects({ project = createProject(), pageFiles = [], actions = {} } = {}) {
  const t0 = Date.now();
  const { routes, meta, pages } = listAppFiles(project);
  const routeRows = [...routes, ...meta].map((file) => {
    const symbols = getSymbols(project, file);
    const row = { file, pattern: routePatternSource(file), sample: samplePath(file), symbols };
    return symbols.length ? { ...row, ...summarize(reach(project, symbols.map((symbol) => ({ file, symbol })))) } : { ...row, writes: 0, external: 0, sites: [] };
  });
  const pageRows = pageFiles.map((file) => ({ file, pattern: routePatternSource(file), sample: samplePath(file), ...summarize(reach(project, pageRoots(project, file))) }));
  const actionRows = Object.entries(actions).flatMap(([file, names]) => names.map((name) => ({ file, name, ...summarize(reach(project, [{ file, symbol: name }])) })));
  return { ms: Date.now() - t0, routes: routeRows, allPages: pages, pages: pageRows, actions: actionRows, skipSubtrees: SKIP_SUBTREES };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const { READ_ONLY_PAGES } = await import("./get-policy.mjs");
  const { READ_ONLY_ACTIONS } = await import("./write-guard.mjs");
  // --pages director: 하네스 화면만이 아니라 원장 화면 전부(page + 레이아웃 + proxy)를 훑는다(보고용)
  const project = createProject();
  const pageFiles = args.includes("--pages")
    ? listAppFiles(project).pages.filter((f) => f.includes(`/${args[args.indexOf("--pages") + 1]}/`))
    : Object.keys(READ_ONLY_PAGES);
  const report = sweepSideEffects({ project, pageFiles, actions: READ_ONLY_ACTIONS });
  const withGet = report.routes.filter((r) => r.symbols.length);
  const dirty = withGet.filter((r) => r.writes > 0);
  console.log(`스윕 ${report.ms}ms · route/메타데이터 ${report.routes.length}개 중 GET ${withGet.length} · 부작용 GET ${dirty.length} · 외부 POST 만 ${withGet.filter((r) => !r.writes && r.external).length}`);
  const show = (label, rows) => {
    for (const r of rows) {
      console.log(`${label} ${r.writes ? "WRITE" : r.external ? "EXT  " : "clean"} ${r.file}${r.name ? `#${r.name}` : ""}`);
      if (args.includes("--all") || label !== "route") for (const s of r.sites.slice(0, 3)) console.log(`      ${s.kind} ${s.what} @ ${s.file}:${s.line} ← ${s.chain.slice(0, 4).join(" → ")}`);
    }
  };
  show("route", args.includes("--all") ? withGet : dirty);
  show("page ", args.includes("--pages") ? report.pages.filter((r) => r.writes || r.external) : report.pages);
  if (args.includes("--pages")) console.log(`화면 ${report.pages.length}개 중 부작용 ${report.pages.filter((r) => r.writes).length}`);
  show("action", report.actions);
  if (args.includes("--json")) writeFileSync(args[args.indexOf("--json") + 1], JSON.stringify(report, null, 1));
}
