"use client";

// recharts 기반 차트 모음 — 모든 데이터 포인트는 클릭 시 연결 지문 드로어를 연다.
// 마크 규격: 막대 ≤22px·데이터 끝 4px 라운드·세그먼트 사이 2px 서피스 갭(흰 stroke),
// 그리드 헤어라인, 텍스트는 슬레이트 토큰(계열색 텍스트 금지).

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  LabelList,
  Cell,
} from "recharts";
import type { LitTrends } from "./types";
import { GENRE_COLORS, GENRE_ORDER } from "./types";

const AXIS_TICK = { fontSize: 11, fill: "#64748b" } as const;
const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
} as const;

// 범례 텍스트는 계열색이 아니라 텍스트 토큰을 입는다(색은 스와치가 담당).
const legendText = (value: string) => (
  <span style={{ color: "#475569" }}>{value}</span>
);

type OpenFn = (title: string, ids: string[]) => void;

// ── 1. 체제 변천: 연도 × 갈래 구성 (수능·평가원) ─────────────
export function RegimeChart({
  data,
  eras,
  onOpen,
}: {
  data: LitTrends["regimeYears"];
  eras: LitTrends["eras"];
  onOpen: OpenFn;
}) {
  const rows = data.map((y) => ({
    year: y.year,
    ...y.counts,
    __ids: y.ids,
  }));
  type Row = (typeof rows)[number];
  const handle = (genre: string) => (entry: unknown) => {
    const row = (entry as { payload?: Row })?.payload;
    const ids = row?.__ids?.[genre] ?? [];
    if (row && ids.length > 0)
      onOpen(`${row.year}학년도 수능·평가원 ${genre} 지문`, ids);
  };
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" strokeWidth={1} />
          {eras.map((e, i) => (
            <ReferenceArea
              key={e.label}
              x1={e.from}
              x2={e.to}
              fill={i % 2 === 0 ? "#f8fafc" : "#ffffff"}
              fillOpacity={1}
              label={{
                value: e.label,
                position: "insideTop",
                fontSize: 10.5,
                fill: "#94a3b8",
                fontWeight: 700,
              }}
            />
          ))}
          <XAxis
            dataKey="year"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <YAxis
            allowDecimals={false}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11.5 }}
            iconType="rect"
            iconSize={9}
            formatter={legendText}
          />
          {GENRE_ORDER.map((g, i) => (
            <Bar
              key={g}
              dataKey={g}
              stackId="a"
              fill={GENRE_COLORS[g]}
              stroke="#ffffff"
              strokeWidth={2}
              barSize={22}
              radius={i === GENRE_ORDER.length - 1 ? [4, 4, 0, 0] : 0}
              onClick={handle(g)}
              cursor="pointer"
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 3a. 작가 랭킹 (수능·평가원 강조 + 학평 맥락) ─────────────
export function AuthorsChart({
  data,
  selected,
  onSelect,
}: {
  data: LitTrends["authors"];
  selected: string | null;
  onSelect: (author: string) => void;
}) {
  const rows = data.map((a) => ({
    author: a.author,
    "수능·평가원": a.kice,
    "교육청 학평": a.ebsi,
  }));
  type Row = (typeof rows)[number];
  const handle = (entry: unknown) => {
    const row = (entry as { payload?: Row })?.payload;
    if (row) onSelect(row.author);
  };
  return (
    <div className="h-[420px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 28, left: 8, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="#f1f5f9" strokeWidth={1} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <YAxis
            type="category"
            dataKey="author"
            width={64}
            tick={{ ...AXIS_TICK, fontSize: 11.5 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11.5 }}
            iconType="rect"
            iconSize={9}
            formatter={legendText}
          />
          <Bar
            dataKey="수능·평가원"
            stackId="a"
            fill="#2563eb"
            stroke="#ffffff"
            strokeWidth={2}
            barSize={16}
            onClick={handle}
            cursor="pointer"
          >
            {rows.map((r) => (
              <Cell
                key={r.author}
                fillOpacity={selected && selected !== r.author ? 0.35 : 1}
              />
            ))}
          </Bar>
          <Bar
            dataKey="교육청 학평"
            stackId="a"
            fill="#cbd5e1"
            stroke="#ffffff"
            strokeWidth={2}
            barSize={16}
            radius={[0, 4, 4, 0]}
            onClick={handle}
            cursor="pointer"
          >
            {rows.map((r) => (
              <Cell
                key={r.author}
                fillOpacity={selected && selected !== r.author ? 0.35 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 3b. 현대소설 발표 연대 분포 ─────────────────────────────
export function DecadesChart({
  data,
  selected,
  onSelect,
}: {
  data: LitTrends["decades"];
  selected: string | null;
  onSelect: (decade: string) => void;
}) {
  type Row = (typeof data)[number];
  const handle = (entry: unknown) => {
    const row = (entry as { payload?: Row })?.payload;
    if (row) onSelect(row.decade);
  };
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" strokeWidth={1} />
          <XAxis
            dataKey="decade"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <YAxis
            allowDecimals={false}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
            formatter={(v) => [`${v}편`, "출제 작품"]}
          />
          <Bar
            dataKey="count"
            fill={GENRE_COLORS["현대소설"]}
            barSize={22}
            radius={[4, 4, 0, 0]}
            onClick={handle}
            cursor="pointer"
          >
            <LabelList
              dataKey="count"
              position="top"
              style={{ fontSize: 11, fill: "#475569", fontWeight: 700 }}
            />
            {data.map((r) => (
              <Cell
                key={r.decade}
                fillOpacity={selected && selected !== r.decade ? 0.35 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 4. 발췌 편집 장치 사용률 ────────────────────────────────
export function DevicesChart({
  data,
  onOpen,
}: {
  data: LitTrends["devices"];
  onOpen: OpenFn;
}) {
  const METRICS: { key: "front" | "midBox" | "plainCut" | "twoBlock"; label: string }[] = [
    { key: "front", label: "[앞부분의 줄거리]" },
    { key: "midBox", label: "[중략 부분의 줄거리]" },
    { key: "plainCut", label: "무표 (중략)" },
    { key: "twoBlock", label: "두 토막 구조(중략 계열)" },
  ];
  const rows = METRICS.map((m) => {
    const row: Record<string, unknown> = { metric: m.label, __key: m.key };
    for (const d of data) {
      row[d.genre] = Math.round(((d[m.key] as number) / d.n) * 100);
    }
    return row;
  });
  const handle = (genre: string) => (entry: unknown) => {
    const row = (entry as { payload?: { metric?: string; __key?: string } })
      ?.payload;
    const d = data.find((x) => x.genre === genre);
    if (!row?.__key || !d) return;
    const ids = d[`${row.__key}Ids` as "frontIds"] as string[];
    if (ids.length > 0) onOpen(`${genre} — ${row.metric} 사용 지문`, ids);
  };
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" strokeWidth={1} />
          <XAxis
            dataKey="metric"
            tick={{ ...AXIS_TICK, fontSize: 10.5 }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            interval={0}
          />
          <YAxis
            unit="%"
            domain={[0, 100]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
            formatter={(v) => `${v}%`}
          />
          <Legend
            wrapperStyle={{ fontSize: 11.5 }}
            iconType="rect"
            iconSize={9}
            formatter={legendText}
          />
          {data.map((d) => (
            <Bar
              key={d.genre}
              dataKey={d.genre}
              fill={GENRE_COLORS[d.genre]}
              barSize={18}
              radius={[4, 4, 0, 0]}
              onClick={handle(d.genre)}
              cursor="pointer"
            >
              <LabelList
                dataKey={d.genre}
                position="top"
                formatter={(v: unknown) => `${v}%`}
                style={{ fontSize: 10.5, fill: "#475569", fontWeight: 700 }}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 5. 갈래복합 결합 공식 ───────────────────────────────────
export function CombosChart({
  data,
  onOpen,
}: {
  data: LitTrends["combos"];
  onOpen: OpenFn;
}) {
  type Row = (typeof data)[number];
  const handle = (entry: unknown) => {
    const row = (entry as { payload?: Row })?.payload;
    if (row && row.ids.length > 0)
      onOpen(`갈래복합 — ${row.label}`, row.ids);
  };
  return (
    <div className="w-full" style={{ height: data.length * 34 + 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 34, left: 8, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="#f1f5f9" strokeWidth={1} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={172}
            tick={{ ...AXIS_TICK, fontSize: 11.5 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
            formatter={(v) => [`${v}세트`, "출제"]}
          />
          <Bar
            dataKey="count"
            barSize={16}
            radius={[0, 4, 4, 0]}
            onClick={handle}
            cursor="pointer"
          >
            <LabelList
              dataKey="count"
              position="right"
              style={{ fontSize: 11, fill: "#475569", fontWeight: 700 }}
            />
            {data.map((r) => (
              <Cell
                key={r.label}
                fill={
                  r.label === "구성 표기 없음"
                    ? "#cbd5e1"
                    : GENRE_COLORS["갈래복합"]
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
