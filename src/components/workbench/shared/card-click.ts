import type { MouseEvent } from "react";

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

export function shouldIgnoreCardClick(event: MouseEvent<HTMLElement>) {
  if (event.defaultPrevented) return true;
  if (event.button !== 0) return true;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return true;
  }

  if (typeof window !== "undefined") {
    const selectedText = window.getSelection()?.toString().trim();
    if (selectedText) return true;
  }

  const target = event.target;
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_CARD_TARGET_SELECTOR));
}
