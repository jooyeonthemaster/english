import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, "../../../..");
const designPath = path.join(here, "campaign-v4.json");
const designBytes = readFileSync(designPath);
const design = JSON.parse(designBytes.toString("utf8"));

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const manifestLines = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
for (const line of manifestLines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  assert(match, `invalid manifest line: ${line}`);
  const [, expectedHash, relativePath] = match;
  assert.equal(
    sha256(readFileSync(path.join(here, relativePath))),
    expectedHash,
    `manifest hash drift: ${relativePath}`,
  );
}

const TYPES = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
  "TOPIC_SENTENCE_WRITING",
  "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
];
const FOCUS = new Set(["BLANK_INFERENCE", "GRAMMAR_ERROR"]);
const PLANS = ["STANDARD", "PREMIUM"];
const DIFFICULTIES = ["BASIC", "INTERMEDIATE", "KILLER"];
const PROFILES = [
  "CURRENT_BOUNDED",
  "COMPACT_CERTIFICATE",
  "SITE_INTENT_LEDGER",
  "ROLE_SPLIT_SELECTION",
];
const POLICIES = ["CURRENT_BOUNDED", "SELECTED_BY_FROZEN_RULE"];

const paritySequentialQueue = [];
for (let wave = 0; wave < 3; wave += 1) {
  for (let typeIndex = 0; typeIndex < TYPES.length; typeIndex += 1) {
    for (let planIndex = 0; planIndex < PLANS.length; planIndex += 1) {
      const type = TYPES[typeIndex];
      const plan = PLANS[planIndex];
      paritySequentialQueue.push({
        assignmentId: `PARITY-W${wave + 1}-${String(typeIndex + 1).padStart(2, "0")}-${plan}`,
        ordinal: paritySequentialQueue.length + 1,
        wave: wave + 1,
        type,
        plan,
        difficulty: DIFFICULTIES[(typeIndex + wave) % 3],
        admission: "sequential-whole-envelope-one-assignment-batch",
        onAdmissionFailure: "this-and-all-later-rows-budget_not_admitted_itt_failure",
      });
    }
  }
}
const paritySequentialQueueSha256 = sha256(
  Buffer.from(canonical(paritySequentialQueue), "utf8"),
);

const pad = (value, width = 3) => String(value).padStart(width, "0");
const queue = [];
let ordinal = 0;

function add(phase, type, plan, difficulty, passageToken, policy) {
  ordinal += 1;
  queue.push({
    slotId: `C4-${pad(ordinal, 4)}`,
    phase,
    type,
    plan,
    difficulty,
    passageToken,
    policy,
  });
}

function devPassage(type, difficulty) {
  const index = DIFFICULTIES.indexOf(difficulty) + 1;
  if (type === "BLANK_INFERENCE") return `BLANK_STRICT_DEV_${pad(index, 2)}`;
  if (type === "GRAMMAR_ERROR") return `GRAMMAR_DEV_${pad(index, 2)}`;
  const nonFocus = TYPES.filter((candidate) => !FOCUS.has(candidate));
  return `DB_GENERAL_${pad(nonFocus.indexOf(type) + 1, 2)}`;
}

for (const type of TYPES) {
  for (const plan of PLANS) {
    for (const difficulty of DIFFICULTIES) {
      add(
        "D1_ALL_TYPE_CURRENT_SENTINEL",
        type,
        plan,
        difficulty,
        devPassage(type, difficulty),
        "CURRENT_BOUNDED",
      );
    }
  }
}

function pilotDifficulty(index) {
  if (index <= 2) return "BASIC";
  if (index <= 5) return "INTERMEDIATE";
  return "KILLER";
}

for (const type of FOCUS) {
  for (let passage = 1; passage <= 10; passage += 1) {
    for (const plan of PLANS) {
      for (const profile of PROFILES) {
        add(
          "D2_FOCUS_PROFILE_SCREEN",
          type,
          plan,
          pilotDifficulty(passage),
          `${type === "BLANK_INFERENCE" ? "BLANK_STRICT_DEV" : "GRAMMAR_DEV"}_${pad(passage, 2)}`,
          profile,
        );
      }
    }
  }
}

function strictRobustDifficulty(index) {
  return DIFFICULTIES[index - 1];
}

function sixPassageDifficulty(index) {
  if (index === 1) return "BASIC";
  if (index <= 3) return "INTERMEDIATE";
  return "KILLER";
}

function twelvePassageDifficulty(index) {
  if (index <= 2) return "BASIC";
  if (index <= 6) return "INTERMEDIATE";
  return "KILLER";
}

