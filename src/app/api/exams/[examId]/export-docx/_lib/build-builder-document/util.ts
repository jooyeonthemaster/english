import { AlignmentType, BorderStyle, Paragraph, TextRun } from "docx";
import { splitSentenceInsertGivenBlock } from "@/components/exams/paper-builder/option-display";
import type { ParsedOption } from "../types";
import type { BuilderBlock, BuilderItemResolved } from "./model";
import { SIZE_BODY, SIZE_BODY_COMPACT } from "./sizes";
import { imageDimsFromDataUrl } from "@/lib/image-dims";



function normalizePrintableTitle(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function printablePassageTitle(item: BuilderItemResolved): string {
  const savedTitle = normalizePrintableTitle(item.passageTitle);
  const sourceTitle = normalizePrintableTitle(item.sourceQuestion.passage?.title);
  return savedTitle || sourceTitle;
}

export function firstQuestionLineForHeader(questionText: string, subType: string | null | undefined): string {
  const { beforeText } = splitSentenceInsertGivenBlock(questionText, subType);
  const sourceText = beforeText || questionText;
  return sourceText
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

export function dataUrlToImage(dataUrl: string | null | undefined):
  | { buffer: Buffer; type: "png" | "jpg" | "gif" | "bmp"; width: number; height: number }
  | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const buf = Buffer.from(match[2], "base64");
  const type: "png" | "jpg" | "gif" | "bmp" =
    mime === "png" ? "png" : mime === "gif" ? "gif" : mime === "bmp" ? "bmp" : "jpg";
  // 실제 자연 크기를 헤더에서 읽어 종횡비를 정확히 한다(미상이면 정사각 폴백).
  const dims = imageDimsFromDataUrl(dataUrl);
  return { buffer: buf, type, width: dims?.width ?? 64, height: dims?.height ?? 64 };
}

export function emptyParagraph(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
}

export function safeParseOptions(raw: string | null | undefined): ParsedOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o, idx) => ({
      label: String(o?.label ?? idx + 1),
      text: String(o?.text ?? ""),
    }));
  } catch {
    return [];
  }
}

// =============================================================================
// 그룹화: groupId 가 같으면 지문을 한 번만 출력 (미리보기와 동일)
// =============================================================================

export function groupItems(
  items: BuilderItemResolved[],
): Array<{ groupKey: string; items: BuilderItemResolved[] }> {
  const groups: Array<{ groupKey: string; items: BuilderItemResolved[] }> = [];
  for (const item of items) {
    const key = item.groupId || `single:${item.questionId}-${item.orderNum}`;
    const last = groups[groups.length - 1];
    if (last && last.groupKey === key) {
      last.items.push(item);
    } else {
      groups.push({ groupKey: key, items: [item] });
    }
  }
  return groups;
}

export function docAlignment(align: BuilderBlock["blockAlign"]): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

export function blockBodySize(block: BuilderBlock, compact: boolean) {
  // 숫자 pt 가 지정되면 half-point(pt*2) 로 직접 환산해 미리보기와 동일 크기로 출력한다.
  if (typeof block.blockFontPt === "number" && Number.isFinite(block.blockFontPt)) {
    return Math.round(block.blockFontPt * 2);
  }
  if (block.blockFontSize === "lg") return compact ? 24 : 26;
  if (block.blockFontSize === "sm") return compact ? 16 : 18;
  return compact ? SIZE_BODY_COMPACT : SIZE_BODY;
}

export function dividerBorderStyle(style: BuilderBlock["dividerStyle"]) {
  if (style === "dashed") return BorderStyle.DASHED;
  if (style === "dotted") return BorderStyle.DOTTED;
  return BorderStyle.SINGLE;
}
