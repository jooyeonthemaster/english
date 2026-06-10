"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ListStart,
  Loader2,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  TextCursorInput,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  RestoreIntroDialog,
  readRestoreIntroDismissed,
} from "../intake/restore-intro-dialog";
import { formatExtractedTextForDisplay } from "../../passages/import/_components/extraction-manage-client/utils/display-text";
import type { QueueItem } from "../generate-page-types";
import {
  countWords,
  isRowDirty,
  type RowHighlight,
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
// 출제 범위 지정 + 지문별 유형 오버라이드 + 생성 이력 + 행별 undo/redo.
//
// 앞 맥락 추가는 "본문 첫 글자 바로 위"의 삽입 바로 노출한다 — 문단이
// 들어갈 자리가 곧 버튼이라, 처음 보는 사람도 무엇이 어디에 생기는지 안다.
// AI가 추가/변형한 구간은 textarea 뒤 백드롭 레이어로 하이라이트한다.
// ============================================================================

const MIN_PARAPHRASE_CHARS = 12;
const MIN_RANGE_CHARS = 40;
const PREPEND_COUNT_KEY = "smoat:generate:prepend-sentence-count";
/** 수동 편집 버스트 묶음 간격 — 이 안의 연속 타이핑은 undo 1단계. */
const TYPING_BURST_MS = 800;
/**
 * 에디터·하이라이트 백드롭 공통 텍스트 메트릭 — 인라인으로 강제한다.
 * (전역 스타일이 textarea 폰트를 가로채면 두 레이어의 줄바꿈이 어긋나
 * 하이라이트가 엉뚱한 위치에 칠해진다.)
 */
const EDITOR_TEXT_STYLE: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: 1.625,
};

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
  sentenceCount?: number;
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

/** 하이라이트 구간을 렌더 세그먼트로 변환 (겹침/범위 밖은 안전하게 클램프). */
function buildHighlightSegments(
  content: string,
  highlights: RowHighlight[],
): { text: string; kind: RowHighlight["kind"] | null }[] {
  if (highlights.length === 0) return [{ text: content, kind: null }];
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const segments: { text: string; kind: RowHighlight["kind"] | null }[] = [];
  let pos = 0;
  for (const h of sorted) {
    const start = Math.max(pos, Math.min(h.start, content.length));
    const end = Math.max(start, Math.min(h.end, content.length));
    if (start > pos) segments.push({ text: content.slice(pos, start), kind: null });
    if (end > start) segments.push({ text: content.slice(start, end), kind: h.kind });
    pos = Math.max(pos, end);
  }
  if (pos < content.length) segments.push({ text: content.slice(pos), kind: null });
  return segments;
}

