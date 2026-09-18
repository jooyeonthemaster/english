"use client";

// 추적 링크 생성·수정·삭제 뮤테이션 + 복사 헬퍼. 저장 후 리포트 쿼리(admin-analytics) 무효화.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LinkFieldErrors, TrackedLinkInput } from "@/lib/analytics/tracked-links";

const API = "/api/admin/analytics/links";

export class LinkApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fieldErrors: LinkFieldErrors,
  ) {
    super(message);
  }
}

async function send<T>(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string; fieldErrors?: LinkFieldErrors }) | null;
  if (!res.ok) {
    throw new LinkApiError(data?.error ?? `요청 실패 (${res.status})`, res.status, data?.fieldErrors ?? {});
  }
  return data as T;
}

export type DeleteResult = "deleted" | "deactivated";

export function useLinkMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-analytics"] });

  const create = useMutation<{ link: { id: string; slug: string } }, LinkApiError, TrackedLinkInput>({
    mutationFn: (input) => send(API, "POST", input),
    onSuccess: invalidate,
  });

  const update = useMutation<
    { link: { id: string; slug: string; isActive: boolean } },
    LinkApiError,
    { id: string; patch: Partial<TrackedLinkInput> }
  >({
    mutationFn: ({ id, patch }) => send(`${API}/${encodeURIComponent(id)}`, "PATCH", patch),
    onSuccess: invalidate,
  });

  const remove = useMutation<{ result: DeleteResult }, LinkApiError, { id: string }>({
    mutationFn: ({ id }) => send(`${API}/${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

/** 클립보드 복사 + 토스트. 보안 컨텍스트가 아니면 execCommand 폴백. */
export async function copyText(text: string, successMessage = "복사했습니다"): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) throw new Error("copy failed");
    }
    toast.success(successMessage, { description: text.length > 80 ? `${text.slice(0, 80)}…` : text });
  } catch {
    toast.error("복사하지 못했습니다 — 주소를 직접 선택해 복사하세요");
  }
}
