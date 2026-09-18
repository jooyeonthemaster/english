"use client";

// 유입 분석 — 방문 여정. 한 사람이 어디서 와서 무엇을 보고 나갔는지.
//   AnalyticsToolbar + 학원 배너(academyId) + 학원명 검색 → useReport("sessions") → 세션 표 + 페이지네이션
//   행 클릭 → URL ?session=<id> → SessionDrawer(useReport("session")).
// 목록 전용 URL 파라미터: pageNo · q(학원명) · academyId · all(=1 기간 무시, academyId 있을 때만) · session
// (페이지 번호를 `page` 로 쓰면 공용 필터 「본 페이지」와 충돌한다 — 탭 이동 시 따라가고 필터 칩이 생김)

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { SessionListReport } from "@/lib/analytics/reports/sessions";
import { fmtInt } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { AnalyticsToolbar } from "../shared/analytics-toolbar";
import { ReportEmpty, ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { useReport } from "../shared/use-report";
import { AcademyBanner, useAcademyBrief } from "./academy-banner";
import { SessionDrawer } from "./session-drawer";
import { SessionsTable } from "./sessions-table";

const PAGE_SIZE = 50;
const DIGITS_RE = /^\d+$/;

export function SessionsView() {
  const { sharedQuery, includeInternal, update, get } = useAnalyticsParams();
  const pageNum = Number(get("pageNo"));
  const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1;
  const search = get("q") ?? "";
  const academyId = get("academyId");
  const allTime = !!academyId && get("all") === "1";
  const sessionId = get("session");
  /** 서버가 호환으로 받아 주는 옛 별칭(page=2). 화면에선 「본 페이지」 필터 칩이 되므로 pageNo 로 치환한다. */
  const legacyPage = get("page");

  const { data, error, isLoading, isFetching } = useReport<SessionListReport>("sessions", {
    params: { pageNo: page, pageSize: PAGE_SIZE, q: search || null, academyId, all: allTime ? "1" : null },
  });
  const { data: academy, isPending: academyPending } = useAcademyBrief(academyId);

  // 기간·필터가 바뀌면 1페이지로(전이 기반 — 값 비교라 StrictMode 이중 실행에도 안전)
  const prevShared = useRef(sharedQuery);
  useEffect(() => {
    if (prevShared.current === sharedQuery) return;
    prevShared.current = sharedQuery;
    if (page !== 1) update({ pageNo: null });
  }, [sharedQuery, page, update]);

  // 숫자뿐인 `page` 별칭 → pageNo 로 정규화(칩·탭 전파 방지). 경로 필터 값은 "/" 로 시작하므로 건드리지 않는다.
  // prevShared 를 미리 옮겨 두지 않으면 위 효과가 「필터가 바뀌었다」고 보고 1쪽으로 되돌린다(별칭이 조용히 죽는다).
  useEffect(() => {
    if (!legacyPage || !DIGITS_RE.test(legacyPage)) return;
    const shared = new URLSearchParams(sharedQuery);
    shared.delete("page");
    prevShared.current = shared.toString();
    update({ page: null, pageNo: Number(legacyPage) > 1 ? legacyPage : null });
  }, [legacyPage, sharedQuery, update]);

  // 범위 밖 페이지(?pageNo=40 인데 17쪽까지) → 1쪽으로. 두지 않으면 「40 / 17」·「837–837 / 837건」이 뜬다.
  const total = data?.total ?? null;
  const dataPageSize = data?.pageSize ?? PAGE_SIZE;
  useEffect(() => {
    if (total === null) return;
    const maxPage = Math.max(1, Math.ceil(total / dataPageSize));
    if (page > maxPage) update({ pageNo: null });
  }, [total, dataPageSize, page, update]);

  const openSession = useCallback((id: string) => update({ session: id }), [update]);
  const closeSession = useCallback(() => update({ session: null }), [update]);
  const commitSearch = useCallback((term: string) => update({ q: term || null, pageNo: null }), [update]);
  const showAcademy = useCallback(
    (id: string) => update({ academyId: id, all: "1", q: null, pageNo: null, session: null }),
    [update],
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const rowAcademyName = academyId ? (data?.rows.find((r) => r.academyId === academyId)?.academyName ?? null) : null;

  return (
    <div className="space-y-4">
      <AnalyticsToolbar hidePeriod={allTime} />

      {academyId && (
        <AcademyBanner
          academyId={academyId}
          academy={academy}
          isPending={academyPending}
          fallbackName={rowAcademyName}
          allTime={allTime}
          includeInternal={includeInternal}
          onUpdate={update}
        />
      )}

      <Section
        title="방문 세션"
        description={
          data
            ? `최신순 · 전체 ${fmtInt(data.total)}건 · 행을 누르면 방문 여정`
            : "최신순 · 행을 누르면 방문 여정"
        }
        right={<AcademySearch value={search} onCommit={commitSearch} />}
        bodyClassName="p-0"
      >
        {error && <ReportError message={error.message} className="m-5" />}
        {isLoading && !data && <ReportSkeleton rows={10} className="p-5" />}

        {data && (
          <div className={cn("transition-opacity", isFetching && "opacity-70")}>
            {data.rows.length === 0 ? (
              <div className="p-5">
                <ReportEmpty
                  message={
                    data.total > 0
                      ? "이 페이지에는 세션이 없습니다"
                      : search
                        ? `「${search}」 학원에 연결된 방문이 없습니다`
                        : academyId
                          ? allTime
                            ? "유입 추적 시작 이전에 가입한 학원은 방문 기록이 없습니다"
                            : "이 기간에 이 학원의 방문 기록이 없습니다"
                          : "조건에 맞는 방문이 없습니다"
                  }
                />
                {academyId && data.total === 0 && !includeInternal && (
                  <p className="mt-2 text-center text-[12px] text-gray-400">
                    내부 트래픽 포함을 켜면 관리자·로컬 방문도 보입니다
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {data.total > 0 && page > 1 && (
                    <EmptyAction onClick={() => update({ pageNo: null })}>첫 페이지로</EmptyAction>
                  )}
                  {academyId && !allTime && data.total === 0 && (
                    <EmptyAction onClick={() => update({ all: "1", pageNo: null })}>전체 기간 보기</EmptyAction>
                  )}
                  {academyId && data.total === 0 && !includeInternal && (
                    <EmptyAction onClick={() => update({ internal: "include", pageNo: null })}>
                      내부 트래픽 포함해서 보기
                    </EmptyAction>
                  )}
                </div>
              </div>
            ) : (
              <SessionsTable rows={data.rows} selectedId={sessionId} onOpen={openSession} />
            )}

            {data.total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 px-5 py-3 text-[12px] text-gray-500">
                <span className="tabular-nums">
                  {data.rows.length > 0
                    ? `${fmtInt((data.page - 1) * data.pageSize + 1)}–${fmtInt((data.page - 1) * data.pageSize + data.rows.length)} / ${fmtInt(data.total)}건`
                    : `표시 0건 / 전체 ${fmtInt(data.total)}건`}
                </span>
                <div className="flex items-center gap-1">
                  <PageButton disabled={page <= 1} onClick={() => update({ pageNo: page - 1 > 1 ? String(page - 1) : null })} label="이전 페이지">
                    <ChevronLeft className="size-4" aria-hidden />
                  </PageButton>
                  <span className="min-w-[72px] text-center tabular-nums">
                    {fmtInt(Math.min(page, totalPages))} / {fmtInt(totalPages)}
                  </span>
                  <PageButton disabled={page >= totalPages} onClick={() => update({ pageNo: String(page + 1) })} label="다음 페이지">
                    <ChevronRight className="size-4" aria-hidden />
                  </PageButton>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      <SessionDrawer sessionId={sessionId} onClose={closeSession} onSelectSession={openSession} onShowAcademy={showAcademy} />
    </div>
  );
}

/** 학원명 검색 — 입력 후 잠시 멈추면 URL(q)에 반영. 외부에서 q 가 바뀌면(해제 등) 입력칸도 따라간다. */
function AcademySearch({ value, onCommit }: { value: string; onCommit: (term: string) => void }) {
  const [draft, setDraft] = useState(value);
  /** 마지막으로 내보낸(또는 받아들인) 검색어 */
  const [committed, setCommitted] = useState(value);
  const [seenValue, setSeenValue] = useState(value);

  // URL q 변화 감지(렌더 중 파생 갱신): 내가 커밋한 값이 아니면 외부 변경 → 입력칸 동기화
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== committed) {
      setCommitted(value);
      setDraft(value);
    }
  }

  useEffect(() => {
    const term = draft.trim();
    if (term === committed) return;
    const timer = setTimeout(() => {
      setCommitted(term);
      onCommit(term);
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, committed, onCommit]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const term = draft.trim();
        setCommitted(term);
        onCommit(term);
      }}
      className="relative w-full sm:w-[240px]"
    >
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="연결 학원명 검색"
        aria-label="연결 학원명 검색"
        maxLength={100}
        className="h-8 w-full rounded-lg border border-gray-200 bg-white pr-2 pl-8 text-[12.5px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
      />
    </form>
  );
}

function PageButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function EmptyAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
    >
      {children}
    </button>
  );
}
