"use client";

import { BookOpen, CalendarClock, Clock, Gift, MapPin, Presentation } from "lucide-react";
import { AdminDialog } from "@/components/admin/kit";
import { StatusBadge } from "@/components/help-center/status-badge";
import { GROUP_SEMINAR_STATUSES, statusOf } from "@/lib/help-center";
import { datetimeLocalToIso, formatDateTime } from "@/lib/utils";
import type { FormState } from "./group-seminar-form";

// 저장 전 확인용 미리보기 — 사용자 화면(group-seminar-browse-client)의 Hero 를 폼 값으로 재현한다.
// 안쪽 마크업은 "사용자 화면 그대로"가 목적이라 그쪽 색(slate·border/card 토큰)을 유지한다.
export function SeminarPreviewDialog({
  form,
  open,
  onOpenChange,
}: {
  form: FormState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sessionDates = form.sessionDates
    .map(datetimeLocalToIso)
    .filter((v): v is string => !!v);
  const capacity = form.capacity ? Number(form.capacity) : null;
  const durationMin = form.durationMin ? Number(form.durationMin) : null;
  const durationLabel =
    durationMin && durationMin > 0
      ? durationMin < 60
        ? `약 ${durationMin}분`
        : `약 ${Math.round((durationMin / 60) * 10) / 10}시간`
      : "";
  const locationText =
    form.location
      ?.replace(/https?:\/\/[^\s]+/i, "")
      .replace(/·\s*$/, "")
      .trim() || "추후 안내";

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="사용자 화면 미리보기"
      description="실제 화면과 유사하게 재현한 미리보기입니다. 저장해야 사용자에게 반영됩니다."
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* 좌: 정보 */}
          <div className="order-2 space-y-5 p-6 lg:order-1">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={statusOf(GROUP_SEMINAR_STATUSES, form.status)} />
                {capacity != null && (
                  <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    선착순 {capacity}명
                  </span>
                )}
              </div>
              <h2 className="whitespace-pre-line text-2xl font-bold leading-tight tracking-tight text-slate-900">
                {form.title || "제목을 입력하세요"}
              </h2>
              {form.summary && (
                <p className="whitespace-pre-line text-sm text-slate-500">{form.summary}</p>
              )}
            </div>

            {form.benefit?.trim() && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-blue-700">
                  <Gift className="size-4 shrink-0" />
                  참여자 혜택
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {form.benefit}
                </p>
              </div>
            )}
          </div>

          {/* 우: 커버 */}
          <div className="relative order-1 min-h-[200px] lg:order-2 lg:min-h-full">
            {form.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.coverImageUrl}
                alt={form.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 text-slate-300">
                <Presentation className="size-8" strokeWidth={1.6} />
                <span className="text-[12px] font-semibold tracking-wide text-slate-400">
                  SMOAT 단체 세미나
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 정보 타일 + 상세 안내 */}
        <div className="space-y-5 border-t border-slate-100 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Tile icon={Clock} label={`일정${durationLabel ? ` (${durationLabel})` : ""}`}>
              {sessionDates.length > 0 ? (
                <div className="space-y-0.5">
                  {sessionDates.map((d) => (
                    <div key={d} className="text-[13px] font-semibold text-slate-700">
                      {formatDateTime(new Date(d))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[13px] font-semibold text-slate-700">조율 중</div>
              )}
            </Tile>
            <Tile icon={MapPin} label="장소">
              <div className="line-clamp-2 text-[13px] font-semibold text-slate-700">
                {locationText}
              </div>
            </Tile>
            <Tile icon={CalendarClock} label="신청 마감" className="col-span-2 lg:col-span-1">
              <div className="text-[13px] font-semibold text-slate-700">
                {capacity != null ? `선착순 ${capacity}명` : "상시 모집"}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {form.registerCloseDays
                  ? `실행 ${form.registerCloseDays}일 전까지 신청`
                  : "정원이 차면 자동 마감"}
              </div>
            </Tile>
          </div>

          {form.description?.trim() && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-5">
              <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold text-slate-800">
                <BookOpen className="size-4 text-blue-500" />
                세미나 안내
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
                {form.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminDialog>
  );
}

function Tile({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-100 bg-slate-50/60 p-4 ${className ?? ""}`}>
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
        <Icon className="size-4 text-blue-500" />
        <span className="truncate">{label}</span>
      </div>
      {children}
    </div>
  );
}
