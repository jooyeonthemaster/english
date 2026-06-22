"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Scissors,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import {
  PassageAnnotationEditor,
  type Annotation,
} from "@/components/workbench/editor";
import { detectProblemFormArtifacts } from "@/lib/passage-source";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { countWords } from "@/app/(director)/director/workbench/generate/generate-page-types";
import { splitPastedPassages } from "@/app/(director)/director/workbench/generate/intake/smart-split";
import {
  RestoreIntroDialog,
  readRestoreIntroDismissed,
} from "@/app/(director)/director/workbench/generate/intake/restore-intro-dialog";
import {
  ParaphrasePreviewPanel,
  PrependPreviewPanel,
} from "@/app/(director)/director/workbench/generate/workspace/transform-panels";
import {
  VariantMenuButton,
  WholePassageVariantPreviewPanel,
  type VariantAction,
} from "@/app/(director)/director/workbench/generate/workspace/whole-passage-variant-controls";
import {
  defaultVariantTitle,
  variantModeLabel,
  type VariantDirection,
  type WholePassageTransformMode,
} from "@/lib/passage-transform/schema";
import { formatExtractedTextForDisplay } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/display-text";
import type { RestorationResult } from "@/app/(director)/director/workbench/generate/intake/passage-row";
import { MIN_CONTENT_CHARS, type PassageInputRow as RowData } from "./types";
import { requestPassageTransform } from "./passage-transform-request";

