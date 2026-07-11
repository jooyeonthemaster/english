"use client";

// 학생 상세 허브 — 시험 리포트 미리보기 모달 (스태프 전용).
// GENERATED 리포트를 카드에서 벗어나지 않고 그 자리에서 확인한다 — 공개
// 페이지(/r)와 동일한 렌더러 ReportDocument(mode "view")를 재사용한다.
// 공유(shareEnabled)가 꺼진 리포트도 여기에서 내용 확인이 가능하다.
// 데이터: GET /api/exam-report/students/{reportStudentId} (스태프 인증) —
// 응답 봉투 { student: { report: StudentReportDoc | null, ... } }.

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, FileBarChart } from "lucide-react";
import type { StudentExamReportRow } from "@/actions/students/exam-reports";
import type { StudentReportDoc } from "@/lib/exam-report/report-schema";
import { ReportDocument } from "@/components/exam-report/report/report-document";
import { WideModal } from "@/components/layout/wide-modal";

function PreviewSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 sm:py-8">
      <div className="animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="h-44 rounded-lg bg-slate-100" />
        <div className="mt-8 space-y-3">
          <div className="h-4 w-1/3 rounded bg-slate-100" />
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-5/6 rounded bg-slate-100" />
          <div className="h-24 rounded-lg bg-slate-100" />
        </div>
        <div className="mt-8 space-y-3">
          <div className="h-4 w-1/4 rounded bg-slate-100" />
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-2/3 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function PreviewError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <AlertCircle className="size-8 text-rose-300" aria-hidden />
      <p className="max-w-md text-[13px] font-medium leading-relaxed text-slate-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
      >
        다시 시도
      </button>
    </div>
  );
}

export function ReportPreviewModal({
  target,
  onClose,
}: {
  /** 미리보기 대상 리포트 카드 행 — null 이면 닫힘 */
  target: StudentExamReportRow | null;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<StudentReportDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reportStudentId = target?.reportStudentId ?? null;

  useEffect(() => {
    if (!reportStudentId) return;
    const controller = new AbortController();
    setDoc(null);
    setError(null);
    fetch(`/api/exam-report/students/${reportStudentId}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          student?: { report?: StudentReportDoc | null };
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(body?.error ?? "리포트를 불러오지 못했습니다.");
        }
        const report = body?.student?.report ?? null;
        if (!report) {
          throw new Error("아직 완성된 리포트 문서가 없습니다. 리포트를 먼저 생성해 주십시오.");
        }
        setDoc(report);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "리포트를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [reportStudentId, reloadKey]);

  if (!target) return null;

  return (
    <WideModal
      open
      onClose={onClose}
      icon={FileBarChart}
      title={target.analysisTitle}
      description="리포트 미리보기 — 공개 페이지와 동일한 문서입니다."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-slate-400">
            {target.shareEnabled
              ? "학생·학부모 공유가 켜져 있는 리포트입니다."
              : "공유가 꺼져 있는 리포트입니다. 링크 공유 없이 여기에서 내용을 확인할 수 있습니다."}
          </p>
          {target.sharePath ? (
            <a
              href={target.sharePath}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              공개 리포트 열기
            </a>
          ) : null}
        </div>
      }
    >
      {error ? (
        <PreviewError message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : doc ? (
        <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 sm:py-8">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <ReportDocument doc={doc} mode="view" />
          </div>
        </div>
      ) : (
        <PreviewSkeleton />
      )}
    </WideModal>
  );
}
