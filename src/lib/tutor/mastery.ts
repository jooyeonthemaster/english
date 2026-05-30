// ============================================================================
// 반복 숙달 — refKey 기준 숙달도 누적 + SM-2 복습 스케줄 (스펙 §6)
// 같은 출제 포인트(refKey)를 반복 학습할 수 있도록 제출마다 숙달/스케줄을 갱신한다.
// TutorMastery/TutorReviewSchedule에 unique 제약이 없어 findFirst 후 update/create.
// ============================================================================

import type { Prisma } from "@prisma/client";

function parseScope(refKey: string): string {
  const index = refKey.indexOf(":");
  return index > 0 ? refKey.slice(0, index) : "general";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function updateMasteryAndSchedule(
  tx: Prisma.TransactionClient,
  params: {
    academyId: string;
    studentId: string;
    passageId?: string | null;
    programId?: string | null;
    lessonId?: string | null;
    refKey: string;
    isCorrect: boolean;
    now: Date;
  },
): Promise<void> {
  const { academyId, studentId, refKey, isCorrect, now } = params;
  if (!refKey) return;
  const scope = parseScope(refKey);

  const existingMastery = await tx.tutorMastery.findFirst({ where: { academyId, studentId, scope, refKey } });
  const mastery = existingMastery
    ? await tx.tutorMastery.update({
        where: { id: existingMastery.id },
        data: { attempts: { increment: 1 }, correct: { increment: isCorrect ? 1 : 0 }, lastSeenAt: now },
      })
    : await tx.tutorMastery.create({
        data: {
          academyId,
          studentId,
          scope,
          refKey,
          passageId: params.passageId ?? null,
          attempts: 1,
          correct: isCorrect ? 1 : 0,
          lastSeenAt: now,
        },
      });

  const existingSchedule = await tx.tutorReviewSchedule.findFirst({ where: { academyId, studentId, scope, refKey } });
  if (existingSchedule) {
    const ease = Number(existingSchedule.easeFactor);
    let intervalDays = existingSchedule.intervalDays;
    let nextEase = ease;
    let lapses = existingSchedule.lapses;
    if (isCorrect) {
      intervalDays = Math.max(1, Math.round(intervalDays * ease));
      nextEase = Math.min(3.0, ease + 0.1);
    } else {
      intervalDays = 1;
      nextEase = Math.max(1.3, ease - 0.2);
      lapses += 1;
    }
    await tx.tutorReviewSchedule.update({
      where: { id: existingSchedule.id },
      data: {
        intervalDays,
        easeFactor: nextEase,
        lapses,
        dueAt: new Date(now.getTime() + (isCorrect ? intervalDays : 0) * DAY_MS),
        lastReviewedAt: now,
        masteryId: mastery.id,
        status: isCorrect ? "SCHEDULED" : "DUE",
        programId: params.programId ?? existingSchedule.programId,
        lessonId: params.lessonId ?? existingSchedule.lessonId,
      },
    });
  } else {
    await tx.tutorReviewSchedule.create({
      data: {
        academyId,
        studentId,
        scope,
        refKey,
        masteryId: mastery.id,
        intervalDays: 1,
        dueAt: new Date(now.getTime() + (isCorrect ? DAY_MS : 0)),
        status: isCorrect ? "SCHEDULED" : "DUE",
        programId: params.programId ?? null,
        lessonId: params.lessonId ?? null,
      },
    });
  }
}
