"use client";

import { useMemo, useState } from "react";

import { AnalysisReportDocument } from "@/components/workbench/analysis-report/AnalysisReportDocument";
import { RECALL_RECOGNITION_FIXTURE } from "@/lib/passage-report/analysis-report/fixture";
import { SAMPLE_REPORTS } from "@/lib/passage-report/analysis-report/samples";
import { REPORT_THEMES } from "@/lib/passage-report/analysis-report/design-tokens";
import type { ReportThemeId } from "@/lib/passage-report/analysis-report/schema";

const SOURCES = [
  { id: "ref", label: "★ 레퍼런스(수작업)", report: RECALL_RECOGNITION_FIXTURE },
  ...SAMPLE_REPORTS.map((s) => ({ id: s.id, label: s.label, report: s.report })),
];

/**
 * /director/workbench/report-preview
 * 디자인 검증 전용 — 레퍼런스 픽스처(Recall/Recognition)를 새 엔진으로 렌더.
 * PDF 와 1:1 비교용. AI/DB 안 거침.
 */
export default function ReportPreviewPage() {
  const [themeId, setThemeId] = useState<ReportThemeId>("veritas-navy");
  const [sourceId, setSourceId] = useState<string>("ref");
  const base = useMemo(() => SOURCES.find((s) => s.id === sourceId)?.report ?? RECALL_RECOGNITION_FIXTURE, [sourceId]);
  const report = useMemo(() => ({ ...base, themeId }), [base, themeId]);

  return (
    <div style={{ minHeight: "100vh", background: "rgb(226,232,240)" }}>
      <div
        className="par-toolbar-noprint"
        style={{
          position: "sticky", top: 0, zIndex: 10, display: "flex", gap: 12, alignItems: "center",
          padding: "10px 16px", background: "white", borderBottom: "1px solid rgb(226,232,240)",
        }}
      >
        <strong style={{ fontSize: 14 }}>PRIME ANALYSIS · 디자인 프리뷰</strong>
        <span style={{ fontSize: 12, color: "rgb(100,116,139)" }}>실제 Gemini 생성 10종 + 레퍼런스</span>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          style={{ height: 30, padding: "0 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgb(203,213,225)" }}
        >
          {SOURCES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "rgb(100,116,139)" }}>테마</span>
        {Object.values(REPORT_THEMES).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setThemeId(t.id)}
            style={{
              height: 30, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: themeId === t.id ? `2px solid ${t.ink}` : "1px solid rgb(226,232,240)",
              background: themeId === t.id ? t.tint : "white", color: t.ink,
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => window.print()}
          style={{ height: 30, padding: "0 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "none", background: "rgb(37,99,235)", color: "white", cursor: "pointer" }}
        >
          인쇄 / PDF
        </button>
      </div>

      <div style={{ padding: "28px 0" }}>
        <AnalysisReportDocument report={report} />
      </div>

      <style dangerouslySetInnerHTML={{ __html: "@media print { .par-toolbar-noprint { display: none !important; } body { background: #fff !important; } }" }} />
    </div>
  );
}
