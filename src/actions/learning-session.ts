// @ts-nocheck — studySeason model not yet in schema (pending migration)
"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { revalidatePath } from "next/cache";
import {
  SESSION_COMPOSITION,
  QUESTIONS_PER_SESSION,
  STORIES_QUESTIONS_COUNT,
  LEARNING_XP,
  SUBTYPE_TO_CATEGORY,
  type SessionType,
  type LearningCategory,
} from "@/lib/learning-constants";
import type {
  LessonItem,
  SeasonInfo,
  SessionStartData,
  SessionQuestion,
  SessionResult,
} from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

function xpForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

/** 숙달도 계산: 해당 지문의 모든 세션 정답률 가중 평균 */
function calculateMastery(sessions: { score: number; sessionType: string }[]): number {
  if (sessions.length === 0) return 0;
  const total = sessions.reduce((sum, s) => sum + s.score, 0);
  return Math.round(total / sessions.length);
}

// ---------------------------------------------------------------------------
// questionText JSON → 요약 텍스트 (결과 화면용)
// ---------------------------------------------------------------------------

function summarizeQuestionText(subType: string | null, raw: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: Record<string, any> = JSON.parse(raw);
    switch (subType) {
      case "WORD_MEANING": case "WORD_MEANING_REVERSE":
        return d.word ? `단어: ${d.word}` : raw.slice(0, 80);
      case "WORD_FILL": case "VOCAB_COLLOCATION": case "VOCAB_CONFUSABLE":
      case "KEY_EXPRESSION": case "GRAMMAR_SELECT": case "PASSAGE_FILL":
        return d.sentence || d.excerpt || raw.slice(0, 80);
      case "SENTENCE_INTERPRET":
        return d.englishSentence || raw.slice(0, 80);
      case "SENTENCE_COMPLETE":
        return d.koreanSentence || raw.slice(0, 80);
      case "GRAM_TRANSFORM":
        return d.originalSentence || raw.slice(0, 80);
      case "GRAM_BINARY":
        return d.sentence || raw.slice(0, 80);
      case "TRUE_FALSE":
        return d.statement || raw.slice(0, 80);
      case "CONTENT_QUESTION":
        return d.question || raw.slice(0, 80);
      case "CONNECTOR_FILL":
        return `${(d.sentenceBefore || "").slice(0, 50)}… ___ …${(d.sentenceAfter || "").slice(0, 30)}`;
      case "ERROR_FIND": case "ERROR_CORRECT":
        return d.sentence || raw.slice(0, 80);
      case "WORD_ARRANGE":
        return d.koreanSentence || raw.slice(0, 80);
      case "SENT_CHUNK_ORDER":
        return d.koreanHint || raw.slice(0, 80);
      case "WORD_MATCH":
        return `${d.pairs?.length || 0}쌍 매칭`;
      case "WORD_SPELL":
        return `${d.koreanMeaning || ""} → 스펠링`;
      case "VOCAB_SYNONYM":
        return `${d.word || ""} (${d.targetRelation === "synonym" ? "유의어" : "반의어"})`;
      case "VOCAB_DEFINITION":
        return d.englishDefinition || raw.slice(0, 80);
      default:
        return raw.slice(0, 80);
    }
  } catch {
    return raw.slice(0, 80);
  }
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

