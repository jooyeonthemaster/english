"use client";

import { createContext, useContext } from "react";

/**
 * 모바일 풀스크린 데모 시트 컨텍스트.
 * 시트(MobileDemoSheet)가 제공하고, 그 안의 DemoShell·useDemoZoom 이 읽어
 * "시트 안에 있음"을 감지한다(닫기 버튼 노출·폭 맞춤 줌 등). PC 경로에서는
 * 프로바이더가 없으므로 항상 null → PC 동작 무영향.
 */
export interface DemoSheetCtx {
  /** 시트 닫기(뒤로가기 히스토리 되감기 포함). */
  onClose: () => void;
}

export const DemoSheetContext = createContext<DemoSheetCtx | null>(null);

export function useDemoSheet(): DemoSheetCtx | null {
  return useContext(DemoSheetContext);
}
