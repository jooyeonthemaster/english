import type { SourceMatchInput } from "@/lib/extraction/restoration";
import { BUILD_CANDIDATES_MIN_CONFIDENCE, buildCandidates } from "./candidates";
import { findGeminiGroundedSourceMatches } from "./grounding";
import { knownSourceMatches } from "./known-sources";
import {
  PROVIDER_SEARCH_RESULT_LIMIT,
  providerName,
  searchProvider,
} from "./providers";
import { buildSearchQueries } from "./queries";
import type { SearchResult, WebSearchOutput } from "./types";

export type { WebSearchDiagnostics } from "./types";

export async function findWebPassageSourceMatches(input: {
  rawText: string;
  sourceHints?: string[];
  limit?: number;
}): Promise<WebSearchOutput> {
  const queries = buildSearchQueries(input.rawText, input.sourceHints ?? []);
  const knownMatches = knownSourceMatches(input.rawText);
  const fallbackProvider = providerName();

  try {
    const grounded = await findGeminiGroundedSourceMatches({
      rawText: input.rawText,
      sourceHints: input.sourceHints ?? [],
      queries,
      limit: input.limit,
    });
    if (
      grounded.matches[0] &&
      grounded.matches[0].confidence >= BUILD_CANDIDATES_MIN_CONFIDENCE
    ) {
      const matches = [...knownMatches, ...grounded.matches]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, input.limit ?? 5);
      return {
        matches,
        diagnostics: {
          ...grounded.diagnostics,
          fallbackProvider,
        },
      };
    }
    if (!fallbackProvider) {
      const matches = [...knownMatches, ...grounded.matches]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, input.limit ?? 5);
      return {
        matches,
        diagnostics: {
          ...grounded.diagnostics,
          status:
            matches[0] && matches[0].confidence >= 0.9
              ? "MATCHED"
              : grounded.diagnostics.status,
          fallbackProvider,
        },
      };
    }
  } catch (err) {
    if (!fallbackProvider) {
      return {
        matches: knownMatches.slice(0, input.limit ?? 5),
        diagnostics: {
          provider: "GEMINI_GOOGLE_SEARCH",
          fallbackProvider,
          status: knownMatches.length > 0 ? "MATCHED" : "FAILED",
          queries,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  const provider = fallbackProvider;

  if (!provider) {
    return {
      matches: knownMatches.slice(0, input.limit ?? 5),
      diagnostics: {
        provider: null,
        status: knownMatches.length > 0 ? "MATCHED" : "SKIPPED_NO_PROVIDER",
        queries,
      },
    };
  }

  if (queries.length === 0) {
    return {
      matches: [],
      diagnostics: {
        provider,
        fallbackProvider,
        status: "NO_MATCH",
        queries,
      },
    };
  }

  try {
    const results: SearchResult[] = [];
    for (const query of queries) {
      results.push(...(await searchProvider(provider, query)));
      if (results.length >= PROVIDER_SEARCH_RESULT_LIMIT * 2) break;
    }
    const matches: SourceMatchInput[] = [
      ...knownMatches,
      ...(await buildCandidates(input.rawText, results)),
    ]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, input.limit ?? 5);
    return {
      matches,
      diagnostics: {
        provider,
        fallbackProvider,
        status:
          matches[0] && matches[0].confidence >= 0.9
            ? "MATCHED"
            : matches.length > 0
              ? "CANDIDATES_ONLY"
              : "NO_MATCH",
        queries,
      },
    };
  } catch (err) {
    return {
      matches: [],
      diagnostics: {
        provider,
        fallbackProvider,
        status: "FAILED",
        queries,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
