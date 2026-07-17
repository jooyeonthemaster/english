import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");

export const SELECTION_SEED =
  "cross-type-grammar-v2-dual-pass-split-20260715-v1";

export const SPLIT_TOPIC_TARGETS = {
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
const EXPECTED_ROWS = 186;
const REQUIRED_DUAL_PASS_ROWS = 38;

// These three byte hashes were frozen only after all three sealed verifiers
// passed, and before either private row-verdict file was opened for
// reconciliation. A changed manifest is a hard failure, not a new input.
const SEALED_MANIFESTS = [
  {
    key: "sourceFrame",
    manifest: "MANIFEST.sha256",
    manifestFileSha256:
      "ba8cddbc7dfa536e5d649e80acbf4f2c618d4ab116cef4267bd4c9f64e71d192",
    entryBase: repoRoot,
    expectedEntries: 6,
    verifier: "verify.mts",
  },
  {
    key: "reviewerA",
    manifest: "REVIEWER-A-MANIFEST.sha256",
    manifestFileSha256:
      "efc035a81f16f158354a9d60ab3d0c2ab45a555c47afb4c3d9d374c0b29e31bf",
    entryBase: here,
    expectedEntries: 4,
    verifier: "verify-reviewer-a.mts",
  },
  {
    key: "reviewerB",
    manifest: "REVIEWER-B-MANIFEST.sha256",
    manifestFileSha256:
      "dbccb3e3f79d2657153e8ec9e9efb4dd7e959cd886654949f3f3655f00e0c84b",
    entryBase: repoRoot,
    expectedEntries: 3,
    verifier: "verify-reviewer-b.mts",
  },
];

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Buffer = (value) =>
  createHash("sha256").update(value).digest("hex");
const sha256Text = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const sha256File = (filePath) => sha256Buffer(readFileSync(filePath));
const readJson = (relativePath) =>
  JSON.parse(readFileSync(path.join(here, relativePath), "utf8"));

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function increment(record, key, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function zeroRecord(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function orderedDistribution(rows, field, keys) {
  const counts = zeroRecord(keys);
  for (const row of rows) {
    check(keys.includes(row[field]), `unexpected ${field}: ${row[field]}`);
    increment(counts, row[field]);
  }
  return counts;
}

function topicDiscourseDistribution(rows) {
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

function safeVerifierEnvironment() {
  const allowedKeys = [
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
    allowedKeys
      .filter((key) => typeof process.env[key] === "string")
      .map((key) => [key, process.env[key]]),
  );
}

function readAndVerifyManifest(specification) {
  const manifestPath = path.join(here, specification.manifest);
  const manifestBytes = readFileSync(manifestPath);
  const actualManifestHash = sha256Buffer(manifestBytes);
  check(
    actualManifestHash === specification.manifestFileSha256,
    `sealed ${specification.key} manifest byte hash changed`,
  );
  const lines = manifestBytes.toString("utf8").trim().split(/\r?\n/u);
  check(
    lines.length === specification.expectedEntries,
    `sealed ${specification.key} manifest entry count changed`,
  );
  const entries = lines.map((line, index) => {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    check(match, `${specification.key} manifest line ${index + 1} is malformed`);
    const [, declaredSha256, relativePath] = match;
    const resolvedPath = path.resolve(specification.entryBase, relativePath);
    check(
      resolvedPath.startsWith(`${repoRoot}${path.sep}`),
      `${specification.key} manifest path escaped the repository`,
    );
    check(
      sha256File(resolvedPath) === declaredSha256,
      `${specification.key} manifest entry changed: ${relativePath}`,
    );
    return { relativePath, sha256: declaredSha256 };
  });
  return {
    manifestFile: specification.manifest,
    manifestFileSha256: actualManifestHash,
    entries,
  };
}

function runSealedVerifier(specification) {
  const result = spawnSync(
    process.execPath,
    [tsxCli, path.join(here, specification.verifier)],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: safeVerifierEnvironment(),
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  check(
    result.status === 0,
    `${specification.key} verifier failed: ${result.stderr || result.stdout}`,
  );
  return {
    verifierFile: specification.verifier,
    exitCode: result.status,
    stdoutSha256: sha256Text(result.stdout ?? ""),
    stderrSha256: sha256Text(result.stderr ?? ""),
  };
}

function verifyAndBindSealedInputs() {
  const manifests = Object.fromEntries(
    SEALED_MANIFESTS.map((specification) => [
      specification.key,
      readAndVerifyManifest(specification),
    ]),
  );
  const verifierRuns = Object.fromEntries(
    SEALED_MANIFESTS.map((specification) => [
      specification.key,
      runSealedVerifier(specification),
    ]),
  );
  return { manifests, verifierRuns };
}

function assertStaticTargets() {
  check(
    JSON.stringify(Object.keys(SPLIT_TOPIC_TARGETS)) === JSON.stringify(SPLITS),
    "split target order changed",
  );
  const expectedSplitTotals = {
    development: 6,
    confirmatory: 20,
    reserve: 12,
  };
  for (const split of SPLITS) {
    check(
      JSON.stringify(Object.keys(SPLIT_TOPIC_TARGETS[split])) ===
        JSON.stringify(TOPICS),
      `${split} topic target vocabulary changed`,
    );
    const total = Object.values(SPLIT_TOPIC_TARGETS[split]).reduce(
      (sum, value) => sum + value,
      0,
    );
    check(total === expectedSplitTotals[split], `${split} target total changed`);
  }
  check(
    Object.values(expectedSplitTotals).reduce((sum, value) => sum + value, 0) ===
      REQUIRED_DUAL_PASS_ROWS,
    "overall split target changed",
  );
}

function allowedDiscourses(topic) {
  return topic === "narrative-practical"
    ? ["narrative", "practical"]
    : ["argumentative", "expository"];
}

function totalTopicTargets() {
  return Object.fromEntries(
    TOPICS.map((topic) => [
      topic,
      SPLITS.reduce(
        (sum, split) => sum + SPLIT_TOPIC_TARGETS[split][topic],
        0,
      ),
    ]),
  );
}

function blockForInfeasibleQuota(reason, dualPassRows) {
  const availability = {
    dualPassRows: dualPassRows.length,
    topic: orderedDistribution(dualPassRows, "topic", TOPICS),
    topicByDiscourse: topicDiscourseDistribution(dualPassRows),
  };
  throw new Error(
    `BLOCK_NEW_PREREGISTRATION_REQUIRED: ${reason}; available=${JSON.stringify(
      availability,
    )}`,
  );
}

function assertQuotaFeasibility(dualPassRows) {
  if (dualPassRows.length < REQUIRED_DUAL_PASS_ROWS) {
    blockForInfeasibleQuota(
      `${dualPassRows.length} dual-pass rows < ${REQUIRED_DUAL_PASS_ROWS}`,
      dualPassRows,
    );
  }
  const targets = totalTopicTargets();
  for (const topic of TOPICS) {
    const permitted = new Set(allowedDiscourses(topic));
    const available = dualPassRows.filter(
      (row) => row.topic === topic && permitted.has(row.discourse),
    ).length;
    if (available < targets[topic]) {
      blockForInfeasibleQuota(
        `${topic} permitted-discourse supply ${available} < frozen target ${targets[topic]}`,
        dualPassRows,
      );
    }
  }
}

function enumerateTopicPlans(topic, availableByDiscourse) {
  const [first, second] = allowedDiscourses(topic);
  const plans = [];
  const current = {};
  function visit(splitIndex, usedFirst, usedSecond, diverseCells) {
    if (splitIndex === SPLITS.length) {
      const totalTarget = SPLITS.reduce(
        (sum, split) => sum + SPLIT_TOPIC_TARGETS[split][topic],
        0,
      );
      const bothAvailable =
        availableByDiscourse[first] > 0 &&
        availableByDiscourse[second] > 0 &&
        totalTarget >= 2;
      if (bothAvailable && (usedFirst === 0 || usedSecond === 0)) return;
      plans.push({
        bySplit: structuredClone(current),
        used: { [first]: usedFirst, [second]: usedSecond },
        diverseCells,
      });
      return;
    }
    const split = SPLITS[splitIndex];
    const quota = SPLIT_TOPIC_TARGETS[split][topic];
    for (let firstCount = 0; firstCount <= quota; firstCount += 1) {
      const secondCount = quota - firstCount;
      if (usedFirst + firstCount > availableByDiscourse[first]) continue;
      if (usedSecond + secondCount > availableByDiscourse[second]) continue;
      current[split] = { [first]: firstCount, [second]: secondCount };
      visit(
        splitIndex + 1,
        usedFirst + firstCount,
        usedSecond + secondCount,
        diverseCells + Number(firstCount > 0 && secondCount > 0),
      );
    }
  }
  visit(0, 0, 0, 0);
  return plans;
}

function compareScore(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function optimizeDiscourseAllocation(dualPassRows) {
  const availability = topicDiscourseDistribution(dualPassRows);
  const plansByTopic = Object.fromEntries(
    TOPICS.map((topic) => {
      const plans = enumerateTopicPlans(topic, availability[topic]);
      if (plans.length === 0) {
        blockForInfeasibleQuota(
          `${topic} has no exact discourse allocation for the frozen topic quotas`,
          dualPassRows,
        );
      }
      return [topic, plans];
    }),
  );

  const current = {};
  const overallDiscourse = zeroRecord(DISCOURSES);
  const splitDiscourse = Object.fromEntries(
    SPLITS.map((split) => [split, zeroRecord(DISCOURSES)]),
  );
  let bestAny = null;
  let bestNoMajority = null;

  function consider(splitTopicDiversity) {
    const splitDiscourseDiversity = SPLITS.reduce(
      (sum, split) =>
        sum +
        DISCOURSES.filter((discourse) => splitDiscourse[split][discourse] > 0)
          .length,
      0,
    );
    const overallValues = DISCOURSES.map(
      (discourse) => overallDiscourse[discourse],
    );
    const maximumOverallDiscourse = Math.max(...overallValues);
    const overallSquares = overallValues.reduce(
      (sum, value) => sum + value * value,
      0,
    );
    const maximumSplitShare = Math.max(
      ...SPLITS.flatMap((split) => {
        const splitTotal = Object.values(splitDiscourse[split]).reduce(
          (sum, value) => sum + value,
          0,
        );
        return DISCOURSES.map(
          (discourse) => splitDiscourse[split][discourse] / splitTotal,
        );
      }),
    );
    const normalizedSplitSquares = SPLITS.reduce((sum, split) => {
      const splitTotal = Object.values(splitDiscourse[split]).reduce(
        (innerSum, value) => innerSum + value,
        0,
      );
      return (
        sum +
        DISCOURSES.reduce(
          (innerSum, discourse) =>
            innerSum +
            (splitDiscourse[split][discourse] / splitTotal) ** 2,
          0,
        )
      );
    }, 0);
    const score = [
      splitTopicDiversity,
      splitDiscourseDiversity,
      -maximumOverallDiscourse,
      -overallSquares,
      -maximumSplitShare,
      -normalizedSplitSquares,
    ];
    const allocation = Object.fromEntries(
      SPLITS.map((split) => [
        split,
        Object.fromEntries(
          TOPICS.map((topic) => [topic, current[topic].bySplit[split]]),
        ),
      ]),
    );
    const canonical = JSON.stringify(allocation);
    const tieRank = sha256Text(`${SELECTION_SEED}|allocation|${canonical}`);
    const candidate = {
      allocation,
      score,
      tieRank,
      maximumOverallDiscourse,
      majorityCompliant:
        maximumOverallDiscourse <= REQUIRED_DUAL_PASS_ROWS / 2,
    };
    const update = (best) => {
      if (!best) return candidate;
      const comparison = compareScore(candidate.score, best.score);
      if (comparison > 0) return candidate;
      if (comparison === 0 && candidate.tieRank < best.tieRank) return candidate;
      return best;
    };
    bestAny = update(bestAny);
    if (candidate.majorityCompliant) bestNoMajority = update(bestNoMajority);
  }

  function visit(topicIndex, splitTopicDiversity) {
    if (topicIndex === TOPICS.length) {
      consider(splitTopicDiversity);
      return;
    }
    const topic = TOPICS[topicIndex];
    for (const plan of plansByTopic[topic]) {
      current[topic] = plan;
      for (const split of SPLITS) {
        for (const [discourse, count] of Object.entries(plan.bySplit[split])) {
          overallDiscourse[discourse] += count;
          splitDiscourse[split][discourse] += count;
        }
      }
      visit(topicIndex + 1, splitTopicDiversity + plan.diverseCells);
      for (const split of SPLITS) {
        for (const [discourse, count] of Object.entries(plan.bySplit[split])) {
          overallDiscourse[discourse] -= count;
          splitDiscourse[split][discourse] -= count;
        }
      }
    }
  }
  visit(0, 0);
  const selected = bestNoMajority ?? bestAny;
  check(selected, "no deterministic discourse allocation was produced");
  return {
    allocation: selected.allocation,
    majorityAvoidanceFeasible: Boolean(bestNoMajority),
    maximumOverallDiscourse: selected.maximumOverallDiscourse,
    optimizationScore: selected.score,
  };
}

function selectRows(dualPassRows, allocation) {
  const selections = [];
  for (const topic of TOPICS) {
    for (const discourse of allowedDiscourses(topic)) {
      const candidates = dualPassRows
        .filter(
          (row) => row.topic === topic && row.discourse === discourse,
        )
        .map((row) => ({
          row,
          rank: sha256Text(`${SELECTION_SEED}|row|${row.contentHash}`),
        }))
        .sort(
          (left, right) =>
            left.rank.localeCompare(right.rank, "en") ||
            left.row.contentHash.localeCompare(right.row.contentHash, "en"),
        );
      let offset = 0;
      for (const split of SPLITS) {
        const count = allocation[split][topic][discourse] ?? 0;
        const selected = candidates.slice(offset, offset + count);
        check(
          selected.length === count,
          `BLOCK_NEW_PREREGISTRATION_REQUIRED: ${split}/${topic}/${discourse} allocation is infeasible`,
        );
        for (const candidate of selected) {
          selections.push({
            frameId: candidate.row.frameId,
            contentHash: candidate.row.contentHash,
            split,
            topic,
            discourse,
            wordBand: candidate.row.wordBand,
            deterministicRank: candidate.rank,
          });
        }
        offset += count;
      }
    }
  }
  check(selections.length === REQUIRED_DUAL_PASS_ROWS, "selected row total changed");
  check(
    new Set(selections.map((row) => row.frameId)).size === selections.length,
    "duplicate selected frame ID",
  );
  check(
    new Set(selections.map((row) => row.contentHash)).size === selections.length,
    "duplicate selected content hash",
  );
  return selections;
}

function splitSummary(selections) {
  return Object.fromEntries(
    SPLITS.map((split) => {
      const rows = selections.filter((row) => row.split === split);
      return [
        split,
        {
          rows: rows.length,
          discourse: orderedDistribution(rows, "discourse", DISCOURSES),
          topic: orderedDistribution(rows, "topic", TOPICS),
          wordBand: orderedDistribution(rows, "wordBand", WORD_BANDS),
          topicByDiscourse: topicDiscourseDistribution(rows),
        },
      ];
    }),
  );
}

export function computeReviewerReconciliationAndSplit() {
  assertStaticTargets();

  // Ordering is intentional and audited: manifest byte binding and all three
  // verifier reruns finish before either reviewer row-verdict artifact is read.
  const sealedInputs = verifyAndBindSealedInputs();

  const frameSource = readJson("source-frame-public.json");
  const frameRows = frameSource.rows.map((row) => ({
    frameId: row.frameId,
    contentHash: row.contentHash,
    discourse: row.discourse,
    topic: row.topic,
    wordBand: row.wordBand,
  }));
  check(frameRows.length === EXPECTED_ROWS, "source frame row count changed");

  const reviewerASource = readJson("private/reviewer-a.json");
  const reviewerARows = reviewerASource.rows.map((row) => ({
    frameId: row.frameId,
    contentHash: row.contentHash,
    verdict: row.outcome,
  }));

  const reviewerBLines = readFileSync(
    path.join(here, "private/reviewer-b-review.json"),
    "utf8",
  )
    .trim()
    .split(/\r?\n/u);
  const reviewerBHeader = JSON.parse(reviewerBLines[0]);
  const reviewerBRows = reviewerBLines.slice(1).map((line) => {
    const row = JSON.parse(line);
    return { ordinal: row.ordinal, verdict: row.verdict };
  });

  check(
    reviewerASource.bindingHash === frameSource.bindingHash,
    "Reviewer A/source binding mismatch",
  );
  check(
    reviewerBHeader.bindingHash === frameSource.bindingHash,
    "Reviewer B/source binding mismatch",
  );
  check(reviewerARows.length === EXPECTED_ROWS, "Reviewer A row count changed");
  check(reviewerBRows.length === EXPECTED_ROWS, "Reviewer B row count changed");

  const pairMatrix = Object.fromEntries(
    VERDICTS.flatMap((reviewerA) =>
      VERDICTS.map((reviewerB) => [
        `A_${reviewerA}__B_${reviewerB}`,
        0,
      ]),
    ),
  );
  const dispositions = { DUAL_PASS: 0, EXCLUDE: 0, DOMAIN_REVIEW: 0 };
  const privateRows = [];
  const dualPassRows = [];

  for (let index = 0; index < frameRows.length; index += 1) {
    const frame = frameRows[index];
    const reviewerA = reviewerARows[index];
    const reviewerB = reviewerBRows[index];
    check(
      reviewerA.frameId === frame.frameId &&
        reviewerA.contentHash === frame.contentHash,
      `Reviewer A frozen-order binding mismatch at ordinal ${index + 1}`,
    );
    check(
      reviewerB.ordinal === index + 1,
      `Reviewer B frozen-order binding mismatch at ordinal ${index + 1}`,
    );
    check(VERDICTS.includes(reviewerA.verdict), "invalid Reviewer A verdict");
    check(VERDICTS.includes(reviewerB.verdict), "invalid Reviewer B verdict");
    increment(pairMatrix, `A_${reviewerA.verdict}__B_${reviewerB.verdict}`);

    let disposition;
    if (
      reviewerA.verdict === "EXCLUDE" ||
      reviewerB.verdict === "EXCLUDE"
    ) {
      disposition = "EXCLUDE";
    } else if (
      reviewerA.verdict === "DOMAIN_REVIEW" ||
      reviewerB.verdict === "DOMAIN_REVIEW"
    ) {
      disposition = "DOMAIN_REVIEW";
    } else {
      disposition = "DUAL_PASS";
      dualPassRows.push(frame);
    }
    increment(dispositions, disposition);
    privateRows.push({
      frameId: frame.frameId,
      contentHash: frame.contentHash,
      reviewerAVerdict: reviewerA.verdict,
      reviewerBVerdict: reviewerB.verdict,
      disposition,
      selectedSplit: null,
      campaignEligible: false,
    });
  }

  assertQuotaFeasibility(dualPassRows);
  const discourseOptimization = optimizeDiscourseAllocation(dualPassRows);
  const selections = selectRows(
    dualPassRows,
    discourseOptimization.allocation,
  );
  const selectionByFrameId = new Map(
    selections.map((row) => [row.frameId, row.split]),
  );
  for (const row of privateRows) {
    row.selectedSplit = selectionByFrameId.get(row.frameId) ?? null;
  }

  const dualPassDistribution = {
    discourse: orderedDistribution(dualPassRows, "discourse", DISCOURSES),
    topic: orderedDistribution(dualPassRows, "topic", TOPICS),
    wordBand: orderedDistribution(dualPassRows, "wordBand", WORD_BANDS),
    topicByDiscourse: topicDiscourseDistribution(dualPassRows),
  };
  const frozenSplitSummary = splitSummary(selections);

  const privateOutput = {
    schemaVersion: "cross-type-grammar-v2-reconciliation-private-v1",
    status: "FROZEN_DUAL_PASS_SPLIT_NOT_AUTHORIZED",
    sourceBindingHash: frameSource.bindingHash,
    sealedInputs,
    reconciliationPolicy:
      "Any EXCLUDE => EXCLUDE; otherwise any DOMAIN_REVIEW => DOMAIN_REVIEW; only PASS/PASS => DUAL_PASS.",
    selection: {
      seed: SELECTION_SEED,
      frozenTopicTargets: SPLIT_TOPIC_TARGETS,
      discourseAllocation: discourseOptimization.allocation,
      rows: selections,
      replacementOrTopUpUsed: false,
    },
    rows: privateRows,
    safety: {
      generatedQuestionsRead: 0,
      candidateSitesRead: 0,
      passageTextsReadByReconciler: 0,
      reviewerFreeTextNotesRead: 0,
      priorOutcomeScoresRead: 0,
      modelApiCalls: 0,
      networkCalls: 0,
      databaseCalls: 0,
      secretAccesses: 0,
      fullQuestionCandidatesGenerated: 0,
    },
  };

  const publicOutput = {
    schemaVersion: "cross-type-grammar-v2-reconciliation-summary-v1",
    reviewDate: "2026-07-15",
    status: "DUAL_PASS_SUPPLY_SUFFICIENT_EXACT_SPLIT_FROZEN_NOT_AUTHORIZED",
    sealedInputVerification: {
      sourceFrameVerifier: "PASS",
      reviewerAVerifier: "PASS",
      reviewerBVerifier: "PASS",
      exactManifestBindingsStoredOnlyInPrivateArtifact: true,
      verifierRerunsCompletedBeforePrivateVerdictAccess: true,
    },
    reconciliationPolicy: {
      anyExcludeMeansExclude: true,
      otherwiseAnyDomainReviewMeansDomainReview: true,
      dualPassRequiresPassPass: true,
    },
    intersectionMatrix: pairMatrix,
    dispositions,
    threshold: {
      requiredDualPassRows: REQUIRED_DUAL_PASS_ROWS,
      availableDualPassRows: dualPassRows.length,
      met: dualPassRows.length >= REQUIRED_DUAL_PASS_ROWS,
      replacementOrTopUpUsed: false,
    },
    dualPassDistribution,
    frozenSplit: {
      seed: SELECTION_SEED,
      selectedRows: selections.length,
      frozenTopicTargets: SPLIT_TOPIC_TARGETS,
      quotaFeasibility: "FEASIBLE_EXACT_NO_RELAXATION",
      availableDualPassByTopic: dualPassDistribution.topic,
      availableDualPassByTopicAndDiscourse:
        dualPassDistribution.topicByDiscourse,
      selectionMethod:
        "Exact frozen topic quotas; deterministic discourse-diversity optimization; then seeded ordering of content digests within topic/discourse cells.",
      metadataFieldsUsed: ["discourse", "topic", "wordBand"],
      passageTextUsed: false,
      reviewerOutcomeScoreUsed: false,
      noSingleDiscourseOverHalf: true,
      majorityAvoidanceFeasible:
        discourseOptimization.majorityAvoidanceFeasible,
      maximumRowsFromOneDiscourse:
        discourseOptimization.maximumOverallDiscourse,
      splitSummary: frozenSplitSummary,
      replacementOrTopUpUsed: false,
    },
    remainingHolds: {
      historyRefresh: "PENDING",
      rightsReview: "PENDING",
      providerControls: "PENDING",
      operationalQueueSeal: "PENDING",
    },
    authorization: {
      campaignEligibleRows: 0,
      generationAuthorized: false,
    },
    privacy: {
      containsRowIds: false,
      containsContentDigests: false,
      containsPassageText: false,
      containsSplitMembership: false,
      containsPrivateJudgments: false,
      containsPrivateArtifactHashes: false,
    },
    safety: {
      generatedQuestionsRead: 0,
      candidateSitesRead: 0,
      passageTextsReadByReconciler: 0,
      reviewerFreeTextNotesRead: 0,
      priorOutcomeScoresRead: 0,
      modelApiCalls: 0,
      networkCalls: 0,
      databaseCalls: 0,
      secretAccesses: 0,
      fullQuestionCandidatesGenerated: 0,
      apiCandidateCount: 0,
    },
  };

  return {
    privateOutput,
    privateBytes: stableJson(privateOutput),
    publicOutput,
    publicBytes: stableJson(publicOutput),
  };
}

if (process.argv.includes("--write")) {
  const output = computeReviewerReconciliationAndSplit();
  writeFileSync(
    path.join(here, "private/reconciliation-and-split-v2.json"),
    output.privateBytes,
  );
  writeFileSync(
    path.join(here, "reviewer-reconciliation-summary.json"),
    output.publicBytes,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        verdict:
          "DUAL_PASS_SUPPLY_SUFFICIENT_EXACT_SPLIT_FROZEN_NOT_AUTHORIZED",
        intersectionMatrix: output.publicOutput.intersectionMatrix,
        dispositions: output.publicOutput.dispositions,
        splitSummary: output.publicOutput.frozenSplit.splitSummary,
        campaignEligibleRows: 0,
        apiCandidateCount: 0,
      },
      null,
      2,
    )}\n`,
  );
}
