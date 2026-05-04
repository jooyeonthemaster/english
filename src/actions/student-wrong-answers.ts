"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

/** NaeshinQuestion의 JSON questionText에서 사람이 읽을 수 있는 텍스트 추출 */
function extractQuestionText(subType: string | null, raw: string): string {
  try {
    const d = JSON.parse(raw);
    switch (subType) {
      case "WORD_MEANING":
        return `'${d.word}'의 의미는?`;
      case "WORD_MEANING_REVERSE":
        return `'${d.koreanMeaning}'에 해당하는 단어는?`;
      case "WORD_FILL":
        return d.sentence?.replace(/___+/, "______")?.substring(0, 100) ?? "";
      case "WORD_SPELL":
        return `'${d.koreanMeaning}' 스펠링 (힌트: ${d.hint ?? ""})`;
      case "VOCAB_SYNONYM":
        return `'${d.word}'의 ${d.targetRelation === "synonym" ? "유의어" : "반의어"}는?`;
      case "VOCAB_DEFINITION":
        return `영영풀이: "${(d.englishDefinition ?? "").substring(0, 60)}"`;
      case "VOCAB_COLLOCATION":
      case "VOCAB_CONFUSABLE":
        return d.sentence?.replace(/___+/, "______")?.substring(0, 100) ?? "";
      case "SENTENCE_INTERPRET":
        return `해석: "${(d.englishSentence ?? d.sentence ?? "").substring(0, 80)}"`;
      case "SENTENCE_COMPLETE":
        return `영작: "${(d.koreanSentence ?? d.sentence ?? "").substring(0, 80)}"`;
      case "WORD_ARRANGE":
        return d.koreanSentence?.substring(0, 80) ?? "단어 배열";
      case "KEY_EXPRESSION":
        return `핵심 표현: ${(d.expression ?? d.sentence ?? "").substring(0, 80)}`;
      case "SENT_CHUNK_ORDER":
        return "끊어읽기 순서 배열";
      case "GRAMMAR_SELECT":
        return d.sentence?.substring(0, 100) ?? "문법 고르기";
      case "ERROR_FIND":
      case "ERROR_CORRECT":
        return d.sentence?.substring(0, 100) ?? "오류 찾기/수정";
      case "GRAM_TRANSFORM":
        return d.sentence?.substring(0, 100) ?? "문장 전환";
      case "GRAM_BINARY":
        return d.sentence?.substring(0, 100) ?? "문법 O/X";
      case "TRUE_FALSE":
        return d.statement?.substring(0, 100) ?? "O/X 판단";
      case "CONTENT_QUESTION":
        return (d.question ?? d.text ?? "").substring(0, 100);
      case "PASSAGE_FILL":
      case "CONNECTOR_FILL":
        return d.sentence?.replace(/___+/, "______")?.substring(0, 100) ?? "빈칸 채우기";
      default:
        return d.question || d.text || d.word || d.sentence || raw.substring(0, 80);
    }
  } catch {
    return raw.substring(0, 80);
  }
}

