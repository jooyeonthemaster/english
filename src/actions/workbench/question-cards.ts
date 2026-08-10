"use server";

// ============================================================================
// 문항 카드 원본 조회 — id 목록으로 QuestionCard 렌더에 필요한 전부를 가져온다.
//
// 「오답 기반 변형」 흐름에서, 생성 워크스페이스가 "이 학생이 실제로 틀린 그 문항"을
// 문제 은행과 **똑같은 UI**(QuestionCard)로 보여주기 위한 조회다. 변형 시드
// (sessionStorage)에는 발문 요약·정답 표기 같은 텍스트만 실려 있어 카드 렌더에는
// 부족하고, 시드에 원본을 통째로 넣으면 세션 저장소가 비대해진다 — 그래서 화면이
// 필요할 때만 id 로 되짚어 온다.
//
// academyId 스코프 필수. 삭제(deletedAt)·타테넌트 문항은 결과에서 빠지며,
// 호출부는 "원본이 삭제됨"을 그 누락으로 판정한다(조용한 빈 화면 금지).
// ============================================================================

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** QuestionCardItem 과 같은 형태 — createdAt 만 직렬화 가능한 ISO 문자열이다 */
export interface QuestionCardRow {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  /** ISO — 클라이언트가 new Date() 로 되돌린다(서버 액션은 Date 를 그대로 넘기지 않는다) */
  createdAt: string;
  passage: {
    id: string;
    title: string;
    content: string;
    grade: number | null;
    semester: string | null;
    publisher: string | null;
  } | null;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  structuredData: unknown;
  setId: string | null;
}

export type QuestionCardsResult =
  | { success: true; data: QuestionCardRow[] }
  | { success: false; error: string };

/** 한 번에 가져올 상한 — 변형 시드는 최대 10문항이라 넉넉하다 */
const MAX_IDS = 30;

export async function getQuestionCardsByIds(
  questionIds: string[],
): Promise<QuestionCardsResult> {
  try {
    const staff = await getStaffSession();
    if (!staff) return { success: false, error: "로그인이 필요합니다." };

    const ids = [...new Set(questionIds)].filter(Boolean).slice(0, MAX_IDS);
    if (ids.length === 0) return { success: true, data: [] };

    const rows = await prisma.question.findMany({
      where: { id: { in: ids }, academyId: staff.academyId, deletedAt: null },
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
        passage: {
          select: {
            id: true,
            title: true,
            content: true,
            grade: true,
            semester: true,
            publisher: true,
          },
        },
        explanation: {
          select: {
            id: true,
            content: true,
            keyPoints: true,
            wrongOptionExplanations: true,
          },
        },
        // setId 는 비정규화 컬럼이라 조인 없이 바로 읽는다(schema.prisma:983)
        setId: true,
      },
    });

    const byId = new Map(rows.map((r) => [r.id, r]));
    // 요청 순서를 보존한다 — 호출부(오답 목록)의 문항 번호 순서가 곧 표시 순서다
    const data = ids.flatMap<QuestionCardRow>((id) => {
      const r = byId.get(id);
      if (!r) return [];
      return [
        {
          id: r.id,
          type: r.type,
          subType: r.subType,
          questionText: r.questionText,
          options: r.options,
          correctAnswer: r.correctAnswer,
          difficulty: r.difficulty,
          tags: r.tags,
          aiGenerated: r.aiGenerated,
          approved: r.approved,
          createdAt: r.createdAt.toISOString(),
          passage: r.passage
            ? {
                id: r.passage.id,
                title: r.passage.title,
                content: r.passage.content,
                grade: r.passage.grade ?? null,
                semester: r.passage.semester ?? null,
                publisher: r.passage.publisher ?? null,
              }
            : null,
          explanation: r.explanation
            ? {
                id: r.explanation.id,
                content: r.explanation.content,
                keyPoints: r.explanation.keyPoints ?? null,
                wrongOptionExplanations: r.explanation.wrongOptionExplanations ?? null,
              }
            : null,
          structuredData: r.structuredData,
          setId: r.setId ?? null,
        },
      ];
    });

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "문항을 불러오지 못했습니다.",
    };
  }
}
