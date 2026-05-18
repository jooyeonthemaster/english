import type { PassageAnalysisData } from "@/types/passage-analysis";

export function parsePassageAnalysis(raw?: string | null): PassageAnalysisData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sentences)) return null;
    return parsed as PassageAnalysisData;
  } catch {
    return null;
  }
}

export function getSentenceText(analysis: PassageAnalysisData, index: number): string {
  return analysis.sentences.find((sentence) => sentence.index === index)?.english ?? "";
}
