"use client";

// ============================================================================
// 학생 시험 리포트 v3 — 스텝 1: 답안 수집 (3경로)
//
// (a) AI 사진 판독: 사진 업로드 → E2 판독(POST /read, 무과금·학생당 3회 캡).
// (b) 학생 답안 링크: /a/{token} 공개 링크 발급 → 학생이 직접 입력(answer-link-panel).
// (c) 직접 입력: 정오표에서 강사가 문항별 선지·정오를 손으로 입력.
// 판독 자체는 상위 훅(runRead)이 수행하고, 여기서는 수집 방법 선택 UI 만 담당.
// ============================================================================

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  Link2,
  ListChecks,
  Loader2,
  PencilLine,
  ScanLine,
  type LucideIcon,
} from "lucide-react";

import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { EXAM_READ_MAX_RUNS } from "@/lib/exam-report/types";
import type { ExamStudentDetail } from "../ui-contracts";
import { AnswerLinkPanel } from "./answer-link-panel";
import { PhotoUpload } from "./photo-upload";
import { StudentSourceViewer } from "./student-source-viewer";

interface ReadStepProps {
  analysisId: string;
  student: ExamStudentDetail;
  /** 부모 시험의 examMap(문항 분석) 준비 여부 — 미완이면 어느 경로도 진행 불가. */
  examMapReady: boolean;
  reading: boolean;
  readRemaining: number;
  onRead: () => Promise<boolean>;
  onUploaded: () => void;
  /** 답안 링크 발급/끄기 낙관 반영(버전 무관 필드만 patch). */
  onStudentChange: (next: ExamStudentDetail) => void;
  /** 정오표 스텝으로 진행(직접 입력·제출 확인·판독 완료 공용). */
  onAdvance: () => void;
}

export function ReadStep({
  analysisId,
  student,
  examMapReady,
  reading,
  readRemaining,
  onRead,
  onUploaded,
  onStudentChange,
  onAdvance,
}: ReadStepProps) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
        <WorkflowPageTitle
          icon={ListChecks}
          title="답안 수집"
          description="사진 판독 · 학생 링크 · 직접 입력 중 편한 방법으로 학생 답안을 모으세요."
        />
      </div>

      <div className="flex flex-col gap-4 p-4">
        {!examMapReady && (
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-[12.5px] leading-relaxed text-slate-500">
              시험 문항 분석이 완료된 뒤에 답안을 수집할 수 있습니다. 먼저 분석
              화면에서 문항 분석을 진행하세요.
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* (a) AI 사진 판독 — 업로드/썸네일이 커서 전체 폭 */}
          <MethodTile
            icon={ScanLine}
            title="AI 사진 판독"
            description="마킹된 시험지 사진을 AI가 읽어 정오표 초안을 만듭니다."
            hint={`재실행 ${readRemaining}회 남음 · 학생당 ${EXAM_READ_MAX_RUNS}회`}
            className="md:col-span-2"
          >
            <PhotoReadMethod
              analysisId={analysisId}
              student={student}
              examMapReady={examMapReady}
              reading={reading}
              readRemaining={readRemaining}
              onRead={onRead}
              onUploaded={onUploaded}
              onAdvance={onAdvance}
            />
          </MethodTile>

          {/* (b) 학생 답안 링크 */}
          <MethodTile
            icon={Link2}
            title="학생 답안 링크"
            description="학생이 휴대폰으로 본인 답을 직접 입력합니다."
          >
            <AnswerLinkPanel
              student={student}
              examMapReady={examMapReady}
              onStudentChange={onStudentChange}
              onGoVerdict={onAdvance}
            />
          </MethodTile>

          {/* (c) 직접 입력 */}
          <MethodTile
            icon={PencilLine}
            title="직접 입력"
            description="사진 없이도 정오표에서 문항별 선지와 정오를 바로 입력할 수 있습니다."
          >
            <div className="space-y-2">
              <p className="text-[12px] leading-relaxed text-slate-500">
                객관식은 ①~⑤ 선지를 누르면 정답 대조로 정오가 자동 판정되고,
                서답형은 ○✕△ 로 직접 채점합니다.
              </p>
              <button
                type="button"
                onClick={onAdvance}
                disabled={!examMapReady}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                정오표로 이동
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </MethodTile>
        </div>
      </div>
    </section>
  );
}

