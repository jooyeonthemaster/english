/**
 * Executable research-only schema drafts.
 *
 * They import the current production question schemas and replace only the
 * internal, server-stripped planning field.  Candidate adapters then restore
 * the current field name before existing post-process/quality gates run.
 * Nothing in src/ imports this file.
 */
import { z } from "zod";

import {
  aiBlankInferenceSchema,
  buildAiGrammarErrorSchema,
} from "../../../../src/lib/question-ai-schemas-mc";
import { grammarPremiumAnswerOnlySchema } from "../../../../src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder";

export const CORE_10_POINT_CODES = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "k",
] as const;

const grammarMutationClassSchema = z.enum([
  "FINITE_NONFINITE",
  "RELATIVE_OR_NOMINAL_CLAUSE",
  "PARTICIPLE_VOICE",
  "SUBJECT_VERB_AGREEMENT",
  "FINITE_VOICE",
  "ADJECTIVE_ADVERB_FUNCTION",
  "PRONOUN_AGREEMENT_OR_CASE",
  "OBJECT_COMPLEMENT_FORM",
  "PARALLEL_FORM",
  "INFINITIVE_GERUND_COMPLEMENT",
]);

export const grammarSiteCertificateSchema = z.object({
  certificationStatus: z
    .enum(["CERTIFIED", "NO_SAFE_SITE"])
    .describe("CERTIFIED only when the proposed mutation is unambiguously ungrammatical."),
  sourceSentenceExact: z.string().describe("Exact source sentence containing the site."),
  sourceExpressionExact: z
    .string()
    .describe("Exact minimal source expression at the certified site."),
  surroundingTextExact: z
    .string()
    .describe("Exact source dependency window sufficient to judge the site."),
  pointCode: z.enum(CORE_10_POINT_CODES),
  frame: z
    .string()
    .describe("Short school-grammar name for the actual structure, not a profile code."),
  governingRule: z
    .string()
    .describe("One sentence identifying governor/dependent and the decisive syntactic rule."),
  mutation: z.object({
    sourceForm: z.string().describe("Must equal sourceExpressionExact."),
    displayedError: z.string().describe("The only intentionally wrong surface form."),
    correction: z.string().describe("Must equal sourceExpressionExact."),
    mutationClass: grammarMutationClassSchema,
  }),
  strongestAlternativeParse: z
    .string()
    .describe("The strongest plausible parse that could make the displayed form acceptable."),
  whyAlternativeFails: z
    .string()
    .describe("Concrete syntactic reason that the strongest alternative parse is unavailable here."),
  mutationOnlyCertifiedSite: z.literal(true),
});

function grammarQuestionWithSiteCertificate(markerCount: number, answerCount: number) {
  const base = buildAiGrammarErrorSchema(markerCount, answerCount);
  const { direction, errorDesign: _errorDesign, ...tail } = base.shape;
  return z.object({
    direction,
    siteCertificate: grammarSiteCertificateSchema,
    ...tail,
  });
}

export function buildGrammarSiteCertificateResponseSchema(
  markerCount = 5,
  answerCount = 1,
) {
  return z.object({
    questions: z.array(grammarQuestionWithSiteCertificate(markerCount, answerCount)),
  });
}

const blankEvidenceAnchorSchema = z.object({
  id: z.enum(["E1", "E2", "E3"]),
  exactQuote: z.string().describe("Exact passage quote."),
  contribution: z.string().describe("How this evidence constrains the answer meaning axis."),
});

const blankSlotContractSchema = z.object({
  prefixExact: z.string().describe("Exact text immediately before the blank in its sentence."),
  suffixExact: z.string().describe("Exact text immediately after the blank in its sentence."),
  syntacticCategory: z.enum([
    "NOUN_PHRASE",
    "VERB_PHRASE",
    "FINITE_CLAUSE",
    "NONFINITE_CLAUSE",
    "ADJECTIVE_PHRASE",
    "ADVERBIAL_PHRASE",
    "PREPOSITIONAL_COMPLEMENT",
  ]),
  polarity: z.enum(["POSITIVE", "NEGATIVE", "PRIVATIVE", "MIXED"]),
  scope: z.enum(["LOCAL_CLAIM", "RELATION", "PARAGRAPH_THESIS", "WHOLE_PASSAGE_THESIS"]),
  register: z.enum(["PLAIN", "ACADEMIC", "ABSTRACT_ACADEMIC"]),
});

