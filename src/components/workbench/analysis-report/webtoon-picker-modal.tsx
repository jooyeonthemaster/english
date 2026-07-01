"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  ImageIcon,
  Images,
  Loader2,
  RefreshCw,
  Wand2,
  X,
} from "lucide-react";
import {
  styleLabel,
  languageLabel,
  type WebtoonStyleId,
  type WebtoonLanguageId,
} from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";
import {
  DEFAULT_WEBTOON_IMAGE_PLAN,
  WEBTOON_IMAGE_PLANS,
} from "@/lib/webtoon-models";
import {
  WebtoonGenerateFields,
  type WebtoonGenerateConfig,
} from "@/components/webtoon/webtoon-generate-fields";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";

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

/** 진행 중(생성/대기) 웹툰을 갤러리 상단에 자리표시자로 보여주기 위한 최소 행. */
interface TrackedItem {
  id: string;
  status: "PENDING" | "GENERATING" | "FAILED" | "COMPLETED";
  passageTitle: string;
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

const POLL_INTERVAL_MS = 2500;

type View = "generate" | "gallery";

/**
 * 지문 웹툰 삽입 모달 — 현재 지문으로 바로 웹툰을 생성(생성 탭)하거나, 이미 만든 완료
 * 웹툰을 골라(보관함 탭) 문서에 이미지 블록으로 삽입한다. 생성은 비동기(폴링)로 진행되며
 * 완료되면 보관함에 자동으로 나타난다.
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
  const [view, setView] = useState<View>("generate");
  const [items, setItems] = useState<WebtoonListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyThisPassage, setOnlyThisPassage] = useState(Boolean(passageId));
  const [ratios, setRatios] = useState<Record<string, number>>({});

  // 생성 옵션
  const [config, setConfig] = useState<WebtoonGenerateConfig>({
    plan: DEFAULT_WEBTOON_IMAGE_PLAN,
    style: "KOREAN_WEBTOON",
    language: "KO",
    customPrompt: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [tracking, setTracking] = useState<TrackedItem[]>([]);
  const trackingRef = useRef<TrackedItem[]>([]);
  trackingRef.current = tracking;
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
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
  }, []);

  // 모달이 열릴 때: 완료 목록을 불러오고, 완료본이 있으면 보관함을, 없으면 생성 탭을 연다.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          "/api/webtoons/list?status=COMPLETED&limit=100",
          { credentials: "include", cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          items?: WebtoonListItem[];
        };
        if (!alive) return;
        if (!res.ok || !data.ok || !Array.isArray(data.items)) {
          throw new Error("웹툰 목록을 불러오지 못했습니다.");
        }
        const list = data.items.filter((it) => pickWebtoonUrl(it));
        setItems(list);
        const mine = passageId
          ? list.some((it) => it.passageId === passageId)
          : list.length > 0;
        setView(mine ? "gallery" : "generate");
      } catch (err) {
        if (alive)
          setError(
            err instanceof Error
              ? err.message
              : "웹툰 목록을 불러오지 못했습니다.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // passageId 변화 시에도 다시 평가. load 는 useCallback 으로 안정적.
  }, [open, passageId]);

  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 진행 중 웹툰 폴링 — 완료/실패 시 추적 목록에서 제거하고 갤러리를 새로고침한다.
  useEffect(() => {
    if (!open) return;
    const active = tracking.filter(
      (t) => t.status === "PENDING" || t.status === "GENERATING",
    );
    if (active.length === 0) {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }
    if (pollTimer.current) return;

    // 모달이 닫히거나(effect cleanup) 폴링이 진행되는 동안 닫히면, await 이후 tick 이
    // 타이머를 재무장하거나 토스트/state 를 건드리지 않도록 cancelled 로 차단한다.
    let cancelled = false;

    const isActive = (t: TrackedItem) =>
      t.status === "PENDING" || t.status === "GENERATING";

    const tick = async () => {
      pollTimer.current = null;
      if (cancelled) return;
      const ids = trackingRef.current.filter(isActive).map((t) => t.id);
      if (ids.length === 0) return;
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/webtoons/${id}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => (d?.ok ? (d.webtoon as { id: string; status: string }) : null))
            .catch(() => null),
        ),
      );
      if (cancelled) return;

      const statusById = new Map(
        results.filter(Boolean).map((w) => [w!.id, w!.status]),
      );
      const doneIds = new Set(
        [...statusById].filter(([, s]) => s === "COMPLETED").map(([id]) => id),
      );
      const failedIds = new Set(
        [...statusById].filter(([, s]) => s === "FAILED").map(([id]) => id),
      );

      // 완료본을 먼저 목록에 반영한 뒤 placeholder 를 제거해야 카드가 "잠깐 사라졌다"
      // 다시 나타나는 깜빡임이 없다. (제거→로드 순서면 로드(약 0.6s) 동안 카드가 빈다)
      if (doneIds.size > 0) {
        await load();
        if (cancelled) return;
        toast.success("웹툰 생성이 완료되었습니다.");
        setView("gallery");
      }
      if (failedIds.size > 0) {
        toast.error("일부 웹툰 생성이 실패했습니다. 크레딧은 환불됩니다.");
      }

      // 상태가 실제로 바뀐 게 있을 때만 갱신(불필요한 매 틱 재렌더 방지). 해결된 항목 제거.
      const changed =
        doneIds.size > 0 ||
        failedIds.size > 0 ||
        trackingRef.current.some((t) => {
          const s = statusById.get(t.id);
          return !!s && s !== t.status;
        });
      if (changed) {
        setTracking((prev) =>
          prev
            .map((t) => {
              const s = statusById.get(t.id);
              return s ? { ...t, status: s as TrackedItem["status"] } : t;
            })
            .filter(isActive),
        );
      }

      const remaining = ids.filter(
        (id) => !doneIds.has(id) && !failedIds.has(id),
      );
      if (!cancelled && remaining.length > 0) {
        pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [open, tracking, load]);

  const handleGenerate = useCallback(async () => {
    if (submitting) return;
    if (!passageId) {
      toast.error("지문 정보를 찾을 수 없어 생성할 수 없습니다.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ai/webtoon/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          passageId,
          plan: config.plan,
          style: config.style,
          language: config.language,
          customPrompt: config.customPrompt,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        balance?: number;
        required?: number;
        queued?: Array<{
          webtoonId: string;
          passageTitle: string;
          status: "PENDING" | "GENERATING" | "FAILED";
          error?: string;
        }>;
      };

      if (res.status === 402) {
        toast.error(
          `크레딧이 부족합니다. 보유 ${data.balance ?? "?"} / 필요 ${data.required ?? "?"}`,
        );
        return;
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `생성 요청 실패 (${res.status})`);
      }

      const queued = (data.queued ?? []).filter((q) => q.status !== "FAILED");
      const failed = (data.queued ?? []).filter((q) => q.status === "FAILED");
      if (failed.length > 0) {
        toast.error(failed[0]?.error || "웹툰 생성 시작에 실패했습니다.");
      }
      if (queued.length > 0) {
        setTracking((prev) => [
          ...queued.map((q) => ({
            id: q.webtoonId,
            status: q.status,
            passageTitle: q.passageTitle,
          })),
          ...prev,
        ]);
        setView("gallery");
        toast.message("웹툰 생성을 시작했습니다.", {
          description:
            "생성에는 약 3분이 걸려요. 이 창을 닫고 다른 작업을 계속하셔도 완료되면 보관함에 표시됩니다.",
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "생성 요청 실패");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, passageId, config]);

  const handlePick = useCallback(
    async (it: WebtoonListItem) => {
      const url = pickWebtoonUrl(it);
      if (!url) return;
      const ratio = ratios[it.id] ?? (await decodeRatio(url));
      onPick({ imageUrl: url, webtoonId: it.id, ratio });
    },
    [ratios, onPick],
  );

  const visible = useMemo(() => {
    const list =
      onlyThisPassage && passageId
        ? items.filter((it) => it.passageId === passageId)
        : items;
    return [...list].sort((a, b) => {
      const aMine = a.passageId === passageId ? 0 : 1;
      const bMine = b.passageId === passageId ? 0 : 1;
      return aMine - bMine;
    });
  }, [items, onlyThisPassage, passageId]);

  const activeTracking = tracking.filter(
    (t) => t.status === "PENDING" || t.status === "GENERATING",
  );
  const galleryCount = items.length;
  const planCredits = WEBTOON_IMAGE_PLANS[config.plan].credits;

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
        className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <ImageIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-slate-800">
                지문 웹툰 삽입
              </h3>
              <p className="mt-0.5 text-[11.5px] text-slate-500">
                이 지문으로 웹툰을 생성하거나, 만든 웹툰을 골라 문서에 추가합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── 탭(생성 / 보관함) ── */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-5 py-2.5">
          <div className="flex h-9 rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setView("generate")}
              className={`flex items-center gap-1.5 rounded-[6px] px-3 text-[12.5px] transition-all duration-150 ${
                view === "generate"
                  ? "bg-white font-bold text-blue-700 shadow-sm"
                  : "font-semibold text-slate-500 hover:text-slate-700"
              }`}
            >
              <Wand2 className="h-3.5 w-3.5" />
              생성하기
            </button>
            <button
              type="button"
              onClick={() => setView("gallery")}
              className={`flex items-center gap-1.5 rounded-[6px] px-3 text-[12.5px] transition-all duration-150 ${
                view === "gallery"
                  ? "bg-white font-bold text-blue-700 shadow-sm"
                  : "font-semibold text-slate-500 hover:text-slate-700"
              }`}
            >
              <Images className="h-3.5 w-3.5" />
              보관함
              {galleryCount + activeTracking.length > 0 ? (
                <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-bold text-slate-600">
                  {galleryCount + activeTracking.length}
                </span>
              ) : null}
            </button>
          </div>
          {view === "gallery" ? (
            <div className="flex items-center gap-1.5">
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
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          ) : null}
        </div>

