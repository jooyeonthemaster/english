"use client";

import { useRef, useState, useTransition } from "react";
import { Presentation } from "lucide-react";
import {
  adminGetSeminarRequests,
  type AdminSeminarRequestView,
  type AdminSeminarRequestsResult,
} from "@/actions/admin-help-center";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  FilterBar,
  FilterChipGroup,
  ResultCount,
  SearchInput,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { SEMINAR_CHANNELS, SEMINAR_STATUSES, labelOf } from "@/lib/help-center";
import { cn, formatDateTime } from "@/lib/utils";
import { HelpStatusBadge } from "./help-status-badge";
import { SeminarEditDialog } from "./admin-seminars-client-parts/seminar-edit-dialog";
import { seminarRowDetail } from "./admin-seminars-client-parts/seminar-hover-detail";

const STATUS_FILTERS = [
  { key: "ALL", label: "전체" },
  ...SEMINAR_STATUSES.map((s) => ({ key: s.value, label: s.label })),
];
const VALID_SEMINAR_STATUSES = new Set(STATUS_FILTERS.map((s) => s.key));

export function AdminSeminarsClient({
  initialData,
  initialStatus,
}: {
  initialData: AdminSeminarRequestsResult;
  /** 대시보드 등에서 넘어올 때 초기 상태 필터 */
  initialStatus?: string;
}) {
  const [requests, setRequests] = useState(initialData.items);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const pageRef = useRef(initialData.page);
  const [status, setStatus] = useState(
    initialStatus && VALID_SEMINAR_STATUSES.has(initialStatus) ? initialStatus : "ALL",
  );
  // 검색: 표시값은 즉시, 서버 조회는 250ms 디바운스로 커밋(Enter·지우기는 즉시).
  const [searchInput, setSearchInput] = useState("");
  const searchRef = useRef("");
  const [isPending, startTransition] = useTransition();
  // 행 클릭으로 여는 편집 팝업(한 건).
  const [editing, setEditing] = useState<AdminSeminarRequestView | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / initialData.pageSize));

  function applyResult(data: AdminSeminarRequestsResult) {
    setRequests(data.items);
    setTotal(data.total);
    pageRef.current = data.page;
    setPage(data.page);
  }

  function reload(nextStatus = status, nextPage = pageRef.current, nextSearch = searchRef.current) {
    startTransition(async () => {
      const data = await adminGetSeminarRequests({
        status: nextStatus,
        search: nextSearch || undefined,
        page: nextPage,
      });
      applyResult(data);
    });
  }

  const { schedule, flush } = useSearchDebounce((value) => {
    const q = value.trim();
    if (q === searchRef.current) return;
    searchRef.current = q;
    reload(status, 1, q);
  });

  // 목록은 10분마다 자동 새로고침. 편집 팝업이 열려 있는 동안은 멈춰
  // 관리자가 읽거나 작성 중인 내용이 사라지지 않게 한다.
  useAutoRefresh(() => reload(), { paused: editing !== null });

  return (
    <div className="space-y-4">
      <FilterBar right={<ResultCount total={total} page={page} totalPages={totalPages} />}>
        <SearchInput
          value={searchInput}
          onChange={(v) => {
            setSearchInput(v);
            if (v === "") flush("");
            else schedule(v);
          }}
          onEnter={() => flush(searchInput)}
          placeholder="이름·학원·연락처 검색"
          ariaLabel="이름·학원·연락처 검색"
        />
        <FilterChipGroup
          options={STATUS_FILTERS}
          value={status}
          onChange={(next) => {
            setStatus(next);
            reload(next, 1);
          }}
          ariaLabel="상태 필터"
        />
      </FilterBar>

      <div
        className={cn(
          "overflow-hidden rounded-xl border border-gray-100 bg-white transition-opacity",
          isPending && "opacity-60",
        )}
      >
      <DataTable bare minWidth={760}>
        <DataTableHeader>
          <Tr>
            <Th>상태</Th>
            <Th>학원 · 신청자</Th>
            <Th>연락처</Th>
            <Th>희망 채널</Th>
            <Th>신청 시각</Th>
            <Th>확정 일정</Th>
          </Tr>
        </DataTableHeader>
        <DataTableBody>
          {requests.length === 0 ? (
            <DataTableEmpty colSpan={6}>
              <AdminEmptyState
                icon={Presentation}
                title="신청 내역이 없습니다"
                description={searchRef.current ? "검색어나 상태 필터를 바꿔 보세요." : undefined}
              />
            </DataTableEmpty>
          ) : (
            requests.map((r) => (
              // 호버=연락처·문의·메모 등 상세. 클릭=편집 팝업(행 자체의 클릭이라 click="none").
              <AdminHoverDetail
                key={r.id}
                title={r.academyName || r.applicantName}
                detail={seminarRowDetail(r)}
                click="none"
              >
                <Tr clickable onClick={() => setEditing(r)}>
                  <Td>
                    <HelpStatusBadge options={SEMINAR_STATUSES} value={r.status} />
                  </Td>
                  <Td>
                    <div className="truncate font-semibold text-gray-900">
                      {r.academyName || r.applicantName}
                    </div>
                    <div className="text-[12px] text-gray-400">{r.applicantName}</div>
                  </Td>
                  <Td className="tabular-nums">{r.phone}</Td>
                  <Td muted>{labelOf(SEMINAR_CHANNELS, r.preferredChannel)}</Td>
                  <Td muted className="tabular-nums">
                    {formatDateTime(new Date(r.createdAt))}
                  </Td>
                  <Td muted className="tabular-nums">
                    {r.scheduledAt ? formatDateTime(new Date(r.scheduledAt)) : "미정"}
                  </Td>
                </Tr>
              </AdminHoverDetail>
            ))
          )}
        </DataTableBody>
      </DataTable>
      <AdminPagination
        page={page}
        totalPages={totalPages}
        disabled={isPending}
        onChange={(p) => reload(status, p)}
      />
      </div>

      {editing && (
        <SeminarEditDialog
          key={editing.id}
          request={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
