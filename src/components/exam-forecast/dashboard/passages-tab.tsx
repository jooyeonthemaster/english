"use client";

import { useMemo, useState } from "react";
import type { ForecastQuestionSummary } from "@/lib/exam-forecast/queries";
import { FORECAST_QTYPES, type ForecastPassage, type ForecastQType } from "@/lib/exam-forecast/types";
import type { PassageAnalysis, PassagePrediction } from "@/lib/exam-forecast/analysis-types";
import { FC, FAMILY_COLOR, SOURCE_COLOR, pct, serif } from "./theme";
import type { ForecastSelection } from "./use-forecast-selection";
import { QuestionDetails, QuestionPaperView, useQuestionBodies } from "./question-card";
import { EvidencePanel } from "./evidence-panel";

type Sort = "hit" | "order";

export function PassagesTab({
  slug,
  passages,
  questions,
  selection,
  focus,
  onFocus,
}: {
  slug: string;
  passages: ForecastPassage[];
  questions: ForecastQuestionSummary[];
  selection: ForecastSelection;
  focus: string | null;
  onFocus: (code: string) => void;
}) {
  const [src, setSrc] = useState<string>("전체");
  const [sort, setSort] = useState<Sort>("order");
  const list = useMemo(() => {
    const l = passages.filter((p) => src === "전체" || p.sourceGroup === src);
    if (sort === "hit") return [...l].sort((a, b) => ((b.prediction as PassagePrediction).hitLikelihood ?? 0) - ((a.prediction as PassagePrediction).hitLikelihood ?? 0));
    return l;
  }, [passages, src, sort]);
  const current = passages.find((p) => p.code === focus) ?? list[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-120px)] lg:overflow-y-auto">
        <div className="flex flex-wrap gap-1.5">
          {["전체", "교과서", "학평", "올림포스"].map((s) => (
            <button key={s} type="button" onClick={() => setSrc(s)} className="rounded-full border px-3 py-1 text-[12px] font-semibold" style={src === s ? { background: FC.ink, color: "#fff", borderColor: FC.ink } : { borderColor: FC.rule }}>
              {s}
            </button>
          ))}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="ml-auto rounded-md border bg-transparent px-2 py-1 text-[12px]" style={{ borderColor: FC.rule }}>
            <option value="order">범위 순</option>
            <option value="hit">출제 확률 순</option>
          </select>
        </div>
        <ul className="mt-3 space-y-1.5">
          {list.map((p) => {
            const pred = p.prediction as PassagePrediction;
            const active = current?.code === p.code;
            return (
              <li key={p.code}>
                <button
                  type="button"
                  onClick={() => onFocus(p.code)}
                  className="w-full rounded-lg border px-3 py-2.5 text-left transition"
                  style={{ borderColor: active ? FC.red : FC.rule, background: active ? FC.card : "transparent", boxShadow: active ? "0 1px 8px rgba(179,38,30,.12)" : undefined }}
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SOURCE_COLOR[p.sourceGroup] }} />
                    <span style={{ color: FC.sub }}>{p.code}</span>
                    <span className="ml-auto font-bold" style={{ color: (pred.hitLikelihood ?? 0) >= 0.75 ? FC.red : FC.sub }}>{pct(pred.hitLikelihood)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[13px] font-bold">{p.titleKo}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      {current ? <PassageDetail key={current.code} slug={slug} passage={current} questions={questions.filter((q) => q.passageId === current.id && q.role === "forecast")} allQuestions={questions} selection={selection} /> : null}
    </div>
  );
}

function PassageDetail({ slug, passage, questions, allQuestions, selection }: { slug: string; passage: ForecastPassage; questions: ForecastQuestionSummary[]; allQuestions: ForecastQuestionSummary[]; selection: ForecastSelection }) {
  const pred = passage.prediction as PassagePrediction;
  const ana = passage.analysis as PassageAnalysis;
  const types = [...(pred.predictedTypes ?? [])].sort((a, b) => b.probability - a.probability);
  const [showAll, setShowAll] = useState(false);
  const [openQs, setOpenQs] = useState(false);
  const bodies = useQuestionBodies(slug, openQs ? questions.map((q) => q.id) : []);
  const allSelected = questions.length > 0 && questions.every((q) => selection.has(q.id));

  return (
    <div className="min-w-0 space-y-6">
      <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
        <div className="flex flex-wrap items-center gap-3 text-[12px]" style={{ color: FC.sub }}>
          <span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: SOURCE_COLOR[passage.sourceGroup] }}>{passage.sourceGroup}</span>
          <span>{passage.sourceLabel}</span>
          <span>원래 유형 · {ana.originalType ?? "–"}</span>
          <span>{ana.wordCount ?? passage.text.split(/\s+/).length}단어</span>
          <span className="ml-auto text-[13px]">
            출제 확률 <b className={`${serif} text-[22px]`} style={{ color: FC.red }}>{pct(pred.hitLikelihood)}</b>
          </span>
        </div>
        <h2 className={`${serif} mt-2 text-[22px] font-extrabold`}>{passage.titleKo}</h2>
        {pred.topicEn ? <p className="mt-1 text-[13px] italic" style={{ color: FC.sub }}>{pred.topicEn}</p> : null}
        {pred.hitWhy ? <p className="mt-3 max-w-[90ch] text-[13.5px] leading-relaxed">{pred.hitWhy}</p> : null}
        <div className="mt-5 grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <div className={`${serif} rounded-xl border p-5 text-[14.5px] leading-[1.9]`} style={{ borderColor: FC.rule, background: FC.paper }}>
            {passage.text.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="indent-4">{para}</p>
            ))}
          </div>
          <div className="space-y-4 text-[13px] leading-relaxed">
            {pred.logicKo || ana.logicFlow ? (
              <div>
                <b>논리 흐름</b>
                <p className="mt-1 whitespace-pre-line" style={{ color: FC.sub }}>{pred.logicKo || ana.logicFlow}</p>
              </div>
            ) : null}
            {ana.keyGrammar?.length ? (
              <div>
                <b>출제 포인트 어법</b>
                <ul className="mt-1 list-disc pl-5" style={{ color: FC.sub }}>
                  {ana.keyGrammar.slice(0, 8).map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(pred.keyVocab ?? ana.keyVocab)?.length ? (
              <div>
                <b>핵심 어휘</b>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(pred.keyVocab ?? ana.keyVocab ?? []).slice(0, 18).map((v, i) => (
                    <span key={i} className="rounded border px-1.5 py-0.5 text-[12px]" style={{ borderColor: FC.rule }}>{v}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <EvidencePanel slug={slug} passage={passage} allQuestions={allQuestions} />

      <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
        <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>유형별 출제 확률 — 나온다면 이렇게 나온다</p>
        <div className="mt-4 space-y-3">
          {(showAll ? types : types.slice(0, 6)).map((t, i) => {
            const meta = FORECAST_QTYPES[t.qtype as ForecastQType];
            return (
              <div key={`${t.qtype}-${i}`} className="grid gap-2 md:grid-cols-[180px_1fr]">
                <div>
                  <div className="flex items-center gap-2 text-[13px] font-bold">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FAMILY_COLOR[meta?.family ?? ""] ?? FC.sub }} />
                    {meta?.label ?? t.qtype}
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: FC.paper }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round(t.probability * 100)}%`, background: i === 0 ? FC.red : FC.ink }} />
                  </div>
                  <div className="mt-0.5 text-[11.5px]" style={{ color: FC.sub }}>{pct(t.probability)}</div>
                </div>
                <div className="rounded-lg px-3 py-2 text-[12.5px] leading-relaxed" style={{ background: FC.paper }}>
                  <p>{t.rationale}</p>
                  {t.target ? (
                    <p className="mt-1" style={{ color: FC.sub }}>
                      <b style={{ color: FC.ink }}>출제 지점</b> <span style={{ background: FC.marker }}>{t.target}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {types.length > 6 ? (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-[12.5px] font-bold underline">
            {showAll ? "상위 6개만" : `나머지 ${types.length - 6}개 유형 더 보기`}
          </button>
        ) : null}
      </section>

      <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>이 지문의 예측 문항 {questions.length}</p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setOpenQs((v) => !v)} className="rounded-md border px-3 py-1.5 text-[12.5px] font-bold" style={{ borderColor: FC.ink }}>
              {openQs ? "문항 접기" : "문항 펼쳐 보기"}
            </button>
            <button
              type="button"
              onClick={() => (allSelected ? selection.removeMany(questions.map((q) => q.id)) : selection.addMany(questions.map((q) => q.id)))}
              className="rounded-md px-3 py-1.5 text-[12.5px] font-bold text-white"
              style={{ background: allSelected ? FC.sub : FC.red }}
            >
              {allSelected ? "모두 빼기" : "모두 담기"}
            </button>
            <a href={`/director/exam-forecast/${slug}/print?passage=${encodeURIComponent(passage.code)}`} target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: FC.ink }}>
              이 지문 문제지 인쇄
            </a>
          </div>
        </div>
        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {questions.map((q) => (
            <li key={q.id} className="rounded-xl border p-3" style={{ borderColor: selection.has(q.id) ? FC.red : FC.rule, background: FC.paper }}>
              <label className="flex cursor-pointer items-start gap-2 text-[13px]">
                <input type="checkbox" checked={selection.has(q.id)} onChange={() => selection.toggle(q.id)} className="mt-1 accent-[#b3261e]" />
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{FORECAST_QTYPES[q.qtype]?.label ?? q.qtype}</span>
                  <span className="ml-2 text-[11.5px]" style={{ color: FC.sub }}>
                    난도 {q.difficulty} · {q.points ?? "–"}점 · 정답 {q.answerShort.length <= 3 ? q.answerShort : "서술"}
                    {q.setNos.length ? ` · 봉투 ${q.setNos.join(",")}회` : ""}
                  </span>
                </span>
              </label>
              {openQs && bodies[q.id] ? (
                <div className="mt-3 overflow-x-auto rounded-lg bg-white p-3">
                  <QuestionPaperView q={bodies[q.id]} />
                  <div className="mt-3">
                    <QuestionDetails q={bodies[q.id]} />
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
