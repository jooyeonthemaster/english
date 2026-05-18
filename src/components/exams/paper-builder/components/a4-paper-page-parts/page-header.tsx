import NextImage from "next/image";
import { cn } from "@/lib/utils";

import { TEMPLATE_VISUALS } from "../../templates";
import type { HeaderPatch, PaperTemplate } from "../../types";
import { EditableText } from "../editable-text";

interface PageHeaderProps {
  compact: boolean;
  template: PaperTemplate;
  title: string;
  subtitle: string;
  instructions: string;
  studentNameLabel: string;
  academyLogoDataUrl: string | null;
  schoolName: string;
  className: string;
  examDate: string;
  onHeaderChange: (patch: HeaderPatch) => void;
}

/**
 * The first-page header block: academy logo, exam title/subtitle, student
 * info column, instructions row, and the exam date. Used only when
 * `pageIndex === 0`.
 */
export function PageHeader({
  compact,
  template,
  title,
  subtitle,
  instructions,
  studentNameLabel,
  academyLogoDataUrl,
  schoolName,
  className,
  examDate,
  onHeaderChange,
}: PageHeaderProps) {
  const visual = TEMPLATE_VISUALS[template];

  return (
    <header
      className={cn(
        "shrink-0",
        compact ? "mb-4" : "mb-5",
        visual.headerClass,
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-4 border-b pb-3",
          visual.headerLineClass,
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {academyLogoDataUrl && (
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border",
                visual.logoFrameClass,
              )}
            >
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
              <p
                className={cn(
                  "font-bold tracking-[0.18em]",
                  compact ? "text-[8px]" : "text-[9px]",
                  visual.subtitleClass,
                )}
              >
                <EditableText
                  value={subtitle}
                  onCommit={(next) => onHeaderChange({ subtitle: next })}
                >
                  {subtitle}
                </EditableText>
              </p>
            )}
            <h2
              className={cn(
                "mt-1 break-keep font-black tracking-tight",
                compact ? "text-[22px]" : "text-[28px]",
                visual.titleClass,
              )}
            >
              <EditableText
                value={title}
                onCommit={(next) => onHeaderChange({ title: next })}
                className="block"
              >
                {title}
              </EditableText>
            </h2>
          </div>
        </div>
        <div
          className={cn(
            "w-[168px] shrink-0 space-y-1 text-[10px]",
            visual.infoClass,
          )}
        >
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
      <div
        className={cn(
          "mt-2 flex items-center justify-between gap-3 text-[10px]",
          visual.instructionsClass,
        )}
      >
        <p className="min-w-0 flex-1 truncate">
          <EditableText
            value={instructions}
            onCommit={(next) => onHeaderChange({ instructions: next })}
            className="block truncate"
          >
            {instructions}
          </EditableText>
        </p>
        <span className="shrink-0">{examDate || ""}</span>
      </div>
    </header>
  );
}

interface ContinuedHeaderProps {
  pageIndex: number;
  pageCount: number;
  title: string;
  template: PaperTemplate;
  onHeaderChange: (patch: HeaderPatch) => void;
}

/**
 * The slim header used on pages 2..N — just the exam title (editable) and
 * the `N / M` page counter.
 */
export function ContinuedHeader({
  pageIndex,
  pageCount,
  title,
  template,
  onHeaderChange,
}: ContinuedHeaderProps) {
  const visual = TEMPLATE_VISUALS[template];
  return (
    <header
      className={cn(
        "mb-3 flex shrink-0 items-center justify-between border-b pb-2 text-[10px]",
        visual.continuedHeaderClass,
      )}
    >
      <EditableText
        value={title}
        onCommit={(next) => onHeaderChange({ title: next })}
      >
        {title}
      </EditableText>
      <span>
        {pageIndex + 1} / {pageCount}
      </span>
    </header>
  );
}
