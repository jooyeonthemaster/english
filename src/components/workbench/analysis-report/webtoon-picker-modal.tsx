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
  DEFAULT_WEBTOON_IMAGE_PLAN,
  WEBTOON_IMAGE_PLANS,
} from "@/lib/webtoon-models";
import {
  WebtoonGenerateFields,
  type WebtoonGenerateConfig,
} from "@/components/webtoon/webtoon-generate-fields";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { friendlyWebtoonError } from "@/lib/webtoon-errors";
import { WebtoonPickerGallery } from "./webtoon-picker-modal-parts/webtoon-picker-gallery";
import { useWebtoonTrackingPoll } from "./webtoon-picker-modal-parts/use-webtoon-tracking-poll";
import {
  LIST_ERROR_MESSAGE,
  decodeRatio,
  fetchActiveWebtoons,
  fetchCompletedWebtoons,
  isTrackingActive,
  pickWebtoonUrl,
  type TrackedItem,
  type WebtoonListItem,
} from "./webtoon-picker-modal-parts/webtoon-picker-utils";

export interface WebtoonPick {
  imageUrl: string;
  webtoonId: string;
  ratio?: number;
}

type View = "generate" | "gallery";

/**
 * 지문 웹툰 삽입 모달 — 현재 지문으로 바로 웹툰을 생성(생성 탭)하거나, 이미 만든 완료
 * 웹툰을 골라(보관함 탭) 문서에 이미지 블록으로 삽입한다. 생성은 비동기(폴링)로 진행되며
 * 완료되면 보관함에 자동으로 나타난다.
 */
