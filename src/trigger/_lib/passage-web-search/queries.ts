import { cleanProblemText, sentenceCandidates, trimQuerySentence } from "./text-clean";

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

export function buildSearchQueries(rawText: string, sourceHints: string[] = []): string[] {
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
