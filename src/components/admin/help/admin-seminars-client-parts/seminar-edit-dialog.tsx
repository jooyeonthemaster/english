"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, Mail, Phone, Video } from "lucide-react";
import { toast } from "sonner";
import {
  adminUpdateSeminarRequest,
  type AdminSeminarRequestView,
} from "@/actions/admin-help-center";
import { AdminDialog, FilterChipGroup } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SEMINAR_CHANNELS, SEMINAR_STATUSES, labelOf } from "@/lib/help-center";
import { cn, datetimeLocalToIso, isoToDatetimeLocal } from "@/lib/utils";

const STATUS_OPTIONS = SEMINAR_STATUSES.map((s) => ({ key: s.value, label: s.label }));

/**
 * 1:1 세미나 신청 편집 팝업 — 상태·확정 일정·줌 링크·운영자 메모.
 * 신청 한 건마다 새로 마운트되므로(key=id) 폼 상태는 여기서만 갖는다.
 */
export function SeminarEditDialog({
  request,
  onClose,
  onSaved,
}: {
  request: AdminSeminarRequestView;
  onClose: () => void;
  /** 저장 성공 후 — 부모가 목록을 다시 불러오고 팝업을 닫는다 */
  onSaved: () => void;
}) {
  const [editStatus, setEditStatus] = useState(request.status);
  const [scheduledAt, setScheduledAt] = useState(isoToDatetimeLocal(request.scheduledAt));
  const [meetingUrl, setMeetingUrl] = useState(request.meetingUrl ?? "");
  const [memo, setMemo] = useState(request.adminMemo ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        // datetime-local(로컬 벽시계)은 브라우저에서 ISO로 바꿔 보낸다(프로덕션 UTC 9시간 드리프트 방지).
        await adminUpdateSeminarRequest(request.id, {
          status: editStatus || request.status,
          adminMemo: memo,
          scheduledAt: datetimeLocalToIso(scheduledAt),
          meetingUrl: meetingUrl || null,
        });
        toast.success("저장되었습니다.");
        onSaved();
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && !isPending && onClose()}
      size="md"
      title={request.academyName || request.applicantName}
      description={`${request.applicantName} · ${labelOf(SEMINAR_CHANNELS, request.preferredChannel)} 희망`}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            취소
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 신청 정보(읽기 전용) */}
        <div className="space-y-1.5 text-[13px] text-gray-600">
          <div className="flex items-center gap-2">
            <Phone className="size-3.5 text-gray-400" strokeWidth={2} aria-hidden />
            {request.phone}
          </div>
          {request.email && (
            <div className="flex items-center gap-2">
              <Mail className="size-3.5 text-gray-400" strokeWidth={2} aria-hidden />
              {request.email}
            </div>
          )}
          {request.preferredTimes && (
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 size-3.5 text-gray-400" strokeWidth={2} aria-hidden />
              <span>선호 시간: {request.preferredTimes}</span>
            </div>
          )}
          {request.topic && <div className="text-gray-500">주제: {request.topic}</div>}
        </div>

        {request.message && (
          <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-[13px] text-gray-600">
            {request.message}
          </div>
        )}

        <div className="border-t border-gray-100" />

        {/* 편집 */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-gray-500">상태</Label>
          <div className={cn(isPending && "pointer-events-none opacity-60")}>
            <FilterChipGroup
              options={STATUS_OPTIONS}
              value={editStatus}
              onChange={setEditStatus}
              ariaLabel="신청 상태"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seminar-scheduled-at" className="text-[11px] font-semibold text-gray-500">
            확정 일정
          </Label>
          <Input
            id="seminar-scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="text-[13px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seminar-meeting-url" className="text-[11px] font-semibold text-gray-500">
            <Video className="size-3.5 text-gray-400" strokeWidth={2} aria-hidden />
            줌(Zoom) 링크
          </Label>
          <Input
            id="seminar-meeting-url"
            type="url"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="https://zoom.us/j/..."
            className="text-[13px]"
          />
          <p className="text-[11px] text-gray-400">
            입력하면 신청자가 1:1 세미나 신청에서 바로 접속할 수 있습니다.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seminar-memo" className="text-[11px] font-semibold text-gray-500">
            운영자 메모
          </Label>
          <Textarea
            id="seminar-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            placeholder="내부 메모(고객에게 노출되지 않음)"
            className="min-h-20 resize-y text-[13px]"
          />
        </div>
      </div>
    </AdminDialog>
  );
}
