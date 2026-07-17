import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");

const EXPECTED_ROWS = 186;
const EXPECTED_DISPOSITIONS = {
  DUAL_PASS: 137,
  EXCLUDE: 42,
  DOMAIN_REVIEW: 7,
};
const REQUIRED_SELECTED_ROWS = 38;
const SEED = "cross-type-grammar-v2-dual-pass-split-20260715-v1";
const SPLITS = ["development", "confirmatory", "reserve"];
const TOPICS = [
  "art-culture",
  "humanities",
  "science",
  "social",
  "narrative-practical",
];
const DISCOURSES = ["argumentative", "expository", "narrative", "practical"];
const WORD_BANDS = ["120-169", "170-229", "230-360"];
const VERDICTS = ["PASS", "EXCLUDE", "DOMAIN_REVIEW"];
const TARGETS = {
  development: {
    "art-culture": 1,
    humanities: 1,
    science: 1,
    social: 1,
    "narrative-practical": 2,
  },
  confirmatory: {
    "art-culture": 2,
    humanities: 5,
    science: 5,
    social: 4,
    "narrative-practical": 4,
  },
  reserve: {
    "art-culture": 1,
    humanities: 3,
    science: 3,
    social: 2,
    "narrative-practical": 3,
  },
};

const SEALED_INPUT_MANIFESTS = [
  {
    key: "sourceFrame",
    file: "MANIFEST.sha256",
    sha256: "ba8cddbc7dfa536e5d649e80acbf4f2c618d4ab116cef4267bd4c9f64e71d192",
    entries: 6,
    base: repoRoot,
    verifier: "verify.mts",
  },
  {
    key: "reviewerA",
    file: "REVIEWER-A-MANIFEST.sha256",
    sha256: "efc035a81f16f158354a9d60ab3d0c2ab45a555c47afb4c3d9d374c0b29e31bf",
    entries: 4,
    base: here,
    verifier: "verify-reviewer-a.mts",
  },
  {
    key: "reviewerB",
    file: "REVIEWER-B-MANIFEST.sha256",
    sha256: "dbccb3e3f79d2657153e8ec9e9efb4dd7e959cd886654949f3f3655f00e0c84b",
    entries: 3,
    base: repoRoot,
    verifier: "verify-reviewer-b.mts",
  },
];

const RECONCILIATION_PUBLIC_FILES = [
  "reconcile-and-split.mjs",
  "reviewer-reconciliation-summary.json",
  "verify-reconciliation.mjs",
  "RECONCILIATION-AUDIT.md",
];

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const fileSha256 = (filePath) => sha256(readFileSync(filePath));
const readJson = (relativePath) =>
  JSON.parse(readFileSync(path.join(here, relativePath), "utf8"));
const canonical = (value) => JSON.stringify(value);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function same(actual, expected, message) {
  check(canonical(actual) === canonical(expected), message);
}

function zeroRecord(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function distribution(rows, field, keys) {
  const result = zeroRecord(keys);
  for (const row of rows) {
    check(keys.includes(row[field]), `unexpected ${field}: ${row[field]}`);
    increment(result, row[field]);
  }
  return result;
}

function topicByDiscourse(rows) {
  return Object.fromEntries(
    TOPICS.map((topic) => [
      topic,
      Object.fromEntries(
        DISCOURSES.map((discourse) => [
          discourse,
          rows.filter(
            (row) => row.topic === topic && row.discourse === discourse,
          ).length,
        ]),
      ),
    ]),
  );
}

function allowedDiscourses(topic) {
  return topic === "narrative-practical"
    ? ["narrative", "practical"]
    : ["argumentative", "expository"];
}

function safeVerifierEnvironment() {
  const allowed = [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "PATHEXT",
    "ComSpec",
    "COMSPEC",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => typeof process.env[key] === "string")
      .map((key) => [key, process.env[key]]),
  );
}

