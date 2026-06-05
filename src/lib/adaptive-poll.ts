// ============================================================================
// adaptive-poll — a bandwidth-frugal replacement for `setInterval(load, 5000)`.
//
// Why: several workbench surfaces poll heavy list endpoints (e.g.
// /api/workbench/ai-jobs) every few seconds for the *entire* time a tab is
// open. A tab left open in the background, or sitting idle with nothing in
// flight, kept re-downloading the same payload forever — the dominant driver
// of Vercel "Fast Origin Transfer" cost.
//
// This helper keeps the same "live updates while you watch" feel but:
//   1. PAUSES entirely while the tab is hidden (background tab → 0 requests),
//      and refreshes immediately when you return to it.
//   2. BACKS OFF (activeMs → … → idleMs) when consecutive polls return
//      identical data (nothing is happening), and snaps back to activeMs the
//      instant the data changes (a job starts / progresses / finishes).
//
// `run` performs one poll and returns a cheap *signature* of the data (e.g.
// `id:status:count` joined per row). Returning the same signature twice means
// "no change". Return `null` to signal a failed/skipped poll (no backoff, no
// signature update). `run` receives an AbortSignal that fires on teardown so
// it can abort the fetch and skip any post-await state updates.
// ============================================================================

export interface AdaptivePollOptions {
  /** Poll cadence while data is actively changing. */
  activeMs: number;
  /** Slowest cadence reached after repeated unchanged polls. */
  idleMs: number;
  /** Perform one poll. Return a data signature, or null on failure/skip. */
  run: (signal: AbortSignal) => Promise<string | null>;
  /**
   * Hard ceiling on how long a single `run()` may take before it is treated as a
   * failed poll and the next tick is armed anyway. Without this, a request that
   * hangs and never settles would strand the loop (running=true, no timer) and
   * silently kill all further polling until unmount. Default 30s.
   */
  runTimeoutMs?: number;
}

/**
 * Starts an adaptive poll loop. Returns a cleanup function — call it from a
 * React effect's teardown (or whenever you want to stop).
 */
export function startAdaptivePoll(opts: AdaptivePollOptions): () => void {
  const { activeMs, idleMs, run, runTimeoutMs = 30_000 } = opts;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let delay = activeMs;
  let lastSig: string | null = null;
  let running = false;
  const controller = new AbortController();

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (ms: number) => {
    clearTimer();
    if (!stopped) timer = setTimeout(tick, ms);
  };

  const isHidden = () =>
    typeof document !== "undefined" && document.visibilityState === "hidden";

  const tick = async () => {
    // `running` guard makes overlapping triggers (a scheduled timer firing while
    // an onVisibility-initiated poll is mid-flight) a no-op → never two
    // concurrent fetches.
    if (stopped || running) return;
    // Paused while backgrounded; `onVisibility` resumes us when the tab returns.
    if (isHidden()) return;

    running = true;

    // Per-tick abort + timeout race: bounds how long `run()` can hold the loop.
    // The race settles on timeout even if run() ignores the signal entirely, so a
    // hung request can never permanently stall the loop; aborting the per-tick
    // controller also best-effort cancels the in-flight fetch.
    const tickController = new AbortController();
    const relayAbort = () => tickController.abort();
    controller.signal.addEventListener("abort", relayAbort, { once: true });
    if (controller.signal.aborted) tickController.abort();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutGuard = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        reject,
        runTimeoutMs,
        new Error("adaptive-poll: run() timed out"),
      );
    });

    try {
      const sig = await Promise.race([run(tickController.signal), timeoutGuard]);
      if (stopped) return;
      if (sig !== null) {
        if (sig === lastSig) {
          delay = Math.min(delay * 2, idleMs); // unchanged → back off
        } else {
          delay = activeMs; // changed → poll fast again
          lastSig = sig;
        }
      }
    } catch {
      // run() threw / aborted / timed out — treat as a failed poll, keep the loop
      // alive at the current cadence (no signature update, no backoff change).
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      controller.signal.removeEventListener("abort", relayAbort);
      tickController.abort(); // best-effort cleanup of any still-pending fetch
      running = false;
      // ALWAYS re-arm unless torn down → the loop can never go permanently silent
      // after a single failed/hung request.
      if (!stopped) schedule(delay);
    }
  };

  const onVisibility = () => {
    if (stopped || isHidden()) return;
    // Returning to the tab: refresh now and resume at the fast cadence. Drop any
    // pending scheduled tick first so we don't leave a stale timer queued.
    delay = activeMs;
    clearTimer();
    void tick();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }

  void tick(); // initial load

  return () => {
    stopped = true;
    clearTimer();
    controller.abort();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}
