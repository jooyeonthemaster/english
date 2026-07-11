"use client";

import { useState } from "react";
import { FileText, Layers, Link2, ListChecks, Loader2 } from "lucide-react";
import { difficultyBadgeClass } from "@/lib/korean-exam-passages/format";
import {
  qRangeLabel,
  relationChipClass,
  subGenreBadgeClass,
} from "@/lib/suneung-wanseong/format";
import type { KoAnalysis } from "@/lib/korean-exam-passages/types";
import type {
  SwDetail,
  SwPassagePart,
  SwRelationType,
} from "@/lib/suneung-wanseong/types";
import { LinkedExamCard } from "./linked-exam-card";

type Section = "passage" | "analysis" | "problems" | "links";

/** 선택된 수능완성 지문의 상세 — 지문/분석/문항/연계 기출. */
export function DetailPanel({
  detail,
  loading,
  error,
  onRetry,
  onOpenExam,
}: {
  detail: SwDetail | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenExam: (examId: string) => void;
}) {
  const [view, setView] = useState<{
    passageId: string;
    section: Section;
    partLabel: string | null;
  }>({ passageId: "", section: "links", partLabel: null });

  if (loading && !detail) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (error && !detail) {
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center"
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
          <Link2 className="size-6" />
        </span>
        <p className="text-[13px] font-semibold text-slate-700">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Link2 className="size-6" />
        </span>
        <p className="text-[13px] font-semibold text-slate-600">
          왼쪽에서 수능완성 지문을 선택하세요
        </p>
      </div>
    );
  }

  const { passage: p, problems, links } = detail;
  // 다른 지문으로 전환되면 파생 기본값을 즉시 사용해 탭과 분석 대상을 통합으로 리셋한다.
  const currentView =
    view.passageId === p.id
      ? view
      : { passageId: p.id, section: "links" as Section, partLabel: null };
  const section = currentView.section;
  const activePartLabel = currentView.partLabel;
  const activePart =
    activePartLabel === null
      ? undefined
      : p.parts.find(
          (part) => part.label === activePartLabel && Boolean(part.analysis),
        );
  const activeAnalysis = activePart?.analysis ?? p.analysis;

  const TABS: { key: Section; label: string; icon: typeof FileText; count?: number }[] = [
    { key: "links", label: "연계 기출", icon: Link2, count: links.length },
    { key: "passage", label: "지문", icon: FileText },
    { key: "analysis", label: "심층 분석", icon: Layers },
    { key: "problems", label: "원문 문항", icon: ListChecks, count: problems.length },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 헤더 */}
      <div className="shrink-0 border-b border-slate-100 bg-white px-5 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-700">
            {p.roundLabel}
          </span>
          <span className="text-[11.5px] font-bold tabular-nums text-slate-400">
            {qRangeLabel(p.qFrom, p.qTo)}
          </span>
          {p.subGenre ? (
            <span
              className={
                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-bold " +
                subGenreBadgeClass(p.subGenre)
              }
            >
              {p.subGenre}
            </span>
          ) : null}
          {p.difficulty ? (
            <span
              className={
                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-bold " +
                difficultyBadgeClass(p.difficulty)
              }
            >
              난이도 {p.difficulty}
            </span>
          ) : null}
          {p.isPaired ? (
            <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
              (가)(나) 복합
            </span>
          ) : null}
          <span className="ml-auto text-[10.5px] font-medium tabular-nums text-slate-400">
            {p.wordCount.toLocaleString()}자 · 문항 {p.nProblems}
          </span>
        </div>
        <h2 className="mt-1.5 text-[15px] font-bold leading-snug text-slate-900">
          {p.analysis["핵심주제"]}
        </h2>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-slate-500">
          <p>{p.jaejae}</p>
          <SourcePages passage={p} />
        </div>

        <div
          className="mt-2.5 overflow-x-auto"
          aria-label="지문 상세 보기"
        >
          <div className="flex min-w-max items-center gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const on = section === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() =>
                    setView({
                      passageId: p.id,
                      section: t.key,
                      partLabel: currentView.partLabel,
                    })
                  }
                  aria-current={on ? "page" : undefined}
                  aria-label={`${t.label}${typeof t.count === "number" ? ` ${t.count}개` : ""}`}
                  className={
                    "-mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[12.5px] font-semibold transition " +
                    (on
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-slate-500 hover:text-slate-700")
                  }
                >
                  <Icon className="size-3.5" />
                  {t.label}
                  {typeof t.count === "number" ? (
                    <span
                      className={
                        "rounded-full px-1.5 text-[10px] font-bold tabular-nums " +
                        (on
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-500")
                      }
                    >
                      {t.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {section === "links" ? (
          links.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-slate-500">
              연계된 기출 지문이 없습니다.
            </p>
          ) : (
            <>
              <p className="mb-2.5 text-[12px] leading-relaxed text-slate-500">
                이 수능완성 지문을 기준으로, 국어 기출 독서 지문 코퍼스에서{" "}
                <span className="font-bold text-slate-700">{links.length}개</span>를
                주제·제재·핵심개념 축으로 연결했습니다. 각 카드의{" "}
                <span className="font-semibold text-blue-700">연결 근거</span>는 왜 두
                지문이 묶였는지를 설명합니다.
              </p>
              <LinkStats links={links} />
              <ul className="space-y-2.5">
                {links.map((l, i) => (
                  <LinkedExamCard
                    key={`${p.id}:${l.examPassageId}`}
                    link={l}
                    index={i}
                    onOpenExam={onOpenExam}
                  />
                ))}
              </ul>
            </>
          )
        ) : null}

        {section === "passage" ? (
          <article className="mx-auto max-w-3xl">
            {p.isPaired && p.parts.length > 0 ? (
              <div className="space-y-5">
                {p.parts.map((part, index) => {
                  const headingId = `${p.id}-part-${index}`;
                  return (
                    <section
                      key={`${part.label}-${index}`}
                      aria-labelledby={headingId}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                    >
                      <h3
                        id={headingId}
                        className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[13px] font-bold text-slate-800"
                      >
                        {part.label}
                        <span className="ml-1.5 text-[10.5px] font-semibold text-slate-400">
                          개별 지문
                        </span>
                      </h3>
                      <p className="whitespace-pre-wrap px-4 py-3.5 text-[13.5px] leading-[1.9] text-slate-800">
                        {part.text}
                      </p>
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-[13.5px] leading-[1.9] text-slate-800">
                {p.passageText}
              </p>
            )}
            {p.footnotes.length > 0 ? (
              <ul className="mt-4 space-y-0.5 border-t border-slate-100 pt-3">
                {p.footnotes.map((f, i) => (
                  <li key={i} className="text-[11.5px] text-slate-500">
                    {f}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ) : null}

        {section === "analysis" ? (
          <div className="mx-auto max-w-3xl">
            {p.isPaired && p.parts.length > 0 ? (
              <AnalysisSelector
                passageId={p.id}
                parts={p.parts}
                activeLabel={activePart?.label ?? null}
                onSelect={(partLabel) =>
                  setView({
                    passageId: p.id,
                    section: "analysis",
                    partLabel,
                  })
                }
              />
            ) : null}
            <div className="space-y-3">
              <AnalysisFields analysis={activeAnalysis} />
            </div>
          </div>
        ) : null}

        {section === "problems" ? (
          <ol className="mx-auto max-w-3xl space-y-5">
            {problems.map((q) => (
              <li key={q.qNum} className="text-[13px]">
                <p className="font-bold text-slate-900">
                  {q.qNum}. {q.stem}
                  {q.point === 3 ? (
                    <span className="ml-1 text-[11.5px] font-semibold text-slate-400">
                      [3점]
                    </span>
                  ) : null}
                  <span className="ml-1.5 text-[10.5px] font-medium tabular-nums text-slate-300">
                    {q.code}
                  </span>
                </p>
                {q.bogi ? (
                  <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <p className="mb-1 text-[10.5px] font-bold text-slate-400">
                      〈보기〉
                    </p>
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">
                      {q.bogi}
                    </p>
                  </div>
                ) : null}
                <ol className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-slate-700">
                  {q.choices.map((c, i) => (
                    <li key={i}>
                      <span className="mr-1 text-slate-400">
                        {"①②③④⑤"[i] ?? i + 1}
                      </span>
                      {c}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
            <li className="pt-2 text-[11.5px] text-slate-400">
              정답과 해설은 EBS 수능완성 별책에 있어 이 자료에는 포함되지 않습니다.
            </li>
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/** 연계 요약 스트립 — 강/중/약 분포 + 연계 축 분포. */
function LinkStats({ links }: { links: SwDetail["links"] }) {
  const strong = links.filter((l) => l.strength === "강").length;
  const mid = links.filter((l) => l.strength === "중").length;
  const weak = links.filter((l) => l.strength === "약").length;
  const relCount = new Map<SwRelationType, number>();
  for (const l of links)
    for (const r of l.relationTypes) relCount.set(r, (relCount.get(r) ?? 0) + 1);
  const rels = Array.from(relCount.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold">
        <span className="text-slate-400">강도</span>
        <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10.5px] font-bold text-white">
          강 {strong}
        </span>
        <span className="rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10.5px] font-bold text-sky-700">
          중 {mid}
        </span>
        <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-slate-500">
          약 {weak}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[11.5px]">
        <span className="font-semibold text-slate-400">연계 축</span>
        {rels.map(([r, c]) => (
          <span
            key={r}
            className={
              "rounded px-1.5 py-0.5 text-[10.5px] font-bold ring-1 " +
              relationChipClass(r)
            }
          >
            {r} {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function SourcePages({ passage }: { passage: SwDetail["passage"] }) {
  const pdf = pageRange("PDF", passage.pdfPageFrom, passage.pdfPageTo);
  const print = pageRange("교재", passage.printPageFrom, passage.printPageTo);
  const label = [pdf, print].filter(Boolean).join(" · ");
  if (!label) return null;
  return (
    <span
      aria-label={`출처 페이지: ${label}`}
      className="text-[10.5px] font-medium tabular-nums text-slate-400"
    >
      {label}
    </span>
  );
}

function pageRange(
  prefix: string,
  from: number | undefined,
  to: number | undefined,
): string | null {
  const start = from ?? to;
  if (start === undefined) return null;
  const end = to ?? start;
  return `${prefix} ${start}${end !== start ? `~${end}` : ""}쪽`;
}

function AnalysisSelector({
  passageId,
  parts,
  activeLabel,
  onSelect,
}: {
  passageId: string;
  parts: SwPassagePart[];
  activeLabel: string | null;
  onSelect: (partLabel: string | null) => void;
}) {
  return (
    <div className="mb-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
      <div
        className="grid min-w-max grid-flow-col auto-cols-fr gap-1"
        role="group"
        aria-label="심층 분석 대상 지문 선택"
      >
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label="통합 심층 분석 보기"
          aria-pressed={activeLabel === null}
          aria-current={activeLabel === null ? "true" : undefined}
          className={analysisSegmentClass(activeLabel === null)}
        >
          통합
        </button>
        {parts.map((part, index) => {
          const active = activeLabel === part.label;
          const available = Boolean(part.analysis);
          return (
            <button
              key={`${passageId}-${part.label}-${index}`}
              type="button"
              onClick={() => onSelect(part.label)}
              disabled={!available}
              title={available ? undefined : "개별 분석을 준비 중입니다."}
              aria-label={`${part.label} 지문 심층 분석 보기`}
              aria-pressed={active}
              aria-current={active ? "true" : undefined}
              className={
                analysisSegmentClass(active) +
                (!available ? " cursor-not-allowed opacity-45" : "")
              }
            >
              {part.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function analysisSegmentClass(active: boolean): string {
  return (
    "min-w-[76px] rounded-lg px-4 py-2 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
    (active
      ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
      : "text-slate-500 hover:bg-white/70 hover:text-slate-700")
  );
}

/** 통합/개별 분석이 동일한 21필드 표현을 공유하도록 한 곳에서 렌더링한다. */
function AnalysisFields({ analysis: a }: { analysis: KoAnalysis }) {
  return (
    <>
      <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-3.5 py-3">
        <div className="mb-1.5 flex flex-wrap gap-1">
          {[
            a["갈래"],
            a["세부영역"],
            `난이도 ${a["난이도"]}`,
            `분석 품질 ${a["추출품질"] === "good" ? "정상" : a["추출품질"]}`,
          ].map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="rounded bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-blue-700 ring-1 ring-blue-100"
            >
              {item}
            </span>
          ))}
        </div>
        <p className="text-[13px] font-bold leading-relaxed text-slate-900">
          {a["핵심주제"]}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
          제재 · {a["제재"]}
        </p>
      </div>

      <Field label="요약">{a["요약"]}</Field>
      <Field label="논지 전개 구조">{a["논지전개구조"]}</Field>
      <Field label="정보 구조 유형">{a["정보구조유형"]}</Field>
      <Field label="서술 방식">{a["서술방식"].join(" · ")}</Field>
      <Field label="배경지식 영역">{a["배경지식영역"]}</Field>
      <Field label="난이도 근거">{a["난이도근거"]}</Field>
      <Field label="출제 의도">{a["출제의도"]}</Field>
      <Field label="오답 함정">{a["오답함정유형"]}</Field>
      {a["상호텍스트"] ? (
        <Field label="상호텍스트">{a["상호텍스트"]}</Field>
      ) : null}

      <Block label="핵심 개념">
        <ul className="space-y-1.5">
          {a["핵심개념"].map((c, i) => (
            <li key={i} className="text-[12.5px] leading-relaxed text-slate-700">
              <span className="font-bold text-slate-900">{c["용어"]}</span> —{" "}
              {c["정의"]}
            </li>
          ))}
        </ul>
      </Block>

      <Block label="핵심 문장 (지문 원문)">
        <ul className="space-y-1.5">
          {a["핵심문장"].map((s, i) => (
            <li
              key={i}
              className="border-l-2 border-slate-300 pl-2.5 text-[12.5px] leading-relaxed text-slate-700"
            >
              {s}
            </li>
          ))}
        </ul>
      </Block>

      <Chips label="핵심 키워드" items={a["핵심키워드"]} />
      <Chips label="인물 · 이론" items={a["고유명사_인물_이론"]} />
      <Chips label="연계 배경지식" items={a["연계배경지식"]} />

      <Block label="딸린 문항 유형">
        <ul className="space-y-0.5">
          {a["딸린문항유형"].map((q) => (
            <li key={q["번호"]} className="text-[12.5px] text-slate-700">
              <span className="font-bold tabular-nums">{q["번호"]}번</span> —{" "}
              {q["유형"]}
            </li>
          ))}
        </ul>
      </Block>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3.5 py-2.5">
      <p className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="text-[12.5px] leading-relaxed text-slate-700">{children}</p>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3.5 py-3">
      <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="px-0.5">
      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
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
