"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PanelBottomOpen } from "lucide-react";

import { QueueDrawerContext } from "./_components/queue-drawer-context";
import { QueueDrawer } from "./_components/shared/queue-drawer";

const MANAGE_PATH = "/director/workbench/passages/import/jobs";

export default function ImportLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // QueuePanel highlights the job whose id is in the URL — keeps the
  // drawer's "active" row aligned with whichever job is currently being
  // viewed on the manage page.
  const activeJobId = searchParams?.get("jobId") ?? null;

  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const triggerRefresh = useCallback(
    () => setRefreshKey((k) => k + 1),
    [],
  );

  const handleOpenJob = useCallback(
    (id: string) => {
      router.push(`${MANAGE_PATH}?jobId=${id}`);
      setOpen(false);
    },
    [router],
  );

  const handleDeleteActiveJob = useCallback(() => {
    router.push(MANAGE_PATH);
    triggerRefresh();
  }, [router, triggerRefresh]);

  const contextValue = useMemo(
    () => ({ open, setOpen, toggle, refreshKey, triggerRefresh }),
    [open, toggle, refreshKey, triggerRefresh],
  );

  return (
    <QueueDrawerContext.Provider value={contextValue}>
      {children}

      <button
        type="button"
        onClick={toggle}
        className={
          "fixed bottom-24 right-8 z-40 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] font-bold shadow-lg motion-safe:transition-all motion-safe:duration-150 " +
          (open
            ? "border-blue-500 bg-blue-600 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700")
        }
        aria-pressed={open}
      >
        <PanelBottomOpen className="size-4" aria-hidden="true" />
        작업 목록
      </button>

      <QueueDrawer
        open={open}
        activeJobId={activeJobId}
        refreshKey={refreshKey}
        onClose={() => setOpen(false)}
        onDeleteActiveJob={handleDeleteActiveJob}
        onOpenJob={handleOpenJob}
      />
    </QueueDrawerContext.Provider>
  );
}