function verifyHashManifest({ key, file, sha256: expectedHash, entries, base }) {
  const manifestPath = path.join(here, file);
  const bytes = readFileSync(manifestPath);
  check(fileSha256(manifestPath) === expectedHash, `${key} manifest changed`);
  const lines = bytes.toString("utf8").trim().split(/\r?\n/u);
  check(lines.length === entries, `${key} manifest entry count changed`);
  for (const [index, line] of lines.entries()) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    check(match, `${key} manifest line ${index + 1} is malformed`);
    const resolved = path.resolve(base, match[2]);
    check(
      resolved.startsWith(`${repoRoot}${path.sep}`),
      `${key} manifest path escaped repository`,
    );
    check(fileSha256(resolved) === match[1], `${key} entry changed: ${match[2]}`);
  }
}

function rerunVerifier({ key, verifier }) {
  const result = spawnSync(
    process.execPath,
    [tsxCli, path.join(here, verifier)],
    {
      cwd: repoRoot,
      env: safeVerifierEnvironment(),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  check(
    result.status === 0,
    `${key} verifier failed: ${result.stderr || result.stdout}`,
  );
}

function enumeratePlans(topic, availability) {
  const [first, second] = allowedDiscourses(topic);
  const plans = [];
  for (let developmentFirst = 0; developmentFirst <= TARGETS.development[topic]; developmentFirst += 1) {
    for (let confirmatoryFirst = 0; confirmatoryFirst <= TARGETS.confirmatory[topic]; confirmatoryFirst += 1) {
      for (let reserveFirst = 0; reserveFirst <= TARGETS.reserve[topic]; reserveFirst += 1) {
        const firstBySplit = {
          development: developmentFirst,
          confirmatory: confirmatoryFirst,
          reserve: reserveFirst,
        };
        const firstTotal = Object.values(firstBySplit).reduce(
          (sum, count) => sum + count,
          0,
        );
        const overallTarget = SPLITS.reduce(
          (sum, split) => sum + TARGETS[split][topic],
          0,
        );
        const secondTotal = overallTarget - firstTotal;
        if (
          firstTotal > availability[first] ||
          secondTotal > availability[second]
        ) {
          continue;
        }
        if (
          availability[first] > 0 &&
          availability[second] > 0 &&
          overallTarget >= 2 &&
          (firstTotal === 0 || secondTotal === 0)
        ) {
          continue;
        }
        const bySplit = Object.fromEntries(
          SPLITS.map((split) => [
            split,
            {
              [first]: firstBySplit[split],
              [second]: TARGETS[split][topic] - firstBySplit[split],
            },
          ]),
        );
        plans.push({
          bySplit,
          diverseCells: SPLITS.filter(
            (split) => bySplit[split][first] > 0 && bySplit[split][second] > 0,
          ).length,
        });
      }
    }
  }
  return plans;
}

function compareScore(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function independentlyOptimizeAllocation(dualPassRows) {
  const availability = topicByDiscourse(dualPassRows);
  const plans = Object.fromEntries(
    TOPICS.map((topic) => [topic, enumeratePlans(topic, availability[topic])]),
  );
  for (const topic of TOPICS) {
    check(plans[topic].length > 0, `${topic} allocation is infeasible`);
  }
  const chosen = {};
  let bestAny;
  let bestWithoutMajority;

  function evaluate(splitTopicDiversity) {
    const allocation = Object.fromEntries(
      SPLITS.map((split) => [
        split,
        Object.fromEntries(
          TOPICS.map((topic) => [topic, chosen[topic].bySplit[split]]),
        ),
      ]),
    );
    const overall = zeroRecord(DISCOURSES);
    const perSplit = Object.fromEntries(
      SPLITS.map((split) => [split, zeroRecord(DISCOURSES)]),
    );
    for (const split of SPLITS) {
      for (const topic of TOPICS) {
        for (const [discourse, count] of Object.entries(allocation[split][topic])) {
          overall[discourse] += count;
          perSplit[split][discourse] += count;
        }
      }
    }
    const values = DISCOURSES.map((discourse) => overall[discourse]);
    const maximumOverall = Math.max(...values);
    const splitDiscourseDiversity = SPLITS.reduce(
      (sum, split) =>
        sum + DISCOURSES.filter((discourse) => perSplit[split][discourse] > 0).length,
      0,
    );
    const overallSquares = values.reduce((sum, value) => sum + value * value, 0);
    const maximumSplitShare = Math.max(
      ...SPLITS.flatMap((split) => {
        const total = Object.values(perSplit[split]).reduce(
          (sum, value) => sum + value,
          0,
        );
        return DISCOURSES.map((discourse) => perSplit[split][discourse] / total);
      }),
    );
    const normalizedSplitSquares = SPLITS.reduce((sum, split) => {
      const total = Object.values(perSplit[split]).reduce(
        (inner, value) => inner + value,
        0,
      );
      return (
        sum +
        DISCOURSES.reduce(
          (inner, discourse) => inner + (perSplit[split][discourse] / total) ** 2,
          0,
        )
      );
    }, 0);
    const score = [
      splitTopicDiversity,
      splitDiscourseDiversity,
      -maximumOverall,
      -overallSquares,
      -maximumSplitShare,
      -normalizedSplitSquares,
    ];
    const candidate = {
      allocation,
      score,
      tieRank: sha256(`${SEED}|allocation|${JSON.stringify(allocation)}`),
      maximumOverall,
      majorityCompliant: maximumOverall <= REQUIRED_SELECTED_ROWS / 2,
    };
    const selectBetter = (current) => {
      if (!current) return candidate;
      const comparison = compareScore(candidate.score, current.score);
      if (comparison > 0) return candidate;
      if (comparison === 0 && candidate.tieRank < current.tieRank) return candidate;
      return current;
    };
    bestAny = selectBetter(bestAny);
    if (candidate.majorityCompliant) {
      bestWithoutMajority = selectBetter(bestWithoutMajority);
    }
  }

  function visit(topicIndex, diversity) {
    if (topicIndex === TOPICS.length) {
      evaluate(diversity);
      return;
    }
    const topic = TOPICS[topicIndex];
    for (const plan of plans[topic]) {
      chosen[topic] = plan;
      visit(topicIndex + 1, diversity + plan.diverseCells);
    }
  }
  visit(0, 0);
  const selected = bestWithoutMajority ?? bestAny;
  check(selected, "no allocation was produced");
  return {
    allocation: selected.allocation,
    maximumOverall: selected.maximumOverall,
    majorityAvoidanceFeasible: Boolean(bestWithoutMajority),
  };
}

function independentlySelectRows(dualPassRows, allocation) {
  const selected = [];
  for (const topic of TOPICS) {
    for (const discourse of allowedDiscourses(topic)) {
      const candidates = dualPassRows
        .filter((row) => row.topic === topic && row.discourse === discourse)
        .map((row) => ({
          row,
          rank: sha256(`${SEED}|row|${row.contentHash}`),
        }))
        .sort(
          (left, right) =>
            left.rank.localeCompare(right.rank, "en") ||
            left.row.contentHash.localeCompare(right.row.contentHash, "en"),
        );
      let offset = 0;
      for (const split of SPLITS) {
        const required = allocation[split][topic][discourse] ?? 0;
        const slice = candidates.slice(offset, offset + required);
        check(slice.length === required, `${split}/${topic}/${discourse} shortage`);
        for (const candidate of slice) {
          selected.push({
            frameId: candidate.row.frameId,
            contentHash: candidate.row.contentHash,
            split,
            topic,
            discourse,
            wordBand: candidate.row.wordBand,
            deterministicRank: candidate.rank,
          });
        }
        offset += required;
      }
    }
  }
  return selected;
}

function summarizeSplit(rows) {
  return Object.fromEntries(
    SPLITS.map((split) => {
      const subset = rows.filter((row) => row.split === split);
      return [
        split,
        {
          rows: subset.length,
          discourse: distribution(subset, "discourse", DISCOURSES),
          topic: distribution(subset, "topic", TOPICS),
          wordBand: distribution(subset, "wordBand", WORD_BANDS),
          topicByDiscourse: topicByDiscourse(subset),
        },
      ];
    }),
  );
}

function verifyReconciliationPublicManifest() {
  const file = path.join(here, "RECONCILIATION-MANIFEST.sha256");
  const lines = readFileSync(file, "utf8").trim().split(/\r?\n/u);
  check(
    lines.length === RECONCILIATION_PUBLIC_FILES.length,
    "reconciliation public manifest entry count changed",
  );
  const actualFiles = [];
  for (const [index, line] of lines.entries()) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    check(match, `reconciliation manifest line ${index + 1} malformed`);
    check(!match[2].includes("private"), "public manifest exposes a private path");
    actualFiles.push(match[2]);
    check(
      fileSha256(path.join(here, match[2])) === match[1],
      `reconciliation public artifact changed: ${match[2]}`,
    );
  }
  same(actualFiles, RECONCILIATION_PUBLIC_FILES, "public manifest file set/order changed");
}

function assertNoPublicLeak(summaryRaw, auditRaw, manifestRaw, frameRows, privateHash) {
  const summary = JSON.parse(summaryRaw);
  const forbiddenKeys = new Set([
    "frameId",
    "contentHash",
    "contentDigest",
    "queueSequence",
    "selectedSplit",
    "reviewerAVerdict",
    "reviewerBVerdict",
    "privateNotes",
    "siteReasoning",
    "candidateSite",
    "passage",
    "passageText",
  ]);
  function walk(value, pointer = "$") {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) walk(item, `${pointer}[${index}]`);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      check(!forbiddenKeys.has(key), `public summary leaks ${key} at ${pointer}`);
      walk(child, `${pointer}.${key}`);
    }
  }
  walk(summary);
  const releaseBytes = `${summaryRaw}\n${auditRaw}\n${manifestRaw}`;
  for (const row of frameRows) {
    check(!releaseBytes.includes(row.frameId), "public release leaks a frame ID");
    check(!releaseBytes.includes(row.contentHash), "public release leaks a content digest");
  }
  check(!releaseBytes.includes(privateHash), "public release leaks private artifact hash");
  check(!manifestRaw.includes("private/"), "public manifest exposes private membership");
  check(
    summary.privacy?.containsRowIds === false &&
      summary.privacy?.containsContentDigests === false &&
      summary.privacy?.containsPassageText === false &&
      summary.privacy?.containsSplitMembership === false &&
      summary.privacy?.containsPrivateJudgments === false &&
      summary.privacy?.containsPrivateArtifactHashes === false,
    "public privacy assertions changed",
  );
}

