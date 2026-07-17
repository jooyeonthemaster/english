export const CODEX_NATIVE_ASSET_REVIEW_KINDS = [
  "TEXT_PROOF",
  "NARRATIVE_ART",
] as const;

export type CodexNativeAssetReviewKind =
  (typeof CODEX_NATIVE_ASSET_REVIEW_KINDS)[number];

export const CODEX_NATIVE_TEXT_PROOF_HARD_GATE_KEYS = [
  "nativeCodexProvenance",
  "unmodifiedBytes",
  "allRequiredEnglishExact",
  "allRequiredKoreanReadable",
  "everyRequiredEnglishPairedWithKorean",
  "allRenderedKoreanMeaningFaithful",
  "noBrokenGlyphs",
  "noCropping",
  "noBlankBubbles",
  "noWatermarkOrFillerText",
  "textDensityWithinConceptBudget",
] as const;

export const CODEX_NATIVE_NARRATIVE_ART_HARD_GATE_KEYS = [
  "contentComplete",
  "logicFaithful",
  "noInventedFacts",
  "engagingAndCoherent",
  "panelCount10To12",
  "conceptStyleAccurate",
  "audienceAgeAppropriate",
  "referenceTextDensityAligned",
  "noMixedStyle",
  "noReferenceCopying",
  "phoneReadable",
  "verticalPageAspect",
] as const;

export const CODEX_NATIVE_TEXT_PROOF_METRIC_THRESHOLDS = {
  textExactness: 100,
  koreanSemanticFidelity: 95,
  koreanNaturalness: 95,
  layoutReadability: 95,
} as const;

export const CODEX_NATIVE_NARRATIVE_ART_METRIC_THRESHOLDS = {
  contentFidelity: 95,
  logicAccuracy: 95,
  engagement: 85,
  styleFidelity: 90,
  visualTextBalance: 95,
  layoutReadability: 95,
} as const;

export const CODEX_NATIVE_PAIR_HARD_GATE_KEYS = [
  "contentEquivalent",
  "conceptsDistinct",
  "bothIndividuallyPassed",
  "noMixedStyle",
] as const;

export type CodexNativeTextProofHardGateKey =
  (typeof CODEX_NATIVE_TEXT_PROOF_HARD_GATE_KEYS)[number];
export type CodexNativeNarrativeArtHardGateKey =
  (typeof CODEX_NATIVE_NARRATIVE_ART_HARD_GATE_KEYS)[number];
export type CodexNativePairHardGateKey =
  (typeof CODEX_NATIVE_PAIR_HARD_GATE_KEYS)[number];

export type CodexNativeTextProofHardGates = Record<
  CodexNativeTextProofHardGateKey,
  boolean
>;
export type CodexNativeNarrativeArtHardGates = Record<
  CodexNativeNarrativeArtHardGateKey,
  boolean
>;
export type CodexNativePairHardGates = Record<
  CodexNativePairHardGateKey,
  boolean
>;

export interface CodexNativeTextProofMetrics {
  textExactness: number;
  koreanSemanticFidelity: number;
  koreanNaturalness: number;
  layoutReadability: number;
}

export interface CodexNativeRequiredPhraseEvidence {
  requiredPhrase: string;
  englishTranscription: string;
  koreanTranscription: string;
  location: string;
  englishExact: true;
  koreanMeaningFaithful: true;
  koreanNatural: true;
  readable: true;
}

export interface CodexNativeNarrativeArtMetrics {
  contentFidelity: number;
  logicAccuracy: number;
  engagement: number;
  styleFidelity: number;
  visualTextBalance: number;
  layoutReadability: number;
}

interface CodexNativeAssetReviewBase {
  runId: string;
  assetId: string;
  attempt: number;
  sourceHash: string;
  promptHash: string;
  imageSha256: string;
  reviewerAgentId: string;
  generatorAgentId: string;
  pass: boolean;
  certain: boolean;
  failureCodes: string[];
  correctionDirective: string;
  evidence: string[];
}

export interface CodexNativeTextProofReview
  extends CodexNativeAssetReviewBase {
  kind: "TEXT_PROOF";
  hardGates: CodexNativeTextProofHardGates;
  metrics: CodexNativeTextProofMetrics;
  requiredPhraseEvidence: CodexNativeRequiredPhraseEvidence[];
}

export interface CodexNativeNarrativeArtReview
  extends CodexNativeAssetReviewBase {
  kind: "NARRATIVE_ART";
  hardGates: CodexNativeNarrativeArtHardGates;
  metrics: CodexNativeNarrativeArtMetrics;
}

export type CodexNativeAssetReview =
  | CodexNativeTextProofReview
  | CodexNativeNarrativeArtReview;

