import { createHash } from "node:crypto";

import { z } from "zod";

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
const itemIdSchema = z.string().regex(/^RCAL-(G|B|N)[0-9]{2}$/u);
const canonicalLabelSchema = z.string().regex(/^[A-E1-5]$/u);
const evidenceRefSchema = z.string().regex(/^[A-Z][A-Z0-9_-]{1,30}:[A-Za-z0-9_.-]{1,80}$/u);
const RFC3339_PATTERN = /^(20\d{2})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/u;

export function canonicalRfc3339Micros(value: string): bigint | null {
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return null;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction = "",
    zone,
    sign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
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
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
    offsetMinutes = (sign === "+" ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  }
  const parsedMillis = Date.parse(value);
  if (!Number.isFinite(parsedMillis)) return null;
  const wholeSecondMillis = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  const fractionMicros = BigInt(fraction.padEnd(6, "0") || "0");
  if (parsedMillis !== wholeSecondMillis + Number(fractionMicros / 1000n)) return null;
  return BigInt(wholeSecondMillis) * 1000n + fractionMicros;
}

export const canonicalTimestampSchema = z
  .string()
  .refine((value) => canonicalRfc3339Micros(value) !== null, "timestamp must be a finite RFC3339 value at microsecond precision");
const isoSchema = canonicalTimestampSchema;
const INLINE_MARKER_LABELS = ["A", "B", "C", "D", "E"] as const;

export function extractInlineMarkerSurfaces(studentSurface: string): Map<(typeof INLINE_MARKER_LABELS)[number], string> {
  const matches = [...studentSurface.matchAll(/⟦([A-E]): ([^⟦⟧]+)⟧/gu)];
  if (matches.length !== INLINE_MARKER_LABELS.length) throw new Error("INLINE_MARKER_SHAPE");
  const surfaces = new Map<(typeof INLINE_MARKER_LABELS)[number], string>();
  for (const [index, match] of matches.entries()) {
    const label = match[1] as (typeof INLINE_MARKER_LABELS)[number];
    const observedSurface = match[2];
    if (label !== INLINE_MARKER_LABELS[index] || observedSurface.length === 0 || observedSurface !== observedSurface.trim()) {
      throw new Error("INLINE_MARKER_SHAPE");
    }
    surfaces.set(label, observedSurface);
  }
  if (surfaces.size !== INLINE_MARKER_LABELS.length) throw new Error("INLINE_MARKER_SHAPE");
  return surfaces;
}

const provenanceSchema = z
  .object({
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
  })
  .strict();

const phase1Schema = z
  .object({
    labelMode: z.enum(["OPTIONS", "INLINE_MARKERS", "CONSTRUCTED"]),
    direction: z.string().min(10).max(500),
    studentSurface: z.string().min(40).max(6000),
    options: z
      .array(
        z
          .object({
            canonicalLabel: canonicalLabelSchema,
            text: z.string().min(1).max(600),
          })
          .strict(),
      )
      .max(10),
    responseInstruction: z.string().min(5).max(500),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.labelMode === "OPTIONS" && value.options.length < 2) {
      ctx.addIssue({ code: "custom", message: "OPTIONS requires at least two options" });
    }
    if (value.labelMode !== "OPTIONS" && value.options.length !== 0) {
      ctx.addIssue({ code: "custom", message: "only OPTIONS may carry an option array" });
    }
    if (value.labelMode === "INLINE_MARKERS") {
      try {
        extractInlineMarkerSurfaces(value.studentSurface);
      } catch {
        ctx.addIssue({ code: "custom", message: "inline markers must be the exact ordered, unique, nonempty A-E set" });
      }
    }
    if (value.labelMode === "OPTIONS") {
      const labels = value.options.map((option) => option.canonicalLabel);
      const expected = Array.from({ length: labels.length }, (_, index) => String(index + 1));
      if (new Set(labels).size !== labels.length || JSON.stringify(labels) !== JSON.stringify(expected)) {
        ctx.addIssue({ code: "custom", message: "option labels must be the exact ordered contiguous set 1..n" });
      }
    }
  });

