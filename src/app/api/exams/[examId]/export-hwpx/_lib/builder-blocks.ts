import { type BlockNode, type BorderSpec, type TableNode, txt } from "./types";
import { COLORS, SIZE } from "./tokens";
import { mm } from "./units";
import type { BuilderItemResolved } from "./render/question";
import { estimateBlocksHeight } from "./section-xml";
import { LINE_GAP_MARKER } from "@/components/exams/paper-builder/types";
import { DEFAULT_IMAGE_ASPECT, imageAspectFromDataUrl } from "@/lib/image-dims";
import type { BuilderBlock } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import type { BreakType } from "./break-plan";
// 네이티브 2단 머리말: 전체폭 헤더를 "떠 있는(floating)" 표로 만든다.
//  - 한컴은 머리말이 일반 흐름 표(treatAsChar="1")면 secPr 파싱을 망가뜨려 본문이
//    상단 여백을 무시하고 페이지 맨 위에 그려진다(머리말과 겹침). 실제 한컴 시험지는
//    머리말 표를 treatAsChar="0"(IN_FRONT_OF_TEXT)로 띄워 이 문제를 피한다.
//  - 또한 한컴은 2단 본문을 marginHeader(머리말 밴드) 높이 아래에서 시작한다(실측).
//    따라서 marginHeader = 머리말 높이 + 여백 으로 잡아야 본문이 머리말 아래서 시작한다.
export function floatHeaderBlocks(
  blocks: BlockNode[],
  contentWidthHpu: number,
): { blocks: BlockNode[]; heightHpu: number } {
  const NONE: BorderSpec = { type: "NONE", widthMm: 0.1, color: COLORS.black };
  let yOff = 0;
  const out: BlockNode[] = blocks.map((blk, i) => {
    const tbl: TableNode =
      blk.kind === "tbl"
        ? blk
        : {
            kind: "tbl",
            colWidthsHpu: [contentWidthHpu],
            borders: { left: NONE, right: NONE, top: NONE, bottom: NONE },
            rows: [
              {
                heightHpu: estimateBlocksHeight([blk], contentWidthHpu),
                cells: [
                  {
                    widthHpu: contentWidthHpu,
                    heightHpu: estimateBlocksHeight([blk], contentWidthHpu),
                    vAlign: "TOP",
                    borders: { left: NONE, right: NONE, top: NONE, bottom: NONE },
                    margins: { left: 0, right: 0, top: 0, bottom: 0 },
                    blocks: [blk],
                  },
                ],
              },
            ],
          };
    const h = estimateBlocksHeight([tbl], contentWidthHpu);
    tbl.float = {
      widthHpu: contentWidthHpu,
      vertRelTo: "PARA",
      horzRelTo: "COLUMN",
      vertOffsetHpu: yOff,
      horzOffsetHpu: 0,
      zOrder: 10 + i,
    };
    yOff += h;
    return tbl;
  });
  return { blocks: out, heightHpu: yOff };
}

export function normalizePrintableTitle(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function printablePassageTitle(item: BuilderItemResolved): string {
  const savedTitle = normalizePrintableTitle(item.passageTitle);
  const sourceTitle = normalizePrintableTitle(item.sourceQuestion.passage?.title);
  return savedTitle || sourceTitle;
}

export function blockAlign(align: BuilderBlock["blockAlign"]) {
  if (align === "center") return "CENTER" as const;
  if (align === "right") return "RIGHT" as const;
  return "LEFT" as const;
}

// 분할 계획에 따라 블록 묶음의 첫 블록에 강제 단/페이지 나눔을 부여한다.
// (문단·표 모두 pageBreak/columnBreak 필드를 지원한다.)
export function applyBreak(blocks: BlockNode[], type: BreakType | undefined) {
  if (!type) return;
  const first = blocks[0];
  if (!first || first.kind === "columnPr") return;
  if (type === "page") first.pageBreak = true;
  else first.columnBreak = true;
}

export function blockTextSize(block: BuilderBlock, compact: boolean) {
  // 숫자 pt 가 지정되면 그 값을 그대로(pt) 사용 — 미리보기와 동일 크기로 출력.
  if (typeof block.blockFontPt === "number" && Number.isFinite(block.blockFontPt)) {
    return block.blockFontPt;
  }
  if (block.blockFontSize === "lg") return compact ? 12 : 13;
  if (block.blockFontSize === "sm") return compact ? 8 : 9;
  return compact ? SIZE.bodyCompact : SIZE.body;
}

// data URL(base64) → 버퍼+포맷. hp:pic 임베드용. webp 등은 라우트에서 png 로 미리 변환되므로
// 여기엔 png/jpg/gif/bmp 만 들어온다(그 외는 null → 대체 텍스트).
function decodeImageDataUrl(
  dataUrl: string | null | undefined,
): { buffer: Buffer; mime: "png" | "jpg" | "gif" | "bmp" } | null {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i);
  if (!m) return null;
  const f = m[1].toLowerCase();
  const mime = f === "png" ? "png" : f === "gif" ? "gif" : f === "bmp" ? "bmp" : "jpg";
  try {
    return { buffer: Buffer.from(m[2], "base64"), mime };
  } catch {
    return null;
  }
}

