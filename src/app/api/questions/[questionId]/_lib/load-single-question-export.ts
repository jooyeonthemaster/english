import { prisma } from "@/lib/prisma";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
import { examQuestionToPaperItem } from "@/components/exams/paper-builder/saved-paper-items";
import { toPaperExportItem } from "@/components/exams/paper-builder/paper-export-items";

// 단일 문항 다운로드(HWPX/DOCX)용 로더 — 시험지 생성의 문서 빌더를 그대로 재사용하기 위해
// 한 문항을 최소 exam 형태(orderNum=1)로 감싸 반환한다. 두 라우트(docx/hwpx)가 공유한다.
export interface SingleQuestionExport {
  title: string;
  academyId: string;
  examQuestion: SingleExportExamQuestion;
}

/**
 * 단일 문항 입력 — ExamQuestionData 에 세트 소속(setId)을 더한 모양. 세트 멤버(영어·국어·기출)는
 * 멤버 본문에 지문이 없고 공유 지문 박스(buildGroups)가 지문을 그리므로, 세트 판정이 빠지면 지문이 사라진다.
 */
export type SingleExportExamQuestion = ExamQuestionData & {
  question: ExamQuestionData["question"] & { setId?: string | null };
};

/**
 * @param academyId 요청한 스태프 세션의 학원. 주면 where 에 걸어 남의 학원 문항은 본문·해설을 아예 읽지
 *   않는다(방어 심화 — 라우트의 `data.academyId !== staff.academyId → 404` 비교와 이중). 빈 문자열이면
 *   어떤 문항과도 맞지 않아 null(실패는 닫힌 쪽). 두 다운로드 라우트(export-docx·export-hwpx)는 항상 넘긴다.
 *   생략은 SELECT 전용 감사 스크립트용이다.
 */
export async function loadSingleQuestionExport(
  questionId: string,
  academyId?: string,
): Promise<SingleQuestionExport | null> {
  const question = await prisma.question.findFirst({
    // 휴지통(soft delete) 가드 — 삭제된 문제는 출력물에 절대 포함 금지.
    where: { id: questionId, deletedAt: null, ...(academyId !== undefined ? { academyId } : {}) },
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

  const examQuestion: SingleExportExamQuestion = {
    orderNum: 1,
    points: question.points ?? 1,
    question: {
      id: question.id,
      type: question.type,
      subType: question.subType,
      questionText,
      structuredData: question.structuredData,
      setId: question.setId ?? null,
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
//
// 「무엇을 찍을지」는 시험지 settings NULL 경로와 같은 공용 규칙이다(examQuestionToPaperItem — docs/EXAM-PAPER-MODEL.md §2
// 「기본값」·「강제 목록」: 저장값 없음 → makePaperItem 기본값 + 인쇄 강제 규칙). 예전의 `includePassage: true` 고정은 빈칸·순서·삽입
// 같은 내장 지문 유형에 원문을 한 번 더 찍어 정답을 노출했고, 조건영작·문장전환에 정답이 든 원문을 실었다(P12).
// 발문 정규화·선지 정본화·주관식 답란(4줄)·정답 표기도 웹과 같다. paperItem 은 HWPX 조판(buildGroups)이 쓴다.
export function buildSingleResolvedItem(examQuestion: SingleExportExamQuestion | ExamQuestionData) {
  const paperItem = examQuestionToPaperItem(examQuestion, 1);
  const exported = toPaperExportItem(paperItem);
  if (!exported) throw new Error("single question export: not a question item");
  return { ...exported, paperItem };
}

// 단일 문항 다운로드는 항상 1단(전체 폭)·정답표 없음(문항 하나이므로 요약표 불필요).
// docx/hwpx 빌더 모두 layout.columns=1 + fullExamQuestions=[] 로 이 동작을 얻는다.
export const SINGLE_QUESTION_BUILDER_SETTINGS = {
  source: "exam-paper-builder-v2",
  items: [],
  layout: { columns: 1 as const },
};