const storedKeySchema = z
  .object({
    disposition: z.enum(["ANSWER", "NO_ANSWER", "MULTIPLE"]),
    canonicalAnswers: z.array(z.string().min(1).max(500)).max(20),
    acceptedResponses: z.array(z.string().min(1).max(1000)).max(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.disposition === "NO_ANSWER" && value.canonicalAnswers.length !== 0) {
      ctx.addIssue({ code: "custom", message: "NO_ANSWER cannot carry answers" });
    }
    if (value.disposition === "ANSWER" && value.canonicalAnswers.length !== 1) {
      ctx.addIssue({ code: "custom", message: "ANSWER requires exactly one canonical answer" });
    }
    if (value.disposition === "MULTIPLE" && value.canonicalAnswers.length < 2) {
      ctx.addIssue({ code: "custom", message: "MULTIPLE requires at least two answers" });
    }
  });

const phase2Schema = z
  .object({
    authorizedSource: z.string().min(40).max(6000),
    storedKey: storedKeySchema,
    explanation: z.string().min(10).max(5000),
    scoringContract: z.string().min(10).max(3000),
    evidenceRefs: z.array(evidenceRefSchema).min(1).max(50),
  })
  .strict();

const craftSchema = z
  .object({
    scores: z
      .object({
        pedagogicalPointWorthiness: z.number().int().min(0).max(4),
        evidencePathEconomy: z.number().int().min(0).max(4),
        visibleIntentCoverage: z.number().int().min(0).max(4),
        competitivePlausibility: z.number().int().min(0).max(4),
        shortcutResistance: z.number().int().min(0).max(4),
        difficultyCalibration: z.number().int().min(0).max(4),
        surfaceNaturalness: z.number().int().min(0).max(4),
        explanationEconomy: z.number().int().min(0).max(4),
      })
      .strict(),
    intentCoverageFraction: z.number().min(0).max(1),
    materialShortcut: z.boolean(),
    holisticMaterialDefect: z.boolean(),
    holisticReasonCode: z.string().regex(/^[A-Z0-9_-]{3,80}$/u),
  })
  .strict();

const commonHypothesisSchema = z
  .object({
    expectedDisposition: z.enum(["ANSWER", "NO_ANSWER", "MULTIPLE"]),
    expectedAnswers: z.array(z.string().min(1).max(500)).max(20),
    intendedFatalDomains: z.array(z.enum(FATAL_DOMAINS)).max(FATAL_DOMAINS.length),
    intendedFatalCodes: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/u)).max(20),
    intendedGrade: z.enum(GRADES),
    craft: craftSchema.nullable(),
    rationale: z.string().min(30).max(3000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fatal = value.intendedFatalDomains.length > 0;
    if (fatal !== (value.intendedGrade === "F")) {
      ctx.addIssue({ code: "custom", message: "fatal-domain presence must equal grade F" });
    }
    if (fatal !== (value.intendedFatalCodes.length > 0)) {
      ctx.addIssue({ code: "custom", message: "fatal codes must accompany fatal domains" });
    }
    if (fatal !== (value.craft === null)) {
      ctx.addIssue({ code: "custom", message: "fatal hypotheses require null craft; nonfatal require craft" });
    }
  });

