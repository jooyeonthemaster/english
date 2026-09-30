// ============================================================================
// saved-paper-items — 저장된 시험지(settings + 시험 문항) → PaperItem[] 의 단일 정본
// (26-09-30 CORE-MODEL, 계약 docs/EXAM-PAPER-MODEL.md §2·§3·§6).
//
// 웹 상세·인쇄(exam-detail-paper-preview) · 빌더 재오픈(exam-paper-builder-existing) · HWPX · DOCX ·
// 단일 문항 내보내기가 이 모듈 하나를 소비한다. 예전에는 상세·재오픈이 거의 같은 코드를 복제했고
// (includePassage·기출 세트·정규화가 서로 달랐다) 서버 라우트는 제3·제4의 규칙을 썼다.
//
//  - 지문 결정(EXAM-PAPER-MODEL §3): 비어 있지 않은 스냅숏 → DB 지문 → structuredData._sourcePassage  (resolvePrintablePassage)
//  - includePassage(EXAM-PAPER-MODEL §2): 강제 ? true : 저장값 boolean ? 저장값 : 기본값          (resolveIncludePassage)
//    기출 세트는 강제 없이 저장값(세트 전체 토글)을 그대로 쓴다 — shouldForceSourcePassage 가 기출 멤버를 빼므로
//    저장기(save-draft)도 선생님 값을 그대로 기록한다(CM-R1)
//  - settings 없음(NULL)·알 수 없는 source → makePaperItem(새로 담은 문항과 같은 규칙)
//  - v2 blocks 가 있으면 blocks, 아니면 v1/v2 items(similar-v1 포함)
// 입력은 웹 ExamQuestion·서버 Prisma include(ExamQuestionData) 모두 구조적으로 받는다(최소 공통형).
// JSX·window 의존 없음.
// ============================================================================
import type { BreakBefore, BuilderQuestion, InsertablePaperBlockType, PaperItem } from "./types";
import type {
  SavedPaperBlock,
  SavedPaperExamQuestion,
  SavedPaperItem,
  SavedPaperSettings,
} from "./saved-paper-types";
import { makeCustomPaperBlock, makePaperItem, parseOptions, passageSetKindFor } from "./paper-item-model";
import {
  isSourcePassageMissing,
  resolveIncludePassage,
  resolvePrintablePassage,
  type PrintablePassageOrigin,
} from "./passage-policy";
import { normalizeInlineText, normalizePassageText, normalizeQuestionText } from "./text-normalization";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { buildCanonicalSentenceInsertOptionsFrom } from "@/lib/sentence-insert-options";
import { koSetGroupId } from "@/lib/korean/sets/paper";

export {
  parseSavedPaperSettings,
  type SavedPaperBlock,
  type SavedPaperExamQuestion,
  type SavedPaperItem,
  type SavedPaperSettings,
} from "./saved-paper-types";

function asBreakBefore(value: unknown): BreakBefore {
  return value === "column" || value === "page" ? value : "auto";
}

function asObjectiveAnswerTexts(value: unknown, slots: number): string[] {
  if (!Array.isArray(value) || slots <= 0) return [];
  return value.slice(0, slots).map((text) => String(text ?? ""));
}

// ─── 문항 → BuilderQuestion (지문 결정 EXAM-PAPER-MODEL §3) ──────────────────

export type ResolvedExamQuestion = {
  question: BuilderQuestion;
  /** 인쇄할 지문 제목(정규화) — 지문 본문이 없어도 채운다(스냅숏 제목 → DB 제목 → 보관본 제목). */
  passageTitle: string;
  passageOrigin: PrintablePassageOrigin;
};

/**
 * 시험 문항(+저장 스냅숏) → BuilderQuestion. 지문은 resolvePrintablePassage 로 고르고, 발문은
 * 어법 수정형 복구(repairGrammarCorrectionQuestionText) 후 정규화한다. KO 세트 멤버 지문은
 * makePaperItem 과 같이 원문 개행을 보존한다(공유지문 병합이 normalizeKo 로 정규화).
 */
