import * as React from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

import { PAPER_SIZE_SPECS, PREVIEW_PAGE_WIDTH, SUBTYPE_LABELS } from "../constants";
import {
  formatInlineMarkersForSubtype,
  formatSentenceInsertPassageMarkers,
  optionDisplayLabel,
  optionDisplayTextForSubtype,
  optionOrdinalLabel,
  shouldRenderOptionListForSubtype,
  shouldUseGrammarOptionReference,
} from "../option-display";
import {
  joinRenderedLinesForDisplay,
  resolvePaperItemPassageTitle,
  renderFormattedInline,
  renderQuestionTextInline,
} from "../paper-item-utils";
import {
  isFlowStructuredSubtype,
  isStructuredAtomicSubtype,
  questionStemAndBody,
  recombineQuestionText,
} from "../question-body-layout";
import { questionHasEmbeddedPassage } from "../passage-policy";
import { TEMPLATE_VISUALS } from "../templates";
import {
  BLOCK_PX_PER_PT,
  LINE_GAP_MARKER,
  LINE_GAP_MAX_PX,
  isLineGapItem,
} from "../types";
import type {
  Density,
  DropPlacement,
  HeaderPatch,
  PaperItem,
  PaperPage,
  PaperSize,
  PaperTemplate,
  PassageStyle,
  RenderFragment,
  StructRow,
  StructRowStyle,
} from "../types";
import { EditableText } from "./editable-text";
import { ExamExplanationBlock } from "./exam-explanation-block";
import {
  ContinuedHeader,
  PageHeader,
} from "./a4-paper-page-parts/page-header";
import { PaperItemActions } from "./a4-paper-page-parts/paper-item-actions";
import { usePaperItemDrag } from "./a4-paper-page-parts/use-paper-item-drag";

// 워드프로세서식 빈 줄(line-gap) 여백 하나만 들어있는 fragment 인지 — space-y 간격 처리에 사용.
function isLineGapFragmentNode(fragment: RenderFragment | undefined): boolean {
  return (
    !!fragment &&
    fragment.parts.length === 1 &&
    !!fragment.parts[0]?.source &&
    isLineGapItem(fragment.parts[0].source)
  );
}

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

// 문항 발문/본문 단락의 정렬. 기본(left)은 기존처럼 양끝맞춤(text-justify)을 유지하고,
// 가운데/오른쪽을 고르면 그 정렬로 바꾼다(블록 서식 툴바의 정렬과 연동).
function questionAlignClass(item: PaperItem) {
  if (item.blockAlign === "center") return "text-center";
  if (item.blockAlign === "right") return "text-right";
  return "text-justify";
}

// 숫자 pt 글자 크기가 지정된 블록만 인라인 px 스타일을 준다(미지정이면 null → 기존
// sm/md/lg 클래스/상속 유지로 기존 시험지 화면이 그대로). pt → 미리보기 px 로 환산.
function blockFontStyle(item: PaperItem, lineHeight: number): React.CSSProperties | undefined {
  if (item.blockFontPt == null) return undefined;
  return {
    fontSize: `${(item.blockFontPt * BLOCK_PX_PER_PT).toFixed(2)}px`,
    lineHeight,
  };
}