// ── 수집 방법 타일 셸 ────────────────────────────────────────────────────────

function MethodTile({
  icon: Icon,
  title,
  description,
  hint,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3.5 ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[13px] font-bold text-slate-800">{title}</h3>
            <p className="text-[11.5px] font-medium text-slate-400">{description}</p>
          </div>
        </div>
        {hint && (
          <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-slate-400">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── (a) AI 사진 판독 본문(기존 판독 UI 유지) ────────────────────────────────

function PhotoReadMethod({
  analysisId,
  student,
  examMapReady,
  reading,
  readRemaining,
  onRead,
  onUploaded,
  onAdvance,
}: {
  analysisId: string;
  student: ExamStudentDetail;
  examMapReady: boolean;
  reading: boolean;
  readRemaining: number;
  onRead: () => Promise<boolean>;
  onUploaded: () => void;
  onAdvance: () => void;
}) {
  // 사진이 이미 있어도 다시 올릴 수 있게 하는 토글(A5) — setStudentSources 덮어쓰기.
  const [reupload, setReupload] = useState(false);
  const sourceFiles = student.sourceFiles ?? [];
  const hasPhotos = sourceFiles.length > 0;
  const readState = student.readState;
  const status = readState?.status ?? "NONE";
  const uncertainCount = readState?.uncertainties?.length ?? 0;
  const isRead = status === "READ";
  const capped = readRemaining <= 0;

  if (!hasPhotos || reupload) {
    return (
      <div className="flex flex-col gap-3">
        <PhotoUpload
          analysisId={analysisId}
          studentId={student.id}
          onUploaded={() => {
            setReupload(false);
            onUploaded();
          }}
        />
        {reupload && hasPhotos && (
          <button
            type="button"
            onClick={() => setReupload(false)}
            className="self-start rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            취소
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 판독 상태 배너 */}
      {status === "FAILED" && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <p className="text-[12.5px] leading-relaxed text-rose-700">
            판독에 실패했습니다. 사진이 선명한지 확인한 뒤 다시 시도하거나, 학생
            링크·직접 입력으로 답안을 수집하세요.
          </p>
        </div>
      )}
      {isRead && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            판독 완료
          </span>
          <span className="text-[12px] text-emerald-600">
            {uncertainCount > 0
              ? `AI 확인 요청 ${uncertainCount}건 — 정오표에서 확인하세요`
              : "확인 요청 없음 — 정오표에서 최종 확정하세요"}
          </span>
        </div>
      )}

      {/* 학생 시험지 썸네일 */}
      <StudentSourceViewer
        studentId={student.id}
        sourceFiles={sourceFiles}
        variant="grid"
      />

      {/* 액션 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onRead()}
            disabled={reading || capped || !examMapReady}
            className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ScanLine className="h-4 w-4" />
            )}
            {reading ? "판독 중…" : isRead ? "다시 판독" : "판독 시작"}
          </button>
          <button
            type="button"
            onClick={() => setReupload(true)}
            disabled={reading}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
            사진 다시 올리기
          </button>
        </div>

        {isRead && (
          <button
            type="button"
            onClick={onAdvance}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            정오표 확인
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {capped && !reading && (
        <p className="text-[11px] text-slate-400">
          재실행 한도({EXAM_READ_MAX_RUNS}회)에 도달했습니다. 학생 링크나 직접
          입력으로 답안을 수집할 수 있습니다.
        </p>
      )}
    </div>
  );
}
