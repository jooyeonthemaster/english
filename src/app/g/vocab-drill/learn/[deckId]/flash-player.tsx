"use client";

// LEARN 플래시 플레이어 — 카드 10장(앞: 표제어 / 뒤: 뜻·예문·연어) 자기평가.
// 큐 소진 시 서버가 80% 커버리지를 판정해 LEARN→DRILL 승급을 결정한다.
// 몰입 화면 관용구(GShell 미적용, 자체 헤더 — w/[taskId]/hub-client.tsx:129).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import type { VocabClientItem, VocabQueueResponse } from "@/lib/vocab-drill/payload";
import { VOCAB_POS_LABELS, VOCAB_TIER_LABELS } from "@/lib/vocab-drill/display";

type FlashItem = Extract<VocabClientItem, { type: "FLASH" }>;

/**
 * error       — 카드 큐를 못 받았다(재시도 = 큐 재요청)
 * empty       — 정상적 빈 상태(학습할 카드가 없다) — 오류가 아니다
 * finish-error— 카드는 다 봤는데 완료 저장이 실패했다(재시도 = 완료 POST 재호출)
 *   ★ 이 둘을 한 화면으로 묶으면 "카드 로드 실패"로 오귀속되고, 재시도가 큐를
 *     새로 불러 학생이 카드를 처음부터 다시 본다(적대검수 2026-08-04).
 */
type Phase =
  | "loading"
  | "error"
  | "empty"
  | "play"
  | "finishing"
  | "finish-error"
  | "result";

interface LearnResult {
  advanced: boolean;
  seen: number;
  total: number;
}

