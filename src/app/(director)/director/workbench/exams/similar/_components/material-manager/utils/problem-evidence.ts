import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";

import type {
  DraftProblemEvidence,
  DraftProblemEvidenceAction,
  DraftProblemEvidenceQuestion,
  DraftQuestionChoiceDisplay,
  DraftQuestionDisplay,
} from "../types";

export function readProblemEvidence(draft: M1PassageDraftSnapshot): DraftProblemEvidence | null {
  const metadata = draft.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const evidence = (metadata as { problemEvidence?: unknown }).problemEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  return evidence as DraftProblemEvidence;
}

export function inferProblemEvidenceFromRaw(rawText: string): DraftProblemEvidence | null {
  const positionMarkers = [
    ...rawText.matchAll(/\(\s*(?:[\u2460-\u2469]|10|[1-9]|\?|[^\x00-\x7F]{1,3})\s*\)/g),
  ];
  const chunkMarkers = [...rawText.matchAll(/(?:^|\n)\s*\([A-E]\)\s+/g)];
  const firstSentence = rawText
    .replace(/^\s*\d{1,3}\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .match(/[A-Z][^.!?]{30,}?[.!?](?=\s|$)/)?.[0]
    ?.trim();
  const questions: DraftProblemEvidenceQuestion[] = [];

  if (positionMarkers.length >= 3) {
    questions.push({
      questionType: "SENTENCE_INSERT",
      typeLabel: "문장 삽입",
      confidence: 0.78,
      stem: "Detected insertion position markers in the extracted passage.",
      answer: null,
      answerConfidence: null,
      evidence: [`${positionMarkers.length} insertion markers detected.`],
      restorationActions: [
        {
          type: "INSERT_SENTENCE",
          target: "BEST_SUPPORTED_POSITION_MARKER",
          value: firstSentence ?? null,
          reason: "Solve the insertion point and remove all position markers.",
          confidence: 0.78,
        },
        {
          type: "REMOVE_PROBLEM_MARKER",
          target: "position markers",
          reason: "Remove insertion position markers.",
          confidence: 0.95,
        },
      ],
      warnings: ["Inferred in the review UI because saved evidence was missing."],
    });
  }

  if (chunkMarkers.length >= 2) {
    questions.push({
      questionType: "SENTENCE_ORDER",
      typeLabel: "글의 순서",
      confidence: 0.72,
      stem: "Detected labeled chunks such as (A), (B), (C).",
      evidence: [`${chunkMarkers.length} chunk labels detected.`],
      restorationActions: [
        {
          type: "REORDER_CHUNKS",
          target: "labeled chunks",
          reason: "Solve the chunk order and remove labels.",
          confidence: 0.72,
        },
      ],
    });
  }

  if (questions.length === 0) return null;

  return {
    status: "INFERRED",
    model: null,
    error: null,
    evidence: {
      status: "PARTIAL",
      confidence: Math.max(...questions.map((question) => question.confidence ?? 0.5)),
      sourceHints: firstSentence ? [firstSentence] : [],
      questions,
      globalActions: [],
      unresolved: [],
      warnings: ["Problem evidence was inferred from raw text for display."],
    },
  };
}

export function getDraftProblemEvidence(draft: M1PassageDraftSnapshot): DraftProblemEvidence | null {
  return readProblemEvidence(draft) ?? inferProblemEvidenceFromRaw(draft.rawText);
}

export function getEvidenceQuestions(draft: M1PassageDraftSnapshot): DraftProblemEvidenceQuestion[] {
  const evidence = getDraftProblemEvidence(draft)?.evidence;
  return Array.isArray(evidence?.questions) ? evidence.questions : [];
}

export function getEvidenceActions(draft: M1PassageDraftSnapshot): DraftProblemEvidenceAction[] {
  const evidence = getDraftProblemEvidence(draft)?.evidence;
  const questionActions = getEvidenceQuestions(draft).flatMap((question) =>
    Array.isArray(question.restorationActions) ? question.restorationActions : [],
  );
  const globalActions = Array.isArray(evidence?.globalActions) ? evidence.globalActions : [];
  return [...questionActions, ...globalActions];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readSavedQuestions(draft: M1PassageDraftSnapshot): DraftQuestionDisplay[] {
  const metadata = asRecord(draft.metadata);
  const rawQuestions = Array.isArray(metadata?.questions) ? metadata.questions : [];
  return rawQuestions
    .map((item): DraftQuestionDisplay | null => {
      const question = asRecord(item);
      if (!question) return null;
      const stem = typeof question.stem === "string" ? question.stem.trim() : "";
      if (!stem) return null;
      const rawChoices = Array.isArray(question.choices) ? question.choices : [];
      const choices = rawChoices
        .map((choice, index): DraftQuestionChoiceDisplay | null => {
          const row = asRecord(choice);
          if (!row) return null;
          const content =
            typeof row.content === "string"
              ? row.content
              : typeof row.text === "string"
                ? row.text
                : "";
          if (!content.trim()) return null;
          return {
            label:
              typeof row.label === "string" && row.label.trim()
                ? row.label
                : String(index + 1),
            content,
            isAnswer: typeof row.isAnswer === "boolean" ? row.isAnswer : null,
          };
        })
        .filter((choice): choice is DraftQuestionChoiceDisplay => choice !== null);
      return {
        questionNumber:
          typeof question.questionNumber === "number"
            ? question.questionNumber
            : null,
        stem,
        choices,
        source: "saved",
      };
    })
    .filter((question): question is DraftQuestionDisplay => question !== null);
}

export function readEvidenceQuestionsForDisplay(
  draft: M1PassageDraftSnapshot,
): DraftQuestionDisplay[] {
  return getEvidenceQuestions(draft)
    .map((question): DraftQuestionDisplay | null => {
      const stem =
        typeof question.stem === "string" && question.stem.trim()
          ? question.stem
          : labelQuestionType(question.questionType, question.typeLabel);
      if (!stem.trim()) return null;
      return {
        questionNumber:
          typeof question.questionNumber === "number"
            ? question.questionNumber
            : null,
        stem,
        questionType: question.questionType,
        answer: question.answer ?? null,
        choices: [],
        source: "evidence",
      };
    })
    .filter((question): question is DraftQuestionDisplay => question !== null);
}

export function getOriginalQuestions(draft: M1PassageDraftSnapshot): DraftQuestionDisplay[] {
  const saved = readSavedQuestions(draft);
  if (saved.length > 0) return saved;
  return readEvidenceQuestionsForDisplay(draft);
}

export function labelQuestionType(type: string | null | undefined, fallback?: string | null): string {
  if (fallback && fallback !== "Unknown") return fallback;
  const labels: Record<string, string> = {
    BLANK_INFERENCE: "빈칸 추론",
    BLANK_WORD: "단어 빈칸",
    BLANK_SENTENCE: "문장 빈칸",
    CONNECTOR: "연결어",
    SENTENCE_ORDER: "글의 순서",
    PARAGRAPH_ORDER: "문단 순서",
    SENTENCE_INSERT: "문장 삽입",
    IRRELEVANT: "무관한 문장",
    GRAMMAR_ERROR: "어법",
    GRAMMAR_CORRECTION: "어법 수정",
    VOCAB_CHOICE: "어휘",
    CONTEXT_MEANING: "문맥 의미",
    IMPLIED_MEANING: "함축 의미",
    REFERENCE: "지칭",
    CONTENT_MATCH: "내용 일치",
    TOPIC_MAIN_IDEA: "주제/요지",
    TITLE: "제목",
    PURPOSE: "목적",
    MOOD_TONE: "분위기/심경",
    SUMMARY_COMPLETE: "요약문",
    WORD_ORDER: "배열 작문",
    SENTENCE_TRANSFORM: "문장 전환",
    CONDITIONAL_WRITING: "조건 작문",
    TEXTBOOK_DETAIL: "교과서 세부",
    DIALOGUE_ORDER: "대화 순서",
    DIALOGUE_RESPONSE: "대화 응답",
    KOREAN_TRANSLATION: "한국어 해석",
    ENGLISH_DEFINITION: "영영풀이",
    UNKNOWN: "유형 미확정",
  };
  return labels[type ?? ""] ?? type ?? "유형 미확정";
}

export function labelActionType(type: string | null | undefined): string {
  const labels: Record<string, string> = {
    REMOVE_PROBLEM_MARKER: "문제 표시 제거",
    RESTORE_BLANK: "빈칸 복구",
    RESTORE_GRAMMAR: "어법 복구",
    RESTORE_VOCAB: "어휘 복구",
    REORDER_CHUNKS: "순서 재배열",
    INSERT_SENTENCE: "문장 삽입",
    REMOVE_IRRELEVANT_SENTENCE: "무관문 제거",
    RESTORE_WORD_ORDER: "배열 작문 복구",
    RESTORE_SUMMARY: "요약문 완성",
    NORMALIZE_LAYOUT: "레이아웃 정리",
    SOURCE_MATCH_ONLY: "출처 매칭 우선",
    TEACHER_REVIEW_REQUIRED: "검수 필요",
  };
  return labels[type ?? ""] ?? type ?? "복원 단서";
}
