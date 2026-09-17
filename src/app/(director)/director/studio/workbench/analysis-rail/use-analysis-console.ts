"use client";

// ============================================================================
// 시험 분석 레일 「콘솔」 상태 훅 — 스튜디오 셸 단독 소유(26-09-01, 정본 §3.10.28)
//
// 레일은 aside(<xl 에서도 CSS 숨김 유지 마운트)와 드로어(<xl 개방 시) 두 React
// 인스턴스로 동시 마운트된다 — use-analysis-detail 과 같은 이유로, 콘솔의 모든
// 지연 페치(학생 단건·원본 서명 URL·INTERNAL 문항 전문)와 확장 상태를 이 훅
// 하나에 모아 셸에서 1회 호출한다. 컴포넌트 로컬 effect 페치는 2중 발사된다.
//
// 페치 계약:
// · 학생 단건 캐시 — in-flight Promise 맵으로 중복 차단. 분석 변경 시 전체 clear.
// · 리포트 생성·일괄 작업 — use-analysis-bulk.ts(v4 분리). POST generate 는 동기
//   장기 실행(maxDuration 300)이라 in-flight 를 훅(셸 수명)에 둔다(V1-m4).
// · 원본 서명 URL·INTERNAL 문항 전문 — use-analysis-source.ts(500줄 상한 분리).
//   첫 섹션 펼침에만 발급(마운트가 곧 POST 인 기존 뷰어 관례를 셸로 승격 —
//   적대검수 M-1 2중 POST 봉쇄). 만료(30분) onError 재발급은 동시 1회 + 상한
//   2회(source-image-viewer 의 검증된 가드 이식).
//
// v4(26-09-02, docs/exam-analysis-v4-spec.md §2.5 U5 행) 추가 — 「다음 단계」
// CTA 가 레일 하위 섹션을 원격 조작해야 해서 섹션 로컬이던 토글 2개를 셸로
// 올렸다: reviewOpen(검수 에디터 펼침)·studentAddOpen(인라인 학생 추가 패널).
// focusStudent = students 탭 + 아코디언 펼침 + 단건 로드 + 스크롤 보정 요청.
//
// 자동 수렴 2채널(모달 닫힘 nonce 의 대체 — 적대검수 M-3/M6):
// · 선택 행 참조 교체(같은 id) = 요약 폴 freshness-sync 가 서명 변화를 감지했다
//   는 뜻 → detail 재조회 bump. keep-previous 라 백지 플래시 없음.
// · visibilitychange visible 전이(새 탭 검수·채점 후 복귀) → 5초 스로틀 bump.
//
// 폴링 0 — B-10 준수. GENERATING 종결은 요약 폴(reportCount 서명)→행 교체→
// 위 수렴 채널로 닿고, 레일 자신이 발사한 생성은 await 완료가 직접 재페치한다.
//
// 반환 객체는 useMemo(멤버 deps) — 적대검수 U5-correctness-1: 매 렌더 새 객체를
// 돌려주면 `[…, api]` 를 deps 로 둔 하위 effect 가 렌더마다 돌고, 실패→에러
// 상태→재렌더→재페치의 무한 루프가 된다(INTERNAL [전문] GET /questions 실측).
// ensureReviewQuestions 도 실패 시 잠금을 자동으로 풀지 않는다 — 자동 경로는
// 분석당 1회, 재시도는 [다시 시도] 가 force=true 로만 연다(use-analysis-source).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExamReportSummaryRow } from "@/hooks/use-exam-report-activity";
import type {
  ExamAnalysisDetail,
  ExamAnalysisStudentRow,
  ExamReviewPayload,
  ExamSourceFile,
  ExamStudentDetail,
} from "@/components/exam-report/ui-contracts";
import {
  useAnalysisBulk,
  type CopyShareTableResult,
  type EnableSharesResult,
  type GenerateBulkResult,
  type IssueLinksResult,
} from "./use-analysis-bulk";
import type { ExamDetail } from "@/components/exams/exam-detail-client-parts/types";
import { useAnalysisSource } from "./use-analysis-source";
import {
  useAnalysisRoster,
  type AnalysisRosterSlice,
  type RosterTarget,
} from "./use-analysis-roster";

