// 대시보드 「어제 대비」 증감 배지.
// D1 순매출(결제일 gross − 환불일 환불)은 음수가 될 수 있다(실측: 2026-06-10 KST −19,800).
// 감독 확정 표기 규약(spec §9.2 D1 각주):
//  ① 증감률 분모는 항상 Math.abs(previous) — 부호를 그대로 쓰면 개선이 하락으로 뒤집힌다.
//  ② 부호가 다른 전이(음수↔양수)는 % 대신 「이전 ₩-19,800」 절대값 표기(kpi-card.tsx S3 와 같은 방식).
//  ③ previous === 0 이고 current < 0 이면 초록 「신규」가 아니다.

import { TrendingDown, TrendingUp } from "lucide-react";

export type DeltaResult =
  /** 어제도 오늘도 0 */
  | { kind: "zero" }
  /** 어제 0 → 오늘 증가 */
  | { kind: "new" }
  /** 어제와 같음 */
  | { kind: "same" }
  /** 증감률(분모 = |어제|) */
  | { kind: "pct"; pct: number; up: boolean }
  /** %가 무의미한 전이 — 이전 값을 그대로 보여준다 */
  | { kind: "absolute"; previous: number; up: boolean };

/** 순수 함수 — 프로브(scripts)에서 그대로 검증한다. */
export function computeDelta(today: number, yesterday: number): DeltaResult {
  if (yesterday === 0) {
    if (today === 0) return { kind: "zero" };
    if (today < 0) return { kind: "absolute", previous: 0, up: false };
    return { kind: "new" };
  }
  // 부호가 다른 전이: 비율이 의미를 잃는다(−19,800 → +19,800 은 「200% 하락」이 아니다)
  if ((today < 0) !== (yesterday < 0)) {
    return { kind: "absolute", previous: yesterday, up: today > yesterday };
  }
  const pct = Math.round(((today - yesterday) / Math.abs(yesterday)) * 100);
  if (pct === 0) return { kind: "same" };
  return { kind: "pct", pct, up: pct > 0 };
}

export function DeltaBadge({
  today,
  yesterday,
  format,
}: {
  today: number;
  yesterday: number;
  /** 「이전 …」 표기에 쓸 포맷터(매출이면 formatCurrency, 개수면 formatNumber) */
  format: (n: number) => string;
}) {
  const d = computeDelta(today, yesterday);

  if (d.kind === "zero")
    return <span className="text-[12px] text-gray-300">어제 0</span>;
  if (d.kind === "same")
    return <span className="text-[12px] text-gray-400">어제와 같음</span>;
  if (d.kind === "new")
    return (
      <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-emerald-600">
        <TrendingUp className="size-3.5" strokeWidth={2} aria-hidden />
        신규
      </span>
    );

  const up = d.up;
  const text = d.kind === "pct" ? `${Math.abs(d.pct)}%` : `이전 ${format(d.previous)}`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[12px] font-semibold ${
        up ? "text-emerald-600" : "text-rose-500"
      }`}
    >
      {up ? (
        <TrendingUp className="size-3.5" strokeWidth={2} aria-hidden />
      ) : (
        <TrendingDown className="size-3.5" strokeWidth={2} aria-hidden />
      )}
      {text}
    </span>
  );
}
