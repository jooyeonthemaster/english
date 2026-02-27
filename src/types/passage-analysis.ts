// ============================================================================
// Passage Analysis Types - AI-generated analysis data structures
// ============================================================================

export interface PassageAnalysisData {
  sentences: SentenceAnalysis[];
  vocabulary: VocabItem[];
  grammarPoints: GrammarPoint[];
  structure: StructureAnalysis;
}

export interface SentenceAnalysis {
  index: number;
  english: string;
  korean: string;
}

export interface VocabItem {
  word: string;
  meaning: string;
  partOfSpeech: string;
  pronunciation: string;
  sentenceIndex: number;
  difficulty: "basic" | "intermediate" | "advanced";
}

export interface GrammarPoint {
  id: string;
  pattern: string;
  explanation: string;
  textFragment: string;
  sentenceIndex: number;
  examples: string[];
  level: string;
}

export interface StructureAnalysis {
  mainIdea: string;
  purpose: string;
  textType: string;
  paragraphSummaries: ParagraphSummary[];
  keyPoints: string[];
}

export interface ParagraphSummary {
  paragraphIndex: number;
  summary: string;
  role: string;
}

// Detail drawer payload types
export type DetailInfo =
  | { type: "vocab"; data: VocabItem }
  | { type: "grammar"; data: GrammarPoint }
  | {
      type: "sentence";
      data: SentenceAnalysis;
      vocab: VocabItem[];
      grammar: GrammarPoint[];
    };

// Text segment for rendering highlighted text
export interface TextSegment {
  type: "plain" | "vocab" | "grammar";
  text: string;
  data?: VocabItem | GrammarPoint;
}
