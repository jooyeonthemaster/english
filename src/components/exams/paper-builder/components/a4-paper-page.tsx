import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

import { PAPER_SIZE_SPECS, SUBTYPE_LABELS } from "../constants";
import {
  formatSentenceInsertPassageMarkers,
  optionDisplayTextForSubtype,
  optionOrdinalLabel,
  shouldUseGrammarOptionReference,
} from "../option-display";
import {
  joinRenderedLinesForDisplay,
  renderFormattedInline,
  renderQuestionTextInline,
} from "../paper-item-utils";
import { TEMPLATE_VISUALS } from "../templates";
import type {
  Density,
  DropPlacement,
  HeaderPatch,
  PaperItem,
  PaperPage,
  PaperSize,
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

function blockTextSizeClass(item: PaperItem) {
  if (item.blockFontSize === "lg") return "text-[14px] leading-[1.65]";
  if (item.blockFontSize === "sm") return "text-[10px] leading-[1.55]";
  return "text-[11.5px] leading-[1.6]";
}

function blockAlignClass(item: PaperItem) {
  if (item.blockAlign === "center") return "text-center";
  if (item.blockAlign === "right") return "text-right";
  return "text-left";
}

function CustomPaperBlock({
  item,
  readOnly,
  onUpdateItem,
}: {
  item: PaperItem;
  readOnly: boolean;
  onUpdateItem: (localId: string, patch: Partial<PaperItem>) => void;
}) {
  const disabled = readOnly || item.locked;
  const accent = item.blockAccentColor || "#2563EB";

  if (item.blockType === "section") {
    return (
      <div
        className="rounded-md border-l-4 bg-slate-50 px-3 py-2"
        style={{ borderLeftColor: accent }}
      >
        <EditableText
          value={item.blockTitle || item.blockText}
          onCommit={(next) =>
            onUpdateItem(item.localId, {
              blockTitle: next,
              blockText: next,
              questionText: next,
              sectionTitle: next,
            })
          }
          className={cn("block font-black text-slate-900", blockAlignClass(item))}
          readOnly={disabled}
        >
          {item.blockTitle || item.blockText || "새 섹션"}
        </EditableText>
      </div>
    );
  }

  if (item.blockType === "text") {
    return (
      <EditableText
        value={item.blockText}
        onCommit={(next) =>
          onUpdateItem(item.localId, {
            blockText: next,
            questionText: next,
          })
        }
        className={cn(
          "block whitespace-pre-line text-slate-700",
          blockTextSizeClass(item),
          blockAlignClass(item),
        )}
        readOnly={disabled}
      >
        {item.blockText || "텍스트를 입력하세요."}
      </EditableText>
    );
  }

  if (item.blockType === "divider") {
    return (
      <div className="py-2">
        <div
          className="w-full"
          style={{
            borderTopColor: accent,
            borderTopStyle: item.dividerStyle || "solid",
            borderTopWidth: Math.max(1, item.dividerThickness || 1),
          }}
        />
      </div>
    );
  }

  if (item.blockType === "spacer") {
    return (
      <div
        className={cn(
          "rounded border border-dashed border-slate-200 bg-slate-50/60 print:border-transparent print:bg-transparent",
          item.locked && "opacity-70",
        )}
        style={{ height: Math.max(8, Math.min(160, item.spacerHeight || 32)) }}
      />
    );
  }

  if (item.blockType === "image") {
    return (
      <figure className={cn("space-y-1.5", blockAlignClass(item))}>
        {item.imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageDataUrl}
            alt={item.imageAlt || ""}
            className={cn(
              "inline-block max-w-full rounded border border-slate-200 object-contain",
              item.blockAlign === "left" && "mr-auto",
              item.blockAlign === "center" && "mx-auto",
              item.blockAlign === "right" && "ml-auto",
            )}
            style={{ width: `${Math.max(20, Math.min(100, item.imageWidth || 70))}%` }}
          />
        ) : (
          <div className="flex h-28 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-[10px] font-bold text-slate-400">
            이미지 없음
          </div>
        )}
        {item.imageAlt && (
          <figcaption className="text-[9px] font-medium text-slate-400">
            {item.imageAlt}
          </figcaption>
        )}
      </figure>
    );
  }

  return null;
}

export interface A4PaperPageProps {
  pageIndex: number;
  pageCount: number;
  paperSize: PaperSize;
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
  dragOverPartKey: string | null;
  setDragOverPartKey: (key: string | null) => void;
  dragPlacement: DropPlacement;
  setDragPlacement: (placement: DropPlacement) => void;
  schoolName: string;
  className: string;
  examDate: string;
  readOnly?: boolean;
}

