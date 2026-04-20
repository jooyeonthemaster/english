"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useExtractionStore } from "@/lib/extraction/store";
import { useExtractionStream } from "@/hooks/use-extraction-stream";
import { isValidMode, MODES } from "@/lib/extraction/modes";
import { ModeSelectStep } from "./mode-select-step";
import { UploadStep } from "./upload-step";
import { ProcessingStep } from "./processing-step";
import { ReviewStep } from "./review-step";
import { DoneStep } from "./done-step";

interface Props {
  initialCreditBalance: number;
}

const LAST_MODE_KEY = "nara-last-extraction-mode";
const SKIP_KEY = "nara-extraction-skip-mode-select";

// `useSyncExternalStore` subscribes to `storage` events so we can read
// localStorage in a SSR-safe, lint-clean way (no `setState`-in-effect).
// The `skipModeSelect` preference rarely changes cross-tab, but subscribing
// keeps things consistent without extra render bookkeeping.
function subscribeToStorage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function readSkipModeSelect(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SKIP_KEY) === "true";
  } catch {
    return false;
  }
}

function readLastMode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_MODE_KEY);
  } catch {
    return null;
  }
}

/**
 * The root client component for /director/workbench/passages/import.
 *
 * Layout note: this page deliberately overflows the default dashboard
 * padding on horizontal axes — we want the full viewport width for the
 * 3-panel review UI. The AdminShell gives us `flex-1 overflow-y-auto p-6`,
 * so we reset inner padding/width ourselves.
 */
export function BulkExtractClient({ initialCreditBalance }: Props) {
  const phase = useExtractionStore((s) => s.phase);
  const jobId = useExtractionStore((s) => s.jobId);
  const error = useExtractionStore((s) => s.error);
  const mode = useExtractionStore((s) => s.mode);
  const setMode = useExtractionStore((s) => s.setMode);
  const setPhase = useExtractionStore((s) => s.setPhase);

  useExtractionStream({ jobId, enabled: phase === "processing" || phase === "starting" });

  // Track whether we've bootstrapped the initial phase once to avoid loops.
  const bootstrappedRef = useRef(false);

  // `mounted` + `skipModeSelect` gate everything that depends on localStorage
  // — the server always returns the SSR defaults (mounted=false, skip=false)
  // so the first client render matches SSR. `useSyncExternalStore` then
  // re-renders with the real value without calling setState inside effect.
  const skipModeSelect = useSyncExternalStore(
    subscribeToStorage,
    readSkipModeSelect,
    () => false,
  );
  // Derive `mounted` from the same source: on the server the getServerSnapshot
  // returns false, on the client `useSyncExternalStore` immediately re-reads
  // and returns true after hydration.
  const mounted = useSyncExternalStore(
    subscribeToStorage,
    () => true,
    () => false,
  );

  // Decide initial phase: if the user opted into skipping mode-select and we
  // have a remembered mode, jump straight to "idle". Otherwise show mode-select.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const skip = readSkipModeSelect();
    const lastMode = readLastMode();
    if (skip && isValidMode(lastMode)) {
      const cfg = MODES[lastMode];
      if (!cfg.disabled) {
        setMode(cfg.id);
        setPhase("idle");
        return;
      }
    }
    setPhase("mode-select");
  }, [setMode, setPhase]);

  // Defensive fallback: if we land in a non-select phase without a mode,
  // send the user back to mode-select (e.g. stale state after reset).
  useEffect(() => {
    if (
      !mode &&
      phase !== "mode-select" &&
      phase !== "error" &&
      phase !== "done"
    ) {
      setPhase("mode-select");
    }
  }, [mode, phase, setPhase]);

  useEffect(() => {
    // Warn the user before closing the tab while a job is still uploading
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (phase === "preparing" || phase === "uploading" || phase === "starting") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [phase]);

  return (
    <div className="-m-6 flex min-h-[calc(100vh-56px)] flex-col bg-[#F4F6F9]">
      <Header
        phase={phase}
        initialCreditBalance={initialCreditBalance}
        mounted={mounted}
        skipModeSelect={skipModeSelect}
      />

      {error ? (
        <div className="mx-8 mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-semibold">오류가 발생했습니다</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      {/*
       * Use `min-h-0` + `overflow-y-auto` so the column can actually shrink
       * inside its flex parent and scroll when the viewport is short. Without
       * `min-h-0` the inner content would push the container beyond the
       * viewport and clip silently on mode-select / upload steps.
       */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {phase === "mode-select" ? (
          <ModeSelectStep />
        ) : phase === "idle" || phase === "preparing" || phase === "error" ? (
          <UploadStep />
        ) : phase === "uploading" || phase === "starting" || phase === "processing" ? (
          <ProcessingStep />
        ) : phase === "reviewing" || phase === "committing" ? (
          <ReviewStep />
        ) : phase === "done" ? (
          <DoneStep />
        ) : null}
      </div>
    </div>
  );
}

function Header({
  phase,
  initialCreditBalance,
  mounted,
  skipModeSelect,
}: {
  phase: string;
  initialCreditBalance: number;
  mounted: boolean;
  skipModeSelect: boolean;
}) {
  // Render the 5-step flow on the server and on the first client paint
  // (`mounted=false`) so SSR output matches the initial client output — this
  // is the invariant that eliminates hydration mismatches. Only after mount
  // do we honour the user's "skip mode-select" preference.
  const showModeStep =
    phase === "mode-select" || !mounted || !skipModeSelect;

  const steps: { key: string; label: string }[] = showModeStep
    ? [
        { key: "mode", label: "1. 모드" },
        { key: "upload", label: "2. 업로드" },
        { key: "process", label: "3. 처리" },
        { key: "review", label: "4. 검토" },
        { key: "done", label: "5. 완료" },
      ]
    : [
        { key: "upload", label: "1. 업로드" },
        { key: "process", label: "2. 처리" },
        { key: "review", label: "3. 검토" },
        { key: "done", label: "4. 완료" },
      ];

  const active =
    phase === "mode-select"
      ? "mode"
      : phase === "idle" || phase === "preparing" || phase === "error"
        ? "upload"
        : phase === "uploading" || phase === "starting" || phase === "processing"
          ? "process"
          : phase === "reviewing" || phase === "committing"
            ? "review"
            : "done";

  return (
    <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/70 px-8 py-4 backdrop-blur">
      <div>
        <h1 className="text-[18px] font-bold tracking-tight text-slate-900">
          시험지 일괄 등록
        </h1>
        <p className="mt-0.5 text-[12px] text-slate-500">
          PDF 또는 이미지를 업로드하면 지문을 자동으로 추출해서 등록합니다.
        </p>
      </div>

      <div className="flex items-center gap-8">
        <ol className="flex items-center gap-1 text-[12px]">
          {steps.map((s, i) => {
            const isActive = s.key === active;
            const activeIdx = steps.findIndex((x) => x.key === active);
            const isPast = activeIdx > i;
            return (
              <li
                key={s.key}
                className={
                  "flex items-center gap-2 rounded-full px-3 py-1.5 font-medium transition-colors " +
                  (isActive
                    ? "bg-sky-100 text-sky-700"
                    : isPast
                      ? "text-sky-600"
                      : "text-slate-400")
                }
              >
                <span className="tabular-nums">{s.label}</span>
                {i < steps.length - 1 ? (
                  <span className="text-slate-300">›</span>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            잔여 크레딧
          </span>
          <span className="text-[13px] font-bold tabular-nums text-sky-600">
            {initialCreditBalance.toLocaleString("ko-KR")}
          </span>
        </div>
      </div>
    </div>
  );
}
