"use client";

import { useContext, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { TaskQueueContext, TaskQueueProvider, useTaskQueue } from "./context";
import { TaskQueueDrawer } from "./components/task-queue-drawer";
import { TaskQueueToggle } from "./components/task-queue-toggle";
import type { TaskDomain, TaskScope } from "./types";

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolveTaskQueueDefaultDomain(pathname: string): TaskScope {
  if (
    pathname.startsWith("/director/workbench/extraction") ||
    pathname.startsWith("/director/workbench/passages/import")
  ) {
    return "extraction";
  }
  if (pathname.startsWith("/director/workbench/webtoon")) {
    return "webtoon";
  }
  if (
    pathname.startsWith("/director/workbench/questions") ||
    pathname.startsWith("/director/workbench/generate") ||
    pathname.startsWith("/director/questions") ||
    pathname.startsWith("/director/learning-questions")
  ) {
    return "question-generation";
  }
  if (
    pathname.startsWith("/director/workbench/exams") ||
    pathname.startsWith("/director/exams")
  ) {
    return "exam-generation";
  }
  if (pathname.startsWith("/director/workbench/passages")) {
    return "passage-analysis";
  }
  return "all";
}

function TaskQueueFloatingControls() {
  const { open } = useTaskQueue();
  const [floatingOffset, setFloatingOffset] = useState({ x: 0, y: 0 });
  const floatingOffsetRef = useRef(floatingOffset);
  const floatingFrameRef = useRef<number | null>(null);
  const floatingMovedRef = useRef(false);
  const floatingHostRef = useRef<HTMLDivElement | null>(null);
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);

  function startFloatingDrag(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const host = floatingHostRef.current;
    const button = toggleButtonRef.current;
    if (!host || !button) return;

    event.stopPropagation();

    const rect = open ? host.getBoundingClientRect() : button.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = floatingOffsetRef.current;
    const margin = 8;
    const minDeltaX = margin - rect.left;
    const maxDeltaX = window.innerWidth - margin - rect.right;
    const minDeltaY = margin - rect.top;
    const maxDeltaY = window.innerHeight - margin - rect.bottom;
    const pointerId = event.pointerId;
    let didMove = false;
    let latestOffset = startOffset;
    const previousBodyCursor = document.body.style.cursor;
    const previousBodyUserSelect = document.body.style.userSelect;

    floatingMovedRef.current = false;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    host.style.transition = "none";
    host.style.willChange = "transform";

    try {
      event.currentTarget.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is best-effort; window listeners keep the drag alive.
    }

    const applyFloatingTransform = () => {
      floatingFrameRef.current = null;
      host.style.transform = `translate3d(${latestOffset.x}px, ${latestOffset.y}px, 0)`;
    };

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const rawDeltaX = moveEvent.clientX - startX;
      const rawDeltaY = moveEvent.clientY - startY;
      if (!didMove && Math.hypot(rawDeltaX, rawDeltaY) >= 2) {
        didMove = true;
        floatingMovedRef.current = true;
      }

      moveEvent.preventDefault();
      latestOffset = {
        x: startOffset.x + clampNumber(rawDeltaX, minDeltaX, maxDeltaX),
        y: startOffset.y + clampNumber(rawDeltaY, minDeltaY, maxDeltaY),
      };
      floatingOffsetRef.current = latestOffset;

      if (floatingFrameRef.current === null) {
        floatingFrameRef.current = window.requestAnimationFrame(applyFloatingTransform);
      }
    };

    const finishDrag = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      if (floatingFrameRef.current !== null) {
        window.cancelAnimationFrame(floatingFrameRef.current);
        floatingFrameRef.current = null;
      }
      applyFloatingTransform();
      setFloatingOffset(latestOffset);
      document.body.style.cursor = previousBodyCursor;
      document.body.style.userSelect = previousBodyUserSelect;
      host.style.transition = "";
      host.style.willChange = "transform";
      try {
        event.currentTarget.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag, { once: true });
    window.addEventListener("pointercancel", finishDrag, { once: true });
  }

  function shouldIgnoreToggleClick() {
    if (!floatingMovedRef.current) return false;
    floatingMovedRef.current = false;
    return true;
  }

  return (
    <div
      ref={floatingHostRef}
      className="pointer-events-none fixed bottom-24 right-8 z-50 flex touch-none select-none flex-col-reverse items-end gap-5"
      style={{
        backfaceVisibility: "hidden",
        contain: "layout style",
        transform: `translate3d(${floatingOffset.x}px, ${floatingOffset.y}px, 0)`,
        willChange: "transform",
      }}
    >
      <TaskQueueToggle
        buttonRef={toggleButtonRef}
        onDragPointerDown={startFloatingDrag}
        shouldIgnoreClick={shouldIgnoreToggleClick}
      />
      <TaskQueueDrawer />
    </div>
  );
}

/**
 * Mounts the floating toggle button + drawer + provider for a page or layout.
 *
 * Nested-safe: if a `TaskQueueHost` already exists higher in the tree (e.g.
 * a parent route segment mounted one), this component degrades to a
 * passthrough so we don't double-render the toggle/drawer or fight over the
 * provider scope. The outermost host wins.
 *
 * `defaultDomain` controls which domain tab is selected when the drawer
 * opens. Pass the current page's domain so the user starts on their own
 * tasks; "전체" and other tabs are reachable from the panel.
 */
export function TaskQueueHost({
  children,
  defaultDomain = "all",
}: {
  children: ReactNode;
  defaultDomain?: TaskDomain | "all";
}) {
  const outer = useContext(TaskQueueContext);
  if (outer) {
    return <>{children}</>;
  }
  return (
    <TaskQueueProvider defaultDomain={defaultDomain}>
      {children}
      <TaskQueueFloatingControls />
    </TaskQueueProvider>
  );
}

export function TaskQueueRouteHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const defaultDomain = resolveTaskQueueDefaultDomain(pathname);

  return (
    <TaskQueueProvider defaultDomain={defaultDomain}>
      {children}
      <TaskQueueFloatingControls />
    </TaskQueueProvider>
  );
}
