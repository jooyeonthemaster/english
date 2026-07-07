"use client";

import { useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { TaskQueueContext, TaskQueueProvider } from "./context";
import { TaskQueueDrawer } from "./components/task-queue-drawer";
import { TaskQueueToggle } from "./components/task-queue-toggle";
import type { TaskDomain, TaskScope } from "./types";

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
  // "exam-report" 는 아래 "exams" 프리픽스와 겹치지 않지만, 도메인 혼동을
  // 막기 위해 시험지 생성 분기보다 먼저 명시한다.
  if (pathname.startsWith("/director/workbench/exam-report")) {
    return "exam-report";
  }
  if (
    pathname.startsWith("/director/workbench/similar-exams") ||
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
  // 작업 목록 버튼은 "메인 페이지" 레이어(z-40, 모바일 헤더와 동일 단)에 둔다.
  // 앱의 모든 팝업/모달은 z-50 백드롭(`fixed inset-0 z-50` + bg-black/40)으로 뜨므로,
  // 팝업이 열리면 자동으로 이 버튼을 덮어 위에 떠 보이지 않게 된다(별도 감지 불필요).
  //
  // 사이드바 햄버거(좌상단)와 짝을 이루도록 우상단에 고정하되, 정렬은 픽셀 계산에
  // 맡기지 않고 햄버거가 든 모바일 헤더와 동일한 `h-14 items-center` 박스 안에 같은
  // size-10 버튼을 넣어 윗변을 그대로 맞춘다.
  return (
    <>
      <div className="pointer-events-none fixed right-0 top-0 z-40 flex h-14 select-none items-center pr-3">
        <TaskQueueToggle />
      </div>
      <div className="pointer-events-none fixed right-3 top-14 z-40 flex select-none justify-end">
        <TaskQueueDrawer />
      </div>
    </>
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
  const hideFloatingControls = pathname === "/director/dashboard-v2";

  return (
    <TaskQueueProvider defaultDomain={defaultDomain}>
      {children}
      {!hideFloatingControls && <TaskQueueFloatingControls />}
    </TaskQueueProvider>
  );
}