const grammarEvidenceSchema = z
  .object({
    markedSites: z
      .array(
        z
          .object({
            canonicalLabel: z.enum(["A", "B", "C", "D", "E"]),
            observedSurface: z.string().min(1).max(120),
            displayedGrammaticality: z.enum(["GRAMMATICAL", "UNGRAMMATICAL", "CONTESTED"]),
            correction: z.string().min(1).max(120),
            correctionRestoresSource: z.boolean(),
            diagnosis: z.enum(["ANSWER_ERROR", "VALID_DECOY", "INVALID_SITE"]),
            pointFamily: z.enum(GRAMMAR_POINT_FAMILIES),
            governingRule: z.string().min(10).max(500),
            evidenceRefs: z.array(evidenceRefSchema).min(1).max(8),
            pointWorthiness: z.number().int().min(0).max(4),
            explanationAccurate: z.boolean(),
          })
          .strict(),
      )
      .length(5),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.markedSites.map((site) => site.canonicalLabel).join("") !== "ABCDE") {
      ctx.addIssue({ code: "custom", message: "grammar evidence must contain exact ordered A-E" });
    }
  });

const blankEvidenceSchema = z
  .object({
    options: z
      .array(
        z
          .object({
            canonicalLabel: z.enum(["1", "2", "3", "4", "5"]),
            isKey: z.boolean(),
            slotGrammarCompatible: z.boolean(),
            passageGrounded: z.boolean(),
            primaryIntentAxis: z.union([z.literal("CORRECT"), z.enum(BLANK_DISTRACTOR_AXES)]),
            overlappingAxes: z
              .array(z.enum(BLANK_PROPOSITION_AXES))
              .max(BLANK_PROPOSITION_AXES.length)
              .refine((rows) => new Set(rows).size === rows.length, "overlapping axes must be unique"),
            divergentAxes: z
              .array(z.enum(BLANK_PROPOSITION_AXES))
              .max(BLANK_PROPOSITION_AXES.length)
              .refine((rows) => new Set(rows).size === rows.length, "divergent axes must be unique"),
            nearMissStrength: z.number().int().min(0).max(4),
            singleDecisiveFlaw: z.boolean(),
            cheapGiveaway: z.boolean(),
            evidenceRefs: z.array(evidenceRefSchema).min(1).max(8),
          })
          .strict(),
      )
      .length(5),
    axisOracle: z
      .array(
        z
          .object({
            axis: z.enum(BLANK_PROPOSITION_AXES),
            answerPreserved: z.boolean(),
            evidenceRefs: z.array(evidenceRefSchema).min(1).max(8),
          })
          .strict(),
      )
      .length(7),
    uniqueAnswer: z.boolean(),
    answerPreservesAllAxes: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.options.map((option) => option.canonicalLabel).join("") !== "12345") {
      ctx.addIssue({ code: "custom", message: "blank evidence must contain exact ordered 1-5" });
    }
    for (const option of value.options) {
      const overlap = new Set(option.overlappingAxes);
      const divergent = new Set(option.divergentAxes);
      if (option.overlappingAxes.some((axis) => divergent.has(axis))) {
        ctx.addIssue({ code: "custom", message: `blank option ${option.canonicalLabel} axes overlap and diverge` });
      }
      if (BLANK_PROPOSITION_AXES.some((axis) => !overlap.has(axis) && !divergent.has(axis))) {
        ctx.addIssue({ code: "custom", message: `blank option ${option.canonicalLabel} omits a proposition axis` });
      }
      if (option.primaryIntentAxis === "CORRECT" && option.divergentAxes.length !== 0) {
        ctx.addIssue({ code: "custom", message: `blank option ${option.canonicalLabel} CORRECT intent cannot diverge` });
      }
      if (option.primaryIntentAxis !== "CORRECT" && option.divergentAxes.length === 0) {
        ctx.addIssue({ code: "custom", message: `blank option ${option.canonicalLabel} distractor intent requires divergence` });
      }
      if (option.isKey && option.primaryIntentAxis !== "CORRECT") {
        ctx.addIssue({ code: "custom", message: `blank option ${option.canonicalLabel} key intent must be CORRECT` });
      }
    }
    if (value.axisOracle.map((row) => row.axis).join("|") !== BLANK_PROPOSITION_AXES.join("|")) {
      ctx.addIssue({ code: "custom", message: "blank evidence must contain exact ordered seven-axis oracle" });
    }
    if (value.answerPreservesAllAxes !== value.axisOracle.every((row) => row.answerPreserved)) {
      ctx.addIssue({ code: "custom", message: "answerPreservesAllAxes must equal seven-axis conjunction" });
    }
  });

