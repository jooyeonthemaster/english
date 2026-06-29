"use client";

import { useState, useTransition } from "react";
import {
  adminGetSeminarRequests,
  adminUpdateSeminarRequest,
  type AdminSeminarRequestView,
} from "@/actions/admin-help-center";
import { SEMINAR_STATUSES, SEMINAR_CHANNELS, statusOf, labelOf } from "@/lib/help-center";
import { StatusBadge } from "@/components/help-center/status-badge";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { Search, Phone, Mail, CalendarClock, Save } from "lucide-react";

export function AdminSeminarsClient({
  initialRequests,
}: {
  initialRequests: AdminSeminarRequestView[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequests[0]?.id ?? null);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  // 편집 상태(선택된 신청 기준)
  const [memo, setMemo] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [editStatus, setEditStatus] = useState("");

  function select(r: AdminSeminarRequestView) {
    setSelectedId(r.id);
    setMemo(r.adminMemo ?? "");
    setScheduledAt(r.scheduledAt ? r.scheduledAt.slice(0, 16) : "");
    setEditStatus(r.status);
  }

  function reload(nextStatus = status) {
    startTransition(async () => {
      const data = await adminGetSeminarRequests({
        status: nextStatus,
        search: search || undefined,
      });
      setRequests(data);
    });
  }

  function save() {
    if (!selected) return;
    startTransition(async () => {
      try {
        await adminUpdateSeminarRequest(selected.id, {
          status: editStatus || selected.status,
          adminMemo: memo,
          scheduledAt: scheduledAt || null,
        });
        toast.success("저장되었습니다.");
        const data = await adminGetSeminarRequests({
          status,
          search: search || undefined,
        });
        setRequests(data);
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reload()}
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
                reload(s.value);
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
