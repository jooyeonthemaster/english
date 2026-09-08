"use client";

// ============================================================================
// 레일 하단 도크 — **학생 선택 픽바**(26-09-04 사용자 지시).
//
// 지시 원문: "애초에 여기서 체크를 하면 버튼이 뜨도록 하면 되잖아." (지문관리
// dossier-pick-bar 를 지목) — 그래서 [학생] 목록에서 행을 체크하면 도크가 「다음
// 단계」 블록 대신 이 바로 바뀐다. 선택이 0이 되면 다시 다음 단계로 돌아간다.
//
// 버튼은 **선택 안에서 실제로 가능한 액션만** 나온다(선택 3명 중 2명만 채점이
// 끝났으면 [리포트 생성 2명]). 대상 판정은 classifyFunnelStudent 한 술어 —
// 목록 태그·도크 인원과 갈릴 수 없다.
//   · 답안 링크 보내기 = 아직 답안이 없는 클래스 학생(r:) + 링크 미발급 학생행
//   · 리포트 생성      = 채점 확정 + 리포트 없음/실패 (과금 — 2단 확인 + cr 칩)
//   · 공유 링크 발급   = 리포트 완성 + 미공유
// 과금은 이 바의 2단 확인에서만 일어난다 — 종전 도크 CTA 의 「대상이 보이지 않는
// 일괄 5cr×N」을 없앤 것이 이 개편의 핵심이다.
// 계약 셀렉터: [data-student-pick-bar] · [data-pickbar-action="<kind>"]
// ============================================================================

import { useState } from "react";
import { FileBarChart, Link2, Loader2, PencilLine, Share2, X } from "lucide-react";
import { toast } from "sonner";
import {
  enableAnswerLink,
  issueExamAnswerLinkByExam,
  issueExamAnswerLinkForRoster,
} from "@/actions/exam-report";
import { cn } from "@/lib/utils";
import { RailConfirmButton } from "./rail-confirm-button";
import { CostChip, NEXT_STEP_COSTS, formatCredits } from "./rail-next-step";
import type { UnifiedStudentRow } from "./rail-student-rows";
import { answerLinkUrl, buildLinkTable, copyToClipboard } from "./use-analysis-bulk";
import type { AnalysisConsoleApi } from "./use-analysis-console";
import type { RosterTarget } from "./use-analysis-roster";

const BTN =
  "inline-flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-bold transition-colors disabled:cursor-default disabled:opacity-50";

