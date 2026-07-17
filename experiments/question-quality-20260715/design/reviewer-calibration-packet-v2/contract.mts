import { createHash } from "node:crypto";

import { z } from "zod";

export const ARTIFACT_ID = "reviewer-calibration-packet-v2" as const;
export const BLOCKS = ["GRAMMAR", "BLANK", "NONFOCUS"] as const;
export const GRADES = ["F", "C", "B", "A"] as const;
export const EVIDENCE_FAMILIES = [
  "marked_selection",
  "option_selection",
  "ordering_or_insertion",
  "closed_constructed",
  "open_constructed",
  "correction",
  "lexical",
] as const;
export const FATAL_DOMAINS = [
  "taskAndRender",
  "sourceLineage",
  "answerSpace",
  "surfaceLanguage",
  "alternativeReading",
  "explanationTruth",
  "synchronization",
  "leakage",
] as const;
export const GRAMMAR_POINT_FAMILIES = [
  "FINITE_VS_NONFINITE",
  "RELATIVE_OR_NOMINAL_CLAUSE",
  "PARTICIPLE_VOICE",
  "SUBJECT_VERB_AGREEMENT",
  "ACTIVE_PASSIVE_VOICE",
  "ADJECTIVE_ADVERB_FUNCTION",
  "PRONOUN_AGREEMENT_CASE",
  "OBJECT_COMPLEMENT_FORM",
  "PARALLEL_FORM",
  "INFINITIVE_GERUND_COMPLEMENT",
] as const;
export const BLANK_PROPOSITION_AXES = [
  "actorOrTarget",
  "polarity",
  "conditionOrModality",
  "causalRelationAndDirection",
  "scopeOrQuantifier",
  "stance",
  "temporalRelation",
] as const;
export const BLANK_DISTRACTOR_AXES = [
  "scope_shift",
  "causal_reversal",
  "half_truth",
  "actor_swap",
  "condition_loss",
  "polarity_shift",
  "temporal_shift",
  "stance_shift",
  "unsupported_addition",
  "category_error",
] as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const itemIdSchema = z.string().regex(/^RCAL2-(G|B|N)[0-9]{2}$/u);
const canonicalLabelSchema = z.string().regex(/^[A-E1-5]$/u);
const evidenceRefSchema = z.string().regex(/^[A-Z][A-Z0-9_-]{1,30}:[A-Za-z0-9_.-]{1,80}$/u);
const RFC3339_PATTERN = /^(20\d{2})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/u;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashJson(value: unknown): string {
  return sha256(stableJson(value));
}

