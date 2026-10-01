// GET /api/dev/qgen-lab/runs?batchId=x — 그 배치 실행 요약 목록({ runs: RunSummary[] }, batchId 생략 = adhoc).
// GET ?batchId=x&runId=y — 해당 RunResult 전체(없으면 404). dev 전용(404 → 401).
import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { findRunResult, isSafeBatchId, listRunSummaries } from "../_lib/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const batchId = sp.get("batchId") || null;
  if (batchId && !isSafeBatchId(batchId)) {
    return NextResponse.json({ error: `batchId 형식 오류: ${batchId}` }, { status: 400 });
  }
  const runId = sp.get("runId");
  if (runId) {
    const run = findRunResult(batchId, runId);
    if (!run) return NextResponse.json({ error: `실행 없음: ${runId}` }, { status: 404 });
    return NextResponse.json(run);
  }
  return NextResponse.json({ batchId: batchId ?? "adhoc", runs: listRunSummaries(batchId) });
}
