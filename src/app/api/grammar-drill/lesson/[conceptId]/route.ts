// 레슨 진행 저장 API — 이어보기 지점·확인문항 결과·자기평가·필기·완료.
// 레슨 본문(정답 포함)은 서버 페이지가 안전 페이로드로 주입하므로 GET 은 두지 않는다.

import { NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { saveLessonProgress } from "@/lib/study-os/lesson-progress";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ conceptId: string }> },
) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { conceptId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_BODY" }, { status: 400 });
  }

  const checkDelta =
    body.checkDelta && typeof body.checkDelta === "object"
      ? {
          correct: Number((body.checkDelta as Record<string, unknown>).correct ?? 0) || 0,
          total: Number((body.checkDelta as Record<string, unknown>).total ?? 0) || 0,
        }
      : undefined;

  // v2 게임 이벤트 — 형태만 거른다(블록 실존·타입 검증은 stats-store 가 레슨 파일로 한다)
  const gameEvents = Array.isArray(body.gameEvents)
    ? (body.gameEvents as unknown[])
        .filter(
          (e): e is { blockId: string; result: string; combo?: unknown } =>
            Boolean(e) &&
            typeof (e as { blockId?: unknown }).blockId === "string" &&
            ["done", "perfect", "fail"].includes(String((e as { result?: unknown }).result)),
        )
        .slice(0, 12)
        .map((e) => ({
          blockId: e.blockId,
          result: e.result as "done" | "perfect" | "fail",
          combo: e.combo == null ? undefined : Number(e.combo) || 0,
        }))
    : undefined;

  const result = await saveLessonProgress({
    studentId: session.studentId,
    academyId: session.academyId,
    conceptId,
    lastBlockIndex: Number(body.lastBlockIndex ?? 0) || 0,
    blocksSeen: Number(body.blocksSeen ?? 0) || 0,
    checkDelta,
    secondsDelta: Number(body.secondsDelta ?? 0) || 0,
    confidence: body.confidence == null ? undefined : Number(body.confidence),
    note: typeof body.note === "string" ? body.note : undefined,
    complete: Boolean(body.complete),
    gameEvents,
  });

  if (!result) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json(result);
}
