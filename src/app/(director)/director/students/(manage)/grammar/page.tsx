import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getStaffSession } from "@/lib/auth";
import { listGrammarLabStudents } from "@/actions/grammar-drill-admin";
import { getAcademyConceptRanking } from "@/actions/grammar-drill-insights";
import { GrammarLabListClient } from "@/app/(director)/director/grammar-lab/grammar-lab-list-client";

// ============================================================================
// 어법 현황 — /director/students/grammar (v3 §D4-1, C-2)
//
// 구 /director/grammar-lab 목록의 후계 정본. 데이터 로드(listGrammarLabStudents
// + getAcademyConceptRanking)를 그대로 이식하고 GrammarLabListClient 를
// embedded 로 렌더한다 — PageShell·헤더·뷰 스위처는 (manage)/layout.tsx 담당.
// 구 경로는 redirect("/director/students/grammar") 로 이 페이지에 착지한다.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function StudentsGrammarPage() {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/director");
  const staff = await getStaffSession();
  if (!staff) redirect("/auth/login");

  const [students, conceptRanking] = await Promise.all([
    listGrammarLabStudents(),
    getAcademyConceptRanking(),
  ]);
  return (
    <GrammarLabListClient
      students={students}
      conceptRanking={conceptRanking}
      embedded
    />
  );
}
