"use client";

// ============================================================================
// PassageTab — structured editor tab for PASSAGE_BODY blocks.
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { useState } from "react";
import { FileText } from "lucide-react";
import { MIN_COMMIT_PASSAGE_LENGTH } from "@/lib/extraction/constants";
import type { BlockType } from "@/lib/extraction/block-types";
import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import {
  BlockActions,
  BlockHeader,
  EmptyEditor,
  TypeSwitcher,
} from "./shared-pieces";

export function PassageTab({
  item,
  onChangeContent,
  onChangeTitle,
  onChangeType,
  onSplit,
  onMergeWithNext,
  onSkipToggle,
}: {
  item: ExtractionItemSnapshot | null;
  onChangeContent: (id: string, content: string) => void;
  onChangeTitle: (id: string, title: string) => void;
  onChangeType: (id: string, type: BlockType) => void;
  onSplit: (id: string, caret: number) => void;
  onMergeWithNext: (id: string) => void;
  onSkipToggle: (id: string) => void;
}) {
  const [caret, setCaret] = useState(0);

  if (!item) {
    return (
      <EmptyEditor hint="왼쪽 블록 트리에서 지문(PASSAGE_BODY)을 선택해 주세요." />
    );
  }

  const tooShort = item.content.trim().length < MIN_COMMIT_PASSAGE_LENGTH;
  const isSkipped = item.status === "SKIPPED";

  return (
    <>
      <BlockHeader
        item={item}
        onChangeTitle={(t) => onChangeTitle(item.id, t)}
      />
      <TypeSwitcher selected={item.blockType} onChange={(t) => onChangeType(item.id, t)} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <textarea
          value={item.content}
          onChange={(e) => onChangeContent(item.id, e.target.value)}
          onSelect={(e) =>
            setCaret(
              (e.target as HTMLTextAreaElement).selectionStart ?? 0,
            )
          }
          disabled={isSkipped}
          className="h-full w-full resize-none border-none bg-white px-5 py-4 text-[13px] leading-relaxed text-slate-800 outline-none focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          placeholder="추출된 원문을 확인하세요."
          spellCheck={false}
          aria-label="지문 본문 편집"
        />
      </div>
      {tooShort ? (
        <div className="flex items-center gap-2 border-t border-sky-200 bg-sky-50 px-5 py-2 text-[11px] text-sky-800">
          <FileText className="size-3.5" strokeWidth={1.8} />
          {MIN_COMMIT_PASSAGE_LENGTH}자 이상이어야 저장할 수 있습니다.
        </div>
      ) : null}
      <BlockActions
        onSplit={() => onSplit(item.id, caret)}
        canSplit={caret > 0 && caret < item.content.length}
        onMergeWithNext={() => onMergeWithNext(item.id)}
        onSkipToggle={() => onSkipToggle(item.id)}
        isSkipped={isSkipped}
      />
    </>
  );
}