for (const specification of SEALED_INPUT_MANIFESTS) {
  verifyHashManifest(specification);
  rerunVerifier(specification);
}

const source = readJson("source-frame-public.json");
const reviewerA = readJson("private/reviewer-a.json");
const reviewerBLines = readFileSync(
  path.join(here, "private/reviewer-b-review.json"),
  "utf8",
)
  .trim()
  .split(/\r?\n/u)
  .map((line) => JSON.parse(line));
const reviewerBHeader = reviewerBLines[0];
const reviewerBRows = reviewerBLines.slice(1);
const privateOutput = readJson("private/reconciliation-and-split-v2.json");
const publicOutput = readJson("reviewer-reconciliation-summary.json");

check(source.rows.length === EXPECTED_ROWS, "source row count changed");
check(reviewerA.rows.length === EXPECTED_ROWS, "Reviewer A row count changed");
check(reviewerBRows.length === EXPECTED_ROWS, "Reviewer B row count changed");
check(reviewerA.bindingHash === source.bindingHash, "Reviewer A binding changed");
check(reviewerBHeader.bindingHash === source.bindingHash, "Reviewer B binding changed");
check(privateOutput.sourceBindingHash === source.bindingHash, "private binding changed");

const frameRows = source.rows.map((row) => ({
  frameId: row.frameId,
  contentHash: row.contentHash,
  discourse: row.discourse,
  topic: row.topic,
  wordBand: row.wordBand,
}));
const matrix = Object.fromEntries(
  VERDICTS.flatMap((a) => VERDICTS.map((b) => [`A_${a}__B_${b}`, 0])),
);
const dispositions = { DUAL_PASS: 0, EXCLUDE: 0, DOMAIN_REVIEW: 0 };
const expectedPrivateRows = [];
const dualPassRows = [];

