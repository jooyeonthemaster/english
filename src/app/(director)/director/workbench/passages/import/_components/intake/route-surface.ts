// ============================================================================
// routeSurface — 트리아지 결과/입력유형 기반으로 작업대(Surface)를 결정.
// 설계 §2 "입력유형별 분기" 표의 결정론적 구현. (adaptive-intake D1/G1)
// ============================================================================

import {
  CONFIDENCE_CRITICAL,
  MAX_PAGES_PER_JOB,
} from "@/lib/extraction/constants";
import type {
  IntakeInputType,
  IntakeSurface,
  TriageLayout,
} from "@/lib/extraction/types";

/** 대용량 배치 대시보드(C)로 전환하는 페이지 임계. */
export const BATCH_SURFACE_PAGE_THRESHOLD = 8;

export function routeSurface(args: {
  inputType: IntakeInputType;
  pageCount: number;
  passageCount: number;
  confidence: number;
  layout: TriageLayout;
}): IntakeSurface {
  const { inputType, pageCount, passageCount, confidence, layout } = args;

  // 텍스트 붙여넣기 → 에디터 (OCR/트리아지 불필요)
  if (inputType === "TEXT") return "D_TEXT";

  // 저신뢰/실패 → 페이지:세그먼트 1:1 폴백 (기존 동작 100% 동일)
  if (confidence < CONFIDENCE_CRITICAL) return "FALLBACK";

  // 이미지 1장: 단일 지문이면 크롭-우선 미니멀(A), 다지문 의심이면 보드(B)
  if (inputType === "IMAGE_SINGLE") {
    return passageCount <= 1 ? "A_CROP" : "B_BOARD";
  }

  // 대용량 → 배치 대시보드(C)
  if (pageCount >= BATCH_SURFACE_PAGE_THRESHOLD) return "C_BATCH";

  // 장문 연속이 강하게 의심되면서 페이지 수가 적으면 보드로(경계 묶음 편집 용이)
  if (layout === "longform" && pageCount <= MAX_PAGES_PER_JOB) return "B_BOARD";

  // 그 외 시험지 다지문 → 보드(B)
  return "B_BOARD";
}
