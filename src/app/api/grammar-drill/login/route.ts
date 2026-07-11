// 어법 드릴 로그인 — 학원코드 + 학생코드 → JWT 쿠키.
// DB 레이트리밋(IP/분 8회, tutor_login_rate_limits 공유) 후 HMAC 조회.
import { NextRequest, NextResponse } from "next/server";
import {
  GRAMMAR_DRILL_COOKIE,
  loginRateLimited,
  sessionCookieOptions,
  signGrammarSession,
  verifyGrammarLogin,
} from "@/lib/grammar-drill/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { academyCode?: string; studentCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }
  const academyCode = String(body.academyCode ?? "");
  const studentCode = String(body.studentCode ?? "");

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (await loginRateLimited(ip.slice(0, 45))) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  const result = await verifyGrammarLogin(academyCode, studentCode);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }

  const token = await signGrammarSession(result.session);
  const res = NextResponse.json({
    ok: true,
    studentName: result.session.studentName,
    academyName: result.session.academyName,
  });
  res.cookies.set(GRAMMAR_DRILL_COOKIE, token, sessionCookieOptions());
  return res;
}
