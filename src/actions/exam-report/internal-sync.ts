"use server";

// ============================================================================
// 스모트 시험지 → INTERNAL 분석 행 **무과금 보장** 서버액션 (26-09-04)
//
// 왜 생겼나(사용자 지적): 「분석 전」과 「심층 분석 전」이 서로 다른 카드·다른
// 레일(총평 탭 유무)로 갈렸는데, 두 상태의 실제 차이는 **ExamAnalysis 행이
// 있냐 없냐** 하나뿐이었다. 그런데 그 행을 만드는 일(syncInternalAnalysisForExam)
// 은 출제할 때 저장해 둔 해설(Question.explanation)을 옮겨 적는 게 전부다 —
// **AI 0콜·크레딧 0·멱등**. 즉 사용자에게 의미 있는 상태 구분이 아니라 순전히
// "아직 그 복사를 안 했다"는 내부 사정이었다.
//
// 종전엔 그 복사가 ① 답안 링크 발급 ② **유료** 심층 분석 시작 ③ 학생 제출 채점
// 3곳에서만 돌았다 — 「그냥 열어 보기」 경로가 없어서 열면 오른쪽이 2탭짜리
// 후보 화면이었다. 이 액션이 그 네 번째(무료) 경로다: 시험지를 열면 그 자리에서
// 행을 만들어 후보를 소멸시킨다.
//
// 계약:
//  - 멱등 — 이미 행이 있으면 그 행 id 를 돌려준다(중복 생성 없음).
//  - 무과금·AI 0콜 — 크레딧 경로를 타지 않는다(과금은 심층 분석 라우트 소관).
//  - 소유 가드 — examId 가 이 학원 것이 아니면 throw.
//  - **호출부는 실패를 삼켜도 된다**: 실패해도 후보 화면이 그대로 뜬다(무회귀).
//    그래서 「만들 수 없는 시험지」는 throw 가 아니라 null 로 강등한다.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { syncInternalAnalysisForExam } from "@/lib/exam-scoring/report-bridge";
import { requireAuth } from "./_helpers";

/**
 * examId 의 INTERNAL ExamAnalysis 행을 보장한다(없으면 만든다). AI 0콜·무과금·멱등.
 *
 * null 을 돌려주는 경우(전부 「후보 목록에 애초에 오르지 않는 시험지」와 같은 조건 —
 * api/exam-report/analyses/route.ts loadCandidates 와 규칙을 맞춘다):
 *  - 배포 기능 플래그 off (후보 자체가 내려가지 않는다)
 *  - 보관함(ARCHIVED) 시험지 (심층 분석 라우트도 EXAM_ARCHIVED 로 거부)
 *  - 국어 시험지 (report-bridge 가 미지원 — throw 대신 강등)
 *  - 살아있는 문항 0개 (합성할 것이 없다)
 */
export async function ensureInternalAnalysisForExam(
  examId: string,
): Promise<{ analysisId: string } | null> {
  const staff = await requireAuth();
  if (!FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT) return null;

  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: staff.academyId },
    select: {
      id: true,
      status: true,
      subject: true,
      _count: { select: { questions: { where: { question: { deletedAt: null } } } } },
    },
  });
  if (!exam) throw new Error("시험지를 찾을 수 없습니다.");
  if (exam.status === "ARCHIVED") return null;
  if (exam.subject === "KOREAN") return null;
  if (exam._count.questions === 0) return null;

  // 이미 있으면 그 행(멱등) — sync 도 멱등이지만 존재 확인이 훨씬 싸다.
  const existing = await prisma.examAnalysis.findFirst({
    where: {
      sourceExamId: examId,
      sourceType: "INTERNAL",
      academyId: staff.academyId,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return { analysisId: existing.id };

  return syncInternalAnalysisForExam(examId);
}
