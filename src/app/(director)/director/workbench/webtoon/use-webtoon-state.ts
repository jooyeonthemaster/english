"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_WEBTOON_IMAGE_PLAN,
  type WebtoonImagePlanId,
} from "@/lib/webtoon-models";
import type {
  WebtoonRow,
  WebtoonStyleId,
  WebtoonLanguageId,
} from "./webtoon-page-types";
import { DEFAULT_WEBTOON_LANGUAGE, isActiveStatus } from "./webtoon-page-types";

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

export function useWebtoonState({
  academyId,
  subjectScope,
}: {
  academyId: string;
  subjectScope?: "KOREAN";
}) {
  void academyId;
  const listScopeQuery = subjectScope === "KOREAN" ? "&scope=KOREAN" : "";
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
    fetch(`/api/webtoons/list?limit=${MAX_RECENT}${listScopeQuery}`)
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
  }, [listScopeQuery]);

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
    async (
      passages: PassageMin[],
      style: WebtoonStyleId,
      customPrompt: string,
      language: WebtoonLanguageId = DEFAULT_WEBTOON_LANGUAGE,
      plan: WebtoonImagePlanId = DEFAULT_WEBTOON_IMAGE_PLAN,
    ): Promise<number> => {
      if (passages.length === 0) return 0;

      const passageIds = passages.map((p) => p.id);

      let resData: GenerateResponse;
      try {
        const res = await fetch("/api/ai/webtoon/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passageIds, style, language, customPrompt, plan }),
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
        return 0;
      }

      const queuedIds = (resData.queued ?? []).map((q) => q.webtoonId);
      if (queuedIds.length === 0) return 0;

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
        const refreshed = await fetch(`/api/webtoons/list?limit=${MAX_RECENT}${listScopeQuery}`)
          .then((r) => r.json() as Promise<ListResponse>)
          .catch(() => null);
        if (refreshed?.ok) setItems(refreshed.items);
      }

      toast.message(`${queuedIds.length}개 웹툰 생성을 시작했습니다.`, {
        description:
          "생성에는 약 3분이 걸려요. 다른 작업을 계속하셔도 완료되면 이 화면에 자동으로 표시됩니다.",
      });
      return queuedIds.length;
    },
    [listScopeQuery],
  );

  const handleRetry = useCallback(
    async (webtoonId: string) => {
      const target = items.find((it) => it.id === webtoonId);
      if (!target) return;
      const queued = await handleBatchGenerate(
        [{ id: target.passageId, title: target.passage.title, content: "" }],
        target.style,
        target.customPrompt ?? "",
        target.language ?? DEFAULT_WEBTOON_LANGUAGE,
      );
      // 재생성은 새 행을 만들므로(생성 API가 항상 새 row 생성), 성공 시 기존 실패 행을
      // 치워 갤러리에 실패 카드가 쌓이지 않게 한다.
      if (queued > 0 && target.status === "FAILED") {
        setItems((prev) => prev.filter((it) => it.id !== webtoonId));
      }
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

  const patchItem = useCallback((webtoonId: string, patch: Partial<WebtoonRow>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === webtoonId ? { ...it, ...patch } : it)),
    );
  }, []);

  // 검수완료 토글 — 낙관적 업데이트 후 실패 시 롤백.
  const handleToggleApprove = useCallback(
    async (webtoonId: string) => {
      const target = items.find((it) => it.id === webtoonId);
      if (!target) return;
      const next = !target.approved;
      setItems((prev) =>
        prev.map((it) => (it.id === webtoonId ? { ...it, approved: next } : it)),
      );
      try {
        const res = await fetch(`/api/webtoons/${webtoonId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved: next }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `patch ${res.status}`);
      } catch (err) {
        // 롤백
        setItems((prev) =>
          prev.map((it) =>
            it.id === webtoonId ? { ...it, approved: target.approved } : it,
          ),
        );
        toast.error(err instanceof Error ? err.message : "검수 상태 변경 실패");
      }
    },
    [items, listScopeQuery],
  );

  return {
    items,
    loading,
    handleBatchGenerate,
    handleRetry,
    handleRemove,
    handleToggleApprove,
    patchItem,
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
