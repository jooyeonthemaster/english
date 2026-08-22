"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 좌측 클래스 레일 v3 (docs/class-studio-spec.md §3.10.2)
//
// 레일 = **배포 대상 선택기**(E2·E3, 2026-08-12): 클래스를 만들고 학생을
// 추가·초대하는 관리 동선에 더해, 클래스 단위·학생 개별 **체크**로 배포 대상을
// 좁힌다. 자료(지문)는 절대 표시하지 않는다(§3.1.1v2 계승).
//
// 가독성 정본(§3.10.2 — 구 h-8·12.5px 기각): 클래스 행 h-12 · 이름 13.5px
// 좌측정렬 + 서브라인 "학생 N명" · 학생 행 h-10 · 펼침 셰브론은 ChevronDown
// (접힘 0° / 펼침 rotate-180) 행 **우측 끝** 고정.
//
// 체크 의미론(§3.10.3 표시 개정 — 오케스트레이터 소유): 체크는 **작업(선택)
// 클래스에서만 유의미**하다. 비선택 클래스는 빈 체크박스로 표시하고, 클릭하면
// 그 클래스가 작업 클래스로 선택된다(전원 기본). 선택 클래스는 checkedByClass
// 엔트리 없음·로스터 미로드 = 전원으로 취급하고, 클릭 = 전원↔0 토글
// (onToggleClassAll). 학생 0명 클래스는 "none"(빈 박스, "0명 ☐" 표기).
// 체크 클릭은 행 선택과 독립(stopPropagation).
//
// 행 상호작용(v2.1 승계): 이름 클릭=선택(선택 행 재클릭=해제 — e.detail≥2 는
// 토글 제외, 더블클릭 rename 진입 직전 해제 방지) · 더블클릭=인라인 이름변경 ·
// 케밥(hover 노출 — 선택 행·터치 포인터는 상시)=학생 추가/이름 변경/보관 ·
// 선택 = bg-blue-100/70 + 좌측 3px 인디케이터 + 이름 text-blue-800.
// 학생 데이터(지연 로드·캐시·재조회)는 오케스트레이터 소유(studentsByClass),
// 이 파일은 프레젠테이션 + 행 로컬 상태(rename 입력·케밥 팝오버)만 가진다.
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// 학생 행 초대장 hover 버튼을 렌더하지 않고(hidden→flex 방식이라 잔재 없이
// 이름·코드 폭 자연 회복), 「배포 대상」 aria 자구 2곳을 중립 자구로 바꾼다.
// 체크박스 구조·동작은 무접촉(클래스 선택 UX 겸용 — 감독 결정)이고
// onInviteStudent prop 시그니처도 유지(호출부 무회귀). 코드 경로는 전부 존치 —
// 복구는 env 1줄(NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true).
// ============================================================================

import { memo, useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  Loader2,
  MessageCircle,
  Minus,
  MoreVertical,
  Pencil,
  Plus,
  UserRoundPlus,
} from "lucide-react";
import type { StudioClassRow } from "@/actions/studio/classes";
import type { StudioRosterRow } from "@/actions/studio/students";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

/** 클래스별 학생 목록 상태 — 미로드 | 로딩 | 실패 | 목록.
 *  §3.10.2 성능 개정: 레일은 슬림 로스터(이름·코드·id)만 소비한다 — 과제 집계가
 *  붙은 완전판(StudioStudentRow)은 학생 탭 소관. */
export type ClassStudentsState =
  | StudioRosterRow[]
  | "loading"
  | "error"
  | undefined;