const nonfocusEvidenceSchema = z
  .object({
    checks: z
      .array(
        z
          .object({
            checkId: z.string().regex(/^[A-Z0-9_-]{3,80}$/u),
            pass: z.boolean(),
            evidenceRefs: z.array(evidenceRefSchema).min(1).max(10),
          })
          .strict(),
      )
      .min(4)
      .max(20),
  })
  .strict();

const baseItemShape = {
  schemaVersion: z.literal("reviewer-calibration-author-item-v1"),
  itemId: itemIdSchema,
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]),
  evidenceFamily: z.enum(EVIDENCE_FAMILIES),
  authorStratum: z.enum(GRADES),
  topicTag: z.string().regex(/^[A-Z0-9_]{3,80}$/u),
  provenance: provenanceSchema,
  phase1: phase1Schema,
  phase2: phase2Schema,
};

const grammarItemSchema = z
  .object({
    ...baseItemShape,
    block: z.literal("GRAMMAR"),
    type: z.literal("GRAMMAR_ERROR"),
    evidenceFamily: z.literal("marked_selection"),
    authorHypothesis: commonHypothesisSchema.extend({ typeEvidence: grammarEvidenceSchema }).strict(),
  })
  .strict();

const blankItemSchema = z
  .object({
    ...baseItemShape,
    block: z.literal("BLANK"),
    type: z.literal("BLANK_INFERENCE"),
    evidenceFamily: z.literal("option_selection"),
    authorHypothesis: commonHypothesisSchema.extend({ typeEvidence: blankEvidenceSchema }).strict(),
  })
  .strict();

const nonfocusItemSchema = z
  .object({
    ...baseItemShape,
    block: z.literal("NONFOCUS"),
    type: z.enum([
      "GRAMMAR_CHOICE_COMBO",
      "TITLE",
      "SENTENCE_ORDER",
      "WORD_ORDER",
      "SENTENCE_TRANSFORM",
      "GRAMMAR_CORRECTION",
      "SYNONYM",
      "CONTENT_MATCH",
    ]),
    authorHypothesis: commonHypothesisSchema.extend({ typeEvidence: nonfocusEvidenceSchema }).strict(),
  })
  .strict();

export const authorItemSchema = z
  .discriminatedUnion("block", [grammarItemSchema, blankItemSchema, nonfocusItemSchema])
  .superRefine((value, ctx) => {
    if (value.authorStratum !== value.authorHypothesis.intendedGrade) {
      ctx.addIssue({ code: "custom", message: "author stratum must equal hypothesis grade" });
    }
    if (value.block === "GRAMMAR") {
      let markedSurfaces: Map<(typeof INLINE_MARKER_LABELS)[number], string>;
      try {
        markedSurfaces = extractInlineMarkerSurfaces(value.phase1.studentSurface);
      } catch {
        return;
      }
      const corrections = new Map<string, string>();
      for (const [index, site] of value.authorHypothesis.typeEvidence.markedSites.entries()) {
        const exactSurface = markedSurfaces.get(site.canonicalLabel);
        if (site.observedSurface !== exactSurface) {
          ctx.addIssue({
            code: "custom",
            path: ["authorHypothesis", "typeEvidence", "markedSites", index, "observedSurface"],
            message: `observed surface must exactly equal inline marker ${site.canonicalLabel}`,
          });
        }
        corrections.set(site.canonicalLabel, site.correction);
      }
      const reconstructedSource = value.phase1.studentSurface.replace(
        /⟦([A-E]): ([^⟦⟧]+)⟧/gu,
        (_match, label: string) => corrections.get(label) ?? "",
      );
      if (reconstructedSource !== value.phase2.authorizedSource) {
        ctx.addIssue({
          code: "custom",
          path: ["phase2", "authorizedSource"],
          message: "replacing every exact marked surface with its evidence correction must reproduce authorized source",
        });
      }
    }
  });

