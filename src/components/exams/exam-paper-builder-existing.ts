"use client";

// 빌더 재오픈(저장된 시험지 → 편집 상태). 「무엇을 찍을지」는 상세·인쇄·HWPX·DOCX 와 같은 공용 정본
// (paper-builder/saved-paper-items · paper-layout-defaults)을 그대로 쓴다 — 예전에는 상세 미리보기와
// 거의 같은 코드를 복제해 includePassage·기출 세트·어법 수정형·삽입 선지 정본화가 서로 달랐다
// (26-09-30 CORE-MODEL, docs/EXAM-PAPER-MODEL.md §2·§3). 기존 import 이름은 그대로 유지한다.
import { formatDateInput } from "./paper-builder/paper-item-model";
import {
  buildPaperItemsFromExam as buildPaperItemsFromExamQuestions,
  parseSavedPaperSettings,
  type SavedPaperBlock,
  type SavedPaperExamQuestion,
  type SavedPaperItem,
  type SavedPaperSettings,
} from "./paper-builder/saved-paper-items";
import type { PaperItem } from "./paper-builder/types";

export {
  asDensity,
  asPaperSize,
  asPaperTemplate,
  asPassageStyle,
} from "./paper-builder/paper-layout-defaults";

export type SavedBuilderItem = SavedPaperItem;
export type SavedBuilderBlock = SavedPaperBlock;
export type SavedBuilderSettings = SavedPaperSettings;

export function parseBuilderSettings(raw: string | null): SavedBuilderSettings | null {
  return parseSavedPaperSettings(raw);
}

export function buildPaperItemsFromExam(
  exam: { questions: readonly SavedPaperExamQuestion[] },
  settings: SavedBuilderSettings | null,
): PaperItem[] {
  return buildPaperItemsFromExamQuestions(exam.questions, settings);
}

export function formatExamDate(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatDateInput(date);
}
