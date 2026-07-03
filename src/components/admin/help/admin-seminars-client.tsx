"use client";

import { useRef, useState, useTransition } from "react";
import {
  adminGetSeminarRequests,
  adminUpdateSeminarRequest,
  type AdminSeminarRequestView,
  type AdminSeminarRequestsResult,
} from "@/actions/admin-help-center";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { SEMINAR_STATUSES, SEMINAR_CHANNELS, statusOf, labelOf } from "@/lib/help-center";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { StatusBadge } from "@/components/help-center/status-badge";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { Search, Phone, Mail, CalendarClock, Save, Video } from "lucide-react";

const VALID_SEMINAR_STATUSES = new Set<string>([
  "ALL",
  ...SEMINAR_STATUSES.map((s) => s.value),
]);

// datetime-local(로컬 벽시계) ↔ 절대시각(UTC ISO) 변환. 예전엔 저장 시 타임존 없는
// 문자열을 그대로 서버로 보내고, 표시 땐 ISO를 slice(0,16)로 잘라 써서 프로덕션(UTC)
// 서버에서 관리자가 입력한 KST 시각이 9시간 어긋나 원장에게 잘못된 확정 일정이 노출됐다.
// 저장은 브라우저(관리자 타임존)에서 ISO로 변환해 보내고, 표시는 로컬 벽시계로 되돌린다.
function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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
  const [selectedId, setSelectedId] = useState<string | null>(
    initialData.items[0]?.id ?? null,
  );
  const [status, setStatus] = useState(
    initialStatus && VALID_SEMINAR_STATUSES.has(initialStatus) ? initialStatus : "ALL",
  );
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / initialData.pageSize));

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  // 편집 상태(선택된 신청 기준)
  const [memo, setMemo] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [editStatus, setEditStatus] = useState("");

  function select(r: AdminSeminarRequestView) {
    setSelectedId(r.id);
    setMemo(r.adminMemo ?? "");
    setScheduledAt(isoToDatetimeLocal(r.scheduledAt));
    setMeetingUrl(r.meetingUrl ?? "");
    setEditStatus(r.status);
  }

  function applyResult(data: AdminSeminarRequestsResult) {
    setRequests(data.items);
    setTotal(data.total);
    pageRef.current = data.page;
    setPage(data.page);
  }

  function reload(nextStatus = status, nextPage = pageRef.current) {
    startTransition(async () => {
      const data = await adminGetSeminarRequests({
        status: nextStatus,
        search: search || undefined,
        page: nextPage,
      });
      applyResult(data);
    });
  }

  function save() {
    if (!selected) return;
    startTransition(async () => {
      try {
        await adminUpdateSeminarRequest(selected.id, {
          status: editStatus || selected.status,
          adminMemo: memo,
          scheduledAt: datetimeLocalToIso(scheduledAt),
          meetingUrl: meetingUrl || null,
        });
        toast.success("저장되었습니다.");
        const data = await adminGetSeminarRequests({
          status,
          search: search || undefined,
          page: pageRef.current,
        });
        applyResult(data);
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  // 상세 편집 중(저장하지 않은 변경 존재)에는 자동 새로고침을 멈춰
  // 관리자가 읽거나 작성 중인 내용이 사라지지 않게 한다.
  const isEditingSelected =
    !!selected &&
    (memo !== (selected.adminMemo ?? "") ||
      scheduledAt !== isoToDatetimeLocal(selected.scheduledAt) ||
      meetingUrl !== (selected.meetingUrl ?? "") ||
      editStatus !== selected.status);

  // 목록은 10분마다 자동 새로고침. 선택한 신청은 selectedId로 유지되고
  // 편집 상태도 별도 상태라 읽는 도중에도 화면이 튀지 않는다.
  useAutoRefresh(() => reload(), { paused: isEditingSelected });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reload(status, 1)}
            placeholder="이름·학원·연락처 검색..."
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-[13px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "ALL", label: "전체" }, ...SEMINAR_STATUSES].map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setStatus(s.value);
                reload(s.value, 1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                status === s.value
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
        {/* List */}
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          {requests.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">신청 내역이 없습니다</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {requests.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => select(r)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors ${
                      selectedId === r.id ? "bg-blue-50/60" : "hover:bg-slate-50/70"
                    }`}
                  >
                    <StatusBadge status={statusOf(SEMINAR_STATUSES, r.status)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-gray-900 truncate">
                        {r.academyName || r.applicantName}
                        <span className="text-gray-400 font-normal"> · {r.applicantName}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {r.phone} · {formatDateTime(new Date(r.createdAt))}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AdminPagination
            page={page}
            totalPages={totalPages}
            disabled={isPending}
            onChange={(p) => reload(status, p)}
          />
        </div>

        {/* Detail editor */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 h-fit">
          {!selected ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              왼쪽에서 신청을 선택하세요
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-[15px] font-bold text-gray-900">
                  {selected.academyName || selected.applicantName}
                </div>
                <div className="text-[12px] text-gray-400">{selected.applicantName}</div>
              </div>

              <div className="space-y-1.5 text-[13px] text-gray-600">
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 text-gray-400" />
                  {selected.phone}
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-400">
                    {labelOf(SEMINAR_CHANNELS, selected.preferredChannel)} 희망
                  </span>
                </div>
                {selected.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="size-3.5 text-gray-400" />
                    {selected.email}
                  </div>
                )}
                {selected.preferredTimes && (
                  <div className="flex items-start gap-2">
                    <CalendarClock className="size-3.5 text-gray-400 mt-0.5" />
                    <span>선호 시간: {selected.preferredTimes}</span>
                  </div>
                )}
                {selected.topic && (
                  <div className="text-gray-500">주제: {selected.topic}</div>
                )}
              </div>

              {selected.message && (
                <div className="rounded-lg bg-slate-50 p-3 text-[13px] text-gray-600 whitespace-pre-wrap">
                  {selected.message}
                </div>
              )}

              <div className="border-t border-gray-50" />

              {/* Editable */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500">상태</label>
                <div className="flex flex-wrap gap-1.5">
                  {SEMINAR_STATUSES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setEditStatus(s.value)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                        editStatus === s.value
                          ? "border-slate-800 bg-slate-800 text-white"
                          : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500">확정 일정</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full h-9 rounded-xl border border-gray-200 px-3 text-[13px] outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 inline-flex items-center gap-1">
                  <Video className="size-3.5 text-gray-400" />
                  줌(Zoom) 링크
                </label>
                <input
                  type="url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://zoom.us/j/..."
                  className="w-full h-9 rounded-xl border border-gray-200 px-3 text-[13px] outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-gray-400">
                  입력하면 신청자가 1:1 세미나 신청에서 바로 접속할 수 있습니다.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500">운영자 메모</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  placeholder="내부 메모(고객에게 노출되지 않음)"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] resize-y outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={save}
                disabled={isPending}
                className="w-full h-9 rounded-xl bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <Save className="size-3.5" />
                저장
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
