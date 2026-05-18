import type { SourceMatchInput } from "@/lib/extraction/restoration";
import {
  generateGroundedTextWithTriggerFetch,
  type GeminiGroundingMetadata,
} from "../gemini-ocr";
import { scoreCandidate } from "./scoring";
import type { WebSearchOutput } from "./types";

const MIN_CANDIDATE_CONFIDENCE = 0.25;
const GROUNDING_TIMEOUT_MS = 45_000;

function buildGroundingPrompt(input: {
  rawText: string;
  sourceHints: string[];
  queries: string[];
}): string {
  return [
    "Find likely original source candidates for this English exam/study passage.",
    "",
    "Use Google Search grounding. Return a concise source discovery note, not a restored passage.",
    "Prioritize exact or near-exact sources: book pages, article pages, official exam/source analyses, publisher pages, or reliable quoted excerpts.",
    "If the passage is from a book, identify title and author when possible.",
    "If only exam reposts are found, say they are exam mirrors and keep the original-source confidence lower.",
    "",
    "Search query hints:",
    input.queries.map((query) => `- ${query}`).join("\n") || "- (none)",
    "",
    "Source hints from first-pass evidence:",
    input.sourceHints.map((hint) => `- ${hint}`).join("\n") || "- (none)",
    "",
    "Passage/problem text:",
    input.rawText.slice(0, 6000),
  ].join("\n");
}

function groundingSupportText(
  metadata: GeminiGroundingMetadata | undefined,
  index: number,
): string {
  const supports = metadata?.groundingSupports ?? [];
  return supports
    .filter((support) => support.groundingChunkIndices?.includes(index))
    .map((support) => support.segment?.text)
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join(" ")
    .trim();
}

function scoreGroundingCandidate(input: {
  title: string;
  url: string;
  supportText: string;
  modelText: string;
  rawText: string;
}): number {
  const candidateText = [input.title, input.supportText, input.modelText]
    .filter(Boolean)
    .join(" ");
  const lexical = scoreCandidate(candidateText, input.rawText);
  const lower = `${input.title} ${input.url} ${input.modelText}`.toLowerCase();
  const sourceBonus =
    lower.includes("tal ben") || lower.includes("happier") ? 0.25 : 0;
  const mirrorPenalty =
    lower.includes("수능") ||
    lower.includes("exam") ||
    lower.includes("sat") ||
    lower.includes("orbi")
      ? 0.08
      : 0;
  return Math.max(0, Math.min(0.98, lexical + sourceBonus - mirrorPenalty));
}

export async function findGeminiGroundedSourceMatches(input: {
  rawText: string;
  sourceHints: string[];
  queries: string[];
  limit?: number;
}): Promise<WebSearchOutput> {
  const result = await generateGroundedTextWithTriggerFetch({
    stage: "source-grounding",
    systemPrompt:
      "You are a source attribution researcher for English exam passages. Use Google Search grounding and cite only grounded web results.",
    userPrompt: buildGroundingPrompt(input),
    timeoutInMs: GROUNDING_TIMEOUT_MS,
  });
  const metadata = result.groundingMetadata;
  const chunks = metadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const matches: SourceMatchInput[] = [];

  chunks.forEach((chunk, index) => {
    const url = chunk.web?.uri?.trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    const title = chunk.web?.title?.trim() || url;
    const supportText = groundingSupportText(metadata, index);
    const confidence = scoreGroundingCandidate({
      title,
      url,
      supportText,
      modelText: result.text,
      rawText: input.rawText,
    });
    if (confidence < MIN_CANDIDATE_CONFIDENCE) return;
    matches.push({
      title,
      sourceType: "WEB_PAGE",
      confidence: Number(confidence.toFixed(3)),
      reason:
        confidence >= 0.9
          ? "Gemini Google Search grounding found a near-exact source candidate."
          : "Gemini Google Search grounding found a plausible source candidate.",
      content: supportText || result.text.slice(0, 1500),
      sourceRef: url,
      metadata: {
        provider: "GEMINI_GOOGLE_SEARCH",
        url,
        supportText,
        groundedText: result.text.slice(0, 3000),
        webSearchQueries: metadata?.webSearchQueries ?? [],
      },
    });
  });

  const sorted = matches
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, input.limit ?? 5);

  return {
    matches: sorted,
    diagnostics: {
      provider: "GEMINI_GOOGLE_SEARCH",
      status:
        sorted[0] && sorted[0].confidence >= 0.9
          ? "MATCHED"
          : sorted.length > 0
            ? "CANDIDATES_ONLY"
            : "NO_MATCH",
      queries: metadata?.webSearchQueries?.length
        ? metadata.webSearchQueries
        : input.queries,
      groundingText: result.text.slice(0, 1000),
    },
  };
}
