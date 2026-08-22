"use client";

// ============================================================================
// 클래스 스튜디오 — 학생 탭 (docs/class-studio-spec.md §3.2 학생 탭)
//
// listStudioClassStudents 셀프 로드. md+ 는 테이블, 모바일은 카드 강등.
// 행: 이름 · 학생 코드(모노) · 최근 학습일 · 진행 요약 · 초대장 · 케밥(제외).
// 등록 성공 직후 해당 학생의 초대 키트 시트 자동 오픈(스펙 §3.2·§5).
// 코치마크 6번(invite)은 우상단 「+ 학생 등록」에 앵커 — 문구는 스펙 §4 정본.
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// 초대장 계열(행·카드 「초대장」 버튼·등록 직후 초대 키트 자동 오픈·InviteKitSheet·
// invite 코치마크)을 렌더하지 않고, 헤더 초대 티켓 토스트·빈 상태 카피는 초대장
// 없는 자구로 바꾼다. 학생 등록·명단·케밥(제외)은 무접촉. 코드 경로는 전부 존치 —
// 복구는 env 1줄(NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true).
// ============================================================================

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageCircle, MoreVertical, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  listStudioClassStudents,
  removeStudentFromStudioClass,
  type StudioStudentRow,
} from "@/actions/studio/students";
import { CoachMark } from "@/components/studio/coach";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  EMPTY_PRIMARY_BTN,
  EmptyState,
  HEADER_PRIMARY_BTN,
  SectionHeader,
} from "./section-header";
import { StudentAddModal } from "./student-add-modal";
import { InviteKitSheet } from "./invite-kit-sheet";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function progressText(row: StudioStudentRow): string {
  if (row.taskTotal === 0) return "아직 학습 전";
  return `과제 ${row.taskTotal}건 중 ${row.taskDone}건 완료`;
}

// ── 제외 확인 다이얼로그 ─────────────────────────────────────────────────────

