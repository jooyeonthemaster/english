"use client";

// 가입 퍼널(§7) — 방문자 → 가입·로그인 화면 → 가입(유입 추적) → 결제, 유입 추적 커버리지 배지.
//
// 단계 간 비율 규칙(검수 U5-1):
//   ①② 는 「방문자(명)」, ③④ 는 「가입 학원(곳)」이라 모집단이 다르다.
//   ②→③ 은 단위도 모집단도 달라 비율을 내지 않는다(「집계 기준이 다릅니다」).
//   부분집합이 보장되는 쌍(①⊇②, 전체 가입⊇③, ③⊇④)만 비율을 표시한다.

import { ShieldCheck, ShieldAlert, Info } from "lucide-react";
import type { ConversionsReport } from "@/lib/analytics/reports/conversions";
import { fmtInt, fmtPct } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";

type Basis = "visitor" | "academy";

interface Step {
  key: string;
  label: string;
  hint: string;
  value: number;
  unit: string;
  color: string;
  basis: Basis;
  /** 부분집합이 보장되는 비교만 담는다. null 이면 비율을 내지 않는다. */
  compare: { label: string; value: number | null } | null;
  /** 잘린 힌트를 대신할 전문(title) */
  hintTitle?: string;
  /** 비율 대신/아래에 붙는 설명 */
  note: string | null;
  noteTitle?: string;
}

const MIXED_BASIS = "집계 기준이 다릅니다";

function rate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  if (part > whole) return null; // 부분집합이 아니면 비율로 말하지 않는다
  return Math.round((part / whole) * 1000) / 10;
}

export function CoverageBadge({ coverage, filtered = false }: { coverage: ConversionsReport["coverage"]; filtered?: boolean }) {
  const low = coverage.signups > 0 && coverage.pct < 50;
  const Icon = low ? ShieldAlert : ShieldCheck;
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold tabular-nums whitespace-nowrap",
        filtered
          ? "border-gray-200 bg-gray-50 text-gray-400"
          : coverage.signups === 0
            ? "border-gray-200 bg-gray-50 text-gray-500"
            : low
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
      )}
      title={
        filtered
          ? "이 배지는 필터를 적용하지 않습니다 — 기간 내 가입 학원 전체 중 가입 전 방문 기록이 연결된 곳"
          : "기간 내 가입 학원 중 가입 전 방문 기록이 연결된 곳(필터 무관)"
      }
    >
      <Icon className="size-3.5" aria-hidden />
      {filtered && <span className="font-medium">필터 무관 · 기간 전체 기준</span>}
      유입 추적 커버리지 {fmtInt(coverage.tracked)}/{fmtInt(coverage.signups)}곳
      {coverage.signups > 0 && <span className="font-medium opacity-70">({fmtPct(coverage.pct)})</span>}
    </span>
  );
}

