"use client";

import { Minus, Pencil, Plus, ArrowLeftRight } from "lucide-react";

import type { DetailedDiffEntry } from "./use-question-ai-edit";

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

// ── 단어 단위 diff (LCS) — 무엇이 바뀌었는지 인라인 강조 ───────────────────
interface Seg {
  text: string;
  changed: boolean;
}
function tokenize(t: string): string[] {
  // 공백을 유지하면서 토큰화(공백도 토큰) → 재조합 시 원문 보존.
  return t.split(/(\s+)/).filter((x) => x.length > 0);
}
function diffWords(before: string, after: string): { b: Seg[]; a: Seg[] } {
  const B = tokenize(before);
  const A = tokenize(after);
  // 너무 길면(병리적 비용) 강조 생략 — 통짜 표시.
  if (B.length + A.length > 600) {
    return { b: [{ text: before, changed: true }], a: [{ text: after, changed: true }] };
  }
  const m = B.length;
  const n = A.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = B[i] === A[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const b: Seg[] = [];
  const a: Seg[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (B[i] === A[j]) {
      b.push({ text: B[i], changed: false });
      a.push({ text: A[j], changed: false });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      b.push({ text: B[i], changed: true });
      i++;
    } else {
      a.push({ text: A[j], changed: true });
      j++;
    }
  }
  while (i < m) b.push({ text: B[i++], changed: true });
  while (j < n) a.push({ text: A[j++], changed: true });
  return { b, a };
}

function SegLine({
  segs,
  tone,
}: {
  segs: Seg[];
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

export function ChangeLogPanel({ entries }: { entries: DetailedDiffEntry[] }) {
  if (!entries.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <Pencil className="mb-2 h-5 w-5 text-slate-300" />
        <p className="text-[13px] font-semibold text-slate-500">변경된 내용이 없습니다</p>
        <p className="mt-1 text-[12px] text-slate-400">
          AI가 기존 문제와 동일한 결과를 냈어요. 지시를 더 구체적으로 입력해 보세요.
        </p>
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
  );
}
