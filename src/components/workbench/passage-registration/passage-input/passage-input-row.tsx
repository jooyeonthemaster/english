"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Loader2,
  RotateCcw,
  Scissors,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PassageAnnotationEditor,
  type Annotation,
} from "@/components/workbench/editor";
import { detectProblemFormArtifacts } from "@/lib/passage-source";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { countWords } from "@/app/(director)/director/workbench/generate/generate-page-types";
import { splitPastedPassages } from "@/app/(director)/director/workbench/generate/intake/smart-split";
import {
  RestoreIntroDialog,
  readRestoreIntroDismissed,
} from "@/app/(director)/director/workbench/generate/intake/restore-intro-dialog";
import { formatExtractedTextForDisplay } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/display-text";
import type { RestorationResult } from "@/app/(director)/director/workbench/generate/intake/passage-row";
import { MIN_CONTENT_CHARS, type PassageInputRow as RowData } from "./types";

/** Korean labels for the restoration change `type` codes shown as a badge. */
const CHANGE_TYPE_LABEL_KO: Record<string, string> = {
  BLANK: "빈칸",
  GRAMMAR: "어법",
  VOCAB: "어휘",
  WORD_ORDER: "어순",
  INSERTION: "문장삽입",
  ORDERING: "순서",
  SUMMARY: "요약",
  MARKER: "마커",
  OTHER: "기타",
};

const STATUS_META: Record<
  RestorationResult["status"],
  { label: string; className: string }
