import type { SourceMatchInput } from "@/lib/extraction/m2-restoration";

const SEARCH_RESULT_LIMIT = 5;
const FETCH_RESULT_LIMIT = 4;
const REQUEST_TIMEOUT_MS = 10_000;
const MIN_CANDIDATE_CONFIDENCE = 0.25;

interface SearchResult {
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
}

interface WebSearchOutput {
  matches: SourceMatchInput[];
  diagnostics: WebSearchDiagnostics;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenList(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function tokenSet(value: string): Set<string> {
  return new Set(tokenList(value));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function exactContainmentScore(candidate: string, target: string): number {
  const c = normalizeText(candidate);
  const t = normalizeText(target);
  if (!c || !t) return 0;
  if (c === t) return 1;
  if (c.includes(t) || t.includes(c)) return 0.94;
  return 0;
}

function scoreCandidate(candidate: string, target: string): number {
  return Math.max(
    exactContainmentScore(candidate, target),
    jaccard(tokenSet(candidate), tokenSet(target)),
  );
}

function cleanProblemText(text: string): string {
  return text
    .replace(/[\u2460-\u2468]/g, " ")
    .replace(/(^|\n)\s*\([A-E]\)\s+/g, "\n")
    .replace(/@\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCandidates(text: string): string[] {
  const clean = cleanProblemText(text);
  const rough = clean
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => tokenList(sentence).length >= 7);
  return rough.length > 0 ? rough : [clean];
}

function trimQuerySentence(sentence: string): string {
  const words = sentence.split(/\s+/).filter(Boolean).slice(0, 13);
  return words.join(" ");
}

function buildSearchQueries(rawText: string): string[] {
  const sentences = sentenceCandidates(rawText)
    .map(trimQuerySentence)
    .filter((sentence) => sentence.length >= 35)
    .slice(0, 3);

  const queries = new Set<string>();
  if (sentences[0]) queries.add(`"${sentences[0]}"`);
  if (sentences[0] && sentences[1]) {
    queries.add(`"${sentences[0]}" "${sentences[1].split(/\s+/).slice(0, 6).join(" ")}"`);
  }
  if (sentences[1]) queries.add(`"${sentences[1]}"`);
  return [...queries].slice(0, 3);
}

function providerName(): string | null {
  if (process.env.SERPER_API_KEY) return "SERPER";
  if (process.env.BRAVE_SEARCH_API_KEY) return "BRAVE";
  if (
    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY &&
    process.env.GOOGLE_CUSTOM_SEARCH_CX
  ) {
    return "GOOGLE_CSE";
  }
  return null;
}

async function searchSerper(query: string): Promise<SearchResult[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.SERPER_API_KEY ?? "",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      q: query,
      num: SEARCH_RESULT_LIMIT,
      gl: "kr",
      hl: "en",
    }),
  });
  if (!response.ok) throw new Error(`Serper HTTP ${response.status}`);
  const body = (await response.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return (body.organic ?? [])
    .map((item) => ({
      title: item.title ?? "",
      url: item.link ?? "",
      snippet: item.snippet ?? "",
    }))
    .filter((item) => item.url);
}

async function searchBrave(query: string): Promise<SearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(SEARCH_RESULT_LIMIT));
  url.searchParams.set("country", "KR");
  url.searchParams.set("search_lang", "en");
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-subscription-token": process.env.BRAVE_SEARCH_API_KEY ?? "",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Brave HTTP ${response.status}`);
  const body = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return (body.web?.results ?? [])
    .map((item) => ({
      title: item.title ?? "",
      url: item.url ?? "",
      snippet: item.description ?? "",
    }))
    .filter((item) => item.url);
}

async function searchGoogleCse(query: string): Promise<SearchResult[]> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", process.env.GOOGLE_CUSTOM_SEARCH_API_KEY ?? "");
  url.searchParams.set("cx", process.env.GOOGLE_CUSTOM_SEARCH_CX ?? "");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(SEARCH_RESULT_LIMIT));
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google CSE HTTP ${response.status}`);
  const body = (await response.json()) as {
    items?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return (body.items ?? [])
    .map((item) => ({
      title: item.title ?? "",
      url: item.link ?? "",
      snippet: item.snippet ?? "",
    }))
    .filter((item) => item.url);
}

async function searchProvider(
  provider: string,
  query: string,
): Promise<SearchResult[]> {
  if (provider === "SERPER") return searchSerper(query);
  if (provider === "BRAVE") return searchBrave(query);
  return searchGoogleCse(query);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; NaraPassageExtractor/1.0; +https://nara.local)",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      return null;
    }
    const html = await response.text();
    return htmlToText(html).slice(0, 80_000);
  } catch {
    return null;
  }
}

function bestTextWindow(pageText: string, rawText: string): string {
  const words = pageText.split(/\s+/).filter(Boolean);
  if (words.length <= 360) return words.join(" ");

  const rawTokens = tokenSet(rawText);
  let bestStart = 0;
  let bestScore = 0;
  const windowSize = 300;
  const step = 60;

  for (let start = 0; start < words.length; start += step) {
    const windowText = words.slice(start, start + windowSize).join(" ");
    const score = jaccard(tokenSet(windowText), rawTokens);
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return words.slice(bestStart, bestStart + windowSize).join(" ");
}

async function buildCandidates(
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

export async function findWebPassageSourceMatches(input: {
  rawText: string;
  limit?: number;
}): Promise<WebSearchOutput> {
  const provider = providerName();
  const queries = buildSearchQueries(input.rawText);

  if (!provider) {
    return {
      matches: [],
      diagnostics: {
        provider: null,
        status: "SKIPPED_NO_PROVIDER",
        queries,
      },
    };
  }

  if (queries.length === 0) {
    return {
      matches: [],
      diagnostics: {
        provider,
        status: "NO_MATCH",
        queries,
      },
    };
  }

  try {
    const results: SearchResult[] = [];
    for (const query of queries) {
      results.push(...(await searchProvider(provider, query)));
      if (results.length >= SEARCH_RESULT_LIMIT * 2) break;
    }
    const matches = (await buildCandidates(input.rawText, results)).slice(
      0,
      input.limit ?? 5,
    );
    return {
      matches,
      diagnostics: {
        provider,
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
        status: "FAILED",
        queries,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
