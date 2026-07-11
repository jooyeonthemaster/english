"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SwDetail,
  SwFacets,
  SwListResponse,
  SwPassage,
  SwRelationType,
} from "@/lib/suneung-wanseong/types";
import type { KoPassage } from "@/lib/korean-exam-passages/types";

const ENDPOINT = "/api/korean/suneung-wanseong";

export interface SwFilters {
  rounds: Set<number>;
  subGenres: Set<string>;
  difficulties: Set<string>;
  relationTypes: Set<SwRelationType>;
  keywords: Set<string>;
}

const EMPTY: SwFilters = {
  rounds: new Set(),
  subGenres: new Set(),
  difficulties: new Set(),
  relationTypes: new Set(),
  keywords: new Set(),
};

function csv<T>(s: Set<T>): string | undefined {
  return s.size > 0 ? Array.from(s).join(",") : undefined;
}

export interface SuneungWanseongApi {
  loading: boolean;
  error: string | null;
  retryList: () => void;
  items: SwPassage[];
  total: number;
  facets: SwFacets | null;
  filters: SwFilters;
  searchInput: string;
  setSearchInput: (v: string) => void;
  toggle: <K extends keyof SwFilters>(
    key: K,
    value: SwFilters[K] extends Set<infer V> ? V : never,
  ) => void;
  clearFilters: () => void;
  activeFilterCount: number;
  /** 사용자가 명시적으로 고른 지문(모바일 상세 오버레이 트리거). */
  selectedId: string | null;
  /** 실제로 상세에 표시되는 지문 — 미선택이면 목록의 첫 지문. */
  effectiveId: string | null;
  select: (id: string | null) => void;
  detail: SwDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  retryDetail: () => void;
  fetchExam: (examId: string) => Promise<KoPassage | null>;
}

/** 수능완성 지문 분석 브라우저 상태 — 목록 질의 + 상세(문항·연계) 로딩. */
export function useSuneungWanseong(): SuneungWanseongApi {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SwPassage[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<SwFacets | null>(null);
  const [filters, setFilters] = useState<SwFilters>(EMPTY);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [listRequestVersion, setListRequestVersion] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailResult, setDetailResult] = useState<{
    requestKey: string;
    detail: SwDetail | null;
    error: string | null;
  } | null>(null);
  const [detailRequestVersion, setDetailRequestVersion] = useState(0);

  const examCache = useRef(new Map<string, KoPassage>());

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const r = csv(filters.rounds);
    if (r) params.set("rounds", r);
    const sg = csv(filters.subGenres);
    if (sg) params.set("subGenres", sg);
    const df = csv(filters.difficulties);
    if (df) params.set("difficulties", df);
    const rt = csv(filters.relationTypes);
    if (rt) params.set("relationTypes", rt);
    const kw = csv(filters.keywords);
    if (kw) params.set("keywords", kw);

    // Query changes intentionally begin a new visible request boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`${ENDPOINT}?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("목록을 불러오지 못했습니다.");
        return (await res.json()) as SwListResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setFacets(data.facets);
        setError(null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, filters, listRequestVersion]);

  const retryList = useCallback(() => {
    setError(null);
    setListRequestVersion((version) => version + 1);
  }, []);

  // 상세에 표시할 지문 — 명시 선택이 목록에 없으면 첫 지문으로 대체(파생값, effect 아님).
  const effectiveId = useMemo(() => {
    if (selectedId && items.some((p) => p.id === selectedId)) return selectedId;
    return items[0]?.id ?? null;
  }, [selectedId, items]);
  const detailRequestKey = effectiveId
    ? `${effectiveId}:${detailRequestVersion}`
    : null;

  useEffect(() => {
    if (!effectiveId || !detailRequestKey) return;
    let cancelled = false;
    fetch(`${ENDPOINT}?detail=${encodeURIComponent(effectiveId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("상세를 불러오지 못했습니다.");
        return (await res.json()) as SwDetail;
      })
      .then((d) => {
        if (!cancelled) {
          setDetailResult({ requestKey: detailRequestKey, detail: d, error: null });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setDetailResult({
            requestKey: detailRequestKey,
            detail: null,
            error:
              cause instanceof Error ? cause.message : "상세를 불러오지 못했습니다.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detailRequestKey, effectiveId]);

  const retryDetail = useCallback(() => {
    setDetailRequestVersion((version) => version + 1);
  }, []);

  const toggle = useCallback<SuneungWanseongApi["toggle"]>((key, value) => {
    setFilters((prev) => {
      const next = new Set(prev[key] as Set<unknown>);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [key]: next } as SwFilters;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY);
    setSearchInput("");
  }, []);

  const activeFilterCount = useMemo(
    () =>
      filters.rounds.size +
      filters.subGenres.size +
      filters.difficulties.size +
      filters.relationTypes.size +
      filters.keywords.size +
      (q ? 1 : 0),
    [filters, q],
  );

  const fetchExam = useCallback(async (examId: string) => {
    const cached = examCache.current.get(examId);
    if (cached) return cached;
    const res = await fetch(`${ENDPOINT}?exam=${encodeURIComponent(examId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { passage: KoPassage };
    examCache.current.set(examId, data.passage);
    return data.passage;
  }, []);

  return {
    loading,
    error,
    retryList,
    items,
    total,
    facets,
    filters,
    searchInput,
    setSearchInput,
    toggle,
    clearFilters,
    activeFilterCount,
    selectedId,
    effectiveId,
    select: setSelectedId,
    // 응답이 도착하기 전 이전 지문의 상세가 잠깐 보이는 것을 막는다.
    detail:
      detailResult?.requestKey === detailRequestKey ? detailResult.detail : null,
    detailLoading: Boolean(
      detailRequestKey && detailResult?.requestKey !== detailRequestKey,
    ),
    detailError:
      detailResult?.requestKey === detailRequestKey ? detailResult.error : null,
    retryDetail,
    fetchExam,
  };
}
