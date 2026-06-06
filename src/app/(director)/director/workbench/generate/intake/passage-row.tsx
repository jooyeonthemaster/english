"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  X,
  AlertTriangle,
  RotateCcw,
  Undo2,
  ChevronDown,
  ChevronUp,
  Scissors,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { detectProblemFormArtifacts } from "@/lib/passage-source";
import { countWords } from "../generate-page-types";
import { splitPastedPassages } from "./smart-split";
import {
  RestoreIntroDialog,
  readRestoreIntroDismissed,
} from "./restore-intro-dialog";

/** Minimum characters before a pasted passage is considered usable. */
export const MIN_CONTENT_CHARS = 20;

export interface RestorationChange {
  before: string;
  after: string;
  type: string;
  reason: string;
}
export interface RestorationResult {
  restoredText: string;
  status: "RESTORED" | "PARTIAL" | "NO_RESTORATION_NEEDED" | "FAILED";
  changes: RestorationChange[];
  warnings: string[];
}

/** One editable passage row in the multi-passage paste surface. */
export interface PasteRowData {
  localId: string;
  title: string;
  content: string;
  restoration: RestorationResult | null;
  preRestoreContent: string | null;
}

let rowSeq = 0;
/** Collision-free row id (survives HMR resets + StrictMode double-invoke). */
function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  rowSeq += 1;
  return `row-${rowSeq}-${Math.random().toString(36).slice(2)}`;
}
export function makeEmptyRow(content = ""): PasteRowData {
  return {
    localId: newRowId(),
    title: "",
    content,
    restoration: null,
    preRestoreContent: null,
  };
}

const STATUS_META: Record<
  RestorationResult["status"],
  { label: string; className: string }
