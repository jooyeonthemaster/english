// ============================================================================
// POST /api/exam-report/analyses/[id]/source-urls
//   구조검수 '원본 보기' 뷰어용 — 해당 분석의 sourceFiles 경로에 한해 서명
//   다운로드 URL 을 배치 발급한다. 요청 경로가 분석의 sourceFiles 에 없으면
//   거부(임의 스토리지 키 서명 방지).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { createSignedDownloadUrl } from "@/lib/supabase-storage";
import { isExamReportPagePath } from "@/lib/exam-report/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(40),
});

const sourceFilesSchema = z.array(
  z.object({ path: z.string(), page: z.number().optional() }),
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "잘못된 요청입니다.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const analysis = await prisma.examAnalysis.findFirst({
    where: { id, academyId: auth.academyId, deletedAt: null },
    select: { sourceFiles: true },
  });
  if (!analysis) {
    return NextResponse.json(
      { error: "시험 분석을 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 심층 방어: sourceFiles 화이트리스트 + 정확 경로 정규식 이중 검증.
  // structure 라우트와 '동일한' 앵커드 정규식으로 재검증한다(startsWith 프리픽스는
  // '{prefix}../..' 로 우회 가능). 과거 오염 데이터·우회 경로가 있어도 여기서 차단한다.
  const sourceFiles = sourceFilesSchema.safeParse(analysis.sourceFiles);
  const allowed = new Set(
    sourceFiles.success ? sourceFiles.data.map((f) => f.path) : [],
  );
  const invalid = parsedBody.data.paths.filter(
    (p) => !allowed.has(p) || !isExamReportPagePath(p, auth.academyId, id),
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "허용되지 않은 경로입니다.", code: "FORBIDDEN_PATH" },
      { status: 403 },
    );
  }

  const urls = await Promise.all(
    parsedBody.data.paths.map((p) => createSignedDownloadUrl(p, 60 * 30)),
  );
  return NextResponse.json({ urls });
}
