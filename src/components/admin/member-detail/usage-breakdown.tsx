import { cn } from "@/lib/utils";

interface UsageBreakdownProps {
  data: Array<{
    operationType: string | null;
    label: string;
    totalAmount: number;
    count: number;
  }>;
}

// Distinct, palette-coherent colors (no orange/amber). Cycles for >5 items.
const PALETTE = [
  "#3b82f6", // blue-500
  "#1e293b", // slate-800
  "#10b981", // emerald-500
  "#6366f1", // indigo-500
  "#0ea5e9", // sky-500
  "#64748b", // slate-500
];

export function UsageBreakdown({ data }: UsageBreakdownProps) {
  const total = data.reduce((sum, d) => sum + d.totalAmount, 0);

  if (total === 0 || data.length === 0) {
    return (
      <div className="py-8 text-center text-[12px] text-gray-400">
        아직 사용 내역이 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stacked horizontal bar */}
      <div
        className="flex h-2 w-full rounded-full overflow-hidden bg-gray-100"
        role="img"
        aria-label="상품별 사용 비중"
      >
        {data.map((d, i) => {
          const pct = (d.totalAmount / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={d.operationType ?? `unknown-${i}`}
              style={{ width: `${pct}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
              title={`${d.label}: ${d.totalAmount.toLocaleString("ko-KR")}C (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend list */}
      <ul className="divide-y divide-gray-50">
        {data.map((d, i) => {
          const pct = total > 0 ? (d.totalAmount / total) * 100 : 0;
          return (
            <li
              key={d.operationType ?? `unknown-${i}`}
              className="flex items-center gap-3 py-2"
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 text-[12px] text-gray-700 truncate">
                {d.label}
              </span>
              <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
                {d.count.toLocaleString("ko-KR")}회
              </span>
              <span
                className={cn(
                  "text-[12px] tabular-nums shrink-0 w-16 text-right",
                  "text-gray-800 font-medium",
                )}
              >
                {d.totalAmount.toLocaleString("ko-KR")}C
              </span>
              <span className="text-[11px] text-gray-400 tabular-nums shrink-0 w-12 text-right">
                {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
