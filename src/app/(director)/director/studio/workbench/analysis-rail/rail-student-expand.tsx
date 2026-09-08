"use client";

// ============================================================================
// 레일 S3 학생 아코디언 본문 — 「이 페이지 안에서 전부 처리」(26-09-01 사용자 지시).
//
// 데이터: 셸 콘솔 캐시의 학생 단건 GET(responses·scoreSummary·report·
// submissionMeta·shareToken 전량 — 페치는 셸 소유, 여기는 표시+액션만).
// · 정오 타일: VerdictBoard 7열 표는 296px 부적합(편집 계약 과잉) — STATUS_STYLE
//   단일 소스만 승계해 auto-fit 타일로 재조판. 타일 2층(번호 truncate / 기호+점수)
//   — "서답형 3" 류 다글자 번호 방어(적대검수 V2-M4). 탭하면 하단 1줄 상세.
// · 리포트: 생성·재생성 전부 RailConfirmButton 2단(모달 0). 단가 표기는
//   NEXT_STEP_COSTS.reportPerStudent(=CREDIT_COSTS, §1-9) + formatCredits 만 —
//   숫자 하드코딩 금지. 서버 게이트(gradingConfirmed + ANALYZED) 미러 — 미확정이면
//   위 정오 타일 편집기에서 채점을 끝내라는 안내만(새 탭 위임 없음, 탈출구 0).
//   인라인 보기 = ReportDocument mode="view" + suppressPrintStyles(@page 이중
//   선언 차단 — V1-m2) + max-h 래퍼 overscroll-contain(스크롤 트랩 방어 V2-m5).
// · 공유 끄기는 토큰 회수(rotate — 학부모에게 보낸 링크 영구 사망)라 2단 확인
//   (적대검수 M-2). 답안 링크 끄기도 동일 + 성공 후 강제 재페치(disable 가
//   version 을 올려 이후 CAS 스퓨리어스 충돌 — R1 §3 함정).
// · INTERNAL: 답안 링크 비노출(브리지 응답과 충돌 축), "자동 채점" 출처 표기,
//   submissionMeta(응시·마감·과제) 헤더.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { FileBarChart, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import type {
  ExamAnalysisStudentRow,
  ExamStudentDetail,
} from "@/components/exam-report/ui-contracts";
import type { ExamMap, StudentResponse } from "@/lib/exam-report/types";
import { round2 } from "@/lib/exam-report/grading";
import { ReportDocument } from "@/components/exam-report/report/report-document";
import {
  disableExamReportShare,
  enableExamReportShare,
  updateStudentGrading,
} from "@/actions/exam-report";
import { RailConfirmButton } from "./rail-confirm-button";
import { RailAnswerSheet } from "./rail-answer-sheet";
import { RailStudentLinks } from "./rail-student-links";
import { NEXT_STEP_COSTS, formatCredits } from "./rail-next-step";
import type { AnalysisConsoleApi } from "./use-analysis-console";

/** 리포트 1명 단가 표기 — 유일 출처 CREDIT_COSTS(NEXT_STEP_COSTS 경유). */
const REPORT_COST_LABEL = formatCredits(NEXT_STEP_COSTS.reportPerStudent);

const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "배정됨",
  IN_PROGRESS: "응시 중",
  SUBMITTED: "제출됨",
  GRADED: "채점 완료",
};

/** 제출 일시 칩 자구 — 「9.5 10:12」(연도는 같은 해가 대부분이라 뺀다). */
function fmtSubmitted(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}


