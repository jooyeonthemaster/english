"use client";

// ---------------------------------------------------------------------------
// 시험 배포 모달 — 할당 현황 테이블. 행별 액션(모드 변경·링크 복사/열기·회수/
// 재활성·재발급·재응시 초기화·할당 해제)은 전부 부모 콜백으로 위임한다(확인
// 다이얼로그·토스트·transition 은 exam-deploy-modal.tsx 소유).
// ---------------------------------------------------------------------------

import {
  Copy,
  ExternalLink,
  Link2,
  Link2Off,
  RefreshCw,
  RotateCcw,
  UserRoundMinus,
} from "lucide-react";
import type {
  ExamAssignmentItem,
  ExamAssignMode,
} from "@/actions/exams/assignments";
import { cn } from "@/lib/utils";
import { assignmentStatusMeta, MODE_OPTIONS } from "./deploy-status";

interface AssignmentTableProps {
  assignments: ExamAssignmentItem[];
  pending: boolean;
  onChangeMode: (submissionId: string, mode: ExamAssignMode) => void;
  onCopyLink: (tokenPath: string) => void;
  onToggleAccess: (submissionId: string, enabled: boolean) => void;
  onRotateToken: (submissionId: string, studentName: string) => void;
  onReset: (submissionId: string, studentName: string) => void;
  onUnassign: (submissionId: string, studentName: string) => void;
}

/** 테이블 행 공용 아이콘 버튼 — title/aria 필수, 처리 중 일괄 비활성 */
function RowIconButton({
  title,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        danger
          ? "border-red-200 text-red-500 hover:bg-red-50"
          : "border-[#E5E8EB] text-slate-500 hover:bg-slate-50 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

export function AssignmentTable({
  assignments,
  pending,
  onChangeMode,
  onCopyLink,
  onToggleAccess,
  onRotateToken,
  onReset,
  onUnassign,
}: AssignmentTableProps) {
  if (assignments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[#E5E8EB] bg-slate-50/60 px-4 py-6 text-center text-[12px] font-semibold text-[#8B95A1]">
        아직 할당된 학생이 없습니다. 위에서 학생을 선택해 할당해 주세요.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#E5E8EB]">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[#E5E8EB] bg-slate-50/80 text-[11px] font-bold text-[#8B95A1]">
            <th className="px-3 py-2">학생</th>
            <th className="px-3 py-2">모드</th>
            <th className="px-3 py-2">상태</th>
            <th className="px-3 py-2">응시 링크</th>
            <th className="px-3 py-2 text-right">관리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {assignments.map((row) => {
            const statusMeta = assignmentStatusMeta(row.status);
            const finished =
              row.status === "SUBMITTED" || row.status === "GRADED";
            const meta = [
              row.schoolName,
              row.grade ? `${row.grade}학년` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const score =
              row.status === "GRADED" &&
              row.scoreSummary &&
              row.scoreSummary.totalScore != null &&
              row.scoreSummary.maxScore != null
                ? `${row.scoreSummary.totalScore}점 / ${row.scoreSummary.maxScore}점`
                : null;
            return (
              <tr key={row.submissionId} className="align-middle">
                {/* 학생 */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-bold text-slate-800">
                      {row.studentName}
                    </p>
                    {/* 학생 응시 코드 — 공유 QR 자기등록 안내용. 교사가 읽어줄 수 있게 노출. */}
                    {row.studentCode && (
                      <span
                        className="select-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-slate-700"
                        title="학생 응시 코드"
                      >
                        {row.studentCode}
                      </span>
                    )}
                  </div>
                  {meta && (
                    <p className="mt-0.5 text-[11px] font-medium text-[#8B95A1]">
                      {meta}
                    </p>
                  )}
                </td>
                {/* 모드 */}
                <td className="px-3 py-2.5">
                  <select
                    value={row.mode ?? ""}
                    onChange={(event) =>
                      onChangeMode(
                        row.submissionId,
                        event.target.value as ExamAssignMode,
                      )
                    }
                    disabled={pending || finished}
                    title={
                      finished
                        ? "제출된 응시는 모드를 변경할 수 없습니다."
                        : "응시 모드 변경"
                    }
                    aria-label={`${row.studentName} 응시 모드`}
                    className="h-8 rounded-md border border-[#E5E8EB] bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none transition-colors focus:border-[#3182F6] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {row.mode == null && <option value="">미지정</option>}
                    {MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                {/* 상태 */}
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
                      statusMeta.chipClass,
                    )}
                  >
                    {statusMeta.label}
                  </span>
                  {score && (
                    <p className="mt-0.5 text-[11px] font-semibold text-[#8B95A1]">
                      {score}
                    </p>
                  )}
                </td>
                {/* 응시 링크 */}
                <td className="px-3 py-2.5">
                  {row.tokenPath ? (
                    <div className="flex items-center gap-1">
                      <RowIconButton
                        title="응시 링크 복사"
                        onClick={() => onCopyLink(row.tokenPath as string)}
                        disabled={pending || !row.accessEnabled}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      </RowIconButton>
                      {row.accessEnabled ? (
                        <a
                          href={row.tokenPath}
                          target="_blank"
                          rel="noreferrer noopener"
                          title="응시 링크 새 탭에서 열기"
                          aria-label="응시 링크 새 탭에서 열기"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#E5E8EB] bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                        >
                          <ExternalLink
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        </a>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          회수됨
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] font-semibold text-[#8B95A1]">
                      링크 없음
                    </span>
                  )}
                </td>
                {/* 관리 */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <RowIconButton
                      title={
                        row.accessEnabled ? "응시 링크 회수" : "응시 링크 재활성"
                      }
                      onClick={() =>
                        onToggleAccess(row.submissionId, !row.accessEnabled)
                      }
                      disabled={pending}
                    >
                      {row.accessEnabled ? (
                        <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </RowIconButton>
                    <RowIconButton
                      title="응시 링크 재발급"
                      onClick={() =>
                        onRotateToken(row.submissionId, row.studentName)
                      }
                      disabled={pending}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    </RowIconButton>
                    <RowIconButton
                      title="재응시 (답안·채점 초기화)"
                      onClick={() => onReset(row.submissionId, row.studentName)}
                      disabled={pending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    </RowIconButton>
                    {row.status === "ASSIGNED" && (
                      <RowIconButton
                        title="할당 해제"
                        onClick={() =>
                          onUnassign(row.submissionId, row.studentName)
                        }
                        disabled={pending}
                        danger
                      >
                        <UserRoundMinus
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      </RowIconButton>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
