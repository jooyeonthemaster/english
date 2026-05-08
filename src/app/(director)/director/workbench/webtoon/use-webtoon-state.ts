"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { WebtoonRow, WebtoonStyleId } from "./webtoon-page-types";
import { isActiveStatus } from "./webtoon-page-types";

interface ListResponse {
  ok: boolean;
  items: WebtoonRow[];
}

interface GenerateResponse {
  ok: boolean;
  error?: string;
  balance?: number;
  required?: number;
  queued?: Array<{
    webtoonId: string;
    passageId: string;
    passageTitle: string;
    status: "PENDING" | "GENERATING" | "FAILED";
    error?: string;
  }>;
}

const POLL_INTERVAL_MS = 2500;
const MAX_RECENT = 30;

interface PassageMin {
  id: string;
  title: string;
  content: string;
}

export function useWebtoonState({ academyId }: { academyId: string }) {
  void academyId;
  const [items, setItems] = useState<WebtoonRow[]>([]);
  const [loading, setLoading] = useState(true);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const activeIdsRef = useRef<string[]>([]);
  const activeKey = items
    .filter((it) => isActiveStatus(it.status))
    .map((it) => it.id)
    .join(",");

  useEffect(() => {
    isMountedRef.current = true;
    setLoading(true);
    fetch(`/api/webtoons/list?limit=${MAX_RECENT}`)
      .then((r) => r.json() as Promise<ListResponse>)
      .then((data) => {
        if (!isMountedRef.current) return;
        if (data.ok && Array.isArray(data.items)) {
          setItems(data.items);
        }
      })
      .catch(() => {
        if (isMountedRef.current) toast.error("웹툰 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (isMountedRef.current) setLoading(false);
      });

    return () => {
      isMountedRef.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    const activeIds = activeKey.length > 0 ? activeKey.split(",") : [];
    activeIdsRef.current = activeIds;
    if (activeIds.length === 0) {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }
    if (pollTimer.current) return;

    const tick = async () => {
      pollTimer.current = null;
      if (!isMountedRef.current) return;

      try {
        const ids = activeIdsRef.current;
        if (ids.length === 0) return;
        const fresh = await Promise.all(
          ids.map((id) =>
            fetch(`/api/webtoons/${id}`)
              .then((r) => r.json())
              .then((d) => (d.ok ? (d.webtoon as WebtoonRow) : null))
              .catch(() => null),
          ),
        );
        if (!isMountedRef.current) return;

        const freshRows = fresh.filter((row): row is WebtoonRow => row !== null);
        if (freshRows.length > 0) {
          const byId = new Map(freshRows.map((it) => [it.id, it]));
          setItems((prev) => prev.map((it) => byId.get(it.id) ?? it));
        }
      } finally {
        if (isMountedRef.current && activeIdsRef.current.length > 0) {
          pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    };

    pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
  }, [activeKey]);

  const handleBatchGenerate = useCallback(
    async (passages: PassageMin[], style: WebtoonStyleId, customPrompt: string) => {
      if (passages.length === 0) return;

      const passageIds = passages.map((p) => p.id);

      let resData: GenerateResponse;
      try {
        const res = await fetch("/api/ai/webtoon/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passageIds, style, customPrompt }),
        });
        resData = await res.json();

        if (res.status === 402) {
          toast.error(
            `크레딧이 부족합니다. 보유 ${resData.balance ?? "?"} / 필요 ${
              resData.required ?? "?"
            }. ${resData.queued?.length ?? 0}개는 큐에 추가되었습니다.`,
          );
        } else if (!res.ok || !resData.ok) {
          throw new Error(resData.error || `generate ${res.status}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "요청 실패";
        toast.error(`생성 요청 실패: ${message}`);
        return;
      }

      const queuedIds = (resData.queued ?? []).map((q) => q.webtoonId);
      if (queuedIds.length === 0) return;

      try {
        const fresh = await Promise.all(
          queuedIds.map((id) =>
            fetch(`/api/webtoons/${id}`)
              .then((r) => r.json())
              .then((d) => (d.ok ? (d.webtoon as WebtoonRow) : null))
              .catch(() => null),
          ),
        );
        const newRows = fresh.filter((r): r is WebtoonRow => r !== null);
        setItems((prev) => mergeRows(newRows, prev));
      } catch {
        const refreshed = await fetch(`/api/webtoons/list?limit=${MAX_RECENT}`)
          .then((r) => r.json() as Promise<ListResponse>)
          .catch(() => null);
        if (refreshed?.ok) setItems(refreshed.items);
      }

      toast.message(`${queuedIds.length}개 웹툰 생성을 시작했습니다.`, {
        description: "완료되면 이 화면에 자동으로 표시됩니다.",
      });
    },
    [],
  );

  const handleRetry = useCallback(
    async (webtoonId: string) => {
      const target = items.find((it) => it.id === webtoonId);
      if (!target) return;
      await handleBatchGenerate(
        [{ id: target.passageId, title: target.passage.title, content: "" }],
        target.style,
        target.customPrompt ?? "",
      );
    },
    [items, handleBatchGenerate],
  );

  const handleRemove = useCallback(async (webtoonId: string) => {
    try {
      const res = await fetch(`/api/webtoons/${webtoonId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `delete ${res.status}`);
      }
      setItems((prev) => prev.filter((it) => it.id !== webtoonId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "삭제 실패";
      toast.error(message);
    }
  }, []);

  return {
    items,
    loading,
    handleBatchGenerate,
    handleRetry,
    handleRemove,
  };
}

function mergeRows(newRows: WebtoonRow[], prev: WebtoonRow[]) {
  const seen = new Set<string>();
  const merged: WebtoonRow[] = [];

  for (const row of [...newRows, ...prev]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }

  return merged.slice(0, MAX_RECENT);
}