function RemoveConfirmDialog({
  student,
  onClose,
  onConfirm,
  pending,
}: {
  student: StudioStudentRow;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="클래스에서 제외"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-bold text-slate-900">클래스에서 제외할까요?</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 break-keep">
          「{student.name}」 학생을 이 클래스에서 제외합니다. 학생 계정과 학습
          기록은 지워지지 않습니다.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="min-h-11 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? "제외하는 중…" : "제외하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 케밥 메뉴 (액션 1개 — 클래스에서 제외) ───────────────────────────────────

function RowKebab({ onRemove }: { onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  };

  // 터치 타깃 44px: 밀도 모드(body.smoat-large-ui)가 button.h-11 높이를 38px 로,
  // button 의 min-width 를 0 으로 !important 눌러 버린다. 높이는 min-h-11(규칙 대상
  // 아님), 폭은 w-11 + shrink-0 으로 잡아야 실제 44×44 가 남는다(실측 확인).
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="추가 작업"
        onClick={toggle}
        className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:h-8 lg:w-8 lg:min-h-0"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open &&
        coords &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="메뉴 닫기"
              className="fixed inset-0 z-[60] cursor-default"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-[61] w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              style={{ top: coords.top, right: coords.right }}
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
                className="w-full px-3 py-2 text-left text-[13px] text-rose-600 hover:bg-rose-50"
              >
                클래스에서 제외
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// ── 학생 탭 ──────────────────────────────────────────────────────────────────

export function StudentsTab({
  classId,
  inviteRequestId = 0,
}: {
  classId: string;
  /** 클래스 헤더 「학생 초대」 티켓 — 증가할 때마다 초대 동선을 이어서 연다(감사 L5-16) */
  inviteRequestId?: number;
}) {
  const [students, setStudents] = useState<StudioStudentRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteStudentId, setInviteStudentId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<StudioStudentRow | null>(null);
  const [removePending, startRemove] = useTransition();
  /** 처리 완료한 초대 티켓 번호 — 같은 티켓을 두 번 열지 않는다 */
  const handledInviteRef = useRef(0);

  const reload = useCallback(async () => {
    const res = await listStudioClassStudents(classId);
    if (!res.success) {
      setLoadError(res.error ?? "학생 목록을 불러오지 못했습니다.");
      return;
    }
    setLoadError(null);
    setStudents(res.data ?? []);
  }, [classId]);

  useEffect(() => {
    setStudents(null);
    void reload();
  }, [reload]);

  // ── 헤더 「학생 초대」 이어받기 (감사 L5-16) ──────────────────────────────
  // 티켓이 도착해도 목록이 아직 로딩 중일 수 있으므로 students 가 확정된 뒤에
  // 처리한다(같은 티켓은 ref 로 1회만). 0명 = 등록이 먼저 — 등록에 성공하면
  // 초대 키트가 자동으로 열린다. 1명 = 그 학생의 키트 즉시. 2명 이상 = 대상
  // 선택 안내(초대장은 학생 1명 단위라 헤더가 대신 고를 수 없다).
  // §M off 면 초대 키트 진입로가 전부 봉인되므로 1명 즉시 오픈도 막고, 토스트는
  // 초대장 언급 없는 학생 코드 안내로 대체한다.
  useEffect(() => {
    if (inviteRequestId === 0 || handledInviteRef.current === inviteRequestId) return;
    if (students === null) return;
    handledInviteRef.current = inviteRequestId;
    if (!SHOW_MOBILE) {
      // §M off — 헤더 버튼 라벨이 「학생 등록」이므로 티켓 = 등록 모달 직행.
      // 초대장 분기·안내 토스트는 전부 초대 동선 전용이라 여기서 끝낸다.
      setAddOpen(true);
      return;
    }
    if (students.length === 0) {
      setAddOpen(true);
      toast.info("학생을 등록하면 카톡으로 보낼 초대장이 자동으로 만들어집니다.");
      return;
    }
    if (students.length === 1) {
      setInviteStudentId(students[0].studentId);
      return;
    }
    toast.info("초대장을 보낼 학생의 「초대장」 버튼을 눌러 주세요.");
  }, [inviteRequestId, students]);

  const handleRemove = (row: StudioStudentRow) => {
    startRemove(async () => {
      const res = await removeStudentFromStudioClass({
        classId,
        studentId: row.studentId,
      });
      if (!res.success) {
        toast.error(res.error ?? "학생 제외에 실패했습니다.");
        return;
      }
      toast.success(`「${row.name}」 학생을 클래스에서 제외했습니다.`);
      setRemoveTarget(null);
      void reload();
    });
  };

  const loaded = students !== null;
  const empty = loaded && students.length === 0;

  return (
    <div>
      {/* 4탭 공통 섹션 헤더 — 지문 탭 규격 정본(라벨 text-xs slate-400·아이콘 없음).
          빈 상태에서는 헤더 CTA 를 숨기고 코치마크 6번 앵커를 빈 상태 박스로 넘긴다. */}
      <SectionHeader
        label={!loaded ? "불러오는 중…" : empty ? "학생" : `학생 ${students.length}명`}
        action={
          empty ? undefined : (
            <button
              type="button"
              data-coach="invite"
              onClick={() => setAddOpen(true)}
              className={HEADER_PRIMARY_BTN}
            >
              <Plus className="h-3.5 w-3.5" />
              학생 등록
            </button>
          )
        }
      />

      {/* 본문 */}
      {!loaded && !loadError && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-[13px] text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          학생 목록을 불러오는 중입니다
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
          {loadError}
          <button
            type="button"
            onClick={() => void reload()}
            className="ml-2 font-semibold underline underline-offset-2"
          >
            다시 시도
          </button>
        </div>
      )}

      {empty && (
        <EmptyState
          icon={UserRound}
          title="아직 등록된 학생이 없습니다"
          description={
            SHOW_MOBILE
              ? "학생을 등록하면 학생 코드가 자동으로 발급되고, 카톡으로 보낼 초대장이 함께 준비됩니다."
              : "학생을 등록하면 학생 코드가 자동으로 발급됩니다."
          }
          action={
            <button
              type="button"
              data-coach="invite"
              onClick={() => setAddOpen(true)}
              className={EMPTY_PRIMARY_BTN}
            >
              <Plus className="h-4 w-4" />
              학생 등록
            </button>
          }
        />
      )}

      {loaded && students.length > 0 && (
        <>
          {/* lg+ 테이블 (768~1023 태블릿은 카드로 강등 — 셀 중간 줄바꿈 방지) */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-semibold text-slate-400">
                  <th className="whitespace-nowrap px-4 py-2.5">이름</th>
                  <th className="whitespace-nowrap px-4 py-2.5">학생 코드</th>
                  <th className="whitespace-nowrap px-4 py-2.5">최근 학습일</th>
                  <th className="whitespace-nowrap px-4 py-2.5">진행 요약</th>
                  <th className="px-4 py-2.5 text-right">
                    <span className="sr-only">작업</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr
                    key={s.studentId}
                    className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50"
                  >
                    <td className="whitespace-nowrap break-keep px-4 py-3 font-semibold text-slate-900">
                      {s.name}
                    </td>
                    <td className="whitespace-nowrap break-keep px-4 py-3 font-mono text-[13px] tracking-wider text-slate-600">
                      {s.studentCode}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDay(s.lastStudyAt)}
                    </td>
                    <td
                      className={`px-4 py-3 ${
                        s.taskTotal === 0 ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      {progressText(s)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {/* §M off 면 초대장(모바일 학습 초대) 버튼 미렌더 — 케밥만 남는다 */}
                        {SHOW_MOBILE ? (
                          <button
                            type="button"
                            onClick={() => setInviteStudentId(s.studentId)}
                            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            초대장
                          </button>
                        ) : null}
                        <RowKebab onRemove={() => setRemoveTarget(s)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일·태블릿 카드 (~1023)
              감사 R3-13 — 전폭 「초대장」(358px)과 24px 케밥이 한 카드 안에서
              타깃 크기가 극단적으로 어긋났다. 두 액션을 같은 행에 같은 높이(44px)로 둔다. */}
          <div className="space-y-2.5 lg:hidden">
            {students.map((s) => (
              <div
                key={s.studentId}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {s.name}
                      </span>
                      <span className="font-mono text-xs tracking-wider text-slate-500">
                        {s.studentCode}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span className="text-slate-400">
                        최근 학습 {formatDay(s.lastStudyAt)}
                      </span>
                      <span
                        className={s.taskTotal === 0 ? "text-slate-400" : "text-slate-600"}
                      >
                        {progressText(s)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* §M off 면 초대장(모바일 학습 초대) 버튼 미렌더 — 케밥만 남는다 */}
                    {SHOW_MOBILE ? (
                      <button
                        type="button"
                        onClick={() => setInviteStudentId(s.studentId)}
                        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        초대장
                      </button>
                    ) : null}
                    <RowKebab onRemove={() => setRemoveTarget(s)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 코치마크 6번 — 학생 0 & 모달 닫힘 (문구 스펙 §4 정본).
          §M off 면 invite 스텝은 튜토리얼에서 배제(when 에 SHOW_MOBILE 결합) */}
      <CoachMark
        stepId="invite"
        when={SHOW_MOBILE && empty && !addOpen}
        text="학생을 등록하면 카톡으로 보낼 초대장이 자동으로 만들어집니다"
      />

      <StudentAddModal
        open={addOpen}
        classId={classId}
        onClose={() => setAddOpen(false)}
        onAdded={(studentId) => {
          void reload();
          // §M off 면 등록 성공 후 초대 키트 자동 오픈을 억제한다(시트도 미렌더).
          if (SHOW_MOBILE) setInviteStudentId(studentId);
        }}
        onAttached={() => void reload()}
      />

      {/* §M off 면 초대 키트 시트 미렌더 — 진입 트리거도 전부 봉인돼 도달 불가 */}
      {SHOW_MOBILE ? (
        <InviteKitSheet
          open={inviteStudentId !== null}
          studentId={inviteStudentId}
          onClose={() => setInviteStudentId(null)}
        />
      ) : null}

      {removeTarget && (
        <RemoveConfirmDialog
          student={removeTarget}
          pending={removePending}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => handleRemove(removeTarget)}
        />
      )}
    </div>
  );
}
