"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import {
  KO_PASSAGE_KIND_LABELS,
  type KoPassageKind,
} from "@/lib/korean/core/passage-meta";

import { TextInputBoard } from "../../passages/import/_components/intake/text/text-input-board";

export interface PastedPassageInput {
  title: string;
  content: string;
  /** 지문 과목 — 미지정=영어(기존 소비처 무변경), "KOREAN"=국어 직접입력. */
  subject?: "KOREAN";
  /** 국어 갈래 — subject === "KOREAN" 일 때만 의미. 호출부가 태그로 병합한다. */
  koKind?: KoPassageKind;
}

interface MultiPassagePasteProps {
  /** Persist every valid row as a Passage, then select them. Parent handles it. */
  onSubmitRows: (
    rows: PastedPassageInput[],
  ) => boolean | void | Promise<boolean | void>;
  /** True while the parent is persisting + refreshing the list. */
  saving: boolean;
  /** Hide the built-in text tutorial while the page-level tour is active. */
  suppressTutorial?: boolean;
  /**
   * 과목 스코프 — "KOREAN" 이면 국어 고정 모드: 과목 세그먼트 없이 갈래
   * 셀렉트·(가)(나) 힌트만 노출하고, 모든 행에 subject/koKind 를 동봉한다.
   * 미전달(기본) = 영어 — 기존 소비처(웹툰·유사문항·등록 등) UI 픽셀 동일.
   */
  subjectScope?: "KOREAN";
}

/** 갈래 셀렉트 표시 순서 — 비문학(독서) → 문학 → 문법 → 복합. */
const KO_KIND_OPTIONS = Object.entries(KO_PASSAGE_KIND_LABELS) as [
  KoPassageKind,
  string,
][];

type OutputMode = "verbatim" | "restored";

interface RestoreResponse {
  restoredText?: string;
  status?: "RESTORED" | "PARTIAL" | "NO_RESTORATION_NEEDED" | "FAILED";
  warnings?: string[];
  degraded?: boolean;
  error?: string;
  balance?: number;
  requiredCredits?: number;
}

async function restorePassageBeforeRegister(
  passage: PastedPassageInput,
): Promise<PastedPassageInput> {
  const res = await fetch("/api/workbench/restore-passage", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passageText: passage.content }),
  });
  const data = (await res.json().catch(() => ({}))) as RestoreResponse;

  if (!res.ok) {
    if (res.status === 402) {
      const required = data.requiredCredits
        ? ` 필요 크레딧: ${data.requiredCredits}`
        : "";
      const balance =
        typeof data.balance === "number" ? ` 현재 잔액: ${data.balance}` : "";
      throw new Error(
        data.error || `크레딧이 부족합니다.${required}${balance}`,
      );
    }
    throw new Error(data.error || "AI 원문 복원에 실패했습니다.");
  }

  if (data.degraded || data.status === "PARTIAL") {
    toast.warning("일부 지문은 복원본 확인이 필요할 수 있습니다.");
  }

  return {
    title: passage.title,
    content: (data.restoredText || passage.content).trim(),
  };
}

/**
 * Direct-input surface for question generation. It reuses the extraction page's
 * text-mode board so text paste, accumulation, resize, and tutorial UI stay
 * consistent across the workbench.
 */
