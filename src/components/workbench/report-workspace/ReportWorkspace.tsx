"use client";

import { ArrowLeft, Printer, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { reportDocumentSchema, type ReportDocument } from "@/lib/passage-report/schema";

import { PageCanvasFrame } from "./PageCanvas";
import { REPORT_WORKSPACE_STYLES } from "./styles";

interface ReportWorkspaceProps {
  reportId: string;
  passageId: string;
  initialDocument: ReportDocument;
  initialTitle: string;
  initialVersion: number;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;

/**
 * 보고서 워크스페이스 (Phase 2 — 정적 뷰).
 *
 * Phase 3 에서 추가될 것:
 *   - Zustand 스토어 + 자유 편집 (드래그/리사이즈/스냅)
 *   - Tiptap 인라인 편집
 *   - 자동저장 + 언두/리도
 *   - 우측 속성 패널
 *
 * 이 phase 에서는:
 *   - 라우트 진입 → DB 데이터 → A4 페이지 스택 정적 렌더
 *   - 줌 (휠/버튼)
 *   - 좌측 페이지 썸네일 (단순 번호만)
 *   - "인쇄" 버튼 (window.print)
 */
export function ReportWorkspace({
  reportId,
  passageId,
  initialDocument,
  initialTitle,
}: ReportWorkspaceProps) {
  const router = useRouter();
  const [zoom, setZoom] = useState(0.75);
  const [activePageId, setActivePageId] = useState(initialDocument.pages[0]?.id ?? null);

  // 잘못된 데이터일 가능성 0 — 서버에서 schema 통과한 것만 옴
  const document = useMemo(() => {
    const parsed = reportDocumentSchema.safeParse(initialDocument);
    return parsed.success ? parsed.data : initialDocument;
  }, [initialDocument]);

  const handlePrint = useCallback(() => {
    if (typeof window !== "undefined") window.print();
  }, []);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP)), []);
  const resetZoom = useCallback(() => setZoom(0.75), []);

  void reportId;
  void router;

  return (
    <div className="report-ws-root">
      <style dangerouslySetInnerHTML={{ __html: REPORT_WORKSPACE_STYLES }} />

      {/* ─── Top Bar ───────────────────────── */}
      <div className="report-ws-topbar">
        <Link
          href={`/director/workbench/passages/${passageId}`}
          aria-label="지문으로 돌아가기"
          className="report-ws-no-print"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgb(71, 85, 105)" }}
        >
          <ArrowLeft size={16} /> 돌아가기
        </Link>
        <div className="report-ws-title">{initialTitle}</div>
        <div className="report-ws-status" data-status="saved">
          Phase 2 · 정적 보기
        </div>
        <div className="report-ws-spacer" />
        <button onClick={zoomOut} aria-label="축소" type="button">
          <ZoomOut size={14} />
        </button>
        <button onClick={resetZoom} type="button" style={{ minWidth: 64 }}>
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={zoomIn} aria-label="확대" type="button">
          <ZoomIn size={14} />
        </button>
        <button onClick={handlePrint} className="report-ws-primary" type="button">
          <Printer size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
          인쇄
        </button>
      </div>

      {/* ─── Body: Left Rail + Viewport ───── */}
      <div className="report-ws-body">
        <aside className="report-ws-leftrail report-ws-no-print">
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgb(100, 116, 139)", marginBottom: 8 }}>
            페이지
          </div>
          {document.pages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setActivePageId(p.id);
                if (typeof window !== "undefined") {
                  const el = window.document.querySelector(`[data-page-id="${p.id}"]`);
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              className={`report-ws-thumb${activePageId === p.id ? " active" : ""}`}
              style={{ width: "100%", textAlign: "left", background: "none" }}
            >
              <div className="report-ws-thumb-label">{p.pageNumber}쪽</div>
              <div
                className="report-ws-thumb-mini"
                style={{ background: p.background.color }}
              />
            </button>
          ))}
        </aside>

        <main className="report-ws-viewport">
          {document.pages.map((page) => (
            <PageCanvasFrame key={page.id} page={page} zoom={zoom} mode="view" />
          ))}
        </main>
      </div>
    </div>
  );
}
