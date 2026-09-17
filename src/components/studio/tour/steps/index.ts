// ============================================================================
// 스텝 조립기 — 챕터 순서 정본(TOUR_CHAPTERS)대로 이어 붙이고 런타임 필드
// (전체 index · 챕터 내 순번/크기)를 계산한다. 스텝 id 는 저장 호환 축이므로
// 확정 후 개명 금지(.tmp-studio-tour/spec.md §5-8).
// ============================================================================

import type { TourStepDef, TourStepRuntime } from "../types";
import { CH1_STEPS } from "./ch1-overview";
import { CH2_STEPS } from "./ch2-register";
import { CH3_STEPS } from "./ch3-worksheet";
import { CH4_STEPS } from "./ch4-questions";
import { CH5_STEPS } from "./ch5-sheet-compose";
import { CH6_STEPS } from "./ch6-exam-compose";
import { CH7_STEPS } from "./ch7-deploy";

const ALL: TourStepDef[] = [
  ...CH1_STEPS,
  ...CH2_STEPS,
  ...CH3_STEPS,
  ...CH4_STEPS,
  ...CH5_STEPS,
  ...CH6_STEPS,
  ...CH7_STEPS,
];

export function buildTourSteps(): TourStepRuntime[] {
  const sizeByChapter = new Map<string, number>();
  for (const s of ALL) {
    sizeByChapter.set(s.chapter, (sizeByChapter.get(s.chapter) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return ALL.map((s, index) => {
    const n = (seen.get(s.chapter) ?? 0) + 1;
    seen.set(s.chapter, n);
    return {
      ...s,
      index,
      chapterStep: n,
      chapterSize: sizeByChapter.get(s.chapter) ?? 1,
    };
  });
}
