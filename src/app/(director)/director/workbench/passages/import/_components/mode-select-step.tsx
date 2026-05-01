"use client";

// ============================================================================
// ModeSelectStep — first screen of /director/workbench/passages/import.
//
// Lets the director choose one of four extraction modes (M1~M4).
// Renders one card per MODE_LIST entry and hands off to UploadStep by setting
// `phase = "idle"` after `setMode()`.
// ============================================================================

import {
  useCallback,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  FileText,
  ListChecks,
  NotebookPen,
  FilePlus2,
  type LucideIcon,
} from "lucide-react";
import { useExtractionStore } from "@/lib/extraction/store";
import {
  MODE_LIST,
  MODES,
  isValidMode,
  type ExtractionMode,
  type ModeConfig,
  type ModeIcon,
} from "@/lib/extraction/modes";

const ICON_MAP: Record<ModeIcon, LucideIcon> = {
  FileText,
  ListChecks,
  NotebookPen,
  FilePlus2,
};

const LAST_MODE_KEY = "yshin-last-extraction-mode";
const SKIP_KEY = "yshin-extraction-skip-mode-select";

// Subscribe to the `storage` event so cross-tab changes trickle through.
function subscribeToStorage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function readLastMode(): ExtractionMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LAST_MODE_KEY);
    return isValidMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

function readSkipNext(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SKIP_KEY) === "true";
  } catch {
    return false;
  }
}

export function ModeSelectStep() {
  const mode = useExtractionStore((s) => s.mode);
  const setMode = useExtractionStore((s) => s.setMode);
  const setPhase = useExtractionStore((s) => s.setPhase);

  // Read localStorage values via `useSyncExternalStore` so hydration is safe
  // and we never call setState inside an effect (lint rule
  // `react-hooks/set-state-in-effect`).
  const lastMode = useSyncExternalStore(
    subscribeToStorage,
    readLastMode,
    () => null,
  );
  const persistedSkipNext = useSyncExternalStore(
    subscribeToStorage,
    readSkipNext,
    () => false,
  );
  // Keep an override for the optimistic checkbox toggle — we immediately
  // reflect the user's intent without waiting for the storage event.
  const [skipNextOverride, setSkipNextOverride] = useState<boolean | null>(null);
  const skipNext = skipNextOverride ?? persistedSkipNext;

  const pickMode = useCallback(
    (next: ModeConfig) => {
      if (next.disabled) return;
      setMode(next.id);
      try {
        window.localStorage.setItem(LAST_MODE_KEY, next.id);
      } catch {
        // ignore
      }
      setPhase("idle");
    },
    [setMode, setPhase],
  );

  const toggleSkip = useCallback((checked: boolean) => {
    setSkipNextOverride(checked);
    try {
      if (checked) {
        window.localStorage.setItem(SKIP_KEY, "true");
      } else {
        window.localStorage.removeItem(SKIP_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  const lastModeConfig = useMemo(
    () => (lastMode ? MODES[lastMode] : null),
    [lastMode],
  );

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-8 py-10">
      <header className="space-y-1.5">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
          시험지 인식 · 어떤 자료를 등록하나요?
        </h2>
        <p className="text-[13px] text-slate-500">
          업로드할 자료의 형태에 맞게 모드를 선택하면, AI가 그에 맞춰 지문·문제·해설·시험 정보를
          자동으로 분리해 저장합니다.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODE_LIST.map((config) => (
          <ModeCard
            key={config.id}
            config={config}
            active={mode === config.id}
            onSelect={pickMode}
          />
        ))}
      </div>

      <div className="flex flex-col items-start gap-4 rounded-xl border border-slate-200 bg-white/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-600">
          {lastModeConfig ? (
            <>
              <span className="text-slate-500">이전에 쓴 모드</span>
              <button
                type="button"
                onClick={() => pickMode(lastModeConfig)}
                className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[12px] font-semibold text-sky-700 transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                <LastModeIcon icon={lastModeConfig.icon} />
                {lastModeConfig.label}
                <span className="text-[10px] font-medium text-sky-500">
                  {lastModeConfig.shortLabel}
                </span>
              </button>
            </>
          ) : (
            <span className="text-slate-400">
              처음 사용 중입니다. 위의 카드 중 하나를 선택하세요.
            </span>
          )}
        </div>

        <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[12px] text-slate-600">
          <input
            type="checkbox"
            checked={skipNext}
            onChange={(e) => toggleSkip(e.target.checked)}
            className="size-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          다음부터 이 모드로 바로 시작
        </label>
      </div>
    </div>
  );
}

function LastModeIcon({ icon }: { icon: ModeIcon }) {
  const Icon = ICON_MAP[icon];
  return <Icon className="size-3.5" strokeWidth={1.8} />;
}

function ModeCard({
  config,
  active,
  onSelect,
}: {
  config: ModeConfig;
  active: boolean;
  onSelect: (config: ModeConfig) => void;
}) {
  const Icon = ICON_MAP[config.icon];
  const disabled = Boolean(config.disabled);
  const titleId = useId();
  const descriptionId = useId();

  const handleActivate = () => {
    if (disabled) return;
    onSelect(config);
  };

  const base =
    "group relative flex h-[280px] w-full flex-col overflow-hidden rounded-2xl border px-5 py-5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2";
  const state = disabled
    ? "cursor-not-allowed border-slate-200 bg-slate-50/70 opacity-60 grayscale"
    : active
      ? "cursor-pointer border-sky-300 bg-sky-50/40 ring-2 ring-sky-500"
      : "cursor-pointer border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/20";

  // A11y: use a real <button>, and only set `aria-pressed` on enabled cards —
  // `aria-pressed` on disabled items confuses screen readers. Disabled cards
  // keep `aria-disabled="true"` + `tabIndex={-1}` so they stay announceable
  // but unreachable via Tab, and the click handler short-circuits.
  return (
    <button
      type="button"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-pressed={disabled ? undefined : active}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={handleActivate}
      className={`${base} ${state}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={
            "flex size-14 items-center justify-center rounded-xl " +
            (disabled
              ? "bg-slate-200/70 text-slate-500"
              : "bg-sky-500/10 text-sky-600")
          }
        >
          <Icon className="size-7" strokeWidth={1.6} />
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={
              "rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider " +
              (disabled
                ? "border-slate-300 bg-white text-slate-500"
                : active
                  ? "border-sky-300 bg-white text-sky-700"
                  : "border-slate-200 bg-white text-slate-500")
            }
          >
            {config.shortLabel}
          </span>
          {disabled ? (
            <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              {config.disabledReason ?? "준비 중"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-1">
        <div id={titleId} className="text-[15px] font-semibold text-slate-900">
          {config.label}
        </div>
        <div
          id={descriptionId}
          className="text-[11.5px] leading-snug text-slate-500"
        >
          {config.description}
        </div>
      </div>

      <div className="mt-auto space-y-1.5 border-t border-slate-100 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          생성되는 것
        </div>
        <ul className="space-y-0.5 text-[11px] text-slate-600">
          {config.producedEntities.slice(0, 3).map((entity) => (
            <li key={entity.name} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={
                  "inline-block size-1 rounded-full " +
                  (disabled ? "bg-slate-400" : "bg-sky-500")
                }
              />
              <span className="font-medium text-slate-700">{entity.name}</span>
            </li>
          ))}
          {config.producedEntities.length > 3 ? (
            <li className="pl-3 text-[10px] text-slate-400">
              외 {config.producedEntities.length - 3}개
            </li>
          ) : null}
        </ul>
      </div>
    </button>
  );
}
