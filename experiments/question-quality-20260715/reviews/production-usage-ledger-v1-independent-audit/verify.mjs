import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const sourceDir = join(root, "experiments/question-quality-20260715/reviews/production-usage-ledger-v1");
const publicPath = join(sourceDir, "runs/baseline-v3-root-20260715-1501-kst-public.json");
const sourceManifestPath = join(sourceDir, "runs/baseline-v3-root-20260715-1501-kst-manifest.sha256");
const sourceAuditPath = join(sourceDir, "audit.mts");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const round6 = (value) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;

const expected = readJson(join(here, "summary.json"));
const source = readJson(publicPath);
assert.equal(source.label, expected.sourceLabel);
assert.equal(sha256(publicPath), expected.sourcePublicSha256);
assert.equal(sha256(sourceAuditPath), expected.sourceAuditScriptSha256);
const sourceManifest = readFileSync(sourceManifestPath, "utf8");
assert.match(sourceManifest, new RegExp(`^${expected.sourcePublicSha256}  `, "m"));
assert.match(sourceManifest, new RegExp(`^${expected.sourcePrivateDeclaredSha256}  `, "m"));
assert.match(sourceManifest, new RegExp(`^${expected.sourceAuditScriptSha256}  `, "m"));

assert.equal(source.coverage.jobs, expected.jobs);
assert.equal(source.coverage.costEvents, expected.costRows);
assert.equal(source.coverage.orphanCostEvents, expected.orphanCostRows);
assert.equal(source.overall.ledgerEvents, expected.joinedLedgerEvents);
assert.equal(source.coverage.costEvents - source.overall.ledgerEvents, expected.orphanCostRows);
assert.equal(
  Object.values(source.overall.ledgerEventsByModel).reduce((sum, value) => sum + value, 0),
  expected.joinedLedgerEvents,
);
assert.equal(
  round6(Object.values(source.overall.mixedCostUsdByModel).reduce((sum, value) => sum + value, 0)),
  expected.mixedLedgerCostUsd,
);

const days = Object.entries(source.byKstDate).map(([date, row]) => ({ date, ...row }));
assert.equal(days.length, expected.kstDays);
assert.equal(days.reduce((sum, row) => sum + row.jobs, 0), expected.jobs);
assert.equal(days.reduce((sum, row) => sum + row.ledgerEvents, 0), expected.joinedLedgerEvents);
assert.equal(round6(days.reduce((sum, row) => sum + row.mixedLedgerCostUsd, 0)), expected.mixedLedgerCostUsd);
const spike = days.toSorted((left, right) => right.ledgerEvents - left.ledgerEvents)[0];
assert.equal(spike.date, expected.largestDailySpike.kstDate);
assert.equal(spike.jobs, expected.largestDailySpike.jobs);
assert.equal(spike.ledgerEvents, expected.largestDailySpike.events);
assert.equal(spike.mixedLedgerCostUsd, expected.largestDailySpike.mixedCostUsd);

const post = source.byPeriod.JULY_POST_DEPLOYMENT_TIMESTAMP_CORRELATED;
assert.equal(post.jobs, expected.postDeploymentTimestampCorrelated.jobs);
assert.equal(post.ledgerEvents, expected.postDeploymentTimestampCorrelated.events);
assert.equal(post.gatewayRecordedCostUsd, expected.postDeploymentTimestampCorrelated.gatewayRecordedCostUsd);
assert.match(source.deploymentBoundary.interpretation, /timestamp correlation only/i);
assert.equal(expected.postDeploymentTimestampCorrelated.causalClaim, false);

assert.ok(Object.values(source.privacy).every((value) => value === false));
assert.equal(source.safety.databaseReadsOnly, true);
assert.equal(source.safety.databaseWrites, 0);
assert.equal(source.safety.modelApiCalls, 0);
assert.equal(source.safety.providerApiCalls, 0);

const manifest = readJson(join(here, "manifest.json"));
const files = readdirSync(here).filter((name) => name !== "manifest.json").sort();
assert.deepEqual(Object.keys(manifest.files).sort(), files);
for (const name of files) assert.equal(manifest.files[name], sha256(join(here, name)));

console.log(JSON.stringify({
  verdict: expected.verdict,
  jobs: expected.jobs,
  costRows: expected.costRows,
  joinedLedgerEvents: expected.joinedLedgerEvents,
  orphanCostRows: expected.orphanCostRows,
  kstDays: expected.kstDays,
  mixedLedgerCostUsd: expected.mixedLedgerCostUsd,
}, null, 2));
