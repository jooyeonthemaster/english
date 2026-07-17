import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Semantic call-site identifiers used only by the opt-in research runner.
 * They contain no request bytes, response bytes, hashes, budgets, or secrets.
 * The installed runtime maps them to a separately sealed controller registry.
 */
export const QUESTION_GENERATION_RESEARCH_STAGES = {
  QUESTION_STRUCTURED: "question.structured",
  QUESTION_PROMPT_JSON_FALLBACK: "question.prompt-json-fallback",
  QUESTION_JSON_REPAIR: "question.json-repair",
  QUESTION_CANDIDATE_REPAIR: "question.candidate-repair",
  QUESTION_CANDIDATE_REPAIR_JSON: "question.candidate-repair-json",
  QUESTION_SOLVER: "question.solver",
  GRAMMAR_SOLVER: "grammar.solver",
  GRAMMAR_LADDER_ANSWER_ONLY: "grammar.ladder.answer-only",
  GRAMMAR_LADDER_ANSWER_REGEN: "grammar.ladder.answer-regen",
  GRAMMAR_LADDER_ADD_DECOYS: "grammar.ladder.add-decoys",
  GRAMMAR_LADDER_REPAIR: "grammar.ladder.repair",
} as const;

export type QuestionGenerationResearchStageKey =
  (typeof QUESTION_GENERATION_RESEARCH_STAGES)[keyof typeof QUESTION_GENERATION_RESEARCH_STAGES];

export type QuestionGenerationResearchPurpose =
  | "candidate"
  | "design"
  | "evaluation";

export interface QuestionGenerationResearchStage {
  key: QuestionGenerationResearchStageKey;
  purpose: QuestionGenerationResearchPurpose;
  /**
   * Optional exact semantic value whose response produced this child prompt.
   * The campaign adapter resolves it to a trusted physical-call ID; production
   * code can never supply or forge IDs, response hashes, or receipts.
   */
  derivationParentValue?: unknown;
}

export interface QuestionGenerationResearchOperation {
  rootStage: QuestionGenerationResearchStage;
  subType: string;
  difficulty: string;
  generationPlan: string;
  qualityMode: string;
}

export type QuestionGenerationResearchCandidateDecision =
  | "parsed_accepted"
  | "parsed_rejected";

export interface QuestionGenerationResearchRetryPolicy {
  readonly applicationMaxRetries: 0;
  readonly sdkMaxRetries: 0;
  readonly outerMaxAttempts: 1;
  readonly ladderParseMaxRetries: 0;
  readonly allowStructuredRepair: false;
}

/**
 * Server-owned policy for the confirmatory research runner. A registered
 * provider stage gets one application dispatch, one SDK dispatch, and no
 * implicit structured-output repair child. Subtype quality floors remain a
 * separate production-topology concern.
 */
export const QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY:
  Readonly<QuestionGenerationResearchRetryPolicy> = Object.freeze({
    applicationMaxRetries: 0,
    sdkMaxRetries: 0,
    outerMaxAttempts: 1,
    ladderParseMaxRetries: 0,
    allowStructuredRepair: false,
  });

/**
 * Implemented by the offline campaign adapter. Production code sees only this
 * narrow capability interface and therefore cannot construct controller
 * receipts, parent response hashes, SDK wire hashes, or budget mutations.
 */
export interface QuestionGenerationResearchRuntime {
  readonly runtimeId: string;
  /** Must be the canonical server-owned frozen policy, never adapter input. */
  readonly retryPolicy: Readonly<QuestionGenerationResearchRetryPolicy>;
  /**
   * Exact full-question count sealed by the campaign registry. Production
   * callers never pass this value into schema builders directly.
   */
  readonly expectedQuestionsPerStructuredCall: number;
  runAssignment<T>(fn: () => T | Promise<T>): Promise<T>;
  runOperation<T>(
    operation: Readonly<QuestionGenerationResearchOperation>,
    fn: () => T | Promise<T>,
  ): Promise<T>;
  runStage<T>(
    stage: Readonly<QuestionGenerationResearchStage>,
    fn: () => T | Promise<T>,
  ): Promise<T>;
  observeCandidateValues(values: readonly unknown[]): Promise<void>;
  decideCandidateValue(
    value: unknown,
    outcome: QuestionGenerationResearchCandidateDecision,
  ): Promise<void>;
}