export function ConversionFunnel({ data, filtered = false }: { data: ConversionsReport; filtered?: boolean }) {
  const { funnel, coverage } = data;
  const steps: Step[] = [
    {
      key: "visitors",
      label: "방문자",
      hint: "기간 내 방문한 브라우저",
      value: funnel.visitors,
      unit: "명",
      color: "bg-blue-500",
      basis: "visitor",
      compare: null,
      note: "기준",
    },
    {
      key: "auth",
      label: "가입·로그인 화면",
      hint: "가입/로그인 화면을 본 방문자",
      value: funnel.authVisitors,
      unit: "명",
      color: "bg-blue-400",
      basis: "visitor",
      compare: { label: "이전 단계 대비", value: rate(funnel.authVisitors, funnel.visitors) },
      note: "① 의 부분집합",
    },
    {
      key: "signup",
      label: "가입 (유입 추적)",
      hint: `가입 전 방문이 연결된 학원 · 전체 가입 ${fmtInt(funnel.signups)}곳`,
      hintTitle: `기간 내 가입한 학원 중 가입 전 방문 기록이 연결된 곳. 연결된 방문은 기간 밖일 수 있습니다. 전체 가입 ${fmtInt(funnel.signups)}곳.`,
      value: funnel.signupsTracked,
      unit: "곳",
      color: "bg-indigo-500",
      basis: "academy",
      // ② 와는 모집단·단위가 달라 「이전 단계 대비」를 내지 않는다. 같은 단위인 「전체 가입」과만 비교한다.
      compare: { label: "전체 가입 대비", value: rate(funnel.signupsTracked, funnel.signups) },
      note: null,
      noteTitle: "②까지는 방문자(명), ③부터는 가입 학원(곳)입니다. ②와 ③의 값을 서로 나누면 뜻이 없는 숫자가 나옵니다.",
    },
    {
      key: "paid",
      label: "결제",
      hint: "추적된 가입 학원 중 결제 완료(누적)",
      hintTitle: "③ 학원 중 지금까지 결제 완료(COMPLETED) 1건 이상. 기간 제한이 없는 코호트 누적이고, 전액 환불만 있는 학원은 제외합니다(§14 D15).",
      value: funnel.purchasers,
      unit: "곳",
      color: "bg-emerald-500",
      basis: "academy",
      compare: { label: "③ 대비", value: rate(funnel.purchasers, funnel.signupsTracked) },
      note: "③ 의 부분집합 · 기간 제한 없음",
    },
  ];
  const max = Math.max(1, funnel.visitors);
  const untracked = Math.max(0, coverage.signups - coverage.tracked);

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const prev = i > 0 ? steps[i - 1] : null;
          // 앞 단계와 모집단이 다르면 「이전 단계 대비」를 아예 내지 않고 그 사실을 적는다
          const mixedBasis = !!prev && prev.basis !== step.basis;
          const note = mixedBasis ? MIXED_BASIS : step.note;
          return (
          <li key={step.key} className="space-y-2">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[180px_minmax(0,1fr)_150px] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500 tabular-nums">
                    {i + 1}
                  </span>
                  {step.label}
                </div>
                <div className="mt-0.5 line-clamp-2 pl-7 text-[11.5px] leading-snug text-gray-400" title={step.hintTitle ?? step.hint}>
                  {step.hint}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-7 flex-1 overflow-hidden rounded-md bg-gray-50">
                  <div
                    className={cn("h-full rounded-md transition-[width]", step.color)}
                    style={{ width: `${step.value > 0 ? Math.max(1.5, (step.value / max) * 100) : 0}%` }}
                    aria-hidden
                  />
                </div>
                <div className="w-20 shrink-0 text-right text-[15px] font-bold text-gray-900 tabular-nums">
                  {fmtInt(step.value)}
                  <span className="ml-0.5 text-[11.5px] font-medium text-gray-400">{step.unit}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums sm:flex-col sm:items-end sm:gap-0">
                {step.compare && (
                  <span className="font-semibold text-gray-700">
                    {step.compare.label} {step.compare.value === null ? "-" : fmtPct(step.compare.value)}
                  </span>
                )}
                {note && (
                  <span className={cn("text-gray-400", mixedBasis && "font-medium text-amber-600")} title={step.noteTitle}>
                    {note}
                  </span>
                )}
              </div>
            </div>

            {filtered && step.key === "auth" && (
              <div className="flex items-start gap-1.5 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700">
                <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  필터가 걸려 있습니다 — <b className="font-semibold">①②</b> 는 기간 내 방문 세션에,{" "}
                  <b className="font-semibold">③④</b> 는 가입 학원의 귀속 세션(기간 제한 없음)에 각각 따로 적용됩니다. 두 구간의 값을 서로
                  나눈 비율은 뜻이 없습니다.
                </span>
              </div>
            )}
          </li>
          );
        })}
      </ol>

      <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-[12px] leading-relaxed text-gray-500">
        {filtered && <b className="font-semibold text-gray-400">필터 무관 · 기간 전체 기준 — </b>}
        기간 내 가입 <b className="font-semibold text-gray-700 tabular-nums">{fmtInt(coverage.signups)}곳</b> 중{" "}
        <b className="font-semibold text-gray-700 tabular-nums">{fmtInt(coverage.tracked)}곳</b>은 가입 전 방문 경로가 연결됐고,{" "}
        <b className="font-semibold text-gray-700 tabular-nums">{fmtInt(untracked)}곳</b>은 추적 시작 전 가입(또는 관리자 승인 가입)이라 경로를
        알 수 없습니다. ③④ 단계와 아래 채널·소스 표는 선택한 귀속 모델의 세션에 필터를 적용합니다(내부 트래픽 토글 무관).
      </div>
    </div>
  );
}
