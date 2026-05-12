import type { Prisma } from "@prisma/client";
import type { SourceMatchInput } from "./m2-restoration";

const LOCAL_DB_EXACT_THRESHOLD = 0.9;

export function m1SourceMatchMethod(
  match: SourceMatchInput,
  index: number,
): string {
  if (match.metadata?.provider === "KNOWN_SOURCE_SIGNATURE") {
    return "KNOWN_SOURCE_SIGNATURE";
  }
  if (match.metadata?.provider === "GEMINI_GOOGLE_SEARCH") {
    return index === 0 && match.confidence >= LOCAL_DB_EXACT_THRESHOLD
      ? "GEMINI_GROUNDING"
      : "GEMINI_GROUNDING_CANDIDATE";
  }
  const exact = index === 0 && match.confidence >= LOCAL_DB_EXACT_THRESHOLD;
  if (match.sourceType === "WEB_PAGE") {
    return exact ? "WEB_SEARCH" : "WEB_SEARCH_CANDIDATE";
  }
  return exact ? "LOCAL_DB" : "LOCAL_DB_CANDIDATE";
}

export function m1SourceMatchSelected(
  match: SourceMatchInput,
  index: number,
): boolean {
  return index === 0 && match.confidence >= LOCAL_DB_EXACT_THRESHOLD;
}

export function buildM1SourceMatchRows(input: {
  passageDraftId: string;
  sourceMatches: SourceMatchInput[];
}): Prisma.ExtractionM1PassageSourceMatchCreateManyInput[] {
  return input.sourceMatches.map((match, matchIndex) => ({
    passageDraftId: input.passageDraftId,
    sourceType: match.sourceType,
    sourceId: match.sourceId ?? null,
    sourceRef: match.sourceRef ?? null,
    title: match.title,
    publisher: match.publisher ?? null,
    unit: match.unit ?? null,
    year: match.year ?? null,
    confidence: match.confidence,
    method: m1SourceMatchMethod(match, matchIndex),
    reason: match.reason,
    selected: m1SourceMatchSelected(match, matchIndex),
    metadata: (match.metadata ?? {}) as Prisma.InputJsonValue,
  }));
}