/** 레일 탭 키 — 26-09-04 사용자 지시로 **3탭**(총평/학생/원본).
 *  구 "questions" 는 [총평] 안으로 합류, "meta" 는 폐기했다. 유니온을 좁혀 둔
 *  이유는 컴파일 게이트다 — 사라진 탭으로 setActiveTab 하는 코드가 남으면 즉시 실패. */
export type RailSectionKey = "synthesis" | "students" | "source";

/** 방금 발급한 답안 링크 1건(셸 보관 — 픽바·목록 공용). */
export interface IssuedAnswerLink {
  studentId: string;
  name: string;
  url: string;
}

export interface StudentDetailEntry {
  data: ExamStudentDetail | null;
  loading: boolean;
  error: boolean;
}

/** focusStudent 의 스크롤 보정 요청 — nonce 로 같은 학생 재요청도 전이로 감지.
 *  questionNumber(26-09-04): 정오표에서 **이 문항 타일을 자동 선택**하라는 요청 —
 *  「채점 확인이 필요한 문항으로 부드럽게 시선 이동」(사용자 지시)의 채널. */
export interface StudentFocusRequest {
  studentId: string;
  nonce: number;
  questionNumber?: string | null;
}

interface AnalysisConsoleBase {
  /** 활성 탭(26-09-02 상단 탭바 — 셸 공유로 aside·드로어 동기) */
  activeTab: RailSectionKey;
  setActiveTab: (key: RailSectionKey) => void;
  /** 학생 아코디언 — 동시 1명(세로 폭주 1차 방어선) */
  expandedStudentId: string | null;
  toggleStudent: (studentId: string) => void;
  /** v4 — students 탭 + 아코디언 펼침 + 단건 로드 + 스크롤 보정 요청.
   *  questionNumber 를 주면 정오표의 그 타일까지 자동 선택된다(26-09-04). */
  focusStudent: (studentId: string, questionNumber?: string | null) => void;
  focusRequest: StudentFocusRequest | null;
  /** v4 — 검수 인라인 에디터 펼침(RailReviewSection, 셸 소유) */
  reviewOpen: boolean;
  setReviewOpen: (open: boolean) => void;
  /** v4 — 인라인 학생 추가 패널(RailStudentSection, 셸 소유) */
  studentAddOpen: boolean;
  setStudentAddOpen: (open: boolean) => void;
  /** students 탭 + 추가 패널 열림(다음 단계 add-students CTA) */
  openStudentAdd: () => void;
  /**
   * v5(26-09-04) — [학생] 목록 **행 체크 선택**. 지문관리 픽바와 같은 모델:
   * 체크하면 하단 도크가 픽바로 바뀌고, 선택 안에서 가능한 액션만 버튼이 된다
   * (사용자 지시: "애초에 여기서 체크를 하면 버튼이 뜨도록 하면 되잖아").
   * 키는 **출처를 접두로 구분**한다 — `s:<examReportStudentId>`(이 시험에 등록된
   * 학생) / `r:<studentId>`(아직 답안이 없는 클래스 학생). 두 id 공간이 섞이면
   * 「없는 학생에게 리포트를 만들려는」 조용한 오작동이 된다.
   */
  pickedStudentKeys: ReadonlySet<string>;
  toggleStudentPick: (key: string) => void;
  setStudentPicks: (keys: string[]) => void;
  clearStudentPicks: () => void;
  /** students 탭 + 대상 일괄 체크(다음 단계 generate-reports CTA) */
  pickStudents: (keys: string[]) => void;
  /**
   * [학생] 목록 범위(26-09-05 사용자 지시: "기본적으로는 이 반의 학생이 보이고,
   * 전체 학생도 볼 수 있는 버튼이 있어야 할 것 같은데"). 기본 "class" —
   * 다른 반 학생은 접어 둔다. 셸이 드는 이유는 **탭 배지가 보이는 행 수와 같아야**
   * 하기 때문이다(배지 1 / 목록 3 의 재발 방지 — 26-09-05 지적).
   */
  studentScope: "class" | "all";
  setStudentScope: (scope: "class" | "all") => void;
  /** 방금 발급한 답안 링크 — 발급 즉시 그 학생이 「등록됨」으로 옮겨가 목록에서
   *  빠지므로, 링크를 화면에 남겨 두지 않으면 증발한다(26-09-04 사용자 지적).
   *  픽바(도크)와 목록 섹션이 **같은 목록**을 봐야 해서 셸이 든다. */
  issuedLinks: ReadonlyArray<IssuedAnswerLink>;
  pushIssuedLinks: (links: ReadonlyArray<IssuedAnswerLink>) => void;
  /** 행 아래 인라인 링크 패널의 [닫기] — 그 한 건만 지운다. */
  dismissIssuedLink: (studentId: string) => void;
  clearIssuedLinks: () => void;
  /** 학생 단건 캐시 */
  studentEntry: (studentId: string) => StudentDetailEntry;
  loadStudent: (studentId: string, force?: boolean) => void;
  patchStudent: (studentId: string, partial: Partial<ExamStudentDetail>) => void;
  /** detail.students 행 낙관 패치(공유 토글·답안 링크 뱃지 동기) */
  patchDetailStudent: (
    studentId: string,
    partial: Partial<ExamAnalysisStudentRow>,
  ) => void;
  /** 시험지 분석 리포트 공개 링크(detail.share*) 낙관 패치 — 학생 축과 별개(26-09-03). */
  patchDetailAnalysisShare: (
    partial: Pick<ExamAnalysisDetail, "shareToken" | "shareEnabled" | "sharedAt">,
  ) => void;
  /** 학생 삭제 후 청산 — detail 행 제거 + 캐시 제거 + 아코디언 접기 */
  onStudentDeleted: (studentId: string) => void;
  /** 리포트 생성(CREDIT_COSTS.EXAM_STUDENT_REPORT) — in-flight 셸 소유. 성공/실패 모두 재페치로 수렴. */
  generateReport: (studentId: string) => void;
  generatingIds: ReadonlySet<string>;
  /** v4 일괄(§2.5) — 순차 발급·부분 성공·「이름\t링크」 표 반환.
   *  names(id→이름)는 호출부가 detail.students 로 넘긴다(상세 재GET 0) — 없으면
   *  이름 칸은 빈 문자열(내부 id 를 학부모용 표에 싣지 않는다). */
  issueAnswerLinksBulk: (
    studentIds: string[],
    names?: ReadonlyMap<string, string>,
  ) => Promise<IssueLinksResult>;
  /** v4 일괄 — 동시 2 · 402 즉시 중단 */
  generateReportsBulk: (studentIds: string[]) => Promise<GenerateBulkResult>;
  enableSharesBulk: (
    studentIds: string[],
    names?: ReadonlyMap<string, string>,
  ) => Promise<EnableSharesResult>;
  /** 공유 켜진 전원의 「이름\t링크」 표 — 클립보드 복사 시도 후 { table, copied }
   *  (table "" = 0명). rows 를 주면 상세 재GET 없이 그 행으로 필터한다. */
  copyShareTable: (
    rows?: ReadonlyArray<ExamAnalysisStudentRow>,
  ) => Promise<CopyShareTableResult>;
  /** 시험지 원본 서명 URL(비INTERNAL) — 첫 펼침에 ensure, 만료 시 reissue */
  sourceUrls: string[];
  sourcePhase: "idle" | "loading" | "ready" | "error";
  ensureSourceUrls: (files: ExamSourceFile[]) => void;
  reissueSourceUrls: () => void;
  /** INTERNAL 문항 전문 — 첫 펼침에 ensure */
  reviewQuestions: ExamReviewPayload | null;
  reviewPhase: "idle" | "loading" | "ready" | "error";
  /** 분석당 1회 dedup. force=true([다시 시도])만 실패 잠금을 풀고 재요청한다. */
  ensureReviewQuestions: (force?: boolean) => void;
  /** INTERNAL [원본] 탭 — 스모트에서 **조판된 시험지**(26-09-03 사용자 지시).
   *  examId 당 1회 dedup, 실패 잠금 규약은 문항 전문과 동일. */
  examSheet: ExamDetail | null;
  examSheetPhase: "idle" | "loading" | "ready" | "error";
  ensureExamSheet: (examId: string, force?: boolean) => void;
  /** 상세 재조회 bump(수동 새로고침·변이 성공 수렴) — 셸 nonce 채널 그대로 */
  refreshDetail: () => void;
}