export interface CodexNativeAssetReviewExpectation {
  runId: string;
  assetId: string;
  kind: CodexNativeAssetReviewKind;
  attempt: number;
  sourceHash: string;
  promptHash: string;
  imageSha256: string;
  generatorAgentId: string;
  /** Exact source phrases, in required reading order. Required for TEXT_PROOF. */
  requiredEnglishPhrases?: readonly string[];
  /** Reviewers that have already reviewed this asset/attempt. */
  otherReviewerAgentIds?: readonly string[];
}

export interface CodexNativeAssetReviewSetExpectation
  extends Omit<
    CodexNativeAssetReviewExpectation,
    "kind" | "otherReviewerAgentIds" | "requiredEnglishPhrases"
  > {
  /** Reviewers from earlier attempts that must not be reused. */
  priorReviewerAgentIds?: readonly string[];
  requiredEnglishPhrases: readonly string[];
}

export interface CodexNativeAssetReviewSet {
  TEXT_PROOF: CodexNativeTextProofReview;
  NARRATIVE_ART: CodexNativeNarrativeArtReview;
}

export interface CodexNativePairAssetIdentity {
  assetId: string;
  concept: string;
  attempt: number;
  imageSha256: string;
}

export interface CodexNativePairReviewAssetExpectation
  extends CodexNativePairAssetIdentity {
  generatorAgentId: string;
  individualReviewerAgentIds: readonly string[];
  individualReviewsPassed: boolean;
}

export interface CodexNativePairReviewExpectation {
  runId: string;
  passageId: string;
  assets: readonly [
    CodexNativePairReviewAssetExpectation,
    CodexNativePairReviewAssetExpectation,
  ];
  priorPairReviewerAgentIds?: readonly string[];
}

export interface CodexNativePairReview {
  runId: string;
  passageId: string;
  assets: [CodexNativePairAssetIdentity, CodexNativePairAssetIdentity];
  reviewerAgentId: string;
  pass: boolean;
  certain: boolean;
  hardGates: CodexNativePairHardGates;
  failureConcepts: string[];
  correctionDirective: string;
  evidence: string[];
}

export interface CodexNativeQaValidationIssue {
  code:
    | "INVALID_TYPE"
    | "MISSING_KEY"
    | "UNKNOWN_KEY"
    | "EMPTY_VALUE"
    | "INVALID_VALUE"
    | "MISMATCH"
    | "SELF_REVIEW"
    | "REVIEWER_REUSE"
    | "BELOW_THRESHOLD"
    | "INCONSISTENT_PASS";
  path: string;
  message: string;
}

export type CodexNativeQaValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: CodexNativeQaValidationIssue[] };

const ASSET_REVIEW_BASE_KEYS = [
  "runId",
  "assetId",
  "kind",
  "attempt",
  "sourceHash",
  "promptHash",
  "imageSha256",
  "reviewerAgentId",
  "generatorAgentId",
  "pass",
  "certain",
  "hardGates",
  "metrics",
  "failureCodes",
  "correctionDirective",
  "evidence",
] as const;

const TEXT_PROOF_REVIEW_KEYS = [
  ...ASSET_REVIEW_BASE_KEYS,
  "requiredPhraseEvidence",
] as const;

const REQUIRED_PHRASE_EVIDENCE_KEYS = [
  "requiredPhrase",
  "englishTranscription",
  "koreanTranscription",
  "location",
  "englishExact",
  "koreanMeaningFaithful",
  "koreanNatural",
  "readable",
] as const;

const PAIR_REVIEW_KEYS = [
  "runId",
  "passageId",
  "assets",
  "reviewerAgentId",
  "pass",
  "certain",
  "hardGates",
  "failureConcepts",
  "correctionDirective",
  "evidence",
] as const;

