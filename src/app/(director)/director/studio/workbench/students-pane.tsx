"use client";

// ============================================================================
// 클래스 스튜디오 — 「학생 관리」 5번째 뷰 중앙 판 (26-09-02)
// 정본: docs/exam-analysis-v4-spec.md §1-6 · §2.5 U6 · §3 U6-4 · §4
//
// 본체 = 클래스 로스터 × 시험 리포트 현황. 행 클릭 = **우측 학생 상세 레일**
// (셸 소유 — student-detail-rail), [+ 학생 추가] = 레일 인라인 추가 폼(모달 0).
// 툴바는 시험 분석 판·지문관리와 **완전 동일 규격**(아이콘 칩 h-6 · 브레드크럼
// 12px · ml-auto 검색 팝오버 size-7 · 프라이머리 h-7).
//
// 데이터는 이 판이 페치하지 않는다 — 셸 훅 useStudioStudents 1인스턴스가 들고
// (aside·드로어 2중 마운트 규칙 §5) LibraryPane 을 거쳐 내려온다. 이 판은
// 로컬 검색어만 소유한다. 폴링 없음(뷰 진입·변이 후 재조회는 셸이 건다).
//
// 행 시각 = §4 「학생 관리 행」 토큰(1급 white 카드 + 선택 시 blue-400 테두리 —
// 카드 선택과 동일 개체). §U6-4 의 「divide-y 패널」 자구는 §4 가 행을 개별
// 카드로 확정하며 덮어썼다(선택 링은 개별 카드에서만 성립).
// 계약 셀렉터(프로브): [data-studio-students-pane] · [data-student-row="<id>"].
// ============================================================================

