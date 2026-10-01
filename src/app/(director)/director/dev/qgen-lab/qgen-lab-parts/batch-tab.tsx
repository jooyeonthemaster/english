"use client";

// 배치 — ?batch=<id> 또는 목록에서 매니페스트 로드 → 큐 표 → 시작/일시정지/실패 재시도·동시성.
// Aside 계기: data-testid qgen-start-batch · qgen-pause-batch · qgen-retry-failed · qgen-batch-progress,
// window.__qgenLab(batch-runner-utils 가 상태 변화마다 갱신).

import { Download, Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ArmConfig } from "@/lib/qgen-lab/types";
import { cn } from "@/lib/utils";
import { fetchBatch, fetchRunSummaries, type BatchListItem, type MetaPassage } from "./api-utils";
import { BatchTable, type BatchFilter } from "./batch-table";
import { useBatchRunner } from "./batch-runner-utils";
import { ProgressStrip, StoredRunDetail } from "./batch-widgets";
import { fmtKrw, fmtMs, fmtUsd, STATUS_LABEL, sumNullable } from "./format-utils";
import { publishError } from "./instrument-utils";
import { RunCard } from "./run-card";
import type { LiveRunSnapshot } from "./run-store-utils";
import { median } from "./stats-utils";
import { EmptyNote, Gauge, Mono, Panel } from "./ui-bits";

const FILTERS: BatchFilter[] = ["all", "running", "error", "gate_fail", "ok", "queued", "skipped"];

