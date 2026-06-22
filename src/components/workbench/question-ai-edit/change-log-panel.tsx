"use client";

import { ArrowLeftRight, ListChecks, Minus, Pencil, Plus, Quote } from "lucide-react";

import { diffWords, type DiffSeg } from "@/lib/question-ai-edit/word-diff";
import type { DetailedDiffEntry, EditChange } from "./use-question-ai-edit";

// 회사 디자인 가드: Sparkles/이모지·주황/앰버 금지 → slate/blue/rose/emerald/violet.
const KIND_META: Record<
  DetailedDiffEntry["kind"],
  { label: string; cls: string; Icon: typeof Plus }
> = {
  added: { label: "추가", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: Plus },
  removed: { label: "삭제", cls: "bg-rose-50 text-rose-700 ring-rose-200", Icon: Minus },
  changed: { label: "수정", cls: "bg-blue-50 text-blue-700 ring-blue-200", Icon: Pencil },
  reordered: { label: "순서", cls: "bg-violet-50 text-violet-700 ring-violet-200", Icon: ArrowLeftRight },
};

// 단어 단위 diff 는 @/lib/question-ai-edit/word-diff 로 공유(블럭 변경 마크 펼침과 동일 로직).

function SegLine({
  segs,
  tone,
}: {
  segs: DiffSeg[];
  tone: "before" | "after";
}) {
  const base = tone === "before" ? "text-slate-500" : "text-slate-800";
  const mark =
    tone === "before"
      ? "bg-rose-100 text-rose-700 line-through decoration-rose-400/60 rounded-[3px] px-0.5"
      : "bg-emerald-100 text-emerald-800 rounded-[3px] px-0.5";
  return (
    <span className={`whitespace-pre-wrap break-words ${base}`}>
      {segs.map((sg, i) => (
        <span key={i} className={sg.changed ? mark : undefined}>
          {sg.text}
        </span>
      ))}
    </span>
  );
}

