// ============================================================================
// 관리자 시험지 만들기 — 선택한 문항(또는 기존 시험지)으로 시험지 DOCX를 즉석 생성한다.
// 활동/콘텐츠 뷰어에서 다른 선생님이 만든 문제를 골라 우리가 직접 시험지로
// 뽑아 인쇄/검토하는 용도. 별도 Exam 레코드를 만들지 않고, 인쇄 횟수·이벤트도 남기지 않는다(학원 데이터 비오염).
// PII/콘텐츠 접근이므로 SUPER_ADMIN 전용.
//
// 「무엇을 찍을지」는 학원 화면의 DOCX 내보내기(export-docx 라우트)와 같은 공용 정본이 정한다(26-09-30 COH-2):
//   buildExamDocxDocument(title, examQuestions, settings)
//     → buildPaperItemsFromExam(공용 PaperItem — includePassage 우선순위·지문 원천 스냅숏→DB→보관본)
//     → buildGroups / toPaperExportItem / resolvePaperLayout / answerKeyEntries
//   · examId 가 오면 그 시험지의 저장 settings(순서·편집 발문·지문 끄기·레이아웃)를 그대로 쓴다
//     = 그 학원이 받는 DOCX 와 같은 문서다.
//   · 문항 id 목록이면 settings 없음(NULL) — 새로 담은 문항과 같은 기본 규칙(정답 노출형 지문 미동봉 등).
// 예전에는 레거시 buildExamDocument 로 settings·_sourcePassage 를 무시하고 옛 지문 규칙
// (조건 영작·문장 전환에도 원문 지문 동봉 = 정답 노출)을 썼다.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Packer } from "docx";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { buildExamDocxDocument } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/assemble";
import {
  parseSavedPaperSettings,
  type SavedPaperExamQuestion,
  type SavedPaperSettings,
} from "@/components/exams/paper-builder/saved-paper-items";
import { toEmbeddableImageDataUrl } from "@/lib/server-image";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

/** 시험지 DOCX 라우트와 같은 문항 include(지문 제목·본문, 해설 3필드). */
const QUESTION_INCLUDE = {
  passage: { select: { title: true, content: true } },
  explanation: {
    select: {
      content: true,
      keyPoints: true,
      wrongOptionExplanations: true,
    },
  },
} as const;

/** Word 가 임베드 못 하는 이미지(webp 등)를 PNG 로 — export-docx 라우트와 같은 제자리 변환. */
async function embedImagesInPlace(settings: SavedPaperSettings): Promise<void> {
  if (Array.isArray(settings.blocks)) {
    await Promise.all(
      settings.blocks.map(async (b) => {
        if (b.blockType === "image" && b.imageDataUrl) {
          b.imageDataUrl = await toEmbeddableImageDataUrl(b.imageDataUrl);
        }
      }),
    );
  }
  if (settings.header?.academyLogoDataUrl) {
    settings.header.academyLogoDataUrl = await toEmbeddableImageDataUrl(settings.header.academyLogoDataUrl);
  }
}

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

  let examQuestions: SavedPaperExamQuestion[] = [];
  let settings: SavedPaperSettings | null = null;

  if (typeof body?.examId === "string" && body.examId) {
    // 기존 시험지 — 학원 DOCX 내보내기와 같은 로드(휴지통 문항 제외 · 시험지 순서) + 저장 settings.
    const exam = await prisma.exam.findUnique({
      where: { id: body.examId },
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
    if (!exam) {
      return NextResponse.json({ error: "시험지를 찾을 수 없습니다" }, { status: 404 });
    }
    examQuestions = exam.questions;
    settings = parseSavedPaperSettings(exam.settings);
    if (!body?.title) title = exam.title.slice(0, 120);
  } else {
    // 문항 목록 — settings 없는 시험지와 같은 기본 규칙. 선택한 순서를 보존한다.
    const questionIds = Array.isArray(body?.questionIds)
      ? (body.questionIds.filter((x) => typeof x === "string") as string[]).slice(0, 200)
      : [];
    if (questionIds.length === 0) {
      return NextResponse.json({ error: "문항을 선택하세요" }, { status: 400 });
    }
    const rows = await prisma.question.findMany({
      where: { id: { in: questionIds }, deletedAt: null },
      include: QUESTION_INCLUDE,
    });
    const byId = new Map(rows.map((q) => [q.id, q]));
    examQuestions = questionIds
      .map((id) => byId.get(id))
      .filter((q): q is (typeof rows)[number] => Boolean(q))
      .map((question, i) => ({ orderNum: i + 1, points: question.points, question }));
  }

  if (examQuestions.length === 0) {
    return NextResponse.json({ error: "문항을 찾을 수 없습니다" }, { status: 404 });
  }

  if (settings) await embedImagesInPlace(settings);
  const doc = buildExamDocxDocument({ title, examQuestions, settings, includeAnswers });
  const buffer = await Packer.toBuffer(doc);
  const filename = encodeURIComponent(
    `${title}${includeAnswers ? "_정답포함" : ""}.docx`,
  );

  return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
