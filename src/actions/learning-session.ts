"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { unstable_cache } from "next/cache";
import {
  QUESTIONS_PER_SESSION,
  MASTERY_FAIL_THRESHOLD,
  LEARNING_XP,
  type SessionType,
  type LearningCategory,
} from "@/lib/learning-constants";
import type {
  LessonItem,
  SeasonInfo,
  SessionStartData,
  SessionQuestion,
} from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

// ---------------------------------------------------------------------------
// NaeshinQuestion → SessionQuestion 변환
// ---------------------------------------------------------------------------

interface NaeshinQuestionRow {
  id: string;
  type: string;
  subType: string | null;
  learningCategory: string;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  explanation: { content: string; keyPoints: string | null } | null;
}

/** options 정규화 — AI 출력이 여러 형태로 올 수 있음
 *  1) [{label:"A", text:"..."}]  → 정상
 *  2) {"A":"...", "B":"..."}     → 객체 형태
 *  3) ["A. ...", "B. ..."]       → 문자열 배열 */
function normalizeOptions(raw: unknown): { label: string; text: string }[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    // [{label, text}] 형태
    if (typeof raw[0] === "object" && raw[0] !== null && "label" in raw[0] && "text" in raw[0]) {
      return raw as { label: string; text: string }[];
    }
    // ["A. ...", "B. ..."] 문자열 배열
    if (typeof raw[0] === "string") {
      return raw.map((s: string, i: number) => {
        const match = s.match(/^([A-Z])[.:]\s*(.*)/);
        if (match) return { label: match[1], text: match[2] };
        return { label: String.fromCharCode(65 + i), text: s };
      });
    }
    // ["A: ...", ...] 형태
    if (typeof raw[0] === "string") {
      return raw.map((s: string, i: number) => ({
        label: String.fromCharCode(65 + i),
        text: String(s),
      }));
    }
  }
  // {"A":"...", "B":"..."} 객체 형태
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return Object.entries(raw).map(([label, text]) => ({
      label,
      text: String(text),
    }));
  }
  return null;
}

