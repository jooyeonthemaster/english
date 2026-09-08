"use client";

// ============================================================================
// 레일 [학생] 탭 — **단일 학생 목록**(26-09-04 사용자 지시로 2섹션 통합).
//
// 지시 원문: "여기 학생이랑 여기 학생이랑 이렇게 구분할 필요가 있나? 그냥 정답
// 체크 완료, 미완료 태그로 분류만 해주는게 좋지 않아?"
// 종전엔 ①「등록됨」(ExamReportStudent 행)과 ②「아직 응시하지 않은 학생」(클래스
// 명단 잔여)이 **다른 섹션·다른 생김새**로 갈려 있었다. 강사에게 그 둘은 같은
// 「우리 반 학생」이고 다른 건 진행 상태뿐이다 — 그래서 한 목록으로 합치고 **상태
// 태그**로만 구분한다. 정렬은 진행 단계(할 일이 남은 학생이 위) → 이름.
//
// 행 골격은 지문관리 목록과 같은 관용구(사용자가 그 화면을 지목했다):
//   [체크박스][이름·점수·태그 (본문 클릭)][chevron | 링크 보내기]
// 체크는 하단 도크의 **픽바**로 이어진다(rail-student-pick-bar) — 선택 안에서
// 가능한 액션만 버튼이 된다. 두 id 공간이 섞이지 않도록 키에 접두를 붙인다:
//   `s:<examReportStudentId>` / `r:<studentId>`(아직 답안이 없는 학생).
//
// 상태 태그의 단일 소스는 classifyFunnelStudent(next-step.ts) — 도크가 세는 인원과
// 태그가 갈릴 수 없다. 답안이 아예 없는(행이 없는) 학생만 여기서 "none" 으로 친다.
// 계약 셀렉터: [data-rail-student-row="<id>"] · [data-rail-roster-row="<studentId>"]
//              · [data-rail-student-check="<key>"] · [data-rail-roster-issue]
// ============================================================================

import { useLayoutEffect, useRef } from "react";
import { Check, ChevronDown, Link2, Loader2, PencilLine } from "lucide-react";
import type { ExamRosterEntry } from "@/actions/exam-report";
import type {
  ExamAnalysisDetail,
  ExamAnalysisStudentRow,
} from "@/components/exam-report/ui-contracts";
import { classifyFunnelStudent } from "@/lib/exam-report/next-step";
import { round2 } from "@/lib/exam-report/grading";
import { cn } from "@/lib/utils";
import { RailRowLink } from "./rail-issued-links";
import { RailStudentExpand } from "./rail-student-expand";
import type { AnalysisConsoleApi } from "./use-analysis-console";
import type { RosterPhase } from "./use-analysis-roster";

/** 행 1개의 진행 상태 — 학생 행은 classifyFunnelStudent, 미등록은 "none". */
export type StudentStage =
  | "none"
  | "needLink"
  | "awaitingAnswer"
  | "needGrading"
  | "needReport"
  | "generating"
  | "needShare"
  | "shared"
  | "done";

/** 태그 자구·색 — 「정답 체크 완료/미완료」를 축으로, 그 앞뒤 단계까지 한 벌로. */
const STAGE_BADGE: Record<StudentStage, { label: string; className: string }> = {
  none: {
    label: "답안 없음",
    className: "bg-slate-50 text-slate-500 ring-slate-200/60",
  },
  needLink: {
    label: "링크 미발급",
    className: "bg-slate-50 text-slate-500 ring-slate-200/60",
  },
  awaitingAnswer: {
    label: "답안 기다리는 중",
    className: "bg-slate-50 text-slate-500 ring-slate-200/60",
  },
  needGrading: {
    label: "채점 미완료",
    className: "bg-amber-50 text-amber-700 ring-amber-200/60",
  },
  needReport: {
    label: "채점 완료",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  },
  generating: {
    label: "리포트 만드는 중",
    className: "bg-blue-50 text-blue-700 ring-blue-200/60",
  },
  needShare: {
    label: "리포트 완성",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  },
  shared: {
    label: "공유함",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  },
  done: {
    label: "완료",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  },
};

/** 목록 정렬 — 할 일이 남은 단계가 위(강사가 위에서부터 처리한다). */
const STAGE_ORDER: Record<StudentStage, number> = {
  needGrading: 0,
  needReport: 1,
  needShare: 2,
  awaitingAnswer: 3,
  needLink: 4,
  none: 5,
  generating: 6,
  shared: 7,
  done: 8,
};

