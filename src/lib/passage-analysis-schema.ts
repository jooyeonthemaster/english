import { z } from "zod";

export const sentenceSchema = z.object({
  index: z.number().int().min(0),
  english: z.string().min(1),
  korean: z.string().min(1),
});

export const vocabSchema = z.object({
  word: z.string().min(1),
  meaning: z.string().min(1),
  partOfSpeech: z.string().min(1),
  pronunciation: z.string().min(1),
  sentenceIndex: z.number().int().min(0),
  difficulty: z.enum(["basic", "intermediate", "advanced"]),
});

export const grammarSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  explanation: z.string().min(1),
  textFragment: z.string().min(1),
  sentenceIndex: z.number().int().min(0),
  examples: z.array(z.string()).min(1).max(3),
  level: z.string().min(1),
});

export const paragraphSummarySchema = z.object({
  paragraphIndex: z.number().int().min(0),
  summary: z.string().min(1),
  role: z.string().min(1),
});

export const structureSchema = z.object({
  mainIdea: z.string().min(1),
  purpose: z.string().min(1),
  textType: z.string().min(1),
  paragraphSummaries: z.array(paragraphSummarySchema).min(1),
  keyPoints: z.array(z.string()).min(3).max(5),
});

export const passageAnalysisSchema = z.object({
  sentences: z.array(sentenceSchema).min(1),
  vocabulary: z.array(vocabSchema).min(5).max(25),
  grammarPoints: z.array(grammarSchema).min(1).max(10),
  structure: structureSchema,
});
