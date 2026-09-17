"use client";

import { useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  Copy,
  Download,
  Mail,
  Phone,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AdminGroupSeminarDetail,
  AdminGroupSeminarRegistrationView,
} from "@/actions/admin-help-center";
import { FilterChip, FilterChipGroup, StatusBadge } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { labelOf as labelOfStatusMap, statusOf as statusOfStatusMap } from "@/lib/admin-labels";
import { GROUP_SEMINAR_REG_STATUSES, statusOf } from "@/lib/help-center";
import { cn, formatDateTime } from "@/lib/utils";
import { HelpStatusBadge } from "../help-status-badge";
import {
  copyText,
  DEPOSIT_ACTIONS,
  DEPOSIT_STATUS,
  type DepositStatus,
  type RegStatus,
} from "./group-seminar-form";

// 신청자 패널(참석일 필터 · 상태 요약 · CSV · 카드별 펼침).

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "세미나";
}
function csvCell(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const CSV_HEADER = [
  "이름",
  "학원",
  "연락처",
  "이메일",
  "인원",
  "참석일",
  "상태",
  "신청일시",
  "보증금상태",
  "보증금액",
  "입금자명",
  "환급은행",
  "환급계좌",
  "예금주",
  "입금확인",
  "환급완료",
  "메시지",
] as const;

function registrationToCsvRow(r: AdminGroupSeminarRegistrationView): string[] {
  return [
    r.applicantName,
    r.academyName ?? "",
    r.phone,
    r.email ?? "",
    String(r.headCount),
    r.selectedDate ? formatDateTime(new Date(r.selectedDate)) : "",
    statusOf(GROUP_SEMINAR_REG_STATUSES, r.status).label,
    formatDateTime(new Date(r.createdAt)),
    r.depositStatus === "NONE" ? "" : labelOfStatusMap(DEPOSIT_STATUS, r.depositStatus),
    r.depositAmount != null ? String(r.depositAmount) : "",
    r.depositorName ?? "",
    r.refundBankName ?? "",
    r.refundAccountNumber ?? "",
    r.refundAccountHolder ?? "",
    r.depositPaidAt ? formatDateTime(new Date(r.depositPaidAt)) : "",
    r.depositRefundedAt ? formatDateTime(new Date(r.depositRefundedAt)) : "",
    r.message ?? "",
  ];
}

export function RegistrationsPanel({
  detail,
  isPending,
  onRegStatus,
  onDepStatus,
}: {
  detail: AdminGroupSeminarDetail;
  isPending: boolean;
  onRegStatus: (regId: string, status: RegStatus) => void;
  onDepStatus: (regId: string, status: DepositStatus) => void;
}) {
  const [dateFilter, setDateFilter] = useState<string>("ALL"); // "ALL" | "NONE" | ISO

  const sessionDates = detail.sessionDates ?? [];
  const showDateFilter = sessionDates.length > 1;
  const hasUnassigned = detail.registrations.some((r) => !r.selectedDate);

  const filtered = detail.registrations.filter((r) => {
    if (dateFilter === "ALL") return true;
    if (dateFilter === "NONE") return !r.selectedDate;
    return r.selectedDate === dateFilter;
  });

  // 상태별 집계(전체 기준).
  const statusCounts = GROUP_SEMINAR_REG_STATUSES.map((s) => ({
    ...s,
    count: detail.registrations.filter((r) => r.status === s.value).length,
  }));

  function downloadCsv() {
    if (filtered.length === 0) {
      toast.error("내보낼 신청자가 없습니다.");
      return;
    }
    const rows = [[...CSV_HEADER], ...filtered.map(registrationToCsvRow)];
    const csv = rows.map((cols) => cols.map(csvCell).join(",")).join("\r\n");
    // BOM(﻿)을 붙여 엑셀에서 한글이 깨지지 않게 한다.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix =
      dateFilter === "ALL"
        ? ""
        : dateFilter === "NONE"
          ? "_참석일미지정"
          : `_${formatDateTime(new Date(dateFilter)).replace(/[:\s]/g, "")}`;
    a.download = `${sanitizeFileName(detail.title)}_신청자${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length}명 CSV를 내려받았습니다.`);
  }

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-gray-700">
          <Users className="size-4 shrink-0 text-gray-400" strokeWidth={2} aria-hidden />
          <span className="truncate">
            신청자 {detail.registeredCount}명
            {detail.capacity != null ? ` / 정원 ${detail.capacity}명` : ""}
          </span>
        </div>
        {detail.registrations.length > 0 && (
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="size-3.5" strokeWidth={2} />
            CSV
          </Button>
        )}
      </div>

      {detail.registrations.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
          {statusCounts.map((s, i) => (
            <span key={s.value} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-gray-300">·</span>}
              {s.label} <b className="tabular-nums text-gray-800">{s.count}</b>
            </span>
          ))}
        </div>
      )}

      {detail.registrations.length === 0 ? (
        <p className="text-[12px] text-gray-400">아직 신청자가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {showDateFilter && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-400">참석일</span>
              <FilterChip active={dateFilter === "ALL"} onClick={() => setDateFilter("ALL")} label="전체" />
              {sessionDates.map((d) => (
                <FilterChip
                  key={d}
                  active={dateFilter === d}
                  onClick={() => setDateFilter(d)}
                  label={formatDateTime(new Date(d))}
                />
              ))}
              {hasUnassigned && (
                <FilterChip
                  active={dateFilter === "NONE"}
                  onClick={() => setDateFilter("NONE")}
                  label="미지정"
                />
              )}
            </div>
          )}

          <div className="space-y-2 lg:max-h-[58vh] lg:overflow-y-auto lg:pr-1">
            {filtered.length === 0 ? (
              <p className="text-[12px] text-gray-400">해당 참석일의 신청자가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((r) => (
                  <RegistrationCard
                    key={r.id}
                    r={r}
                    isPending={isPending}
                    onRegStatus={onRegStatus}
                    onDepStatus={onDepStatus}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const REG_STATUS_OPTIONS = GROUP_SEMINAR_REG_STATUSES.map((s) => ({
  key: s.value as RegStatus,
  label: s.label,
}));
const DEPOSIT_STATUS_OPTIONS = DEPOSIT_ACTIONS.map((a) => ({ key: a.key, label: a.label }));

/** 신청자 카드 — 접힌 요약(이름·인원·참석일·상태), 펼치면 연락처·메시지·상태변경·보증금. */
function RegistrationCard({
  r,
  isPending,
  onRegStatus,
  onDepStatus,
}: {
  r: AdminGroupSeminarRegistrationView;
  isPending: boolean;
  onRegStatus: (regId: string, status: RegStatus) => void;
  onDepStatus: (regId: string, status: DepositStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasDeposit = r.depositStatus !== "NONE";

  return (
    <li
      className={cn(
        "rounded-xl border",
        r.status === "CANCELED" ? "border-rose-200 bg-rose-50/50" : "border-gray-100",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-2 p-3 text-left"
      >
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-gray-900">
            <StatusBadge
              status={
                r.isGuest
                  ? { label: "비회원", tone: "amber" }
                  : { label: "회원", tone: "blue" }
              }
              className="mr-1.5 h-5 align-middle"
            />
            {r.applicantName}
            {r.academyName && <span className="font-normal text-gray-400"> · {r.academyName}</span>}
            <span className="font-normal text-gray-400"> · {r.headCount}명</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
            {r.selectedDate && (
              <span className="inline-flex items-center gap-1 font-semibold text-violet-600">
                <CalendarClock className="size-3" strokeWidth={2} aria-hidden />
                참석일 {formatDateTime(new Date(r.selectedDate))}
              </span>
            )}
            {hasDeposit && (
              <StatusBadge
                status={{
                  label: `보증금 ${labelOfStatusMap(DEPOSIT_STATUS, r.depositStatus)}`,
                  tone: statusOfStatusMap(DEPOSIT_STATUS, r.depositStatus).tone,
                }}
                className="h-5"
              />
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <HelpStatusBadge options={GROUP_SEMINAR_REG_STATUSES} value={r.status} />
          <ChevronDown
            className={cn("size-4 text-gray-400 transition-transform", open && "rotate-180")}
            strokeWidth={2}
            aria-hidden
          />
        </div>
      </button>

      {open && (
        <div
          className={cn(
            "space-y-2 border-t border-gray-100 p-3 pt-2.5 transition-opacity",
            isPending && "opacity-60",
          )}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3" strokeWidth={2} aria-hidden />
              {r.phone}
            </span>
            {r.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3" strokeWidth={2} aria-hidden />
                {r.email}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" strokeWidth={2} aria-hidden />
              신청 {formatDateTime(new Date(r.createdAt))}
            </span>
          </div>
          {r.message && <p className="whitespace-pre-wrap text-[12px] text-gray-500">{r.message}</p>}

          <FilterChipGroup
            options={REG_STATUS_OPTIONS}
            value={r.status as RegStatus}
            onChange={(next) => {
              if (isPending || next === r.status) return;
              onRegStatus(r.id, next);
            }}
            ariaLabel="신청 상태"
          />

          {hasDeposit && (
            <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-gray-700">
                  보증금{" "}
                  {r.depositAmount != null ? `${r.depositAmount.toLocaleString("ko-KR")}원` : ""}
                </span>
                <StatusBadge map={DEPOSIT_STATUS} value={r.depositStatus} />
              </div>
              <div className="space-y-0.5 text-[11px] text-gray-500">
                {r.depositorName && <div>입금자명: {r.depositorName}</div>}
                {(r.refundBankName || r.refundAccountNumber) && (
                  <div className="flex items-center gap-1.5">
                    <span>
                      환급계좌: {r.refundBankName} {r.refundAccountNumber}
                      {r.refundAccountHolder ? ` (${r.refundAccountHolder})` : ""}
                    </span>
                    {r.refundAccountNumber && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        title="계좌번호 복사"
                        onClick={() => copyText(r.refundAccountNumber!, "환급 계좌번호를 복사했습니다.")}
                      >
                        <Copy className="size-2.5" strokeWidth={2} />
                        복사
                      </Button>
                    )}
                  </div>
                )}
                {r.depositPaidAt && <div>입금확인 {formatDateTime(new Date(r.depositPaidAt))}</div>}
                {r.depositRefundedAt && (
                  <div>환급완료 {formatDateTime(new Date(r.depositRefundedAt))}</div>
                )}
              </div>
              <FilterChipGroup
                options={DEPOSIT_STATUS_OPTIONS}
                value={r.depositStatus as DepositStatus}
                onChange={(next) => {
                  if (isPending || next === r.depositStatus) return;
                  onDepStatus(r.id, next);
                }}
                ariaLabel="보증금 상태"
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
