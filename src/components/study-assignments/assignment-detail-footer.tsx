"use client";

// ============================================================================
// 과제 상세 모달 — 푸터·액션 크롬 (assignment-detail-modal 전용 분리)
//
//  - AssignmentDetailFooter: 시작일·마감일 편집(마감 연장 프리셋 +1일/+3일/+1주
//    즉시 저장 포함)·종료/재개·삭제. 폼 프리필은 마운트 시 1회 — 부모가
//    key(prefillTick)로 리마운트해야 갱신되므로, silent 새로고침은 편집 중인
//    폼 값을 절대 덮지 않는다.
//  - buildDuplicatePreset: 상세 → 컴포저 프리셋 매핑(복제 재배포). 원본 삭제
//    등 복제 불가 사유는 토스트로 알리고 null 반환.
//  - DetailActionsCluster: 뷰 전환 행 우측 — 복제해 새 과제·미완료 재배포·
//    조용한 새로고침(자동 폴링 금지 — 수동 버튼만).
// ============================================================================

import { useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  CopyPlus,
  Lock,
  Redo2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  closeStudyAssignment,
  deleteStudyAssignment,
  reopenStudyAssignment,
  updateStudyAssignment,
} from "@/actions/study-assignments";
import type { ComposerPreset } from "./assignment-composer";
import type {
  ExamAssignmentPayload,
  GrammarAssignmentPayload,
  StudyAssignmentDetail,
  WorksheetAssignmentPayload,
} from "@/lib/study-assignments/types";
import { cn } from "@/lib/utils";