for (const type of FOCUS) {
  for (let passage = 1; passage <= 3; passage += 1) {
    for (const plan of PLANS) {
      for (const policy of POLICIES) {
        add(
          "C0_FROZEN_ROBUSTNESS_GATE",
          type,
          plan,
          strictRobustDifficulty(passage),
          `${type === "BLANK_INFERENCE" ? "BLANK_STRICT_ROBUST" : "GRAMMAR_STRICT_ROBUST"}_${pad(passage, 2)}`,
          policy,
        );
      }
    }
  }
}

for (const stratum of ["BLANK_ALT_LONG", "BLANK_ALT_SHORT"]) {
  for (let passage = 1; passage <= 6; passage += 1) {
    for (const plan of PLANS) {
      for (const policy of POLICIES) {
        add(
          "C0_FROZEN_ROBUSTNESS_GATE",
          "BLANK_INFERENCE",
          plan,
          sixPassageDifficulty(passage),
          `${stratum}_${pad(passage, 2)}`,
          policy,
        );
      }
    }
  }
}

for (let passage = 1; passage <= 12; passage += 1) {
  for (const plan of PLANS) {
    for (const policy of POLICIES) {
      add(
        "C0_FROZEN_ROBUSTNESS_GATE",
        "GRAMMAR_ERROR",
        plan,
        twelvePassageDifficulty(passage),
        `GRAMMAR_EXTRA_ROBUST_${pad(passage, 2)}`,
        policy,
      );
    }
  }
}

function holdoutDifficulty(index) {
  if (index <= 10) return "BASIC";
  if (index <= 22) return "INTERMEDIATE";
  return "KILLER";
}

for (const type of FOCUS) {
  for (let passage = 1; passage <= 46; passage += 1) {
    const policyOrder = passage % 2 === 1 ? POLICIES : [...POLICIES].reverse();
    for (const plan of PLANS) {
      for (const policy of policyOrder) {
        add(
          "C1_FOCUS_HOLDOUT_CONFIRMATORY",
          type,
          plan,
          holdoutDifficulty(passage),
          `${type === "BLANK_INFERENCE" ? "BLANK_STRICT_HOLDOUT" : "GRAMMAR_HOLDOUT"}_${pad(passage, 2)}`,
          policy,
        );
      }
    }
  }
}

for (const type of TYPES) {
  for (const plan of PLANS) {
    for (const difficulty of DIFFICULTIES) {
      add(
        "C2_ALL_TYPE_RELEASE_SENTINEL",
        type,
        plan,
        difficulty,
        devPassage(type, difficulty),
        FOCUS.has(type) ? "SELECTED_BY_FROZEN_RULE" : "FROZEN_CURRENT_RELEASE",
      );
    }
  }
}

for (const type of FOCUS) {
  for (let passage = 1; passage <= 3; passage += 1) {
    for (const plan of PLANS) {
      add(
        "C3_STOCHASTIC_REPRODUCIBILITY",
        type,
        plan,
        strictRobustDifficulty(passage),
        `${type === "BLANK_INFERENCE" ? "BLANK_STRICT_DEV" : "GRAMMAR_DEV"}_${pad(passage, 2)}`,
        "SELECTED_BY_FROZEN_RULE",
      );
    }
  }
}

const countBy = (key) =>
  Object.fromEntries(
    [...new Set(queue.map((row) => row[key]))]
      .sort()
      .map((value) => [value, queue.filter((row) => row[key] === value).length]),
  );

assert.equal(design.authorization.modelApiCalls, 0);
assert.equal(design.authorization.operationalCandidateSlots, 0);
assert.equal(design.reducedRegistry.operationalAuthorization, 0);
assert.equal(
  design.productionParityRegistry.admissionRegimes.SEQUENTIAL_ONE_ASSIGNMENT_PER_BATCH
    .operationalAuthorization,
  0,
);
assert.equal(paritySequentialQueue.length, 150);
for (const type of TYPES) {
  for (const plan of PLANS) {
    const rows = paritySequentialQueue.filter((row) => row.type === type && row.plan === plan);
    assert.equal(rows.length, 3);
    assert.deepEqual(new Set(rows.map((row) => row.difficulty)), new Set(DIFFICULTIES));
  }
  for (let wave = 1; wave <= 3; wave += 1) {
    const pair = paritySequentialQueue.filter((row) => row.type === type && row.wave === wave);
    assert.equal(pair.length, 2);
    assert.equal(pair[0].plan, "STANDARD");
    assert.equal(pair[1].plan, "PREMIUM");
    assert.equal(pair[1].ordinal, pair[0].ordinal + 1);
    assert.equal(pair[0].difficulty, pair[1].difficulty);
  }
}
assert.equal(
  design.productionParityRegistry.admissionRegimes.SEQUENTIAL_ONE_ASSIGNMENT_PER_BATCH
    .symbolicAssignmentQueueSha256,
  paritySequentialQueueSha256,
  "sequential parity assignment queue hash drift",
);
assert.equal(queue.length, 960);
assert.equal(new Set(queue.map((row) => row.slotId)).size, 960);
assert.equal(
  design.reducedRegistry.candidateBudget.allocatedExecutableSlots +
    design.reducedRegistry.candidateBudget.permanentlyLockedSlots,
  1000,
);
assert.equal(design.reducedRegistry.candidateBudget.topUpAllowed, false);
assert.equal(design.reducedRegistry.candidateBudget.replacementAllowedAfterAnyOutcome, false);

