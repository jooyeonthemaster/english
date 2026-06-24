import { cn } from "@/lib/utils";

interface GridColsIconProps {
  /** Number of columns/rows to draw (n × n grid). */
  cols: number;
  className?: string;
  "aria-hidden"?: boolean;
}

/**
 * Renders an n×n grid icon (lucide-style outline) so the button reflects the
 * actual column count: 2열 → 2×2, 3열 → 3×3, etc. Lucide only ships Grid2x2 and
 * Grid3x3, so we draw the divider lines ourselves to support any column count.
 */
export function GridColsIcon({
  cols,
  className,
  "aria-hidden": ariaHidden,
}: GridColsIconProps) {
  const n = Math.max(1, Math.round(cols));
  const step = 18 / n;
  const lines = Array.from({ length: n - 1 }, (_, i) => 3 + step * (i + 1));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("lucide", className)}
      aria-hidden={ariaHidden}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      {lines.map((pos) => (
        <path key={`h${pos}`} d={`M3 ${pos}h18`} />
      ))}
      {lines.map((pos) => (
        <path key={`v${pos}`} d={`M${pos} 3v18`} />
      ))}
    </svg>
  );
}
