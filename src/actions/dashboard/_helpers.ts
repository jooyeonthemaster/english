// ============================================================================
// Internal helpers shared between director / teacher dashboard actions.
// ============================================================================

export function getConsultationTypeLabel(type: string): string {
  switch (type) {
    case "NEW_INQUIRY": return "신규 문의";
    case "STUDENT": return "학생 상담";
    case "PARENT": return "학부모 상담";
    case "LEVEL_TEST": return "레벨 테스트";
    default: return type;
  }
}

const DAY_MAP: Record<number, string> = {
  0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT",
};

export interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
}

export function getTodaySchedule(scheduleJson: string | null): ScheduleSlot | null {
  if (!scheduleJson) return null;
  try {
    const slots: ScheduleSlot[] = JSON.parse(scheduleJson);
    const { getDayOfWeekKST } = require("@/lib/date-utils");
    const todayDay = DAY_MAP[getDayOfWeekKST()];
    return slots.find((s) => s.day === todayDay) || null;
  } catch {
    return null;
  }
}

export function getClassStatus(
  startTime: string,
  endTime: string
): "in-progress" | "upcoming" | "completed" {
  const now = new Date();
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  if (nowMinutes >= startMinutes && nowMinutes < endMinutes) return "in-progress";
  if (nowMinutes >= endMinutes) return "completed";
  return "upcoming";
}
