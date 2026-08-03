// 단어 훈련 큐 — 모드별 문항 편성(정답 미포함 페이로드).
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { buildVocabQueue } from "@/lib/vocab-drill/queue";
import type { VocabDrillMode } from "@/lib/vocab-drill/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = new Set<VocabDrillMode>([
  "learn",
  "drill",
  "context",
  "test",
  "review",
  "weak",
  "assignment",
]);

export async function GET(req: NextRequest) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") as VocabDrillMode | null;
  if (!mode || !MODES.has(mode)) {
    return NextResponse.json({ ok: false, error: "BAD_MODE" }, { status: 400 });
  }
  const queue = await buildVocabQueue(
    { studentId: session.studentId, academyId: session.academyId },
    mode,
    {
      deckId: sp.get("deckId") ?? undefined,
      assignmentId: sp.get("assignmentId") ?? undefined,
    },
  );
  if (!queue) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, queue });
}
