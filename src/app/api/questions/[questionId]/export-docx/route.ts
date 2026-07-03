import { NextRequest, NextResponse } from "next/server";
import { Packer } from "docx";
import { getStaffSession } from "@/lib/auth";
import { logAppEvent } from "@/lib/app-events";
import {
  buildBuilderExamDocument,
  type BuilderSettings,
} from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import type { BuilderItemResolved } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/model";
import {
  loadSingleQuestionExport,
  buildSingleResolvedItem,
  SINGLE_QUESTION_BUILDER_SETTINGS,
} from "../_lib/load-single-question-export";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> },
) {
  try {
    const { questionId } = await params;
    const url = new URL(request.url);
    const includeAnswers = url.searchParams.get("answers") === "true";

    const staff = await getStaffSession().catch(() => null);
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const data = await loadSingleQuestionExport(questionId);
    // 존재하지 않거나(휴지통 포함) 다른 학원 문항이면 존재 여부를 숨기고 404.
    if (!data || data.academyId !== staff.academyId) {
      return NextResponse.json(
        { error: "문제를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const resolvedItem = buildSingleResolvedItem(
      data.examQuestion,
    ) as unknown as BuilderItemResolved;

    const doc = buildBuilderExamDocument({
      title: data.title,
      settings: SINGLE_QUESTION_BUILDER_SETTINGS as unknown as BuilderSettings,
      resolvedItems: [resolvedItem],
      includeAnswers,
      // 문항 하나 — 정답표(요약) 페이지 없음. 정답포함 모드는 문항 아래에 정답·해설 인라인.
      fullExamQuestions: [],
    });

    const buffer = await Packer.toBuffer(doc);

    await logAppEvent({
      academyId: data.academyId,
      actorType: "STAFF",
      actorId: staff.id ?? null,
      eventType: "QUESTION_EXPORT",
      resourceType: "QUESTION",
      resourceId: questionId,
      metadata: { format: "docx", includeAnswers },
    }).catch(() => {});

    const filename = encodeURIComponent(
      `${data.title}${includeAnswers ? "_정답포함" : ""}.docx`,
    );

    return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    console.error("[question export-docx] error:", error);
    return NextResponse.json(
      { error: "DOCX 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
