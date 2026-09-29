"use client";

import { useEffect, useRef } from "react";

// 자막 편집기 전역 단축키 — Esc 닫기 · Ctrl/Cmd+Z 되돌리기 · Ctrl/Cmd+Shift+Z(또는 Ctrl+Y) 다시 실행.
//
// 글자를 입력하는 칸(textarea·텍스트 input·contentEditable)에 포커스가 있으면 가로채지 않는다.
//  - Ctrl+Z/Y 는 그 칸의 네이티브 글자 단위 되돌리기에 맡긴다(박스 단위 히스토리가 가로채면
//    한 글자 고치다 박스 전체가 되돌아간다).
//  - Esc 는 편집기를 닫지 않고 먼저 입력칸에서 포커스만 뺀다. 한 번 더 누르면 그때 닫힌다.
// 팝오버(Radix)가 이미 Esc 를 소비(preventDefault)했으면 편집기까지 닫지 않는다 — Radix 는
// document 캡처 단계에서 먼저 받아 preventDefault 후 닫는다.

/** 값 입력이 아닌 input 타입 — 여기선 단축키를 그대로 처리한다. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** 키 입력이 글자 편집으로 소비되는 요소인가. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  return false;
}

interface EditorShortcutHandlers {
  onEscape: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function useEditorShortcuts(handlers: EditorShortcutHandlers): void {
  // 최신 핸들러를 ref 로 읽어 리스너는 한 번만 붙인다.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // IME 조합 중(한글 입력) 키와 다른 레이어가 이미 처리한 키는 건드리지 않는다.
      if (e.isComposing || e.defaultPrevented) return;
      const typing = isTextEntryTarget(e.target);
      if (e.key === "Escape") {
        if (typing) {
          (e.target as HTMLElement).blur();
          return;
        }
        handlersRef.current.onEscape();
        return;
      }
      if (typing) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        handlersRef.current.onUndo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        handlersRef.current.onRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
