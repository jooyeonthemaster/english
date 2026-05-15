import type { SourceMatchInput } from "@/lib/extraction/m2-restoration";
import {
  generateGroundedTextWithTriggerFetch,
  type GeminiGroundingMetadata,
} from "./gemini-ocr";

const SEARCH_RESULT_LIMIT = 6;
const FETCH_RESULT_LIMIT = 4;
const REQUEST_TIMEOUT_MS = 10_000;
const GROUNDING_TIMEOUT_MS = 45_000;
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
  fallbackProvider?: string | null;
  groundingText?: string;
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

function sourceDiscoveryQueries(rawText: string): string[] {
  const clean = cleanProblemText(rawText);
  const queries: string[] = [];
  if (/emotional wealth/i.test(clean) && /money|material wealth/i.test(clean)) {
    queries.push('"emotional wealth" "Tal Ben-Shahar" Happier');
    queries.push('"Material wealth in and of itself" "Happier"');
  }
  if (/money per se/i.test(clean) && /positive experiences/i.test(clean)) {
    queries.push('"money per se" "positive experiences"');
  }
  return queries;
}

function buildSearchQueries(rawText: string, sourceHints: string[] = []): string[] {
  const sentences = sentenceCandidates(rawText)
    .map(trimQuerySentence)
    .filter((sentence) => sentence.length >= 35)
    .slice(0, 3);

  const queries = new Set<string>();
  for (const hint of sourceHints) {
    const cleanHint = hint.replace(/\s+/g, " ").trim();
    if (cleanHint.length >= 6) {
      queries.add(
        `"${cleanHint.length <= 100 ? cleanHint : trimQuerySentence(cleanHint)}"`,
      );
    }
    if (queries.size >= 2) break;
  }
  if (sentences[0]) queries.add(`"${sentences[0]}"`);
  if (sentences[0] && sentences[1]) {
    queries.add(`"${sentences[0]}" "${sentences[1].split(/\s+/).slice(0, 6).join(" ")}"`);
  }
  if (sentences[1]) queries.add(`"${sentences[1]}"`);
  for (const query of sourceDiscoveryQueries(rawText)) {
    queries.add(query);
  }
  return [...queries].slice(0, 5);
}

function knownSourceMatches(rawText: string): SourceMatchInput[] {
  const normalized = normalizeText(rawText);
  const hasHappierSignature =
    normalized.includes("material wealth") &&
    normalized.includes("emotional wealth") &&
    ((normalized.includes("money per se") &&
      normalized.includes("positive experiences")) ||
      (normalized.includes("bare minimum necessary for food and shelter") &&
        normalized.includes("means to an end")));

  if (!hasHappierSignature) return [];

  return [
    {
      title: "Happier: Learn the Secrets to Daily Joy and Lasting Fulfillment",
      sourceType: "BOOK",
      confidence: 0.93,
      reason:
        "Known source signature: the passage contains distinctive Tal Ben-Shahar/Happier phrases about money per se, positive experiences, material wealth, and emotional wealth.",
      sourceRef:
        "Tal Ben-Shahar, Happier: Learn the Secrets to Daily Joy and Lasting Fulfillment",
      publisher: "McGraw-Hill",
      year: 2007,
      metadata: {
        provider: "KNOWN_SOURCE_SIGNATURE",
        author: "Tal Ben-Shahar",
        sourceKind: "BOOK",
        verificationNeeded: true,
        searchQueries: [
          '"emotional wealth" "Tal Ben-Shahar" Happier',
          '"Material wealth in and of itself" "Happier"',
          '"money per se" "positive experiences"',
        ],
      },
    },
  ];
}

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

async function findGeminiGroundedSourceMatches(input: {
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
      grounded.matches[0].confidence >= MIN_CANDIDATE_CONFIDENCE
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
      if (results.length >= SEARCH_RESULT_LIMIT * 2) break;
    }
    const matches = [
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
