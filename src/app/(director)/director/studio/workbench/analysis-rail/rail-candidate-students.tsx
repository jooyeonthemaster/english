"use client";

// ============================================================================
// 후보 화면(분석 행이 아직 없는 스모트 시험지) [학생] 탭 — 행 레일과 **같은 목록**.
//
// 26-09-04 목록 통합 개편의 짝: 후보에는 학생 행(ExamReportStudent)이 아직 없으니
// 전원이 「답안 없음」 태그다. 행 [링크 보내기]는 서버가 분석 행을 먼저 만들고
// (AI 0콜·무과금) 링크를 발급한다 — 그 순간 왼쪽 카드가 후보에서 분석 행으로
// 승격되므로, 발급한 링크는 셸이 든 issuedLinks 로 남겨 화면에서 증발하지 않게 한다.
// ============================================================================

import { useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { issueExamAnswerLinkByExam } from "@/actions/exam-report";
import { RailIssuedLinks } from "./rail-issued-links";
import {
  buildUnifiedRows,
  RailStudentRows,
  type UnifiedStudentRow,
} from "./rail-student-rows";
import { answerLinkUrl, copyToClipboard } from "./use-analysis-bulk";
import type { AnalysisConsoleApi } from "./use-analysis-console";

export function RailCandidateStudents({
  examId,
  console: api,
}: {
  examId: string;
  console: AnalysisConsoleApi;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // 명단 적재는 셸이 후보 examId 스코프로 이미 걸어 둔다(use-analysis-roster).
  const { rosterPhase } = api;

  const handleIssue = async (row: UnifiedStudentRow) => {
    const entry = row.roster;
    if (!entry || busyKey) return;
    setBusyKey(`l:${row.key}`);
    try {
      const res = await issueExamAnswerLinkByExam(examId, entry.studentId);
      const url = answerLinkUrl(res.token);
      api.pushIssuedLinks([{ studentId: entry.studentId, name: entry.name, url }]);
      const copied = await copyToClipboard(url);
      toast.success(
        copied
          ? `${entry.name} 학생 답안 링크를 발급하고 복사했어요.`
          : `${entry.name} 학생 답안 링크를 발급했어요.`,
      );
      api.reloadRoster();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "링크 발급에 실패했습니다.");
    } finally {
      setBusyKey(null);
    }
  };

  const rows = buildUnifiedRows([], api.roster);

  if (rosterPhase === "loading" && !api.roster) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11.5px] text-slate-400">
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        학생을 불러오는 중…
      </div>
    );
  }
  if (rosterPhase === "error") {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-rose-100 bg-rose-50 px-2.5 py-2">
        <p className="min-w-0 flex-1 break-keep text-[11.5px] leading-relaxed text-rose-600">
          우리 반 학생을 불러오지 못했어요
        </p>
        <button
          type="button"
          onClick={() => api.reloadRoster()}
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-100"
        >
          <RotateCw className="size-3 shrink-0" aria-hidden="true" />
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
      <RailIssuedLinks console={api} />
      {rows.length === 0 ? (
        <p className="break-keep text-[11.5px] leading-relaxed text-slate-400">
          이 클래스에 등록된 학생이 없습니다
        </p>
      ) : (
        <RailStudentRows
          rows={rows}
          detail={null}
          isInternal
          gateOpen
          busyKey={busyKey}
          onIssue={(r) => void handleIssue(r)}
          // 후보는 분석 행이 없어 담기 자체가 불가 — 링크를 보내면 서버가 행을 만든다.
          onManualEntry={(r) => void handleIssue(r)}
          console={api}
        />
      )}
    </div>
  );
}