// ---------------------------------------------------------------------------
// getWrongAnswerDashboard — 오답 관리 페이지용 데이터
// ---------------------------------------------------------------------------
export async function getWrongAnswerDashboard() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const wrongLogs = await prisma.naeshinWrongAnswerLog.findMany({
    where: { studentId },
    include: {
      question: {
        select: {
          id: true,
          learningCategory: true,
          subType: true,
          questionText: true,
          options: true,
          correctAnswer: true,
          passageId: true,
          passage: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { count: "desc" },
  });

  // 1) 카테고리별 요약
  const categorySummary: Record<
    string,
    { total: number; subTypes: Record<string, number> }
  > = {};
  for (const log of wrongLogs) {
    const cat = log.question?.learningCategory ?? "기타";
    const sub = log.question?.subType ?? "기타";
    if (!categorySummary[cat])
      categorySummary[cat] = { total: 0, subTypes: {} };
    categorySummary[cat].total += log.count;
    categorySummary[cat].subTypes[sub] =
      (categorySummary[cat].subTypes[sub] ?? 0) + log.count;
  }

  // 2) 지문별 오답 그룹화
  const passageMap = new Map<
    string,
    {
      passageId: string;
      passageTitle: string;
      wrongQuestions: {
        id: string;
        questionId: string;
        questionText: string;
        correctAnswer: string;
        givenAnswer: string;
        category: string;
        subType: string;
        count: number;
      }[];
    }
  >();

  for (const log of wrongLogs) {
    if (!log.question?.passageId) continue;
    const pid = log.question.passageId;
    if (!passageMap.has(pid)) {
      passageMap.set(pid, {
        passageId: pid,
        passageTitle: log.question.passage?.title ?? "알 수 없는 지문",
        wrongQuestions: [],
      });
    }

    const qText = extractQuestionText(
      log.question.subType,
      log.question.questionText
    );

    passageMap.get(pid)!.wrongQuestions.push({
      id: log.id,
      questionId: log.questionId,
      questionText: qText,
      correctAnswer: log.question.correctAnswer,
      givenAnswer: log.givenAnswer,
      category: log.question.learningCategory,
      subType: log.question.subType ?? "",
      count: log.count,
    });
  }

  const passageGroups = Array.from(passageMap.values()).sort(
    (a, b) => b.wrongQuestions.length - a.wrongQuestions.length
  );

  return {
    totalWrong: wrongLogs.length,
    categorySummary,
    passageGroups,
  };
}

// ---------------------------------------------------------------------------
// getPassageWrongDetail — 특정 지문의 오답 상세
// ---------------------------------------------------------------------------
export async function getPassageWrongDetail(passageId: string) {
  const session = await requireStudent();
  const studentId = session.studentId;

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: { id: true, title: true, content: true },
  });
  if (!passage) throw new Error("지문을 찾을 수 없습니다.");

  const wrongLogs = await prisma.naeshinWrongAnswerLog.findMany({
    where: { studentId, question: { passageId } },
    include: {
      question: {
        select: {
          id: true,
          learningCategory: true,
          subType: true,
          questionText: true,
          correctAnswer: true,
        },
      },
    },
    orderBy: { count: "desc" },
  });

  const byCategory: Record<
    string,
    {
      questions: {
        id: string;
        questionId: string;
        questionText: string;
        correctAnswer: string;
        givenAnswer: string;
        subType: string;
        count: number;
      }[];
    }
  > = {};

  for (const log of wrongLogs) {
    if (!log.question) continue;
    const cat = log.question.learningCategory || "기타";
    if (!byCategory[cat]) byCategory[cat] = { questions: [] };

    const qText = extractQuestionText(
      log.question.subType,
      log.question.questionText
    );

    byCategory[cat].questions.push({
      id: log.id,
      questionId: log.questionId,
      questionText: qText,
      correctAnswer: log.question.correctAnswer,
      givenAnswer: log.givenAnswer,
      subType: log.question.subType ?? "",
      count: log.count,
    });
  }

  return {
    passageId: passage.id,
    passageTitle: passage.title,
    totalWrong: wrongLogs.length,
    byCategory,
  };
}

// ---------------------------------------------------------------------------
// getReviewPassageList — 복습하기 페이지용 (시즌별 지문 + 오답 요약)
// ---------------------------------------------------------------------------
export async function getReviewPassageList() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { academyId: true },
  });
  if (!student) throw new Error("학생 정보를 찾을 수 없습니다.");

  const seasons = await prisma.studySeason.findMany({
    where: { academyId: student.academyId },
    orderBy: { startDate: "desc" },
    include: {
      passages: {
        include: { passage: { select: { id: true, title: true } } },
        orderBy: { order: "asc" },
      },
    },
  });

  const wrongLogs = await prisma.naeshinWrongAnswerLog.findMany({
    where: { studentId },
    include: {
      question: {
        select: { passageId: true, learningCategory: true, id: true },
      },
    },
  });

  const passageWrongMap = new Map<
    string,
    {
      total: number;
      categories: Record<string, number>;
      questionIds: string[];
    }
  >();

  for (const log of wrongLogs) {
    const pid = log.question?.passageId;
    if (!pid) continue;
    if (!passageWrongMap.has(pid)) {
      passageWrongMap.set(pid, {
        total: 0,
        categories: {},
        questionIds: [],
      });
    }
    const entry = passageWrongMap.get(pid)!;
    entry.total += log.count;
    const cat = log.question?.learningCategory ?? "기타";
    entry.categories[cat] = (entry.categories[cat] ?? 0) + log.count;
    entry.questionIds.push(log.questionId);
  }

  const result = seasons.map((season) => ({
    seasonId: season.id,
    seasonName: season.name,
    seasonType: season.type,
    passages: season.passages.map((sp) => {
      const wrong = passageWrongMap.get(sp.passage.id);
      return {
        passageId: sp.passage.id,
        passageTitle: sp.passage.title,
        wrongTotal: wrong?.total ?? 0,
        wrongCategories: wrong?.categories ?? {},
        wrongQuestionIds: wrong?.questionIds ?? [],
      };
    }),
  }));

  return result;
}
