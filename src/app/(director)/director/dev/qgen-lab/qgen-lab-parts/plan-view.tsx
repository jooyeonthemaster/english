"use client";

// 계획(planner) 시각화 — 지문 위에 정답/미끼 후보를 칠하고 점수 칩을 단다. + 검증(jev-d10) 요약.

import type { PlannerPlan, VerifyResult } from "@/lib/qgen-lab/types";
import { cn } from "@/lib/utils";
import { fmtMs, fmtUsd } from "./format-utils";
import { planSegments, type RankedSite } from "./passage-utils";
import { Gauge, IssueList, Mono } from "./ui-bits";

function siteTitle(s: RankedSite): string {
  const lines = [
    `${s.role === "answer" ? "정답" : "미끼"} 후보 #${s.rank} · score ${s.score.toFixed(3)}`,
    `core: ${s.core}`,
    `span: ${s.span}`,
  ];
  if (s.category) lines.push(`범주: ${s.category}`);
  if (s.wrongForm) lines.push(`제안 오형: ${s.wrongForm}`);
  if (s.evidence) for (const [k, v] of Object.entries(s.evidence)) lines.push(`${k}: ${typeof v === "number" ? v.toFixed(3) : v}`);
  return lines.join("\n");
}

export function PlanView({ plan, passage }: { plan: PlannerPlan; passage: string }) {
  const { segments, missing } = planSegments(passage, plan);
  const all: RankedSite[] = [
    ...plan.answerCandidates.map((s, i) => ({ ...s, role: "answer" as const, rank: i + 1 })),
    ...plan.decoyCandidates.map((s, i) => ({ ...s, role: "decoy" as const, rank: i + 1 })),
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[0.6875rem] font-bold tracking-[0.12em] text-stone-500 uppercase">출제 계획</span>
        <Gauge label="planner" value={`${plan.plannerId}/${plan.mode}`} />
        <Gauge label="시간" value={fmtMs(plan.ms)} />
        <Gauge label="jev" value={`${plan.jevCalls}회`} sub={fmtUsd(plan.jevCostUsd)} />
        {(plan.llmCostUsd > 0 || plan.llmMs > 0) && (
          <Gauge label="LLM" value={fmtMs(plan.llmMs)} sub={fmtUsd(plan.llmCostUsd)} />
        )}
        <span className="ml-auto flex items-center gap-2 text-[0.6875rem] text-stone-500">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-3 rounded-[2px] border-b-2 border-orange-600 bg-orange-100" /> 정답 후보
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-3 rounded-[2px] border-b border-dashed border-stone-600 bg-stone-200" /> 미끼 후보
          </span>
        </span>
      </div>

      <p className="rounded-md border border-stone-200 bg-white px-4 py-3 font-serif text-[0.9375rem] leading-[2.1] text-stone-900">
        {segments.map((s, i) =>
          s.type === "text" || !s.site ? (
            <span key={i}>{s.text}</span>
          ) : (
            <span key={i} title={siteTitle(s.site)} className="whitespace-nowrap">
              <span
                className={cn(
                  "rounded-[2px] px-0.5",
                  s.site.role === "answer"
                    ? "border-b-2 border-orange-600 bg-orange-100"
                    : "border-b border-dashed border-stone-600 bg-stone-200/70",
                )}
              >
                {s.text}
              </span>
              <sup
                className={cn(
                  "ml-0.5 rounded-[3px] px-[3px] font-mono text-[0.625rem] font-semibold not-italic",
                  s.site.role === "answer" ? "bg-orange-600 text-white" : "bg-stone-700 text-white",
                )}
              >
                {s.site.role === "answer" ? "A" : "D"}
                {s.site.rank} {s.site.score.toFixed(2)}
              </sup>
            </span>
          ),
        )}
      </p>

      {missing.length > 0 && (
        <IssueList
          tone="muted"
          issues={missing.map(({ site, why }) => `${site.role === "answer" ? "A" : "D"}${site.rank} “${site.core}” — ${why}`)}
        />
      )}

      <details className="group">
        <summary className="cursor-pointer text-[0.6875rem] font-semibold text-stone-500 hover:text-stone-800">
          후보 {all.length}개 표 · 교사 포인트 {plan.teacherPoints?.length ?? 0}개
        </summary>
        <table className="mt-1.5 w-full border-collapse text-[0.75rem]">
          <thead>
            <tr className="border-b border-stone-300 text-left text-[0.6875rem] text-stone-500">
              <th className="py-1 pr-2 font-semibold">순위</th>
              <th className="py-1 pr-2 font-semibold">core</th>
              <th className="py-1 pr-2 font-semibold">범주</th>
              <th className="py-1 pr-2 font-semibold">오형</th>
              <th className="py-1 pr-2 font-semibold">문장</th>
              <th className="py-1 text-right font-semibold">score</th>
            </tr>
          </thead>
          <tbody>
            {all.map((s) => (
              <tr key={`${s.role}-${s.rank}`} className="border-b border-stone-100" title={siteTitle(s)}>
                <td className="py-1 pr-2">
                  <Mono className={s.role === "answer" ? "font-bold text-orange-700" : "text-stone-600"}>
                    {s.role === "answer" ? "A" : "D"}
                    {s.rank}
                  </Mono>
                </td>
                <td className="py-1 pr-2 font-serif">{s.core}</td>
                <td className="py-1 pr-2">{s.category ?? "—"}</td>
                <td className="py-1 pr-2 font-serif">{s.wrongForm ?? "—"}</td>
                <td className="py-1 pr-2">
                  <Mono>{s.sentenceIdx}</Mono>
                </td>
                <td className="py-1 text-right">
                  <Mono>{s.score.toFixed(3)}</Mono>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {plan.teacherPoints && plan.teacherPoints.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[0.75rem] text-stone-700">
            {plan.teacherPoints.map((t, i) => (
              <li key={i}>
                <Mono className="text-stone-400">{t.unit}</Mono> <span className="font-serif">{t.text}</span>
                {t.tag && <span className="ml-1 text-stone-500">[{t.tag}]</span>}
                {t.note && <span className="ml-1 text-stone-500">— {t.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

export function VerifyStrip({ verify, index }: { verify: VerifyResult; index: number }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 text-[0.75rem]",
        verify.pass ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/60",
      )}
    >
      <span className="font-bold text-stone-700">검증 {index + 1}</span>
      <span className={cn("font-semibold", verify.pass ? "text-emerald-800" : "text-amber-800")}>
        {verify.pass ? "통과" : "실패"}
      </span>
      <Mono className="text-stone-500">{verify.verifierId}</Mono>
      <span className="flex items-center gap-1">
        {verify.perMark.map((m) => (
          <span
            key={m.label}
            title={`${m.label} “${m.shown}” P(옳음)=${m.pGrammatical.toFixed(3)}`}
            className={cn(
              "rounded-[3px] border px-1 font-mono text-[0.6875rem] tabular-nums",
              m.label === verify.answerLabel ? "border-orange-400 bg-orange-100 text-orange-900" : "border-stone-300 bg-white text-stone-700",
            )}
          >
            {m.label.replace(/[()]/g, "")} {m.pGrammatical.toFixed(2)}
          </span>
        ))}
      </span>
      <Mono className="text-stone-500">{fmtMs(verify.ms)}</Mono>
      <Mono className="text-stone-500">{fmtUsd(verify.jevCostUsd)}</Mono>
      {verify.reason && <span className="basis-full text-stone-600">{verify.reason}</span>}
    </div>
  );
}