import { useMemo, useState } from "react";
import { Link2, Plus, Search, UserRoundPlus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { buildStudentAppLoginUrl } from "@/components/students/devices/student-app-share-row";
import type { StudioStudentExamRow } from "@/actions/studio/student-exams";
import {
  REPORT_BADGE,
  StatusBadge,
  copyWithToast,
  entryBadge,
  formatScore,
  gradeLabel,
  latestExam,
  summarizeStudents,
} from "./students-shared";

export interface StudioStudentsPaneProps {
  classId: string;
  /** view === "students" 가시 여부 — false→true 전이에 검색어를 초기화한다(페치는 셸). */
  active: boolean;
  activeStudentId: string | null;
  onSelectStudent: (id: string | null) => void;
  /** [+ 학생 추가] — 셸이 레일을 add 모드로 연다 */
  onRequestAdd: () => void;
  /** ── 셸 훅 useStudioStudents 산출(전부 상태 참조·원시값 — memo 방어선 무해) ── */
  rows: StudioStudentExamRow[];
  academyCode: string | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

const TOOLBAR_ICON_BTN =
  "relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** value null = 아직 집계할 데이터가 없다(로딩·오류) — 0 을 위조하지 않고 「—」 */
function SummaryChip({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2 text-[11px] text-slate-500 ring-1 ring-inset ring-slate-200/60">
      {label}
      <span className="font-semibold tabular-nums text-slate-700">
        {value ?? "—"}
      </span>
    </span>
  );
}

function StudentRow({
  row,
  active,
  academyCode,
  onSelect,
}: {
  row: StudioStudentExamRow;
  active: boolean;
  academyCode: string | null;
  onSelect: (id: string) => void;
}) {
  const latest = latestExam(row);
  const badge = latest ? REPORT_BADGE[latest.reportStatus] : null;
  const grading = latest ? entryBadge(latest) : null;
  const copyInvite = async () => {
    if (!academyCode) return;
    await copyWithToast(
      buildStudentAppLoginUrl(academyCode, row.studentCode),
      "초대 링크를 복사했습니다.",
    );
  };
  return (
    <div
      data-student-row={row.studentId}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border bg-white pr-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors",
        active
          ? "border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.55)]"
          : "border-slate-200 hover:border-slate-300",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(row.studentId)}
        aria-pressed={active}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 pl-3 text-left"
      >
        {/* 이름·코드·학년 */}
        <div className="flex w-36 min-w-0 shrink-0 flex-col gap-0.5">
          <span
            className="truncate text-[13px] font-semibold text-slate-900"
            title={row.name}
          >
            {row.name}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
            <span className="truncate font-mono tracking-wider">
              {row.studentCode}
            </span>
            <span aria-hidden className="h-2.5 w-px bg-slate-200" />
            <span className="shrink-0">{gradeLabel(row.grade)}</span>
          </span>
        </div>
        {/* 최근 시험 */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {latest ? (
            <>
              <span
                className="truncate text-[12px] text-slate-700"
                title={latest.title}
              >
                {latest.title}
              </span>
              <span className="truncate text-[11px] tabular-nums text-slate-400">
                {formatScore(latest)}
                {row.exams.length > 1 ? ` · 시험 ${row.exams.length}건` : ""}
              </span>
            </>
          ) : (
            <span className="text-[11.5px] text-slate-400">
              응시한 시험이 없습니다
            </span>
          )}
        </div>
        {grading ? (
          <StatusBadge tone={grading.tone}>{grading.label}</StatusBadge>
        ) : null}
        {badge ? (
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        ) : null}
      </button>
      <button
        type="button"
        onClick={() => void copyInvite()}
        disabled={!academyCode}
        title="초대 링크 복사"
        aria-label={`${row.name} 초대 링크 복사`}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-default disabled:opacity-40"
      >
        <Link2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function StudioStudentsPane({
  active,
  activeStudentId,
  onSelectStudent,
  onRequestAdd,
  rows,
  academyCode,
  loading,
  error,
  onReload,
}: StudioStudentsPaneProps) {
  const [query, setQuery] = useState("");
  // 뷰 재진입(active false→true)에 검색어 초기화 — 이전 렌더 값을 state 로 들고
  // 렌더 중 전이 판정(React 공식 「이전 props 저장」 관용구, effect 0·플래시 0).
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (active) setQuery("");
  }
  const summary = useMemo(() => summarizeStudents(rows), [rows]);
  // 로딩·오류 중엔 집계가 없다 — 「학생 0」 위조 대신 「—」(aria-busy 는 로딩만).
  const summaryReady = !loading && !error;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.studentCode.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div
      data-studio-students-pane
      data-active={active ? "true" : "false"}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white p-3"
    >
      <section className="flex min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        {/* 툴바 — 시험 분석 판·지문관리 행과 동일 규격(px-5 pt-3 pb-1.5) */}
        <div className="flex min-w-0 items-center gap-2 px-5 pt-3 pb-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="shrink-0 truncate text-[12px] font-medium text-slate-400">
              학생 관리 ·
            </span>
            <span className="shrink-0 truncate text-[12px] font-bold text-slate-900">
              클래스 학생 명단
            </span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Popover>
              <PopoverTrigger
                title="검색"
                aria-label="검색"
                className={TOOLBAR_ICON_BTN}
              >
                <Search className="size-3.5 shrink-0" />
                {query ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 right-1 inline-block size-1.5 rounded-full bg-blue-500"
                  />
                ) : null}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 p-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium text-slate-600">
                    검색
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      autoFocus
                      placeholder="이름 · 학생 코드 검색"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="h-8 w-full rounded-md border border-slate-200 bg-white pr-7 pl-7 text-[12px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="absolute top-1/2 right-1.5 inline-flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label="검색 지우기"
                      >
                        <X className="size-3" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={onRequestAdd}
              data-students-add
              title="학생 추가 — 기존 학생 연결 또는 새로 등록"
              aria-label="학생 추가 — 기존 학생 연결 또는 새로 등록"
              className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md bg-blue-600 px-2.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              학생 추가
            </button>
          </div>
        </div>

        {/* 요약 스트립 1줄 — 칩 4종 + 「링크 대기」(>0 일 때만)(학생 단위 집계,
            students-shared 정본 — 채점·링크 축은 next-step 과 같은 함수) */}
        <div
          className="flex min-w-0 flex-wrap items-center gap-1.5 px-5 pb-2.5"
          aria-busy={loading || undefined}
        >
          <SummaryChip label="학생" value={summaryReady ? summary.total : null} />
          <SummaryChip
            label="리포트 완성"
            value={summaryReady ? summary.reportDone : null}
          />
          <SummaryChip
            label="공유 대기"
            value={summaryReady ? summary.shareWaiting : null}
          />
          <SummaryChip
            label="채점 대기"
            value={summaryReady ? summary.gradingWaiting : null}
          />
          {summaryReady && summary.linkWaiting > 0 ? (
            <SummaryChip label="링크 대기" value={summary.linkWaiting} />
          ) : null}
        </div>

        {/* 본문 */}
        <div className="px-4 pb-4 sm:px-5">
          {loading ? (
            <div className="flex flex-col gap-1.5" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-lg border border-slate-100 bg-slate-50"
                />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-6 text-center">
              <p className="break-keep text-[12px] text-rose-600">{error}</p>
              <button
                type="button"
                onClick={onReload}
                className="inline-flex h-7 cursor-pointer items-center rounded-md border border-rose-200 bg-white px-2.5 text-[12px] font-semibold text-rose-600 transition-colors hover:bg-rose-50"
              >
                다시 불러오기
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-slate-50">
                <UserRoundPlus
                  className="size-6 text-slate-300"
                  aria-hidden="true"
                />
              </div>
              <p className="break-keep text-[12px] leading-relaxed text-slate-400">
                아직 이 클래스에 학생이 없습니다.
                <br />
                학생을 추가하면 초대 링크와 시험 리포트 현황이 여기에 표시됩니다.
              </p>
              <button
                type="button"
                onClick={onRequestAdd}
                className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-3 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                학생 추가
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-[12px] text-slate-400">
                「{query.trim()}」 에 해당하는 학생이 없습니다.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <X className="size-3" aria-hidden="true" />
                검색 지우기
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map((row) => (
                <StudentRow
                  key={row.studentId}
                  row={row}
                  active={row.studentId === activeStudentId}
                  academyCode={academyCode}
                  onSelect={onSelectStudent}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
