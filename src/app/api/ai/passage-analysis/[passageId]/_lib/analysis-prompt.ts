import {
  DEFAULT_ANALYSIS_TONE,
  getAnalysisTonePrompt,
  normalizeAnalysisTone,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";

interface BuildAnalysisPromptArgs {
  passageContent: string;
  schoolType: "MIDDLE" | "HIGH" | null;
  grade: number | null;
  customPrompt?: string;
  analysisTone?: AnalysisTone;
}

const ANALYSIS_SHAPE = {
  sentences: [
    {
      index: 0,
      english: "original sentence",
      korean: "Korean translation",
    },
  ],
  vocabulary: [
    {
      word: "",
      meaning: "",
      partOfSpeech: "",
      pronunciation: "",
      sentenceIndex: 0,
      difficulty: "basic|intermediate|advanced",
      synonyms: [""],
      antonyms: [""],
      derivatives: [""],
      collocations: [""],
      englishDefinition: "",
      contextMeaning: "",
      examType: "",
      studentNote: "",
      examTrap: "",
      examplePhrase: "",
    },
  ],
  grammarPoints: [
    {
      id: "gp-1",
      pattern: "",
      explanation: "",
      textFragment: "exact text from passage",
      sentenceIndex: 0,
      examples: [""],
      level: "",
      examType: "",
      commonMistake: "",
      transformations: [""],
      gradeLevel: "",
      relatedGrammar: [""],
      csatFrequency: "",
      studentExplanation: "",
      whyItMatters: "",
      quickCheck: "",
    },
  ],
  structure: {
    mainIdea: "",
    purpose: "",
    textType: "",
    paragraphSummaries: [{ paragraphIndex: 0, summary: "", role: "" }],
    keyPoints: ["", "", ""],
    logicFlow: [{ role: "", sentenceIndices: [0], summary: "" }],
    connectorAnalysis: [
      { word: "", sentenceIndex: 0, role: "", examRelevance: "" },
    ],
    topicSentenceIndex: 0,
    blankSuitablePositions: [""],
    orderClues: [""],
    tone: "",
  },
  syntaxAnalysis: [
    {
      sentenceIndex: 0,
      structure: "",
      chunkReading: "",
      patternType: "",
      transformPoint: "",
      complexity: "",
      keyPhrase: "",
      plainExplanation: "",
      readingTip: "",
    },
  ],
  examDesign: {
    paraphrasableSegments: [
      {
        original: "exact text from passage",
        alternatives: [""],
        sentenceIndex: 0,
        reason: "",
        questionExample: "",
        difficulty: "",
        relatedPoint: "",
      },
    ],
    structureTransformPoints: [
      {
        original: "exact text from passage",
        transformType: "",
        example: "",
        sentenceIndex: 0,
        reason: "",
        questionExample: "",
        difficulty: "",
      },
    ],
    summaryKeyPoints: [""],
    descriptiveConditions: [""],
  },
};

/**
 * Compose the 5-layer passage-analysis prompt.
 *
 * The standard Atlas/Qwen path is sensitive to long prompts and can spend a
 * large token budget in reasoning before it emits JSON. Keep this prompt
 * compact, explicit, and schema-shaped so the response finishes inside the
 * route timeout while preserving the data contract consumed by the UI.
 */
export function buildFullAnalysisPrompt({
  passageContent,
  schoolType,
  grade,
  customPrompt,
  analysisTone = DEFAULT_ANALYSIS_TONE,
}: BuildAnalysisPromptArgs): string {
  const schoolLabel = schoolType === "MIDDLE" ? "middle school" : "high school";
  const gradeLabel = grade ? `${schoolLabel} grade ${grade}` : schoolLabel;
  const normalizedTone = normalizeAnalysisTone(analysisTone);
  const teacherNote = customPrompt?.trim()
    ? `\n\nTeacher priority instructions:\n${customPrompt.trim()}`
    : "";

  return `You are a Korean ${gradeLabel} English exam passage analyst.
Return ONLY one compact valid JSON object. Do not use Markdown.
Use Korean for translations, explanations, meanings, and exam guidance.
Keep every field concise, but do not omit required keys.
Copy original/textFragment fields exactly from the passage.
Use zero-based sentenceIndex values that match the sentences array.
${teacherNote}

${getAnalysisTonePrompt(normalizedTone)}

Quality rules:
- Student-friendly first: do not lead with formulas like "One of the + 최상급 + 복수명사 + 단수동사" unless a plain Korean label comes first.
- pattern should be a readable label, not only a formula. Good: "One이 진짜 주어인 수일치". Bad: "One of the + 최상급 + 복수명사 + 단수동사".
- If you use a technical term, immediately explain it in plain Korean.
- grammarPoints are about answer-form decisions: verb agreement, tense, voice, relative clauses, to-infinitive/gerund, participles, comparison, pronouns, conjunctions.
- syntaxAnalysis is NOT a separate "grammar/syntax category". Treat it as sentence-level reading guidance only.
- Add syntaxAnalysis only to sentences that are genuinely hard to read: long subjects, distant verbs, heavy modifiers, insertions, parallel structure, clauses stacked together, or ambiguous attachment.
- If the passage has no sentence that needs extra reading guidance, return syntaxAnalysis: [].
- Do not duplicate grammarPoints in syntaxAnalysis. If the point is mainly about choosing the correct form, put it in grammarPoints only.
- For each syntaxAnalysis item, patternType should be a plain reading label such as "긴 주어 먼저 잡기", "수식어 걷어내기", "삽입구 건너뛰기", or "병렬 구조 맞추기".
- keyPhrase should be the exact hard span or core phrase. Do not use the whole sentence unless the entire sentence must be chunked.
- chunkReading MUST break the sentence into meaning units separated by " / " (slash with surrounding spaces), e.g. "To understand memory, / imagine your brain / as a vast digital archive." This directly feeds the mobile 끊어읽기/문장배열 activity, so always provide it for every syntaxAnalysis item.
- plainExplanation and readingTip must explain how to read THIS sentence, not general grammar theory.
- For vocabulary, analyze a varied set: core words, academic words, phrases/collocations, connectors, and words with context-specific meanings.
- Do not stop at only the obvious hard words. Include useful multi-word phrases when single-word candidates are limited.
- For a normal school passage over 80 words, vocabulary must contain at least 10 items. Use exact phrases from the passage when needed.
- For every vocabulary item, fill contextMeaning and at least two of synonyms, antonyms, derivatives, collocations, confusableWords, examTrap, examplePhrase.
- For every grammar item, fill studentExplanation, commonMistake, whyItMatters, and quickCheck in practical Korean.
- Explanations should be complete enough that a student can understand without a separate grammar book.

Required JSON shape:
${JSON.stringify(ANALYSIS_SHAPE)}

Limits:
- sentences: include every sentence in the passage.
- vocabulary: 10-14 high-value exam words or phrases, no duplicates. For passages under 50 words, 6-10 is acceptable; otherwise never fewer than 10.
- grammarPoints: 3-6 likely exam grammar points.
- syntaxAnalysis: 3-5 sentence-level reading points for the most useful/hardest sentences; each item MUST set chunkReading (with " / " separators) and patternType. Return [] only for very short/simple passages.
- paraphrasableSegments: 3-4 exact spans suitable for vocabulary/blank/paraphrase questions.
- structureTransformPoints: 2 exact spans suitable for grammar transformation.
- connectorAnalysis: include every discourse connector present (역접/인과/대조/예시/부연); aim for 2+ when the passage has them.
- blankSuitablePositions: at least 1 exact phrase that is strong for blank-inference, when the passage supports it.
- paragraphSummaries: 1 item unless the passage has clear paragraph breaks.
- keyPoints: 3-5 items.
- examples, synonyms, antonyms, derivatives, collocations, relatedGrammar: max 3 items each.

Passage:
${passageContent}`;
}
