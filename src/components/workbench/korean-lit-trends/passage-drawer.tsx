"use client";

// 연결 지문 드로어 — 차트·칩에서 넘어온 지문 id 목록을 실지문 카드로 보여 주고,
// 카드를 클릭하면 라이브러리와 동일한 상세 모달(원문+분석+문제)을 연다.

import { useEffect, useState } from "react";
import { X, Loader2, BookOpenText } from "lucide-react";
import type { KoPassage } from "@/lib/korean-exam-passages/types";
import {
  galaeBadgeClass,
  koSourceLabel,
} from "@/lib/korean-exam-passages/format";
import {
  Badge,
  DetailModal,
} from "@/components/workbench/korean-exam-passage-library/detail-modal";

export interface DrawerRequest {
  title: string;
  ids: string[];
}

async function fetchByIds(ids: string[]): Promise<KoPassage[]> {
  const res = await fetch(
    `/api/korean/exam-passages?ids=${encodeURIComponent(ids.join(","))}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: KoPassage[] };
  return data.items ?? [];
}

async function fetchDetail(id: string): Promise<unknown> {
  const res = await fetch(
    `/api/korean/exam-passages?detail=${encodeURIComponent(id)}`,
  );
  if (!res.ok) return null;
  return res.json();
}

export function PassageDrawer({
  request,
  onClose,
}: {
  request: DrawerRequest | null;
  onClose: () => void;
}) {
  const [items, setItems] = useState<KoPassage[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<KoPassage | null>(null);

  useEffect(() => {
    if (!request) return;
    let alive = true;
    setLoading(true);
    fetchByIds(request.ids).then((got) => {
      if (!alive) return;
      // 요청 순서 보존
      const order = new Map(request.ids.map((id, i) => [id, i]));
      got.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      setItems(got);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [request]);

  if (!request) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-label="연결 지문 목록"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              연결된 기출 지문
            </p>
            <h3 className="truncate text-[13.5px] font-bold text-slate-800">
              {request.title}
            </h3>
            <p className="text-[11.5px] text-slate-500">
              {loading ? "불러오는 중…" : `${items.length}개 지문`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-slate-400">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <BookOpenText className="size-6 text-slate-300" />
              <p className="text-[12.5px] text-slate-500">
                연결된 지문을 찾지 못했습니다.
              </p>
            </div>
          ) : (
            items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDetail(p)}
                className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className={galaeBadgeClass(p.galae)}>{p.galae}</Badge>
                  {p.subGenre ? (
                    <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                      {p.subGenre}
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-[10.5px] font-medium text-slate-400">
                    {koSourceLabel(p.board)} · {p.year} {p.siheng}
                  </span>
                </div>
                {p.analysis ? (
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] font-semibold text-slate-800">
                    {p.analysis["핵심주제"]}
                  </p>
                ) : null}
                <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-slate-500">
                  {p.passageText.slice(0, 140)}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      {detail ? (
        <DetailModal
          passage={detail}
          fetchDetail={fetchDetail}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </>
  );
}
