import { parseConnectivityResponseV5, type ParsedResponseEvidenceV5 } from "./response-parser";
import type { JsonObject } from "./protocol-core";

export interface DeterministicLocalResponseV5 {
  readonly plan: "STANDARD" | "PREMIUM";
  readonly rawText: string;
  readonly requestedModel: string;
  readonly allowedServedModels: readonly string[];
  readonly expectedProvider: string;
  readonly allowedFinishReasons: readonly ["stop"];
  readonly responseSchema: JsonObject;
}

export interface DeterministicScenarioResultV5 {
  readonly terminal: "COMPLETED" | "FAILED_TERMINAL" | "UNKNOWN_AFTER_SEND_TERMINAL";
  readonly started: number;
  readonly settled: number;
  readonly successes: number;
  readonly candidateOpportunities: number;
  readonly physicalFetches: number;
  readonly completions: number;
  readonly evidence: readonly ParsedResponseEvidenceV5[];
}

/**
 * Pure offline model of the live state transition contract. It has no transport,
 * filesystem, environment, clock, process, or network capability.
 */
export function runDeterministicLocalScenarioV5(
  responses: readonly (DeterministicLocalResponseV5 | "FAIL_BEFORE_RESPONSE" | "UNKNOWN_AFTER_SEND")[],
): DeterministicScenarioResultV5 {
  const evidence: ParsedResponseEvidenceV5[] = [];
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
      evidence.push(parseConnectivityResponseV5(response));
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
