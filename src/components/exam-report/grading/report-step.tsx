"use client";

// ============================================================================
// 학생 시험 리포트 v3 — 스텝 3: 리포트
//
// reportStatus 가 NONE/FAILED 면 생성 CTA(5cr, 반평균·등급 선택 입력 + dataLevel
// 안내)를 보여주고, 그 외(GENERATING/GENERATED)면 기존 ReportEditor(무수정)에
// 위임한다. ReportEditor 는 입력 계약이 동일하므로 그대로 재사용한다.
// ============================================================================

import { ArrowLeft, FileText, Info, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ResponseDataLevel } from "@/lib/exam-report/types";
import type { ExamAnalysisDetail, ExamStudentDetail } from "../ui-contracts";
import { ReportEditor } from "../report/report-editor";

interface ReportStepProps {
  analysis: ExamAnalysisDetail;
  student: ExamStudentDetail;
  onStudentChange: (next: ExamStudentDetail) => void;
  generating: boolean;
  /** 정오표 확정 여부 — 미확정이면 생성/재생성 차단(서버 게이트 미러). */
  gradingConfirmed: boolean;
  dataLevel: ResponseDataLevel;
  classAverage: number | null;
  gradeBand: string | null;
  onClassAverage: (v: number | null) => void;
  onGradeBand: (v: string | null) => void;
  onGenerate: () => Promise<boolean>;
  onBack: () => void;
  /** 정오표 스텝으로 이동(미확정 안내에서 사용). */
  onGoVerdict: () => void;
}

const DATA_LEVEL: Record<ResponseDataLevel, { label: string; tone: string; hint: string }> = {
  STATUS_ONLY: {
    label: "정오만",
    tone: "text-slate-500",
    hint: "정오 데이터로 리포트를 생성합니다. 오답 선지·반평균을 더하면 정밀해집니다.",
  },
  WITH_CHOICES: {
    label: "선지 포함",
    tone: "text-blue-600",
    hint: "오답 선지가 포함돼 함정 분석이 가능합니다. 반평균을 더하면 더 정밀해집니다.",
  },
  RICH: {
    label: "정밀",
    tone: "text-emerald-600",
    hint: "충분한 정보로 정밀한 상담 리포트를 생성합니다.",
  },
};

export function ReportStep({
  analysis,
  student,
  onStudentChange,
  generating,
  gradingConfirmed,
  dataLevel,
  classAverage,
  gradeBand,
  onClassAverage,
  onGradeBand,
  onGenerate,
  onBack,
  onGoVerdict,
}: ReportStepProps) {
  const status = student.reportStatus;
  const needsGenerate = status === "NONE" || status === "FAILED";

  if (!needsGenerate) {
    return <ReportEditor analysis={analysis} student={student} onStudentChange={onStudentChange} />;
  }

  const level = DATA_LEVEL[dataLevel];

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="정오표로 돌아가기"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-[14px] font-bold text-slate-900">상담 리포트 생성</h2>
            <p className="text-[12px] font-medium text-slate-400">
              확정된 정오표로 학생 맞춤 상담 리포트를 만듭니다.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {status === "FAILED" && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            <p className="text-[12.5px] leading-relaxed text-rose-700">
              직전 리포트 생성에 실패했습니다. 사용한 크레딧은 자동 환불됩니다. 다시
              시도해 주세요.
            </p>
          </div>
        )}

        {/* 선택 입력: 반평균 / 등급 (RICH 정밀도 향상) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-slate-500">반 평균 (선택)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={classAverage ?? ""}
              onChange={(e) =>
                onClassAverage(e.target.value === "" ? null : Number(e.target.value))
              }
              placeholder="예: 72"
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">등급/석차 (선택)</Label>
            <Input
              value={gradeBand ?? ""}
              onChange={(e) => onGradeBand(e.target.value === "" ? null : e.target.value)}
              placeholder="예: 3등급"
              className="mt-1 h-9 text-sm"
            />
          </div>
        </div>

        {/* dataLevel 안내 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-50 px-3 py-2.5 text-xs">
          <span className="text-slate-500">데이터 밀도</span>
          <span className={cn("font-semibold", level.tone)}>{level.label}</span>
          <span className="w-full text-[11.5px] leading-relaxed text-slate-400">{level.hint}</span>
        </div>

        {/* 정오표 미확정 안내(서버 게이트 미러 — 생성 차단) */}
        {!gradingConfirmed && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
            <p className="text-[12.5px] leading-relaxed text-blue-700">
              정오표를 확정한 후에 리포트를 생성할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={onGoVerdict}
              className="shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-50"
            >
              정오표로 이동
            </button>
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={generating || !gradingConfirmed}
            className="flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {status === "FAILED" ? "리포트 다시 생성 · 5크레딧" : "리포트 생성 · 5크레딧"}
          </button>
        </div>
      </div>
    </section>
  );
}
