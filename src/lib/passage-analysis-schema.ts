import { z } from "zod";

// ─── Layer 0: Sentences ──────────────────────────────────
export const sentenceSchema = z.object({
  index: z.number().int().min(0),
  english: z.string().min(1),
  korean: z.string().min(1),
});

// ─── Layer 1: Vocabulary (확장) ──────────────────────────
export const vocabSchema = z.object({
  // 기존
  word: z.string().min(1),
  meaning: z.string().min(1),
  partOfSpeech: z.string().min(1),
  pronunciation: z.string().min(1),
  sentenceIndex: z.number().int().min(0),
  difficulty: z.string().min(1),

  // 확장 (배열 크기 제한 필수)
  synonyms: z.array(z.string()).max(3).optional(),
  antonyms: z.array(z.string()).max(2).optional(),
  derivatives: z.array(z.string()).max(3).optional(),
  collocations: z.array(z.string()).max(3).optional(),
  englishDefinition: z.string().optional(),
  confusableWords: z.array(z.string()).max(2).optional(),
  contextMeaning: z.string().optional(),
  examType: z.string().optional(),
});

// ─── Layer 2: Grammar/어법 (확장) ────────────────────────
export const grammarSchema = z.object({
  // 기존
  id: z.string().min(1),
  pattern: z.string().min(1),
  explanation: z.string().min(1),
  textFragment: z.string().min(1),
  sentenceIndex: z.number().int().min(0),
  examples: z.array(z.string()).min(1).max(3),
  level: z.string().min(1),

  // 확장 (배열 크기 제한 필수)
  examType: z.string().optional(),
  commonMistake: z.string().optional(),
  transformations: z.array(z.string()).max(3).optional(),
  gradeLevel: z.string().optional(),
  relatedGrammar: z.array(z.string()).max(3).optional(),
  csatFrequency: z.string().optional(),
});

// ─── Layer 3: Syntax Analysis (신규) ─────────────────────
export const syntaxSchema = z.object({
  sentenceIndex: z.number().int().min(0),
  structure: z.string().min(1),
  chunkReading: z.string().min(1),
  patternType: z.string().optional(),
  transformPoint: z.string().optional(),
  complexity: z.string().min(1),
  keyPhrase: z.string().optional(),
});

// ─── Layer 4: Structure/독해 (확장) ──────────────────────
export const paragraphSummarySchema = z.object({
  paragraphIndex: z.number().int().min(0),
  summary: z.string().min(1),
  role: z.string().min(1),
});

export const logicFlowSchema = z.object({
  role: z.string().min(1),
  sentenceIndices: z.array(z.number().int()).max(3),
  summary: z.string().min(1),
});

export const connectorSchema = z.object({
  word: z.string().min(1),
  sentenceIndex: z.number().int().min(0),
  role: z.string().min(1),
  examRelevance: z.string().min(1),
});

export const structureSchema = z.object({
  // 기존
  mainIdea: z.string().min(1),
  purpose: z.string().min(1),
  textType: z.string().min(1),
  paragraphSummaries: z.array(paragraphSummarySchema).min(1),
  keyPoints: z.array(z.string()).min(3).max(7),

  // 확장
  logicFlow: z.array(logicFlowSchema).max(5).optional(),
  connectorAnalysis: z.array(connectorSchema).max(5).optional(),
  topicSentenceIndex: z.number().int().optional(),
  blankSuitablePositions: z.array(z.string()).max(3).optional(),
  orderClues: z.array(z.string()).max(3).optional(),
  tone: z.string().optional(),
});

// ─── Layer 5: Exam Design (신규) ─────────────────────────
export const paraphraseSegmentSchema = z.object({
  original: z.string().min(1),
  alternatives: z.array(z.string()).min(1).max(3),
  sentenceIndex: z.number().int().min(0),
  reason: z.string().optional(),
  questionExample: z.string().optional(),
  difficulty: z.string().optional(),
  relatedPoint: z.string().optional(),
});

export const transformPointSchema = z.object({
  original: z.string().min(1),
  transformType: z.string().min(1),
  example: z.string().min(1),
  sentenceIndex: z.number().int().min(0),
  reason: z.string().optional(),
  questionExample: z.string().optional(),
  difficulty: z.string().optional(),
});

export const examDesignSchema = z.object({
  paraphrasableSegments: z.array(paraphraseSegmentSchema).max(4),
  structureTransformPoints: z.array(transformPointSchema).max(4),
  summaryKeyPoints: z.array(z.string()).max(4),
  descriptiveConditions: z.array(z.string()).max(4),
});

// ─── Core Schema (1차 호출) ───────────────────────────────
export const passageAnalysisCoreSchema = z.object({
  sentences: z.array(sentenceSchema).min(1),
  vocabulary: z.array(vocabSchema).min(5).max(15),
  grammarPoints: z.array(grammarSchema).min(1).max(8),
  structure: structureSchema,
});

// ─── Extended Schema (2차 호출) ──────────────────────────
export const passageAnalysisExtendedSchema = z.object({
  syntaxAnalysis: z.array(syntaxSchema).min(1).max(5),
  examDesign: examDesignSchema,
});

// ─── Combined Schema (for type compatibility) ────────────
export const passageAnalysisSchema = z.object({
  sentences: z.array(sentenceSchema).min(1),
  vocabulary: z.array(vocabSchema).min(5).max(15),
  grammarPoints: z.array(grammarSchema).min(1).max(8),
  structure: structureSchema,
  syntaxAnalysis: z.array(syntaxSchema).optional(),
  examDesign: examDesignSchema.optional(),
});
