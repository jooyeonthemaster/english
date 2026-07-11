// 어법 드릴 제출 — 서버 채점 + 원장 기록 + 숙달도/단계 갱신 + 해설 반환.
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { processSubmission } from "@/lib/grammar-drill/engine";
import type { SubmitBody } from "@/lib/grammar-drill/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }
  if (!body.itemId || typeof body.answer !== "string") {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }
  const verdict = await processSubmission(session.studentId, session.academyId, {
    itemId: String(body.itemId),
    answer: String(body.answer),
    timeMs: Number(body.timeMs) || 0,
    hintUsed: ([0, 1, 2].includes(Number(body.hintUsed)) ? Number(body.hintUsed) : 0) as 0 | 1 | 2,
    conceptPeeked: Boolean(body.conceptPeeked),
    source: String(body.source ?? "DRILL"),
    assignmentId: body.assignmentId ? String(body.assignmentId) : undefined,
  });
  if (!verdict) {
    return NextResponse.json({ ok: false, error: "ITEM_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, verdict });
}
