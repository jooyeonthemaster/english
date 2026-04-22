"use client";

// ============================================================================
// useKeyboardShortcuts — J/K navigation + Alt+<digit> block-type switching +
// Cmd/Ctrl+S commit. Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  getBlockTypeByShortcut,
  type BlockType,
} from "@/lib/extraction/block-types";
import type { ExtractionItemSnapshot } from "@/lib/extraction/types";

interface UseKeyboardShortcutsArgs {
  items: ExtractionItemSnapshot[];
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  suspectOnly: boolean;
  updateItem: (id: string, patch: Partial<ExtractionItemSnapshot>) => void;
  onCommit: () => Promise<void>;
}

export function useKeyboardShortcuts(args: UseKeyboardShortcutsArgs) {
  const {
    items,
    selectedItemId,
    setSelectedItemId,
    suspectOnly,
    updateItem,
    onCommit,
  } = args;

  // ────────────────────────────────────────────────────────────────────
  // Keyboard shortcuts (J/K, 0-9, Ctrl+S)
  //
  // C2 2차 보정 — suspectOnly 네비게이션 정합성:
  //   이전엔 J/K가 `tree` 기반으로 flat list를 만들어, "의심만 보기" 필터를
  //   켜면 안전 블록은 키보드로 접근 불가했다. 이제 J/K는 *항상 전체* items를
  //   order 기준으로 순회하고, suspectOnly는 화면 표시에만 영향. 사용자가 필터
  //   중에 J/K로 점프하면 toast로 상태를 고지한다(처음 1회만).
  // ────────────────────────────────────────────────────────────────────
  const navItemIds = useMemo(
    () =>
      [...items]
        .sort((a, b) => a.order - b.order)
        .map((it) => it.id),
    [items],
  );
  const suspectOnlyToastShownRef = useRef(false);

  const onBlockTypeChange = useCallback(
    (id: string, nextType: BlockType) => {
      updateItem(id, { blockType: nextType });
    },
    [updateItem],
  );

  const moveSelection = useCallback(
    (dir: 1 | -1) => {
      if (navItemIds.length === 0) return;
      const currentIdx = selectedItemId
        ? navItemIds.indexOf(selectedItemId)
        : -1;
      const nextIdx =
        currentIdx < 0
          ? 0
          : Math.min(
              navItemIds.length - 1,
              Math.max(0, currentIdx + dir),
            );
      setSelectedItemId(navItemIds[nextIdx]);

      // 의심만 보기 필터가 켜져 있을 때 J/K가 필터 밖 블록으로 점프하면
      // "왜 화면이 그대로?"로 오인될 수 있으므로 세션당 한 번 상태 안내.
      if (suspectOnly && !suspectOnlyToastShownRef.current) {
        suspectOnlyToastShownRef.current = true;
        toast("의심 블록만 표시 중 · 전체 탐색 시 필터를 해제하세요", {
          duration: 4000,
        });
      }
    },
    [navItemIds, selectedItemId, setSelectedItemId, suspectOnly],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isEditable =
        !!target &&
        (tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          target.isContentEditable);
      // P1-4: <select>가 열린 상태에서 J/K 등이 옵션 탐색과 충돌하지 않도록 제외.
      const isSelectTarget = tagName === "SELECT";

      // P0-6: 한글 IME 조합 중에는 어떤 단축키도 실행하지 않는다.
      //       (isComposing, 또는 keyCode 229 — Safari/구 브라우저 호환용)
      const isComposing =
        e.isComposing ||
        (typeof (e as unknown as { keyCode?: number }).keyCode === "number" &&
          (e as unknown as { keyCode?: number }).keyCode === 229);
      if (isComposing) return;

      // Cmd/Ctrl+S: commit
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void onCommit();
        return;
      }

      if (isEditable || isSelectTarget) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        moveSelection(1);
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        moveSelection(-1);
        return;
      }

      // P0-2: 숫자 단축키는 Alt 모디파이어를 요구한다.
      // 리뷰 중 textarea 밖에서 무심코 "0"을 치면 NOISE로 바뀌고 되돌릴 방법이
      // 없는 버그가 있었다. Alt+1~9, Alt+0으로 명시적으로만 타입을 변경한다.
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const shortcutType = getBlockTypeByShortcut(e.key);
        if (shortcutType && selectedItemId) {
          e.preventDefault();
          onBlockTypeChange(selectedItemId, shortcutType);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [moveSelection, onBlockTypeChange, onCommit, selectedItemId]);

  return { onBlockTypeChange };
}