interface WorkspacePassageRowProps {
  index: number;
  row: WorkspaceRow;
  disabled: boolean;
  sessionQueue: QueueItem[];
  savedQuestionCount: number;
  onChangeContent: (content: string) => void;
  /** 수동 편집 버스트 시작 — undo 스냅샷 저장. */
  onPushHistory: () => void;
  /** AI 변형 적용 (히스토리+하이라이트 포함 원자 처리). */
  onApplyAi: (content: string, highlight: RowHighlight) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearHighlights: () => void;
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
  onPushHistory,
  onApplyAi,
  onUndo,
  onRedo,
  onClearHighlights,
  onSetRange,
  onSetOverride,
  onToggleCollapsed,
  onRemove,
}: WorkspacePassageRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [busy, setBusy] = useState<"paraphrase" | "prepend" | "restore" | null>(
    null,
  );
  const [restoreIntroOpen, setRestoreIntroOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  // "다시 생성" 회피 목록 — 같은 대상에 대한 직전 결과들.
  const avoidRef = useRef<string[]>([]);
  // 타이핑 버스트 타이머 — 활성인 동안의 연속 입력은 undo 1단계로 묶는다.
  const typingTimerRef = useRef<number | null>(null);

  // 앞 맥락 문단의 문장 수 (1~5) — 마지막 선택을 기억한다.
  const [prependCount, setPrependCount] = useState<number>(() => {
    if (typeof window === "undefined") return 3;
    try {
      const n = parseInt(
        window.localStorage.getItem(PREPEND_COUNT_KEY) || "",
        10,
      );
      return Number.isNaN(n) ? 3 : Math.min(5, Math.max(1, n));
    } catch {
      return 3;
    }
  });
  const changePrependCount = useCallback((delta: number) => {
    setPrependCount((prev) => {
      const next = Math.min(5, Math.max(1, prev + delta));
      try {
        window.localStorage.setItem(PREPEND_COUNT_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const words = useMemo(() => countWords(row.content), [row.content]);
  const dirty = isRowDirty(row);
  const locked = disabled || busy !== null || preview !== null;
  const editorLocked = preview !== null || busy !== null;

  const highlightSegments = useMemo(
    () => buildHighlightSegments(row.content, row.highlights),
    [row.content, row.highlights],
  );
  const hasPrependHl = row.highlights.some((h) => h.kind === "prepend");
  const hasParaphraseHl = row.highlights.some((h) => h.kind === "paraphrase");

  const syncBackdropScroll = useCallback(() => {
    const el = textareaRef.current;
    const bd = backdropRef.current;
    if (el && bd) {
      bd.scrollTop = el.scrollTop;
      bd.scrollLeft = el.scrollLeft;
    }
  }, []);
  useEffect(() => {
    syncBackdropScroll();
  }, [row.content, row.highlights, syncBackdropScroll]);

  // 생성 시 변형본으로 리바인드되면(passageId 교체) 본문이 외부에서 바뀐다 —
  // 이전 본문 기준의 선택/미리보기 오프셋은 무효이므로 즉시 폐기한다.
  useEffect(() => {
    setSelection(null);
    setPreview(null);
    avoidRef.current = [];
  }, [row.passageId]);

  // 타이핑 버스트 타이머 정리.
  useEffect(
    () => () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
    },
    [],
  );
  const endTypingBurst = useCallback(() => {
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

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

  // "문장 변형…" 티칭 버튼 — API 호출 없이(크레딧 0) 첫 문장을 대신 선택해
  // "선택 → 액션 바" 흐름을 그대로 보여준다. 처음 보는 사람용 발견 장치.
  const handleTeachParaphrase = useCallback(() => {
    const el = textareaRef.current;
    if (!el || locked) return;
    const text = row.content;
    const m = text.match(/[\s\S]*?[.!?…]["'”’)\]]*(?=\s|$)/u);
    let end = m ? m[0].length : 0;
    if (end < MIN_PARAPHRASE_CHARS) end = Math.min(text.length, 140);
    if (end < MIN_PARAPHRASE_CHARS) return;
    el.focus();
    el.setSelectionRange(0, end);
    setSelection({ start: 0, end, text: text.slice(0, end) });
    toast.info(
      "첫 문장을 선택했어요 — 다른 문장을 원하면 본문에서 드래그로 선택하세요.",
    );
  }, [locked, row.content]);

  // ── AI 복원 (문제 형태 → 원문) — intake 붙여넣기와 동일 API·플로우 ──
  const runRestore = useCallback(async () => {
    setBusy("restore");
    try {
      const res = await fetch("/api/workbench/restore-passage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ passageText: row.content.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "복원에 실패했습니다.");
        return;
      }
      const restoredText = formatExtractedTextForDisplay(
        String(data.restoredText || row.content),
      );
      // undo 1단계로 묶어 적용 — 마음에 안 들면 ↶ 한 번으로 원복.
      endTypingBurst();
      onPushHistory();
      onChangeContent(restoredText);
      setSelection(null);
      const changeCount = Array.isArray(data.changes) ? data.changes.length : 0;
      if (data.degraded) {
        toast.warning("AI 복원에 실패해 마커 제거만 적용했습니다.");
      } else if (data.status === "NO_RESTORATION_NEEDED") {
        toast.info("이미 깨끗한 지문이에요 — 크레딧은 차감되지 않았습니다.");
      } else {
        toast.success(
          `복원이 적용됐습니다 (변경 ${changeCount}건) — 되돌리기(↶)로 취소할 수 있어요.`,
        );
      }
      const firstWarning = Array.isArray(data.warnings)
        ? data.warnings[0]
        : null;
      if (firstWarning) toast.info(String(firstWarning));
    } catch {
      toast.error("복원 요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }, [row.content, endTypingBurst, onPushHistory, onChangeContent]);

  const handleRestoreClick = useCallback(() => {
    if (locked || row.content.trim().length < 20) return;
    if (readRestoreIntroDismissed()) {
      void runRestore();
    } else {
      setRestoreIntroOpen(true);
    }
  }, [locked, row.content, runRestore]);

  // ── 앞 맥락 추가 ──
  const runPrepend = useCallback(
    async (avoidTexts: string[]) => {
      setBusy("prepend");
      try {
        const r = await requestTransform({
          mode: "PREPEND",
          passageText: row.content,
          avoidTexts: avoidTexts.length > 0 ? avoidTexts : undefined,
          sentenceCount: prependCount,
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
    [row.content, prependCount],
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
    endTypingBurst();
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
      onApplyAi(next, {
        start: preview.start,
        end: preview.start + preview.text.length,
        kind: "paraphrase",
      });
    } else {
      const next = `${preview.text} ${row.content.trimStart()}`;
      onApplyAi(next, {
        start: 0,
        end: preview.text.length,
        kind: "prepend",
      });
    }
    setPreview(null);
    setSelection(null);
    avoidRef.current = [];
    toast.success(
      "변형이 적용됐습니다. 적용된 구간은 본문에 색으로 표시돼요 — 되돌리기(↶)로 취소할 수 있습니다.",
    );
  }, [preview, disabled, row.content, onApplyAi, endTypingBurst]);

  const handleCancelPreview = useCallback(() => {
    setPreview(null);
    avoidRef.current = [];
  }, []);

  // ── undo / redo ──
  const handleUndo = useCallback(() => {
    if (locked || row.past.length === 0) return;
    endTypingBurst();
    setSelection(null);
    onUndo();
  }, [locked, row.past.length, endTypingBurst, onUndo]);

  const handleRedo = useCallback(() => {
    if (locked || row.future.length === 0) return;
    endTypingBurst();
    setSelection(null);
    onRedo();
  }, [locked, row.future.length, endTypingBurst, onRedo]);

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
              onClick={handleRestoreClick}
              disabled={locked || row.content.trim().length < 20}
              title="문제 형태 지문을 원문으로 AI 복원"
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "restore" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {busy === "restore" ? "복원 중" : "AI 복원"}
              {busy !== "restore" ? (
                <span
                  title={`이 작업은 크레딧 ${CREDIT_COSTS.PASSAGE_RESTORATION}을 사용합니다`}
                  className="rounded-sm bg-white/20 px-1 py-px text-[10px] font-bold"
                >
                  ◈{CREDIT_COSTS.PASSAGE_RESTORATION}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={handleTeachParaphrase}
              disabled={locked}
              title="클릭하면 첫 문장이 선택됩니다 — 원하는 문장을 드래그로 바꿔 선택한 뒤 ‘AI 문장 변형’을 누르세요"
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2 text-[11.5px] font-bold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              문장 변형…
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
            <span className="min-w-0 flex-1" aria-hidden="true" />
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={handleUndo}
                disabled={locked || row.past.length === 0}
                title="되돌리기 — 직전 편집·AI 적용을 취소합니다"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={locked || row.future.length === 0}
                title="다시 실행 — 되돌린 편집을 다시 적용합니다"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Redo2 className="h-4 w-4" aria-hidden="true" />
              </button>
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

          {/* ── 본문 에디터 (앞 맥락 삽입 바 + 하이라이트 백드롭) ── */}
          <div
            className={
              "overflow-hidden rounded-lg border transition-colors " +
              (editorLocked
                ? "border-slate-200 bg-slate-50"
                : "border-slate-200 bg-white focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100")
            }
          >
            {/* 앞 맥락 삽입 바 — 본문 첫 글자 바로 위 = 문단이 들어올 자리 */}
            <div className="flex items-stretch border-b border-dashed border-blue-200/80 bg-blue-50/40">
              <button
                type="button"
                onClick={handlePrependClick}
                disabled={locked}
                title={`지문 맥락과 자연스럽게 이어지는 앞 문단(${prependCount}문장)을 AI가 생성해 이 위치에 끼워 넣습니다`}
                className="flex h-8 min-w-0 flex-1 items-center gap-1.5 pl-2.5 pr-2 text-left text-[11.5px] font-bold text-blue-600 transition-colors hover:bg-blue-100/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "prepend" ? (
                  <Loader2
                    className="h-3.5 w-3.5 shrink-0 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ListStart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">
                  {busy === "prepend"
                    ? "앞 문단을 생성하고 있어요…"
                    : "여기에 앞 맥락 문단 추가"}
                </span>
                <span
                  title="이 작업은 크레딧 1을 사용합니다"
                  className="shrink-0 rounded-sm bg-white px-1 py-px text-[10px] font-bold text-blue-500 ring-1 ring-inset ring-blue-200"
                >
                  ◈1
                </span>
              </button>
              <span
                className="my-1.5 w-px shrink-0 bg-blue-200/70"
                aria-hidden="true"
              />
              <div
                className="flex shrink-0 items-center gap-0.5 pl-1 pr-1"
                title="생성할 앞 문단의 문장 수 (1~5)"
              >
                <button
                  type="button"
                  onClick={() => changePrependCount(-1)}
                  disabled={locked || prependCount <= 1}
                  className="flex h-6 w-6 items-center justify-center rounded text-blue-400 transition-colors hover:bg-blue-100/70 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="앞 문단 문장 수 줄이기"
                >
                  <Minus className="h-3 w-3" aria-hidden="true" />
                </button>
                <span className="w-[42px] text-center text-[11px] font-bold tabular-nums text-blue-700">
                  {prependCount}문장
                </span>
                <button
                  type="button"
                  onClick={() => changePrependCount(1)}
                  disabled={locked || prependCount >= 5}
                  className="flex h-6 w-6 items-center justify-center rounded text-blue-400 transition-colors hover:bg-blue-100/70 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="앞 문단 문장 수 늘리기"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="relative">
              {/* 하이라이트 백드롭 — textarea 와 동일 메트릭(px-3 py-2,
                  13px/relaxed)으로 뒤에 깔린다. 글자는 투명, 배경만 칠한다. */}
              {row.highlights.length > 0 ? (
                <div
                  ref={backdropRef}
                  aria-hidden="true"
                  style={EDITOR_TEXT_STYLE}
                  className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-transparent"
                >
                  {highlightSegments.map((seg, i) =>
                    seg.kind ? (
                      <mark
                        key={i}
                        className={
                          "rounded-[2px] text-transparent " +
                          (seg.kind === "prepend"
                            ? "bg-blue-100"
                            : "bg-violet-100")
                        }
                      >
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    ),
                  )}
                </div>
              ) : null}
              <Textarea
                ref={textareaRef}
                value={row.content}
                onChange={(e) => {
                  if (row.range) {
                    toast.info("본문이 수정되어 출제 범위가 해제됐습니다.");
                  }
                  // 연속 타이핑은 버스트 1개 = undo 1단계로 묶는다.
                  if (typingTimerRef.current === null) {
                    onPushHistory();
                  } else {
                    window.clearTimeout(typingTimerRef.current);
                  }
                  typingTimerRef.current = window.setTimeout(() => {
                    typingTimerRef.current = null;
                  }, TYPING_BURST_MS);
                  onChangeContent(e.target.value);
                  setSelection(null);
                }}
                onSelect={handleSelect}
                onScroll={syncBackdropScroll}
                readOnly={editorLocked}
                disabled={disabled}
                spellCheck={false}
                style={EDITOR_TEXT_STYLE}
                className={
                  "relative min-h-[180px] resize-y rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 " +
                  (editorLocked ? "text-slate-500" : "")
                }
                placeholder="지문 본문"
              />
            </div>
          </div>

          {/* ── 하이라이트 범례 ── */}
          {row.highlights.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[10.5px] font-medium text-slate-400">
              {hasPrependHl ? (
                <span className="flex items-center gap-1">
                  <span
                    className="h-2.5 w-2.5 rounded-[2px] bg-blue-100 ring-1 ring-inset ring-blue-200"
                    aria-hidden="true"
                  />
                  AI가 추가한 앞 맥락
                </span>
              ) : null}
              {hasParaphraseHl ? (
                <span className="flex items-center gap-1">
                  <span
                    className="h-2.5 w-2.5 rounded-[2px] bg-violet-100 ring-1 ring-inset ring-violet-200"
                    aria-hidden="true"
                  />
                  AI 변형 문장
                </span>
              ) : null}
              <span className="min-w-0 flex-1" aria-hidden="true" />
              <button
                type="button"
                onClick={onClearHighlights}
                className="shrink-0 transition-colors hover:text-slate-600"
                title="색 표시만 지웁니다 (본문은 그대로)"
              >
                표시 지우기
              </button>
            </div>
          ) : null}

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

      {/* AI 복원 첫 사용 안내 — intake 붙여넣기와 동일 다이얼로그/저장 키 */}
      <RestoreIntroDialog
        open={restoreIntroOpen}
        onOpenChange={setRestoreIntroOpen}
        onConfirm={runRestore}
        canRestore={!locked && row.content.trim().length >= 20}
      />
    </div>
  );
}
