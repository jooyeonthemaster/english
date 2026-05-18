import type { SourceMatchInput } from "@/lib/extraction/restoration";
import { bestTextWindow, fetchPageText } from "./html";
import { scoreCandidate } from "./scoring";
import type { SearchResult } from "./types";

const FETCH_RESULT_LIMIT = 4;
const MIN_CANDIDATE_CONFIDENCE = 0.25;

export async function buildCandidates(
  rawText: string,
  results: SearchResult[],
): Promise<SourceMatchInput[]> {
  const seen = new Set<string>();
  const candidates: SourceMatchInput[] = [];

  for (const result of results) {
    if (seen.has(result.url)) continue;
    seen.add(result.url);

    const fetchedText =
      candidates.length < FETCH_RESULT_LIMIT ? await fetchPageText(result.url) : null;
    const content = fetchedText
      ? bestTextWindow(fetchedText, rawText)
      : result.snippet;
    const confidence = scoreCandidate(content, rawText);
    if (confidence < MIN_CANDIDATE_CONFIDENCE) continue;

    candidates.push({
      title: result.title || result.url,
      sourceType: "WEB_PAGE",
      confidence: Number(confidence.toFixed(3)),
      reason:
        confidence >= 0.9
          ? "Web search found a near-exact passage source candidate."
          : "Web search found a source candidate sharing meaningful passage text.",
      content,
      sourceRef: result.url,
      metadata: {
        url: result.url,
        snippet: result.snippet,
        fetched: Boolean(fetchedText),
      },
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

export const BUILD_CANDIDATES_MIN_CONFIDENCE = MIN_CANDIDATE_CONFIDENCE;
