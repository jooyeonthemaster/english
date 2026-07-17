// 상태창 API — 어법 스텟·레벨·칭호의 단일 조회 지점 (docs/study-os-spec.md §14)
// 칭호는 저장값이 아니라 titles.ts 순수 함수의 산출이다 — 이 응답이 곧 정본이다.

import { NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { buildStatusPayload } from "@/lib/study-os/stats-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const payload = await buildStatusPayload(
    session.studentId,
    session.studentName || "학생",
  );
  return NextResponse.json(payload);
}
