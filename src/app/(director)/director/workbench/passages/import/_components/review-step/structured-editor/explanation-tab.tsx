"use client";

// ============================================================================
// ExplanationTab — structured editor tab for EXPLANATION blocks.
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import type { BlockType } from "@/lib/extraction/block-types";
import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import {
  BlockHeader,
  EmptyEditor,
  TypeSwitcher,
} from "./shared-pieces";

export function ExplanationTab({
  item,
  onChangeContent,
  onChangeTitle,
  onChangeType,
}: {
  item: ExtractionItemSnapshot | null;
  onChangeContent: (id: string, content: string) => void;
  onChangeTitle: (id: string, title: string) => void;
  onChangeType: (id: string, type: BlockType) => void;
}) {
  if (!item)
    return <EmptyEditor hint="해설(EXPLANATION) 블록을 선택해 주세요." />;
  return (
    <>
      <BlockHeader
        item={item}
        onChangeTitle={(t) => onChangeTitle(item.id, t)}
      />
      <TypeSwitcher
        selected={item.blockType}
        onChange={(t) => onChangeType(item.id, t)}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <textarea
          value={item.content}
          onChange={(e) => onChangeContent(item.id, e.target.value)}
          className="h-full w-full resize-none border-none bg-white px-5 py-4 text-[13px] leading-relaxed text-slate-800 outline-none focus:outline-none"
          placeholder="해설 본문"
          aria-label="해설 본문"
        />
      </div>
    </>
  );
}
