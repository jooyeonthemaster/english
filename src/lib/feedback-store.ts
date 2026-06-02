/**
 * Tiny external store that lets any client component (e.g. the sidebar
 * "무료 크레딧 신청하기" button) open the shared "협업 피드백 이벤트" modal that is
 * mounted once in the director layout. Read it with useSyncExternalStore.
 */

export interface FeedbackSnapshot {
  open: boolean;
  step: 1 | 2;
}

const CLOSED: FeedbackSnapshot = { open: false, step: 1 };

let snapshot: FeedbackSnapshot = CLOSED;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): FeedbackSnapshot {
  return snapshot;
}

/** Stable across SSR + first hydration render (avoids a hydration mismatch). */
function getServerSnapshot(): FeedbackSnapshot {
  return CLOSED;
}

function open(step: 1 | 2 = 1) {
  snapshot = { open: true, step };
  emit();
}

function setStep(step: 1 | 2) {
  if (snapshot.open && snapshot.step === step) return;
  snapshot = { open: snapshot.open, step };
  emit();
}

function close() {
  if (!snapshot.open) return;
  snapshot = CLOSED;
  emit();
}

export const feedbackStore = {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  open,
  setStep,
  close,
};

/** Convenience trigger — opens the modal at the phone-reveal step by default. */
export function requestOpenFeedback(step: 1 | 2 = 2) {
  open(step);
}
