import { generateObject } from "ai";

import { model as geminiModel, GEMINI_MODEL_ID } from "@/lib/ai";
import { atlasUsageWithCost } from "@/lib/atlas-ai";
import { recordAiCost } from "@/lib/platform-api-costs";
import { downloadAsBuffer } from "@/lib/supabase-storage";

import { buildPatternProfilePrompt } from "./prompts";
import {
  examPatternProfileSchema,
  normalizePatternProfile,
  type ExamPatternProfile,
} from "./schemas";
import type { RunnerLogger } from "./runner-types";

const ANALYSIS_TIMEOUT_MS = 240_000;
const ANALYSIS_MAX_TOKENS = 32_000;
const ANALYSIS_MAX_RETRIES = 2;
const DEFAULT_PAGES_PER_CALL = 10;

export interface AnalysisSummary {
  provider: "gemini-multimodal";
  pages: number;
  chunks: number;
  llmCalls: number;
  llmAttempts: number;
}

interface AnalysisImage {
  data: Buffer;
  mediaType: string;
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function mediaTypeForPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function chunkRanges(total: number, size: number): Array<[number, number]> {
  if (size <= 0 || total <= size) return [[0, total]];
  const ranges: Array<[number, number]> = [];
  for (let start = 0; start < total; start += size) {
    ranges.push([start, Math.min(start + size, total)]);
  }
  return ranges;
}

function dedupeInsights(values: string[]): string[] {
  return [...new Set(values.filter((v) => typeof v === "string" && v.trim().length > 0))].slice(0, 40);
}

/**
 * Self-contained multimodal structured call. Feeds page images + prompt to
 * Gemini and validates the response against the ExamPatternProfile schema.
 * Internal to the similar-exam module ??does not depend on shared LLM helpers.
 */
async function runMultimodalAnalysis(
  prompt: string,
  images: AnalysisImage[],
  academyId?: string | null,
): Promise<{ object: ExamPatternProfile; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= ANALYSIS_MAX_RETRIES; attempt += 1) {
    try {
      const result = await generateObject({
        model: geminiModel,
        schema: examPatternProfileSchema,
        maxOutputTokens: ANALYSIS_MAX_TOKENS,
        abortSignal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
        
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...images.map((image) => ({
                type: "image" as const,
                image: image.data,
                mediaType: image.mediaType,
              })),
            ],
          },
        ],
      });
      await recordAiCost({
        sourceType: "SIMILAR_EXAM_AI",
        sourceDetail: "analysis",
        academyId,
        model: GEMINI_MODEL_ID,
        operationType: "SIMILAR_EXAM_GEN",
        usage: atlasUsageWithCost(result),
      });
      return { object: result.object as ExamPatternProfile, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[EXAM-PATTERN-PROFILE] attempt ${attempt} failed: ${message}`);
    }
  }
  throw lastError;
}

/**
 * Merge per-chunk partial profiles into one. Section/stimulus-group ids are
 * namespaced per chunk to avoid collisions, and slot references are rewritten.
 * Slots are deduped by printed question number.
 */
function mergeProfiles(parts: ExamPatternProfile[]): ExamPatternProfile {
  if (parts.length === 1) return parts[0];

  const base = parts[0];
  const sections: ExamPatternProfile["sections"] = [];
  const stimulusGroups: ExamPatternProfile["stimulusGroups"] = [];
  const slotsByNumber = new Map<number, ExamPatternProfile["questionSlots"][number]>();
  const insights: string[] = [];

  parts.forEach((part, chunkIndex) => {
    const prefix = `c${chunkIndex}_`;
    const sectionIdMap = new Map<string, string>();
    const groupIdMap = new Map<string, string>();

    for (const section of part.sections) {
      const id = `${prefix}${section.id}`;
      sectionIdMap.set(section.id, id);
      sections.push({ ...section, id });
    }
    for (const group of part.stimulusGroups) {
      const id = `${prefix}${group.id}`;
      groupIdMap.set(group.id, id);
      stimulusGroups.push({ ...group, id });
    }
    for (const slot of part.questionSlots) {
      if (slotsByNumber.has(slot.number)) continue;
      slotsByNumber.set(slot.number, {
        ...slot,
        sectionId: slot.sectionId ? sectionIdMap.get(slot.sectionId) ?? null : null,
        stimulusGroupId: slot.stimulusGroupId
          ? groupIdMap.get(slot.stimulusGroupId) ?? null
          : null,
      });
    }
    insights.push(...part.extractedInsights);
  });

  return {
    ...base,
    sections,
    stimulusGroups,
    questionSlots: [...slotsByNumber.values()].sort((a, b) => a.number - b.number),
    extractedInsights: dedupeInsights(insights),
  };
}

/**
 * Multimodal exam-pattern analysis. Feeds the page images straight to Gemini and
 * extracts an ExamPatternProfile ??no separate OCR pass. When there are many
 * pages the call is split into chunks and the partial profiles are merged.
 */
export async function analyzeExamPattern(args: {
  paths: string[];
  originalFileName: string | null;
  totalPages: number;
  selectedPassageCount: number;
  academyId?: string | null;
  logger?: RunnerLogger;
  onChunkStart?: (chunkNumber: number, chunkCount: number) => Promise<void>;
}): Promise<{ profile: ExamPatternProfile; summary: AnalysisSummary }> {
  const pagesPerCall = readPositiveIntegerEnv(
    "SIMILAR_EXAM_ANALYSIS_PAGES_PER_CALL",
    DEFAULT_PAGES_PER_CALL,
  );
  const ranges = chunkRanges(args.paths.length, pagesPerCall);

  const images = await Promise.all(
    args.paths.map(async (path) => ({
      data: await downloadAsBuffer(path),
      mediaType: mediaTypeForPath(path),
    })),
  );

  const partials: ExamPatternProfile[] = [];
  let llmAttempts = 0;

  for (let chunkIndex = 0; chunkIndex < ranges.length; chunkIndex += 1) {
    const [start, end] = ranges[chunkIndex];
    await args.onChunkStart?.(chunkIndex + 1, ranges.length);
    args.logger?.info?.("similar exam multimodal analysis chunk started", {
      chunk: chunkIndex + 1,
      chunkCount: ranges.length,
      pages: `${start + 1}-${end}`,
    });

    const { object, attempts } = await runMultimodalAnalysis(
      buildPatternProfilePrompt({
        originalFileName: args.originalFileName,
        totalPages: args.totalPages,
        selectedPassageCount: args.selectedPassageCount,
        pageRange: ranges.length > 1 ? { start: start + 1, end } : undefined,
      }),
      images.slice(start, end),
      args.academyId,
    );
    llmAttempts += attempts;
    partials.push(object);
  }

  const profile = normalizePatternProfile(mergeProfiles(partials));

  return {
    profile,
    summary: {
      provider: "gemini-multimodal",
      pages: args.paths.length,
      chunks: ranges.length,
      llmCalls: ranges.length,
      llmAttempts,
    },
  };
}
