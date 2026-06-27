// @ts-nocheck
"use client";

import { useState, useRef, useEffect } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  Check,
  Copy,
  CheckCircle2,
  Pencil,
  Loader2,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSemesterLabel } from "@/lib/utils";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import { isDirectInputPassage } from "@/lib/passage-source";
import { DragHandle, makeCardDragPreview } from "@/components/ui/drag-handle";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { PassageReportThumbnail } from "@/components/workbench/passage-report-thumbnail";
import { renamePassage } from "@/actions/workbench";
import { toast } from "sonner";
import {
  clearCardTextSelection,
  preventCardDoubleClickTextSelection,
  shouldIgnoreCardDoubleClick,
  shouldIgnoreCardSelectionClick,
  useDeferredCardSelectionClick,
} from "@/components/workbench/shared/card-click";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PassageItem {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date;
  reviewedAt?: Date | null;
  school: { id: string; name: string; type: string } | null;
  analysis: { id: string; updatedAt: Date; analysisData?: string | null } | null;
  /** 최신 PRIME 학습지 보고서 — 카드의 "생성/수정 시각" 표기에 사용. */
  reports?: { createdAt: Date; updatedAt: Date; lastEditedAt?: Date | null }[];
  _count: { questions: number; notes: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAnalysis(analysis: PassageItem["analysis"]) {
  if (!analysis?.analysisData) return null;
  try {
    return typeof analysis.analysisData === "string" ? JSON.parse(analysis.analysisData) : analysis.analysisData;
  } catch { return null; }
}

/** 연월일시분 — 카드 타임스탬프용(예: 2026.06.20 19:32). 잘못된 값이면 null. */
function formatMinuteTimestamp(value?: string | Date | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// PassageFileCard (Grid view)
// ---------------------------------------------------------------------------

export function PassageFileCard({
  passage,
  selected,
  onToggleSelect,
  onViewDetail,
  onEdit,
  reviewed,
  onToggleReview,
  reviewBusy,
  dupCount,
  onDelete,
  deleteBusy,
}: {
  passage: PassageItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onViewDetail: (id: string) => void;
  /** "수정하기" — 상세 모달(편집 모드)을 연다. 미지정 시 onViewDetail 로 폴백. */
  onEdit?: (id: string) => void;
  /** 카드 우상단 휴지통 — 단건 삭제. 미지정 시 버튼을 숨긴다. */
  onDelete?: (id: string) => void;
  /** 삭제 진행 중(낙관적) — 휴지통에 스피너. */
  deleteBusy?: boolean;
  /** 검수완료 여부. 미지정 시 passage.reviewedAt 으로 추론. */
  reviewed?: boolean;
  /** "검수완료/검수취소" 토글. 미지정 시 버튼을 숨긴다. */
  onToggleReview?: (id: string, next: boolean) => void;
  /** 검수 토글 처리 중(낙관적 업데이트 진행) — 버튼에 스피너. */
  reviewBusy?: boolean;
  /** Optional. When this passage is part of a duplicate cluster, the number
   *  of *other* passages that share its normalized content. */
  dupCount?: number;
}) {
  const data = parseAnalysis(passage.analysis);
  const isDirectInput = isDirectInputPassage(passage.source);
  const mainIdea = data?.structure?.mainIdea;
  const isReviewed = reviewed ?? !!passage.reviewedAt;

  // ── 학습지 제목 인라인 편집 (제목 오른쪽 연필) ──
  const [title, setTitle] = useState(passage.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(passage.title);
  const [savingTitle, setSavingTitle] = useState(false);
  useEffect(() => {
    setTitle(passage.title);
  }, [passage.id, passage.title]);
  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === title) {
      setEditingTitle(false);
      setTitleDraft(title);
      return;
    }
    const prev = title;
    setTitle(next);
    setEditingTitle(false);
    setSavingTitle(true);
    try {
      const res = await renamePassage(passage.id, next);
      if (!res.success) {
        setTitle(prev);
        toast.error(res.error || "제목 수정에 실패했습니다.");
      } else {
        toast.success("제목을 변경했습니다.");
      }
    } catch (err) {
      setTitle(prev);
      toast.error(err instanceof Error ? err.message : "제목 수정에 실패했습니다.");
    } finally {
      setSavingTitle(false);
    }
  };

  // 학습지 생성/수정 시각 — 최신 PRIME 보고서의 lastEditedAt > updatedAt > createdAt
  // 순으로, 보고서가 없으면 지문 생성 시각으로 폴백.
  const latestReport = passage.reports?.[0];
  const cardTimestamp = formatMinuteTimestamp(
    latestReport?.lastEditedAt ??
      latestReport?.updatedAt ??
      latestReport?.createdAt ??
      passage.createdAt,
  );

  // 미검수 = 분홍(red-200/80) 테두리 + 은은한 빨강 글로우 (question-bank-card 와 동일 언어).
  // 검수완료 = 초록 테두리.
  const borderColor = isReviewed ? "border-emerald-300" : "border-red-200/80";
  const reviewGlow = isReviewed
    ? "hover:shadow-md"
    : "shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)] hover:shadow-md";
  const dragRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const {
    cancelPendingCardSelectionClick,
    scheduleCardSelectionClick,
  } = useDeferredCardSelectionClick();

  useEffect(() => {
    // 네이티브 드래그(폴더 이동)는 손잡이에만 등록 → 카드 본문은 영역 선택용.
    const el = dragHandleRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({
        passageId: passage.id,
        title: sanitizeAiModelDisclosureText(passage.title),
        type: "passage",
      }),
      onGenerateDragPreview: makeCardDragPreview(dragRef),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [passage.id, passage.title]);

  return (
    <div
      ref={dragRef}
      data-drag-item-id={passage.id}
      onMouseDown={preventCardDoubleClickTextSelection}
      onClick={(e) => {
        if (e.detail > 1 || shouldIgnoreCardSelectionClick(e)) return;
        const shiftKey = e.shiftKey;
        scheduleCardSelectionClick(() => onToggleSelect(passage.id, shiftKey));
      }}
      onDoubleClick={(e) => {
        cancelPendingCardSelectionClick();
        clearCardTextSelection();
        if (shouldIgnoreCardDoubleClick(e)) return;
        onViewDetail(passage.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          onToggleSelect(passage.id, e.shiftKey);
          return;
        }
        if (e.key !== "Enter") return;
        e.preventDefault();
        onViewDetail(passage.id);
      }}
      className={`group relative flex h-full min-h-[212px] flex-row overflow-hidden rounded-xl border ${borderColor} ${reviewGlow} bg-white transition-all duration-200 cursor-pointer ${
        selected ? "ring-2 ring-blue-400" : ""
      } ${isDragging ? "opacity-40 scale-95" : ""}
      `}>
        {/* ─── 좌측: 분석 보고서(학습지) 첫 장 실제 렌더 미리보기 ─── */}
        <div className="relative w-[148px] shrink-0 self-stretch overflow-hidden border-r border-slate-100 bg-white">
          <PassageReportThumbnail passageId={passage.id} />
        </div>

        {/* ─── 우측: 카드 본문 ─── */}
        <div className="flex min-w-0 flex-1 flex-col px-3.5 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <DragHandle ref={dragHandleRef} className="shrink-0" />
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(passage.id, e.shiftKey); }}
              className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 transition-all ${
                selected ? "bg-blue-600 text-white border border-blue-600" : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400"
              }`}
            >
              <Check className="w-3 h-3" />
            </button>
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveTitle();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingTitle(false);
                      setTitleDraft(title);
                    }
                  }}
                  onBlur={() => void saveTitle()}
                  disabled={savingTitle}
                  placeholder="학습지 제목"
                  className="w-full rounded-md border border-blue-300 bg-white px-1.5 py-0.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60"
                />
              ) : (
                <div className="flex items-center gap-1 min-w-0">
                  <h4 className="text-[13px] font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                    {sanitizeAiModelDisclosureText(title)}
                  </h4>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTitleDraft(title);
                      setEditingTitle(true);
                    }}
                    title="학습지 제목 수정"
                    aria-label="학습지 제목 수정"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    {savingTitle ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Pencil className="size-3" />
                    )}
                  </button>
                </div>
              )}
            </div>
            {/* 우측 끝: 단건 삭제(휴지통) — 손잡이·체크박스·제목·연필과 같은 줄. */}
            {onDelete ? (
              <button
                type="button"
                aria-label="삭제"
                title="삭제"
                disabled={deleteBusy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(passage.id);
                }}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
          </div>

          {(passage.school || passage.grade || passage.unit || passage.publisher) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {passage.school && <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-medium">{passage.school.name}</Badge>}
              {passage.grade && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{passage.grade}학년</Badge>}
              {passage.semester && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{getSemesterLabel(passage.semester)}</Badge>}
              {passage.unit && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{passage.unit}</Badge>}
              {passage.publisher && <Badge variant="outline" className="text-[9px] h-5 px-1.5 text-slate-500">{passage.publisher}</Badge>}
            </div>
          )}

          {/* 본문 미리보기 — 상세 내용을 더 길게 노출해 카드 가운데 여백을 줄인다.
              분석 요지(mainIdea)보다 실제 지문 본문이 길어 빈 공간을 잘 채운다. */}
          {(passage.content?.trim() || mainIdea) && (
            <p className="text-[11px] text-slate-500 leading-relaxed mt-2 line-clamp-5">
              {passage.content?.trim() || mainIdea}
            </p>
          )}

          {/* ─── 하단: 생성/수정 시각(연월일시분) + 액션 버튼 행 ─── */}
          <div className="mt-auto pt-3">
            {(cardTimestamp || isDirectInput || (dupCount && dupCount > 0)) ? (
              <div className="mb-1.5 flex items-center gap-1.5">
                {cardTimestamp ? (
                  <span className="text-[10px] tabular-nums text-slate-400">
                    {cardTimestamp}
                  </span>
                ) : null}
                {isDirectInput ? (
                  <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1 py-0 text-[9px] font-semibold text-blue-600">
                    직접 입력
                  </span>
                ) : null}
                {dupCount && dupCount > 0 ? (
                  <span
                    className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0 text-[9px] font-semibold text-slate-500 tabular-nums"
                    title={`동일한 내용의 지문 ${dupCount}편이 더 존재합니다`}
                  >
                    <Copy className="w-2 h-2" />
                    {dupCount} 중복
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-end gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {onToggleReview ? (
                // 검수완료 토글 — 미검수=분홍(red-200/80) 테두리+아이콘+텍스트,
                // hover 시 검수완료(초록) 미리보기. 검수완료=초록 테두리+아이콘+텍스트.
                // (question-bank-card 의 검수 토글과 동일 동작 매커니즘)
                <button
                  type="button"
                  disabled={reviewBusy}
                  aria-pressed={isReviewed}
                  title={
                    isReviewed
                      ? "검수완료 — 누르면 검수를 취소합니다"
                      : "검수필요 — 누르면 검수완료로 표시합니다"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleReview(passage.id, !isReviewed);
                  }}
                  className={
                    "flex h-7 flex-1 min-w-0 items-center justify-center gap-1.5 rounded-md bg-white px-2 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                    (isReviewed
                      ? "border border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                      : "border border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
                  }
                >
                  {reviewBusy ? (
                    <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{isReviewed ? "검수완료" : "미검수"}</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  (onEdit ?? onViewDetail)(passage.id);
                }}
                className="flex h-7 flex-1 min-w-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                <Pencil className="w-3 h-3 shrink-0" />
                <span className="truncate">수정하기</span>
              </button>
            </div>
            <CardDetailIconButton
              className="size-7 rounded-md"
              iconClassName="size-3.5"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetail(passage.id);
              }}
            />
            </div>
          </div>
        </div>
    </div>
  );
}
