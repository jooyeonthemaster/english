import type { AtlasControllerParserImplementation } from "../../harness/atlas-controller";

// Keep normalization behavior inside the attested parser artifact. Importing
// canonicalization from another file would let parser behavior change without
// changing parserArtifactHash.
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function decode(body: string | Uint8Array): string {
  return typeof body === "string" ? body : new TextDecoder().decode(body);
}

/**
 * Requires exactly one provider choice, then counts every full-question object
 * in that choice's structured `questions` payload. Choice-cardinality drift is
 * itself fail-closed; question overflow inside the sole choice is exposed to
 * the durable controller so it quarantines instead of hiding the extra output.
 */
export function createS1OpenRouterQuestionParser(
  parserArtifactHash: string,
): AtlasControllerParserImplementation {
  return {
    artifactHash: parserArtifactHash,
    parseResponseBody(body) {
      let envelope: unknown;
      try {
        envelope = JSON.parse(decode(body));
      } catch {
        return {
          disposition: "no_candidate",
          dispositionReason: "provider_envelope_json_parse_failure",
          normalizedSemanticCandidates: [],
        };
      }
      const choices = envelope && typeof envelope === "object"
        ? (envelope as { choices?: unknown }).choices
        : undefined;
      if (!Array.isArray(choices) || choices.length !== 1) {
        return {
          disposition: "no_candidate",
          dispositionReason:
            `response_contract_drift_choices_cardinality_${
              Array.isArray(choices) ? choices.length : "non_array"
            }`,
          normalizedSemanticCandidates: [],
        };
      }
      const first = choices[0];
      const message = first && typeof first === "object"
        ? (first as { message?: unknown }).message
        : undefined;
      const content = message && typeof message === "object"
        ? (message as { content?: unknown }).content
        : undefined;
      if (typeof content !== "string") {
        return {
          disposition: "no_candidate",
          dispositionReason: "response_contract_drift_missing_assistant_content",
          normalizedSemanticCandidates: [],
        };
      }
      let payload: unknown;
      try {
        payload = JSON.parse(content);
      } catch {
        return {
          disposition: "no_candidate",
          dispositionReason: "assistant_json_parse_failure",
          normalizedSemanticCandidates: [],
        };
      }
      const questionsValue = payload && typeof payload === "object"
        ? (payload as { questions?: unknown }).questions
        : undefined;
      if (
        Array.isArray(questionsValue) &&
        questionsValue.some(
          (question) => question === null || typeof question !== "object",
        )
      ) {
        return {
          disposition: "no_candidate",
          dispositionReason: "response_contract_drift_non_object_question_item",
          normalizedSemanticCandidates: [],
        };
      }
      const questions = Array.isArray(questionsValue) ? questionsValue : [];
      return questions.length > 0
        ? {
            disposition: "parsed",
            dispositionReason: "semantic_full_questions_observed",
            normalizedSemanticCandidates: questions.map(stableJson),
          }
        : {
            disposition: "no_candidate",
            dispositionReason: "no_semantic_full_question",
            normalizedSemanticCandidates: [],
          };
    },
  };
}
