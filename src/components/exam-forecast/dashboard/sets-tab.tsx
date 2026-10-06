"use client";

import { useMemo, useState } from "react";
import type { ForecastQuestionSummary } from "@/lib/exam-forecast/queries";
import { FORECAST_QTYPES, type ForecastPassage, type ForecastSet } from "@/lib/exam-forecast/types";
import { FAMILY_COLOR, FC, SOURCE_COLOR, serif } from "./theme";

// 봉투 모의고사 10회 — 회차별 구성표 + PDF(문제지/정답·해설) 내려받기 + 문제집.

function pdfHref(slug: string, file: string, name: string) {
  return `/api/exam-forecast/${slug}/pdf?file=${file}&name=${encodeURIComponent(name)}`;
}

export function SetsTab({ slug, sets, questions, passages, pdfFiles }: { slug: string; sets: ForecastSet[]; questions: ForecastQuestionSummary[]; passages: ForecastPassage[]; pdfFiles: string[] }) {
  const has = (f: string) => pdfFiles.includes(f);
  const qById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const pById = useMemo(() => new Map(passages.map((p) => [p.id, p])), [passages]);
  const [openNo, setOpenNo] = useState<number | null>(null);
  const forecastCount = questions.filter((q) => q.role === "forecast").length;

  return (
    <div className="space-y-10">
      <section>
        <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>봉투 모의고사 {sets.length}회</p>
        <h3 className={`${serif} mt-1 text-[20px] font-extrabold`}>기출과 같은 틀(선택형 27 + 논술형 3 · 100점) — 회차가 올라갈수록 어렵다</h3>
        <p className="mt-1 text-[13px]" style={{ color: FC.sub }}>한 회차 안에서는 같은 지문이 두 번 나오지 않고, 회차마다 같은 지문을 다른 유형으로 만난다. PDF 는 기출 시험지와 같은 조판(2단·테두리·배점 표기)이다.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sets.map((s) => {
            const items = s.items.map((it) => ({ it, q: qById.get(it.questionId) })).filter((x) => x.q);
            const bySrc: Record<string, number> = {};
            let diffSum = 0;
            for (const { q } of items) {
              const g = pById.get(q!.passageId)?.sourceGroup ?? "기타";
              bySrc[g] = (bySrc[g] ?? 0) + 1;
              diffSum += q!.difficulty;
            }
            const avg = items.length ? diffSum / items.length : 0;
            const hasPaper = Boolean(s.pdfPaths.paper);
            const open = openNo === s.no;
            return (
              <article key={s.no} className="flex flex-col rounded-2xl border p-5" style={{ background: FC.card, borderColor: open ? FC.red : FC.rule }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className={`${serif} text-[26px] font-extrabold leading-none`}>
                      제{s.no}회
                    </div>
                    <div className="mt-1 text-[12.5px] font-bold" style={{ color: FC.red }}>{s.tier}</div>
                  </div>
                  <div className="text-right text-[11.5px]" style={{ color: FC.sub }}>
                    <div>평균 난도 <b style={{ color: FC.ink }}>{avg.toFixed(1)}</b></div>
                    <div>{Object.entries(bySrc).map(([g, n]) => `${g} ${n}`).join(" · ")}</div>
                  </div>
                </div>
                <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: FC.sub }}>{s.description}</p>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full" style={{ background: FC.paper }}>
                  {items.map(({ it, q }) => (
                    <span key={it.number} className="h-full flex-1" title={`${it.number > 100 ? `논술형 ${it.number - 100}` : it.number} ${FORECAST_QTYPES[q!.qtype]?.short}`} style={{ background: FAMILY_COLOR[FORECAST_QTYPES[q!.qtype]?.family ?? ""] ?? FC.sub, opacity: 0.35 + q!.difficulty * 0.13 }} />
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[12.5px] font-bold">
                  {hasPaper ? (
                    <>
                      <a href={pdfHref(slug, `set-${String(s.no).padStart(2, "0")}-paper`, `한광고_봉투모의고사_${s.no}회_문제지.pdf`)} className="rounded-md px-3 py-2 text-white" style={{ background: FC.ink }}>문제지 PDF</a>
                      <a href={pdfHref(slug, `set-${String(s.no).padStart(2, "0")}-answers`, `한광고_봉투모의고사_${s.no}회_정답해설.pdf`)} className="rounded-md border px-3 py-2" style={{ borderColor: FC.ink }}>정답·해설 PDF</a>
                    </>
                  ) : null}
                  <a href={`/director/exam-forecast/${slug}/print?set=${s.no}&print=0`} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-2" style={{ borderColor: FC.rule }}>화면에서 보기</a>
                  <button type="button" onClick={() => setOpenNo(open ? null : s.no)} className="ml-auto underline" style={{ color: FC.red }}>{open ? "구성표 접기" : "구성표"}</button>
                </div>
                {open ? (
                  <table className="mt-4 w-full text-[12px]">
                    <thead>
                      <tr className="text-left" style={{ color: FC.sub }}>
                        <th className="pb-1 font-semibold">번호</th>
                        <th className="pb-1 font-semibold">유형</th>
                        <th className="pb-1 font-semibold">지문</th>
                        <th className="pb-1 text-right font-semibold">배점</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(({ it, q }) => {
                        const p = pById.get(q!.passageId);
                        return (
                          <tr key={it.number} className="border-t" style={{ borderColor: FC.rule }}>
                            <td className="py-1 font-bold">{it.number > 100 ? `논${it.number - 100}` : it.number}</td>
                            <td className="py-1">{FORECAST_QTYPES[q!.qtype]?.short ?? q!.qtype}</td>
                            <td className="py-1">
                              <span style={{ color: SOURCE_COLOR[p?.sourceGroup ?? ""] }}>{p?.code}</span>{" "}
                              <span style={{ color: FC.sub }}>{p?.titleKo.slice(0, 18)}</span>
                            </td>
                            <td className="py-1 text-right">{it.points}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : null}
              </article>
            );
          })}
          {sets.length === 0 ? <p className="text-[13px]" style={{ color: FC.sub }}>봉투 모의고사를 준비 중입니다.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
        <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>예측 문항 모음 문제집</p>
        <h3 className={`${serif} mt-1 text-[20px] font-extrabold`}>지문별 전 유형 {forecastCount}문항 — 봉투 모의고사 문항 + 확장 문항</h3>
        <p className="mt-1 text-[13px]" style={{ color: FC.sub }}>지문 순서대로, 지문마다 나올 수 있는 유형을 전부 실었다. 지문 하나만 뽑으려면 「지문별 예측」에서, 조건으로 골라 뽑으려면 「문항 은행」에서.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px] font-bold">
          {[
            { f: "workbook-all", label: "문제집 PDF", name: "한광고_예측문항_문제집.pdf", primary: true },
            { f: "workbook-answers", label: "정답·해설 PDF", name: "한광고_예측문항_문제집_정답해설.pdf" },
            { f: "workbook-textbook", label: "교과서 편만", name: "한광고_예측문항_교과서편.pdf" },
            { f: "workbook-hakpyeong", label: "학평 편만", name: "한광고_예측문항_학평편.pdf" },
            { f: "workbook-olympus", label: "올림포스 편만", name: "한광고_예측문항_올림포스편.pdf" },
          ]
            .filter((b) => has(b.f))
            .map((b) => (
              <a key={b.f} href={pdfHref(slug, b.f, b.name)} className={`rounded-md px-4 py-2 ${b.primary ? "text-white" : "border"}`} style={b.primary ? { background: FC.ink } : { borderColor: FC.ink }}>
                {b.label}
              </a>
            ))}
          <a href={`/director/exam-forecast/${slug}/print?workbook=all&print=0`} target="_blank" rel="noreferrer" className="rounded-md border px-4 py-2" style={{ borderColor: FC.rule }}>
            화면에서 보기·인쇄
          </a>
        </div>
      </section>
    </div>
  );
}