function parseNaeshinQuestion(q: NaeshinQuestionRow, fallbackCategory: LearningCategory): SessionQuestion {
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
      questionText = `다음 문장에서 '${data.word}'의 의미로 가장 알맞은 것은?\n\n${data.contextSentence || ""}`;
      options = data.options || null;
      break;
    case "WORD_MEANING_REVERSE":
      questionText = `'${data.koreanMeaning}'에 해당하는 영어 단어는?\n\n${data.contextSentence || ""}`;
      options = data.options || null;
      break;
    case "WORD_FILL":
      questionText = `빈칸에 들어갈 가장 알맞은 단어는?\n\n${data.sentence || ""}`;
      options = data.options || null;
      break;
    case "WORD_MATCH":
      questionText = "영어 단어와 한국어 뜻을 올바르게 연결하세요.";
      // WORD_MATCH는 매칭형 — pairs를 JSON으로 전달
      break;
    case "WORD_SPELL":
      questionText = `'${data.koreanMeaning}' — 힌트: ${data.hint || ""}`;
      correctAnswer = data.correctAnswer || q.correctAnswer || "";
      break;
    case "VOCAB_SYNONYM":
      questionText = `'${data.word}'의 ${data.targetRelation === "synonym" ? "유의어" : "반의어"}로 가장 알맞은 것은?\n\n${data.contextSentence || ""}`;
      options = data.options || null;
      break;
    case "VOCAB_DEFINITION":
      questionText = `다음 영어 정의에 해당하는 단어는?\n\n"${data.englishDefinition || ""}"`;
      options = data.options || null;
      passageSnippet = data.contextSentence;
      break;
    case "VOCAB_COLLOCATION":
      questionText = `빈칸에 들어갈 알맞은 단어는?\n\n${data.sentence || ""}`;
      options = data.options || null;
      break;
    case "VOCAB_CONFUSABLE":
      questionText = `빈칸에 들어갈 올바른 단어는?\n\n${data.sentence || ""}`;
      options = data.options || null;
      break;

    // ── INTERPRETATION ───────────────────────
    case "SENTENCE_INTERPRET":
      questionText = `다음 영어 문장의 해석으로 가장 알맞은 것은?\n\n${data.englishSentence || ""}`;
      options = data.options || null;
      break;
    case "SENTENCE_COMPLETE":
      questionText = `다음 한국어 해석에 맞는 영어 문장을 고르세요.\n\n${data.koreanSentence || ""}`;
      options = data.options || null;
      break;
    case "WORD_ARRANGE":
      questionText = `다음 한국어 뜻에 맞게 영어 단어/구를 배열하세요.\n\n${data.koreanSentence || ""}`;
      // correctOrder + distractorWords를 JSON으로 전달
      break;
    case "KEY_EXPRESSION":
      questionText = `빈칸에 들어갈 핵심 표현은?\n\n${data.sentence || ""}`;
      options = data.options || null;
      break;
    case "SENT_CHUNK_ORDER":
      questionText = `다음 한국어 해석에 맞게 끊어읽기 순서를 배열하세요.\n\n${data.koreanHint || ""}`;
      // chunks + correctOrder를 JSON으로 전달
      break;

    // ── GRAMMAR ──────────────────────────────
    case "GRAMMAR_SELECT":
      questionText = `빈칸에 들어갈 올바른 문법 형태는?\n\n${data.sentence || ""}`;
      options = data.options || null;
      break;
    case "ERROR_FIND":
      questionText = `다음 문장에서 문법 오류가 있는 단어를 찾으세요.\n\n${data.sentence || ""}`;
      // words 배열에서 탭 선택 — 특수 UI 필요, 현재는 단답형으로 처리
      correctAnswer = data.errorWord || q.correctAnswer || "";
      break;
    case "ERROR_CORRECT":
      questionText = `다음 문장의 밑줄 친 부분을 올바르게 고치세요.\n\n${data.sentence || ""}\n\n오류 부분: ${data.errorPart || ""}`;
      correctAnswer = data.correctAnswer || q.correctAnswer || "";
      break;
    case "GRAM_TRANSFORM":
      questionText = `다음 문장을 지시에 따라 전환하세요.\n\n${data.originalSentence || ""}\n\n${data.instruction || ""}`;
      correctAnswer = data.correctAnswer || q.correctAnswer || "";
      break;
    case "GRAM_BINARY":
      questionText = `다음 문장의 문법이 맞으면 O, 틀리면 X를 선택하세요.\n\n${data.sentence || ""}`;
      options = [
        { label: "O", text: "맞다" },
        { label: "X", text: "틀리다" },
      ];
      correctAnswer = data.isCorrect === true ? "O" : "X";
      break;

    // ── COMPREHENSION ────────────────────────
    case "TRUE_FALSE":
      questionText = `다음 진술이 지문 내용과 일치하면 O, 불일치하면 X를 선택하세요.\n\n${data.statement || ""}`;
      options = [
        { label: "O", text: "일치" },
        { label: "X", text: "불일치" },
      ];
      correctAnswer = data.isTrue === true ? "O" : "X";
      passageSnippet = data.contextExcerpt;
      break;
    case "CONTENT_QUESTION":
      questionText = data.question || "";
      options = data.options || null;
      passageSnippet = data.contextExcerpt;
      break;
    case "PASSAGE_FILL":
      questionText = `빈칸에 들어갈 표현으로 가장 알맞은 것은?\n\n${data.excerpt || ""}`;
      options = data.options || null;
      break;
    case "CONNECTOR_FILL":
      questionText = `두 문장 사이에 들어갈 연결어로 가장 알맞은 것은?\n\n${data.sentenceBefore || ""}\n\n___________\n\n${data.sentenceAfter || ""}`;
      options = data.options || null;
      break;

    default:
      questionText = q.questionText;
      break;
  }

  // correctAnswer가 비어있으면 DB 값 사용
  if (!correctAnswer) correctAnswer = q.correctAnswer || "";

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

  // 내신 집중 모드 우선
  const season = await prisma.studySeason.findFirst({
    where: {
      academyId: session.academyId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [
        { grade: session.grade },
        { grade: null }, // 전체 학년 대상
      ],
    },
    include: {
      passages: { orderBy: { order: "asc" } },
    },
    orderBy: [
      // EXAM_PREP 우선
      { type: "asc" },
      { startDate: "desc" },
    ],
  });

  if (!season) return null;

  // 완료한 레슨 수 계산
  const completedCount = await prisma.lessonProgress.count({
    where: {
      studentId: session.studentId,
      seasonId: season.id,
      session1Done: true,
      session2Done: true,
      storiesDone: true,
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
// 2. getLessonList — 레슨 목록 (지문별 진행도 포함)
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

  // Build base lesson data
  const baseLessons = seasonPassages.map((sp) => {
    const prog = progressMap.get(sp.passageId);
    const s1 = prog?.session1Done ?? false;
    const s2 = prog?.session2Done ?? false;
    const stories = prog?.storiesDone ?? false;
    const s3 = prog?.session3Done ?? false;
    const s4 = prog?.session4Done ?? false;
    const s5 = prog?.session5Done ?? false;

    const storiesUnlocked = s1 && s2;

    let nextSession: SessionType | null = null;
    if (!s1) nextSession = "MIX_1";
    else if (!s2) nextSession = "MIX_2";
    else if (!stories) nextSession = "STORIES";
    else if (!s3) nextSession = "VOCAB_FOCUS";
    else if (!s4) nextSession = "GRAMMAR_FOCUS";
    else if (!s5) nextSession = "WEAKNESS_FOCUS";

    const isCompleted = s1 && s2 && stories;
    const allDone = isCompleted && s3 && s4 && s5;
    const anySessions = s1 || s2 || stories || s3 || s4 || s5;

    return {
      passageId: sp.passageId,
      passageTitle: sp.passage.title,
      order: sp.order,
      session1Done: s1,
      session2Done: s2,
      storiesDone: stories,
      session3Done: s3,
      session4Done: s4,
      session5Done: s5,
      masteryScore: prog?.masteryScore ?? 0,
      storiesUnlocked,
      nextSession,
      isCompleted,
      _allDone: allDone,
      _anySessions: anySessions,
    };
  });

  // Sequential lock logic
  let firstIncomplete = -1;
  return baseLessons.map((lesson, i) => {
    const isLocked = i > 0 && !baseLessons[i - 1].isCompleted;
    if (!lesson.isCompleted && firstIncomplete === -1) firstIncomplete = i;
    const isCurrent = i === firstIncomplete;

    let crownLevel: 0 | 1 | 2 | 3 = 0;
    if (isLocked) {
      crownLevel = 0;
    } else if (lesson._allDone && lesson.masteryScore >= 80) {
      crownLevel = 3;
    } else if (lesson._anySessions) {
      crownLevel = 2;
    } else {
      crownLevel = 1;
    }

    // Strip internal fields
    const { _allDone, _anySessions, ...rest } = lesson;
    return { ...rest, isLocked, isCurrent, crownLevel };
  });
}

// ---------------------------------------------------------------------------
// 3. startSession — 세션 시작 (문제 선별)
// ---------------------------------------------------------------------------

export async function startSession(
  passageId: string,
  sessionType: SessionType,
  seasonId?: string
): Promise<SessionStartData> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: { id: true, title: true, content: true },
  });
  if (!passage) throw new Error("지문을 찾을 수 없습니다.");

  // 레슨 순차 잠금 검증
  if (seasonId) {
    const lessons = await getLessonList(seasonId);
    const target = lessons.find((l) => l.passageId === passageId);
    if (target?.isLocked) {
      throw new Error("이전 레슨을 먼저 완료하세요.");
    }
  }

  // Stories 모드는 별도 처리
  if (sessionType === "STORIES") {
    const questions = await pickStoriesQuestions(passageId);
    return {
      sessionType,
      passageId: passage.id,
      passageTitle: passage.title,
      passageContent: passage.content,
      questions,
      seasonId,
    };
  }

  const composition = SESSION_COMPOSITION[sessionType];
  const allQuestions: SessionQuestion[] = [];

  // 약점 집중: 이전 오답 문제 우선
  let weaknessQuestionIds: string[] = [];
  if (sessionType === "WEAKNESS_FOCUS") {
    const wrongLogs = await prisma.naeshinWrongAnswerLog.findMany({
      where: { studentId, question: { passageId } },
      orderBy: { count: "desc" },
      take: QUESTIONS_PER_SESSION,
      select: { questionId: true },
    });
    weaknessQuestionIds = wrongLogs.map((w) => w.questionId);
  }

  // 이미 풀었던 문제 ID 가져오기 (중복 출제 최소화)
  const previousRecords = await prisma.sessionRecord.findMany({
    where: { studentId, passageId },
    select: { wrongQuestionIds: true },
  });

  // 카테고리별 문제 추출 (NaeshinQuestion 사용)
  for (const [category, count] of Object.entries(composition)) {
    if (count === 0) continue;

    const questions = await prisma.naeshinQuestion.findMany({
      where: {
        passageId,
        learningCategory: category,
        ...(weaknessQuestionIds.length > 0 && sessionType === "WEAKNESS_FOCUS"
          ? { id: { in: weaknessQuestionIds } }
          : {}),
      },
      include: { explanation: true },
      take: count * 3,
    });

    const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, count);

    for (const q of shuffled) {
      allQuestions.push(parseNaeshinQuestion(q, category as LearningCategory));
    }
  }

  // 최종 셔플
  const finalQuestions = allQuestions.sort(() => Math.random() - 0.5);

  return {
    sessionType,
    passageId: passage.id,
    passageTitle: passage.title,
    passageContent: passage.content,
    questions: finalQuestions.slice(0, QUESTIONS_PER_SESSION),
    seasonId,
  };
}