export interface ClassTreeProps {
  classes: StudioClassRow[];
  /** null = 선택 없음(중앙은 단계 가이드) */
  selectedClassId: string | null;
  onSelect: (classId: string | null) => void;
  /**
   * 레일 내부 조작의 선택 보장(§3.10.12) — rename 진입 dblclick·비선택 클래스
   * 체크가 부른다. 명시적 onSelect 와 달리 **레일 자동 접힘을 발화하지 않는다**
   * (레일 안에서 계속 작업할 의도이므로 — 접으면 rename 입력째 소멸, 실측 결함).
   * 미전달이면 onSelect 폴백(구 호스트 무회귀).
   */
  onSelectQuiet?: (classId: string) => void;
  onCreate: () => void;
  onRename: (classId: string, name: string) => Promise<boolean>;
  onArchive: (cls: StudioClassRow) => void;
  /** 케밥·펼침 꼬리 행 「학생 추가」 — 오케스트레이터가 등록 모달(§3.2 재사용)을 연다 */
  onAddStudents: (cls: StudioClassRow) => void;
  /** 펼침 상태·학생 목록 — 데이터 소유는 오케스트레이터(지연 로드·캐시) */
  expanded: Record<string, boolean>;
  onToggleExpand: (classId: string) => void;
  studentsByClass: Record<string, ClassStudentsState>;
  /** 학생 행 초대장 — 오케스트레이터가 초대 키트 시트(§5)를 연다 */
  onInviteStudent: (studentId: string) => void;
  /** "error" 상태 재시도(강제 재조회) */
  onRetryStudents: (classId: string) => void;
  /** 배포 대상 체크(§3.10.3) — 엔트리 없음·로스터 미로드 = 전원 계약 */
  checkedByClass: Record<string, ReadonlySet<string>>;
  onToggleStudent: (classId: string, studentId: string) => void;
  /** 클래스 단위 전원↔0 토글 — 미로드 클래스도 콜백만 부른다(로드는 오케스트레이터) */
  onToggleClassAll: (classId: string) => void;
}

// ── 행 공통 시각 문법 ────────────────────────────────────────────────────────

function rowClass(selected: boolean): string {
  return [
    "group relative flex h-12 w-full items-center gap-2 rounded-lg px-2.5 text-left transition-colors",
    selected ? "bg-blue-100/70" : "hover:bg-slate-50",
  ].join(" ");
}

function SelectionBar({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span
      aria-hidden
      className="absolute inset-y-1 left-0 w-[3px] rounded-r bg-blue-600"
    />
  );
}

/** 클래스 행 트라이스테이트 체크박스 — button+아이콘(§3.9v2: native input 금지 계열) */
function ClassTriCheckbox({
  state,
  label,
  onToggle,
}: {
  state: "all" | "some" | "none";
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "some" ? "mixed" : state === "all"}
      aria-label={label}
      // 체크는 행 선택과 독립 — 더블클릭 rename 진입에도 섞이지 않게 차단
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      // transition-colors 금지: 배경 150ms 페이드와 아이콘 즉시 언마운트가
      // 어긋난다(§3.10 검수) — 배경·아이콘을 동기 전환한다.
      className={`flex size-[18px] shrink-0 items-center justify-center rounded border ${
        state === "none"
          ? "border-slate-300 bg-white hover:border-blue-400"
          : "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
      }`}
    >
      {state === "all" && <Check className="size-3.5" />}
      {state === "some" && <Minus className="size-3.5" />}
    </button>
  );
}

// ── 학생(자식) 행 — h-10(§3.10.2) ───────────────────────────────────────────

