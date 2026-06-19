/**
 * 13가지 ParsedSection 타입별 렌더러.
 * DOCX 의 render-section-boxes / render-section-inline 와 동일한 시각 구조.
 */

import type { BlockNode, ParagraphNode, RunNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { parseFormattedToRuns } from "../format";
import type { ParsedSection } from "@/app/api/exams/[examId]/export-docx/_lib/types";

function labelPara(label: string): ParagraphNode {
  return {
    kind: "p",
    style: { spaceBefore: 40, spaceAfter: 40, lineSpacingPct: 130 },
    runs: [
      txt(`<${label}>`, {
        size: SIZE.body,
        bold: true,
      }),
    ],
  };
}

function bodyParas(content: string): ParagraphNode[] {
  const lines = content.split("\n");
  return lines.map<ParagraphNode>((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return {
        kind: "p",
        style: {
          align: "JUSTIFY",
          spaceAfter: idx < lines.length - 1 ? 40 : 0,
          lineSpacingPct: 158,
        },
        runs: [txt(" ", { size: SIZE.body })],
      };
    }
    return {
      kind: "p",
      style: {
        align: "JUSTIFY",
        spaceAfter: idx < lines.length - 1 ? 40 : 0,
        lineSpacingPct: 158,
      },
      runs: parseFormattedToRuns(trimmed, { size: SIZE.body }),
    };
  });
}

function textBlock(content: string): BlockNode[] {
  return [...bodyParas(content), { kind: "p", style: { spaceAfter: 120 }, runs: [] }];
}

// =============================================================================
// 각 섹션 타입
// =============================================================================

export function renderMarker(
  section: ParsedSection,
  contentWidthHpu: number,
): BlockNode[] {
  void contentWidthHpu;
  const result: BlockNode[] = [];
  if (section.label) result.push(labelPara(section.label));
  result.push(...textBlock(section.content));
  return result;
}

export function renderConditions(section: ParsedSection): BlockNode[] {
  const items = section.items ?? [];
  const result: BlockNode[] = [];
  if (section.label) result.push(labelPara(section.label));
  for (let i = 0; i < items.length; i++) {
    result.push({
      kind: "p",
      style: {
        leftMargin: 400,
        indentFirst: -200,
        spaceAfter: 40,
        lineSpacingPct: 170,
      },
      runs: [
        txt(`${i + 1}. `, { size: SIZE.body }),
        ...parseFormattedToRuns(items[i], { size: SIZE.body }),
      ],
    });
  }
  result.push({ kind: "p", style: { spaceAfter: 80 }, runs: [] });
  return result;
}

export function renderError(
  section: ParsedSection,
  contentWidthHpu: number,
): BlockNode[] {
  void contentWidthHpu;
  const result: BlockNode[] = [];
  if (section.label) result.push(labelPara(section.label));
  result.push(...textBlock(section.content));
  return result;
}

export function renderSummary(
  section: ParsedSection,
  contentWidthHpu: number,
): BlockNode[] {
  void contentWidthHpu;
  const result: BlockNode[] = [];
  if (section.label) result.push(labelPara(section.label));
  result.push(...textBlock(section.content));
  return result;
}

// =============================================================================
// SUMMARY_WRITING (요약문 영작) 전용 학생노출 블록
//   - 해석 / 보기 / 앞글자. 정답계열(modelAnswer/answer 등)은 절대 들어오지 않는다
//     (호출부가 summary-writing.ts 의 학생안전 헬퍼만 넘긴다).
//   - 색 규칙: 회색(slate)만. orange/amber 금지, Sparkles/emoji 금지.
// =============================================================================

/** 👁[해석] 박스 — 회색 본문(slate). renderSummary/renderContext 패턴 미러. */
export function renderGloss(content: string): BlockNode[] {
  const text = (content || "").trim();
  if (!text) return [];
  const result: BlockNode[] = [labelPara("해석")];
  result.push(
    ...bodyParas(text).map<ParagraphNode>((para) => ({
      ...para,
      runs: para.runs.map((run) =>
        run.kind === "text"
          ? { ...run, style: { ...run.style, color: COLORS.gray } }
          : run,
      ),
    })),
  );
  result.push({ kind: "p", style: { spaceAfter: 120 }, runs: [] });
  return result;
}

