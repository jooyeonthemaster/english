"use client";

// 학생 상세 허브 — 개요 탭 (재구축, 타입드).
// 좌: 기본 정보·특이사항(인라인 편집)·접속 코드 / 우: 진행 중 과제·학습 리듬·
// 어법 스냅샷·최근 출결.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronRight, PenLine } from "lucide-react";
import { toast } from "sonner";
import { updateStudent } from "@/actions/students";
import { StudentAccessCard } from "@/components/students/devices/student-access-card";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import type { StudentStudyTaskRow } from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { dDayLabel, seoulDayDiff } from "@/lib/study-assignments/status";
import type { WeakConceptPreset } from "@/components/study-assignments/composer-grammar-spec";
import { METRIC_LABELS } from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import { OverviewActivityCard } from "./overview-activity-card";

export interface StudentHubOverviewData {
  id: string;
  studentCode: string;
  enrollDate: string | null;
  birthDate: string | null;
  gender: string | null;
  phone: string | null;
  memo: string | null;
  /** 특이사항 저장 시 updateStudent 의 schoolId||null 클로버 방지용 원본 보존값 */
  schoolId: string | null;
}

export interface StudentHubStats {
  attendanceRate: number;
  recentAttendances: { id: string; date: string; status: string }[];
  streak: number;
  /**
   * 평균 점수율(%) — 시험 탭과 동일 모집단(aggregateStudentExamHistory→
   * summarize, M-10)의 확정 점수 평균. 확정 0건이면 null → 헤더 타일 "—".
   */
  examAvgScorePct: number | null;
  /** 통합 응시 수(INTERNAL+EXTERNAL) — 0이면 헤더 타일 sub 미표기 */
  examSittings: number;
}

export interface GrammarSnapshot {
  solved: number;
  accuracy: number | null;
  weak: WeakConceptPreset[];
  /** 최근 14일 일별 활동(offset 13→0) — 개요 학습 리듬 카드가 소비 */
  days: { offset: number; solved: number; correct: number }[];
}