// \uC904 \uB2E8\uC704\uB85C \uD758\uB7EC\uC628 \uAD6C\uC870\uD654 \uBCF8\uBB38(structRows)\uC744 \uBC15\uC2A4/\uB2E8\uB77D\uC73C\uB85C \uC7AC\uAD6C\uC131\uD55C\uB2E4.
// \uBC15\uC2A4\uAC00 \uCE78 \uACBD\uACC4\uC5D0\uC11C \uCABC\uAC1C\uC9C0\uBA74 (\uC774\uC5B4\uC11C) / (\uB2E4\uC74C \uCE78\uC73C\uB85C \uC774\uC5B4\uC9D0 \u2192) \uB9C8\uCEE4\uB85C \uC5F0\uACB0\uD55C\uB2E4.
function StructuredBody({
  rows,
  subType,
  compact,
  withTopGap,
  visualQuestionClass,
  visualPassageTitleClass,
  passageBoxClass,
  passageTitle,
  showPassageTitle,
  readOnly,
  onPassageTitleCommit,
}: {
  rows: StructRow[];
  subType: string | null;
  compact: boolean;
  withTopGap: boolean;
  visualQuestionClass: string;
  visualPassageTitleClass: string;
  passageBoxClass: string;
  passageTitle: string;
  showPassageTitle: boolean;
  readOnly: boolean;
  onPassageTitleCommit: (next: string) => void;
}) {
  if (rows.length === 0) return null;

  const groups: {
    segIndex: number;
    style: StructRowStyle;
    paraLabel?: string;
    rows: StructRow[];
  }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.segIndex === row.segIndex) last.rows.push(row);
    else {
      groups.push({
        segIndex: row.segIndex,
        style: row.style,
        paraLabel: row.paraLabel,
        rows: [row],
      });
    }
  }

  // 박스 본문 줄높이를 평문 본문(questionLineHeight 1.46)과 통일 — compact 모드에서
  // 박스(1.52)만 줄 간격이 넓던 불일치 해소. pagination.boxLineHeight 와 1:1 동기.
  const leading = compact ? "leading-[1.46]" : "leading-[1.58]";

  return (
    <div className={cn("space-y-2", withTopGap && "mt-1", visualQuestionClass)}>
      {groups.map((group, groupIndex) => {
        const text = joinRenderedLinesForDisplay(group.rows.map((row) => row.line));
        const resumed = !group.rows[0].isSegStart;
        const continues = !group.rows[group.rows.length - 1].isSegEnd;

        if (group.style === "arrow") {
          return (
            <div
              key={groupIndex}
              className="text-center text-[12px] font-bold leading-none text-slate-500"
            >
              {"\u2193"}
            </div>
          );
        }

        if (group.style === "passage" || group.style === "summary" || group.style === "given") {
          const isSourcePassage = group.style === "passage";
          const isSummaryWriting = subType === "SUMMARY_WRITING";
          const isTopicSentenceWriting = subType === "TOPIC_SENTENCE_WRITING";
          // 영작형(요약문 영작·주제문 영작): 보조 박스 회색 톤 + 라벨 굵게 분리를 공유한다.
          const isWritingType = isSummaryWriting || isTopicSentenceWriting;
          // 영작형 보조 박스(해석/보기/앞글자 · 주제 힌트/보기/배열 단어)는 회색 슬레이트 톤.
          // [요약문]/[주제문] 박스는 본문 가독성을 위해 본문 색을 유지한다.
          const isSwSecondaryBox = isWritingType && group.style === "given";
          // 수능 표준: 지문·요약·주어진문장 박스 본문은 일반체(라벨·마커만 강조).
          // 출처 지문 박스와 동일 weight 로 통일 — 임베드/출처 유형 간 볼드 불일치 해소.
          const boxTone = "font-normal";
          // 영작형은 [해석]/[보기]/[앞글자]·[주제 힌트]/[배열 단어] 라벨이 본문 앞에 포함돼
          // 있으므로 SUMMARY_COMPLETE 처럼 별도 헤더를 덧붙이지 않고, 라벨만 굵게 분리한다.
          // (주제문 영작의 [주제 힌트]/[배열 단어] 는 길이가 8자를 넘으므로 라벨 폭을 넓힌다.)
          const swLabelMatch =
            isWritingType && !resumed
              ? text.match(/^(\[[^\]\n]{1,12}\])\s*([\s\S]*)$/)
              : null;
          const swLabel = swLabelMatch ? swLabelMatch[1] : "";
          const swBody = swLabelMatch ? swLabelMatch[2] : text;
          const isSwFirstLetterBox = isSummaryWriting && /^\[앞글자\]/.test(text);
          return (
            <div
              key={groupIndex}
              className={cn(
                "whitespace-pre-line text-justify",
                isSwSecondaryBox ? "text-slate-600" : "text-slate-950",
                leading,
                "py-1",
                boxTone,
                // 출처 지문 박스만 passageStyle 테두리 적용(요약/주어진문장 제외).
                isSourcePassage && passageBoxClass,
                // 요약문 영작의 [앞글자] 단서 줄은 작게.
                isSwFirstLetterBox && "text-[10px]",
              )}
            >
              {resumed && (
                <span className="continuation-hint mb-1 block text-[9px] italic text-slate-400">
                  {"(\uC774\uC5B4\uC11C)"}
                </span>
              )}
              {isSourcePassage && showPassageTitle && passageTitle && !resumed && (
                <span
                  className={cn(
                    "mb-1 block text-[10px] font-black uppercase tracking-wide",
                    visualPassageTitleClass,
                  )}
                >
                  <EditableText
                    value={passageTitle}
                    onCommit={onPassageTitleCommit}
                    readOnly={readOnly}
                  >
                    {passageTitle}
                  </EditableText>
                </span>
              )}
              {group.style === "given" && !isWritingType && !resumed && (
                <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  주어진 문장
                </span>
              )}
              {group.style === "summary" && subType === "SUMMARY_COMPLETE" && !resumed && (
                <span className="font-bold">{"[\uC694\uC57D\uBB38] "}</span>
              )}
              {swLabel && (
                <span className="font-bold text-slate-700">{`${swLabel} `}</span>
              )}
              {renderFormattedInline(isWritingType ? swBody : text, subType, {
                alphabetMarkerClassName: "font-semibold text-slate-950",
              })}
              {continues && (
                <span className="continuation-hint mt-1 block text-[9px] italic text-slate-400">
                  {"(\uB2E4\uC74C \uCE78\uC73C\uB85C \uC774\uC5B4\uC9D0 \u2192)"}
                </span>
              )}
            </div>
          );
        }

        if (group.style === "para") {
          return (
            <p key={groupIndex} className={cn("whitespace-pre-line text-justify", leading)}>
              {!resumed && group.paraLabel && (
                <span className="mr-1.5 font-black text-slate-950">{group.paraLabel}</span>
              )}
              {renderFormattedInline(text, subType, {
                alphabetMarkerClassName: "font-semibold text-slate-950",
              })}
            </p>
          );
        }

        return (
          <p key={groupIndex} className="whitespace-pre-line text-justify">
            {renderFormattedInline(text, subType)}
          </p>
        );
      })}
    </div>
  );
}

