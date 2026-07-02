"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, Printer, X } from "lucide-react";

import {
  AnalysisReportEditor,
  type ReportEditorToolbarState,
} from "@/components/workbench/analysis-report/AnalysisReportEditor";
import { SaveButton } from "@/components/ui/save-button";
import { useUnsavedCloseGuard } from "@/components/shared/use-unsaved-close-guard";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

/**
 * 국어 분석 학습지 열람·편집 모달 — 영어 학습지 모달(PassageAnalysisModal)의
 * 헤더·전체화면 골격을 미러한 국어 대칭 표면. 편집기 자체는 과목 중립인
 * AnalysisReportEditor 를 그대로 재사용한다(저장 PATCH 는 서버 KO 게이트가
 * KO 스키마·PRIME_KO 마커 행으로만 흐르게 한다). 영어 파생 헤더 버튼
 * (실전 학습지 생성)은 국어 보고서에 해당 없음 — 의도적으로 렌더하지 않는다.
 */
export function KoreanReportModal({
  passageId,
  passageTitle,
  report,
  onClose,
  onSaved,
}: {
  passageId: string;
  passageTitle: string;
  report: AnalysisReport;
  onClose: () => void;
  /** 편집기 저장 성공 시 최신 보고서를 부모(상세 페이지 상태)로 반영. */
  onSaved: (saved: AnalysisReport) => void;
}) {
  // 편집기 저장 상태를 헤더로 끌어올린다 (영어 모달과 동일한 계약).
  const [editorToolbar, setEditorToolbar] =
    useState<ReportEditorToolbarState | null>(null);

  // requestClose 는 내부 useCallback 으로 안정적 — effect 의존성에 그대로 사용 가능.
  const { requestClose, dialog: closeGuardDialog } = useUnsavedCloseGuard({
    isDirty: Boolean(editorToolbar?.dirty),
    onClose,
  });

  // Esc 로 닫기 (미저장 가드 경유)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [requestClose]);

  // 모달이 떠 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => requestClose()}
      />

      <div className="relative z-10 mx-3 my-3 flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl">
        {/* ─── 헤더 ─── */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <BookOpenCheck className="size-4.5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-bold text-slate-800">
                {passageTitle}
              </h2>
              <p className="mt-0.5 text-[11.5px] font-medium text-slate-400">
                국어 분석 학습지 — 편집 후 저장하면 학습지에 바로 반영됩니다
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {editorToolbar ? (
              <>
                <SaveButton
                  onClick={editorToolbar.save}
                  saving={editorToolbar.saving}
                  disabled={!editorToolbar.dirty}
                />
                <button
                  type="button"
                  onClick={() =>
                    // 인쇄 전 웹폰트 로드 완료 대기 — 영어 모달과 동일한 스풀 지연 방지.
                    void document.fonts.ready.then(() => window.print())
                  }
                  className="flex h-8 min-w-[64px] items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  인쇄
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => requestClose()}
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* ─── 편집기 ─── */}
        <div className="min-h-0 flex-1">
          <AnalysisReportEditor
            passageId={passageId}
            initialReport={report}
            onSaved={onSaved}
            onToolbarStateChange={setEditorToolbar}
          />
        </div>
      </div>
      {closeGuardDialog}
    </div>
  );
}
