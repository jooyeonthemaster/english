"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PagedPaper } from "@/components/exam-forecast/paper/paged-paper";
import type { PaperHeader, PaperItem } from "@/components/exam-forecast/paper/question-parts";
import { ForecastAnswerSheet, type AnswerItem } from "@/components/exam-forecast/paper/answer-sheet";
import { FORECAST_PAPER_FONTS_HREF } from "@/components/exam-forecast/paper/paper-css";

// 인쇄 화면 — 서체가 다 받아지고 조판이 끝나면 (자동) window.print().
// 문제지는 A4 쪽 그대로 화면에 보인다(화면 = 인쇄 = PDF). 크롬 인쇄 대화상자에서 여백 「없음」.

type Props =
  | { mode: "paper"; title: string; paper: { header: PaperHeader | null; items: PaperItem[] }; footer: { left: string; right: string }; autoPrint?: boolean; essayMode?: "exam" | "inline"; showCheckBox?: boolean; targetPages?: number }
  | { mode: "answers"; title: string; answers: { title: string; items: AnswerItem[] }; footer: { left: string; right: string }; autoPrint?: boolean };

export function ForecastPrintClient(props: Props) {
  const [pages, setPages] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const printed = useRef(false);
  const onReady = useCallback((n: number) => {
    setPages(n);
    setReady(true);
  }, []);

  useEffect(() => {
    document.title = props.title;
    if (props.mode !== "answers") return;
    let alive = true;
    document.fonts.ready.then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [props.title, props.mode]);

  useEffect(() => {
    if (!ready || printed.current || props.autoPrint === false) return;
    printed.current = true;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [ready, props.autoPrint]);

  return (
    <div data-fcp-print-ready={ready ? "1" : "0"}>
      <link rel="stylesheet" href={FORECAST_PAPER_FONTS_HREF} />
      <div className="fcp-screen-only sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-black/10 bg-[#faf7f0]/95 px-5 py-3 text-[13px] backdrop-blur">
        <span className="font-semibold text-[#1c1a17]">{props.title}</span>
        <span className="text-[#6b645a]">
          {ready
            ? `조판 완료${pages ? ` — ${pages}쪽` : ""} · 인쇄 대화상자에서 대상 「PDF로 저장」, 여백 「${props.mode === "paper" ? "없음" : "기본"}」, 「머리글과 바닥글」 끄기`
            : "서체를 받아 조판하는 중…"}
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!ready}
          className="ml-auto rounded-md bg-[#b3261e] px-4 py-1.5 font-semibold text-white shadow-sm transition hover:bg-[#8f1d17] disabled:opacity-40"
        >
          인쇄 / PDF 저장
        </button>
        <button type="button" onClick={() => window.close()} className="rounded-md border border-black/15 px-3 py-1.5 text-[#1c1a17] hover:bg-black/5">
          닫기
        </button>
      </div>
      <div className="fcp-screen-pad">
        {props.mode === "paper" ? (
          <PagedPaper header={props.paper.header} items={props.paper.items} footer={props.footer} essayMode={props.essayMode ?? "exam"} showCheckBox={props.showCheckBox ?? true} targetPages={props.targetPages} onReady={onReady} />
        ) : (
          <ForecastAnswerSheet title={props.answers.title} items={props.answers.items} />
        )}
      </div>
      <style>{`
        @media screen {
          body { background: #e9e5dc; }
          .fcp-screen-pad { padding: 24px 0 64px; }
        }
      `}</style>
    </div>
  );
}
