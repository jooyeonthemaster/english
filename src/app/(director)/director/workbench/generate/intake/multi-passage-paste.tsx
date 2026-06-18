"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";

import { TextInputBoard } from "../../passages/import/_components/intake/text/text-input-board";

export interface PastedPassageInput {
  title: string;
  content: string;
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
}

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
}: MultiPassagePasteProps) {
  const [outputMode, setOutputMode] = useState<OutputMode>("verbatim");
  const [restoring, setRestoring] = useState(false);
  const busy = saving || restoring;

  const outputModeOptions = [
    {
      v: "verbatim" as const,
      label: "그대로 추출",
      badge: "추가 비용 없음",
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
          const active = outputMode === opt.v;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => setOutputMode(opt.v)}
              disabled={busy}
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
          {outputModeToggle}
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col"
        data-generate-tour="paste-board"
      >
        <TextInputBoard
          busy={busy}
          outputMode={outputMode}
          suppressTutorial={suppressTutorial}
          onStart={async (passages) => {
            const rows = passages.map((passage) => ({
              title: passage.title ?? "",
              content: passage.text,
            }));

            if (outputMode === "verbatim") {
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
            outputMode === "restored" ? "복원할 지문" : "등록할 지문"
          }
          emptyTitle={
            outputMode === "restored"
              ? "문제·선지 텍스트를 붙여넣고 지문을 쌓아요"
              : "텍스트를 붙여넣고 지문을 쌓아요"
          }
          guideStartLabel={
            outputMode === "restored" ? "복원 후 등록" : "등록하고 선택"
          }
          startLabel="지문 등록하고 선택"
          restoredStartLabel="복원하여 등록하고 선택"
          busyLabel={restoring ? "복원 중" : "등록 중"}
        />
      </div>
    </section>
  );
}
