"use client";

// 인라인 기출 브라우저 — 데이터 훅(정본 docs/gichul-question-bank-spec.md §11.3·§11.8).
//
// 소유: 필터 상태·페이지·목록 fetch. 체크/미리보기는 소유하지 않는다(체크 = 호스트 콜백, 미리보기 = 팝오버가
// 열릴 때 bank-preview.tsx 가 스스로 받는다 — 행 memo 를 깨지 않기 위해).
//
// 계약
// - 목록: GET /api/exam-passages/questions?q&yearFrom&yearTo&exams&grades&boards&types&points&sort&page&pageSize=40
//   `points`·`sort` 는 단위 S 가 서버에 추가 중 — 실어 보내되 서버가 무시해도 동작한다(그때는 배점 필터가
//   서버에서 안 걸리고 정렬은 최신순 고정일 뿐, 목록은 깨지지 않는다).
// - keep-previous: 재조회 중 data 를 비우지 않는다(비우면 매 필터 클릭마다 스켈레톤 플래시 — §11.3 금지).
// - 필터 변경마다 AbortController 로 직전 요청 취소. effect 정리에서 abort 하므로 StrictMode 2중 실행에도
//   요청은 1개만 살아남는다. AbortError 는 오류로 취급하지 않는다(취소는 사용자 행위의 결과).
// - 검색은 250ms 디바운스, 그 외 필터는 즉시. 필터가 바뀌면 page=1.
// - 「선택만 보기」(onlyIds): `?ids=` 로 선택분 전부를 페이지 무관하게 받는다(서버가 필터·페이지를 무시
//   하고 ids 순서대로 돌려준다 — question-bank.ts:135). 선택이 0개면 요청하지 않고 빈 목록.
//   서버 ids 상한이 150(EXAM_BANK_IMPORT_MAX, route.ts:58 slice)이라 그 이상은 150 단위 청크로 **병렬** fetch 해
//   items 를 순서대로 이어 붙인다 — 청크 없이 보내면 151번째부터 조용히 잘린다.
//   onlyIds 는 패널이 진입 시점 스냅샷(useState)으로 고정한다 — 해제는 패널의 로컬 필터가 맡아 재요청이 없다.
//
// ⚠ 함정
// - 필터 상태는 훅 state 다(모듈 스코프 금지). 패널이 hidden 으로 유지 마운트되므로 언마운트 없이 보존된다.
// - 훅은 서버 액션을 부르지 않는다.
// - setLoading 은 외부 시스템(API) 동기화 플래그 — 파생 상태가 아니라 의도적 set(use-exam-question-bank 관례).
// - 반환 객체는 useMemo — BankInlineFilters/BankInlineActiveChips 가 memo 이고 `api` 하나를 prop 으로 받으므로
//   매 렌더 새 객체를 돌려주면 두 memo 가 전부 무효다(§11.1 「매 렌더 새 api 객체」 팬아웃 재발).

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  EXAM_BANK_IMPORT_MAX,
  EXAM_BANK_PAGE_SIZE,
  type ExamBankFacets,
  type ExamBankListResponse,
  type ExamBankQNum,
  type ExamBankRow,
} from "@/lib/exam-passages/question-bank-types";
import { bankPassageIdsToPrime, isBankItemPrimed, primeBankItems, primeBankPassages, primeBankSets } from "@/lib/exam-passages/question-bank-client-builder";
import { examBankRowMemberIds } from "@/lib/exam-passages/question-bank-grouping";
import { EXAM_BANK_INLINE_DEFAULT_FILTERS, type ExamBankInlineFilters } from "./types";

const SEARCH_DEBOUNCE_MS = 250;
const LIST_FAIL_MESSAGE = "기출 문항을 불러오지 못했습니다.";

type ArrayFilterKey = "exams" | "boards" | "grades" | "typeGroups";

function toggleValue<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException ? err.name === "AbortError" : (err as { name?: string })?.name === "AbortError";
}

