// ============================================================================
// /g/unit/[unitId]/learn — 구 "개념 학습"(카드 페이저).
// 학습 OS 재편으로 인터랙티브 레슨 플레이어(/g/unit/[unitId]/lesson/[conceptId])가
// 정본이 됐다(docs/study-os-spec.md §4.3). 기존 링크·북마크 보존을 위해 라우트는
// 남기고, 이 유닛의 첫 개념 레슨으로 서버 리다이렉트한다.
//
// ⚠ 잠금 가드는 여기서도 서버에서 강제한다 — 이 라우트가 과거에 클라 잠금만 믿어
//    뚫린 전력이 있다. 정책은 레슨 페이지·큐 API와 동일(computeUnlockedUnits).
// ⚠ 목적지가 세션·잠금 상태에 따라 달라지므로 308(영구)을 쓰면 안 된다.
//    잠긴 학생의 /g/home 리다이렉트가 브라우저에 영구 캐시되면 해금 후에도
//    레슨에 못 들어간다. 307(redirect)만 쓴다.
//
// learn-client.tsx 는 더 이상 이 라우트에서 쓰이지 않는다(파일은 보존).
// ============================================================================

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { UNIT_BY_ID } from "@/lib/grammar-drill/curriculum";
import { computeUnlockedUnits } from "@/lib/grammar-drill/engine";
import { getLesson } from "@/lib/study-os/lesson-bundle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LearnRedirectPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}): Promise<never> {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const { unitId } = await params;
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) redirect("/g/home");

  // 서버 잠금 게이트 — 레슨 페이지와 동일 정책
  const progresses = await prisma.grammarDrillUnitProgress.findMany({
    where: { studentId: session.studentId },
    select: { unitId: true, drillDoneAt: true },
  });
  if (!computeUnlockedUnits(progresses).has(unitId)) redirect("/g/home");

  // 레슨이 실재하는 첫 개념으로 보낸다. 레슨이 하나도 없으면(콘텐츠 공백)
  // 죽은 화면 대신 유닛 허브로 — 학생은 거기서 다음 한 수를 본다.
  const firstConceptId = unit.conceptIds.find((cid) => getLesson(cid));
  if (!firstConceptId) redirect(`/g/unit/${unitId}`);

  redirect(`/g/unit/${unitId}/lesson/${firstConceptId}`);
}
