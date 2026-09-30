/**
 * HWPX 내보내기 ← 공용 시험지 정본(26-09-30 HWPX-CONSUMER, 계약 docs/EXAM-PAPER-MODEL.md §1~§4).
 *
 * HWPX 는 「무엇을 찍을지」를 스스로 판정하지 않는다. 웹 상세·인쇄와 같은 모듈이 만든
 * PaperItem[](saved-paper-items.buildPaperItemsFromExam)을 받아, 문서 빌더 입력으로 옮기기만 한다.
 *   - 문항 → BuilderItemResolved: toPaperExportItem(판정 완료값) + 원본 PaperItem(paperItem)
 *   - 커스텀 블록 → BuilderBlock: PaperItem 필드 그대로(+ paperItem)
 *   - 레이아웃 기본값: resolvePaperLayout(웹 상세 기본값 — showQuestionMeta 기본 false 등)
 *   - 정답표: AnswerKeyQuestion.paperItem → answerKeyEntryForItem(웹과 같은 원문자 표기)
 * 조판 단계(builder-tables·break-plan)는 hwpxFlowEntries → buildGroups(공용) 로 그룹·지문 박스를 얻는다.
 *
 * 손으로 만든 입력(단위 테스트·구형 호출부 — paperItem 이 없는 BuilderItemResolved)은
 * 저장 항목으로 보고 공용 규칙(savedItemToPaperItem)으로 푼다. HWPX 안에 별도 판정 규칙은 없다.
 */
import type { PaperItem } from "@/components/exams/paper-builder/types";
import {
  inlineSourcePassageForItem,
  toPaperExportItem,
} from "@/components/exams/paper-builder/paper-export-items";
import {
  savedBlockToPaperItem,
  savedItemToPaperItem,
  type SavedPaperBlock,
  type SavedPaperExamQuestion,
  type SavedPaperItem,
  type SavedPaperSettings,
} from "@/components/exams/paper-builder/saved-paper-items";
import { resolvePaperLayout } from "@/components/exams/paper-builder/paper-layout-defaults";
import type {
  BuilderBlock,
  BuilderHeader,
  BuilderLayout,
  BuilderSettings,
} from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import type { BuilderCover } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/model";
import type { BuilderItemResolved } from "./render/question";
import type { AnswerKeyQuestion } from "./render/answer-key";

/** 공용 정본에서 온 커스텀 블록(원본 PaperItem 동봉). */
export type HwpxFlowBlock = BuilderBlock & { paperItem?: PaperItem };

/** 조판 순서의 한 항목 — 문항(resolved) 또는 커스텀 블록(block), 그리고 공용 PaperItem. */
export type HwpxFlowEntry = {
  paper: PaperItem;
  resolved?: BuilderItemResolved;
  block?: BuilderBlock;
};

function isPaperItemShape(item: object): item is PaperItem {
  const p = item as Partial<PaperItem>;
  return (
    p.blockType === "question" &&
    typeof p.locked === "boolean" &&
    typeof p.blockFontSize === "string" &&
    Array.isArray(p.options)
  );
}

/** `set:<setId>` 그룹(makePaperItem·저장본이 setId 로 만든 키)에서 setId 를 되읽는다 — 손입력 폴백 전용. */
function setIdFromGroupId(groupId: string | null | undefined): string | null {
  const m = /^set:(.+)$/.exec(groupId ?? "");
  return m ? m[1] : null;
}

const fallbackCache = new WeakMap<object, PaperItem>();

/**
 * 문서 빌더 입력 문항 → 공용 PaperItem. 라우트가 넘긴 항목은 paperItem 을 그대로 쓰고,
 * fragment 경로처럼 PaperItem 자체가 오면 그것을, 손입력이면 savedItemToPaperItem(공용 저장본 규칙)으로 푼다.
 */