const PAIR_ASSET_KEYS = [
  "assetId",
  "concept",
  "attempt",
  "imageSha256",
] as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function validateCodexNativeAssetReview(
  input: unknown,
  expected: CodexNativeAssetReviewExpectation & { kind: "TEXT_PROOF" },
): CodexNativeQaValidationResult<CodexNativeTextProofReview>;
export function validateCodexNativeAssetReview(
  input: unknown,
  expected: CodexNativeAssetReviewExpectation & { kind: "NARRATIVE_ART" },
): CodexNativeQaValidationResult<CodexNativeNarrativeArtReview>;
export function validateCodexNativeAssetReview(
  input: unknown,
  expected: CodexNativeAssetReviewExpectation,
): CodexNativeQaValidationResult<CodexNativeAssetReview>;
export function validateCodexNativeAssetReview(
  input: unknown,
  expected: CodexNativeAssetReviewExpectation,
): CodexNativeQaValidationResult<CodexNativeAssetReview> {
  const issues: CodexNativeQaValidationIssue[] = [];
  const inputKind = isPlainObject(input) ? input.kind : undefined;
  const record = requireExactObject(
    input,
    inputKind === "TEXT_PROOF"
      ? TEXT_PROOF_REVIEW_KEYS
      : ASSET_REVIEW_BASE_KEYS,
    "$",
    issues,
  );
  if (!record) return { ok: false, issues };

  const kind = record.kind;
  if (kind !== "TEXT_PROOF" && kind !== "NARRATIVE_ART") {
    issue(issues, "INVALID_VALUE", "$.kind", "Expected TEXT_PROOF or NARRATIVE_ART");
  } else if (kind !== expected.kind) {
    mismatch(issues, "$.kind", expected.kind, kind);
  }

  const runId = requiredString(record.runId, "$.runId", issues);
  const assetId = requiredString(record.assetId, "$.assetId", issues);
  const sourceHash = sha256String(record.sourceHash, "$.sourceHash", issues);
  const promptHash = sha256String(record.promptHash, "$.promptHash", issues);
  const imageSha256 = sha256String(record.imageSha256, "$.imageSha256", issues);
  const reviewerAgentId = requiredString(
    record.reviewerAgentId,
    "$.reviewerAgentId",
    issues,
  );
  const generatorAgentId = requiredString(
    record.generatorAgentId,
    "$.generatorAgentId",
    issues,
  );
  const attempt = positiveInteger(record.attempt, "$.attempt", issues);
  const pass = booleanValue(record.pass, "$.pass", issues);
  const certain = booleanValue(record.certain, "$.certain", issues);

  compare(issues, "$.runId", expected.runId, runId);
  compare(issues, "$.assetId", expected.assetId, assetId);
  compare(issues, "$.attempt", expected.attempt, attempt);
  compare(issues, "$.sourceHash", expected.sourceHash, sourceHash);
  compare(issues, "$.promptHash", expected.promptHash, promptHash);
  compare(issues, "$.imageSha256", expected.imageSha256, imageSha256);
  compare(
    issues,
    "$.generatorAgentId",
    expected.generatorAgentId,
    generatorAgentId,
  );

  if (reviewerAgentId && generatorAgentId && reviewerAgentId === generatorAgentId) {
    issue(
      issues,
      "SELF_REVIEW",
      "$.reviewerAgentId",
      "The generator cannot review its own asset",
    );
  }
  if (
    reviewerAgentId &&
    expected.otherReviewerAgentIds?.includes(reviewerAgentId)
  ) {
    issue(
      issues,
      "REVIEWER_REUSE",
      "$.reviewerAgentId",
      "The two individual reviews must use distinct fresh-eyes reviewers",
    );
  }

  const failureCodes = stringArray(
    record.failureCodes,
    "$.failureCodes",
    issues,
    false,
  );
  const correctionDirective = stringValue(
    record.correctionDirective,
    "$.correctionDirective",
    issues,
  );
  const evidence = stringArray(record.evidence, "$.evidence", issues, true);

  let hardGates: Record<string, boolean> | null = null;
  let metrics: Record<string, number> | null = null;
  let requiredPhraseEvidence: CodexNativeRequiredPhraseEvidence[] | null = null;
  let gatesPass = false;
  let metricsPass = false;

  if (kind === "TEXT_PROOF") {
    hardGates = booleanRecord(
      record.hardGates,
      CODEX_NATIVE_TEXT_PROOF_HARD_GATE_KEYS,
      "$.hardGates",
      issues,
    );
    metrics = metricRecord(
      record.metrics,
      CODEX_NATIVE_TEXT_PROOF_METRIC_THRESHOLDS,
      "$.metrics",
      issues,
    );
    requiredPhraseEvidence = phraseEvidence(
      record.requiredPhraseEvidence,
      expected.requiredEnglishPhrases,
      "$.requiredPhraseEvidence",
      issues,
    );
  } else if (kind === "NARRATIVE_ART") {
    hardGates = booleanRecord(
      record.hardGates,
      CODEX_NATIVE_NARRATIVE_ART_HARD_GATE_KEYS,
      "$.hardGates",
      issues,
    );
    metrics = metricRecord(
      record.metrics,
      CODEX_NATIVE_NARRATIVE_ART_METRIC_THRESHOLDS,
      "$.metrics",
      issues,
    );
  }
  gatesPass = !!hardGates && Object.values(hardGates).every((value) => value);
  metricsPass = !!metrics && metricThresholdsPass(kind, metrics);
  const eligible = certain === true && gatesPass && metricsPass;

  if (typeof pass === "boolean" && pass !== eligible) {
    issue(
      issues,
      "INCONSISTENT_PASS",
      "$.pass",
      `pass must equal the computed hard-gate result (${eligible})`,
    );
    if (pass && metrics) {
      addBelowThresholdIssues(kind, metrics, issues);
    }
  }
  validateFailureFields(
    pass,
    failureCodes,
    correctionDirective,
    "$.failureCodes",
    "$.correctionDirective",
    issues,
  );

  if (
    issues.length > 0 ||
    !kind ||
    !runId ||
    !assetId ||
    !sourceHash ||
    !promptHash ||
    !imageSha256 ||
    !reviewerAgentId ||
    !generatorAgentId ||
    !attempt ||
    typeof pass !== "boolean" ||
    typeof certain !== "boolean" ||
    !hardGates ||
    !metrics ||
    (kind === "TEXT_PROOF" && !requiredPhraseEvidence) ||
    !failureCodes ||
    correctionDirective === null ||
    !evidence
  ) {
    return { ok: false, issues };
  }

  const base = {
    runId,
    assetId,
    attempt,
    sourceHash,
    promptHash,
    imageSha256,
    reviewerAgentId,
    generatorAgentId,
    pass,
    certain,
    failureCodes,
    correctionDirective,
    evidence,
  };
  if (kind === "TEXT_PROOF") {
    return {
      ok: true,
      value: {
        ...base,
        kind,
        hardGates: hardGates as unknown as CodexNativeTextProofHardGates,
        metrics: metrics as unknown as CodexNativeTextProofMetrics,
        requiredPhraseEvidence: requiredPhraseEvidence!,
      },
    };
  }
  return {
    ok: true,
    value: {
      ...base,
      kind: "NARRATIVE_ART",
      hardGates: hardGates as unknown as CodexNativeNarrativeArtHardGates,
      metrics: metrics as unknown as CodexNativeNarrativeArtMetrics,
    },
  };
}

