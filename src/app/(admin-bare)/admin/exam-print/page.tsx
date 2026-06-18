// ============================================================================
// /admin/exam-print — 어드민 시험지 보기·인쇄 페이지 (사이드바 없는 단독 화면).
// ?examId=...  또는  ?ids=q1,q2,...  + &title=...&answers=1
// 미들웨어가 /admin/* 를 어드민 세션으로 보호하고, 여기서 SUPER_ADMIN 재확인.
// ============================================================================

import { notFound } from "next/navigation";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { prisma } from "@/lib/prisma";
import {
  ExamPrintView,
  type PrintQuestion,
} from "@/components/admin/exam-print-view";

export const dynamic = "force-dynamic";

function parseOptions(
  raw: string | null,
): Array<{ label: string; text: string }> | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.map((o, i) => ({
      label: String(o?.label ?? `${i + 1}`),
      text: String(o?.text ?? o ?? ""),
    }));
  } catch {
    return null;
  }
}

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

  let questionIds: string[] = [];
  if (examId) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: {
        title: true,
        questions: {
          orderBy: { orderNum: "asc" },
          select: { questionId: true },
        },
      },
    });
    if (!exam) notFound();
    questionIds = exam.questions.map((q) => q.questionId);
    if (!sp.title) title = exam.title.slice(0, 120);
  } else if (idsParam) {
    questionIds = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
  }

  const rows = questionIds.length
    ? await prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: {
          id: true,
          questionNumber: true,
          questionText: true,
          options: true,
          correctAnswer: true,
          passage: { select: { title: true, content: true } },
        },
      })
    : [];

  const byId = new Map(rows.map((q) => [q.id, q]));
  const ordered = questionIds
    .map((id) => byId.get(id))
    .filter((q): q is (typeof rows)[number] => Boolean(q));

  const questions: PrintQuestion[] = ordered.map((q) => ({
    id: q.id,
    number: q.questionNumber,
    questionText: q.questionText,
    options: parseOptions(q.options),
    correctAnswer: q.correctAnswer,
    passage: q.passage
      ? { title: q.passage.title, content: q.passage.content }
      : null,
  }));

  return (
    <ExamPrintView
      title={title}
      initialAnswers={initialAnswers}
      questions={questions}
      docxUrl={examId ? { examId } : { questionIds }}
    />
  );
}