/** Stories용 가벼운 이해도 문제 선별 */
async function pickStoriesQuestions(passageId: string): Promise<SessionQuestion[]> {
  const questions = await prisma.naeshinQuestion.findMany({
    where: {
      passageId,
      learningCategory: { in: ["COMPREHENSION", "INTERPRETATION"] },
    },
    include: { explanation: true },
    take: STORIES_QUESTIONS_COUNT * 3,
  });

  const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, STORIES_QUESTIONS_COUNT);

  return shuffled.map((q) => parseNaeshinQuestion(q, "COMPREHENSION"));
}

// ---------------------------------------------------------------------------
// 4. submitSession — 세션 완료 제출
// ---------------------------------------------------------------------------

export async function submitSession(data: {
  passageId: string;
  sessionType: SessionType;
  seasonId?: string;
  answers: { questionId: string; givenAnswer: string; isCorrect: boolean }[];
  startedAt: string;
}): Promise<SessionResult> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const correctCount = data.answers.filter((a) => a.isCorrect).length;
  const totalCount = data.answers.length;
  const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  // XP 배율 체크 (데일리 미션)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mission = await prisma.studentDailyMission.findUnique({
    where: { studentId_date: { studentId, date: today } },
  });

  let multiplier = 1;
  if (
    mission?.multiplierActive &&
    mission.multiplierExpiresAt &&
    new Date() < mission.multiplierExpiresAt
  ) {
    multiplier = mission.multiplierActive;
  }

  const baseXp =
    data.sessionType === "STORIES"
      ? LEARNING_XP.STORIES_COMPLETE
      : LEARNING_XP.SESSION_COMPLETE;
  const perfectBonus = score === 100 ? LEARNING_XP.PERFECT_SESSION : 0;
  const xpEarned = Math.round((baseXp + perfectBonus) * multiplier);

  // 오답 문제 ID
  const wrongAnswers = data.answers.filter((a) => !a.isCorrect);
  const wrongQuestionIds = wrongAnswers.map((a) => a.questionId);

  // 병렬 처리: 세션 기록 + 오답 로그 + XP 추가 + 레슨 진행도
  const [sessionRecord] = await Promise.all([
    // 세션 기록
    prisma.sessionRecord.create({
      data: {
        studentId,
        passageId: data.passageId,
        seasonId: data.seasonId,
        sessionType: data.sessionType,
        score,
        correctCount,
        totalCount,
        wrongQuestionIds: JSON.stringify(wrongQuestionIds),
        xpEarned,
        startedAt: new Date(data.startedAt),
        completedAt: new Date(),
      },
    }),
    // 오답 로그 upsert (NaeshinWrongAnswerLog)
    ...wrongAnswers.map((wa) =>
      prisma.naeshinWrongAnswerLog.upsert({
        where: { studentId_questionId: { studentId, questionId: wa.questionId } },
        create: {
          studentId,
          questionId: wa.questionId,
          givenAnswer: wa.givenAnswer,
          category: undefined,
        },
        update: {
          count: { increment: 1 },
          lastWrongAt: new Date(),
          givenAnswer: wa.givenAnswer,
        },
      })
    ),
  ]);

  // XP 추가 + 레벨업
  await addXpInternal(studentId, xpEarned);

  // 레슨 진행도 업데이트
  const lessonProgress = await updateLessonProgress(
    studentId,
    data.passageId,
    data.sessionType,
    data.seasonId
  );

  // 스트릭 업데이트
  await updateStreak(studentId);

  // StudyProgress 일별 추적 업데이트
  await prisma.studyProgress.upsert({
    where: { studentId_date: { studentId, date: today } },
    create: {
      studentId,
      date: today,
      questionsAnswered: totalCount,
      xpEarned,
    },
    update: {
      questionsAnswered: { increment: totalCount },
      xpEarned: { increment: xpEarned },
    },
  });

  revalidatePath("/student");

  // 오답 문제 상세 가져오기 (NaeshinQuestion)
  const wrongDetails = wrongQuestionIds.length > 0
    ? await prisma.naeshinQuestion.findMany({
        where: { id: { in: wrongQuestionIds } },
        select: { id: true, subType: true, questionText: true, correctAnswer: true },
      })
    : [];

  const wrongMap = new Map(wrongDetails.map((q) => [q.id, q]));

  return {
    sessionType: data.sessionType,
    score,
    correctCount,
    totalCount,
    xpEarned,
    xpMultiplier: multiplier,
    wrongQuestions: wrongAnswers.map((wa) => {
      const q = wrongMap.get(wa.questionId);
      return {
        questionId: wa.questionId,
        questionText: q ? summarizeQuestionText(q.subType, q.questionText) : "",
        givenAnswer: wa.givenAnswer,
        correctAnswer: q?.correctAnswer ?? "",
      };
    }),
    lessonProgress: {
      session1Done: lessonProgress.session1Done,
      session2Done: lessonProgress.session2Done,
      storiesDone: lessonProgress.storiesDone,
      session3Done: lessonProgress.session3Done,
      session4Done: lessonProgress.session4Done,
      session5Done: lessonProgress.session5Done,
      masteryScore: lessonProgress.masteryScore,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function addXpInternal(studentId: string, amount: number) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { xp: true, level: true },
  });
  if (!student) return;

  let newXp = student.xp + amount;
  let newLevel = student.level;
  while (newXp >= xpForLevel(newLevel)) {
    newXp -= xpForLevel(newLevel);
    newLevel++;
  }

  await prisma.student.update({
    where: { id: studentId },
    data: { xp: newXp, level: newLevel },
  });
}