/**
 * 이 학생이 **선택된 클래스 소속인가**(26-09-05 사용자 지적: "이 클래스 소속
 * 학생인지 아닌지는 구분이 필요하지 않을까?"). 목록을 합치면서 사라진 축이다 —
 * 종전엔 섹션이 갈려 있어 아래쪽은 곧 클래스 명단이었다.
 *  · inClass    — 이 클래스 명단에 있다(또는 명단에서 온 행)
 *  · otherClass — 학생 관리에는 있으나 이 클래스 명단에는 없다(다른 반·이동)
 *  · unlinked   — 학생 관리에 귀속되지 않은 행(studentId null — 구 자유입력 데이터)
 *  · unknown    — 클래스 미선택·명단 미적재라 **판정할 수 없다**(칩을 달지 않는다)
 */
export type ClassMembership = "inClass" | "otherClass" | "unlinked" | "unknown";

export interface UnifiedStudentRow {
  key: string;
  stage: StudentStage;
  membership: ClassMembership;
  name: string;
  /** 등록된 학생 행(없으면 아직 답안이 없는 클래스 학생) */
  student: ExamAnalysisStudentRow | null;
  roster: ExamRosterEntry | null;
}

/** 소속 칩 — 「이 반」은 기본값이라 그리지 않는다(예외만 말한다). */
const MEMBERSHIP_BADGE: Partial<
  Record<ClassMembership, { label: string; title: string }>
> = {
  otherClass: {
    label: "다른 반",
    title: "이 클래스 명단에 없는 학생이에요(다른 반이거나 반이 바뀐 학생)",
  },
  unlinked: {
    label: "명단 밖",
    title: "학생 관리에 등록되지 않은 학생이에요(이름만 등록된 예전 데이터)",
  },
};

/** 학생 행 + 클래스 명단 잔여 → 한 목록. 도크 픽바도 이 함수 결과를 쓴다. */
export function buildUnifiedRows(
  students: ReadonlyArray<ExamAnalysisStudentRow>,
  roster: ReadonlyArray<ExamRosterEntry> | null,
): UnifiedStudentRow[] {
  // 명단이 없으면(클래스 미선택·미적재) 소속을 **모른다** — 모르는 것을 「다른 반」
  // 으로 단정하면 전원에게 거짓 칩이 붙는다.
  const rosterIds = roster ? new Set(roster.map((r) => r.studentId)) : null;
  const rows: UnifiedStudentRow[] = students.map((s) => ({
    key: `s:${s.id}`,
    stage: classifyFunnelStudent(s) as StudentStage,
    membership:
      rosterIds == null
        ? "unknown"
        : s.studentId == null
          ? "unlinked"
          : rosterIds.has(s.studentId)
            ? "inClass"
            : "otherClass",
    name: s.studentName,
    student: s,
    roster: null,
  }));
  for (const entry of roster ?? []) {
    if (entry.reportStudentId != null) continue; // 이미 위 행으로 있다
    rows.push({
      key: `r:${entry.studentId}`,
      stage: "none",
      membership: "inClass",
      name: entry.name,
      student: null,
      roster: entry,
    });
  }
  return rows.sort(
    (a, b) =>
      STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] ||
      a.name.localeCompare(b.name, "ko"),
  );
}

/**
 * 목록 범위 필터(26-09-05 사용자 지시) — 기본은 **우리 반**이다.
 * 접는 것은 `otherClass`(이 클래스 명단에 없는 것이 **확인된** 학생)뿐이다:
 *  · `unlinked`(studentId 없음)는 소속을 **모르는** 것이라 접지 않는다 — 모르는 것을
 *    배제하면 이름만 등록된 예전 데이터(비INTERNAL 자유입력 행)가 통째로 사라진다.
 *  · `unknown`(클래스 미선택·명단 미적재)도 같은 이유로 접지 않는다.
 * 접힌 학생은 **사라지는 게 아니다** — 호출부가 「다른 반 N명」 줄과 [전체 보기]로
 * 한 클릭 거리에 남긴다(채점·리포트가 있는 행을 화면에서 잃지 않는 것이 상한선).
 */
export function filterRowsByScope(
  rows: ReadonlyArray<UnifiedStudentRow>,
  scope: "class" | "all",
): UnifiedStudentRow[] {
  return scope === "all"
    ? [...rows]
    : rows.filter((r) => r.membership !== "otherClass");
}

/**
 * 명단이 **아직 오는 중**인가(26-09-05 사용자 지적 "학생 3명이 됐다가 잠깐 있다가
 * 2명으로 바뀐다"). 클래스가 있는데 명단이 없으면 소속을 판정할 수 없어 다른 반
 * 행까지 전부 그렸다가(membership "unknown") 명단이 도착하는 순간 접힌다 — 탭 배지
 * 3→2, 목록 3행→2행 플래시. 캐시가 아니라 2단계 렌더가 원인이다. 이 창에서는 세지도
 * 그리지도 않는다(탭 배지 미표시 · 목록은 로딩 자리 · 범위 칩 숫자 미표시).
 * error 는 pending 이 아니다 — 판정 불가를 안고 전부 그리고 배너로 재시도를 준다.
 * 클래스가 없으면(허브·미선택) 명단 축 자체가 없으니 pending 도 없다.
 */
