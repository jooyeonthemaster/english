function readRequiredPriceEnv(name: string): number {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required tutor price env: ${name}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid tutor price env: ${name}`);
  }
  return parsed;
}

export function calculateTutorCostUsd(tokensIn: number, tokensOut: number): number {
  const inputPerMillion = readRequiredPriceEnv("GEMINI_PRICE_INPUT_PER_1M_USD");
  const outputPerMillion = readRequiredPriceEnv("GEMINI_PRICE_OUTPUT_PER_1M_USD");
  return (tokensIn * inputPerMillion + tokensOut * outputPerMillion) / 1_000_000;
}