const runtimeStorage = new AsyncLocalStorage<
  Readonly<QuestionGenerationResearchRuntime>
>();

export function runWithQuestionGenerationResearchRuntime<T>(
  runtime: QuestionGenerationResearchRuntime,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!runtime || typeof runtime.runtimeId !== "string" || !runtime.runtimeId.trim()) {
    return Promise.reject(new Error("invalid question-generation research runtime"));
  }
  if (
    !Number.isSafeInteger(runtime.expectedQuestionsPerStructuredCall) ||
    runtime.expectedQuestionsPerStructuredCall <= 0
  ) {
    return Promise.reject(
      new Error("research structured-question count must be a positive safe integer"),
    );
  }
  if (
    runtime.retryPolicy !==
    QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY
  ) {
    return Promise.reject(
      new Error("research runtime requires the sealed single-dispatch retry policy"),
    );
  }
  if (runtimeStorage.getStore()) {
    return Promise.reject(
      new Error("question-generation research runtime is already active"),
    );
  }
  const installed: Readonly<QuestionGenerationResearchRuntime> = Object.freeze({
    runtimeId: runtime.runtimeId,
    retryPolicy: QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
    expectedQuestionsPerStructuredCall:
      runtime.expectedQuestionsPerStructuredCall,
    runAssignment: runtime.runAssignment.bind(runtime),
    runOperation: runtime.runOperation.bind(runtime),
    runStage: runtime.runStage.bind(runtime),
    observeCandidateValues: runtime.observeCandidateValues.bind(runtime),
    decideCandidateValue: runtime.decideCandidateValue.bind(runtime),
  });
  return runtimeStorage.run(installed, () => installed.runAssignment(fn));
}

export function runQuestionGenerationResearchOperation<T>(
  operation: Readonly<QuestionGenerationResearchOperation>,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const runtime = runtimeStorage.getStore();
  // Exact opt-out seam: no promise wrapping, await, ALS mutation, hashing, or
  // argument rewriting when the campaign runtime is absent.
  return runtime ? runtime.runOperation(operation, fn) : fn();
}

export function runQuestionGenerationResearchStage<T>(
  stage: Readonly<QuestionGenerationResearchStage>,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const runtime = runtimeStorage.getStore();
  return runtime ? runtime.runStage(stage, fn) : fn();
}

export function observeQuestionGenerationResearchCandidates(
  values: readonly unknown[],
): void | Promise<void> {
  const runtime = runtimeStorage.getStore();
  return runtime?.observeCandidateValues(values);
}

export function decideQuestionGenerationResearchCandidate(
  value: unknown,
  outcome: QuestionGenerationResearchCandidateDecision,
): void | Promise<void> {
  const runtime = runtimeStorage.getStore();
  return runtime?.decideCandidateValue(value, outcome);
}

export function hasQuestionGenerationResearchRuntime(): boolean {
  return runtimeStorage.getStore() !== undefined;
}

export function getQuestionGenerationResearchTransportPolicy():
  | Readonly<QuestionGenerationResearchRetryPolicy>
  | undefined {
  return runtimeStorage.getStore()?.retryPolicy;
}

/**
 * Returns the count sealed into the active research runtime. Undefined is the
 * exact ordinary-production default and must preserve the current unbounded
 * wrapper schema and provider routing.
 */
export function getQuestionGenerationResearchExpectedQuestionCount():
  | number
  | undefined {
  return runtimeStorage.getStore()?.expectedQuestionsPerStructuredCall;
}
