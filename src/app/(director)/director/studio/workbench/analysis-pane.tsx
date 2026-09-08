"use client";

// ============================================================================
// 클래스 스튜디오 — 「시험 분석」 뷰 v4 (26-09-01 v1 → 26-09-02 v4)
// 정본: docs/exam-analysis-v4-spec.md §3 U4 · §2.5 U4 행
//       (선행: docs/studio-exam-analysis-integration.md §3-2b 미니멀 파이프라인)
//
// v1 = 출하 사다리 S2(뷰 골격): 인테이크(접이) + 분석 보드. 카드 클릭은 **우측
// 레일 상세**(셸 소유 — analysis-detail-rail). exam-report 라우트·서버·검수
// 게이트·과금은 전량 재사용 — 허브의 카드 골격을 스튜디오 중앙 열에 이식.
//
// v4 = 「왜 백지인가」 수리(스펙 §0): 왼쪽 목록을 「자체 시험지」/「외부 시험지」
// 2그룹으로 나누고, 아직 분석 행이 없는 자체 시험지를 **후보 카드**로 같이 보여
// 준다(`includeCandidates`). 카드 힌트 줄은 순수 함수 deriveExamNextStep 의
// title — 레일 「다음 단계」 블록과 **같은 함수**라 계기판과 버튼이 어긋날 수 없다.
// 선택은 행/후보 배타(§2.5): 한쪽을 고르면 다른 쪽 null 을 업링크한다.
//
// 재사용 금지 확인(설계 §3-4): HubClient 직마운트 금지(-m-6 페이지 셸·이탈구
// 없음) — 여기는 IntakeUploadPanel·AnalysesBoard 등 **임베드 계약을 가진 부품**
// 만 조립한다.
//
// 폴러: useExamReportActivity 는 `enabled: active` 게이트 — 이 판은 hidden 유지
// 마운트(업로드 진행 보존)라, 게이트 없이는 다른 뷰에서도 5s/30s 폴이 돈다
// (「신규 폴링은 뷰 가시일 때만」 규칙 위반). 뷰 복귀 시 effect 재기동 = 즉시
// 재조회라 스테일도 없다.
//
// 낙관 행 + START_COERCE 는 허브 사본이다(hub-client.tsx 동일 관용구) — 공유
// 훅으로 승격하지 않은 이유: 허브 셸은 접힘 쿠키·페이지 스크롤 등 페이지 문맥과
// 얽혀 있어 지금 뜯으면 회귀 표면이 더 크다. 두 표면이 각자 낙관 행을 갖는 순간
// 불일치는 B7 함정 문서로 수용(두 탭 동시 운용 시 수 초 내 폴이 수렴).
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ChevronUp, FileBarChart, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskQueue } from "@/components/workbench/task-queue";
import {
  useExamReportActivity,
  type ExamCandidateRow,
  type ExamReportSummaryRow,
} from "@/hooks/use-exam-report-activity";
import {
  defaultExamMeta,
  type ExamMetaValue,
} from "@/components/exam-report/hub/exam-meta-form";
import {
  IntakeUploadPanel,
  type ResumeDraftTarget,
} from "@/components/exam-report/hub/intake-upload-panel";
import { AnalysesBoard } from "@/components/exam-report/hub/analyses-board";
import { ensureInternalAnalysisForExam } from "@/actions/exam-report";
import { StudioAnalysisDock } from "./analysis-dock";
import type { GroupFocusRequest } from "@/components/exam-report/hub/analyses-board-groups";
import {
  buildOptimisticRow,
  freshnessSignature,
  renderCandidateNextStepHint,
  renderNextStepHint,
} from "./analysis-pane-shared";

// 카드 클릭·학생 딥링크의 정본 경로. 스튜디오는 (director) 전용이라(제약 T7 —
// teacher 에 스튜디오 없음) resolveExamReportBase(pathname) 폴백과 동일 값을
// 상수로 못 박는다(스튜디오 pathname 엔 마커가 없어 어차피 이 폴백이다).
const WORKSPACE_BASE = "/director/workbench/exam-report";