/** Validates both reviews together so equal reviewer IDs can never be overlooked. */
export function validateCodexNativeAssetReviewSet(
  textProofInput: unknown,
  narrativeArtInput: unknown,
  expected: CodexNativeAssetReviewSetExpectation,
): CodexNativeQaValidationResult<CodexNativeAssetReviewSet> {
  const prior = expected.priorReviewerAgentIds ?? [];
  const text = validateCodexNativeAssetReview(textProofInput, {
    ...expected,
    kind: "TEXT_PROOF",
    otherReviewerAgentIds: prior,
  });
  const textReviewer = text.ok ? text.value.reviewerAgentId : undefined;
  const narrative = validateCodexNativeAssetReview(narrativeArtInput, {
    ...expected,
    kind: "NARRATIVE_ART",
    otherReviewerAgentIds: textReviewer ? [...prior, textReviewer] : prior,
  });
  const issues = [
    ...(text.ok ? [] : prefixIssues(text.issues, "$.TEXT_PROOF")),
    ...(narrative.ok
      ? []
      : prefixIssues(narrative.issues, "$.NARRATIVE_ART")),
  ];
  if (issues.length > 0 || !text.ok || !narrative.ok) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: { TEXT_PROOF: text.value, NARRATIVE_ART: narrative.value },
  };
}

