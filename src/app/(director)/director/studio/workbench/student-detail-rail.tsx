"use client";

// ============================================================================
// 「학생 관리」 우측 학생 상세 레일 (26-09-02)
// 정본: docs/exam-analysis-v4-spec.md §1-6 · §2.5 U6 「StudentDetailRail」 ·
//       §3 U6-5 · §4 디자인 언어 · §5 함정
//
// 프레젠테이션 전용 — 페치는 셸 훅 useStudioStudents 1인스턴스(aside·드로어
// 2중 마운트 규칙). 이 레일은 `student` 행 하나를 받아 그린다.
// IA(위→아래): 헤더(이름·코드·학년) → 「초대」(학원코드+학생코드 · 링크 복사 ·
// 카카오 공유 = StudentAppShareRow 재사용) → 「시험 리포트」(밴드 + divide-y 행:
// 제목·점수·채점 뱃지·리포트 뱃지 + 행 액션) → 「클래스」([클래스에서 제외] 2단).
// 행 액션: [공유 링크 복사](GENERATED — 공유 꺼져 있으면 enableExamReportShare 로
// 켠 뒤 복사) · [공유 끄기] 2단 danger · [답안 링크 복사](답안 토큰 有, 비INTERNAL) ·
// [시험 분석에서 열기] = 셸 콜백 onOpenAnalysis(analysisId, reportStudentId) —
// ⚠ 두 번째 인자는 Student.id 가 아니라 **ExamReportStudent.id** 다(분석 콘솔의
//   학생 축 id — focusStudent · enableExamReportShare 가 그 id 를 받는다).
// 모달 0 · 탈출구 0 · 표 0 · scrollIntoView 0. 폭 플로어 296px(truncate/break-keep).
// mode:"add" 는 형제 모듈 StudentRailAddPanel 이 그린다(파일 500줄 분할).
// ============================================================================

import { useState } from "react";
import { FileBarChart, Link2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDateTime } from "@/lib/utils";
import { StudentAppShareRow } from "@/components/students/devices/student-app-share-row";
import {
  disableExamReportShare,
  enableExamReportShare,
} from "@/actions/exam-report";
import { removeStudentFromStudioClass } from "@/actions/studio/students";
import type {
  StudioStudentExamEntry,
  StudioStudentExamRow,
} from "@/actions/studio/student-exams";
import { RailConfirmButton } from "./analysis-rail/rail-confirm-button";
import { StudentRailAddPanel } from "./student-detail-rail-add";
import {
  REPORT_BADGE,
  StatusBadge,
  answerLinkUrl,
  copyWithToast,
  examTypeLabel,
  formatScore,
  entryBadge,
  gradeLabel,
  reportShareUrl,
} from "./students-shared";

export interface StudentDetailRailProps {
  classId: string;
  /** 선택 학생 행 — mode:"detail" 에서 null 이면 빈 상태 안내 */
  student: StudioStudentExamRow | null;
  mode: "detail" | "add";
  onClose: () => void;
  /** 「시험 분석에서 열기」 — (analysisId, reportStudentId) */
  onOpenAnalysis: (analysisId: string, reportStudentId: string) => void;
  /** 로스터 변이 성공(연결·등록·제외) — 셸이 재조회 + 클래스 카운트 갱신 */
  onChanged: () => void;
  /** 클래스 제외 성공 직후(onClose 전) — 셸이 행 낙관 제거·선택 해제 */
  onRemoved?: (studentId: string) => void;
  /** 초대 링크 조립용 학원 코드(셸 훅) — 첫 응답 전 null */
  academyCode: string | null;
  /** 공유 토글 낙관 패치(셸 훅 patchExam) — 미전달 시 onChanged 로 수렴 */
  onPatchExam?: (
    studentId: string,
    reportStudentId: string,
    partial: Partial<StudioStudentExamEntry>,
  ) => void;
}

const ACTION_BTN =
  "inline-flex h-7 min-w-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-default disabled:opacity-50";