export function A4PaperPage({
  pageIndex,
  pageCount,
  paperSize,
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
  dragOverPartKey,
  setDragOverPartKey,
  dragPlacement,
  setDragPlacement,
  schoolName,
  className,
  examDate,
  readOnly = false,
}: A4PaperPageProps) {
  const compact = density === "compact";
  const visual = TEMPLATE_VISUALS[template];
  const paperSpec = PAPER_SIZE_SPECS[paperSize];
  void overflowItemIds;

  const { startDrag } = usePaperItemDrag({
    setActiveItemId,
    setDraggingItemId,
    setDragOverItemId,
    setDragOverPartKey,
    setDragPlacement,
    onMoveItemToDropTarget,
  });

  return (
    <div
      className={cn(
        "exam-a4-page relative w-full overflow-hidden shadow-xl ring-1",
        visual.pageClass,
      )}
      style={{ aspectRatio: `${paperSpec.widthMm} / ${paperSpec.heightMm}` }}
      data-paper-size={paperSize}
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
            readOnly={readOnly}
          />
        )}

        {pageIndex > 0 && (
          <ContinuedHeader
            pageIndex={pageIndex}
            pageCount={pageCount}
            title={title}
            template={template}
            onHeaderChange={onHeaderChange}
            readOnly={readOnly}
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
                <div key={fragment.id} className="min-w-0">
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
                      const isSplit = !(isPassageStart && isPassageEnd);
                      const renderedText = formatSentenceInsertPassageMarkers(
                        isSplit
                          ? joinRenderedLinesForDisplay(fragment.passageRenderedLines)
                          : fragment.passageContent,
                        fragment.usesSentenceInsertMarkers ? "SENTENCE_INSERT" : null,
                      );
                      return (
                        <div
                          className={cn(
                            "mb-3",
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
                                  readOnly={readOnly}
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
                                readOnly={readOnly}
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
                      const isCustomBlock = item.blockType !== "question";
                      const isDropTarget =
                        dragOverPartKey === part.partKey ||
                        (!dragOverPartKey &&
                          part.isStart &&
                          dragOverItemId === item.localId);
                      return (
                        <div
                          key={part.partKey}
                          data-paper-item-id={item.localId}
                          data-paper-part-key={part.partKey}
                          onClick={() => {
                            if (!readOnly) setActiveItemId(item.localId);
                          }}
                          onMouseDownCapture={() => {
                            if (!readOnly) setActiveItemId(item.localId);
                          }}
                          onFocusCapture={() => {
                            if (!readOnly) setActiveItemId(item.localId);
                          }}
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
                            "group/paper-item relative rounded-md transition-colors",
                            item.keepWithPrev && "break-inside-avoid",
                            item.locked && "cursor-default",
                            visual.itemClass,
                            !readOnly &&
                              activeItemId === item.localId &&
                              "bg-blue-50/80 ring-2 ring-blue-300",
                            !readOnly &&
                              draggingItemId &&
                              draggingItemId !== item.localId &&
                              "hover:ring-2 hover:ring-blue-300 hover:ring-offset-2",
                            !readOnly &&
                              isDropTarget &&
                              "ring-2 ring-blue-300 ring-offset-2",
                            !readOnly && draggingItemId === item.localId && "opacity-55",
                            !readOnly && activeItemId === item.localId
                              ? "px-2 py-1.5"
                              : isCustomBlock
                                ? "py-1"
                                : "py-0.5",
                          )}
                        >
                          {isDropTarget && (
                              <div
                                className={cn(
                                  "no-print pointer-events-none absolute left-0 right-0 z-30 h-1 rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.16)]",
                                  dragPlacement === "before"
                                    ? "-top-2"
                                    : "-bottom-2",
                                )}
                              />
                            )}
                          {part.isStart && !readOnly && !item.locked && !isCustomBlock && (
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
                          {part.isStart && !readOnly && !item.locked && isCustomBlock && (
                            <button
                              type="button"
                              title="블록 드래그"
                              aria-label="블록 드래그"
                              onPointerDown={(event) => startDrag(event, item.localId)}
                              className={cn(
                                "no-print pointer-events-none absolute -right-2 -top-3 z-20 flex h-7 w-7 touch-none cursor-grab items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-400 opacity-0 shadow-lg backdrop-blur transition-opacity hover:bg-slate-50 hover:text-slate-700 active:cursor-grabbing group-hover/paper-item:pointer-events-auto group-hover/paper-item:opacity-100 group-focus-within/paper-item:pointer-events-auto group-focus-within/paper-item:opacity-100",
                                activeItemId === item.localId && "pointer-events-auto opacity-100",
                              )}
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isCustomBlock && part.showCustomBlock && (
                            <CustomPaperBlock
                              item={item}
                              readOnly={readOnly}
                              onUpdateItem={onUpdateItem}
                            />
                          )}
                          {isCustomBlock && part.showCustomBlock && item.locked && (
                            <span className="no-print absolute right-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[8px] font-bold text-white">
                              LOCK
                            </span>
                          )}
                          {!isCustomBlock && (
                            <>
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
                            </>
                          )}
                          {part.isContinuation &&
                            (part.questionRenderedLines.length > 0 ||
                              part.options.length > 0 ||
                              part.showObjectiveAnswer ||
                              part.showAnswer) && (
                            <p
                              className={cn(
                                "no-print mb-1 text-[9px] font-semibold italic",
                                visual.metaClass,
                              )}
                            >
                              ({item.orderNum}번 계속)
                            </p>
                          )}
                          {part.questionRenderedLines.length > 0 &&
                            (() => {
                              const questionStartsAtBeginning = part.questionStartLineIndex === 0;
                              const questionEndsHere =
                                part.questionStartLineIndex + part.questionRenderedLines.length >=
                                part.questionTotalLines;
                              const questionIsWhole =
                                questionStartsAtBeginning && questionEndsHere;
                              const renderedQuestionText = formatSentenceInsertPassageMarkers(
                                questionIsWhole
                                  ? item.questionText
                                  : joinRenderedLinesForDisplay(part.questionRenderedLines),
                                item.sourceQuestion.subType,
                              );

                              return (
                                <p
                                  className={cn(
                                    "whitespace-pre-line text-justify font-semibold",
                                    visual.questionClass,
                                  )}
                                >
                                  {questionIsWhole ? (
                                    <EditableText
                                      value={item.questionText}
                                      onCommit={(next) =>
                                        onUpdateItem(item.localId, {
                                          questionText: next,
                                        })
                                      }
                                      className="block"
                                      readOnly={readOnly || item.locked}
                                    >
                                      {renderQuestionTextInline(
                                        renderedQuestionText,
                                        item.sourceQuestion.subType,
                                      )}
                                    </EditableText>
                                  ) : (
                                    <span className="block">
                                      {renderQuestionTextInline(
                                        renderedQuestionText,
                                        item.sourceQuestion.subType,
                                      )}
                                    </span>
                                  )}
                                </p>
                              );
                            })()}
                          {(part.options.length > 0 || part.showObjectiveAnswer) && (
                            <div
                              className={cn(
                                "space-y-1",
                                part.showHeader ? "mt-1.5" : "mt-0",
                                compact ? "text-[10px]" : "text-[11px]",
                              )}
                            >
                              {part.options.map(({ option, originalIndex }) => {
                                const useReferenceLabel = shouldUseGrammarOptionReference(
                                  item.sourceQuestion.subType,
                                );
                                const optionDisplayText = optionDisplayTextForSubtype(
                                  item.sourceQuestion.subType,
                                  originalIndex,
                                  option.text,
                                );
                                const hasOptionDisplayText =
                                  optionDisplayText.trim().length > 0;
                                const optionFormattedInlineOptions =
                                  item.sourceQuestion.subType === "SENTENCE_INSERT"
                                    ? {
                                        alphabetMarkerClassName:
                                          "font-semibold text-slate-950",
                                      }
                                    : undefined;

                                return (
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
                                      {optionOrdinalLabel(originalIndex)}
                                    </span>
                                    {useReferenceLabel && hasOptionDisplayText ? (
                                      <span className="flex-1 font-semibold">
                                        {optionDisplayText}
                                      </span>
                                    ) : !hasOptionDisplayText ? null : (
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
                                        readOnly={readOnly || item.locked}
                                      >
                                        {renderFormattedInline(
                                          optionDisplayText,
                                          item.sourceQuestion.subType,
                                          optionFormattedInlineOptions,
                                        )}
                                      </EditableText>
                                    )}
                                  </div>
                                );
                              })}
                              {part.showObjectiveAnswer &&
                                showAnswerSpace &&
                                item.objectiveAnswerSlots > 0 &&
                                item.options.length > 0 &&
                                Array.from({
                                  length: Math.max(
                                    1,
                                    Math.min(10, item.objectiveAnswerSlots),
                                  ),
                                }).map((_, slotIndex) => {
                                  const optionIndex = item.options.length + slotIndex;
                                  const objectiveAnswerTexts = item.objectiveAnswerTexts || [];

                                  return (
                                    <div
                                      key={`${item.localId}-objective-option-${slotIndex}`}
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
                                        {optionOrdinalLabel(optionIndex)}
                                      </span>
                                      <EditableText
                                        value={objectiveAnswerTexts[slotIndex] || ""}
                                        onCommit={(nextText) => {
                                          const nextTexts = Array.from(
                                            {
                                              length: Math.max(
                                                1,
                                                Math.min(10, item.objectiveAnswerSlots),
                                              ),
                                            },
                                            (_, index) => objectiveAnswerTexts[index] || "",
                                          );
                                          nextTexts[slotIndex] = nextText;
                                          onUpdateItem(item.localId, {
                                            objectiveAnswerTexts: nextTexts,
                                          });
                                        }}
                                        className="flex-1"
                                        placeholder="추가 선지 입력"
                                        readOnly={readOnly || item.locked}
                                      >
                                        {renderFormattedInline(
                                          objectiveAnswerTexts[slotIndex] || "",
                                          item.sourceQuestion.subType,
                                        )}
                                      </EditableText>
                                    </div>
                                  );
                                })}
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
                            </>
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
