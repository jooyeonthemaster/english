"use client";

import { useMemo, useState } from "react";
import type { ForecastAnalysis } from "@/lib/exam-forecast/analysis-types";
import { FC, serif } from "./theme";

/** 설계 원리 카드 — 영역 필터 + 회의론자 3표 생존 수 */
export function DoctrineBoard({ analysis }: { analysis: ForecastAnalysis }) {
  const rules = useMemo(() => analysis.doctrine ?? [], [analysis.doctrine]);
  const areas = useMemo(() => Array.from(new Set(rules.map((r) => r.area))), [rules]);
  const [area, setArea] = useState<string>("전체");
  const shown = area === "전체" ? rules : rules.filter((r) => r.area === area);
  if (rules.length === 0) return null;
  return (
    <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>출제 설계 원리 {rules.length}</p>
          <h3 className={`${serif} mt-1 text-[20px] font-extrabold`}>이 선생님은 이렇게 낸다 — 예측 문항은 전부 이 규칙으로 만들었다</h3>
          <p className="mt-1 text-[12.5px]" style={{ color: FC.sub }}>
            각 규칙은 기출 문항 근거를 달고, 반박 전담 검수자 3명이 교재 원문·전년도 문항표까지 대조해 검증했다. 과하게 일반화한 규칙은 반박을 반영해 고친 문장으로 실었다.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["전체", ...areas].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea(a)}
              className="rounded-full border px-3 py-1 text-[12px] font-semibold"
              style={area === a ? { background: FC.red, color: "#fff", borderColor: FC.red } : { borderColor: FC.rule }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((r) => (
          <article key={r.id} className="flex flex-col rounded-xl border p-4" style={{ borderColor: FC.rule, background: FC.paper }}>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-mono font-bold" style={{ color: FC.red }}>{r.id}</span>
              <span style={{ color: FC.sub }}>{r.area}</span>
              <span className="ml-auto rounded px-1.5 py-0.5 font-bold text-white" style={{ background: r.confidence === "관측" ? FC.ok : r.confidence === "강한 추론" ? FC.blue : FC.faint }}>
                {r.confidence}
              </span>
              {r.survivedVotes != null ? (
                <span
                  className="rounded px-1.5 py-0.5 font-bold"
                  style={{ background: "#fff", color: r.survivedVotes >= 2 ? FC.ok : FC.red }}
                  title="반박 전담 검수자 3명 중 이 규칙을 반박하지 못한 수. 반박된 규칙은 지적을 반영해 고쳐 실었다."
                >
                  {r.survivedVotes >= 2 ? `검증 통과 ${r.survivedVotes}/3` : r.correctedRule ? "반박 반영해 수정" : `논쟁 ${r.survivedVotes}/3`}
                </span>
              ) : null}
            </div>
            <h4 className="mt-2 text-[14.5px] font-bold leading-snug">{r.title}</h4>
            <p className="mt-1.5 text-[13px] leading-relaxed">{r.correctedRule || r.ruleKo}</p>
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: FC.sub }}>
              <b>근거</b> {r.evidence}
            </p>
            <p className="mt-auto pt-2 text-[12px] leading-relaxed">
              <span style={{ color: FC.red }}>▶ 적용</span> {r.howToApply}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
