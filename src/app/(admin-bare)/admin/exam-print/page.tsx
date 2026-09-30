// ============================================================================
// /admin/exam-print — 어드민 시험지 보기·인쇄 페이지 (사이드바 없는 단독 화면).
// ?examId=...  또는  ?ids=q1,q2,...  + &title=...&answers=1
// 미들웨어가 /admin/* 를 어드민 세션으로 보호하고, 여기서 SUPER_ADMIN 재확인.
//
// 「무엇을 찍을지」는 학원 화면과 같은 공용 정본(buildAdminPrintModel → buildPaperItemsFromExam)이 정한다
// (26-09-30 COH-2 b): examId 면 그 시험지의 저장 settings, 문항 목록이면 settings 없음(새로 담은 문항과 같은 규칙).
// 문항 로드는 DOCX 내보내기 라우트와 같다(휴지통 제외 · 지문 제목·본문 · 해설 3필드). 읽기만 한다.
// ============================================================================

import { notFound } from "next/navigation";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { prisma } from "@/lib/prisma";
import { ExamPrintView } from "@/components/admin/exam-print-view";
import { buildAdminPrintModel } from "@/components/admin/exam-print-model";
import {
  parseSavedPaperSettings,
  type SavedPaperExamQuestion,
  type SavedPaperSettings,
} from "@/components/exams/paper-builder/saved-paper-items";

export const dynamic = "force-dynamic";

const QUESTION_INCLUDE = {
  passage: { select: { title: true, content: true } },
  explanation: {
    select: { content: true, keyPoints: true, wrongOptionExplanations: true },
  },
} as const;

export default async function ExamPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) notFound();

  const sp = await searchParams;
  const examId = typeof sp.examId === "string" ? sp.examId : null;
  const idsParam = typeof sp.ids === "string" ? sp.ids : null;
  const initialAnswers = sp.answers === "1";
  let title =
    typeof sp.title === "string" && sp.title.trim()
      ? sp.title.trim().slice(0, 120)
      : "시험지";

  let examQuestions: SavedPaperExamQuestion[] = [];
  let settings: SavedPaperSettings | null = null;
  let questionIds: string[] = [];
  if (examId) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: {
        title: true,
        settings: true,
        questions: {
          where: { question: { deletedAt: null } },
          orderBy: { orderNum: "asc" },
          include: { question: { include: QUESTION_INCLUDE } },
        },
      },
    });
    if (!exam) notFound();
    examQuestions = exam.questions;
    settings = parseSavedPaperSettings(exam.settings);
    if (!sp.title) title = exam.title.slice(0, 120);
  } else if (idsParam) {
    questionIds = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    const rows = questionIds.length
      ? await prisma.question.findMany({
          where: { id: { in: questionIds }, deletedAt: null },
          include: QUESTION_INCLUDE,
        })
      : [];
    const byId = new Map(rows.map((q) => [q.id, q]));
    examQuestions = questionIds
      .map((id) => byId.get(id))
      .filter((q): q is (typeof rows)[number] => Boolean(q))
      .map((question, i) => ({ orderNum: i + 1, points: question.points, question }));
  }

  const model = buildAdminPrintModel(examQuestions, settings);

  return (
    <ExamPrintView
      title={title}
      initialAnswers={initialAnswers}
      groups={model.groups}
      questionCount={model.questionCount}
      docxUrl={examId ? { examId } : { questionIds }}
    />
  );
}
