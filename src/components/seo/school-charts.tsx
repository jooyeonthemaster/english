import type { SchoolChart } from "@/lib/seo/schools-content";

/**
 * 학교 페이지 차트 — 인라인 SVG 서버 렌더.
 *
 * 외부 차트 라이브러리를 쓰지 않는 이유:
 *  1) 서버 컴포넌트로 렌더되어 크롤러가 숫자를 그대로 읽는다(JS 실행 불필요).
 *  2) 번들이 늘지 않아 LCP·CLS 를 건드리지 않는다.
 *  3) SVG <text> 안의 수치가 색인되므로 「평택고 영어 서술형 배점」 같은 질의에 본문이 대응된다.
 *
 * 접근성: 각 차트에 <figcaption> 과 시각적으로 숨긴 데이터 표를 함께 낸다.
 * 표는 스크린리더용이자 크롤러용 폴백이다.
 */

/**
 * 브랜드 블루(--primary #3B82F6) 중심의 단색 램프.
 * 무지개 팔레트를 쓰지 않는 이유: 색이 의미를 갖지 않는데 색만 튀면 브랜드가 흐려진다.
 * 명도로 항목을 구분하고, 강조가 필요한 첫 항목만 가장 진한 브랜드 블루를 쓴다.
 */
const PALETTE = [
  "#2563EB", // blue-600 — 브랜드 채움색(헤더 bg-blue-600 과 동일)
  "#1E3A8A", // blue-900
  "#60A5FA", // blue-400
  "#3730A3", // indigo-800
  "#0EA5E9", // sky-500
  "#93C5FD", // blue-300
  "#1E40AF", // blue-800
  "#A5B4FC", // indigo-300
];

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 스크린리더·크롤러용 데이터 표(시각적으로 숨김). */
function DataTable({ chart }: { chart: SchoolChart }) {
  return (
    <table className="sr-only">
      <caption>{chart.title}</caption>
      <thead>
        <tr>
          <th scope="col">항목</th>
          <th scope="col">{chart.unit ?? "값"}</th>
        </tr>
      </thead>
      <tbody>
        {chart.series.map((s) => (
          <tr key={s.label}>
            <th scope="row">{s.label}</th>
            <td>
              {fmt(s.value)}
              {chart.unit ?? ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 가로 막대 — 항목 라벨이 길어도 안 깨진다(한국어 학교/과목명 대응). */
function BarChart({ chart }: { chart: SchoolChart }) {
  const max = Math.max(...chart.series.map((s) => s.value), 1);
  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {chart.series.map((s, i) => {
        const pct = (s.value / max) * 100;
        return (
          <div key={s.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(140px,240px)_1fr_auto]">
            <span className="truncate text-[13px] font-semibold text-slate-700" title={s.label}>
              {s.label}
            </span>
            <span className="order-3 col-span-2 h-2.5 overflow-hidden rounded-full bg-slate-200 sm:order-none sm:col-span-1 sm:h-3.5">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
              />
            </span>
            <span className="justify-self-end whitespace-nowrap text-[13px] font-black tabular-nums text-slate-900">
              {fmt(s.value)}
              <span className="ml-0.5 text-[11px] font-bold text-slate-500">{chart.unit}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 누적 막대 — 배점 구성(선택형/서술형/수행) 같은 100% 분해에 쓴다. */
function StackedBar({ chart }: { chart: SchoolChart }) {
  const total = chart.series.reduce((n, s) => n + s.value, 0) || 1;
  return (
    <div className="mt-4">
      <div className="flex h-9 w-full overflow-hidden rounded-lg border border-slate-200">
        {chart.series.map((s, i) => (
          <div
            key={s.label}
            className="flex items-center justify-center text-[11px] font-black text-white"
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
            title={`${s.label} ${fmt(s.value)}${chart.unit ?? ""}`}
          >
            {(s.value / total) * 100 >= 9 ? `${fmt(s.value)}${chart.unit ?? ""}` : ""}
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {chart.series.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-700">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
            />
            {s.label}
            <span className="font-black tabular-nums text-slate-900">
              {fmt(s.value)}
              {chart.unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 도넛 — 출제 원천 비중 등. SVG stroke-dasharray 로 그린다. */
function DonutChart({ chart }: { chart: SchoolChart }) {
  const total = chart.series.reduce((n, s) => n + s.value, 0) || 1;
  const R = 56;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
      <svg viewBox="0 0 140 140" className="size-36 shrink-0 -rotate-90" role="img" aria-label={chart.title}>
        {chart.series.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * C;
          const el = (
            <circle
              key={s.label}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth="20"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <ul className="flex w-full flex-col gap-2">
        {chart.series.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0">
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-slate-700">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="whitespace-nowrap text-[13px] font-black tabular-nums text-slate-900">
              {fmt(s.value)}
              <span className="ml-0.5 text-[11px] font-bold text-slate-500">{chart.unit}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 꺾은선 — 연도별 추이 등. */
function LineChart({ chart }: { chart: SchoolChart }) {
  const vals = chart.series.map((s) => s.value);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const W = 520;
  const H = 150;
  const pad = 24;
  const step = chart.series.length > 1 ? (W - pad * 2) / (chart.series.length - 1) : 0;
  const pts = chart.series.map((s, i) => {
    const x = pad + i * step;
    const y = H - pad - ((s.value - min) / span) * (H - pad * 2);
    return { x, y, ...s };
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="min-w-[420px]" role="img" aria-label={chart.title}>
        <path d={d} fill="none" stroke={PALETTE[0]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke={PALETTE[0]} strokeWidth="2.5" />
            <text x={p.x} y={p.y - 10} textAnchor="middle" className="fill-slate-900 text-[11px] font-black">
              {fmt(p.value)}
            </text>
            <text x={p.x} y={H + 14} textAnchor="middle" className="fill-slate-500 text-[10.5px] font-bold">
              {p.label.length > 8 ? `${p.label.slice(0, 8)}…` : p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function SchoolChartBlock({ chart }: { chart: SchoolChart }) {
  const cited = (chart.basis ?? "").includes("공시");
  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.45)] sm:p-6">
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="break-keep text-[15px] font-extrabold leading-snug tracking-tight text-slate-900">{chart.title}</h3>
        {chart.basis ? (
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10.5px] font-black ${
              cited
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-slate-100 text-slate-500"
            }`}
          >
            {cited ? "학교 공시" : "관행 추정"}
          </span>
        ) : null}
      </figcaption>

      {chart.kind === "donut" ? (
        <DonutChart chart={chart} />
      ) : chart.kind === "stacked" ? (
        <StackedBar chart={chart} />
      ) : chart.kind === "line" ? (
        <LineChart chart={chart} />
      ) : (
        <BarChart chart={chart} />
      )}

      {chart.basis ? (
        <p className="mt-3 break-keep border-t border-slate-100 pt-2.5 text-[11.5px] font-semibold leading-relaxed text-slate-500">
          근거 · {chart.basis}
        </p>
      ) : null}

      <DataTable chart={chart} />
    </figure>
  );
}
