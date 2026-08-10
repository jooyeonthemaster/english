"use client";

// ============================================================================
// 어법 훈련소 — AI 생성 패널 (v3 design §D5-3, 단위 D-2)
//
// 유닛 상세의 [이 유닛으로 AI 생성](CTA_LABELS.GENERATE_FROM_UNIT) 시드를 받아:
//  ① 요약(유닛·개념·난이도·문항 수) + 크레딧 사전 고지(「10문항 생성 = 20크레딧」)
//  ② POST /api/workbench/ai-jobs/grammar-studio → 문항당 잡 1개 인큐
//  ③ pollGrammarStudioGeneration 4초 주기 폴링 — 폴링이 곧 폴더 귀속(서버
//     액션이 완료 잡의 문항을 「어법 훈련소」 유닛 폴더에 멱등 귀속)
//  ④ 완료: 성공/실패 집계 + 「문제은행 폴더로 이동」 링크
//
// 정직 고지: AI 문항은 문제은행 저장 — 학생 드릴 뱅크 반입 아님(§D5-3 v3 제외).
// 시드의 itemTypes(드릴 6유형 필터)는 소비하지 않는다 — 생성물은 수능형
// GRAMMAR_ERROR 고정이라 드릴 유형 축과 무관(§D5-3 별세계 확정).
// 전 노출 문구 director-glossary 경유(GRAMMAR_STUDIO_GENERATE_COPY).
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import {
  pollGrammarStudioGeneration,
  type GrammarStudioCollectionRef,
  type GrammarStudioJobStatusRow,
} from "@/actions/workbench/grammar-studio-collections";
import { WideModal } from "@/components/layout/wide-modal";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  CONCEPT_SKELETON_BY_ID,
  UNIT_BY_ID,
  unitLabel,
} from "@/lib/grammar-drill/curriculum";
import { DIFFICULTY_LABEL } from "@/lib/grammar-drill/display";
import {
  GRAMMAR_STUDIO_GENERATE_COPY,
  grammarStudioCreditNotice,
} from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import type { GrammarStudioGenerateSeed } from "./unit-detail";