function Band({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-1.5 bg-slate-100 px-3 text-[11px] font-semibold text-slate-500">
      {label}
      {count != null ? (
        <span className="rounded-full bg-white px-1.5 text-[10px] tabular-nums text-slate-500 ring-1 ring-inset ring-slate-200/60">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
      <p className="text-[10.5px] font-semibold text-slate-400">{label}</p>
      <p
        className="mt-0.5 select-all truncate font-mono text-[13px] font-semibold tracking-[0.15em] text-slate-900"
        title={code}
      >
        {code || "—"}
      </p>
    </div>
  );
}

function ExamEntryRow({
  studentId,
  entry,
  onOpenAnalysis,
  onPatchExam,
  onChanged,
}: {
  studentId: string;
  entry: StudioStudentExamEntry;
  onOpenAnalysis: StudentDetailRailProps["onOpenAnalysis"];
  onPatchExam: StudentDetailRailProps["onPatchExam"];
  onChanged: () => void;
}) {
  const [shareBusy, setShareBusy] = useState(false);
  const report = REPORT_BADGE[entry.reportStatus];
  const grading = entryBadge(entry);
  const isInternal = entry.sourceType === "INTERNAL";
  const canShare = entry.reportStatus === "GENERATED";
  const hasAnswerLink = !isInternal && entry.answerEnabled && !!entry.answerToken;

  const patch = (partial: Partial<StudioStudentExamEntry>) => {
    if (onPatchExam) onPatchExam(studentId, entry.reportStudentId, partial);
    else onChanged();
  };

  const handleShareCopy = async () => {
    setShareBusy(true);
    try {
      let token = entry.shareEnabled ? entry.shareToken : null;
      if (!token) {
        const res = await enableExamReportShare(entry.reportStudentId);
        token = res.token;
        patch({ shareEnabled: true, shareToken: token });
      }
      await copyWithToast(
        reportShareUrl(token),
        "공유 링크를 복사했습니다. 학부모·학생에게 전달하세요.",
      );
    } catch {
      toast.error("공유 링크 발급에 실패했습니다.");
    } finally {
      setShareBusy(false);
    }
  };

  const handleShareOff = async () => {
    setShareBusy(true);
    try {
      await disableExamReportShare(entry.reportStudentId);
      patch({ shareEnabled: false, shareToken: null });
      toast.success("공유를 껐습니다. 기존 링크는 더 이상 열리지 않습니다.");
    } catch {
      toast.error("공유 끄기에 실패했습니다.");
    } finally {
      setShareBusy(false);
    }
  };

  const handleAnswerCopy = async () => {
    if (!entry.answerToken) return;
    await copyWithToast(
      answerLinkUrl(entry.answerToken),
      "답안 입력 링크를 복사했습니다. 학생에게 전달하세요.",
    );
  };

  return (
    <div
      data-student-exam-row={entry.reportStudentId}
      className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5"
    >
      <p
        className="truncate text-[12.5px] font-semibold text-slate-900"
        title={entry.title}
      >
        {entry.title}
      </p>
      <p className="truncate text-[11px] text-slate-400">
        {examTypeLabel(entry.examType)} · {formatDateTime(entry.updatedAt)}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-medium tabular-nums text-slate-700">
          {formatScore(entry)}
        </span>
        <StatusBadge tone={grading.tone}>{grading.label}</StatusBadge>
        <StatusBadge tone={report.tone}>{report.label}</StatusBadge>
        {entry.shareEnabled ? (
          <StatusBadge tone="blue">공유 중</StatusBadge>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {canShare ? (
          <button
            type="button"
            onClick={() => void handleShareCopy()}
            disabled={shareBusy}
            className={ACTION_BTN}
          >
            <Link2 className="size-3" aria-hidden="true" />
            {entry.shareEnabled ? "공유 링크 복사" : "공유 켜고 링크 복사"}
          </button>
        ) : null}
        {canShare && entry.shareEnabled ? (
          <RailConfirmButton
            label="공유 끄기"
            confirmLabel="한 번 더 → 공유 끄기"
            tone="danger"
            busy={shareBusy}
            onConfirm={() => void handleShareOff()}
          />
        ) : null}
        {hasAnswerLink ? (
          <button
            type="button"
            onClick={() => void handleAnswerCopy()}
            className={ACTION_BTN}
          >
            <Link2 className="size-3" aria-hidden="true" />
            답안 링크 복사
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onOpenAnalysis(entry.analysisId, entry.reportStudentId)}
          data-student-open-analysis
          className={cn(ACTION_BTN, "text-blue-700 hover:bg-blue-50")}
        >
          <FileBarChart className="size-3" aria-hidden="true" />
          시험 분석에서 열기
        </button>
      </div>
    </div>
  );
}

export function StudentDetailRail({
  classId,
  student,
  mode,
  onClose,
  onOpenAnalysis,
  onChanged,
  onRemoved,
  academyCode,
  onPatchExam,
}: StudentDetailRailProps) {
  const [removing, setRemoving] = useState(false);

  if (mode === "add") {
    return (
      <StudentRailAddPanel
        classId={classId}
        onClose={onClose}
        onChanged={onChanged}
      />
    );
  }

  if (!student) return <StudentRailEmpty />;

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await removeStudentFromStudioClass({
        classId,
        studentId: student.studentId,
      });
      if (!res.success) {
        toast.error(res.error ?? "학생 제외에 실패했습니다.");
        return;
      }
      toast.success(
        `「${student.name}」 학생을 클래스에서 제외했습니다. 계정·기록은 보존됩니다.`,
      );
      onRemoved?.(student.studentId);
      onChanged();
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      data-student-rail
      data-student-rail-mode="detail"
      className="flex h-full min-h-0 flex-col"
    >
      {/* 헤더 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13px] font-semibold text-slate-900"
            title={student.name}
          >
            {student.name}
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
            <span className="truncate font-mono tracking-wider">
              {student.studentCode}
            </span>
            <span aria-hidden className="h-2.5 w-px bg-slate-200" />
            <span className="shrink-0">{gradeLabel(student.grade)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="학생 상세 닫기"
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── 초대 ── */}
        <Band label="초대" />
        <div data-student-invite className="flex flex-col gap-2.5 p-3">
          <div className="grid grid-cols-2 gap-2">
            <CodeBlock label="학원 코드" code={academyCode ?? ""} />
            <CodeBlock label="학생 코드" code={student.studentCode} />
          </div>
          {academyCode ? (
            <StudentAppShareRow
              academyCode={academyCode}
              studentCode={student.studentCode}
              studentName={student.name}
            />
          ) : null}
        </div>

        {/* ── 시험 리포트 ── */}
        <Band label="시험 리포트" count={student.exams.length} />
        {student.exams.length === 0 ? (
          <p className="break-keep px-3 py-4 text-[11.5px] leading-relaxed text-slate-400">
            아직 이 학생의 시험 리포트가 없습니다. 시험 분석에서 학생을 추가하면
            여기에 표시됩니다.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {student.exams.map((entry) => (
              <ExamEntryRow
                key={entry.reportStudentId}
                studentId={student.studentId}
                entry={entry}
                onOpenAnalysis={onOpenAnalysis}
                onPatchExam={onPatchExam}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}

        {/* ── 클래스 ── */}
        <Band label="클래스" />
        <div className="flex flex-col gap-1.5 p-3">
          <RailConfirmButton
            label="클래스에서 제외"
            confirmLabel="한 번 더 → 제외"
            tone="danger"
            busy={removing}
            onConfirm={() => void handleRemove()}
            className="w-full"
          />
          <p className="break-keep text-[10.5px] leading-relaxed text-slate-400">
            학생 계정과 학습 기록은 보존되고 이 클래스 편성만 해제됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

/** 학생 관리 뷰에서 아직 학생을 고르지 않았을 때의 레일 안내(분석 레일 빈 상태와 동형). */
export function StudentRailEmpty() {
  return (
    <div data-student-rail-empty className="flex h-full items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-slate-50">
          <UserRound className="size-6 text-slate-300" aria-hidden="true" />
        </div>
        <p className="break-keep text-[12px] leading-relaxed text-slate-400">
          왼쪽 목록에서 학생을 선택하면
          <br />
          초대 링크·시험 리포트·공유 상태가 여기에 표시됩니다
        </p>
      </div>
    </div>
  );
}