export function resolveExamQuestion(
  eq: SavedPaperExamQuestion,
  saved?: SavedPaperItem,
): ResolvedExamQuestion {
  const q = eq.question;
  const printable = resolvePrintablePassage({
    savedPassageContent: saved?.passageContent,
    savedPassageTitle: saved?.passageTitle,
    question: q,
  });
  const keepRawPassage = passageSetKindFor(q) === "ko";
  const passageContent = keepRawPassage ? printable.content : normalizePassageText(printable.content);
  const passageTitle = normalizeInlineText(printable.title);
  const passageId =
    q.passage?.id ??
    (printable.origin === "detached" && printable.detachedPassageId
      ? `detached:${printable.detachedPassageId}`
      : `saved:${q.id}`);
  const passage =
    q.passage || passageContent
      ? {
          id: passageId,
          title: passageTitle,
          content: passageContent,
          grade: q.passage?.grade ?? null,
          semester: q.passage?.semester ?? null,
          publisher: q.passage?.publisher ?? null,
          school: q.passage?.school ?? null,
        }
      : null;
  const questionText = normalizeQuestionText(
    repairGrammarCorrectionQuestionText({
      subType: q.subType,
      questionText: saved?.questionText ?? q.questionText,
      structuredData: q.structuredData,
    }),
  );
  const question: BuilderQuestion = {
    id: q.id,
    type: q.type,
    subType: q.subType,
    questionText,
    structuredData: q.structuredData,
    options: q.options,
    correctAnswer: saved?.correctAnswer ?? q.correctAnswer,
    points: saved?.points ?? eq.points ?? q.points ?? 1,
    difficulty: q.difficulty ?? "",
    tags: q.tags ?? null,
    aiGenerated: q.aiGenerated ?? false,
    approved: q.approved ?? false,
    starred: q.starred ?? false,
    createdAt: q.createdAt ?? "",
    setId: q.setId ?? null,
    ...(q.setRender ? { setRender: q.setRender } : {}),
    passage,
    explanation: q.explanation
      ? {
          id: q.explanation.id || "",
          content: q.explanation.content ?? "",
          keyPoints: q.explanation.keyPoints ?? null,
          wrongOptionExplanations: q.explanation.wrongOptionExplanations ?? null,
        }
      : null,
    collectionItems: q.collectionItems || [],
    examLinks: [],
    _count: q._count || { examLinks: 0 },
  };
  return { question, passageTitle, passageOrigin: printable.origin };
}

// ─── 저장 항목 → PaperItem ───────────────────────────────────────────────────

