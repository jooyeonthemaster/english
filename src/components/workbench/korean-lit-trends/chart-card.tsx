"use client";

// 차트 카드 공용 셸 — 제목·리드 문장·차트 본문·표 보기 토글(접근성 표 뷰 쌍둥이).

import { useState } from "react";
import { Table2, ChartColumn } from "lucide-react";

export interface TableView {
  cols: string[];
  rows: (string | number)[][];
}

export function ChartCard({
  title,
  lead,
  table,
  hint,
  children,
}: {
  title: string;
  lead?: string;
  /** 모든 차트는 표 뷰 쌍둥이를 갖는다(색 없이도 값 접근 가능). */
  table?: TableView;
  /** 차트 하단 보조 설명(클릭 안내 등). */
  hint?: string;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold text-slate-900">{title}</h3>
          {lead ? (
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
              {lead}
            </p>
          ) : null}
        </div>
        {table ? (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50"
            aria-pressed={showTable}
          >
            {showTable ? (
              <>
                <ChartColumn className="size-3.5" /> 차트
              </>
            ) : (
              <>
                <Table2 className="size-3.5" /> 표
              </>
            )}
          </button>
        ) : null}
      </div>

      {showTable && table ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                {table.cols.map((c) => (
                  <th key={c} className="px-2 py-1.5 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 text-slate-700">
                  {r.map((v, j) => (
                    <td
                      key={j}
                      className={
                        "px-2 py-1.5 " +
                        (j > 0 ? "tabular-nums" : "font-medium")
                      }
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}

      {hint && !showTable ? (
        <p className="mt-2 text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </section>
  );
}

/** 섹션 헤더 — 번호·제목·서사 리드(설명이 자연스럽게 이어지는 골격). */
export function SectionHead({
  no,
  title,
  children,
}: {
  no: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="max-w-5xl">
      <p className="text-[11px] font-bold tracking-[0.18em] text-blue-600">
        {no}
      </p>
      <h2 className="mt-1 text-[18px] font-bold leading-snug text-slate-900">
        {title}
      </h2>
      {children ? (
        <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-slate-600">
          {children}
        </div>
      ) : null}
    </div>
  );
}