export function WebtoonPickerModal({
  open,
  passageId,
  subject,
  heading,
  pickLabel,
  onClose,
  onPick,
}: {
  open: boolean;
  passageId?: string;
  /**
   * 지문 과목 — "KOREAN" 이면 국어 표면: 보관함을 이 지문 것만으로 고정해
   * (전체 보기 토글 숨김) 영어 지문 웹툰이 국어 화면에 절대 섞이지 않는다.
   * 생성 프롬프트 자체는 서버가 Passage.subject 로 게이트하므로 여기서는
   * 표면 격리만 담당한다. 미전달 = 기존(영어) 동작 그대로 — 무회귀.
   */
  subject?: "KOREAN";
  /** 헤더 제목/설명 오버라이드 — 삽입이 아닌 문맥(국어 지문 상세 등)에서 사용. */
  heading?: { title: string; description: string };
  /** 카드 hover 액션 라벨. 기본 "문서에 삽입 →" (편집기 삽입 문맥). */
  pickLabel?: string;
  onClose: () => void;
  onPick: (pick: WebtoonPick) => void;
}) {
  const [view, setView] = useState<View>("generate");
  // 사용자가 탭을 직접 만졌는지 — 초기 로드 완료 콜백의 자동 탭 선택이 로딩 중의
  // 수동 탭 전환을 되엎는 레이스 봉인(실측: 보관함 클릭 직후 로드가 끝나며 생성 탭으로
  // 강제 복귀). 생성 발사·완료 토스트의 setView 는 의도된 항행이라 게이트 밖.
  const viewTouchedRef = useRef(false);
  // 보관함 목록은 두 갈래 — 전체(최신 100건)와 이 지문 전용(서버 passageId 필터).
  // "이 지문만"을 최신 100건에서 클라 필터하면 오래된 지문의 웹툰이 통째로 빠진다.
  const [items, setItems] = useState<WebtoonListItem[]>([]);
  const [passageItems, setPassageItems] = useState<WebtoonListItem[]>([]);
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

  // 과목 스코프 — 국어 표면(subject=KOREAN)은 서버에 scope=KOREAN 을 넘겨 국어
  // 지문 웹툰만 받는다. 미전달(영어)은 서버 기본 스코프(국어 웹툰 제외)가 걸리므로
  // 그대로 둔다 — 어느 쪽도 반대 과목 웹툰이 갤러리에 섞이지 않는다.
  const scopeParam = subject === "KOREAN" ? "&scope=KOREAN" : "";
  const passageParam = passageId
    ? `&passageId=${encodeURIComponent(passageId)}`
    : "";
  // 국어 표면은 항상 이 지문 스코프로 고정(영어 지문 웹툰 비노출) — 토글도 숨긴다.
  const forceThisPassageOnly = subject === "KOREAN" && Boolean(passageId);

  // 보관함 두 목록을 함께 받는다. 국어 고정 스코프는 전체 목록을 쓰지 않으므로
  // 받지 않는다(지문 본문이 실린 100행 절약). 어느 쪽이든 실패하면 throw.
  const fetchGallery = useCallback(
    () =>
      Promise.all([
        forceThisPassageOnly
          ? Promise.resolve<WebtoonListItem[]>([])
          : fetchCompletedWebtoons(scopeParam),
        passageParam
          ? fetchCompletedWebtoons(scopeParam + passageParam)
          : Promise.resolve<WebtoonListItem[]>([]),
      ]),
    [forceThisPassageOnly, scopeParam, passageParam],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [all, mine] = await fetchGallery();
      setItems(all);
      setPassageItems(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : LIST_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [fetchGallery]);

  // 모달이 열릴 때: 완료 목록을 불러오고, 완료본이 있으면 보관함을, 없으면 생성 탭을 연다.
  // 재마운트 후 진행 소실 → 중복 생성 차감 방지(E23 검수): 진행 중(PENDING/GENERATING)
  // 웹툰을 병행 조회해 tracking 에 되살린다 — 진행분이 안 보이면 같은 지문을 다시
  // 생성해 크레딧이 이중 차감되기 때문. 진행 조회도 passageId 로 서버에서 좁혀, 학원
  // 전체 일괄 생성으로 진행 행이 50건을 넘어도 이 지문 진행분을 놓치지 않는다.
  // 진행 조회는 실패해도 완료 목록 로드는 그대로(보조 조회).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [[all, mine], activeItems] = await Promise.all([
          fetchGallery(),
          fetchActiveWebtoons(scopeParam + passageParam),
        ]);
        if (!alive) return;
        setItems(all);
        setPassageItems(mine);

        // 이 지문의 진행 행을 tracking 으로 시드 — 기존 placeholder/폴링 기계가
        // 그대로 이어받는다. handleGenerate 가 이미 넣은 id 와 겹칠 수 있으므로
        // id 중복 시드는 막는다(같은 행이 placeholder 로 두 번 뜨는 것 방지).
        const mineActive = (
          passageId
            ? activeItems.filter((it) => it.passageId === passageId)
            : activeItems
        ).filter(
          (it) => it.status === "PENDING" || it.status === "GENERATING",
        );
        if (mineActive.length > 0) {
          setTracking((prev) => {
            const seen = new Set(prev.map((t) => t.id));
            const seeded = mineActive
              .filter((it) => !seen.has(it.id))
              .map((it) => ({
                id: it.id,
                status: it.status as TrackedItem["status"],
                passageTitle: it.passage?.title ?? "웹툰",
                plan: it.plan ?? null,
              }));
            return seeded.length > 0 ? [...seeded, ...prev] : prev;
          });
        }

        // 진행분이 있으면 placeholder 가 보이는 보관함을 먼저 연다(진행 사실 인지 우선).
        // 단 로딩 중 사용자가 탭을 직접 골랐으면 그 선택이 이긴다(자동 선택은 초기값일 뿐).
        const hasMine = passageId ? mine.length > 0 : all.length > 0;
        if (!viewTouchedRef.current) setView(mineActive.length > 0 || hasMine ? "gallery" : "generate");
      } catch (err) {
        if (alive)
          setError(err instanceof Error ? err.message : LIST_ERROR_MESSAGE);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // passageId/과목 스코프 변화 시에도 다시 평가(fetchGallery 가 둘 다 따라 바뀐다).
  }, [open, passageId, scopeParam, passageParam, fetchGallery]);

  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 진행 중 웹툰 폴링 — 완료 시 목록을 새로 받고 보관함 탭으로 옮긴다.
  const showGallery = useCallback(() => setView("gallery"), []);
  useWebtoonTrackingPoll({
    open,
    tracking,
    setTracking,
    reload: load,
    onCompleted: showGallery,
  });

  const handleGenerate = useCallback(async () => {
    if (submitting) return;
    if (!passageId) {
      toast.error("지문 정보를 찾을 수 없어 생성할 수 없습니다.");
      return;
    }
    const submitted = config;
    setSubmitting(true);
    try {
      const res = await fetch("/api/ai/webtoon/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          passageId,
          plan: submitted.plan,
          style: submitted.style,
          language: submitted.language,
          customPrompt: submitted.customPrompt,
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
        toast.error(friendlyWebtoonError(failed[0]?.error ?? "dispatch error"));
      }
      if (queued.length > 0) {
        setTracking((prev) => [
          ...queued.map((q) => ({
            id: q.webtoonId,
            status: q.status,
            passageTitle: q.passageTitle,
            plan: submitted.plan,
          })),
          ...prev,
        ]);
        setView("gallery");
        toast.message("웹툰 생성을 시작했습니다.", {
          description: `생성에는 ${WEBTOON_IMAGE_PLANS[submitted.plan].etaLabel} 정도 걸려요. 이 창을 닫고 다른 작업을 계속하셔도 완료되면 보관함에 표시됩니다.`,
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

  const handleRatio = useCallback((id: string, ratio: number) => {
    setRatios((prev) => (prev[id] ? prev : { ...prev, [id]: ratio }));
  }, []);

  const goGenerate = useCallback(() => {
    viewTouchedRef.current = true;
    setView("generate");
  }, []);

  const scoped = forceThisPassageOnly || onlyThisPassage;

  // 이 지문 스코프는 서버 필터 목록을 그대로(최신순), 전체 보기는 이 지문 것을 앞으로.
  const visible = useMemo(() => {
    if (scoped && passageId) return passageItems;
    return [...items].sort((a, b) => {
      const aMine = a.passageId === passageId ? 0 : 1;
      const bMine = b.passageId === passageId ? 0 : 1;
      return aMine - bMine;
    });
  }, [items, passageItems, scoped, passageId]);

  const activeTracking = tracking.filter(isTrackingActive);
  // 국어 고정 스코프에서는 배지 수도 이 지문 것만 센다(숨긴 항목을 세면 어긋남).
  const galleryCount = forceThisPassageOnly ? visible.length : items.length;
  const planDef = WEBTOON_IMAGE_PLANS[config.plan];
  // 진행 배너의 예상 시간 — 가장 최근 진행분의 등급 기준, 모르면 지금 고른 등급.
  const trackingPlan =
    activeTracking.find((t) => t.plan)?.plan ?? config.plan;
  const trackingEta = WEBTOON_IMAGE_PLANS[trackingPlan].etaLabel;

  if (!open) return null;

  return createPortal(
    // no-print: body 포털이라 par-root 형제 가지치기의 보호를 받지 못한다 — 인쇄 방어는 여기서 직접.
    <div className="no-print fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading?.title ?? "지문 웹툰 삽입"}
        className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <ImageIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-slate-800">
                {heading?.title ?? "지문 웹툰 삽입"}
              </h3>
              <p className="mt-0.5 text-[11.5px] text-slate-500">
                {heading?.description ??
                  "이 지문으로 웹툰을 생성하거나, 만든 웹툰을 골라 문서에 추가합니다."}
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
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-6 py-2.5">
          <div className="flex h-9 rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={goGenerate}
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
              onClick={() => {
                viewTouchedRef.current = true;
                setView("gallery");
              }}
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
              {passageId && !forceThisPassageOnly ? (
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
            <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
              <WebtoonGenerateFields
                value={config}
                onChange={(patch) => setConfig((c) => ({ ...c, ...patch }))}
                disabled={submitting}
                koreanPassage={subject === "KOREAN"}
              />
            </div>
            <div className="shrink-0 border-t border-slate-100 px-6 py-4">
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
                      amount={planDef.credits}
                      className="ml-0.5 rounded-lg bg-white/20 px-2 py-0.5 text-[11px] text-white"
                    />
                  </>
                )}
              </button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
                생성에는 {planDef.etaLabel} 정도 걸려요. 시작한 뒤 이 창을 닫고
                다른 작업을 계속하셔도 완료되면 보관함에 표시됩니다.
              </p>
            </div>
          </>
        ) : (
          <WebtoonPickerGallery
            loading={loading}
            error={error}
            visible={visible}
            activeTracking={activeTracking}
            scoped={scoped}
            etaLabel={trackingEta}
            pickLabel={pickLabel}
            onRetry={() => void load()}
            onGoGenerate={goGenerate}
            onPick={(it) => void handlePick(it)}
            onRatio={handleRatio}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
