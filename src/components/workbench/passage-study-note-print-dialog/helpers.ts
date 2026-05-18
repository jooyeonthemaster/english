import type {
  ParaphraseSegment,
  PassageAnalysisData,
  TransformPoint,
} from "@/types/passage-analysis";
import type {
  ExamEntry,
  PageCategory,
  StudyNoteBlock,
  StudyNotePassage,
} from "./types";

export function safeParseAnalysis(analysis: StudyNotePassage["analysis"]): PassageAnalysisData | null {
  if (!analysis?.analysisData) return null;
  try {
    return typeof analysis.analysisData === "string" ? JSON.parse(analysis.analysisData) : analysis.analysisData;
  } catch {
    return null;
  }
}

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function getSemesterLabel(semester: string | null) {
  if (!semester) return null;
  if (semester === "FIRST") return "1학기";
  if (semester === "SECOND") return "2학기";
  return semester;
}

export function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function normalizeText(text: string) {
  let normalized = "";
  const map: number[] = [];
  let lastWasSpace = false;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index].toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-");
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        normalized += " ";
        map.push(index);
        lastWasSpace = true;
      }
      continue;
    }
    normalized += ch;
    map.push(index);
    lastWasSpace = false;
  }

  return { normalized: normalized.trim(), map };
}

export function findTextRange(text: string, query?: string | null) {
  const cleanQuery = query?.replace(/\.{2,}$/, "").trim();
  if (!cleanQuery || cleanQuery.length < 2) return null;

  const direct = text.toLowerCase().indexOf(cleanQuery.toLowerCase());
  if (direct !== -1) return { start: direct, end: direct + cleanQuery.length, type: "direct" as const };

  const source = normalizeText(text);
  const target = normalizeText(cleanQuery).normalized;
  if (!target) return null;

  const matched = source.normalized.indexOf(target);
  if (matched === -1) return null;
  const start = source.map[matched] ?? 0;
  const end = source.map[Math.min(matched + target.length - 1, source.map.length - 1)] ?? start;
  return { start, end: Math.min(end + 1, text.length), type: "normalized" as const };
}

export function getCounts(data: PassageAnalysisData) {
  return {
    vocab: data.vocabulary?.length || 0,
    grammar: data.grammarPoints?.length || 0,
    syntax: data.syntaxAnalysis?.length || 0,
    exam: (data.examDesign?.paraphrasableSegments?.length || 0) + (data.examDesign?.structureTransformPoints?.length || 0),
  };
}

export function getPageCategories(blocks: StudyNoteBlock[]) {
  const categories: Partial<Record<PageCategory, number>> = {};
  blocks.forEach((block) => {
    categories[block.category] = (categories[block.category] || 0) + block.pointCount;
  });
  return categories;
}

export function toExamEntries(data: PassageAnalysisData): ExamEntry[] {
  const paraphrases: ExamEntry[] = (data.examDesign?.paraphrasableSegments || []).map((item: ParaphraseSegment, index) => ({
    id: `p-${index}`,
    kind: "paraphrase",
    sentenceIndex: item.sentenceIndex,
    title: "빈칸/동의어",
    original: item.original,
    detail: item.reason,
    alternatives: item.alternatives,
    questionExample: item.questionExample,
    difficulty: item.difficulty,
  }));
  const transforms: ExamEntry[] = (data.examDesign?.structureTransformPoints || []).map((item: TransformPoint, index) => ({
    id: `t-${index}`,
    kind: "transform",
    sentenceIndex: item.sentenceIndex,
    title: item.transformType || "구조 변형",
    original: item.original,
    detail: item.reason || item.example,
    questionExample: item.questionExample,
    difficulty: item.difficulty,
  }));
  return [...paraphrases, ...transforms].sort((a, b) => a.sentenceIndex - b.sentenceIndex);
}
