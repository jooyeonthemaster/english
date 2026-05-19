interface BuildAnalysisPromptArgs {
  passageContent: string;
  schoolType: "MIDDLE" | "HIGH" | null;
  grade: number | null;
  customPrompt?: string;
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
}: BuildAnalysisPromptArgs): string {
  const schoolLabel = schoolType === "MIDDLE" ? "middle school" : "high school";
  const gradeLabel = grade ? `${schoolLabel} grade ${grade}` : schoolLabel;
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

Required JSON shape:
${JSON.stringify(ANALYSIS_SHAPE)}

Limits:
- sentences: include every sentence in the passage.
- vocabulary: 6-8 high-value exam words, no duplicates.
- grammarPoints: 2-4 likely exam grammar points.
- syntaxAnalysis: 2 complex or exam-worthy sentences.
- paraphrasableSegments: 2-3 exact spans suitable for vocabulary/blank/paraphrase questions.
- structureTransformPoints: 2 exact spans suitable for grammar transformation.
- paragraphSummaries: 1 item unless the passage has clear paragraph breaks.
- keyPoints: 3-5 items.
- examples, synonyms, antonyms, derivatives, collocations, relatedGrammar: max 2 items each.

Passage:
${passageContent}`;
}
