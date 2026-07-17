import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const formulas = JSON.parse(readFileSync(path.join(here, "formulas.json"), "utf8"));

const round = (value, places = 9) => {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

const rangeFlags = (names) => {
  const rows = [];
  for (let mask = 0; mask < 2 ** names.length; mask += 1) {
    const value = {};
    names.forEach((name, index) => {
      value[name] = (mask & (1 << index)) === 0 ? 0 : 1;
    });
    rows.push(value);
  }
  return rows;
};

const sameOuter = (left, right) =>
  ["strict", "relaxed", "scarce", "salvage"].every(
    (key) => left[key] === right[key],
  );

export const wrapperLogicalResponses = (applicationAttempts) =>
  3 * applicationAttempts;

export const wrapperPhysicalFetches = (applicationAttempts, sdkMultiplier) =>
  3 * applicationAttempts * sdkMultiplier;

export const wrapperOutputTokens = (
  maxOutputTokens,
  applicationAttempts,
  sdkMultiplier,
) =>
  applicationAttempts *
  sdkMultiplier *
  (maxOutputTokens +
    32_000 +
    Math.min(32_000, Math.max(maxOutputTokens, 24_000)));

function enumerateOuterPolicies(cell) {
  const current = cell.currentOuter;
  const strictValues = [...new Set([1, current.strict])].sort((a, b) => a - b);
  const optional = ["relaxed", "scarce", "salvage"].filter(
    (key) => current[key] > 0,
  );
  return strictValues.flatMap((strict) =>
    rangeFlags(optional).map((flags) => {
      const outer = {
        strict,
        relaxed: flags.relaxed ?? 0,
        scarce: flags.scarce ?? 0,
        salvage: flags.salvage ?? 0,
      };
      const isCurrent = sameOuter(outer, current);
      const loweredStrict = strict < current.strict;
      const disabledCurrentLane = optional.some(
        (key) => current[key] > 0 && outer[key] === 0,
      );
      return {
        ...outer,
        policyClass: isCurrent
          ? "CURRENT_OUTER_TOPOLOGY"
          : loweredStrict
            ? "HYPOTHETICAL_STRICT_REDUCTION"
            : disabledCurrentLane
              ? "HYPOTHETICAL_FALLBACK_SUBSET"
              : "HYPOTHETICAL_OTHER",
      };
    }),
  );
}

const outerPasses = (outer) =>
  outer.strict + outer.relaxed + outer.scarce + outer.salvage;

function scenarioId(cellId, p) {
  const ladder = p.ladder
    ? `-c${p.ladder.cycles}-r${p.ladder.softRepairPerCycle}-p${p.ladder.parseAttemptsPerStage}`
    : "";
  return [
    cellId,
    `sdk${p.sdkRetries}`,
    `app${p.applicationAttempts}`,
    `t${p.triggerExecutions}`,
    `s${p.outer.strict}`,
    `r${p.outer.relaxed}`,
    `c${p.outer.scarce}`,
    `v${p.outer.salvage}${ladder}`,
  ].join("|");
}

export function computeScenario(cellId, params) {
  const cell = formulas.cellDefinitions[cellId];
  if (!cell) throw new Error(`Unknown cell ${cellId}`);
  const S = params.sdkRetries + 1;
  const A = params.applicationAttempts;
  const T = params.triggerExecutions;
  const Q = outerPasses(params.outer);
  const candidateGenerationWrappers = Q;
  const candidateRepairWrappers = Q;
  const candidateWrappers = candidateGenerationWrappers + candidateRepairWrappers;
  const evaluationWrappers = cell.solver
    ? (cell.solverLanes.includes("strict") ? params.outer.strict : 0) +
      (cell.solverLanes.includes("relaxed") ? params.outer.relaxed : 0) +
      (cell.solverLanes.includes("scarce") ? params.outer.scarce : 0) +
      (cell.solverLanes.includes("salvage") ? params.outer.salvage : 0)
    : 0;

  let designLogical = 0;
  let ladderCandidateLogical = 0;
  let ladderPhysical = 0;
  let ladderOutputTokens = 0;
  if (cell.ladder) {
    const { cycles, softRepairPerCycle, parseAttemptsPerStage } = params.ladder;
    designLogical =
      params.outer.strict * cycles * parseAttemptsPerStage;
    ladderCandidateLogical =
      params.outer.strict *
      cycles *
      (1 + softRepairPerCycle) *
      parseAttemptsPerStage;
    ladderPhysical =
      params.outer.strict *
      cycles *
      (2 + softRepairPerCycle) *
      parseAttemptsPerStage *
      S;
    ladderOutputTokens = ladderPhysical * cell.ladderMaxOutputTokensPerFire;
  }

  const candidateLogical =
    candidateWrappers * wrapperLogicalResponses(A) + ladderCandidateLogical;
  const evaluationLogical = evaluationWrappers * wrapperLogicalResponses(A);
  const wrapperCandidatePhysical =
    candidateWrappers * wrapperPhysicalFetches(A, S);
  const evaluationPhysical =
    evaluationWrappers * wrapperPhysicalFetches(A, S);
  const physicalPerEngine =
    wrapperCandidatePhysical + evaluationPhysical + ladderPhysical;

  const generationOutput = cell.candidateGenerationMaxOutputTokensByLane
    ? ["strict", "relaxed", "scarce", "salvage"].reduce(
        (sum, lane) =>
          sum +
          params.outer[lane] *
            wrapperOutputTokens(
              cell.candidateGenerationMaxOutputTokensByLane[lane] ??
                cell.candidateGenerationMaxOutputTokens,
              A,
              S,
            ),
        0,
      )
    : candidateGenerationWrappers *
      wrapperOutputTokens(cell.candidateGenerationMaxOutputTokens, A, S);
  const repairOutput =
    candidateRepairWrappers *
    wrapperOutputTokens(cell.candidateRepairMaxOutputTokens, A, S);
  const evaluationOutput =
    evaluationWrappers > 0
      ? evaluationWrappers *
        wrapperOutputTokens(cell.solverMaxOutputTokens, A, S)
      : 0;

  let flashOutputPerEngine = 0;
  let proOutputPerEngine = 0;
  if (cell.candidateModel === "flash") {
    flashOutputPerEngine += generationOutput + repairOutput;
  } else {
    proOutputPerEngine += generationOutput + repairOutput;
  }
  if (cell.solverModel === "flash") flashOutputPerEngine += evaluationOutput;
  if (cell.solverModel === "pro") proOutputPerEngine += evaluationOutput;
  if (cell.ladder) proOutputPerEngine += ladderOutputTokens;

  const currentLadder = !cell.ladder ||
    (params.ladder.cycles === cell.currentLadder.cycles &&
      params.ladder.softRepairPerCycle ===
        cell.currentLadder.softRepairPerCycle &&
      params.ladder.parseAttemptsPerStage ===
        cell.currentLadder.parseAttemptsPerStage);
  const sourceTopologyCurrent =
    params.sdkRetries === 2 &&
    A === 3 &&
    sameOuter(params.outer, cell.currentOuter) &&
    currentLadder;

  const flashOutputChain = flashOutputPerEngine * T;
  const proOutputChain = proOutputPerEngine * T;
  const outputOnlyUsdPerEngine =
    flashOutputPerEngine * formulas.models.flash.staleEmergencyOutputUsdPerToken +
    proOutputPerEngine * formulas.models.pro.staleEmergencyOutputUsdPerToken;
  const outputOnlyUsdChain =
    flashOutputChain * formulas.models.flash.staleEmergencyOutputUsdPerToken +
    proOutputChain * formulas.models.pro.staleEmergencyOutputUsdPerToken;

  return {
    scenarioId: scenarioId(cellId, params),
    cellId,
    routeCount: 1,
    reachability:
      sourceTopologyCurrent
        ? T === 2
          ? "CURRENT_SOURCE_ADVERSARIAL_TRIGGER_CEILING"
          : "CURRENT_SOURCE_SINGLE_ENGINE_EXECUTION"
        : "HYPOTHETICAL_OFFLINE_ARITHMETIC",
    controls: {
      sdkRetries: params.sdkRetries,
      sdkPhysicalMultiplier: S,
      wrapperApplicationAttempts: A,
      wrapperApplicationRetries: A - 1,
      triggerExecutions: T,
      outer: params.outer,
      ladder: params.ladder ?? null,
    },
    stageCountsPerEngine: {
      outerCandidatePasses: Q,
      candidateGenerationWrappers,
      candidateRepairWrappers,
      evaluationWrappers,
      premiumGrammarLadderRuns: cell.ladder ? params.outer.strict : 0,
    },
    logicalResponsesPerEngine: {
      candidateCapable: candidateLogical,
      design: designLogical,
      evaluation: evaluationLogical,
      total: candidateLogical + designLogical + evaluationLogical,
    },
    physicalFetchesPerEngine: {
      candidateWrappers: wrapperCandidatePhysical,
      premiumGrammarLadder: ladderPhysical,
      evaluation: evaluationPhysical,
      total: physicalPerEngine,
    },
    triggerChainCeiling: {
      candidateCapableLogicalResponses: candidateLogical * T,
      designLogicalResponses: designLogical * T,
      evaluationLogicalResponses: evaluationLogical * T,
      physicalProviderFetches: physicalPerEngine * T,
    },
    outputReservationPerEngine: {
      flashTokens: flashOutputPerEngine,
      proTokens: proOutputPerEngine,
      totalTokens: flashOutputPerEngine + proOutputPerEngine,
      outputOnlyUsdAtStaleEmergencyRates: round(outputOnlyUsdPerEngine),
    },
    outputReservationTriggerChain: {
      flashTokens: flashOutputChain,
      proTokens: proOutputChain,
      totalTokens: flashOutputChain + proOutputChain,
      outputOnlyUsdAtStaleEmergencyRates: round(outputOnlyUsdChain),
    },
    totalUsdCeiling: null,
    totalUsdCeilingReason:
      "No source-enforced input byte/token cap; stale price evidence; effective deployment models unattested; durable budget defaults OFF.",
    providerVisibleQuestionsArrayMaxItems: null,
  };
}

function enumerateLadders(cell) {
  if (!cell.ladder) return [null];
  const rows = [];
  for (const cycles of formulas.axes.premiumGrammarLadderCycles) {
    for (const softRepairPerCycle of formulas.axes.premiumGrammarSoftRepairPerCycle) {
      for (const parseAttemptsPerStage of formulas.axes.premiumGrammarParseAttemptsPerStage) {
        rows.push({ cycles, softRepairPerCycle, parseAttemptsPerStage });
      }
    }
  }
  return rows;
}

export function buildScenarioMatrix() {
  const scenarios = [];
  const cellScenarioCounts = {};
  for (const [cellId, cell] of Object.entries(formulas.cellDefinitions)) {
    const start = scenarios.length;
    for (const sdkRetries of formulas.axes.sdkRetries) {
      for (const applicationAttempts of formulas.axes.wrapperApplicationAttempts) {
        for (const triggerExecutions of formulas.axes.triggerExecutions) {
          for (const outer of enumerateOuterPolicies(cell)) {
            for (const ladder of enumerateLadders(cell)) {
              scenarios.push(
                computeScenario(cellId, {
                  sdkRetries,
                  applicationAttempts,
                  triggerExecutions,
                  outer,
                  ladder,
                }),
              );
            }
          }
        }
      }
    }
    cellScenarioCounts[cellId] = scenarios.length - start;
  }
  return {
    schemaVersion: 1,
    studyId: formulas.studyId,
    interpretation:
      "Exact static count=1 arithmetic for the enumerated topology. Only rows marked CURRENT_SOURCE_* are current-source reachable; all other rows are prospective policy arithmetic and carry no quality claim.",
    cellScenarioCounts,
    scenarioCount: scenarios.length,
    scenarios,
  };
}

const namedProfiles = [
  {
    profileId: "CURRENT_SOURCE_CEILING",
    rationale: "Sealed v2 source topology with Trigger crash replay ceiling.",
    sdkRetries: 2,
    applicationAttempts: 3,
    triggerExecutions: 2,
    outerMode: "current",
    ladder: { cycles: 3, softRepairPerCycle: 1, parseAttemptsPerStage: 2 },
    evidenceStatus: "SOURCE_BOUND_ONLY",
  },
  {
    profileId: "ONE_TRANSIENT_SDK_RETRY",
    rationale: "Keep one SDK retry for classified transient transport failures; remove generic wrapper application replay while preserving current outer quality topology and ladder craft topology.",
    sdkRetries: 1,
    applicationAttempts: 1,
    triggerExecutions: 2,
    outerMode: "current",
    ladder: { cycles: 3, softRepairPerCycle: 1, parseAttemptsPerStage: 2 },
    evidenceStatus: "PARETO_CANDIDATE_NEEDS_PROSPECTIVE_VALIDATION",
  },
  {
    profileId: "ONE_SDK_PLUS_ONE_PARSE_APPLICATION_ATTEMPT",
    rationale: "Conditional fallback if telemetry shows a material parse/schema class remains after same-attempt repair. It keeps one SDK retry and one application replay, so the wrapper multiplier is four rather than current nine.",
    sdkRetries: 1,
    applicationAttempts: 2,
    triggerExecutions: 2,
    outerMode: "current",
    ladder: { cycles: 3, softRepairPerCycle: 1, parseAttemptsPerStage: 2 },
    evidenceStatus: "CONDITIONAL_PARETO_CANDIDATE",
  },
  {
    profileId: "ONE_APPLICATION_RETRY_ONLY",
    rationale: "Comparator: no SDK retry and one whole application replay. It has the same wrapper physical multiplier as ONE_TRANSIENT_SDK_RETRY but twice the wrapper logical responses and a different failure-recovery meaning.",
    sdkRetries: 0,
    applicationAttempts: 2,
    triggerExecutions: 2,
    outerMode: "current",
    ladder: { cycles: 3, softRepairPerCycle: 1, parseAttemptsPerStage: 2 },
    evidenceStatus: "COMPARATOR_NOT_DEFAULT_RECOMMENDATION",
  },
  {
    profileId: "DURABLY_DEDUPED_TRIGGER",
    rationale: "Same one-SDK layer, but a single provider-work execution after durable idempotent resume/enforcing budget prevents crash replay duplication. Trigger task retry may remain enabled; T=1 describes provider work, not necessarily task invocations.",
    sdkRetries: 1,
    applicationAttempts: 1,
    triggerExecutions: 1,
    outerMode: "current",
    ladder: { cycles: 3, softRepairPerCycle: 1, parseAttemptsPerStage: 2 },
    evidenceStatus: "REQUIRES_DURABLE_IDEMPOTENCY_AND_UNIVERSAL_ENFORCEMENT",
  },
  {
    profileId: "LADDER_SINGLE_PARSE_ATTEMPT",
    rationale: "Experimental Premium-grammar-only removal of the second parse fire per ladder stage; outer passes, three cycles, and one soft repair per cycle remain.",
    sdkRetries: 1,
    applicationAttempts: 1,
    triggerExecutions: 2,
    outerMode: "current",
    ladder: { cycles: 3, softRepairPerCycle: 1, parseAttemptsPerStage: 1 },
    evidenceStatus: "HELD_OUT_EXPERIMENT_ONLY",
  },
  {
    profileId: "LADDER_TWO_CYCLES_SINGLE_PARSE",
    rationale: "More aggressive Premium grammar experiment: two cycles, repair retained, one parse attempt. This changes craft opportunity and cannot be selected from cost arithmetic alone.",
    sdkRetries: 1,
    applicationAttempts: 1,
    triggerExecutions: 2,
    outerMode: "current",
    ladder: { cycles: 2, softRepairPerCycle: 1, parseAttemptsPerStage: 1 },
    evidenceStatus: "HELD_OUT_EXPERIMENT_ONLY",
  },
  {
    profileId: "CURRENT_STRICT_ONLY",
    rationale: "Cost sensitivity row that retains the current number of strict passes but removes relaxed/scarce/salvage generation. It changes availability and final-quality selection behavior.",
    sdkRetries: 1,
    applicationAttempts: 1,
    triggerExecutions: 2,
    outerMode: "strictOnly",
    ladder: { cycles: 3, softRepairPerCycle: 1, parseAttemptsPerStage: 2 },
    evidenceStatus: "HELD_OUT_EXPERIMENT_ONLY",
  },
  {
    profileId: "ONE_STRICT_ONLY",
    rationale: "Lower-bound sensitivity row, not a recommendation: one strict pass and no fallback generation.",
    sdkRetries: 1,
    applicationAttempts: 1,
    triggerExecutions: 2,
    outerMode: "oneStrictOnly",
    ladder: { cycles: 3, softRepairPerCycle: 1, parseAttemptsPerStage: 2 },
    evidenceStatus: "ARITHMETIC_LOWER_BOUND_ONLY",
  },
];

function outerForProfile(cell, mode) {
  if (mode === "current") return { ...cell.currentOuter, policyClass: "CURRENT_OUTER_TOPOLOGY" };
  if (mode === "strictOnly") {
    return {
      strict: cell.currentOuter.strict,
      relaxed: 0,
      scarce: 0,
      salvage: 0,
      policyClass: "HYPOTHETICAL_FALLBACK_SUBSET",
    };
  }
  return {
    strict: 1,
    relaxed: 0,
    scarce: 0,
    salvage: 0,
    policyClass: "HYPOTHETICAL_STRICT_REDUCTION",
  };
}

export function buildProfileComparison() {
  const profiles = namedProfiles.map((profile) => {
    const cells = {};
    for (const [cellId, cell] of Object.entries(formulas.cellDefinitions)) {
      const row = computeScenario(cellId, {
        sdkRetries: profile.sdkRetries,
        applicationAttempts: profile.applicationAttempts,
        triggerExecutions: profile.triggerExecutions,
        outer: outerForProfile(cell, profile.outerMode),
        ladder: cell.ladder ? profile.ladder : null,
      });
      cells[cellId] = {
        candidateCapableLogicalResponses:
          row.triggerChainCeiling.candidateCapableLogicalResponses,
        designLogicalResponses: row.triggerChainCeiling.designLogicalResponses,
        evaluationLogicalResponses:
          row.triggerChainCeiling.evaluationLogicalResponses,
        physicalProviderFetches:
          row.triggerChainCeiling.physicalProviderFetches,
        outputReservationTokens:
          row.outputReservationTriggerChain.totalTokens,
        outputOnlyUsdAtStaleEmergencyRates:
          row.outputReservationTriggerChain.outputOnlyUsdAtStaleEmergencyRates,
        totalUsdCeiling: null,
      };
    }
    const aggregate = Object.values(cells).reduce(
      (sum, cell) => ({
        physicalProviderFetches:
          sum.physicalProviderFetches + cell.physicalProviderFetches,
        outputReservationTokens:
          sum.outputReservationTokens + cell.outputReservationTokens,
        outputOnlyUsdAtStaleEmergencyRates: round(
          sum.outputOnlyUsdAtStaleEmergencyRates +
            cell.outputOnlyUsdAtStaleEmergencyRates,
        ),
      }),
      {
        physicalProviderFetches: 0,
        outputReservationTokens: 0,
        outputOnlyUsdAtStaleEmergencyRates: 0,
      },
    );
    return { ...profile, cells, allCellAggregate: aggregate };
  });
  return {
    schemaVersion: 1,
    studyId: formulas.studyId,
    warning:
      "This is a structural cost frontier, not a quality Pareto frontier. No profile has prospective quality observations in this offline study.",
    nonDominanceInterpretation: [
      "ONE_TRANSIENT_SDK_RETRY preserves one retry at the transport layer and current quality-stage counts while removing whole-wrapper application replay.",
      "ONE_SDK_PLUS_ONE_PARSE_APPLICATION_ATTEMPT is justified only if classified parse/schema telemetry shows same-attempt repair is insufficient.",
      "ONE_APPLICATION_RETRY_ONLY has equal wrapper physical multiplier to one SDK retry but more logical regeneration opportunities; it may help parse failures but is a poorer semantic match for transport failures.",
      "Ladder and outer-pass reductions alter quality/craft opportunities and stay experimental until blinded held-out non-inferiority evidence exists.",
      "T=1 is acceptable only as provider-work deduplication backed by durable idempotency/enforcement, not by silently removing task recovery."
    ],
    profiles,
  };
}

export function buildAll() {
  return {
    matrix: buildScenarioMatrix(),
    profiles: buildProfileComparison(),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const write = process.argv.includes("--write");
  const built = buildAll();
  if (write) {
    writeFileSync(
      path.join(here, "scenario-matrix.json"),
      `${JSON.stringify(built.matrix, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(here, "profile-comparison.json"),
      `${JSON.stringify(built.profiles, null, 2)}\n`,
      "utf8",
    );
  }
  process.stdout.write(
    `${JSON.stringify({
      status: write ? "WROTE" : "BUILT_NO_WRITE",
      studyId: formulas.studyId,
      scenarioCount: built.matrix.scenarioCount,
      cellScenarioCounts: built.matrix.cellScenarioCounts,
      profileCount: built.profiles.profiles.length,
      networkCalls: 0,
      modelCalls: 0,
      apiCalls: 0,
      databaseCalls: 0,
      secretOrEnvironmentValueReads: 0,
      candidateQuestionsCreated: 0,
    })}\n`,
  );
}
