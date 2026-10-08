import { NextResponse } from "next/server";
import { ffSlotOfPath } from "@/lib/free-forecast/constants";
import { ffClientIp, ffRateLimit } from "@/lib/free-forecast/guard";
import { removeFfPendingFile } from "@/lib/free-forecast/storage";

// 공개 — 신청서를 내기 전에 ✕ 로 뺀 파일을 버킷에서 바로 지운다(안 지우면 7일 정리 때까지 남는다).
// 접수 뒤(request.json 있음)에는 지우지 않는다 — 접수된 자료를 지우는 것은 6개월 파기(크론)와 관리자 「파기」뿐.
// 신청 번호는 신청 탭만 아는 v4 UUID(추측 불가)라 이것이 곧 권한이다. 경로는 그 신청 폴더의 칸 아래 파일 한 개 모양만 받는다.

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  let body: { requestId?: unknown; path?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("잘못된 요청입니다.");
  }
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const path = typeof body.path === "string" ? body.path : "";
  if (!ffSlotOfPath(requestId, path)) return bad("잘못된 요청입니다.");

  // 올리기와 같은 한도 — 한 사람이 뺄 수 있는 파일은 올린 파일만큼이다
  if (!ffRateLimit(`rm:${ffClientIp(req)}`, 150, 10 * 60 * 1000)) return bad("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);

  try {
    const r = await removeFfPendingFile(requestId, path);
    if (r === "submitted") return bad("이미 접수된 신청의 파일은 지울 수 없습니다.", 409);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[free-forecast] remove", err);
    return bad("파일을 지우지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}
