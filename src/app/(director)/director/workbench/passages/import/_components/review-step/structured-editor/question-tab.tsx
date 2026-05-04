"use client";

// ============================================================================
// QuestionTab — structured editor tab for QUESTION_STEM + CHOICE blocks.
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { useMemo } from "react";
import type { BlockType } from "@/lib/extraction/block-types";
import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import { EmptyEditor } from "./shared-pieces";

export function QuestionTab({
  items,
  selectedItem,
  onChangeContent,
  onChangeType,
}: {
  items: ExtractionItemSnapshot[];
  selectedItem: ExtractionItemSnapshot | null;
  onChangeContent: (id: string, content: string) => void;
  onChangeType: (id: string, type: BlockType) => void;
}) {
  // Find the passage context of the current selection
  const contextGroupId =
    selectedItem?.blockType === "PASSAGE_BODY"
      ? selectedItem.groupId
      : selectedItem?.groupId ?? null;

  const questions = useMemo(
    () =>
      items.filter(
        (it) =>
          it.blockType === "QUESTION_STEM" &&
          (contextGroupId ? it.groupId === contextGroupId : true),
      ),
    [items, contextGroupId],
  );

  if (questions.length === 0) {
    return (
      <EmptyEditor hint="이 지문에 연결된 문제가 없습니다. 블록 타입을 '문제'로 바꾸면 여기 표시됩니다." />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {questions.map((q) => {
        const choices = items
          .filter((it) => it.blockType === "CHOICE" && it.parentItemId === q.id)
          .sort((a, b) => (a.localOrder ?? 0) - (b.localOrder ?? 0));
        const qMeta = q.questionMeta as
          | { number?: number; answerChoice?: number; points?: number }
          | null;
        return (
          <div
            key={q.id}
            className="mb-5 rounded-xl border border-slate-200 bg-white p-4 last:mb-0"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                문제 {qMeta?.number ?? "?"}
              </span>
              <span className="text-[10px] text-slate-400">
                배점 {qMeta?.points ?? "—"}
              </span>
              <button
                onClick={() => onChangeType(q.id, "NOISE")}
                className="ml-auto text-[10px] text-slate-400 hover:text-rose-600"
                aria-label="이 문제를 무시 처리"
              >
                무시
              </button>
            </div>
            <textarea
              value={q.content}
              onChange={(e) => onChangeContent(q.id, e.target.value)}
              className="block w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] leading-relaxed text-slate-800 focus:border-sky-400 focus:outline-none"
              rows={Math.max(2, Math.ceil(q.content.length / 60))}
              aria-label="문제 지시문"
            />
            <div className="mt-2 space-y-1">
              {choices.length === 0 ? (
                <div className="text-[11px] text-slate-400">
                  선지가 없습니다. 블록 트리에서 선지 블록으로 바꾸면 표시됩니다.
                </div>
              ) : (
                choices.map((c, i) => {
                  const cMeta = c.choiceMeta as {
                    index?: number;
                    isAnswer?: boolean;
                  } | null;
                  return (
                    <div
                      key={c.id}
                      className="flex items-start gap-2 rounded-md bg-slate-50 px-2 py-1.5"
                    >
                      <span className="mt-0.5 w-4 shrink-0 text-center text-[11px] font-bold text-slate-600">
                        {cMeta?.index ?? i + 1}
                      </span>
                      <textarea
                        value={c.content}
                        onChange={(e) =>
                          onChangeContent(c.id, e.target.value)
                        }
                        rows={1}
                        className="min-w-0 flex-1 resize-none border-none bg-transparent text-[12px] text-slate-700 focus:outline-none"
                        aria-label={`선지 ${cMeta?.index ?? i + 1}`}
                      />
                      {cMeta?.isAnswer ? (
                        <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold text-emerald-700">
                          정답
                        </span>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
