// ============================================================================
// 어법 훈련소 — 유닛 문항 브라우징 + AI 생성 허브 (v3 design §D5-1·§D5-2)
//
// 다크런칭: FEATURE_FLAGS.ENABLE_GRAMMAR_STUDIO(기본 false)가 꺼져 있으면
// /director 로 리다이렉트 — nav 미등록 상태에서도 직접 방문 노출 0.
// ⚠️ 플래그 off 차단의 정본은 next.config.ts redirects()(HTTP 307, env 조건부) —
// 아래 페이지 레벨 redirect()는 폴백(풀 로드 시 Next 16 React #310 리스크, /director 선례).
// 통계는 getGrammarBundle()(서버 전용, 코드 번들 인메모리 — DB 0회) 프리로드.
// ============================================================================

import { redirect } from "next/navigation";

import { getStaffSession } from "@/lib/auth";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarBundle } from "@/lib/grammar-drill/bundle";
import { GRAMMAR_UNITS } from "@/lib/grammar-drill/curriculum";
import { PageShell } from "@/components/layout/page-frame";
import { GrammarStudioClient } from "./grammar-studio-client";

export const dynamic = "force-dynamic";

export default async function GrammarStudioPage() {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_STUDIO) redirect("/director");

  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const bundle = getGrammarBundle();

  // 유닛별 문항 수 — 커리큘럼 19유닛 전부 키를 채운다(0 유닛의 rose ⚠ 근거).
  const itemCountByUnit: Record<string, number> = {};
  for (const unit of GRAMMAR_UNITS) {
    itemCountByUnit[unit.id] = bundle.itemIdsByUnit.get(unit.id)?.length ?? 0;
  }

  return (
    <PageShell>
      <GrammarStudioClient
        totalItems={bundle.stats.items}
        conceptCount={bundle.stats.concepts}
        itemCountByUnit={itemCountByUnit}
      />
    </PageShell>
  );
}
