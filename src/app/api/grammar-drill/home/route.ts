import { NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { buildHomePayload } from "@/lib/grammar-drill/home";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const payload = await buildHomePayload(session);
  return NextResponse.json({ ok: true, home: payload });
}
