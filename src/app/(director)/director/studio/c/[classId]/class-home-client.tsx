"use client";

// ============================================================================
// 클래스 스튜디오 — 클래스 홈 클라이언트 (docs/class-studio-spec.md §3.0·§3.2·§3.3)
//
// 골격은 StudioShell(§3.0 공통 셸 — 시트 배경·본문 폭·브레드크럼·타이틀 행)이
// 제공한다: crumbs=클래스 스튜디오 › 클래스명, backHref=목록, 타이틀=인라인
// 이름 변경(연필), actions=학생 칩·학생 초대. 그 아래 4탭 바(?tab= 동기화,
// router.replace 로 새로고침에도 유지). 지문 탭만 이 파일 소유 — 행 카드 리스트·
// 상태 칩·케밥(등록 해제)·빈 상태·코치마크 2번(add-passage). 학생·결과·설정
// 탭은 각 유닛 파일을 임포트만 한다. 문구는 스펙 §3.2·§4 정본.
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// 「결과」 탭(모바일 학습 결과 표면)을 탭 바에서 렌더하지 않고, ?tab=results
// 직접 진입은 기본 탭(지문)으로 폴백한다 — UI 폴백만(TAB_IDS 타입·?tab= 저장
// 키·results-tab.tsx 무접촉, ResultsTab 렌더 분기는 도달 불가로 존치). 코드
// 경로는 전부 존치 — 복구는 env 1줄(NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true).
// ============================================================================

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Check,
  ChevronRight,
  MoreVertical,
  Pencil,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  renameStudioClass,
  type StudioClassHeader,
} from "@/actions/studio/classes";
import {
  listStudioClassPassages,
  removePassageFromStudioClass,
  type StudioPassageRow,
} from "@/actions/studio/passages";
import { CoachMark } from "@/components/studio/coach";
import { StudioShell } from "@/components/studio/shell";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { PassageAddModal } from "./passage-add-modal";
import {
  EMPTY_PRIMARY_BTN,
  EmptyState,
  HEADER_PRIMARY_BTN,
  SectionHeader,
} from "./section-header";
import { StudentsTab } from "./students-tab";
import { ResultsTab } from "./results-tab";
import { SettingsTab } from "./settings-tab";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

const TAB_IDS = ["passages", "students", "results", "settings"] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  passages: "지문",
  students: "학생",
  results: "결과",
  settings: "설정",
};

// §M off 면 「결과」 탭을 탭 바에서 제외한다 — TAB_IDS 타입·?tab= 키는 무접촉
// (UI 렌더만). on 이면 TAB_IDS 그대로여서 기존 탭 바와 동일하게 렌더된다.
const VISIBLE_TAB_IDS: readonly TabId[] = SHOW_MOBILE
  ? TAB_IDS
  : TAB_IDS.filter((id) => id !== "results");

function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

// ── 상태 칩 (분석됨 emerald soft / 분석 전 slate / 분석 중 blue pulse) ───────
//
// 감사 L4-03: 목록이 부분 분석 지문에 「분석 완료」를 달아 거짓말을 했다 — 지문을
// 열면 6섹션 중 일부가 비어 「분석하기 · N크레딧」이 살아 있다. 목록 액션
// (listStudioClassPassages)이 내려주는 것은 PRIME 보고서 존재 여부(analyzed)뿐이라
// 모듈 보유 개수를 알 수 없다. 그래서 **완료를 주장하지 않는** 「분석됨」으로
// 바꾸고(있다는 사실만 말한다), 정확한 모듈별 준비 상태는 툴팁으로 지문 스튜디오에
// 위임한다. 「부분 분석 N/7」까지 표기하려면 서버가 보유 섹션 수를 함께 내려야 한다
// (감독 요청 — 반환 스키마 uncertainties 참조). 임의 추론으로 개수를 만들지 않는다.

function StatusChip({ row }: { row: StudioPassageRow }) {
  if (row.analyzing) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
        분석 중
      </span>
    );
  }
  if (row.analyzed) {
    // 종량제 세계에서 "완료"는 전 모듈 사용 가능일 때만 참이다 — 부분 분석에 초록
    // 「분석 완료」를 달면 목록이 거짓말을 한다(감사 L4-03). 단위는 **모듈**이다:
    // 섹션 수로 쓰면 상세 화면이 보여주는 모듈 수와 어긋난다(재검증 렌즈 C).
    const full = row.readyModuleCount >= row.totalModuleCount;
    if (full) {
      return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
          <Check className="h-3 w-3" />
          분석 완료
        </span>
      );
    }
    return (
      <span
        title="일부 모듈만 분석되어 있습니다. 지문을 열면 모듈별 준비 상태와 남은 비용을 확인할 수 있습니다."
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
      >
        모듈 {row.readyModuleCount}/{row.totalModuleCount} 준비
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
      분석 전
    </span>
  );
}

// ── 지문 행 카드 ─────────────────────────────────────────────────────────────

