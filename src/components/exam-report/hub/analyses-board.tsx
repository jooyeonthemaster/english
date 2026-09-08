"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 (허브·라이브러리·스튜디오 공용 컨테이너)
//
// rows 는 부모(useExamReportActivity 폴링)가 소유하고, 이 컴포넌트는 검색·상태
// 필터·삭제 확인·재분석 발사 같은 보드 로컬 상태만 가진다. 카드 렌더는
// analyses-board-cards(+progress/candidate), 툴바 팝오버는 analyses-board-toolbar,
// 표시 메타/판별식은 board-shared 로 단일화(중복 박멸).
//
// v4(26-09-02, docs/exam-analysis-v4-spec.md §3 U4-1): 스튜디오 전용 additive
// 스위치 `groupBySource`(2그룹 밴드 — analyses-board-groups) · `candidates`(자체
// 그룹 말미 「분석 전」 카드) · `onOpenCandidate` · `activeCandidateId` ·
// `renderHint`(카드 힌트 줄) · `renderCandidateHint`(후보 힌트 줄) · `showFunnel`
// (깊이 칩·심층 글로우) · `currentClassId`(후보 「이 클래스 우선 + 나머지 접이」 축,
// analyses-board-groups 가 소비). 전부 미전달 = 허브 렌더 무변화. 필터·검색은 두
// 그룹을 관통한다 — 후보는 제목으로 검색되고, 상태 필터가 「전체」가 아니면
// 숨는다(후보에는 분석 상태가 없다). showFunnel 이면 boost RUNNING 행은 필터·
// 카운트에서 「분석 중」이다(boardStatus).
// ============================================================================

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, FileClock, Loader2, RotateCw, Search } from "lucide-react";
import type {
  ExamCandidateRow,
  ExamReportSummaryRow,
} from "@/hooks/use-exam-report-activity";
import { deleteExamAnalysis } from "@/actions/exam-report";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { CandidateCard } from "./analyses-board-candidate-card";
import {
  BOARD_GRID_CLASS,
  GroupedBoardGrid,
  isInternalRow,
  type GroupFocusRequest,
} from "./analyses-board-groups";
import {
  BoardFilterPopover,
  BoardSearchPopover,
  FILTER_STATUS,
  type StatusFilter,
} from "./analyses-board-toolbar";

