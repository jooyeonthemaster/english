"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ListStart,
  Loader2,
  Scissors,
  TextCursorInput,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import type { QueueItem } from "../generate-page-types";
import {
  countWords,
  isRowDirty,
  type RowOverride,
  type RowRange,
  type WorkspaceRow,
} from "./workspace-types";
import { TypeOverridePopover } from "./type-override-popover";
import { RowHistoryPopover } from "./row-history-popover";
import {
  ParaphrasePreviewPanel,
  PrependPreviewPanel,
} from "./transform-panels";

// ============================================================================
// 워크스페이스 지문 행 — 본문 직접 편집 + AI 변형(문장 재작성·앞 맥락 추가) +
// 출제 범위 지정 + 지문별 유형 오버라이드 + 생성 이력.
// ============================================================================

const MIN_PARAPHRASE_CHARS = 12;
const MIN_RANGE_CHARS = 40;

interface SelectionState {
  start: number;
  end: number;
  text: string;
}

type PreviewState =
  | {
      kind: "paraphrase";
      start: number;
      end: number;
      original: string;
      text: string;
      note: string;
    }
  | { kind: "prepend"; text: string; note: string };

async function requestTransform(body: {
  mode: "PARAPHRASE" | "PREPEND";
  passageText: string;
  selectedText?: string;
  avoidTexts?: string[];
}): Promise<{ text: string; note: string }> {
  const res = await fetch("/api/workbench/passage-transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || "AI 변형에 실패했습니다.");
  }
  return { text: String(data.text || ""), note: String(data.note || "") };
}

interface WorkspacePassageRowProps {
  index: number;
  row: WorkspaceRow;
  disabled: boolean;
  sessionQueue: QueueItem[];
  savedQuestionCount: number;
  onChangeContent: (content: string) => void;
  onSetRange: (range: RowRange | null) => void;
  onSetOverride: (override: RowOverride | null) => void;
  onToggleCollapsed: () => void;
  onRemove: () => void;
}

