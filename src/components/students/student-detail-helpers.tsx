// @ts-nocheck
import { cn } from "@/lib/utils";
import { ATTENDANCE_STATUSES, INVOICE_STATUSES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Shared label / badge helpers for the student detail screen
// ---------------------------------------------------------------------------

export function getRelationLabel(relation: string | null) {
  switch (relation) {
    case "MOTHER":
      return "어머니";
    case "FATHER":
      return "아버지";
    case "GUARDIAN":
      return "보호자";
    case "OTHER":
      return "기타";
    default:
      return "-";
  }
}

export function getAttendanceBadge(status: string) {
  const found = ATTENDANCE_STATUSES.find((s) => s.value === status);
  if (!found) return <Badge variant="secondary">{status}</Badge>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        found.color
      )}
    >
      {found.label}
    </span>
  );
}

export function getInvoiceBadge(status: string) {
  const found = INVOICE_STATUSES.find((s) => s.value === status);
  if (!found) return <Badge variant="secondary">{status}</Badge>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        found.color
      )}
    >
      {found.label}
    </span>
  );
}

export function getConsultationTypeLabel(type: string) {
  switch (type) {
    case "NEW_INQUIRY":
      return "신규 문의";
    case "STUDENT":
      return "학생 상담";
    case "PARENT":
      return "학부모 상담";
    case "LEVEL_TEST":
      return "레벨테스트";
    default:
      return type;
  }
}
