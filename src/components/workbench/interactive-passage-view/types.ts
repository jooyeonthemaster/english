import type {
  GrammarPoint,
  SentenceAnalysis,
  SyntaxItem,
  VocabItem,
} from "@/types/passage-analysis";

export interface Highlight {
  start: number;
  end: number;
  type: "vocab" | "grammar" | "syntax" | "exam";
  data: VocabItem | GrammarPoint | SyntaxItem | ExamPointData | null;
}

export type ActiveDetail =
  | { kind: "vocab"; item: VocabItem; sentence: SentenceAnalysis | null }
  | { kind: "grammar"; item: GrammarPoint; sentence: SentenceAnalysis | null }
  | { kind: "syntax"; item: SyntaxItem; sentence: SentenceAnalysis | null }
  | { kind: "keySentence"; sentence: SentenceAnalysis; role: string; summary: string; isTopicSentence: boolean }
  | {
      kind: "examPoint";
      text: string;
      alternatives?: string[];
      transformType?: string;
      example?: string;
      reason?: string;
      questionExample?: string;
      difficulty?: string;
      relatedPoint?: string;
    }
  | null;

export type NoteCategory = "vocab" | "grammar" | "syntax" | "key" | "exam";

export interface FocusedNote {
  id: string;
  category: NoteCategory;
  pulseKey: number;
}

export interface KeySentenceCollectionData {
  role: string;
  summary: string;
  isTopicSentence: boolean;
}

export interface ExamPointData {
  kind?: "paraphrase" | "transform" | string;
  sentenceIndex: number;
  original?: string;
  text?: string;
  example?: string;
  alternatives?: string[];
  transformType?: string;
  reason?: string;
  questionExample?: string;
  difficulty?: string;
  relatedPoint?: string;
}

export interface CollectionEntry {
  id: string;
  category: NoteCategory;
  item: VocabItem | GrammarPoint | SyntaxItem | KeySentenceCollectionData | ExamPointData;
  sentence: SentenceAnalysis | null;
  sentenceIndex: number;
  visible: boolean;
}

export interface Segment {
  start: number;
  end: number;
  types: Set<Highlight["type"]>;
  highlights: Highlight[];
}