export function canonicalRfc3339Micros(value: string): number | null {
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", zone, sign, oh, om] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  let offsetMinutes = 0;
  if (zone !== "Z") {
    const offsetHour = Number(oh);
    const offsetMinute = Number(om);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
    offsetMinutes = (sign === "+" ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  }
  const wholeSecondMillis = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  const micros = Number(fraction.padEnd(6, "0") || "0");
  if (Date.parse(value) !== wholeSecondMillis + Math.floor(micros / 1000)) return null;
  const result = wholeSecondMillis * 1000 + micros;
  return Number.isSafeInteger(result) ? result : null;
}

export const canonicalTimestampSchema = z
  .string()
  .refine((value) => canonicalRfc3339Micros(value) !== null, "timestamp must be a real RFC3339 instant at microsecond precision");

export function normalizeConstructedText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export type AnswerSet =
  | { kind: "SINGLE_LABEL"; label: string; setSha256: string }
  | { kind: "MULTIPLE_LABELS"; labels: string[]; setSha256: string }
  | { kind: "SINGLE_TEXT"; text: TextAnswer; setSha256: string }
  | { kind: "MULTIPLE_TEXTS"; texts: TextAnswer[]; setSha256: string }
  | { kind: "NO_ANSWER"; setSha256: string }
  | { kind: "UNEVALUABLE"; setSha256: string };

export type TextAnswer = { text: string; textSha256: string; normalizedTextSha256: string };
export type UnhashedAnswerSet =
  | { kind: "SINGLE_LABEL"; label: string }
  | { kind: "MULTIPLE_LABELS"; labels: string[] }
  | { kind: "SINGLE_TEXT"; text: TextAnswer }
  | { kind: "MULTIPLE_TEXTS"; texts: TextAnswer[] }
  | { kind: "NO_ANSWER" }
  | { kind: "UNEVALUABLE" };

export function makeTextAnswer(text: string): TextAnswer {
  return { text, textSha256: sha256(text), normalizedTextSha256: sha256(normalizeConstructedText(text)) };
}

export function answerMembers(value: UnhashedAnswerSet | AnswerSet): string[] {
  switch (value.kind) {
    case "SINGLE_LABEL": return [value.label];
    case "MULTIPLE_LABELS": return [...value.labels];
    case "SINGLE_TEXT": return [value.text.textSha256];
    case "MULTIPLE_TEXTS": return value.texts.map((row) => row.textSha256);
    case "NO_ANSWER": return [];
    case "UNEVALUABLE": return [];
  }
}

export function answerDomain(kind: AnswerSet["kind"]): "LABELS" | "TEXTS" | "NO_ANSWER" | "UNEVALUABLE" {
  if (kind === "SINGLE_LABEL" || kind === "MULTIPLE_LABELS") return "LABELS";
  if (kind === "SINGLE_TEXT" || kind === "MULTIPLE_TEXTS") return "TEXTS";
  if (kind === "NO_ANSWER") return "NO_ANSWER";
  return "UNEVALUABLE";
}

export function computeAnswerSetSha(value: UnhashedAnswerSet | AnswerSet): string {
  return hashJson({ domain: answerDomain(value.kind), members: [...answerMembers(value)].sort() });
}

export function withAnswerSetSha<T extends UnhashedAnswerSet>(value: T): T & { setSha256: string } {
  return { ...value, setSha256: computeAnswerSetSha(value) };
}

const labelValueSchema = z.string().min(1).max(20).refine((value) => value === value.trim(), "label must be trimmed");
const textAnswerSchema = z
  .object({
    text: z.string().min(1).max(4000).refine((value) => value === value.trim(), "constructed text must be exact and outer-trimmed"),
    textSha256: sha256Schema,
    normalizedTextSha256: sha256Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (sha256(value.text) !== value.textSha256) ctx.addIssue({ code: "custom", message: "exact constructed-text hash mismatch" });
    if (sha256(normalizeConstructedText(value.text)) !== value.normalizedTextSha256) {
      ctx.addIssue({ code: "custom", message: "normalized constructed-text hash mismatch" });
    }
  });

const singleLabelAnswerSchema = z.object({ kind: z.literal("SINGLE_LABEL"), label: labelValueSchema, setSha256: sha256Schema }).strict();
const multipleLabelsAnswerSchema = z
  .object({ kind: z.literal("MULTIPLE_LABELS"), labels: z.array(labelValueSchema).min(2).max(20), setSha256: sha256Schema })
  .strict();
const singleTextAnswerSchema = z.object({ kind: z.literal("SINGLE_TEXT"), text: textAnswerSchema, setSha256: sha256Schema }).strict();
const multipleTextsAnswerSchema = z
  .object({ kind: z.literal("MULTIPLE_TEXTS"), texts: z.array(textAnswerSchema).min(2).max(20), setSha256: sha256Schema })
  .strict();
const emptyAnswerSchemas = [
  z.object({ kind: z.literal("NO_ANSWER"), setSha256: sha256Schema }).strict(),
  z.object({ kind: z.literal("UNEVALUABLE"), setSha256: sha256Schema }).strict(),
] as const;

export const answerSetSchema = z
  .discriminatedUnion("kind", [
    singleLabelAnswerSchema,
    multipleLabelsAnswerSchema,
    singleTextAnswerSchema,
    multipleTextsAnswerSchema,
    ...emptyAnswerSchemas,
  ])
  .superRefine((value, ctx) => {
    if (value.kind === "MULTIPLE_LABELS" && new Set(value.labels).size !== value.labels.length) {
      ctx.addIssue({ code: "custom", message: "label members must be unique" });
    }
    if (value.kind === "MULTIPLE_TEXTS" && new Set(value.texts.map((row) => row.textSha256)).size !== value.texts.length) {
      ctx.addIssue({ code: "custom", message: "constructed answers cannot repeat exact text" });
    }
    if (value.kind === "MULTIPLE_TEXTS" && new Set(value.texts.map((row) => row.normalizedTextSha256)).size !== value.texts.length) {
      ctx.addIssue({ code: "custom", message: "constructed answers cannot repeat whitespace-equivalent text" });
    }
    if (computeAnswerSetSha(value) !== value.setSha256) ctx.addIssue({ code: "custom", message: "answer-set hash mismatch" });
  });

export function assertAcceptedEquivalenceSets(canonicalAnswer: AnswerSet, accepted: AnswerSet[]): void {
  if (accepted.length === 0) throw new Error("ACCEPTED_EQUIVALENCE_SETS_EMPTY");
  if (new Set(accepted.map((row) => row.setSha256)).size !== accepted.length) throw new Error("ACCEPTED_EQUIVALENCE_SET_DUPLICATE");
  const domain = answerDomain(canonicalAnswer.kind);
  if (accepted.some((row) => answerDomain(row.kind) !== domain)) throw new Error("ACCEPTED_EQUIVALENCE_DOMAIN_MIX");
  if (!accepted.some((row) => row.setSha256 === canonicalAnswer.setSha256)) throw new Error("CANONICAL_ANSWER_NOT_ACCEPTED");
}

const storedKeySchema = z
  .object({
    canonicalAnswer: answerSetSchema,
    acceptedEquivalenceSets: z.array(answerSetSchema).min(1).max(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    try { assertAcceptedEquivalenceSets(value.canonicalAnswer, value.acceptedEquivalenceSets); }
    catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "accepted equivalence invalid" }); }
  });

