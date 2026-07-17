import { parseConnectivityResponseV3, type ParsedResponseEvidenceV3 } from "./response-parser";

export interface DeterministicLocalResponseV3 {
  readonly plan: "STANDARD" | "PREMIUM";
  readonly rawText: string;
  readonly requestedModel: string;
  readonly allowedServedModels: readonly string[];
  readonly expectedProvider: string;
}

export interface DeterministicScenarioResultV3 {
  readonly terminal: "COMPLETED" | "FAILED_TERMINAL" | "UNKNOWN_AFTER_SEND_TERMINAL";
  readonly started: number;
  readonly settled: number;
  readonly successes: number;
  readonly candidateOpportunities: number;
  readonly physicalFetches: number;
  readonly completions: number;
  readonly evidence: readonly ParsedResponseEvidenceV3[];
}

/**
 * Pure offline model of the live state transition contract. It has no transport,
 * filesystem, environment, clock, process, or network capability.
 */
export function runDeterministicLocalScenarioV3(
  responses: readonly (DeterministicLocalResponseV3 | "FAIL_BEFORE_RESPONSE" | "UNKNOWN_AFTER_SEND")[],
): DeterministicScenarioResultV3 {
  const evidence: ParsedResponseEvidenceV3[] = [];
  let started = 0;
  let settled = 0;
  for (let index = 0; index < responses.length && index < 2; index += 1) {
    const response = responses[index]!;
    const expectedPlan = index === 0 ? "STANDARD" : "PREMIUM";
    started += 1;
    if (response === "UNKNOWN_AFTER_SEND") {
      return { terminal: "UNKNOWN_AFTER_SEND_TERMINAL", started, settled, successes: evidence.length, candidateOpportunities: started, physicalFetches: started, completions: started, evidence };
    }
    if (response === "FAIL_BEFORE_RESPONSE") {
      settled += 1;
      return { terminal: "FAILED_TERMINAL", started, settled, successes: evidence.length, candidateOpportunities: started, physicalFetches: started, completions: started, evidence };
    }
    if (response.plan !== expectedPlan) throw new Error("deterministic scenario order drifted");
    try {
      evidence.push(parseConnectivityResponseV3(response));
      settled += 1;
    } catch {
      settled += 1;
      return { terminal: "FAILED_TERMINAL", started, settled, successes: evidence.length, candidateOpportunities: started, physicalFetches: started, completions: started, evidence };
    }
  }
  const completed = evidence.length === 2 && started === 2 && settled === 2;
  return {
    terminal: completed ? "COMPLETED" : "FAILED_TERMINAL",
    started,
    settled,
    successes: evidence.length,
    candidateOpportunities: started,
    physicalFetches: started,
    completions: started,
    evidence,
  };
}