const NO_CANDIDATES: ExamCandidateRow[] = [];

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
  /** 툴바 줄 왼쪽에 넣을 제목 블록 — 있으면 제목·필터·검색이 한 줄이 된다 */
  header?: ReactNode;
  /**
   * 카드 열기 가로채기(additive, 26-09-01 스튜디오 「시험 분석」 뷰) — 있으면
   * router.push 대신 이걸 부른다(스튜디오는 자체 모달로 연다). 미전달 = 기존
   * 내비게이션 그대로(허브 무회귀). onSavedExam 류 additive 하우스 패턴.
   */
  onOpenRow?: (row: ExamReportSummaryRow) => void;
  /**
   * 「학생 추가」 CTA 가로채기(additive) — handleOpen 과 **별개 핸들러**라
   * onOpenRow 하나로는 이 CTA 의 전체페이지 이탈을 못 막는다(적대검수 M2,
   * :handleAddStudent 의 ?openAddStudent=1 딥링크). 스튜디오는 모달을 학생
   * 관리 탭으로 연다. 미전달 = 기존 딥링크 그대로.
   */
  onAddStudent?: (row: ExamReportSummaryRow) => void;
  /** 상세보기 아이콘 분리 핸들러(additive) — 카드 onExpand 로 관통. */
  onExpandRow?: (row: ExamReportSummaryRow) => void;
  /** 좌측 시험지 썸네일 열 숨김(additive — 스튜디오 좁은 열). */
  hideThumbnails?: boolean;
  /** 우측 레일에 열린 분석 id — 해당 카드 하이라이트(additive). */
  activeRowId?: string | null;
  /** 카드 하단 액션 행 숨김(additive) — 스튜디오는 액션이 우측 레일 정본. */
  hideCardActions?: boolean;
  /**
   * 컴팩트 툴바(additive, 26-09-01) — 지문관리 폴더 툴바 행과 **완전 동일** 규격
   * (px-5 pt-3 pb-1.5 · 아래 구분선 · 우측 ml-auto 클러스터). 스튜디오 「시험
   * 분석」이 지문관리와 같은 시각 문법을 타기 위한 스위치. 미전달 = 허브 그대로.
   */
  compactToolbar?: boolean;
  /** 우측 클러스터 말미에 얹을 호스트 액션(additive) — 예: [+ 시험지 등록]. */
  toolbarAction?: ReactNode;
  /**
   * v4 2그룹 렌더(additive, 스펙 §1-1) — 「스모트 시험지」(INTERNAL 행 + 후보) /
   * 「외부 시험지 · 사진·PDF」로 나눈다. 26-09-03 사용자 지시로 **반반 탭**이라
   * 본문은 활성 그룹 하나만 그린다. 미전달 = 단일 그리드(허브 무변화).
   */
  groupBySource?: boolean;
  /**
   * 목록만 내부 스크롤(additive, 26-09-03) — 판 전체가 호스트 스크롤러를 타는
   * 대신 툴바를 고정하고 본문만 굴린다. 호스트가 판 아래에 `shrink-0` 도크를
   * 붙일 때 필요하다(스튜디오 시험 분석). 미전달 = 허브 무회귀.
   */
  scrollBody?: boolean;
  /** v4 미분석 스모트 시험지 후보(§2.1) — groupBySource 일 때만 그려진다. */
  candidates?: ExamCandidateRow[];
  /**
   * 그룹 탭 명시 포커스(additive, 26-09-03) — 「지금 만든 것이 저 탭에 있다」를
   * 아는 호스트만 보낸다(예: 시험지 등록 완료 → 외부 탭). `token` 전이에서만
   * 발동하므로 폴 리렌더가 사용자의 탭 선택을 되끌지 않는다. groupBySource 전용.
   */
  groupFocus?: GroupFocusRequest | null;
  /**
   * 작업 중인 클래스 id(감독 배선, 26-09-02) — 후보를 「이 클래스 시험지」(classId
   * 일치) 우선 노출 + 나머지(타 클래스·미분류) 접이로 나눈다. 미전달/null = 구분
   * 없이 전부(허브 무회귀). 그룹 렌더러(analyses-board-groups)가 소비한다.
   */
  currentClassId?: string | null;
  /** 후보 카드 클릭 — 셸이 레일에 후보 화면을 연다(액션 버튼 없음, 레일 정본). */
  onOpenCandidate?: (candidate: ExamCandidateRow) => void;
  /** 우측 레일에 열린 후보 examId — 후보 카드 하이라이트. */
  activeCandidateId?: string | null;
  /** 카드 하단 힌트 줄(§3 U4-2) — 안정 참조를 넘길 것(모듈 상수 함수 권장). */
  renderHint?: (row: ExamReportSummaryRow) => ReactNode;
  /**
   * 후보 카드 하단 힌트 줄(안내 1줄 — 버튼 아님, 레일 정본 유지) — 스튜디오는
   * deriveExamNextStep({ row: null, candidate }).title 을 같은 11px 슬롯에 넣는다.
   */
  renderCandidateHint?: (candidate: ExamCandidateRow) => ReactNode;
  /** v4 퍼널 어휘(깊이 칩·심층 분석 글로우) — BoardCard showFunnel 관통. */
  showFunnel?: boolean;
}

/**
 * 필터·카운트용 보드 상태 — showFunnel 이면 INTERNAL 심층 분석(boost RUNNING)
 * 행을 「분석 중」으로 본다(글로우 카드가 「분석 완료」 필터 아래 숨지 않게).
 */
function boardStatus(
  row: ExamReportSummaryRow,
  showFunnel: boolean,
): ExamReportSummaryRow["status"] {
  return showFunnel && row.funnel?.boost?.status === "RUNNING"
    ? "ANALYZING"
    : row.status;
}