const provenanceSchema = z.object({
  method: z.literal("DIRECT_ORIGINAL_LOCAL_COMPOSITION_FOR_THIS_USER_REQUEST"),
  copiedOrAdapted: z.literal(false),
  thirdPartySourceCount: z.literal(0),
  webUsed: z.literal(false),
  externalApiUsed: z.literal(false),
  databaseUsed: z.literal(false),
  piiObserved: z.literal(false),
  permittedUse: z.literal("LOCAL_REVIEWER_CALIBRATION_ONLY"),
  independentCodexAgentReviewAuthorized: z.literal(true),
  externalProviderApiDispatchAuthorized: z.literal(false),
}).strict();

const phase1Schema = z.object({
  labelMode: z.enum(["OPTIONS", "INLINE_MARKERS", "CONSTRUCTED"]),
  direction: z.string().min(10).max(500),
  studentSurface: z.string().min(40).max(6000),
  options: z.array(z.object({ canonicalLabel: canonicalLabelSchema, text: z.string().min(1).max(800) }).strict()).max(10),
  responseInstruction: z.string().min(5).max(500),
}).strict().superRefine((value, ctx) => {
  if (value.labelMode === "OPTIONS") {
    const labels = value.options.map((row) => row.canonicalLabel);
    const expected = labels.map((_row, index) => String(index + 1));
    if (labels.length < 2 || JSON.stringify(labels) !== JSON.stringify(expected)) ctx.addIssue({ code: "custom", message: "OPTIONS requires contiguous canonical labels 1..n" });
  } else if (value.options.length !== 0) ctx.addIssue({ code: "custom", message: "only OPTIONS can carry options" });
  if (value.labelMode === "INLINE_MARKERS") {
    const labels = [...value.studentSurface.matchAll(/⟦([A-E]): ([^⟦⟧]+)⟧/gu)].map((row) => row[1]);
    if (labels.join("") !== "ABCDE") ctx.addIssue({ code: "custom", message: "inline markers must be exact ordered A-E" });
  }
});

const phase2Schema = z.object({
  authorizedSource: z.string().min(40).max(6000),
  storedKey: storedKeySchema,
  explanation: z.string().min(10).max(5000),
  scoringContract: z.string().min(10).max(3000),
  evidenceRefs: z.array(evidenceRefSchema).min(1).max(50),
}).strict();

const craftSchema = z.object({
  scores: z.object({
    pedagogicalPointWorthiness: z.number().int().min(0).max(4), evidencePathEconomy: z.number().int().min(0).max(4),
    visibleIntentCoverage: z.number().int().min(0).max(4), competitivePlausibility: z.number().int().min(0).max(4),
    shortcutResistance: z.number().int().min(0).max(4), difficultyCalibration: z.number().int().min(0).max(4),
    surfaceNaturalness: z.number().int().min(0).max(4), explanationEconomy: z.number().int().min(0).max(4),
  }).strict(),
  intentCoverageFraction: z.number().min(0).max(1), materialShortcut: z.boolean(), holisticMaterialDefect: z.boolean(),
  holisticReasonCode: z.string().regex(/^[A-Z0-9_-]{3,80}$/u),
}).strict();