for (let index = 0; index < EXPECTED_ROWS; index += 1) {
  const frame = frameRows[index];
  const a = reviewerA.rows[index];
  const b = reviewerBRows[index];
  check(a.frameId === frame.frameId, `Reviewer A frame mismatch at ${index + 1}`);
  check(a.contentHash === frame.contentHash, `Reviewer A digest mismatch at ${index + 1}`);
  check(b.ordinal === index + 1, `Reviewer B ordinal mismatch at ${index + 1}`);
  check(VERDICTS.includes(a.outcome), `Reviewer A verdict invalid at ${index + 1}`);
  check(VERDICTS.includes(b.verdict), `Reviewer B verdict invalid at ${index + 1}`);
  increment(matrix, `A_${a.outcome}__B_${b.verdict}`);
  let disposition;
  if (a.outcome === "EXCLUDE" || b.verdict === "EXCLUDE") {
    disposition = "EXCLUDE";
  } else if (a.outcome === "DOMAIN_REVIEW" || b.verdict === "DOMAIN_REVIEW") {
    disposition = "DOMAIN_REVIEW";
  } else {
    disposition = "DUAL_PASS";
    dualPassRows.push(frame);
  }
  increment(dispositions, disposition);
  expectedPrivateRows.push({
    frameId: frame.frameId,
    contentHash: frame.contentHash,
    reviewerAVerdict: a.outcome,
    reviewerBVerdict: b.verdict,
    disposition,
    selectedSplit: null,
    campaignEligible: false,
  });
}

