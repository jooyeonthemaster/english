import { jaccard, tokenSet } from "./scoring";

const REQUEST_TIMEOUT_MS = 10_000;

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

export async function fetchPageText(url: string): Promise<string | null> {
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

export function bestTextWindow(pageText: string, rawText: string): string {
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