export const authorPacketSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-author-packet-v1"),
    artifactId: z.literal("reviewer-calibration-packet-v1"),
    status: z.literal("AUTHOR_HYPOTHESES_NOT_GOLD"),
    authoredDate: z.literal("2026-07-15"),
    items: z.array(authorItemSchema).length(24),
  })
  .strict();

export const pendingGoldSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-gold-v1"),
    artifactId: z.literal("reviewer-calibration-packet-v1"),
    status: z.literal("GOLD_ADJUDICATION_PENDING"),
    authorHypothesesAreGold: z.literal(false),
    packetPrivateSha256: sha256Schema,
    requiredIndependentRaters: z.literal(2),
    requiredFreshAdjudicators: z.literal(1),
    items: z
      .array(
        z
          .object({
            itemId: itemIdSchema,
            status: z.literal("PENDING"),
            independentReviewRecordSha256: z.tuple([]),
            adjudicatorFreshSolveSha256: z.null(),
            finalGold: z.null(),
          })
          .strict(),
      )
      .length(24),
  })
  .strict();

const phase1AnswerSchema = z
  .object({
    itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u),
    disposition: z.enum(["ANSWER", "NO_ANSWER", "MULTIPLE", "UNEVALUABLE"]),
    answerLabels: z
      .array(z.string().min(1).max(20).refine((value) => value.trim().length > 0, "answer label cannot be blank"))
      .max(20),
    answerText: z
      .string()
      .max(4000)
      .refine((value) => value.trim().length > 0, "answer text cannot be blank")
      .nullable(),
    answerTextSha256: sha256Schema.nullable(),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasText = value.answerText !== null;
    if (new Set(value.answerLabels).size !== value.answerLabels.length) {
      ctx.addIssue({ code: "custom", message: "answer labels must be unique" });
    }
    if (
      value.disposition === "ANSWER" &&
      !((value.answerLabels.length === 1 && !hasText) || (value.answerLabels.length === 0 && hasText))
    ) {
      ctx.addIssue({ code: "custom", message: "ANSWER requires exactly one label xor one nonblank text" });
    }
    if (value.disposition === "MULTIPLE" && (value.answerLabels.length < 2 || hasText)) {
      ctx.addIssue({ code: "custom", message: "MULTIPLE requires at least two unique labels and no text" });
    }
    if (["NO_ANSWER", "UNEVALUABLE"].includes(value.disposition) && (value.answerLabels.length !== 0 || hasText)) {
      ctx.addIssue({ code: "custom", message: "empty disposition cannot carry labels or text" });
    }
    if ((value.answerText === null) !== (value.answerTextSha256 === null)) {
      ctx.addIssue({ code: "custom", message: "answer text and hash must be jointly present/absent" });
    }
    if (value.answerText !== null && sha256(value.answerText) !== value.answerTextSha256) {
      ctx.addIssue({ code: "custom", message: "answer text hash mismatch" });
    }
  });

export const issuedPhase1PacketSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-phase1-v1"),
    packetInstanceId: z.string().regex(/^RCAL1-[A-Z0-9_-]{3,60}$/u),
    reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u),
    canonicalPacketSha256: sha256Schema,
    contractSha256: sha256Schema,
    items: z
      .array(
        z
          .object({
            itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u),
            surfaceSha256: sha256Schema,
            direction: z.string().min(10).max(500),
            studentSurface: z.string().min(40).max(6000),
            options: z.array(z.object({ label: z.string().min(1).max(20), text: z.string().min(1).max(600) }).strict()).max(10),
            responseInstruction: z.string().min(5).max(500),
          })
          .strict(),
      )
      .length(24),
    privateMapSha256: sha256Schema,
  })
  .strict();