assert.deepEqual(
  design.reducedRegistry.typeAllocation.map((row) => row.type),
  TYPES,
);
const expectedTypes = Object.fromEntries(
  design.reducedRegistry.typeAllocation.map((row) => [row.type, row.candidateSlots]),
);
assert.deepEqual(countBy("type"), Object.fromEntries(Object.entries(expectedTypes).sort()));
assert.deepEqual(countBy("plan"), { PREMIUM: 480, STANDARD: 480 });
assert.deepEqual(countBy("difficulty"), {
  BASIC: 240,
  INTERMEDIATE: 288,
  KILLER: 432,
});

const expectedPhaseCounts = Object.fromEntries(
  design.reducedRegistry.phases.map((phase) => [phase.id, phase.candidateSlots]),
);
assert.deepEqual(countBy("phase"), Object.fromEntries(Object.entries(expectedPhaseCounts).sort()));
for (const phase of design.reducedRegistry.phases) {
  const phaseRows = queue.filter((row) => row.phase === phase.id);
  const phasePlanCounts = Object.fromEntries(
    PLANS.map((plan) => [plan, phaseRows.filter((row) => row.plan === plan).length]),
  );
  const phaseDifficultyCounts = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [
      difficulty,
      phaseRows.filter((row) => row.difficulty === difficulty).length,
    ]),
  );
  assert.deepEqual(phasePlanCounts, phase.planSlots);
  assert.deepEqual(phaseDifficultyCounts, phase.difficultySlots);
  let physicalCalls = 0;
  let designCalls = 0;
  let solverCalls = 0;
  for (const plan of PLANS) {
    const calls = phase.physicalCallsByModelAndPurpose[plan];
    assert.equal(calls.candidate, phase.planSlots[plan]);
    physicalCalls += calls.candidate + calls.design + calls.solver;
    designCalls += calls.design;
    solverCalls += calls.solver;
  }
  assert.equal(physicalCalls, phase.physicalCallCap);
  assert.equal(designCalls, phase.designLogicalOperations);
  assert.equal(solverCalls, phase.evaluationLogicalOperations);
}
assert.equal(Object.values(expectedPhaseCounts).reduce((sum, value) => sum + value, 0), 960);
assert.equal(
  design.reducedRegistry.typeAllocation.reduce((sum, row) => sum + row.candidateSlots, 0),
  960,
);

const blankStrictUnique = new Set(
  queue
    .filter((row) => row.passageToken.startsWith("BLANK_STRICT_"))
    .map((row) => row.passageToken),
);
assert.equal(blankStrictUnique.size, 59);
assert.equal([...blankStrictUnique].filter((token) => token.includes("_DEV_")).length, 10);
assert.equal([...blankStrictUnique].filter((token) => token.includes("_HOLDOUT_")).length, 46);
assert.equal([...blankStrictUnique].filter((token) => token.includes("_ROBUST_")).length, 3);
assert.equal(
  new Set(queue.filter((row) => row.passageToken.startsWith("DB_GENERAL_")).map((row) => row.passageToken)).size,
  23,
);

for (const type of FOCUS) {
  for (const plan of PLANS) {
    const rows = queue.filter(
      (row) =>
        row.phase === "C1_FOCUS_HOLDOUT_CONFIRMATORY" &&
        row.type === type &&
        row.plan === plan,
    );
    assert.equal(rows.length, 92);
    let currentFirst = 0;
    let selectedFirst = 0;
    for (let passage = 1; passage <= 46; passage += 1) {
      const token = `${type === "BLANK_INFERENCE" ? "BLANK_STRICT_HOLDOUT" : "GRAMMAR_HOLDOUT"}_${pad(passage, 2)}`;
      const pair = rows.filter((row) => row.passageToken === token);
      assert.equal(pair.length, 2);
      if (pair[0].policy === "CURRENT_BOUNDED") currentFirst += 1;
      else selectedFirst += 1;
    }
    assert.equal(currentFirst, 23);
    assert.equal(selectedFirst, 23);
  }
}