const ATTENDANCE_META: Record<string, { label: string; tone: PillTone }> = {
  PRESENT: { label: "출석", tone: "emerald" },
  ABSENT: { label: "결석", tone: "rose" },
  LATE: { label: "지각", tone: "violet" },
  EARLY_LEAVE: { label: "조퇴", tone: "indigo" },
  MAKEUP: { label: "보강", tone: "teal" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function StudentOverviewTab({
  student,
  stats,
  tasks,
  grammar,
  isDirector,
  onGoTab,
  onOpenAssignment,
}: {
  student: StudentHubOverviewData;
  stats: StudentHubStats;
  tasks: StudentStudyTaskRow[];
  grammar: GrammarSnapshot | null;
  isDirector: boolean;
  onGoTab: (tab: string) => void;
  /** 과제 소속 행 클릭 — 허브 리프트된 과제 상세 모달 오픈 */
  onOpenAssignment: (assignmentId: string) => void;
}) {
  const router = useRouter();
  const pending = tasks.filter((t) => t.liveStatus !== "DONE").slice(0, 4);

  // 특이사항 인라인 편집 — router.refresh 반영 전까지 로컬 오버라이드로 표시
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoOverride, setMemoOverride] = useState<string | null>(null);
  const [savingMemo, startMemoSave] = useTransition();
  const memoText = memoOverride ?? student.memo;

  const saveMemo = () => {
    const next = memoDraft.trim();
    startMemoSave(async () => {
      // updateStudent 는 schoolId 를 `data.schoolId || null` 로 쓰므로 memo 만
      // 보내면 학교 배정이 지워진다 — 원본 schoolId 를 반드시 함께 전달.
      const res = await updateStudent(student.id, {
        memo: next,
        schoolId: student.schoolId ?? undefined,
      });
      if (res.success) {
        setMemoOverride(next);
        setEditingMemo(false);
        toast.success("특이사항을 저장했습니다.");
        router.refresh();
      } else {
        toast.error(res.error ?? "특이사항 저장에 실패했습니다.");
      }
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── 좌측 ── */}
      <div className="flex min-w-0 flex-col gap-4">
        <Card title="기본 정보">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="입학일" value={fmtDate(student.enrollDate)} />
            <Field label="생년월일" value={fmtDate(student.birthDate)} />
            <Field
              label="성별"
              value={student.gender === "MALE" ? "남" : student.gender === "FEMALE" ? "여" : "—"}
            />
            <Field label="전화번호" value={student.phone ?? "—"} />
          </dl>
        </Card>
        <Card
          title="특이사항"
          actionNode={
            isDirector && !editingMemo ? (
              <button
                type="button"
                onClick={() => {
                  setMemoDraft(memoText ?? "");
                  setEditingMemo(true);
                }}
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-blue-600"
              >
                <PenLine className="size-3" aria-hidden />
                수정
              </button>
            ) : undefined
          }
        >
          {editingMemo ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={memoDraft}
                onChange={(e) => setMemoDraft(e.target.value)}
                rows={4}
                autoFocus
                disabled={savingMemo}
                placeholder="상담·지도 시 참고할 특이사항을 입력합니다."
                className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-[13px] leading-relaxed text-slate-700 outline-none focus:border-blue-400 disabled:opacity-50"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditingMemo(false)}
                  disabled={savingMemo}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveMemo}
                  disabled={savingMemo}
                  className="h-7 rounded-md bg-blue-600 px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingMemo ? "저장 중…" : "저장"}
                </button>
              </div>
            </div>
          ) : memoText ? (
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-600">
              {memoText}
            </p>
          ) : (
            <p className="text-[12.5px] text-slate-300">등록된 특이사항이 없습니다.</p>
          )}
        </Card>
        <StudentAccessCard
          studentId={student.id}
          studentCode={student.studentCode}
          isDirector={isDirector}
        />
      </div>

      {/* ── 우측 ── */}
      <div className="flex min-w-0 flex-col gap-4">
        {/* N-22 — 모집단이 미완료 전체(기한 지남 포함)라 「다가오는」은 자기모순.
            제목을 「진행 중 과제」로 완화(빈 상태 문구 「진행 중인 과제가
            없습니다」와도 정합) — 행 분리안은 신설 섹션·신규 어휘 반경이 커 기각 */}
        <Card
          title="진행 중 과제"
          action={{ label: "과제 전체", onClick: () => onGoTab("tasks") }}
        >
          {pending.length === 0 ? (
            <p className="text-[12.5px] text-slate-300">진행 중인 과제가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pending.map((t) => {
                // 예약(availableFrom 미래)은 D-day 대신 violet 예약 pill 이 정본 신호
                const scheduled = t.availableFrom
                  ? new Date(t.availableFrom).getTime() > Date.now()
                  : false;
                const dday =
                  t.dueAt && !scheduled
                    ? dDayLabel(seoulDayDiff(new Date(), new Date(t.dueAt)))
                    : null;
                return (
                  <li key={t.taskId}>
                    {/* 과제 소속은 상세 모달(허브 리프트), 직접 배포는 과제 탭으로 */}
                    <button
                      type="button"
                      onClick={() =>
                        t.assignmentId ? onOpenAssignment(t.assignmentId) : onGoTab("tasks")
                      }
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-slate-100 px-3 py-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/30"
                    >
                      <StatusPill tone={STUDY_KIND_META[t.kind].tone}>
                        {STUDY_KIND_META[t.kind].label}
                      </StatusPill>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">
                        {t.title}
                      </span>
                      {t.progressText ? (
                        <span className="hidden shrink-0 text-[11px] tabular-nums text-slate-300 sm:inline">
                          {t.progressText}
                        </span>
                      ) : null}
                      {scheduled ? (
                        <StatusPill tone="violet" className="shrink-0">
                          예약
                        </StatusPill>
                      ) : dday ? (
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 text-[11.5px] font-bold tabular-nums",
                            t.overdue ? "text-rose-600" : "text-slate-500",
                          )}
                        >
                          <CalendarClock className="size-3" aria-hidden />
                          {dday}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-slate-300">마감 없음</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* 최근 14일 학습 리듬 — 어법 프리로드 재사용, 기록 없으면 자체 미렌더 */}
        <OverviewActivityCard grammar={grammar} tasks={tasks} onGoTab={onGoTab} />

        <Card
          title="어법 훈련 스냅샷"
          action={grammar ? { label: "자세히", onClick: () => onGoTab("grammar") } : undefined}
        >
          {!grammar || grammar.solved === 0 ? (
            <p className="text-[12.5px] text-slate-300">어법 훈련 기록이 아직 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-4">
                <span className="text-[13px] text-slate-500">
                  누적{" "}
                  <span className="font-bold tabular-nums text-slate-800">
                    {grammar.solved}
                  </span>
                  문항
                </span>
                <span className="text-[13px] text-slate-500">
                  정답률{" "}
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      (grammar.accuracy ?? 0) >= 70
                        ? "text-emerald-600"
                        : (grammar.accuracy ?? 0) < 50
                          ? "text-rose-600"
                          : "text-slate-800",
                    )}
                  >
                    {grammar.accuracy ?? 0}%
                  </span>
                </span>
              </div>
              {grammar.weak.length > 0 ? (
                <div>
                  {/* 「취약」 강사 노출 대체어(D6-1) — METRIC_LABELS.WEAK 소비 */}
                  <p className="mb-1 text-[11px] font-semibold text-slate-400">
                    {METRIC_LABELS.WEAK} 개념
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {grammar.weak.map((w) => (
                      <span
                        key={w.conceptId}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600"
                      >
                        {w.title}
                        <span className="rounded-full bg-rose-50 px-1.5 text-[10px] font-semibold tabular-nums text-rose-600">
                          {w.score}점
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card
          title="최근 출결"
          action={{ label: "출결 전체", onClick: () => onGoTab("attendance") }}
        >
          {stats.recentAttendances.length === 0 ? (
            <p className="text-[12.5px] text-slate-300">출결 기록이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {stats.recentAttendances.slice(0, 5).map((a) => {
                const meta = ATTENDANCE_META[a.status] ?? {
                  label: a.status,
                  tone: "slate" as PillTone,
                };
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-slate-500">{fmtDate(a.date)}</span>
                    <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function Card({
  title,
  action,
  actionNode,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  /** 링크형 action 대신 임의 헤더 액션(예: 특이사항 수정 버튼) */
  actionNode?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-bold text-slate-600">{title}</p>
        {actionNode ??
          (action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-blue-600"
            >
              {action.label}
              <ChevronRight className="size-3" aria-hidden />
            </button>
          ) : null)}
      </div>
      {children}
    </div>
  );
}
