// POST /api/dev/qgen-lab/client-timing — 클라가 잰 체감 시간(ClientTiming)을 runs/<batchId>.client.jsonl 에 append.
// 본문 = ClientTiming + batchId?(없으면 adhoc). dev 전용(404 → 401).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { appendClientTiming, isSafeBatchId } from "../_lib/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ms = z.number().finite().min(0).max(3_600_000).nullable();
const bodySchema = z.object({
  runId: z.string().min(1).max(300),
  batchId: z.string().max(80).nullable().optional(),
  clickToMetaMs: ms,
  clickToFirstReasoningMs: ms,
  clickToFirstContentMs: ms,
  clickToDoneMs: ms,
});

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "요청 형식 오류", issues: parsed.error.issues }, { status: 400 });
  }
  const { batchId, ...timing } = parsed.data;
  if (batchId && !isSafeBatchId(batchId)) {
    return NextResponse.json({ error: `batchId 형식 오류: ${batchId}` }, { status: 400 });
  }
  appendClientTiming(batchId || null, timing);
  return NextResponse.json({ ok: true });
}
