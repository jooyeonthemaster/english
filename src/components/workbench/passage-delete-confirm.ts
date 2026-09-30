// ============================================================================
// 지문 삭제 확인 — 모든 지문 삭제 버튼이 이 함수 하나로 확인창을 띄운다.
//
// 서버에서 영향 범위(연결 문항·시험지 사용·동일 지문 유무·RESTRICT 참조)를 조회해,
// 실제로 일어날 일을 그대로 보여 준다(docs/EXAM-PAPER-MODEL.md §5 (e) — 예전의 거짓 문구
// 「관련 문제도 모두 삭제됩니다」 제거). 조회가 실패해도 사실인 일반 문구로 묻는다.
// ============================================================================

import { getPassageDeletionImpact } from "@/actions/workbench/passages";
import { PASSAGE_DELETE_FALLBACK_DESCRIPTION } from "@/actions/workbench/_lib/passage-delete-message";
import { confirmNative } from "@/lib/browser-confirm";

export type PassageDeleteConfirmNoun = "지문" | "학습지";

/**
 * true = 사용자가 삭제를 확인했다. 삭제할 수 있는 지문이 하나도 없으면(튜터 수업
 * 연결 등) 안내만 띄우고 false.
 */
export async function confirmPassageDeletion(
  passageIds: string[],
  opts: { noun?: PassageDeleteConfirmNoun } = {},
): Promise<boolean> {
  const noun = opts.noun ?? "지문";
  const ids = passageIds.filter(Boolean);
  if (ids.length === 0) return false;
  let res: Awaited<ReturnType<typeof getPassageDeletionImpact>> | null = null;
  try {
    res = await getPassageDeletionImpact(ids, { noun });
  } catch {
    res = null;
  }
  if (!res || !res.success) {
    const title =
      ids.length === 1
        ? `이 ${noun === "학습지" ? "학습지를" : "지문을"} 삭제할까요?`
        : `선택한 ${noun} ${ids.length}편을 삭제할까요?`;
    return confirmNative(title, PASSAGE_DELETE_FALLBACK_DESCRIPTION);
  }
  const { confirm } = res;
  if (confirm.deletableCount === 0) {
    if (typeof window !== "undefined") {
      window.alert(`${confirm.title}\n\n${confirm.description}`);
    }
    return false;
  }
  return confirmNative(confirm.title, confirm.description);
}