export function isRosterPending(
  classId: string | null,
  phase: RosterPhase,
): boolean {
  return !!classId && (phase === "idle" || phase === "loading");
}

export function RailStudentRows({
  rows,
  detail,
  isInternal,
  gateOpen,
  busyKey,
  onIssue,
  onManualEntry,
  console: api,
}: {
  rows: ReadonlyArray<UnifiedStudentRow>;
  /** null = 분석 행이 없는 **후보 화면**(학생 행이 존재할 수 없어 아코디언도 없다). */
  detail: ExamAnalysisDetail | null;
  isInternal: boolean;
  /** 정답·배점 검수 게이트 — 미완이면 링크 발급이 서버에서 막힌다(미리 잠금). */
  gateOpen: boolean;
  /** 진행 중인 행 작업 키 — `l:<row.key>`(링크) / `m:<row.key>`(직접 입력) */
  busyKey: string | null;
  /** OMR 링크 만들기·복사 — 행이 아직 없으면 담기까지 한 동작으로. */
  onIssue: (row: UnifiedStudentRow) => void;
  /**
   * 【26-09-05 사용자 지시】 "링크 생성하기 전에도 선생님이 직접 답안 입력할 수
   * 있는 기능이 가능하도록 해줘야지." — 아직 이 시험에 행이 없는 학생은 정오표
   * 자체가 없어서 손댈 수가 없었다. 이 버튼이 행을 만들고(무과금·링크 발급 없음)
   * 곧바로 정오표를 펼친다. 후보 화면(분석 행 자체가 없음)에서는 넘기지 않는다.
   */
  onManualEntry: (row: UnifiedStudentRow) => void;
  console: AnalysisConsoleApi;
}) {
  // ── 아코디언 전환 스크롤 앵커 보정(scrollIntoView 금지 — 조상 하이재킹) ──
  const anchorRef = useRef<{ key: string; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handleToggle = (studentId: string, el: HTMLElement) => {
    anchorRef.current = { key: studentId, top: el.getBoundingClientRect().top };
    api.toggleStudent(studentId);
  };
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchorRef.current = null;
    const scroller = rootRef.current?.closest<HTMLElement>(
      "[data-analysis-rail-scroll]",
    );
    const rowEl = rootRef.current?.querySelector<HTMLElement>(
      `[data-rail-student-row="${anchor.key}"]`,
    );
    if (!scroller || !rowEl) return;
    const delta = rowEl.getBoundingClientRect().top - anchor.top;
    if (delta !== 0) scroller.scrollTop += delta;
  }, [api.expandedStudentId]);

  // ── focusStudent(도크 CTA) 스크롤 보정 — 펼친 행을 스크롤러 상단으로 ──────
  useLayoutEffect(() => {
    const req = api.focusRequest;
    if (!req) return;
    const scroller = rootRef.current?.closest<HTMLElement>(
      "[data-analysis-rail-scroll]",
    );
    const rowEl = rootRef.current?.querySelector<HTMLElement>(
      `[data-rail-student-row="${req.studentId}"]`,
    );
    if (!scroller || !rowEl) return;
    const delta =
      rowEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += delta - 8;
  }, [api.focusRequest]);

  return (
    <div ref={rootRef} className="min-w-0 space-y-1">
      {rows.map((row) => {
        const picked = api.pickedStudentKeys.has(row.key);
        const expanded =
          row.student != null &&
          detail != null &&
          api.expandedStudentId === row.student.id;
        const badge = STAGE_BADGE[row.stage];
        const membershipBadge = MEMBERSHIP_BADGE[row.membership];
        // 방금 이 행에서 만든 링크 — 누른 자리 바로 아래에서 펴진다(26-09-05 지시).
        const issuedKey = row.student?.id ?? row.roster?.studentId ?? "";
        const issuedLink =
          api.issuedLinks.find((x) => x.studentId === issuedKey) ?? null;
        const score = row.student?.scoreSummary ?? null;
        return (
          <div key={row.key} className="min-w-0">
            <div
              data-rail-student-row={row.student?.id}
              data-rail-roster-row={row.roster?.studentId}
              className={cn(
                "group flex min-w-0 items-center border transition-colors",
                expanded
                  ? "rounded-t-lg border-blue-200 bg-blue-50"
                  : picked
                    ? "rounded-lg border-blue-300 bg-blue-50/60"
                    : "rounded-lg border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300",
                issuedLink && !expanded && "rounded-b-none border-blue-200",
              )}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={picked}
                aria-label={`${row.name} 선택`}
                data-rail-student-check={row.key}
                onClick={() => api.toggleStudentPick(row.key)}
                className="flex shrink-0 cursor-pointer items-center self-stretch py-2 pl-2 pr-1"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                    picked
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-white group-hover:border-blue-400",
                  )}
                >
                  {picked ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
              </button>

              <button
                type="button"
                aria-expanded={row.student ? expanded : undefined}
                onClick={(e) =>
                  row.student
                    ? handleToggle(row.student.id, e.currentTarget)
                    : api.toggleStudentPick(row.key)
                }
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-2 pr-1 text-left"
              >
                <span
                  className="min-w-0 truncate text-[12px] font-semibold text-slate-700"
                  title={row.name}
                >
                  {row.name}
                </span>
                {/* 점수는 **채점 확정분만** — 미확정 숫자는 성적으로 오독된다. */}
                {row.student?.gradingConfirmed && score?.totalScore != null ? (
                  <span
                    className="shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums text-slate-700"
                    title={`채점 확정 ${round2(score.totalScore)}점 / 만점 ${
                      score.maxScore != null ? round2(score.maxScore) : "미상"
                    }점`}
                  >
                    {round2(score.totalScore)}
                    <span className="ml-0.5 font-medium text-slate-400">
                      {" / "}
                      {score.maxScore != null ? round2(score.maxScore) : "—"}점
                    </span>
                  </span>
                ) : null}
                <span className="min-w-0 flex-1" aria-hidden="true" />
                {membershipBadge ? (
                  <span
                    title={membershipBadge.title}
                    className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"
                  >
                    {membershipBadge.label}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset",
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              </button>

              {/* ── 행 액션 — **모든 행에 처음부터 둘 다**(26-09-05 사용자 지시)
                  "여기에서 omr 링크 생성 버튼이랑 직접 입력 버튼을 그냥 처음부터
                   구현해버려." 종전엔 아직 답안이 없는 행에만 붙어 있어서, 링크를
                  이미 보낸 학생(답안 기다리는 중)에게 다시 보내거나 대신 입력하려면
                  펼쳐 들어가야 했다. 좁은 레일이라 아이콘 버튼 + 툴팁으로 둔다. */}
              <span className="flex shrink-0 items-center gap-1 self-stretch py-1 pl-1 pr-1.5">
                <button
                  type="button"
                  data-rail-row-manual={row.key}
                  disabled={busyKey != null || !gateOpen}
                  title="선생님이 이 학생 답을 직접 입력합니다"
                  aria-label={`${row.name} 답 직접 입력`}
                  onClick={() => onManualEntry(row)}
                  className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-default disabled:opacity-50"
                >
                  {busyKey === `m:${row.key}` ? (
                    <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <PencilLine className="size-3 shrink-0" aria-hidden="true" />
                  )}
                  직접 입력
                </button>
                <button
                  type="button"
                  data-rail-row-issue={row.key}
                  disabled={busyKey != null || !gateOpen}
                  title={
                    gateOpen
                      ? "모바일 OMR 링크를 만들어 복사합니다"
                      : "정답·배점 확인을 끝내야 링크를 보낼 수 있어요"
                  }
                  aria-label={`${row.name} OMR 링크 보내기`}
                  onClick={() => onIssue(row)}
                  className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md bg-blue-600 px-2 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:cursor-default disabled:opacity-50"
                >
                  {busyKey === `l:${row.key}` ? (
                    <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <Link2 className="size-3 shrink-0" aria-hidden="true" />
                  )}
                  OMR 링크
                </button>
                {/* 접힘 상태에는 화살표를 두지 않는다 — [직접 입력]이 「열린다」를
                    이미 말하고, 좁은 레일에서 그 20px 가 이름 자리다. 펼쳐졌을 때만
                    접기 화살표로 남긴다. */}
                {expanded ? (
                  <ChevronDown
                    className="size-3.5 shrink-0 rotate-180 text-blue-500"
                    aria-hidden="true"
                  />
                ) : null}
              </span>
            </div>

            {issuedLink ? (
              <RailRowLink
                link={issuedLink}
                onClose={() => api.dismissIssuedLink(issuedLink.studentId)}
              />
            ) : null}

            {expanded && row.student && detail ? (
              <div className="rounded-b-lg border border-t-0 border-blue-200 bg-white px-2.5 py-2">
                <RailStudentExpand
                  analysisId={detail.id}
                  analysisStatus={detail.status}
                  studentRow={row.student}
                  isInternal={isInternal}
                  examMap={detail.examMap}
                  console={api}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
