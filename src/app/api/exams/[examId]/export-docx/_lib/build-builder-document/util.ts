import { AlignmentType, BorderStyle, Paragraph, TextRun } from "docx";
import { splitSentenceInsertGivenBlock } from "@/components/exams/paper-builder/option-display";
import {
  savedBlockToPaperItem,
  savedItemToPaperItem,
  type SavedPaperBlock,
  type SavedPaperExamQuestion,
  type SavedPaperItem,
} from "@/components/exams/paper-builder/saved-paper-items";
import type { PaperItem } from "@/components/exams/paper-builder/types";
import { KO_SET_GROUP_PREFIX } from "@/lib/korean/sets/paper";
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
  // 헤더만 정규식으로 보고 base64 본문은 콤마로 잘라낸다(거대 문자열을 (.+)$ 로 캡처하면
  // 정규식 엔진 스택 오버플로 발생).
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  const match = dataUrl.slice(0, comma).match(/^data:image\/(png|jpe?g|gif|bmp);base64$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
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
// 호환 입력(resolvedItems) → 공용 정본 PaperItem[]
// =============================================================================

/**
 * 호환 입력 한 항목. 단일 문항 로더(load-single-question-export.buildSingleResolvedItem)와 HWPX 입력
 * (export-model.hwpxBuilderInput)은 toPaperExportItem 결과에 판정이 끝난 공용 PaperItem(paperItem)을
 * 동봉한다. 손으로 만든 입력(기존 테스트 하네스)은 paperItem 이 없다.
 */
export type DocxResolvedInput = BuilderItemResolved & { paperItem?: PaperItem };

/** `set:<setId>` 그룹 키에서 setId 를 되읽는다 — makePaperItem·저장본은 setId 로만 이 키를 만든다. */
function setIdFromGroupId(groupId: string | null | undefined): string | null {
  if (typeof groupId !== "string" || !groupId.startsWith(KO_SET_GROUP_PREFIX)) return null;
  return groupId.slice(KO_SET_GROUP_PREFIX.length) || null;
}

/**
 * 호환 입력(resolvedItems — 단일 문항 내보내기 라우트·기존 테스트 하네스) → PaperItem[].
 *
 *  - paperItem 을 동봉한 항목은 그 PaperItem 을 그대로 쓴다. 두 번째 재해석을 하지 않는다(DC-R1).
 *    toPaperExportItem 결과(PaperExportSourceQuestion)에는 setId 가 없어서, 그것으로 문항을 다시 만들면
 *    세트 판정이 빠진다. 그러면 기출 세트 멤버의 지문이 어디에도 찍히지 않고, 영어 세트 멤버는
 *    안내문 없이 문항 안 지문이 된다. HWPX(export-model.paperItemOfResolved)와 같은 규칙이다.
 *  - paperItem 이 없는 손입력은 「저장 항목」으로 보고 공용 규칙(savedItemToPaperItem)을 태운다.
 *    includePassage(docs/EXAM-PAPER-MODEL.md §2)·지문 원천(같은 문서 §3)·정규화·그룹 기본값이 시험지 라우트와 같은 함수다.
 *    이때 원 문항에 setId 가 없으면 `set:<setId>` 그룹 키에서 되읽는다(HWPX 손입력 폴백과 같다).
 *
 * 순서·번호는 buildPaperItemsFromExam 과 같다.
 *  - blocks 가 없으면 저장 items 모드다. orderNum 으로 정렬한 뒤 1..n 으로 다시 매긴다.
 *  - blocks 가 있으면 문항 블록을 localId(없으면 같은 questionId 의 첫 미사용 항목)로 짝짓는다.
 *    블록 순서와 커스텀 블록을 따르고, 짝이 없는 문항 블록은 건너뛴다. 문항만 1부터 번호를 매긴다.
 */
export function paperItemsFromResolvedItems(
  resolvedItems: readonly DocxResolvedInput[],
  blocks: readonly BuilderBlock[] | undefined,
): PaperItem[] {
  const examQuestionById = new Map<string, SavedPaperExamQuestion>();
  for (const item of resolvedItems) {
    if (item.paperItem) continue;
    const question = item.sourceQuestion as SavedPaperExamQuestion["question"];
    if (examQuestionById.has(question.id)) continue;
    examQuestionById.set(question.id, {
      orderNum: item.orderNum ?? null,
      points: item.points ?? null,
      question: { ...question, setId: question.setId ?? setIdFromGroupId(item.groupId) },
    });
  }
  const savedItems: SavedPaperItem[] = resolvedItems.map((item) => ({
    ...item,
    questionId: item.questionId || item.sourceQuestion.id,
  }));
  /** 호환 입력 i → PaperItem. saved 는 저장 항목 모양(블록 모드에서는 blockType 포함), index 는 저장 목록 위치. */
  const paperItemAt = (i: number, saved: SavedPaperItem, index: number): PaperItem | null => {
    const canonical = resolvedItems[i].paperItem;
    if (canonical) return canonical;
    const eq = saved.questionId ? examQuestionById.get(saved.questionId) : undefined;
    return eq ? savedItemToPaperItem(saved, eq, index) : null;
  };

  if (!blocks?.length) {
    return savedItems
      .map((saved, index) => paperItemAt(index, saved, index))
      .filter((item): item is PaperItem => Boolean(item))
      .sort((a, b) => a.orderNum - b.orderNum)
      .map((item, index) => ({ ...item, orderNum: index + 1 }));
  }

  const used = new Set<number>();
  const takeSavedIndex = (block: BuilderBlock): number => {
    const byLocalId = block.localId
      ? savedItems.findIndex((item, index) => !used.has(index) && item.localId === block.localId)
      : -1;
    const index =
      byLocalId >= 0
        ? byLocalId
        : savedItems.findIndex((item, i) => !used.has(i) && item.questionId === block.questionId);
    if (index >= 0) used.add(index);
    return index;
  };
  // 저장 블록 목록(짝 없는 문항 블록 제외) — 위치(index)가 buildPaperItemsFromExam v2-blocks 의 index 와 같다.
  const flow: Array<{ savedIndex: number } | { block: SavedPaperBlock }> = [];
  for (const block of blocks) {
    if (block.blockType !== "question") {
      flow.push({ block: block as SavedPaperBlock });
      continue;
    }
    const savedIndex = takeSavedIndex(block);
    if (savedIndex >= 0) flow.push({ savedIndex });
  }
  let questionOrder = 0;
  return flow
    .map((entry, index) =>
      "savedIndex" in entry
        ? paperItemAt(
            entry.savedIndex,
            { ...savedItems[entry.savedIndex], blockType: "question" } as SavedPaperItem,
            index,
          )
        : savedBlockToPaperItem(entry.block, index),
    )
    .filter((item): item is PaperItem => Boolean(item))
    .map((item) =>
      item.blockType === "question" ? { ...item, orderNum: (questionOrder += 1) } : { ...item, orderNum: 0 },
    );
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