// 방금 시작한 분석이 서버에서 ANALYZING 으로 뒤집히기 전의 짧은 DRAFT 구간을
// "분석 중"으로 보정하는 유예(ms) — hub-client.tsx START_COERCE_MS 사본.
const START_COERCE_MS = 90_000;

export interface StudioAnalysisPaneProps {
  /** view === "analysis" 가시 여부 — 폴 게이트. */
  active: boolean;
  /**
   * 카드 선택 업링크(26-09-01 개정) — 카드 클릭은 모달이 아니라 **우측 레일
   * 상세**다(사용자 지시). 선택·모달·레일은 전부 셸 소유(§3.10.28) — 이 판은
   * 목록과 인테이크만 든다. null = 선택 해제(삭제·소실 동기화).
   */
  onSelect?: (row: ExamReportSummaryRow | null) => void;
  /** 셸이 들고 있는 선택 분석 id — 카드 하이라이트 + 신선도 동기 기준. */
  activeRowId?: string | null;
  /**
   * v4 후보 선택 업링크(§2.5 U4) — 분석 행이 없는 자체 시험지 카드 클릭. 행 선택과
   * 배타: 후보를 고르면 onSelect(null), 행을 고르면 onSelectCandidate(null).
   */
  onSelectCandidate?: (candidate: ExamCandidateRow | null) => void;
  /** 셸이 들고 있는 선택 후보 examId — 후보 카드 하이라이트 + 승격 동기 기준. */
  activeCandidateId?: string | null;
  /**
   * 학생 관리 → 시험 분석 건너뛰기(§2.5 U6 analysisFocus): 셸이 넘긴 분석 id 를
   * boardRows 에서 찾아 onSelect(row) 한 뒤 onFocusConsumed() 로 소비를 알린다.
   * 목록에 없으면 refresh() 로 재조회하고, 포커스 이후의 응답에도 없을 때만
   * 「찾을 수 없음」 토스트와 함께 소비한다(조용한 무동작 금지 — 본문 주석).
   */
  focusAnalysisId?: string | null;
  onFocusConsumed?: () => void;
  /**
   * 작업 중인 클래스 id(감독 배선, 26-09-02) — 미분석 자체 시험지 후보를 「이
   * 클래스 시험지」(classId 일치) 우선 + 나머지(타 클래스·미분류) 접이로 나누는
   * 축. 후보 30장이 목록 벽을 만든 실측(probe-v4 1차)의 대응. null = 구분 없음.
   */
  classId?: string | null;
}

