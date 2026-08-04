"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 공용 시각 부품 (칩·도트·순수 CSS 차트)
//
// 차트 라이브러리 금지(리포 규약) — 전부 div 바다. 숫자는 tabular-nums.
// 색 규약(스튜디오 전면 공용 — 여기 말고 다른 곳에 재정의 금지):
//   티어  basic slate / core blue / academic violet / advanced rose
//   추세  급증·신규 rose / 증가 amber / 안정 slate / 감소·급감 sky
//   시행처 수능 slate-900 / 모평 slate-500 / 학평 slate-300
// ============================================================================

import { VOCAB_POS_LABELS, VOCAB_TIER_LABELS } from "@/lib/vocab-drill/display";

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ko-KR").format(n);
}

export function fmt1(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n >= 100 ? String(Math.round(n)) : n.toFixed(n >= 10 ? 1 : 2);
}

export function posKo(pos: string): string {
  return VOCAB_POS_LABELS[pos] ?? pos;
}

export function tierKo(tier: string): string {
  return VOCAB_TIER_LABELS[tier] ?? tier;
}

// ── 칩 ───────────────────────────────────────────────────────────────────────

const TIER_CHIP: Record<string, string> = {
  basic: "bg-slate-100 text-slate-600",
  core: "bg-blue-50 text-blue-700",
  academic: "bg-violet-50 text-violet-700",
  advanced: "bg-rose-50 text-rose-700",
};

export function TierChip({ tier }: { tier: string }) {
  return (
    <span
      className={`inline-flex h-[18px] items-center rounded px-1.5 text-[10.5px] font-semibold leading-none whitespace-nowrap ${TIER_CHIP[tier] ?? "bg-slate-100 text-slate-600"}`}
    >
      {tierKo(tier)}
    </span>
  );
}

export function PosChip({ pos }: { pos: string }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded border border-slate-200 px-1.5 text-[10.5px] font-medium leading-none text-slate-500 whitespace-nowrap">
      {posKo(pos)}
    </span>
  );
}

const TREND_CHIP: Record<string, string> = {
  급증: "bg-rose-50 text-rose-700",
  "신규 등장": "bg-rose-50 text-rose-600",
  증가: "bg-amber-50 text-amber-700",
  안정: "bg-slate-100 text-slate-500",
  감소: "bg-sky-50 text-sky-700",
  급감: "bg-sky-50 text-sky-600",
  "중간기만 등장": "bg-slate-100 text-slate-500",
  미등장: "bg-slate-100 text-slate-400",
};

export function TrendChip({
  label,
  ratio,
}: {
  label: string | null;
  ratio?: number | null;
}) {
  if (!label) return <span className="text-[11px] text-slate-300">—</span>;
  return (
    <span
      className={`inline-flex h-[18px] items-center gap-1 rounded px-1.5 text-[10.5px] font-semibold leading-none whitespace-nowrap ${TREND_CHIP[label] ?? "bg-slate-100 text-slate-500"}`}
      title={
        typeof ratio === "number" && Number.isFinite(ratio)
          ? `예전보다 ${ratio.toFixed(2)}배`
          : undefined
      }
    >
      {label}
    </span>
  );
}

// ── 도트·바 ──────────────────────────────────────────────────────────────────

/** 난이도 1~5 — 채운 도트 n개. */
export function DiffDots({ n }: { n: number }) {
  return (
    <span
      className="inline-flex items-center gap-[3px]"
      title={`난이도 ${n}/5`}
      aria-label={`난이도 ${n}/5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`size-[5px] rounded-full ${i <= n ? (n >= 4 ? "bg-rose-400" : "bg-slate-500") : "bg-slate-200"}`}
        />
      ))}
    </span>
  );
}

/** 인라인 수평 바 — 셀 안 빈도 표현. sqrt 스케일로 롱테일을 살린다. */
export function MiniBar({
  value,
  max,
  className = "bg-blue-500",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  // 0·결측은 빈 바로 — 최소 2% 채움을 주면 "—" 옆에서 값처럼 읽힌다(YearBars 규약).
  const pct =
    max > 0 && value > 0
      ? Math.max(2, Math.round(Math.sqrt(value / max) * 100))
      : 0;
  return (
    <span className="inline-block h-[5px] w-14 overflow-hidden rounded-full bg-slate-100 align-middle">
      <span
        className={`block h-full rounded-full ${className}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** 수직 연도 바 차트 — hover 시 연도·수치 title. 값 0 도 자리(1px)를 지킨다. */
export function YearBars({
  data,
  from,
  to,
  accent = "bg-blue-500",
  height = 56,
  unit = "회",
}: {
  data: Record<string, number>;
  from: number;
  to: number;
  accent?: string;
  height?: number;
  unit?: string;
}) {
  const years: number[] = [];
  for (let y = from; y <= to; y++) years.push(y);
  const max = Math.max(1, ...years.map((y) => data[String(y)] ?? 0));
  return (
    <div>
      <div className="flex items-end gap-px" style={{ height }}>
        {years.map((y) => {
          const v = data[String(y)] ?? 0;
          const h = v > 0 ? Math.max(3, Math.round((v / max) * height)) : 1;
          return (
            <div
              key={y}
              className="group relative flex-1 rounded-t-[1px] hover:opacity-70"
              title={`${y}년 ${fmt(v)}${unit}`}
            >
              <div
                className={`${v > 0 ? accent : "bg-slate-200"} w-full rounded-t-[1px]`}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-400">
        <span>{from}</span>
        <span>{Math.round((from + to) / 2)}</span>
        <span>{to}</span>
      </div>
    </div>
  );
}

/** 분할 수평 바 — 시행처·학년 구성비. 합 0이면 회색 바탕만. */
export function SegBar({
  parts,
  height = 6,
}: {
  parts: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-full bg-slate-100"
        style={{ height }}
      >
        {total > 0 &&
          parts.map(
            (p) =>
              p.value > 0 && (
                <div
                  key={p.label}
                  className={p.color}
                  style={{ width: `${(p.value / total) * 100}%` }}
                  title={`${p.label} ${fmt(p.value)} (${Math.round((p.value / total) * 100)}%)`}
                />
              ),
          )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
        {parts.map((p) => (
          <span
            key={p.label}
            className="inline-flex items-center gap-1 text-[10.5px] tabular-nums text-slate-500"
          >
            <span className={`size-1.5 rounded-full ${p.color}`} />
            {p.label} {fmt(p.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 라벨 수평 바 목록 — 유형 친화도·분포 대시보드. */
export function HBarList({
  items,
  accent = "bg-blue-500",
  maxItems = 6,
}: {
  items: { label: string; value: number }[];
  accent?: string;
  maxItems?: number;
}) {
  const shown = items.slice(0, maxItems);
  const max = Math.max(1, ...shown.map((i) => i.value));
  return (
    <div className="space-y-1">
      {shown.map((i) => (
        <div key={i.label} className="flex items-center gap-2">
          <span className="w-[72px] shrink-0 truncate text-[11px] text-slate-500">
            {i.label}
          </span>
          <span className="h-[7px] min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className={`block h-full rounded-full ${accent}`}
              style={{ width: `${Math.max(2, Math.round((i.value / max) * 100))}%` }}
            />
          </span>
          <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-slate-600">
            {fmt(i.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 섹션 제목 — 도시에·레일 공용(끝선 정렬을 위해 마진 통일). */
export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <h3 className="text-[11px] font-bold tracking-wide text-slate-500">
        {children}
      </h3>
      {hint ? (
        <span className="truncate text-[10px] text-slate-400">{hint}</span>
      ) : null}
    </div>
  );
}
