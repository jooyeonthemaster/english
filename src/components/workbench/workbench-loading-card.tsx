"use client";

import type { ElementType, KeyboardEvent, ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";

type LoadingVariant = "pending" | "analyzing";

interface WorkbenchLoadingCardProps {
  title: string;
  contentPreview: string;
  statusLabel: string;
  progressLabel: string;
  wordCount?: number;
  selected?: boolean;
  showCheckbox?: boolean;
  onToggleSelect?: (shiftKey: boolean) => void;
  statusIcon?: ElementType;
  spinIcon?: boolean;
  variant?: LoadingVariant;
  planBadge?: ReactNode;
  rightActions?: ReactNode;
  metaSlot?: ReactNode;
  fixedHeight?: boolean;
  className?: string;
  ariaLabel?: string;
  role?: string;
  tabIndex?: number;
  /** 영역 드래그 선택 대상 식별자(DragSelect가 읽는 data-drag-item-id). */
  dataDragItemId?: string;
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function WorkbenchLoadingCard({
  title,
  contentPreview,
  statusLabel,
  progressLabel,
  wordCount,
  selected = false,
  showCheckbox = true,
  onToggleSelect,
  statusIcon: StatusIcon = Loader2,
  spinIcon = true,
  variant = "analyzing",
  planBadge,
  rightActions,
  metaSlot,
  fixedHeight = false,
  className = "",
  ariaLabel,
  role,
  tabIndex,
  dataDragItemId,
  onClick,
  onKeyDown,
}: WorkbenchLoadingCardProps) {
  const loadingClass =
    variant === "analyzing"
      ? "workbench-loading-card workbench-loading-card--analyzing"
      : "workbench-loading-card workbench-loading-card--pending";
  const progressClass =
    variant === "analyzing"
      ? "workbench-loading-progress--analyzing"
      : "workbench-loading-progress--pending";
  const statusColor = variant === "analyzing" ? "text-blue-600" : "text-slate-500";
  const shellColor =
    variant === "analyzing"
      ? "border-blue-200 bg-blue-50/60"
      : "border-slate-200 bg-slate-50";
  const shellSizing = fixedHeight ? "h-[340px] p-3 flex flex-col" : "p-4";

  return (
    <div
      className={`group relative rounded-xl border ${shellColor} ${loadingClass} ${shellSizing} transition-shadow duration-200 hover:shadow-md ${onClick ? "cursor-pointer" : ""} ${selected ? "ring-2 ring-blue-400" : ""} ${className}`}
      data-drag-item-id={dataDragItemId}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {showCheckbox && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleSelect?.(event.shiftKey);
              }}
              className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                selected
                  ? "bg-blue-600 text-white border border-blue-600"
                  : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400"
              }`}
            >
              <Check className="w-3 h-3" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-semibold text-slate-800 truncate">
              {title}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <StatusIcon
                className={`w-3 h-3 ${statusColor} ${spinIcon ? "animate-spin" : ""}`}
              />
              <span className={`text-[10px] font-medium ${statusColor}`}>
                {statusLabel}
              </span>
              <span className="ml-0.5 inline-flex items-center gap-0.5" aria-hidden="true">
                <span className="workbench-loading-dot h-1 w-1 rounded-full bg-blue-400" />
                <span className="workbench-loading-dot h-1 w-1 rounded-full bg-sky-400 [animation-delay:0.16s]" />
                <span className="workbench-loading-dot h-1 w-1 rounded-full bg-teal-400 [animation-delay:0.32s]" />
              </span>
              {planBadge}
              {typeof wordCount === "number" && (
                <span className="text-[10px] text-slate-400">
                  {wordCount} words
                </span>
              )}
            </div>
          </div>
        </div>

        {rightActions && (
          <div
            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(event) => event.stopPropagation()}
          >
            {rightActions}
          </div>
        )}
      </div>

      <p className={`text-[11px] text-slate-500 leading-relaxed ${fixedHeight ? "mt-2 line-clamp-5" : "mt-2.5 line-clamp-3"}`}>
        {contentPreview}
      </p>

      {metaSlot}

      <div className={fixedHeight ? "mt-auto pt-3" : "mt-3"}>
        <div className="h-1.5 bg-white/75 rounded-full overflow-hidden ring-1 ring-blue-100/80">
          <div className={`workbench-loading-progress h-full rounded-full ${progressClass}`} />
        </div>
        <p className="text-[10px] text-blue-500 mt-1.5 font-medium">
          {progressLabel}
        </p>
      </div>
    </div>
  );
}