export function StudioAnalysisPane({
  active,
  onSelect,
  activeRowId = null,
  onSelectCandidate,
  activeCandidateId = null,
  focusAnalysisId = null,
  onFocusConsumed,
  classId = null,
}: StudioAnalysisPaneProps) {
  // 판 루트 ref. 26-09-03 개편으로 **스크롤 소유는 목록(AnalysesBoard scrollBody)**
  // 으로 넘어갔다 — 판은 도크를 바닥에 붙잡아 두는 flex 열이다.
  const paneRef = useRef<HTMLDivElement | null>(null);
  // 하단 도크의 「선택하세요」 글로우 탐색 루트(목록 박스).
  const boardBoxRef = useRef<HTMLDivElement | null>(null);

  const [meta, setMeta] = useState<ExamMetaValue>(defaultExamMeta);
  const [resumeDraft, setResumeDraft] = useState<ResumeDraftTarget | null>(null);
  // 인테이크는 접힘 기본(§3-2b — 이 화면의 본체는 목록·매트릭스다. 허브와 반대
  // 기본값인 이유: 허브는 등록이 주행동, 스튜디오 분석 뷰는 진행 확인이 주행동).
  const [intakeOpen, setIntakeOpen] = useState(false);

  // v4: 후보(미분석 자체 시험지)를 같이 받는다 — 응답 1회로 두 그룹 재료 전부.
  const { analyses, candidates, loading, error, refresh } =
    useExamReportActivity({ enabled: active, includeCandidates: true });
  // (director) 레이아웃 Provider 아래라 안전(제약 실측 — 스튜디오도 같은 그룹).
  const { triggerRefresh } = useTaskQueue();

  // 낙관 행 + 시작 시각(짧은 DRAFT 구간 보정용) — 허브 관용구 사본.
  const [optimisticRows, setOptimisticRows] = useState<ExamReportSummaryRow[]>(
    [],
  );
  const startedAtRef = useRef<Map<string, number>>(new Map());

  // 보드 그룹 탭 명시 포커스(26-09-03 반반 탭) — 등록 완료가 유일한 발신처다.
  // token = 그 분석 id 라 연속 등록도 각각 발동한다(같은 그룹이어도).
  const [boardGroupFocus, setBoardGroupFocus] =
    useState<GroupFocusRequest | null>(null);

  useEffect(() => {
    if (optimisticRows.length === 0) return;
    const ids = new Set(analyses.map((r) => r.id));
    if (optimisticRows.some((o) => ids.has(o.id))) {
      setOptimisticRows((prev) => prev.filter((o) => !ids.has(o.id)));
    }
  }, [analyses, optimisticRows]);

  const boardRows = useMemo(() => {
    const now = Date.now();
    const started = startedAtRef.current;
    const coerced = analyses.map((r) => {
      const startedAt = started.get(r.id);
      if (
        startedAt !== undefined &&
        r.status === "DRAFT" &&
        now - startedAt < START_COERCE_MS
      ) {
        return { ...r, status: "ANALYZING" as const };
      }
      return r;
    });
    const ids = new Set(analyses.map((r) => r.id));
    return [...optimisticRows.filter((o) => !ids.has(o.id)), ...coerced];
  }, [analyses, optimisticRows]);

  // 하단 도크 대상 — 선택된 행/후보(배타). 셸이 든 id 를 이 판의 최신 목록으로
  // 되찾는다: 셸의 스냅숏은 클릭 시점이라 상태가 낡을 수 있고, 도크의 kind 판정은
  // 최신 status·funnel 이 있어야 맞는다(레일의 신선도 동기와 같은 이유).
  const selectedBoardRow = useMemo(
    () => (activeRowId ? boardRows.find((r) => r.id === activeRowId) ?? null : null),
    [activeRowId, boardRows],
  );
  const selectedCandidate = useMemo(
    () =>
      activeCandidateId
        ? candidates.find((c) => c.examId === activeCandidateId) ?? null
        : null,
    [activeCandidateId, candidates],
  );

  // 인테이크 성공 — 낙관 행 프리펜드 + 리셋 + 폴·작업 큐 갱신(허브 미러) +
  // 인테이크 접기(목록이 본체인 이 뷰에서는 방금 시작한 카드가 주인공이다).
  const handleStarted = useCallback(
    (analysisId: string, info: { hasStudent: boolean }) => {
      startedAtRef.current.set(analysisId, Date.now());
      setOptimisticRows((prev) => [
        buildOptimisticRow(analysisId, meta, info.hasStudent),
        ...prev.filter((r) => r.id !== analysisId),
      ]);
      // 반반 탭(26-09-03): 방금 등록한 것은 **외부 시험지**다 — 보드가 스모트
      // 탭에 서 있으면 낙관 행이 안 보이는 탭에 프리펜드돼 「등록했는데 아무
      // 일도 안 일어났다」가 된다. 레일 선택으로 대신하지 않는 이유: 서버에
      // 행이 생기기 전이라 상세 페치가 404 로 떨어진다(레일 에러 상태).
      setBoardGroupFocus({ group: "external", token: analysisId });
      setResumeDraft(null);
      setMeta(defaultExamMeta());
      setIntakeOpen(false);
      refresh();
      // 잡 행 생성 타이밍 흡수 — 즉시 + 지연 재호출(허브·생성 페이지 패턴 미러).
      triggerRefresh();
      window.setTimeout(triggerRefresh, 750);
      window.setTimeout(triggerRefresh, 2_000);
    },
    [meta, refresh, triggerRefresh],
  );

  // 고아 DRAFT 이어서 등록 — 인테이크 펼침 + DRAFT 주입 + 메타 프리필(허브
  // handleResumeDraft 미러 — 프리필 결함수리 이력 포함, hub-client 주석 참조).
  const handleResumeDraft = useCallback((row: ExamReportSummaryRow) => {
    setIntakeOpen(true);
    setResumeDraft({ id: row.id, title: row.title });
    setMeta({
      ...defaultExamMeta(),
      title: row.title,
      schoolName: row.schoolName ?? "",
      grade: row.grade ?? "",
      examType: row.examType,
    });
    // 구 `scrollRef.scrollTo({top:0})` 는 26-09-03 구조 개편으로 삭제됐다 —
    // 판 자체가 더는 스크롤러가 아니고(목록이 내부 스크롤), 등록 모드는 판
    // 상단부터 그려지므로 되감을 스크롤이 없다.
  }, []);

  // 카드 클릭 = 레일 선택(셸 업링크). 행/후보 배타(§2.5) — 행을 고르면 후보
  // 선택을 비운다. 구 확대 아이콘·학생 추가 인터셉트는 콘솔 대개편(26-09-01)으로
  // 모달 채널 자체가 소멸해 삭제됐다.
  const handleOpenRow = useCallback(
    (row: ExamReportSummaryRow) => {
      onSelectCandidate?.(null);
      onSelect?.(row);
    },
    [onSelect, onSelectCandidate],
  );
  // ── 후보 열람 = 무과금 승격(26-09-04 사용자 지시) ─────────────────────────
  // 원문: "시험지를 클릭하는 순간 그 복사 작업을 돌리면 된다. 공짜니까 물어볼
  // 것도 없다." — 「분석 전」(후보)과 「심층 분석 전」(SHALLOW)은 ExamAnalysis 행
  // 유무 **하나로만** 갈린 상태였고, 그 행을 만드는 일은 출제할 때 저장한 해설을
  // 옮겨 적는 AI 0콜·크레딧 0 작업(syncInternalAnalysisForExam)이다. 종전엔 그
  // 복사가 답안 링크 발급·**유료** 심층 분석·학생 제출 채점 3곳에서만 돌아서
  // 「그냥 열어 보기」 경로가 없었다 — 그래서 오른쪽이 2탭 후보 화면이었다.
  //
  // 발사는 fire-and-forget 이고 **실패는 무음**이다: 실패해도 후보 화면이 그대로
  // 뜨므로 무회귀이고(사용자의 행동 「카드 열기」는 이미 성공했다), 카드 클릭마다
  // 토스트를 띄우면 그게 더 소음이다. 대신 잠금을 풀어 재클릭으로 재시도된다.
  // null 응답(보관함·국어·문항 0 = 후보 목록 규칙과 같은 강등 조건)은 정상 —
  // 그 시험지는 후보 화면이 정답이라 새로고침도 하지 않는다.
  const promotedRef = useRef(new Set<string>());
  const promoteCandidate = useCallback(
    (examId: string) => {
      if (promotedRef.current.has(examId)) return;
      promotedRef.current.add(examId);
      void ensureInternalAnalysisForExam(examId)
        .then((res) => {
          if (res) refresh();
        })
        .catch(() => {
          promotedRef.current.delete(examId);
        });
    },
    [refresh],
  );
  const handleOpenCandidate = useCallback(
    (candidate: ExamCandidateRow) => {
      onSelect?.(null);
      onSelectCandidate?.(candidate);
      promoteCandidate(candidate.examId);
    },
    [onSelect, onSelectCandidate, promoteCandidate],
  );

  // 선택 분석 신선도 동기 — 셸의 선택 행은 클릭 시점 스냅숏이라, 폴이 내려준
  // 최신 행(상태 전이·진행률·집계·퍼널)이 있으면 다시 올린다. 서명 비교로 5초 폴
  // 틱마다의 무의미한 셸 리렌더를 차단하고, 행이 사라졌으면(삭제) 선택을 푼다.
  const lastSyncSigRef = useRef<string>("");
  useEffect(() => {
    if (!activeRowId || !onSelect) return;
    const fresh = boardRows.find((r) => r.id === activeRowId);
    if (!fresh) {
      lastSyncSigRef.current = "";
      onSelect(null);
      return;
    }
    const sig = freshnessSignature(fresh);
    if (sig === lastSyncSigRef.current) return;
    lastSyncSigRef.current = sig;
    onSelect(fresh);
  }, [boardRows, activeRowId, onSelect]);

  // 선택 후보 승격 동기(v4) — 레일에서 [AI 분석 시작]을 누르면 서버가 INTERNAL
  // 분석 행을 만들고 후보는 목록에서 사라진다. 같은 응답에서 후보 소실 + 행
  // 출현(sourceExamId 일치)을 보면 선택을 그 행으로 옮긴다(레일이 후보 화면에서
  // 진행 화면으로 이어진다). 행도 없이 사라졌으면(시험지 삭제) 선택 해제 —
  // 행 삭제 동기와 같은 규약. 첫 응답 전(loading)엔 판단하지 않는다.
  useEffect(() => {
    if (!activeCandidateId || loading) return;
    if (candidates.some((c) => c.examId === activeCandidateId)) return;
    const promoted = boardRows.find(
      (r) => r.sourceType === "INTERNAL" && r.sourceExamId === activeCandidateId,
    );
    onSelectCandidate?.(null);
    if (promoted) onSelect?.(promoted);
  }, [
    activeCandidateId,
    candidates,
    boardRows,
    loading,
    onSelect,
    onSelectCandidate,
  ]);

  // 응답 도착 순번 — 훅은 매 성공 응답마다 새 배열로 setAnalyses 하므로 analyses
  // 참조 전이 = 응답 1회. 렌더 중 상태 보정 패턴(React 공식 「adjusting state
  // during render」)이라 같은 커밋 안에서 동기적으로 올라간다 — effect 로 올리면
  // 포커스 도착과 응답이 한 커밋에 겹칠 때 seqAtFocus 가 그 응답을 「이전」으로
  // 오인해 refresh 결과를 기다리지 않고 토스트를 쏜다. 훅의 `loading` 은 첫 응답
  // 기준 1회성이라 재활성화·재조회 판정에 쓸 수 없다(use-exam-report-activity
  // :161-200 — loadedRef 이후 loading 은 다시 true 가 되지 않는다).
  const [responseTrack, setResponseTrack] = useState({ analyses, seq: 0 });
  if (responseTrack.analyses !== analyses) {
    setResponseTrack({ analyses, seq: responseTrack.seq + 1 });
  }
  const responseSeq = responseTrack.seq;

  // 학생 관리 → 시험 분석 건너뛰기(§2.5): 행이 목록에 있으면 즉시 선택 후 소비.
  // 없으면 먼저 refresh() 로 재조회하고(목록은 take 50 학원 전역 창이라 최근 폴
  // 이후 생성된 분석·상위 50 밖 분석은 창에 없을 수 있다), **포커스 요청보다
  // 새로운 응답**(responseSeq > seqAtFocus)이 와도 없을 때만 「찾을 수 없음」
  // 토스트와 함께 소비한다 — 조용한 무동작(뷰 전환 + 빈 레일) 금지. 같은 id 는
  // 1회만 처리(셸이 소비 통지를 반영하기 전 폴 틱마다 재선택해 사용자 클릭을
  // 덮어쓰지 않도록), 새 id 가 오면 다시 동작한다.
  const focusTrackRef = useRef<{
    id: string;
    seqAtFocus: number;
    consumed: boolean;
  } | null>(null);
  useEffect(() => {
    if (!focusAnalysisId) {
      focusTrackRef.current = null;
      return;
    }
    let track = focusTrackRef.current;
    if (!track || track.id !== focusAnalysisId) {
      track = { id: focusAnalysisId, seqAtFocus: responseSeq, consumed: false };
      focusTrackRef.current = track;
      refresh();
    }
    if (track.consumed) return;
    const target = boardRows.find((r) => r.id === focusAnalysisId);
    if (target) {
      track.consumed = true;
      onSelectCandidate?.(null);
      onSelect?.(target);
      onFocusConsumed?.();
      return;
    }
    if (responseSeq > track.seqAtFocus) {
      track.consumed = true;
      toast.error(
        "이 분석을 최근 목록에서 찾을 수 없습니다. 시험 분석 허브에서 열어 주세요.",
      );
      onFocusConsumed?.();
    }
  }, [
    focusAnalysisId,
    boardRows,
    responseSeq,
    refresh,
    onSelect,
    onSelectCandidate,
    onFocusConsumed,
  ]);

  return (
    <div
      ref={paneRef}
      data-studio-analysis-pane
      // 배타 레이아웃(26-09-01 사용자 지시 "새로 분석할 때 분석 현황 필요 없다"):
      // 등록 중 = 인테이크가 판 전체(overflow-hidden + flex-1 프레임), 평시 =
      // 보드 목록 스크롤. 두 섹션은 display 토글 유지 마운트 — 등록 도중 목록을
      // 오가도 업로드 슬롯·메타 입력이 살아남는다.
      // 26-09-07: 지문관리처럼 패널 전체를 사용한다. 바깥 p-3 + 둥근 테두리는
      // 툴바·목록·도크를 모두 13px씩 밀던 중복 프레임이었다. 경계는 셸의
      // 패널 구분선과 툴바·도크의 가로 구분선이 맡는다.
      // 26-09-03: 판은 **두 모드 모두 스크롤하지 않는다**. 목록 모드에서는
      // AnalysesBoard(scrollBody)가 본문만 굴리고, 판 바닥에는 「분석 시작」
      // 도크가 shrink-0 형제로 붙는다 — 지문관리와 같은 골격이다.
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white"
    >
      {/* ── 패널 본문 — 지문관리와 같은 툴바·목록·도크 정렬 ─────────────────
          큰 헤더(WorkflowPageTitle·BETA·설명문)는 폐기 — 지문관리 목록 카드의
          컴팩트 툴바 행(아이콘 칩 h-6 · 브레드크럼 12px · ml-auto 아이콘 클러스터
          + 프라이머리 버튼) 규격을 그대로 탄다. 보드 모드 툴바는 AnalysesBoard
          compactToolbar 가 그리고, 등록 모드 툴바는 아래 형제 행이 같은 규격으로
          그린다(표시 display 토글 — 업로드·메타 유지 마운트). */}
      <section
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white"
      >
        {/* 등록 모드 툴바 — 지문관리 행과 동일 규격(px-5 pt-3 pb-1.5) */}
        <div
          className={cn(
            intakeOpen
              ? "flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-5 pt-3 pb-1.5"
              : "hidden",
          )}
        >
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <FileBarChart className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-medium text-slate-400">시험 분석 ·</span>
              <span className="text-[12px] font-bold text-slate-900">시험지 등록</span>
            </div>
          </div>
          {/* 복귀 — 지문관리 「펼치기」 토글과 동일 고스트 문법 */}
          <button
            type="button"
            onClick={() => setIntakeOpen(false)}
            aria-expanded
            data-studio-analysis-intake-toggle
            className="ml-auto inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
          >
            <ChevronUp className="size-3.5" aria-hidden="true" />
            <span>분석 현황으로</span>
          </button>
        </div>

        {/* 등록 본문 — 프레임이 카드 잔여 높이 전체(유지 마운트) */}
        <div
          className={cn(
            intakeOpen
              ? "flex min-h-0 flex-1 flex-col px-4 pb-4 pt-1.5"
              : "hidden",
          )}
        >
          <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-md border border-slate-200">
            <IntakeUploadPanel
              meta={meta}
              onMetaChange={setMeta}
              resumeDraft={resumeDraft}
              onCancelResume={() => setResumeDraft(null)}
              onStarted={handleStarted}
            />
          </div>
        </div>

        {/* 보드 모드 — 컴팩트 툴바(브레드크럼 + 필터·검색 + [+ 시험지 등록]).
            data-studio-analysis-board: 프로브 계약 셀렉터(라벨 매칭 금지 원칙 —
            h2 검사는 툴바 통일로 공허해졌던 실측 전례). */}
        <div
          ref={boardBoxRef}
          data-studio-analysis-board
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col",
            intakeOpen ? "hidden" : "flex",
          )}
        >
          <AnalysesBoard
            compactToolbar
            header={
              <div className="flex shrink-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <FileBarChart className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 truncate text-[12px] font-medium text-slate-400">
                    시험 분석 ·
                  </span>
                  <span className="shrink-0 truncate text-[12px] font-bold text-slate-900">
                    분석 현황
                  </span>
                </div>
              </div>
            }
            toolbarAction={
              <button
                type="button"
                onClick={() => setIntakeOpen(true)}
                aria-expanded={false}
                data-studio-analysis-intake-toggle
                title="시험지 등록 — 사진·PDF를 올려 분석을 시작합니다"
                aria-label="시험지 등록 — 사진·PDF를 올려 분석을 시작합니다"
                className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md bg-blue-600 px-2.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                시험지 등록
              </button>
            }
            rows={boardRows}
            loading={loading}
            error={error}
            workspaceBase={WORKSPACE_BASE}
            onRefresh={refresh}
            onResumeDraft={handleResumeDraft}
            onOpenRow={handleOpenRow}
            hideThumbnails
            hideCardActions
            activeRowId={activeRowId}
            emptyHint="시험지 생성에서 만든 스모트 시험지는 여기에 자동으로 나타납니다. 외부 시험지는 [시험지 등록]으로 사진·PDF를 올려 분석을 시작해 보세요."
            // v4(§3 U4): 2그룹 + 후보 카드 + 힌트 줄 + 깊이 칩·심층 글로우.
            // 26-09-03: 두 그룹은 반반 탭 — 등록 완료는 groupFocus 로 외부 탭 이동.
            groupBySource
            groupFocus={boardGroupFocus}
            currentClassId={classId}
            showFunnel
            candidates={candidates}
            onOpenCandidate={handleOpenCandidate}
            activeCandidateId={activeCandidateId}
            renderHint={renderNextStepHint}
            renderCandidateHint={renderCandidateNextStepHint}
            // 목록만 내부 스크롤 — 아래 도크를 바닥에 고정하기 위한 전제.
            scrollBody
          />
          {/* 하단 도크 「분석 시작」(26-09-03 사용자 지시) — 지문관리 CTA 바의
              자리·토큰을 그대로 승계한다. 대상 = 지금 선택된 행/후보. */}
          <StudioAnalysisDock
            row={selectedBoardRow}
            candidate={selectedCandidate}
            boardRef={boardBoxRef}
          />
        </div>
      </section>
    </div>
  );
}