export function validateCodexNativePairReview(
  input: unknown,
  expected: CodexNativePairReviewExpectation,
): CodexNativeQaValidationResult<CodexNativePairReview> {
  const issues: CodexNativeQaValidationIssue[] = [];
  const record = requireExactObject(input, PAIR_REVIEW_KEYS, "$", issues);
  if (!record) return { ok: false, issues };

  const runId = requiredString(record.runId, "$.runId", issues);
  const passageId = requiredString(record.passageId, "$.passageId", issues);
  const reviewerAgentId = requiredString(
    record.reviewerAgentId,
    "$.reviewerAgentId",
    issues,
  );
  const pass = booleanValue(record.pass, "$.pass", issues);
  const certain = booleanValue(record.certain, "$.certain", issues);
  compare(issues, "$.runId", expected.runId, runId);
  compare(issues, "$.passageId", expected.passageId, passageId);

  const assets = pairAssets(record.assets, expected.assets, issues);
  const hardGates = booleanRecord(
    record.hardGates,
    CODEX_NATIVE_PAIR_HARD_GATE_KEYS,
    "$.hardGates",
    issues,
  );
  if (hardGates) {
    const actualIndividualPass = expected.assets.every(
      (asset) => asset.individualReviewsPassed,
    );
    if (hardGates.bothIndividuallyPassed !== actualIndividualPass) {
      mismatch(
        issues,
        "$.hardGates.bothIndividuallyPassed",
        actualIndividualPass,
        hardGates.bothIndividuallyPassed,
      );
    }
  }
  const failureConcepts = stringArray(
    record.failureConcepts,
    "$.failureConcepts",
    issues,
    false,
  );
  const correctionDirective = stringValue(
    record.correctionDirective,
    "$.correctionDirective",
    issues,
  );
  const evidence = stringArray(record.evidence, "$.evidence", issues, true);

  if (reviewerAgentId) {
    const forbidden = new Set([
      ...expected.assets.flatMap((asset) => [
        asset.generatorAgentId,
        ...asset.individualReviewerAgentIds,
      ]),
      ...(expected.priorPairReviewerAgentIds ?? []),
    ]);
    if (forbidden.has(reviewerAgentId)) {
      issue(
        issues,
        "REVIEWER_REUSE",
        "$.reviewerAgentId",
        "Pair review must use a fresh reviewer distinct from generators and individual reviewers",
      );
    }
  }

  const eligible =
    certain === true &&
    !!hardGates &&
    Object.values(hardGates).every((value) => value);
  if (typeof pass === "boolean" && pass !== eligible) {
    issue(
      issues,
      "INCONSISTENT_PASS",
      "$.pass",
      `pass must equal the computed pair hard-gate result (${eligible})`,
    );
  }

  if (failureConcepts) {
    const concepts = new Set(expected.assets.map((asset) => asset.concept));
    for (const [index, concept] of failureConcepts.entries()) {
      if (!concepts.has(concept)) {
        issue(
          issues,
          "INVALID_VALUE",
          `$.failureConcepts[${index}]`,
          `Unknown or unrelated concept: ${concept}`,
        );
      }
    }
    if (pass === false && failureConcepts.length === 0) {
      issue(
        issues,
        "EMPTY_VALUE",
        "$.failureConcepts",
        "A failed pair review must identify at least one failing concept",
      );
    }
    if (pass === true && failureConcepts.length > 0) {
      issue(
        issues,
        "INCONSISTENT_PASS",
        "$.failureConcepts",
        "A passing pair review cannot list failing concepts",
      );
    }
  }
  validateFailureFields(
    pass,
    failureConcepts,
    correctionDirective,
    "$.failureConcepts",
    "$.correctionDirective",
    issues,
  );

  if (
    issues.length > 0 ||
    !runId ||
    !passageId ||
    !assets ||
    !reviewerAgentId ||
    typeof pass !== "boolean" ||
    typeof certain !== "boolean" ||
    !hardGates ||
    !failureConcepts ||
    correctionDirective === null ||
    !evidence
  ) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      runId,
      passageId,
      assets,
      reviewerAgentId,
      pass,
      certain,
      hardGates: hardGates as unknown as CodexNativePairHardGates,
      failureConcepts,
      correctionDirective,
      evidence,
    },
  };
}

export function formatCodexNativeQaIssues(
  issues: readonly CodexNativeQaValidationIssue[],
): string {
  return issues
    .map((entry) => `${entry.code} ${entry.path}: ${entry.message}`)
    .join("\n");
}

function requireExactObject(
  value: unknown,
  keys: readonly string[],
  path: string,
  issues: CodexNativeQaValidationIssue[],
): Record<string, unknown> | null {
  if (!isPlainObject(value)) {
    issue(issues, "INVALID_TYPE", path, "Expected a plain object");
    return null;
  }
  const allowed = new Set(keys);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      issue(issues, "MISSING_KEY", `${path}.${key}`, "Required key is missing");
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(issues, "UNKNOWN_KEY", `${path}.${key}`, "Unknown key is forbidden");
    }
  }
  return value;
}

function booleanRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
  issues: CodexNativeQaValidationIssue[],
): Record<string, boolean> | null {
  const record = requireExactObject(value, keys, path, issues);
  if (!record) return null;
  const normalized: Record<string, boolean> = {};
  for (const key of keys) {
    const entry = booleanValue(record[key], `${path}.${key}`, issues);
    if (typeof entry === "boolean") normalized[key] = entry;
  }
  return Object.keys(normalized).length === keys.length ? normalized : null;
}

function metricRecord(
  value: unknown,
  thresholds: Record<string, number>,
  path: string,
  issues: CodexNativeQaValidationIssue[],
): Record<string, number> | null {
  const keys = Object.keys(thresholds);
  const record = requireExactObject(value, keys, path, issues);
  if (!record) return null;
  const normalized: Record<string, number> = {};
  for (const key of keys) {
    const entry = record[key];
    if (
      typeof entry !== "number" ||
      !Number.isFinite(entry) ||
      entry < 0 ||
      entry > 100
    ) {
      issue(
        issues,
        "INVALID_VALUE",
        `${path}.${key}`,
        "Metric must be a finite number from 0 through 100",
      );
      continue;
    }
    normalized[key] = entry;
  }
  return Object.keys(normalized).length === keys.length ? normalized : null;
}

