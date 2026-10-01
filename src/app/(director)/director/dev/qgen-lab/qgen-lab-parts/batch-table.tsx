"use client";

// 배치 큐 표 — 상태·클라시간·서버시간·시도·비용·정답·반려사유. 실행 중 행은 자기 스토어만 구독한다.

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import type { BatchItem, BatchItemStatus } from "./batch-runner-utils";
import { fmtMs, fmtUsd } from "./format-utils";
import type { LabRun } from "./run-store-utils";
import { useTicker } from "./run-timeline";
import { Mono, StatusBadge } from "./ui-bits";

function LiveElapsed({ run }: { run: LabRun }) {
  const snap = useSyncExternalStore(run.subscribe, run.getSnapshot, run.getSnapshot);
  const running = snap.status === "running";
  const now = useTicker(running, 500);
  if (!running) return <Mono>{fmtMs(snap.timing.doneMs)}</Mono>;
  const a = snap.attempts[snap.attempts.length - 1];
  const phase =
    snap.phase === "connecting"
      ? "접속"
      : snap.phase === "planning"
        ? "계획"
        : snap.phase === "retrying"
          ? "재시도"
          : a && a.firstContentMs != null
            ? `${a.n}차 작성`
            : a
              ? `${a.n}차 사고`
              : "대기";
  return (
    <span className="inline-flex items-center gap-1.5 text-orange-700">
      <Mono>{fmtMs(now - snap.t0)}</Mono>
      <span className="text-[0.625rem]">{phase}</span>
    </span>
  );
}

export type BatchFilter = "all" | BatchItemStatus;

export function BatchTable({
  items,
  armLabel,
  passageLabel,
  selectedKey,
  onSelect,
  filter,
}: {
  items: BatchItem[];
  armLabel: (id: string) => string;
  passageLabel: (id: string) => string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  filter: BatchFilter;
}) {
  const rows = filter === "all" ? items : items.filter((i) => i.status === filter);
  return (
    <div className="max-h-[560px] overflow-auto rounded-md border border-stone-300 bg-white">
      <table className="w-full border-collapse text-[0.75rem]">
        <thead className="sticky top-0 z-[1] bg-[#f3efe4] text-left text-[0.6875rem] text-stone-600">
          <tr className="border-b border-stone-300">
            <th className="px-2 py-1.5 font-semibold">#</th>
            <th className="px-2 py-1.5 font-semibold">상태</th>
            <th className="px-2 py-1.5 font-semibold">팔</th>
            <th className="px-2 py-1.5 font-semibold">지문</th>
            <th className="px-2 py-1.5 text-right font-semibold">rep</th>
            <th className="px-2 py-1.5 text-right font-semibold">클라</th>
            <th className="px-2 py-1.5 text-right font-semibold">서버</th>
            <th className="px-2 py-1.5 text-right font-semibold">시도</th>
            <th className="px-2 py-1.5 text-right font-semibold">비용</th>
            <th className="px-2 py-1.5 font-semibold">정답</th>
            <th className="px-2 py-1.5 font-semibold">반려 사유</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={11} className="px-2 py-6 text-center text-stone-400">
                항목 없음
              </td>
            </tr>
          )}
          {rows.map((it) => (
            <tr
              key={it.key}
              data-testid={`qgen-batch-row-${it.idx}`}
              data-status={it.status}
              data-key={it.key}
              onClick={() => onSelect(it.key)}
              className={cn(
                "cursor-pointer border-b border-stone-100 align-top hover:bg-[#faf7ef]",
                selectedKey === it.key && "bg-[#f3efe4]",
                it.status === "running" && "bg-orange-50/40",
              )}
            >
              <td className="px-2 py-1 text-stone-400">
                <Mono>{it.idx + 1}</Mono>
              </td>
              <td className="px-2 py-1">
                <StatusBadge status={it.status} />
                {it.tries > 1 && <Mono className="ml-1 text-[0.625rem] text-stone-400">×{it.tries}</Mono>}
              </td>
              <td className="px-2 py-1" title={armLabel(it.armId)}>
                <Mono className="font-semibold text-stone-900">{it.armId}</Mono>
              </td>
              <td className="max-w-[180px] truncate px-2 py-1" title={passageLabel(it.passageId)}>
                <Mono className="text-stone-700">{it.passageId}</Mono>
              </td>
              <td className="px-2 py-1 text-right">
                <Mono>{it.rep}</Mono>
              </td>
              <td className="px-2 py-1 text-right whitespace-nowrap">
                {it.status === "running" && it.run ? <LiveElapsed run={it.run} /> : <Mono>{fmtMs(it.clientMs)}</Mono>}
              </td>
              <td className="px-2 py-1 text-right">
                <Mono>{fmtMs(it.serverMs)}</Mono>
              </td>
              <td className="px-2 py-1 text-right">
                <Mono>{it.attempts ?? "—"}</Mono>
              </td>
              <td className="px-2 py-1 text-right">
                <Mono>{fmtUsd(it.costUsd)}</Mono>
              </td>
              <td className="px-2 py-1">
                <Mono>{it.answerLabel ?? "—"}</Mono>
              </td>
              <td className="max-w-[340px] px-2 py-1 text-stone-600">
                <span className="line-clamp-2 break-words" title={it.failReason ?? undefined}>
                  {it.failReason ?? ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
