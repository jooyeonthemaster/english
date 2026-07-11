"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, GitCompare, Target } from "lucide-react";
import { koSourceLabel } from "@/lib/korean-exam-passages/format";
import {
  relationChipClass,
  relationHint,
  strengthBadgeClass,
  strengthHint,
  subGenreBadgeClass,
} from "@/lib/suneung-wanseong/format";
import type { SwLinkedExam } from "@/lib/suneung-wanseong/types";

/**
 * 연계 기출 지문 1건 — "왜 묶였는가"(rationale)를 접지 않고 항상 노출한다.
 * 이 카드가 이 화면의 핵심이므로 근거·차이·학습 포인트를 한눈에 읽히게 배치한다.
 */
export function LinkedExamCard({
  link,
  index,
  onOpenExam,
}: {
  link: SwLinkedExam;
  index: number;
  onOpenExam: (examId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const e = link.exam;
  const sourceParts = (link.sourceParts?.length ? link.sourceParts : ["통합"]).map(
    (part) => (part === "전체" ? "통합" : part),
  );
  const detailsId = `linked-exam-details-${e.id}-${index}`;

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-blue-300 hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50/60 px-3.5 py-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[10.5px] font-bold tabular-nums text-white">
          {index + 1}
        </span>
        <span
          title={strengthHint(link.strength)}
          className={
            "inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-bold " +
            strengthBadgeClass(link.strength)
          }
        >
          연계 {link.strength}
        </span>
        <span className="text-[12.5px] font-bold text-slate-800">
          {koSourceLabel(e.board)} {e.year} {e.siheng}
        </span>
        <span className="text-[11.5px] font-semibold tabular-nums text-slate-400">
          [{e.qFrom}~{e.qTo}]
        </span>
        {e.subGenre ? (
          <span
            className={
              "inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-bold " +
              subGenreBadgeClass(e.subGenre)
            }
          >
            {e.subGenre}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onOpenExam(e.id)}
          aria-label={`${koSourceLabel(e.board)} ${e.year} ${e.siheng} 기출 원문 열기`}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-semibold text-blue-600 transition hover:bg-blue-50"
        >
          <ExternalLink className="size-3.5" />
          기출 원문
        </button>
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        <p className="text-[12.5px] font-semibold leading-snug text-slate-800">
          {e.핵심주제}
        </p>

        <div
          className="flex flex-wrap items-center gap-1"
          aria-label={`연결된 수능완성 지문 부분: ${sourceParts.join(", ")}`}
        >
          <span className="text-[10.5px] font-bold text-emerald-700">
            수완 연결
          </span>
          {sourceParts.map((part, partIndex) => (
            <span
              key={`${part}-${partIndex}`}
              className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700 ring-1 ring-emerald-200"
            >
              {part}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {link.relationTypes.map((r) => (
            <span
              key={r}
              title={relationHint(r)}
              className={
                "rounded px-1.5 py-0.5 text-[10.5px] font-bold ring-1 " +
                relationChipClass(r)
              }
            >
              {r}
            </span>
          ))}
        </div>

        {/* 왜 묶였는가 — 이 화면의 존재 이유 */}
        <div className="rounded-lg border-l-2 border-blue-500 bg-blue-50/50 px-3 py-2">
          <p className="mb-1 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-blue-700">
            <GitCompare className="size-3" /> 연결 근거
          </p>
          <p className="text-[12.5px] leading-relaxed text-slate-700">
            {link.rationale}
          </p>
        </div>

        {(link.sharedConcepts.length > 0 || link.sharedKeywords.length > 0) && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10.5px] font-bold text-slate-400">공유</span>
            {link.sharedConcepts.map((c) => (
              <span
                key={`c-${c}`}
                className="rounded bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-violet-700 ring-1 ring-violet-200"
              >
                {c}
              </span>
            ))}
            {link.sharedKeywords.map((k) => (
              <span
                key={`k-${k}`}
                className="rounded bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600 ring-1 ring-slate-200"
              >
                {k}
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={open ? "연계 상세 정보 접기" : "연계 상세 정보 펼치기"}
          className="flex w-full items-center gap-1 text-[11.5px] font-semibold text-slate-500 transition hover:text-slate-700"
        >
          <ChevronDown
            className={"size-3.5 transition " + (open ? "rotate-180" : "")}
          />
          {open ? "접기" : "축자 근거 · 차이점 · 학습 포인트"}
        </button>

        {open ? (
          <div
            id={detailsId}
            className="space-y-2.5 rounded-lg bg-slate-50 px-3 py-2.5"
          >
            {link.swEvidence?.length && link.examEvidence?.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                <EvidenceList label="수완 원문 근거" items={link.swEvidence} />
                <EvidenceList label="기출 원문 근거" items={link.examEvidence} />
              </div>
            ) : null}
            {link.conceptMappings?.length ? (
              <Row label="개념 대응">
                {link.conceptMappings
                  .map(
                    (mapping) =>
                      `${mapping.swTerm} ↔ ${mapping.examTerm} (${mapping.relationship})`,
                  )
                  .join(" · ")}
              </Row>
            ) : null}
            <Row label="무엇이 다른가">{link.difference}</Row>
            <Row label="함께 보면" icon>
              {link.studyPoint}
            </Row>
            <Row label="기출 요약">{e.요약}</Row>
            <div className="flex flex-wrap gap-1">
              {e.핵심키워드.slice(0, 10).map((k) => (
                <span
                  key={k}
                  className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function EvidenceList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            key={`${index}-${item}`}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] leading-relaxed text-slate-600"
          >
            “{item}”
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({
  label,
  children,
  icon = false,
}: {
  label: string;
  children: React.ReactNode;
  icon?: boolean;
}) {
  if (!children) return null;
  return (
    <div>
      <p className="mb-0.5 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
        {icon ? <Target className="size-3" /> : null}
        {label}
      </p>
      <p className="text-[12px] leading-relaxed text-slate-700">{children}</p>
    </div>
  );
}