same(dispositions, EXPECTED_DISPOSITIONS, "reconciled dispositions changed");
same(publicOutput.intersectionMatrix, matrix, "public pair matrix mismatch");
same(publicOutput.dispositions, dispositions, "public disposition mismatch");
check(dualPassRows.length === 137, "dual-pass supply changed");

const optimization = independentlyOptimizeAllocation(dualPassRows);
same(
  privateOutput.selection.discourseAllocation,
  optimization.allocation,
  "discourse allocation is not the independently reproduced optimum",
);
check(optimization.majorityAvoidanceFeasible, "majority avoidance became infeasible");
check(optimization.maximumOverall === 15, "maximum selected discourse count changed");

const expectedSelections = independentlySelectRows(
  dualPassRows,
  optimization.allocation,
);
check(expectedSelections.length === REQUIRED_SELECTED_ROWS, "selected total changed");
same(
  privateOutput.selection.rows,
  expectedSelections,
  "seeded row selection or split assignment changed",
);
const splitByFrame = new Map(expectedSelections.map((row) => [row.frameId, row.split]));
for (const row of expectedPrivateRows) {
  row.selectedSplit = splitByFrame.get(row.frameId) ?? null;
}
same(privateOutput.rows, expectedPrivateRows, "private reconciled row ledger changed");
check(
  new Set(expectedSelections.map((row) => row.frameId)).size === REQUIRED_SELECTED_ROWS,
  "selected frame IDs are not unique",
);
check(
  new Set(expectedSelections.map((row) => row.contentHash)).size === REQUIRED_SELECTED_ROWS,
  "selected content digests are not unique",
);
check(
  expectedSelections.every((row) =>
    dualPassRows.some((candidate) => candidate.frameId === row.frameId),
  ),
  "a non-dual-pass row entered a split",
);

