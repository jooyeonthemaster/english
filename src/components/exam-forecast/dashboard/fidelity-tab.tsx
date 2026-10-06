"use client";

import { useState } from "react";
import type { FormatFidelity } from "@/lib/exam-forecast/analysis-types";
import { FORECAST_QTYPES, type ForecastQType, type ForecastSet } from "@/lib/exam-forecast/types";
import { FC, pct, serif } from "./theme";

// 동형 대조 — 봉투 회차가 실물 기출과 형식이 얼마나 같은지(번호별 유형·배점·발문·선지·표지 수·쪽수, 기계 계측)
// + 실물 스캔과 봉투 쪽을 나란히 놓은 PDF(scripts/exam-forecast/build-fidelity-pdfs.py, 비공개 버킷).

const CHECK_KEYS = ["qtype", "points", "stem", "layout", "lang", "marks"] as const;
const CHECK_SHORT: Record<string, string> = { qtype: "유형", points: "배점", stem: "발문", layout: "선지 배열", lang: "선지 언어", marks: "표지 수" };

function inlinePdf(slug: string, file: string) {
  return `/api/exam-forecast/${slug}/pdf?file=${encodeURIComponent(file)}&inline=1`;
}

export function FidelityTab({ slug, fidelity, sets, pdfFiles }: { slug: string; fidelity?: FormatFidelity; sets: ForecastSet[]; pdfFiles: string[] }) {
  const [view, setView] = useState<string>(sets[0] ? `fidelity-set-${String(sets[0].no).padStart(2, "0")}` : "fidelity-reference");
  if (!fidelity) return <p className="text-[13px]" style={{ color: FC.sub }}>형식 대조 데이터가 아직 없습니다.</p>;
  const has = (f: string) => pdfFiles.includes(f);
  const choices = [{ f: "fidelity-reference", label: "기출 재조판" }, ...sets.map((s) => ({ f: `fidelity-set-${String(s.no).padStart(2, "0")}`, label: `${s.no}회` }))].filter((c) => has(c.f));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
        <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>동형 대조 — 실물 기출과 형식이 얼마나 같은가</p>
        <h2 className={`${serif} mt-1 text-[22px] font-extrabold`}>봉투 {sets.length}회 × 30문항을 실물 시험지 번호별로 기계 대조</h2>
        <p className="mt-1 max-w-[95ch] text-[12.5px] leading-relaxed" style={{ color: FC.sub }}>{fidelity.note}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {fidelity.summary.map((s) => {
            const r = s.total ? s.match / s.total : 0;
            return (
              <div key={s.check} className="rounded-xl border px-3 py-3" style={{ borderColor: FC.rule, background: r >= 0.999 ? FC.okSoft : FC.paper }}>
                <div className="text-[11.5px] font-semibold" style={{ color: FC.sub }}>{s.label}</div>
                <div className={`${serif} mt-1 text-[24px] font-extrabold leading-none`} style={{ color: r >= 0.999 ? FC.ok : FC.ink }}>
                  {pct(r, r >= 0.999 ? 0 : 1)}
                </div>
                <div className="mt-1 text-[11px]" style={{ color: FC.faint }}>
                  {s.match}/{s.total}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
        <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>번호별 — 기출 형식 그대로인 회차 수</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px]" style={{ color: FC.sub }}>
                <th className="pb-2 font-semibold">번호</th>
                <th className="pb-2 font-semibold">기출 유형</th>
                <th className="pb-2 font-semibold">배점</th>
                {CHECK_KEYS.map((k) => (
                  <th key={k} className="pb-2 text-center font-semibold">{CHECK_SHORT[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fidelity.perSlot.map((r) => (
                <tr key={String(r.number)} className="border-t" style={{ borderColor: FC.rule }}>
                  <td className="py-1.5 font-bold">{String(r.number).startsWith("S") ? `논술형 ${String(r.number).slice(1)}` : `${r.number}번`}</td>
                  <td className="py-1.5">{FORECAST_QTYPES[r.refType as ForecastQType]?.label ?? r.refType}</td>
                  <td className="py-1.5">{r.refPoints}점</td>
                  {CHECK_KEYS.map((k) => {
                    const v = Number(r[k] ?? 0);
                    const all = v === r.sets;
                    return (
                      <td key={k} className="py-1.5 text-center font-semibold" style={{ color: all ? FC.ok : FC.red }}>
                        {all ? "✓" : `${v}/${r.sets}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Diffs fidelity={fidelity} />
      </section>

      <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>나란히 보기 — 왼쪽 실물 기출 스캔 · 오른쪽 봉투</p>
            <p className="mt-1 text-[12.5px]" style={{ color: FC.sub }}>쪽마다 같은 크기로 놓았다. 실물 스캔의 학생 이름은 가렸다.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {choices.map((c) => (
              <button key={c.f} type="button" onClick={() => setView(c.f)} className="rounded-md border px-3 py-1.5 text-[12.5px] font-bold" style={{ borderColor: view === c.f ? FC.red : FC.rule, background: view === c.f ? FC.redSoft : FC.paper }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {has(view) ? (
          <iframe key={view} title="동형 대조" src={inlinePdf(slug, view)} className="mt-4 h-[78vh] w-full rounded-lg border" style={{ borderColor: FC.rule, background: "#fff" }} />
        ) : (
          <p className="mt-4 text-[13px]" style={{ color: FC.sub }}>이 회차의 대조 PDF가 아직 없습니다.</p>
        )}
      </section>
    </div>
  );
}

function Diffs({ fidelity }: { fidelity: FormatFidelity }) {
  const rows = fidelity.perSet.flatMap((s) => s.diffs.filter((d) => d.check !== "stemExact").map((d) => ({ set: s.no, ...d })));
  if (!rows.length) return <p className="mt-4 text-[12.5px] font-semibold" style={{ color: FC.ok }}>번호별 형식 차이 없음</p>;
  return (
    <div className="mt-5 rounded-lg px-4 py-3 text-[12.5px] leading-relaxed" style={{ background: FC.paper }}>
      <b>기출과 다른 곳 {rows.length}건</b>
      <ul className="mt-1 space-y-0.5" style={{ color: FC.sub }}>
        {rows.slice(0, 40).map((d, i) => (
          <li key={i}>
            <b style={{ color: FC.ink }}>{d.set}회 {d.number.startsWith("S") ? `논술형 ${d.number.slice(1)}` : `${d.number}번`}</b> · {CHECK_SHORT[d.check] ?? d.check} — {d.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