function CustomPaperBlock({
  item,
  readOnly,
  onUpdateItem,
  maxImageHeightPx,
}: {
  item: PaperItem;
  readOnly: boolean;
  onUpdateItem: (localId: string, patch: Partial<PaperItem>) => void;
  maxImageHeightPx?: number;
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
          className={cn(
            "block text-slate-900",
            item.blockBold ? "font-black" : "font-normal",
            item.blockItalic && "italic",
            blockAlignClass(item),
          )}
          style={blockFontStyle(item, 1.4)}
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
          item.blockFontPt == null && blockTextSizeClass(item),
          item.blockBold && "font-bold",
          item.blockItalic && "italic",
          blockAlignClass(item),
        )}
        style={blockFontStyle(item, 1.6)}
        placeholder="안내 문구를 입력하세요."
        readOnly={disabled}
      >
        {item.blockText}
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
    // 워드프로세서식 빈 줄: 점선 박스 없이 순수 여백만 차지한다(아래 내용이 그대로 밀려남).
    // 일반 여백(8~160)과 달리 한 줄씩 자라므로 더 큰 상한까지 그대로 그린다.
    if (item.blockText === LINE_GAP_MARKER) {
      const height = Math.max(8, Math.min(LINE_GAP_MAX_PX, item.spacerHeight || 32));
      return <div aria-hidden style={{ height }} />;
    }
    const spacerHeight = Math.max(8, Math.min(160, item.spacerHeight || 32));
    return (
      <div
        className={cn(
          "rounded border border-dashed border-slate-200 bg-slate-50/60 print:border-transparent print:bg-transparent",
          item.locked && "opacity-70",
        )}
        style={{ height: spacerHeight }}
      />
    );
  }

  if (item.blockType === "image") {
    return (
      <ImageBlock
        item={item}
        disabled={disabled}
        onUpdateItem={onUpdateItem}
        maxHeightPx={maxImageHeightPx}
      />
    );
  }

  return null;
}

