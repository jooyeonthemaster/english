import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
} from "react";

const INTERACTIVE_CARD_TARGET_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "[role='button']",
  "[role='checkbox']",
  "[role='menuitem']",
  "[contenteditable='true']",
  "[data-card-click-ignore='true']",
].join(",");

function hasSelectedText() {
  if (typeof window === "undefined") return false;
  return Boolean(window.getSelection()?.toString().trim());
}

function hasInteractiveCardTarget(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const interactive = target.closest(INTERACTIVE_CARD_TARGET_SELECTOR);
  return Boolean(interactive && interactive !== event.currentTarget);
}

function shouldIgnoreBasicCardPointer(
  event: MouseEvent<HTMLElement>,
  { allowShift = false } = {},
) {
  if (event.defaultPrevented) return true;
  if (event.button !== 0) return true;
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    (!allowShift && event.shiftKey)
  ) {
    return true;
  }
  return false;
}

export function shouldIgnoreCardClick(event: MouseEvent<HTMLElement>) {
  if (shouldIgnoreBasicCardPointer(event)) return true;
  if (hasSelectedText()) return true;
  return hasInteractiveCardTarget(event);
}

export function shouldIgnoreCardDoubleClick(event: MouseEvent<HTMLElement>) {
  if (shouldIgnoreBasicCardPointer(event)) return true;
  return hasInteractiveCardTarget(event);
}

export function shouldIgnoreCardSelectionClick(
  event: MouseEvent<HTMLElement>,
) {
  if (shouldIgnoreBasicCardPointer(event, { allowShift: true })) return true;
  if (hasSelectedText()) return true;
  return hasInteractiveCardTarget(event);
}

export function preventCardDoubleClickTextSelection(
  event: MouseEvent<HTMLElement>,
) {
  if (event.button === 0 && event.detail > 1) event.preventDefault();
}

export function clearCardTextSelection() {
  if (typeof window === "undefined") return;
  window.getSelection()?.removeAllRanges();
}

export function useDeferredCardSelectionClick(delayMs = 180) {
  const timerRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const cancelPendingCardSelectionClick = useCallback(() => {
    for (const timer of timerRef.current) {
      clearTimeout(timer);
    }
    timerRef.current.clear();
  }, []);

  const scheduleCardSelectionClick = useCallback(
    (action: () => void) => {
      const timer = setTimeout(() => {
        timerRef.current.delete(timer);
        action();
      }, delayMs);
      timerRef.current.add(timer);
    },
    [delayMs],
  );

  useEffect(
    () => cancelPendingCardSelectionClick,
    [cancelPendingCardSelectionClick],
  );

  return {
    cancelPendingCardSelectionClick,
    scheduleCardSelectionClick,
  };
}
