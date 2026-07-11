"use server";

import { prisma } from "@/lib/prisma";
import { groupSeminarRegistrationSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";
import type { GroupSeminarView } from "@/actions/help-center";

/**
 * 단체 세미나 — 비회원(랜딩) 공개 신청. 로그인 없이 접근 가능.
 * publicEnabled=true 인 세미나만 노출/접수한다. 회원 신청(help-center.ts)과
 * 동일한 정원·마감·보증금 규칙을 적용하되 staffId 없이 isGuest=true로 저장한다.
 */

const DAY = 86_400_000;
const GROUP_SEMINAR_PUBLIC_PATH = "/seminar";

/** publicEnabled 세미나(DRAFT 제외)를 임박순으로 반환. 게스트는 myRegistration 없음. */
export async function getPublicGroupSeminars(): Promise<GroupSeminarView[]> {
  const now = Date.now();
  const seminars = await prisma.groupSeminar.findMany({
    where: { publicEnabled: true, status: { not: "DRAFT" } },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    include: {
      registrations: {
        where: { status: { in: ["REGISTERED", "ATTENDED"] } },
        select: { headCount: true, selectedDate: true },
      },
    },
  });

  return seminars.map((s) => {
    const active = s.registrations;
    const registeredCount = active.reduce((sum, r) => sum + r.headCount, 0);
    const sessionIso = Array.isArray(s.sessionDates) ? (s.sessionDates as string[]) : [];
    const cutoffMs = (s.registerCloseDays ?? 0) * DAY;

    const sessions = sessionIso.map((iso) => {
      const t = new Date(iso).getTime();
      const reg = active
        .filter((r) => r.selectedDate && r.selectedDate.getTime() === t)
        .reduce((sum, r) => sum + r.headCount, 0);
      const closeMs = t - cutoffMs;
      return {
        date: iso,
        registeredCount: reg,
        spotsLeft: s.capacity != null ? Math.max(0, s.capacity - reg) : null,
        closesAt: new Date(closeMs).toISOString(),
        registrationClosed: now >= closeMs,
      };
    });

    const spotsLeft =
      sessionIso.length > 0
        ? s.capacity != null
          ? sessions.reduce((sum, x) => sum + (x.spotsLeft ?? 0), 0)
          : null
        : s.capacity != null
          ? Math.max(0, s.capacity - registeredCount)
          : null;

    const eventTimes = sessionIso.length
      ? sessionIso.map((x) => new Date(x).getTime())
      : s.scheduledAt
        ? [s.scheduledAt.getTime()]
        : [];
    const eventPassed = eventTimes.length > 0 && eventTimes.every((t) => now >= t);

    let registrationOpen = false;
    if (s.status === "OPEN") {
      if (sessionIso.length) {
        registrationOpen = sessions.some(
          (x) => !x.registrationClosed && (x.spotsLeft == null || x.spotsLeft > 0),
        );
      } else {
        const closeMs = (s.scheduledAt?.getTime() ?? Infinity) - cutoffMs;
        registrationOpen = now < closeMs && (spotsLeft == null || spotsLeft > 0);
      }
    }

    return {
      id: s.id,
      title: s.title,
      summary: s.summary,
      description: s.description,
      benefit: s.benefit,
      host: s.host,
      target: s.target,
      location: s.location,
      mapUrl: s.mapUrl,
      meetingUrl: null, // 게스트에게는 접속 링크 미노출
      scheduledAt: s.scheduledAt?.toISOString() ?? null,
      sessionDates: sessionIso,
      sessions,
      durationMin: s.durationMin,
      capacity: s.capacity,
      depositAmount: s.depositAmount,
      registerCloseDays: s.registerCloseDays,
      eventPassed,
      registrationOpen,
      coverImageUrl: s.coverImageUrl,
      status: s.status,
      registeredCount,
      spotsLeft,
      myRegistration: null,
    };
  });
}

export async function registerGuestGroupSeminar(
  seminarId: string,
  input: {
    applicantName: string;
    phone: string;
    email?: string;
    academyName?: string;
    headCount?: number;
    selectedDate?: string | null;
    message?: string;
    depositorName?: string;
    refundBankName?: string;
    refundAccountNumber?: string;
    refundAccountHolder?: string;
  },
) {
  const validated = groupSeminarRegistrationSchema.parse(input);

  const seminar = await prisma.groupSeminar.findUnique({
    where: { id: seminarId },
    select: {
      status: true,
      capacity: true,
      sessionDates: true,
      registerCloseDays: true,
      scheduledAt: true,
      depositAmount: true,
      publicEnabled: true,
    },
  });
  if (!seminar) throw new Error("세미나를 찾을 수 없습니다.");
  if (!seminar.publicEnabled) throw new Error("비공개 세미나입니다.");
  if (seminar.status !== "OPEN") throw new Error("현재 모집 중인 세미나가 아닙니다.");

  // 세션 날짜 선택 검증
  const sessions = Array.isArray(seminar.sessionDates)
    ? (seminar.sessionDates as string[])
    : [];
  let selectedDate: Date | null = null;
  if (sessions.length > 1) {
    if (!validated.selectedDate) throw new Error("참석하실 날짜를 선택해 주세요.");
    const picked = new Date(validated.selectedDate).getTime();
    const match = sessions.find((s) => new Date(s).getTime() === picked);
    if (!match) throw new Error("선택한 날짜가 올바르지 않습니다.");
    selectedDate = new Date(match);
  } else if (sessions.length === 1) {
    selectedDate = new Date(sessions[0]);
  }

  // 신청 마감(실행 N일 전) 검증
  const deadlineBase = selectedDate ?? seminar.scheduledAt ?? null;
  if (deadlineBase) {
    const closeMs = deadlineBase.getTime() - (seminar.registerCloseDays ?? 0) * DAY;
    if (Date.now() >= closeMs) throw new Error("신청 기간이 종료되었습니다.");
  }

  // 동일 연락처 중복 신청 방지(게스트는 계정이 없어 전화번호로 판별)
  const phone = validated.phone.trim();
  const dup = await prisma.groupSeminarRegistration.findFirst({
    where: { seminarId, phone, status: { not: "CANCELED" } },
    select: { id: true },
  });
  if (dup) throw new Error("이미 신청된 연락처입니다.");

  // 정원 검사(선택 날짜 기준 일자별)
  if (seminar.capacity != null) {
    const where: {
      seminarId: string;
      status: { in: string[] };
      selectedDate?: Date;
    } = { seminarId, status: { in: ["REGISTERED", "ATTENDED"] } };
    if (selectedDate) where.selectedDate = selectedDate;
    const agg = await prisma.groupSeminarRegistration.aggregate({
      where,
      _sum: { headCount: true },
    });
    const taken = agg._sum.headCount ?? 0;
    if (taken + validated.headCount > seminar.capacity) {
      throw new Error(
        selectedDate ? "선택한 날짜의 정원이 마감되었습니다." : "정원이 마감되었습니다.",
      );
    }
  }

  // 보증금
  const hasDeposit = (seminar.depositAmount ?? 0) > 0;
  let depositFields: Record<string, unknown> = { depositStatus: "NONE" };
  if (hasDeposit) {
    const depositorName = validated.depositorName?.trim() || validated.applicantName.trim();
    const rb = validated.refundBankName?.trim();
    const ra = validated.refundAccountNumber?.trim();
    const rh = validated.refundAccountHolder?.trim();
    if (!rb || !ra || !rh) {
      throw new Error("환급받을 계좌(은행·계좌번호·예금주)를 입력해 주세요.");
    }
    depositFields = {
      depositStatus: "WAITING",
      depositAmount: seminar.depositAmount,
      depositorName,
      refundBankName: rb,
      refundAccountNumber: ra,
      refundAccountHolder: rh,
    };
  }

  const reg = await prisma.groupSeminarRegistration.create({
    data: {
      seminarId,
      staffId: null,
      academyId: null,
      isGuest: true,
      applicantName: validated.applicantName,
      phone: validated.phone,
      email: validated.email || null,
      academyName: validated.academyName || null,
      headCount: validated.headCount,
      selectedDate,
      message: validated.message || null,
      status: "REGISTERED",
      ...depositFields,
    },
  });

  revalidatePath(GROUP_SEMINAR_PUBLIC_PATH);
  return {
    success: true,
    id: reg.id,
    depositRequired: hasDeposit,
    depositAmount: seminar.depositAmount ?? null,
  };
}
