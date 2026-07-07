"use client";

// ============================================================================
// 학생 시험 리포트 — 라이브러리(리포트 관리) 컨테이너
//
// 허브와 동일한 분석 현황 보드(analyses-board)를 재사용한다 — 자체 테이블·
// 인라인 폴링·상태 뱃지 복붙을 폐기하고 useExamReportActivity 훅 + board
// 모듈로 단일화. 검색/필터/삭제/재분석은 보드가 소유한다. 고아 DRAFT 의
// "이어서 등록"은 인테이크가 있는 허브로 이동시킨다.
// ============================================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { FileChartColumn, Plus } from "lucide-react";
import { useExamReportActivity } from "@/hooks/use-exam-report-activity";
import { Button } from "@/components/ui/button";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { AnalysesBoard } from "@/components/exam-report/hub/analyses-board";
import { resolveExamReportBase } from "@/components/exam-report/hub/board-shared";

export function ExamReportLibraryClient() {
  const router = useRouter();
  const pathname = usePathname();
  // /director|/teacher 프리픽스 보존 — 허브와 같은 계산(board-shared)으로 통일.
  const base = useMemo(() => resolveExamReportBase(pathname), [pathname]);

  const { analyses, loading, error, refresh } = useExamReportActivity();

  // 고아 DRAFT "이어서 등록" — 인테이크 패널은 허브에 있으므로 허브로 이동.
  const handleResumeDraft = useCallback(() => {
    router.push(base);
  }, [router, base]);

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      <main className="flex w-full min-w-0 flex-col gap-4">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {/* 헤더 스트립 — WorkflowPageTitle + 프라이머리 액션 */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
            <WorkflowPageTitle
              icon={FileChartColumn}
              title="리포트 관리"
              description="분석한 시험지와 학생 리포트를 한곳에서 관리합니다. (최근 50개)"
            />
            <Button
              asChild
              size="sm"
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Link href={base}>
                <Plus className="h-4 w-4" />새 시험지 분석
              </Link>
            </Button>
          </div>

          {/* 본문 — 허브와 공용 보드(검색·필터·진행률·삭제 내장) */}
          <AnalysesBoard
            rows={analyses}
            loading={loading}
            error={error}
            workspaceBase={base}
            onRefresh={refresh}
            onResumeDraft={handleResumeDraft}
            emptyHint="시험지를 등록하면 문항 분석과 학생 리포트를 만들 수 있어요."
          />
        </section>
      </main>
    </div>
  );
}
