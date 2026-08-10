// ============================================================================
// /g/vocab-drill — 단어 훈련 몰입 플레이어 진입 (mode/deckId/assignmentId)
//
// learn 모드는 여기서 받지 않는다 — 덱 학습(LEARN) 표면이 별도 진입을 가진다.
// 어법 /g/drill/page.tsx 관용구를 그대로 따른다(화이트리스트 + 세션 가드).
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { VocabDrillPlayer } from "@/components/vocab-drill/drill-player";
import type { VocabDrillMode } from "@/lib/vocab-drill/payload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODES = new Set(["drill", "context", "test", "review", "weak", "assignment"]);

export default async function VocabDrillPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!FEATURE_FLAGS.ENABLE_VOCAB_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const mode = one(sp.mode) ?? "drill";
  if (!MODES.has(mode)) redirect("/g/home");

  return (
    <VocabDrillPlayer
      mode={mode as VocabDrillMode}
      deckId={one(sp.deckId)}
      assignmentId={one(sp.assignmentId)}
    />
  );
}