/** 최소 선택 길이(문장 변형) / 최소 변형 가능 본문 길이(API 요건). */
const MIN_PARAPHRASE_CHARS = 12;
const MIN_TRANSFORM_CHARS = 20;

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
  /**
   * Editor height in px. Overrides the default (fill → min 320, fixed → 460).
   * Lets reuse contexts (웹툰 생성) use a shorter editor without a flex-squeeze.
   */
  editorHeightPx?: number;
  /** 막 추가/불러온 행이면 파란 글로우를 한 번 반짝이고 사라진다. */
  justAdded?: boolean;
  /** 글로우 애니메이션이 끝났을 때 호출 — 부모가 표시 상태를 해제한다. */
  onGlowEnd?: () => void;
  /** 선택 체크박스 상태 + 토글. 주어지면 헤더 좌상단(번호 왼쪽)에 체크박스를 띄운다. */
  selected?: boolean;
  onToggleSelected?: () => void;
  /**
   * AI 변형 도구(AI 문장 변형·앞 맥락 추가·변형 지문 생성)를 노출할지. 학습지
   * 워크스페이스만 켠다 — 웹툰 등 재사용 경로는 끄도록 기본 false.
   */
  enableAiTransforms?: boolean;
  /**
   * 변형 지문 생성 → 새 Passage 로 저장하고 새 행으로 추가한다(부모가 처리).
   * 주어지지 않으면 '변형 지문 생성' 버튼을 숨긴다.
   */
  onAddVariant?: (args: {
    sourcePassageId: string | null;
    title: string;
    content: string;
    mode: WholePassageTransformMode;
    direction?: VariantDirection;
  }) => Promise<boolean>;
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
  editorHeightPx,
  justAdded,
  onGlowEnd,
  selected,
  onToggleSelected,
  enableAiTransforms = false,
  onAddVariant,
}: PassageInputRowProps) {
  const [restoring, setRestoring] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);

  const collapsed = row.collapsed;
  // 한 번이라도 펼쳐진 적이 있으면 본문을 DOM 에 남겨 둔다 — 닫힐 때도 높이가
  // 부드럽게 줄어드는 애니메이션을 주기 위함이고, 한 번도 안 연 행은 그대로
  // lazy 하게 둬서 대량 불러오기 비용을 아낀다.
  const [hasOpened, setHasOpened] = useState(!collapsed);
  useEffect(() => {
    if (!collapsed) setHasOpened(true);
  }, [collapsed]);
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

  // ─── AI 변형 (문제생성 워크스페이스 메커니즘 이식) ───
  // 마킹(annotations)을 보존하기 위해, 본문 치환은 editorSeed remount 대신 TipTap
  // 트랜잭션(insertContentAt)으로 부분 적용한다 — 변형 구간 밖 마크는 그대로 유지.
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selection, setSelection] = useState<{
    from: number;
    to: number;
    text: string;
  } | null>(null);
  const [txBusy, setTxBusy] = useState<
    "paraphrase" | "prepend" | "variant" | null
  >(null);
  const [prependCount, setPrependCount] = usePersistedState<number>(
    "smoat:generate:prepend-sentence-count",
    3,
    (v): v is number => typeof v === "number" && v >= 1 && v <= 5,
  );
  const [paraPreview, setParaPreview] = useState<{
    from: number;
    to: number;
    original: string;
    text: string;
    note: string;
  } | null>(null);
  const [prependPreview, setPrependPreview] = useState<{
    text: string;
    note: string;
  } | null>(null);
  const [variantPreview, setVariantPreview] = useState<{
    mode: WholePassageTransformMode;
    direction?: VariantDirection;
    label: string;
    text: string;
    title: string;
    summary: string;
  } | null>(null);
  const [variantAdding, setVariantAdding] = useState(false);
  const variantAvoidRef = useRef<string[]>([]);

  const anyPreview = !!paraPreview || !!prependPreview || !!variantPreview;
  const canTransform = charCount >= MIN_TRANSFORM_CHARS && !busy && !txBusy;

  const handleEditorReady = useCallback((ed: Editor | null) => setEditor(ed), []);

  // 선택 변경 추적 — '문장 변형' 버튼 활성화 + 적용 위치 확보.
  useEffect(() => {
    if (!editor) {
      setSelection(null);
      return;
    }
    const update = () => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, " ");
      setSelection(
        to > from && text.trim().length >= MIN_PARAPHRASE_CHARS
          ? { from, to, text }
          : null,
      );
    };
    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  const runParaphrase = useCallback(
    async (avoidTexts: string[]) => {
      const ed = editor;
      if (!ed) return;
      const { from, to } = ed.state.selection;
      const text = ed.state.doc.textBetween(from, to, " ");
      if (to <= from || text.trim().length < MIN_PARAPHRASE_CHARS) {
        toast.info("본문에서 바꿀 문장을 드래그로 선택하세요.");
        return;
      }
      setTxBusy("paraphrase");
      try {
        const r = await requestPassageTransform({
          mode: "PARAPHRASE",
          passageText: row.content,
          selectedText: text,
          avoidTexts: avoidTexts.length ? avoidTexts : undefined,
        });
        setParaPreview({ from, to, original: text, text: r.text, note: r.note });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "AI 문장 변형에 실패했습니다.",
        );
      } finally {
        setTxBusy(null);
      }
    },
    [editor, row.content],
  );

  const applyParaphrase = useCallback(() => {
    const ed = editor;
    if (!paraPreview || !ed) return;
    const cur = ed.state.doc.textBetween(paraPreview.from, paraPreview.to, " ");
    if (cur !== paraPreview.original) {
      toast.error("본문이 변경돼 변형을 적용할 수 없어요. 문장을 다시 선택하세요.");
      setParaPreview(null);
      return;
    }
    // insertContentAt 으로 구간만 치환 → 바깥 마크는 자동 보존(ProseMirror 매핑).
    ed.chain()
      .focus()
      .insertContentAt(
        { from: paraPreview.from, to: paraPreview.to },
        { type: "text", text: paraPreview.text.replace(/\s+/g, " ").trim() },
      )
      .run();
    setParaPreview(null);
    setSelection(null);
  }, [editor, paraPreview]);

  const runPrepend = useCallback(
    async (avoidTexts: string[]) => {
      if (row.content.trim().length < MIN_TRANSFORM_CHARS) return;
      setTxBusy("prepend");
      try {
        const r = await requestPassageTransform({
          mode: "PREPEND",
          passageText: row.content,
          sentenceCount: prependCount,
          avoidTexts: avoidTexts.length ? avoidTexts : undefined,
        });
        setPrependPreview({ text: r.text, note: r.note });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "앞 문단 생성에 실패했습니다.",
        );
      } finally {
        setTxBusy(null);
      }
    },
    [row.content, prependCount],
  );

  const applyPrepend = useCallback(() => {
    const ed = editor;
    if (!prependPreview || !ed) return;
    // 맨 앞에 새 문단을 끼워 넣는다 — 기존 마크는 뒤로 밀리며 보존된다.
    ed.chain()
      .focus()
      .insertContentAt(0, {
        type: "paragraph",
        content: [
          { type: "text", text: prependPreview.text.replace(/\s+/g, " ").trim() },
        ],
      })
      .run();
    setPrependPreview(null);
  }, [editor, prependPreview]);

  const changePrependCount = (d: number) =>
    setPrependCount(Math.min(5, Math.max(1, prependCount + d)));

  const runVariant = useCallback(
    async (
      mode: WholePassageTransformMode,
      direction: VariantDirection | undefined,
      avoidTexts: string[],
    ) => {
      setTxBusy("variant");
      try {
        const r = await requestPassageTransform({
          mode,
          passageText: row.content,
          direction,
          avoidTexts: avoidTexts.length ? avoidTexts : undefined,
        });
        if (!r.text.trim()) throw new Error("변형 결과가 비어 있습니다.");
        variantAvoidRef.current = [...variantAvoidRef.current, r.text].slice(-5);
        setVariantPreview((prev) => ({
          mode,
          direction,
          label: variantModeLabel(mode, direction),
          text: r.text,
          title:
            prev?.title?.trim() ||
            r.title.trim() ||
            defaultVariantTitle(row.title, mode, direction),
          summary: r.summary,
        }));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "변형 지문 생성에 실패했습니다.",
        );
      } finally {
        setTxBusy(null);
      }
    },
    [row.content, row.title],
  );

  const handleVariantPick = useCallback(
    (action: VariantAction) => {
      variantAvoidRef.current = [];
      setVariantPreview(null);
      void runVariant(action.mode, action.direction, []);
    },
    [runVariant],
  );

  const applyVariant = useCallback(async () => {
    if (!variantPreview || !onAddVariant || variantAdding) return;
    setVariantAdding(true);
    try {
      const ok = await onAddVariant({
        sourcePassageId: row.passageId,
        title: variantPreview.title.trim(),
        content: variantPreview.text,
        mode: variantPreview.mode,
        direction: variantPreview.direction,
      });
      if (ok) {
        setVariantPreview(null);
        variantAvoidRef.current = [];
      }
    } finally {
      setVariantAdding(false);
    }
  }, [variantPreview, onAddVariant, variantAdding, row.passageId]);

  const preview =
    trimmed.slice(0, 48).replace(/\s+/g, " ") + (trimmed.length > 48 ? "…" : "");

  // Stretch to fill the available height when this is the only (expanded) row.
  const fill = !!grow && !collapsed;

  return (
    <div
      onAnimationEnd={(e) => {
        if (justAdded && e.animationName === "passage-added-glow") {
          onGlowEnd?.();
        }
      }}
      className={
        "rounded-xl border border-slate-200 bg-white shadow-sm" +
        (fill ? " flex min-h-0 flex-1 flex-col" : "") +
        (justAdded ? " passage-added-glow" : "")
      }
    >
      {/* Row header — click anywhere on the bar to expand/collapse */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? "펼치기" : "접기"}
        className="flex cursor-pointer select-none items-center gap-2 border-b border-slate-100 px-3 py-2 transition-colors hover:bg-slate-50/70"
      >
        {onToggleSelected ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={!!selected}
            aria-label="지문 선택"
            title="이 지문 선택"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelected();
            }}
            className={
              "flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors " +
              (selected
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-slate-300 bg-white text-transparent hover:border-blue-400")
            }
          >
            <Check className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
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

      {/* 본문 영역 — grid-rows 0fr↔1fr 트릭으로 펼침/접힘을 부드럽게 애니메이션한다.
          grow(단일 행)일 때는 wrapper 를 flex-1 로 늘려 에디터가 높이를 채운다.
          grid 레이아웃을 항상 써야 grow→일반 전환(2번째 지문 불러오기) 순간에도
          1fr→0fr 트랜지션이 끊기지 않는다. */}
      {hasOpened && (
        <div
          className={
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out " +
            (collapsed
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100") +
            (fill ? " min-h-0 flex-1" : "")
          }
        >
          <div
            className={
              "min-h-0 overflow-hidden" + (fill ? " flex flex-col" : "")
            }
          >
            <div
              className={
                "px-3 py-3" + (fill ? " flex min-h-0 flex-1 flex-col" : "")
              }
            >
          {/* Title */}
          {/* Content label (글자수는 입력창 우측하단으로 이동) */}
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11.5px] font-medium text-slate-500">
              {inReview ? "복원된 지문 (수정·마킹 가능)" : "지문 내용"}{" "}
              <span className="text-red-500">*</span>
            </label>
          </div>

          {/* ── AI 변형 도구 (학습지 워크스페이스 전용) ── 변형 지문 생성 ·
              (선택 시) AI 문장 변형. 앞 맥락 추가는 입력창 위 가로 바(아래). */}
          {enableAiTransforms ? (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {onAddVariant ? (
              <VariantMenuButton
                disabled={!canTransform || anyPreview}
                busy={txBusy === "variant"}
                onPick={handleVariantPick}
              />
            ) : null}
            {/* AI 문장 변형 — 본문에서 문장을 드래그 선택하면 활성화 */}
            <button
              type="button"
              onClick={() => void runParaphrase([])}
              disabled={!selection || !canTransform || anyPreview}
              title={
                selection
                  ? "선택한 문장을 뜻은 그대로, 표현만 바꿔 재작성합니다"
                  : "본문에서 바꿀 문장을 드래그로 선택하세요"
              }
              className="flex h-7 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {txBusy === "paraphrase" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              AI 문장 변형
              <CreditCostChip
                amount={CREDIT_COSTS.PASSAGE_TRANSFORM}
                className="rounded-sm bg-white/20 px-1 py-px text-[10px]"
              />
            </button>
          </div>
          ) : null}

          {/* 입력 박스 — [앞 맥락 추가 바(학습지)] + [에디터] + [글자수 우측하단].
              바깥 박스가 테두리·라운드를 갖고, 안쪽 조각은 구분선만 둔다(에디터
              높이 로직은 그대로 유지). */}
          <div
            className={
              "overflow-hidden rounded-lg border border-slate-200 bg-white" +
              (fill ? " flex flex-1 flex-col" : "")
            }
          >
            {/* 앞 맥락 추가 — 입력창 위에 가로로 길게 붙는 insertion-point 바
                (문제생성 워크스페이스와 동일). 점선 가운데 [추가 | 문장 수] 알약. */}
            {enableAiTransforms ? (
              <div className="flex shrink-0 items-center gap-2 border-b border-dashed border-blue-200/80 bg-blue-50/40 px-2.5 py-1.5">
                <span
                  className="h-0 min-w-3 flex-1 border-t border-dashed border-blue-300/80"
                  aria-hidden="true"
                />
                <div className="flex shrink-0 items-stretch overflow-hidden rounded-full border border-blue-300 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => void runPrepend([])}
                    disabled={!canTransform || anyPreview}
                    title={`지문 맥락과 자연스럽게 이어지는 앞 문단(${prependCount}문장)을 AI가 생성해 맨 앞에 끼워 넣습니다`}
                    className="flex min-w-0 cursor-pointer items-center gap-1.5 py-0.5 pl-2.5 pr-2 text-[11.5px] font-bold text-blue-600 transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {txBusy === "prepend" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {txBusy === "prepend"
                        ? "앞 문단을 생성하고 있어요…"
                        : "앞 맥락 문단 추가"}
                    </span>
                    <CreditCostChip
                      amount={CREDIT_COSTS.PASSAGE_TRANSFORM}
                      className="shrink-0 rounded-sm bg-white px-1 py-px text-[10px] text-blue-500 ring-1 ring-inset ring-blue-200"
                    />
                  </button>
                  <span
                    className="my-1 w-px shrink-0 bg-blue-200"
                    aria-hidden="true"
                  />
                  <div
                    className="flex shrink-0 items-center gap-0.5 px-1"
                    title="생성할 앞 문단의 문장 수 (1~5)"
                  >
                    <button
                      type="button"
                      onClick={() => changePrependCount(-1)}
                      disabled={busy || prependCount <= 1}
                      aria-label="앞 문단 문장 수 줄이기"
                      className="flex h-5 w-5 items-center justify-center rounded-full text-blue-400 transition-colors hover:bg-blue-100/70 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-[38px] text-center text-[11px] font-bold tabular-nums text-blue-700">
                      {prependCount}문장
                    </span>
                    <button
                      type="button"
                      onClick={() => changePrependCount(1)}
                      disabled={busy || prependCount >= 5}
                      aria-label="앞 문단 문장 수 늘리기"
                      className="flex h-5 w-5 items-center justify-center rounded-full text-blue-400 transition-colors hover:bg-blue-100/70 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <span
                  className="h-0 min-w-3 flex-1 border-t border-dashed border-blue-300/80"
                  aria-hidden="true"
                />
              </div>
            ) : null}

            {/* 에디터 영역 — 본문 길이에 맞춰 높이 (fill 은 채움). */}
            <div
              className={fill ? "flex min-h-0 flex-1 flex-col" : ""}
              style={
                fill
                  ? { minHeight: editorHeightPx ?? 320 }
                  : { minHeight: 160, maxHeight: editorHeightPx ?? 460 }
              }
            >
              <PassageAnnotationEditor
                key={`${row.localId}:${row.editorSeed}`}
                content={row.content}
                onContentChange={handleContentChange}
                annotations={row.annotations}
                onAnnotationsChange={handleAnnotationsChange}
                onEditorReady={handleEditorReady}
                editable={!busy}
                placeholder={
                  "여기에 영어 지문을 붙여넣으세요...\n\n텍스트를 드래그하면 핵심 어휘·어법·출제 포인트를 마킹할 수 있어요. 빈칸·선지 마커가 섞인 '문제 형태'면 'AI 복원'으로 원문을 복구하세요."
                }
              />
            </div>

            {/* 글자수 — 입력창 우측하단 (문제생성 워크스페이스와 동일) */}
            {charCount > 0 ? (
              <div className="flex shrink-0 justify-end border-t border-slate-100 px-2.5 py-1 text-[10.5px] tabular-nums text-slate-400">
                {charCount.toLocaleString()}자
              </div>
            ) : null}
          </div>

          {/* AI 변형 미리보기 패널 (한 번에 하나만) — 문제생성과 동일 UI */}
          {paraPreview ? (
            <div className="mt-2">
              <ParaphrasePreviewPanel
                original={paraPreview.original}
                rewritten={paraPreview.text}
                note={paraPreview.note}
                busy={txBusy === "paraphrase"}
                disabled={busy}
                onApply={applyParaphrase}
                onRegenerate={() => void runParaphrase([paraPreview.text])}
                onCancel={() => setParaPreview(null)}
              />
            </div>
          ) : null}
          {prependPreview ? (
            <div className="mt-2">
              <PrependPreviewPanel
                paragraph={prependPreview.text}
                firstSentence={trimmed.slice(0, 60)}
                note={prependPreview.note}
                busy={txBusy === "prepend"}
                disabled={busy}
                onApply={applyPrepend}
                onRegenerate={() => void runPrepend([prependPreview.text])}
                onCancel={() => setPrependPreview(null)}
              />
            </div>
          ) : null}
          {variantPreview ? (
            <div className="mt-2">
              <WholePassageVariantPreviewPanel
                label={variantPreview.label}
                variantText={variantPreview.text}
                sourceWords={wordCount}
                title={variantPreview.title}
                summary={variantPreview.summary}
                busy={txBusy === "variant" || variantAdding}
                disabled={busy}
                onTitleChange={(v) =>
                  setVariantPreview((p) => (p ? { ...p, title: v } : p))
                }
                onApply={() => void applyVariant()}
                onRegenerate={() =>
                  void runVariant(
                    variantPreview.mode,
                    variantPreview.direction,
                    variantAvoidRef.current,
                  )
                }
                onCancel={() => setVariantPreview(null)}
              />
            </div>
          ) : null}

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
          </div>
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
