"use client";

// ============================================================================
// MergeConfirmModal — 트레이에서 선택한 여러 장(페이지/크롭)을 "한 지문"으로
// 합치기 전, 이어붙인 결과를 미리 보고 순서를 ▲▼로 교정해 확정한다. (접근 A)
// 순서 변경 시 re-stitch. 긴 이미지는 정확도 경고. (adaptive-intake C4/C5)
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Combine, Loader2, X } from "lucide-react";

import { MAX_PAGE_IMAGE_BYTES } from "@/lib/extraction/constants";
import type { ClientPageSlot } from "@/lib/extraction/types";
import { stitchSlotsToBlob } from "./crop-utils";

interface PreviewState {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

const TOO_TALL_PX = 5000; // 보수적 가드값(벤치로 조정) — 초과 시 글자 뭉개짐 경고

export function MergeConfirmModal({
  initial,
  onCancel,
  onConfirm,
}: {
  initial: PreviewState & { materials: ClientPageSlot[] };
  onCancel: () => void;
  onConfirm: (
    ordered: ClientPageSlot[],
    blob: Blob,
    url: string,
    width: number,
    height: number,
  ) => void;
}) {
  const [ordered, setOrdered] = useState<ClientPageSlot[]>(initial.materials);
  const [preview, setPreview] = useState<PreviewState>({
    blob: initial.blob,
    url: initial.url,
    width: initial.width,
    height: initial.height,
  });
  const [busy, setBusy] = useState(false);
  // 확정 시 호출부로 넘긴 url은 revoke하지 않도록 추적.
  const handedOff = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  // 언마운트 시, 확정으로 넘기지 않은 마지막 preview url은 회수.
  useEffect(() => {
    return () => {
      if (!handedOff.current) URL.revokeObjectURL(preview.url);
    };
  }, [preview.url]);

  const restitch = useCallback(async (next: ClientPageSlot[]) => {
    setBusy(true);
    try {
      const res = await stitchSlotsToBlob(
        next.map((s) => s.blob),
        { maxWidth: 2480 },
      );
      setPreview((prev) => {
        URL.revokeObjectURL(prev.url);
        return {
          blob: res.blob,
          url: res.previewUrl,
          width: res.width,
          height: res.height,
        };
      });
      setOrdered(next);
    } finally {
      setBusy(false);
    }
  }, []);

  const move = useCallback(
    (index: number, dir: -1 | 1) => {
      const target = index + dir;
      if (target < 0 || target >= ordered.length || busy) return;
      const next = [...ordered];
      [next[index], next[target]] = [next[target], next[index]];
      void restitch(next);
    },
    [busy, ordered, restitch],
  );

  const tooTall = preview.height > TOO_TALL_PX;
  const tooLarge = preview.blob.size > MAX_PAGE_IMAGE_BYTES;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="여러 장을 한 지문으로 합치기"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Combine className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[13px] font-bold text-slate-950">
                여러 장을 한 지문으로 합치기
              </h2>
              <p className="text-[11px] text-slate-500">
                선택한 {ordered.length}장을 위→아래 순서로 이어 한 개 지문으로
                추출합니다. 추출 비용도 한 개로 계산됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="닫기 (Esc)"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px]">
          {/* 이어붙인 결과 미리보기 */}
          <div className="relative min-h-0 overflow-auto border-b border-slate-100 bg-slate-900/5 p-3 md:border-b-0 md:border-r">
            {busy ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50">
                <Loader2 className="size-5 animate-spin text-blue-600" aria-hidden="true" />
              </div>
            ) : null}
            <div className="mx-auto w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt="이어붙인 지문 미리보기"
                className="block max-w-full"
                draggable={false}
              />
            </div>
          </div>

          {/* 순서 리스트 */}
          <aside className="flex min-h-0 flex-col">
            <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700">
              이어붙일 순서
            </div>
            <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {ordered.map((s, i) => (
                <li
                  key={s.slotId ?? i}
                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-1.5"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="size-9 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.previewUrl}
                      alt=""
                      className="h-full w-full object-cover object-top"
                      draggable={false}
                    />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-600">
                    {s.sourceFileName ?? "이미지"}
                  </span>
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0 || busy}
                      aria-label="위로"
                      className="inline-flex size-4 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronUp className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === ordered.length - 1 || busy}
                      aria-label="아래로"
                      className="inline-flex size-4 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronDown className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        {tooLarge ? (
          <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-100 px-4 py-2.5 text-[11.5px] font-medium text-slate-700">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-slate-600"
              aria-hidden="true"
            />
            <span>
              합친 이미지 용량이 너무 큽니다 (
              {Math.round(MAX_PAGE_IMAGE_BYTES / 1024 / 1024)}MB 초과). 장수를
              줄이거나 영역을 더 작게 잘라야 추출할 수 있습니다.
            </span>
          </div>
        ) : tooTall ? (
          <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[11.5px] text-slate-600">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            <span>
              합친 이미지가 길어 글자가 작아질 수 있습니다. 정확도가 떨어지면 장수를
              줄이거나, 페이지에서 필요한 부분만 잘라 합쳐 보세요.
            </span>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-200 px-3.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              handedOff.current = true;
              onConfirm(
                ordered,
                preview.blob,
                preview.url,
                preview.width,
                preview.height,
              );
            }}
            disabled={busy || ordered.length < 2 || tooLarge}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            <Combine className="size-4" aria-hidden="true" />
            이 순서로 합치기
          </button>
        </div>
      </div>
    </div>
  );
}
