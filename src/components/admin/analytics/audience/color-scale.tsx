// 방문 밀도 색 척도 — 히트맵·캘린더 공용(활동 모니터링 히트맵과 같은 블루 스케일).

export const EMPTY_CELL = "#F1F5F9";
const LOW = "#DBEAFE";
const HIGH = "#1D4ED8";

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function lerpHex(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, "0");
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}

/** 값 → 셀 색. 0 은 옅은 회색, 1 이상은 최소 가시도를 보장한 블루. */
export function densityColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return EMPTY_CELL;
  return lerpHex(LOW, HIGH, Math.sqrt(value / max));
}

/** 범례용 단계 색(0 포함 5칸) */
export const LEGEND_STEPS = [EMPTY_CELL, lerpHex(LOW, HIGH, 0), lerpHex(LOW, HIGH, 0.4), lerpHex(LOW, HIGH, 0.7), HIGH];

export function DensityLegend({ note }: { note?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-[11px] text-gray-400">적음</span>
      <span className="flex gap-[2px]" aria-hidden>
        {LEGEND_STEPS.map((c) => (
          <span key={c} className="size-2.5 rounded-[2px]" style={{ background: c }} />
        ))}
      </span>
      <span className="text-[11px] text-gray-400">많음</span>
      {note && <span className="text-[11px] tabular-nums text-gray-300">{note}</span>}
    </div>
  );
}