export function renderCustomBlock(
  block: BuilderBlock,
  compact: boolean,
  contentWidthHpu: number,
  // 이미지 박스 크기 기준: 미리보기와 같은 물리적 크기로 그리려면 (2단 시험지라도
  // 한컴 폴백은 전체폭 1단이므로) "단 폭"을 기준으로 imageWidth% 를 적용한다.
  imageColWidthHpu?: number,
  imageMaxHeightHpu?: number,
): BlockNode[] {
  const align = blockAlign(block.blockAlign);
  const color = block.blockAccentColor || "#2563EB";
  const text = block.blockText || block.questionText || "";

  if (block.blockType === "section") {
    return [
      {
        kind: "p",
        style: {
          align,
          leftMargin: 120,
          spaceBefore: 140,
          spaceAfter: 120,
          lineSpacingPct: 150,
        },
        runs: [
          txt(block.blockTitle || text || "새 섹션", {
            size:
              typeof block.blockFontPt === "number" && Number.isFinite(block.blockFontPt)
                ? block.blockFontPt
                : compact
                  ? 12
                  : 13,
            bold: block.blockBold ?? true,
            italic: block.blockItalic ?? false,
            color,
          }),
        ],
      },
    ];
  }

  if (block.blockType === "text") {
    return (text || " ").replace(/\r/g, "").split("\n").map((line) => ({
      kind: "p" as const,
      style: { align, spaceBefore: 40, spaceAfter: 80, lineSpacingPct: 155 },
      runs: [
        txt(line || " ", {
          size: blockTextSize(block, compact),
          bold: block.blockBold ?? false,
          italic: block.blockItalic ?? false,
          color: COLORS.darkGray,
        }),
      ],
    }));
  }

  if (block.blockType === "divider") {
    const lineType =
      block.dividerStyle === "dotted"
        ? "DOT"
        : block.dividerStyle === "dashed"
          ? "DASH"
          : "SOLID";
    const border = {
      type: lineType,
      widthMm: Math.max(0.1, Math.min(0.8, (block.dividerThickness || 1) * 0.12)),
      color,
    } as const;
    const none = { type: "NONE", widthMm: 0.1, color: COLORS.black } as const;
    return [
      {
        kind: "tbl",
        colWidthsHpu: [contentWidthHpu],
        borders: { left: none, right: none, top: border, bottom: none },
        rows: [
          {
            heightHpu: 220,
            cells: [
              {
                widthHpu: contentWidthHpu,
                heightHpu: 220,
                vAlign: "CENTER",
                borders: { left: none, right: none, top: border, bottom: none },
                margins: { left: 0, right: 0, top: 80, bottom: 80 },
                blocks: [{ kind: "p", style: { spaceAfter: 0 }, runs: [] }],
              },
            ],
          },
        ],
      },
    ];
  }

  if (block.blockType === "spacer") {
    // 워드프로세서식 빈 줄(line-gap): 미리보기에서 Enter 한 번 = 본문 한 줄이므로,
    // 한글에서도 "본문 한 줄"과 똑같은 높이(빈 단락 한 줄)로 렌더한다. 빈 runs 는 기본
    // 10pt 로 줄높이가 잡혀 본문(9pt)보다 커지므로, 본문 크기의 빈 run 을 넣어 줄높이를
    // 본문 한 줄(size×lineSpacingPct)로 정확히 맞추고 추가 spaceAfter 는 두지 않는다.
    if (block.blockText === LINE_GAP_MARKER) {
      const bodySize = compact ? SIZE.bodyCompact : SIZE.body;
      return [
        {
          kind: "p",
          style: {
            spaceBefore: 0,
            spaceAfter: 0,
            lineSpacingPct: compact ? 146 : 158,
          },
          runs: [txt("", { size: bodySize })],
        },
      ];
    }
    return [
      {
        kind: "p",
        style: {
          spaceBefore: 0,
          spaceAfter: Math.max(80, Math.min(900, (block.spacerHeight || 32) * 10)),
        },
        runs: [],
      },
    ];
  }

  if (block.blockType === "image") {
    // 실제 그림을 인라인 이미지(hp:pic, treatAsChar)로 임베드한다. 폭은 단 폭 기준
    // imageWidth%, 종횡비 유지, 한 페이지(칸) 높이로 캡. 미리보기와 동일 크기.
    const refColW = imageColWidthHpu ?? contentWidthHpu;
    const pct = Math.max(20, Math.min(100, block.imageWidth || 70));
    let dispW = Math.max(mm(20), Math.round((refColW * pct) / 100));
    const aspect = imageAspectFromDataUrl(block.imageDataUrl) ?? DEFAULT_IMAGE_ASPECT;
    let dispH = Math.round(dispW * aspect);
    if (imageMaxHeightHpu && dispH > imageMaxHeightHpu) {
      dispH = imageMaxHeightHpu;
      dispW = Math.round(dispH / aspect);
    }
    dispH = Math.max(mm(10), dispH);
    const decoded = decodeImageDataUrl(block.imageDataUrl);
    if (!decoded) {
      // 디코드 실패(미지원 포맷 등) → 대체 텍스트.
      return [
        {
          kind: "p",
          style: { align, spaceBefore: 80, spaceAfter: 80 },
          runs: [
            txt(`[이미지: ${block.imageAlt || "삽입 이미지"}]`, {
              size: SIZE.meta,
              color: COLORS.gray,
            }),
          ],
        },
      ];
    }
    const out: BlockNode[] = [
      {
        kind: "p",
        style: { align, spaceBefore: 80, spaceAfter: block.imageAlt ? 40 : 80 },
        runs: [
          {
            kind: "image",
            data: decoded.buffer,
            mime: decoded.mime,
            widthHpu: dispW,
            heightHpu: dispH,
          },
        ],
      },
    ];
    if (block.imageAlt) {
      out.push({
        kind: "p",
        style: { align, spaceAfter: 80 },
        runs: [txt(block.imageAlt, { size: SIZE.meta, color: COLORS.gray })],
      });
    }
    return out;
  }

  return [];
}