const commonHypothesisSchema = z.object({
  expectedAnswer: answerSetSchema,
  intendedFatalDomains: z.array(z.enum(FATAL_DOMAINS)).max(FATAL_DOMAINS.length),
  intendedFatalCodes: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/u)).max(20),
  intendedGrade: z.enum(GRADES), craft: craftSchema.nullable(), rationale: z.string().min(30).max(3000),
}).strict().superRefine((value, ctx) => {
  const fatal = value.intendedFatalDomains.length > 0;
  if (fatal !== (value.intendedGrade === "F")) ctx.addIssue({ code: "custom", message: "fatal presence must equal author grade F" });
  if (fatal !== (value.intendedFatalCodes.length > 0)) ctx.addIssue({ code: "custom", message: "fatal codes must accompany fatal domains" });
  if (fatal !== (value.craft === null)) ctx.addIssue({ code: "custom", message: "fatal hypotheses require null craft" });
});

const grammarEvidenceSchema = z.object({
  markedSites: z.array(z.object({
    canonicalLabel: z.enum(["A", "B", "C", "D", "E"]), observedSurface: z.string().min(1).max(160),
    displayedGrammaticality: z.enum(["GRAMMATICAL", "UNGRAMMATICAL", "CONTESTED"]), correction: z.string().min(1).max(160),
    correctionRestoresSource: z.boolean(), diagnosis: z.enum(["ANSWER_ERROR", "VALID_DECOY", "INVALID_SITE"]),
    pointFamily: z.enum(GRAMMAR_POINT_FAMILIES), governingRule: z.string().min(10).max(600), evidenceRefs: z.array(evidenceRefSchema).min(1).max(8),
    pointWorthiness: z.number().int().min(0).max(4), explanationAccurate: z.boolean(),
  }).strict()).length(5),
}).strict().refine((value) => value.markedSites.map((row) => row.canonicalLabel).join("") === "ABCDE", "grammar diagnostics must be A-E");

const blankEvidenceSchema = z.object({
  options: z.array(z.object({
    canonicalLabel: z.enum(["1", "2", "3", "4", "5"]), isKey: z.boolean(), slotGrammarCompatible: z.boolean(), passageGrounded: z.boolean(),
    primaryIntentAxis: z.union([z.literal("CORRECT"), z.enum(BLANK_DISTRACTOR_AXES)]),
    overlappingAxes: z.array(z.enum(BLANK_PROPOSITION_AXES)).max(7), divergentAxes: z.array(z.enum(BLANK_PROPOSITION_AXES)).max(7),
    nearMissStrength: z.number().int().min(0).max(4), singleDecisiveFlaw: z.boolean(), cheapGiveaway: z.boolean(), evidenceRefs: z.array(evidenceRefSchema).min(1).max(8),
  }).strict()).length(5),
  axisOracle: z.array(z.object({ axis: z.enum(BLANK_PROPOSITION_AXES), answerPreserved: z.boolean(), evidenceRefs: z.array(evidenceRefSchema).min(1).max(8) }).strict()).length(7),
  uniqueAnswer: z.boolean(), answerPreservesAllAxes: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.options.map((row) => row.canonicalLabel).join("") !== "12345") ctx.addIssue({ code: "custom", message: "blank diagnostics must be 1-5" });
  if (value.axisOracle.map((row) => row.axis).join("|") !== BLANK_PROPOSITION_AXES.join("|")) ctx.addIssue({ code: "custom", message: "blank axes incomplete" });
  for (const row of value.options) {
    const overlap = new Set(row.overlappingAxes); const divergent = new Set(row.divergentAxes);
    if (overlap.size !== row.overlappingAxes.length || divergent.size !== row.divergentAxes.length || row.overlappingAxes.some((axis) => divergent.has(axis))) ctx.addIssue({ code: "custom", message: `blank option ${row.canonicalLabel} axis partition invalid` });
    if (BLANK_PROPOSITION_AXES.some((axis) => !overlap.has(axis) && !divergent.has(axis))) ctx.addIssue({ code: "custom", message: `blank option ${row.canonicalLabel} axis omitted` });
    if ((row.primaryIntentAxis === "CORRECT") !== (row.divergentAxes.length === 0)) ctx.addIssue({ code: "custom", message: `blank option ${row.canonicalLabel} intent/divergence mismatch` });
    if (row.isKey !== (row.primaryIntentAxis === "CORRECT")) ctx.addIssue({ code: "custom", message: `blank option ${row.canonicalLabel} key mismatch` });
  }
  if (value.answerPreservesAllAxes !== value.axisOracle.every((row) => row.answerPreserved)) ctx.addIssue({ code: "custom", message: "answer axis conjunction mismatch" });
});

