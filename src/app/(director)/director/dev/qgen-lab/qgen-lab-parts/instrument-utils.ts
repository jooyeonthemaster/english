// Aside 계기 — window.__qgenLab(LAB-SPEC §6 형상 그대로). 상태 변화마다 통째로 갈아 끼운다
// (폴링하는 쪽이 부분 갱신 중간 상태를 보지 않게).

export const QGEN_LAB_UI_VERSION = "qgen-lab-ui/26-09-25.1";

export interface QgenLabInstrumentItem {
  key: string;
  runId: string | null;
  status: string;
  clientMs: number | null;
  serverMs: number | null;
}

export interface QgenLabInstrument {
  version: string;
  batch: {
    id: string;
    total: number;
    done: number;
    running: number;
    failed: number;
    items: QgenLabInstrumentItem[];
  } | null;
  lastError: string | null;
}

declare global {
  interface Window {
    __qgenLab?: QgenLabInstrument;
  }
}

function current(): QgenLabInstrument {
  if (typeof window === "undefined") return { version: QGEN_LAB_UI_VERSION, batch: null, lastError: null };
  return window.__qgenLab ?? { version: QGEN_LAB_UI_VERSION, batch: null, lastError: null };
}

export function initInstrument(): void {
  if (typeof window === "undefined") return;
  window.__qgenLab = { ...current(), version: QGEN_LAB_UI_VERSION };
}

export function publishBatch(batch: QgenLabInstrument["batch"]): void {
  if (typeof window === "undefined") return;
  window.__qgenLab = { ...current(), version: QGEN_LAB_UI_VERSION, batch };
}

export function publishError(message: string | null): void {
  if (typeof window === "undefined") return;
  window.__qgenLab = { ...current(), version: QGEN_LAB_UI_VERSION, lastError: message };
}
