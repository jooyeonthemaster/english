"use client";

import { useMemo, useState } from "react";
import type { ForecastQuestionSummary } from "@/lib/exam-forecast/queries";
import type { PassageEvidence } from "@/lib/exam-forecast/analysis-types";
import { FORECAST_QTYPES, type ForecastPassage, type ForecastQType } from "@/lib/exam-forecast/types";
import { FAMILY_COLOR, FC, pct, serif } from "./theme";
import { QuestionDetails, QuestionPaperView, useQuestionBodies } from "./question-card";

// 지문별 「왜 이렇게 예측했나」 — 같은 종류 지문을 직전 기출이 어떻게 냈는지(선례 문항)와, 유형마다 「기출 선례 ↔ 우리 예측 문항」 나란히 보기.
// 데이터: passage.prediction.evidence (scripts/exam-forecast/forecast_evidence.py, 결정론).

const RELATION: Record<string, { label: string; color: string; note: string }> = {
  "same-origin": { label: "같은 종류 지문 선례", color: FC.ok, note: "직전 기출에서 이 지문과 같은 출처·같은 원 유형 지문이 바로 이 유형으로 나왔다" },
  "same-source": { label: "같은 출처 선례", color: FC.blue, note: "같은 출처 묶음(교과서·학평·올림포스) 지문이 이 유형으로 나왔다" },
  "same-type": { label: "형식 선례", color: FC.sub, note: "기출에 이 유형 문항이 있다(다른 출처 지문)" },
  none: { label: "선례 없음", color: FC.faint, note: "직전 기출에 없던 유형 — 대비용" },
};

export function EvidencePanel({ slug, passage, allQuestions }: { slug: string; passage: ForecastPassage; allQuestions: ForecastQuestionSummary[] }) {
  const ev = (passage.prediction as { evidence?: PassageEvidence }).evidence;
  const byCode = useMemo(() => new Map(allQuestions.map((q) => [q.code, q])), [allQuestions]);
  const [open, setOpen] = useState<{ ref?: string; ours?: string } | null>(null);
  const ids = [open?.ref, open?.ours].map((c) => (c ? byCode.get(c)?.id : undefined)).filter((x): x is string => Boolean(x));
  const bodies = useQuestionBodies(slug, ids);
  if (!ev) return null;

  const refLabel = (code: string) => {
    const no = code.replace("REF-", "");
    return no.startsWith("S") ? `논술형 ${no.slice(1)}` : `${Number(no)}번`;
  };

  return (
    <section className="rounded-2xl border p-7" style={{ background: FC.card, borderColor: FC.rule }}>
      <p className="text-[12px] font-bold tracking-[0.16em]" style={{ color: FC.red }}>왜 이렇게 예측했나 — 직전 기출 선례</p>
      <p className="mt-2 text-[13.5px] leading-relaxed">
        이 지문은 <b>{passage.sourceGroup}</b> · 원 유형 묶음 <b>{ev.originFamily || "–"}</b>.{" "}
        {ev.sameOrigin.length ? (
          <>직전 기출(2026 1학기 1차)에서 같은 종류 지문이 <b style={{ color: FC.red }}>{ev.sameOrigin.length}문항</b>으로 나왔다:</>
        ) : (
          <>직전 기출에는 같은 종류 지문 문항이 없었다 — 같은 출처 묶음 문항은 {ev.sameSourceCount}개.</>
        )}
      </p>
      {ev.sameOrigin.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {ev.sameOrigin.map((r) => (
            <button
              key={r.refCode}
              type="button"
              onClick={() => setOpen({ ref: r.refCode })}
              className="rounded-lg border px-3 py-1.5 text-left text-[12.5px]"
              style={{ borderColor: open?.ref === r.refCode && !open?.ours ? FC.red : FC.rule, background: FC.paper }}
            >
              <b>{refLabel(r.refCode)}</b> {FORECAST_QTYPES[r.qtype as ForecastQType]?.label ?? r.qtype} · {r.points}점
              <span className="ml-1.5 text-[11.5px]" style={{ color: FC.sub }}>{r.source}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        {ev.types.map((t) => {
          const meta = FORECAST_QTYPES[t.qtype as ForecastQType];
          const rel = RELATION[t.relation] ?? RELATION.none;
          return (
            <div key={t.qtype} className="grid items-center gap-2 rounded-lg px-3 py-2 md:grid-cols-[200px_150px_1fr_auto]" style={{ background: FC.paper }}>
              <div className="flex items-center gap-2 text-[13px] font-bold">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FAMILY_COLOR[meta?.family ?? ""] ?? FC.sub }} />
                {meta?.label ?? t.qtype}
                <span className="text-[11.5px] font-semibold" style={{ color: FC.sub }}>{pct(t.probability)}</span>
              </div>
              <span className="w-fit rounded px-2 py-0.5 text-[11.5px] font-bold text-white" style={{ background: rel.color }} title={rel.note}>
                {rel.label}
              </span>
              <div className="flex flex-wrap gap-1.5 text-[12px]">
                {t.precedents.map((c) => (
                  <button key={c} type="button" onClick={() => setOpen({ ref: c, ours: t.ourCodes[0] })} className="rounded border px-2 py-0.5" style={{ borderColor: FC.rule, background: FC.card }}>
                    기출 {refLabel(c)}
                  </button>
                ))}
              </div>
              <div className="text-right text-[12px]">
                {t.ourCodes.length ? (
                  <button type="button" onClick={() => setOpen({ ref: t.precedents[0], ours: t.ourCodes[0] })} className="rounded-md px-2.5 py-1 font-bold text-white" style={{ background: FC.ink }}>
                    기출 ↔ 우리 문항 {t.ourCodes.length}
                  </button>
                ) : (
                  <span style={{ color: FC.faint }}>우리 문항 없음</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {open ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <ComparePane title={open.ref ? `실제 기출 ${refLabel(open.ref)}` : "기출 선례 없음"} q={open.ref ? bodies[byCode.get(open.ref)?.id ?? ""] : undefined} number={open.ref ? Number(open.ref.replace("REF-", "").replace("S", "")) || 1 : 1} tone="ref" />
          <ComparePane title={open.ours ? "이 지문으로 만든 우리 예측 문항" : "우리 문항 — 위 유형 줄의 단추로 고른다"} q={open.ours ? bodies[byCode.get(open.ours)?.id ?? ""] : undefined} number={1} tone="ours" />
        </div>
      ) : null}
    </section>
  );
}

function ComparePane({ title, q, number, tone }: { title: string; q: ReturnType<typeof useQuestionBodies>[string] | undefined; number: number; tone: "ref" | "ours" }) {
  return (
    <div className="min-w-0 rounded-xl border p-4" style={{ borderColor: tone === "ref" ? FC.red : FC.ink, background: "#fff" }}>
      <p className={`${serif} mb-3 text-[14px] font-extrabold`} style={{ color: tone === "ref" ? FC.red : FC.ink }}>{title}</p>
      {q ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <QuestionPaperView q={q} number={number} />
          </div>
          <QuestionDetails q={q} showRationale defaultOpen={tone === "ours"} />
        </div>
      ) : (
        <p className="text-[12.5px]" style={{ color: FC.sub }}>불러오는 중이거나 고른 문항이 없습니다.</p>
      )}
    </div>
  );
}
