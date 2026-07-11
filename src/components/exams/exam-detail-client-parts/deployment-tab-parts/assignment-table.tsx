"use client";

// ============================================================================
// 학생 응시 탭 — 할당 학생 테이블 (V4 소유)
//
// 학생명·모드·상태칩·점수(GRADED 만 요약)·제출시각·행 액션(채점 검토).
// 할당 생성/링크 관리 등 쓰기 조작은 ExamDeployModal(V1) 소관 — 여기는 현황 +
// 검토 진입만. GRADED 행의 "리포트 만들기"는 리포트 학생이 연결돼 있으면(SF4)
// 해당 분석의 학생 워크스페이스로 딥링크하고, 없으면 exam-report 허브로 폴백한다.
// ============================================================================

import Link from "next/link";
import { ClipboardCheck, FileChartColumn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import type { ExamAssignmentItem } from "@/actions/exams/assignments";
import {
  AssignmentStatusChip,
  formatScoreBrief,
  MODE_LABELS,
} from "./shared";

/** 리포트 딥링크 폴백 — 허브(리포트 학생 미연결 시, 파일 상단 주석) */
export const EXAM_REPORT_HUB_PATH = "/director/workbench/exam-report";

/**
 * 리포트 "만들기" 링크 목적지 — 리포트 학생(reportStudentId)과 그 분석(reportAnalysisId)이
 * 둘 다 연결돼 있으면 해당 학생 리포트 워크스페이스로 딥링크, 아니면 허브로 폴백한다.
 */
export function reportLinkFor(item: {
  reportStudentId: string | null;
  reportAnalysisId: string | null;
}): string {
  if (item.reportStudentId && item.reportAnalysisId) {
    return `${EXAM_REPORT_HUB_PATH}/${item.reportAnalysisId}/students/${item.reportStudentId}`;
  }
  return EXAM_REPORT_HUB_PATH;
}

interface AssignmentTableProps {
  items: ExamAssignmentItem[];
  onOpenReview: (submissionId: string) => void;
}

export function AssignmentTable({ items, onOpenReview }: AssignmentTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E5E8EB] bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
            <TableHead className="text-xs font-semibold text-[#6B7684]">학생</TableHead>
            <TableHead className="text-xs font-semibold text-[#6B7684]">모드</TableHead>
            <TableHead className="text-xs font-semibold text-[#6B7684]">상태</TableHead>
            <TableHead className="text-xs font-semibold text-[#6B7684]">점수</TableHead>
            <TableHead className="text-xs font-semibold text-[#6B7684]">제출 시각</TableHead>
            <TableHead className="text-right text-xs font-semibold text-[#6B7684]">
              액션
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const graded = item.status === "GRADED";
            const score = graded ? formatScoreBrief(item.scoreSummary) : null;
            return (
              <TableRow
                key={item.submissionId}
                className="cursor-pointer"
                onClick={() => onOpenReview(item.submissionId)}
              >
                <TableCell>
                  <p className="font-medium text-[#191F28]">{item.studentName}</p>
                  <p className="mt-0.5 text-xs text-[#8B95A1]">
                    {[
                      item.schoolName,
                      item.grade > 0 ? `${item.grade}학년` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </p>
                </TableCell>
                <TableCell className="text-sm text-[#4E5968]">
                  {item.mode ? (MODE_LABELS[item.mode] ?? item.mode) : "-"}
                  {!item.accessEnabled && item.status !== "GRADED" && (
                    <p className="mt-0.5 text-[11px] text-[#8B95A1]">링크 회수됨</p>
                  )}
                </TableCell>
                <TableCell>
                  <AssignmentStatusChip status={item.status} />
                </TableCell>
                <TableCell className="text-sm tabular-nums text-[#4E5968]">
                  {score ?? <span className="text-[#B0B8C1]">-</span>}
                </TableCell>
                <TableCell className="text-sm text-[#8B95A1]">
                  {item.submittedAt ? formatDateTime(item.submittedAt) : "-"}
                </TableCell>
                <TableCell className="text-right">
                  <div
                    className="flex items-center justify-end gap-1.5"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {graded && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-11 border-[#E5E8EB] px-3 text-[#3182F6] hover:bg-blue-50 hover:text-[#3182F6]"
                      >
                        <Link href={reportLinkFor(item)}>
                          <FileChartColumn className="size-4" />
                          리포트 만들기
                        </Link>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 border-[#E5E8EB] px-3 text-[#4E5968]"
                      onClick={() => onOpenReview(item.submissionId)}
                    >
                      <ClipboardCheck className="size-4" />
                      채점 검토
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
