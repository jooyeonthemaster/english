"use client";

import type { VocabItem } from "@/types/passage-analysis";

interface VocabHighlightProps {
  text: string;
  data: VocabItem;
  onTap: (data: VocabItem) => void;
}

export function VocabHighlight({ text, data, onTap }: VocabHighlightProps) {
  return (
    <span
      role="button"
      tabIndex={0}
      className="highlight-vocab active:scale-95 transition-transform duration-100"
      onClick={(e) => {
        e.stopPropagation();
        onTap(data);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          onTap(data);
        }
      }}
    >
      {text}
    </span>
  );
}
