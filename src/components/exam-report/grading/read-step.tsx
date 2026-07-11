"use client";

// ============================================================================
// 학생 시험 리포트 — 스텝 1: 답안 수집 (2경로)
//
// (a) 학생 답안 링크: /a/{token} 공개 링크 발급 → 학생이 직접 입력(answer-link-panel).
// (b) 직접 입력: 정오표에서 강사가 문항별 선지·정오를 손으로 입력.
// 플로우 개편(26-07-08): AI 사진 판독(E2) 경로는 UI 에서 폐기 — 답안 수집은
// 위 2경로만 제공한다. 기존 판독 데이터(readState/sourceFiles)는 정오표에서
// 계속 열람 가능(verdict-board 의 StudentSourceViewer 유지).
// ============================================================================

import {
  AlertTriangle,
  ArrowRight,
  Link2,
  ListChecks,
  PencilLine,
  type LucideIcon,
} from "lucide-react";

import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import type { ExamStudentDetail } from "../ui-contracts";
import { AnswerLinkPanel } from "./answer-link-panel";

interface ReadStepProps {
  student: ExamStudentDetail;
  /** 부모 시험의 examMap(문항 분석) 준비 여부 — 미완이면 어느 경로도 진행 불가. */
  examMapReady: boolean;
  /** 답안 링크 발급/끄기 낙관 반영(버전 무관 필드만 patch). */
  onStudentChange: (next: ExamStudentDetail) => void;
  /** 정오표 스텝으로 진행(직접 입력·제출 확인 공용). */
  onAdvance: () => void;
}

export function ReadStep({
  student,
  examMapReady,
  onStudentChange,
  onAdvance,
}: ReadStepProps) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
        <WorkflowPageTitle
          icon={ListChecks}
          title="답안 수집"
          description="학생 링크 또는 직접 입력으로 학생 답안을 모으세요."
        />
      </div>

      <div className="flex flex-col gap-4 p-4">
        {!examMapReady && (
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-[12.5px] leading-relaxed text-slate-500">
              시험 문항 분석이 완료된 뒤에 답안을 수집할 수 있습니다. 먼저 분석
              화면에서 문항 분석을 진행하세요.
            </p>
          </div>
        )}

        {/* 2카드 균형 레이아웃 — 두 경로가 같은 무게로 나란히 선다. */}
        <div className="grid items-stretch gap-4 md:grid-cols-2">
          {/* (a) 학생 답안 링크 */}
          {/* 제출 대기/제출됨 라이브 상태 칩은 AnswerLinkPanel 내부에 있다. */}
          <MethodTile
            icon={Link2}
            title="학생 답안 링크"
            description="학생이 휴대폰으로 본인 답을 직접 입력합니다."
          >
            <AnswerLinkPanel
              student={student}
              examMapReady={examMapReady}
              onStudentChange={onStudentChange}
              onGoVerdict={onAdvance}
            />
          </MethodTile>

          {/* (b) 직접 입력 */}
          <MethodTile
            icon={PencilLine}
            title="직접 입력"
            description="선생님이 정오표에서 문항별 선지와 정오를 바로 입력합니다."
          >
            <div className="flex h-full flex-col justify-between gap-2">
              <p className="text-[12px] leading-relaxed text-slate-500">
                객관식은 ①~⑤ 선지를 누르면 정답 대조로 정오가 자동 판정되고,
                서답형은 ○✕△ 로 직접 채점합니다.
              </p>
              <button
                type="button"
                onClick={onAdvance}
                disabled={!examMapReady}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                정오표로 이동
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </MethodTile>
        </div>
      </div>
    </section>
  );
}

// ── 수집 방법 타일 셸 ────────────────────────────────────────────────────────

function MethodTile({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-slate-800">{title}</h3>
          <p className="text-[11.5px] font-medium text-slate-400">{description}</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