const COUNT_OPTIONS = [1, 3, 5, 10] as const;
const POLL_INTERVAL_MS = 4_000;
const TERMINAL_STATUSES = new Set(["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]);

type Phase =
  | { kind: "config" }
  | { kind: "starting" }
  | {
      kind: "running";
      jobIds: string[];
      seedFailedCount: number;
      jobs: GrammarStudioJobStatusRow[];
      collection: GrammarStudioCollectionRef | null;
      pollFailed: boolean;
    }
  | {
      kind: "done";
      total: number;
      success: number;
      failed: number;
      seedFailedCount: number;
      collection: GrammarStudioCollectionRef | null;
    }
  | { kind: "error"; message: string };

export function GenerateStudioPanel({
  seed,
  onClose,
}: {
  /** 유닛 상세의 현재 칩 선택 그대로(D-1 후속 계약) — 빈 배열 = 무필터 */
  seed: GrammarStudioGenerateSeed;
  onClose: () => void;
}) {
  const unit = UNIT_BY_ID.get(seed.unitId) ?? null;

  // 난이도: 시드 칩 선택의 최고 난이도를 초기값으로(미선택 시 D2 표준)
  const [difficulty, setDifficulty] = useState<number>(
    seed.difficulties.length > 0 ? Math.max(...seed.difficulties) : 2,
  );
  const [count, setCount] = useState<number>(10);
  const [phase, setPhase] = useState<Phase>({ kind: "config" });

  const conceptTitles = seed.conceptIds.map(
    (id) => CONCEPT_SKELETON_BY_ID.get(id)?.title ?? id,
  );
  const totalCredits = count * CREDIT_COSTS.AUTO_GEN_BATCH;
  const busy = phase.kind === "starting" || phase.kind === "running";

  // ── 폴링 체인 — running 상태마다 setTimeout 1개 예약(언마운트·전이 시 해제).
  // 폴링 액션이 서버에서 완료 잡의 문항 귀속까지 수행한다(폴링 = 귀속).
  useEffect(() => {
    if (phase.kind !== "running") return;
    let alive = true;
    const timer = setTimeout(async () => {
      let result: Awaited<ReturnType<typeof pollGrammarStudioGeneration>>;
      try {
        result = await pollGrammarStudioGeneration(phase.jobIds);
      } catch {
        if (alive) setPhase({ ...phase, pollFailed: true });
        return;
      }
      if (!alive) return;
      if (!result.success) {
        setPhase({ ...phase, pollFailed: true });
        return;
      }
      const collection = result.collection ?? phase.collection;
      const allTerminal =
        result.jobs.length === phase.jobIds.length &&
        result.jobs.every((j) => TERMINAL_STATUSES.has(j.status));
      if (allTerminal) {
        const success = result.jobs.reduce(
          (sum, j) =>
            sum + (j.status === "COMPLETED" || j.status === "PARTIAL" ? j.successCount : 0),
          0,
        );
        setPhase({
          kind: "done",
          total: phase.jobIds.length,
          success,
          failed: phase.jobIds.length - success,
          seedFailedCount: phase.seedFailedCount,
          collection,
        });
        return;
      }
      setPhase({ ...phase, jobs: result.jobs, collection, pollFailed: false });
    }, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [phase]);

  const handleStart = async () => {
    setPhase({ kind: "starting" });
    try {
      const res = await fetch("/api/workbench/ai-jobs/grammar-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitIds: [seed.unitId],
          conceptIds: seed.conceptIds,
          difficulty,
          count,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        jobIds?: string[];
        seedFailures?: unknown[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(body.jobIds) || body.jobIds.length === 0) {
        const message =
          res.status === 409
            ? GRAMMAR_STUDIO_GENERATE_COPY.UNIT_BUSY
            : res.status === 402
              ? GRAMMAR_STUDIO_GENERATE_COPY.INSUFFICIENT_CREDITS
              : res.status === 502
                ? GRAMMAR_STUDIO_GENERATE_COPY.ALL_FAILED
                : GRAMMAR_STUDIO_GENERATE_COPY.REQUEST_FAILED;
        setPhase({ kind: "error", message });
        return;
      }
      setPhase({
        kind: "running",
        jobIds: body.jobIds,
        seedFailedCount: Array.isArray(body.seedFailures) ? body.seedFailures.length : 0,
        jobs: [],
        collection: null,
        pollFailed: false,
      });
    } catch {
      setPhase({ kind: "error", message: GRAMMAR_STUDIO_GENERATE_COPY.REQUEST_FAILED });
    }
  };

  if (!unit) return null;

  const doneCount =
    phase.kind === "running"
      ? phase.jobs.filter((j) => TERMINAL_STATUSES.has(j.status)).length
      : 0;

  return (
    <WideModal
      open
      onClose={onClose}
      icon={Bot}
      title={GRAMMAR_STUDIO_GENERATE_COPY.TITLE}
      description={GRAMMAR_STUDIO_GENERATE_COPY.DESCRIPTION}
      maxWidthClassName="max-w-[620px]"
      disableBackdropClose={busy}
      footer={
        phase.kind === "config" || phase.kind === "error" ? (
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-[12.5px] font-bold tabular-nums text-blue-700">
              {grammarStudioCreditNotice(count, totalCredits)}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                {GRAMMAR_STUDIO_GENERATE_COPY.CANCEL}
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[12.5px] font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                <Bot className="size-3.5" aria-hidden />
                {GRAMMAR_STUDIO_GENERATE_COPY.START}
              </button>
            </div>
          </div>
        ) : phase.kind === "done" ? (
          <div className="flex w-full items-center justify-end gap-2">
            {phase.collection ? (
              <Link
                href={`/director/questions?collectionId=${phase.collection.collectionId}`}
                className="inline-flex h-9 items-center rounded-md bg-blue-600 px-4 text-[12.5px] font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                {GRAMMAR_STUDIO_GENERATE_COPY.GO_TO_BANK}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              {GRAMMAR_STUDIO_GENERATE_COPY.CLOSE}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {/* ── 생성 범위 요약 — 유닛·개념(시드 칩 그대로) ── */}
        <section className="flex flex-col gap-2">
          <h4 className="text-[12px] font-bold text-slate-500">
            {GRAMMAR_STUDIO_GENERATE_COPY.SECTION_SCOPE}
          </h4>
          <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-slate-800">
              <span className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-slate-500">
                {unitLabel(seed.unitId)}
              </span>
              <span className="truncate">{unit.title}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {conceptTitles.length === 0 ? (
                <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-slate-500">
                  {GRAMMAR_STUDIO_GENERATE_COPY.CONCEPTS_ALL}
                </span>
              ) : (
                conceptTitles.map((title) => (
                  <span
                    key={title}
                    className="max-w-full truncate rounded-md border border-blue-200 bg-blue-50/60 px-2 py-0.5 text-[11.5px] font-semibold text-blue-700"
                  >
                    {title}
                  </span>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ── 난이도 · 문항 수 ── */}
        <section className="flex flex-col gap-2">
          <h4 className="text-[12px] font-bold text-slate-500">
            {GRAMMAR_STUDIO_GENERATE_COPY.SECTION_OPTIONS}
          </h4>
          <div className="flex flex-col gap-2.5">
            <OptionRow label={GRAMMAR_STUDIO_GENERATE_COPY.DIFFICULTY_LABEL}>
              {[1, 2, 3, 4].map((d) => (
                <OptionChip
                  key={d}
                  label={DIFFICULTY_LABEL[String(d)] ?? `D${d}`}
                  active={difficulty === d}
                  disabled={busy}
                  onClick={() => setDifficulty(d)}
                />
              ))}
            </OptionRow>
            <OptionRow label={GRAMMAR_STUDIO_GENERATE_COPY.COUNT_LABEL}>
              {COUNT_OPTIONS.map((n) => (
                <OptionChip
                  key={n}
                  label={`${n}문항`}
                  active={count === n}
                  disabled={busy}
                  onClick={() => setCount(n)}
                />
              ))}
            </OptionRow>
          </div>
        </section>

        {/* ── 정직 고지 — 문제은행 저장(드릴 반입 아님) ── */}
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-500">
          {GRAMMAR_STUDIO_GENERATE_COPY.BANK_NOTE}
        </p>

        {/* ── 상태 표면 ── */}
        {phase.kind === "error" ? (
          <p className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-[12.5px] font-semibold text-rose-700">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {phase.message}
          </p>
        ) : null}

        {phase.kind === "starting" ? (
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600">
            <Loader2 className="size-4 animate-spin text-blue-600" aria-hidden />
            {GRAMMAR_STUDIO_GENERATE_COPY.STARTING}
          </p>
        ) : null}

        {phase.kind === "running" ? (
          <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-blue-700">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {GRAMMAR_STUDIO_GENERATE_COPY.PROGRESS(doneCount, phase.jobIds.length)}
            </p>
            <p className="text-[12px] text-slate-500">
              {GRAMMAR_STUDIO_GENERATE_COPY.RUNNING_NOTE}
            </p>
            {phase.seedFailedCount > 0 ? (
              <p className="text-[12px] font-semibold text-rose-600">
                {GRAMMAR_STUDIO_GENERATE_COPY.SEED_FAILED_NOTE(phase.seedFailedCount)}
              </p>
            ) : null}
            {phase.pollFailed ? (
              <p className="text-[12px] text-slate-400">
                {GRAMMAR_STUDIO_GENERATE_COPY.POLL_FAILED}
              </p>
            ) : null}
          </div>
        ) : null}

        {phase.kind === "done" ? (
          <div
            className={cn(
              "flex flex-col gap-1.5 rounded-lg border p-3",
              phase.success > 0
                ? "border-blue-200 bg-blue-50/40"
                : "border-rose-200 bg-rose-50/40",
            )}
          >
            <p
              className={cn(
                "flex items-center gap-1.5 text-[13px] font-bold",
                phase.success > 0 ? "text-blue-700" : "text-rose-700",
              )}
            >
              {phase.success > 0 ? (
                <CheckCircle2 className="size-4" aria-hidden />
              ) : (
                <TriangleAlert className="size-4" aria-hidden />
              )}
              {phase.success > 0
                ? `${GRAMMAR_STUDIO_GENERATE_COPY.DONE_TITLE} — ${GRAMMAR_STUDIO_GENERATE_COPY.DONE_SUMMARY(phase.success)}`
                : GRAMMAR_STUDIO_GENERATE_COPY.ALL_FAILED}
            </p>
            {phase.failed > 0 ? (
              <p className="text-[12px] font-semibold text-rose-600">
                {GRAMMAR_STUDIO_GENERATE_COPY.PARTIAL_NOTE(phase.failed)}
              </p>
            ) : null}
            {phase.seedFailedCount > 0 ? (
              <p className="text-[12px] font-semibold text-rose-600">
                {GRAMMAR_STUDIO_GENERATE_COPY.SEED_FAILED_NOTE(phase.seedFailedCount)}
              </p>
            ) : null}
            {phase.collection && phase.success > 0 ? (
              <p className="text-[12px] text-slate-600">
                {GRAMMAR_STUDIO_GENERATE_COPY.SAVED_TO(phase.collection.name)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </WideModal>
  );
}

/** 옵션 행 — 좌측 고정 캡션 + 칩(unit-detail ChipRow 관용 미러) */
function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="w-[52px] shrink-0 pt-1 text-[12px] font-semibold text-slate-500">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function OptionChip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-blue-600 bg-blue-50/60 text-blue-700 shadow-sm"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
      )}
    >
      {label}
    </button>
  );
}
