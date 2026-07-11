"use client";

// 랜딩 Step5 데모 — 워크벤치의 실제 시험 리포트 문서 렌더러(ReportDocument)를
// 그대로 임베드한다. 6개 테마를 바꿔가며 같은 학생 리포트가 즉시 다시 입혀지는
// 것을 체험한다. 데이터는 사전계산 fixture — AI 호출·서버 액션 없음.
import { useMemo, useState } from "react";
import { Palette } from "lucide-react";
import { ReportDocument } from "@/components/exam-report/report/report-document";
import { REPORT_THEME_META } from "@/components/exam-report/report/report-themes";
import type { ReportThemeId } from "@/lib/exam-report/report-schema";
import { DemoShell } from "../demo-shell";
import { DemoZoomControls } from "../demo-zoom-controls";
import { useDemoZoom } from "../use-demo-zoom";
import { LANDING_EXAM_REPORT } from "../fixtures/exam-report";

// 리포트 문서 기준 폭 — 아래 래퍼 max-w-[880px] 와 동일해야 폭 맞춤이 정확하다.
const REPORT_DOC_BASE_WIDTH = 880;

export default function Step5ReportDemo() {
  const [themeId, setThemeId] = useState<ReportThemeId>(
    LANDING_EXAM_REPORT.themeId,
  );
  const doc = useMemo(
    () => ({ ...LANDING_EXAM_REPORT, themeId }),
    [themeId],
  );
  // 문서형 리포트(비 A4)라 기본값은 폭 맞춤. 컨트롤로 자유 확대·축소.
  const zoomCtl = useDemoZoom(REPORT_DOC_BASE_WIDTH);

  return (
    <DemoShell
      label="실제 리포트 문서 — 테마를 바꿔가며 스크롤해 보세요"
      onReset={() => setThemeId(LANDING_EXAM_REPORT.themeId)}
    >
      {/* 테마 스위처 — 워크벤치와 같은 6테마, 클릭 즉시 문서 전체가 다시 입혀진다 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-blue-50 px-4 py-2">
        <span className="mr-1 inline-flex items-center gap-1 text-[11.5px] font-black text-slate-500">
          <Palette className="size-3.5 text-blue-600" aria-hidden="true" />
          테마
        </span>
        {REPORT_THEME_META.map((theme) => {
          const active = theme.id === themeId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setThemeId(theme.id)}
              aria-pressed={active}
              title={theme.label}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition ${
                active
                  ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              <span className="flex items-center gap-0.5">
                {theme.swatches.map((color, i) => (
                  <span
                    key={i}
                    className="size-2.5 rounded-full border border-black/10"
                    style={{ background: color }}
                    aria-hidden="true"
                  />
                ))}
              </span>
              {theme.label}
            </button>
          );
        })}
      </div>

      {/* 리포트 문서 (스크롤) — flex-1 금지(높이 붕괴 방지) */}
      <div className="relative min-h-0">
        <DemoZoomControls ctl={zoomCtl} />
        <div
          ref={zoomCtl.scrollerRef}
          className="min-h-0 overflow-auto bg-slate-100/70 px-3 py-4"
          style={{ height: "var(--demo-h, max(400px, calc(100svh - 330px)))" }}
        >
          <div
            className="mx-auto w-fit"
            style={{ zoom: zoomCtl.zoom }}
          >
            <div className="w-[880px] max-w-none overflow-hidden rounded-2xl border border-slate-200 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.35)]">
              <ReportDocument doc={doc} mode="view" />
            </div>
          </div>
        </div>
      </div>
    </DemoShell>
  );
}
