interface UsageSparklineProps {
  // dailyConsumption is sparse — only days with consumption.
  data: Array<{ day: string; total: number }>;
  width?: number;
  height?: number;
  className?: string;
}

const WINDOW_DAYS = 30;

// Keys are local-day "YYYY-MM-DD" strings. Server query is grouped in
// Asia/Seoul timezone so client-side keys (also local components) line up
// without UTC drift across the date line.
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildDenseSeries(
  data: Array<{ day: string; total: number }>,
): Array<{ day: string; total: number }> {
  const map = new Map(data.map((d) => [d.day, d.total]));
  const out: Array<{ day: string; total: number }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    out.push({ day: key, total: map.get(key) ?? 0 });
  }
  return out;
}

export function UsageSparkline({
  data,
  width = 320,
  height = 56,
  className,
}: UsageSparklineProps) {
  const series = buildDenseSeries(data);
  const max = Math.max(1, ...series.map((s) => s.total));
  const total30d = series.reduce((sum, s) => sum + s.total, 0);

  // Geometry — viewBox-based scaling, parent decides actual width via className
  const padX = 2;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;

  const points = series.map((s, i) => {
    const x = padX + stepX * i;
    const y = padY + innerH - (s.total / max) * innerH;
    return { x, y, total: s.total, day: s.day };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padY + innerH} L ${padX} ${padY + innerH} Z`;

  if (total30d === 0) {
    return (
      <div
        className={`flex items-center justify-center text-[11px] text-gray-300 h-14 ${className ?? ""}`}
        aria-label="최근 30일 사용 내역 없음"
      >
        최근 30일 사용 내역 없음
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`최근 30일 일별 크레딧 사용량 추이. 총 ${total30d.toLocaleString("ko-KR")} 크레딧.`}
    >
      <defs>
        <linearGradient id="sparkline-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkline-fill)" />
      <path
        d={linePath}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        // vector-effect keeps stroke crisp under preserveAspectRatio="none"
        vectorEffect="non-scaling-stroke"
      />
      {points.length > 0 && points[points.length - 1].total > 0 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="2"
          fill="#3b82f6"
        />
      )}
    </svg>
  );
}
