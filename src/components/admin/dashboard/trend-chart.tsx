import { formatCurrency } from "@/lib/utils";
import type { DashboardTrendPoint } from "@/actions/admin/dashboard";

/**
 * 최근 14일 매출 막대 + 신규 가입 꺾은선. 순수 SVG(툴팁은 <title>)라 서버 렌더.
 *
 * D1 순매출은 음수가 될 수 있다(환불이 결제 다음 날로 넘어간 날 — 실측 2026-06-10 KST −19,800).
 * 예전에는 음수일의 막대 높이가 0 이 돼 막대가 사라지는데 하단 합계에서는 그대로 빼서
 * 「막대 합보다 작은 합계」가 나왔다. 이제 음수일은 0선 아래 회색 막대로 그리고 합계에 근거를 적는다.
 */
export function TrendChart({ data }: { data: DashboardTrendPoint[] }) {
  const W = 640;
  const H = 180;
  const padX = 8;
  const padTop = 16;
  const padBottom = 30;
  const chartH = H - padTop - padBottom;
  const n = data.length;
  const slot = (W - padX * 2) / n;

  const maxRevenue = Math.max(1, ...data.map((d) => d.revenue));
  const maxSignups = Math.max(1, ...data.map((d) => d.signups));
  const baseY = padTop + chartH; // 0선
  const negativeDays = data.filter((d) => d.revenue < 0);
  const total = data.reduce((s, d) => s + d.revenue, 0);

  const barW = Math.max(6, slot * 0.5);

  const linePoints = data
    .map((d, i) => {
      const x = padX + slot * i + slot / 2;
      const y = padTop + chartH - (d.signups / maxSignups) * chartH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" />
          일 매출
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-0.5 bg-emerald-500" />
          신규 가입
        </span>
        {negativeDays.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-400" />
            환불이 결제보다 큰 날
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        preserveAspectRatio="none"
        role="img"
        aria-label="최근 14일 매출 및 가입 추이"
      >
        {data.map((d, i) => {
          const x = padX + slot * i + (slot - barW) / 2;
          const negative = d.revenue < 0;
          // 음수일은 0선 아래로 최소 2px — 높이 0 으로 사라지면 합계와 어긋난다
          const h = negative
            ? Math.max(2, Math.min(6, (Math.abs(d.revenue) / maxRevenue) * chartH))
            : (d.revenue / maxRevenue) * chartH;
          const y = negative ? baseY : baseY - h;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={negative ? h : Math.max(h, d.revenue > 0 ? 2 : 0)}
                rx={2}
                className={negative ? "fill-gray-400" : "fill-blue-500/85"}
              >
                <title>
                  {negative
                    ? `${d.date} 환불 ${formatCurrency(d.revenue)}`
                    : `${d.date} ${formatCurrency(d.revenue)}`}
                </title>
              </rect>
              {i % 2 === 0 && (
                <text
                  x={padX + slot * i + slot / 2}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-gray-400"
                  fontSize={9}
                >
                  {d.date}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={padX}
          x2={W - padX}
          y1={baseY}
          y2={baseY}
          className="stroke-gray-200"
          strokeWidth={1}
        />
        <polyline
          points={linePoints}
          fill="none"
          className="stroke-emerald-500"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((d, i) => {
          const x = padX + slot * i + slot / 2;
          const y = padTop + chartH - (d.signups / maxSignups) * chartH;
          return <circle key={d.date} cx={x} cy={y} r={2} className="fill-emerald-500" />;
        })}
      </svg>
      <div className="mt-1 text-right text-[11px] text-gray-400">
        14일 매출 합계 {formatCurrency(total)}
        <span className="ml-1 text-gray-300">· 환불 차감 포함</span>
      </div>
    </div>
  );
}
