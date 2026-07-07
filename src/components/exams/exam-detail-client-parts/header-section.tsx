"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  FileText,
  Pencil,
  PencilLine,
  Send,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from "./constants";
import type { ExamDetail } from "./types";

// ---------------------------------------------------------------------------
// 상세 화면 상단 헤더 (제목 + 메타 + 액션 버튼)
// ---------------------------------------------------------------------------

interface HeaderSectionProps {
  exam: ExamDetail;
  isPending: boolean;
  onPublish: () => void;
}

export function HeaderSection({ exam, isPending, onPublish }: HeaderSectionProps) {
  const router = useRouter();
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/director/exams")}
          className="shrink-0 mt-0.5"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-[#191F28] break-keep">{exam.title}</h1>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATUS_COLORS[exam.status],
              )}
            >
              {STATUS_LABELS[exam.status]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#8B95A1]">
            <span>{TYPE_LABELS[exam.type]}</span>
            {exam.class && <span>{exam.class.name}</span>}
            {exam.examDate && (
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                {formatDate(exam.examDate)}
              </span>
            )}
            {exam.duration && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                {exam.duration}분
              </span>
            )}
            <span>{exam.totalPoints}점</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 md:flex-nowrap md:shrink-0">
        <Button asChild variant="outline">
          <Link href={`/director/workbench/exams/${exam.id}/edit`}>
            <PencilLine className="size-4 mr-1.5" />
            시험지 수정
          </Link>
        </Button>
        {exam.status === "DRAFT" && (
          <Button
            onClick={onPublish}
            disabled={isPending || exam.questions.length === 0}
            className="bg-[#3182F6] hover:bg-[#1B64DA]"
          >
            <Send className="size-4 mr-1.5" />
            {isPending ? "배포 중..." : "배포하기"}
          </Button>
        )}
        {showResults &&
          (exam.status === "IN_PROGRESS" || exam.status === "COMPLETED") &&
          exam.submissions.some((s) => s.status === "SUBMITTED") && (
            <Button asChild className="bg-[#3182F6] hover:bg-[#1B64DA]">
              <Link href={`/director/exams/${exam.id}/grade`}>
                <Pencil className="size-4 mr-1.5" />
                채점하기
              </Link>
            </Button>
          )}
        {exam.questions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="size-4 mr-1.5" />
                시험지 다운로드
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a
                  href={`/api/exams/${exam.id}/export-docx`}
                  download
                  onClick={(e) => {
                    e.currentTarget.href = `/api/exams/${exam.id}/export-docx?t=${Date.now()}`;
                  }}
                >
                  <FileText className="size-4 mr-2" />
                  시험지 (문제만)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/exams/${exam.id}/export-docx?answers=true`}
                  download
                  onClick={(e) => {
                    e.currentTarget.href = `/api/exams/${exam.id}/export-docx?answers=true&t=${Date.now()}`;
                  }}
                >
                  <FileText className="size-4 mr-2" />
                  시험지 + 정답 해설
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