function addBelowThresholdIssues(
  kind: unknown,
  metrics: Record<string, number>,
  issues: CodexNativeQaValidationIssue[],
) {
  const thresholds =
    kind === "TEXT_PROOF"
      ? CODEX_NATIVE_TEXT_PROOF_METRIC_THRESHOLDS
      : CODEX_NATIVE_NARRATIVE_ART_METRIC_THRESHOLDS;
  for (const [key, threshold] of Object.entries(thresholds)) {
    if (metrics[key] < threshold) {
      issue(
        issues,
        "BELOW_THRESHOLD",
        `$.metrics.${key}`,
        `Metric ${metrics[key]} is below required threshold ${threshold}`,
      );
    }
  }
}

function metricThresholdsPass(
  kind: unknown,
  metrics: Record<string, number>,
): boolean {
  const thresholds =
    kind === "TEXT_PROOF"
      ? CODEX_NATIVE_TEXT_PROOF_METRIC_THRESHOLDS
      : CODEX_NATIVE_NARRATIVE_ART_METRIC_THRESHOLDS;
  return Object.entries(thresholds).every(
    ([key, threshold]) => metrics[key] >= threshold,
  );
}

function phraseEvidence(
  value: unknown,
  expectedPhrases: readonly string[] | undefined,
  path: string,
  issues: CodexNativeQaValidationIssue[],
): CodexNativeRequiredPhraseEvidence[] | null {
  const issueCountBefore = issues.length;
  if (!expectedPhrases) {
    issue(
      issues,
      "MISSING_KEY",
      "$expected.requiredEnglishPhrases",
      "TEXT_PROOF validation requires the ordered exact source phrases",
    );
    return null;
  }
  if (expectedPhrases.length === 0) {
    issue(
      issues,
      "EMPTY_VALUE",
      "$expected.requiredEnglishPhrases",
      "At least one exact source phrase is required",
    );
  }
  const expectedSeen = new Set<string>();
  for (const [index, phrase] of expectedPhrases.entries()) {
    if (typeof phrase !== "string" || !phrase.trim()) {
      issue(
        issues,
        "EMPTY_VALUE",
        `$expected.requiredEnglishPhrases[${index}]`,
        "Expected phrases must be nonempty strings",
      );
      continue;
    }
    if (expectedSeen.has(phrase)) {
      issue(
        issues,
        "INVALID_VALUE",
        `$expected.requiredEnglishPhrases[${index}]`,
        "Expected phrases must be unique",
      );
    }
    expectedSeen.add(phrase);
  }

  if (!Array.isArray(value)) {
    issue(issues, "INVALID_TYPE", path, "Expected an ordered phrase-evidence array");
    return null;
  }
  if (value.length !== expectedPhrases.length) {
    issue(
      issues,
      "MISMATCH",
      path,
      `Expected exactly ${expectedPhrases.length} phrase-evidence items, received ${value.length}`,
    );
  }

  const parsed: CodexNativeRequiredPhraseEvidence[] = [];
  const requiredSeen = new Set<string>();
  const transcriptionSeen = new Set<string>();
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    const record = requireExactObject(
      item,
      REQUIRED_PHRASE_EVIDENCE_KEYS,
      itemPath,
      issues,
    );
    if (!record) continue;
    const requiredPhrase = exactNonemptyString(
      record.requiredPhrase,
      `${itemPath}.requiredPhrase`,
      issues,
    );
    const englishTranscription = exactNonemptyString(
      record.englishTranscription,
      `${itemPath}.englishTranscription`,
      issues,
    );
    const koreanTranscription = requiredString(
      record.koreanTranscription,
      `${itemPath}.koreanTranscription`,
      issues,
    );
    const location = requiredString(record.location, `${itemPath}.location`, issues);
    const englishExact = booleanValue(
      record.englishExact,
      `${itemPath}.englishExact`,
      issues,
    );
    const koreanMeaningFaithful = booleanValue(
      record.koreanMeaningFaithful,
      `${itemPath}.koreanMeaningFaithful`,
      issues,
    );
    const koreanNatural = booleanValue(
      record.koreanNatural,
      `${itemPath}.koreanNatural`,
      issues,
    );
    const readable = booleanValue(record.readable, `${itemPath}.readable`, issues);
    for (const [key, confirmed, message] of [
      ["englishExact", englishExact, "Every source-English transcription must be confirmed exact"],
      ["koreanMeaningFaithful", koreanMeaningFaithful, "Every Korean pair must preserve the source meaning"],
      ["koreanNatural", koreanNatural, "Every Korean pair must be natural Korean, not a frozen wording match"],
      ["readable", readable, "Every required bilingual pair must be confirmed readable"],
    ] as const) {
      if (confirmed === false) {
        issue(issues, "INVALID_VALUE", `${itemPath}.${key}`, message);
      }
    }

    if (requiredPhrase !== null) {
      if (requiredSeen.has(requiredPhrase)) {
        issue(
          issues,
          "INVALID_VALUE",
          `${itemPath}.requiredPhrase`,
          "Duplicate required-phrase evidence is forbidden",
        );
      }
      requiredSeen.add(requiredPhrase);
      compare(
        issues,
        `${itemPath}.requiredPhrase`,
        expectedPhrases[index],
        requiredPhrase,
      );
    }
    if (englishTranscription !== null) {
      if (transcriptionSeen.has(englishTranscription)) {
        issue(
          issues,
          "INVALID_VALUE",
          `${itemPath}.englishTranscription`,
          "Duplicate transcriptions are forbidden",
        );
      }
      transcriptionSeen.add(englishTranscription);
      compare(
        issues,
        `${itemPath}.englishTranscription`,
        expectedPhrases[index],
        englishTranscription,
      );
    }
    if (
      requiredPhrase !== null &&
      englishTranscription !== null &&
      koreanTranscription !== null &&
      location !== null &&
      englishExact === true &&
      koreanMeaningFaithful === true &&
      koreanNatural === true &&
      readable === true
    ) {
      parsed.push({
        requiredPhrase,
        englishTranscription,
        koreanTranscription,
        location,
        englishExact,
        koreanMeaningFaithful,
        koreanNatural,
        readable,
      });
    }
  }

  if (
    issues.length !== issueCountBefore ||
    parsed.length !== expectedPhrases.length
  ) {
    return null;
  }
  return parsed;
}