export function paperItemOfResolved(item: BuilderItemResolved, index = 0): PaperItem {
  if (item.paperItem) return item.paperItem;
  if (isPaperItemShape(item)) return item;
  const cached = fallbackCache.get(item);
  if (cached) return cached;
  const source = item.sourceQuestion as BuilderItemResolved["sourceQuestion"] & {
    setId?: string | null;
  };
  const saved: SavedPaperItem = {
    localId: item.localId,
    questionId: item.questionId,
    orderNum: item.orderNum,
    points: item.points,
    groupId: item.groupId,
    includePassage: item.includePassage,
    passageTitle: item.passageTitle,
    passageContent: item.passageContent,
    questionText: item.questionText,
    options: item.options,
    correctAnswer: item.correctAnswer,
    answerSpaceLines: item.answerSpaceLines,
    objectiveAnswerSlots: item.objectiveAnswerSlots,
    objectiveAnswerTexts: item.objectiveAnswerTexts,
    sectionTitle: item.sectionTitle,
    teacherNote: item.teacherNote,
    breakBefore: item.breakBefore,
    keepWithPrev: item.keepWithPrev,
  };
  const format = {
    blockFontPt: item.blockFontPt,
    blockBold: item.blockBold,
    blockItalic: item.blockItalic,
    blockAlign: item.blockAlign,
  };
  const eq: SavedPaperExamQuestion = {
    points: item.points ?? null,
    question: {
      ...source,
      id: source?.id ?? item.questionId,
      type: source?.type ?? "",
      subType: source?.subType ?? null,
      questionText: source?.questionText ?? item.questionText ?? "",
      options: source?.options ?? null,
      correctAnswer: source?.correctAnswer ?? item.correctAnswer ?? "",
      setId: source?.setId ?? setIdFromGroupId(item.groupId),
      passage: source?.passage ?? null,
      explanation: source?.explanation ?? null,
    },
  };
  const paper = savedItemToPaperItem({ ...saved, ...format } as SavedPaperItem, eq, index);
  fallbackCache.set(item, paper);
  return paper;
}

/** 웹 인쇄가 이 문항 안(구조화 본문)에 그리는 지문 — 없으면 "". 문항 안 지문은 이것으로만 판단한다. */
export function printInlinePassageOf(item: BuilderItemResolved): string {
  if (typeof item.printInlinePassage === "string") return item.printInlinePassage;
  return inlineSourcePassageForItem(paperItemOfResolved(item));
}

/**
 * settings.blocks 순서(없으면 문항 순서)대로 조판 항목을 늘어놓는다. 문항 블록은 localId → 같은
 * questionId 의 미사용 문항 순으로 짝을 찾고(예전 appendBlocksInOrder 규칙), 못 찾으면 건너뛴다.
 * 결과의 paper 들을 공용 buildGroups 에 한 번에 넣어야 「비문항 블록으로 쪼개진 묶음의 지문 1회」가 지켜진다.
 */
export function hwpxFlowEntries(
  blocks: readonly BuilderBlock[] | undefined,
  resolvedItems: readonly BuilderItemResolved[],
): HwpxFlowEntry[] {
  if (!blocks?.length) {
    return resolvedItems.map((resolved, index) => ({
      paper: paperItemOfResolved(resolved, index),
      resolved,
    }));
  }
  const byLocalId = new Map<string, BuilderItemResolved>();
  for (const item of resolvedItems) {
    if (item.localId && !byLocalId.has(item.localId)) byLocalId.set(item.localId, item);
  }
  const used = new Set<BuilderItemResolved>();
  const take = (block: BuilderBlock): BuilderItemResolved | undefined => {
    const byId = block.localId ? byLocalId.get(block.localId) : undefined;
    if (byId && !used.has(byId)) {
      used.add(byId);
      return byId;
    }
    const fallback = resolvedItems.find(
      (item) => !used.has(item) && item.questionId === block.questionId,
    );
    if (fallback) used.add(fallback);
    return fallback;
  };

  const entries: HwpxFlowEntry[] = [];
  blocks.forEach((block, index) => {
    if (block.blockType === "question") {
      const resolved = take(block);
      if (resolved) entries.push({ paper: paperItemOfResolved(resolved, index), resolved });
      return;
    }
    const paper =
      (block as HwpxFlowBlock).paperItem ??
      savedBlockToPaperItem(block as unknown as SavedPaperBlock, index);
    if (paper) entries.push({ paper, block });
  });
  return entries;
}

