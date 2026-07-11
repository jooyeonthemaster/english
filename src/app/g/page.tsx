// ============================================================================
// /g — 진입: 세션 있으면 홈으로, 없으면 학생 코드 로그인.
// ?ac=학원코드&sc=학생코드 프리필 — 강사가 보내는 로그인 링크(공유 카드)와
// 한 쌍. 두 코드가 모두 오면 login-client 가 자동 로그인을 시도한다.
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { LoginClient } from "./login-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GrammarDrillEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ ac?: string; sc?: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) {
    redirect("/");
  }
  const session = await getGrammarSession();
  if (session) redirect("/g/home");
  const { ac, sc } = await searchParams;
  return (
    <LoginClient
      initialAcademyCode={typeof ac === "string" ? ac : undefined}
      initialStudentCode={typeof sc === "string" ? sc : undefined}
    />
  );
}
