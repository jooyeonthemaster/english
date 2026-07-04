import { prisma } from "@/lib/prisma";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";

// 단일 문항 다운로드(HWPX/DOCX)용 로더 — 시험지 빌더의 문서 빌더를 그대로 재사용하기 위해
// 한 문항을 최소 exam 형태(orderNum=1)로 감싸 반환한다. 두 라우트(docx/hwpx)가 공유한다.
export interface SingleQuestionExport {
  title: string;
  academyId: string;
  examQuestion: ExamQuestionData;
}

export async function loadSingleQuestionExport(
  questionId: string,
): Promise<SingleQuestionExport | null> {
  const question = await prisma.question.findFirst({
    // 휴지통(soft delete) 가드 — 삭제된 문제는 출력물에 절대 포함 금지.
    where: { id: questionId, deletedAt: null },
    include: {
      passage: { select: { title: true, content: true } },
      explanation: {
        select: {
          content: true,
          keyPoints: true,
          wrongOptionExplanations: true,
        },
      },
    },
  });
  if (!question) return null;

  const questionText = repairGrammarCorrectionQuestionText({
    subType: question.subType,
    questionText: question.questionText,
    structuredData: question.structuredData,
  });

  const examQuestion: ExamQuestionData = {
    orderNum: 1,
    points: question.points ?? 1,
    question: {
      id: question.id,
      type: question.type,
      subType: question.subType,
      questionText,
      structuredData: question.structuredData,
      options: question.options,
      correctAnswer: question.correctAnswer,
      difficulty: question.difficulty,
      passage: question.passage
        ? { title: question.passage.title, content: question.passage.content }
        : null,
      explanation: question.explanation
        ? {
            content: question.explanation.content ?? "",
            keyPoints: question.explanation.keyPoints ?? null,
            wrongOptionExplanations:
              question.explanation.wrongOptionExplanations ?? null,
          }
        : null,
    },
  };

  // 문서 제목/파일명 — 지문 제목(AI 모델 노출 문구 제거)이 있으면 사용, 없으면 "문항".
  const title =
    sanitizeAiModelDisclosureText(question.passage?.title || "").trim() || "문항";

  return { title, academyId: question.academyId, examQuestion };
}

// examQuestion → 문서 빌더가 요구하는 resolvedItem(단일 문항). docx/hwpx BuilderItemResolved
// 는 구조적으로 동일하므로 각 라우트에서 자기 타입으로 캐스팅해 사용한다.
export function buildSingleResolvedItem(examQuestion: ExamQuestionData) {
  return {
    questionId: examQuestion.question.id,
    orderNum: 1,
    points: examQuestion.points,
    questionText: examQuestion.question.questionText,
    // 지문은 정책(shouldRenderSourcePassageInsideQuestion/shouldForceSourcePassage)에 따라
    // 문항 안/밖으로 자동 분기된다. true 로 두면 "지문이 있으면 동봉".
    includePassage: true,
    blockFontPt: null,
    blockBold: false,
    blockItalic: false,
    blockAlign: "left" as const,
    sourceQuestion: examQuestion.question,
  };
}

// 단일 문항 다운로드는 항상 1단(전체 폭)·정답표 없음(문항 하나이므로 요약표 불필요).
// docx/hwpx 빌더 모두 layout.columns=1 + fullExamQuestions=[] 로 이 동작을 얻는다.
export const SINGLE_QUESTION_BUILDER_SETTINGS = {
  source: "exam-paper-builder-v2",
  items: [],
  layout: { columns: 1 as const },
};