export function RailStudentPickBar({
  rows,
  target,
  gateOpen,
  console: api,
}: {
  /** 목록과 **같은 배열**(buildUnifiedRows) — 선택 키의 해석을 두 벌로 두지 않는다. */
  rows: ReadonlyArray<UnifiedStudentRow>;
  target: RosterTarget;
  gateOpen: boolean;
  console: AnalysisConsoleApi;
}) {
  const [busy, setBusy] = useState<null | "link" | "report" | "share">(null);

  const picked = rows.filter((r) => api.pickedStudentKeys.has(r.key));
  if (picked.length === 0) return null;

  // 액션별 대상 — 선택 밖은 절대 건드리지 않는다.
  const linkTargets = picked.filter(
    (r) => r.roster != null || r.stage === "needLink",
  );
  // 채점하기 = 자동 채점이 못 정한 문항이 남은 학생(도크 confirm-grading 의 짝).
  //  여러 명을 골랐어도 채점은 한 명씩이다 — 첫 학생의 첫 미채점 문항으로 데려간다.
  const gradingTargets = picked.filter((r) => r.stage === "needGrading");
  const reportTargets = picked.filter((r) => r.stage === "needReport");
  const shareTargets = picked.filter((r) => r.stage === "needShare");
  const reportCost = reportTargets.length * NEXT_STEP_COSTS.reportPerStudent;

  const clear = () => api.clearStudentPicks();

  // ── 답안 링크 보내기(클래스 학생 = 담기+발급, 등록 학생 = 발급) ────────────
  const runLinks = async () => {
    if (busy) return;
    setBusy("link");
    try {
      const table: { name: string; url: string }[] = [];
      const issued: { studentId: string; name: string; url: string }[] = [];
      let failed = 0;
      for (const row of linkTargets) {
        try {
          if (row.roster) {
            const res =
              target.kind === "analysis"
                ? await issueExamAnswerLinkForRoster(target.id, row.roster.studentId)
                : await issueExamAnswerLinkByExam(target.id, row.roster.studentId);
            const url = answerLinkUrl(res.token);
            table.push({ name: row.name, url });
            issued.push({ studentId: row.roster.studentId, name: row.name, url });
          } else if (row.student) {
            // 등록된 학생은 토큰만 발급하면 된다(담기 불필요) — 표를 되파싱하는
            // 일괄 헬퍼 대신 단건 액션을 쓴다(반환값이 곧 토큰이라 왕복이 없다).
            const { token } = await enableAnswerLink(row.student.id);
            const url = answerLinkUrl(token);
            api.patchDetailStudent(row.student.id, {
              answerToken: token,
              answerEnabled: true,
            });
            table.push({ name: row.name, url });
            issued.push({ studentId: row.student.id, name: row.name, url });
          }
        } catch {
          failed += 1;
        }
      }
      if (issued.length === 0) {
        toast.error("링크 발급에 실패했습니다.");
        return;
      }
      api.pushIssuedLinks(issued);
      const copied = await copyToClipboard(
        table.length > 1 ? buildLinkTable(table) : (table[0]?.url ?? ""),
      );
      toast.success(
        copied
          ? `${issued.length}명 답안 링크 발급 · 복사했습니다.`
          : `${issued.length}명 답안 링크를 발급했습니다. 복사에는 실패했습니다.`,
      );
      if (failed > 0) toast.error(`${failed}명은 발급에 실패했습니다.`);
      clear();
      api.reloadRoster();
      api.refreshDetail();
    } finally {
      setBusy(null);
    }
  };

  // ── 리포트 생성(과금) ─────────────────────────────────────────────────────
  const runReports = async () => {
    if (busy) return;
    const ids = reportTargets.map((r) => r.student!.id);
    setBusy("report");
    try {
      const r = await api.generateReportsBulk(ids);
      const remaining = ids.length - r.started.length;
      if (r.stoppedBy402)
        toast.error(
          `크레딧이 부족해 ${remaining}명의 리포트를 만들지 못했습니다. 충전 후 다시 시도하세요.`,
        );
      else if (remaining === 0)
        toast.success(`${r.started.length}명의 리포트를 만들었습니다.`);
      else
        toast.warning(`${r.started.length}명 완료 · ${remaining}명은 실패했습니다.`);
      clear();
    } catch {
      toast.error("리포트 생성에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  // ── 공유 링크 발급 ────────────────────────────────────────────────────────
  const runShares = async () => {
    if (busy) return;
    const ids = shareTargets.map((r) => r.student!.id);
    const names = new Map(shareTargets.map((r) => [r.student!.id, r.name]));
    setBusy("share");
    try {
      const r = await api.enableSharesBulk(ids, names);
      if (r.enabled.length === 0) {
        toast.error("공유 링크 발급에 실패했습니다.");
        return;
      }
      const copied = await copyToClipboard(r.table);
      toast.success(
        copied
          ? `공유 링크 ${r.enabled.length}명 발급 · 이름·링크 표를 복사했습니다.`
          : `공유 링크 ${r.enabled.length}명을 발급했습니다. 표 복사에는 실패했습니다.`,
      );
      if (r.failed.length > 0)
        toast.error(`${r.failed.length}명은 발급에 실패했습니다.`);
      clear();
    } finally {
      setBusy(null);
    }
  };

  const nothingToDo =
    gradingTargets.length === 0 &&
    linkTargets.length === 0 &&
    reportTargets.length === 0 &&
    shareTargets.length === 0;

  return (
    <div data-student-pick-bar className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-blue-600">
          {picked.length}명 선택
        </span>
        {nothingToDo ? (
          <span className="min-w-0 flex-1 break-keep text-[10.5px] leading-relaxed text-slate-400">
            지금 할 수 있는 작업이 없는 학생들이에요
          </span>
        ) : (
          <span className="min-w-0 flex-1" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={clear}
          aria-label="선택 해제"
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {gradingTargets.length > 0 ? (
          <button
            type="button"
            data-pickbar-action="grade"
            disabled={busy != null}
            onClick={() => {
              const first = gradingTargets[0];
              if (first?.student) api.focusStudent(first.student.id, null);
            }}
            className={cn(
              BTN,
              "bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800",
            )}
          >
            <PencilLine className="size-3.5 shrink-0" aria-hidden="true" />
            채점하기 {gradingTargets.length}명
          </button>
        ) : null}

        {linkTargets.length > 0 ? (
          <button
            type="button"
            data-pickbar-action="link"
            disabled={busy != null || !gateOpen}
            title={
              gateOpen ? undefined : "정답·배점 확인을 끝내야 링크를 보낼 수 있어요"
            }
            onClick={() => void runLinks()}
            className={cn(
              BTN,
              // 프라이머리는 한 화면에 하나 — 채점이 있으면 링크는 보조로 내린다.
              gradingTargets.length > 0
                ? "border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50"
                : "bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800",
            )}
          >
            {busy === "link" ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            OMR 링크 보내기 {linkTargets.length}명
          </button>
        ) : null}

        {reportTargets.length > 0 ? (
          <RailConfirmButton
            tone="primary"
            busy={busy === "report"}
            disabled={busy != null}
            onConfirm={() => void runReports()}
            confirmLabel={`한 번 더 누르면 ${formatCredits(reportCost)} 차감`}
            icon={<FileBarChart className="size-3.5 shrink-0" aria-hidden="true" />}
            label={
              <>
                리포트 생성 {reportTargets.length}명
                <CostChip cost={reportCost} onDark />
              </>
            }
            className="h-9 min-w-0 flex-1 rounded-lg px-2.5 text-[12.5px] font-bold"
            data-pickbar-action="report"
          />
        ) : null}

        {shareTargets.length > 0 ? (
          <button
            type="button"
            data-pickbar-action="share"
            disabled={busy != null}
            onClick={() => void runShares()}
            className={cn(
              BTN,
              "border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            {busy === "share" ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Share2 className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            공유 링크 {shareTargets.length}명
          </button>
        ) : null}
      </div>
    </div>
  );
}
