"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 (허브·라이브러리 공용 컨테이너)
//
// rows 는 부모(useExamReportActivity 폴링)가 소유하고, 이 컴포넌트는 검색·상태
// 필터·삭제 확인·재분석 발사 같은 보드 로컬 상태만 가진다. 카드 렌더는
// analyses-board-cards, 표시 메타/판별식은 board-shared 로 단일화(중복 박멸).
// ============================================================================

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  FileClock,
  Loader2,
  RotateCw,
  Search,
} from "lucide-react";
import type { ExamAnalysisStatus } from "@/lib/exam-report/types";
import type { ExamReportSummaryRow } from "@/hooks/use-exam-report-activity";
import { deleteExamAnalysis } from "@/actions/exam-report";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fireAnalyzeRequest } from "./board-shared";
import { BoardCard } from "./analyses-board-cards";

type StatusFilter = "all" | "analyzing" | "analyzed" | "failed" | "draft";

const FILTER_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "analyzing", label: "분석 중" },
  { key: "analyzed", label: "완료" },
  { key: "failed", label: "실패" },
  { key: "draft", label: "임시" },
];

const FILTER_STATUS: Record<
  Exclude<StatusFilter, "all">,
  ExamAnalysisStatus
> = {
  analyzing: "ANALYZING",
  analyzed: "ANALYZED",
  failed: "FAILED",
  draft: "DRAFT",
};

export interface AnalysesBoardProps {
  rows: ExamReportSummaryRow[];
  /** 첫 응답 도착 전(훅의 실제 로딩) — 스켈레톤 표시 */
  loading: boolean;
  /** 데이터 없이 첫 페치 실패 — 재시도 배너 표시 */
  error?: boolean;
  /** 카드 클릭 이동 베이스 (예: /director/workbench/exam-report) */
  workspaceBase: string;
  /** 폴 즉시 재기동(삭제/재분석/재시도 후) */
  onRefresh: () => void;
  /** 고아 DRAFT "이어서 등록" — 허브: 인테이크 패널 주입 / 라이브러리: 허브 이동 */
  onResumeDraft: (row: ExamReportSummaryRow) => void;
  /** 빈 목록 보조 문구(컨텍스트별 커스텀) */
  emptyHint?: string;
}

