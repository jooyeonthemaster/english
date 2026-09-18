import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import { labelOf, SEMINAR_CHANNELS, SEMINAR_STATUSES } from "@/lib/help-center";
import type { AdminSeminarRequestView } from "@/actions/admin-help-center";
import { formatDateTime } from "@/lib/utils";

// 1:1 세미나 신청 목록 행 → 호버 상세. 목록에 이미 실려 온 값만 쓴다(추가 조회 없음).

export function seminarRowDetail(r: AdminSeminarRequestView): AdminDetail {
  return {
    title: `${r.academyName || r.applicantName} · ${r.applicantName}`,
    subtitle: labelOf(SEMINAR_STATUSES, r.status),
    fields: detailFields([
      ["상태", labelOf(SEMINAR_STATUSES, r.status)],
      ["연락처", r.phone],
      ["이메일", r.email],
      ["희망 채널", labelOf(SEMINAR_CHANNELS, r.preferredChannel)],
      ["선호 시간", r.preferredTimes, true],
      ["주제", r.topic, true],
      ["문의 내용", r.message, true],
      ["확정 일정", r.scheduledAt ? formatDateTime(r.scheduledAt) : "미정"],
      ["줌 링크", r.meetingUrl, true],
      ["운영자 메모", r.adminMemo, true],
      ["신청 시각", formatDateTime(r.createdAt)],
    ]),
  };
}
