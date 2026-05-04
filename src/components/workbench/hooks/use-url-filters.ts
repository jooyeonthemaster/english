// @ts-nocheck
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function useUrlFilters(basePath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filter churn should never pollute browser history — a clear/set/clear
  // loop would otherwise leave the Back button dead for 3+ presses. We
  // default to `router.replace` and only `push` when the caller opts in
  // (useful for deep-linkable views that *should* be back-navigable).
  const updateFilter = useCallback(
    (key: string, value: string, options?: { push?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "ALL") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      const url = `${basePath}?${params.toString()}`;
      if (options?.push) router.push(url);
      else router.replace(url);
    },
    [basePath, router, searchParams],
  );

  const updateFilters = useCallback(
    (updates: Record<string, string>, options?: { push?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value && value !== "ALL") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      params.delete("page");
      const url = `${basePath}?${params.toString()}`;
      if (options?.push) router.push(url);
      else router.replace(url);
    },
    [basePath, router, searchParams],
  );

  // Pagination IS a navigable intent (user wants to Back out of page 3) so
  // we keep `push` semantics here.
  const goToPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(page));
      router.push(`${basePath}?${params.toString()}`);
    },
    [basePath, router, searchParams],
  );

  return { updateFilter, updateFilters, goToPage };
}