export function savedItemToPaperItem(
  saved: SavedPaperItem,
  eq: SavedPaperExamQuestion,
  index: number,
): PaperItem {
  // settings.blocks 의 문항 블록이 그대로 넘어오므로 블록 서식 필드(글자 크기·굵게·기울임·정렬)를 함께 읽는다.
  const questionFmt = saved as {
    blockFontPt?: number | null;
    blockBold?: boolean;
    blockItalic?: boolean;
    blockAlign?: string;
  };
  const { question: sourceQuestion, passageTitle } = resolveExamQuestion(eq, saved);
  const localId = saved.localId || `${sourceQuestion.id}-saved-${index}`;
  const passageContent = sourceQuestion.passage?.content ?? "";
  const includePassage = resolveIncludePassage({
    saved: saved.includePassage,
    question: sourceQuestion,
    setKind: passageSetKindFor(sourceQuestion),
  });
  const rawOptions = Array.isArray(saved.options)
    ? saved.options.map((option, optionIndex) => ({
        label: normalizeInlineText(option.label || String(optionIndex + 1)),
        text: normalizeQuestionText(option.text || ""),
      }))
    : parseOptions(sourceQuestion.options);
  const options =
    sourceQuestion.subType === "SENTENCE_INSERT"
      ? buildCanonicalSentenceInsertOptionsFrom(rawOptions)
      : rawOptions;
  const objectiveAnswerSlots = Math.max(0, Math.min(10, Number(saved.objectiveAnswerSlots) || 0));
  const answerSpaceLines =
    sourceQuestion.subType === "GRAMMAR_CORRECTION"
      ? 0
      : Math.max(0, Math.min(12, Number(saved.answerSpaceLines) || (options.length === 0 ? 4 : 0)));

  return {
    localId,
    questionId: sourceQuestion.id,
    sourceQuestion,
    orderNum: saved.orderNum || index + 1,
    points: saved.points || eq.points || sourceQuestion.points || 1,
    groupId:
      saved.groupId ??
      (sourceQuestion.setId ? koSetGroupId(sourceQuestion.setId) : `single:${localId}`),
    includePassage,
    passageTitle,
    passageContent,
    questionText: sourceQuestion.questionText,
    options,
    correctAnswer: saved.correctAnswer ?? sourceQuestion.correctAnswer ?? "",
    answerSpaceLines,
    objectiveAnswerSlots,
    objectiveAnswerTexts: asObjectiveAnswerTexts(saved.objectiveAnswerTexts, objectiveAnswerSlots),
    sectionTitle: saved.sectionTitle || "",
    teacherNote: saved.teacherNote || "",
    breakBefore: asBreakBefore(saved.breakBefore),
    keepWithPrev: Boolean(saved.keepWithPrev),
    blockType: "question",
    locked: false,
    blockTitle: "",
    blockText: "",
    blockAlign:
      questionFmt.blockAlign === "center" || questionFmt.blockAlign === "right"
        ? questionFmt.blockAlign
        : "left",
    blockFontSize: "md",
    blockBold: typeof questionFmt.blockBold === "boolean" ? questionFmt.blockBold : false,
    blockItalic: typeof questionFmt.blockItalic === "boolean" ? questionFmt.blockItalic : false,
    blockFontPt:
      typeof questionFmt.blockFontPt === "number" && Number.isFinite(questionFmt.blockFontPt)
        ? Math.min(60, Math.max(5, Math.round(questionFmt.blockFontPt)))
        : null,
    blockAccentColor: "#2563EB",
    dividerStyle: "solid",
    dividerThickness: 1,
    spacerHeight: 32,
    imageDataUrl: null,
    imageAlt: "",
    imageWidth: 70,
  };
}

export function savedBlockToPaperItem(saved: SavedPaperBlock, index: number): PaperItem | null {
  const blockType = saved.blockType;
  if (
    blockType !== "text" &&
    blockType !== "section" &&
    blockType !== "divider" &&
    blockType !== "spacer" &&
    blockType !== "image"
  ) {
    return null;
  }

  const base = makeCustomPaperBlock(blockType as InsertablePaperBlockType, index + 1);
  const localId = saved.localId || base.localId;
  const blockText = saved.blockText ?? saved.questionText ?? base.blockText;
  const blockTitle = saved.blockTitle ?? saved.sectionTitle ?? base.blockTitle;
  const objectiveAnswerSlots = Math.max(
    0,
    Math.min(10, Number(saved.objectiveAnswerSlots) || base.objectiveAnswerSlots),
  );

  return {
    ...base,
    localId,
    questionId: `custom:${localId}`,
    sourceQuestion: {
      ...base.sourceQuestion,
      id: localId,
      questionText: blockText || blockTitle || base.sourceQuestion.questionText,
    },
    groupId: saved.groupId ?? `block:${localId}`,
    questionText: blockText || blockTitle || base.questionText,
    breakBefore: asBreakBefore(saved.breakBefore),
    keepWithPrev: Boolean(saved.keepWithPrev),
    locked: Boolean(saved.locked),
    blockTitle,
    blockText,
    blockAlign: saved.blockAlign === "center" || saved.blockAlign === "right" ? saved.blockAlign : "left",
    blockFontSize:
      saved.blockFontSize === "sm" || saved.blockFontSize === "lg" ? saved.blockFontSize : base.blockFontSize,
    blockBold: typeof saved.blockBold === "boolean" ? saved.blockBold : base.blockBold,
    blockItalic: typeof saved.blockItalic === "boolean" ? saved.blockItalic : base.blockItalic,
    blockFontPt:
      typeof saved.blockFontPt === "number" && Number.isFinite(saved.blockFontPt)
        ? Math.min(60, Math.max(5, Math.round(saved.blockFontPt)))
        : null,
    blockAccentColor: saved.blockAccentColor || base.blockAccentColor,
    dividerStyle:
      saved.dividerStyle === "dashed" || saved.dividerStyle === "dotted" ? saved.dividerStyle : "solid",
    dividerThickness: Math.max(1, Math.min(8, Number(saved.dividerThickness) || base.dividerThickness)),
    spacerHeight: Math.max(8, Math.min(160, Number(saved.spacerHeight) || base.spacerHeight)),
    imageDataUrl: saved.imageDataUrl ?? null,
    imageAlt: saved.imageAlt || "",
    imageWidth: Math.max(20, Math.min(100, Number(saved.imageWidth) || base.imageWidth)),
    objectiveAnswerSlots,
    objectiveAnswerTexts: asObjectiveAnswerTexts(saved.objectiveAnswerTexts, objectiveAnswerSlots),
  };
}

