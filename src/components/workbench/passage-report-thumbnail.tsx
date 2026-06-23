"use client";

import { useEffect, useRef, useState } from "react";

import { AnalysisReportDocument } from "@/components/workbench/analysis-report/AnalysisReportDocument";
import { REPORT_A4_WIDTH_PX } from "@/components/workbench/analysis-report/report-pages";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 학습지 카드 좌측의 "분석 보고서 첫 장" 실제 렌더 미리보기.
//   - 시험지 카드의 ExamCardPaperPreview 와 동일한 패턴: 카드가 뷰포트에 들어올
//     때 PRIME 분석 보고서를 lazy 로 받아온다(목록 전체 동시 요청 방지).
//   - 받아온 AnalysisReport 를 AnalysisReportDocument(상세 모달과 동일 렌더러)로
//     렌더한 뒤, 칸 폭에 맞춰 A4 첫 장만 보이도록 scale + clip 한다.
//   - 보고서가 없는 지문은 "미리보기 없음" 폴백 (학습지 미생성 상태).
// ---------------------------------------------------------------------------

// A4 세로:가로 = 297:210
const A4_RATIO = 297 / 210;

export function PassageReportThumbnail({
  passageId,
  className,
}: {
  passageId: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "empty">(
    "idle",
  );
  // 카드당 단 한 번만 fetch — setState 로 인한 effect 재실행이 in-flight 요청을
  // 취소하던 버그(ExamCardPaperPreview 동일)를 막는다.
  const startedRef = useRef(false);

  // 칸 폭 측정 — A4 scale 의 기준.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 뷰포트 진입 시에만 불러온다.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    setState("loading");
    fetch(`/api/workbench/passage-reports/prime/${passageId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.report) {
          setReport(j.report as AnalysisReport);
          setState("ready");
        } else {
          setState("empty");
        }
      })
      .catch(() => {
        if (!cancelled) setState("empty");
      });
    return () => {
      cancelled = true;
    };
  }, [visible, passageId]);

  const scale = width > 0 ? width / REPORT_A4_WIDTH_PX : 0;

  return (
    <div
      ref={hostRef}
      className={cn(
        "absolute inset-0 overflow-hidden bg-white",
        className,
      )}
    >
      {state === "ready" && report && scale > 0 ? (
        // par-root 는 자체 폭(210mm)으로 렌더되므로 scale 로 칸 폭에 맞춘다.
        // 첫 장만 보이도록 부모(absolute inset-0)에서 세로를 clip 한다.
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left select-none"
          style={{
            width: `${REPORT_A4_WIDTH_PX}px`,
            transform: `scale(${scale})`,
          }}
        >
          <AnalysisReportDocument report={report} />
        </div>
      ) : state === "empty" ? (
        <div className="flex h-full w-full items-center justify-center text-[11px] text-slate-300">
          미리보기 없음
        </div>
      ) : (
        // idle/loading 스켈레톤
        <div className="h-full w-full animate-pulse bg-gradient-to-b from-slate-50 to-slate-100" />
      )}
    </div>
  );
}

export { A4_RATIO as PASSAGE_THUMBNAIL_A4_RATIO };