async function fetchJson<T>(url: string, signal: AbortSignal, fallbackMessage: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", signal });
  if (!res.ok) {
    let message = fallbackMessage;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* 본문 없음 */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export interface UseExamBankInlineOptions {
  /** 「선택만 보기」 — null 이면 필터 목록, 배열이면 그 id 들만(`?ids=`) */
  onlyIds: readonly string[] | null;
}

export function useExamBankInline({ onlyIds }: UseExamBankInlineOptions) {
  // ── 필터 ──────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<ExamBankInlineFilters>(EXAM_BANK_INLINE_DEFAULT_FILTERS);
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQDebounced(filters.q.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [filters.q]);

  // 디바운스된 검색어가 실제로 바뀐 순간에만 page=1(마운트·동일값 재설정엔 무반응 — 렌더 중 전이 판정).
  const [prevQ, setPrevQ] = useState(qDebounced);
  if (prevQ !== qDebounced) {
    setPrevQ(qDebounced);
    setPage(1);
  }

  const setQuery = useCallback((q: string) => setFilters((f) => ({ ...f, q })), []);
  const setYearRange = useCallback((from: number | null, to: number | null) => {
    // 시작 > 끝이면 자동 교환(§11.3-2).
    const [lo, hi] = from !== null && to !== null && from > to ? [to, from] : [from, to];
    setFilters((f) => ({ ...f, yearFrom: lo, yearTo: hi }));
    setPage(1);
  }, []);
  const toggleIn = useCallback((key: ArrayFilterKey, v: string) => {
    setFilters((f) => ({ ...f, [key]: toggleValue(f[key], v) }));
    setPage(1);
  }, []);
  const clearKey = useCallback((key: ArrayFilterKey | "qNums") => {
    setFilters((f) => ({ ...f, [key]: [] }));
    setPage(1);
  }, []);
  const toggleQNum = useCallback((v: ExamBankQNum) => {
    setFilters((f) => ({ ...f, qNums: toggleValue(f.qNums, v) }));
    setPage(1);
  }, []);
  const setSort = useCallback((sort: ExamBankInlineFilters["sort"]) => {
    setFilters((f) => (f.sort === sort ? f : { ...f, sort }));
    setPage(1);
  }, []);
  const resetFilters = useCallback(() => {
    setFilters(EXAM_BANK_INLINE_DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const hasActiveFilters =
    filters.q.trim() !== "" ||
    filters.yearFrom !== null ||
    filters.yearTo !== null ||
    filters.exams.length > 0 ||
    filters.boards.length > 0 ||
    filters.grades.length > 0 ||
    filters.typeGroups.length > 0 ||
    filters.qNums.length > 0;

  // ── 목록 조회 ──────────────────────────────────────────────────────────
  const [data, setData] = useState<ExamBankListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  // onlyIds 는 패널의 진입 시점 스냅샷 — 내용이 같으면 같은 문자열이라 요청 키가 안정된다(재조회 0).
  const onlyIdsKey = onlyIds ? onlyIds.join(",") : null;

  // 요청 URL 목록(query string). 필터 모드는 1개, 선택만 보기는 150 단위 청크(서버 ids 상한) — 병렬로 받아 잇는다.
  const paramsList = useMemo<string[]>(() => {
    if (onlyIdsKey !== null) {
      // 선택 0개면 요청 없이 빈 목록(아래 effect 가 판정) — 빈 ids= 는 서버가 「필터 없음」으로 읽는다.
      if (onlyIdsKey === "") return [];
      const ids = onlyIdsKey.split(",");
      const out: string[] = [];
      for (let i = 0; i < ids.length; i += EXAM_BANK_IMPORT_MAX) {
        const p = new URLSearchParams();
        p.set("ids", ids.slice(i, i + EXAM_BANK_IMPORT_MAX).join(","));
        out.push(p.toString());
      }
      return out;
    }
    const p = new URLSearchParams();
    if (qDebounced) p.set("q", qDebounced);
    if (filters.yearFrom !== null) p.set("yearFrom", String(filters.yearFrom));
    if (filters.yearTo !== null) p.set("yearTo", String(filters.yearTo));
    if (filters.exams.length) p.set("exams", filters.exams.join(","));
    if (filters.boards.length) p.set("boards", filters.boards.join(","));
    if (filters.grades.length) p.set("grades", filters.grades.join(","));
    if (filters.typeGroups.length) p.set("types", filters.typeGroups.join(","));
    if (filters.qNums.length) p.set("qNums", filters.qNums.join(","));
    if (filters.sort !== "latest") p.set("sort", filters.sort);
    p.set("page", String(page));
    p.set("pageSize", String(EXAM_BANK_PAGE_SIZE));
    return [p.toString()];
  }, [
    onlyIdsKey,
    qDebounced,
    filters.yearFrom,
    filters.yearTo,
    filters.exams,
    filters.boards,
    filters.grades,
    filters.typeGroups,
    filters.qNums,
    filters.sort,
    page,
  ]);

  // 선택 0개인 「선택만 보기」 — 서버 왕복 없이 빈 목록(아래 파생값이 처리, effect 는 요청만 건너뛴다).
  // data 는 keep-previous 로 남겨 facets(필터 옵션)가 사라지지 않는다.
  const emptyPicked = onlyIdsKey === "";

  useEffect(() => {
    if (paramsList.length === 0) return;
    const controller = new AbortController();
    // 외부 시스템(API) 동기화용 로딩 플래그 — 파생 상태가 아니라 의도적 set(use-exam-passage-library 관례).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    Promise.all(
      paramsList.map((params) =>
        fetchJson<ExamBankListResponse>(`/api/exam-passages/questions?${params}`, controller.signal, LIST_FAIL_MESSAGE),
      ),
    )
      .then((responses) => {
        if (controller.signal.aborted) return;
        setData(mergeChunks(responses));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        // keep-previous: 실패해도 직전 목록은 남긴다(오류 줄만 띄운다).
        setError(err instanceof Error ? err.message : LIST_FAIL_MESSAGE);
        setLoading(false);
      });
    return () => controller.abort();
  }, [paramsList, reloadNonce]);

  const rows: ExamBankRow[] = emptyPicked ? EMPTY_ROWS : (data?.items ?? EMPTY_ROWS);

  // ── 페이지 프리페치(§11.13.1 「체크 = 네트워크 0」) ────────────────────────────────
  // 목록(행 40건)이 오면 유휴 시간에 전체 항목(?ids=…&full=1, ≈100KB)과 지문 박스 유형의 본문을 미리
  // 받아 클라이언트 캐시에 넣는다. 체크 시 fetchBankItemAsBuilderQuestion 이 캐시를 먼저 봐 즉시 조판된다.
  // 페이지가 바뀌면 이전 프리페치는 abort. 이미 전부 캐시된 페이지는 요청 0.
  useEffect(() => {
    if (rows.length === 0) return;
    const need = rows.filter((r) => examBankRowMemberIds(r).some((id) => !isBankItemPrimed(id))).map((r) => r.id);
    if (need.length === 0) return;
    const controller = new AbortController();
    let idleHandle: number | null = null;
    const run = async () => {
      try {
        const res = await fetch(`/api/exam-passages/questions?ids=${encodeURIComponent(need.join(","))}&full=1`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as ExamBankListResponse;
        const full = body.fullItems ?? [];
        primeBankItems(full);
        primeBankSets(body.sets);
        const pids = bankPassageIdsToPrime(full);
        if (pids.length === 0) return;
        const pres = await fetch(`/api/exam-passages?ids=${encodeURIComponent(pids.join(","))}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!pres.ok) return;
        const pbody = (await pres.json()) as { items?: { id: string; text?: string | null }[] };
        primeBankPassages((pbody.items ?? []).map((p) => ({ id: p.id, text: p.text ?? null })));
      } catch {
        /* 프리페치 실패는 무해 — 체크 시 단건 경로가 그대로 동작한다 */
      }
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    if (typeof w.requestIdleCallback === "function") idleHandle = w.requestIdleCallback(() => void run(), { timeout: 800 });
    else idleHandle = window.setTimeout(() => void run(), 50);
    return () => {
      controller.abort();
      if (idleHandle !== null) {
        if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
    };
  }, [rows]);
  const facets: ExamBankFacets | null = data?.facets ?? null;
  const total = emptyPicked ? 0 : (data?.total ?? 0);
  const pageOut = onlyIdsKey !== null ? 1 : Math.min(page, data?.totalPages ?? page);
  const totalPages = onlyIdsKey !== null ? 1 : (data?.totalPages ?? 1);
  // 빈 선택 모드로 들어오며 직전 요청이 abort 되면 loading 이 true 로 남는다 — 파생으로 가린다.
  const loadingOut = emptyPicked ? false : loading;
  const errorOut = emptyPicked ? null : error;
  /** 첫 응답 전(첫 진입 스켈레톤 1회 전용 — 이후엔 keep-previous) */
  const initialPending = !emptyPicked && data === null && error === null;

  return useMemo(
    () => ({
      filters,
      facets,
      hasActiveFilters,
      setQuery,
      setYearRange,
      toggleIn,
      clearKey,
      toggleQNum,
      setSort,
      resetFilters,
      rows,
      total,
      page: pageOut,
      totalPages,
      setPage,
      loading: loadingOut,
      error: errorOut,
      reload,
      initialPending,
    }),
    [
      filters,
      facets,
      hasActiveFilters,
      setQuery,
      setYearRange,
      toggleIn,
      clearKey,
      toggleQNum,
      setSort,
      resetFilters,
      rows,
      total,
      pageOut,
      totalPages,
      loadingOut,
      errorOut,
      reload,
      initialPending,
    ],
  );
}

/** 청크 응답 병합 — items 는 요청 순서대로 잇고 total 은 합, facets 는 첫 청크(선택만 보기에선 필터 바가 안 보인다). */
function mergeChunks(responses: ExamBankListResponse[]): ExamBankListResponse {
  if (responses.length === 1) return responses[0];
  const first = responses[0];
  return {
    ...first,
    items: responses.flatMap((r) => r.items),
    total: responses.reduce((n, r) => n + r.total, 0),
    page: 1,
    totalPages: 1,
    allIds: responses.flatMap((r) => r.allIds),
    allIdsTruncated: responses.some((r) => r.allIdsTruncated),
  };
}

export type ExamBankInlineApi = ReturnType<typeof useExamBankInline>;

const EMPTY_ROWS: ExamBankRow[] = [];