function ImageBlock({
  item,
  disabled,
  onUpdateItem,
  maxHeightPx,
}: {
  item: PaperItem;
  disabled: boolean;
  onUpdateItem: (localId: string, patch: Partial<PaperItem>) => void;
  maxHeightPx?: number;
}) {
  const figureRef = React.useRef<HTMLElement>(null);
  const widthPct = Math.max(20, Math.min(100, item.imageWidth || 70));

  const handleResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const figure = figureRef.current;
    if (!figure) return;
    const figureWidth = figure.clientWidth;
    if (figureWidth <= 0) return;
    const startX = event.clientX;
    const startPct = widthPct;

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaPct = ((moveEvent.clientX - startX) / figureWidth) * 100;
      const next = Math.max(20, Math.min(100, Math.round(startPct + deltaPct)));
      onUpdateItem(item.localId, { imageWidth: next });
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <figure ref={figureRef} className={cn(blockAlignClass(item))}>
      {item.imageDataUrl ? (
        <span
          className="relative inline-block align-top"
          style={{ width: `${widthPct}%`, maxWidth: "100%" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageDataUrl}
            alt={item.imageAlt || ""}
            className="block w-full rounded border border-slate-200 object-contain"
            // 아주 긴 이미지는 페이지 내용 높이로 제한해 여백/페이지를 넘지 않게 한다
            // (object-contain 이라 종횡비 유지하며 축소; 폭을 줄여 들어오면 자동으로 원래대로).
            style={maxHeightPx ? { maxHeight: `${maxHeightPx}px` } : undefined}
          />
          {!disabled && (
            <button
              type="button"
              title="이미지 폭 조절 (드래그)"
              aria-label="이미지 폭 조절"
              onPointerDown={handleResizeStart}
              onClick={(event) => event.stopPropagation()}
              className="no-print absolute right-0 top-1/2 z-10 flex h-8 w-3 -translate-y-1/2 translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border border-slate-300 bg-white/95 opacity-0 shadow-sm transition-opacity hover:border-blue-300 group-hover/paper-item:opacity-100 group-focus-within/paper-item:opacity-100"
            >
              <span className="h-4 w-0.5 rounded-full bg-slate-400" />
            </button>
          )}
        </span>
      ) : (
        <div className="flex h-28 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-[10px] font-bold text-slate-400">
          이미지 없음
        </div>
      )}
    </figure>
  );
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
  // 워드프로세서식 빈 줄 캐럿 — 문제 사이 간격 클릭 위치(afterLocalId = 캐럿 위 항목 localId).
  lineCaret: { afterLocalId: string | null } | null;
  setLineCaret: (caret: { afterLocalId: string | null } | null) => void;
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
  showAnswerSpace,
  showPassageTitle,
  showQuestionMeta,
  passageStyle,
  pageColumns,
  activeItemId,
  setActiveItemId,
  lineCaret,
  setLineCaret,
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
  // 한 페이지(칸) 내용 영역 높이(미리보기 모델 px) — 이보다 큰 이미지는 이 높이로 축소해
  // 페이지/여백을 넘지 않게 한다(pagination.pageMetrics 의 후속쪽 capacity 와 동일 산식).
  const _pageWidthModel = Math.round(PREVIEW_PAGE_WIDTH * paperSpec.widthRatio);
  const _pageHeightModel = _pageWidthModel * paperSpec.heightRatio;
  const maxImageHeightPx = Math.max(
    120,
    _pageHeightModel - (compact ? 48 : 56) - 24 - 24 - 20,
  );
  void overflowItemIds;

  // 지문 박스 테두리: passageStyle 설정을 실제 border-width 로 배선(기본 plain=선 없음).
  // pagination 추정이 이미 boxed/underlined 의 chrome 높이를 가정하므로 정합 개선.
  const passageBoxClass =
    passageStyle === "boxed"
      ? cn("rounded-md border px-3", visual.passageClass)
      : passageStyle === "underlined"
        ? cn("border-b", visual.passageClass)
        : "";

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
        "exam-a4-page relative w-full shadow-xl ring-1",
        // 편집 화면에서는 블록 제어 툴바(왼쪽 여백)가 페이지 밖 캔버스로 넘어가도 잘리지
        // 않도록 overflow 를 허용한다. 읽기전용/인쇄/썸네일은 깔끔하게 클립(overflow-hidden).
        readOnly ? "overflow-hidden" : "overflow-visible",
        visual.pageClass,
      )}
      style={{
        aspectRatio: `${paperSpec.widthMm} / ${paperSpec.heightMm}`,
        // 시험지 미리보기 글꼴을 다운로드(DOCX/HWPX)와 "Noto Sans KR" 로 통일한다.
        // 미리보기(브라우저)·Word·한글이 같은 글꼴을 쓰면 줄바꿈·페이지넘김이 일치한다.
        fontFamily: '"Malgun Gothic Exam", "Malgun Gothic", "맑은 고딕", sans-serif',
      }}
      data-paper-size={paperSize}
    >
      <div
        className={cn(
          "relative flex h-full flex-col",
          // 전체 여백 축소(5차): 좌우는 줄넘김 안정성을 위해 소폭만, 상하는 더 적극적으로.
          // comfortable px-[34px] py-[28px], compact px-[28px] py-[24px].
          // 좌우 변경은 pagination.ts(horizontalPadding)·HWPX/DOCX 빌더와 함께 바꿔 미리보기↔출력 일치 유지.
          compact ? "px-[28px] py-[24px]" : "px-[34px] py-[28px]",
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
              {columnFragments.map((fragment, fragmentIndex) => {
                // Tailwind v4 의 space-y-4 는 16px 간격을 각 자식의 margin-BOTTOM 에 넣는다
                // (margin-top 이 아님). 워드프로세서식 빈 줄(line-gap) 위에는 간격이 없어야
                // 하므로(페이지네이션 gap=0 과 일치), "바로 다음 형제가 빈 줄"인 fragment 의
                // margin-bottom 을 0으로 없앤다. 빈 줄→문항 경계는 기본 16px 를 유지(GROUP_GAP).
                const nextIsLineGap = isLineGapFragmentNode(
                  columnFragments[fragmentIndex + 1],
                );
                return (
                <div
                  key={fragment.id}
                  className="min-w-0"
                  style={nextIsLineGap ? { marginBottom: 0 } : undefined}
                >
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
                            "mb-3 py-1",
                            // passageStyle 테두리(boxed/underlined). plain=선 없음.
                            passageBoxClass,
                          )}
                        >
                          {fragment.setPrompt && isPassageStart && (
                            <p
                              className={cn(
                                "mb-1 font-semibold",
                                visual.questionClass,
                              )}
                            >
                              {fragment.setPrompt}
                            </p>
                          )}
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
                                "continuation-hint mb-1 text-[9px] italic",
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
                            <EditableText
                              value={fragment.passageContent}
                              onCommit={(next) =>
                                onUpdateGroupPassage(fragment.groupSourceId, {
                                  passageContent: next,
                                })
                              }
                              className="block"
                              readOnly={readOnly}
                              // 지문이 칸/쪽 경계에서 쪼개진 경우(isSplit): 평소엔 이 칸 조각만
                              // 서식 그대로 보이다가, 클릭하면 지문 전체로 펼쳐 통째로 편집한다.
                              editingChildren={
                                isSplit
                                  ? renderFormattedInline(
                                      formatSentenceInsertPassageMarkers(
                                        fragment.passageContent,
                                        fragment.usesSentenceInsertMarkers
                                          ? "SENTENCE_INSERT"
                                          : null,
                                      ),
                                    )
                                  : undefined
                              }
                            >
                              {renderFormattedInline(renderedText)}
                            </EditableText>
                          </p>
                          {isSplit && !isPassageEnd && (
                            <p
                              className={cn(
                                "continuation-hint mt-1 text-[9px] italic text-slate-400",
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
                    {fragment.parts.map((part, partIdx, partsArr) => {
                      const item = part.source;
                      const isCustomBlock = item.blockType !== "question";
                      // 워드프로세서식 빈 줄(line-gap) 여백은 선택 테두리·드래그 손잡이 없이
                      // 순수 여백으로만 보이게 한다(블록처럼 보이지 않도록).
                      const isLineGapSpacer =
                        item.blockType === "spacer" &&
                        item.blockText === LINE_GAP_MARKER;
                      // 이 part 가 해당 항목의 (이 칸에서) 마지막 조각이면 아래에 빈 줄
                      // 캐럿 영역을 단다 — 쪼개진 문항의 중간 조각엔 달지 않는다.
                      const isLastPartOfItem =
                        partIdx === partsArr.length - 1 ||
                        partsArr[partIdx + 1].source.localId !== item.localId;
                      const gapCaretActive =
                        lineCaret?.afterLocalId === item.localId;
                      const isDropTarget =
                        dragOverPartKey === part.partKey ||
                        (!dragOverPartKey &&
                          part.isStart &&
                          dragOverItemId === item.localId);
                      const subType = item.sourceQuestion.subType;
                      // 지시문(stem)은 번호 옆에 항상 통째로 렌더하고, 본문(body)은
                      // 그 아래에 둔다. 추정 줄 수로 stem 을 쪼개지 않아 잘림/인위적
                      // 줄바꿈을 방지한다.
                      const { stem: questionStem, body: questionBody } = isCustomBlock
                        ? { stem: "", body: "" }
                        : questionStemAndBody(item);
                      const usesStructuredBody =
                        !isCustomBlock && isFlowStructuredSubtype(subType);
                      const isAtomicStructuredQuestion =
                        !isCustomBlock && isStructuredAtomicSubtype(subType);
                      const renderOptionList =
                        !isCustomBlock && shouldRenderOptionListForSubtype(subType);
                      const inlinePassageTitle = !isCustomBlock
                        ? resolvePaperItemPassageTitle(item)
                        : "";
                      const showBodyPassageTitle =
                        !isCustomBlock &&
                        !usesStructuredBody &&
                        part.showHeader &&
                        !fragment.includePassage &&
                        showPassageTitle &&
                        Boolean(inlinePassageTitle) &&
                        questionHasEmbeddedPassage({
                          ...item.sourceQuestion,
                          questionText:
                            item.questionText || item.sourceQuestion.questionText,
                          passage: {
                            content:
                              item.passageContent ||
                              item.sourceQuestion.passage?.content ||
                              "",
                          },
                        });
                      const bodyPassageTitleNode = showBodyPassageTitle ? (
                        <p
                          className={cn(
                            "mt-1 mb-0.5 text-[10px] font-black uppercase tracking-wide",
                            visual.passageTitleClass,
                          )}
                        >
                          <EditableText
                            value={inlinePassageTitle}
                            onCommit={(next) =>
                              onUpdateItem(item.localId, { passageTitle: next })
                            }
                            readOnly={readOnly || item.locked}
                          >
                            {inlinePassageTitle}
                          </EditableText>
                        </p>
                      ) : null;
                      // 지문이 문항 본문에 내장된 유형(무관한 문장·문장 삽입·어법 등)도
                      // 출처 지문 박스와 동일하게 "지문 스타일"(박스/밑줄/본문)을 따른다.
                      // (LOCAL이 isStructuredQuestion 을 usesStructuredBody/atomic 으로 분리 →
                      //  내장 지문 스타일은 flow-structured 가 아닌 평문 본문에만 적용)
                      return (
                        <div
                          key={part.partKey}
                          data-paper-item-id={item.localId}
                          data-paper-part-key={part.partKey}
                          onClick={() => {
                            if (!readOnly && !isLineGapSpacer)
                              setActiveItemId(item.localId);
                          }}
                          onMouseDownCapture={() => {
                            if (!readOnly && !isLineGapSpacer)
                              setActiveItemId(item.localId);
                          }}
                          onFocusCapture={() => {
                            if (!readOnly && !isLineGapSpacer)
                              setActiveItemId(item.localId);
                          }}
                          style={{
                            breakBefore:
                              part.isStart && item.breakBefore === "page"
                                ? "page"
                                : part.isStart && item.breakBefore === "column"
                                  ? "column"
                                  : undefined,
                            breakInside:
                              item.keepWithPrev || usesStructuredBody
                                ? "avoid"
                                : undefined,
                            // 문항 블록의 숫자 pt 크기 — 발문·본문·선택지가 상속한다(미지정 시
                            // 페이지 공통 크기 유지). 페이지네이션(resolveItemFontPx)과 1:1.
                            ...(!isCustomBlock && item.blockFontPt != null
                              ? {
                                  fontSize: `${(item.blockFontPt * BLOCK_PX_PER_PT).toFixed(2)}px`,
                                  lineHeight: compact ? 1.46 : 1.58,
                                }
                              : {}),
                          }}
                          className={cn(
                            "group/paper-item relative rounded-md transition-colors",
                            (item.keepWithPrev || usesStructuredBody) &&
                              "break-inside-avoid",
                            // 문항 블록 서식(굵게/기울임/정렬) — 발문·본문·선택지에 전파.
                            !isCustomBlock && item.blockBold && "font-bold",
                            !isCustomBlock && item.blockItalic && "italic",
                            !isCustomBlock && item.blockAlign === "center" && "text-center",
                            !isCustomBlock && item.blockAlign === "right" && "text-right",
                            item.locked && "cursor-default",
                            visual.itemClass,
                            !readOnly &&
                              !isLineGapSpacer &&
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
                            // line-gap 빈 줄은 패딩 0 — 한 줄 높이만 정확히 차지하도록
                            // (페이지네이션 추정도 패딩 없이 spacerHeight 만 계산).
                            isLineGapSpacer ? "py-0" : isCustomBlock ? "py-1" : "py-0.5",
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
                          {part.isStart && !readOnly && !item.locked && isCustomBlock && !isLineGapSpacer && (
                            <div
                              className={cn(
                                // 블록 왼쪽 여백에 세로(위→아래)로 띄워 블록 내용을 가리지 않게 한다.
                                // 모바일(<lg)에선 숨김 — 하단 컨텍스트 바(MobileBlockActionBar)가 대신한다.
                                "no-print pointer-events-none absolute left-0 top-0 -translate-x-full -ml-0.5 z-20 hidden flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white/95 p-1 opacity-0 shadow-lg backdrop-blur transition-opacity group-hover/paper-item:pointer-events-auto group-hover/paper-item:opacity-100 group-focus-within/paper-item:pointer-events-auto group-focus-within/paper-item:opacity-100 lg:flex",
                                activeItemId === item.localId && "pointer-events-auto opacity-100",
                              )}
                            >
                              <button
                                type="button"
                                title="블록 드래그"
                                aria-label="블록 드래그"
                                onPointerDown={(event) => startDrag(event, item.localId)}
                                className="flex h-5 w-5 touch-none cursor-grab items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700 active:cursor-grabbing"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRemoveItem(item.localId);
                                }}
                                className="flex h-5 w-5 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50"
                                title="블록 삭제"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          {isCustomBlock && part.showCustomBlock && (
                            <CustomPaperBlock
                              item={item}
                              readOnly={readOnly}
                              onUpdateItem={onUpdateItem}
                              maxImageHeightPx={maxImageHeightPx}
                            />
                          )}
                          {isCustomBlock && part.showCustomBlock && item.locked && (
                            <span className="no-print absolute right-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[8px] font-bold text-white">
                              LOCK
                            </span>
                          )}
                          {!isCustomBlock && (
                            <>
                          {bodyPassageTitleNode}
                          {part.showHeader && (
                            <p
                              className={cn(
                                "mb-1 whitespace-pre-line font-semibold",
                                questionAlignClass(item),
                                visual.questionClass,
                              )}
                            >
                              <span
                                className={cn(
                                  "mr-1.5 font-black",
                                  compact ? "text-[12px]" : "text-[13px]",
                                  visual.numberClass,
                                )}
                              >
                                {item.orderNum}.
                              </span>
                              {showQuestionMeta && (
                                <span
                                  className={cn(
                                    "mr-1.5 align-baseline text-[9px] font-semibold",
                                    visual.metaClass,
                                  )}
                                >
                                  [{item.points}점
                                  {subType && SUBTYPE_LABELS[subType]
                                    ? ` · ${SUBTYPE_LABELS[subType]}`
                                    : ""}
                                  ]
                                </span>
                              )}
                              {questionStem ? (
                                <EditableText
                                  value={questionStem}
                                  onCommit={(next) =>
                                    onUpdateItem(item.localId, {
                                      questionText: recombineQuestionText(
                                        next,
                                        questionBody,
                                      ),
                                    })
                                  }
                                  // 구조화 유형은 questionText 에 [요약문] 등 본문이
                                  // 함께 들어있어, 지시문만 재결합하면 본문이 사라진다.
                                  // 따라서 지시문 인라인 편집은 평문 유형에서만 허용.
                                  readOnly={readOnly || item.locked || isAtomicStructuredQuestion}
                                >
                                  {renderQuestionTextInline(questionStem, subType)}
                                </EditableText>
                              ) : null}
                            </p>
                          )}
                          {part.isContinuation &&
                            (part.structRows.length > 0 ||
                              part.questionRenderedLines.length > 0 ||
                              part.options.length > 0 ||
                              part.showObjectiveAnswer ||
                              part.showAnswer) && (
                            <p
                              className={cn(
                                "continuation-hint mb-1 text-[9px] font-semibold italic",
                                visual.metaClass,
                              )}
                            >
                              ({item.orderNum}번 계속)
                            </p>
                          )}
                          {(() => {
                            // 구조화 유형: 지시문은 헤더에서 이미 렌더했고, 본문(지문/요약/
                            // given 박스·↓·순서 단락)은 줄 단위로 흘러온 structRows 를
                            // 박스로 재구성한다 — 칸 경계에서 깔끔하게 이어진다.
                            if (usesStructuredBody) {
                              return (
                                <StructuredBody
                                  rows={part.structRows}
                                  subType={subType}
                                  compact={compact}
                                  withTopGap={part.showHeader}
                                  visualQuestionClass={visual.questionClass}
                                  visualPassageTitleClass={visual.passageTitleClass}
                                  passageBoxClass={passageBoxClass}
                                  passageTitle={resolvePaperItemPassageTitle(item)}
                                  showPassageTitle={showPassageTitle}
                                  readOnly={readOnly || item.locked}
                                  onPassageTitleCommit={(next) =>
                                    onUpdateItem(item.localId, { passageTitle: next })
                                  }
                                />
                              );
                            }

                            // 평문 유형: 본문(삽입 지문 등). 한 칸에 모두 들어가면 통째로
                            // 렌더(편집 가능), 칸을 넘어가면 이 part 에 배치된 줄만 잇는다.
                            const startsAtBeginning = part.questionStartLineIndex === 0;
                            const endsHere =
                              part.questionStartLineIndex +
                                part.questionRenderedLines.length >=
                              part.questionTotalLines;
                            const bodyIsWhole =
                              part.isStart && startsAtBeginning && endsHere;

                            if (bodyIsWhole) {
                              if (!questionBody.trim()) return null;
                              return (
                                <>
                                  <p
                                    className={cn(
                                      "mt-1 whitespace-pre-line",
                                      questionAlignClass(item),
                                      visual.questionClass,
                                    )}
                                  >
                                    <EditableText
                                      value={questionBody}
                                      onCommit={(next) =>
                                        onUpdateItem(item.localId, {
                                          questionText: recombineQuestionText(
                                            questionStem,
                                            next,
                                          ),
                                        })
                                      }
                                      className="block"
                                      readOnly={readOnly || item.locked}
                                    >
                                      {renderQuestionTextInline(
                                        formatInlineMarkersForSubtype(questionBody, subType),
                                        subType,
                                      )}
                                    </EditableText>
                                  </p>
                                </>
                              );
                            }

                            if (part.questionRenderedLines.length === 0) return null;
                            return (
                              <>
                                <p
                                  className={cn(
                                    "mt-1 whitespace-pre-line text-justify",
                                    visual.questionClass,
                                  )}
                                >
                                  {/* 칸/쪽 경계에서 쪼개진 본문 조각. 평소엔 이 칸 조각만 서식
                                      그대로 보이다가, 클릭하면 본문 전체로 펼쳐 통째로 인라인
                                      편집한다(조각만 고치면 나머지가 날아가므로). blur 시 저장→재분할. */}
                                  <EditableText
                                    value={questionBody}
                                    onCommit={(next) =>
                                      onUpdateItem(item.localId, {
                                        questionText: recombineQuestionText(
                                          questionStem,
                                          next,
                                        ),
                                      })
                                    }
                                    readOnly={readOnly || item.locked}
                                    className="block"
                                    editingChildren={renderQuestionTextInline(
                                      formatInlineMarkersForSubtype(questionBody, subType),
                                      subType,
                                    )}
                                  >
                                    {renderQuestionTextInline(
                                      formatInlineMarkersForSubtype(
                                        joinRenderedLinesForDisplay(
                                          part.questionRenderedLines,
                                        ),
                                        subType,
                                      ),
                                      subType,
                                    )}
                                  </EditableText>
                                </p>
                              </>
                            );
                          })()}
                          {renderOptionList &&
                            (part.options.length > 0 || part.showObjectiveAnswer) && (
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
                                      {optionDisplayLabel(
                                        item.sourceQuestion.subType,
                                        originalIndex,
                                        option.label,
                                      )}
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
                          {part.showExplanation && (
                            <ExamExplanationBlock item={item} compact={compact} />
                          )}
                            </>
                          )}
                          {/* 워드프로세서식 빈 줄 — 항목 아래 경계의 얇은 클릭 영역.
                              클릭하면 캐럿이 놓이고, Enter 로 빈 줄(여백 블록)이 추가된다. */}
                          {!readOnly && isLastPartOfItem && (
                            <div
                              data-line-gap-anchor={item.localId}
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveItemId(null);
                                setLineCaret({ afterLocalId: item.localId });
                              }}
                              title="클릭 후 Enter로 빈 줄 추가 · Backspace로 제거"
                              className={cn(
                                "no-print group/linegap absolute inset-x-0 -bottom-2 z-10 flex h-4 cursor-text items-center",
                                draggingItemId && "pointer-events-none opacity-0",
                              )}
                            >
                              {gapCaretActive ? (
                                <>
                                  <span className="line-gap-caret absolute left-0 h-[15px] w-0.5 rounded-full bg-blue-500" />
                                  <span className="block h-px w-full bg-blue-300" />
                                </>
                              ) : (
                                <span className="block h-px w-full bg-transparent transition-colors group-hover/linegap:bg-blue-200" />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
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
