// ============================================================================
// Commit error inspection (P0-9). Extracted from review-step.tsx during
// mechanical split.
// ============================================================================

/**
 * Commit API 실패 응답 `details`에서 첫 이슈를 사람이 읽을 수 있는 형태로
 * 요약한다.
 *
 * 지원하는 `details[0]` 모양:
 *   (a) ZodIssue: `{ path: ["passages", 0, "content"], message: "..." }`
 *       → path[1]이 배열 인덱스면 `payload.passages[idx].sourceItemId` /
 *         `payload.questions[idx].sourceItemIds[0]` 로 역매핑해 itemId 복원.
 *   (b) 파이프라인 구조화 에러: `{ itemId, message }` 또는 `{ sourceItemId, message }`
 *       → itemId를 직접 사용.
 *
 * C2 2차 보정 — 이전 구현은 path 기반 응답에서 itemId를 전혀 복원하지 못해
 * "문제 블록 자동 포커스" 스크롤이 무의미했다. 이제 두 번째 인자로 commit에
 * 실제 전송된 payload를 주면 path → itemId 역매핑을 시도한다.
 */
export function extractFirstIssue(
  details: unknown,
  payload?: Record<string, unknown> | null,
): { label: string; description?: string; itemId?: string } | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const first = details[0] as Record<string, unknown> | null;
  if (!first || typeof first !== "object") return null;

  const path = Array.isArray(first.path) ? first.path : undefined;
  const message =
    typeof first.message === "string" ? first.message : undefined;
  let itemId =
    typeof first.itemId === "string"
      ? first.itemId
      : typeof (first as { sourceItemId?: unknown }).sourceItemId === "string"
        ? ((first as { sourceItemId?: string }).sourceItemId as string)
        : undefined;

  // Path → itemId 역매핑 (서버가 ZodIssue shape로 응답할 때).
  if (!itemId && path && payload) {
    const [root, rawIdx] = path;
    const idx = typeof rawIdx === "number" ? rawIdx : undefined;
    if (
      idx !== undefined &&
      (root === "passages" || root === "questions") &&
      Array.isArray(payload[root])
    ) {
      const arr = payload[root] as Array<Record<string, unknown>>;
      const hit = arr[idx];
      if (hit) {
        if (typeof hit.sourceItemId === "string") {
          itemId = hit.sourceItemId;
        } else if (
          Array.isArray(hit.sourceItemIds) &&
          typeof hit.sourceItemIds[0] === "string"
        ) {
          itemId = hit.sourceItemIds[0] as string;
        }
      }
    }
  }

  const label = path && path.length > 0 ? path.join(".") : "입력 오류";
  return {
    label,
    description: message,
    itemId,
  };
}
