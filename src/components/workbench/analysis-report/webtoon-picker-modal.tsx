"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, Loader2, RefreshCw, X } from "lucide-react";
import {
  styleLabel,
  languageLabel,
  type WebtoonStyleId,
  type WebtoonLanguageId,
} from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

interface WebtoonListItem {
  id: string;
  passageId: string;
  style: WebtoonStyleId;
  language: WebtoonLanguageId;
  imageUrl: string | null;
  editedImageUrl?: string | null;
  status: string;
  passage: { id: string; title: string };
}

/** Prefer the re-typeset export when the webtoon's text has been edited. */
function pickWebtoonUrl(it: WebtoonListItem): string | null {
  return it.editedImageUrl || it.imageUrl;
}

/** 선택 시점에 정확한 가로/세로 비율을 디코드해 읽는다(지연 로드 썸네일 의존 제거). */
async function decodeRatio(url: string): Promise<number | undefined> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth > 0) return img.naturalHeight / img.naturalWidth;
  } catch {
    /* ignore — 렌더러가 16/9 로 폴백 */
  }
  return undefined;
}

export interface WebtoonPick {
  imageUrl: string;
  webtoonId: string;
  ratio?: number;
}

/**
 * 생성한 웹툰 선택 모달 — 완료된 웹툰을 그리드로 보여주고, 선택하면 문서에 이미지
 * 블록으로 삽입한다. 현재 지문(passageId)으로 만든 웹툰을 우선 노출한다.
 */
export function WebtoonPickerModal({
  open,
  passageId,
  onClose,
  onPick,
}: {
  open: boolean;
  passageId?: string;
  onClose: () => void;
  onPick: (pick: WebtoonPick) => void;
}) {
  const [items, setItems] = useState<WebtoonListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyThisPassage, setOnlyThisPassage] = useState(Boolean(passageId));
  const [ratios, setRatios] = useState<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/webtoons/list?status=COMPLETED&limit=100", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: WebtoonListItem[];
      };
      if (!res.ok || !data.ok || !Array.isArray(data.items)) {
        throw new Error("웹툰 목록을 불러오지 못했습니다.");
      }
      setItems(data.items.filter((it) => pickWebtoonUrl(it)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "웹툰 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handlePick = async (it: WebtoonListItem) => {
    const url = pickWebtoonUrl(it);
    if (!url) return;
    const ratio = ratios[it.id] ?? (await decodeRatio(url));
    onPick({ imageUrl: url, webtoonId: it.id, ratio });
  };

  const visible = useMemo(() => {
    const list =
      onlyThisPassage && passageId
        ? items.filter((it) => it.passageId === passageId)
        : items;
    // 현재 지문으로 만든 웹툰을 앞으로
    return [...list].sort((a, b) => {
      const aMine = a.passageId === passageId ? 0 : 1;
      const bMine = b.passageId === passageId ? 0 : 1;
      return aMine - bMine;
    });
  }, [items, onlyThisPassage, passageId]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="지문 웹툰 삽입"
        className="relative z-10 flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <ImageIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-slate-800">
                지문 웹툰 삽입
              </h3>
              <p className="mt-0.5 text-[11.5px] text-slate-500">
                생성한 웹툰을 골라 문서에 추가합니다.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {passageId ? (
              <button
                type="button"
                onClick={() => setOnlyThisPassage((v) => !v)}
                aria-pressed={onlyThisPassage}
                className={
                  "h-8 rounded-lg border px-2.5 text-[11.5px] font-semibold transition-colors " +
                  (onlyThisPassage
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50")
                }
              >
                이 지문만
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              title="새로고침"
              aria-label="새로고침"
              className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {loading && items.length === 0 ? (
            <div className="flex h-48 items-center justify-center gap-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[13px]">웹툰을 불러오는 중...</span>
            </div>
          ) : error ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <p className="text-[12px] text-rose-600">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
              >
                다시 시도
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-1.5 text-center">
              <ImageIcon className="h-6 w-6 text-slate-300" />
              <p className="text-[13px] text-slate-400">
                {onlyThisPassage
                  ? "이 지문으로 생성한 완료된 웹툰이 없습니다."
                  : "완료된 웹툰이 없습니다."}
              </p>
              <p className="text-[11.5px] text-slate-400">
                웹툰 생성 페이지에서 먼저 웹툰을 만들어 주세요.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {visible.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => void handlePick(it)}
                  className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-all hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                >
                  <div className="relative aspect-[9/16] w-full overflow-hidden bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pickWebtoonUrl(it) as string}
                      alt={it.passage.title}
                      loading="lazy"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth > 0) {
                          setRatios((prev) =>
                            prev[it.id]
                              ? prev
                              : {
                                  ...prev,
                                  [it.id]: img.naturalHeight / img.naturalWidth,
                                },
                          );
                        }
                      }}
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                    />
                    <span className="absolute left-1.5 top-1.5 rounded bg-slate-900/70 px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                      {styleLabel(it.style)}
                    </span>
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="truncate text-[11.5px] font-semibold text-slate-700">
                      {it.passage.title}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      {languageLabel(it.language)}
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                      문서에 삽입 →
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
