"use client";

// 집계 — 팔별 n·성공률·서버 총시간 중앙/p90·클라 체감 중앙·평균 비용·반려 사유 top.
// 원천 = GET /runs?batchId= (서버 원장) ∪ 이 세션 라이브 결과(runId 로 병합 — 체감 ms 는 라이브만 안다).

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ArmConfig } from "@/lib/qgen-lab/types";
import { cn } from "@/lib/utils";
import { fetchRunSummaries, type BatchListItem, type RunSummary } from "./api-utils";
import { fmtKrw, fmtMs, fmtPct, fmtUsd, sumNullable } from "./format-utils";
import { mean, median, quantile, reasonKey, topCounts } from "./stats-utils";
import { EmptyNote, Gauge, Mono, Panel } from "./ui-bits";

export const ADHOC = "adhoc";

interface ArmAgg {
  armId: string;
  label: string;
  n: number;
  ok: number;
  gate: number;
  err: number;
  medServer: number | null;
  p90Server: number | null;
  medClient: number | null;
  nClient: number;
  meanCost: number | null;
  meanAttempts: number | null;
  reasons: { key: string; count: number }[];
}

function aggregate(runs: RunSummary[], arms: ArmConfig[], okOnlyTimes: boolean): ArmAgg[] {
  const order = new Map(arms.map((a, i) => [a.id, i]));
  const byArm = new Map<string, RunSummary[]>();
  for (const r of runs) byArm.set(r.armId, [...(byArm.get(r.armId) ?? []), r]);
  return [...byArm.entries()]
    .sort(([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b))
    .map(([armId, list]) => {
      const timed = okOnlyTimes ? list.filter((r) => r.status === "ok") : list;
      const clients = timed.map((r) => r.clientMs).filter((v): v is number => v != null);
      return {
        armId,
        label: arms.find((a) => a.id === armId)?.label ?? armId,
        n: list.length,
        ok: list.filter((r) => r.status === "ok").length,
        gate: list.filter((r) => r.status === "gate_fail").length,
        err: list.filter((r) => r.status === "error").length,
        medServer: median(timed.map((r) => r.totalMs)),
        p90Server: quantile(timed.map((r) => r.totalMs), 0.9),
        medClient: median(clients),
        nClient: clients.length,
        meanCost: mean(list.map((r) => r.costUsd)),
        meanAttempts: mean(list.map((r) => r.attempts)),
        reasons: topCounts(
          list.filter((r) => r.status !== "ok" && r.failReason).map((r) => reasonKey(r.failReason!)),
          3,
        ),
      };
    });
}

function RangeBar({ med, p90, max }: { med: number | null; p90: number | null; max: number }) {
  if (med == null || max <= 0) return null;
  return (
    <span className="relative mt-1 block h-1.5 w-full rounded-full bg-stone-100">
      {p90 != null && (
        <span className="absolute inset-y-0 left-0 rounded-full bg-stone-300" style={{ width: `${Math.min(100, (p90 / max) * 100)}%` }} />
      )}
      <span className="absolute inset-y-[-2px] w-[2px] bg-stone-900" style={{ left: `${Math.min(100, (med / max) * 100)}%` }} />
    </span>
  );
}

export function AggregateTab({
  arms,
  batchList,
  defaultSource,
  live,
}: {
  arms: ArmConfig[];
  batchList: BatchListItem[];
  defaultSource: string | null;
  live: RunSummary[];
}) {
  const [source, setSource] = useState<string>(defaultSource ?? ADHOC);
  const [server, setServer] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okOnly, setOkOnly] = useState(false);

  useEffect(() => {
    if (defaultSource) setSource(defaultSource);
  }, [defaultSource]);

  const reload = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setServer(await fetchRunSummaries(id));
    } catch (e) {
      setServer([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(source);
  }, [source, reload]);

  const merged = useMemo(() => {
    const m = new Map<string, RunSummary>();
    for (const s of server) m.set(s.runId, s);
    for (const l of live) {
      const lb = l.batchId ?? ADHOC;
      if (lb !== source) continue;
      const prev = m.get(l.runId);
      m.set(l.runId, prev ? { ...prev, ...l, clientMs: l.clientMs ?? prev.clientMs } : l);
    }
    return [...m.values()];
  }, [server, live, source]);

  const rows = useMemo(() => aggregate(merged, arms, okOnly), [merged, arms, okOnly]);
  const maxP90 = Math.max(0, ...rows.map((r) => r.p90Server ?? r.medServer ?? 0));
  const totalCost = sumNullable(merged.map((r) => r.costUsd));
  const okAll = merged.filter((r) => r.status === "ok").length;
  const sources = [{ id: ADHOC, title: "단건 비교(adhoc)" }, ...batchList.filter((b) => b.id !== ADHOC)];
  if (source !== ADHOC && !sources.some((s) => s.id === source)) sources.push({ id: source, title: null });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-[30px] min-w-[260px] border-stone-300 bg-white text-[0.75rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-[0.75rem]">
                <span className="font-mono">{s.id}</span>
                {s.title && <span className="ml-2 text-stone-500">{s.title}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => void reload(source)}
          disabled={loading}
          className="inline-flex h-[30px] items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 text-[0.75rem] font-semibold text-stone-700 hover:border-stone-500 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> 새로고침
        </button>
        <div className="flex overflow-hidden rounded-md border border-stone-300 text-[0.6875rem] font-semibold">
          {(
            [
              [false, "시간: 전체"],
              [true, "시간: 통과만"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setOkOnly(v)}
              className={cn("h-[28px] px-2.5", okOnly === v ? "bg-stone-900 text-[#fffefa]" : "bg-white text-stone-600")}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex flex-wrap gap-1">
          <Gauge label="실행" value={merged.length} />
          <Gauge label="통과" value={fmtPct(merged.length ? okAll / merged.length : null)} />
          <Gauge label="총 비용" value={fmtUsd(totalCost)} sub={fmtKrw(totalCost)} />
        </span>
      </div>
      {error && <p className="text-[0.75rem] text-red-700">{error}</p>}

      {rows.length === 0 ? (
        <EmptyNote>{loading ? "불러오는 중…" : "이 원천에 기록된 실행이 없습니다."}</EmptyNote>
      ) : (
        <Panel title={`팔별 집계 · ${source}`} bodyClassName="p-0">
          <table className="w-full border-collapse text-[0.75rem]" data-testid="qgen-aggregate-table">
            <thead className="bg-[#f3efe4] text-left text-[0.6875rem] text-stone-600">
              <tr className="border-b border-stone-300">
                <th className="px-3 py-1.5 font-semibold">팔</th>
                <th className="px-2 py-1.5 text-right font-semibold">n</th>
                <th className="px-2 py-1.5 font-semibold">성공률 (통과/반려/오류)</th>
                <th className="w-[200px] px-2 py-1.5 font-semibold">서버 총시간 중앙 · p90</th>
                <th className="px-2 py-1.5 text-right font-semibold">체감 중앙</th>
                <th className="px-2 py-1.5 text-right font-semibold">평균 비용</th>
                <th className="px-2 py-1.5 text-right font-semibold">평균 시도</th>
                <th className="px-3 py-1.5 font-semibold">반려 사유 top</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.armId} className="border-b border-stone-100 align-top" data-arm-id={r.armId}>
                  <td className="px-3 py-1.5">
                    <Mono className="font-bold text-stone-900">{r.armId}</Mono>
                    <span className="block max-w-[220px] truncate text-[0.6875rem] text-stone-500">{r.label}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Mono>{r.n}</Mono>
                  </td>
                  <td className="px-2 py-1.5">
                    <Mono className="font-semibold">{fmtPct(r.ok / r.n)}</Mono>
                    <Mono className="ml-1.5 text-[0.6875rem] text-stone-500">
                      {r.ok}/{r.gate}/{r.err}
                    </Mono>
                    <span className="mt-1 flex h-1.5 w-28 overflow-hidden rounded-full bg-stone-100">
                      <span className="bg-emerald-700" style={{ width: `${(r.ok / r.n) * 100}%` }} />
                      <span className="bg-amber-600" style={{ width: `${(r.gate / r.n) * 100}%` }} />
                      <span className="bg-red-700" style={{ width: `${(r.err / r.n) * 100}%` }} />
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Mono className="font-semibold">{fmtMs(r.medServer)}</Mono>
                    <Mono className="ml-1.5 text-stone-500">· {fmtMs(r.p90Server)}</Mono>
                    <RangeBar med={r.medServer} p90={r.p90Server} max={maxP90} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Mono>{fmtMs(r.medClient)}</Mono>
                    <Mono className="block text-[0.625rem] text-stone-400">n={r.nClient}</Mono>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Mono>{fmtUsd(r.meanCost)}</Mono>
                    <Mono className="block text-[0.625rem] text-stone-400">{fmtKrw(r.meanCost)}</Mono>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Mono>{r.meanAttempts == null ? "—" : r.meanAttempts.toFixed(2)}</Mono>
                  </td>
                  <td className="px-3 py-1.5 text-stone-700">
                    {r.reasons.length === 0 ? (
                      <span className="text-stone-300">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.reasons.map((x) => (
                          <li key={x.key} className="flex gap-1.5">
                            <Mono className="shrink-0 text-stone-400">×{x.count}</Mono>
                            <span className="break-words">{x.key}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <p className="text-[0.6875rem] text-stone-500">
        시간 = 서버 벽시계(계획+생성+재생성+검증). 체감 = 클라 실행 버튼→done(이 세션 라이브 결과, 또는 /runs 가 내려주면 그 값). p90 은 최근접 순위.
      </p>
    </div>
  );
}