const expectedSplitSummary = summarizeSplit(expectedSelections);
same(publicOutput.frozenSplit.splitSummary, expectedSplitSummary, "split summary mismatch");
for (const split of SPLITS) {
  same(
    expectedSplitSummary[split].topic,
    TARGETS[split],
    `${split} frozen topic quota changed`,
  );
}
check(
  publicOutput.frozenSplit.replacementOrTopUpUsed === false &&
    publicOutput.threshold.replacementOrTopUpUsed === false &&
    privateOutput.selection.replacementOrTopUpUsed === false,
  "replacement/top-up prohibition changed",
);
check(
  publicOutput.authorization.campaignEligibleRows === 0 &&
    publicOutput.authorization.generationAuthorized === false &&
    privateOutput.rows.every((row) => row.campaignEligible === false),
  "campaign authorization changed",
);
check(
  publicOutput.remainingHolds.historyRefresh === "PENDING" &&
    publicOutput.remainingHolds.rightsReview === "PENDING" &&
    publicOutput.remainingHolds.providerControls === "PENDING" &&
    publicOutput.remainingHolds.operationalQueueSeal === "PENDING",
  "required authorization holds changed",
);
check(
  publicOutput.safety.apiCandidateCount === 0 &&
    publicOutput.safety.modelApiCalls === 0 &&
    publicOutput.safety.networkCalls === 0 &&
    publicOutput.safety.databaseCalls === 0,
  "offline safety ledger changed",
);

const privateArtifactPath = path.join(here, "private/reconciliation-and-split-v2.json");
const privateHash = fileSha256(privateArtifactPath);
const privateManifest = readJson("private/reconciliation-private-manifest.json");
same(
  privateManifest,
  {
    schemaVersion: "cross-type-grammar-v2-reconciliation-private-manifest-v1",
    artifact: "reconciliation-and-split-v2.json",
    sha256: privateHash,
    campaignEligibleRows: 0,
    generationAuthorized: false,
  },
  "private reconciliation manifest mismatch",
);

verifyReconciliationPublicManifest();
const summaryPath = path.join(here, "reviewer-reconciliation-summary.json");
const auditPath = path.join(here, "RECONCILIATION-AUDIT.md");
const publicManifestPath = path.join(here, "RECONCILIATION-MANIFEST.sha256");
assertNoPublicLeak(
  readFileSync(summaryPath, "utf8"),
  readFileSync(auditPath, "utf8"),
  readFileSync(publicManifestPath, "utf8"),
  frameRows,
  privateHash,
);

const builderModule = await import(
  `${pathToFileURL(path.join(here, "reconcile-and-split.mjs")).href}?verify=1`
);
const reproduced = builderModule.computeReviewerReconciliationAndSplit();
check(
  reproduced.privateBytes === readFileSync(privateArtifactPath, "utf8"),
  "builder no longer reproduces private bytes",
);
check(
  reproduced.publicBytes === readFileSync(summaryPath, "utf8"),
  "builder no longer reproduces public bytes",
);

process.stdout.write(
  `${JSON.stringify(
    {
      verdict: "VERIFIED_DUAL_PASS_EXACT_SPLIT_FROZEN_NOT_AUTHORIZED",
      inputRows: EXPECTED_ROWS,
      dispositions,
      selectedRows: REQUIRED_SELECTED_ROWS,
      splitRows: Object.fromEntries(
        SPLITS.map((split) => [split, expectedSplitSummary[split].rows]),
      ),
      maximumRowsFromOneDiscourse: optimization.maximumOverall,
      replacementOrTopUpUsed: false,
      campaignEligibleRows: 0,
      apiCandidateCount: 0,
      privateArtifactSha256: privateHash,
      publicSummarySha256: fileSha256(summaryPath),
      publicManifestSha256: fileSha256(publicManifestPath),
    },
    null,
    2,
  )}\n`,
);
