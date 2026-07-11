import { NextResponse } from "next/server";
import { GRAMMAR_DRILL_COOKIE } from "@/lib/grammar-drill/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GRAMMAR_DRILL_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