export function WorkspacePassageRow({
  index,
  row,
  disabled,
  sessionQueue,
  savedQuestionCount,
  onChangeContent,
  onSetRange,
  onSetOverride,
  onToggleCollapsed,
  onRemove,
}: WorkspacePassageRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [busy, setBusy] = useState<"paraphrase" | "prepend" | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  // "다시 생성" 회피 목록 — 같은 대상에 대한 직전 결과들.
  const avoidRef = useRef<string[]>([]);

  const words = useMemo(() => countWords(row.content), [row.content]);
  const dirty = isRowDirty(row);
  const locked = disabled || busy !== null || preview !== null;

  // 생성 시 변형본으로 리바인드되면(passageId 교체) 본문이 외부에서 바뀐다 —
  // 이전 본문 기준의 선택/미리보기 오프셋은 무효이므로 즉시 폐기한다.
  useEffect(() => {
    setSelection(null);
    setPreview(null);
    avoidRef.current = [];
  }, [row.passageId]);

  // ── 텍스트 선택 추적 ──
  const handleSelect = useCallback(() => {
    const el = textareaRef.current;
    if (!el || preview) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end - start >= MIN_PARAPHRASE_CHARS) {
      setSelection({ start, end, text: row.content.slice(start, end) });
    } else {
      setSelection(null);
    }
  }, [row.content, preview]);

  // ── AI 문장 변형 ──
  const runParaphrase = useCallback(
    async (target: SelectionState, avoidTexts: string[]) => {
      setBusy("paraphrase");
      try {
        const r = await requestTransform({
          mode: "PARAPHRASE",
          passageText: row.content,
          selectedText: target.text,
          avoidTexts: avoidTexts.length > 0 ? avoidTexts : undefined,
        });
        setPreview({
          kind: "paraphrase",
          start: target.start,
          end: target.end,
          original: target.text,
          text: r.text,
          note: r.note,
        });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "AI 문장 변형에 실패했습니다.",
        );
      } finally {
        setBusy(null);
      }
    },
    [row.content],
  );

  const handleParaphraseClick = useCallback(() => {
    if (!selection || busy || disabled) return;
    avoidRef.current = [];
    void runParaphrase(selection, []);
  }, [selection, busy, disabled, runParaphrase]);

  // ── 앞 맥락 추가 ──
  const runPrepend = useCallback(
    async (avoidTexts: string[]) => {
      setBusy("prepend");
      try {
        const r = await requestTransform({
          mode: "PREPEND",
          passageText: row.content,
          avoidTexts: avoidTexts.length > 0 ? avoidTexts : undefined,
        });
        setPreview({ kind: "prepend", text: r.text, note: r.note });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "앞 문단 생성에 실패했습니다.",
        );
      } finally {
        setBusy(null);
      }
    },
    [row.content],
  );

  const handlePrependClick = useCallback(() => {
    if (busy || preview || disabled) return;
    avoidRef.current = [];
    void runPrepend([]);
  }, [busy, preview, disabled, runPrepend]);

  // ── 미리보기 액션 ──
  const handleRegenerate = useCallback(() => {
    if (!preview) return;
    avoidRef.current = [...avoidRef.current, preview.text].slice(-5);
    if (preview.kind === "paraphrase") {
      void runParaphrase(
        { start: preview.start, end: preview.end, text: preview.original },
        avoidRef.current,
      );
    } else {
      void runPrepend(avoidRef.current);
    }
  }, [preview, runParaphrase, runPrepend]);

  const handleApplyPreview = useCallback(() => {
    if (!preview || disabled) return;
    if (preview.kind === "paraphrase") {
      // 불변식: 적용 시점의 본문 구간이 미리보기를 만들 때의 원문과 같아야
      // 한다 — 외부 교체 등으로 어긋났으면 엉뚱한 위치 splice 를 차단한다.
      if (row.content.slice(preview.start, preview.end) !== preview.original) {
        toast.error(
          "본문이 변경되어 변형을 적용할 수 없습니다. 문장을 다시 선택해주세요.",
        );
        setPreview(null);
        setSelection(null);
        return;
      }
      const next =
        row.content.slice(0, preview.start) +
        preview.text +
        row.content.slice(preview.end);
      onChangeContent(next);
    } else {
      onChangeContent(`${preview.text} ${row.content.trimStart()}`);
    }
    setPreview(null);
    setSelection(null);
    avoidRef.current = [];
    toast.success(
      "변형이 적용됐습니다. 문제 생성 시 변형본이 새 지문으로 저장됩니다.",
    );
  }, [preview, disabled, row.content, onChangeContent]);

  const handleCancelPreview = useCallback(() => {
    setPreview(null);
    avoidRef.current = [];
  }, []);

  // ── 출제 범위 ──
  const handleSetRangeFromSelection = useCallback(() => {
    if (!selection || disabled) return;
    if (selection.end - selection.start < MIN_RANGE_CHARS) {
      toast.error("출제 범위는 조금 더 길게 선택해주세요.");
      return;
    }
    onSetRange({ start: selection.start, end: selection.end });
    setSelection(null);
    toast.success("출제 범위가 지정됐습니다. 이 구간만으로 문제를 생성합니다.");
  }, [selection, disabled, onSetRange]);

  const rangePreview = useMemo(() => {
    if (!row.range) return null;
    const sliced = row.content.slice(row.range.start, row.range.end).trim();
    return { words: countWords(sliced) };
  }, [row.range, row.content]);

  const collapsedPreview =
    row.content.trim().slice(0, 60) +
    (row.content.trim().length > 60 ? "…" : "");
  const firstSentence = row.content.trim().split(/(?<=[.!?])\s+/)[0] || "";

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* ── 헤더 (40px 고정 — 모든 컨트롤 h-7, 아이콘 h-4) ── */}
      <div
        className={
          "flex h-10 items-center gap-2 pl-2.5 pr-1.5 " +
          (row.collapsed ? "" : "border-b border-slate-100")
        }
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          title={row.collapsed ? "펼치기" : "접기"}
        >
          <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-md bg-blue-600 px-1 text-[11px] font-bold leading-none text-white tabular-nums">
            {index + 1}
          </span>
          <span className="min-w-[72px] shrink truncate text-[12.5px] font-semibold text-slate-700">
            {row.title}
          </span>
          {row.variantOfId ? (
            <span
              className="shrink-0 rounded-sm bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
              title="편집된 본문이 새 지문(변형본)으로 저장됐습니다. 원본 지문은 그대로 보존됩니다."
            >
              변형본
            </span>
          ) : null}
          {dirty ? (
            <span
              className="shrink-0 rounded-sm bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-blue-600 ring-1 ring-inset ring-blue-200"
              title="본문이 수정됐습니다. 생성 시 변형본이 새 지문으로 저장됩니다."
            >
              수정됨
            </span>
          ) : null}
          {row.collapsed ? (
            <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
              {collapsedPreview}
            </span>
          ) : (
            <span className="min-w-0 flex-1" aria-hidden="true" />
          )}
          <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-slate-400">
            {words} words
          </span>
        </button>

        <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
        <RowHistoryPopover
          passageIds={[row.passageId, row.variantOfId].filter(
            (v): v is string => !!v,
          )}
          sessionQueue={sessionQueue}
          savedQuestionCount={savedQuestionCount}
        />
        <TypeOverridePopover
          override={row.override}
          onChange={onSetOverride}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          title={row.collapsed ? "펼치기" : "접기"}
        >
          {row.collapsed ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
          title="워크스페이스에서 제거 (지문은 삭제되지 않음)"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {!row.collapsed ? (
        <div className="space-y-2 px-2.5 py-2.5">
          {/* ── AI 도구 바 ── */}
          <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1.5">
            <button
              type="button"
              onClick={handlePrependClick}
              disabled={locked}
              title="지문 전체 맥락과 자연스럽게 이어지는 앞 문단을 AI가 생성합니다"
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-blue-200 bg-white pl-2 pr-1.5 text-[11.5px] font-bold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "prepend" ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ListStart className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              앞 맥락 추가
              <span
                title="이 작업은 크레딧 1을 사용합니다"
                className="rounded-sm bg-blue-50 px-1 py-px text-[10px] font-bold text-blue-500 ring-1 ring-inset ring-blue-100"
              >
                ◈1
              </span>
            </button>
            {rangePreview ? (
              <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 pl-2 pr-1 text-[11px] font-bold text-white">
                <Scissors className="h-3 w-3" aria-hidden="true" />
                출제 범위 {rangePreview.words}/{words} words
                <button
                  type="button"
                  onClick={() => onSetRange(null)}
                  className="rounded-sm p-0.5 transition-colors hover:bg-white/20"
                  title="범위 해제 (전체 지문으로 출제)"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ) : null}
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <TextCursorInput
                className="h-3.5 w-3.5 shrink-0 text-blue-400"
                aria-hidden="true"
              />
              <span className="truncate">
                문장을 드래그하면 AI 변형 · 범위 지정
              </span>
            </span>
          </div>

          {/* ── 앞 문단 미리보기 ── */}
          {preview?.kind === "prepend" ? (
            <PrependPreviewPanel
              paragraph={preview.text}
              firstSentence={firstSentence.split(/\s+/).slice(0, 8).join(" ")}
              note={preview.note}
              busy={busy !== null}
              disabled={disabled}
              onApply={handleApplyPreview}
              onRegenerate={handleRegenerate}
              onCancel={handleCancelPreview}
            />
          ) : null}

          {/* ── 본문 에디터 ── */}
          <Textarea
            ref={textareaRef}
            value={row.content}
            onChange={(e) => {
              if (row.range) {
                toast.info("본문이 수정되어 출제 범위가 해제됐습니다.");
              }
              onChangeContent(e.target.value);
              setSelection(null);
            }}
            onSelect={handleSelect}
            readOnly={preview !== null || busy !== null}
            disabled={disabled}
            spellCheck={false}
            className={
              "min-h-[180px] resize-y border-slate-200 text-[13px] leading-relaxed " +
              (preview !== null || busy !== null
                ? "bg-slate-50 text-slate-500"
                : "")
            }
            placeholder="지문 본문"
          />

          {/* ── 선택 액션 바 ── */}
          {selection && !preview && !busy && !disabled ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-300 bg-white py-2 pl-3 pr-2 shadow-md shadow-blue-100/60 duration-150 animate-in fade-in slide-in-from-top-1">
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-400">
                선택{" "}
                <span className="font-semibold text-slate-600">
                  “{selection.text.slice(0, 60)}
                  {selection.text.length > 60 ? "…" : ""}”
                </span>
              </span>
              <button
                type="button"
                onClick={handleParaphraseClick}
                title="뜻은 그대로, 단어·표현만 바꿔 재작성합니다"
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 pl-2.5 pr-2 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                AI 문장 변형
                <span
                  title="이 작업은 크레딧 1을 사용합니다"
                  className="rounded-sm bg-white/20 px-1 py-px text-[10px] font-bold"
                >
                  ◈1
                </span>
              </button>
              <button
                type="button"
                onClick={handleSetRangeFromSelection}
                title="선택한 구간만으로 문제를 생성합니다 (긴 지문용)"
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
                이 범위만 출제
              </button>
            </div>
          ) : null}

          {busy === "paraphrase" ? (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5 text-[12px] font-semibold text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              선택한 문장을 변형하고 있어요…
            </div>
          ) : null}

          {/* ── 문장 변형 미리보기 ── */}
          {preview?.kind === "paraphrase" ? (
            <ParaphrasePreviewPanel
              original={preview.original}
              rewritten={preview.text}
              note={preview.note}
              busy={busy !== null}
              disabled={disabled}
              onApply={handleApplyPreview}
              onRegenerate={handleRegenerate}
              onCancel={handleCancelPreview}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