function pairAssets(
  value: unknown,
  expected: CodexNativePairReviewExpectation["assets"],
  issues: CodexNativeQaValidationIssue[],
): [CodexNativePairAssetIdentity, CodexNativePairAssetIdentity] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    issue(
      issues,
      "INVALID_VALUE",
      "$.assets",
      "Pair review must contain exactly two asset identities",
    );
    return null;
  }
  const parsed: CodexNativePairAssetIdentity[] = [];
  for (let index = 0; index < 2; index += 1) {
    const path = `$.assets[${index}]`;
    const record = requireExactObject(value[index], PAIR_ASSET_KEYS, path, issues);
    if (!record) continue;
    const assetId = requiredString(record.assetId, `${path}.assetId`, issues);
    const concept = requiredString(record.concept, `${path}.concept`, issues);
    const attempt = positiveInteger(record.attempt, `${path}.attempt`, issues);
    const imageSha256 = sha256String(
      record.imageSha256,
      `${path}.imageSha256`,
      issues,
    );
    if (assetId && concept && attempt && imageSha256) {
      parsed.push({ assetId, concept, attempt, imageSha256 });
    }
  }
  if (parsed.length !== 2) return null;
  if (parsed[0].assetId === parsed[1].assetId) {
    issue(issues, "INVALID_VALUE", "$.assets", "Asset IDs must be distinct");
  }
  if (parsed[0].concept === parsed[1].concept) {
    issue(issues, "INVALID_VALUE", "$.assets", "Concepts must be distinct");
  }

  const expectedById = new Map(expected.map((asset) => [asset.assetId, asset]));
  for (const [index, asset] of parsed.entries()) {
    const expectedAsset = expectedById.get(asset.assetId);
    if (!expectedAsset) {
      issue(
        issues,
        "MISMATCH",
        `$.assets[${index}].assetId`,
        `Asset is not in the current expected pair: ${asset.assetId}`,
      );
      continue;
    }
    compare(
      issues,
      `$.assets[${index}].concept`,
      expectedAsset.concept,
      asset.concept,
    );
    compare(
      issues,
      `$.assets[${index}].attempt`,
      expectedAsset.attempt,
      asset.attempt,
    );
    compare(
      issues,
      `$.assets[${index}].imageSha256`,
      expectedAsset.imageSha256,
      asset.imageSha256,
    );
  }
  if (new Set(parsed.map((asset) => asset.assetId)).size !== expected.length) {
    issue(issues, "MISMATCH", "$.assets", "Pair does not cover both expected assets");
  }
  return parsed as [CodexNativePairAssetIdentity, CodexNativePairAssetIdentity];
}