export function MultiPassagePaste({
  onSubmitRows,
  saving,
  suppressTutorial = false,
  subjectScope,
}: MultiPassagePasteProps) {
  const [outputMode, setOutputMode] = useState<OutputMode>("verbatim");
  const [restoring, setRestoring] = useState(false);
  // ── 국어 고정 모드 — 과목 토글 없음. 갈래 셀렉트만 노출된다. ──
  const koreanFixed = subjectScope === "KOREAN";
  const [koKind, setKoKind] = useState<KoPassageKind>("READING_HUM");
  // AI 원문 복원은 영어 지문 전용 파이프라인 — 국어 지문은 그대로 등록만.
  const effectiveOutputMode: OutputMode = koreanFixed
    ? "verbatim"
    : outputMode;
  const busy = saving || restoring;

  const outputModeOptions = [
    {
      v: "verbatim" as const,
      label: "그대로 추출",
      badge: "지문당 무료",
    },
    {
      v: "restored" as const,
      label: "AI로 원문 복원",
      badge: (
        <span className="inline-flex items-center gap-0.5">
          지문당{" "}
          <CreditCostChip
            amount={CREDIT_COSTS.PASSAGE_RESTORATION}
            iconClassName="size-2.5"
          />
        </span>
      ),
    },
  ];

  const outputModeToggle = (
    <div
      className="flex min-w-0 items-center gap-3"
      data-generate-tour="paste-output-mode"
    >
      <div className="flex shrink-0 items-center gap-1">
        {outputModeOptions.map((opt) => {
          const active = effectiveOutputMode === opt.v;
          // 국어 지문은 AI 원문 복원(영어 전용) 비활성 — 그대로 등록만.
          const koDisabled = koreanFixed && opt.v === "restored";
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => setOutputMode(opt.v)}
              disabled={busy || koDisabled}
              title={
                koDisabled
                  ? "국어 지문은 AI 원문 복원 없이 그대로 등록됩니다."
                  : undefined
              }
              aria-pressed={active}
              className={
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 " +
                (active
                  ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
                  : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600")
              }
            >
              {opt.label}
              <span
                className={
                  "rounded px-1 py-0.5 text-[9.5px] font-bold " +
                  (active
                    ? opt.v === "restored"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-500"
                    : "bg-slate-100 text-slate-400")
                }
              >
                {opt.badge}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── 국어 고정 모드 컨트롤 — 갈래 셀렉트 + 복합지문 규약 힌트만. ──
  // 과목 세그먼트는 두지 않는다(국어 라우트는 국어 고정, 영어 라우트는 이
  // 컨트롤 자체가 렌더되지 않아 기존 UI 픽셀 동일).
  const subjectControls = koreanFixed ? (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <select
        value={koKind}
        onChange={(e) => setKoKind(e.target.value as KoPassageKind)}
        disabled={busy}
        aria-label="국어 갈래"
        className="h-7 cursor-pointer appearance-none rounded-md border border-slate-200 bg-white px-2 pr-6 text-[12px] font-medium text-slate-600 transition-all hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {KO_KIND_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <span className="text-[10.5px] leading-tight text-slate-400">
        복합 지문은 행 머리에 (가)/(나) 라벨을 붙여 붙여넣으세요.
      </span>
    </div>
  ) : null;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 출력 방식 — 위 '직접 입력' 탭에서 말풍선처럼 뻗어나온 하위 선택임을
          드러낸다(직접 입력 > 그대로 추출/AI 복원의 계층감). */}
      <div className="border-b border-slate-100 px-3 pb-2 pt-2">
        <div className="relative w-fit rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 shadow-sm">
          {/* 말풍선 꼬리 — 브레드크럼 첫 항목 '직접 입력' 탭 중앙 아래에서 삐져나오게. */}
          <span
            aria-hidden="true"
            className="absolute -top-[6px] left-12 z-10 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border-l border-t border-blue-200 bg-blue-50"
          />
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {subjectControls}
            {subjectControls ? (
              <span
                aria-hidden="true"
                className="h-4 w-px shrink-0 bg-blue-200"
              />
            ) : null}
            {outputModeToggle}
          </div>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col"
        data-generate-tour="paste-board"
      >
        <TextInputBoard
          busy={busy}
          outputMode={effectiveOutputMode}
          suppressTutorial={suppressTutorial}
          onStart={async (passages) => {
            const rows = passages.map((passage) => ({
              title: passage.title ?? "",
              content: passage.text,
              // 국어 고정 모드에서만 과목·갈래 동봉 — 영어는 기존 형태 그대로.
              ...(koreanFixed
                ? { subject: "KOREAN" as const, koKind }
                : {}),
            }));

            if (effectiveOutputMode === "verbatim") {
              const ok = await onSubmitRows(rows);
              return ok !== false;
            }

            setRestoring(true);
            try {
              const restoredRows: PastedPassageInput[] = [];
              for (const row of rows) {
                restoredRows.push(await restorePassageBeforeRegister(row));
              }
              const ok = await onSubmitRows(restoredRows);
              return ok !== false;
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "AI 원문 복원 중 오류가 발생했습니다.",
              );
              return false;
            } finally {
              setRestoring(false);
            }
          }}
          reviewLabel={
            effectiveOutputMode === "restored" ? "복원할 지문" : "등록할 지문"
          }
          emptyTitle={
            effectiveOutputMode === "restored"
              ? "문제·선지 텍스트를 붙여넣고 지문을 쌓아요"
              : "텍스트를 붙여넣고 지문을 쌓아요"
          }
          guideStartLabel={
            effectiveOutputMode === "restored" ? "복원 후 등록" : "등록하고 선택"
          }
          startLabel="다음으로 (내 지문함)"
          restoredStartLabel="다음으로 (내 지문함)"
          busyLabel={restoring ? "복원 중" : "등록 중"}
        />
      </div>
    </section>
  );
}
