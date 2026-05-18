import * as React from "react";
import NextImage from "next/image";
import { cn } from "@/lib/utils";

import { SUBTYPE_LABELS } from "../constants";
import { renderFormattedInline } from "../paper-item-utils";
import { TEMPLATE_VISUALS } from "../templates";
import type {
  Density,
  DropPlacement,
  HeaderPatch,
  PaperItem,
  PaperPage,
  PaperTemplate,
  PassageStyle,
} from "../types";
import { EditableText } from "./editable-text";
import {
  ContinuedHeader,
  PageHeader,
} from "./a4-paper-page-parts/page-header";
import { PaperItemActions } from "./a4-paper-page-parts/paper-item-actions";
import { usePaperItemDrag } from "./a4-paper-page-parts/use-paper-item-drag";

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
  onUpdateGroupPassage: (
    groupId: string | null,
    patch: Pick<Partial<PaperItem>, "passageTitle" | "passageContent">,
  ) => void;
  onMoveItemToDropTarget: (
    sourceLocalId: string,
    targetLocalId: string,
    placement: DropPlacement,
  ) => void;
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

  const { startDrag } = usePaperItemDrag({
    setActiveItemId,
    setDraggingItemId,
    setDragOverItemId,
    setDragPlacement,
    onMoveItemToDropTarget,
  });

  return (
    <div
      className={cn(
        "exam-a4-page relative aspect-[210/297] w-full overflow-hidden shadow-xl ring-1",
        visual.pageClass,
      )}
    >
      <div
        className={cn(
          "relative flex h-full flex-col",
          compact ? "px-[34px] py-[30px]" : "px-[42px] py-[38px]",
          visual.innerClass,
        )}
      >
        {pageIndex === 0 && (
          <PageHeader
            compact={compact}
            template={template}
            title={title}
            subtitle={subtitle}
            instructions={instructions}
            studentNameLabel={studentNameLabel}
            academyLogoDataUrl={academyLogoDataUrl}
            schoolName={schoolName}
            className={className}
            examDate={examDate}
            onHeaderChange={onHeaderChange}
          />
        )}

        {pageIndex > 0 && (
          <ContinuedHeader
            pageIndex={pageIndex}
            pageCount={pageCount}
            title={title}
            template={template}
            onHeaderChange={onHeaderChange}
          />
        )}

        <main
          className={cn(
            "grid min-h-0 flex-1",
            columns === 2 ? "grid-cols-2 gap-8" : "grid-cols-1",
            compact
              ? "text-[10.5px] leading-[1.46]"
              : "text-[11.5px] leading-[1.58]",
            visual.mainClass,
          )}
        >
          {pageColumns.map((columnFragments, columnIndex) => (
            <div key={columnIndex} className="min-h-0 space-y-4">
              {columnFragments.map((fragment) => (
                <div key={fragment.id} className="break-inside-avoid">
                  {fragment.includePassage &&
                    fragment.passageRenderedLines.length > 0 &&
                    (() => {
                      const isPassageStart =
                        fragment.passageStartLineIndex === 0;
                      const endLineIndex =
                        fragment.passageStartLineIndex +
                        fragment.passageRenderedLines.length;
                      const isPassageEnd =
                        endLineIndex >= fragment.passageTotalLines;
                      const renderedText =
                        fragment.passageRenderedLines.join("\n");
                      const isSplit = !(isPassageStart && isPassageEnd);
                      return (
                        <div
                          className={cn(
                            "mb-3 break-inside-avoid",
                            passageStyle === "boxed" &&
                              "rounded border px-3 py-2",
                            passageStyle === "underlined" &&
                              "border-b border-t py-2",
                            passageStyle === "plain" && "py-1",
                            visual.passageClass,
                          )}
                        >
                          {showPassageTitle &&
                            fragment.passageTitle &&
                            isPassageStart && (
                              <p
                                className={cn(
                                  "mb-1 text-[10px] font-black uppercase tracking-wide",
                                  visual.passageTitleClass,
                                )}
                              >
                                <EditableText
                                  value={fragment.passageTitle}
                                  onCommit={(next) =>
                                    onUpdateGroupPassage(
                                      fragment.groupSourceId,
                                      { passageTitle: next },
                                    )
                                  }
                                >
                                  {fragment.passageTitle}
                                </EditableText>
                              </p>
                            )}
                          {!isPassageStart && (
                            <p
                              className={cn(
                                "no-print mb-1 text-[9px] italic",
                                visual.passageTitleClass,
                              )}
                            >
                              (지문 계속)
                            </p>
                          )}
                          <p
                            className={cn(
                              "whitespace-pre-line text-justify",
                              visual.questionClass,
                            )}
                          >
                            {isSplit ? (
                              <span className="block">
                                {renderFormattedInline(renderedText)}
                              </span>
                            ) : (
                              <EditableText
                                value={fragment.passageContent}
                                onCommit={(next) =>
                                  onUpdateGroupPassage(fragment.groupSourceId, {
                                    passageContent: next,
                                  })
                                }
                                className="block"
                              >
                                {renderFormattedInline(renderedText)}
                              </EditableText>
                            )}
                          </p>
                          {isSplit && !isPassageEnd && (
                            <p
                              className={cn(
                                "no-print mt-1 text-[9px] italic text-slate-400",
                                visual.passageTitleClass,
                              )}
                            >
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
                          onMouseDownCapture={() =>
                            setActiveItemId(item.localId)
                          }
                          onFocusCapture={() => setActiveItemId(item.localId)}
                          style={{
                            breakBefore:
                              part.isStart && item.breakBefore === "page"
                                ? "page"
                                : part.isStart && item.breakBefore === "column"
                                  ? "column"
                                  : undefined,
                            breakInside: item.keepWithPrev
                              ? "avoid"
                              : undefined,
                          }}
                          className={cn(
                            "group/paper-item relative break-inside-avoid rounded-md transition-colors",
                            visual.itemClass,
                            activeItemId === item.localId &&
                              "bg-blue-50/80 ring-2 ring-blue-300",
                            draggingItemId &&
                              draggingItemId !== item.localId &&
                              "hover:ring-2 hover:ring-blue-300 hover:ring-offset-2",
                            dragOverItemId === item.localId &&
                              "ring-2 ring-blue-300 ring-offset-2",
                            draggingItemId === item.localId && "opacity-55",
                            activeItemId === item.localId
                              ? "px-2 py-1.5"
                              : "py-0.5",
                          )}
                        >
                          {part.isStart &&
                            dragOverItemId === item.localId && (
                              <div
                                className={cn(
                                  "no-print pointer-events-none absolute left-0 right-0 z-30 h-1 rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.16)]",
                                  dragPlacement === "before"
                                    ? "-top-2"
                                    : "-bottom-2",
                                )}
                              />
                            )}
                          {part.isStart && (
                            <PaperItemActions
                              item={item}
                              isActive={activeItemId === item.localId}
                              onStartDrag={startDrag}
                              onUpdateItem={onUpdateItem}
                              onToggleKeepWithPrev={onToggleKeepWithPrev}
                              onUngroupItem={onUngroupItem}
                              onRegroupByPassage={onRegroupByPassage}
                              onRemoveItem={onRemoveItem}
                            />
                          )}
                          {part.showHeader && (
                            <>
                              <div className="mb-1 flex items-baseline gap-1.5">
                                <span
                                  className={cn(
                                    "font-black",
                                    compact ? "text-[12px]" : "text-[13px]",
                                    visual.numberClass,
                                  )}
                                >
                                  {item.orderNum}.
                                </span>
                                {showQuestionMeta && (
                                  <span
                                    className={cn(
                                      "text-[9px] font-semibold",
                                      visual.metaClass,
                                    )}
                                  >
                                    [{item.points}점
                                    {item.sourceQuestion.subType
                                      ? ` · ${SUBTYPE_LABELS[item.sourceQuestion.subType] || item.sourceQuestion.subType}`
                                      : ""}
                                    ]
                                  </span>
                                )}
                              </div>
                              <p
                                className={cn(
                                  "whitespace-pre-line font-semibold",
                                  visual.questionClass,
                                )}
                              >
                                <EditableText
                                  value={item.questionText}
                                  onCommit={(next) =>
                                    onUpdateItem(item.localId, {
                                      questionText: next,
                                    })
                                  }
                                  className="block"
                                >
                                  {renderFormattedInline(item.questionText)}
                                </EditableText>
                              </p>
                            </>
                          )}
                          {part.isContinuation && part.options.length > 0 && (
                            <p
                              className={cn(
                                "no-print mb-1 text-[9px] font-semibold italic",
                                visual.metaClass,
                              )}
                            >
                              ({item.orderNum}번 계속)
                            </p>
                          )}
                          {part.options.length > 0 && (
                            <div
                              className={cn(
                                "space-y-1",
                                part.showHeader ? "mt-1.5" : "mt-0",
                                compact ? "text-[10px]" : "text-[11px]",
                              )}
                            >
                              {part.options.map(({ option, originalIndex }) => (
                                <div
                                  key={`${item.localId}-${originalIndex}`}
                                  className={cn(
                                    "flex items-start gap-1.5",
                                    visual.optionRowClass,
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "min-w-[18px] font-bold",
                                      visual.optionNumberClass,
                                    )}
                                  >
                                    {originalIndex + 1}.
                                  </span>
                                  <EditableText
                                    value={option.text}
                                    onCommit={(nextText) => {
                                      const nextOptions = [...item.options];
                                      nextOptions[originalIndex] = {
                                        ...nextOptions[originalIndex],
                                        text: nextText,
                                      };
                                      onUpdateItem(item.localId, {
                                        options: nextOptions,
                                      });
                                    }}
                                    className="flex-1"
                                  >
                                    {renderFormattedInline(option.text)}
                                  </EditableText>
                                </div>
                              ))}
                            </div>
                          )}
                          {part.showAnswer &&
                            showAnswerSpace &&
                            item.answerSpaceLines > 0 && (
                              <div className="mt-2 space-y-2">
                                {Array.from({
                                  length: item.answerSpaceLines,
                                }).map((_, index) => (
                                  <div
                                    key={index}
                                    className={cn(
                                      "h-[12px] border-b",
                                      visual.answerLineClass,
                                    )}
                                  />
                                ))}
                              </div>
                            )}
                          {part.showHeader &&
                            template === "worksheet" &&
                            item.teacherNote && (
                              <p
                                className={cn(
                                  "mt-2 rounded px-2 py-1 text-[9px] font-semibold",
                                  visual.teacherNoteClass,
                                )}
                              >
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

        <footer
          className={cn(
            "mt-3 shrink-0 text-center text-[10px]",
            visual.footerClass,
          )}
        >
          - {pageIndex + 1} / {pageCount} -
        </footer>
      </div>
    </div>
  );
}
