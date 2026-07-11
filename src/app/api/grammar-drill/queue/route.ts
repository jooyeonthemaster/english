// 어법 드릴 큐 — 모드별 문항 편성(정답 미포함 페이로드).
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { buildQueue } from "@/lib/grammar-drill/engine";
import type { DrillMode } from "@/lib/grammar-drill/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = new Set<DrillMode>([
  "drill",
  "concept_check",
  "reading",
  "written",
  "test",
  "review",
  "smart",
  "mixed",
  "assignment",
]);

export async function GET(req: NextRequest) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") as DrillMode | null;
  if (!mode || !MODES.has(mode)) {
    return NextResponse.json({ ok: false, error: "BAD_MODE" }, { status: 400 });
  }
  const queue = await buildQueue(
    { studentId: session.studentId, academyId: session.academyId },
    mode,
    {
      unitId: sp.get("unitId") ?? undefined,
      conceptId: sp.get("conceptId") ?? undefined,
      setId: sp.get("setId") ?? undefined,
      assignmentId: sp.get("assignmentId") ?? undefined,
    },
  );
  if (!queue) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, queue });
}
