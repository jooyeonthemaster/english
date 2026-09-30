"use client";

// ============================================================================
// 누름 무장 표시 조각 — 무장 스토어(print-arming.ts)를 구독하는 작은 컴포넌트 · 훅. 무장은 호스트(상세 · 빌더)를
// 다시 그리지 않고 이 조각들만 다시 그린다(빌더 전체 재렌더는 느린 CPU 에서 수백 ms — 누름과 click 사이 페인트를 놓친다).
//  · usePrintArmed     무장된 모드(없으면 null)
//  · printArmHandlers  진입점 버튼에 펼쳐 넣는 onPointerDown · onKeyDown(Enter/Space) — onClick 은 그대로 인쇄를 부른다
//  · PrintArmIcon      무장 · 준비 중이면 스피너, 아니면 프린터
// 무장은 버튼을 disabled 로 만들지 않는다 — 뒤따를 click 이 살아야 인쇄된다.
// ============================================================================

import { useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { Loader2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExamPrintMode } from "@/lib/exams/print-event-meta";
import type { ExamPrintArming } from "./print-arming";

type ArmingSource = Pick<ExamPrintArming, "get" | "subscribe"> | null | undefined;

const subscribeNothing = () => () => undefined;
const nothingArmed = () => null;

/** 무장된 모드(없으면 null) — 서버 렌더 · 무장 없는 화면에서는 null */
export function usePrintArmed(arming: ArmingSource): ExamPrintMode | null {
  return useSyncExternalStore(arming?.subscribe ?? subscribeNothing, arming?.get ?? nothingArmed, nothingArmed);
}

/** 진입점 버튼의 누름 핸들러. onArmed = 무장이 받아들여졌을 때(눌린 항목 표시용) */
export function printArmHandlers(
  arming: ExamPrintArming | null | undefined,
  mode: ExamPrintMode,
  onArmed?: () => void,
) {
  const handle = (event: PointerEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    if (arming?.arm(mode, event)) onArmed?.();
  };
  return { onPointerDown: handle, onKeyDown: handle };
}

/** 인쇄 아이콘 — 무장(모드 무관) · busy 면 스피너(컴포지터 애니메이션이라 동기 조판 중에도 돈다) */
export function PrintArmIcon({
  arming,
  busy = false,
  className,
}: {
  arming: ArmingSource;
  busy?: boolean;
  className?: string;
}) {
  const armed = usePrintArmed(arming);
  return busy || armed !== null ? (
    <Loader2 className={cn(className, "motion-safe:animate-spin")} aria-hidden="true" />
  ) : (
    <Printer className={className} aria-hidden="true" />
  );
}