const blankCorrectIntentSchema = z.object({
  label: z.enum(["1", "2", "3", "4", "5"]),
  status: z.literal("CORRECT"),
  proposedText: z.string(),
  meaningRelation: z.literal("EQUIVALENT_SYNTHESIS"),
  evidenceIds: z.array(z.enum(["E1", "E2", "E3"])).min(1).max(3),
  sameSlotProof: z.string().describe("Why the proposed text satisfies the shared slot contract."),
});

const blankDistractorIntentSchema = z.object({
  label: z.enum(["1", "2", "3", "4", "5"]),
  status: z.literal("DISTRACTOR"),
  proposedText: z.string(),
  intent: z.enum([
    "CAUSE_EFFECT_REVERSAL",
    "AGENT_TARGET_SWAP",
    "SCOPE_NARROWING",
    "SCOPE_BROADENING",
    "HALF_TRUE_FALSE_RELATION",
    "STANCE_SHIFT",
    "TIMING_OR_CONDITION_SHIFT",
  ]),
  borrowedPassageConcept: z.string(),
  errorDistance: z.object({
    semanticOverlap: z.enum(["HIGH", "MEDIUM"]),
    distortionCount: z.literal("ONE"),
    eliminationDepth: z.enum([
      "ONE_LOCAL_CLUE",
      "TWO_LINKED_CLUES",
      "WHOLE_PASSAGE_SYNTHESIS",
    ]),
  }),
  decisiveExclusion: z.object({
    evidenceIds: z.array(z.enum(["E1", "E2", "E3"])).min(1).max(3),
    reason: z.string(),
  }),
  mutuallyExclusiveWithAnswer: z
    .string()
    .describe("Why this intent and the answer cannot both satisfy the blank's claim."),
  sameSlotProof: z.string().describe("Why the proposed text satisfies the shared slot contract."),
});

export const blankBlueprintSchema = z.object({
  target: z.object({
    originalExpressionExact: z.string(),
    surroundingTextExact: z.string(),
    discourseRole: z.enum([
      "TOPIC_CLAIM",
      "CONCLUSION",
      "CAUSAL_RESULT",
      "CONTRAST_TURN",
      "RESTATEMENT",
    ]),
    answerMeaningAxis: z
      .string()
      .describe("One proposition preserving relation, scope, stance and polarity."),
    evidenceAnchors: z.array(blankEvidenceAnchorSchema).min(1).max(3),
    slotContract: blankSlotContractSchema,
  }),
  optionIntentLedger: z.object({
    correctIntent: blankCorrectIntentSchema,
    distractorIntents: z.array(blankDistractorIntentSchema).length(4),
  }),
  seamAudit: z.object({
    allFiveGrammatical: z.literal(true),
    noOptionRepeatsBoundaryMaterial: z.literal(true),
    noPolarityOrLengthGiveaway: z.literal(true),
  }),
});

export const blankOptionLedgerQuestionSchema = (() => {
  const { direction, blankDesign: _blankDesign, ...tail } = aiBlankInferenceSchema.shape;
  return z.object({
    direction,
    blankBlueprint: blankBlueprintSchema,
    ...tail,
  });
})();

export function buildBlankOptionLedgerResponseSchema() {
  return z.object({ questions: z.array(blankOptionLedgerQuestionSchema) });
}

export function buildPremiumGrammarAnswerStageSiteCertificateSchema() {
  const { direction, answerDesign: _answerDesign, ...tail } =
    grammarPremiumAnswerOnlySchema.shape;
  return z.object({
    direction,
    siteCertificate: grammarSiteCertificateSchema,
    ...tail,
  });
}

type PremiumGrammarAnswerStageSiteCertificate = z.infer<
  ReturnType<typeof buildPremiumGrammarAnswerStageSiteCertificateSchema>
>;

export function adaptPremiumGrammarAnswerSiteCertificateForCurrentLadder(
  answerStage: PremiumGrammarAnswerStageSiteCertificate,
) {
  const { siteCertificate, ...rest } = answerStage;
  return { ...rest, answerDesign: JSON.stringify(siteCertificate) };
}

export function adaptGrammarSiteCertificateCandidateForCurrentGates(
  question: z.infer<ReturnType<typeof grammarQuestionWithSiteCertificate>>,
) {
  const { siteCertificate, ...rest } = question;
  return { ...rest, errorDesign: JSON.stringify(siteCertificate) };
}

export function adaptBlankOptionLedgerCandidateForCurrentGates(
  question: z.infer<typeof blankOptionLedgerQuestionSchema>,
) {
  const { blankBlueprint, ...rest } = question;
  return { ...rest, blankDesign: JSON.stringify(blankBlueprint) };
}
