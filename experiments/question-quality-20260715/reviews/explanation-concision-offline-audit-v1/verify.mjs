import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dataText, hashesText, data } from "./audit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const read = (path) => readFileSync(resolve(here, path));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new Error(message); };

if (read("audit-data.json").toString("utf8") !== dataText) fail("audit-data.json drift");
if (read("source-hashes.json").toString("utf8") !== hashesText) fail("source-hashes.json drift");
if (data.externalNetworkCalls !== 0 || data.modelCalls !== 0 || data.apiCalls !== 0 || data.databaseCalls !== 0 || data.secretReads !== 0) fail("offline counters changed");
if (data.latest15.overall.items !== 15 || data.latest15.overall.independentPassageClusters !== 5) fail("latest population drift");
if (data.latest15.overall.manuallyReviewed !== 15 || data.latest15.overall.manualFlags.clearFactualError !== 9 || data.latest15.overall.sealedV4Failures !== 9) fail("latest manual/sealed findings drift");
if (data.latest15.byDeploymentSide.POST_DEPLOY.items !== 8 || data.latest15.byDeploymentSide.POST_DEPLOY.independentPassageClusters !== 2 || data.latest15.byDeploymentSide.POST_DEPLOY.sealedV4Failures !== 5) fail("post-deploy window drift");
if (data.premiumGrammar60.overall.items !== 60 || data.premiumGrammar60.overall.independentPassageClusters !== 30 || data.premiumGrammar60.overall.sealedV4Failures !== 11) fail("premium population drift");
if (data.premiumGrammar60.manuallyReviewedStratifiedSubset.items !== 18 || data.premiumGrammar60.manuallyReviewedStratifiedSubset.independentPassageClusters !== 9) fail("manual premium stratum drift");
if (data.premiumGrammar60.overall.itemsOverMain450 !== 0) fail("historical length counterexample drift");
if (!Object.values(data.currentContractObservations).every(Boolean)) fail("current contract observation drift");

const manifestLines = read("MANIFEST.sha256").toString("utf8").trim().split(/\r?\n/).filter(Boolean);
for (const line of manifestLines) {
  const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
  if (!match) fail(`malformed manifest line: ${line}`);
  const actual = sha256(readFileSync(resolve(here, match[2])));
  if (actual !== match[1]) fail(`manifest mismatch: ${match[2]}`);
}

console.log(JSON.stringify({
  verdict: "PASS",
  bundle: "explanation-concision-offline-audit-v1",
  latest: { items: 15, v4Failures: 9, postDeployItems: 8, postDeployV4Failures: 5 },
  premiumGrammar: { items: 60, passageClusters: 30, v4Failures: 11 },
  networkModelApiDbSecretCalls: 0,
  manifestEntries: manifestLines.length,
  repo: repo.replaceAll("\\", "/")
}, null, 2));