export function AnalysesBoard({
  rows,
  loading,
  error = false,
  workspaceBase,
  onRefresh,
  onResumeDraft,
  emptyHint,
}: AnalysesBoardProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<ExamReportSummaryRow | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  // 다시 분석/이어서 분석 발사 직후 버튼 비활성(폴이 상태를 뒤집을 때까지 잠깐).
  const [restartingIds, setRestartingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: rows.length,
      analyzing: 0,
      analyzed: 0,
      failed: 0,
      draft: 0,
    };
    for (const r of rows) {
      if (r.status === "ANALYZING") c.analyzing += 1;
      else if (r.status === "ANALYZED") c.analyzed += 1;
      else if (r.status === "FAILED") c.failed += 1;
      else if (r.status === "DRAFT") c.draft += 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== FILTER_STATUS[filter]) return false;
      if (!q) return true;
      return `${r.title} ${r.schoolName ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  const handleOpen = useCallback(
    (row: ExamReportSummaryRow) => {
      router.push(`${workspaceBase}/${row.id}`);
    },
    [router, workspaceBase],
  );

  // 분석 완료 카드 "학생 추가" — ?openAddStudent=1 딥링크로 워크스페이스 진입.
  // (analysis-step 의 ?start=1 관례 미러 — 워크스페이스가 파라미터를 읽어
  // 학생 관리 탭으로 직행하고, students-tab 이 같은 파라미터로 학생 추가
  // 다이얼로그를 바로 연 뒤 URL 에서 소비한다.)
  const handleAddStudent = useCallback(
    (row: ExamReportSummaryRow) => {
      router.push(`${workspaceBase}/${row.id}?openAddStudent=1`);
    },
    [router, workspaceBase],
  );

  // 다시 분석/이어서 분석 — fire-and-forget 후 폴만 갱신(서버 자가연쇄가 완주).
  const handleRestart = useCallback(
    (row: ExamReportSummaryRow) => {
      setRestartingIds((prev) => new Set(prev).add(row.id));
      fireAnalyzeRequest(row.id);
      // (결함수리) 확정형 "시작했습니다" → 낙관형 "요청했습니다" — 402(크레딧
      // 부족) 등으로 실제로는 시작되지 않을 수 있어 거짓 성공 단정을 피한다
      // (402 는 fireAnalyzeRequest 가 에러 토스트로 알린다).
      toast.success("분석을 요청했습니다. 진행 상황이 곧 갱신됩니다.");
      onRefresh();
      // 서버가 상태를 못 뒤집었을 때(크레딧 부족 등) 버튼을 되살리는 안전핀.
      window.setTimeout(() => {
        setRestartingIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }, 15_000);
    },
    [onRefresh],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteExamAnalysis(deleteTarget.id);
      toast.success("삭제되었습니다");
      setDeleteTarget(null);
      onRefresh();
    } catch {
      toast.error("삭제 중 문제가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, onRefresh]);

  const showEmpty = !loading && !error && rows.length === 0;
  const showNoMatch =
    !loading && !error && rows.length > 0 && filtered.length === 0;

  return (
    <div className="flex flex-col">
      {/* 툴바 — 상태 필터 칩 + 검색 */}
      <div className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_CHIPS.map((chip) => {
            const active = filter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                className={cn(
                  "inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  active
                    ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
                    : "cursor-pointer border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600",
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    active ? "text-blue-500" : "text-slate-300",
                  )}
                >
                  {counts[chip.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목 · 학교 검색"
            className="pl-9"
          />
        </div>
      </div>

      {/* 본문 */}
      <div className="px-4 py-4 sm:px-5">
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[120px] animate-pulse rounded-xl border border-slate-200 bg-slate-100"
              />
            ))}
          </div>
        ) : error ? (
          <div className="py-14 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-rose-400" />
            <p className="font-medium text-slate-600">
              목록을 불러오지 못했습니다.
            </p>
            <p className="mt-1 text-sm text-slate-400">
              잠시 후 다시 시도해 주세요.
            </p>
            <div className="mt-4 flex items-center justify-center">
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RotateCw className="h-4 w-4" />
                다시 시도
              </Button>
            </div>
          </div>
        ) : showEmpty ? (
          <div className="py-14 text-center">
            <FileClock className="mx-auto mb-3 h-12 w-12 text-slate-200" />
            <p className="font-medium text-slate-500">
              아직 등록한 시험지가 없습니다
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {emptyHint ?? "시험지를 등록하면 분석 현황이 여기에 표시됩니다."}
            </p>
          </div>
        ) : showNoMatch ? (
          <div className="py-14 text-center">
            <Search className="mx-auto mb-3 h-10 w-10 text-slate-200" />
            <p className="font-medium text-slate-500">
              조건에 맞는 시험지가 없습니다.
            </p>
            <div className="mt-4 flex items-center justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                필터 초기화
              </Button>
            </div>
          </div>
        ) : (
          /* 학습지 생성 목록과 동일 그리드 규격(gap-3 · lg 3열) — UI 통일 */
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((row) => (
              <BoardCard
                key={row.id}
                row={row}
                restarting={restartingIds.has(row.id)}
                onOpen={handleOpen}
                onRestart={handleRestart}
                onResumeDraft={onResumeDraft}
                onAddStudent={handleAddStudent}
                onRequestDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* 삭제 확인 다이얼로그 (제어형) */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 분석을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `"${deleteTarget.title}" — ` : ""}
              분석과 학생 리포트가 함께 삭제되며 공유 링크도 즉시 비활성화됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