function StudentLeaf({
  row,
  checked,
  onToggleCheck,
  onInvite,
}: {
  row: StudioRosterRow;
  checked: boolean;
  onToggleCheck: () => void;
  onInvite: () => void;
}) {
  return (
    <div className="group/st flex h-10 w-full items-center gap-2 rounded-md pl-1 pr-1 transition-colors hover:bg-slate-50">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        // §M off 면 배포 자구 대신 중립 자구(체크 동작 자체는 무접촉)
        aria-label={
          SHOW_MOBILE ? `${row.name} 배포 대상` : `${row.name} 선택`
        }
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck();
        }}
        // transition-colors 금지 — 배경 페이드 vs 체크 아이콘 즉시 언마운트 어긋남 방지
        className={`flex size-4 shrink-0 items-center justify-center rounded border ${
          checked
            ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
            : "border-slate-300 bg-white hover:border-blue-400"
        }`}
      >
        {checked && <Check className="size-3" />}
      </button>
      {/* 이름 판독 1급(§3.10 검수): 좁은 레일(≈200px)에서도 이름 최소 64px 보장,
          압착은 학생 코드가 대신 받는다(min-w-0 + max-w + truncate). */}
      <span
        className="min-w-[64px] flex-1 truncate text-left text-[13px] font-medium text-slate-700"
        title={`${row.name} · ${row.studentCode}`}
      >
        {row.name}
      </span>
      {/* 코드는 **공간이 부족할 때만** 압착(min-w-0·max-w 하드 클램프 금지 —
          넓은 레일에서도 항상 잘리던 실측 결함). 이름(min-w-[64px])이 우선권. */}
      <span className="min-w-0 truncate font-mono text-[10.5px] tracking-wider text-slate-400">
        {row.studentCode}
      </span>
      {/* 초대장 — hover 전 자리 미점유(hidden→flex): opacity 방식은 투명 상태로도
          28px 를 점유해 좁은 레일에서 이름을 압착하던 원인이라 폐기.
          §M off 면 미렌더 — hidden→flex 라 잔재 없이 이름·코드 폭 자연 회복. */}
      {SHOW_MOBILE ? (
      <button
        type="button"
        aria-label={`${row.name} 초대장`}
        title="초대장"
        onClick={onInvite}
        className="hidden h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-blue-50 hover:text-blue-600 group-hover/st:flex pointer-coarse:flex"
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </button>
      ) : null}
    </div>
  );
}

// ── 클래스 행 (+ 펼침 자식 = 학생 체크 목록) ────────────────────────────────

