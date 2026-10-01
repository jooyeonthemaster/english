"use client";

import { useEffect, useState } from "react";
import type { ForecastQuestion } from "@/lib/exam-forecast/types";
import { FORECAST_QTYPES } from "@/lib/exam-forecast/types";
import { QuestionBlock } from "@/components/exam-forecast/paper/question-parts";
import { FORECAST_BLOCK_CSS, FORECAST_PAPER_FONTS_HREF } from "@/components/exam-forecast/paper/paper-css";
import { renderInline, splitParagraphs } from "@/components/exam-forecast/paper/markup";
import { FC } from "./theme";

// 문항 하나를 시험지 서체·조판 그대로 보여 주는 카드(단 폭 90.5mm 고정) + 정답·해설·출제 근거.

let cssInjected = false;
function usePaperCss() {
  useEffect(() => {
    if (cssInjected || typeof document === "undefined") return;
    cssInjected = true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FORECAST_PAPER_FONTS_HREF;
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = FORECAST_BLOCK_CSS;
    document.head.appendChild(style);
  }, []);
}

export function QuestionPaperView({ q, number }: { q: ForecastQuestion; number?: number }) {
  usePaperCss();
  const essay = q.kind === "ESSAY";
  return (
    <div className="fcp-root" style={{ width: "90.4mm", maxWidth: "100%" }}>
      <QuestionBlock
        item={{
          key: q.id,
          number: essay ? null : number ?? 1,
          essayNo: essay ? number ?? 1 : null,
          points: q.points,
          qtype: q.qtype,
          body: { ...q.body, groupKey: undefined, stem: q.body.stem || q.body.groupStem || "" },
        }}
      />
    </div>
  );
}

export function QuestionDetails({ q, showRationale = true, defaultOpen = false }: { q: ForecastQuestion; showRationale?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const shortAnswer = q.answer.length <= 3;
  return (
    <div className="text-[13px] leading-relaxed">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded px-2 py-0.5 text-[12px] font-bold text-white" style={{ background: FC.red }}>
          정답 {shortAnswer ? q.answer : "서술형"}
        </span>
        <span className="text-[12px]" style={{ color: FC.sub }}>
          {FORECAST_QTYPES[q.qtype]?.label ?? q.qtype} · 난도 {"●".repeat(q.difficulty)}
          {"○".repeat(Math.max(0, 5 - q.difficulty))}
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="ml-auto text-[12px] font-semibold underline" style={{ color: FC.ink }}>
          {open ? "해설 접기" : "해설·근거 보기"}
        </button>
      </div>
      {open ? (
        <div className="mt-2 space-y-2">
          {!shortAnswer ? (
            <p>
              <b>모범답안</b> {renderInline(q.answer, `a-${q.id}`)}
            </p>
          ) : null}
          {splitParagraphs(q.explanation).map((p, i) => (
            <p key={i}>{renderInline(p, `e-${q.id}-${i}`)}</p>
          ))}
          {showRationale && q.rationale ? (
            <div className="rounded-md border-l-4 px-3 py-2" style={{ borderColor: FC.red, background: FC.redSoft }}>
              <b style={{ color: FC.red }}>왜 이렇게 나온다고 보나</b>
              <p className="mt-1">{renderInline(q.rationale, `r-${q.id}`)}</p>
            </div>
          ) : null}
          {q.transform?.baseChanges?.length ? (
            <div className="rounded-md px-3 py-2" style={{ background: FC.paper }}>
              <b>원문 대비 변형</b>
              <ul className="mt-1 list-disc pl-5">
                {q.transform.baseChanges.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              {q.transform.targetRationale ? (
                <p className="mt-1">
                  <b>출제 지점</b> {q.transform.targetRationale}
                </p>
              ) : null}
              {q.transform.distractorDesign ? (
                <p className="mt-1">
                  <b>오답 설계</b> {q.transform.distractorDesign}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** 본문 지연 조회 훅 — 요약만 들고 있다가 펼칠 때 API 로(60개씩) */
export function useQuestionBodies(slug: string, ids: string[]) {
  const [map, setMap] = useState<Record<string, ForecastQuestion>>({});
  const key = ids.join(",");
  useEffect(() => {
    const need = ids.filter((id) => !map[id]);
    if (need.length === 0) return;
    let alive = true;
    (async () => {
      for (let i = 0; i < need.length; i += 60) {
        const chunk = need.slice(i, i + 60);
        const res = await fetch(`/api/exam-forecast/${slug}/questions?ids=${chunk.join(",")}`);
        if (!res.ok) continue;
        const json = (await res.json()) as { questions: ForecastQuestion[] };
        if (!alive) return;
        setMap((prev) => ({ ...prev, ...Object.fromEntries(json.questions.map((q) => [q.id, q])) }));
      }
    })();
    return () => {
      alive = false;
    };
    // 요청 키는 id 목록 문자열 — map 갱신으로 재요청하지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, key]);
  return map;
}