const nonfocusEvidenceSchema = z.object({ checks: z.array(z.object({ checkId: z.string().regex(/^[A-Z0-9_-]{3,80}$/u), pass: z.boolean(), evidenceRefs: z.array(evidenceRefSchema).min(1).max(10) }).strict()).min(4).max(20) }).strict();

const baseItemShape = {
  schemaVersion: z.literal("reviewer-calibration-author-item-v2"), itemId: itemIdSchema,
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]), evidenceFamily: z.enum(EVIDENCE_FAMILIES),
  authorStratum: z.enum(GRADES), topicTag: z.string().regex(/^[A-Z0-9_]{3,80}$/u), provenance: provenanceSchema, phase1: phase1Schema, phase2: phase2Schema,
};
const grammarItemSchema = z.object({ ...baseItemShape, block: z.literal("GRAMMAR"), type: z.literal("GRAMMAR_ERROR"), evidenceFamily: z.literal("marked_selection"), authorHypothesis: commonHypothesisSchema.extend({ typeEvidence: grammarEvidenceSchema }).strict() }).strict();
const blankItemSchema = z.object({ ...baseItemShape, block: z.literal("BLANK"), type: z.literal("BLANK_INFERENCE"), evidenceFamily: z.literal("option_selection"), authorHypothesis: commonHypothesisSchema.extend({ typeEvidence: blankEvidenceSchema }).strict() }).strict();
const nonfocusItemSchema = z.object({ ...baseItemShape, block: z.literal("NONFOCUS"), type: z.enum(["CONTENT_MATCH", "SENTENCE_ORDER", "SENTENCE_TRANSFORM", "GRAMMAR_CORRECTION", "WORD_ORDER", "TITLE", "SYNONYM", "GRAMMAR_CHOICE_COMBO"]), authorHypothesis: commonHypothesisSchema.extend({ typeEvidence: nonfocusEvidenceSchema }).strict() }).strict();

export const authorItemSchema = z.discriminatedUnion("block", [grammarItemSchema, blankItemSchema, nonfocusItemSchema]).superRefine((value, ctx) => {
  if (value.authorStratum !== value.authorHypothesis.intendedGrade) ctx.addIssue({ code: "custom", message: "author stratum/hypothesis mismatch" });
  const stored = value.phase2.storedKey;
  if (stored.canonicalAnswer.setSha256 !== value.authorHypothesis.expectedAnswer.setSha256) ctx.addIssue({ code: "custom", message: "stored key/author expected-answer mismatch" });
  const mode = value.phase1.labelMode;
  const domain = answerDomain(stored.canonicalAnswer.kind);
  if ((mode === "CONSTRUCTED") !== (domain === "TEXTS") && !["NO_ANSWER", "UNEVALUABLE"].includes(domain)) ctx.addIssue({ code: "custom", message: "answer domain does not match item mode" });
  if (value.block === "GRAMMAR") {
    const corrections = new Map(value.authorHypothesis.typeEvidence.markedSites.map((row) => [row.canonicalLabel, row.correction]));
    const observed = new Map([...value.phase1.studentSurface.matchAll(/⟦([A-E]): ([^⟦⟧]+)⟧/gu)].map((row) => [row[1], row[2]]));
    for (const site of value.authorHypothesis.typeEvidence.markedSites) if (observed.get(site.canonicalLabel) !== site.observedSurface) ctx.addIssue({ code: "custom", message: `grammar observed surface mismatch ${site.canonicalLabel}` });
    const reconstructed = value.phase1.studentSurface.replace(/⟦([A-E]): ([^⟦⟧]+)⟧/gu, (_whole, label: string) => corrections.get(label as "A" | "B" | "C" | "D" | "E") ?? "");
    if (reconstructed !== value.phase2.authorizedSource) ctx.addIssue({ code: "custom", message: "grammar corrections must reconstruct authorized source" });
  }
});

