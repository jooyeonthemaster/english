"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import {
  galaeBadgeClass,
} from "@/lib/korean-exam-passages/format";
import type { KoPassage, KoProblemDetail } from "@/lib/korean-exam-passages/types";

/** 갈래·난이도 등 소형 배지 — 라이브러리·트렌드 대시보드 공용. */
export function Badge({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-bold " +
        className
      }
    >
      {children}
    </span>
  );
}

/**
 * 지문 상세 모달(지문 원문 + 심층 분석 + 원문 문제) — 기출 지문 라이브러리와
 * 문학 출제 트렌드 대시보드가 공유한다.
 */
export function DetailModal({
  passage: p,
  fetchDetail,
  onClose,
}: {
  passage: KoPassage;
  fetchDetail: (id: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const a = p.analysis;
  const [problems, setProblems] = useState<KoProblemDetail | null>(null);
  const [loadingP, setLoadingP] = useState(false);

  const loadProblems = async () => {
    if (problems || loadingP) return;
    setLoadingP(true);
    const d = (await fetchDetail(p.id)) as KoProblemDetail | null;
    setProblems(d);
    setLoadingP(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={galaeBadgeClass(p.galae)}>{p.galae}</Badge>
            {p.subGenre ? (
              <Badge className="text-slate-600 bg-slate-100 border-slate-200">
                {p.subGenre}
              </Badge>
            ) : null}
            <span className="text-[13px] font-bold text-slate-800">{p.title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              지문
            </h3>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
              {p.passageText}
            </p>
          </section>

          {a ? (
            <section className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                심층 분석
              </h3>
              <Field label="제재">{a["제재"]}</Field>
              <Field label="핵심 주제">{a["핵심주제"]}</Field>
              <Field label="요약">{a["요약"]}</Field>
              <Field label="논지 전개">{a["논지전개구조"]}</Field>
              <Field label="배경지식 영역">{a["배경지식영역"]}</Field>
              <Field label="출제 의도">{a["출제의도"]}</Field>
              <Field label="오답 함정">{a["오답함정유형"]}</Field>
              {a["핵심개념"]?.length ? (
                <div>
                  <p className="mb-1 text-[11px] font-bold text-slate-500">핵심 개념</p>
                  <ul className="space-y-1">
                    {a["핵심개념"].map((c, i) => (
                      <li key={i} className="text-[12px] text-slate-700">
                        <span className="font-semibold">{c["용어"]}</span> —{" "}
                        {c["정의"]}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <ChipRow label="핵심 키워드" items={a["핵심키워드"]} />
              <ChipRow label="연계 배경지식" items={a["연계배경지식"]} />
              <ChipRow label="인물·이론" items={a["고유명사_인물_이론"]} />
            </section>
          ) : null}

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                원문 문제 {p.nProblems ? `(${p.nProblems})` : ""}
              </h3>
              {!problems ? (
                <button
                  type="button"
                  onClick={loadProblems}
                  className="text-[11.5px] font-semibold text-blue-600 hover:underline"
                >
                  {loadingP ? (
                    <Loader2 className="inline size-3.5 animate-spin" />
                  ) : (
                    "문제 보기"
                  )}
                </button>
              ) : null}
            </div>
            {problems ? (
              <ol className="space-y-3">
                {problems.rawProblems.map((q) => (
                  <li key={q.qNum} className="text-[12.5px]">
                    <p className="font-semibold text-slate-800">
                      {q.qNum}. {q.stem}
                      {q.point ? (
                        <span className="ml-1 text-[11px] text-slate-400">
                          [{q.point}점]
                        </span>
                      ) : null}
                    </p>
                    {q.bogi ? (
                      <p className="mt-1 rounded bg-slate-50 p-2 text-[11.5px] text-slate-600">
                        &lt;보기&gt; {q.bogi}
                      </p>
                    ) : null}
                    <ol className="mt-1 space-y-0.5 text-slate-600">
                      {q.choices.map((c, i) => (
                        <li key={i}>
                          {"①②③④⑤"[i] ?? i + 1} {c}
                          {problems.answerKey[String(q.qNum)] === i + 1 ? (
                            <span className="ml-1 text-[10.5px] font-bold text-emerald-600">
                              정답
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <div className="text-[12px]">
      <span className="font-bold text-slate-500">{label}</span>{" "}
      <span className="text-slate-700">{children}</span>
    </div>
  );
}

function ChipRow({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((k, i) => (
          <span
            key={i}
            className="rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200"
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
