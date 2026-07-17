import { pathToFileURL } from "node:url";

function logCombination(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) {
    return Number.NEGATIVE_INFINITY;
  }
  const reduced = Math.min(k, n - k);
  let value = 0;
  for (let i = 1; i <= reduced; i += 1) {
    value += Math.log((n - reduced + i) / i);
  }
  return value;
}

export function binomialPmf(n, k, p) {
  if (k < 0 || k > n) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(
    logCombination(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p),
  );
}

export function binomialUpperTail(n, atLeast, p) {
  let total = 0;
  for (let k = atLeast; k <= n; k += 1) {
    total += binomialPmf(n, k, p);
  }
  return Math.min(1, total);
}

export function zeroEventUpperBound(n, oneSidedAlpha) {
  if (!Number.isInteger(n) || n <= 0)
    throw new Error("n must be a positive integer");
  if (!(oneSidedAlpha > 0 && oneSidedAlpha < 1)) {
    throw new Error("oneSidedAlpha must be in (0,1)");
  }
  return 1 - oneSidedAlpha ** (1 / n);
}

export function exactPairedMcNemarPower({
  n,
  pChallengerOnly,
  pControlOnly,
  oneSidedAlpha,
}) {
  const discordance = pChallengerOnly + pControlOnly;
  if (!(discordance > 0 && discordance <= 1)) {
    throw new Error("discordance probability must be in (0,1]");
  }
  const q = pChallengerOnly / discordance;
  let power = 0;

  for (let discordant = 0; discordant <= n; discordant += 1) {
    const pDiscordantCount = binomialPmf(n, discordant, discordance);
    for (
      let challengerOnly = 0;
      challengerOnly <= discordant;
      challengerOnly += 1
    ) {
      const nullP = binomialUpperTail(discordant, challengerOnly, 0.5);
      if (nullP <= oneSidedAlpha) {
        power += pDiscordantCount * binomialPmf(discordant, challengerOnly, q);
      }
    }
  }
  return power;
}

export function conditionalPower({
  interimChallengerOnly,
  interimControlOnly,
  remainingPairs,
  designPChallengerOnly,
  designPControlOnly,
  finalAlpha,
}) {
  const designDiscordance = designPChallengerOnly + designPControlOnly;
  const q = designPChallengerOnly / designDiscordance;
  let probability = 0;

  for (
    let futureDiscordant = 0;
    futureDiscordant <= remainingPairs;
    futureDiscordant += 1
  ) {
    const pFutureDiscordant = binomialPmf(
      remainingPairs,
      futureDiscordant,
      designDiscordance,
    );
    for (
      let futureChallengerOnly = 0;
      futureChallengerOnly <= futureDiscordant;
      futureChallengerOnly += 1
    ) {
      const totalDiscordant =
        interimChallengerOnly + interimControlOnly + futureDiscordant;
      const totalChallengerOnly = interimChallengerOnly + futureChallengerOnly;
      const finalP = binomialUpperTail(
        totalDiscordant,
        totalChallengerOnly,
        0.5,
      );
      if (finalP <= finalAlpha) {
        probability +=
          pFutureDiscordant *
          binomialPmf(futureDiscordant, futureChallengerOnly, q);
      }
    }
  }
  return probability;
}

export function buildPowerResults() {
  const allocations = {
    S0_CONNECTIVITY_RUN_IN: 2,
    S0_FOCUS_BASIC_SENTINELS: 4,
    S1_SCREEN: 180,
    S2_FOCUS_FIRST_LOOK: 480,
    S3_ALL_TYPE_SENTINELS: 92,
    S4_FOCUS_EXTENSION: 240,
    LOCKED_UNUSED: 2,
  };
  const scheduled =
    allocations.S0_CONNECTIVITY_RUN_IN +
    allocations.S0_FOCUS_BASIC_SENTINELS +
    allocations.S1_SCREEN +
    allocations.S2_FOCUS_FIRST_LOOK +
    allocations.S3_ALL_TYPE_SENTINELS +
    allocations.S4_FOCUS_EXTENSION;

  const scenarios = [
    [0.3, 0.1],
    [0.25, 0.1],
    [0.25, 0.05],
  ].map(([pChallengerOnly, pControlOnly]) => ({
    pChallengerOnly,
    pControlOnly,
    interimN: 120,
    interimAlpha: 0.005,
    interimPower: exactPairedMcNemarPower({
      n: 120,
      pChallengerOnly,
      pControlOnly,
      oneSidedAlpha: 0.005,
    }),
    finalN: 180,
    finalAlpha: 0.02,
    finalPower: exactPairedMcNemarPower({
      n: 180,
      pChallengerOnly,
      pControlOnly,
      oneSidedAlpha: 0.02,
    }),
  }));

  return {
    schemaVersion: "blind-adjudication-power-results-v1",
    apiCandidatesConsumed: 0,
    allocations: {
      ...allocations,
      TOTAL_SCHEDULED_MAX: scheduled,
      GLOBAL_CAP: 1000,
    },
    fatalZeroEventBounds: {
      cellN60PerCell95: zeroEventUpperBound(60, 0.05),
      cellN60FourCellFamily95: zeroEventUpperBound(60, 0.0125),
      minimumCellN86FourCellFamily95: zeroEventUpperBound(86, 0.0125),
      maximumCellN90FourCellFamily95: zeroEventUpperBound(90, 0.0125),
    },
    primaryCraftPowerScenarios: scenarios,
    alphaArithmetic: {
      focusTypes: 2,
      interimPerType: 0.005,
      finalPerType: 0.02,
      unionBoundFamilywiseAlpha: 2 * (0.005 + 0.02),
    },
    qualifications: [
      "Power is unconditional exact paired McNemar power for the stated discordance probabilities.",
      "Fatal bounds use the exact zero-event one-sided Clopper-Pearson expression.",
      "Plan-specific craft superiority is not powered; the primary craft test pools independent plan strata within type.",
      "No result is evidence from generated questions; all values are design calculations.",
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.stdout.write(`${JSON.stringify(buildPowerResults(), null, 2)}\n`);
}
