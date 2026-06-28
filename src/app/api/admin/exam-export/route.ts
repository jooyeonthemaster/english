// ============================================================================
// 관리자 시험지 만들기 — 선택한 문항으로 시험지 DOCX를 즉석 생성한다.
// 활동/콘텐츠 뷰어에서 다른 선생님이 만든 문제를 골라 우리가 직접 시험지로
// 뽑아 인쇄/검토하는 용도. 기존 시험지 DOCX 빌더(buildExamDocument)를 그대로
// 재사용하며, 별도 Exam 레코드를 만들지 않는다(학원 데이터 비오염).
// PII/콘텐츠 접근이므로 SUPER_ADMIN 전용.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Packer } from "docx";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { buildExamDocument } from "@/app/api/exams/[examId]/export-docx/_lib/build-document";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    questionIds?: unknown;
    examId?: unknown;
    title?: unknown;
    includeAnswers?: unknown;
  } | null;

  const includeAnswers = body?.includeAnswers === true;
  let title =
    typeof body?.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : "시험지";

  // 기존 시험지(examId)면 그 시험지의 문항을 순서대로 사용한다.
  let questionIds: string[] = [];
  if (typeof body?.examId === "string" && body.examId) {
    const exam = await prisma.exam.findUnique({
      where: { id: body.examId },
      select: {
        title: true,
        questions: {
          orderBy: { orderNum: "asc" },
          select: { questionId: true },
        },
      },
    });
    if (!exam) {
      return NextResponse.json({ error: "시험지를 찾을 수 없습니다" }, { status: 404 });
    }
    questionIds = exam.questions.map((q) => q.questionId);
    if (!body?.title) title = exam.title.slice(0, 120);
  } else if (Array.isArray(body?.questionIds)) {
    questionIds = (body.questionIds.filter((x) => typeof x === "string") as string[]).slice(0, 200);
  }

  if (questionIds.length === 0) {
    return NextResponse.json({ error: "문항을 선택하세요" }, { status: 400 });
  }

  const rows = await prisma.question.findMany({
    where: { id: { in: questionIds }, deletedAt: null },
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

  // 선택한 순서 보존
  const byId = new Map(rows.map((q) => [q.id, q]));
  const ordered = questionIds
    .map((id) => byId.get(id))
    .filter((q): q is (typeof rows)[number] => Boolean(q));

  if (ordered.length === 0) {
    return NextResponse.json({ error: "문항을 찾을 수 없습니다" }, { status: 404 });
  }

  const examQuestions: ExamQuestionData[] = ordered.map((q, i) => ({
    orderNum: i + 1,
    points: q.points,
    question: {
      id: q.id,
      type: q.type,
      subType: q.subType,
      questionText: q.questionText,
      structuredData: q.structuredData,
      options: q.options,
      correctAnswer: q.correctAnswer,
      difficulty: q.difficulty,
      passage: q.passage
        ? { title: q.passage.title, content: q.passage.content }
        : null,
      explanation: q.explanation
        ? {
            content: q.explanation.content,
            keyPoints: q.explanation.keyPoints,
            wrongOptionExplanations: q.explanation.wrongOptionExplanations,
          }
        : null,
    },
  }));

  const doc = buildExamDocument(title, examQuestions, includeAnswers);
  const buffer = await Packer.toBuffer(doc);
  const filename = encodeURIComponent(
    `${title}${includeAnswers ? "_정답포함" : ""}.docx`,
  );

  return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