        {/* ── 본문 ── */}
        {view === "generate" ? (
          <>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <WebtoonGenerateFields
                value={config}
                onChange={(patch) => setConfig((c) => ({ ...c, ...patch }))}
                disabled={submitting}
              />
            </div>
            <div className="shrink-0 border-t border-slate-100 px-5 py-3.5">
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-[14px] font-bold text-white shadow-md shadow-blue-200/50 transition-all hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    생성 시작 중…
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" />
                    웹툰 생성
                    <CreditCostChip
                      amount={planCredits}
                      className="ml-0.5 rounded-lg bg-white/20 px-2 py-0.5 text-[11px] text-white"
                    />
                  </>
                )}
              </button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
                생성에는 약 3분 정도 걸려요. 시작한 뒤 이 창을 닫고 다른 작업을
                계속하셔도 완료되면 보관함에 표시됩니다.
              </p>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {loading && items.length === 0 && activeTracking.length === 0 ? (
              <div className="flex h-48 items-center justify-center gap-2 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[13px]">웹툰을 불러오는 중...</span>
              </div>
            ) : error && visible.length === 0 && activeTracking.length === 0 ? (
              // 보여줄 콘텐츠가 전혀 없을 때만 전체 에러 패널. 폴링 중 일시적 새로고침
              // 실패가 진행 중/완료 썸네일을 가리지 않도록 한다(아래 인라인 배너로 표시).
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
            ) : visible.length === 0 && activeTracking.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-1.5 text-center">
                <ImageIcon className="h-6 w-6 text-slate-300" />
                <p className="text-[13px] text-slate-400">
                  {onlyThisPassage
                    ? "이 지문으로 생성한 완료된 웹툰이 없습니다."
                    : "완료된 웹툰이 없습니다."}
                </p>
                <button
                  type="button"
                  onClick={() => setView("generate")}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  지금 생성하기
                </button>
              </div>
            ) : (
              <>
                {activeTracking.length > 0 ? (
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
                    <span className="text-[11.5px] leading-relaxed text-blue-800">
                      웹툰을 생성하는 중이에요 (약 3분). 이 창을 닫고 다른 작업을
                      계속하셔도 완료되면 여기 보관함에 표시됩니다.
                    </span>
                  </div>
                ) : null}
                {error ? (
                  <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                    <span className="text-[11.5px] text-rose-600">{error}</span>
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="shrink-0 rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {/* 진행 중 자리표시자 */}
                  {activeTracking.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                      <span className="text-[10.5px] font-semibold">생성 중…</span>
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="truncate text-[11.5px] font-semibold text-slate-700">
                        {t.passageTitle || "웹툰"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">대기/생성 중</p>
                    </div>
                  </div>
                ))}
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
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
