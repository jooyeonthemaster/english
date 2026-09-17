"use client";

// ============================================================================
// 레일 껍데기 부품 — 하단 도크 + 미선택 빈 상태 (analysis-detail-rail.tsx 에서 분리,
// 26-09-03 — 리포트 2관점 도크 분기가 들어가 본체가 500줄 상한을 넘어서).
// ============================================================================

import type { ReactNode } from "react";
import { FileBarChart } from "lucide-react";

/**
 * 레일 하단 도크 껍데기 — 픽바(dossier-pick-bar)의 도킹 토큰을 그대로 쓴다
 * (border-t + 흰 바닥 + 위로 뜨는 그림자). `shrink-0` 을 **명시**하는 이유:
 * 픽바는 스크롤러의 `min-h-0 flex-1` 에 기대어 생략돼 있는데, 그 생략을 베끼면
 * 본문이 길 때 도크가 눌린다.
 *
 * 세로 패딩(py-3)은 중앙 도크(analysis-dock `px-5 py-3`)와 **같은 값**이어야 한다 —
 * 26-09-04 실측에서 바 높이가 75 vs 77 로 어긋나 두 CTA 의 윗선이 2px 밀렸다
 * (버튼 자체는 둘 다 52px 로 이미 동일했다). 한쪽만 고치지 마라.
 */
export function RailNextStepDock({ children }: { children: ReactNode }) {
  return (
    <div
      data-rail-next-step-dock
      className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 shadow-[0_-8px_20px_-12px_rgba(15,23,42,0.25)]"
    >
      {children}
    </div>
  );
}

/** 미선택 빈 상태 — 지문 도시에 빈 상태와 같은 골격(한 문장 안내). */
export function AnalysisRailEmpty() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-slate-50">
          <FileBarChart className="size-6 text-slate-300" aria-hidden="true" />
        </div>
        <p className="break-keep text-[12px] leading-relaxed text-slate-400">
          왼쪽 목록에서 분석을 선택하면
          <br />
          총평·문항 분석·학생 현황이 여기에 표시됩니다
        </p>
      </div>
    </div>
  );
}