export const phase1SubmissionSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-phase1-submission-v1"),
    packetInstanceId: z.string().regex(/^RCAL1-[A-Z0-9_-]{3,60}$/u),
    reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u),
    phase1PacketSha256: sha256Schema,
    answers: z.array(phase1AnswerSchema).length(24),
  })
  .strict();

export const phase1SealSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-phase1-seal-v1"),
    packetInstanceId: z.string().regex(/^RCAL1-[A-Z0-9_-]{3,60}$/u),
    reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u),
    phase1PacketSha256: sha256Schema,
    phase1SubmissionSha256: sha256Schema,
    sealedAt: isoSchema,
  })
  .strict();

export const calibrationReviewRecordSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-review-record-v1"),
    reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u),
    itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u),
    block: z.enum(BLOCKS),
    surfaceSha256: sha256Schema,
    relabelMapSha256: sha256Schema,
    phaseOneRecordSha256: sha256Schema,
    phase1SubmissionSha256: sha256Schema,
    phase2RevealSha256: sha256Schema,
    disposition: z.enum(["ANSWER", "NO_ANSWER", "MULTIPLE", "UNEVALUABLE"]),
    answerLabels: z
      .array(z.string().min(1).max(20).refine((value) => value.trim().length > 0, "answer label cannot be blank"))
      .max(20),
    answerText: z
      .string()
      .max(4000)
      .refine((value) => value.trim().length > 0, "answer text cannot be blank")
      .nullable(),
    answerTextSha256: sha256Schema.nullable(),
    anyFatal: z.boolean(),
    fatalDomains: z.array(z.enum(FATAL_DOMAINS)).max(FATAL_DOMAINS.length),
    fatalCodes: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/u)).max(20),
    grade: z.enum(GRADES),
    grammarSiteJudgments: z
      .array(
        z
          .object({
            site: z.enum(["A", "B", "C", "D", "E"]),
            displayedGrammaticality: z.enum(["GRAMMATICAL", "UNGRAMMATICAL", "CONTESTED"]),
            diagnosis: z.enum(["ANSWER_ERROR", "VALID_DECOY", "INVALID_SITE"]),
            pointFamily: z.enum(GRAMMAR_POINT_FAMILIES),
            correction: z.string().min(1).max(120),
            correctionRestoresSource: z.boolean(),
            explanationAccurate: z.boolean(),
          })
          .strict(),
      )
      .max(5),
    blankOptionJudgments: z
      .array(
        z
          .object({
            label: z.enum(["1", "2", "3", "4", "5"]),
            slotGrammarCompatible: z.boolean(),
            passageGrounded: z.boolean(),
            primaryIntentAxis: z.union([z.literal("CORRECT"), z.enum(BLANK_DISTRACTOR_AXES)]),
            divergentAxes: z.array(z.enum(BLANK_PROPOSITION_AXES)).max(BLANK_PROPOSITION_AXES.length),
            singleDecisiveFlaw: z.boolean(),
          })
          .strict(),
      )
      .max(5),
    blankAxisJudgments: z
      .array(
        z
          .object({
            axis: z.enum(BLANK_PROPOSITION_AXES),
            answerPreserved: z.boolean(),
            supportedValueEvidenceRefs: z.array(evidenceRefSchema).min(1).max(20),
          })
          .strict(),
      )
      .max(7),
    calibrationStatus: z.literal("UNASSESSED"),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasText = value.answerText !== null;
    if (new Set(value.answerLabels).size !== value.answerLabels.length) {
      ctx.addIssue({ code: "custom", message: "review answer labels must be unique" });
    }
    if (
      value.disposition === "ANSWER" &&
      !((value.answerLabels.length === 1 && !hasText) || (value.answerLabels.length === 0 && hasText))
    ) {
      ctx.addIssue({ code: "custom", message: "review ANSWER requires exactly one label xor one nonblank text" });
    }
    if (value.disposition === "MULTIPLE" && (value.answerLabels.length < 2 || hasText)) {
      ctx.addIssue({ code: "custom", message: "review MULTIPLE requires at least two unique labels and no text" });
    }
    if (["NO_ANSWER", "UNEVALUABLE"].includes(value.disposition) && (value.answerLabels.length !== 0 || hasText)) {
      ctx.addIssue({ code: "custom", message: "review empty disposition cannot carry labels or text" });
    }
    if (value.anyFatal !== (value.fatalDomains.length > 0)) {
      ctx.addIssue({ code: "custom", message: "fatal-domain aggregate mismatch" });
    }
    if (value.anyFatal !== (value.fatalCodes.length > 0)) {
      ctx.addIssue({ code: "custom", message: "fatal-code aggregate mismatch" });
    }
    if (value.anyFatal !== (value.grade === "F")) {
      ctx.addIssue({ code: "custom", message: "fatal/grade mismatch" });
    }
    if ((value.answerText === null) !== (value.answerTextSha256 === null)) {
      ctx.addIssue({ code: "custom", message: "answer text and hash must be jointly present/absent" });
    }
    if (value.answerText !== null && sha256(value.answerText) !== value.answerTextSha256) {
      ctx.addIssue({ code: "custom", message: "review answer text hash mismatch" });
    }
    const grammarSites = value.grammarSiteJudgments.map((site) => site.site).join("");
    const blankOptions = value.blankOptionJudgments.map((option) => option.label).join("");
    const blankAxes = value.blankAxisJudgments.map((row) => row.axis).join("|");
    if (value.block === "GRAMMAR" && (grammarSites !== "ABCDE" || value.blankOptionJudgments.length !== 0 || value.blankAxisJudgments.length !== 0)) {
      ctx.addIssue({ code: "custom", message: "grammar review requires exact A-E and no blank judgments" });
    }
    if (
      value.block === "BLANK" &&
      (blankOptions !== "12345" || blankAxes !== BLANK_PROPOSITION_AXES.join("|") || value.grammarSiteJudgments.length !== 0)
    ) {
      ctx.addIssue({ code: "custom", message: "blank review requires exact 1-5, exact seven axes, and no grammar judgments" });
    }
    if (
      value.block === "NONFOCUS" &&
      (value.grammarSiteJudgments.length !== 0 || value.blankOptionJudgments.length !== 0 || value.blankAxisJudgments.length !== 0)
    ) {
      ctx.addIssue({ code: "custom", message: "nonfocus review cannot carry focus judgments" });
    }
  });

