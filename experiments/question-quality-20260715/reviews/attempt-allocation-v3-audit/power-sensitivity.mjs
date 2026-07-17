import assert from "node:assert/strict";

// Zero-call, dependency-free sensitivity calculations for the allocation audit.
// The exact McNemar calculation enumerates D~Binomial(n, q), followed by
// X|D~Binomial(D, p10 / q), where X is WINNER-only success and q is the total
// discordant probability. The null p-value is the conventional doubled exact
// binomial tail at 0.5.

function binomialPmf(n, p) {
  if (p === 0) return [1, ...Array(n).fill(0)];
  if (p === 1) return [...Array(n).fill(0), 1];
  const out = Array(n + 1).fill(0);
  out[0] = (1 - p) ** n;
  for (let k = 0; k < n; k += 1) {
    out[k + 1] = out[k] * ((n - k) / (k + 1)) * (p / (1 - p));
  }
  return out;
}

function exactTwoSidedBinomialPValue(x, n) {
  if (n === 0) return 1;
  const pmf = binomialPmf(n, 0.5);
  const lower = pmf.slice(0, x + 1).reduce((sum, value) => sum + value, 0);
  const upper = pmf.slice(x).reduce((sum, value) => sum + value, 0);
  return Math.min(1, 2 * Math.min(lower, upper));
}

function exactMcNemarPower({ n, discordance, difference, alpha }) {
  assert.ok(discordance > 0 && discordance <= 1);
  assert.ok(Math.abs(difference) <= discordance);
  const winnerOnly = (discordance + difference) / 2;
  const conditionalWinnerOnly = winnerOnly / discordance;
  const discordantPmf = binomialPmf(n, discordance);
  let power = 0;
  for (let d = 0; d <= n; d += 1) {
    const xPmf = binomialPmf(d, conditionalWinnerOnly);
    for (let x = 0; x <= d; x += 1) {
      const cacheKey = `${d}:${alpha}`;
      let rejectionSet = exactRejectionCache.get(cacheKey);
      if (!rejectionSet) {
        rejectionSet = new Set();
        for (let nullX = 0; nullX <= d; nullX += 1) {
          if (exactTwoSidedBinomialPValue(nullX, d) <= alpha + 1e-15) {
            rejectionSet.add(nullX);
          }
        }
        exactRejectionCache.set(cacheKey, rejectionSet);
      }
      if (rejectionSet.has(x)) {
        power += discordantPmf[d] * xPmf[x];
      }
    }
  }
  return power;
}

const exactRejectionCache = new Map();

function minimumDifferenceForPower({ n, discordance, alpha, target = 0.8 }) {
  const maximumPower = exactMcNemarPower({
    n,
    discordance,
    difference: discordance,
    alpha,
  });
  if (maximumPower < target) return null;
  let low = 0;
  let high = discordance;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (low + high) / 2;
    const power = exactMcNemarPower({ n, discordance, difference: middle, alpha });
    if (power >= target) high = middle;
    else low = middle;
  }
  return {
    difference: high,
    power: exactMcNemarPower({ n, discordance, difference: high, alpha }),
  };
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

console.log("# Exact McNemar minimum net improvement for 80% power");
console.log("| n pairs | discordant q | alpha | minimum p(W only)-p(C only) | attained power |");
console.log("|---:|---:|---:|---:|---:|");
for (const n of [30, 40, 50, 60]) {
  for (const discordance of [0.2, 0.3, 0.4]) {
    for (const alpha of [0.05, 0.025, 0.0125]) {
      const result = minimumDifferenceForPower({ n, discordance, alpha });
      console.log(
        `| ${n} | ${pct(discordance)} | ${alpha} | ${result ? pct(result.difference) : "> q"} | ${result ? pct(result.power) : "n/a"} |`,
      );
    }
  }
}

console.log("\n# Exact McNemar power for a 10-point net improvement");
console.log("| n pairs | discordant q | alpha | exact power |");
console.log("|---:|---:|---:|---:|");
for (const n of [30, 40, 50, 60]) {
  for (const discordance of [0.2, 0.3, 0.4]) {
    for (const alpha of [0.05, 0.025, 0.0125]) {
      const power = exactMcNemarPower({
        n,
        discordance,
        difference: 0.1,
        alpha,
      });
      console.log(`| ${n} | ${pct(discordance)} | ${alpha} | ${pct(power)} |`);
    }
  }
}

console.log("\n# Fatal-rate sensitivity when zero events are observed");
console.log("| n | one-sided exact 95% upper bound | P(detect >=1) at 1% | at 2% | at 5% |");
console.log("|---:|---:|---:|---:|---:|");
for (const n of [30, 40, 50, 60]) {
  const upper = 1 - 0.05 ** (1 / n);
  const detect = p => 1 - (1 - p) ** n;
  console.log(
    `| ${n} | ${pct(upper)} | ${pct(detect(0.01))} | ${pct(detect(0.02))} | ${pct(detect(0.05))} |`,
  );
}
