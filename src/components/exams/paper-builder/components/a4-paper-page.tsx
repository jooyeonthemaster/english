import * as React from "react";
import NextImage from "next/image";
import {
  ArrowDownToLine,
  BookOpen,
  Columns2,
  FileText,
  Group,
  GripVertical,
  Minus,
  Plus,
  Trash2,
  Ungroup,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SUBTYPE_LABELS } from "../constants";
import { TEMPLATE_VISUALS } from "../templates";
import { renderFormattedInline } from "../paper-item-utils";
import type {
  BreakBefore,
  Density,
  DropPlacement,
  HeaderPatch,
  PaperItem,
  PaperPage,
  PaperTemplate,
  PassageStyle,
} from "../types";
import { EditableText } from "./editable-text";

export interface A4PaperPageProps {
  pageIndex: number;
  pageCount: number;
  title: string;
  subtitle: string;
  instructions: string;
  studentNameLabel: string;
  academyLogoDataUrl: string | null;
  template: PaperTemplate;
  columns: 1 | 2;
  density: Density;
  passageStyle: PassageStyle;
  showAnswerSpace: boolean;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  pageColumns: PaperPage;
  activeItemId: string | null;
  setActiveItemId: (id: string | null) => void;
  onHeaderChange: (patch: HeaderPatch) => void;
  onUpdateItem: (localId: string, patch: Partial<PaperItem>) => void;
  onUpdateGroupPassage: (groupId: string | null, patch: Pick<Partial<PaperItem>, "passageTitle" | "passageContent">) => void;
  onMoveItemToDropTarget: (sourceLocalId: string, targetLocalId: string, placement: DropPlacement) => void;
  onRemoveItem: (localId: string) => void;
  onUngroupItem: (localId: string) => void;
  onRegroupByPassage: () => void;
  onToggleKeepWithPrev: (localId: string) => void;
  overflowItemIds: Set<string>;
  draggingItemId: string | null;
  setDraggingItemId: (id: string | null) => void;
  dragOverItemId: string | null;
  setDragOverItemId: (id: string | null) => void;
  dragPlacement: DropPlacement;
  setDragPlacement: (placement: DropPlacement) => void;
  schoolName: string;
  className: string;
  examDate: string;
}