function PassageRow({
  row,
  onOpen,
  onRemove,
}: {
  row: StudioPassageRow;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition hover:border-blue-300 hover:shadow-md hover:shadow-blue-50"
    >
      {/* 좌: 제목 + 메타 한 줄(상태 · 출처 · 배포 요약)
          감사 L4-19·L5-17·R3-15 — 넓은 화면에서 제목과 상태가 좌우 끝으로 갈라져
          400px 공백이 생기고, 폰·태블릿에서는 배포 요약이 통째로 숨겨졌다(hidden sm:block).
          정보를 제목 아래 한 줄로 모아 전 뷰포트에서 같은 값을 보여준다.
          레이아웃은 grid-cols-[…] 대신 flex — 밀도 모드가 폰(≤767)에서 임의값
          grid-cols 를 1열로 !important 접어 액션이 아래로 떨어진다(실측 확인). */}
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-semibold text-slate-900 break-keep">
          {row.title}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
          <StatusChip row={row} />
          <span className="max-w-full truncate">{row.source ?? "출처 미지정"}</span>
          {/* §M off 면 배포 자구를 중립화 — 수치는 기존 배포분 이력이라 그대로
              보여 준다(플래그 정본 주석 「기존 배포분은 그대로 동작」). */}
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap">
            {SHOW_MOBILE ? "배포" : "학습"} {row.deployCount}건
          </span>
          {row.lastDeployAt ? (
            <>
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">
                마지막 {SHOW_MOBILE ? "배포" : "학습"} {formatDay(row.lastDeployAt)}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* 우: 케밥(등록 해제) + 화살표 — 폰 44px 히트박스(감사 R3-13) */}
      <div className="flex shrink-0 items-center gap-0.5">
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label="지문 메뉴"
            onClick={() => setMenuOpen((v) => !v)}
            // hover 로만 드러나는 어포던스는 스크린샷·터치·키보드 어디에서도 안 보인다
            // (재검증 렌즈 C: "케밥이 데스크톱에서만 사라진다"). 상시 노출하되 색으로 낮춘다.
            className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-50 hover:text-slate-600 lg:h-8 lg:w-8 lg:min-h-0"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-[55]" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-[56] mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRemove();
                  }}
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  이 클래스에서 등록 해제
                </button>
              </div>
            </>
          ) : null}
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-500" />
      </div>
    </div>
  );
}

// ── 지문 탭 ──────────────────────────────────────────────────────────────────

function PassagesTab({
  classId,
  addOpen,
  onOpenAdd,
  rows,
  onReload,
}: {
  classId: string;
  addOpen: boolean;
  onOpenAdd: () => void;
  rows: StudioPassageRow[] | null;
  onReload: () => void;
}) {
  const router = useRouter();

  const openPassage = (passageId: string) =>
    router.push(`/director/studio/c/${classId}/p/${passageId}`);

  const removeRow = async (row: StudioPassageRow) => {
    const ok = window.confirm(
      `「${row.title}」 지문의 등록을 해제할까요?\n지문 자체는 내 자료에 그대로 남습니다.`,
    );
    if (!ok) return;
    const res = await removePassageFromStudioClass({ classId, passageId: row.passageId });
    if (!res.success) {
      toast.error(res.error ?? "지문 등록 해제에 실패했습니다.");
      return;
    }
    toast.success("지문 등록을 해제했습니다.");
    onReload();
  };

  const isEmpty = rows !== null && rows.length === 0;

  return (
    <div>
      {/* 4탭 공통 섹션 헤더 — 빈 상태에서는 헤더 CTA 를 숨겨 같은 화면에 동일 primary
          2개가 뜨는 것을 막는다(감사 L4-10·L1-11). 그때 코치마크 2번 앵커는 빈 상태
          박스의 「지문 등록」으로 옮겨 간다(앵커 소실 = 스텝 침묵이므로 반드시 이동). */}
      <SectionHeader
        label={rows === null ? "불러오는 중…" : isEmpty ? "지문" : `지문 ${rows.length}개`}
        action={
          isEmpty ? undefined : (
            <button
              type="button"
              data-coach="add-passage"
              onClick={onOpenAdd}
              className={HEADER_PRIMARY_BTN}
            >
              <Plus className="h-3.5 w-3.5" />
              지문 등록
            </button>
          )
        }
      />

      {rows === null ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[76px] animate-pulse rounded-xl border border-slate-100 bg-white"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookOpenText}
          title="이 클래스에서 사용할 지문을 등록해 주세요"
          action={
            <button
              type="button"
              data-coach="add-passage"
              onClick={onOpenAdd}
              className={EMPTY_PRIMARY_BTN}
            >
              <Plus className="h-4 w-4" />
              지문 등록
            </button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <PassageRow
              key={row.passageId}
              row={row}
              onOpen={() => openPassage(row.passageId)}
              onRemove={() => void removeRow(row)}
            />
          ))}
        </div>
      )}

      <CoachMark
        stepId="add-passage"
        when={rows !== null && rows.length === 0 && !addOpen}
        text="이 클래스에서 공부할 지문을 등록해 주세요. 내 자료·붙여넣기·AI 생성 모두 가능합니다"
      />
    </div>
  );
}

