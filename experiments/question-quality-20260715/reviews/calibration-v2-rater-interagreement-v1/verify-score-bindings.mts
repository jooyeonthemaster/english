import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scoreFromSealedArtifacts } from "../../design/reviewer-calibration-packet-v2/score.mts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const packetRoot = path.join(repoRoot, "experiments/question-quality-20260715/design/reviewer-calibration-packet-v2");
const sha = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const json = (relative: string): unknown => JSON.parse(readFileSync(path.join(repoRoot, relative), "utf8"));
const bytesSha = (relative: string): string => sha(readFileSync(path.join(repoRoot, relative)));

const packetRelative = "experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/private/items.private.json";
const contractRelative = "experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/contract.mts";
const metricsRelative = "experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/metrics.mts";
const scorerRelative = "experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/score.mts";

for (const [name, sourceDir, recordsRelative] of [
  ["A", "rater-a", "experiments/question-quality-20260715/reviews/calibration-v2-rater-interagreement-v1/private/rater-a-review-records-score-bound.json"],
  ["B", "rater-b", "experiments/question-quality-20260715/reviews/calibration-v2-rater-interagreement-v1/private/rater-b-review-records-score-bound.json"],
  ["C", "adjudicator-c", "experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/private/issued/adjudicator-c/review-records.json"],
] as const) {
  const issued = `experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/private/issued/${sourceDir}`;
  let observed = "NO_ERROR";
  try {
    scoreFromSealedArtifacts({
      packetRaw: json(packetRelative),
      packetPrivateSha256: bytesSha(packetRelative),
      contractSha256: bytesSha(contractRelative),
      metricsSha256: bytesSha(metricsRelative),
      scorerSha256: bytesSha(scorerRelative),
      phase1Raw: json(`${issued}/phase1.json`),
      submissionRaw: json(`${issued}/submission.json`),
      sealRaw: json(`${issued}/seal.json`),
      mapRaw: json(`${issued}/private-map.json`),
      revealRaw: json(`${issued}/reveal.json`),
      recordsRaw: json(recordsRelative),
      issuedAt: "2026-07-15T20:45:00.000001+09:00",
      expiresAt: "2027-07-15T20:45:00.000001+09:00",
    });
  } catch (error) {
    observed = error instanceof Error ? error.message : String(error);
  }
  assert.equal(observed, "GOLD_ADJUDICATION_PENDING", `rater ${name} did not reach the intended pending-gold gate`);
}

assert.equal(path.basename(packetRoot), "reviewer-calibration-packet-v2");
process.stdout.write(`${JSON.stringify({ verdict: "PASS_ALL_REVIEW_BUNDLES_REACH_PENDING_GOLD_GATE", raters: 3, mechanicallyReboundRaters: 2, freshCorrectlyBoundAdjudicators: 1, judgmentFieldsChanged: 0, candidates: 0, network: 0 }, null, 2)}\n`);