const totalPhysical = design.reducedRegistry.phases.reduce(
  (sum, phase) => sum + phase.physicalCallCap,
  0,
);
assert.equal(totalPhysical, 1684);
assert.deepEqual(design.resourceCaps.physicalCallCaps, {
  candidate: 960,
  design: 382,
  solver: 342,
  campaign: 1684,
  byModel: {
    "google/gemini-3.5-flash": 805,
    "google/gemini-3.1-pro-preview": 879,
  },
});

const expectedOutput = 960 * 12000 + 382 * 4000 + 342 * 2048;
assert.equal(design.resourceCaps.tokenCaps.campaignInput, 1684 * 64000);
assert.equal(design.resourceCaps.tokenCaps.campaignOutput, expectedOutput);

const pricingPath = path.join(
  repository,
  "experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json",
);
const pricingBytes = readFileSync(pricingPath);
assert.equal(sha256(pricingBytes), design.resourceCaps.pricingSnapshot.artifactSha256);
const pricing = JSON.parse(pricingBytes.toString("utf8"));
assert.equal(pricing.snapshotSha256, design.resourceCaps.pricingSnapshot.embeddedSnapshotSha256);
const flash = pricing.models.find((model) => model.id === "google/gemini-3.5-flash");
const pro = pricing.models.find((model) => model.id === "google/gemini-3.1-pro-preview");
assert(flash && pro);
const rate = {
  STANDARD: [
    flash.conservativeRates.promptUnder200kUsdPerToken,
    flash.conservativeRates.completionUnder200kUsdPerToken,
  ],
  PREMIUM: [
    pro.conservativeRates.promptUnder200kUsdPerToken,
    pro.conservativeRates.completionUnder200kUsdPerToken,
  ],
};
const counts = {
  STANDARD: { candidate: 480, design: 154, solver: 171 },
  PREMIUM: { candidate: 480, design: 228, solver: 171 },
};
let rawCost = 0;
for (const plan of PLANS) {
  const [inputRate, outputRate] = rate[plan];
  const planCounts = counts[plan];
  rawCost += planCounts.candidate * (64000 * inputRate + 12000 * outputRate);
  rawCost += planCounts.design * (64000 * inputRate + 4000 * outputRate);
  rawCost += planCounts.solver * (64000 * inputRate + 2048 * outputRate);
}
assert(Math.abs(rawCost - design.resourceCaps.provisionalUsdCapsUsingStaleSnapshot.rawTokenPriceEnvelopeUsd) < 1e-9);
assert.equal(Math.ceil(rawCost * 1.1 * 100) / 100, 662.5);
for (const phase of design.reducedRegistry.phases) {
  let phaseRawCost = 0;
  for (const plan of PLANS) {
    const [inputRate, outputRate] = rate[plan];
    const calls = phase.physicalCallsByModelAndPurpose[plan];
    phaseRawCost += calls.candidate * (64000 * inputRate + 12000 * outputRate);
    phaseRawCost += calls.design * (64000 * inputRate + 4000 * outputRate);
    phaseRawCost += calls.solver * (64000 * inputRate + 2048 * outputRate);
  }
  const expectedPhaseCap = Math.ceil(phaseRawCost * 1.1 * 100) / 100;
  assert.equal(
    design.resourceCaps.provisionalUsdCapsUsingStaleSnapshot.phaseCapsUsd[phase.id],
    expectedPhaseCap,
    `phase price envelope drift: ${phase.id}`,
  );
}
const summedPhaseCaps = Object.values(
  design.resourceCaps.provisionalUsdCapsUsingStaleSnapshot.phaseCapsUsd,
).reduce((sum, value) => sum + value, 0);
assert(Math.abs(summedPhaseCaps - 662.52) < 1e-9);
assert.equal(
  design.resourceCaps.provisionalUsdCapsUsingStaleSnapshot.provisionalCampaignCapAfterPerPhaseCentRoundingUsd,
  662.52,
);

const symbolicQueueSha256 = sha256(Buffer.from(canonical(queue), "utf8"));
if (process.argv.includes("--print-hash")) {
  process.stdout.write(`${symbolicQueueSha256}\n`);
  process.exit(0);
}
assert.equal(
  design.reducedRegistry.queue.symbolicQueueSha256,
  symbolicQueueSha256,
  "symbolic queue hash drift",
);

process.stdout.write(
  JSON.stringify(
    {
      status: "PASS_DESIGN_INVARIANTS_ONLY_EXECUTION_REMAINS_BLOCKED",
      modelApiCalls: 0,
      queueRows: queue.length,
      symbolicQueueSha256,
      paritySequentialQueueSha256,
      candidateSlots: 960,
      permanentlyLockedSlots: 40,
      physicalCallCap: totalPhysical,
      rawStalePriceEnvelopeUsd: rawCost,
      executionAuthorization: 0,
    },
    null,
    2,
  ) + "\n",
);