export function A4PaperPage({
  pageIndex,
  pageCount,
  title,
  subtitle,
  instructions,
  studentNameLabel,
  academyLogoDataUrl,
  template,
  columns,
  density,
  passageStyle,
  showAnswerSpace,
  showPassageTitle,
  showQuestionMeta,
  pageColumns,
  activeItemId,
  setActiveItemId,
  onHeaderChange,
  onUpdateItem,
  onUpdateGroupPassage,
  onMoveItemToDropTarget,
  onRemoveItem,
  onUngroupItem,
  onRegroupByPassage,
  onToggleKeepWithPrev,
  overflowItemIds,
  draggingItemId,
  setDraggingItemId,
  dragOverItemId,
  setDragOverItemId,
  dragPlacement,
  setDragPlacement,
  schoolName,
  className,
  examDate,
}: A4PaperPageProps) {
  const compact = density === "compact";
  const visual = TEMPLATE_VISUALS[template];
  void overflowItemIds;

  function updateDragTarget(clientX: number, clientY: number, sourceLocalId: string) {
    const targetElement = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-paper-item-id]");
    const targetLocalId = targetElement?.dataset.paperItemId || null;

    if (!targetElement || !targetLocalId || targetLocalId === sourceLocalId) {
      setDragOverItemId(null);
      return null;
    }

    const rect = targetElement.getBoundingClientRect();
    const placement: DropPlacement = clientY > rect.top + rect.height / 2 ? "after" : "before";
    setDragOverItemId(targetLocalId);
    setDragPlacement(placement);
    return { targetLocalId, placement };
  }

  function autoScrollPaperPreview(clientY: number) {
    const scroller = document.getElementById("exam-paper-print-root");
    if (!scroller) return;

    const rect = scroller.getBoundingClientRect();
    const edgeSize = 72;
    const scrollStep = 18;

    if (clientY < rect.top + edgeSize) {
      scroller.scrollTop -= scrollStep;
    } else if (clientY > rect.bottom - edgeSize) {
      scroller.scrollTop += scrollStep;
    }
  }

  function startPaperItemDrag(event: React.PointerEvent<HTMLButtonElement>, sourceLocalId: string) {
    event.preventDefault();
    event.stopPropagation();

    setActiveItemId(sourceLocalId);
    setDraggingItemId(sourceLocalId);
    setDragOverItemId(null);

    let latestDropTarget: { targetLocalId: string; placement: DropPlacement } | null = null;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      autoScrollPaperPreview(moveEvent.clientY);
      latestDropTarget =
        updateDragTarget(moveEvent.clientX, moveEvent.clientY, sourceLocalId) || latestDropTarget;
    };

    const finishDrag = (upEvent?: PointerEvent) => {
      if (upEvent) {
        latestDropTarget =
          updateDragTarget(upEvent.clientX, upEvent.clientY, sourceLocalId) || latestDropTarget;
      }
      if (latestDropTarget) {
        onMoveItemToDropTarget(sourceLocalId, latestDropTarget.targetLocalId, latestDropTarget.placement);
      }

      setDraggingItemId(null);
      setDragOverItemId(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };

    const handlePointerUp = (upEvent: PointerEvent) => finishDrag(upEvent);
    const handlePointerCancel = () => finishDrag();

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerCancel, { once: true });
  }

  return (
    <div
      className={cn(
        "exam-a4-page relative aspect-[210/297] w-full overflow-hidden shadow-xl ring-1",
        visual.pageClass,
      )}
    >
      <div className={cn("relative flex h-full flex-col", compact ? "px-[34px] py-[30px]" : "px-[42px] py-[38px]", visual.innerClass)}>
        {pageIndex === 0 && (
          <header className={cn("shrink-0", compact ? "mb-4" : "mb-5", visual.headerClass)}>
            <div
              className={cn(
                "flex items-start justify-between gap-4 border-b pb-3",
                visual.headerLineClass,
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {academyLogoDataUrl && (
                  <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border", visual.logoFrameClass)}>
                    <NextImage
                      src={academyLogoDataUrl}
                      alt="학원 로고"
                      width={48}
                      height={48}
                      unoptimized
                      className="h-full w-full object-contain p-1"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {subtitle && (
                    <p className={cn("font-bold tracking-[0.18em]", compact ? "text-[8px]" : "text-[9px]", visual.subtitleClass)}>
                      <EditableText value={subtitle} onCommit={(next) => onHeaderChange({ subtitle: next })}>
                        {subtitle}
                      </EditableText>
                    </p>
                  )}
                  <h2 className={cn("mt-1 break-keep font-black tracking-tight", compact ? "text-[22px]" : "text-[28px]", visual.titleClass)}>
                    <EditableText value={title} onCommit={(next) => onHeaderChange({ title: next })} className="block">
                      {title}
                    </EditableText>
                  </h2>
                </div>
              </div>
              <div className={cn("w-[168px] shrink-0 space-y-1 text-[10px]", visual.infoClass)}>
                <div className="flex justify-between border-b pb-1">
                  <span>학교</span>
                  <span className="font-semibold">{schoolName || " "}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span>반</span>
                  <span className="font-semibold">{className || " "}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span>{studentNameLabel || "이름"}</span>
                  <span className="min-w-[64px]">&nbsp;</span>
                </div>
              </div>
            </div>
            <div className={cn("mt-2 flex items-center justify-between gap-3 text-[10px]", visual.instructionsClass)}>
              <p className="min-w-0 flex-1 truncate">
                <EditableText value={instructions} onCommit={(next) => onHeaderChange({ instructions: next })} className="block truncate">
                  {instructions}
                </EditableText>
              </p>
              <span className="shrink-0">{examDate || ""}</span>
            </div>
          </header>
        )}

        {pageIndex > 0 && (
          <header className={cn("mb-3 flex shrink-0 items-center justify-between border-b pb-2 text-[10px]", visual.continuedHeaderClass)}>
            <EditableText value={title} onCommit={(next) => onHeaderChange({ title: next })}>
              {title}
            </EditableText>
            <span>{pageIndex + 1} / {pageCount}</span>
          </header>
        )}

        <main
          className={cn(
            "grid min-h-0 flex-1",
            columns === 2 ? "grid-cols-2 gap-8" : "grid-cols-1",
            compact ? "text-[10.5px] leading-[1.46]" : "text-[11.5px] leading-[1.58]",
            visual.mainClass,
          )}
        >
          {pageColumns.map((columnFragments, columnIndex) => (
            <div key={columnIndex} className="min-h-0 space-y-4">
              {columnFragments.map((fragment) => (
                <div key={fragment.id} className="break-inside-avoid">
                  {fragment.includePassage && fragment.passageRenderedLines.length > 0 && (() => {
                    const isPassageStart = fragment.passageStartLineIndex === 0;
                    const endLineIndex = fragment.passageStartLineIndex + fragment.passageRenderedLines.length;
                    const isPassageEnd = endLineIndex >= fragment.passageTotalLines;
                    const renderedText = fragment.passageRenderedLines.join("\n");
                    const isSplit = !(isPassageStart && isPassageEnd);
                    return (
                      <div
                        className={cn(
                          "mb-3 break-inside-avoid",
                          passageStyle === "boxed" && "rounded border px-3 py-2",
                          passageStyle === "underlined" && "border-b border-t py-2",
                          passageStyle === "plain" && "py-1",
                          visual.passageClass,
                        )}
                      >
                        {showPassageTitle && fragment.passageTitle && isPassageStart && (
                          <p className={cn("mb-1 text-[10px] font-black uppercase tracking-wide", visual.passageTitleClass)}>
                            <EditableText
                              value={fragment.passageTitle}
                              onCommit={(next) => onUpdateGroupPassage(fragment.groupSourceId, { passageTitle: next })}
                            >
                              {fragment.passageTitle}
                            </EditableText>
                          </p>
                        )}
                        {!isPassageStart && (
                          <p className={cn("no-print mb-1 text-[9px] italic", visual.passageTitleClass)}>
                            (지문 계속)
                          </p>
                        )}
                        <p className={cn("whitespace-pre-line text-justify", visual.questionClass)}>
                          {isSplit ? (
                            <span className="block">{renderFormattedInline(renderedText)}</span>
                          ) : (
                            <EditableText
                              value={fragment.passageContent}
                              onCommit={(next) => onUpdateGroupPassage(fragment.groupSourceId, { passageContent: next })}
                              className="block"
                            >
                              {renderFormattedInline(renderedText)}
                            </EditableText>
                          )}
                        </p>
                        {isSplit && !isPassageEnd && (
                          <p className={cn("no-print mt-1 text-[9px] italic text-slate-400", visual.passageTitleClass)}>
                            (다음 칸으로 이어짐 →)
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  <div className="space-y-3">
                    {fragment.parts.map((part) => {
                      const item = part.source;
                      return (
                        <div
                          key={part.partKey}
                          data-paper-item-id={item.localId}
                          onClick={() => setActiveItemId(item.localId)}
                          onMouseDownCapture={() => setActiveItemId(item.localId)}
                          onFocusCapture={() => setActiveItemId(item.localId)}
                          style={{
                            breakBefore: part.isStart && item.breakBefore === "page" ? "page" : part.isStart && item.breakBefore === "column" ? "column" : undefined,
                            breakInside: item.keepWithPrev ? "avoid" : undefined,
                          }}
                          className={cn(
                            "group/paper-item relative break-inside-avoid rounded-md transition-colors",
                            visual.itemClass,
                            activeItemId === item.localId && "bg-blue-50/80 ring-2 ring-blue-300",
                            draggingItemId && draggingItemId !== item.localId && "hover:ring-2 hover:ring-blue-300 hover:ring-offset-2",
                            dragOverItemId === item.localId && "ring-2 ring-blue-300 ring-offset-2",
                            draggingItemId === item.localId && "opacity-55",
                            activeItemId === item.localId ? "px-2 py-1.5" : "py-0.5",
                          )}
                        >
                          {part.isStart && dragOverItemId === item.localId && (
                            <div
                              className={cn(
                                "no-print pointer-events-none absolute left-0 right-0 z-30 h-1 rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.16)]",
                                dragPlacement === "before" ? "-top-2" : "-bottom-2",
                              )}
                            />
                          )}
                          {part.isStart && (
                            <div
                              className={cn(
                                "no-print pointer-events-none absolute -right-2 -top-3 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 opacity-0 shadow-lg backdrop-blur transition-opacity group-hover/paper-item:pointer-events-auto group-hover/paper-item:opacity-100 group-focus-within/paper-item:pointer-events-auto group-focus-within/paper-item:opacity-100",
                                activeItemId === item.localId && "pointer-events-auto opacity-100",
                              )}
                            >
                              <button
                                type="button"
                                onPointerDown={(event) => startPaperItemDrag(event, item.localId)}
                                className="flex h-6 w-6 touch-none cursor-grab items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700 active:cursor-grabbing"
                                title="문항 드래그"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onUpdateItem(item.localId, { points: Math.max(1, item.points - 1) });
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                title="배점 낮추기"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onUpdateItem(item.localId, { points: item.points + 1 });
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                title="배점 올리기"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onUpdateItem(item.localId, { includePassage: !item.includePassage });
                                }}
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-50",
                                  item.includePassage ? "text-blue-600" : "text-slate-400 hover:text-slate-700",
                                )}
                                title="지문 표시 전환"
                              >
                                <BookOpen className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onToggleKeepWithPrev(item.localId);
                                }}
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-md hover:bg-blue-50",
                                  item.keepWithPrev ? "text-blue-600" : "text-slate-400 hover:text-slate-700",
                                )}
                                title={
                                  item.keepWithPrev
                                    ? "한 덩어리로 유지 — 분할 안 함 (켜짐, 클릭 → 자연 흐름)"
                                    : "한 덩어리로 유지 — 다음 칸/페이지로 통째 이동 (클릭 → 켜짐)"
                                }
                              >
                                <ArrowDownToLine className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const next: BreakBefore = item.breakBefore === "column" ? "auto" : "column";
                                  onUpdateItem(item.localId, { breakBefore: next });
                                }}
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-md hover:bg-emerald-50",
                                  item.breakBefore === "column" ? "text-emerald-600" : "text-slate-400 hover:text-slate-700",
                                )}
                                title={
                                  item.breakBefore === "column"
                                    ? "다음 칸으로 강제 줄바꿈 (켜짐)"
                                    : "다음 칸으로 강제 줄바꿈"
                                }
                              >
                                <Columns2 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const next: BreakBefore = item.breakBefore === "page" ? "auto" : "page";
                                  onUpdateItem(item.localId, { breakBefore: next });
                                }}
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-md hover:bg-blue-50",
                                  item.breakBefore === "page" ? "text-blue-700" : "text-slate-400 hover:text-slate-700",
                                )}
                                title={
                                  item.breakBefore === "page"
                                    ? "다음 페이지로 강제 줄바꿈 (켜짐)"
                                    : "다음 페이지로 강제 줄바꿈"
                                }
                              >
                                <FileText className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onUngroupItem(item.localId);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                title="현재 문항 묶음 해제"
                              >
                                <Ungroup className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRegroupByPassage();
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-blue-500 hover:bg-blue-50"
                                title="지문별 다시 묶기"
                              >
                                <Group className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRemoveItem(item.localId);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50"
                                title="문항 삭제"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          {part.showHeader && (
                            <>
                              <div className="mb-1 flex items-baseline gap-1.5">
                                <span className={cn("font-black", compact ? "text-[12px]" : "text-[13px]", visual.numberClass)}>
                                  {item.orderNum}.
                                </span>
                                {showQuestionMeta && (
                                  <span className={cn("text-[9px] font-semibold", visual.metaClass)}>
                                    [{item.points}점{item.sourceQuestion.subType ? ` · ${SUBTYPE_LABELS[item.sourceQuestion.subType] || item.sourceQuestion.subType}` : ""}]
                                  </span>
                                )}
                              </div>
                              <p className={cn("whitespace-pre-line font-semibold", visual.questionClass)}>
                                <EditableText
                                  value={item.questionText}
                                  onCommit={(next) => onUpdateItem(item.localId, { questionText: next })}
                                  className="block"
                                >
                                  {renderFormattedInline(item.questionText)}
                                </EditableText>
                              </p>
                            </>
                          )}
                          {part.isContinuation && part.options.length > 0 && (
                            <p className={cn("no-print mb-1 text-[9px] font-semibold italic", visual.metaClass)}>
                              ({item.orderNum}번 계속)
                            </p>
                          )}
                          {part.options.length > 0 && (
                            <div className={cn("space-y-1", part.showHeader ? "mt-1.5" : "mt-0", compact ? "text-[10px]" : "text-[11px]")}>
                              {part.options.map(({ option, originalIndex }) => (
                                <div key={`${item.localId}-${originalIndex}`} className={cn("flex items-start gap-1.5", visual.optionRowClass)}>
                                  <span className={cn("min-w-[18px] font-bold", visual.optionNumberClass)}>{originalIndex + 1}.</span>
                                  <EditableText
                                    value={option.text}
                                    onCommit={(nextText) => {
                                      const nextOptions = [...item.options];
                                      nextOptions[originalIndex] = { ...nextOptions[originalIndex], text: nextText };
                                      onUpdateItem(item.localId, { options: nextOptions });
                                    }}
                                    className="flex-1"
                                  >
                                    {renderFormattedInline(option.text)}
                                  </EditableText>
                                </div>
                              ))}
                            </div>
                          )}
                          {part.showAnswer && showAnswerSpace && item.answerSpaceLines > 0 && (
                            <div className="mt-2 space-y-2">
                              {Array.from({ length: item.answerSpaceLines }).map((_, index) => (
                                <div key={index} className={cn("h-[12px] border-b", visual.answerLineClass)} />
                              ))}
                            </div>
                          )}
                          {part.showHeader && template === "worksheet" && item.teacherNote && (
                            <p className={cn("mt-2 rounded px-2 py-1 text-[9px] font-semibold", visual.teacherNoteClass)}>
                              교사용 메모: {item.teacherNote}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </main>

        <footer className={cn("mt-3 shrink-0 text-center text-[10px]", visual.footerClass)}>
          - {pageIndex + 1} / {pageCount} -
        </footer>
      </div>
    </div>
  );
}
