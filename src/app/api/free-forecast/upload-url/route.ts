import { NextResponse } from "next/server";
import { FF_EXT_TYPES, FF_MAX_FILE_BYTES, FF_REQUEST_ID_RE, FF_SLOT_KEYS, ffExt, type FfSlotKey } from "@/lib/free-forecast/constants";
import { ffClientIp, ffRateLimit } from "@/lib/free-forecast/guard";
import { createFfUploadTarget } from "@/lib/free-forecast/storage";

// 공개 — 무료 신청 파일 하나의 서명 업로드 URL. 브라우저가 이 URL 로 Supabase 에 직접 PUT 한다.

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  let body: { requestId?: unknown; slot?: unknown; name?: unknown; size?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("잘못된 요청입니다.");
  }
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const slot = body.slot as FfSlotKey;
  const name = typeof body.name === "string" ? body.name : "";
  const size = typeof body.size === "number" ? body.size : 0;
  if (!FF_REQUEST_ID_RE.test(requestId)) return bad("잘못된 요청입니다.");
  if (!FF_SLOT_KEYS.includes(slot)) return bad("잘못된 칸입니다.");
  const ext = ffExt(name);
  if (!FF_EXT_TYPES[ext]) return bad(`이 형식(.${ext || "?"})은 받을 수 없습니다. PDF·사진·한글·워드·PPT로 올려 주세요.`);
  if (size <= 0) return bad("빈 파일입니다.");
  if (size > FF_MAX_FILE_BYTES) return bad("파일 하나는 50MB까지입니다. 나눠서 올려 주세요.");

  // 칸 3개 × 30개 + 재시도 여유. 한 IP 가 10분에 이보다 많이 받으면 막는다.
  if (!ffRateLimit(`up:${ffClientIp(req)}`, 150, 10 * 60 * 1000)) return bad("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);

  try {
    const target = await createFfUploadTarget(requestId, slot, ext);
    return NextResponse.json({ ok: true, ...target });
  } catch (err) {
    console.error("[free-forecast] upload-url", err);
    return bad("업로드 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}
