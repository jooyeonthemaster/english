"use client";

import { useSyncExternalStore } from "react";
import { Pin, PinOff } from "lucide-react";
import { ManualQuestionBookIcon } from "./manual-question-book-icon";
import {
  getManualQuickAccessServerSnapshot,
  readManualQuickAccessEnabled,
  subscribeManualQuickAccess,
  writeManualQuickAccessEnabled,
} from "./manual-quick-access-preferences";

export function ManualQuickAccessToggle() {
  const enabled = useSyncExternalStore(
    subscribeManualQuickAccess,
    readManualQuickAccessEnabled,
    getManualQuickAccessServerSnapshot,
  );

  function toggle() {
    writeManualQuickAccessEnabled(!enabled);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={toggle}
      className={`hidden h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-[13px] font-bold shadow-sm transition lg:inline-flex ${
        enabled
          ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
          : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700"
      }`}
    >
      <ManualQuestionBookIcon className="size-4" />
      매뉴얼 고정
      {enabled ? <Pin className="size-3.5" aria-hidden="true" /> : <PinOff className="size-3.5" aria-hidden="true" />}
    </button>
  );
}
