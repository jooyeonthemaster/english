// ============================================================================
// /director/grammar-lab — 어법 훈련소: 학생별 학습 데이터 목록
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getStaffSession } from "@/lib/auth";
import { listGrammarLabStudents } from "@/actions/grammar-drill-admin";
import { getAcademyConceptRanking } from "@/actions/grammar-drill-insights";
import { GrammarLabListClient } from "./grammar-lab-list-client";

export const dynamic = "force-dynamic";

export default async function GrammarLabPage() {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/director");
  const staff = await getStaffSession();
  if (!staff) redirect("/auth/login");

  const [students, conceptRanking] = await Promise.all([
    listGrammarLabStudents(),
    getAcademyConceptRanking(),
  ]);
  return (
    <GrammarLabListClient students={students} conceptRanking={conceptRanking} />
  );
}
