"use client";

import { useMemo, useState } from "react";
import type { ForecastQuestionSummary } from "@/lib/exam-forecast/queries";
import { FORECAST_QTYPES, type ForecastPassage } from "@/lib/exam-forecast/types";
import type { ForecastAnalysis } from "@/lib/exam-forecast/analysis-types";
import { FAMILY_COLOR, FC, serif } from "./theme";
import { QuestionDetails, QuestionPaperView, useQuestionBodies } from "./question-card";

// 기출 원본(2026 1학기 1차) — 30문항을 우리 조판 엔진으로 다시 찍어 형식 대조 + 문항별 해부 메모.

export function ReferenceTab({ slug, analysis, passages, questions }: { slug: string; analysis: ForecastAnalysis; passages: ForecastPassage[]; questions: ForecastQuestionSummary[] }) {
  const refs = useMemo(() => questions.filter((q) => q.role === "reference"), [questions]);
  const pById = useMemo(() => new Map(passages.map((p) => [p.id, p])), [passages]);
  const [openId, setOpenId] = useState<string | null>(refs[0]?.id ?? null);
  const bodies = useQuestionBodies(slug, openId ? [openId] : []);
  const transforms = new Map((analysis.transforms ?? []).map((t) => [t.examQ, t]));
  const idx = refs.findIndex((r) => r.id === openId);
  const cur = idx >= 0 ? refs[idx] : null;
  const label = (i: number) => (i >= 27 ? `논${i - 26}` : String(i + 1));
  const key = idx >= 27 ? `S${idx - 26}` : String(idx + 1);
  const t = transforms.get(key);
  const p = cur ? pById.get(cur.passageId) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-6" style={{ background: FC.card, borderColor: FC.rule }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>기출 원본 — 2026학년도 1학기 1차(4월 29일)</p>
            <h3 className={`${serif} mt-1 text-[20px] font-extrabold`}>실제 시험지 30문항을 같은 조판 엔진으로 다시 찍었다</h3>
            <p className="mt-1 text-[12.5px]" style={{ color: FC.sub }}>번호를 누르면 문항·정답·출처·원문 대조가 나온다. 봉투 모의고사가 기출과 같은 모양인지 직접 견줘 볼 수 있다.</p>
          </div>
          <a href={`/director/exam-forecast/${slug}/print?ref=1&print=0`} target="_blank" rel="noreferrer" className="rounded-md px-4 py-2 text-[13px] font-bold text-white" style={{ background: FC.ink }}>
            시험지 전체 재조판 보기(10쪽)
          </a>
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {refs.map((q, i) => {
            const meta = FORECAST_QTYPES[q.qtype];
            const active = q.id === openId;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setOpenId(q.id)}
                className="w-[64px] rounded-lg border px-1.5 py-1.5 text-left transition"
                style={{ borderColor: active ? FC.red : FC.rule, background: active ? FC.redSoft : FC.paper }}
                title={`${meta?.label} · ${q.points}점`}
              >
                <div className={`${serif} text-[15px] font-extrabold leading-none`}>{label(i)}</div>
                <div className="mt-1 h-1 rounded-full" style={{ background: FAMILY_COLOR[meta?.family ?? ""] ?? FC.sub }} />
                <div className="mt-1 truncate text-[10.5px] font-bold">{meta?.short}</div>
              </button>
            );
          })}
        </div>
      </section>

      {cur && bodies[cur.id] ? (
        <div className="grid gap-6 xl:grid-cols-[auto_1fr]">
          <div className="overflow-x-auto rounded-2xl border bg-white p-6" style={{ borderColor: FC.rule }}>
            <QuestionPaperView q={bodies[cur.id]} number={idx >= 27 ? idx - 26 : idx + 1} />
          </div>
          <div className="min-w-0 space-y-4">
            <div className="rounded-2xl border p-5 text-[13px]" style={{ background: FC.card, borderColor: FC.rule }}>
              <div className="text-[12px]" style={{ color: FC.sub }}>출처</div>
              <div className="mt-0.5 text-[15px] font-bold">{p?.sourceLabel.split(" · ").slice(1).join(" · ")}</div>
              <div className="mt-3">
                <QuestionDetails q={bodies[cur.id]} showRationale defaultOpen />
              </div>
            </div>
            {t ? (
              <div className="rounded-2xl border p-5 text-[13px]" style={{ background: FC.card, borderColor: FC.rule }}>
                <b style={{ color: FC.red }}>원문 대조</b>
                <p className="mt-1" style={{ color: FC.sub }}>
                  {t.source} · 원래 {t.from} → 시험 {t.to} · 원문 일치도 {(t.similarity * 100).toFixed(1)}%
                </p>
                <ul className="mt-2 space-y-1 leading-relaxed">
                  {t.edits.map((e, i) => (
                    <li key={i}>
                      {e.original ? <del style={{ color: FC.sub }}>{e.original.slice(0, 140)}</del> : null}
                      {e.original && e.exam ? " → " : null}
                      {e.exam ? <span style={{ background: FC.marker }}>{e.exam.slice(0, 260)}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: FC.sub }}>{openId ? "불러오는 중…" : "문항을 고르세요."}</p>
      )}
    </div>
  );
}