// ── 인라인 이름 변경 (셸 타이틀 슬롯에 들어간다 — 연필 아이콘 보존) ──────────

function ClassNameEditable({
  classId,
  name,
  onRenamed,
}: {
  classId: string;
  name: string;
  onRenamed: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      setDraft(name);
      return;
    }
    startTransition(async () => {
      const res = await renameStudioClass({ classId, name: trimmed });
      if (!res.success) {
        toast.error(res.error ?? "이름 변경에 실패했습니다.");
        setDraft(name);
      } else {
        toast.success("클래스 이름을 변경했습니다.");
        onRenamed(trimmed);
      }
      setEditing(false);
    });
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) commit();
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        maxLength={60}
        className="w-full max-w-xs rounded-lg border border-blue-300 bg-white px-2.5 py-1 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-100"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      title="클래스 이름 변경"
      className="group/name inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left hover:bg-slate-50"
    >
      <span className="truncate font-bold text-slate-900">{name}</span>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover/name:text-slate-500" />
    </button>
  );
}

// ── 클래스 홈 ────────────────────────────────────────────────────────────────

export function ClassHomeClient({
  header,
  initialTab,
}: {
  header: StudioClassHeader;
  initialTab: TabId;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(
    // §M off 면 ?tab=results 직접 진입을 기본 탭(지문)으로 폴백한다 — 탭 바에
    // 없는 결과 화면이 고아로 열리는 것을 막는다(UI 폴백만, URL 재작성 없음).
    SHOW_MOBILE || initialTab !== "results" ? initialTab : "passages",
  );
  const [name, setName] = useState(header.name);
  const [addOpen, setAddOpen] = useState(false);
  const [passageRows, setPassageRows] = useState<StudioPassageRow[] | null>(null);
  /** 헤더 「학생 초대」 요청 티켓 — 학생 탭이 학생 수를 보고 초대 키트/등록 모달로 잇는다 */
  const [inviteRequestId, setInviteRequestId] = useState(0);

  const loadPassages = useCallback(async () => {
    const res = await listStudioClassPassages(header.id);
    if (res.success) setPassageRows(res.data ?? []);
    else toast.error(res.error ?? "지문 목록을 불러오지 못했습니다.");
  }, [header.id]);

  useEffect(() => {
    void loadPassages();
  }, [loadPassages]);

  const switchTab = (next: TabId) => {
    // 학생 탭을 떠나면 초대 티켓을 소각한다 — 탭을 다시 눌러 재마운트될 때
    // 지난 티켓이 살아 있으면 누르지도 않은 초대 시트가 다시 열린다.
    if (next !== "students") setInviteRequestId(0);
    setTab(next);
    router.replace(`/director/studio/c/${header.id}?tab=${next}`, { scroll: false });
  };

  return (
    <StudioShell
      crumbs={[
        { label: "클래스 스튜디오", href: "/director/studio" },
        { label: name },
      ]}
      backHref="/director/studio"
      title={
        <ClassNameEditable classId={header.id} name={name} onRenamed={setName} />
      }
      actions={
        <>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
            <Users className="h-3 w-3" />
            학생 {header.studentCount}명
          </span>
          {/* 감사 L5-16 — 라벨은 초대를 약속하는데 동작은 탭 이동뿐이었다.
              탭 이동 + 초대 요청 티켓 발급으로 학생 탭이 실제 초대 키트(§5)까지 잇는다. */}
          <button
            type="button"
            onClick={() => {
              switchTab("students");
              setInviteRequestId((n) => n + 1);
            }}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 lg:min-h-0"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {/* §M off 면 초대장 표면이 전부 숨어 「초대」가 빈 약속이 된다 —
                티켓도 off 에선 등록 모달 직행(students-tab)이라 라벨을 맞춘다. */}
            {SHOW_MOBILE ? "학생 초대" : "학생 등록"}
          </button>
        </>
      }
    >
      {/* 탭 바 — §M off 면 「결과」 제외(VISIBLE_TAB_IDS), on 이면 TAB_IDS 동일 */}
      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {VISIBLE_TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTab(id)}
            className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3.5 py-2.5 text-[13px] font-semibold transition ${
              tab === id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </nav>

      {/* 탭 콘텐츠 */}
      <div className="mt-5">
        {tab === "passages" ? (
          <PassagesTab
            classId={header.id}
            addOpen={addOpen}
            onOpenAdd={() => setAddOpen(true)}
            rows={passageRows}
            onReload={() => void loadPassages()}
          />
        ) : tab === "students" ? (
          <StudentsTab classId={header.id} inviteRequestId={inviteRequestId} />
        ) : tab === "results" ? (
          <ResultsTab classId={header.id} onGoPassages={() => switchTab("passages")} />
        ) : (
          <SettingsTab classId={header.id} currentName={name} onRenamed={setName} />
        )}
      </div>

      <PassageAddModal
        classId={header.id}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => void loadPassages()}
      />
    </StudioShell>
  );
}