export function AnalysesBoard({
  rows,
  loading,
  error = false,
  workspaceBase,
  onRefresh,
  onResumeDraft,
  emptyHint,
  onOpenRow,
  onAddStudent,
  onExpandRow,
  hideThumbnails = false,
  activeRowId = null,
  hideCardActions = false,
  compactToolbar = false,
  toolbarAction,
  header,
  groupBySource = false,
  scrollBody = false,
  candidates = NO_CANDIDATES,
  groupFocus = null,
  currentClassId = null,
  onOpenCandidate,
  activeCandidateId = null,
  renderHint,
  renderCandidateHint,
  showFunnel = false,
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

  // 후보는 그룹 모드에서만 존재한다. 상태 필터가 「전체」가 아니면 전부 숨김(후보엔
  // 분석 상태가 없다), 검색은 제목으로 관통(§3 U4-4 「필터·검색은 그룹 관통」).
  const visibleCandidates = groupBySource ? candidates : NO_CANDIDATES;

  // 레일에 열린 대상이 속한 그룹(26-09-03 반반 탭 추종 ②) — 후보는 정의상
  // 스모트(INTERNAL) 축이다. 선택이 없으면 null(탭 무동작).
  const activeGroupOfRail = useMemo(() => {
    if (!groupBySource) return null;
    if (activeCandidateId) return "internal" as const;
    if (!activeRowId) return null;
    const row = rows.find((r) => r.id === activeRowId);
    if (!row) return null;
    return isInternalRow(row) ? ("internal" as const) : ("external" as const);
  }, [groupBySource, activeCandidateId, activeRowId, rows]);

  // 「전체 N」은 밴드 합(행 + 후보)과 같아야 한다 — 후보도 목록 항목이다.
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: rows.length + visibleCandidates.length,
      analyzing: 0,
      analyzed: 0,
      failed: 0,
      draft: 0,
    };
    for (const r of rows) {
      const s = boardStatus(r, showFunnel);
      if (s === "ANALYZING") c.analyzing += 1;
      else if (s === "ANALYZED") c.analyzed += 1;
      else if (s === "FAILED") c.failed += 1;
      else if (s === "DRAFT") c.draft += 1;
    }
    return c;
  }, [rows, visibleCandidates.length, showFunnel]);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const q = normalizedQuery;
    return rows.filter((r) => {
      if (
        filter !== "all" &&
        boardStatus(r, showFunnel) !== FILTER_STATUS[filter]
      )
        return false;
      if (!q) return true;
      return `${r.title} ${r.schoolName ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, normalizedQuery, filter, showFunnel]);

  const filteredCandidates = useMemo(() => {
    if (filter !== "all") return NO_CANDIDATES;
    const q = normalizedQuery;
    if (!q) return visibleCandidates;
    return visibleCandidates.filter((c) => c.title.toLowerCase().includes(q));
  }, [visibleCandidates, normalizedQuery, filter]);

  const handleOpen = useCallback(
    (row: ExamReportSummaryRow) => {
      if (onOpenRow) {
        onOpenRow(row);
        return;
      }
      router.push(`${workspaceBase}/${row.id}`);
    },
    [router, workspaceBase, onOpenRow],
  );

  // 분석 완료 카드 "학생 추가" — ?openAddStudent=1 딥링크로 워크스페이스 진입.
  // (analysis-step 의 ?start=1 관례 미러 — 워크스페이스가 파라미터를 읽어
  // 학생 관리 탭으로 직행하고, students-tab 이 같은 파라미터로 학생 추가
  // 다이얼로그를 바로 연 뒤 URL 에서 소비한다.)
  const handleAddStudent = useCallback(
    (row: ExamReportSummaryRow) => {
      if (onAddStudent) {
        onAddStudent(row);
        return;
      }
      router.push(`${workspaceBase}/${row.id}?openAddStudent=1`);
    },
    [router, workspaceBase, onAddStudent],
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

  const handleOpenCandidate = useCallback(
    (candidate: ExamCandidateRow) => onOpenCandidate?.(candidate),
    [onOpenCandidate],
  );

  // 카드 렌더 1벌 — 단일 그리드와 2그룹 그리드가 같은 핸들러 묶음을 쓴다.
  const renderRow = (row: ExamReportSummaryRow) => (
    <BoardCard
      key={row.id}
      row={row}
      restarting={restartingIds.has(row.id)}
      onOpen={handleOpen}
      onRestart={handleRestart}
      onResumeDraft={onResumeDraft}
      onAddStudent={handleAddStudent}
      onRequestDelete={setDeleteTarget}
      onExpand={onExpandRow}
      hideThumbnail={hideThumbnails}
      active={activeRowId === row.id}
      hideActions={hideCardActions}
      // 2그룹 밴드가 이미 「자체 시험지」를 말한다 — 카드 칩은 그룹 모드에서 생략.
      hideSourceChip={groupBySource}
      showFunnel={showFunnel}
      renderHint={renderHint}
    />
  );
  const renderCandidate = (candidate: ExamCandidateRow) => (
    <CandidateCard
      key={`candidate:${candidate.examId}`}
      candidate={candidate}
      active={activeCandidateId === candidate.examId}
      onOpen={handleOpenCandidate}
      renderHint={renderCandidateHint}
    />
  );

  // 데이터 없이 첫 페치 실패 → 전면 에러. rows 가 있으면(낙관적 "분석 중" 카드 등)
  // 전면 에러로 가리지 않고 그리드를 유지한 채 상단 인라인 배너만 노출한다.
  // 후보만 있는 상태(분석 행 0·후보 N)도 「비어 있음」이 아니다 — 빈 상태 문구는
  // 두 그룹이 모두 0일 때만(§3 U4 빈 상태 자구 유지).
  const totalItems = rows.length + visibleCandidates.length;
  const showFullError = !loading && error && rows.length === 0;
  const showInlineError = !loading && error && rows.length > 0;
  const showEmpty = !loading && !error && totalItems === 0;
  const showNoMatch =
    !loading &&
    totalItems > 0 &&
    filtered.length === 0 &&
    filteredCandidates.length === 0;

  return (
    <div
      className={cn(
        "@container flex flex-col",
        // scrollBody(26-09-03, additive): 목록만 내부 스크롤로 돌려 툴바와
        // 호스트의 하단 도크를 화면에 붙잡아 둔다 — 지문관리(library-pane)의
        // 「툴바 + 스크롤 그리드 + shrink-0 CTA 바」 골격을 그대로 가져온 것.
        // 미전달 = 판 전체가 호스트 스크롤러를 타던 기존 동작(허브 무회귀).
        scrollBody && "min-h-0 flex-1",
      )}
    >
      {/* 툴바 — 필터·검색 팝오버(문제 관리 툴바와 동일 규격: size-7 아이콘 팝오버).
          상태 선택·개수는 필터 팝오버 안으로 접어 넣고, header 가 오면
          제목 블록과 같은 줄(좌 제목 / 우 아이콘)로 합친다. */}
      <div
        className={cn(
          compactToolbar
            ? // 지문관리 폴더 툴바 행과 동일 규격(사용자 지시 "완전 동일하게")
              "flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-5 pt-3 pb-1.5"
            : cn(
                "flex items-center border-b border-slate-100 px-4",
                header
                  ? "flex-wrap justify-between gap-3 py-3"
                  : "justify-end gap-1.5 py-2.5",
              ),
        )}
      >
        {header}
        <div
          className={cn(
            "flex items-center gap-1.5",
            compactToolbar && "ml-auto shrink-0",
          )}
        >
          <BoardFilterPopover
            filter={filter}
            counts={counts}
            onChange={setFilter}
          />
          <BoardSearchPopover query={query} onChange={setQuery} />
          {toolbarAction}
        </div>
      </div>

      {/* 본문 — scrollBody 면 여기가 유일 스크롤러가 된다. */}
      <div
        data-analyses-board-scroll={scrollBody ? "" : undefined}
        className={cn(
          "px-4 pb-4 sm:px-5",
          !groupBySource && "pt-4",
          scrollBody && "min-h-0 flex-1 overflow-y-auto",
        )}
      >
        {loading ? (
          <div className={BOARD_GRID_CLASS}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[120px] animate-pulse rounded-xl border border-slate-200 bg-slate-100"
              />
            ))}
          </div>
        ) : showFullError ? (
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
          /* 학습지 생성 목록과 동일 그리드 규격(gap-3 · 최대 3열) — 열 수는
             뷰포트가 아닌 보드 컨테이너 폭 기준(@container): 사이드바·개발자
             도구로 실제 폭이 좁아지면 3→2→1열로 줄어 카드가 짓눌리지 않는다 */
          <>
            {showInlineError && (
              <div className="mb-3 flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-rose-600">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>최신 목록을 불러오지 못했어요. 표시된 항목은 방금 요청한 분석입니다.</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  className="shrink-0 self-start border-rose-200 text-rose-600 hover:bg-rose-100 sm:self-auto"
                >
                  <RotateCw className="h-4 w-4" />
                  다시 시도
                </Button>
              </div>
            )}
            {groupBySource ? (
              <GroupedBoardGrid
                rows={filtered}
                candidates={filteredCandidates}
                renderRow={renderRow}
                renderCandidate={renderCandidate}
                currentClassId={currentClassId}
                // 검색 중엔 후보를 접지 않는다(검색에서 숨는 항목 0).
                searchActive={normalizedQuery.length > 0}
                // 레일에 열린 행이 속한 그룹 — 탭이 레일을 따라간다(26-09-03).
                // `filtered` 가 아니라 `rows` 로 찾는다: 필터·검색에서 빠진 행이
                // 레일에 열려 있을 수 있고, 그때도 소속 그룹은 사실이다.
                activeGroup={activeGroupOfRail}
                focus={groupFocus}
              />
            ) : (
              <div className={BOARD_GRID_CLASS}>{filtered.map(renderRow)}</div>
            )}
          </>
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
