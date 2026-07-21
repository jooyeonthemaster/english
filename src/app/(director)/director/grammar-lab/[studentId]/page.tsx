// ============================================================================
// /director/grammar-lab/[studentId] — 학생 상세 허브 어법 탭으로 통합(26-07-11 IA 재편 §5)
// 구 상세 화면은 /director/students/[studentId]?tab=grammar 가 후계.
// 기존 상세 클라이언트(grammar-lab-detail-client·assignment-panel)는 v3에서 삭제(사문).
// ============================================================================

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GrammarLabStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  redirect(`/director/students/${studentId}?tab=grammar`);
}
