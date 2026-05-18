"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import {
  MASTERY_FAIL_THRESHOLD,
  type SessionType,
  type LearningCategory,
} from "@/lib/learning-constants";
import type { SessionStartData } from "@/lib/learning-types";
import { parseNaeshinQuestion } from "./parse-naeshin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

// ---------------------------------------------------------------------------
// startSession — 사전 생성된 세션 조회
// ---------------------------------------------------------------------------

export async function startSession(
  passageId: string,
  sessionType: SessionType,
  sessionSeq: number,
  seasonId?: string
): Promise<SessionStartData> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: { id: true, title: true, content: true },
  });
  if (!passage) throw new Error("지문을 찾을 수 없습니다.");

  // PrebuiltSession 조회
  const prebuilt = await prisma.prebuiltSession.findUnique({
    where: {
      passageId_category_sessionSeq: {
        passageId,
        category: sessionType,
        sessionSeq,
      },
    },
  });
  if (!prebuilt) throw new Error("세션이 아직 생성되지 않았습니다.");

  // 순차 잠금 / 마스터리 해금 검증 (1회 조회로 통합)
  if ((sessionType !== "MASTERY" && sessionSeq > 1) || sessionType === "MASTERY") {
    const progress = await prisma.lessonProgress.findFirst({
      where: { studentId, passageId, seasonId },
    });

    if (sessionType !== "MASTERY" && sessionSeq > 1) {
      const doneCount = getCategoryDoneCount(progress, sessionType);
      if (doneCount < sessionSeq - 1) {
        throw new Error("이전 세션을 먼저 완료하세요.");
      }
    }

    if (sessionType === "MASTERY") {
      if (
        !progress ||
        progress.vocabDone < 1 ||
        progress.interpDone < 1 ||
        progress.grammarDone < 1 ||
        progress.compDone < 1
      ) {
        throw new Error("각 카테고리 세션을 1개 이상 완료해야 마스터리에 도전할 수 있습니다.");
      }
    }
  }

  // 문제 로드 (사전 생성된 순서 유지)
  const questionIds: string[] = JSON.parse(prebuilt.questionIds);
  const [questions, analysis] = await Promise.all([
    prisma.naeshinQuestion.findMany({
      where: { id: { in: questionIds } },
      include: { explanation: true },
    }),
    prisma.passageAnalysis.findUnique({
      where: { passageId },
      select: { analysisData: true },
    }),
  ]);

  // PassageAnalysis 문장별 한국어 번역 맵 (WORD_SPELL 등에서 사용)
  const sentenceTranslations: Map<string, string> = new Map();
  if (analysis?.analysisData) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = typeof analysis.analysisData === "string" ? JSON.parse(analysis.analysisData) : analysis.analysisData as any;
      if (Array.isArray(parsed.sentences)) {
        for (const s of parsed.sentences) {
          if (s.english && s.korean) {
            sentenceTranslations.set(s.english.trim().toLowerCase(), s.korean);
          }
        }
      }
    } catch {}
  }

  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const orderedQuestions = questionIds
    .map((id) => questionMap.get(id))
    .filter(Boolean) as typeof questions;

  const isMastery = sessionType === "MASTERY";

  return {
    sessionType,
    sessionSeq,
    passageId: passage.id,
    passageTitle: passage.title,
    passageContent: passage.content,
    questions: orderedQuestions.map((q) =>
      parseNaeshinQuestion(q, (q.learningCategory as LearningCategory) ?? "VOCAB", sentenceTranslations)
    ),
    seasonId,
    isMastery,
    masteryFailThreshold: isMastery ? MASTERY_FAIL_THRESHOLD : undefined,
    hintsEnabled: !isMastery,
  };
}

// ---------------------------------------------------------------------------
// Helper: 카테고리별 완료 세션 수 조회
// ---------------------------------------------------------------------------

function getCategoryDoneCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  progress: any | null,
  sessionType: SessionType
): number {
  if (!progress) return 0;
  const map: Record<string, string> = {
    VOCAB: "vocabDone",
    INTERPRETATION: "interpDone",
    GRAMMAR: "grammarDone",
    COMPREHENSION: "compDone",
  };
  const field = map[sessionType];
  return field ? (progress[field] ?? 0) : 0;
}

// ---------------------------------------------------------------------------
// startReviewSession — 오답 재풀이
// ---------------------------------------------------------------------------

export async function startReviewSession(
  passageId: string,
  questionIds: string[],
  category?: string
): Promise<SessionStartData> {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: { id: true, title: true, content: true },
  });
  if (!passage) throw new Error("지문을 찾을 수 없습니다.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, unknown> = { id: { in: questionIds } };
  if (category) where.learningCategory = category;

  const questions = await prisma.naeshinQuestion.findMany({
    where,
    include: { explanation: true },
  });

  if (questions.length === 0) throw new Error("풀 수 있는 문제가 없습니다.");

  // Fisher-Yates 셔플
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return {
    sessionType: "VOCAB", // 오답 복습은 카테고리 무관
    sessionSeq: 0,
    passageId: passage.id,
    passageTitle: passage.title,
    passageContent: passage.content,
    questions: shuffled.map((q) =>
      parseNaeshinQuestion(
        {
          id: q.id,
          type: q.type,
          subType: q.subType,
          learningCategory: q.learningCategory,
          questionText: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation
            ? { content: q.explanation.content, keyPoints: q.explanation.keyPoints }
            : null,
        },
        (q.learningCategory as LearningCategory) ?? "VOCAB"
      )
    ),
    seasonId: undefined,
    isMastery: false,
    hintsEnabled: true,
  };
}