/** 콘솔 API = 위 표면 + 로스터 슬라이스(26-09-04, use-analysis-roster). */
export type AnalysisConsoleApi = AnalysisConsoleBase & AnalysisRosterSlice;

export function useAnalysisConsole(
  row: ExamReportSummaryRow | null,
  refreshDetail: () => void,
  patchDetail: (
    updater: (current: ExamAnalysisDetail) => ExamAnalysisDetail,
  ) => void,
  /** 후보(분석 행 없는 스모트 시험지) 선택 시의 examId — 로스터 스코프(§14). */
  candidateExamId: string | null = null,
): AnalysisConsoleApi {
  const analysisId = row?.id ?? null;

  const [activeTab, setActiveTab] = useState<RailSectionKey>("synthesis");
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(
    null,
  );
  const [focusRequest, setFocusRequest] = useState<StudentFocusRequest | null>(
    null,
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [studentAddOpen, setStudentAddOpen] = useState(false);
  const [studentScope, setStudentScope] = useState<"class" | "all">("class");
  const [pickedStudentKeys, setPickedStudentKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [issuedLinks, setIssuedLinks] = useState<ReadonlyArray<IssuedAnswerLink>>(
    [],
  );
  const [students, setStudents] = useState<Record<string, StudentDetailEntry>>(
    {},
  );

  const inFlightRef = useRef(new Map<string, Promise<void>>());
  // 캐시 미러 ref — 일괄 작업(클릭 시점)이 렌더 클로저 없이 최신 캐시를 읽는다.
  const studentsRef = useRef(students);
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);
  const lastRefreshAtRef = useRef(0);

  // ── 분석 변경 = 콘솔 전체 리셋 ──────────────────────────────────────────
  useEffect(() => {
    setActiveTab("synthesis");
    setExpandedStudentId(null);
    setFocusRequest(null);
    setReviewOpen(false);
    setStudentAddOpen(false);
    setStudentScope("class");
    setPickedStudentKeys(new Set<string>());
    setIssuedLinks([]);
    setStudents({});
    inFlightRef.current.clear();
  }, [analysisId]);

  const bumpRefresh = useCallback(() => {
    lastRefreshAtRef.current = Date.now();
    refreshDetail();
  }, [refreshDetail]);

  // ── 자동 수렴 ① 선택 행 참조 교체(같은 id — freshness-sync 서명 변화) ────
  const prevRowRef = useRef<ExamReportSummaryRow | null>(null);
  useEffect(() => {
    const prev = prevRowRef.current;
    prevRowRef.current = row;
    if (!row || !prev || prev.id !== row.id || prev === row) return;
    // ANALYZING 진행 틱은 상세 훅이 휴면이라 bump 무의미 — 종결 전이는 훅의
    // analyzing dep 이 스스로 재조회하므로 여기서도 스킵.
    if (row.status === "ANALYZING") return;
    // boost RUNNING 틱도 같은 이유로 스킵 — 판의 freshness 서명이 boost.completed
    // 를 품어 5초마다 행이 교체되는데, 그때마다 상세 전체를 재조회할 이유가 없다.
    // RUNNING→DONE 전이는 다음 교체(status 변화)에서 정상 bump 된다.
    if (row.funnel?.boost?.status === "RUNNING") return;
    bumpRefresh();
  }, [row, bumpRefresh]);

  // ── 자동 수렴 ② 새 탭 왕복 복귀(visibilitychange visible, 5s 스로틀) ─────
  useEffect(() => {
    if (!analysisId) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (prevRowRef.current?.status === "ANALYZING") return;
      if (Date.now() - lastRefreshAtRef.current < 5000) return;
      bumpRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [analysisId, bumpRefresh]);

  // ── 학생 단건 캐시 ──────────────────────────────────────────────────────
  const loadStudent = useCallback(
    (studentId: string, force = false) => {
      if (!force && inFlightRef.current.has(studentId)) return;
      const p = (async () => {
        setStudents((s) => ({
          ...s,
          [studentId]: {
            data: s[studentId]?.data ?? null,
            loading: true,
            error: false,
          },
        }));
        try {
          const res = await fetch(`/api/exam-report/students/${studentId}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { student?: ExamStudentDetail };
          setStudents((s) => ({
            ...s,
            [studentId]: {
              data: data.student ?? null,
              loading: false,
              error: !data.student,
            },
          }));
        } catch {
          setStudents((s) => ({
            ...s,
            [studentId]: {
              data: s[studentId]?.data ?? null,
              loading: false,
              // 기존 데이터가 있으면 스테일 유지(백지보다 낫다) — 없을 때만 에러.
              error: !s[studentId]?.data,
            },
          }));
        }
      })();
      inFlightRef.current.set(studentId, p);
      void p.finally(() => {
        if (inFlightRef.current.get(studentId) === p)
          inFlightRef.current.delete(studentId);
      });
    },
    [],
  );

  const studentEntry = useCallback(
    (studentId: string): StudentDetailEntry =>
      students[studentId] ?? { data: null, loading: false, error: false },
    [students],
  );

  const cachedStudent = useCallback(
    (studentId: string): ExamStudentDetail | null =>
      studentsRef.current[studentId]?.data ?? null,
    [],
  );

  const patchStudent = useCallback(
    (studentId: string, partial: Partial<ExamStudentDetail>) => {
      setStudents((s) => {
        const cur = s[studentId];
        if (!cur?.data) return s;
        return {
          ...s,
          [studentId]: { ...cur, data: { ...cur.data, ...partial } },
        };
      });
    },
    [],
  );

  const patchDetailStudent = useCallback(
    (studentId: string, partial: Partial<ExamAnalysisStudentRow>) => {
      patchDetail((d) => ({
        ...d,
        students: d.students.map((s) =>
          s.id === studentId ? { ...s, ...partial } : s,
        ),
      }));
    },
    [patchDetail],
  );

  const patchDetailAnalysisShare = useCallback(
    (
      partial: Pick<ExamAnalysisDetail, "shareToken" | "shareEnabled" | "sharedAt">,
    ) => {
      patchDetail((d) => ({ ...d, ...partial }));
    },
    [patchDetail],
  );

  const onStudentDeleted = useCallback(
    (studentId: string) => {
      patchDetail((d) => ({
        ...d,
        students: d.students.filter((s) => s.id !== studentId),
      }));
      setStudents((s) => {
        if (!(studentId in s)) return s;
        const next = { ...s };
        delete next[studentId];
        return next;
      });
      setExpandedStudentId((cur) => (cur === studentId ? null : cur));
    },
    [patchDetail],
  );

  const toggleStudent = useCallback(
    (studentId: string) => {
      setExpandedStudentId((cur) => {
        const next = cur === studentId ? null : studentId;
        if (next) loadStudent(studentId);
        return next;
      });
    },
    [loadStudent],
  );

  const focusStudent = useCallback(
    (studentId: string, questionNumber?: string | null) => {
      setActiveTab("students");
      setExpandedStudentId(studentId);
      loadStudent(studentId);
      setFocusRequest((cur) => ({
        studentId,
        nonce: (cur?.nonce ?? 0) + 1,
        questionNumber: questionNumber ?? null,
      }));
    },
    [loadStudent],
  );

  const openStudentAdd = useCallback(() => {
    setActiveTab("students");
    setStudentAddOpen(true);
  }, []);

  const toggleStudentPick = useCallback((key: string) => {
    setPickedStudentKeys((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const setStudentPicks = useCallback((keys: string[]) => {
    setPickedStudentKeys(new Set(keys));
  }, []);
  const clearStudentPicks = useCallback(() => {
    setPickedStudentKeys(new Set<string>());
  }, []);
  const pickStudents = useCallback((keys: string[]) => {
    setActiveTab("students");
    setPickedStudentKeys(new Set(keys));
  }, []);
  const pushIssuedLinks = useCallback(
    (links: ReadonlyArray<IssuedAnswerLink>) => {
      setIssuedLinks((prev) => [
        ...prev.filter((x) => !links.some((l) => l.studentId === x.studentId)),
        ...links,
      ]);
    },
    [],
  );
  const dismissIssuedLink = useCallback((studentId: string) => {
    setIssuedLinks((prev) => prev.filter((x) => x.studentId !== studentId));
  }, []);
  const clearIssuedLinks = useCallback(() => setIssuedLinks([]), []);

  // ── 리포트 생성·일괄 작업(v4 분리 모듈) ─────────────────────────────────
  const bulk = useAnalysisBulk({
    analysisId,
    patchStudent,
    patchDetailStudent,
    loadStudent,
    cachedStudent,
    refreshDetail: bumpRefresh,
  });

  // ── 원본 서명 URL·INTERNAL 문항 전문(지연 페치 — use-analysis-source.ts) ──
  const source = useAnalysisSource(analysisId);

  // ── 클래스 로스터(26-09-04 §10·§14) — [학생] 탭의 「미응시」 축 ────────────
  // 스코프는 분석 행 우선, 없으면 후보 시험지(examId). **안정 참조 필수** —
  // 매 렌더 새 객체를 넘기면 훅의 useCallback deps 가 매번 갈려 ensureRoster 가
  // 새 함수가 되고, 그걸 deps 로 둔 섹션 effect 가 렌더마다 재요청한다.
  const rosterTarget = useMemo<RosterTarget | null>(
    () =>
      analysisId
        ? { kind: "analysis", id: analysisId }
        : candidateExamId
          ? { kind: "exam", id: candidateExamId }
          : null,
    [analysisId, candidateExamId],
  );
  const roster = useAnalysisRoster(rosterTarget);

  // 안정 참조 — 멤버가 바뀔 때만 새 객체(헤더 주석 참조: prop 구동 effect 회귀 방어).
  return useMemo<AnalysisConsoleApi>(
    () => ({
      activeTab,
      setActiveTab,
      expandedStudentId,
      toggleStudent,
      focusStudent,
      focusRequest,
      reviewOpen,
      setReviewOpen,
      studentAddOpen,
      setStudentAddOpen,
      openStudentAdd,
      studentScope,
      setStudentScope,
      pickedStudentKeys,
      toggleStudentPick,
      setStudentPicks,
      clearStudentPicks,
      pickStudents,
      issuedLinks,
      pushIssuedLinks,
      dismissIssuedLink,
      clearIssuedLinks,
      studentEntry,
      loadStudent,
      patchStudent,
      patchDetailStudent,
      patchDetailAnalysisShare,
      onStudentDeleted,
      generateReport: bulk.generateReport,
      generatingIds: bulk.generatingIds,
      issueAnswerLinksBulk: bulk.issueAnswerLinksBulk,
      generateReportsBulk: bulk.generateReportsBulk,
      enableSharesBulk: bulk.enableSharesBulk,
      copyShareTable: bulk.copyShareTable,
      ...source,
      ...roster,
      refreshDetail: bumpRefresh,
    }),
    [
      activeTab,
      studentScope,
      expandedStudentId,
      toggleStudent,
      focusStudent,
      focusRequest,
      reviewOpen,
      studentAddOpen,
      openStudentAdd,
      pickedStudentKeys,
      toggleStudentPick,
      setStudentPicks,
      clearStudentPicks,
      pickStudents,
      issuedLinks,
      pushIssuedLinks,
      dismissIssuedLink,
      clearIssuedLinks,
      studentEntry,
      loadStudent,
      patchStudent,
      patchDetailStudent,
      patchDetailAnalysisShare,
      onStudentDeleted,
      bulk.generateReport,
      bulk.generatingIds,
      bulk.issueAnswerLinksBulk,
      bulk.generateReportsBulk,
      bulk.enableSharesBulk,
      bulk.copyShareTable,
      source,
      roster,
      bumpRefresh,
    ],
  );
}