/** settings 없는 시험지(또는 새로 담은 문항) 한 개 → PaperItem. 단일 문항 내보내기도 이 경로다. */
export function examQuestionToPaperItem(eq: SavedPaperExamQuestion, orderNum: number): PaperItem {
  const { question } = resolveExamQuestion(eq);
  const item = makePaperItem(question, orderNum, []);
  return {
    ...item,
    points: eq.points || question.points || 1,
    // 저장값이 없으므로 makePaperItem 의 기본값(D)이 곧 판정값이다. 여기에 인쇄 강제 규칙
    // (ALWAYS_INLINE 등 — 웹이 토글과 무관하게 그리는 유형)을 같은 함수로 얹어 서버 출력과 맞춘다.
    includePassage: resolveIncludePassage({
      saved: item.includePassage,
      question: item.sourceQuestion,
      setKind: passageSetKindFor(item.sourceQuestion),
    }),
  };
}

// ─── 시험지 전체 ─────────────────────────────────────────────────────────────

function savedSourceOf(settings: SavedPaperSettings | null): "v2-blocks" | "items" | null {
  if (settings?.source === "exam-paper-builder-v2" && Array.isArray(settings.blocks) && settings.blocks.length > 0) {
    return "v2-blocks";
  }
  if (
    (settings?.source === "exam-paper-builder-v1" || settings?.source === "exam-paper-builder-v2") &&
    Array.isArray(settings.items) &&
    settings.items.length > 0
  ) {
    return "items";
  }
  return null;
}

/**
 * 저장된 시험지 → PaperItem[] (웹·HWPX·DOCX 공용 정본). 문항 순번(orderNum)은 문항 블록만 1부터.
 * 저장 항목의 questionId 가 시험 문항에 없으면(삭제·휴지통) 그 항목은 빠진다.
 */
export function buildPaperItemsFromExam(
  examQuestions: readonly SavedPaperExamQuestion[],
  settings: SavedPaperSettings | null,
): PaperItem[] {
  const byQuestionId = new Map(examQuestions.map((eq) => [eq.question.id, eq]));
  const source = savedSourceOf(settings);

  if (source === "v2-blocks") {
    const blocks = (settings?.blocks ?? [])
      .map((saved, index) => {
        if (saved.blockType === "question") {
          if (!saved.questionId) return null;
          const eq = byQuestionId.get(saved.questionId);
          return eq ? savedItemToPaperItem({ ...saved, blockType: "question" }, eq, index) : null;
        }
        return savedBlockToPaperItem(saved, index);
      })
      .filter((item): item is PaperItem => Boolean(item));
    let questionOrder = 0;
    return blocks.map((item) =>
      item.blockType === "question" ? { ...item, orderNum: (questionOrder += 1) } : { ...item, orderNum: 0 },
    );
  }

  if (source === "items") {
    return (settings?.items ?? [])
      .map((saved, index) => {
        if (!saved.questionId) return null;
        const eq = byQuestionId.get(saved.questionId);
        return eq ? savedItemToPaperItem(saved, eq, index) : null;
      })
      .filter((item): item is PaperItem => Boolean(item))
      .sort((a, b) => a.orderNum - b.orderNum)
      .map((item, index) => ({ ...item, orderNum: index + 1 }));
  }

  return examQuestions.map((eq, index) => examQuestionToPaperItem(eq, index + 1));
}