> = {
  RESTORED: {
    label: "복원 완료",
    className: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  NO_RESTORATION_NEEDED: {
    label: "복원 불필요 (이미 깨끗함)",
    className: "text-slate-600 bg-slate-50 border-slate-200",
  },
  PARTIAL: {
    label: "부분 복원 · 검토 권장",
    className: "text-blue-700 bg-blue-50 border-blue-200",
  },
  FAILED: {
    label: "복원 실패 · 직접 정리 필요",
    className: "text-red-700 bg-red-50 border-red-200",
  },
};

interface PassageInputRowProps {
  index: number;
  row: RowData;
  onChange: (patch: Partial<RowData>) => void;
  onRemove: () => void;
  canRemove: boolean;
  /** "delete" removes the row; "clear" (the last remaining row) empties it. */
  removeMode?: "delete" | "clear";
  /** Parent is persisting — lock all inputs. */
  disabled: boolean;
  /** Replace THIS row with N rows built from the detected chunks. */
  onSplit: (chunks: string[]) => void;
  /** Stretch the row + editor to fill the available height (single-row case). */
  grow?: boolean;
}

/**
 * One editable passage in the unified annotation stack. Mirrors the 문제 생성
 * page's PassageRow (per-row AI 복원, smart-split, problem-form hints) but its
 * body is a full PassageAnnotationEditor (tiptap) so the teacher can mark
 * vocab/grammar/structure/exam points right here — and those marks flow into
 * the analysis prompt + persist as PassageNote rows on 분석 시작.
 */
export function PassageInputRow({
  index,
  row,
  onChange,
  onRemove,
  canRemove,
  removeMode = "delete",
  disabled,
  onSplit,
  grow,
}: PassageInputRowProps) {
  const [restoring, setRestoring] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);

  const collapsed = row.collapsed;
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

  const setCollapsed = (next: boolean) => onChange({ collapsed: next });

  const handleContentChange = (text: string) => onChange({ content: text });
  const handleAnnotationsChange = (anns: Annotation[]) =>
    onChange({ annotations: anns });

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
      const hadAnnotations = row.annotations.length > 0;
      const restoredText = formatExtractedTextForDisplay(
        data.restoredText || trimmed,
      );
      // Content is replaced wholesale → existing mark offsets are invalid, so
      // clear them and remount the editor (editorSeed bump). 되돌리기 restores
      // both the original text AND the original marks from the snapshot.
      onChange({
        preRestoreContent: row.content,
        preRestoreAnnotations: row.annotations,
        content: restoredText,
        annotations: [],
        restoration: {
          restoredText: data.restoredText ? restoredText : "",
          status: data.status || "PARTIAL",
          changes: Array.isArray(data.changes) ? data.changes : [],
          warnings: Array.isArray(data.warnings) ? data.warnings : [],
        },
        editorSeed: row.editorSeed + 1,
        collapsed: false,
      });
      if (data.degraded) {
        toast.warning("AI 복원에 실패해 마커 제거만 적용했습니다.");
      } else if (hadAnnotations) {
        toast.success(
          "복원했어요. 본문이 바뀌어 기존 마킹은 초기화됐습니다 — 다시 마킹해 주세요.",
        );
      } else {
        toast.success("복원본을 확인하고 필요하면 수정한 뒤 분석하세요.");
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
      annotations: row.preRestoreAnnotations ?? [],
      restoration: null,
      preRestoreContent: null,
      preRestoreAnnotations: null,
      editorSeed: row.editorSeed + 1,
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
      {/* Row header — click anywhere on the bar to expand/collapse */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? "펼치기" : "접기"}
        className="flex cursor-pointer select-none items-center gap-2 border-b border-slate-100 px-3 py-2 transition-colors hover:bg-slate-50/70"
      >
        <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-blue-600 px-1.5 text-[11px] font-bold text-white">
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="shrink-0 text-[12.5px] font-semibold text-slate-700">
            지문 {index + 1}
          </span>
          {collapsed && preview ? (
            <span className="truncate text-[11.5px] text-slate-400">
              {preview}
            </span>
          ) : null}
          {wordCount > 0 && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-slate-400">
              {wordCount} words
            </span>
          )}
          {row.annotations.length > 0 && (
            <span
              className={
                "shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700" +
                (wordCount > 0 ? "" : " ml-auto")
              }
            >
              마킹 {row.annotations.length}
            </span>
          )}
          {inReview && (
            <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              복원됨
            </span>
          )}
        </div>
        {/* AI 복원 / 되돌리기 — compact header action */}
        {inReview ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRevert();
            }}
            disabled={busy}
            title="복원 전 원본으로 되돌리기 (마킹도 함께 복구)"
            className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" />
            되돌리기
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRestoreClick();
            }}
            disabled={!canRestore}
            title="문제 형태 지문을 원문으로 AI 복원"
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-5 text-[11.5px] font-bold text-white shadow-lg shadow-blue-500/60 ring-1 ring-blue-300/60 transition-all hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {restoring ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {restoring ? "복원 중" : "AI 복원"}
            {!restoring && (
              <CreditCostChip
                amount={CREDIT_COSTS.PASSAGE_RESTORATION}
                className="rounded bg-blue-500/70 px-1 py-0.5 text-[9px] text-blue-50"
                iconClassName="size-2.5"
              />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIntroOpen(true);
          }}
          title="AI 복원 안내 다시 보기"
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed(!collapsed);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
          title={collapsed ? "펼치기" : "접기"}
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            disabled={busy}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            title={removeMode === "clear" ? "이 지문 비우기" : "이 지문 삭제"}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className={"px-3 py-3" + (fill ? " flex min-h-0 flex-1 flex-col" : "")}>
          {/* Title */}
          <input
            value={row.title}
            onChange={(e) => onChange({ title: e.target.value })}
            disabled={busy}
            placeholder="제목 (비워두면 본문에서 자동 생성)"
            className="mb-2 h-8 w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-[12.5px] outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 disabled:opacity-50"
          />

          {/* Content label */}
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11.5px] font-medium text-slate-500">
              {inReview ? "복원된 지문 (수정·마킹 가능)" : "지문 내용"}{" "}
              <span className="text-red-500">*</span>
            </label>
            {charCount > 0 && (
              <span className="text-[11px] tabular-nums text-slate-400">
                {charCount.toLocaleString()}자
              </span>
            )}
          </div>

          {/* Annotation editor — marks flow into analysis on 분석 시작 */}
          <div
            className={
              "overflow-hidden rounded-lg border border-slate-200 bg-white" +
              (fill
                ? " flex min-h-[320px] flex-1 flex-col"
                : " h-[460px]")
            }
          >
            <PassageAnnotationEditor
              key={`${row.localId}:${row.editorSeed}`}
              content={row.content}
              onContentChange={handleContentChange}
              annotations={row.annotations}
              onAnnotationsChange={handleAnnotationsChange}
              editable={!busy}
              placeholder={
                "여기에 영어 지문을 붙여넣으세요...\n\n텍스트를 드래그하면 핵심 어휘·어법·출제 포인트를 마킹할 수 있어요. 빈칸·선지 마커가 섞인 '문제 형태'면 'AI 복원'으로 원문을 복구하세요."
              }
            />
          </div>

          {/* Split affordance */}
          {canSplit && split && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2">
              <Scissors className="h-3.5 w-3.5 shrink-0 text-violet-600" />
              <span className="flex-1 text-[11.5px] text-violet-700">
                여러 지문이 감지됐어요 — <b>{split.chunks.length}개 지문</b>으로
                나눌까요?
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
                정확한 복원을 위해 <b>정답·문항</b>을 함께 넣고 <b>AI 복원</b>을
                권장합니다.
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
                    <span
                      className={`rounded border px-2 py-0.5 text-[10.5px] font-semibold ${meta.className}`}
                    >
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
                  <p
                    key={`w-${i}`}
                    className="flex items-start gap-1.5 text-[11px] text-red-600"
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {w}
                  </p>
                ))}
                {row.restoration.changes.length === 0 &&
                row.restoration.warnings.length === 0 ? (
                  <p className="text-[11px] text-slate-400">
                    변경 내역이 없습니다.
                  </p>
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
                          {CHANGE_TYPE_LABEL_KO[c.type] ?? c.type}
                        </span>
                        <span className="text-slate-400 line-through">
                          {c.before || "(없음)"}
                        </span>
                        {c.after ? (
                          <>
                            <span className="mx-1 text-slate-400">→</span>
                            <span className="font-medium text-slate-700">
                              {c.after}
                            </span>
                          </>
                        ) : isCorrection ? (
                          <span className="ml-1 font-medium text-emerald-600">
                            수정됨
                          </span>
                        ) : (
                          <span className="ml-1 text-slate-400">(삭제)</span>
                        )}
                        {c.reason && (
                          <span className="text-slate-400"> · {c.reason}</span>
                        )}
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
