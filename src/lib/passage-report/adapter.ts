import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";

import type { PassageAnalysisData } from "@/types/passage-analysis";

import {
  type Block,
  type BlockKind,
  type Page,
  type ReportDocument,
  type TemplateId,
  emptyTiptapDoc,
} from "./schema";
import { getTemplate, buildExtraPage } from "./templates";
import type { PageTemplate, SlotPreset } from "./templates/types";

/**
 * 분석 결과 → A4 보고서 문서로 변환 (deterministic, LLM 없이).
 *
 * 역할:
 *   1. AI 생성 실패 시 폴백
 *   2. 기존 PassageAnalysis 보유 사용자의 1클릭 변환 경로
 *
 * 사용:
 *   const doc = buildReportFromAnalysis(passage, analysis, { templateId: "modern" });
 *   await prisma.passageReport.create({ data: { ..., pages: doc.pages, theme: doc.theme } });
 */

export interface BuildReportInput {
  passage: PassagePayload;
  analysis: PassageAnalysisData;
  templateId: TemplateId;
  title?: string;
}

export interface PassagePayload {
  id: string;
  title: string;
  content: string;
  source?: string | null;
  publisher?: string | null;
  grade?: number | null;
  semester?: string | null;
  unit?: string | null;
}

export function buildReportFromAnalysis(input: BuildReportInput): ReportDocument {
  const { passage, analysis, templateId } = input;
  const template = getTemplate(templateId);
  const id = `rep-${randomUUID()}`;
  const title = input.title ?? `${passage.title} - 학습자료`;

  // 1) 기본 3페이지 슬롯 매핑
  const slotsByPage = template.pages.map((page) => ({
    pageMeta: page,
    blocks: fillSlotsForPage(page, passage, analysis),
  }));

  // 2) 어휘/문법이 많아 슬롯에 다 못 들어가면 추가 페이지 생성
  const usedVocab = countUsage(slotsByPage, "vocab-grid", "glossary-table");
  const usedGrammar = countUsage(slotsByPage, "grammar-card");

  const remainingVocab = (analysis.vocabulary?.length ?? 0) - usedVocab.itemsConsumed;
  const remainingGrammar = (analysis.grammarPoints?.length ?? 0) - usedGrammar.itemsConsumed;

  const extraPages: { pageMeta: PageTemplate; blocks: Block[] }[] = [];
  let nextPageNum = template.pages.length + 1;

  if (remainingVocab > 0) {
    const extra = buildExtraPage(templateId, nextPageNum++, "glossary-table");
    const blocks = fillExtraPageBlocks(extra, "glossary-table", {
      vocabSlice: analysis.vocabulary.slice(usedVocab.itemsConsumed),
    });
    extraPages.push({ pageMeta: extra, blocks });
  }

  if (remainingGrammar > 0 && nextPageNum <= 20) {
    const extra = buildExtraPage(templateId, nextPageNum++, "grammar-card");
    const blocks = fillExtraPageBlocks(extra, "grammar-card", {
      grammarSlice: analysis.grammarPoints.slice(usedGrammar.itemsConsumed),
    });
    extraPages.push({ pageMeta: extra, blocks });
  }

  const allPages = [...slotsByPage, ...extraPages];
  const pages: Page[] = allPages.map((p, idx) => ({
    id: `page-${idx + 1}`,
    pageNumber: idx + 1,
    size: "A4" as const,
    orientation: "portrait" as const,
    margin: p.pageMeta.margin ?? { top: 12, right: 10, bottom: 10, left: 10 },
    background: p.pageMeta.background ?? { color: "#FFFFFF", pattern: "none" },
    showHeader: true,
    showFooter: true,
    blocks: p.blocks,
  }));

  return {
    id,
    title,
    theme: template.theme,
    pages,
  };
}

// ─────────────────────────────────────────────────────────────
// 페이지 슬롯 채우기
// ─────────────────────────────────────────────────────────────

function fillSlotsForPage(
  pageTemplate: PageTemplate,
  passage: PassagePayload,
  analysis: PassageAnalysisData,
): Block[] {
  const blocks: Block[] = [];

  // 각 sourceKind 별 다음에 가져갈 인덱스 추적
  const cursors = {
    vocab: 0,
    grammar: 0,
    syntax: 0,
    examPoint: 0,
  };

  for (const slot of pageTemplate.slots) {
    const block = createBlockFromSlot(slot, passage, analysis, cursors);
    if (block) blocks.push(block);
  }
  return blocks;
}

