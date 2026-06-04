"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Hook for managing URL-based filter parameters.
 *
 * @param basePath - The page path to navigate to (e.g. "/director/workbench/passages")
 */
export function useUrlFilters(basePath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Mark URL-driven navigations as transitions so callers can render inline
  // loading feedback (instead of a blank/stale flash) while the server renders
  // the next page. `isPending` stays true until the new RSC payload commits.
  const [isPending, startTransition] = useTransition();

  /** Set a single filter parameter and reset the page to 1. */
  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "ALL") params.set(key, value);
      else params.delete(key);
      params.delete("page");
      startTransition(() => {
        router.push(`${basePath}?${params.toString()}`);
      });
    },
    [router, searchParams, basePath],
  );

  /** Set multiple filter parameters at once and reset the page to 1. */
  const updateFilters = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "ALL") params.set(key, value);
        else params.delete(key);
      }
      params.delete("page");
      startTransition(() => {
        router.push(`${basePath}?${params.toString()}`);
      });
    },
    [router, searchParams, basePath],
  );

  /** Navigate to a specific page, keeping other filters intact. */
  const goToPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(page));
      startTransition(() => {
        router.push(`${basePath}?${params.toString()}`);
      });
    },
    [router, searchParams, basePath],
  );

  /** Convenience: push a search value through `updateFilter`. */
  const handleSearch = useCallback(
    (searchValue: string) => {
      updateFilter("search", searchValue);
    },
    [updateFilter],
  );

  return { updateFilter, updateFilters, handleSearch, goToPage, isPending };
}
