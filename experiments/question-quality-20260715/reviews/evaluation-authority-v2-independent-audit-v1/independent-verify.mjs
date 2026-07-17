import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED, runIndependentAudit, sha256 } from "./independent-core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_FILES = [
  "MANIFEST.sha256",
  "REPORT.md",
  "audit.json",
  "hostile-evidence.json",
  "independent-core.mjs",
  "independent-verify.mjs",
].sort();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseManifest(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = /^([0-9a-f]{64})  ([^\\]+)$/.exec(line);
    assert(match, `malformed audit manifest row: ${line}`);
    return { sha256: match[1], path: match[2] };
  });
}

const [fresh, audit, hostile, manifestText, coreSource, verifierSource] = await Promise.all([
  runIndependentAudit(),
  readFile(path.join(HERE, "audit.json"), "utf8").then(JSON.parse),
  readFile(path.join(HERE, "hostile-evidence.json"), "utf8").then(JSON.parse),
  readFile(path.join(HERE, "MANIFEST.sha256"), "utf8"),
  readFile(path.join(HERE, "independent-core.mjs"), "utf8"),
  readFile(path.join(HERE, "independent-verify.mjs"), "utf8"),
]);

assert(fresh.verdict === "PASS_NO_BLOCKERS" && fresh.blockers.length === 0, `fresh independent audit failed: ${JSON.stringify(fresh.blockers)}`);
assert(audit.schemaVersion === "evaluation-authority-v2-independent-audit-v1", "audit schema mismatch");
assert(audit.verdict === fresh.verdict && Array.isArray(audit.blockers) && audit.blockers.length === 0, "stored verdict mismatch");
assert(audit.subject.protocolSha256 === EXPECTED.protocolSha256 && fresh.subject.protocolSha256 === EXPECTED.protocolSha256, "protocol pin mismatch");
assert(audit.subject.publicManifestSha256 === EXPECTED.publicManifestSha256 && fresh.subject.publicManifestSha256 === EXPECTED.publicManifestSha256, "public manifest pin mismatch");
assert(audit.subject.manifestSha256 === EXPECTED.manifestSha256 && fresh.subject.manifestSha256 === EXPECTED.manifestSha256, "subject manifest pin mismatch");
assert(audit.checks.mutationsPassed === fresh.checks.mutationsPassed && audit.checks.mutationsTotal === fresh.checks.mutationsTotal, "mutation count mismatch");
assert(audit.checks.scenariosPassed === fresh.checks.scenariosPassed && audit.checks.scenariosTotal === fresh.checks.scenariosTotal, "scenario count mismatch");
assert(fresh.checks.mutationsPassed === 127 && fresh.checks.mutationsTotal === 127, "mutation suite not 127/127");
assert(fresh.checks.scenariosPassed === 12 && fresh.checks.scenariosTotal === 12, "access scenario suite not 12/12");
assert(hostile.mutationSummary.passed === 127 && hostile.mutationSummary.total === 127, "hostile evidence mutation count mismatch");
assert(hostile.accessScenarioSummary.passed === 12 && hostile.accessScenarioSummary.total === 12, "hostile evidence scenario count mismatch");
assert(hostile.categories.reduce((sum, row) => sum + row.cases, 0) === 127, "hostile category sum mismatch");
assert(new Set(hostile.accessScenarios).size === 12, "access scenario evidence must be 12 unique cases");

assert(fresh.upstreams.length === audit.upstreams.length && fresh.upstreams.every((row, index) => row.id === audit.upstreams[index].id && row.observedSha256 === audit.upstreams[index].observedSha256 && row.match), "upstream recomputation mismatch");
assert(fresh.lineages.length === audit.manifestLineage.length && fresh.lineages.every((row, index) => row.manifestRel === audit.manifestLineage[index].path && row.rows === audit.manifestLineage[index].rows && row.verified === audit.manifestLineage[index].verified && row.skippedForbidden === audit.manifestLineage[index].skippedForbidden && row.mismatches.length === 0), "manifest lineage mismatch");
assert(fresh.lineages.reduce((sum, row) => sum + row.verified, 0) === 23, "public upstream lineage verified-row count changed");
assert(fresh.lineages.reduce((sum, row) => sum + row.skippedForbidden, 0) === 1, "forbidden-row refusal count changed");

for (const value of Object.values(fresh.activity)) assert(value === 0, "fresh prohibited activity must remain zero");
for (const value of Object.values(audit.activity)) assert(value === 0, "stored prohibited activity must remain zero");
assert(!/from\s+["'][^"']*evaluation-authority-v2\/(?:build|verify|hostile-tests)\.(?:mjs|mts|js|ts)["']/.test(coreSource + verifierSource), "subject build/verifier/hostile import detected");
assert(!/\bfetch\s*\(|from\s+["']node:(?:http|https|net|tls|dns)["']|process\s*\.\s*env\s*[.[]/.test(coreSource + verifierSource), "environment or network access token detected");

const actualFiles = (await readdir(HERE, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
assert(JSON.stringify(actualFiles) === JSON.stringify(EXPECTED_FILES), `audit package file set drift: ${actualFiles.join(",")}`);
const manifestRows = parseManifest(manifestText);
assert(manifestRows.length === EXPECTED_FILES.length - 1, "audit manifest row count mismatch");
assert(JSON.stringify(manifestRows.map((row) => row.path).sort()) === JSON.stringify(EXPECTED_FILES.filter((name) => name !== "MANIFEST.sha256")), "audit manifest exact set mismatch");
for (const row of manifestRows) {
  const bytes = await readFile(path.join(HERE, row.path));
  assert(sha256(bytes) === row.sha256, `audit manifest hash mismatch: ${row.path}`);
}

console.log(JSON.stringify({
  verdict: fresh.verdict,
  subjectProtocolSha256: fresh.subject.protocolSha256,
  subjectPublicManifestSha256: fresh.subject.publicManifestSha256,
  subjectManifestSha256: fresh.subject.manifestSha256,
  staticChecks: "PASS",
  artifactAndUpstreamChecks: "PASS",
  mutations: `${fresh.checks.mutationsPassed}/${fresh.checks.mutationsTotal}`,
  accessScenarios: `${fresh.checks.scenariosPassed}/${fresh.checks.scenariosTotal}`,
  publicManifestRowsRehashed: fresh.lineages.reduce((sum, row) => sum + row.verified, 0),
  forbiddenDeclaredRowsRefused: fresh.lineages.reduce((sum, row) => sum + row.skippedForbidden, 0),
  prohibitedActivity: "0",
}, null, 2));
