// ============================================================================
// 정오표 문항 원본 리뷰 로더 — AI 0콜, INTERNAL 시험지 전용
//
// analysisId → ExamAnalysis(sourceType/sourceExamId) 해소 → sourceExamId 의
// Exam → ExamQuestion(orderNum) → Question(+passage+explanation+세트지문) 를
// academy 스코프로 배치 재조회해, number(=String(orderNum)) 키 맵을 만든다.
//
// 계약:
//  - 아카데미 안전: ExamAnalysis 를 {id,academyId,deletedAt:null} 로 먼저 가드하고,
//    Exam 도 {id:sourceExamId,academyId} 로 재가드한다(analysis-boost 라우트 미러).
//    타테넌트는 404(호출부가 null → 404 통일). ExamQuestion 엔 academyId 컬럼이
//    없어 부모 Exam.academyId 로 스코프한다.
//  - INTERNAL 만 원본 재사용 가능. 비INTERNAL(사진 업로드 등)은 원본을 저장하지
//    않으므로 detailAvailable:false 로 강등한다(상세보기는 분석/brief 만).
//  - 세트 문항(setId, passageId=null)은 공유지문이 QuestionSet.basePassage 에
//    귀속되므로 setItem→set.basePassage 로 폴백 해소한다(getWorkbenchQuestion 미러).
//  - 살아있는 문항만(question.deletedAt=null) — structure/responses 와 축 정합.
//  - N+1 금지: examQuestion 을 include 로 1회 배치 조회한다.
// ============================================================================

import { prisma } from "@/lib/prisma";
import type {
  ExamReviewPayload,
  ExamReviewPassage,
  ExamReviewQuestion,
} from "@/components/exam-report/ui-contracts";

/** 지문 최소 투영(직접 지문/세트 기반지문 공용). */
const PASSAGE_SELECT = {
  id: true,
  title: true,
  content: true,
  grade: true,
  semester: true,
  publisher: true,
} as const;

function toReviewPassage(
  passage: {
    id: string;
    title: string;
    content: string;
    grade: number | null;
    semester: string | null;
    publisher: string | null;
  } | null,
): ExamReviewPassage | null {
  if (!passage) return null;
  return {
    id: passage.id,
    title: passage.title,
    content: passage.content,
    grade: passage.grade,
    semester: passage.semester,
    publisher: passage.publisher,
  };
}

/**
 * analysisId 의 INTERNAL 원본 문항들을 academy 스코프로 배치 조회한다.
 * @returns 페이로드. 분석이 없거나 타테넌트면 null(호출부가 404).
 */
export async function loadExamReviewQuestions(opts: {
  analysisId: string;
  academyId: string;
}): Promise<ExamReviewPayload | null> {
  const analysis = await prisma.examAnalysis.findFirst({
    where: { id: opts.analysisId, academyId: opts.academyId, deletedAt: null },
    select: { sourceType: true, sourceExamId: true },
  });
  if (!analysis) return null; // 존재하지 않거나 타테넌트 → 404 통일

  // INTERNAL(서비스 생성 시험지)만 원본 재사용. 그 외는 원본 미저장 → 강등.
  if (analysis.sourceType !== "INTERNAL" || !analysis.sourceExamId) {
    return { source: "OTHER", detailAvailable: false, items: {} };
  }

  const exam = await prisma.exam.findFirst({
    // sourceExamId 를 academyId 로 재가드(교차 학원 오염 차단).
    where: { id: analysis.sourceExamId, academyId: opts.academyId },
    select: {
      questions: {
        orderBy: { orderNum: "asc" },
        select: {
          orderNum: true,
          points: true,
          question: {
            select: {
              id: true,
              type: true,
              subType: true,
              questionText: true,
              options: true,
              correctAnswer: true,
              difficulty: true,
              tags: true,
              aiGenerated: true,
              approved: true,
              createdAt: true,
              structuredData: true,
              deletedAt: true,
              passageId: true,
              passage: { select: PASSAGE_SELECT },
              setId: true,
              // 세트 문항 공유지문 폴백(직접 passageId 가 없을 때).
              setItem: {
                select: {
                  set: {
                    select: {
                      setLabel: true,
                      basePassage: { select: PASSAGE_SELECT },
                    },
                  },
                },
              },
              explanation: {
                select: {
                  content: true,
                  keyPoints: true,
                  wrongOptionExplanations: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // 원본 Exam 이 삭제/링크 해제됨 — INTERNAL 이지만 재조회 불가 → 강등.
  if (!exam) return { source: "INTERNAL", detailAvailable: false, items: {} };

  const items: Record<string, ExamReviewQuestion> = {};
  for (const link of exam.questions) {
    const q = link.question;
    if (q.deletedAt != null) continue; // 휴지통 문항 제외(축 정합)

    const setInfo = q.setItem?.set ?? null;
    // 직접 지문 우선, 없으면 세트 기반지문으로 폴백.
    const passage = toReviewPassage(q.passage ?? setInfo?.basePassage ?? null);

    items[String(link.orderNum)] = {
      number: String(link.orderNum),
      questionId: q.id,
      type: q.type,
      subType: q.subType,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      difficulty: q.difficulty,
      tags: q.tags,
      aiGenerated: q.aiGenerated,
      approved: q.approved,
      createdAt: q.createdAt.toISOString(),
      structuredData: q.structuredData ?? null,
      passageId: q.passageId ?? passage?.id ?? null,
      passage,
      explanation: q.explanation ?? null,
      setId: q.setId ?? null,
      setLabel: setInfo?.setLabel ?? null,
    };
  }

  return {
    source: "INTERNAL",
    detailAvailable: Object.keys(items).length > 0,
    items,
  };
}