export function BatchTab({
  arms,
  passages,
  batchList,
  initialBatchId,
  onReloadList,
  onRunSettled,
  onBatchLoaded,
}: {
  arms: ArmConfig[];
  passages: MetaPassage[];
  batchList: BatchListItem[];
  initialBatchId: string | null;
  onReloadList: () => void;
  onRunSettled: (snap: LiveRunSnapshot) => void;
  onBatchLoaded: (id: string) => void;
}) {
  const runner = useBatchRunner({ arms, onRunSettled });
  const [pickId, setPickId] = useState<string>(initialBatchId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipPrior, setSkipPrior] = useState(true);
  const [prior, setPrior] = useState<Awaited<ReturnType<typeof fetchRunSummaries>>>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<BatchFilter>("all");
  const { manifest, items, counts, state, concurrency, load } = runner;
  const busy = state === "running" || counts.running > 0;

  const loadBatch = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const [m, runs] = await Promise.all([fetchBatch(id), fetchRunSummaries(id).catch(() => [])]);
        setPrior(runs);
        load(m, runs, skipPrior);
        setSelectedKey(null);
        onBatchLoaded(m.id);
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("batch", m.id);
          url.searchParams.set("tab", "batch");
          window.history.replaceState(window.history.state, "", url);
        } catch {
          /* 주소 갱신 실패는 무시 */
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        publishError(`batch load ${id}: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [load, skipPrior, onBatchLoaded],
  );

  // ?batch= 자동 로드(GET 만 — 실행은 반드시 시작 버튼).
  useEffect(() => {
    if (initialBatchId) void loadBatch(initialBatchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBatchId]);

  const passageById = useMemo(() => new Map(passages.map((p) => [p.id, p])), [passages]);
  const armById = useMemo(() => new Map(arms.map((a) => [a.id, a])), [arms]);
  const selected = items.find((i) => i.key === selectedKey) ?? null;

  const totalCost = sumNullable(items.map((i) => i.costUsd));
  const medClient = median(items.filter((i) => i.status === "ok" || i.status === "gate_fail").map((i) => i.clientMs));
  const remaining = counts.queued + counts.running;
  const eta = medClient != null && remaining > 0 ? (medClient * remaining) / Math.max(1, concurrency) : null;
  const missingArms = manifest ? manifest.armIds.filter((id) => !armById.has(id)) : [];
  const missingPassages = manifest && passages.length ? manifest.passageIds.filter((id) => !passageById.has(id)) : [];

  return (
    <div className="space-y-3">
      <Panel
        title="매니페스트"
        aside={
          <button
            type="button"
            onClick={onReloadList}
            className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-stone-500 hover:text-stone-900"
          >
            <RefreshCw className="size-3" /> 목록
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select value={pickId} onValueChange={setPickId} disabled={busy}>
            <SelectTrigger className="h-[30px] min-w-[260px] border-stone-300 bg-white text-[0.75rem]">
              <SelectValue placeholder={batchList.length ? "배치 선택" : "batches/*.json 없음"} />
            </SelectTrigger>
            <SelectContent>
              {batchList.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-[0.75rem]">
                  <span className="font-mono">{b.id}</span>
                  {b.title && <span className="ml-2 text-stone-500">{b.title}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadBatch(pickId)}
            disabled={!pickId || loading || busy}
            className="h-[30px] gap-1 border-stone-300 px-2.5 text-[0.75rem]"
          >
            <Download className="size-3.5" /> {loading ? "불러오는 중…" : "불러오기"}
          </Button>
          <label className="ml-2 flex items-center gap-1.5 text-[0.75rem] text-stone-600" title="서버 runs 원장에 같은 (팔,지문,rep) ok/반려 기록이 있으면 건너뛴다">
            <Checkbox
              checked={skipPrior}
              disabled={busy}
              onCheckedChange={(v) => {
                const on = v === true;
                setSkipPrior(on);
                if (manifest) load(manifest, prior, on);
              }}
              className="border-stone-400 data-[state=checked]:border-stone-900 data-[state=checked]:bg-stone-900"
            />
            기존 기록 건너뛰기 <Mono className="text-stone-400">({prior.length})</Mono>
          </label>
          {manifest && (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => void loadBatch(manifest.id)}
              className="text-[0.6875rem] font-semibold text-stone-500 hover:text-stone-900 disabled:opacity-40"
            >
              서버 기록 다시 읽기
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-[0.75rem] text-red-700">{error}</p>}
        {manifest && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[0.8125rem] font-semibold text-stone-900">
              {manifest.title} <Mono className="ml-1 text-[0.6875rem] font-normal text-stone-500">{manifest.id}</Mono>
            </p>
            <div className="flex flex-wrap gap-1">
              <Gauge label="팔" value={manifest.armIds.length} />
              <Gauge label="지문" value={manifest.passageIds.length} />
              <Gauge label="rep" value={manifest.reps} />
              <Gauge label="순서" value={manifest.order} />
              <Gauge label="총" value={`${counts.total}회`} />
              {missingArms.length > 0 && <Gauge label="미등록 팔" value={missingArms.join(", ")} tone="warn" />}
              {missingPassages.length > 0 && <Gauge label="없는 지문" value={missingPassages.length} tone="warn" />}
            </div>
            <p className="truncate font-mono text-[0.6875rem] text-stone-500">{manifest.armIds.join(" · ")}</p>
          </div>
        )}
      </Panel>

      {manifest ? (
        <Panel title="실행" bodyClassName="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              data-testid="qgen-start-batch"
              data-state={state}
              onClick={runner.start}
              disabled={state === "running" || counts.queued === 0}
              className="h-[32px] gap-1.5 bg-stone-900 px-3 text-[0.8125rem] text-[#fffefa] hover:bg-orange-700"
            >
              <Play className="size-3.5" />
              {state === "paused" ? "재개" : "시작"} · {counts.queued}회
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="qgen-pause-batch"
              onClick={runner.pause}
              disabled={state !== "running"}
              className="h-[32px] gap-1.5 border-stone-300 px-3 text-[0.8125rem]"
            >
              <Pause className="size-3.5" /> 일시정지
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="qgen-retry-failed"
              onClick={runner.retryFailed}
              disabled={counts.error === 0}
              className="h-[32px] gap-1.5 border-stone-300 px-3 text-[0.8125rem]"
            >
              <RotateCcw className="size-3.5" /> 실패 재시도 · {counts.error}
            </Button>
            <label className="ml-2 flex items-center gap-1.5 text-[0.75rem] text-stone-600">
              동시성
              <Input
                type="number"
                min={1}
                max={12}
                value={concurrency}
                onChange={(e) => runner.setConcurrency(Number(e.target.value))}
                className="h-[30px] w-14 border-stone-300 bg-white font-mono text-[0.75rem] md:text-[0.75rem]"
              />
              <span className="text-stone-400">(매니페스트 {manifest.concurrency})</span>
            </label>
            <span className="ml-auto flex flex-wrap gap-1">
              <Gauge label="누적 비용" value={fmtUsd(totalCost)} sub={fmtKrw(totalCost)} />
              <Gauge label="중앙 체감" value={fmtMs(medClient)} />
              <Gauge label="잔여 예상" value={fmtMs(eta, 0)} tone={state === "running" ? "live" : "idle"} />
            </span>
          </div>
          <ProgressStrip counts={counts} state={state} />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "h-[24px] rounded-full border px-2.5 text-[0.6875rem] font-semibold",
                  filter === f ? "border-stone-900 bg-stone-900 text-[#fffefa]" : "border-stone-300 bg-white text-stone-600 hover:border-stone-500",
                )}
              >
                {f === "all" ? `전체 ${counts.total}` : `${STATUS_LABEL[f]} ${counts[f]}`}
              </button>
            ))}
          </div>
          <BatchTable
            items={items}
            filter={filter}
            selectedKey={selectedKey}
            onSelect={(k) => setSelectedKey((cur) => (cur === k ? null : k))}
            armLabel={(id) => armById.get(id)?.label ?? id}
            passageLabel={(id) => passageById.get(id)?.label ?? id}
          />
        </Panel>
      ) : (
        <EmptyNote>
          <Mono>.tmp-qgen-lab-2609/batches/*.json</Mono> 매니페스트를 고르거나 주소에 <Mono>?batch=&lt;id&gt;</Mono> 를 붙이세요.
        </EmptyNote>
      )}

      {selected && (
        <Panel
          title={`상세 · #${selected.idx + 1} ${selected.key}`}
          aside={
            <button type="button" onClick={() => setSelectedKey(null)} className="text-[0.6875rem] font-semibold text-stone-500 hover:text-stone-900">
              닫기
            </button>
          }
        >
          {selected.run ? (
            <RunCard
              className="max-w-[1040px]"
              key={selected.run.key}
              armId={selected.armId}
              arm={armById.get(selected.armId)}
              run={selected.run}
              passage={passageById.get(selected.passageId)?.text ?? ""}
            />
          ) : selected.runId && manifest ? (
            <StoredRunDetail
              className="max-w-[1040px]"
              batchId={manifest.id}
              runId={selected.runId}
              clientMs={selected.clientMs}
              passage={passageById.get(selected.passageId)?.text ?? ""}
            />
          ) : (
            <p className="text-[0.75rem] text-stone-600">아직 실행되지 않았습니다.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
