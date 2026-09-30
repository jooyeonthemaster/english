import type { ExplanationUnit } from "./explanation-layout";
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
  // 해설: exam-font 조판은 줄 단위 흐름 단위(unit)로 여럿, legacy 는 통짜 하나(unit 없음).
  | { kind: "explanation"; group: PaperGroup; item: PaperItem; height: number; unit?: ExplanationUnit };

// paginateGroups 전용 선택 설정 — 공용 PaginationSettings(types.ts) 에 얹는 확장(교차 타입으로 받는다).
export type PaginationKeepSettings = {
  // 선지 묶음(keep-together, pagination-keep.ts): 한 문항의 선지 ①~⑤(+다중 빈칸 행·추가 슬롯)를 칸·쪽
  // 경계에서 쪼개지 않고, 발문 바로 뒤 선지면 발문도 함께 옮긴다. 미지정 = textMetrics "exam-font"
  // (미리보기·상세·첫 장·인쇄)에서만 켠다 → HWPX break-plan(legacy)의 쪽 나눔은 종전 그대로.
  keepOptionGroups?: boolean;
};

export type PaginationResult = {
  pages: PaperPage[];
  overflowItems: Set<string>;
  // 렌더 페이지별·칸별 추정치(pages 와 같은 index) — 실측 넘침 가드가 보정량을 정할 때 쓴다.
  //   used: 추정 사용 높이 · capacity: 보정 전 칸 용량 · blocks: 칸에 놓인 흐름 블록 수
  columns?: { used: number[]; capacity: number[]; blocks: number[] }[];
};
