import { formatCurrency } from "@/lib/utils";
import type { DashboardTrendPoint } from "@/actions/admin/dashboard";
import { DashboardDetailBlock } from "./dashboard-detail-block";

/**
 * 최근 14일 매출 막대 + 신규 가입 꺾은선. 그래프는 서버 렌더 SVG 이고, 위에 하루
 * 단위 투명 열을 겹쳐 호버=그날 상세 팝오버, 클릭=상세 팝업을 붙인다.
 */
export function TrendChart({ data }: { data: DashboardTrendPoint[] }) {
  const W = 640;
  const H = 180;
  const padX = 8;
  const padTop = 16;
  const padBottom = 22;
  const chartH = H - padTop - padBottom;
  const n = data.length;
  const slot = (W - padX * 2) / n;

  const maxRevenue = Math.max(1, ...data.map((d) => d.revenue));
  const maxSignups = Math.max(1, ...data.map((d) => d.signups));

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
      <div className="flex items-center gap-4 mb-2 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" />
          일 매출
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-0.5 bg-emerald-500" />
          신규 가입
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
          role="img"
          aria-label="최근 14일 매출 및 가입 추이"
        >
          {data.map((d, i) => {
            const x = padX + slot * i + (slot - barW) / 2;
            const h = (d.revenue / maxRevenue) * chartH;
            const y = padTop + chartH - h;
            return (
              <g key={d.date}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, d.revenue > 0 ? 2 : 0)}
                  rx={2}
                  className="fill-blue-500/85"
                />
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
            return (
              <circle
                key={d.date}
                cx={x}
                cy={y}
                r={2}
                className="fill-emerald-500"
              />
            );
          })}
        </svg>
        {/* 하루 단위 상호작용 열 — SVG 좌우 여백(padX)만큼 들여 막대 슬롯과 정렬 */}
        <div
          className="absolute inset-y-0 flex"
          style={{
            left: `${(padX / W) * 100}%`,
            right: `${(padX / W) * 100}%`,
          }}
        >
          {data.map((d) => (
            <DashboardDetailBlock
              key={d.dateKey}
              detailKey="trend-day"
              param={d.dateKey}
              label={`${d.date} 매출 ${formatCurrency(d.revenue)} · 가입 ${d.signups}`}
              side="top"
              className="h-full flex-1 rounded-md transition-colors hover:bg-blue-500/[0.07]"
            >
              <span className="sr-only">{d.date}</span>
            </DashboardDetailBlock>
          ))}
        </div>
      </div>
      <div className="mt-1 text-right text-[11px] text-gray-400">
        14일 매출 합계 {formatCurrency(data.reduce((s, d) => s + d.revenue, 0))}
      </div>
    </div>
  );
}