/** 👁[보기] 칩 — WordOrder(배열 단어) 칩 스타일 미러. "/" 구분, 굵게. 미끼 구분 없음. */
export function renderWordBank(content: string): BlockNode[] {
  const items = (content || "")
    .split(/\s*\/\s*/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (items.length === 0) return [];
  return [
    labelPara("보기"),
    {
      kind: "p",
      style: { spaceAfter: 80, lineSpacingPct: 170, indentFirst: 0 },
      runs: items.flatMap<RunNode>((w, i) => [
        ...(i > 0 ? [txt(" / ", { size: SIZE.body, color: COLORS.gray })] : []),
        txt(w, { size: SIZE.body, bold: true }),
      ]),
    },
  ];
}

/** 👁[앞글자] 단서 — 회색 작은 텍스트. renderHint 패턴 미러. */
export function renderFirstLetter(content: string): BlockNode[] {
  const text = (content || "").trim();
  if (!text) return [];
  return [
    labelPara("앞글자"),
    {
      kind: "p",
      style: { spaceAfter: 60, leftMargin: 200 },
      runs: [
        txt(text, {
          size: SIZE.continued,
          color: COLORS.gray,
        }),
      ],
    },
  ];
}

export function renderScrambled(section: ParsedSection): BlockNode[] {
  const items = section.items ?? [];
  return [
    ...(section.label ? [labelPara(section.label)] : []),
    {
      kind: "p",
      style: { spaceAfter: 80, lineSpacingPct: 170, indentFirst: 0 },
      runs: items.flatMap<RunNode>((w, i) => [
        ...(i > 0 ? [txt(" / ", { size: SIZE.body, color: COLORS.gray })] : []),
        txt(w, { size: SIZE.body, bold: true }),
      ]),
    },
  ];
}

export function renderTarget(section: ParsedSection): BlockNode[] {
  return [
    ...(section.label ? [labelPara(section.label)] : []),
    {
      kind: "p",
      style: { spaceAfter: 60 },
      runs: parseFormattedToRuns(section.content, {
        size: SIZE.body,
        bold: true,
      }),
    },
  ];
}

export function renderContext(section: ParsedSection): BlockNode[] {
  return [
    ...(section.label ? [labelPara(section.label)] : []),
    ...bodyParas(section.content),
    { kind: "p", style: { spaceAfter: 80 }, runs: [] },
  ];
}

export function renderParagraphs(section: ParsedSection): BlockNode[] {
  const items = section.items ?? section.content.split("\n");
  // SENTENCE_ORDER (A)/(B)/(C) 문단: 마커는 DOCX/미리보기와 동일하게 검정.
  return items.map<ParagraphNode>((line) => ({
    kind: "p",
    style: {
      align: "JUSTIFY",
      leftMargin: 200,
      spaceAfter: 60,
      lineSpacingPct: 158,
    },
    runs: parseFormattedToRuns(line, { size: SIZE.body }, { markerColor: COLORS.black }),
  }));
}

export function renderBlanks(section: ParsedSection): BlockNode[] {
  return [
    ...(section.label ? [labelPara(section.label)] : []),
    {
      kind: "p",
      style: { spaceAfter: 80 },
      runs: parseFormattedToRuns(section.content, { size: SIZE.body }),
    },
  ];
}

export function renderHint(section: ParsedSection): BlockNode[] {
  return [
    ...(section.label ? [labelPara(section.label)] : []),
    {
      kind: "p",
      style: { spaceAfter: 60, leftMargin: 200 },
      runs: parseFormattedToRuns(section.content, {
        size: SIZE.body,
        color: COLORS.gray,
        italic: true,
      }),
    },
  ];
}

export function renderMatchType(section: ParsedSection): BlockNode[] {
  // DOCX 와 동일하게 우측 정렬 · lightGray · 8pt.
  return [
    {
      kind: "p",
      style: { align: "RIGHT", spaceAfter: 60 },
      runs: [
        txt(`[유형: ${section.content}]`, {
          size: SIZE.continued,
          color: COLORS.lightGray,
        }),
      ],
    },
  ];
}

export function renderFallback(section: ParsedSection): BlockNode[] {
  return [
    {
      kind: "p",
      style: { leftMargin: 200, spaceAfter: 40, lineSpacingPct: 158 },
      runs: parseFormattedToRuns(section.content, { size: SIZE.body }),
    },
  ];
}

export function renderDirection(
  section: ParsedSection,
  orderNum: number,
  points: number,
  subTypeLabel: string,
  showMeta: boolean,
  compact: boolean,
): BlockNode[] {
  const qNumSize = compact ? SIZE.qNumCompact : SIZE.qNum;
  const headerRuns: RunNode[] = [
    txt(`${orderNum}. `, {
      size: qNumSize,
      bold: true,
      color: COLORS.black,
    }),
  ];
  if (showMeta) {
    const meta = subTypeLabel ? `[${points}점 · ${subTypeLabel}]` : `[${points}점]`;
    headerRuns.push(
      txt("  ", { size: qNumSize }),
      txt(meta, {
        size: SIZE.meta,
        color: COLORS.gray,
      }),
    );
  }
  headerRuns.push(
    ...parseFormattedToRuns(section.content, {
      size: compact ? SIZE.bodyCompact : SIZE.body,
      bold: true,
    }),
  );
  return [
    {
      kind: "p",
      style: { spaceBefore: 80, spaceAfter: 100, lineSpacingPct: 158 },
      runs: headerRuns,
    },
  ];
}
