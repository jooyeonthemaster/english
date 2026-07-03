import type { OptionItem, PaperGroup, PaperItem, PaperPage, StructRowStyle } from "./types";
export type FlowBlock =
  | { kind: "custom"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "passage-atom"; group: PaperGroup; allLines: string[]; height: number }
  | { kind: "passage-line"; group: PaperGroup; line: string; lineIndex: number; totalLines: number; height: number }
  | {
      kind: "question-meta";
      group: PaperGroup;
      item: PaperItem;
      firstLine: string | null;
      totalLines: number;
      height: number;
    }
  | { kind: "question-line"; group: PaperGroup; item: PaperItem; line: string; lineIndex: number; totalLines: number; height: number }
  | {
      kind: "struct-line";
      group: PaperGroup;
      item: PaperItem;
      segIndex: number;
      style: StructRowStyle;
      paraLabel?: string;
      line: string;
      isSegStart: boolean;
      isSegEnd: boolean;
      // 원문(\n 경계) 행의 첫 랩행인지 — pagination-metrics.textToLinesWithMeta 가 채운다.
      isSourceLineStart?: boolean;
      lineHeight: number;
      segChrome: number;
      height: number;
    }
  | { kind: "option"; group: PaperGroup; item: PaperItem; option: OptionItem; index: number; height: number }
  | { kind: "objective-answer"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "answer"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "note"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "explanation"; group: PaperGroup; item: PaperItem; height: number };

export type PaginationResult = {
  pages: PaperPage[];
  overflowItems: Set<string>;
};
