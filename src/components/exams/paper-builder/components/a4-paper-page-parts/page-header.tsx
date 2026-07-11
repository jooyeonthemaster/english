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
  // 공유 QR 자기등록(E4) — enrollEnabled 시 빌더가 생성한 QR data URI. 있으면 첫
  // 페이지 헤더 우측 정보 컬럼 옆에 64×64 QR + "응시 QR" 캡션을 인쇄 포함으로 표시.
  // null/미지정이면 기존과 완전히 동일(무회귀).
  examEnrollQrDataUrl?: string | null;
  onHeaderChange: (patch: HeaderPatch) => void;
  readOnly?: boolean;
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
  examEnrollQrDataUrl,
  onHeaderChange,
  readOnly = false,
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
                  readOnly={readOnly}
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
                readOnly={readOnly}
              >
                {title}
              </EditableText>
            </h2>
          </div>
        </div>
        {(() => {
          const infoColumn = (
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
          );
          // QR 없으면 기존 정보 컬럼을 그대로 반환(무회귀). 있으면 정보 컬럼 옆에
          // 64×64 QR + "응시 QR" 캡션을 붙인다(no-print 아님 — 인쇄에 포함).
          if (!examEnrollQrDataUrl) return infoColumn;
          return (
            <div className="flex shrink-0 items-start gap-2">
              <div className="flex shrink-0 flex-col items-center">
                <NextImage
                  src={examEnrollQrDataUrl}
                  alt="응시 QR"
                  width={64}
                  height={64}
                  unoptimized
                  className="h-16 w-16 rounded-sm border border-slate-200 bg-white object-contain"
                />
                <span className="mt-0.5 text-[8px] font-semibold tracking-tight text-slate-500">
                  응시 QR
                </span>
              </div>
              {infoColumn}
            </div>
          );
        })()}
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
            readOnly={readOnly}
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
  readOnly?: boolean;
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
  readOnly = false,
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
        readOnly={readOnly}
      >
        {title}
      </EditableText>
      <span>
        {pageIndex + 1} / {pageCount}
      </span>
    </header>
  );
}
