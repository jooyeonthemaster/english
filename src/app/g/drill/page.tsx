// ============================================================================
// /g/drill — 범용 드릴 플레이어 진입 (mode/unitId/conceptId/setId/assignmentId)
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { DrillPlayer } from "@/components/grammar-drill/drill-player";
import type { DrillMode } from "@/lib/grammar-drill/payload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODES = new Set([
  "drill",
  "concept_check",
  "reading",
  "written",
  "test",
  "review",
  "smart",
  "mixed",
  "assignment",
]);

export default async function DrillPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const mode = one(sp.mode) ?? "smart";
  if (!MODES.has(mode)) redirect("/g/home");

  return (
    <DrillPlayer
      params={{
        mode: mode as DrillMode,
        unitId: one(sp.unitId),
        conceptId: one(sp.conceptId),
        setId: one(sp.setId),
        assignmentId: one(sp.assignmentId),
      }}
    />
  );
}
