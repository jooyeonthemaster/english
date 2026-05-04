// ============================================================================
// buildCommitPayload — mode-specific commit payload builder. Extracted
// from review-step.tsx during mechanical split.
// ============================================================================

import { MIN_COMMIT_PASSAGE_LENGTH } from "@/lib/extraction/constants";
import { getModeConfig } from "@/lib/extraction/modes";
import type {
  ExtractionItemSnapshot,
  ResultDraft,
} from "@/lib/extraction/types";
import { sourceDraftToPayload } from "../source-draft";
import type { SourceMaterialDraft } from "../types";

/** Build the mode-specific commit payload. Returns null when nothing to save. */
export function buildCommitPayload({
  mode,
  items,
  drafts,
  sourceDraft,
  originalFileName,
}: {
  mode: ReturnType<typeof getModeConfig>["id"];
  items: ExtractionItemSnapshot[];
  drafts: ResultDraft[];
  sourceDraft: SourceMaterialDraft;
  originalFileName: string | null;
}): Record<string, unknown> | null {
  const sm = sourceDraftToPayload(sourceDraft);

  // Legacy fallback when no items
  if (items.length === 0) {
    const results = drafts
      .filter((d) => d.status !== "SKIPPED")
      .filter((d) => d.content.trim().length >= MIN_COMMIT_PASSAGE_LENGTH)
      .map((d) => ({
        passageOrder: d.passageOrder,
        title: d.title?.trim() || `지문 ${d.passageOrder + 1}`,
        content: d.content,
        sourcePageIndex: d.sourcePageIndex,
      }));
    if (results.length === 0) return null;
    return {
      collectionName:
        originalFileName ||
        `일괄 등록 ${new Date().toLocaleDateString("ko-KR")}`,
      results,
    };
  }

  // Build passage/question collections from items
  const live = items.filter((it) => it.status !== "SKIPPED");

  const passageItems = live.filter((it) => it.blockType === "PASSAGE_BODY");
  const questionItems = live.filter((it) => it.blockType === "QUESTION_STEM");
  const choiceItems = live.filter((it) => it.blockType === "CHOICE");

  const passages = passageItems
    .filter(
      (p) =>
        p.content.trim().length >= MIN_COMMIT_PASSAGE_LENGTH ||
        mode !== "PASSAGE_ONLY",
    )
    .map((p, i) => ({
      passageOrder: i,
      title:
        p.title?.trim() ||
        (p.content || "")
          .slice(0, 40)
          .replace(/\s+/g, " ")
          .trim() ||
        `지문 ${i + 1}`,
      content: p.content,
      sourcePageIndex:
        p.sourcePageIndex.length > 0 ? p.sourcePageIndex : [0],
      sourceItemId: p.id,
    }));

  if (passages.length === 0 && mode === "PASSAGE_ONLY") return null;

  if (mode === "PASSAGE_ONLY") {
    return {
      mode: "PASSAGE_ONLY" as const,
      collectionName:
        originalFileName ||
        `일괄 등록 ${new Date().toLocaleDateString("ko-KR")}`,
      sourceMaterial: sm,
      passages,
    };
  }

  // Build question payload (M2/M4)
  //
  // P0-8 — 질문-지문 1:1 매칭 정확성.
  // 이전 구현은 `passages.findIndex(p => src.groupId === q.groupId)`로 단순
  // groupId 일치만 검사했다. M4에서 하나의 그룹(공통 지문 2~4번)을 여러 지문이
  // 공유하거나, groupId가 동일한 다수 지문이 있으면 항상 "첫" 지문에만 붙어
  // 나머지 지문의 question 연결이 깨졌다.
  //
  // 새 전략:
  //   (a) question.passageMeta.passageItemId 가 있으면 그것을 우선 신뢰.
  //   (b) passage.passageMeta.questionRange 또는 .questionNumbers 가 있고
  //       question.questionMeta.number 가 그 범위에 속하면 매칭.
  //   (c) 그 외에는 동일 groupId 내에서 order가 가장 가까운(질문보다 앞선 마지막)
  //       지문을 선택 — 여러 지문이 같은 group에 있어도 근접성으로 분기.
  const resolveParentPassageIndex = (q: ExtractionItemSnapshot): number => {
    const qMeta = q.passageMeta as { passageItemId?: string } | null;
    const directId = qMeta?.passageItemId;
    if (directId) {
      const hit = passages.findIndex((p) => p.sourceItemId === directId);
      if (hit >= 0) return hit;
    }
    const qNumber = (q.questionMeta as { number?: number } | null)?.number;
    if (qNumber != null) {
      const byRange = passages.findIndex((p) => {
        const src = passageItems.find((pi) => pi.id === p.sourceItemId);
        const pMeta = src?.passageMeta as
          | {
              questionRange?: string;
              questionNumbers?: number[];
            }
          | null;
        if (pMeta?.questionNumbers?.includes(qNumber)) return true;
        const range = pMeta?.questionRange;
        if (typeof range === "string") {
          // 범위 구분자: 틸드(~), ASCII 하이픈(-), EN-DASH(–), EM-DASH(—),
          // 전각 물결(～). Gemini/OCR 출력은 기기별 폰트·언어팩에 따라 다섯 기호
          // 모두 등장 가능 — 하나라도 누락되면 "2~4" 공통 지문이 질문에 못 붙는다.
          const m = range.match(/(\d+)\s*[~\-–—～]\s*(\d+)/);
          if (m) {
            const lo = Number(m[1]);
            const hi = Number(m[2]);
            if (!Number.isNaN(lo) && !Number.isNaN(hi))
              return qNumber >= Math.min(lo, hi) && qNumber <= Math.max(lo, hi);
          }
          const single = Number(range);
          if (!Number.isNaN(single) && qNumber === single) return true;
        }
        return false;
      });
      if (byRange >= 0) return byRange;
    }
    // Fallback: 같은 groupId 내에서 order가 질문보다 앞선 마지막 지문.
    if (q.groupId != null) {
      const candidates = passageItems
        .filter((p) => p.groupId === q.groupId && p.order < q.order)
        .sort((a, b) => b.order - a.order);
      const best = candidates[0];
      if (best) {
        const idx = passages.findIndex((p) => p.sourceItemId === best.id);
        if (idx >= 0) return idx;
      }
      // order 정보가 없거나 모두 질문 뒤에 있으면 단순 첫 매치로 폴백
      const any = passages.findIndex((p) => {
        const src = passageItems.find((pi) => pi.id === p.sourceItemId);
        return src != null && src.groupId === q.groupId;
      });
      if (any >= 0) return any;
    }
    return -1;
  };

  const questions = questionItems.map((q, i) => {
    const qMeta = q.questionMeta as
      | { number?: number; answerChoice?: number; points?: number }
      | null;
    const qChoices = choiceItems
      .filter((c) => c.parentItemId === q.id)
      .sort((a, b) => (a.localOrder ?? 0) - (b.localOrder ?? 0))
      .map((c) => c.content);
    const correct = qMeta?.answerChoice != null ? String(qMeta.answerChoice) : undefined;
    const parentPassage = resolveParentPassageIndex(q);
    const questionPayload: Record<string, unknown> = {
      questionOrder: i,
      stem: q.content,
      sourceItemIds: [q.id, ...choiceItems
        .filter((c) => c.parentItemId === q.id)
        .map((c) => c.id)],
    };
    if (qMeta?.number != null) questionPayload.questionNumber = qMeta.number;
    if (qChoices.length > 0) questionPayload.choices = qChoices;
    if (correct) questionPayload.correctAnswer = correct;
    if (qMeta?.points != null) questionPayload.points = qMeta.points;
    if (parentPassage >= 0) questionPayload.passageOrder = parentPassage;
    return questionPayload;
  });

  if (mode === "QUESTION_SET") {
    if (passages.length === 0 || questions.length === 0) return null;
    return {
      mode: "QUESTION_SET" as const,
      sourceMaterial: sm,
      passages,
      questions,
    };
  }

  if (mode === "FULL_EXAM") {
    if (passages.length === 0 || questions.length === 0) return null;
    // Build PassageBundle entries: passages that share a groupId with multiple questions
    const bundles: Array<{
      orderInMaterial: number;
      sharedLabel?: string;
      passageOrder: number;
      questionOrders: number[];
    }> = [];
    passages.forEach((p, pIdx) => {
      const src = passageItems.find((pi) => pi.id === p.sourceItemId);
      if (!src) return;
      const qOrders = questions
        .map((q, qi) => ({ q, qi }))
        .filter(({ q }) => q.passageOrder === pIdx)
        .map(({ qi }) => qi);
      if (qOrders.length > 1) {
        bundles.push({
          orderInMaterial: pIdx,
          passageOrder: pIdx,
          questionOrders: qOrders,
        });
      }
    });

    return {
      mode: "FULL_EXAM" as const,
      sourceMaterial: sm,
      exam: {
        title: sourceDraft.title || originalFileName || "시험",
        type: "MOCK" as const,
      },
      passages,
      questions,
      bundles: bundles.length > 0 ? bundles : undefined,
    };
  }

  return null;
}