/**
 * buildPaperItemsFromExam + 문항별 지문 원천(스냅숏·DB·보관본·없음). 「원문 지문 없음」 경고 UI 와
 * 감사 스크립트용. passageOrigins 의 키는 PaperItem.localId.
 */
export function buildPaperItemsWithPassageOrigins(
  examQuestions: readonly SavedPaperExamQuestion[],
  settings: SavedPaperSettings | null,
): { items: PaperItem[]; passageOrigins: Map<string, PrintablePassageOrigin> } {
  const items = buildPaperItemsFromExam(examQuestions, settings);
  const byQuestionId = new Map(examQuestions.map((eq) => [eq.question.id, eq]));
  const savedByQuestionId = new Map<string, SavedPaperItem>();
  const source = savedSourceOf(settings);
  const savedList: SavedPaperItem[] =
    source === "v2-blocks"
      ? ((settings?.blocks ?? []).filter((b) => b.blockType === "question") as SavedPaperItem[])
      : source === "items"
        ? settings?.items ?? []
        : [];
  for (const saved of savedList) {
    if (saved.questionId && !savedByQuestionId.has(saved.questionId)) {
      savedByQuestionId.set(saved.questionId, saved);
    }
  }
  const passageOrigins = new Map<string, PrintablePassageOrigin>();
  for (const item of items) {
    if (item.blockType !== "question") continue;
    const eq = byQuestionId.get(item.questionId);
    if (!eq) continue;
    const saved = source ? savedByQuestionId.get(item.questionId) : undefined;
    passageOrigins.set(item.localId, resolveExamQuestion(eq, saved).passageOrigin);
  }
  return { items, passageOrigins };
}

/**
 * 「원문 지문 없음」 단일 판정 — 경고 UI(배너·칩·토스트)·감사(export-parity-audit)가 이 함수를 쓴다
 * (백필은 같은 passage-policy.isSourcePassageMissing 을 시험지 밖 문맥으로 쓴다).
 * 참 = 이 문항이 찍을 지문이 없는데, 지문이 있었다면 찍었을 것(26-09-30 감독 결정):
 *  - 찍을 지문 = buildGroups·조판과 같은 폴백(item.passageContent → sourceQuestion.passage.content). 빌더에서 지문
 *    박스 글을 다 지워도 원문이 찍히므로 경고하지 않는다.
 *  - 「찍었을 것」 = wouldPrintSourcePassage(저장값 = item.includePassage, 세트 종류): 강제 유형은 항상, 저장값 false(끌 수
 *    있는 유형·정답 노출형)는 선생님 선택이라 아니다, 저장값 없음은 기본값(defaultIncludePassage 가 지문이 있다고 보고 정한 값).
 */
export function isPaperItemSourcePassageMissing(item: PaperItem): boolean {
  if (item.blockType !== "question") return false;
  return isPaperItemSourcePassageMissingFor(item, item.passageContent || item.sourceQuestion.passage?.content || "");
}

/** isPaperItemSourcePassageMissing 에서 「찍을 지문」만 바꿔 넣는다(HWPX·DOCX 기준 = 서버 지문 결정 EXAM-PAPER-MODEL §3 등). */
export function isPaperItemSourcePassageMissingFor(item: PaperItem, printedContent: string): boolean {
  if (item.blockType !== "question") return false;
  return isSourcePassageMissing(item.sourceQuestion, printedContent, {
    saved: item.includePassage,
    setKind: passageSetKindFor(item.sourceQuestion),
  });
}
