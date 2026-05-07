import { processWebtoonGeneration } from "@/lib/webtoon-processor";

interface LocalWorkerState {
  queue: string[];
  queued: Set<string>;
  running: number;
  scheduled: boolean;
}

const globalForWebtoonWorker = globalThis as unknown as {
  __naraWebtoonWorker?: LocalWorkerState;
};

const state =
  globalForWebtoonWorker.__naraWebtoonWorker ??
  (globalForWebtoonWorker.__naraWebtoonWorker = {
    queue: [],
    queued: new Set<string>(),
    running: 0,
    scheduled: false,
  });

export function shouldUseLocalWebtoonWorker(): boolean {
  const mode = process.env.WEBTOON_GENERATION_MODE?.trim().toLowerCase();
  if (process.env.NODE_ENV === "production") return false;
  if (mode === "local" || mode === "direct") return true;
  if (mode === "trigger" || mode === "trigger.dev") return false;
  return true;
}

export function enqueueLocalWebtoonGeneration(webtoonId: string): boolean {
  if (!shouldUseLocalWebtoonWorker()) return false;
  if (state.queued.has(webtoonId)) return true;

  state.queued.add(webtoonId);
  state.queue.push(webtoonId);
  scheduleDrain();
  return true;
}

export function enqueueLocalWebtoonGenerations(webtoonIds: string[]): number {
  let count = 0;
  for (const webtoonId of webtoonIds) {
    if (enqueueLocalWebtoonGeneration(webtoonId)) count += 1;
  }
  return count;
}

function scheduleDrain() {
  if (state.scheduled) return;
  state.scheduled = true;
  setTimeout(drainQueue, 0);
}

function drainQueue() {
  state.scheduled = false;
  const concurrency = getConcurrency();

  while (state.running < concurrency && state.queue.length > 0) {
    const webtoonId = state.queue.shift();
    if (!webtoonId) continue;

    state.running += 1;
    void processWebtoonGeneration(webtoonId, { source: "local" })
      .catch((err) => {
        console.error("[webtoon-local-worker] unhandled generation error", {
          webtoonId,
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        state.running -= 1;
        state.queued.delete(webtoonId);
        if (state.queue.length > 0) scheduleDrain();
      });
  }
}

function getConcurrency(): number {
  const parsed = Number.parseInt(process.env.WEBTOON_LOCAL_CONCURRENCY ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 2);
  }
  return 1;
}
