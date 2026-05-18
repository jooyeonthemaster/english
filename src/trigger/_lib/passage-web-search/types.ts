import type { SourceMatchInput } from "@/lib/extraction/restoration";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchDiagnostics {
  provider: string | null;
  status:
    | "MATCHED"
    | "CANDIDATES_ONLY"
    | "NO_MATCH"
    | "SKIPPED_NO_PROVIDER"
    | "FAILED";
  queries: string[];
  error?: string;
  fallbackProvider?: string | null;
  groundingText?: string;
}

export interface WebSearchOutput {
  matches: SourceMatchInput[];
  diagnostics: WebSearchDiagnostics;
}