export const authorPacketSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-author-packet-v2"), artifactId: z.literal(ARTIFACT_ID),
  status: z.literal("AUTHOR_HYPOTHESES_NOT_GOLD"), authoredDate: z.literal("2026-07-15"),
  migrationFrom: z.literal("reviewer-calibration-packet-v1-invalidated"), items: z.array(authorItemSchema).length(24),
}).strict();

export const pendingGoldSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-gold-v2"), artifactId: z.literal(ARTIFACT_ID), status: z.literal("GOLD_ADJUDICATION_PENDING"),
  authorHypothesesAreGold: z.literal(false), packetPrivateSha256: sha256Schema, requiredIndependentRaters: z.literal(2), requiredFreshAdjudicators: z.literal(1),
  items: z.array(z.object({ itemId: itemIdSchema, status: z.literal("PENDING"), independentReviewRecordSha256: z.tuple([]), adjudicatorFreshSolveSha256: z.null(), finalGold: z.null() }).strict()).length(24),
}).strict();

const issuedItemSchema = z.object({
  itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u), surfaceSha256: sha256Schema, labelMode: z.enum(["OPTIONS", "INLINE_MARKERS", "CONSTRUCTED"]),
  direction: z.string().min(10).max(500), studentSurface: z.string().min(40).max(6000),
  options: z.array(z.object({ label: z.string().min(1).max(20), text: z.string().min(1).max(800) }).strict()).max(10), responseInstruction: z.string().min(5).max(500),
}).strict();

export const issuedPhase1PacketSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-phase1-v2"), packetInstanceId: z.string().regex(/^RCAL2-[A-Z0-9_-]{3,60}$/u),
  reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u), canonicalPacketSha256: sha256Schema, contractSha256: sha256Schema,
  items: z.array(issuedItemSchema).length(24), privateMapSha256: sha256Schema,
}).strict();

const phase1AnswerRecordSchema = z.object({
  itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u), surfaceSha256: sha256Schema, answer: answerSetSchema,
  answerSetSha256: sha256Schema, confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
}).strict().superRefine((value, ctx) => {
  if (value.answer.setSha256 !== value.answerSetSha256) ctx.addIssue({ code: "custom", message: "answer record/set binding mismatch" });
});

export const phase1SubmissionSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-phase1-submission-v2"), packetInstanceId: z.string().regex(/^RCAL2-[A-Z0-9_-]{3,60}$/u),
  reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u), phase1PacketSha256: sha256Schema,
  answers: z.array(phase1AnswerRecordSchema).length(24),
}).strict();

export const phase1SealSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-phase1-seal-v2"), packetInstanceId: z.string().regex(/^RCAL2-[A-Z0-9_-]{3,60}$/u),
  reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u), phase1PacketSha256: sha256Schema,
  phase1SubmissionSha256: sha256Schema, perItemRecordSha256: z.array(z.object({ itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u), recordSha256: sha256Schema }).strict()).length(24), sealedAt: canonicalTimestampSchema,
}).strict();

