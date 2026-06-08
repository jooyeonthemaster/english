import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { kickCustomTypeAnalysisWorker } from "@/lib/custom-question-types/analysis-job-runner";
import { listAnalysisJobs } from "@/lib/custom-question-types/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — '유형 만들기' 분석 잡 목록(상태/진행). 하단 작업 큐 폴링용. DIRECTOR 한정.

function normalizeLimit(raw: string | null): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 30) : 12;
}

export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // 폴링도 워커를 깨운다(서버 재시작 후 cold-start 복구). pump 는 멱등.
  kickCustomTypeAnalysisWorker();

  const jobs = await listAnalysisJobs(
    staff.academyId,
    normalizeLimit(req.nextUrl.searchParams.get("limit")),
  );
  return NextResponse.json({ jobs });
}