/** 공용 PaperItem(커스텀 블록) → HWPX 커스텀 블록 렌더 입력(renderCustomBlock 이 읽는 필드). */
function builderBlockOf(item: PaperItem): HwpxFlowBlock {
  if (item.blockType === "question") {
    return { localId: item.localId, blockType: "question", questionId: item.questionId, paperItem: item };
  }
  return {
    localId: item.localId,
    blockType: item.blockType,
    questionId: item.questionId,
    groupId: item.groupId,
    questionText: item.questionText,
    sectionTitle: item.sectionTitle,
    breakBefore: item.breakBefore,
    keepWithPrev: item.keepWithPrev,
    locked: item.locked,
    blockTitle: item.blockTitle,
    blockText: item.blockText,
    blockAlign: item.blockAlign,
    blockFontSize: item.blockFontSize,
    blockBold: item.blockBold,
    blockItalic: item.blockItalic,
    blockFontPt: item.blockFontPt,
    blockAccentColor: item.blockAccentColor,
    dividerStyle: item.dividerStyle,
    dividerThickness: item.dividerThickness,
    spacerHeight: item.spacerHeight,
    imageDataUrl: item.imageDataUrl,
    imageAlt: item.imageAlt,
    imageWidth: item.imageWidth,
    paperItem: item,
  };
}

export type HwpxBuilderInput = {
  settings: BuilderSettings;
  resolvedItems: BuilderItemResolved[];
  fullExamQuestions: AnswerKeyQuestion[];
};

/**
 * 공용 PaperItem[] + 저장 설정 → buildBuilderHwpxDocument 입력.
 *  - layout: 저장값 위에 resolvePaperLayout 판정값(boolean 확정)을 덮는다 — builder.ts·render 의
 *    `!== false` 류 기본값 해석이 끼어들 틈이 없게. pageNumberStyle 등 HWPX 전용 키는 저장값 유지.
 *  - header·cover 는 저장값 그대로(표지 모델 통일은 범위 밖 — docs/EXAM-PAPER-MODEL.md §13).
 *  - blocks: PaperItem 순서 그대로(문항 블록 + 커스텀 블록). 정답표 원천도 같은 PaperItem.
 */
export function hwpxBuilderInput(
  paperItems: readonly PaperItem[],
  saved: SavedPaperSettings | null,
): HwpxBuilderInput {
  const resolved = resolvePaperLayout(saved);
  const savedLayout = (saved?.layout ?? {}) as BuilderLayout;
  const layout: BuilderLayout = {
    ...savedLayout,
    paperSize: resolved.paperSize,
    columns: resolved.columns,
    density: resolved.density,
    showAnswerSpace: resolved.showAnswerSpace,
    showPassageTitle: resolved.showPassageTitle,
    showQuestionMeta: resolved.showQuestionMeta,
    forceTwoPerPage: resolved.forceTwoPerPage,
  };
  const settings: BuilderSettings = {
    source: saved?.source || "exam-default",
    ...(typeof saved?.version === "number" ? { version: saved.version } : {}),
    template: resolved.template,
    layout,
    header: (saved?.header ?? {}) as BuilderHeader,
    ...(saved?.cover ? { cover: saved.cover as BuilderCover } : {}),
    items: [],
    blocks: paperItems.map(builderBlockOf),
  };

  const resolvedItems: BuilderItemResolved[] = [];
  const fullExamQuestions: AnswerKeyQuestion[] = [];
  for (const paperItem of paperItems) {
    const exported = toPaperExportItem(paperItem);
    if (!exported) continue;
    resolvedItems.push({ ...exported, paperItem });
    fullExamQuestions.push({
      orderNum: exported.orderNum,
      points: exported.points,
      question: exported.sourceQuestion,
      paperItem,
    });
  }
  return { settings, resolvedItems, fullExamQuestions };
}
