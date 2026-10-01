"use client";

import { FC } from "./theme";
import type { ForecastSelection } from "./use-forecast-selection";

/** 하단 고정 장바구니 — 고른 문항을 기출 동형 시험지/정답지로 인쇄 */
export function SelectionTray({ slug, selection }: { slug: string; selection: ForecastSelection }) {
  const n = selection.ids.length;
  if (n === 0) return null;
  const mc = selection.summaries.filter((q) => q.kind === "MC").length;
  const base = `/director/exam-forecast/${slug}/print?q=${selection.printQuery}`;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t shadow-[0_-6px_24px_rgba(0,0,0,.08)]" style={{ background: FC.card, borderColor: FC.rule }}>
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-6 py-3">
        <span className="rounded-full px-3 py-1 text-[13px] font-bold text-white" style={{ background: FC.red }}>
          {n}문항 선택
        </span>
        <span className="text-[13px]" style={{ color: FC.sub }}>
          선택형 {mc} · 서술형 {n - mc} — 고른 순서대로 번호가 매겨집니다
        </span>
        <div className="ml-auto flex gap-2">
          <a href={base} target="_blank" rel="noreferrer" className="rounded-md px-4 py-2 text-[13px] font-bold text-white" style={{ background: FC.ink }}>
            시험지로 인쇄·PDF
          </a>
          <a href={`${base}&answers=1`} target="_blank" rel="noreferrer" className="rounded-md border px-4 py-2 text-[13px] font-bold" style={{ borderColor: FC.ink, color: FC.ink }}>
            정답·해설지
          </a>
          <button type="button" onClick={selection.clear} className="rounded-md px-3 py-2 text-[13px]" style={{ color: FC.sub }}>
            비우기
          </button>
        </div>
      </div>
    </div>
  );
}
