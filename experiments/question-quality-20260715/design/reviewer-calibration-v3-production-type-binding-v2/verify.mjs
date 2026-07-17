import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const base = dirname(fileURLToPath(import.meta.url));
const repo = resolve(base, "../../../..");
const binding = JSON.parse(readFileSync(join(base, "binding.json"), "utf8"));
const hostile = JSON.parse(readFileSync(join(base, "hostile-fixtures.json"), "utf8"));
const v1Dir = resolve(base, binding.supersedes.path);
const v1Binding = JSON.parse(readFileSync(join(v1Dir, "binding.json"), "utf8"));
const v1VerifierText = readFileSync(join(v1Dir, "verify.mjs"), "utf8");
const reportPath = join(base, "REPORT.md");
const manifestPath = join(base, "MANIFEST.sha256");
const checks = [];

function check(name, condition, detail = undefined) {
  checks.push({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
}

function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}

function setEq(name, actual, expected) {
  eq(name, [...new Set(actual)].sort(), [...new Set(expected)].sort());
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function semanticSha(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseManifest(path) {
  const result = new Map();
  for (const line of readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Invalid manifest line: ${line}`);
    result.set(match[2], match[1]);
  }
  return result;
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr);
  return result;
}

function parseSource(relativePath) {
  const text = readFileSync(join(repo, relativePath), "utf8");
  return ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function findInitializer(ast, name) {
  let found;
  function visit(node) {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = node.initializer;
    else ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!found) throw new Error(`${name} not found`);
  while (ts.isAsExpression(found) || ts.isParenthesizedExpression(found)) found = found.expression;
  return found;
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function objectKeys(ast, name) {
  const node = findInitializer(ast, name);
  if (!ts.isObjectLiteralExpression(node)) throw new Error(`${name} not object literal`);
  return node.properties.map((property) => propertyName(property.name)).filter(Boolean);
}

function uiReferences(ast) {
  const node = findInitializer(ast, "QUESTION_TYPE_GROUPS");
  const ids = [];
  function visit(current) {
    if (ts.isPropertyAccessExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === "QUESTION_TYPE_UI") {
      ids.push(current.name.text);
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return ids;
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
  const types = new Set();
  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    for (const family of families) {
      for (const role of roles) types.add(selectedAt(family.rotationOrder, epoch, role).typeId);
    }
  }
  return types;
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

const v1ManifestPath = join(v1Dir, "MANIFEST.sha256");
eq("v1 manifest hash preserved", sha256File(v1ManifestPath), binding.supersedes.manifestSha256);
eq("v1 manifest entries preserved", Object.fromEntries(parseManifest(v1ManifestPath)), binding.supersedes.manifestEntries);
for (const [file, hash] of Object.entries(binding.supersedes.manifestEntries)) {
  eq(`v1 file hash preserved ${file}`, sha256File(join(v1Dir, file)), hash);
}
eq("v1 source snapshot preserved", semanticSha(v1Binding.sources), binding.supersedes.sourceSnapshotSha256);

for (const source of v1Binding.sources) {
  const absolute = join(repo, source.path);
  check(`source exists ${source.path}`, existsSync(absolute));
  if (!existsSync(absolute)) continue;
  eq(`source sha256 ${source.path}`, sha256File(absolute), source.worktreeSha256);
  if (source.headBlobSha1) {
    eq(`source HEAD blob ${source.path}`, git(["rev-parse", `HEAD:${source.path}`]).stdout.trim(), source.headBlobSha1);
    eq(`source clean state ${source.path}`, git(["diff", "--quiet", "--", source.path], true).status === 0, source.cleanAtFreeze);
  }
}

const uiIds = uiReferences(parseSource("src/lib/question-type-ui.ts"));
const structuredSchemaIds = objectKeys(parseSource("src/lib/question-schemas.ts"), "QUESTION_SCHEMAS");
const aiMc = objectKeys(parseSource("src/lib/question-ai-schemas-mc.ts"), "AI_MC_QUESTION_SCHEMAS");
const aiEssay = objectKeys(parseSource("src/lib/question-ai-schemas-mc.ts"), "AI_ESSAY_QUESTION_SCHEMAS");
const aiVocab = objectKeys(parseSource("src/lib/question-ai-schemas-vocab.ts"), "AI_VOCAB_QUESTION_SCHEMAS");
const aiIds = [...new Set([...aiMc, ...aiEssay, ...aiVocab])];

eq("v2 schema version", binding.schemaVersion, "reviewer-calibration-v3-production-type-binding-2");
eq("v2 status", binding.status, "VALID_CORRECTED_ROTATION_V1_EXECUTION_INVALID");
eq("canonical UI source extraction", uiIds, binding.canonicalUniverse.uiTypeIdsInOrder);
eq("canonical UI count", uiIds.length, 25);
eq("focus count", binding.canonicalUniverse.focusTypeIds.length, 2);
const nonfocus = uiIds.filter((id) => !binding.canonicalUniverse.focusTypeIds.includes(id));
eq("canonical nonfocus source extraction", nonfocus, binding.canonicalUniverse.nonfocusTypeIdsInUiOrder);
eq("canonical nonfocus count", nonfocus.length, 23);
eq("structured schema count", structuredSchemaIds.length, 26);
eq("AI schema count", aiIds.length, 26);
setEq("AI and structured schema agreement", aiIds, structuredSchemaIds);
eq("only schema-only legacy type", structuredSchemaIds.filter((id) => !uiIds.includes(id)), ["TOPIC_MAIN_IDEA"]);

eq("v2 canonical universe matches valid v1 portion", binding.canonicalUniverse, v1Binding.canonicalUniverse);
eq("v2 families match valid v1 portion", binding.families, v1Binding.families);
const mapped = binding.families.flatMap((family) => family.rotationOrder);
eq("mapping count", mapped.length, 23);
eq("mapping duplicates", duplicates(mapped), []);
setEq("mapping exhaustive", mapped, nonfocus);

eq("v1 failure severity", binding.v1FailureProvenance.severity, "BLOCKER");
eq("v1 execution invalid", binding.v1FailureProvenance.v1ExecutionEligible, false);
eq("v1 remains unmodified", binding.v1FailureProvenance.v1MustRemainUnmodified, true);
eq("v1 declared old formula preserved in evidence", v1Binding.rotation.mainIndexFormula, binding.v1FailureProvenance.declaredMainFormula);
check("v1 verifier contains divergent main-only expression", v1VerifierText.includes("family.rotationOrder[(epoch - 1) % family.rotationOrder.length]"));
const oldSize4Main = Array.from({ length: 4 }, (_, index) => (2 * index) % 4);
eq("v1 size4 counterexample computed", oldSize4Main, [0, 2, 0, 2]);
eq("v1 size4 distinct only two", new Set(oldSize4Main).size, 2);

eq("corrected main formula", binding.rotation.mainIndexFormula, "(epoch - 1) mod familySize");
eq("corrected holdout formula", binding.rotation.holdoutIndexFormula, "(epoch - 1 + ceil(familySize / 2)) mod familySize");
eq("single implementation function declared", binding.rotation.implementationFunction, "selectedAt(rotationOrder, epoch, role)");
eq("same function mandate", binding.rotation.formulaRowsAndCoverageMustUseSameFunction, true);

const expectedRows = materializeRows(binding.families, 4);
eq("schedule row count", binding.scheduleRows.length, 32);
eq("formula and materialized rows identical", binding.scheduleRows, expectedRows);
for (const n of [2, 3, 4]) {
  const sample = Array.from({ length: n }, (_, index) => `T${index}`);
  for (let epoch = 1; epoch <= 4; epoch += 1) {
    const main = selectedAt(sample, epoch, "MAIN");
    const holdout = selectedAt(sample, epoch, "HOLDOUT");
    check(`n${n} epoch${epoch} main/holdout distinct`, main.index !== holdout.index);
  }
}

const epoch1 = coverage(binding.families, 1, ["MAIN", "HOLDOUT"]);
const twoEpoch = coverage(binding.families, 2, ["MAIN", "HOLDOUT"]);
const fourMain = coverage(binding.families, 4, ["MAIN"]);
eq("single epoch combined distinct", epoch1.size, 16);
eq("single epoch claim", binding.claims.singleEpochCombinedDistinctTypes, 16);
eq("single epoch all-type claim forbidden", binding.claims.singleEpochAllTypeClaimAllowed, false);
eq("two epoch combined contact", twoEpoch.size, 23);
setEq("two epoch exact contact", [...twoEpoch], nonfocus);
eq("two epoch claim", binding.claims.twoEpochCombinedContactTypes, 23);
eq("four epoch main-only contact", fourMain.size, 23);
setEq("four epoch main exact contact", [...fourMain], nonfocus);
eq("four epoch main claim", binding.claims.fourEpochMainOnlyContactTypes, 23);
eq("contact not certification", binding.claims.contactEqualsCertification, false);

function hostileReasons(fixture) {
  const reasons = new Set();
  if (fixture.mutation === "HOLDOUT_OFFSET_ZERO") {
    const order = ["A", "B"];
    const epoch = 1;
    const mainIndex = (epoch - 1) % order.length;
    const badHoldoutIndex = (epoch - 1) % order.length;
    if (mainIndex === badHoldoutIndex) reasons.add("MAIN_HOLDOUT_COLLISION");
  } else if (fixture.mutation === "CHANGE_EPOCH2_HOLDOUT_TO_MAIN") {
    const rows = structuredClone(binding.scheduleRows);
    const row = rows.find((candidate) => binding.families.find((family) => family.familyId === candidate.familyId).rotationOrder.length === 3 && candidate.epoch === 2);
    row.holdoutIndex = row.mainIndex;
    row.holdoutTypeId = row.mainTypeId;
    if (JSON.stringify(rows) !== JSON.stringify(materializeRows(binding.families, 4))) reasons.add("FORMULA_ROW_DIVERGENCE");
  } else if (fixture.mutation === "USE_V1_MAIN_FORMULA_FOR_MAIN_ONLY") {
    const indices = Array.from({ length: 4 }, (_, index) => (2 * index) % 4);
    if (new Set(indices).size !== 4) reasons.add("MAIN_ONLY_COVERAGE_FALSE");
  } else if (fixture.mutation === "REPLACE_EPOCH1_MAIN_WITH_EPOCH3_TYPE") {
    const rows = structuredClone(binding.scheduleRows);
    const family = binding.families.find((candidate) => candidate.rotationOrder.length === 4);
    const row = rows.find((candidate) => candidate.familyId === family.familyId && candidate.epoch === 1);
    row.mainIndex = 2;
    row.mainTypeId = family.rotationOrder[2];
    if (JSON.stringify(rows) !== JSON.stringify(materializeRows(binding.families, 4))) reasons.add("ROTATION_CHERRY_PICK");
  } else if (fixture.mutation === "DELETE_ONE_MATERIALIZED_ROW") {
    const rows = binding.scheduleRows.slice(1);
    if (rows.length !== binding.families.length * 4) reasons.add("SCHEDULE_ROW_COUNT");
  } else if (fixture.mutation === "DUPLICATE_TYPE_ACROSS_FAMILIES") {
    const families = structuredClone(binding.families);
    families[1].rotationOrder.push(families[0].rotationOrder[0]);
    if (duplicates(families.flatMap((family) => family.rotationOrder)).length > 0) reasons.add("CANONICAL_MAPPING_DUPLICATE");
  } else {
    throw new Error(`Unknown hostile mutation ${fixture.mutation}`);
  }
  return reasons;
}

eq("hostile fixture count", hostile.fixtures.length, 6);
for (const fixture of hostile.fixtures) {
  const reasons = hostileReasons(fixture);
  check(`hostile caught ${fixture.fixtureId}`, reasons.has(fixture.expectedReasonCode), { expected: fixture.expectedReasonCode, actual: [...reasons] });
}

for (const [key, value] of Object.entries(binding.activity)) eq(`offline activity ${key}`, value, 0);

if (existsSync(reportPath)) {
  const report = readFileSync(reportPath, "utf8");
  for (const phrase of [
    "V1_ROTATION_FORMULA_VERIFIER_DIVERGENCE",
    "main = (epoch - 1) mod n",
    "holdout = (epoch - 1 + ceil(n / 2)) mod n",
    "n=2",
    "n=3",
    "n=4",
    "단일 epoch",
    "contact ≠ certification"
  ]) check(`report contains ${phrase}`, report.includes(phrase));
}

if (process.argv.includes("--check-manifest")) {
  check("manifest exists", existsSync(manifestPath));
  if (existsSync(manifestPath)) {
    const entries = parseManifest(manifestPath);
    const expectedFiles = ["REPORT.md", "binding.json", "hostile-fixtures.json", "verify.mjs"];
    eq("manifest file names", [...entries.keys()].sort(), expectedFiles.sort());
    for (const file of expectedFiles) eq(`manifest hash ${file}`, entries.get(file), sha256File(join(base, file)));
  }
}

const failures = checks.filter((entry) => !entry.pass);
const result = {
  schemaVersion: "reviewer-calibration-v3-production-type-binding-v2-verification-1",
  status: failures.length === 0 ? "PASS_V2_V1_EXECUTION_INVALID" : "FAIL_CLOSED",
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  v1Failure: binding.v1FailureProvenance,
  correctedCoverage: {
    singleEpochCombinedDistinct: epoch1.size,
    twoEpochCombinedContact: twoEpoch.size,
    fourEpochMainOnlyContact: fourMain.size,
    contactIsCertification: false
  },
  hostileFixtures: {
    total: hostile.fixtures.length,
    caught: hostile.fixtures.filter((fixture) => hostileReasons(fixture).has(fixture.expectedReasonCode)).length
  },
  activity: binding.activity,
  failures
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