export const calibrationReviewRecordSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-review-record-v2"), reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u),
  itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u), block: z.enum(BLOCKS), surfaceSha256: sha256Schema, relabelMapSha256: sha256Schema,
  phaseOneRecordSha256: sha256Schema, phase1SubmissionSha256: sha256Schema, phase2RevealSha256: sha256Schema,
  blindAnswer: answerSetSchema, blindAnswerSetSha256: sha256Schema,
  anyFatal: z.boolean(), fatalDomains: z.array(z.enum(FATAL_DOMAINS)).max(FATAL_DOMAINS.length), fatalCodes: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/u)).max(20), grade: z.enum(GRADES),
  grammarSiteJudgments: z.array(z.object({ site: z.enum(["A", "B", "C", "D", "E"]), displayedGrammaticality: z.enum(["GRAMMATICAL", "UNGRAMMATICAL", "CONTESTED"]), diagnosis: z.enum(["ANSWER_ERROR", "VALID_DECOY", "INVALID_SITE"]), pointFamily: z.enum(GRAMMAR_POINT_FAMILIES), correction: z.string().min(1).max(160), correctionRestoresSource: z.boolean(), explanationAccurate: z.boolean() }).strict()).max(5),
  blankOptionJudgments: z.array(z.object({ label: z.enum(["1", "2", "3", "4", "5"]), slotGrammarCompatible: z.boolean(), passageGrounded: z.boolean(), primaryIntentAxis: z.union([z.literal("CORRECT"), z.enum(BLANK_DISTRACTOR_AXES)]), divergentAxes: z.array(z.enum(BLANK_PROPOSITION_AXES)).max(7), singleDecisiveFlaw: z.boolean() }).strict()).max(5),
  blankAxisJudgments: z.array(z.object({ axis: z.enum(BLANK_PROPOSITION_AXES), answerPreserved: z.boolean(), supportedValueEvidenceRefs: z.array(evidenceRefSchema).min(1).max(20) }).strict()).max(7),
  calibrationStatus: z.literal("UNASSESSED"),
}).strict().superRefine((value, ctx) => {
  if (value.blindAnswerSetSha256 !== value.blindAnswer.setSha256) ctx.addIssue({ code: "custom", message: "review blind-answer hash mismatch" });
  if (value.anyFatal !== (value.fatalDomains.length > 0) || value.anyFatal !== (value.fatalCodes.length > 0) || value.anyFatal !== (value.grade === "F")) ctx.addIssue({ code: "custom", message: "review fatal/grade mismatch" });
  if (value.block === "GRAMMAR" && (value.grammarSiteJudgments.map((row) => row.site).join("") !== "ABCDE" || value.blankOptionJudgments.length || value.blankAxisJudgments.length)) ctx.addIssue({ code: "custom", message: "grammar review diagnostics invalid" });
  if (value.block === "BLANK" && (value.blankOptionJudgments.map((row) => row.label).join("") !== "12345" || value.blankAxisJudgments.map((row) => row.axis).join("|") !== BLANK_PROPOSITION_AXES.join("|") || value.grammarSiteJudgments.length)) ctx.addIssue({ code: "custom", message: "blank review diagnostics invalid" });
  if (value.block === "NONFOCUS" && (value.grammarSiteJudgments.length || value.blankOptionJudgments.length || value.blankAxisJudgments.length)) ctx.addIssue({ code: "custom", message: "nonfocus review cannot carry focus diagnostics" });
});

export type AuthorPacket = z.infer<typeof authorPacketSchema>;
export type AuthorItem = z.infer<typeof authorItemSchema>;
export type IssuedPhase1Packet = z.infer<typeof issuedPhase1PacketSchema>;
export type Phase1Submission = z.infer<typeof phase1SubmissionSchema>;
export type Phase1Seal = z.infer<typeof phase1SealSchema>;
export type CalibrationReviewRecord = z.infer<typeof calibrationReviewRecordSchema>;

export function phaseOneRecordSha(itemPseudonym: string, surfaceSha256: string, answer: AnswerSet, confidence: string): string {
  return hashJson({ itemPseudonym, surfaceSha256, answer, confidence });
}

export function assertPacketComposition(packet: AuthorPacket): void {
  if (new Set(packet.items.map((row) => row.itemId)).size !== 24) throw new Error("PACKET_ITEM_IDS_NOT_UNIQUE");
  if (new Set(packet.items.map((row) => row.topicTag)).size !== 24) throw new Error("PACKET_TOPIC_TAGS_NOT_UNIQUE");
  for (const block of BLOCKS) {
    const rows = packet.items.filter((row) => row.block === block);
    if (rows.length !== 8) throw new Error(`BLOCK_COUNT_${block}`);
    for (const grade of GRADES) if (rows.filter((row) => row.authorStratum === grade).length !== 2) throw new Error(`AUTHOR_HYPOTHESIS_STRATUM_${block}_${grade}`);
  }
  const families = new Set(packet.items.filter((row) => row.block === "NONFOCUS").map((row) => row.evidenceFamily));
  for (const family of EVIDENCE_FAMILIES) if (!families.has(family)) throw new Error(`NONFOCUS_FAMILY_MISSING_${family}`);
}