async function updateLessonProgress(
  studentId: string,
  passageId: string,
  sessionType: SessionType,
  seasonId?: string
) {
  const sessionFieldMap: Record<string, string> = {
    MIX_1: "session1Done",
    MIX_2: "session2Done",
    STORIES: "storiesDone",
    VOCAB_FOCUS: "session3Done",
    GRAMMAR_FOCUS: "session4Done",
    WEAKNESS_FOCUS: "session5Done",
  };

  const field = sessionFieldMap[sessionType];

  // 세션 기록으로 숙달도 재계산
  const allSessions = await prisma.sessionRecord.findMany({
    where: { studentId, passageId },
    select: { score: true, sessionType: true },
  });
  const mastery = calculateMastery(allSessions);

  const progress = await prisma.lessonProgress.upsert({
    where: {
      studentId_passageId_seasonId: {
        studentId,
        passageId,
        seasonId: seasonId ?? "",
      },
    },
    create: {
      studentId,
      passageId,
      seasonId,
      [field]: true,
      masteryScore: mastery,
    },
    update: {
      [field]: true,
      masteryScore: mastery,
    },
  });

  return progress;
}

async function updateStreak(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { streak: true, lastStudyDate: true, streakFreezeCount: true },
  });
  if (!student) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDate = student.lastStudyDate
    ? new Date(student.lastStudyDate)
    : null;
  if (lastDate) lastDate.setHours(0, 0, 0, 0);

  // 이미 오늘 기록 있으면 스킵
  if (lastDate && lastDate.getTime() === today.getTime()) return;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let newStreak = student.streak;

  if (lastDate && lastDate.getTime() === yesterday.getTime()) {
    // 어제 학습 → 스트릭 +1
    newStreak++;
  } else if (lastDate && lastDate.getTime() < yesterday.getTime()) {
    // 하루 이상 빠짐 → 프리즈 체크
    const daysMissed = Math.floor(
      (yesterday.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysMissed === 1 && student.streakFreezeCount > 0) {
      // 프리즈 사용
      await prisma.student.update({
        where: { id: studentId },
        data: { streakFreezeCount: { decrement: 1 } },
      });
      newStreak++; // 프리즈로 유지 + 오늘 학습
    } else {
      newStreak = 1; // 리셋
    }
  } else {
    newStreak = 1; // 첫 학습
  }

  await prisma.student.update({
    where: { id: studentId },
    data: {
      streak: newStreak,
      lastStudyDate: today,
    },
  });
}

