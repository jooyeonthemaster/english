"use client";

import type { ForecastPackView, ForecastQuestionSummary } from "@/lib/exam-forecast/queries";
import type { ForecastPassage, ForecastSet } from "@/lib/exam-forecast/types";
import { FORECAST_QTYPES } from "@/lib/exam-forecast/types";
import type { ForecastAnalysis, ForecastRangeInfo, PassagePrediction } from "@/lib/exam-forecast/analysis-types";
import { FC, SOURCE_COLOR, pct, serif } from "./theme";

const STRENGTH_COLOR: Record<string, string> = { 확정: FC.ok, 강함: FC.blue, 보통: FC.sub, 약함: FC.faint };

export function OverviewTab({
  analysis,
  rangeInfo,
  passages,
  questions,
  sets,
  onOpenPassage,
  onGo,
}: {
  pack: ForecastPackView;
  analysis: ForecastAnalysis;
  rangeInfo: ForecastRangeInfo;
  passages: ForecastPassage[];
  questions: ForecastQuestionSummary[];
  sets: ForecastSet[];
  onOpenPassage: (code: string) => void;
  onGo: (tab: string) => void;
}) {
  const byPassage = new Map<string, number>();
  for (const q of questions) if (q.role === "forecast") byPassage.set(q.passageId, (byPassage.get(q.passageId) ?? 0) + 1);
  const groups = ["학평", "올림포스", "교과서"].map((g) => ({ g, list: passages.filter((p) => p.sourceGroup === g) })).filter((x) => x.list.length);

  return (
    <div className="space-y-10">
      {/* 결론 먼저 */}
      <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
          <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>범위 추정 — 결론</p>
          <h2 className={`${serif} mt-2 text-[22px] font-extrabold leading-snug`}>
            {rangeInfo.headline ?? "2025년 9월 고2 학평 + 올림포스 9대 변별유형 Practice 07~08"}
          </h2>
          <ol className="mt-6 space-y-4">
            {(rangeInfo.evidence ?? []).map((e, i) => (
              <li key={i} className="grid grid-cols-[28px_1fr] gap-3">
                <span className={`${serif} flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-extrabold text-white`} style={{ background: FC.ink }}>
                  {i + 1}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold">{e.step}</span>
                    <span className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: STRENGTH_COLOR[e.strength] ?? FC.sub }}>
                      {e.strength}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: FC.sub }}>{e.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          {rangeInfo.uncertainty?.length ? (
            <div className="mt-6 rounded-lg px-4 py-3 text-[13px] leading-relaxed" style={{ background: FC.paper }}>
              <b>남은 불확실성</b>
              <ul className="mt-1 list-disc pl-5" style={{ color: FC.sub }}>
                {rangeInfo.uncertainty.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border p-6" style={{ background: FC.card, borderColor: FC.rule }}>
            <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>1학기 기출 ↔ 학평 원문 대조</p>
            <p className="mt-2 text-[13px]" style={{ color: FC.sub }}>
              실제 기출 30문항 중 아래 문항이 <b style={{ color: FC.ink }}>전년도 3월 고2 학평</b>과 일치 — 그리고 전부 <b style={{ color: FC.red }}>원래와 다른 유형</b>으로 출제됐다.
            </p>
            <table className="mt-4 w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px]" style={{ color: FC.sub }}>
                  <th className="pb-2 font-semibold">기출</th>
                  <th className="pb-2 font-semibold">원 출처</th>
                  <th className="pb-2 font-semibold">원래 유형</th>
                  <th className="pb-2 font-semibold" />
                  <th className="pb-2 font-semibold">출제 유형</th>
                </tr>
              </thead>
              <tbody>
                {(rangeInfo.referenceMatches ?? []).map((m) => (
                  <tr key={m.examQ} className="border-t" style={{ borderColor: FC.rule }}>
                    <td className="py-1.5 font-bold">{m.examQ}</td>
                    <td className="py-1.5" style={{ color: FC.sub }}>{m.source}</td>
                    <td className="py-1.5">{m.originalType}</td>
                    <td className="py-1.5" style={{ color: FC.red }}>→</td>
                    <td className="py-1.5 font-bold">{m.examType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border p-6" style={{ background: FC.card, borderColor: FC.rule }}>
            <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>예상 출처 구성</p>
            <div className="mt-4 space-y-3">
              {(rangeInfo.sources ?? []).map((s) => (
                <div key={s.label}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-bold">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: SOURCE_COLOR[s.group] ?? FC.sub }} />
                      {s.label}
                    </span>
                    <span style={{ color: FC.sub }}>
                      지문 {s.count} · 예상 {s.expectedItems}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-[18px] text-[12px]" style={{ color: FC.faint }}>{s.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 설계 의도 서사 */}
      {analysis.teacherIntentKo ? (
        <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
          <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>출제자의 내심 — 기출이 말해 주는 설계 의도</p>
          <div className={`${serif} mt-3 max-w-[78ch] space-y-3 text-[15.5px] leading-[1.85]`}>
            {analysis.teacherIntentKo.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <button type="button" onClick={() => onGo("trend")} className="mt-5 text-[13px] font-bold underline" style={{ color: FC.red }}>
            설계 원리 {analysis.doctrine?.length ?? 0}개와 근거 보기 →
          </button>
        </section>
      ) : null}

      {/* 지문 적중 지도 */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>지문 적중 지도</p>
            <h3 className={`${serif} mt-1 text-[20px] font-extrabold`}>범위 {passages.length}지문 — 출제 확률과 1순위 예상 유형</h3>
          </div>
          <span className="text-[12px]" style={{ color: FC.sub }}>
            카드를 누르면 지문별 예측으로 · 봉투 {sets.length}회 · 예측 문항 {questions.filter((q) => q.role === "forecast").length}
          </span>
        </div>
        {groups.map(({ g, list }) => (
          <div key={g} className="mt-5">
            <div className="mb-2 text-[13px] font-bold" style={{ color: SOURCE_COLOR[g] }}>
              {g} · {list.length}지문
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              {list.map((p) => {
                const pred = p.prediction as PassagePrediction;
                const top = [...(pred.predictedTypes ?? [])].sort((a, b) => b.probability - a.probability)[0];
                const hit = pred.hitLikelihood ?? null;
                return (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => onOpenPassage(p.code)}
                    className="group rounded-xl border p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                    style={{ background: FC.card, borderColor: FC.rule }}
                  >
                    <div className="flex items-center justify-between text-[11px]" style={{ color: FC.sub }}>
                      <span>{p.sourceLabel.replace("2025년 9월 고2 학평 ", "학평 ").replace("올림포스 9대 변별유형 ", "")}</span>
                      <span className="font-bold" style={{ color: hit != null && hit >= 0.75 ? FC.red : FC.sub }}>{pct(hit)}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-[13.5px] font-bold leading-snug">{p.titleKo}</div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: FC.paper }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.round((hit ?? 0) * 100)}%`, background: hit != null && hit >= 0.75 ? FC.red : FC.ink }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11.5px]">
                      <span style={{ color: FC.sub }}>
                        1순위 <b style={{ color: FC.ink }}>{top ? FORECAST_QTYPES[top.qtype as keyof typeof FORECAST_QTYPES]?.short ?? top.qtype : "–"}</b>
                        {top ? ` ${pct(top.probability)}` : ""}
                      </span>
                      <span style={{ color: FC.faint }}>{byPassage.get(p.id) ?? 0}문항</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