export function FlashPlayer({
  deckId,
  deckTitle,
}: {
  deckId: string;
  deckTitle: string;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<FlashItem[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [result, setResult] = useState<LearnResult | null>(null);

  // 카드 노출 시각(timeMs 계측)·문항별 clientKey(재시도 시 같은 키 — 멱등)
  const shownAtRef = useRef<number>(Date.now());
  const keysRef = useRef<Map<string, string>>(new Map());

  const hubHref = `/g/vocab-drill/deck/${deckId}`;

  // ── 큐 로드 ────────────────────────────────────────────────────────────────
  const loadQueue = useCallback(async () => {
    setPhase("loading");
    setSubmitError(false);
    try {
      const res = await fetch(
        `/api/vocab-drill/queue?mode=learn&deckId=${encodeURIComponent(deckId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        queue?: VocabQueueResponse;
      } | null;
      if (!res.ok || !data?.ok || !data.queue) {
        setPhase("error");
        return;
      }
      const flash = data.queue.items.filter(
        (it): it is FlashItem => it.type === "FLASH",
      );
      // ok:true + items:[] 는 정상적 빈 상태다 — 오류 화면을 띄우지 않는다.
      if (!flash.length) {
        setItems([]);
        setPhase("empty");
        return;
      }
      keysRef.current = new Map();
      setItems(flash);
      setIndex(0);
      setFlipped(false);
      shownAtRef.current = Date.now();
      setPhase("play");
    } catch {
      setPhase("error");
    }
  }, [deckId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  // ── 큐 소진 → LEARN 완료 판정 ──────────────────────────────────────────────
  const finishLearn = useCallback(async () => {
    setPhase("finishing");
    try {
      const res = await fetch(`/api/vocab-drill/deck/${encodeURIComponent(deckId)}/learn`, {
        method: "POST",
      });
      // 서버 응답은 {ok, advanced, seen, total} — 승급 여부는 ok 가 아니라 advanced 다.
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        advanced?: boolean;
        seen?: number;
        total?: number;
      } | null;
      if (!res.ok || !data?.ok) {
        setPhase("finish-error");
        return;
      }
      setResult({
        advanced: Boolean(data.advanced),
        seen: data.seen ?? 0,
        total: data.total ?? 0,
      });
      setPhase("result");
    } catch {
      setPhase("finish-error");
    }
  }, [deckId]);

  // ── 자기평가 제출 ──────────────────────────────────────────────────────────
  const answer = useCallback(
    async (verdict: "O" | "X") => {
      if (submitting || phase !== "play") return;
      const item = items[index];
      if (!item) return;
      setSubmitting(true);
      setSubmitError(false);

      // clientKey — 문항당 1회 생성, 재시도 시 재사용(서버 P2002 멱등)
      let clientKey = keysRef.current.get(item.id);
      if (!clientKey) {
        clientKey = crypto.randomUUID();
        keysRef.current.set(item.id, clientKey);
      }

      try {
        const res = await fetch("/api/vocab-drill/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senseId: item.senseId,
            itemType: "FLASH",
            answer: verdict,
            timeMs: Date.now() - shownAtRef.current,
            hintUsed: 0,
            source: "FLASH",
            deckId,
            clientKey,
          }),
        });
        const data = (await res.json()) as { ok: boolean };
        if (!res.ok || !data.ok) {
          setSubmitError(true);
          return;
        }
        if (index + 1 >= items.length) {
          await finishLearn();
          return;
        }
        setIndex((i) => i + 1);
        setFlipped(false);
        shownAtRef.current = Date.now();
      } catch {
        setSubmitError(true);
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, phase, items, index, deckId, finishLearn],
  );

  const item = items[index] ?? null;
  const total = items.length;
  const progressPct =
    phase === "result" || phase === "finishing" || phase === "finish-error"
      ? 100
      : total > 0
        ? Math.round((index / total) * 100)
        : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── 헤더 ── */}
      <header
        className="shrink-0"
        style={{ background: "var(--gd-card)", borderBottom: "1px solid var(--gd-line)" }}
      >
        <div className="gd-page flex items-center gap-1.5 px-2.5 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Link
            href={hubHref}
            aria-label="덱 허브로 돌아가기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-2)" }}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="gd-label">단어 학습</p>
            <h1 className="gd-t-sm truncate font-bold tracking-tight">{deckTitle}</h1>
          </div>
          {phase === "play" && total > 0 && (
            <span className="gd-mono gd-t-2xs shrink-0" style={{ color: "var(--gd-ink-2)" }}>
              {index + 1}/{total}
            </span>
          )}
        </div>
        <div className="gd-page px-2.5 pb-2">
          <div className="gd-meter">
            <span style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </header>

      <main className="gd-page gd-safe-b flex flex-1 flex-col px-4 py-4">
        {/* ── 로딩 ── */}
        {(phase === "loading" || phase === "finishing") && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <p className="gd-t-sm animate-pulse font-semibold" style={{ color: "var(--gd-ink-2)" }}>
              {phase === "loading" ? "카드를 불러오는 중입니다" : "학습 결과를 정리하는 중입니다"}
            </p>
          </div>
        )}

        {/* ── 오류 ── */}
        {phase === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="gd-t-base font-bold">카드를 불러오지 못했습니다</p>
            <p className="gd-t-xs" style={{ color: "var(--gd-ink-3)" }}>
              네트워크 상태를 확인한 뒤 다시 시도해 주세요.
            </p>
            <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
              <button type="button" onClick={() => void loadQueue()} className="gd-btn gd-btn-primary w-full">
                <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />
                다시 시도
              </button>
              <Link href={hubHref} className="gd-btn gd-btn-ghost w-full">
                덱으로 돌아가기
              </Link>
            </div>
          </div>
        )}

        {/* ── 완료 저장 실패 — 카드는 다 봤다. 재시도는 완료 POST 만 다시 부른다 ── */}
        {phase === "finish-error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="gd-t-base font-bold">결과 저장에 실패했습니다</p>
            <p className="gd-t-xs" style={{ color: "var(--gd-ink-3)" }}>
              카드는 모두 기록되었습니다. 다시 시도하면 결과만 다시 저장합니다.
            </p>
            <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
              <button
                type="button"
                onClick={() => void finishLearn()}
                className="gd-btn gd-btn-primary w-full"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />
                다시 시도
              </button>
              <Link href={hubHref} className="gd-btn gd-btn-ghost w-full">
                덱으로 돌아가기
              </Link>
            </div>
          </div>
        )}

        {/* ── 빈 상태 ── */}
        {phase === "empty" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="gd-t-base font-bold">학습할 카드가 없습니다</p>
            <p className="gd-t-xs" style={{ color: "var(--gd-ink-3)" }}>
              이 단어장의 카드를 모두 확인했습니다.
            </p>
            <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
              <Link href={hubHref} className="gd-btn gd-btn-primary w-full">
                덱 허브로 가기
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
              </Link>
            </div>
          </div>
        )}

        {/* ── 카드 ── */}
        {phase === "play" && item && !flipped && (
          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="gd-card flex min-h-[2.75rem] flex-1 flex-col items-center justify-center gap-3 px-5 py-8 text-center"
            aria-label="카드를 눌러 뜻을 확인"
          >
            <span className="flex items-center gap-1.5">
              <span className="gd-block-head">{VOCAB_POS_LABELS[item.pos] ?? item.pos}</span>
              <span className="gd-block-head">{VOCAB_TIER_LABELS[item.tier] ?? item.tier}</span>
            </span>
            <span className="gd-en gd-t-2xl font-bold" style={{ color: "var(--gd-ink)" }}>
              {item.lemma}
            </span>
            <span className="gd-t-2xs mt-4" style={{ color: "var(--gd-ink-3)" }}>
              카드를 누르면 뜻이 나옵니다
            </span>
          </button>
        )}

        {phase === "play" && item && flipped && (
          <div className="gd-pop flex flex-1 flex-col">
            <div className="gd-card flex-1 px-5 py-5">
              <div className="flex items-center gap-1.5">
                <span className="gd-en gd-t-md font-semibold" style={{ color: "var(--gd-ink-2)" }}>
                  {item.lemma}
                </span>
                <span className="gd-block-head">{VOCAB_POS_LABELS[item.pos] ?? item.pos}</span>
              </div>

              <p className="gd-t-xl mt-2 font-bold" style={{ color: "var(--gd-ink)" }}>
                {item.senseKo}
              </p>
              {item.senseEn && (
                <p className="gd-en gd-t-sm mt-1" style={{ color: "var(--gd-ink-2)" }}>
                  {item.senseEn}
                </p>
              )}

              {item.example && (
                <div className="gd-hairline-t mt-3.5 pt-3">
                  <p className="gd-label mb-1">기출 예문</p>
                  <p className="gd-en gd-t-sm" style={{ color: "var(--gd-ink)" }}>
                    {item.example.en}
                  </p>
                  <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-2)" }}>
                    {item.example.ko}
                  </p>
                </div>
              )}

              {item.collocations.length > 0 && (
                <div className="gd-hairline-t mt-3.5 pt-3">
                  <p className="gd-label mb-1.5">자주 붙는 표현</p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.collocations.map((c) => (
                      <span key={c} className="gd-block-head gd-en">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {submitError && (
              <p className="gd-t-xs mt-2 text-center" style={{ color: "var(--gd-bad)" }}>
                제출에 실패했습니다. 버튼을 다시 눌러 주세요.
              </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void answer("X")}
                disabled={submitting}
                className="gd-btn gd-btn-ghost"
              >
                몰랐습니다
              </button>
              <button
                type="button"
                onClick={() => void answer("O")}
                disabled={submitting}
                className="gd-btn gd-btn-primary"
              >
                알고 있었습니다
              </button>
            </div>
          </div>
        )}

        {/* ── 결과 ── */}
        {phase === "result" && result && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            {result.advanced ? (
              <>
                <div className="gd-pop flex flex-col items-center gap-3">
                  <CheckCircle2
                    className="h-12 w-12"
                    strokeWidth={1.75}
                    style={{ color: "var(--gd-good)" }}
                    aria-hidden
                  />
                  <p className="gd-t-xl font-bold" style={{ color: "var(--gd-good)" }}>
                    드릴 단계가 열렸습니다
                  </p>
                  <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
                    덱 단어 {result.total}개 중 {result.seen}개를 학습했습니다.
                  </p>
                </div>
                <div className="mt-3 flex w-full max-w-xs flex-col gap-2">
                  <Link href={hubHref} className="gd-btn gd-btn-primary w-full">
                    덱 허브로 가기
                    <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void loadQueue()}
                    className="gd-btn gd-btn-ghost w-full"
                  >
                    이어서 학습
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="gd-t-xl font-bold">
                  <span className="gd-mono">
                    {result.seen}/{result.total}
                  </span>{" "}
                  단어를 봤습니다
                </p>
                <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
                  80% 이상 보면 드릴이 열립니다. 이어서 학습해 보세요.
                </p>
                <div className="mt-3 flex w-full max-w-xs flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void loadQueue()}
                    className="gd-btn gd-btn-primary w-full"
                  >
                    이어서 학습
                    <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                  <Link href={hubHref} className="gd-btn gd-btn-ghost w-full">
                    덱으로 돌아가기
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
