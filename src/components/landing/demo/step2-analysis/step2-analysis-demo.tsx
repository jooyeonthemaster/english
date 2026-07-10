"use client";

// 랜딩 Step2 데모 — 워크벤치의 실제 분석 리포트 렌더러(ReportPages, 순수)를
// 그대로 임베드한다. 기본값은 A4 한 페이지가 미리보기 창에 "통째로" 담기는
// contain 맞춤(useDemoZoom 자동 배율)이고, 우측 상단 줌 컨트롤로 자유롭게
// 확대·축소한다. '크게 보기'(DemoShell)를 누르면 --demo-h 가 커져 자동 재계산.
import type { CSSProperties } from "react";
import { ReportPages } from "@/components/workbench/analysis-report/report-pages/pages";
import { DemoShell } from "../demo-shell";
import { DemoZoomControls } from "../demo-zoom-controls";
import { useDemoZoom } from "../use-demo-zoom";
import { LANDING_ANALYSIS_REPORT } from "../fixtures/analysis-report";

// 분석 리포트 A4 고정폭(210mm ≈ 794px)과 페이지 높이(297mm ≈ 1123px).
// .par-sheet 가 zoom: var(--par-zoom) 을 읽는다(레이아웃 스케일 — 스크롤 정확).
const REPORT_BASE_WIDTH = 794;
const REPORT_BASE_HEIGHT = Math.round(794 * (297 / 210));

export default function Step2AnalysisDemo() {
  const zoomCtl = useDemoZoom(REPORT_BASE_WIDTH, REPORT_BASE_HEIGHT);

  return (
    <DemoShell label="실제 분석 학습지 문서 — 스크롤해 다음 페이지를 넘겨보세요">
      <div className="relative min-h-0">
        <DemoZoomControls ctl={zoomCtl} />
        <div
          ref={zoomCtl.scrollerRef}
          // flex-1 금지 — 플렉스 basis 가 height 를 눌러 컨테이너가 콘텐츠 높이로
          // 자라(스크롤 소멸) contain 배율 계산까지 무너진다. 고정 height 만 사용.
          className="min-h-0 overflow-auto bg-slate-100/70 px-3 py-3"
          style={
            {
              height: "var(--demo-h, max(400px, calc(100svh - 260px)))",
              "--par-zoom": zoomCtl.zoom,
            } as CSSProperties
          }
        >
          <div className="mx-auto w-fit">
            <ReportPages report={LANDING_ANALYSIS_REPORT} />
          </div>
        </div>
      </div>
    </DemoShell>
  );
}
