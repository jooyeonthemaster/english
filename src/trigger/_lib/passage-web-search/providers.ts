import type { SearchResult } from "./types";

const SEARCH_RESULT_LIMIT = 6;
const REQUEST_TIMEOUT_MS = 10_000;

export function providerName(): string | null {
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

export async function searchProvider(
  provider: string,
  query: string,
): Promise<SearchResult[]> {
  if (provider === "SERPER") return searchSerper(query);
  if (provider === "BRAVE") return searchBrave(query);
  return searchGoogleCse(query);
}

export const PROVIDER_SEARCH_RESULT_LIMIT = SEARCH_RESULT_LIMIT;