function BeforeAfter({ entry }: { entry: DetailedDiffEntry }) {
  const hasBoth =
    entry.kind === "changed" &&
    typeof entry.before === "string" &&
    typeof entry.after === "string";
  const { b, a } = hasBoth ? diffWords(entry.before!, entry.after!) : { b: [], a: [] };

  return (
    <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-[1.55]">
      {entry.before !== undefined && entry.kind !== "added" && (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-4 shrink-0 items-center rounded bg-rose-100 px-1 text-[9.5px] font-bold text-rose-700">
            전
          </span>
          {hasBoth ? (
            <SegLine segs={b} tone="before" />
          ) : (
            <span className="whitespace-pre-wrap break-words text-slate-500 line-through decoration-rose-300/60">
              {entry.before}
            </span>
          )}
        </div>
      )}
      {entry.after !== undefined && entry.kind !== "removed" && (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-4 shrink-0 items-center rounded bg-emerald-100 px-1 text-[9.5px] font-bold text-emerald-700">
            후
          </span>
          {hasBoth ? (
            <SegLine segs={a} tone="after" />
          ) : (
            <span className="whitespace-pre-wrap break-words text-slate-800">{entry.after}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── 최상단 요약: "무엇을 요청했고, 핵심적으로 무엇이 바뀌었나" ──────────────
const CHANGE_VERB: Record<EditChange["kind"], string> = {
  added: "추가",
  removed: "삭제",
  changed: "수정",
  reordered: "순서",
};
const CHANGE_CHIP: Record<EditChange["kind"], string> = {
  added: "border-emerald-200 bg-emerald-50 text-emerald-700",
  removed: "border-rose-200 bg-rose-50 text-rose-700",
  changed: "border-blue-200 bg-blue-50 text-blue-700",
  reordered: "border-violet-200 bg-violet-50 text-violet-700",
};

function EditSummaryHeader({
  editSummary,
  instruction,
  changes,
}: {
  editSummary?: string;
  instruction?: string;
  changes?: EditChange[];
}) {
  const narrative = editSummary?.trim();
  const req = instruction?.trim();
  const list = changes ?? [];
  if (!narrative && !req && list.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50/50 p-3.5">
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-blue-700">
        <ListChecks className="h-4 w-4" />
        이번 수정 요약
      </div>

      {/* AI 서술(주인공) — "요청대로 무엇을 어떻게 바꿨는지". */}
      {narrative ? (
        <p className="mt-2 whitespace-pre-line text-[13px] font-medium leading-relaxed text-slate-800">
          {narrative}
        </p>
      ) : (
        <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
          모델이 변경 서술을 제공하지 않았습니다. 아래 핵심 변경과 상세 내역을 참고하세요.
        </p>
      )}

      {/* 보조 컨텍스트 — 요청한 지시 + 핵심 변경 칩(muted). */}
      {(req || list.length > 0) && (
        <div className="mt-3 space-y-2 border-t border-blue-100 pt-2.5">
          {req && (
            <div className="flex items-start gap-1.5">
              <span className="mt-px inline-flex shrink-0 items-center gap-1 rounded bg-white/70 px-1.5 py-0.5 text-[9.5px] font-bold text-blue-500 ring-1 ring-blue-100">
                <Quote className="h-2.5 w-2.5" />
                요청
              </span>
              <span className="whitespace-pre-line text-[11.5px] leading-relaxed text-slate-500">{req}</span>
            </div>
          )}
          {list.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                변경 {list.length}곳
              </span>
              {list.map((c, i) => (
                <span
                  key={`${c.field}-${i}`}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${CHANGE_CHIP[c.kind]}`}
                >
                  {c.label}
                  <span className="font-medium opacity-60">{CHANGE_VERB[c.kind]}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChangeLogPanel({
  entries,
  editSummary,
  instruction,
  changes,
}: {
  entries: DetailedDiffEntry[];
  editSummary?: string;
  instruction?: string;
  changes?: EditChange[];
}) {
  const summary = (
    <EditSummaryHeader editSummary={editSummary} instruction={instruction} changes={changes} />
  );

  if (!entries.length) {
    return (
      <div className="flex flex-col gap-3">
        {summary}
        <div className="flex flex-col items-center justify-center px-8 py-6 text-center">
          <Pencil className="mb-2 h-5 w-5 text-slate-300" />
          <p className="text-[13px] font-semibold text-slate-500">세부 변경 내역이 없습니다</p>
          <p className="mt-1 text-[12px] text-slate-400">
            필드 단위로 추적된 변경이 없어요. 위 요약을 참고하거나 지시를 더 구체적으로 입력해 보세요.
          </p>
        </div>
      </div>
    );
  }

  // 카테고리별로 묶어 보여 준다(발문→선택지→정답→해설…).
  const order = [
    "발문",
    "선택지",
    "선택 슬롯",
    "밑줄 표현",
    "표시 단어",
    "밑줄 구간",
    "빈칸 정답",
    "빈칸",
    "정답",
    "해설",
    "오답 해설",
    "핵심 포인트",
  ];
  const sorted = [...entries].sort((x, y) => {
    const ix = order.indexOf(x.category);
    const iy = order.indexOf(y.category);
    return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
  });

  return (
    <div className="flex flex-col gap-2.5">
      {summary}
      <ol className="flex flex-col gap-2">
      {sorted.map((entry) => {
        const meta = KIND_META[entry.kind];
        const Icon = meta.Icon;
        return (
          <li key={entry.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-700 ring-1 ring-slate-200/70">
                {entry.category}
                {entry.ref ? ` ${entry.ref}` : ""}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ring-1 ${meta.cls}`}
              >
                <Icon className="h-2.5 w-2.5" />
                {meta.label}
              </span>
              {entry.note && (
                <span className="text-[10.5px] text-slate-400">{entry.note}</span>
              )}
            </div>
            <BeforeAfter entry={entry} />
          </li>
        );
      })}
      </ol>
    </div>
  );
}