export type AuthorPacket = z.infer<typeof authorPacketSchema>;
export type AuthorItem = z.infer<typeof authorItemSchema>;
export type PendingGold = z.infer<typeof pendingGoldSchema>;
export type IssuedPhase1Packet = z.infer<typeof issuedPhase1PacketSchema>;
export type Phase1Submission = z.infer<typeof phase1SubmissionSchema>;
export type Phase1Seal = z.infer<typeof phase1SealSchema>;
export type CalibrationReviewRecord = z.infer<typeof calibrationReviewRecordSchema>;

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

export function assertPacketComposition(packet: AuthorPacket): void {
  const ids = new Set(packet.items.map((item) => item.itemId));
  if (ids.size !== 24) throw new Error("PACKET_ITEM_IDS_NOT_UNIQUE");
  for (const block of BLOCKS) {
    const rows = packet.items.filter((item) => item.block === block);
    if (rows.length !== 8) throw new Error(`BLOCK_COUNT_${block}`);
    for (const grade of GRADES) {
      if (rows.filter((item) => item.authorStratum === grade).length !== 2) {
        throw new Error(`AUTHOR_STRATUM_${block}_${grade}`);
      }
    }
  }
  const families = new Set(packet.items.filter((item) => item.block === "NONFOCUS").map((item) => item.evidenceFamily));
  for (const family of EVIDENCE_FAMILIES) {
    if (!families.has(family)) throw new Error(`NONFOCUS_FAMILY_MISSING_${family}`);
  }
}
