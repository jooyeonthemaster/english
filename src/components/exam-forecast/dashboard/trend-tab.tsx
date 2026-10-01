"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FORECAST_QTYPES, type ForecastQType } from "@/lib/exam-forecast/types";
import type { ForecastAnalysis } from "@/lib/exam-forecast/analysis-types";
import { FAMILY_COLOR, FC, SOURCE_COLOR, serif } from "./theme";
import { DoctrineBoard } from "./doctrine-board";

const LENS_LABEL: Record<string, string> = {
  format: "형식·조판",
  structure: "구성·배점·정답",
  options: "선지 설계",
  grammar: "어법",
  vocab: "어휘",
  inference: "빈칸·함축·요약·연결어",
  indirect: "순서·삽입·무관",
  essay: "논술형",
  transform: "원문 변형",
};

function familyOf(qtype: string): string {
  return FORECAST_QTYPES[qtype as ForecastQType]?.family ?? "기타";
}

export function TrendTab({ analysis }: { analysis: ForecastAnalysis }) {
  const bp = useMemo(() => analysis.blueprint ?? [], [analysis.blueprint]);
  const [lens, setLens] = useState<string>(analysis.lenses?.[0]?.key ?? "");

  const familyRows = useMemo(() => {
    const m = new Map<string, { family: string; count: number; points: number }>();
    for (const s of bp) {
      const f = familyOf(s.qtype);
      const cur = m.get(f) ?? { family: f, count: 0, points: 0 };
      cur.count += 1;
      cur.points = Math.round((cur.points + s.points) * 10) / 10;
      m.set(f, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.points - a.points);
  }, [bp]);

  const answerRows = useMemo(() => {
    const d = analysis.stats?.answerDist ?? {};
    const fromBp: Record<string, number> = {};
    for (const s of bp) if (/^[①-⑤]$/.test(s.answer)) fromBp[s.answer] = (fromBp[s.answer] ?? 0) + 1;
    const src = Object.keys(d).length ? d : fromBp;
    return ["①", "②", "③", "④", "⑤"].map((k) => ({ k, n: src[k] ?? 0 }));
  }, [analysis.stats, bp]);

  const totalMc = bp.filter((s) => !s.no.startsWith("S") && !s.no.startsWith("논")).reduce((a, s) => a + s.points, 0);
  const lensReport = analysis.lenses?.find((l) => l.key === lens);

  return (
    <div className="space-y-10">
      {/* 기출 지도 */}
      <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>기출 지도 — 2026 1학기 1차 30문항</p>
            <h3 className={`${serif} mt-1 text-[20px] font-extrabold`}>번호·유형·배점·출처가 한눈에 — 봉투 모의고사 10회는 이 틀을 그대로 따른다</h3>
          </div>
          <div className="text-[12px]" style={{ color: FC.sub }}>
            선택형 합계 <b style={{ color: FC.ink }}>{Math.round(totalMc * 10) / 10}점</b> · 논술형 3문항
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-10">
          {bp.map((s) => {
            const fam = familyOf(s.qtype);
            return (
              <div key={s.no} className="rounded-lg border p-2" style={{ borderColor: FC.rule, background: FC.paper }} title={`${s.typeKo} · ${s.source}`}>
                <div className="flex items-center justify-between">
                  <span className={`${serif} text-[16px] font-extrabold`}>{s.no.startsWith("S") ? `서${s.no.slice(1)}` : s.no}</span>
                  <span className="text-[10.5px] font-bold" style={{ color: FC.sub }}>{s.points}</span>
                </div>
                <div className="mt-1 h-1 rounded-full" style={{ background: FAMILY_COLOR[fam] ?? FC.sub }} />
                <div className="mt-1.5 truncate text-[11.5px] font-bold">{FORECAST_QTYPES[s.qtype as ForecastQType]?.short ?? s.typeKo}</div>
                <div className="truncate text-[10.5px]" style={{ color: SOURCE_COLOR[s.source.includes("학평") ? "학평" : s.source.includes("교과서") ? "교과서" : "올림포스"] }}>
                  {s.source}
                </div>
                <div className="mt-0.5 text-[10.5px]" style={{ color: FC.faint }}>
                  {s.answer && s.answer.length <= 2 ? `정답 ${s.answer}` : "서술"} · 난도 {s.difficulty}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-[11.5px]" style={{ color: FC.sub }}>
          {Object.entries(FAMILY_COLOR).map(([f, c]) => (
            <span key={f} className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded-full" style={{ background: c }} />
              {f}
            </span>
          ))}
        </div>
      </section>

      {/* 차트 2종 */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border p-6" style={{ background: FC.card, borderColor: FC.rule }}>
          <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>유형 계열별 배점</p>
          <p className="mt-1 text-[12.5px]" style={{ color: FC.sub }}>배점이 곧 출제자의 가중치 — 추론(빈칸·함축·요약)과 어법·어휘가 점수를 쥔다</p>
          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={familyRows} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} stroke={FC.rule} />
                <XAxis type="number" tick={{ fontSize: 11, fill: FC.sub }} />
                <YAxis type="category" dataKey="family" width={64} tick={{ fontSize: 12, fill: FC.ink }} />
                <Tooltip formatter={(v, n) => [n === "points" ? `${v}점` : `${v}문항`, n === "points" ? "배점" : "문항"]} />
                <Bar dataKey="points" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {familyRows.map((r) => (
                    <Cell key={r.family} fill={FAMILY_COLOR[r.family] ?? FC.sub} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border p-6" style={{ background: FC.card, borderColor: FC.rule }}>
          <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>선택형 정답 번호 분포</p>
          <p className="mt-1 text-[12.5px]" style={{ color: FC.sub }}>27문항 정답 위치 — 봉투 모의고사도 같은 균형으로 맞췄다</p>
          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={answerRows} margin={{ left: -12, right: 12 }}>
                <CartesianGrid vertical={false} stroke={FC.rule} />
                <XAxis dataKey="k" tick={{ fontSize: 14, fill: FC.ink }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: FC.sub }} />
                <Tooltip formatter={(v) => [`${v}문항`, "정답"]} />
                <Bar dataKey="n" fill={FC.ink} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* 원문 변형 흐름 */}
      {analysis.transforms?.length ? (
        <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
          <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>원문 → 시험지 — 선생님은 지문을 어떻게 바꿨나</p>
          <p className="mt-1 text-[13px]" style={{ color: FC.sub }}>학평 원문과 실제 시험지를 단어 단위로 맞대 본 결과(기계 비교)</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {analysis.transforms.map((t) => (
              <div key={t.examQ} className="rounded-xl border p-4" style={{ borderColor: FC.rule }}>
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className={`${serif} text-[17px] font-extrabold`}>{t.examQ.startsWith("S") ? `논술형 ${t.examQ.slice(1)}` : `${t.examQ}번`}</span>
                  <span style={{ color: FC.sub }}>{t.source}</span>
                  <span className="ml-auto rounded px-2 py-0.5 text-[12px] font-bold" style={{ background: FC.paper }}>
                    {t.from} <span style={{ color: FC.red }}>→</span> {t.to}
                  </span>
                </div>
                <div className="mt-2 text-[11.5px]" style={{ color: FC.faint }}>원문 일치도 {(t.similarity * 100).toFixed(1)}% · 손댄 곳 {t.edits.length}</div>
                <ul className="mt-2 space-y-1 text-[12.5px]">
                  {t.edits.slice(0, 6).map((e, i) => (
                    <li key={i} className="leading-snug">
                      {e.original ? <del className="decoration-[#b3261e]" style={{ color: FC.sub }}>{e.original.slice(0, 90)}</del> : null}
                      {e.original && e.exam ? " → " : null}
                      {e.exam ? <ins className="no-underline" style={{ background: FC.marker }}>{e.exam.slice(0, 120)}</ins> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 설계 원리 */}
      <DoctrineBoard analysis={analysis} />

      {/* 렌즈 */}
      {analysis.lenses?.length ? (
        <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
          <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>9개 렌즈의 해부 기록</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {analysis.lenses.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLens(l.key)}
                className="rounded-full border px-3 py-1 text-[12.5px] font-semibold transition"
                style={lens === l.key ? { background: FC.ink, color: "#fff", borderColor: FC.ink } : { borderColor: FC.rule, color: FC.ink }}
              >
                {LENS_LABEL[l.key] ?? l.key}
              </button>
            ))}
          </div>
          {lensReport ? (
            <div className="mt-5">
              <p className="max-w-[90ch] text-[14px] leading-relaxed">{lensReport.summaryKo}</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {lensReport.findings.map((f, i) => (
                  <div key={i} className="rounded-xl border p-4 text-[13px] leading-relaxed" style={{ borderColor: FC.rule, background: FC.paper }}>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: f.confidence === "관측" ? FC.ok : f.confidence === "강한 추론" ? FC.blue : FC.faint }}>
                        {f.confidence}
                      </span>
                      <b>{f.claim}</b>
                    </div>
                    <p className="mt-2 text-[12px]" style={{ color: FC.sub }}>근거: {f.evidence}</p>
                    <p className="mt-1.5 text-[12.5px]">
                      <span style={{ color: FC.red }}>▶</span> {f.implication}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
