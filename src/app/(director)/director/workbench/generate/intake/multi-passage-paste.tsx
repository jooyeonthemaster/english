"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardPaste, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PassageRow,
  makeEmptyRow,
  MIN_CONTENT_CHARS,
  type PasteRowData,
} from "./passage-row";

export interface PastedPassageInput {
  title: string;
  content: string;
}

// AI-restore help panel: shown by default (tutorial), dismissal remembered.
const RESTORE_HELP_KEY = "smoat:generate:paste-restore-help";
function readRestoreHelp(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(RESTORE_HELP_KEY) !== "0";
  } catch {
    return true;
  }
}

interface MultiPassagePasteProps {
  /** Persist every valid row as a Passage, then select them. Parent handles it. */
  onSubmitRows: (rows: PastedPassageInput[]) => void | Promise<void>;
  /** True while the parent is persisting + refreshing the list. */
  saving: boolean;
}

/**
 * Multi-passage paste surface: a numbered list of editable passage rows
 * (1번·2번·N) with per-row AI 복원 and a deterministic "split one blob into N"
 * helper. Replaces the old single-passage PastePassagePanel.
 */
export function MultiPassagePaste({ onSubmitRows, saving }: MultiPassagePasteProps) {
  const [rows, setRows] = useState<PasteRowData[]>(() => [makeEmptyRow()]);

  // SSR-stable default (open); apply the stored preference after mount. Reading
  // localStorage post-mount (not in the initializer) avoids a hydration mismatch
  // when the user has previously dismissed the panel.
  const [showRestoreHelp, setShowRestoreHelp] = useState(true);
  useEffect(() => {
    const stored = readRestoreHelp();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, post-mount sync
    if (!stored) setShowRestoreHelp(false);
  }, []);
  const toggleRestoreHelp = useCallback(() => {
    setShowRestoreHelp((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(RESTORE_HELP_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const updateRow = (localId: string, patch: Partial<PasteRowData>) =>
    setRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)),
    );

  const addRow = () => setRows((prev) => [...prev, makeEmptyRow()]);

  const removeRow = (localId: string) =>
    setRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.localId !== localId) : prev,
    );

  // Replace one row with N rows built from its detected chunks (smart-split).
  const splitRow = (localId: string, chunks: string[]) =>
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.localId === localId);
      if (idx < 0) return prev;
      const built = chunks.map((c, i) => {
        const row = makeEmptyRow(c);
        // Keep the original title on the first chunk only.
        if (i === 0 && prev[idx].title) row.title = prev[idx].title;
        return row;
      });
      return [...prev.slice(0, idx), ...built, ...prev.slice(idx + 1)];
    });

  const validRows = useMemo(
    () => rows.filter((r) => r.content.trim().length >= MIN_CONTENT_CHARS),
    [rows],
  );
  const canSubmit = validRows.length > 0 && !saving;

  const handleSubmit = () => {
    if (!canSubmit) return;
    void onSubmitRows(
      validRows.map((r) => ({ title: r.title.trim(), content: r.content.trim() })),
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Intro */}
      <div className="shrink-0 px-4 pt-3">
        <p className="text-[12px] leading-relaxed text-slate-500">
          분석·추출 단계 없이 지문을 바로 붙여넣어 문제를 생성합니다. 여러 지문은{" "}
          <b className="text-slate-600">아래 “지문 추가”로 행을 늘리거나</b>, 한 번에
          붙여넣고 <b className="text-violet-600">“나누기”</b>로 분리하세요.
        </p>
      </div>

      {/* Rows (scrollable). With a single row, it stretches to fill the height. */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-2">
        {rows.map((row, i) => (
          <PassageRow
            key={row.localId}
            index={i}
            row={row}
            onChange={(patch) => updateRow(row.localId, patch)}
            onRemove={() => removeRow(row.localId)}
            canRemove={rows.length > 1}
            disabled={saving}
            onSplit={(chunks) => splitRow(row.localId, chunks)}
            grow={rows.length === 1}
            showRestoreHelp={showRestoreHelp}
            onToggleRestoreHelp={toggleRestoreHelp}
          />
        ))}
      </div>

      {/* 지문 추가 — 스크롤 밖, 등록 버튼 바로 위에 고정 */}
      <div className="shrink-0 px-4 pt-2">
        <button
          type="button"
          onClick={addRow}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 py-3 text-[13px] font-bold text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100/70 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          지문 추가
        </button>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-100 px-4 py-3">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="h-10 w-full rounded-lg bg-blue-600 text-[13.5px] font-semibold hover:bg-blue-700"
        >
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              등록 중...
            </>
          ) : (
            <>
              <ClipboardPaste className="mr-1.5 h-4 w-4" />
              {validRows.length > 0
                ? `${validRows.length}개 지문 등록하고 선택`
                : "지문을 입력하세요"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