/** 서울(UTC+9) 달력일 — date input 프리필용 "YYYY-MM-DD" */
export function seoulYmd(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** 서울(UTC+9) 시각 — time input 프리필용 "HH:mm" */
export function seoulHm(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "YYYY-MM-DD"(서울 달력일)에 일수를 더한 서울 달력일 */
function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return seoulYmd(d.toISOString());
}

/** "YYYY-MM-DD" → "7월 18일" — 연장 토스트용 */
function ymdToKorean(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

// ── 복제 재배포 — 상세 → 컴포저 프리셋 매핑 ─────────────────────────────────

export function buildDuplicatePreset(
  detail: StudyAssignmentDetail,
): ComposerPreset | null {
  if (detail.kind === "EXAM") {
    if (!detail.refId) {
      toast.error("원본 시험지가 삭제되어 복제할 수 없습니다.");
      return null;
    }
    const payload = detail.payload as ExamAssignmentPayload;
    return {
      kind: "EXAM",
      content: { refId: detail.refId, title: detail.title, meta: "기존 과제에서 복제" },
      examMode: payload.mode === "OMR" ? "OMR" : "TABLET",
    };
  }
  if (detail.kind === "WORKSHEET") {
    if (!detail.refId) {
      toast.error("원본 학습지가 삭제되어 복제할 수 없습니다.");
      return null;
    }
    const payload = detail.payload as WorksheetAssignmentPayload;
    return {
      kind: "WORKSHEET",
      content: {
        refId: detail.refId,
        title: payload.passageTitle ?? detail.title,
        meta: "기존 과제에서 복제",
      },
    };
  }
  if (detail.kind === "QUESTIONS") {
    const ids = (detail.payload as { questionIds?: unknown }).questionIds;
    const questionIds = Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : [];
    if (questionIds.length === 0) {
      toast.error("문항 스냅샷이 비어 있어 복제할 수 없습니다.");
      return null;
    }
    return { kind: "QUESTIONS", questionIds };
  }
  const spec = detail.payload as GrammarAssignmentPayload;
  return {
    kind: "GRAMMAR",
    grammarSpec: {
      unitIds: spec.unitIds,
      conceptIds: spec.conceptIds,
      itemTypes: spec.itemTypes,
      difficulties: spec.difficulties,
      count: spec.count ?? 20,
    },
  };
}

/** 뷰 전환 행 우측 액션 클러스터 — 복제·미완료 재배포·조용한 새로고침 */
export function DetailActionsCluster({
  detail,
  onDuplicate,
  refreshing,
  refreshedAt,
  onRefresh,
}: {
  detail: StudyAssignmentDetail;
  /** 미전달(학생 허브 경유)이면 복제 버튼 미렌더 — 보드(U3)만 배선 */
  onDuplicate?: (preset: ComposerPreset, studentIds: string[]) => void;
  refreshing: boolean;
  /** "HH:mm" — 마지막 갱신 시각(첫 로드 포함) */
  refreshedAt: string | null;
  onRefresh: () => void;
}) {
  const pendingIds = detail.tasks
    .filter((t) => t.liveStatus !== "DONE")
    .map((t) => t.studentId);
  const hasClassTarget = detail.targets.some((t) => t.type === "CLASS");

  const duplicate = (studentIds: string[]) => {
    if (!onDuplicate) return;
    if (studentIds.length === 0) {
      toast.error("배정할 학생이 없습니다.");
      return;
    }
    const preset = buildDuplicatePreset(detail);
    if (!preset) return;
    onDuplicate(preset, studentIds);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {onDuplicate ? (
        <>
          {hasClassTarget ? (
            <span className="hidden text-[11px] text-slate-400 md:inline">
              반 대상은 학생별로 풀려 배정됩니다
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => duplicate(detail.tasks.map((t) => t.studentId))}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <CopyPlus className="size-3" aria-hidden />
            복제해 새 과제
          </button>
          {pendingIds.length > 0 ? (
            <button
              type="button"
              onClick={() => duplicate(pendingIds)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
            >
              <Redo2 className="size-3" aria-hidden />
              미완료 재배포 ({pendingIds.length}명)
            </button>
          ) : null}
        </>
      ) : null}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="배정 현황 새로고침"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-medium text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3", refreshing && "animate-spin")} aria-hidden />
        {refreshedAt ? (
          <span className="tabular-nums">{refreshedAt} 갱신</span>
        ) : (
          "새로고침"
        )}
      </button>
    </div>
  );
}

// ── 푸터 — 시작·마감 편집 + 종료/재개 + 삭제 ────────────────────────────────

export function AssignmentDetailFooter({
  detail,
  onReload,
  onChanged,
  onClose,
}: {
  detail: StudyAssignmentDetail;
  /** 저장 성공 후 상세 재조회(non-silent) — 부모가 prefillTick 을 올려 이 폼을 리마운트 */
  onReload: () => Promise<void>;
  onChanged: () => void;
  /** 삭제 성공 시 모달 닫기 */
  onClose: () => void;
}) {
  const [dueDate, setDueDate] = useState(detail.dueAt ? seoulYmd(detail.dueAt) : "");
  const [dueTime, setDueTime] = useState(detail.dueAt ? seoulHm(detail.dueAt) : "23:59");
  const [startDate, setStartDate] = useState(seoulYmd(detail.availableFrom));
  const [startTime, setStartTime] = useState(seoulHm(detail.availableFrom));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 프리필(seoulYmd/seoulHm)과 대칭 — 서울(UTC+9) 고정 오프셋으로 해석해
  // 비KST 브라우저에서 무변경 재저장 시 dueAt/availableFrom 이 흔들리지 않게 한다.
  const save = async (opts?: { date?: string; time?: string; successMsg?: string }) => {
    if (saving) return;
    setSaving(true);
    const d = opts?.date ?? dueDate;
    const t = opts?.time ?? dueTime;
    const dueAt = d ? new Date(`${d}T${t || "23:59"}:00+09:00`).toISOString() : null;
    const availableFrom = startDate
      ? new Date(`${startDate}T${startTime || "00:00"}:00+09:00`).toISOString()
      : undefined;
    const res = await updateStudyAssignment({
      assignmentId: detail.id,
      dueAt,
      availableFrom,
    });
    if (res.success) {
      toast.success(
        opts?.successMsg ?? (dueAt ? "마감일을 변경했습니다." : "마감 없음으로 변경했습니다."),
      );
      await onReload();
      onChanged();
    } else {
      toast.error(res.error ?? "일정 변경에 실패했습니다.");
    }
    setSaving(false);
  };

  /** 마감 연장 프리셋 — 현재 폼 마감(없으면 오늘) 기준 +N일 즉시 저장 */
  const extendDue = (days: number) => {
    const base = dueDate || seoulYmd(new Date().toISOString());
    const nextDate = addDaysYmd(base, days);
    const nextTime = dueTime || "23:59";
    setDueDate(nextDate);
    setDueTime(nextTime);
    void save({
      date: nextDate,
      time: nextTime,
      successMsg: `마감일을 ${ymdToKorean(nextDate)}로 연장했습니다.`,
    });
  };

  const toggleStatus = async () => {
    if (toggling) return;
    setToggling(true);
    const res =
      detail.status === "ACTIVE"
        ? await closeStudyAssignment(detail.id)
        : await reopenStudyAssignment(detail.id);
    if (res.success) {
      toast.success(detail.status === "ACTIVE" ? "과제를 종료했습니다." : "과제를 재개했습니다.");
      await onReload();
      onChanged();
    } else {
      toast.error(res.error ?? "상태 변경에 실패했습니다.");
    }
    setToggling(false);
  };

  const remove = async () => {
    if (deleting) return;
    const ok = window.confirm(
      `"${detail.title}" 과제를 삭제할까요?\n과제와 학생별 진행 기록이 삭제됩니다.`,
    );
    if (!ok) return;
    setDeleting(true);
    const res = await deleteStudyAssignment(detail.id);
    if (res.success) {
      toast.success("과제를 삭제했습니다.");
      onChanged();
      onClose();
    } else {
      toast.error(res.error ?? "과제 삭제에 실패했습니다.");
    }
    setDeleting(false);
  };

  const dateInputClass =
    "h-8 rounded-md border border-slate-200 bg-white px-2 text-[12.5px] text-slate-700 outline-none focus:border-blue-400";

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-2">
        {/* 시작일 — 예약 배포 편집(updateStudyAssignment 가 마감과 교차검증) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex w-14 items-center gap-1.5 text-[12px] font-semibold text-slate-500">
            <CalendarDays className="size-3.5" aria-hidden />
            시작일
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={dateInputClass}
            aria-label="시작 날짜"
          />
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={dateInputClass}
            aria-label="시작 시각"
          />
        </div>

        {/* 마감일 + 연장 프리셋 + 저장(시작·마감 함께 저장) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex w-14 items-center gap-1.5 text-[12px] font-semibold text-slate-500">
            <CalendarClock className="size-3.5" aria-hidden />
            마감일
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={dateInputClass}
            aria-label="마감 날짜"
          />
          <input
            type="time"
            value={dueTime}
            disabled={!dueDate}
            onChange={(e) => setDueTime(e.target.value)}
            className={cn(dateInputClass, "disabled:opacity-40")}
            aria-label="마감 시각"
          />
          {dueDate ? (
            <button
              type="button"
              onClick={() => setDueDate("")}
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              마감 없음
            </button>
          ) : null}
          {([1, 3, 7] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => extendDue(days)}
              disabled={saving}
              className="h-8 rounded-full border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
            >
              {days === 7 ? "+1주" : `+${days}일`}
            </button>
          ))}
          {/* 저장 = 이 구역의 프라이머리(파괴 액션보다 우세한 위계) */}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="h-8 rounded-md bg-blue-600 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      {/* 종료/재개 · 삭제 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleStatus}
          disabled={toggling}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-50",
            detail.status === "ACTIVE"
              ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
          )}
        >
          {detail.status === "ACTIVE" ? (
            <>
              <Lock className="size-3.5" aria-hidden />
              {toggling ? "종료 중…" : "과제 종료"}
            </>
          ) : (
            <>
              <RotateCcw className="size-3.5" aria-hidden />
              {toggling ? "재개 중…" : "과제 재개"}
            </>
          )}
        </button>
        {/* 삭제 = 고스트 강등(저장 > 종료/재개 > 삭제 위계) */}
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden />
          {deleting ? "삭제 중…" : "삭제"}
        </button>
      </div>
    </div>
  );
}