export function RailStudentExpand({
  analysisId,
  analysisStatus,
  studentRow,
  isInternal,
  examMap,
  console: api,
}: {
  analysisId: string;
  analysisStatus: string;
  studentRow: ExamAnalysisStudentRow;
  isInternal: boolean;
  examMap: ExamMap | null;
  console: AnalysisConsoleApi;
}) {
  const entry = api.studentEntry(studentRow.id);
  const st: ExamStudentDetail | null = entry.data;
  const generating = api.generatingIds.has(studentRow.id);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  // 채점 초안 버퍼 — 서버 저장/재페치(version 변화)가 오면 폐기(서버 권위).
  const [draft, setDraft] = useState<StudentResponse[] | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  useEffect(() => {
    setDraft(null);
  }, [entry.data?.version, studentRow.id]);
  // 응답이 비어 있으면(미채점 신규) examMap 으로 시드 — 레일에서 첫 채점 가능.
  const baseResponses = useMemo<StudentResponse[]>(() => {
    const data = entry.data;
    if (!data) return [];
    if (data.responses.length > 0) return data.responses;
    if (!examMap) return [];
    return examMap.questions.map((q) => ({
      number: q.number,
      status: "UNKNOWN" as const,
      source: "MANUAL" as const,
      reviewed: false,
    }));
  }, [entry.data, examMap]);

  // INTERNAL 문항 원문(정답·모범답안 폴백) — 미채점이 남아 있을 때만 당긴다.
  // 페치 자체는 셸 소유(분석당 1회 dedup) — 여기서는 필요 시점만 알린다.
  // **훅은 조기 반환 위**(rules-of-hooks): 로딩/에러 분기 아래에 두면 첫 로드
  // 렌더에서만 훅 개수가 달라져 전체 훅 순서가 깨진다.
  const { ensureReviewQuestions } = api;
  const needAnswers =
    isInternal &&
    entry.data != null &&
    entry.data.reportStatus !== "GENERATING" &&
    baseResponses.some((r) => r.status === "UNKNOWN");
  useEffect(() => {
    if (needAnswers) ensureReviewQuestions();
  }, [needAnswers, ensureReviewQuestions]);

  // ── 로딩/에러(첫 로드) — 높이 고정 스켈레톤(펼침 점프 최소화, V2-m1) ──────
  if (!st) {
    if (entry.loading) {
      return (
        <div className="flex min-h-[140px] items-center justify-center rounded-md border border-slate-100 bg-slate-50 text-slate-400">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </div>
      );
    }
    return (
      <div className="flex min-h-[80px] flex-col items-center justify-center gap-1.5 rounded-md border border-rose-100 bg-rose-50 px-3 py-3">
        <p className="break-keep text-center text-[12px] leading-relaxed text-rose-600">
          학생 정보를 불러오지 못했어요
        </p>
        <button
          type="button"
          onClick={() => api.loadStudent(studentRow.id, true)}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-rose-200 bg-white px-2.5 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-100"
        >
          <RotateCw className="size-3 shrink-0" aria-hidden="true" />
          다시 시도
        </button>
      </div>
    );
  }

  const reportStatus = generating ? "GENERATING" : st.reportStatus;
  const score = st.scoreSummary;
  const gradedCount =
    (score?.correctCount ?? 0) +
    (score?.wrongCount ?? 0) +
    (score?.partialCount ?? 0);
  const canGenerate = st.gradingConfirmed && analysisStatus === "ANALYZED";
  const shareEnabled = st.shareEnabled;
  // 인라인 채점 — INTERNAL 은 브리지 자동 채점이 정본(수동 편집 금지),
  // 리포트 생성 중엔 서버가 저장을 거부하므로 편집 잠금.
  const responses = draft ?? baseResponses;
  const dirty = draft != null;
  // 【26-09-04 근본 수리】 INTERNAL 도 편집 가능하다. 종전 `!isInternal` 잠금은
  // **막다른 길**이었다: 자체 시험지의 서술형(MANUAL_ONLY)은 자동 채점이 영원히
  // UNKNOWN 을 내는데(internal-analysis kindOf), 레일에서 손댈 수 없으니
  // gradingConfirmed 가 서지 않아 리포트 생성이 영구 차단됐다(실측: 「새 시험지
  // 2026-07-06」 3문항 중 서술형 1 → unknownCount 1 → 「채점을 확인하세요」 무한 고착).
  // 잠금의 원래 근거(재동기화가 수동 편집을 덮어씀)는 브리지의 강사 확정 보존
  // 병합(mergePreservingReviewed)으로 제거됐다 — 확정(reviewed) 행은 자동 채점이
  // 다시 돌아도 살아남는다. 전 워크스페이스(verdict-board)는 애초에 잠그지 않았다.
  const gradingEditable = reportStatus !== "GENERATING";
  // 미채점 문항 — 「자동 채점이 못 정한 것」. 안내·도크 이동 목표의 단일 소스.
  const pendingNumbers = responses
    .filter((r) => r.status === "UNKNOWN")
    .map((r) => r.number);

  const reviewItems = isInternal ? (api.reviewQuestions?.items ?? null) : null;

  // 도크 CTA 가 보낸 문항 포커스 — 이 학생 것만 소비한다.
  // 번호가 비어 오면(호출부가 학생 단건 캐시를 아직 못 본 첫 클릭) **여기서**
  // 첫 미채점 문항으로 떨어뜨린다 — 그래야 "한 번 눌러 학생만 열리고, 다시 눌러야
  // 문항으로 가는" 2클릭이 안 생긴다(사용자 지시: 부드럽게 시선 이동).
  const focus = api.focusRequest;
  const focusForMe = focus?.studentId === studentRow.id;
  const focusNumber = focusForMe
    ? (focus?.questionNumber ?? pendingNumbers[0] ?? null)
    : null;
  const focusNonce = focusNumber ? (focus?.nonce ?? 0) : 0;

  const patchResponse = (number: string, partial: Partial<StudentResponse>) => {
    setDraft((prev) =>
      (prev ?? baseResponses).map((r) =>
        r.number === number ? { ...r, ...partial } : r,
      ),
    );
  };

  const saveGrading = async (confirm: boolean) => {
    if (saveBusy) return;
    setSaveBusy(true);
    try {
      const res = await updateStudentGrading(
        studentRow.id,
        {
          responses,
          gradingConfirmed: confirm ? true : st.gradingConfirmed,
        },
        st.version,
      );
      if (!res.ok) {
        if (res.error === "GENERATING")
          toast.error("리포트 생성 중에는 채점을 저장할 수 없어요.");
        else toast.error("다른 곳에서 수정됐어요 — 최신 상태로 새로고침합니다.");
        api.loadStudent(studentRow.id, true);
        return;
      }
      toast.success(
        confirm
          ? "채점을 확정했어요. 이제 리포트를 만들 수 있습니다."
          : "채점을 저장했어요.",
      );
      setDraft(null);
      api.loadStudent(studentRow.id, true);
      api.refreshDetail();
    } catch {
      toast.error("채점 저장에 실패했습니다.");
    } finally {
      setSaveBusy(false);
    }
  };

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMsg);
    } catch {
      toast.error("클립보드 복사에 실패했습니다.");
    }
  };

  const handleShareOn = async () => {
    setShareBusy(true);
    try {
      const { token } = await enableExamReportShare(studentRow.id);
      api.patchStudent(studentRow.id, {
        shareEnabled: true,
        shareToken: token,
      });
      api.patchDetailStudent(studentRow.id, { shareEnabled: true });
      await copyText(
        `${window.location.origin}/r/${token}`,
        "공유 링크를 복사했어요. 학부모·학생에게 전달하세요.",
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
      await disableExamReportShare(studentRow.id);
      api.patchStudent(studentRow.id, {
        shareEnabled: false,
        shareToken: null,
      });
      api.patchDetailStudent(studentRow.id, { shareEnabled: false });
      toast.success("공유를 껐어요. 기존 링크는 더 이상 열리지 않습니다.");
    } catch {
      toast.error("공유 끄기에 실패했습니다.");
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <div className="min-w-0 space-y-2">
      {/* 점수·출처 — 【26-09-05】 「미채점/채점 진행 중/채점 확정」 칩은 뺐다.
          같은 말이 **세 곳**에 있었다: 목록 행 태그(채점 미완료) · 이 칩 · 답안지
          헤더(학생이 고른 답을 표시하세요 3/20). 아코디언 안에서는 답안지 헤더가
          정본이므로 여기는 **점수와 출처**만 남긴다. */}
      {/* 점수·제출·정오 카운트 — 【26-09-05】 「앱 응시 자동 채점」 출처 칩을 뺐다
          (사용자 지시). isInternal 을 조건에서도 같이 걷어내야 한다 — 안 그러면
          자체 시험지 학생마다 **아무것도 없는 빈 줄**이 남는다. */}
      {score?.totalScore != null || st.answerSubmittedAt || (score && gradedCount > 0) ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {score?.totalScore != null ? (
            <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums text-slate-900">
              {round2(score.totalScore)}
              <span className="ml-0.5 text-[11px] font-medium tabular-nums text-slate-400">
                / {score.maxScore != null ? round2(score.maxScore) : "—"}점
              </span>
            </span>
          ) : null}
          {/* 제출 일시 — OMR 존을 걷어내며 이 줄로 이사했다(26-09-05). 제출은
              최종이라 이 칩이 「학생이 더는 못 고친다」의 표식이기도 하다. */}
          {st.answerSubmittedAt ? (
            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/60">
              제출 {fmtSubmitted(st.answerSubmittedAt)}
            </span>
          ) : null}
          {score && gradedCount > 0 ? (
            <span className="whitespace-nowrap text-[11px] tabular-nums text-slate-400">
              ○{score.correctCount} ✕{score.wrongCount}
              {score.partialCount > 0 ? ` △${score.partialCount}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* INTERNAL 응시 메타 */}
      {isInternal && st.submissionMeta ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-600">
            {SUBMISSION_STATUS_LABEL[st.submissionMeta.status] ??
              st.submissionMeta.status}
          </span>
          {st.submissionMeta.mode ? (
            <span>{st.submissionMeta.mode === "TABLET" ? "웹 응시" : "답안 입력"}</span>
          ) : null}
          {fmtDate(st.submissionMeta.submittedAt) ? (
            <span>제출 {fmtDate(st.submissionMeta.submittedAt)}</span>
          ) : null}
          {fmtDate(st.submissionMeta.dueAt) ? (
            <span>마감 {fmtDate(st.submissionMeta.dueAt)}</span>
          ) : null}
          {st.submissionMeta.assignmentTitle ? (
            <span
              className="min-w-0 max-w-full truncate"
              title={st.submissionMeta.assignmentTitle}
            >
              {st.submissionMeta.assignmentTitle}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* OMR 답안지 — 한 줄에 한 문항, 선지를 누르면 그게 학생 답이고 정오는
          자동 파생(26-09-05 재설계 — rail-answer-sheet 머리 주석 참조). */}
      <RailAnswerSheet
        responses={responses}
        examMap={examMap}
        editable={gradingEditable}
        onPatch={patchResponse}
        reviewItems={reviewItems}
        focusNumber={focusNumber}
        focusNonce={focusNonce}
        onConfirm={() => void saveGrading(true)}
        confirmBusy={saveBusy}
        confirmed={st.gradingConfirmed}
        dirty={dirty}
        onSave={() => void saveGrading(false)}
      />
      {/* ↑ 채점 액션([미채점 N번]·[저장]·[채점 확정])은 **VerdictTiles 하단 한 줄**이
          전부다. 여기서 [저장/채점 확정] 줄을 따로 들던 종전 구조는 [채점 확정]을
          2벌로 만들었고 두 벌의 활성 규칙마저 달랐다(26-09-04 사용자 지적). */}

      {/* 리포트 존 — 【26-09-05】 채점이 확정되기 전에는 그리지 않는다. 그때의
          내용은 "20문항 더 채우고 [채점 확정]을 누르세요" 한 줄뿐이었는데, 그건
          바로 위 답안지 헤더가 숫자로 이미 말한다(사용자 지시: 필요 없다). */}
      {canGenerate || reportStatus !== "NONE" ? (
      <div className="min-w-0 space-y-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <FileBarChart className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">AI 리포트</span>
          {reportStatus === "GENERATING" ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200/60">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              생성 중
            </span>
          ) : reportStatus === "GENERATED" ? (
            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/60">
              완성
            </span>
          ) : reportStatus === "FAILED" ? (
            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200/60">
              실패 · 크레딧 환불됨
            </span>
          ) : null}
        </div>
        {reportStatus === "GENERATING" ? (
          <p className="break-keep text-[11px] leading-relaxed text-slate-400">
            보통 1분 안에 끝나요 — 완성되면 여기서 바로 열 수 있습니다
          </p>
        ) : reportStatus === "GENERATED" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReportOpen((v) => !v)}
              className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800"
            >
              {reportOpen ? "리포트 접기" : "리포트 보기"}
            </button>
            <RailConfirmButton
              label="재생성"
              confirmLabel={`한 번 더 → ${REPORT_COST_LABEL}`}
              tone="charge"
              busy={generating}
              onConfirm={() => api.generateReport(studentRow.id)}
            />
          </div>
        ) : canGenerate ? (
          <div className="space-y-1">
            <RailConfirmButton
              label={
                reportStatus === "FAILED"
                  ? `다시 생성 · ${REPORT_COST_LABEL}`
                  : `리포트 생성 · ${REPORT_COST_LABEL}`
              }
              confirmLabel={`한 번 더 → ${REPORT_COST_LABEL} 소모`}
              tone="charge"
              busy={generating}
              onConfirm={() => api.generateReport(studentRow.id)}
              className="h-8 w-full text-[12px]"
            />
            <p className="break-keep text-[11px] leading-relaxed text-slate-400">
              채점 결과로 학생·학부모용 상담 리포트를 만듭니다
            </p>
          </div>
        ) : (
          // 26-09-05: 번호 20개 나열을 걷어냈다 — 답안지가 바로 위에 있고 남은
          // 문항 수는 그 헤더가 숫자로 말한다(같은 정보의 3중 나열 금지).
          <p className="break-keep text-[11px] leading-relaxed text-slate-400">
            {pendingNumbers.length > 0
              ? `위 답안지에서 ${pendingNumbers.length}문항을 더 채우고 [채점 확정]을 누르면 리포트를 만들 수 있어요`
              : "위 답안지에서 [채점 확정]을 누르면 리포트를 만들 수 있어요"}
          </p>
        )}
        {/* 리포트 인라인 뷰 — 자체 테마 격리 문서. 인쇄 CSS 는 suppress(@page 충돌) */}
        {reportOpen && reportStatus === "GENERATED" && st.report ? (
          <div className="max-h-[480px] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-2.5 py-1">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                리포트 미리보기
              </span>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="flex h-7 cursor-pointer items-center rounded-md px-2 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                접기
              </button>
            </div>
            <ReportDocument doc={st.report} mode="view" suppressPrintStyles />
          </div>
        ) : null}
      </div>
      ) : null}

      <RailStudentLinks
        st={st}
        reportStatus={reportStatus}
        shareEnabled={shareEnabled}
        shareBusy={shareBusy}
        onCopyText={copyText}
        onShareOn={() => void handleShareOn()}
        onShareOff={() => void handleShareOff()}
      />
      {/* 【26-09-04】 「삭제」 버튼 철거(사용자 지시 — "뭘 삭제하는지 모르겠고 없어도
          될 것 같다"). 실체는 **이 시험에서 학생 제외**(ExamReportStudent soft-delete
          — 채점·리포트·공유 토큰이 같이 죽는다)였는데, 학생 계정 삭제로 읽히는
          자구가 학생 아코디언 맨 아래 rose 로 놓여 있었다. 제외가 필요하면 전체
          워크스페이스 「학생 관리」 탭(students-tab — 대상 확인 모달 포함)이 정본
          경로다. 되살릴 땐 자구를 「이 시험에서 제외」로 바꿀 것. */}
    </div>
  );
}
