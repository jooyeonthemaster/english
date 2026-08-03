// 단어 훈련 제출 — 서버 채점 + 원장 기록(clientKey 멱등) + 숙달도/스텟 갱신.
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { processVocabSubmission } from "@/lib/vocab-drill/engine";
import type { VocabSubmitBody } from "@/lib/vocab-drill/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  let body: VocabSubmitBody;
  try {
    body = (await req.json()) as VocabSubmitBody;
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }
  if (!body.senseId || !body.itemType || typeof body.answer !== "string") {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }
  const verdict = await processVocabSubmission(session.studentId, session.academyId, {
    senseId: String(body.senseId),
    itemType: body.itemType,
    answer: String(body.answer),
    timeMs: Number(body.timeMs) || 0,
    hintUsed: ([0, 1, 2].includes(Number(body.hintUsed)) ? Number(body.hintUsed) : 0) as 0 | 1 | 2,
    source: String(body.source ?? "DRILL"),
    deckId: body.deckId ? String(body.deckId) : undefined,
    exampleId: body.exampleId ? String(body.exampleId) : undefined,
    assignmentId: body.assignmentId ? String(body.assignmentId) : undefined,
    probe: body.probe ? String(body.probe) : undefined,
    clientKey: body.clientKey ? String(body.clientKey) : undefined,
  });
  if (!verdict) {
    return NextResponse.json({ ok: false, error: "ITEM_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, verdict });
}
