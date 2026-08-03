import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getStaffSession } from "@/lib/auth";
import {
  getAcademyWeakLemmas,
  listVocabLabStudents,
} from "@/actions/vocab-drill-admin/queries";
import { listVocabDecks } from "@/actions/vocab-drill-admin/decks";
import { VocabLabListClient } from "./vocab-lab-list-client";

// ============================================================================
// 단어 훈련 — /director/students/vocab (어법 grammar/page.tsx 복제 형상)
//
// (manage) 통합 셸 아래 embedded 로 얹힌다 — PageShell·헤더·뷰 스위처는
// (manage)/layout.tsx 담당. 데이터는 학생 집계 + 학원 취약 표제어 + 덱 목록.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function StudentsVocabPage() {
  if (!FEATURE_FLAGS.ENABLE_VOCAB_DRILL) redirect("/director");
  const staff = await getStaffSession();
  if (!staff) redirect("/auth/login");

  const [students, weakLemmas, decks] = await Promise.all([
    listVocabLabStudents(),
    getAcademyWeakLemmas(),
    listVocabDecks(),
  ]);
  return (
    <VocabLabListClient
      students={students}
      weakLemmas={weakLemmas}
      decks={decks}
      embedded
    />
  );
}
