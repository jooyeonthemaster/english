import type { ExamFocusSection, PassageSection } from "./types";

const CIRCLED_SENTENCE_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

function validSentenceNos(values: number[], sentences: PassageSection["sentences"]): number[] {
  const available = new Set(sentences.map((sentence) => sentence.n));
  const seen = new Set<number>();
  return values.filter((value) => {
    if (!Number.isInteger(value) || !available.has(value) || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function normalizeExamLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[“”‘’]/g, "'")
    .replace(/[^a-z0-9가-힣]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractExplicitSentenceNos(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const index = CIRCLED_SENTENCE_NUMBERS.indexOf(char);
    if (index >= 0) out.push(index + 1);
  }

  const patterns = [
    /\bS\s*(\d{1,2})\b/gi,
    /\bsentence\s*(\d{1,2})\b/gi,
    /문장\s*(\d{1,2})/g,
    /(\d{1,2})\s*(?:번|번째)\s*문장/g,
    /(\d{1,2})\s*번(?:의|에|에서)?/g,
  ];
  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) out.push(Number(match[1]));
  });
  return out;
}

function extractQuotedExamPhrases(text: string): string[] {
  const phrases: string[] = [];
  const patterns = [/"([^"]{4,})"/g, /'([^']{4,})'/g, /“([^”]{4,})”/g, /‘([^’]{4,})’/g];
  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const normalized = normalizeExamLookupText(match[1] ?? "");
      if (normalized.length >= 4) phrases.push(normalized);
    }
  });
  return [...new Set(phrases)];
}

const EXAM_PLACEMENT_STOPWORDS = new Set([
  "the", "and", "that", "this", "with", "from", "into", "what", "when", "where", "which", "because", "rather",
  "문장", "지문", "글", "핵심", "정답", "오답", "선지", "유형", "출제", "대비", "전략", "예시", "문맥", "주변",
  "주제", "제목", "요지", "빈칸", "추론", "어휘", "해요", "돼요", "있어요", "고르면", "묻는가", "무엇",
]);

function examPlacementTokens(text: string): string[] {
  return normalizeExamLookupText(text)
    .split(" ")
    .filter((token) => {
      if (EXAM_PLACEMENT_STOPWORDS.has(token)) return false;
      if (/^\d+$/.test(token)) return false;
      return /[a-z]/.test(token) ? token.length >= 4 : token.length >= 2;
    });
}

function scoreExamSentence(rowText: string, phrases: string[], sentence: PassageSection["sentences"][number]): number {
  const sentenceLookup = normalizeExamLookupText(`${sentence.en} ${sentence.ko}`);
  const sentenceTokens = new Set(sentenceLookup.split(" "));
  let score = 0;

  phrases.forEach((phrase) => {
    if (sentenceLookup.includes(phrase)) score += 20 + Math.min(8, phrase.length / 8);
  });

  for (const token of new Set(examPlacementTokens(rowText))) {
    if (/[a-z]/.test(token)) {
      if (sentenceTokens.has(token)) score += Math.min(4, token.length / 3);
    } else if (sentenceLookup.includes(token)) {
      score += Math.min(4, token.length / 2);
    }
  }

  return score;
}

export function inferExamSentenceNos(row: ExamFocusSection["rows"][number], sentences: PassageSection["sentences"]): number[] {
  if (!sentences.length) return [];
  const haystack = `${row.type} ${row.asks ?? ""} ${row.strategy ?? ""}`;
  const direct = validSentenceNos([row.sentenceNo ?? 0, ...extractExplicitSentenceNos(haystack)], sentences);
  if (direct.length) return [direct[0]];

  const phrases = extractQuotedExamPhrases(haystack);
  const scored = sentences
    .map((sentence) => ({
      sentence,
      score: scoreExamSentence(haystack, phrases, sentence),
    }))
    .sort((a, b) => b.score - a.score || b.sentence.n - a.sentence.n);

  if ((scored[0]?.score ?? 0) > 0) return [scored[0].sentence.n];
  return [sentences[sentences.length - 1].n];
}