function createBlockFromSlot(
  slot: SlotPreset,
  passage: PassagePayload,
  analysis: PassageAnalysisData,
  cursors: { vocab: number; grammar: number; syntax: number; examPoint: number },
): Block | null {
  const baseGeo = {
    id: `blk-${slot.slotId}-${randomUUID().slice(0, 8)}`,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    rotation: slot.rotation ?? 0,
    zIndex: slot.zIndex ?? 0,
    locked: false,
    style: slot.defaultStyle ?? {},
  };

  switch (slot.blockKind) {
    case "header": {
      return {
        ...baseGeo,
        kind: "header",
        data: {
          title: emptyTiptapDoc(passage.title),
          subtitle: emptyTiptapDoc(
            [passage.publisher, passage.unit].filter(Boolean).join(" · ") || "",
          ),
          badge: gradeBadge(passage),
        },
      };
    }

    case "passage-body": {
      return {
        ...baseGeo,
        kind: "passage-body",
        data: {
          sentences: (analysis.sentences ?? []).map((s) => ({
            index: s.index,
            english: s.english,
            korean: s.korean,
            annotations: [],
          })),
          showKorean: true,
          numbering: "decimal",
          lineSpacing: 1.5,
        },
      };
    }

    case "vocab-grid": {
      const capacity = estimateVocabCapacity(slot);
      const slice = (analysis.vocabulary ?? []).slice(cursors.vocab, cursors.vocab + capacity);
      cursors.vocab += slice.length;
      if (slice.length === 0) return null;
      return {
        ...baseGeo,
        kind: "vocab-grid",
        data: {
          columns: slot.w >= 130 ? 3 : slot.w >= 90 ? 2 : 1,
          items: slice.map((v, idx) => ({
            id: `voc-${cursors.vocab - slice.length + idx}`,
            word: v.word,
            partOfSpeech: v.partOfSpeech,
            meaning: v.meaning,
            example: v.examplePhrase,
            pronunciation: v.pronunciation,
            highlight: v.difficulty === "advanced",
          })),
          showExample: true,
          showPronunciation: false,
        },
      };
    }

    case "grammar-card": {
      const item = (analysis.grammarPoints ?? [])[cursors.grammar];
      cursors.grammar += 1;
      if (!item) return null;
      return {
        ...baseGeo,
        kind: "grammar-card",
        data: {
          pattern: item.pattern,
          explanation: emptyTiptapDoc(item.studentExplanation ?? item.explanation),
          examples: (item.examples ?? []).slice(0, 3),
          level:
            item.level === "basic" || item.level === "advanced" ? item.level : "intermediate",
        },
      };
    }

    case "syntax-breakdown": {
      const item = (analysis.syntaxAnalysis ?? [])[cursors.syntax];
      cursors.syntax += 1;
      if (!item) return null;
      return {
        ...baseGeo,
        kind: "syntax-breakdown",
        data: {
          sentence: item.keyPhrase ?? "",
          sentenceIndex: item.sentenceIndex,
          chunks: parseChunkReading(item.chunkReading),
          notes: emptyTiptapDoc(item.plainExplanation ?? item.readingTip ?? ""),
        },
      };
    }

    case "question": {
      const item = (analysis.examDesign?.paraphrasableSegments ?? [])[cursors.examPoint] ??
        (analysis.examDesign?.structureTransformPoints ?? [])[cursors.examPoint];
      cursors.examPoint += 1;
      if (!item) return null;
      const stem =
        "questionExample" in item && item.questionExample
          ? item.questionExample
          : item.original;
      return {
        ...baseGeo,
        kind: "question",
        data: {
          questionType: "PARAPHRASE",
          stem: emptyTiptapDoc(stem),
          showAnswer: false,
          explanation: emptyTiptapDoc(item.reason ?? ""),
        },
      };
    }

    case "summary-callout": {
      const main = analysis.structure?.mainIdea ?? "";
      const keyPoints = (analysis.structure?.keyPoints ?? []).slice(0, 3).join("\n");
      const body = main + (keyPoints ? `\n\n${keyPoints}` : "");
      return {
        ...baseGeo,
        kind: "summary-callout",
        data: {
          body: emptyTiptapDoc(body),
          icon: "lightbulb",
          variant: "soft",
          title: "핵심 요지",
        },
      };
    }

    case "analysis-box": {
      const flow = (analysis.structure?.logicFlow ?? [])
        .map((f) => `${f.role}: ${f.summary}`)
        .join("\n");
      return {
        ...baseGeo,
        kind: "analysis-box",
        data: {
          title: "논리 흐름",
          body: emptyTiptapDoc(flow || "지문 논리 흐름 분석"),
        },
      };
    }

    case "glossary-table": {
      const capacity = Math.max(4, Math.floor(slot.h / 6));
      const slice = (analysis.vocabulary ?? []).slice(cursors.vocab, cursors.vocab + capacity);
      cursors.vocab += slice.length;
      if (slice.length === 0) return null;
      return {
        ...baseGeo,
        kind: "glossary-table",
        data: {
          headers: ["단어", "품사", "뜻", "예시"],
          rows: slice.map((v) => [
            v.word,
            v.partOfSpeech ?? "",
            v.meaning,
            v.examplePhrase ?? "",
          ]),
          striped: true,
        },
      };
    }

    case "divider": {
      return {
        ...baseGeo,
        kind: "divider",
        data: {
          variant: "line",
          color: slot.defaultStyle?.color,
        },
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 추가 페이지 헬퍼
// ─────────────────────────────────────────────────────────────

function fillExtraPageBlocks(
  pageMeta: PageTemplate,
  kind: BlockKind,
  payload: {
    vocabSlice?: PassageAnalysisData["vocabulary"];
    grammarSlice?: PassageAnalysisData["grammarPoints"];
  },
): Block[] {
  const blocks: Block[] = [];
  for (const slot of pageMeta.slots) {
    if (slot.blockKind !== kind) continue;
    if (kind === "glossary-table" && payload.vocabSlice) {
      blocks.push({
        id: `blk-${slot.slotId}-${randomUUID().slice(0, 8)}`,
        kind: "glossary-table",
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: slot.h,
        rotation: slot.rotation ?? 0,
        zIndex: slot.zIndex ?? 0,
        locked: false,
        style: slot.defaultStyle ?? {},
        data: {
          headers: ["단어", "품사", "뜻", "예시"],
          rows: payload.vocabSlice.map((v) => [
            v.word,
            v.partOfSpeech ?? "",
            v.meaning,
            v.examplePhrase ?? "",
          ]),
          striped: true,
        },
      });
    } else if (kind === "grammar-card" && payload.grammarSlice) {
      // 첫 번째 grammar 슬롯에 전체 표 형태로 통합
      const item = payload.grammarSlice[0];
      if (item) {
        blocks.push({
          id: `blk-${slot.slotId}-${randomUUID().slice(0, 8)}`,
          kind: "grammar-card",
          x: slot.x,
          y: slot.y,
          w: slot.w,
          h: slot.h,
          rotation: slot.rotation ?? 0,
          zIndex: slot.zIndex ?? 0,
          locked: false,
          style: slot.defaultStyle ?? {},
          data: {
            pattern: item.pattern,
            explanation: emptyTiptapDoc(
              payload.grammarSlice
                .map((g) => `${g.pattern} — ${g.studentExplanation ?? g.explanation}`)
                .join("\n\n"),
            ),
            examples: (item.examples ?? []).slice(0, 3),
            level: "intermediate",
          },
        });
      }
    }
  }
  return blocks;
}

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

function countUsage(
  slotsByPage: { pageMeta: PageTemplate; blocks: Block[] }[],
  ...kinds: BlockKind[]
): { itemsConsumed: number } {
  let total = 0;
  for (const { blocks } of slotsByPage) {
    for (const b of blocks) {
      if (!kinds.includes(b.kind)) continue;
      if (b.kind === "vocab-grid") total += b.data.items.length;
      if (b.kind === "glossary-table") total += b.data.rows.length;
      if (b.kind === "grammar-card") total += 1;
    }
  }
  return { itemsConsumed: total };
}

function estimateVocabCapacity(slot: SlotPreset): number {
  // 카드 1개당 약 18mm × 60mm 가정. 슬롯 면적에 따라 가변.
  const area = slot.w * slot.h;
  const perCard = slot.w >= 130 ? 18 * 50 : slot.w >= 90 ? 18 * 60 : 22 * 80;
  return Math.max(2, Math.min(12, Math.floor(area / perCard)));
}

function parseChunkReading(chunkReading: string): { text: string; role: string }[] {
  if (!chunkReading) return [];
  return chunkReading
    .split("/")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((text) => ({ text, role: "" }));
}

function gradeBadge(passage: PassagePayload): string | undefined {
  const parts: string[] = [];
  if (passage.grade) parts.push(`${passage.grade}학년`);
  if (passage.semester === "FIRST") parts.push("1학기");
  if (passage.semester === "SECOND") parts.push("2학기");
  return parts.length ? parts.join(" ") : undefined;
}

// ─────────────────────────────────────────────────────────────
// Content hash — PDF 캐시 키 / 변경 감지
// ─────────────────────────────────────────────────────────────

export function computeReportContentHash(doc: Pick<ReportDocument, "pages" | "theme">): string {
  const json = JSON.stringify({ pages: doc.pages, theme: doc.theme });
  return createHash("sha1").update(json).digest("hex");
}
