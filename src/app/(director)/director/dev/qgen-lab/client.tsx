"use client";

// qgen-lab 클라이언트 셸 — /meta 로드, 탭 3개(단건 비교·배치·집계), 라이브 결과 레지스트리.
// 세 탭은 forceMount(숨김만) — 탭을 옮겨도 진행 중 스트림·배치 큐가 언마운트되지 않는다.
// localStorage 엔 UI 기본값만(탭·선택). 결과는 서버 runs 원장에 있다.

import { useCallback, useEffect, useRef, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ALL_ARMS } from "@/lib/qgen-lab/arms";
import { AggregateTab } from "./qgen-lab-parts/aggregate-tab";
import {
  fetchBatchList,
  fetchMeta,
  summarizeResult,
  type BatchListItem,
  type LabMeta,
  type RunSummary,
} from "./qgen-lab-parts/api-utils";
import { BatchTab } from "./qgen-lab-parts/batch-tab";
import { HeaderBar } from "./qgen-lab-parts/header-bar";
import { initInstrument, publishError } from "./qgen-lab-parts/instrument-utils";
import type { LiveRunSnapshot } from "./qgen-lab-parts/run-store-utils";
import { SingleTab } from "./qgen-lab-parts/single-tab";

export type LabTab = "single" | "batch" | "agg";

const TAB_PREF = "qgen-lab:tab:v1";
const TABS: { id: LabTab; label: string }[] = [
  { id: "single", label: "단건 비교" },
  { id: "batch", label: "배치" },
  { id: "agg", label: "집계" },
];

export function QgenLabClient({
  initialTab,
  initialBatchId,
}: {
  initialTab: LabTab | null;
  initialBatchId: string | null;
}) {
  const [tab, setTab] = useState<LabTab>(initialTab ?? (initialBatchId ? "batch" : "single"));
  const [meta, setMeta] = useState<LabMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [batchList, setBatchList] = useState<BatchListItem[]>([]);
  const [live, setLive] = useState<RunSummary[]>([]);
  const [aggSource, setAggSource] = useState<string | null>(initialBatchId);
  const spendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      setMeta(await fetchMeta());
      setMetaError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMetaError(msg);
      publishError(`meta: ${msg}`);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  const loadBatchList = useCallback(async () => {
    try {
      setBatchList(await fetchBatchList());
    } catch (e) {
      publishError(`batches: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => {
    initInstrument();
    void loadMeta();
    void loadBatchList();
  }, [loadMeta, loadBatchList]);

  // 탭 기본값 복원(주소에 tab/batch 가 없을 때만).
  useEffect(() => {
    if (initialTab || initialBatchId) return;
    try {
      const saved = window.localStorage.getItem(TAB_PREF);
      if (saved === "single" || saved === "batch" || saved === "agg") setTab(saved);
    } catch {
      /* 무시 */
    }
  }, [initialTab, initialBatchId]);

  const changeTab = (v: string) => {
    const next = (TABS.find((t) => t.id === v)?.id ?? "single") as LabTab;
    setTab(next);
    try {
      window.localStorage.setItem(TAB_PREF, next);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* 무시 */
    }
  };

  const onRunSettled = useCallback(
    (snap: LiveRunSnapshot) => {
      if (snap.status === "error" && snap.error) publishError(`${snap.armId}/${snap.passageId}: ${snap.error}`);
      // 비용 캡 계기 갱신(연속 완료는 한 번으로 묶는다).
      if (spendTimer.current) clearTimeout(spendTimer.current);
      spendTimer.current = setTimeout(() => void loadMeta(), 1500);
      if (snap.status === "aborted" || !snap.runId) return;
      const summary: RunSummary = snap.result
        ? summarizeResult(snap.result, snap.timing.doneMs)
        : {
            runId: snap.runId,
            batchId: snap.batchId,
            armId: snap.armId,
            passageId: snap.passageId,
            rep: snap.rep,
            status: "error",
            totalMs: null,
            attempts: snap.attempts.length || null,
            costUsd: null,
            failReason: snap.error,
            answerLabel: null,
            clientMs: snap.timing.doneMs,
          };
      setLive((prev) => [...prev.filter((x) => x.runId !== summary.runId), summary]);
    },
    [loadMeta],
  );

  const onBatchLoaded = useCallback((id: string) => setAggSource(id), []);

  useEffect(
    () => () => {
      if (spendTimer.current) clearTimeout(spendTimer.current);
    },
    [],
  );

  const arms = meta?.arms?.length ? meta.arms : ALL_ARMS;
  const passages = meta?.passages ?? [];

  return (
    <TooltipProvider delayDuration={200}>
      <div
        data-qgen-lab
        className="min-w-[1080px] space-y-4 rounded-xl border border-stone-300 bg-[#f6f4ee] p-5 text-[0.8125rem] text-stone-900"
      >
        <HeaderBar meta={meta} loading={metaLoading} error={metaError} onRefresh={() => void loadMeta()} />

        <Tabs value={tab} onValueChange={changeTab} className="gap-4">
          <TabsList variant="line" className="h-auto gap-0 border-b border-stone-300 p-0">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                data-testid={`qgen-tab-${t.id}`}
                className="h-[34px] rounded-none px-4 text-[0.8125rem] font-semibold text-stone-500 after:bg-orange-600 data-[state=active]:text-stone-950"
              >
                {t.label}
                {t.id === "agg" && live.length > 0 && (
                  <span className="ml-1 font-mono text-[0.6875rem] text-stone-400">{live.length}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="single" forceMount className="data-[state=inactive]:hidden">
            <SingleTab arms={arms} passages={passages} onRunSettled={onRunSettled} />
          </TabsContent>
          <TabsContent value="batch" forceMount className="data-[state=inactive]:hidden">
            <BatchTab
              arms={arms}
              passages={passages}
              batchList={batchList}
              initialBatchId={initialBatchId}
              onReloadList={() => void loadBatchList()}
              onRunSettled={onRunSettled}
              onBatchLoaded={onBatchLoaded}
            />
          </TabsContent>
          <TabsContent value="agg" forceMount className="data-[state=inactive]:hidden">
            <AggregateTab arms={arms} batchList={batchList} defaultSource={aggSource} live={live} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
