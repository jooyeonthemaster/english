import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

function iconStroke(size: LucideProps["size"], strokeWidth: LucideProps["strokeWidth"], absoluteStrokeWidth?: boolean) {
  if (!absoluteStrokeWidth || typeof size !== "number" || typeof strokeWidth !== "number") {
    return strokeWidth;
  }

  return (strokeWidth * 24) / size;
}

export const MaterialExtractionIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = "currentColor",
      size = 32,
      strokeWidth = 1.9,
      absoluteStrokeWidth,
      children,
      ...props
    },
    ref,
  ) => {
    const resolvedStrokeWidth = iconStroke(size, strokeWidth, absoluteStrokeWidth);

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        <path d="M5 18.5V5.3A1.3 1.3 0 0 1 6.3 4h9.4A1.3 1.3 0 0 1 17 5.3v1.6" />
        <path d="M5 18.5h2.4" />
        <rect x="7.4" y="6.9" width="11.6" height="14" rx="1.4" />
        <path d="M13.2 10.2v6.2" />
        <path d="m10.8 14.1 2.4 2.4 2.4-2.4" />
        {children}
      </svg>
    );
  },
) as LucideIcon;

MaterialExtractionIcon.displayName = "MaterialExtractionIcon";

export const PassageAnalysisIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = "currentColor",
      size = 32,
      strokeWidth = 1.9,
      absoluteStrokeWidth,
      children,
      ...props
    },
    ref,
  ) => {
    const resolvedStrokeWidth = iconStroke(size, strokeWidth, absoluteStrokeWidth);

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        <path d="M5.2 3.5h9.2L19 8.1V20a1.5 1.5 0 0 1-1.5 1.5H6.7A1.5 1.5 0 0 1 5.2 20V5A1.5 1.5 0 0 1 6.7 3.5Z" />
        <path d="M14.3 3.8v4.4h4.4" />
        <circle cx="10.5" cy="11.2" r="3.25" />
        <path d="m12.9 13.6 4.4 4.4" />
        {children}
      </svg>
    );
  },
) as LucideIcon;

PassageAnalysisIcon.displayName = "PassageAnalysisIcon";

export const QuestionGenerationIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = "currentColor",
      size = 32,
      strokeWidth = 1.9,
      absoluteStrokeWidth,
      children,
      ...props
    },
    ref,
  ) => {
    const resolvedStrokeWidth = iconStroke(size, strokeWidth, absoluteStrokeWidth);

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        <path d="M5.2 3.5h9.2L19 8.1V20a1.5 1.5 0 0 1-1.5 1.5H6.7A1.5 1.5 0 0 1 5.2 20V5A1.5 1.5 0 0 1 6.7 3.5Z" />
        <path d="M14.3 3.8v4.4h4.4" />
        <path d="M9.4 10.6c0-1.8 1.45-3.05 3.35-3.05 1.85 0 3.15 1.15 3.15 2.72 0 1.22-.72 1.88-1.73 2.44-1.08.6-1.45 1.1-1.45 2.13v.45" />
        <path d="M12.7 18h.01" />
        {children}
      </svg>
    );
  },
) as LucideIcon;

QuestionGenerationIcon.displayName = "QuestionGenerationIcon";

export const ExamPaperGenerationIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = "currentColor",
      size = 32,
      strokeWidth = 1.9,
      absoluteStrokeWidth,
      children,
      ...props
    },
    ref,
  ) => {
    const resolvedStrokeWidth = iconStroke(size, strokeWidth, absoluteStrokeWidth);

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        <path d="M5 18.5V5.3A1.3 1.3 0 0 1 6.3 4h9.4A1.3 1.3 0 0 1 17 5.3v1.6" />
        <path d="M5 18.5h2.4" />
        <rect x="7.4" y="6.9" width="11.6" height="14" rx="1.4" />
        <path d="M13.2 9.3v9.2" />
        <path d="M9.7 10h2" />
        <path d="M14.8 10h2" />
        <path d="M9.7 12.2h2" />
        <path d="M14.8 12.2h2" />
        <path d="M9.7 14.4h2" />
        <path d="M14.8 14.4h2" />
        <path d="M9.7 16.6h2" />
        <path d="M14.8 16.6h2" />
        {children}
      </svg>
    );
  },
) as LucideIcon;

ExamPaperGenerationIcon.displayName = "ExamPaperGenerationIcon";

export const ExtractionTaskListIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = "currentColor",
      size = 32,
      strokeWidth = 1.9,
      absoluteStrokeWidth,
      children,
      ...props
    },
    ref,
  ) => {
    const resolvedStrokeWidth = iconStroke(size, strokeWidth, absoluteStrokeWidth);

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        <path d="M5 18.5V5.3A1.3 1.3 0 0 1 6.3 4h9.4A1.3 1.3 0 0 1 17 5.3v1.6" />
        <path d="M5 18.5h2.4" />
        <rect x="7.4" y="6.9" width="11.6" height="14" rx="1.4" />
        <path d="M10.2 10.1h.01" />
        <path d="M12 10.1h4.4" />
        <path d="M10.2 13.9h.01" />
        <path d="M12 13.9h4.4" />
        <path d="M10.2 17.7h.01" />
        <path d="M12 17.7h3.2" />
        {children}
      </svg>
    );
  },
) as LucideIcon;

ExtractionTaskListIcon.displayName = "ExtractionTaskListIcon";

/**
 * 어법 훈련소 (v3 design §D5-1) — 출제 파이프라인 5번째 아이콘.
 * 문서 패밀리(접힌 모서리) + 밑줄 어법 판별 모티프(밑줄 친 어구 + 체크).
 */
export const GrammarStudioIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = "currentColor",
      size = 32,
      strokeWidth = 1.9,
      absoluteStrokeWidth,
      children,
      ...props
    },
    ref,
  ) => {
    const resolvedStrokeWidth = iconStroke(size, strokeWidth, absoluteStrokeWidth);

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        <path d="M5.2 3.5h9.2L19 8.1V20a1.5 1.5 0 0 1-1.5 1.5H6.7A1.5 1.5 0 0 1 5.2 20V5A1.5 1.5 0 0 1 6.7 3.5Z" />
        <path d="M14.3 3.8v4.4h4.4" />
        <path d="M8.7 11.3h6.8" />
        <path d="M8.7 14.3h3.6" />
        <path d="M8.7 16.4h3.6" />
        <path d="m14.3 16 1.4 1.4 2.5-2.9" />
        {children}
      </svg>
    );
  },
) as LucideIcon;

GrammarStudioIcon.displayName = "GrammarStudioIcon";
