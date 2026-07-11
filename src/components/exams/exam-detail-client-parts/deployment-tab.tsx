"use client";

// ============================================================================
// 시험지 상세 — "학생 응시" 탭 (유닛 V4, 설계 §5-V4 · U5 과제 배포 배선)
//
// FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT 게이트 하에서만 마운트된다(부모 탭).
// 자급자족: getExamAssignments(W3) 로 할당 현황을 직접 적재.
//  (a) 상단 액션 바 — "과제 배포"(AssignmentComposer, U5) + "배포 링크 관리"
//      (ExamDeployModal, V1 — 개별 링크·QR 자기등록 관리) + AI 심층분석 보강
//  (b) 할당 학생 테이블(AssignmentTable)
//  (c) 채점 검토 드로어(ReviewDrawer — NEEDS_REVIEW 해소·대리입력·재채점)
//  (d) GRADED "리포트 만들기" — exam-report 허브 폴백(개별 딥링크 id 미노출)
//  (e) 빈 상태 — 안내 + 배포 관리 CTA
// 레거시 "응시 현황" 탭(SHOW_USER_RESULTS 게이트)과 완전히 독립 — 무회귀.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Send, TabletSmartphone, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExamDeployModal } from "@/components/exams/exam-deploy-modal";
import { AssignmentComposer } from "@/components/study-assignments/assignment-composer";
import {
  getExamAssignments,
  type ExamAssignmentItem,
} from "@/actions/exams/assignments";
import { AssignmentTable } from "./deployment-tab-parts/assignment-table";
import { AnalysisBoostButton } from "./deployment-tab-parts/boost-button";
import { ReviewDrawer } from "./deployment-tab-parts/review-drawer";

interface DeploymentTabProps {
  examId: string;
  examTitle: string;
  /** 비용 고지용 문항 수(청구 정본은 서버) */
  questionCount: number;
  /** exam.subject — "KOREAN" 이면 과제 배포 비활성(서버 KOREAN 거부 가드 대칭) */
  subject?: string | null;
}

export function DeploymentTab({
  examId,
  examTitle,
  questionCount,
  subject,
}: DeploymentTabProps) {
  const router = useRouter();
  const [items, setItems] = useState<ExamAssignmentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deployOpen, setDeployOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const assignLocked = subject === "KOREAN";

  // setState 는 전부 then/catch 콜백(비동기)에서만 — 이펙트 동기 경로에 없음.
  const load = useCallback(
    () =>
      getExamAssignments(examId)
        .then((result) => {
          if (result.success && result.data) {
            setItems(result.data);
            setError(null);
          } else {
            setError(result.error ?? "할당 현황을 불러오지 못했습니다.");
          }
        })
        .catch(() => {
          setError("할당 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }),
    [examId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const loading = items == null && error == null;
  const submittedCount =
    items?.filter((i) => i.status === "SUBMITTED" || i.status === "GRADED").length ?? 0;
  const gradedCount = items?.filter((i) => i.status === "GRADED").length ?? 0;

  return (
    <div className="space-y-4">
      {/* 상단 액션 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#191F28]">학생 응시 관리</h3>
          <p className="mt-0.5 text-xs text-[#8B95A1]">
            {items && items.length > 0
              ? `할당 ${items.length}명 · 제출 ${submittedCount}명 · 채점완료 ${gradedCount}명`
              : "학생을 할당하면 태블릿 응시 링크와 OMR 답안 입력을 쓸 수 있습니다."}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="할당 현황 새로고침"
            onClick={() => {
              setItems(null);
              setError(null);
              void load();
            }}
            className="size-11 text-[#8B95A1] hover:text-[#4E5968]"
          >
            <RefreshCw className="size-4" />
          </Button>
          <AnalysisBoostButton examId={examId} questionCount={questionCount} />
          {/* 배포 링크 관리(구 "학생 배포 관리") — 개별 응시 링크·QR 자기등록 용도 유지 */}
          <Button
            onClick={() => setDeployOpen(true)}
            className="h-11 bg-[#3182F6] px-4 text-white hover:bg-[#1B64DA]"
          >
            <UserPlus className="size-4" />
            배포 링크 관리
          </Button>
          {/* 과제 배포(U5) — 마감일·안내문과 함께 학생 앱 과제로 보내는 통합 컴포저 */}
          <Button
            onClick={() => setComposerOpen(true)}
            disabled={assignLocked}
            title={assignLocked ? "국어 시험지는 지원 예정입니다" : undefined}
            className="h-11 bg-blue-600 px-4 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="size-4" />
            과제 배포
          </Button>
        </div>
      </div>

      {/* 본문: 로딩 / 에러 / 빈 상태 / 테이블 */}
      {loading && (
        <div className="space-y-2 rounded-xl border border-[#E5E8EB] bg-white p-4">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-[#E5E8EB] bg-white p-10 text-center">
          <p className="text-sm text-[#4E5968]">{error}</p>
          <Button
            variant="outline"
            className="mt-3 h-11 border-[#E5E8EB] px-4 text-[#4E5968]"
            onClick={() => {
              setItems(null);
              setError(null);
              void load();
            }}
          >
            다시 불러오기
          </Button>
        </div>
      )}

      {!loading && !error && items && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#E5E8EB] bg-white py-16">
          <TabletSmartphone className="mb-3 size-12 text-[#B0B8C1] opacity-60" />
          <p className="text-sm font-medium text-[#4E5968]">
            아직 응시할 학생이 할당되지 않았습니다.
          </p>
          <p className="mt-1 text-xs text-[#8B95A1]">
            학생을 할당하면 태블릿 응시 링크가 발급되고, 제출 즉시 자동 채점됩니다.
          </p>
          <Button
            onClick={() => setDeployOpen(true)}
            className="mt-4 h-11 bg-[#3182F6] px-5 text-white hover:bg-[#1B64DA]"
          >
            <UserPlus className="size-4" />
            배포 링크 관리
          </Button>
        </div>
      )}

      {!loading && !error && items && items.length > 0 && (
        <AssignmentTable items={items} onOpenReview={setReviewId} />
      )}

      {/* 배포 링크 관리 모달(V1) — 닫힐 때 현황 재적재 */}
      <ExamDeployModal
        examId={examId}
        examTitle={examTitle}
        open={deployOpen}
        onOpenChange={(open) => {
          setDeployOpen(open);
          if (!open) void load();
        }}
      />

      {/* 과제 배포 컴포저(U5) — EXAM 프리셋 고정(기본 태블릿 응시).
          완료 시 할당 현황 재적재 + 과제 관리 딥링크 토스트. */}
      <AssignmentComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        preset={{
          kind: "EXAM",
          content: { refId: examId, title: examTitle, meta: `${questionCount}문항` },
          examMode: "TABLET",
        }}
        onCreated={(assignmentId) => {
          void load();
          router.refresh();
          toast("과제 관리에서 배포 현황을 확인할 수 있습니다.", {
            action: {
              label: "과제 관리에서 보기",
              onClick: () =>
                router.push(`/director/students/assignments?open=${assignmentId}`),
            },
          });
        }}
      />

      {/* 채점 검토 드로어 */}
      <ReviewDrawer
        submissionId={reviewId}
        onClose={() => setReviewId(null)}
        onMutated={() => void load()}
      />
    </div>
  );
}