function ClassRow({
  cls,
  selected,
  expanded,
  studentsState,
  checkedSet,
  onToggleSelect,
  onEnsureSelect,
  onToggleExpand,
  onRename,
  onArchive,
  onAddStudents,
  onInviteStudent,
  onRetryStudents,
  onToggleStudent,
  onToggleClassAll,
}: {
  cls: StudioClassRow;
  selected: boolean;
  expanded: boolean;
  studentsState: ClassStudentsState;
  /** 이 클래스의 체크 집합 — undefined = 전원(§3.10.3 기본 계약) */
  checkedSet: ReadonlySet<string> | undefined;
  /** 단일 클릭 — 선택/해제 토글 */
  onToggleSelect: () => void;
  /** 더블클릭(rename 진입) — 토글이 아니라 반드시 선택 상태로 */
  onEnsureSelect: () => void;
  onToggleExpand: () => void;
  onRename: (name: string) => Promise<boolean>;
  onArchive: () => void;
  onAddStudents: () => void;
  onInviteStudent: (studentId: string) => void;
  onRetryStudents: () => void;
  onToggleStudent: (studentId: string) => void;
  onToggleClassAll: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cls.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 케밥 팝오버 — 바깥 클릭으로 닫기(폴더 행 정본 관용구 축약)
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const commitRename = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === cls.name) {
      setDraft(cls.name);
      return;
    }
    const ok = await onRename(next);
    if (!ok) setDraft(cls.name);
  };

  // 체크 상태 파생(§3.10.3) — 로스터 미로드·엔트리 없음 = 전원.
  const roster = Array.isArray(studentsState) ? studentsState : null;
  const total = roster ? roster.length : cls.studentCount;
  const checkedCount = roster
    ? checkedSet === undefined
      ? roster.length
      : roster.reduce((n, s) => n + (checkedSet.has(s.studentId) ? 1 : 0), 0)
    : total;
  // 학생 0명 클래스는 "none"(빈 박스) — §3.10.3 표기 "0명 ☐" 정합("all" ✓ 금지).
  const checkState: "all" | "some" | "none" =
    total === 0 || checkedCount === 0
      ? "none"
      : checkedCount === total
        ? "all"
        : "some";

  return (
    <div>
      <div className={rowClass(selected)}>
        <SelectionBar on={selected} />
        {/* 트라이스테이트 체크박스 — 체크는 **작업 클래스에서만 유의미**(§3.10.3
            개정): 비선택 클래스는 빈 체크박스로 표시하고, 클릭하면 그 클래스가
            작업 클래스로 선택된다(전원 기본). 선택 클래스에서만 전원↔0 토글. */}
        <ClassTriCheckbox
          state={selected ? checkState : "none"}
          label={
            /* §M off 면 배포 자구 대신 작업 클래스 자구(동작 무접촉) */
            selected
              ? `${cls.name} 전원 선택`
              : SHOW_MOBILE
                ? `${cls.name} 배포 대상으로 선택`
                : `${cls.name} 작업 클래스로 선택`
          }
          onToggle={selected ? onToggleClassAll : onEnsureSelect}
        />
        {editing ? (
          <input
            autoFocus
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void commitRename();
              if (e.key === "Escape") {
                setDraft(cls.name);
                setEditing(false);
              }
            }}
            onBlur={() => void commitRename()}
            className="h-8 min-w-0 flex-1 rounded border border-blue-300 bg-white px-1.5 text-[13px] text-slate-900 outline-none ring-2 ring-blue-100"
          />
        ) : (
          <button
            type="button"
            // e.detail ≥ 2 = 더블클릭의 두 번째 클릭 — 토글로 처리하면 rename
            // 진입 직전에 선택이 풀리므로 스킵한다(토글은 순수 단일 클릭만).
            onClick={(e) => {
              if (e.detail >= 2) return;
              onToggleSelect();
            }}
            onDoubleClick={() => {
              onEnsureSelect();
              setDraft(cls.name);
              setEditing(true);
            }}
            // min-w-[64px]: 패널 최소폭(200px) 클램프 시에도 이름 4자+ 판독 보장
            // (전부 shrink-0 인 이웃에게 라벨이 전량 압착되던 과잉 절단 방지)
            className="flex min-w-[64px] flex-1 flex-col justify-center self-stretch text-left"
            title={selected ? `${cls.name} — 다시 클릭하면 선택 해제` : cls.name}
          >
            <span
              className={`block truncate text-[13.5px] font-bold leading-5 ${
                selected ? "text-blue-800" : "text-slate-800"
              }`}
            >
              {cls.name}
            </span>
            {/* 서브라인 = 대상 배지(§3.10.3): 전원 N명 / 일부 k/N명(파랑) /
                0명 0/N명(rose). 비선택 클래스는 체크가 무의미하므로 항상 N명. */}
            <span className="block truncate text-[11px] leading-4 text-slate-400 tabular-nums">
              학생{" "}
              {selected && checkState === "some" ? (
                <span className="font-semibold text-blue-700">
                  {checkedCount}/{total}명
                </span>
              ) : selected && checkState === "none" && total > 0 ? (
                <span className="font-semibold text-rose-600">0/{total}명</span>
              ) : (
                <>{total}명</>
              )}
            </span>
          </button>
        )}
        {!editing && (
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              aria-label={`${cls.name} 메뉴`}
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex h-7 w-7 items-center justify-center rounded text-slate-400 transition-opacity hover:bg-slate-200/60 hover:text-slate-600 ${
                menuOpen || selected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100"
              }`}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-30 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onAddStudents();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  <UserRoundPlus className="h-3.5 w-3.5 text-slate-400" />
                  학생 추가
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setDraft(cls.name);
                    setEditing(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5 text-slate-400" />
                  이름 변경
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onArchive();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-rose-600 hover:bg-rose-50"
                >
                  <Archive className="h-3.5 w-3.5" />
                  보관
                </button>
              </div>
            )}
          </div>
        )}
        {/* 펼침 셰브론 — ChevronDown, 행 우측 끝 고정(§3.10.2 "아래로 토글" 어포던스) */}
        <button
          type="button"
          aria-label={expanded ? "접기" : "펼치기"}
          aria-expanded={expanded}
          onClick={onToggleExpand}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600"
        >
          <ChevronDown
            className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* 자식 = 학생 체크 목록(지연 로드) + 꼬리 「학생 추가」 행 — pl-4 들여쓰기 + 세로 가이드 */}
      {expanded && (
        <div className="ml-[19px] mt-0.5 space-y-px border-l border-slate-200 pb-1 pl-4">
          {studentsState === "loading" || studentsState === undefined ? (
            <div className="flex h-10 items-center gap-2 text-[11px] text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              불러오는 중…
            </div>
          ) : studentsState === "error" ? (
            <button
              type="button"
              onClick={onRetryStudents}
              className="flex h-10 w-full items-center rounded-md px-1 text-left text-[11px] text-rose-500 transition-colors hover:bg-rose-50/60"
            >
              학생 목록을 불러오지 못했습니다 — 다시 시도
            </button>
          ) : (
            <>
              {studentsState.length === 0 ? (
                <p className="flex h-10 items-center text-[11px] text-slate-400">
                  등록된 학생이 없습니다
                </p>
              ) : (
                studentsState.map((s) => (
                  <StudentLeaf
                    key={s.studentId}
                    row={s}
                    // 체크는 작업 클래스에서만 유의미(§3.10.3 개정) — 비선택
                    // 클래스는 빈 체크박스, 클릭 = 그 클래스 선택(전원 기본).
                    // 선택 클래스에서 엔트리 없음 = 전원 체크(기본 계약).
                    checked={
                      selected &&
                      (checkedSet === undefined || checkedSet.has(s.studentId))
                    }
                    onToggleCheck={
                      selected
                        ? () => onToggleStudent(s.studentId)
                        : onEnsureSelect
                    }
                    onInvite={() => onInviteStudent(s.studentId)}
                  />
                ))
              )}
              <button
                type="button"
                onClick={onAddStudents}
                className="flex h-9 w-full items-center gap-1.5 rounded-md pl-1 pr-2 text-left text-[12.5px] font-semibold text-blue-600 transition-colors hover:bg-blue-50/60"
              >
                <Plus className="h-3.5 w-3.5" />
                학생 추가
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── 레일 본체 ────────────────────────────────────────────────────────────────
// memo: 오케스트레이터는 큐 폴링(5초)마다 리렌더된다 — 레일 props(상태 객체·
// useCallback 핸들러)는 그때 불변이므로 여기서 재렌더를 끊는다(전역 버벅임 수술).
// checkedByClass 는 토글 시에만 참조가 바뀌는 상태 객체 그대로 받는다(§3.10.9).

function ClassTreeInner({
  classes,
  selectedClassId,
  onSelect,
  onSelectQuiet,
  onCreate,
  onRename,
  onArchive,
  onAddStudents,
  expanded,
  onToggleExpand,
  studentsByClass,
  onInviteStudent,
  onRetryStudents,
  checkedByClass,
  onToggleStudent,
  onToggleClassAll,
}: ClassTreeProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 헤더 — SectionTitle 규약 + 새 클래스 아이콘 버튼 */}
      <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2.5">
        <h3 className="text-[11px] font-bold tracking-wide text-slate-500">클래스</h3>
        <button
          type="button"
          aria-label="새 클래스"
          title="새 클래스"
          onClick={onCreate}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {classes.length === 0 ? (
          <p className="px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-400 break-keep">
            아직 클래스가 없습니다. 아래 버튼으로 첫 클래스를 만들어 주세요.
          </p>
        ) : (
          classes.map((c) => (
            <ClassRow
              key={c.id}
              cls={c}
              selected={selectedClassId === c.id}
              expanded={Boolean(expanded[c.id])}
              studentsState={studentsByClass[c.id]}
              checkedSet={checkedByClass[c.id]}
              onToggleSelect={() =>
                onSelect(selectedClassId === c.id ? null : c.id)
              }
              onEnsureSelect={() => (onSelectQuiet ?? onSelect)(c.id)}
              onToggleExpand={() => onToggleExpand(c.id)}
              onRename={(name) => onRename(c.id, name)}
              onArchive={() => onArchive(c)}
              onAddStudents={() => onAddStudents(c)}
              onInviteStudent={onInviteStudent}
              onRetryStudents={() => onRetryStudents(c.id)}
              onToggleStudent={(studentId) => onToggleStudent(c.id, studentId)}
              onToggleClassAll={() => onToggleClassAll(c.id)}
            />
          ))
        )}
      </nav>

      {/* 하단 고정 — 새 클래스 (코치마크 1번 앵커, §4 개정) */}
      <div className="shrink-0 border-t border-slate-200 p-2">
        <button
          type="button"
          data-coach="create-class"
          onClick={onCreate}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />새 클래스
        </button>
      </div>
    </div>
  );
}

export const ClassTree = memo(ClassTreeInner);
