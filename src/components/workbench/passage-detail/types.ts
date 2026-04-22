export interface PassageDetailProps {
  autoAnalyze?: boolean;
  initialPrompt?: string;
  initialFocus?: string[];
  initialLevel?: string;
  /** Current staff's academyId — required by the exam/assignment dialogs so
   *  they can fetch academy-scoped lists (DRAFT 시험, 활성 반) without a
   *  second server round-trip. */
  academyId: string;
  passage: {
    id: string;
    title: string;
    content: string;
    grade: number | null;
    semester: string | null;
    unit: string | null;
    publisher: string | null;
    difficulty: string | null;
    tags: string | null;
    source: string | null;
    createdAt: Date;
    school: { id: string; name: string; type: string } | null;
    analysis: {
      id: string;
      analysisData: string;
      contentHash: string;
      updatedAt: Date;
    } | null;
    notes: Array<{
      id: string;
      annotationId: string | null;
      noteType: string;
      content: string;
      memo: string;
      highlightStart: number | null;
      highlightEnd: number | null;
      order: number;
    }>;
    questions: Array<{
      id: string;
      type: string;
      subType: string | null;
      difficulty: string;
      questionText: string;
      options: string | null;
      correctAnswer: string;
      tags: string | null;
      aiGenerated: boolean;
      approved: boolean;
      createdAt: Date;
      explanation: {
        id: string;
        content: string;
        keyPoints: string | null;
        wrongOptionExplanations: string | null;
      } | null;
      _count?: { examLinks: number };
    }>;
  };
}
