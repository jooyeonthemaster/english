"use client";

import { createContext, useContext } from "react";

/**
 * 마키(영역 드래그) 선택의 기본 "시작 영역" 경계.
 *
 * AdminShell 이 사이드바를 제외한 본문(`<main>`)의 ref 를 이 컨텍스트로 내려준다.
 * DragSelect 는 별도의 boundaryRef 를 받지 않으면 이 경계를 기본값으로 써서, 어느
 * 페이지에서든 "사이드바를 제외한 어디서나" 드래그를 시작할 수 있게 한다.
 *
 * 한 화면에 서로 다른 선택집합을 가진 드래그 영역이 여럿인 경우(예: 문제 생성 페이지의
 * 지문 그리드 vs 생성된 문제 큐)에만 개별 boundaryRef 로 영역을 분리한다.
 */
export const MarqueeBoundaryContext =
  createContext<React.RefObject<HTMLElement | null> | null>(null);

export function useMarqueeBoundary() {
  return useContext(MarqueeBoundaryContext);
}