function validateFailureFields(
  pass: boolean | null,
  failures: string[] | null,
  correctionDirective: string | null,
  failuresPath: string,
  correctionPath: string,
  issues: CodexNativeQaValidationIssue[],
) {
  if (pass === false) {
    if (!failures || failures.length === 0) {
      issue(
        issues,
        "EMPTY_VALUE",
        failuresPath,
        "A failed review must provide at least one failure",
      );
    }
    if (!correctionDirective) {
      issue(
        issues,
        "EMPTY_VALUE",
        correctionPath,
        "A failed review must provide a concrete correction directive",
      );
    }
  } else if (pass === true) {
    if (failures && failures.length > 0) {
      issue(
        issues,
        "INCONSISTENT_PASS",
        failuresPath,
        "A passing review cannot contain failures",
      );
    }
    if (correctionDirective) {
      issue(
        issues,
        "INCONSISTENT_PASS",
        correctionPath,
        "A passing review must use an empty correction directive",
      );
    }
  }
}

function requiredString(
  value: unknown,
  path: string,
  issues: CodexNativeQaValidationIssue[],
): string | null {
  const normalized = stringValue(value, path, issues);
  if (normalized === null) return null;
  if (!normalized) {
    issue(issues, "EMPTY_VALUE", path, "Value must not be empty");
    return null;
  }
  return normalized;
}

function exactNonemptyString(
  value: unknown,
  path: string,
  issues: CodexNativeQaValidationIssue[],
): string | null {
  if (typeof value !== "string") {
    issue(issues, "INVALID_TYPE", path, "Expected a string");
    return null;
  }
  if (!value.trim()) {
    issue(issues, "EMPTY_VALUE", path, "Value must not be empty");
    return null;
  }
  return value;
}

function sha256String(
  value: unknown,
  path: string,
  issues: CodexNativeQaValidationIssue[],
): string | null {
  const normalized = requiredString(value, path, issues);
  if (normalized && !SHA256_PATTERN.test(normalized)) {
    issue(
      issues,
      "INVALID_VALUE",
      path,
      "Expected a lowercase 64-character SHA-256 hex digest",
    );
    return null;
  }
  return normalized;
}

function stringValue(
  value: unknown,
  path: string,
  issues: CodexNativeQaValidationIssue[],
): string | null {
  if (typeof value !== "string") {
    issue(issues, "INVALID_TYPE", path, "Expected a string");
    return null;
  }
  return value.trim();
}

function stringArray(
  value: unknown,
  path: string,
  issues: CodexNativeQaValidationIssue[],
  requireNonempty: boolean,
): string[] | null {
  if (!Array.isArray(value)) {
    issue(issues, "INVALID_TYPE", path, "Expected an array of strings");
    return null;
  }
  const normalized: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !item.trim()) {
      issue(
        issues,
        "EMPTY_VALUE",
        `${path}[${index}]`,
        "Array entries must be nonempty strings",
      );
      continue;
    }
    const entry = item.trim();
    if (normalized.includes(entry)) {
      issue(
        issues,
        "INVALID_VALUE",
        `${path}[${index}]`,
        "Duplicate entries are forbidden",
      );
      continue;
    }
    normalized.push(entry);
  }
  if (requireNonempty && normalized.length === 0) {
    issue(issues, "EMPTY_VALUE", path, "At least one evidence item is required");
  }
  return normalized;
}

function positiveInteger(
  value: unknown,
  path: string,
  issues: CodexNativeQaValidationIssue[],
): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    issue(issues, "INVALID_VALUE", path, "Expected a positive integer");
    return null;
  }
  return value;
}

function booleanValue(
  value: unknown,
  path: string,
  issues: CodexNativeQaValidationIssue[],
): boolean | null {
  if (typeof value !== "boolean") {
    issue(issues, "INVALID_TYPE", path, "Expected a boolean");
    return null;
  }
  return value;
}

function compare(
  issues: CodexNativeQaValidationIssue[],
  path: string,
  expected: unknown,
  actual: unknown,
) {
  if (actual !== null && actual !== undefined && actual !== expected) {
    mismatch(issues, path, expected, actual);
  }
}

function mismatch(
  issues: CodexNativeQaValidationIssue[],
  path: string,
  expected: unknown,
  actual: unknown,
) {
  issue(
    issues,
    "MISMATCH",
    path,
    `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  );
}

function issue(
  issues: CodexNativeQaValidationIssue[],
  code: CodexNativeQaValidationIssue["code"],
  path: string,
  message: string,
) {
  issues.push({ code, path, message });
}

function prefixIssues(
  issues: readonly CodexNativeQaValidationIssue[],
  prefix: string,
): CodexNativeQaValidationIssue[] {
  return issues.map((entry) => ({
    ...entry,
    path: `${prefix}${entry.path === "$" ? "" : entry.path.slice(1)}`,
  }));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
