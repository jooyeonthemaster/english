"use client";

import type { GrammarPoint } from "@/types/passage-analysis";

interface GrammarHighlightProps {
  text: string;
  data: GrammarPoint;
  onTap: (data: GrammarPoint) => void;
}

export function GrammarHighlight({
  text,
  data,
  onTap,
}: GrammarHighlightProps) {
  return (
    <span
      role="button"
      tabIndex={0}
      className="highlight-grammar"
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