> = {
  RESTORED: { label: "복원 완료", className: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  NO_RESTORATION_NEEDED: { label: "복원 불필요 (이미 깨끗함)", className: "text-slate-600 bg-slate-50 border-slate-200" },
  PARTIAL: { label: "부분 복원 · 검토 권장", className: "text-blue-700 bg-blue-50 border-blue-200" },
  FAILED: { label: "복원 실패 · 직접 정리 필요", className: "text-red-700 bg-red-50 border-red-200" },
};

interface PassageRowProps {
  index: number;
  row: PasteRowData;
  onChange: (patch: Partial<PasteRowData>) => void;
  onRemove: () => void;
  canRemove: boolean;
  /** Parent is persisting — lock all inputs. */
  disabled: boolean;
  /** Replace THIS row with N rows built from the detected chunks. */
  onSplit: (chunks: string[]) => void;
  /** Stretch the row + textarea to fill the available height (single-row case). */
  grow?: boolean;
}

export function PassageRow({
  index,
  row,
  onChange,
  onRemove,
  canRemove,
  disabled,
  onSplit,
  grow,
}: PassageRowProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);

  const trimmed = row.content.trim();
  const wordCount = useMemo(() => (trimmed ? countWords(trimmed) : 0), [trimmed]);
  const charCount = trimmed.length;
  const tooShort = charCount > 0 && charCount < MIN_CONTENT_CHARS;
  const inReview = row.restoration !== null;
  const busy = disabled || restoring;
  const canRestore = charCount >= MIN_CONTENT_CHARS && !busy;

  const detection = useMemo(
    () => detectProblemFormArtifacts(row.content),
    [row.content],
  );

  // Offer to split when the row clearly holds several passages (and we're not
  // mid-review of a restoration).
  const split = useMemo(
    () => (inReview ? null : splitPastedPassages(row.content)),
    [row.content, inReview],
  );
  const canSplit = !!split && split.chunks.length >= 2;

  const handleRestore = async () => {
    if (!canRestore) return;
    setRestoring(true);
    try {
      const res = await fetch("/api/workbench/restore-passage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ passageText: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "복원에 실패했습니다.");
        return;
      }
      onChange({
        preRestoreContent: row.content,
        content: data.restoredText || trimmed,
        restoration: {
          restoredText: data.restoredText || "",
          status: data.status || "PARTIAL",
          changes: Array.isArray(data.changes) ? data.changes : [],
          warnings: Array.isArray(data.warnings) ? data.warnings : [],
        },
      });
      if (data.degraded) {
        toast.warning("AI 복원에 실패해 마커 제거만 적용했습니다.");
      } else {
        toast.success("복원본을 확인하고 필요하면 수정한 뒤 등록하세요.");
      }
    } catch {
      toast.error("복원 요청 중 오류가 발생했습니다.");
    } finally {
      setRestoring(false);
    }
  };

  // Clicking "AI 복원" first shows the intro modal — unless the teacher has
  // ticked "다시 보지 않기", in which case it restores straight away.
  const handleRestoreClick = () => {
    if (!canRestore) return;
    if (readRestoreIntroDismissed()) {
      void handleRestore();
    } else {
      setIntroOpen(true);
    }
  };

  const handleRevert = () => {
    onChange({
      content: row.preRestoreContent ?? row.content,
      restoration: null,
      preRestoreContent: null,
    });
  };

  const preview =
    trimmed.slice(0, 48).replace(/\s+/g, " ") + (trimmed.length > 48 ? "…" : "");

  // Stretch to fill the available height when this is the only (expanded) row.
  const fill = !!grow && !collapsed;

  return (
    <div
      className={
        "rounded-xl border border-slate-200 bg-white shadow-sm" +
        (fill ? " flex min-h-0 flex-1 flex-col" : "")
      }
    >
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-blue-600 px-1.5 text-[11px] font-bold text-white">
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-[12.5px] font-semibold text-slate-700 shrink-0">
            지문 {index + 1}
          </span>
          {collapsed && preview ? (
            <span className="truncate text-[11.5px] text-slate-400">{preview}</span>
          ) : null}
          {wordCount > 0 && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-slate-400">
              {wordCount} words
            </span>
          )}
          {inReview && (
            <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              복원됨
            </span>
          )}
        </button>
        {/* AI 복원 / 되돌리기 — 헤더에 컴팩트 액션으로 */}
        {inReview ? (
          <button
            type="button"
            onClick={handleRevert}
            disabled={busy}
            title="복원 전 원본으로 되돌리기"
            className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" />
            되돌리기
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRestoreClick}
            disabled={!canRestore}
            title="문제 형태 지문을 원문으로 AI 복원"
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-5 text-[11.5px] font-bold text-white ring-1 ring-blue-300/60 shadow-lg shadow-blue-500/60 transition-all hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {restoring ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {restoring ? "복원 중" : "AI 복원"}
            {!restoring && (
              <span className="rounded bg-blue-500/70 px-1 py-0.5 text-[9px] font-bold text-blue-50">
                ◈2
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => setIntroOpen(true)}
          title="AI 복원 안내 다시 보기"
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
          title={collapsed ? "펼치기" : "접기"}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            title="이 지문 삭제"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div
          className={
            "px-3 py-3" + (fill ? " flex min-h-0 flex-1 flex-col" : "")
          }
        >
          {/* Title */}
          <input
            value={row.title}
            onChange={(e) => onChange({ title: e.target.value })}
            disabled={busy}
            placeholder="제목 (비워두면 본문에서 자동 생성)"
            className="mb-2 h-8 w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-[12.5px] outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 disabled:opacity-50"
          />

          {/* Content */}
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11.5px] font-medium text-slate-500">
              {inReview ? "복원된 지문 (수정 가능)" : "지문 내용"}{" "}
              <span className="text-red-500">*</span>
            </label>
            {charCount > 0 && (
              <span className="text-[11px] tabular-nums text-slate-400">
                {charCount.toLocaleString()}자
              </span>
            )}
          </div>
          <Textarea
            value={row.content}
            onChange={(e) => onChange({ content: e.target.value })}
            disabled={busy}
            placeholder={"여기에 영어 지문을 붙여넣으세요...\n\n빈칸·어법 오류·선지 마커가 섞인 '문제 형태'면 'AI 복원'으로 원문을 복구할 수 있어요."}
            className={
              (fill ? "min-h-[160px] flex-1 " : "min-h-[200px] resize-y ") +
              "border-slate-200 bg-white text-[13px] leading-relaxed placeholder:text-slate-300"
            }
          />

          {/* Split affordance */}
          {canSplit && split && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2">
              <Scissors className="h-3.5 w-3.5 shrink-0 text-violet-600" />
              <span className="flex-1 text-[11.5px] text-violet-700">
                여러 지문이 감지됐어요 —{" "}
                <b>{split.chunks.length}개 지문</b>으로 나눌까요?
                {!split.confident && (
                  <span className="text-violet-400"> (빈 줄 기준 · 확인 권장)</span>
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onSplit(split.chunks)}
                disabled={busy}
                className="h-7 shrink-0 border-violet-300 px-2.5 text-[11.5px] text-violet-700 hover:bg-violet-100"
              >
                나누기
              </Button>
            </div>
          )}

          {/* Problem-form detection */}
          {!inReview && detection.hasArtifacts && charCount > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
              <div className="text-[11.5px] leading-relaxed text-blue-700">
                <b>문제 형태 흔적이 감지됐어요</b> ({detection.hints.join(", ")}).
                정확한 복원을 위해 아래 <b>정답·문항</b>을 함께 넣고{" "}
                <b>AI 복원</b>을 권장합니다.
              </div>
            </div>
          )}
          {tooShort && (
            <p className="mt-2 text-[11px] text-red-500">
              지문이 너무 짧습니다. 최소 {MIN_CONTENT_CHARS}자 이상 입력해주세요.
            </p>
          )}

          {/* Restoration review */}
          {inReview && row.restoration && (
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/60">
              <div className="flex items-center gap-2 border-b border-slate-200/70 px-3 py-1.5">
                {(() => {
                  const meta =
                    STATUS_META[row.restoration.status] ?? STATUS_META.PARTIAL;
                  return (
                    <span className={`rounded border px-2 py-0.5 text-[10.5px] font-semibold ${meta.className}`}>
                      {meta.label}
                    </span>
                  );
                })()}
                <span className="text-[10.5px] text-slate-500">
                  복원 내역 {row.restoration.changes.length}건
                </span>
              </div>
              <div className="max-h-[110px] space-y-1.5 overflow-y-auto px-3 py-2">
                {row.restoration.warnings.map((w, i) => (
                  <p key={`w-${i}`} className="flex items-start gap-1.5 text-[11px] text-red-600">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {w}
                  </p>
                ))}
                {row.restoration.changes.length === 0 &&
                row.restoration.warnings.length === 0 ? (
                  <p className="text-[11px] text-slate-400">변경 내역이 없습니다.</p>
                ) : (
                  row.restoration.changes.map((c, i) => {
                    const isCorrection =
                      c.type === "GRAMMAR" ||
                      c.type === "VOCAB" ||
                      c.type === "BLANK" ||
                      c.type === "WORD_ORDER";
                    return (
                      <div key={`c-${i}`} className="text-[11px] leading-relaxed">
                        <span className="mr-1 inline-block rounded border border-slate-200 bg-white px-1 align-middle text-[9px] font-semibold text-slate-500">
                          {c.type}
                        </span>
                        <span className="text-slate-400 line-through">{c.before || "(없음)"}</span>
                        {c.after ? (
                          <>
                            <span className="mx-1 text-slate-400">→</span>
                            <span className="font-medium text-slate-700">{c.after}</span>
                          </>
                        ) : isCorrection ? (
                          <span className="ml-1 font-medium text-emerald-600">수정됨</span>
                        ) : (
                          <span className="ml-1 text-slate-400">(삭제)</span>
                        )}
                        {c.reason && <span className="text-slate-400"> · {c.reason}</span>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      )}

      <RestoreIntroDialog
        open={introOpen}
        onOpenChange={setIntroOpen}
        onConfirm={handleRestore}
        canRestore={canRestore}
      />
    </div>
  );
}
