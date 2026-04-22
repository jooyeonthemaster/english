// ============================================================================
// Item mutation helpers — handleSplit / handleMergeWithNext.
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { toast } from "sonner";
import type { ExtractionItemSnapshot } from "@/lib/extraction/types";

/**
 * Split a block's content at the caret, producing two items.
 *
 * P0-5 fixes:
 *  1) items 배열을 order 기준으로 먼저 정렬한 뒤 분할 — 이전엔 입력 순서가
 *     비정렬일 경우 전역 재번호가 잘못됐다.
 *  2) boundingBox를 수직 분할(approximate)한다. caret 위치 기준 비율로
 *     head/tail을 상·하로 나누어 원본 박스가 그대로 복사되던 문제를 해결.
 *     caret 비율이 의미 없거나 계산 실패 시 tail.boundingBox는 null로 리셋한다.
 */
export function handleSplit(
  id: string,
  caret: number,
  items: ExtractionItemSnapshot[],
  setItems: (items: ExtractionItemSnapshot[]) => void,
) {
  // (1) order asc 정렬 고정
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((it) => it.id === id);
  if (idx < 0) return;
  const current = sorted[idx];
  if (caret <= 0 || caret >= current.content.length) return;

  const headContent = current.content.slice(0, caret).trim();
  const tailContent = current.content.slice(caret).trim();

  // (2) boundingBox 수직 분할 — caret 위치를 문자열 길이 대비 비율로 사용.
  //     보수적으로 분할: 0.05 ~ 0.95 사이가 아니면 (예: trim 후 극단) reset.
  let headBox: ExtractionItemSnapshot["boundingBox"] = null;
  let tailBox: ExtractionItemSnapshot["boundingBox"] = null;
  const bb = current.boundingBox;
  if (bb) {
    const ratio = caret / current.content.length;
    if (ratio > 0.05 && ratio < 0.95) {
      const topH = bb.h * ratio;
      headBox = { page: bb.page, x: bb.x, y: bb.y, w: bb.w, h: topH };
      tailBox = {
        page: bb.page,
        x: bb.x,
        y: bb.y + topH,
        w: bb.w,
        h: bb.h - topH,
      };
    }
    // ratio 극단값: 박스를 정확히 쪼갤 근거가 없으므로 둘 다 null로 리셋
    // (원본을 그대로 복사하는 것보다 정확하지 않다고 표시하는 편이 낫다).
  }

  const head: ExtractionItemSnapshot = {
    ...current,
    content: headContent,
    boundingBox: headBox,
  };
  // C2 2차 보정 — id 충돌 방지: 같은 밀리초(리뷰어가 같은 블록을 키보드 J+split 연타)
  // 내에서 동일 Date.now() 값이 찍히면 parentItemId 역참조가 뒤섞였다.
  // crypto.randomUUID()가 제공되는 환경(Node 16.7+/모든 모던 브라우저)이면 그것을
  // 쓰고, 아니면 Date.now()+36진수 난수 조합으로 확률적 충돌 회피.
  const uniqueSuffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tail: ExtractionItemSnapshot = {
    ...current,
    id: `${current.id}__split_${uniqueSuffix}`,
    content: tailContent,
    order: current.order + 0.5,
    title: current.title ? `${current.title} (분할)` : null,
    boundingBox: tailBox,
  };
  const next = [...sorted];
  next.splice(idx, 1, head, tail);
  // (3) order 전역 재부여 (1-base 정수)
  setItems(next.map((it, i) => ({ ...it, order: i + 1 })));
}

/**
 * Merge a block with the next block of the same type (local state only).
 *
 * P0-3 — 동일 blockType만 체크하면 서로 다른 문제에 속한 CHOICE 두 개가 병합되어
 * 자식(해설·선지)이 고아가 되거나 지문 경계가 무너졌다. 이제 3중 조건으로
 * 엄격히 검증하고, 병합 대상의 children은 병합된 부모로 parentItemId를 재이관한다.
 */
export function handleMergeWithNext(
  id: string,
  items: ExtractionItemSnapshot[],
  setItems: (items: ExtractionItemSnapshot[]) => void,
  setSelectedItemId: (id: string | null) => void,
) {
  // order 정렬 기준의 "다음 형제" 탐색
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((it) => it.id === id);
  if (idx < 0) return;
  const current = sorted[idx];

  // 동일 blockType + 동일 parentItemId + 동일 groupId 의 첫 후속 아이템.
  //
  // C2 2차 보정 — null-null 루트 병합 치명 이슈:
  //   groupId가 양쪽 모두 null이면 `===` 가 true가 되어 서로 무관한 루트 블록
  //   (예: 페이지 1의 CHOICE 마지막 → 페이지 2의 QUESTION_STEM 시작)이 병합될
  //   수 있었다. groupId 양쪽 null인 경우:
  //     - PASSAGE_BODY 끼리는 허용 (긴 지문이 페이지 넘어감 → 정당한 사용 케이스).
  //     - 그 외 blockType은 거부 — 작성자가 명시적으로 group을 지정한 뒤 합쳐야 함.
  const isPassageRootMerge =
    current.groupId == null &&
    current.blockType === "PASSAGE_BODY";
  const nextSibling =
    sorted.slice(idx + 1).find(
      (it) => {
        if (it.blockType !== current.blockType) return false;
        if (it.parentItemId !== current.parentItemId) return false;
        // 둘 다 null이면서 지문 본문이 아닌 경우 엄격히 차단.
        if (current.groupId == null && it.groupId == null) {
          return isPassageRootMerge;
        }
        return it.groupId === current.groupId;
      },
    ) ?? null;
  if (!nextSibling) {
    toast.error(
      current.groupId == null && !isPassageRootMerge
        ? "그룹이 지정되지 않은 루트 블록은 병합할 수 없습니다. (지문 본문 제외)"
        : "병합 가능한 다음 블록이 없습니다. (동일 유형·동일 부모·동일 그룹 필요)",
    );
    return;
  }

  const merged: ExtractionItemSnapshot = {
    ...current,
    content: (
      current.content.trimEnd() +
      "\n\n" +
      nextSibling.content.trimStart()
    ).trim(),
    sourcePageIndex: [
      ...new Set([...current.sourcePageIndex, ...nextSibling.sourcePageIndex]),
    ].sort((a, b) => a - b),
    // confidence: 둘의 평균으로 보수 합산
    confidence:
      current.confidence != null && nextSibling.confidence != null
        ? (current.confidence + nextSibling.confidence) / 2
        : current.confidence ?? nextSibling.confidence,
    needsReview: current.needsReview || nextSibling.needsReview,
  };

  // children 재이관 (parentItemId = nextSibling.id → current.id)
  const out = sorted
    .filter((it) => it.id !== nextSibling.id)
    .map((it) => {
      if (it.id === current.id) return merged;
      if (it.parentItemId === nextSibling.id) {
        return { ...it, parentItemId: current.id };
      }
      return it;
    });

  setItems(out.map((it, i) => ({ ...it, order: i + 1 })));
  setSelectedItemId(merged.id);
}
