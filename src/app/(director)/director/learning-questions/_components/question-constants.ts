// ---------------------------------------------------------------------------
// 학습 문제 관리 상수
// ---------------------------------------------------------------------------

export const CATEGORY_COLORS: Record<string, { badge: string; bg: string; accent: string }> = {
  VOCAB: { badge: "bg-blue-100 text-blue-700", bg: "border-l-blue-400", accent: "bg-blue-500" },
  INTERPRETATION: { badge: "bg-indigo-100 text-indigo-700", bg: "border-l-indigo-400", accent: "bg-indigo-500" },
  GRAMMAR: { badge: "bg-violet-100 text-violet-700", bg: "border-l-violet-400", accent: "bg-violet-500" },
  COMPREHENSION: { badge: "bg-amber-100 text-amber-700", bg: "border-l-amber-400", accent: "bg-amber-500" },
};

export const CATEGORY_LABELS: Record<string, string> = {
  VOCAB: "어휘",
  INTERPRETATION: "해석",
  GRAMMAR: "문법",
  COMPREHENSION: "독해",
};

export const CATEGORY_ICONS: Record<string, string> = {
  VOCAB: "📗",
  INTERPRETATION: "📘",
  GRAMMAR: "📙",
  COMPREHENSION: "📕",
};

export const SUBTYPE_LABELS: Record<string, string> = {
  WORD_MEANING: "영→한 뜻",
  WORD_MEANING_REVERSE: "한→영 뜻",
  WORD_FILL: "빈칸 채우기",
  WORD_MATCH: "매칭",
  WORD_SPELL: "스펠링",
  VOCAB_SYNONYM: "유의어/반의어",
  VOCAB_DEFINITION: "영영풀이",
  VOCAB_COLLOCATION: "연어",
  VOCAB_CONFUSABLE: "혼동 단어",
  SENTENCE_INTERPRET: "해석 고르기",
  SENTENCE_COMPLETE: "영문 고르기",
  WORD_ARRANGE: "단어 배열",
  KEY_EXPRESSION: "핵심 표현",
  SENT_CHUNK_ORDER: "끊어읽기",
  GRAMMAR_SELECT: "문법 고르기",
  ERROR_FIND: "오류 찾기",
  ERROR_CORRECT: "오류 수정",
  GRAM_TRANSFORM: "문장 전환",
  GRAM_BINARY: "문법 O/X",
  TRUE_FALSE: "O/X",
  CONTENT_QUESTION: "내용 이해",
  PASSAGE_FILL: "지문 빈칸",
  CONNECTOR_FILL: "연결어",
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetItem {
  id: string;
  publisher: string;
  textbook: string | null;
  grade: number | null;
  unit: string | null;
  title: string;
  questionCount: number;
  createdAt: Date;
  passage: { id: string; title: string; content?: string; grade?: number | null; school?: { id: string; name: string } | null };
  _count: { questions: number };
}

export interface QuestionItem {
  id: string;
  learningCategory: string;
  type: string;
  subType: string | null;
  questionText: string;
  correctAnswer: string;
  difficulty: string;
  approved: boolean;
  createdAt: Date;
  passage: { id: string; title: string } | null;
  explanation: {
    id: string;
    questionId: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tryParse(raw: string): Record<string, any> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getPreviewText(subType: string | null, raw: string): string {
  const d = tryParse(raw);
  if (!d) return raw.slice(0, 100);
  switch (subType) {
    case "WORD_MEANING":
    case "WORD_MEANING_REVERSE":
      return d.word ? `${d.word} — ${d.contextSentence || ""}` : raw;
    case "VOCAB_SYNONYM":
      return d.word
        ? `${d.word} (${d.targetRelation === "synonym" ? "유의어" : "반의어"})`
        : raw;
    case "VOCAB_DEFINITION":
      return d.englishDefinition || raw;
    case "SENTENCE_INTERPRET":
      return d.englishSentence || raw;
    case "SENTENCE_COMPLETE":
      return d.koreanSentence || raw;
    case "WORD_ARRANGE":
      return d.koreanSentence || raw;
    case "SENT_CHUNK_ORDER":
      return d.chunks?.join(" / ") || raw;
    case "GRAM_TRANSFORM":
      return `${d.originalSentence || ""} → ${d.instruction || ""}`;
    case "TRUE_FALSE":
      return d.statement || raw;
    case "CONTENT_QUESTION":
      return d.question || raw;
    case "PASSAGE_FILL":
      return d.excerpt || raw;
    case "CONNECTOR_FILL":
      return `${(d.sentenceBefore || "").slice(0, 80)}… ____ …${(d.sentenceAfter || "").slice(0, 40)}`;
    case "WORD_MATCH":
      return d.pairs ? `${d.pairs.length}쌍 단어-뜻 매칭` : raw;
    case "WORD_SPELL":
      return d.koreanMeaning
        ? `${d.koreanMeaning} → 스펠링 입력`
        : raw;
    default:
      return (
        d.sentence ||
        d.contextSentence ||
        d.englishSentence ||
        d.koreanSentence ||
        d.excerpt ||
        raw.slice(0, 100)
      );
  }
}
