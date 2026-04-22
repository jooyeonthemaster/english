import { getStudentSession } from "@/lib/auth-student";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

export function getScoreColor(percent: number): string {
  if (percent >= 90) return "emerald";
  if (percent >= 70) return "blue";
  if (percent >= 50) return "amber";
  return "red";
}

export function getLevelGrade(score: number): "S" | "A" | "B" | "C" | "D" {
  if (score >= 90) return "S";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

export function xpForLevel(level: number): number {
  return 100 + (level - 1) * 50; // Level 1: 100XP, Level 2: 150XP, etc.
}

// ---------------------------------------------------------------------------
// Pure sync: parse enrolled class schedule (used by dashboard)
// ---------------------------------------------------------------------------
export function parseClassScheduleSlots(
  schedule: unknown,
): { day: string; startTime: string; endTime: string }[] {
  let scheduleSlots: { day: string; startTime: string; endTime: string }[] = [];
  try {
    const s = typeof schedule === "string"
      ? JSON.parse(schedule)
      : schedule;
    if (Array.isArray(s)) {
      scheduleSlots = s.map((slot: { day?: string; startTime?: string; endTime?: string }) => ({
        day: slot.day ?? "",
        startTime: slot.startTime ?? "",
        endTime: slot.endTime ?? "",
      }));
    }
  } catch {}
  return scheduleSlots;
}