function parseNaeshinQuestion(q: NaeshinQuestionRow, fallbackCategory: LearningCategory, sentenceTranslations?: Map<string, string>): SessionQuestion {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: Record<string, any> = {};
  try { data = JSON.parse(q.questionText); } catch { /* raw text fallback */ }

  const subType = q.subType ?? "";
  let questionText = "";
  let options: { label: string; text: string }[] | null = null;
  let correctAnswer = q.correctAnswer || "";
  let passageSnippet: string | undefined;

  switch (subType) {
    // ── VOCAB ────────────────────────────────
    case "WORD_MEANING":
      questionText = data.word
        ? `다음 문장에서 '${data.word}'의 의미로 가장 알맞은 것은?\n\n${data.contextSentence || ""}`
        : `다음 단어의 의미로 가장 알맞은 것은?\n\n${data.contextSentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "WORD_MEANING_REVERSE": {
      const korMeaning = data.koreanMeaning || data.meaning || "";
      questionText = korMeaning
        ? `'${korMeaning}'에 해당하는 영어 단어는?`
        : `다음에 해당하는 영어 단어는?`;
      options = normalizeOptions(data.options);
      break;
    }
    case "WORD_FILL":
      questionText = `빈칸에 들어갈 가장 알맞은 단어는?\n\n${data.sentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "WORD_MATCH":
      questionText = "영어 단어와 한국어 뜻을 올바르게 연결하세요.";
      // pairs는 rawData로 전달
      break;
    case "WORD_SPELL": {
      const meaning = data.koreanMeaning || "";
      const hint = data.hint || "";
      const answer = data.correctAnswer || q.correctAnswer || "";
      const blanks = answer.length > hint.length ? "_".repeat(answer.length - hint.length) : "____";
      // correctAnswer(영단어)로 PassageAnalysis에서 포함 문장의 한국어 번역 찾기
      let contextLine = "";
      if (sentenceTranslations && sentenceTranslations.size > 0 && answer) {
        const answerLower = answer.toLowerCase();
        for (const [eng, kor] of sentenceTranslations) {
          if (eng.includes(answerLower)) {
            if (meaning) {
              // 정확 일치 먼저
              if (kor.includes(meaning)) {
                contextLine = kor.replace(meaning, `**${meaning}**`);
              } else {
                // 어근 매칭: "식별하다" → "식별" 추출 후 "식별하기는" 찾기
                const stem = meaning.replace(/(하다|되다|시키다|적인|적$)/g, "");
                if (stem.length >= 2) {
                  const regex = new RegExp(`(${stem}[가-힣]*)`, "g");
                  const match = kor.match(regex);
                  if (match) {
                    contextLine = kor.replace(match[0], `**${match[0]}**`);
                  } else {
                    contextLine = kor;
                  }
                } else {
                  contextLine = kor;
                }
              }
            } else {
              contextLine = kor;
            }
            break;
          }
        }
      }
      questionText = contextLine
        ? `강조된 단어를 영어로 입력하세요.\n\n${contextLine}\n\n힌트: ${hint}${blanks}`
        : `다음 뜻에 해당하는 영어 단어를 입력하세요.\n\n"${meaning}"\n\n힌트: ${hint}${blanks}`;
      correctAnswer = answer;
      break;
    }
    case "VOCAB_SYNONYM":
      questionText = data.word
        ? `'${data.word}'의 ${data.targetRelation === "synonym" ? "유의어" : "반의어"}로 가장 알맞은 것은?\n\n${data.contextSentence || ""}`
        : `다음 단어의 ${data.targetRelation === "synonym" ? "유의어" : "반의어"}는?\n\n${data.contextSentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "VOCAB_DEFINITION":
      questionText = `다음 영어 정의에 해당하는 단어는?\n\n"${data.englishDefinition || ""}"`;
      options = normalizeOptions(data.options);
      // contextSentence에 정답이 포함되므로 지문 표시 안 함
      break;
    case "VOCAB_COLLOCATION":
      questionText = `빈칸에 들어갈 알맞은 단어는?\n\n${data.sentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "VOCAB_CONFUSABLE":
      questionText = `빈칸에 들어갈 올바른 단어는?\n\n${data.sentence || ""}`;
      options = normalizeOptions(data.options);
      break;

    // ── INTERPRETATION ───────────────────────
    case "SENTENCE_INTERPRET":
      questionText = `다음 영어 문장의 해석으로 가장 알맞은 것은?\n\n${data.englishSentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "SENTENCE_COMPLETE":
      questionText = `다음 한국어 해석에 맞는 영어 문장을 고르세요.\n\n${data.koreanSentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "WORD_ARRANGE":
      questionText = `다음 한국어 뜻에 맞게 영어 단어/구를 배열하세요.\n\n${data.koreanSentence || ""}`;
      break;
    case "KEY_EXPRESSION":
      questionText = `빈칸에 들어갈 핵심 표현은?\n\n${data.sentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "SENT_CHUNK_ORDER":
      questionText = `다음 한국어 해석에 맞게 끊어읽기 순서를 배열하세요.\n\n${data.koreanHint || ""}`;
      break;

    // ── GRAMMAR ──────────────────────────────
    case "GRAMMAR_SELECT":
      questionText = `빈칸에 들어갈 올바른 문법 형태는?\n\n${data.sentence || data.contextSentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "ERROR_FIND":
      questionText = `다음 문장에서 문법 오류가 있는 단어를 찾으세요.\n\n${data.sentence || ""}`;
      correctAnswer = data.errorWord || q.correctAnswer || "";
      break;
    case "ERROR_CORRECT":
      questionText = `다음 문장의 밑줄 친 부분을 올바르게 고치세요.\n\n${data.sentence || ""}\n\n오류 부분: ${data.errorPart || ""}`;
      correctAnswer = data.correctAnswer || q.correctAnswer || "";
      break;
    case "GRAM_TRANSFORM":
      questionText = `다음 문장을 지시에 따라 전환하세요.\n\n${data.originalSentence || ""}\n\n[${data.instruction || data.grammarPoint || ""}]`;
      correctAnswer = data.correctAnswer || q.correctAnswer || "";
      break;
    case "GRAM_BINARY":
      questionText = `다음 문장의 문법이 맞으면 O, 틀리면 X를 선택하세요.\n\n${data.sentence || ""}`;
      options = [{ label: "O", text: "맞다" }, { label: "X", text: "틀리다" }];
      correctAnswer = data.isCorrect === true ? "O" : "X";
      break;

    // ── COMPREHENSION ────────────────────────
    case "TRUE_FALSE":
      questionText = `다음 진술이 지문 내용과 일치하면 O, 불일치하면 X를 선택하세요.\n\n${data.statement || ""}`;
      options = [{ label: "O", text: "일치" }, { label: "X", text: "불일치" }];
      correctAnswer = data.isTrue === true ? "O" : "X";
      passageSnippet = data.contextExcerpt;
      break;
    case "CONTENT_QUESTION":
      questionText = data.question || data.contextExcerpt || "다음 지문의 내용과 관련된 질문입니다.";
      options = normalizeOptions(data.options);
      passageSnippet = data.question ? data.contextExcerpt : undefined;
      break;
    case "PASSAGE_FILL":
      questionText = `빈칸에 들어갈 표현으로 가장 알맞은 것은?\n\n${data.excerpt || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "CONNECTOR_FILL":
      questionText = `두 문장 사이에 들어갈 연결어로 가장 알맞은 것은?\n\n${data.sentenceBefore || ""}\n\n___________\n\n${data.sentenceAfter || ""}`;
      options = normalizeOptions(data.options);
      break;

    default:
      questionText = q.questionText;
      break;
  }

  if (!correctAnswer) correctAnswer = q.correctAnswer || "";

  // 특수 인터랙션용 rawData
  const specialSubTypes = ["WORD_MATCH", "WORD_ARRANGE", "SENT_CHUNK_ORDER", "ERROR_FIND"];
  const rawData = specialSubTypes.includes(subType) ? data : undefined;

  return {
    id: q.id,
    type: q.type,
    subType,
    learningCategory: (q.learningCategory || fallbackCategory) as LearningCategory,
    questionText,
    options,
    correctAnswer,
    includesPassage: !!passageSnippet,
    passageSnippet,
    rawData,
    explanation: q.explanation
      ? {
          content: q.explanation.content,
          keyPoints: q.explanation.keyPoints ? JSON.parse(q.explanation.keyPoints) : undefined,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// 1. getActiveSeason — 현재 활성 시즌 조회
// ---------------------------------------------------------------------------

export async function getActiveSeason(): Promise<SeasonInfo | null> {
  const session = await requireStudent();
  const now = new Date();

  const season = await prisma.studySeason.findFirst({
    where: {
      academyId: session.academyId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [{ grade: session.grade }, { grade: null }],
    },
    include: { passages: { orderBy: { order: "asc" } } },
    orderBy: [{ type: "asc" }, { startDate: "desc" }],
  });

  if (!season) return null;

  // 완료 = 마스터리 통과
  const completedCount = await prisma.lessonProgress.count({
    where: {
      studentId: session.studentId,
      seasonId: season.id,
      masteryPassed: true,
    },
  });

  const dDay =
    season.type === "EXAM_PREP"
      ? Math.ceil((season.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

  return {
    id: season.id,
    name: season.name,
    type: season.type as "EXAM_PREP" | "REGULAR",
    startDate: season.startDate.toISOString(),
    endDate: season.endDate.toISOString(),
    dDay,
    totalLessons: season.passages.length,
    completedLessons: completedCount,
  };
}

// ---------------------------------------------------------------------------
// 2. getLessonList — 레슨 목록 (카테고리별 진행도)
// ---------------------------------------------------------------------------

export async function getLessonList(seasonId: string): Promise<LessonItem[]> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const [seasonPassages, progressList] = await Promise.all([
    prisma.seasonPassage.findMany({
      where: { seasonId },
      include: { passage: { select: { id: true, title: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.lessonProgress.findMany({
      where: { studentId, seasonId },
    }),
  ]);

  const progressMap = new Map(progressList.map((p) => [p.passageId, p]));

  return seasonPassages.map((sp) => {
    const prog = progressMap.get(sp.passageId);
    const catProgress = {
      VOCAB: prog?.vocabDone ?? 0,
      INTERPRETATION: prog?.interpDone ?? 0,
      GRAMMAR: prog?.grammarDone ?? 0,
      COMPREHENSION: prog?.compDone ?? 0,
    };

    const masteryUnlocked =
      catProgress.VOCAB >= 1 &&
      catProgress.INTERPRETATION >= 1 &&
      catProgress.GRAMMAR >= 1 &&
      catProgress.COMPREHENSION >= 1;

    const totalSessionsDone =
      catProgress.VOCAB + catProgress.INTERPRETATION +
      catProgress.GRAMMAR + catProgress.COMPREHENSION +
      (prog?.masteryPassed ? 1 : 0);

    return {
      passageId: sp.passageId,
      passageTitle: sp.passage.title,
      order: sp.order,
      categoryProgress: catProgress,
      masteryUnlocked,
      masteryPassed: prog?.masteryPassed ?? false,
      masteryScore: prog?.masteryScore ?? 0,
      masteryAttempts: prog?.masteryAttempts ?? 0,
      isCompleted: prog?.masteryPassed ?? false,
      totalSessionsDone,
    };
  });
}

// ---------------------------------------------------------------------------
// 2-1. getLearnPageData — 학습 홈 통합 로드
// ---------------------------------------------------------------------------

export async function getLearnPageData() {
  const session = await requireStudent();
  const { getDailyMission, getStreakInfo } = await import("@/actions/learning-gamification");

  // 시즌+레슨은 캐싱 (cookies 접근 불가 → 인자로 전달)
  const cachedSeasonLessons = unstable_cache(
    async (studentId: string, academyId: string, grade: number) => {
      const seasonData = await _getActiveSeason(studentId, academyId, grade);
      const lessons = seasonData ? await _getLessonList(studentId, seasonData.id) : [];
      return { season: seasonData, lessons };
    },
    [`learn-${session.studentId}`],
    { revalidate: 120, tags: [`student-${session.studentId}`] }
  );

  const [{ season: seasonData, lessons }, missionData, streakData] = await Promise.all([
    cachedSeasonLessons(session.studentId, session.academyId, session.grade),
    getDailyMission(),
    getStreakInfo(),
  ]);

  return { season: seasonData, mission: missionData, streak: streakData, lessons };
}

// 캐시용 내부 함수 (cookies 미사용)
async function _getActiveSeason(studentId: string, academyId: string, grade: number): Promise<SeasonInfo | null> {
  const now = new Date();
  const season = await prisma.studySeason.findFirst({
    where: {
      academyId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [{ grade }, { grade: null }],
    },
    include: { passages: { orderBy: { order: "asc" } } },
    orderBy: [{ type: "asc" }, { startDate: "desc" }],
  });
  if (!season) return null;

  const completedCount = await prisma.lessonProgress.count({
    where: { studentId, seasonId: season.id, masteryPassed: true },
  });

  const dDay = season.type === "EXAM_PREP"
    ? Math.ceil((season.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    id: season.id,
    name: season.name,
    type: season.type as "EXAM_PREP" | "REGULAR",
    startDate: season.startDate.toISOString(),
    endDate: season.endDate.toISOString(),
    dDay,
    totalLessons: season.passages.length,
    completedLessons: completedCount,
  };
}

async function _getLessonList(studentId: string, seasonId: string): Promise<LessonItem[]> {
  const [seasonPassages, progressList] = await Promise.all([
    prisma.seasonPassage.findMany({
      where: { seasonId },
      include: { passage: { select: { id: true, title: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.lessonProgress.findMany({
      where: { studentId, seasonId },
    }),
  ]);

  const progressMap = new Map(progressList.map((p) => [p.passageId, p]));

  return seasonPassages.map((sp) => {
    const prog = progressMap.get(sp.passageId);
    const catProgress = {
      VOCAB: prog?.vocabDone ?? 0,
      INTERPRETATION: prog?.interpDone ?? 0,
      GRAMMAR: prog?.grammarDone ?? 0,
      COMPREHENSION: prog?.compDone ?? 0,
    };
    const masteryUnlocked =
      catProgress.VOCAB >= 1 && catProgress.INTERPRETATION >= 1 &&
      catProgress.GRAMMAR >= 1 && catProgress.COMPREHENSION >= 1;
    const totalSessionsDone =
      catProgress.VOCAB + catProgress.INTERPRETATION +
      catProgress.GRAMMAR + catProgress.COMPREHENSION +
      (prog?.masteryPassed ? 1 : 0);

    return {
      passageId: sp.passageId,
      passageTitle: sp.passage.title,
      order: sp.order,
      categoryProgress: catProgress,
      masteryUnlocked,
      masteryPassed: prog?.masteryPassed ?? false,
      masteryScore: prog?.masteryScore ?? 0,
      masteryAttempts: prog?.masteryAttempts ?? 0,
      isCompleted: prog?.masteryPassed ?? false,
      totalSessionsDone,
    };
  });
}

// ---------------------------------------------------------------------------
// 3. startSession — 사전 생성된 세션 조회
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
  let sentenceTranslations: Map<string, string> = new Map();
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
// 4. startReviewSession — 오답 재풀이
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
