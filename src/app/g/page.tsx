// ============================================================================
// /g — 진입: 세션 있으면 홈으로, 없으면 학생 코드 로그인.
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { LoginClient } from "./login-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GrammarDrillEntryPage() {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) {
    redirect("/");
  }
  const session = await getGrammarSession();
  if (session) redirect("/g/home");
  return <LoginClient />;
}
