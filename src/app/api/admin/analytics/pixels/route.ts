// ============================================================================
// GET/PUT /api/admin/analytics/pixels — 픽셀 ID 설정(관리자). 계약 §8.1
// GET: requireAdminAuth · PUT: requireAdminAuth("SUPER_ADMIN"), 형식 오류 400 {errors:{field:msg}}.
// 서버 액션 금지(I7) — 라우트 핸들러.
// ============================================================================

import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  readPixelConfig,
  validatePixelInput,
  writePixelConfig,
  type PixelSettingsResponse,
} from "@/lib/analytics/pixels";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function authFailure(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  if (/insufficient/i.test(message)) {
    return NextResponse.json({ error: "SUPER_ADMIN 권한이 필요합니다." }, { status: 403, headers: NO_STORE });
  }
  return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401, headers: NO_STORE });
}

export async function GET() {
  let role: string;
  try {
    role = (await requireAdminAuth()).role;
  } catch (err) {
    return authFailure(err);
  }
  const state = await readPixelConfig();
  const body: PixelSettingsResponse = { ...state, canEdit: role === "SUPER_ADMIN" };
  return NextResponse.json(body, { headers: NO_STORE });
}

export async function PUT(req: Request) {
  try {
    await requireAdminAuth("SUPER_ADMIN");
  } catch (err) {
    return authFailure(err);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { errors: { _body: "요청 본문이 올바른 JSON 이 아닙니다." } },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = validatePixelInput(payload);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400, headers: NO_STORE });
  }

  try {
    await writePixelConfig(result.config);
  } catch (err) {
    console.error("[analytics] pixel config save failed", err);
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500, headers: NO_STORE });
  }

  const state = await readPixelConfig();
  const body: PixelSettingsResponse = { ...state, canEdit: true };
  return NextResponse.json(body, { headers: NO_STORE });
}
